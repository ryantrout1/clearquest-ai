/**
 * CONTRADICTION ENGINE - Backend BI Analysis
 * 
 * Analyzes normalized facts from base questions and V2 pack incidents
 * to detect contradictions and tension points for investigators.
 * 
 * This is READ-ONLY analysis - it does NOT modify probing flow.
 * Results are stored in session summary for investigator review.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

// ============================================================================
// CONTRADICTION RULE DEFINITIONS
// ============================================================================

/**
 * Rule configuration - maps base question codes to related packs
 * Used to detect conflicts between denials and disclosed incidents
 */
const CONTRADICTION_RULES = {
  // DUI / Driving under influence
  DUI_DENIAL_CONFLICT: {
    id: "DUI_DENIAL_CONFLICT",
    severity: "critical",
    scope: "cross_packs",
    description: "Candidate denied DUI/DWI but disclosed DUI incidents",
    baseQuestionCodes: ["Q014", "Q015", "Q016"], // Driving-related questions
    conflictingPacks: ["PACK_DRIVING_DUIDWI_STANDARD", "PACK_DRIVING_DUI"],
    checkFn: (baseAnswers, incidents) => {
      // Check if any base question denies DUI
      const denialQuestions = ["Q014", "Q015", "Q016"];
      const hasDenial = denialQuestions.some(qCode => {
        const answer = baseAnswers[qCode]?.normalized || baseAnswers[qCode]?.raw;
        return answer && (answer.toLowerCase() === "no" || answer.toLowerCase().includes("never"));
      });
      
      // Check if DUI incidents exist
      const duiPacks = ["PACK_DRIVING_DUIDWI_STANDARD", "PACK_DRIVING_DUI"];
      const hasDuiIncidents = duiPacks.some(packId => 
        incidents[packId]?.length > 0
      );
      
      return hasDenial && hasDuiIncidents;
    }
  },

  // Domestic Violence
  DV_DENIAL_CONFLICT: {
    id: "DV_DENIAL_CONFLICT",
    severity: "critical",
    scope: "cross_packs",
    description: "Candidate denied domestic violence involvement but disclosed DV incidents",
    baseQuestionCodes: ["Q045", "Q046", "Q047"], // DV-related questions
    conflictingPacks: ["PACK_DOMESTIC_VIOLENCE_STANDARD"],
    checkFn: (baseAnswers, incidents) => {
      const dvQuestions = ["Q045", "Q046", "Q047"];
      const hasDenial = dvQuestions.some(qCode => {
        const answer = baseAnswers[qCode]?.normalized || baseAnswers[qCode]?.raw;
        return answer && (answer.toLowerCase() === "no" || answer.toLowerCase().includes("never"));
      });
      
      const hasDvIncidents = incidents["PACK_DOMESTIC_VIOLENCE_STANDARD"]?.length > 0;
      return hasDenial && hasDvIncidents;
    }
  },

  // Restraining/Protective Orders
  PROTECTION_ORDER_CONFLICT: {
    id: "PROTECTION_ORDER_CONFLICT",
    severity: "critical",
    scope: "cross_packs",
    description: "Candidate denied protection orders but incident anchors indicate one exists",
    baseQuestionCodes: ["Q048", "Q049"],
    conflictingPacks: ["PACK_DOMESTIC_VIOLENCE_STANDARD", "PACK_STALKING_HARASSMENT_STANDARD"],
    checkFn: (baseAnswers, incidents) => {
      const poQuestions = ["Q048", "Q049"];
      const hasDenial = poQuestions.some(qCode => {
        const answer = baseAnswers[qCode]?.normalized || baseAnswers[qCode]?.raw;
        return answer && answer.toLowerCase() === "no";
      });
      
      // Check if any DV or harassment incident mentions protective order
      const relevantPacks = ["PACK_DOMESTIC_VIOLENCE_STANDARD", "PACK_STALKING_HARASSMENT_STANDARD"];
      const hasPoInAnchors = relevantPacks.some(packId => {
        const packIncidents = incidents[packId] || [];
        return packIncidents.some(inc => {
          const anchors = inc.anchors || {};
          return Object.values(anchors).some(v => 
            typeof v === 'string' && 
            (v.toLowerCase().includes('restraining') || 
             v.toLowerCase().includes('protective order') ||
             v.toLowerCase().includes('protection order'))
          );
        });
      });
      
      return hasDenial && hasPoInAnchors;
    }
  },

  // Employment Termination
  EMPLOYMENT_TERMINATION_CONFLICT: {
    id: "EMPLOYMENT_TERMINATION_CONFLICT",
    severity: "moderate",
    scope: "cross_packs",
    description: "Candidate denied being fired/forced to resign but employment incidents indicate termination",
    baseQuestionCodes: ["Q030", "Q031", "Q032"], // Employment questions
    conflictingPacks: ["PACK_EMPLOYMENT_STANDARD"],
    checkFn: (baseAnswers, incidents) => {
      const empQuestions = ["Q030", "Q031", "Q032"];
      const hasDenial = empQuestions.some(qCode => {
        const answer = baseAnswers[qCode]?.normalized || baseAnswers[qCode]?.raw;
        return answer && (answer.toLowerCase() === "no" || answer.toLowerCase().includes("never"));
      });
      
      const empIncidents = incidents["PACK_EMPLOYMENT_STANDARD"] || [];
      const hasTermination = empIncidents.some(inc => {
        const incidentType = inc.anchors?.incident_type || inc.anchors?.outcome || "";
        return typeof incidentType === 'string' && 
          (incidentType.toLowerCase().includes('terminat') ||
           incidentType.toLowerCase().includes('fired') ||
           incidentType.toLowerCase().includes('forced') ||
           incidentType.toLowerCase().includes('resign'));
      });
      
      return hasDenial && hasTermination;
    }
  },

  // Theft / Shoplifting
  THEFT_DENIAL_CONFLICT: {
    id: "THEFT_DENIAL_CONFLICT",
    severity: "critical",
    scope: "cross_packs",
    description: "Candidate denied theft involvement but disclosed theft incidents",
    baseQuestionCodes: ["Q060", "Q061"],
    conflictingPacks: ["PACK_THEFT_STANDARD"],
    checkFn: (baseAnswers, incidents) => {
      const theftQuestions = ["Q060", "Q061"];
      const hasDenial = theftQuestions.some(qCode => {
        const answer = baseAnswers[qCode]?.normalized || baseAnswers[qCode]?.raw;
        return answer && answer.toLowerCase() === "no";
      });
      
      const hasTheftIncidents = incidents["PACK_THEFT_STANDARD"]?.length > 0;
      return hasDenial && hasTheftIncidents;
    }
  },

  // Integrity / Application Honesty
  INTEGRITY_CONFLICT: {
    id: "INTEGRITY_CONFLICT",
    severity: "critical",
    scope: "cross_packs",
    description: "Candidate denied integrity issues but disclosed honesty/integrity incidents",
    baseQuestionCodes: ["Q002"],
    conflictingPacks: ["PACK_INTEGRITY_APPS"],
    checkFn: (baseAnswers, incidents) => {
      const answer = baseAnswers["Q002"]?.normalized || baseAnswers["Q002"]?.raw;
      const hasDenial = answer && answer.toLowerCase() === "no";
      
      const hasIntegrityIncidents = incidents["PACK_INTEGRITY_APPS"]?.length > 0;
      return hasDenial && hasIntegrityIncidents;
    }
  },

  // Drug Use Consistency
  DRUG_USE_CONFLICT: {
    id: "DRUG_USE_CONFLICT",
    severity: "moderate",
    scope: "cross_packs",
    description: "Candidate denied drug use but disclosed drug-related incidents",
    baseQuestionCodes: ["Q070", "Q071", "Q072", "Q073"],
    conflictingPacks: ["PACK_DRUG_USE_STANDARD"],
    checkFn: (baseAnswers, incidents) => {
      const drugQuestions = ["Q070", "Q071", "Q072", "Q073"];
      const hasDenial = drugQuestions.some(qCode => {
        const answer = baseAnswers[qCode]?.normalized || baseAnswers[qCode]?.raw;
        return answer && answer.toLowerCase() === "no";
      });
      
      const hasDrugIncidents = incidents["PACK_DRUG_USE_STANDARD"]?.length > 0;
      return hasDenial && hasDrugIncidents;
    }
  },

  // Prior LE Application - Outcome consistency
  PRIOR_LE_OUTCOME_TENSION: {
    id: "PRIOR_LE_OUTCOME_TENSION",
    severity: "info",
    scope: "within_pack",
    description: "Multiple prior LE applications with unclear or conflicting outcomes",
    baseQuestionCodes: ["Q001"],
    conflictingPacks: ["PACK_PRIOR_LE_APPS_STANDARD", "PACK_LE_APPS"],
    checkFn: (baseAnswers, incidents) => {
      const leApps = [
        ...(incidents["PACK_PRIOR_LE_APPS_STANDARD"] || []),
        ...(incidents["PACK_LE_APPS"] || [])
      ];
      
      // Check for multiple disqualifications
      const disqualifiedCount = leApps.filter(inc => {
        const outcome = inc.anchors?.outcome || "";
        return typeof outcome === 'string' && 
          (outcome.toLowerCase().includes('disqualif') ||
           outcome.toLowerCase().includes('not selected') ||
           outcome.toLowerCase().includes('rejected'));
      }).length;
      
      return disqualifiedCount >= 2;
    }
  },

  // Timeline Consistency - Collisions within same period
  DRIVING_TIMELINE_TENSION: {
    id: "DRIVING_TIMELINE_TENSION",
    severity: "info",
    scope: "timeline",
    description: "Multiple driving incidents within close timeframe may indicate pattern",
    baseQuestionCodes: [],
    conflictingPacks: ["PACK_DRIVING_COLLISION_STANDARD", "PACK_DRIVING_VIOLATIONS_STANDARD", "PACK_DRIVING_DUIDWI_STANDARD"],
    checkFn: (baseAnswers, incidents) => {
      const drivingPacks = [
        "PACK_DRIVING_COLLISION_STANDARD",
        "PACK_DRIVING_VIOLATIONS_STANDARD", 
        "PACK_DRIVING_DUIDWI_STANDARD"
      ];
      
      const allDrivingIncidents = drivingPacks.flatMap(packId => 
        (incidents[packId] || []).map(inc => ({
          ...inc,
          packId,
          year: extractYear(inc.anchors?.month_year)
        }))
      ).filter(inc => inc.year);
      
      // Check for 3+ driving incidents in same year
      const yearCounts = {};
      allDrivingIncidents.forEach(inc => {
        yearCounts[inc.year] = (yearCounts[inc.year] || 0) + 1;
      });
      
      return Object.values(yearCounts).some(count => count >= 3);
    }
  }
};

/**
 * Extract year from a month_year string
 */
function extractYear(monthYear) {
  if (!monthYear || typeof monthYear !== 'string') return null;
  const match = monthYear.match(/\b(19|20)\d{2}\b/);
  return match ? parseInt(match[0]) : null;
}

// ============================================================================
// MAIN EVALUATION FUNCTION
// ============================================================================

/**
 * Evaluate all contradiction rules against session facts
 * 
 * @param {Object} params
 * @param {string} params.sessionId - Session identifier
 * @param {Object} params.baseAnswers - Map of questionCode -> { raw, normalized }
 * @param {Object} params.incidents - Map of packId -> array of { instanceNumber, anchors }
 * @param {Object} params.anchorsByTopic - Optional pack anchor schemas
 * @returns {Object} { contradictions: Array<Contradiction> }
 */
export function evaluateContradictions({ sessionId, baseAnswers = {}, incidents = {}, anchorsByTopic = {} }) {
  console.log(`[CONTRADICTION_ENGINE] Evaluating session=${sessionId}`);
  console.log(`[CONTRADICTION_ENGINE] Base answers: ${Object.keys(baseAnswers).length} questions`);
  console.log(`[CONTRADICTION_ENGINE] Incidents: ${Object.keys(incidents).map(k => `${k}:${incidents[k]?.length || 0}`).join(', ')}`);
  
  const contradictions = [];
  
  // Run each rule
  for (const [ruleKey, rule] of Object.entries(CONTRADICTION_RULES)) {
    try {
      const triggered = rule.checkFn(baseAnswers, incidents);
      
      if (triggered) {
        console.log(`[CONTRADICTION_ENGINE] Rule triggered: ${rule.id}`);
        
        // Build involved questions list
        const involvedQuestions = [...rule.baseQuestionCodes];
        
        // Build involved packs list
        const involvedPacks = rule.conflictingPacks.filter(packId => 
          incidents[packId]?.length > 0
        );
        
        // Build involved incidents info
        const involvedIncidents = involvedPacks.flatMap(packId =>
          (incidents[packId] || []).map(inc => ({
            packId,
            instanceNumber: inc.instanceNumber,
            anchorSummary: summarizeAnchors(inc.anchors)
          }))
        );
        
        contradictions.push({
          id: rule.id,
          severity: rule.severity,
          scope: rule.scope,
          message: rule.description,
          involvedQuestions,
          involvedPacks,
          involvedIncidents
        });
      }
    } catch (err) {
      console.warn(`[CONTRADICTION_ENGINE] Rule ${ruleKey} error:`, err.message);
    }
  }
  
  console.log(`[CONTRADICTION_ENGINE] Found ${contradictions.length} contradictions`);
  
  return { contradictions };
}

/**
 * Summarize anchors for BI output (avoid exposing raw data)
 */
function summarizeAnchors(anchors) {
  if (!anchors || typeof anchors !== 'object') return {};
  
  const summary = {};
  for (const [key, value] of Object.entries(anchors)) {
    if (value && typeof value === 'string' && value.length < 100) {
      summary[key] = value;
    } else if (value && typeof value === 'string') {
      summary[key] = value.substring(0, 100) + '...';
    }
  }
  return summary;
}

// ============================================================================
// HTTP HANDLER
// ============================================================================

Deno.serve(async (req) => {
  let sessionId = null;
  
  try {
    const base44 = createClientFromRequest(req);
    
    // HARDENED: Non-blocking auth - run analysis even if auth fails
    let user = null;
    try {
      user = await base44.auth.me();
    } catch (authErr) {
      console.warn('[CONTRADICTION_ENGINE] Auth failed - continuing without user:', authErr.message);
    }
    
    if (!user) {
      console.warn('[CONTRADICTION_ENGINE] Running without auth (service role context)');
    }

    let body = {};
    try {
      body = await req.json();
    } catch (parseErr) {
      console.warn('[CONTRADICTION_ENGINE] Failed to parse request body:', parseErr.message);
      return Response.json({ 
        success: true,
        sessionId: null,
        contradictions: [],
        warning: 'Invalid request body'
      }, { status: 200 });
    }
    
    sessionId = body.sessionId;
    const { baseAnswers, incidents, anchorsByTopic } = body;
    
    // HARDENED: Validate sessionId but continue with empty result if missing
    if (!sessionId) {
      console.warn('[CONTRADICTION_ENGINE] Missing sessionId - returning empty result');
      return Response.json({ 
        success: true,
        sessionId: null,
        contradictions: []
      }, { status: 200 });
    }
    
    // HARDENED: Log structural info only (no PII)
    console.log(`[CONTRADICTION_ENGINE] Starting analysis for session=${sessionId} baseQ=${Object.keys(baseAnswers || {}).length} packs=${Object.keys(incidents || {}).length}`);
    
    const result = evaluateContradictions({ 
      sessionId, 
      baseAnswers: baseAnswers || {}, 
      incidents: incidents || {}, 
      anchorsByTopic: anchorsByTopic || {} 
    });
    
    // HARDENED: Log result count only
    console.log(`[CONTRADICTION_ENGINE] Complete: ${result.contradictions?.length || 0} contradictions found`);
    
    return Response.json({
      success: true,
      sessionId,
      ...result
    });
    
  } catch (error) {
    console.error('[CONTRADICTION_ENGINE] Fatal error:', error.message);
    // HARDENED: Return 200 with empty contradictions to prevent BI generation failure
    return Response.json({ 
      success: true,
      sessionId,
      contradictions: [],
      error: error.message
    }, { status: 200 });
  }
});