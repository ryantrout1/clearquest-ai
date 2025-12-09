/**
 * V2 PROBING ARCHITECTURE (CLEARQUEST AI) - FIELD-BASED PROGRESSION
 * 
 * ============================================================================
 * ARCHITECTURE MAP (2025-12-08)
 * ============================================================================
 * 
 * ENTRYPOINTS:
 *   - HTTP Handler: Deno.serve() receives POST with { pack_id, field_key, field_value, ... }
 *   - Main Function: probeEngineV2Core(input, base44Client)
 * 
 * DATA FLOW (Per-Field V2 Probe):
 *   1. Frontend sends field answer → HTTP POST to probeEngineV2
 *   2. Extract params: packId, fieldKey, field_value
 *   3. Validate field value
 *   4. Return: { mode: "NONE" | "NEXT_FIELD" | "REQUEST_CLARIFICATION", hasQuestion, question }
 * 
 * NO ANCHOR EXTRACTION - Field progression based only on:
 *   - requiresMissing
 *   - requiresPresent
 *   - alwaysAsk
 *   - skipUnless
 * 
 * ============================================================================
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

// ============================================================================
// DETERMINISTIC FACT EXTRACTION HELPERS (Phase 4)
// ============================================================================

/**
 * Simple keyword map for application outcomes
 * Used by PACK_PRIOR_LE_APPS_STANDARD for deterministic extraction
 */
const PRIOR_LE_OUTCOME_KEYWORDS = {
  disqualified: [
    'disqualified',
    'dq',
    'failed background',
    'did not pass background',
    'removed from process',
    'screened out',
  ],
  hired: [
    'hired',
    'offered the job',
    'given an offer',
    'received an offer',
    'brought on',
  ],
  withdrew: [
    'withdrew',
    'withdrew my application',
    'pulled my application',
    'removed myself from the process',
    'dropped out of the process',
  ],
  in_process: [
    'still in process',
    'still processing',
    'pending',
    'currently in progress',
    'still being processed',
  ],
};

/**
 * Detect application outcome from text using keyword matching
 * @param {string} text - Raw answer text
 * @returns {string|null} Canonical outcome value or null
 */
function detectApplicationOutcomeFromText(text) {
  if (!text) return null;
  const lower = text.toLowerCase();

  for (const [value, keywords] of Object.entries(PRIOR_LE_OUTCOME_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return value;
    }
  }

  return null;
}

/**
 * Deterministic, pack-aware fact anchor extraction for a single field
 * This is the ONLY place we hard-code pack/field behaviors
 * All other probe logic should stay generic
 * 
 * @param {object} params
 * @param {string} params.packId - Pack identifier
 * @param {string} params.fieldKey - Field key
 * @param {string} params.fieldValue - Raw field value from candidate
 * @returns {object} { anchors: {...}, collectedAnchors: {...} }
 */
function extractFactAnchorsForField({ packId, fieldKey, fieldValue }) {
  const anchors = {};
  if (!fieldValue) return { anchors: {}, collectedAnchors: {} };

  // ---------- PRIOR LE APPS: narrative field ----------
  if (packId === 'PACK_PRIOR_LE_APPS_STANDARD' && fieldKey === 'PACK_PRLE_Q01') {
    // For now, we ONLY extract application_outcome. Later we can add agency, position, approx_date, etc.
    const outcome = detectApplicationOutcomeFromText(fieldValue);
    if (outcome) {
      anchors.application_outcome = outcome;
      console.log('[DETERMINISTIC_EXTRACT][PRIOR_LE_APPS][Q01] application_outcome:', outcome);
    }

    return { anchors, collectedAnchors: anchors };
  }

  // ---------- PRIOR LE APPS: outcome short-answer field ----------
  if (packId === 'PACK_PRIOR_LE_APPS_STANDARD' && fieldKey === 'PACK_PRLE_Q02') {
    // Q02 is already directly asking for the outcome: hired, disqualified, withdrew, still in process.
    const outcome = detectApplicationOutcomeFromText(fieldValue) || fieldValue.trim().toLowerCase();
    if (outcome) {
      // Normalize some obvious raw user variants
      if (outcome === 'dq') anchors.application_outcome = 'disqualified';
      else if (outcome === 'in progress') anchors.application_outcome = 'in_process';
      else anchors.application_outcome = outcome;
      
      console.log('[DETERMINISTIC_EXTRACT][PRIOR_LE_APPS][Q02] application_outcome:', anchors.application_outcome);
    }

    return { anchors, collectedAnchors: anchors };
  }

  // Default: no deterministic anchors for other fields (yet)
  return { anchors: {}, collectedAnchors: {} };
}

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

// ============================================================================
// DETERMINISTIC OUTCOME EXTRACTOR FOR PRIOR LE APPS
// ============================================================================
/**
 * Extract application outcome from narrative text
 * Simple, deterministic, and targeted for gating logic
 */
function extractPriorLeOutcomeFromNarrative(text) {
  if (!text) return "";

  const lower = text.toLowerCase();

  // Highly targeted checks; keep SIMPLE and deterministic.
  if (lower.includes("disqualified")) {
    // capture slightly more context if available
    if (lower.includes("disqualified during")) {
      // e.g., "disqualified during the background investigation"
      const idx = lower.indexOf("disqualified during");
      const snippet = text.slice(idx, idx + 120);
      return snippet.trim();
    }
    return "disqualified";
  }

  if (lower.includes("hired")) {
    return "hired";
  }

  if (lower.includes("withdrew") || lower.includes("withdraw")) {
    return "withdrew";
  }

  if (
    lower.includes("still in process") ||
    lower.includes("still being processed") ||
    lower.includes("still being considered") ||
    lower.includes("pending")
  ) {
    return "still in process";
  }

  return "";
}

// ============================================================================
// PLUGGABLE ANCHOR EXTRACTOR FOR Q01
// ============================================================================
/**
 * Extract anchors from PACK_PRLE_Q01 narrative text
 * Returns: { anchors: {...}, collectedAnchors: {...} }
 */
function extractPriorLeAppsQ01AnchorsFromText(textRaw) {
  const anchors = {};
  const collectedAnchors = {};

  if (!textRaw || !textRaw.trim) {
    return { anchors, collectedAnchors };
  }

  const raw = textRaw.trim();
  const lower = raw.toLowerCase();

  // --- application_outcome (CRITICAL for Q02 gating) ---
  const outcome = extractPriorLeOutcomeFromNarrative(raw);
  if (outcome) {
    anchors.application_outcome = outcome;
    collectedAnchors.application_outcome = [outcome];
  }

  // --- prior_le_agency ---
  let priorLeAgency = null;
  const appliedIdx = lower.indexOf("applied to ");
  if (appliedIdx !== -1) {
    const after = raw.slice(appliedIdx + "applied to ".length);
    const stopTokens = [" for a ", " for the ", ". ", ", then ", ";"];
    let stopIdx = after.length;
    for (const token of stopTokens) {
      const i = after.toLowerCase().indexOf(token);
      if (i !== -1 && i < stopIdx) stopIdx = i;
    }
    priorLeAgency = after.slice(0, stopIdx).trim();
  }

  // --- prior_le_position ---
  let priorLePosition = null;
  const posMatch = raw.match(/position(?: of)? ([^.,;]+)/i);
  if (posMatch && posMatch[1]) {
    priorLePosition = posMatch[1].trim();
  }

  // --- prior_le_approx_date ---
  let priorLeApproxDate = null;
  const dateMatch = raw.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i);
  if (dateMatch) {
    priorLeApproxDate = dateMatch[0].trim();
  }

  function add(key, value) {
    if (!value) return;
    anchors[key] = value;
    collectedAnchors[key] = [value];
  }

  add("prior_le_agency", priorLeAgency);
  add("prior_le_position", priorLePosition);
  add("prior_le_approx_date", priorLeApproxDate);

  return { anchors, collectedAnchors };
}

// ============================================================================
// PLUGGABLE ANCHOR EXTRACTOR REGISTRY
// Maps (packId, fieldKey) → extractor function
// ============================================================================
const ANCHOR_EXTRACTORS = {
  PACK_PRIOR_LE_APPS_STANDARD: {
    PACK_PRLE_Q01: extractPriorLeAppsQ01AnchorsFromText,
  },
  // Future packs can be added here
};

// ============================================================================
// DIAGNOSTIC HELPER: FACT ANCHOR TRACE FOR PACK_PRIOR_LE_APPS_STANDARD
// ============================================================================
const FACT_ANCHOR_KEYS_PRIOR_LE = [
  'prior_le_agency',
  'prior_le_position',
  'prior_le_approx_date',
  'application_outcome',
];

function logPriorLeAnchors(stage, { packId, fieldKey, instanceNumber, anchorsObj }) {
  try {
    if (packId !== 'PACK_PRIOR_LE_APPS_STANDARD') return;

    const keys = FACT_ANCHOR_KEYS_PRIOR_LE;
    console.log(
      `[FACT_ANCHOR_TRACE][${stage}] pack=${packId} field=${fieldKey || 'n/a'} instance=${instanceNumber ?? 'n/a'}`
    );
    console.log(
      `[FACT_ANCHOR_TRACE][${stage}] keys present:`,
      anchorsObj ? Object.keys(anchorsObj) : []
    );
    keys.forEach((k) => {
      const v = anchorsObj && Object.prototype.hasOwnProperty.call(anchorsObj, k)
        ? anchorsObj[k]
        : '(MISSING)';
      console.log(`[FACT_ANCHOR_TRACE][${stage}] ${k}:`, v);
    });
  } catch (err) {
    console.log('[FACT_ANCHOR_TRACE][ERROR]', stage, err?.message || err);
  }
}

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
/**
 * Extract fact anchors for PACK_PRIOR_LE_APPS_STANDARD from narrative text using LLM
 * CANONICAL KEYS: prior_le_agency, prior_le_position, prior_le_approx_date, application_outcome
 * 
 * This helper is called by the centralized extraction registry for PACK_PRLE_Q01
 */
async function extractPriorLeAppsAnchorsLLM({ text, base44Client }) {
  const anchors = {
    prior_le_agency: "unknown",
    prior_le_position: "unknown",
    prior_le_approx_date: "unknown",
    application_outcome: "unknown"
  };
  
  const rulesUsed = [];
  let method = "none";
  
  if (!text || text.trim().length < 10) {
    return { anchors, collectedAnchors: anchors, rulesUsed, method };
  }

  console.log("[EXTRACTOR][PRIOR_LE_APPS][LLM_START]", {
    textLength: text.length,
    textPreview: text.substring(0, 120)
  });

  try {
    const prompt = `You are a FACT EXTRACTION engine for law-enforcement background investigations.

Your ONLY job is to read a candidate's narrative about PRIOR LAW ENFORCEMENT APPLICATIONS and return a STRICT JSON object that fills in the canonical fact anchors for this incident.

OUTPUT FORMAT - Output ONLY valid JSON with these exact keys:
- "status" (string)
- "anchors" (object)
- "collectedAnchors" (object)

STATUS - Use "status": "ok" if you understood the narrative. Use "status": "parse_error" only if something went wrong.

ANCHOR FIELDS - Inside "anchors", ALWAYS include ALL of these keys:

- "prior_le_agency": The name of the prior law-enforcement agency (e.g., "Phoenix Police Department")
- "prior_le_position": The position or role applied for (e.g., "Police Officer")
- "prior_le_approx_date": Approximate date in YYYY-MM format if month known, YYYY if only year, or "unknown"
- "application_outcome": What happened - "hired", "disqualified", "withdrew", "in_process", or brief description

RULES:
- NEVER omit any of these keys
- If information is missing, set value to "unknown" (not null, not empty string)
- For "application_outcome", use one of: "hired", "disqualified", "withdrew", "in_process", or a brief phrase
- For dates, prefer YYYY-MM format when month is mentioned, YYYY when only year known

COLLECTED ANCHORS - Mirror the same values from "anchors" into "collectedAnchors"

Candidate narrative:
${text}`;

    const llmResult = await base44Client.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          status: { type: "string" },
          anchors: {
            type: "object",
            properties: {
              prior_le_agency: { type: "string" },
              prior_le_position: { type: "string" },
              prior_le_approx_date: { type: "string" },
              application_outcome: { type: "string" }
            },
            required: ["prior_le_agency", "prior_le_position", "prior_le_approx_date", "application_outcome"]
          },
          collectedAnchors: {
            type: "object",
            properties: {
              prior_le_agency: { type: "string" },
              prior_le_position: { type: "string" },
              prior_le_approx_date: { type: "string" },
              application_outcome: { type: "string" }
            },
            required: ["prior_le_agency", "prior_le_position", "prior_le_approx_date", "application_outcome"]
          }
        },
        required: ["status", "anchors", "collectedAnchors"]
      }
    });

    console.log("[EXTRACTOR][PRIOR_LE_APPS][LLM_RAW]", {
      status: llmResult?.status,
      anchors: llmResult?.anchors,
      collectedAnchors: llmResult?.collectedAnchors
    });

    // Validate and use LLM result
    if (llmResult?.status === "ok" && llmResult?.anchors) {
      const llmAnchors = llmResult.anchors;
      method = "llm";
      rulesUsed.push("llm_strict_schema");
      
      // Replace "unknown" with null for cleaner output, but keep non-unknown values
      if (llmAnchors.prior_le_agency && llmAnchors.prior_le_agency !== "unknown") {
        anchors.prior_le_agency = llmAnchors.prior_le_agency;
      } else {
        delete anchors.prior_le_agency;
      }
      
      if (llmAnchors.prior_le_position && llmAnchors.prior_le_position !== "unknown") {
        anchors.prior_le_position = llmAnchors.prior_le_position;
      } else {
        delete anchors.prior_le_position;
      }
      
      if (llmAnchors.prior_le_approx_date && llmAnchors.prior_le_approx_date !== "unknown") {
        anchors.prior_le_approx_date = llmAnchors.prior_le_approx_date;
      } else {
        delete anchors.prior_le_approx_date;
      }
      
      if (llmAnchors.application_outcome && llmAnchors.application_outcome !== "unknown") {
        anchors.application_outcome = llmAnchors.application_outcome;
      } else {
        delete anchors.application_outcome;
      }
    }

  } catch (llmErr) {
    console.warn("[EXTRACTOR][PRIOR_LE_APPS][LLM_ERROR]", llmErr.message);
    method = "fallback";
    rulesUsed.push("llm_error_fallback");
    // Fall back to regex extraction
  }

  // Fallback regex extraction if LLM failed
  if (Object.keys(anchors).length === 0 || method === "fallback") {
    if (method !== "fallback") {
      method = "deterministic";
    }
    rulesUsed.push("regex_patterns");
    
    const clean = text.trim();
    const lower = clean.toLowerCase();

    // 1) application_outcome
    if (lower.includes("disqual") || lower.includes("dq'd") || lower.includes("failed background")) {
      anchors.application_outcome = "disqualified";
    } else if (lower.includes("hired") || lower.includes("offered the job")) {
      anchors.application_outcome = "hired";
    } else if (lower.includes("withdrew") || lower.includes("pulled my application")) {
      anchors.application_outcome = "withdrew";
    } else if (lower.includes("still in process") || lower.includes("pending")) {
      anchors.application_outcome = "in_process";
    }

    // 2) prior_le_agency
    const appliedMatch = clean.match(/applied to(?: the)? ([^,.;]+(?:Police|PD|Sheriff|Department|Agency))/i);
    if (appliedMatch?.[1]) {
      anchors.prior_le_agency = appliedMatch[1].trim();
    }

    // 3) prior_le_position
    const positionMatch = clean.match(/(?:for a|for the|as a) ([^,.;]+(?:officer|deputy|trooper|agent|detective))/i);
    if (positionMatch?.[1]) {
      anchors.prior_le_position = positionMatch[1].trim();
    }

    // 4) prior_le_approx_date
    const monthYearMatch = clean.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i);
    if (monthYearMatch) {
      anchors.prior_le_approx_date = monthYearMatch[0].trim();
    }
  }

  // If we used both LLM and regex, mark as hybrid
  if (rulesUsed.includes("llm_strict_schema") && rulesUsed.includes("regex_patterns")) {
    method = "hybrid";
  }
  
  console.log("[EXTRACTOR][PRIOR_LE_APPS][FINAL]", {
    extractedKeys: Object.keys(anchors),
    anchors,
    method,
    rulesUsed
  });
  
  return {
    anchors,
    collectedAnchors: anchors,
    rulesUsed,
    method
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
 * Get full narrative text from request payload
 * Checks all possible field value properties in priority order
 */
function getFieldNarrativeText(raw) {
  if (!raw) return "";
  
  // Prefer explicit full value if present
  if (raw.fullFieldValue && typeof raw.fullFieldValue === "string") {
    return raw.fullFieldValue;
  }
  if (raw.field_value && typeof raw.field_value === "string") {
    return raw.field_value;
  }
  if (raw.fieldValue && typeof raw.fieldValue === "string") {
    return raw.fieldValue;
  }
  if (raw.fullNarrative && typeof raw.fullNarrative === "string") {
    return raw.fullNarrative;
  }
  if (raw.fullAnswer && typeof raw.fullAnswer === "string") {
    return raw.fullAnswer;
  }
  if (raw.answer && typeof raw.answer === "string") {
    return raw.answer;
  }
  if (raw.narrative && typeof raw.narrative === "string") {
    return raw.narrative;
  }

  // Absolute fallback: preview
  if (raw.fieldValuePreview && typeof raw.fieldValuePreview === "string") {
    return raw.fieldValuePreview;
  }
  if (raw.answerPreview && typeof raw.answerPreview === "string") {
    return raw.answerPreview;
  }

  return "";
}

const PRIOR_LE_DEBUG = "[PRIOR_LE_Q01_ANCHORS]";
const V2_DEBUG_ENABLED = true; // Set to false to reduce console noise

// ============================================================================
// DETERMINISTIC EXTRACTOR FOR PACK_PRIOR_LE_APPS_STANDARD / PACK_PRLE_Q01
// ============================================================================

/**
 * Deterministic extractor for PACK_PRIOR_LE_APPS_STANDARD / PACK_PRLE_Q01
 * Reads narrative and infers application outcome
 */
function extractPriorLeAppsOutcomeAnchors(fieldTextRaw) {
  const text = (fieldTextRaw || "").toLowerCase();

  const anchors = {};
  const collectedAnchors = {};

  // Outcome: disqualified
  if (text.includes("disqualif")) {
    anchors.application_outcome = "disqualified";
  }
  // Outcome: withdrew / withdrawn
  else if (text.includes("withdrew") || text.includes("withdrawn") || text.includes("withdraw")) {
    anchors.application_outcome = "withdrew";
  }
  // Outcome: hired / selected / offered the job
  else if (
    text.includes("hired") ||
    text.includes("offered the job") ||
    text.includes("offered the position") ||
    text.includes("offered me the job") ||
    text.includes("offered me the position") ||
    text.includes("selected for the position")
  ) {
    anchors.application_outcome = "hired";
  }
  // Outcome: still in process / pending
  else if (
    text.includes("still in process") ||
    text.includes("still in progress") ||
    text.includes("still being processed") ||
    text.includes("pending") ||
    text.includes("under review")
  ) {
    anchors.application_outcome = "in_process";
  }

  if (anchors.application_outcome) {
    collectedAnchors.application_outcome = anchors.application_outcome;
  }

  return { anchors, collectedAnchors };
}

/**
 * Infer application outcome from narrative text for PACK_PRIOR_LE_APPS_STANDARD
 * Deterministic, keyword-based extraction
 * @param {string} narrativeRaw - Raw narrative text
 * @returns {string|null} - "disqualified" | "hired" | "withdrew" | "not_selected" | "in_process" | null
 */
function inferApplicationOutcomeFromNarrative(narrativeRaw) {
  if (!narrativeRaw || typeof narrativeRaw !== "string") {
    return null;
  }

  const text = narrativeRaw.toLowerCase();

  // Normalize a few variants
  const normalized = text
    .replace(/\bwithdrew\b/g, " withdrew ")
    .replace(/\bwithdrawn\b/g, " withdrew ")
    .replace(/\bwithdraw\b/g, " withdrew ")
    .replace(/\bdenied\b/g, " denied ")
    .replace(/\bno longer under consideration\b/g, " disqualified ")
    .replace(/\bnot selected\b/g, " not_selected ");

  // Disqualified / DQ
  if (
    normalized.includes("disqualified") ||
    normalized.includes("dq'ed") ||
    normalized.includes("dq'd") ||
    normalized.includes("dq ") ||
    normalized.includes("dq'd")
  ) {
    return "disqualified";
  }

  // Hired / selected
  if (
    normalized.includes("hired") ||
    normalized.includes("offered the job") ||
    normalized.includes("offered a job") ||
    normalized.includes("given an offer") ||
    normalized.includes("selected for the position")
  ) {
    return "hired";
  }

  // Withdrew
  if (
    normalized.includes("withdrew") ||
    normalized.includes("withdrew my application") ||
    normalized.includes("i withdrew") ||
    normalized.includes("i withdrew my")
  ) {
    return "withdrew";
  }

  // Not selected (but not explicitly "disqualified")
  if (
    normalized.includes("not selected") ||
    normalized.includes("wasn't selected") ||
    normalized.includes("was not selected")
  ) {
    return "not_selected";
  }

  // Still in process
  if (
    normalized.includes("still in process") ||
    normalized.includes("still being processed") ||
    normalized.includes("still going through") ||
    normalized.includes("background is in process")
  ) {
    return "in_process";
  }

  // Fallback: look for generic "denied" language
  if (
    normalized.includes("denied") ||
    normalized.includes("rejected") ||
    normalized.includes("turned down")
  ) {
    return "disqualified";
  }

  return null;
}

/**
 * Apply PRIOR_LE_APPS Q01 outcome anchors to probe result
 * Surgical helper that only affects PACK_PRIOR_LE_APPS_STANDARD / PACK_PRLE_Q01
 */
function applyPriorLeQ01OutcomeAnchors(rawInput, baseResult) {
  // Safely get the narrative text from whatever field is actually used
  const text =
    rawInput?.fieldValue ||
    rawInput?.field_value ||
    rawInput?.answer ||
    rawInput?.narrative ||
    rawInput?.narrativeText ||
    "";

  const outcome = inferApplicationOutcomeFromNarrative(text);

  console.log(PRIOR_LE_DEBUG, "rawInputForQ01", {
    keys: rawInput ? Object.keys(rawInput) : [],
    fieldValuePreview: (rawInput?.fieldValue || "").slice(0, 200),
    field_valuePreview: (rawInput?.field_value || "").slice(0, 200),
    answerPreview: (rawInput?.answer || "").slice(0, 200),
    narrativePreview: (rawInput?.narrative || "").slice(0, 200),
    narrativeTextPreview: (rawInput?.narrativeText || "").slice(0, 200),
    inferredOutcome: outcome,
  });

  let anchors = baseResult?.anchors || {};
  let collectedAnchors = baseResult?.collectedAnchors || {};

  if (outcome) {
    anchors = {
      ...anchors,
      application_outcome: outcome,
    };
    collectedAnchors = {
      ...collectedAnchors,
      application_outcome: outcome,
    };
  }

  console.log(PRIOR_LE_DEBUG, "anchorsBeforeReturn", {
    outcome,
    anchorsKeys: Object.keys(anchors || {}),
    anchors,
    collectedAnchorsKeys: Object.keys(collectedAnchors || {}),
    collectedAnchors,
  });

  return {
    ...baseResult,
    anchors,
    collectedAnchors,
  };
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
  "PACK_PRLE_Q01": "In your own words, tell the complete story of this prior law enforcement application. Include the name of the agency, the position you applied for, roughly when you applied, what happened with that application, and why (if you know). Please provide as much detail as you can.\n\nExample: I applied to Phoenix Police Department for a police officer position around March 2022. I made it through the written test and interview but was disqualified during the background investigation because of a previous traffic violation.",
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
 * Get fallback question from pack config field definition
 * Priority: pack field fallbackQuestion > FALLBACK_PROBES > static question generator
 */
async function getPackFallbackQuestion(base44Client, packId, fieldKey, probeCount = 0) {
  try {
    // Fetch pack entity from database to get field_config with fallbackQuestion
    const packs = await base44Client.entities.FollowUpPack.filter({
      followup_pack_id: packId,
      active: true
    });
    
    if (packs && packs.length > 0) {
      const packEntity = packs[0];
      const fieldConfig = packEntity.field_config?.find(f => f.fieldKey === fieldKey);
      
      if (fieldConfig?.fallbackQuestion) {
        console.log(`[V2_FALLBACK] Using fallbackQuestion from pack config for ${packId}/${fieldKey}`);
        return fieldConfig.fallbackQuestion;
      }
    }
  } catch (err) {
    console.warn(`[V2_FALLBACK] Error fetching pack config:`, err.message);
  }
  
  // Fall back to FALLBACK_PROBES and multi-level probes
  return getFallbackProbeForField(fieldKey, probeCount);
}

/**
 * Build a deterministic fallback probe for specific fields when AI/validation fails.
 * This ensures probing is rock-solid even when the backend has issues.
 * Supports PACK_LE_APPS, PACK_INTEGRITY_APPS, PACK_LE_MISCONDUCT_STANDARD, and driving packs.
 * 
 * Now uses multi-level probing for fields that have it configured.
 * NEW: Checks pack config for fallbackQuestion first
 */
async function buildFallbackProbeForField({ packId, fieldKey, semanticField, probeCount = 0, base44Client = null }) {
  // Priority 1: Check pack config for fallbackQuestion
  if (base44Client) {
    const packFallback = await getPackFallbackQuestion(base44Client, packId, fieldKey, probeCount);
    if (packFallback) {
      console.log(`[V2_FALLBACK] Using pack config fallbackQuestion for ${packId}/${fieldKey}: "${packFallback.substring(0, 60)}..."`);
      return {
        mode: "QUESTION",
        question: packFallback,
        isFallback: true,
        probeSource: 'fallback_pack_config'
      };
    }
  }
  
  // Priority 2: Check FALLBACK_PROBES and multi-level probes
  const fallbackQuestion = getFallbackProbeForField(fieldKey, probeCount);
  if (fallbackQuestion) {
    return {
      mode: "QUESTION",
      question: fallbackQuestion,
      isFallback: true,
      probeSource: MULTI_LEVEL_PROBES[fieldKey] ? 'fallback_multi_level' : 'fallback_static'
    };
  }
  
  // Priority 3: Try using semantic field name for fallback (for any supported pack)
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
    // CANONICAL KEYS for PRIOR LE APPS
    requiredAnchors: [
      "prior_le_agency",
      "prior_le_position",
      "prior_le_approx_date",
      "application_outcome"
    ],
    // Optional anchors that can be extracted but aren't required
    targetAnchors: [
      "prior_le_agency",
      "prior_le_position", 
      "prior_le_approx_date",
      "application_outcome",
      "application_city",
      "application_state"
    ],
    // Field gating config - which fields require which anchors to be missing
    // CANONICAL KEYS for PRIOR LE APPS
    fieldGating: {
      "PACK_PRLE_Q01": { 
        captures: ["prior_le_agency", "prior_le_position", "prior_le_approx_date", "application_outcome", "application_city", "application_state"], 
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
        captures: ["prior_le_approx_date"], 
        requiresMissing: ["prior_le_approx_date"], 
        alwaysAsk: false 
      },
      "PACK_PRLE_Q05": { 
        captures: ["prior_le_position"], 
        requiresMissing: ["prior_le_position"], 
        alwaysAsk: false 
      },
      "PACK_PRLE_Q06": { 
        captures: ["prior_le_agency"], 
        requiresMissing: ["prior_le_agency"], 
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
  // Q01 performs deterministic extraction, Q02 builds application_outcome anchor
  // Gating for Q02+ is driven by anchors extracted from that narrative.
  PACK_PRIOR_LE_APPS_STANDARD: {
    id: "PACK_PRIOR_LE_APPS_STANDARD",
    packName: "Prior Law Enforcement Applications",
    standardClusterId: "PRIOR_LE_APPS",
    isStandardCluster: true,
    active: true,
    usesAnchors: true,
    perFieldHandler: handlePriorLeAppsPerFieldV2, // Per-field handler with deterministic extraction
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
      month_year: "prior_le_approx_date",
      agency_name: "prior_le_agency",
      position: "prior_le_position"
    },
    // Micro clarifier templates for missing anchors (CANONICAL KEYS)
    anchorClarifiers: {
      prior_le_agency: "What was the name of the law enforcement agency for this application?",
      prior_le_position: "What position did you apply for with that agency?",
      prior_le_approx_date: "About what month and year did you apply?",
      application_outcome: "What was the outcome of that application? (For example: hired, disqualified, withdrew, still in process.)"
    },
    // All possible anchors - extracted from narrative (CANONICAL KEYS)
    targetAnchors: [
      "prior_le_agency",
      "prior_le_position",
      "prior_le_approx_date",
      "application_outcome",
      "application_city",
      "application_state",
      "reason_not_hired",
      "appeal_or_reapply",
      "anything_else"
    ],
    requiredFields: ["prior_le_agency", "prior_le_approx_date", "prior_le_position", "application_outcome"],
    // Priority order for gap-filling after narrative (CANONICAL KEYS)
    priorityOrder: ["application_outcome", "prior_le_agency", "prior_le_position", "prior_le_approx_date", "application_city", "application_state", "reason_not_hired", "appeal_or_reapply", "anything_else"],
    fieldKeyMap: {
      // Question code → semantic role mappings (CANONICAL KEYS)
      "PACK_PRLE_Q01": "narrative", // NARRATIVE OPENER - extracts all anchors
      "PACK_PRLE_Q02": "application_outcome",
      "PACK_PRLE_Q03": "application_location", // Captures city + state
      "PACK_PRLE_Q04": "prior_le_approx_date",
      "PACK_PRLE_Q05": "prior_le_position",
      "PACK_PRLE_Q06": "prior_le_agency",
      "PACK_PRLE_Q07": "reason_not_hired",
      "PACK_PRLE_Q08": "appeal_or_reapply",
      "PACK_PRLE_Q09": "anything_else",
      // Semantic field self-mappings (CANONICAL KEYS)
      "prior_le_agency": "prior_le_agency",
      "prior_le_position": "prior_le_position",
      "prior_le_approx_date": "prior_le_approx_date",
      "application_outcome": "application_outcome",
      "application_city": "application_city",
      "application_state": "application_state",
      "application_location": "application_location",
      "reason_not_hired": "reason_not_hired",
      "appeal_or_reapply": "appeal_or_reapply",
      "anything_else": "anything_else",
    },
    // Field gating config - NARRATIVE-FIRST approach (CANONICAL KEYS)
    // Q01 is narrative opener that captures everything; Q02-Q09 only ask if anchors missing
    fieldGating: {
      "PACK_PRLE_Q01": { 
        captures: ["prior_le_agency", "prior_le_position", "prior_le_approx_date", "application_outcome", "application_city", "application_state"], 
        alwaysAsk: true, 
        isOpener: true,
        isNarrativeOpener: true, // Special flag for narrative extraction
        isPrimaryNarrativeField: true // Must capture ALL required anchors before advancing
      },
      "PACK_PRLE_Q02": { captures: ["application_outcome"], requiresMissing: ["application_outcome"], alwaysAsk: false },
      "PACK_PRLE_Q03": { captures: ["application_city", "application_state"], requiresMissing: ["application_city", "application_state"], alwaysAsk: false },
      "PACK_PRLE_Q04": { captures: ["prior_le_approx_date"], requiresMissing: ["prior_le_approx_date"], alwaysAsk: false },
      "PACK_PRLE_Q05": { captures: ["prior_le_position"], requiresMissing: ["prior_le_position"], alwaysAsk: false },
      "PACK_PRLE_Q06": { captures: ["prior_le_agency"], requiresMissing: ["prior_le_agency"], alwaysAsk: false },
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
 * Minimal extractor for PACK_PRIOR_LE_APPS_STANDARD / PACK_PRLE_Q01
 * Safe fallback that never throws
 */
function extractPriorLeAppsAnchors(params) {
  const text = params?.text || '';
  const existingAnchors = params?.existingAnchors || {};
  
  // Return safe defaults - real extraction happens in extractPriorLeAppsAnchorsLLM
  return {
    anchors: existingAnchors,
    collectedAnchors: existingAnchors
  };
}

/**
 * Legacy registry - kept for backward compatibility with other code paths
 * NOTE: New code should use ANCHOR_EXTRACTORS instead
 */
const FIELD_ANCHOR_EXTRACTORS = {
  PACK_PRIOR_LE_APPS_STANDARD: {
    PACK_PRLE_Q01: extractPriorLeAppsAnchors,
  }
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
 * Auto-skip helper for fields with high-confidence extracted values
 * 
 * Checks if a field should be automatically filled and skipped based on:
 * - Field config flags (autoSkipIfConfident, autoSkipMinConfidence)
 * - Extraction quality (confidence, enum validation)
 * - Pack progress state
 * 
 * @param {object} fieldConfig - Field configuration from pack
 * @param {object} extraction - Extracted value with confidence { value, confidence }
 * @param {object} packState - Current pack state (for persistence)
 * @param {object} base44Client - Base44 SDK client for persistence
 * @returns {Promise<{shouldSkip: boolean, autoAnswerValue?: string}>}
 */
async function maybeAutoSkipField(fieldConfig, extraction, packState, base44Client) {
  try {
    // Check if auto-skip is enabled for this field
    if (!fieldConfig?.autoSkipIfConfident) {
      return { shouldSkip: false };
    }
    
    // Determine confidence threshold (default 0.85)
    const threshold = fieldConfig.autoSkipMinConfidence ?? 0.85;
    
    // Validate extraction exists and has value
    if (!extraction || !extraction.value || extraction.value.trim() === "") {
      return { shouldSkip: false };
    }
    
    // Validate enum values if defined
    if (fieldConfig.allowedEnumValues && Array.isArray(fieldConfig.allowedEnumValues)) {
      const normalizedValue = extraction.value.toLowerCase().trim();
      const normalizedEnum = fieldConfig.allowedEnumValues.map(v => v.toLowerCase().trim());
      
      if (!normalizedEnum.includes(normalizedValue)) {
        console.log(`[AUTO_SKIP] Value "${extraction.value}" not in allowedEnumValues - cannot skip`);
        return { shouldSkip: false };
      }
    }
    
    // Check confidence threshold
    if (extraction.confidence && extraction.confidence < threshold) {
      console.log(`[AUTO_SKIP] Confidence ${extraction.confidence} < ${threshold} - cannot skip`);
      return { shouldSkip: false };
    }
    
    // All conditions met - field can be auto-skipped
    console.log(`[AUTO_SKIP] Field ${fieldConfig.fieldKey} can be auto-filled with "${extraction.value}" (confidence: ${extraction.confidence || 'N/A'})`);
    
    // Persist the auto-answer if we have session context
    if (packState?.sessionId && packState?.packId && base44Client) {
      try {
        // Create Response record for this auto-answered field
        await base44Client.asServiceRole.entities.Response.create({
          session_id: packState.sessionId,
          pack_id: packState.packId,
          field_key: fieldConfig.fieldKey,
          instance_number: packState.instanceNumber || 1,
          question_id: packState.baseQuestionId || null,
          question_text: fieldConfig.label || fieldConfig.fieldKey,
          answer: extraction.value,
          response_type: 'v2_pack_field',
          response_timestamp: new Date().toISOString(),
          additional_details: {
            auto_filled: true,
            auto_fill_source: 'narrative_extraction',
            confidence: extraction.confidence,
            extraction_method: extraction.method || 'llm'
          }
        });
        
        console.log(`[AUTO_SKIP] Persisted auto-answer for ${fieldConfig.fieldKey}: "${extraction.value}"`);
      } catch (persistErr) {
        console.error(`[AUTO_SKIP] Failed to persist auto-answer:`, persistErr.message);
        // Don't fail the entire skip - just log the error
      }
    }
    
    return {
      shouldSkip: true,
      autoAnswerValue: extraction.value
    };
    
  } catch (error) {
    console.error(`[AUTO_SKIP] Error in maybeAutoSkipField:`, error.message);
    // On any error, fall back to normal flow
    return { shouldSkip: false };
  }
}

/**
 * Normalize v2Result to ensure anchors/collectedAnchors always exist
 * SAFETY NET: Called at end of probeEngineV2 to catch any bypassed paths
 */
function normalizeV2Result(result) {
  console.log("[normalizeV2Result][ENTRY]", {
    resultType: typeof result,
    resultKeys: Object.keys(result || {}),
    resultAnchors: result?.anchors,
    resultCollected: result?.collectedAnchors,
    applicationOutcome: result?.anchors?.application_outcome || '(NONE)'
  });

  if (!result || typeof result !== 'object') {
    console.log("[normalizeV2Result][ERROR] Invalid input, returning error result");
    return createV2ProbeResult({
      mode: 'ERROR',
      hasQuestion: false,
      reason: "Invalid probe result object",
      anchors: {},
      collectedAnchors: {}
    });
  }
  
  // Route through createV2ProbeResult to guarantee shape
  const normalized = createV2ProbeResult({
    ...result,
    anchors: result.anchors || {},
    collectedAnchors: result.collectedAnchors || {}
  });
  
  console.log("[normalizeV2Result][RETURN]", {
    normalizedKeys: Object.keys(normalized || {}),
    normalizedAnchors: normalized?.anchors,
    normalizedAnchorsKeys: Object.keys(normalized?.anchors || {}),
    applicationOutcome: normalized?.anchors?.application_outcome || '(NONE)'
  });
  
  return normalized;
}

/**
 * Safety net normalizer - guarantees anchors/collectedAnchors exist on every response
 * Must be called at the HTTP boundary before returning to frontend
 */
function withAnchorDefaults(result) {
  if (!result || typeof result !== "object") {
    return {
      mode: "ERROR",
      hasQuestion: false,
      anchors: {},
      collectedAnchors: {},
      reason: "Invalid probe result object",
    };
  }

  if (!result.anchors) {
    result.anchors = {};
  }
  if (!result.collectedAnchors) {
    result.collectedAnchors = {};
  }

  return result;
}

/**
 * V2 Result Normalizer - Thin wrapper ensuring all responses have anchors/collectedAnchors
 * BACKWARDS-COMPATIBLE: Does NOT change functional behavior, only normalizes shape
 * 
 * @param {object} rawResult - Result from probeEngineV2Core
 * @param {object} extra - Optional additional fields to overlay
 * @returns {object} Normalized result with guaranteed anchors/collectedAnchors
 */
function normalizeV2ProbeResult(rawResult, extra = {}) {
  const base = rawResult || {};

  console.log("[normalizeV2ProbeResult][ENTRY]", {
    baseKeys: Object.keys(base),
    baseAnchors: base.anchors,
    baseCollected: base.collectedAnchors,
    baseAnchorsType: typeof base.anchors,
    extraKeys: Object.keys(extra)
  });

  const anchors = base.anchors && typeof base.anchors === "object" && !Array.isArray(base.anchors)
    ? base.anchors
    : {};

  const collectedAnchors = base.collectedAnchors && typeof base.collectedAnchors === "object" && !Array.isArray(base.collectedAnchors)
    ? base.collectedAnchors
    : {};

  console.log("[normalizeV2ProbeResult][NORMALIZED]", {
    anchorsKeys: Object.keys(anchors),
    collectedKeys: Object.keys(collectedAnchors),
    applicationOutcome: anchors.application_outcome || '(NONE)'
  });

  const result = {
    // keep any existing fields exactly as they are
    ...base,
    // normalized anchors - MUST come after base spread to ensure they're included
    anchors,
    collectedAnchors,
    // allow callers to overlay any explicit extras
    ...extra,
  };

  console.log("[normalizeV2ProbeResult][RETURN]", {
    resultKeys: Object.keys(result),
    resultAnchorsKeys: Object.keys(result.anchors || {}),
    resultAnchors: result.anchors,
    applicationOutcome: result.anchors?.application_outcome || '(NONE)'
  });

  return result;
}

/**
 * Attach deterministic anchors to v2Result before returning to frontend
 * GOLDEN MVP CONTRACT: Every per-field return MUST include anchors/collectedAnchors
 */
function attachDeterministicAnchorsForField(input, v2Result) {
  const packId = input?.pack_id || input?.packId;
  const fieldKey = input?.field_key || input?.fieldKey;

  const answerText =
    input?.field_value ||
    input?.fieldValue ||
    input?.answerText ||
    input?.narrative ||
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
 * Infer application outcome from PACK_PRLE_Q01 narrative
 * Returns: "hired" | "disqualified" | "withdrew" | "still_in_process" | null
 * @param {string} narrative - Candidate's narrative about prior LE application
 * @returns {string|null}
 */
function inferPriorLeApplicationOutcome(narrative) {
  if (!narrative) return null;

  const text = narrative.toLowerCase().replace(/\s+/g, " ");

  // Disqualified / failed background
  if (
    text.includes("disqualified") ||
    text.includes("removed from the process") ||
    text.includes("failed the background") ||
    text.includes("did not pass the background") ||
    text.includes("didn't pass the background") ||
    text.includes("failed background") ||
    text.includes("did not pass polygraph") ||
    text.includes("didn't pass polygraph")
  ) {
    return "disqualified";
  }

  // Withdrew
  if (
    text.includes("withdrew my application") ||
    text.includes("withdrew from the process") ||
    text.includes("pulled my application") ||
    text.includes("chose not to continue") ||
    text.includes("decided not to continue") ||
    text.includes("voluntarily withdrew")
  ) {
    return "withdrew";
  }

  // Still in process / pending
  if (
    text.includes("still in process") ||
    text.includes("still in the process") ||
    text.includes("still being processed") ||
    text.includes("awaiting a decision") ||
    text.includes("waiting for a decision") ||
    text.includes("pending background") ||
    text.includes("background is pending")
  ) {
    return "still_in_process";
  }

  // Hired / offer
  if (
    text.includes("was hired") ||
    text.includes("got hired") ||
    text.includes("offered the job") ||
    text.includes("offered a position") ||
    text.includes("received an offer") ||
    text.includes("received a job offer") ||
    text.includes("given a conditional offer") ||
    text.includes("started working") ||
    text.includes("began working") ||
    text.includes("joined the department")
  ) {
    return "hired";
  }

  return null;
}

/**
 * Legacy function name - kept for backward compatibility
 * @deprecated Use inferPriorLeApplicationOutcome instead
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
 * V2 Per-Field Handler for PACK_PRIOR_LE_APPS_STANDARD
 * Deterministically extracts application_outcome from Q01 narrative for gating
 */
async function handlePriorLeAppsPerFieldV2(params) {
  // Defensive normalization - ensure params is always an object
  const ctx = params && typeof params === 'object' ? params : {};
  
  const { packId, fieldKey, fieldValue, probeCount, base44Client, instanceNumber, questionCode, sessionId } = ctx;

  console.log("[PRIOR_LE_APPS_HANDLER][ENTRY]", {
    packId,
    fieldKey,
    instanceNumber,
    probeCount,
    fieldValueLength: fieldValue?.length || 0,
    fieldValuePreview: fieldValue?.substring?.(0, 80)
  });
  

  
  // Q01 narrative field - extract anchors and advance
  if (fieldKey === "PACK_PRLE_Q01" && fieldValue && fieldValue.trim()) {
    console.log("[PRIOR_LE_APPS_HANDLER][Q01_NARRATIVE] Extracting anchors from narrative");
    
    // Extract anchors using existing extractor
    const extractResult = await extractPriorLeAppsAnchorsLLM({ text: fieldValue, base44Client });
    const anchors = extractResult.anchors || {};
    
    console.log("[PRIOR_LE_APPS_HANDLER][Q01_EXTRACTED]", {
      anchorsKeys: Object.keys(anchors),
      application_outcome: anchors.application_outcome || '(none)',
      prior_le_agency: anchors.prior_le_agency || '(none)',
      prior_le_position: anchors.prior_le_position || '(none)',
      prior_le_approx_date: anchors.prior_le_approx_date || '(none)'
    });
    
    return createV2ProbeResult({
      mode: "NEXT_FIELD",
      hasQuestion: false,
      followupsCount: 0,
      reason: "Q01 narrative validated - anchors extracted",
      anchors,
      collectedAnchors: anchors
    });
  }
  
  // Q02-Q09: Check if answer needs clarification
  if (fieldValue && fieldValue.trim()) {
    const isNoRecall = answerLooksLikeNoRecall(fieldValue);
    
    // If answer is "I don't recall" and probeCount < maxProbes, ask clarification
    if (isNoRecall && probeCount === 0) {
      console.log("[PRIOR_LE_APPS_HANDLER][CLARIFIER_NEEDED]", { fieldKey, answer: fieldValue });
      
      // Generate targeted clarification based on field
      let clarifierQuestion = null;
      switch (fieldKey) {
        case "PACK_PRLE_Q05": // position/job title
          clarifierQuestion = "Do you remember if the position was for a police officer or a different role within the police department?";
          break;
        case "PACK_PRLE_Q06": // agency name
          clarifierQuestion = "Can you recall any part of the agency name, or the city and state where it was located?";
          break;
        case "PACK_PRLE_Q04": // month/year
          clarifierQuestion = "Can you estimate even the year you applied, or what was happening in your life at that time?";
          break;
        default:
          // For other fields, accept "I don't recall"
          return createV2ProbeResult({
            mode: "NEXT_FIELD",
            hasQuestion: false,
            followupsCount: 0,
            reason: `${fieldKey} accepted (no recall)`
          });
      }
      
      if (clarifierQuestion) {
        console.log("[PRIOR_LE_APPS_HANDLER][RETURN_CLARIFIER]", {
          fieldKey,
          question: clarifierQuestion.substring(0, 60)
        });
        
        return createV2ProbeResult({
          mode: "QUESTION",
          hasQuestion: true,
          followupsCount: 1,
          question: clarifierQuestion,
          reason: `Clarifying ${fieldKey}`
        });
      }
    }
    
    // If we received a clarifier answer (probeCount > 0), accept it and advance
    if (probeCount > 0) {
      console.log("[PRIOR_LE_APPS_HANDLER][CLARIFIER_ANSWERED]", {
        fieldKey,
        answer: fieldValue.substring(0, 60)
      });
      
      // Extract semantic value from clarifier answer
      let extractedValue = null;
      switch (fieldKey) {
        case "PACK_PRLE_Q05": // position
          extractedValue = fieldValue.trim();
          return createV2ProbeResult({
            mode: "NEXT_FIELD",
            hasQuestion: false,
            followupsCount: 0,
            reason: `${fieldKey} clarified`,
            anchors: { prior_le_position: extractedValue },
            collectedAnchors: { prior_le_position: extractedValue }
          });
        case "PACK_PRLE_Q06": // agency
          extractedValue = fieldValue.trim();
          return createV2ProbeResult({
            mode: "NEXT_FIELD",
            hasQuestion: false,
            followupsCount: 0,
            reason: `${fieldKey} clarified`,
            anchors: { prior_le_agency: extractedValue },
            collectedAnchors: { prior_le_agency: extractedValue }
          });
        case "PACK_PRLE_Q04": // date
          extractedValue = fieldValue.trim();
          return createV2ProbeResult({
            mode: "NEXT_FIELD",
            hasQuestion: false,
            followupsCount: 0,
            reason: `${fieldKey} clarified`,
            anchors: { prior_le_approx_date: extractedValue },
            collectedAnchors: { prior_le_approx_date: extractedValue }
          });
      }
    }
  }
  
  // Default: accept answer and advance
  const baseResult = {
    packId,
    fieldKey,
    mode: "NEXT_FIELD",
    hasQuestion: false,
    followupsCount: 0,
    reason: `${fieldKey} validated`
  };

  return createV2ProbeResult(baseResult);
}

/**
 * Dedicated handler for PACK_PRIOR_LE_APPS_STANDARD → PACK_PRLE_Q01
 * Uses LLM with strict JSON schema to extract anchors from narrative
 * CRITICAL: Must be called FIRST for this pack/field combination
 * @deprecated - Replaced by handlePriorLeAppsPerFieldV2 for proof-of-life testing
 */
async function handlePriorLeAppsQ01(params) {
  // Defensive normalization - ensure params is always an object
  const safeParams = params && typeof params === 'object' ? params : {};
  
  const {
    pack_id,
    field_key,
    field_value,
    incident_context = {},
    extractedAnchors = {},
    previous_probes_count = 0,
    instance_number = 1,
    base44Client
  } = safeParams;
  const narrative = (field_value || '').trim();
  
  console.log("[V2_PRIOR_LE_APPS][PACK_PRLE_Q01] ========== HANDLER EXECUTING ==========");
  console.log("[V2_PRIOR_LE_APPS][PACK_PRLE_Q01] Narrative length:", narrative.length);
  console.log("[V2_PRIOR_LE_APPS][PACK_PRLE_Q01] Narrative preview:", narrative.substring(0, 200));
  
  // Build anchors object - start with incident_context
  const anchors = { ...incident_context };
  
  // DETERMINISTIC EXTRACTION: Extract outcome first using extractFactAnchorsForField
  if (narrative && narrative.length > 10) {
    console.log("[V2_PRIOR_LE_APPS][PACK_PRLE_Q01] Running deterministic extraction...");
    const deterministicResult = extractFactAnchorsForField({
      packId: pack_id,
      fieldKey: field_key,
      fieldValue: narrative
    });
    
    if (deterministicResult.anchors && Object.keys(deterministicResult.anchors).length > 0) {
      Object.assign(anchors, deterministicResult.anchors);
      console.log("[V2_PRIOR_LE_APPS][PACK_PRLE_Q01] Deterministic extraction added anchors:", deterministicResult.anchors);
    }
  }
  
  // LLM-based extraction with strict JSON schema
  try {
    const llmResult = await base44Client.integrations.Core.InvokeLLM({
      prompt: `Extract structured data from this law enforcement application narrative. Be precise and only extract information explicitly stated in the text.

Narrative:
"${narrative}"

Extract:
- application_outcome: The final result (use ONLY: "hired", "disqualified", "withdrew", or "still_in_process")
- agency_name: The name of the law enforcement agency
- position_title: The job position applied for
- approx_date_range: When they applied (e.g., "March 2022", "2020", "early 2019")

If any field is not clearly stated, set it to null.`,
      response_json_schema: {
        type: "object",
        properties: {
          application_outcome: {
            type: ["string", "null"],
            enum: ["hired", "disqualified", "withdrew", "still_in_process", null]
          },
          agency_name: { type: ["string", "null"] },
          position_title: { type: ["string", "null"] },
          approx_date_range: { type: ["string", "null"] },
          notes: { type: ["string", "null"] }
        }
      }
    });
    
    // STAGE1: Log raw LLM output
    logPriorLeAnchors('STAGE1_MODEL_RAW', {
      packId: pack_id,
      fieldKey: field_key,
      instanceNumber: instance_number,
      anchorsObj: llmResult // Raw LLM result before mapping
    });
    console.log('[FACT_ANCHOR_TRACE][STAGE1_MODEL_RAW] Full LLM result:', JSON.stringify(llmResult, null, 2));
    
    console.log("[V2_PRIOR_LE_APPS][PACK_PRLE_Q01] LLM extraction result:", llmResult);
    
    // Map LLM extracted data to anchor keys (use canonical prior_le_* keys)
    if (llmResult?.application_outcome) {
      anchors.application_outcome = llmResult.application_outcome;
    }
    if (llmResult?.agency_name) {
      anchors.prior_le_agency = llmResult.agency_name;
    }
    if (llmResult?.position_title) {
      anchors.prior_le_position = llmResult.position_title;
    }
    if (llmResult?.approx_date_range) {
      anchors.prior_le_approx_date = llmResult.approx_date_range;
    }
    
    // STAGE2: Log parsed anchors after LLM mapping
    logPriorLeAnchors('STAGE2_PARSED', {
      packId: pack_id,
      fieldKey: field_key,
      instanceNumber: instance_number,
      anchorsObj: anchors
    });
  } catch (llmErr) {
    console.warn("[V2_PRIOR_LE_APPS][PACK_PRLE_Q01] LLM extraction failed, using fallback:", llmErr.message);
  }
  
  // Fallback heuristics if application_outcome still missing
  if (!anchors.application_outcome && narrative) {
    const text = narrative.toLowerCase();
    
    if (text.includes("disqualified") || text.includes("dq") || text.includes("failed background") || 
        text.includes("failed the background") || text.includes("not selected") || text.includes("rejected")) {
      anchors.application_outcome = "disqualified";
      console.log("[V2_PRIOR_LE_APPS][PACK_PRLE_Q01] Fallback: Set application_outcome=disqualified");
    } else if (text.includes("hired") || text.includes("offered the job") || text.includes("got the job")) {
      anchors.application_outcome = "hired";
      console.log("[V2_PRIOR_LE_APPS][PACK_PRLE_Q01] Fallback: Set application_outcome=hired");
    } else if (text.includes("withdrew") || text.includes("pulled my application") || text.includes("decided not to continue")) {
      anchors.application_outcome = "withdrew";
      console.log("[V2_PRIOR_LE_APPS][PACK_PRLE_Q01] Fallback: Set application_outcome=withdrew");
    } else if (text.includes("still in process") || text.includes("currently in process") || text.includes("pending")) {
      anchors.application_outcome = "still_in_process";
      console.log("[V2_PRIOR_LE_APPS][PACK_PRLE_Q01] Fallback: Set application_outcome=still_in_process");
    }
  }
  
  // Fallback heuristics for agency if LLM didn't extract
  if (!anchors.prior_le_agency && narrative) {
    const agencyPatterns = [
      /(?:applied\s+to\s+(?:the\s+)?)([\w\s]+(?:Police|Sheriff|Department|PD|SO|Agency|Marshal|Patrol))/i,
      /\b([\w\s]+(?:Police Department|Sheriff's Office|County Sheriff|City Police|State Police))\b/i
    ];
    for (const pattern of agencyPatterns) {
      const match = narrative.match(pattern);
      if (match && match[1] && match[1].length > 3) {
        anchors.prior_le_agency = match[1].trim();
        console.log("[V2_PRIOR_LE_APPS][PACK_PRLE_Q01] Fallback: Set prior_le_agency=" + anchors.prior_le_agency);
        break;
      }
    }
  }
  
  // Fallback heuristics for position if LLM didn't extract
  if (!anchors.prior_le_position && narrative) {
    const positionPatterns = [
      /(?:applied\s+(?:for|as)\s+(?:a\s+)?)(police officer|officer|deputy|sheriff|detective|trooper|agent|corrections officer|dispatcher|cadet)/i,
      /\b(police officer|officer|deputy|sheriff|detective|trooper|agent|corrections officer)\s+(?:position|role|job)/i
    ];
    for (const pattern of positionPatterns) {
      const match = narrative.match(pattern);
      if (match && match[1]) {
        anchors.prior_le_position = match[1].trim();
        console.log("[V2_PRIOR_LE_APPS][PACK_PRLE_Q01] Fallback: Set prior_le_position=" + anchors.prior_le_position);
        break;
      }
    }
  }
  
  // Fallback heuristics for date if LLM didn't extract
  if (!anchors.prior_le_approx_date && narrative) {
    const dateExtraction = extractMonthYearFromText(narrative);
    if (dateExtraction.value) {
      anchors.prior_le_approx_date = dateExtraction.value;
      console.log("[V2_PRIOR_LE_APPS][PACK_PRLE_Q01] Fallback: Set prior_le_approx_date=" + anchors.prior_le_approx_date);
    }
  }
  
  // DIAGNOSTIC LOGS (per user requirements)
  console.log("[V2_PRIOR_LE_APPS][PACK_PRLE_Q01] anchors to return:", anchors);
  console.log("[V2_PRIOR_LE_APPS][PACK_PRLE_Q01] application_outcome:", anchors.application_outcome);
  
  // STAGE3: Log normalized anchors (same as parsed for this handler)
  logPriorLeAnchors('STAGE3_NORMALIZED', {
    packId: pack_id,
    fieldKey: field_key,
    instanceNumber: instance_number,
    anchorsObj: anchors
  });
  
  // STAGE4: Log inputs to createV2ProbeResult
  logPriorLeAnchors('STAGE4_RESULT_INPUT_ANCHORS', {
    packId: pack_id,
    fieldKey: field_key,
    instanceNumber: instance_number,
    anchorsObj: anchors
  });
  logPriorLeAnchors('STAGE4_RESULT_INPUT_COLLECTED', {
    packId: pack_id,
    fieldKey: field_key,
    instanceNumber: instance_number,
    anchorsObj: anchors
  });
  
  // CRITICAL: For legacy handlePriorLeAppsQ01 calls, ensure anchors are included
  const legacyResult = {
    mode: "NEXT_FIELD",
    pack_id,
    field_key,
    semanticField: "narrative",
    validationResult: "narrative_complete",
    previousProbeCount: previous_probes_count,
    maxProbesPerField: 4,
    hasQuestion: false,
    followupsCount: 0,
    reason: "PACK_PRLE_Q01 narrative validated and anchors extracted",
    instanceNumber: instance_number,
    message: `Extracted ${Object.keys(anchors).length} anchors from narrative`,
    // CRITICAL: Include anchors directly in result object
    anchors: anchors || {},
    collectedAnchors: anchors || {}
  };
  
  return createV2ProbeResult(legacyResult);
}

/**
 * Unified V2ProbeResult type - ALWAYS includes anchors and collectedAnchors
 * CRITICAL FIX: Base defaults pattern guarantees anchors/collectedAnchors always exist
 */
/**
 * Universal V2 result builder - creates standard response structure
 * SINGLE SOURCE OF TRUTH for all V2 probe results
 * 
 * Signature: createV2ProbeResult(base = {})
 */
function createV2ProbeResult(base = {}) {
  return {
    mode: base.mode ?? "NEXT_FIELD",
    hasQuestion: base.hasQuestion ?? false,
    followupsCount: base.followupsCount ?? 0,
    reason: base.reason ?? "",
    question: base.question ?? null,
    questionText: base.questionText ?? base.question ?? null,
    questionPreview: base.questionPreview ?? null,
    anchors: (base.anchors && typeof base.anchors === 'object' && !Array.isArray(base.anchors)) ? base.anchors : {},
    collectedAnchors: (base.collectedAnchors && typeof base.collectedAnchors === 'object' && !Array.isArray(base.collectedAnchors)) ? base.collectedAnchors : {},
    aiNotes: base.aiNotes ?? null,
    debug: base.debug ?? {},
    ...base
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

// ============================================================================
// HYBRID FACT MODEL (OPTION C) - ANCHOR UTILITIES
// ============================================================================

/**
 * Create a single fact anchor atom with canonical shape
 * Returns null if key or value is invalid
 */
function createFactAnchor({
  sessionId,
  packId,
  fieldKey,
  baseQuestionCode,
  instanceNumber,
  key,
  value,
  source = "V2_PER_FIELD",
  confidence = null,
}) {
  if (!key || value == null || value === "") return null;

  return {
    key,
    value: String(value),
    packId,
    fieldKey,
    baseQuestionCode,
    sessionId,
    instanceNumber: instanceNumber ?? 1,
    source,
    confidence,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Normalize anchors object to array of fact atoms
 * Input: { prior_le_agency: "Phoenix PD", application_outcome: "disqualified", ... }
 * Output: [ { key: "prior_le_agency", value: "Phoenix PD", ... }, { key: "application_outcome", value: "disqualified", ... } ]
 */
function normalizeAnchorsToArray({
  sessionId,
  packId,
  fieldKey,
  baseQuestionCode,
  instanceNumber,
  expectedInputAnchors,
}) {
  if (!expectedInputAnchors || typeof expectedInputAnchors !== 'object') return [];

  const anchors = [];

  for (const [key, valueObj] of Object.entries(expectedInputAnchors)) {
    if (!valueObj) continue;
    
    // Handle both simple string values and {value, confidence} objects
    const value = typeof valueObj === "object" && valueObj !== null && "value" in valueObj
      ? valueObj.value
      : valueObj;
    const confidence = typeof valueObj === "object" && valueObj !== null && "confidence" in valueObj
      ? valueObj.confidence
      : null;

    const anchor = createFactAnchor({
      sessionId,
      packId,
      fieldKey,
      baseQuestionCode,
      instanceNumber,
      key,
      value,
      source: "V2_PER_FIELD",
      confidence,
    });

    if (anchor) anchors.push(anchor);
  }

  return anchors;
}

/**
 * Persist fact anchors to BOTH Response.fact_atoms AND InterviewSession.structured_followup_facts
 * Implements Hybrid Fact Model (Option C)
 */
async function persistFactAnchorsHybrid({
  base44Client,
  sessionId,
  packId,
  fieldKey,
  responseId,
  baseQuestionCode,
  instanceNumber,
  anchorsArray,
}) {
  if (!anchorsArray || anchorsArray.length === 0) {
    console.log("[ANCHOR][PERSIST] No anchors to persist");
    return;
  }

  console.log("[ANCHOR][PERSIST][START]", {
    sessionId,
    packId,
    fieldKey,
    responseId,
    anchorCount: anchorsArray.length,
    anchorKeys: anchorsArray.map(a => a.key)
  });

  try {
    // 1) Update Response.fact_atoms (deep audit storage)
    if (responseId) {
      try {
        const responses = await base44Client.asServiceRole.entities.Response.filter({ id: responseId });
        if (responses && responses.length > 0) {
          const response = responses[0];
          const existingAtoms = Array.isArray(response?.fact_atoms) ? response.fact_atoms : [];

          const mergedAtoms = [...existingAtoms, ...anchorsArray];

          await base44Client.asServiceRole.entities.Response.update(responseId, {
            fact_atoms: mergedAtoms
          });

          console.log("[ANCHOR][PERSIST][RESPONSE]", {
            responseId,
            atomsAdded: anchorsArray.length,
            totalAtoms: mergedAtoms.length
          });
        }
      } catch (respErr) {
        console.error("[ANCHOR][PERSIST][RESPONSE_ERROR]", respErr.message);
        // Non-fatal - continue to session persistence
      }
    }

    // 2) Update InterviewSession.structured_followup_facts (canonical queryable index)
    const sessions = await base44Client.asServiceRole.entities.InterviewSession.filter({ id: sessionId });
    if (!sessions || sessions.length === 0) {
      console.warn("[ANCHOR][PERSIST] Session not found:", sessionId);
      return;
    }

    const session = sessions[0];
    const existingFacts = Array.isArray(session?.structured_followup_facts)
      ? session.structured_followup_facts
      : [];

    // Merge by (packId, fieldKey, instanceNumber, key) to prevent duplicates
    const existingByKey = new Map();
    for (const fact of existingFacts) {
      if (!fact || !fact.key) continue;
      const k = `${fact.packId || ""}::${fact.fieldKey || ""}::${fact.instanceNumber || 1}::${fact.key}`;
      existingByKey.set(k, fact);
    }

    for (const anchor of anchorsArray) {
      const k = `${anchor.packId || packId}::${anchor.fieldKey || fieldKey}::${anchor.instanceNumber || instanceNumber || 1}::${anchor.key}`;
      existingByKey.set(k, {
        ...anchor,
        packId: anchor.packId || packId,
        fieldKey: anchor.fieldKey || fieldKey,
        sessionId: anchor.sessionId || sessionId,
        instanceNumber: anchor.instanceNumber || instanceNumber || 1,
      });
    }

    const mergedFacts = Array.from(existingByKey.values());

    await base44Client.asServiceRole.entities.InterviewSession.update(sessionId, {
      structured_followup_facts: mergedFacts
    });

    console.log("[ANCHOR][PERSIST][SESSION]", {
      sessionId,
      anchorsAdded: anchorsArray.length,
      totalFacts: mergedFacts.length,
      newKeys: anchorsArray.map(a => a.key)
    });

  } catch (error) {
    console.error("[ANCHOR][PERSIST][ERROR]", {
      error: error.message,
      stack: error.stack
    });
    // Non-fatal - don't break the interview flow
  }
}

/**
 * Core probe engine logic - Universal MVP Mode
 * V2.6 Universal MVP: ALL V2 packs use Discretion Engine
 * 
 * Flow:
 * 1. On pack entry (probeCount=0): Call Discretion Engine for opening question
 * 2. On each answer: Extract anchors, call Discretion Engine to decide next step
 * 3. Return QUESTION with AI-generated text, or NEXT_FIELD/COMPLETE when done
 * 
 * SYSTEMIC FIX: All return paths now include anchors and collectedAnchors
 * 
 * NOTE: This is the CORE implementation - call probeEngineV2Wrapper for normalized results
 */
async function probeEngineV2Core(params, base44Client) {
  // Defensive normalization - ensure params is always an object
  params = params && typeof params === 'object' ? params : {};
  
  // VERSION BANNER - Production build with real anchor extraction
  console.log("[V2_ENGINE] probeEngineV2 production build - real anchor extraction enabled");
  
  const {
    pack_id,
    field_key,
    field_value,
    previous_probes_count = 0,
    incident_context = {},
    mode: requestMode = "VALIDATE_FIELD",
    answerLooksLikeNoRecall: frontendNoRecallFlag = false,
    sectionName = null,
    baseQuestionText = null,
    questionDbId = null,
    questionCode = null,
    instance_number = 1,
    instance_anchors = {},
    session_id = null
  } = params;

  console.log(`[V2-UNIVERSAL][ENTRY] pack=${pack_id}, field=${field_key}, value="${field_value?.substring?.(0, 50)}", probes=${previous_probes_count}, instance=${instance_number}`);
  
  // ============================================================================
  // PER-FIELD HANDLER ROUTER
  // Check if this pack has a dedicated perFieldHandler before generic logic
  // CRITICAL: This runs BEFORE the early router to give perFieldHandlers priority
  // ============================================================================
  const packConfig = PACK_CONFIG[pack_id];
  
  if (packConfig?.perFieldHandler && typeof packConfig.perFieldHandler === 'function') {
    console.log("[V2_PER_FIELD][ROUTER] ========== DEDICATED HANDLER FOUND ==========", {
      packId: pack_id,
      fieldKey: field_key,
      usingHandler: packConfig.perFieldHandler === handlePriorLeAppsPerFieldV2 
        ? "handlePriorLeAppsPerFieldV2" 
        : packConfig.perFieldHandler.name || "anonymous",
      narrativeLength: field_value?.length || 0
    });
    
    // DISPATCH LOGGING for PACK_PRIOR_LE_APPS_STANDARD
    if (pack_id === 'PACK_PRIOR_LE_APPS_STANDARD') {
      console.log('[V2_PRIOR_LE_APPS][DISPATCH]', {
        packId: pack_id,
        fieldKey: field_key,
        instanceNumber: instance_number,
        probeCount: previous_probes_count,
        narrativePreview: field_value?.slice?.(0, 100)
      });
    }
    
    // DIAGNOSTIC: Log dispatch for PACK_PRIOR_LE_APPS_STANDARD
    if (pack_id === 'PACK_PRIOR_LE_APPS_STANDARD' && field_key === 'PACK_PRLE_Q01') {
      console.log('[V2_PRIOR_LE_APPS][DISPATCH]', {
        packId: pack_id,
        fieldKey: field_key,
        instanceNumber: instance_number,
        probeCount: previous_probes_count,
        narrativePreview: field_value?.slice?.(0, 100)
      });
    }
    
    // Build context for per-field handler - pass entire params for narrative extraction
    const ctx = {
      packId: pack_id,
      fieldKey: field_key,
      fieldValue: field_value,
      field_value: field_value,
      fullNarrative: params.fullNarrative,
      fullAnswer: params.fullAnswer,
      answer: params.answer,
      narrative: params.narrative,
      fieldValuePreview: params.fieldValuePreview,
      answerPreview: params.answerPreview,
      instanceNumber: instance_number,
      collectedAnchors: incident_context || {},
      probeCount: previous_probes_count,
      base44Client,
      sectionName,
      baseQuestionText,
      questionCode,
      sessionId: session_id
    };
    
    // DIAGNOSTIC: Log raw context being sent to handler
    if (pack_id === "PACK_PRIOR_LE_APPS_STANDARD" && field_key === "PACK_PRLE_Q01") {
      console.log("[TEST_PRIOR_LE_ANCHORS][CTX_TO_HANDLER]", {
        packId: pack_id,
        fieldKey: field_key,
        fieldValue: ctx.fieldValue?.slice?.(0, 100),
        field_value: ctx.field_value?.slice?.(0, 100),
        fullNarrative: ctx.fullNarrative?.slice?.(0, 100),
        allCtxKeys: Object.keys(ctx),
      });
    }
    
    // Call the handler
    console.log("═════════════════════════════════════════════════════════════");
    console.log("FORENSIC CHECKPOINT 6: CALLING HANDLER");
    console.log("═════════════════════════════════════════════════════════════");
    console.log("[ROUTER][PRE_HANDLER]", {
      packId: pack_id,
      fieldKey: field_key,
      handlerName: packConfig.perFieldHandler.name || "anonymous",
      ctxKeys: Object.keys(ctx)
    });

    let handlerResult = await packConfig.perFieldHandler(ctx);
    
    console.log("═════════════════════════════════════════════════════════════");
    console.log("FORENSIC CHECKPOINT 7: HANDLER RETURNED");
    console.log("═════════════════════════════════════════════════════════════");
    console.log("[ROUTER][POST_HANDLER]", {
      packId: pack_id,
      fieldKey: field_key,
      handlerResultType: typeof handlerResult,
      handlerResultKeys: Object.keys(handlerResult || {}),
      handlerResultAnchorsType: typeof handlerResult?.anchors,
      handlerResultCollectedType: typeof handlerResult?.collectedAnchors,
      handlerResultAnchors: handlerResult?.anchors,
      handlerResultCollected: handlerResult?.collectedAnchors,
      handlerResultAnchorsKeys: Object.keys(handlerResult?.anchors || {}),
      handlerResultCollectedKeys: Object.keys(handlerResult?.collectedAnchors || {}),
      applicationOutcomeValue: handlerResult?.anchors?.application_outcome || '(MISSING)',
      fullHandlerResult: JSON.stringify(handlerResult, null, 2)
    });
    
    // DISPATCH RESULT LOGGING for PACK_PRIOR_LE_APPS_STANDARD
    if (pack_id === 'PACK_PRIOR_LE_APPS_STANDARD') {
      console.log('[V2_PRIOR_LE_APPS][RESULT_RAW]', {
        packId: pack_id,
        fieldKey: field_key,
        resultMode: handlerResult?.mode,
        hasQuestion: handlerResult?.hasQuestion,
        anchorsKeys: handlerResult?.anchors ? Object.keys(handlerResult.anchors) : [],
        collectedAnchorsKeys: handlerResult?.collectedAnchors ? Object.keys(handlerResult.collectedAnchors) : [],
        anchorsValues: handlerResult?.anchors,
        collectedValues: handlerResult?.collectedAnchors
      });
    }
    
    // DIAGNOSTIC: Log result for PACK_PRIOR_LE_APPS_STANDARD
    if (pack_id === 'PACK_PRIOR_LE_APPS_STANDARD' && field_key === 'PACK_PRLE_Q01') {
      console.log('[V2_PRIOR_LE_APPS][RESULT_RAW]', {
        packId: pack_id,
        fieldKey: field_key,
        resultMode: handlerResult?.mode,
        hasQuestion: handlerResult?.hasQuestion,
        anchorsKeys: handlerResult?.anchors ? Object.keys(handlerResult.anchors) : [],
        collectedAnchorKeys: handlerResult?.collectedAnchors ? Object.keys(handlerResult.collectedAnchors) : [],
        anchorsValues: handlerResult?.anchors,
        collectedValues: handlerResult?.collectedAnchors
      });
    }
    
    // === PRIOR LE APPS: deterministic outcome anchors for PACK_PRLE_Q01 ===
    if (pack_id === "PACK_PRIOR_LE_APPS_STANDARD" && field_key === "PACK_PRLE_Q01") {
      // Get canonical field text from input
      const fieldText =
        input.field_value ??
        input.fieldValue ??
        input.answer ??
        input.narrative ??
        input.fullNarrative ??
        "";
      
      const { anchors: outcomeAnchors, collectedAnchors: outcomeCollected } =
        extractPriorLeAppsOutcomeAnchors(fieldText);

      // Normalize handlerResult anchors objects so we can safely merge into them
      if (!handlerResult.anchors || typeof handlerResult.anchors !== "object") {
        handlerResult.anchors = {};
      }
      if (
        !handlerResult.collectedAnchors ||
        typeof handlerResult.collectedAnchors !== "object"
      ) {
        handlerResult.collectedAnchors = {};
      }

      // Merge deterministic outcome anchors in WITHOUT overwriting any existing keys
      handlerResult.anchors = {
        ...outcomeAnchors,
        ...handlerResult.anchors,
      };

      handlerResult.collectedAnchors = {
        ...outcomeCollected,
        ...handlerResult.collectedAnchors,
      };

      // Diagnostic for this pack/field
      console.log("[PRIOR_LE_APPS][Q01][DETERMINISTIC_OUTCOME]", {
        packId: pack_id,
        fieldKey: field_key,
        fieldTextPreview: fieldText.slice(0, 120),
        anchorsKeys: Object.keys(handlerResult.anchors || {}),
        collectedKeys: Object.keys(handlerResult.collectedAnchors || {}),
        outcome: handlerResult.anchors.application_outcome || null,
      });
    }
    
    // CRITICAL DIAGNOSTIC: Trace handler result structure
    console.log("[V2_PER_FIELD][ROUTER][HANDLER_RESULT_RAW]", {
      packId: pack_id,
      fieldKey: field_key,
      resultType: typeof handlerResult,
      resultKeys: handlerResult ? Object.keys(handlerResult) : [],
      hasAnchorsProperty: handlerResult && Object.prototype.hasOwnProperty.call(handlerResult, 'anchors'),
      hasCollectedProperty: handlerResult && Object.prototype.hasOwnProperty.call(handlerResult, 'collectedAnchors'),
      anchorsValue: handlerResult?.anchors,
      collectedValue: handlerResult?.collectedAnchors,
    });
    
    // CRITICAL: Log and verify handler returned anchors
    if (pack_id === "PACK_PRIOR_LE_APPS_STANDARD" && field_key === "PACK_PRLE_Q01") {
      console.log('[V2_PRIOR_LE_APPS][RESULT_RAW]', {
        handlerReturnedAnchors: !!handlerResult?.anchors,
        handlerReturnedCollected: !!handlerResult?.collectedAnchors,
        anchorKeys: Object.keys(handlerResult?.anchors || {}),
        collectedKeys: Object.keys(handlerResult?.collectedAnchors || {}),
        anchorsValues: handlerResult?.anchors,
        collectedValues: handlerResult?.collectedAnchors
      });
    }
    
    // Fact anchor extraction - use existing handler anchors as base
    const mergedAnchors = handlerResult?.anchors || {};
    const mergedCollected = handlerResult?.collectedAnchors || {};
    
    handlerResult.anchors = mergedAnchors;
    handlerResult.collectedAnchors = mergedCollected;
    
    // CRITICAL DIAGNOSTIC: Verify merge worked
    if (pack_id === "PACK_PRIOR_LE_APPS_STANDARD" && field_key === "PACK_PRLE_Q01") {
      console.log(PRIOR_LE_DEBUG, "[AFTER_MERGE]", {
        mergedAnchorsKeys: Object.keys(mergedAnchors),
        mergedCollectedKeys: Object.keys(mergedCollected),
        handlerResultAnchorsKeys: Object.keys(handlerResult.anchors || {}),
        handlerResultCollectedKeys: Object.keys(handlerResult.collectedAnchors || {}),
        applicationOutcome: handlerResult.anchors?.application_outcome || '(MISSING)',
        fullAnchorsObject: handlerResult.anchors,
        fullCollectedObject: handlerResult.collectedAnchors,
      });
    }
    
    // DIAGNOSTIC: Final result before return
    if (pack_id === "PACK_PRIOR_LE_APPS_STANDARD" && field_key === "PACK_PRLE_Q01") {
      console.log(PRIOR_LE_DEBUG, "[BEFORE_FINAL_RETURN]", {
        packId: pack_id,
        fieldKey: field_key,
        resultAnchorsKeys: Object.keys(handlerResult.anchors || {}),
        resultCollectedKeys: Object.keys(handlerResult.collectedAnchors || {}),
        resultAnchors: handlerResult.anchors,
        resultCollected: handlerResult.collectedAnchors,
      });
    }
    
    console.log("═════════════════════════════════════════════════════════════");
    console.log("FORENSIC CHECKPOINT 8: FINAL RETURN FROM ROUTER");
    console.log("═════════════════════════════════════════════════════════════");
    console.log("[ROUTER][FINAL_RETURN]", {
      packId: pack_id,
      fieldKey: field_key,
      handlerResultKeys: Object.keys(handlerResult || {}),
      handlerResultAnchors: handlerResult?.anchors,
      handlerResultCollected: handlerResult?.collectedAnchors,
      handlerResultAnchorsKeys: Object.keys(handlerResult?.anchors || {}),
      handlerResultCollectedKeys: Object.keys(handlerResult?.collectedAnchors || {}),
      applicationOutcome: handlerResult?.anchors?.application_outcome || '(MISSING)',
      fullObject: JSON.stringify(handlerResult, null, 2)
    });

    console.log("═════════════════════════════════════════════════════════════");
    console.log("PER-FIELD HANDLER COMPLETE - RETURNING RESULT TO HTTP HANDLER");
    console.log("═════════════════════════════════════════════════════════════");
    console.log("[ROUTER][HANDLER_FINAL_RETURN]", {
      packId: pack_id,
      fieldKey: field_key,
      resultMode: handlerResult?.mode,
      resultAnchorsKeys: Object.keys(handlerResult?.anchors || {}),
      resultCollectedKeys: Object.keys(handlerResult?.collectedAnchors || {}),
      applicationOutcome: handlerResult?.anchors?.application_outcome || '(MISSING)',
      RESULT_BEING_RETURNED: handlerResult
    });
    
    // CRITICAL: Return handler result with merged fact anchors
    // This returns DIRECTLY to the HTTP handler, bypassing all remaining logic
    return handlerResult;
  }
  
  // Initialize anchor tracking from incoming context
  let currentAnchors = mergeAnchors(incident_context, instance_anchors);
  let extractedAnchors = {};
  
  console.log(`[V2-UNIVERSAL] Initial anchors:`, Object.keys(currentAnchors));
  
  // ============================================================================
  // EARLY ROUTER: SKIP for packs with perFieldHandler
  // If a pack has a dedicated perFieldHandler, don't use the early router
  // ============================================================================
  
  // CRITICAL: Check if this pack has a perFieldHandler BEFORE using early router
  const hasPerFieldHandler = packConfig?.perFieldHandler && typeof packConfig.perFieldHandler === 'function';
  
  if (hasPerFieldHandler) {
    console.log(`[EARLY_ROUTER_SKIP] pack="${pack_id}" has perFieldHandler - skipping early router logic`);
    // Skip early router - handler was already called above and returned
    // This prevents double-processing
  }
  
  // CRITICAL: Extract narrative text - frontend sends it as field_value
  const narrativeText = 
    params.field_value || 
    params.fieldValue || 
    params.answer || 
    params.fullNarrative || 
    params.narrative || 
    '';
  
  console.log(`[EARLY_ROUTER_CHECK] pack_id="${pack_id}", field_key="${field_key}"`);
  console.log(`[EARLY_ROUTER_CHECK] hasPerFieldHandler: ${hasPerFieldHandler}`);
  console.log(`[EARLY_ROUTER_CHECK] narrativeText length: ${narrativeText?.length || 0}`);
  
  // Only execute early router if pack does NOT have perFieldHandler
  if (!hasPerFieldHandler && pack_id === "PACK_PRIOR_LE_APPS_STANDARD" && field_key === "PACK_PRLE_Q01" && narrativeText && narrativeText.trim()) {
    console.log("[PRIOR_LE_APPS][Q01][EARLY_ROUTER] ========== ROUTING TO DEDICATED HANDLER ==========");
    
    // PART 1 DIAGNOSTICS: Log raw input narrative
    console.log(`[PRIOR_LE_APPS][BACKEND][Q01_INPUT] ========== RAW INPUT ==========`);
    console.log(`[PRIOR_LE_APPS][BACKEND][Q01_INPUT] narrativeText:`, narrativeText);
    console.log(`[PRIOR_LE_APPS][BACKEND][Q01_INPUT] narrative length: ${narrativeText.length}`);
    console.log(`[PRIOR_LE_APPS][BACKEND][Q01_INPUT] incident_context (incoming anchors):`, incident_context);
    console.log(`[PRIOR_LE_APPS][BACKEND][Q01_INPUT] instance_anchors:`, instance_anchors);
    
    // CRITICAL: Run deterministic extractor FIRST using extractFactAnchorsForField
    console.log(`[PRIOR_LE_APPS][BACKEND][Q01_EXTRACT] ========== RUNNING DETERMINISTIC EXTRACTION ==========`);
    console.log(`[PRIOR_LE_APPS][BACKEND][Q01_EXTRACT] Calling extractFactAnchorsForField...`);
    const deterministicExtraction = extractFactAnchorsForField({ 
      packId: pack_id, 
      fieldKey: field_key, 
      fieldValue: narrativeText 
    });
    Object.assign(extractedAnchors, deterministicExtraction.anchors || {});
    
    console.log(`[PRIOR_LE_APPS][BACKEND][Q01_EXTRACT] ========== EXTRACTION COMPLETE ==========`);
    console.log(`[PRIOR_LE_APPS][BACKEND][Q01_EXTRACT] Extracted anchors:`, deterministicExtraction.anchors);
    console.log(`[PRIOR_LE_APPS][BACKEND][Q01_EXTRACT] Anchor count: ${Object.keys(deterministicExtraction.anchors || {}).length}`);
    console.log(`[PRIOR_LE_APPS][BACKEND][Q01_EXTRACT] Has application_outcome? ${!!(deterministicExtraction.anchors?.application_outcome)}`);
    console.log(`[PRIOR_LE_APPS][BACKEND][Q01_EXTRACT] application_outcome value: "${deterministicExtraction.anchors?.application_outcome || '(NOT FOUND)'}"`);
    console.log(`[PRIOR_LE_APPS][BACKEND][Q01_EXTRACT] extractedAnchors after merge:`, extractedAnchors);
    
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
    const handlerResult = await handlePriorLeAppsQ01({
      pack_id,
      field_key,
      field_value: narrativeText, // Pass narrativeText here
      incident_context: currentAnchors,
      extractedAnchors,
      previous_probes_count,
      instance_number,
      base44Client
    });
    
    // PART 1 DIAGNOSTICS: Log parsed anchors from handler
    console.log(`[V2_PRIOR_LE_APPS][PACK_PRLE_Q01] PARSED ANCHORS (from handler):`, handlerResult.anchors);
    console.log(`[V2_PRIOR_LE_APPS][PACK_PRLE_Q01] PARSED ANCHORS application_outcome: "${handlerResult.anchors?.application_outcome || '(MISSING)'}"`);
    
    // Merge anchors from handler
    const mergedAnchors = mergeAnchors(currentAnchors, handlerResult.anchors);
    
    console.log(`[V2_PRIOR_LE_APPS][PACK_PRLE_Q01] FINAL MERGED ANCHORS:`, mergedAnchors);
    console.log(`[V2_PRIOR_LE_APPS][PACK_PRLE_Q01] FINAL application_outcome: "${mergedAnchors.application_outcome || '(MISSING)'}"`);
    
    // CRITICAL: Use createV2ProbeResult to ensure consistent result structure
    const finalResult = createV2ProbeResult({
      mode: handlerResult.mode,
      pack_id: handlerResult.pack_id,
      field_key: handlerResult.field_key,
      hasQuestion: handlerResult.hasQuestion,
      followupsCount: handlerResult.followupsCount,
      semanticField: handlerResult.semanticField,
      validationResult: handlerResult.validationResult,
      previousProbeCount: handlerResult.previousProbeCount,
      maxProbesPerField: handlerResult.maxProbesPerField,
      collectedAnchorsKeys: Object.keys(mergedAnchors),
      reason: handlerResult.reason,
      instanceNumber: handlerResult.instanceNumber,
      message: handlerResult.message,
      // CRITICAL: Pass anchors explicitly so createV2ProbeResult includes them
      anchors: mergedAnchors,
      collectedAnchors: mergedAnchors
    });
    
    console.log("[PRIOR_LE_APPS][BACKEND][Q01_RESULT] ========== FINAL RESULT BEFORE RETURN ==========");
    console.log('[PRIOR_LE_APPS][BACKEND][Q01_RESULT]', {
      mode: finalResult.mode,
      hasQuestion: finalResult.hasQuestion,
      pack_id: finalResult.pack_id,
      field_key: finalResult.field_key,
      anchorsType: typeof finalResult.anchors,
      collectedAnchorsType: typeof finalResult.collectedAnchors,
      anchorKeys: Object.keys(finalResult.anchors || {}),
      collectedAnchorsKeys: Object.keys(finalResult.collectedAnchors || {}),
      anchors: finalResult.anchors,
      collectedAnchors: finalResult.collectedAnchors,
      hasApplicationOutcome: !!(
        (finalResult.anchors && finalResult.anchors.application_outcome) ||
        (finalResult.collectedAnchors && finalResult.collectedAnchors.application_outcome)
      ),
      applicationOutcome:
        (finalResult.anchors && finalResult.anchors.application_outcome) ||
        (finalResult.collectedAnchors && finalResult.collectedAnchors.application_outcome) ||
        null
    });
    
    // ASSERTION LOG
    if (finalResult.anchors && finalResult.anchors.application_outcome) {
      console.log("[PRIOR_LE_APPS][BACKEND][Q01_RESULT] ✅✅✅ application_outcome anchor PRESENT:", finalResult.anchors.application_outcome);
    } else {
      console.log("[PRIOR_LE_APPS][BACKEND][Q01_RESULT] ❌❌❌ application_outcome anchor MISSING");
      console.log("[PRIOR_LE_APPS][BACKEND][Q01_RESULT] ❌ DEBUG: mergedAnchors=", mergedAnchors);
      console.log("[PRIOR_LE_APPS][BACKEND][Q01_RESULT] ❌ DEBUG: handlerResult.anchors=", handlerResult.anchors);
      console.log("[PRIOR_LE_APPS][BACKEND][Q01_RESULT] ❌ DEBUG: extractedAnchors=", extractedAnchors);
      console.log("[PRIOR_LE_APPS][BACKEND][Q01_RESULT] ❌ DEBUG: currentAnchors=", currentAnchors);
    }
    
    return finalResult;
  }
  
  // ============================================================================
  // V2.6 UNIVERSAL MVP: Use Discretion Engine for ALL V2 packs
  // ============================================================================
  
  console.log(`[V2-UNIVERSAL][ENTRY] pack=${pack_id} field=${field_key} instance=${instance_number} probeCount=${previous_probes_count}`);
  
  // Check if this is a V2 pack with perFieldHandler (should use handler for ALL calls)
  const isV2PackWithHandler = packConfig?.perFieldHandler && typeof packConfig.perFieldHandler === 'function';
  
  // HARDENED: For pack opening (probeCount=0, empty field value), call Discretion Engine
  // BUT: Skip this entirely for packs with perFieldHandler - they handle opening internally
  if (!isV2PackWithHandler && previous_probes_count === 0 && (!field_value || field_value.trim() === "")) {
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
        const baseResult = {
          mode: "QUESTION",
          hasQuestion: true,
          followupsCount: 1,
          question,
          reason: "Opening question from Discretion Engine",
          anchors: currentAnchors || {},
          collectedAnchors: currentAnchors || {}
        };
        return createV2ProbeResult(baseResult);
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
      
      // DETERMINISTIC EXTRACTION FIRST: Use extractFactAnchorsForField before LLM
      console.log(`[V2-UNIVERSAL][DETERMINISTIC] Running extractFactAnchorsForField for pack=${pack_id}, field=${fieldKey}`);
      const deterministicResult = extractFactAnchorsForField({
        packId: pack_id,
        fieldKey: fieldKey,
        fieldValue: field_value
      });
      
      if (deterministicResult.anchors && Object.keys(deterministicResult.anchors).length > 0) {
        Object.assign(extractedAnchors, deterministicResult.anchors);
        console.log(`[V2-UNIVERSAL][DETERMINISTIC] Extracted ${Object.keys(deterministicResult.anchors).length} anchors: [${Object.keys(deterministicResult.anchors).join(', ')}]`);
        
        if (pack_id === "PACK_PRIOR_LE_APPS_STANDARD") {
          console.log(`[PACK_PRIOR_LE_APPS][DETERMINISTIC] application_outcome="${deterministicResult.anchors.application_outcome || '(none)'}"`);
        }
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
        // Merge LLM extraction with local extraction (deterministic takes precedence)
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
          console.log(`[V2-UNIVERSAL][STOP] Discretion says stop: ${discretionResult.data.reason}`);
          
          const baseResult = {
            mode: "NEXT_FIELD",
            hasQuestion: false,
            followupsCount: 0,
            reason: discretionResult.data.reason,
            anchors: currentAnchors || {},
            collectedAnchors: currentAnchors || {}
          };
          return createV2ProbeResult(baseResult);
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
              anchors: currentAnchors || {},
              collectedAnchors: currentAnchors || {},
              message: 'Invalid question from Discretion - advancing'
            });
          }
          
          // Discretion wants to ask another question
          console.log(`[V2-UNIVERSAL][PROBE] Discretion asks: "${question.substring(0, 60)}..."`);
          const baseResult = {
            mode: "QUESTION",
            hasQuestion: true,
            followupsCount: 1,
            question,
            reason: `Probing for: ${discretionResult.data.targetAnchors?.join(', ')}`,
            anchors: currentAnchors || {},
            collectedAnchors: currentAnchors || {}
          };
          return createV2ProbeResult(baseResult);
        } else {
          // No valid question returned
          console.warn(`[V2-UNIVERSAL] Discretion action=${discretionResult.data.action} but no valid question - advancing`);
          const baseResult = {
            mode: "NEXT_FIELD",
            hasQuestion: false,
            followupsCount: 0,
            reason: 'No question from Discretion - advancing',
            anchors: currentAnchors || {},
            collectedAnchors: currentAnchors || {}
          };
          return createV2ProbeResult(baseResult);
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
    console.log(`[V2-UNIVERSAL] No pack config found for ${pack_id} - accepting answer`);
    
    const baseResult = {
      mode: "NEXT_FIELD",
      hasQuestion: false,
      followupsCount: 0,
      reason: `Pack ${pack_id} not configured for V2 probing`,
      anchors: currentAnchors || {},
      collectedAnchors: currentAnchors || {}
    };
    return createV2ProbeResult(baseResult);
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
    
    const baseResult = {
      mode: "NEXT_FIELD",
      hasQuestion: false,
      followupsCount: 0,
      reason: `Max probes reached for ${semanticField}`,
      anchors: currentAnchors || {},
      collectedAnchors: currentAnchors || {}
    };
    return createV2ProbeResult(baseResult);
  }

  // If field is complete (valid answer), move to next field
  if (validationResult === "complete") {
    console.log(`[V2-PER-FIELD] Field ${semanticField} is complete → advancing`);
    
    const baseResult = {
      mode: "NEXT_FIELD",
      hasQuestion: false,
      followupsCount: 0,
      reason: `Field ${semanticField} validated successfully`,
      anchors: currentAnchors || {},
      collectedAnchors: currentAnchors || {}
    };
    return createV2ProbeResult(baseResult);
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
    
    const baseResult = {
      mode: "NEXT_FIELD",
      hasQuestion: false,
      followupsCount: 0,
      reason: `LLM determined field ${semanticField} is acceptable`,
      anchors: currentAnchors || {},
      collectedAnchors: currentAnchors || {}
    };
    return createV2ProbeResult(baseResult);
  }
  
  console.log(`[V2-PER-FIELD] Field ${semanticField} incomplete → returning QUESTION mode (source: ${probeResult.source})`);

  const baseResult = {
    mode: "QUESTION",
    hasQuestion: true,
    followupsCount: 1,
    question: probeResult.question,
    reason: `Probing for more information about ${semanticField}`,
    anchors: currentAnchors || {},
    collectedAnchors: currentAnchors || {}
  };
  return createV2ProbeResult(baseResult);
}

/**
 * Main probe engine function - Normalized wrapper around core logic
 * BACKWARDS-COMPATIBLE: Guarantees anchors/collectedAnchors on ALL responses
 * 
 * @param {object} params - Probe parameters (standardized name)
 * @param {object} base44Client - Base44 SDK client
 * @returns {object} Normalized V2 probe result with anchors/collectedAnchors
 */
async function probeEngineV2(params, base44Client) {
  // Defensive normalization - ensure params is always an object
  params = params && typeof params === 'object' ? params : {};
  
  console.log('[V2_PROBE][ENTRY]', {
    packId: params.pack_id || params.packId,
    fieldKey: params.field_key || params.fieldKey,
    instanceNumber: params.instance_number || params.instanceNumber,
    probeCount: params.previous_probes_count || params.probeCount || 0,
  });
  
  console.log("═════════════════════════════════════════════════════════════");
  console.log("FORENSIC CHECKPOINT 9: WRAPPER CALLING CORE");
  console.log("═════════════════════════════════════════════════════════════");
  
  const rawResult = await probeEngineV2Core(params, base44Client);
  
  console.log("═════════════════════════════════════════════════════════════");
  console.log("FORENSIC CHECKPOINT 10: CORE RETURNED TO WRAPPER");
  console.log("═════════════════════════════════════════════════════════════");
  console.log("[WRAPPER][RAW_RESULT]", {
    rawResultType: typeof rawResult,
    rawResultKeys: Object.keys(rawResult || {}),
    rawResultAnchors: rawResult?.anchors,
    rawResultCollected: rawResult?.collectedAnchors,
    rawResultAnchorsKeys: Object.keys(rawResult?.anchors || {}),
    applicationOutcome: rawResult?.anchors?.application_outcome || '(MISSING)'
  });
  
  const normalized = normalizeV2ProbeResult(rawResult);
  
  console.log("═════════════════════════════════════════════════════════════");
  console.log("FORENSIC CHECKPOINT 11: AFTER NORMALIZATION");
  console.log("═════════════════════════════════════════════════════════════");
  console.log("[WRAPPER][NORMALIZED]", {
    normalizedType: typeof normalized,
    normalizedKeys: Object.keys(normalized || {}),
    normalizedAnchors: normalized?.anchors,
    normalizedCollected: normalized?.collectedAnchors,
    normalizedAnchorsKeys: Object.keys(normalized?.anchors || {}),
    applicationOutcome: normalized?.anchors?.application_outcome || '(MISSING)'
  });
  
  return normalized;
}

/**
 * Safe V2 probe engine - no-crash orchestrator
 * Returns well-formed results, lets frontend drive progression
 */
Deno.serve(async (req) => {
  const logger = console;
  
  // Declare variables at top scope so they're available in catch block
  let packId = null;
  let fieldKey = null;
  let instanceNumber = null;
  let probeCount = 0;
  let collectedAnchorsKeys = [];
  
  // Helper: build consistent result object
  function buildSafeResult(overrides = {}) {
    return {
      mode: "NEXT_FIELD",
      hasQuestion: false,
      questionText: null,
      anchors: [],
      collectedAnchors: overrides.collectedAnchors || [],
      metadata: {
        packId: overrides.packId || null,
        fieldKey: overrides.fieldKey || null,
        instanceNumber: overrides.instanceNumber || null,
        probeCount: overrides.probeCount || 0
      },
      ...overrides
    };
  }
  
  try {
    // Only accept POST
    if (req.method !== "POST") {
      return Response.json(buildSafeResult({
        mode: "NONE",
        error: "Method not allowed - use POST"
      }), { status: 405 });
    }
    
    const base44 = createClientFromRequest(req);
    
    // Parse JSON body
    let raw;
    try {
      raw = await req.json();
    } catch (parseError) {
      logger.error('[V2] Parse error:', parseError.message);
      return Response.json(buildSafeResult({
        error: "Invalid JSON body"
      }), { status: 200 });
    }
    
    // Normalize input - handle both direct payload and { params: {...} } wrapper
    const params = (raw && typeof raw === "object" && raw.params) ? raw.params : raw || {};
    
    // Assign to top-level variables so they're available in catch block
    packId = params.pack_id || params.packId;
    fieldKey = params.field_key || params.fieldKey;
    instanceNumber = params.instance_number || params.instanceNumber || 1;
    probeCount = params.previous_probes_count || params.probeCount || 0;
    collectedAnchorsKeys = params.collectedAnchorsKeys || [];
    const fieldValue = params.field_value || params.fieldValue || params.answer || "";
    
    // Guardrail: require packId and fieldKey
    if (!packId || !fieldKey) {
      logger.warn('[V2] Missing packId or fieldKey', { packId, fieldKey });
      return Response.json(buildSafeResult({
        packId,
        fieldKey,
        instanceNumber,
        probeCount,
        collectedAnchors: collectedAnchorsKeys,
        error: "Missing packId or fieldKey"
      }), { status: 200 });
    }
    
    logger.info('[V2] Request received', { packId, fieldKey, instanceNumber, probeCount });
    
    // Call the core probe engine with normalized params
    const result = await probeEngineV2(params, base44);
    
    logger.info('[V2] Returning result', { mode: result.mode, packId, fieldKey });
    return Response.json(result);
  } catch (error) {
    const message = error?.message || String(error);
    logger.error('[V2] Unhandled error:', message);
    
    // Still return valid shape - use top-level variables which are now defined
    return Response.json(buildSafeResult({
      packId: packId || null,
      fieldKey: fieldKey || null,
      instanceNumber: instanceNumber || null,
      probeCount: probeCount || 0,
      collectedAnchors: collectedAnchorsKeys || [],
      error: message
    }), { status: 200 });
  }
});