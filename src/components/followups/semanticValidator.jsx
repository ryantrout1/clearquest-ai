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
 */

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
  
  // If no pack config, treat as valid (non-configured packs pass through)
  if (!packConfig) {
    return { status: "valid", normalizedValue: rawValue ?? "" };
  }

  const fieldConfig = packConfig.fields.find(f => f.fieldKey === fieldKey);
  
  // If no field config or no validation rules, treat as valid
  if (!fieldConfig || !fieldConfig.validation) {
    return { status: "valid", normalizedValue: rawValue ?? "" };
  }

  const v = fieldConfig.validation;
  const value = (rawValue || "").trim();
  const lower = value.toLowerCase();

  // Handle empty values
  if (!value) {
    if (v.allowUnknown) {
      return { status: "unknown", normalizedValue: value };
    }
    return { status: "invalid", reason: "empty" };
  }

  // Check for unknown tokens (e.g., "I don't recall", "idk")
  const unknownTokens = v.unknownTokens || [];
  if (unknownTokens.includes(lower)) {
    if (v.allowUnknown) {
      return { status: "unknown", normalizedValue: value };
    }
    return { status: "invalid", reason: "unknown_token_not_allowed" };
  }

  // Check for reject tokens (e.g., "nothing", "n/a")
  const rejectTokens = v.rejectTokens || [];
  if (rejectTokens.includes(lower)) {
    return { status: "invalid", reason: "rejected_token" };
  }

  // Minimum length check
  if (typeof v.minLength === "number" && value.length < v.minLength) {
    return { status: "invalid", reason: "too_short" };
  }

  // Must contain letters check
  if (v.mustContainLetters) {
    if (!/[a-zA-Z]/.test(value)) {
      return { status: "invalid", reason: "no_letters" };
    }
  }

  // Pattern match check
  if (v.pattern) {
    try {
      const re = new RegExp(v.pattern);
      if (!re.test(value)) {
        return { status: "invalid", reason: "pattern_mismatch" };
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
      return { status: "valid", normalizedValue: value };

    case "month_year":
      // Require at least some digits for dates
      if (!/[0-9]/.test(value)) {
        return { status: "invalid", reason: "no_digits_for_date" };
      }
      return { status: "valid", normalizedValue: value };

    case "outcome":
      // Accept common outcome values
      return { status: "valid", normalizedValue: value };

    case "yes_no":
      // Normalize yes/no inputs
      if (["yes", "y"].includes(lower)) {
        return { status: "valid", normalizedValue: "yes" };
      }
      if (["no", "n", "none", "n/a", "na"].includes(lower)) {
        return { status: "valid", normalizedValue: "no" };
      }
      // For this field type, other values are still valid
      return { status: "valid", normalizedValue: value };

    case "free_text":
    default:
      return { status: "valid", normalizedValue: value };
  }
}

/**
 * Get field validation config for a specific field
 * 
 * @param {string} packId 
 * @param {string} fieldKey 
 * @returns {Object|null} The validation config or null
 */
export function getFieldValidation(packId, fieldKey) {
  const packConfig = FOLLOWUP_PACK_CONFIGS[packId];
  if (!packConfig) return null;
  
  const fieldConfig = packConfig.fields.find(f => f.fieldKey === fieldKey);
  return fieldConfig?.validation || null;
}

/**
 * Check if a field has semantic validation enabled
 * 
 * @param {string} packId 
 * @param {string} fieldKey 
 * @returns {boolean}
 */
export function hasSemanticValidation(packId, fieldKey) {
  const validation = getFieldValidation(packId, fieldKey);
  return validation !== null;
}