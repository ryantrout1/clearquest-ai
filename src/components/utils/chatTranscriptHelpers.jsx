/**
 * Chat Transcript Helpers
 * 
 * Unified transcript append system for ChatGPT-style interview UI.
 * Maintains legal transcript integrity while supporting UI rendering.
 * 
 * CRITICAL RULES:
 * - Assistant messages: Append ONLY when they should appear in legal record
 * - User messages: Append immediately when submitted
 * - UI-only spinners: NEVER append to transcript
 * - Single source of truth: session.transcript_snapshot
 */

import { base44 } from "@/api/base44Client";

/**
 * Get next transcript index
 * Ensures monotonically increasing order
 */
function getNextIndex(existingTranscript = []) {
  if (!existingTranscript || existingTranscript.length === 0) return 1;
  const maxIndex = Math.max(...existingTranscript.map(e => e.index || 0), 0);
  return maxIndex + 1;
}

/**
 * Append assistant message to transcript
 * Use for: questions, system messages, AI prompts that should be in legal record
 * 
 * @param {string} sessionId
 * @param {Array} existingTranscript
 * @param {string} text - Message text
 * @param {object} metadata - Additional metadata (messageType, questionId, packId, etc.)
 * @returns {Promise<object>} Updated transcript
 */
export async function appendAssistantMessage(sessionId, existingTranscript = [], text, metadata = {}) {
  const entry = {
    index: getNextIndex(existingTranscript),
    role: "assistant",
    text,
    timestamp: new Date().toISOString(),
    visibleToCandidate: metadata.visibleToCandidate !== false, // Default true for assistant messages
    ...metadata
  };

  const updatedTranscript = [...existingTranscript, entry];

  try {
    await base44.entities.InterviewSession.update(sessionId, {
      transcript_snapshot: updatedTranscript
    });
    console.log("[TRANSCRIPT][APPEND] assistant", {
      index: entry.index,
      messageType: metadata.messageType || 'message',
      textPreview: text.substring(0, 60)
    });
    console.log("[TRANSCRIPT][APPEND_OK] newLength=", updatedTranscript.length, "lastIndex=", entry.index);
  } catch (err) {
    console.error("[TRANSCRIPT][ERROR]", err);
  }

  return updatedTranscript;
}

/**
 * Append user message to transcript
 * Use for: candidate answers
 * 
 * @param {string} sessionId
 * @param {Array} existingTranscript
 * @param {string} text - Answer text
 * @param {object} metadata - Additional metadata
 * @returns {Promise<object>} Updated transcript
 */
export async function appendUserMessage(sessionId, existingTranscript = [], text, metadata = {}) {
  const entry = {
    index: getNextIndex(existingTranscript),
    role: "user",
    text,
    timestamp: new Date().toISOString(),
    visibleToCandidate: true, // User messages always visible
    ...metadata
  };

  const updatedTranscript = [...existingTranscript, entry];

  try {
    await base44.entities.InterviewSession.update(sessionId, {
      transcript_snapshot: updatedTranscript
    });
    console.log("[TRANSCRIPT][APPEND] user", {
      index: entry.index,
      textPreview: text.substring(0, 60)
    });
    console.log("[TRANSCRIPT][APPEND_OK] newLength=", updatedTranscript.length, "lastIndex=", entry.index);
  } catch (err) {
    console.error("[TRANSCRIPT][ERROR]", err);
  }

  return updatedTranscript;
}

/**
 * Append welcome message (one-time, session start)
 */
export async function appendWelcomeMessage(sessionId, existingTranscript = []) {
  // Guard: Don't add welcome if already exists
  const hasWelcome = existingTranscript.some(e => e.messageType === 'WELCOME' || e.id === `welcome-${sessionId}`);
  if (hasWelcome) {
    console.log("[TRANSCRIPT][WELCOME] Already exists, skipping");
    return existingTranscript;
  }

  const welcomeText = `Welcome to your ClearQuest Interview. This interview is part of your application process. You'll be asked questions one at a time. Clear, complete, and honest answers help investigators understand the full picture. You can pause and come back — we'll pick up where you left off.`;

  const entry = {
    id: `welcome-${sessionId}`, // Deterministic ID
    index: getNextIndex(existingTranscript),
    role: "assistant",
    text: welcomeText,
    timestamp: new Date().toISOString(),
    messageType: 'WELCOME',
    visibleToCandidate: true,
    source: 'SYSTEM'
  };

  const updatedTranscript = [...existingTranscript, entry];
  
  try {
    await base44.entities.InterviewSession.update(sessionId, {
      transcript_snapshot: updatedTranscript
    });
    console.log("[TRANSCRIPT][WELCOME][ADD] Added welcome message to session");
  } catch (err) {
    console.error("[TRANSCRIPT][ERROR]", err);
  }

  return updatedTranscript;
}

/**
 * Append resume/return marker
 */
export async function appendResumeMarker(sessionId, existingTranscript = []) {
  const resumeCount = existingTranscript.filter(e => e.messageType === 'RESUME').length;
  const resumeId = `resume-${sessionId}-${resumeCount}`;
  
  // Guard: Don't duplicate if this exact resume marker already exists
  if (existingTranscript.some(e => e.id === resumeId)) {
    console.log("[TRANSCRIPT][RESUME] Marker already exists, skipping");
    return existingTranscript;
  }

  const resumeText = "Welcome back. Resuming where you left off.";

  const entry = {
    id: resumeId,
    index: getNextIndex(existingTranscript),
    role: "assistant",
    text: resumeText,
    timestamp: new Date().toISOString(),
    messageType: 'RESUME',
    visibleToCandidate: true,
    source: 'SYSTEM'
  };

  const updatedTranscript = [...existingTranscript, entry];
  
  try {
    await base44.entities.InterviewSession.update(sessionId, {
      transcript_snapshot: updatedTranscript
    });
    console.log("[TRANSCRIPT][RESUME][ADD] Added resume marker");
  } catch (err) {
    console.error("[TRANSCRIPT][ERROR]", err);
  }

  return updatedTranscript;
}

/**
 * Log system event (not visible to candidate)
 */
export async function logSystemEvent(sessionId, eventType, metadata = {}) {
  try {
    const session = await base44.entities.InterviewSession.get(sessionId);
    const existingTranscript = session.transcript_snapshot || [];
    
    const entry = {
      id: `sys-${eventType}-${Date.now()}`,
      index: getNextIndex(existingTranscript),
      role: "system",
      text: null,
      timestamp: new Date().toISOString(),
      messageType: 'SYSTEM_EVENT',
      eventType,
      visibleToCandidate: false,
      ...metadata
    };
    
    const updatedTranscript = [...existingTranscript, entry];
    
    await base44.entities.InterviewSession.update(sessionId, {
      transcript_snapshot: updatedTranscript
    });
    
    console.log(`[TRANSCRIPT][SYSTEM_EVENT] ${eventType}`, metadata);
    return updatedTranscript;
  } catch (err) {
    console.error('[TRANSCRIPT][SYSTEM_EVENT][ERROR]', err);
    return null;
  }
}