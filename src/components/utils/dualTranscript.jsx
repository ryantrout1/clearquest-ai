/**
 * Dual Transcript System for ClearQuest
 * 
 * Maintains two distinct but synchronized transcripts:
 * 1. Candidate Chat History (UI only) - what candidate saw
 * 2. SessionDetails Audit Transcript (full) - everything including system events
 * 
 * Contract: Every entry has visibleToCandidate flag
 */

import { base44 } from "@/api/base44Client";

let sequenceCounter = 0;

/**
 * Create a transcript event with standard structure
 * @param {Object} params
 * @param {string} params.sessionId
 * @param {string} params.eventType - QUESTION_SHOWN, ANSWER_SUBMITTED, MODE_ENTER, etc.
 * @param {boolean} params.visibleToCandidate - Is this visible in candidate chat history?
 * @param {string} params.role - "assistant" | "user" | "system"
 * @param {string} params.text - Display text (if applicable)
 * @param {Object} params.metadata - Additional context (ids, pack info, etc.)
 * @returns {Object} Transcript entry
 */
export function createTranscriptEvent({
  sessionId,
  eventType,
  visibleToCandidate = false,
  role = "system",
  text = null,
  metadata = {}
}) {
  const entry = {
    id: `transcript-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    sessionId,
    sequenceNumber: ++sequenceCounter,
    createdAt: new Date().toISOString(),
    createdAtServer: null, // Will be set by backend if applicable
    role,
    visibleToCandidate,
    eventType,
    text,
    metadata
  };
  
  return entry;
}

/**
 * Append Welcome message (only once, at session start)
 */
export function ensureWelcomeMessage(currentTranscript) {
  const hasWelcome = currentTranscript.some(t => 
    t.eventType === 'SYSTEM_WELCOME' || t.id === 'WELCOME'
  );
  
  if (hasWelcome) {
    console.log('[DUAL_TRANSCRIPT][WELCOME][SKIP_EXISTS]');
    return currentTranscript;
  }
  
  const welcomeEntry = {
    id: 'WELCOME',
    sessionId: currentTranscript[0]?.sessionId || null,
    sequenceNumber: 0,
    createdAt: new Date().toISOString(),
    createdAtServer: null,
    role: 'assistant',
    visibleToCandidate: true,
    eventType: 'SYSTEM_WELCOME',
    text: "Welcome to your ClearQuest Interview. This interview is part of your application process. You'll be asked questions one at a time. Clear, complete, and honest answers help investigators understand the full picture. You can pause and come back — we'll pick up where you left off.",
    metadata: {}
  };
  
  console.log('[DUAL_TRANSCRIPT][WELCOME][ADD]');
  return [welcomeEntry, ...currentTranscript];
}

/**
 * Append return marker when candidate resumes session
 */
export function appendReturnMarker(sessionId, currentTranscript) {
  const returnEntry = {
    id: `return-${Date.now()}`,
    sessionId,
    sequenceNumber: ++sequenceCounter,
    createdAt: new Date().toISOString(),
    createdAtServer: null,
    role: 'assistant',
    visibleToCandidate: true,
    eventType: 'SESSION_RESUMED_MARKER',
    text: "Welcome back. Resuming where you left off.",
    metadata: {}
  };
  
  console.log('[DUAL_TRANSCRIPT][RETURN_MARKER][ADD]');
  return [...currentTranscript, returnEntry];
}

/**
 * Filter transcript for candidate-visible items only
 */
export function getCandidateVisibleTranscript(fullTranscript) {
  return fullTranscript.filter(entry => 
    entry.visibleToCandidate === true && 
    (entry.role === 'assistant' || entry.role === 'user')
  );
}

/**
 * Preserve system messages during transcript operations
 */
export function preserveSystemMessages(oldTranscript, newTranscript) {
  const systemMessages = oldTranscript.filter(t => 
    t.role === 'system' || t.eventType === 'SYSTEM_WELCOME'
  );
  
  // Re-insert system messages at the top
  return [...systemMessages, ...newTranscript];
}

/**
 * Log session event (system-level, not visible to candidate)
 */
export async function logSystemEvent(sessionId, eventType, metadata = {}) {
  try {
    const session = await base44.entities.InterviewSession.get(sessionId);
    const currentTranscript = session.transcript_snapshot || [];
    
    const systemEntry = createTranscriptEvent({
      sessionId,
      eventType,
      visibleToCandidate: false,
      role: 'system',
      text: null,
      metadata
    });
    
    const updatedTranscript = [...currentTranscript, systemEntry];
    
    await base44.entities.InterviewSession.update(sessionId, {
      transcript_snapshot: updatedTranscript
    });
    
    console.log(`[DUAL_TRANSCRIPT][SYSTEM_EVENT] ${eventType}`, metadata);
    
    return updatedTranscript;
  } catch (err) {
    console.error('[DUAL_TRANSCRIPT][ERROR] Failed to log system event:', err);
    return null;
  }
}

/**
 * Append question shown to candidate (visible)
 */
export async function appendQuestionShown(sessionId, questionText, metadata = {}) {
  try {
    const session = await base44.entities.InterviewSession.get(sessionId);
    const currentTranscript = session.transcript_snapshot || [];
    
    const questionEntry = createTranscriptEvent({
      sessionId,
      eventType: 'QUESTION_SHOWN',
      visibleToCandidate: true,
      role: 'assistant',
      text: questionText,
      metadata
    });
    
    const updatedTranscript = [...currentTranscript, questionEntry];
    
    await base44.entities.InterviewSession.update(sessionId, {
      transcript_snapshot: updatedTranscript
    });
    
    console.log('[DUAL_TRANSCRIPT][QUESTION_SHOWN]', { 
      questionId: metadata.questionId,
      packId: metadata.packId,
      fieldKey: metadata.fieldKey
    });
    
    return updatedTranscript;
  } catch (err) {
    console.error('[DUAL_TRANSCRIPT][ERROR] Failed to append question:', err);
    return null;
  }
}

/**
 * Append answer submitted by candidate (visible)
 */
export async function appendAnswerSubmitted(sessionId, answerText, metadata = {}) {
  try {
    const session = await base44.entities.InterviewSession.get(sessionId);
    const currentTranscript = session.transcript_snapshot || [];
    
    const answerEntry = createTranscriptEvent({
      sessionId,
      eventType: 'ANSWER_SUBMITTED',
      visibleToCandidate: true,
      role: 'user',
      text: answerText,
      metadata
    });
    
    const updatedTranscript = [...currentTranscript, answerEntry];
    
    await base44.entities.InterviewSession.update(sessionId, {
      transcript_snapshot: updatedTranscript
    });
    
    console.log('[DUAL_TRANSCRIPT][ANSWER_SUBMITTED]', {
      questionId: metadata.questionId,
      packId: metadata.packId,
      fieldKey: metadata.fieldKey,
      answerLength: answerText?.length || 0
    });
    
    return updatedTranscript;
  } catch (err) {
    console.error('[DUAL_TRANSCRIPT][ERROR] Failed to append answer:', err);
    return null;
  }
}

/**
 * Helper: Rebuild candidate-visible transcript from full audit transcript
 * Ensures Welcome is preserved and transcript is never reset
 */
export function rebuildCandidateTranscript(fullTranscript) {
  // Ensure Welcome is at the top
  const withWelcome = ensureWelcomeMessage(fullTranscript);
  
  // Filter for candidate-visible items
  return getCandidateVisibleTranscript(withWelcome);
}