import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Generate V3 Incident Summary
 * Creates a brief narrative summary and bullet points for a V3 incident after probing completes.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { sessionId, incidentId, categoryId, packId, openerText, transcript, transcriptTurns, openerAnswer } = body;
    
    console.log('[generateV3IncidentSummary] called', { sessionId, incidentId, categoryId });
    
    if (!sessionId || !incidentId || !categoryId) {
      return Response.json({ 
        ok: false, 
        error: 'MISSING_FIELD:sessionId, incidentId, or categoryId' 
      }, { status: 400 });
    }
    
    // Load session using service role (no auth required)
    const session = await base44.asServiceRole.entities.InterviewSession.get(sessionId);
    if (!session) {
      return Response.json({ ok: false, error: 'Session not found' }, { status: 404 });
    }
    
    // Find incident
    const incident = (session.incidents || []).find(inc => inc.incident_id === incidentId);
    if (!incident) {
      return Response.json({ ok: false, error: 'Incident not found' }, { status: 404 });
    }
    
    // Build context from transcript or opener
    const opener = openerAnswer || openerText || '';
    const turns = transcriptTurns || transcript || [];
    const turnText = turns.map(t => `${t.role}: ${t.content || t.text || ''}`).join('\n');
    
    let summary = '';
    let bullets = [];
    
    if (opener || turnText) {
      // Generate simple deterministic summary
      const contextLength = opener.length + turnText.length;
      
      if (contextLength > 100) {
        summary = `${categoryId.replace(/_/g, ' ')}: ${opener.substring(0, 150)}${opener.length > 150 ? '...' : ''}`;
        
        bullets = [
          `Category: ${categoryId.replace(/_/g, ' ')}`,
          `Incident ID: ${incidentId}`,
          `Details collected via V3 probing`
        ];
      } else {
        summary = `${categoryId.replace(/_/g, ' ')}: Details recorded.`;
        bullets = [`Category: ${categoryId.replace(/_/g, ' ')}`];
      }
    } else {
      summary = "Incident recorded. No additional details provided.";
      bullets = [];
    }
    
    // Update incident with summary
    const updatedIncidents = session.incidents.map(inc => {
      if (inc.incident_id === incidentId) {
        return {
          ...inc,
          narrative_summary: summary,
          updated_at: new Date().toISOString()
        };
      }
      return inc;
    });
    
    await base44.asServiceRole.entities.InterviewSession.update(sessionId, {
      incidents: updatedIncidents
    });
    
    console.log('[generateV3IncidentSummary] completed', { incidentId, summaryLength: summary.length });
    
    return Response.json({
      ok: true,
      incidentId,
      summary,
      bullets,
      createdAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[generateV3IncidentSummary] Error:', error.message);
    return Response.json({ 
      ok: false, 
      error: `SERVER_ERROR:${error.message}` 
    }, { status: 500 });
  }
});