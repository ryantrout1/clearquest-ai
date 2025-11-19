// Canonical Follow-Up Categories
export const FOLLOWUP_CATEGORIES = [
  {
    id: "DRUG_USE_CONTROLLED_SUBSTANCES",
    label: "Drug Use / Controlled Substances",
    description: "Any 'Yes' related to drug use, possession, or influence. Captures substance name, frequency, timeline, source, context, impact, and accountability."
  },
  {
    id: "CRIMINAL_CHARGES_ARRESTS",
    label: "Criminal Charges & Arrests",
    description: "Responses involving charges, arrests, detentions, warrants. Documents charge details, dates, outcomes, penalties, and accountability."
  },
  {
    id: "DRIVING_INCIDENTS",
    label: "Driving Incidents",
    description: "DUI, suspensions, reckless driving, major violations. Captures dates, BAC, outcomes, license/insurance impact, circumstances."
  },
  {
    id: "EMPLOYMENT_TERMINATIONS",
    label: "Employment Terminations",
    description: "Termination, resignation in lieu of termination, or major discipline. Documents employer, dates, reasons, circumstances, accountability."
  },
  {
    id: "FINANCIAL_ISSUES",
    label: "Financial Issues",
    description: "Bankruptcy, foreclosure, collections, major debt. Captures type, amount, timeline, resolution, current status."
  },
  {
    id: "SEXUAL_MISCONDUCT_EXPLOITATION",
    label: "Sexual Misconduct or Exploitation",
    description: "Prostitution, harassment, assault, exploitation. Documents nature, consequences, treatment, accountability."
  },
  {
    id: "WEAPONS_VIOLATIONS",
    label: "Weapons Violations",
    description: "Illegal possession, improper use, unsafe discharge, threats. Captures weapon type, circumstances, impact, outcomes."
  },
  {
    id: "GANG_AFFILIATION",
    label: "Gang Affiliation",
    description: "Gang membership or association. Documents gang name, dates, participation level, criminal activity, exit, current contact."
  },
  {
    id: "MILITARY_DISCIPLINE",
    label: "Military Discipline",
    description: "Courts-martial, Article 15s, discharges. Captures type, dates, circumstances, outcomes, discharge impact."
  },
  {
    id: "LAW_ENFORCEMENT_DISCIPLINE",
    label: "Law Enforcement Discipline",
    description: "LE complaints, suspensions, integrity issues. Documents department, dates, complaint nature, investigation, discipline."
  }
];

// Map pack IDs to categories based on naming patterns
export function mapPackToCategory(packId) {
  if (!packId) return "UNCATEGORIZED";
  
  const id = packId.toUpperCase();
  
  // Drug Use / Controlled Substances
  if (id.includes("DRUG") || id.includes("NARCOTIC") || id.includes("PRESCRIPTION_MISUSE") || 
      id.includes("ILLEGAL_DRUG") || id.includes("DRUG_TEST")) {
    return "DRUG_USE_CONTROLLED_SUBSTANCES";
  }
  
  // Criminal Charges & Arrests
  if (id.includes("ARREST") || id.includes("CHARGE") || id.includes("CONVICTION") || 
      id.includes("PROBATION") || id.includes("WARRANT") || id.includes("FELONY") ||
      id.includes("INVESTIGATION") || id.includes("POLICE_CALLED") || id.includes("DIVERSION") ||
      id.includes("CONSPIRACY") || id.includes("JUVENILE_CRIME") || id.includes("UNCAUGHT_CRIME") ||
      id.includes("FOREIGN_CRIME") || id.includes("POLICE_REPORT") || id.includes("ARRESTABLE") ||
      id.includes("CRIMINAL") || id.includes("CRIME")) {
    return "CRIMINAL_CHARGES_ARRESTS";
  }
  
  // Driving Incidents
  if (id.includes("DUI") || id.includes("DRIVING") || id.includes("TRAFFIC") || 
      id.includes("LICENSE") || id.includes("COLLISION") || id.includes("HIT_RUN") ||
      id.includes("INSURANCE") || id.includes("RECKLESS") || id.includes("ROAD_RAGE") ||
      id.includes("SUSPENDED") || id.includes("REVOKED")) {
    return "DRIVING_INCIDENTS";
  }
  
  // Employment Terminations
  if (id.includes("FIRED") || id.includes("QUIT_AVOID") || id.includes("DISCIPLINE") ||
      id.includes("WORK_") || id.includes("MISUSE_RESOURCES")) {
    return "EMPLOYMENT_TERMINATIONS";
  }
  
  // Financial Issues
  if (id.includes("FINANCIAL") || id.includes("BANKRUPTCY") || id.includes("FORECLOSURE") ||
      id.includes("REPOSSESSION") || id.includes("LAWSUIT") || id.includes("LATE_PAYMENT") ||
      id.includes("GAMBLING") || id.includes("DEBT") || id.includes("UNEMPLOYMENT_FRAUD") ||
      id.includes("IRS") || id.includes("UNREPORTED_INCOME")) {
    return "FINANCIAL_ISSUES";
  }
  
  // Sexual Misconduct or Exploitation
  if (id.includes("PROSTITUTION") || id.includes("PAID_SEX") || id.includes("PORNOGRAPHY") ||
      id.includes("HARASSMENT") || id.includes("NON_CONSENT") || id.includes("SEXUAL") ||
      id.includes("CHILD_CRIME") || id.includes("CHILD_PROTECTION") || id.includes("MINOR_CONTACT")) {
    return "SEXUAL_MISCONDUCT_EXPLOITATION";
  }
  
  // Weapons Violations
  if (id.includes("WEAPON") || id.includes("ILLEGAL_WEAPON") || id.includes("CARRY_WEAPON")) {
    return "WEAPONS_VIOLATIONS";
  }
  
  // Gang Affiliation
  if (id.includes("GANG") || id.includes("HATE_CRIME") || id.includes("EXTREMIST") ||
      id.includes("CRIMINAL_ORGANIZATION") || id.includes("CRIMINAL_ASSOCIATES")) {
    return "GANG_AFFILIATION";
  }
  
  // Military Discipline
  if (id.includes("MIL_") || id.includes("MILITARY")) {
    return "MILITARY_DISCIPLINE";
  }
  
  // Law Enforcement Discipline
  if (id.includes("LE_") || id.includes("INTERNAL_AFFAIRS") || id.includes("LYING_LE") ||
      id.includes("ACCUSED_FORCE") || id.includes("GRATUITY") || id.includes("FALSIFY_REPORT") ||
      id.includes("POLICE_BRUTALITY") || id.includes("PRIOR_LE")) {
    return "LAW_ENFORCEMENT_DISCIPLINE";
  }
  
  // Violence & Domestic - map to Criminal
  if (id.includes("FIGHT") || id.includes("DOMESTIC") || id.includes("ASSAULT") ||
      id.includes("PROTECTIVE_ORDER") || id.includes("INJURY") || id.includes("VIOLENCE")) {
    return "CRIMINAL_CHARGES_ARRESTS";
  }
  
  // Theft & Property - map to Criminal
  if (id.includes("THEFT") || id.includes("SHOPLIFTING") || id.includes("STOLEN") ||
      id.includes("TRESPASSING") || id.includes("PROPERTY_DAMAGE")) {
    return "CRIMINAL_CHARGES_ARRESTS";
  }
  
  // Fraud & Cybercrime - map to Criminal
  if (id.includes("FORGERY") || id.includes("HACKING") || id.includes("ILLEGAL_DOWNLOADS") ||
      id.includes("FALSE_APPLICATION")) {
    return "CRIMINAL_CHARGES_ARRESTS";
  }
  
  // Alcohol - map to Drug Use
  if (id.includes("ALCOHOL") || id.includes("PROVIDE_ALCOHOL")) {
    return "DRUG_USE_CONTROLLED_SUBSTANCES";
  }
  
  // Disclosure & Integrity - map to appropriate categories or Criminal
  if (id.includes("WITHHOLD_INFO") || id.includes("DISQUALIFIED") || id.includes("CHEATING") ||
      id.includes("DELETED_SOCIAL") || id.includes("PRANK") || id.includes("FIREWORKS") ||
      id.includes("EMBARRASSMENT") || id.includes("TATTOO") || id.includes("SOCIAL_MEDIA")) {
    return "CRIMINAL_CHARGES_ARRESTS";
  }
  
  return "UNCATEGORIZED";
}

export function getPacksByCategory(packs) {
  const categoryMap = {};
  
  FOLLOWUP_CATEGORIES.forEach(cat => {
    categoryMap[cat.id] = [];
  });
  categoryMap["UNCATEGORIZED"] = [];
  
  packs.forEach(pack => {
    const categoryId = mapPackToCategory(pack.followup_pack_id);
    if (categoryMap[categoryId]) {
      categoryMap[categoryId].push(pack);
    } else {
      categoryMap["UNCATEGORIZED"].push(pack);
    }
  });
  
  return categoryMap;
}