import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Seed Mock ClearQuest Interviews (Simplified)
 * Creates 5 interview sessions for testing/demo purposes
 * Dept Code: MPD-12345
 */

const DEPT_CODE = "MPD-12345";

const CANDIDATE_PERSONAS = [
  {
    fileNumber: "GREAT-A",
    name: "TEST – Marcus 'Marc' Delaney",
    riskLevel: "low",
    questionsAnswered: 15,
    yesCount: 1,
    followupsTriggered: 1,
    aiProbes: 0,
    redFlags: 0
  },
  {
    fileNumber: "GREAT-B", 
    name: "TEST – Elena Marquez",
    riskLevel: "low",
    questionsAnswered: 12,
    yesCount: 2,
    followupsTriggered: 2,
    aiProbes: 0,
    redFlags: 0
  },
  {
    fileNumber: "MID-C",
    name: "TEST – Daniel 'Danny' Rios",
    riskLevel: "moderate",
    questionsAnswered: 20,
    yesCount: 6,
    followupsTriggered: 5,
    aiProbes: 8,
    redFlags: 3
  },
  {
    fileNumber: "HIGH-D",
    name: "TEST – Tyrone 'Ty' Holloway",
    riskLevel: "elevated",
    questionsAnswered: 22,
    yesCount: 11,
    followupsTriggered: 8,
    aiProbes: 10,
    redFlags: 7
  },
  {
    fileNumber: "HIGH-E",
    name: "TEST – Shawn Patrick O'Neill",
    riskLevel: "elevated",
    questionsAnswered: 25,
    yesCount: 13,
    followupsTriggered: 6,
    aiProbes: 15,
    redFlags: 8
  }
];

function generateSessionHash() {
  const chars = 'abcdef0123456789';
  let hash = '';
  for (let i = 0; i < 64; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}

function generateSimpleTranscript(persona) {
  const now = new Date();
  return [
    { type: "question", section: "Applications with other Law Enforcement Agencies", question_id: "Q001", question_text: "Have you ever applied to any other law enforcement agency?", timestamp: new Date(now.getTime() - 7000000).toISOString() },
    { type: "answer", question_id: "Q001", answer: persona.yesCount > 0 ? "Yes" : "No", timestamp: new Date(now.getTime() - 6900000).toISOString() },
    { type: "question", section: "Driving Record", question_id: "Q010", question_text: "Have you ever been involved in a motor vehicle collision?", timestamp: new Date(now.getTime() - 6800000).toISOString() },
    { type: "answer", question_id: "Q010", answer: "No", timestamp: new Date(now.getTime() - 6700000).toISOString() },
    { type: "question", section: "Criminal Involvement / Police Contacts", question_id: "Q020", question_text: "Have you ever been arrested?", timestamp: new Date(now.getTime() - 6600000).toISOString() },
    { type: "answer", question_id: "Q020", answer: persona.redFlags > 0 ? "Yes" : "No", timestamp: new Date(now.getTime() - 6500000).toISOString() }
  ];
}

async function createOrUpdateSession(base44, persona) {
  const fileNumber = persona.fileNumber;
  const sessionCode = `${DEPT_CODE}_${fileNumber}`;
  
  console.log(`[SEED] Processing ${fileNumber}...`);
  
  // Check if session already exists
  let existing = [];
  try {
    existing = await base44.asServiceRole.entities.InterviewSession.filter({
      department_code: DEPT_CODE,
      file_number: fileNumber
    });
  } catch (err) {
    console.log(`[SEED] Filter error for ${fileNumber}: ${err.message}`);
  }
  
  const now = new Date();
  const startTime = new Date(now.getTime() - (3600000 * 2)); // Started 2 hours ago
  const endTime = new Date(now.getTime() - (300000)); // Completed 5 min ago
  
  const sessionData = {
    session_code: sessionCode,
    department_code: DEPT_CODE,
    file_number: fileNumber,
    status: "completed",
    is_archived: false,
    started_at: startTime.toISOString(),
    completed_at: endTime.toISOString(),
    last_activity_at: endTime.toISOString(),
    questions_answered_count: persona.questionsAnswered,
    followups_count: persona.followupsTriggered,
    ai_probes_count: persona.aiProbes,
    red_flags_count: persona.redFlags,
    completion_percent: 100,
    elapsed_seconds: Math.floor((endTime - startTime) / 1000),
    active_seconds: Math.floor((endTime - startTime) / 1000) - 600,
    transcript_snapshot: generateSimpleTranscript(persona),
    session_hash: generateSessionHash(),
    risk_rating: persona.riskLevel,
    metadata: {
      isTestData: true,
      testPersona: fileNumber,
      candidateName: persona.name,
      generatedAt: now.toISOString()
    },
    data_version: "v2.5-hybrid"
  };
  
  if (existing.length > 0) {
    // Update existing session
    console.log(`[SEED] Updating existing session for ${fileNumber} (id: ${existing[0].id})`);
    await base44.asServiceRole.entities.InterviewSession.update(existing[0].id, sessionData);
    console.log(`[SEED] Updated session: ${sessionCode}, status: completed`);
    return { action: "updated", fileNumber, sessionId: existing[0].id };
  } else {
    // Create new session
    console.log(`[SEED] Creating new session for ${fileNumber}`);
    const session = await base44.asServiceRole.entities.InterviewSession.create(sessionData);
    console.log(`[SEED] Created session: ${sessionCode}, id: ${session.id}, status: completed`);
    return { action: "created", fileNumber, sessionId: session.id };
  }
}

Deno.serve(async (req) => {
  console.log('[SEED_MOCK_INTERVIEWS] Starting...');
  
  try {
    const base44 = createClientFromRequest(req);
    
    // Auth check
    let user = null;
    try {
      user = await base44.auth.me();
    } catch (authErr) {
      console.log('[SEED] Auth error:', authErr.message);
    }
    
    // Allow if user is admin or SUPER_ADMIN
    if (!user || (user.role !== 'admin' && user.role !== 'SUPER_ADMIN')) {
      console.log('[SEED] Unauthorized. User role:', user?.role);
      return Response.json({ 
        error: 'Unauthorized - Admin access required',
        userRole: user?.role 
      }, { status: 403 });
    }
    
    console.log(`[SEED] Authorized user: ${user.email}, role: ${user.role}`);
    
    const results = [];
    let created = 0;
    let updated = 0;
    let failed = 0;
    
    for (const persona of CANDIDATE_PERSONAS) {
      try {
        const result = await createOrUpdateSession(base44, persona);
        results.push({ ...result, success: true });
        if (result.action === "created") created++;
        if (result.action === "updated") updated++;
      } catch (error) {
        console.error(`[SEED] Error for ${persona.fileNumber}:`, error.message);
        results.push({ fileNumber: persona.fileNumber, success: false, error: error.message });
        failed++;
      }
    }
    
    console.log(`[SEED] Complete. Created: ${created}, Updated: ${updated}, Failed: ${failed}`);
    
    return Response.json({
      success: true,
      departmentCode: DEPT_CODE,
      total: CANDIDATE_PERSONAS.length,
      created,
      updated,
      failed,
      results
    });
  } catch (error) {
    console.error('[SEED_MOCK_INTERVIEWS] Fatal error:', error.message);
    return Response.json({ 
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});