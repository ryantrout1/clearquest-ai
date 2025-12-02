import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * ClearQuest Investigative Decision Engine (IDE) v1
 * 
 * Decision Engine Probing API
 * 
 * Determines whether to continue probing an incident, what to ask next,
 * and manages fact state based on configured decision rules.
 * 
 * NOTE: This function does NOT change interview behavior yet.
 * It will be called by the UI in a later prompt when feature flags are enabled.
 */

// ========== FACT LABEL MAPPINGS ==========

const FACT_LABELS = {
  // DUI/DWI
  date: "When did this happen? Please provide an approximate date or timeframe.",
  location: "Where did this occur? What city or area?",
  BAC: "What was your blood alcohol content (BAC), if known?",
  impairment_indicators: "In what ways were you impaired? For example: slurred speech, trouble walking, failing field tests, etc.",
  legal_outcome: "What was the legal outcome? For example: dismissed, convicted, fines paid, probation, license suspension, etc.",
  prior_dui_history: "Have you had any other DUI or DWI incidents before this one?",
  license_impact: "Did this incident affect your driver's license? If so, how?",
  criminal_charges: "Were there any criminal charges filed? If so, what was the outcome?",
  
  // Domestic Violence
  relationship_to_victim: "What was your relationship to the other person involved?",
  incident_description: "Can you describe what happened in more detail?",
  police_response: "How did the police respond? Were you or anyone else arrested?",
  protective_order: "Was a protective order or restraining order issued?",
  arrests: "Were there any arrests related to this incident?",
  charges_filed: "Were any charges filed? If so, what were they and what was the outcome?",
  counseling_completed: "Have you completed any counseling or anger management programs related to this?",
  witnesses: "Were there any witnesses to this incident?",
  injuries: "Were there any injuries? If so, please describe.",
  
  // Theft/Dishonesty
  item_stolen: "What was taken or what dishonest act occurred?",
  value: "What was the approximate value of the item(s) or loss?",
  employer_or_owner: "Who was the victim or owner? Was this an employer, individual, or organization?",
  restitution_paid: "Have you paid restitution or made amends?",
  employment_impact: "Did this impact your employment? Were you terminated or disciplined?",
  accountability: "How do you take accountability for this incident?",
  
  // Drug Use
  substance_name: "What substance did you use?",
  first_use_date: "When did you first use this substance?",
  frequency: "How often did you use it? For example: once, occasionally, regularly, daily, etc.",
  last_use_date: "When was the last time you used this substance?",
  circumstances: "What were the circumstances? For example: social use, alone, specific events, etc.",
  purchase_history: "Did you ever purchase this substance yourself?",
  social_vs_solo: "Did you use alone or in social settings?",
  impact_on_life: "Did this substance use impact your work, relationships, or health?",
  addiction_treatment: "Have you received any treatment or counseling for substance use?",
  legal_consequences: "Were there any legal consequences related to your drug use?",
  multiple_substances: "Have you used any other controlled substances?",
  
  // Financial
  issue_type: "What type of financial issue was this? For example: collections, late payments, bankruptcy, foreclosure, etc.",
  amount: "What was the approximate amount or total debt involved?",
  current_status: "What is the current status of this debt or financial issue?",
  creditor_name: "Who was the creditor or lender?",
  payment_plan: "Are you on a payment plan or have you resolved this?",
  bankruptcy_filed: "Have you filed for bankruptcy? If so, when and what chapter?",
  wage_garnishment: "Has your wage ever been garnished?",
  foreclosure: "Have you experienced foreclosure or repossession?",
  
  // Employment
  employer: "What was the name of the employer?",
  position: "What position or role did you hold?",
  separation_type: "How did your employment end? For example: terminated, resigned, laid off, etc.",
  reason: "What was the reason given for the separation?",
  notice_given: "Did you give notice or was it immediate?",
  reference_available: "Would this employer provide a reference?",
  termination_cause: "What was the specific cause of termination?",
  misconduct_type: "What type of misconduct or issue occurred?",
  multiple_terminations: "Have you been terminated from other jobs?",
  
  // Driving (general)
  vehicle_type: "What type of vehicle were you driving?",
  passengers: "Were there any passengers in the vehicle?",
  property_damage: "Was there any property damage? If so, please describe."
};

// ========== NON-SUBSTANTIVE DETECTION ==========

function isNonSubstantiveAnswer(answerText) {
  if (!answerText) return true;
  
  const normalized = answerText.trim().toLowerCase();
  
  // Too short to be substantive
  if (normalized.length < 5) return true;
  
  // Common evasive patterns
  const patterns = [
    "i don't remember",
    "i do not remember",
    "not sure",
    "i'm not sure",
    "prefer not to say",
    "i'd rather not say",
    "don't know",
    "do not know",
    "can't recall",
    "cannot recall",
    "don't recall",
    "no idea",
    "forgot",
    "unsure"
  ];
  
  return patterns.some(p => normalized.includes(p));
}

// ========== SYSTEM CONFIG LOADER ==========

async function loadSystemConfig(base44) {
  try {
    const configs = await base44.asServiceRole.entities.SystemConfig.filter({ config_key: "global_config" });
    if (configs.length > 0) {
      const configData = configs[0].config_data || {};
      return {
        decisionEngine: configData.decisionEngine || {},
        logging: configData.logging || {}
      };
    }
  } catch (err) {
    console.error("[IDE] Error loading system config:", err);
  }
  
  // Return defaults if config not found
  return {
    decisionEngine: {
      maxProbesPerIncident: 10,
      maxNonSubstantiveResponses: 3,
      stopWhenMandatoryFactsComplete: true,
      fallbackBehaviorOnError: "DETERMINISTIC_FALLBACK",
      categorySeverityDefaults: {}
    },
    logging: {
      decisionLoggingEnabled: true,
      decisionLoggingLevel: "STANDARD"
    }
  };
}

// ========== FACT MODEL LOADER ==========

async function loadFactModel(base44, categoryId) {
  try {
    const models = await base44.asServiceRole.entities.FactModel.filter({ category_id: categoryId });
    if (models.length > 0) {
      const m = models[0];
      const data = m.data || m;
      return {
        id: m.id,
        categoryId: data.category_id,
        categoryLabel: data.category_label,
        mandatoryFacts: data.mandatory_facts || [],
        optionalFacts: data.optional_facts || [],
        severityFacts: data.severity_facts || [],
        isReadyForAiProbing: data.is_ready_for_ai_probing || false
      };
    }
    return null;
  } catch (err) {
    console.error("[IDE] Error loading fact model:", categoryId, err);
    return null;
  }
}

// ========== MISSING FACTS CALCULATOR ==========

function getMissingFacts(factModel, factState) {
  if (!factModel || !factModel.mandatoryFacts) return [];
  if (!factState || !factState.facts) return [...factModel.mandatoryFacts];
  
  const missing = [];
  for (const factKey of factModel.mandatoryFacts) {
    const value = factState.facts[factKey];
    if (value === null || value === undefined || value === "") {
      missing.push(factKey);
    }
  }
  return missing;
}

// ========== FACT STATE INITIALIZER ==========

function initializeFactState(factModel) {
  const facts = {};
  
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

// ========== DECISION TRACE LOGGER ==========

async function logDecisionTrace(base44, params, loggingConfig) {
  if (!loggingConfig.decisionLoggingEnabled) return;
  
  const level = loggingConfig.decisionLoggingLevel || "STANDARD";
  
  const traceData = {
    session_id: params.sessionId,
    incident_id: params.incidentId,
    category_id: params.categoryId,
    timestamp: new Date().toISOString(),
    action: params.action,
    logging_level: level
  };
  
  // Include additional fields based on logging level
  if (level === "STANDARD") {
    traceData.severity = params.severity || null;
    traceData.missing_facts_before = params.missingFactsBefore || [];
    traceData.probe_count = params.probeCount || 0;
    traceData.non_substantive_count = params.nonSubstantiveCount || 0;
    traceData.next_question_preview = params.nextQuestionPreview || null;
  }
  
  if (params.stopReason) {
    traceData.stop_reason = params.stopReason;
  }
  
  try {
    await base44.asServiceRole.entities.DecisionTrace.create(traceData);
  } catch (err) {
    console.error("[IDE] Error logging decision trace:", err);
  }
}

// ========== MAIN DECISION ENGINE FUNCTION ==========

async function decisionEngineProbe(base44, { sessionId, categoryId, incidentId, latestAnswer, questionContext }) {
  console.log("[IDE] decisionEngineProbe called", { sessionId, categoryId, incidentId, answerLength: latestAnswer?.length });
  
  // Step 1: Load system config
  const config = await loadSystemConfig(base44);
  const decisionConfig = config.decisionEngine;
  const loggingConfig = config.logging;
  
  // Step 2: Load session
  let session;
  try {
    session = await base44.asServiceRole.entities.InterviewSession.get(sessionId);
  } catch (err) {
    console.error("[IDE] Session not found:", sessionId);
    return { 
      continue: false, 
      error: "SESSION_NOT_FOUND",
      fallbackRecommended: true 
    };
  }
  
  // Step 3: Load fact model
  const factModel = await loadFactModel(base44, categoryId);
  
  if (!factModel || !factModel.isReadyForAiProbing) {
    console.log("[IDE] Fact model not ready for category:", categoryId);
    return {
      continue: false,
      reason: "FACT_MODEL_NOT_READY",
      fallbackRecommended: true
    };
  }
  
  // Step 4: Find or create incident
  let incidents = session.incidents || [];
  let incident = null;
  
  if (incidentId) {
    incident = incidents.find(inc => inc.incident_id === incidentId);
  }
  
  if (!incident) {
    // Create new incident
    const newIncidentId = `incident_${categoryId}_${questionContext?.questionCode || 'unknown'}_${Date.now()}`;
    incident = {
      incident_id: newIncidentId,
      category_id: categoryId,
      question_code: questionContext?.questionCode || null,
      question_id: questionContext?.questionId || null,
      instance_number: 1,
      fact_state: initializeFactState(factModel),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    incidents.push(incident);
    incidentId = newIncidentId;
  }
  
  // Step 5: Update fact state from answer (skeleton for now)
  // In future: this will call AI to extract facts from latestAnswer
  // For now: no-op, just track that we received an answer
  let factState = incident.fact_state || initializeFactState(factModel);
  
  // Step 6: Detect non-substantive answers
  const isNonSubstantive = isNonSubstantiveAnswer(latestAnswer);
  if (isNonSubstantive) {
    factState.nonSubstantiveCount = (factState.nonSubstantiveCount || 0) + 1;
  }
  
  // Increment probe count (this probe)
  factState.probeCount = (factState.probeCount || 0) + 1;
  
  // Step 7: Calculate missing facts
  const missingFacts = getMissingFacts(factModel, factState);
  
  // Step 8: Apply stop conditions
  const maxProbes = decisionConfig.maxProbesPerIncident || 10;
  const maxNonSubstantive = decisionConfig.maxNonSubstantiveResponses || 3;
  const stopOnComplete = decisionConfig.stopWhenMandatoryFactsComplete !== false;
  
  let shouldStop = false;
  let stopReason = null;
  const flags = [];
  
  // Check stop conditions in priority order
  if (stopOnComplete && missingFacts.length === 0) {
    shouldStop = true;
    stopReason = "MANDATORY_FACTS_COMPLETE";
    factState.completionStatus = "complete";
  } else if (factState.probeCount >= maxProbes) {
    shouldStop = true;
    stopReason = "MAX_PROBES_REACHED";
    factState.completionStatus = "incomplete";
    flags.push("MAX_PROBES_REACHED");
  } else if (factState.nonSubstantiveCount >= maxNonSubstantive) {
    shouldStop = true;
    stopReason = "NON_SUBSTANTIVE_LIMIT_REACHED";
    factState.completionStatus = "blocked";
    flags.push("NON_SUBSTANTIVE_ANSWERS");
  }
  
  if (stopReason) {
    factState.stopReason = stopReason;
  }
  
  // Step 9: Set severity (from config defaults)
  if (!factState.severity) {
    const defaultSeverity = decisionConfig.categorySeverityDefaults?.[categoryId] || "MODERATE";
    factState.severity = defaultSeverity;
  }
  
  // Step 10: Determine next question (if continuing)
  let nextQuestion = null;
  if (!shouldStop && missingFacts.length > 0) {
    const missingFactKey = missingFacts[0];
    nextQuestion = FACT_LABELS[missingFactKey] || 
      `Please provide more detail about: ${missingFactKey.replace(/_/g, ' ')}.`;
  }
  
  // Step 11: Update incident and session
  incident.fact_state = factState;
  incident.updated_at = new Date().toISOString();
  
  // Find and replace the incident in the array
  const incidentIndex = incidents.findIndex(inc => inc.incident_id === incidentId);
  if (incidentIndex >= 0) {
    incidents[incidentIndex] = incident;
  }
  
  // Save updated session
  try {
    await base44.asServiceRole.entities.InterviewSession.update(sessionId, {
      incidents: incidents,
      ide_version: "v1.0.0"
    });
  } catch (err) {
    console.error("[IDE] Error updating session:", err);
  }
  
  // Step 12: Log decision trace
  await logDecisionTrace(base44, {
    sessionId,
    incidentId,
    categoryId,
    action: shouldStop ? "STOP" : "PROBE",
    severity: factState.severity,
    missingFactsBefore: missingFacts,
    probeCount: factState.probeCount,
    nonSubstantiveCount: factState.nonSubstantiveCount,
    stopReason,
    nextQuestionPreview: nextQuestion
  }, loggingConfig);
  
  // Step 13: Build response
  const response = {
    continue: !shouldStop,
    nextQuestion: nextQuestion,
    incidentId: incidentId,
    categoryId: categoryId,
    updatedFactState: factState,
    stopReason: stopReason,
    flags: flags,
    missingFactsCount: missingFacts.length,
    completionPercent: factModel.mandatoryFacts.length > 0 
      ? Math.round(((factModel.mandatoryFacts.length - missingFacts.length) / factModel.mandatoryFacts.length) * 100)
      : 100
  };
  
  console.log("[IDE] Decision result", {
    continue: response.continue,
    stopReason: response.stopReason,
    missingFactsCount: response.missingFactsCount,
    probeCount: factState.probeCount
  });
  
  return response;
}

// ========== HTTP HANDLER ==========

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Authenticate user
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Parse request body
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    
    const { sessionId, categoryId, incidentId, latestAnswer, questionContext } = body;
    
    // Validate required fields
    if (!sessionId || !categoryId) {
      return Response.json({ 
        error: 'Missing required fields: sessionId, categoryId' 
      }, { status: 400 });
    }
    
    // Call decision engine
    const result = await decisionEngineProbe(base44, {
      sessionId,
      categoryId,
      incidentId,
      latestAnswer: latestAnswer || "",
      questionContext: questionContext || {}
    });
    
    return Response.json(result);
    
  } catch (error) {
    console.error("[IDE] Fatal error:", error.message);
    console.error("[IDE] Stack:", error.stack?.substring(0, 500));
    
    return Response.json({ 
      error: error.message,
      continue: false,
      fallbackRecommended: true
    }, { status: 500 });
  }
});