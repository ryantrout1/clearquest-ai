import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Backfill Session Summaries
 * 
 * Admin/dev utility to force summary generation for a specific session.
 * Re-runs the full summary orchestrator for all levels (question, instance, section, interview).
 * 
 * Usage:
 * - Base44 Functions panel → backfillSessionSummaries
 * - Payload: { sessionId: "..." }
 */
Deno.serve(async (req) => {
  let sessionId = null;
  
  try {
    const base44 = createClientFromRequest(req);
    
    // Verify authentication
    let user = null;
    try {
      user = await base44.auth.me();
    } catch (authErr) {
      return Response.json({ 
        ok: false, 
        error: 'Authentication failed' 
      }, { status: 401 });
    }
    
    if (!user) {
      return Response.json({ 
        ok: false, 
        error: 'Unauthorized' 
      }, { status: 401 });
    }
    
    // Parse request body
    let body;
    try {
      body = typeof req.json === "function" ? await req.json() : req.body;
    } catch (parseErr) {
      return Response.json({ 
        ok: false, 
        error: 'Invalid JSON body' 
      }, { status: 400 });
    }
    
    sessionId = body?.sessionId || body?.session_id;
    
    if (!sessionId) {
      return Response.json({ 
        ok: false, 
        error: 'sessionId required' 
      }, { status: 400 });
    }
    
    console.log('[BACKFILL] START', { sessionId, userId: user.id });
    
    // Validate session exists
    let session;
    try {
      session = await base44.asServiceRole.entities.InterviewSession.get(sessionId);
    } catch (fetchErr) {
      return Response.json({ 
        ok: false, 
        error: `Session not found: ${sessionId}` 
      }, { status: 404 });
    }
    
    if (!session) {
      return Response.json({ 
        ok: false, 
        error: `Session not found: ${sessionId}` 
      }, { status: 404 });
    }
    
    console.log('[BACKFILL] Session found', { 
      sessionId, 
      status: session.status,
      questionsAnswered: session.total_questions_answered 
    });
    
    // Call the main orchestrator with "backfill" trigger type
    const result = await base44.functions.invoke('generateSessionSummaries', {
      sessionId: sessionId,
      eventType: 'backfill'
    });
    
    console.log('[BACKFILL] COMPLETE', { 
      sessionId, 
      result: result.data 
    });
    
    return Response.json({
      ok: true,
      sessionId,
      message: 'Backfill completed successfully',
      result: result.data
    }, { status: 200 });
    
  } catch (error) {
    console.error('[BACKFILL] ERROR', { sessionId, error: error.message, stack: error.stack });
    return Response.json({
      ok: false,
      error: error.message || 'Backfill failed',
      sessionId
    }, { status: 200 }); // Return 200 to avoid retries
  }
});