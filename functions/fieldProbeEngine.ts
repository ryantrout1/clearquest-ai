/**
 * FIELD PROBE ENGINE - Per-field anchor-based probing
 * 
 * Called once per field in a pack to decide:
 * - ASK one more follow-up question, or
 * - STOP asking follow-up questions for this field
 * 
 * Input:
 * - fieldKey: Identifier of current field (e.g., "PACK_PRLE_Q01")
 * - fieldValue: Candidate's latest answer
 * - previousProbesCount: How many AI follow-ups asked for THIS field
 * - maxAiFollowups: Maximum allowed follow-ups for this field
 * - collectedAnchorKeys: Anchors already satisfied for this field
 * - targetAnchors: All anchors this field cares about
 * 
 * Output:
 * - {"mode": "QUESTION", "question": "..."} - Ask another question
 * - {"mode": "NO_QUESTION", "question": ""} - Stop asking
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

// ============================================================================
// ANCHOR DEFINITIONS BY FIELD
// ============================================================================

const FIELD_ANCHOR_CONFIG = {
  "PACK_PRLE_Q01": {
    targetAnchors: ["agency_type", "agency_name", "position", "month_year", "outcome"],
    maxProbes: 2
  }
  // Add more fields as needed
};

// ============================================================================
// QUESTION GENERATION
// ============================================================================

/**
 * Generate combined question for PACK_PRLE_Q01 missing anchors
 */
function buildPRLE_Q01_CombinedQuestion(missingAnchors) {
  const needsAgencyType = missingAnchors.includes("agency_type");
  const needsAgencyName = missingAnchors.includes("agency_name");
  const needsPosition = missingAnchors.includes("position");
  const needsMonthYear = missingAnchors.includes("month_year");
  
  const parts = [];
  
  // Always ask for agency name when missing
  if (needsAgencyName) {
    parts.push("what was the name of the agency or department");
  }
  
  if (needsAgencyType) {
    parts.push("what type of agency was it (city police department, sheriff's office, state agency, or federal agency)");
  }
  
  if (needsPosition) {
    parts.push("what position you applied for");
  }
  
  if (needsMonthYear) {
    parts.push("about what month and year did you apply");
  }
  
  if (parts.length === 0) return null;
  
  // Build question
  let question = "For this application, ";
  
  if (parts.length === 1) {
    question += parts[0] + "?";
  } else if (parts.length === 2) {
    question += parts[0] + " and " + parts[1] + "?";
  } else if (parts.length === 3) {
    question += parts[0] + ", " + parts[1] + ", and " + parts[2] + "?";
  } else {
    // 4 parts
    question += parts.slice(0, -1).join(", ") + ", and " + parts[parts.length - 1] + "?";
  }
  
  return question;
}

/**
 * Generate outcome question for PACK_PRLE_Q01
 */
function buildPRLE_Q01_OutcomeQuestion() {
  return "What was the outcome of your application?";
}

// ============================================================================
// MAIN DECISION LOGIC
// ============================================================================

/**
 * Decide whether to probe and generate question text
 */
function evaluateFieldProbe({
  fieldKey,
  fieldValue,
  previousProbesCount,
  maxAiFollowups,
  collectedAnchorKeys = [],
  targetAnchors = []
}) {
  console.log(`[FIELD_PROBE] fieldKey=${fieldKey} probes=${previousProbesCount}/${maxAiFollowups} collected=[${collectedAnchorKeys.join(',')}]`);
  
  // Hard limit 1: Max probes reached
  if (previousProbesCount >= maxAiFollowups) {
    console.log(`[FIELD_PROBE] STOP: Max probes reached`);
    return {
      mode: "NO_QUESTION",
      question: "",
      reason: "Max probes reached"
    };
  }
  
  // Compute remaining anchors
  const collectedSet = new Set(collectedAnchorKeys);
  const remainingAnchors = targetAnchors.filter(a => !collectedSet.has(a));
  
  console.log(`[FIELD_PROBE] remaining=[${remainingAnchors.join(',')}]`);
  
  // Hard limit 2: All anchors collected
  if (remainingAnchors.length === 0) {
    console.log(`[FIELD_PROBE] STOP: All anchors collected`);
    return {
      mode: "NO_QUESTION",
      question: "",
      reason: "All anchors collected"
    };
  }
  
  // ============================================================================
  // FIELD-SPECIFIC LOGIC: PACK_PRLE_Q01
  // ============================================================================
  
  if (fieldKey === "PACK_PRLE_Q01") {
    const coreAnchors = ["agency_type", "agency_name", "position", "month_year"];
    const missingCore = remainingAnchors.filter(a => coreAnchors.includes(a));
    const missingOutcome = remainingAnchors.includes("outcome");
    
    // Strategy: Ask for core anchors first (combined), then outcome if needed
    
    // If any core anchors missing and we haven't probed yet, ask combined
    if (missingCore.length > 0 && previousProbesCount === 0) {
      const question = buildPRLE_Q01_CombinedQuestion(missingCore);
      if (!question) {
        return { mode: "NO_QUESTION", question: "", reason: "Could not build question" };
      }
      console.log(`[FIELD_PROBE] ASK_COMBINED (core): "${question.substring(0, 60)}..."`);
      return {
        mode: "QUESTION",
        question,
        targetAnchors: missingCore,
        reason: "Asking for missing core anchors"
      };
    }
    
    // If core anchors collected but outcome missing, ask for outcome
    if (missingCore.length === 0 && missingOutcome && previousProbesCount < maxAiFollowups) {
      const question = buildPRLE_Q01_OutcomeQuestion();
      console.log(`[FIELD_PROBE] ASK_OUTCOME: "${question}"`);
      return {
        mode: "QUESTION",
        question,
        targetAnchors: ["outcome"],
        reason: "Asking for outcome"
      };
    }
    
    // If we've already asked once but still missing core, try one more combined
    if (missingCore.length > 0 && previousProbesCount === 1) {
      const question = buildPRLE_Q01_CombinedQuestion(missingCore);
      if (!question) {
        return { mode: "NO_QUESTION", question: "", reason: "Could not build question" };
      }
      console.log(`[FIELD_PROBE] ASK_COMBINED (retry): "${question.substring(0, 60)}..."`);
      return {
        mode: "QUESTION",
        question,
        targetAnchors: missingCore,
        reason: "Retry for missing core anchors"
      };
    }
    
    // Otherwise stop
    console.log(`[FIELD_PROBE] STOP: Logic exhausted`);
    return {
      mode: "NO_QUESTION",
      question: "",
      reason: "Logic exhausted for PACK_PRLE_Q01"
    };
  }
  
  // ============================================================================
  // GENERIC FALLBACK (for fields not specifically configured)
  // ============================================================================
  
  console.log(`[FIELD_PROBE] STOP: Field ${fieldKey} not configured`);
  return {
    mode: "NO_QUESTION",
    question: "",
    reason: `Field ${fieldKey} not configured`
  };
}

// ============================================================================
// HTTP HANDLER
// ============================================================================

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Non-blocking auth
    let user = null;
    try {
      user = await base44.auth.me();
    } catch (authErr) {
      console.warn('[FIELD_PROBE] Auth failed - continuing:', authErr.message);
    }
    
    if (!user) {
      console.warn('[FIELD_PROBE] Running without auth');
    }
    
    // Parse input
    let input = {};
    try {
      input = await req.json();
    } catch (parseErr) {
      console.error('[FIELD_PROBE] Parse error:', parseErr.message);
      return Response.json({
        mode: "NO_QUESTION",
        question: "",
        error: "Invalid request body"
      }, { status: 200 });
    }
    
    const {
      fieldKey,
      fieldValue,
      previousProbesCount = 0,
      maxAiFollowups = 2,
      collectedAnchorKeys = [],
      targetAnchors = []
    } = input;
    
    // Validate required fields
    if (!fieldKey) {
      console.error('[FIELD_PROBE] Missing fieldKey');
      return Response.json({
        mode: "NO_QUESTION",
        question: "",
        error: "Missing fieldKey"
      }, { status: 200 });
    }
    
    // Get config for this field
    const fieldConfig = FIELD_ANCHOR_CONFIG[fieldKey];
    const effectiveTargetAnchors = targetAnchors.length > 0 
      ? targetAnchors 
      : (fieldConfig?.targetAnchors || []);
    const effectiveMaxProbes = fieldConfig?.maxProbes || maxAiFollowups;
    
    console.log(`[FIELD_PROBE] Request: field=${fieldKey} value="${fieldValue?.substring?.(0, 50)}" probes=${previousProbesCount}/${effectiveMaxProbes}`);
    
    // Evaluate
    const result = evaluateFieldProbe({
      fieldKey,
      fieldValue,
      previousProbesCount,
      maxAiFollowups: effectiveMaxProbes,
      collectedAnchorKeys,
      targetAnchors: effectiveTargetAnchors
    });
    
    console.log(`[FIELD_PROBE] Result: mode=${result.mode} reason="${result.reason}"`);
    
    return Response.json({
      mode: result.mode,
      question: result.question,
      targetAnchors: result.targetAnchors,
      debug: {
        fieldKey,
        previousProbesCount,
        maxAiFollowups: effectiveMaxProbes,
        collectedAnchorKeys,
        remainingAnchors: effectiveTargetAnchors.filter(a => !collectedAnchorKeys.includes(a)),
        reason: result.reason
      }
    });
    
  } catch (error) {
    console.error('[FIELD_PROBE] Fatal error:', error.message);
    return Response.json({
      mode: "NO_QUESTION",
      question: "",
      error: error.message
    }, { status: 200 });
  }
});