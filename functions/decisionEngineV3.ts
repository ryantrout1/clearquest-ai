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
  consequences: "What were the consequences of this situation?",
  description: "Can you describe what happened in more detail?",
  circumstances: "What were the circumstances surrounding this?",
  injuries: "Were there any injuries involved?",
  agency: "Which agency or organization was involved?",
  agency_name: "What is the name of the agency?",
  position: "What position were you applying for or held?",
  position_applied_for: "What position did you apply for with that agency?",
  agency_name: "What was the name of the law enforcement agency where you omitted information?",
  omission_timeframe: "When did that application occur (approximately)?",
  omission_nature: "What was the nature of what you omitted?",
  what_omitted: "Can you explain what specific information was not disclosed?",
  reason_for_omission: "What was your reason for not disclosing this at the time?",
  disclosure_or_discovery_context: "How did this come to light - did you disclose it yourself, clarify it later, or was it discovered?",
  corrective_or_consequential_actions: "What steps did you take after realizing this information was needed?"
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
  PRIOR_LE_APPS: "Thanks for letting me know about your prior applications. Can you tell me about the first agency you applied to?",
  INTEGRITY_APPS: "In your own words, walk me through this application integrity issue — which agency it was with, what position you were applying for, when it happened, what the issue was, what information was involved, how it was discovered, and what the outcome was."
};

const COMPLETION_MESSAGES = {
  RECAP: "Thank you for providing those details. I have all the information I need for this incident.",
  STOP_COMPLETE: "Thank you. We've covered the key points for this incident.",
  STOP_MAX_PROBES: "Thank you for your responses. Let's move on to the next topic.",
  STOP_NON_SUBSTANTIVE: "I understand. Let's continue with the interview."
};

/**
 * Generate V3 probe question using LLM (Phase 1)
 * Falls back to templates if LLM fails or flag disabled
 */
async function generateV3ProbeQuestionLLM(base44Client, field, collectedFacts, context) {
  const { packInstructions, categoryLabel, categoryId, instanceNumber, probeCount, packId } = context;
  
  // GUARD: If no instructions or too short, use template fallback
  if (!packInstructions || packInstructions.trim().length < 50) {
    console.warn('[V3_PROBE_GEN][NO_INSTRUCTIONS]', {
      packId,
      categoryId,
      reason: 'No ai_probe_instructions or too short - using template fallback'
    });
    return null; // Signal to use template
  }
  
  // Build LLM prompt
  const prompt = buildV3LLMProbePrompt(field, collectedFacts, packInstructions, context);
  
  console.log('[V3_PROBE_GEN][LLM_CALL]', {
    packId,
    categoryId,
    fieldId: field.field_id,
    hasInstructions: true,
    instructionsLen: packInstructions.length,
    probeCount
  });
  
  try {
    const LLM_TIMEOUT_MS = 5000;
    
    const llmPromise = base44Client.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          question: { type: "string" }
        },
        required: ["question"]
      }
    });
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('LLM_TIMEOUT')), LLM_TIMEOUT_MS)
    );
    
    const t0 = Date.now();
    const result = await Promise.race([llmPromise, timeoutPromise]);
    const dtMs = Date.now() - t0;
    
    // Validate output
    if (!result.question || typeof result.question !== 'string' || result.question.trim().length < 8) {
      throw new Error('LLM returned invalid question (missing or too short)');
    }
    
    if (result.question.length > 220) {
      console.warn('[V3_PROBE_GEN][QUESTION_TRUNCATED]', {
        originalLen: result.question.length,
        action: 'truncating to 220 chars'
      });
      result.question = result.question.substring(0, 217) + '...';
    }
    
    console.log('[V3_PROBE_GEN][LLM_OK]', {
      packId,
      categoryId,
      fieldId: field.field_id,
      llmMs: dtMs,
      questionLen: result.question.length
    });
    
    return result.question;
    
  } catch (err) {
    console.error('[V3_PROBE_GEN][LLM_FALLBACK]', {
      packId,
      categoryId,
      fieldId: field.field_id,
      reason: err.message === 'LLM_TIMEOUT' ? 'timeout_5s' : err.message
    });
    
    return null; // Signal to use template fallback
  }
}

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
      return `When did this occur?`;
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
 * Build V3 probe prompt for LLM question generation (Phase 1)
 * Uses pack instructions + missing field + collected facts
 */
function buildV3LLMProbePrompt(field, collectedFacts, packInstructions, context) {
  const factsText = Object.entries(collectedFacts || {})
    .filter(([_, v]) => v && String(v).trim() !== '')
    .map(([k, v]) => `- ${k.replace(/_/g, ' ')}: ${v}`)
    .join('\n');
  
  return `You are a conversational interviewer conducting a background investigation interview.

FOLLOW THESE PACK INSTRUCTIONS (do not ignore):
${packInstructions}

We are collecting ONE missing fact right now:
- field_id: ${field.field_id}
- label: ${field.label}
- type: ${field.type}

Facts already collected (for context only):
${factsText || '(None yet)'}

Write ONE short, friendly, conversational question that asks ONLY for the missing fact above.
Do not ask for other fields. Do not ask multiple questions.
Follow the pack instructions strictly (especially regarding what NOT to ask).
Return JSON: {"question":"..."}`;
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
 * Detect if text contains month/year pattern.
 * Matches: "March 2022", "Mar 2022", "3/2022", "03/2022", "2022-03", "In March 2022", "In Oct 2019"
 */
function hasMonthYear(text) {
  if (!text || typeof text !== 'string') return false;
  const patterns = [
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i,
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{4}\b/i,
    /\b\d{1,2}\/\d{4}\b/,
    /\b\d{4}[-\/]\d{1,2}\b/,
    /(?:in|during|around)\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{4}/i
  ];
  return patterns.some(p => p.test(text));
}

/**
 * Legacy wrapper for backward compatibility
 */
function isMonthYearLike(text) {
  return hasMonthYear(text);
}

/**
 * Detect if a prompt/field is asking for date/apply/occur information.
 * Checks both prompt text content and field ID naming.
 * @param {Object} params
 * @param {string} params.promptText - The prompt text being shown
 * @param {string} params.missingFieldId - The field ID being asked about
 * @param {string} params.categoryId - The category ID
 * @returns {boolean} - True if this is a date/apply/occur question
 */
function isDateApplyOccurIntent({ promptText, missingFieldId, categoryId }) {
  const promptLower = (promptText || '').toLowerCase();
  const fieldIdLower = (missingFieldId || '').toLowerCase();
  
  // Check prompt text for date/apply/occur phrases
  const promptHasDateIntent = [
    'when did', 'when was', 'what date', 'month', 'year', 
    'occur', 'appl', 'date of', 'what month', 'when this'
  ].some(phrase => promptLower.includes(phrase));
  
  // Check field ID for date/apply/occur naming
  const fieldIdHasDateIntent = [
    'date', 'month', 'year', 'occur', 'appl', 'time', 'when'
  ].some(kw => fieldIdLower.includes(kw));
  
  // Special case: PRIOR_LE_APPS and prompt mentions "apply" anywhere
  const isPriorLeApplyIntent = categoryId === 'PRIOR_LE_APPS' && promptLower.includes('apply');
  
  return promptHasDateIntent || fieldIdHasDateIntent || isPriorLeApplyIntent;
}

/**
 * GENERIC ENUM INFERENCE: Map narrative text to FactModel enum values.
 * Works across all categories by matching keywords to enum_options.
 * ENHANCED: Deterministic outcome inference for PRIOR_LE_APPS and similar packs
 */
function inferEnumValue(field, narrativeText) {
  if (!field || !narrativeText) return null;
  if (!field.enum_options || !Array.isArray(field.enum_options) || field.enum_options.length === 0) return null;
  
  const lower = narrativeText.toLowerCase();
  
  // ENHANCED: Comprehensive outcome/status inference patterns
  const outcomeKeywords = {
    hired: ['hired', 'offered', 'accepted the position', 'got the job', 'selected', 'received an offer', 'was hired'],
    disqualified: ['disqualified', 'rejected', 'denied', 'not selected', 'did not pass', 'failed', 'eliminated', 'did not make it', 'was not selected', 'didn\'t pass'],
    withdrew: ['withdrew', 'pulled out', 'withdrew my application', 'decided not to continue', 'pulled my application', 'dropped out', 'withdrew from'],
    still_in_process: ['still in process', 'pending', 'waiting to hear', 'under review', 'in progress', 'still waiting', 'haven\'t heard', 'ongoing']
  };
  
  // Try to match narrative keywords to enum values
  for (const enumValue of field.enum_options) {
    const enumLower = enumValue.toLowerCase();
    const enumCanon = canon(enumValue);
    
    // Exact match (case-insensitive)
    if (lower.includes(enumLower)) {
      console.log('[V3_ENUM_INFERENCE][EXACT_MATCH]', {
        fieldId: field.field_id,
        enumValue,
        matchedOn: 'exact string match'
      });
      return enumValue;
    }
    
    // Keyword-based inference
    for (const [canonicalOutcome, keywords] of Object.entries(outcomeKeywords)) {
      if (enumCanon.includes(canonicalOutcome)) {
        if (keywords.some(kw => lower.includes(kw))) {
          console.log('[V3_ENUM_INFERENCE][KEYWORD_MATCH]', {
            fieldId: field.field_id,
            enumValue,
            canonicalOutcome,
            matchedKeyword: keywords.find(kw => lower.includes(kw))
          });
          return enumValue;
        }
      }
    }
  }
  
  return null;
}

/**
 * Resolve exact field_id from FactModel by semantic name.
 * Uses canonical matching: agency_name → agencyName, approx_month_year → approxMonthYear
 * Fallback: match by label if field_id match fails
 */
function resolveFieldId(factModel, semanticKey) {
  if (!factModel || !semanticKey) return null;
  
  const wanted = canon(semanticKey);
  
  const allFields = [
    ...(factModel.required_fields || []),
    ...(factModel.optional_fields || [])
  ];
  
  // PRIORITY 1: Exact field_id match (canonical)
  for (const field of allFields) {
    if (field?.field_id && canon(field.field_id) === wanted) {
      return field.field_id;
    }
  }
  
  // PRIORITY 2: Label-based fallback (for legacy packs with inconsistent naming)
  const semanticLower = String(semanticKey || '').toLowerCase();
  if (semanticLower.includes('agency')) {
    for (const field of allFields) {
      const labelLower = String(field?.label || '').toLowerCase();
      if (labelLower.includes('agency') && labelLower.includes('name')) {
        console.log('[V3_FIELD_RESOLVE][LABEL_FALLBACK]', {
          semanticKey,
          resolvedTo: field.field_id,
          via: 'label match (agency + name)'
        });
        return field.field_id;
      }
    }
  }
  
  return null;
}

// ========== DETERMINISTIC MONTH/YEAR EXTRACTION ==========

/**
 * Extract month and year from text (deterministic)
 * Supports patterns: "June 2019", "Jun 2019", "06/2019", "2019-06", etc.
 * @returns {string|null} Normalized "Month YYYY" or null if not found
 */
function extractMonthYear(text) {
  if (!text || typeof text !== 'string' || text.length < 8) return null;
  
  const normalized = text.trim();
  
  const datePatterns = [
    // "In March 2022", "In Oct 2019", "during March 2022"
    /(?:in|during|around)\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(?:of\s+)?(\d{4})/i,
    // "March 2022", "Oct 2019"
    /(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(?:of\s+)?(\d{4})/i,
    // "2022 March" (year first)
    /(\d{4})\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?/i,
    // "3/2022", "03/2022"
    /\b(\d{1,2})\/(\d{4})\b/,
    // "2022-03", "2022/03"
    /\b(\d{4})[-\/](\d{1,2})\b/
  ];
  
  for (const pattern of datePatterns) {
    const match = normalized.match(pattern);
    if (match) {
      let monthStr, yearStr;
      
      // Handle month-name patterns (groups: month, year OR year, month)
      if (match[1] && match[2]) {
        if (/^\d{4}$/.test(match[1])) {
          // "2022 March" format
          yearStr = match[1];
          monthStr = match[2];
        } else if (/^\d{4}$/.test(match[2])) {
          // "March 2022" format
          monthStr = match[1];
          yearStr = match[2];
        } else if (/^\d{1,2}$/.test(match[1])) {
          // "3/2022" format
          monthStr = match[1];
          yearStr = match[2];
        } else if (/^\d{1,2}$/.test(match[2])) {
          // "2022/03" format
          yearStr = match[1];
          monthStr = match[2];
        }
      }
      
      if (monthStr && yearStr) {
        // Normalize month to full name for consistent storage
        const monthMap = {
          'jan': 'January', 'feb': 'February', 'mar': 'March', 'apr': 'April',
          'may': 'May', 'jun': 'June', 'jul': 'July', 'aug': 'August',
          'sep': 'September', 'sept': 'September', 'oct': 'October', 'nov': 'November', 'dec': 'December'
        };
        
        let finalMonth = monthStr;
        
        // Convert numeric month to name
        if (/^\d{1,2}$/.test(monthStr)) {
          const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                              'July', 'August', 'September', 'October', 'November', 'December'];
          const monthNum = parseInt(monthStr, 10);
          if (monthNum >= 1 && monthNum <= 12) {
            finalMonth = monthNames[monthNum - 1];
          }
        } else if (monthStr.length <= 4) {
          // Expand abbreviated month (Mar → March, Oct → October)
          const abbrev = monthStr.toLowerCase().replace('.', '');
          finalMonth = monthMap[abbrev] || monthStr;
        }
        
        return `${finalMonth} ${yearStr}`;
      }
    }
  }
  
  return null;
}

// ========== OPENER NARRATIVE EXTRACTION ==========

/**
 * GENERALIZED V3 FACT INGESTION (FactModel-Driven)
 * Extracts facts from opener narrative for ANY category using FactModel schema.
 * Maps extracted values to canonical field_id keys to prevent mismatches.
 */
function extractOpenerFacts(openerText, categoryId, factModel) {
  if (!openerText || openerText.length < 20) return {};
  if (!factModel) return {};
  
  const extracted = {};
  const normalized = openerText.trim();
  const lower = normalized.toLowerCase();
  
  // Get all FactModel fields (required + optional)
  const allFields = [
    ...(factModel.required_fields || []),
    ...(factModel.optional_fields || [])
  ];
  
  console.log('[V3_FACTMODEL_INGEST][START]', {
    categoryId,
    openerLength: openerText.length,
    totalFields: allFields.length,
    requiredCount: factModel.required_fields?.length || 0
  });
  
  // UNIVERSAL DATE EXTRACTION: Scan for all date-ish fields in FactModel
  const dateFields = allFields.filter(f => {
    const typeMatch = f.type === 'date' || f.type === 'month_year';
    const idMatch = ['date', 'when', 'occurred', 'month', 'year', 'time', 'approx'].some(kw => 
      canon(f.field_id || '').includes(kw)
    );
    return typeMatch || idMatch;
  });
  
  if (dateFields.length > 0) {
    // DETERMINISTIC EXTRACTION: Use new helper function
    const extractedDate = extractMonthYear(openerText);
    
    if (extractedDate) {
      // Map to ALL matching date fields in FactModel
      for (const dateField of dateFields) {
        extracted[dateField.field_id] = extractedDate;
      }
      
      console.log('[V3_OPENER_FACTS][MONTH_YEAR_DETECTED]', {
        detected: true,
        normalized: extractedDate,
        preview: openerText.substring(0, 80),
        mappedToFields: dateFields.map(f => f.field_id).join(',')
      });
    } else {
      console.log('[V3_OPENER_FACTS][MONTH_YEAR_DETECTED]', {
        detected: false,
        preview: openerText.substring(0, 80)
      });
    }
  }
  
  // CATEGORY-SPECIFIC EXTRACTIONS: INTEGRITY_APPS (8-field MVP - realigned semantics)
  
  // omission_nature - detect from narrative context
  const omissionNatureFields = allFields.filter(f => canon(f.field_id || '').includes('omission_nature'));
  if (omissionNatureFields.length > 0) {
    let nature = null;
    if (lower.includes('prior application') || lower.includes('previous application')) {
      nature = 'Prior application';
    } else if (lower.includes('withdrew') || lower.includes('withdrawal')) {
      nature = 'Withdrawal';
    } else if (lower.includes('disqualified') || lower.includes('disqualification')) {
      nature = 'Disqualification';
    } else if (lower.includes('background') || lower.includes('citation') || lower.includes('violation')) {
      nature = 'Background detail';
    }
    if (nature) {
      for (const field of omissionNatureFields) {
        extracted[field.field_id] = nature;
      }
    }
  }
  
  // reason_for_omission - extract from "reason" or "why" context
  const reasonFields = allFields.filter(f => canon(f.field_id || '').includes('reason_for_omission'));
  if (reasonFields.length > 0 && normalized.length > 20) {
    const sentences = normalized.split(/[.!?]+/);
    for (const sentence of sentences) {
      if (sentence.length > 15 && (
        sentence.includes('reason') || 
        sentence.includes('because') || 
        sentence.includes('oversight') ||
        sentence.includes('forgot') ||
        sentence.includes('didn\'t think')
      )) {
        for (const field of reasonFields) {
          extracted[field.field_id] = sentence.trim();
        }
        break;
      }
    }
  }
  
  // disclosure_or_discovery_context
  const disclosureFields = allFields.filter(f => canon(f.field_id || '').includes('disclosure') || canon(f.field_id || '').includes('discovery_context'));
  if (disclosureFields.length > 0) {
    let context = null;
    if (lower.includes('self-disclosed') || lower.includes('disclosed it myself')) {
      context = 'Self-disclosed';
    } else if (lower.includes('clarified during') || lower.includes('explained during')) {
      context = 'Clarified during background';
    } else if (lower.includes('investigator discovered') || lower.includes('investigator found')) {
      context = 'Discovered by investigator';
    } else if (lower.includes('corrected voluntarily') || lower.includes('corrected it later')) {
      context = 'Corrected voluntarily';
    }
    if (context) {
      for (const field of disclosureFields) {
        extracted[field.field_id] = context;
      }
    }
  }
  
  // corrective_or_consequential_actions
  const correctiveFields = allFields.filter(f => canon(f.field_id || '').includes('corrective') || canon(f.field_id || '').includes('consequential'));
  if (correctiveFields.length > 0 && normalized.length > 20) {
    const sentences = normalized.split(/[.!?]+/);
    for (const sentence of sentences) {
      if (sentence.length > 15 && (
        sentence.includes('correct') || 
        sentence.includes('clarif') || 
        sentence.includes('disclosed') ||
        sentence.includes('steps') ||
        sentence.includes('voluntarily') ||
        sentence.includes('later')
      )) {
        for (const field of correctiveFields) {
          extracted[field.field_id] = sentence.trim();
        }
        break;
      }
    }
  }
  
  // UNIVERSAL AGENCY EXTRACTION: Scan for agency-ish fields
  const agencyFields = allFields.filter(f => 
    ['agency', 'department', 'organization', 'employer'].some(kw => 
      canon(f.field_id || '').includes(kw)
    )
  );
  
  if (agencyFields.length > 0) {
    const agencyPatterns = [
      /applied\s+to\s+(?:the\s+)?([A-Z][A-Za-z\s&.'-]*?(?:Police Department|Police Dept|Sheriff's Office|Sheriff|Police|PD|SO|Dept|Department))/i,
      /applied\s+with\s+(?:the\s+)?([A-Z][A-Za-z\s&.'-]*?(?:Police Department|Police Dept|Sheriff's Office|Sheriff|Police|PD|SO|Dept|Department))/i,
      /to\s+(?:the\s+)?([A-Z][A-Za-z\s&.'-]+?(?:Police Department|Police Dept|Sheriff's Office|Sheriff|Police|PD|SO|Department|Agency))/i,
      /\b([A-Z][A-Za-z]+\s+(?:PD|Police|Sheriff|SO))\b/i
    ];
    
    for (const pattern of agencyPatterns) {
      const match = normalized.match(pattern);
      if (match && match[1]) {
        let agency = match[1].trim().replace(/\s+(for|as|in|during|position|role)$/i, '').trim();
        if (agency.length >= 3) {
          for (const agencyField of agencyFields) {
            extracted[agencyField.field_id] = agency;
          }
          console.log('[V3_FACTMODEL_INGEST][AGENCY]', {
            extractedValue: agency,
            mappedToFields: agencyFields.map(f => f.field_id).join(',')
          });
          break;
        }
      }
    }
  }
  
  // UNIVERSAL POSITION EXTRACTION
  const positionFields = allFields.filter(f => 
    ['position', 'title', 'role', 'job'].some(kw => canon(f.field_id || '').includes(kw))
  );
  
  if (positionFields.length > 0) {
    const positionPatterns = [
      /for\s+(?:a|an|the)?\s*([A-Za-z\s]+?)\s+(?:position|role|job)/i,
      /as\s+(?:a|an|the)?\s*([A-Za-z\s]+?)\s+(?:position|role)/i,
      /for\s+(?:a|an|the)?\s*(Police Officer Recruit|Police Officer|Deputy Sheriff|Sheriff Deputy|Correctional Officer|Officer|Recruit|Deputy|Agent)(?:\s|\.|\,|$)/i
    ];
    
    for (const pattern of positionPatterns) {
      const match = normalized.match(pattern);
      if (match && match[1]) {
        const position = match[1].trim();
        if (position.length >= 3) {
          for (const posField of positionFields) {
            extracted[posField.field_id] = position;
          }
          console.log('[V3_FACTMODEL_INGEST][POSITION]', {
            extractedValue: position,
            mappedToFields: positionFields.map(f => f.field_id).join(',')
          });
          break;
        }
      }
    }
  }
  
  // UNIVERSAL OUTCOME/ENUM EXTRACTION (DETERMINISTIC)
  const outcomeFields = allFields.filter(f => 
    ['outcome', 'result', 'status', 'decision', 'consequence'].some(kw => canon(f.field_id || '').includes(kw))
  );
  
  for (const outcomeField of outcomeFields) {
    // CRITICAL: Try enum inference FIRST if field has enum_options
    // This enables deterministic outcome extraction for PRIOR_LE_APPS and similar packs
    const inferredValue = inferEnumValue(outcomeField, normalized);
    if (inferredValue) {
      extracted[outcomeField.field_id] = inferredValue;
      console.log('[V3_FACTMODEL_INGEST][ENUM]', {
        fieldId: outcomeField.field_id,
        inferredValue,
        source: 'enum_inference',
        narrativePreview: normalized.substring(0, 60)
      });
      continue;
    }
    
    // Fallback: keyword matching for non-enum outcome fields
    let outcome = null;
    if (lower.includes('rejected') || lower.includes('denied') || lower.includes('disqualified') || lower.includes('not selected')) {
      outcome = 'Not selected/rejected';
    } else if (lower.includes('withdrew') || lower.includes('pulled out')) {
      outcome = 'Withdrew application';
    } else if (lower.includes('offered') || lower.includes('hired') || lower.includes('accepted')) {
      outcome = 'Hired/Offered position';
    } else if (lower.includes('still') && (lower.includes('process') || lower.includes('pending'))) {
      outcome = 'Still in process';
    }
    
    if (outcome) {
      extracted[outcomeField.field_id] = outcome;
      console.log('[V3_FACTMODEL_INGEST][OUTCOME]', {
        fieldId: outcomeField.field_id,
        extractedValue: outcome,
        source: 'keyword_match'
      });
    }
  }
  
  // INTEGRITY-SPECIFIC: Extract issue_type
  const issueTypeFields = allFields.filter(f => 
    canon(f.field_id || '').includes('issue') || canon(f.field_id || '').includes('type')
  );
  
  if (issueTypeFields.length > 0) {
    let issueType = null;
    
    if (lower.includes('omit') || lower.includes('left off') || lower.includes('forgot to include')) {
      issueType = 'Omission';
    } else if (lower.includes('false statement') || lower.includes('lied') || lower.includes('misrepresented')) {
      issueType = 'False Statement';
    } else if (lower.includes('cheat') || lower.includes('copied')) {
      issueType = 'Cheating';
    } else if (lower.includes('false document') || lower.includes('falsified')) {
      issueType = 'False Document';
    }
    
    if (issueType) {
      for (const field of issueTypeFields) {
        if (field.enum_options?.includes(issueType)) {
          extracted[field.field_id] = issueType;
          console.log('[V3_FACTMODEL_INGEST][ISSUE_TYPE]', {
            fieldId: field.field_id,
            extractedValue: issueType,
            source: 'keyword_match'
          });
        }
      }
    }
  }
  
  // INTEGRITY-SPECIFIC: Extract discovery_method
  const discoveryFields = allFields.filter(f => 
    canon(f.field_id || '').includes('discover') || canon(f.field_id || '').includes('how')
  );
  
  if (discoveryFields.length > 0) {
    let discoveryMethod = null;
    
    if (lower.includes('background investigator') || lower.includes('investigator found')) {
      discoveryMethod = 'Background Investigator';
    } else if (lower.includes('polygraph')) {
      discoveryMethod = 'Polygraph';
    } else if (lower.includes('self-disclosed') || lower.includes('i disclosed') || lower.includes('i told them')) {
      discoveryMethod = 'Self-disclosed';
    } else if (lower.includes('reference') || lower.includes('reference check')) {
      discoveryMethod = 'Reference check';
    }
    
    if (discoveryMethod) {
      for (const field of discoveryFields) {
        if (field.enum_options?.includes(discoveryMethod)) {
          extracted[field.field_id] = discoveryMethod;
          console.log('[V3_FACTMODEL_INGEST][DISCOVERY]', {
            fieldId: field.field_id,
            extractedValue: discoveryMethod,
            source: 'keyword_match'
          });
        }
      }
    }
  }
  
  // UNIVERSAL STAGE/PROGRESS EXTRACTION
  const stageFields = allFields.filter(f => 
    ['stage', 'how', 'far', 'progress', 'step'].some(kw => canon(f.field_id || '').includes(kw))
  );
  
  if (stageFields.length > 0) {
    const stageKeywords = [
      { keywords: ['written test', 'written exam', 'written portion'], value: 'Written test' },
      { keywords: ['physical test', 'physical fitness', 'pt test', 'fitness test'], value: 'Physical fitness test' },
      { keywords: ['oral board', 'oral interview', 'panel interview'], value: 'Oral board' },
      { keywords: ['polygraph', 'lie detector'], value: 'Polygraph' },
      { keywords: ['background investigation', 'background check', 'background'], value: 'Background investigation' },
      { keywords: ['psychological', 'psych eval', 'psych'], value: 'Psychological evaluation' },
      { keywords: ['medical exam', 'medical'], value: 'Medical examination' }
    ];
    
    for (const stage of stageKeywords) {
      if (stage.keywords.some(kw => lower.includes(kw))) {
        for (const stageField of stageFields) {
          extracted[stageField.field_id] = stage.value;
        }
        console.log('[V3_FACTMODEL_INGEST][STAGE]', {
          extractedValue: stage.value,
          mappedToFields: stageFields.map(f => f.field_id).join(',')
        });
        break;
      }
    }
  }
  
  console.log('[V3_FACTMODEL_INGEST][COMPLETE]', {
    categoryId,
    extractedCount: Object.keys(extracted).length,
    extractedFields: Object.keys(extracted).join(',')
  });
  
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
  config = {},
  traceId = null,
  packInstructions = null,
  useLLMProbeWording = false
}) {
  const effectiveTraceId = traceId || `${sessionId}-${Date.now()}`;
  console.log("[IDE-V3] decisionEngineV3Probe called", { 
    traceId: effectiveTraceId,
    sessionId, categoryId, incidentId, baseQuestionId, questionCode, sectionId, instanceNumber,
    answerLength: latestAnswerText?.length,
    isInitialCall
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
  
  console.log('[V3_EXTRACT][PRE_CALL]', {
    traceId: effectiveTraceId,
    isInitialCall,
    isOpenerNarrative,
    answerLength: latestAnswerText?.length || 0,
    missingFieldsBeforeExtraction: missingFieldsBefore.map(f => f.field_id).join(',')
  });
  
  // Extract facts from answer (BEFORE selecting next missing field)
  // CRITICAL: This runs on EVERY call, including isInitialCall=true
  const extractedFacts = extractFactsFromAnswer(
    latestAnswerText, 
    missingFieldsBefore, 
    factModel,
    isOpenerNarrative,
    categoryId
  );
  
  console.log('[V3_EXTRACT][POST_CALL]', {
    traceId: effectiveTraceId,
    extractedCount: Object.keys(extractedFacts).length,
    extractedFields: Object.keys(extractedFacts).join(','),
    extractedSample: Object.entries(extractedFacts).slice(0, 3).reduce((acc, [k, v]) => {
      acc[k] = typeof v === 'string' ? v.substring(0, 30) : v;
      return acc;
    }, {})
  });
  
  // LOG: Applied facts to fact model
  if (Object.keys(extractedFacts).length > 0 && isOpenerNarrative) {
    console.log('[V3_OPENER_FACTS][APPLIED_TO_FACT_MODEL]', {
      incidentId,
      categoryId,
      extractedFieldsCount: Object.keys(extractedFacts).length,
      extractedFieldKeys: Object.keys(extractedFacts).join(',')
    });
  }
  
  // PART 3: If month/year detected on initial call, write to ALL month/year required keys
  const detectedMonthYearNormalized = isInitialCall ? extractMonthYear(latestAnswerText || '') : null;
  
  if (detectedMonthYearNormalized && isInitialCall) {
    // Find ALL month/year required fields and write detected value to them
    const monthYearRequiredFields = (factModel.required_fields || []).filter(f => {
      const typeMatch = f.type === 'date' || f.type === 'month_year';
      const idMatch = ['date', 'month', 'year', 'when', 'time', 'approx'].some(kw => 
        canon(f.field_id || '').includes(kw)
      );
      return typeMatch || idMatch;
    });
    
    const requiredKeysWritten = [];
    for (const field of monthYearRequiredFields) {
      incident.facts[field.field_id] = detectedMonthYearNormalized;
      requiredKeysWritten.push(field.field_id);
    }
    
    if (requiredKeysWritten.length > 0) {
      console.log('[V3_MONTH_YEAR_KEYS][APPLIED]', {
        requiredKeysWritten,
        normalized: detectedMonthYearNormalized,
        incidentId
      });
    }
  }
  
  // EXACT-FIELD SATISFACTION: Force-write extracted values to EXACT missing fieldIds
  // This ensures missing field checks pass for the fields we extracted
  const fieldIdsSatisfiedExact = [];
  if (Object.keys(extractedFacts).length > 0) {
    for (const missingField of missingFieldsBefore) {
      const missingFieldIdCanon = canon(missingField.field_id);
      
      // Check if we have an extracted value that should satisfy this missing field
      const matchingExtractedKey = Object.keys(extractedFacts).find(extKey => 
        canon(extKey) === missingFieldIdCanon
      );
      
      if (matchingExtractedKey) {
        const extractedValue = extractedFacts[matchingExtractedKey];
        // Write using EXACT missing field ID (not the extracted key)
        incident.facts[missingField.field_id] = extractedValue;
        fieldIdsSatisfiedExact.push(missingField.field_id);
        
        console.log('[V3_EXACT_FIELD_WRITE]', {
          missingFieldId: missingField.field_id,
          extractedKey: matchingExtractedKey,
          value: typeof extractedValue === 'string' ? extractedValue.substring(0, 40) : extractedValue,
          canonMatch: `${missingFieldIdCanon} === ${canon(matchingExtractedKey)}`
        });
      }
    }
  }
  
  // Update incident.facts with ALL extracted values (includes exact writes above)
  incident.facts = {
    ...(incident.facts || {}),
    ...extractedFacts
  };
  
  // Update fact_state to reflect newly written facts
  factState = updateV3FactState(factState, incidentId, factModel, incident.facts);
  
  // RECOMPUTE missing fields AFTER exact writes
  const missingFieldsAfter = getMissingRequiredFields(factState, incidentId, factModel);
  
  // DETERMINISTIC DETECTION: Extract month/year from opener FIRST (single source of truth)
  const detectedMonthYearNormalized = isInitialCall ? extractMonthYear(latestAnswerText || '') : null;
  
  // LOAD-BEARING DIAGNOSTIC: Initial call truth log
  const extractedMonthYearKey = Object.keys(extractedFacts).find(k => 
    ['date', 'month', 'year', 'when', 'time', 'approx'].some(kw => canon(k).includes(kw))
  );
  const extractedMonthYearRaw = extractedMonthYearKey ? extractedFacts[extractedMonthYearKey] : null;
  
  // DETERMINISTIC FLAG: Use extractMonthYear result (not legacy hasMonthYear pattern)
  const openerHasMonthYear = Boolean(detectedMonthYearNormalized);
  
  // PART 1: DIAGNOSTIC - Show which keys engine checks for month/year + their current values
  if (isInitialCall && categoryId === 'PRIOR_LE_APPS') {
    // Find all date-ish required fields the engine will check
    const dateRequiredFields = (factModel.required_fields || []).filter(f => {
      const typeMatch = f.type === 'date' || f.type === 'month_year';
      const idMatch = ['date', 'month', 'year', 'when', 'time', 'approx'].some(kw => 
        canon(f.field_id || '').includes(kw)
      );
      return typeMatch || idMatch;
    });
    
    const requiredKeys = dateRequiredFields.map(f => f.field_id);
    const valuesByKey = {};
    for (const key of requiredKeys) {
      valuesByKey[key] = incident.facts[key] || null;
    }
    
    console.log('[V3_MONTH_YEAR_KEYS][AUDIT]', {
      categoryId,
      requiredKeys,
      valuesByKey,
      detectedMonthYearNormalized,
      openerPreview: (latestAnswerText || '').substring(0, 80)
    });
  }
  
  if (isInitialCall) {
    console.log(`[V3_OPENER_EXTRACT][INITIAL_CALL] categoryId=${categoryId} packId=${factModel?.linked_pack_ids?.[0] || 'N/A'} incidentId=${incidentId} extractedMonthYear=${extractedMonthYearRaw || 'null'} fieldIdsSatisfiedByExtraction=[${fieldIdsSatisfiedExact.join(',')}] missingFieldsCount=${missingFieldsAfter.length} missingFieldIds=[${missingFieldsAfter.map(f=>f.field_id).slice(0,10).join(',')}]`);
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
    // PRE-ASK GUARD: Skip fields already collected (canonical check)
    let candidateField = null;
    let suppressedCount = 0;
    
    for (let i = 0; i < missingFieldsAfter.length; i++) {
      const field = missingFieldsAfter[i];
      const fieldIdCanon = canon(field.field_id || '');
      
      // Check if this field already has a non-empty value in incident.facts (canonical match)
      const alreadyCollected = Object.keys(incident.facts).some(k => {
        const kCanon = canon(k);
        const hasValue = incident.facts[k] && String(incident.facts[k]).trim() !== '';
        return kCanon === fieldIdCanon && hasValue;
      });
      
      if (alreadyCollected) {
        suppressedCount++;
        const collectedKey = Object.keys(incident.facts).find(k => canon(k) === fieldIdCanon);
        console.log(`[V3_PRE_ASK_GUARD][SKIP]`, {
          traceId: effectiveTraceId,
          fieldId: field.field_id,
          reason: 'Already collected in incident.facts',
          collectedAs: collectedKey,
          valuePreview: incident.facts[collectedKey]?.substring?.(0, 30) || incident.facts[collectedKey]
        });
        continue;
      }
      
      // PART 2: HARD GATE - If month/year detected in opener, skip all month/year questions
      if (isInitialCall && detectedMonthYearNormalized) {
        const potentialPrompt = generateV3ProbeQuestion(field, incident.facts);
        const isDateIntent = isDateApplyOccurIntent({
          promptText: potentialPrompt,
          missingFieldId: field.field_id,
          categoryId
        });
        
        if (isDateIntent) {
          suppressedCount++;
          
          console.warn(`[V3_DATE_GATE][FIRED]`, {
            categoryId,
            instanceNumber: instanceNumber || 1,
            detectedMonthYearNormalized,
            blockedFieldId: field.field_id,
            blockedPromptPreview: potentialPrompt?.substring(0, 60) || null,
            nextActionBeforeBlock: 'ASK',
            reason: 'Deterministic month/year detected in opener - date question suppressed'
          });
          
          continue;
        }
      }
      
      // LEGACY: INSTANCE-AWARE SAFETY GATE (kept as fallback)
      if (categoryId === 'PRIOR_LE_APPS' && isInitialCall && openerHasMonthYear && !detectedMonthYearNormalized) {
        const potentialPrompt = generateV3ProbeQuestion(field, incident.facts);
        const isDateIntent = isDateApplyOccurIntent({
          promptText: potentialPrompt,
          missingFieldId: field.field_id,
          categoryId
        });
        
        if (isDateIntent) {
          suppressedCount++;
          
          console.warn(`[V3_DATE_GATE][FIRED_LEGACY]`, {
            categoryId,
            instanceNumber: instanceNumber || 1,
            openerHasMonthYear: true,
            extractedMonthYear: extractedMonthYearRaw || 'detected_via_hasMonthYear',
            blockedFieldId: field.field_id,
            blockedPromptPreview: potentialPrompt?.substring(0, 60) || null,
            nextActionBeforeBlock: 'ASK',
            reason: 'Opener contains month/year (legacy pattern detection) - date question suppressed'
          });
          
          continue;
        }
      }
      
      // Found first truly missing field
      candidateField = field;
      break;
    }
    
    // If all fields suppressed, complete
    if (suppressedCount > 0 && suppressedCount === missingFieldsAfter.length) {
      nextAction = "RECAP";
      stopReason = "REQUIRED_FIELDS_COMPLETE";
      legacyFactState.completion_status = "complete";
      nextPrompt = getCompletionMessage("RECAP", null);
      
      console.log('[V3_PRE_ASK_GUARD][ALL_SUPPRESSED]', {
        traceId: effectiveTraceId,
        suppressedCount,
        reason: 'All missing fields already collected via ingestion + instance gate'
      });
    } else if (!candidateField) {
      // Safety: No candidate field found (shouldn't happen)
      nextAction = "RECAP";
      stopReason = "NO_VALID_FIELD";
      legacyFactState.completion_status = "complete";
      nextPrompt = getCompletionMessage("RECAP", null);
      
      console.warn('[V3_PRE_ASK_GUARD][NO_FIELD]', {
        traceId: effectiveTraceId,
        missingCount: missingFieldsAfter.length,
        suppressedCount
      });
    } else {
      // Ask about the first non-suppressed missing field
      nextPrompt = generateV3ProbeQuestion(candidateField, incident.facts);
      nextAction = "ASK";
      
      console.log('[V3_PRE_ASK_GUARD][ASK]', {
        traceId: effectiveTraceId,
        fieldId: candidateField.field_id,
        fieldLabel: candidateField.label,
        promptPreview: nextPrompt?.substring(0, 60)
      });
    }
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
  
  // DIAGNOSTIC: Log full decision context on initial call
  if (isInitialCall) {
    console.log('[V3_DECISION][INITIAL_CALL]', {
      traceId: effectiveTraceId,
      extractedFactsKeys: Object.keys(extractedFacts),
      extractedFactsValues: Object.entries(extractedFacts).reduce((acc, [k, v]) => {
        acc[k] = typeof v === 'string' ? v.substring(0, 40) : v;
        return acc;
      }, {}),
      missingFieldsAfter: missingFieldsAfter.map(f => f.field_id),
      nextAction,
      nextPromptPreview: nextPrompt?.substring(0, 60) || null
    });
  }
  
  console.log("[IDE-V3] Decision result", {
    traceId: effectiveTraceId,
    nextAction,
    stopReason,
    missingFieldsCount: missingFieldsAfter.length,
    probeCount: legacyFactState.probe_count,
    nextPromptPreview: nextPrompt?.substring(0, 60) || null
  });
  
  // Generate opening prompt for new incidents
  let openingPrompt = null;
  if (isNewIncident) {
    openingPrompt = getOpeningPrompt(categoryId, factModel.category_label);
  }

  // PART 2: HARD FAIL-SAFE - If month/year detected in opener, MUST NOT ask date questions
  let gateStatus = 'NOT_APPLICABLE';
  let blockedFieldIdFailsafe = null;
  
  if (isInitialCall && detectedMonthYearNormalized && nextAction === 'ASK' && nextPrompt) {
    // Use shared detection helper for consistent classification
    const chosenFieldId = missingFieldsAfter.length > 0 ? missingFieldsAfter[0]?.field_id : null;
    const isAskingDateQuestion = isDateApplyOccurIntent({
      promptText: nextPrompt,
      missingFieldId: chosenFieldId,
      categoryId
    });
    
    if (isAskingDateQuestion) {
      // FAIL-SAFE TRIGGERED: Find next non-date field or force RECAP
      blockedFieldIdFailsafe = chosenFieldId;
      
      const nonDateField = missingFieldsAfter.find(f => {
        const potentialPrompt = generateV3ProbeQuestion(f, incident.facts);
        return !isDateApplyOccurIntent({
          promptText: potentialPrompt,
          missingFieldId: f.field_id,
          categoryId
        });
      });
      
      if (nonDateField) {
        // Override to ask non-date field
        nextPrompt = generateV3ProbeQuestion(nonDateField, incident.facts);
        nextAction = 'ASK';
        gateStatus = 'FAILSAFE';
        
        console.warn(`[V3_DATE_GATE][FAILSAFE]`, {
          categoryId,
          instanceNumber: instanceNumber || 1,
          detectedMonthYearNormalized,
          blockedFieldId: blockedFieldIdFailsafe,
          blockedPromptPreview: nextPrompt.substring(0, 60),
          overrideToFieldId: nonDateField.field_id,
          overridePromptPreview: nextPrompt?.substring(0, 60) || null,
          reason: 'Deterministic month/year detected - date question suppressed by hard gate'
        });
      } else {
        // No non-date fields remain - force RECAP
        nextAction = 'RECAP';
        nextPrompt = getCompletionMessage('RECAP', null);
        stopReason = 'REQUIRED_FIELDS_COMPLETE';
        legacyFactState.completion_status = 'complete';
        gateStatus = 'FAILSAFE';
        
        console.warn(`[V3_DATE_GATE][FAILSAFE]`, {
          categoryId,
          instanceNumber: instanceNumber || 1,
          detectedMonthYearNormalized,
          blockedFieldId: blockedFieldIdFailsafe,
          blockedPromptPreview: nextPrompt.substring(0, 60),
          overrideAction: 'RECAP',
          reason: 'Deterministic month/year detected - no non-date fields remain - forcing RECAP'
        });
      }
    }
  }
  
  // LEGACY FAIL-SAFE: Keep existing pattern-based gate as backup
  if (categoryId === 'PRIOR_LE_APPS' && openerHasMonthYear && nextAction === 'ASK' && nextPrompt && !detectedMonthYearNormalized) {
    const chosenFieldId = missingFieldsAfter.length > 0 ? missingFieldsAfter[0]?.field_id : null;
    const isAskingDateQuestion = isDateApplyOccurIntent({
      promptText: nextPrompt,
      missingFieldId: chosenFieldId,
      categoryId
    });
    
    if (isAskingDateQuestion) {
      blockedFieldIdFailsafe = chosenFieldId;
      
      const nonDateField = missingFieldsAfter.find(f => {
        const potentialPrompt = generateV3ProbeQuestion(f, incident.facts);
        return !isDateApplyOccurIntent({
          promptText: potentialPrompt,
          missingFieldId: f.field_id,
          categoryId
        });
      });
      
      if (nonDateField) {
        nextPrompt = generateV3ProbeQuestion(nonDateField, incident.facts);
        nextAction = 'ASK';
        gateStatus = 'FAILSAFE_LEGACY';
        
        console.warn(`[V3_DATE_GATE][FAILSAFE_LEGACY]`, {
          categoryId,
          instanceNumber: instanceNumber || 1,
          openerHasMonthYear: true,
          extractedMonthYear: extractedMonthYearRaw || 'detected_via_hasMonthYear',
          blockedFieldId: blockedFieldIdFailsafe,
          overrideToFieldId: nonDateField.field_id,
          reason: 'Legacy pattern gate - deterministic extraction failed but pattern detected'
        });
      } else {
        nextAction = 'RECAP';
        nextPrompt = getCompletionMessage('RECAP', null);
        stopReason = 'REQUIRED_FIELDS_COMPLETE';
        legacyFactState.completion_status = 'complete';
        gateStatus = 'FAILSAFE_LEGACY';
        
        console.warn(`[V3_DATE_GATE][FAILSAFE_LEGACY]`, {
          categoryId,
          instanceNumber: instanceNumber || 1,
          openerHasMonthYear: true,
          overrideAction: 'RECAP',
          reason: 'Legacy pattern gate - no non-date fields remain'
        });
      }
    }
  }
  
  // Build debug object for engine visibility
  const chosenMissingFieldId = nextAction === 'ASK' && missingFieldsAfter.length > 0 ? missingFieldsAfter[0]?.field_id : null;
  const intentIsDate = categoryId === 'PRIOR_LE_APPS' && nextPrompt ? isDateApplyOccurIntent({
    promptText: nextPrompt,
    missingFieldId: chosenMissingFieldId,
    categoryId
  }) : false;
  
  // ENHANCED DEBUG: Use already-computed detectedMonthYearNormalized (declared at line ~1269)
  // NOTE: Variable already declared above - reusing existing value
  
  const debugInfo = categoryId === 'PRIOR_LE_APPS' ? {
    categoryId,
    instanceNumber: instanceNumber || 1,
    incidentId,
    isInitialCall: isInitialCall || false,
    openerHasMonthYear,
    extractedMonthYear: extractedMonthYearRaw || null,
    detectedMonthYearNormalized,
    fieldIdsSatisfiedExact,
    missingFieldIds: missingFieldsAfter.slice(0, 10).map(f => f.field_id),
    chosenMissingFieldId,
    nextAction,
    nextItemType: nextAction === 'ASK' ? 'v3_probe_question' : nextAction.toLowerCase(),
    promptPreview: nextPrompt?.substring(0, 60) || null,
    gateStatus,
    blockedFieldId: blockedFieldIdFailsafe,
    intentIsDate
  } : null;
  
  // CLASSIFICATION DUMP: Single definitive log for PRIOR_LE_APPS
  if (categoryId === 'PRIOR_LE_APPS') {
    console.log('[V3_DATE_GATE][CLASSIFY]', {
      instanceNumber: instanceNumber || 1,
      openerHasMonthYear,
      promptPreview: nextPrompt?.substring(0, 60) || null,
      chosenMissingFieldId,
      intentIsDate,
      nextAction,
      nextItemType: nextAction === 'ASK' ? 'v3_probe_question' : nextAction.toLowerCase(),
      gateStatus
    });
  }
  
  // Add prompt source metadata to return value
  const returnMeta = {
    promptSource: promptSource || 'TEMPLATE',
    llmMs: llmMs || null
  };
  
  console.log('[V3_PROBE_GEN][SOT]', {
    useLLMProbeWording: useLLMProbeWording || false,
    promptSource: promptSource || 'TEMPLATE',
    llmMs: llmMs || null
  });
  
  return {
    updatedSession,
    incidentId,
    nextAction,
    nextPrompt,
    openingPrompt,
    newFacts: extractedFacts,
    decisionTraceEntry,
    traceId: effectiveTraceId,
    meta: returnMeta,
    // Additional context for caller
    categoryLabel: factModel.category_label,
    missingFields: missingFieldsAfter,
    completionPercent: factModel.required_fields?.length > 0
      ? Math.round(((factModel.required_fields.length - missingFieldsAfter.length) / factModel.required_fields.length) * 100)
      : 100,
    stopReasonCode: stopReason || null,
    stopReasonDetail: stopReason ? `Stop triggered: ${stopReason}` : null,
    debug: debugInfo,
    meta: {
      promptSource: promptSource || 'TEMPLATE',
      llmMs: llmMs || null
    }
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
    const { sessionId, categoryId, incidentId, latestAnswerText, baseQuestionId, questionCode, sectionId, instanceNumber, isInitialCall, config, packInstructions, useLLMProbeWording } = body;
    
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
      config: config || {},
      packInstructions: packInstructions || null,
      useLLMProbeWording: useLLMProbeWording || false
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