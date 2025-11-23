import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Unified AI Summary Generation
 * Generates all 4 layers: interview, sections, questions, instances
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ ok: false, error: { message: 'Unauthorized' } }, { status: 401 });
    }

    const body = typeof req.json === "function" ? await req.json() : req.body;
    const sessionId = body?.sessionId || body?.session_id;
    const generateGlobal = body?.generateGlobal !== false;
    const generateSections = body?.generateSections !== false;
    const generateQuestions = body?.generateQuestions !== false;

    console.log('[AI-GENERATE] START', { sessionId, generateGlobal, generateSections, generateQuestions });

    if (!sessionId) {
      return Response.json({ ok: false, error: { message: 'sessionId required' } }, { status: 400 });
    }

    let updatedGlobal = false;
    let updatedSectionCount = 0;
    let updatedQuestionCount = 0;
    let updatedInstanceCount = 0;

    // Fetch all data
    const responses = await base44.asServiceRole.entities.Response.filter({ session_id: sessionId });
    const followUps = await base44.asServiceRole.entities.FollowUpResponse.filter({ session_id: sessionId });
    const questions = await base44.asServiceRole.entities.Question.list();
    const sections = await base44.asServiceRole.entities.Section.list();
    const packs = await base44.asServiceRole.entities.FollowUpPack.list();

    // Build context for LLM
    const yesCount = responses.filter(r => r.answer === 'Yes').length;
    const noCount = responses.filter(r => r.answer === 'No').length;

    // GLOBAL SUMMARY
    if (generateGlobal) {
      const globalPrompt = `You are an AI assistant for law enforcement background investigations.

INTERVIEW DATA:
- Total questions: ${responses.length}
- Yes answers: ${yesCount}
- No answers: ${noCount}
- Follow-ups: ${followUps.length}

RESPONSES:
${JSON.stringify(responses.map(r => ({
  question: r.question_text,
  answer: r.answer
})), null, 2)}

Generate a brief interview-level summary (2-3 sentences).`;

      try {
        const globalResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: globalPrompt,
          response_json_schema: {
            type: "object",
            properties: {
              summary: { type: "string" }
            }
          }
        });

        await base44.asServiceRole.entities.InterviewSession.update(sessionId, {
          global_ai_summary: { 
            text: globalResult.summary || 'Summary generated',
            riskLevel: yesCount > 10 ? 'High' : yesCount > 5 ? 'Moderate' : 'Low',
            keyObservations: [],
            patterns: []
          },
          ai_summaries_last_generated_at: new Date().toISOString()
        });

        updatedGlobal = true;
        console.log('[AI-GLOBAL-BE] SUMMARY_SAVED', { sessionId });
      } catch (err) {
        console.error('[AI-GLOBAL-BE] ERROR', { error: err.message });
      }
    }

    // SECTION SUMMARIES
    if (generateSections) {
      const sectionGroups = {};
      
      for (const response of responses) {
        const question = questions.find(q => q.question_id === response.question_id);
        const sectionId = question?.section_id || response.category || 'Unknown';
        
        if (!sectionGroups[sectionId]) {
          const section = sections.find(s => s.id === sectionId);
          sectionGroups[sectionId] = {
            section_id: sectionId,
            section_name: section?.section_name || sectionId,
            responses: []
          };
        }
        sectionGroups[sectionId].responses.push(response);
      }

      for (const [sectionId, sectionData] of Object.entries(sectionGroups)) {
        if (sectionData.responses.length === 0) continue;

        const sectionPrompt = `Summarize this section in 2-3 sentences:

SECTION: ${sectionData.section_name}
RESPONSES:
${JSON.stringify(sectionData.responses.map(r => ({
  question: r.question_text,
  answer: r.answer
})), null, 2)}`;

        try {
          const sectionResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt: sectionPrompt,
            response_json_schema: {
              type: "object",
              properties: { summary: { type: "string" } }
            }
          });

          const existing = await base44.asServiceRole.entities.SectionSummary.filter({
            session_id: sessionId,
            section_id: sectionId
          });

          if (existing.length > 0) {
            await base44.asServiceRole.entities.SectionSummary.update(existing[0].id, {
              section_summary_text: sectionResult.summary,
              generated_at: new Date().toISOString()
            });
          } else {
            await base44.asServiceRole.entities.SectionSummary.create({
              session_id: sessionId,
              section_id: sectionId,
              section_summary_text: sectionResult.summary,
              generated_at: new Date().toISOString()
            });
          }

          updatedSectionCount++;
          console.log('[AI-SUMMARY] SECTION_SUMMARY_SAVED', {
            sessionId,
            sectionId,
            questionCount: sectionData.responses.length,
            summaryId: existing.length > 0 ? existing[0].id : 'new'
          });
        } catch (err) {
          console.error('[AI-SECTIONS-BE] ERROR', { sectionId, error: err.message });
        }
      }
    }

    // QUESTION & INSTANCE SUMMARIES
    if (generateQuestions) {
      console.log('[AI-QUESTIONS-BE] START', { sessionId });

      const incidents = [];
      
      for (const response of responses) {
        if (response.answer !== 'Yes') continue;
        
        const questionFollowUps = followUps.filter(f => f.response_id === response.id);
        if (questionFollowUps.length === 0) continue;

        const question = questions.find(q => q.question_id === response.question_id);
        const sectionId = question?.section_id || response.category;
        
        const instanceMap = {};
        for (const fu of questionFollowUps) {
          const instNum = fu.instance_number || 1;
          const key = `${fu.followup_pack}_${instNum}`;
          
          if (!instanceMap[key]) {
            instanceMap[key] = {
              questionId: response.question_id,
              sectionId,
              packId: fu.followup_pack,
              instanceNumber: instNum,
              details: fu.additional_details || {}
            };
          }
        }
        
        incidents.push(...Object.values(instanceMap));
      }

      console.log('[AI-QUESTIONS-BE] INCIDENTS_FOUND', {
        sessionId,
        totalIncidents: incidents.length,
        sampleIncidents: incidents.slice(0, 3).map(i => ({
          questionId: i.questionId,
          packId: i.packId,
          instanceNumber: i.instanceNumber
        }))
      });

      const questionSummariesMap = {};

      for (const incident of incidents) {
        const pack = packs.find(p => p.followup_pack_id === incident.packId);
        const summaryInstructions = pack?.ai_summary_instructions || '';
        
        if (!summaryInstructions) {
          console.warn('[AI-SUMMARY] No ai_summary_instructions for pack', { packId: incident.packId });
        }

        console.log('[AI-SUMMARY] INCIDENT_SUMMARY_LLM_CALL', {
          sessionId,
          questionId: incident.questionId,
          packId: incident.packId,
          instanceNumber: incident.instanceNumber,
          hasSummaryInstructions: !!summaryInstructions
        });

        const packName = pack?.pack_name || incident.packId;
        
        // Format details as natural text instead of JSON
        const detailsText = Object.entries(incident.details)
          .filter(([key, value]) => value && key !== 'investigator_probing' && key !== 'question_text_snapshot')
          .map(([key, value]) => {
            const label = key.replace(/_/g, ' ');
            return `${label}: ${value}`;
          })
          .join('\n');
        
        const incidentPrompt = `You are writing an investigator summary. Write ONLY in complete sentences using the actual facts provided. Do NOT use brackets, placeholders, variable names, or field labels in your output.

${summaryInstructions ? `INSTRUCTIONS: ${summaryInstructions}\n` : ''}

INCIDENT INFORMATION:
${detailsText}

Write a 1-2 sentence summary stating the facts naturally (e.g., "In May 2010, the individual applied to Scottsdale Police Department..." NOT "In [insert date], individual applied to [agency]...").`;


        let instanceSummaryText = null;

        try {
          const llmResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt: incidentPrompt,
            response_json_schema: {
              type: "object",
              properties: { summary: { type: "string" } }
            }
          });

          console.log('[AI-QUESTIONS-BE] INCIDENT_SUMMARY_LLM_RAW', {
            sessionId,
            questionId: incident.questionId,
            packId: incident.packId,
            instanceNumber: incident.instanceNumber,
            rawOutputPreview: JSON.stringify(llmResult).slice(0, 200)
          });

          instanceSummaryText = llmResult.summary || null;

          console.log('[AI-QUESTIONS-BE] INCIDENT_SUMMARY_PARSED', {
            sessionId,
            questionId: incident.questionId,
            packId: incident.packId,
            instanceNumber: incident.instanceNumber,
            hasSummaryText: !!instanceSummaryText,
            summaryLength: instanceSummaryText ? instanceSummaryText.length : 0
          });
        } catch (err) {
          console.error('[AI-QUESTIONS-BE] INCIDENT_SUMMARY_LLM_ERROR', {
            sessionId,
            questionId: incident.questionId,
            error: err.message
          });
        }

        if (!instanceSummaryText) {
          console.warn('[AI-QUESTIONS-BE] No summary from LLM, using placeholder', {
            sessionId,
            questionId: incident.questionId,
            packId: incident.packId,
            instanceNumber: incident.instanceNumber
          });
          instanceSummaryText = 'Incident disclosed - summary generation pending.';
        }

        // Save InstanceSummary
        try {
          const existingInst = await base44.asServiceRole.entities.InstanceSummary.filter({
            session_id: sessionId,
            question_id: incident.questionId,
            pack_id: incident.packId,
            instance_number: incident.instanceNumber
          });

          let savedInstanceSummary;
          if (existingInst.length > 0) {
            savedInstanceSummary = await base44.asServiceRole.entities.InstanceSummary.update(existingInst[0].id, {
              instance_summary_text: instanceSummaryText,
              generated_at: new Date().toISOString()
            });
          } else {
            savedInstanceSummary = await base44.asServiceRole.entities.InstanceSummary.create({
              session_id: sessionId,
              section_id: incident.sectionId,
              question_id: incident.questionId,
              pack_id: incident.packId,
              instance_number: incident.instanceNumber,
              instance_summary_text: instanceSummaryText,
              generated_at: new Date().toISOString()
            });
          }

          console.log('[AI-SUMMARY] INSTANCE_SUMMARY_SAVED', {
            sessionId,
            questionId: incident.questionId,
            packId: incident.packId,
            instanceNumber: incident.instanceNumber,
            summaryId: savedInstanceSummary.id
          });

          updatedInstanceCount++;

          // Collect for question rollup
          if (!questionSummariesMap[incident.questionId]) {
            questionSummariesMap[incident.questionId] = {
              sectionId: incident.sectionId,
              instances: []
            };
          }
          questionSummariesMap[incident.questionId].instances.push(instanceSummaryText);

        } catch (err) {
          console.error('[AI-QUESTIONS-BE] INSTANCE_SUMMARY_SAVE_ERROR', {
            sessionId,
            questionId: incident.questionId,
            error: err.message
          });
        }
      }

      // Aggregate into QuestionSummary
      for (const [questionId, data] of Object.entries(questionSummariesMap)) {
        const aggregatedSummary = data.instances.length === 1
          ? data.instances[0]
          : data.instances.join(' | ');

        try {
          const existingQ = await base44.asServiceRole.entities.QuestionSummary.filter({
            session_id: sessionId,
            question_id: questionId
          });

          let savedQuestionSummary;
          if (existingQ.length > 0) {
            savedQuestionSummary = await base44.asServiceRole.entities.QuestionSummary.update(existingQ[0].id, {
              question_summary_text: aggregatedSummary,
              generated_at: new Date().toISOString()
            });
          } else {
            savedQuestionSummary = await base44.asServiceRole.entities.QuestionSummary.create({
              session_id: sessionId,
              section_id: data.sectionId,
              question_id: questionId,
              question_summary_text: aggregatedSummary,
              generated_at: new Date().toISOString()
            });
          }

          console.log('[AI-SUMMARY] QUESTION_SUMMARY_SAVED', {
            sessionId,
            questionId,
            instanceCount: data.instances.length,
            summaryId: savedQuestionSummary.id
          });

          updatedQuestionCount++;
        } catch (err) {
          console.error('[AI-QUESTIONS-BE] QUESTION_SUMMARY_SAVE_ERROR', {
            sessionId,
            questionId,
            error: err.message
          });
        }
      }

      console.log('[AI-SUMMARY] DONE', {
        sessionId,
        updatedInstanceCount,
        updatedQuestionCount
      });
    }

    console.log('[AI-GENERATE] DONE', {
      sessionId,
      updatedGlobal,
      updatedSectionCount,
      updatedQuestionCount,
      updatedInstanceCount
    });

    return Response.json({
      success: true,
      updatedGlobal,
      updatedSectionCount,
      updatedQuestionCount,
      updatedInstanceCount
    });

  } catch (error) {
    console.error('[AI-GENERATE] ERROR:', error.message);
    return Response.json({
      ok: false,
      error: { message: error.message }
    }, { status: 500 });
  }
});