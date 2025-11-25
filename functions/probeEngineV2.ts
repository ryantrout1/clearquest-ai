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
      "PACK_LE_APPS_AGENCY": "agency",
      "PACK_LE_APPS_POSITION": "position",
      "PACK_LE_APPS_MONTH_YEAR": "monthYear",
      "PACK_LE_APPS_OUTCOME": "outcome",
      "PACK_LE_APPS_REASON": "reason",
      "PACK_LE_APPS_ISSUES": "issues",
      // Legacy keys (timestamp-based) for backward compatibility
      "PACK_LE_APPS_Q1": "agency",
      "PACK_LE_APPS_Q1764025170356": "position",
      "PACK_LE_APPS_Q1764025187292": "monthYear",
      "PACK_LE_APPS_Q1764025199138": "outcome",
      "PACK_LE_APPS_Q1764025212764": "reason",
      "PACK_LE_APPS_Q1764025246583": "issues",
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
 * Normalize raw incident answers to semantic field names using pack's fieldKeyMap
 */
function normalizeIncidentAnswers(packConfig, rawAnswers) {
  const normalized = {};
  const fieldKeyMap = packConfig.fieldKeyMap || {};
  
  for (const [rawKey, rawValue] of Object.entries(rawAnswers)) {
    const semanticField = fieldKeyMap[rawKey];
    if (semanticField) {
      normalized[semanticField] = rawValue;
    }
  }
  
  return normalized;
}

/**
 * Check if a value represents "don't remember" or similar vague response
 */
function isDontRemember(value) {
  const v = safe(value).toLowerCase();
  return /^(i?\s*don'?t\s*remember|dont\s*remember|not\s*sure|idk|n\/a|na|unknown|can'?t\s*recall|cannot\s*recall)$/i.test(v);
}

/**
 * Compute gaps based on pack config and normalized incident answers
 * Returns array of { field, reason } ordered by priority
 */
function computeGaps(packConfig, normalizedAnswers) {
  const gaps = [];

  for (const field of packConfig.priorityOrder) {
    const value = safe(normalizedAnswers[field]);
    
    if (!value) {
      gaps.push({ field, reason: "missing" });
    } else if (field === "monthYear" && isDontRemember(value)) {
      // monthYear specifically should flag "don't remember" as vague
      gaps.push({ field, reason: "vague" });
    }
    // Note: "No" in issues is NOT considered missing - it's a valid answer
  }

  return gaps;
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