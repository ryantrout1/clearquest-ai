/**
 * V3 Transcript Logger
 * 
 * Utility for logging V3 probing messages to InterviewTranscript entity.
 * Provides consistent logging for AI prompts, candidate responses, and system events.
 */

import { base44 } from "@/api/base44Client";

/**
 * Log a transcript message for V3 probing
 * @param {object} params - Message parameters
 * @param {string} params.sessionId - Interview session ID
 * @param {string} params.incidentId - Incident ID (nullable)
 * @param {string} params.categoryId - Category ID (optional)
 * @param {"SYSTEM"|"AI"|"CANDIDATE"} params.role - Message role
 * @param {string} params.messageType - Type of message
 * @param {string} params.messageText - Message content
 * @param {number} params.probeCount - Current probe count (optional)
 * @param {object} params.metadata - Additional context (optional)
 * @returns {Promise<object|null>} Created transcript record or null on error
 */
export async function logV3TranscriptMessage({
  sessionId,
  incidentId = null,
  categoryId = null,
  role,
  messageType,
  messageText,
  probeCount = null,
  metadata = null
}) {
  if (!sessionId || !role || !messageText) {
    console.warn("[V3 TRANSCRIPT] Missing required fields", { sessionId, role, messageText: !!messageText });
    return null;
  }

  try {
    const record = await base44.entities.InterviewTranscript.create({
      session_id: sessionId,
      incident_id: incidentId,
      category_id: categoryId,
      role,
      message_type: messageType,
      message_text: messageText,
      probe_count: probeCount,
      metadata: metadata
    });
    
    console.log("[V3 TRANSCRIPT] Logged:", { role, messageType, incidentId });
    return record;
  } catch (err) {
    console.error("[V3 TRANSCRIPT] Error logging message:", err);
    return null;
  }
}

/**
 * Log AI opening prompt
 */
export async function logAIOpening(sessionId, incidentId, categoryId, promptText) {
  return logV3TranscriptMessage({
    sessionId,
    incidentId,
    categoryId,
    role: "AI",
    messageType: "OPENING",
    messageText: promptText,
    probeCount: 0
  });
}

/**
 * Log AI follow-up question
 */
export async function logAIFollowUp(sessionId, incidentId, categoryId, questionText, probeCount, fieldId = null) {
  return logV3TranscriptMessage({
    sessionId,
    incidentId,
    categoryId,
    role: "AI",
    messageType: "FOLLOWUP_QUESTION",
    messageText: questionText,
    probeCount,
    metadata: fieldId ? { field_id: fieldId } : null
  });
}

/**
 * Log candidate answer
 */
export async function logCandidateAnswer(sessionId, incidentId, categoryId, answerText, probeCount) {
  return logV3TranscriptMessage({
    sessionId,
    incidentId,
    categoryId,
    role: "CANDIDATE",
    messageType: "ANSWER",
    messageText: answerText,
    probeCount
  });
}

/**
 * Log AI recap/summary message
 */
export async function logAIRecap(sessionId, incidentId, categoryId, recapText) {
  return logV3TranscriptMessage({
    sessionId,
    incidentId,
    categoryId,
    role: "AI",
    messageType: "RECAP",
    messageText: recapText
  });
}

/**
 * Log system event: incident created
 */
export async function logIncidentCreated(sessionId, incidentId, categoryId) {
  return logV3TranscriptMessage({
    sessionId,
    incidentId,
    categoryId,
    role: "SYSTEM",
    messageType: "INCIDENT_CREATED",
    messageText: `V3 incident created for category: ${categoryId}`,
    probeCount: 0
  });
}

/**
 * Log system event: incident completed
 */
export async function logIncidentCompleted(sessionId, incidentId, categoryId, completionReason) {
  return logV3TranscriptMessage({
    sessionId,
    incidentId,
    categoryId,
    role: "SYSTEM",
    messageType: "INCIDENT_COMPLETED",
    messageText: `V3 probing completed: ${completionReason}`,
    metadata: { completion_reason: completionReason }
  });
}

/**
 * Log system event: probing stopped
 */
export async function logProbingStopped(sessionId, incidentId, categoryId, stopReason, probeCount) {
  return logV3TranscriptMessage({
    sessionId,
    incidentId,
    categoryId,
    role: "SYSTEM",
    messageType: "PROBING_STOPPED",
    messageText: `V3 probing stopped: ${stopReason}`,
    probeCount,
    metadata: { stop_reason: stopReason }
  });
}

/**
 * Fetch transcript for a session
 * @param {string} sessionId - Session ID
 * @param {string} incidentId - Optional incident filter
 * @returns {Promise<object[]>} Ordered array of transcript messages
 */
export async function getSessionTranscript(sessionId, incidentId = null) {
  try {
    const filter = { session_id: sessionId };
    if (incidentId) {
      filter.incident_id = incidentId;
    }
    
    const messages = await base44.entities.InterviewTranscript.filter(filter, 'created_date', 1000);
    
    // Sort by created_date ascending
    return messages.sort((a, b) => 
      new Date(a.created_date) - new Date(b.created_date)
    );
  } catch (err) {
    console.error("[V3 TRANSCRIPT] Error fetching transcript:", err);
    return [];
  }
}

export default {
  logV3TranscriptMessage,
  logAIOpening,
  logAIFollowUp,
  logCandidateAnswer,
  logAIRecap,
  logIncidentCreated,
  logIncidentCompleted,
  logProbingStopped,
  getSessionTranscript
};