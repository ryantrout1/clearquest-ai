/**
 * Multi-Instance Follow-Up Manager
 * Handles looping through follow-up packs multiple times for questions with multi-instance enabled
 */

/**
 * Check if a question should trigger multi-instance behavior
 * @param {Object} question - Question entity
 * @param {string} answer - User's answer to the root question
 * @returns {boolean}
 */
export function shouldEnterMultiInstanceLoop(question, answer) {
  return (
    question.followup_multi_instance === true &&
    question.followup_pack &&
    question.response_type === 'yes_no' &&
    answer === 'Yes'
  );
}

/**
 * Get the multi-instance configuration for a question
 * @param {Object} question - Question entity
 * @returns {Object} - { enabled, maxInstances, customPrompt }
 */
export function getMultiInstanceConfig(question) {
  return {
    enabled: question.followup_multi_instance === true,
    maxInstances: question.max_instances_per_question || 5,
    customPrompt: question.multi_instance_prompt || "Do you have another instance we should discuss for this question?"
  };
}

/**
 * Determine if we should ask for another instance
 * @param {number} currentInstance - Current instance number (1-based)
 * @param {number} maxInstances - Maximum allowed instances
 * @returns {Object} - { shouldAsk, canContinue, limitReached }
 */
export function shouldAskForAnotherInstance(currentInstance, maxInstances) {
  const limitReached = currentInstance >= maxInstances;
  
  return {
    shouldAsk: !limitReached,
    canContinue: !limitReached,
    limitReached,
    limitMessage: limitReached 
      ? `For this interview, we can only record up to ${maxInstances} instances for this question. If there are more, please share the most significant ones.`
      : null
  };
}

/**
 * Get the next instance number
 * @param {number} currentInstance
 * @returns {number}
 */
export function getNextInstanceNumber(currentInstance) {
  return currentInstance + 1;
}

/**
 * Validate multi-instance loop state
 * @param {Object} state - Current multi-instance state
 * @returns {boolean}
 */
export function validateMultiInstanceState(state) {
  if (!state) return false;
  
  return (
    state.questionId &&
    state.packId &&
    typeof state.instanceNumber === 'number' &&
    state.instanceNumber >= 1 &&
    state.maxInstances >= 1
  );
}

/**
 * Create initial multi-instance state
 * @param {string} questionId
 * @param {string} packId
 * @param {number} maxInstances
 * @param {string} customPrompt
 * @returns {Object}
 */
export function createMultiInstanceState(questionId, packId, maxInstances, customPrompt) {
  return {
    questionId,
    packId,
    instanceNumber: 1,
    maxInstances,
    customPrompt,
    completedInstances: []
  };
}

/**
 * Record a completed instance
 * @param {Object} state - Current multi-instance state
 * @param {Array} followUpAnswers - Answers from this instance
 * @param {Array} probingExchanges - AI probing exchanges from this instance
 * @returns {Object} - Updated state
 */
export function recordCompletedInstance(state, followUpAnswers, probingExchanges = []) {
  return {
    ...state,
    completedInstances: [
      ...state.completedInstances,
      {
        instanceNumber: state.instanceNumber,
        followUpAnswers,
        probingExchanges,
        timestamp: new Date().toISOString()
      }
    ]
  };
}

/**
 * Prepare for next instance
 * @param {Object} state - Current multi-instance state
 * @returns {Object} - Updated state
 */
export function advanceToNextInstance(state) {
  return {
    ...state,
    instanceNumber: state.instanceNumber + 1
  };
}