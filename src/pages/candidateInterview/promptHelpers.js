// ============================================================================
// PROMPT HELPERS - Extracted from CandidateInterview.jsx (Phase 2.1 shrink)
// Pure functions for prompt text resolution
// ============================================================================

import { FOLLOWUP_PACK_CONFIGS } from "../../components/followups/followupPackConfig";

/**
 * Convert anchor key to human-readable question text
 * @param {string} anchor - The anchor key
 * @param {string|null} packId - Pack ID for label lookup
 * @returns {string} Human-readable question text
 */
export function resolveAnchorToHumanQuestion(anchor, packId = null) {
  if (!anchor) return "Please answer the following question.";

  // Priority 1: Pack config anchor label
  if (packId) {
    const packConfig = FOLLOWUP_PACK_CONFIGS?.[packId];
    const anchorConfig = packConfig?.factAnchors?.find(a => a.key === anchor);
    if (anchorConfig?.label) {
      return `What ${anchorConfig.label}?`;
    }
  }

  // Priority 2: Known anchor mappings (hardcoded for common cases)
  const ANCHOR_QUESTION_MAP = {
    'prior_le_position': 'What position did you apply for?',
    'prior_le_agency': 'What law enforcement agency did you apply to?',
    'prior_le_approx_date': 'When did you apply? (approximate month and year is fine)',
    'application_outcome': 'What was the outcome of your application?',
    'month_year': 'When did this happen? (approximate month and year is fine)',
    'location': 'Where did this happen?',
    'agency': 'What agency was this with?',
    'position': 'What position or role?',
    'outcome': 'What was the outcome?'
  };

  if (ANCHOR_QUESTION_MAP[anchor]) {
    return ANCHOR_QUESTION_MAP[anchor];
  }

  // Priority 3: Generic semantic derivation
  if (/position|role|title|rank/i.test(anchor)) {
    return "What position did you apply for?";
  }
  if (/agency|department|employer/i.test(anchor)) {
    return "What agency did you apply to?";
  }
  if (/date|month|year|when|approx/i.test(anchor)) {
    return "When did this happen? (approximate month and year is fine)";
  }
  if (/outcome|result|status/i.test(anchor)) {
    return "What was the outcome?";
  }

  // Priority 4: Safe fallback (never expose raw anchor key)
  return "Please answer the following question.";
}

/**
 * Compute active prompt text from UI state (TDZ-proof, pure function)
 * @param {Object} params - Input parameters
 * @returns {string|null} The prompt text to show, or null if none
 */
export function computeActivePromptText(params) {
  const {
    requiredAnchorFallbackActive,
    requiredAnchorCurrent,
    v3ProbingContext_S,
    v3ProbingActive,
    v3ActivePromptText,
    effectiveItemType_SAFE,
    effectiveItemType,
    currentItem_S,
    v2ClarifierState,
    currentPrompt
  } = params;

  // OPENER OVERRIDE: v3_pack_opener must never use fallback priority
  if (effectiveItemType_SAFE === 'v3_pack_opener') {
    const openerText = (currentItem_S?.openerText || '').trim();
    if (openerText) {
      console.log('[ACTIVE_PROMPT_TEXT][OPENER_OVERRIDE]', {
        effectiveItemType_SAFE,
        hasOpenerText: true,
        openerPreview: openerText.slice(0, 80),
      });
      return openerText;
    }
    console.log('[ACTIVE_PROMPT_TEXT][OPENER_OVERRIDE]', {
      effectiveItemType_SAFE,
      hasOpenerText: false,
      reason: 'blank_openerText_using_safe_fallback',
    });
    return 'Please describe the details for this section in your own words.';
  }

  // Priority 0: Required anchor fallback
  if (requiredAnchorFallbackActive && requiredAnchorCurrent) {
    return resolveAnchorToHumanQuestion(requiredAnchorCurrent, v3ProbingContext_S?.packId);
  }

  // Priority 1: V3 active prompt
  if (v3ProbingActive && v3ActivePromptText) {
    return v3ActivePromptText;
  }

  // Priority 2: V2 pack field
  const effectiveType = effectiveItemType || effectiveItemType_SAFE;
  if (effectiveType === 'v2_pack_field' && currentItem_S) {
    const backendText = currentItem_S.backendQuestionText;
    const clarifierText = v2ClarifierState?.packId === currentItem_S.packId &&
                         v2ClarifierState?.fieldKey === currentItem_S.fieldKey &&
                         v2ClarifierState?.instanceNumber === currentItem_S.instanceNumber
                         ? v2ClarifierState.clarifierQuestion
                         : null;
    return clarifierText || backendText || currentItem_S.fieldConfig?.label || null;
  }

  // Priority 3: V3 pack opener
  if (effectiveItemType_SAFE === 'v3_pack_opener' && currentItem_S) {
    const openerText = currentItem_S.openerText;
    const usingFallback = !openerText || openerText.trim() === '';
    return usingFallback
      ? "Please describe the details for this section in your own words."
      : openerText;
  }

  // Priority 4: Current prompt
  if (currentPrompt?.text) {
    return currentPrompt.text;
  }

  return null;
}
