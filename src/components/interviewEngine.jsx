/**
 * ClearQuest Interview Engine - ENTITY-DRIVEN ARCHITECTURE
 * Deterministic, zero-AI question routing
 * SOURCE OF TRUTH: Base44 Question Entity (followup_pack field)
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

  'PACK_FELONY': [
    { Field_Key: 'felony_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'felony_type', Prompt: 'What was the felony?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
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

  'PACK_TRESPASSING': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did this take place?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'property_type', Prompt: 'What type of property was it? (building, residence, land, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'What were the circumstances? Why did you enter?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'Were you arrested or charged? If so, what was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
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

  // ========== Sexual Activities ==========
  'PACK_PROSTITUTION': [
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did this occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
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
    { Field_Key: 'location', Prompt: 'Where did this occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
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
    { Field_Key: 'dependency_period', Prompt: 'During what time period did you have alcohol dependency?', Response_Type: 'text', Expected_Type: 'TEXT' },
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
    { Field_Key: 'when_occurred', Prompt: 'When did you provide alcohol to someone under 21?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'recipient_age', Prompt: 'How old was the person?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'Were there any legal consequences?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // ========== Military History ==========
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

  'PACK_THEFT': [
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did it occur? (employer, store, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'what_stolen', Prompt: 'What was stolen?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'value', Prompt: 'What was the approximate value?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
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
  ]
};

// Note: For all pack definitions, date fields have been changed to Expected_Type: 'TEXT' to preserve user input exactly as entered

// ============================================================================
// SKIP RULES
// ============================================================================

const SKIP_RULES = {
  'Q001': {
    skipIfAnswer: 'No',
    skipToQuestion: 'Q005'
  },
  // NEW: Gateway for Other Law Enforcement Applications section
  // If user has never applied to other LE agencies, skip to next section
  'Q002': {
    skipIfAnswer: 'No',
    skipToQuestion: 'Q006'
  },
  // NEW: Gateway for Prior Law Enforcement Employment section  
  // If user has never worked for LE, skip to next section
  'Q163': {
    skipIfAnswer: 'No',
    skipToQuestion: 'Q181'
  },
  // NEW: Gateway for Military History section
  // If user never served in military, skip military questions
  'Q145': {
    skipIfAnswer: 'No',
    skipToQuestion: 'Q163'
  }
};

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
// DATA LOADING & CACHING (ENTITY-DRIVEN)
// ============================================================================

export function parseQuestionsToMaps(questions) {
  const QById = {};
  const NextById = {};
  const ActiveOrdered = [];
  const MatrixYesByQ = {};
  const UndefinedPacks = new Set(); // Track undefined packs for warnings

  const sorted = [...questions].sort((a, b) => a.display_order - b.display_order);

  sorted.forEach((q, index) => {
    if (!q.active) return;

    QById[q.question_id] = q;
    ActiveOrdered.push(q.question_id);

    if (q.next_question_id) {
      NextById[q.question_id] = q.next_question_id;
    } else if (index + 1 < sorted.length) {
      const nextActive = sorted.slice(index + 1).find(nq => nq.active);
      if (nextActive) {
        NextById[q.question_id] = nextActive.question_id;
      }
    }

    // ENTITY-DRIVEN: Use Question.followup_pack field DIRECTLY
    // ROBUSTNESS: Don't fail if pack is undefined - just log warning
    if (q.followup_pack && q.response_type === 'yes_no') {
      MatrixYesByQ[q.question_id] = q.followup_pack;
      
      // Check if pack is defined
      if (!FOLLOWUP_PACK_STEPS[q.followup_pack]) {
        UndefinedPacks.add(q.followup_pack);
        console.warn(`⚠️ Question ${q.question_id} references undefined pack: ${q.followup_pack} (will be treated as no follow-up)`);
      } else {
        console.log(`🗺️ Entity mapping: ${q.question_id} -> ${q.followup_pack}`);
      }
    }
  });

  if (UndefinedPacks.size > 0) {
    console.warn(`⚠️ Found ${UndefinedPacks.size} undefined packs referenced by questions:`, Array.from(UndefinedPacks));
    console.warn(`   These questions will be treated as having no follow-up packs.`);
  }

  console.log(`📊 MatrixYesByQ built from Question entities: ${Object.keys(MatrixYesByQ).length} mappings`);

  return { QById, NextById, ActiveOrdered, MatrixYesByQ, UndefinedPacks };
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
  console.log('🚀 Bootstrapping interview engine (entity-driven architecture)...');
  const startTime = performance.now();

  try {
    const [questions, categories] = await Promise.all([
      base44.entities.Question.filter({ active: true }),
      base44.entities.Category.filter({ active: true })
    ]);

    const { QById, NextById, ActiveOrdered, MatrixYesByQ, UndefinedPacks } = parseQuestionsToMaps(questions);
    const { PackStepsById } = parseFollowUpPacks();
    
    // ROBUSTNESS: Log configuration issues but DON'T fail
    const configValidation = validateEngineConfigurationInternal(MatrixYesByQ, PackStepsById, QById);
    if (!configValidation.valid) {
      console.warn('⚠️ Engine configuration warnings:', configValidation.errors.length, 'issues found');
      console.warn('   Questions with undefined packs will be treated as having no follow-ups');
      
      // Only log first 10 errors to avoid console spam
      configValidation.errors.slice(0, 10).forEach(err => console.warn(`  - ${err}`));
      if (configValidation.errors.length > 10) {
        console.warn(`  ... and ${configValidation.errors.length - 10} more issues`);
      }
    } else {
      console.log('✅ Engine configuration validated - all packs defined');
    }

    const engineState = {
      QById,
      NextById,
      ActiveOrdered,
      MatrixYesByQ,
      PackStepsById,
      Q113OptionMap: {},
      Categories: categories,
      Bootstrapped: true,
      TotalQuestions: ActiveOrdered.length,
      UndefinedPacks: Array.from(UndefinedPacks) // For diagnostics
    };

    const elapsed = performance.now() - startTime;
    console.log(`✅ Engine bootstrapped successfully in ${elapsed.toFixed(2)}ms`);
    console.log(`   - Total questions: ${ActiveOrdered.length}`);
    console.log(`   - Questions with follow-ups: ${Object.keys(MatrixYesByQ).length}`);
    console.log(`   - Defined packs: ${Object.keys(PackStepsById).length}`);
    console.log(`   - Undefined packs: ${UndefinedPacks.size}`);

    // Auto-run self-test in dev mode
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
// DETERMINISTIC TRIGGER LOGIC (Single Function - Entity-Driven)
// ============================================================================

export function computeNextQuestionId(engine, currentQuestionId, answer) {
  const { NextById, ActiveOrdered } = engine;

  console.log(`🔍 computeNextQuestionId called for ${currentQuestionId}, answer: ${answer}`);
  console.log(`   - Skip rules defined: ${!!SKIP_RULES[currentQuestionId]}`);
  console.log(`   - Has explicit next_question_id: ${!!NextById[currentQuestionId]}`);
  console.log(`   - Position in ActiveOrdered: ${ActiveOrdered.indexOf(currentQuestionId)} of ${ActiveOrdered.length}`);

  // Check skip rules first
  const skipRule = SKIP_RULES[currentQuestionId];
  if (skipRule && answer === skipRule.skipIfAnswer) {
    console.log(`⏭️ Skip rule triggered: ${currentQuestionId} -> ${skipRule.skipToQuestion}`);
    return skipRule.skipToQuestion;
  }

  // Use explicit next_question_id if defined
  if (NextById[currentQuestionId]) {
    console.log(`✅ Using explicit next_question_id: ${NextById[currentQuestionId]}`);
    return NextById[currentQuestionId];
  }

  // Fall back to display order
  const currentIndex = ActiveOrdered.indexOf(currentQuestionId);
  if (currentIndex >= 0 && currentIndex < ActiveOrdered.length - 1) {
    const nextId = ActiveOrdered[currentIndex + 1];
    console.log(`✅ Using display order - next question: ${nextId}`);
    return nextId;
  }
  
  // CRITICAL: If we're at the last position in ActiveOrdered, that's expected
  if (currentIndex === ActiveOrdered.length - 1) {
    console.log(`✅ At last question in ActiveOrdered (position ${currentIndex + 1}/${ActiveOrdered.length}) - no next question`);
  } else {
    console.error(`❌ Question ${currentQuestionId} not found in ActiveOrdered array!`);
  }

  return null;
}

// ROBUSTNESS UPDATE: Gracefully handle undefined packs - don't crash
export function checkFollowUpTrigger(engine, questionId, answer) {
  const { MatrixYesByQ, PackStepsById, QById } = engine;

  console.log(`🔍 Entity-driven follow-up check for ${questionId}, answer="${answer}"`);

  // DETERMINISTIC: Answer must be "Yes" AND Question.followup_pack must exist
  if (answer === 'Yes' && MatrixYesByQ[questionId]) {
    const packId = MatrixYesByQ[questionId];
    
    // ROBUSTNESS: If pack is undefined, log warning and return null (no follow-up)
    if (!PackStepsById[packId]) {
      console.warn(`⚠️ Pack ${packId} referenced by ${questionId} is not defined - treating as no follow-up`);
      console.warn(`   Question will proceed to next base question without follow-up pack`);
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
  // ROBUSTNESS: Handle undefined pack gracefully
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
    // Replace {substance} placeholder with actual substance name
    const injectedPrompt = step.Prompt.replace(/\{substance\}/g, substanceName);
    
    // Auto-fill the substance_name field if it's the first step
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

// NEW: Function to check if a follow-up step should be skipped based on conditional logic
export function shouldSkipFollowUpStep(step, previousAnswers) {
  // Check if this step has conditional logic
  if (!step.Conditional_On || !step.Conditional_Skip_If) {
    return false; // No conditional logic, don't skip
  }
  
  // Find the answer to the conditional field
  const conditionalAnswer = previousAnswers[step.Conditional_On];
  
  if (!conditionalAnswer) {
    return false; // No answer yet, don't skip
  }
  
  // Check if the answer matches any of the skip values
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
    return false; // Only applies to PACK_LE_APPS
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
// ENTITY-BASED SELF-TEST (Console-Runnable)
// ============================================================================

export function runEntityFollowupSelfTest(engine) {
  console.log('🧪 Running Entity-Driven Follow-Up Self-Test...');
  console.log('📋 Source: Question.followup_pack field values');
  
  const results = [];
  const { MatrixYesByQ, PackStepsById, QById } = engine;
  
  // Test 1: Verify all Question.followup_pack values have pack definitions
  Object.keys(MatrixYesByQ).forEach(questionId => {
    const packId = MatrixYesByQ[questionId];
    const packExists = PackStepsById[packId] !== undefined;
    const question = QById[questionId];
    
    results.push({
      Question: questionId,
      Category: question?.category || 'Unknown',
      Pack: packId,
      PackDefined: packExists ? '✅ YES' : '⚠️ NO',
      StepCount: packExists ? PackStepsById[packId].length : 0,
      Status: packExists ? '✅ PASS' : '⚠️ WARN'
    });
  });
  
  // Test 2: Simulate "Yes" answers and verify triggers
  console.log('\n📊 Simulating "Yes" answers for all questions with follow-up packs...\n');
  
  Object.keys(MatrixYesByQ).forEach(questionId => {
    const expectedPack = MatrixYesByQ[questionId];
    const triggerResult = checkFollowUpTrigger(engine, questionId, 'Yes');
    const triggeredPack = triggerResult?.packId || null;
    
    if (triggeredPack !== expectedPack && PackStepsById[expectedPack]) {
      console.error(`❌ MISMATCH: ${questionId} expected ${expectedPack}, got ${triggeredPack}`);
    }
  });
  
  console.table(results);
  
  const warnings = results.filter(r => r.Status === '⚠️ WARN');
  const totalMappings = Object.keys(MatrixYesByQ).length;
  const uniquePacks = new Set(Object.values(MatrixYesByQ)).size;
  
  console.log(`\n📊 Summary:`);
  console.log(`   Questions with follow-ups: ${totalMappings}`);
  console.log(`   Unique packs referenced: ${uniquePacks}`);
  console.log(`   Packs defined: ${Object.keys(PackStepsById).length}`);
  console.log(`   Tests passed: ${results.length - warnings.length}`);
  console.log(`   Warnings (undefined packs): ${warnings.length}`);
  
  if (warnings.length > 0) {
    console.warn(`\n⚠️ ${warnings.length} PACKS MISSING DEFINITIONS (non-fatal):`);
    warnings.forEach(f => {
      console.warn(`   - ${f.Pack} (referenced by ${f.Question})`);
    });
    return { passed: true, warnings: warnings.length, results, missingPacks: warnings.map(f => f.Pack) };
  } else {
    console.log(`\n✅ ALL ${results.length} TESTS PASSED - SYSTEM HEALTHY`);
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

// ============================================================================
// COMPLETENESS VERIFICATION (No AI)
// ============================================================================

export function verifyPackCompletion(packId, transcript) {
  const packSteps = FOLLOWUP_PACK_STEPS[packId];
  if (!packSteps) {
    console.warn(`⚠️ Pack ${packId} not found`);
    return { complete: true, missing: [] };
  }

  const followupAnswers = transcript.filter(t => t.type === 'followup' && t.packId === packId);
  const missing = [];
  let currentAnswers = {}; // To store answers for conditional logic within a pack

  for (const step of packSteps) {
    const shouldSkip = shouldSkipFollowUpStep(step, currentAnswers);
    if (shouldSkip) {
      // If a step is skipped, it's considered "complete" for the purpose of this pack
      // We don't add it to missing, and it won't be in the transcript.
      continue; 
    }

    const answered = followupAnswers.find(a => a.questionText === step.Prompt);
    if (!answered || !answered.answer || String(answered.answer).trim() === '') {
      missing.push(step.Prompt);
    } else {
      currentAnswers[step.Field_Key] = answered.answer; // Store answer for subsequent conditional steps
    }
  }

  return {
    complete: missing.length === 0,
    missing
  };
}

export function generateCompletionAudit(engine, transcript) {
  const totalQuestions = engine.TotalQuestions;
  const answeredQuestions = transcript.filter(t => t.type === 'question');
  
  const triggeredPacks = new Set();
  const completedPacks = [];
  const incompletePacks = [];
  
  answeredQuestions.forEach(q => {
    const question = engine.QById[q.questionId];
    if (question && question.followup_pack && q.answer === 'Yes') {
      triggeredPacks.add(question.followup_pack);
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
  
  return {
    total_questions: totalQuestions,
    answered_questions: answeredQuestions.length,
    completion_percentage: Math.round((answeredQuestions.length / totalQuestions) * 100),
    followup_packs_triggered: triggeredPacks.size,
    followup_packs_completed: completedPacks.length,
    incomplete_packs: incompletePacks,
    is_complete: answeredQuestions.length === totalQuestions && incompletePacks.length === 0,
    timestamp: new Date().toISOString()
  };
}

function validateEngineConfigurationInternal(MatrixYesByQ, PackStepsById, QById) {
  const errors = [];
  
  // ROBUSTNESS: Check that all referenced packs exist, but don't make it fatal
  Object.keys(MatrixYesByQ).forEach(questionId => {
    const packId = MatrixYesByQ[questionId];
    if (!PackStepsById[packId]) {
      errors.push(`Question ${questionId} references undefined pack: ${packId}`);
    }
  });
  
  // Check that all packs have steps
  Object.keys(PackStepsById).forEach(packId => {
    const steps = PackStepsById[packId];
    if (!steps || steps.length === 0) {
      errors.push(`Pack ${packId} has no steps`);
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