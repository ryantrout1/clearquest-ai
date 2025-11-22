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
      // PINK BRAIN: Global only
      llmPrompt = `You are an AI assistant for law enforcement background investigations. Generate a global interview summary.

      TRANSCRIPT DATA:
      ${JSON.stringify({ sessionId, totalQuestions: transcript.length, yesCount, noCount, transcript }, null, 2)}

      Return STRICT JSON with this structure:
      {
        "interviewSummary": {
          "riskLevel": "Low" | "Moderate" | "High",
          "text": "2-3 sentence overview of the entire interview",
          "patterns": ["pattern 1", "pattern 2"],
          "keyObservations": ["observation 1", "observation 2", "observation 3"],
          "suggestedVerification": ["verification step 1", "verification step 2"]
        }
      }`;

      responseSchema = {
        type: "object",
        properties: {
          interviewSummary: {
            type: "object",
            properties: {
              riskLevel: { type: "string", enum: ["Low", "Moderate", "High"] },
              text: { type: "string" },
              patterns: { type: "array", items: { type: "string" } },
              keyObservations: { type: "array", items: { type: "string" } },
              suggestedVerification: { type: "array", items: { type: "string" } }
            },
            required: ["riskLevel", "text", "keyObservations"]
          }
        },
        required: ["interviewSummary"]
      };
    } else if (!generateGlobal && generateSections && !generateQuestions) {
      // PURPLE BRAIN: Sections only (or specific section)
      let sectionFilter = sectionId ? `for section "${sectionId}"` : 'for all sections';
      llmPrompt = `You are an AI assistant for law enforcement background investigations. Generate section-level summaries ${sectionFilter}.

      TRANSCRIPT DATA:
      ${JSON.stringify({ sessionId, transcript }, null, 2)}

      Return STRICT JSON with this structure:
      {
        "sectionSummaries": [
          {
            "sectionName": "section name from transcript",
            "riskLevel": "Low" | "Moderate" | "High",
            "text": "2-3 sentence summary for this section",
            "concerns": ["concern 1"] or []
          }
        ]
      }`;

      responseSchema = {
        type: "object",
        properties: {
          sectionSummaries: {
            type: "array",
            items: {
              type: "object",
              properties: {
                sectionName: { type: "string" },
                riskLevel: { type: "string", enum: ["Low", "Moderate", "High"] },
                text: { type: "string" },
                concerns: { type: "array", items: { type: "string" } }
              },
              required: ["sectionName", "riskLevel", "text"]
            }
          }
        },
        required: ["sectionSummaries"]
      };
    } else {
      // FULL REGENERATION (all scopes)
      llmPrompt = `You are an AI assistant for law enforcement background investigations. You will receive a structured transcript of a completed applicant interview. Generate a comprehensive JSON summary.

      TRANSCRIPT DATA:
      ${JSON.stringify({ 
        sessionId: sessionId,
        totalQuestions: transcript.length,
        yesCount: yesCount,
        noCount: noCount,
        transcript: transcript
      }, null, 2)}

      Return STRICT JSON with this exact structure (no extra text):
      {
        "interviewSummary": {
          "riskLevel": "Low" | "Moderate" | "High",
          "text": "2-3 sentence overview of the entire interview",
          "patterns": ["pattern 1", "pattern 2"],
          "keyObservations": ["observation 1", "observation 2", "observation 3"],
          "suggestedVerification": ["verification step 1", "verification step 2"]
        },
        "sectionSummaries": [
          {
            "sectionName": "section name from transcript",
            "riskLevel": "Low" | "Moderate" | "High",
            "text": "2-3 sentence summary for this section",
            "concerns": ["concern 1"] or []
          }
        ],
        "questionSummaries": [
          {
            "questionId": "question ID from transcript",
            "summary": "1-2 sentence investigator summary (only for Yes answers with follow-ups/probing)"
          }
        ],
        "redFlags": [
          {
            "sectionName": "section name",
            "questionId": "question ID or null",
            "severity": "Low" | "Moderate" | "High",
            "description": "brief description"
          }
        ]
      }

      RULES:
      - Include questionSummaries for EVERY "Yes" answer that has follow-up details, AI probing, or additional context
      - Look for these event kinds in transcript: 'followup_question', 'followup_answer', 'ai_probe_question', 'ai_probe_answer'
      - Each questionSummary should be 1-2 sentences summarizing what was disclosed for that specific question
      - If interview is mostly "No" answers, still provide thoughtful analysis
      - Base risk levels on actual disclosures, not just counts
      - Be factual and professional, no recommendations
      - IMPORTANT: Generate questionSummaries for ALL questions that received "Yes" answers and have any follow-up activity`;

      responseSchema = {
        type: "object",
        properties: {
          interviewSummary: {
            type: "object",
            properties: {
              riskLevel: { type: "string", enum: ["Low", "Moderate", "High"] },
              text: { type: "string" },
              patterns: { type: "array", items: { type: "string" } },
              keyObservations: { type: "array", items: { type: "string" } },
              suggestedVerification: { type: "array", items: { type: "string" } }
            },
            required: ["riskLevel", "text", "keyObservations"]
          },
          sectionSummaries: {
            type: "array",
            items: {
              type: "object",
              properties: {
                sectionName: { type: "string" },
                riskLevel: { type: "string", enum: ["Low", "Moderate", "High"] },
                text: { type: "string" },
                concerns: { type: "array", items: { type: "string" } }
              },
              required: ["sectionName", "riskLevel", "text"]
            }
          },
          questionSummaries: {
            type: "array",
            items: {
              type: "object",
              properties: {
                questionId: { type: "string" },
                summary: { type: "string" }
              },
              required: ["questionId", "summary"]
            }
          },
          redFlags: {
            type: "array",
            items: {
              type: "object",
              properties: {
                sectionName: { type: "string" },
                questionId: { type: "string" },
                severity: { type: "string", enum: ["Low", "Moderate", "High"] },
                description: { type: "string" }
              }
            }
          }
        },
        required: ["interviewSummary", "sectionSummaries"]
      };
    }

    // Single LLM call with structured JSON output
    let llmResult;
    try {
      console.log('[FUNC] Calling LLM with scope:', { generateGlobal, generateSections, generateQuestions, sectionId });
      console.log('[FUNC] Transcript sample being sent to LLM:', JSON.stringify(transcript.slice(0, 3), null, 2));

      llmResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: llmPrompt,
        response_json_schema: responseSchema
      });

      console.log('[FUNC] LLM raw result:', JSON.stringify(llmResult, null, 2));
    } catch (err) {
      console.error('❌ LLM invocation failed:', {
        error: err.message || String(err),
        stack: err.stack,
        sessionId: session_id
      });
      throw new Error(`LLM call failed: ${err.message || String(err)}`);
    }

    // Parse results
    const interviewSummary = llmResult.interviewSummary || {};
    const sectionSummaries = llmResult.sectionSummaries || [];
    const questionSummaries = llmResult.questionSummaries || [];
    const redFlags = llmResult.redFlags || [];

    console.log('[FUNC generateSessionSummaries] LLM returned data', {
      sessionId,
      hasInterviewSummary: !!interviewSummary.text,
      sectionSummariesCount: sectionSummaries.length,
      sectionNames: sectionSummaries.map(s => s.sectionName),
      questionSummariesCount: questionSummaries.length,
      questionIds: questionSummaries.map(q => q.questionId),
      questionSummariesFull: questionSummaries,
      redFlagsCount: redFlags.length,
      rawLLMResult: llmResult
    });

    console.log(`✅ LLM returned: ${sectionSummaries.length} section summaries, ${questionSummaries.length} question summaries, ${redFlags.length} red flags`);

    // Update individual question summaries in Response entities
    let updatedQuestionCount = 0;
    if (generateQuestions && questionSummaries.length > 0) {
      console.log('[FUNC generateSessionSummaries] Processing question summaries', {
        questionSummariesFromLLM: questionSummaries.length,
        questionIds: questionSummaries.map(q => q.questionId),
        fullSummaries: questionSummaries
      });

      const responses = await base44.asServiceRole.entities.Response.filter({ session_id: sessionId });
      console.log('[FUNC generateSessionSummaries] Found responses to update', {
        totalResponses: responses.length,
        yesResponses: responses.filter(r => r.answer === 'Yes').length,
        sampleResponseQuestionIds: responses.slice(0, 3).map(r => r.question_id),
        allResponseQuestionIds: responses.map(r => r.question_id)
      });

      for (const qSummary of questionSummaries) {
        console.log('[FUNC generateSessionSummaries] Looking up response', {
          llmQuestionId: qSummary.questionId,
          summaryPreview: qSummary.summary?.substring(0, 50),
          summaryFull: qSummary.summary
        });

        const response = responses.find(r => r.question_id === qSummary.questionId);
        if (response) {
          try {
            await base44.asServiceRole.entities.Response.update(response.id, {
              investigator_summary: qSummary.summary,
              investigator_summary_last_generated_at: new Date().toISOString()
            });
            console.log(`[FUNC generateSessionSummaries] ✓ Updated response ${response.id} (question_id: ${qSummary.questionId}) with summary`);
            updatedQuestionCount++;
          } catch (err) {
            console.error(`Failed to update response ${response.id}:`, err.message);
          }
        } else {
          console.warn(`[FUNC generateSessionSummaries] ✗ No response found for questionId: ${qSummary.questionId}`, {
            availableQuestionIds: responses.map(r => r.question_id),
            searchingFor: qSummary.questionId
          });
        }
      }
      } else if (generateQuestions && questionSummaries.length === 0) {
      console.warn('[FUNC generateSessionSummaries] ⚠️ LLM returned ZERO question summaries', {
        transcriptLength: transcript.length,
        transcriptSample: transcript.slice(0, 5),
        llmResultKeys: Object.keys(llmResult || {})
      });
      }
    }

    // Convert section summaries array to object keyed by section name
    const sectionSummariesObj = {};
    if (generateSections) {
      sectionSummaries.forEach(section => {
        // If targeting specific section, only update that one
        if (!sectionId || section.sectionName === sectionId) {
          sectionSummariesObj[section.sectionName] = {
            text: section.text,
            riskLevel: section.riskLevel,
            concerns: section.concerns || []
          };
        }
      });
    }

    // Build update object based on what was generated
    const sessionUpdate = {
      ai_summaries_last_generated_at: new Date().toISOString()
    };

    if (generateGlobal && interviewSummary) {
      sessionUpdate.global_ai_summary = interviewSummary;
    }

    if (generateSections && Object.keys(sectionSummariesObj).length > 0) {
      // If updating specific section, merge with existing summaries
      if (sectionId) {
        const currentSession = await base44.asServiceRole.entities.InterviewSession.get(sessionId);
        sessionUpdate.section_ai_summaries = {
          ...(currentSession.section_ai_summaries || {}),
          ...sectionSummariesObj
        };
      } else {
        sessionUpdate.section_ai_summaries = sectionSummariesObj;
      }
    }

    await base44.asServiceRole.entities.InterviewSession.update(sessionId, sessionUpdate);

    console.log('[FUNC generateSessionSummaries] wrote', {
      sessionId,
      questionSummaries: updatedQuestionCount,
      sectionSummaries: Object.keys(sectionSummariesObj).length,
      sectionSummaryKeys: Object.keys(sectionSummariesObj),
      questionSummaryCount: updatedQuestionCount
      globalSummary: interviewSummary ? 1 : 0,
      redFlags: redFlags.length
    });

    console.log(`✅ Saved summaries to session ${sessionId}`, {
      global_ai_summary: !!interviewSummary.text,
      section_ai_summaries: Object.keys(sectionSummariesObj),
      updated_responses: updatedQuestionCount
    });

    return Response.json({
      ok: true,
      success: true,
      data: {
        sessionId: sessionId,
        interviewSummary,
        sectionSummaries: sectionSummariesObj,
        redFlags
      },
      updatedCount: updatedQuestionCount,
      globalSummaryGenerated: !!interviewSummary.text,
      sectionSummariesGenerated: Object.keys(sectionSummariesObj).length,
      sectionSummaryKeys: Object.keys(sectionSummariesObj)
    });

  } catch (error) {
    console.error('❌ Error in generateSessionSummaries:', {
      message: error.message || String(error),
      stack: error.stack,
      name: error.name,
      code: error.code
    });
    
    return Response.json({
      ok: false,
      error: {
        message: "Failed to generate summaries",
        details: error.message || String(error)
      }
    }, { status: 500 });
  }
});