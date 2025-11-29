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
 * Check if a question is complete for this session.
 * A question is complete when:
 * 1. It has a response (any answer - Yes/No/other)
 * 2. If it triggered follow-ups, all follow-up instances are in a terminal state
 */
function isQuestionComplete(questionDbId, responsesByQuestionDbId, followUpsByResponseId) {
  const response = responsesByQuestionDbId[questionDbId];
  if (!response || !response.answer) {
    return { complete: false, reason: 'no_response' };
  }
  
  const responseFollowUps = followUpsByResponseId[response.id] || [];
  
  // If no follow-ups, question is complete (simple answer)
  if (responseFollowUps.length === 0) {
    return { complete: true, reason: 'no_followups' };
  }
  
  // Group by instance number
  const instanceMap = {};
  for (const fu of responseFollowUps) {
    const instNum = fu.instance_number || 1;
    if (!instanceMap[instNum]) {
      instanceMap[instNum] = [];
    }
    instanceMap[instNum].push(fu);
  }
  
  // Check each instance for completion
  for (const [instNum, instanceFollowUps] of Object.entries(instanceMap)) {
    const latestFu = instanceFollowUps.sort((a, b) => 
      new Date(b.updated_date || b.created_date) - new Date(a.updated_date || a.created_date)
    )[0];
    
    // Check if marked completed or has meaningful details
    const isComplete = latestFu.completed === true || (() => {
      const details = latestFu.additional_details || {};
      const meaningfulFields = Object.entries(details).filter(([key, value]) => {
        if (!value) return false;
        if (['investigator_probing', 'question_text_snapshot', 'facts', 'unresolvedFields'].includes(key)) return false;
        if (typeof value === 'object') return false;
        return String(value).trim().length > 0;
      });
      return meaningfulFields.length >= 2;
    })();
    
    if (!isComplete) {
      return { complete: false, reason: `instance_${instNum}_incomplete` };
    }
  }
  
  return { complete: true, reason: 'all_instances_complete', instanceCount: Object.keys(instanceMap).length };
}

/**
 * Build question context for LLM prompt
 */
function buildQuestionContext(response, followUps) {
  let context = `Question: "${response.question_text}"\nAnswer: ${response.answer}\n`;
  
  if (followUps && followUps.length > 0) {
    // Group by instance
    const instanceMap = {};
    for (const fu of followUps) {
      const instNum = fu.instance_number || 1;
      if (!instanceMap[instNum]) instanceMap[instNum] = [];
      instanceMap[instNum].push(fu);
    }
    
    for (const [instNum, instanceFollowUps] of Object.entries(instanceMap)) {
      context += `\nInstance ${instNum}:\n`;
      
      for (const fu of instanceFollowUps) {
        const details = fu.additional_details || {};
        Object.entries(details).forEach(([key, value]) => {
          if (['investigator_probing', 'question_text_snapshot', 'facts', 'unresolvedFields'].includes(key)) return;
          if (!value || typeof value === 'object') return;
          const label = key.replace(/PACK_[A-Z_]+_/g, '').replace(/_/g, ' ');
          context += `  ${label}: ${value}\n`;
        });
        
        // Add AI probing exchanges
        if (details.investigator_probing && Array.isArray(details.investigator_probing)) {
          details.investigator_probing.forEach(ex => {
            context += `  AI Q: ${ex.probing_question}\n`;
            context += `  A: ${ex.candidate_response}\n`;
          });
        }
      }
    }
  }
  
  return context.trim();
}

/**
 * Core orchestrator for all summary types.
 * Incremental, idempotent, never overwrites existing summaries.
 */
async function runSummariesForSession(base44, sessionId) {
  const result = {
    created: { question: 0, section: 0, interview: 0 },
    skippedExists: { question: 0, section: 0, interview: 0 },
    skippedIncomplete: { question: 0, section: 0, interview: 0 },
    errors: []
  };
  
  // 1) Load all data
  let responses, followUps, questions, sections, globalSettingsResult, session;
  let existingQuestionSummaries, existingSectionSummaries;
  
  try {
    [responses, followUps, questions, sections, globalSettingsResult, session, existingQuestionSummaries, existingSectionSummaries] = await Promise.all([
      base44.asServiceRole.entities.Response.filter({ session_id: sessionId }),
      base44.asServiceRole.entities.FollowUpResponse.filter({ session_id: sessionId }),
      base44.asServiceRole.entities.Question.filter({ active: true }),
      base44.asServiceRole.entities.Section.filter({ active: true }),
      base44.asServiceRole.entities.GlobalSettings.filter({ settings_id: 'global' }).catch(() => []),
      base44.asServiceRole.entities.InterviewSession.get(sessionId),
      base44.asServiceRole.entities.QuestionSummary.filter({ session_id: sessionId }),
      base44.asServiceRole.entities.SectionSummary.filter({ session_id: sessionId })
    ]);
  } catch (fetchErr) {
    console.error('[SUMMARIES] FETCH_ERROR', { sessionId, error: fetchErr.message });
    throw new Error(`Failed to fetch session data: ${fetchErr.message}`);
  }
  
  // Normalize arrays
  responses = (Array.isArray(responses) ? responses : []).map(r => r.data || r);
  followUps = (Array.isArray(followUps) ? followUps : []).map(f => f.data || f);
  questions = (Array.isArray(questions) ? questions : []).map(q => q.data || q);
  sections = (Array.isArray(sections) ? sections : []).map(s => s.data || s);
  existingQuestionSummaries = (Array.isArray(existingQuestionSummaries) ? existingQuestionSummaries : []).map(s => s.data || s);
  existingSectionSummaries = (Array.isArray(existingSectionSummaries) ? existingSectionSummaries : []).map(s => s.data || s);
  
  const globalSettings = globalSettingsResult?.length > 0 ? globalSettingsResult[0] : null;
  const aiConfig = getAiRuntimeConfig(globalSettings);
  
  console.log('[SUMMARIES] DATA_LOADED', {
    sessionId,
    responses: responses.length,
    followUps: followUps.length,
    questions: questions.length,
    sections: sections.length,
    existingQuestionSummaries: existingQuestionSummaries.length,
    existingSectionSummaries: existingSectionSummaries.length
  });
  
  // 2) Build lookup maps
  const questionsById = {};
  questions.forEach(q => { if (q.id) questionsById[q.id] = q; });
  
  const questionsBySectionId = {};
  questions.forEach(q => {
    if (!q.section_id) return;
    if (!questionsBySectionId[q.section_id]) questionsBySectionId[q.section_id] = [];
    questionsBySectionId[q.section_id].push(q);
  });
  
  const responsesByQuestionDbId = {};
  responses.forEach(r => { responsesByQuestionDbId[r.question_id] = r; });
  
  const followUpsByResponseId = {};
  followUps.forEach(f => {
    if (!followUpsByResponseId[f.response_id]) followUpsByResponseId[f.response_id] = [];
    followUpsByResponseId[f.response_id].push(f);
  });
  
  const existingQSummaryIds = new Set(existingQuestionSummaries.map(s => s.question_id).filter(Boolean));
  const existingSSummaryIds = new Set(existingSectionSummaries.map(s => s.section_id).filter(Boolean));
  
  // 3) Process QUESTION SUMMARIES
  for (const response of responses) {
    const questionDbId = response.question_id;
    const questionEntity = questionsById[questionDbId];
    
    if (!questionEntity) continue;
    
    // Check if summary already exists
    if (existingQSummaryIds.has(questionDbId)) {
      console.log('[QSUM][SKIP-EXISTS]', { session: sessionId, question: questionDbId });
      result.skippedExists.question++;
      continue;
    }
    
    // Check if question is complete
    const completionStatus = isQuestionComplete(questionDbId, responsesByQuestionDbId, followUpsByResponseId);
    if (!completionStatus.complete) {
      console.log('[QSUM][SKIP-INCOMPLETE]', { session: sessionId, question: questionDbId, reason: completionStatus.reason });
      result.skippedIncomplete.question++;
      continue;
    }
    
    // Build context and generate summary
    const questionFollowUps = followUpsByResponseId[response.id] || [];
    const contextText = buildQuestionContext(response, questionFollowUps);
    
    const prompt = `You are an AI investigator summarizing a single interview question.

Task: Write a short, objective summary (2-4 sentences) of what the candidate disclosed.
- Use third person ("The applicant reports...")
- Focus on facts: what happened, when, where, outcomes
- Do NOT add speculation or advice
- NEVER mention internal terminology like "Pack" or field names

Transcript:
${contextText}`;

    try {
      const llmResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: { summary: { type: "string" } }
        },
        model: aiConfig.model,
        temperature: aiConfig.temperature,
        max_tokens: aiConfig.max_tokens,
        top_p: aiConfig.top_p
      });
      
      const summaryText = llmResult?.summary;
      if (summaryText) {
        // Double-check no existing summary (race condition guard)
        const existingCheck = await base44.asServiceRole.entities.QuestionSummary.filter({
          session_id: sessionId,
          question_id: questionDbId
        });
        
        if (existingCheck.length > 0) {
          console.log('[QSUM][SKIP-EXISTS]', { session: sessionId, question: questionDbId });
          result.skippedExists.question++;
          continue;
        }
        
        // Find section name for this question
        const sectionEntity = sections.find(s => s.id === questionEntity.section_id);
        const sectionName = sectionEntity?.section_name || '';
        
        await base44.asServiceRole.entities.QuestionSummary.create({
          session_id: sessionId,
          section_id: sectionName,
          question_id: questionDbId,
          question_summary_text: summaryText,
          generated_at: new Date().toISOString()
        });
        
        console.log('[QSUM][CREATE]', { session: sessionId, question: questionDbId });
        result.created.question++;
      }
    } catch (err) {
      console.error('[QSUM][ERROR]', { session: sessionId, question: questionDbId, error: err.message });
      result.errors.push({ type: 'question', id: questionDbId, error: err.message });
    }
  }
  
  // 4) Calculate section completion and process SECTION SUMMARIES
  const sectionCompletionStatus = {};
  let allSectionsComplete = true;
  
  for (const section of sections) {
    const sectionId = section.id;
    const sectionQuestions = questionsBySectionId[sectionId] || [];
    
    if (sectionQuestions.length === 0) {
      sectionCompletionStatus[sectionId] = { complete: true, name: section.section_name, responses: [] };
      continue;
    }
    
    let completeCount = 0;
    const sectionResponses = [];
    
    for (const q of sectionQuestions) {
      const status = isQuestionComplete(q.id, responsesByQuestionDbId, followUpsByResponseId);
      if (status.complete) {
        completeCount++;
        const resp = responsesByQuestionDbId[q.id];
        if (resp) sectionResponses.push(resp);
      }
    }
    
    const isComplete = completeCount === sectionQuestions.length;
    sectionCompletionStatus[sectionId] = {
      complete: isComplete,
      name: section.section_name,
      total: sectionQuestions.length,
      completed: completeCount,
      responses: sectionResponses
    };
    
    if (!isComplete) allSectionsComplete = false;
  }
  
  // Generate section summaries for complete sections
  for (const [sectionId, status] of Object.entries(sectionCompletionStatus)) {
    if (existingSSummaryIds.has(sectionId)) {
      console.log('[SSUM][SKIP-EXISTS]', { session: sessionId, section: sectionId });
      result.skippedExists.section++;
      continue;
    }
    
    if (!status.complete) {
      console.log('[SSUM][SKIP-INCOMPLETE]', { session: sessionId, section: sectionId, completed: status.completed, total: status.total });
      result.skippedIncomplete.section++;
      continue;
    }
    
    if (status.responses.length === 0) continue;
    
    const sectionPrompt = `Summarize this interview section in 2-3 sentences:

SECTION: ${status.name}
RESPONSES:
${JSON.stringify(status.responses.map(r => ({ question: r.question_text, answer: r.answer })), null, 2)}`;

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
      
      if (sectionResult?.summary) {
        // Double-check no existing summary
        const existingCheck = await base44.asServiceRole.entities.SectionSummary.filter({
          session_id: sessionId,
          section_id: sectionId
        });
        
        if (existingCheck.length > 0) {
          console.log('[SSUM][SKIP-EXISTS]', { session: sessionId, section: sectionId });
          result.skippedExists.section++;
          continue;
        }
        
        await base44.asServiceRole.entities.SectionSummary.create({
          session_id: sessionId,
          section_id: sectionId,
          section_summary_text: sectionResult.summary,
          generated_at: new Date().toISOString()
        });
        
        console.log('[SSUM][CREATE]', { session: sessionId, section: sectionId });
        result.created.section++;
      }
    } catch (err) {
      console.error('[SSUM][ERROR]', { session: sessionId, section: sectionId, error: err.message });
      result.errors.push({ type: 'section', id: sectionId, error: err.message });
    }
  }
  
  // 5) Process INTERVIEW SUMMARY (only if all sections complete)
  const hasExistingGlobalSummary = session?.global_ai_summary?.text && 
    session.global_ai_summary.text.length > 0 &&
    !session.global_ai_summary.text.includes('lack of disclosures');
  
  if (hasExistingGlobalSummary) {
    console.log('[ISUM][SKIP-EXISTS]', { session: sessionId });
    result.skippedExists.interview++;
  } else if (!allSectionsComplete) {
    const completeSections = Object.values(sectionCompletionStatus).filter(s => s.complete).length;
    const totalSections = Object.keys(sectionCompletionStatus).length;
    console.log('[ISUM][SKIP-INCOMPLETE]', { session: sessionId, completeSections, totalSections });
    result.skippedIncomplete.interview++;
  } else {
    // All sections complete - generate interview summary
    const yesCount = responses.filter(r => r.answer === 'Yes').length;
    const noCount = responses.filter(r => r.answer === 'No').length;
    
    const globalPrompt = `You are an AI assistant for law enforcement background investigations.

INTERVIEW DATA:
- Total questions: ${responses.length}
- Yes answers: ${yesCount}
- No answers: ${noCount}

RESPONSES:
${JSON.stringify(responses.map(r => ({ question: r.question_text, answer: r.answer })), null, 2)}

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
      
      if (globalResult?.summary) {
        await base44.asServiceRole.entities.InterviewSession.update(sessionId, {
          global_ai_summary: {
            text: globalResult.summary,
            riskLevel: yesCount > 10 ? 'High' : yesCount > 5 ? 'Moderate' : 'Low',
            keyObservations: [],
            patterns: []
          },
          ai_summaries_last_generated_at: new Date().toISOString()
        });
        
        console.log('[ISUM][CREATE]', { session: sessionId });
        result.created.interview++;
      }
    } catch (err) {
      console.error('[ISUM][ERROR]', { session: sessionId, error: err.message });
      result.errors.push({ type: 'interview', id: sessionId, error: err.message });
    }
  }
  
  console.log('[SUMMARIES] DONE', { sessionId, result });
  return result;
}

/**
 * HTTP Handler - Unified Summary Generation Endpoint
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

    console.log('[SUMMARIES] START', { sessionId });

    if (!sessionId) {
      return Response.json({ ok: false, error: { message: 'sessionId required' } }, { status: 400 });
    }

    const result = await runSummariesForSession(base44, sessionId);

    return Response.json({
      ok: true,
      success: true,
      ...result
    });

  } catch (error) {
    console.error('[SUMMARIES] ERROR', { sessionId, error: error.message });
    return Response.json({
      ok: false,
      error: { message: error.message || 'generateSessionSummaries failed' }
    }, { status: 500 });
  }
});