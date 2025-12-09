import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Lifecycle hook to trigger summary generation when interview events occur.
 * Called from interview engine when questions/sections complete.
 * 
 * Triggers:
 * - Question complete: when all follow-ups for a question are done
 * - Section complete: when all questions in a section are complete
 * - Interview complete: when status changes to 'completed'
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await req.json();
    const { sessionId, triggerType } = body;
    
    if (!sessionId) {
      return Response.json({ error: 'sessionId required' }, { status: 400 });
    }
    
    console.log('[TRIGGER_SUMMARIES]', { sessionId, triggerType });
    
    // Enqueue background summary generation (non-blocking)
    // Using service role to ensure it runs regardless of user permissions
    base44.asServiceRole.functions.invoke('generateSessionSummaries', {
      sessionId,
      eventType: triggerType
    }).catch(err => {
      console.error('[TRIGGER_SUMMARIES] Background job failed:', err.message);
      // Don't throw - this is fire-and-forget
    });
    
    return Response.json({ 
      ok: true,
      message: 'Summary generation triggered',
      triggerType
    });
    
  } catch (error) {
    console.error('[TRIGGER_SUMMARIES] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});