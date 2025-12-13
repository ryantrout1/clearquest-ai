/**
 * Transcript Helper Functions
 * Provides render-point logging and system event audit helpers
 */

import { appendAssistantMessage, appendUserMessage, logSystemEvent } from "./chatTranscriptHelpers";
import { base44 } from "@/api/base44Client";

/**
 * Log question rendered to candidate
 * Call at exact moment question card renders
 */
export async function logQuestionShown({
  sessionId,
  questionId,
  questionText,
  questionNumber,
  sectionId,
  sectionName,
  responseId = null
}) {
  const existingTranscript = (await base44.entities.InterviewSession.get(sessionId)).transcript_snapshot || [];
  
  // Check for duplicate
  const hasExisting = existingTranscript.some(e => 
    e.id === `q-render-${sessionId}-${questionId}`
  );
  if (hasExisting) return existingTranscript;
  
  // Append as assistant message with UI data
  const updated = await appendAssistantMessage(sessionId, existingTranscript, questionText, {
    id: `q-render-${sessionId}-${questionId}`,
    messageType: 'QUESTION_SHOWN',
    uiVariant: 'QUESTION_CARD',
    title: `Question ${questionNumber}${sectionName ? ` • ${sectionName}` : ''}`,
    text: questionText,
    meta: {
      questionDbId: questionId,
      sectionId,
      sectionTitle: sectionName,
      questionNumber,
      responseId
    },
    visibleToCandidate: true
  });
  
  // Log system event
  await logSystemEvent(sessionId, 'QUESTION_SHOWN', {
    questionDbId: questionId,
    questionNumber,
    sectionId,
    responseId
  });
  
  return updated;
}

/**
 * Log section completion
 */
export async function logSectionComplete({
  sessionId,
  completedSectionId,
  completedSectionName,
  nextSectionId,
  nextSectionName,
  progress
}) {
  const existingTranscript = (await base44.entities.InterviewSession.get(sessionId)).transcript_snapshot || [];
  
  // Deterministic ID
  const sectionCompleteCount = existingTranscript.filter(e => e.messageType === 'SECTION_COMPLETE').length;
  const id = `section-complete-${sessionId}-${completedSectionId}-${sectionCompleteCount}`;
  
  // Check for duplicate
  if (existingTranscript.some(e => e.id === id)) {
    return existingTranscript;
  }
  
  const updated = await appendAssistantMessage(sessionId, existingTranscript, `Section complete: ${completedSectionName}`, {
    id,
    messageType: 'SECTION_COMPLETE',
    uiVariant: 'SECTION_COMPLETE_CARD',
    title: `Section Complete: ${completedSectionName}`,
    lines: [
      "Nice work — you've finished this section. Ready for the next one?",
      `Next up: ${nextSectionName}`
    ],
    meta: {
      completedSectionId,
      nextSectionId,
      progress
    },
    visibleToCandidate: true
  });
  
  // Log system event
  await logSystemEvent(sessionId, 'SECTION_COMPLETED', {
    completedSectionId,
    nextSectionId,
    questionsAnswered: progress?.answeredQuestions
  });
  
  return updated;
}

/**
 * Log V3 follow-up card shown
 */
export async function logFollowUpShown({
  sessionId,
  packId,
  questionText,
  exampleText,
  instanceNumber,
  categoryLabel
}) {
  const existingTranscript = (await base44.entities.InterviewSession.get(sessionId)).transcript_snapshot || [];
  
  const id = `followup-${sessionId}-${packId}-${instanceNumber}-${Date.now()}`;
  
  const updated = await appendAssistantMessage(sessionId, existingTranscript, questionText, {
    id,
    messageType: 'FOLLOWUP_SHOWN',
    uiVariant: 'FOLLOWUP_CARD',
    title: `Follow-up • ${categoryLabel}${instanceNumber > 1 ? ` — Instance ${instanceNumber}` : ''}`,
    text: questionText,
    example: exampleText || null,
    meta: {
      packId,
      instanceNumber
    },
    visibleToCandidate: true
  });
  
  // Log system event
  await logSystemEvent(sessionId, 'PACK_ENTERED', {
    packId,
    instanceNumber,
    isV3: true
  });
  
  return updated;
}