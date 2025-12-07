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
    
    // NEW HYBRID FACT MODEL: structured_followup_facts is now an ARRAY of anchor atoms
    const structuredFacts = Array.isArray(sessionData.structured_followup_facts)
      ? sessionData.structured_followup_facts
      : [];
    
    console.log("[ANCHOR-CONFIRM][RAW_FACTS]", {
      isArray: Array.isArray(structuredFacts),
      totalCount: structuredFacts.length,
      sample: structuredFacts.slice(0, 3)
    });
    
    // Filter anchors for this pack and field
    const filteredAnchors = structuredFacts.filter(fact => 
      fact.packId === packId && 
      fact.fieldKey === fieldKey &&
      fact.sessionId === sessionId
    );
    
    console.log("[ANCHOR-CONFIRM][FILTERED]", {
      packId,
      fieldKey,
      sessionId,
      matchCount: filteredAnchors.length,
      filteredAnchors
    });
    
    // Extract unique anchor keys
    const allAnchorKeys = new Set(filteredAnchors.map(f => f.key).filter(Boolean));
    const anchorRecords = filteredAnchors;
    
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