import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Enqueue a test data generation job
 * Creates the job record then triggers the processor via SDK
 */
Deno.serve(async (req) => {
  console.log('[ENQUEUE] Starting enqueue request...');
  
  try {
    const base44 = createClientFromRequest(req);
    
    // Auth check - allow admin users
    let user = null;
    try { 
      user = await base44.auth.me(); 
      console.log('[ENQUEUE] User authenticated:', user?.email, 'role:', user?.role);
    } catch (e) {
      console.log('[ENQUEUE] Auth error:', e.message);
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    // Allow admin and SUPER_ADMIN roles (case-insensitive check)
    const userRole = (user?.role || '').toUpperCase();
    const allowedRoles = ['ADMIN', 'SUPER_ADMIN'];
    
    if (!user || !allowedRoles.includes(userRole)) {
      console.log('[ENQUEUE] Access denied for role:', user?.role);
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Parse config from request body
    const config = await req.json();
    console.log('[ENQUEUE] Config received:', JSON.stringify(config));

    // Validate required fields
    const { deptCode, totalCandidates, lowRiskCount, midRiskCount, highRiskCount } = config;
    
    if (!deptCode) {
      return Response.json({ error: 'Department code is required' }, { status: 400 });
    }
    
    if (lowRiskCount + midRiskCount + highRiskCount !== totalCandidates) {
      return Response.json({ 
        error: `Risk counts must equal total candidates` 
      }, { status: 400 });
    }

    // Check for existing active jobs for this department
    const existingJobs = await base44.asServiceRole.entities.TestDataJob.filter({
      dept_code: deptCode
    });
    
    const activeJob = existingJobs.find(j => j.status === 'queued' || j.status === 'running');
    if (activeJob) {
      console.log('[ENQUEUE] Blocking - active job exists:', activeJob.id, activeJob.status);
      return Response.json({ 
        error: `A test data job is already ${activeJob.status} for this department. Cancel it or wait until it completes.`,
        existingJobId: activeJob.id,
        existingJobStatus: activeJob.status
      }, { status: 409 });
    }

    // Create the job record
    const job = await base44.asServiceRole.entities.TestDataJob.create({
      dept_code: deptCode,
      config: config,
      status: 'queued'
    });

    console.log('[ENQUEUE] Job created:', job.id);

    // Trigger the background processor using SDK's function invoke
    // This runs server-side and continues even if client disconnects
    // We don't await - this is fire-and-forget
    base44.asServiceRole.functions.invoke('processTestDataJob', { jobId: job.id })
      .then(result => {
        console.log('[ENQUEUE] Background processor completed:', result?.data);
      })
      .catch(err => {
        console.error('[ENQUEUE] Background processor error:', err.message);
      });

    console.log('[ENQUEUE] Background job triggered via SDK, returning immediately');

    // Return immediately with job info
    return Response.json({
      success: true,
      jobId: job.id,
      deptCode: deptCode,
      totalCandidates: totalCandidates,
      lowRiskCount: lowRiskCount,
      midRiskCount: midRiskCount,
      highRiskCount: highRiskCount,
      status: 'queued',
      message: 'Test data generation has been queued'
    });

  } catch (error) {
    console.error('[ENQUEUE] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});