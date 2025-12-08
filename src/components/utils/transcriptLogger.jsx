/**
 * Canonical Transcript Logger
 * 
 * Append-only transcript system for legal interview records.
 * Captures exact question text and answer text as seen by the candidate.
 * 
 * RULES:
 * - One entry per question shown to candidate (role="question")
 * - One entry per answer submitted (role="answer")
 * - Entries are immutable once written
 * - Auto-skipped fields are NOT included in the legal transcript
 * - Text must be EXACT as displayed to candidate (no paraphrasing)
 */

import { base44 } from "@/api/base44Client";

/**
 * Get the next transcript index for a session
 * @param {string} sessionId 
 * @param {Array} existingTranscript 
 * @returns {number}
 */
function getNextTranscriptIndex(sessionId, existingTranscript = []) {
  if (!existingTranscript || existingTranscript.length === 0) {
    return 1;
  }
  const maxIndex = Math.max(...existingTranscript.map(e => e.index || 0));
  return maxIndex + 1;
}

/**
 * Append a question entry to the transcript
 * @param {Object} params
 * @param {string} params.sessionId
 * @param {Array} params.existingTranscript
 * @param {string} params.text - EXACT question text shown to candidate
 * @param {string} params.questionId - DB question.id (for section questions)
 * @param {string} params.packId - For V2 pack fields
 * @param {string} params.fieldKey - For V2 pack fields
 * @param {number} params.instanceNumber - For multi-instance packs
 * @returns {Object} New transcript entry
 */
export async function appendQuestionEntry({
  sessionId,
  existingTranscript = [],
  text,
  questionId = null,
  packId = null,
  fieldKey = null,
  instanceNumber = null
}) {
  const entry = {
    sessionId,
    index: getNextTranscriptIndex(sessionId, existingTranscript),
    createdAt: new Date().toISOString(),
    role: "question",
    questionId,
    packId,
    fieldKey,
    instanceNumber,
    text
  };

  console.log("[TRANSCRIPT][APPEND]", {
    sessionId,
    index: entry.index,
    role: "question",
    packId,
    fieldKey,
    text: text.slice(0, 80)
  });

  // Append to session's transcript array
  const updatedTranscript = [...existingTranscript, entry];
  
  try {
    await base44.entities.InterviewSession.update(sessionId, {
      transcript_snapshot: updatedTranscript
    });
  } catch (err) {
    console.error("[TRANSCRIPT][ERROR] Failed to append question entry:", err);
  }

  return entry;
}

/**
 * Append an answer entry to the transcript
 * @param {Object} params
 * @param {string} params.sessionId
 * @param {Array} params.existingTranscript
 * @param {string} params.text - EXACT answer text/label as seen by candidate
 * @param {string} params.questionId - DB question.id (for section questions)
 * @param {string} params.packId - For V2 pack fields
 * @param {string} params.fieldKey - For V2 pack fields
 * @param {number} params.instanceNumber - For multi-instance packs
 * @returns {Object} New transcript entry
 */
export async function appendAnswerEntry({
  sessionId,
  existingTranscript = [],
  text,
  questionId = null,
  packId = null,
  fieldKey = null,
  instanceNumber = null
}) {
  const entry = {
    sessionId,
    index: getNextTranscriptIndex(sessionId, existingTranscript),
    createdAt: new Date().toISOString(),
    role: "answer",
    questionId,
    packId,
    fieldKey,
    instanceNumber,
    text
  };

  console.log("[TRANSCRIPT][APPEND]", {
    sessionId,
    index: entry.index,
    role: "answer",
    packId,
    fieldKey,
    text: text.slice(0, 80)
  });

  // Append to session's transcript array
  const updatedTranscript = [...existingTranscript, entry];
  
  try {
    await base44.entities.InterviewSession.update(sessionId, {
      transcript_snapshot: updatedTranscript
    });
  } catch (err) {
    console.error("[TRANSCRIPT][ERROR] Failed to append answer entry:", err);
  }

  return entry;
}

/**
 * Check if a question has already been logged in the transcript
 * (to avoid duplicates on re-renders)
 * @param {Array} transcript
 * @param {Object} identifiers
 * @returns {boolean}
 */
export function hasQuestionBeenLogged(transcript = [], { questionId, packId, fieldKey, instanceNumber }) {
  if (!transcript || transcript.length === 0) return false;

  return transcript.some(entry => {
    if (entry.role !== "question") return false;
    
    // Section question match
    if (questionId && entry.questionId === questionId && !entry.packId) {
      return true;
    }
    
    // V2 pack field match
    if (packId && fieldKey) {
      return (
        entry.packId === packId &&
        entry.fieldKey === fieldKey &&
        entry.instanceNumber === instanceNumber
      );
    }
    
    return false;
  });
}

/**
 * Get the canonical transcript for a session
 * @param {string} sessionId
 * @returns {Promise<Array>} Transcript entries sorted by index
 */
export async function getSessionTranscript(sessionId) {
  try {
    const session = await base44.entities.InterviewSession.filter({ id: sessionId });
    if (!session || session.length === 0) return [];
    
    const transcript = session[0].transcript_snapshot || [];
    
    // Ensure sorted by index
    return transcript.sort((a, b) => (a.index || 0) - (b.index || 0));
  } catch (err) {
    console.error("[TRANSCRIPT][ERROR] Failed to fetch transcript:", err);
    return [];
  }
}

/**
 * Group transcript entries into Q→A pairs for rendering
 * @param {Array} transcript
 * @returns {Array} Pairs of {question, answers[]}
 */
export function groupTranscriptIntoPairs(transcript = []) {
  const pairs = [];
  let currentQuestion = null;

  for (const entry of transcript) {
    if (entry.role === "question") {
      currentQuestion = { question: entry, answers: [] };
      pairs.push(currentQuestion);
    } else if (entry.role === "answer" && currentQuestion) {
      currentQuestion.answers.push(entry);
    }
  }

  return pairs;
}