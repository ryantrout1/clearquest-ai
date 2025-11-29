// components/config/followupPackConfig.js

export const FOLLOWUP_PACK_CONFIG = {
  //
  // 👮 PACK: Applications with other LE agencies
  //
  PACK_LE_APPS: {
    displayName: "Prior LE Application",
    pills: ["Applications", "Law Enforcement", "Prior Attempts"],
    fields: {
      // New v2.4 field_config fields
      agency_name: { label: "Agency / Department Name" },
      agency_location: { label: "Agency Location (City, State)" },
      application_date: { label: "Application Date (Month/Year)" },
      position: { label: "Position Applied For" },
      outcome: { label: "Outcome" },
      stage_reached: { label: "Stage Reached" },
      reason_not_selected: { label: "Reason for Non-Selection" },
      full_disclosure: { label: "Full Disclosure on Application" },
      has_documentation: { label: "Documentation Available" },
      // Legacy question mappings
      PACK_LE_APPS_Q01: { label: "Agency" },
      PACK_LE_APPS_Q02: { label: "Position applied for" },
      PACK_LE_APPS_Q03: { label: "Application date (month/year)" },
      PACK_LE_APPS_Q04: { label: "Outcome" },
      PACK_LE_APPS_Q05: { label: "Agency's stated reason" },
      PACK_LE_APPS_Q06: { label: "Issues / concerns noted by the agency" },
    },
  },
  
  //
  // 🔍 PACK: Application Integrity Issues
  //
  PACK_INTEGRITY_APPS: {
    displayName: "Application Integrity Issue",
    pills: ["Integrity", "Disclosure", "Omissions"],
    fields: {
      agency_name: { label: "Agency Name" },
      incident_date: { label: "Application Date (Month/Year)" },
      issue_type: { label: "Type of Issue" },
      what_omitted: { label: "What Was Omitted/Falsified" },
      reason_omitted: { label: "Why It Was Omitted" },
      discovery_method: { label: "How Discovered" },
      consequences: { label: "Consequences" },
      corrected: { label: "Has Been Corrected" },
      // Legacy question mappings
      PACK_INTEGRITY_APPS_Q01: { label: "Agency" },
      PACK_INTEGRITY_APPS_Q02: { label: "Application Date" },
      PACK_INTEGRITY_APPS_Q03: { label: "What Was Omitted" },
      PACK_INTEGRITY_APPS_Q04: { label: "Reason" },
      PACK_INTEGRITY_APPS_Q05: { label: "How Discovered" },
      PACK_INTEGRITY_APPS_Q06: { label: "Consequences" },
      PACK_INTEGRITY_APPS_Q07: { label: "Corrected" },
    },
  },
  
  //
  // ⚠️ PACK: Prior Law Enforcement Misconduct
  //
  PACK_LE_MISCONDUCT_STANDARD: {
    displayName: "Prior LE Misconduct",
    pills: ["Misconduct", "Discipline", "Internal Affairs"],
    fields: {
      agency_name: { label: "Agency / Department Name" },
      position_held: { label: "Position Held" },
      employment_dates: { label: "Employment Dates" },
      incident_date: { label: "Incident Date (Month/Year)" },
      allegation_type: { label: "Nature of Allegation" },
      allegation_description: { label: "Description of Allegation" },
      discovery_method: { label: "How Allegation Arose" },
      ia_case_number: { label: "IA Case Number" },
      finding: { label: "Finding / Outcome" },
      discipline: { label: "Disciplinary Action" },
      appealed: { label: "Was Appealed" },
      has_documentation: { label: "Documentation Available" },
      // Legacy question mappings
      PACK_LE_MISCONDUCT_Q01: { label: "Agency" },
      PACK_LE_MISCONDUCT_Q02: { label: "Position" },
      PACK_LE_MISCONDUCT_Q03: { label: "Date" },
      PACK_LE_MISCONDUCT_Q04: { label: "Allegation Type" },
      PACK_LE_MISCONDUCT_Q05: { label: "Description" },
      PACK_LE_MISCONDUCT_Q06: { label: "Finding" },
      PACK_LE_MISCONDUCT_Q07: { label: "Discipline" },
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
  
  //
  // 🏢 PACK: Workplace Integrity & Misconduct
  //
  PACK_WORKPLACE_STANDARD: {
    displayName: "Workplace Misconduct Incident",
    pills: ["Workplace", "Integrity", "Misconduct", "Termination Risk"],
    fields: {
      // v2.4 field_config fields
      employer: { label: "Employer" },
      position_at_time: { label: "Position at Time of Incident" },
      incident_date: { label: "Incident Date (Month/Year)" },
      misconduct_type: { label: "Type of Misconduct" },
      incident_description: { label: "Description of Incident" },
      corrective_action: { label: "Corrective Action Taken" },
      separation_type: { label: "Separation Type" },
      official_reason: { label: "Official Reason Given" },
      isolated_or_recurring: { label: "Isolated or Recurring" },
      impact: { label: "Impact on Workplace" },
      remediation: { label: "Corrective Steps / Remediation" },
      // Legacy question mappings
      PACK_WORKPLACE_STANDARD_Q01: { label: "Employer" },
      PACK_WORKPLACE_STANDARD_Q02: { label: "Position" },
      PACK_WORKPLACE_STANDARD_Q03: { label: "Incident Date" },
      PACK_WORKPLACE_STANDARD_Q04: { label: "Type of Issue" },
      PACK_WORKPLACE_STANDARD_Q05: { label: "Description" },
      PACK_WORKPLACE_STANDARD_Q06: { label: "Employer Action" },
      PACK_WORKPLACE_STANDARD_Q07: { label: "Outcome" },
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