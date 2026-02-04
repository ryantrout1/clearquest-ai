// ============================================================================
// TRANSCRIPT HELPERS - Extracted from CandidateInterview.jsx (Phase 2 shrink)
// Pure functions for transcript filtering and deduplication
// ============================================================================

// TRANSCRIPT DENYLIST: System events and internal markers (NOT user-visible Q/A)
// V3 UPDATE: V3_PROBE_QUESTION and V3_PROBE_ANSWER now ALLOWED (legal record)
// PROMPT_LANE_CONTEXT: ALLOWED (non-chat annotation, provides Q/A context)
export const TRANSCRIPT_DENYLIST = new Set([
  'SYSTEM_EVENT',             // All system events
  'SESSION_CREATED',          // Session lifecycle
  'SESSION_RESUMED',
  'ANSWER_SUBMITTED',         // Answer submitted event (audit only)
  'PACK_ENTERED',             // Pack lifecycle
  'PACK_EXITED',
  'SECTION_STARTED',          // Section lifecycle
  'AI_PROBING_CALLED',        // AI probing events
  'AI_PROBING_RESPONSE',
  'V3_PROBE_ASKED',           // V3 probe system events (visibleToCandidate=false)
  'PROCESSING',               // No processing bubbles
  'REVIEWING',                // No reviewing bubbles
  'AI_THINKING',              // No thinking bubbles
]);

// V3 FILTER REMOVED: V3 probe Q/A now in transcript (legal record)
// Only block internal system events
export const isV3PromptTranscriptItem = (msg) => {
  const t = msg?.messageType || msg?.type || msg?.kind;

  // ALLOW: V3 opener prompts (FOLLOWUP_CARD_SHOWN with variant='opener')
  if (t === "FOLLOWUP_CARD_SHOWN") {
    const variant = msg?.meta?.variant || msg?.variant || msg?.followupVariant;
    if (variant === "opener") {
      return false; // DO NOT block opener prompts
    }
  }

  // BLOCK: Internal V3 system events only
  const V3_INTERNAL_TYPES = [
    "V3_PROBE_ASKED",     // Internal system event
    "V3_PROBE_PROMPT",    // Internal marker
    "V3_PROBE",           // Internal event
    "AI_FOLLOWUP_QUESTION" // Legacy internal type
  ];

  if (V3_INTERNAL_TYPES.includes(t)) {
    console.log('[V3_SYSTEM_EVENT][BLOCKED]', {
      messageType: t,
      textPreview: msg?.text?.substring(0, 60) || null,
      reason: 'Internal system event - not legal record'
    });
    return true;
  }

  return false;
};

// Helper: Filter renderable transcript entries (no flicker)
export const isRenderableTranscriptEntry = (t) => {
  if (!t) return false;

  const mt = t.messageType || t.type;

  // PRIORITY 0: QUESTION_SHOWN always renders (base Q/A contract - never filter)
  if (mt === 'QUESTION_SHOWN') return true;

  // PRIORITY 0.5: REQUIRED_ANCHOR_QUESTION always renders (deterministic fallback)
  if (mt === 'REQUIRED_ANCHOR_QUESTION') {
    console.log('[CQ_RENDER_SOT][REQUIRED_ANCHOR_Q_INCLUDED]', {
      stableKey: t.stableKey || t.id,
      anchor: t.meta?.anchor || t.anchor
    });
    return true;
  }

  // PRIORITY 0.6: PROMPT_LANE_CONTEXT always renders (non-chat annotation)
  if (mt === 'PROMPT_LANE_CONTEXT') {
    console.log('[CQ_RENDER_SOT][PROMPT_CONTEXT_INCLUDED]', {
      stableKey: t.stableKey || t.id,
      anchor: t.meta?.anchor || t.anchor
    });
    return true;
  }

  // PRIORITY 1: LEGAL RECORD - visibleToCandidate=true ALWAYS renders
  // This ensures all candidate-visible entries appear in UI (no drops)
  if (t.visibleToCandidate === true) {
    return true;
  }

  // PRIORITY 1.5: V3 probe Q/A default to visible (unless explicitly false)
  // Fixes missing V3_PROBE_ANSWER when visibleToCandidate is undefined
  const isV3ProbeQA = (t.messageType === 'V3_PROBE_QUESTION' || t.type === 'V3_PROBE_QUESTION') ||
                      (t.messageType === 'V3_PROBE_ANSWER' || t.type === 'V3_PROBE_ANSWER');
  if (isV3ProbeQA && t.visibleToCandidate !== false) {
    return true;
  }

  // PRIORITY 2: User messages always render (fail-open for legacy entries)
  if (t.role === 'user' || t.kind === 'user') {
    // Still block system event types
    if (mt === 'SYSTEM_EVENT') return false;
    if (TRANSCRIPT_DENYLIST.has(mt)) return false;
    return true;
  }

  // PRIORITY 3: Block internal system events (visibleToCandidate=false or undefined)
  if (mt === 'SYSTEM_EVENT') return false;
  if (t.visibleToCandidate === false) return false;
  if (TRANSCRIPT_DENYLIST.has(mt)) return false;

  // Never show typing/thinking/loading placeholders (prevents flicker)
  if (
    mt === 'ASSISTANT_TYPING' ||
    mt === 'TYPING' ||
    mt === 'THINKING' ||
    mt === 'LOADING' ||
    mt === 'PROBE_THINKING' ||
    mt === 'V3_THINKING' ||
    mt === 'PLACEHOLDER' ||
    mt === 'PROCESSING' ||
    mt === 'REVIEWING' ||
    mt === 'AI_THINKING'
  ) return false;

  // V3 UI CONTRACT: Block internal V3 system events only (visibleToCandidate handles legal record)
  if (isV3PromptTranscriptItem(t)) {
    return false;
  }

  return true;
};

// Helper: Dedupe by stableKey (prefer visibleToCandidate=true)
export const dedupeByStableKey = (arr) => {
  const map = new Map();
  for (const t of (arr || [])) {
    const key = t.stableKey || t.id || `${t.messageType || t.type}:${t.createdAt || ''}:${t.text || ''}`;
    // Prefer visibleToCandidate=true version
    if (!map.has(key) || (map.get(key)?.visibleToCandidate !== true && t.visibleToCandidate === true)) {
      map.set(key, t);
    }
  }
  return Array.from(map.values());
};

/**
 * Determine if a transcript entry should be rendered (legacy wrapper)
 */
export function shouldRenderTranscriptEntry(entry, index) {
  return isRenderableTranscriptEntry(entry);
}
