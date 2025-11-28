/**
 * Semantic Validator for Follow-Up Fields
 * 
 * Validates candidate answers against field-specific rules to ensure
 * only meaningful values become facts. Rejects invalid tokens and
 * handles unknown/vague responses appropriately.
 */

import { FOLLOWUP_PACK_CONFIGS } from "./followupPackConfig";

/**
 * @typedef {"valid" | "unknown" | "invalid"} ValidationStatus
 */

/**
 * @typedef {Object} SemanticValidationResult
 * @property {ValidationStatus} status - "valid", "unknown", or "invalid"
 * @property {string} normalizedValue - The normalized/cleaned value
 * @property {string} [reason] - Reason for invalid status
 * @property {boolean} [isEmpty] - True if value is empty
 * @property {boolean} [isNoRecall] - True if value indicates "I don't know/recall"
 */

/**
 * Normalizes text by replacing curly quotes and trimming whitespace
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
 * Detects "I don't know / don't recall / not sure / unknown" style answers.
 * This is GLOBAL and should be used for all packs.
 */
export function answerLooksLikeNoRecall(rawAnswer) {
  const normalized = normalizeText(rawAnswer).toLowerCase();

  if (!normalized) return false;

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
    "im not sure",
    "don't know",
    "dont know",
    "don't recall",
    "dont recall",
    "don't remember",
    "dont remember"
  ];

  const result = patterns.some(p => normalized.includes(p));
  if (result) {
    console.log(`[V2-SEMANTIC] answerLooksLikeNoRecall(frontend):`, {
      raw: rawAnswer,
      normalized,
      result
    });
  }
  return result;
}

/**
 * Validates a follow-up field value against semantic rules
 * 
 * @param {Object} params
 * @param {string} params.packId - Pack identifier (e.g., "PACK_LE_APPS")
 * @param {string} params.fieldKey - Field key (e.g., "PACK_LE_APPS_Q1")
 * @param {string} params.rawValue - The candidate's raw answer
 * @returns {SemanticValidationResult}
 */
export function validateFollowupValue({ packId, fieldKey, rawValue }) {
  const packConfig = FOLLOWUP_PACK_CONFIGS[packId];
  const value = normalizeText(rawValue);
  const lower = value.toLowerCase();
  
  // Compute semantic flags FIRST (global, pack-agnostic)
  const isEmpty = !value;
  const isNoRecall = answerLooksLikeNoRecall(rawValue);
  
  console.log(`[V2-SEMANTIC] validateFollowupValue`, {
    packId,
    fieldKey,
    rawValue,
    isEmpty,
    isNoRecall
  });
  
  // If no pack config, still apply global semantic rules
  if (!packConfig) {
    // Apply global "no recall" rule
    if (isEmpty) {
      return { status: "unknown", normalizedValue: "", isEmpty: true, isNoRecall: false };
    }
    if (isNoRecall) {
      return { status: "unknown", normalizedValue: value, isEmpty: false, isNoRecall: true };
    }
    return { status: "valid", normalizedValue: value, isEmpty: false, isNoRecall: false };
  }

  const fieldConfig = packConfig.fields?.find(f => f.fieldKey === fieldKey);
  
  // If no field config or no validation rules, apply global semantic rules
  if (!fieldConfig || !fieldConfig.validation) {
    if (isEmpty) {
      return { status: "unknown", normalizedValue: "", isEmpty: true, isNoRecall: false };
    }
    if (isNoRecall) {
      return { status: "unknown", normalizedValue: value, isEmpty: false, isNoRecall: true };
    }
    return { status: "valid", normalizedValue: value, isEmpty: false, isNoRecall: false };
  }

  const v = fieldConfig.validation;

  // Handle empty values
  if (isEmpty) {
    if (v.allowUnknown) {
      return { status: "unknown", normalizedValue: value, isEmpty: true, isNoRecall: false };
    }
    return { status: "invalid", reason: "empty", isEmpty: true, isNoRecall: false };
  }

  // GLOBAL: Check for "no recall" patterns BEFORE field-specific rules
  // This ensures "I don't recall" triggers probing for ALL packs
  if (isNoRecall) {
    console.log(`[V2-SEMANTIC] Global "no recall" detected → status="unknown"`);
    return { status: "unknown", normalizedValue: value, isEmpty: false, isNoRecall: true };
  }

  // Check for unknown tokens (e.g., "I don't recall", "idk")
  const unknownTokens = v.unknownTokens || [];
  if (unknownTokens.includes(lower)) {
    if (v.allowUnknown) {
      return { status: "unknown", normalizedValue: value, isEmpty: false, isNoRecall: false };
    }
    return { status: "invalid", reason: "unknown_token_not_allowed", isEmpty: false, isNoRecall: false };
  }

  // Check for reject tokens (e.g., "nothing", "n/a")
  const rejectTokens = v.rejectTokens || [];
  if (rejectTokens.includes(lower)) {
    return { status: "invalid", reason: "rejected_token", isEmpty: false, isNoRecall: false };
  }

  // Minimum length check
  if (typeof v.minLength === "number" && value.length < v.minLength) {
    return { status: "invalid", reason: "too_short", isEmpty: false, isNoRecall: false };
  }

  // Must contain letters check
  if (v.mustContainLetters) {
    if (!/[a-zA-Z]/.test(value)) {
      return { status: "invalid", reason: "no_letters", isEmpty: false, isNoRecall: false };
    }
  }

  // Pattern match check
  if (v.pattern) {
    try {
      const re = new RegExp(v.pattern);
      if (!re.test(value)) {
        return { status: "invalid", reason: "pattern_mismatch", isEmpty: false, isNoRecall: false };
      }
    } catch (err) {
      // Invalid regex - skip pattern check
      console.warn(`Invalid regex pattern for ${fieldKey}:`, v.pattern);
    }
  }

  // Type-specific validation
  switch (v.type) {
    case "agency_name":
    case "job_title":
    case "reason_text":
      // Already covered by length + letters checks
      return { status: "valid", normalizedValue: value, isEmpty: false, isNoRecall: false };

    case "month_year":
      // Require at least some digits for dates
      if (!/[0-9]/.test(value)) {
        return { status: "invalid", reason: "no_digits_for_date", isEmpty: false, isNoRecall: false };
      }
      return { status: "valid", normalizedValue: value, isEmpty: false, isNoRecall: false };

    case "outcome":
      // Accept common outcome values
      return { status: "valid", normalizedValue: value, isEmpty: false, isNoRecall: false };

    case "yes_no":
      // Normalize yes/no inputs
      if (["yes", "y"].includes(lower)) {
        return { status: "valid", normalizedValue: "yes", isEmpty: false, isNoRecall: false };
      }
      if (["no", "n", "none", "n/a", "na"].includes(lower)) {
        return { status: "valid", normalizedValue: "no", isEmpty: false, isNoRecall: false };
      }
      // For this field type, other values are still valid
      return { status: "valid", normalizedValue: value, isEmpty: false, isNoRecall: false };

    case "free_text":
    default:
      return { status: "valid", normalizedValue: value, isEmpty: false, isNoRecall: false };
  }
}