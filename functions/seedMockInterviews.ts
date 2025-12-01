import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Seed Mock ClearQuest Interviews - Full Version
 * Creates 5 complete interview sessions with real questions and persona-driven answers
 * Dept Code: MPD-12345
 */

const DEPT_CODE = "MPD-12345";

// Persona definitions with Yes/No patterns keyed by question keywords
const PERSONAS = {
  "GREAT-A": {
    fileNumber: "GREAT-A",
    name: "TEST – Marcus 'Marc' Delaney",
    riskLevel: "low",
    // Questions containing these keywords will get "Yes" answers
    yesPatterns: ["traffic citation", "speeding"],
    // Specific question IDs to answer Yes
    yesQuestionIds: [],
    tone: "clear_confident",
    probeStyle: "direct"
  },
  "GREAT-B": {
    fileNumber: "GREAT-B",
    name: "TEST – Elena Marquez",
    riskLevel: "low",
    yesPatterns: ["applied with any other law enforcement", "90 days late", "collections"],
    yesQuestionIds: ["Q001"],
    tone: "articulate_thoughtful",
    probeStyle: "detailed"
  },
  "MID-C": {
    fileNumber: "MID-C",
    name: "TEST – Daniel 'Danny' Rios",
    riskLevel: "moderate",
    yesPatterns: [
      "traffic citation", "marijuana", "thc", "cannabis",
      "90 days late", "terminated", "fired", "let go",
      "detained", "questioned by law enforcement"
    ],
    yesQuestionIds: ["Q096", "Q022", "Q301"],
    tone: "honest_nervous",
    probeStyle: "vague_then_clarify"
  },
  "HIGH-D": {
    fileNumber: "HIGH-D",
    name: "TEST – Tyrone 'Ty' Holloway",
    riskLevel: "elevated",
    yesPatterns: [
      "marijuana", "thc", "cannabis", "cocaine", "drug",
      "terminated", "fired", "let go", "resigned",
      "domestic", "argument", "dispute",
      "collections", "90 days late", "debt",
      "arrested", "detained", "questioned",
      "disorderly", "social media", "embarrassment"
    ],
    yesQuestionIds: ["Q096", "Q022", "Q301", "Q159"],
    tone: "guarded_cooperative",
    probeStyle: "vague_needs_probing"
  },
  "HIGH-E": {
    fileNumber: "HIGH-E",
    name: "TEST – Shawn Patrick O'Neill",
    riskLevel: "elevated",
    yesPatterns: [
      "dui", "dwi", "alcohol", "intoxicated",
      "marijuana", "thc", "methamphetamine", "meth", "opioid", "prescription",
      "terminated", "fired", "misconduct",
      "domestic", "dispute", "property damage",
      "collections", "bankruptcy", "debt", "foreclosure",
      "arrested", "detained", "questioned", "police contact",
      "social media", "embarrassment", "inappropriate"
    ],
    yesQuestionIds: ["Q096", "Q022", "Q301", "Q159", "ALC001"],
    tone: "defensive_inconsistent",
    probeStyle: "conflicting_then_clarify"
  }
};

// Follow-up response templates by pack type
const FOLLOWUP_TEMPLATES = {
  "PACK_DRIVING_VIOLATIONS_STANDARD": {
    "GREAT-A": {
      incident_date: "March 2021",
      incident_description: "Minor speeding ticket, 9 mph over on I-10",
      legal_outcome: "Paid fine, attended defensive driving school",
      circumstances: "Was running late to work, wasn't paying attention to speed"
    },
    "MID-C": {
      incident_date: "Around October 2020, I think",
      incident_description: "Red light violation",
      legal_outcome: "Paid the fine",
      circumstances: "I was distracted, honestly not sure exactly what happened"
    }
  },
  "PACK_PRIOR_LE_APPS_STANDARD": {
    "GREAT-B": {
      incident_date: "January 2022",
      incident_description: "Applied to Glendale PD, withdrew application",
      circumstances: "Family obligations - my mother was ill and I needed to focus on her care",
      legal_outcome: "Withdrew voluntarily, no issues"
    }
  },
  "PACK_FINANCIAL_STANDARD": {
    "GREAT-B": {
      incident_date: "2022",
      incident_description: "Medical bill went to collections - ER visit",
      circumstances: "About $850, unexpected emergency room visit",
      legal_outcome: "Fully paid off as of September 2023 via payment plan"
    },
    "MID-C": {
      incident_date: "2020, during COVID",
      incident_description: "Credit card went 90+ days late",
      circumstances: "Hours got cut at work during the pandemic",
      legal_outcome: "Caught up once I got back to full time"
    },
    "HIGH-D": {
      incident_date: "Ongoing",
      incident_description: "About $2,500 in collections",
      circumstances: "Some old bills I'm working on",
      legal_outcome: "On a payment plan, $150/month"
    },
    "HIGH-E": {
      incident_date: "Current",
      incident_description: "Around $8,000 in collections",
      circumstances: "Credit card from marriage ($4k), medical bills from back surgery ($3k), old phone bill ($800)",
      legal_outcome: "Working on it, no formal plan yet"
    }
  },
  "PACK_GENERAL_CRIME_STANDARD": {
    "MID-C": {
      incident_date: "Summer 2019, maybe July",
      incident_description: "Roommate argument, neighbors called police",
      circumstances: "We were arguing about bills and chores. Got loud but never physical.",
      legal_outcome: "Officers talked to us and left. No arrests, no charges."
    },
    "HIGH-D": {
      incident_date: "Late 2017, October or November",
      incident_description: "Disorderly conduct at a bar",
      circumstances: "Got into an argument, pushed someone, bouncers called cops. Spent the night in jail.",
      legal_outcome: "Charges dismissed after community service"
    },
    "HIGH-E": {
      incident_date: "A few times over the years",
      incident_description: "Multiple police contacts",
      circumstances: "Different situations - domestic calls, disturbances",
      legal_outcome: "No convictions"
    }
  },
  "PACK_DRUG_USE_STANDARD": {
    "MID-C": {
      incident_date: "High school, around 2012",
      incident_description: "Marijuana experimentation",
      frequency: "Maybe 10-15 times total at parties",
      last_occurrence: "2018 or early 2019",
      circumstances: "Social use only, never bought my own"
    },
    "HIGH-D": {
      incident_date: "Started at 14 or 15",
      incident_description: "Marijuana use, heavy at times. One time cocaine.",
      frequency: "Marijuana: every weekend in late teens, then monthly. Cocaine: once at 24.",
      last_occurrence: "Early 2021 for marijuana. Cocaine was just that one time.",
      circumstances: "Marijuana was social. Quit when I started thinking about LE career."
    },
    "HIGH-E": {
      incident_date: "2006-2007 for meth",
      incident_description: "Meth use in late teens, opioid misuse after injury",
      frequency: "Meth: 3-4 times. Opioids: 4-5 months of misuse",
      last_occurrence: "Meth before age 20. Opioids: 2020",
      circumstances: "Meth was bad crowd as a teenager. Opioids were prescribed for back injury but took more than prescribed."
    }
  },
  "PACK_DOMESTIC_VIOLENCE_STANDARD": {
    "HIGH-D": {
      incident_date: "2020",
      incident_description: "Verbal argument with ex-girlfriend, she called police",
      circumstances: "Big argument, yelling. I might have thrown a pillow. No physical contact.",
      legal_outcome: "Cops told me to leave for the night. No arrests."
    },
    "HIGH-E": {
      incident_date: "2021",
      incident_description: "Argument with ex-wife during divorce, punched a wall",
      circumstances: "We were arguing about the divorce. I was frustrated and put a hole in the drywall.",
      legal_outcome: "She called cops, I left before they arrived. No charges. I paid to fix the wall."
    }
  },
  "PACK_EMPLOYMENT_STANDARD": {
    "MID-C": {
      incident_date: "Summer 2018",
      incident_description: "Terminated from Target for attendance",
      circumstances: "Calling out sick too much during a rough personal patch. Got two write-ups then terminated.",
      legal_outcome: "Clean separation, eligible for rehire I think"
    },
    "HIGH-D": [{
      incident_date: "2016",
      incident_description: "Home Depot - terminated for insubordination",
      circumstances: "Got into an argument with a supervisor. Had an attitude problem back then.",
      legal_outcome: "Let go"
    }, {
      incident_date: "2019",
      incident_description: "UPS - terminated for attendance",
      circumstances: "Going through a breakup, wasn't showing up consistently",
      legal_outcome: "Let go"
    }],
    "HIGH-E": {
      incident_date: "March 2024",
      incident_description: "Arizona Steel Works - terminated for insubordination",
      circumstances: "Supervisor accused me of not following safety protocols. I disagreed and raised my voice.",
      legal_outcome: "Terminated same day"
    }
  },
  "PACK_DRIVING_DUIDWI_STANDARD": {
    "HIGH-E": {
      incident_date: "February 2019",
      incident_description: "DUI arrest",
      circumstances: "Was at the welding shop in Casa Grande. Got pulled over after drinking.",
      legal_outcome: "Pled to lesser charge, community service, alcohol classes, license suspended 90 days"
    }
  }
};

// AI probing exchanges for different personas
const PROBING_EXCHANGES = {
  "MID-C": [
    {
      question_id: "Q096",
      probes: [
        { probing_question: "You mentioned marijuana use. Can you be more specific about when you first tried it?", candidate_response: "It was in high school, probably junior year. So around 2012 when I was 16 or 17." },
        { probing_question: "And how many times total would you estimate you used?", candidate_response: "Maybe 10-15 times total. It was just at parties, I never bought my own or anything." }
      ]
    },
    {
      question_id: "Q022",
      probes: [
        { probing_question: "Can you narrow down when this police contact occurred?", candidate_response: "It was summer 2019, maybe July? My roommate and I got into a loud argument." }
      ]
    }
  ],
  "HIGH-D": [
    {
      question_id: "Q096",
      probes: [
        { probing_question: "You said you started using marijuana young. Can you be more specific about the age and timeframe?", candidate_response: "I was like 14 or 15. So that would have been around 2005 or 2006." },
        { probing_question: "And how often were you using at the peak?", candidate_response: "In my late teens and early 20s it was like every weekend. Then it slowed down to maybe once or twice a month." },
        { probing_question: "When exactly did you stop?", candidate_response: "Early 2021. Maybe January or February. I quit when I started thinking about this career." }
      ]
    },
    {
      question_id: "Q022",
      probes: [
        { probing_question: "Can you provide an approximate month and year for the disorderly conduct arrest?", candidate_response: "I think... maybe 2017? Could have been 2018. Around there." },
        { probing_question: "Think about what was happening in your life at that time. Can you narrow it down?", candidate_response: "It was before I started my current job, so probably late 2017. October or November." },
        { probing_question: "Was there any physical contact during the bar incident?", candidate_response: "I pushed somebody. Not like a full fight, but I shoved them and the bouncers called the cops." }
      ]
    }
  ],
  "HIGH-E": [
    {
      question_id: "Q096",
      probes: [
        { probing_question: "You mentioned methamphetamine use. How old were you when you first used?", candidate_response: "17 or 18. So around 2006 or 2007." },
        { probing_question: "How many times did you use methamphetamine?", candidate_response: "Maybe like... once or twice?" },
        { probing_question: "Can you be more specific? Was it one time, two times, or more?", candidate_response: "Okay, it was probably three or four times. I was hanging with a bad crowd back then." }
      ]
    },
    {
      question_id: "ALC001",
      probes: [
        { probing_question: "Regarding the DUI, can you provide an approximate year?", candidate_response: "Maybe 2019? Or was it 2018..." },
        { probing_question: "Think about what job you had or where you were living at the time.", candidate_response: "I was at the welding shop in Casa Grande, so it was 2019. February I think." }
      ]
    },
    {
      question_id: "Q159",
      probes: [
        { probing_question: "Can you describe the nature of the social media content that might cause embarrassment?", candidate_response: "Some angry posts from when I was younger. Arguments online. Maybe some inappropriate comments." },
        { probing_question: "Was any of this content political, racist, or threatening in nature?", candidate_response: "Not racist, no. Maybe some political stuff. I was just venting. I've deleted most of it." }
      ]
    }
  ]
};

function generateSessionHash() {
  const chars = 'abcdef0123456789';
  let hash = '';
  for (let i = 0; i < 64; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}

function shouldAnswerYes(question, persona) {
  const questionText = (question.question_text || '').toLowerCase();
  const questionId = question.question_id;
  
  // Check explicit question IDs
  if (persona.yesQuestionIds && persona.yesQuestionIds.includes(questionId)) {
    return true;
  }
  
  // Check keyword patterns
  for (const pattern of (persona.yesPatterns || [])) {
    if (questionText.includes(pattern.toLowerCase())) {
      return true;
    }
  }
  
  return false;
}

function getFollowupData(packId, personaKey) {
  const packData = FOLLOWUP_TEMPLATES[packId];
  if (!packData) return null;
  return packData[personaKey] || null;
}

function getProbingExchanges(personaKey, questionId) {
  const personaProbes = PROBING_EXCHANGES[personaKey];
  if (!personaProbes) return [];
  
  const questionProbes = personaProbes.find(p => p.question_id === questionId);
  return questionProbes ? questionProbes.probes : [];
}

async function createMockSession(base44, personaKey, questions, sections) {
  const persona = PERSONAS[personaKey];
  const fileNumber = persona.fileNumber;
  const sessionCode = `${DEPT_CODE}_${fileNumber}`;
  
  console.log(`[SEED] Processing ${fileNumber} (${persona.name})...`);
  
  // Check for existing session
  let existingSession = null;
  try {
    const existing = await base44.asServiceRole.entities.InterviewSession.filter({
      department_code: DEPT_CODE,
      file_number: fileNumber
    });
    if (existing.length > 0) {
      existingSession = existing[0];
      console.log(`[SEED] Found existing session ${existingSession.id}, will update`);
    }
  } catch (err) {
    console.log(`[SEED] No existing session for ${fileNumber}`);
  }
  
  // Delete existing responses and followups if session exists
  if (existingSession) {
    try {
      const oldResponses = await base44.asServiceRole.entities.Response.filter({ session_id: existingSession.id });
      for (const r of oldResponses) {
        await base44.asServiceRole.entities.Response.delete(r.id);
      }
      console.log(`[SEED] Deleted ${oldResponses.length} old responses`);
    } catch (e) { /* ignore */ }
    
    try {
      const oldFollowups = await base44.asServiceRole.entities.FollowUpResponse.filter({ session_id: existingSession.id });
      for (const f of oldFollowups) {
        await base44.asServiceRole.entities.FollowUpResponse.delete(f.id);
      }
      console.log(`[SEED] Deleted ${oldFollowups.length} old followups`);
    } catch (e) { /* ignore */ }
  }
  
  const now = new Date();
  const startTime = new Date(now.getTime() - (3600000 * 2));
  const endTime = new Date(now.getTime() - (300000));
  
  // Build section map
  const sectionMap = {};
  for (const s of sections) {
    sectionMap[s.section_id] = s.section_name;
  }
  
  // Generate responses for all questions
  const transcript = [];
  const responsesToCreate = [];
  const followupsToCreate = [];
  let yesCount = 0;
  let noCount = 0;
  let redFlags = 0;
  let aiProbesCount = 0;
  let timestampOffset = 0;
  
  for (const q of questions) {
    const sectionName = sectionMap[q.section_id] || q.category || 'Unknown';
    const isYes = shouldAnswerYes(q, persona);
    const answer = isYes ? "Yes" : "No";
    
    if (isYes) yesCount++;
    else noCount++;
    
    const timestamp = new Date(startTime.getTime() + timestampOffset).toISOString();
    timestampOffset += Math.floor(Math.random() * 15000) + 5000;
    
    // Add question to transcript
    transcript.push({
      type: "question",
      section: sectionName,
      question_id: q.question_id,
      question_text: q.question_text,
      timestamp
    });
    
    // Add answer to transcript
    const answerTimestamp = new Date(startTime.getTime() + timestampOffset).toISOString();
    timestampOffset += Math.floor(Math.random() * 10000) + 3000;
    
    transcript.push({
      type: "answer",
      question_id: q.question_id,
      answer,
      triggered_followup: isYes && q.followup_pack,
      timestamp: answerTimestamp
    });
    
    // Check for AI probing exchanges
    const probes = getProbingExchanges(personaKey, q.question_id);
    const investigatorProbing = [];
    
    for (let i = 0; i < probes.length; i++) {
      const probe = probes[i];
      const probeTimestamp = new Date(startTime.getTime() + timestampOffset).toISOString();
      timestampOffset += Math.floor(Math.random() * 8000) + 3000;
      
      transcript.push({
        type: "ai_probe",
        question_id: q.question_id,
        question_text: probe.probing_question,
        timestamp: probeTimestamp
      });
      
      const responseTimestamp = new Date(startTime.getTime() + timestampOffset).toISOString();
      timestampOffset += Math.floor(Math.random() * 12000) + 5000;
      
      transcript.push({
        type: "ai_probe_answer",
        question_id: q.question_id,
        answer: probe.candidate_response,
        timestamp: responseTimestamp
      });
      
      investigatorProbing.push({
        sequence_number: i + 1,
        probing_question: probe.probing_question,
        candidate_response: probe.candidate_response,
        timestamp: responseTimestamp
      });
      
      aiProbesCount++;
    }
    
    // Determine if flagged (high-risk questions with Yes)
    const isFlagged = isYes && (
      q.question_text.toLowerCase().includes('arrest') ||
      q.question_text.toLowerCase().includes('drug') ||
      q.question_text.toLowerCase().includes('dui') ||
      q.question_text.toLowerCase().includes('domestic') ||
      q.question_text.toLowerCase().includes('terminated') ||
      q.question_text.toLowerCase().includes('meth') ||
      q.question_text.toLowerCase().includes('cocaine')
    );
    
    if (isFlagged) redFlags++;
    
    responsesToCreate.push({
      session_id: null, // Will be set after session creation
      question_id: q.question_id,
      question_text: q.question_text,
      category: sectionName,
      answer,
      triggered_followup: isYes && !!q.followup_pack,
      followup_pack: isYes ? q.followup_pack : null,
      is_flagged: isFlagged,
      response_timestamp: answerTimestamp,
      investigator_probing: investigatorProbing.length > 0 ? investigatorProbing : undefined
    });
    
    // Create follow-up response if applicable
    if (isYes && q.followup_pack) {
      const followupData = getFollowupData(q.followup_pack, personaKey);
      if (followupData) {
        // Handle multi-instance (array) followups
        const followupItems = Array.isArray(followupData) ? followupData : [followupData];
        
        for (let idx = 0; idx < followupItems.length; idx++) {
          const fuData = followupItems[idx];
          followupsToCreate.push({
            session_id: null,
            question_id: q.question_id,
            question_text_snapshot: q.question_text,
            followup_pack: q.followup_pack,
            instance_number: idx + 1,
            incident_date: fuData.incident_date,
            incident_description: fuData.incident_description,
            frequency: fuData.frequency,
            last_occurrence: fuData.last_occurrence,
            circumstances: fuData.circumstances,
            legal_outcome: fuData.legal_outcome,
            additional_details: fuData,
            completed: true,
            completed_timestamp: endTime.toISOString()
          });
        }
      }
    }
  }
  
  // Create or update session
  const sessionData = {
    session_code: sessionCode,
    department_code: DEPT_CODE,
    file_number: fileNumber,
    status: "completed",
    is_archived: false,
    started_at: startTime.toISOString(),
    completed_at: endTime.toISOString(),
    last_activity_at: endTime.toISOString(),
    questions_answered_count: questions.length,
    followups_count: followupsToCreate.length,
    ai_probes_count: aiProbesCount,
    red_flags_count: redFlags,
    completion_percent: 100,
    elapsed_seconds: Math.floor((endTime - startTime) / 1000),
    active_seconds: Math.floor((endTime - startTime) / 1000) - 600,
    transcript_snapshot: transcript,
    session_hash: generateSessionHash(),
    risk_rating: persona.riskLevel,
    metadata: {
      isTestData: true,
      testPersona: fileNumber,
      candidateName: persona.name,
      generatedAt: now.toISOString(),
      yesCount,
      noCount
    },
    data_version: "v2.5-hybrid"
  };
  
  let session;
  if (existingSession) {
    await base44.asServiceRole.entities.InterviewSession.update(existingSession.id, sessionData);
    session = { ...existingSession, ...sessionData };
    console.log(`[SEED] Updated session ${existingSession.id}`);
  } else {
    session = await base44.asServiceRole.entities.InterviewSession.create(sessionData);
    console.log(`[SEED] Created session ${session.id}`);
  }
  
  // Create responses
  let responsesCreated = 0;
  for (const resp of responsesToCreate) {
    resp.session_id = session.id;
    try {
      await base44.asServiceRole.entities.Response.create(resp);
      responsesCreated++;
    } catch (e) {
      console.log(`[SEED] Error creating response: ${e.message}`);
    }
  }
  
  // Create followups
  let followupsCreated = 0;
  for (const fu of followupsToCreate) {
    fu.session_id = session.id;
    try {
      await base44.asServiceRole.entities.FollowUpResponse.create(fu);
      followupsCreated++;
    } catch (e) {
      console.log(`[SEED] Error creating followup: ${e.message}`);
    }
  }
  
  console.log(`[SEED] ${fileNumber}: ${responsesCreated} responses, ${followupsCreated} followups, ${aiProbesCount} probes, ${yesCount} yes, ${noCount} no, ${redFlags} flags`);
  
  return {
    action: existingSession ? "updated" : "created",
    fileNumber,
    sessionId: session.id,
    stats: { responsesCreated, followupsCreated, aiProbesCount, yesCount, noCount, redFlags }
  };
}

Deno.serve(async (req) => {
  console.log('[SEED_MOCK_INTERVIEWS] Starting full seeder...');
  
  try {
    const base44 = createClientFromRequest(req);
    
    // Auth check
    let user = null;
    try {
      user = await base44.auth.me();
    } catch (authErr) {
      console.log('[SEED] Auth error:', authErr.message);
    }
    
    if (!user || (user.role !== 'admin' && user.role !== 'SUPER_ADMIN')) {
      return Response.json({ error: 'Unauthorized - Admin access required' }, { status: 403 });
    }
    
    console.log(`[SEED] Authorized: ${user.email}`);
    
    // Fetch real questions
    console.log('[SEED] Fetching questions...');
    const questions = await base44.asServiceRole.entities.Question.filter({ active: true });
    console.log(`[SEED] Found ${questions.length} active questions`);
    
    // Fetch sections
    console.log('[SEED] Fetching sections...');
    const sections = await base44.asServiceRole.entities.Section.filter({ active: true });
    console.log(`[SEED] Found ${sections.length} active sections`);
    
    // Sort questions by section order then display order
    const sectionOrderMap = {};
    for (const s of sections) {
      sectionOrderMap[s.section_id] = s.section_order || 999;
    }
    
    questions.sort((a, b) => {
      const sectionA = sectionOrderMap[a.section_id] || 999;
      const sectionB = sectionOrderMap[b.section_id] || 999;
      if (sectionA !== sectionB) return sectionA - sectionB;
      return (a.display_order || 0) - (b.display_order || 0);
    });
    
    const results = [];
    let totalCreated = 0;
    let totalUpdated = 0;
    
    for (const personaKey of Object.keys(PERSONAS)) {
      try {
        const result = await createMockSession(base44, personaKey, questions, sections);
        results.push({ ...result, success: true });
        if (result.action === "created") totalCreated++;
        if (result.action === "updated") totalUpdated++;
      } catch (error) {
        console.error(`[SEED] Error for ${personaKey}:`, error.message);
        results.push({ fileNumber: personaKey, success: false, error: error.message });
      }
    }
    
    console.log(`[SEED] Complete. Created: ${totalCreated}, Updated: ${totalUpdated}`);
    
    return Response.json({
      success: true,
      departmentCode: DEPT_CODE,
      questionsUsed: questions.length,
      total: Object.keys(PERSONAS).length,
      created: totalCreated,
      updated: totalUpdated,
      results
    });
  } catch (error) {
    console.error('[SEED_MOCK_INTERVIEWS] Fatal error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});