/**
 * DISCRETION ENGINE V2 (Universal MVP)
 * 
 * The single decision-maker for ALL V2 pack probing.
 * Decides: STOP, ASK_COMBINED, or ASK_MICRO
 * Generates the actual question text to show candidates.
 * 
 * NO deterministic follow-up questions surface to candidates.
 * All probing is AI-driven through this engine.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

// ============================================================================
// FACT ANCHOR SCHEMAS BY PACK
// These define what facts need to be collected for each V2 pack.
// ============================================================================

// HARDENED: Synced with followupPackConfig.js - SINGLE SOURCE OF TRUTH for critical anchors
const PACK_FACT_SCHEMAS = {
  // Prior Law Enforcement Applications - OUTCOME ONLY
  // Agency name, position, and month/year are captured by the main follow-up card (purple card).
  // The V2 engine only needs to probe for the outcome.
  "PACK_PRIOR_LE_APPS_STANDARD": {
    required: ["outcome"], // Only outcome - other fields handled by follow-up card
    optional: ["reason_not_hired"],
    severity: "standard",
    maxProbes: 1, // Hard cap: single micro-question for outcome only
    multiInstance: true,
    topic: "prior_apps"
  },
  "PACK_LE_APPS": {
    required: ["outcome"], // Only outcome - other fields handled by follow-up card
    optional: ["reason_not_hired"],
    severity: "standard",
    maxProbes: 1, // Hard cap: single micro-question for outcome only
    multiInstance: true,
    topic: "prior_apps"
  },
  
  // Driving Packs
  "PACK_DRIVING_COLLISION_STANDARD": {
    required: ["month_year", "location", "what_happened", "at_fault"],
    optional: ["injuries", "citations", "property_damage"],
    severity: "standard",
    maxProbes: 4,
    multiInstance: true,
    topic: "driving"
  },
  "PACK_DRIVING_VIOLATIONS_STANDARD": {
    required: ["violation_type", "location", "month_year", "disposition"],
    optional: ["fine_amount", "points"],
    severity: "laxed",
    maxProbes: 3,
    multiInstance: true,
    topic: "driving"
  },
  "PACK_DRIVING_DUIDWI_STANDARD": {
    required: ["substance", "approx_level", "location", "month_year", "outcome"],
    optional: ["arrest_status", "court_outcome", "license_impact"],
    severity: "strict",
    maxProbes: 5,
    multiInstance: true,
    topic: "dui_drugs"
  },
  "PACK_DRIVING_STANDARD": {
    required: ["incident_type", "month_year", "location", "outcome"],
    optional: ["description"],
    severity: "standard",
    maxProbes: 3,
    multiInstance: true,
    topic: "driving"
  },
  
  // Criminal / Violence Packs
  "PACK_DOMESTIC_VIOLENCE_STANDARD": {
    required: ["relationship", "behavior_type", "month_year", "outcome"],
    optional: ["injury_or_damage", "location", "protective_order"],
    severity: "strict",
    maxProbes: 5,
    multiInstance: true,
    topic: "violence_dv"
  },
  "PACK_ASSAULT_STANDARD": {
    required: ["month_year", "location", "circumstances", "outcome"],
    optional: ["injuries", "weapons_involved"],
    severity: "strict",
    maxProbes: 5,
    multiInstance: true,
    topic: "violence_dv"
  },
  "PACK_GENERAL_CRIME_STANDARD": {
    required: ["month_year", "location", "what_happened", "legal_outcome"],
    optional: ["charges", "arrest_status"],
    severity: "strict",
    maxProbes: 5,
    multiInstance: true,
    topic: "criminal"
  },
  "PACK_THEFT_STANDARD": {
    required: ["month_year", "location", "what_stolen", "legal_outcome"],
    optional: ["value", "circumstances"],
    severity: "strict",
    maxProbes: 4,
    multiInstance: true,
    topic: "criminal"
  },
  "PACK_PROPERTY_CRIME_STANDARD": {
    required: ["month_year", "location", "property_type", "legal_outcome"],
    optional: ["damage_amount", "circumstances"],
    severity: "standard",
    maxProbes: 4,
    multiInstance: true,
    topic: "criminal"
  },
  "PACK_FRAUD_STANDARD": {
    required: ["fraud_type", "month_year", "circumstances", "legal_outcome"],
    optional: ["amount_involved"],
    severity: "strict",
    maxProbes: 4,
    multiInstance: true,
    topic: "criminal"
  },
  
  // Drug / Alcohol Packs
  "PACK_DRUG_USE_STANDARD": {
    required: ["substance_type", "first_use", "last_use", "frequency"],
    optional: ["total_uses", "consequences"],
    severity: "standard",
    maxProbes: 4,
    multiInstance: true,
    topic: "dui_drugs"
  },
  "PACK_ALCOHOL_STANDARD": {
    required: ["frequency", "binge_episodes", "misconduct"],
    optional: ["blackouts", "work_impact", "treatment_history"],
    severity: "standard",
    maxProbes: 3,
    multiInstance: false,
    topic: "alcohol"
  },
  
  // Employment / Integrity Packs
  "PACK_EMPLOYMENT_STANDARD": {
    required: ["employer", "month_year", "incident_type", "outcome"],
    optional: ["position", "circumstances"],
    severity: "standard",
    maxProbes: 3,
    multiInstance: true,
    topic: "employment"
  },
  "PACK_INTEGRITY_APPS": {
    required: ["agency", "issue_type", "month_year", "consequences"],
    optional: ["what_omitted", "reason_omitted"],
    severity: "strict",
    maxProbes: 4,
    multiInstance: true,
    topic: "honesty_integrity"
  },
  
  // Financial Packs
  "PACK_FINANCIAL_STANDARD": {
    required: ["financial_issue_type", "amount_owed", "resolution_status"],
    optional: ["creditor", "legal_actions"],
    severity: "standard",
    maxProbes: 3,
    multiInstance: true,
    topic: "financial"
  },
  
  // Other Packs
  "PACK_GENERAL_DISCLOSURE_STANDARD": {
    required: ["disclosure_type", "circumstances", "time_period"],
    optional: [],
    severity: "laxed",
    maxProbes: 2,
    multiInstance: true,
    topic: "general"
  },
  "PACK_STALKING_HARASSMENT_STANDARD": {
    required: ["behavior_type", "month_year", "circumstances", "legal_outcome"],
    optional: ["duration", "victim_relationship"],
    severity: "strict",
    maxProbes: 4,
    multiInstance: true,
    topic: "violence_dv"
  },
  "PACK_CHILD_ABUSE_STANDARD": {
    required: ["month_year", "allegation_type", "investigation_outcome"],
    optional: ["child_age", "location"],
    severity: "strict",
    maxProbes: 5,
    multiInstance: true,
    topic: "violence_dv"
  }
};

// Default schema for unknown packs
const DEFAULT_SCHEMA = {
  required: ["month_year", "what_happened", "outcome"],
  optional: ["location"],
  severity: "standard",
  maxProbes: 3,
  multiInstance: true,
  topic: "general"
};

// ============================================================================
// QUESTION TEMPLATES
// Templates for generating clarifier questions based on anchors
// ============================================================================

const QUESTION_TEMPLATES = {
  // Outcome - primary anchor for PACK_PRIOR_LE_APPS_STANDARD V2 probing
  outcome: {
    micro: "What was the outcome of this application?",
    combined: "the outcome"
  },

  // Agency name - NOT used for PACK_PRIOR_LE_APPS_STANDARD V2 probing (handled by follow-up card)
  agency_name: {
    micro: "What was the name of the law enforcement department or agency?",
    combined: "the name of the law enforcement department or agency"
  },
  
  // Time-related
  month_year: {
    micro: "About what month and year did this occur?",
    combined: "when it occurred (month and year)"
  },
  first_use: {
    micro: "When did you first use this substance?",
    combined: "when you first used it"
  },
  last_use: {
    micro: "When was the most recent time you used this?",
    combined: "when you last used it"
  },
  time_period: {
    micro: "About when did this occur?",
    combined: "when it occurred"
  },
  
  // Location-related
  location: {
    micro: "Where did this happen?",
    combined: "where it happened"
  },
  
  // Agency/employer - agency_name is the primary anchor for LE apps
  agency_type: {
    micro: "What type of agency was this (city police, sheriff's office, state, or federal)?",
    combined: "what type of agency it was"
  },
  employer: {
    micro: "What company or organization was this with?",
    combined: "the employer"
  },
  
  // Position/role
  position: {
    micro: "What position did you apply for?",
    combined: "what position you applied for"
  },
  
  // What happened
  what_happened: {
    micro: "Can you briefly describe what happened?",
    combined: "what happened"
  },
  circumstances: {
    micro: "Can you describe the circumstances?",
    combined: "the circumstances"
  },
  behavior_type: {
    micro: "What type of behavior or conduct was involved?",
    combined: "the type of behavior"
  },
  incident_type: {
    micro: "What type of incident was this?",
    combined: "the type of incident"
  },
  violation_type: {
    micro: "What type of violation was this?",
    combined: "the type of violation"
  },
  fraud_type: {
    micro: "What type of fraud was involved?",
    combined: "the type of fraud"
  },
  allegation_type: {
    micro: "What was the nature of the allegation?",
    combined: "the allegation"
  },
  disclosure_type: {
    micro: "What would you like to disclose?",
    combined: "what you want to disclose"
  },
  issue_type: {
    micro: "What type of issue was this?",
    combined: "what type of issue"
  },
  financial_issue_type: {
    micro: "What type of financial issue was this?",
    combined: "the type of financial issue"
  },
  substance_type: {
    micro: "What substance was involved?",
    combined: "what substance"
  },
  substance: {
    micro: "What substance was involved?",
    combined: "what substance"
  },
  
  // Outcome/consequences
  outcome: {
    micro: "What was the outcome?",
    combined: "the outcome"
  },
  legal_outcome: {
    micro: "What was the legal outcome?",
    combined: "the legal outcome"
  },
  investigation_outcome: {
    micro: "What was the outcome of the investigation?",
    combined: "the investigation outcome"
  },
  disposition: {
    micro: "How was this resolved?",
    combined: "how it was resolved"
  },
  consequences: {
    micro: "What were the consequences?",
    combined: "the consequences"
  },
  resolution_status: {
    micro: "What is the current resolution status?",
    combined: "the resolution status"
  },
  
  // Relationships/people
  relationship: {
    micro: "What was your relationship to the other person involved?",
    combined: "your relationship to the other person"
  },
  
  // Amounts/severity
  amount_owed: {
    micro: "Approximately how much was involved?",
    combined: "the amount involved"
  },
  approx_level: {
    micro: "Do you know the level or extent of impairment?",
    combined: "the level of impairment"
  },
  frequency: {
    micro: "How often did this occur?",
    combined: "how often"
  },
  
  // Yes/no clarifications
  at_fault: {
    micro: "Were you determined to be at fault?",
    combined: "whether you were at fault"
  },
  injuries: {
    micro: "Were there any injuries?",
    combined: "any injuries"
  },
  
  // Catch-all for unknown anchors
  _default: {
    micro: "Can you provide more details about this?",
    combined: "more details"
  }
};

// Topics that require firm tone
const FIRM_TONE_TOPICS = [
  'honesty_integrity',
  'violence_dv',
  'criminal'
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get pack schema, falling back to default
 */
function getPackSchema(packId) {
  return PACK_FACT_SCHEMAS[packId] || DEFAULT_SCHEMA;
}

/**
 * Get question template for an anchor
 */
function getTemplate(anchorKey) {
  return QUESTION_TEMPLATES[anchorKey] || QUESTION_TEMPLATES._default;
}

/**
 * Build a micro question for a single anchor
 */
function buildMicroQuestion(anchorKey, isMultiInstance = false) {
  const template = getTemplate(anchorKey);
  const question = template.micro;
  
  if (isMultiInstance) {
    return `For this incident, ${question.charAt(0).toLowerCase()}${question.slice(1)}`;
  }
  return question;
}

/**
 * Build a combined question for multiple anchors
 */
function buildCombinedQuestion(anchorKeys, isMultiInstance = false) {
  if (anchorKeys.length === 0) return null;
  if (anchorKeys.length === 1) return buildMicroQuestion(anchorKeys[0], isMultiInstance);
  
  const fragments = anchorKeys.map(key => getTemplate(key).combined);
  
  let question;
  if (fragments.length === 2) {
    question = `Can you tell me ${fragments[0]} and ${fragments[1]}?`;
  } else if (fragments.length === 3) {
    question = `Can you tell me ${fragments[0]}, ${fragments[1]}, and ${fragments[2]}?`;
  } else {
    // More than 3 - take first 3
    question = `Can you tell me ${fragments[0]}, ${fragments[1]}, and ${fragments[2]}?`;
  }
  
  if (isMultiInstance) {
    return `For this incident, ${question.charAt(0).toLowerCase()}${question.slice(1)}`;
  }
  return question;
}

/**
 * Generate opening question for a new pack instance
 * This is the first combined question that asks for all required facts at once
 */
function buildOpeningQuestion(packId, isMultiInstance = false, instanceNumber = 1) {
  const schema = getPackSchema(packId);
  const requiredAnchors = schema.required.slice(0, 4); // Take up to 4 for opening
  
  // Special opening for specific packs
  const PACK_OPENING_OVERRIDES = {
        // PACK_PRIOR_LE_APPS_STANDARD: Only ask about outcome - agency/position/month_year handled by follow-up card
        "PACK_PRIOR_LE_APPS_STANDARD": "What was the outcome of this application?",
        "PACK_LE_APPS": "What was the outcome of this application?",
    "PACK_DRIVING_COLLISION_STANDARD": "For this collision, about when did it occur, where did it happen, and what happened?",
    "PACK_DRIVING_DUIDWI_STANDARD": "For this incident, what substance was involved, about when did it occur, and what was the outcome?",
    "PACK_DOMESTIC_VIOLENCE_STANDARD": "For this incident, what was your relationship to the other person, about when did it occur, and what happened?",
    "PACK_DRUG_USE_STANDARD": "What substance was involved, when did you first use it, and when was the last time you used it?"
  };
  
  if (PACK_OPENING_OVERRIDES[packId]) {
    return PACK_OPENING_OVERRIDES[packId];
  }
  
  return buildCombinedQuestion(requiredAnchors, isMultiInstance && instanceNumber > 1);
}

/**
 * Determine which anchors are still missing based on collected data
 */
function computeMissingAnchors(schema, collectedAnchors) {
  const collected = new Set(Object.keys(collectedAnchors || {}));
  
  const requiredMissing = schema.required.filter(a => !collected.has(a));
  const optionalMissing = schema.optional.filter(a => !collected.has(a));
  
  return {
    requiredMissing,
    optionalMissing,
    allMissing: [...requiredMissing, ...optionalMissing],
    totalMissing: requiredMissing.length + optionalMissing.length,
    requiredComplete: requiredMissing.length === 0
  };
}

/**
 * Main discretion logic - MVP anchor-based probing pipeline
 * HARDENED: Enforces limits, prevents infinite loops, handles malformed data
 */
function evaluateDiscretion({
  packId,
  collectedAnchors = {},
  probeCount = 0,
  instanceNumber = 1,
  lastAnswer = ""
}) {
  // HARDENING: Validate inputs
  if (!packId) {
    console.error('[DISCRETION] Missing packId');
    return { action: 'stop', question: null, targetAnchors: [], tone: 'neutral', reason: 'Missing packId' };
  }
  
  const schema = getPackSchema(packId);
  
  // HARDENING: Validate schema - use DEFAULT_SCHEMA if pack not found
  if (!schema || !schema.required) {
    console.warn(`[DISCRETION] No schema for pack=${packId} - using DEFAULT_SCHEMA`);
  }
  
  // HARDENING: Use safe defaults from schema
  const safeSchema = schema || DEFAULT_SCHEMA;
  const safeMaxProbes = safeSchema.maxProbes || 3;
  
  // HARDENING: Normalize probeCount (never negative, cap at maxProbes + 1 safety margin)
  const normalizedProbeCount = Math.min(Math.max(0, probeCount || 0), safeMaxProbes + 1);
  
  const { requiredMissing, allMissing, requiredComplete } = computeMissingAnchors(safeSchema, collectedAnchors);
  const isMultiInstance = safeSchema.multiInstance && instanceNumber > 1;
  
  // HARDENED: Compact logging (keys only, no PII)
  console.log(`[DISCRETION] pack=${packId} probe=${normalizedProbeCount}/${safeMaxProbes} missing=[${requiredMissing.join(',')}]`);
  
  // PACK_PRIOR_LE_APPS_STANDARD: Enhanced logging
  if (packId === "PACK_PRIOR_LE_APPS_STANDARD") {
    console.log(`[PACK_PRIOR_LE_APPS][DISCRETION_STATE]`, {
      packId,
      probeCount: normalizedProbeCount,
      maxProbes: safeMaxProbes,
      collected_keys: Object.keys(collectedAnchors || {}),
      required_missing: requiredMissing,
      all_missing: allMissing
    });
  }
  
  // Determine tone
  let tone = "neutral";
  if (FIRM_TONE_TOPICS.includes(safeSchema.topic)) {
    tone = "firm";
  }
  
  // Rule 1: Max probes reached → STOP (prevents infinite loops)
  // HARDENED: Hard ceiling at maxProbes - never exceed
  if (normalizedProbeCount >= safeMaxProbes) {
    console.log(`[DISCRETION] STOP: Max probes reached (${normalizedProbeCount}/${safeMaxProbes})`);
    return {
      action: "stop",
      question: null,
      targetAnchors: [],
      tone,
      reason: `Max probes reached (${normalizedProbeCount}/${safeMaxProbes})`
    };
  }
  
  // Rule 2: All required anchors collected → STOP
  if (requiredComplete) {
    console.log(`[DISCRETION] STOP: All required anchors collected`);
    return {
      action: "stop",
      question: null,
      targetAnchors: [],
      tone,
      reason: "All required anchors collected"
    };
  }
  
  // Rule 3: First probe (probeCount=0) → Opening combined question
  if (normalizedProbeCount === 0) {
    const question = buildOpeningQuestion(packId, safeSchema.multiInstance, instanceNumber);
    if (!question) {
      console.error('[DISCRETION] Failed to build opening question');
      return { action: 'stop', question: null, targetAnchors: [], tone, reason: 'Could not generate opening' };
    }
    console.log(`[DISCRETION] ASK_COMBINED (opening): "${question.substring(0, 60)}..."`);
    return {
      action: "ask_combined",
      question,
      targetAnchors: safeSchema.required.slice(0, 4),
      tone,
      reason: "Opening question for new incident"
    };
  }
  
  // Rule 4: Subsequent probes - use micro or combined based on missing count
  if (requiredMissing.length === 1) {
    // Only 1 required missing → micro
    const question = buildMicroQuestion(requiredMissing[0], isMultiInstance);
    console.log(`[DISCRETION] ASK_MICRO: "${question}"`);
    return {
      action: "ask_micro",
      question,
      targetAnchors: requiredMissing,
      tone,
      reason: `1 required anchor missing: ${requiredMissing[0]}`
    };
  } else if (requiredMissing.length <= 3) {
    // 2-3 required missing → combined
    const question = buildCombinedQuestion(requiredMissing, isMultiInstance);
    console.log(`[DISCRETION] ASK_COMBINED: "${question.substring(0, 60)}..."`);
    return {
      action: "ask_combined",
      question,
      targetAnchors: requiredMissing,
      tone,
      reason: `${requiredMissing.length} required anchors missing`
    };
  } else {
    // More than 3 → combined with first 3
    const targets = requiredMissing.slice(0, 3);
    const question = buildCombinedQuestion(targets, isMultiInstance);
    console.log(`[DISCRETION] ASK_COMBINED (capped): "${question.substring(0, 60)}..."`);
    return {
      action: "ask_combined",
      question,
      targetAnchors: targets,
      tone,
      reason: `${requiredMissing.length} required anchors missing, asking for first 3`
    };
  }
}

// ============================================================================
// MAIN HANDLER - Hardened for reliability
// ============================================================================

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      console.warn('[DISCRETION_ENGINE] Unauthorized request');
      // Return safe stop decision instead of 401 to prevent interview blocking
      return Response.json({ 
        success: true,
        action: 'stop',
        question: null,
        targetAnchors: [],
        tone: 'neutral',
        reason: 'Auth failed - safe stop'
      }, { status: 200 });
    }

    const input = await req.json();
    
    // Validate input
    if (!input || typeof input !== 'object') {
      console.error('[DISCRETION_ENGINE] Invalid input');
      return Response.json({ 
        success: true,
        action: 'stop',
        question: null,
        targetAnchors: [],
        tone: 'neutral',
        reason: 'Invalid input - safe stop'
      }, { status: 200 });
    }
    
    // Support both old and new input formats
    const {
      // New universal format
      packId,
      collectedAnchors = {},
      probeCount = 0,
      instanceNumber = 1,
      lastAnswer = "",
      
      // Legacy format (still supported)
      stillMissingAnchors = [],
      requiredAnchors = [],
      maxProbes,
      severity,
      topic,
      nonSubstantiveCount = 0
    } = input;
    
    // Validate packId for new format
    if (!packId && !stillMissingAnchors.length) {
      console.error('[DISCRETION_ENGINE] Missing packId and no legacy params');
      return Response.json({ 
        success: true,
        action: 'stop',
        question: null,
        targetAnchors: [],
        tone: 'neutral',
        reason: 'No pack specified - safe stop'
      }, { status: 200 });
    }
    
    console.log(`[DISCRETION_ENGINE] Request:`, {
      packId,
      collectedKeys: Object.keys(collectedAnchors),
      probeCount,
      instanceNumber
    });
    
    // If packId provided, use new universal logic
    if (packId) {
      // Validate pack exists in schema
      const schema = getPackSchema(packId);
      if (!schema && packId !== 'test') {
        console.warn(`[DISCRETION_ENGINE] Unknown pack: ${packId} - using default schema`);
      }
      
      // Enforce max probes ceiling (never exceed schema limit)
      const effectiveMaxProbes = schema?.maxProbes || 3;
      const effectiveProbeCount = Math.min(probeCount, effectiveMaxProbes);
      
      const result = evaluateDiscretion({
        packId,
        collectedAnchors,
        probeCount: effectiveProbeCount,
        instanceNumber,
        lastAnswer
      });
      
      console.log(`[DISCRETION_ENGINE] Result:`, {
        action: result.action,
        hasQuestion: !!result.question,
        targetAnchors: result.targetAnchors,
        reason: result.reason
      });
      
      // Validate result before returning
      if (!result || !result.action) {
        console.error('[DISCRETION_ENGINE] Invalid result from evaluateDiscretion');
        return Response.json({
          success: true,
          action: 'stop',
          question: null,
          targetAnchors: [],
          tone: 'neutral',
          reason: 'Invalid discretion result - safe stop'
        });
      }
      
      return Response.json({
        success: true,
        ...result,
        debug: {
          packId,
          collectedCount: Object.keys(collectedAnchors).length,
          probeCount: effectiveProbeCount,
          maxProbes: effectiveMaxProbes,
          instanceNumber
        }
      });
    }
    
    // Legacy fallback (old format without packId)
    const collectedKeys = Object.keys(collectedAnchors);
    const missingRequired = requiredAnchors.filter(a => !collectedKeys.includes(a));
    const missingCount = stillMissingAnchors.length;

    let action = 'stop';
    let targetAnchors = [];
    let tone = 'neutral';
    let reason = '';

    if (missingRequired.length === 0) {
      action = 'stop';
      reason = 'All required anchors collected';
    } else if (probeCount >= (maxProbes || 3)) {
      action = 'stop';
      reason = `Max probes reached (${probeCount}/${maxProbes || 3})`;
    } else if (severity === 'laxed' && missingCount === 1) {
      action = 'ask_micro';
      targetAnchors = stillMissingAnchors.slice(0, 1);
      reason = 'Laxed severity with 1 missing anchor';
    } else if (severity === 'strict' && missingCount > 1) {
      action = 'ask_combined';
      targetAnchors = stillMissingAnchors.slice(0, 3);
      reason = 'Strict severity with multiple missing anchors';
    } else if (nonSubstantiveCount >= 2) {
      action = 'ask_micro';
      targetAnchors = stillMissingAnchors.slice(0, 1);
      tone = 'soft';
      reason = `Multiple vague answers (${nonSubstantiveCount})`;
    } else if (missingCount > 0) {
      if (missingCount === 1) {
        action = 'ask_micro';
        targetAnchors = stillMissingAnchors;
      } else if (missingCount <= 2) {
        action = 'ask_combined';
        targetAnchors = stillMissingAnchors;
      } else {
        action = 'ask_combined';
        targetAnchors = stillMissingAnchors.slice(0, 2);
      }
      reason = `${missingCount} anchors still missing`;
    }

    const topicLower = (topic || '').toLowerCase();
    if (FIRM_TONE_TOPICS.some(t => topicLower.includes(t))) {
      tone = 'firm';
    }

    return Response.json({
      success: true,
      action,
      targetAnchors,
      tone,
      reason,
      debug: {
        collectedCount: collectedKeys.length,
        missingCount,
        missingRequired: missingRequired.length,
        probeCount,
        maxProbes,
        severity,
        topic,
        nonSubstantiveCount
      }
    });

  } catch (error) {
    console.error('[DISCRETION_ENGINE] Fatal error:', error.message);
    // HARDENED: Return 200 with safe stop decision to prevent interview blocking
    return Response.json({ 
      success: true,
      action: 'stop',
      question: null,
      targetAnchors: [],
      tone: 'neutral',
      reason: 'Engine error - safe stop',
      error: error.message
    }, { status: 200 });
  }
});