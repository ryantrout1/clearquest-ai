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
 * @param {string} categoryId - Category identifier
 * @param {string} categoryLabel - Category label
 * @param {object} packData - Optional pack metadata with author-controlled opener
 * @returns {string} Opening prompt text
 */
function getOpeningPrompt(categoryId, categoryLabel, packData = null) {
  // PRIORITY 1: Author-controlled opener from pack (if enabled)
  if (packData?.use_author_defined_openers && packData?.opening_question_text) {
    return packData.opening_question_text;
  }
  
  // PRIORITY 2: Category-specific template
  const categoryKey = categoryId?.toUpperCase();
  if (OPENING_PROMPTS_BY_CATEGORY[categoryKey]) {
    return OPENING_PROMPTS_BY_CATEGORY[categoryKey];
  }
  
  // PRIORITY 3: Generic with category context
  if (categoryLabel) {
    return `Thanks for letting me know about this ${categoryLabel.toLowerCase()} matter. Walk me through what happened, starting with when this occurred.`;
  }
  
  // PRIORITY 4: Fully generic fallback
  return "Thanks for letting me know. Walk me through what happened, starting with when this occurred.";
}

/**
 * Generate a BI-style probe question for a missing V3 field.
 * HIGH CONFIDENCE extracted facts are NOT asked again (no confirmation).
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

// ========== FIELD ID RESOLVER ==========

/**
 * Canonicalize a string for field ID matching.
 * Removes all non-alphanumeric characters and lowercases.
 * Maps snake_case, camelCase, PascalCase, kebab-case to same form.
 */
function canon(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Resolve exact field_id from FactModel by semantic name.
 * Uses canonical matching: agency_name → agencyName, approx_month_year → approxMonthYear
 */
function resolveFieldId(factModel, semanticKey) {
  if (!factModel || !semanticKey) return null;
  
  const wanted = canon(semanticKey);
  
  const allFields = [
    ...(factModel.required_fields || []),
    ...(factModel.optional_fields || [])
  ];
  
  for (const field of allFields) {
    if (field?.field_id && canon(field.field_id) === wanted) {
      return field.field_id;
    }
  }
  
  return null;
}

// ========== OPENER NARRATIVE EXTRACTION ==========

/**
 * Extract facts from opener narrative using deterministic heuristics.
 * Prioritizes high-confidence extraction for obvious patterns.
 * Uses exact field_id keys from FactModel to ensure alignment.
 */
function extractOpenerFacts(openerText, categoryId, factModel) {
  if (!openerText || openerText.length < 20) return {};
  
  const extracted = {};
  const normalized = openerText.trim();
  const lower = normalized.toLowerCase();
  
  // PRIOR_LE_APPS specific extraction
  if (categoryId === 'PRIOR_LE_APPS') {
    const tempExtracted = {};
    
    // Extract agency_name - improved patterns
    const agencyPatterns = [
      /applied\s+to\s+([A-Z][A-Za-z\s&.'-]+?)\s+(?:for|as|in|during|position|role|\.|\,)/i,
      /applied\s+with\s+([A-Z][A-Za-z\s&.'-]+?)\s+(?:for|as|in|during|position|role|\.|\,)/i,
      /to\s+(?:the\s+)?([A-Z][A-Za-z\s&.'-]+?(?:Police Department|Sheriff's Office|Sheriff|Police|PD|SO|Department|Agency|Office))/i,
      /with\s+(?:the\s+)?([A-Z][A-Za-z\s&.'-]+?(?:Police Department|Sheriff's Office|Sheriff|Police|PD|SO|Department|Agency|Office))/i,
      /(?:at|from)\s+(?:the\s+)?([A-Z][A-Za-z\s&.'-]+?(?:Police Department|Sheriff's Office|Sheriff|Police|PD|SO|Department|Agency|Office))/i
    ];
    
    for (const pattern of agencyPatterns) {
      const match = normalized.match(pattern);
      if (match && match[1]) {
        let agency = match[1].trim();
        // Clean up common suffixes that got caught
        agency = agency.replace(/\s+(for|as|in|during|position|role)$/i, '').trim();
        if (agency.length >= 3) {
          tempExtracted.agency_name = agency;
          break;
        }
      }
    }
    
    // Extract position_applied_for - improved patterns
    const positionPatterns = [
      /for\s+(?:a|an|the)?\s*([A-Za-z\s]+?)\s+(?:position|role|job)/i,
      /as\s+(?:a|an|the)?\s*([A-Za-z\s]+?)\s+(?:position|role|\.|,)/i,
      /position\s+of\s+([A-Za-z\s]+?)(?:\.|,|\s+in|\s+at|\s+for|\s+with)/i,
      /for\s+(?:a|an|the)?\s*(Police Officer Recruit|Police Officer|Deputy Sheriff|Sheriff Deputy|Correctional Officer|Officer|Recruit|Deputy|Agent)(?:\s|\.|\,|$)/i
    ];
    
    for (const pattern of positionPatterns) {
      const match = normalized.match(pattern);
      if (match && match[1]) {
        let position = match[1].trim();
        if (position.length >= 3) {
          tempExtracted.position_applied_for = position;
          break;
        }
      }
    }
    
    // Extract approx_month_year - improved patterns
    const monthYearPatterns = [
      /(?:In|During|in|during)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(?:of\s+)?(\d{4})/i,
      /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(?:of\s+)?(\d{4})/i,
      /(\d{4})\s+(January|February|March|April|May|June|July|August|September|October|November|December)/i
    ];
    
    for (const pattern of monthYearPatterns) {
      const match = normalized.match(pattern);
      if (match) {
        let month, year;
        if (match[2] && /^\d{4}$/.test(match[2])) {
          month = match[1];
          year = match[2];
        } else if (match[1] && /^\d{4}$/.test(match[1])) {
          year = match[1];
          month = match[2];
        }
        if (month && year) {
          tempExtracted.approx_month_year = `${month} ${year}`;
          break;
        }
      }
    }
    
    // Extract outcome - keyword matching
    if (lower.includes('rejected') || lower.includes('denied') || lower.includes('disqualified') || lower.includes('not selected')) {
      tempExtracted.outcome = 'Not selected/rejected';
    } else if (lower.includes('withdrew') || lower.includes('pulled out') || lower.includes('withdrew my application')) {
      tempExtracted.outcome = 'Withdrew application';
    } else if (lower.includes('offered') || lower.includes('hired') || lower.includes('accepted')) {
      tempExtracted.outcome = 'Hired/Offered position';
    }
    
    // Extract how_far_got - keyword matching with priority
    const stageKeywords = [
      { keywords: ['written test', 'written exam', 'written portion'], value: 'Written test' },
      { keywords: ['physical test', 'physical fitness', 'pt test', 'fitness test'], value: 'Physical fitness test' },
      { keywords: ['oral board', 'oral interview', 'panel interview'], value: 'Oral board' },
      { keywords: ['polygraph', 'lie detector'], value: 'Polygraph' },
      { keywords: ['background investigation', 'background check', 'background'], value: 'Background investigation' },
      { keywords: ['psychological', 'psych eval', 'psych'], value: 'Psychological evaluation' },
      { keywords: ['medical exam', 'medical'], value: 'Medical examination' },
      { keywords: ['interview'], value: 'Interview stage' }
    ];
    
    for (const stage of stageKeywords) {
      if (stage.keywords.some(kw => lower.includes(kw))) {
        tempExtracted.how_far_got = stage.value;
        break;
      }
    }
    
    // Map to exact field_id keys from FactModel
    for (const [semanticKey, value] of Object.entries(tempExtracted)) {
      const fieldId = resolveFieldId(factModel, semanticKey);
      if (fieldId) {
        extracted[fieldId] = value;
      } else {
        // Fallback: use semantic key if no field_id match found
        extracted[semanticKey] = value;
      }
    }
  }
  
  return extracted;
}

/**
 * Attempt to extract facts from answer text based on missing fields.
 * Uses deterministic extraction for openers, then falls back to single-field logic.
 */
function extractFactsFromAnswer(answerText, missingFields, factModel, isOpenerNarrative = false, categoryId = null) {
  if (!answerText || !missingFields?.length) return {};
  
  const normalized = answerText.trim();
  
  // OPENER NARRATIVE: Use deterministic extraction
  if (isOpenerNarrative && categoryId && normalized.length >= 20) {
    return extractOpenerFacts(normalized, categoryId, factModel);
  }
  
  // SINGLE FIELD ANSWER: Assume answer maps to the one missing field
  const extracted = {};
  if (missingFields.length === 1 && normalized.length >= 3) {
    const field = missingFields[0];
    if (!isNonSubstantiveAnswer(normalized)) {
      extracted[field.field_id] = normalized;
    }
  }
  
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
  baseQuestionId,
  questionCode,
  sectionId,
  instanceNumber,
  isInitialCall = false,
  config = {}
}) {
  console.log("[IDE-V3] decisionEngineV3Probe called", { 
    sessionId, categoryId, incidentId, baseQuestionId, questionCode, sectionId, instanceNumber,
    answerLength: latestAnswerText?.length 
  });
  
  const mergedConfig = { ...DEFAULT_V3_CONFIG, ...config };
  
  // Load session
  let session;
  try {
    session = await base44.asServiceRole.entities.InterviewSession.get(sessionId);
  } catch (err) {
    console.error("[IDE-V3] Session not found:", sessionId);
    
    // DIAGNOSTIC: STOP reason dump
    console.log("[IDE-V3][STOP_DIAGNOSTIC] ========== GUARDRAIL TRIGGERED: STOP ==========");
    console.log("[IDE-V3][STOP_DIAGNOSTIC]", {
      categoryId,
      packId: null,
      isInitialCall: !incidentId,
      foundCategoryConfig: false,
      foundPromptTemplate: false,
      questionBankCount: 0,
      eligibleQuestionsCount: 0,
      stopReasonCode: "SESSION_NOT_FOUND",
      stopReasonDetail: `Session '${sessionId}' not found in database`,
      incidentId_in: incidentId || null,
      incidentId_out: incidentId || null
    });
    
    return {
      updatedSession: null,
      incidentId: incidentId || null,
      nextAction: "STOP",
      nextPrompt: null,
      newFacts: null,
      decisionTraceEntry: { error: "SESSION_NOT_FOUND" },
      stopReasonCode: "SESSION_NOT_FOUND",
      stopReasonDetail: `Session '${sessionId}' not found in database`
    };
  }
  
  // Load V3 fact model
  const factModel = await loadV3FactModel(base44, categoryId);
  
  if (!factModel) {
    console.log("[IDE-V3] FactModel not found for category:", categoryId);
    
    // DIAGNOSTIC: STOP reason dump for initial call
    console.log("[IDE-V3][STOP_DIAGNOSTIC] ========== GUARDRAIL TRIGGERED: STOP ==========");
    console.log("[IDE-V3][STOP_DIAGNOSTIC]", {
      categoryId,
      packId: null,
      isInitialCall: !incidentId,
      foundCategoryConfig: false,
      foundPromptTemplate: false,
      questionBankCount: 0,
      eligibleQuestionsCount: 0,
      stopReasonCode: "MISSING_FACT_MODEL",
      stopReasonDetail: `No FactModel entity found for category_id='${categoryId}'`,
      incidentId_in: incidentId || null,
      incidentId_out: incidentId || null
    });
    
    return {
      updatedSession: session,
      incidentId: incidentId || null,
      nextAction: "STOP",
      nextPrompt: null,
      newFacts: null,
      decisionTraceEntry: { error: "FACT_MODEL_NOT_FOUND", categoryId },
      stopReasonCode: "MISSING_FACT_MODEL",
      stopReasonDetail: `No FactModel entity found for category_id='${categoryId}'`
    };
  }
  
  if (factModel.status === 'DISABLED') {
    // DIAGNOSTIC: STOP reason dump for initial call
    console.log("[IDE-V3][STOP_DIAGNOSTIC] ========== GUARDRAIL TRIGGERED: STOP ==========");
    console.log("[IDE-V3][STOP_DIAGNOSTIC]", {
      categoryId,
      packId: null,
      isInitialCall: !incidentId,
      foundCategoryConfig: true,
      foundPromptTemplate: true,
      questionBankCount: (factModel.required_fields?.length || 0) + (factModel.optional_fields?.length || 0),
      eligibleQuestionsCount: 0,
      stopReasonCode: "FACT_MODEL_DISABLED",
      stopReasonDetail: `FactModel exists but status='${factModel.status}' (must be ACTIVE)`,
      incidentId_in: incidentId || null,
      incidentId_out: incidentId || null
    });
    
    return {
      updatedSession: session,
      incidentId: incidentId || null,
      nextAction: "STOP",
      nextPrompt: null,
      newFacts: null,
      decisionTraceEntry: { error: "FACT_MODEL_DISABLED", categoryId },
      stopReasonCode: "FACT_MODEL_DISABLED",
      stopReasonDetail: `FactModel exists but status='${factModel.status}' (must be ACTIVE)`
    };
  }
  
  // Find or create incident - SCOPED by (sectionId, questionId, instanceNumber)
  let incidents = [...(session.incidents || [])];
  let incident = null;
  let isNewIncident = false;
  
  if (incidentId) {
    // Look up by explicit incident ID
    incident = incidents.find(inc => inc.incident_id === incidentId);
  } else if (baseQuestionId && sectionId) {
    // Find existing incident for this (section, question, instance) tuple
    const effectiveInstance = instanceNumber || 1;
    incident = incidents.find(inc => 
      inc.question_id === baseQuestionId && 
      inc.category_id === categoryId &&
      inc.instance_number === effectiveInstance
    );
    
    if (incident) {
      incidentId = incident.incident_id;
      console.log("[IDE-V3] Found existing incident by (questionId, categoryId, instance)", {
        incidentId,
        baseQuestionId,
        categoryId,
        instanceNumber: effectiveInstance
      });
    }
  }
  
  if (!incident) {
    // Create new V3 incident with unique scoping
    const effectiveInstance = instanceNumber || 1;
    const timestamp = Date.now();
    const newIncidentId = `v3_${categoryId}_q${baseQuestionId || 'unknown'}_i${effectiveInstance}_${timestamp}`;
    
    incident = {
      incident_id: newIncidentId,
      category_id: categoryId,
      incident_type: factModel.incident_type || null,
      question_code: questionCode || null,
      question_id: baseQuestionId || null,
      instance_number: effectiveInstance,
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
    
    console.log("[IDE-V3] Created new incident", {
      incidentId: newIncidentId,
      baseQuestionId,
      questionCode,
      sectionId,
      categoryId,
      instanceNumber: effectiveInstance
    });
  }
  
  // Initialize/get V3 fact_state
  let factState = { ...(session.fact_state || {}) };
  if (!factState[incidentId]) {
    factState = { ...factState, ...initializeV3FactState(incidentId, factModel) };
  }
  
  // Get current missing fields BEFORE extraction
  const missingFieldsBefore = getMissingRequiredFields(factState, incidentId, factModel);
  
  // Detect opener narrative: use isInitialCall flag from caller (reliable on first call)
  const isOpenerNarrative = Boolean(isInitialCall) && latestAnswerText && latestAnswerText.length >= 20;
  
  // Extract facts from answer (BEFORE selecting next missing field)
  const extractedFacts = extractFactsFromAnswer(
    latestAnswerText, 
    missingFieldsBefore, 
    factModel,
    isOpenerNarrative,
    categoryId
  );
  
  // Update incident.facts
  incident.facts = {
    ...(incident.facts || {}),
    ...extractedFacts
  };
  
  // Update fact_state
  factState = updateV3FactState(factState, incidentId, factModel, incident.facts);
  
  // Get updated missing fields AFTER extraction merge
  const missingFieldsAfter = getMissingRequiredFields(factState, incidentId, factModel);
  
  // Diagnostic log on initial call ONLY (definitive)
  if (isInitialCall) {
    console.log(`[V3_INITIAL_EXTRACT][${categoryId}] incidentId=${incidentId} extractedKeys=${Object.keys(extractedFacts).join(",")} missingBefore=${missingFieldsBefore.map(f=>f.field_id).join(",")} missingAfter=${missingFieldsAfter.map(f=>f.field_id).join(",")}`);
  }
  
  // Diagnostic log with key alignment check
  const allModelFields = [
    ...(factModel?.required_fields || []),
    ...(factModel?.optional_fields || [])
  ];
  console.log(`[V3_EXTRACT_KEYS] extractedKeys=${Object.keys(extractedFacts).join(",")} modelKeys=${allModelFields.slice(0,10).map(f=>f.field_id).join(",")} missingAfter=${missingFieldsAfter.map(f=>f.field_id).join(",")}`);
  
  // Log extraction for debugging
  if (Object.keys(extractedFacts).length > 0) {
    console.log(`[V3_EXTRACT][${categoryId}] extracted=${JSON.stringify(extractedFacts)} missingAfter=${missingFieldsAfter.map(f => f.field_id).join(',')}`);
  }
  
  // Track probe and non-substantive counts
  const legacyFactState = incident.fact_state || { probe_count: 0, non_substantive_count: 0 };
  legacyFactState.probe_count = (legacyFactState.probe_count || 0) + 1;
  
  if (isNonSubstantiveAnswer(latestAnswerText)) {
    legacyFactState.non_substantive_count = (legacyFactState.non_substantive_count || 0) + 1;
  }
  
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
    
    // DIAGNOSTIC: Log STOP only on initial call
    if (!incidentId || isNewIncident) {
      console.log("[IDE-V3][STOP_DIAGNOSTIC] ========== GUARDRAIL TRIGGERED: RECAP ==========");
      console.log("[IDE-V3][STOP_DIAGNOSTIC]", {
        categoryId,
        packId: null,
        isInitialCall: !incidentId || isNewIncident,
        foundCategoryConfig: true,
        foundPromptTemplate: true,
        questionBankCount: (factModel.required_fields?.length || 0) + (factModel.optional_fields?.length || 0),
        eligibleQuestionsCount: missingFieldsAfter.length,
        stopReasonCode: "REQUIRED_FIELDS_COMPLETE",
        stopReasonDetail: "All required fields collected (zero required fields defined)",
        incidentId_in: incidentId || null,
        incidentId_out: incident.incident_id
      });
    }
  } else if (legacyFactState.probe_count >= mergedConfig.maxProbesPerIncident) {
    nextAction = "STOP";
    stopReason = "MAX_PROBES_REACHED";
    legacyFactState.completion_status = "incomplete";
    nextPrompt = getCompletionMessage("STOP", stopReason);
    
    // DIAGNOSTIC: Log STOP only on initial call
    if (!incidentId || isNewIncident) {
      console.log("[IDE-V3][STOP_DIAGNOSTIC] ========== GUARDRAIL TRIGGERED: STOP ==========");
      console.log("[IDE-V3][STOP_DIAGNOSTIC]", {
        categoryId,
        packId: null,
        isInitialCall: !incidentId || isNewIncident,
        foundCategoryConfig: true,
        foundPromptTemplate: true,
        questionBankCount: (factModel.required_fields?.length || 0) + (factModel.optional_fields?.length || 0),
        eligibleQuestionsCount: missingFieldsAfter.length,
        stopReasonCode: "MAX_PROBES_REACHED",
        stopReasonDetail: `Probe count ${legacyFactState.probe_count} >= max ${mergedConfig.maxProbesPerIncident}`,
        incidentId_in: incidentId || null,
        incidentId_out: incident.incident_id
      });
    }
  } else if (legacyFactState.non_substantive_count >= mergedConfig.maxNonSubstantiveResponses) {
    nextAction = "STOP";
    stopReason = "NON_SUBSTANTIVE_LIMIT";
    legacyFactState.completion_status = "blocked";
    nextPrompt = getCompletionMessage("STOP", stopReason);
    
    // DIAGNOSTIC: Log STOP only on initial call
    if (!incidentId || isNewIncident) {
      console.log("[IDE-V3][STOP_DIAGNOSTIC] ========== GUARDRAIL TRIGGERED: STOP ==========");
      console.log("[IDE-V3][STOP_DIAGNOSTIC]", {
        categoryId,
        packId: null,
        isInitialCall: !incidentId || isNewIncident,
        foundCategoryConfig: true,
        foundPromptTemplate: true,
        questionBankCount: (factModel.required_fields?.length || 0) + (factModel.optional_fields?.length || 0),
        eligibleQuestionsCount: missingFieldsAfter.length,
        stopReasonCode: "NON_SUBSTANTIVE_LIMIT",
        stopReasonDetail: `Non-substantive count ${legacyFactState.non_substantive_count} >= max ${mergedConfig.maxNonSubstantiveResponses}`,
        incidentId_in: incidentId || null,
        incidentId_out: incident.incident_id
      });
    }
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
    
    // DIAGNOSTIC: Log STOP only on initial call
    if (!incidentId || isNewIncident) {
      console.log("[IDE-V3][STOP_DIAGNOSTIC] ========== GUARDRAIL TRIGGERED: RECAP ==========");
      console.log("[IDE-V3][STOP_DIAGNOSTIC]", {
        categoryId,
        packId: null,
        isInitialCall: !incidentId || isNewIncident,
        foundCategoryConfig: true,
        foundPromptTemplate: true,
        questionBankCount: (factModel.required_fields?.length || 0) + (factModel.optional_fields?.length || 0),
        eligibleQuestionsCount: 0,
        stopReasonCode: "REQUIRED_FIELDS_COMPLETE",
        stopReasonDetail: "All required fields collected (zero missing after extraction)",
        incidentId_in: incidentId || null,
        incidentId_out: incident.incident_id
      });
    }
  }
  
  // Generate narrative summary on STOP/RECAP
  if (nextAction === "STOP" || nextAction === "RECAP") {
    const categoryLabel = factModel.category_label || categoryId.replace(/_/g, ' ');
    const factsText = Object.entries(incident.facts || {})
      .filter(([_, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
      .join('; ');
    
    let summary = '';
    if (factsText.length > 100) {
      summary = `${categoryLabel}: ${factsText.substring(0, 200)}${factsText.length > 200 ? '...' : ''}`;
    } else if (factsText.length > 0) {
      summary = `${categoryLabel}: ${factsText}`;
    } else {
      summary = `${categoryLabel}: Details recorded.`;
    }
    
    incident.narrative_summary = summary;
  }
  
  legacyFactState.stop_reason = stopReason;
  incident.fact_state = legacyFactState;
  incident.updated_at = new Date().toISOString();
  
  // Generate narrative summary on STOP/RECAP
  if (nextAction === "STOP" || nextAction === "RECAP") {
    console.log('[IDE-V3] Generating summary server-side', { incidentId, nextAction, stopReason });
    
    const categoryLabel = factModel.category_label || categoryId.replace(/_/g, ' ');
    const factsText = Object.entries(incident.facts || {})
      .filter(([_, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
      .join('; ');
    
    let summary = '';
    if (factsText.length > 100) {
      summary = `${categoryLabel}: ${factsText.substring(0, 200)}${factsText.length > 200 ? '...' : ''}`;
    } else if (factsText.length > 0) {
      summary = `${categoryLabel}: ${factsText}`;
    } else {
      summary = `${categoryLabel}: Details recorded.`;
    }
    
    incident.narrative_summary = summary;
    console.log('[IDE-V3] Summary generated', { incidentId, summaryLength: summary.length });
  }
  
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
    console.log('[IDE-V3] Session persisted', { sessionId, incidentsCount: incidents.length });
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
      : 100,
    stopReasonCode: stopReason || null,
    stopReasonDetail: stopReason ? `Stop triggered: ${stopReason}` : null
  };
}

// ========== HTTP HANDLER ==========

Deno.serve(async (req) => {
  console.log('[DECISION_V3][HTTP_ENTRY] ========== REQUEST RECEIVED ==========');
  
  try {
    const base44 = createClientFromRequest(req);
    
    // Safe user lookup - treat as optional for public/anonymous sessions
    let userContext = null;
    try {
      userContext = await base44.auth.me();
    } catch (authErr) {
      console.warn('[DECISION_V3][USER_LOOKUP_FAILED] Continuing with anonymous context', {
        message: authErr?.message
      });
      // Non-fatal - continue with anonymous context
      userContext = null;
    }
    
    const effectiveUserContext = userContext || {
      id: null,
      email: null,
      role: 'anonymous'
    };
    
    console.log('[DECISION_V3][USER_CONTEXT]', {
      authenticated: !!userContext,
      role: effectiveUserContext.role
    });
    
    let body;
    try {
      body = await req.json();
      console.log('[DECISION_V3][PAYLOAD]', {
        hasSessionId: !!body.sessionId,
        hasCategoryId: !!body.categoryId,
        hasIncidentId: !!body.incidentId,
        hasAnswerText: !!body.latestAnswerText,
        answerLength: body.latestAnswerText?.length || 0
      });
    } catch (e) {
      console.error('[DECISION_V3][PARSE_ERROR]', e.message);
      return Response.json({ 
        ok: false,
        errorCode: 'INVALID_JSON',
        errorMessage: 'Request body is not valid JSON'
      }, { status: 400 });
    }
    
    // ========== HEALTHCHECK MODE ==========
    if (body.mode === "healthcheck" || body.isReadinessCheck === true) {
      console.log("[DECISION_V3][HEALTHCHECK] OK");
      return Response.json({ 
        ok: true, 
        mode: "healthcheck",
        timestamp: new Date().toISOString()
      });
    }
    
    // ========== VALIDATE REQUIRED FIELDS ==========
    const { sessionId, categoryId, incidentId, latestAnswerText, baseQuestionId, questionCode, sectionId, instanceNumber, isInitialCall, config } = body;
    
    if (!sessionId || !categoryId) {
      console.error('[DECISION_V3][BAD_PAYLOAD] Missing required fields', {
        sessionId: !!sessionId,
        categoryId: !!categoryId,
        payload: body
      });
      return Response.json({ 
        ok: false,
        errorCode: 'BAD_REQUEST',
        errorMessage: 'Missing required fields: sessionId and categoryId are required'
      }, { status: 400 });
    }
    
    // ========== CALL DECISION ENGINE ==========
    console.log('[DECISION_V3][CALLING_ENGINE]', {
      sessionId,
      categoryId,
      incidentId: incidentId || '(will create)',
      answerLength: latestAnswerText?.length || 0
    });
    
    const result = await decisionEngineV3Probe(base44, {
      sessionId,
      categoryId,
      incidentId: incidentId || null,
      latestAnswerText: latestAnswerText || "",
      baseQuestionId: baseQuestionId || null,
      questionCode: questionCode || null,
      sectionId: sectionId || null,
      instanceNumber: instanceNumber || 1,
      isInitialCall: isInitialCall || false,
      config: config || {}
    });
    
    console.log('[DECISION_V3][RESULT]', {
      nextAction: result.nextAction,
      hasPrompt: !!result.nextPrompt,
      incidentId: result.incidentId,
      missingFieldsCount: result.missingFields?.length || 0
    });
    
    // ========== RETURN SUCCESS ==========
    return Response.json({
      ok: true,
      ...result,
      stopReasonCode: result.stopReasonCode || null,
      stopReasonDetail: result.stopReasonDetail || null
    });
    
  } catch (error) {
    console.error('[DECISION_V3][FATAL_ERROR] ========== UNHANDLED EXCEPTION ==========');
    console.error('[DECISION_V3][FATAL_ERROR]', {
      message: error.message,
      name: error.name,
      stack: error.stack
    });
    
    // Return 200 with controlled error (not 500)
    return Response.json({ 
      ok: false,
      errorCode: 'DECISION_ENGINE_ERROR',
      errorMessage: error.message || 'Unknown error in decisionEngineV3',
      nextAction: "STOP",
      nextPrompt: "I apologize, there was a technical issue. Let's continue with the interview.",
      details: {
        errorName: error.name,
        timestamp: new Date().toISOString()
      }
    }, { status: 200 });
  }
});