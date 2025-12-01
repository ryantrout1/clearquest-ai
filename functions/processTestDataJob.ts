import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Process a test data generation job
 * This is the long-running background worker
 */

// ========== SEEDER LOGIC (copied from seedMockInterviews) ==========

const DEFAULT_CONFIG = {
  deptCode: "MPD-12345",
  totalCandidates: 5,
  lowRiskCount: 2,
  midRiskCount: 1,
  highRiskCount: 2,
  randomizeWithinPersona: false,
  includeAiProbing: false,
  enableMultiLoopBackgrounds: true
};

const LEGACY_PERSONAS = {
  "GREAT-A": { name: "TEST – Marcus 'Marc' Delaney", riskLevel: "low", yesQuestionIds: ["Q008"] },
  "GREAT-B": { name: "TEST – Elena Marquez", riskLevel: "low", yesQuestionIds: ["Q001", "Q091"] },
  "MID-C": { name: "TEST – Daniel 'Danny' Rios", riskLevel: "moderate", yesQuestionIds: ["Q008", "Q096", "Q091", "Q125", "Q022", "Q301"] },
  "HIGH-D": { name: "TEST – Tyrone 'Ty' Holloway", riskLevel: "elevated", yesQuestionIds: ["Q096", "Q097", "Q022", "Q301", "Q024", "Q091", "Q092", "Q125", "Q126", "Q159", "Q160"] },
  "HIGH-E": { name: "TEST – Shawn Patrick O'Neill", riskLevel: "elevated", yesQuestionIds: ["Q007", "Q008", "Q096", "Q097", "Q098", "Q022", "Q301", "Q024", "Q025", "Q091", "Q092", "Q093", "Q125", "Q159", "Q160"] }
};

const QUESTION_POOLS = {
  low: { pool: ["Q008", "Q009", "Q091", "Q001"], minYes: 1, maxYes: 3 },
  moderate: { pool: ["Q008", "Q009", "Q096", "Q091", "Q092", "Q125", "Q022", "Q301", "Q126", "Q159"], minYes: 5, maxYes: 7 },
  high: { pool: ["Q007", "Q008", "Q009", "Q096", "Q097", "Q098", "Q022", "Q301", "Q024", "Q025", "Q091", "Q092", "Q093", "Q094", "Q125", "Q126", "Q127", "Q159", "Q160", "Q161"], minYes: 10, maxYes: 15 }
};

const FOLLOWUP_TEMPLATES = {
  low: {
    "PACK_DRIVING_VIOLATIONS_STANDARD": { incident_date: "March 2021", incident_location: "Highway, local area", incident_description: "Minor speeding ticket, less than 10 mph over limit", legal_outcome: "Paid fine, no points", circumstances: "Was running late, wasn't paying attention to speed", accountability_response: "My fault. I've been more careful since." },
    "PACK_PRIOR_LE_APPS_STANDARD": { incident_date: "2022", incident_location: "Local area", incident_description: "Applied to nearby agency, withdrew application", legal_outcome: "Withdrew voluntarily", circumstances: "Family circumstances changed, timing wasn't right", accountability_response: "Made the right choice for my family. Ready now." },
    "PACK_FINANCIAL_STANDARD": { incident_date: "2022", incident_description: "Minor bill went to collections", legal_outcome: "Fully paid off", circumstances: "Unexpected expense, set up payment plan and completed it", accountability_response: "Should have addressed it sooner but paid in full." }
  },
  moderate: {
    "PACK_DRIVING_VIOLATIONS_STANDARD": { incident_date: "Around October 2020", incident_location: "Local area", incident_description: "Red light or speeding violation", legal_outcome: "Paid the fine", circumstances: "Was distracted, not sure exactly what happened", accountability_response: "My fault for not paying attention." },
    "PACK_DRUG_USE_STANDARD": { incident_date: "First used around 2012-2015", frequency: "Maybe 10-15 times total", last_occurrence: "2018 or early 2019", incident_description: "Marijuana experimentation at parties", circumstances: "Social use only at parties. Never bought my own.", accountability_response: "It was a phase. Haven't used in years." },
    "PACK_FINANCIAL_STANDARD": { incident_date: "2020", incident_description: "Credit account went 90+ days late", legal_outcome: "Caught up and current now", circumstances: "Hours got cut during economic downturn. Paid off once stable.", accountability_response: "Should have communicated with creditor sooner." },
    "PACK_EMPLOYMENT_STANDARD": { incident_date: "2018", incident_description: "Terminated for attendance", legal_outcome: "Clean separation", circumstances: "Calling out too much during rough personal time. Got write-ups then terminated.", accountability_response: "My fault. Should have communicated better." },
    "PACK_GENERAL_CRIME_STANDARD": { incident_date: "Summer 2019", incident_description: "Noise complaint, roommate argument", legal_outcome: "No arrests, no charges. Officers talked to us and left.", circumstances: "Arguing about bills and chores. Got loud but never physical.", accountability_response: "We both got too heated. I've learned to walk away." }
  },
  high: {
    "PACK_DRIVING_DUIDWI_STANDARD": { incident_date: "2019", incident_description: "DUI arrest", legal_outcome: "Pled to lesser charge, community service, classes, license suspended", circumstances: "Got pulled over after drinking at a bar.", accountability_response: "It was a wake-up call. Don't drink and drive anymore." },
    "PACK_DRIVING_VIOLATIONS_STANDARD": { incident_date: "Multiple over the years", incident_description: "Various traffic citations", legal_outcome: "Fines paid", circumstances: "Speeding mostly. A couple over the years.", accountability_response: "Been more careful lately." },
    "PACK_DRUG_USE_STANDARD": [{ instance_number: 1, substance_name: "Marijuana", incident_date: "Started as a teenager", frequency: "Regular in youth, tapered off", last_occurrence: "2020 or 2021", incident_description: "Marijuana use over many years", circumstances: "Social use. Quit when considering LE career.", accountability_response: "Know it was wrong. Been clean for years." }, { instance_number: 2, substance_name: "Other controlled substance", incident_date: "Mid-2000s to 2010s", frequency: "A few times", last_occurrence: "Before age 25", incident_description: "Experimented with harder substances", circumstances: "Was hanging with wrong crowd back then.", accountability_response: "That was years ago. Got away from those people." }],
    "PACK_PRESCRIPTION_MISUSE": { incident_date: "2020", incident_description: "Prescription medication misuse after injury", frequency: "4-5 months", last_occurrence: "Late 2020", circumstances: "Had injury, prescribed pain meds, took more than prescribed for a while.", accountability_response: "Realized I had a problem and got proper treatment." },
    "PACK_GENERAL_CRIME_STANDARD": { incident_date: "Multiple times over the years", incident_description: "Multiple police contacts", legal_outcome: "No convictions", circumstances: "Different situations - domestic calls, disturbances.", accountability_response: "Nothing serious. Just circumstances." },
    "PACK_DOMESTIC_VIOLENCE_STANDARD": { incident_date: "2020-2021", incident_description: "Argument with ex, property damage", legal_outcome: "No charges filed. Left before cops arrived.", circumstances: "Heated argument during relationship ending. Put hole in wall, never touched anyone.", accountability_response: "Paid for damage. Relationship was hard on both of us." },
    "PACK_FINANCIAL_STANDARD": { incident_date: "Current", incident_description: "Several thousand in collections", legal_outcome: "Working on it", circumstances: "Credit card debt, medical bills, old utilities.", accountability_response: "Trying to get back on feet after job loss." },
    "PACK_EMPLOYMENT_STANDARD": [{ instance_number: 1, incident_date: "2016-2018", incident_description: "Terminated for insubordination or attitude", circumstances: "Got into argument with supervisor. Had attitude problem back then.", accountability_response: "Was young and immature. Grown a lot since then." }, { instance_number: 2, incident_date: "2019-2020", incident_description: "Terminated for attendance", circumstances: "Going through personal issues, wasn't showing up consistently.", accountability_response: "Personal issues affected work. Learned to separate the two." }],
    "PACK_GENERAL_DISCLOSURE_STANDARD": { incident_date: "Over the years", incident_description: "Problematic social media posts", circumstances: "Angry posts when going through stuff. Arguments online. Some inappropriate comments.", accountability_response: "Deleted most of it. Need to be more careful." }
  }
};

const AI_PROBING_TEMPLATES = {
  "Q096": [{ probing_question: "You mentioned drug use. Can you be more specific about when you first tried it?", candidate_response: "It was in high school, probably around 16 or 17." }, { probing_question: "And how many times total would you estimate you used?", candidate_response: "Maybe 10-15 times total. It was just at parties." }],
  "Q097": [{ probing_question: "You mentioned other controlled substances. Can you be specific about what and when?", candidate_response: "It was years ago. Tried something a few times when I was young." }, { probing_question: "How many times exactly?", candidate_response: "Maybe 3 or 4 times. I was hanging with a bad crowd." }],
  "Q022": [{ probing_question: "Can you provide an approximate date for this police contact?", candidate_response: "I think... maybe 2017 or 2018. Around there." }, { probing_question: "What were the circumstances?", candidate_response: "Got into a situation, cops were called. Nothing serious came of it." }],
  "Q007": [{ probing_question: "Regarding the DUI, can you provide more details about the year?", candidate_response: "It was 2019. February I think." }],
  "Q159": [{ probing_question: "Can you describe what might cause embarrassment?", candidate_response: "Some old social media posts. Arguments online. Maybe some inappropriate comments." }]
};

function generateSessionHash() {
  const chars = 'abcdef0123456789';
  return Array.from({length: 64}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function generateFileNumber(riskLevel, index, randomize) {
  const prefix = riskLevel === 'low' ? 'LOW' : riskLevel === 'moderate' ? 'MID' : 'HIGH';
  const suffix = randomize ? Math.random().toString(36).substring(2, 6).toUpperCase() : String(index + 1).padStart(3, '0');
  return `TEST-${prefix}-${suffix}`;
}

function selectRandomYesQuestions(pool, min, max) {
  const count = Math.floor(Math.random() * (max - min + 1)) + min;
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return new Set(shuffled.slice(0, count));
}

function getFollowupData(packId, riskLevel, templates) {
  const levelTemplates = templates[riskLevel] || templates.moderate;
  return levelTemplates[packId] || null;
}

async function createMockSession(base44, config, candidateConfig, questions, sections) {
  const { deptCode, includeAiProbing, enableMultiLoopBackgrounds } = config;
  const { fileNumber, name, riskLevel, yesQuestionIds } = candidateConfig;
  const sessionCode = `${deptCode}_${fileNumber}`;
  const yesSet = new Set(yesQuestionIds);
  
  console.log(`[PROCESS] Processing ${fileNumber} (${name}), risk: ${riskLevel}, ${yesSet.size} YES answers`);
  
  let session = null;
  try {
    const existing = await base44.asServiceRole.entities.InterviewSession.filter({ department_code: deptCode, file_number: fileNumber });
    if (existing.length > 0) {
      session = existing[0];
      try {
        const oldResponses = await base44.asServiceRole.entities.Response.filter({ session_id: session.id });
        for (const r of oldResponses) await base44.asServiceRole.entities.Response.delete(r.id);
      } catch (e) {}
      try {
        const oldFollowups = await base44.asServiceRole.entities.FollowUpResponse.filter({ session_id: session.id });
        for (const f of oldFollowups) await base44.asServiceRole.entities.FollowUpResponse.delete(f.id);
      } catch (e) {}
    }
  } catch (err) {}
  
  const now = new Date();
  const startTime = new Date(now.getTime() - 7200000);
  let currentTime = startTime.getTime();
  
  const sectionMap = {};
  for (const s of sections) sectionMap[s.section_id] = s.section_name;
  
  const transcript = [];
  let yesCount = 0, noCount = 0, redFlagsCount = 0, followupsCreated = 0;
  
  for (const q of questions) {
    const sectionName = sectionMap[q.section_id] || q.category || 'Unknown';
    const isYes = yesSet.has(q.question_id);
    if (isYes) yesCount++; else noCount++;
    
    currentTime += 5000 + Math.floor(Math.random() * 5000);
    transcript.push({ type: "question", section: sectionName, question_id: q.question_id, question_text: q.question_text, timestamp: new Date(currentTime).toISOString() });
    currentTime += 3000 + Math.floor(Math.random() * 4000);
    transcript.push({ type: "answer", question_id: q.question_id, answer: isYes ? "Yes" : "No", triggered_followup: isYes && !!q.followup_pack, timestamp: new Date(currentTime).toISOString() });
    
    if (includeAiProbing && isYes && riskLevel !== 'low') {
      const probes = AI_PROBING_TEMPLATES[q.question_id];
      if (probes) {
        for (const probe of probes) {
          currentTime += 3000 + Math.floor(Math.random() * 3000);
          transcript.push({ type: "ai_probe", question_id: q.question_id, question_text: probe.probing_question, timestamp: new Date(currentTime).toISOString() });
          currentTime += 4000 + Math.floor(Math.random() * 4000);
          transcript.push({ type: "ai_probe_answer", question_id: q.question_id, answer: probe.candidate_response, timestamp: new Date(currentTime).toISOString() });
        }
      }
    }
    
    const isFlagged = isYes && (q.followup_pack?.includes('CRIME') || q.followup_pack?.includes('DRUG') || q.followup_pack?.includes('DUI') || q.followup_pack?.includes('DOMESTIC'));
    if (isFlagged) redFlagsCount++;
  }
  
  const endTime = new Date(currentTime + 60000);
  
  const sessionData = {
    session_code: sessionCode, department_code: deptCode, file_number: fileNumber, status: "completed", is_archived: false,
    started_at: startTime.toISOString(), completed_at: endTime.toISOString(), last_activity_at: endTime.toISOString(),
    questions_answered_count: questions.length, followups_count: 0,
    ai_probes_count: includeAiProbing && riskLevel !== 'low' ? Math.floor(yesCount * 0.3) : 0,
    red_flags_count: redFlagsCount, completion_percent: 100,
    elapsed_seconds: Math.floor((endTime.getTime() - startTime.getTime()) / 1000),
    active_seconds: Math.floor((endTime.getTime() - startTime.getTime()) / 1000) - 300,
    transcript_snapshot: transcript, session_hash: generateSessionHash(), risk_rating: riskLevel,
    metadata: { isTestData: true, testPersona: fileNumber, candidateName: name, generatedAt: now.toISOString(), yesCount, noCount, config: { includeAiProbing, enableMultiLoopBackgrounds, randomized: config.randomizeWithinPersona } },
    data_version: "v2.5-hybrid"
  };
  
  if (session) {
    await base44.asServiceRole.entities.InterviewSession.update(session.id, sessionData);
  } else {
    session = await base44.asServiceRole.entities.InterviewSession.create(sessionData);
  }
  
  let responsesCreated = 0;
  for (const q of questions) {
    const sectionName = sectionMap[q.section_id] || q.category || 'Unknown';
    const isYes = yesSet.has(q.question_id);
    const investigatorProbing = [];
    if (includeAiProbing && isYes && riskLevel !== 'low') {
      const probes = AI_PROBING_TEMPLATES[q.question_id];
      if (probes) probes.forEach((p, i) => investigatorProbing.push({ sequence_number: i + 1, probing_question: p.probing_question, candidate_response: p.candidate_response, timestamp: new Date().toISOString() }));
    }
    try {
      await base44.asServiceRole.entities.Response.create({
        session_id: session.id, question_id: q.question_id, question_text: q.question_text, category: sectionName,
        answer: isYes ? "Yes" : "No", triggered_followup: isYes && !!q.followup_pack, followup_pack: isYes ? q.followup_pack : null,
        is_flagged: isYes && (q.followup_pack?.includes('CRIME') || q.followup_pack?.includes('DRUG')),
        response_timestamp: new Date(startTime.getTime() + responsesCreated * 7000).toISOString(),
        investigator_probing: investigatorProbing.length > 0 ? investigatorProbing : undefined
      });
      responsesCreated++;
    } catch (e) {}
  }
  
  for (const q of questions) {
    if (!yesSet.has(q.question_id) || !q.followup_pack) continue;
    const packData = getFollowupData(q.followup_pack, riskLevel, FOLLOWUP_TEMPLATES);
    if (!packData) {
      try {
        await base44.asServiceRole.entities.FollowUpResponse.create({ session_id: session.id, question_id: q.question_id, question_text_snapshot: q.question_text, followup_pack: q.followup_pack, instance_number: 1, incident_description: "Details provided during interview", completed: true, completed_timestamp: endTime.toISOString() });
        followupsCreated++;
      } catch (e) {}
      continue;
    }
    const items = Array.isArray(packData) ? packData : [packData];
    const maxInstances = enableMultiLoopBackgrounds && riskLevel !== 'low' ? items.length : 1;
    for (let i = 0; i < Math.min(items.length, maxInstances); i++) {
      const data = items[i];
      try {
        await base44.asServiceRole.entities.FollowUpResponse.create({ session_id: session.id, question_id: q.question_id, question_text_snapshot: q.question_text, followup_pack: q.followup_pack, instance_number: data.instance_number || (i + 1), substance_name: data.substance_name, incident_date: data.incident_date, incident_location: data.incident_location, incident_description: data.incident_description, frequency: data.frequency, last_occurrence: data.last_occurrence, circumstances: data.circumstances, accountability_response: data.accountability_response, legal_outcome: data.legal_outcome, additional_details: data, completed: true, completed_timestamp: endTime.toISOString() });
        followupsCreated++;
      } catch (e) {}
    }
  }
  
  await base44.asServiceRole.entities.InterviewSession.update(session.id, { followups_count: followupsCreated });
  
  return { action: session ? "updated" : "created", fileNumber, riskLevel, stats: { responsesCreated, followupsCreated, yesCount, noCount, redFlagsCount } };
}

async function runSeeder(base44, config, jobId) {
  const { deptCode, totalCandidates, lowRiskCount, midRiskCount, highRiskCount, randomizeWithinPersona } = config;
  
  const questions = await base44.asServiceRole.entities.Question.filter({ active: true });
  const sections = await base44.asServiceRole.entities.Section.filter({ active: true });
  
  const sectionOrderMap = {};
  for (const s of sections) sectionOrderMap[s.section_id] = s.section_order || 999;
  questions.sort((a, b) => {
    const sA = sectionOrderMap[a.section_id] || 999;
    const sB = sectionOrderMap[b.section_id] || 999;
    if (sA !== sB) return sA - sB;
    return (a.display_order || 0) - (b.display_order || 0);
  });
  
  const candidateConfigs = [];
  const isLegacyMode = !randomizeWithinPersona && deptCode === "MPD-12345" && totalCandidates === 5 && lowRiskCount === 2 && midRiskCount === 1 && highRiskCount === 2;
  
  if (isLegacyMode) {
    Object.entries(LEGACY_PERSONAS).forEach(([key, persona]) => {
      candidateConfigs.push({ fileNumber: key, name: persona.name, riskLevel: persona.riskLevel, yesQuestionIds: persona.yesQuestionIds });
    });
  } else {
    let lowIdx = 0, midIdx = 0, highIdx = 0;
    for (let i = 0; i < lowRiskCount; i++) {
      const yesIds = randomizeWithinPersona ? Array.from(selectRandomYesQuestions(QUESTION_POOLS.low.pool, QUESTION_POOLS.low.minYes, QUESTION_POOLS.low.maxYes)) : QUESTION_POOLS.low.pool.slice(0, 2);
      candidateConfigs.push({ fileNumber: generateFileNumber('low', lowIdx++, randomizeWithinPersona), name: `TEST – Low Risk Candidate ${lowIdx}`, riskLevel: 'low', yesQuestionIds: yesIds });
    }
    for (let i = 0; i < midRiskCount; i++) {
      const yesIds = randomizeWithinPersona ? Array.from(selectRandomYesQuestions(QUESTION_POOLS.moderate.pool, QUESTION_POOLS.moderate.minYes, QUESTION_POOLS.moderate.maxYes)) : QUESTION_POOLS.moderate.pool.slice(0, 6);
      candidateConfigs.push({ fileNumber: generateFileNumber('moderate', midIdx++, randomizeWithinPersona), name: `TEST – Mid Risk Candidate ${midIdx}`, riskLevel: 'moderate', yesQuestionIds: yesIds });
    }
    for (let i = 0; i < highRiskCount; i++) {
      const yesIds = randomizeWithinPersona ? Array.from(selectRandomYesQuestions(QUESTION_POOLS.high.pool, QUESTION_POOLS.high.minYes, QUESTION_POOLS.high.maxYes)) : QUESTION_POOLS.high.pool.slice(0, 12);
      candidateConfigs.push({ fileNumber: generateFileNumber('high', highIdx++, randomizeWithinPersona), name: `TEST – High Risk Candidate ${highIdx}`, riskLevel: 'elevated', yesQuestionIds: yesIds });
    }
  }
  
  const results = [];
  let created = 0, updated = 0;
  
  for (const candidateConfig of candidateConfigs) {
    // Check if job was cancelled mid-run
    if (jobId) {
      try {
        const currentJob = await base44.asServiceRole.entities.TestDataJob.filter({ id: jobId });
        if (currentJob[0]?.status === 'cancelled' || currentJob[0]?.status === 'failed') {
          console.log('[PROCESS] Job cancelled/failed mid-run, stopping');
          return { created, updated, results, questionsUsed: questions.length, cancelled: true };
        }
      } catch (e) {
        console.log('[PROCESS] Could not check job status:', e.message);
      }
    }
    
    try {
      const result = await createMockSession(base44, config, candidateConfig, questions, sections);
      results.push({ ...result, success: true });
      if (result.action === "created") created++; else updated++;
    } catch (error) {
      results.push({ fileNumber: candidateConfig.fileNumber, success: false, error: error.message });
    }
  }
  
  return { created, updated, results, questionsUsed: questions.length, cancelled: false };
}

// ========== MAIN HANDLER ==========

Deno.serve(async (req) => {
  console.log('[PROCESS] Starting job processor...');
  
  try {
    const base44 = createClientFromRequest(req);
    
    // Parse jobId from request
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
    
    console.log('[PROCESS] Processing job:', jobId);
    
    // Fetch the job
    let job;
    try {
      job = await base44.asServiceRole.entities.TestDataJob.filter({ id: jobId });
      job = job[0];
    } catch (e) {
      console.error('[PROCESS] Error fetching job:', e.message);
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }
    
    if (!job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }
    
    // Check status - only process queued jobs
    if (job.status !== 'queued') {
      console.log('[PROCESS] Job not in queued state:', job.status);
      return Response.json({ message: 'Job already processed or cancelled', status: job.status });
    }
    
    // Check if job was cancelled before we could start
    if (job.status === 'cancelled') {
      console.log('[PROCESS] Job was cancelled before processing');
      return Response.json({ message: 'Job was cancelled', status: 'cancelled' });
    }
    
    // Mark as running
    await base44.asServiceRole.entities.TestDataJob.update(job.id, {
      status: 'running',
      started_at: new Date().toISOString()
    });
    
    console.log('[PROCESS] Job marked as running, starting seeder...');
    
    try {
      // Run the seeder, passing jobId for cancellation checks
      const jobConfig = job.config;
      const result = await runSeeder(base44, jobConfig, job.id);
      
      // Re-check job status before marking complete (might have been cancelled)
      const finalJobCheck = await base44.asServiceRole.entities.TestDataJob.filter({ id: job.id });
      const finalJob = finalJobCheck[0];
      
      if (finalJob?.status === 'cancelled') {
        console.log('[PROCESS] Job was cancelled, not marking as completed');
        return Response.json({
          success: false,
          jobId: job.id,
          message: 'Job was cancelled',
          created: result.created,
          updated: result.updated
        });
      }
      
      if (result.cancelled) {
        console.log('[PROCESS] Seeder stopped early due to cancellation');
        return Response.json({
          success: false,
          jobId: job.id,
          message: 'Job was cancelled mid-processing',
          created: result.created,
          updated: result.updated
        });
      }
      
      console.log('[PROCESS] Seeder completed successfully');
      
      // Mark as completed only if still in running state
      if (finalJob?.status === 'running') {
        await base44.asServiceRole.entities.TestDataJob.update(job.id, {
          status: 'completed',
          finished_at: new Date().toISOString(),
          result_summary: {
            created: result.created,
            updated: result.updated,
            questionsUsed: result.questionsUsed
          }
        });
      }
      
      return Response.json({
        success: true,
        jobId: job.id,
        created: result.created,
        updated: result.updated
      });
      
    } catch (seederError) {
      console.error('[PROCESS] Seeder error:', seederError.message);
      
      // Mark as failed
      await base44.asServiceRole.entities.TestDataJob.update(job.id, {
        status: 'failed',
        finished_at: new Date().toISOString(),
        error_message: seederError.message
      });
      
      return Response.json({
        success: false,
        jobId: job.id,
        error: seederError.message
      });
    }
    
  } catch (error) {
    console.error('[PROCESS] Fatal error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});