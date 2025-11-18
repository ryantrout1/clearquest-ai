
/**
 * ClearQuest Interview Engine - SECTION-FIRST ARCHITECTURE
 * Deterministic, section-aware question routing
 * SOURCE OF TRUTH: Section.section_order from database
 */

// ============================================================================
// FOLLOW-UP PACK DEFINITIONS
// NOTE: These are comprehensive definitions for ALL packs referenced by Question entities
// Each pack defines the structured follow-up questions asked after a "Yes" answer
// ============================================================================

const FOLLOWUP_PACK_STEPS = {
  // THESE PACK IDS MATCH THE Question.followup_pack FIELD VALUES EXACTLY
  
  // ========== Applications with Other LE Agencies ==========
  'PACK_LE_APPS': [
    { Field_Key: 'agency_name', Prompt: 'Which law enforcement agency did you apply to?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'application_date', Prompt: 'When did you apply? (Month and year is fine.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'application_outcome', Prompt: 'What was the outcome of your application?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { 
      Field_Key: 'official_reason_not_hired', 
      Prompt: 'What was the official reason the agency gave you for not selecting you?', 
      Response_Type: 'text', 
      Expected_Type: 'TEXT',
      Conditional_On: 'application_outcome',
      Conditional_Skip_If: ['hired', 'Hired', 'HIRED', 'was hired', 'I was hired']
    }
  ],

  'PACK_WITHHOLD_INFO': [
    { Field_Key: 'what_withheld', Prompt: 'What information did you withhold?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'which_agency', Prompt: 'Which agency or agencies?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why_withheld', Prompt: 'Why did you withhold this information?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this decision?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],
  
  'PACK_DISQUALIFIED': [
    { Field_Key: 'agency_name', Prompt: 'Which agency disqualified you?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reason_given', Prompt: 'What reason were you given for the disqualification?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'what_learned', Prompt: 'What have you learned or changed since then?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],
  
  'PACK_CHEATING': [
    { Field_Key: 'which_test', Prompt: 'Which test or portion did you cheat on?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'how_cheated', Prompt: 'How did you cheat?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // ========== Driving Record ==========
  'PACK_DUI': [
    { Field_Key: 'dui_date', Prompt: 'When did the DUI occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'bac_level', Prompt: 'What was your BAC level?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_DUI_STOP': [
    { Field_Key: 'incident_date', Prompt: 'When were you stopped for DUI?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'bac_level', Prompt: 'What was your BAC level, if known?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the outcome? (arrested, cited, warning, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_DUI_ARREST': [
    { Field_Key: 'arrest_date', Prompt: 'When were you arrested for DUI?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'bac_level', Prompt: 'What was your BAC level?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe what led to the arrest.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'penalties', Prompt: 'What penalties were imposed?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_LICENSE_SUSPENSION': [
    { Field_Key: 'when_occurred', Prompt: 'When was your license suspended/revoked?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reason', Prompt: 'What was the reason for the suspension?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'duration', Prompt: 'How long was it suspended?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reinstated', Prompt: 'Has it been reinstated? If so, when?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_LICENSE_SUSPENDED': [
    { Field_Key: 'when_occurred', Prompt: 'When was your license suspended/revoked/canceled?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reason', Prompt: 'What was the reason?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'duration', Prompt: 'For how long?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reinstated', Prompt: 'Has it been reinstated?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_SUSPENDED_LICENSE': [
    { Field_Key: 'suspension_date', Prompt: 'When was your license suspended?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reason', Prompt: 'What was the reason?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'duration', Prompt: 'How long was it suspended?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reinstated', Prompt: 'Has it been reinstated?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_REVOKED_LICENSE': [
    { Field_Key: 'revocation_date', Prompt: 'When was your license revoked?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reason', Prompt: 'What was the reason?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'current_status', Prompt: 'What is the current status?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_RECKLESS_DRIVING': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'citation_outcome', Prompt: 'What was the citation or outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_TRAFFIC': [
    { Field_Key: 'violation', Prompt: 'What was the traffic violation?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did it occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_TRAFFIC_CITATION': [
    { Field_Key: 'citation_date', Prompt: 'When did you receive the traffic citation?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'violation', Prompt: 'What was the violation?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_SPEEDING': [
    { Field_Key: 'citation_date', Prompt: 'When did you receive the speeding citation?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'speed', Prompt: 'How fast were you going?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'posted_limit', Prompt: 'What was the speed limit?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_COLLISION': [
    { Field_Key: 'incident_date', Prompt: 'When did the collision occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened and who was at fault.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'property_damage', Prompt: 'Was there property damage? If so, describe.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reported', Prompt: 'Was it reported to law enforcement or insurance?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'Were any citations issued? What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_ACCIDENT': [
    { Field_Key: 'accident_date', Prompt: 'When did the accident occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'at_fault', Prompt: 'Were you at fault?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'injuries', Prompt: 'Were there any injuries?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'property_damage', Prompt: 'Was there property damage?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reported', Prompt: 'Was it reported to police?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_COLLISION_INJURY': [
    { Field_Key: 'incident_date', Prompt: 'When did this collision occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'injuries_description', Prompt: 'Describe the injuries that occurred.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'fatalities', Prompt: 'Were there any fatalities?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'What were the circumstances? Who was at fault?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_ALCOHOL_COLLISION': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'bac_level', Prompt: 'What was your BAC level, if known?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'injuries', Prompt: 'Were there any injuries?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_UNREPORTED_COLLISION': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why_unreported', Prompt: 'Why was it not reported?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'property_damage', Prompt: 'Was there property damage?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for not reporting it?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_HIT_RUN': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why_left_scene', Prompt: 'Why did you leave the scene?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_HIT_RUN_DAMAGE': [
    { Field_Key: 'injuries_occurred', Prompt: 'Were there any injuries?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'property_damage', Prompt: 'Describe the property damage.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'estimated_cost', Prompt: 'What was the estimated cost of the damage?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'restitution', Prompt: 'Was restitution made? If so, how?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_LEAVING_SCENE': [
    { Field_Key: 'incident_date', Prompt: 'When did you leave the scene?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why_left', Prompt: 'Why did you leave the scene?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_DRIVE_NO_INSURANCE': [
    { Field_Key: 'when_occurred', Prompt: 'When did you drive without insurance?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'how_long', Prompt: 'For how long did you drive without insurance?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why_no_insurance', Prompt: 'Why did you not have insurance?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'caught', Prompt: 'Were you caught or cited for this?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_NO_INSURANCE': [
    { Field_Key: 'when_occurred', Prompt: 'When did you drive without insurance?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'duration', Prompt: 'For how long?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why', Prompt: 'Why did you not have insurance?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_INSURANCE_REFUSED': [
    { Field_Key: 'when_occurred', Prompt: 'When were you refused insurance?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'which_company', Prompt: 'Which insurance company refused you?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reason_given', Prompt: 'What reason were you given?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'current_status', Prompt: 'Do you have insurance now? If so, with whom?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_CRIMINAL_TRAFFIC': [
    { Field_Key: 'incident_date', Prompt: 'When did you receive the criminal traffic citation?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'violation_type', Prompt: 'What was the violation?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_TRAFFIC_ARREST': [
    { Field_Key: 'arrest_date', Prompt: 'When were you arrested?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'violation', Prompt: 'What was the violation?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_ROAD_RAGE': [
    { Field_Key: 'incident_date', Prompt: 'When did this road rage incident occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'your_role', Prompt: 'What was your role in the incident?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'law_enforcement_involved', Prompt: 'Was law enforcement involved?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_OTHER_DRIVING': [
    { Field_Key: 'issue_description', Prompt: 'Describe the traffic/driving issue.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'circumstances', Prompt: 'What were the circumstances?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_ILLEGAL_TURN': [
    { Field_Key: 'citation_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'violation', Prompt: 'What was the violation?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_FAILURE_TO_YIELD': [
    { Field_Key: 'citation_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_SCHOOL_ZONE': [
    { Field_Key: 'citation_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'speed', Prompt: 'How fast were you going?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'posted_limit', Prompt: 'What was the speed limit?', Response_Type: 'text', Expected_Type: 'TEXT', Conditional_On: 'speed', Conditional_Skip_If: ['unknown', 'not sure'] },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_RED_LIGHT': [
    { Field_Key: 'citation_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_STOP_SIGN': [
    { Field_Key: 'citation_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_CARELESS_DRIVING': [
    { Field_Key: 'citation_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_RACING': [
    { Field_Key: 'incident_date', Prompt: 'When did this racing incident occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_TEXTING_DRIVING': [
    { Field_Key: 'citation_date', Prompt: 'When were you cited for texting while driving?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_PHONE_DRIVING': [
    { Field_Key: 'citation_date', Prompt: 'When were you cited for using a phone while driving?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'what_doing', Prompt: 'What were you doing on the phone?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_SEATBELT': [
    { Field_Key: 'citation_date', Prompt: 'When were you cited for not wearing a seatbelt?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_PARKING': [
    { Field_Key: 'citation_date', Prompt: 'When did you receive the parking citation?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'violation', Prompt: 'What was the violation?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'paid', Prompt: 'Was the fine paid?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_EQUIPMENT_VIOLATION': [
    { Field_Key: 'citation_date', Prompt: 'When did you receive the equipment violation?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'violation_type', Prompt: 'What was the equipment violation?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'fixed', Prompt: 'Was it fixed?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // ========== Criminal Involvement / Police Contacts ==========
  
  'PACK_STOLEN_VEHICLE': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did this occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances. How did you know the vehicle was stolen?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'your_role', Prompt: 'What was your involvement? Were you a passenger, driver, or otherwise involved?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'law_enforcement_involved', Prompt: 'Was law enforcement involved?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],
  
  'PACK_ARREST': [
    { Field_Key: 'arrest_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did this occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'charge_description', Prompt: 'What were you arrested/detained for?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_CHARGES': [
    { Field_Key: 'charge_date', Prompt: 'When were you charged?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did this occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'charge_description', Prompt: 'What was the charge?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_CRIMINAL_CHARGE': [
    { Field_Key: 'charge_date', Prompt: 'When were you charged?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did this occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'charge_description', Prompt: 'What was the charge?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_CONVICTION': [
    { Field_Key: 'conviction_date', Prompt: 'When were you convicted?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did this occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'conviction_description', Prompt: 'What were you convicted of?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'sentence', Prompt: 'What was the sentence?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'completed', Prompt: 'Have you completed the sentence?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_DIVERSION': [
    { Field_Key: 'program_date', Prompt: 'When did you enter the diversion program?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'charge', Prompt: 'What was the original charge?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'program_type', Prompt: 'What type of diversion program?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'completed', Prompt: 'Did you complete the program?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'outcome', Prompt: 'What was the final outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_PROBATION': [
    { Field_Key: 'probation_start_date', Prompt: 'When did you start probation?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'offense', Prompt: 'What was the offense that led to probation?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'probation_type', Prompt: 'What type of probation? (supervised, unsupervised, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'duration', Prompt: 'How long was/is the probation period?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'conditions', Prompt: 'What were the conditions of probation?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'violations', Prompt: 'Did you violate probation? If so, what happened?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'current_status', Prompt: 'What is the current status? (completed, ongoing, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_INVESTIGATION': [
    { Field_Key: 'when_occurred', Prompt: 'When were you accused or investigated?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accusation_type', Prompt: 'What was the accusation or investigation about?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'who_investigated', Prompt: 'Who conducted the investigation? (police, employer, agency, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'investigation_outcome', Prompt: 'What was the outcome of the investigation?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'charges_filed', Prompt: 'Were charges filed? If so, what happened?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this situation?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_POLICE_CALLED': [
    { Field_Key: 'when_occurred', Prompt: 'When was law enforcement called to your house?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did this occur? (city/state)', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'reason', Prompt: 'Why was law enforcement called?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'who_called', Prompt: 'Who called them? (you, neighbor, family member, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'arrests_made', Prompt: 'Were any arrests made? If so, who?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this situation?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_FELONY': [
    { Field_Key: 'felony_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'felony_type', Prompt: 'What was the felony?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_FELONY_DETAIL': [
    { Field_Key: 'charge_date', Prompt: 'When were you arrested, charged, or suspected?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did this occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'felony_charge', Prompt: 'What was the felony charge or suspicion?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'arrested', Prompt: 'Were you arrested?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_WARRANT': [
    { Field_Key: 'warrant_issued_date', Prompt: 'When was the warrant issued?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'issuing_agency', Prompt: 'Which agency issued it?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'warrant_reason', Prompt: 'What was the warrant for?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'current_status', Prompt: 'What is the current status of the warrant?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_PROTECTIVE_ORDER': [
    { Field_Key: 'order_date', Prompt: 'When was the protective order issued?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'issuing_court', Prompt: 'Which court issued it?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'What were the circumstances?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'who_protected', Prompt: 'Who was being protected? (relationship)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'duration', Prompt: 'How long was/is the order in effect?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'current_status', Prompt: 'What is the current status?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this situation?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_GANG': [
    { Field_Key: 'gang_name', Prompt: 'What was the name of the gang?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'involvement_dates', Prompt: 'When were you involved? (Start and end dates)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'level_of_involvement', Prompt: 'Describe your level of involvement.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'activities', Prompt: 'What activities were you involved in?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why_left', Prompt: 'Why did you leave the gang?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'current_contact', Prompt: 'Do you still have contact with former gang members?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this past involvement?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_WEAPON_VIOLATION': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'weapon_type', Prompt: 'What type of weapon was involved?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'violation_description', Prompt: 'Describe the weapons violation.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'What were the circumstances?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_ILLEGAL_WEAPON': [
    { Field_Key: 'when_occurred', Prompt: 'When did you illegally own or possess a firearm?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'weapon_type', Prompt: 'What type of firearm or weapon was it?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why_illegal', Prompt: 'Why was it illegal? (prohibited person, stolen, unregistered, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'discovered', Prompt: 'Was it discovered? If so, what happened?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_CARRY_WEAPON': [
    { Field_Key: 'weapon_type', Prompt: 'What type of weapon do you carry?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'where_carried', Prompt: 'Where do you carry/keep it? (person, vehicle, home)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'how_long', Prompt: 'How long have you been carrying/keeping it?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'permit_status', Prompt: 'Do you have a permit? If so, what type?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reason', Prompt: 'Why do you carry/keep a weapon?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_TRESPASSING': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did this take place?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'property_type', Prompt: 'What type of property was it? (building, residence, land, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'What were the circumstances? Why did you enter?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'Were you arrested or charged? If so, what was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_PROPERTY_DAMAGE': [
    { Field_Key: 'when_occurred', Prompt: 'When did you damage someone else\'s property?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did this occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'property_type', Prompt: 'What type of property was damaged?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'how_damaged', Prompt: 'How was it damaged?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why_damaged', Prompt: 'Why did you damage it? Was it intentional?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'value', Prompt: 'What was the approximate value of the damage?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'restitution', Prompt: 'Was restitution made?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_SERIOUS_INJURY': [
    { Field_Key: 'when_occurred', Prompt: 'When did you cause serious physical injury or death?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did this occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'victim_relationship', Prompt: 'What was your relationship to the victim?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'what_happened', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'injury_or_death', Prompt: 'Was it injury or death? Describe the severity.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'intentional', Prompt: 'Was it intentional or accidental?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_HATE_CRIME': [
    { Field_Key: 'when_occurred', Prompt: 'When did this hate crime occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'target_group', Prompt: 'What group was targeted? (race, religion, sexual orientation, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'what_happened', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'motivation', Prompt: 'What was your motivation?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_LE_INTERVIEW': [
    { Field_Key: 'when_occurred', Prompt: 'When were you interviewed by law enforcement?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'agency', Prompt: 'Which law enforcement agency?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reason', Prompt: 'What was the reason for the interview?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'your_role', Prompt: 'Were you a suspect, witness, victim, or informant?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_ARRESTABLE_ACTIVITY': [
    { Field_Key: 'activity_type', Prompt: 'What type of activity could result in arrest?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur or when does it occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'still_occurring', Prompt: 'Is this still occurring?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_CRIMINAL_ASSOCIATES': [
    { Field_Key: 'who_associates', Prompt: 'Who do you associate with? (name/relationship)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'illegal_activities', Prompt: 'What illegal activities are they involved in?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'relationship_type', Prompt: 'What is your relationship? (friend, family, coworker, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'how_long', Prompt: 'How long have you associated with them?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'frequency', Prompt: 'How often do you associate with them?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'your_involvement', Prompt: 'Have you been involved in any of their illegal activities?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for these associations?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_CRIMINAL_ORGANIZATION': [
    { Field_Key: 'organization_name', Prompt: 'What was the name of the individual or organization?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_involved', Prompt: 'When were you involved?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'criminal_activities', Prompt: 'What criminal activities were they engaged in?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'your_role', Prompt: 'What was your role or involvement?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'how_long', Prompt: 'How long were you involved?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why_left', Prompt: 'Why are you no longer involved?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'Was law enforcement involved? What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_CONSPIRACY': [
    { Field_Key: 'when_occurred', Prompt: 'When did this criminal conspiracy occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'crime_type', Prompt: 'What crime was being planned?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'who_involved', Prompt: 'Who else was involved?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'your_role', Prompt: 'What was your role in the conspiracy?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'was_executed', Prompt: 'Was the crime actually carried out?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_PLANNED_CRIME': [
    { Field_Key: 'when_planned', Prompt: 'When did you plan this crime?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'crime_type', Prompt: 'What crime did you plan?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why_planned', Prompt: 'Why did you plan it?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'followed_through', Prompt: 'Did you follow through with the plan?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why_not_followed_through', Prompt: 'If you didn\'t follow through, why not?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'Were there any legal consequences?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_JUVENILE_CRIME': [
    { Field_Key: 'crime_type', Prompt: 'What crime did you commit as a juvenile?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur? (your age at the time)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'arrested', Prompt: 'Were you arrested or caught?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_DELETED_SOCIAL_MEDIA': [
    { Field_Key: 'content_type', Prompt: 'What type of content did you delete? (image, video, post, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'platform', Prompt: 'Which platform? (Facebook, Instagram, TikTok, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_deleted', Prompt: 'When did you delete it?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'what_showed', Prompt: 'What did the content show or depict?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why_problematic', Prompt: 'Why could it negatively impact your candidacy?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_PRANK_CRIME': [
    { Field_Key: 'when_occurred', Prompt: 'When did this prank occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'prank_description', Prompt: 'Describe the prank.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why_criminal', Prompt: 'Why could it be considered a crime?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'who_involved', Prompt: 'Who else was involved?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'consequences', Prompt: 'What were the consequences?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_UNCAUGHT_CRIME': [
    { Field_Key: 'crime_type', Prompt: 'What crime did you commit?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'value_or_impact', Prompt: 'What was the value/impact? (if applicable)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why_uncaught', Prompt: 'Why were you never caught?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_IRS_INVESTIGATION': [
    { Field_Key: 'when_occurred', Prompt: 'When were you investigated by the IRS?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'investigation_type', Prompt: 'What type of investigation? (audit, criminal, civil, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'tax_years', Prompt: 'Which tax years were involved?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reason', Prompt: 'What was the reason for the investigation?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'penalties', Prompt: 'Were any penalties assessed? If so, how much?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_UNREPORTED_INCOME': [
    { Field_Key: 'tax_years', Prompt: 'Which tax year(s) did you fail to report income?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'income_type', Prompt: 'What type of income did you not report? (cash work, tips, investments, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'amount', Prompt: 'What was the approximate amount not reported?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why_not_reported', Prompt: 'Why did you not report it?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'discovered', Prompt: 'Was it discovered by the IRS?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'current_status', Prompt: 'What is the current status? (amended return, paid back, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_CRIME_FOR_DEBT': [
    { Field_Key: 'when_occurred', Prompt: 'When did you commit a crime to pay a debt?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'crime_type', Prompt: 'What crime did you commit?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'debt_type', Prompt: 'What was the debt for?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'debt_amount', Prompt: 'How much was the debt?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'Were you caught? What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_ILLEGAL_FIREWORKS': [
    { Field_Key: 'when_occurred', Prompt: 'When did you purchase or transport illegal fireworks?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'fireworks_type', Prompt: 'What type of fireworks?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'where_purchased', Prompt: 'Where did you purchase them?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'transported_across_state', Prompt: 'Did you transport them across state lines?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'Were you caught? What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_FOREIGN_CRIME': [
    { Field_Key: 'country', Prompt: 'In which country did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'crime_description', Prompt: 'What was the crime or accusation?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_POLICE_REPORT': [
    { Field_Key: 'when_occurred', Prompt: 'When might this have occurred?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'reason', Prompt: 'Why might your name be in a police report?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'your_role', Prompt: 'What was your involvement?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_FIGHT': [
    { Field_Key: 'incident_date', Prompt: 'When did this physical fight occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'circumstances', Prompt: 'What led to the fight?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'injuries', Prompt: 'Were there any injuries?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'law_enforcement_involved', Prompt: 'Was law enforcement involved?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_DOMESTIC_VIOLENCE': [
    { Field_Key: 'when_occurred', Prompt: 'When did this domestic violence incident occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'relationship', Prompt: 'What was your relationship to the other person?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'incident_type', Prompt: 'What type of incident? (assault, threats, harassment, stalking, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'law_enforcement_involved', Prompt: 'Was law enforcement involved?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_CHILD_CRIME_COMMITTED': [
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'child_age', Prompt: 'How old was the child?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'your_age', Prompt: 'How old were you?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'crime_type', Prompt: 'What type of crime was it?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_CHILD_CRIME_ACCUSED': [
    { Field_Key: 'when_occurred', Prompt: 'When were you accused?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did this occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'child_age', Prompt: 'How old was the child?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'your_age', Prompt: 'How old were you?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accusation_type', Prompt: 'What was the accusation?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'investigation', Prompt: 'Was there an investigation? If so, by whom?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'investigation_outcome', Prompt: 'What was the outcome of the investigation?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this situation?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_CHILD_PROTECTION': [
    { Field_Key: 'agency', Prompt: 'Which child protection agency interviewed you?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'nature_of_interview', Prompt: 'What was the nature of the interview? (allegation, witness, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome of the investigation?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this situation?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_SHOPLIFTING': [
    { Field_Key: 'when_occurred', Prompt: 'When did this shoplifting occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur? (store name and location)', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'what_stolen', Prompt: 'What did you shoplift or alter?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'value', Prompt: 'What was the approximate value?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'caught', Prompt: 'Were you caught or confronted?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_THEFT_QUESTIONING': [
    { Field_Key: 'when_occurred', Prompt: 'When were you questioned?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did this occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'who_questioned', Prompt: 'Who questioned you? (security, police, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this situation?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_THEFT': [
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur? (employer, store, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'what_stolen', Prompt: 'What was stolen?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'value', Prompt: 'What was the approximate value?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_SIGNATURE_FORGERY': [
    { Field_Key: 'when_occurred', Prompt: 'When did you sign someone else\'s name?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'whose_signature', Prompt: 'Whose signature did you forge?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'document_type', Prompt: 'What type of document? (check, contract, application, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'purpose', Prompt: 'What was the purpose? (monetary gain, authorization, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'amount_involved', Prompt: 'If monetary, what was the amount involved?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'discovered', Prompt: 'Was it discovered?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_HACKING': [
    { Field_Key: 'when_occurred', Prompt: 'When did you hack into a computer or account?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'target_type', Prompt: 'What did you hack into? (computer, email, social media, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'whose_account', Prompt: 'Whose computer or account was it?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why_hacked', Prompt: 'Why did you do it?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'what_accessed', Prompt: 'What information did you access?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'discovered', Prompt: 'Was it discovered?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_ILLEGAL_DOWNLOADS': [
    { Field_Key: 'when_occurred', Prompt: 'When did you illegally download content?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'content_type', Prompt: 'What type of content? (music, videos, software, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'how_downloaded', Prompt: 'How did you download it? (torrents, file-sharing, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'for_profit', Prompt: 'Did you do it for profit? If so, how much did you make?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'frequency', Prompt: 'How often did you do this?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'discovered', Prompt: 'Were you ever caught or contacted about it?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_STOLEN_PROPERTY': [
    { Field_Key: 'when_occurred', Prompt: 'When were you in possession of stolen property?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'property_type', Prompt: 'What type of property was it?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'how_obtained', Prompt: 'How did you obtain it?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'how_knew_stolen', Prompt: 'How did you know it was stolen?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'what_did_with_it', Prompt: 'What did you do with the property?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'discovered', Prompt: 'Was it discovered? If so, what happened?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_POLICE_BRUTALITY': [
    { Field_Key: 'when_occurred', Prompt: 'When did this accusation occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'your_role', Prompt: 'What was your role in the incident?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'investigation', Prompt: 'Was there an investigation? If so, by whom?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'investigation_outcome', Prompt: 'What was the outcome of the investigation?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'discipline', Prompt: 'Was any discipline taken?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this situation?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_STOLEN_GOODS': [
    { Field_Key: 'when_occurred', Prompt: 'When did you purchase stolen goods?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'what_purchased', Prompt: 'What items did you purchase?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'how_knew_stolen', Prompt: 'How did you know the items were stolen?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'from_whom', Prompt: 'From whom did you purchase them?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'Were you caught or charged? What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_DOMESTIC_VICTIM': [
    { Field_Key: 'when_occurred', Prompt: 'When did this domestic violence occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'relationship', Prompt: 'What was your relationship to the perpetrator?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reported', Prompt: 'Was it reported to law enforcement?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'protective_order', Prompt: 'Was a protective order issued?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'support_received', Prompt: 'What support or counseling did you receive?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_DOMESTIC_ACCUSED': [
    { Field_Key: 'when_occurred', Prompt: 'When were you accused of domestic violence?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'relationship', Prompt: 'What was your relationship to the other person?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'law_enforcement_involved', Prompt: 'Was law enforcement involved?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'protective_order', Prompt: 'Was a protective order issued against you?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_OTHER_CRIMINAL': [
    { Field_Key: 'issue_description', Prompt: 'Describe the involvement with police or illegal activity.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'circumstances', Prompt: 'What were the circumstances?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // ========== Extremist Organizations ==========
  'PACK_EXTREMIST': [
    { Field_Key: 'organization_name', Prompt: 'What was the name of the organization?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'involvement_dates', Prompt: 'When were you involved?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'level_of_involvement', Prompt: 'Describe your level of involvement.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'activities', Prompt: 'What activities were you involved in?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why_left', Prompt: 'Why are you no longer involved?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'current_beliefs', Prompt: 'Do you still hold the beliefs of this organization?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this past involvement?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_EXTREMIST_DETAIL': [
    { Field_Key: 'group_name', Prompt: 'What was the name of the group or organization?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'involvement_type', Prompt: 'What was your involvement? (member, supporter, attendee, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_involved', Prompt: 'When were you involved? (dates or time period)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'activities', Prompt: 'What activities were you involved in?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'ideology', Prompt: 'Describe the ideology or beliefs of the group.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why_left', Prompt: 'Why are you no longer involved?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'current_beliefs', Prompt: 'Do you still hold these beliefs?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this involvement?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // ========== Sexual Activities ==========
  'PACK_PROSTITUTION': [
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did this occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'Were you arrested or charged? What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_PAID_SEX': [
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did this occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'for_self_or_other', Prompt: 'Was this for yourself or someone else?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'frequency', Prompt: 'How many times did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'Were you arrested or charged? What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_PORNOGRAPHY': [
    { Field_Key: 'involvement_type', Prompt: 'What was your involvement? (viewing, distribution, production, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'Was law enforcement involved? What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_HARASSMENT': [
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did this occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reported', Prompt: 'Was it reported? If so, to whom?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'consequences', Prompt: 'What were the consequences?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_ASSAULT': [
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reported', Prompt: 'Was it reported to law enforcement?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_NON_CONSENT': [
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did this occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'victim_age', Prompt: 'How old was the person?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'your_age', Prompt: 'How old were you at the time?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why_no_consent', Prompt: 'Why could they not provide consent? (age, intoxication, incapacitation, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reported', Prompt: 'Was it reported to law enforcement?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_MINOR_CONTACT': [
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'minor_age', Prompt: 'How old was the minor?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'your_age', Prompt: 'How old were you at the time?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'nature_of_contact', Prompt: 'Describe the nature of the contact.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'What were the circumstances?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'Was law enforcement involved? What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // ========== Financial History ==========
  'PACK_FINANCIAL': [
    { Field_Key: 'issue_type', Prompt: 'What type of financial issue was it?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'amount_involved', Prompt: 'What was the amount involved?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'current_status', Prompt: 'What is the current status?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'changes_since', Prompt: 'What have you changed since then?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_BANKRUPTCY': [
    { Field_Key: 'bankruptcy_date', Prompt: 'When did you file for bankruptcy?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'bankruptcy_type', Prompt: 'What type of bankruptcy? (Chapter 7, 13, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reason', Prompt: 'What led to the bankruptcy?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'amount_discharged', Prompt: 'What was the approximate amount discharged?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'discharge_date', Prompt: 'When was it discharged?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'changes_since', Prompt: 'What have you changed in your financial management since then?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_FORECLOSURE': [
    { Field_Key: 'foreclosure_date', Prompt: 'When did the foreclosure occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'property_address', Prompt: 'What was the address of the property?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'reason', Prompt: 'What led to the foreclosure?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'amount_owed', Prompt: 'What was the approximate amount owed?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'deficiency', Prompt: 'Was there a deficiency balance? If so, how much?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'changes_since', Prompt: 'What have you changed in your financial management since then?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_REPOSSESSION': [
    { Field_Key: 'repossession_date', Prompt: 'When was the property repossessed?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'property_type', Prompt: 'What was repossessed? (vehicle, equipment, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reason', Prompt: 'Why was it repossessed?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'amount_owed', Prompt: 'What was the approximate amount owed?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'deficiency', Prompt: 'Was there a deficiency balance remaining?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'changes_since', Prompt: 'What have you changed in your financial management since then?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_LAWSUIT': [
    { Field_Key: 'lawsuit_date', Prompt: 'When did the lawsuit occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'plaintiff_defendant', Prompt: 'Were you the plaintiff or defendant?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'lawsuit_type', Prompt: 'What type of lawsuit was it?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'judgment_amount', Prompt: 'If applicable, what was the judgment amount?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_LATE_PAYMENT': [
    { Field_Key: 'creditor', Prompt: 'Which creditor or account?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did the late payments occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'how_late', Prompt: 'How late were the payments? (30, 60, 90+ days)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reason', Prompt: 'What was the reason for the late payments?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'current_status', Prompt: 'What is the current status of the account?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'changes_since', Prompt: 'What changes have you made to avoid this in the future?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_GAMBLING': [
    { Field_Key: 'gambling_problem_period', Prompt: 'During what time period did you have a gambling problem?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'gambling_types', Prompt: 'What types of gambling were involved?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'financial_impact', Prompt: 'What was the financial impact?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'treatment_sought', Prompt: 'Did you seek treatment or counseling?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'current_status', Prompt: 'What is your current status with gambling?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // ========== Drug/Alcohol History ==========
  'PACK_DRUG_USE': [
    { Field_Key: 'substance_name', Prompt: 'What substance did you use?', Response_Type: 'text', Expected_Type: 'TEXT', Auto_Fill: true },
    { Field_Key: 'first_use', Prompt: 'When did you first use {substance}?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'last_use', Prompt: 'When was the last time you used {substance}?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'frequency', Prompt: 'How frequently did you use {substance}?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'how_obtained', Prompt: 'How did you obtain {substance}?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances of your use.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_DRUG_SALE': [
    { Field_Key: 'substance_name', Prompt: 'What substance did you sell?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur? (dates or time period)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'frequency', Prompt: 'How often did you sell drugs?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'Were you ever arrested or charged? What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_PRESCRIPTION_MISUSE': [
    { Field_Key: 'medication_name', Prompt: 'What prescription medication?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did the misuse occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'how_obtained', Prompt: 'How did you obtain the medication?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances of the misuse.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'frequency', Prompt: 'How frequently did you misuse it?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_ALCOHOL_DEPENDENCY': [
    { Field_Key: 'dependency_period', Prompt: 'During what time period did you have a gambling problem?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'impact_on_life', Prompt: 'How did it impact your work, school, or relationships?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'treatment_sought', Prompt: 'Did you seek treatment or counseling?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'sobriety_date', Prompt: 'If applicable, when did you become sober?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'current_status', Prompt: 'What is your current relationship with alcohol?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for your past dependency?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_ALCOHOL_INCIDENT': [
    { Field_Key: 'incident_date', Prompt: 'When did this alcohol-related incident occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'incident_type', Prompt: 'What type of incident was it?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'consequences', Prompt: 'What were the consequences?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_PROVIDE_ALCOHOL': [
    { Field_Key: 'when_where', Prompt: 'When and where did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'who_provided_to', Prompt: 'Who did you provide alcohol to? (age/relationship)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'What were the circumstances?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'Were there any legal consequences? (citation, arrest, charges)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this decision?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'ILLEGAL_DRUG_USE': [
    { Field_Key: 'drug_name', Prompt: 'What specific drug did you use?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'drug_form', Prompt: 'What form was it in? (Powder, pill, edible, smoked, injected, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'first_use', Prompt: 'When did you first use this drug? (Month/Year)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'age_at_first_use', Prompt: 'How old were you at the time?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'last_use', Prompt: 'When was the last time you used it? (Month/Year)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'total_times', Prompt: 'How many total times have you used this drug?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'situation_reason', Prompt: 'What was the situation or reason for using it?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'who_with', Prompt: 'Who were you with when you used it?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'where_occurred', Prompt: 'Where did the use occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'purchased', Prompt: 'Have you ever purchased this drug?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'around_others', Prompt: 'Have you ever been around others using it?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'driven_under_influence', Prompt: 'Have you ever driven a vehicle while under the influence?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'law_enforcement', Prompt: 'Were law enforcement involved in any way?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'additional_info', Prompt: 'Is there anything else about your use of this drug that an investigator should know?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // ========== Military History ==========
  'PACK_MIL_SERVICE': [
    { Field_Key: 'branch', Prompt: 'Which branch did you serve in?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'service_dates', Prompt: 'When did you serve? (start and end dates)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'rank', Prompt: 'What was your rank when you left?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'discharge_type', Prompt: 'What type of discharge did you receive? (Honorable, General, OTH, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],
  
  'PACK_MIL_REJECTION': [
    { Field_Key: 'branch', Prompt: 'Which military branch turned you down?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_applied', Prompt: 'When did you apply?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reason_given', Prompt: 'What reason were you given for the rejection?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reapply', Prompt: 'Did you attempt to reapply?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_MIL_DISCHARGE': [
    { Field_Key: 'branch', Prompt: 'Which branch of the military?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'discharge_date', Prompt: 'When were you discharged?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'discharge_type', Prompt: 'What type of discharge? (Honorable, General, OTH, Dishonorable, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reason', Prompt: 'What was the reason for the discharge?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_MIL_DISCIPLINE': [
    { Field_Key: 'branch', Prompt: 'Which branch of the military?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'discipline_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'discipline_type', Prompt: 'What type of discipline? (Article 15, Court-Martial, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'offense', Prompt: 'What was the offense?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'punishment', Prompt: 'What was the punishment?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // ========== Employment History ==========
  'PACK_DISCIPLINE': [
    { Field_Key: 'employer', Prompt: 'Which employer?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'discipline_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'discipline_type', Prompt: 'What type of discipline? (verbal warning, written, suspension, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reason', Prompt: 'What was the reason for the discipline?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_WORK_DISCIPLINE': [
    { Field_Key: 'employer', Prompt: 'Which employer?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'discipline_type', Prompt: 'What type of discipline?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reason', Prompt: 'What was the reason?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_FIRED': [
    { Field_Key: 'employer', Prompt: 'Which employer terminated you?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'termination_date', Prompt: 'When were you terminated?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reason_given', Prompt: 'What reason were you given for the termination?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'prior_discipline', Prompt: 'Was there prior discipline leading up to this?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_QUIT_AVOID': [
    { Field_Key: 'employer', Prompt: 'Which employer?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'resignation_date', Prompt: 'When did you resign?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'what_avoided', Prompt: 'What discipline or termination were you avoiding?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_DRUG_TEST_CHEAT': [
    { Field_Key: 'employer', Prompt: 'Which employer?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'how_cheated', Prompt: 'How did you cheat on the drug test?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why_cheated', Prompt: 'Why did you cheat?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'caught', Prompt: 'Were you caught?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'consequences', Prompt: 'What were the consequences?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_FALSE_APPLICATION': [
    { Field_Key: 'employer', Prompt: 'Which employer?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'application_date', Prompt: 'When did you apply?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'false_information', Prompt: 'What false information did you provide?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why', Prompt: 'Why did you provide false information?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'discovered', Prompt: 'Was it discovered?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'consequences', Prompt: 'What were the consequences?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_MISUSE_RESOURCES': [
    { Field_Key: 'employer', Prompt: 'Which employer?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'resources_misused', Prompt: 'What resources did you misuse?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'how_misused', Prompt: 'How did you misuse them?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'discovered', Prompt: 'Was it discovered?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'consequences', Prompt: 'What were the consequences?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_UNEMPLOYMENT_FRAUD': [
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'state', Prompt: 'Which state?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'fraud_type', Prompt: 'What type of fraud? (working while claiming, false information, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'amount', Prompt: 'What was the approximate amount involved?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'discovered', Prompt: 'Was it discovered?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // ========== Prior Law Enforcement Employment ==========
  'PACK_LE_PREV': [
    { Field_Key: 'agency_name', Prompt: 'Which law enforcement agency did you work for?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'employment_dates', Prompt: 'When did you work there? (start and end dates)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'position', Prompt: 'What was your position?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reason_for_leaving', Prompt: 'Why did you leave?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'eligible_for_rehire', Prompt: 'Are you eligible for rehire?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_ACCUSED_FORCE': [
    { Field_Key: 'agency', Prompt: 'Which agency?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the incident and the accusation.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'investigation_outcome', Prompt: 'What was the outcome of the investigation?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'discipline', Prompt: 'Was any discipline taken?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this situation?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_GRATUITY': [
    { Field_Key: 'agency', Prompt: 'Which agency?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'what_received', Prompt: 'What gratuity did you accept?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'from_whom', Prompt: 'From whom did you accept it?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'discovered', Prompt: 'Was it discovered?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'consequences', Prompt: 'What were the consequences?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_FALSIFY_REPORT': [
    { Field_Key: 'agency', Prompt: 'Which agency?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'report_type', Prompt: 'What type of report did you falsify?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'what_falsified', Prompt: 'What was falsified?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why', Prompt: 'Why did you falsify it?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'discovered', Prompt: 'Was it discovered?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'consequences', Prompt: 'What were the consequences?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_INTERNAL_AFFAIRS': [
    { Field_Key: 'agency', Prompt: 'Which agency?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did the investigation occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'allegation', Prompt: 'What was the allegation?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'investigation_finding', Prompt: 'What was the finding? (sustained, unfounded, exonerated, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'discipline', Prompt: 'Was any discipline taken?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this situation?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_LYING_LE': [
    { Field_Key: 'agency', Prompt: 'Which agency?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'what_lied_about', Prompt: 'What did you lie about?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'to_whom', Prompt: 'To whom did you lie? (supervisor, investigator, court, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'discovered', Prompt: 'Was it discovered?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'consequences', Prompt: 'What were the consequences?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_LE_COMPLAINT': [
    { Field_Key: 'agency', Prompt: 'Which agency?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did the complaint occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'complaint_nature', Prompt: 'What was the nature of the complaint?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'investigation_outcome', Prompt: 'What was the outcome of the investigation?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'discipline', Prompt: 'Was any discipline taken?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this situation?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_OTHER_PRIOR_LE': [
    { Field_Key: 'agency', Prompt: 'Which agency?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'issue_description', Prompt: 'Describe the issue.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'What were the circumstances?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // ========== General Disclosures & Eligibility ==========
  'PACK_EMBARRASSMENT': [
    { Field_Key: 'issue_description', Prompt: 'Describe what could cause embarrassment.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'What are the circumstances?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'who_knows', Prompt: 'Who knows about this?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_TATTOO': [
    { Field_Key: 'tattoo_description', Prompt: 'Describe the visible tattoo.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'tattoo_location', Prompt: 'Where is it located on your body?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_obtained', Prompt: 'When did you get it?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'meaning', Prompt: 'What does it mean or represent?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_SOCIAL_MEDIA': [
    { Field_Key: 'content_description', Prompt: 'Describe the social media content.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'platform', Prompt: 'Which platform? (Facebook, Instagram, Twitter, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_posted', Prompt: 'When was it posted?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'context', Prompt: 'What was the context?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'still_visible', Prompt: 'Is it still visible/public?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this content?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_DOMESTIC': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'relationship', Prompt: 'What was your relationship to the other person?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'law_enforcement_involved', Prompt: 'Was law enforcement involved?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_PRIOR_LE': [
    { Field_Key: 'agency_name', Prompt: 'Which law enforcement agency did you work for?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'employment_dates', Prompt: 'When did you work there? (start and end dates)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'position', Prompt: 'What was your position?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reason_for_leaving', Prompt: 'Why did you leave?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'eligible_for_rehire', Prompt: 'Are you eligible for rehire?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ]
};

// Note: For all pack definitions, date fields have been changed to Expected_Type: 'TEXT' to preserve user input exactly as entered

// ============================================================================
// NO FOLLOW-UP QUESTIONS - EXEMPTED QUESTIONS
// These questions NEVER trigger follow-ups regardless of answer
// ============================================================================

const NO_FOLLOWUP_QUESTIONS = new Set([
  'Q161', // Citizenship - eligibility question only, no follow-up needed
  'Q162'  // Final disclosure - open-ended text response
]);

// ============================================================================
// VALIDATION HELPERS - SIMPLIFIED FOR TEXT-BASED DATES
// ============================================================================

export function validateFollowUpAnswer(value, expectedType, options = []) {
  const val = (value || '').trim();
  
  if (!val) return { valid: false, hint: 'Please provide an answer.' };
  
  switch (expectedType) {
    case 'BOOLEAN':
      return validateBoolean(val);
    case 'NUMBER':
      return validateNumber(val);
    case 'LOCATION':
      return validateLocation(val);
    case 'ENUM':
      return validateEnum(val, options);
    case 'TEXT':
    default:
      // All date fields are now TEXT - store exactly as entered
      return validateText(val);
  }
}

function validateBoolean(val) {
  const lower = val.toLowerCase();
  if (lower === 'yes' || lower === 'no') {
    return { valid: true, normalized: lower.charAt(0).toUpperCase() + lower.slice(1) };
  }
  return { valid: false, hint: 'Please answer "Yes" or "No".' };
}

function validateNumber(val) {
  const cleaned = val.replace(/[$,]/g, '');
  if (/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return { valid: true, normalized: cleaned };
  }
  return { valid: false, hint: 'Please enter a number (e.g., 100 or 10.50).' };
}

function validateLocation(val) {
  if (val.length >= 3) {
    return { valid: true, normalized: val };
  }
  return { valid: false, hint: 'Please enter the city, state, or best location details you can provide.' };
}

function validateEnum(val, options) {
  const lower = val.toLowerCase();
  const optionsLower = options.map(o => o.toLowerCase());
  
  if (optionsLower.includes(lower)) {
    return { valid: true, normalized: val };
  }
  
  return { valid: false, hint: `Please choose one of the listed options: ${options.join(', ')}.` };
}

function validateText(val) {
  if (val.length >= 1) {
    // Return text exactly as entered - no normalization
    return { valid: true, normalized: val };
  }
  return { valid: false, hint: 'Please add a short sentence with the details.' };
}

// ============================================================================
// SECTION-AWARE DATA STRUCTURES (NOW USES SECTION ENTITY)
// ============================================================================

/**
 * Builds section-aware data structures from Section and Question entities
 * This is the NEW core of the engine - section-first architecture using Section.section_order
 */
export function parseQuestionsToMaps(questions, sections, categories) {
  console.log('🏗️ Building section-first data structures from Section entities...');
  
  // Build SECTION_ORDER from Section entities sorted by section_order
  const activeSections = sections
    .filter(s => s.active !== false)
    .sort((a, b) => (a.section_order || 0) - (b.section_order || 0));
  
  const SECTION_ORDER = activeSections.map(s => s.section_id);
  
  console.log('📋 Section order from database:');
  activeSections.forEach(s => {
    console.log(`   ${s.section_order}. ${s.section_name} (${s.section_id})`);
  });
  
  // Create a set of active section IDs for quick lookup (using the database ID, not section_id string)
  const activeDbSectionIds = new Set(activeSections.map(s => s.id));
  
  // Legacy structures (kept for backward compatibility)
  const QById = {};
  const MatrixYesByQ = {};
  const UndefinedPacks = new Set();

  // NEW: Section-first structures
  const sectionOrder = [...SECTION_ORDER]; // This will contain section_id (string identifiers) in database order
  const sectionConfig = {}; // section_id (string) -> { section_order, mode, controlQuestionPosition, gate_question_id, active, section_name }
  const questionsBySection = {}; // section_id (string) -> [QuestionInSection]
  const questionIdToSection = {}; // question_id -> { sectionId: section_id (string), indexInSection }

  // Initialize section configs from Section entities
  activeSections.forEach(section => {
    const sectionId = section.section_id;
    sectionConfig[sectionId] = {
      id: sectionId, // string identifier (e.g. "DRIVING_RECORD")
      dbId: section.id, // numeric database ID (e.g. 1)
      section_name: section.section_name,
      section_order: section.section_order,
      mode: "always_show_all", // Default mode, will be updated by applySectionRules or Category entities
      controlQuestionPosition: null,
      gate_question_id: null, // Will be set from Categories for backward compatibility
      active: section.active !== false
    };
    questionsBySection[sectionId] = [];
  });

  // Apply gate question settings from Categories (for backward compatibility and overriding section defaults)
  categories.forEach(cat => {
    // Find corresponding section by its string identifier (section_id) matching category_label
    const matchingSection = activeSections.find(s => s.section_name === cat.category_label);
    if (matchingSection) {
      const sectionId = matchingSection.section_id;
      if (cat.gate_question_id && cat.gate_skip_if_value === 'No') {
        sectionConfig[sectionId].gate_question_id = cat.gate_question_id;
        sectionConfig[sectionId].mode = "skip_rest_if_control_no";
      } else if (cat.gate_question_id && cat.gate_skip_if_value !== 'No') {
        console.warn(`⚠️ Category "${cat.category_label}" has a gate question (${cat.gate_question_id}) but missing/incorrect 'gate_skip_if_value'. Expected 'No'. Gate rule for this section might be misconfigured.`);
      }
    }
  });

  // Group and sort questions by section - ONLY include questions from ACTIVE sections
  questions.forEach(q => {
    if (!q.active) return;

    QById[q.question_id] = q;

    // Find section object using q.section_id (the numeric database ID)
    const sectionEntity = sections.find(s => s.id === q.section_id);

    if (!sectionEntity) {
      console.warn(`⚠️ Question ${q.question_id} has section_id ${q.section_id} but no matching Section entity found - skipping`);
      return;
    }

    // Check if the section corresponding to the question's section_id (numeric) is active
    if (!activeDbSectionIds.has(sectionEntity.id)) {
      console.log(`⏭️ Skipping question ${q.question_id} - section "${sectionEntity.section_name}" (DB ID: ${sectionEntity.id}) is inactive or not in active Sections list.`);
      return;
    }
    
    const sectionIdString = sectionEntity.section_id; // This is the string identifier (e.g., "DRIVING_RECORD")

    questionsBySection[sectionIdString].push({
      question_id: q.question_id,
      section_id: sectionIdString,
      display_order: q.display_order || 0,
      active: q.active,
      next_question_id: q.next_question_id,
      question_text: q.question_text,
      followup_pack: q.followup_pack,
      response_type: q.response_type,
      substance_name: q.substance_name
    });

    // Legacy: Track follow-up packs
    if (q.followup_pack && q.response_type === 'yes_no') {
      MatrixYesByQ[q.question_id] = q.followup_pack;
      
      if (!FOLLOWUP_PACK_STEPS[q.followup_pack]) {
        UndefinedPacks.add(q.followup_pack);
      }
    }
  });

  // Sort questions within each section by display_order
  Object.keys(questionsBySection).forEach(sectionIdString => {
    questionsBySection[sectionIdString].sort((a, b) => {
      const orderDiff = a.display_order - b.display_order;
      if (orderDiff !== 0) return orderDiff;
      
      // Fallback to question_id numeric value
      const aNum = parseInt(a.question_id.replace(/[^\d]/g, '')) || 0;
      const bNum = parseInt(b.question_id.replace(/[^\d]/g, '')) || 0;
      return aNum - bNum;
    });

    // Build reverse index for fast lookup
    questionsBySection[sectionIdString].forEach((q, index) => {
      questionIdToSection[q.question_id] = {
        sectionId: sectionIdString,
        indexInSection: index
      };
    });

    // Set control question position if gate question is defined
    const sectionConf = sectionConfig[sectionIdString];
    if (sectionConf.gate_question_id) {
      const gateIndex = questionsBySection[sectionIdString].findIndex(q => q.question_id === sectionConf.gate_question_id);
      if (gateIndex !== -1) {
        sectionConf.controlQuestionPosition = gateIndex + 1; // 1-based
        console.log(`   🚪 Section ${sectionConf.section_name} (${sectionConf.id}): Gate question #${gateIndex + 1} (${sectionConf.gate_question_id})`);
      } else {
        console.warn(`⚠️ Gate question ${sectionConf.gate_question_id} not found in section "${sectionConf.section_name}"'s active questions - section gate rule will not function.`);
      }
    }
  });

  // Calculate TotalQuestions from active sections only
  let totalQuestionsInActiveSections = 0;
  Object.values(sectionConfig).forEach(section => {
    if (section.active && questionsBySection[section.id]) {
      totalQuestionsInActiveSections += questionsBySection[section.id].length;
    }
  });

  // Build ActiveOrdered for UI display number lookups ONLY
  const ActiveOrdered = [];
  Object.values(sectionConfig)
    .sort((a, b) => a.section_order - b.section_order)
    .forEach(section => {
      if (section.active && questionsBySection[section.id]) {
        questionsBySection[section.id].forEach(q => {
          ActiveOrdered.push(q.question_id);
        });
      }
    });

  console.log(`📊 Section-first structure built:`);
  console.log(`   - Sections in order: ${sectionOrder.length} (from Section entities)`);
  console.log(`   - Total active questions: ${totalQuestionsInActiveSections}`);
  
  Object.values(sectionConfig)
    .sort((a, b) => a.section_order - b.section_order)
    .forEach((cfg) => {
      const qCount = questionsBySection[cfg.id]?.length || 0;
      console.log(`   ${cfg.section_order}. ${cfg.section_name} (Active: ${cfg.active}): ${qCount} questions`);
    });

  if (UndefinedPacks.size > 0) {
    console.warn(`⚠️ Found ${UndefinedPacks.size} undefined packs during parsing:`, Array.from(UndefinedPacks));
  }

  return { 
    QById, 
    MatrixYesByQ, 
    UndefinedPacks,
    sectionOrder, // This is the list of section_id (strings) in order from DB
    sectionConfig, // This includes dynamic sections with high order
    questionsBySection,
    questionIdToSection,
    ActiveOrdered,
    TotalQuestions: totalQuestionsInActiveSections
  };
}

/**
 * Updates section configurations with Category entity data (for backward compatibility)
 */
export function applySectionRules(sectionConfig, questionsBySection, categories) {
  console.log('🔧 Applying section-level skip rules (legacy Category checks and logging)...');
  
  // Note: Gate questions are primarily set during parseQuestionsToMaps from Categories now.
  // This function is kept for logging and secondary validation/rules if needed.
  
  Object.values(sectionConfig).forEach(section => {
    const status = section.active ? '✅' : '⏸️';
    const qCount = questionsBySection[section.id]?.length || 0;
    console.log(`   ${status} [${section.section_order}] ${section.section_name}: ${qCount} questions`);
    if (section.gate_question_id) {
      console.log(`      🚪 Gate: ${section.gate_question_id} (skip rest if No, mode: ${section.mode})`);
    }
  });
}

export function parseFollowUpPacks() {
  const PackStepsById = {};

  Object.keys(FOLLOWUP_PACK_STEPS).forEach(packId => {
    PackStepsById[packId] = FOLLOWUP_PACK_STEPS[packId].map((step, idx) => ({
      ...step,
      Order: idx,
      FollowUpPack: packId
    }));
  });

  console.log(`📦 Loaded ${Object.keys(PackStepsById).length} follow-up packs from definitions`);

  return { PackStepsById };
}

export async function bootstrapEngine(base44) {
  console.log('🚀 Bootstrapping interview engine (SECTION-FIRST + DATABASE-DRIVEN)...');
  const startTime = performance.now();

  try {
    const [questions, sections, categories] = await Promise.all([
      base44.entities.Question.filter({ active: true }),
      base44.entities.Section.list(), // Fetch Section entities
      base44.entities.Category.list() // Still fetch Categories for gate question backward compatibility
    ]);

    const { 
      QById, 
      MatrixYesByQ, 
      UndefinedPacks,
      sectionOrder,
      sectionConfig,
      questionsBySection,
      questionIdToSection,
      ActiveOrdered,
      TotalQuestions
    } = parseQuestionsToMaps(questions, sections, categories);
    
    // Apply section-level rules (currently mainly logging/secondary checks)
    applySectionRules(sectionConfig, questionsBySection, categories);
    
    const { PackStepsById } = parseFollowUpPacks();
    
    const configValidation = validateEngineConfigurationInternal(MatrixYesByQ, PackStepsById, QById);
    if (!configValidation.valid) {
      console.warn('⚠️ Engine configuration warnings:', configValidation.errors.length, 'issues found');
      console.warn('   Questions with undefined packs will be treated as having no follow-ups');
      configValidation.errors.slice(0, 10).forEach(err => console.warn(`  - ${err}`));
      if (configValidation.errors.length > 10) {
        console.warn(`  ... and ${configValidation.errors.length - 10} more issues`);
      }
    } else {
      console.log('✅ Engine configuration validated - all packs defined');
    }

    const engineState = {
      QById,
      MatrixYesByQ,
      PackStepsById,
      Sections: sections, // Store all section entities
      Categories: categories, // Still store categories for potential legacy use or reporting
      sectionOrder,
      sectionConfig,
      questionsBySection,
      questionIdToSection,
      ActiveOrdered,
      Bootstrapped: true,
      TotalQuestions: TotalQuestions,
      UndefinedPacks: Array.from(UndefinedPacks),
      Architecture: 'section-first-db-driven'
    };

    const elapsed = performance.now() - startTime;
    console.log(`✅ Engine bootstrapped successfully in ${elapsed.toFixed(2)}ms`);
    console.log(`   - Architecture: SECTION-FIRST (Section entities)`);
    console.log(`   - Section order source: Section.section_order`);
    console.log(`   - Sections: ${Object.keys(sectionConfig).length}`);
    console.log(`   - Total active questions: ${TotalQuestions}`);
    console.log(`   - Questions with follow-ups: ${Object.keys(MatrixYesByQ).length}`);
    console.log(`   - Defined packs: ${Object.keys(PackStepsById).length}`);

    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      setTimeout(() => runEntityFollowupSelfTest(engineState), 500);
    }

    return engineState;
    
  } catch (err) {
    console.error('❌ CRITICAL: Engine bootstrap failed:', err);
    throw new Error(`Failed to bootstrap interview engine: ${err.message}`);
  }
}

// ============================================================================
// SECTION-AWARE QUESTION ROUTING (DATABASE-DRIVEN)
// ============================================================================

/**
 * NEW: Section-aware computeNextQuestionId
 * Uses Section.section_order from database for deterministic routing
 */
export function computeNextQuestionId(engine, currentQuestionId, answer) {
  console.log(`🔍 [SECTION-FIRST] Computing next question after ${currentQuestionId}, answer: "${answer}"`);
  
  // 1. Locate current section and index
  const location = engine.questionIdToSection[currentQuestionId];
  if (!location) {
    console.error(`❌ Question ${currentQuestionId} not found in section map.`);
    return null; // End or error state
  }

  const { sectionId, indexInSection } = location; // sectionId here is the string identifier (e.g. "DRIVING_RECORD")
  const section = engine.sectionConfig[sectionId];
  const questions = engine.questionsBySection[sectionId];
  const currentQuestion = questions[indexInSection];

  console.log(`   📍 Location: [${section.section_order}] ${section.section_name}, position #${indexInSection + 1}/${questions.length}`);
  console.log(`   🎯 Section mode: ${section.mode}`);

  // 2. Check section-level control question skip rule
  if (section.mode === "skip_rest_if_control_no" && 
      section.controlQuestionPosition !== null &&
      (indexInSection + 1) === section.controlQuestionPosition && // Check if current question is the gate question
      normalizeToYesNo(answer) === "No") {
    
    console.log(`   🚪 Control question answered No - skipping rest of [${section.section_order}] ${section.section_name}`);
    return firstQuestionIdOfNextSection(engine, sectionId);
  }

  // 3. Check intra-section next_question_id (same section only)
  if (currentQuestion.next_question_id) {
    const targetInSection = questions.find(q => q.question_id === currentQuestion.next_question_id);
    if (targetInSection) {
      console.log(`   ➡️ Intra-section branch to ${currentQuestion.next_question_id}`);
      return currentQuestion.next_question_id;
    } else {
      console.warn(`   ⚠️ Question ${currentQuestion.question_id} has next_question_id ${currentQuestion.next_question_id} which is not found in the same section. Proceeding to next question in sequence.`);
    }
  }

  // 4. Default: move to next question in this section
  const nextIndex = indexInSection + 1;
  if (nextIndex < questions.length) {
    const nextQ = questions[nextIndex];
    console.log(`   ✅ Next question in section: ${nextQ.question_id} (#${nextIndex + 1})`);
    return nextQ.question_id;
  }

  // 5. End of section -> first question of next active section
  console.log(`   🏁 End of [${section.section_order}] ${section.section_name} - moving to next available section.`);
  return firstQuestionIdOfNextSection(engine, sectionId);
}

/**
 * Find the first question ID of the next active section
 * Uses section_order from database for deterministic sequencing
 */
function firstQuestionIdOfNextSection(engine, currentSectionId) {
  const currentSection = engine.sectionConfig[currentSectionId];
  if (!currentSection) {
    console.error(`❌ Section "${currentSectionId}" not found in sectionConfig.`);
    return null;
  }

  const currentOrder = currentSection.section_order;
  
  console.log(`[SectionRouting] Current section: [${currentOrder}] "${currentSection.section_name}"`);
  
  // Find all sections with higher section_order, including dynamically added ones (order 999)
  const candidateSections = Object.values(engine.sectionConfig)
    .filter(s => s.section_order > currentOrder)
    .sort((a, b) => a.section_order - b.section_order);
  
  console.log(`[SectionRouting] Candidate sections (section_order > ${currentOrder}):`, 
    candidateSections.map(s => `[${s.section_order}] ${s.section_name}`));
  
  // Iterate through candidates in section_order sequence
  for (const candidateSection of candidateSections) {
    const candidateSectionId = candidateSection.id; // This is the STRING section_id (e.g., "CAT_DRUGS")
    const candidateQuestions = engine.questionsBySection[candidateSectionId] || [];
    
    console.log(`[SectionRouting]   Checking [${candidateSection.section_order}] "${candidateSection.section_name}" (ID: "${candidateSectionId}")`);
    console.log(`[SectionRouting]     - Active: ${candidateSection.active !== false}`);
    console.log(`[SectionRouting]     - Questions in questionsBySection: ${candidateQuestions.length}`);
    
    if (candidateQuestions.length > 0) {
      console.log(`[SectionRouting]     - First 3 questions:`, candidateQuestions.slice(0, 3).map(q => q.question_id));
    } else {
      console.warn(`[SectionRouting]     ⚠️ questionsBySection["${candidateSectionId}"] is empty or undefined`);
      console.warn(`[SectionRouting]     - Available keys in questionsBySection:`, Object.keys(engine.questionsBySection));
    }
    
    // Skip if section is explicitly inactive (from Section entity) OR has no active questions
    if (candidateSection.active === false) { 
      console.log(`[SectionRouting]     ⏸️ Section inactive - skipping.`);
      continue;
    }
    
    if (candidateQuestions.length === 0) {
      console.log(`[SectionRouting]     ⚠️ No questions in section - skipping.`);
      continue;
    }
    
    // Found a valid next section with active questions!
    const firstQ = candidateQuestions[0];
    console.log(`[SectionRouting]   ✅ Next active section found: [${candidateSection.section_order}] "${candidateSection.section_name}", first question: ${firstQ.question_id}`);
    return firstQ.question_id;
  }

  console.log(`[SectionRouting] 🏁 No more active sections with questions after [${currentOrder}] - interview complete.`);
  return null; // End of interview
}

/**
 * Helper: Normalize answer to Yes/No
 */
function normalizeToYesNo(answer) {
  const normalized = String(answer || '').trim().toLowerCase();
  if (normalized === 'yes' || normalized === 'y') return 'Yes';
  if (normalized === 'no' || normalized === 'n') return 'No';
  return answer;
}

// ============================================================================
// FOLLOW-UP TRIGGER LOGIC (UNCHANGED)
// ============================================================================

export function checkFollowUpTrigger(engine, questionId, answer) {
  const { MatrixYesByQ, PackStepsById, QById } = engine;

  console.log(`🔍 Entity-driven follow-up check for ${questionId}, answer="${answer}"`);

  // DEFENSIVE: Check exemption list first
  if (NO_FOLLOWUP_QUESTIONS.has(questionId)) {
    console.log(`   🚫 Question ${questionId} is exempted from follow-ups (eligibility/final disclosure)`);
    return null;
  }

  // DETERMINISTIC: Answer must be "Yes" AND Question.followup_pack must exist
  if (answer === 'Yes' && MatrixYesByQ[questionId]) {
    const packId = MatrixYesByQ[questionId];
    
    // ROBUSTNESS: If pack is undefined, log warning and return null
    if (!PackStepsById[packId]) {
      console.warn(`⚠️ Pack ${packId} referenced by ${questionId} is not defined - treating as no follow-up`);
      return null;
    }
    
    // NEW: Extract substance_name from Question entity if it exists
    const question = QById[questionId];
    const substanceName = question?.substance_name || null;
    
    console.log(`   ✅ Follow-up triggered: ${packId} (${PackStepsById[packId].length} steps)`);
    if (substanceName) {
      console.log(`   💊 Substance detected: ${substanceName} - will inject into PACK_DRUG_USE prompts`);
    }
    
    return { packId, substanceName };
  }

  console.log(`   ℹ️ No follow-up for this question`);
  return null;
}

// NEW: Function to inject substance name into follow-up pack steps
export function injectSubstanceIntoPackSteps(engine, packId, substanceName) {
  if (!engine.PackStepsById[packId]) {
    console.warn(`⚠️ Cannot inject substance - pack ${packId} not defined`);
    return [];
  }
  
  if (packId !== 'PACK_DRUG_USE' || !substanceName) {
    return engine.PackStepsById[packId];
  }
  
  console.log(`💉 Injecting "${substanceName}" into PACK_DRUG_USE prompts`);
  
  const originalSteps = engine.PackStepsById[packId];
  const injectedSteps = originalSteps.map(step => {
    const injectedPrompt = step.Prompt.replace(/\{substance\}/g, substanceName);
    
    if (step.Field_Key === 'substance_name' && step.Auto_Fill) {
      return {
        ...step,
        Prompt: injectedPrompt,
        PrefilledAnswer: substanceName
      };
    }
    
    return {
      ...step,
      Prompt: injectedPrompt
    };
  });
  
  return injectedSteps;
}

// NEW: Function to check if a follow-up step should be skipped
export function shouldSkipFollowUpStep(step, previousAnswers) {
  if (!step.Conditional_On || !step.Conditional_Skip_If) {
    return false;
  }
  
  const conditionalAnswer = previousAnswers[step.Conditional_On];
  if (!conditionalAnswer) {
    return false;
  }
  
  const skipValues = Array.isArray(step.Conditional_Skip_If) ? step.Conditional_Skip_If : [step.Conditional_Skip_If];
  const normalizedAnswer = String(conditionalAnswer).trim().toLowerCase();
  
  const shouldSkip = skipValues.some(skipValue => 
    normalizedAnswer === String(skipValue).trim().toLowerCase() ||
    normalizedAnswer.includes(String(skipValue).trim().toLowerCase())
  );
  
  if (shouldSkip) {
    console.log(`⏭️ Skipping conditional step: ${step.Field_Key} (${step.Conditional_On} = "${conditionalAnswer}")`);
  }
  
  return shouldSkip;
}

// NEW: Check if PACK_LE_APPS was hired (skip AI probing)
export function shouldSkipProbingForHired(packId, followUpAnswers) {
  if (packId !== 'PACK_LE_APPS') {
    return false;
  }
  
  const outcome = followUpAnswers['application_outcome'];
  if (!outcome) {
    return false;
  }
  
  const normalizedOutcome = String(outcome).trim().toLowerCase();
  const wasHired = normalizedOutcome === 'hired' || 
                   normalizedOutcome === 'i was hired' || 
                   normalizedOutcome === 'was hired' ||
                   normalizedOutcome.includes('hired');
  
  if (wasHired) {
    console.log(`✅ PACK_LE_APPS: Outcome was "hired" - skipping AI probing`);
  }
  
  return wasHired;
}

// ============================================================================
// COMPLETENESS VERIFICATION (UNCHANGED)
// ============================================================================

export function verifyPackCompletion(packId, transcript) {
  const packSteps = FOLLOWUP_PACK_STEPS[packId];
  if (!packSteps) {
    console.warn(`⚠️ Pack ${packId} not found`);
    return { complete: true, missing: [] };
  }

  const followupAnswers = transcript.filter(t => t.type === 'followup' && t.packId === packId);
  const missing = [];
  let currentAnswers = {};

  for (const step of packSteps) {
    const answeredEntry = followupAnswers.find(a => a.Field_Key === step.Field_Key);
    if (answeredEntry && answeredEntry.answer && String(answeredEntry.answer).trim() !== '') {
      currentAnswers[step.Field_Key] = answeredEntry.answer;
    }

    const shouldSkip = shouldSkipFollowUpStep(step, currentAnswers);
    if (shouldSkip) {
      continue; 
    }

    if (!answeredEntry || !answeredEntry.answer || String(answeredEntry.answer).trim() === '') {
      missing.push(step.Prompt);
    }
  }

  return {
    complete: missing.length === 0,
    missing
  };
}

export function generateCompletionAudit(engine, transcript) {
  let totalActiveQuestions = engine.TotalQuestions;

  const answeredQuestions = transcript.filter(t => t.type === 'question');
  const answeredQuestionIds = new Set(answeredQuestions.map(q => q.questionId));
  
  const triggeredPacks = new Set();
  const completedPacks = [];
  const incompletePacks = [];
  
  answeredQuestions.forEach(q => {
    const question = engine.QById[q.questionId];
    if (question && question.followup_pack && q.answer === 'Yes') {
      if (!NO_FOLLOWUP_QUESTIONS.has(q.questionId)) {
        triggeredPacks.add(question.followup_pack);
      }
    }
  });
  
  triggeredPacks.forEach(packId => {
    const verification = verifyPackCompletion(packId, transcript);
    if (verification.complete) {
      completedPacks.push(packId);
    } else {
      incompletePacks.push({
        packId,
        missing: verification.missing
      });
    }
  });

  let allRoutingPathQuestionsAnswered = true;
  if (answeredQuestions.length < totalActiveQuestions) {
     allRoutingPathQuestionsAnswered = false;
  }
  
  return {
    total_questions: totalActiveQuestions,
    answered_questions: answeredQuestions.length,
    completion_percentage: totalActiveQuestions > 0 ? Math.round((answeredQuestions.length / totalActiveQuestions) * 100) : 0,
    followup_packs_triggered: triggeredPacks.size,
    followup_packs_completed: completedPacks.length,
    incomplete_packs: incompletePacks,
    is_complete: (answeredQuestions.length === totalActiveQuestions && incompletePacks.length === 0),
    timestamp: new Date().toISOString()
  };
}

function validateEngineConfigurationInternal(MatrixYesByQ, PackStepsById, QById) {
  const errors = [];
  
  Object.keys(MatrixYesByQ).forEach(questionId => {
    const packId = MatrixYesByQ[questionId];
    if (!PackStepsById[packId]) {
      errors.push(`Question ${questionId} references undefined pack: ${packId}`);
    }
  });
  
  Object.keys(PackStepsById).forEach(packId => {
    const steps = PackStepsById[packId];
    if (!steps || steps.length === 0) {
      errors.push(`Pack ${packId} has no steps defined.`);
    }
  });
  
  return {
    valid: errors.length === 0,
    errors
  };
}

export function validateEngineConfiguration(engine) {
  return validateEngineConfigurationInternal(
    engine.MatrixYesByQ,
    engine.PackStepsById,
    engine.QById
  );
}

// ============================================================================
// SELF-TEST (UPDATED FOR SECTION ENTITIES)
// ============================================================================

export function runEntityFollowupSelfTest(engine) {
  console.log('🧪 Running Section-First (DB-Driven) Self-Test...');
  console.log('📋 Testing section-aware routing with Section.section_order...');
  
  const results = [];
  const { sectionConfig, questionsBySection, MatrixYesByQ, PackStepsById } = engine;
  
  console.log('\n📊 Section Structure (from Section.section_order):');
  Object.values(sectionConfig)
    .sort((a, b) => a.section_order - b.section_order)
    .forEach(section => {
      const questions = questionsBySection[section.id] || [];
      console.log(`   ${section.section_order}. ${section.section_name} (${section.id}):`);
      console.log(`      - Questions: ${questions.length}`);
      console.log(`      - Active: ${section.active !== false ? 'Yes' : 'No'}`);
      console.log(`      - Mode: ${section.mode}`);
      if (section.gate_question_id) {
        const gateQExists = questions.some(q => q.question_id === section.gate_question_id);
        console.log(`      - Gate Question: ${section.gate_question_id} (Exists in section: ${gateQExists ? '✅' : '❌'})`);
        if (!gateQExists) {
          results.push({
            Test: 'Section Gate Question Existence',
            Section: section.section_name,
            Question: section.gate_question_id,
            Status: '❌ FAIL',
            Details: 'Gate question defined for section not found within its active questions.'
          });
        }
      } else if (section.mode === "skip_rest_if_control_no") {
         results.push({
            Test: 'Section Gate Question Definition',
            Section: section.section_name,
            Question: 'N/A',
            Status: '❌ FAIL',
            Details: 'Section mode is "skip_rest_if_control_no" but no gate_question_id is defined.'
          });
      }
    });
  
  const packMappingResults = [];
  Object.keys(MatrixYesByQ).forEach(questionId => {
    const packId = MatrixYesByQ[questionId];
    const packExists = PackStepsById[packId] !== undefined;
    const location = engine.questionIdToSection[questionId];
    const sectionConf = location ? engine.sectionConfig[location.sectionId] : null;
    
    packMappingResults.push({
      Question: questionId,
      Section: sectionConf?.section_name || 'Unknown',
      Order: sectionConf ? `[${sectionConf.section_order}]` : '?',
      Position: location ? `#${location.indexInSection + 1}` : '?',
      Pack: packId,
      PackDefined: packExists ? '✅ YES' : '⚠️ NO',
      Status: packExists ? '✅ PASS' : '⚠️ WARN'
    });
    if (!packExists) {
      results.push({
        Test: 'Follow-Up Pack Definition',
        Question: questionId,
        Pack: packId,
        Status: '⚠️ WARN',
        Details: 'Referenced follow-up pack is not defined in FOLLOWUP_PACK_STEPS.'
      });
    }
  });
  
  console.log('\n📋 Follow-Up Pack Mappings:');
  console.table(packMappingResults);
  
  const failures = results.filter(r => r.Status === '❌ FAIL');
  const warnings = results.filter(r => r.Status === '⚠️ WARN');
  
  console.log(`\n📊 Summary:`);
  console.log(`   Architecture: SECTION-FIRST (Section entities)`);
  console.log(`   Section order source: Section.section_order`);
  console.log(`   Sections: ${Object.keys(sectionConfig).length}`);
  console.log(`   Total active questions: ${engine.TotalQuestions}`);
  console.log(`   Questions with follow-ups: ${Object.keys(MatrixYesByQ).length}`);
  console.log(`   Defined packs: ${Object.keys(PackStepsById).length}`);
  console.log(`   Tests run: ${results.length}`);
  console.log(`   Failures: ${failures.length}`);
  console.log(`   Warnings: ${warnings.length}`);
  
  if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} CRITICAL FAILURES DETECTED:`);
    failures.forEach(f => console.error(`   - ${f.Test} in ${f.Section || f.Question}: ${f.Details}`));
    return { passed: false, failures: failures.length, warnings: warnings.length, results };
  } else if (warnings.length > 0) {
    console.warn(`\n⚠️ ${warnings.length} WARNINGS DETECTED (non-fatal):`);
    warnings.forEach(f => console.warn(`   - ${f.Test} in ${f.Section || f.Question}: ${f.Details}`));
    return { passed: true, warnings: warnings.length, results };
  } else {
    console.log(`\n✅ ALL TESTS PASSED - DATABASE-DRIVEN SECTION ORDER WORKING`);
    return { passed: true, warnings: 0, results };
  }
}

// Make it globally accessible for console testing
if (typeof window !== 'undefined') {
  window.runEntityFollowupSelfTest = (engine) => {
    if (!engine || !engine.Bootstrapped) {
      console.error('❌ Engine not bootstrapped. Navigate to an interview page first.');
      return;
    }
    return runEntityFollowupSelfTest(engine);
  };
}
