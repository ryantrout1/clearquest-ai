import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Seed Mock ClearQuest Interviews
 * Creates 5 complete, realistic interview sessions for testing/demo purposes
 * Dept Code: MPD-12345
 */

const DEPT_CODE = "MPD-12345";

// Candidate persona definitions
const CANDIDATE_PERSONAS = {
  "GREAT-A": {
    fileNumber: "GREAT-A",
    name: "TEST – Marcus 'Marc' Delaney",
    age: 27,
    residence: "Buckeye, AZ",
    riskLevel: "low",
    yesCount: 2,
    personality: "cooperative_confident",
    background: {
      education: "B.S. Criminal Justice from ASU",
      employment: "Security Supervisor at Banner Health",
      familyLE: "Father is retired Avondale Police officer"
    }
  },
  "GREAT-B": {
    fileNumber: "GREAT-B", 
    name: "TEST – Elena Marquez",
    age: 31,
    residence: "Glendale, AZ",
    riskLevel: "low",
    yesCount: 3,
    personality: "warm_thoughtful",
    background: {
      education: "B.A. Sociology",
      employment: "Community Outreach Coordinator at youth non-profit",
      communityService: "Extensive volunteer work"
    }
  },
  "MID-C": {
    fileNumber: "MID-C",
    name: "TEST – Daniel 'Danny' Rios",
    age: 29,
    residence: "Tempe, AZ",
    riskLevel: "moderate",
    yesCount: 6,
    personality: "honest_nervous",
    background: {
      education: "Associate Degree in Fire Science",
      employment: "Amazon DSP delivery driver",
      issues: ["late credit account", "job termination at 22", "marijuana experimentation", "driving citation", "police contact - roommate argument"]
    }
  },
  "HIGH-D": {
    fileNumber: "HIGH-D",
    name: "TEST – Tyrone 'Ty' Holloway",
    age: 33,
    residence: "Mesa, AZ",
    riskLevel: "elevated",
    yesCount: 11,
    personality: "cooperative_guarded",
    background: {
      education: "High school diploma, some community college",
      employment: "Warehouse forklift operator",
      issues: ["disorderly conduct arrest (dismissed)", "significant marijuana use", "cocaine experimentation", "two job terminations", "domestic verbal dispute", "debt collections", "problematic social media"]
    }
  },
  "HIGH-E": {
    fileNumber: "HIGH-E",
    name: "TEST – Shawn Patrick O'Neill",
    age: 35,
    residence: "Yuma, AZ",
    riskLevel: "elevated",
    yesCount: 13,
    personality: "defensive_inconsistent",
    background: {
      education: "GED, Welding Certification",
      employment: "Currently unemployed (laid off 8 months ago)",
      issues: ["DUI", "meth use in late teens", "opioid misuse after injury", "multiple police contacts", "domestic argument with property damage", "job termination for misconduct", "financial problems", "problematic social media"]
    }
  }
};

// Section definitions matching ClearQuest structure
const SECTIONS = [
  { id: "CAT_APPLICATIONS_WITH_OTHER_LAW_ENFORCEMENT_AGENCIES", name: "Applications with other Law Enforcement Agencies", order: 1 },
  { id: "CAT_DRIVING_RECORD", name: "Driving Record", order: 2 },
  { id: "CAT_CRIMINAL", name: "Criminal Involvement / Police Contacts", order: 3 },
  { id: "CAT_EXTREMIST", name: "Extremist Organizations", order: 4 },
  { id: "CAT_SEXUAL", name: "Sexual Activities", order: 5 },
  { id: "CAT_FINANCIAL", name: "Financial History", order: 6 },
  { id: "CAT_DRUGS", name: "Illegal Drug / Narcotic History", order: 7 },
  { id: "SEC_1763421845484", name: "Drug Use: Substance History", order: 8 },
  { id: "CAT_ALCOHOL", name: "Alcohol History", order: 9 },
  { id: "CAT_MILITARY_HISTORY", name: "Military History", order: 10 },
  { id: "CAT_EMPLOYMENT", name: "Employment History", order: 11 },
  { id: "CAT_PRIOR_LAW_ENFORCEMENT", name: "Prior Law Enforcement", order: 12 },
  { id: "CAT_GENERAL", name: "General Disclosures & Eligibility", order: 13 }
];

/**
 * Generate realistic timestamp progression
 */
function generateTimestamps(baseTime, count) {
  const timestamps = [];
  let current = new Date(baseTime).getTime();
  for (let i = 0; i < count; i++) {
    current += Math.floor(Math.random() * 15000) + 5000; // 5-20 seconds between events
    timestamps.push(new Date(current).toISOString());
  }
  return timestamps;
}

/**
 * Generate session hash
 */
function generateSessionHash() {
  const chars = 'abcdef0123456789';
  let hash = '';
  for (let i = 0; i < 64; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}

/**
 * Generate transcript for GREAT-A (Marcus Delaney)
 */
function generateGreatATranscript(startTime) {
  const timestamps = generateTimestamps(startTime, 50);
  let idx = 0;
  
  return {
    transcript: [
      // Prior LE Applications
      { type: "question", section: "Applications with other Law Enforcement Agencies", question_id: "Q001", question_text: "Have you ever applied to any other law enforcement agency?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q001", answer: "No", timestamp: timestamps[idx++] },
      
      // Driving Record
      { type: "question", section: "Driving Record", question_id: "Q010", question_text: "Have you ever been involved in a motor vehicle collision?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q010", answer: "No", timestamp: timestamps[idx++] },
      { type: "question", section: "Driving Record", question_id: "Q011", question_text: "Have you ever received a traffic citation?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q011", answer: "Yes", triggered_followup: true, timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_DRIVING_VIOLATIONS_STANDARD", field: "violation_date", question_text: "When did this violation occur?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_DRIVING_VIOLATIONS_STANDARD", field: "violation_date", answer: "March 2021", timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_DRIVING_VIOLATIONS_STANDARD", field: "violation_type", question_text: "What type of violation was this?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_DRIVING_VIOLATIONS_STANDARD", field: "violation_type", answer: "Speeding - 9 mph over the limit on the I-10", timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_DRIVING_VIOLATIONS_STANDARD", field: "outcome", question_text: "What was the outcome?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_DRIVING_VIOLATIONS_STANDARD", field: "outcome", answer: "Paid the fine, attended defensive driving school, no points on my record", timestamp: timestamps[idx++] },
      
      // Criminal - all No
      { type: "question", section: "Criminal Involvement / Police Contacts", question_id: "Q020", question_text: "Have you ever been arrested?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q020", answer: "No", timestamp: timestamps[idx++] },
      { type: "question", section: "Criminal Involvement / Police Contacts", question_id: "Q021", question_text: "Have you ever been detained by police?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q021", answer: "No", timestamp: timestamps[idx++] },
      
      // Extremist - No
      { type: "question", section: "Extremist Organizations", question_id: "Q030", question_text: "Have you ever been a member of any extremist organization?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q030", answer: "No", timestamp: timestamps[idx++] },
      
      // Sexual Activities - No issues
      { type: "question", section: "Sexual Activities", question_id: "Q040", question_text: "Have you ever engaged in any illegal sexual activity?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q040", answer: "No", timestamp: timestamps[idx++] },
      
      // Financial - Clean
      { type: "question", section: "Financial History", question_id: "Q050", question_text: "Have you ever filed for bankruptcy?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q050", answer: "No", timestamp: timestamps[idx++] },
      { type: "question", section: "Financial History", question_id: "Q051", question_text: "Do you have any accounts in collections?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q051", answer: "No", timestamp: timestamps[idx++] },
      
      // Drugs - No
      { type: "question", section: "Illegal Drug / Narcotic History", question_id: "Q060", question_text: "Have you ever used any illegal drugs?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q060", answer: "No", timestamp: timestamps[idx++] },
      
      // Alcohol - Responsible use
      { type: "question", section: "Alcohol History", question_id: "Q070", question_text: "Have you ever had any alcohol-related incidents?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q070", answer: "No", timestamp: timestamps[idx++] },
      
      // Military - N/A
      { type: "question", section: "Military History", question_id: "Q080", question_text: "Have you ever served in the military?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q080", answer: "No", timestamp: timestamps[idx++] },
      
      // Employment - Clean
      { type: "question", section: "Employment History", question_id: "Q090", question_text: "Have you ever been terminated from a job?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q090", answer: "No", timestamp: timestamps[idx++] },
      { type: "question", section: "Employment History", question_id: "Q091", question_text: "Have you ever resigned to avoid termination?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q091", answer: "No", timestamp: timestamps[idx++] },
      
      // General Disclosures
      { type: "question", section: "General Disclosures & Eligibility", question_id: "Q100", question_text: "Is there anything else that might affect your eligibility?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q100", answer: "No, I believe I've disclosed everything relevant.", timestamp: timestamps[idx++] }
    ],
    responses: [
      { question_id: "Q001", answer: "No", category: "Applications with other Law Enforcement Agencies", is_flagged: false },
      { question_id: "Q011", answer: "Yes", category: "Driving Record", is_flagged: false, triggered_followup: true, followup_pack: "PACK_DRIVING_VIOLATIONS_STANDARD" },
      { question_id: "Q020", answer: "No", category: "Criminal Involvement / Police Contacts", is_flagged: false },
      { question_id: "Q060", answer: "No", category: "Illegal Drug / Narcotic History", is_flagged: false }
    ],
    followups: [
      {
        question_id: "Q011",
        followup_pack: "PACK_DRIVING_VIOLATIONS_STANDARD",
        instance_number: 1,
        completed: true,
        additional_details: {
          violation_date: "March 2021",
          violation_type: "Speeding - 9 mph over",
          location: "I-10, Phoenix",
          outcome: "Paid fine, defensive driving school",
          points: "0 - attended traffic school"
        }
      }
    ],
    stats: {
      questions_answered: 15,
      yes_count: 1,
      no_count: 14,
      followups_triggered: 1,
      ai_probes: 0,
      red_flags: 0
    }
  };
}

/**
 * Generate transcript for GREAT-B (Elena Marquez)
 */
function generateGreatBTranscript(startTime) {
  const timestamps = generateTimestamps(startTime, 60);
  let idx = 0;
  
  return {
    transcript: [
      // Prior LE Applications - One previous
      { type: "question", section: "Applications with other Law Enforcement Agencies", question_id: "Q001", question_text: "Have you ever applied to any other law enforcement agency?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q001", answer: "Yes", triggered_followup: true, timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_LE_APPS", field: "agency", question_text: "Which agency did you apply to?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_LE_APPS", field: "agency", answer: "Glendale Police Department", timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_LE_APPS", field: "application_date", question_text: "When did you apply?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_LE_APPS", field: "application_date", answer: "January 2022", timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_LE_APPS", field: "outcome", question_text: "What was the outcome?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_LE_APPS", field: "outcome", answer: "I withdrew my application - I wasn't ready at the time due to family obligations. My mother was ill and I needed to focus on her care.", timestamp: timestamps[idx++] },
      
      // Driving - Clean
      { type: "question", section: "Driving Record", question_id: "Q010", question_text: "Have you ever been involved in a motor vehicle collision?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q010", answer: "No", timestamp: timestamps[idx++] },
      { type: "question", section: "Driving Record", question_id: "Q011", question_text: "Have you ever received a traffic citation?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q011", answer: "No", timestamp: timestamps[idx++] },
      
      // Criminal - Clean
      { type: "question", section: "Criminal Involvement / Police Contacts", question_id: "Q020", question_text: "Have you ever been arrested?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q020", answer: "No", timestamp: timestamps[idx++] },
      
      // Financial - Minor issue
      { type: "question", section: "Financial History", question_id: "Q051", question_text: "Have you ever had any accounts go to collections?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q051", answer: "Yes", triggered_followup: true, timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_FINANCIAL_STANDARD", field: "financial_issue_type", question_text: "What type of financial issue was this?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_FINANCIAL_STANDARD", field: "financial_issue_type", answer: "A medical bill from an ER visit", timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_FINANCIAL_STANDARD", field: "amount_owed", question_text: "What was the amount?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_FINANCIAL_STANDARD", field: "amount_owed", answer: "About $850", timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_FINANCIAL_STANDARD", field: "resolution_status", question_text: "What is the current status?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_FINANCIAL_STANDARD", field: "resolution_status", answer: "Fully paid off as of September 2023. I set up a payment plan and completed it.", timestamp: timestamps[idx++] },
      
      // Drugs - No
      { type: "question", section: "Illegal Drug / Narcotic History", question_id: "Q060", question_text: "Have you ever used any illegal drugs?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q060", answer: "No", timestamp: timestamps[idx++] },
      
      // Alcohol - Social only
      { type: "question", section: "Alcohol History", question_id: "Q070", question_text: "Have you ever had any alcohol-related incidents?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q070", answer: "No", timestamp: timestamps[idx++] },
      
      // Employment - Clean
      { type: "question", section: "Employment History", question_id: "Q090", question_text: "Have you ever been terminated from a job?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q090", answer: "No", timestamp: timestamps[idx++] }
    ],
    responses: [
      { question_id: "Q001", answer: "Yes", category: "Applications with other Law Enforcement Agencies", is_flagged: false, triggered_followup: true },
      { question_id: "Q051", answer: "Yes", category: "Financial History", is_flagged: false, triggered_followup: true }
    ],
    followups: [
      {
        question_id: "Q001",
        followup_pack: "PACK_LE_APPS",
        instance_number: 1,
        completed: true,
        additional_details: {
          agency: "Glendale Police Department",
          application_date: "January 2022",
          outcome: "Withdrew",
          reason: "Family obligations - mother's illness"
        }
      },
      {
        question_id: "Q051",
        followup_pack: "PACK_FINANCIAL_STANDARD",
        instance_number: 1,
        completed: true,
        additional_details: {
          financial_issue_type: "Medical bill - ER visit",
          amount_owed: "$850",
          resolution_status: "Fully paid, September 2023"
        }
      }
    ],
    stats: {
      questions_answered: 12,
      yes_count: 2,
      no_count: 10,
      followups_triggered: 2,
      ai_probes: 0,
      red_flags: 0
    }
  };
}

/**
 * Generate transcript for MID-C (Danny Rios)
 */
function generateMidCTranscript(startTime) {
  const timestamps = generateTimestamps(startTime, 100);
  let idx = 0;
  
  return {
    transcript: [
      // Prior LE - No
      { type: "question", section: "Applications with other Law Enforcement Agencies", question_id: "Q001", question_text: "Have you ever applied to any other law enforcement agency?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q001", answer: "No", timestamp: timestamps[idx++] },
      
      // Driving - Citation
      { type: "question", section: "Driving Record", question_id: "Q011", question_text: "Have you ever received a traffic citation?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q011", answer: "Yes", triggered_followup: true, timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_DRIVING_VIOLATIONS_STANDARD", field: "violation_date", question_text: "When did this occur?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_DRIVING_VIOLATIONS_STANDARD", field: "violation_date", answer: "Uh, I think it was like... 2020 maybe?", timestamp: timestamps[idx++] },
      { type: "ai_probe", pack_id: "PACK_DRIVING_VIOLATIONS_STANDARD", field: "violation_date", question_text: "Can you narrow down the timeframe? Was it early, mid, or late 2020?", timestamp: timestamps[idx++] },
      { type: "ai_probe_answer", pack_id: "PACK_DRIVING_VIOLATIONS_STANDARD", field: "violation_date", answer: "Oh right, it was around October 2020. I remember because it was right before Halloween.", timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_DRIVING_VIOLATIONS_STANDARD", field: "violation_type", question_text: "What was the violation?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_DRIVING_VIOLATIONS_STANDARD", field: "violation_type", answer: "Running a red light. I was distracted and didn't notice it had changed.", timestamp: timestamps[idx++] },
      
      // Criminal - Police contact
      { type: "question", section: "Criminal Involvement / Police Contacts", question_id: "Q021", question_text: "Have you ever had contact with police as a suspect or person of interest?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q021", answer: "Yes", triggered_followup: true, timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_GENERAL_CRIME_STANDARD", field: "incident_date", question_text: "When did this occur?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_GENERAL_CRIME_STANDARD", field: "incident_date", answer: "It was a while back", timestamp: timestamps[idx++] },
      { type: "ai_probe", pack_id: "PACK_GENERAL_CRIME_STANDARD", field: "incident_date", question_text: "Can you provide an approximate month and year?", timestamp: timestamps[idx++] },
      { type: "ai_probe_answer", pack_id: "PACK_GENERAL_CRIME_STANDARD", field: "incident_date", answer: "I think it was like... summer 2019? Maybe July?", timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_GENERAL_CRIME_STANDARD", field: "description", question_text: "What happened?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_GENERAL_CRIME_STANDARD", field: "description", answer: "My roommate and I got into a loud argument. Neighbors called the cops. They came out, talked to both of us, no one was arrested or anything.", timestamp: timestamps[idx++] },
      { type: "ai_probe", pack_id: "PACK_GENERAL_CRIME_STANDARD", field: "description", question_text: "Was the argument verbal only, or was there any physical contact or property damage?", timestamp: timestamps[idx++] },
      { type: "ai_probe_answer", pack_id: "PACK_GENERAL_CRIME_STANDARD", field: "description", answer: "Just verbal. We were yelling about bills and chores. Got heated but never physical. Officers just told us to keep it down and left.", timestamp: timestamps[idx++] },
      
      // Financial - Late account
      { type: "question", section: "Financial History", question_id: "Q052", question_text: "Have you ever been more than 90 days late on any account?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q052", answer: "Yes", triggered_followup: true, timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_FINANCIAL_STANDARD", field: "financial_issue_type", question_text: "What type of account was this?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_FINANCIAL_STANDARD", field: "financial_issue_type", answer: "Credit card", timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_FINANCIAL_STANDARD", field: "resolution_status", question_text: "What is the current status?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_FINANCIAL_STANDARD", field: "resolution_status", answer: "I got it caught up. It was during COVID when my hours got cut. Once I got back to full time I paid it off over a few months.", timestamp: timestamps[idx++] },
      
      // Drugs - Marijuana
      { type: "question", section: "Illegal Drug / Narcotic History", question_id: "Q060", question_text: "Have you ever used marijuana?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q060", answer: "Yes", triggered_followup: true, timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_DRUG_USE_STANDARD", field: "first_use_date", question_text: "When did you first use marijuana?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_DRUG_USE_STANDARD", field: "first_use_date", answer: "In high school, probably junior year", timestamp: timestamps[idx++] },
      { type: "ai_probe", pack_id: "PACK_DRUG_USE_STANDARD", field: "first_use_date", question_text: "Can you provide an approximate year?", timestamp: timestamps[idx++] },
      { type: "ai_probe_answer", pack_id: "PACK_DRUG_USE_STANDARD", field: "first_use_date", answer: "Around 2012 I guess, when I was 16 or 17", timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_DRUG_USE_STANDARD", field: "last_use_date", question_text: "When was the last time you used?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_DRUG_USE_STANDARD", field: "last_use_date", answer: "Probably 2018 or early 2019", timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_DRUG_USE_STANDARD", field: "total_uses", question_text: "How many times total did you use?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_DRUG_USE_STANDARD", field: "total_uses", answer: "Maybe 15-20 times total over those years. It was just at parties, never bought my own.", timestamp: timestamps[idx++] },
      
      // Employment - Termination
      { type: "question", section: "Employment History", question_id: "Q090", question_text: "Have you ever been terminated from a job?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q090", answer: "Yes", triggered_followup: true, timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_EMPLOYMENT_STANDARD", field: "employer", question_text: "What employer was this?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_EMPLOYMENT_STANDARD", field: "employer", answer: "Target, when I was like 22", timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_EMPLOYMENT_STANDARD", field: "incident_date", question_text: "When did this occur?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_EMPLOYMENT_STANDARD", field: "incident_date", answer: "Summer 2018", timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_EMPLOYMENT_STANDARD", field: "circumstances", question_text: "What were the circumstances?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_EMPLOYMENT_STANDARD", field: "circumstances", answer: "I was calling out sick too much. I was going through a rough patch personally and just wasn't showing up consistently. They let me go for attendance.", timestamp: timestamps[idx++] },
      { type: "ai_probe", pack_id: "PACK_EMPLOYMENT_STANDARD", field: "circumstances", question_text: "Were there any written warnings before termination?", timestamp: timestamps[idx++] },
      { type: "ai_probe_answer", pack_id: "PACK_EMPLOYMENT_STANDARD", field: "circumstances", answer: "Yeah, I got two write-ups for attendance and then the third time they terminated me. It was my fault, I should have communicated better with my manager.", timestamp: timestamps[idx++] }
    ],
    responses: [
      { question_id: "Q011", answer: "Yes", category: "Driving Record", is_flagged: false, triggered_followup: true },
      { question_id: "Q021", answer: "Yes", category: "Criminal Involvement / Police Contacts", is_flagged: true, triggered_followup: true },
      { question_id: "Q052", answer: "Yes", category: "Financial History", is_flagged: false, triggered_followup: true },
      { question_id: "Q060", answer: "Yes", category: "Illegal Drug / Narcotic History", is_flagged: true, triggered_followup: true },
      { question_id: "Q090", answer: "Yes", category: "Employment History", is_flagged: true, triggered_followup: true }
    ],
    followups: [
      { question_id: "Q011", followup_pack: "PACK_DRIVING_VIOLATIONS_STANDARD", instance_number: 1, completed: true },
      { question_id: "Q021", followup_pack: "PACK_GENERAL_CRIME_STANDARD", instance_number: 1, completed: true },
      { question_id: "Q052", followup_pack: "PACK_FINANCIAL_STANDARD", instance_number: 1, completed: true },
      { question_id: "Q060", followup_pack: "PACK_DRUG_USE_STANDARD", instance_number: 1, completed: true },
      { question_id: "Q090", followup_pack: "PACK_EMPLOYMENT_STANDARD", instance_number: 1, completed: true }
    ],
    stats: {
      questions_answered: 18,
      yes_count: 5,
      no_count: 13,
      followups_triggered: 5,
      ai_probes: 6,
      red_flags: 3
    }
  };
}

/**
 * Generate transcript for HIGH-D (Ty Holloway)
 */
function generateHighDTranscript(startTime) {
  const timestamps = generateTimestamps(startTime, 150);
  let idx = 0;
  
  return {
    transcript: [
      // Criminal - Disorderly conduct
      { type: "question", section: "Criminal Involvement / Police Contacts", question_id: "Q020", question_text: "Have you ever been arrested?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q020", answer: "Yes", triggered_followup: true, timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_GENERAL_CRIME_STANDARD", field: "incident_date", question_text: "When did this occur?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_GENERAL_CRIME_STANDARD", field: "incident_date", answer: "A while back", timestamp: timestamps[idx++] },
      { type: "ai_probe", pack_id: "PACK_GENERAL_CRIME_STANDARD", field: "incident_date", question_text: "Can you provide an approximate month and year?", timestamp: timestamps[idx++] },
      { type: "ai_probe_answer", pack_id: "PACK_GENERAL_CRIME_STANDARD", field: "incident_date", answer: "I think... maybe 2017? Could have been 2018. Around there.", timestamp: timestamps[idx++] },
      { type: "ai_probe", pack_id: "PACK_GENERAL_CRIME_STANDARD", field: "incident_date", question_text: "Think about what was happening in your life at that time. Can you narrow it down?", timestamp: timestamps[idx++] },
      { type: "ai_probe_answer", pack_id: "PACK_GENERAL_CRIME_STANDARD", field: "incident_date", answer: "It was before I started my current job, so probably late 2017. October or November.", timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_GENERAL_CRIME_STANDARD", field: "incident_type", question_text: "What were you arrested for?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_GENERAL_CRIME_STANDARD", field: "incident_type", answer: "Disorderly conduct", timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_GENERAL_CRIME_STANDARD", field: "description", question_text: "What happened?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_GENERAL_CRIME_STANDARD", field: "description", answer: "Got into an argument at a bar. Things got loud.", timestamp: timestamps[idx++] },
      { type: "ai_probe", pack_id: "PACK_GENERAL_CRIME_STANDARD", field: "description", question_text: "Was there any physical altercation or just verbal?", timestamp: timestamps[idx++] },
      { type: "ai_probe_answer", pack_id: "PACK_GENERAL_CRIME_STANDARD", field: "description", answer: "I pushed somebody. Not like a full fight, but I shoved them and the bouncers called the cops. I spent the night in jail.", timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_GENERAL_CRIME_STANDARD", field: "legal_outcome", question_text: "What was the outcome?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_GENERAL_CRIME_STANDARD", field: "legal_outcome", answer: "Charges were dismissed after I did some community service hours", timestamp: timestamps[idx++] },
      
      // Domestic dispute
      { type: "question", section: "Criminal Involvement / Police Contacts", question_id: "Q025", question_text: "Have you ever been involved in a domestic dispute?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q025", answer: "Yes", triggered_followup: true, timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_DOMESTIC_VIOLENCE_STANDARD", field: "incident_date", question_text: "When did this occur?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_DOMESTIC_VIOLENCE_STANDARD", field: "incident_date", answer: "2020", timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_DOMESTIC_VIOLENCE_STANDARD", field: "relationship", question_text: "What was your relationship to the other person?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_DOMESTIC_VIOLENCE_STANDARD", field: "relationship", answer: "My ex-girlfriend", timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_DOMESTIC_VIOLENCE_STANDARD", field: "circumstances", question_text: "What happened?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_DOMESTIC_VIOLENCE_STANDARD", field: "circumstances", answer: "We had a big argument. Yelling. She called the cops.", timestamp: timestamps[idx++] },
      { type: "ai_probe", pack_id: "PACK_DOMESTIC_VIOLENCE_STANDARD", field: "circumstances", question_text: "Was there any physical contact or property damage during this incident?", timestamp: timestamps[idx++] },
      { type: "ai_probe_answer", pack_id: "PACK_DOMESTIC_VIOLENCE_STANDARD", field: "circumstances", answer: "No physical contact. I might have thrown a pillow or something but I didn't hit her or break anything important. Just verbal.", timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_DOMESTIC_VIOLENCE_STANDARD", field: "legal_outcome", question_text: "What was the outcome?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_DOMESTIC_VIOLENCE_STANDARD", field: "legal_outcome", answer: "Cops came, talked to both of us, no arrests. They just told me to leave for the night and cool off.", timestamp: timestamps[idx++] },
      
      // Drugs - Marijuana heavy use
      { type: "question", section: "Illegal Drug / Narcotic History", question_id: "Q060", question_text: "Have you ever used marijuana?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q060", answer: "Yes", triggered_followup: true, timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_DRUG_USE_STANDARD", field: "first_use_date", question_text: "When did you first use?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_DRUG_USE_STANDARD", field: "first_use_date", answer: "High school. Like 14 or 15.", timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_DRUG_USE_STANDARD", field: "last_use_date", question_text: "When was your last use?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_DRUG_USE_STANDARD", field: "last_use_date", answer: "Probably... 2021?", timestamp: timestamps[idx++] },
      { type: "ai_probe", pack_id: "PACK_DRUG_USE_STANDARD", field: "last_use_date", question_text: "Can you be more specific about when in 2021?", timestamp: timestamps[idx++] },
      { type: "ai_probe_answer", pack_id: "PACK_DRUG_USE_STANDARD", field: "last_use_date", answer: "Early 2021. Maybe January or February. I quit when I started thinking about this career.", timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_DRUG_USE_STANDARD", field: "total_uses", question_text: "How many times total?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_DRUG_USE_STANDARD", field: "total_uses", answer: "A lot. Probably hundreds of times over the years.", timestamp: timestamps[idx++] },
      { type: "ai_probe", pack_id: "PACK_DRUG_USE_STANDARD", field: "total_uses", question_text: "Can you describe the frequency? Was it daily, weekly, monthly?", timestamp: timestamps[idx++] },
      { type: "ai_probe_answer", pack_id: "PACK_DRUG_USE_STANDARD", field: "total_uses", answer: "In my late teens and early 20s it was like every weekend. Then it slowed down to maybe once or twice a month. I wasn't addicted or anything, just used it socially.", timestamp: timestamps[idx++] },
      
      // Cocaine experimentation
      { type: "question", section: "Illegal Drug / Narcotic History", question_id: "Q061", question_text: "Have you ever used cocaine?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q061", answer: "Yes", triggered_followup: true, timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_DRUG_USE_STANDARD", field: "first_use_date", question_text: "When did you first try cocaine?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_DRUG_USE_STANDARD", field: "first_use_date", answer: "Once at a party. I was like 24.", timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_DRUG_USE_STANDARD", field: "total_uses", question_text: "How many times total did you use?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_DRUG_USE_STANDARD", field: "total_uses", answer: "Just that one time. I didn't like how it made me feel.", timestamp: timestamps[idx++] },
      
      // Employment - Two terminations
      { type: "question", section: "Employment History", question_id: "Q090", question_text: "Have you ever been terminated from a job?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q090", answer: "Yes", timestamp: timestamps[idx++] },
      { type: "question", section: "Employment History", question_id: "Q090_multi", question_text: "How many times have you been terminated?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q090_multi", answer: "Twice", triggered_followup: true, timestamp: timestamps[idx++] },
      
      // First termination
      { type: "followup_question", pack_id: "PACK_EMPLOYMENT_STANDARD", field: "employer", question_text: "What was the first employer?", instance: 1, timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_EMPLOYMENT_STANDARD", field: "employer", answer: "Home Depot", instance: 1, timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_EMPLOYMENT_STANDARD", field: "incident_date", question_text: "When were you terminated?", instance: 1, timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_EMPLOYMENT_STANDARD", field: "incident_date", answer: "2016", instance: 1, timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_EMPLOYMENT_STANDARD", field: "circumstances", question_text: "What happened?", instance: 1, timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_EMPLOYMENT_STANDARD", field: "circumstances", answer: "Got into an argument with a supervisor. I had an attitude problem back then.", instance: 1, timestamp: timestamps[idx++] },
      
      // Second termination
      { type: "followup_question", pack_id: "PACK_EMPLOYMENT_STANDARD", field: "employer", question_text: "What was the second employer?", instance: 2, timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_EMPLOYMENT_STANDARD", field: "employer", answer: "UPS", instance: 2, timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_EMPLOYMENT_STANDARD", field: "incident_date", question_text: "When were you terminated?", instance: 2, timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_EMPLOYMENT_STANDARD", field: "incident_date", answer: "2019", instance: 2, timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_EMPLOYMENT_STANDARD", field: "circumstances", question_text: "What happened?", instance: 2, timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_EMPLOYMENT_STANDARD", field: "circumstances", answer: "Attendance issues during a rough time in my life. Going through a breakup.", instance: 2, timestamp: timestamps[idx++] },
      
      // Financial - Collections
      { type: "question", section: "Financial History", question_id: "Q053", question_text: "Do you have any accounts currently in collections?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q053", answer: "Yes", triggered_followup: true, timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_FINANCIAL_STANDARD", field: "amount_owed", question_text: "What is the approximate amount?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_FINANCIAL_STANDARD", field: "amount_owed", answer: "About $2,500 total", timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_FINANCIAL_STANDARD", field: "resolution_steps", question_text: "What steps are you taking to resolve this?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_FINANCIAL_STANDARD", field: "resolution_steps", answer: "I'm on a payment plan. Paying $150 a month. Should be done in about a year.", timestamp: timestamps[idx++] },
      
      // Social media
      { type: "question", section: "General Disclosures & Eligibility", question_id: "Q105", question_text: "Have you ever posted anything on social media that could be considered inappropriate?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q105", answer: "Yes", triggered_followup: true, timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_GENERAL_DISCLOSURE_STANDARD", field: "circumstances", question_text: "What was posted?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_GENERAL_DISCLOSURE_STANDARD", field: "circumstances", answer: "I shared some memes that were in bad taste years ago. Also got into arguments online.", timestamp: timestamps[idx++] },
      { type: "ai_probe", pack_id: "PACK_GENERAL_DISCLOSURE_STANDARD", field: "circumstances", question_text: "Can you describe the nature of the content? Was it political, offensive language, or something else?", timestamp: timestamps[idx++] },
      { type: "ai_probe_answer", pack_id: "PACK_GENERAL_DISCLOSURE_STANDARD", field: "circumstances", answer: "Some crude humor, nothing racist or anything. Just immature stuff from when I was younger. I've deleted most of it.", timestamp: timestamps[idx++] }
    ],
    responses: [
      { question_id: "Q020", answer: "Yes", category: "Criminal Involvement / Police Contacts", is_flagged: true, triggered_followup: true },
      { question_id: "Q025", answer: "Yes", category: "Criminal Involvement / Police Contacts", is_flagged: true, triggered_followup: true },
      { question_id: "Q060", answer: "Yes", category: "Illegal Drug / Narcotic History", is_flagged: true, triggered_followup: true },
      { question_id: "Q061", answer: "Yes", category: "Illegal Drug / Narcotic History", is_flagged: true, triggered_followup: true },
      { question_id: "Q090", answer: "Yes", category: "Employment History", is_flagged: true, triggered_followup: true },
      { question_id: "Q053", answer: "Yes", category: "Financial History", is_flagged: true, triggered_followup: true },
      { question_id: "Q105", answer: "Yes", category: "General Disclosures & Eligibility", is_flagged: true, triggered_followup: true }
    ],
    followups: [
      { question_id: "Q020", followup_pack: "PACK_GENERAL_CRIME_STANDARD", instance_number: 1, completed: true },
      { question_id: "Q025", followup_pack: "PACK_DOMESTIC_VIOLENCE_STANDARD", instance_number: 1, completed: true },
      { question_id: "Q060", followup_pack: "PACK_DRUG_USE_STANDARD", instance_number: 1, completed: true },
      { question_id: "Q061", followup_pack: "PACK_DRUG_USE_STANDARD", instance_number: 2, completed: true },
      { question_id: "Q090", followup_pack: "PACK_EMPLOYMENT_STANDARD", instance_number: 1, completed: true },
      { question_id: "Q090", followup_pack: "PACK_EMPLOYMENT_STANDARD", instance_number: 2, completed: true },
      { question_id: "Q053", followup_pack: "PACK_FINANCIAL_STANDARD", instance_number: 1, completed: true },
      { question_id: "Q105", followup_pack: "PACK_GENERAL_DISCLOSURE_STANDARD", instance_number: 1, completed: true }
    ],
    stats: {
      questions_answered: 22,
      yes_count: 11,
      no_count: 11,
      followups_triggered: 8,
      ai_probes: 10,
      red_flags: 7
    }
  };
}

/**
 * Generate transcript for HIGH-E (Shawn O'Neill)
 */
function generateHighETranscript(startTime) {
  const timestamps = generateTimestamps(startTime, 180);
  let idx = 0;
  
  return {
    transcript: [
      // DUI
      { type: "question", section: "Driving Record", question_id: "Q012", question_text: "Have you ever been arrested for DUI or DWI?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q012", answer: "Yes", triggered_followup: true, timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_DRIVING_DUIDWI_STANDARD", field: "incident_date", question_text: "When did this occur?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_DRIVING_DUIDWI_STANDARD", field: "incident_date", answer: "I don't remember exactly", timestamp: timestamps[idx++] },
      { type: "ai_probe", pack_id: "PACK_DRIVING_DUIDWI_STANDARD", field: "incident_date", question_text: "Can you provide an approximate year?", timestamp: timestamps[idx++] },
      { type: "ai_probe_answer", pack_id: "PACK_DRIVING_DUIDWI_STANDARD", field: "incident_date", answer: "Maybe 2019? Or was it 2018...", timestamp: timestamps[idx++] },
      { type: "ai_probe", pack_id: "PACK_DRIVING_DUIDWI_STANDARD", field: "incident_date", question_text: "Think about what job you had or where you were living at the time.", timestamp: timestamps[idx++] },
      { type: "ai_probe_answer", pack_id: "PACK_DRIVING_DUIDWI_STANDARD", field: "incident_date", answer: "I was at the welding shop in Casa Grande, so it was 2019. February I think.", timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_DRIVING_DUIDWI_STANDARD", field: "substance_type", question_text: "What substance was involved?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_DRIVING_DUIDWI_STANDARD", field: "substance_type", answer: "Alcohol", timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_DRIVING_DUIDWI_STANDARD", field: "legal_outcome", question_text: "What was the outcome?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_DRIVING_DUIDWI_STANDARD", field: "legal_outcome", answer: "Pled to a lesser charge, did community service, alcohol classes, license suspended 90 days", timestamp: timestamps[idx++] },
      
      // Meth use
      { type: "question", section: "Illegal Drug / Narcotic History", question_id: "Q062", question_text: "Have you ever used methamphetamine?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q062", answer: "Yes", triggered_followup: true, timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_DRUG_USE_STANDARD", field: "first_use_date", question_text: "When did you first use?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_DRUG_USE_STANDARD", field: "first_use_date", answer: "When I was young", timestamp: timestamps[idx++] },
      { type: "ai_probe", pack_id: "PACK_DRUG_USE_STANDARD", field: "first_use_date", question_text: "How old were you approximately?", timestamp: timestamps[idx++] },
      { type: "ai_probe_answer", pack_id: "PACK_DRUG_USE_STANDARD", field: "first_use_date", answer: "17 or 18. So around 2006 or 2007.", timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_DRUG_USE_STANDARD", field: "last_use_date", question_text: "When was your last use?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_DRUG_USE_STANDARD", field: "last_use_date", answer: "A long time ago. Before I turned 20.", timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_DRUG_USE_STANDARD", field: "total_uses", question_text: "How many times did you use?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_DRUG_USE_STANDARD", field: "total_uses", answer: "Maybe like... once or twice?", timestamp: timestamps[idx++] },
      { type: "ai_probe", pack_id: "PACK_DRUG_USE_STANDARD", field: "total_uses", question_text: "Can you be more specific? Was it one time, two times, or more?", timestamp: timestamps[idx++] },
      { type: "ai_probe_answer", pack_id: "PACK_DRUG_USE_STANDARD", field: "total_uses", answer: "Okay, it was probably three or four times. I was hanging with a bad crowd back then.", timestamp: timestamps[idx++] },
      
      // Opioid misuse
      { type: "question", section: "Illegal Drug / Narcotic History", question_id: "Q063", question_text: "Have you ever misused prescription medication?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q063", answer: "Yes", triggered_followup: true, timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_PRESCRIPTION_MISUSE_STANDARD", field: "medication_type", question_text: "What medication was involved?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_PRESCRIPTION_MISUSE_STANDARD", field: "medication_type", answer: "Oxycodone. I had a back injury from welding.", timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_PRESCRIPTION_MISUSE_STANDARD", field: "access_source", question_text: "How did you obtain the medication?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_PRESCRIPTION_MISUSE_STANDARD", field: "access_source", answer: "It was prescribed to me, but I took more than I was supposed to.", timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_PRESCRIPTION_MISUSE_STANDARD", field: "most_recent_date", question_text: "When did this occur?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_PRESCRIPTION_MISUSE_STANDARD", field: "most_recent_date", answer: "2020, after my injury", timestamp: timestamps[idx++] },
      { type: "ai_probe", pack_id: "PACK_PRESCRIPTION_MISUSE_STANDARD", field: "most_recent_date", question_text: "For how long did you misuse the medication?", timestamp: timestamps[idx++] },
      { type: "ai_probe_answer", pack_id: "PACK_PRESCRIPTION_MISUSE_STANDARD", field: "most_recent_date", answer: "About 4-5 months before I realized I had a problem and talked to my doctor.", timestamp: timestamps[idx++] },
      
      // Domestic with property damage
      { type: "question", section: "Criminal Involvement / Police Contacts", question_id: "Q025", question_text: "Have you ever been involved in a domestic dispute?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q025", answer: "Yes", triggered_followup: true, timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_DOMESTIC_VIOLENCE_STANDARD", field: "incident_date", question_text: "When did this occur?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_DOMESTIC_VIOLENCE_STANDARD", field: "incident_date", answer: "2021", timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_DOMESTIC_VIOLENCE_STANDARD", field: "relationship", question_text: "What was your relationship?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_DOMESTIC_VIOLENCE_STANDARD", field: "relationship", answer: "My ex-wife", timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_DOMESTIC_VIOLENCE_STANDARD", field: "circumstances", question_text: "What happened?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_DOMESTIC_VIOLENCE_STANDARD", field: "circumstances", answer: "We were arguing about the divorce. I punched a wall.", timestamp: timestamps[idx++] },
      { type: "ai_probe", pack_id: "PACK_DOMESTIC_VIOLENCE_STANDARD", field: "circumstances", question_text: "Was there any physical contact with your ex-wife during this incident?", timestamp: timestamps[idx++] },
      { type: "ai_probe_answer", pack_id: "PACK_DOMESTIC_VIOLENCE_STANDARD", field: "circumstances", answer: "No. I never touched her. I just put a hole in the drywall. I was frustrated.", timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_DOMESTIC_VIOLENCE_STANDARD", field: "legal_outcome", question_text: "What was the outcome?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_DOMESTIC_VIOLENCE_STANDARD", field: "legal_outcome", answer: "She called the cops, I left before they arrived. No charges filed. I paid to fix the wall.", timestamp: timestamps[idx++] },
      
      // Job termination for misconduct
      { type: "question", section: "Employment History", question_id: "Q090", question_text: "Have you ever been terminated from a job?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q090", answer: "Yes", triggered_followup: true, timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_EMPLOYMENT_STANDARD", field: "employer", question_text: "What employer?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_EMPLOYMENT_STANDARD", field: "employer", answer: "Arizona Steel Works", timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_EMPLOYMENT_STANDARD", field: "incident_date", question_text: "When?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_EMPLOYMENT_STANDARD", field: "incident_date", answer: "Last year. March 2024.", timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_EMPLOYMENT_STANDARD", field: "circumstances", question_text: "What happened?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_EMPLOYMENT_STANDARD", field: "circumstances", answer: "I had words with my supervisor", timestamp: timestamps[idx++] },
      { type: "ai_probe", pack_id: "PACK_EMPLOYMENT_STANDARD", field: "circumstances", question_text: "Can you describe what the conflict was about and what specifically happened?", timestamp: timestamps[idx++] },
      { type: "ai_probe_answer", pack_id: "PACK_EMPLOYMENT_STANDARD", field: "circumstances", answer: "He accused me of not following safety protocols. I told him he was wrong. We got into it. I raised my voice. They said I was insubordinate and let me go.", timestamp: timestamps[idx++] },
      
      // Financial issues
      { type: "question", section: "Financial History", question_id: "Q050", question_text: "Have you ever filed for bankruptcy?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q050", answer: "No", timestamp: timestamps[idx++] },
      { type: "question", section: "Financial History", question_id: "Q053", question_text: "Do you have accounts in collections?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q053", answer: "Yes", triggered_followup: true, timestamp: timestamps[idx++] },
      { type: "followup_question", pack_id: "PACK_FINANCIAL_STANDARD", field: "amount_owed", question_text: "What is the total amount?", timestamp: timestamps[idx++] },
      { type: "followup_answer", pack_id: "PACK_FINANCIAL_STANDARD", field: "amount_owed", answer: "Around $8,000 I think", timestamp: timestamps[idx++] },
      { type: "ai_probe", pack_id: "PACK_FINANCIAL_STANDARD", field: "amount_owed", question_text: "Can you break that down - what accounts are in collections?", timestamp: timestamps[idx++] },
      { type: "ai_probe_answer", pack_id: "PACK_FINANCIAL_STANDARD", field: "amount_owed", answer: "A credit card from when I was married, about $4k. Medical bills from my back surgery, maybe $3k. And a phone bill I forgot to pay when I moved, $800 or so.", timestamp: timestamps[idx++] },
      
      // Multiple police contacts
      { type: "question", section: "Criminal Involvement / Police Contacts", question_id: "Q021", question_text: "Have you ever had contact with police as a suspect?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q021", answer: "Yes", timestamp: timestamps[idx++] },
      { type: "question", section: "Criminal Involvement / Police Contacts", question_id: "Q021_multi", question_text: "How many times?", timestamp: timestamps[idx++] },
      { type: "answer", question_id: "Q021_multi", answer: "A few times over the years", timestamp: timestamps[idx++] },
      { type: "ai_probe", question_id: "Q021_multi", question_text: "Can you give me an approximate number?", timestamp: timestamps[idx++] },
      { type: "ai_probe_answer", question_id: "Q021_multi", answer: "I