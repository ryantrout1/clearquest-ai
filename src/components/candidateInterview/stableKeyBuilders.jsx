// ============================================================================
// STABLE KEY BUILDERS - Extracted from CandidateInterview.jsx (Phase 2 shrink)
// Pure string builder functions for stable keys
// ============================================================================

// V3 PROBE STABLEKEY BUILDERS - Single source of truth for key format
export const buildV3ProbeQStableKey = (sessionId, categoryId, instanceNumber, probeIndex) => {
  return `v3-probe-q:${sessionId}:${categoryId}:${instanceNumber}:${probeIndex}`;
};

export const buildV3ProbeAStableKey = (sessionId, categoryId, instanceNumber, probeIndex) => {
  return `v3-probe-a:${sessionId}:${categoryId}:${instanceNumber}:${probeIndex}`;
};

// MI GATE STABLEKEY BUILDERS - Single source of truth for MI gate identity
export const buildMiGateQStableKey = (packId, instanceNumber) => {
  return `mi-gate:${packId}:${instanceNumber}:q`;
};

export const buildMiGateAStableKey = (packId, instanceNumber) => {
  return `mi-gate:${packId}:${instanceNumber}:a`;
};

export const buildMiGateItemId = (packId, instanceNumber) => {
  return `multi-instance-gate-${packId}-${instanceNumber}`;
};

// V3 OPENER STABLEKEY BUILDER - Single source of truth
export const buildV3OpenerStableKey = (packId, instanceNumber) => {
  return `v3-opener:${packId}:${instanceNumber}`;
};