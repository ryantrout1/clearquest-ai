/**
 * InteractionLogger - Centralized logging system for interview chat
 * Ensures append-only writes with monotonic ordering
 * NO OVERWRITES - each message is immutable
 */

import { base44 } from "@/api/base44Client";

/**
 * Get next order_index for a session
 */
async function getNextOrderIndex(sessionId) {
  try {
    const logs = await base44.entities.InteractionLog.filter(
      { session_id: sessionId },
      '-order_index', // Sort descending
      1 // Limit 1
    );
    
    if (logs.length === 0) {
      return 1;
    }
    
    return (logs[0].order_index || 0) + 1;
  } catch (err) {
    console.error('❌ Error getting next order index:', err);
    return Date.now(); // Fallback to timestamp
  }
}

/**
 * Log a main question being shown
 */
export async function logMainQuestion(sessionId, questionId, questionText, category) {
  if (!questionText?.trim()) return;
  
  try {
    const orderIndex = await getNextOrderIndex(sessionId);
    
    await base44.entities.InteractionLog.create({
      session_id: sessionId,
      section_id: category,
      question_id: questionId,
      sender_type: 'investigator',
      message_type: 'main_question',
      content: questionText,
      order_index: orderIndex,
      metadata: {
        question_id: questionId,
        category: category
      }
    });
    
    console.log(`✅ Logged main question ${questionId} at index ${orderIndex}`);
  } catch (err) {
    console.error('❌ Error logging main question:', err);
  }
}

/**
 * Log candidate's answer to main question
 */
export async function logMainAnswer(sessionId, questionId, answer, category) {
  if (!answer?.trim()) return;
  
  try {
    const orderIndex = await getNextOrderIndex(sessionId);
    
    await base44.entities.InteractionLog.create({
      session_id: sessionId,
      section_id: category,
      question_id: questionId,
      sender_type: 'candidate',
      message_type: 'main_question',
      content: answer,
      order_index: orderIndex,
      metadata: {
        question_id: questionId,
        is_answer: true
      }
    });
    
    console.log(`✅ Logged main answer for ${questionId} at index ${orderIndex}`);
  } catch (err) {
    console.error('❌ Error logging main answer:', err);
  }
}

/**
 * Log a deterministic follow-up question
 */
export async function logFollowUpQuestion(sessionId, questionId, packId, questionText, category, stepIndex) {
  if (!questionText?.trim()) return;
  
  try {
    const orderIndex = await getNextOrderIndex(sessionId);
    
    await base44.entities.InteractionLog.create({
      session_id: sessionId,
      section_id: category,
      question_id: questionId,
      followup_id: packId,
      sender_type: 'investigator',
      message_type: 'followup_question',
      content: questionText,
      order_index: orderIndex,
      metadata: {
        pack_id: packId,
        step_index: stepIndex,
        question_id: questionId
      }
    });
    
    console.log(`✅ Logged follow-up question ${packId}[${stepIndex}] at index ${orderIndex}`);
  } catch (err) {
    console.error('❌ Error logging follow-up question:', err);
  }
}

/**
 * Log candidate's answer to follow-up
 */
export async function logFollowUpAnswer(sessionId, questionId, packId, answer, category, stepIndex) {
  if (!answer?.trim()) return;
  
  try {
    const orderIndex = await getNextOrderIndex(sessionId);
    
    await base44.entities.InteractionLog.create({
      session_id: sessionId,
      section_id: category,
      question_id: questionId,
      followup_id: packId,
      sender_type: 'candidate',
      message_type: 'followup_answer',
      content: answer,
      order_index: orderIndex,
      metadata: {
        pack_id: packId,
        step_index: stepIndex,
        question_id: questionId
      }
    });
    
    console.log(`✅ Logged follow-up answer ${packId}[${stepIndex}] at index ${orderIndex}`);
  } catch (err) {
    console.error('❌ Error logging follow-up answer:', err);
  }
}

/**
 * Log AI probing question - NEW PROBE PACK ID FOR EACH QUESTION
 */
export async function logAIQuestion(sessionId, questionId, packId, aiProbePackId, questionText, category) {
  if (!questionText?.trim()) return;
  
  try {
    const orderIndex = await getNextOrderIndex(sessionId);
    
    await base44.entities.InteractionLog.create({
      session_id: sessionId,
      section_id: category,
      question_id: questionId,
      followup_id: packId,
      ai_probe_pack_id: aiProbePackId,
      sender_type: 'investigator',
      message_type: 'ai_question',
      content: questionText,
      order_index: orderIndex,
      metadata: {
        question_id: questionId,
        pack_id: packId,
        ai_probe_pack_id: aiProbePackId
      }
    });
    
    console.log(`✅ Logged AI question at index ${orderIndex} (probe pack: ${aiProbePackId})`);
  } catch (err) {
    console.error('❌ Error logging AI question:', err);
  }
}

/**
 * Log candidate's answer to AI probing
 */
export async function logAIAnswer(sessionId, questionId, packId, aiProbePackId, answer, category) {
  if (!answer?.trim()) return;
  
  try {
    const orderIndex = await getNextOrderIndex(sessionId);
    
    await base44.entities.InteractionLog.create({
      session_id: sessionId,
      section_id: category,
      question_id: questionId,
      followup_id: packId,
      ai_probe_pack_id: aiProbePackId,
      sender_type: 'candidate',
      message_type: 'ai_answer',
      content: answer,
      order_index: orderIndex,
      metadata: {
        question_id: questionId,
        pack_id: packId,
        ai_probe_pack_id: aiProbePackId
      }
    });
    
    console.log(`✅ Logged AI answer at index ${orderIndex} (probe pack: ${aiProbePackId})`);
  } catch (err) {
    console.error('❌ Error logging AI answer:', err);
  }
}

/**
 * Load entire chat history for a session (indexed query)
 */
export async function loadChatHistory(sessionId) {
  try {
    const logs = await base44.entities.InteractionLog.filter(
      { session_id: sessionId },
      'order_index', // Sort ascending by order
      1000 // Max limit
    );
    
    // Filter out any blank entries
    return logs.filter(log => log.content && log.content.trim().length > 0);
  } catch (err) {
    console.error('❌ Error loading chat history:', err);
    return [];
  }
}

/**
 * Generate unique AI probe pack ID
 */
export function generateAIProbePackId(questionId, packId) {
  return `AI-${questionId}-${packId}-${Date.now()}`;
}