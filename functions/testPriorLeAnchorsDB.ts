/**
 * testPriorLeAnchorsDB - Diagnostic Tool
 * 
 * Tests whether PRIOR LE APPS anchors are being extracted and saved to the database.
 * 
 * Usage: Call with sessionId to check if anchors exist for PACK_PRLE_Q01
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Parse input - default to recent session for testing
    const { sessionId = '6935958f2309a6fefd9dbf70' } = await req.json().catch(() => ({}));
    
    console.log('[PRIOR_LE_ANCHORS_TEST][START]', { sessionId });
    
    // ============================================================
    // TEST 1: Check Response.additional_details.v2_anchors
    // ============================================================
    console.log('[TEST_1][RESPONSE] Checking Response.additional_details.v2_anchors...');
    
    const responses = await base44.asServiceRole.entities.Response.filter({
      session_id: sessionId,
      pack_id: 'PACK_PRIOR_LE_APPS_STANDARD',
      field_key: 'PACK_PRLE_Q01',
      instance_number: 1
    }, '-created_date', 1);
    
    const responseRecord = responses.length > 0 ? responses[0] : null;
    
    if (responseRecord) {
      const v2Anchors = responseRecord.additional_details?.v2_anchors;
      const savedAnchors = v2Anchors?.anchors;
      
      console.log('[TEST_1][RESPONSE][FOUND]', {
        responseId: responseRecord.id,
        hasAdditionalDetails: !!responseRecord.additional_details,
        hasV2Anchors: !!v2Anchors,
        savedAnchors,
        anchorKeys: savedAnchors ? Object.keys(savedAnchors).filter(k => savedAnchors[k] !== null) : []
      });
    } else {
      console.log('[TEST_1][RESPONSE][NOT_FOUND]', {
        sessionId,
        message: 'No Response record found for PACK_PRLE_Q01'
      });
    }
    
    // ============================================================
    // TEST 2: Check InterviewSession.structured_followup_facts
    // ============================================================
    console.log('[TEST_2][SESSION] Checking InterviewSession.structured_followup_facts...');
    
    const sessions = await base44.asServiceRole.entities.InterviewSession.filter({
      id: sessionId
    });
    
    if (sessions && sessions.length > 0) {
      const session = sessions[0];
      const structuredFacts = session.structured_followup_facts || [];
      
      // Filter for PRIOR LE APPS anchors
      const priorLeAnchors = Array.isArray(structuredFacts)
        ? structuredFacts.filter(fact => 
            fact.packId === 'PACK_PRIOR_LE_APPS_STANDARD' && 
            fact.fieldKey === 'PACK_PRLE_Q01'
          )
        : [];
      
      console.log('[TEST_2][SESSION][FOUND]', {
        sessionId,
        totalFactCount: Array.isArray(structuredFacts) ? structuredFacts.length : 0,
        priorLeAnchorCount: priorLeAnchors.length,
        priorLeAnchors,
        priorLeAnchorKeys: priorLeAnchors.map(a => a.key)
      });
      
      // Check for canonical keys
      const canonicalKeys = ['prior_le_agency', 'prior_le_position', 'prior_le_approx_date', 'application_outcome'];
      const foundCanonicalKeys = canonicalKeys.filter(key => 
        priorLeAnchors.some(a => a.key === key && a.value)
      );
      const missingCanonicalKeys = canonicalKeys.filter(key => 
        !priorLeAnchors.some(a => a.key === key && a.value)
      );
      
      console.log('[TEST_2][SESSION][CANONICAL]', {
        expectedKeys: canonicalKeys,
        foundKeys: foundCanonicalKeys,
        missingKeys: missingCanonicalKeys
      });
    } else {
      console.log('[TEST_2][SESSION][NOT_FOUND]', {
        sessionId,
        message: 'Session not found'
      });
    }
    
    // ============================================================
    // SUMMARY REPORT
    // ============================================================
    return Response.json({
      ok: true,
      sessionId,
      packId: 'PACK_PRIOR_LE_APPS_STANDARD',
      fieldKey: 'PACK_PRLE_Q01',
      results: {
        responseRecord: responseRecord ? {
          responseId: responseRecord.id,
          hasV2Anchors: !!responseRecord.additional_details?.v2_anchors,
          anchors: responseRecord.additional_details?.v2_anchors?.anchors,
          anchorKeys: responseRecord.additional_details?.v2_anchors?.anchors 
            ? Object.keys(responseRecord.additional_details.v2_anchors.anchors).filter(k => responseRecord.additional_details.v2_anchors.anchors[k] !== null)
            : []
        } : null,
        sessionFacts: sessions && sessions.length > 0 ? {
          totalFacts: Array.isArray(sessions[0].structured_followup_facts) ? sessions[0].structured_followup_facts.length : 0,
          priorLeAnchors: Array.isArray(sessions[0].structured_followup_facts)
            ? sessions[0].structured_followup_facts.filter(fact => 
                fact.packId === 'PACK_PRIOR_LE_APPS_STANDARD' && 
                fact.fieldKey === 'PACK_PRLE_Q01'
              )
            : [],
          canonicalStatus: {
            found: ['prior_le_agency', 'prior_le_position', 'prior_le_approx_date', 'application_outcome'].filter(key =>
              Array.isArray(sessions[0].structured_followup_facts) && sessions[0].structured_followup_facts.some(a => a.key === key && a.value)
            ),
            missing: ['prior_le_agency', 'prior_le_position', 'prior_le_approx_date', 'application_outcome'].filter(key =>
              !Array.isArray(sessions[0].structured_followup_facts) || !sessions[0].structured_followup_facts.some(a => a.key === key && a.value)
            )
          }
        } : null
      }
    });
    
  } catch (error) {
    console.error('[PRIOR_LE_ANCHORS_TEST][ERROR]', error);
    return Response.json({
      ok: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});