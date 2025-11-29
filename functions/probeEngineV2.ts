import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * ProbeEngineV2 - Per-Field Probing for PACK_LE_APPS (MVP v0.2)
 * 
 * Features:
 * - Validates each field immediately after deterministic answer
 * - Probes until valid answer or max probes reached
 * - Returns NEXT_FIELD when field is complete
 * - NOW USES: GlobalSettings.ai_default_probing_instructions
 * - NOW USES: GlobalSettings AI runtime config (model, temperature, max_tokens, top_p)
 * - NOW USES: FollowUpPack.ai_probe_instructions via InvokeLLM
 * - Falls back to static probes if LLM fails
 */

// Default max probes fallback - only used if pack entity doesn't have max_ai_followups set
const DEFAULT_MAX_PROBES_FALLBACK = 3;

/**
 * Helper to detect "I don't recall / remember / know" style answers
 * Used to force probing even if field-specific validation might accept the value
 */
function answerLooksLikeNoRecall(rawAnswer) {
  if (!rawAnswer) return false;
  const text = String(rawAnswer).trim().toLowerCase();

  if (!text) return false;

  // Common "no memory / unknown" phrases
  const patterns = [
    "i don't know",
    "i dont know",
    "idk",
    "i don't recall",
    "i dont recall",
    "i don't remember",
    "i dont remember",
    "not sure",
    "unsure",
    "unknown",
    "can't remember",
    "cant remember",
    "no idea",
    "i do not know",
    "i do not recall",
    "i do not remember",
    "cannot remember",
    "cannot recall",
    "i'm not sure",
    "im not sure"
  ];

  const result = patterns.some(p => text.includes(p));
  if (result) {
    console.log(`[V2-SEMANTIC] answerLooksLikeNoRecall: detected "no recall" pattern in "${text.substring(0, 50)}..."`);
  }
  return result;
}

/**
 * Get AI runtime configuration from GlobalSettings with safe defaults
 * Single source of truth for all LLM parameters
 */
function getAiRuntimeConfig(globalSettings) {
  return {
    model: globalSettings?.ai_model || "gpt-4o-mini",
    temperature: globalSettings?.ai_temperature ?? 0.2,
    max_tokens: globalSettings?.ai_max_tokens ?? 512,
    top_p: globalSettings?.ai_top_p ?? 1,
  };
}

/**
 * Build unified AI instructions for per-field probing (same pattern as interviewAiFollowup.js)
 * Layers: Core rules → GlobalSettings → FollowUpPack → Field-specific context
 * Returns: { instructions: string, aiConfig: object }
 */
async function buildFieldProbeInstructions(base44Client, packId, fieldName, fieldLabel, maxProbes) {
  const coreRules = `You are a ClearQuest Background Investigation AI Assistant conducting law enforcement background investigations.

CORE SYSTEM RULES (ALWAYS APPLY):
- All information is strictly confidential and CJIS-compliant
- Maintain professional, non-judgmental tone at all times
- Never make hiring recommendations or conclusions
- Focus on factual, objective information gathering
- Respect the sensitivity of personal disclosures`;

  let instructions = coreRules + '\n\n';
  let aiConfig = getAiRuntimeConfig(null); // Defaults

  try {
    // Fetch GlobalSettings and FollowUpPack in parallel
    const [globalSettingsResult, packResult] = await Promise.all([
      base44Client.entities.GlobalSettings.filter({ settings_id: 'global' }).catch(() => []),
      packId 
        ? base44Client.entities.FollowUpPack.filter({ followup_pack_id: packId, active: true }).catch(() => [])
        : Promise.resolve([])
    ]);

    const settings = globalSettingsResult.length > 0 ? globalSettingsResult[0] : null;
    const pack = packResult.length > 0 ? packResult[0] : null;

    // Get AI runtime config from GlobalSettings
    aiConfig = getAiRuntimeConfig(settings);
    console.log(`[V2-PER-FIELD] AI Config: model=${aiConfig.model}, temp=${aiConfig.temperature}, max_tokens=${aiConfig.max_tokens}, top_p=${aiConfig.top_p}`);

    // Layer 1: Global probing instructions from AI Settings page
    if (settings?.ai_default_probing_instructions) {
      instructions += '=== GLOBAL PROBING GUIDELINES ===\n';
      instructions += settings.ai_default_probing_instructions + '\n\n';
      console.log(`[V2-PER-FIELD] Loaded GlobalSettings.ai_default_probing_instructions (${settings.ai_default_probing_instructions.length} chars)`);
    } else {
      console.log(`[V2-PER-FIELD] No GlobalSettings.ai_default_probing_instructions found`);
    }

    // Layer 2: Pack-specific probing instructions
    if (pack?.ai_probe_instructions) {
      instructions += '=== PACK-SPECIFIC PROBING INSTRUCTIONS ===\n';
      instructions += pack.ai_probe_instructions + '\n\n';
      console.log(`[V2-PER-FIELD] Loaded FollowUpPack.ai_probe_instructions for ${packId} (${pack.ai_probe_instructions.length} chars)`);
    } else {
      console.log(`[V2-PER-FIELD] No FollowUpPack.ai_probe_instructions found for ${packId}`);
    }

    // Layer 3: Per-field probing task instructions
    instructions += '=== PER-FIELD PROBING TASK ===\n';
    instructions += `You are generating a follow-up question for a SINGLE FIELD that the candidate left incomplete or vague.\n`;
    instructions += `Field being probed: "${fieldLabel || fieldName}"\n`;
    instructions += `Your goal: Get a clear, specific answer for this field only.\n\n`;
    
    instructions += '=== PROBING LIMITS ===\n';
    instructions += `- Ask ONE concise, specific follow-up question about this field.\n`;
    instructions += `- You may ask up to ${maxProbes} probing questions for this field.\n`;
    instructions += `- Keep questions brief (under 30 words).\n`;
    instructions += `- Be professional and non-judgmental.\n`;
    instructions += `- Focus on gathering factual details.\n`;
    instructions += `- Follow all date rules: ask for month/year only, never exact dates.\n\n`;

    instructions += '=== OUTPUT FORMAT ===\n';
    instructions += `Respond with ONLY the question text. No preamble, no explanation, just the question.\n`;

  } catch (err) {
    console.error('[V2-PER-FIELD] Error building instructions:', err.message);
  }

  return { instructions, aiConfig };
}

/**
 * Deterministic fallback probes for all supported fields.
 * Used when AI/validation fails to ensure probing is rock-solid.
 * 
 * For PACK_DRIVING_COLLISION_STANDARD Q01 (collision date), we use a multi-level
 * probing strategy that acknowledges "I don't recall" and helps narrow down the timeframe.
 */
const FALLBACK_PROBES = {
  // === PACK_LE_APPS ===
  "PACK_LE_APPS_Q1": "Since you're not sure of the exact name, please describe the law enforcement agency you applied to. Include anything you remember, such as the city, state, or any identifying details.",
  "PACK_LE_APPS_Q1764025170356": "What position were you applying for at that agency? For example, was it a police officer, deputy sheriff, corrections officer, or another role?",
  "PACK_LE_APPS_Q1764025187292": "We need at least an approximate timeframe for this application. Can you give us an estimate, like 'around 2020' or 'early 2019'?",
  "PACK_LE_APPS_Q1764025199138": "What was the final result of your application? Were you hired, not selected, did you withdraw, or is it still pending?",
  "PACK_LE_APPS_Q1764025212764": "Were you given any reason for why you were not selected? This could include failing a test, background issues, or the agency's decision.",
  "PACK_LE_APPS_Q1764025246583": "You indicated there were issues during this hiring process. Please describe what those issues or concerns were.",
  
  // === PACK_DRIVING_COLLISION_STANDARD ===
  // NOTE: Q01 uses MULTI_LEVEL_PROBES below instead for smarter probing
  "PACK_DRIVING_COLLISION_Q02": "Where did this collision take place? Please describe the location.",
  "PACK_DRIVING_COLLISION_Q03": "Please describe what happened in this collision. How did the accident occur?",
  "PACK_DRIVING_COLLISION_Q04": "Were you determined to be at fault for this collision?",
  "PACK_DRIVING_COLLISION_Q05": "Were there any injuries as a result of this collision?",
  "PACK_DRIVING_COLLISION_Q06": "Was there property damage as a result of this collision?",
  "PACK_DRIVING_COLLISION_Q07": "Were any citations or tickets issued as a result of this collision?",
  "PACK_DRIVING_COLLISION_Q08": "Was alcohol or any other substance involved in this collision?",
};

/**
 * Multi-level probing for specific fields that need smarter, scaffolded questions.
 * Returns a question based on probeCount (0, 1, 2, ...).
 * 
 * For collision dates, we:
 * - Probe 1: Acknowledge "I don't recall" and ask for approximate year
 * - Probe 2: Anchor to life events to help narrow down
 * - Probe 3: Accept a broad range as final answer
 */
const MULTI_LEVEL_PROBES = {
  "PACK_DRIVING_COLLISION_Q01": [
    // Probe 1 (probeCount=0): Acknowledge and narrow to year
    "I understand you don't recall the exact date. Even if you're not sure of the month, what's the closest you can get to the year? For example, was it closer to 2010, 2015, 2020, or another timeframe?",
    // Probe 2 (probeCount=1): Anchor to life events
    "Think about what was going on in your life at the time of this collision—where you were living, what job you had, or any major life events happening then. Does that help you narrow down an approximate year or season?",
    // Probe 3 (probeCount=2): Accept broad range
    "If you still can't pinpoint a specific year, that's okay. Please give your best estimate as a range, like 'sometime between 2010 and 2015' or 'early 2020s'. Any approximate timeframe will help."
  ],
  "PACK_DRIVING_COLLISION_Q05": [
    // Probe 1 (probeCount=0): Clarify "not sure" / basic injuries
    "You mentioned you're not sure about injuries. Think back to the collision: did anyone complain of pain, soreness, or stiffness afterward — including you, your passengers, or people in the other vehicle?",
    // Probe 2 (probeCount=1): Who was affected
    "To the best of your memory, did anyone see a doctor, go to the hospital, or miss work or school because of this collision? If so, who was it — you, a passenger, or someone in the other vehicle?",
    // Probe 3 (probeCount=2): How serious
    "Even if you can't remember exact details, give your best estimate of how serious any injuries were — for example, 'minor soreness only', 'possible whiplash', or 'someone went to the ER'."
  ],
  // Add more multi-level fields here as needed
};

/**
 * Get the appropriate fallback probe for a field, considering probeCount for multi-level fields.
 */
function getFallbackProbeForField(fieldKey, probeCount = 0) {
  // Check if this field has multi-level probes
  if (MULTI_LEVEL_PROBES[fieldKey]) {
    const probes = MULTI_LEVEL_PROBES[fieldKey];
    // Use the probe at the current count, or the last one if we've exceeded
    const index = Math.min(probeCount, probes.length - 1);
    return probes[index];
  }
  
  // Fall back to single static probe
  return FALLBACK_PROBES[fieldKey] || null;
}

// Merge additional fallback probes into main object
Object.assign(FALLBACK_PROBES, {
  // === PACK_DRIVING_VIOLATIONS_STANDARD ===
  "PACK_DRIVING_VIOLATIONS_Q01": "When did this violation occur? Please provide at least the month and year.",
  "PACK_DRIVING_VIOLATIONS_Q02": "What type of violation was this? For example, speeding, running a red light, etc.",
  "PACK_DRIVING_VIOLATIONS_Q03": "Where did this violation occur?",
  "PACK_DRIVING_VIOLATIONS_Q04": "What was the outcome of this violation? Was it paid, dismissed, reduced, or contested?",
  "PACK_DRIVING_VIOLATIONS_Q05": "Were there any fines associated with this violation?",
  "PACK_DRIVING_VIOLATIONS_Q06": "Were any points added to your driving record?",
  
  // === PACK_DRIVING_STANDARD ===
  "PACK_DRIVING_STANDARD_Q01": "When did this incident occur? Please provide at least the month and year.",
  "PACK_DRIVING_STANDARD_Q02": "What type of driving incident was this?",
  "PACK_DRIVING_STANDARD_Q03": "Please describe what happened in this incident.",
  "PACK_DRIVING_STANDARD_Q04": "What was the outcome of this incident?"
});

/**
 * Build a deterministic fallback probe for specific fields when AI/validation fails.
 * This ensures probing is rock-solid even when the backend has issues.
 * Supports PACK_LE_APPS and driving packs.
 * 
 * Now uses multi-level probing for fields that have it configured.
 */
function buildFallbackProbeForField({ packId, fieldKey, semanticField, probeCount = 0 }) {
  // Check if we have a multi-level or static fallback for this specific field key
  const fallbackQuestion = getFallbackProbeForField(fieldKey, probeCount);
  if (fallbackQuestion) {
    return {
      mode: "QUESTION",
      question: fallbackQuestion,
      isFallback: true,
      probeSource: MULTI_LEVEL_PROBES[fieldKey] ? 'fallback_multi_level' : 'fallback_static'
    };
  }
  
  // Try using semantic field name for fallback (for any supported pack)
  const supportedPacks = ["PACK_LE_APPS", "PACK_DRIVING_COLLISION_STANDARD", "PACK_DRIVING_VIOLATIONS_STANDARD", "PACK_DRIVING_STANDARD"];
  if (supportedPacks.includes(packId) && semanticField) {
    const staticFallback = getStaticFallbackQuestion(semanticField, probeCount, null, {});
    if (staticFallback && !staticFallback.includes('provide more details about')) {
      return {
        mode: "QUESTION",
        question: staticFallback,
        isFallback: true,
        probeSource: 'fallback_semantic'
      };
    }
  }

  // No fallback configured for this field
  return null;
}

const PACK_CONFIG = {
  PACK_LE_APPS: {
    id: "PACK_LE_APPS",
    // NOTE: maxProbesPerField is now fetched from FollowUpPack entity (max_ai_followups)
    // This local config is only used for field mapping
    requiredFields: ["agency", "position", "monthYear", "outcome", "reason", "issues", "stageReached"],
    priorityOrder: ["agency", "position", "monthYear", "outcome", "reason", "issues", "stageReached"],
    fieldKeyMap: {
      "PACK_LE_APPS_Q1": "agency",
      "PACK_LE_APPS_Q1764025170356": "position",
      "PACK_LE_APPS_Q1764025187292": "monthYear",
      "PACK_LE_APPS_Q1764025199138": "outcome",
      "PACK_LE_APPS_Q1764025212764": "reason",
      "PACK_LE_APPS_Q1764025246583": "issues",
      "PACK_LE_APPS_AGENCY": "agency",
      "PACK_LE_APPS_POSITION": "position",
      "PACK_LE_APPS_MONTH_YEAR": "monthYear",
      "PACK_LE_APPS_OUTCOME": "outcome",
      "PACK_LE_APPS_REASON": "reason",
      "PACK_LE_APPS_ISSUES": "issues",
      "PACK_LE_APPS_STAGE_REACHED": "stageReached",
      // Also map semantic field names to themselves
      "agency": "agency",
      "position": "position",
      "monthYear": "monthYear",
      "outcome": "outcome",
      "reason": "reason",
      "issues": "issues",
      "stageReached": "stageReached",
    },
  },
  
  // Driving collision pack
  PACK_DRIVING_COLLISION_STANDARD: {
    id: "PACK_DRIVING_COLLISION_STANDARD",
    requiredFields: ["collisionDate", "collisionLocation", "collisionDescription", "atFault", "injuries", "propertyDamage", "citations", "alcoholInvolved"],
    priorityOrder: ["collisionDate", "collisionLocation", "collisionDescription", "atFault", "injuries", "propertyDamage", "citations", "alcoholInvolved"],
    fieldKeyMap: {
      "PACK_DRIVING_COLLISION_Q01": "collisionDate",
      "PACK_DRIVING_COLLISION_Q02": "collisionLocation",
      "PACK_DRIVING_COLLISION_Q03": "collisionDescription",
      "PACK_DRIVING_COLLISION_Q04": "atFault",
      "PACK_DRIVING_COLLISION_Q05": "injuries",
      "PACK_DRIVING_COLLISION_Q06": "propertyDamage",
      "PACK_DRIVING_COLLISION_Q07": "citations",
      "PACK_DRIVING_COLLISION_Q08": "alcoholInvolved",
      // Semantic field name mappings
      "collisionDate": "collisionDate",
      "collisionLocation": "collisionLocation",
      "collisionDescription": "collisionDescription",
      "atFault": "atFault",
      "injuries": "injuries",
      "propertyDamage": "propertyDamage",
      "citations": "citations",
      "alcoholInvolved": "alcoholInvolved",
    },
  },
  
  // Driving violations pack
  PACK_DRIVING_VIOLATIONS_STANDARD: {
    id: "PACK_DRIVING_VIOLATIONS_STANDARD",
    requiredFields: ["violationDate", "violationType", "violationLocation", "outcome", "fines", "points"],
    priorityOrder: ["violationDate", "violationType", "violationLocation", "outcome", "fines", "points"],
    fieldKeyMap: {
      "PACK_DRIVING_VIOLATIONS_Q01": "violationDate",
      "PACK_DRIVING_VIOLATIONS_Q02": "violationType",
      "PACK_DRIVING_VIOLATIONS_Q03": "violationLocation",
      "PACK_DRIVING_VIOLATIONS_Q04": "outcome",
      "PACK_DRIVING_VIOLATIONS_Q05": "fines",
      "PACK_DRIVING_VIOLATIONS_Q06": "points",
      // Semantic field name mappings
      "violationDate": "violationDate",
      "violationType": "violationType",
      "violationLocation": "violationLocation",
      "outcome": "outcome",
      "fines": "fines",
      "points": "points",
    },
  },
  
  // General driving pack
  PACK_DRIVING_STANDARD: {
    id: "PACK_DRIVING_STANDARD",
    requiredFields: ["incidentDate", "incidentType", "incidentDescription", "outcome"],
    priorityOrder: ["incidentDate", "incidentType", "incidentDescription", "outcome"],
    fieldKeyMap: {
      "PACK_DRIVING_STANDARD_Q01": "incidentDate",
      "PACK_DRIVING_STANDARD_Q02": "incidentType",
      "PACK_DRIVING_STANDARD_Q03": "incidentDescription",
      "PACK_DRIVING_STANDARD_Q04": "outcome",
      // Semantic field name mappings
      "incidentDate": "incidentDate",
      "incidentType": "incidentType",
      "incidentDescription": "incidentDescription",
      "outcome": "outcome",
    },
  },
};

/**
 * Normalize curly quotes and trim
 */
function normalizeText(raw) {
  if (raw == null) return "";
  return String(raw)
    .replace(/\u2019/g, "'")
    .replace(/\u2018/g, "'")
    .replace(/\u201C/g, '"')
    .replace(/\u201D/g, '"')
    .trim();
}

/**
 * Check if value indicates "I don't know/remember"
 */
function isDontKnow(value) {
  const normalized = normalizeText(value).toLowerCase();
  console.log(`[V2-PER-FIELD] isDontKnow check: raw="${value}", normalized="${normalized}"`);
  
  if (!normalized) {
    console.log(`[V2-PER-FIELD] isDontKnow: empty/null → true`);
    return true;
  }
  
  const dontKnowPhrases = [
    "i don't remember", "dont remember", "i do not remember", "don't remember",
    "don't recall", "dont recall", "i do not recall", "i don't recall",
    "not sure", "i'm not sure", "im not sure", "unknown", "n/a", "na",
    "can't remember", "cant remember", "cannot remember",
    "can't recall", "cant recall", "cannot recall",
    "unsure", "no idea", "i don't know", "dont know", "do not know", "idk"
  ];
  
  const result = dontKnowPhrases.some(phrase => normalized.includes(phrase));
  console.log(`[V2-PER-FIELD] isDontKnow: result=${result} for "${normalized}"`);
  return result;
}

/**
 * v2-Semantic evaluation for a single field answer.
 * This is global / pack-agnostic and should work for all packs.
 *
 * Returns a structured object:
 * {
 *   status: "ok" | "needs_probe",
 *   reason: "EMPTY" | "NO_RECALL" | "FIELD_RULES_OK",
 *   flags: {
 *     isEmpty: boolean,
 *     isNoRecall: boolean
 *   }
 * }
 */
function semanticV2EvaluateAnswer(fieldName, rawValue, incidentContext = {}) {
  const normalized = normalizeText(rawValue).toLowerCase();

  const isEmpty = !normalized;
  const isNoRecall = isDontKnow(rawValue) || answerLooksLikeNoRecall(rawValue);

  let status = "ok";
  let reason = "FIELD_RULES_OK";

  if (isEmpty) {
    status = "needs_probe";
    reason = "EMPTY";
  } else if (isNoRecall) {
    status = "needs_probe";
    reason = "NO_RECALL";
  }

  console.log(`[V2-SEMANTIC] semanticV2EvaluateAnswer`, {
    fieldName,
    rawValue,
    normalized,
    status,
    reason,
    flags: { isEmpty, isNoRecall }
  });

  return {
    status,
    reason,
    flags: {
      isEmpty,
      isNoRecall,
    },
  };
}

/**
 * Validate a specific field value
 * Returns: "complete", "incomplete", or "invalid"
 * 
 * Supports PACK_LE_APPS and driving packs (PACK_DRIVING_COLLISION_STANDARD, 
 * PACK_DRIVING_VIOLATIONS_STANDARD, PACK_DRIVING_STANDARD)
 */
function validateField(fieldName, value, incidentContext = {}) {
  const normalized = normalizeText(value).toLowerCase();
  
  console.log(`[V2-PER-FIELD] validateField START: field=${fieldName}, raw="${value}", normalized="${normalized}"`);
  
  // CRITICAL: Check isDontKnow FIRST before any field-specific logic
  const isUnknownAnswer = isDontKnow(value);
  console.log(`[V2-PER-FIELD] isDontKnow result: ${isUnknownAnswer}`);
  
  // GLOBAL RULE: Empty or "don't know/recall" answers are always incomplete
  if (!normalized || isUnknownAnswer) {
    console.log(`[V2-PER-FIELD] Validation result: INCOMPLETE (empty or unknown answer)`);
    return "incomplete";
  }
  
  switch (fieldName) {
    // === PACK_LE_APPS fields ===
    case "agency":
    case "position":
      // Already checked for empty/unknown above
      console.log(`[V2-PER-FIELD] Validation result: COMPLETE (${fieldName} has valid value)`);
      return "complete";
    
    case "monthYear":
    case "collisionDate":
    case "violationDate":
    case "incidentDate":
      // Check for any year pattern (4 digits) or approximate terms
      const hasYear = /\b(19|20)\d{2}\b/.test(normalized);
      const hasApproximate = /(early|late|mid|around|about|spring|summer|fall|winter|beginning|end)/i.test(normalized);
      const hasMonth = /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)/i.test(normalized);
      
      if (hasYear || hasMonth || hasApproximate) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (has date indicator)`);
        return "complete";
      }
      // If they gave something but no date indicators, still accept if long enough
      if (normalized.length > 3) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (has content)`);
        return "complete";
      }
      console.log(`[V2-PER-FIELD] Validation result: INCOMPLETE (no date found)`);
      return "incomplete";
    
    case "outcome":
      // Must be one of: selected, not selected, withdrew, disqualified, still in process
      const validOutcomes = [
        "selected", "hired", "accepted", "offered",
        "not selected", "rejected", "denied", "unsuccessful", "failed",
        "withdrew", "withdrawn", "pulled out", "decided not to",
        "disqualified", "dq", "removed",
        "still in process", "pending", "waiting", "ongoing", "in progress",
        // Driving-related outcomes
        "paid", "dismissed", "reduced", "contested", "guilty", "not guilty",
        "points", "fine", "warning", "citation"
      ];
      
      const hasValidOutcome = validOutcomes.some(outcome => normalized.includes(outcome));
      if (hasValidOutcome) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (valid outcome found)`);
        return "complete";
      }
      // If they gave something specific, accept it
      if (normalized.length > 5) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (has specific content)`);
        return "complete";
      }
      console.log(`[V2-PER-FIELD] Validation result: INCOMPLETE (no valid outcome)`);
      return "incomplete";
    
    case "reason":
      // Cannot be empty or "don't remember" unless outcome is "still in process"
      const outcomeValue = normalizeText(incidentContext.outcome).toLowerCase();
      const isStillInProcess = outcomeValue.includes("still") || outcomeValue.includes("pending") || 
                               outcomeValue.includes("waiting") || outcomeValue.includes("ongoing");
      
      if (isStillInProcess) {
        // Reason is optional for ongoing processes
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (still in process, reason optional)`);
        return "complete";
      }
      console.log(`[V2-PER-FIELD] Validation result: COMPLETE (reason has value)`);
      return "complete";
    
    case "issues":
      // If "no" → complete; if "yes" → need to probe for issue type
      if (normalized === "no" || normalized.includes("no issues") || normalized.includes("none") || normalized === "n") {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (no issues)`);
        return "complete";
      }
      if (normalized === "yes" || normalized === "y") {
        // They said yes but didn't describe the issues
        console.log(`[V2-PER-FIELD] Validation result: INCOMPLETE (yes but no description)`);
        return "incomplete";
      }
      // If they gave a description, it's complete
      if (normalized.length > 10) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (has description)`);
        return "complete";
      }
      console.log(`[V2-PER-FIELD] Validation result: INCOMPLETE (no valid issues response)`);
      return "incomplete";
    
    case "stageReached":
      // Optional field - accept any non-empty answer
      if (normalized.length > 0) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (stageReached has value)`);
        return "complete";
      }
      // Empty is acceptable for optional field
      console.log(`[V2-PER-FIELD] Validation result: COMPLETE (optional field)`);
      return "complete";
    
    // === DRIVING COLLISION fields ===
    case "collisionLocation":
    case "violationLocation":
      // Accept any location description
      if (normalized.length > 2) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (location has value)`);
        return "complete";
      }
      return "incomplete";
    
    case "collisionDescription":
    case "incidentDescription":
    case "violationType":
    case "incidentType":
      // Require some description
      if (normalized.length > 5) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (description has content)`);
        return "complete";
      }
      return "incomplete";
    
    case "atFault":
    case "injuries":
    case "propertyDamage":
    case "citations":
    case "alcoholInvolved":
      // Yes/no fields
      if (["yes", "y", "no", "n", "none", "n/a"].includes(normalized)) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (yes/no answer)`);
        return "complete";
      }
      // Accept descriptive answers too
      if (normalized.length > 3) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (has description)`);
        return "complete";
      }
      return "incomplete";
    
    case "fines":
    case "points":
      // Accept amounts, "none", or descriptions
      if (normalized.length > 0) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (fines/points has value)`);
        return "complete";
      }
      return "incomplete";
    
    default:
      // Unknown field - accept any non-empty value that's not "don't know"
      if (normalized.length > 0) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (default: has content)`);
        return "complete";
      }
      console.log(`[V2-PER-FIELD] Validation result: INCOMPLETE (default: empty)`);
      return "incomplete";
  }
}

/**
 * Get static fallback probe question for a field (used when LLM fails)
 * Supports PACK_LE_APPS and driving packs
 * 
 * For fields with multi-level probing (like collisionDate), uses the MULTI_LEVEL_PROBES config.
 */
function getStaticFallbackQuestion(fieldName, probeCount, currentValue, incidentContext = {}) {
  const isFirstProbe = probeCount === 0;
  const isSecondProbe = probeCount === 1;
  
  switch (fieldName) {
    // === PACK_LE_APPS fields ===
    case "agency":
      if (isFirstProbe) {
        return "It's important that we know which agency you applied to. Can you please provide the name of the law enforcement agency, even if you're not 100% certain of the exact name?";
      }
      return "I understand you may not remember exactly, but any information about the agency—such as the city, county, or type of department—would be helpful. What can you tell me?";
    
    case "position":
      if (isFirstProbe) {
        return "What position were you applying for at this agency? For example, was it a police officer, deputy sheriff, corrections officer, or another role?";
      }
      return "Even a general description of the role would help. Was it a sworn position, civilian role, or something else?";
    
    case "monthYear":
      if (isFirstProbe) {
        return "We need at least an approximate timeframe for this application. Can you give us an estimate, like 'around 2020' or 'early 2019'?";
      }
      return "Think about what else was happening in your life at that time. Can you estimate even the year you applied?";
    
    case "outcome":
      if (isFirstProbe) {
        return "What was the final result of your application? Were you hired, not selected, did you withdraw, or is it still pending?";
      }
      return "Please clarify: did the process end with you being hired, rejected, withdrawing your application, or are you still waiting to hear back?";
    
    case "reason":
      if (isFirstProbe) {
        return "Were you given any reason for why you were not selected? This could include failing a test, background issues, or the agency's decision.";
      }
      return "Even if you weren't given an official reason, do you have any understanding of why the process ended the way it did?";
    
    case "issues":
      if (isFirstProbe) {
        return "You indicated there were issues during this hiring process. Please describe what those issues or concerns were.";
      }
      return "Can you provide more detail about the issues that came up? For example, was it related to your background, testing, or something else?";
    
    case "stageReached":
      if (isFirstProbe) {
        return "How far did you get in the hiring process before it ended? Did you complete the written test, physical test, interview, background investigation, polygraph, or psychological evaluation?";
      }
      return "What was the last step you completed in their process?";
    
    // === DRIVING COLLISION fields ===
    // collisionDate uses smart multi-level probing
    case "collisionDate":
      if (isFirstProbe) {
        return "I understand you don't recall the exact date. Even if you're not sure of the month, what's the closest you can get to the year? For example, was it closer to 2010, 2015, 2020, or another timeframe?";
      }
      if (isSecondProbe) {
        return "Think about what was going on in your life at the time of this collision—where you were living, what job you had, or any major life events happening then. Does that help you narrow down an approximate year or season?";
      }
      return "If you still can't pinpoint a specific year, that's okay. Please give your best estimate as a range, like 'sometime between 2010 and 2015' or 'early 2020s'. Any approximate timeframe will help.";
    
    case "collisionLocation":
      if (isFirstProbe) {
        return "Where did this collision take place? Please describe the location, such as the city, street, or general area.";
      }
      return "Can you provide any details about where this collision occurred?";
    
    case "collisionDescription":
      if (isFirstProbe) {
        return "Please describe what happened in this collision. How did the accident occur?";
      }
      return "Can you provide more details about how this collision happened?";
    
    case "atFault":
      if (isFirstProbe) {
        return "Were you determined to be at fault for this collision, either fully or partially?";
      }
      return "Was any fault assigned to you in this collision?";
    
    case "injuries":
      if (isFirstProbe) {
        return "You mentioned you're not sure about injuries. Think back to the collision: did anyone complain of pain, soreness, or stiffness afterward — including you, your passengers, or people in the other vehicle?";
      }
      if (isSecondProbe) {
        return "To the best of your memory, did anyone see a doctor, go to the hospital, or miss work or school because of this collision? If so, who was it — you, a passenger, or someone in the other vehicle?";
      }
      return "Even if you can't remember exact details, give your best estimate of how serious any injuries were — for example, 'minor soreness only', 'possible whiplash', or 'someone went to the ER'.";
    
    case "propertyDamage":
      if (isFirstProbe) {
        return "Was there property damage as a result of this collision? Please describe the damage to vehicles or other property.";
      }
      return "What property was damaged in this collision?";
    
    case "citations":
      if (isFirstProbe) {
        return "Were any citations or tickets issued as a result of this collision?";
      }
      return "Did you receive any traffic citations from this incident?";
    
    case "alcoholInvolved":
      if (isFirstProbe) {
        return "Was alcohol or any other substance involved in this collision?";
      }
      return "Were you or any other party under the influence during this collision?";
    
    // === DRIVING VIOLATIONS fields ===
    case "violationDate":
      if (isFirstProbe) {
        return "When did this violation occur? Please provide at least the month and year.";
      }
      return "Can you estimate when this violation happened?";
    
    case "violationType":
      if (isFirstProbe) {
        return "What type of violation was this? For example, speeding, running a red light, improper lane change, etc.";
      }
      return "Can you describe what you were cited for?";
    
    case "violationLocation":
      if (isFirstProbe) {
        return "Where did this violation occur? Please describe the location.";
      }
      return "Can you provide the location of this traffic stop?";
    
    case "fines":
      if (isFirstProbe) {
        return "Were there any fines associated with this violation? If so, how much?";
      }
      return "What was the fine amount for this violation?";
    
    case "points":
      if (isFirstProbe) {
        return "Were any points added to your driving record as a result of this violation?";
      }
      return "How many points, if any, were assessed?";
    
    // === GENERAL DRIVING fields ===
    case "incidentDate":
      if (isFirstProbe) {
        return "When did this incident occur? Please provide at least the month and year.";
      }
      return "Can you estimate when this happened?";
    
    case "incidentType":
      if (isFirstProbe) {
        return "What type of driving incident was this?";
      }
      return "Can you describe what type of incident this was?";
    
    case "incidentDescription":
      if (isFirstProbe) {
        return "Please describe what happened in this incident.";
      }
      return "Can you provide more details about this incident?";
    
    default:
      return `Can you provide more details about ${fieldName}?`;
  }
}

/**
 * Field labels for human-readable prompts
 * Supports PACK_LE_APPS and driving packs
 */
const FIELD_LABELS = {
  // PACK_LE_APPS
  "agency": "Agency / Department",
  "position": "Position Applied For",
  "monthYear": "Application Date (month/year)",
  "outcome": "Outcome",
  "reason": "Reason for Non-Selection",
  "issues": "Issues or Concerns",
  "stageReached": "Stage Reached in Hiring Process",
  
  // DRIVING COLLISION
  "collisionDate": "Collision Date (month/year)",
  "collisionLocation": "Collision Location",
  "collisionDescription": "Description of Collision",
  "atFault": "At Fault",
  "injuries": "Injuries",
  "propertyDamage": "Property Damage",
  "citations": "Citations Issued",
  "alcoholInvolved": "Alcohol/Substances Involved",
  
  // DRIVING VIOLATIONS
  "violationDate": "Violation Date (month/year)",
  "violationType": "Type of Violation",
  "violationLocation": "Violation Location",
  "fines": "Fines",
  "points": "Points on License",
  
  // GENERAL DRIVING
  "incidentDate": "Incident Date (month/year)",
  "incidentType": "Type of Incident",
  "incidentDescription": "Description of Incident"
};

/**
 * Generate a probe question for a specific incomplete field using LLM
 * Falls back to static question if LLM fails
 * NOW USES: GlobalSettings AI runtime config (model, temperature, max_tokens, top_p)
 */
async function generateFieldProbeQuestion(base44Client, {
  fieldName,
  currentValue,
  probeCount,
  incidentContext = {},
  packId,
  maxProbesPerField
}) {
  console.log(`[V2-PER-FIELD] Generating probe for ${fieldName} (probe #${probeCount + 1})`);
  
  const fieldLabel = FIELD_LABELS[fieldName] || fieldName;
  
  try {
    // Build unified instructions from GlobalSettings + FollowUpPack
    const { instructions, aiConfig } = await buildFieldProbeInstructions(
      base44Client,
      packId,
      fieldName,
      fieldLabel,
      maxProbesPerField
    );
    
    // Build user prompt with context
    const userPrompt = `The candidate was asked about: "${fieldLabel}"
Their answer was: "${currentValue || '(no answer provided)'}"

This is probe attempt #${probeCount + 1} of ${maxProbesPerField} allowed for this field.

Context from other fields in this incident:
${Object.entries(incidentContext)
  .filter(([k, v]) => v && k !== fieldName)
  .map(([k, v]) => `- ${FIELD_LABELS[k] || k}: ${v}`)
  .join('\n') || '(no other fields answered yet)'}

Generate ONE specific follow-up question to get a clearer answer for the "${fieldLabel}" field.`;

    // EXPLICIT LOGGING: About to call LLM
    console.log(`[V2-LLM] Calling InvokeLLM for pack=${packId}, field=${fieldName}, probeCount=${probeCount}`);
    console.log(`[V2-LLM] AI Config: model=${aiConfig.model}, temp=${aiConfig.temperature}, max_tokens=${aiConfig.max_tokens}`);
    
    // Call InvokeLLM with unified instructions AND AI runtime config
    const result = await base44Client.integrations.Core.InvokeLLM({
      prompt: `${instructions}\n\n${userPrompt}`,
      add_context_from_internet: false,
      model: aiConfig.model,
      temperature: aiConfig.temperature,
      max_tokens: aiConfig.max_tokens,
      top_p: aiConfig.top_p
    });
    
    const question = result?.trim();
    
    if (question && question.length >= 10 && question.length <= 500) {
      // EXPLICIT LOGGING: LLM success
      console.log(`[V2-LLM] Probe question generated by LLM for pack=${packId}, field=${fieldName}`);
      console.log(`[V2-LLM] Question: "${question.substring(0, 80)}..."`);
      return { question, isFallback: false, source: 'llm', model: aiConfig.model };
    } else {
      // EXPLICIT LOGGING: LLM returned invalid output
      console.warn(`[V2-LLM] Invalid or empty LLM probe output for pack=${packId}, field=${fieldName} - using fallback`);
      console.warn(`[V2-LLM] Raw output was: "${result}"`);
      const fallback = getStaticFallbackQuestion(fieldName, probeCount, currentValue, incidentContext);
      return { question: fallback, isFallback: true, source: 'fallback_invalid_llm' };
    }
    
  } catch (err) {
    // EXPLICIT LOGGING: LLM error
    console.error(`[V2-LLM] Error from InvokeLLM for pack=${packId}, field=${fieldName} - falling back to static probe`);
    console.error(`[V2-LLM] Error details:`, err.message);
    const fallback = getStaticFallbackQuestion(fieldName, probeCount, currentValue, incidentContext);
    return { question: fallback, isFallback: true, source: 'fallback_error', error: err.message };
  }
}

/**
 * Map raw field key to semantic field name
 */
function mapFieldKey(packConfig, rawFieldKey) {
  return packConfig.fieldKeyMap[rawFieldKey] || rawFieldKey;
}

/**
 * Semantic types that are considered "date" fields for no-recall forcing
 */
const DATE_SEMANTIC_TYPES = new Set([
  'monthYear', 'collisionDate', 'violationDate', 'incidentDate',
  'date', 'incident_date', 'applicationDate'
]);

/**
 * Check if a semantic field is a required date field for the pack
 */
function isRequiredDateField(packConfig, semanticField) {
  if (!packConfig) return false;
  const isDateType = DATE_SEMANTIC_TYPES.has(semanticField);
  const isRequired = packConfig.requiredFields?.includes(semanticField);
  return isDateType && isRequired;
}

/**
 * Main probe engine function - Per-Field Mode
 * NOW USES: GlobalSettings + FollowUpPack.ai_probe_instructions via InvokeLLM
 */
async function probeEngineV2(input, base44Client) {
  const {
    pack_id,
    field_key,                    // The specific field being validated
    field_value,                  // The value provided for this field
    previous_probes_count = 0,    // How many times we've probed this field
    incident_context = {},        // Other field values for context
    mode: requestMode = "VALIDATE_FIELD",  // VALIDATE_FIELD or LEGACY
    answerLooksLikeNoRecall: frontendNoRecallFlag = false  // Frontend hint
  } = input;

  console.log(`[V2-PER-FIELD] Starting validation for pack=${pack_id}, field=${field_key}, value="${field_value}", probes=${previous_probes_count}, mode=${requestMode}, frontendNoRecall=${frontendNoRecallFlag}`);

  const packConfig = PACK_CONFIG[pack_id];
  if (!packConfig) {
    console.log(`[V2-PER-FIELD] No pack config found for ${pack_id} - using generic validation`);
    
    // For unsupported packs, still apply global semantic rules
    const semanticInfo = semanticV2EvaluateAnswer(field_key, field_value, incident_context);
    
    // If the answer looks like "no recall", trigger a generic probe
    if (semanticInfo.status === "needs_probe") {
      const genericProbe = `You mentioned "${field_value || '(no answer)'}". Could you please provide a more specific answer?`;
      return {
        mode: "QUESTION",
        pack_id,
        field_key,
        semanticField: field_key,
        question: genericProbe,
        validationResult: "incomplete",
        previousProbeCount: previous_probes_count,
        maxProbesPerField: 3,
        isFallback: true,
        probeSource: 'generic_unsupported_pack',
        semanticInfo,
        message: `Generic probe for unsupported pack ${pack_id}`
      };
    }
    
    // If answer seems valid, just proceed
    return { 
      mode: "NEXT_FIELD", 
      pack_id,
      field_key,
      semanticField: field_key,
      validationResult: "complete",
      semanticInfo,
      message: `Unsupported pack ${pack_id} - accepting answer` 
    };
  }

  // Map raw field key to semantic name
  const semanticField = mapFieldKey(packConfig, field_key);
  console.log(`[V2-PER-FIELD] Mapped ${field_key} → ${semanticField}`);

  // Global v2-semantic evaluation (pack-agnostic)
  const semanticInfo = semanticV2EvaluateAnswer(semanticField, field_value, incident_context);

  // Fetch max_ai_followups from FollowUpPack entity
  let maxProbesPerField = DEFAULT_MAX_PROBES_FALLBACK;
  
  try {
    const followUpPacks = await base44Client.entities.FollowUpPack.filter({
      followup_pack_id: pack_id,
      active: true
    });
    if (followUpPacks.length > 0) {
      const packEntity = followUpPacks[0];
      
      if (typeof packEntity.max_ai_followups === 'number' && packEntity.max_ai_followups > 0) {
        maxProbesPerField = packEntity.max_ai_followups;
        console.log(`[V2-PER-FIELD] Using max_ai_followups from FollowUpPack entity: ${maxProbesPerField}`);
      } else {
        console.log(`[V2-PER-FIELD] FollowUpPack entity has no valid max_ai_followups, using fallback: ${maxProbesPerField}`);
      }
    } else {
      console.log(`[V2-PER-FIELD] No active FollowUpPack entity found for ${pack_id}, using fallback: ${maxProbesPerField}`);
    }
  } catch (err) {
    console.warn(`[V2-PER-FIELD] Error fetching FollowUpPack entity, using fallback: ${maxProbesPerField}`, err.message);
  }

  // Validate the current field value with pack-specific rules
  let validationResult = validateField(semanticField, field_value, incident_context);
  console.log(`[V2-PER-FIELD] Validation result for ${semanticField}: ${validationResult}, value="${field_value}"`);

  // v2-Semantic override:
  // If semantic layer says "needs_probe" (e.g., NO_RECALL / EMPTY),
  // and field-specific rules thought it was complete, we force probing.
  if (semanticInfo.status === "needs_probe" && validationResult === "complete") {
    console.log(`[V2-SEMANTIC] Override: semantic layer requires probing (${semanticInfo.reason}) - forcing validationResult="incomplete"`);
    validationResult = "incomplete";
  }

  // Check max probes FIRST - if we've already probed enough, stop probing
  if (previous_probes_count >= maxProbesPerField) {
    console.log(`[V2-PER-FIELD] Max probes (${maxProbesPerField}) reached for ${semanticField} → accepting and advancing`);
    return {
      mode: "NEXT_FIELD",
      pack_id,
      field_key,
      semanticField,
      validationResult: "max_probes_reached",
      previousProbeCount: previous_probes_count,
      maxProbesPerField,
      semanticInfo,
      message: `Max probes reached for ${semanticField}, accepting current value`
    };
  }

  // If field is complete (valid answer), move to next field
  if (validationResult === "complete") {
    console.log(`[V2-PER-FIELD] Field ${semanticField} is complete → advancing`);
    return {
      mode: "NEXT_FIELD",
      pack_id,
      field_key,
      semanticField,
      validationResult: "complete",
      previousProbeCount: previous_probes_count,
      maxProbesPerField,
      semanticInfo,
      message: `Field ${semanticField} validated successfully`
    };
  }

  // Field is incomplete - generate probe question using LLM (with static fallback)
  const probeResult = await generateFieldProbeQuestion(base44Client, {
    fieldName: semanticField,
    currentValue: field_value,
    probeCount: previous_probes_count,
    incidentContext: incident_context,
    packId: pack_id,
    maxProbesPerField
  });
  
  console.log(`[V2-PER-FIELD] Field ${semanticField} incomplete → returning QUESTION mode (source: ${probeResult.source})`);
  console.log(`[V2-PER-FIELD] Question: "${probeResult.question.substring(0, 80)}..."`);

  return {
    mode: "QUESTION",
    pack_id,
    field_key,
    semanticField,
    question: probeResult.question,
    validationResult: "incomplete",
    previousProbeCount: previous_probes_count,
    maxProbesPerField,
    isFallback: probeResult.isFallback,
    probeSource: probeResult.source,
    semanticInfo,
    message: `Probing for more information about ${semanticField}`
  };
}

/**
 * Deno serve handler
 */
Deno.serve(async (req) => {
  // Extract packId and fieldKey early so they're available in catch blocks
  let packId = null;
  let fieldKey = null;
  
  try {
    const base44 = createClientFromRequest(req);
    
    // Auth check with graceful failure
    let user;
    let probeCount = 0;
    try {
      user = await base44.auth.me();
    } catch (authError) {
      console.error('[V2-PER-FIELD][BACKEND-ERROR]', { fieldKey, packId, error: authError.message });
      
      // Try to parse input for fallback even if auth fails
      try {
        const bodyText = await req.text();
        const parsed = JSON.parse(bodyText);
        packId = parsed.pack_id;
        fieldKey = parsed.field_key;
        probeCount = parsed.previous_probes_count || 0;
      } catch (e) {
        // Ignore parse errors here
      }
      
      const packConfig = PACK_CONFIG[packId];
      const semanticField = packConfig ? mapFieldKey(packConfig, fieldKey) : null;
      const fallback = buildFallbackProbeForField({ packId, fieldKey, semanticField, probeCount });
      if (fallback) {
        console.log('[V2-PER-FIELD] Auth error → using deterministic fallback probe for field', { packId, fieldKey, probeCount });
        return Response.json({
          mode: fallback.mode,
          question: fallback.question,
          packId,
          fieldKey,
          isFallback: true,
        }, { status: 200 });
      }
      
      return Response.json({ 
        mode: "NONE",
        reason: "BACKEND_ERROR",
        details: authError.message || "Authentication failed"
      }, { status: 200 });
    }
    
    if (!user) {
      console.error('[V2-PER-FIELD][BACKEND-ERROR]', { fieldKey, packId, error: "User not authenticated" });
      
      const packConfig = PACK_CONFIG[packId];
      const semanticField = packConfig ? mapFieldKey(packConfig, fieldKey) : null;
      const fallback = buildFallbackProbeForField({ packId, fieldKey, semanticField, probeCount });
      if (fallback) {
        console.log('[V2-PER-FIELD] No user → using deterministic fallback probe for field', { packId, fieldKey, probeCount });
        return Response.json({
          mode: fallback.mode,
          question: fallback.question,
          packId,
          fieldKey,
          isFallback: true,
        }, { status: 200 });
      }
      
      return Response.json({ 
        mode: "NONE",
        reason: "BACKEND_ERROR",
        details: "User not authenticated"
      }, { status: 200 });
    }
    
    let input;
    try {
      input = await req.json();
      packId = input.pack_id;
      fieldKey = input.field_key;
    } catch (parseError) {
      console.error('[V2-PER-FIELD][BACKEND-ERROR]', { fieldKey, packId, error: parseError.message });
      return Response.json({ 
        mode: "NONE",
        reason: "BACKEND_ERROR",
        details: parseError.message || "Invalid request body"
      }, { status: 200 });
    }
    
    console.log('[PROBE_ENGINE_V2] Request received:', JSON.stringify(input));
    
    const result = await probeEngineV2(input, base44);
    console.log('[PROBE_ENGINE_V2] Response:', JSON.stringify(result));
    
    return Response.json(result);
  } catch (error) {
    // CRITICAL: Return 200 with structured response, NOT 500 or mode="ERROR"
    // This allows frontend to treat it as "no probe available"
    console.error('[V2-PER-FIELD][BACKEND-ERROR]', { fieldKey, packId, error: error.message });
    
    // Try to get probeCount from request for multi-level fallback
    let probeCount = 0;
    try {
      // Note: req.json() might have already been consumed, so this is best-effort
      probeCount = 0; // Default to first probe level
    } catch (e) {}
    
    // Try fallback probe for this field
    const packConfig = PACK_CONFIG[packId];
    const semanticField = packConfig ? mapFieldKey(packConfig, fieldKey) : null;
    const fallback = buildFallbackProbeForField({ packId, fieldKey, semanticField, probeCount });
    if (fallback) {
      console.log('[V2-PER-FIELD] Unhandled error → using deterministic fallback probe for field', { packId, fieldKey, probeCount });
      return Response.json({
        mode: fallback.mode,
        question: fallback.question,
        packId,
        fieldKey,
        isFallback: true,
      }, { status: 200 });
    }
    
    return Response.json({ 
      mode: "NONE",
      reason: "BACKEND_ERROR",
      details: error.message || "Unexpected error during probing."
    }, { status: 200 });
  }
});