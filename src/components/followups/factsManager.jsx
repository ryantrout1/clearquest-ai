/**
 * Facts Manager for PACK_LE_APPS
 * 
 * Stores final validated values as facts for each field,
 * separate from raw follow-up answers.
 */

import { FOLLOWUP_PACK_CONFIGS } from "./followupPackConfig";

const UNKNOWN_TOKENS = ["i don't recall", "idk", "unknown", "not sure", "i don't know", ""];

/**
 * Update a fact for a specific field when it becomes complete
 * ONLY for PACK_LE_APPS
 */
export function updateFactForField({
  packId,
  instance,
  fieldKey,
  finalValue,
  source = "user"
}) {
  // Only PACK_LE_APPS uses facts pipeline
  if (packId !== "PACK_LE_APPS") return;
  
  const packConfig = FOLLOWUP_PACK_CONFIGS[packId];
  if (!packConfig) return;

  const fieldConfig = packConfig.fields.find(f => f.fieldKey === fieldKey);
  if (!fieldConfig) return;

  const semanticKey = fieldConfig.semanticKey;
  if (!semanticKey) return;

  if (!instance.facts) instance.facts = {};

  const trimmed = (finalValue || "").trim();
  const isUnknown = trimmed === "" || UNKNOWN_TOKENS.includes(trimmed.toLowerCase());

  instance.facts[semanticKey] = {
    value: finalValue,
    status: isUnknown ? "unknown" : "confirmed",
    source
  };
  
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