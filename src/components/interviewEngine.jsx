/**
 * ClearQuest Interview Engine
 * Deterministic, zero-AI question routing with precomputed lookups
 * Optimized for speed and minimal credit usage
 */

// ============================================================================
// FOLLOW-UP PACK DEFINITIONS (Hardcoded for deterministic routing)
// ============================================================================

const FOLLOWUP_PACK_STEPS = {
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

  'PACK_DUI': [
    { Field_Key: 'dui_date', Prompt: 'When did the DUI occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'bac_level', Prompt: 'What was your BAC level?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_FAILED_PAY_DEBT': [
    { Field_Key: 'creditor_name', Prompt: 'Who was the creditor or company you owed?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'debt_amount', Prompt: 'What was the amount of the debt?', Response_Type: 'text', Expected_Type: 'NUMBER' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATERANGE' },
    { Field_Key: 'why_not_paid', Prompt: 'Why did you choose not to pay even though you had the resources?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'current_status', Prompt: 'What is the current status of this debt?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this decision?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_TAX_NOT_FILED': [
    { Field_Key: 'years_not_filed', Prompt: 'Which year(s) did you not file a tax return?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why_not_filed', Prompt: 'Why did you not file?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'since_filed', Prompt: 'Have you since filed these returns?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'when_filed', Prompt: 'If yes, when did you file them?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'penalties', Prompt: 'Were there any penalties or consequences?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_DRUG_USE': [
    { Field_Key: 'substance_name', Prompt: 'What substance did you use?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'first_use_date', Prompt: 'When did you first use it?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'last_use_date', Prompt: 'When was the last time you used it?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'frequency', Prompt: 'How often did you use it?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances of your use.', Response_Type: 'text', Expected_Type: 'TEXT' }
  ]
};

// ============================================================================
// SKIP RULES
// ============================================================================

const SKIP_RULES = {
  'Q001': {
    skipIfAnswer: 'No',
    skipToQuestion: 'Q005'
  }
};

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

function parseDateFlexible(raw) {
  const s = String(raw).trim();
  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/;
  const monYr = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})$/i;
  const shortMonYr = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\.?\s+(\d{4})$/i;
  const monthYear = /^(\d{1,2})\/(\d{4})$/;

  let d = null;
  
  if (mdy.test(s)) {
    const [, mm, dd, yyyy] = s.match(mdy);
    d = new Date(`${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`);
  } else if (iso.test(s)) {
    d = new Date(s);
  } else if (monYr.test(s)) {
    const [, mon, yyyy] = s.match(monYr);
    d = new Date(`${mon} 01, ${yyyy}`);
  } else if (shortMonYr.test(s)) {
    const [, mon, yyyy] = s.match(shortMonYr);
    const monthMap = {
      'jan': 'January', 'feb': 'February', 'mar': 'March', 'apr': 'April',
      'may': 'May', 'jun': 'June', 'jul': 'July', 'aug': 'August',
      'sep': 'September', 'oct': 'October', 'nov': 'November', 'dec': 'December'
    };
    const fullMonth = monthMap[mon.toLowerCase().slice(0, 3)];
    d = new Date(`${fullMonth || 'January'} 01, ${yyyy}`);
  } else if (monthYear.test(s)) {
    const [, mm, yyyy] = s.match(monthYear);
    d = new Date(`${yyyy}-${mm.padStart(2,'0')}-01`);
  }
  
  return Number.isNaN(d?.getTime()) ? null : d;
}

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
  const parsed = parseDateFlexible(val);
  
  if (parsed) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    const normalized = `${year}-${month}-${day}`;
    
    return { valid: true, normalized };
  }
  
  return { 
    valid: false, 
    hint: 'Please enter a date in MM/DD/YYYY, YYYY-MM-DD, or "Month YYYY" format (e.g., "June 2023").'
  };
}

function validateDateRange(val) {
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
      hint: 'Please enter a date range like "06/2023 to 08/2023" or "June 2023 - August 2023".'
    };
  }
  
  const date1 = validateDate(parts[0]);
  const date2 = validateDate(parts[1]);
  
  if (date1.valid && date2.valid) {
    return { valid: true, normalized: `${date1.normalized} to ${date2.normalized}` };
  }
  
  return {
    valid: false,
    hint: 'Please enter a valid date range like "06/2023 to 08/2023" or "June 2023 - August 2023".'
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
  const cleaned = val.replace(/[$,]/g, '');
  if (/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return { valid: true, normalized: cleaned };
  }
  return { valid: false, hint: 'Please enter a number (e.g., 100 or 10.50).' };
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

// ============================================================================
// DATA LOADING & CACHING
// ============================================================================

export function parseQuestionsToMaps(questions) {
  const QById = {};
  const NextById = {};
  const ActiveOrdered = [];
  const MatrixYesByQ = {};

  const sorted = [...questions].sort((a, b) => a.display_order - b.display_order);

  sorted.forEach((q, index) => {
    if (!q.active) return;

    QById[q.question_id] = q;
    ActiveOrdered.push(q.question_id);

    if (q.next_question_id) {
      NextById[q.question_id] = q.next_question_id;
    } else if (index + 1 < sorted.length) {
      const nextActive = sorted.slice(index + 1).find(nq => nq.active);
      if (nextActive) {
        NextById[q.question_id] = nextActive.question_id;
      }
    }

    if (q.followup_pack && q.response_type === 'yes_no') {
      MatrixYesByQ[q.question_id] = q.followup_pack;
      console.log(`🗺️ Mapped ${q.question_id} -> ${q.followup_pack}`);
    }
  });

  console.log(`📊 MatrixYesByQ built with ${Object.keys(MatrixYesByQ).length} mappings`);

  return { QById, NextById, ActiveOrdered, MatrixYesByQ };
}

export function parseFollowUpPacks() {
  const PackStepsById = {};

  Object.keys(FOLLOWUP_PACK_STEPS).forEach(packId => {
    PackStepsById[packId] = FOLLOWUP_PACK_STEPS[packId].map((step, idx) => ({
      ...step,
      Order: idx,
      FollowUpPack: packId
    }));
  });

  console.log(`📦 Loaded ${Object.keys(PackStepsById).length} follow-up packs`);

  return { PackStepsById };
}

export async function bootstrapEngine(base44) {
  console.log('🚀 Bootstrapping interview engine...');
  const startTime = performance.now();

  const [questions, categories] = await Promise.all([
    base44.entities.Question.filter({ active: true }),
    base44.entities.Category.filter({ active: true })
  ]);

  const { QById, NextById, ActiveOrdered, MatrixYesByQ } = parseQuestionsToMaps(questions);
  const { PackStepsById } = parseFollowUpPacks();
  
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

  const elapsed = performance.now() - startTime;
  console.log(`✅ Engine bootstrapped in ${elapsed.toFixed(2)}ms`);

  return engineState;
}

// ============================================================================
// QUESTION ROUTING LOGIC
// ============================================================================

export function computeNextQuestionId(engine, currentQuestionId, answer) {
  const { NextById, ActiveOrdered } = engine;

  const skipRule = SKIP_RULES[currentQuestionId];
  if (skipRule && answer === skipRule.skipIfAnswer) {
    console.log(`⏭️ Skip rule triggered: ${currentQuestionId} -> ${skipRule.skipToQuestion}`);
    return skipRule.skipToQuestion;
  }

  if (NextById[currentQuestionId]) {
    return NextById[currentQuestionId];
  }

  const currentIndex = ActiveOrdered.indexOf(currentQuestionId);
  if (currentIndex >= 0 && currentIndex < ActiveOrdered.length - 1) {
    return ActiveOrdered[currentIndex + 1];
  }

  return null;
}

export function checkFollowUpTrigger(engine, questionId, answer) {
  const { MatrixYesByQ, QById, PackStepsById } = engine;
  const question = QById[questionId];

  console.log(`🔍 Checking follow-up trigger for ${questionId}, answer="${answer}"`);

  if (!question) {
    console.warn(`⚠️ Question ${questionId} not found`);
    return null;
  }

  if (question.response_type === 'yes_no' && answer === 'Yes') {
    const packId = MatrixYesByQ[questionId];
    console.log(`   ✅ Yes/No match - packId: ${packId}`);
    
    if (packId && !PackStepsById[packId]) {
      console.error(`❌ Pack ${packId} not found!`);
      return null;
    }
    
    return packId || null;
  }

  console.log(`   ❌ No trigger found`);
  return null;
}

// ============================================================================
// COMPLETENESS VERIFICATION (No AI)
// ============================================================================

export function verifyPackCompletion(packId, transcript) {
  const packSteps = FOLLOWUP_PACK_STEPS[packId];
  if (!packSteps) {
    console.warn(`⚠️ Pack ${packId} not found`);
    return { complete: true, missing: [] };
  }

  const missing = [];
  const followupAnswers = transcript.filter(t => t.type === 'followup' && t.packId === packId);
  
  packSteps.forEach(step => {
    const answered = followupAnswers.find(a => a.questionText === step.Prompt);
    if (!answered || !answered.answer || answered.answer.trim() === '') {
      missing.push(step.Prompt);
    }
  });

  return {
    complete: missing.length === 0,
    missing
  };
}

export function generateCompletionAudit(engine, transcript) {
  const totalQuestions = engine.TotalQuestions;
  const answeredQuestions = transcript.filter(t => t.type === 'question');
  
  const triggeredPacks = new Set();
  const completedPacks = [];
  const incompletePacks = [];
  
  answeredQuestions.forEach(q => {
    const question = engine.QById[q.questionId];
    if (question && question.followup_pack && q.answer === 'Yes') {
      triggeredPacks.add(question.followup_pack);
    }
  });
  
  triggeredPacks.forEach(packId => {
    const verification = verifyPackCompletion(packId, transcript);
    if (verification.complete) {
      completedPacks.push(packId);
    } else {
      incompletePacks.push({
        packId,
        missing: verification.missing
      });
    }
  });
  
  return {
    total_questions: totalQuestions,
    answered_questions: answeredQuestions.length,
    completion_percentage: Math.round((answeredQuestions.length / totalQuestions) * 100),
    followup_packs_triggered: triggeredPacks.size,
    followup_packs_completed: completedPacks.length,
    incomplete_packs: incompletePacks,
    is_complete: answeredQuestions.length === totalQuestions && incompletePacks.length === 0,
    timestamp: new Date().toISOString()
  };
}

export function validateEngineConfiguration(engine) {
  const errors = [];
  
  Object.keys(engine.MatrixYesByQ).forEach(questionId => {
    const packId = engine.MatrixYesByQ[questionId];
    if (!engine.PackStepsById[packId]) {
      errors.push(`Question ${questionId} references undefined pack: ${packId}`);
    }
  });
  
  Object.keys(engine.PackStepsById).forEach(packId => {
    const steps = engine.PackStepsById[packId];
    if (!steps || steps.length === 0) {
      errors.push(`Pack ${packId} has no steps`);
    }
  });
  
  return {
    valid: errors.length === 0,
    errors
  };
}