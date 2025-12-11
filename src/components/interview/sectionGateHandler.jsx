/**
 * Section Gate Handler - Applies control question gating logic
 * 
 * When a candidate answers "No" to a control question (gate), all remaining
 * questions in that section are skipped and the interview advances to the
 * next section.
 * 
 * CRITICAL: This uses database question.id for all routing, NOT question_code.
 */

/**
 * Normalize answer to Yes/No
 */
function normalizeAnswer(answer) {
  if (!answer) return null;
  
  const normalized = String(answer).trim().toLowerCase();
  
  // Check for explicit "No" answers
  if (normalized === 'no' || normalized === 'n' || normalized === 'choice_no' || answer === false) {
    return 'No';
  }
  
  // Check for explicit "Yes" answers
  if (normalized === 'yes' || normalized === 'y' || normalized === 'choice_yes' || answer === true) {
    return 'Yes';
  }
  
  // Ambiguous or text answer - return null (don't gate)
  return null;
}

/**
 * Apply section gate logic if current question is a control question
 * 
 * @param {Object} params
 * @param {string} params.sessionId - Current interview session ID
 * @param {Object} params.currentQuestion - Question object from engine.QById
 * @param {string} params.answer - Raw answer from candidate
 * @param {Object} params.engine - Interview engine state
 * @param {number} params.currentSectionIndex - Current section index in sections array
 * @param {Array} params.sections - Ordered sections array
 * @param {Set} params.answeredQuestionIds - Set of already-answered question IDs
 * 
 * @returns {Object|null} 
 *   - If gate triggered: { gateTriggered: true, nextSectionIndex, nextQuestionId, skippedQuestionIds }
 *   - If not a gate or answer is Yes: null
 */
export async function applySectionGateIfNeeded({
  sessionId,
  currentQuestion,
  answer,
  engine,
  currentSectionIndex,
  sections,
  answeredQuestionIds = new Set()
}) {
  // Validate inputs
  if (!currentQuestion || !engine || !sections || currentSectionIndex === undefined) {
    console.warn('[SECTION_GATE] Invalid inputs - skipping gate check');
    return null;
  }
  
  // Normalize answer to Yes/No
  const normalizedAnswer = normalizeAnswer(answer);
  
  // If answer is ambiguous (free text), don't apply gating
  if (!normalizedAnswer) {
    console.log('[SECTION_GATE] Answer is ambiguous - skipping gate check');
    return null;
  }
  
  // Check if this is a control question (gate)
  const isControlQuestion = currentQuestion.is_control_question === true;
  const isYesNoQuestion = currentQuestion.response_type === 'yes_no';
  
  if (!isControlQuestion) {
    // Not a gate question - no action needed
    return null;
  }
  
  if (!isYesNoQuestion) {
    console.warn('[SECTION_GATE] Control question is not yes_no type - skipping gate logic', {
      questionId: currentQuestion.id,
      questionCode: currentQuestion.question_id,
      responseType: currentQuestion.response_type
    });
    return null;
  }
  
  console.log('[SECTION_GATE] Control question detected', {
    questionId: currentQuestion.id,
    questionCode: currentQuestion.question_id,
    answer: normalizedAnswer,
    sectionIndex: currentSectionIndex
  });
  
  // If answer is "Yes", proceed normally (no gating)
  if (normalizedAnswer === 'Yes') {
    console.log('[SECTION_GATE] Answer is Yes - section continues normally');
    return null;
  }
  
  // Answer is "No" - apply section gate
  console.log('[SECTION_GATE] ========== GATE TRIGGERED: ANSWER IS NO ==========');
  
  const currentSection = sections[currentSectionIndex];
  if (!currentSection) {
    console.error('[SECTION_GATE] Current section not found');
    return null;
  }
  
  // Get all questions in current section
  const sectionQuestionIds = currentSection.questionIds || [];
  
  // Find remaining questions after current one
  const currentQuestionIndex = sectionQuestionIds.indexOf(currentQuestion.id);
  
  if (currentQuestionIndex === -1) {
    console.error('[SECTION_GATE] Current question not found in section', {
      currentQuestionId: currentQuestion.id,
      sectionQuestionIds
    });
    return null;
  }
  
  // Calculate which questions to skip (all after current)
  const remainingQuestions = sectionQuestionIds.slice(currentQuestionIndex + 1);
  const skippedQuestionIds = remainingQuestions.filter(qId => !answeredQuestionIds.has(qId));
  
  console.log('[SECTION_GATE] Skipping remaining questions in section', {
    sectionName: currentSection.displayName,
    totalInSection: sectionQuestionIds.length,
    currentIndex: currentQuestionIndex,
    remainingCount: remainingQuestions.length,
    skippedCount: skippedQuestionIds.length,
    skippedQuestionIds
  });
  
  // Find next section with unanswered questions
  let nextSectionIndex = null;
  let nextQuestionId = null;
  
  for (let idx = currentSectionIndex + 1; idx < sections.length; idx++) {
    const nextSection = sections[idx];
    
    if (!nextSection.active) {
      console.log(`[SECTION_GATE] Skipping section ${idx} - inactive`);
      continue;
    }
    
    const nextSectionQuestionIds = nextSection.questionIds || [];
    const firstUnanswered = nextSectionQuestionIds.find(qId => !answeredQuestionIds.has(qId));
    
    if (firstUnanswered) {
      nextSectionIndex = idx;
      nextQuestionId = firstUnanswered;
      
      console.log('[SECTION_GATE] Found next section with unanswered questions', {
        nextSectionIndex: idx,
        nextSectionName: nextSection.displayName,
        nextQuestionId,
        nextQuestionCode: engine.QuestionCodeById?.[firstUnanswered] || 'unknown'
      });
      
      break;
    }
  }
  
  // If no next section found, interview is complete
  if (!nextQuestionId) {
    console.log('[SECTION_GATE] No more sections - interview complete');
    return {
      gateTriggered: true,
      nextSectionIndex: null,
      nextQuestionId: null,
      skippedQuestionIds,
      interviewComplete: true
    };
  }
  
  console.log('[SECTION_GATE] Gate applied successfully', {
    currentSection: currentSection.displayName,
    skippedQuestionsCount: skippedQuestionIds.length,
    nextSectionIndex,
    nextSectionName: sections[nextSectionIndex]?.displayName
  });
  
  return {
    gateTriggered: true,
    nextSectionIndex,
    nextQuestionId,
    skippedQuestionIds,
    interviewComplete: false
  };
}