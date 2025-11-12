/**
 * ClearQuest Interview Engine - CANONICAL 10-PACK ARCHITECTURE
 * Deterministic, zero-AI question routing
 * MASTER RESET: Only 10 Follow-Up Packs (No Granular Packs)
 */

// ============================================================================
// CANONICAL 10 FOLLOW-UP PACKS (FINAL ARCHITECTURE)
// ============================================================================

const FOLLOWUP_PACK_STEPS = {
  // Pack 1: Drug Use / Controlled Substances
  'PACK_DRUG_USE_SUBSTANCES': [
    { Field_Key: 'substance_name', Prompt: 'What substance did you use?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'first_use_date', Prompt: 'When did you first use it?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'last_use_date', Prompt: 'When was the last time you used it?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'frequency', Prompt: 'How often did you use it?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'how_obtained', Prompt: 'How did you obtain it?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances of your use.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // Pack 2: Alcohol & Vehicle Judgment
  'PACK_ALCOHOL_VEHICLE_JUDGMENT': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'location', Prompt: 'Where did this occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'bac_level', Prompt: 'What was your BAC level, if known?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'injuries_or_damages', Prompt: 'Were there any injuries or property damage?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // Pack 3: Arrests / Detentions / Citations
  'PACK_ARRESTS_DETENTIONS_CITATIONS': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'location', Prompt: 'Where did this occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'charge_or_citation', Prompt: 'What were you arrested for or cited for?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'penalties', Prompt: 'What penalties or consequences did you receive?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // Pack 4: Employment Termination / Forced Resignation
  'PACK_EMPLOYMENT_TERMINATION': [
    { Field_Key: 'employer', Prompt: 'Which employer?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'termination_date', Prompt: 'When were you terminated or did you resign?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'reason', Prompt: 'What was the reason for termination or resignation?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'investigation_pending', Prompt: 'Was there an investigation or disciplinary action pending?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'eligible_rehire', Prompt: 'Are you eligible for rehire?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // Pack 5: Military or Employment Discipline
  'PACK_MILITARY_EMPLOYMENT_DISCIPLINE': [
    { Field_Key: 'organization', Prompt: 'Which organization or employer?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'discipline_type', Prompt: 'What type of discipline? (e.g., Article 15, written warning, suspension)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'reason', Prompt: 'What was the reason for the discipline?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome or penalty?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // Pack 6: Physical Altercations / Violence History
  'PACK_PHYSICAL_VIOLENCE_HISTORY': [
    { Field_Key: 'incident_date', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'location', Prompt: 'Where did this occur?', Response_Type: 'text', Expected_Type: 'LOCATION' },
    { Field_Key: 'victim_relationship', Prompt: 'What was your relationship to the other person(s)?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'description', Prompt: 'Describe what happened.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'injuries', Prompt: 'Were there any injuries?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'police_involved', Prompt: 'Was law enforcement involved?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'legal_outcome', Prompt: 'What was the legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // Pack 7: Financial Issues / Bankruptcy
  'PACK_FINANCIAL_ISSUES': [
    { Field_Key: 'issue_type', Prompt: 'What type of financial issue? (e.g., bankruptcy, foreclosure, collections)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'amount', Prompt: 'What was the amount involved?', Response_Type: 'text', Expected_Type: 'NUMBER' },
    { Field_Key: 'creditor_or_institution', Prompt: 'Who was the creditor or financial institution?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'current_status', Prompt: 'What is the current status?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'resolution_plan', Prompt: 'Do you have a plan to resolve this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // Pack 8: Illegal or Explicit Material
  'PACK_ILLEGAL_EXPLICIT_MATERIAL': [
    { Field_Key: 'material_type', Prompt: 'What type of material?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATERANGE' },
    { Field_Key: 'how_involved', Prompt: 'How were you involved? (e.g., possession, distribution, creation)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'circumstances', Prompt: 'Describe the circumstances.', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'legal_outcome', Prompt: 'Was there any legal outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // Pack 9: Association with Criminal Individuals
  'PACK_ASSOCIATION_CRIMINAL_INDIVIDUALS': [
    { Field_Key: 'who_associated', Prompt: 'Who were you associated with?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this association occur?', Response_Type: 'text', Expected_Type: 'DATERANGE' },
    { Field_Key: 'nature_of_relationship', Prompt: 'What was the nature of your relationship?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'their_criminal_activity', Prompt: 'What criminal activity were they involved in?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'your_involvement', Prompt: 'Were you involved in any criminal activity with them?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'current_contact', Prompt: 'Do you still have contact with this person?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this association?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ],

  // Pack 10: Falsification / Omission on Documents
  'PACK_FALSIFICATION_OMISSION': [
    { Field_Key: 'document_type', Prompt: 'What type of document? (e.g., application, report, tax return)', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'organization', Prompt: 'Which organization or employer?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'when_occurred', Prompt: 'When did this occur?', Response_Type: 'text', Expected_Type: 'DATE' },
    { Field_Key: 'what_falsified', Prompt: 'What information did you falsify or omit?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'why_falsified', Prompt: 'Why did you falsify or omit this information?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'caught', Prompt: 'Were you caught or discovered?', Response_Type: 'text', Expected_Type: 'BOOLEAN' },
    { Field_Key: 'outcome', Prompt: 'What was the outcome?', Response_Type: 'text', Expected_Type: 'TEXT' },
    { Field_Key: 'accountability', Prompt: 'How do you take accountability for this?', Response_Type: 'text', Expected_Type: 'TEXT' }
  ]
};

// ============================================================================
// QUESTION-TO-PACK MAPPING (Authoritative Registry)
// ============================================================================

const FOLLOWUP_REGISTRY = {
  // Applications with Other LE Agencies (Q002-Q004)
  'Q002': 'PACK_FALSIFICATION_OMISSION',
  'Q003': 'PACK_ARRESTS_DETENTIONS_CITATIONS', // Disqualified - could be arrest-related
  'Q004': 'PACK_FALSIFICATION_OMISSION', // Cheating on test

  // Driving Record (Q005-Q019)
  'Q006': 'PACK_ALCOHOL_VEHICLE_JUDGMENT', // DUI
  'Q007': 'PACK_ALCOHOL_VEHICLE_JUDGMENT', // License suspension
  'Q008': 'PACK_ALCOHOL_VEHICLE_JUDGMENT', // Reckless driving
  'Q009': 'PACK_ARRESTS_DETENTIONS_CITATIONS', // Driving without insurance
  'Q010': 'PACK_ALCOHOL_VEHICLE_JUDGMENT', // Collision
  'Q011': 'PACK_ALCOHOL_VEHICLE_JUDGMENT', // Collision with injury
  'Q012': 'PACK_ALCOHOL_VEHICLE_JUDGMENT', // Alcohol-related collision
  'Q013': 'PACK_ALCOHOL_VEHICLE_JUDGMENT', // Unreported collision
  'Q014': 'PACK_ARRESTS_DETENTIONS_CITATIONS', // Hit and run
  'Q015': 'PACK_ARRESTS_DETENTIONS_CITATIONS', // Hit and run with damage
  'Q016': 'PACK_ARRESTS_DETENTIONS_CITATIONS', // Traffic arrest
  'Q017': 'PACK_PHYSICAL_VIOLENCE_HISTORY', // Road rage
  'Q018': 'PACK_ARRESTS_DETENTIONS_CITATIONS', // Traffic citations

  // Criminal Involvement (Q020-Q039)
  'Q020': 'PACK_PHYSICAL_VIOLENCE_HISTORY', // Physical fight
  'Q021': 'PACK_ARRESTS_DETENTIONS_CITATIONS', // Arrested
  'Q022': 'PACK_ARRESTS_DETENTIONS_CITATIONS', // Criminal charge
  'Q023': 'PACK_ARRESTS_DETENTIONS_CITATIONS', // Felony
  'Q024': 'PACK_ARRESTS_DETENTIONS_CITATIONS', // Warrant
  'Q025': 'PACK_PHYSICAL_VIOLENCE_HISTORY', // Protective order
  'Q026': 'PACK_ASSOCIATION_CRIMINAL_INDIVIDUALS', // Gang
  'Q027': 'PACK_ARRESTS_DETENTIONS_CITATIONS', // Weapon violation
  'Q028': 'PACK_PHYSICAL_VIOLENCE_HISTORY', // Domestic violence
  'Q029': 'PACK_ARRESTS_DETENTIONS_CITATIONS', // Probation
  'Q030': 'PACK_ARRESTS_DETENTIONS_CITATIONS', // Parole
  'Q031': 'PACK_PHYSICAL_VIOLENCE_HISTORY', // Restraining order
  'Q032': 'PACK_ARRESTS_DETENTIONS_CITATIONS', // Police called
  'Q033': 'PACK_ARRESTS_DETENTIONS_CITATIONS', // LE investigation
  'Q034': 'PACK_ARRESTS_DETENTIONS_CITATIONS', // Trespassing
  'Q035': 'PACK_ARRESTS_DETENTIONS_CITATIONS', // Vandalism
  'Q036': 'PACK_ARRESTS_DETENTIONS_CITATIONS', // Arson
  'Q037': 'PACK_ARRESTS_DETENTIONS_CITATIONS', // Burglary
  'Q038': 'PACK_ARRESTS_DETENTIONS_CITATIONS', // Robbery
  'Q039': 'PACK_ARRESTS_DETENTIONS_CITATIONS', // Other crime

  // Extremist Organizations (Q040)
  'Q040': 'PACK_ASSOCIATION_CRIMINAL_INDIVIDUALS',

  // Sexual Activities (Q041-Q048)
  'Q041': 'PACK_ILLEGAL_EXPLICIT_MATERIAL', // Prostitution
  'Q042': 'PACK_ILLEGAL_EXPLICIT_MATERIAL', // Pornography
  'Q043': 'PACK_PHYSICAL_VIOLENCE_HISTORY', // Sexual harassment
  'Q044': 'PACK_PHYSICAL_VIOLENCE_HISTORY', // Sexual assault
  'Q045': 'PACK_ILLEGAL_EXPLICIT_MATERIAL', // Minor contact
  'Q046': 'PACK_ILLEGAL_EXPLICIT_MATERIAL', // Minor sexual contact
  'Q047': 'PACK_PHYSICAL_VIOLENCE_HISTORY', // Non-consensual
  'Q048': 'PACK_ILLEGAL_EXPLICIT_MATERIAL', // Adult entertainment

  // Financial History (Q049-Q062)
  'Q049': 'PACK_FINANCIAL_ISSUES', // Bankruptcy
  'Q050': 'PACK_FINANCIAL_ISSUES', // Foreclosure
  'Q051': 'PACK_FINANCIAL_ISSUES', // Repossession
  'Q052': 'PACK_FINANCIAL_ISSUES', // Civil lawsuit
  'Q053': 'PACK_FINANCIAL_ISSUES', // Late payments
  'Q054': 'PACK_FINANCIAL_ISSUES', // Gambling
  'Q055': 'PACK_FINANCIAL_ISSUES', // Failed to pay debt
  'Q056': 'PACK_FALSIFICATION_OMISSION', // Tax not filed
  'Q057': 'PACK_FINANCIAL_ISSUES', // Loan default
  'Q058': 'PACK_FINANCIAL_ISSUES', // Child support
  'Q059': 'PACK_FINANCIAL_ISSUES', // Wage garnishment
  'Q060': 'PACK_FINANCIAL_ISSUES', // NSF checks
  'Q061': 'PACK_FINANCIAL_ISSUES', // Collections
  'Q062': 'PACK_FINANCIAL_ISSUES', // Other financial

  // Illegal Drugs (Q063-Q113)
  'Q063': 'PACK_DRUG_USE_SUBSTANCES', // Marijuana
  'Q064': 'PACK_DRUG_USE_SUBSTANCES', // Cocaine
  'Q065': 'PACK_DRUG_USE_SUBSTANCES', // Crack
  'Q066': 'PACK_DRUG_USE_SUBSTANCES', // Methamphetamine
  'Q067': 'PACK_DRUG_USE_SUBSTANCES', // Heroin
  'Q068': 'PACK_DRUG_USE_SUBSTANCES', // LSD
  'Q069': 'PACK_DRUG_USE_SUBSTANCES', // PCP
  'Q070': 'PACK_DRUG_USE_SUBSTANCES', // Ecstasy
  'Q071': 'PACK_DRUG_USE_SUBSTANCES', // Mushrooms
  'Q072': 'PACK_DRUG_USE_SUBSTANCES', // Peyote
  'Q073': 'PACK_DRUG_USE_SUBSTANCES', // Prescription misuse
  'Q074': 'PACK_DRUG_USE_SUBSTANCES', // Prescription fraud
  'Q075': 'PACK_DRUG_USE_SUBSTANCES', // Inhalants
  'Q076': 'PACK_DRUG_USE_SUBSTANCES', // Steroids
  'Q077': 'PACK_DRUG_USE_SUBSTANCES', // Amphetamines
  'Q078': 'PACK_DRUG_USE_SUBSTANCES', // Angel Dust
  'Q079': 'PACK_DRUG_USE_SUBSTANCES', // Beauties
  'Q080': 'PACK_DRUG_USE_SUBSTANCES', // Fentanyl
  'Q081': 'PACK_DRUG_USE_SUBSTANCES', // Benzedrine
  'Q082': 'PACK_DRUG_USE_SUBSTANCES', // Molly
  'Q083': 'PACK_DRUG_USE_SUBSTANCES', // Codeine
  'Q084': 'PACK_DRUG_USE_SUBSTANCES', // Propofol
  'Q085': 'PACK_DRUG_USE_SUBSTANCES', // Crystal Meth
  'Q086': 'PACK_DRUG_USE_SUBSTANCES', // Salvia
  'Q087': 'PACK_DRUG_USE_SUBSTANCES', // Darvon
  'Q088': 'PACK_DRUG_USE_SUBSTANCES', // Demerol
  'Q089': 'PACK_DRUG_USE_SUBSTANCES', // Dexedrine
  'Q090': 'PACK_DRUG_USE_SUBSTANCES', // Dilaudid
  'Q091': 'PACK_DRUG_USE_SUBSTANCES', // Downers
  'Q092': 'PACK_DRUG_USE_SUBSTANCES', // Wax
  'Q093': 'PACK_DRUG_USE_SUBSTANCES', // Hashish
  'Q094': 'PACK_DRUG_USE_SUBSTANCES', // Inhalants
  'Q095': 'PACK_DRUG_USE_SUBSTANCES', // Ludes
  'Q096': 'PACK_DRUG_USE_SUBSTANCES', // Coriicidin
  'Q097': 'PACK_DRUG_USE_SUBSTANCES', // Lysergic Acid
  'Q098': 'PACK_DRUG_USE_SUBSTANCES', // Methadone
  'Q099': 'PACK_DRUG_USE_SUBSTANCES', // Morphine
  'Q100': 'PACK_DRUG_USE_SUBSTANCES', // Adderall
  'Q101': 'PACK_DRUG_USE_SUBSTANCES', // Paregoric
  'Q102': 'PACK_DRUG_USE_SUBSTANCES', // Psilocybin
  'Q103': 'PACK_DRUG_USE_SUBSTANCES', // Quaaludes
  'Q104': 'PACK_DRUG_USE_SUBSTANCES', // Oxycodone
  'Q105': 'PACK_DRUG_USE_SUBSTANCES', // Sopers
  'Q106': 'PACK_DRUG_USE_SUBSTANCES', // Steroids
  'Q107': 'PACK_DRUG_USE_SUBSTANCES', // Talwin
  'Q108': 'PACK_DRUG_USE_SUBSTANCES', // Valium
  'Q109': 'PACK_DRUG_USE_SUBSTANCES', // White Cross
  'Q110': 'PACK_DRUG_USE_SUBSTANCES', // Spice
  'Q111': 'PACK_DRUG_USE_SUBSTANCES', // Bath Salts
  'Q112': 'PACK_DRUG_USE_SUBSTANCES', // Uppers
  'Q113': 'PACK_DRUG_USE_SUBSTANCES', // Any illegal drug (multi-select)

  // Alcohol History (Q114-Q118)
  'Q114': 'PACK_ALCOHOL_VEHICLE_JUDGMENT', // Alcohol dependency
  'Q115': 'PACK_ALCOHOL_VEHICLE_JUDGMENT', // Alcohol incident
  'Q116': 'PACK_DRUG_USE_SUBSTANCES', // Drug sale
  'Q117': 'PACK_ILLEGAL_EXPLICIT_MATERIAL', // Sex registry
  'Q118': 'PACK_ILLEGAL_EXPLICIT_MATERIAL', // Social media delete

  // Military History (Q119-Q128)
  'Q120': 'PACK_MILITARY_EMPLOYMENT_DISCIPLINE', // Dishonor discharge
  'Q121': 'PACK_MILITARY_EMPLOYMENT_DISCIPLINE', // General discharge
  'Q122': 'PACK_MILITARY_EMPLOYMENT_DISCIPLINE', // Article 15
  'Q123': 'PACK_MILITARY_EMPLOYMENT_DISCIPLINE', // Court martial
  'Q124': 'PACK_MILITARY_EMPLOYMENT_DISCIPLINE', // Other discipline

  // Employment History (Q129-Q146)
  'Q129': 'PACK_MILITARY_EMPLOYMENT_DISCIPLINE', // Work discipline
  'Q130': 'PACK_EMPLOYMENT_TERMINATION', // Fired
  'Q131': 'PACK_MILITARY_EMPLOYMENT_DISCIPLINE', // General discipline
  'Q132': 'PACK_DRUG_USE_SUBSTANCES', // Substance at work
  'Q133': 'PACK_DRUG_USE_SUBSTANCES', // Drug test fail
  'Q134': 'PACK_DRUG_USE_SUBSTANCES', // Drug test cheat
  'Q135': 'PACK_DRUG_USE_SUBSTANCES', // Drug test refuse
  'Q136': 'PACK_EMPLOYMENT_TERMINATION', // Quit to avoid
  'Q137': 'PACK_FALSIFICATION_OMISSION', // Falsify work record
  'Q138': 'PACK_FALSIFICATION_OMISSION', // False application
  'Q139': 'PACK_MILITARY_EMPLOYMENT_DISCIPLINE', // Misuse resources
  'Q140': 'PACK_MILITARY_EMPLOYMENT_DISCIPLINE', // Confidential access
  'Q141': 'PACK_FALSIFICATION_OMISSION', // Violate NDA
  'Q142': 'PACK_FINANCIAL_ISSUES', // Off the books
  'Q143': 'PACK_FALSIFICATION_OMISSION', // Unemployment fraud
  'Q144': 'PACK_FALSIFICATION_OMISSION', // Workers comp fraud
  'Q145': 'PACK_ARRESTS_DETENTIONS_CITATIONS', // Theft
  'Q146': 'PACK_MILITARY_EMPLOYMENT_DISCIPLINE', // Other employment

  // Prior Law Enforcement (Q147-Q157)
  'Q147': 'PACK_EMPLOYMENT_TERMINATION', // Prior LE
  'Q148': 'PACK_EMPLOYMENT_TERMINATION', // LE terminated
  'Q149': 'PACK_EMPLOYMENT_TERMINATION', // LE resigned
  'Q150': 'PACK_MILITARY_EMPLOYMENT_DISCIPLINE', // LE discipline
  'Q151': 'PACK_PHYSICAL_VIOLENCE_HISTORY', // Accused of force
  'Q152': 'PACK_MILITARY_EMPLOYMENT_DISCIPLINE', // Use of force review
  'Q153': 'PACK_FALSIFICATION_OMISSION', // Gratuity
  'Q154': 'PACK_FALSIFICATION_OMISSION', // Falsify report
  'Q155': 'PACK_MILITARY_EMPLOYMENT_DISCIPLINE', // Internal affairs
  'Q156': 'PACK_FALSIFICATION_OMISSION', // Lying in LE
  'Q157': 'PACK_MILITARY_EMPLOYMENT_DISCIPLINE', // LE complaint

  // General Disclosures (Q158-Q161)
  'Q160': 'PACK_ILLEGAL_EXPLICIT_MATERIAL', // Tattoo
  'Q161': 'PACK_FALSIFICATION_OMISSION' // Sworn statement correction
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

    // Build MatrixYesByQ from CANONICAL REGISTRY (not from Question.followup_pack)
    if (FOLLOWUP_REGISTRY[q.question_id] && q.response_type === 'yes_no') {
      MatrixYesByQ[q.question_id] = FOLLOWUP_REGISTRY[q.question_id];
      console.log(`🗺️ Canonical mapping: ${q.question_id} -> ${FOLLOWUP_REGISTRY[q.question_id]}`);
    }
  });

  console.log(`📊 MatrixYesByQ built with ${Object.keys(MatrixYesByQ).length} canonical mappings`);

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

  console.log(`📦 Loaded ${Object.keys(PackStepsById).length} canonical follow-up packs (10 only)`);

  return { PackStepsById };
}

export async function bootstrapEngine(base44) {
  console.log('🚀 Bootstrapping interview engine (10-pack canonical architecture)...');
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
// DETERMINISTIC TRIGGER LOGIC (Single Function)
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
  const { MatrixYesByQ, PackStepsById } = engine;

  console.log(`🔍 Deterministic follow-up check for ${questionId}, answer="${answer}"`);

  // DETERMINISTIC TRIGGER: Only if answer is "Yes" AND registry has mapping
  if (answer === 'Yes' && MatrixYesByQ[questionId]) {
    const packId = MatrixYesByQ[questionId];
    
    if (!PackStepsById[packId]) {
      console.error(`❌ CRITICAL: Pack ${packId} not defined! This breaks the system.`);
      return null;
    }
    
    console.log(`   ✅ Follow-up triggered: ${packId} (${PackStepsById[packId].length} steps)`);
    return packId;
  }

  console.log(`   ℹ️ No follow-up for this question`);
  return null;
}

// ============================================================================
// SELF-TEST FUNCTION (Console-Runnable)
// ============================================================================

export function runFollowupSelfTest(engine) {
  console.log('🧪 Running Follow-Up Self-Test...');
  
  const results = [];
  const canonicalPacks = Object.keys(FOLLOWUP_PACK_STEPS);
  
  // Test 1: Verify only 10 packs exist
  if (Object.keys(engine.PackStepsById).length !== 10) {
    console.error(`❌ FAIL: Expected 10 packs, found ${Object.keys(engine.PackStepsById).length}`);
    results.push({
      Test: 'Pack Count',
      Expected: 10,
      Actual: Object.keys(engine.PackStepsById).length,
      Status: '❌ FAIL'
    });
  } else {
    results.push({
      Test: 'Pack Count',
      Expected: 10,
      Actual: 10,
      Status: '✅ PASS'
    });
  }
  
  // Test 2: Verify all packs are canonical
  Object.keys(engine.PackStepsById).forEach(packId => {
    const isCanonical = canonicalPacks.includes(packId);
    results.push({
      Test: `Pack "${packId}" is canonical`,
      Expected: 'CANONICAL',
      Actual: isCanonical ? 'CANONICAL' : 'DEPRECATED',
      Status: isCanonical ? '✅ PASS' : '❌ FAIL'
    });
  });
  
  // Test 3: Simulate all Yes answers and verify triggers
  Object.keys(FOLLOWUP_REGISTRY).forEach(questionId => {
    const expectedPack = FOLLOWUP_REGISTRY[questionId];
    const triggeredPack = checkFollowUpTrigger(engine, questionId, 'Yes');
    
    const matches = triggeredPack === expectedPack;
    results.push({
      Test: `${questionId} triggers ${expectedPack}`,
      Expected: expectedPack,
      Actual: triggeredPack || 'NULL',
      Status: matches ? '✅ PASS' : '❌ FAIL'
    });
  });
  
  // Test 4: Verify no questions map to deprecated packs
  const deprecatedPacks = [
    'PACK_LE_APPS', 'PACK_WITHHOLD_INFO', 'PACK_DISQUALIFIED', 'PACK_CHEATING',
    'PACK_DUI', 'PACK_LICENSE_SUSPENSION', 'PACK_RECKLESS_DRIVING', 'PACK_MARIJUANA',
    'PACK_ARREST', 'PACK_FELONY', 'PACK_GANG', 'PACK_EXTREMIST', 'PACK_FIRED',
    'PACK_FINANCIAL', 'PACK_BANKRUPTCY'
    // Add more as needed
  ];
  
  deprecatedPacks.forEach(deprecatedPack => {
    const questionsUsingIt = Object.keys(engine.MatrixYesByQ).filter(
      qId => engine.MatrixYesByQ[qId] === deprecatedPack
    );
    
    if (questionsUsingIt.length > 0) {
      results.push({
        Test: `No questions use deprecated ${deprecatedPack}`,
        Expected: '0 questions',
        Actual: `${questionsUsingIt.length} questions: ${questionsUsingIt.join(', ')}`,
        Status: '❌ FAIL'
      });
    }
  });
  
  console.table(results);
  
  const failures = results.filter(r => r.Status === '❌ FAIL');
  if (failures.length > 0) {
    console.error(`❌ ${failures.length} TESTS FAILED`);
    return { passed: false, failures: failures.length, results };
  } else {
    console.log(`✅ ALL ${results.length} TESTS PASSED`);
    return { passed: true, failures: 0, results };
  }
}

// Make it globally accessible for console testing
if (typeof window !== 'undefined') {
  window.runFollowupSelfTest = () => {
    console.warn('⚠️ Self-test requires bootstrapped engine. Run from interview page.');
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
    const canonicalPack = FOLLOWUP_REGISTRY[q.questionId];
    if (canonicalPack && q.answer === 'Yes') {
      triggeredPacks.add(canonicalPack);
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
  
  // Verify only canonical packs exist
  const canonicalPackIds = Object.keys(FOLLOWUP_PACK_STEPS);
  Object.keys(PackStepsById).forEach(packId => {
    if (!canonicalPackIds.includes(packId)) {
      errors.push(`Deprecated pack found: ${packId} (not in canonical 10)`);
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