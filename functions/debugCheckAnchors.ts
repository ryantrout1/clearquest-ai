/**
 * debugCheckAnchors - Diagnostic Tool
 * 
 * Confirms whether fact anchors were actually created and persisted to the database
 * for a given session, pack, and field.
 * 
 * Usage: Call this endpoint with sessionId, packId, and fieldKey to inspect
 * what was stored in the database after a field was answered.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Parse input
    const { sessionId, packId, fieldKey } = await req.json();
    
    console.log("[ANCHOR-CONFIRM][START]", { sessionId, packId, fieldKey });
    
    // Validate inputs
    if (!sessionId || !packId || !fieldKey) {
      return Response.json({
        ok: false,
        error: "Missing required parameters: sessionId, packId, fieldKey"
      }, { status: 400 });
    }
    
    // Step 1: Query Response table for the most recent response for this field
    console.log("[ANCHOR-CONFIRM][QUERY] Fetching Response records...");
    
    const responses = await base44.asServiceRole.entities.Response.filter({
      session_id: sessionId,
      field_key: fieldKey
    }, '-created_date', 10); // Get most recent
    
    const responseRecord = responses.length > 0 ? responses[0] : null;
    
    console.log("[ANCHOR-CONFIRM][RESPONSE]", responseRecord ? {
      id: responseRecord.id,
      field_key: responseRecord.field_key,
      answer: responseRecord.answer?.substring(0, 100),
      created_date: responseRecord.created_date
    } : "No response found");
    
    // Step 2: Query InterviewSession for structured_followup_facts
    console.log("[ANCHOR-CONFIRM][QUERY] Fetching session anchors...");
    
    const session = await base44.asServiceRole.entities.InterviewSession.filter({
      id: sessionId
    });
    
    if (!session || session.length === 0) {
      return Response.json({
        ok: false,
        error: `Session ${sessionId} not found`
      }, { status: 404 });
    }
    
    const sessionData = session[0];
    const structuredFacts = sessionData.structured_followup_facts || {};
    
    // Extract anchors for this pack/field from structured_followup_facts
    // Structure is typically: { [questionId]: [ {pack_id, instance_number, fields: {...anchors...}} ] }
    let anchorRecords = [];
    let allAnchorKeys = new Set();
    
    // Search through all questions in structured_followup_facts
    for (const [questionId, instances] of Object.entries(structuredFacts)) {
      if (Array.isArray(instances)) {
        for (const instance of instances) {
          if (instance.pack_id === packId) {
            anchorRecords.push({
              questionId,
              pack_id: instance.pack_id,
              instance_number: instance.instance_number,
              fields: instance.fields || {},
              updated_at: instance.updated_at
            });
            
            // Collect all anchor keys
            if (instance.fields) {
              Object.keys(instance.fields).forEach(key => allAnchorKeys.add(key));
            }
          }
        }
      }
    }
    
    console.log("[ANCHOR-CONFIRM][ANCHORS]", {
      recordCount: anchorRecords.length,
      records: anchorRecords
    });
    
    // Step 3: Build diagnostics
    const anchorKeys = Array.from(allAnchorKeys);
    const hasAnyAnchors = anchorKeys.length > 0;
    
    // Known canonical anchors for PACK_PRIOR_LE_APPS_STANDARD
    const canonicalAnchors = packId === "PACK_PRIOR_LE_APPS_STANDARD" || packId === "PACK_LE_APPS"
      ? ["prior_le_agency", "prior_le_position", "prior_le_approx_date", "application_outcome"]
      : [];
    
    const foundKeys = canonicalAnchors.filter(key => allAnchorKeys.has(key));
    const missingKeys = canonicalAnchors.filter(key => !allAnchorKeys.has(key));
    
    console.log("[ANCHOR-CONFIRM][COMPLETE]", {
      anchorKeys,
      count: anchorKeys.length,
      canonicalFound: foundKeys,
      canonicalMissing: missingKeys
    });
    
    // Step 4: Return diagnostic output
    return Response.json({
      ok: true,
      sessionId,
      packId,
      fieldKey,
      response: responseRecord ? {
        responseId: responseRecord.id,
        fieldKey: responseRecord.field_key,
        value: responseRecord.answer,
        createdAt: responseRecord.created_date,
        updatedAt: responseRecord.updated_date
      } : null,
      persistedAnchors: anchorRecords,
      anchorKeys,
      hasAnyAnchors,
      diagnostics: {
        foundKeys,
        missingKeys,
        total: anchorKeys.length,
        canonicalExpected: canonicalAnchors
      }
    });
    
  } catch (error) {
    console.error("[ANCHOR-CONFIRM][ERROR]", error);
    return Response.json({
      ok: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});