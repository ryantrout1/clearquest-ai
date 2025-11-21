/**
 * Unified Transcript Builder
 * Builds chronologically ordered transcript events from database entities
 * Used by both CandidateInterview (chat history) and SessionDetails (views)
 */

/**
 * Build unified transcript events from database entities
 * Returns a chronologically sorted array of all interview interactions
 */
export async function buildTranscriptEventsForSession(sessionId, base44, engine) {
  try {
    // Fetch all data in parallel
    const [responses, followups, questions, followUpQuestionEntities] = await Promise.all([
      base44.entities.Response.filter({ session_id: sessionId }),
      base44.entities.FollowUpResponse.filter({ session_id: sessionId }),
      base44.entities.Question.filter({ active: true }),
      base44.entities.FollowUpQuestion.list()
    ]);

    const events = [];
    let eventCounter = 0;

    // Sort responses by timestamp
    const sortedResponses = responses.sort((a, b) => 
      new Date(a.response_timestamp) - new Date(b.response_timestamp)
    );

    // Process each response
    sortedResponses.forEach((response, responseIdx) => {
      const question = questions.find(q => q.id === response.question_id);
      const questionCode = question?.question_id || response.question_id;

      // Base question asked
      events.push({
        id: `evt_${sessionId}_${eventCounter++}`,
        sessionId,
        baseQuestionId: response.question_id,
        baseQuestionCode: questionCode,
        followupPackId: null,
        instanceNumber: null,
        role: "investigator",
        kind: "base_question",
        text: response.question_text,
        createdAt: new Date(response.response_timestamp).getTime() - 1000, // Question before answer
        sortKey: responseIdx * 1000
      });

      // Base answer
      events.push({
        id: `evt_${sessionId}_${eventCounter++}`,
        sessionId,
        baseQuestionId: response.question_id,
        baseQuestionCode: questionCode,
        followupPackId: null,
        instanceNumber: null,
        role: "candidate",
        kind: "base_answer",
        text: response.answer,
        createdAt: new Date(response.response_timestamp).getTime(),
        sortKey: responseIdx * 1000 + 1
      });

      // Get followups for this response
      const responseFollowups = followups.filter(f => f.response_id === response.id);
      
      // Group by instance_number
      const instanceGroups = {};
      responseFollowups.forEach(fu => {
        const instNum = fu.instance_number || 1;
        if (!instanceGroups[instNum]) instanceGroups[instNum] = [];
        instanceGroups[instNum].push(fu);
      });

      const instanceNumbers = Object.keys(instanceGroups).map(n => parseInt(n)).sort((a, b) => a - b);
      
      // Process each instance
      instanceNumbers.forEach((instanceNum, instanceIdx) => {
        const instanceFollowups = instanceGroups[instanceNum];
        const followup = instanceFollowups[0]; // All same instance
        const packId = followup.followup_pack;
        const details = followup.additional_details || {};

        let detailCounter = 0;

        // Multi-instance question (before instance starts)
        if (instanceIdx > 0) {
          events.push({
            id: `evt_${sessionId}_${eventCounter++}`,
            sessionId,
            baseQuestionId: response.question_id,
            baseQuestionCode: questionCode,
            followupPackId: packId,
            instanceNumber: instanceNum,
            role: "investigator",
            kind: "multi_instance_question",
            text: "Do you have another instance we should discuss for this question?",
            createdAt: new Date(followup.created_date || response.response_timestamp).getTime() + instanceIdx * 1000 - 100,
            sortKey: responseIdx * 10000 + 90 + instanceIdx * 500
          });

          // Multi-instance answer (Yes, to trigger this instance)
          events.push({
            id: `evt_${sessionId}_${eventCounter++}`,
            sessionId,
            baseQuestionId: response.question_id,
            baseQuestionCode: questionCode,
            followupPackId: packId,
            instanceNumber: instanceNum,
            role: "candidate",
            kind: "multi_instance_answer",
            text: "Yes",
            createdAt: new Date(followup.created_date || response.response_timestamp).getTime() + instanceIdx * 1000 - 50,
            sortKey: responseIdx * 10000 + 95 + instanceIdx * 500
          });
        }

        // Get follow-up questions for this pack and sort by display_order
        const packQuestions = followUpQuestionEntities
          .filter(q => q.followup_pack_id === packId)
          .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

        // Map detail keys to their display order
        const detailEntries = Object.entries(details)
          .filter(([key]) => key !== 'investigator_probing')
          .sort((a, b) => {
            const qA = packQuestions.find(q => q.followup_question_id === a[0]);
            const qB = packQuestions.find(q => q.followup_question_id === b[0]);
            const orderA = qA?.display_order || 9999;
            const orderB = qB?.display_order || 9999;
            return orderA - orderB;
          });

        // Deterministic follow-up Q&A pairs (should appear FIRST, in display_order)
        detailEntries.forEach(([key, value]) => {
            // Follow-up question
            events.push({
              id: `evt_${sessionId}_${eventCounter++}`,
              sessionId,
              baseQuestionId: response.question_id,
              baseQuestionCode: questionCode,
              followupPackId: packId,
              instanceNumber: instanceNum,
              role: "investigator",
              kind: "deterministic_followup_question",
              text: key, // Will be resolved to actual question text in UI
              fieldKey: key,
              createdAt: new Date(followup.created_date || response.response_timestamp).getTime() + instanceIdx * 1000 + detailCounter * 10,
              sortKey: responseIdx * 10000 + 100 + instanceIdx * 500 + detailCounter * 10
            });

            // Follow-up answer
            events.push({
              id: `evt_${sessionId}_${eventCounter++}`,
              sessionId,
              baseQuestionId: response.question_id,
              baseQuestionCode: questionCode,
              followupPackId: packId,
              instanceNumber: instanceNum,
              role: "candidate",
              kind: "deterministic_followup_answer",
              text: value,
              createdAt: new Date(followup.created_date || response.response_timestamp).getTime() + instanceIdx * 1000 + detailCounter * 10 + 1,
              sortKey: responseIdx * 10000 + 100 + instanceIdx * 500 + detailCounter * 10 + 1
            });

            detailCounter++;
          });

        // AI probing for this instance (should appear AFTER deterministic follow-ups)
        const probingExchanges = details.investigator_probing || [];
        probingExchanges.forEach((exchange, exIdx) => {
          // AI question - use higher sortKey to ensure it comes after all deterministic follow-ups
          events.push({
            id: `evt_${sessionId}_${eventCounter++}`,
            sessionId,
            baseQuestionId: response.question_id,
            baseQuestionCode: questionCode,
            followupPackId: packId,
            instanceNumber: instanceNum,
            role: "investigator",
            kind: "ai_probe_question",
            text: exchange.probing_question,
            createdAt: new Date(exchange.timestamp || followup.created_date).getTime() + instanceIdx * 1000 + 5000 + exIdx * 100,
            sortKey: responseIdx * 10000 + 100 + instanceIdx * 500 + 400 + exIdx * 10
          });

          // Candidate answer
          events.push({
            id: `evt_${sessionId}_${eventCounter++}`,
            sessionId,
            baseQuestionId: response.question_id,
            baseQuestionCode: questionCode,
            followupPackId: packId,
            instanceNumber: instanceNum,
            role: "candidate",
            kind: "ai_probe_answer",
            text: exchange.candidate_response,
            createdAt: new Date(exchange.timestamp || followup.created_date).getTime() + instanceIdx * 1000 + 5000 + exIdx * 100 + 1,
            sortKey: responseIdx * 10000 + 100 + instanceIdx * 500 + 400 + exIdx * 10 + 1
          });
        });
      });

      // Legacy: Single-instance probing on Response (if not in followup details)
      if (response.investigator_probing && response.investigator_probing.length > 0) {
        const hasInstanceProbing = instanceNumbers.some(num => 
          instanceGroups[num]?.[0]?.additional_details?.investigator_probing?.length > 0
        );
        
        if (!hasInstanceProbing) {
          response.investigator_probing.forEach((exchange, exIdx) => {
            events.push({
              id: `evt_${sessionId}_${eventCounter++}`,
              sessionId,
              baseQuestionId: response.question_id,
              baseQuestionCode: questionCode,
              followupPackId: response.followup_pack,
              instanceNumber: 1,
              role: "investigator",
              kind: "ai_probe_question",
              text: exchange.probing_question,
              createdAt: new Date(exchange.timestamp || response.response_timestamp).getTime() + 10000 + exIdx * 1000,
              sortKey: responseIdx * 10000 + 5000 + exIdx * 10
            });

            events.push({
              id: `evt_${sessionId}_${eventCounter++}`,
              sessionId,
              baseQuestionId: response.question_id,
              baseQuestionCode: questionCode,
              followupPackId: response.followup_pack,
              instanceNumber: 1,
              role: "candidate",
              kind: "ai_probe_answer",
              text: exchange.candidate_response,
              createdAt: new Date(exchange.timestamp || response.response_timestamp).getTime() + 10000 + exIdx * 1000 + 1,
              sortKey: responseIdx * 10000 + 5000 + exIdx * 10 + 1
            });
          });
        }
      }
    });

    // Sort by sortKey only for proper deterministic ordering
    events.sort((a, b) => a.sortKey - b.sortKey);

    console.log(`📋 Built ${events.length} transcript events for session ${sessionId}`);

    return events;
  } catch (err) {
    console.error('❌ Error building transcript events:', err);
    return [];
  }
}

/**
 * Group events by base question for structured view
 */
export function groupEventsByBaseQuestion(events) {
  const grouped = {};
  
  events.forEach(event => {
    const key = event.baseQuestionId || 'unknown';
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(event);
  });
  
  return grouped;
}

/**
 * Resolve follow-up question text from field key
 */
export function resolveFollowupQuestionText(fieldKey, packId, followUpQuestionEntities) {
  const packQuestions = followUpQuestionEntities.filter(
    q => q.followup_pack_id === packId
  );
  
  const match = packQuestions.find(q => q.followup_question_id === fieldKey);
  return match?.question_text || fieldKey;
}