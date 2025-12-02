import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * ClearQuest Investigative Decision Engine (IDE) V3
 * 
 * V3 Decision Engine for FactModel-based interviews.
 * Uses required_fields/optional_fields from FactModel (not legacy mandatory_facts).
 * 
 * This is separate from decisionEngineProbe.js which handles V1/V2.
 */

// ========== V3 PROMPT TEMPLATES ==========

/**
 * V3 Probing Prompt Templates (Backend version)
 * Mirrors components/utils/v3ProbingPrompts.js for backend use
 */

const FIELD_QUESTION_TEMPLATES = {
  date: "When did this occur? Please provide the date or approximate timeframe.",
  incident_date: "When did this incident happen?",
  month_year: "What month and year did this take place?",
  location: "Where did this occur?",
  outcome: "What was the outcome of this situation?",
  legal_outcome: "What was the legal outcome, if any?",
  description: "Can you describe what happened in more detail?",
  circumstances: "What were the circumstances surrounding this?",
  injuries: "Were there any injuries involved?",
  agency: "Which agency or organization was involved?",
  agency_name: "What is the name of the agency?",
  position: "What position were you applying for or held?"
};

const OPENING_PROMPTS_BY_CATEGORY = {
  DUI: "Thanks for disclosing that. I'd like to understand the circumstances. Can you start by telling me when this incident occurred?",
  DRIVING: "I appreciate you sharing this. Let's go through the details. When did this driving incident take place?",
  THEFT: "Thank you for being upfront about this. To understand the situation fully, can you tell me when this occurred?",
  DRUG_USE: "I appreciate your honesty. Let's discuss this further. When did you first use this substance?",
  DOMESTIC_VIOLENCE: "Thank you for disclosing this. I need to understand what happened. Can you tell me when this incident occurred?",
  CRIMINAL: "Thanks for sharing this information. Let's go through the details. When did this incident take place?",
  EMPLOYMENT: "I appreciate you mentioning this. Can you tell me when this employment situation occurred?",
  FINANCIAL: "Thank you for disclosing this. Let's discuss the circumstances. When did this financial issue arise?",
  PRIOR_LE_APPS: "Thanks for letting me know about your prior applications. Can you tell me about the first agency you applied to?"
};

const COMPLETION_MESSAGES = {
  RECAP: "Thank you for providing those details. I have all the information I need for this incident.",
  STOP_COMPLETE: "Thank you. We've covered the key points for this incident.",
  STOP_MAX_PROBES: "Thank you for your responses. Let's move on to the next topic.",
  STOP_NON_SUBSTANTIVE: "I understand. Let's continue with the interview."
};

/**
 * Get opening prompt for a category
 */
function getOpeningPrompt(categoryId, categoryLabel) {
  const categoryKey = categoryId?.toUpperCase();
  if (OPENING_PROMPTS_BY_CATEGORY[categoryKey]) {
    return OPENING_PROMPTS_BY_CATEGORY[categoryKey];
  }
  if (categoryLabel) {
    return `Thanks for letting me know about this ${categoryLabel.toLowerCase()} matter. Walk me through what happened, starting with when this occurred.`;
  }
  return "Thanks for letting me know. Walk me through what happened, starting with when this occurred.";
}

/**
 * Generate a BI-style probe question for a missing V3 field.
 */
function generateV3ProbeQuestion(field, collectedFacts = {}) {
  const fieldId = field.field_id?.toLowerCase();
  const label = field.label;
  const type = field.type;
  
  // Check for specific field template
  if (FIELD_QUESTION_TEMPLATES[fieldId]) {
    return FIELD_QUESTION_TEMPLATES[fieldId];
  }
  
  // Generate based on type
  switch (type) {
    case 'date':
    case 'month_year':
      return `When did this occur? Please provide ${label?.toLowerCase() || 'the date'}.`;
    case 'boolean':
    case 'yes_no':
      return `${label}?`;
    case 'select_single':
      if (field.enum_options?.length) {
        return `${label}? The options are: ${field.enum_options.join(', ')}.`;
      }
      return `${label}?`;
    default:
      if (label) {
        const labelLower = label.toLowerCase();
        if (labelLower.startsWith('what') || labelLower.startsWith('when') || 
            labelLower.startsWith('where') || labelLower.startsWith('who') ||
            labelLower.startsWith('how') || labelLower.startsWith('why')) {
          return `${label}?`;
        }
        return `What was the ${labelLower}?`;
      }
      return `Can you provide more information about ${fieldId?.replace(/_/g, ' ') || 'this'}?`;
  }
}

/**
 * Build recap prompt for AI summary generation
 */
function buildRecapPrompt(incident, categoryLabel) {
  const facts = incident?.facts || {};
  const factsText = Object.entries(facts)
    .filter(([_, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `- ${k.replace(/_/g, ' ')}: ${v}`)
    .join('\n');
  
  return `You are summarizing an incident for a law enforcement background investigator.

Based on the collected facts below, write a concise, factual narrative summary. Include:
- When it happened
- Where it occurred  
- Who was involved (if applicable)
- What happened
- Whether police were involved
- What the outcome was
- Any key risk indicators

Use neutral, professional language. Do not make hiring recommendations or legal conclusions.

COLLECTED FACTS:
${factsText || '(No facts collected)'}

Write a 2-4 sentence narrative summary:`;
}

/**
 * Get completion message based on action/reason
 */
function getCompletionMessage(nextAction, stopReason) {
  if (nextAction === "RECAP") {
    return COMPLETION_MESSAGES.RECAP;
  }
  if (stopReason === "MAX_PROBES_REACHED") {
    return COMPLETION_MESSAGES.STOP_MAX_PROBES;
  }
  if (stopReason === "NON_SUBSTANTIVE_LIMIT") {
    return COMPLETION_MESSAGES.STOP_NON_SUBSTANTIVE;
  }
  return COMPLETION_MESSAGES.STOP_COMPLETE;
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
    nextPrompt = getCompletionMessage("RECAP", null);
  } else if (legacyFactState.probe_count >= mergedConfig.maxProbesPerIncident) {
    nextAction = "STOP";
    stopReason = "MAX_PROBES_REACHED";
    legacyFactState.completion_status = "incomplete";
    nextPrompt = getCompletionMessage("STOP", stopReason);
  } else if (legacyFactState.non_substantive_count >= mergedConfig.maxNonSubstantiveResponses) {
    nextAction = "STOP";
    stopReason = "NON_SUBSTANTIVE_LIMIT";
    legacyFactState.completion_status = "blocked";
    nextPrompt = getCompletionMessage("STOP", stopReason);
  } else if (missingFieldsAfter.length > 0) {
    // Ask about the first missing field using BI-style template
    const nextField = missingFieldsAfter[0];
    nextPrompt = generateV3ProbeQuestion(nextField, incident.facts);
    nextAction = "ASK";
  } else {
    // No more missing fields
    nextAction = "RECAP";
    stopReason = "REQUIRED_FIELDS_COMPLETE";
    nextPrompt = getCompletionMessage("RECAP", null);
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
  
  // Generate opening prompt for new incidents
  let openingPrompt = null;
  if (isNewIncident) {
    openingPrompt = getOpeningPrompt(categoryId, factModel.category_label);
  }

  return {
    updatedSession,
    incidentId,
    nextAction,
    nextPrompt,
    openingPrompt,
    newFacts: extractedFacts,
    decisionTraceEntry,
    // Additional context for caller
    categoryLabel: factModel.category_label,
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
    
    // ========== HEALTHCHECK MODE ==========
    // For readiness checks - no actual probing, just validate function is callable
    if (body.mode === "healthcheck" || body.isReadinessCheck === true) {
      console.log("[IDE-V3] Healthcheck mode - returning OK");
      return Response.json({ 
        ok: true, 
        mode: "healthcheck",
        timestamp: new Date().toISOString()
      });
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