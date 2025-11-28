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
 * Deterministic fallback probes for all PACK_LE_APPS fields.
 * Used when AI/validation fails to ensure probing is rock-solid.
 */
const FALLBACK_PROBES = {
  // Agency field
  "PACK_LE_APPS_Q1": "Since you're not sure of the exact name, please describe the law enforcement agency you applied to. Include anything you remember, such as the city, state, or any identifying details.",
  
  // Position field
  "PACK_LE_APPS_Q1764025170356": "What position were you applying for at that agency? For example, was it a police officer, deputy sheriff, corrections officer, or another role?",
  
  // Application date field
  "PACK_LE_APPS_Q1764025187292": "We need at least an approximate timeframe for this application. Can you give us an estimate, like 'around 2020' or 'early 2019'?",
  
  // Outcome field
  "PACK_LE_APPS_Q1764025199138": "What was the final result of your application? Were you hired, not selected, did you withdraw, or is it still pending?",
  
  // Reason for non-selection field
  "PACK_LE_APPS_Q1764025212764": "Were you given any reason for why you were not selected? This could include failing a test, background issues, or the agency's decision.",
  
  // Issues/concerns field
  "PACK_LE_APPS_Q1764025246583": "You indicated there were issues during this hiring process. Please describe what those issues or concerns were."
};

/**
 * Build a deterministic fallback probe for specific fields when AI/validation fails.
 * This ensures probing is rock-solid even when the backend has issues.
 */
function buildFallbackProbeForField({ packId, fieldKey, semanticField }) {
  // Check if we have a fallback for this specific field key
  if (packId === "PACK_LE_APPS" && FALLBACK_PROBES[fieldKey]) {
    return {
      mode: "QUESTION",
      question: FALLBACK_PROBES[fieldKey],
      isFallback: true,
      probeSource: 'fallback_static'
    };
  }
  
  // Try using semantic field name for fallback
  if (packId === "PACK_LE_APPS" && semanticField) {
    const staticFallback = getStaticFallbackQuestion(semanticField, 0, null, {});
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
      if (!normalized || isUnknownAnswer) {
        console.log(`[V2-PER-FIELD] Validation result: INCOMPLETE (position is empty or unknown)`);
        return "incomplete";
      }
      console.log(`[V2-PER-FIELD] Validation result: COMPLETE (position has valid value)`);
      return "complete";
    
    case "monthYear":
      // Allow approximate dates like "early 2021", "summer 2020", "around 2019"
      // Disallow "I don't remember", "don't know"
      if (!normalized) {
        console.log(`[V2-PER-FIELD] Validation result: INCOMPLETE (monthYear is empty)`);
        return "incomplete";
      }
      if (isUnknownAnswer) {
        console.log(`[V2-PER-FIELD] Validation result: INCOMPLETE (monthYear is unknown)`);
        return "incomplete";
      }
      // Check for any year pattern (4 digits) or approximate terms
      const hasYear = /\b(19|20)\d{2}\b/.test(normalized);
      const hasApproximate = /(early|late|mid|around|about|spring|summer|fall|winter|beginning|end)/i.test(normalized);
      const hasMonth = /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)/i.test(normalized);
      
      if (hasYear || hasMonth || hasApproximate) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (has date indicator)`);
        return "complete";
      }
      // If they gave something but no date indicators, still accept if not "don't know"
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
        "still in process", "pending", "waiting", "ongoing", "in progress"
      ];
      
      const hasValidOutcome = validOutcomes.some(outcome => normalized.includes(outcome));
      if (hasValidOutcome) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (valid outcome found)`);
        return "complete";
      }
      if (isUnknownAnswer) {
        console.log(`[V2-PER-FIELD] Validation result: INCOMPLETE (outcome unknown)`);
        return "incomplete";
      }
      // If they gave something specific, accept it
      if (normalized.length > 5 && !isUnknownAnswer) {
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
      if (!normalized || isUnknownAnswer) {
        console.log(`[V2-PER-FIELD] Validation result: INCOMPLETE (reason is empty or unknown)`);
        return "incomplete";
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
      // Check for unknown answer
      if (isUnknownAnswer) {
        console.log(`[V2-PER-FIELD] Validation result: INCOMPLETE (issues unknown)`);
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
      // Optional field - only probe if relevant to outcome
      // Accept any answer that's not "don't know"
      if (isUnknownAnswer) {
        console.log(`[V2-PER-FIELD] Validation result: INCOMPLETE (stageReached unknown)`);
        return "incomplete";
      }
      if (normalized.length > 0) {
        console.log(`[V2-PER-FIELD] Validation result: COMPLETE (stageReached has value)`);
        return "complete";
      }
      // Empty is acceptable for optional field
      console.log(`[V2-PER-FIELD] Validation result: COMPLETE (optional field)`);
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
 * Get static fallback probe question for a field (used when LLM fails)
 */
function getStaticFallbackQuestion(fieldName, probeCount, currentValue, incidentContext = {}) {
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
 * Field labels for human-readable prompts
 */
const FIELD_LABELS = {
  "agency": "Agency / Department",
  "position": "Position Applied For",
  "monthYear": "Application Date (month/year)",
  "outcome": "Outcome",
  "reason": "Reason for Non-Selection",
  "issues": "Issues or Concerns",
  "stageReached": "Stage Reached in Hiring Process"
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

  // Validate the current field value
  let validationResult = validateField(semanticField, field_value, incident_context);
  console.log(`[V2-PER-FIELD] Validation result for ${semanticField}: ${validationResult}, value="${field_value}"`);

  // OVERRIDE: Force "I don't recall / I don't remember / unknown" answers to need probing
  // This ensures vague answers always trigger AI probing regardless of field-specific validation
  const looksLikeNoRecall = answerLooksLikeNoRecall(field_value);
  if (looksLikeNoRecall && validationResult === "complete") {
    console.log(`[V2-SEMANTIC] Override: answer looks like "no recall" - forcing probe`);
    console.log(`[V2-SEMANTIC] Original validation was "complete", overriding to "incomplete"`);
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
    try {
      user = await base44.auth.me();
    } catch (authError) {
      console.error('[PROBE_ENGINE_V2] Auth error:', authError.message);
      
      // Try to parse input for fallback even if auth fails
      try {
        const bodyText = await req.text();
        const parsed = JSON.parse(bodyText);
        packId = parsed.pack_id;
        fieldKey = parsed.field_key;
      } catch (e) {
        // Ignore parse errors here
      }
      
      const semanticField = packId === "PACK_LE_APPS" && PACK_CONFIG[packId] ? mapFieldKey(PACK_CONFIG[packId], fieldKey) : null;
      const fallback = buildFallbackProbeForField({ packId, fieldKey, semanticField });
      if (fallback) {
        console.log('[PROBE_ENGINE_V2] Auth error → using deterministic fallback probe for field', { packId, fieldKey });
        return Response.json({
          mode: fallback.mode,
          question: fallback.question,
          packId,
          fieldKey,
          isFallback: true,
          error: {
            type: "AUTH_ERROR",
            message: authError.message,
          },
        }, { status: 200 });
      }
      
      return Response.json({ 
        mode: "ERROR",
        error: 'Authentication failed',
        message: authError.message 
      }, { status: 200 });
    }
    
    if (!user) {
      const semanticField = packId === "PACK_LE_APPS" && PACK_CONFIG[packId] ? mapFieldKey(PACK_CONFIG[packId], fieldKey) : null;
      const fallback = buildFallbackProbeForField({ packId, fieldKey, semanticField });
      if (fallback) {
        console.log('[PROBE_ENGINE_V2] No user → using deterministic fallback probe for field', { packId, fieldKey });
        return Response.json({
          mode: fallback.mode,
          question: fallback.question,
          packId,
          fieldKey,
          isFallback: true,
          error: {
            type: "AUTH_ERROR",
            message: "User not authenticated",
          },
        }, { status: 200 });
      }
      
      return Response.json({ 
        mode: "ERROR",
        error: 'Unauthorized',
        message: 'User not authenticated' 
      }, { status: 200 });
    }
    
    let input;
    try {
      input = await req.json();
      packId = input.pack_id;
      fieldKey = input.field_key;
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
    
    // Try fallback probe for this field
    const semanticField = packId === "PACK_LE_APPS" && PACK_CONFIG[packId] ? mapFieldKey(PACK_CONFIG[packId], fieldKey) : null;
      const fallback = buildFallbackProbeForField({ packId, fieldKey, semanticField });
    if (fallback) {
      console.log('[PROBE_ENGINE_V2] Unhandled error → using deterministic fallback probe for field', { packId, fieldKey });
      return Response.json({
        mode: fallback.mode,
        question: fallback.question,
        packId,
        fieldKey,
        isFallback: true,
        error: {
          type: "AI_BACKEND_ERROR",
          message: error.message,
        },
      }, { status: 200 });
    }
    
    return Response.json({ 
      mode: "ERROR",
      error: 'probeEngineV2 failed',
      message: error.message,
      stack: error.stack
    }, { status: 200 });
  }
});