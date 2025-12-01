import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Seed Mock ClearQuest Interviews - Full Version v2
 * Creates 5 complete interview sessions with ALL questions answered
 * Strict persona-based YES/NO patterns with proper follow-up creation
 */

const DEPT_CODE = "MPD-12345";

// Strict YES question IDs per persona - these are the ONLY questions that get YES
const PERSONA_YES_QUESTIONS = {
  "GREAT-A": {
    name: "TEST – Marcus 'Marc' Delaney",
    riskLevel: "low",
    // 1-2 mild YES: just a speeding ticket
    yesQuestionIds: ["Q008"] // traffic citation
  },
  "GREAT-B": {
    name: "TEST – Elena Marquez",
    riskLevel: "low",
    // 2-3 mild YES: prior LE app (withdrew), minor financial (paid off)
    yesQuestionIds: ["Q001", "Q091"] // prior LE app, 90 days late on account
  },
  "MID-C": {
    name: "TEST – Daniel 'Danny' Rios",
    riskLevel: "moderate",
    // 5-7 YES: driving, employment, financial, drugs, police contact
    yesQuestionIds: [
      "Q008",  // traffic citation
      "Q096",  // marijuana use
      "Q091",  // 90 days late financial
      "Q125",  // job termination  
      "Q022",  // questioned/detained by police
      "Q301"   // detained by police
    ]
  },
  "HIGH-D": {
    name: "TEST – Tyrone 'Ty' Holloway",
    riskLevel: "elevated",
    // 10-12 YES: marijuana heavy, cocaine once, 2 terminations, domestic, debt, disorderly, social media
    yesQuestionIds: [
      "Q096",  // marijuana
      "Q097",  // other drugs (cocaine)
      "Q022",  // arrested/questioned
      "Q301",  // detained
      "Q024",  // domestic dispute
      "Q091",  // 90 days late
      "Q092",  // collections
      "Q125",  // job termination 1
      "Q126",  // job termination 2 / resigned to avoid
      "Q159",  // embarrassment to department
      "Q160"   // social media issues
    ]
  },
  "HIGH-E": {
    name: "TEST – Shawn Patrick O'Neill",
    riskLevel: "elevated",
    // 12-15 YES: DUI, meth, opioids, multiple police, domestic/property, termination, financial, social media
    yesQuestionIds: [
      "Q007",  // DUI/DWI
      "Q008",  // traffic citation
      "Q096",  // marijuana
      "Q097",  // other drugs (meth)
      "Q098",  // prescription misuse (opioids)
      "Q022",  // arrested/questioned
      "Q301",  // detained
      "Q024",  // domestic dispute
      "Q025",  // property damage
      "Q091",  // 90 days late
      "Q092",  // collections
      "Q093",  // bankruptcy consideration
      "Q125",  // job termination
      "Q159",  // embarrassment
      "Q160"   // social media
    ]
  }
};

// Follow-up response data per persona per pack
const FOLLOWUP_DATA = {
  "GREAT-A": {
    "PACK_DRIVING_VIOLATIONS_STANDARD": {
      incident_date: "March 2021",
      incident_location: "I-10, Phoenix, AZ",
      incident_description: "Minor speeding ticket, 9 mph over the limit",
      legal_outcome: "Paid fine, attended defensive driving school, no points",
      circumstances: "Running late to work, wasn't watching speedometer",
      accountability_response: "Completely my fault. I've been more careful since."
    }
  },
  "GREAT-B": {
    "PACK_PRIOR_LE_APPS_STANDARD": {
      incident_date: "January 2022",
      incident_location: "Glendale, AZ",
      incident_description: "Applied to Glendale Police Department",
      legal_outcome: "Withdrew application voluntarily",
      circumstances: "My mother became seriously ill and I needed to be her caregiver. It wasn't the right time.",
      accountability_response: "I made the right choice for my family. She has since recovered and I'm ready now."
    },
    "PACK_FINANCIAL_STANDARD": {
      incident_date: "2022",
      incident_location: "Phoenix, AZ",
      incident_description: "Medical bill from ER visit went to collections",
      legal_outcome: "Fully paid off September 2023",
      circumstances: "Unexpected emergency room visit, about $850. Set up payment plan and completed it.",
      accountability_response: "I should have addressed it sooner but I paid it in full."
    }
  },
  "MID-C": {
    "PACK_DRIVING_VIOLATIONS_STANDARD": {
      incident_date: "Around October 2020",
      incident_location: "Tempe, AZ",
      incident_description: "Red light violation",
      legal_outcome: "Paid the fine",
      circumstances: "I was distracted, honestly not sure exactly what happened. Right before Halloween I think.",
      accountability_response: "It was my fault for not paying attention."
    },
    "PACK_DRUG_USE_STANDARD": {
      incident_date: "First used around 2012 in high school",
      frequency: "Maybe 10-15 times total",
      last_occurrence: "2018 or early 2019",
      incident_description: "Marijuana experimentation at parties",
      circumstances: "Social use only at parties in high school and college. Never bought my own.",
      accountability_response: "It was a phase. I haven't used in over 5 years."
    },
    "PACK_FINANCIAL_STANDARD": {
      incident_date: "2020",
      incident_location: "Tempe, AZ",
      incident_description: "Credit card went 90+ days late during COVID",
      legal_outcome: "Caught up and current now",
      circumstances: "Hours got cut at work during the pandemic. Once I got back to full time I paid it off.",
      accountability_response: "I should have communicated with the credit card company sooner."
    },
    "PACK_EMPLOYMENT_STANDARD": {
      incident_date: "Summer 2018",
      incident_location: "Tempe, AZ",
      incident_description: "Terminated from Target for attendance",
      legal_outcome: "Clean separation",
      circumstances: "I was calling out sick too much during a rough personal time. Got two write-ups then terminated.",
      accountability_response: "It was my fault. I should have communicated better with my manager."
    },
    "PACK_GENERAL_CRIME_STANDARD": {
      incident_date: "Summer 2019, maybe July",
      incident_location: "Tempe, AZ",
      incident_description: "Roommate argument, neighbors called police",
      legal_outcome: "No arrests, no charges. Officers talked to us and left.",
      circumstances: "We were arguing about bills and chores. It got loud but was never physical.",
      accountability_response: "We both got too heated. I've learned to walk away now."
    }
  },
  "HIGH-D": {
    "PACK_DRUG_USE_STANDARD": [{
      instance_number: 1,
      substance_name: "Marijuana",
      incident_date: "Started at 14 or 15, around 2005-2006",
      frequency: "Every weekend in late teens, then monthly",
      last_occurrence: "Early 2021, January or February",
      incident_description: "Regular marijuana use over many years",
      circumstances: "Social use. In my late teens and early 20s it was like every weekend. Slowed down to once or twice a month. Quit when I started thinking about LE career.",
      accountability_response: "I know it was wrong. I've been clean for years now."
    }, {
      instance_number: 2,
      substance_name: "Cocaine",
      incident_date: "Around age 24, so 2015",
      frequency: "One time only",
      last_occurrence: "That same night",
      incident_description: "Tried cocaine once at a party",
      circumstances: "Someone offered it at a party. I tried it once. Didn't like how it made me feel.",
      accountability_response: "It was stupid. I never did it again."
    }],
    "PACK_GENERAL_CRIME_STANDARD": {
      incident_date: "Late 2017, October or November",
      incident_location: "Mesa, AZ",
      incident_description: "Disorderly conduct at a bar",
      legal_outcome: "Charges dismissed after community service",
      circumstances: "Got into an argument at a bar. I pushed somebody. Bouncers called cops. Spent the night in jail.",
      accountability_response: "I had an anger problem back then. I've worked on it."
    },
    "PACK_DOMESTIC_VIOLENCE_STANDARD": {
      incident_date: "2020",
      incident_location: "Mesa, AZ",
      incident_description: "Verbal argument with ex-girlfriend, she called police",
      legal_outcome: "No arrests. Cops told me to leave for the night.",
      circumstances: "Big argument, yelling. I might have thrown a pillow. No physical contact with her.",
      accountability_response: "I should have walked away sooner. We broke up shortly after."
    },
    "PACK_FINANCIAL_STANDARD": {
      incident_date: "Ongoing",
      incident_location: "Mesa, AZ",
      incident_description: "About $2,500 in collections",
      legal_outcome: "On a payment plan",
      circumstances: "Some old bills I'm working on. Paying $150 a month.",
      accountability_response: "I'm addressing it. Should be done in about a year."
    },
    "PACK_EMPLOYMENT_STANDARD": [{
      instance_number: 1,
      incident_date: "2016",
      incident_location: "Mesa, AZ",
      incident_description: "Terminated from Home Depot for insubordination",
      circumstances: "Got into an argument with a supervisor. I had an attitude problem back then.",
      accountability_response: "I was young and immature. I've grown a lot since then."
    }, {
      instance_number: 2,
      incident_date: "2019",
      incident_location: "Mesa, AZ",
      incident_description: "Terminated from UPS for attendance",
      circumstances: "Going through a breakup, wasn't showing up consistently.",
      accountability_response: "Personal issues affected my work. I've learned to separate the two."
    }],
    "PACK_GENERAL_DISCLOSURE_STANDARD": {
      incident_date: "Years ago",
      incident_description: "Inappropriate social media posts",
      circumstances: "Shared some crude memes, got into arguments online. Nothing racist. Just immature stuff.",
      accountability_response: "I've deleted most of it. I'm more careful now about what I post."
    }
  },
  "HIGH-E": {
    "PACK_DRIVING_DUIDWI_STANDARD": {
      incident_date: "February 2019",
      incident_location: "Casa Grande, AZ",
      incident_description: "DUI arrest",
      legal_outcome: "Pled to lesser charge, community service, alcohol classes, license suspended 90 days",
      circumstances: "I was working at the welding shop in Casa Grande. Got pulled over after drinking at a bar.",
      accountability_response: "It was a wake-up call. I don't drink and drive anymore."
    },
    "PACK_DRIVING_VIOLATIONS_STANDARD": {
      incident_date: "Multiple over the years",
      incident_location: "Arizona",
      incident_description: "Various traffic citations",
      legal_outcome: "Fines paid",
      circumstances: "Speeding mostly. A couple over the years.",
      accountability_response: "I've been more careful lately."
    },
    "PACK_DRUG_USE_STANDARD": [{
      instance_number: 1,
      substance_name: "Marijuana",
      incident_date: "Started as a teenager",
      frequency: "Occasional",
      last_occurrence: "2020",
      incident_description: "Marijuana use",
      circumstances: "Used on and off over the years.",
      accountability_response: "Haven't used since 2020."
    }, {
      instance_number: 2,
      substance_name: "Methamphetamine",
      incident_date: "2006-2007, age 17-18",
      frequency: "3-4 times",
      last_occurrence: "Before age 20",
      incident_description: "Methamphetamine experimentation in late teens",
      circumstances: "I was hanging with a bad crowd back then. Tried it a few times.",
      accountability_response: "That was over 15 years ago. I got away from those people."
    }],
    "PACK_PRESCRIPTION_MISUSE": {
      incident_date: "2020",
      incident_description: "Opioid misuse after back injury",
      frequency: "4-5 months",
      last_occurrence: "Late 2020",
      circumstances: "Had a back injury from welding. Doctor prescribed Oxycodone. I took more than prescribed for a few months.",
      accountability_response: "I realized I had a problem and talked to my doctor. Got proper treatment."
    },
    "PACK_GENERAL_CRIME_STANDARD": {
      incident_date: "Multiple times over the years",
      incident_location: "Various, Arizona",
      incident_description: "Multiple police contacts",
      legal_outcome: "No convictions",
      circumstances: "Different situations. Domestic calls, disturbances. Maybe 3 or 4 times total.",
      accountability_response: "Nothing serious. Just circumstances."
    },
    "PACK_DOMESTIC_VIOLENCE_STANDARD": {
      incident_date: "2021",
      incident_location: "Yuma, AZ",
      incident_description: "Argument with ex-wife during divorce, punched a wall",
      legal_outcome: "No charges filed. I left before cops arrived.",
      circumstances: "We were arguing about the divorce. I was frustrated and put a hole in the drywall. Never touched her.",
      accountability_response: "I paid to fix the wall. The divorce was hard on both of us."
    },
    "PACK_FINANCIAL_STANDARD": {
      incident_date: "Current",
      incident_location: "Yuma, AZ",
      incident_description: "Approximately $8,000 in collections",
      legal_outcome: "Working on it",
      circumstances: "Credit card from marriage about $4k. Medical bills from back surgery about $3k. Old phone bill $800.",
      accountability_response: "I'm trying to get back on my feet after the divorce and layoff."
    },
    "PACK_EMPLOYMENT_STANDARD": {
      incident_date: "March 2024",
      incident_location: "Arizona",
      incident_description: "Terminated from Arizona Steel Works for insubordination",
      legal_outcome: "Terminated same day",
      circumstances: "Supervisor accused me of not following safety protocols. I disagreed and raised my voice. We got into it.",
      accountability_response: "I should have handled it differently. I was frustrated."
    },
    "PACK_GENERAL_DISCLOSURE_STANDARD": {
      incident_date: "Over the years",
      incident_description: "Problematic social media posts",
      circumstances: "Some angry posts when I was going through stuff. Arguments online. Maybe some inappropriate comments.",
      accountability_response: "I've deleted most of it. I need to be more careful."
    }
  }
};

function generateSessionHash() {
  const chars = 'abcdef0123456789';
  return Array.from({length: 64}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

async function createMockSession(base44, personaKey, questions, sections) {
  const persona = PERSONA_YES_QUESTIONS[personaKey];
  const fileNumber = personaKey;
  const sessionCode = `${DEPT_CODE}_${fileNumber}`;
  const yesSet = new Set(persona.yesQuestionIds);
  
  console.log(`[SEED] Processing ${fileNumber} (${persona.name})...`);
  console.log(`[SEED] ${fileNumber} will have ${yesSet.size} YES answers`);
  
  // Find or create session
  let session = null;
  try {
    const existing = await base44.asServiceRole.entities.InterviewSession.filter({
      department_code: DEPT_CODE,
      file_number: fileNumber
    });
    if (existing.length > 0) {
      session = existing[0];
      console.log(`[SEED] Found existing session ${session.id}`);
      
      // Delete old responses
      try {
        const oldResponses = await base44.asServiceRole.entities.Response.filter({ session_id: session.id });
        for (const r of oldResponses) {
          await base44.asServiceRole.entities.Response.delete(r.id);
        }
        console.log(`[SEED] Deleted ${oldResponses.length} old responses`);
      } catch (e) { console.log(`[SEED] Error deleting responses: ${e.message}`); }
      
      // Delete old followups
      try {
        const oldFollowups = await base44.asServiceRole.entities.FollowUpResponse.filter({ session_id: session.id });
        for (const f of oldFollowups) {
          await base44.asServiceRole.entities.FollowUpResponse.delete(f.id);
        }
        console.log(`[SEED] Deleted ${oldFollowups.length} old followups`);
      } catch (e) { console.log(`[SEED] Error deleting followups: ${e.message}`); }
    }
  } catch (err) {
    console.log(`[SEED] No existing session: ${err.message}`);
  }
  
  const now = new Date();
  const startTime = new Date(now.getTime() - 7200000); // 2 hours ago
  let currentTime = startTime.getTime();
  
  // Build section map
  const sectionMap = {};
  for (const s of sections) {
    sectionMap[s.section_id] = s.section_name;
  }
  
  const transcript = [];
  let yesCount = 0;
  let noCount = 0;
  let redFlagsCount = 0;
  let followupsCreated = 0;
  
  // Process ALL questions
  console.log(`[SEED] Processing ${questions.length} questions for ${fileNumber}...`);
  
  for (const q of questions) {
    const sectionName = sectionMap[q.section_id] || q.category || 'Unknown';
    const isYes = yesSet.has(q.question_id);
    const answer = isYes ? "Yes" : "No";
    
    if (isYes) yesCount++;
    else noCount++;
    
    // Timestamp: 5-10 seconds per question
    currentTime += 5000 + Math.floor(Math.random() * 5000);
    const questionTimestamp = new Date(currentTime).toISOString();
    
    currentTime += 3000 + Math.floor(Math.random() * 4000);
    const answerTimestamp = new Date(currentTime).toISOString();
    
    // Add to transcript
    transcript.push({
      type: "question",
      section: sectionName,
      question_id: q.question_id,
      question_text: q.question_text,
      timestamp: questionTimestamp
    });
    
    transcript.push({
      type: "answer",
      question_id: q.question_id,
      answer,
      triggered_followup: isYes && !!q.followup_pack,
      timestamp: answerTimestamp
    });
    
    // Check if flagged
    const isFlagged = isYes && (
      q.followup_pack?.includes('CRIME') ||
      q.followup_pack?.includes('DRUG') ||
      q.followup_pack?.includes('DUI') ||
      q.followup_pack?.includes('DOMESTIC') ||
      q.followup_pack?.includes('VIOLENCE')
    );
    if (isFlagged) redFlagsCount++;
  }
  
  const endTime = new Date(currentTime + 60000);
  
  // Create/update session
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
    followups_count: 0, // Will update after
    ai_probes_count: 0,
    red_flags_count: redFlagsCount,
    completion_percent: 100,
    elapsed_seconds: Math.floor((endTime.getTime() - startTime.getTime()) / 1000),
    active_seconds: Math.floor((endTime.getTime() - startTime.getTime()) / 1000) - 300,
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
  
  if (session) {
    await base44.asServiceRole.entities.InterviewSession.update(session.id, sessionData);
    console.log(`[SEED] Updated session ${session.id}`);
  } else {
    session = await base44.asServiceRole.entities.InterviewSession.create(sessionData);
    console.log(`[SEED] Created session ${session.id}`);
  }
  
  // Create Response records for ALL questions
  let responsesCreated = 0;
  for (const q of questions) {
    const sectionName = sectionMap[q.section_id] || q.category || 'Unknown';
    const isYes = yesSet.has(q.question_id);
    
    try {
      await base44.asServiceRole.entities.Response.create({
        session_id: session.id,
        question_id: q.question_id,
        question_text: q.question_text,
        category: sectionName,
        answer: isYes ? "Yes" : "No",
        triggered_followup: isYes && !!q.followup_pack,
        followup_pack: isYes ? q.followup_pack : null,
        is_flagged: isYes && (q.followup_pack?.includes('CRIME') || q.followup_pack?.includes('DRUG')),
        response_timestamp: new Date(startTime.getTime() + responsesCreated * 7000).toISOString()
      });
      responsesCreated++;
    } catch (e) {
      console.log(`[SEED] Response error for ${q.question_id}: ${e.message}`);
    }
  }
  
  // Create FollowUpResponse records for YES answers with followup_pack
  const personaFollowups = FOLLOWUP_DATA[personaKey] || {};
  
  for (const q of questions) {
    if (!yesSet.has(q.question_id) || !q.followup_pack) continue;
    
    const packData = personaFollowups[q.followup_pack];
    if (!packData) {
      // Create generic followup even if no specific data
      try {
        await base44.asServiceRole.entities.FollowUpResponse.create({
          session_id: session.id,
          question_id: q.question_id,
          question_text_snapshot: q.question_text,
          followup_pack: q.followup_pack,
          instance_number: 1,
          incident_description: "Details provided during interview",
          completed: true,
          completed_timestamp: endTime.toISOString()
        });
        followupsCreated++;
      } catch (e) {
        console.log(`[SEED] Generic followup error: ${e.message}`);
      }
      continue;
    }
    
    // Handle array (multi-instance) or single followup
    const items = Array.isArray(packData) ? packData : [packData];
    
    for (let i = 0; i < items.length; i++) {
      const data = items[i];
      try {
        await base44.asServiceRole.entities.FollowUpResponse.create({
          session_id: session.id,
          question_id: q.question_id,
          question_text_snapshot: q.question_text,
          followup_pack: q.followup_pack,
          instance_number: data.instance_number || (i + 1),
          substance_name: data.substance_name,
          incident_date: data.incident_date,
          incident_location: data.incident_location,
          incident_description: data.incident_description,
          frequency: data.frequency,
          last_occurrence: data.last_occurrence,
          circumstances: data.circumstances,
          accountability_response: data.accountability_response,
          legal_outcome: data.legal_outcome,
          additional_details: data,
          completed: true,
          completed_timestamp: endTime.toISOString()
        });
        followupsCreated++;
      } catch (e) {
        console.log(`[SEED] Followup error for ${q.followup_pack}: ${e.message}`);
      }
    }
  }
  
  // Update session with followup count
  await base44.asServiceRole.entities.InterviewSession.update(session.id, {
    followups_count: followupsCreated
  });
  
  console.log(`[SEED] ${fileNumber}: ${responsesCreated} responses, ${followupsCreated} followups, ${yesCount} YES, ${noCount} NO, ${redFlagsCount} flags`);
  
  return {
    action: session ? "updated" : "created",
    fileNumber,
    sessionId: session.id,
    stats: { responsesCreated, followupsCreated, yesCount, noCount, redFlagsCount }
  };
}

Deno.serve(async (req) => {
  console.log('[SEED] Starting full seeder v2...');
  
  try {
    const base44 = createClientFromRequest(req);
    
    let user = null;
    try {
      user = await base44.auth.me();
    } catch (e) {
      console.log('[SEED] Auth error:', e.message);
    }
    
    if (!user || (user.role !== 'admin' && user.role !== 'SUPER_ADMIN')) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    // Fetch ALL active questions
    const questions = await base44.asServiceRole.entities.Question.filter({ active: true });
    console.log(`[SEED] Found ${questions.length} active questions`);
    
    // Fetch sections
    const sections = await base44.asServiceRole.entities.Section.filter({ active: true });
    
    // Sort questions
    const sectionOrderMap = {};
    for (const s of sections) {
      sectionOrderMap[s.section_id] = s.section_order || 999;
    }
    questions.sort((a, b) => {
      const sA = sectionOrderMap[a.section_id] || 999;
      const sB = sectionOrderMap[b.section_id] || 999;
      if (sA !== sB) return sA - sB;
      return (a.display_order || 0) - (b.display_order || 0);
    });
    
    const results = [];
    let created = 0, updated = 0;
    
    for (const personaKey of Object.keys(PERSONA_YES_QUESTIONS)) {
      try {
        const result = await createMockSession(base44, personaKey, questions, sections);
        results.push({ ...result, success: true });
        if (result.action === "created") created++;
        else updated++;
      } catch (error) {
        console.error(`[SEED] Error for ${personaKey}:`, error.message);
        results.push({ fileNumber: personaKey, success: false, error: error.message });
      }
    }
    
    return Response.json({
      success: true,
      departmentCode: DEPT_CODE,
      questionsUsed: questions.length,
      created,
      updated,
      results
    });
  } catch (error) {
    console.error('[SEED] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});