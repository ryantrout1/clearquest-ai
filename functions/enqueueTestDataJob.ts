import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Enqueue a test data generation job
 * Creates the job record then triggers the processor via SDK
 */
Deno.serve(async (req) => {
  console.log('[ENQUEUE] Starting enqueue request...');
  
  try {
    const base44 = createClientFromRequest(req);
    
    // Auth check
    let user = null;
    try { 
      user = await base44.auth.me(); 
    } catch (e) {
      console.log('[ENQUEUE] Auth error:', e.message);
    }
    
    if (!user || (user.role !== 'admin' && user.role !== 'SUPER_ADMIN')) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
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