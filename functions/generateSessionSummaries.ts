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

    console.log('[FUNC generateSessionSummaries] start', { 
      sessionId, 
      hasTranscriptEvents: transcriptEvents.length > 0,
      eventCount: transcriptEvents.length,
      bodyKeys: Object.keys(body || {})
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

    // Count basic stats from transcript
    const yesCount = transcript.filter(e => e.answer === 'Yes' || e.kind === 'base_answer' && e.text === 'Yes').length;
    const noCount = transcript.filter(e => e.answer === 'No' || e.kind === 'base_answer' && e.text === 'No').length;

    // Build comprehensive prompt for single LLM call
    const llmPrompt = `You are an AI assistant for law enforcement background investigations. You will receive a structured transcript of a completed applicant interview. Generate a comprehensive JSON summary.

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
    if (questionSummaries.length > 0) {
      const responses = await base44.asServiceRole.entities.Response.filter({ session_id: sessionId });
      
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
    await base44.asServiceRole.entities.InterviewSession.update(sessionId, {
      global_ai_summary: interviewSummary,
      section_ai_summaries: sectionSummariesObj,
      ai_summaries_last_generated_at: new Date().toISOString()
    });

    console.log('[FUNC generateSessionSummaries] wrote', {
      questionSummaries: updatedQuestionCount,
      sectionSummaries: Object.keys(sectionSummariesObj).length,
      globalSummary: interviewSummary ? 1 : 0,
      redFlags: redFlags.length
    });

    console.log(`✅ Saved summaries to session ${sessionId}`);

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