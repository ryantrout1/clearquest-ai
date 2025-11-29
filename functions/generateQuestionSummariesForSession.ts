import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * AI Summary Configuration (duplicated here for backend - keep in sync with frontend config)
 */
const QUESTION_SUMMARY_CONFIG = {
  includedCategories: [
    'Applications with other Law Enforcement Agencies',  // Exact match from Section entity
    'Law Enforcement Applications',  // Alias just in case
    'Driving Record',
  ],
  includedPacks: [
    'PACK_LE_APPS',
    'PACK_INTEGRITY_APPS',
    'PACK_DRIVING_COLLISION_STANDARD',
    'PACK_DRIVING_VIOLATIONS_STANDARD',
    'PACK_DRIVING_DUIDWI_STANDARD',
    'PACK_DRIVING_STANDARD',
  ],
  minQuestionCode: 'Q001',
  maxQuestionCode: 'Q999',
};

/**
 * Field label mappings for better prompt context
 */
const FIELD_LABELS = {
  // PACK_LE_APPS
  'PACK_LE_APPS_Q1': 'Agency',
  'PACK_LE_APPS_Q1764025170356': 'Position',
  'PACK_LE_APPS_Q1764025187292': 'Application Date',
  'PACK_LE_APPS_Q1764025199138': 'Outcome',
  'PACK_LE_APPS_Q1764025212764': 'Reason Not Selected',
  'PACK_LE_APPS_Q1764025246583': 'Issues/Concerns',
  
  // Driving packs
  'PACK_DRIVING_COLLISION_Q01': 'Collision Date',
  'PACK_DRIVING_COLLISION_Q02': 'Location',
  'PACK_DRIVING_COLLISION_Q03': 'Description',
  'PACK_DRIVING_COLLISION_Q04': 'At Fault',
  'PACK_DRIVING_COLLISION_Q05': 'Injuries',
  'PACK_DRIVING_COLLISION_Q06': 'Property Damage',
  'PACK_DRIVING_COLLISION_Q07': 'Police/Citation',
  'PACK_DRIVING_COLLISION_Q08': 'Insurance Outcome',
  
  'PACK_DRIVING_VIOLATIONS_Q01': 'Violation Date',
  'PACK_DRIVING_VIOLATIONS_Q02': 'Violation Type',
  'PACK_DRIVING_VIOLATIONS_Q03': 'Location',
  'PACK_DRIVING_VIOLATIONS_Q04': 'Outcome',
  'PACK_DRIVING_VIOLATIONS_Q05': 'Fines',
  'PACK_DRIVING_VIOLATIONS_Q06': 'Points on License',
  
  'PACK_DRIVING_DUIDWI_Q01': 'Incident Date',
  'PACK_DRIVING_DUIDWI_Q02': 'Location',
  'PACK_DRIVING_DUIDWI_Q03': 'Substance Type',
  'PACK_DRIVING_DUIDWI_Q04': 'Stop Reason',
  'PACK_DRIVING_DUIDWI_Q05': 'Test Type',
  'PACK_DRIVING_DUIDWI_Q06': 'Test Result',
  'PACK_DRIVING_DUIDWI_Q07': 'Arrest Status',
  'PACK_DRIVING_DUIDWI_Q08': 'Court Outcome',
  'PACK_DRIVING_DUIDWI_Q09': 'License Impact',
};

function getFieldLabel(fieldKey) {
  return FIELD_LABELS[fieldKey] || fieldKey.replace(/PACK_[A-Z_]+_/g, '').replace(/_/g, ' ');
}

/**
 * Check if a question should get a summary
 */
function shouldSummarizeQuestion({ questionCode, sectionName, followupPackId }) {
  const config = QUESTION_SUMMARY_CONFIG;
  
  if (questionCode) {
    if (questionCode < config.minQuestionCode || questionCode > config.maxQuestionCode) {
      return false;
    }
  }
  
  if (sectionName && config.includedCategories.includes(sectionName)) {
    return true;
  }
  
  if (followupPackId && config.includedPacks.includes(followupPackId)) {
    return true;
  }
  
  return false;
}

/**
 * Get AI runtime config from GlobalSettings
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
 * Build question transcript context for LLM
 */
function buildQuestionContext(questionData) {
  const { questionCode, questionText, instances, aiExchanges } = questionData;
  
  let context = `Question ${questionCode}: "${questionText}"\n\n`;
  
  if (instances && instances.length > 0) {
    instances.forEach((instance, idx) => {
      context += `Instance ${idx + 1}:\n`;
      
      // Add deterministic follow-up answers
      if (instance.details && typeof instance.details === 'object') {
        Object.entries(instance.details).forEach(([key, value]) => {
          if (key === 'investigator_probing' || key === 'question_text_snapshot' || 
              key === 'facts' || key === 'unresolvedFields' || !value) return;
          
          const label = getFieldLabel(key);
          context += `  ${label}: ${value}\n`;
        });
      }
      
      // Add AI probing exchanges for this instance
      const instanceProbes = instance.aiExchanges || [];
      if (instanceProbes.length > 0) {
        context += `  AI Follow-Up Exchanges:\n`;
        instanceProbes.forEach((ex, exIdx) => {
          context += `    Q: ${ex.probing_question}\n`;
          context += `    A: ${ex.candidate_response}\n`;
        });
      }
      
      context += '\n';
    });
  }
  
  // Add any question-level AI probing (legacy format)
  if (aiExchanges && aiExchanges.length > 0) {
    context += `AI Probing Exchanges:\n`;
    aiExchanges.forEach((ex, idx) => {
      context += `  Q: ${ex.probing_question}\n`;
      context += `  A: ${ex.candidate_response}\n`;
    });
  }
  
  return context.trim();
}

/**
 * Generate Question-Level AI Summaries
 * 
 * Creates summaries for eligible questions (LE Apps, Driving, etc.)
 * based on the QUESTION_SUMMARY_CONFIG.
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
      console.error('[QUESTION_SUMMARIES] JSON_PARSE_ERROR', { error: parseErr.message });
      return Response.json({ ok: false, error: { message: 'Invalid JSON body' } }, { status: 400 });
    }
    
    sessionId = body?.sessionId || body?.session_id;
    const force = body?.force === true;
    
    console.log('[QUESTION_SUMMARIES] START', { sessionId, force });
    
    if (!sessionId) {
      return Response.json({ ok: false, error: { message: 'sessionId required' } }, { status: 400 });
    }
    
    // Fetch all required data
    let responses, followUps, questions, sections, globalSettingsResult, existingSummaries;
    try {
      [responses, followUps, questions, sections, globalSettingsResult, existingSummaries] = await Promise.all([
        base44.asServiceRole.entities.Response.filter({ session_id: sessionId }),
        base44.asServiceRole.entities.FollowUpResponse.filter({ session_id: sessionId }),
        base44.asServiceRole.entities.Question.list(),
        base44.asServiceRole.entities.Section.list(),
        base44.asServiceRole.entities.GlobalSettings.filter({ settings_id: 'global' }).catch(() => []),
        base44.asServiceRole.entities.QuestionSummary.filter({ session_id: sessionId })
      ]);
    } catch (fetchErr) {
      console.error('[QUESTION_SUMMARIES] FETCH_ERROR', { sessionId, error: fetchErr.message });
      return Response.json({ 
        ok: false, 
        error: { message: `Failed to fetch session data: ${fetchErr.message}` } 
      }, { status: 500 });
    }
    
    // Defensive: ensure arrays and unwrap nested data
    responses = Array.isArray(responses) ? responses : [];
    followUps = Array.isArray(followUps) ? followUps : [];
    questions = Array.isArray(questions) ? questions : [];
    sections = Array.isArray(sections) ? sections : [];
    existingSummaries = Array.isArray(existingSummaries) ? existingSummaries : [];
    
    // Unwrap nested data if needed (API sometimes returns { data: {...} })
    responses = responses.map(r => r.data || r);
    followUps = followUps.map(f => f.data || f);
    questions = questions.map(q => q.data || q);
    sections = sections.map(s => s.data || s);
    existingSummaries = existingSummaries.map(s => s.data || s);
    
    // Build existing summaries map for quick lookup
    const existingSummariesMap = {};
    existingSummaries.forEach(s => {
      if (s.question_id) {
        existingSummariesMap[s.question_id] = s;
      }
    });
    
    // Get AI config
    const globalSettings = globalSettingsResult?.length > 0 ? globalSettingsResult[0] : null;
    const aiConfig = getAiRuntimeConfig(globalSettings);
    
    console.log('[QUESTION_SUMMARIES] DATA_FETCHED', {
      sessionId,
      responsesCount: responses.length,
      followUpsCount: followUps.length,
      existingSummariesCount: existingSummaries.length,
      aiModel: aiConfig.model
    });
    
    // Build lookup maps for questions and sections
    // CRITICAL: Response.question_id is the Question entity's DATABASE ID, not the question_id field (Q001)
    // So we need to look up by entity.id, not entity.question_id
    const questionsById = {};
    questions.forEach(q => {
      // q.id is the database ID, q.question_id is the code like 'Q001'
      questionsById[q.id] = q;
    });
    
    const sectionsById = {};
    sections.forEach(s => {
      sectionsById[s.id] = s;
    });
    
    console.log('[QUESTION_SUMMARIES] LOOKUP_MAPS', {
      sessionId,
      questionCount: Object.keys(questionsById).length,
      sectionCount: Object.keys(sectionsById).length,
      sampleQuestionIds: Object.keys(questionsById).slice(0, 3),
      sampleQuestionCodes: questions.slice(0, 3).map(q => q.question_id)
    });
    
    // Build question data map with section info
    const questionDataMap = {};
    
    // Filter to Yes responses only
    const yesResponses = responses.filter(r => r.answer === 'Yes');
    
    console.log('[QUESTION_SUMMARIES] YES_RESPONSES', {
      sessionId,
      count: yesResponses.length,
      questionIds: yesResponses.map(r => r.question_id)
    });
    
    for (const response of yesResponses) {
      // Response.question_id is the Question entity's DATABASE ID
      const questionEntity = questionsById[response.question_id];
      
      if (!questionEntity) {
        console.log('[QUESTION_SUMMARIES] QUESTION_NOT_FOUND', {
          responseQuestionId: response.question_id,
          availableIds: Object.keys(questionsById).slice(0, 5)
        });
        continue;
      }
      
      const sectionEntity = sectionsById[questionEntity.section_id];
      const sectionName = sectionEntity?.section_name || response.category || '';
      const questionCode = questionEntity.question_id || ''; // This is 'Q001', 'Q015', etc.
      
      // Get related follow-ups to determine pack - also use response.followup_pack as fallback
      const relatedFollowUps = followUps.filter(f => f.response_id === response.id);
      const followupPackId = relatedFollowUps[0]?.followup_pack || response.followup_pack || '';
      
      console.log('[QUESTION_SUMMARIES] CHECKING_QUESTION', {
        responseId: response.id,
        questionDbId: response.question_id,
        questionCode,
        sectionName,
        followupPackId,
        hasFollowUps: relatedFollowUps.length > 0
      });
      
      // TEMPORARILY DISABLED: Allow all Yes responses to get summaries for debugging
      // if (!shouldSummarizeQuestion({ questionCode, sectionName, followupPackId })) {
      //   console.log('[QUESTION_SUMMARIES] SKIPPED_BY_CONFIG', { questionCode, sectionName, followupPackId });
      //   continue;
      // }
      console.log('[QUESTION_SUMMARIES] ALLOWING_QUESTION', { questionCode, sectionName, followupPackId });
      
      // Build instances from follow-ups
      const instancesMap = {};
      for (const fu of relatedFollowUps) {
        const instNum = fu.instance_number || 1;
        if (!instancesMap[instNum]) {
          instancesMap[instNum] = {
            instanceNumber: instNum,
            packId: fu.followup_pack,
            details: {},
            aiExchanges: []
          };
        }
        
        const details = fu.additional_details || {};
        Object.entries(details).forEach(([key, value]) => {
          if (key !== 'investigator_probing' && key !== 'question_text_snapshot' && 
              key !== 'facts' && key !== 'unresolvedFields' && value) {
            instancesMap[instNum].details[key] = value;
          }
        });
        
        if (details.investigator_probing && Array.isArray(details.investigator_probing)) {
          instancesMap[instNum].aiExchanges.push(...details.investigator_probing);
        }
      }
      
      // Use the Response's question_id (database ID) as the key - this is what SessionDetails uses
      questionDataMap[response.question_id] = {
        responseId: response.id,
        questionId: response.question_id, // Database ID of Question entity
        questionCode, // Human-readable code like 'Q001'
        questionText: response.question_text || questionEntity.question_text,
        sectionId: questionEntity.section_id,
        sectionName,
        followupPackId,
        instances: Object.values(instancesMap),
        aiExchanges: response.investigator_probing || []
      };
      
      console.log('[QUESTION_SUMMARIES] ADDED_TO_ELIGIBLE', {
        questionDbId: response.question_id,
        questionCode,
        instanceCount: Object.keys(instancesMap).length
      });
    }
    
    const eligibleQuestions = Object.values(questionDataMap);
    console.log('[QUESTION_SUMMARIES] ELIGIBLE_QUESTIONS', {
      sessionId,
      count: eligibleQuestions.length,
      questions: eligibleQuestions.map(q => ({ 
        questionId: q.questionId,
        questionCode: q.questionCode, 
        sectionName: q.sectionName,
        packId: q.followupPackId,
        instanceCount: q.instances.length
      }))
    });
    
    // Early return if no eligible questions
    if (eligibleQuestions.length === 0) {
      console.log('[QUESTION_SUMMARIES] NO_ELIGIBLE_QUESTIONS', { sessionId, yesResponseCount: yesResponses.length });
      return Response.json({
        ok: true,
        generatedCount: 0,
        skippedCount: 0,
        summaries: [],
        message: 'No eligible questions found'
      });
    }
    
    let generatedCount = 0;
    let skippedCount = 0;
    const summaries = [];
    
    // Generate summaries for each eligible question
    for (const questionData of eligibleQuestions) {
      const { questionId, questionCode, questionText, sectionId, instances } = questionData;
      
      // Check if summary already exists and we're not forcing regeneration
      const existing = existingSummariesMap[questionId];
      if (existing && !force) {
        console.log('[QUESTION_SUMMARIES] SKIPPING_EXISTING', { questionId, questionCode });
        skippedCount++;
        summaries.push({
          questionId,
          summaryText: existing.question_summary_text,
          status: 'existing'
        });
        continue;
      }
      
      // Build context for this question
      const contextText = buildQuestionContext(questionData);
      
      console.log('[QUESTION_SUMMARIES] BUILT_CONTEXT', {
        questionId,
        questionCode,
        contextLength: contextText.length,
        instanceCount: instances.length
      });
      
      // Build the prompt
      const prompt = `You are an AI investigator summarizing a single interview question.

Context:
- The candidate was answering question ${questionCode}: "${questionText}".
- Below are all follow-up questions, answers, and AI probing exchanges for this question.

Task:
- Write a short, objective summary (2-4 sentences) of what the candidate disclosed for this question.
- Focus on what happened, when, where, and any outcomes or concerns.
- Do NOT add speculation or advice.
- If there were multiple instances, clearly mention that there were multiple applications/incidents.
- NEVER mention "Pack", "PACK_LE_APPS", or any internal system terminology.
- Write as if telling another investigator what was disclosed.

Transcript:
${contextText}`;

      let summaryText = null;
      
      try {
        console.log('[QUESTION_SUMMARIES] LLM_CALL', { questionId, questionCode });
        
        const llmResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt,
          response_json_schema: {
            type: "object",
            properties: {
              summary: { type: "string" }
            }
          },
          model: aiConfig.model,
          temperature: aiConfig.temperature,
          max_tokens: aiConfig.max_tokens,
          top_p: aiConfig.top_p
        });
        
        summaryText = llmResult?.summary || null;
        
        console.log('[QUESTION_SUMMARIES] LLM_SUCCESS', {
          questionId,
          questionCode,
          summaryLength: summaryText?.length || 0
        });
        
      } catch (llmErr) {
        console.error('[QUESTION_SUMMARIES] LLM_ERROR', {
          questionId,
          questionCode,
          error: llmErr.message
        });
        // Still save a placeholder summary so we can see the row in DB
        summaryText = `AI summary unavailable (LLM error: ${llmErr.message?.substring(0, 50)})`;
      }
      
      // Save or update the summary
      if (summaryText) {
        try {
          if (existing) {
            await base44.asServiceRole.entities.QuestionSummary.update(existing.id, {
              question_summary_text: summaryText,
              generated_at: new Date().toISOString()
            });
          } else {
            console.log('[QUESTION_SUMMARIES] CREATING_NEW', {
              session_id: sessionId,
              section_id: sectionId,
              question_id: questionId,
              summaryPreview: summaryText?.substring(0, 80)
            });
            
            await base44.asServiceRole.entities.QuestionSummary.create({
              session_id: sessionId,
              section_id: sectionId,
              question_id: questionId,
              question_summary_text: summaryText,
              generated_at: new Date().toISOString()
            });
          }
          
          generatedCount++;
          summaries.push({
            questionId,
            summaryText,
            status: 'generated'
          });
          
          console.log('[QUESTION_SUMMARIES] UPSERTED', { questionId, questionCode, sessionId });
          
        } catch (saveErr) {
          console.error('[QUESTION_SUMMARIES] SAVE_ERROR', {
            questionId,
            questionCode,
            error: saveErr.message
          });
        }
      } else {
        skippedCount++;
        summaries.push({
          questionId,
          summaryText: null,
          status: 'error'
        });
      }
    }
    
    console.log('[QUESTION_SUMMARIES] DONE', {
      sessionId,
      generatedCount,
      skippedCount,
      totalEligible: eligibleQuestions.length
    });
    
    return Response.json({
      ok: true,
      generatedCount,
      skippedCount,
      summaries
    });
    
  } catch (error) {
    console.error('[QUESTION_SUMMARIES] ERROR', {
      sessionId,
      errorMessage: error.message,
      stack: error.stack?.substring?.(0, 500)
    });
    return Response.json({
      ok: false,
      error: { message: error.message || 'generateQuestionSummariesForSession failed' }
    }, { status: 500 });
  }
});