/**
 * ClearQuest Interview Engine
 * Deterministic, zero-AI question routing with precomputed lookups
 * COMPLETE FOLLOW-UP PACK DEFINITIONS - All 60+ Packs Implemented
 */

// ============================================================================
// COMPLETE FOLLOW-UP PACK DEFINITIONS
// ============================================================================

const FOLLOWUP_PACK_STEPS = {
  // Applications with Other LE Agencies
  'PACK_LE_APPS': [
    { Field_Key: 'agency_name', Prompt: 'What was the name of the law enforcement agency you applied to?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'application_date', Prompt: 'When did you apply?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'application_outcome', Prompt: 'What was the outcome of your application?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reason_not_hired', Prompt: 'If not hired, what was the reason given?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],
  
  'PACK_WITHHOLD_INFO': [
    { Field_Key: 'what_withheld', Prompt: 'What information did you withhold?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'which_agency', Prompt: 'Which agency or agencies?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why_withheld', Prompt: 'Why did you withhold this information?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this decision?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],
  
  'PACK_DISQUALIFIED': [
    { Field_Key: 'agency_name', Prompt: 'Which agency disqualified you?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'reason_given', Prompt: 'What reason were you given for the disqualification?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'what_learned', Prompt: 'What have you learned or changed since then?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],
  
  'PACK_CHEATING': [
    { Field_Key: 'which_test', Prompt: 'Which test or portion did you cheat on?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'how_cheated', Prompt: 'How did you cheat?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // Driving Record
  'PACK_DUI': [
    { Field_Key: 'dui_date', Prompt: 'When did the DUI occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'bac_level', Prompt: 'What was your BAC level?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_LICENSE_SUSPENSION': [
    { Field_Key: 'suspension_date', Prompt: 'When was your license suspended?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'reason', Prompt: 'What was the reason for suspension?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'duration', Prompt: 'How long was the suspension?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reinstated', Prompt: 'Has your license been reinstated?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_RECKLESS_DRIVING': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'description', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_DRIVE_NO_INSURANCE': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'why_no_insurance', Prompt: 'Why were you driving without insurance?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_COLLISION': [
    { Field_Key: 'collision_date', Prompt: 'When did the collision occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'collision_location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'at_fault', Prompt: 'Were you at fault?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],
  
  'PACK_COLLISION_INJURY': [
    { Field_Key: 'injuries', Prompt: 'Describe the injuries sustained.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'fatalities', Prompt: 'Were there any fatalities?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],
  
  'PACK_ALCOHOL_COLLISION': [
    { Field_Key: 'collision_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'bac_level', Prompt: 'What was your BAC level, if known?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'charges_filed', Prompt: 'Were any charges filed?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],
  
  'PACK_UNREPORTED_COLLISION': [
    { Field_Key: 'collision_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'why_unreported', Prompt: 'Why was it not reported?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'damages', Prompt: 'Describe any damages or injuries.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for not reporting it?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],
  
  'PACK_HIT_RUN': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'why_left', Prompt: 'Why did you leave the scene?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reported_later', Prompt: 'Did you report it later?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],
  
  'PACK_HIT_RUN_DAMAGE': [
    { Field_Key: 'injuries', Prompt: 'Describe any injuries.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'property_damage', Prompt: 'Describe property damage.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_consequences', Prompt: 'Were there legal consequences?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_TRAFFIC': [
    { Field_Key: 'traffic_date', Prompt: 'When did this traffic violation occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'traffic_type', Prompt: 'What was the violation?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'traffic_outcome', Prompt: 'What was the outcome or penalty?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // Criminal Involvement
  'PACK_FIGHT': [
    { Field_Key: 'fight_date', Prompt: 'When did the fight occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'fight_location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'fight_description', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'injuries', Prompt: 'Were there any injuries?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'police_involved', Prompt: 'Was law enforcement involved?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_ARREST': [
    { Field_Key: 'arrest_date', Prompt: 'When were you arrested?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'arrest_location', Prompt: 'Where did this occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'arrest_charge', Prompt: 'What were you charged with?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'arrest_outcome', Prompt: 'What was the outcome of the case?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_CRIMINAL_CHARGE': [
    { Field_Key: 'charge_date', Prompt: 'When were you charged?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'charge_type', Prompt: 'What were you charged with?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_FELONY': [
    { Field_Key: 'felony_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'felony_type', Prompt: 'What was the felony charge?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'conviction', Prompt: 'Were you convicted?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'sentence', Prompt: 'What was the sentence?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_WARRANT': [
    { Field_Key: 'warrant_date', Prompt: 'When was the warrant issued?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'warrant_reason', Prompt: 'What was the warrant for?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'resolved', Prompt: 'Has it been resolved?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'how_resolved', Prompt: 'How was it resolved?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_PROTECTIVE_ORDER': [
    { Field_Key: 'order_date', Prompt: 'When was the order issued?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'still_active', Prompt: 'Is it still active?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_GANG': [
    { Field_Key: 'gang_name', Prompt: 'What was the name of the gang?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'dates_involved', Prompt: 'When were you involved?', Response_Type: 'text', Expected_Type: 'DATERANGE' },
    { Field_Key: 'level_involvement', Prompt: 'What was your level of involvement?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'criminal_activity', Prompt: 'Were you involved in any criminal activity?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why_left', Prompt: 'Why did you leave?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'current_contact', Prompt: 'Do you still have contact with members?', Response_Type: 'text', Expected_Type: 'BOOLEAN' }
  ],

  'PACK_WEAPON_VIOLATION': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'weapon_type', Prompt: 'What type of weapon?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_DOMESTIC': [
    { Field_Key: 'domestic_date', Prompt: 'When did this incident occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'domestic_description', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'domestic_outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // Extremist Organizations
  'PACK_EXTREMIST': [
    { Field_Key: 'organization_name', Prompt: 'What was the name of the organization?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'dates_involved', Prompt: 'When were you involved?', Response_Type: 'text', Expected_Type: 'DATERANGE' },
    { Field_Key: 'level_involvement', Prompt: 'What was your level of involvement?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why_joined', Prompt: 'Why did you join?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why_left', Prompt: 'Why did you leave?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'current_contact', Prompt: 'Do you still have contact with members?', Response_Type: 'text', Expected_Type: 'BOOLEAN' }
  ],

  // Sexual Activities
  'PACK_PROSTITUTION': [
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATERANGE' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'Was there any legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_PORNOGRAPHY': [
    { Field_Key: 'type_involved', Prompt: 'What type of pornography?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATERANGE' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'Was there any legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_HARASSMENT': [
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'victim_relationship', Prompt: 'What was your relationship to the person?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'description', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'Was there any legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_ASSAULT': [
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'victim_relationship', Prompt: 'What was your relationship to the person?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'description', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_MINOR_CONTACT': [
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'ages_involved', Prompt: 'What were the ages involved?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'description', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'Was there any legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // Financial History
  'PACK_FINANCIAL': [
    { Field_Key: 'financial_issue', Prompt: 'What was the financial issue?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'financial_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'financial_amount', Prompt: 'What was the amount involved?', Response_Type: 'text', Expected_Type: 'NUMBER' },
    { Field_Key: 'financial_status', Prompt: 'What is the current status?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_BANKRUPTCY': [
    { Field_Key: 'bankruptcy_date', Prompt: 'When did you file for bankruptcy?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'chapter', Prompt: 'What chapter bankruptcy?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'amount', Prompt: 'What was the total amount of debt?', Response_Type: 'text', Expected_Type: 'NUMBER' },
    { Field_Key: 'status', Prompt: 'What is the current status?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_FORECLOSURE': [
    { Field_Key: 'foreclosure_date', Prompt: 'When did the foreclosure occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'property_address', Prompt: 'What was the property address?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'amount_owed', Prompt: 'How much was owed?', Response_Type: 'text', Expected_Type: 'NUMBER' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_REPOSSESSION': [
    { Field_Key: 'repossession_date', Prompt: 'When was the property repossessed?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'property_type', Prompt: 'What was repossessed?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'amount_owed', Prompt: 'How much was owed?', Response_Type: 'text', Expected_Type: 'NUMBER' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_LAWSUIT': [
    { Field_Key: 'lawsuit_date', Prompt: 'When was the lawsuit filed?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'lawsuit_type', Prompt: 'What type of lawsuit?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'amount', Prompt: 'What was the amount?', Response_Type: 'text', Expected_Type: 'NUMBER' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_LATE_PAYMENT': [
    { Field_Key: 'when_occurred', Prompt: 'When did the late payments occur?', Response_Type: 'text', Expected_Type: 'DATERANGE' },
    { Field_Key: 'creditor', Prompt: 'Who was the creditor?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'amount', Prompt: 'What was the amount?', Response_Type: 'text', Expected_Type: 'NUMBER' },
    { Field_Key: 'status', Prompt: 'What is the current status?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_GAMBLING': [
    { Field_Key: 'when_occurred', Prompt: 'When did the gambling problem occur?', Response_Type: 'text', Expected_Type: 'DATERANGE' },
    { Field_Key: 'amount_lost', Prompt: 'Approximately how much did you lose?', Response_Type: 'text', Expected_Type: 'NUMBER' },
    { Field_Key: 'impact', Prompt: 'How did it impact your finances?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'treatment', Prompt: 'Did you seek treatment?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'current_status', Prompt: 'What is your current status with gambling?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_FAILED_PAY_DEBT': [
    { Field_Key: 'creditor_name', Prompt: 'Who was the creditor or company you owed?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'debt_amount', Prompt: 'What was the amount of the debt?', Response_Type: 'text', Expected_Type: 'NUMBER' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATERANGE' },
    { Field_Key: 'why_not_paid', Prompt: 'Why did you choose not to pay even though you had the resources?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'current_status', Prompt: 'What is the current status of this debt?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this decision?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_TAX_NOT_FILED': [
    { Field_Key: 'years_not_filed', Prompt: 'Which year(s) did you not file a tax return?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why_not_filed', Prompt: 'Why did you not file?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'since_filed', Prompt: 'Have you since filed these returns?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'when_filed', Prompt: 'If yes, when did you file them?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'penalties', Prompt: 'Were there any penalties or consequences?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // Drug Use
  'PACK_DRUG_USE': [
    { Field_Key: 'substance_name', Prompt: 'What substance did you use?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'first_use_date', Prompt: 'When did you first use it?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'last_use_date', Prompt: 'When was the last time you used it?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'frequency', Prompt: 'How often did you use it?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances of your use.', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_DRUG_SALE': [
    { Field_Key: 'substance_sold', Prompt: 'What substance did you sell?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATERANGE' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'Was there any legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_PRESCRIPTION_MISUSE': [
    { Field_Key: 'medication_name', Prompt: 'What medication did you misuse?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATERANGE' },
    { Field_Key: 'how_obtained', Prompt: 'How did you obtain it?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // Alcohol
  'PACK_ALCOHOL_DEPENDENCY': [
    { Field_Key: 'when_occurred', Prompt: 'When did the alcohol dependency occur?', Response_Type: 'text', Expected_Type: 'DATERANGE' },
    { Field_Key: 'severity', Prompt: 'How severe was the dependency?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'treatment_sought', Prompt: 'Did you seek treatment?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'treatment_details', Prompt: 'If yes, describe the treatment.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'current_status', Prompt: 'What is your current status?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_ALCOHOL_INCIDENT': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'description', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'Was there any legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // Military
  'PACK_MIL_DISCHARGE': [
    { Field_Key: 'discharge_type', Prompt: 'What type of discharge did you receive?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'discharge_date', Prompt: 'When were you discharged?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'discharge_reason', Prompt: 'What was the reason for your discharge?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_MIL_DISCIPLINE': [
    { Field_Key: 'discipline_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'discipline_type', Prompt: 'What type of discipline? (Article 15, Court Martial, etc.)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'charges', Prompt: 'What were the charges?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // Employment History
  'PACK_WORK_DISCIPLINE': [
    { Field_Key: 'employer', Prompt: 'Which employer disciplined you?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'reason', Prompt: 'What was the reason for the discipline?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'discipline_type', Prompt: 'What type of discipline?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_FIRED': [
    { Field_Key: 'employer', Prompt: 'Which employer fired you?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'termination_date', Prompt: 'When were you fired?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'reason', Prompt: 'What was the reason given?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_QUIT_AVOID': [
    { Field_Key: 'employer', Prompt: 'Which employer?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'quit_date', Prompt: 'When did you quit?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'what_avoiding', Prompt: 'What were you avoiding?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_WORK_SUBSTANCE': [
    { Field_Key: 'employer', Prompt: 'Which employer?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATERANGE' },
    { Field_Key: 'substance', Prompt: 'What substance were you using?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'caught', Prompt: 'Were you caught?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_DRUG_TEST_FAIL': [
    { Field_Key: 'employer', Prompt: 'Which employer?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'substance', Prompt: 'What substance did you test positive for?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_DRUG_TEST_CHEAT': [
    { Field_Key: 'employer', Prompt: 'Which employer?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'how_cheated', Prompt: 'How did you cheat or sabotage the test?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'caught', Prompt: 'Were you caught?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_DRUG_TEST_REFUSE': [
    { Field_Key: 'employer', Prompt: 'Which employer?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did you refuse the test?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'why_refused', Prompt: 'Why did you refuse?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_FALSIFY_WORK_RECORD': [
    { Field_Key: 'employer', Prompt: 'Which employer?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'what_falsified', Prompt: 'What did you falsify?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why_falsified', Prompt: 'Why did you falsify it?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_FALSE_APPLICATION': [
    { Field_Key: 'employer', Prompt: 'Which employer?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_applied', Prompt: 'When did you apply?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'what_falsified', Prompt: 'What information did you falsify?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why_falsified', Prompt: 'Why did you provide false information?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_MISUSE_RESOURCES': [
    { Field_Key: 'employer', Prompt: 'Which employer?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATERANGE' },
    { Field_Key: 'what_misused', Prompt: 'What resources did you misuse?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'how_used', Prompt: 'How did you misuse them?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_CONFIDENTIAL_ACCESS': [
    { Field_Key: 'employer', Prompt: 'Which employer?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'what_accessed', Prompt: 'What information did you access?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why_accessed', Prompt: 'Why did you access it?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'caught', Prompt: 'Were you caught?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_VIOLATE_NDA': [
    { Field_Key: 'employer', Prompt: 'Which employer or organization?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'what_disclosed', Prompt: 'What did you disclose?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'to_whom', Prompt: 'To whom did you disclose it?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_OFF_BOOKS': [
    { Field_Key: 'employer_name', Prompt: 'Who was the employer?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did you work off the books?', Response_Type: 'text', Expected_Type: 'DATERANGE' },
    { Field_Key: 'amount_earned', Prompt: 'Approximately how much did you earn?', Response_Type: 'text', Expected_Type: 'NUMBER' },
    { Field_Key: 'why_off_books', Prompt: 'Why did you work off the books?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_UNEMPLOYMENT_FRAUD': [
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATERANGE' },
    { Field_Key: 'amount_collected', Prompt: 'How much did you collect?', Response_Type: 'text', Expected_Type: 'NUMBER' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'caught', Prompt: 'Were you caught?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_THEFT': [
    { Field_Key: 'theft_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'theft_description', Prompt: 'What was taken?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'theft_value', Prompt: 'What was the approximate value?', Response_Type: 'text', Expected_Type: 'NUMBER' },
    { Field_Key: 'theft_outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // Prior Law Enforcement
  'PACK_LE_PREV': [
    { Field_Key: 'agency_name', Prompt: 'What was the name of the law enforcement agency?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'dates_employed', Prompt: 'What were the dates you were employed there?', Response_Type: 'text', Expected_Type: 'DATERANGE' },
    { Field_Key: 'reason_leaving', Prompt: 'What was your reason for leaving?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'eligible_rehire', Prompt: 'Are you eligible for rehire?', Response_Type: 'text', Expected_Type: 'BOOLEAN' }
  ],

  'PACK_ACCUSED_FORCE': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'agency', Prompt: 'Which agency?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'investigation', Prompt: 'Was there an investigation?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_GRATUITY': [
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'what_accepted', Prompt: 'What did you accept?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reported', Prompt: 'Did you report it?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_FALSIFY_REPORT': [
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'what_falsified', Prompt: 'What did you falsify?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why_falsified', Prompt: 'Why did you falsify it?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'caught', Prompt: 'Were you caught?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_INTERNAL_AFFAIRS': [
    { Field_Key: 'when_occurred', Prompt: 'When did the investigation occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'agency', Prompt: 'Which agency?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'allegations', Prompt: 'What were the allegations?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_LYING_LE': [
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'agency', Prompt: 'Which agency?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'what_lied_about', Prompt: 'What were you accused of lying about?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_LE_COMPLAINT': [
    { Field_Key: 'complaint_date', Prompt: 'When was the complaint filed?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'agency', Prompt: 'Which agency?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'complaint_nature', Prompt: 'What was the nature of the complaint?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'investigation', Prompt: 'Was it investigated?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_OTHER_PRIOR_LE': [
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'agency', Prompt: 'Which agency?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'issue_description', Prompt: 'Describe the issue.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // General Disclosures
  'PACK_EMBARRASSMENT': [
    { Field_Key: 'what_happened', Prompt: 'What happened that could cause embarrassment?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_TATTOO': [
    { Field_Key: 'tattoo_location', Prompt: 'Where is the tattoo located?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'tattoo_description', Prompt: 'Describe the tattoo.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_obtained', Prompt: 'When did you get it?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'meaning', Prompt: 'What is the meaning or significance?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_SOCIAL_MEDIA': [
    { Field_Key: 'content_type', Prompt: 'What type of content?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'platform', Prompt: 'Which platform?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_posted', Prompt: 'When was it posted?', Response_Type: 'text', Expected_Type: 'DATERANGE' },
    { Field_Key: 'description', Prompt: 'Describe the content.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'still_posted', Prompt: 'Is it still posted?', Response_Type: 'text', Expected_Type: 'BOOLEAN' }
  ],

  'PACK_DISCIPLINE': [
    { Field_Key: 'incident_date', Prompt: 'When did this disciplinary action occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'incident_description', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'incident_outcome', Prompt: 'What was the outcome or penalty?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // Additional Driving Packs
  'PACK_TRAFFIC_ARREST': [
    { Field_Key: 'arrest_date', Prompt: 'When were you arrested?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'violation_type', Prompt: 'What was the traffic violation?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'location', Prompt: 'Where did this occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_ROAD_RAGE': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'description', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'police_involved', Prompt: 'Was law enforcement involved?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // Additional Criminal Packs
  'PACK_PROBATION': [
    { Field_Key: 'probation_date', Prompt: 'When were you placed on probation?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'charge', Prompt: 'What was the charge?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'duration', Prompt: 'How long was the probation?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'violations', Prompt: 'Did you violate probation?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'completion_status', Prompt: 'What is the current status?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_PAROLE': [
    { Field_Key: 'parole_date', Prompt: 'When were you placed on parole?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'original_charge', Prompt: 'What was the original charge?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'duration', Prompt: 'How long was the parole?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'violations', Prompt: 'Did you violate parole?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'completion_status', Prompt: 'What is the current status?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_RESTRAINING_ORDER': [
    { Field_Key: 'order_date', Prompt: 'When was the restraining order issued?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'who_filed', Prompt: 'Who filed the order?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'violations', Prompt: 'Did you violate the order?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'current_status', Prompt: 'What is the current status?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_TRESPASSING': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'location', Prompt: 'Where did you trespass?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_VANDALISM': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'description', Prompt: 'Describe what was damaged.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'damage_value', Prompt: 'What was the estimated value of damage?', Response_Type: 'text', Expected_Type: 'NUMBER' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_ARSON': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'description', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'injuries', Prompt: 'Were there any injuries?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_BURGLARY': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'description', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'stolen_value', Prompt: 'What was the value of items taken?', Response_Type: 'text', Expected_Type: 'NUMBER' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_ROBBERY': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'description', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'weapon_used', Prompt: 'Was a weapon used?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'injuries', Prompt: 'Were there any injuries?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_FRAUD': [
    { Field_Key: 'fraud_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'fraud_type', Prompt: 'What type of fraud?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'amount', Prompt: 'What was the amount involved?', Response_Type: 'text', Expected_Type: 'NUMBER' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_EMBEZZLEMENT': [
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATERANGE' },
    { Field_Key: 'employer', Prompt: 'Which employer or organization?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'amount', Prompt: 'What was the amount?', Response_Type: 'text', Expected_Type: 'NUMBER' },
    { Field_Key: 'description', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_FORGERY': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'what_forged', Prompt: 'What did you forge?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_IDENTITY_THEFT': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'whose_identity', Prompt: 'Whose identity did you use?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'purpose', Prompt: 'For what purpose?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_SHOPLIFTING': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'location', Prompt: 'Where did this occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'items_value', Prompt: 'What was the value of items taken?', Response_Type: 'text', Expected_Type: 'NUMBER' },
    { Field_Key: 'caught', Prompt: 'Were you caught?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_COMPUTER_CRIME': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'crime_type', Prompt: 'What type of computer crime?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'description', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_STALKING': [
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATERANGE' },
    { Field_Key: 'victim_relationship', Prompt: 'What was your relationship to the person?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'description', Prompt: 'Describe the behavior.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_ANIMAL_CRUELTY': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'description', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_CHILD_ABUSE': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'relationship', Prompt: 'What was your relationship to the child?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'description', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_ELDER_ABUSE': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'relationship', Prompt: 'What was your relationship to the person?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'description', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_KIDNAPPING': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'victim_relationship', Prompt: 'What was your relationship to the person?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'description', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_WITNESS_TAMPERING': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'case_description', Prompt: 'What case was this related to?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'how_tampered', Prompt: 'How did you tamper with the witness?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_PERJURY': [
    { Field_Key: 'incident_date', Prompt: 'When did you commit perjury?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'where_occurred', Prompt: 'In what legal proceeding?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'what_lied_about', Prompt: 'What did you lie about?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_OBSTRUCTION': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'description', Prompt: 'Describe how you obstructed justice.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_RESISTING_ARREST': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'location', Prompt: 'Where did it occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'description', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'injuries', Prompt: 'Were there any injuries?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_BRIBERY': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'who_bribed', Prompt: 'Who did you bribe or attempt to bribe?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'what_offered', Prompt: 'What did you offer?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'purpose', Prompt: 'What was the purpose?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_CONTEMPT_COURT': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'court_type', Prompt: 'What type of court proceeding?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'what_happened', Prompt: 'What did you do that was contemptuous?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'penalty', Prompt: 'What was the penalty?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_TERRORISTIC_THREAT': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'threat_description', Prompt: 'Describe the threat.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'target', Prompt: 'Who or what was threatened?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_ILLEGAL_POSSESSION': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'item_description', Prompt: 'What did you possess illegally?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ]
};

// ============================================================================
// SKIP RULES
// ============================================================================

const SKIP_RULES = {
  'Q001': {
    skipIfAnswer: 'No',
    skipToQuestion: 'Q005'
  }
};

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

function parseDateFlexible(raw) {
  const s = String(raw).trim();
  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/;
  const monYr = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})$/i;
  const shortMonYr = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\.?\s+(\d{4})$/i;
  const monthYear = /^(\d{1,2})\/(\d{4})$/;

  let d = null;
  
  if (mdy.test(s)) {
    const [, mm, dd, yyyy] = s.match(mdy);
    d = new Date(`${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`);
  } else if (iso.test(s)) {
    d = new Date(s);
  } else if (monYr.test(s)) {
    const [, mon, yyyy] = s.match(monYr);
    d = new Date(`${mon} 01, ${yyyy}`);
  } else if (shortMonYr.test(s)) {
    const [, mon, yyyy] = s.match(shortMonYr);
    const monthMap = {
      'jan': 'January', 'feb': 'February', 'mar': 'March', 'apr': 'April',
      'may': 'May', 'jun': 'June', 'jul': 'July', 'aug': 'August',
      'sep': 'September', 'oct': 'October', 'nov': 'November', 'dec': 'December'
    };
    const fullMonth = monthMap[mon.toLowerCase().slice(0, 3)];
    d = new Date(`${fullMonth || 'January'} 01, ${yyyy}`);
  } else if (monthYear.test(s)) {
    const [, mm, yyyy] = s.match(monthYear);
    d = new Date(`${yyyy}-${mm.padStart(2,'0')}-01`);
  }
  
  return Number.isNaN(d?.getTime()) ? null : d;
}

export function validateFollowUpAnswer(value, expectedType, options = []) {
  const val = (value || '').trim();
  
  if (!val) return { valid: false, hint: 'Please provide an answer.' };
  
  switch (expectedType) {
    case 'DATE':
      return validateDate(val);
    case 'DATERANGE':
      return validateDateRange(val);
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
      return validateText(val);
  }
}

function validateDate(val) {
  const parsed = parseDateFlexible(val);
  
  if (parsed) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    const normalized = `${year}-${month}-${day}`;
    
    return { valid: true, normalized };
  }
  
  return { 
    valid: false, 
    hint: 'Please enter a date in MM/DD/YYYY, YYYY-MM-DD, or "Month YYYY" format (e.g., "June 2023").'
  };
}

function validateDateRange(val) {
  const separators = [' to ', ' - ', '–', ' – '];
  let found = false;
  let parts = [];
  
  for (const sep of separators) {
    if (val.includes(sep)) {
      parts = val.split(sep).map(p => p.trim());
      found = true;
      break;
    }
  }
  
  if (!found || parts.length !== 2) {
    return {
      valid: false,
      hint: 'Please enter a date range like "06/2023 to 08/2023" or "June 2023 - August 2023".'
    };
  }
  
  const date1 = validateDate(parts[0]);
  const date2 = validateDate(parts[1]);
  
  if (date1.valid && date2.valid) {
    return { valid: true, normalized: `${date1.normalized} to ${date2.normalized}` };
  }
  
  return {
    valid: false,
    hint: 'Please enter a valid date range like "06/2023 to 08/2023" or "June 2023 - August 2023".'
  };
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
    return { valid: true, normalized: val };
  }
  return { valid: false, hint: 'Please add a short sentence with the details.' };
}

// ============================================================================
// DATA LOADING & CACHING
// ============================================================================

export function parseQuestionsToMaps(questions) {
  const QById = {};
  const NextById = {};
  const ActiveOrdered = [];
  const MatrixYesByQ = {};

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

    if (q.followup_pack && q.response_type === 'yes_no') {
      MatrixYesByQ[q.question_id] = q.followup_pack;
      console.log(`🗺️ Mapped ${q.question_id} -> ${q.followup_pack}`);
    }
  });

  console.log(`📊 MatrixYesByQ built with ${Object.keys(MatrixYesByQ).length} mappings`);

  return { QById, NextById, ActiveOrdered, MatrixYesByQ };
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

  console.log(`📦 Loaded ${Object.keys(PackStepsById).length} follow-up packs`);

  return { PackStepsById };
}

export async function bootstrapEngine(base44) {
  console.log('🚀 Bootstrapping interview engine...');
  const startTime = performance.now();

  const [questions, categories] = await Promise.all([
    base44.entities.Question.filter({ active: true }),
    base44.entities.Category.filter({ active: true })
  ]);

  const { QById, NextById, ActiveOrdered, MatrixYesByQ } = parseQuestionsToMaps(questions);
  const { PackStepsById } = parseFollowUpPacks();
  
  // Global Integrity Check
  const configValidation = validateEngineConfigurationInternal(MatrixYesByQ, PackStepsById, QById);
  if (!configValidation.valid) {
    console.error('❌ Engine configuration errors:', configValidation.errors);
    configValidation.errors.forEach(err => console.error(`  - ${err}`));
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
    TotalQuestions: ActiveOrdered.length
  };

  const elapsed = performance.now() - startTime;
  console.log(`✅ Engine bootstrapped in ${elapsed.toFixed(2)}ms`);

  return engineState;
}

// ============================================================================
// QUESTION ROUTING LOGIC (GLOBAL HANDLER)
// ============================================================================

export function computeNextQuestionId(engine, currentQuestionId, answer) {
  const { NextById, ActiveOrdered } = engine;

  // Check skip rules first
  const skipRule = SKIP_RULES[currentQuestionId];
  if (skipRule && answer === skipRule.skipIfAnswer) {
    console.log(`⏭️ Skip rule triggered: ${currentQuestionId} -> ${skipRule.skipToQuestion}`);
    return skipRule.skipToQuestion;
  }

  // Use explicit next_question_id if defined
  if (NextById[currentQuestionId]) {
    return NextById[currentQuestionId];
  }

  // Fall back to display order
  const currentIndex = ActiveOrdered.indexOf(currentQuestionId);
  if (currentIndex >= 0 && currentIndex < ActiveOrdered.length - 1) {
    return ActiveOrdered[currentIndex + 1];
  }

  return null;
}

export function checkFollowUpTrigger(engine, questionId, answer) {
  const { MatrixYesByQ, QById, PackStepsById } = engine;
  const question = QById[questionId];

  console.log(`🔍 Global follow-up check for ${questionId}, answer="${answer}"`);

  if (!question) {
    console.warn(`⚠️ Question ${questionId} not found`);
    return null;
  }

  // Check for yes/no follow-up
  if (question.response_type === 'yes_no' && answer === 'Yes') {
    const packId = MatrixYesByQ[questionId];
    
    if (packId) {
      if (!PackStepsById[packId]) {
        console.error(`❌ Pack ${packId} not defined! This will break the interview.`);
        return null;
      }
      console.log(`   ✅ Follow-up triggered: ${packId} (${PackStepsById[packId].length} steps)`);
      return packId;
    }
  }

  console.log(`   ℹ️ No follow-up for this question`);
  return null;
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

  const missing = [];
  const followupAnswers = transcript.filter(t => t.type === 'followup' && t.packId === packId);
  
  packSteps.forEach(step => {
    const answered = followupAnswers.find(a => a.questionText === step.Prompt);
    if (!answered || !answered.answer || answered.answer.trim() === '') {
      missing.push(step.Prompt);
    }
  });

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
  
  // Check that all referenced packs exist
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