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
 * @param {string} text - Message text (fallback if uiVariant not used)
 * @param {object} metadata - Additional metadata
 *   - messageType: type of message (WELCOME, QUESTION_SHOWN, SECTION_COMPLETE, etc.)
 *   - uiVariant: UI card variant (WELCOME_CARD, QUESTION_CARD, FOLLOWUP_CARD, SECTION_COMPLETE_CARD, etc.)
 *   - title: optional card title
 *   - lines: optional array of bullet/line strings
 *   - example: optional example text
 *   - meta: optional { sectionId, sectionTitle, questionDbId, questionCode, packId, instanceNumber }
 *   - visibleToCandidate: explicit override (required - no defaults)
 * @returns {Promise<object>} Updated transcript
 */
export async function appendAssistantMessage(sessionId, existingTranscript = [], text, metadata = {}) {
  // CRITICAL: visibleToCandidate must be explicitly set - no defaults
  if (metadata.visibleToCandidate === undefined) {
    throw new Error('[TRANSCRIPT] visibleToCandidate must be explicitly set for all assistant messages');
  }
  
  const entry = {
    index: getNextIndex(existingTranscript),
    role: "assistant",
    text,
    timestamp: new Date().toISOString(),
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

  const entry = {
    id: `welcome-${sessionId}`, // Deterministic ID
    index: getNextIndex(existingTranscript),
    role: "assistant",
    text: "Welcome to your ClearQuest Interview", // Fallback text
    timestamp: new Date().toISOString(),
    messageType: 'WELCOME',
    uiVariant: 'WELCOME_CARD',
    title: "Welcome to your ClearQuest Interview",
    lines: [
      "This interview is part of your application process.",
      "One question at a time, at your own pace.",
      "Clear, complete, and honest answers help investigators understand the full picture.",
      "You can pause and come back — we'll pick up where you left off."
    ],
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
export async function appendResumeMarker(sessionId, existingTranscript = [], sessionData = {}) {
  const resumeCount = existingTranscript.filter(e => e.messageType === 'RESUME').length;
  const resumeId = `resume-${sessionId}-${resumeCount}`;
  
  // Guard: Don't duplicate if this exact resume marker already exists
  if (existingTranscript.some(e => e.id === resumeId)) {
    console.log("[TRANSCRIPT][RESUME] Marker already exists, skipping");
    return existingTranscript;
  }

  const entry = {
    id: resumeId,
    index: getNextIndex(existingTranscript),
    role: "assistant",
    text: "Welcome back. Resuming where you left off.",
    timestamp: new Date().toISOString(),
    messageType: 'RESUME',
    uiVariant: 'RESUME_BANNER',
    visibleToCandidate: true,
    source: 'SYSTEM'
  };

  const updatedTranscript = [...existingTranscript, entry];
  
  try {
    await base44.entities.InterviewSession.update(sessionId, {
      transcript_snapshot: updatedTranscript
    });
    console.log("[TRANSCRIPT][RESUME][ADD] Added resume marker");
    
    // Log audit event with session position
    await logSystemEvent(sessionId, 'SESSION_RESUMED', {
      resumeCount: resumeCount + 1,
      lastSectionId: sessionData.current_category || null,
      lastQuestionId: sessionData.current_question_id || null,
      questionsAnswered: sessionData.total_questions_answered || 0
    });
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

/**
 * Log question shown to candidate (at render time)
 */
export async function logQuestionShown(sessionId, { questionId, questionText, questionNumber, sectionId, sectionName, responseId = null }) {
  const session = await base44.entities.InterviewSession.get(sessionId);
  const existingTranscript = session.transcript_snapshot || [];
  
  const renderCount = existingTranscript.filter(e => e.messageType === 'QUESTION_SHOWN' && e.meta?.questionDbId === questionId).length;
  const id = `q-render-${sessionId}-${questionId}-${renderCount}`;
  
  if (existingTranscript.some(e => e.id === id)) return existingTranscript;
  
  const updated = await appendAssistantMessage(sessionId, existingTranscript, questionText, {
    id,
    messageType: 'QUESTION_SHOWN',
    uiVariant: 'QUESTION_CARD',
    title: `Question ${questionNumber}${sectionName ? ` • ${sectionName}` : ''}`,
    meta: { questionDbId: questionId, sectionId, sectionTitle: sectionName, questionNumber, responseId },
    visibleToCandidate: true
  });
  
  await logSystemEvent(sessionId, 'QUESTION_SHOWN', { questionDbId: questionId, questionNumber, sectionId, responseId });
  return updated;
}

/**
 * Log section completion shown to candidate
 */
export async function logSectionComplete(sessionId, { completedSectionId, completedSectionName, nextSectionId, nextSectionName, progress }) {
  const session = await base44.entities.InterviewSession.get(sessionId);
  const existingTranscript = session.transcript_snapshot || [];
  
  const sectionCompleteCount = existingTranscript.filter(e => e.messageType === 'SECTION_COMPLETE' && e.meta?.completedSectionId === completedSectionId).length;
  const id = `section-complete-${sessionId}-${completedSectionId}-${sectionCompleteCount}`;
  
  if (existingTranscript.some(e => e.id === id)) return existingTranscript;
  
  const updated = await appendAssistantMessage(sessionId, existingTranscript, `Section complete: ${completedSectionName}`, {
    id,
    messageType: 'SECTION_COMPLETE',
    uiVariant: 'SECTION_COMPLETE_CARD',
    title: `Section Complete: ${completedSectionName}`,
    lines: [
      "Nice work — you've finished this section. Ready for the next one?",
      `Next up: ${nextSectionName}`
    ],
    meta: { completedSectionId, nextSectionId, progress },
    visibleToCandidate: true
  });
  
  await logSystemEvent(sessionId, 'SECTION_COMPLETED', { completedSectionId, nextSectionId, questionsAnswered: progress?.answeredQuestions });
  return updated;
}

/**
 * Log answer submitted (audit only)
 */
export async function logAnswerSubmitted(sessionId, { questionDbId, responseId, packId = null }) {
  await logSystemEvent(sessionId, 'ANSWER_SUBMITTED', { questionDbId, responseId, packId });
}

/**
 * Log pack entered/exited (audit only)
 */
export async function logPackEntered(sessionId, { packId, instanceNumber, isV3 }) {
  await logSystemEvent(sessionId, 'PACK_ENTERED', { packId, instanceNumber, isV3 });
}

export async function logPackExited(sessionId, { packId, instanceNumber }) {
  await logSystemEvent(sessionId, 'PACK_EXITED', { packId, instanceNumber });
}

/**
 * Log AI probing calls (audit only, no PII)
 */
export async function logAiProbingCall(sessionId, { packId, fieldKey, probeCount }) {
  await logSystemEvent(sessionId, 'AI_PROBING_CALLED', { packId, fieldKey, probeCount });
}

export async function logAiProbingResponse(sessionId, { packId, fieldKey, probeCount, hasQuestion }) {
  await logSystemEvent(sessionId, 'AI_PROBING_RESPONSE', { packId, fieldKey, probeCount, hasQuestion });
}

/**
 * Log section started (audit only)
 */
export async function logSectionStarted(sessionId, { sectionId, sectionName }) {
  await logSystemEvent(sessionId, 'SECTION_STARTED', { sectionId, sectionName });
}

/**
 * QA Self-Check: Verify transcript integrity (dev only)
 */
if (typeof window !== 'undefined') {
  window.__cqAuditCheck = async (sessionId) => {
    try {
      const session = await base44.entities.InterviewSession.get(sessionId);
      const transcript = session.transcript_snapshot || [];
      
      const checks = {
        welcomeCount: transcript.filter(e => e.messageType === 'WELCOME').length,
        resumeCount: transcript.filter(e => e.messageType === 'RESUME').length,
        duplicateIds: [],
        candidateVisible: transcript.filter(e => e.visibleToCandidate === true).length,
        auditOnly: transcript.filter(e => e.visibleToCandidate === false).length
      };
      
      // Check for duplicate IDs
      const ids = transcript.filter(e => e.id).map(e => e.id);
      const uniqueIds = new Set(ids);
      if (ids.length !== uniqueIds.size) {
        const seen = new Set();
        ids.forEach(id => {
          if (seen.has(id)) checks.duplicateIds.push(id);
          seen.add(id);
        });
      }
      
      console.log('=== ClearQuest Transcript Audit ===');
      console.log(`Session: ${sessionId}`);
      console.log(`Total entries: ${transcript.length}`);
      console.log(`Candidate-visible: ${checks.candidateVisible}`);
      console.log(`Audit-only: ${checks.auditOnly}`);
      console.log(`Welcome messages: ${checks.welcomeCount} ${checks.welcomeCount === 1 ? '✓' : '✗ FAIL'}`);
      console.log(`Resume markers: ${checks.resumeCount}`);
      console.log(`Duplicate IDs: ${checks.duplicateIds.length === 0 ? 'None ✓' : checks.duplicateIds.join(', ') + ' ✗ FAIL'}`);
      
      const passed = checks.welcomeCount === 1 && checks.duplicateIds.length === 0;
      console.log(`\nOverall: ${passed ? '✓ PASS' : '✗ FAIL'}`);
      
      return { passed, checks, transcript };
    } catch (err) {
      console.error('[AUDIT] Failed:', err);
      return { passed: false, error: err.message };
    }
  };
}