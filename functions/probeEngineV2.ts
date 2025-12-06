import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * ProbeEngineV2 - Universal MVP Probing Engine
 * 
 * V2.6 Universal MVP:
 * - ALL V2 packs use Discretion Engine for AI-driven probing
 * - NO deterministic follow-up questions surface to candidates
 * - Per-instance state tracking with fact anchors
 * - Minimal questions to collect critical BI facts
 * 
 * Flow:
 * 1. Extract anchors from candidate answer
 * 2. Call Discretion Engine to decide: STOP / ASK_COMBINED / ASK_MICRO
 * 3. Return question from Discretion Engine or advance
 */

// Default max probes fallback - only used if pack entity doesn't have max_ai_followups set
const DEFAULT_MAX_PROBES_FALLBACK = 3;

// V2.6 Universal MVP: Use Discretion Engine for ALL pack openings and probing
// No more static opening messages - Discretion Engine generates context-aware questions

// ============================================================================
// GOLDEN MVP RULE: DETERMINISTIC FIELD ANCHOR EXTRACTION REGISTRY
// ============================================================================
/**
 * GOLDEN MVP RULE FOR V2 FACT EXTRACTION:
 * 
 * For every V2 pack + field that participates in gating (via requiresMissing / skipUnless),
 * there MUST be a deterministic extractor that derives those anchors from the field's answer.
 * 
 * This registry maps (packId, fieldKey) → extractor function.
 * Extractors are rule-based and predictable (simple string/regex rules).
 * Same narrative → same anchor values → stable gating.
 * 
 * EXTENSIBILITY:
 * - Add new packs/fields here as they adopt V2 anchor-based gating
 * - Extractors must return { anchors: {...}, collectedAnchors: {...} }
 * - Missing extractors log WARN messages for configuration debugging
 */

/**
 * Deterministic extractor for PACK_PRIOR_LE_APPS_STANDARD / PACK_PRLE_Q01
 * Derives application_outcome and other anchors from the narrative text
 * 
 * @param {object} params
 * @param {string} params.text - Raw narrative answer from candidate
 * @returns {object} { anchors: {...}, collectedAnchors: {...} }
 */
function extractPriorLeAppsAnchors({ text }) {
  if (!text || text.trim().length < 10) {
    return { anchors: {}, collectedAnchors: {} };
  }
  
  const normalized = text.toLowerCase().trim();
  const anchors = {};
  
  console.log(`[EXTRACTOR][PRIOR_LE_APPS] ========== DETERMINISTIC EXTRACTION START ==========`);
  console.log(`[EXTRACTOR][PRIOR_LE_APPS] Input length: ${text.length}`);
  console.log(`[EXTRACTOR][PRIOR_LE_APPS] Input preview: "${text.substring(0, 150)}..."`);
  
  // ===== ANCHOR 1: application_outcome (CRITICAL for PACK_PRLE_Q02 gating) =====
  // Precedence order (most definitive first):
  
  // 1. DISQUALIFIED (most common)
  const disqualifiedPatterns = [
    "disqualified", "dq'd", "dq", "dq'ed", "was dq", "got dq",
    "failed background", "failed the background",
    "background investigation disqualified", "disqualified during the background",
    "not selected", "wasn't selected", "was not selected",
    "rejected", "not hired", "wasn't hired", "was not hired",
    "did not get", "didn't get", "didn't get hired",
    "was denied", "denied employment",
    "removed from consideration", "removed from the process",
    "did not make it", "didn't make it", "didn't make the cut",
    "didn't pass", "did not pass", "unsuccessful"
  ];
  
  for (const pattern of disqualifiedPatterns) {
    if (normalized.includes(pattern)) {
      anchors.application_outcome = "disqualified";
      console.log(`[EXTRACTOR][PRIOR_LE_APPS] ✓ application_outcome="disqualified" (matched: "${pattern}")`);
      break;
    }
  }
  
  // 2. WITHDREW (check only if not already disqualified)
  if (!anchors.application_outcome) {
    const withdrewPatterns = [
      "withdrew", "withdraw", "withdrawn",
      "pulled my application", "pulled out", "pulled application",
      "decided not to continue", "chose not to continue",
      "dropped out", "backed out",
      "removed myself", "took myself out"
    ];
    
    for (const pattern of withdrewPatterns) {
      if (normalized.includes(pattern)) {
        anchors.application_outcome = "withdrew";
        console.log(`[EXTRACTOR][PRIOR_LE_APPS] ✓ application_outcome="withdrew" (matched: "${pattern}")`);
        break;
      }
    }
  }
  
  // 3. HIRED (check only if no other outcome yet)
  if (!anchors.application_outcome) {
    const hiredPatterns = [
      "hired", "got hired", "was hired", "were hired",
      "offered the job", "offered a job", "offered the position",
      "got the job", "got the position",
      "was offered", "were offered",
      "they brought me on", "accepted the offer",
      "started working there"
    ];
    
    for (const pattern of hiredPatterns) {
      if (normalized.includes(pattern)) {
        anchors.application_outcome = "hired";
        console.log(`[EXTRACTOR][PRIOR_LE_APPS] ✓ application_outcome="hired" (matched: "${pattern}")`);
        break;
      }
    }
  }
  
  // 4. STILL_IN_PROCESS (check last)
  if (!anchors.application_outcome) {
    const stillInProcessPatterns = [
      "still in process", "still in the process",
      "still pending", "currently pending",
      "waiting to hear back", "waiting to hear",
      "background in progress", "in progress",
      "still processing", "awaiting decision",
      "haven't heard back", "haven't heard"
    ];
    
    for (const pattern of stillInProcessPatterns) {
      if (normalized.includes(pattern)) {
        anchors.application_outcome = "still_in_process";
        console.log(`[EXTRACTOR][PRIOR_LE_APPS] ✓ application_outcome="still_in_process" (matched: "${pattern}")`);
        break;
      }
    }
  }
  
  // ===== ANCHOR 2: agency_name (optional - nice-to-have) =====
  const agencyPatterns = [
    /(?:applied\s+to\s+(?:the\s+)?)([\w\s]+(?:Police|Sheriff|Department|PD|SO|Agency|Marshal|Patrol))/i,
    /\b([\w\s]+(?:Police Department|Sheriff's Office|County Sheriff|City Police|State Police))\b/i
  ];
  
  for (const pattern of agencyPatterns) {
    const match = text.match(pattern);
    if (match && match[1] && match[1].length > 3) {
      anchors.agency_name = match[1].trim();
      console.log(`[EXTRACTOR][PRIOR_LE_APPS] ✓ agency_name="${anchors.agency_name}" (regex match)`);
      break;
    }
  }
  
  // ===== ANCHOR 3: position (optional - nice-to-have) =====
  const positionPatterns = [
    /(?:applied\s+(?:for|as)\s+(?:a\s+)?)(police officer|officer|deputy|sheriff|detective|trooper|agent|corrections officer|dispatcher|cadet)/i,
    /\b(police officer|officer|deputy|sheriff|detective|trooper|agent|corrections officer)\s+(?:position|role|job)/i
  ];
  
  for (const pattern of positionPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      anchors.position = match[1].trim();
      console.log(`[EXTRACTOR][PRIOR_LE_APPS] ✓ position="${anchors.position}" (regex match)`);
      break;
    }
  }
  
  // ===== ANCHOR 4: month_year (optional - uses existing helper) =====
  const dateExtraction = extractMonthYearFromText(text);
  if (dateExtraction.value) {
    anchors.month_year = dateExtraction.value;
    console.log(`[EXTRACTOR][PRIOR_LE_APPS] ✓ month_year="${anchors.month_year}" (confidence: ${dateExtraction.confidence})`);
  }
  
  console.log(`[EXTRACTOR][PRIOR_LE_APPS] ========== EXTRACTION COMPLETE ==========`);
  console.log(`[EXTRACTOR][PRIOR_LE_APPS] Total anchors extracted: ${Object.keys(anchors).length}`);
  console.log(`[EXTRACTOR][PRIOR_LE_APPS] Final anchors:`, anchors);
  
  // Return both anchors and collectedAnchors (they should be the same for deterministic extraction)
  return {
    anchors: { ...anchors },
    collectedAnchors: { ...anchors }
  };
}

/**
 * Central field anchor extractor registry
 * Maps (packId, fieldKey) → deterministic extractor function
 * 
 * EXTENSION PATTERN:
 * To add a new pack/field:
 * 1. Create an extractor function like extractPriorLeAppsAnchors
 * 2. Register it here under the pack's key
 * 3. The engine will automatically call it for that (packId, fieldKey)
 */
const FIELD_ANCHOR_EXTRACTORS = {
  PACK_PRIOR_LE_APPS_STANDARD: {
    PACK_PRLE_Q01: extractPriorLeAppsAnchors
    // Future: PACK_PRLE_Q02, Q03, etc. if they need anchor extraction
  }
  // Future packs:
  // PACK_DRIVING_COLLISION_STANDARD: { PACK_DRIVING_COLLISION_Q01: extractDrivingCollisionAnchors },
  // PACK_DRIVING_DUIDWI_STANDARD: { PACK_DRIVING_DUIDWI_Q01: extractDuiDwiAnchors },
  // PACK_EMPLOYMENT_STANDARD: { PACK_EMPLOYMENT_Q01: extractEmploymentAnchors },
  // etc.
};

/**
 * Extract anchors for a specific field using registered deterministic extractors
 * 
 * This is the SINGLE entry point for deterministic fact extraction.
 * Every V2 field probe MUST call this before returning v2Result.
 * 
 * @param {string} packId 
 * @param {string} fieldKey 
 * @param {string} answerText - Raw answer text from candidate
 * @returns {object} { anchors: {...}, collectedAnchors: {...} }
 */
function extractAnchorsForField(packId, fieldKey, answerText) {
  console.log(`[V2_FACTS][EXTRACTOR_LOOKUP] packId="${packId}", fieldKey="${fieldKey}"`);
  console.log(`[V2_FACTS][EXTRACTOR_LOOKUP] Answer preview: "${answerText?.substring?.(0, 120)}..."`);
  
  // Look up extractor function
  const packExtractors = FIELD_ANCHOR_EXTRACTORS[packId];
  if (!packExtractors) {
    console.warn(`[V2_FACTS][MISSING_EXTRACTOR] No extractors registered for pack="${packId}"`);
    return { anchors: {}, collectedAnchors: {} };
  }
  
  const extractor = packExtractors[fieldKey];
  if (!extractor) {
    console.warn(`[V2_FACTS][MISSING_EXTRACTOR] No extractor registered for pack="${packId}", field="${fieldKey}"`);
    return { anchors: {}, collectedAnchors: {} };
  }
  
  // Call the registered extractor
  console.log(`[V2_FACTS][EXTRACTOR_FOUND] Using extractor for pack="${packId}", field="${fieldKey}"`);
  
  try {
    const result = extractor({ text: answerText });
    console.log(`[V2_FACTS][EXTRACTOR_SUCCESS] Extracted ${Object.keys(result.anchors || {}).length} anchors: [${Object.keys(result.anchors || {}).join(', ')}]`);
    return result;
  } catch (err) {
    console.error(`[V2_FACTS][EXTRACTOR_ERROR] Extractor failed for pack="${packId}", field="${fieldKey}":`, err.message);
    return { anchors: {}, collectedAnchors: {} };
  }
}

// ============================================================================
// CENTRALIZED ANCHOR EXTRACTION ENGINE
// Generic, reusable extraction logic - NO per-pack hand-coded rules needed
// Packs define anchorExtractionRules in PACK_CONFIG; this engine applies them
// ============================================================================

/**
 * Extract anchors from narrative text using declarative rules.
 * This is the SINGLE centralized extraction function for ALL packs.
 * 
 * @param {string} text - Raw narrative text from candidate
 * @param {object} anchorExtractionRules - Map of anchorKey → { outcomeValue: [keywords...] }
 * @param {object} existingAnchors - Already-collected anchors (won't overwrite)
 * @returns {object} - Map of anchorKey → extractedValue
 */
function extractAnchorsFromNarrative(text, anchorExtractionRules, existingAnchors = {}) {
  if (!text || !anchorExtractionRules) return {};
  
  const normalized = text.toLowerCase().trim();
  const extracted = {};
  
  console.log(`[ANCHOR_EXTRACT] ========== CENTRALIZED EXTRACTION ==========`);
  console.log(`[ANCHOR_EXTRACT] Text length: ${text.length}, Rules for: [${Object.keys(anchorExtractionRules).join(', ')}]`);
  
  for (const [anchorKey, rules] of Object.entries(anchorExtractionRules)) {
    // Skip if anchor already has a value
    if (existingAnchors[anchorKey] && existingAnchors[anchorKey].trim()) {
      console.log(`[ANCHOR_EXTRACT] ${anchorKey}: SKIP (already set to "${existingAnchors[anchorKey]}")`);
      continue;
    }
    
    // Rules can be:
    // 1. Object with outcomeValue → keywords mapping (e.g., { disqualified: ["dq", "failed"], hired: ["hired"] })
    // 2. Array of keywords (simple extraction - just checks presence)
    // 3. Special extraction type string (e.g., "month_year", "agency_name")
    
    if (typeof rules === 'object' && !Array.isArray(rules)) {
      // Outcome-style rules: { disqualified: [...], hired: [...], withdrew: [...] }
      let matched = false;
      for (const [outcomeValue, keywords] of Object.entries(rules)) {
        if (!Array.isArray(keywords)) continue;
        
        for (const keyword of keywords) {
          if (normalized.includes(keyword.toLowerCase())) {
            extracted[anchorKey] = outcomeValue;
            console.log(`[ANCHOR_EXTRACT] ${anchorKey}="${outcomeValue}" (matched: "${keyword}")`);
            matched = true;
            break;
          }
        }
        if (matched) break;
      }
      if (!matched) {
        console.log(`[ANCHOR_EXTRACT] ${anchorKey}: NO MATCH`);
      }
    } else if (Array.isArray(rules)) {
      // Simple keyword presence check
      for (const keyword of rules) {
        if (normalized.includes(keyword.toLowerCase())) {
          extracted[anchorKey] = keyword;
          console.log(`[ANCHOR_EXTRACT] ${anchorKey}="${keyword}" (simple match)`);
          break;
        }
      }
    } else if (typeof rules === 'string') {
      // Special extraction types
      const extractedValue = extractSpecialAnchorType(text, rules);
      if (extractedValue) {
        extracted[anchorKey] = extractedValue;
        console.log(`[ANCHOR_EXTRACT] ${anchorKey}="${extractedValue}" (special: ${rules})`);
      }
    }
  }
  
  console.log(`[ANCHOR_EXTRACT] Total extracted: ${Object.keys(extracted).length} anchors`);
  return extracted;
}

/**
 * Extract special anchor types (month_year, agency_name, position, location)
 */
function extractSpecialAnchorType(text, extractionType) {
  switch (extractionType) {
    case 'month_year': {
      const result = extractMonthYearFromText(text);
      return result.value || null;
    }
    
    case 'agency_name': {
      const agencyPatterns = [
        /(?:applied\s+to\s+(?:the\s+)?)([\w\s]+(?:Police|Sheriff|Department|PD|SO|Agency|Marshal|Patrol))/i,
        /\b([\w\s]+(?:Police Department|Sheriff's Office|Sheriff Office|County Sheriff|City Police|State Police|Highway Patrol|Marshal's Office))\b/i,
        /\b([A-Z][A-Za-z\s]+(?:Police|Sheriff|PD|SO|Agency))\b/i
      ];
      for (const pattern of agencyPatterns) {
        const match = text.match(pattern);
        if (match && match[1] && match[1].length > 3) {
          return match[1].trim();
        }
      }
      return null;
    }
    
    case 'position': {
      const positionPatterns = [
        /(?:applied\s+(?:for|as)\s+(?:a\s+)?)(police officer|officer|deputy|sheriff|detective|sergeant|lieutenant|captain|trooper|agent|corrections officer|correctional officer|dispatcher|cadet|patrol officer|patrol)/i,
        /\b(police officer|officer|deputy|sheriff|detective|sergeant|lieutenant|captain|trooper|agent|corrections officer|correctional officer|dispatcher|cadet|patrol officer)\s+(?:position|role|job)/i,
        /\b(police officer|officer|deputy|sheriff|detective|sergeant|lieutenant|captain|trooper|agent|corrections officer|correctional officer|dispatcher|cadet|patrol officer)\b/i
      ];
      for (const pattern of positionPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          return match[1];
        }
      }
      return null;
    }
    
    case 'location': {
      const locationPatterns = [
        /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),?\s*([A-Z]{2})\b/,
        /\bin\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),?\s*([A-Z]{2})\b/i
      ];
      for (const pattern of locationPatterns) {
        const match = text.match(pattern);
        if (match) {
          return `${match[1]}, ${match[2]}`;
        }
      }
      return null;
    }
    
    case 'employer': {
      const employerPatterns = [
        /(?:worked\s+(?:at|for)\s+)([\w\s]+(?:Inc|LLC|Corp|Corporation|Company|Co\.|Ltd|Services|Solutions|Group))/i,
        /(?:employed\s+(?:at|by)\s+)([\w\s]+)/i,
        /\b([\w\s]+)\s+(?:as\s+(?:a|an)\s+)/i
      ];
      for (const pattern of employerPatterns) {
        const match = text.match(pattern);
        if (match && match[1] && match[1].length > 2) {
          return match[1].trim();
        }
      }
      return null;
    }
    
    case 'substance': {
      const substancePatterns = [
        /\b(marijuana|cannabis|weed|pot|cocaine|heroin|methamphetamine|meth|ecstasy|mdma|lsd|mushrooms|psilocybin|opioids?|fentanyl|xanax|adderall|pills?|alcohol|beer|wine|liquor)\b/i
      ];
      for (const pattern of substancePatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          return match[1].toLowerCase();
        }
      }
      return null;
    }
    
    default:
      return null;
  }
}

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
 * 
 * V2.5 MVP: Anchored to section context, enforces topic boundaries
 */
async function buildFieldProbeInstructions(base44Client, packId, fieldName, fieldLabel, maxProbes, sectionContext) {
  const coreRules = `You are the ClearQuest AI V2 per-field probing engine.

Your ONLY job is to decide:
1) Whether a clarifying follow-up question is needed for THIS SINGLE FIELD.
2) If yes, generate ONE clear, neutral, human-readable follow-up question.

You are NOT interviewing the candidate yourself. You are helping a professional background investigator get a cleaner, more complete answer to a specific question on a law-enforcement pre-employment questionnaire.

--------------------
CRITICAL: TOPIC BOUNDARIES
--------------------
You are operating within the "${sectionContext.sectionName || 'current section'}" section.

Your follow-up question MUST:
- Stay within this section's topic area ONLY
- Never ask about topics from other sections (drugs, sexual conduct, criminal history, employment, etc. unless that IS the current section)
- Base your question ONLY on:
  * The section topic
  * The base question text: "${sectionContext.baseQuestionText || ''}"
  * The candidate's answer to this specific field

DO NOT ask about unrelated background areas.

--------------------
GENERAL BEHAVIOR
--------------------
1) DO NOT leak internal keys
- NEVER display fieldKey values (e.g. TIMELINE, AGENCY_TYPE, INCIDENT_DESCRIPTION) in your follow-up.
- If a label looks like an internal key (ALL CAPS, underscores, generic words like "DETAILS", "TIMELINE", "AGENCY_TYPE"), treat it as INTERNAL ONLY.
- Instead, use natural language based on the base question text.

BAD (not allowed):
- "Can you provide more details about TIMELINE?"
- "Please explain AGENCY_TYPE in more detail."

GOOD:
- "Can you provide more details about when this happened?"
- "Can you provide more details about the type of agency you applied to?"

2) Respect "I don't recall" / "unknown" answers
If the answer clearly expresses no memory, ask at most ONE gentle clarifying question that helps narrow down the answer WITHOUT pressuring for exact details.

Examples:
- "If you do not remember the exact month and year, please provide your best estimate (for example, early 2010, mid-2012, or late 2015)."
- "If you cannot recall exact dates, you may describe the general time period (for example, around high school graduation, during college)."

3) When follow-up IS needed
Trigger a follow-up when the answer is vague or missing essential elements (e.g., "yes", "maybe", "a long time ago").

The follow-up should:
- Be ONE short question (under 30 words)
- Be concise and neutral
- Ask only for the most important missing piece
- Stay within the section's topic boundaries

4) When NO follow-up is needed
If the answer is already clear and complete, respond with exactly: "NO_PROBE_NEEDED"

--------------------
OUTPUT FORMAT
--------------------
Respond with ONLY the follow-up question text, OR "NO_PROBE_NEEDED".
No preamble, no explanation, just the question or the exact phrase "NO_PROBE_NEEDED".`;

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
    instructions += `CRITICAL: The field identifier "${fieldName}" is an INTERNAL KEY. NEVER show it to the candidate.\n`;
    instructions += `Your goal: Get a clear, specific answer for this field using NATURAL LANGUAGE only.\n\n`;
    
    instructions += '=== PROBING LIMITS ===\n';
    instructions += `- This is probe attempt ${maxProbes > 0 ? `#X of ${maxProbes} allowed` : ''} for this field.\n`;
    instructions += `- Ask ONE concise, specific follow-up question.\n`;
    instructions += `- Keep questions brief (under 30 words).\n`;
    instructions += `- Be professional and non-judgmental.\n`;
    instructions += `- Focus on gathering factual details.\n`;
    instructions += `- Follow all date rules: ask for month/year only, never exact dates.\n\n`;

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
  "PACK_DRIVING_STANDARD_Q04": "What was the outcome of this incident?",
  
  // === PACK_INTEGRITY_APPS ===
  "agency_name": "Which agency were you applying with when this issue occurred?",
  "incident_date": "When did this occur? Please provide at least the month and year.",
  "what_omitted": "Can you describe what specific information was incomplete or inaccurate on the application?",
  "reason_omitted": "What led you to leave that information off or answer it the way you did?",
  "discovery_method": "How did this issue come to light — did you disclose it yourself, or was it found during the background?",
  "consequences": "What consequences or disciplinary action resulted from this?",
  "corrected": "Has this been addressed or corrected since then?",
  
  // === PACK_LE_MISCONDUCT_STANDARD ===
  "position_held": "What was your position or rank at that agency?",
  "employment_dates": "When were you employed there? Please provide approximate years.",
  "allegation_type": "What type of allegation or concern was this?",
  "allegation_description": "Can you describe what was alleged?",
  "ia_case_number": "Do you recall an Internal Affairs case number or reference?",
  "finding": "What was the official finding — sustained, not sustained, exonerated, or something else?",
  "discipline": "What discipline, if any, resulted from this?",
  "appealed": "Did you appeal or contest the outcome?",
  
  // === PACK_WORKPLACE_STANDARD ===
  "employer": "What company or organization were you working for when this incident occurred?",
  "position_at_time": "What was your job title or position when this happened?",
  "misconduct_type": "What type of issue was this — for example, a policy violation, dishonesty, conflict, or something else?",
  "incident_description": "Can you describe what happened in this incident?",
  "corrective_action": "What action did your employer take — for example, a warning, suspension, or termination?",
  "separation_type": "How did your employment end at this job — did you leave voluntarily, resign under pressure, or were you terminated?",
  "official_reason": "What reason did the employer give for any disciplinary action or separation?",
  "isolated_or_recurring": "Was this a one-time incident or part of a recurring pattern?",
  "impact": "What impact, if any, did this have on the workplace or your colleagues?",
  "remediation": "What steps have you taken since this incident to address or prevent similar issues?",
  
  // === PACK_INTEGRITY_APPS ===
  "position_applied_for": "What position were you applying for at that agency?",
  "issue_type": "What type of integrity issue was this — an omission, misstatement, falsification, or something else?",
  "what_omitted": "Can you describe what specific information was incomplete or inaccurate on the application?",
  "reason_omitted": "What led you to leave that information off or answer it the way you did?",
  "consequences": "What consequences resulted from this — were you removed from the process, allowed to continue, or something else?",
  "corrected": "Have you since disclosed this information on other applications?",
  "remediation_steps": "What steps have you taken to ensure accurate applications going forward?",
  
  // === PACK_LE_APPS ===
  "agency_location": "What city, county, or state is that agency located in?",
  "background_issues": "Were any background issues cited during your application process? If so, please briefly describe.",
  
  // === PACK_LE_MISCONDUCT_STANDARD ===
  "allegation_description": "Can you describe what was alleged?",
  
  // === PACK_FINANCIAL_STANDARD ===
  "financial_issue_type": "What type of financial issue was this — bankruptcy, collections, repossession, unpaid taxes, or something else?",
  "most_recent_date": "When was the most recent occurrence or action related to this issue?",
  "amount_owed": "Approximately how much was owed or affected?",
  "creditor": "Who was the creditor or agency involved?",
  "legal_actions": "Were there any legal actions taken, such as liens, garnishments, or judgments?",
  "employment_impact": "Did this issue have any impact on your employment, security clearance, or licensing?",
  "resolution_steps": "What steps have you taken to resolve this issue?",
  "resolution_status": "What is the current status — fully resolved, in repayment, still outstanding, or something else?",
  "remaining_obligations": "Are there any remaining debts or obligations from this issue?",
  
  // === PACK_GANG_STANDARD ===
  "gang_name": "What was the gang or group called, or how would you describe it?",
  "end_date": "When did your involvement with this group end?",
  "involvement_level": "How would you describe your level of involvement — were you an observer, associate, active participant, or member?",
  "origin_story": "How did you first become involved with this group?",
  "activities": "What activities did you observe or participate in while involved?",
  "illegal_activity": "Were you involved in or did you witness any illegal activity during this time?",
  "post_exit_contact": "Have you had any contact with members of this group since you separated?",
  
  // === PACK_MILITARY_STANDARD ===
  "branch": "Which branch of military service were you in at the time of this incident?",
  "rank_role": "What was your rank and duty position when this occurred?",
  "incident_date": "When did this incident occur? Please provide at least an approximate month and year.",
  "location": "Where did this incident take place?",
  "description": "Can you describe what happened?",
  "orders_violation": "What orders, regulations, or standards were involved?",
  "alcohol_drugs": "Were alcohol, drugs, or stress factors involved in this incident?",
  "disciplinary_action": "What disciplinary action was taken as a result?",
  "career_impact": "How did this affect your rank, clearance, or military career?",
  "remediation_steps": "What steps have you taken since this incident to address the issue?",
  
  // === PACK_WEAPONS_STANDARD ===
  "weapon_type": "What type of weapon was involved in this incident?",
  "weapon_ownership": "Did you own or possess this weapon, or did it belong to someone else?",
  "weapon_use": "How was the weapon used, carried, or displayed during this incident?",
  "threats": "Were there any threats made or danger posed to others during this incident?",
  "discharge": "Was the weapon discharged, either intentionally or accidentally?",
  "actions_taken": "What actions were taken afterward — such as arrest, charges, or discipline?",
  
  // === PACK_SEX_ADULT_STANDARD ===
  "type": "What type of misconduct was this incident?",
  "when": "When did this incident occur? Please provide at least the month and year.",
  "where": "Where did this incident take place?",
  "consensual": "Was the conduct consensual between the adults involved?",
  "environment": "What was the setting or environment where this occurred?",
  "authority_awareness": "Were any authorities, supervisors, or employers made aware of this incident?",
  "consequences": "What consequences or actions resulted from this incident?",
  
  // === PACK_NON_CONSENT_STANDARD ===
  "incident_type": "What type of incident was this?",
  "date": "When did this incident occur? Please provide at least the month and year.",
  "location": "Where did this incident take place?",
  "other_party": "What was your relationship to the other person involved?",
  "narrative": "Can you provide a high-level summary of what occurred?",
  "coercion": "Was there any force, intimidation, or coercion involved?",
  "consent_signals": "Were there any signals indicating lack of consent?",
  "injuries": "Were any injuries reported as a result of this incident?",
  "legal_action": "Was there any police, employer, or school involvement or action taken?",
  
  // === PACK_DRUG_SALE_STANDARD ===
  "substance_type": "What type of substance was involved?",
  "role": "What was your role or involvement in this activity?",
  "approx_date": "When did this occur? Please provide at least the month and year, or your approximate age.",
  "frequency": "How often did this occur, or how many times?",
  "associates": "Were other people involved? If so, what were their roles?",
  "compensation": "Was there any profit, compensation, or financial gain?",
  "weapons_violence": "Were any weapons or violence involved?",
  "law_enforcement_involved": "Was law enforcement ever involved or aware of this activity?",
  "arrested_charged": "Were you ever arrested or charged in connection with this activity?",
  "disclosed_prior": "Have you previously disclosed this on any application or background investigation?",
  "recurrence": "Has this type of activity occurred again since?",
  "prevention_steps": "What steps have you taken to ensure this does not happen again?",
  
  // === PACK_DRUG_USE_STANDARD ===
  "first_use_date": "When did you first use this substance? Please provide at least the month and year.",
  "last_use_date": "When was the most recent time you used this substance?",
  "total_uses": "About how many times in total have you used this substance?",
  "use_context": "What was the setting or situation when you used this substance?",
  "use_location": "Where did you typically use this substance?",
  "obtain_method": "How did you obtain this substance?",
  "under_influence_in_prohibited_setting": "Were you ever under the influence of this substance in a prohibited setting?",
  "consequences": "Did this cause any legal, school, or employment issues?",
  "prior_disclosure": "Have you disclosed this to any prior employer or agency?",
  "other_substances_used": "Were there other related substances you also used?",
  "behavior_stopped": "Has this behavior stopped? If so, when?",
  "mitigation_steps": "What steps have you taken to avoid future use?",
  
  // === PACK_PRESCRIPTION_MISUSE_STANDARD ===
  "medication_type": "What prescription medication was involved?",
  "access_source": "Was this medication prescribed to you, someone else, or obtained without a prescription?",
  "first_occurrence_date": "When did this misuse first occur? Please provide at least the month and year.",
  "most_recent_date": "When was the most recent occurrence?",
  "total_occurrences": "How many times have you misused this medication?",
  "misuse_method": "What was the method of misuse?",
  "misuse_location": "Where did this misuse typically occur?",
  "impairment_settings": "Were you ever under the influence of this medication at work, school, while driving, or in public?",
  "confrontation_discipline": "Were you ever confronted, warned, or disciplined by anyone regarding this misuse?",
  "authority_awareness": "Did law enforcement, a doctor, or an employer ever become aware of this?",
  "help_sought": "Have you attempted to stop, seek help, or change your behavior?",
  "recurrence": "Has this misuse occurred again since the highest-risk incident you described?",
  "prevention_steps": "What steps have you taken to ensure this will not happen again?",
  
  // === PACK_PRIOR_LE_APPS_STANDARD (question codes) ===
  "PACK_PRLE_Q01": "For this application, what was the name of the law enforcement department or agency, what position did you apply for, and about what month and year did you apply?",
  "PACK_PRLE_Q02": "What was the outcome of that application? (For example: hired, disqualified, withdrew, or still in process.)",
  "PACK_PRLE_Q03": "Which city and state was that agency in?",
  "PACK_PRLE_Q04": "About when did you apply there? Month and year is fine.",
  "PACK_PRLE_Q05": "What position or job title did you apply for with that agency?",
  "PACK_PRLE_Q06": "What was the outcome of that application? (For example: hired, disqualified, withdrew, still in process, or something else.)",
  "PACK_PRLE_Q07": "If you were not hired, what reason were you given, or what do you believe was the main reason?",
  "PACK_PRLE_Q08": "Did you appeal that decision or reapply with that agency? If yes, what happened?",
  "PACK_PRLE_Q09": "Is there anything else about that application that you think your background investigator should know?"
});

/**
 * Build a deterministic fallback probe for specific fields when AI/validation fails.
 * This ensures probing is rock-solid even when the backend has issues.
 * Supports PACK_LE_APPS, PACK_INTEGRITY_APPS, PACK_LE_MISCONDUCT_STANDARD, and driving packs.
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
  const supportedPacks = ["PACK_LE_APPS", "PACK_INTEGRITY_APPS", "PACK_LE_MISCONDUCT_STANDARD", "PACK_DRIVING_COLLISION_STANDARD", "PACK_DRIVING_VIOLATIONS_STANDARD", "PACK_DRIVING_STANDARD", "PACK_DRIVING_DUIDWI_STANDARD", "PACK_WORKPLACE_STANDARD", "PACK_FINANCIAL_STANDARD", "PACK_GANG_STANDARD", "PACK_MILITARY_STANDARD", "PACK_WEAPONS_STANDARD", "PACK_SEX_ADULT_STANDARD", "PACK_NON_CONSENT_STANDARD", "PACK_DRUG_SALE_STANDARD", "PACK_DRUG_USE_STANDARD", "PACK_PRESCRIPTION_MISUSE_STANDARD", "PACK_PRIOR_LE_APPS_STANDARD"];
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
    requiredFields: ["agency_name", "agency_location", "application_date", "position", "outcome", "stage_reached", "reason_not_selected", "full_disclosure"],
    priorityOrder: ["agency_name", "agency_location", "application_date", "position", "outcome", "stage_reached", "reason_not_selected", "full_disclosure"],
    fieldKeyMap: {
      // Legacy mappings
      "PACK_LE_APPS_Q1": "agency_name",
      "PACK_LE_APPS_Q1764025170356": "position",
      "PACK_LE_APPS_Q1764025187292": "application_date",
      "PACK_LE_APPS_Q1764025199138": "outcome",
      "PACK_LE_APPS_Q1764025212764": "reason_not_selected",
      "PACK_LE_APPS_Q1764025246583": "stage_reached",
      // New field_config mappings
      "agency_name": "agency_name",
      "agency_location": "agency_location",
      "application_date": "application_date",
      "position": "position",
      "outcome": "outcome",
      "stage_reached": "stage_reached",
      "reason_not_selected": "reason_not_selected",
      "full_disclosure": "full_disclosure",
      "has_documentation": "has_documentation",
      // Legacy semantic aliases
      "agency": "agency_name",
      "monthYear": "application_date",
      "reason": "reason_not_selected",
      "stageReached": "stage_reached",
    },
  },
  
  // Application Integrity Issues pack (v2.4 consolidated)
  PACK_INTEGRITY_APPS: {
    id: "PACK_INTEGRITY_APPS",
    useNarrativeFirst: true,
    primaryField: "PACK_INTEGRITY_APPS_NARRATIVE",
    requiredAnchors: ["agency", "month_year", "issue_type", "outcome"],
    requiredFields: ["agency_name", "incident_date", "issue_type", "what_omitted", "reason_omitted", "discovery_method", "consequences"],
    priorityOrder: ["agency_name", "position_applied_for", "incident_date", "issue_type", "what_omitted", "reason_omitted", "discovery_method", "consequences", "corrected", "remediation_steps"],
    anchorExtractionRules: {
      agency: "agency_name",
      month_year: "month_year",
      issue_type: {
        "omission": ["omitted", "left off", "forgot to include", "didn't mention", "failed to disclose"],
        "false statement": ["false statement", "lied", "misrepresented", "falsified"],
        "cheating": ["cheating", "cheated", "copied"]
      },
      outcome: {
        "disqualified": ["disqualified", "removed from process", "dq'd"],
        "allowed to continue": ["allowed to continue", "continued", "let me explain"],
        "no action": ["no action", "nothing happened"]
      }
    },
    fieldKeyMap: {
      // Semantic field self-mappings
      "agency_name": "agency_name",
      "position_applied_for": "position_applied_for",
      "incident_date": "incident_date",
      "issue_type": "issue_type",
      "what_omitted": "what_omitted",
      "reason_omitted": "reason_omitted",
      "discovery_method": "discovery_method",
      "consequences": "consequences",
      "corrected": "corrected",
      "remediation_steps": "remediation_steps",
      // Legacy question mappings
      "PACK_INTEGRITY_APPS_Q01": "agency_name",
      "PACK_INTEGRITY_APPS_Q02": "incident_date",
      "PACK_INTEGRITY_APPS_Q03": "what_omitted",
      "PACK_INTEGRITY_APPS_Q04": "reason_omitted",
      "PACK_INTEGRITY_APPS_Q05": "discovery_method",
      "PACK_INTEGRITY_APPS_Q06": "consequences",
      "PACK_INTEGRITY_APPS_Q07": "corrected",
    },
  },
  
  // Prior LE Misconduct pack (v2.4)
  PACK_LE_MISCONDUCT_STANDARD: {
    id: "PACK_LE_MISCONDUCT_STANDARD",
    requiredFields: ["agency_name", "position_held", "employment_dates", "incident_date", "allegation_type", "allegation_description", "discovery_method", "finding"],
    priorityOrder: ["agency_name", "position_held", "employment_dates", "incident_date", "allegation_type", "allegation_description", "discovery_method", "ia_case_number", "finding", "discipline", "separation_type", "appealed", "has_documentation", "remediation_steps"],
    fieldKeyMap: {
      "agency_name": "agency_name",
      "position_held": "position_held",
      "employment_dates": "employment_dates",
      "incident_date": "incident_date",
      "allegation_type": "allegation_type",
      "allegation_description": "allegation_description",
      "discovery_method": "discovery_method",
      "ia_case_number": "ia_case_number",
      "finding": "finding",
      "discipline": "discipline",
      "separation_type": "separation_type",
      "appealed": "appealed",
      "has_documentation": "has_documentation",
      "remediation_steps": "remediation_steps",
      // Legacy question mappings
      "PACK_LE_MISCONDUCT_Q01": "agency_name",
      "PACK_LE_MISCONDUCT_Q02": "position_held",
      "PACK_LE_MISCONDUCT_Q03": "incident_date",
      "PACK_LE_MISCONDUCT_Q04": "allegation_type",
      "PACK_LE_MISCONDUCT_Q05": "allegation_description",
      "PACK_LE_MISCONDUCT_Q06": "finding",
      "PACK_LE_MISCONDUCT_Q07": "discipline",
    },
  },
  
  // Driving collision pack
  PACK_DRIVING_COLLISION_STANDARD: {
    id: "PACK_DRIVING_COLLISION_STANDARD",
    useNarrativeFirst: true,
    primaryField: "PACK_DRIVING_COLLISION_Q01",
    requiredAnchors: ["month_year", "location", "what_happened", "outcome"],
    requiredFields: ["collisionDate", "collisionLocation", "collisionDescription", "atFault", "injuries", "propertyDamage", "citations", "alcoholInvolved"],
    priorityOrder: ["collisionDate", "collisionLocation", "collisionDescription", "atFault", "injuries", "propertyDamage", "citations", "alcoholInvolved"],
    anchorExtractionRules: {
      month_year: "month_year",
      location: "location",
      outcome: {
        "at fault": ["at fault", "my fault", "i was at fault", "i caused", "determined to be at fault"],
        "not at fault": ["not at fault", "other driver's fault", "they were at fault", "hit by", "rear-ended by"],
        "citation issued": ["got a ticket", "received a citation", "was cited", "citation for"],
        "no citation": ["no citation", "no ticket", "warning only"]
      },
      injuries: {
        "yes": ["injured", "injury", "injuries", "hurt", "hospital", "ambulance", "ER", "emergency room", "doctor", "whiplash", "broken", "fracture"],
        "no": ["no injuries", "no one was hurt", "nobody was injured", "minor damage only"]
      }
    },
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
    useNarrativeFirst: true,
    primaryField: "PACK_DRIVING_VIOLATIONS_Q01",
    requiredAnchors: ["month_year", "violation_type", "location", "outcome"],
    requiredFields: ["violationDate", "violationType", "violationLocation", "outcome", "fines", "points"],
    priorityOrder: ["violationDate", "violationType", "violationLocation", "outcome", "fines", "points"],
    anchorExtractionRules: {
      month_year: "month_year",
      location: "location",
      violation_type: {
        "speeding": ["speeding", "speed", "going too fast", "over the limit", "mph over"],
        "red light": ["red light", "ran a red", "running a red"],
        "stop sign": ["stop sign", "ran a stop", "rolling stop"],
        "lane violation": ["lane violation", "improper lane", "lane change"],
        "equipment": ["equipment violation", "broken light", "tail light", "headlight"]
      },
      outcome: {
        "paid": ["paid", "paid the fine", "paid it"],
        "dismissed": ["dismissed", "dropped", "thrown out"],
        "reduced": ["reduced", "lesser charge", "reduced to"],
        "contested": ["contested", "fought it", "went to court"]
      }
    },
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
    useNarrativeFirst: true,
    primaryField: "PACK_DRIVING_STANDARD_Q01",
    requiredAnchors: ["month_year", "incident_type", "what_happened", "outcome"],
    requiredFields: ["incidentDate", "incidentType", "incidentDescription", "outcome"],
    priorityOrder: ["incidentDate", "incidentType", "incidentDescription", "outcome"],
    anchorExtractionRules: {
      month_year: "month_year",
      incident_type: {
        "speeding": ["speeding", "speed", "going too fast", "mph over"],
        "collision": ["collision", "accident", "crash", "hit", "rear-ended"],
        "dui": ["dui", "dwi", "drunk driving", "under the influence"],
        "reckless": ["reckless", "reckless driving", "careless driving"],
        "suspended license": ["suspended license", "driving on suspended", "no valid license"]
      },
      outcome: {
        "citation": ["citation", "ticket", "cited", "fine", "paid the fine"],
        "warning": ["warning", "verbal warning", "written warning"],
        "arrest": ["arrested", "arrest", "taken into custody"],
        "dismissed": ["dismissed", "dropped", "case dismissed"]
      }
    },
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
  
  // DUI/DWI pack
  PACK_DRIVING_DUIDWI_STANDARD: {
    id: "PACK_DRIVING_DUIDWI_STANDARD",
    useNarrativeFirst: true,
    primaryField: "PACK_DRIVING_DUIDWI_Q01",
    requiredAnchors: ["month_year", "substance_type", "location", "outcome"],
    requiredFields: ["incidentDate", "location", "substanceType", "stopReason", "testType", "testResult", "arrestStatus", "courtOutcome", "licenseImpact"],
    priorityOrder: ["incidentDate", "location", "substanceType", "stopReason", "testType", "testResult", "arrestStatus", "courtOutcome", "licenseImpact"],
    anchorExtractionRules: {
      month_year: "month_year",
      location: "location",
      substance_type: "substance",
      outcome: {
        "convicted": ["convicted", "guilty", "pled guilty", "found guilty", "dui conviction"],
        "dismissed": ["dismissed", "dropped", "case dismissed", "charges dropped"],
        "reduced": ["reduced", "wet reckless", "lesser charge"],
        "pending": ["pending", "still in court", "awaiting trial"]
      }
    },
    fieldKeyMap: {
      "PACK_DRIVING_DUIDWI_Q01": "incidentDate",
      "PACK_DRIVING_DUIDWI_Q02": "location",
      "PACK_DRIVING_DUIDWI_Q03": "substanceType",
      "PACK_DRIVING_DUIDWI_Q04": "stopReason",
      "PACK_DRIVING_DUIDWI_Q05": "testType",
      "PACK_DRIVING_DUIDWI_Q06": "testResult",
      "PACK_DRIVING_DUIDWI_Q07": "arrestStatus",
      "PACK_DRIVING_DUIDWI_Q08": "courtOutcome",
      "PACK_DRIVING_DUIDWI_Q09": "licenseImpact",
      // Semantic field name mappings
      "incidentDate": "incidentDate",
      "location": "location",
      "substanceType": "substanceType",
      "stopReason": "stopReason",
      "testType": "testType",
      "testResult": "testResult",
      "arrestStatus": "arrestStatus",
      "courtOutcome": "courtOutcome",
      "licenseImpact": "licenseImpact",
    },
  },
  
  // Workplace Integrity & Misconduct pack
  PACK_WORKPLACE_STANDARD: {
    id: "PACK_WORKPLACE_STANDARD",
    requiredFields: ["employer", "position_at_time", "incident_date", "misconduct_type", "incident_description", "corrective_action", "separation_type"],
    priorityOrder: ["employer", "position_at_time", "incident_date", "misconduct_type", "incident_description", "corrective_action", "separation_type", "official_reason", "isolated_or_recurring", "impact", "remediation"],
    fieldKeyMap: {
      "employer": "employer",
      "position_at_time": "position_at_time",
      "incident_date": "incident_date",
      "misconduct_type": "misconduct_type",
      "incident_description": "incident_description",
      "corrective_action": "corrective_action",
      "separation_type": "separation_type",
      "official_reason": "official_reason",
      "isolated_or_recurring": "isolated_or_recurring",
      "impact": "impact",
      "remediation": "remediation",
      // Legacy question mappings
      "PACK_WORKPLACE_STANDARD_Q01": "employer",
      "PACK_WORKPLACE_STANDARD_Q02": "position_at_time",
      "PACK_WORKPLACE_STANDARD_Q03": "incident_date",
      "PACK_WORKPLACE_STANDARD_Q04": "misconduct_type",
      "PACK_WORKPLACE_STANDARD_Q05": "incident_description",
      "PACK_WORKPLACE_STANDARD_Q06": "corrective_action",
      "PACK_WORKPLACE_STANDARD_Q07": "separation_type",
    },
  },
  

  
  // Financial Misconduct pack (v2.4)
  PACK_FINANCIAL_STANDARD: {
    id: "PACK_FINANCIAL_STANDARD",
    useNarrativeFirst: true,
    primaryField: "PACK_FINANCIAL_Q01",
    requiredAnchors: ["financial_issue_type", "resolution_status"],
    requiredFields: ["financial_issue_type", "start_date", "amount_owed", "resolution_steps", "resolution_status"],
    priorityOrder: ["financial_issue_type", "start_date", "most_recent_date", "amount_owed", "creditor", "legal_actions", "employment_impact", "resolution_steps", "resolution_status", "remaining_obligations", "prevention_steps"],
    anchorExtractionRules: {
      financial_issue_type: {
        "bankruptcy": ["bankruptcy", "filed bankruptcy", "chapter 7", "chapter 13"],
        "collections": ["collections", "sent to collections", "collection agency"],
        "repossession": ["repossession", "repo", "repossessed"],
        "foreclosure": ["foreclosure", "foreclosed"],
        "tax debt": ["tax debt", "owe taxes", "irs debt", "back taxes"]
      },
      resolution_status: {
        "resolved": ["resolved", "paid off", "settled", "paid in full"],
        "in payment": ["payment plan", "paying it off", "monthly payments"],
        "outstanding": ["still owe", "outstanding", "unpaid"]
      }
    },
    fieldKeyMap: {
      "financial_issue_type": "financial_issue_type",
      "start_date": "start_date",
      "most_recent_date": "most_recent_date",
      "amount_owed": "amount_owed",
      "creditor": "creditor",
      "legal_actions": "legal_actions",
      "employment_impact": "employment_impact",
      "resolution_steps": "resolution_steps",
      "resolution_status": "resolution_status",
      "remaining_obligations": "remaining_obligations",
      "prevention_steps": "prevention_steps",
      // Legacy question mappings
      "PACK_FINANCIAL_STANDARD_Q01": "financial_issue_type",
      "PACK_FINANCIAL_STANDARD_Q02": "start_date",
      "PACK_FINANCIAL_STANDARD_Q03": "amount_owed",
      "PACK_FINANCIAL_STANDARD_Q04": "creditor",
      "PACK_FINANCIAL_STANDARD_Q05": "legal_actions",
      "PACK_FINANCIAL_STANDARD_Q06": "resolution_steps",
      "PACK_FINANCIAL_STANDARD_Q07": "resolution_status",
      "PACK_FINANCIAL_STANDARD_Q08": "prevention_steps",
    },
  },
  
  // Gang Membership / Affiliation pack (v2.4)
  PACK_GANG_STANDARD: {
    id: "PACK_GANG_STANDARD",
    requiredFields: ["gang_name", "start_date", "end_date", "involvement_level", "origin_story", "activities"],
    priorityOrder: ["gang_name", "start_date", "end_date", "involvement_level", "origin_story", "activities", "illegal_activity", "law_enforcement_contact", "post_exit_contact", "prevention_steps"],
    fieldKeyMap: {
      "gang_name": "gang_name",
      "start_date": "start_date",
      "end_date": "end_date",
      "involvement_level": "involvement_level",
      "origin_story": "origin_story",
      "activities": "activities",
      "illegal_activity": "illegal_activity",
      "law_enforcement_contact": "law_enforcement_contact",
      "post_exit_contact": "post_exit_contact",
      "prevention_steps": "prevention_steps",
      // Legacy question mappings
      "PACK_GANG_STANDARD_Q01": "gang_name",
      "PACK_GANG_STANDARD_Q02": "start_date",
      "PACK_GANG_STANDARD_Q03": "end_date",
      "PACK_GANG_STANDARD_Q04": "involvement_level",
      "PACK_GANG_STANDARD_Q05": "origin_story",
      "PACK_GANG_STANDARD_Q06": "activities",
      "PACK_GANG_STANDARD_Q07": "illegal_activity",
      "PACK_GANG_STANDARD_Q08": "law_enforcement_contact",
    },
  },
  
  // Military Misconduct / Discipline pack (v2.4)
  PACK_MILITARY_STANDARD: {
    id: "PACK_MILITARY_STANDARD",
    useNarrativeFirst: true,
    primaryField: "PACK_MILITARY_Q01",
    requiredAnchors: ["branch", "month_year", "outcome"],
    requiredFields: ["branch", "rank_role", "incident_date", "description", "disciplinary_action"],
    priorityOrder: ["branch", "rank_role", "incident_date", "location", "description", "orders_violation", "alcohol_drugs", "disciplinary_action", "career_impact", "law_enforcement_contact", "remediation_steps"],
    anchorExtractionRules: {
      branch: {
        "army": ["army", "soldier"],
        "navy": ["navy", "sailor"],
        "air force": ["air force", "airman"],
        "marines": ["marines", "marine corps", "marine"],
        "coast guard": ["coast guard"]
      },
      month_year: "month_year",
      outcome: {
        "article 15": ["article 15", "nonjudicial", "njp"],
        "court martial": ["court martial", "courts martial"],
        "discharge": ["discharge", "discharged", "other than honorable", "general discharge"],
        "no action": ["no action", "cleared"]
      }
    },
    fieldKeyMap: {
      "branch": "branch",
      "rank_role": "rank_role",
      "incident_date": "incident_date",
      "location": "location",
      "description": "description",
      "orders_violation": "orders_violation",
      "alcohol_drugs": "alcohol_drugs",
      "disciplinary_action": "disciplinary_action",
      "career_impact": "career_impact",
      "law_enforcement_contact": "law_enforcement_contact",
      "remediation_steps": "remediation_steps",
      // Legacy question mappings
      "PACK_MILITARY_STANDARD_Q01": "branch",
      "PACK_MILITARY_STANDARD_Q02": "rank_role",
      "PACK_MILITARY_STANDARD_Q03": "incident_date",
      "PACK_MILITARY_STANDARD_Q04": "location",
      "PACK_MILITARY_STANDARD_Q05": "description",
      "PACK_MILITARY_STANDARD_Q06": "orders_violation",
      "PACK_MILITARY_STANDARD_Q07": "disciplinary_action",
      "PACK_MILITARY_STANDARD_Q08": "career_impact",
    },
  },
  
  // Weapons Misconduct pack (v2.4)
  PACK_WEAPONS_STANDARD: {
    id: "PACK_WEAPONS_STANDARD",
    useNarrativeFirst: true,
    primaryField: "PACK_WEAPONS_Q01",
    requiredAnchors: ["weapon_type", "month_year", "outcome"],
    requiredFields: ["weapon_type", "incident_date", "description", "weapon_use", "actions_taken"],
    priorityOrder: ["weapon_type", "weapon_ownership", "incident_date", "location", "description", "weapon_use", "threats", "discharge", "impairment", "actions_taken"],
    anchorExtractionRules: {
      weapon_type: {
        "firearm": ["firearm", "gun", "pistol", "rifle", "shotgun", "handgun"],
        "knife": ["knife", "blade"],
        "other": ["weapon", "bat", "club"]
      },
      month_year: "month_year",
      outcome: {
        "charges": ["charged", "arrested", "citation"],
        "confiscated": ["confiscated", "taken", "seized"],
        "no action": ["no action", "warning", "let go"]
      }
    },
    fieldKeyMap: {
      "weapon_type": "weapon_type",
      "weapon_ownership": "weapon_ownership",
      "incident_date": "incident_date",
      "location": "location",
      "description": "description",
      "weapon_use": "weapon_use",
      "threats": "threats",
      "discharge": "discharge",
      "impairment": "impairment",
      "actions_taken": "actions_taken",
      // Legacy question mappings
      "PACK_WEAPONS_STANDARD_Q01": "weapon_type",
      "PACK_WEAPONS_STANDARD_Q02": "weapon_ownership",
      "PACK_WEAPONS_STANDARD_Q03": "incident_date",
      "PACK_WEAPONS_STANDARD_Q04": "location",
      "PACK_WEAPONS_STANDARD_Q05": "description",
      "PACK_WEAPONS_STANDARD_Q06": "weapon_use",
      "PACK_WEAPONS_STANDARD_Q07": "threats",
      "PACK_WEAPONS_STANDARD_Q08": "actions_taken",
    },
  },
  
  // Adult Sexual Misconduct pack (v2.4)
  PACK_SEX_ADULT_STANDARD: {
    id: "PACK_SEX_ADULT_STANDARD",
    requiredFields: ["type", "when", "description", "consensual", "consequences"],
    priorityOrder: ["type", "when", "where", "consensual", "description", "impairment", "environment", "authority_awareness", "consequences"],
    fieldKeyMap: {
      "type": "type",
      "when": "when",
      "where": "where",
      "consensual": "consensual",
      "description": "description",
      "impairment": "impairment",
      "environment": "environment",
      "authority_awareness": "authority_awareness",
      "consequences": "consequences",
      // Legacy question mappings
      "PACK_SEX_ADULT_STANDARD_Q01": "type",
      "PACK_SEX_ADULT_STANDARD_Q02": "when",
      "PACK_SEX_ADULT_STANDARD_Q03": "where",
      "PACK_SEX_ADULT_STANDARD_Q04": "consensual",
      "PACK_SEX_ADULT_STANDARD_Q05": "description",
      "PACK_SEX_ADULT_STANDARD_Q06": "impairment",
      "PACK_SEX_ADULT_STANDARD_Q07": "environment",
      "PACK_SEX_ADULT_STANDARD_Q08": "consequences",
    },
  },
  
  // Sex Crimes / Non-Consent pack (v2.4)
  PACK_NON_CONSENT_STANDARD: {
    id: "PACK_NON_CONSENT_STANDARD",
    requiredFields: ["incident_type", "date", "narrative", "legal_action"],
    priorityOrder: ["incident_type", "date", "location", "other_party", "narrative", "coercion", "consent_signals", "impairment", "injuries", "legal_action"],
    fieldKeyMap: {
      "incident_type": "incident_type",
      "date": "date",
      "location": "location",
      "other_party": "other_party",
      "narrative": "narrative",
      "coercion": "coercion",
      "consent_signals": "consent_signals",
      "impairment": "impairment",
      "injuries": "injuries",
      "legal_action": "legal_action",
      // Legacy question mappings
      "PACK_NON_CONSENT_STANDARD_Q01": "incident_type",
      "PACK_NON_CONSENT_STANDARD_Q02": "date",
      "PACK_NON_CONSENT_STANDARD_Q03": "location",
      "PACK_NON_CONSENT_STANDARD_Q04": "other_party",
      "PACK_NON_CONSENT_STANDARD_Q05": "narrative",
      "PACK_NON_CONSENT_STANDARD_Q06": "coercion",
      "PACK_NON_CONSENT_STANDARD_Q07": "consent_signals",
      "PACK_NON_CONSENT_STANDARD_Q08": "legal_action",
    },
  },
  
  // Drug Sale / Manufacture / Trafficking pack (v2.4)
  PACK_DRUG_SALE_STANDARD: {
    id: "PACK_DRUG_SALE_STANDARD",
    requiredFields: ["substance_type", "role", "approx_date", "arrested_charged"],
    priorityOrder: ["substance_type", "role", "approx_date", "frequency", "location", "associates", "compensation", "weapons_violence", "law_enforcement_involved", "arrested_charged", "disclosed_prior", "recurrence", "coercion", "prevention_steps"],
    fieldKeyMap: {
      "substance_type": "substance_type",
      "role": "role",
      "approx_date": "approx_date",
      "frequency": "frequency",
      "location": "location",
      "associates": "associates",
      "compensation": "compensation",
      "weapons_violence": "weapons_violence",
      "law_enforcement_involved": "law_enforcement_involved",
      "arrested_charged": "arrested_charged",
      "disclosed_prior": "disclosed_prior",
      "recurrence": "recurrence",
      "coercion": "coercion",
      "prevention_steps": "prevention_steps",
      // Legacy question mappings
      "PACK_DRUG_SALE_STANDARD_Q01": "substance_type",
      "PACK_DRUG_SALE_STANDARD_Q02": "role",
      "PACK_DRUG_SALE_STANDARD_Q03": "approx_date",
      "PACK_DRUG_SALE_STANDARD_Q04": "frequency",
      "PACK_DRUG_SALE_STANDARD_Q05": "location",
      "PACK_DRUG_SALE_STANDARD_Q06": "associates",
      "PACK_DRUG_SALE_STANDARD_Q07": "compensation",
      "PACK_DRUG_SALE_STANDARD_Q08": "weapons_violence",
      "PACK_DRUG_SALE_STANDARD_Q09": "law_enforcement_involved",
      "PACK_DRUG_SALE_STANDARD_Q10": "arrested_charged",
      "PACK_DRUG_SALE_STANDARD_Q11": "disclosed_prior",
      "PACK_DRUG_SALE_STANDARD_Q12": "recurrence",
      "PACK_DRUG_SALE_STANDARD_Q13": "coercion",
      "PACK_DRUG_SALE_STANDARD_Q14": "prevention_steps",
    },
  },
  
  // Illegal Drug Use / Experimentation pack (v2.4)
  PACK_DRUG_USE_STANDARD: {
    id: "PACK_DRUG_USE_STANDARD",
    useNarrativeFirst: true,
    primaryField: "PACK_DRUG_USE_Q01",
    requiredAnchors: ["substance_type", "first_use", "last_use"],
    requiredFields: ["substance_type", "first_use_date", "last_use_date", "total_uses"],
    priorityOrder: ["substance_type", "first_use_date", "last_use_date", "total_uses", "use_context", "use_location", "obtain_method", "under_influence_in_prohibited_setting", "consequences", "law_enforcement_involved", "prior_disclosure", "other_substances_used", "behavior_stopped", "mitigation_steps"],
    anchorExtractionRules: {
      substance_type: "substance",
      first_use: "month_year",
      last_use: "month_year"
    },
    fieldKeyMap: {
      "substance_type": "substance_type",
      "first_use_date": "first_use_date",
      "last_use_date": "last_use_date",
      "total_uses": "total_uses",
      "use_context": "use_context",
      "use_location": "use_location",
      "obtain_method": "obtain_method",
      "under_influence_in_prohibited_setting": "under_influence_in_prohibited_setting",
      "consequences": "consequences",
      "law_enforcement_involved": "law_enforcement_involved",
      "prior_disclosure": "prior_disclosure",
      "other_substances_used": "other_substances_used",
      "behavior_stopped": "behavior_stopped",
      "mitigation_steps": "mitigation_steps",
      // Legacy question mappings
      "PACK_DRUG_USE_STANDARD_Q01": "substance_type",
      "PACK_DRUG_USE_STANDARD_Q02": "first_use_date",
      "PACK_DRUG_USE_STANDARD_Q03": "last_use_date",
      "PACK_DRUG_USE_STANDARD_Q04": "total_uses",
      "PACK_DRUG_USE_STANDARD_Q05": "use_context",
      "PACK_DRUG_USE_STANDARD_Q06": "use_location",
      "PACK_DRUG_USE_STANDARD_Q07": "obtain_method",
      "PACK_DRUG_USE_STANDARD_Q08": "under_influence_in_prohibited_setting",
      "PACK_DRUG_USE_STANDARD_Q09": "consequences",
      "PACK_DRUG_USE_STANDARD_Q10": "law_enforcement_involved",
      "PACK_DRUG_USE_STANDARD_Q11": "prior_disclosure",
      "PACK_DRUG_USE_STANDARD_Q12": "other_substances_used",
      "PACK_DRUG_USE_STANDARD_Q13": "behavior_stopped",
      "PACK_DRUG_USE_STANDARD_Q14": "mitigation_steps",
    },
  },
  
  // Prescription Medication Misuse pack (v2.4)
  PACK_PRESCRIPTION_MISUSE_STANDARD: {
    id: "PACK_PRESCRIPTION_MISUSE_STANDARD",
    requiredFields: ["medication_type", "access_source", "obtain_method", "first_occurrence_date", "most_recent_date", "total_occurrences", "misuse_method", "impairment_settings"],
    priorityOrder: ["medication_type", "access_source", "obtain_method", "first_occurrence_date", "most_recent_date", "total_occurrences", "misuse_method", "misuse_location", "impairment_settings", "consequences", "confrontation_discipline", "authority_awareness", "help_sought", "recurrence", "prevention_steps"],
    fieldKeyMap: {
      "medication_type": "medication_type",
      "access_source": "access_source",
      "obtain_method": "obtain_method",
      "first_occurrence_date": "first_occurrence_date",
      "most_recent_date": "most_recent_date",
      "total_occurrences": "total_occurrences",
      "misuse_method": "misuse_method",
      "misuse_location": "misuse_location",
      "impairment_settings": "impairment_settings",
      "consequences": "consequences",
      "confrontation_discipline": "confrontation_discipline",
      "authority_awareness": "authority_awareness",
      "help_sought": "help_sought",
      "recurrence": "recurrence",
      "prevention_steps": "prevention_steps",
      // Legacy question mappings
      "PACK_PRESCRIPTION_MISUSE_STANDARD_Q01": "medication_type",
      "PACK_PRESCRIPTION_MISUSE_STANDARD_Q02": "access_source",
      "PACK_PRESCRIPTION_MISUSE_STANDARD_Q03": "obtain_method",
      "PACK_PRESCRIPTION_MISUSE_STANDARD_Q04": "first_occurrence_date",
      "PACK_PRESCRIPTION_MISUSE_STANDARD_Q05": "most_recent_date",
      "PACK_PRESCRIPTION_MISUSE_STANDARD_Q06": "total_occurrences",
      "PACK_PRESCRIPTION_MISUSE_STANDARD_Q07": "misuse_method",
      "PACK_PRESCRIPTION_MISUSE_STANDARD_Q08": "misuse_location",
      "PACK_PRESCRIPTION_MISUSE_STANDARD_Q09": "impairment_settings",
      "PACK_PRESCRIPTION_MISUSE_STANDARD_Q10": "consequences",
      "PACK_PRESCRIPTION_MISUSE_STANDARD_Q11": "confrontation_discipline",
      "PACK_PRESCRIPTION_MISUSE_STANDARD_Q12": "authority_awareness",
      "PACK_PRESCRIPTION_MISUSE_STANDARD_Q13": "help_sought",
      "PACK_PRESCRIPTION_MISUSE_STANDARD_Q14": "recurrence",
      "PACK_PRESCRIPTION_MISUSE_STANDARD_Q15": "prevention_steps",
    },
  },

  // ============================================================
  // ADDITIONAL V2 STANDARD CLUSTER PACKS (Added for full V2 probing support)
  // ============================================================

};

// ============================================================================
// V2 PACK TARGET ANCHORS - Define what anchors each V2 pack extracts
// These are used by the Discretion Engine and field gating logic
// ============================================================================

const V2_PACK_CONFIGS = {
  "PACK_PRIOR_LE_APPS_STANDARD": {
    packId: "PACK_PRIOR_LE_APPS_STANDARD",
    useNarrativeFirst: true,
    primaryField: "PACK_PRLE_Q01", // Primary narrative field
    // Target anchors that MUST be extracted from Q01 narrative before advancing
    requiredAnchors: [
      "agency_name",
      "position",
      "month_year",
      "application_outcome"
    ],
    // Optional anchors that can be extracted but aren't required
    targetAnchors: [
      "agency_name",
      "position", 
      "month_year",
      "application_outcome",
      "application_city",
      "application_state"
    ],
    // Field gating config - which fields require which anchors to be missing
    fieldGating: {
      "PACK_PRLE_Q01": { 
        captures: ["agency_name", "position", "month_year", "application_outcome", "application_city", "application_state"], 
        alwaysAsk: true, 
        isOpener: true,
        isNarrativeOpener: true,
        isPrimaryNarrativeField: true // Must capture ALL required anchors before advancing
      },
      "PACK_PRLE_Q02": { 
        captures: ["application_outcome"], 
        requiresMissing: ["application_outcome"], 
        alwaysAsk: false 
      },
      "PACK_PRLE_Q03": { 
        captures: ["application_city", "application_state"], 
        requiresMissing: ["application_city", "application_state"], 
        alwaysAsk: false 
      },
      "PACK_PRLE_Q04": { 
        captures: ["month_year"], 
        requiresMissing: ["month_year"], 
        alwaysAsk: false 
      },
      "PACK_PRLE_Q05": { 
        captures: ["position"], 
        requiresMissing: ["position"], 
        alwaysAsk: false 
      },
      "PACK_PRLE_Q06": { 
        captures: ["agency_name"], 
        requiresMissing: ["agency_name"], 
        alwaysAsk: false 
      },
      "PACK_PRLE_Q07": { 
        captures: ["reason_not_hired"], 
        requiresMissing: [], 
        skipUnless: { application_outcome: ["not selected", "disqualified", "rejected", "not hired", "dq", "dq'd", "disqualified / not selected"] }, 
        alwaysAsk: false 
      },
      "PACK_PRLE_Q08": { 
        captures: ["appeal_or_reapply"], 
        requiresMissing: [], 
        alwaysAsk: false 
      },
      "PACK_PRLE_Q09": { 
        captures: ["anything_else"], 
        alwaysAsk: true, 
        isCloser: true 
      }
    }
  }
};

// Merge V2_PACK_CONFIGS back into PACK_CONFIG for backward compatibility
Object.assign(PACK_CONFIG, {
  // Alcohol Misuse pack (v2.4)
  PACK_ALCOHOL_STANDARD: {
    id: "PACK_ALCOHOL_STANDARD",
    requiredFields: ["frequency", "binge_episodes", "blackouts", "misconduct", "work_impact", "treatment_history"],
    priorityOrder: ["frequency", "binge_episodes", "blackouts", "misconduct", "unsafe_behaviors", "work_impact", "relationship_impact", "health_issues", "treatment_history", "le_involvement", "consequences", "preventive_steps"],
    fieldKeyMap: {
      "frequency": "frequency",
      "binge_episodes": "binge_episodes",
      "blackouts": "blackouts",
      "misconduct": "misconduct",
      "unsafe_behaviors": "unsafe_behaviors",
      "work_impact": "work_impact",
      "relationship_impact": "relationship_impact",
      "health_issues": "health_issues",
      "treatment_history": "treatment_history",
      "le_involvement": "le_involvement",
      "consequences": "consequences",
      "similar_incidents": "similar_incidents",
      "prior_disclosure": "prior_disclosure",
      "preventive_steps": "preventive_steps",
    },
  },

  // General Disclosure pack (v2.4)
  PACK_GENERAL_DISCLOSURE_STANDARD: {
    id: "PACK_GENERAL_DISCLOSURE_STANDARD",
    useNarrativeFirst: true,
    primaryField: "PACK_GENERAL_DISCLOSURE_Q01",
    requiredAnchors: ["disclosure_type", "circumstances"],
    requiredFields: ["disclosure_type", "circumstances", "time_period"],
    priorityOrder: ["disclosure_type", "circumstances", "time_period", "integrity_issues", "policy_violations", "harm_risk", "employer_school_consequences", "le_consequences", "prior_disclosure", "preventive_steps"],
    anchorExtractionRules: {
      disclosure_type: {
        "integrity": ["integrity", "honesty", "lied", "false statement"],
        "policy": ["policy violation", "violated policy", "broke rules"],
        "conduct": ["conduct", "behavior", "misconduct"]
      }
    },
    fieldKeyMap: {
      "disclosure_type": "disclosure_type",
      "circumstances": "circumstances",
      "time_period": "time_period",
      "integrity_issues": "integrity_issues",
      "policy_violations": "policy_violations",
      "harm_risk": "harm_risk",
      "employer_school_consequences": "employer_school_consequences",
      "le_consequences": "le_consequences",
      "prior_disclosure": "prior_disclosure",
      "preventive_steps": "preventive_steps",
    },
  },

  // General Crime pack (v2.4)
  PACK_GENERAL_CRIME_STANDARD: {
    id: "PACK_GENERAL_CRIME_STANDARD",
    useNarrativeFirst: true,
    primaryField: "PACK_GENERAL_CRIME_Q01",
    requiredAnchors: ["month_year", "location", "what_happened", "outcome"],
    requiredFields: ["incident_type", "incident_date", "location", "description", "legal_outcome"],
    priorityOrder: ["incident_type", "incident_date", "location", "description", "arrest_status", "charges", "legal_outcome", "sentence", "probation", "restitution", "prior_disclosure", "preventive_steps"],
    anchorExtractionRules: {
      month_year: "month_year",
      location: "location",
      outcome: {
        "convicted": ["convicted", "guilty", "pled guilty", "found guilty"],
        "dismissed": ["dismissed", "dropped", "charges dropped", "case dismissed"],
        "acquitted": ["acquitted", "not guilty", "found not guilty"],
        "deferred": ["deferred", "deferred adjudication", "probation before judgment"],
        "pending": ["pending", "awaiting trial", "still in court"]
      }
    },
    fieldKeyMap: {
      "incident_type": "incident_type",
      "incident_date": "incident_date",
      "location": "location",
      "description": "description",
      "arrest_status": "arrest_status",
      "charges": "charges",
      "legal_outcome": "legal_outcome",
      "sentence": "sentence",
      "probation": "probation",
      "restitution": "restitution",
      "prior_disclosure": "prior_disclosure",
      "preventive_steps": "preventive_steps",
    },
  },

  // Assault pack (v2.4)
  PACK_ASSAULT_STANDARD: {
    id: "PACK_ASSAULT_STANDARD",
    requiredFields: ["incident_date", "location", "circumstances", "injuries", "legal_outcome"],
    priorityOrder: ["incident_date", "location", "circumstances", "injuries", "weapons_involved", "arrest_status", "charges", "legal_outcome", "prior_disclosure", "preventive_steps"],
    fieldKeyMap: {
      "incident_date": "incident_date",
      "location": "location",
      "circumstances": "circumstances",
      "injuries": "injuries",
      "weapons_involved": "weapons_involved",
      "arrest_status": "arrest_status",
      "charges": "charges",
      "legal_outcome": "legal_outcome",
      "prior_disclosure": "prior_disclosure",
      "preventive_steps": "preventive_steps",
    },
  },

  // Domestic Violence pack (v2.4)
  PACK_DOMESTIC_VIOLENCE_STANDARD: {
    id: "PACK_DOMESTIC_VIOLENCE_STANDARD",
    requiredFields: ["incident_date", "location", "relationship", "incident_type", "circumstances", "legal_outcome"],
    priorityOrder: ["incident_date", "location", "relationship", "incident_type", "circumstances", "injuries", "weapons_involved", "protective_order", "arrest_status", "charges", "legal_outcome", "prior_disclosure", "preventive_steps"],
    fieldKeyMap: {
      "incident_date": "incident_date",
      "location": "location",
      "relationship": "relationship",
      "incident_type": "incident_type",
      "circumstances": "circumstances",
      "injuries": "injuries",
      "weapons_involved": "weapons_involved",
      "protective_order": "protective_order",
      "arrest_status": "arrest_status",
      "charges": "charges",
      "legal_outcome": "legal_outcome",
      "prior_disclosure": "prior_disclosure",
      "preventive_steps": "preventive_steps",
    },
  },

  // Child Abuse pack (v2.4)
  PACK_CHILD_ABUSE_STANDARD: {
    id: "PACK_CHILD_ABUSE_STANDARD",
    requiredFields: ["incident_date", "location", "child_age", "allegation_type", "circumstances", "investigation_outcome"],
    priorityOrder: ["incident_date", "location", "child_age", "allegation_type", "circumstances", "cps_involvement", "investigation_outcome", "legal_outcome", "prior_disclosure", "preventive_steps"],
    fieldKeyMap: {
      "incident_date": "incident_date",
      "location": "location",
      "child_age": "child_age",
      "allegation_type": "allegation_type",
      "circumstances": "circumstances",
      "cps_involvement": "cps_involvement",
      "investigation_outcome": "investigation_outcome",
      "legal_outcome": "legal_outcome",
      "prior_disclosure": "prior_disclosure",
      "preventive_steps": "preventive_steps",
    },
  },

  // Theft pack (v2.4)
  PACK_THEFT_STANDARD: {
    id: "PACK_THEFT_STANDARD",
    useNarrativeFirst: true,
    primaryField: "PACK_THEFT_Q01",
    requiredAnchors: ["month_year", "location", "what_stolen", "outcome"],
    requiredFields: ["incident_date", "location", "what_stolen", "circumstances", "legal_outcome"],
    priorityOrder: ["incident_date", "location", "what_stolen", "value", "circumstances", "arrest_status", "charges", "legal_outcome", "restitution", "prior_disclosure", "preventive_steps"],
    anchorExtractionRules: {
      month_year: "month_year",
      location: "location",
      outcome: {
        "convicted": ["convicted", "guilty", "pled guilty"],
        "dismissed": ["dismissed", "dropped", "charges dropped"],
        "restitution": ["paid restitution", "restitution", "paid back"],
        "diversion": ["diversion", "diversion program", "community service"]
      }
    },
    fieldKeyMap: {
      "incident_date": "incident_date",
      "location": "location",
      "what_stolen": "what_stolen",
      "value": "value",
      "circumstances": "circumstances",
      "arrest_status": "arrest_status",
      "charges": "charges",
      "legal_outcome": "legal_outcome",
      "restitution": "restitution",
      "prior_disclosure": "prior_disclosure",
      "preventive_steps": "preventive_steps",
    },
  },

  // Property Crime pack (v2.4)
  PACK_PROPERTY_CRIME_STANDARD: {
    id: "PACK_PROPERTY_CRIME_STANDARD",
    requiredFields: ["incident_date", "location", "property_type", "circumstances", "legal_outcome"],
    priorityOrder: ["incident_date", "location", "property_type", "damage_amount", "circumstances", "arrest_status", "charges", "legal_outcome", "restitution", "prior_disclosure", "preventive_steps"],
    fieldKeyMap: {
      "incident_date": "incident_date",
      "location": "location",
      "property_type": "property_type",
      "damage_amount": "damage_amount",
      "circumstances": "circumstances",
      "arrest_status": "arrest_status",
      "charges": "charges",
      "legal_outcome": "legal_outcome",
      "restitution": "restitution",
      "prior_disclosure": "prior_disclosure",
      "preventive_steps": "preventive_steps",
    },
  },

  // Fraud pack (v2.4)
  PACK_FRAUD_STANDARD: {
    id: "PACK_FRAUD_STANDARD",
    useNarrativeFirst: true,
    primaryField: "PACK_FRAUD_Q01",
    requiredAnchors: ["month_year", "fraud_type", "outcome"],
    requiredFields: ["incident_date", "fraud_type", "circumstances", "legal_outcome"],
    priorityOrder: ["incident_date", "fraud_type", "circumstances", "amount_involved", "victim_type", "arrest_status", "charges", "legal_outcome", "restitution", "prior_disclosure", "preventive_steps"],
    anchorExtractionRules: {
      month_year: "month_year",
      fraud_type: {
        "identity theft": ["identity theft", "identity fraud", "stole identity"],
        "credit card": ["credit card fraud", "unauthorized charges", "stolen card"],
        "check fraud": ["check fraud", "bad check", "forged check"],
        "insurance": ["insurance fraud", "false claim"],
        "forgery": ["forgery", "forged", "falsified"]
      },
      outcome: {
        "convicted": ["convicted", "guilty", "pled guilty"],
        "dismissed": ["dismissed", "dropped"],
        "restitution": ["paid restitution", "restitution"]
      }
    },
    fieldKeyMap: {
      "incident_date": "incident_date",
      "fraud_type": "fraud_type",
      "circumstances": "circumstances",
      "amount_involved": "amount_involved",
      "victim_type": "victim_type",
      "arrest_status": "arrest_status",
      "charges": "charges",
      "legal_outcome": "legal_outcome",
      "restitution": "restitution",
      "prior_disclosure": "prior_disclosure",
      "preventive_steps": "preventive_steps",
    },
  },

  // Employment Misconduct pack (v2.4)
  PACK_EMPLOYMENT_STANDARD: {
    id: "PACK_EMPLOYMENT_STANDARD",
    useNarrativeFirst: true,
    primaryField: "PACK_EMPLOYMENT_Q01",
    requiredAnchors: ["employer", "month_year", "incident_type", "outcome"],
    requiredFields: ["employer", "incident_date", "incident_type", "circumstances", "outcome"],
    priorityOrder: ["employer", "position", "incident_date", "incident_type", "circumstances", "corrective_action", "outcome", "separation_type", "prior_disclosure", "preventive_steps"],
    anchorExtractionRules: {
      employer: "employer",
      month_year: "month_year",
      incident_type: {
        "termination": ["terminated", "fired", "let go", "dismissed", "termination"],
        "resignation": ["resigned", "quit", "left voluntarily", "gave notice"],
        "discipline": ["written up", "warning", "disciplinary action", "suspended"],
        "investigation": ["investigated", "investigation", "HR investigation"]
      },
      outcome: {
        "terminated": ["terminated", "fired", "let go", "dismissed"],
        "resigned": ["resigned", "quit", "left"],
        "warning": ["warning", "written warning", "verbal warning"],
        "no action": ["no action", "cleared", "unfounded"]
      }
    },
    fieldKeyMap: {
      "employer": "employer",
      "position": "position",
      "incident_date": "incident_date",
      "incident_type": "incident_type",
      "circumstances": "circumstances",
      "corrective_action": "corrective_action",
      "outcome": "outcome",
      "separation_type": "separation_type",
      "prior_disclosure": "prior_disclosure",
      "preventive_steps": "preventive_steps",
    },
  },

  // Stalking/Harassment pack (v2.4)
  PACK_STALKING_HARASSMENT_STANDARD: {
    id: "PACK_STALKING_HARASSMENT_STANDARD",
    requiredFields: ["incident_date", "behavior_type", "circumstances", "legal_outcome"],
    priorityOrder: ["incident_date", "behavior_type", "circumstances", "duration", "victim_relationship", "protective_order", "arrest_status", "charges", "legal_outcome", "prior_disclosure", "preventive_steps"],
    fieldKeyMap: {
      "incident_date": "incident_date",
      "behavior_type": "behavior_type",
      "circumstances": "circumstances",
      "duration": "duration",
      "victim_relationship": "victim_relationship",
      "protective_order": "protective_order",
      "arrest_status": "arrest_status",
      "charges": "charges",
      "legal_outcome": "legal_outcome",
      "prior_disclosure": "prior_disclosure",
      "preventive_steps": "preventive_steps",
    },
  },
  
  // Prior Law Enforcement Applications pack (v2.5) - NARRATIVE-FIRST
  // Q01 is now an open-ended narrative. The system extracts anchors and only asks follow-ups for gaps.
  PACK_PRIOR_LE_APPS_STANDARD: {
    id: "PACK_PRIOR_LE_APPS_STANDARD",
    packName: "Prior Law Enforcement Applications",
    standardClusterId: "PRIOR_LE_APPS",
    isStandardCluster: true,
    active: true,
    usesAnchors: true, // FLAG: This pack uses anchor-aware probing (SAME as PACK_DRIVING_COLLISION_STANDARD)
    enablePerFieldProbing: true,
    enableCoverageGuardrail: true,
    useNarrativeFirst: true, // NARRATIVE-FIRST: Q01 is open-ended story (SAME as PACK_DRIVING_COLLISION_STANDARD)
    primaryField: "PACK_PRLE_Q01", // Primary narrative field that must collect all required anchors (SAME pattern)
    riskDomain: "PRIOR_LE",
    supportsMultipleInstances: true,
    instanceLabelSingular: "application",
    instanceLabelPlural: "applications",
    clusterOpeningMessage: "Please describe this prior law enforcement application in your own words.",
    multiInstanceOpeningMessage: "Please describe this prior law enforcement application in your own words.",
    // Required anchors that MUST be collected from Q01 before advancing (SAME pattern as PACK_DRIVING_COLLISION_STANDARD)
    requiredAnchors: [
      "agency_name",
      "position",
      "month_year",
      "application_outcome"
    ],
    // CENTRALIZED ANCHOR EXTRACTION RULES - used by extractAnchorsFromNarrative() (SAME mechanism as PACK_DRIVING_COLLISION_STANDARD)
    // CRITICAL: application_outcome extraction is KEY for skipping PACK_PRLE_Q02
    anchorExtractionRules: {
      application_outcome: {
        // NOTE: Order matters - more specific patterns first
        disqualified: [
          "disqualified", "dq'd", "dq", "dq'ed", "was dq", "got dq",
          "failed background", "failed the background", "background investigation disqualified",
          "not selected", "wasn't selected", "was not selected", "weren't selected",
          "rejected", "not hired", "wasn't hired", "was not hired", "weren't hired",
          "did not get", "didn't get", "didn't get hired", "did not get hired",
          "was denied", "denied employment", "denied the position",
          "removed from consideration", "removed from the process",
          "did not make it", "didn't make it", "didn't make the cut",
          "didn't pass", "did not pass", "failed to pass",
          "didn't complete", "did not complete",
          "unsuccessful", "was unsuccessful", "were unsuccessful",
          "not offered", "wasn't offered", "was not offered",
          "turned down", "was turned down",
          "disqualified during the background"
        ],
        withdrew: [
          "withdrew", "withdraw", "withdrawn",
          "pulled my application", "pulled out", "pulled application",
          "decided not to continue", "chose not to continue",
          "dropped out", "backed out", "backed away",
          "chose to withdraw", "decided to withdraw",
          "removed myself", "took myself out",
          "stopped the process", "ended the process"
        ],
        hired: [
          "hired", "got hired", "was hired", "were hired",
          "offered the job", "offered a job", "offered the position",
          "got the job", "got the position",
          "was offered", "were offered",
          "they brought me on", "brought me on",
          "accepted", "was accepted", "got accepted"
        ],
        still_in_process: [
          "still in process", "still in the process",
          "still pending", "currently pending",
          "waiting to hear back", "waiting to hear",
          "background in progress", "in progress",
          "still processing", "currently processing",
          "currently in process", "ongoing",
          "awaiting decision", "awaiting",
          "haven't heard back", "haven't heard"
        ]
      },
      month_year: "month_year",
      agency_name: "agency_name",
      position: "position"
    },
    // Micro clarifier templates for missing anchors
    anchorClarifiers: {
      agency_name: "What was the name of the law enforcement agency for this application?",
      position: "What position did you apply for with that agency?",
      month_year: "About what month and year did you apply?",
      application_outcome: "What was the outcome of that application? (For example: hired, disqualified, withdrew, still in process.)"
    },
    // All possible anchors - extracted from narrative
    targetAnchors: [
      "agency_name",
      "position",
      "month_year",
      "application_outcome",
      "application_city",
      "application_state",
      "reason_not_hired",
      "appeal_or_reapply",
      "anything_else"
    ],
    requiredFields: ["agency_name", "month_year", "position", "application_outcome"],
    // Priority order for gap-filling after narrative
    priorityOrder: ["application_outcome", "agency_name", "position", "month_year", "application_city", "application_state", "reason_not_hired", "appeal_or_reapply", "anything_else"],
    fieldKeyMap: {
      // Question code → semantic role mappings
      "PACK_PRLE_Q01": "narrative", // NARRATIVE OPENER - extracts all anchors
      "PACK_PRLE_Q02": "application_outcome",
      "PACK_PRLE_Q03": "application_location", // Captures city + state
      "PACK_PRLE_Q04": "month_year",
      "PACK_PRLE_Q05": "position",
      "PACK_PRLE_Q06": "agency_name",
      "PACK_PRLE_Q07": "reason_not_hired",
      "PACK_PRLE_Q08": "appeal_or_reapply",
      "PACK_PRLE_Q09": "anything_else",
      // Semantic field self-mappings
      "agency_name": "agency_name",
      "position": "position",
      "month_year": "month_year",
      "application_outcome": "application_outcome",
      "application_city": "application_city",
      "application_state": "application_state",
      "application_location": "application_location",
      "reason_not_hired": "reason_not_hired",
      "appeal_or_reapply": "appeal_or_reapply",
      "anything_else": "anything_else",
    },
    // Field gating config - NARRATIVE-FIRST approach
    // Q01 is narrative opener that captures everything; Q02-Q09 only ask if anchors missing
    fieldGating: {
      "PACK_PRLE_Q01": { 
        captures: ["agency_name", "position", "month_year", "application_outcome", "application_city", "application_state"], 
        alwaysAsk: true, 
        isOpener: true,
        isNarrativeOpener: true, // Special flag for narrative extraction
        isPrimaryNarrativeField: true // Must capture ALL required anchors before advancing
      },
      "PACK_PRLE_Q02": { captures: ["application_outcome"], requiresMissing: ["application_outcome"], alwaysAsk: false },
      "PACK_PRLE_Q03": { captures: ["application_city", "application_state"], requiresMissing: ["application_city", "application_state"], alwaysAsk: false },
      "PACK_PRLE_Q04": { captures: ["month_year"], requiresMissing: ["month_year"], alwaysAsk: false },
      "PACK_PRLE_Q05": { captures: ["position"], requiresMissing: ["position"], alwaysAsk: false },
      "PACK_PRLE_Q06": { captures: ["agency_name"], requiresMissing: ["agency_name"], alwaysAsk: false },
      "PACK_PRLE_Q07": { captures: ["reason_not_hired"], requiresMissing: [], skipUnless: { application_outcome: ["not selected", "disqualified", "rejected", "not hired", "dq", "dq'd", "disqualified / not selected"] }, alwaysAsk: false },
      "PACK_PRLE_Q08": { captures: ["appeal_or_reapply"], requiresMissing: [], alwaysAsk: false },
      "PACK_PRLE_Q09": { captures: ["anything_else"], alwaysAsk: true, isCloser: true }
    },
    // Field schemas for per-field probing
    fieldSchemas: {
      "PACK_PRLE_Q01": {
        fieldKey: "PACK_PRLE_Q01",
        semanticKey: "agency_type",
        label: "Type of Agency",
        dataType: "short_text",
        category: "context",
        descriptionForLLM: "Type of law enforcement agency (e.g., municipal police, county sheriff, state police, federal, tribal).",
        isRequired: true,
        riskDimensions: ["DISCLOSURE"]
      },
      "PACK_PRLE_Q02": {
        fieldKey: "PACK_PRLE_Q02",
        semanticKey: "time_period",
        label: "Application Time Period",
        dataType: "date_approximate",
        category: "timeline",
        descriptionForLLM: "When the application was submitted or the hiring process occurred (month/year or approximate timeframe).",
        isRequired: true,
        riskDimensions: ["DISCLOSURE"]
      },
      "PACK_PRLE_Q03": {
        fieldKey: "PACK_PRLE_Q03",
        semanticKey: "stage_reached",
        label: "Stage Reached",
        dataType: "categorical",
        category: "outcome",
        descriptionForLLM: "How far the candidate progressed in the hiring process (written test, physical, interview, background, polygraph, psychological, academy, etc.).",
        isRequired: true,
        riskDimensions: ["PERFORMANCE"]
      },
      "PACK_PRLE_Q04": {
        fieldKey: "PACK_PRLE_Q04",
        semanticKey: "outcome",
        label: "Outcome",
        dataType: "categorical",
        category: "outcome",
        descriptionForLLM: "Final result of the application (hired, not selected, withdrew, disqualified, still in process).",
        isRequired: true,
        riskDimensions: ["PERFORMANCE", "INTEGRITY"]
      },
      "PACK_PRLE_Q05": {
        fieldKey: "PACK_PRLE_Q05",
        semanticKey: "background_concerns",
        label: "Background Concerns Identified",
        dataType: "long_text",
        category: "risk",
        descriptionForLLM: "Any concerns or issues identified during the background investigation phase.",
        isRequired: false,
        riskDimensions: ["INTEGRITY", "CONDUCT"]
      },
      "PACK_PRLE_Q06": {
        fieldKey: "PACK_PRLE_Q06",
        semanticKey: "withdrew",
        label: "Withdrew Application",
        dataType: "boolean",
        category: "outcome",
        descriptionForLLM: "Whether the candidate withdrew their application and the reason why.",
        isRequired: false,
        riskDimensions: ["DISCLOSURE"]
      },
      "PACK_PRLE_Q07": {
        fieldKey: "PACK_PRLE_Q07",
        semanticKey: "prior_disclosure",
        label: "Prior Disclosure",
        dataType: "boolean",
        category: "integrity",
        descriptionForLLM: "Whether this prior application has been disclosed on other law enforcement applications.",
        isRequired: false,
        riskDimensions: ["INTEGRITY", "DISCLOSURE"]
      },
      "PACK_PRLE_Q08": {
        fieldKey: "PACK_PRLE_Q08",
        semanticKey: "preventive_steps",
        label: "Changes/Improvements Since",
        dataType: "long_text",
        category: "mitigation",
        descriptionForLLM: "What changes or improvements the candidate has made since this application.",
        isRequired: false,
        riskDimensions: ["CONDUCT"]
      },
      "PACK_PRLE_Q09": {
        fieldKey: "PACK_PRLE_Q09",
        semanticKey: "anything_else",
        label: "Anything Else",
        dataType: "long_text",
        category: "disclosure",
        descriptionForLLM: "Any additional information about this application that the investigator should know.",
        isRequired: false,
        riskDimensions: []
      }
    }
  },
};

// ============================================================================
// GOLDEN MVP: DETERMINISTIC FIELD ANCHOR EXTRACTORS
// ============================================================================



/**
 * Central registry: (packId, fieldKey) → deterministic extractor function
 * Add new packs/fields here as they adopt anchor-based gating
 */
const FIELD_ANCHOR_EXTRACTORS = {
  PACK_PRIOR_LE_APPS_STANDARD: {
    PACK_PRLE_Q01: extractPriorLeAppsAnchors,
  }
  // Future: PACK_DRIVING_COLLISION_STANDARD, PACK_EMPLOYMENT_STANDARD, etc.
};

/**
 * Safe lookup wrapper for deterministic extractors
 * @param {object} params
 * @param {string} params.packId
 * @param {string} params.fieldKey
 * @param {string} params.answerText
 * @returns {object} { anchors: {...}, collectedAnchors: {...} }
 */
function runDeterministicExtractor({ packId, fieldKey, answerText }) {
  console.log(`[V2_FACTS][LOOKUP] pack="${packId}", field="${fieldKey}"`);
  
  const packExtractors = FIELD_ANCHOR_EXTRACTORS[packId];
  if (!packExtractors) {
    console.log(`[V2_FACTS][LOOKUP] No extractors for pack="${packId}"`);
    return { anchors: {}, collectedAnchors: {} };
  }

  const extractor = packExtractors[fieldKey];
  if (!extractor) {
    console.log(`[V2_FACTS][LOOKUP] No extractor for field="${fieldKey}"`);
    return { anchors: {}, collectedAnchors: {} };
  }

  console.log(`[V2_FACTS][RUNNING] Extractor found - executing`);
  // CRITICAL: Call extractor with object signature { text } to match extractPriorLeAppsAnchors
  const result = extractor({ text: answerText || '' });
  return {
    anchors: result.anchors || {},
    collectedAnchors: result.collectedAnchors || {},
  };
}

/**
 * Normalize v2Result to ensure anchors/collectedAnchors always exist
 */
function normalizeV2Result(result) {
  if (!result || typeof result !== 'object') {
    return { mode: 'NONE', hasQuestion: false, anchors: {}, collectedAnchors: {} };
  }
  if (!result.anchors) result.anchors = {};
  if (!result.collectedAnchors) result.collectedAnchors = {};
  return result;
}

/**
 * Attach deterministic anchors to v2Result before returning to frontend
 * GOLDEN MVP CONTRACT: Every per-field return MUST include anchors/collectedAnchors
 */
function attachDeterministicAnchorsForField(params, v2Result) {
  const { pack_id: packId, field_key: fieldKey } = params || {};

  const answerText =
    params.field_value ||
    params.fieldValue ||
    params.answerText ||
    params.narrative ||
    '';

  console.log(`[V2_FACTS][ATTACH] pack="${packId}", field="${fieldKey}", answerLength=${answerText?.length || 0}`);

  const deterministic = runDeterministicExtractor({ packId, fieldKey, answerText });

  const normalized = normalizeV2Result(v2Result || {});

  // Merge deterministic anchors (they take precedence)
  normalized.anchors = {
    ...(normalized.anchors || {}),
    ...(deterministic.anchors || {}),
  };

  normalized.collectedAnchors = {
    ...(normalized.collectedAnchors || {}),
    ...(deterministic.collectedAnchors || {}),
  };

  console.log(`[V2_FACTS][ATTACH] Final anchor count: ${Object.keys(normalized.anchors).length}`);
  if (packId === "PACK_PRIOR_LE_APPS_STANDARD") {
    console.log(`[V2_FACTS][ATTACH][PRIOR_LE_APPS] application_outcome="${normalized.anchors.application_outcome || '(NONE)'}"`);
  }

  return normalized;
}

/**
 * Deterministic inference of application outcome from PACK_PRLE_Q01 narrative
 * Returns one of: "hired", "disqualified", "withdrew", "still_in_process", or null
 * @param {string} narrative - The candidate's story about their prior LE application
 * @returns {string|null}
 */
function inferPriorLEApplicationOutcome(narrative) {
  if (!narrative || narrative.length < 10) return null;
  
  const text = narrative.toLowerCase();
  
  // DISQUALIFIED patterns (check first as most common)
  const disqualifiedPatterns = [
    "disqualified",
    "dq'd",
    "dq'ed",
    "was dq",
    "got dq",
    "removed from the process",
    "removed from process",
    "did not pass background",
    "didn't pass background",
    "failed the background",
    "failed background",
    "not selected",
    "wasn't selected",
    "was not selected",
    "no longer being considered",
    "rejected",
    "not hired",
    "wasn't hired",
    "was not hired",
    "did not get hired",
    "didn't get hired",
    "did not make it",
    "didn't make it",
    "unsuccessful"
  ];
  
  for (const pattern of disqualifiedPatterns) {
    if (text.includes(pattern)) {
      console.log(`[INFER_OUTCOME] Matched DISQUALIFIED pattern: "${pattern}"`);
      return "disqualified";
    }
  }
  
  // WITHDREW patterns
  const withdrewPatterns = [
    "withdrew my application",
    "withdrew from the process",
    "withdrew from the hiring",
    "i withdrew",
    "decided not to continue",
    "chose not to continue",
    "pulled out of the process",
    "pulled out of the hiring",
    "pulled my application",
    "dropped out of the process"
  ];
  
  for (const pattern of withdrewPatterns) {
    if (text.includes(pattern)) {
      console.log(`[INFER_OUTCOME] Matched WITHDREW pattern: "${pattern}"`);
      return "withdrew";
    }
  }
  
  // HIRED patterns
  const hiredPatterns = [
    "was hired",
    "got hired",
    "they hired me",
    "i was hired",
    "offered the job and i accepted",
    "received a job offer and accepted",
    "accepted the position",
    "started working there"
  ];
  
  for (const pattern of hiredPatterns) {
    if (text.includes(pattern)) {
      console.log(`[INFER_OUTCOME] Matched HIRED pattern: "${pattern}"`);
      return "hired";
    }
  }
  
  // STILL_IN_PROCESS patterns
  const stillInProcessPatterns = [
    "still in process",
    "still in the process",
    "still being processed",
    "still going through",
    "process is ongoing",
    "currently in process",
    "pending background",
    "pending polygraph",
    "pending psych",
    "waiting to hear back",
    "haven't heard back"
  ];
  
  for (const pattern of stillInProcessPatterns) {
    if (text.includes(pattern)) {
      console.log(`[INFER_OUTCOME] Matched STILL_IN_PROCESS pattern: "${pattern}"`);
      return "still_in_process";
    }
  }
  
  console.log(`[INFER_OUTCOME] No outcome pattern matched in narrative`);
  return null;
}

/**
 * Extract month/year from text (e.g., "March 2022", "03/2022", "Jan 2020")
 * Used for PACK_PRIOR_LE_APPS_STANDARD field gating
 * @param {string} text 
 * @returns {{value: string|null, confidence: "high"|"medium"|"low"|null}}
 */
function extractMonthYearFromText(text) {
  if (!text) return { value: null, confidence: null };
  
  // Month names mapping
  const monthNames = {
    'january': '01', 'jan': '01',
    'february': '02', 'feb': '02',
    'march': '03', 'mar': '03',
    'april': '04', 'apr': '04',
    'may': '05',
    'june': '06', 'jun': '06',
    'july': '07', 'jul': '07',
    'august': '08', 'aug': '08',
    'september': '09', 'sep': '09', 'sept': '09',
    'october': '10', 'oct': '10',
    'november': '11', 'nov': '11',
    'december': '12', 'dec': '12'
  };
  
  // Pattern 1: "March 2022", "Jan 2020", "September 2019"
  const monthNamePattern = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s*,?\s*(20\d{2}|19\d{2})\b/i;
  const match1 = text.match(monthNamePattern);
  if (match1) {
    const monthKey = match1[1].toLowerCase();
    const month = monthNames[monthKey];
    const year = match1[2];
    return { value: `${year}-${month}`, confidence: "high" };
  }
  
  // Pattern 2: "03/2022", "3/2022", "03-2022"
  const numericPattern = /\b(0?[1-9]|1[0-2])[\/\-](20\d{2}|19\d{2})\b/;
  const match2 = text.match(numericPattern);
  if (match2) {
    const month = match2[1].padStart(2, '0');
    const year = match2[2];
    return { value: `${year}-${month}`, confidence: "high" };
  }
  
  // Pattern 3: Just year "2022", "in 2020"
  const yearOnlyPattern = /\b(20\d{2}|19\d{2})\b/;
  const match3 = text.match(yearOnlyPattern);
  if (match3) {
    return { value: match3[1], confidence: "medium" };
  }
  
  // Pattern 4: Approximate terms "early 2020", "late 2019", "around 2021"
  const approxPattern = /\b(early|late|mid|around|about|spring|summer|fall|winter|beginning of|end of)\s*(20\d{2}|19\d{2})\b/i;
  const match4 = text.match(approxPattern);
  if (match4) {
    return { value: `${match4[1]} ${match4[2]}`, confidence: "medium" };
  }
  
  return { value: null, confidence: null };
}

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
    case "agency_name":
    case "agency_location":
    case "position":
    case "position_held":
      // Already checked for empty/unknown above
      console.log(`[V2-PER-FIELD] Validation result: COMPLETE (${fieldName} has valid value)`);
      return "complete";
    
    case "monthYear":
    case "application_date":
    case "incident_date":
    case "employment_dates":
    case "collisionDate":
    case "violationDate":
    case "incidentDate":
    case "TIMELINE": {
      // Check for any year pattern (4 digits) or approximate terms
      const hasYear = /\b(19|20)\d{2}\b/.test(normalized);
      const hasApproximate = /(early|late|mid|around|about|spring|summer|fall|winter|beginning|end)/i.test(normalized);
      const hasMonth = /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)/i.test(normalized);
      const hasDigits = /\d/.test(normalized);
      
      if (hasYear || hasMonth || hasApproximate || hasDigits) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (has date indicator)`);
        return "complete";
      }
      
      console.log(`[V2-PER-FIELD] Validation result: INCOMPLETE (no date indicators found)`);
      return "incomplete";
    }
    
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
    case "agency_type":
    case "agency_name":
    case "time_period":
    case "position":
    case "location_general":
    case "outcome":
    case "reason_not_hired":
    case "appeal_or_reapply":
    case "anything_else":
      // PACK_PRIOR_LE_APPS_STANDARD fields - accept any non-empty answer
      if (normalized.length > 0) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (${fieldName} has value)`);
        return "complete";
      }
      // Empty is acceptable for optional fields
      console.log(`[V2-PER-FIELD] Validation result: COMPLETE (optional field)`);
      return "complete";
    
    // === PACK_INTEGRITY_APPS fields ===
    case "issue_type":
    case "discovery_method":
    case "finding":
    case "allegation_type":
      // Choice fields - accept any selection
      if (normalized.length > 0) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (choice field has value)`);
        return "complete";
      }
      return "incomplete";
    
    case "what_omitted":
    case "reason_omitted":
    case "allegation_description":
      // Require substantive description
      if (normalized.length > 10) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (description has content)`);
        return "complete";
      }
      return "incomplete";
    
    case "consequences":
    case "discipline":
    case "ia_case_number":
    case "reason_not_selected":
      // Optional fields - accept any content or "none"
      if (normalized.length > 0 || ["none", "n/a", "na", "unknown"].includes(normalized)) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (optional field has value)`);
        return "complete";
      }
      return "complete"; // Optional, so empty is OK
    
    case "corrected":
    case "full_disclosure":
    case "appealed":
    case "has_documentation":
      // Boolean fields
      if (["yes", "y", "no", "n", "true", "false"].includes(normalized)) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (boolean answer)`);
        return "complete";
      }
      if (normalized.length > 0) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (has response)`);
        return "complete";
      }
      return "incomplete";
    
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
    
    // === PACK_INTEGRITY_APPS fields ===
    case "issue_type":
      if (isFirstProbe) {
        return "What type of integrity issue was this — an omission, falsification, incomplete answer, or something else?";
      }
      return "Can you clarify what category this issue falls under?";
    
    case "what_omitted":
      if (isFirstProbe) {
        return "Can you describe what specific information was incomplete or inaccurate on the application?";
      }
      return "Please provide more detail about what was left out or misrepresented.";
    
    case "reason_omitted":
      if (isFirstProbe) {
        return "What led you to leave that information off or answer it the way you did?";
      }
      return "Can you help me understand the circumstances that led to this?";
    
    case "consequences":
      if (isFirstProbe) {
        return "What consequences or disciplinary action resulted from this issue?";
      }
      return "Was there any formal action taken as a result?";
    
    case "corrected":
      if (isFirstProbe) {
        return "Has this issue been addressed or corrected since then?";
      }
      return "Have you since disclosed this information on other applications?";
    
    // === PACK_LE_MISCONDUCT_STANDARD fields ===
    case "position_held":
      if (isFirstProbe) {
        return "What was your position or rank at that agency when this occurred?";
      }
      return "Can you describe your role at the department?";
    
    case "employment_dates":
      if (isFirstProbe) {
        return "When were you employed at this agency? Please provide approximate years.";
      }
      return "Can you estimate the years you worked there?";
    
    case "allegation_type":
      if (isFirstProbe) {
        return "What type of allegation or concern was this — for example, policy violation, use of force, honesty issue, or something else?";
      }
      return "Can you clarify what category this allegation falls under?";
    
    case "allegation_description":
      if (isFirstProbe) {
        return "Can you describe what was alleged?";
      }
      return "Please provide more detail about the nature of the allegation.";
    
    case "ia_case_number":
      if (isFirstProbe) {
        return "Do you recall an Internal Affairs case number or reference for this incident?";
      }
      return "Is there any case number or tracking reference you remember?";
    
    case "finding":
      if (isFirstProbe) {
        return "What was the official finding — sustained, not sustained, exonerated, unfounded, or something else?";
      }
      return "What was the outcome of the investigation?";
    
    case "discipline":
      if (isFirstProbe) {
        return "What discipline, if any, resulted from this incident?";
      }
      return "Was any formal disciplinary action taken?";
    
    case "appealed":
      if (isFirstProbe) {
        return "Did you appeal or contest the outcome of this investigation?";
      }
      return "Was there any appeal or grievance process?";
    
    // === PACK_WORKPLACE_STANDARD fields ===
    case "employer":
      if (isFirstProbe) {
        return "What company or organization were you working for when this incident occurred?";
      }
      return "Can you provide the employer's name?";
    
    case "position_at_time":
      if (isFirstProbe) {
        return "What was your job title or position when this happened?";
      }
      return "Can you describe your role at the time?";
    
    case "misconduct_type":
      if (isFirstProbe) {
        return "What type of issue was this — for example, a policy violation, dishonesty, conflict, or something else?";
      }
      return "Can you clarify what category this issue falls under?";
    
    case "incident_description":
      if (isFirstProbe) {
        return "Can you describe what happened in this incident?";
      }
      return "Please provide more details about what occurred.";
    
    case "corrective_action":
      if (isFirstProbe) {
        return "What action did your employer take — for example, a warning, suspension, or termination?";
      }
      return "Was there any formal action taken by the employer?";
    
    case "separation_type":
      if (isFirstProbe) {
        return "How did your employment end at this job — did you leave voluntarily, resign under pressure, or were you terminated?";
      }
      return "Can you clarify whether you left voluntarily or were asked to leave?";
    
    case "official_reason":
      if (isFirstProbe) {
        return "What reason did the employer give for any disciplinary action or separation?";
      }
      return "Was there an official reason communicated to you?";
    
    case "isolated_or_recurring":
      if (isFirstProbe) {
        return "Was this a one-time incident or part of a recurring pattern?";
      }
      return "Did this happen more than once?";
    
    case "impact":
      if (isFirstProbe) {
        return "What impact, if any, did this have on the workplace or your colleagues?";
      }
      return "Were there any consequences to the workplace?";
    
    case "remediation":
      if (isFirstProbe) {
        return "What steps have you taken since this incident to address or prevent similar issues?";
      }
      return "Have you made any changes since then?";
    
    // === PACK_PRIOR_LE_APPS_STANDARD lowercase semantic fields ===
    case "agency_type":
      if (isFirstProbe) {
        return "First, tell me briefly about this prior application. What type of agency was it (city police department, a sheriff's office, a state agency, or a federal agency), and about what month and year did you apply?";
      }
      // If answer lacks month/year, ask for timing
      return "About what month and year did you apply to that agency? An estimate is okay.";
    
    case "agency_name":
      if (isFirstProbe) {
        return "Can you recall any other details about the agency, such as the city or type of department?";
      }
      return "Even if you're not sure of the exact name, can you recall any part of the agency name or identifying details?";
    
    case "location_general":
      if (isFirstProbe) {
        return "Which city and state was that agency in?";
      }
      return "Can you provide any details about where this agency was located?";
    
    case "time_period":
      if (isFirstProbe) {
        return "About when did you apply there? Month and year is fine.";
      }
      if (isSecondProbe) {
        return "Think about what else was happening in your life at that time — where you were living, what job you had. Can you estimate even the year you applied?";
      }
      return "If you still can't pinpoint a specific year, please give your best estimate as a range, like 'sometime between 2015 and 2018'.";
    
    case "position":
      if (isFirstProbe) {
        return "What position or job title did you apply for with that agency?";
      }
      return "Even a general description of the role would help. Was it a sworn position, civilian role, or something else?";
    
    case "outcome":
      if (isFirstProbe) {
        return "What was the outcome of that application? (For example: hired, disqualified, withdrew, still in process, or something else.)";
      }
      return "Please clarify: did the process end with you being hired, rejected, withdrawing your application, or are you still waiting to hear back?";
    
    case "reason_not_hired":
      if (isFirstProbe) {
        return "If you were not hired, what reason were you given, or what do you believe was the main reason?";
      }
      return "Even if you weren't given an official reason, do you have any understanding of why the process ended the way it did?";
    
    case "appeal_or_reapply":
      if (isFirstProbe) {
        return "Did you appeal that decision or reapply with that agency? If yes, what happened?";
      }
      return "Can you provide more details about any appeal or reapplication process?";
    
    case "anything_else":
      if (isFirstProbe) {
        return "Is there anything else about that application that you think your background investigator should know?";
      }
      return "Are there any other details about this application that would be helpful for your investigator to know?";

    default:
      // Safe fallback that doesn't expose internal keys
      const label = FIELD_LABELS[fieldName];
      if (label) {
        return `Can you provide more details about ${label.toLowerCase()}?`;
      }
      return "Can you provide more details about this?";
  }
}

/**
 * Field labels for human-readable prompts
 * Supports PACK_LE_APPS, PACK_INTEGRITY_APPS, PACK_LE_MISCONDUCT_STANDARD, and driving packs
 */
const FIELD_LABELS = {
  // PACK_LE_APPS
  "agency": "Agency / Department",
  "agency_name": "Agency / Department Name",
  "agency_location": "Agency Location",
  "position": "Position Applied For",
  "monthYear": "Application Date (month/year)",
  "application_date": "Application Date (month/year)",
  "outcome": "Outcome",
  "reason": "Reason for Non-Selection",
  "reason_not_selected": "Reason for Non-Selection",
  "issues": "Issues or Concerns",
  "stageReached": "Stage Reached in Hiring Process",
  "stage_reached": "Stage Reached in Hiring Process",
  "full_disclosure": "Full Disclosure on Application",
  "has_documentation": "Documentation Available",
  
  // PACK_INTEGRITY_APPS
  "incident_date": "Incident Date (month/year)",
  "issue_type": "Type of Issue",
  "what_omitted": "What Was Omitted/Falsified",
  "reason_omitted": "Why It Was Omitted",
  "discovery_method": "How Discovered",
  "consequences": "Consequences",
  "corrected": "Has Been Corrected",
  
  // PACK_LE_MISCONDUCT_STANDARD
  "position_held": "Position Held",
  "employment_dates": "Employment Dates",
  "allegation_type": "Nature of Allegation",
  "allegation_description": "Description of Allegation",
  "ia_case_number": "IA Case Number",
  "finding": "Finding / Outcome",
  "discipline": "Disciplinary Action",
  "appealed": "Was Appealed",
  
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
  "incidentDescription": "Description of Incident",
  
  // PACK_WORKPLACE_STANDARD
  "employer": "Employer",
  "position_at_time": "Position at Time of Incident",
  "misconduct_type": "Type of Misconduct",
  "incident_description": "Description of Incident",
  "corrective_action": "Corrective Action Taken",
  "separation_type": "Separation Type",
  "official_reason": "Official Reason Given",
  "isolated_or_recurring": "Isolated or Recurring",
  "impact": "Impact on Workplace",
  "remediation": "Corrective Steps / Remediation",
  
  // PACK_INTEGRITY_APPS
  "position_applied_for": "Position Applied For",
  "issue_type": "Integrity Issue Type",
  "what_omitted": "Information Involved",
  "reason_omitted": "Reason for Omission",
  "consequences": "Application Outcome",
  "corrected": "Corrected Disclosure",
  "remediation_steps": "Remediation Steps",
  
  // PACK_LE_APPS
  "agency_location": "Agency Location",
  "background_issues": "Background Issues Cited",
  
  // PACK_LE_MISCONDUCT_STANDARD
  "allegation_description": "Allegation Description",
  
  // PACK_FINANCIAL_STANDARD
  "financial_issue_type": "Type of Financial Issue",
  "most_recent_date": "Most Recent Occurrence",
  "amount_owed": "Amount Owed / Affected",
  "creditor": "Creditor or Agency Involved",
  "legal_actions": "Legal Actions Taken",
  "employment_impact": "Impact on Employment / Licensing",
  "resolution_steps": "Steps Taken to Resolve",
  "resolution_status": "Resolution Status",
  "remaining_obligations": "Outstanding Obligations",
  
  // PACK_GANG_STANDARD
  "gang_name": "Gang or Group",
  "end_date": "End of Involvement",
  "involvement_level": "Level of Involvement",
  "origin_story": "How Involvement Began",
  "activities": "Activities or Participation",
  "illegal_activity": "Illegal Activity Involved",
  "post_exit_contact": "Contact After Leaving Group",
  
  // PACK_MILITARY_STANDARD
  "branch": "Branch of Service",
  "rank_role": "Rank and Role",
  "orders_violation": "Orders/Standards Involved",
  "alcohol_drugs": "Alcohol/Drug/Stress Factors",
  "disciplinary_action": "Disciplinary Action Taken",
  "career_impact": "Impact on Career or Clearance",
  "remediation_steps": "Steps Taken Since Incident",
  
  // PACK_WEAPONS_STANDARD
  "weapon_type": "Type of Weapon",
  "weapon_ownership": "Ownership / Possession",
  "weapon_use": "Carrying / Displaying / Using Weapon",
  "threats": "Threats or Danger to Others",
  "discharge": "Weapon Discharge",
  "actions_taken": "Actions Taken Afterward",
  
  // PACK_SEX_ADULT_STANDARD
  "type": "Type of Misconduct",
  "when": "When It Occurred",
  "where": "Location",
  "consensual": "Consent Status",
  "environment": "Setting",
  "authority_awareness": "Authority Awareness",
  "consequences": "Consequences & Remediation",
  
  // PACK_NON_CONSENT_STANDARD
  "incident_type": "Type of Incident",
  "date": "Date of Incident",
  "other_party": "Other Party (Relationship Only)",
  "narrative": "What Happened",
  "coercion": "Coercion or Force",
  "consent_signals": "Consent Signals",
  "injuries": "Injuries Reported",
  "legal_action": "Official Actions",
  
  // PACK_DRUG_SALE_STANDARD
  "substance_type": "Substance Type",
  "role": "Role / Involvement",
  "approx_date": "Approximate Date",
  "frequency": "Frequency",
  "location": "Location",
  "associates": "Other Parties",
  "compensation": "Profit / Compensation",
  "weapons_violence": "Weapons or Violence",
  "law_enforcement_involved": "LE Involvement",
  "arrested_charged": "Arrest / Charges",
  "disclosed_prior": "Previously Disclosed",
  "recurrence": "Occurred Again",
  "prevention_steps": "Steps Taken Since",
  
  // PACK_DRUG_USE_STANDARD
  "first_use_date": "First Use",
  "last_use_date": "Most Recent Use",
  "total_uses": "Times Used",
  "use_context": "Context of Use",
  "use_location": "Location",
  "obtain_method": "Obtained How",
  "under_influence_in_prohibited_setting": "Under Influence in Prohibited Setting",
  "consequences": "Consequences",
  "prior_disclosure": "Previously Disclosed",
  "other_substances_used": "Other Substances",
  "behavior_stopped": "Behavior Stopped",
  "mitigation_steps": "Mitigation Steps",
  
  // PACK_PRESCRIPTION_MISUSE_STANDARD
  "medication_type": "Medication",
  "access_source": "Access Method",
  "first_occurrence_date": "First Occurrence",
  "most_recent_date": "Most Recent",
  "total_occurrences": "Times Misused",
  "misuse_method": "How Misused",
  "misuse_location": "Location",
  "impairment_settings": "Impairment Settings",
  "confrontation_discipline": "Confrontation/Discipline",
  "authority_awareness": "Authority Awareness",
  "help_sought": "Help Sought",
  "recurrence": "Recurrence",
  "prevention_steps": "Prevention Steps",
  
  // PACK_PRIOR_LE_APPS_STANDARD (lowercase semantic keys - aligned with config)
  "agency_type": "Type of Agency",
  "agency_name": "Agency Name",
  "location_general": "Agency Location",
  "time_period": "Application Time Period",
  "position": "Position Applied For",
  "outcome": "Application Outcome",
  "reason_not_hired": "Reason for Not Being Hired",
  "appeal_or_reapply": "Appeal or Reapplication",
  "anything_else": "Additional Information"
};

/**
 * Generate a probe question for a specific incomplete field using LLM
 * Falls back to static question if LLM fails
 * NOW USES: GlobalSettings AI runtime config (model, temperature, max_tokens, top_p)
 * V2.5: Anchored to section context for topic boundaries
 */
async function generateFieldProbeQuestion(base44Client, {
  fieldName,
  currentValue,
  probeCount,
  incidentContext = {},
  packId,
  maxProbesPerField,
  sectionContext = {}
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
      maxProbesPerField,
      sectionContext
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
    
    // TIMING: Start LLM latency measurement
    const t0 = Date.now();
    
    // Call InvokeLLM with unified instructions AND AI runtime config
    const result = await base44Client.integrations.Core.InvokeLLM({
      prompt: `${instructions}\n\n${userPrompt}`,
      add_context_from_internet: false,
      model: aiConfig.model,
      temperature: aiConfig.temperature,
      max_tokens: aiConfig.max_tokens,
      top_p: aiConfig.top_p
    });
    
    const t1 = Date.now();
    
    // TIMING: Log LLM latency with context
    console.log('[V2 PROBING][BACKEND] LLM latency (ms):', (t1 - t0), {
      pack_id: packId,
      field_key: fieldName,
      semanticRole: fieldName,
      probeCount,
      model: aiConfig.model
    });
    
    const question = result?.trim();
    
    // Check if LLM explicitly said no probe needed
    if (question === "NO_PROBE_NEEDED" || question === "NO_FOLLOWUP_NEEDED") {
      console.log(`[V2-LLM] LLM determined no probe needed for pack=${packId}, field=${fieldName}`);
      return { question: null, isFallback: false, source: 'llm_no_probe', model: aiConfig.model };
    }
    
    if (question && question.length >= 10 && question.length <= 500) {
      // EXPLICIT LOGGING: LLM success with topic validation
      console.log(`[V2-PROBE-SUMMARY]`, {
        packId,
        sectionName: sectionContext.sectionName || 'unknown',
        questionId: sectionContext.questionDbId || 'unknown',
        questionCodeOrDbId: sectionContext.questionCode || sectionContext.questionDbId || 'unknown',
        truncatedBaseQuestion: (sectionContext.baseQuestionText || '').substring(0, 60),
        truncatedProbeText: question.substring(0, 80)
      });
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
 * Includes all date-type semantic keys used across PACK_CONFIG
 */
const DATE_SEMANTIC_TYPES = new Set([
  // Legacy / common date fields
  'monthYear', 'collisionDate', 'violationDate', 'incidentDate',
  'date', 'incident_date', 'applicationDate',
  // PACK_LE_APPS
  'application_date',
  // PACK_PRIOR_LE_APPS_STANDARD (uppercase semantic keys)
  'TIMELINE',
  // PACK_LE_MISCONDUCT_STANDARD
  'employment_dates',
  // PACK_FINANCIAL_STANDARD / PACK_GANG_STANDARD / etc.
  'start_date', 'most_recent_date', 'end_date',
  // PACK_DRUG_USE_STANDARD
  'first_use_date', 'last_use_date',
  // PACK_DRUG_SALE_STANDARD
  'approx_date',
  // PACK_PRESCRIPTION_MISUSE_STANDARD
  'first_occurrence_date'
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
 * Build BI-style clarifier question from fact anchors
 * NO narrative framing, NO "for your investigator" language
 */
function buildClarifierFromAnchors(packEntity, anchorKeys, mode, context = {}) {
  const factAnchors = packEntity?.fact_anchors || [];
  if (!factAnchors.length || !anchorKeys?.length) return null;
  
  // Get anchor definitions for requested keys
  const anchors = anchorKeys
    .map(key => factAnchors.find(a => a.key === key))
    .filter(Boolean);
  
  if (!anchors.length) return null;
  
  // Question templates
  const templates = {
    agency_type: { micro: "What type of agency was it (city police, sheriff's office, state agency, or federal agency)?", combined: "what type of agency was it" },
    agency_name: { micro: "What was the name of that agency?", combined: "what was the agency name" },
    position: { micro: "What position did you apply for?", combined: "what position did you apply for" },
    month_year: { micro: "About what month and year was that?", combined: "about what month and year" },
    approx_date: { micro: "About what month and year did that happen?", combined: "about what month and year" },
    location: { micro: "Where did that happen?", combined: "where it happened" },
    location_general: { micro: "What city and state was that in?", combined: "what city and state" },
    outcome: { micro: "What was the outcome?", combined: "what was the outcome" },
    consequences: { micro: "What were the consequences?", combined: "what were the consequences" },
    what_happened: { micro: "What happened?", combined: "what happened" },
    description: { micro: "Can you briefly describe what occurred?", combined: "what occurred" }
  };
  
  const getTemplate = (key, m) => (templates[key] || { micro: "Can you provide that information?", combined: "that information" })[m];
  
  if (mode === "micro") {
    const q = getTemplate(anchors[0].key, "micro");
    if (context.multiInstance && anchors[0].multiInstanceAware) {
      return "For this incident, " + q.charAt(0).toLowerCase() + q.slice(1);
    }
    return q;
  }
  
  // Combined mode - take up to 3
  const toAsk = anchors.slice(0, 3);
  const fragments = toAsk.map(a => getTemplate(a.key, "combined"));
  
  let question;
  if (fragments.length === 2) {
    question = `${fragments[0].charAt(0).toUpperCase() + fragments[0].slice(1)} and ${fragments[1]}?`;
  } else if (fragments.length === 3) {
    question = `${fragments[0].charAt(0).toUpperCase() + fragments[0].slice(1)}, ${fragments[1]}, and ${fragments[2]}?`;
  } else {
    question = fragments[0].charAt(0).toUpperCase() + fragments[0].slice(1) + "?";
  }
  
  if (context.multiInstance && toAsk.some(a => a.multiInstanceAware)) {
    return "For this incident, " + question.charAt(0).toLowerCase() + question.slice(1);
  }
  
  return question;
}

/**
 * Compute collected and missing anchors for an instance
 */
function computeAnchorState(packEntity, instanceAnchors = {}) {
  const factAnchors = packEntity?.fact_anchors || [];
  if (!factAnchors.length) return { collectedAnchors: {}, missingAnchors: [], requiredMissing: [] };
  
  const collectedAnchors = {};
  const missingAnchors = [];
  const requiredMissing = [];
  
  const sorted = [...factAnchors].sort((a, b) => a.priority - b.priority);
  
  for (const anchor of sorted) {
    const val = instanceAnchors[anchor.key];
    if (val !== undefined && val !== null && val !== "") {
      collectedAnchors[anchor.key] = val;
    } else {
      missingAnchors.push(anchor.key);
      if (anchor.required) requiredMissing.push(anchor.key);
    }
  }
  
  return { collectedAnchors, missingAnchors, requiredMissing };
}

/**
 * Get topic for discretion engine
 */
function getPackTopicForDiscretion(packId) {
  const map = {
    "PACK_PRIOR_LE_APPS_STANDARD": "prior_apps",
    "PACK_LE_APPS": "prior_apps",
    "PACK_INTEGRITY_APPS": "honesty_integrity",
    "PACK_DOMESTIC_VIOLENCE_STANDARD": "violence_dv",
    "PACK_ASSAULT_STANDARD": "violence_dv",
    "PACK_DRIVING_DUIDWI_STANDARD": "dui_drugs",
    "PACK_DRUG_USE_STANDARD": "dui_drugs",
    "PACK_DRIVING_COLLISION_STANDARD": "driving",
    "PACK_DRIVING_STANDARD": "driving"
  };
  return map[packId] || "general";
}

/**
 * Dedicated handler for PACK_PRIOR_LE_APPS_STANDARD → PACK_PRLE_Q01
 * Extracts application_outcome from narrative and returns anchors
 * CRITICAL: Must be called FIRST for this pack/field combination
 */
function handlePriorLeAppsQ01({
  pack_id,
  field_key,
  field_value,
  incident_context = {},
  extractedAnchors = {},
  previous_probes_count = 0,
  instance_number = 1
}) {
  const narrative = (field_value || '').trim();
  
  console.log("[PRIOR_LE_APPS][Q01][HANDLER_ENTRY] ========== DEDICATED HANDLER EXECUTING ==========");
  console.log(`[PRIOR_LE_APPS][Q01][HANDLER] pack_id: ${pack_id}`);
  console.log(`[PRIOR_LE_APPS][Q01][HANDLER] field_key: ${field_key}`);
  console.log(`[PRIOR_LE_APPS][Q01][HANDLER] instance: ${instance_number}, probeCount: ${previous_probes_count}`);
  console.log(`[PRIOR_LE_APPS][Q01][HANDLER] Narrative length: ${narrative.length}`);
  console.log(`[PRIOR_LE_APPS][Q01][HANDLER] Narrative: "${narrative.substring(0, 200)}..."`);
  console.log(`[PRIOR_LE_APPS][Q01][HANDLER] Received extractedAnchors from caller:`, extractedAnchors);
  
  // Start fresh with extractedAnchors (which already include deterministic + centralized extraction)
  // Then merge with incident_context (extractedAnchors take precedence)
  const anchorUpdates = { 
    ...incident_context, 
    ...extractedAnchors 
  };
  
  console.log(`[PRIOR_LE_APPS][Q01][HANDLER] Initial anchors after merge:`, anchorUpdates);
  console.log(`[PRIOR_LE_APPS][Q01][HANDLER] application_outcome from extractedAnchors: "${extractedAnchors.application_outcome || '(NONE)'}"`);
  
  // SAFETY CHECK: If application_outcome is still missing, run inferPriorLEApplicationOutcome as fallback
  if (!anchorUpdates.application_outcome && narrative) {
    console.log(`[PRIOR_LE_APPS][Q01][HANDLER] Running FALLBACK inferPriorLEApplicationOutcome`);
    const fallbackOutcome = inferPriorLEApplicationOutcome(narrative);
    
    if (fallbackOutcome) {
      anchorUpdates.application_outcome = fallbackOutcome;
      console.log(`[PRIOR_LE_APPS][Q01][HANDLER] ✓ FALLBACK extraction: application_outcome="${fallbackOutcome}"`);
    } else {
      console.log(`[PRIOR_LE_APPS][Q01][HANDLER] ✗ FALLBACK extraction: No outcome keyword found in narrative`);
    }
  }
  
  // Final anchor audit
  console.log(`[PRIOR_LE_APPS][Q01][HANDLER] ========== FINAL ANCHORS ==========`);
  console.log(`[PRIOR_LE_APPS][Q01][HANDLER] All anchors:`, anchorUpdates);
  console.log(`[PRIOR_LE_APPS][Q01][HANDLER] Anchor keys: [${Object.keys(anchorUpdates).join(', ')}]`);
  console.log(`[PRIOR_LE_APPS][Q01][HANDLER] application_outcome: "${anchorUpdates.application_outcome || '(MISSING)'}"`);
  console.log(`[PRIOR_LE_APPS][Q01][HANDLER] agency_name: "${anchorUpdates.agency_name || '(MISSING)'}"`);
  console.log(`[PRIOR_LE_APPS][Q01][HANDLER] position: "${anchorUpdates.position || '(MISSING)'}"`);
  console.log(`[PRIOR_LE_APPS][Q01][HANDLER] month_year: "${anchorUpdates.month_year || '(MISSING)'}"`);
  
  // CRITICAL: Return plain object with anchors - createV2ProbeResult will be called by early router
  return {
    mode: "NEXT_FIELD",
    pack_id,
    field_key,
    semanticField: "narrative",
    validationResult: "narrative_complete",
    previousProbeCount: previous_probes_count,
    maxProbesPerField: 4,
    hasQuestion: false,
    followupsCount: 0,
    // CRITICAL: Return anchors for frontend field gating
    anchors: { ...anchorUpdates },
    collectedAnchors: { ...anchorUpdates },
    collectedAnchorsKeys: Object.keys(anchorUpdates),
    reason: "PACK_PRLE_Q01 narrative complete - extracted anchors",
    instanceNumber: instance_number,
    message: `PACK_PRLE_Q01 complete - extracted ${Object.keys(anchorUpdates).length} anchors`
  };
}

/**
 * Unified V2ProbeResult type - ALWAYS includes anchors and collectedAnchors
 * CRITICAL FIX: Remove anchors/collectedAnchors from rest to prevent override
 */
function createV2ProbeResult({
  mode,
  pack_id,
  field_key,
  anchors = {},
  collectedAnchors = {},
  ...rest
}) {
  // Extract and discard anchors/collectedAnchors from rest to prevent them from overwriting explicit params
  const { anchors: _ignoredAnchors, collectedAnchors: _ignoredCollected, ...safeRest } = rest;
  
  return {
    mode,
    pack_id,
    field_key,
    hasQuestion: rest.hasQuestion ?? (mode === 'QUESTION'),
    followupsCount: rest.followupsCount ?? (rest.followups?.length || 0),
    // CRITICAL: Always include anchors and collectedAnchors (set AFTER destructuring rest)
    anchors: anchors || {},
    collectedAnchors: collectedAnchors || {},
    ...safeRest
  };
}

/**
 * Merge anchors from multiple sources
 */
function mergeAnchors(existingAnchors = {}, newAnchors = {}) {
  return {
    ...(existingAnchors || {}),
    ...(newAnchors || {}),
  };
}

/**
 * Main probe engine function - Universal MVP Mode
 * V2.6 Universal MVP: ALL V2 packs use Discretion Engine
 * 
 * Flow:
 * 1. On pack entry (probeCount=0): Call Discretion Engine for opening question
 * 2. On each answer: Extract anchors, call Discretion Engine to decide next step
 * 3. Return QUESTION with AI-generated text, or NEXT_FIELD/COMPLETE when done
 * 
 * SYSTEMIC FIX: All return paths now include anchors and collectedAnchors
 */
async function probeEngineV2(input, base44Client) {
  const {
    pack_id,
    field_key,                    // The specific field being validated
    field_value,                  // The value provided for this field
    previous_probes_count = 0,    // How many times we've probed this incident
    incident_context = {},        // Other field values for context (= collectedAnchors)
    mode: requestMode = "VALIDATE_FIELD",
    answerLooksLikeNoRecall: frontendNoRecallFlag = false,
    sectionName = null,
    baseQuestionText = null,
    questionDbId = null,
    questionCode = null,
    instance_number = 1,
    instance_anchors = {}         // Current anchor values for this instance
  } = input;

  console.log(`[V2-UNIVERSAL] Starting for pack=${pack_id}, field=${field_key}, value="${field_value?.substring?.(0, 50)}", probes=${previous_probes_count}, instance=${instance_number}`);
  
  // Initialize anchor tracking from incoming context
  let currentAnchors = mergeAnchors(incident_context, instance_anchors);
  let extractedAnchors = {};
  
  console.log(`[V2-UNIVERSAL] Initial anchors:`, Object.keys(currentAnchors));
  
  // ============================================================================
  // EARLY ROUTER: PACK_PRIOR_LE_APPS_STANDARD → PACK_PRLE_Q01
  // CRITICAL: This MUST execute FIRST before any generic logic
  // ============================================================================
  
  // CRITICAL FIX: Use robust text extraction to handle all possible property names
  const narrativeText = 
    input.field_value || 
    input.fieldValue || 
    input.answer || 
    input.fullNarrative || 
    input.narrative || 
    '';
  
  console.log(`[EARLY_ROUTER_CHECK] pack_id="${pack_id}", field_key="${field_key}"`);
  console.log(`[EARLY_ROUTER_CHECK] narrativeText length: ${narrativeText?.length || 0}`);
  console.log(`[EARLY_ROUTER_CHECK] narrativeText preview: "${narrativeText?.substring?.(0, 80)}..."`);
  console.log(`[EARLY_ROUTER_CHECK] Condition match: ${pack_id === "PACK_PRIOR_LE_APPS_STANDARD" && field_key === "PACK_PRLE_Q01" && narrativeText && narrativeText.trim()}`);
  
  if (pack_id === "PACK_PRIOR_LE_APPS_STANDARD" && field_key === "PACK_PRLE_Q01" && narrativeText && narrativeText.trim()) {
    console.log("[PRIOR_LE_APPS][Q01][EARLY_ROUTER] ========== ROUTING TO DEDICATED HANDLER ==========");
    
    // PART 1 DIAGNOSTICS: Log raw input narrative
    console.log(`[V2_PRIOR_LE_APPS][PACK_PRLE_Q01] RAW INPUT NARRATIVE:`, narrativeText);
    console.log(`[V2_PRIOR_LE_APPS][PACK_PRLE_Q01] RAW INPUT narrative length: ${narrativeText.length}`);
    console.log(`[V2_PRIOR_LE_APPS][PACK_PRLE_Q01] RAW INPUT incident_context (incoming anchors):`, incident_context);
    console.log(`[V2_PRIOR_LE_APPS][PACK_PRLE_Q01] RAW INPUT instance_anchors:`, instance_anchors);
    
    // CRITICAL: Run deterministic extractor FIRST using registry with narrativeText (not field_value)
    console.log(`[PRIOR_LE_APPS][Q01][EARLY_ROUTER] Running deterministic extraction from FIELD_ANCHOR_EXTRACTORS registry`);
    const deterministicExtraction = extractAnchorsForField(pack_id, field_key, narrativeText);
    Object.assign(extractedAnchors, deterministicExtraction.anchors || {});
    console.log(`[PRIOR_LE_APPS][Q01][EARLY_ROUTER] Deterministic extraction result:`, deterministicExtraction.anchors);
    console.log(`[V2_PRIOR_LE_APPS][PACK_PRLE_Q01] RAW MODEL RESPONSE (deterministic):`, deterministicExtraction.anchors);
    
    // Also run centralized extraction for additional anchors
    try {
      const currentPackConfig = PACK_CONFIG[pack_id];
      if (currentPackConfig?.anchorExtractionRules) {
        const centrallyExtracted = extractAnchorsFromNarrative(
          narrativeText,
          currentPackConfig.anchorExtractionRules,
          { ...currentAnchors, ...extractedAnchors } // Include already extracted anchors
        );
        Object.assign(extractedAnchors, centrallyExtracted);
        console.log(`[PRIOR_LE_APPS][Q01][EARLY_ROUTER] Centralized extraction: [${Object.keys(centrallyExtracted).join(', ')}]`);
        console.log(`[V2_PRIOR_LE_APPS][PACK_PRLE_Q01] RAW MODEL RESPONSE (centralized):`, centrallyExtracted);
      }
    } catch (err) {
      console.warn(`[PRIOR_LE_APPS][Q01][EARLY_ROUTER] Extraction error (continuing):`, err.message);
    }
    
    // Call dedicated handler with all extracted anchors - use narrativeText
    const handlerResult = handlePriorLeAppsQ01({
      pack_id,
      field_key,
      field_value: narrativeText, // Pass narrativeText here
      incident_context: currentAnchors,
      extractedAnchors,
      previous_probes_count,
      instance_number
    });
    
    // PART 1 DIAGNOSTICS: Log parsed anchors from handler
    console.log(`[V2_PRIOR_LE_APPS][PACK_PRLE_Q01] PARSED ANCHORS (from handler):`, handlerResult.anchors);
    console.log(`[V2_PRIOR_LE_APPS][PACK_PRLE_Q01] PARSED ANCHORS application_outcome: "${handlerResult.anchors?.application_outcome || '(MISSING)'}"`);
    
    // Merge anchors from handler
    const mergedAnchors = mergeAnchors(currentAnchors, handlerResult.anchors);
    
    console.log(`[V2_PRIOR_LE_APPS][PACK_PRLE_Q01] FINAL MERGED ANCHORS:`, mergedAnchors);
    console.log(`[V2_PRIOR_LE_APPS][PACK_PRLE_Q01] FINAL application_outcome: "${mergedAnchors.application_outcome || '(MISSING)'}"`);
    
    // CRITICAL: Create result with explicit anchors parameter BEFORE collectedAnchors
    const finalResult = createV2ProbeResult({
      mode: handlerResult.mode,
      pack_id: handlerResult.pack_id,
      field_key: handlerResult.field_key,
      anchors: mergedAnchors,
      collectedAnchors: mergedAnchors,
      hasQuestion: handlerResult.hasQuestion,
      followupsCount: handlerResult.followupsCount,
      semanticField: handlerResult.semanticField,
      validationResult: handlerResult.validationResult,
      previousProbeCount: handlerResult.previousProbeCount,
      maxProbesPerField: handlerResult.maxProbesPerField,
      collectedAnchorsKeys: Object.keys(mergedAnchors),
      reason: handlerResult.reason,
      instanceNumber: handlerResult.instanceNumber,
      message: handlerResult.message
    });
    
    console.log("[PRIOR_LE_APPS][Q01][EARLY_ROUTER] ========== RETURNING FROM DEDICATED HANDLER ==========");
    console.log('[PRIOR_LE_APPS][PACK_PRLE_Q01] text=', narrativeText.substring(0, 100));
    console.log('[PRIOR_LE_APPS][PACK_PRLE_Q01] anchors=', finalResult.anchors);
    console.log('[PRIOR_LE_APPS][PACK_PRLE_Q01] collectedAnchors=', finalResult.collectedAnchors);
    
    // ASSERTION LOG
    if (finalResult.anchors && finalResult.anchors.application_outcome) {
      console.log("[PRIOR_LE_APPS][PACK_PRLE_Q01] ✅ application_outcome anchor present:", finalResult.anchors.application_outcome);
    } else {
      console.log("[PRIOR_LE_APPS][PACK_PRLE_Q01] ❌ application_outcome anchor missing in final result");
    }
    
    console.log('[V2_ENGINE][RETURN]', {
      packId: pack_id,
      fieldKey: field_key,
      mode: finalResult.mode,
      anchorKeys: Object.keys(finalResult.collectedAnchors || {}),
      hasApplicationOutcome: !!(finalResult.collectedAnchors?.application_outcome),
      application_outcome_value: finalResult.collectedAnchors?.application_outcome || '(MISSING)'
    });
    
    return finalResult;
  }
  
  // ============================================================================
  // V2.6 UNIVERSAL MVP: Use Discretion Engine for ALL V2 packs
  // ============================================================================
  
  console.log(`[V2-UNIVERSAL][ENTRY] pack=${pack_id} field=${field_key} instance=${instance_number} probeCount=${previous_probes_count}`);
  
  // HARDENED: For pack opening (probeCount=0, empty field value), call Discretion Engine
  // Validate pack_id before calling to prevent errors
  if (previous_probes_count === 0 && (!field_value || field_value.trim() === "")) {
    if (!pack_id || typeof pack_id !== 'string') {
      console.error(`[V2-UNIVERSAL][OPENING] Invalid pack_id: ${pack_id}`);
      return createV2ProbeResult({
        mode: "NEXT_FIELD",
        pack_id,
        field_key,
        semanticField: field_key,
        validationResult: "invalid_pack_id",
        anchors: currentAnchors,
        collectedAnchors: currentAnchors,
        message: 'Invalid pack_id - cannot open pack'
      });
    }
    
    // SPECIAL CASE: PACK_PRIOR_LE_APPS_STANDARD and PACK_LE_APPS - NO opening probe
    // These packs show PACK_PRLE_Q01 (narrative question) as the first field.
    // No AI opening message needed - go straight to showing Q01.
    if (pack_id === "PACK_PRIOR_LE_APPS_STANDARD" || pack_id === "PACK_LE_APPS") {
      console.log(`[PACK_PRIOR_LE_APPS][OPENING] No opening probe - showing PACK_PRLE_Q01 narrative field directly`);
      return createV2ProbeResult({
        mode: "NONE",
        pack_id,
        field_key,
        semanticField: field_key,
        validationResult: "prior_le_apps_no_opening",
        hasQuestion: false,
        targetAnchors: [],
        anchors: currentAnchors,
        collectedAnchors: currentAnchors,
        reason: "prior_le_apps: no opening probe; Q01 is the opener",
        message: "PACK_PRIOR_LE_APPS_STANDARD shows Q01 narrative field directly - no opening message"
      });
    }
    
    console.log(`[V2-UNIVERSAL][OPENING] Calling Discretion Engine for pack opening question`);
    
    try {
      const discretionResult = await base44Client.functions.invoke('discretionEngine', {
        packId: pack_id,
        collectedAnchors: currentAnchors,
        probeCount: 0,
        instanceNumber: instance_number,
        lastAnswer: ""
      });
      
      // HARDENED: Validate response structure
      if (discretionResult.data?.success && discretionResult.data?.question && discretionResult.data.question.trim()) {
        const question = discretionResult.data.question.trim();
        console.log(`[V2-UNIVERSAL][OPENING] Discretion returned: "${question.substring(0, 60)}..."`);
        return createV2ProbeResult({
          mode: "QUESTION",
          pack_id,
          field_key,
          semanticField: field_key,
          question,
          validationResult: "opening_question",
          previousProbeCount: 0,
          maxProbesPerField: discretionResult.data.debug?.maxProbes || 4,
          isFallback: false,
          probeSource: 'discretion_opening',
          targetAnchors: discretionResult.data.targetAnchors || [],
          tone: discretionResult.data.tone || 'neutral',
          instanceNumber: instance_number,
          anchors: currentAnchors,
          collectedAnchors: currentAnchors,
          message: "Opening question from Discretion Engine"
        });
      } else {
        console.warn(`[V2-UNIVERSAL][OPENING] Invalid discretion response - falling back`);
      }
    } catch (err) {
      console.error(`[V2-UNIVERSAL][OPENING] Discretion Engine error: ${err.message}`);
      // HARDENED: Fall through to legacy handling instead of failing
    }
  }

  const packConfig = PACK_CONFIG[pack_id];
  
  // ============================================================================
  // V2.6 UNIVERSAL: Call Discretion Engine for EVERY answer
  // The Discretion Engine decides whether to probe or advance
  // ============================================================================
  
  // HARDENED: Extract anchors BEFORE calling Discretion Engine
  if (field_value && field_value.trim()) {
    try {
      // =====================================================================
      // CENTRALIZED ANCHOR EXTRACTION - Uses anchorExtractionRules from PACK_CONFIG
      // Automatically extracts outcomes, dates, agencies, roles from narrative
      // NO per-pack hand-coded rules needed - all defined declaratively in PACK_CONFIG
      // =====================================================================
      
      const currentPackConfig = PACK_CONFIG[pack_id];
      if (currentPackConfig?.anchorExtractionRules) {
        console.log(`[ANCHOR_EXTRACT][${pack_id}] Using centralized extraction engine`);
        
        // Use centralized extraction function
        const centrallyExtracted = extractAnchorsFromNarrative(
          field_value,
          currentPackConfig.anchorExtractionRules,
          currentAnchors
        );
        
        // Merge centrally extracted anchors
        Object.assign(extractedAnchors, centrallyExtracted);
        
        console.log(`[ANCHOR_EXTRACT][${pack_id}] Extracted ${Object.keys(centrallyExtracted).length} anchors: [${Object.keys(centrallyExtracted).join(', ')}]`);
        
        // For PACK_PRIOR_LE_APPS_STANDARD, also extract city/state (location pattern)
        if (pack_id === "PACK_PRIOR_LE_APPS_STANDARD") {
          const locationPatterns = [
            /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),?\s*([A-Z]{2})\b/,
            /\bin\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),?\s*([A-Z]{2})\b/i
          ];
          for (const pattern of locationPatterns) {
            const locationMatch = field_value.match(pattern);
            if (locationMatch) {
              extractedAnchors.application_city = locationMatch[1];
              extractedAnchors.application_state = locationMatch[2];
              console.log(`[ANCHOR_EXTRACT][${pack_id}] location: city="${locationMatch[1]}" state="${locationMatch[2]}"`);
              break;
            }
          }
          
          // CRITICAL DEBUG LOG: Show all extracted anchors for PACK_PRIOR_LE_APPS_STANDARD
          console.log(`[V2_PRIOR_LE_APPS][PACK_PRLE_Q01] ========== ANCHOR EXTRACTION COMPLETE ==========`);
          console.log(`[V2_PRIOR_LE_APPS][PACK_PRLE_Q01] narrative preview: "${field_value?.substring?.(0, 100)}..."`);
          console.log(`[V2_PRIOR_LE_APPS][PACK_PRLE_Q01] anchors inferred:`, {
            application_outcome: extractedAnchors.application_outcome || '(NOT FOUND)',
            agency_name: extractedAnchors.agency_name || '(NOT FOUND)',
            position: extractedAnchors.position || '(NOT FOUND)',
            month_year: extractedAnchors.month_year || '(NOT FOUND)',
            application_city: extractedAnchors.application_city || '(NOT FOUND)',
            application_state: extractedAnchors.application_state || '(NOT FOUND)'
          });
        }
      } else {
        console.log(`[ANCHOR_EXTRACT][${pack_id}] No anchorExtractionRules defined - skipping centralized extraction`);
      }
      
      // Aggregate all previous answers for LLM extraction (fallback)
      const allAnswers = Object.values(incident_context || {}).filter(Boolean);
      let answerToExtract = field_value;
      if (allAnswers.length > 0) {
        answerToExtract = [...allAnswers, field_value].join(' ');
        console.log(`[ANCHOR_EXTRACT][${pack_id}] Aggregating ${allAnswers.length + 1} answers for LLM extraction`);
      }
      
      const extractionResult = await base44Client.functions.invoke('factExtractor', {
        packId: pack_id,
        candidateAnswer: answerToExtract,
        previousAnchors: currentAnchors
      });
      if (extractionResult.data?.success && extractionResult.data.newAnchors) {
        // Merge LLM extraction with local extraction (local takes precedence)
        extractedAnchors = { ...extractionResult.data.newAnchors, ...extractedAnchors };
        
        // Log extracted anchors for PACK_PRIOR_LE_APPS_STANDARD
        if (pack_id === "PACK_PRIOR_LE_APPS_STANDARD") {
          console.log(`[PACK_PRIOR_LE_APPS][EXTRACT] ========== ANCHOR EXTRACTION ==========`);
          console.log(`[PACK_PRIOR_LE_APPS][EXTRACT] Extracted: ${JSON.stringify(extractedAnchors, null, 2)}`);
          console.log(`[PACK_PRIOR_LE_APPS][EXTRACT] Keys: [${Object.keys(extractedAnchors).join(', ')}]`);
        } else {
          console.log(`[V2-UNIVERSAL][EXTRACT] Extracted keys: ${Object.keys(extractedAnchors).join(', ')}`);
        }
      }
    } catch (extractErr) {
      console.warn(`[V2-UNIVERSAL][EXTRACT] Extraction failed - continuing:`, extractErr.message);
    }
    
    // Merge extracted anchors into current state
    currentAnchors = mergeAnchors(currentAnchors, extractedAnchors);
    console.log(`[V2-UNIVERSAL][EXTRACT] Merged anchors:`, Object.keys(currentAnchors));
  }
  
  if (field_value && field_value.trim()) {
    console.log(`[V2-UNIVERSAL][ANSWER] Calling Discretion Engine after answer`);
    
    try {
      // HARDENED: Validate anchor count to prevent malformed state
      const anchorCount = Object.keys(currentAnchors).length;
      if (anchorCount > 20) {
        console.warn(`[V2-UNIVERSAL] Excessive anchor count (${anchorCount}) - possible data issue`);
      }
      
      // CRITICAL: Only increment probeCount when we're actually asking a question
      // The opening call with mode='NONE' should NOT consume a probe
      // We pass the raw count here; the discretion engine will decide if this answer
      // justifies asking another question

      const discretionResult = await base44Client.functions.invoke('discretionEngine', {
        packId: pack_id,
        collectedAnchors: currentAnchors,
        probeCount: previous_probes_count, // Raw count - increment happens ONLY when a question is actually asked
        instanceNumber: instance_number,
        lastAnswer: field_value
      });
      
      // V2_LIFECYCLE LOG: Probe counting - only questions consume probes
      const hasAiQuestion = discretionResult.data?.success && 
                            (discretionResult.data.action === 'ask_combined' || discretionResult.data.action === 'ask_micro') &&
                            discretionResult.data.question && 
                            discretionResult.data.question.trim();
      
      console.log(`[V2_LIFECYCLE][PROBE_COUNT]`, {
        packId: pack_id,
        previousProbeCount: previous_probes_count,
        hasAiQuestion,
        nextProbeCount: hasAiQuestion ? previous_probes_count + 1 : previous_probes_count,
        mode: discretionResult.data?.action,
        reason: discretionResult.data?.reason
      });
      
      console.log(`[V2-UNIVERSAL][DISCRETION] Result:`, {
        action: discretionResult.data?.action,
        hasQuestion: !!discretionResult.data?.question,
        reason: discretionResult.data?.reason
      });
      
      // PACK_PRIOR_LE_APPS_STANDARD: Log discretion decision with anchor details
      if (pack_id === "PACK_PRIOR_LE_APPS_STANDARD") {
        console.log(`[PACK_PRIOR_LE_APPS][DISCRETION] ========== DISCRETION DECISION ==========`);
        console.log(`[PACK_PRIOR_LE_APPS][DISCRETION]`, {
          action: discretionResult.data?.action,
          question_type: discretionResult.data?.action === "ask_combined" ? "COMPOUND" : 
                         discretionResult.data?.action === "ask_micro" ? "CLARIFIER" : "NONE",
          target_anchors: discretionResult.data?.targetAnchors || [],
          collected_anchor_count: Object.keys(currentAnchors).length,
          probe_count: previous_probes_count + 1,
          will_ask_question: discretionResult.data?.action !== "stop",
          question_preview: discretionResult.data?.question?.substring?.(0, 80),
          application_outcome: currentAnchors.application_outcome || '(MISSING)'
        });
      }
      
      // HARDENED: Validate discretion result structure
      if (discretionResult.data?.success && discretionResult.data.action) {
        if (discretionResult.data.action === "stop") {
          // Discretion says we have enough - advance
          // No probe was asked, so probeCount stays the same
          console.log(`[V2-UNIVERSAL][STOP] Discretion says stop: ${discretionResult.data.reason}`);
          
          return createV2ProbeResult({
            mode: "NEXT_FIELD",
            pack_id,
            field_key,
            semanticField: field_key,
            validationResult: "discretion_stop",
            previousProbeCount: previous_probes_count,
            maxProbesPerField: discretionResult.data.debug?.maxProbes || 4,
            reason: discretionResult.data.reason,
            instanceNumber: instance_number,
            anchors: currentAnchors,
            collectedAnchors: currentAnchors,
            targetAnchors: discretionResult.data.targetAnchors,
            message: `Discretion Engine stopped: ${discretionResult.data.reason}`
          });
        } else if (discretionResult.data.question && discretionResult.data.question.trim()) {
          // HARDENED: Validate question text before returning
          const question = discretionResult.data.question.trim();
          if (question.length < 10 || question.length > 500) {
            console.warn(`[V2-UNIVERSAL] Invalid question length (${question.length}) - advancing instead`);
            return createV2ProbeResult({
              mode: "NEXT_FIELD",
              pack_id,
              field_key,
              semanticField: field_key,
              validationResult: "invalid_question",
              previousProbeCount: previous_probes_count + 1,
              anchors: currentAnchors,
              collectedAnchors: currentAnchors,
              message: 'Invalid question from Discretion - advancing'
            });
          }
          
          // Discretion wants to ask another question - THIS is where we increment probeCount
          console.log(`[V2-UNIVERSAL][PROBE] Discretion asks: "${question.substring(0, 60)}..."`);
          return createV2ProbeResult({
            mode: "QUESTION",
            pack_id,
            field_key,
            semanticField: field_key,
            question,
            validationResult: "discretion_probe",
            previousProbeCount: previous_probes_count + 1,
            maxProbesPerField: discretionResult.data.debug?.maxProbes || 4,
            isFallback: false,
            probeSource: `discretion_${discretionResult.data.action}`,
            targetAnchors: discretionResult.data.targetAnchors,
            tone: discretionResult.data.tone,
            instanceNumber: instance_number,
            anchors: currentAnchors,
            collectedAnchors: currentAnchors,
            message: `Probing for: ${discretionResult.data.targetAnchors?.join(', ')}`
          });
        } else {
          // No valid question returned - don't increment probe count
          console.warn(`[V2-UNIVERSAL] Discretion action=${discretionResult.data.action} but no valid question - advancing`);
          return createV2ProbeResult({
            mode: "NEXT_FIELD",
            pack_id,
            field_key,
            semanticField: field_key,
            validationResult: "discretion_no_question",
            previousProbeCount: previous_probes_count,
            anchors: currentAnchors,
            collectedAnchors: currentAnchors,
            message: 'No question from Discretion - advancing'
          });
        }
      } else {
        console.warn(`[V2-UNIVERSAL] Invalid discretion result - advancing`);
      }
    } catch (err) {
      console.error(`[V2-UNIVERSAL][DISCRETION_ERROR]`, err.message);
      // HARDENED: Fall through to legacy validation instead of failing
    }
  }
  
  // ============================================================================
  // ============================================================================
  // GOLDEN MVP: DETERMINISTIC FIELD ANCHOR EXTRACTION (ALWAYS RUNS)
  // This runs AFTER discretion/validation but BEFORE returning v2Result
  // Ensures v2Result always has anchors/collectedAnchors populated when available
  // ============================================================================
  
  if (field_value && field_value.trim()) {
    console.log(`[V2_FACTS][EXTRACTION_CHECK] Running deterministic extraction for pack="${pack_id}", field="${field_key}"`);
    
    const deterministic = extractAnchorsForField(pack_id, field_key, field_value);
    
    // Merge deterministic anchors into current state
    // Deterministic extraction has priority over previous values
    if (deterministic.anchors && Object.keys(deterministic.anchors).length > 0) {
      console.log(`[V2_FACTS][EXTRACTION_SUCCESS] Merging ${Object.keys(deterministic.anchors).length} deterministic anchors`);
      currentAnchors = mergeAnchors(currentAnchors, deterministic.anchors);
      
      // Special logging for PACK_PRIOR_LE_APPS_STANDARD
      if (pack_id === "PACK_PRIOR_LE_APPS_STANDARD") {
        console.log(`[V2_PRIOR_LE_APPS][DETERMINISTIC] application_outcome="${currentAnchors.application_outcome || '(MISSING)'}"`);
        console.log(`[V2_PRIOR_LE_APPS][DETERMINISTIC] All anchors after merge:`, currentAnchors);
      }
    } else {
      console.log(`[V2_FACTS][EXTRACTION_EMPTY] No anchors extracted for pack="${pack_id}", field="${field_key}"`);
    }
  }
  
  // ============================================================================
  // LEGACY FALLBACK: Only used if Discretion Engine fails
  // ============================================================================
  
  if (!packConfig) {
    console.log(`[V2-UNIVERSAL] No pack config found for ${pack_id} - using discretion fallback`);
    
    // For unsupported packs, fail closed - do NOT generate generic probes
    const semanticInfo = semanticV2EvaluateAnswer(field_key, field_value, currentAnchors);
    
    return createV2ProbeResult({
      mode: "NEXT_FIELD", 
      pack_id,
      field_key,
      semanticField: field_key,
      validationResult: "skipped_unsupported_pack",
      hasProbeQuestion: false,
      semanticInfo,
      anchors: currentAnchors,
      collectedAnchors: currentAnchors,
      message: `Pack ${pack_id} not configured for V2 probing - accepting answer without probe` 
    });
  }

  // Map raw field key to semantic name
  const semanticField = mapFieldKey(packConfig, field_key);
  console.log(`[V2-PER-FIELD] Mapped ${field_key} → ${semanticField}`);
  
  // EXPLICIT LOGGING: Field mapping for PACK_PRIOR_LE_APPS_STANDARD
  if (pack_id === "PACK_PRIOR_LE_APPS_STANDARD") {
    console.log(`[V2-BACKEND-MAPPING] PACK_PRIOR_LE_APPS_STANDARD field mapping`, {
      raw_field_key: field_key,
      mapped_semantic_field: semanticField,
      pack_config_exists: !!packConfig,
      has_field_key_map: !!packConfig?.fieldKeyMap,
      all_field_keys_in_map: Object.keys(packConfig?.fieldKeyMap || {}),
      mapping_found: !!packConfig?.fieldKeyMap?.[field_key]
    });
  }

  // Global v2-semantic evaluation (pack-agnostic)
  const semanticInfo = semanticV2EvaluateAnswer(semanticField, field_value, currentAnchors);

  // Fetch max_ai_followups and fact_anchors from FollowUpPack entity
  let maxProbesPerField = DEFAULT_MAX_PROBES_FALLBACK;
  let packEntity = null;
  
  try {
    const followUpPacks = await base44Client.entities.FollowUpPack.filter({
      followup_pack_id: pack_id,
      active: true
    });
    if (followUpPacks.length > 0) {
      packEntity = followUpPacks[0];
      
      if (typeof packEntity.max_ai_followups === 'number' && packEntity.max_ai_followups > 0) {
        maxProbesPerField = packEntity.max_ai_followups;
        console.log(`[V2-PER-FIELD] Using max_ai_followups from FollowUpPack entity: ${maxProbesPerField}`);
      } else {
        console.log(`[V2-PER-FIELD] FollowUpPack entity has no valid max_ai_followups, using fallback: ${maxProbesPerField}`);
      }
      
      // Log fact anchors if present
      if (packEntity.fact_anchors?.length > 0) {
        console.log(`[V2-ANCHORS] Pack ${pack_id} has ${packEntity.fact_anchors.length} fact anchors configured`);
      }
    } else {
      console.log(`[V2-PER-FIELD] No active FollowUpPack entity found for ${pack_id}, using fallback: ${maxProbesPerField}`);
    }
  } catch (err) {
    console.warn(`[V2-PER-FIELD] Error fetching FollowUpPack entity, using fallback: ${maxProbesPerField}`, err.message);
  }

  // Validate the current field value with pack-specific rules
  let validationResult = validateField(semanticField, field_value, currentAnchors);
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
    
    if (pack_id === "PACK_PRIOR_LE_APPS_STANDARD") {
      console.log(`[V2-BACKEND-DECISION] ========== PACK_PRIOR_LE_APPS_STANDARD DECISION: NEXT_FIELD (MAX PROBES) ==========`);
      console.log(`[V2-BACKEND-DECISION] Max probes reached for ${semanticField} - accepting answer and advancing`);
    }
    
    return createV2ProbeResult({
      mode: "NEXT_FIELD",
      pack_id,
      field_key,
      semanticField,
      validationResult: "max_probes_reached",
      previousProbeCount: previous_probes_count,
      maxProbesPerField,
      semanticInfo,
      anchors: currentAnchors,
      collectedAnchors: currentAnchors,
      message: `Max probes reached for ${semanticField}, accepting current value`
    });
  }

  // If field is complete (valid answer), move to next field
  if (validationResult === "complete") {
    console.log(`[V2-PER-FIELD] Field ${semanticField} is complete → advancing`);
    
    // EXPLICIT LOGGING: NEXT_FIELD decision for PACK_PRIOR_LE_APPS_STANDARD
    if (pack_id === "PACK_PRIOR_LE_APPS_STANDARD") {
      console.log(`[V2-BACKEND-DECISION] ========== PACK_PRIOR_LE_APPS_STANDARD DECISION: NEXT_FIELD ==========`);
      console.log(`[V2-BACKEND-DECISION] Field ${semanticField} is complete - advancing`, {
        field_key,
        semanticField,
        decision: "NEXT_FIELD",
        validationResult: "complete",
        will_advance_to_next_field: true,
        extractedAnchorKeys: Object.keys(extractedAnchors || {}),
        currentAnchorsKeys: Object.keys(currentAnchors),
        application_outcome: currentAnchors.application_outcome || '(MISSING)'
      });
      console.log(`[V2_PRIOR_LE_APPS][COMPLETE] Final anchors being returned:`, currentAnchors);
    }
    
    return createV2ProbeResult({
      mode: "NEXT_FIELD",
      pack_id,
      field_key,
      semanticField,
      validationResult: "complete",
      previousProbeCount: previous_probes_count,
      maxProbesPerField,
      semanticInfo,
      anchors: currentAnchors,
      collectedAnchors: currentAnchors,
      targetAnchors: V2_PACK_CONFIGS[pack_id]?.targetAnchors || [],
      message: `Field ${semanticField} validated successfully`
    });
  }

  // Field is incomplete - generate probe question using LLM (with static fallback)
  const sectionContext = {
    sectionName,
    baseQuestionText,
    questionDbId,
    questionCode: questionCode || questionDbId
  };
  
  const probeResult = await generateFieldProbeQuestion(base44Client, {
    fieldName: semanticField,
    currentValue: field_value,
    probeCount: previous_probes_count,
    incidentContext: currentAnchors,
    packId: pack_id,
    maxProbesPerField,
    sectionContext
  });
  
  // If LLM explicitly said no probe needed, advance to next field
  if (!probeResult.question) {
    console.log(`[V2-PER-FIELD] LLM determined no probe needed for ${semanticField} → advancing`);
    
    if (pack_id === "PACK_PRIOR_LE_APPS_STANDARD") {
      console.log(`[V2_PER_FIELD][PRIOR_LE_APPS][LLM_RESULT] LLM determined ${semanticField} is acceptable - advancing`);
      console.log(`[V2_PER_FIELD][PRIOR_LE_APPS][LLM_RESULT] needsMoreDetail=false, probed=false, coverage=complete`);
      console.log(`[V2_PRIOR_LE_APPS][NO_PROBE] Final anchors being returned:`, currentAnchors);
    }
    
    return createV2ProbeResult({
      mode: "NEXT_FIELD",
      pack_id,
      field_key,
      semanticField,
      validationResult: "llm_no_probe",
      previousProbeCount: previous_probes_count,
      maxProbesPerField,
      semanticInfo,
      instanceNumber: instance_number,
      anchors: currentAnchors,
      collectedAnchors: currentAnchors,
      message: `LLM determined field ${semanticField} is acceptable`
    });
  }
  
  console.log(`[V2-PER-FIELD] Field ${semanticField} incomplete → returning QUESTION mode (source: ${probeResult.source})`);
  console.log(`[V2-PER-FIELD] Question: "${probeResult.question.substring(0, 80)}..."`);
  
  // EXPLICIT LOGGING: QUESTION decision for PACK_PRIOR_LE_APPS_STANDARD
  if (pack_id === "PACK_PRIOR_LE_APPS_STANDARD") {
    console.log(`[V2_PER_FIELD][PRIOR_LE_APPS][LLM_RESULT] Field ${semanticField} needs probe - staying on field`);
    console.log(`[V2_PER_FIELD][PRIOR_LE_APPS][LLM_RESULT] needsMoreDetail=true, probed=true, coverage=incomplete`, {
      field_key,
      semanticField,
      decision: "QUESTION",
      probe_source: probeResult.source,
      is_fallback: probeResult.isFallback,
      probe_count: previous_probes_count,
      max_probes: maxProbesPerField,
      question_preview: probeResult.question?.substring?.(0, 80)
    });
  }

  return createV2ProbeResult({
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
    instanceNumber: instance_number,
    anchors: currentAnchors,
    collectedAnchors: currentAnchors,
    message: `Probing for more information about ${semanticField}`,
    followups: [probeResult.question],
    followupsCount: 1
  });
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
        return Response.json(createV2ProbeResult({
          mode: fallback.mode,
          pack_id: packId,
          field_key: fieldKey,
          question: fallback.question,
          isFallback: true,
          anchors: {},
          collectedAnchors: {}
        }), { status: 200 });
      }
      
      return Response.json(createV2ProbeResult({ 
        mode: "NONE",
        pack_id: packId,
        field_key: fieldKey,
        reason: "BACKEND_ERROR",
        details: authError.message || "Authentication failed",
        anchors: {},
        collectedAnchors: {}
      }), { status: 200 });
    }
    
    if (!user) {
      console.error('[V2-PER-FIELD][BACKEND-ERROR]', { fieldKey, packId, error: "User not authenticated" });
      
      const packConfig = PACK_CONFIG[packId];
      const semanticField = packConfig ? mapFieldKey(packConfig, fieldKey) : null;
      const fallback = buildFallbackProbeForField({ packId, fieldKey, semanticField, probeCount });
      if (fallback) {
        console.log('[V2-PER-FIELD] No user → using deterministic fallback probe for field', { packId, fieldKey, probeCount });
        return Response.json(createV2ProbeResult({
          mode: fallback.mode,
          pack_id: packId,
          field_key: fieldKey,
          question: fallback.question,
          isFallback: true,
          anchors: {},
          collectedAnchors: {}
        }), { status: 200 });
      }
      
      return Response.json(createV2ProbeResult({ 
        mode: "NONE",
        pack_id: packId,
        field_key: fieldKey,
        reason: "BACKEND_ERROR",
        details: "User not authenticated",
        anchors: {},
        collectedAnchors: {}
      }), { status: 200 });
    }
    
    let input;
    try {
      input = await req.json();
      packId = input.pack_id;
      fieldKey = input.field_key;
    } catch (parseError) {
      console.error('[V2-PER-FIELD][BACKEND-ERROR]', { fieldKey, packId, error: parseError.message });
      return Response.json(createV2ProbeResult({ 
        mode: "NONE",
        pack_id: packId,
        field_key: fieldKey,
        reason: "BACKEND_ERROR",
        details: parseError.message || "Invalid request body",
        anchors: {},
        collectedAnchors: {}
      }), { status: 200 });
    }
    
    console.log('[PROBE_ENGINE_V2] Request received:', JSON.stringify(input));
    
    let result = await probeEngineV2(input, base44);
    
    // ========================================================================
    // GOLDEN MVP CONTRACT ENFORCEMENT: Attach deterministic anchors
    // This runs for EVERY per-field V2 probe before returning to frontend
    // ========================================================================
    result = attachDeterministicAnchorsForField(input, result);
    result = normalizeV2Result(result);
    
    // CRITICAL: Final log before returning to frontend
    console.log('[V2_ENGINE][RETURN]', {
      packId: result.pack_id || packId,
      fieldKey: result.field_key || fieldKey,
      mode: result.mode,
      anchorKeys: Object.keys(result.collectedAnchors || {}),
      hasAnchors: !!(result.anchors),
      hasCollectedAnchors: !!(result.collectedAnchors)
    });
    
    console.log('[PROBE_ENGINE_V2] Response:', JSON.stringify(result));
    
    // DIAGNOSTIC: Log complete result for PACK_PRIOR_LE_APPS_STANDARD
    if (packId === 'PACK_PRIOR_LE_APPS_STANDARD') {
      console.log('[DIAG_PRIOR_LE_APPS][BACKEND_RESULT] ========== FINAL RESULT FROM BACKEND ==========');
      console.log('[DIAG_PRIOR_LE_APPS][BACKEND_RESULT]', JSON.stringify(result, null, 2));
      console.log('[DIAG_PRIOR_LE_APPS][BACKEND_RESULT] anchors:', result.anchors || '(none)');
      console.log('[DIAG_PRIOR_LE_APPS][BACKEND_RESULT] collectedAnchors:', result.collectedAnchors || '(none)');
      console.log('[DIAG_PRIOR_LE_APPS][BACKEND_RESULT] Has application_outcome?', 
        !!(result.anchors?.application_outcome || result.collectedAnchors?.application_outcome));
    }
    
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
      return Response.json(createV2ProbeResult({
        mode: fallback.mode,
        pack_id: packId,
        field_key: fieldKey,
        question: fallback.question,
        isFallback: true,
        anchors: {},
        collectedAnchors: {}
      }), { status: 200 });
    }
    
    return Response.json(createV2ProbeResult({ 
      mode: "NONE",
      pack_id: packId,
      field_key: fieldKey,
      reason: "BACKEND_ERROR",
      details: error.message || "Unexpected error during probing.",
      anchors: {},
      collectedAnchors: {}
    }), { status: 200 });
  }
});