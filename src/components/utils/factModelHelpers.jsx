/**
 * Fact Model Helpers
 * Utilities for managing fact models and incident fact state for IDE v1
 * 
 * NOTE: These helpers are data-only. No interview behavior changes yet.
 */

import { base44 } from "@/api/base44Client";

/**
 * Get the fact model for a specific category
 * @param {string} categoryId - Category identifier (e.g., "DUI", "THEFT")
 * @returns {Promise<object|null>} - FactModel record or null if not found
 */
export async function getFactModelForCategory(categoryId) {
  try {
    const factModels = await base44.entities.FactModel.filter({ category_id: categoryId });
    if (factModels.length > 0) {
      return normalizeFactModel(factModels[0]);
    }
    return null;
  } catch (err) {
    console.error("[FactModelHelpers] Error loading fact model for category:", categoryId, err);
    return null;
  }
}

/**
 * Get all fact models
 * @returns {Promise<object[]>} - Array of FactModel records
 */
export async function getAllFactModels() {
  try {
    const factModels = await base44.entities.FactModel.list();
    return factModels.map(normalizeFactModel);
  } catch (err) {
    console.error("[FactModelHelpers] Error loading all fact models:", err);
    return [];
  }
}

/**
 * Normalize a fact model from the database (handles nested data property)
 */
function normalizeFactModel(record) {
  const data = record.data || record;
  return {
    id: record.id,
    categoryId: data.category_id,
    categoryLabel: data.category_label,
    mandatoryFacts: data.mandatory_facts || [],
    optionalFacts: data.optional_facts || [],
    severityFacts: data.severity_facts || [],
    isReadyForAiProbing: data.is_ready_for_ai_probing || false,
    description: data.description || "",
    linkedPackIds: data.linked_pack_ids || []
  };
}

/**
 * Get missing mandatory facts from a fact state
 * @param {object} factModel - Normalized fact model with mandatoryFacts array
 * @param {object} factState - Fact state object with facts map
 * @returns {string[]} - Array of missing fact keys
 */
export function getMissingFacts(factModel, factState) {
  if (!factModel || !factModel.mandatoryFacts) return [];
  if (!factState || !factState.facts) return [...factModel.mandatoryFacts];
  
  const missingFacts = [];
  for (const factKey of factModel.mandatoryFacts) {
    const value = factState.facts[factKey];
    if (value === null || value === undefined || value === "") {
      missingFacts.push(factKey);
    }
  }
  return missingFacts;
}

/**
 * Get all collected facts (non-null values)
 * @param {object} factState - Fact state object with facts map
 * @returns {object} - Map of factKey to value for collected facts only
 */
export function getCollectedFacts(factState) {
  if (!factState || !factState.facts) return {};
  
  const collected = {};
  for (const [key, value] of Object.entries(factState.facts)) {
    if (value !== null && value !== undefined && value !== "") {
      collected[key] = value;
    }
  }
  return collected;
}

/**
 * Initialize a fact state for a given category/fact model
 * @param {object} factModel - Normalized fact model
 * @returns {object} - Initialized fact state with all facts set to null
 */
export function initializeFactStateForCategory(factModel) {
  if (!factModel) {
    return {
      facts: {},
      completionStatus: "incomplete",
      severity: null,
      probeCount: 0,
      nonSubstantiveCount: 0,
      stopReason: null
    };
  }
  
  const facts = {};
  
  // Combine all fact keys (mandatory + optional + severity)
  const allFactKeys = new Set([
    ...(factModel.mandatoryFacts || []),
    ...(factModel.optionalFacts || []),
    ...(factModel.severityFacts || [])
  ]);
  
  for (const key of allFactKeys) {
    facts[key] = null;
  }
  
  return {
    facts,
    completionStatus: "incomplete",
    severity: null,
    probeCount: 0,
    nonSubstantiveCount: 0,
    stopReason: null
  };
}

/**
 * Create a new incident object for tracking
 * @param {object} params - Incident parameters
 * @param {string} params.categoryId - Category identifier
 * @param {string} params.questionCode - Question that triggered the incident
 * @param {string} params.questionId - Database ID of the question
 * @param {number} params.instanceNumber - Instance number (default 1)
 * @param {object} factModel - Fact model for the category (optional)
 * @returns {object} - New incident object with initialized fact state
 */
export function createIncident({ categoryId, questionCode, questionId, instanceNumber = 1 }, factModel = null) {
  const incidentId = `incident_${categoryId}_${questionCode}_${instanceNumber}_${Date.now()}`;
  
  return {
    incidentId,
    categoryId,
    questionCode,
    questionId,
    instanceNumber,
    factState: initializeFactStateForCategory(factModel),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/**
 * Update fact state from an answer (SKELETON - no AI extraction yet)
 * This is a placeholder that will be enhanced in a future prompt to call AI
 * 
 * @param {object} factState - Current fact state
 * @param {object} factModel - Fact model for the category
 * @param {string} answerText - Candidate's answer text
 * @returns {object} - Updated fact state (currently unchanged)
 */
export function updateFactStateFromAnswer(factState, factModel, answerText) {
  // PLACEHOLDER: In a future prompt, this will:
  // 1. Call AI to extract facts from answerText
  // 2. Update factState.facts with extracted values
  // 3. Recalculate completionStatus
  // 4. Determine severity if all severity facts are collected
  
  // For now, return unchanged fact state
  console.log("[FactModelHelpers] updateFactStateFromAnswer called (skeleton - no changes)", {
    factStateKeys: Object.keys(factState?.facts || {}),
    factModelCategory: factModel?.categoryId,
    answerLength: answerText?.length
  });
  
  return factState;
}

/**
 * Check if an incident's mandatory facts are complete
 * @param {object} factModel - Fact model for the category
 * @param {object} factState - Current fact state
 * @returns {boolean} - True if all mandatory facts have values
 */
export function isMandatoryFactsComplete(factModel, factState) {
  const missing = getMissingFacts(factModel, factState);
  return missing.length === 0;
}

/**
 * Calculate completion percentage for an incident
 * @param {object} factModel - Fact model for the category
 * @param {object} factState - Current fact state
 * @returns {number} - Percentage (0-100) of mandatory facts collected
 */
export function calculateCompletionPercent(factModel, factState) {
  if (!factModel || !factModel.mandatoryFacts || factModel.mandatoryFacts.length === 0) {
    return 100; // No mandatory facts = complete
  }
  
  const missing = getMissingFacts(factModel, factState);
  const collected = factModel.mandatoryFacts.length - missing.length;
  return Math.round((collected / factModel.mandatoryFacts.length) * 100);
}

/**
 * Get incidents from a session by category
 * @param {object} session - InterviewSession record
 * @param {string} categoryId - Category to filter by (optional)
 * @returns {object[]} - Array of incidents
 */
export function getSessionIncidents(session, categoryId = null) {
  const incidents = session?.incidents || [];
  if (!categoryId) return incidents;
  return incidents.filter(inc => inc.categoryId === categoryId);
}

/**
 * Find an incident in a session by ID
 * @param {object} session - InterviewSession record
 * @param {string} incidentId - Incident ID to find
 * @returns {object|null} - Incident or null
 */
export function findIncidentById(session, incidentId) {
  const incidents = session?.incidents || [];
  return incidents.find(inc => inc.incidentId === incidentId) || null;
}

/**
 * Map a follow-up pack ID to a category ID
 * This helps bridge the deterministic pack system with the new fact model system
 * @param {string} packId - Follow-up pack ID (e.g., "PACK_DRIVING_DUIDWI_STANDARD")
 * @returns {string|null} - Category ID or null if not mapped
 */
export function mapPackIdToCategory(packId) {
  if (!packId) return null;
  
  // EXPLICIT PACK MAPPING (highest priority)
  const EXPLICIT_PACK_TO_CATEGORY = {
    'PACK_PRIOR_LE_APPS_STANDARD': 'PRIOR_LE_APPS',
    'PACK_INTEGRITY_APPS': 'INTEGRITY_APPS'
  };
  
  if (EXPLICIT_PACK_TO_CATEGORY[packId]) {
    console.log('[V3_PACK][CATEGORY_RESOLVED]', {
      packId,
      categoryId: EXPLICIT_PACK_TO_CATEGORY[packId],
      source: 'explicit_mapping'
    });
    return EXPLICIT_PACK_TO_CATEGORY[packId];
  }
  
  const packUpper = packId.toUpperCase();
  
  // DUI/DWI related packs
  if (packUpper.includes('DUI') || packUpper.includes('DWI')) {
    return 'DUI';
  }
  
  // Domestic violence
  if (packUpper.includes('DOMESTIC') || packUpper.includes('FAMILY_VIOLENCE')) {
    return 'DOMESTIC_VIOLENCE';
  }
  
  // Theft/dishonesty
  if (packUpper.includes('THEFT') || packUpper.includes('DISHONESTY') || packUpper.includes('STEALING')) {
    return 'THEFT';
  }
  
  // Drug use
  if (packUpper.includes('DRUG') || packUpper.includes('SUBSTANCE') || packUpper.includes('MARIJUANA')) {
    return 'DRUG_USE';
  }
  
  // Financial
  if (packUpper.includes('FINANCIAL') || packUpper.includes('DEBT') || packUpper.includes('CREDIT')) {
    return 'FINANCIAL';
  }
  
  // Employment
  if (packUpper.includes('EMPLOYMENT') || packUpper.includes('TERMINATED') || packUpper.includes('WORKPLACE')) {
    return 'EMPLOYMENT';
  }
  
  // Driving violations (non-DUI)
  if (packUpper.includes('DRIVING') || packUpper.includes('TRAFFIC') || packUpper.includes('COLLISION')) {
    return 'DRIVING';
  }
  
  // Criminal/police contact
  if (packUpper.includes('CRIME') || packUpper.includes('ARREST') || packUpper.includes('POLICE')) {
    return 'CRIMINAL';
  }
  
  // Prior LE applications
  if (packUpper.includes('LE_APP') || packUpper.includes('PRIOR') || packUpper.includes('APPLICATION')) {
    return 'PRIOR_LE_APPS';
  }
  
  // Application integrity issues
  if (packUpper.includes('INTEGRITY')) {
    return 'INTEGRITY_APPS';
  }
  
  // EXPLICIT PACK MAPPING (highest priority - checked first)
  const EXPLICIT_PACK_TO_CATEGORY = {
    'PACK_PRIOR_LE_APPS_STANDARD': 'PRIOR_LE_APPS',
    'PACK_INTEGRITY_APPS': 'INTEGRITY_APPS'
  };
  
  if (EXPLICIT_PACK_TO_CATEGORY[packId]) {
    return EXPLICIT_PACK_TO_CATEGORY[packId];
  }
  
  return null;
}