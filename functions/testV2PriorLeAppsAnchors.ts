/**
 * TEST FUNCTION: Verify V2 Prior LE Apps Anchor Extraction
 * 
 * Tests that probeEngineV2 correctly extracts application_outcome anchor
 * from PACK_PRIOR_LE_APPS_STANDARD / PACK_PRLE_Q01 narrative responses.
 * 
 * Expected: result.anchors.application_outcome === "disqualified"
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    console.log('[TEST][V2_PRIOR_LE_APPS] ========================================');
    console.log('[TEST][V2_PRIOR_LE_APPS] Starting deterministic anchor extraction test');
    console.log('[TEST][V2_PRIOR_LE_APPS] ========================================');

    // Test narrative with clear "disqualified" signal
    const narrative = "I applied to Phoenix Police Department for a police officer position around March 2022. I made it through the written test and interview but was disqualified during the background investigation because of a previous traffic violation.";

    // Build params matching what the frontend sends to probeEngineV2
    // Populate ALL likely field value properties to ensure narrativeText is captured
    const testParams = {
      pack_id: 'PACK_PRIOR_LE_APPS_STANDARD',
      field_key: 'PACK_PRLE_Q01',
      field_value: narrative,
      fieldValue: narrative,
      fullNarrative: narrative,
      narrative: narrative,
      fieldValuePreview: narrative.slice(0, 120),
      previous_probes_count: 0,
      incident_context: {}, // Empty - first field in pack
      instance_number: 1,
      sectionName: 'Applications with Other Law Enforcement Agencies',
      baseQuestionText: 'Have you ever applied with any other law enforcement agency?',
      questionCode: 'Q001'
    };

    console.log('[TEST][V2_PRIOR_LE_APPS] Test payload:');
    console.log(JSON.stringify(testParams, null, 2));

    // Call the actual probeEngineV2 function endpoint
    const base44 = createClientFromRequest(req);
    
    console.log('[TEST][V2_PRIOR_LE_APPS] Invoking probeEngineV2 backend function...');
    console.log('[TEST][V2_PRIOR_LE_APPS] Test params being sent:', JSON.stringify(testParams, null, 2));
    
    const probeResponse = await base44.functions.invoke('probeEngineV2', testParams);
    const rawResult = probeResponse.data || {};

    console.log('[TEST][V2_PRIOR_LE_APPS] ========== RAW BACKEND RESPONSE ==========');
    console.log('[TEST][V2_PRIOR_LE_APPS] Raw response:', JSON.stringify(rawResult, null, 2));
    console.log('[TEST][V2_PRIOR_LE_APPS] Has anchors key:', Object.prototype.hasOwnProperty.call(rawResult, 'anchors'));
    console.log('[TEST][V2_PRIOR_LE_APPS] Has collectedAnchors key:', Object.prototype.hasOwnProperty.call(rawResult, 'collectedAnchors'));
    
    console.log("[PRIOR_LE_Q01_ANCHORS][TEST_RAW_RESPONSE]", {
      packId: rawResult?.pack_id,
      fieldKey: rawResult?.field_key,
      anchorsKeys: rawResult?.anchors ? Object.keys(rawResult.anchors) : [],
      collectedAnchorsKeys: rawResult?.collectedAnchors ? Object.keys(rawResult.collectedAnchors) : [],
      anchors: rawResult?.anchors,
      collectedAnchors: rawResult?.collectedAnchors,
    });

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
    const anchorsPresent = typeof result.anchors === 'object' && result.anchors !== null;
    const collectedPresent = typeof result.collectedAnchors === 'object' && result.collectedAnchors !== null;
    
    const expectedOutcome = 'disqualified';
    
    // Test passes if EITHER anchors OR collectedAnchors contains the expected outcome
    const testPassed = (
      (outcomeAnchor === expectedOutcome || outcomeCollected === expectedOutcome) &&
      anchorsPresent &&
      collectedPresent
    );

    console.log('[TEST][V2_PRIOR_LE_APPS] ========== TEST RESULT ==========');
    console.log('[TEST][V2_PRIOR_LE_APPS] Expected outcome:', expectedOutcome);
    console.log('[TEST][V2_PRIOR_LE_APPS] Got anchors.application_outcome:', outcomeAnchor);
    console.log('[TEST][V2_PRIOR_LE_APPS] Got collectedAnchors.application_outcome:', outcomeCollected);
    console.log('[TEST][V2_PRIOR_LE_APPS] Anchors object present:', anchorsPresent);
    console.log('[TEST][V2_PRIOR_LE_APPS] CollectedAnchors object present:', collectedPresent);
    console.log('[TEST][V2_PRIOR_LE_APPS] Anchors count:', Object.keys(result.anchors).length);
    console.log('[TEST][V2_PRIOR_LE_APPS] CollectedAnchors count:', Object.keys(result.collectedAnchors).length);
    console.log('[TEST][V2_PRIOR_LE_APPS] Test PASSED:', testPassed ? '✓ YES' : '✗ NO');
    console.log('[TEST][V2_PRIOR_LE_APPS] =====================================');

    // Return comprehensive test result
    return Response.json({
      ok: true,
      testPassed,
      packId: 'PACK_PRIOR_LE_APPS_STANDARD',
      fieldKey: 'PACK_PRLE_Q01',
      test: 'PACK_PRIOR_LE_APPS_STANDARD / PACK_PRLE_Q01 deterministic anchor extraction',
      narrativeSample: narrative.substring(0, 120) + '...',
      normalizedResult: {
        mode: result.mode,
        hasQuestion: result.hasQuestion,
        anchorsCount: Object.keys(result.anchors).length,
        collectedAnchorsCount: Object.keys(result.collectedAnchors).length,
        anchors: result.anchors,
        collectedAnchors: result.collectedAnchors,
      },
      sampleOutcome: outcomeAnchor,
      sampleOutcomeCollected: outcomeCollected,
      expectedOutcome,
      hasAnchorsKey: anchorsPresent,
      hasCollectedAnchorsKey: collectedPresent,
      diagnostics: {
        anchorsPresent,
        collectedAnchorsPresent: collectedPresent,
        applicationOutcomeInAnchors: !!result.anchors.application_outcome,
        applicationOutcomeInCollected: !!result.collectedAnchors.application_outcome,
        allAnchorKeys: Object.keys(result.anchors),
        allCollectedKeys: Object.keys(result.collectedAnchors)
      }
    });

  } catch (error) {
    console.error('[TEST][V2_PRIOR_LE_APPS] Test failed with error:', error);
    return Response.json({
      ok: false,
      testPassed: false,
      error: error.message || String(error),
      stack: error.stack,
    }, { status: 500 });
  }
});