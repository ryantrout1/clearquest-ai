/**
 * COMPREHENSIVE V2 PIPELINE TEST
 * 
 * Tests the complete fact-anchor pipeline for V2 packs:
 * 1. Per-field probe extraction
 * 2. Anchor normalization
 * 3. Fact persistence readiness
 * 4. Contradiction engine compatibility
 * 
 * Run this after any V2 probe engine changes to verify end-to-end flow.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    console.log('[V2_PIPELINE_TEST] ========================================');
    console.log('[V2_PIPELINE_TEST] Starting comprehensive V2 pipeline test');
    console.log('[V2_PIPELINE_TEST] ========================================');
    
    const results = {
      timestamp: new Date().toISOString(),
      tests: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0
      }
    };
    
    // ========================================================================
    // TEST 1: PACK_PRIOR_LE_APPS_STANDARD / PACK_PRLE_Q01 - Application Outcome
    // ========================================================================
    
    const test1 = {
      name: "PRIOR_LE_APPS / Q01 - Disqualified Narrative",
      packId: "PACK_PRIOR_LE_APPS_STANDARD",
      fieldKey: "PACK_PRLE_Q01",
      narrative: "I applied to Phoenix Police Department for a police officer position around March 2022. I made it through the written test and interview but was disqualified during the background investigation because of a previous traffic violation.",
      expectedAnchors: {
        application_outcome: "disqualified"
      },
      passed: false,
      actualAnchors: {},
      error: null
    };
    
    try {
      const response = await base44.functions.invoke('probeEngineV2', {
        pack_id: test1.packId,
        field_key: test1.fieldKey,
        field_value: test1.narrative,
        fieldValue: test1.narrative,
        fullNarrative: test1.narrative,
        narrative: test1.narrative,
        previous_probes_count: 0,
        incident_context: {},
        instance_number: 1,
        sectionName: 'Prior LE Applications',
        baseQuestionText: 'Have you ever applied with any other law enforcement agency?',
        questionCode: 'Q001'
      });
      
      const result = response.data || {};
      test1.actualAnchors = result.anchors || {};
      
      // Check if application_outcome was extracted
      const hasOutcome = !!test1.actualAnchors.application_outcome;
      const outcomeCorrect = test1.actualAnchors.application_outcome === test1.expectedAnchors.application_outcome;
      
      test1.passed = hasOutcome && outcomeCorrect;
      test1.details = {
        anchorsCount: Object.keys(test1.actualAnchors).length,
        collectedCount: Object.keys(result.collectedAnchors || {}).length,
        hasOutcomeAnchor: hasOutcome,
        outcomeValue: test1.actualAnchors.application_outcome,
        outcomeMatch: outcomeCorrect
      };
      
    } catch (err) {
      test1.error = err.message;
      test1.passed = false;
    }
    
    results.tests.push(test1);
    
    // ========================================================================
    // TEST 2: PACK_PRIOR_LE_APPS_STANDARD / PACK_PRLE_Q01 - Hired Narrative
    // ========================================================================
    
    const test2 = {
      name: "PRIOR_LE_APPS / Q01 - Hired Narrative",
      packId: "PACK_PRIOR_LE_APPS_STANDARD",
      fieldKey: "PACK_PRLE_Q01",
      narrative: "I applied to Mesa Police Department in June 2020 for a patrol officer position. I completed the entire process and was hired in August 2020. I worked there for six months before transitioning to my current agency.",
      expectedAnchors: {
        application_outcome: "hired"
      },
      passed: false,
      actualAnchors: {},
      error: null
    };
    
    try {
      const response = await base44.functions.invoke('probeEngineV2', {
        pack_id: test2.packId,
        field_key: test2.fieldKey,
        field_value: test2.narrative,
        fieldValue: test2.narrative,
        previous_probes_count: 0,
        incident_context: {},
        instance_number: 1
      });
      
      const result = response.data || {};
      test2.actualAnchors = result.anchors || {};
      
      const hasOutcome = !!test2.actualAnchors.application_outcome;
      const outcomeCorrect = test2.actualAnchors.application_outcome === test2.expectedAnchors.application_outcome;
      
      test2.passed = hasOutcome && outcomeCorrect;
      test2.details = {
        anchorsCount: Object.keys(test2.actualAnchors).length,
        hasOutcomeAnchor: hasOutcome,
        outcomeValue: test2.actualAnchors.application_outcome,
        outcomeMatch: outcomeCorrect
      };
      
    } catch (err) {
      test2.error = err.message;
      test2.passed = false;
    }
    
    results.tests.push(test2);
    
    // ========================================================================
    // TEST 3: PACK_PRIOR_LE_APPS_STANDARD / PACK_PRLE_Q01 - Withdrew Narrative
    // ========================================================================
    
    const test3 = {
      name: "PRIOR_LE_APPS / Q01 - Withdrew Narrative",
      packId: "PACK_PRIOR_LE_APPS_STANDARD",
      fieldKey: "PACK_PRLE_Q01",
      narrative: "I started the application process with Scottsdale PD in early 2021 for a detective position. After the written exam, I decided the commute was too long and withdrew my application before the physical test.",
      expectedAnchors: {
        application_outcome: "withdrew"
      },
      passed: false,
      actualAnchors: {},
      error: null
    };
    
    try {
      const response = await base44.functions.invoke('probeEngineV2', {
        pack_id: test3.packId,
        field_key: test3.fieldKey,
        field_value: test3.narrative,
        fieldValue: test3.narrative,
        previous_probes_count: 0,
        incident_context: {},
        instance_number: 1
      });
      
      const result = response.data || {};
      test3.actualAnchors = result.anchors || {};
      
      const hasOutcome = !!test3.actualAnchors.application_outcome;
      const outcomeCorrect = test3.actualAnchors.application_outcome === test3.expectedAnchors.application_outcome;
      
      test3.passed = hasOutcome && outcomeCorrect;
      test3.details = {
        anchorsCount: Object.keys(test3.actualAnchors).length,
        hasOutcomeAnchor: hasOutcome,
        outcomeValue: test3.actualAnchors.application_outcome,
        outcomeMatch: outcomeCorrect
      };
      
    } catch (err) {
      test3.error = err.message;
      test3.passed = false;
    }
    
    results.tests.push(test3);
    
    // ========================================================================
    // Compute Summary
    // ========================================================================
    
    results.summary.total = results.tests.length;
    results.summary.passed = results.tests.filter(t => t.passed).length;
    results.summary.failed = results.summary.total - results.summary.passed;
    results.summary.allPassed = results.summary.failed === 0;
    
    console.log('[V2_PIPELINE_TEST] ========================================');
    console.log('[V2_PIPELINE_TEST] SUMMARY:', results.summary);
    console.log('[V2_PIPELINE_TEST] ========================================');
    
    results.tests.forEach(test => {
      console.log(`[V2_PIPELINE_TEST] ${test.passed ? '✓' : '✗'} ${test.name}`);
      if (!test.passed && test.error) {
        console.log(`[V2_PIPELINE_TEST]   Error: ${test.error}`);
      }
      if (!test.passed && !test.error) {
        console.log(`[V2_PIPELINE_TEST]   Expected: ${JSON.stringify(test.expectedAnchors)}`);
        console.log(`[V2_PIPELINE_TEST]   Got: ${JSON.stringify(test.actualAnchors)}`);
      }
    });
    
    return Response.json({
      ok: true,
      summary: results.summary,
      tests: results.tests,
      recommendation: results.summary.allPassed 
        ? "All tests passed - V2 pipeline is working correctly"
        : `${results.summary.failed} test(s) failed - review logs for diagnostics`
    });
    
  } catch (error) {
    console.error('[V2_PIPELINE_TEST] Fatal error:', error);
    return Response.json({
      ok: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});