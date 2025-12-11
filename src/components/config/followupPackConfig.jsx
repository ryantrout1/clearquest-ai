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

  //
  // 🏛️ PACK: Application Integrity Issues
  //
  PACK_INTEGRITY_APPS: {
    displayName: "Application Integrity Issue",
    pills: ["Integrity", "Application", "Disclosure", "Background Risk"],
    fields: {
      // v2.4 field_config fields
      agency_name: { label: "Agency / Department" },
      position_applied_for: { label: "Position Applied For" },
      incident_date: { label: "Application Date" },
      issue_type: { label: "Integrity Issue Type" },
      what_omitted: { label: "Information Involved" },
      reason_omitted: { label: "Reason for Omission" },
      discovery_method: { label: "How Issue Was Discovered" },
      consequences: { label: "Application Outcome" },
      corrected: { label: "Corrected Disclosure" },
      remediation_steps: { label: "Remediation Steps" },
      // Legacy question mappings
      PACK_INTEGRITY_APPS_Q01: { label: "Agency" },
      PACK_INTEGRITY_APPS_Q02: { label: "Application Date" },
      PACK_INTEGRITY_APPS_Q03: { label: "What Was Omitted" },
      PACK_INTEGRITY_APPS_Q04: { label: "Reason for Omission" },
      PACK_INTEGRITY_APPS_Q05: { label: "How Discovered" },
      PACK_INTEGRITY_APPS_Q06: { label: "Consequences" },
      PACK_INTEGRITY_APPS_Q07: { label: "Corrected" },
    },
  },



  //
  // 💰 PACK: Financial Misconduct
  //
  PACK_FINANCIAL_STANDARD: {
    displayName: "Financial Misconduct Incident",
    pills: ["Financial", "Responsibility", "Stability", "Integrity"],
    fields: {
      // v2.4 field_config fields
      financial_issue_type: { label: "Type of Financial Issue" },
      start_date: { label: "When Issue Began" },
      most_recent_date: { label: "Most Recent Occurrence" },
      amount_owed: { label: "Amount Owed / Affected" },
      creditor: { label: "Creditor or Agency Involved" },
      legal_actions: { label: "Legal Actions Taken" },
      employment_impact: { label: "Impact on Employment / Licensing" },
      resolution_steps: { label: "Steps Taken to Resolve" },
      resolution_status: { label: "Resolution Status" },
      remaining_obligations: { label: "Outstanding Obligations" },
      prevention_steps: { label: "Preventative Measures" },
      // Legacy question mappings
      PACK_FINANCIAL_STANDARD_Q01: { label: "Issue Type" },
      PACK_FINANCIAL_STANDARD_Q02: { label: "Start Date" },
      PACK_FINANCIAL_STANDARD_Q03: { label: "Amount" },
      PACK_FINANCIAL_STANDARD_Q04: { label: "Creditor" },
      PACK_FINANCIAL_STANDARD_Q05: { label: "Legal Actions" },
      PACK_FINANCIAL_STANDARD_Q06: { label: "Resolution" },
      PACK_FINANCIAL_STANDARD_Q07: { label: "Status" },
      PACK_FINANCIAL_STANDARD_Q08: { label: "Prevention Steps" },
    },
  },

  //
  // 🔫 PACK: Gang Membership / Affiliation
  //
  PACK_GANG_STANDARD: {
    displayName: "Gang Affiliation Incident",
    pills: ["Gang Affiliation", "Risk", "Violence", "Extremism"],
    fields: {
      // v2.4 field_config fields
      gang_name: { label: "Gang or Group" },
      start_date: { label: "Start of Involvement" },
      end_date: { label: "End of Involvement" },
      involvement_level: { label: "Level of Involvement" },
      origin_story: { label: "How Involvement Began" },
      activities: { label: "Activities or Participation" },
      illegal_activity: { label: "Illegal Activity Involved" },
      law_enforcement_contact: { label: "Law Enforcement / School / Employer Contact" },
      post_exit_contact: { label: "Contact After Leaving Group" },
      prevention_steps: { label: "Steps Taken to Avoid Future Association" },
      // Legacy question mappings
      PACK_GANG_STANDARD_Q01: { label: "Gang or Group" },
      PACK_GANG_STANDARD_Q02: { label: "Start Date" },
      PACK_GANG_STANDARD_Q03: { label: "End Date" },
      PACK_GANG_STANDARD_Q04: { label: "Level of Involvement" },
      PACK_GANG_STANDARD_Q05: { label: "How It Started" },
      PACK_GANG_STANDARD_Q06: { label: "Activities" },
      PACK_GANG_STANDARD_Q07: { label: "Illegal Activity" },
      PACK_GANG_STANDARD_Q08: { label: "Authority Contact" },
    },
  },

  //
  // 🎖️ PACK: Military Misconduct / Discipline
  //
  PACK_MILITARY_STANDARD: {
    displayName: "Military Misconduct Incident",
    pills: ["Military Discipline", "UCMJ", "Accountability", "Risk Indicator"],
    fields: {
      // v2.4 field_config fields
      branch: { label: "Branch of Service" },
      rank_role: { label: "Rank and Role" },
      incident_date: { label: "Date of Incident" },
      location: { label: "Location" },
      description: { label: "Description of Misconduct" },
      orders_violation: { label: "Orders/Standards Involved" },
      alcohol_drugs: { label: "Alcohol/Drug/Stress Factors" },
      disciplinary_action: { label: "Disciplinary Action Taken" },
      career_impact: { label: "Impact on Career or Clearance" },
      law_enforcement_contact: { label: "Military Police / CID / OSI / NCIS Contact" },
      remediation_steps: { label: "Steps Taken Since Incident" },
      // Legacy question mappings
      PACK_MILITARY_STANDARD_Q01: { label: "Branch" },
      PACK_MILITARY_STANDARD_Q02: { label: "Rank/Role" },
      PACK_MILITARY_STANDARD_Q03: { label: "Date" },
      PACK_MILITARY_STANDARD_Q04: { label: "Location" },
      PACK_MILITARY_STANDARD_Q05: { label: "Description" },
      PACK_MILITARY_STANDARD_Q06: { label: "Orders Violated" },
      PACK_MILITARY_STANDARD_Q07: { label: "Disciplinary Action" },
      PACK_MILITARY_STANDARD_Q08: { label: "Career Impact" },
    },
  },

  //
  // 🔫 PACK: Weapons Misconduct
  //
  PACK_WEAPONS_STANDARD: {
    displayName: "Weapons Misconduct Incident",
    pills: ["Weapons", "Risk", "Violence", "Public Safety"],
    fields: {
      // v2.4 field_config fields
      weapon_type: { label: "Type of Weapon" },
      weapon_ownership: { label: "Ownership / Possession" },
      incident_date: { label: "Date of Incident" },
      location: { label: "Incident Location" },
      description: { label: "Description of Incident" },
      weapon_use: { label: "Carrying / Displaying / Using Weapon" },
      threats: { label: "Threats or Danger to Others" },
      discharge: { label: "Weapon Discharge" },
      impairment: { label: "Alcohol / Drug / Impairing Factors" },
      actions_taken: { label: "Actions Taken Afterward" },
      // Legacy question mappings
      PACK_WEAPONS_STANDARD_Q01: { label: "Weapon Type" },
      PACK_WEAPONS_STANDARD_Q02: { label: "Ownership" },
      PACK_WEAPONS_STANDARD_Q03: { label: "Date" },
      PACK_WEAPONS_STANDARD_Q04: { label: "Location" },
      PACK_WEAPONS_STANDARD_Q05: { label: "Description" },
      PACK_WEAPONS_STANDARD_Q06: { label: "Weapon Use" },
      PACK_WEAPONS_STANDARD_Q07: { label: "Threats" },
      PACK_WEAPONS_STANDARD_Q08: { label: "Actions Taken" },
    },
  },

  //
  // 🔞 PACK: Adult Sexual Misconduct
  //
  PACK_SEX_ADULT_STANDARD: {
    displayName: "Adult Sexual Misconduct Incident",
    pills: ["Sexual Misconduct", "Risk", "Judgment", "Consent"],
    fields: {
      // v2.4 field_config fields
      type: { label: "Type of Misconduct" },
      when: { label: "When It Occurred" },
      where: { label: "Location" },
      consensual: { label: "Consent Status" },
      description: { label: "Incident Summary" },
      impairment: { label: "Alcohol/Drug Involvement" },
      environment: { label: "Setting" },
      authority_awareness: { label: "Authority Awareness" },
      consequences: { label: "Consequences & Remediation" },
      // Legacy question mappings
      PACK_SEX_ADULT_STANDARD_Q01: { label: "Type" },
      PACK_SEX_ADULT_STANDARD_Q02: { label: "When" },
      PACK_SEX_ADULT_STANDARD_Q03: { label: "Where" },
      PACK_SEX_ADULT_STANDARD_Q04: { label: "Consent" },
      PACK_SEX_ADULT_STANDARD_Q05: { label: "Summary" },
      PACK_SEX_ADULT_STANDARD_Q06: { label: "Impairment" },
      PACK_SEX_ADULT_STANDARD_Q07: { label: "Setting" },
      PACK_SEX_ADULT_STANDARD_Q08: { label: "Consequences" },
    },
  },

  //
  // ⚠️ PACK: Sex Crimes / Non-Consent
  //
  PACK_NON_CONSENT_STANDARD: {
    displayName: "Non-Consensual Sexual Incident",
    pills: ["Non-Consent", "Sexual Misconduct", "Risk", "Legal"],
    fields: {
      // v2.4 field_config fields
      incident_type: { label: "Type of Incident" },
      date: { label: "Date of Incident" },
      location: { label: "Location" },
      other_party: { label: "Other Party (Relationship Only)" },
      narrative: { label: "What Happened" },
      coercion: { label: "Coercion or Force" },
      consent_signals: { label: "Consent Signals" },
      impairment: { label: "Alcohol/Drugs" },
      injuries: { label: "Injuries Reported" },
      legal_action: { label: "Official Actions" },
      // Legacy question mappings
      PACK_NON_CONSENT_STANDARD_Q01: { label: "Type" },
      PACK_NON_CONSENT_STANDARD_Q02: { label: "Date" },
      PACK_NON_CONSENT_STANDARD_Q03: { label: "Location" },
      PACK_NON_CONSENT_STANDARD_Q04: { label: "Other Party" },
      PACK_NON_CONSENT_STANDARD_Q05: { label: "What Happened" },
      PACK_NON_CONSENT_STANDARD_Q06: { label: "Coercion" },
      PACK_NON_CONSENT_STANDARD_Q07: { label: "Consent Signals" },
      PACK_NON_CONSENT_STANDARD_Q08: { label: "Official Actions" },
    },
  },

  //
  // 💊 PACK: Drug Sale / Manufacture / Trafficking
  //
  PACK_DRUG_SALE_STANDARD: {
    displayName: "Drug Sale / Manufacture / Trafficking",
    pills: ["Drug Sale", "Trafficking", "Criminal", "Risk"],
    fields: {
      // v2.4 field_config fields
      substance_type: { label: "Substance Type" },
      role: { label: "Role / Involvement" },
      approx_date: { label: "Approximate Date" },
      frequency: { label: "Frequency" },
      location: { label: "Location" },
      associates: { label: "Other Parties" },
      compensation: { label: "Profit / Compensation" },
      weapons_violence: { label: "Weapons or Violence" },
      law_enforcement_involved: { label: "LE Involvement" },
      arrested_charged: { label: "Arrest / Charges" },
      disclosed_prior: { label: "Previously Disclosed" },
      recurrence: { label: "Occurred Again" },
      coercion: { label: "Voluntary or Coerced" },
      prevention_steps: { label: "Steps Taken Since" },
      // Legacy question mappings
      PACK_DRUG_SALE_STANDARD_Q01: { label: "Substance" },
      PACK_DRUG_SALE_STANDARD_Q02: { label: "Role" },
      PACK_DRUG_SALE_STANDARD_Q03: { label: "Date" },
      PACK_DRUG_SALE_STANDARD_Q04: { label: "Frequency" },
      PACK_DRUG_SALE_STANDARD_Q05: { label: "Location" },
      PACK_DRUG_SALE_STANDARD_Q06: { label: "Associates" },
      PACK_DRUG_SALE_STANDARD_Q07: { label: "Compensation" },
      PACK_DRUG_SALE_STANDARD_Q08: { label: "Weapons/Violence" },
      PACK_DRUG_SALE_STANDARD_Q09: { label: "LE Involved" },
      PACK_DRUG_SALE_STANDARD_Q10: { label: "Arrested/Charged" },
      PACK_DRUG_SALE_STANDARD_Q11: { label: "Disclosed Prior" },
      PACK_DRUG_SALE_STANDARD_Q12: { label: "Recurrence" },
      PACK_DRUG_SALE_STANDARD_Q13: { label: "Coercion" },
      PACK_DRUG_SALE_STANDARD_Q14: { label: "Prevention" },
    },
  },

  //
  // 🌿 PACK: Illegal Drug Use / Experimentation
  //
  PACK_DRUG_USE_STANDARD: {
    displayName: "Illegal Drug Use / Experimentation",
    pills: ["Drug Use", "Experimentation", "Substance", "Risk"],
    fields: {
      // v2.4 field_config fields
      substance_type: { label: "Substance" },
      first_use_date: { label: "First Use" },
      last_use_date: { label: "Most Recent Use" },
      total_uses: { label: "Times Used" },
      use_context: { label: "Context of Use" },
      use_location: { label: "Location" },
      obtain_method: { label: "Obtained How" },
      under_influence_in_prohibited_setting: { label: "Under Influence in Prohibited Setting" },
      consequences: { label: "Consequences" },
      law_enforcement_involved: { label: "LE Involvement" },
      prior_disclosure: { label: "Previously Disclosed" },
      other_substances_used: { label: "Other Substances" },
      behavior_stopped: { label: "Behavior Stopped" },
      mitigation_steps: { label: "Mitigation Steps" },
      // Legacy question mappings
      PACK_DRUG_USE_STANDARD_Q01: { label: "Substance" },
      PACK_DRUG_USE_STANDARD_Q02: { label: "First Use" },
      PACK_DRUG_USE_STANDARD_Q03: { label: "Last Use" },
      PACK_DRUG_USE_STANDARD_Q04: { label: "Total Uses" },
      PACK_DRUG_USE_STANDARD_Q05: { label: "Context" },
      PACK_DRUG_USE_STANDARD_Q06: { label: "Location" },
      PACK_DRUG_USE_STANDARD_Q07: { label: "Obtained" },
      PACK_DRUG_USE_STANDARD_Q08: { label: "Prohibited Setting" },
      PACK_DRUG_USE_STANDARD_Q09: { label: "Consequences" },
      PACK_DRUG_USE_STANDARD_Q10: { label: "LE Involved" },
      PACK_DRUG_USE_STANDARD_Q11: { label: "Prior Disclosure" },
      PACK_DRUG_USE_STANDARD_Q12: { label: "Other Substances" },
      PACK_DRUG_USE_STANDARD_Q13: { label: "Stopped" },
      PACK_DRUG_USE_STANDARD_Q14: { label: "Mitigation" },
    },
  },

  //
  // 💊 PACK: Prescription Medication Misuse
  //
  PACK_PRESCRIPTION_MISUSE_STANDARD: {
    displayName: "Prescription Medication Misuse",
    pills: ["Prescription", "Misuse", "Medication", "Risk"],
    fields: {
      // v2.4 field_config fields
      medication_type: { label: "Medication" },
      access_source: { label: "Access Method" },
      obtain_method: { label: "How Obtained" },
      first_occurrence_date: { label: "First Occurrence" },
      most_recent_date: { label: "Most Recent" },
      total_occurrences: { label: "Times Misused" },
      misuse_method: { label: "How Misused" },
      misuse_location: { label: "Location" },
      impairment_settings: { label: "Impairment Settings" },
      consequences: { label: "Consequences" },
      confrontation_discipline: { label: "Confrontation/Discipline" },
      authority_awareness: { label: "Authority Awareness" },
      help_sought: { label: "Help Sought" },
      recurrence: { label: "Recurrence" },
      prevention_steps: { label: "Prevention Steps" },
      // Legacy question mappings
      PACK_PRESCRIPTION_MISUSE_STANDARD_Q01: { label: "Medication" },
      PACK_PRESCRIPTION_MISUSE_STANDARD_Q02: { label: "Access Source" },
      PACK_PRESCRIPTION_MISUSE_STANDARD_Q03: { label: "How Obtained" },
      PACK_PRESCRIPTION_MISUSE_STANDARD_Q04: { label: "First Occurrence" },
      PACK_PRESCRIPTION_MISUSE_STANDARD_Q05: { label: "Most Recent" },
      PACK_PRESCRIPTION_MISUSE_STANDARD_Q06: { label: "Total Occurrences" },
      PACK_PRESCRIPTION_MISUSE_STANDARD_Q07: { label: "Misuse Method" },
      PACK_PRESCRIPTION_MISUSE_STANDARD_Q08: { label: "Location" },
      PACK_PRESCRIPTION_MISUSE_STANDARD_Q09: { label: "Impairment" },
      PACK_PRESCRIPTION_MISUSE_STANDARD_Q10: { label: "Consequences" },
      PACK_PRESCRIPTION_MISUSE_STANDARD_Q11: { label: "Confrontation" },
      PACK_PRESCRIPTION_MISUSE_STANDARD_Q12: { label: "Authority Aware" },
      PACK_PRESCRIPTION_MISUSE_STANDARD_Q13: { label: "Help Sought" },
      PACK_PRESCRIPTION_MISUSE_STANDARD_Q14: { label: "Recurrence" },
      PACK_PRESCRIPTION_MISUSE_STANDARD_Q15: { label: "Prevention" },
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