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
 * 
 * @param eventType - "question_complete" | "section_complete" | "interview_complete" | "backfill"
 * - "backfill": Admin/dev mode - re-runs all logic for the session, generating any missing summaries
 */
async function runSummariesForSession(base44, sessionId, eventType = "interview_complete") {
  const result = {
    created: { question: 0, section: 0, interview: 0 },
    skippedExists: { question: 0, section: 0, interview: 0 },
    skippedIncomplete: { question: 0, section: 0, interview: 0 },
    errors: [],
    eventType
  };
  
  console.log('[SUMMARIES] EVENT_TYPE', { sessionId, eventType });
  
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
  // GATE: Process on question_complete, section_complete, interview_complete, or backfill
  const shouldProcessQuestions = eventType === "question_complete" || 
                                  eventType === "section_complete" || 
                                  eventType === "interview_complete" ||
                                  eventType === "backfill";
  
  // OPTIMIZATION: Only generate summaries for Yes answers OR questions with follow-ups
  // This prevents hammering the LLM with 100+ "No" answer summaries
  const questionsNeedingSummary = shouldProcessQuestions ? responses.filter(response => {
    const hasFollowUps = (followUpsByResponseId[response.id] || []).length > 0;
    const isYes = response.answer === 'Yes';
    return isYes || hasFollowUps;
  }) : [];
  
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
    
    // Check if Response already has aiSummary.questionSummaryText
    const hasResponseLevelSummary = response.aiSummary?.questionSummaryText && 
                                     response.aiSummary?.status === 'completed';
    
    // Also check QuestionSummary entity for backwards compatibility
    if (hasResponseLevelSummary || existingQSummaryIds.has(questionCode)) {
      result.skippedExists.question++;
      continue;
    }
    
    // Check if question is complete
    const completionStatus = isQuestionComplete(questionCode, responsesByQuestionCode, followUpsByResponseId);
    if (!completionStatus.complete) {
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
        // Save to Response.aiSummary (NEW primary storage)
        try {
          await base44.asServiceRole.entities.Response.update(response.id, {
            aiSummary: {
              questionSummaryText: summaryText,
              status: 'completed',
              lastUpdatedAt: new Date().toISOString()
            }
          });
          
          result.created.question++;
          
          // Also save to QuestionSummary entity for backwards compatibility
          const sectionEntity = sections.find(s => s.id === questionEntity.section_id);
          const sectionName = sectionEntity?.section_name || '';
          
          await base44.asServiceRole.entities.QuestionSummary.create({
            session_id: sessionId,
            section_id: sectionName,
            question_id: questionCode,
            question_summary_text: summaryText,
            generated_at: new Date().toISOString()
          }).catch(() => {}); // Ignore errors - Response.aiSummary is primary
          
        } catch (updateErr) {
          result.errors.push({ type: 'question_update', id: questionCode, error: updateErr.message });
        }
      }
    } catch (err) {
      console.error('[QSUM][LLM-ERROR]', { session: sessionId, question: questionCode, error: err.message });
      result.errors.push({ type: 'question_llm', id: questionCode, error: err.message });
      // Continue to next question - don't fail the whole batch
    }
  }
  
  // 3.5) Process INSTANCE SUMMARIES (FollowUpResponse)
  // GATE: Process on question_complete, section_complete, interview_complete, or backfill
  // Generate narrative for each completed follow-up instance
  const followUpsToProcess = shouldProcessQuestions ? followUps : [];
  
  for (const followUp of followUpsToProcess) {
    // Skip if instance already has summary
    if (followUp.aiSummary?.instanceNarrativeText && followUp.aiSummary?.status === 'completed') {
      result.skippedExists.instance = (result.skippedExists.instance || 0) + 1;
      continue;
    }
    
    // Check if instance is complete
    if (!followUp.completed) {
      result.skippedIncomplete.instance = (result.skippedIncomplete.instance || 0) + 1;
      continue;
    }
    
    // Build instance context
    const packId = followUp.followup_pack;
    const details = followUp.additional_details || {};
    const instanceNumber = followUp.instance_number || 1;
    
    // Gather all field answers for this instance
    const fieldAnswers = [];
    Object.entries(details).forEach(([key, value]) => {
      if (['investigator_probing', 'question_text_snapshot', 'facts', 'unresolvedFields', 'candidate_narrative'].includes(key)) return;
      if (!value || typeof value === 'object') return;
      
      const label = key.replace(/PACK_[A-Z_]+_/g, '').replace(/_/g, ' ');
      fieldAnswers.push(`${label}: ${value}`);
    });
    
    // Add top-level fields
    if (followUp.incident_date) fieldAnswers.push(`Date: ${followUp.incident_date}`);
    if (followUp.incident_location) fieldAnswers.push(`Location: ${followUp.incident_location}`);
    if (followUp.incident_description) fieldAnswers.push(`Description: ${followUp.incident_description}`);
    if (followUp.circumstances) fieldAnswers.push(`Circumstances: ${followUp.circumstances}`);
    
    // Add AI probing exchanges
    const aiProbes = details.investigator_probing || [];
    const probeText = aiProbes.map(p => `Q: ${p.probing_question}\nA: ${p.candidate_response}`).join('\n');
    
    if (fieldAnswers.length === 0 && !probeText) {
      result.skippedIncomplete.instance = (result.skippedIncomplete.instance || 0) + 1;
      continue;
    }
    
    const instancePrompt = `You are summarizing a single incident from an interview.

Pack: ${packId}
Instance: ${instanceNumber}

Details:
${fieldAnswers.join('\n')}

${probeText ? `\nAI Follow-up Exchanges:\n${probeText}` : ''}

Write a brief narrative (2-3 sentences) describing this specific incident. Use third person and focus on facts.`;

    try {
      const instanceResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: instancePrompt,
        response_json_schema: {
          type: "object",
          properties: { narrative: { type: "string" } }
        },
        model: aiConfig.model,
        temperature: aiConfig.temperature,
        max_tokens: aiConfig.max_tokens,
        top_p: aiConfig.top_p
      });
      
      const narrativeText = instanceResult?.narrative;
      if (narrativeText) {
        await base44.asServiceRole.entities.FollowUpResponse.update(followUp.id, {
          aiSummary: {
            instanceNarrativeText: narrativeText,
            status: 'completed',
            lastUpdatedAt: new Date().toISOString()
          }
        });
        
        result.created.instance = (result.created.instance || 0) + 1;
        
        // Also save to InstanceSummary entity for backwards compatibility
        const baseResponse = responsesById[followUp.response_id];
        await base44.asServiceRole.entities.InstanceSummary.create({
          session_id: sessionId,
          section_id: baseResponse?.category || '',
          question_id: followUp.question_id,
          pack_id: packId,
          instance_number: instanceNumber,
          instance_summary_text: narrativeText,
          generated_at: new Date().toISOString()
        }).catch(() => {}); // Ignore errors
      }
    } catch (err) {
      result.errors.push({ type: 'instance_llm', id: followUp.id, error: err.message });
    }
  }
  
  // 4) Calculate section completion and process SECTION SUMMARIES
  const sectionCompletionStatus = {};
  let allSectionsComplete = true;
  
  // Helper: Check if a specific section is complete for this session
  const isSectionComplete = (sectionDbId) => {
    const status = sectionCompletionStatus[sectionDbId];
    if (!status) return false;
    
    // A section is complete if:
    // 1. It has at least one answered question, AND
    // 2. All answered questions are complete (including their follow-ups)
    return status.answered > 0 && status.complete;
  };
  
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
      // CRITICAL: Use database ID to look up response (not question_id string code)
      // Response.question_id stores the database ID for base questions
      const questionDbId = q.id;
      
      // Find base_question response by matching Response.question_id to Question.id
      const resp = responses.find(r => 
        r.question_id === questionDbId && r.response_type === 'base_question'
      );
      
      if (resp) {
        answeredCount++;
        sectionResponses.push(resp);
        
        // Check completion using the question's string code for follow-up lookup
        const questionCode = q.question_id;
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
  
  // GATE: Process sections on question_complete, section_complete, interview_complete, or backfill
  // This allows section summaries to generate as soon as the last question in a section is answered
  const shouldProcessSections = eventType === "question_complete" || 
                                 eventType === "section_complete" || 
                                 eventType === "interview_complete" ||
                                 eventType === "backfill";
  
  // Generate section summaries for sections with answered questions
  const sectionsToProcess = shouldProcessSections ? Object.entries(sectionCompletionStatus) : [];
  
  for (const [sectionDbId, status] of sectionsToProcess) {
    const sectionName = status.name;
    
    // Skip sections with no answered questions
    if (!status.responses || status.responses.length === 0) {
      continue;
    }
    
    // Check if section is complete using helper
    if (!isSectionComplete(sectionDbId)) {
      console.log('[SSUM][SKIP-INCOMPLETE]', { session: sessionId, sectionName, reason: 'section_not_complete' });
      result.skippedIncomplete.section++;
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
        // LAZY CREATE/UPDATE: Ensure SectionResult exists, then update with summary
        let sectionResultId = null;
        
        const existingSectionResults = await base44.asServiceRole.entities.SectionResult.filter({
          session_id: sessionId,
          section_id: sectionDbId
        });
        
        if (existingSectionResults.length > 0) {
          sectionResultId = existingSectionResults[0].id;
        } else {
          // Create new SectionResult record if it doesn't exist
          console.log('[SSUM][CREATE-RESULT]', { sessionId, sectionDbId, sectionName });
          const created = await base44.asServiceRole.entities.SectionResult.create({
            session_id: sessionId,
            section_id: sectionDbId,
            section_name: sectionName,
            total_questions: status.total || 0,
            answered_questions: status.answered || 0,
            yes_count: yesAnswers.length,
            no_count: noAnswers.length,
            completion_status: status.complete ? 'completed' : 'in_progress'
          });
          sectionResultId = created.id;
        }
        
        // Update with AI summary
        await base44.asServiceRole.entities.SectionResult.update(sectionResultId, {
          aiSummary: {
            sectionSummaryText: summaryText,
            status: 'completed',
            lastUpdatedAt: new Date().toISOString()
          }
        });
        
        result.created.section++;
        
        // Also save to SectionSummary entity for backwards compatibility
        await base44.asServiceRole.entities.SectionSummary.create({
          session_id: sessionId,
          section_id: sectionDbId,
          section_summary_text: summaryText,
          generated_at: new Date().toISOString()
        }).catch(() => {}); // Ignore errors
        
      } catch (err) {
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
  
  // 6) Process INTERVIEW SUMMARY
  // CRITICAL GATE: Only generate when eventType === "interview_complete" (or backfill) AND interview is actually completed
  const shouldProcessInterview = eventType === "interview_complete" || eventType === "backfill";
  
  const hasExistingOverallSummary = session?.aiSummary?.overallSummaryText && 
                                     session?.aiSummary?.status === 'completed';
  
  // Also check legacy global_ai_summary for backwards compatibility
  const hasLegacyGlobalSummary = session?.global_ai_summary?.text && 
    session.global_ai_summary.text.length > 0 &&
    !session.global_ai_summary.text.includes('lack of disclosures');
  
  // Check if interview is actually completed
  const isInterviewCompleted = session?.status === 'completed' || session?.status === 'under_review';
  
  if (!shouldProcessInterview) {
    console.log('[ISUM][SKIP-EVENT]', { sessionId, eventType, reason: 'not_interview_complete_event' });
    result.skippedIncomplete.interview++;
  } else if (!isInterviewCompleted) {
    console.log('[ISUM][SKIP-STATUS]', { sessionId, status: session?.status, reason: 'interview_not_completed' });
    result.skippedIncomplete.interview++;
  } else if (hasExistingOverallSummary || hasLegacyGlobalSummary) {
    result.skippedExists.interview++;
  } else if (!allSectionsComplete) {
    console.log('[ISUM][SKIP-SECTIONS]', { sessionId, reason: 'sections_not_complete' });
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
            aiSummary: {
              overallSummaryText: globalResult.summary,
              status: 'completed',
              lastUpdatedAt: new Date().toISOString()
            },
            global_ai_summary: {
              text: globalResult.summary,
              riskLevel: yesCount > 10 ? 'High' : yesCount > 5 ? 'Moderate' : 'Low',
              keyObservations: [],
              patterns: [],
              contradictions: contradictions
            },
            ai_summaries_last_generated_at: new Date().toISOString()
          });
          
          result.created.interview++;
        } catch (updateErr) {
          result.errors.push({ type: 'interview_update', id: sessionId, error: updateErr.message });
        }
      }
    } catch (err) {
      console.error('[ISUM][LLM-ERROR]', { session: sessionId, error: err.message });
      result.errors.push({ type: 'interview_llm', id: sessionId, error: err.message });
      // Don't throw - continue gracefully
    }
  }
  
  // Add summary counts to result
  result.contradictions = contradictions;
  
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

    // Extract eventType from request
    const eventType = body?.eventType || "interview_complete";
    
    // Run with top-level try/catch to ensure we never return 5xx
    let result;
    try {
      result = await runSummariesForSession(base44, sessionId, eventType);
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