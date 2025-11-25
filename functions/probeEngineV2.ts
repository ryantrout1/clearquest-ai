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
 */
function isUnknown(value) {
  if (value === null || value === undefined) return true;
  if (typeof value !== "string") return false;
  
  const v = value.trim().toLowerCase();
  if (!v) return true;
  
  // Treat these as unknown responses
  const UNKNOWN_PATTERNS = [
    "i don't remember",
    "i dont remember",
    "don't remember",
    "dont remember",
    "i don't recall",
    "i dont recall",
    "don't recall",
    "dont recall",
    "not sure",
    "unsure",
    "unknown",
    "n/a",
    "na",
    "idk",
    "i don't know",
    "i dont know",
    "don't know",
    "dont know",
    "can't remember",
    "cant remember",
    "can't recall",
    "cant recall",
    "cannot remember",
    "cannot recall",
  ];
  
  return UNKNOWN_PATTERNS.includes(v);
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
function computeGaps(packConfig, normalizedAnswers) {
  const gaps = [];

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
 */
function generateProbeQuestion(gaps, normalizedIncident) {
  if (gaps.length === 0) return "DONE";
  
  // Single gap - generate specific question
  if (gaps.length === 1) {
    const gap = gaps[0];
    switch (gap) {
      case "monthYear":
        return "You mentioned you don't remember the month and year you applied for this law enforcement position. Do you recall an approximate month and year for that application, even if it's not exact?";
      case "agency":
        return "Which law enforcement agency did you apply to? Please provide the name of the department.";
      case "position":
        return "What position did you apply for at this agency?";
      case "outcome":
        return "What was the outcome of your application? Were you hired, not selected, or did the process end for another reason?";
      case "reason":
        return "Did the agency tell you why you were not selected or why the process ended?";
      case "issues":
        return "Were there any issues or concerns raised during the hiring process that you're aware of?";
      default:
        return `Can you provide more details about the ${gap} for this application?`;
    }
  }
  
  // Multiple gaps - general follow-up
  const gapDescriptions = gaps.map(g => {
    switch (g) {
      case "monthYear": return "approximate dates";
      case "outcome": return "the outcome";
      case "reason": return "the reason given";
      case "issues": return "any issues raised";
      case "agency": return "the agency name";
      case "position": return "the position";
      default: return g;
    }
  });
  
  return `Before we move on, is there anything else you can recall that would help clarify the details of this application? Specifically, we're missing information about: ${gapDescriptions.join(", ")}.`;
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
  const gaps = computeGaps(packConfig, normalized);

  // Early exit: max probes reached or no gaps
  if (previousProbeCount >= maxProbes || gaps.length === 0) {
    return {
      mode: "DONE",
      question: "DONE",
      pack_id,
      previousProbeCount,
      maxProbes,
      gaps,
    };
  }

  // Build global probe instructions
  const globalProbe = safe(global_probe_instructions) || `
You are the ClearQuest AI Background Investigator.
Your ONLY job is to help a human background investigator by asking a SMALL number
of precise follow-up questions about ONE incident at a time.
Follow all date rules, gap prioritization, and output rules defined in the full
global probing prompt configured in this system.
`.trim();

  // Build pack-specific probe instructions
  const packProbe = safe(incident_answers.__pack_probe_instructions) || `
PACK PROBE INSTRUCTIONS (Law Enforcement Applications):

Focus only on this one prior law enforcement application.

Required elements: agency, position, month/year, outcome, reason, issues/concerns.

Never ask for exact calendar dates, only month/year.

Ask only for missing or unclear information needed to make the story clear.

When you reach the final allowed probe, you MUST ask:
"Is there anything else about this prior law-enforcement application that you feel is important for us to know?"
`.trim();

  // Build system prompt
  const systemPrompt = [
    globalProbe,
    "",
    "-----",
    packProbe,
  ].join("\n");

  // Build user message
  const userMessage = [
    "INCIDENT CONTEXT (DETERMINISTIC ANSWERS):",
    JSON.stringify(incident_answers, null, 2),
    "",
    "PREVIOUS AI PROBES FOR THIS INCIDENT:",
    JSON.stringify(previous_probes, null, 2),
    "",
    "GAPS (ORDERED FROM HIGHEST PRIORITY TO LOWEST):",
    JSON.stringify(gaps, null, 2),
    "",
    "PACK CONFIG:",
    JSON.stringify(
      { pack_id, maxAiFollowups: maxProbes, previousProbeCount },
      null,
      2
    ),
    "",
    "REMINDER:",
    "• Ask at most ONE follow-up question now, or respond with DONE.",
    "• Choose the highest-priority remaining gap.",
    "• Follow the date rule (month/year only).",
  ].join("\n");

  // DEBUG MODE: Return payload for inspection (no LLM call)
  return {
    mode: "DEBUG_PAYLOAD",
    pack_id,
    previousProbeCount,
    maxProbes,
    gaps,
    rawAnswers,
    normalized,
    systemPrompt,
    userMessage,
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