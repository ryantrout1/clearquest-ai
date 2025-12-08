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
    // STEP 2: Attach anchors to Response.additional_details
    // ================================================================
    if (v2Result?.anchors && Object.keys(v2Result.anchors).length > 0) {
      const existingDetails = responseRecord.additional_details || {};
      
      const updatedDetails = {
        ...existingDetails,
        v2_anchors: {
          packId,
          fieldKey,
          instanceNumber,
          anchors: v2Result.anchors,
          engineVersion: v2Result.audit?.engineVersion || "unknown",
          extractedAt: new Date().toISOString()
        }
      };
      
      await base44.asServiceRole.entities.Response.update(responseId, {
        additional_details: updatedDetails
      });
      
      console.log("[SAVE_V2_FIELD][ANCHORS_ATTACHED]", {
        responseId,
        anchorKeys: Object.keys(v2Result.anchors)
      });
    }
    
    // ================================================================
    // STEP 3: Create V2AnchorAudit record for audit trail
    // ================================================================
    let auditId = null;
    
    if (v2Result?.anchors && Object.keys(v2Result.anchors).length > 0) {
      try {
        const auditRecord = {
          session_id: sessionId,
          response_id: responseId,
          pack_id: packId,
          field_key: fieldKey,
          instance_number: instanceNumber,
          base_question_id: baseQuestionId || null,
          base_question_code: baseQuestionCode || null,
          narrative_preview: (answer || "").slice(0, 300),
          anchors: v2Result.anchors,
          engine_version: v2Result.audit?.engineVersion || "unknown",
          rules_applied: v2Result.audit?.rulesApplied || [],
          extraction_method: v2Result.audit?.extractionMethod || "unknown",
          extraction_duration_ms: v2Result.audit?.extractionDurationMs || null,
          audit_metadata: {
            probeSource: v2Result.probeSource,
            collectedAnchorsCount: v2Result.collectedAnchors ? Object.keys(v2Result.collectedAnchors).length : 0,
            extractedAt: v2Result.audit?.createdAt || new Date().toISOString()
          }
        };
        
        const createdAudit = await base44.asServiceRole.entities.V2AnchorAudit.create(auditRecord);
        auditId = createdAudit.id;
        
        console.log("[ANCHOR_AUDIT][WRITE]", JSON.stringify({
          sessionId,
          packId,
          fieldKey,
          instanceNumber,
          responseId,
          auditId,
          entity: "V2AnchorAudit",
          anchorsCount: Object.keys(v2Result.anchors).length,
          anchors: v2Result.anchors,
          engineVersion: auditRecord.engine_version,
          rulesApplied: auditRecord.rules_applied,
          createdAt: new Date().toISOString()
        }));
        
      } catch (auditErr) {
        console.error("[ANCHOR_AUDIT][ERROR]", {
          sessionId,
          packId,
          fieldKey,
          instanceNumber,
          responseId,
          error: auditErr.message,
          stack: auditErr.stack
        });
        // Non-fatal - don't break the interview flow
      }
    }
    
    // ================================================================
    // STEP 4: Update session.structured_followup_facts with anchors
    // ================================================================
    if (v2Result?.anchors && Object.keys(v2Result.anchors).length > 0) {
      try {
        const sessions = await base44.asServiceRole.entities.InterviewSession.filter({
          id: sessionId
        });
        
        if (sessions && sessions.length > 0) {
          const session = sessions[0];
          const existingFacts = Array.isArray(session.structured_followup_facts)
            ? session.structured_followup_facts
            : [];
          
          // Convert anchors to fact atoms
          const newFacts = Object.entries(v2Result.anchors)
            .filter(([k, v]) => v !== null && v !== 'unknown')
            .map(([key, value]) => ({
              key,
              value: String(value),
              packId,
              fieldKey,
              baseQuestionCode: baseQuestionCode || null,
              sessionId,
              instanceNumber,
              source: 'V2_PER_FIELD',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }));
          
          // Merge with existing facts (deduplicate by packId::fieldKey::instanceNumber::key)
          const existingByKey = new Map();
          for (const fact of existingFacts) {
            if (!fact || !fact.key) continue;
            const k = `${fact.packId}::${fact.fieldKey}::${fact.instanceNumber}::${fact.key}`;
            existingByKey.set(k, fact);
          }
          
          for (const fact of newFacts) {
            const k = `${fact.packId}::${fact.fieldKey}::${fact.instanceNumber}::${fact.key}`;
            existingByKey.set(k, fact);
          }
          
          const mergedFacts = Array.from(existingByKey.values());
          
          await base44.asServiceRole.entities.InterviewSession.update(sessionId, {
            structured_followup_facts: mergedFacts
          });
          
          console.log("[SAVE_V2_FIELD][SESSION_FACTS_UPDATED]", {
            sessionId,
            newFactsCount: newFacts.length,
            totalFactsCount: mergedFacts.length
          });
        }
      } catch (sessionErr) {
        console.error("[SAVE_V2_FIELD][SESSION_UPDATE_ERROR]", sessionErr.message);
        // Non-fatal
      }
    }
    
    // ================================================================
    // Return success response
    // ================================================================
    return Response.json({
      ok: true,
      responseId,
      auditId,
      anchors: v2Result?.anchors || {},
      engineVersion: v2Result?.audit?.engineVersion || null
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