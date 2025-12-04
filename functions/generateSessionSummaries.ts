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
 * Build fact graph for Contradiction Engine
 * Collects base answers and incident anchors from session data
 */
function buildFactGraph(responses, followUps, responsesByQuestionCode) {
  const baseAnswers = {};
  const incidents = {};
  
  // Collect base answers (normalized by question code)
  for (const response of responses) {
    const questionCode = response.question_id;
    if (questionCode) {
      baseAnswers[questionCode] = {
        raw: response.answer,
        normalized: response.answer?.toLowerCase?.() || response.answer,
        questionText: response.question_text
      };
    }
  }
  
  // Collect incidents from follow-up responses
  for (const fu of followUps) {
    const packId = fu.followup_pack;
    if (!packId) continue;
    
    if (!incidents[packId]) {
      incidents[packId] = [];
    }
    
    // Extract anchors from additional_details
    const anchors = {};
    const details = fu.additional_details || {};
    
    for (const [key, value] of Object.entries(details)) {
      // Skip internal fields
      if (['investigator_probing', 'question_text_snapshot', 'facts', 'unresolvedFields'].includes(key)) continue;
      if (typeof value === 'object') continue;
      if (!value || String(value).trim() === '') continue;
      
      // Normalize key to semantic anchor name
      const semanticKey = key
        .replace(/PACK_[A-Z_]+_/g, '')
        .replace(/Q\d+/g, '')
        .toLowerCase()
        .replace(/_/g, '');
      
      anchors[semanticKey] = value;
    }
    
    // Also include standard fields
    if (fu.incident_date) anchors['month_year'] = fu.incident_date;
    if (fu.incident_location) anchors['location'] = fu.incident_location;
    if (fu.incident_description) anchors['what_happened'] = fu.incident_description;
    if (fu.substance_name) anchors['substance_type'] = fu.substance_name;
    
    incidents[packId].push({
      instanceNumber: fu.instance_number || 1,
      anchors,
      responseId: fu.response_id,
      completed: fu.completed
    });
  }
  
  console.log('[FACT_GRAPH] Built', {
    baseAnswerCount: Object.keys(baseAnswers).length,
    incidentPacks: Object.keys(incidents),
    incidentCounts: Object.fromEntries(
      Object.entries(incidents).map(([k, v]) => [k, v.length])
    )
  });
  
  return { baseAnswers, incidents };
}

/**
 * Check if a question is complete for this session.
 * A question is complete when:
 * 1. It has a response (any answer - Yes/No/other)
 * 2. If it triggered follow-ups, all follow-up instances are in a terminal state
 * 
 * @param questionCode - The question string code (e.g., "Q008")
 * @param responsesByQuestionCode - Map of question code to response
 * @param followUpsByResponseId - Map of response ID to follow-ups
 */
function isQuestionComplete(questionCode, responsesByQuestionCode, followUpsByResponseId) {
  const response = responsesByQuestionCode[questionCode];
  if (!response || !response.answer) {
    return { complete: false, reason: 'no_response' };
  }
  
  const responseFollowUps = followUpsByResponseId[response.id] || [];
  
  // If answer is "No" or no follow-ups triggered, question is complete
  if (response.answer === 'No' || !response.triggered_followup) {
    return { complete: true, reason: 'no_followup_needed' };
  }
  
  // If follow-ups were triggered but none exist yet, still consider it complete
  // (the transcript may have captured the data even if FollowUpResponse wasn't created)
  if (responseFollowUps.length === 0) {
    return { complete: true, reason: 'no_followup_records' };
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
  // questionsById: maps database ID to question entity
  const questionsById = {};
  questions.forEach(q => { if (q.id) questionsById[q.id] = q; });
  
  // questionsByCode: maps question_id string code (Q008, Q009) to question entity
  const questionsByCode = {};
  questions.forEach(q => { if (q.question_id) questionsByCode[q.question_id] = q; });
  
  const questionsBySectionId = {};
  questions.forEach(q => {
    if (!q.section_id) return;
    if (!questionsBySectionId[q.section_id]) questionsBySectionId[q.section_id] = [];
    questionsBySectionId[q.section_id].push(q);
  });
  
  // CRITICAL: Response.question_id stores the string code (Q008), NOT the database ID
  // responsesByQuestionCode: maps question code to response
  const responsesByQuestionCode = {};
  responses.forEach(r => { 
    if (r.question_id) responsesByQuestionCode[r.question_id] = r; 
  });
  
  // Also build by response database ID for follow-up linking
  const responsesById = {};
  responses.forEach(r => { if (r.id) responsesById[r.id] = r; });
  
  const followUpsByResponseId = {};
  followUps.forEach(f => {
    if (!followUpsByResponseId[f.response_id]) followUpsByResponseId[f.response_id] = [];
    followUpsByResponseId[f.response_id].push(f);
  });
  
  // existingQSummaryIds uses question_id (the string code like Q008)
  const existingQSummaryIds = new Set(existingQuestionSummaries.map(s => s.question_id).filter(Boolean));
  const existingSSummaryIds = new Set(existingSectionSummaries.map(s => s.section_id).filter(Boolean));
  
  console.log('[SUMMARIES] LOOKUP_MAPS', {
    questionsByCode: Object.keys(questionsByCode).slice(0, 5),
    responsesByQuestionCode: Object.keys(responsesByQuestionCode).slice(0, 5),
    sampleResponse: responses[0] ? { id: responses[0].id, question_id: responses[0].question_id } : null
  });
  
  // 3) Process QUESTION SUMMARIES
  // OPTIMIZATION: Only generate summaries for Yes answers OR questions with follow-ups
  // This prevents hammering the LLM with 100+ "No" answer summaries
  const questionsNeedingSummary = responses.filter(response => {
    const hasFollowUps = (followUpsByResponseId[response.id] || []).length > 0;
    const isYes = response.answer === 'Yes';
    return isYes || hasFollowUps;
  });
  
  console.log('[SUMMARIES] QUESTION_FILTER', {
    sessionId,
    totalResponses: responses.length,
    needingSummary: questionsNeedingSummary.length,
    yesCount: responses.filter(r => r.answer === 'Yes').length
  });
  
  // Iterate over filtered responses only
  for (const response of questionsNeedingSummary) {
    // response.question_id is the string code (Q008, Q009, etc.)
    const questionCode = response.question_id;
    
    // Skip if no question code
    if (!questionCode) {
      console.log('[QSUM][SKIP-NO-CODE]', { session: sessionId, responseId: response.id });
      continue;
    }
    
    // Find the question entity by code
    const questionEntity = questionsByCode[questionCode];
    
    if (!questionEntity) {
      console.log('[QSUM][SKIP-NO-ENTITY]', { session: sessionId, questionCode });
      continue;
    }
    
    // Check if summary already exists (keyed by question code)
    if (existingQSummaryIds.has(questionCode)) {
      console.log('[QSUM][SKIP-EXISTS]', { session: sessionId, question: questionCode });
      result.skippedExists.question++;
      continue;
    }
    
    // Check if question is complete
    const completionStatus = isQuestionComplete(questionCode, responsesByQuestionCode, followUpsByResponseId);
    if (!completionStatus.complete) {
      console.log('[QSUM][SKIP-INCOMPLETE]', { session: sessionId, question: questionCode, reason: completionStatus.reason });
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
        try {
          const existingCheck = await base44.asServiceRole.entities.QuestionSummary.filter({
            session_id: sessionId,
            question_id: questionCode
          });
          
          if (existingCheck.length > 0) {
            console.log('[QSUM][SKIP-EXISTS]', { session: sessionId, question: questionCode });
            result.skippedExists.question++;
            continue;
          }
        } catch (checkErr) {
          console.warn('[QSUM][CHECK-ERROR]', { session: sessionId, question: questionCode, error: checkErr.message });
          // Continue anyway - worst case we get a duplicate that fails
        }
        
        // Find section name for this question
        const sectionEntity = sections.find(s => s.id === questionEntity.section_id);
        const sectionName = sectionEntity?.section_name || '';
        
        try {
          await base44.asServiceRole.entities.QuestionSummary.create({
            session_id: sessionId,
            section_id: sectionName,
            question_id: questionCode,
            question_summary_text: summaryText,
            generated_at: new Date().toISOString()
          });
          
          console.log('[QSUM][CREATE]', { session: sessionId, question: questionCode });
          result.created.question++;
        } catch (createErr) {
          console.error('[QSUM][CREATE-ERROR]', { session: sessionId, question: questionCode, error: createErr.message });
          result.errors.push({ type: 'question_create', id: questionCode, error: createErr.message });
        }
      } else {
        console.warn('[QSUM][NO-SUMMARY]', { session: sessionId, question: questionCode });
      }
    } catch (err) {
      console.error('[QSUM][LLM-ERROR]', { session: sessionId, question: questionCode, error: err.message });
      result.errors.push({ type: 'question_llm', id: questionCode, error: err.message });
      // Continue to next question - don't fail the whole batch
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
    let answeredCount = 0;
    const sectionResponses = [];
    
    for (const q of sectionQuestions) {
      // Use question_id (string code) to look up response
      const questionCode = q.question_id;
      const resp = responsesByQuestionCode[questionCode];
      
      if (resp) {
        answeredCount++;
        sectionResponses.push(resp);
        
        const status = isQuestionComplete(questionCode, responsesByQuestionCode, followUpsByResponseId);
        if (status.complete) {
          completeCount++;
        }
      }
    }
    
    // A section is complete if all ANSWERED questions are complete
    // (not all questions in the schema, since some may be skipped)
    const isComplete = answeredCount > 0 && completeCount === answeredCount;
    sectionCompletionStatus[sectionId] = {
      complete: isComplete,
      name: section.section_name,
      total: sectionQuestions.length,
      answered: answeredCount,
      completed: completeCount,
      responses: sectionResponses
    };
    
    // Only mark incomplete if there are answered but incomplete questions
    if (answeredCount > 0 && !isComplete) allSectionsComplete = false;
  }
  
  console.log('[SUMMARIES] SECTION_STATUS', {
    sessionId,
    sections: Object.entries(sectionCompletionStatus).map(([id, s]) => ({
      name: s.name,
      complete: s.complete,
      answered: s.answered || s.responses?.length || 0,
      total: s.total
    })).filter(s => s.answered > 0)
  });
  
  // Build a map of section DB ID to section name for existing summary lookup
  // The UI looks up summaries by section_name, so we store section_id as the name
  const existingSSummaryByName = new Set(
    existingSectionSummaries.map(s => {
      // Check if section_id is a name or a DB ID
      const sec = sections.find(sec => sec.id === s.section_id);
      return sec ? sec.section_name : s.section_id;
    }).filter(Boolean)
  );
  
  console.log('[SSUM] Existing summaries by name:', [...existingSSummaryByName]);
  
  // Generate section summaries for sections with answered questions
  for (const [sectionDbId, status] of Object.entries(sectionCompletionStatus)) {
    const sectionName = status.name;
    
    // Skip sections with no answered questions
    if (!status.responses || status.responses.length === 0) {
      continue;
    }
    
    // Check if summary already exists (by section name, which is what UI uses)
    if (existingSSummaryByName.has(sectionName)) {
      console.log('[SSUM][SKIP-EXISTS]', { session: sessionId, sectionName });
      result.skippedExists.section++;
      continue;
    }
    
    // Also check by DB ID for backwards compatibility
    if (existingSSummaryIds.has(sectionDbId)) {
      console.log('[SSUM][SKIP-EXISTS-DBID]', { session: sessionId, sectionDbId });
      result.skippedExists.section++;
      continue;
    }
    
    // Count Yes vs No answers
    const yesAnswers = status.responses.filter(r => r.answer === 'Yes');
    const noAnswers = status.responses.filter(r => r.answer === 'No');
    
    let summaryText;
    
    // If all answers are "No", generate a clean section summary without LLM
    if (yesAnswers.length === 0 && noAnswers.length > 0) {
      summaryText = `No issues were disclosed in this section. The applicant answered "No" to all ${noAnswers.length} questions regarding ${sectionName.toLowerCase()}.`;
      console.log('[SSUM][CLEAN-SECTION]', { session: sessionId, sectionName, noCount: noAnswers.length });
    } else {
      // Section has Yes answers - generate via LLM
      const sectionPrompt = `Summarize this interview section in 2-3 sentences:

SECTION: ${sectionName}
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
        
        summaryText = sectionResult?.summary;
      } catch (err) {
        console.error('[SSUM][LLM-ERROR]', { session: sessionId, sectionName, error: err.message });
        result.errors.push({ type: 'section', id: sectionName, error: err.message });
        continue;
      }
    }
    
    if (summaryText) {
      try {
        // Double-check no existing summary by name
        const existingCheck = await base44.asServiceRole.entities.SectionSummary.filter({
          session_id: sessionId,
          section_id: sectionDbId
        });
        
        if (existingCheck.length > 0) {
          console.log('[SSUM][SKIP-EXISTS-RACE]', { session: sessionId, sectionName });
          result.skippedExists.section++;
          continue;
        }
        
        // CRITICAL: Store section_id as the DATABASE ID (for consistency)
        // The UI will map DB ID -> section name when loading
        await base44.asServiceRole.entities.SectionSummary.create({
          session_id: sessionId,
          section_id: sectionDbId,
          section_summary_text: summaryText,
          generated_at: new Date().toISOString()
        });
        
        console.log('[SSUM][CREATE]', { session: sessionId, sectionName, sectionDbId });
        result.created.section++;
      } catch (err) {
        console.error('[SSUM][ERROR]', { session: sessionId, sectionName, error: err.message });
        result.errors.push({ type: 'section', id: sectionName, error: err.message });
      }
    }
  }
  
  // 5) Build fact graph and run Contradiction Engine
  const factGraph = buildFactGraph(responses, followUps, responsesByQuestionCode);
  let contradictions = [];
  
  try {
    const contradictionResult = await base44.functions.invoke('contradictionEngine', {
      sessionId,
      baseAnswers: factGraph.baseAnswers,
      incidents: factGraph.incidents,
      anchorsByTopic: {}
    });
    
    if (contradictionResult.data?.success) {
      contradictions = contradictionResult.data.contradictions || [];
      console.log('[SUMMARIES] CONTRADICTIONS', { sessionId, count: contradictions.length });
    }
  } catch (contradictionErr) {
    console.warn('[SUMMARIES] CONTRADICTION_ENGINE_ERROR', { sessionId, error: contradictionErr.message });
    // Continue without contradictions
  }
  
  // 6) Process INTERVIEW SUMMARY (only if all sections complete)
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
    
    // OPTIMIZATION: Only include Yes answers in the prompt to reduce token count
    const yesResponses = responses.filter(r => r.answer === 'Yes');
    
    const globalPrompt = `You are an AI assistant for law enforcement background investigations.

INTERVIEW DATA:
- Total questions: ${responses.length}
- Yes answers (disclosures): ${yesCount}
- No answers (no issues): ${noCount}

DISCLOSED ITEMS (Yes answers only):
${JSON.stringify(yesResponses.map(r => ({ question: r.question_text, answer: r.answer })), null, 2)}

Generate a brief interview-level summary (2-3 sentences) focusing on what was disclosed.`;

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
        try {
          await base44.asServiceRole.entities.InterviewSession.update(sessionId, {
            global_ai_summary: {
              text: globalResult.summary,
              riskLevel: yesCount > 10 ? 'High' : yesCount > 5 ? 'Moderate' : 'Low',
              keyObservations: [],
              patterns: [],
              contradictions: contradictions // Attach contradictions to BI output
            },
            ai_summaries_last_generated_at: new Date().toISOString()
          });
          
          console.log('[ISUM][CREATE]', { session: sessionId });
          result.created.interview++;
        } catch (updateErr) {
          console.error('[ISUM][UPDATE-ERROR]', { session: sessionId, error: updateErr.message });
          result.errors.push({ type: 'interview_update', id: sessionId, error: updateErr.message });
        }
      } else {
        console.warn('[ISUM][NO-SUMMARY]', { session: sessionId });
      }
    } catch (err) {
      console.error('[ISUM][LLM-ERROR]', { session: sessionId, error: err.message });
      result.errors.push({ type: 'interview_llm', id: sessionId, error: err.message });
      // Don't throw - continue gracefully
    }
  }
  
  console.log('[SUMMARIES] DONE', { sessionId, result });
  return result;
}

/**
 * HTTP Handler - Unified Summary Generation Endpoint
 * HARDENED: Always returns 200, logs errors, never throws unhandled exceptions
 */
Deno.serve(async (req) => {
  let sessionId = null;
  
  try {
    const base44 = createClientFromRequest(req);
    
    let user = null;
    try {
      user = await base44.auth.me();
    } catch (authErr) {
      console.error('[SUMMARIES] AUTH_ERROR', { error: authErr.message });
      return Response.json({ 
        ok: false, 
        success: false,
        error: { message: 'Authentication failed' },
        created: { question: 0, section: 0, interview: 0 },
        errors: [{ type: 'auth', error: authErr.message }]
      }, { status: 200 }); // Return 200 with error details instead of 401
    }
    
    if (!user) {
      return Response.json({ 
        ok: false, 
        success: false,
        error: { message: 'Unauthorized' },
        created: { question: 0, section: 0, interview: 0 },
        errors: [{ type: 'auth', error: 'No user' }]
      }, { status: 200 }); // Return 200 with error details
    }

    let body;
    try {
      body = typeof req.json === "function" ? await req.json() : req.body;
    } catch (parseErr) {
      console.error('[SUMMARIES] PARSE_ERROR', { error: parseErr.message });
      return Response.json({ 
        ok: false, 
        success: false,
        error: { message: 'Invalid JSON body' },
        created: { question: 0, section: 0, interview: 0 },
        errors: [{ type: 'parse', error: parseErr.message }]
      }, { status: 200 });
    }
    
    sessionId = body?.sessionId || body?.session_id;

    console.log('[SUMMARIES] START', { sessionId });

    if (!sessionId) {
      return Response.json({ 
        ok: false, 
        success: false,
        error: { message: 'sessionId required' },
        created: { question: 0, section: 0, interview: 0 },
        errors: [{ type: 'validation', error: 'sessionId required' }]
      }, { status: 200 });
    }

    // Run with top-level try/catch to ensure we never return 5xx
    let result;
    try {
      result = await runSummariesForSession(base44, sessionId);
    } catch (runErr) {
      console.error('[SUMMARIES] RUN_ERROR', { sessionId, error: runErr.message, stack: runErr.stack?.substring(0, 500) });
      return Response.json({
        ok: false,
        success: false,
        error: { message: runErr.message || 'Summary generation failed' },
        created: { question: 0, section: 0, interview: 0 },
        errors: [{ type: 'runtime', error: runErr.message }]
      }, { status: 200 }); // Return 200 even on runtime error
    }

    return Response.json({
      ok: true,
      success: true,
      ...result
    }, { status: 200 });

  } catch (error) {
    // Absolute fallback - should never reach here
    console.error('[SUMMARIES] FATAL_ERROR', { sessionId, error: error.message, stack: error.stack?.substring(0, 500) });
    return Response.json({
      ok: false,
      success: false,
      error: { message: error.message || 'generateSessionSummaries failed unexpectedly' },
      created: { question: 0, section: 0, interview: 0 },
      errors: [{ type: 'fatal', error: error.message }]
    }, { status: 200 }); // ALWAYS return 200
  }
});