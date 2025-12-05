/**
 * V2 Anchor Gating Configuration
 * 
 * Global anchor model for all V2 packs to enable conversational field-gating.
 * Each pack defines which anchors each field captures and which anchors are
 * required before a field should be asked.
 * 
 * This prevents redundant questions by skipping fields whose anchors are
 * already collected from previous answers (especially the opening narrative).
 */

// ============================================================================
// ANCHOR DEFINITIONS BY CATEGORY
// ============================================================================

export const ANCHOR_CATEGORIES = {
  // Incident identity
  incident_type: { label: "Type of incident", category: "identity" },
  agency_name: { label: "Agency name", category: "identity" },
  agency_type: { label: "Type of agency", category: "identity" },
  employer: { label: "Employer name", category: "identity" },
  
  // Timeline
  month_year: { label: "Month/Year", category: "timeline" },
  date_range: { label: "Date range", category: "timeline" },
  first_use: { label: "First occurrence", category: "timeline" },
  last_use: { label: "Last occurrence", category: "timeline" },
  
  // Location
  location_city: { label: "City", category: "location" },
  location_state: { label: "State", category: "location" },
  location_general: { label: "General location", category: "location" },
  
  // Role/Position
  position: { label: "Position/Role", category: "role" },
  role: { label: "Role in incident", category: "role" },
  relationship: { label: "Relationship to other party", category: "role" },
  
  // Substance/Weapon
  substance: { label: "Substance involved", category: "material" },
  weapon_type: { label: "Type of weapon", category: "material" },
  
  // Outcome/Consequences
  outcome: { label: "Outcome", category: "outcome" },
  legal_result: { label: "Legal result", category: "outcome" },
  discipline: { label: "Disciplinary action", category: "outcome" },
  termination_reason: { label: "Reason for termination", category: "outcome" },
  charges: { label: "Charges filed", category: "outcome" },
  
  // Severity/Impact
  injuries: { label: "Injuries", category: "impact" },
  property_damage: { label: "Property damage", category: "impact" },
  amount: { label: "Amount involved", category: "impact" },
  frequency: { label: "Frequency", category: "impact" },
  
  // Context/Risk
  circumstances: { label: "Circumstances", category: "context" },
  what_happened: { label: "What happened", category: "context" },
  motivation: { label: "Motivation", category: "context" },
  
  // Reflection (always ask)
  lessons_learned: { label: "Lessons learned", category: "reflection" },
  changes_since: { label: "Changes since", category: "reflection" },
  would_do_differently: { label: "Would do differently", category: "reflection" }
};

// ============================================================================
// PACK ANCHOR CONFIGURATIONS
// ============================================================================

export const PACK_ANCHOR_CONFIG = {
  // ============================================================
  // PRIOR LAW ENFORCEMENT APPLICATIONS
  // ============================================================
  "PACK_PRIOR_LE_APPS_STANDARD": {
    packId: "PACK_PRIOR_LE_APPS_STANDARD",
    anchors: [
      "agency_name",
      "position_title",
      "application_month_year",
      "application_outcome",
      "application_city",
      "application_state",
      "reason_not_hired",
      "appeal_or_reapply",
      "anything_else"
    ],
    
    // Opening field captures multiple anchors at once
    openerField: "PACK_PRLE_Q01",
    
    fields: {
      // Opening narrative - captures agency, position, and timing
      "PACK_PRLE_Q01": {
        captures: ["agency_name", "position_title", "application_month_year"],
        alwaysAsk: true, // Opening is always asked
        isOpener: true
      },
      // Outcome - always ask after opener
      "PACK_PRLE_Q02": {
        captures: ["application_outcome"],
        requiresMissing: [], // Always ask - critical field
        alwaysAsk: true
      },
      // Location - only if not captured in opener
      "PACK_PRLE_Q03": {
        captures: ["application_city", "application_state"],
        requiresMissing: ["application_city", "application_state"],
        alwaysAsk: false
      },
      // Time period - ONLY if not captured in opener (key gating logic)
      "PACK_PRLE_Q04": {
        captures: ["application_month_year"],
        requiresMissing: ["application_month_year"],
        alwaysAsk: false
      },
      // Position - only if not captured in opener
      "PACK_PRLE_Q05": {
        captures: ["position_title"],
        requiresMissing: ["position_title"],
        alwaysAsk: false
      },
      // Detailed outcome - only if outcome was "not selected"
      "PACK_PRLE_Q06": {
        captures: ["application_outcome"],
        requiresMissing: [],
        skipUnless: { application_outcome: ["not selected", "disqualified", "rejected", "not hired"] },
        alwaysAsk: false
      },
      // Reason not hired - conditional
      "PACK_PRLE_Q07": {
        captures: ["reason_not_hired"],
        requiresMissing: ["reason_not_hired"],
        skipUnless: { application_outcome: ["not selected", "disqualified", "rejected", "not hired"] },
        alwaysAsk: false
      },
      // Appeal - optional context
      "PACK_PRLE_Q08": {
        captures: ["appeal_or_reapply"],
        requiresMissing: [],
        alwaysAsk: false
      },
      // Anything else - always ask as closer
      "PACK_PRLE_Q09": {
        captures: ["anything_else"],
        alwaysAsk: true,
        isCloser: true
      }
    }
  },

  // ============================================================
  // DRIVING COLLISION
  // ============================================================
  "PACK_DRIVING_COLLISION_STANDARD": {
    packId: "PACK_DRIVING_COLLISION_STANDARD",
    anchors: ["month_year", "location_general", "what_happened", "outcome", "injuries", "property_damage", "at_fault"],
    
    openerField: "PACK_DRIVING_COLLISION_Q01",
    
    fields: {
      // Opening: Date + brief description
      "PACK_DRIVING_COLLISION_Q01": {
        captures: ["month_year", "what_happened", "location_general"],
        alwaysAsk: true,
        isOpener: true
      },
      // Location - only if not in opener
      "PACK_DRIVING_COLLISION_Q02": {
        captures: ["location_general"],
        requiresMissing: ["location_general"],
        alwaysAsk: false
      },
      // Description - only if not in opener
      "PACK_DRIVING_COLLISION_Q03": {
        captures: ["what_happened"],
        requiresMissing: ["what_happened"],
        alwaysAsk: false
      },
      // At fault - always ask
      "PACK_DRIVING_COLLISION_Q04": {
        captures: ["at_fault"],
        alwaysAsk: true
      },
      // Injuries - always ask
      "PACK_DRIVING_COLLISION_Q05": {
        captures: ["injuries"],
        alwaysAsk: true
      },
      // Property damage - only if not mentioned
      "PACK_DRIVING_COLLISION_Q06": {
        captures: ["property_damage"],
        requiresMissing: ["property_damage"],
        alwaysAsk: false
      },
      // Citations - always ask
      "PACK_DRIVING_COLLISION_Q07": {
        captures: ["outcome"],
        alwaysAsk: true
      }
    }
  },

  // ============================================================
  // DUI/DWI
  // ============================================================
  "PACK_DRIVING_DUIDWI_STANDARD": {
    packId: "PACK_DRIVING_DUIDWI_STANDARD",
    anchors: ["substance", "month_year", "location_general", "outcome", "legal_result"],
    
    openerField: "PACK_DRIVING_DUIDWI_Q01",
    
    fields: {
      "PACK_DRIVING_DUIDWI_Q01": {
        captures: ["month_year", "location_general"],
        alwaysAsk: true,
        isOpener: true
      },
      "PACK_DRIVING_DUIDWI_Q02": {
        captures: ["location_general"],
        requiresMissing: ["location_general"],
        alwaysAsk: false
      },
      "PACK_DRIVING_DUIDWI_Q03": {
        captures: ["substance"],
        alwaysAsk: true
      },
      "PACK_DRIVING_DUIDWI_Q04": {
        captures: [],
        alwaysAsk: true
      },
      "PACK_DRIVING_DUIDWI_Q05": {
        captures: [],
        alwaysAsk: false
      },
      "PACK_DRIVING_DUIDWI_Q06": {
        captures: [],
        alwaysAsk: false
      },
      "PACK_DRIVING_DUIDWI_Q07": {
        captures: ["outcome"],
        alwaysAsk: true
      },
      "PACK_DRIVING_DUIDWI_Q08": {
        captures: ["legal_result"],
        alwaysAsk: true
      },
      "PACK_DRIVING_DUIDWI_Q09": {
        captures: [],
        alwaysAsk: false
      }
    }
  },

  // ============================================================
  // DOMESTIC VIOLENCE
  // ============================================================
  "PACK_DOMESTIC_VIOLENCE_STANDARD": {
    packId: "PACK_DOMESTIC_VIOLENCE_STANDARD",
    anchors: ["month_year", "location_general", "relationship", "what_happened", "injuries", "outcome", "legal_result"],
    
    openerField: "incident_date",
    
    fields: {
      "incident_date": {
        captures: ["month_year"],
        alwaysAsk: true,
        isOpener: true
      },
      "location": {
        captures: ["location_general"],
        requiresMissing: ["location_general"],
        alwaysAsk: false
      },
      "relationship": {
        captures: ["relationship"],
        alwaysAsk: true
      },
      "incident_type": {
        captures: ["what_happened"],
        alwaysAsk: true
      },
      "circumstances": {
        captures: ["what_happened"],
        requiresMissing: ["what_happened"],
        alwaysAsk: false
      },
      "injuries": {
        captures: ["injuries"],
        alwaysAsk: true
      },
      "legal_outcome": {
        captures: ["legal_result", "outcome"],
        alwaysAsk: true
      }
    }
  },

  // ============================================================
  // ASSAULT
  // ============================================================
  "PACK_ASSAULT_STANDARD": {
    packId: "PACK_ASSAULT_STANDARD",
    anchors: ["month_year", "location_general", "what_happened", "injuries", "outcome", "legal_result"],
    
    fields: {
      "incident_date": {
        captures: ["month_year"],
        alwaysAsk: true,
        isOpener: true
      },
      "location": {
        captures: ["location_general"],
        requiresMissing: ["location_general"],
        alwaysAsk: false
      },
      "circumstances": {
        captures: ["what_happened"],
        alwaysAsk: true
      },
      "injuries": {
        captures: ["injuries"],
        alwaysAsk: true
      },
      "legal_outcome": {
        captures: ["legal_result", "outcome"],
        alwaysAsk: true
      }
    }
  },

  // ============================================================
  // THEFT
  // ============================================================
  "PACK_THEFT_STANDARD": {
    packId: "PACK_THEFT_STANDARD",
    anchors: ["month_year", "location_general", "what_happened", "amount", "outcome", "legal_result"],
    
    fields: {
      "incident_date": {
        captures: ["month_year"],
        alwaysAsk: true,
        isOpener: true
      },
      "location": {
        captures: ["location_general"],
        requiresMissing: ["location_general"],
        alwaysAsk: false
      },
      "what_stolen": {
        captures: ["what_happened"],
        alwaysAsk: true
      },
      "value": {
        captures: ["amount"],
        alwaysAsk: false
      },
      "circumstances": {
        captures: ["what_happened"],
        requiresMissing: ["what_happened"],
        alwaysAsk: false
      },
      "legal_outcome": {
        captures: ["legal_result", "outcome"],
        alwaysAsk: true
      }
    }
  },

  // ============================================================
  // DRUG USE
  // ============================================================
  "PACK_DRUG_USE_STANDARD": {
    packId: "PACK_DRUG_USE_STANDARD",
    anchors: ["substance", "first_use", "last_use", "frequency", "outcome"],
    
    fields: {
      "substance_type": {
        captures: ["substance"],
        alwaysAsk: true,
        isOpener: true
      },
      "first_use_date": {
        captures: ["first_use"],
        alwaysAsk: true
      },
      "last_use_date": {
        captures: ["last_use"],
        alwaysAsk: true
      },
      "total_uses": {
        captures: ["frequency"],
        alwaysAsk: true
      },
      "consequences": {
        captures: ["outcome"],
        alwaysAsk: true
      }
    }
  },

  // ============================================================
  // EMPLOYMENT
  // ============================================================
  "PACK_EMPLOYMENT_STANDARD": {
    packId: "PACK_EMPLOYMENT_STANDARD",
    anchors: ["employer", "position", "month_year", "what_happened", "outcome", "termination_reason"],
    
    fields: {
      "employer": {
        captures: ["employer"],
        alwaysAsk: true,
        isOpener: true
      },
      "position": {
        captures: ["position"],
        requiresMissing: ["position"],
        alwaysAsk: false
      },
      "incident_date": {
        captures: ["month_year"],
        alwaysAsk: true
      },
      "incident_type": {
        captures: ["what_happened"],
        alwaysAsk: true
      },
      "circumstances": {
        captures: ["what_happened"],
        requiresMissing: ["what_happened"],
        alwaysAsk: false
      },
      "outcome": {
        captures: ["outcome", "termination_reason"],
        alwaysAsk: true
      }
    }
  },

  // ============================================================
  // INTEGRITY APPS
  // ============================================================
  "PACK_INTEGRITY_APPS": {
    packId: "PACK_INTEGRITY_APPS",
    anchors: ["agency_name", "position", "month_year", "what_happened", "outcome"],
    
    fields: {
      "agency": {
        captures: ["agency_name"],
        alwaysAsk: true,
        isOpener: true
      },
      "stage": {
        captures: [],
        alwaysAsk: true
      },
      "incident_type": {
        captures: ["what_happened"],
        alwaysAsk: true
      },
      "conduct_description": {
        captures: ["what_happened"],
        requiresMissing: ["what_happened"],
        alwaysAsk: false
      },
      "date": {
        captures: ["month_year"],
        requiresMissing: ["month_year"],
        alwaysAsk: false
      },
      "outcome": {
        captures: ["outcome"],
        alwaysAsk: true
      }
    }
  },

  // ============================================================
  // GENERAL CRIME
  // ============================================================
  "PACK_GENERAL_CRIME_STANDARD": {
    packId: "PACK_GENERAL_CRIME_STANDARD",
    anchors: ["month_year", "location_general", "what_happened", "charges", "outcome", "legal_result"],
    
    fields: {
      "incident_type": {
        captures: ["what_happened"],
        alwaysAsk: true,
        isOpener: true
      },
      "incident_date": {
        captures: ["month_year"],
        alwaysAsk: true
      },
      "location": {
        captures: ["location_general"],
        requiresMissing: ["location_general"],
        alwaysAsk: false
      },
      "description": {
        captures: ["what_happened"],
        requiresMissing: ["what_happened"],
        alwaysAsk: false
      },
      "legal_outcome": {
        captures: ["legal_result", "outcome", "charges"],
        alwaysAsk: true
      }
    }
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get anchor configuration for a pack
 * @param {string} packId 
 * @returns {object|null}
 */
export function getPackAnchorConfig(packId) {
  return PACK_ANCHOR_CONFIG[packId] || null;
}

/**
 * Get field configuration within a pack
 * @param {string} packId 
 * @param {string} fieldKey 
 * @returns {object|null}
 */
export function getFieldAnchorConfig(packId, fieldKey) {
  const packConfig = PACK_ANCHOR_CONFIG[packId];
  if (!packConfig) return null;
  return packConfig.fields[fieldKey] || null;
}

/**
 * Check if a field should be skipped based on collected anchors
 * @param {string} packId 
 * @param {string} fieldKey 
 * @param {object} collectedAnchors - Map of anchor key to value
 * @param {object} fieldValues - Map of field key to value (for conditional logic)
 * @returns {{skip: boolean, reason: string}}
 */
export function shouldSkipField(packId, fieldKey, collectedAnchors = {}, fieldValues = {}) {
  const fieldConfig = getFieldAnchorConfig(packId, fieldKey);
  
  if (!fieldConfig) {
    // No config - don't skip by default
    return { skip: false, reason: "no_config" };
  }
  
  // Always ask fields are never skipped
  if (fieldConfig.alwaysAsk) {
    return { skip: false, reason: "always_ask" };
  }
  
  // Check skipUnless conditions (conditional fields)
  if (fieldConfig.skipUnless) {
    for (const [conditionField, conditionValues] of Object.entries(fieldConfig.skipUnless)) {
      const actualValue = (fieldValues[conditionField] || "").toLowerCase().trim();
      const matchesCondition = conditionValues.some(v => 
        actualValue.includes(v.toLowerCase())
      );
      if (!matchesCondition) {
        return { skip: true, reason: `skipUnless_not_met:${conditionField}` };
      }
    }
  }
  
  // Check if required anchors are missing
  if (fieldConfig.requiresMissing && fieldConfig.requiresMissing.length > 0) {
    const stillMissing = fieldConfig.requiresMissing.filter(anchor => {
      const value = collectedAnchors[anchor];
      return !value || value.trim() === "" || isVagueAnswer(value);
    });
    
    if (stillMissing.length === 0) {
      // All required anchors are already collected - skip this field
      return { 
        skip: true, 
        reason: `anchors_already_collected:${fieldConfig.requiresMissing.join(',')}` 
      };
    }
  }
  
  return { skip: false, reason: "needs_anchors" };
}

/**
 * Check if an answer is too vague to count as "collected"
 * @param {string} value 
 * @returns {boolean}
 */
function isVagueAnswer(value) {
  if (!value) return true;
  const normalized = value.toLowerCase().trim();
  
  const vaguePatterns = [
    "i don't know",
    "i dont know",
    "i don't recall",
    "i dont recall",
    "i don't remember",
    "i dont remember",
    "not sure",
    "unknown",
    "n/a",
    "na"
  ];
  
  return vaguePatterns.some(p => normalized.includes(p));
}

/**
 * Extract month/year from text (e.g., "March 2022", "03/2022", "Jan 2020")
 * @param {string} text 
 * @returns {{value: string|null, confidence: "high"|"medium"|"low"|null}}
 */
export function extractMonthYear(text) {
  if (!text) return { value: null, confidence: null };
  
  const normalized = text.toLowerCase().trim();
  
  // Month names mapping
  const monthNames = {
    'january': '01', 'jan': '01',
    'february': '02', 'feb': '02',
    'march': '03', 'mar': '03',
    'april': '04', 'apr': '04',
    'may': '05',
    'june': '06', 'jun': '06',
    'july': '07', 'jul': '07',
    'august': '08', 'aug': '08',
    'september': '09', 'sep': '09', 'sept': '09',
    'october': '10', 'oct': '10',
    'november': '11', 'nov': '11',
    'december': '12', 'dec': '12'
  };
  
  // Pattern 1: "March 2022", "Jan 2020", "September 2019"
  const monthNamePattern = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s*,?\s*(20\d{2}|19\d{2})\b/i;
  const match1 = text.match(monthNamePattern);
  if (match1) {
    const monthKey = match1[1].toLowerCase();
    const month = monthNames[monthKey];
    const year = match1[2];
    return { value: `${year}-${month}`, confidence: "high" };
  }
  
  // Pattern 2: "03/2022", "3/2022", "03-2022"
  const numericPattern = /\b(0?[1-9]|1[0-2])[\/\-](20\d{2}|19\d{2})\b/;
  const match2 = text.match(numericPattern);
  if (match2) {
    const month = match2[1].padStart(2, '0');
    const year = match2[2];
    return { value: `${year}-${month}`, confidence: "high" };
  }
  
  // Pattern 3: Just year "2022", "in 2020"
  const yearOnlyPattern = /\b(20\d{2}|19\d{2})\b/;
  const match3 = text.match(yearOnlyPattern);
  if (match3) {
    return { value: match3[1], confidence: "medium" };
  }
  
  // Pattern 4: Approximate terms "early 2020", "late 2019", "around 2021"
  const approxPattern = /\b(early|late|mid|around|about|spring|summer|fall|winter|beginning of|end of)\s*(20\d{2}|19\d{2})\b/i;
  const match4 = text.match(approxPattern);
  if (match4) {
    return { value: `${match4[1]} ${match4[2]}`, confidence: "medium" };
  }
  
  return { value: null, confidence: null };
}

/**
 * Extract anchors from PACK_PRIOR_LE_APPS_STANDARD Q01 opener answer
 * @param {string} text - The candidate's answer to Q01
 * @returns {object} Map of anchor key to extracted value
 */
export function extractPriorLeAppsAnchors(text) {
  if (!text || text.trim().length < 5) return {};
  
  const anchors = {};
  
  // Extract month/year
  const dateResult = extractMonthYear(text);
  if (dateResult.value && (dateResult.confidence === "high" || dateResult.confidence === "medium")) {
    anchors.application_month_year = dateResult.value;
    console.log(`[ANCHOR_EXTRACT] application_month_year="${dateResult.value}" confidence=${dateResult.confidence}`);
  }
  
  // Extract position (look for common LE position keywords)
  const positionPatterns = [
    /\b(police officer|officer|deputy|sheriff|detective|sergeant|lieutenant|captain|trooper|agent|corrections officer|correctional officer|dispatcher|cadet)\b/i
  ];
  for (const pattern of positionPatterns) {
    const match = text.match(pattern);
    if (match) {
      anchors.position_title = match[1];
      console.log(`[ANCHOR_EXTRACT] position_title="${match[1]}"`);
      break;
    }
  }
  
  // Extract agency name - take the first substantial phrase before common keywords
  // This is a heuristic - real extraction happens in factExtractor
  const agencyPatterns = [
    /^([A-Z][A-Za-z\s]+(?:Police|Sheriff|Department|PD|SO|Agency))/i,
    /\b([A-Z][A-Za-z\s]+(?:Police|Sheriff|Department|PD|SO|Agency))\b/i
  ];
  for (const pattern of agencyPatterns) {
    const match = text.match(pattern);
    if (match && match[1].length > 3) {
      anchors.agency_name = match[1].trim();
      console.log(`[ANCHOR_EXTRACT] agency_name="${match[1].trim()}"`);
      break;
    }
  }
  
  return anchors;
}

/**
 * Extract anchors from a field value based on pack configuration
 * This is a simple heuristic - the real extraction happens in factExtractor
 * @param {string} packId 
 * @param {string} fieldKey 
 * @param {string} value 
 * @returns {object} Map of anchor key to extracted value
 */
export function extractAnchorsFromField(packId, fieldKey, value) {
  const fieldConfig = getFieldAnchorConfig(packId, fieldKey);
  if (!fieldConfig || !fieldConfig.captures || !value) {
    return {};
  }
  
  const extracted = {};
  const normalized = value.toLowerCase();
  
  for (const anchor of fieldConfig.captures) {
    // Simple heuristic - if the field captures this anchor and has a value, mark it
    // The real extraction with semantic understanding happens in factExtractor
    if (value.trim().length > 5 && !isVagueAnswer(value)) {
      extracted[anchor] = value;
    }
  }
  
  return extracted;
}

/**
 * Get the next field to ask based on collected anchors
 * @param {string} packId 
 * @param {string} currentFieldKey 
 * @param {object} collectedAnchors 
 * @param {object} fieldValues 
 * @param {string[]} fieldOrder - Ordered array of field keys
 * @returns {{fieldKey: string|null, reason: string}}
 */
export function getNextField(packId, currentFieldKey, collectedAnchors, fieldValues, fieldOrder) {
  const packConfig = PACK_ANCHOR_CONFIG[packId];
  if (!packConfig) {
    // No config - use default order
    const currentIndex = fieldOrder.indexOf(currentFieldKey);
    const nextField = fieldOrder[currentIndex + 1] || null;
    return { fieldKey: nextField, reason: "no_pack_config" };
  }
  
  const currentIndex = fieldOrder.indexOf(currentFieldKey);
  
  // Check each subsequent field
  for (let i = currentIndex + 1; i < fieldOrder.length; i++) {
    const candidateField = fieldOrder[i];
    const skipResult = shouldSkipField(packId, candidateField, collectedAnchors, fieldValues);
    
    if (!skipResult.skip) {
      console.log(`[ANCHOR_GATING][NEXT_FIELD] pack=${packId} current=${currentFieldKey} next=${candidateField} reason=${skipResult.reason}`);
      return { fieldKey: candidateField, reason: skipResult.reason };
    } else {
      console.log(`[ANCHOR_GATING][SKIP_FIELD] pack=${packId} field=${candidateField} reason=${skipResult.reason}`);
    }
  }
  
  // All fields checked - pack is complete
  return { fieldKey: null, reason: "pack_complete" };
}

/**
 * Log field skip decision for QA/debugging
 * @param {string} packId 
 * @param {string} fieldKey 
 * @param {string} reason 
 * @param {string[]} anchors 
 */
export function logFieldSkip(packId, fieldKey, reason, anchors = []) {
  console.log(`[V2_PACK][SKIP_FIELD] pack=${packId} field=${fieldKey} reason="${reason}" anchors=[${anchors.join(',')}]`);
}

/**
 * Log field ask decision for QA/debugging
 * @param {string} packId 
 * @param {string} fieldKey 
 * @param {string[]} missingAnchors 
 */
export function logFieldAsk(packId, fieldKey, missingAnchors = []) {
  console.log(`[V2_PACK][ASK_FIELD] pack=${packId} field=${fieldKey} missingAnchors=[${missingAnchors.join(',')}]`);
}

/**
 * Log pack completion for QA/debugging
 * @param {string} packId 
 * @param {number} instanceNumber 
 * @param {object} collectedAnchors 
 */
export function logPackComplete(packId, instanceNumber, collectedAnchors = {}) {
  const summary = Object.keys(collectedAnchors).join(',');
  console.log(`[V2_PACK][COMPLETE] pack=${packId} instance=${instanceNumber} anchorsCollected=[${summary}]`);
}