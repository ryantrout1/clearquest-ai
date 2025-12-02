import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * ClearQuest Investigative Decision Engine (IDE) V3
 * 
 * V3 Decision Engine for FactModel-based interviews.
 * Uses required_fields/optional_fields from FactModel (not legacy mandatory_facts).
 * 
 * This is separate from decisionEngineProbe.js which handles V1/V2.
 */

// ========== V3 FIELD PROMPT TEMPLATES ==========

const V3_FIELD_PROMPTS = {
  // Generic field types
  date: (label) => `${label}? Please provide the date or approximate timeframe.`,
  month_year: (label) => `${label}? Please provide the month and year, or an approximate timeframe.`,
  text: (label) => `${label}?`,
  textarea: (label) => `Please describe: ${label}`,
  number: (label) => `${label}? Please provide a number.`,
  yes_no: (label) => `${label}? Please answer yes or no.`,
  select_single: (label, options) => options?.length 
    ? `${label}? Options: ${options.join(', ')}.`
    : `${label}?`
};

/**
 * Generate a BI-style probe question for a missing V3 field.
 */
function generateV3ProbeQuestion(field) {
  const type = field.type || 'text';
  const label = field.label || field.field_id;
  const promptFn = V3_FIELD_PROMPTS[type] || V3_FIELD_PROMPTS.text;
  
  if (type === 'select_single' && field.enum_options?.length) {
    return promptFn(label, field.enum_options);
  }
  
  return promptFn(label);
}

// ========== NON-SUBSTANTIVE DETECTION ==========

function isNonSubstantiveAnswer(answerText) {
  if (!answerText) return true;
  
  const normalized = answerText.trim().toLowerCase();
  if (normalized.length < 5) return true;
  
  const patterns = [
    "i don't remember", "i do not remember", "not sure", "i'm not sure",
    "prefer not to say", "i'd rather not say", "don't know", "do not know",
    "can't recall", "cannot recall", "don't recall", "no idea", "forgot", "unsure",
    "idk", "n/a", "na", "none"
  ];
  
  return patterns.some(p => normalized.includes(p));
}

// ========== SIMPLE FACT EXTRACTION (STUB) ==========

/**
 * Attempt to extract facts from answer text based on missing fields.
 * This is a stub that will be enhanced with AI extraction later.
 * For now, it marks fields as "collected" if the answer seems relevant.
 */
function extractFactsFromAnswer(answerText, missingFields, factModel) {
  if (!answerText || !missingFields?.length) return {};
  
  const extracted = {};
  const normalized = answerText.trim();
  
  // For now, if we have exactly one missing field and the answer is substantive,
  // assume the answer corresponds to that field
  if (missingFields.length === 1 && normalized.length >= 3) {
    const field = missingFields[0];
    if (!isNonSubstantiveAnswer(normalized)) {
      extracted[field.field_id] = normalized;
    }
  }
  
  // Future: AI extraction will parse the answer and map to multiple fields
  
  return extracted;
}

// ========== V3 FACT MODEL LOADER ==========

async function loadV3FactModel(base44, categoryId) {
  try {
    const models = await base44.asServiceRole.entities.FactModel.filter({ category_id: categoryId });
    if (models.length > 0) {
      const m = models[0];
      return {
        id: m.id,
        category_id: m.category_id,
        category_label: m.category_label,
        incident_type: m.incident_type,
        required_fields: m.required_fields || [],
        optional_fields: m.optional_fields || [],
        status: m.status || 'DRAFT',
        is_ready_for_ai_probing: m.is_ready_for_ai_probing || false,
        description: m.description,
        linked_pack_ids: m.linked_pack_ids || []
      };
    }
    return null;
  } catch (err) {
    console.error("[IDE-V3] Error loading fact model:", categoryId, err);
    return null;
  }
}

// ========== V3 FACT STATE HELPERS ==========

function initializeV3FactState(incidentId, factModel) {
  const requiredFieldIds = (factModel?.required_fields || [])
    .map(f => f.field_id)
    .filter(Boolean);
  
  return {
    [incidentId]: {
      required_fields_collected: [],
      required_fields_missing: [...requiredFieldIds],
      optional_fields_collected: []
    }
  };
}

function updateV3FactState(factState, incidentId, factModel, newFacts) {
  const incidentState = factState[incidentId] || {
    required_fields_collected: [],
    required_fields_missing: [],
    optional_fields_collected: []
  };
  
  const requiredFieldIdSet = new Set(
    (factModel?.required_fields || []).map(f => f.field_id).filter(Boolean)
  );
  const optionalFieldIdSet = new Set(
    (factModel?.optional_fields || []).map(f => f.field_id).filter(Boolean)
  );
  
  const collectedRequired = new Set(incidentState.required_fields_collected || []);
  const collectedOptional = new Set(incidentState.optional_fields_collected || []);
  
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
  
  const missingRequired = [...requiredFieldIdSet].filter(id => !collectedRequired.has(id));
  
  return {
    ...factState,
    [incidentId]: {
      required_fields_collected: [...collectedRequired],
      required_fields_missing: missingRequired,
      optional_fields_collected: [...collectedOptional]
    }
  };
}

function getMissingRequiredFields(factState, incidentId, factModel) {
  const incidentState = factState?.[incidentId];
  
  if (!incidentState) {
    return (factModel?.required_fields || []).map(f => ({
      field_id: f.field_id,
      label: f.label,
      type: f.type,
      enum_options: f.enum_options
    }));
  }
  
  const missingIds = new Set(incidentState.required_fields_missing || []);
  
  return (factModel?.required_fields || [])
    .filter(f => missingIds.has(f.field_id))
    .map(f => ({
      field_id: f.field_id,
      label: f.label,
      type: f.type,
      enum_options: f.enum_options
    }));
}

// ========== V3 DECISION TRACE LOGGER ==========

async function logV3DecisionTrace(base44, params) {
  const traceData = {
    session_id: params.sessionId,
    incident_id: params.incidentId,
    category_id: params.categoryId,
    timestamp: new Date().toISOString(),
    action: params.action,
    logging_level: "STANDARD",
    severity: params.severity || null,
    missing_facts_before: params.fieldsMissing || [],
    probe_count: params.probeCount || 0,
    non_substantive_count: params.nonSubstantiveCount || 0,
    next_question_preview: params.nextPrompt || null,
    stop_reason: params.stopReason || null
  };
  
  try {
    await base44.asServiceRole.entities.DecisionTrace.create(traceData);
  } catch (err) {
    console.error("[IDE-V3] Error logging decision trace:", err);
  }
  
  return traceData;
}

// ========== DEFAULT V3 CONFIG ==========

const DEFAULT_V3_CONFIG = {
  maxProbesPerIncident: 12,
  maxNonSubstantiveResponses: 3,
  stopWhenRequiredComplete: true
};

// ========== MAIN V3 DECISION ENGINE ==========

async function decisionEngineV3Probe(base44, {
  sessionId,
  categoryId,
  incidentId,
  latestAnswerText,
  config = {}
}) {
  console.log("[IDE-V3] decisionEngineV3Probe called", { 
    sessionId, categoryId, incidentId, 
    answerLength: latestAnswerText?.length 
  });
  
  const mergedConfig = { ...DEFAULT_V3_CONFIG, ...config };
  
  // Load session
  let session;
  try {
    session = await base44.asServiceRole.entities.InterviewSession.get(sessionId);
  } catch (err) {
    console.error("[IDE-V3] Session not found:", sessionId);
    return {
      updatedSession: null,
      incidentId: null,
      nextAction: "STOP",
      nextPrompt: null,
      newFacts: null,
      decisionTraceEntry: { error: "SESSION_NOT_FOUND" }
    };
  }
  
  // Load V3 fact model
  const factModel = await loadV3FactModel(base44, categoryId);
  
  if (!factModel) {
    console.log("[IDE-V3] FactModel not found for category:", categoryId);
    return {
      updatedSession: session,
      incidentId: null,
      nextAction: "STOP",
      nextPrompt: null,
      newFacts: null,
      decisionTraceEntry: { error: "FACT_MODEL_NOT_FOUND", categoryId }
    };
  }
  
  if (factModel.status === 'DISABLED') {
    return {
      updatedSession: session,
      incidentId: null,
      nextAction: "STOP",
      nextPrompt: null,
      newFacts: null,
      decisionTraceEntry: { error: "FACT_MODEL_DISABLED", categoryId }
    };
  }
  
  // Find or create incident
  let incidents = [...(session.incidents || [])];
  let incident = null;
  let isNewIncident = false;
  
  if (incidentId) {
    incident = incidents.find(inc => inc.incident_id === incidentId);
  }
  
  if (!incident) {
    // Create new V3 incident
    const newIncidentId = `v3_${categoryId}_${factModel.incident_type || 'incident'}_${Date.now()}`;
    incident = {
      incident_id: newIncidentId,
      category_id: categoryId,
      incident_type: factModel.incident_type || null,
      question_code: null,
      question_id: null,
      instance_number: 1,
      facts: {},
      narrative_summary: null,
      risk_score: null,
      fact_state: {
        facts: {},
        completion_status: "incomplete",
        severity: null,
        probe_count: 0,
        non_substantive_count: 0,
        stop_reason: null
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    incidents.push(incident);
    incidentId = newIncidentId;
    isNewIncident = true;
  }
  
  // Initialize/get V3 fact_state
  let factState = { ...(session.fact_state || {}) };
  if (!factState[incidentId]) {
    factState = { ...factState, ...initializeV3FactState(incidentId, factModel) };
  }
  
  // Get current missing fields
  const missingFieldsBefore = getMissingRequiredFields(factState, incidentId, factModel);
  
  // Extract facts from answer (stub for now)
  const extractedFacts = extractFactsFromAnswer(latestAnswerText, missingFieldsBefore, factModel);
  
  // Update incident.facts
  incident.facts = {
    ...(incident.facts || {}),
    ...extractedFacts
  };
  
  // Update fact_state
  factState = updateV3FactState(factState, incidentId, factModel, incident.facts);
  
  // Track probe and non-substantive counts
  const legacyFactState = incident.fact_state || { probe_count: 0, non_substantive_count: 0 };
  legacyFactState.probe_count = (legacyFactState.probe_count || 0) + 1;
  
  if (isNonSubstantiveAnswer(latestAnswerText)) {
    legacyFactState.non_substantive_count = (legacyFactState.non_substantive_count || 0) + 1;
  }
  
  // Get updated missing fields
  const missingFieldsAfter = getMissingRequiredFields(factState, incidentId, factModel);
  
  // Determine next action
  let nextAction = "ASK";
  let nextPrompt = null;
  let stopReason = null;
  
  // Check stop conditions
  if (mergedConfig.stopWhenRequiredComplete && missingFieldsAfter.length === 0) {
    nextAction = "RECAP";
    stopReason = "REQUIRED_FIELDS_COMPLETE";
    legacyFactState.completion_status = "complete";
  } else if (legacyFactState.probe_count >= mergedConfig.maxProbesPerIncident) {
    nextAction = "STOP";
    stopReason = "MAX_PROBES_REACHED";
    legacyFactState.completion_status = "incomplete";
  } else if (legacyFactState.non_substantive_count >= mergedConfig.maxNonSubstantiveResponses) {
    nextAction = "STOP";
    stopReason = "NON_SUBSTANTIVE_LIMIT";
    legacyFactState.completion_status = "blocked";
  } else if (missingFieldsAfter.length > 0) {
    // Ask about the first missing field
    const nextField = missingFieldsAfter[0];
    nextPrompt = generateV3ProbeQuestion(nextField);
    nextAction = "ASK";
  } else {
    // No more missing fields
    nextAction = "RECAP";
    stopReason = "REQUIRED_FIELDS_COMPLETE";
  }
  
  legacyFactState.stop_reason = stopReason;
  incident.fact_state = legacyFactState;
  incident.updated_at = new Date().toISOString();
  
  // Replace incident in array
  const incidentIndex = incidents.findIndex(inc => inc.incident_id === incidentId);
  if (incidentIndex >= 0) {
    incidents[incidentIndex] = incident;
  }
  
  // Build updated session
  const updatedSession = {
    ...session,
    incidents,
    fact_state: factState,
    ide_version: "V3"
  };
  
  // Persist session
  try {
    await base44.asServiceRole.entities.InterviewSession.update(sessionId, {
      incidents: updatedSession.incidents,
      fact_state: updatedSession.fact_state,
      ide_version: "V3"
    });
  } catch (err) {
    console.error("[IDE-V3] Error persisting session:", err);
  }
  
  // Log decision trace
  const decisionTraceEntry = await logV3DecisionTrace(base44, {
    sessionId,
    incidentId,
    categoryId,
    action: nextAction,
    severity: legacyFactState.severity,
    fieldsMissing: missingFieldsAfter.map(f => f.field_id),
    probeCount: legacyFactState.probe_count,
    nonSubstantiveCount: legacyFactState.non_substantive_count,
    nextPrompt,
    stopReason
  });
  
  console.log("[IDE-V3] Decision result", {
    nextAction,
    stopReason,
    missingFieldsCount: missingFieldsAfter.length,
    probeCount: legacyFactState.probe_count
  });
  
  return {
    updatedSession,
    incidentId,
    nextAction,
    nextPrompt,
    newFacts: extractedFacts,
    decisionTraceEntry,
    // Additional context for caller
    missingFields: missingFieldsAfter,
    completionPercent: factModel.required_fields?.length > 0
      ? Math.round(((factModel.required_fields.length - missingFieldsAfter.length) / factModel.required_fields.length) * 100)
      : 100
  };
}

// ========== HTTP HANDLER ==========

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    
    const { sessionId, categoryId, incidentId, latestAnswerText, config } = body;
    
    if (!sessionId || !categoryId) {
      return Response.json({ 
        error: 'Missing required fields: sessionId, categoryId' 
      }, { status: 400 });
    }
    
    const result = await decisionEngineV3Probe(base44, {
      sessionId,
      categoryId,
      incidentId: incidentId || null,
      latestAnswerText: latestAnswerText || "",
      config: config || {}
    });
    
    return Response.json(result);
    
  } catch (error) {
    console.error("[IDE-V3] Fatal error:", error.message);
    return Response.json({ 
      error: error.message,
      nextAction: "STOP",
      decisionTraceEntry: { error: error.message }
    }, { status: 500 });
  }
});