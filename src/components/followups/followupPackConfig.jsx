/**
 * Centralized Follow-Up Pack Configuration
 * 
 * This module defines the structure and behavior of follow-up packs,
 * including field definitions, skip logic, AI probing controls, and display settings.
 * 
 * V2 Universal MVP: All V2 packs now use the Discretion Engine for AI-driven probing.
 * No deterministic follow-up questions surface to candidates.
 */

// AUDIT LOG: PACK_PRIOR_LE_APPS_STANDARD hardcoded config (runs at module load)
if (typeof console !== 'undefined') {
  console.log("[FOLLOWUP_CONFIG_AUDIT][MODULE_LOAD] followupPackConfig.js loaded");
}

// ============================================================================
// FACT ANCHOR SCHEMAS - What facts must be collected for each pack
// These are used by the Discretion Engine to decide when to probe and when to stop
// ============================================================================

// HARDENED: Critical 3-5 fact anchors per pack (MVP anchor-based probing pipeline)
// These are the SINGLE SOURCE OF TRUTH for what facts must be collected per incident
export const PACK_FACT_ANCHORS = {
  // Prior Law Enforcement Applications - NO AI PROBING FOR OUTCOME
  // Agency/position/month_year are captured by deterministic PACK_PRLE_Q01
  // Outcome is captured by deterministic PACK_PRLE_Q02
  // AI clarifiers should ONLY clarify vague agency/position/date info
  "PACK_PRIOR_LE_APPS_STANDARD": {
    required: [], // No required AI anchors - all fields are deterministic
    optional: ["prior_le_agency", "prior_le_position", "prior_le_approx_date"], // CANONICAL KEYS - can clarify these if vague
    severity: "standard",
    maxProbes: 1, // Single clarifier only if needed
    multiInstance: true,
    excludeFromProbing: ["application_outcome", "reason_not_hired"] // NEVER probe for these - they're deterministic fields
  },
  "PACK_LE_APPS": {
    required: [], // No required AI anchors
    optional: ["agency_name", "position", "month_year"],
    severity: "standard",
    maxProbes: 1,
    multiInstance: true,
    excludeFromProbing: ["outcome", "reason_not_hired"]
  },
  
  // Driving Packs - CRITICAL ANCHORS
  "PACK_DRIVING_COLLISION_STANDARD": {
    required: ["month_year", "location", "what_happened"], // Critical 3 (removed at_fault to keep essential only)
    optional: ["at_fault", "injuries", "citations", "property_damage"],
    severity: "standard",
    maxProbes: 4,
    multiInstance: true
  },
  "PACK_DRIVING_VIOLATIONS_STANDARD": {
    required: ["violation_type", "month_year", "disposition"], // Critical 3
    optional: ["location", "fine_amount", "points"], // location moved to optional (laxed severity)
    severity: "laxed",
    maxProbes: 3,
    multiInstance: true
  },
  "PACK_DRIVING_DUIDWI_STANDARD": {
    required: ["substance", "month_year", "location", "outcome"], // Critical 4 (removed approx_level - hard to get)
    optional: ["approx_level", "arrest_status", "court_outcome", "license_impact"],
    severity: "strict",
    maxProbes: 5,
    multiInstance: true
  },
  "PACK_DRIVING_STANDARD": {
    required: ["incident_type", "month_year", "location"], // Critical 3
    optional: ["outcome", "description"],
    severity: "standard",
    maxProbes: 3,
    multiInstance: true
  },
  
  // Criminal / Violence Packs - CRITICAL ANCHORS (strict severity topics)
  "PACK_DOMESTIC_VIOLENCE_STANDARD": {
    required: ["relationship", "month_year", "behavior_type"], // Critical 3
    optional: ["outcome", "injury_or_damage", "location", "protective_order"],
    severity: "strict",
    maxProbes: 5, // Higher limit for serious topics
    multiInstance: true
  },
  "PACK_ASSAULT_STANDARD": {
    required: ["month_year", "location", "circumstances"], // Critical 3
    optional: ["outcome", "injuries", "weapons_involved"],
    severity: "strict",
    maxProbes: 5,
    multiInstance: true
  },
  "PACK_GENERAL_CRIME_STANDARD": {
    required: ["month_year", "location", "what_happened"], // Critical 3
    optional: ["legal_outcome", "charges", "arrest_status"],
    severity: "strict",
    maxProbes: 5,
    multiInstance: true
  },
  "PACK_THEFT_STANDARD": {
    required: ["month_year", "location", "what_stolen"], // Critical 3
    optional: ["legal_outcome", "value", "circumstances"],
    severity: "strict",
    maxProbes: 4,
    multiInstance: true
  },
  "PACK_PROPERTY_CRIME_STANDARD": {
    required: ["month_year", "location", "property_type"], // Critical 3
    optional: ["legal_outcome", "damage_amount", "circumstances"],
    severity: "standard",
    maxProbes: 4,
    multiInstance: true
  },
  "PACK_FRAUD_STANDARD": {
    required: ["fraud_type", "month_year", "circumstances"], // Critical 3
    optional: ["legal_outcome", "amount_involved"],
    severity: "strict",
    maxProbes: 4,
    multiInstance: true
  },
  
  // Drug / Alcohol Packs - CRITICAL ANCHORS
  "PACK_DRUG_USE_STANDARD": {
    required: ["substance_type", "first_use", "last_use"], // Critical 3 (removed frequency - often vague)
    optional: ["frequency", "total_uses", "consequences"],
    severity: "standard",
    maxProbes: 4,
    multiInstance: true
  },
  "PACK_ALCOHOL_STANDARD": {
    required: ["frequency", "binge_episodes"], // Critical 2 (not multi-instance)
    optional: ["misconduct", "blackouts", "work_impact", "treatment_history"],
    severity: "standard",
    maxProbes: 3,
    multiInstance: false
  },
  
  // Employment / Integrity Packs - CRITICAL ANCHORS
  "PACK_EMPLOYMENT_STANDARD": {
    required: ["employer", "month_year", "incident_type"], // Critical 3
    optional: ["outcome", "position", "circumstances"],
    severity: "standard",
    maxProbes: 3,
    multiInstance: true
  },
  "PACK_INTEGRITY_APPS": {
    required: ["agency", "issue_type", "month_year"], // Critical 3 (strict severity)
    optional: ["consequences", "what_omitted", "reason_omitted"],
    severity: "strict",
    maxProbes: 4,
    multiInstance: true
  },
  
  // Financial Packs - CRITICAL ANCHORS
  "PACK_FINANCIAL_STANDARD": {
    required: ["financial_issue_type", "resolution_status"], // Critical 2
    optional: ["amount_owed", "creditor", "legal_actions"],
    severity: "standard",
    maxProbes: 3,
    multiInstance: true
  },
  
  // Other Packs - CRITICAL ANCHORS
  "PACK_GENERAL_DISCLOSURE_STANDARD": {
    required: ["disclosure_type", "circumstances"], // Critical 2 (laxed severity)
    optional: ["time_period"],
    severity: "laxed",
    maxProbes: 2,
    multiInstance: true
  },
  "PACK_STALKING_HARASSMENT_STANDARD": {
    required: ["behavior_type", "month_year", "circumstances"], // Critical 3
    optional: ["legal_outcome", "duration", "victim_relationship"],
    severity: "strict",
    maxProbes: 4,
    multiInstance: true
  },
  "PACK_CHILD_ABUSE_STANDARD": {
    required: ["month_year", "allegation_type", "investigation_outcome"], // Critical 3
    optional: ["child_age", "location"],
    severity: "strict",
    maxProbes: 5,
    multiInstance: true
  },
  "PACK_WORKPLACE_STANDARD": {
    required: ["employer_name", "role_or_position", "incident_date", "misconduct_type", "final_outcome"], // Critical 5
    optional: ["staff_response", "reapply_or_eligibility"],
    severity: "strict",
    maxProbes: 4,
    multiInstance: true
  }
};

/**
 * Get fact anchor schema for a pack
 * @param {string} packId 
 * @returns {object|null}
 */
export function getPackFactAnchors(packId) {
  return PACK_FACT_ANCHORS[packId] || null;
}

/**
 * Get severity level for a pack
 * @param {string} packId 
 * @returns {"laxed"|"standard"|"strict"}
 */
export function getPackSeverity(packId) {
  return PACK_FACT_ANCHORS[packId]?.severity || "standard";
}

/**
 * Check if pack supports multiple instances
 * @param {string} packId 
 * @returns {boolean}
 */
export function isMultiInstancePack(packId) {
  return PACK_FACT_ANCHORS[packId]?.multiInstance !== false;
}

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
    packDescription: "Please tell the complete story of this integrity issue in your own words.",
    multiInstanceDescription: "Please tell the complete story of this integrity issue in your own words.",
    maxAiFollowups: 4,
    requiresCompletion: true,
    flagOnUnresolved: "red_flag",
    usePerFieldProbing: true,
    useNarrativeFirst: true,
    multiInstance: true,
    requiredAnchors: ["agency", "month_year", "issue_type", "outcome"],
    factAnchors: [
      { key: "agency", label: "Agency", answerType: "text", priority: 1, multiInstanceAware: false, clarifierStyle: "micro", required: true },
      { key: "month_year", label: "When it happened", answerType: "month_year", priority: 2, multiInstanceAware: false, clarifierStyle: "micro", required: true },
      { key: "issue_type", label: "Type of issue", answerType: "text", priority: 3, multiInstanceAware: false, clarifierStyle: "micro", required: true },
      { key: "outcome", label: "Outcome", answerType: "text", priority: 4, multiInstanceAware: false, clarifierStyle: "micro", required: true }
    ],
    fields: [
      {
        fieldKey: "PACK_INTEGRITY_APPS_NARRATIVE",
        semanticKey: "narrative",
        label: "In your own words, tell the complete story of this integrity issue. Include which agency it was with, roughly when it happened, what type of issue it was, what happened, what the outcome was, and why (if you know). Please provide as much detail as you can.",
        inputType: "textarea",
        placeholder: "Example: In 2021, I applied to Mesa PD and accidentally left off a previous traffic citation from my application. During my background interview, the investigator found it and asked me about it. I explained it was an oversight. They allowed me to continue but I was ultimately not selected for other reasons.",
        required: true,
        aiProbingEnabled: true,
        isNarrativeOpener: true,
        isPrimaryNarrativeField: true,
        captures: ["agency", "month_year", "issue_type", "outcome"],
        includeInFacts: true,
        factsOrder: 1,
        includeInInstanceHeader: true,
        headerOrder: 1,
        includeInNarrative: true,
        allowUnknown: false,
        unknownTokens: DEFAULT_UNKNOWN_TOKENS,
        unknownDisplayLabel: "Not provided",
        validation: {
          type: "free_text",
          allowUnknown: false,
          unknownTokens: DEFAULT_UNKNOWN_TOKENS,
          rejectTokens: DEFAULT_REJECT_TOKENS,
          minLength: 10,
          mustContainLetters: true
        }
      },
      {
        fieldKey: "PACK_INTEGRITY_APPS_AGENCY",
        semanticKey: "agency",
        label: "Which agency was this with?",
        inputType: "text",
        placeholder: "Enter agency name",
        required: true,
        requiresMissing: ["agency"],
        aiProbingEnabled: true,
        includeInFacts: true,
        factsOrder: 2,
        includeInInstanceHeader: true,
        headerOrder: 2,
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
    packDescription: "Thanks. I'll ask a few quick factual questions to keep things clear.",
    multiInstanceDescription: "Got it. I'll take these one at a time so everything stays clear.",
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
    packDescription: "Please tell the complete story of this collision in your own words.",
    multiInstanceDescription: "Please tell the complete story of this collision in your own words.",
    maxAiFollowups: 4,
    requiresCompletion: true,
    flagOnUnresolved: "warning",
    usePerFieldProbing: true,
    useNarrativeFirst: true,
    multiInstance: true,
    requiredAnchors: ["month_year", "location", "what_happened", "outcome"],
    factAnchors: [
      { key: "month_year", label: "When it happened", answerType: "month_year", priority: 1, multiInstanceAware: true, clarifierStyle: "micro", required: true },
      { key: "location", label: "Location", answerType: "text", priority: 2, multiInstanceAware: true, clarifierStyle: "micro", required: true },
      { key: "what_happened", label: "What happened", answerType: "text", priority: 3, multiInstanceAware: true, clarifierStyle: "micro", required: true },
      { key: "outcome", label: "Outcome", answerType: "text", priority: 4, multiInstanceAware: true, clarifierStyle: "micro", required: true }
    ],
    fields: [
      {
        fieldKey: "PACK_DRIVING_COLLISION_Q01",
        semanticKey: "narrative",
        label: "In your own words, tell the complete story of this collision. Include roughly when it happened, where it happened, what happened, who was involved, what the outcome was, and why (if you know). Please provide as much detail as you can.",
        inputType: "textarea",
        placeholder: "Example: Around June 2021, I was driving eastbound on Main Street in Phoenix when a car ran a red light and hit my passenger side. Both cars had minor damage. The other driver got a citation. No one was injured.",
        required: true,
        aiProbingEnabled: true,
        isNarrativeOpener: true,
        isPrimaryNarrativeField: true,
        captures: ["month_year", "location", "what_happened", "outcome"],
        includeInFacts: true,
        factsOrder: 1,
        includeInInstanceHeader: true,
        headerOrder: 1
      },
      {
        fieldKey: "PACK_DRIVING_COLLISION_Q01_DATE",
        semanticKey: "collision_date",
        label: "Collision date (month/year)",
        inputType: "month_year",
        required: true,
        requiresMissing: ["month_year"],
        includeInFacts: true,
        factsOrder: 2,
        includeInInstanceHeader: true,
        headerOrder: 2
      },
      {
        fieldKey: "PACK_DRIVING_COLLISION_Q02",
        semanticKey: "location",
        label: "Location (city/state)",
        inputType: "text",
        required: true,
        requiresMissing: ["location"],
        includeInFacts: true,
        factsOrder: 3,
        includeInInstanceHeader: true,
        headerOrder: 3
      },
      {
        fieldKey: "PACK_DRIVING_COLLISION_Q03",
        semanticKey: "description",
        label: "What happened in this collision?",
        inputType: "textarea",
        required: true,
        requiresMissing: ["what_happened"],
        includeInFacts: true,
        factsOrder: 4
      },
      {
        fieldKey: "PACK_DRIVING_COLLISION_Q04",
        semanticKey: "outcome",
        label: "What was the outcome? (citations, fault determination, etc.)",
        inputType: "text",
        required: true,
        requiresMissing: ["outcome"],
        includeInFacts: true,
        factsOrder: 5
      },
      {
        fieldKey: "PACK_DRIVING_COLLISION_Q05",
        semanticKey: "injuries",
        label: "Were there any injuries?",
        inputType: "text",
        required: false,
        includeInFacts: true,
        factsOrder: 6
      },
      {
        fieldKey: "PACK_DRIVING_COLLISION_Q06",
        semanticKey: "police_citation",
        label: "Police/citation details",
        inputType: "text",
        required: false,
        includeInFacts: true,
        factsOrder: 7
      },
      {
        fieldKey: "PACK_DRIVING_COLLISION_Q07",
        semanticKey: "insurance_outcome",
        label: "Insurance outcome",
        inputType: "text",
        required: false,
        includeInFacts: true,
        factsOrder: 8
      }
    ]
  },

  "PACK_DRIVING_DUIDWI_STANDARD": {
    packId: "PACK_DRIVING_DUIDWI_STANDARD",
    supportedBaseQuestions: [],
    instancesLabel: "DUI/DWI Incidents",
    packDescription: "Please tell the complete story of this DUI/DWI incident in your own words.",
    multiInstanceDescription: "Please tell the complete story of this DUI/DWI incident in your own words.",
    maxAiFollowups: 4,
    requiresCompletion: true,
    flagOnUnresolved: "red_flag",
    usePerFieldProbing: true,
    useNarrativeFirst: true,
    multiInstance: true,
    requiredAnchors: ["month_year", "substance_type", "location", "outcome"],
    factAnchors: [
      { key: "month_year", label: "When it happened", answerType: "month_year", priority: 1, multiInstanceAware: true, clarifierStyle: "micro", required: true },
      { key: "substance_type", label: "Substance involved", answerType: "text", priority: 2, multiInstanceAware: true, clarifierStyle: "micro", required: true },
      { key: "location", label: "Location", answerType: "text", priority: 3, multiInstanceAware: true, clarifierStyle: "micro", required: true },
      { key: "outcome", label: "Outcome", answerType: "text", priority: 4, multiInstanceAware: true, clarifierStyle: "micro", required: true }
    ],
    fields: [
      {
        fieldKey: "PACK_DRIVING_DUIDWI_Q01",
        semanticKey: "narrative",
        label: "In your own words, tell the complete story of this DUI/DWI incident. Include roughly when it happened, what substance was involved, where it happened, what happened during the stop, what the outcome was, and any relevant details. Please provide as much detail as you can.",
        inputType: "textarea",
        placeholder: "Example: In July 2018, I was pulled over in Tempe for a broken taillight after having a few beers. I took a breathalyzer and blew a 0.09. I was arrested and later pled guilty to a DUI. I completed probation and paid all fines.",
        required: true,
        aiProbingEnabled: true,
        isNarrativeOpener: true,
        isPrimaryNarrativeField: true,
        captures: ["month_year", "substance_type", "location", "outcome"],
        includeInFacts: true,
        factsOrder: 1,
        includeInInstanceHeader: true,
        headerOrder: 1
      },
      {
        fieldKey: "PACK_DRIVING_DUIDWI_Q01_DATE",
        semanticKey: "incident_date",
        label: "Incident date (month/year)",
        inputType: "month_year",
        required: true,
        requiresMissing: ["month_year"],
        includeInFacts: true,
        factsOrder: 2,
        includeInInstanceHeader: true,
        headerOrder: 2
      },
      {
        fieldKey: "PACK_DRIVING_DUIDWI_Q02",
        semanticKey: "location",
        label: "Where did this happen?",
        inputType: "text",
        required: true,
        requiresMissing: ["location"],
        includeInFacts: true,
        factsOrder: 3
      },
      {
        fieldKey: "PACK_DRIVING_DUIDWI_Q03",
        semanticKey: "substance_type",
        label: "What substance was involved?",
        inputType: "text",
        required: true,
        requiresMissing: ["substance_type"],
        includeInFacts: true,
        factsOrder: 4
      },
      {
        fieldKey: "PACK_DRIVING_DUIDWI_Q04",
        semanticKey: "stop_reason",
        label: "Why were you stopped?",
        inputType: "text",
        required: true,
        includeInFacts: true,
        factsOrder: 5
      },
      {
        fieldKey: "PACK_DRIVING_DUIDWI_Q05",
        semanticKey: "test_type",
        label: "Test type",
        inputType: "text",
        required: false,
        includeInFacts: true,
        factsOrder: 6
      },
      {
        fieldKey: "PACK_DRIVING_DUIDWI_Q06",
        semanticKey: "test_result",
        label: "Test result",
        inputType: "text",
        required: false,
        includeInFacts: true,
        factsOrder: 7
      },
      {
        fieldKey: "PACK_DRIVING_DUIDWI_Q07",
        semanticKey: "arrest_status",
        label: "Were you arrested?",
        inputType: "text",
        required: true,
        includeInFacts: true,
        factsOrder: 8
      },
      {
        fieldKey: "PACK_DRIVING_DUIDWI_Q08",
        semanticKey: "court_outcome",
        label: "What was the court outcome?",
        inputType: "text",
        required: true,
        requiresMissing: ["outcome"],
        includeInFacts: true,
        factsOrder: 9
      },
      {
        fieldKey: "PACK_DRIVING_DUIDWI_Q09",
        semanticKey: "license_impact",
        label: "License impact",
        inputType: "text",
        required: false,
        includeInFacts: true,
        factsOrder: 10
      }
    ]
  },

  // PACK_DRIVING_STANDARD - Generic driving incident pack
  "PACK_DRIVING_STANDARD": {
    packId: "PACK_DRIVING_STANDARD",
    supportedBaseQuestions: [],
    instancesLabel: "Driving Incidents",
    packDescription: "Please tell the complete story of this driving incident in your own words.",
    multiInstanceDescription: "Please tell the complete story of this driving incident in your own words.",
    maxAiFollowups: 4,
    requiresCompletion: true,
    flagOnUnresolved: "warning",
    usePerFieldProbing: true,
    useNarrativeFirst: true,
    multiInstance: true,
    requiredAnchors: ["month_year", "incident_type", "what_happened", "outcome"],
    factAnchors: [
      { key: "month_year", label: "When it happened", answerType: "month_year", priority: 1, multiInstanceAware: true, clarifierStyle: "micro", required: true },
      { key: "incident_type", label: "Type of incident", answerType: "text", priority: 2, multiInstanceAware: true, clarifierStyle: "micro", required: true },
      { key: "what_happened", label: "What happened", answerType: "text", priority: 3, multiInstanceAware: true, clarifierStyle: "micro", required: true },
      { key: "outcome", label: "Outcome", answerType: "text", priority: 4, multiInstanceAware: true, clarifierStyle: "micro", required: true }
    ],
    fields: [
      {
        fieldKey: "PACK_DRIVING_STANDARD_Q01",
        semanticKey: "narrative",
        label: "In your own words, tell the complete story of this driving incident. Include roughly when it happened, what type of incident it was, what happened, who was involved, what the outcome was, and why (if you know). Please provide as much detail as you can.",
        inputType: "textarea",
        placeholder: "Example: Around fall 2020, I got a speeding ticket on I-10 near Tucson going 15 over. The officer gave me a citation and I paid the fine. No points were added to my license.",
        required: true,
        aiProbingEnabled: true,
        isNarrativeOpener: true,
        isPrimaryNarrativeField: true,
        captures: ["month_year", "incident_type", "what_happened", "outcome"],
        includeInFacts: true,
        factsOrder: 1,
        includeInInstanceHeader: true,
        headerOrder: 1
      },
      {
        fieldKey: "PACK_DRIVING_STANDARD_Q01_DATE",
        semanticKey: "incident_date",
        label: "Incident date (month/year)",
        inputType: "month_year",
        required: true,
        requiresMissing: ["month_year"],
        includeInFacts: true,
        factsOrder: 2,
        includeInInstanceHeader: true,
        headerOrder: 2
      },
      {
        fieldKey: "PACK_DRIVING_STANDARD_Q02",
        semanticKey: "incident_type",
        label: "Type of incident",
        inputType: "text",
        required: true,
        requiresMissing: ["incident_type"],
        includeInFacts: true,
        factsOrder: 3,
        includeInInstanceHeader: true,
        headerOrder: 3
      },
      {
        fieldKey: "PACK_DRIVING_STANDARD_Q03",
        semanticKey: "description",
        label: "What happened?",
        inputType: "textarea",
        required: true,
        requiresMissing: ["what_happened"],
        includeInFacts: true,
        factsOrder: 4
      },
      {
        fieldKey: "PACK_DRIVING_STANDARD_Q04",
        semanticKey: "outcome",
        label: "What was the outcome?",
        inputType: "text",
        required: true,
        requiresMissing: ["outcome"],
        includeInFacts: true,
        factsOrder: 5
      }
    ]
  },

  "PACK_DRIVING_VIOLATIONS_STANDARD": {
    packId: "PACK_DRIVING_VIOLATIONS_STANDARD",
    supportedBaseQuestions: [],
    instancesLabel: "Traffic Violations",
    packDescription: "Please tell the complete story of this traffic violation in your own words.",
    multiInstanceDescription: "Please tell the complete story of this traffic violation in your own words.",
    maxAiFollowups: 4,
    requiresCompletion: true,
    flagOnUnresolved: "warning",
    usePerFieldProbing: true,
    useNarrativeFirst: true,
    multiInstance: true,
    requiredAnchors: ["month_year", "violation_type", "location", "outcome"],
    factAnchors: [
      { key: "month_year", label: "When it happened", answerType: "month_year", priority: 1, multiInstanceAware: true, clarifierStyle: "micro", required: true },
      { key: "violation_type", label: "Type of violation", answerType: "text", priority: 2, multiInstanceAware: true, clarifierStyle: "micro", required: true },
      { key: "location", label: "Location", answerType: "text", priority: 3, multiInstanceAware: true, clarifierStyle: "micro", required: true },
      { key: "outcome", label: "Outcome", answerType: "text", priority: 4, multiInstanceAware: true, clarifierStyle: "micro", required: true }
    ],
    fields: [
      {
        fieldKey: "PACK_DRIVING_VIOLATIONS_Q01",
        semanticKey: "narrative",
        label: "In your own words, tell the complete story of this traffic violation. Include roughly when it happened, what type of violation it was, where it happened, what the outcome was, and any relevant details. Please provide as much detail as you can.",
        inputType: "textarea",
        placeholder: "Example: In August 2019, I was pulled over for speeding on Highway 60 in Mesa doing 70 in a 55 zone. The officer gave me a ticket and I paid a $200 fine. No points were added to my license.",
        required: true,
        aiProbingEnabled: true,
        isNarrativeOpener: true,
        isPrimaryNarrativeField: true,
        captures: ["month_year", "violation_type", "location", "outcome"],
        includeInFacts: true,
        factsOrder: 1,
        includeInInstanceHeader: true,
        headerOrder: 1
      },
      {
        fieldKey: "PACK_DRIVING_VIOLATIONS_Q01_DATE",
        semanticKey: "violation_date",
        label: "Violation date (month/year)",
        inputType: "month_year",
        required: true,
        requiresMissing: ["month_year"],
        includeInFacts: true,
        factsOrder: 2,
        includeInInstanceHeader: true,
        headerOrder: 2
      },
      {
        fieldKey: "PACK_DRIVING_VIOLATIONS_Q02",
        semanticKey: "violation_type",
        label: "What type of violation was this?",
        inputType: "text",
        required: true,
        requiresMissing: ["violation_type"],
        includeInFacts: true,
        factsOrder: 3,
        includeInInstanceHeader: true,
        headerOrder: 3
      },
      {
        fieldKey: "PACK_DRIVING_VIOLATIONS_Q03",
        semanticKey: "location",
        label: "Where did this happen?",
        inputType: "text",
        required: true,
        requiresMissing: ["location"],
        includeInFacts: true,
        factsOrder: 4
      },
      {
        fieldKey: "PACK_DRIVING_VIOLATIONS_Q04",
        semanticKey: "outcome",
        label: "What was the outcome?",
        inputType: "text",
        required: true,
        requiresMissing: ["outcome"],
        includeInFacts: true,
        factsOrder: 5
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
  },

  // GOLDEN V2 TEMPLATE EXAMPLE:
  // PACK_WORKPLACE_STANDARD is configured as a narrative-first V2 pack:
  // - openingStrategy: "fixed_narrative" with openingFieldKey pointing to the narrative field
  // - fact_anchors: 7 workplace-specific BI-critical anchors with priority + required flags
  // - field_config: 14 structured fields (first = narrative, then critical facts, then context)
  // Future V2 upgrades should follow this pattern.
  // Q004 (cheating on testing) triggers this workplace integrity pack
  "PACK_WORKPLACE_STANDARD": {
    packId: "PACK_WORKPLACE_STANDARD",
    supportedBaseQuestions: ["Q004", "Q127", "Q128", "Q129", "Q130", "Q136", "Q137", "Q138", "Q163", "Q203"],
    instancesLabel: "Workplace Integrity Issues",
    packDescription: "Please describe this workplace integrity or misconduct incident in your own words.",
    multiInstanceDescription: "Please describe this workplace integrity or misconduct incident in your own words.",
    maxAiFollowups: 4,
    openingStrategy: "fixed_narrative",
    openingFieldKey: "PACK_WORKPLACE_Q01",
    openingLabelOverride: "In your own words, walk me through the workplace integrity or misconduct incident we're talking about — what happened, which employer or setting was involved, when it took place, and how it ended. Please include as much detail as you can.",
    openingExample: "In 2021, while working at a logistics company, I edited my timecard to show two extra hours that I didn't actually work. My supervisor noticed a discrepancy during payroll review, met with me, and I admitted what I had done. I was written up for falsifying time records and told that another incident could result in termination.",
    requiredAnchors: ["employer_name", "role_or_position", "incident_date", "misconduct_type", "final_outcome"],
    targetAnchors: ["employer_name", "role_or_position", "incident_date", "misconduct_type", "staff_response", "final_outcome", "reapply_or_eligibility"],
    factAnchors: [
      { key: "employer_name", label: "Employer / organization name", answerType: "text", priority: 1, multiInstanceAware: false, clarifierStyle: "micro", required: true },
      { key: "role_or_position", label: "Role or position at the time", answerType: "text", priority: 2, multiInstanceAware: false, clarifierStyle: "micro", required: true },
      { key: "incident_date", label: "Approximate date of incident (month/year)", answerType: "month_year", priority: 3, multiInstanceAware: false, clarifierStyle: "micro", required: true },
      { key: "misconduct_type", label: "Type of integrity or misconduct issue", answerType: "text", priority: 4, multiInstanceAware: false, clarifierStyle: "micro", required: true },
      { key: "staff_response", label: "Actions taken by supervisors/HR", answerType: "text", priority: 5, multiInstanceAware: false, clarifierStyle: "micro", required: false },
      { key: "final_outcome", label: "Final outcome (discipline / resignation / termination)", answerType: "text", priority: 6, multiInstanceAware: false, clarifierStyle: "micro", required: true },
      { key: "reapply_or_eligibility", label: "Rehire or reapply eligibility (if discussed)", answerType: "text", priority: 7, multiInstanceAware: false, clarifierStyle: "micro", required: false }
    ],
    excludeFromProbing: [],
    requiresCompletion: true,
    flagOnUnresolved: "red_flag",
    usePerFieldProbing: true,
    useNarrativeFirst: true,
    multiInstance: true,
    fields: [
      {
        fieldKey: "PACK_WORKPLACE_Q01",
        semanticKey: "narrative",
        label: "In your own words, walk me through the workplace integrity or misconduct incident we're talking about — what happened, which employer or setting was involved, when it took place, and how it ended. Please include as much detail as you can.",
        factsLabel: "Narrative",
        inputType: "textarea",
        placeholder: "Example: In 2021, while working at a logistics company, I edited my timecard to show two extra hours that I didn't actually work. My supervisor noticed a discrepancy during payroll review, met with me, and I admitted what I had done. I was written up for falsifying time records and told that another incident could result in termination.",
        required: true,
        aiProbingEnabled: true,
        isNarrativeOpener: true,
        isPrimaryNarrativeField: true,
        captures: ["employer_name", "role_or_position", "incident_date", "misconduct_type", "staff_response", "final_outcome"],
        includeInFacts: true,
        factsOrder: 1,
        includeInInstanceHeader: true,
        headerOrder: 1,
        includeInNarrative: true,
        allowUnknown: false,
        unknownTokens: DEFAULT_UNKNOWN_TOKENS,
        unknownDisplayLabel: "Not provided",
        validation: {
          type: "free_text",
          allowUnknown: false,
          unknownTokens: DEFAULT_UNKNOWN_TOKENS,
          rejectTokens: DEFAULT_REJECT_TOKENS,
          minLength: 10,
          mustContainLetters: true
        }
      }
    ]
  },

  // Prior Law Enforcement Applications pack (v2.5)
  // NARRATIVE-FIRST APPROACH: Q01 is an open-ended narrative prompt.
  // The system extracts anchors from the narrative and MUST collect all 4 required anchors before advancing.
  "PACK_PRIOR_LE_APPS_STANDARD": {
    packId: "PACK_PRIOR_LE_APPS_STANDARD",
    supportedBaseQuestions: ["Q001", "Q002", "Q003", "Q004"],
    instancesLabel: "Prior Law Enforcement Applications",
    packDescription: "Please describe this prior law enforcement application in your own words.",
    multiInstanceDescription: "Please describe this prior law enforcement application in your own words.",
    maxAiFollowups: 4, // Allows clarifiers for all 4 required anchors if needed
    // Required anchors that MUST be collected from Q01 before advancing (CANONICAL KEYS)
    requiredAnchors: [
      "prior_le_agency",
      "prior_le_position",
      "prior_le_approx_date",
      "application_outcome"
    ],
    // All target anchors - extracted from Q01 narrative (CANONICAL KEYS)
    targetAnchors: [
      "prior_le_agency",
      "prior_le_position",
      "prior_le_approx_date",
      "application_outcome",
      "application_city",
      "application_state"
    ],
    // Fact anchors for AI clarifier generation (CANONICAL KEYS)
    factAnchors: [
      { key: "prior_le_agency", label: "Agency name", answerType: "text", priority: 1, multiInstanceAware: false, clarifierStyle: "micro", required: true },
      { key: "prior_le_position", label: "Position applied for", answerType: "text", priority: 2, multiInstanceAware: false, clarifierStyle: "micro", required: true },
      { key: "prior_le_approx_date", label: "Application date", answerType: "month_year", priority: 3, multiInstanceAware: false, clarifierStyle: "micro", required: true },
      { key: "application_outcome", label: "Outcome of application", answerType: "text", priority: 4, multiInstanceAware: false, clarifierStyle: "micro", required: true }
    ],
    excludeFromProbing: [], // All anchors can be probed if missing
    requiresCompletion: true,
    flagOnUnresolved: "warning",
    usePerFieldProbing: true,
    useNarrativeFirst: true, // Flag for narrative-first approach
    multiInstance: true,
    fields: [
      {
        fieldKey: "PACK_PRLE_Q01",
        semanticKey: "narrative",
        label: "In your own words, tell me the story of this prior law-enforcement application — who you applied with, the job, when it happened, how far you got, and how it ended. If you know why the process ended or whether you could reapply, include that too.",
        factsLabel: "Narrative",
        inputType: "textarea",
        placeholder: "Example: I applied to Phoenix PD in March 2022 for a Police Recruit position. I passed the written and fitness tests and completed a background interview. The investigator later told me I didn't move forward because of my driving record, and I was told I could reapply after two years.",
        required: true,
        aiProbingEnabled: true,
        isNarrativeOpener: true, // Marks this as the narrative opener
        isPrimaryNarrativeField: true, // Must capture ALL required anchors before advancing
        captures: ["prior_le_agency", "prior_le_position", "prior_le_approx_date", "application_outcome"], // CANONICAL KEYS
        includeInFacts: true,
        factsOrder: 1,
        includeInInstanceHeader: true,
        headerOrder: 1,
        includeInNarrative: true,
        allowUnknown: false,
        unknownTokens: DEFAULT_UNKNOWN_TOKENS,
        unknownDisplayLabel: "Not provided",
        validation: {
          type: "free_text",
          allowUnknown: false,
          unknownTokens: DEFAULT_UNKNOWN_TOKENS,
          rejectTokens: DEFAULT_REJECT_TOKENS,
          minLength: 10,
          mustContainLetters: true
        }
      },
      {
        fieldKey: "PACK_PRLE_Q02",
        semanticKey: "application_outcome",
        label: "What was the outcome of that application? (For example: hired, disqualified, withdrew, or still in process.)",
        factsLabel: "Outcome",
        inputType: "text",
        placeholder: "Describe the outcome (hired, disqualified, withdrew, still in process)...",
        required: true,
        aiProbingEnabled: false,
        capturesAnchor: "application_outcome", // This field persists the application_outcome anchor
        requiresMissing: ["application_outcome"], // Only ask if application_outcome anchor is missing
        includeInFacts: true,
        factsOrder: 2,
        includeInInstanceHeader: true,
        headerOrder: 2,
        includeInNarrative: true,
        allowUnknown: false,
        unknownTokens: DEFAULT_UNKNOWN_TOKENS,
        unknownDisplayLabel: "Not provided",
        validation: {
          type: "outcome",
          allowUnknown: false,
          unknownTokens: DEFAULT_UNKNOWN_TOKENS,
          rejectTokens: DEFAULT_REJECT_TOKENS,
          minLength: 2,
          mustContainLetters: true
        },
        autoSkipIfConfident: true,
        autoSkipMinConfidence: 0.85,
        allowedEnumValues: ["hired", "disqualified", "withdrew", "still in process", "not selected", "rejected", "not hired", "dq", "dq'd"]
      },
      {
        fieldKey: "PACK_PRLE_Q03",
        semanticKey: "application_location",
        label: "Which city and state was that agency in?",
        factsLabel: "Location",
        inputType: "text",
        placeholder: "e.g., Phoenix, AZ",
        required: false,
        aiProbingEnabled: true,
        requiresMissing: ["application_city", "application_state"], // Only ask if not extracted
        includeInFacts: true,
        factsOrder: 3,
        includeInInstanceHeader: true,
        headerOrder: 3,
        includeInNarrative: true,
        allowUnknown: true,
        unknownTokens: DEFAULT_UNKNOWN_TOKENS,
        unknownDisplayLabel: "Not recalled",
        validation: {
          type: "free_text",
          allowUnknown: true,
          unknownTokens: DEFAULT_UNKNOWN_TOKENS,
          minLength: 2,
          mustContainLetters: true
        },
        autoSkipIfConfident: true,
        autoSkipMinConfidence: 0.85
      },
      {
        fieldKey: "PACK_PRLE_Q04",
        semanticKey: "prior_le_approx_date",
        label: "About when did you apply there? Month and year is fine.",
        factsLabel: "Application Date",
        inputType: "month_year",
        placeholder: "e.g., June 2020 or around 2019",
        required: true,
        aiProbingEnabled: true,
        requiresMissing: ["prior_le_approx_date"], // CANONICAL KEY - ONLY ask if date NOT extracted from narrative
        probeInstructionOverride: "The candidate gave a vague date. Ask for at least an approximate timeframe like 'around 2020' or 'early 2019'.",
        includeInFacts: true,
        factsOrder: 4,
        includeInInstanceHeader: false,
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
        },
        autoSkipIfConfident: true,
        autoSkipMinConfidence: 0.85
      },
      {
        fieldKey: "PACK_PRLE_Q05",
        semanticKey: "prior_le_position",
        label: "What position or job title did you apply for with that agency?",
        factsLabel: "Position",
        inputType: "text",
        placeholder: "Enter position title",
        required: true,
        aiProbingEnabled: true,
        requiresMissing: ["prior_le_position"], // CANONICAL KEY - Only ask if not extracted from narrative
        includeInFacts: true,
        factsOrder: 5,
        includeInInstanceHeader: false,
        includeInNarrative: true,
        allowUnknown: true,
        unknownTokens: DEFAULT_UNKNOWN_TOKENS,
        unknownDisplayLabel: "Not recalled",
        validation: {
          type: "job_title",
          allowUnknown: true,
          unknownTokens: DEFAULT_UNKNOWN_TOKENS,
          rejectTokens: DEFAULT_REJECT_TOKENS,
          minLength: 2,
          mustContainLetters: true
        },
        autoSkipIfConfident: true,
        autoSkipMinConfidence: 0.85
      },
      {
        fieldKey: "PACK_PRLE_Q06",
        semanticKey: "prior_le_agency",
        label: "What was the name of the law enforcement agency you applied to?",
        factsLabel: "Agency Name",
        inputType: "text",
        placeholder: "Enter agency name",
        required: true,
        aiProbingEnabled: true,
        requiresMissing: ["prior_le_agency"], // CANONICAL KEY - Only ask if not extracted from narrative
        includeInFacts: true,
        factsOrder: 6,
        includeInInstanceHeader: false,
        includeInNarrative: true,
        allowUnknown: true,
        unknownTokens: DEFAULT_UNKNOWN_TOKENS,
        unknownDisplayLabel: "Not recalled",
        validation: {
          type: "agency_name",
          allowUnknown: true,
          unknownTokens: DEFAULT_UNKNOWN_TOKENS,
          minLength: 2,
          mustContainLetters: true
        },
        autoSkipIfConfident: true,
        autoSkipMinConfidence: 0.85
      },
      {
        fieldKey: "PACK_PRLE_Q07",
        semanticKey: "reason_not_hired",
        label: "If you were not hired, what reason were you given, or what do you believe was the main reason?",
        factsLabel: "Reason",
        inputType: "textarea",
        placeholder: "Enter reason or explanation",
        required: false,
        aiProbingEnabled: true,
        skipUnless: { application_outcome: ["not selected", "disqualified", "rejected", "not hired", "dq", "dq'd"] },
        includeInFacts: true,
        factsOrder: 7,
        includeInInstanceHeader: false,
        includeInNarrative: true,
        allowUnknown: true,
        unknownTokens: DEFAULT_UNKNOWN_TOKENS,
        unknownDisplayLabel: "Not specified",
        validation: {
          type: "free_text",
          allowUnknown: true,
          unknownTokens: DEFAULT_UNKNOWN_TOKENS,
          minLength: 2,
          mustContainLetters: true
        }
      },
      {
        fieldKey: "PACK_PRLE_Q08",
        semanticKey: "appeal_or_reapply",
        label: "Did you appeal that decision or reapply with that agency? If yes, what happened?",
        factsLabel: "Appeal/Reapply",
        inputType: "textarea",
        placeholder: "Enter details if applicable",
        required: false,
        aiProbingEnabled: true,
        includeInFacts: true,
        factsOrder: 8,
        includeInInstanceHeader: false,
        includeInNarrative: true,
        allowUnknown: true,
        unknownTokens: DEFAULT_UNKNOWN_TOKENS,
        unknownDisplayLabel: "Not specified",
        validation: {
          type: "free_text",
          allowUnknown: true,
          unknownTokens: DEFAULT_UNKNOWN_TOKENS,
          minLength: 2,
          mustContainLetters: true
        }
      },
      {
        fieldKey: "PACK_PRLE_Q09",
        semanticKey: "anything_else",
        label: "Is there anything else about that application that you think your background investigator should know?",
        factsLabel: "Additional Details",
        inputType: "textarea",
        placeholder: "Enter any additional information",
        required: false,
        aiProbingEnabled: true,
        includeInFacts: true,
        factsOrder: 9,
        includeInInstanceHeader: false,
        includeInNarrative: true,
        allowUnknown: true,
        unknownTokens: DEFAULT_UNKNOWN_TOKENS,
        unknownDisplayLabel: "Not specified",
        validation: {
          type: "free_text",
          allowUnknown: true,
          unknownTokens: DEFAULT_UNKNOWN_TOKENS,
          minLength: 2,
          mustContainLetters: true
        }
      }
    ]
  },

  // ============================================================
  // ADDITIONAL V2 STANDARD CLUSTER PACKS (Synced from Database)
  // ============================================================

  "PACK_ALCOHOL_STANDARD": {
    packId: "PACK_ALCOHOL_STANDARD",
    supportedBaseQuestions: [],
    instancesLabel: "Alcohol Incidents",
    packDescription: "Thanks. I'll ask a few quick factual questions to keep things clear.",
    multiInstanceDescription: "Got it. I'll take these one at a time so everything stays clear.",
    maxAiFollowups: 2,
    requiresCompletion: true,
    flagOnUnresolved: "warning",
    usePerFieldProbing: true,
    multiInstance: true,
    factAnchors: [
      { key: "substance_type", label: "Substance type", answerType: "text", priority: 1, multiInstanceAware: true, clarifierStyle: "micro", required: true },
      { key: "approx_month_year", label: "Approx month and year", answerType: "month_year", priority: 2, multiInstanceAware: true, clarifierStyle: "combined", required: true },
      { key: "frequency", label: "Frequency / amount", answerType: "text", priority: 3, multiInstanceAware: true, clarifierStyle: "micro", required: false },
      { key: "last_use", label: "Last use month/year", answerType: "month_year", priority: 4, multiInstanceAware: true, clarifierStyle: "micro", required: false }
    ],
    fields: [
      { fieldKey: "frequency", semanticKey: "frequency", label: "Frequency of Alcohol Use", inputType: "select_single", required: true, options: ["Daily", "Several times per week", "Weekly", "Monthly", "Occasionally", "Rarely", "No longer drink"], aiProbingEnabled: false, includeInFacts: true, factsOrder: 1, includeInInstanceHeader: true, headerOrder: 1 },
      { fieldKey: "binge_episodes", semanticKey: "binge_episodes", label: "Binge Drinking Episodes", inputType: "textarea", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 2 },
      { fieldKey: "blackouts", semanticKey: "blackouts", label: "Memory Blackouts", inputType: "textarea", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 3 },
      { fieldKey: "misconduct", semanticKey: "misconduct", label: "Alcohol-Related Misconduct", inputType: "textarea", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 4 },
      { fieldKey: "unsafe_behaviors", semanticKey: "unsafe_behaviors", label: "Unsafe Behaviors While Drinking", inputType: "textarea", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 5 },
      { fieldKey: "work_impact", semanticKey: "work_impact", label: "Impact on Work/School", inputType: "textarea", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 6 },
      { fieldKey: "treatment_history", semanticKey: "treatment_history", label: "Treatment/Counseling History", inputType: "textarea", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 7 }
    ]
  },

  "PACK_GENERAL_DISCLOSURE_STANDARD": {
    packId: "PACK_GENERAL_DISCLOSURE_STANDARD",
    supportedBaseQuestions: [],
    instancesLabel: "General Disclosures",
    packDescription: "Thanks. I'll ask a few quick factual questions to keep things clear.",
    multiInstanceDescription: "Got it. I'll take these one at a time so everything stays clear.",
    maxAiFollowups: 2,
    requiresCompletion: true,
    flagOnUnresolved: "warning",
    usePerFieldProbing: true,
    multiInstance: true,
    factAnchors: [
      { key: "topic_short", label: "Short topic label", answerType: "text", priority: 1, multiInstanceAware: true, clarifierStyle: "combined", required: true },
      { key: "approx_month_year", label: "Approx month and year", answerType: "month_year", priority: 2, multiInstanceAware: true, clarifierStyle: "combined", required: false },
      { key: "context", label: "Context or location", answerType: "text", priority: 3, multiInstanceAware: true, clarifierStyle: "micro", required: false }
    ],
    fields: [
      { fieldKey: "disclosure_type", semanticKey: "disclosure_type", label: "Nature of Disclosure", inputType: "select_single", required: true, options: ["Integrity concern", "Policy violation", "Personal conduct", "Eligibility issue", "Undisclosed information", "Background concern", "Character issue", "Other"], aiProbingEnabled: false, includeInFacts: true, factsOrder: 1, includeInInstanceHeader: true, headerOrder: 1 },
      { fieldKey: "circumstances", semanticKey: "circumstances", label: "Circumstances", inputType: "textarea", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 2 },
      { fieldKey: "time_period", semanticKey: "time_period", label: "Time Period", inputType: "month_year", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 3, includeInInstanceHeader: true, headerOrder: 2 }
    ]
  },

  "PACK_GENERAL_CRIME_STANDARD": {
    packId: "PACK_GENERAL_CRIME_STANDARD",
    supportedBaseQuestions: [],
    instancesLabel: "Criminal Incidents",
    packDescription: "Please tell the complete story of this criminal incident in your own words.",
    multiInstanceDescription: "Please tell the complete story of this criminal incident in your own words.",
    maxAiFollowups: 4,
    requiresCompletion: true,
    flagOnUnresolved: "red_flag",
    usePerFieldProbing: true,
    useNarrativeFirst: true,
    multiInstance: true,
    requiredAnchors: ["month_year", "location", "what_happened", "outcome"],
    factAnchors: [
      { key: "month_year", label: "When it happened", answerType: "month_year", priority: 1, multiInstanceAware: true, clarifierStyle: "micro", required: true },
      { key: "location", label: "Location", answerType: "text", priority: 2, multiInstanceAware: true, clarifierStyle: "micro", required: true },
      { key: "what_happened", label: "What happened", answerType: "text", priority: 3, multiInstanceAware: true, clarifierStyle: "micro", required: true },
      { key: "outcome", label: "Outcome", answerType: "text", priority: 4, multiInstanceAware: true, clarifierStyle: "micro", required: true }
    ],
    fields: [
      { fieldKey: "PACK_GENERAL_CRIME_Q01", semanticKey: "narrative", label: "In your own words, tell the complete story of this criminal incident. Include roughly when it happened, where it happened, what happened, who was involved, what the outcome was, and why (if you know). Please provide as much detail as you can.", inputType: "textarea", placeholder: "Example: Around March 2019 in Scottsdale, I got into an argument at a bar that turned physical. Police were called. I was arrested for misdemeanor assault but the charges were dismissed after the other person declined to press charges.", required: true, aiProbingEnabled: true, isNarrativeOpener: true, isPrimaryNarrativeField: true, captures: ["month_year", "location", "what_happened", "outcome"], includeInFacts: true, factsOrder: 1, includeInInstanceHeader: true, headerOrder: 1 },
      { fieldKey: "incident_type", semanticKey: "incident_type", label: "Type of Incident", inputType: "select_single", required: true, options: ["Arrest", "Detention", "Charge", "Investigation", "Accusation", "Other"], aiProbingEnabled: false, includeInFacts: true, factsOrder: 2, includeInInstanceHeader: true, headerOrder: 2 },
      { fieldKey: "incident_date", semanticKey: "incident_date", label: "Incident Date", inputType: "month_year", required: true, requiresMissing: ["month_year"], aiProbingEnabled: true, includeInFacts: true, factsOrder: 3, includeInInstanceHeader: true, headerOrder: 3 },
      { fieldKey: "location", semanticKey: "location", label: "Where did this happen?", inputType: "text", required: true, requiresMissing: ["location"], aiProbingEnabled: true, includeInFacts: true, factsOrder: 4 },
      { fieldKey: "description", semanticKey: "description", label: "What happened?", inputType: "textarea", required: true, requiresMissing: ["what_happened"], aiProbingEnabled: true, includeInFacts: true, factsOrder: 5 },
      { fieldKey: "legal_outcome", semanticKey: "legal_outcome", label: "What was the legal outcome?", inputType: "textarea", required: true, requiresMissing: ["outcome"], aiProbingEnabled: true, includeInFacts: true, factsOrder: 6 }
    ]
  },

  "PACK_ASSAULT_STANDARD": {
    packId: "PACK_ASSAULT_STANDARD",
    supportedBaseQuestions: [],
    instancesLabel: "Assault Incidents",
    packDescription: "Thanks. I'll ask a few quick factual questions to keep things clear.",
    multiInstanceDescription: "Got it. I'll take these one at a time so everything stays clear.",
    maxAiFollowups: 2,
    requiresCompletion: true,
    flagOnUnresolved: "red_flag",
    usePerFieldProbing: true,
    multiInstance: true,
    factAnchors: [
      { key: "approx_month_year", label: "Approx month and year", answerType: "month_year", priority: 1, multiInstanceAware: true, clarifierStyle: "combined", required: true },
      { key: "relationship", label: "Relationship to other person", answerType: "text", priority: 2, multiInstanceAware: true, clarifierStyle: "combined", required: true },
      { key: "location", label: "Location", answerType: "text", priority: 3, multiInstanceAware: true, clarifierStyle: "micro", required: false },
      { key: "injury_or_harm", label: "Injury or harm", answerType: "text", priority: 4, multiInstanceAware: true, clarifierStyle: "micro", required: false }
    ],
    fields: [
      { fieldKey: "incident_date", semanticKey: "incident_date", label: "Incident Date", inputType: "month_year", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 1, includeInInstanceHeader: true, headerOrder: 1 },
      { fieldKey: "location", semanticKey: "location", label: "Location", inputType: "text", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 2 },
      { fieldKey: "circumstances", semanticKey: "circumstances", label: "What Happened", inputType: "textarea", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 3 },
      { fieldKey: "injuries", semanticKey: "injuries", label: "Injuries", inputType: "textarea", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 4 },
      { fieldKey: "legal_outcome", semanticKey: "legal_outcome", label: "Legal Outcome", inputType: "textarea", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 5 }
    ]
  },

  "PACK_DOMESTIC_VIOLENCE_STANDARD": {
    packId: "PACK_DOMESTIC_VIOLENCE_STANDARD",
    supportedBaseQuestions: [],
    instancesLabel: "Domestic Violence Incidents",
    packDescription: "Thanks. I'll ask a few quick factual questions to keep things clear.",
    multiInstanceDescription: "Got it. I'll take these one at a time so everything stays clear.",
    maxAiFollowups: 3,
    requiresCompletion: true,
    flagOnUnresolved: "red_flag",
    usePerFieldProbing: true,
    multiInstance: true,
    factAnchors: [
      { key: "approx_month_year", label: "Approx month and year", answerType: "month_year", priority: 1, multiInstanceAware: true, clarifierStyle: "combined", required: true },
      { key: "relationship", label: "Relationship to other person", answerType: "text", priority: 2, multiInstanceAware: true, clarifierStyle: "combined", required: true },
      { key: "location", label: "Location", answerType: "text", priority: 3, multiInstanceAware: true, clarifierStyle: "micro", required: false },
      { key: "injury_or_harm", label: "Injury or harm", answerType: "text", priority: 4, multiInstanceAware: true, clarifierStyle: "micro", required: false }
    ],
    fields: [
      { fieldKey: "incident_date", semanticKey: "incident_date", label: "Incident Date", inputType: "month_year", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 1, includeInInstanceHeader: true, headerOrder: 1 },
      { fieldKey: "location", semanticKey: "location", label: "Location", inputType: "text", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 2 },
      { fieldKey: "relationship", semanticKey: "relationship", label: "Relationship", inputType: "text", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 3, includeInInstanceHeader: true, headerOrder: 2 },
      { fieldKey: "incident_type", semanticKey: "incident_type", label: "Type of Incident", inputType: "select_single", required: true, options: ["Physical assault", "Threats", "Harassment", "Stalking", "Property damage", "Other"], aiProbingEnabled: false, includeInFacts: true, factsOrder: 4 },
      { fieldKey: "circumstances", semanticKey: "circumstances", label: "What Happened", inputType: "textarea", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 5 },
      { fieldKey: "legal_outcome", semanticKey: "legal_outcome", label: "Legal Outcome", inputType: "textarea", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 6 }
    ]
  },

  "PACK_CHILD_ABUSE_STANDARD": {
    packId: "PACK_CHILD_ABUSE_STANDARD",
    supportedBaseQuestions: [],
    instancesLabel: "Child Abuse/Neglect Incidents",
    packDescription: "Thanks. I'll ask a few quick factual questions to keep things clear.",
    multiInstanceDescription: "Got it. I'll take these one at a time so everything stays clear.",
    maxAiFollowups: 3,
    requiresCompletion: true,
    flagOnUnresolved: "red_flag",
    usePerFieldProbing: true,
    multiInstance: true,
    factAnchors: [
      { key: "approx_month_year", label: "Approx month and year", answerType: "month_year", priority: 1, multiInstanceAware: true, clarifierStyle: "combined", required: true },
      { key: "relationship", label: "Relationship to other person", answerType: "text", priority: 2, multiInstanceAware: true, clarifierStyle: "combined", required: true },
      { key: "location", label: "Location", answerType: "text", priority: 3, multiInstanceAware: true, clarifierStyle: "micro", required: false },
      { key: "injury_or_harm", label: "Injury or harm", answerType: "text", priority: 4, multiInstanceAware: true, clarifierStyle: "micro", required: false }
    ],
    fields: [
      { fieldKey: "incident_date", semanticKey: "incident_date", label: "Incident Date", inputType: "month_year", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 1, includeInInstanceHeader: true, headerOrder: 1 },
      { fieldKey: "location", semanticKey: "location", label: "Location", inputType: "text", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 2 },
      { fieldKey: "child_age", semanticKey: "child_age", label: "Child Age", inputType: "text", required: true, aiProbingEnabled: false, includeInFacts: true, factsOrder: 3 },
      { fieldKey: "allegation_type", semanticKey: "allegation_type", label: "Type of Allegation", inputType: "select_single", required: true, options: ["Physical abuse", "Neglect", "Sexual abuse", "Emotional abuse", "Other"], aiProbingEnabled: false, includeInFacts: true, factsOrder: 4, includeInInstanceHeader: true, headerOrder: 2 },
      { fieldKey: "circumstances", semanticKey: "circumstances", label: "Circumstances", inputType: "textarea", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 5 },
      { fieldKey: "investigation_outcome", semanticKey: "investigation_outcome", label: "Investigation Outcome", inputType: "textarea", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 6 }
    ]
  },

  "PACK_THEFT_STANDARD": {
    packId: "PACK_THEFT_STANDARD",
    supportedBaseQuestions: [],
    instancesLabel: "Theft Incidents",
    packDescription: "Thanks. I'll ask a few quick factual questions to keep things clear.",
    multiInstanceDescription: "Got it. I'll take these one at a time so everything stays clear.",
    maxAiFollowups: 2,
    requiresCompletion: true,
    flagOnUnresolved: "red_flag",
    usePerFieldProbing: true,
    multiInstance: true,
    factAnchors: [
      { key: "approx_month_year", label: "Approx month and year", answerType: "month_year", priority: 1, multiInstanceAware: true, clarifierStyle: "combined", required: true },
      { key: "location", label: "Location", answerType: "text", priority: 2, multiInstanceAware: true, clarifierStyle: "combined", required: true },
      { key: "what_happened", label: "Short description", answerType: "text", priority: 3, multiInstanceAware: true, clarifierStyle: "combined", required: false },
      { key: "legal_outcome", label: "Legal outcome", answerType: "text", priority: 4, multiInstanceAware: true, clarifierStyle: "micro", required: false }
    ],
    fields: [
      { fieldKey: "incident_date", semanticKey: "incident_date", label: "Incident Date", inputType: "month_year", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 1, includeInInstanceHeader: true, headerOrder: 1 },
      { fieldKey: "location", semanticKey: "location", label: "Location", inputType: "text", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 2 },
      { fieldKey: "what_stolen", semanticKey: "what_stolen", label: "What Was Taken", inputType: "text", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 3, includeInInstanceHeader: true, headerOrder: 2 },
      { fieldKey: "value", semanticKey: "value", label: "Approximate Value", inputType: "text", required: false, aiProbingEnabled: false, includeInFacts: true, factsOrder: 4 },
      { fieldKey: "circumstances", semanticKey: "circumstances", label: "Circumstances", inputType: "textarea", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 5 },
      { fieldKey: "legal_outcome", semanticKey: "legal_outcome", label: "Legal Outcome", inputType: "textarea", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 6 }
    ]
  },

  "PACK_PROPERTY_CRIME_STANDARD": {
    packId: "PACK_PROPERTY_CRIME_STANDARD",
    supportedBaseQuestions: [],
    instancesLabel: "Property Crime Incidents",
    packDescription: "Thanks. I'll ask a few quick factual questions to keep things clear.",
    multiInstanceDescription: "Got it. I'll take these one at a time so everything stays clear.",
    maxAiFollowups: 2,
    requiresCompletion: true,
    flagOnUnresolved: "red_flag",
    usePerFieldProbing: true,
    multiInstance: true,
    factAnchors: [
      { key: "approx_month_year", label: "Approx month and year", answerType: "month_year", priority: 1, multiInstanceAware: true, clarifierStyle: "combined", required: true },
      { key: "location", label: "Location", answerType: "text", priority: 2, multiInstanceAware: true, clarifierStyle: "combined", required: true },
      { key: "what_happened", label: "Short description", answerType: "text", priority: 3, multiInstanceAware: true, clarifierStyle: "combined", required: false },
      { key: "legal_outcome", label: "Legal outcome", answerType: "text", priority: 4, multiInstanceAware: true, clarifierStyle: "micro", required: false }
    ],
    fields: [
      { fieldKey: "incident_date", semanticKey: "incident_date", label: "Incident Date", inputType: "month_year", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 1, includeInInstanceHeader: true, headerOrder: 1 },
      { fieldKey: "location", semanticKey: "location", label: "Location", inputType: "text", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 2 },
      { fieldKey: "property_type", semanticKey: "property_type", label: "Property Type", inputType: "text", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 3, includeInInstanceHeader: true, headerOrder: 2 },
      { fieldKey: "circumstances", semanticKey: "circumstances", label: "What Happened", inputType: "textarea", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 4 },
      { fieldKey: "legal_outcome", semanticKey: "legal_outcome", label: "Legal Outcome", inputType: "textarea", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 5 }
    ]
  },

  "PACK_FRAUD_STANDARD": {
    packId: "PACK_FRAUD_STANDARD",
    supportedBaseQuestions: [],
    instancesLabel: "Fraud Incidents",
    packDescription: "Thanks. I'll ask a few quick factual questions to keep things clear.",
    multiInstanceDescription: "Got it. I'll take these one at a time so everything stays clear.",
    maxAiFollowups: 2,
    requiresCompletion: true,
    flagOnUnresolved: "red_flag",
    usePerFieldProbing: true,
    multiInstance: true,
    factAnchors: [
      { key: "approx_month_year", label: "Approx month and year", answerType: "month_year", priority: 1, multiInstanceAware: true, clarifierStyle: "combined", required: true },
      { key: "location", label: "Location", answerType: "text", priority: 2, multiInstanceAware: true, clarifierStyle: "combined", required: true },
      { key: "what_happened", label: "Short description", answerType: "text", priority: 3, multiInstanceAware: true, clarifierStyle: "combined", required: false },
      { key: "legal_outcome", label: "Legal outcome", answerType: "text", priority: 4, multiInstanceAware: true, clarifierStyle: "micro", required: false }
    ],
    fields: [
      { fieldKey: "incident_date", semanticKey: "incident_date", label: "Incident Date", inputType: "month_year", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 1, includeInInstanceHeader: true, headerOrder: 1 },
      { fieldKey: "fraud_type", semanticKey: "fraud_type", label: "Type of Fraud", inputType: "select_single", required: true, options: ["Identity theft", "Credit card fraud", "Check fraud", "Insurance fraud", "Forgery", "Embezzlement", "Other"], aiProbingEnabled: false, includeInFacts: true, factsOrder: 2, includeInInstanceHeader: true, headerOrder: 2 },
      { fieldKey: "circumstances", semanticKey: "circumstances", label: "Circumstances", inputType: "textarea", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 3 },
      { fieldKey: "amount_involved", semanticKey: "amount_involved", label: "Amount Involved", inputType: "text", required: false, aiProbingEnabled: false, includeInFacts: true, factsOrder: 4 },
      { fieldKey: "legal_outcome", semanticKey: "legal_outcome", label: "Legal Outcome", inputType: "textarea", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 5 }
    ]
  },

  "PACK_EMPLOYMENT_STANDARD": {
    packId: "PACK_EMPLOYMENT_STANDARD",
    supportedBaseQuestions: [],
    instancesLabel: "Employment Incidents",
    packDescription: "Please tell the complete story of this employment incident in your own words.",
    multiInstanceDescription: "Please tell the complete story of this employment incident in your own words.",
    maxAiFollowups: 4,
    requiresCompletion: true,
    flagOnUnresolved: "warning",
    usePerFieldProbing: true,
    useNarrativeFirst: true,
    multiInstance: true,
    requiredAnchors: ["employer", "month_year", "incident_type", "outcome"],
    factAnchors: [
      { key: "employer", label: "Employer", answerType: "text", priority: 1, multiInstanceAware: true, clarifierStyle: "micro", required: true },
      { key: "month_year", label: "When it happened", answerType: "month_year", priority: 2, multiInstanceAware: true, clarifierStyle: "micro", required: true },
      { key: "incident_type", label: "Type of incident", answerType: "text", priority: 3, multiInstanceAware: true, clarifierStyle: "micro", required: true },
      { key: "outcome", label: "Outcome", answerType: "text", priority: 4, multiInstanceAware: true, clarifierStyle: "micro", required: true }
    ],
    fields: [
      { fieldKey: "PACK_EMPLOYMENT_Q01", semanticKey: "narrative", label: "In your own words, tell the complete story of this prior law enforcement application. Please include:\n• The name of the agency and the city/state\n• The position you applied for\n• When you applied and when the process ended\n• How far you progressed in the hiring process\n• The final outcome (not selected, disqualified, withdrew)\n• Why the process ended (if known)\n• Whether you were told you could reapply\nPlease provide as much detail as possible.", inputType: "textarea", placeholder: "Example: I applied to Phoenix Police Department in Phoenix, Arizona for a Police Officer Recruit position around March 2022. I passed the written test and physical agility test and completed a full background packet. In May 2022, I interviewed with a background investigator and discussed my driving history, including a 2018 at-fault collision and a 2020 speeding citation, both of which I disclosed. In June 2022, the investigator informed me that I was no longer being considered due to my overall driving record. I was not accused of withholding information, and I did not withdraw. The investigator said I could reapply after two years if I had no additional violations.", required: true, aiProbingEnabled: true, isNarrativeOpener: true, isPrimaryNarrativeField: true, captures: ["employer", "month_year", "incident_type", "outcome"], includeInFacts: true, factsOrder: 1, includeInInstanceHeader: true, headerOrder: 1 },
      { fieldKey: "employer", semanticKey: "employer", label: "Employer Name", inputType: "text", required: true, requiresMissing: ["employer"], aiProbingEnabled: true, includeInFacts: true, factsOrder: 2, includeInInstanceHeader: true, headerOrder: 2 },
      { fieldKey: "incident_date", semanticKey: "incident_date", label: "Incident Date", inputType: "month_year", required: true, requiresMissing: ["month_year"], aiProbingEnabled: true, includeInFacts: true, factsOrder: 3, includeInInstanceHeader: true, headerOrder: 3 },
      { fieldKey: "incident_type", semanticKey: "incident_type", label: "Type of Incident", inputType: "select_single", required: true, requiresMissing: ["incident_type"], options: ["Termination", "Discipline", "Resignation", "Investigation", "Performance issue", "Other"], aiProbingEnabled: false, includeInFacts: true, factsOrder: 4 },
      { fieldKey: "circumstances", semanticKey: "circumstances", label: "What Happened", inputType: "textarea", required: true, includeInFacts: true, factsOrder: 5 },
      { fieldKey: "outcome", semanticKey: "outcome", label: "What was the outcome?", inputType: "textarea", required: true, requiresMissing: ["outcome"], aiProbingEnabled: true, includeInFacts: true, factsOrder: 6 }
    ]
  },

  "PACK_STALKING_HARASSMENT_STANDARD": {
    packId: "PACK_STALKING_HARASSMENT_STANDARD",
    supportedBaseQuestions: [],
    instancesLabel: "Stalking/Harassment Incidents",
    packDescription: "Thanks. I'll ask a few quick factual questions to keep things clear.",
    multiInstanceDescription: "Got it. I'll take these one at a time so everything stays clear.",
    maxAiFollowups: 3,
    requiresCompletion: true,
    flagOnUnresolved: "red_flag",
    usePerFieldProbing: true,
    multiInstance: true,
    factAnchors: [
      { key: "approx_month_year", label: "Approx month and year", answerType: "month_year", priority: 1, multiInstanceAware: true, clarifierStyle: "combined", required: true },
      { key: "relationship", label: "Relationship to other person", answerType: "text", priority: 2, multiInstanceAware: true, clarifierStyle: "combined", required: true },
      { key: "location", label: "Location", answerType: "text", priority: 3, multiInstanceAware: true, clarifierStyle: "micro", required: false },
      { key: "injury_or_harm", label: "Injury or harm", answerType: "text", priority: 4, multiInstanceAware: true, clarifierStyle: "micro", required: false }
    ],
    fields: [
      { fieldKey: "incident_date", semanticKey: "incident_date", label: "Incident Date", inputType: "month_year", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 1, includeInInstanceHeader: true, headerOrder: 1 },
      { fieldKey: "behavior_type", semanticKey: "behavior_type", label: "Type of Behavior", inputType: "select_single", required: true, options: ["Stalking", "Harassment", "Threats", "Unwanted contact", "Other"], aiProbingEnabled: false, includeInFacts: true, factsOrder: 2, includeInInstanceHeader: true, headerOrder: 2 },
      { fieldKey: "circumstances", semanticKey: "circumstances", label: "Circumstances", inputType: "textarea", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 3 },
      { fieldKey: "legal_outcome", semanticKey: "legal_outcome", label: "Legal Outcome", inputType: "textarea", required: true, aiProbingEnabled: true, includeInFacts: true, factsOrder: 4 }
    ]
  }
};

/**
 * Build a full V2 FollowUpPack config from a DB row and static defaults.
 * This is the SINGLE source of truth for V2 packs, used by both CandidateInterview and FollowUpPackManagerV2.
 * 
 * GOLDEN PATH: All V2 pack processing MUST use this helper to ensure:
 * - Database V2 fields (openingStrategy, fact_anchors, field_config, etc.) are preserved
 * - Static config provides defaults when DB is null/undefined
 * - Opening narrative, fact anchors, and fields are consistently available to UI and engine
 * 
 * @param {Object} dbPackRow - Raw FollowUpPack row from database
 * @returns {Object} Full V2 pack config object
 */
export function buildV2PackFromDbRow(dbPackRow) {
  if (!dbPackRow) return null;
  
  const packId = dbPackRow.followup_pack_id;
  const staticConfig = FOLLOWUP_PACK_CONFIGS[packId] || {};
  
  // DB ALWAYS WINS for V2-specific fields
  // Static config fills defaults when DB is null/undefined
  return {
    // Core identity (DB wins)
    ...dbPackRow,
    
    // V2 opening narrative (DB wins, static provides defaults)
    openingStrategy: dbPackRow.openingStrategy || staticConfig.openingStrategy || 'none',
    openingFieldKey: dbPackRow.openingFieldKey || staticConfig.openingFieldKey || null,
    openingLabelOverride: dbPackRow.openingLabelOverride || staticConfig.openingLabelOverride || '',
    openingExample: dbPackRow.openingExample || staticConfig.openingExample || '',
    
    // V2 fact anchors (DB wins, static provides defaults)
    fact_anchors: dbPackRow.fact_anchors && dbPackRow.fact_anchors.length > 0 
      ? dbPackRow.fact_anchors 
      : staticConfig.factAnchors || [],
    
    // V2 field config (DB wins, static provides defaults)
    field_config: dbPackRow.field_config && dbPackRow.field_config.length > 0 
      ? dbPackRow.field_config 
      : staticConfig.fields || [],
    
    // Behavioral settings (DB wins, static provides defaults)
    max_ai_followups: dbPackRow.max_ai_followups ?? staticConfig.maxAiFollowups ?? 3,
    behavior_type: dbPackRow.behavior_type || staticConfig.behavior_type || 'standard',
    requires_completion: dbPackRow.requires_completion ?? staticConfig.requiresCompletion ?? true,
    max_probe_loops: dbPackRow.max_probe_loops ?? staticConfig.max_probe_loops ?? null,
    
    // Metadata (preserve all)
    version: dbPackRow.version || 'v1',
    is_standard_cluster: dbPackRow.is_standard_cluster ?? false,
    cluster_code: dbPackRow.cluster_code || packId,
    
    // Static config references (for engine compatibility)
    packId: packId,
    instancesLabel: staticConfig.instancesLabel || dbPackRow.pack_name || packId,
    packDescription: staticConfig.packDescription || dbPackRow.description || '',
    multiInstanceDescription: staticConfig.multiInstanceDescription || dbPackRow.description || '',
    supportedBaseQuestions: staticConfig.supportedBaseQuestions || [],
    requiredAnchors: staticConfig.requiredAnchors || [],
    targetAnchors: staticConfig.targetAnchors || [],
    excludeFromProbing: staticConfig.excludeFromProbing || [],
    flagOnUnresolved: staticConfig.flagOnUnresolved || 'warning',
    usePerFieldProbing: staticConfig.usePerFieldProbing ?? true,
    useNarrativeFirst: staticConfig.useNarrativeFirst ?? false,
    multiInstance: staticConfig.multiInstance ?? true
  };
}

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

// AUDIT LOG: PACK_PRIOR_LE_APPS_STANDARD config (safe - runs after FOLLOWUP_PACK_CONFIGS is initialized)
const priorLePack = FOLLOWUP_PACK_CONFIGS && FOLLOWUP_PACK_CONFIGS["PACK_PRIOR_LE_APPS_STANDARD"];
if (priorLePack) {
  const fieldConfig = priorLePack.field_config || priorLePack.fields || [];
  
  const priorLeSummary = Array.isArray(fieldConfig) 
    ? fieldConfig.map((fc) => ({
        fieldKey: fc.fieldKey || fc.id || null,
        label: fc.label || null,
        fallbackQuestion: fc.fallbackQuestion || null,
      }))
    : Object.keys(fieldConfig).map((fieldKey) => {
        const fc = fieldConfig[fieldKey] || {};
        return {
          fieldKey,
          label: fc.label || null,
          fallbackQuestion: fc.fallbackQuestion || null,
        };
      });

  console.log("[FOLLOWUP_CONFIG_AUDIT][PRIOR_LE]", priorLeSummary);
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