import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Pack configurations - only PACK_LE_APPS for now
 */
const PACK_CONFIG = {
  PACK_LE_APPS: {
    id: "PACK_LE_APPS",
    maxAiFollowups: 2,
    requiredFields: ["agency", "position", "monthYear", "outcome", "reason", "issues", "stageReached"],
    // Priority order for gap progression (top-down)
    priorityOrder: ["monthYear", "position", "agency", "outcome", "reason", "issues", "stageReached"],
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
      "PACK_LE_APPS_STAGE_REACHED": "stageReached",
    },
  },
  // other packs will be added later
};

/**
 * Final question text - mandatory for last probe
 */
const FINAL_QUESTION_TEXT = "Is there anything else about this prior law-enforcement application that you feel is important for us to know?";

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
    stageReached: null,
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
 * Compute gaps based on pack config, normalized incident answers, and already-probed fields
 * Returns array of field names that are missing or unknown, ordered by priority
 * Excludes fields that have already been probed
 */
function computeGaps(packConfig, normalizedAnswers, packId, alreadyProbed = []) {
  const gaps = [];
  const alreadyProbedSet = new Set(alreadyProbed);

  // Explicit handling for PACK_LE_APPS
  if (packId === "PACK_LE_APPS") {
    const incident = normalizedAnswers;
    const priorityOrder = packConfig.priorityOrder;

    // Check each field in priority order
    for (const field of priorityOrder) {
      // Skip if already probed
      if (alreadyProbedSet.has(field)) {
        continue;
      }

      // Check if field is a gap
      if (field === "monthYear") {
        if (isUnknown(incident.monthYear)) {
          gaps.push("monthYear");
        }
      } else if (field === "issues") {
        if (isUnknown(incident.issues)) {
          gaps.push("issues");
        } else {
          const issuesVal = String(incident.issues).trim().toLowerCase();
          // Only treat as gap if they said "yes" or something affirmative
          if (issuesVal.startsWith("yes") || issuesVal === "maybe" || issuesVal === "possibly") {
            gaps.push("issues");
          }
        }
      } else if (field === "position") {
        if (isUnknown(incident.position)) {
          gaps.push("position");
        }
      } else if (field === "agency") {
        if (isUnknown(incident.agency)) {
          gaps.push("agency");
        }
      } else if (field === "outcome") {
        if (isUnknown(incident.outcome)) {
          gaps.push("outcome");
        }
      } else if (field === "reason") {
        if (isUnknown(incident.reason)) {
          gaps.push("reason");
        }
      } else if (field === "stageReached") {
        if (isUnknown(incident.stageReached)) {
          gaps.push("stageReached");
        }
      }
    }

    return gaps;
  }

  // Fallback for other packs: iterate through priorityOrder
  for (const field of packConfig.priorityOrder) {
    // Skip if already probed
    if (alreadyProbedSet.has(field)) {
      continue;
    }
    
    const value = normalizedAnswers[field];
    
    if (isUnknown(value)) {
      gaps.push(field);
    }
  }

  return gaps;
}

/**
 * Generate a targeted probe question based on the target gap field
 * Returns null if no useful probe can be generated
 */
function generateProbeQuestion(packId, targetGap, normalizedIncident) {
  if (!targetGap) return null;
  
  // PACK_LE_APPS: Domain-specific questions for each field
  if (packId === "PACK_LE_APPS") {
    switch (targetGap) {
      case "monthYear":
        return "You mentioned you don't remember the month and year you applied for this law enforcement position. Do you recall an approximate month and year for that application, even if it's not exact?";
      
      case "position":
        return "What specific position or role did you apply for with this law enforcement agency?";
      
      case "agency":
        return "Which law enforcement agency did you apply to? Please provide the full name if you recall it.";
      
      case "outcome":
        return "What was the final outcome of your application with this agency? Were you hired, not selected, or did you withdraw?";
      
      case "reason":
        return "Were you given a reason for why you were not selected or why the process ended? If so, what was it?";
      
      case "issues":
        return "You indicated there may have been issues or concerns during this hiring process. Please describe what those issues or concerns were.";
      
      case "stageReached":
        return "How far did you get in the hiring process? For example, did you complete the written test, background check, interview, polygraph, or another stage?";
      
      default:
        // Safety: if an unknown gap slips through, don't ask
        return null;
    }
  }
  
  // Fallback for other packs
  switch (targetGap) {
    case "monthYear":
      return "Do you recall the approximate month and year for this incident?";
    case "outcome":
      return "What was the outcome of this situation?";
    case "reason":
      return "What was the reason given for this outcome?";
    case "issues":
      return "Were there any issues or concerns raised?";
    default:
      return `Can you provide more details about the ${targetGap}?`;
  }
}

/**
 * Extract already-probed field names from previous_probes array
 * Each probe in previous_probes should have a "targetField" property
 */
function extractAlreadyProbed(previousProbes) {
  if (!Array.isArray(previousProbes)) return [];
  
  const probed = [];
  for (const probe of previousProbes) {
    if (probe && probe.targetField) {
      probed.push(probe.targetField);
    }
  }
  return probed;
}

/**
 * ProbeEngineV2 - Standalone AI probing pipeline for Follow-Up Packs
 * 
 * Features:
 * - No re-asking of already-probed fields
 * - Ordered gap progression (top-down by priority)
 * - Mandatory final question on last probe
 * - Expanded debug payload
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
  
  // Count previous probes and extract already-probed fields
  const previousProbeCount = Array.isArray(previous_probes) ? previous_probes.length : 0;
  const alreadyProbed = extractAlreadyProbed(previous_probes);
  
  // Normalize raw incident answers to semantic field names
  const rawAnswers = incident_answers || {};
  const normalized = normalizeIncidentAnswers(packConfig, rawAnswers);
  
  console.log('[PROBE_ENGINE_V2] Raw answers:', JSON.stringify(rawAnswers));
  console.log('[PROBE_ENGINE_V2] Normalized answers:', JSON.stringify(normalized));
  console.log('[PROBE_ENGINE_V2] Already probed fields:', alreadyProbed);
  
  // Compute gaps using normalized answers, excluding already-probed fields
  const allGaps = computeGaps(packConfig, normalized, pack_id, alreadyProbed);
  
  // The next target gap is the first one in priority order
  const nextTargetGap = allGaps.length > 0 ? allGaps[0] : null;
  
  // Check if this will be the final probe
  const willBeFinalProbe = (previousProbeCount + 1) >= maxProbes;
  
  // Generate probe question
  let question = null;
  let isFinalQuestion = false;
  
  if (willBeFinalProbe && allGaps.length > 0) {
    // Use mandatory final question
    question = FINAL_QUESTION_TEXT;
    isFinalQuestion = true;
  } else if (nextTargetGap) {
    // Generate domain-specific question for the target gap
    question = generateProbeQuestion(pack_id, nextTargetGap, normalized);
  }
  
  // Decide mode based on gaps, question availability, and previousProbeCount
  let mode;
  
  if (!allGaps.length || !question) {
    // No gaps OR no useful probe question - done with probing
    mode = "DONE";
  } else if (previousProbeCount >= maxProbes) {
    // Respect maxProbes limit
    mode = "DONE";
  } else {
    // We have gaps, a valid question, and haven't hit max probes
    mode = "QUESTION";
  }
  
  // Debug log for gap analysis
  console.log("[PROBE_ENGINE_V2] GAP ANALYSIS RESULT", {
    pack_id,
    normalizedIncident: normalized,
    allGaps,
    nextTargetGap,
    alreadyProbed,
    previousProbeCount,
    maxProbes,
    willBeFinalProbe,
    isFinalQuestion,
    mode,
  });

  return {
    mode,
    question: mode === "QUESTION" ? question : "DONE",
    pack_id,
    previousProbeCount,
    maxProbes,
    // Expanded debug payload
    allGaps,
    nextTargetGap,
    alreadyProbed,
    finalQuestion: isFinalQuestion,
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