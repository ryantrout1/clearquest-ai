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

    const { session_id } = await req.json();

    if (!session_id) {
      return Response.json({ 
        ok: false,
        error: { message: 'session_id required' }
      }, { status: 400 });
    }

    console.log(`🤖 [generateSessionSummaries] Starting single-call generation for session: ${session_id}`);

    // Fetch all data for this session
    const [responses, allFollowups, questions, sections] = await Promise.all([
      base44.asServiceRole.entities.Response.filter({ session_id: session_id }),
      base44.asServiceRole.entities.FollowUpResponse.filter({ session_id: session_id }),
      base44.asServiceRole.entities.Question.filter({ active: true }),
      base44.asServiceRole.entities.Section.list()
    ]);

    console.log(`📊 Fetched data: ${responses.length} responses, ${allFollowups.length} followups`);

    // Build structured transcript for LLM
    const transcript = [];
    
    responses.forEach(response => {
      const question = questions.find(q => q.id === response.question_id);
      const section = sections.find(s => s.id === question?.section_id);
      
      const entry = {
        questionId: response.question_id,
        questionText: response.question_text,
        sectionName: section?.section_name || response.category || 'Other',
        answer: response.answer
      };

      // Add follow-up details if Yes answer
      if (response.answer === 'Yes') {
        const relatedFollowups = allFollowups.filter(f => f.response_id === response.id);
        
        if (relatedFollowups.length > 0) {
          entry.followUps = relatedFollowups.map(fu => ({
            packId: fu.followup_pack,
            instanceNumber: fu.instance_number || 1,
            substanceName: fu.substance_name,
            details: fu.additional_details || {},
            probingExchanges: fu.additional_details?.investigator_probing || []
          }));
        }

        // Legacy probing on Response entity
        if (response.investigator_probing?.length > 0) {
          entry.probingExchanges = response.investigator_probing;
        }
      }

      transcript.push(entry);
    });

    // Build comprehensive prompt for single LLM call
    const llmPrompt = `You are an AI assistant for law enforcement background investigations. You will receive a structured transcript of a completed applicant interview. Generate a comprehensive JSON summary.

TRANSCRIPT DATA:
${JSON.stringify({ 
  sessionId: session_id,
  totalQuestions: responses.length,
  yesCount: responses.filter(r => r.answer === 'Yes').length,
  noCount: responses.filter(r => r.answer === 'No').length,
  followUpsTriggered: allFollowups.length,
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
- Include questionSummaries ONLY for "Yes" answers that have follow-up details or AI probing
- If interview is mostly "No" answers, still provide thoughtful analysis
- Base risk levels on actual disclosures, not just counts
- Be factual and professional, no recommendations`;

    // Single LLM call with structured JSON output
    let llmResult;
    try {
      llmResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: llmPrompt,
        response_json_schema: {
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
        }
      });
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

    console.log(`✅ LLM returned: ${sectionSummaries.length} section summaries, ${questionSummaries.length} question summaries, ${redFlags.length} red flags`);

    // Update individual question summaries in Response entities
    let updatedQuestionCount = 0;
    for (const qSummary of questionSummaries) {
      const response = responses.find(r => r.question_id === qSummary.questionId);
      if (response) {
        try {
          await base44.asServiceRole.entities.Response.update(response.id, {
            investigator_summary: qSummary.summary,
            investigator_summary_last_generated_at: new Date().toISOString()
          });
          updatedQuestionCount++;
        } catch (err) {
          console.error(`Failed to update response ${response.id}:`, err.message);
        }
      }
    }

    // Convert section summaries array to object keyed by section name
    const sectionSummariesObj = {};
    sectionSummaries.forEach(section => {
      sectionSummariesObj[section.sectionName] = {
        text: section.text,
        riskLevel: section.riskLevel,
        concerns: section.concerns || []
      };
    });

    // Update session with all AI summaries
    await base44.asServiceRole.entities.InterviewSession.update(session_id, {
      global_ai_summary: interviewSummary,
      section_ai_summaries: sectionSummariesObj,
      ai_summaries_last_generated_at: new Date().toISOString()
    });

    console.log(`✅ Saved summaries to session ${session_id}`);

    return Response.json({
      ok: true,
      success: true,
      data: {
        sessionId: session_id,
        interviewSummary,
        sectionSummaries: sectionSummariesObj,
        redFlags
      },
      updatedCount: updatedQuestionCount,
      globalSummaryGenerated: true,
      sectionSummariesGenerated: Object.keys(sectionSummariesObj).length
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