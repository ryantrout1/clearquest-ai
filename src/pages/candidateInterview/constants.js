// ============================================================================
// CONSTANTS - Extracted from CandidateInterview.jsx (Phase 2 shrink)
// Static configuration values and feature flags
// ============================================================================

// Global logging flag for CandidateInterview
export const DEBUG_MODE = false;

// Footer anchor diagnostics flag (set to true to enable flex layout diagnostics)
export const CQ_DEBUG_FOOTER_ANCHOR = false;

// Transcript contract enforcement
export const ENFORCE_TRANSCRIPT_CONTRACT = true;

// Chat virtualization (disabled)
export const ENABLE_CHAT_VIRTUALIZATION = false;

// Synthetic transcript (disabled)
export const ENABLE_SYNTHETIC_TRANSCRIPT = false;

// MI Gate UI contract self-test
export const ENABLE_MI_GATE_UI_CONTRACT_SELFTEST = true;

// Follow-up pack display names
export const FOLLOWUP_PACK_NAMES = {
  'PACK_LE_APPS': 'Applications with other Law Enforcement Agencies',
  'PACK_WITHHOLD_INFO': 'Withheld Information',
  'PACK_DISQUALIFIED': 'Prior Disqualification',
  'PACK_CHEATING': 'Test Cheating',
  'PACK_DUI': 'DUI Incident',
  'PACK_LICENSE_SUSPENSION': 'License Suspension',
  'PACK_RECKLESS_DRIVING': 'Reckless Driving'
};

// What to expect descriptions
export const WHAT_TO_EXPECT = {
  'APPLICATIONS_WITH_OTHER_LE': 'your prior law enforcement applications and their outcomes',
  'DRIVING_RECORD': 'your driving history, such as citations, collisions, and any license actions'
};

// Live AI follow-ups feature flag
export const ENABLE_LIVE_AI_FOLLOWUPS = true;

// Debug AI probes (follows DEBUG_MODE)
export const DEBUG_AI_PROBES = DEBUG_MODE;
