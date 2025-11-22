import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Unified AI Summary Generation
 * Generates all 4 layers in a single LLM call:
 * 1. Interview-level summary
 * 2. Section-level summaries
 * 3. Question-level summaries (for Yes + follow-ups)
 * 4. Instance-level narratives (per incident)
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ 
        ok: false, 
        error: { message: 'Unauthorized' } 
      }, { status: 401 });
    }

    const body = typeof req.json === "function" ? await req.json() : req.body;
    const sessionId = body?.sessionId || body?.session_id;
    const generateGlobal = body?.generateGlobal !== false;
    const generateSections = body?.generateSections !== false;
    const generateQuestions = body?.generateQuestions !== false;

    console.log('[AI-UNIFIED] START', { sessionId, generateGlobal, generateSections, generateQuestions });

    if (!sessionId) {
      return Response.json({ ok: false, error: { message: 'sessionId required' } }, { status: 400 });
    }

    // Build rich context from database
    const responses = await base44.asServiceRole.entities.Response.filter({ session_id: sessionId });
    const followUps = await base44.asServiceRole.entities.FollowUpResponse.filter({ session_id: sessionId });
    const questions = await base44.asServiceRole.entities.Question.list();
    const sections = await base44.asServiceRole.entities.Section.list();
    
    // Build structured context
    const context = {
      sessionId,
      sections: [],
      questions: []
    };
    
    // Group responses by section
    const responsesBySection = {};
    for (const response of responses) {
      const question = questions.find(q => q.question_id === response.question_id);
      const sectionId = question?.section_id || response.category || 'Unknown';
      
      if (!responsesBySection[sectionId]) {
        const section = sections.find(s => s.id === sectionId);
        responsesBySection[sectionId] = {
          section_id: sectionId,
          section_name: section?.section_name || sectionId,
          responses: []
        };
      }
      responsesBySection[sectionId].responses.push(response);
    }
    
    context.sections = Object.values(responsesBySection);
    
    // Build question-level details for Yes + follow-ups
    for (const response of responses) {
      if (response.answer !== 'Yes') continue;
      
      const questionFollowUps = followUps.filter(f => f.response_id === response.id);
      if (questionFollowUps.length === 0) continue;
      
      const question = questions.find(q => q.question_id === response.question_id);
      const sectionId = question?.section_id || response.category;
      
      // Group by instance
      const instancesMap = {};
      for (const fu of questionFollowUps) {
        const instNum = fu.instance_number || 1;
        const key = `${fu.followup_pack}_${instNum}`;
        
        if (!instancesMap[key]) {
          instancesMap[key] = {
            instance_number: instNum,
            pack_id: fu.followup_pack,
            details: fu.additional_details || {}
          };
        }
      }
      
      context.questions.push({
        question_id: response.question_id,
        section_id: sectionId,
        question_text: response.question_text,
        instances: Object.values(instancesMap)
      });
    }

    // Build unified prompt for all layers
    const llmPrompt = `You are an AI assistant for law enforcement background investigations.

Generate a comprehensive structured summary covering:
1. Interview-level overview
2. Section-level summaries
3. Question-level summaries (for Yes + follow-ups)
4. Instance-level narratives

CONTEXT:
${JSON.stringify(context, null, 2)}

Return STRICT JSON:
{
  "interview_summary": "2-3 sentence overview",
  "sections": [
    {
      "section_id": "section ID",
      "summary": "2-3 sentence section summary"
    }
  ],
  "questions": [
    {
      "question_id": "question ID",
      "summary": "1-2 sentence question summary",
      "instances": [
        {
          "instance_number": 1,
          "pack_id": "PACK_ID",
          "summary": "1-2 sentence incident narrative"
        }
      ]
    }
  ]
}`;

    const responseSchema = {
      type: "object",
      properties: {
        interview_summary: { type: "string" },
        sections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              section_id: { type: "string" },
              summary: { type: "string" }
            }
          }
        },
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              question_id: { type: "string" },
              summary: { type: "string" },
              instances: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    instance_number: { type: "number" },
                    pack_id: { type: "string" },
                    summary: { type: "string" }
                  }
                }
              }
            }
          }
        }
      }
    };

    // Call LLM once
    const llmResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: llmPrompt,
      response_json_schema: responseSchema
    });

    // Parse results
    const interviewSummary = llmResult.interview_summary || '';
    const sectionSummaries = llmResult.sections || [];
    const questionSummaries = llmResult.questions || [];

    let updatedGlobalSummary = false;
    let updatedSectionSummariesCount = 0;
    let updatedQuestionSummariesCount = 0;
    let updatedInstanceSummariesCount = 0;

    // Write interview summary
    if (generateGlobal && interviewSummary) {
      await base44.asServiceRole.entities.InterviewSession.update(sessionId, {
        global_ai_summary: { text: interviewSummary, riskLevel: "Low" },
        ai_summaries_last_generated_at: new Date().toISOString()
      });
      updatedGlobalSummary = true;
    }

    // Write section summaries
    if (generateSections) {
      for (const section of sectionSummaries) {
        try {
          const existing = await base44.asServiceRole.entities.SectionSummary.filter({
            session_id: sessionId,
            section_id: section.section_id
          });

          if (existing.length > 0) {
            await base44.asServiceRole.entities.SectionSummary.update(existing[0].id, {
              section_summary_text: section.summary,
              generated_at: new Date().toISOString()
            });
          } else {
            await base44.asServiceRole.entities.SectionSummary.create({
              session_id: sessionId,
              section_id: section.section_id,
              section_summary_text: section.summary,
              generated_at: new Date().toISOString()
            });
          }
          updatedSectionSummariesCount++;
        } catch (err) {
          console.error('[AI-UNIFIED] Section save error:', err.message);
        }
      }
    }

    // Write question and instance summaries
    if (generateQuestions) {
      for (const question of questionSummaries) {
        try {
          // Save question summary
          const existingQ = await base44.asServiceRole.entities.QuestionSummary.filter({
            session_id: sessionId,
            question_id: question.question_id
          });

          const questionData = context.questions.find(q => q.question_id === question.question_id);
          const sectionId = questionData?.section_id || null;

          if (existingQ.length > 0) {
            await base44.asServiceRole.entities.QuestionSummary.update(existingQ[0].id, {
              question_summary_text: question.summary,
              generated_at: new Date().toISOString()
            });
          } else {
            await base44.asServiceRole.entities.QuestionSummary.create({
              session_id: sessionId,
              section_id: sectionId,
              question_id: question.question_id,
              question_summary_text: question.summary,
              generated_at: new Date().toISOString()
            });
          }
          updatedQuestionSummariesCount++;

          // Save instance summaries
          for (const instance of (question.instances || [])) {
            const existingI = await base44.asServiceRole.entities.InstanceSummary.filter({
              session_id: sessionId,
              question_id: question.question_id,
              pack_id: instance.pack_id,
              instance_number: instance.instance_number
            });

            if (existingI.length > 0) {
              await base44.asServiceRole.entities.InstanceSummary.update(existingI[0].id, {
                instance_summary_text: instance.summary,
                generated_at: new Date().toISOString()
              });
            } else {
              await base44.asServiceRole.entities.InstanceSummary.create({
                session_id: sessionId,
                section_id: sectionId,
                question_id: question.question_id,
                pack_id: instance.pack_id,
                instance_number: instance.instance_number,
                instance_summary_text: instance.summary,
                generated_at: new Date().toISOString()
              });
            }
            updatedInstanceSummariesCount++;
          }
        } catch (err) {
          console.error('[AI-UNIFIED] Question/instance save error:', err.message);
        }
      }
    }

    console.log('[AI-UNIFIED] DONE', {
      sessionId,
      updatedGlobalSummary,
      updatedSectionSummariesCount,
      updatedQuestionSummariesCount,
      updatedInstanceSummariesCount
    });

    return Response.json({
      ok: true,
      success: true,
      updatedCount: updatedSectionSummariesCount + updatedQuestionSummariesCount + updatedInstanceSummariesCount,
      updatedGlobalSummary,
      updatedSectionSummariesCount,
      updatedQuestionSummariesCount,
      updatedInstanceSummariesCount
    });

  } catch (error) {
    console.error('[AI-UNIFIED] ERROR:', error.message);
    return Response.json({
      ok: false,
      error: { message: error.message }
    }, { status: 500 });
  }
});