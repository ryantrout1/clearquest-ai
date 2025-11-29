/**
 * Centralized Follow-Up Pack Configuration
 * 
 * This module defines the structure and behavior of follow-up packs,
 * including field definitions, skip logic, AI probing controls, and display settings.
 */

/**
 * @typedef {Object} SkipRule
 * @property {string} whenField - semanticKey of another field in the same pack
 * @property {string} [equals] - Skip when field equals this value
 * @property {string} [notEquals] - Skip when field does not equal this value
 * @property {"skip"} then - Action to take
 */

/**
 * Default unknown tokens used to detect vague/unresolved answers
 */
export const DEFAULT_UNKNOWN_TOKENS = [
  "i don't recall",
  "i dont recall",
  "i don't know",
  "i dont know",
  "i can't recall",
  "i cant recall",
  "i don't remember",
  "i dont remember",
  "can't recall",
  "cant recall",
  "idk",
  "unknown",
  "not sure"
];

/**
 * Default reject tokens - values that should never become facts
 */
export const DEFAULT_REJECT_TOKENS = [
  "nothing",
  "none",
  "n/a",
  "na"
];

/**
 * @typedef {"agency_name"|"job_title"|"month_year"|"outcome"|"reason_text"|"yes_no"|"free_text"} SemanticValidationType
 */

/**
 * @typedef {Object} FieldValidationConfig
 * @property {SemanticValidationType} type - Type of semantic validation
 * @property {boolean} [allowUnknown] - If true, unknown answers become facts with status="unknown"
 * @property {string[]} [unknownTokens] - Phrases treated as "unknown / no recall"
 * @property {string[]} [rejectTokens] - Phrases that should be explicitly rejected as invalid facts
 * @property {number} [minLength] - Minimum length for a valid fact (after trimming)
 * @property {boolean} [mustContainLetters] - If true, value must contain at least one letter A-Z
 * @property {string} [pattern] - Optional regex pattern to match valid format
 */

/**
 * @typedef {Object} FollowUpFieldConfig
 * @property {string} fieldKey - Raw key from backend, e.g. "PACK_LE_APPS_Q1"
 * @property {string} semanticKey - Human-readable key like "agency", "position"
 * @property {string} label - Investigator-friendly label for display
 * @property {"text"|"textarea"|"month_year"|"date"|"number"|"yes_no"|"select_single"} inputType
 * @property {string} [placeholder] - Input placeholder text
 * @property {string} [helpText] - Help text for the field
 * @property {boolean} [required] - Whether field is required
 * @property {string[]} [options] - Options for select/yes_no fields
 * @property {SkipRule[]} [skipWhen] - Skip logic rules
 * @property {boolean} [aiProbingEnabled] - Whether AI probing is enabled for this field
 * @property {number} [maxProbes] - Maximum number of AI probe attempts
 * @property {string} [probeInstructionOverride] - Custom AI probe instructions
 * @property {boolean} [includeInFacts] - Show in FACTS panel
 * @property {number} [factsOrder] - Order in FACTS panel
 * @property {boolean} [includeInInstanceHeader] - Show in instance header/summary line
 * @property {number} [headerOrder] - Order in instance header
 * @property {boolean} [includeInNarrative] - Include in narrative summary
 * @property {boolean} [allowUnknown] - If true, unknown is allowed as a final state
 * @property {string[]} [unknownTokens] - Phrases treated as "unknown"
 * @property {string} [unknownDisplayLabel] - What to display in FACTS when unresolved
 * @property {FieldValidationConfig} [validation] - Semantic validation rules for the field
 */

/**
 * @typedef {Object} FollowUpPackConfig
 * @property {string} packId - Pack identifier, e.g. "PACK_LE_APPS"
 * @property {string[]} supportedBaseQuestions - Base questions that trigger this pack
 * @property {string} [instancesLabel] - Label for instances, e.g. "Applications"
 * @property {FollowUpFieldConfig[]} fields - Field configurations
 * @property {number} [maxAiFollowups] - Maximum number of AI follow-up questions for the pack
 * @property {boolean} [requiresCompletion] - Whether pack requires completion
 * @property {"none"|"note"|"warning"|"red_flag"} [flagOnUnresolved] - How to flag unresolved fields
 * @property {boolean} [usePerFieldProbing] - Whether to use V2 per-field probing for this pack
 */

/** @type {Record<string, FollowUpPackConfig>} */
export const FOLLOWUP_PACK_CONFIGS = {
  "PACK_INTEGRITY_APPS": {
    packId: "PACK_INTEGRITY_APPS",
    supportedBaseQuestions: ["Q002"],
    instancesLabel: "Integrity Issues",
    maxAiFollowups: 3,
    requiresCompletion: true,
    flagOnUnresolved: "red_flag",
    usePerFieldProbing: true,
    fields: [
      {
        fieldKey: "PACK_INTEGRITY_APPS_AGENCY",
        semanticKey: "agency",
        label: "Agency",
        inputType: "text",
        placeholder: "Enter agency name",
        required: true,
        aiProbingEnabled: true,
        includeInFacts: true,
        factsOrder: 1,
        includeInInstanceHeader: true,
        headerOrder: 1,
        includeInNarrative: true,
        allowUnknown: true,
        unknownTokens: DEFAULT_UNKNOWN_TOKENS,
        unknownDisplayLabel: "Not recalled after probing",
        validation: {
          type: "agency_name",
          allowUnknown: true,
          unknownTokens: DEFAULT_UNKNOWN_TOKENS,
          rejectTokens: DEFAULT_REJECT_TOKENS,
          minLength: 2,
          mustContainLetters: true
        }
      },
      {
        fieldKey: "PACK_INTEGRITY_APPS_STAGE",
        semanticKey: "stage",
        label: "Application Stage",
        inputType: "select_single",
        placeholder: "Select stage",
        options: ["Background", "Written Test", "Interview", "Polygraph", "Psych", "Documents", "Other"],
        required: true,
        aiProbingEnabled: false,
        includeInFacts: true,
        factsOrder: 2,
        includeInInstanceHeader: true,
        headerOrder: 2,
        includeInNarrative: true,
        allowUnknown: false,
        validation: {
          type: "outcome",
          allowUnknown: false,
          minLength: 2,
          mustContainLetters: true
        }
      },
      {
        fieldKey: "PACK_INTEGRITY_APPS_INCIDENT_TYPE",
        semanticKey: "incident_type",
        label: "Integrity Issue Type",
        inputType: "select_single",
        placeholder: "Select type",
        options: ["Omission", "False Statement", "Cheating", "Misrepresentation", "False Document", "Other"],
        required: true,
        aiProbingEnabled: false,
        includeInFacts: true,
        factsOrder: 3,
        includeInInstanceHeader: false,
        includeInNarrative: true,
        allowUnknown: false,
        validation: {
          type: "outcome",
          allowUnknown: false,
          minLength: 2,
          mustContainLetters: true
        }
      },
      {
        fieldKey: "PACK_INTEGRITY_APPS_CONDUCT_DESC",
        semanticKey: "conduct_description",
        label: "What Happened (Summary)",
        inputType: "textarea",
        placeholder: "Describe what happened",
        required: true,
        aiProbingEnabled: true,
        includeInFacts: true,
        factsOrder: 4,
        includeInInstanceHeader: false,
        includeInNarrative: true,
        allowUnknown: true,
        unknownTokens: DEFAULT_UNKNOWN_TOKENS,
        unknownDisplayLabel: "Not described after probing",
        validation: {
          type: "free_text",
          allowUnknown: true,
          unknownTokens: DEFAULT_UNKNOWN_TOKENS,
          minLength: 5,
          mustContainLetters: true
        }
      },
      {
        fieldKey: "PACK_INTEGRITY_APPS_INTENT",
        semanticKey: "intent",
        label: "Was this intentional?",
        inputType: "select_single",
        placeholder: "Select",
        options: ["Yes", "No", "Unsure", "Did not say"],
        required: true,
        aiProbingEnabled: false,
        includeInFacts: true,
        factsOrder: 5,
        includeInInstanceHeader: false,
        includeInNarrative: true,
        allowUnknown: false,
        validation: {
          type: "outcome",
          allowUnknown: false,
          minLength: 2,
          mustContainLetters: true
        }
      },
      {
        fieldKey: "PACK_INTEGRITY_APPS_DATE",
        semanticKey: "date",
        label: "Approximate Date",
        inputType: "month_year",
        placeholder: "e.g., June 2020",
        required: true,
        aiProbingEnabled: true,
        probeInstructionOverride: "The candidate gave a vague date. Ask for at least an approximate timeframe like 'around 2020' or 'early 2019'.",
        includeInFacts: true,
        factsOrder: 6,
        includeInInstanceHeader: true,
        headerOrder: 3,
        includeInNarrative: true,
        allowUnknown: true,
        unknownTokens: DEFAULT_UNKNOWN_TOKENS,
        unknownDisplayLabel: "Not recalled after probing",
        validation: {
          type: "month_year",
          allowUnknown: true,
          unknownTokens: DEFAULT_UNKNOWN_TOKENS,
          minLength: 3,
          mustContainLetters: false
        }
      },
      {
        fieldKey: "PACK_INTEGRITY_APPS_DISCOVERY",
        semanticKey: "discovery_method",
        label: "How It Was Discovered",
        inputType: "text",
        placeholder: "E.g., background investigator, polygraph",
        required: false,
        aiProbingEnabled: true,
        includeInFacts: true,
        factsOrder: 7,
        includeInInstanceHeader: false,
        includeInNarrative: true,
        allowUnknown: true,
        unknownTokens: DEFAULT_UNKNOWN_TOKENS,
        unknownDisplayLabel: "Unknown",
        validation: {
          type: "free_text",
          allowUnknown: true,
          unknownTokens: DEFAULT_UNKNOWN_TOKENS,
          minLength: 2,
          mustContainLetters: true
        }
      },
      {
        fieldKey: "PACK_INTEGRITY_APPS_OUTCOME",
        semanticKey: "outcome",
        label: "Outcome",
        inputType: "select_single",
        placeholder: "Select outcome",
        options: ["Disqualified", "Allowed to continue", "No action", "Unknown"],
        required: true,
        aiProbingEnabled: false,
        includeInFacts: true,
        factsOrder: 8,
        includeInInstanceHeader: false,
        includeInNarrative: true,
        allowUnknown: false,
        validation: {
          type: "outcome",
          allowUnknown: false,
          minLength: 2,
          mustContainLetters: true
        }
      },
      {
        fieldKey: "PACK_INTEGRITY_APPS_LESSONS",
        semanticKey: "lessons_learned",
        label: "Reflection / Lessons Learned",
        inputType: "textarea",
        placeholder: "What did you learn from this?",
        required: false,
        aiProbingEnabled: true,
        includeInFacts: true,
        factsOrder: 9,
        includeInInstanceHeader: false,
        includeInNarrative: true,
        allowUnknown: true,
        unknownTokens: DEFAULT_UNKNOWN_TOKENS,
        unknownDisplayLabel: "Not provided",
        validation: {
          type: "free_text",
          allowUnknown: true,
          unknownTokens: DEFAULT_UNKNOWN_TOKENS,
          minLength: 3,
          mustContainLetters: true
        }
      }
    ]
  },
  "PACK_LE_APPS": {
    packId: "PACK_LE_APPS",
    supportedBaseQuestions: ["Q001"],
    instancesLabel: "Applications",
    maxAiFollowups: 3,
    requiresCompletion: true,
    flagOnUnresolved: "warning",
    usePerFieldProbing: true,
    fields: [
      {
        fieldKey: "PACK_LE_APPS_Q1",
        semanticKey: "agency",
        label: "Which law enforcement agency did you apply to?",
        factsLabel: "Agency",
        inputType: "text",
        placeholder: "Enter agency name",
        required: true,
        aiProbingEnabled: true,
        includeInFacts: true,
        factsOrder: 1,
        includeInInstanceHeader: true,
        headerOrder: 1,
        includeInNarrative: true,
        allowUnknown: true,
        unknownTokens: DEFAULT_UNKNOWN_TOKENS,
        unknownDisplayLabel: "Not recalled after full probing",
        validation: {
          type: "agency_name",
          allowUnknown: true,
          unknownTokens: DEFAULT_UNKNOWN_TOKENS,
          rejectTokens: DEFAULT_REJECT_TOKENS,
          minLength: 2,
          mustContainLetters: true
        }
      },
      {
        fieldKey: "PACK_LE_APPS_Q1764025170356",
        semanticKey: "position",
        label: "What position did you apply for?",
        factsLabel: "Position applied for",
        inputType: "text",
        placeholder: "Enter position title",
        required: true,
        aiProbingEnabled: true,
        includeInFacts: true,
        factsOrder: 2,
        includeInInstanceHeader: true,
        headerOrder: 2,
        includeInNarrative: true,
        allowUnknown: true,
        unknownTokens: DEFAULT_UNKNOWN_TOKENS,
        unknownDisplayLabel: "Not recalled after full probing",
        validation: {
          type: "job_title",
          allowUnknown: true,
          unknownTokens: DEFAULT_UNKNOWN_TOKENS,
          rejectTokens: DEFAULT_REJECT_TOKENS,
          minLength: 2,
          mustContainLetters: true
        }
      },
      {
        fieldKey: "PACK_LE_APPS_Q1764025187292",
        semanticKey: "application_month_year",
        label: "What month and year did you apply?",
        factsLabel: "Application date",
        inputType: "month_year",
        placeholder: "e.g., June 2020 or 06/2020",
        required: true,
        aiProbingEnabled: true,
        probeInstructionOverride: "The candidate gave a vague date. Ask for at least an approximate timeframe like 'around 2020' or 'early 2019'.",
        includeInFacts: true,
        factsOrder: 3,
        includeInInstanceHeader: true,
        headerOrder: 3,
        includeInNarrative: true,
        allowUnknown: true,
        unknownTokens: DEFAULT_UNKNOWN_TOKENS,
        unknownDisplayLabel: "Not recalled after full probing",
        validation: {
          type: "month_year",
          allowUnknown: true,
          unknownTokens: DEFAULT_UNKNOWN_TOKENS,
          rejectTokens: DEFAULT_REJECT_TOKENS,
          minLength: 3,
          mustContainLetters: false
        }
      },
      {
        fieldKey: "PACK_LE_APPS_Q1764025199138",
        semanticKey: "outcome",
        label: "What was the outcome of your application?",
        factsLabel: "Outcome",
        inputType: "select_single",
        placeholder: "Select outcome",
        options: ["Hired", "Not selected", "Withdrew", "Process discontinued", "Still in process", "Other"],
        required: true,
        aiProbingEnabled: false,
        includeInFacts: true,
        factsOrder: 4,
        includeInInstanceHeader: false,
        includeInNarrative: true,
        allowUnknown: true,
        unknownTokens: DEFAULT_UNKNOWN_TOKENS,
        unknownDisplayLabel: "Not recalled after full probing",
        validation: {
          type: "outcome",
          allowUnknown: true,
          unknownTokens: DEFAULT_UNKNOWN_TOKENS,
          rejectTokens: ["nothing"],
          minLength: 2,
          mustContainLetters: true
        }
      },
      {
        fieldKey: "PACK_LE_APPS_Q1764025212764",
        semanticKey: "reason_not_selected",
        label: "Did the agency tell you why you were not selected?",
        factsLabel: "Agency reason",
        inputType: "text",
        placeholder: "What reason did they give?",
        required: false,
        skipWhen: [
          {
            whenField: "outcome",
            notEquals: "Not selected",
            then: "skip"
          }
        ],
        aiProbingEnabled: true,
        includeInFacts: true,
        factsOrder: 5,
        includeInInstanceHeader: false,
        includeInNarrative: true,
        allowUnknown: true,
        unknownTokens: DEFAULT_UNKNOWN_TOKENS,
        unknownDisplayLabel: "Not recalled after full probing",
        validation: {
          type: "reason_text",
          allowUnknown: true,
          unknownTokens: DEFAULT_UNKNOWN_TOKENS,
          rejectTokens: ["nothing"],
          minLength: 2,
          mustContainLetters: true
        }
      },
      {
        fieldKey: "PACK_LE_APPS_Q1764025246583",
        semanticKey: "issues_or_concerns",
        label: "Were there any issues or concerns raised during the hiring process?",
        factsLabel: "Issues / concerns",
        inputType: "text",
        placeholder: "Any issues or concerns?",
        required: false,
        aiProbingEnabled: true,
        includeInFacts: true,
        factsOrder: 6,
        includeInInstanceHeader: false,
        includeInNarrative: true,
        allowUnknown: true,
        unknownTokens: DEFAULT_UNKNOWN_TOKENS,
        unknownDisplayLabel: "Not recalled after full probing",
        validation: {
          type: "yes_no",
          allowUnknown: true,
          unknownTokens: DEFAULT_UNKNOWN_TOKENS,
          minLength: 1
        }
      }
    ]
  },

  // ============================================================
  // DRIVING INCIDENT PACKS (Standard Cluster)
  // ============================================================

  "PACK_DRIVING_COLLISION_STANDARD": {
    packId: "PACK_DRIVING_COLLISION_STANDARD",
    supportedBaseQuestions: [],
    instancesLabel: "Collisions",
    requiresCompletion: true,
    flagOnUnresolved: "warning",
    usePerFieldProbing: true,
    multiInstance: true,
    fields: [
      {
        fieldKey: "PACK_DRIVING_COLLISION_Q01",
        semanticKey: "collision_date",
        label: "Collision date (month/year)",
        inputType: "month_year",
        required: true,
        includeInFacts: true,
        factsOrder: 1,
        includeInInstanceHeader: true,
        headerOrder: 1
      },
      {
        fieldKey: "PACK_DRIVING_COLLISION_Q02",
        semanticKey: "location",
        label: "Location (city/state)",
        inputType: "text",
        required: true,
        includeInFacts: true,
        factsOrder: 2,
        includeInInstanceHeader: true,
        headerOrder: 2
      },
      {
        fieldKey: "PACK_DRIVING_COLLISION_Q03",
        semanticKey: "description",
        label: "Brief description",
        inputType: "textarea",
        required: true,
        includeInFacts: true,
        factsOrder: 3
      },
      {
        fieldKey: "PACK_DRIVING_COLLISION_Q04",
        semanticKey: "at_fault",
        label: "At fault",
        inputType: "text",
        required: true,
        includeInFacts: true,
        factsOrder: 4
      },
      {
        fieldKey: "PACK_DRIVING_COLLISION_Q05",
        semanticKey: "injuries",
        label: "Injuries",
        inputType: "text",
        required: true,
        includeInFacts: true,
        factsOrder: 5
      },
      {
        fieldKey: "PACK_DRIVING_COLLISION_Q06",
        semanticKey: "police_citation",
        label: "Police/citation",
        inputType: "text",
        required: false,
        includeInFacts: true,
        factsOrder: 6
      },
      {
        fieldKey: "PACK_DRIVING_COLLISION_Q07",
        semanticKey: "insurance_outcome",
        label: "Insurance outcome",
        inputType: "text",
        required: false,
        includeInFacts: true,
        factsOrder: 7
      }
    ]
  },

  "PACK_DRIVING_DUIDWI_STANDARD": {
    packId: "PACK_DRIVING_DUIDWI_STANDARD",
    supportedBaseQuestions: [],
    instancesLabel: "DUI/DWI Incidents",
    requiresCompletion: true,
    flagOnUnresolved: "red_flag",
    usePerFieldProbing: true,
    multiInstance: true,
    fields: [
      {
        fieldKey: "PACK_DRIVING_DUIDWI_Q01",
        semanticKey: "incident_date",
        label: "Incident date (month/year)",
        inputType: "month_year",
        required: true,
        includeInFacts: true,
        factsOrder: 1,
        includeInInstanceHeader: true,
        headerOrder: 1
      },
      {
        fieldKey: "PACK_DRIVING_DUIDWI_Q02",
        semanticKey: "location",
        label: "Location",
        inputType: "text",
        required: true,
        includeInFacts: true,
        factsOrder: 2
      },
      {
        fieldKey: "PACK_DRIVING_DUIDWI_Q03",
        semanticKey: "substance_type",
        label: "Substance type",
        inputType: "text",
        required: true,
        includeInFacts: true,
        factsOrder: 3
      },
      {
        fieldKey: "PACK_DRIVING_DUIDWI_Q04",
        semanticKey: "stop_reason",
        label: "Reason for stop",
        inputType: "text",
        required: true,
        includeInFacts: true,
        factsOrder: 4
      },
      {
        fieldKey: "PACK_DRIVING_DUIDWI_Q05",
        semanticKey: "test_type",
        label: "Test type",
        inputType: "text",
        required: false,
        includeInFacts: true,
        factsOrder: 5
      },
      {
        fieldKey: "PACK_DRIVING_DUIDWI_Q06",
        semanticKey: "test_result",
        label: "Test result",
        inputType: "text",
        required: false,
        includeInFacts: true,
        factsOrder: 6
      },
      {
        fieldKey: "PACK_DRIVING_DUIDWI_Q07",
        semanticKey: "arrest_status",
        label: "Arrest status",
        inputType: "text",
        required: true,
        includeInFacts: true,
        factsOrder: 7
      },
      {
        fieldKey: "PACK_DRIVING_DUIDWI_Q08",
        semanticKey: "court_outcome",
        label: "Court outcome",
        inputType: "text",
        required: false,
        includeInFacts: true,
        factsOrder: 8
      },
      {
        fieldKey: "PACK_DRIVING_DUIDWI_Q09",
        semanticKey: "license_impact",
        label: "License impact",
        inputType: "text",
        required: false,
        includeInFacts: true,
        factsOrder: 9
      }
    ]
  },

  "PACK_DRIVING_VIOLATIONS_STANDARD": {
    packId: "PACK_DRIVING_VIOLATIONS_STANDARD",
    supportedBaseQuestions: [],
    instancesLabel: "Traffic Violations",
    requiresCompletion: true,
    flagOnUnresolved: "warning",
    usePerFieldProbing: true,
    multiInstance: true,
    fields: [
      {
        fieldKey: "PACK_DRIVING_VIOLATIONS_Q01",
        semanticKey: "violation_date",
        label: "Violation date (month/year)",
        inputType: "month_year",
        required: true,
        includeInFacts: true,
        factsOrder: 1,
        includeInInstanceHeader: true,
        headerOrder: 1
      },
      {
        fieldKey: "PACK_DRIVING_VIOLATIONS_Q02",
        semanticKey: "violation_type",
        label: "Violation type",
        inputType: "text",
        required: true,
        includeInFacts: true,
        factsOrder: 2,
        includeInInstanceHeader: true,
        headerOrder: 2
      },
      {
        fieldKey: "PACK_DRIVING_VIOLATIONS_Q03",
        semanticKey: "location",
        label: "Location",
        inputType: "text",
        required: true,
        includeInFacts: true,
        factsOrder: 3
      },
      {
        fieldKey: "PACK_DRIVING_VIOLATIONS_Q04",
        semanticKey: "outcome",
        label: "Outcome",
        inputType: "text",
        required: true,
        includeInFacts: true,
        factsOrder: 4
      },
      {
        fieldKey: "PACK_DRIVING_VIOLATIONS_Q05",
        semanticKey: "fine_amount",
        label: "Fines",
        inputType: "text",
        required: false,
        includeInFacts: true,
        factsOrder: 5
      },
      {
        fieldKey: "PACK_DRIVING_VIOLATIONS_Q06",
        semanticKey: "points",
        label: "Points on license",
        inputType: "text",
        required: false,
        includeInFacts: true,
        factsOrder: 6
      }
    ]
  }
};

/**
 * Get pack config by pack ID
 * @param {string} packId 
 * @returns {FollowUpPackConfig|undefined}
 */
export function getPackConfig(packId) {
  return FOLLOWUP_PACK_CONFIGS[packId];
}

/**
 * Get the maximum number of AI follow-up questions for a pack.
 * This is the SINGLE SOURCE OF TRUTH for AI probing limits.
 * @param {string} packId 
 * @returns {number}
 */
export function getPackMaxAiFollowups(packId) {
  const packConfig = FOLLOWUP_PACK_CONFIGS[packId];
  if (packConfig && typeof packConfig.maxAiFollowups === 'number') {
    return packConfig.maxAiFollowups;
  }
  // Safety fallback - but in practice every pack should set this explicitly
  return 3;
}

/**
 * Check if a pack should use V2 per-field probing.
 * This is the SINGLE SOURCE OF TRUTH for V2 probing enablement.
 * @param {string} packId 
 * @returns {boolean}
 */
export function usePerFieldProbing(packId) {
  const packConfig = FOLLOWUP_PACK_CONFIGS[packId];
  return packConfig?.usePerFieldProbing === true;
}

/**
 * Get field config by fieldKey within a pack
 * @param {string} packId 
 * @param {string} fieldKey 
 * @returns {FollowUpFieldConfig|undefined}
 */
export function getFieldConfig(packId, fieldKey) {
  const pack = FOLLOWUP_PACK_CONFIGS[packId];
  if (!pack) return undefined;
  return pack.fields.find(f => f.fieldKey === fieldKey);
}

/**
 * Get field config by semanticKey within a pack
 * @param {string} packId 
 * @param {string} semanticKey 
 * @returns {FollowUpFieldConfig|undefined}
 */
export function getFieldConfigBySemantic(packId, semanticKey) {
  const pack = FOLLOWUP_PACK_CONFIGS[packId];
  if (!pack) return undefined;
  return pack.fields.find(f => f.semanticKey === semanticKey);
}

/**
 * Check if a field should be skipped based on current instance values
 * @param {FollowUpFieldConfig} fieldConfig 
 * @param {Record<string, string>} instanceValues - Current values keyed by semanticKey
 * @returns {boolean}
 */
export function shouldSkipField(fieldConfig, instanceValues) {
  if (!fieldConfig.skipWhen || fieldConfig.skipWhen.length === 0) {
    return false;
  }
  
  for (const rule of fieldConfig.skipWhen) {
    const fieldValue = instanceValues[rule.whenField];
    
    if (rule.equals !== undefined && fieldValue === rule.equals) {
      return true;
    }
    if (rule.notEquals !== undefined && fieldValue !== rule.notEquals) {
      return true;
    }
  }
  
  return false;
}

/**
 * Get fields for FACTS display, sorted by factsOrder
 * @param {string} packId 
 * @returns {FollowUpFieldConfig[]}
 */
export function getFactsFields(packId) {
  const pack = FOLLOWUP_PACK_CONFIGS[packId];
  if (!pack) return [];
  
  return pack.fields
    .filter(f => f.includeInFacts)
    .sort((a, b) => (a.factsOrder || 999) - (b.factsOrder || 999));
}

/**
 * Get fields for instance header/summary line, sorted by headerOrder
 * @param {string} packId 
 * @returns {FollowUpFieldConfig[]}
 */
export function getHeaderFields(packId) {
  const pack = FOLLOWUP_PACK_CONFIGS[packId];
  if (!pack) return [];
  
  return pack.fields
    .filter(f => f.includeInInstanceHeader)
    .sort((a, b) => (a.headerOrder || 999) - (b.headerOrder || 999));
}

/**
 * Build instance header summary line from values
 * @param {string} packId 
 * @param {Record<string, string>} values - Values keyed by fieldKey or semanticKey
 * @returns {string|null}
 */
export function buildInstanceHeaderSummary(packId, values) {
  const headerFields = getHeaderFields(packId);
  if (headerFields.length === 0) return null;
  
  const parts = headerFields
    .map(field => {
      // Try fieldKey first, then semanticKey
      return values[field.fieldKey] || values[field.semanticKey] || null;
    })
    .filter(Boolean);
  
  return parts.length > 0 ? parts.join(' • ') : null;
}

/**
 * Extract facts from instance values using pack config
 * Uses FINAL validated values from the database. If AI probing produced a 
 * clearer answer than the initial "I don't recall", that clarified value
 * should have been saved as the final value in additional_details.
 * 
 * @param {string} packId 
 * @param {Record<string, string>} values - Values keyed by fieldKey (final validated values)
 * @param {Array} [aiExchanges] - AI probing exchanges (for legacy fallback only)
 * @returns {Array<{label: string, value: string}>}
 */
export function extractFactsFromConfig(packId, values, aiExchanges = []) {
  const factsFields = getFactsFields(packId);
  if (factsFields.length === 0) return [];
  
  // Build AI clarification map as FALLBACK for values still showing vague answers
  // This handles legacy data where AI clarifications weren't persisted back to additional_details
  const aiClarifications = {};
  (aiExchanges || []).forEach(ex => {
    const question = (ex.probing_question || '').toLowerCase();
    const answer = ex.candidate_response;
    
    // Skip if answer is also vague
    if (!answer) return;
    const answerLower = answer.toLowerCase().trim();
    if (answerLower === "i don't recall" || answerLower === "i don't know" || answerLower === "unknown" || answerLower === "") {
      return;
    }
    
    // Match probe question to semantic field - AI clarification overrides vague stored values
    if (question.includes('timeframe') || question.includes('when') || question.includes('date') || question.includes('month') || question.includes('year') || question.includes('approximate')) {
      aiClarifications['application_month_year'] = answer;
    } else if (question.includes('agency') || question.includes('department') || question.includes('which agency') || question.includes('name of the agency')) {
      aiClarifications['agency'] = answer;
    } else if (question.includes('position') || question.includes('role') || question.includes('job') || question.includes('title')) {
      aiClarifications['position'] = answer;
    } else if (question.includes('outcome') || question.includes('result') || question.includes('hired') || question.includes('what happened')) {
      aiClarifications['outcome'] = answer;
    } else if (question.includes('reason') || question.includes('why') || question.includes('told you')) {
      aiClarifications['reason_not_selected'] = answer;
    } else if (question.includes('issue') || question.includes('concern') || question.includes('problem') || question.includes('anything else')) {
      aiClarifications['issues_or_concerns'] = answer;
    }
  });
  
  const facts = [];
  
  factsFields.forEach(field => {
    // Get the stored value by fieldKey - this SHOULD be the final validated value
    let value = values[field.fieldKey];
    
    // Check if stored value is vague and needs AI clarification fallback
    const storedIsVague = value && (
      value.toLowerCase().trim() === "i don't recall" || 
      value.toLowerCase().trim() === "i don't know" ||
      value.toLowerCase().trim() === "unknown" ||
      value.toLowerCase().trim() === ""
    );
    
    // FALLBACK: If stored value is vague but AI clarification exists, use the clarification
    // This handles legacy data where probing didn't update the stored value
    if (storedIsVague && aiClarifications[field.semanticKey]) {
      value = aiClarifications[field.semanticKey];
    }
    
    // Only add non-empty values to facts
    if (value && value.trim() !== "") {
      facts.push({
        label: field.label,
        value: value
      });
    }
  });
  
  return facts;
}