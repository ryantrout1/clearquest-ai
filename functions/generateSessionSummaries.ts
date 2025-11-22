import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Generate AI Investigator Summaries for interview session (SINGLE LLM CALL)
 * Input: { session_id }
 * Output: { ok: true, data: { interviewSummary, sectionSummaries, redFlags } }
 * 
 * NOTE (MVP):
 * This function is intentionally app-scoped and does not enforce per-user RBAC.
 * Only internal admins (owner + co-founder) can reach this page right now.
 * When we add tenant/investigator logins, revisit this to add proper role checks.
 * 
 * OPTIMIZATION: Uses a single invokeLLM call to generate all summaries at once.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Basic auth check - any logged-in user can run this (MVP)
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ 
        ok: false, 
        error: { message: 'Unauthorized', details: 'User not authenticated' } 
      }, { status: 401 });
    }

    // Handle different request body formats
    const body = typeof req.json === "function" ? await req.json() : req.body;
    const sessionId = body?.sessionId || body?.session_id || body?.interviewId;
    const transcriptEvents = body?.transcriptEvents || [];

    // Scope flags - determine what to regenerate
    const generateGlobal = body?.generateGlobal !== false; // default true
    const generateSections = body?.generateSections !== false; // default true
    const generateQuestions = body?.generateQuestions !== false; // default true
    const sectionId = body?.sectionId || null; // specific section to regenerate

    console.log('[FUNC generateSessionSummaries] start', { 
      sessionId, 
      hasTranscriptEvents: transcriptEvents.length > 0,
      eventCount: transcriptEvents.length,
      bodyKeys: Object.keys(body || {}),
      scope: { generateGlobal, generateSections, generateQuestions, sectionId }
    });

    if (!sessionId) {
      return Response.json({ 
        ok: false,
        error: { message: 'sessionId required' }
      }, { status: 400 });
    }

    console.log(`🤖 [generateSessionSummaries] Starting single-call generation`, {
      sessionId,
      eventCount: transcriptEvents.length
    });

    // Use transcript events passed from client (already built with all context)
    const transcript = transcriptEvents;
    
    console.log('[FUNC generateSessionSummaries] Transcript analysis', {
      totalEvents: transcript.length,
      eventKinds: [...new Set(transcript.map(e => e.kind))],
      sampleEvent: transcript[0],
      yesAnswers: transcript.filter(e => e.answer === 'Yes' || (e.kind === 'base_answer' && e.text === 'Yes')).length,
      followupQuestions: transcript.filter(e => e.kind === 'followup_question').length,
      aiProbes: transcript.filter(e => e.kind === 'ai_probe_question').length
    });

    // Count basic stats from transcript
    const yesCount = transcript.filter(e => e.answer === 'Yes' || e.kind === 'base_answer' && e.text === 'Yes').length;
    const noCount = transcript.filter(e => e.answer === 'No' || e.kind === 'base_answer' && e.text === 'No').length;

    // Build scoped prompt based on what needs to be regenerated
    let llmPrompt;
    let responseSchema;

    if (!generateGlobal && !generateSections && generateQuestions) {
      // BLUE BRAIN: Questions only - Generate instance and question summaries
      console.log('[AI-QUESTIONS-BE] START', {
        sessionId,
        generateGlobal,
        generateSections,
        generateQuestions
      });

      // Discover incidents: find all FollowUpPack instances for this session
      const responses = await base44.asServiceRole.entities.Response.filter({ session_id: sessionId });
      const followUpResponses = await base44.asServiceRole.entities.FollowUpResponse.filter({ session_id: sessionId });
      const packs = await base44.asServiceRole.entities.FollowUpPack.list();
      
      // Build list of incidents (question + pack + instance combinations)
      const incidents = [];
      
      for (const response of responses) {
        if (response.answer !== 'Yes') continue;
        
        // Find follow-up responses for this question
        const questionFollowUps = followUpResponses.filter(f => f.response_id === response.id);
        
        // Group by pack and instance
        const instanceMap = {};
        for (const followUp of questionFollowUps) {
          const key = `${followUp.followup_pack}_${followUp.instance_number || 1}`;
          if (!instanceMap[key]) {
            instanceMap[key] = {
              questionId: response.question_id,
              sectionId: response.section_id || response.category,
              packId: followUp.followup_pack,
              instanceNumber: followUp.instance_number || 1,
              followUpResponses: []
            };
          }
          instanceMap[key].followUpResponses.push(followUp);
        }
        
        // Add each instance to incidents list
        for (const incident of Object.values(instanceMap)) {
          incidents.push(incident);
        }
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
      
      let updatedInstanceSummariesCount = 0;
      const questionSummariesMap = {};
      
      // Generate summary for each incident
      for (const incident of incidents) {
        const pack = packs.find(p => p.followup_pack_id === incident.packId);
        const summaryInstructions = pack?.ai_summary_instructions || null;
        
        console.log('[AI-QUESTIONS-BE] INCIDENT_SUMMARY_LLM_CALL', {
          sessionId,
          questionId: incident.questionId,
          packId: incident.packId,
          instanceNumber: incident.instanceNumber,
          hasSummaryInstructions: !!summaryInstructions
        });
        
        // Build incident transcript for this specific instance
        const incidentTranscript = transcript.filter(e => 
          e.baseQuestionId === incident.questionId &&
          e.packId === incident.packId &&
          e.instanceNumber === incident.instanceNumber
        );
        
        // Build LLM prompt for this incident
        const incidentPrompt = `You are an AI assistant for law enforcement background investigations.
        
Generate a concise investigator summary for this specific incident.

INCIDENT DATA:
Question ID: ${incident.questionId}
Pack: ${incident.packId}
Instance: ${incident.instanceNumber}

${summaryInstructions ? `SUMMARY INSTRUCTIONS:\n${summaryInstructions}\n` : ''}

TRANSCRIPT:
${JSON.stringify(incidentTranscript, null, 2)}

Return a JSON object with:
{
  "summary": "1-2 sentence investigator summary of this incident"
}`;
        
        let instanceSummaryText = null;
        
        try {
          const llmResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt: incidentPrompt,
            response_json_schema: {
              type: "object",
              properties: {
                summary: { type: "string" }
              },
              required: ["summary"]
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
            packId: incident.packId,
            instanceNumber: incident.instanceNumber,
            error: err.message
          });
        }
        
        // Fallback for debugging if LLM fails
        if (!instanceSummaryText) {
          console.warn('[AI-QUESTIONS-BE] No summary from LLM, writing placeholder', {
            sessionId,
            questionId: incident.questionId,
            packId: incident.packId,
            instanceNumber: incident.instanceNumber
          });
          instanceSummaryText = 'TEST PLACEHOLDER SUMMARY - this confirms the write path works.';
        }
        
        // Save to InstanceSummary entity
        try {
          // Check if already exists
          const existing = await base44.asServiceRole.entities.InstanceSummary.filter({
            session_id: sessionId,
            question_id: incident.questionId,
            pack_id: incident.packId,
            instance_number: incident.instanceNumber
          });
          
          let savedInstanceSummary;
          if (existing.length > 0) {
            savedInstanceSummary = await base44.asServiceRole.entities.InstanceSummary.update(existing[0].id, {
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
          
          console.log('[AI-QUESTIONS-BE] INSTANCE_SUMMARY_SAVED', {
            sessionId,
            questionId: incident.questionId,
            packId: incident.packId,
            instanceNumber: incident.instanceNumber,
            summaryId: savedInstanceSummary.id
          });
          
          updatedInstanceSummariesCount++;
          
          // Add to question summaries map for aggregation
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
      
      // Aggregate instance summaries into question summaries
      let updatedQuestionSummariesCount = 0;
      
      for (const [questionId, data] of Object.entries(questionSummariesMap)) {
        const aggregatedSummary = data.instances.length === 1
          ? data.instances[0]
          : data.instances.join(' | ');
        
        try {
          const existing = await base44.asServiceRole.entities.QuestionSummary.filter({
            session_id: sessionId,
            question_id: questionId
          });
          
          let savedQuestionSummary;
          if (existing.length > 0) {
            savedQuestionSummary = await base44.asServiceRole.entities.QuestionSummary.update(existing[0].id, {
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
          
          console.log('[AI-QUESTIONS-BE] QUESTION_SUMMARY_SAVED', {
            sessionId,
            questionId,
            instanceCount: data.instances.length,
            summaryId: savedQuestionSummary.id
          });
          
          updatedQuestionSummariesCount++;
        } catch (err) {
          console.error('[AI-QUESTIONS-BE] QUESTION_SUMMARY_SAVE_ERROR', {
            sessionId,
            questionId,
            error: err.message
          });
        }
      }
      
      console.log('[AI-QUESTIONS-BE] DONE', {
        sessionId,
        updatedInstanceSummariesCount,
        updatedQuestionSummariesCount
      });
      
      return Response.json({
        ok: true,
        success: true,
        updatedInstanceSummariesCount,
        updatedQuestionSummariesCount
      });
    } else if (generateGlobal && !generateSections && !generateQuestions) {
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