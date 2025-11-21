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
    const [responses, followups, questions] = await Promise.all([
      base44.entities.Response.filter({ session_id: sessionId }),
      base44.entities.FollowUpResponse.filter({ session_id: sessionId }),
      base44.entities.Question.filter({ active: true })
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

        // Deterministic follow-up Q&A pairs (should appear FIRST)
        Object.entries(details)
          .filter(([key]) => key !== 'investigator_probing')
          .forEach(([key, value]) => {
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

    // Sort by createdAt, then by sortKey for deterministic ordering
    events.sort((a, b) => {
      if (a.createdAt !== b.createdAt) {
        return a.createdAt - b.createdAt;
      }
      return a.sortKey - b.sortKey;
    });

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