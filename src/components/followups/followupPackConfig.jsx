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
 */

/**
 * @typedef {Object} FollowUpPackConfig
 * @property {string} packId - Pack identifier, e.g. "PACK_LE_APPS"
 * @property {string[]} supportedBaseQuestions - Base questions that trigger this pack
 * @property {string} [instancesLabel] - Label for instances, e.g. "Applications"
 * @property {FollowUpFieldConfig[]} fields - Field configurations
 */

/** @type {Record<string, FollowUpPackConfig>} */
export const FOLLOWUP_PACK_CONFIGS = {
  "PACK_LE_APPS": {
    packId: "PACK_LE_APPS",
    supportedBaseQuestions: ["Q001"],
    instancesLabel: "Applications",
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
        includeInNarrative: true
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
        includeInNarrative: true
      },
      {
        fieldKey: "PACK_LE_APPS_Q1764025187292",
        semanticKey: "application_month_year",
        label: "Application date (month/year)",
        inputType: "month_year",
        placeholder: "e.g., June 2020 or 06/2020",
        required: true,
        aiProbingEnabled: true,
        maxProbes: 3,
        probeInstructionOverride: "The candidate gave a vague date. Ask for at least an approximate timeframe like 'around 2020' or 'early 2019'.",
        includeInFacts: true,
        factsOrder: 3,
        includeInInstanceHeader: true,
        headerOrder: 3,
        includeInNarrative: true
      },
      {
        fieldKey: "PACK_LE_APPS_Q1764025199138",
        semanticKey: "outcome",
        label: "Outcome",
        inputType: "select_single",
        placeholder: "Select outcome",
        options: ["Hired", "Not selected", "Withdrew", "Process discontinued", "Still in process", "Other"],
        required: true,
        aiProbingEnabled: false,
        includeInFacts: true,
        factsOrder: 4,
        includeInInstanceHeader: false,
        includeInNarrative: true
      },
      {
        fieldKey: "PACK_LE_APPS_Q1764025212764",
        semanticKey: "reason_not_selected",
        label: "Reason provided by agency",
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
        maxProbes: 2,
        includeInFacts: true,
        factsOrder: 5,
        includeInInstanceHeader: false,
        includeInNarrative: true
      },
      {
        fieldKey: "PACK_LE_APPS_Q1764025246583",
        semanticKey: "issues_or_concerns",
        label: "Issues or concerns during hiring",
        inputType: "text",
        placeholder: "Any issues or concerns?",
        required: false,
        aiProbingEnabled: true,
        maxProbes: 2,
        includeInFacts: true,
        factsOrder: 6,
        includeInInstanceHeader: false,
        includeInNarrative: true
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
 * @param {string} packId 
 * @param {Record<string, string>} values - Values keyed by fieldKey
 * @param {Array} [aiExchanges] - AI probing exchanges for value override
 * @returns {Array<{label: string, value: string}>}
 */
export function extractFactsFromConfig(packId, values, aiExchanges = []) {
  const factsFields = getFactsFields(packId);
  if (factsFields.length === 0) return [];
  
  // Build AI clarification map
  const aiClarifications = {};
  aiExchanges.forEach(ex => {
    const question = (ex.probing_question || '').toLowerCase();
    const answer = ex.candidate_response;
    
    // Skip vague answers
    if (!answer || answer.toLowerCase() === "i don't recall" || answer.toLowerCase() === "i don't know") {
      return;
    }
    
    // Match probe question to semantic field
    if (question.includes('timeframe') || question.includes('when') || question.includes('date') || question.includes('month') || question.includes('year')) {
      aiClarifications['application_month_year'] = answer;
    } else if (question.includes('agency') || question.includes('department')) {
      aiClarifications['agency'] = answer;
    } else if (question.includes('position') || question.includes('role') || question.includes('job')) {
      aiClarifications['position'] = answer;
    } else if (question.includes('outcome') || question.includes('result') || question.includes('hired')) {
      aiClarifications['outcome'] = answer;
    } else if (question.includes('reason') || question.includes('why')) {
      aiClarifications['reason_not_selected'] = answer;
    } else if (question.includes('issue') || question.includes('concern') || question.includes('problem')) {
      aiClarifications['issues_or_concerns'] = answer;
    }
  });
  
  const facts = [];
  
  // Log what we're working with
  console.log("[extractFactsFromConfig]", {
    packId,
    valueKeys: Object.keys(values),
    factsFieldsCount: factsFields.length,
    aiClarifications
  });
  
  factsFields.forEach(field => {
    // First check AI clarification by semanticKey
    let value = aiClarifications[field.semanticKey];
    
    // Then check stored value by fieldKey (e.g., "PACK_LE_APPS_Q1")
    if (!value) {
      value = values[field.fieldKey];
    }
    
    // Then check by semanticKey (e.g., "agency")
    if (!value) {
      value = values[field.semanticKey];
    }
    
    // Also check common alternate key patterns
    if (!value && packId === 'PACK_LE_APPS') {
      // Try alternate naming patterns that might be in the data
      const alternateKeys = {
        'agency': ['agency_name', 'agency'],
        'position': ['position_applied', 'position'],
        'application_month_year': ['application_date', 'application_month_year', 'date'],
        'outcome': ['application_outcome', 'outcome'],
        'reason_not_selected': ['why_not_selected', 'reason_not_selected', 'reason'],
        'issues_or_concerns': ['hiring_issues', 'issues_or_concerns', 'anything_else', 'issues']
      };
      
      const alts = alternateKeys[field.semanticKey] || [];
      for (const altKey of alts) {
        if (values[altKey]) {
          value = values[altKey];
          break;
        }
      }
    }
    
    console.log("[extractFactsFromConfig] field lookup", {
      fieldKey: field.fieldKey,
      semanticKey: field.semanticKey,
      foundValue: value,
      aiOverride: aiClarifications[field.semanticKey]
    });
    
    if (value) {
      facts.push({
        label: field.label,
        value: value
      });
    }
  });
  
  return facts;
}