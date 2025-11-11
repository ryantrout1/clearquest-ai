/**
 * ClearQuest Interview Engine
 * Deterministic, zero-AI question routing with precomputed lookups
 * Optimized for speed and minimal credit usage
 */

// ============================================================================
// A) DATA LOADING & CACHING
// ============================================================================

let BOOTSTRAP_CACHE = null;
let BOOTSTRAP_TIMESTAMP = null;

/**
 * Parse CSV-like data from entity arrays
 * Questions come from database but we index them like CSVs for speed
 */
export function parseQuestionsToMaps(questions) {
  const QById = {};
  const NextById = {};
  const ActiveOrdered = [];
  const MatrixYesByQ = {};

  // Sort by display_order first
  const sorted = [...questions].sort((a, b) => a.display_order - b.display_order);

  sorted.forEach((q, index) => {
    if (!q.active) return;

    QById[q.question_id] = q;
    ActiveOrdered.push(q.question_id);

    // Build next pointer
    if (q.next_question_id) {
      NextById[q.question_id] = q.next_question_id;
    } else if (index + 1 < sorted.length) {
      // Auto-link to next active question
      const nextActive = sorted.slice(index + 1).find(nq => nq.active);
      if (nextActive) {
        NextById[q.question_id] = nextActive.question_id;
      }
    }

    // Matrix: Yes triggers
    if (q.followup_pack && q.response_type === 'yes_no') {
      MatrixYesByQ[q.question_id] = q.followup_pack;
    }
  });

  return { QById, NextById, ActiveOrdered, MatrixYesByQ };
}

/**
 * Parse follow-up packs (placeholder - will load from DB)
 */
export function parseFollowUpPacks(packs) {
  const PackStepsById = {};

  // Group by pack name, sort by order
  packs.forEach(pack => {
    if (!PackStepsById[pack.pack_name]) {
      PackStepsById[pack.pack_name] = [];
    }
    PackStepsById[pack.pack_name].push(pack);
  });

  // Sort each pack's steps
  Object.keys(PackStepsById).forEach(packName => {
    PackStepsById[packName].sort((a, b) => a.step_order - b.step_order);
  });

  return { PackStepsById };
}

/**
 * Build Q113 option map (multi-select drug question)
 */
export function parseQ113Options(options) {
  const Q113OptionMap = {};

  options.forEach(opt => {
    Q113OptionMap[opt.option_id] = {
      packId: opt.followup_pack,
      substanceLabel: opt.option_label
    };
  });

  return { Q113OptionMap };
}

/**
 * Bootstrap engine once - load all data into memory
 */
export async function bootstrapEngine(base44) {
  // Return cached data if already bootstrapped
  if (BOOTSTRAP_CACHE && Date.now() - BOOTSTRAP_TIMESTAMP < 3600000) {
    console.log('✅ Using cached bootstrap data');
    return BOOTSTRAP_CACHE;
  }

  console.log('🚀 Bootstrapping interview engine...');
  const startTime = performance.now();

  // Load all data in parallel
  const [questions, categories] = await Promise.all([
    base44.entities.Question.filter({ active: true }),
    base44.entities.Category.filter({ active: true })
  ]);

  // Parse into fast lookup structures
  const { QById, NextById, ActiveOrdered, MatrixYesByQ } = parseQuestionsToMaps(questions);
  
  // Placeholder for follow-up packs (will implement later)
  const PackStepsById = {};
  const Q113OptionMap = {};

  const engineState = {
    QById,
    NextById,
    ActiveOrdered,
    MatrixYesByQ,
    PackStepsById,
    Q113OptionMap,
    Categories: categories,
    Bootstrapped: true,
    TotalQuestions: ActiveOrdered.length
  };

  BOOTSTRAP_CACHE = engineState;
  BOOTSTRAP_TIMESTAMP = Date.now();

  const elapsed = performance.now() - startTime;
  console.log(`✅ Engine bootstrapped in ${elapsed.toFixed(2)}ms`);
  console.log(`📊 Loaded ${ActiveOrdered.length} questions, ${Object.keys(MatrixYesByQ).length} follow-up triggers`);

  return engineState;
}

// ============================================================================
// B) QUESTION ROUTING LOGIC
// ============================================================================

/**
 * Compute next question ID deterministically
 */
export function computeNextQuestionId(engine, currentQuestionId, answer) {
  const { NextById, ActiveOrdered } = engine;

  // Check explicit next pointer first
  if (NextById[currentQuestionId]) {
    return NextById[currentQuestionId];
  }

  // Otherwise, get next in sequence
  const currentIndex = ActiveOrdered.indexOf(currentQuestionId);
  if (currentIndex >= 0 && currentIndex < ActiveOrdered.length - 1) {
    return ActiveOrdered[currentIndex + 1];
  }

  // End of interview
  return null;
}

/**
 * Check if answer triggers follow-up
 */
export function checkFollowUpTrigger(engine, questionId, answer) {
  const { MatrixYesByQ, QById } = engine;
  const question = QById[questionId];

  if (!question) return null;

  // Yes/No questions
  if (question.response_type === 'yes_no' && answer === 'Yes') {
    return MatrixYesByQ[questionId] || null;
  }

  // Multi-select (Q113)
  if (question.response_type === 'multi_select' && Array.isArray(answer)) {
    const triggers = [];
    answer.forEach(optionId => {
      const mapping = engine.Q113OptionMap[optionId];
      if (mapping && mapping.packId) {
        triggers.push({
          packId: mapping.packId,
          vars: { Substance: mapping.substanceLabel }
        });
      }
    });
    return triggers.length > 0 ? triggers : null;
  }

  return null;
}

// ============================================================================
// C) STATE MANAGEMENT (IMMUTABLE UPDATES)
// ============================================================================

/**
 * Create initial interview state
 */
export function createInitialState(engine) {
  return {
    // Engine data (immutable)
    engine,

    // Interview state
    currentMode: 'QUESTION', // QUESTION | FOLLOWUP | COMPLETE
    currentQuestionId: engine.ActiveOrdered[0] || null,
    currentPack: null,
    currentPackIndex: 0,
    currentIncidentIndex: 0,

    // User data
    answers: {}, // { questionId: answer }
    incidents: {}, // { packId: [{ field1: val, field2: val }] }
    followUpQueue: [], // [{ packId, vars }]

    // Transcript
    transcript: [], // [{ type, content, timestamp }]

    // Flags
    isCommitting: false,
    isComplete: false,

    // Progress
    questionsAnswered: 0,
    totalQuestions: engine.TotalQuestions
  };
}

/**
 * Batch state update helper
 */
export function batchUpdate(state, updates) {
  return { ...state, ...updates };
}

/**
 * Add to transcript (immutable)
 */
export function appendToTranscript(state, entry) {
  return {
    ...state,
    transcript: [...state.transcript, {
      ...entry,
      timestamp: Date.now(),
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }]
  };
}

// ============================================================================
// D) ANSWER SUBMISSION HANDLERS
// ============================================================================

/**
 * Handle primary question answer (batched, zero lookups)
 */
export function handlePrimaryAnswer(state, answer) {
  if (state.isCommitting) {
    console.warn('⚠️ Already committing, ignoring duplicate submission');
    return state;
  }

  const startTime = performance.now();
  const { engine, currentQuestionId, answers } = state;
  const question = engine.QById[currentQuestionId];

  if (!question) {
    console.error('❌ Question not found:', currentQuestionId);
    return state;
  }

  // Step 1: Append Q&A to transcript
  let newState = appendToTranscript(state, {
    type: 'question',
    questionId: currentQuestionId,
    content: question.question_text,
    category: question.category
  });

  newState = appendToTranscript(newState, {
    type: 'answer',
    questionId: currentQuestionId,
    content: answer
  });

  // Step 2: Save answer
  const newAnswers = { ...answers, [currentQuestionId]: answer };

  // Step 3: Check for follow-ups
  const followUpTrigger = checkFollowUpTrigger(engine, currentQuestionId, answer);
  let newFollowUpQueue = [...state.followUpQueue];

  if (followUpTrigger) {
    if (Array.isArray(followUpTrigger)) {
      newFollowUpQueue.push(...followUpTrigger);
    } else {
      newFollowUpQueue.push({ packId: followUpTrigger, vars: {} });
    }
  }

  // Step 4: Determine next step
  let nextMode = state.currentMode;
  let nextQuestionId = currentQuestionId;
  let nextPack = null;

  if (newFollowUpQueue.length > 0 && nextMode !== 'FOLLOWUP') {
    // Start follow-up
    nextMode = 'FOLLOWUP';
    nextPack = newFollowUpQueue.shift();
  } else {
    // Continue to next question
    nextQuestionId = computeNextQuestionId(engine, currentQuestionId, answer);
    if (!nextQuestionId) {
      nextMode = 'COMPLETE';
    }
  }

  // Step 5: Batch update
  newState = batchUpdate(newState, {
    answers: newAnswers,
    followUpQueue: newFollowUpQueue,
    currentMode: nextMode,
    currentQuestionId: nextQuestionId,
    currentPack: nextPack,
    questionsAnswered: state.questionsAnswered + 1,
    isCommitting: false,
    isComplete: nextMode === 'COMPLETE'
  });

  const elapsed = performance.now() - startTime;
  console.log(`⚡ Answer processed in ${elapsed.toFixed(2)}ms`);

  return newState;
}

/**
 * Handle follow-up answer (placeholder)
 */
export function handleFollowUpAnswer(state, answer) {
  console.log('📋 Follow-up answer:', answer);
  // TODO: Implement follow-up logic
  return state;
}

// ============================================================================
// E) UTILITIES
// ============================================================================

/**
 * Get current prompt (question or follow-up)
 */
export function getCurrentPrompt(state) {
  if (state.currentMode === 'QUESTION') {
    const question = state.engine.QById[state.currentQuestionId];
    return question ? {
      type: 'question',
      id: question.question_id,
      text: question.question_text,
      responseType: question.response_type,
      category: question.category
    } : null;
  }

  if (state.currentMode === 'FOLLOWUP') {
    // TODO: Get current follow-up step
    return {
      type: 'followup',
      text: 'Follow-up question (placeholder)',
      responseType: 'text'
    };
  }

  return null;
}

/**
 * Get progress stats
 */
export function getProgress(state) {
  return {
    answered: state.questionsAnswered,
    total: state.totalQuestions,
    percentage: Math.round((state.questionsAnswered / state.totalQuestions) * 100)
  };
}

/**
 * String interpolation for follow-up templates
 */
export function interpolate(text, vars) {
  if (!text || !text.includes('{')) return text;
  
  return text.replace(/\{(\w+)\}/g, (match, key) => {
    return vars[key] !== undefined ? vars[key] : match;
  });
}

// ============================================================================
// F) PERFORMANCE MONITORING
// ============================================================================

export const PERF_MONITOR = {
  enabled: false,
  metrics: {
    bootstrapTime: 0,
    renderCount: 0,
    avgSubmitTime: 0,
    submitTimes: []
  },
  
  toggle() {
    this.enabled = !this.enabled;
    console.log(`🔍 Performance monitoring: ${this.enabled ? 'ON' : 'OFF'}`);
  },
  
  log(metric, value) {
    if (!this.enabled) return;
    console.log(`📊 ${metric}:`, value);
  },
  
  trackSubmit(timeMs) {
    if (!this.enabled) return;
    this.metrics.submitTimes.push(timeMs);
    this.metrics.avgSubmitTime = 
      this.metrics.submitTimes.reduce((a, b) => a + b, 0) / this.metrics.submitTimes.length;
    console.log(`⚡ Submit time: ${timeMs.toFixed(2)}ms (avg: ${this.metrics.avgSubmitTime.toFixed(2)}ms)`);
  }
};

// Dev tool: expose to window in development
if (typeof window !== 'undefined') {
  window.PERF_MONITOR = PERF_MONITOR;
}