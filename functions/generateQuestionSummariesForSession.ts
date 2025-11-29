import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Thin wrapper that delegates to the unified generateSessionSummaries orchestrator.
 * Kept for backward compatibility with existing callers.
 */
Deno.serve(async (req) => {
  let sessionId = null;
  
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ ok: false, error: { message: 'Unauthorized' } }, { status: 401 });
    }
    
    let body;
    try {
      body = typeof req.json === "function" ? await req.json() : req.body;
    } catch (parseErr) {
      return Response.json({ ok: false, error: { message: 'Invalid JSON body' } }, { status: 400 });
    }
    
    sessionId = body?.sessionId || body?.session_id;
    
    console.log('[QSUM][WRAPPER] Delegating to generateSessionSummaries', { sessionId });
    
    if (!sessionId) {
      return Response.json({ ok: false, error: { message: 'sessionId required' } }, { status: 400 });
    }
    
    // Call the unified orchestrator
    const result = await base44.functions.invoke('generateSessionSummaries', {
      sessionId: sessionId
    });
    
    // Transform response to match legacy format expected by frontend
    const data = result.data || result;
    
    return Response.json({
      ok: true,
      generatedCount: (data.created?.question || 0) + (data.created?.section || 0) + (data.created?.interview || 0),
      skippedExistsCount: (data.skippedExists?.question || 0) + (data.skippedExists?.section || 0) + (data.skippedExists?.interview || 0),
      skippedIncompleteCount: (data.skippedIncomplete?.question || 0) + (data.skippedIncomplete?.section || 0) + (data.skippedIncomplete?.interview || 0),
      details: data
    });
    
  } catch (error) {
    console.error('[QSUM][WRAPPER] ERROR', { sessionId, error: error.message });
    return Response.json({
      ok: false,
      error: { message: error.message || 'generateQuestionSummariesForSession failed' }
    }, { status: 500 });
  }
});