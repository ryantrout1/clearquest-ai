/**
 * V3 Probing Prompt Templates
 * 
 * Centralized AI prompt templates for V3 FactModel-based probing.
 * Used by decisionEngineV3 and V3ProbingLoop for consistent, professional questioning.
 * 
 * Tone guidelines:
 * - Professional, calm, respectful language
 * - Clear focus on fact-finding
 * - No accusatory tone
 * - No legal conclusions or hiring recommendations
 */

// ============================================================================
// OPENING PROMPT TEMPLATES
// ============================================================================

/**
 * Generic opening prompt for starting a V3 incident micro-interview.
 * Used when the candidate first indicates an incident occurred.
 */
export const OPENING_PROMPT_GENERIC = 
  "Thanks for letting me know. Walk me through what happened, starting with when this occurred.";

/**
 * Category-specific opening prompts for more tailored introductions.
 */
export const OPENING_PROMPTS_BY_CATEGORY = {
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

/**
 * Synthesize a V3 opener question when pack has no configured opening_question_text.
 * Used as deterministic opener before AI probing starts.
 * 
 * @param {string} categoryId - Category identifier
 * @param {string} categoryLabel - Category label  
 * @param {object} packData - Pack metadata
 * @returns {string} Synthesized opener question
 */
export function synthesizeV3Opener(categoryId, categoryLabel, packData = null) {
  const label = categoryLabel || categoryId || "incident";
  
  return `In your own words, walk me through what happened with this ${label.toLowerCase()} — who was involved, when it took place, what occurred, and how it ended. Please include as much detail as you can.`;
}

/**
 * Get deterministic opener for V3 pack.
 * This is shown as a non-AI question card before V3 probing starts.
 * 
 * @param {object} packData - Pack metadata with author-defined opener
 * @param {string} categoryId - Category identifier
 * @param {string} categoryLabel - Category label
 * @returns {{ text: string, example: string|null, isSynthesized: boolean }}
 */
export function getV3DeterministicOpener(packData, categoryId, categoryLabel) {
  // PRIORITY 1: Author-controlled opener (configured)
  if (packData?.use_author_defined_openers && packData?.opening_question_text) {
    return {
      text: packData.opening_question_text,
      example: packData.opening_example_narrative || null,
      isSynthesized: false
    };
  }
  
  // PRIORITY 2: Synthesize from category/pack context
  const synthesized = synthesizeV3Opener(categoryId, categoryLabel, packData);
  
  return {
    text: synthesized,
    example: null,
    isSynthesized: true
  };
}

// ============================================================================
// FOLLOW-UP PROMPT TEMPLATES
// ============================================================================

/**
 * Field-specific follow-up question templates.
 * Maps field types/keys to natural-language question patterns.
 */
export const FIELD_QUESTION_TEMPLATES = {
  // Temporal fields
  date: "When did this occur? Please provide the date or approximate timeframe.",
  incident_date: "When did this incident happen?",
  month_year: "What month and year did this take place?",
  time_period: "What was the approximate time period?",
  
  // Location fields
  location: "Where did this occur?",
  city: "In what city did this happen?",
  state: "In what state did this occur?",
  
  // People/relationships
  relationship: "What was your relationship to the other person involved?",
  witnesses: "Were there any witnesses present?",
  
  // Outcome/legal fields
  outcome: "What was the outcome of this situation?",
  legal_outcome: "What was the legal outcome, if any?",
  charges: "Were any charges filed? If so, what were they?",
  arrest_status: "Were you arrested in connection with this?",
  
  // Description fields
  description: "Can you describe what happened in more detail?",
  circumstances: "What were the circumstances surrounding this?",
  
  // Impact fields
  injuries: "Were there any injuries involved?",
  property_damage: "Was there any property damage?",
  
  // Resolution fields
  resolution: "How was this matter resolved?",
  restitution: "Was any restitution made?",
  
  // Agency-specific
  agency: "Which agency or organization was involved?",
  agency_name: "What is the name of the agency?",
  employer: "Who was the employer?",
  position: "What position were you applying for or held?"
};

/**
 * Generate a natural follow-up question for a missing field.
 * @param {object} field - Field definition { field_id, label, type }
 * @param {object} collectedFacts - Facts already collected
 * @returns {string} Follow-up question text
 */
export function generateFieldQuestion(field, collectedFacts = {}) {
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
    case 'textarea':
    case 'text':
    default:
      // Generate a natural question from the label
      if (label) {
        // Convert label to question form
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
 * Build an AI prompt for generating a contextual follow-up question.
 * This is used when we want the AI to craft a more natural question
 * based on conversation context.
 * 
 * @param {object} params - Parameters for prompt generation
 * @param {string} params.categoryLabel - Category name
 * @param {object[]} params.missingFields - Array of missing field definitions
 * @param {object} params.collectedFacts - Facts already collected
 * @param {number} params.probeCount - Number of probes already asked
 * @returns {string} AI system prompt for generating follow-up question
 */
export function buildFollowUpAIPrompt({ categoryLabel, missingFields, collectedFacts, probeCount }) {
  const collectedSummary = Object.entries(collectedFacts || {})
    .filter(([_, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');
  
  const missingList = (missingFields || [])
    .map(f => f.label || f.field_id)
    .join(', ');
  
  return `You are an experienced law enforcement background investigator conducting a conversational micro-interview about a ${categoryLabel || 'disclosed incident'}.

FACTS ALREADY COLLECTED:
${collectedSummary || '(None yet)'}

INFORMATION STILL NEEDED:
${missingList || '(None)'}

GUIDELINES:
- Ask ONE focused question to obtain one of the missing facts
- Use a professional, calm, and respectful tone
- Be direct but not accusatory
- Phrase questions naturally, as in a conversation
- Do not make legal conclusions or hiring recommendations
- If this is probe #${probeCount + 1}, keep questions concise

Generate a single follow-up question to obtain one of the missing pieces of information.`;
}

// ============================================================================
// RECAP/SUMMARY PROMPT TEMPLATES
// ============================================================================

/**
 * AI prompt template for generating an incident narrative summary.
 * Used when all required facts are collected or probing is complete.
 */
export const RECAP_PROMPT_TEMPLATE = `You are summarizing an incident for a law enforcement background investigator.

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
{{facts}}

Write a 2-4 sentence narrative summary:`;

/**
 * Build an AI prompt for generating an incident recap/summary.
 * @param {object} incident - Incident object with facts
 * @param {string} categoryLabel - Human-readable category name
 * @returns {string} AI prompt for summary generation
 */
export function buildRecapPrompt(incident, categoryLabel) {
  const facts = incident?.facts || {};
  const factsText = Object.entries(facts)
    .filter(([_, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `- ${k.replace(/_/g, ' ')}: ${v}`)
    .join('\n');
  
  return RECAP_PROMPT_TEMPLATE
    .replace('{{facts}}', factsText || '(No facts collected)')
    .replace('an incident', `a ${categoryLabel?.toLowerCase() || 'disclosed incident'}`);
}

// ============================================================================
// COMPLETION MESSAGES
// ============================================================================

/**
 * Messages shown when V3 probing completes.
 */
export const COMPLETION_MESSAGES = {
  RECAP: "Thank you for providing those details. I have all the information I need for this incident.",
  STOP_COMPLETE: "Thank you. We've covered the key points for this incident.",
  STOP_MAX_PROBES: "Thank you for your responses. Let's move on to the next topic.",
  STOP_NON_SUBSTANTIVE: "I understand. Let's continue with the interview."
};

/**
 * Get the appropriate completion message based on stop reason.
 * @param {string} nextAction - "RECAP" or "STOP"
 * @param {string} stopReason - Reason for stopping (if STOP)
 * @returns {string} Completion message
 */
export function getCompletionMessage(nextAction, stopReason) {
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

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  synthesizeV3Opener,
  getV3DeterministicOpener,
  generateFieldQuestion,
  buildFollowUpAIPrompt,
  buildRecapPrompt,
  getCompletionMessage,
  OPENING_PROMPT_GENERIC,
  OPENING_PROMPTS_BY_CATEGORY,
  FIELD_QUESTION_TEMPLATES,
  RECAP_PROMPT_TEMPLATE,
  COMPLETION_MESSAGES
};