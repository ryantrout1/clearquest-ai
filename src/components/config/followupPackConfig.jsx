// components/config/followupPackConfig.js

export const FOLLOWUP_PACK_CONFIG = {
  //
  // 👮 PACK: Applications with other LE agencies
  //
  PACK_LE_APPS: {
    displayName: "Applications with other law enforcement agencies",
    fields: {
      PACK_LE_APPS_Q01: { label: "Agency" },
      PACK_LE_APPS_Q02: { label: "Position applied for" },
      PACK_LE_APPS_Q03: { label: "Application date (month/year)" },
      PACK_LE_APPS_Q04: { label: "Outcome" },
      PACK_LE_APPS_Q05: { label: "Agency's stated reason" },
      PACK_LE_APPS_Q06: { label: "Issues / concerns noted by the agency" },
    },
  },

  //
  // 🚗 PACK: Standard driving incident (non-DUI)
  //
  PACK_DRIVING_STANDARD: {
    displayName: "Driving incident",
    fields: {
      PACK_DRIVING_STANDARD_Q01: { label: "Type of incident" },
      PACK_DRIVING_STANDARD_Q02: { label: "Approximate month and year" },
      PACK_DRIVING_STANDARD_Q03: { label: "Location (city and state)" },
      PACK_DRIVING_STANDARD_Q04: { label: "Law enforcement involvement" },
      PACK_DRIVING_STANDARD_Q05: { label: "Charge(s) or citation(s)" },
      PACK_DRIVING_STANDARD_Q06: { label: "Outcome / penalty" },
      PACK_DRIVING_STANDARD_Q07: { label: "Issues or concerns" },
    },
  },

  //
  // 🍺 PACK: DUI / DWI incident
  //
  PACK_DRIVING_DUI: {
    displayName: "DUI / DWI incident",
    fields: {
      PACK_DRIVING_DUI_Q01: { label: "Substance involved" },
      PACK_DRIVING_DUI_Q02: { label: "Approximate month and year" },
      PACK_DRIVING_DUI_Q03: { label: "Location (city and state)" },
      PACK_DRIVING_DUI_Q04: { label: "Law enforcement contact / arrest" },
      PACK_DRIVING_DUI_Q05: { label: "Charge(s) filed" },
      PACK_DRIVING_DUI_Q06: { label: "Court outcome / sentence" },
      PACK_DRIVING_DUI_Q07: { label: "Issues or concerns" },
    },
  },

  //
  // 🧾 PACK: Traffic / photo-enforcement violation
  //
  PACK_DRIVING_VIOLATION: {
    displayName: "Traffic / citation violation",
    fields: {
      PACK_DRIVING_VIOLATION_Q01: { label: "Violation / offense" },
      PACK_DRIVING_VIOLATION_Q02: { label: "Location (city, state, country)" },
      PACK_DRIVING_VIOLATION_Q03: { label: "Approximate month and year" },
      PACK_DRIVING_VIOLATION_Q04: { label: "How you were notified" },
      PACK_DRIVING_VIOLATION_Q05: { label: "Outcome / penalty" },
      PACK_DRIVING_VIOLATION_Q06: { label: "Resolution status" },
      PACK_DRIVING_VIOLATION_Q07: { label: "Issues or concerns" },
    },
  },

  //
  // Legacy packs - mapped for backwards compatibility
  //
  PACK_DRIVING_COLLISION_STANDARD: {
    displayName: "Collision incident",
    fields: {
      PACK_DRIVING_COLLISION_Q01: { label: "Date (month/year)" },
      PACK_DRIVING_COLLISION_Q02: { label: "Location" },
      PACK_DRIVING_COLLISION_Q03: { label: "Description" },
      PACK_DRIVING_COLLISION_Q04: { label: "At Fault" },
      PACK_DRIVING_COLLISION_Q05: { label: "Injuries" },
      PACK_DRIVING_COLLISION_Q06: { label: "Property Damage" },
      PACK_DRIVING_COLLISION_Q07: { label: "Police/Citation" },
      PACK_DRIVING_COLLISION_Q08: { label: "Insurance Outcome" },
    },
  },

  PACK_DRIVING_VIOLATIONS_STANDARD: {
    displayName: "Traffic violation",
    fields: {
      PACK_DRIVING_VIOLATIONS_Q01: { label: "Violation Date" },
      PACK_DRIVING_VIOLATIONS_Q02: { label: "Violation Type" },
      PACK_DRIVING_VIOLATIONS_Q03: { label: "Location" },
      PACK_DRIVING_VIOLATIONS_Q04: { label: "Outcome" },
      PACK_DRIVING_VIOLATIONS_Q05: { label: "Fines" },
      PACK_DRIVING_VIOLATIONS_Q06: { label: "Points on License" },
    },
  },

  PACK_DRIVING_DUIDWI_STANDARD: {
    displayName: "DUI/DWI incident",
    fields: {
      PACK_DRIVING_DUIDWI_Q01: { label: "Incident Date" },
      PACK_DRIVING_DUIDWI_Q02: { label: "Location" },
      PACK_DRIVING_DUIDWI_Q03: { label: "Substance Type" },
      PACK_DRIVING_DUIDWI_Q04: { label: "Stop Reason" },
      PACK_DRIVING_DUIDWI_Q05: { label: "Test Type" },
      PACK_DRIVING_DUIDWI_Q06: { label: "Test Result" },
      PACK_DRIVING_DUIDWI_Q07: { label: "Arrest Status" },
      PACK_DRIVING_DUIDWI_Q08: { label: "Court Outcome" },
      PACK_DRIVING_DUIDWI_Q09: { label: "License Impact" },
    },
  },
};

/**
 * Helper used by Interview Page + SessionDetails to display labels.
 */
export function getFollowupFieldLabel({
  packCode,
  fieldCode,
  fallbackLabel,
}) {
  const pack = FOLLOWUP_PACK_CONFIG[packCode];
  const field = pack?.fields?.[fieldCode];
  return field?.label || fallbackLabel || fieldCode;
}