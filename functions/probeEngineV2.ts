import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * ProbeEngineV2 - Per-Field Probing for PACK_LE_APPS (MVP v0.1)
 * 
 * Features:
 * - Validates each field immediately after deterministic answer
 * - Probes until valid answer or max probes reached
 * - Returns NEXT_FIELD when field is complete
 */

// Default max probes fallback - only used if pack entity doesn't have max_ai_followups set
const DEFAULT_MAX_PROBES_FALLBACK = 3;

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
 * Validate a specific field value for PACK_LE_APPS
 * Returns: "complete", "incomplete", or "invalid"
 */
function validateField(fieldName, value, incidentContext = {}) {
  const normalized = normalizeText(value).toLowerCase();
  
  console.log(`[V2-PER-FIELD] validateField START: field=${fieldName}, raw="${value}", normalized="${normalized}"`);
  
  // CRITICAL: Check isDontKnow FIRST before any field-specific logic
  const isUnknownAnswer = isDontKnow(value);
  console.log(`[V2-PER-FIELD] isDontKnow result: ${isUnknownAnswer}`);
  
  switch (fieldName) {
    case "agency":
      // Cannot be empty or "don't remember"
      if (!normalized || isUnknownAnswer) {
        console.log(`[V2-PER-FIELD] Validation result: INCOMPLETE (agency is empty or unknown)`);
        return "incomplete";
      }
      console.log(`[V2-PER-FIELD] Validation result: COMPLETE (agency has valid value)`);
      return "complete";
    
    case "position":
      // Cannot be empty or "don't remember"
      if (!normalized || isDontKnow(value)) {
        console.log(`[V2-PER-FIELD] Validation result: incomplete (position is empty or unknown)`);
        return "incomplete";
      }
      console.log(`[V2-PER-FIELD] Validation result: complete`);
      return "complete";
    
    case "monthYear":
      // Allow approximate dates like "early 2021", "summer 2020", "around 2019"
      // Disallow "I don't remember", "don't know"
      if (!normalized) {
        console.log(`[V2-PER-FIELD] Validation result: incomplete (monthYear is empty)`);
        return "incomplete";
      }
      if (isDontKnow(value)) {
        console.log(`[V2-PER-FIELD] Validation result: incomplete (monthYear is unknown)`);
        return "incomplete";
      }
      // Check for any year pattern (4 digits) or approximate terms
      const hasYear = /\b(19|20)\d{2}\b/.test(normalized);
      const hasApproximate = /(early|late|mid|around|about|spring|summer|fall|winter|beginning|end)/i.test(normalized);
      const hasMonth = /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)/i.test(normalized);
      
      if (hasYear || hasMonth || hasApproximate) {
        console.log(`[V2-PER-FIELD] Validation result: complete (has date indicator)`);
        return "complete";
      }
      // If they gave something but no date indicators, still accept if not "don't know"
      if (normalized.length > 3) {
        console.log(`[V2-PER-FIELD] Validation result: complete (has content)`);
        return "complete";
      }
      console.log(`[V2-PER-FIELD] Validation result: incomplete (no date found)`);
      return "incomplete";
    
    case "outcome":
      // Must be one of: selected, not selected, withdrew, disqualified, still in process
      const validOutcomes = [
        "selected", "hired", "accepted", "offered",
        "not selected", "rejected", "denied", "unsuccessful", "failed",
        "withdrew", "withdrawn", "pulled out", "decided not to",
        "disqualified", "dq", "removed",
        "still in process", "pending", "waiting", "ongoing", "in progress"
      ];
      
      const hasValidOutcome = validOutcomes.some(outcome => normalized.includes(outcome));
      if (hasValidOutcome) {
        console.log(`[V2-PER-FIELD] Validation result: complete (valid outcome found)`);
        return "complete";
      }
      if (isDontKnow(value)) {
        console.log(`[V2-PER-FIELD] Validation result: incomplete (outcome unknown)`);
        return "incomplete";
      }
      // If they gave something specific, accept it
      if (normalized.length > 5 && !isDontKnow(value)) {
        console.log(`[V2-PER-FIELD] Validation result: complete (has specific content)`);
        return "complete";
      }
      console.log(`[V2-PER-FIELD] Validation result: incomplete (no valid outcome)`);
      return "incomplete";
    
    case "reason":
      // Cannot be empty or "don't remember" unless outcome is "still in process"
      const outcomeValue = normalizeText(incidentContext.outcome).toLowerCase();
      const isStillInProcess = outcomeValue.includes("still") || outcomeValue.includes("pending") || 
                               outcomeValue.includes("waiting") || outcomeValue.includes("ongoing");
      
      if (isStillInProcess) {
        // Reason is optional for ongoing processes
        console.log(`[V2-PER-FIELD] Validation result: complete (still in process, reason optional)`);
        return "complete";
      }
      if (!normalized || isDontKnow(value)) {
        console.log(`[V2-PER-FIELD] Validation result: incomplete (reason is empty or unknown)`);
        return "incomplete";
      }
      console.log(`[V2-PER-FIELD] Validation result: complete`);
      return "complete";
    
    case "issues":
      // If "no" → complete; if "yes" → need to probe for issue type
      if (normalized === "no" || normalized.includes("no issues") || normalized.includes("none") || normalized === "n") {
        console.log(`[V2-PER-FIELD] Validation result: complete (no issues)`);
        return "complete";
      }
      if (normalized === "yes" || normalized === "y") {
        // They said yes but didn't describe the issues
        console.log(`[V2-PER-FIELD] Validation result: incomplete (yes but no description)`);
        return "incomplete";
      }
      // If they gave a description, it's complete
      if (normalized.length > 10) {
        console.log(`[V2-PER-FIELD] Validation result: complete (has description)`);
        return "complete";
      }
      console.log(`[V2-PER-FIELD] Validation result: incomplete`);
      return "incomplete";
    
    case "stageReached":
      // Optional field - only probe if relevant to outcome
      // Accept any answer that's not "don't know"
      if (isDontKnow(value)) {
        console.log(`[V2-PER-FIELD] Validation result: incomplete (stageReached unknown)`);
        return "incomplete";
      }
      if (normalized.length > 0) {
        console.log(`[V2-PER-FIELD] Validation result: complete`);
        return "complete";
      }
      // Empty is acceptable for optional field
      console.log(`[V2-PER-FIELD] Validation result: complete (optional field)`);
      return "complete";
    
    default:
      // Unknown field - accept any non-empty value
      if (normalized.length > 0 && !isDontKnow(value)) {
        return "complete";
      }
      return "incomplete";
  }
}

/**
 * Generate a probe question for a specific incomplete field
 */
function generateFieldProbeQuestion(fieldName, currentValue, probeCount, incidentContext = {}) {
  console.log(`[V2-PER-FIELD] Generating probe for ${fieldName} (probe #${probeCount + 1})`);
  
  const isFirstProbe = probeCount === 0;
  
  switch (fieldName) {
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
    
    default:
      return `Can you provide more details about ${fieldName}?`;
  }
}

/**
 * Map raw field key to semantic field name
 */
function mapFieldKey(packConfig, rawFieldKey) {
  return packConfig.fieldKeyMap[rawFieldKey] || rawFieldKey;
}

/**
 * Main probe engine function - Per-Field Mode
 */
async function probeEngineV2(input, base44Client) {
  const {
    pack_id,
    field_key,                    // The specific field being validated
    field_value,                  // The value provided for this field
    previous_probes_count = 0,    // How many times we've probed this field
    incident_context = {},        // Other field values for context
    mode: requestMode = "VALIDATE_FIELD"  // VALIDATE_FIELD or LEGACY
  } = input;

  console.log(`[V2-PER-FIELD] Starting validation for pack=${pack_id}, field=${field_key}, value="${field_value}", probes=${previous_probes_count}, mode=${requestMode}`);

  const packConfig = PACK_CONFIG[pack_id];
  if (!packConfig) {
    console.log(`[V2-PER-FIELD] No pack config found for ${pack_id}`);
    return { 
      mode: "UNSUPPORTED_PACK", 
      message: `ProbeEngineV2 has no config for pack_id=${pack_id}` 
    };
  }

  // Map raw field key to semantic name
  const semanticField = mapFieldKey(packConfig, field_key);
  console.log(`[V2-PER-FIELD] Mapped ${field_key} → ${semanticField}`);

  // Fetch max_ai_followups from FollowUpPack entity - SINGLE SOURCE OF TRUTH
  let maxProbesPerField = DEFAULT_MAX_PROBES_FALLBACK;
  try {
    const followUpPacks = await base44Client.entities.FollowUpPack.filter({
      followup_pack_id: pack_id
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
      console.log(`[V2-PER-FIELD] No FollowUpPack entity found for ${pack_id}, using fallback: ${maxProbesPerField}`);
    }
  } catch (err) {
    console.warn(`[V2-PER-FIELD] Error fetching FollowUpPack entity, using fallback: ${maxProbesPerField}`, err.message);
  }

  // Validate the current field value
  const validationResult = validateField(semanticField, field_value, incident_context);
  console.log(`[V2-PER-FIELD] Validation result for ${semanticField}: ${validationResult}, value="${field_value}"`);

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
      message: `Field ${semanticField} validated successfully`
    };
  }

  // Field is incomplete - generate probe question
  const question = generateFieldProbeQuestion(semanticField, field_value, previous_probes_count, incident_context);
  console.log(`[V2-PER-FIELD] Field ${semanticField} incomplete → returning QUESTION mode with: "${question}"`);

  return {
    mode: "QUESTION",
    pack_id,
    field_key,
    semanticField,
    question,
    validationResult: "incomplete",
    previousProbeCount: previous_probes_count,
    maxProbesPerField,
    message: `Probing for more information about ${semanticField}`
  };
}

/**
 * Deno serve handler
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Auth check with graceful failure
    let user;
    try {
      user = await base44.auth.me();
    } catch (authError) {
      console.error('[PROBE_ENGINE_V2] Auth error:', authError.message);
      return Response.json({ 
        mode: "ERROR",
        error: 'Authentication failed',
        message: authError.message 
      }, { status: 200 }); // Return 200 so frontend handles gracefully
    }
    
    if (!user) {
      return Response.json({ 
        mode: "ERROR",
        error: 'Unauthorized',
        message: 'User not authenticated' 
      }, { status: 200 }); // Return 200 so frontend handles gracefully
    }
    
    let input;
    try {
      input = await req.json();
    } catch (parseError) {
      console.error('[PROBE_ENGINE_V2] JSON parse error:', parseError.message);
      return Response.json({ 
        mode: "ERROR",
        error: 'Invalid request body',
        message: parseError.message 
      }, { status: 200 });
    }
    
    console.log('[PROBE_ENGINE_V2] Request received:', JSON.stringify(input));
    
    const result = await probeEngineV2(input, base44);
    console.log('[PROBE_ENGINE_V2] Response:', JSON.stringify(result));
    
    return Response.json(result);
  } catch (error) {
    // CRITICAL: Return 200 with error status, NOT 500
    // This allows frontend to handle the failure gracefully
    console.error('[PROBE_ENGINE_V2] Unhandled error:', error.message, error.stack);
    return Response.json({ 
      mode: "ERROR",
      error: 'probeEngineV2 failed',
      message: error.message,
      stack: error.stack
    }, { status: 200 }); // Return 200 so frontend handles gracefully
  }
});