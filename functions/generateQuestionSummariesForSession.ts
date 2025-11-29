import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * AI Summary Configuration
 */
const QUESTION_SUMMARY_CONFIG = {
  includedCategories: [
    'Applications with other Law Enforcement Agencies',
    'Law Enforcement Applications',
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
  'PACK_LE_APPS_Q1': 'Agency',
  'PACK_LE_APPS_Q1764025170356': 'Position',
  'PACK_LE_APPS_Q1764025187292': 'Application Date',
  'PACK_LE_APPS_Q1764025199138': 'Outcome',
  'PACK_LE_APPS_Q1764025212764': 'Reason Not Selected',
  'PACK_LE_APPS_Q1764025246583': 'Issues/Concerns',
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

function getAiRuntimeConfig(globalSettings) {
  return {
    model: globalSettings?.ai_model || "gpt-4o-mini",
    temperature: globalSettings?.ai_temperature ?? 0.2,
    max_tokens: globalSettings?.ai_max_tokens ?? 512,
    top_p: globalSettings?.ai_top_p ?? 1,
  };
}

/**
 * Check if a question's follow-up instance is complete.
 * An instance is complete when all required fields have non-empty values.
 */
function isInstanceComplete(followUpResponse) {
  if (!followUpResponse) return false;
  
  const details = followUpResponse.additional_details || {};
  const completed = followUpResponse.completed === true;
  
  // If marked completed explicitly, trust that
  if (completed) return true;
  
  // Otherwise check if there are meaningful details
  const meaningfulFields = Object.entries(details).filter(([key, value]) => {
    if (!value) return false;
    if (key === 'investigator_probing') return false;
    if (key === 'question_text_snapshot') return false;
    if (key === 'facts') return false;
    if (key === 'unresolvedFields') return false;
    if (typeof value === 'object') return false;
    return String(value).trim().length > 0;
  });
  
  // Require at least 2 meaningful fields to consider complete
  return meaningfulFields.length >= 2;
}

/**
 * Check if a question is complete for summary generation.
 * A question is complete when:
 * 1. It has a Yes response
 * 2. All its follow-up instances are complete (or no follow-ups required)
 */
function isQuestionCompleteForSession(questionId, responseId, followUps) {
  const questionFollowUps = followUps.filter(f => f.response_id === responseId);
  
  // If no follow-ups, question is complete (simple Yes/No)
  if (questionFollowUps.length === 0) {
    return { complete: true, reason: 'no_followups' };
  }
  
  // Group by instance number
  const instanceMap = {};
  for (const fu of questionFollowUps) {
    const instNum = fu.instance_number || 1;
    if (!instanceMap[instNum]) {
      instanceMap[instNum] = [];
    }
    instanceMap[instNum].push(fu);
  }
  
  // Check each instance
  for (const [instNum, instanceFollowUps] of Object.entries(instanceMap)) {
    // Use the most recent follow-up for this instance
    const latestFu = instanceFollowUps.sort((a, b) => 
      new Date(b.updated_date || b.created_date) - new Date(a.updated_date || a.created_date)
    )[0];
    
    if (!isInstanceComplete(latestFu)) {
      return { 
        complete: false, 
        reason: `instance_${instNum}_incomplete`,
        packId: latestFu.followup_pack
      };
    }
  }
  
  return { complete: true, reason: 'all_instances_complete', instanceCount: Object.keys(instanceMap).length };
}

function buildQuestionContext(questionData) {
  const { questionCode, questionText, instances, aiExchanges } = questionData;
  
  let context = `Question ${questionCode}: "${questionText}"\n\n`;
  
  if (instances && instances.length > 0) {
    instances.forEach((instance, idx) => {
      context += `Instance ${idx + 1}:\n`;
      
      if (instance.details && typeof instance.details === 'object') {
        Object.entries(instance.details).forEach(([key, value]) => {
          if (key === 'investigator_probing' || key === 'question_text_snapshot' || 
              key === 'facts' || key === 'unresolvedFields' || !value) return;
          
          const label = getFieldLabel(key);
          context += `  ${label}: ${value}\n`;
        });
      }
      
      const instanceProbes = instance.aiExchanges || [];
      if (instanceProbes.length > 0) {
        context += `  AI Follow-Up Exchanges:\n`;
        instanceProbes.forEach((ex) => {
          context += `    Q: ${ex.probing_question}\n`;
          context += `    A: ${ex.candidate_response}\n`;
        });
      }
      
      context += '\n';
    });
  }
  
  if (aiExchanges && aiExchanges.length > 0) {
    context += `AI Probing Exchanges:\n`;
    aiExchanges.forEach((ex) => {
      context += `  Q: ${ex.probing_question}\n`;
      context += `  A: ${ex.candidate_response}\n`;
    });
  }
  
  return context.trim();
}

/**
 * Generate Question-Level AI Summaries (Incremental, Idempotent)
 * 
 * - Only creates summaries for COMPLETE questions
 * - Never updates existing summaries
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
    
    console.log('[QSUM] START', { sessionId });
    
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
      console.error('[QSUM] FETCH_ERROR', { sessionId, error: fetchErr.message });
      return Response.json({ ok: false, error: { message: `Failed to fetch: ${fetchErr.message}` } }, { status: 500 });
    }
    
    // Normalize arrays
    responses = (Array.isArray(responses) ? responses : []).map(r => r.data || r);
    followUps = (Array.isArray(followUps) ? followUps : []).map(f => f.data || f);
    questions = (Array.isArray(questions) ? questions : []).map(q => q.data || q);
    sections = (Array.isArray(sections) ? sections : []).map(s => s.data || s);
    existingSummaries = (Array.isArray(existingSummaries) ? existingSummaries : []).map(s => s.data || s);
    
    // Build existing summaries set for quick lookup
    const existingSummaryQuestionIds = new Set(existingSummaries.map(s => s.question_id).filter(Boolean));
    
    const globalSettings = globalSettingsResult?.length > 0 ? globalSettingsResult[0] : null;
    const aiConfig = getAiRuntimeConfig(globalSettings);
    
    console.log('[QSUM] DATA_FETCHED', {
      sessionId,
      responsesCount: responses.length,
      followUpsCount: followUps.length,
      existingSummariesCount: existingSummaries.length
    });
    
    // Build lookup maps
    const questionsById = {};
    questions.forEach(q => {
      const qId = q.id;
      if (qId) questionsById[qId] = q;
    });
    
    const sectionsById = {};
    sections.forEach(s => {
      const sId = s.id;
      if (sId) sectionsById[sId] = s;
    });
    
    // Filter to Yes responses only
    const yesResponses = responses.filter(r => r.answer === 'Yes');
    
    let createdCount = 0;
    let skippedExistsCount = 0;
    let skippedIncompleteCount = 0;
    const summaries = [];
    
    for (const response of yesResponses) {
      const questionId = response.question_id;
      const questionEntity = questionsById[questionId];
      
      if (!questionEntity) continue;
      
      // RULE 1: Skip if summary already exists (never overwrite)
      if (existingSummaryQuestionIds.has(questionId)) {
        console.log('[QSUM][SKIP-EXISTS]', { session: sessionId, question: questionId });
        skippedExistsCount++;
        continue;
      }
      
      // RULE 2: Check if question is complete
      const completionStatus = isQuestionCompleteForSession(questionId, response.id, followUps);
      if (!completionStatus.complete) {
        console.log('[QSUM][SKIP-INCOMPLETE]', { 
          session: sessionId, 
          question: questionId,
          reason: completionStatus.reason
        });
        skippedIncompleteCount++;
        continue;
      }
      
      const sectionEntity = sectionsById[questionEntity.section_id];
      const sectionName = sectionEntity?.section_name || response.category || '';
      const questionCode = questionEntity.question_id || '';
      
      // Get related follow-ups
      const relatedFollowUps = followUps.filter(f => f.response_id === response.id);
      const followupPackId = relatedFollowUps[0]?.followup_pack || '';
      
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
      
      const questionData = {
        questionId,
        questionCode,
        questionText: response.question_text || questionEntity.question_text,
        sectionId: sectionName,
        sectionName,
        followupPackId,
        instances: Object.values(instancesMap),
        aiExchanges: response.investigator_probing || []
      };
      
      // Build context and generate summary
      const contextText = buildQuestionContext(questionData);
      
      const prompt = `You are an AI investigator summarizing a single interview question.

Context:
- The candidate was answering question ${questionCode}: "${questionData.questionText}".
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
        
        summaryText = llmResult?.summary || null;
      } catch (llmErr) {
        console.error('[QSUM] LLM_ERROR', { question: questionId, error: llmErr.message });
        summaryText = `AI summary unavailable (LLM error)`;
      }
      
      if (summaryText) {
        try {
          // Double-check no existing summary (race condition guard)
          const existingCheck = await base44.asServiceRole.entities.QuestionSummary.filter({
            session_id: sessionId,
            question_id: questionId
          });
          
          if (existingCheck.length > 0) {
            console.log('[QSUM][SKIP-EXISTS]', { session: sessionId, question: questionId });
            skippedExistsCount++;
            continue;
          }
          
          // CREATE ONLY - never update
          await base44.asServiceRole.entities.QuestionSummary.create({
            session_id: sessionId,
            section_id: sectionName,
            question_id: questionId,
            question_summary_text: summaryText,
            generated_at: new Date().toISOString()
          });
          
          console.log('[QSUM][CREATE]', { session: sessionId, question: questionId });
          createdCount++;
          summaries.push({ questionId, summaryText, status: 'created' });
          
        } catch (saveErr) {
          console.error('[QSUM] SAVE_ERROR', { question: questionId, error: saveErr.message });
        }
      }
    }
    
    console.log('[QSUM] DONE', {
      sessionId,
      createdCount,
      skippedExistsCount,
      skippedIncompleteCount
    });
    
    return Response.json({
      ok: true,
      generatedCount: createdCount,
      skippedExistsCount,
      skippedIncompleteCount,
      summaries
    });
    
  } catch (error) {
    console.error('[QSUM] ERROR', { sessionId, error: error.message });
    return Response.json({
      ok: false,
      error: { message: error.message || 'generateQuestionSummariesForSession failed' }
    }, { status: 500 });
  }
});