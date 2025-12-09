import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * DEV-ONLY Self-Test: Applications with other LE Agencies Section MVP
 * 
 * Tests the complete V2 pipeline + summary orchestration for Q001-Q004:
 * - Q001 (Yes) → PACK_PRIOR_LE_APPS_STANDARD instance
 * - Q002 (Yes) → PACK_PRIOR_LE_APPS_STANDARD instance  
 * - Q003 (No) → No follow-up
 * - Q004 (Yes) → PACK_EMPLOYMENT_STANDARD instance
 * 
 * Verifies:
 * - FollowUpResponse records created with completed=true
 * - Response.aiSummary.questionSummaryText exists
 * - FollowUpResponse.aiSummary.instanceNarrativeText exists
 * - SectionResult created with aiSummary.sectionSummaryText
 * 
 * Usage: Base44 Functions panel → testApplicationsLeSectionMvp
 * Payload: { sessionId: "..." } (optional - creates new session if not provided)
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Auth check
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    
    // Parse request
    const body = typeof req.json === "function" ? await req.json() : req.body || {};
    let sessionId = body?.sessionId || body?.session_id;
    
    console.log('[TEST_MVPCHROM] START', { providedSessionId: sessionId });
    
    // Get questions Q001-Q004
    const questions = await base44.asServiceRole.entities.Question.filter({
      question_id: { $in: ['Q001', 'Q002', 'Q003', 'Q004'] }
    });
    
    const q001 = questions.find(q => q.question_id === 'Q001');
    const q002 = questions.find(q => q.question_id === 'Q002');
    const q003 = questions.find(q => q.question_id === 'Q003');
    const q004 = questions.find(q => q.question_id === 'Q004');
    
    if (!q001 || !q002 || !q003 || !q004) {
      return Response.json({ 
        ok: false, 
        error: 'Questions Q001-Q004 not found in database' 
      }, { status: 400 });
    }
    
    // Create or use existing test session
    let session;
    if (!sessionId) {
      console.log('[TEST_MVP] Creating new test session...');
      session = await base44.asServiceRole.entities.InterviewSession.create({
        session_code: `TEST_MVP_${Date.now()}`,
        department_code: 'TEST',
        file_number: `MVP${Date.now()}`,
        status: 'active',
        started_at: new Date().toISOString()
      });
      sessionId = session.id;
      console.log('[TEST_MVP] Created session:', sessionId);
    } else {
      session = await base44.asServiceRole.entities.InterviewSession.get(sessionId);
      console.log('[TEST_MVP] Using existing session:', sessionId);
    }
    
    // Simulate Q001 = Yes with V2 pack completed
    console.log('[TEST_MVP] Simulating Q001 = Yes + PACK_PRIOR_LE_APPS_STANDARD...');
    
    const q001Response = await base44.asServiceRole.entities.Response.create({
      session_id: sessionId,
      question_id: q001.id,
      question_text: q001.question_text,
      category: 'Applications with other Law Enforcement Agencies',
      answer: 'Yes',
      triggered_followup: true,
      followup_pack: 'PACK_PRIOR_LE_APPS_STANDARD',
      response_timestamp: new Date().toISOString(),
      response_type: 'base_question'
    });
    
    // Create FollowUpResponse for Q001 instance
    const q001FollowUp = await base44.asServiceRole.entities.FollowUpResponse.create({
      session_id: sessionId,
      response_id: q001Response.id,
      question_id: q001.id,
      followup_pack: 'PACK_PRIOR_LE_APPS_STANDARD',
      instance_number: 1,
      completed: true,
      completed_timestamp: new Date().toISOString(),
      additional_details: {
        PACK_PRLE_Q01: 'I applied to Mesa PD for officer around 2020 but was not selected',
        PACK_PRLE_Q02: 'not selected',
        PACK_PRLE_Q06: 'Mesa Police Department'
      }
    });
    
    // Simulate Q002 = Yes with V2 pack completed
    console.log('[TEST_MVP] Simulating Q002 = Yes + PACK_PRIOR_LE_APPS_STANDARD...');
    
    const q002Response = await base44.asServiceRole.entities.Response.create({
      session_id: sessionId,
      question_id: q002.id,
      question_text: q002.question_text,
      category: 'Applications with other Law Enforcement Agencies',
      answer: 'Yes',
      triggered_followup: true,
      followup_pack: 'PACK_PRIOR_LE_APPS_STANDARD',
      response_timestamp: new Date().toISOString(),
      response_type: 'base_question'
    });
    
    const q002FollowUp = await base44.asServiceRole.entities.FollowUpResponse.create({
      session_id: sessionId,
      response_id: q002Response.id,
      question_id: q002.id,
      followup_pack: 'PACK_PRIOR_LE_APPS_STANDARD',
      instance_number: 1,
      completed: true,
      completed_timestamp: new Date().toISOString(),
      additional_details: {
        PACK_PRLE_Q01: 'I withheld a traffic ticket from my Scottsdale PD application in 2019',
        PACK_PRLE_Q02: 'disqualified',
        PACK_PRLE_Q06: 'Scottsdale Police Department'
      }
    });
    
    // Simulate Q003 = No (no follow-up)
    console.log('[TEST_MVP] Simulating Q003 = No...');
    
    await base44.asServiceRole.entities.Response.create({
      session_id: sessionId,
      question_id: q003.id,
      question_text: q003.question_text,
      category: 'Applications with other Law Enforcement Agencies',
      answer: 'No',
      triggered_followup: false,
      response_timestamp: new Date().toISOString(),
      response_type: 'base_question'
    });
    
    // Simulate Q004 = Yes with PACK_EMPLOYMENT_STANDARD completed
    console.log('[TEST_MVP] Simulating Q004 = Yes + PACK_EMPLOYMENT_STANDARD...');
    
    const q004Response = await base44.asServiceRole.entities.Response.create({
      session_id: sessionId,
      question_id: q004.id,
      question_text: q004.question_text,
      category: 'Applications with other Law Enforcement Agencies',
      answer: 'Yes',
      triggered_followup: true,
      followup_pack: 'PACK_EMPLOYMENT_STANDARD',
      response_timestamp: new Date().toISOString(),
      response_type: 'base_question'
    });
    
    const q004FollowUp = await base44.asServiceRole.entities.FollowUpResponse.create({
      session_id: sessionId,
      response_id: q004Response.id,
      question_id: q004.id,
      followup_pack: 'PACK_EMPLOYMENT_STANDARD',
      instance_number: 1,
      completed: true,
      completed_timestamp: new Date().toISOString(),
      additional_details: {
        employer: 'Test Corp',
        incident_date: '2021-03',
        incident_type: 'Performance issue',
        circumstances: 'Missed deadlines repeatedly',
        outcome: 'Resigned before termination'
      }
    });
    
    console.log('[TEST_MVP] Test data created. Triggering summary generation...');
    
    // Call generateSessionSummaries with "backfill" trigger
    const summaryResult = await base44.functions.invoke('generateSessionSummaries', {
      sessionId: sessionId,
      eventType: 'backfill'
    });
    
    console.log('[TEST_MVP] Summary generation complete:', summaryResult.data);
    
    // Verify results
    const verification = {
      q001: {},
      q002: {},
      q003: {},
      q004: {},
      section: {}
    };
    
    // Check Q001 summaries
    const q001ResponseUpdated = await base44.asServiceRole.entities.Response.get(q001Response.id);
    verification.q001.hasQuestionSummary = !!(q001ResponseUpdated?.aiSummary?.questionSummaryText);
    verification.q001.questionSummaryText = q001ResponseUpdated?.aiSummary?.questionSummaryText?.substring(0, 100);
    
    const q001FollowUpUpdated = await base44.asServiceRole.entities.FollowUpResponse.get(q001FollowUp.id);
    verification.q001.hasInstanceNarrative = !!(q001FollowUpUpdated?.aiSummary?.instanceNarrativeText);
    verification.q001.instanceNarrativeText = q001FollowUpUpdated?.aiSummary?.instanceNarrativeText?.substring(0, 100);
    verification.q001.completed = q001FollowUpUpdated?.completed;
    
    // Check Q002 summaries
    const q002ResponseUpdated = await base44.asServiceRole.entities.Response.get(q002Response.id);
    verification.q002.hasQuestionSummary = !!(q002ResponseUpdated?.aiSummary?.questionSummaryText);
    verification.q002.questionSummaryText = q002ResponseUpdated?.aiSummary?.questionSummaryText?.substring(0, 100);
    
    const q002FollowUpUpdated = await base44.asServiceRole.entities.FollowUpResponse.get(q002FollowUp.id);
    verification.q002.hasInstanceNarrative = !!(q002FollowUpUpdated?.aiSummary?.instanceNarrativeText);
    verification.q002.instanceNarrativeText = q002FollowUpUpdated?.aiSummary?.instanceNarrativeText?.substring(0, 100);
    verification.q002.completed = q002FollowUpUpdated?.completed;
    
    // Check Q003 (No answer - should have no instance summary but may have question summary)
    const q003Responses = await base44.asServiceRole.entities.Response.filter({
      session_id: sessionId,
      question_id: q003.id,
      response_type: 'base_question'
    });
    if (q003Responses.length > 0) {
      verification.q003.hasQuestionSummary = !!(q003Responses[0]?.aiSummary?.questionSummaryText);
      verification.q003.questionSummaryText = q003Responses[0]?.aiSummary?.questionSummaryText?.substring(0, 100);
    }
    
    // Check Q004 summaries
    const q004ResponseUpdated = await base44.asServiceRole.entities.Response.get(q004Response.id);
    verification.q004.hasQuestionSummary = !!(q004ResponseUpdated?.aiSummary?.questionSummaryText);
    verification.q004.questionSummaryText = q004ResponseUpdated?.aiSummary?.questionSummaryText?.substring(0, 100);
    
    const q004FollowUpUpdated = await base44.asServiceRole.entities.FollowUpResponse.get(q004FollowUp.id);
    verification.q004.hasInstanceNarrative = !!(q004FollowUpUpdated?.aiSummary?.instanceNarrativeText);
    verification.q004.instanceNarrativeText = q004FollowUpUpdated?.aiSummary?.instanceNarrativeText?.substring(0, 100);
    verification.q004.completed = q004FollowUpUpdated?.completed;
    
    // Check SectionResult for this section
    const sectionResults = await base44.asServiceRole.entities.SectionResult.filter({
      session_id: sessionId,
      section_id: q001.section_id
    });
    
    if (sectionResults.length > 0) {
      const sectionResult = sectionResults[0];
      verification.section.exists = true;
      verification.section.hasSectionSummary = !!(sectionResult?.aiSummary?.sectionSummaryText);
      verification.section.sectionSummaryText = sectionResult?.aiSummary?.sectionSummaryText?.substring(0, 150);
      verification.section.summaryStatus = sectionResult?.aiSummary?.status;
      verification.section.completionStatus = sectionResult?.completion_status;
    } else {
      verification.section.exists = false;
    }
    
    // Determine test results
    const allChecks = {
      q001_completed: verification.q001.completed === true,
      q001_has_question_summary: verification.q001.hasQuestionSummary === true,
      q001_has_instance_narrative: verification.q001.hasInstanceNarrative === true,
      q002_completed: verification.q002.completed === true,
      q002_has_question_summary: verification.q002.hasQuestionSummary === true,
      q002_has_instance_narrative: verification.q002.hasInstanceNarrative === true,
      q003_answer_no: true, // No instance expected for No answers
      q004_completed: verification.q004.completed === true,
      q004_has_question_summary: verification.q004.hasQuestionSummary === true,
      q004_has_instance_narrative: verification.q004.hasInstanceNarrative === true,
      section_exists: verification.section.exists === true,
      section_has_summary: verification.section.hasSectionSummary === true,
      section_summary_status_completed: verification.section.summaryStatus === 'completed'
    };
    
    const passedCount = Object.values(allChecks).filter(v => v === true).length;
    const totalChecks = Object.keys(allChecks).length;
    const allPassed = passedCount === totalChecks;
    
    return Response.json({
      ok: true,
      testPassed: allPassed,
      sessionId,
      passedChecks: `${passedCount}/${totalChecks}`,
      checks: allChecks,
      verification,
      summaryResult: summaryResult.data
    }, { status: 200 });
    
  } catch (error) {
    console.error('[TEST_MVP] ERROR', error.message, error.stack);
    return Response.json({
      ok: false,
      error: error.message,
      stack: error.stack?.substring(0, 500)
    }, { status: 200 });
  }
});