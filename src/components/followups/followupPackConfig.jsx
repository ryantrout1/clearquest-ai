/**
 * Centralized Follow-Up Pack Configuration
 * 
 * This module provides config-driven behavior for follow-up packs,
 * including field definitions, input types, skip logic, and display rules.
 */

/**
 * @typedef {Object} SkipRule
 * @property {string} whenField - semantic key to check
 * @property {string} [equals] - skip if field equals this value
 * @property {string} [notEquals] - skip if field does not equal this value
 * @property {"skip"} then - action to take
 */

/**
 * @typedef {Object} FollowUpFieldConfig
 * @property {string} fieldKey - database field key (e.g., PACK_LE_APPS_Q1)
 * @property {string} semanticKey - human-readable key for logic (e.g., "agency")
 * @property {string} label - display label for investigators
 * @property {"text"|"textarea"|"month_year"|"date"|"number"|"yes_no"|"select_single"} inputType
 * @property {string} [placeholder]
 * @property {string} [helpText]
 * @property {boolean} [required]
 * @property {string[]} [options] - for select_single type
 * @property {SkipRule[]} [skipWhen]
 * @property {boolean} [aiProbingEnabled]
 * @property {number} [maxProbes]
 * @property {string} [probeInstructionOverride]
 * @property {boolean} [includeInFacts]
 * @property {number} [factsOrder]
 * @property {boolean} [includeInInstanceHeader]
 * @property {number} [headerOrder]
 * @property {boolean} [includeInNarrative]
 */

/**
 * @typedef {Object} FollowUpPackConfig
 * @property {string} packId
 * @property {string[]} supportedBaseQuestions
 * @property {string} [instancesLabel]
 * @property {FollowUpFieldConfig[]} fields
 */

/** @type {Record<string, FollowUpPackConfig>} */
export const FOLLOWUP_PACK_CONFIGS = {
  PACK_LE_APPS: {
    packId: "PACK_LE_APPS",
    supportedBaseQuestions: ["Q001"],
    instancesLabel: "Application",
    fields: [
      {
        fieldKey: "PACK_LE_APPS_Q1",
        semanticKey: "agency",
        label: "Agency",
        inputType: "text",
        placeholder: "Enter agency name",
        required: true,
        aiProbingEnabled: true,
        maxProbes: 2,
        includeInFacts: true,
        factsOrder: 1,
        includeInInstanceHeader: true,
        headerOrder: 1,
        includeInNarrative: true,
      },
      {
        fieldKey: "PACK_LE_APPS_Q1764025170356",
        semanticKey: "position",
        label: "Position applied for",
        inputType: "text",
        placeholder: "Enter position title",
        required: true,
        aiProbingEnabled: true,
        maxProbes: 2,
        includeInFacts: true,
        factsOrder: 2,
        includeInInstanceHeader: true,
        headerOrder: 2,
        includeInNarrative: true,
      },
      {
        fieldKey: "PACK_LE_APPS_Q1764025187292",
        semanticKey: "application_month_year",
        label: "Application date (month/year)",
        inputType: "month_year",
        placeholder: "e.g., June 2020 or 06/2020",
        helpText: "Provide month and year if possible, or approximate timeframe",
        required: true,
        aiProbingEnabled: true,
        maxProbes: 3,
        probeInstructionOverride: "If the candidate says they don't recall, ask for an approximate timeframe like 'around 2020' or 'early 2019'.",
        includeInFacts: true,
        factsOrder: 3,
        includeInInstanceHeader: true,
        headerOrder: 3,
        includeInNarrative: true,
      },
      {
        fieldKey: "PACK_LE_APPS_Q1764025199138",
        semanticKey: "outcome",
        label: "Outcome",
        inputType: "select_single",
        placeholder: "Select outcome",
        required: true,
        options: [
          "Hired",
          "Not selected",
          "Withdrew application",
          "Still in process",
          "Disqualified",
          "Other"
        ],
        aiProbingEnabled: true,
        maxProbes: 2,
        includeInFacts: true,
        factsOrder: 4,
        includeInInstanceHeader: false,
        includeInNarrative: true,
      },
      {
        fieldKey: "PACK_LE_APPS_Q1764025212764",
        semanticKey: "reason_not_selected",
        label: "Reason provided by agency",
        inputType: "textarea",
        placeholder: "What reason did they give?",
        helpText: "Enter the reason the agency provided for not selecting you",
        required: false,
        skipWhen: [
          { whenField: "outcome", notEquals: "Not selected", then: "skip" },
          { whenField: "outcome", notEquals: "Disqualified", then: "skip" }
        ],
        aiProbingEnabled: true,
        maxProbes: 2,
        includeInFacts: true,
        factsOrder: 5,
        includeInInstanceHeader: false,
        includeInNarrative: true,
      },
      {
        fieldKey: "PACK_LE_APPS_Q1764025246583",
        semanticKey: "issues_or_concerns",
        label: "Issues or concerns during hiring",
        inputType: "yes_no",
        placeholder: "Yes or No",
        helpText: "Were there any issues or concerns raised during the hiring process?",
        required: true,
        aiProbingEnabled: true,
        maxProbes: 3,
        probeInstructionOverride: "If the candidate answers Yes, probe for specific details about what the issues or concerns were.",
        includeInFacts: true,
        factsOrder: 6,
        includeInInstanceHeader: false,
        includeInNarrative: true,
      },
    ],
  },
};

/**
 * Get config for a follow-up pack by ID
 * @param {string} packId 
 * @returns {FollowUpPackConfig | null}
 */
export function getPackConfig(packId) {
  return FOLLOWUP_PACK_CONFIGS[packId] || null;
}

/**
 * Get config for a pack that supports a given base question
 * @param {string} questionId 
 * @param {string} packId 
 * @returns {FollowUpPackConfig | null}
 */
export function getPackConfigForQuestion(questionId, packId) {
  const config = FOLLOWUP_PACK_CONFIGS[packId];
  if (config && config.supportedBaseQuestions.includes(questionId)) {
    return config;
  }
  return null;
}

/**
 * Get field config by fieldKey
 * @param {string} packId 
 * @param {string} fieldKey 
 * @returns {FollowUpFieldConfig | null}
 */
export function getFieldConfig(packId, fieldKey) {
  const pack = FOLLOWUP_PACK_CONFIGS[packId];
  if (!pack) return null;
  return pack.fields.find(f => f.fieldKey === fieldKey) || null;
}

/**
 * Get field config by semanticKey
 * @param {string} packId 
 * @param {string} semanticKey 
 * @returns {FollowUpFieldConfig | null}
 */
export function getFieldBySemanticKey(packId, semanticKey) {
  const pack = FOLLOWUP_PACK_CONFIGS[packId];
  if (!pack) return null;
  return pack.fields.find(f => f.semanticKey === semanticKey) || null;
}

/**
 * Check if a field should be skipped based on current instance values
 * @param {FollowUpFieldConfig} fieldConfig 
 * @param {Record<string, string>} instanceValues - current values keyed by semanticKey
 * @returns {boolean}
 */
export function shouldSkipField(fieldConfig, instanceValues) {
  if (!fieldConfig.skipWhen || fieldConfig.skipWhen.length === 0) {
    return false;
  }
  
  // For fields with multiple skip rules, ALL rules must match for the field to show
  // If ANY rule says "skip", we skip (OR logic for skipping)
  // Actually, let's use AND logic: skip only if ALL conditions are met
  // Re-reading the spec: "skip when outcome !== 'Not selected'" means we skip if outcome is NOT "Not selected"
  
  // Multiple skipWhen rules with the same logic:
  // For reason_not_selected, we want to show it when outcome IS "Not selected" OR "Disqualified"
  // The current rules say: skip when outcome notEquals "Not selected" AND skip when outcome notEquals "Disqualified"
  // With AND logic, both would need to be true to skip
  // So: skip if (outcome !== "Not selected" AND outcome !== "Disqualified")
  // Which means: show if (outcome === "Not selected" OR outcome === "Disqualified")
  
  for (const rule of fieldConfig.skipWhen) {
    const currentValue = instanceValues[rule.whenField];
    
    if (rule.equals !== undefined) {
      // Skip if value equals
      if (currentValue === rule.equals) {
        continue; // This rule matches for skip, check others
      } else {
        return false; // This rule doesn't match, don't skip
      }
    }
    
    if (rule.notEquals !== undefined) {
      // Skip if value does NOT equal
      if (currentValue !== rule.notEquals) {
        continue; // This rule matches for skip, check others
      } else {
        return false; // Value equals the notEquals value, so don't skip
      }
    }
  }
  
  // All rules matched → skip
  return true;
}

/**
 * Get fields to display in Facts panel, sorted by factsOrder
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
 * Get fields to display in instance header, sorted by headerOrder
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
 * Build instance header summary from values
 * @param {string} packId 
 * @param {Record<string, string>} values - keyed by fieldKey or semanticKey
 * @returns {string}
 */
export function buildInstanceHeader(packId, values) {
  const headerFields = getHeaderFields(packId);
  const parts = [];
  
  for (const field of headerFields) {
    const value = values[field.fieldKey] || values[field.semanticKey];
    if (value && value.trim()) {
      parts.push(value.trim());
    }
  }
  
  return parts.join(' • ');
}

/**
 * Extract facts from instance values for display
 * @param {string} packId 
 * @param {Record<string, string>} values - keyed by fieldKey
 * @param {Array} [aiExchanges] - AI probing exchanges to check for clarifications
 * @returns {Array<{label: string, value: string, semanticKey: string}>}
 */
export function extractFactsFromConfig(packId, values, aiExchanges = []) {
  const factsFields = getFactsFields(packId);
  const facts = [];
  
  // Build AI clarifications map
  const aiClarifications = buildAiClarifications(packId, aiExchanges);
  
  for (const field of factsFields) {
    // First check AI clarifications
    let value = aiClarifications[field.semanticKey];
    
    // If no AI clarification, use original value
    if (!value) {
      value = values[field.fieldKey];
    }
    
    // Skip empty values
    if (!value || !value.trim()) continue;
    
    // Skip "I don't recall" type answers if we have nothing better
    // (but keep them if that's all we have for required fields)
    
    facts.push({
      label: field.label,
      value: value.trim(),
      semanticKey: field.semanticKey,
    });
  }
  
  return facts;
}

/**
 * Build AI clarifications map from probing exchanges
 * @param {string} packId 
 * @param {Array} aiExchanges 
 * @returns {Record<string, string>}
 */
function buildAiClarifications(packId, aiExchanges) {
  const clarifications = {};
  if (!aiExchanges || aiExchanges.length === 0) return clarifications;
  
  const pack = FOLLOWUP_PACK_CONFIGS[packId];
  if (!pack) return clarifications;
  
  for (const ex of aiExchanges) {
    const question = (ex.probing_question || '').toLowerCase();
    const answer = ex.candidate_response;
    
    // Skip vague/non-answers
    if (!answer || 
        answer.toLowerCase() === "i don't recall" || 
        answer.toLowerCase() === "i don't know" ||
        answer.toLowerCase() === "n/a") {
      continue;
    }
    
    // Try to match the probe question to a field
    for (const field of pack.fields) {
      const sk = field.semanticKey.toLowerCase();
      const label = field.label.toLowerCase();
      
      // Check if question relates to this field
      if (
        question.includes(sk) ||
        question.includes(label) ||
        (sk === 'application_month_year' && (question.includes('timeframe') || question.includes('when') || question.includes('date') || question.includes('month') || question.includes('year'))) ||
        (sk === 'agency' && (question.includes('agency') || question.includes('department'))) ||
        (sk === 'position' && (question.includes('position') || question.includes('role') || question.includes('job'))) ||
        (sk === 'outcome' && (question.includes('outcome') || question.includes('result') || question.includes('hired'))) ||
        (sk === 'reason_not_selected' && (question.includes('reason') || question.includes('why'))) ||
        (sk === 'issues_or_concerns' && (question.includes('issue') || question.includes('concern') || question.includes('problem')))
      ) {
        // Only override if we don't have a clarification yet
        if (!clarifications[field.semanticKey]) {
          clarifications[field.semanticKey] = answer;
        }
        break;
      }
    }
  }
  
  return clarifications;
}

/**
 * Map fieldKey to semanticKey for a pack
 * @param {string} packId 
 * @param {Record<string, string>} values - keyed by fieldKey
 * @returns {Record<string, string>} - keyed by semanticKey
 */
export function mapToSemanticKeys(packId, values) {
  const pack = FOLLOWUP_PACK_CONFIGS[packId];
  if (!pack) return values;
  
  const mapped = {};
  for (const field of pack.fields) {
    if (values[field.fieldKey]) {
      mapped[field.semanticKey] = values[field.fieldKey];
    }
  }
  return mapped;
}

/**
 * Get the input widget type for a field
 * @param {string} packId 
 * @param {string} fieldKey 
 * @returns {"text"|"textarea"|"month_year"|"date"|"number"|"yes_no"|"select_single"}
 */
export function getInputType(packId, fieldKey) {
  const field = getFieldConfig(packId, fieldKey);
  return field?.inputType || 'text';
}

/**
 * Get max probes allowed for a field
 * @param {string} packId 
 * @param {string} fieldKey 
 * @returns {number}
 */
export function getMaxProbes(packId, fieldKey) {
  const field = getFieldConfig(packId, fieldKey);
  if (!field) return 3; // default
  if (field.aiProbingEnabled === false) return 0;
  return field.maxProbes ?? 3;
}

/**
 * Check if AI probing is enabled for a field
 * @param {string} packId 
 * @param {string} fieldKey 
 * @returns {boolean}
 */
export function isAiProbingEnabled(packId, fieldKey) {
  const field = getFieldConfig(packId, fieldKey);
  return field?.aiProbingEnabled !== false;
}

/**
 * Get probe instruction override for a field
 * @param {string} packId 
 * @param {string} fieldKey 
 * @returns {string|null}
 */
export function getProbeInstructionOverride(packId, fieldKey) {
  const field = getFieldConfig(packId, fieldKey);
  return field?.probeInstructionOverride || null;
}