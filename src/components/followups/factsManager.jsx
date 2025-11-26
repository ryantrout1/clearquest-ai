/**
 * Facts Manager for PACK_LE_APPS
 * 
 * Stores final validated values as facts for each field,
 * separate from raw follow-up answers.
 * 
 * Handles unresolved fields when max probes are reached without a usable answer.
 */

import { FOLLOWUP_PACK_CONFIGS, DEFAULT_UNKNOWN_TOKENS } from "./followupPackConfig";

/**
 * Check if a value is considered "unknown" based on field config
 */
export function isUnknownValue(value, fieldConfig) {
  const trimmed = (value || "").trim();
  if (trimmed === "") return true;
  
  const tokens = fieldConfig?.unknownTokens || DEFAULT_UNKNOWN_TOKENS;
  return tokens.includes(trimmed.toLowerCase());
}

/**
 * Update a fact for a specific field when it becomes complete
 * ONLY for PACK_LE_APPS
 * 
 * @param {Object} params
 * @param {string} params.packId - Pack identifier
 * @param {Object} params.instance - Instance object with facts and unresolvedFields
 * @param {string} params.fieldKey - Field key being updated
 * @param {string} params.finalValue - The final value for the field
 * @param {"user"|"ai_probed"} params.source - Source of the value
 * @param {number} params.probeCount - Number of AI probes used for this field
 */
export function updateFactForField({
  packId,
  instance,
  fieldKey,
  finalValue,
  source = "user",
  probeCount = 0
}) {
  // Only PACK_LE_APPS uses facts pipeline
  if (packId !== "PACK_LE_APPS") return;
  
  const packConfig = FOLLOWUP_PACK_CONFIGS[packId];
  if (!packConfig) return;

  const fieldConfig = packConfig.fields.find(f => f.fieldKey === fieldKey);
  if (!fieldConfig) return;

  const semanticKey = fieldConfig.semanticKey;
  if (!semanticKey) return;

  // Initialize facts and unresolvedFields if needed
  if (!instance.facts) instance.facts = {};
  if (!instance.unresolvedFields) instance.unresolvedFields = [];

  const isUnknown = isUnknownValue(finalValue, fieldConfig);
  
  // Get pack-level max probes setting
  const maxProbes = packConfig.maxAiProbes ?? 3;
  const reachedProbeLimit = maxProbes > 0 && probeCount >= maxProbes;
  
  // "unresolved" means: we hit probe limit AND still have only an unknown token
  const isUnresolved = reachedProbeLimit && isUnknown;

  if (isUnresolved) {
    // Use the unknownDisplayLabel from field config or generate default
    const displayValue = fieldConfig.unknownDisplayLabel || 
      `Not recalled after ${probeCount} attempts`;
    
    instance.facts[semanticKey] = {
      value: displayValue,
      status: "unknown",
      source
    };
    
    // Add to unresolvedFields if not already there
    const existingUnresolved = instance.unresolvedFields.find(
      uf => uf.semanticKey === semanticKey
    );
    if (!existingUnresolved) {
      instance.unresolvedFields.push({
        semanticKey,
        fieldKey,
        probeCount
      });
    }
  } else {
    // Normal case: store the confirmed or unknown fact
    instance.facts[semanticKey] = {
      value: finalValue,
      status: isUnknown ? "unknown" : "confirmed",
      source
    };
    
    // Remove from unresolvedFields if it was there (e.g., candidate provided answer later)
    instance.unresolvedFields = instance.unresolvedFields.filter(
      uf => uf.semanticKey !== semanticKey
    );
  }
  
  return instance.facts;
}

/**
 * Build facts object from additional_details for legacy data
 * that doesn't have facts stored yet
 */
export function buildFactsFromDetails(packId, additionalDetails, aiExchanges = []) {
  if (packId !== "PACK_LE_APPS") return {};
  
  const packConfig = FOLLOWUP_PACK_CONFIGS[packId];
  if (!packConfig) return {};
  
  // Build AI clarification map from probing exchanges
  const aiClarifications = {};
  (aiExchanges || []).forEach(ex => {
    const question = (ex.probing_question || '').toLowerCase();
    const answer = ex.candidate_response;
    
    if (!answer) return;
    const answerLower = answer.toLowerCase().trim();
    if (UNKNOWN_TOKENS.includes(answerLower)) return;
    
    // Match probe question to semantic field
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
  
  const facts = {};
  
  packConfig.fields.forEach(field => {
    let value = additionalDetails?.[field.fieldKey];
    let source = "user";
    
    // Check if stored value is vague
    const storedIsVague = value && UNKNOWN_TOKENS.includes(value.toLowerCase().trim());
    
    // If stored value is vague but AI clarification exists, use clarification
    if (storedIsVague && aiClarifications[field.semanticKey]) {
      value = aiClarifications[field.semanticKey];
      source = "ai_probed";
    }
    
    if (value && value.trim() !== "") {
      const isUnknown = UNKNOWN_TOKENS.includes(value.toLowerCase().trim());
      facts[field.semanticKey] = {
        value: value,
        status: isUnknown ? "unknown" : "confirmed",
        source
      };
    }
  });
  
  return facts;
}

/**
 * Get facts for display, falling back to building from details if needed
 */
export function getInstanceFacts(packId, instance) {
  if (packId !== "PACK_LE_APPS") return {};
  
  // If facts already exist on instance, use them
  if (instance.facts && Object.keys(instance.facts).length > 0) {
    return instance.facts;
  }
  
  // Fall back to building from additional_details + AI exchanges
  const details = instance.details || instance.additional_details || {};
  const aiExchanges = details.investigator_probing || instance.aiExchanges || [];
  
  return buildFactsFromDetails(packId, details, aiExchanges);
}