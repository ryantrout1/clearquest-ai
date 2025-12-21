/**
 * V3 Fact State Helpers
 * 
 * Utilities for managing incidents and fact_state for Interview V3 (IDE v2).
 * These helpers work with JSON structures and are safe to call multiple times.
 * 
 * NOTE: These are backend-style helpers. They do NOT persist data automatically.
 * The caller must persist the updated session after calling these functions.
 */

/**
 * Initialize fact_state for a category/incident based on a FactModel's V3 fields.
 * 
 * @param {object} session - InterviewSession object
 * @param {string} incidentId - Unique incident identifier
 * @param {object} factModel - FactModel with required_fields and optional_fields arrays
 * @returns {object} - Updated session with initialized fact_state entry
 */
export function initializeFactStateForIncident(session, incidentId, factModel) {
  if (!session || !incidentId) return session;
  
  const factState = { ...(session.fact_state || {}) };
  
  // Extract field_ids from V3 required_fields and optional_fields
  const requiredFieldIds = (factModel?.required_fields || [])
    .map(f => f.field_id)
    .filter(Boolean);
  
  const optionalFieldIds = (factModel?.optional_fields || [])
    .map(f => f.field_id)
    .filter(Boolean);
  
  factState[incidentId] = {
    required_fields_collected: [],
    required_fields_missing: [...requiredFieldIds],
    optional_fields_collected: []
  };
  
  return {
    ...session,
    fact_state: factState
  };
}

/**
 * Update fact_state from collected facts for an incident.
 * Moves fields from "missing" to "collected" as they are filled in.
 * 
 * @param {object} session - InterviewSession object
 * @param {string} incidentId - Unique incident identifier
 * @param {object} factModel - FactModel with required_fields and optional_fields arrays
 * @param {object} newFacts - Map of field_id to collected value
 * @returns {object} - Updated session with updated fact_state
 */
export function updateFactStateFromFacts(session, incidentId, factModel, newFacts) {
  if (!session || !incidentId || !newFacts) return session;
  
  const factState = { ...(session.fact_state || {}) };
  const incidentState = factState[incidentId] || {
    required_fields_collected: [],
    required_fields_missing: [],
    optional_fields_collected: []
  };
  
  // Build sets from V3 field definitions
  const requiredFieldIdSet = new Set(
    (factModel?.required_fields || []).map(f => f.field_id).filter(Boolean)
  );
  const optionalFieldIdSet = new Set(
    (factModel?.optional_fields || []).map(f => f.field_id).filter(Boolean)
  );
  
  // Track what's been collected
  const collectedRequired = new Set(incidentState.required_fields_collected || []);
  const collectedOptional = new Set(incidentState.optional_fields_collected || []);
  
  // Process new facts
  for (const [fieldId, value] of Object.entries(newFacts)) {
    const hasValue = value !== null && value !== undefined && value !== '';
    
    if (hasValue) {
      if (requiredFieldIdSet.has(fieldId)) {
        collectedRequired.add(fieldId);
      } else if (optionalFieldIdSet.has(fieldId)) {
        collectedOptional.add(fieldId);
      }
    }
  }
  
  // Calculate missing required fields
  const missingRequired = [...requiredFieldIdSet].filter(id => !collectedRequired.has(id));
  
  factState[incidentId] = {
    required_fields_collected: [...collectedRequired],
    required_fields_missing: missingRequired,
    optional_fields_collected: [...collectedOptional]
  };
  
  return {
    ...session,
    fact_state: factState
  };
}

/**
 * Add or update an incident in the session's incidents array.
 * If incident_id already exists, updates it. Otherwise, adds a new one.
 * 
 * @param {object} session - InterviewSession object
 * @param {object} incidentPayload - Incident data (must include incident_id)
 * @returns {object} - Updated session with the incident added/updated
 */
export function addOrUpdateIncident(session, incidentPayload) {
  if (!session || !incidentPayload?.incident_id) return session;
  
  const incidents = [...(session.incidents || [])];
  const existingIndex = incidents.findIndex(inc => inc.incident_id === incidentPayload.incident_id);
  
  const now = new Date().toISOString();
  
  if (existingIndex >= 0) {
    // Update existing incident
    incidents[existingIndex] = {
      ...incidents[existingIndex],
      ...incidentPayload,
      updated_at: now
    };
  } else {
    // Add new incident
    incidents.push({
      ...incidentPayload,
      created_at: incidentPayload.created_at || now,
      updated_at: now
    });
  }
  
  return {
    ...session,
    incidents
  };
}

/**
 * Get the list of incomplete (missing) required fields for an incident.
 * 
 * @param {object} session - InterviewSession object
 * @param {string} incidentId - Unique incident identifier
 * @param {object} factModel - FactModel with required_fields array (for labels)
 * @returns {object[]} - Array of { field_id, label, type } for missing required fields
 */
export function getIncompleteRequiredFields(session, incidentId, factModel) {
  if (!session || !incidentId) return [];
  
  const factState = session.fact_state || {};
  const incidentState = factState[incidentId];
  
  if (!incidentState) {
    // If no state exists, all required fields are missing
    return (factModel?.required_fields || []).map(f => ({
      field_id: f.field_id,
      label: f.label,
      type: f.type
    }));
  }
  
  const missingIds = new Set(incidentState.required_fields_missing || []);
  
  return (factModel?.required_fields || [])
    .filter(f => missingIds.has(f.field_id))
    .map(f => ({
      field_id: f.field_id,
      label: f.label,
      type: f.type
    }));
}

/**
 * Check if an incident has all required fields collected.
 * 
 * @param {object} session - InterviewSession object
 * @param {string} incidentId - Unique incident identifier
 * @returns {boolean} - True if all required fields are collected
 */
export function isIncidentComplete(session, incidentId) {
  if (!session || !incidentId) return false;
  
  const factState = session.fact_state || {};
  const incidentState = factState[incidentId];
  
  if (!incidentState) return false;
  
  const missing = incidentState.required_fields_missing || [];
  return missing.length === 0;
}

/**
 * Create a new V3 incident object with proper structure.
 * 
 * @param {object} params - Parameters for the incident
 * @param {string} params.categoryId - Category ID (e.g., CAT_DRIVING)
 * @param {string} params.incidentType - Incident type (e.g., DRIVING_COLLISION)
 * @param {string} [params.questionCode] - Triggering question code
 * @param {string} [params.questionId] - Triggering question database ID
 * @param {number} [params.instanceNumber] - Instance number (default 1)
 * @returns {object} - New incident object
 */
export function createV3Incident({
  categoryId,
  incidentType,
  questionCode = null,
  questionId = null,
  instanceNumber = 1
}) {
  const incidentId = `v3_${categoryId}_${incidentType}_${instanceNumber}_${Date.now()}`;
  
  return {
    incident_id: incidentId,
    category_id: categoryId,
    incident_type: incidentType,
    question_code: questionCode,
    question_id: questionId,
    instance_number: instanceNumber,
    facts: {},
    narrative_summary: null,
    risk_score: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

/**
 * Update facts on an incident object and sync to fact_state.
 * This is a convenience wrapper that updates both the incident and fact_state.
 * 
 * @param {object} session - InterviewSession object
 * @param {string} incidentId - Unique incident identifier
 * @param {object} factModel - FactModel with required_fields and optional_fields
 * @param {object} newFacts - Map of field_id to value to merge
 * @returns {object} - Updated session with both incident.facts and fact_state updated
 */
export function updateIncidentFacts(session, incidentId, factModel, newFacts) {
  if (!session || !incidentId || !newFacts) return session;
  
  // Find and update the incident
  const incidents = [...(session.incidents || [])];
  const idx = incidents.findIndex(inc => inc.incident_id === incidentId);
  
  if (idx >= 0) {
    const incident = incidents[idx];
    incidents[idx] = {
      ...incident,
      facts: {
        ...(incident.facts || {}),
        ...newFacts
      },
      updated_at: new Date().toISOString()
    };
  }
  
  // Update fact_state
  let updatedSession = { ...session, incidents };
  updatedSession = updateFactStateFromFacts(updatedSession, incidentId, factModel, newFacts);
  
  return updatedSession;
}

/**
 * Get an incident by ID from the session.
 * 
 * @param {object} session - InterviewSession object
 * @param {string} incidentId - Unique incident identifier
 * @returns {object|null} - The incident object or null if not found
 */
export function getIncidentById(session, incidentId) {
  if (!session || !incidentId) return null;
  const incidents = session.incidents || [];
  return incidents.find(inc => inc.incident_id === incidentId) || null;
}

/**
 * Get all incidents for a category.
 * 
 * @param {object} session - InterviewSession object
 * @param {string} categoryId - Category ID to filter by
 * @returns {object[]} - Array of incidents matching the category
 */
export function getIncidentsByCategory(session, categoryId) {
  if (!session || !categoryId) return [];
  const incidents = session.incidents || [];
  return incidents.filter(inc => inc.category_id === categoryId);
}

/**
 * V3 OUTPUT CONTRACT: Normalize V3 probe questions to enforce Date Rule.
 * 
 * SURGICAL FIX: This function runs ONLY at the output boundary when a V3 probe 
 * question is about to be shown to the candidate. It does NOT change engine logic,
 * gap computation, or LLM reasoning.
 * 
 * DATE RULE: When asking about timing, always ask for month/year (not exact date).
 * 
 * @param {string} proposedQuestion - The raw question text from the engine
 * @param {object} context - Context for determining if this is a timing question
 * @param {object} context.factModel - FactModel with required_fields array
 * @param {object} context.session - InterviewSession with fact_state
 * @param {string} context.incidentId - Current incident identifier
 * @param {string} [context.packId] - Pack identifier (for logging)
 * @returns {string} - Normalized question text (unchanged if not timing-related)
 */
export function normalizeV3ProbeQuestion(proposedQuestion, context = {}) {
  // GUARD: Fail open if inputs invalid
  if (!proposedQuestion || typeof proposedQuestion !== 'string') {
    return proposedQuestion || '';
  }
  
  const { factModel, session, incidentId, packId } = context;
  
  // GUARD: No normalization if we can't determine missing fields
  if (!factModel || !session || !incidentId) {
    return proposedQuestion;
  }
  
  // Get missing required fields for this incident
  const missingFields = getIncompleteRequiredFields(session, incidentId, factModel);
  
  // GUARD: If no missing fields, pass through unchanged
  if (!missingFields || missingFields.length === 0) {
    return proposedQuestion;
  }
  
  // Check if any missing field is timing-related
  const timingFieldTypes = ['date', 'month_year', 'datetime'];
  const hasTimingGap = missingFields.some(f => 
    timingFieldTypes.includes(f.type) ||
    f.field_id?.toLowerCase().includes('date') ||
    f.field_id?.toLowerCase().includes('time') ||
    f.field_id?.toLowerCase().includes('month') ||
    f.field_id?.toLowerCase().includes('year') ||
    f.label?.toLowerCase().includes('when')
  );
  
  // GUARD: If no timing gap, pass through unchanged
  if (!hasTimingGap) {
    return proposedQuestion;
  }
  
  // Check if question is asking about timing in a non-compliant way
  const questionLower = proposedQuestion.toLowerCase();
  const isAskingTiming = 
    questionLower.includes('when') ||
    questionLower.includes('date') ||
    questionLower.includes('time') ||
    questionLower.includes('occurred');
  
  // GUARD: If not asking about timing, pass through unchanged
  if (!isAskingTiming) {
    return proposedQuestion;
  }
  
  // Check if already asks for month/year appropriately
  const alreadyCompliant = 
    (questionLower.includes('month') && questionLower.includes('year')) ||
    questionLower.includes('about what') ||
    questionLower.includes('approximately');
  
  // GUARD: If already compliant, pass through unchanged
  if (alreadyCompliant) {
    return proposedQuestion;
  }
  
  // NORMALIZATION: Replace with Date Rule compliant phrasing
  const normalizedQuestion = "About what month and year was this?";
  
  // LOG: Diagnostic for normalization
  console.log('[V3_OUTPUT_CONTRACT][DATE_RULE_NORMALIZED]', {
    originalPreview: proposedQuestion.slice(0, 80),
    normalizedPreview: normalizedQuestion,
    incidentId,
    packId: packId || 'unknown'
  });
  
  return normalizedQuestion;
}