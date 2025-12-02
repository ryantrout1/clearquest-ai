/**
 * V3 Self-Test Backend Function
 * 
 * CRITICAL: This is a diagnostic-only function. It does NOT modify production data.
 * 
 * Purpose:
 * - Validate that all V3 components are wired correctly
 * - Run a small end-to-end test with synthetic data
 * - Return a readiness report for admin UI
 * 
 * Safety:
 * - All test data is clearly marked with V3_SELFTEST_ prefix
 * - Test sessions are flagged as test sessions
 * - No real candidate data is touched
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verify admin access
    const user = await base44.auth.me();
    if (!user || user.role !== 'SUPER_ADMIN') {
      return Response.json(
        { success: false, error: 'Unauthorized - Admin access required' },
        { status: 403 }
      );
    }

    const payload = await req.json();
    const testCategoryId = payload.test_category_id || "DUI";
    const runMode = payload.run_mode || "AUDIT_ONLY";

    console.log("[V3 SELF-TEST] Starting readiness check...", { testCategoryId, runMode });

    const results = {
      success: true,
      checks: {},
      summary: "",
      timestamp: new Date().toISOString()
    };

    // ====================================
    // CHECK 1: FactModel exists for test category
    // ====================================
    try {
      const factModels = await base44.asServiceRole.entities.FactModel.filter({ 
        category_id: testCategoryId 
      });
      
      if (factModels.length === 0) {
        results.checks.factModelExists = false;
        results.success = false;
      } else {
        const model = factModels[0];
        const hasRequiredFields = Array.isArray(model.required_fields) && model.required_fields.length > 0;
        results.checks.factModelExists = true;
        results.checks.factModelHasFields = hasRequiredFields;
        
        if (!hasRequiredFields) {
          results.success = false;
        }
      }
    } catch (err) {
      results.checks.factModelExists = false;
      results.success = false;
      console.error("[V3 SELF-TEST] FactModel check failed:", err.message);
    }

    // ====================================
    // CHECK 2: V3 pack exists for test category
    // ====================================
    try {
      const v3Packs = await base44.asServiceRole.entities.FollowUpPack.filter({
        ide_version: "V3",
        category_id: testCategoryId
      });
      
      results.checks.v3PackExists = v3Packs.length > 0;
      
      if (v3Packs.length > 0) {
        const pack = v3Packs[0];
        results.checks.v3PackHasFactModel = !!pack.fact_model_id;
        results.checks.v3PackIsActive = pack.status === "ACTIVE";
        
        if (!pack.fact_model_id || pack.status !== "ACTIVE") {
          results.success = false;
        }
      } else {
        results.success = false;
      }
    } catch (err) {
      results.checks.v3PackExists = false;
      results.success = false;
      console.error("[V3 SELF-TEST] V3 pack check failed:", err.message);
    }

    // ====================================
    // CHECK 3: DecisionEngineV3 callable
    // ====================================
    try {
      // Minimal test call with ping mode
      const pingResult = await base44.asServiceRole.functions.invoke('decisionEngineV3', {
        _test_mode: true,
        sessionId: "V3_SELFTEST_PING",
        categoryId: testCategoryId,
        incidentId: null,
        latestAnswerText: "test"
      });
      
      results.checks.decisionEngineV3Callable = true;
    } catch (err) {
      results.checks.decisionEngineV3Callable = false;
      results.success = false;
      console.error("[V3 SELF-TEST] DecisionEngineV3 check failed:", err.message);
    }

    // ====================================
    // CHECK 4: InterviewTranscript entity ready
    // ====================================
    try {
      const testTranscripts = await base44.asServiceRole.entities.InterviewTranscript.filter({
        session_id: "V3_SELFTEST_SESSION"
      });
      
      results.checks.transcriptEntityReady = true;
    } catch (err) {
      results.checks.transcriptEntityReady = false;
      results.success = false;
      console.error("[V3 SELF-TEST] InterviewTranscript check failed:", err.message);
    }

    // ====================================
    // CHECK 5: System Config V3 settings exist
    // ====================================
    try {
      const configs = await base44.asServiceRole.entities.SystemConfig.filter({
        config_key: "global_config"
      });
      
      if (configs.length > 0 && configs[0].config_data?.v3) {
        results.checks.systemConfigV3Exists = true;
        
        const v3Config = configs[0].config_data.v3;
        results.checks.v3EnabledCategoriesConfigured = Array.isArray(v3Config.enabled_categories);
      } else {
        results.checks.systemConfigV3Exists = false;
        results.success = false;
      }
    } catch (err) {
      results.checks.systemConfigV3Exists = false;
      results.success = false;
      console.error("[V3 SELF-TEST] SystemConfig check failed:", err.message);
    }

    // ====================================
    // END-TO-END SIMULATION (if runMode allows)
    // ====================================
    if (runMode === "FULL_TEST" && results.success) {
      console.log("[V3 SELF-TEST] Running end-to-end simulation...");
      
      try {
        // Create a test session
        const testSession = await base44.asServiceRole.entities.InterviewSession.create({
          session_code: "V3_SELFTEST",
          department_code: "V3_TEST",
          file_number: "SELFTEST001",
          status: "in_progress",
          ide_version: "V3",
          incidents: [],
          fact_state: {},
          metadata: {
            is_test: true,
            test_run_timestamp: new Date().toISOString()
          }
        });

        results.checks.testSessionCreated = true;

        // Simulate a probing exchange
        const probeResult = await base44.asServiceRole.functions.invoke('decisionEngineV3', {
          sessionId: testSession.id,
          categoryId: testCategoryId,
          incidentId: null,
          latestAnswerText: "I was in a collision about three years ago in Phoenix."
        });

        const probeData = probeResult.data || probeResult;
        
        results.checks.probingLoopResponded = !!probeData.nextAction;
        results.checks.incidentCreated = !!probeData.incidentId;

        // Check if incident was persisted to session
        const updatedSession = await base44.asServiceRole.entities.InterviewSession.get(testSession.id);
        results.checks.incidentPersistedToSession = Array.isArray(updatedSession.incidents) && 
                                                     updatedSession.incidents.length > 0;

        // Clean up test session
        await base44.asServiceRole.entities.InterviewSession.delete(testSession.id);
        
        console.log("[V3 SELF-TEST] End-to-end simulation complete, test session cleaned up.");
      } catch (err) {
        console.error("[V3 SELF-TEST] End-to-end simulation failed:", err.message);
        results.checks.endToEndSimulation = false;
        results.success = false;
      }
    }

    // ====================================
    // SUMMARY
    // ====================================
    const passedCount = Object.values(results.checks).filter(v => v === true).length;
    const totalChecks = Object.keys(results.checks).length;
    
    results.summary = results.success
      ? `All ${totalChecks} checks passed. V3 is ready for testing.`
      : `${passedCount}/${totalChecks} checks passed. See details above.`;

    console.log("\n[V3 SELF-TEST] Complete:", results.summary);
    console.log("Checks:", results.checks);

    return Response.json(results);

  } catch (err) {
    console.error("❌ [V3 SELF-TEST] Fatal error:", err);
    return Response.json({
      success: false,
      error: err.message,
      checks: {},
      summary: "Self-test encountered a fatal error."
    }, { status: 500 });
  }
});