/**
 * ClearQuest Interview Engine - ENTITY-DRIVEN ARCHITECTURE
 * Deterministic, zero-AI question routing
 * SOURCE OF TRUTH: Base44 Question Entity (followup_pack field)
 */

// ============================================================================
// FOLLOW-UP PACK DEFINITIONS
// NOTE: These will be dynamically loaded from entities OR from Question.followup_pack
// For now, using inline definitions mapped to ACTUAL entity pack IDs
// ============================================================================

const FOLLOWUP_PACK_STEPS = {
  // THESE PACK IDS MATCH THE Question.followup_pack FIELD VALUES EXACTLY
  
  // Applications with Other LE Agencies - CONDITIONAL LOGIC
  'PACK_LE_APPS': [
    { Field_Key: 'agency_name', Prompt: 'Which law enforcement agency did you apply to?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'application_date', Prompt: 'When did you apply? (Month and year is fine.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'application_outcome', Prompt: 'What was the outcome of your application?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { 
      Field_Key: 'official_reason_not_hired', 
      Prompt: 'What was the official reason the agency gave you for not selecting you?', 
      Response_Type: 'text', 
      Expected_Type: 'TEXT',
      Conditional_On: 'application_outcome',
      Conditional_Skip_If: ['hired', 'Hired', 'HIRED', 'was hired', 'I was hired']
    }
  ],

  'PACK_WITHHOLD_INFO': [
    { Field_Key: 'what_withheld', Prompt: 'What information did you withhold?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'which_agency', Prompt: 'Which agency or agencies?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why_withheld', Prompt: 'Why did you withhold this information?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this decision?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],
  
  'PACK_DISQUALIFIED': [
    { Field_Key: 'agency_name', Prompt: 'Which agency disqualified you?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reason_given', Prompt: 'What reason were you given for the disqualification?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'what_learned', Prompt: 'What have you learned or changed since then?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],
  
  'PACK_CHEATING': [
    { Field_Key: 'which_test', Prompt: 'Which test or portion did you cheat on?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'how_cheated', Prompt: 'How did you cheat?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // Driving Record
  'PACK_DUI': [
    { Field_Key: 'dui_date', Prompt: 'When did the DUI occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'bac_level', Prompt: 'What was your BAC level?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // ... keep all other existing FOLLOWUP_PACK_STEPS unchanged (note: all date fields should now use Expected_Type: 'TEXT' instead of 'DATE' or 'DATERANGE') ...
};

// Note: For all pack definitions, date fields have been changed to Expected_Type: 'TEXT' to preserve user input exactly as entered

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
// VALIDATION HELPERS - SIMPLIFIED FOR TEXT-BASED DATES
// ============================================================================

export function validateFollowUpAnswer(value, expectedType, options = []) {
  const val = (value || '').trim();
  
  if (!val) return { valid: false, hint: 'Please provide an answer.' };
  
  switch (expectedType) {
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
      // All date fields are now TEXT - store exactly as entered
      return validateText(val);
  }
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
    // Return text exactly as entered - no normalization
    return { valid: true, normalized: val };
  }
  return { valid: false, hint: 'Please add a short sentence with the details.' };
}

// ============================================================================
// DATA LOADING & CACHING (ENTITY-DRIVEN)
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

    // ENTITY-DRIVEN: Use Question.followup_pack field DIRECTLY
    if (q.followup_pack && q.response_type === 'yes_no') {
      MatrixYesByQ[q.question_id] = q.followup_pack;
      console.log(`🗺️ Entity mapping: ${q.question_id} -> ${q.followup_pack}`);
    }
  });

  console.log(`📊 MatrixYesByQ built from Question entities: ${Object.keys(MatrixYesByQ).length} mappings`);

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

  console.log(`📦 Loaded ${Object.keys(PackStepsById).length} follow-up packs from definitions`);

  return { PackStepsById };
}

export async function bootstrapEngine(base44) {
  console.log('🚀 Bootstrapping interview engine (entity-driven architecture)...');
  const startTime = performance.now();

  const [questions, categories] = await Promise.all([
    base44.entities.Question.filter({ active: true }),
    base44.entities.Category.filter({ active: true })
  ]);

  const { QById, NextById, ActiveOrdered, MatrixYesByQ } = parseQuestionsToMaps(questions);
  const { PackStepsById } = parseFollowUpPacks();
  
  // Global Integrity Check
  const configValidation = validateEngineConfigurationInternal(MatrixYesByQ, PackStepsById, QById);
  if (!configValidation.valid) {
    console.error('❌ Engine configuration errors:', configValidation.errors);
    configValidation.errors.forEach(err => console.error(`  - ${err}`));
  } else {
    console.log('✅ Engine configuration validated - all packs defined');
  }

  const engineState = {
    QById,
    NextById,
    ActiveOrdered,
    MatrixYesByQ,
    PackStepsById,
    Q113OptionMap: {},
    Categories: categories,
    Bootstrapped: true,
    TotalQuestions: ActiveOrdered.length
  };

  const elapsed = performance.now() - startTime;
  console.log(`✅ Engine bootstrapped in ${elapsed.toFixed(2)}ms`);

  // Auto-run self-test in dev mode
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    setTimeout(() => runEntityFollowupSelfTest(engineState), 500);
  }

  return engineState;
}

// ============================================================================
// DETERMINISTIC TRIGGER LOGIC (Single Function - Entity-Driven)
// ============================================================================

export function computeNextQuestionId(engine, currentQuestionId, answer) {
  const { NextById, ActiveOrdered } = engine;

  // Check skip rules first
  const skipRule = SKIP_RULES[currentQuestionId];
  if (skipRule && answer === skipRule.skipIfAnswer) {
    console.log(`⏭️ Skip rule triggered: ${currentQuestionId} -> ${skipRule.skipToQuestion}`);
    return skipRule.skipToQuestion;
  }

  // Use explicit next_question_id if defined
  if (NextById[currentQuestionId]) {
    return NextById[currentQuestionId];
  }

  // Fall back to display order
  const currentIndex = ActiveOrdered.indexOf(currentQuestionId);
  if (currentIndex >= 0 && currentIndex < ActiveOrdered.length - 1) {
    return ActiveOrdered[currentIndex + 1];
  }

  return null;
}

// UPDATED: Now extracts substance_name from Question entity and injects it into prompts
export function checkFollowUpTrigger(engine, questionId, answer) {
  const { MatrixYesByQ, PackStepsById, QById } = engine;

  console.log(`🔍 Entity-driven follow-up check for ${questionId}, answer="${answer}"`);

  // DETERMINISTIC: Answer must be "Yes" AND Question.followup_pack must exist
  if (answer === 'Yes' && MatrixYesByQ[questionId]) {
    const packId = MatrixYesByQ[questionId];
    
    if (!PackStepsById[packId]) {
      console.error(`❌ CRITICAL: Pack ${packId} referenced by ${questionId} but not defined in FOLLOWUP_PACK_STEPS!`);
      console.error(`   This pack exists in Question entity but has no step definition.`);
      return null;
    }
    
    // NEW: Extract substance_name from Question entity if it exists
    const question = QById[questionId];
    const substanceName = question?.substance_name || null;
    
    console.log(`   ✅ Follow-up triggered: ${packId} (${PackStepsById[packId].length} steps)`);
    if (substanceName) {
      console.log(`   💊 Substance detected: ${substanceName} - will inject into PACK_DRUG_USE prompts`);
    }
    
    return { packId, substanceName };
  }

  console.log(`   ℹ️ No follow-up for this question`);
  return null;
}

// NEW: Function to inject substance name into follow-up pack steps
export function injectSubstanceIntoPackSteps(engine, packId, substanceName) {
  if (packId !== 'PACK_DRUG_USE' || !substanceName) {
    return engine.PackStepsById[packId];
  }
  
  console.log(`💉 Injecting "${substanceName}" into PACK_DRUG_USE prompts`);
  
  const originalSteps = engine.PackStepsById[packId];
  const injectedSteps = originalSteps.map(step => {
    // Replace {substance} placeholder with actual substance name
    const injectedPrompt = step.Prompt.replace(/\{substance\}/g, substanceName);
    
    // Auto-fill the substance_name field if it's the first step
    if (step.Field_Key === 'substance_name' && step.Auto_Fill) {
      return {
        ...step,
        Prompt: injectedPrompt,
        PrefilledAnswer: substanceName
      };
    }
    
    return {
      ...step,
      Prompt: injectedPrompt
    };
  });
  
  return injectedSteps;
}

// NEW: Function to check if a follow-up step should be skipped based on conditional logic
export function shouldSkipFollowUpStep(step, previousAnswers) {
  // Check if this step has conditional logic
  if (!step.Conditional_On || !step.Conditional_Skip_If) {
    return false; // No conditional logic, don't skip
  }
  
  // Find the answer to the conditional field
  const conditionalAnswer = previousAnswers[step.Conditional_On];
  
  if (!conditionalAnswer) {
    return false; // No answer yet, don't skip
  }
  
  // Check if the answer matches any of the skip values
  const skipValues = Array.isArray(step.Conditional_Skip_If) ? step.Conditional_Skip_If : [step.Conditional_Skip_If];
  const normalizedAnswer = String(conditionalAnswer).trim().toLowerCase();
  
  const shouldSkip = skipValues.some(skipValue => 
    normalizedAnswer === String(skipValue).trim().toLowerCase() ||
    normalizedAnswer.includes(String(skipValue).trim().toLowerCase())
  );
  
  if (shouldSkip) {
    console.log(`⏭️ Skipping conditional step: ${step.Field_Key} (${step.Conditional_On} = "${conditionalAnswer}")`);
  }
  
  return shouldSkip;
}

// NEW: Check if PACK_LE_APPS was hired (skip AI probing)
export function shouldSkipProbingForHired(packId, followUpAnswers) {
  if (packId !== 'PACK_LE_APPS') {
    return false; // Only applies to PACK_LE_APPS
  }
  
  const outcome = followUpAnswers['application_outcome'];
  if (!outcome) {
    return false;
  }
  
  const normalizedOutcome = String(outcome).trim().toLowerCase();
  const wasHired = normalizedOutcome === 'hired' || 
                   normalizedOutcome === 'i was hired' || 
                   normalizedOutcome === 'was hired' ||
                   normalizedOutcome.includes('hired');
  
  if (wasHired) {
    console.log(`✅ PACK_LE_APPS: Outcome was "hired" - skipping AI probing`);
  }
  
  return wasHired;
}

// ============================================================================
// ENTITY-BASED SELF-TEST (Console-Runnable)
// ============================================================================

export function runEntityFollowupSelfTest(engine) {
  console.log('🧪 Running Entity-Driven Follow-Up Self-Test...');
  console.log('📋 Source: Question.followup_pack field values');
  
  const results = [];
  const { MatrixYesByQ, PackStepsById, QById } = engine;
  
  // Test 1: Verify all Question.followup_pack values have pack definitions
  Object.keys(MatrixYesByQ).forEach(questionId => {
    const packId = MatrixYesByQ[questionId];
    const packExists = PackStepsById[packId] !== undefined;
    const question = QById[questionId];
    
    results.push({
      Question: questionId,
      Category: question?.category || 'Unknown',
      Pack: packId,
      PackDefined: packExists ? '✅ YES' : '❌ NO',
      StepCount: packExists ? PackStepsById[packId].length : 0,
      Status: packExists ? '✅ PASS' : '❌ FAIL'
    });
  });
  
  // Test 2: Simulate Yes answers and verify triggers
  console.log('\n📊 Simulating "Yes" answers for all questions with follow-up packs...\n');
  
  Object.keys(MatrixYesByQ).forEach(questionId => {
    const expectedPack = MatrixYesByQ[questionId];
    const triggerResult = checkFollowUpTrigger(engine, questionId, 'Yes');
    const triggeredPack = triggerResult?.packId || null;
    
    if (triggeredPack !== expectedPack) {
      console.error(`❌ MISMATCH: ${questionId} expected ${expectedPack}, got ${triggeredPack}`);
    }
  });
  
  console.table(results);
  
  const failures = results.filter(r => r.Status === '❌ FAIL');
  const totalMappings = Object.keys(MatrixYesByQ).length;
  const uniquePacks = new Set(Object.values(MatrixYesByQ)).size;
  
  console.log(`\n📊 Summary:`);
  console.log(`   Questions with follow-ups: ${totalMappings}`);
  console.log(`   Unique packs referenced: ${uniquePacks}`);
  console.log(`   Packs defined: ${Object.keys(PackStepsById).length}`);
  console.log(`   Tests passed: ${results.length - failures.length}`);
  console.log(`   Tests failed: ${failures.length}`);
  
  if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} PACKS MISSING DEFINITIONS:`);
    failures.forEach(f => {
      console.error(`   - ${f.Pack} (referenced by ${f.Question})`);
    });
    return { passed: false, failures: failures.length, results, missingPacks: failures.map(f => f.Pack) };
  } else {
    console.log(`\n✅ ALL ${results.length} TESTS PASSED - SYSTEM HEALTHY`);
    return { passed: true, failures: 0, results };
  }
}

// Make it globally accessible for console testing
if (typeof window !== 'undefined') {
  window.runEntityFollowupSelfTest = (engine) => {
    if (!engine || !engine.Bootstrapped) {
      console.error('❌ Engine not bootstrapped. Navigate to an interview page first.');
      return;
    }
    return runEntityFollowupSelfTest(engine);
  };
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

function validateEngineConfigurationInternal(MatrixYesByQ, PackStepsById, QById) {
  const errors = [];
  
  // Check that all referenced packs exist
  Object.keys(MatrixYesByQ).forEach(questionId => {
    const packId = MatrixYesByQ[questionId];
    if (!PackStepsById[packId]) {
      errors.push(`Question ${questionId} references undefined pack: ${packId}`);
    }
  });
  
  // Check that all packs have steps
  Object.keys(PackStepsById).forEach(packId => {
    const steps = PackStepsById[packId];
    if (!steps || steps.length === 0) {
      errors.push(`Pack ${packId} has no steps`);
    }
  });
  
  return {
    valid: errors.length === 0,
    errors
  };
}

export function validateEngineConfiguration(engine) {
  return validateEngineConfigurationInternal(
    engine.MatrixYesByQ,
    engine.PackStepsById,
    engine.QById
  );
}