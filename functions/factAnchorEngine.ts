/**
 * FactAnchorEngine - Centralized Fact Extraction Module
 * 
 * Provides reusable extraction logic for deriving fact anchors from candidate answers.
 * This module is designed to be pack-agnostic and config-driven.
 * 
 * CURRENT STATUS: PLACEHOLDER SCAFFOLD
 * This module is not yet active. All functions return empty/safe defaults.
 * Future prompts will add extraction logic without affecting existing probing behavior.
 */

/**
 * Main extraction entry point
 * 
 * @param {object} ctx - Extraction context
 * @param {string} ctx.packId - Follow-up pack ID
 * @param {string} ctx.fieldKey - Field identifier
 * @param {string} ctx.questionId - Base question ID
 * @param {string} ctx.answerText - Candidate's answer text
 * @param {string} ctx.sessionId - Interview session ID
 * @param {number} ctx.instanceNumber - Instance number for multi-instance packs
 * @param {object} ctx.existingAnchors - Already-collected anchors
 * @param {object} ctx.packConfig - Pack configuration object
 * 
 * @returns {object} { anchors: {...}, collectedAnchors: {...} }
 */
export function extract(ctx) {
  const anchors = {};
  const collectedAnchors = {};

  try {
    if (ctx && ctx.packId === 'PACK_PRIOR_LE_APPS_STANDARD') {
      // Prior LE Applications pack
      const fromNarrative = extractNarrative(ctx) || {};
      const fromShortForm = extractShortForm(ctx) || {};

      Object.assign(anchors, fromNarrative, fromShortForm);

      // collectedAnchors mirrors anchors for now so that the frontend can
      // display a history if we later add multi-instance support.
      Object.assign(collectedAnchors, fromNarrative, fromShortForm);
    }

    return { anchors, collectedAnchors };
  } catch (err) {
    // Never break probing; fail safe
    console.error('[FactAnchorEngine] extract error:', err.message);
    return {
      anchors: {},
      collectedAnchors: {}
    };
  }
}

/**
 * Extract anchors from narrative/long-form text fields
 * 
 * @param {object} ctx - Extraction context
 * @returns {object} Extracted anchors (plain object, not nested)
 */
function extractNarrative(ctx) {
  // Only handle PACK_PRIOR_LE_APPS_STANDARD / PACK_PRLE_Q01 for now
  if (ctx.packId !== 'PACK_PRIOR_LE_APPS_STANDARD' || ctx.fieldKey !== 'PACK_PRLE_Q01') {
    return {};
  }

  const text = (ctx.answerText || '').toLowerCase();
  
  if (!text || text.trim().length < 10) {
    return {};
  }

  console.log('[FactAnchorEngine][NARRATIVE] Extracting from PACK_PRLE_Q01:', {
    textLength: text.length,
    textPreview: text.substring(0, 100)
  });

  // Extract application_outcome from narrative
  let outcome = null;

  // Check for disqualified patterns (most common)
  if (text.includes('disqualified') || text.includes("dq'd") || text.includes('failed background') || 
      text.includes('failed the background') || text.includes('removed from process') ||
      text.includes('not selected') || text.includes('rejected') || text.includes('not hired')) {
    outcome = 'disqualified';
  }
  // Check for hired patterns
  else if (text.includes('hired') || text.includes('offered the job') || text.includes('got the job') ||
           text.includes('sworn in') || text.includes('started the academy') || text.includes('got hired')) {
    outcome = 'hired';
  }
  // Check for withdrew patterns
  else if (text.includes('withdrew') || text.includes('pulled my application') || 
           text.includes('took myself out') || text.includes('decided not to continue') ||
           text.includes('chose not to continue')) {
    outcome = 'withdrew';
  }
  // Check for still in process patterns
  else if (text.includes('still in process') || text.includes('still processing') || 
           text.includes('no final decision') || text.includes('waiting to hear') ||
           text.includes('pending') || text.includes('ongoing')) {
    outcome = 'in_process';
  }
  // Check for other "not selected" patterns
  else if (text.includes("didn't move forward") || text.includes("they went with someone else") ||
           text.includes('unsuccessful')) {
    outcome = 'not_selected_other';
  }

  if (outcome) {
    console.log('[FactAnchorEngine][NARRATIVE] Extracted application_outcome:', outcome);
    return {
      application_outcome: outcome
    };
  }

  console.log('[FactAnchorEngine][NARRATIVE] No outcome detected in narrative');
  return {};
}

/**
 * Extract anchors from short-form/structured fields
 * 
 * @param {object} ctx - Extraction context
 * @returns {object} Extracted anchors (plain object, not nested)
 */
function extractShortForm(ctx) {
  // Only handle PACK_PRIOR_LE_APPS_STANDARD / PACK_PRLE_Q02 for now
  if (ctx.packId !== 'PACK_PRIOR_LE_APPS_STANDARD' || ctx.fieldKey !== 'PACK_PRLE_Q02') {
    return {};
  }

  const text = (ctx.answerText || '').toLowerCase().trim();
  
  if (!text || text.length === 0) {
    return {};
  }

  console.log('[FactAnchorEngine][SHORT_FORM] Extracting from PACK_PRLE_Q02:', {
    textLength: text.length,
    text: text
  });

  // For short-form answers (< 80 chars), treat as primarily the outcome word/phrase
  let outcome = null;

  // Map common short responses to canonical values
  if (text.includes('disqualified') || text === 'dq' || text === "dq'd" || 
      text.includes('failed background') || text.includes('not selected')) {
    outcome = 'disqualified';
  }
  else if (text.includes('hired') || text.includes('selected') || 
           text.includes('offered') || text.includes('got the job')) {
    outcome = 'hired';
  }
  else if (text.includes('withdrew') || text.includes('withdrawn') || 
           text.includes('pulled out')) {
    outcome = 'withdrew';
  }
  else if (text.includes('still in process') || text.includes('pending') || 
           text.includes('no decision') || text.includes('ongoing') || 
           text.includes('in progress')) {
    outcome = 'in_process';
  }
  else if (text.includes('not selected') || text.includes("didn't move forward") ||
           text.includes("they went with someone else")) {
    outcome = 'not_selected_other';
  }
  else if (text.length > 0 && text.length < 80) {
    // Fallback: use normalized raw value for non-empty short answers
    outcome = normalizeAnchorValue('application_outcome', text);
  }

  if (outcome) {
    console.log('[FactAnchorEngine][SHORT_FORM] Extracted application_outcome:', outcome);
    return {
      application_outcome: outcome
    };
  }

  console.log('[FactAnchorEngine][SHORT_FORM] No outcome detected in short answer');
  return {};
}

/**
 * Normalize anchor value to canonical format
 * 
 * @param {string} key - Anchor key (e.g., "application_outcome")
 * @param {any} value - Raw value to normalize
 * @returns {any} Normalized value
 */
function normalizeAnchorValue(key, value) {
  if (value == null) return value;

  if (key === 'application_outcome') {
    // Trim whitespace, lowercase, replace multiple spaces with single space
    const normalized = String(value).trim().toLowerCase().replace(/\s+/g, ' ');
    return normalized;
  }

  // TODO (future prompt): Add normalization rules for other anchor types
  // - Uppercase enums (HIRED, DISQUALIFIED)
  // - Standardize dates (YYYY-MM format)
  // - Trim and clean text
  // - Handle null/undefined/empty
  
  return value;
}

/**
 * Merge two anchor objects (shallow merge)
 * 
 * @param {object} a - First anchor set
 * @param {object} b - Second anchor set (takes precedence)
 * @returns {object} Merged anchors
 */
export function mergeAnchors(a = {}, b = {}) {
  // TODO (future prompt): Add intelligent merge logic
  // - Handle conflicts (which value wins?)
  // - Array vs object handling
  // - Confidence scoring
  
  return {
    ...a,
    ...b,
  };
}

/**
 * Validate extracted anchors against pack requirements
 * 
 * @param {object} anchors - Extracted anchors
 * @param {object} packConfig - Pack configuration
 * @returns {object} { valid: boolean, missing: string[], errors: string[] }
 */
function validateAnchors(anchors, packConfig) {
  // TODO (future prompt): Implement validation logic
  // - Check required anchors are present
  // - Validate anchor value formats
  // - Check for contradictions
  
  return {
    valid: true,
    missing: [],
    errors: []
  };
}

/**
 * Get extraction rules for a specific pack/field combination
 * 
 * @param {string} packId - Pack ID
 * @param {string} fieldKey - Field key
 * @returns {object|null} Extraction rules or null if not configured
 */
function getExtractionRules(packId, fieldKey) {
  // TODO (future prompt): Load extraction rules from pack config
  // - Return pack-specific rules
  // - Fall back to global defaults
  // - Support field-level overrides
  
  return null;
}

// Export public API
export default {
  extract,
  mergeAnchors,
  normalizeAnchorValue,
  validateAnchors,
  getExtractionRules
};