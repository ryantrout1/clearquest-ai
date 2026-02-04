// ============================================================================
// UTILS - Extracted from CandidateInterview.jsx (Phase 2 shrink)
// Pure utility functions
// ============================================================================

// PART C: Unified MI gate detector (consistent across all checks)
export const isMiGateItem = (item, packId, instanceNumber) => {
  if (!item || !packId || instanceNumber === undefined) return false;

  // Match active card gates
  if (item.__activeCard_S && item.kind === 'multi_instance_gate') {
    const itemPackId = item.packId || item.meta?.packId;
    const itemInstance = item.instanceNumber || item.meta?.instanceNumber;
    return itemPackId === packId && itemInstance === instanceNumber;
  }

  // Match transcript gate entries
  if (item.messageType === 'MULTI_INSTANCE_GATE_SHOWN') {
    const itemPackId = item.meta?.packId || item.packId;
    const itemInstance = item.meta?.instanceNumber || item.instanceNumber;
    return itemPackId === packId && itemInstance === instanceNumber;
  }

  return false;
};

// Field probe key builder
export const getFieldProbeKey = (packId, instanceNumber, fieldKey) => {
  return `${packId}_${instanceNumber || 1}_${fieldKey}`;
};

// STEP 1: Helper to retrieve backend question text
export const getBackendQuestionText = (map, packId, fieldKey, instanceNumber) => {
  return map?.[packId]?.[fieldKey]?.[String(instanceNumber)] || null;
};
