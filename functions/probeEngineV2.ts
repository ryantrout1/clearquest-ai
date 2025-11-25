import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Pack configurations - only PACK_LE_APPS for now
 */
const PACK_CONFIG = {
  PACK_LE_APPS: {
    id: "PACK_LE_APPS",
    maxAiFollowups: 2,
    requiredFields: ["agency", "position", "monthYear", "outcome", "reason", "issues"],
    priorityOrder: ["monthYear", "outcome", "reason", "issues", "agency", "position"],
    // Map from raw fieldKeys (from FollowUpQuestion entities) to semantic field names
    fieldKeyMap: {
      // Legacy keys (timestamp-based) - these are the actual keys in the database
      "PACK_LE_APPS_Q1": "agency",
      "PACK_LE_APPS_Q1764025170356": "position",
      "PACK_LE_APPS_Q1764025187292": "monthYear",
      "PACK_LE_APPS_Q1764025199138": "outcome",
      "PACK_LE_APPS_Q1764025212764": "reason",
      "PACK_LE_APPS_Q1764025246583": "issues",
      // Semantic keys (if ever used in the future)
      "PACK_LE_APPS_AGENCY": "agency",
      "PACK_LE_APPS_POSITION": "position",
      "PACK_LE_APPS_MONTH_YEAR": "monthYear",
      "PACK_LE_APPS_OUTCOME": "outcome",
      "PACK_LE_APPS_REASON": "reason",
      "PACK_LE_APPS_ISSUES": "issues",
    },
  },
  // other packs will be added later
};

/**
 * Safe string helper
 */
function safe(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Check if a value should be treated as unknown/missing
 * Returns true for empty, null, undefined, or vague responses like "I don't remember"
 * Handles curly apostrophes (e.g., "I don't remember" with U+2019)
 */
function isUnknown(raw) {
  if (raw == null) return true;

  // Normalize to string and clean up whitespace
  let value = String(raw).trim();
  if (!value) return true;

  // Normalize curly apostrophes to straight apostrophes
  // U+2019 (') and U+2018 (') → straight apostrophe (')
  value = value
    .replace(/\u2019/g, "'")
    .replace(/\u2018/g, "'")
    .replace(/\u201C/g, '"')
    .replace(/\u201D/g, '"')
    .toLowerCase();

  // Common "I don't know / I don't remember / unsure" patterns
  const unknownPhrases = [
    "i don't remember",
    "dont remember",
    "i do not remember",
    "don't remember",
    "don't recall",
    "dont recall",
    "i do not recall",
    "i don't recall",
    "not sure",
    "i'm not sure",
    "im not sure",
    "unknown",
    "n/a",
    "na",
    "n.a.",
    "can't remember",
    "cant remember",
    "cannot remember",
    "can't recall",
    "cant recall",
    "cannot recall",
    "unsure",
    "no idea",
    "i don't know",
    "dont know",
    "do not know",
    "idk",
  ];

  // Treat it as unknown if it CONTAINS any of these phrases
  return unknownPhrases.some((phrase) => value.includes(phrase));
}

/**
 * Normalize raw incident answers to semantic field names using pack's fieldKeyMap
 * Returns an object with all required fields initialized to null, then populated from raw answers
 */
function normalizeIncidentAnswers(packConfig, rawAnswers) {
  // Initialize with all required fields as null
  const normalized = {
    agency: null,
    position: null,
    monthYear: null,
    outcome: null,
    reason: null,
    issues: null,
  };
  
  const fieldKeyMap = packConfig.fieldKeyMap || {};
  
  for (const [rawKey, rawValue] of Object.entries(rawAnswers || {})) {
    const semanticField = fieldKeyMap[rawKey];
    if (semanticField) {
      normalized[semanticField] = typeof rawValue === "string" ? rawValue.trim() : rawValue;
    }
  }
  
  return normalized;
}

/**
 * Compute gaps based on pack config and normalized incident answers
 * Returns array of field names that are missing or unknown, ordered by priority
 */
function computeGaps(packConfig, normalizedAnswers, packId) {
  const gaps = [];

  // Explicit handling for PACK_LE_APPS
  // Only monthYear and issues are eligible gaps - never agency, position, outcome, or reason
  if (packId === "PACK_LE_APPS") {
    const incident = normalizedAnswers;

    // Month/year: any "I don't remember" style answer is a gap
    if (isUnknown(incident.monthYear)) {
      gaps.push("monthYear");
    }

    // Issues:
    // - If "No" / "none" / clearly negative → NOT a gap
    // - If "Yes" or vague/unknown → gap (needs clarification)
    if (isUnknown(incident.issues)) {
      gaps.push("issues");
    } else {
      const issuesVal = String(incident.issues).trim().toLowerCase();
      // Only treat as gap if they said "yes" or something affirmative
      if (issuesVal.startsWith("yes") || issuesVal === "maybe" || issuesVal === "possibly") {
        gaps.push("issues");
      }
      // "no", "none", "no issues" etc. are NOT gaps
    }

    return gaps;
  }

  // Fallback for other packs: iterate through priorityOrder
  for (const field of packConfig.priorityOrder) {
    const value = normalizedAnswers[field];
    
    if (isUnknown(value)) {
      gaps.push(field);
    }
  }

  return gaps;
}

/**
 * Generate a targeted probe question based on the gaps
 * Returns null if no useful probe can be generated (caller should use mode="DONE")
 */
function generateProbeQuestion(packId, gaps, normalizedIncident) {
  if (gaps.length === 0) return null;
  
  // PACK_LE_APPS: Only probe for monthYear or issues, never agency/position/outcome/reason
  if (packId === "PACK_LE_APPS") {
    const primaryGap = gaps[0];
    
    if (primaryGap === "monthYear") {
      return "You mentioned you don't remember the month and year you applied for this law enforcement position. Do you recall an approximate month and year for that application, even if it's not exact?";
    }
    
    if (primaryGap === "issues") {
      return "You indicated there may have been issues or concerns during this hiring process. Please describe what those issues or concerns were.";
    }
    
    // Safety: if somehow a different gap slips through, don't ask a redundant question
    return null;
  }
  
  // Fallback for other packs
  const gap = gaps[0];
  switch (gap) {
    case "monthYear":
      return "Do you recall the approximate month and year for this incident?";
    case "outcome":
      return "What was the outcome of this situation?";
    case "reason":
      return "What was the reason given for this outcome?";
    case "issues":
      return "Were there any issues or concerns raised?";
    default:
      return `Can you provide more details about the ${gap}?`;
  }
}

/**
 * ProbeEngineV2 - Standalone AI probing pipeline for Follow-Up Packs
 * 
 * Phase 1: DEBUG_PAYLOAD mode - builds prompts but does NOT call LLM
 */
export default async function probeEngineV2(input, context) {
  const {
    pack_id,
    incident_answers = {},
    previous_probes = [],
    override_max_probes,
    global_probe_instructions,
  } = input;

  // Look up pack config
  const packConfig = PACK_CONFIG[pack_id];
  
  if (!packConfig) {
    return {
      mode: "UNSUPPORTED_PACK",
      message: `ProbeEngineV2 has no config for pack_id=${pack_id}`,
    };
  }

  // Determine max probes
  const maxProbes = override_max_probes || packConfig.maxAiFollowups || 2;
  
  // Count previous probes
  const previousProbeCount = Array.isArray(previous_probes) ? previous_probes.length : 0;
  
  // Normalize raw incident answers to semantic field names
  const rawAnswers = incident_answers || {};
  const normalized = normalizeIncidentAnswers(packConfig, rawAnswers);
  
  console.log('[PROBE_ENGINE_V2] Raw answers:', JSON.stringify(rawAnswers));
  console.log('[PROBE_ENGINE_V2] Normalized answers:', JSON.stringify(normalized));
  
  // Compute gaps using normalized answers
  const gaps = computeGaps(packConfig, normalized, pack_id);

  // Decide mode based on gaps and previousProbeCount
  let mode;
  let question;
  
  if (gaps.length === 0 || previousProbeCount >= maxProbes) {
    // No gaps to fill OR we've hit max probes - done with probing
    mode = "DONE";
    question = "DONE";
  } else {
    // We have gaps and haven't hit max probes - generate a targeted question
    mode = "QUESTION";
    question = generateProbeQuestion(gaps, normalized);
  }
  
  // Debug log for gap analysis
  console.log("[PROBE_ENGINE_V2] GAP ANALYSIS RESULT", {
    pack_id,
    normalizedIncident: normalized,
    gaps,
    previousProbeCount,
    maxProbes,
    mode,
  });

  return {
    mode,
    question,
    pack_id,
    previousProbeCount,
    maxProbes,
    gaps,
    normalizedIncident: normalized,
  };
}

/**
 * Deno serve handler
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const input = await req.json();
    
    // Create context object for future LLM calls
    const context = {
      base44,
      user,
      // invokeLLM will be added here in Phase 2
    };

    const result = await probeEngineV2(input, context);
    
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});