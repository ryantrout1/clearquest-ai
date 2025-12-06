/**
 * TEST FUNCTION: Verify V2 Prior LE Apps Anchor Extraction
 * 
 * Tests that probeEngineV2 correctly extracts application_outcome anchor
 * from PACK_PRIOR_LE_APPS_STANDARD / PACK_PRLE_Q01 narrative responses.
 * 
 * Expected: result.anchors.application_outcome === "disqualified"
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

// NOTE: Since probeEngineV2 is in a separate function file, we'll simulate its logic
// For a real integration test, you'd import from probeEngineV2.js if it exports the function

Deno.serve(async (req) => {
  try {
    console.log('[TEST][V2_PRIOR_LE_APPS] Starting anchor extraction test');

    // Test narrative with clear "disqualified" signal
    const narrative = "I applied to Phoenix Police Department for a police officer position around March 2022. I made it through the written test and interview but was disqualified during the background investigation because of a previous traffic violation.";

    // Build params that match what CandidateInterview sends to probeEngineV2
    const testParams = {
      pack_id: 'PACK_PRIOR_LE_APPS_STANDARD',
      field_key: 'PACK_PRLE_Q01',
      field_value: narrative,
      previous_probes_count: 0,
      session_id: 'TEST-SESSION-PRLE',
      base_question_code: 'Q001',
      instance_number: 1,
    };

    console.log('[TEST][V2_PRIOR_LE_APPS] Test payload:', JSON.stringify(testParams, null, 2));

    // Call the actual probeEngineV2 function endpoint
    const base44 = createClientFromRequest(req);
    
    console.log('[TEST][V2_PRIOR_LE_APPS] Calling probeEngineV2...');
    
    const probeResponse = await base44.functions.invoke('probeEngineV2', testParams);
    const rawResult = probeResponse.data || {};

    console.log('[TEST][V2_PRIOR_LE_APPS] Raw result from probeEngineV2:', JSON.stringify(rawResult, null, 2));

    // Normalize result
    const result = {
      mode: rawResult.mode || 'NONE',
      hasQuestion: !!rawResult.hasQuestion,
      anchors: rawResult.anchors || {},
      collectedAnchors: rawResult.collectedAnchors || {},
      followupsCount: rawResult.followupsCount ?? 0,
    };

    // Extract anchor values for easy inspection
    const outcomeAnchor = result.anchors.application_outcome || null;
    const outcomeCollected = result.collectedAnchors.application_outcome || null;

    // Determine test result
    const testPassed = outcomeAnchor === 'disqualified' && outcomeCollected === 'disqualified';

    console.log('[TEST][V2_PRIOR_LE_APPS] ========== TEST RESULT ==========');
    console.log('[TEST][V2_PRIOR_LE_APPS] Expected: application_outcome = "disqualified"');
    console.log('[TEST][V2_PRIOR_LE_APPS] Got anchors:', outcomeAnchor);
    console.log('[TEST][V2_PRIOR_LE_APPS] Got collectedAnchors:', outcomeCollected);
    console.log('[TEST][V2_PRIOR_LE_APPS] Test passed:', testPassed);
    console.log('[TEST][V2_PRIOR_LE_APPS] ===================================');

    // Return comprehensive test result
    return Response.json({
      ok: true,
      testPassed,
      test: 'PACK_PRIOR_LE_APPS_STANDARD / PACK_PRLE_Q01 anchor extraction',
      narrativeSample: narrative.substring(0, 100) + '...',
      result: {
        mode: result.mode,
        hasQuestion: result.hasQuestion,
        anchorsCount: Object.keys(result.anchors).length,
        collectedAnchorsCount: Object.keys(result.collectedAnchors).length,
        anchors: result.anchors,
        collectedAnchors: result.collectedAnchors,
      },
      outcomeAnchor,
      outcomeCollected,
      expectedOutcome: 'disqualified',
      diagnostics: {
        anchorsPresent: !!result.anchors,
        collectedAnchorsPresent: !!result.collectedAnchors,
        applicationOutcomeInAnchors: !!result.anchors.application_outcome,
        applicationOutcomeInCollected: !!result.collectedAnchors.application_outcome,
      }
    });

  } catch (error) {
    console.error('[TEST][V2_PRIOR_LE_APPS] Test failed with error:', error);
    return Response.json({
      ok: false,
      error: error.message || String(error),
      stack: error.stack,
    }, { status: 500 });
  }
});