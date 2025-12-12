import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Generate V3 Incident Summary using pack's summary_template
 * 
 * Called after V3 probing completes for an incident.
 * Uses the pack's summary_template to generate a deterministic, professional narrative.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    let user = null;
    try {
      user = await base44.auth.me();
    } catch (e) {
      // Allow system/background execution without auth
      console.log("[SUMMARY] Running without auth (system context)");
    }
    
    const body = await req.json();
    const { sessionId, incidentId, categoryId, transcriptTurns, openerAnswer, createdAt } = body;
    
    if (!sessionId || !categoryId) {
      return Response.json({ 
        ok: false,
        error: 'MISSING_FIELD:sessionId or categoryId'
      }, { status: 400 });
    }
    
    if (!incidentId) {
      return Response.json({ 
        ok: false,
        error: 'MISSING_FIELD:incidentId'
      }, { status: 400 });
    }
    
    console.log('[V3_INCIDENT_SUMMARY]', { sessionId, incidentId, categoryId });
    
    // Load session
    const session = await base44.asServiceRole.entities.InterviewSession.get(sessionId);
    if (!session) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }
    
    // Find incident
    const incident = (session.incidents || []).find(inc => inc.incident_id === incidentId);
    if (!incident) {
      return Response.json({ error: 'Incident not found' }, { status: 404 });
    }
    
    // Load fact model to get linked packs
    const factModels = await base44.asServiceRole.entities.FactModel.filter({ category_id: categoryId });
    const factModel = factModels[0];
    
    if (!factModel) {
      console.warn('[V3_INCIDENT_SUMMARY] No FactModel for category:', categoryId);
      return Response.json({ error: 'FactModel not found' }, { status: 404 });
    }
    
    // Get pack from linked_pack_ids or fallback to question's pack
    let packId = null;
    if (factModel.linked_pack_ids?.length > 0) {
      packId = factModel.linked_pack_ids[0];
    } else if (incident.question_id) {
      const question = await base44.asServiceRole.entities.Question.get(incident.question_id);
      packId = question?.followup_pack_id || question?.followup_pack;
    }
    
    if (!packId) {
      console.warn('[V3_INCIDENT_SUMMARY] No pack ID found for incident');
      return Response.json({ error: 'No pack found' }, { status: 404 });
    }
    
    // Load pack to get summary_template
    const packs = await base44.asServiceRole.entities.FollowUpPack.filter({ followup_pack_id: packId });
    const pack = packs[0];
    
    if (!pack) {
      console.warn('[V3_INCIDENT_SUMMARY] Pack not found:', packId);
      return Response.json({ error: 'Pack not found' }, { status: 404 });
    }
    
    // Get summary template
    const summaryTemplate = pack.summary_template || pack.ai_summary_instructions;
    
    if (!summaryTemplate) {
      console.warn('[V3_INCIDENT_SUMMARY] No summary template for pack:', packId);
      return Response.json({ error: 'No summary template' }, { status: 404 });
    }
    
    // Build facts text for LLM - use incident facts or fallback to opener/transcript
    const facts = incident.facts || {};
    const factsText = Object.entries(facts)
      .filter(([_, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
      .join('\n');
    
    // Include opener answer and transcript if provided
    let contextText = '';
    if (openerAnswer) {
      contextText += `\nOpener Response: ${openerAnswer}`;
    }
    if (transcriptTurns && transcriptTurns.length > 0) {
      contextText += '\n\nTranscript:\n' + transcriptTurns.map(t => `${t.role}: ${t.content}`).join('\n');
    }
    
    // Generate summary using LLM
    const prompt = `${summaryTemplate}

INCIDENT FACTS:
${factsText || '(No facts collected)'}${contextText}

Generate a concise, factual investigator summary (2-4 sentences):`;
    
    const summaryResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: null
    });
    
    const narrativeSummary = summaryResult?.trim() || "Summary generation failed.";
    
    // Update incident with summary
    const updatedIncidents = session.incidents.map(inc => {
      if (inc.incident_id === incidentId) {
        return {
          ...inc,
          narrative_summary: narrativeSummary,
          updated_at: new Date().toISOString()
        };
      }
      return inc;
    });
    
    await base44.asServiceRole.entities.InterviewSession.update(sessionId, {
      incidents: updatedIncidents
    });
    
    console.log('[V3_INCIDENT_SUMMARY] Summary generated successfully', {
      incidentId,
      summaryLength: narrativeSummary.length
    });
    
    return Response.json({
      ok: true,
      incidentId,
      incidentSummary: narrativeSummary,
      generatedAt: new Date().toISOString(),
      modelVersion: 'v3',
      factsCount: Object.keys(facts).length
    });
    
  } catch (error) {
    console.error('[V3_INCIDENT_SUMMARY] Error:', error.message);
    return Response.json({ 
      ok: false, 
      error: `SERVER_ERROR:${error.message}` 
    }, { status: 500 });
  }
});