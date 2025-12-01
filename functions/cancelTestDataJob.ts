import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Cancel a test data generation job
 */
Deno.serve(async (req) => {
  console.log('[CANCEL] Starting cancel request...');
  
  try {
    const base44 = createClientFromRequest(req);
    
    // Auth check - allow admin users
    let user = null;
    try { 
      user = await base44.auth.me(); 
      console.log('[CANCEL] User authenticated:', user?.email, 'role:', user?.role);
    } catch (e) {
      console.log('[CANCEL] Auth error:', e.message);
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    // Allow admin and SUPER_ADMIN roles (case-insensitive check)
    const userRole = (user?.role || '').toUpperCase();
    const allowedRoles = ['ADMIN', 'SUPER_ADMIN'];
    
    if (!user || !allowedRoles.includes(userRole)) {
      console.log('[CANCEL] Access denied for role:', user?.role);
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Parse jobId from request body
    let jobId;
    try {
      const body = await req.json();
      jobId = body.jobId;
    } catch (e) {
      return Response.json({ error: 'jobId required' }, { status: 400 });
    }
    
    if (!jobId) {
      return Response.json({ error: 'jobId required' }, { status: 400 });
    }

    console.log('[CANCEL] Cancelling job:', jobId);

    // Fetch the job
    let job;
    try {
      const jobs = await base44.asServiceRole.entities.TestDataJob.filter({ id: jobId });
      job = jobs[0];
    } catch (e) {
      console.error('[CANCEL] Error fetching job:', e.message);
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }
    
    if (!job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    // Check if job can be cancelled
    if (['completed', 'failed', 'cancelled'].includes(job.status)) {
      console.log('[CANCEL] Job already in terminal state:', job.status);
      return Response.json({ 
        success: true, 
        message: `Job already ${job.status}`,
        status: job.status 
      });
    }

    // Cancel the job
    const now = new Date().toISOString();
    await base44.asServiceRole.entities.TestDataJob.update(job.id, {
      status: 'cancelled',
      finished_at: now,
      cancelled_at: now
    });

    console.log('[CANCEL] Job cancelled successfully');

    return Response.json({
      success: true,
      jobId: job.id,
      status: 'cancelled',
      message: 'Job cancelled successfully'
    });

  } catch (error) {
    console.error('[CANCEL] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});