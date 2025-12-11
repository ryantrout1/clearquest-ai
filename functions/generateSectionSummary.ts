import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Generate Section-Level Summary
 * 
 * Aggregates all incident summaries from a section into a section-level summary.
 * Called when a section is completed.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await req.json();
    const { sessionId, sectionId } = body;
    
    if (!sessionId || !sectionId) {
      return Response.json({ 
        error: 'Missing required fields: sessionId, sectionId' 
      }, { status: 400 });
    }
    
    console.log('[SECTION_SUMMARY]', { sessionId, sectionId });
    
    // Load session
    const session = await base44.asServiceRole.entities.InterviewSession.get(sessionId);
    if (!session) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }
    
    // Load section entity
    const sections = await base44.asServiceRole.entities.Section.filter({ section_id: sectionId });
    const section = sections[0];
    
    if (!section) {
      console.warn('[SECTION_SUMMARY] Section not found:', sectionId);
      return Response.json({ error: 'Section not found' }, { status: 404 });
    }
    
    // Get all questions in this section
    const questions = await base44.asServiceRole.entities.Question.filter({ 
      section_id: section.id,
      active: true 
    });
    
    const questionIds = questions.map(q => q.id);
    
    // Get all incidents from this section
    const sectionIncidents = (session.incidents || []).filter(inc => 
      questionIds.includes(inc.question_id)
    );
    
    if (sectionIncidents.length === 0) {
      console.log('[SECTION_SUMMARY] No incidents in section - skipping summary');
      return Response.json({ 
        ok: true,
        message: 'No incidents to summarize'
      });
    }
    
    // Build incident summaries list
    const incidentSummaries = sectionIncidents
      .filter(inc => inc.narrative_summary)
      .map((inc, idx) => {
        const question = questions.find(q => q.id === inc.question_id);
        const questionText = question?.question_text || 'Unknown question';
        return `Incident ${idx + 1} (${questionText.substring(0, 80)}...): ${inc.narrative_summary}`;
      })
      .join('\n\n');
    
    if (!incidentSummaries) {
      console.log('[SECTION_SUMMARY] No incident summaries available yet');
      return Response.json({ 
        ok: true,
        message: 'Incident summaries not ready'
      });
    }
    
    // Get section-specific AI summary instructions if available
    const sectionSummaryInstructions = section.ai_section_summary_instructions || 
      `Summarize the key incidents from the ${section.section_name} section. Focus on:\n- Total number of incidents disclosed\n- Key timelines and agencies/entities involved\n- Outcomes and risk indicators\n- Overall pattern or context\n\nUse neutral, professional language appropriate for a background investigator.`;
    
    // Generate section summary using LLM
    const prompt = `${sectionSummaryInstructions}

SECTION: ${section.section_name}

INCIDENT SUMMARIES:
${incidentSummaries}

Generate a comprehensive section summary (3-5 sentences):`;
    
    const sectionSummaryText = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: null
    });
    
    const finalSummary = sectionSummaryText?.trim() || "Section summary generation failed.";
    
    // Store in SectionSummary entity
    const existing = await base44.asServiceRole.entities.SectionSummary.filter({
      session_id: sessionId,
      section_id: sectionId
    });
    
    if (existing.length > 0) {
      await base44.asServiceRole.entities.SectionSummary.update(existing[0].id, {
        section_summary_text: finalSummary,
        generated_at: new Date().toISOString()
      });
    } else {
      await base44.asServiceRole.entities.SectionSummary.create({
        session_id: sessionId,
        section_id: sectionId,
        section_summary_text: finalSummary,
        generated_at: new Date().toISOString()
      });
    }
    
    console.log('[SECTION_SUMMARY] Generated successfully', {
      sectionId,
      incidentCount: sectionIncidents.length,
      summaryLength: finalSummary.length
    });
    
    return Response.json({
      ok: true,
      sectionId,
      sectionSummaryText: finalSummary,
      incidentCount: sectionIncidents.length
    });
    
  } catch (error) {
    console.error('[SECTION_SUMMARY] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});