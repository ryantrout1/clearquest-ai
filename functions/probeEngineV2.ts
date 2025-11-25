import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

const PACK_CONFIG = {
  PACK_LE_APPS: {
    id: "PACK_LE_APPS",
    maxAiFollowups: 3,
    requiredFields: ["agency", "position", "monthYear", "outcome", "reason", "issues", "stageReached"],
    priorityOrder: ["monthYear", "position", "agency", "outcome", "reason", "issues", "stageReached"],
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
    },
  },
};

const FINAL_QUESTION_TEXT = "Is there anything else about this prior law-enforcement application that you feel is important for us to know?";

function isUnknown(raw) {
  if (raw == null) return true;
  let value = String(raw).trim();
  if (!value) return true;
  value = value.replace(/\u2019/g, "'").replace(/\u2018/g, "'").replace(/\u201C/g, '"').replace(/\u201D/g, '"').toLowerCase();
  const unknownPhrases = [ "i don't remember", "dont remember", "i do not remember", "don't remember", "don't recall", "dont recall", "i do not recall", "i don't recall", "not sure", "i'm not sure", "im not sure", "unknown", "n/a", "na", "n.a.", "can't remember", "cant remember", "cannot remember", "can't recall", "cant recall", "cannot recall", "unsure", "no idea", "i don't know", "dont know", "do not know", "idk" ];
  return unknownPhrases.some((phrase) => value.includes(phrase));
}

function normalizeIncidentAnswers(packConfig, rawAnswers) {
  const normalized = {};
  packConfig.requiredFields.forEach(field => {
      normalized[field] = null;
  });
  const fieldKeyMap = packConfig.fieldKeyMap || {};
  for (const [rawKey, rawValue] of Object.entries(rawAnswers || {})) {
    const semanticField = fieldKeyMap[rawKey];
    if (semanticField) {
      normalized[semanticField] = typeof rawValue === "string" ? rawValue.trim() : rawValue;
    }
  }
  return normalized;
}

function computeGaps(packConfig, normalizedAnswers, packId, alreadyProbed = []) {
  const gaps = [];
  const alreadyProbedSet = new Set(alreadyProbed);
  for (const field of packConfig.priorityOrder) {
    if (alreadyProbedSet.has(field)) {
      continue;
    }
    const value = normalizedAnswers[field];
    if (field === "issues") {
      const issuesVal = String(value).trim().toLowerCase();
      if (isUnknown(value) || issuesVal.startsWith("yes") || issuesVal === "maybe" || issuesVal === "possibly") {
        if(!isUnknown(value) && (issuesVal === 'no' || issuesVal === 'none' || issuesVal.includes('no issues'))) {
            // "no" is not a gap
        } else {
            gaps.push("issues");
        }
      }
    } else if (isUnknown(value)) {
      gaps.push(field);
    }
  }
  return gaps;
}

function generateProbeQuestion(packId, targetGap) {
  if (!targetGap) return null;
  if (packId === "PACK_LE_APPS") {
    switch (targetGap) {
      case "monthYear": return "You mentioned you don’t remember the month and year you applied for this law enforcement position. Do you recall an approximate month and year for that application, even if it’s not exact?";
      case "position": return "What specific position or role did you apply for with this law enforcement agency?";
      case "agency": return "Which law enforcement agency did you apply to? Please provide the full name if you recall it.";
      case "outcome": return "What was the final outcome of your application with this agency? Were you hired, not selected, or did you withdraw?";
      case "reason": return "Were you given a reason for why you were not selected or why the process ended? If so, what was it?";
      case "issues": return "You indicated there may have been issues or concerns during this hiring process. Please describe what those issues or concerns were.";
      case "stageReached": return "How far did you get in the hiring process? For example, did you complete the written test, background check, interview, polygraph, or another stage?";
      default: return null;
    }
  }
  return `Can you provide more details about the ${targetGap}?`;
}

export default async function probeEngineV2(input) {
  const { pack_id, incident_answers = {}, previous_probes_count = 0, already_probed_fields = [], override_max_probes } = input;

  const packConfig = PACK_CONFIG[pack_id];
  if (!packConfig) {
    return { mode: "UNSUPPORTED_PACK", message: `ProbeEngineV2 has no config for pack_id=${pack_id}` };
  }

  const maxProbes = override_max_probes || packConfig.maxAiFollowups || 3;
  const previousProbeCount = previous_probes_count;
  const alreadyProbed = already_probed_fields;
  const normalized = normalizeIncidentAnswers(packConfig, incident_answers);
  const allGaps = computeGaps(packConfig, normalized, pack_id, alreadyProbed);
  const nextTargetGap = allGaps[0] || null;

  const willBeFinalProbe = (previousProbeCount + 1) >= maxProbes && allGaps.length > 0;
  
  let question = null;
  let isFinalQuestion = false;

  if (willBeFinalProbe) {
    question = FINAL_QUESTION_TEXT;
    isFinalQuestion = true;
  } else if (nextTargetGap) {
    question = generateProbeQuestion(pack_id, nextTargetGap);
  }

  let mode = "DONE";
  if (question && previousProbeCount < maxProbes) {
      mode = "QUESTION";
  }

  const result = {
    mode,
    question: mode === "QUESTION" ? question : null,
    pack_id,
    previousProbeCount,
    maxProbes,
    allGaps,
    nextTargetGap,
    alreadyProbed: already_probed_fields, // Return what was passed in
    finalQuestion: isFinalQuestion,
    normalizedIncident: normalized,
  };
  
  console.log("[PROBE_ENGINE_V2] GAP ANALYSIS RESULT", result);

  return result;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const input = await req.json();
    const result = await probeEngineV2(input);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});