import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Get AI runtime configuration from GlobalSettings with safe defaults
 */
function getAiRuntimeConfig(globalSettings) {
  return {
    model: globalSettings?.ai_model || "gpt-4o-mini",
    temperature: globalSettings?.ai_temperature ?? 0.2,
    max_tokens: globalSettings?.ai_max_tokens ?? 512,
    top_p: globalSettings?.ai_top_p ?? 1,
  };
}

/**
 * Incremental, Idempotent AI Summary Generation
 * 
 * - Section summaries: only when section is 100% complete, never updated
 * - Interview summary: only when ALL sections are 100% complete, never updated
 * - Safe to call multiple times
 */
Deno.serve(async (req) => {
  let sessionId = null;
  
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ ok: false, error: { message: 'Unauthorized' } }, { status: 401 });
    }

    let body;
    try {
      body = typeof req.json === "function" ? await req.json() : req.body;
    } catch (parseErr) {
      return Response.json({ ok: false, error: { message: 'Invalid JSON body' } }, { status: 400 });
    }
    
    sessionId = body?.sessionId || body?.session_id;
    const generateGlobal = body?.generateGlobal !== false;
    const generateSections = body?.generateSections !== false;

    console.log('[SSUM] START', { sessionId, generateGlobal, generateSections });

    if (!sessionId) {
      return Response.json({ ok: false, error: { message: 'sessionId required' } }, { status: 400 });
    }

    let createdSectionCount = 0;
    let skippedSectionExistsCount = 0;
    let skippedSectionIncompleteCount = 0;
    let createdGlobal = false;

    // Fetch all data
    let responses, questions, sections, globalSettingsResult, existingSectionSummaries, session;
    try {
      [responses, questions, sections, globalSettingsResult, existingSectionSummaries, session] = await Promise.all([
        base44.asServiceRole.entities.Response.filter({ session_id: sessionId }),
        base44.asServiceRole.entities.Question.list(),
        base44.asServiceRole.entities.Section.filter({ active: true }),
        base44.asServiceRole.entities.GlobalSettings.filter({ settings_id: 'global' }).catch(() => []),
        base44.asServiceRole.entities.SectionSummary.filter({ session_id: sessionId }),
        base44.asServiceRole.entities.InterviewSession.get(sessionId)
      ]);
    } catch (fetchErr) {
      console.error('[SSUM] FETCH_ERROR', { sessionId, error: fetchErr.message });
      return Response.json({ ok: false, error: { message: `Failed to fetch: ${fetchErr.message}` } }, { status: 500 });
    }
    
    // Normalize arrays
    responses = (Array.isArray(responses) ? responses : []).map(r => r.data || r);
    questions = (Array.isArray(questions) ? questions : []).map(q => q.data || q);
    sections = (Array.isArray(sections) ? sections : []).map(s => s.data || s);
    existingSectionSummaries = (Array.isArray(existingSectionSummaries) ? existingSectionSummaries : []).map(s => s.data || s);
    
    // Build existing section summaries set
    const existingSectionIds = new Set(existingSectionSummaries.map(s => s.section_id).filter(Boolean));
    
    const globalSettings = globalSettingsResult?.length > 0 ? globalSettingsResult[0] : null;
    const aiConfig = getAiRuntimeConfig(globalSettings);
    
    console.log('[SSUM] DATA_FETCHED', {
      sessionId,
      responsesCount: responses.length,
      sectionsCount: sections.length,
      existingSectionSummariesCount: existingSectionSummaries.length
    });

    // Build question-to-section mapping
    const questionsBySectionId = {};
    questions.forEach(q => {
      const sectionId = q.section_id;
      if (!sectionId) return;
      if (!questionsBySectionId[sectionId]) {
        questionsBySectionId[sectionId] = [];
      }
      questionsBySectionId[sectionId].push(q);
    });

    // Build responses by question ID (using database ID)
    const responsesByQuestionDbId = {};
    responses.forEach(r => {
      responsesByQuestionDbId[r.question_id] = r;
    });

    // Calculate completion for each section
    const sectionCompletionStatus = {};
    let allSectionsComplete = true;

    for (const section of sections) {
      const sectionId = section.id;
      const sectionName = section.section_name;
      const sectionQuestions = questionsBySectionId[sectionId] || [];
      const activeQuestions = sectionQuestions.filter(q => q.active !== false);
      
      if (activeQuestions.length === 0) {
        // Empty section is considered complete
        sectionCompletionStatus[sectionId] = {
          sectionName,
          totalQuestions: 0,
          answeredQuestions: 0,
          complete: true,
          responses: []
        };
        continue;
      }
      
      // Count answered questions
      let answeredCount = 0;
      const sectionResponses = [];
      
      for (const q of activeQuestions) {
        const response = responsesByQuestionDbId[q.id];
        if (response && response.answer) {
          answeredCount++;
          sectionResponses.push(response);
        }
      }
      
      const isComplete = answeredCount === activeQuestions.length;
      
      sectionCompletionStatus[sectionId] = {
        sectionName,
        totalQuestions: activeQuestions.length,
        answeredQuestions: answeredCount,
        complete: isComplete,
        responses: sectionResponses
      };
      
      if (!isComplete) {
        allSectionsComplete = false;
      }
    }

    // SECTION SUMMARIES
    if (generateSections) {
      for (const [sectionId, status] of Object.entries(sectionCompletionStatus)) {
        // RULE 1: Skip if summary already exists (never overwrite)
        if (existingSectionIds.has(sectionId)) {
          console.log('[SSUM][SKIP-EXISTS]', { session: sessionId, section: sectionId });
          skippedSectionExistsCount++;
          continue;
        }
        
        // RULE 2: Skip if section is not 100% complete
        if (!status.complete) {
          console.log('[SSUM][SKIP-INCOMPLETE]', { 
            session: sessionId, 
            section: sectionId,
            answered: status.answeredQuestions,
            total: status.totalQuestions
          });
          skippedSectionIncompleteCount++;
          continue;
        }
        
        // Skip empty sections
        if (status.responses.length === 0) {
          continue;
        }
        
        const sectionPrompt = `Summarize this section in 2-3 sentences:

SECTION: ${status.sectionName}
RESPONSES:
${JSON.stringify(status.responses.map(r => ({
  question: r.question_text,
  answer: r.answer
})), null, 2)}`;

        try {
          const sectionResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt: sectionPrompt,
            response_json_schema: {
              type: "object",
              properties: { summary: { type: "string" } }
            },
            model: aiConfig.model,
            temperature: aiConfig.temperature,
            max_tokens: aiConfig.max_tokens,
            top_p: aiConfig.top_p
          });

          // Double-check no existing summary (race condition guard)
          const existingCheck = await base44.asServiceRole.entities.SectionSummary.filter({
            session_id: sessionId,
            section_id: sectionId
          });

          if (existingCheck.length > 0) {
            console.log('[SSUM][SKIP-EXISTS]', { session: sessionId, section: sectionId });
            skippedSectionExistsCount++;
            continue;
          }

          // CREATE ONLY - never update
          await base44.asServiceRole.entities.SectionSummary.create({
            session_id: sessionId,
            section_id: sectionId,
            section_summary_text: sectionResult.summary,
            generated_at: new Date().toISOString()
          });

          console.log('[SSUM][CREATE]', { session: sessionId, section: sectionId });
          createdSectionCount++;
          
        } catch (err) {
          console.error('[SSUM] SECTION_ERROR', { section: sectionId, error: err.message });
        }
      }
    }

    // GLOBAL/INTERVIEW SUMMARY
    if (generateGlobal) {
      // Check if interview summary already exists
      const hasExistingGlobalSummary = session?.global_ai_summary?.text && 
        session.global_ai_summary.text.length > 0 &&
        !session.global_ai_summary.text.includes('lack of disclosures');
      
      if (hasExistingGlobalSummary) {
        console.log('[ISUM][SKIP-EXISTS]', { session: sessionId });
      } else if (!allSectionsComplete) {
        // Calculate overall progress for logging
        const totalSections = Object.keys(sectionCompletionStatus).length;
        const completeSections = Object.values(sectionCompletionStatus).filter(s => s.complete).length;
        console.log('[ISUM][SKIP-INCOMPLETE]', { 
          session: sessionId,
          completeSections,
          totalSections
        });
      } else {
        // All sections complete and no existing summary - generate it
        const yesCount = responses.filter(r => r.answer === 'Yes').length;
        const noCount = responses.filter(r => r.answer === 'No').length;
        
        const globalPrompt = `You are an AI assistant for law enforcement background investigations.

INTERVIEW DATA:
- Total questions: ${responses.length}
- Yes answers: ${yesCount}
- No answers: ${noCount}

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
              properties: { summary: { type: "string" } }
            },
            model: aiConfig.model,
            temperature: aiConfig.temperature,
            max_tokens: aiConfig.max_tokens,
            top_p: aiConfig.top_p
          });

          // CREATE ONLY - set once, never update
          await base44.asServiceRole.entities.InterviewSession.update(sessionId, {
            global_ai_summary: { 
              text: globalResult.summary || 'Summary generated',
              riskLevel: yesCount > 10 ? 'High' : yesCount > 5 ? 'Moderate' : 'Low',
              keyObservations: [],
              patterns: []
            },
            ai_summaries_last_generated_at: new Date().toISOString()
          });

          console.log('[ISUM][CREATE]', { session: sessionId });
          createdGlobal = true;
          
        } catch (err) {
          console.error('[ISUM] ERROR', { error: err.message });
        }
      }
    }

    console.log('[SSUM] DONE', {
      sessionId,
      createdSectionCount,
      skippedSectionExistsCount,
      skippedSectionIncompleteCount,
      createdGlobal,
      allSectionsComplete
    });

    return Response.json({
      success: true,
      createdSectionCount,
      skippedSectionExistsCount,
      skippedSectionIncompleteCount,
      createdGlobal,
      allSectionsComplete
    });

  } catch (error) {
    console.error('[SSUM] ERROR', { sessionId, error: error.message });
    return Response.json({
      ok: false,
      error: { message: error.message || 'generateSessionSummaries failed' }
    }, { status: 500 });
  }
});