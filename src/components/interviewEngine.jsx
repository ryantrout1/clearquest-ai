/**
 * ClearQuest Interview Engine
 * Deterministic, zero-AI question routing with precomputed lookups
 * Optimized for speed and minimal credit usage
 */

// ============================================================================
// FOLLOW-UP PACK DEFINITIONS (Hardcoded for deterministic routing)
// Based on ClearQuest Data Package v1 - README_v1.txt
// ============================================================================

const FOLLOWUP_PACK_STEPS = {
  // ===== Applications with Other LE Agencies =====
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

  // ===== Driving Record =====
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

  // ===== Criminal Involvement / Police Contacts =====
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

  // ===== Extremist Organizations =====
  'PACK_EXTREMIST': [
    { Field_Key: 'organization_name', Prompt: 'What was the name of the organization?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'dates_involved', Prompt: 'When were you involved?', Response_Type: 'text', Expected_Type: 'DATERANGE' },
    { Field_Key: 'level_involvement', Prompt: 'What was your level of involvement?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why_joined', Prompt: 'Why did you join?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why_left', Prompt: 'Why did you leave?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'current_contact', Prompt: 'Do you still have contact with members?', Response_Type: 'text', Expected_Type: 'BOOLEAN' }
  ],

  // ===== Sexual Activities =====
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

  // ===== Financial History =====
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

  // NEW: Missing Financial Packs
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

  // ... keep all existing packs (PACK_DRUG_USE through PACK_TRAFFIC) ...

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

  'PACK_DISCIPLINE': [
    { Field_Key: 'incident_date', Prompt: 'When did this disciplinary action occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'incident_description', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'incident_outcome', Prompt: 'What was the outcome or penalty?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

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

  'PACK_DRUG_TEST_CHEAT': [
    { Field_Key: 'employer', Prompt: 'Which employer?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'how_cheated', Prompt: 'How did you cheat or sabotage the test?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'caught', Prompt: 'Were you caught?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
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

  'PACK_THEFT': [
    { Field_Key: 'theft_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'theft_description', Prompt: 'What was taken?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'theft_value', Prompt: 'What was the approximate value?', Response_Type: 'text', Expected_Type: 'NUMBER' },
    { Field_Key: 'theft_outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_UNEMPLOYMENT_FRAUD': [
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATERANGE' },
    { Field_Key: 'amount_collected', Prompt: 'How much did you collect?', Response_Type: 'text', Expected_Type: 'NUMBER' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'caught', Prompt: 'Were you caught?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

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

  'PACK_DOMESTIC': [
    { Field_Key: 'domestic_date', Prompt: 'When did this incident occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'domestic_description', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'domestic_outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  'PACK_TRAFFIC': [
    { Field_Key: 'traffic_date', Prompt: 'When did this traffic violation occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'traffic_type', Prompt: 'What was the violation?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'traffic_outcome', Prompt: 'What was the outcome or penalty?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ]
};

// ... keep all existing code (SKIP_RULES, validation functions, parseQuestionsToMaps, etc.) ...