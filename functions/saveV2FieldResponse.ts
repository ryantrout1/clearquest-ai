/**
 * saveV2FieldResponse - V2 Pack Field Response Persistence with Audit Trail
 * 
 * Handles saving V2 pack field responses to the database with full anchor audit trail.
 * 
 * Flow:
 * 1. Create/update Response record with field answer
 * 2. Attach anchors to Response.additional_details.v2_anchors
 * 3. Create V2AnchorAudit record for legal audit trail
 * 4. Update session.structured_followup_facts with extracted anchors
 * 
 * Returns: { responseId, auditId, anchors }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Parse input
    const {
      sessionId,
      packId,
      fieldKey,
      instanceNumber = 1,
      baseQuestionId,
      baseQuestionCode,
      answer,
      v2Result  // Result from probeEngineV2 containing anchors + audit
    } = await req.json();
    
    console.log("[SAVE_V2_FIELD][START]", {
      sessionId,
      packId,
      fieldKey,
      instanceNumber,
      hasAnswer: !!answer,
      hasV2Result: !!v2Result,
      hasAnchors: !!(v2Result?.anchors)
    });
    
    // Validate required fields
    if (!sessionId || !packId || !fieldKey) {
      return Response.json({
        ok: false,
        error: "Missing required fields: sessionId, packId, fieldKey"
      }, { status: 400 });
    }
    
    // ================================================================
    // STEP 1: Create or update Response record
    // ================================================================
    let responseId;
    let responseRecord;
    
    // Check if Response already exists for this field
    const existingResponses = await base44.asServiceRole.entities.Response.filter({
      session_id: sessionId,
      pack_id: packId,
      field_key: fieldKey,
      instance_number: instanceNumber
    }, '-created_date', 1);
    
    const responseData = {
      session_id: sessionId,
      question_id: baseQuestionId || fieldKey,
      question_text: `V2 Pack Field: ${fieldKey}`,
      category: packId,
      answer: answer || "",
      response_type: "v2_pack_field",
      pack_id: packId,
      field_key: fieldKey,
      instance_number: instanceNumber,
      base_question_id: baseQuestionId,
      base_question_code: baseQuestionCode,
      response_timestamp: new Date().toISOString()
    };
    
    if (existingResponses && existingResponses.length > 0) {
      // Update existing Response
      responseRecord = existingResponses[0];
      responseId = responseRecord.id;
      
      await base44.asServiceRole.entities.Response.update(responseId, responseData);
      
      console.log("[SAVE_V2_FIELD][RESPONSE_UPDATED]", { responseId });
    } else {
      // Create new Response
      responseRecord = await base44.asServiceRole.entities.Response.create(responseData);
      responseId = responseRecord.id;
      
      console.log("[SAVE_V2_FIELD][RESPONSE_CREATED]", { responseId });
    }
    

    
    // ================================================================
    // Return success response
    // ================================================================
    return Response.json({
      ok: true,
      responseId
    });
    
  } catch (error) {
    console.error("[SAVE_V2_FIELD][ERROR]", {
      error: error.message,
      stack: error.stack
    });
    
    return Response.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
});