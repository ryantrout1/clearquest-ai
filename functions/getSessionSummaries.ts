import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Read-only helper to fetch all AI summaries for a session
 * No mutations, no AI calls - pure data retrieval
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = typeof req.json === "function" ? await req.json() : req.body;
    const sessionId = body?.sessionId || body?.session_id;

    if (!sessionId) {
      return Response.json({ ok: false, error: 'sessionId required' }, { status: 400 });
    }

    console.log('[GET-SUMMARIES] START', { sessionId });

    // Fetch all summary entities for this session
    const [questionSummaries, sectionSummaries, instanceSummaries] = await Promise.all([
      base44.entities.QuestionSummary.filter({ session_id: sessionId }),
      base44.entities.SectionSummary.filter({ session_id: sessionId }),
      base44.entities.InstanceSummary.filter({ session_id: sessionId })
    ]);

    console.log('[GET-SUMMARIES] LOADED', {
      sessionId,
      questionCount: questionSummaries.length,
      sectionCount: sectionSummaries.length,
      instanceCount: instanceSummaries.length
    });

    return Response.json({
      ok: true,
      questionSummaries,
      sectionSummaries,
      instanceSummaries
    });

  } catch (error) {
    console.error('[GET-SUMMARIES] ERROR:', error.message);
    return Response.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
});