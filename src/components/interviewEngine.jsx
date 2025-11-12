
/**
 * ClearQuest Interview Engine
 * Deterministic, zero-AI question routing with precomputed lookups
 * Optimized for speed and minimal credit usage
 */

// ============================================================================
// FOLLOW-UP PACK DEFINITIONS (Hardcoded for deterministic routing)
// Based on ClearQuest Data Package v1 - README_v1.txt
// ============================================================================

const FOLLOWUP_PACK_STEPS = {
  // ===== Applications with Other LE Agencies =====
  'PACK_LE_APPS': [
    { Field_Key: 'agency_name', Prompt: 'What was the name of the law enforcement agency you applied to?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'application_date', Prompt: 'When did you apply?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'application_outcome', Prompt: 'What was the outcome of your application?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reason_not_hired', Prompt: 'If not hired, what was the reason given?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],
  
  'PACK_WITHHOLD_INFO': [
    { Field_Key: 'what_withheld', Prompt: 'What information did you withhold?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'which_agency', Prompt: 'Which agency or agencies?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why_withheld', Prompt: 'Why did you withhold this information?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this decision?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],
  
  'PACK_DISQUALIFIED': [
    { Field_Key: 'agency_name', Prompt: 'Which agency disqualified you?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'reason_given', Prompt: 'What reason were you given for the disqualification?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'what_learned', Prompt: 'What have you learned or changed since then?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],
  
  'PACK_CHEATING': [
    { Field_Key: 'which_test', Prompt: 'Which test or portion did you cheat on?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'how_cheated', Prompt: 'How did you cheat?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // ===== Driving Record =====
  'PACK_COLLISION': [
    { Field_Key: 'collision_date', Prompt: 'When did the collision occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'collision_location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'at_fault', Prompt: 'Were you at fault?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],
  
  'PACK_COLLISION_INJURY': [
    { Field_Key: 'injuries', Prompt: 'Describe the injuries sustained.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'fatalities', Prompt: 'Were there any fatalities?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],
  
  'PACK_ALCOHOL_COLLISION': [
    { Field_Key: 'collision_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'bac_level', Prompt: 'What was your BAC level, if known?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'charges_filed', Prompt: 'Were any charges filed?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],
  
  'PACK_UNREPORTED_COLLISION': [
    { Field_Key: 'collision_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'why_unreported', Prompt: 'Why was it not reported?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'damages', Prompt: 'Describe any damages or injuries.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for not reporting it?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],
  
  'PACK_HIT_RUN': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'why_left', Prompt: 'Why did you leave the scene?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reported_later', Prompt: 'Did you report it later?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],
  
  'PACK_HIT_RUN_DAMAGE': [
    { Field_Key: 'injuries', Prompt: 'Describe any injuries.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'property_damage', Prompt: 'Describe property damage.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_consequences', Prompt: 'Were there legal consequences?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // ===== Generic/Existing Packs =====
  'PACK_LE_PREV': [
    { Field_Key: 'agency_name', Prompt: 'What was the name of the law enforcement agency?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'dates_employed', Prompt: 'What were the dates you were employed there?', Response_Type: 'text', Expected_Type: 'DATERANGE' },
    { Field_Key: 'reason_leaving', Prompt: 'What was your reason for leaving?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'eligible_rehire', Prompt: 'Are you eligible for rehire?', Response_Type: 'text', Expected_Type: 'BOOLEAN' }
  ],
  
  'PACK_MIL_DISCHARGE': [
    { Field_Key: 'discharge_type', Prompt: 'What type of discharge did you receive?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'discharge_date', Prompt: 'When were you discharged?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'discharge_reason', Prompt: 'What was the reason for your discharge?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],
  
  'PACK_DISCIPLINE': [
    { Field_Key: 'incident_date', Prompt: 'When did this disciplinary action occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'incident_description', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'incident_outcome', Prompt: 'What was the outcome or penalty?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],
  
  'PACK_ARREST': [
    { Field_Key: 'arrest_date', Prompt: 'When were you arrested?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'arrest_location', Prompt: 'Where did this occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'arrest_charge', Prompt: 'What were you charged with?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'arrest_outcome', Prompt: 'What was the outcome of the case?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],
  
  'PACK_TRAFFIC': [
    { Field_Key: 'traffic_date', Prompt: 'When did this traffic violation occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'traffic_type', Prompt: 'What was the violation?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'traffic_outcome', Prompt: 'What was the outcome or penalty?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],
  
  'PACK_DRUG_USE': [
    { Field_Key: 'substance_name', Prompt: 'What substance did you use?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'first_use_date', Prompt: 'When did you first use it?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'last_use_date', Prompt: 'When was the last time you used it?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'frequency', Prompt: 'How often did you use it?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances of your use.', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],
  
  'PACK_THEFT': [
    { Field_Key: 'theft_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'theft_description', Prompt: 'What was taken?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'theft_value', Prompt: 'What was the approximate value?', Response_Type: 'text', Expected_Type: 'NUMBER' },
    { Field_Key: 'theft_outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],
  
  'PACK_FINANCIAL': [
    { Field_Key: 'financial_issue', Prompt: 'What was the financial issue?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'financial_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'financial_amount', Prompt: 'What was the amount involved?', Response_Type: 'text', Expected_Type: 'NUMBER' },
    { Field_Key: 'financial_status', Prompt: 'What is the current status?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],
  
  'PACK_DOMESTIC': [
    { Field_Key: 'domestic_date', Prompt: 'When did this incident occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'domestic_description', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'domestic_outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ]
};

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate answer based on expected type
 */
export function validateFollowUpAnswer(value, expectedType, options = []) {
  const val = (value || '').trim();
  
  if (!val) return { valid: false, hint: 'Please provide an answer.' };
  
  switch (expectedType) {
    case 'DATE':
      return validateDate(val);
    case 'DATERANGE':
      return validateDateRange(val);
    case 'BOOLEAN':
      return validateBoolean(val);
    case 'NUMBER':
      return validateNumber(val);
    case 'LOCATION':
      return validateLocation(val);
    case 'ENUM':
      return validateEnum(val, options);
    case 'TEXT':
    default:
      return validateText(val);
  }
}

function validateDate(val) {
  // ISO: YYYY-MM-DD
  const isoMatch = /^\d{4}-\d{2}-\d{2}$/.test(val);
  
  // US: MM/DD/YYYY or M/D/YYYY
  const usMatch = /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(val);
  
  // Month Year: Jun 2022, June 2022, 06/2022
  const monthYearMatch = /^([A-Za-z]{3,9})\s+\d{4}$/.test(val) || /^\d{1,2}\/\d{4}$/.test(val);
  
  if (isoMatch || usMatch || monthYearMatch) {
    return { valid: true, normalized: normalizeDate(val) };
  }
  
  return { 
    valid: false, 
    hint: 'Please enter a date (MM/DD/YYYY, YYYY-MM-DD, or Month YYYY).'
  };
}

function validateDateRange(val) {
  // Look for two dates separated by "to", "-", or "–"
  const separators = [' to ', ' - ', '–', ' – '];
  let found = false;
  let parts = [];
  
  for (const sep of separators) {
    if (val.includes(sep)) {
      parts = val.split(sep).map(p => p.trim());
      found = true;
      break;
    }
  }
  
  if (!found || parts.length !== 2) {
    return {
      valid: false,
      hint: 'Please enter a date range like "06/2023 to 08/2023" or "2023-06-01 - 2023-08-15".'
    };
  }
  
  const date1 = validateDate(parts[0]);
  const date2 = validateDate(parts[1]);
  
  if (date1.valid && date2.valid) {
    return { valid: true, normalized: `${date1.normalized} to ${date2.normalized}` };
  }
  
  return {
    valid: false,
    hint: 'Please enter a valid date range like "06/2023 to 08/2023" or "2023-06-01 - 2023-08-15".'
  };
}

function validateBoolean(val) {
  const lower = val.toLowerCase();
  if (lower === 'yes' || lower === 'no') {
    return { valid: true, normalized: lower.charAt(0).toUpperCase() + lower.slice(1) };
  }
  return { valid: false, hint: 'Please answer "Yes" or "No".' };
}

function validateNumber(val) {
  if (/^-?\d+(\.\d+)?$/.test(val)) {
    return { valid: true, normalized: val };
  }
  return { valid: false, hint: 'Please enter a number (digits only, e.g., 100 or 10.50).' };
}

function validateLocation(val) {
  if (val.length >= 3) {
    return { valid: true, normalized: val };
  }
  return { valid: false, hint: 'Please enter the city, state, or best location details you can provide.' };
}

function validateEnum(val, options) {
  const lower = val.toLowerCase();
  const optionsLower = options.map(o => o.toLowerCase());
  
  if (optionsLower.includes(lower)) {
    return { valid: true, normalized: val };
  }
  
  return { valid: false, hint: `Please choose one of the listed options: ${options.join(', ')}.` };
}

function validateText(val) {
  if (val.length >= 1) {
    return { valid: true, normalized: val };
  }
  return { valid: false, hint: 'Please add a short sentence with the details.' };
}

function normalizeDate(val) {
  // Try to normalize to YYYY-MM-DD if possible
  
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    return val;
  }
  
  // US format: MM/DD/YYYY
  const usMatch = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  // Month/Year: 06/2022
  const monthYearMatch = val.match(/^(\d{1,2})\/(\d{4})$/);
  if (monthYearMatch) {
    const [, month, year] = monthYearMatch;
    return `${year}-${month.padStart(2, '0')}`;
  }
  
  // Month name: Jun 2022
  const textMonthMatch = val.match(/^([A-Za-z]{3,9})\s+(\d{4})$/);
  if (textMonthMatch) {
    return val; // Keep as-is, hard to parse precisely without locale knowledge
  }
  
  return val;
}

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
      console.log(`🗺️ Mapped ${q.question_id} -> ${q.followup_pack}`);
    }
  });

  console.log(`📊 MatrixYesByQ built with ${Object.keys(MatrixYesByQ).length} mappings`);

  return { QById, NextById, ActiveOrdered, MatrixYesByQ };
}

/**
 * Parse follow-up packs (from hardcoded definitions)
 */
export function parseFollowUpPacks() {
  const PackStepsById = {};

  Object.keys(FOLLOWUP_PACK_STEPS).forEach(packId => {
    PackStepsById[packId] = FOLLOWUP_PACK_STEPS[packId].map((step, idx) => ({
      ...step,
      Order: idx,
      FollowUpPack: packId
    }));
  });

  console.log(`📦 Loaded ${Object.keys(PackStepsById).length} follow-up packs:`, Object.keys(PackStepsById));

  return { PackStepsById };
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
  const { PackStepsById } = parseFollowUpPacks();
  
  const Q113OptionMap = {}; // Placeholder for Q113 multi-select

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
  const { MatrixYesByQ, QById, PackStepsById } = engine;
  const question = QById[questionId];

  console.log(`🔍 Checking follow-up trigger for ${questionId}, answer="${answer}"`);

  if (!question) {
    console.warn(`⚠️ Question ${questionId} not found in QById`);
    return null;
  }

  // Yes/No questions
  if (question.response_type === 'yes_no' && answer === 'Yes') {
    const packId = MatrixYesByQ[questionId];
    console.log(`   ✅ Yes/No match - packId: ${packId}`);
    
    // Verify pack exists
    if (packId && !PackStepsById[packId]) {
      console.error(`❌ Pack ${packId} not found in PackStepsById! Available packs:`, Object.keys(PackStepsById));
      return null;
    }
    
    return packId || null;
  }

  // Multi-select (Q113) - TODO
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

  console.log(`   ❌ No trigger found (answer was not "Yes" or question type not supported)`);
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
    previousPrimaryId: null, // Track where we were before follow-up
    
    // Validation tracking
    currentStepRetries: 0,
    currentStepProbes: 0,

    // User data
    answers: {}, // { questionId: answer }
    incidents: {}, // { packId: { field1: val, field2: val } }
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

  console.log(`📝 Primary answer: ${currentQuestionId} = "${answer}"`);

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

  // Step 3: Check for follow-ups (NO AI)
  const followUpTrigger = checkFollowUpTrigger(engine, currentQuestionId, answer);
  let newFollowUpQueue = [...state.followUpQueue];

  if (followUpTrigger) {
    console.log(`🔔 Follow-up triggered: ${followUpTrigger}`);
    if (Array.isArray(followUpTrigger)) {
      newFollowUpQueue.push(...followUpTrigger);
    } else {
      newFollowUpQueue.push({ packId: followUpTrigger, vars: {} });
    }
  } else {
    console.log(`ℹ️ No follow-up triggered for ${currentQuestionId}`);
  }

  // Step 4: Determine next step (CRITICAL BRANCHING LOGIC)
  let nextMode = 'QUESTION';
  let nextQuestionId = currentQuestionId;
  let nextPack = null;
  let nextPackIndex = 0;
  let previousPrimary = currentQuestionId;

  if (newFollowUpQueue.length > 0) {
    // SWITCH TO FOLLOWUP MODE
    console.log(`🔀 Switching to FOLLOWUP mode, queue length: ${newFollowUpQueue.length}`);
    nextMode = 'FOLLOWUP';
    nextPack = newFollowUpQueue.shift(); // Dequeue first pack
    nextPackIndex = 0;
    previousPrimary = currentQuestionId; // Remember where we were
    
    console.log(`📦 Next pack:`, nextPack);
    
    // CRITICAL FIX: Append first follow-up question to transcript immediately
    const firstPackSteps = engine.PackStepsById[nextPack.packId];
    console.log(`📋 Pack steps for ${nextPack.packId}:`, firstPackSteps);
    
    if (firstPackSteps && firstPackSteps.length > 0) {
      const firstStep = firstPackSteps[0];
      console.log(`📋 Starting pack ${nextPack.packId} with first question: "${firstStep.Prompt}"`);
      
      newState = appendToTranscript(newState, {
        type: 'followup_question',
        packId: nextPack.packId,
        fieldKey: firstStep.Field_Key,
        content: firstStep.Prompt
      });
      
      console.log(`✅ Added follow-up question to transcript`);
    } else {
      console.error(`❌ No steps found for pack ${nextPack.packId}`);
    }
  } else {
    // CONTINUE TO NEXT PRIMARY QUESTION
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
    currentPackIndex: nextPackIndex,
    previousPrimaryId: previousPrimary,
    questionsAnswered: state.questionsAnswered + 1,
    currentStepRetries: 0, // Reset retry counter for new step
    currentStepProbes: 0,
    isCommitting: false,
    isComplete: nextMode === 'COMPLETE'
  });

  const elapsed = performance.now() - startTime;
  console.log(`⚡ Primary answer processed in ${elapsed.toFixed(2)}ms`);
  console.log(`📊 New state - mode: ${newState.currentMode}, transcript length: ${newState.transcript.length}`);

  return newState;
}

/**
 * Handle follow-up answer with validation (DOES NOT ADVANCE ON INVALID)
 */
export function handleFollowUpAnswer(state, answer) {
  if (state.isCommitting) {
    console.warn('⚠️ Already committing, ignoring duplicate submission');
    return state;
  }

  const startTime = performance.now();
  const { engine, currentPack, currentPackIndex, incidents } = state;

  if (!currentPack) {
    console.error('❌ No current pack in FOLLOWUP mode');
    return state;
  }

  const steps = engine.PackStepsById[currentPack.packId];
  if (!steps || currentPackIndex >= steps.length) {
    console.error('❌ Invalid pack or index');
    return state;
  }

  const step = steps[currentPackIndex];
  console.log(`📋 Follow-up answer: ${currentPack.packId}:${step.Field_Key} = "${answer}"`);

  // VALIDATION: Check if answer matches expected type
  const validation = validateFollowUpAnswer(answer, step.Expected_Type || 'TEXT', step.Options);
  
  if (!validation.valid) {
    console.log(`❌ Validation failed: ${validation.hint}`);
    
    // Append validation hint to transcript
    let newState = appendToTranscript(state, {
      type: 'validation_hint',
      content: validation.hint
    });
    
    // Increment retry counter
    newState = batchUpdate(newState, {
      currentStepRetries: state.currentStepRetries + 1,
      isCommitting: false
    });
    
    const elapsed = performance.now() - startTime;
    console.log(`⚡ Validation failed in ${elapsed.toFixed(2)}ms - STAYING ON SAME STEP`);
    
    return newState;
  }
  
  console.log(`✅ Validation passed: "${validation.normalized}"`);

  // Step 1: Append FU answer to transcript (question already there)
  let newState = appendToTranscript(state, {
    type: 'followup_answer',
    packId: currentPack.packId,
    fieldKey: step.Field_Key,
    content: validation.normalized || answer
  });

  // Step 2: Save to incidents
  const packKey = currentPack.packId;
  const newIncidents = {
    ...incidents,
    [packKey]: {
      ...(incidents[packKey] || {}),
      [step.Field_Key]: validation.normalized || answer
    }
  };

  // Step 3: Advance to next step or finish pack
  let nextMode = state.currentMode;
  let nextPackIndex = currentPackIndex;
  let nextPack = currentPack;
  let nextQuestionId = state.currentQuestionId;

  if (currentPackIndex < steps.length - 1) {
    // MORE STEPS IN THIS PACK - append next question
    console.log(`➡️ Advancing to next step in pack`);
    nextPackIndex = currentPackIndex + 1;
    
    const nextStep = steps[nextPackIndex];
    newState = appendToTranscript(newState, {
      type: 'followup_question',
      packId: currentPack.packId,
      fieldKey: nextStep.Field_Key,
      content: nextStep.Prompt
    });
  } else {
    // PACK FINISHED
    console.log(`✅ Pack finished: ${currentPack.packId}`);
    
    if (state.followUpQueue.length > 0) {
      // MORE PACKS IN QUEUE
      console.log(`🔀 Starting next queued pack`);
      nextMode = 'FOLLOWUP';
      nextPack = state.followUpQueue.shift();
      nextPackIndex = 0;
      
      // Append first question of next pack
      const nextPackSteps = engine.PackStepsById[nextPack.packId];
      if (nextPackSteps && nextPackSteps.length > 0) {
        const firstStep = nextPackSteps[0];
        newState = appendToTranscript(newState, {
          type: 'followup_question',
          packId: nextPack.packId,
          fieldKey: firstStep.Field_Key,
          content: firstStep.Prompt
        });
      }
    } else {
      // RETURN TO PRIMARY QUESTIONS
      console.log(`🔀 Returning to primary questions`);
      nextMode = 'QUESTION';
      nextPack = null;
      nextPackIndex = 0;
      nextQuestionId = computeNextQuestionId(engine, state.previousPrimaryId, state.answers[state.previousPrimaryId]);
      
      if (!nextQuestionId) {
        nextMode = 'COMPLETE';
      }
    }
  }

  // Step 4: Batch update
  newState = batchUpdate(newState, {
    incidents: newIncidents,
    currentMode: nextMode,
    currentPack: nextPack,
    currentPackIndex: nextPackIndex,
    currentQuestionId: nextQuestionId,
    followUpQueue: nextMode === 'FOLLOWUP' ? [...state.followUpQueue] : state.followUpQueue,
    currentStepRetries: 0, // Reset retry counter for new step
    currentStepProbes: 0,
    isCommitting: false,
    isComplete: nextMode === 'COMPLETE'
  });

  const elapsed = performance.now() - startTime;
  console.log(`⚡ Follow-up answer processed in ${elapsed.toFixed(2)}ms`);

  return newState;
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
    if (!state.currentPack) return null;
    
    const steps = state.engine.PackStepsById[state.currentPack.packId];
    if (!steps || state.currentPackIndex >= steps.length) return null;
    
    const step = steps[state.currentPackIndex];
    
    // Interpolate variables if needed
    let promptText = step.Prompt;
    if (state.currentPack.vars) {
      Object.keys(state.currentPack.vars).forEach(key => {
        promptText = promptText.replace(`{${key}}`, state.currentPack.vars[key]);
      });
    }
    
    return {
      type: 'followup',
      id: `${state.currentPack.packId}:${step.Field_Key}`,
      text: promptText,
      responseType: step.Response_Type || 'text',
      expectedType: step.Expected_Type || 'TEXT',
      packId: state.currentPack.packId,
      fieldKey: step.Field_Key,
      stepNumber: state.currentPackIndex + 1,
      totalSteps: steps.length
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
