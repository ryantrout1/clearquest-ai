import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Process a test data generation job
 * This is the long-running background worker
 */

// ========== AI FOLLOWUP ANSWER GENERATION ==========

/**
 * Generate AI-powered follow-up answers for a set of questions
 * Uses the TEST_CANDIDATE_FOLLOWUP_GENERATOR AI config
 */
async function generateAIFollowupAnswers(base44, payload) {
  try {
    console.log('[TEST_DATA][FOLLOWUPS_AI] Calling LLM for section', payload.sectionInfo?.sectionId, {
      questionCount: payload.questions?.length || 0
    });
    
    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: JSON.stringify(payload),
      response_json_schema: {
        type: "object",
        properties: {
          answers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                questionId: { type: "string" },
                answer: { type: "string" }
              },
              required: ["questionId", "answer"]
            }
          }
        },
        required: ["answers"]
      }
    });
    
    // Result is already parsed JSON when using response_json_schema
    const generatedAnswers = result || { answers: [] };
    
    console.log('[TEST_DATA][FOLLOWUPS_AI] Section', payload.sectionInfo?.sectionId, {
      questionCount: payload.questions?.length || 0,
      answerCount: generatedAnswers.answers?.length ?? 0,
      sample: generatedAnswers.answers?.[0]
    });
    
    return generatedAnswers;
  } catch (err) {
    console.error('[TEST_DATA][FOLLOWUPS_AI] Failed to generate AI answers:', err.message);
    return { answers: [] };
  }
}

/**
 * Build the incident story summary based on pack type and risk level
 */
function buildIncidentStory(packId, riskLevel, baseQuestionText) {
  const packUpper = (packId || '').toUpperCase();
  const riskAdjective = riskLevel === 'low' ? 'minor' : riskLevel === 'moderate' ? 'moderate' : 'significant';
  
  if (packUpper.includes('COLLISION')) {
    if (riskLevel === 'low') {
      return `Minor fender-bender in a parking lot in 2021. No injuries, minor damage, exchanged insurance info. The other driver was partially at fault. Damage was under $1,500.`;
    } else if (riskLevel === 'moderate') {
      return `Rear-ended another vehicle at a stoplight in 2020 while distracted by phone. No injuries but the other car had significant bumper damage (~$3,000). Police arrived, filed a report. Insurance rates went up.`;
    } else {
      return `Hit-and-run incident in 2019. Was involved in a collision, panicked, and left the scene. Returned 30 minutes later when conscience caught up. Filed a police report the same day. Other driver had minor injuries. Charges were reduced after restitution was paid.`;
    }
  }
  
  if (packUpper.includes('DUI') || packUpper.includes('DWI')) {
    if (riskLevel === 'low') {
      return `Was stopped at a checkpoint in 2021 after having one beer with dinner. Passed field sobriety tests, no citation.`;
    } else if (riskLevel === 'moderate') {
      return `Pulled over in 2019 after leaving a bar. BAC was 0.06, under the legal limit. Officer issued a warning and suggested calling a ride.`;
    } else {
      return `Arrested for DUI in 2018 after leaving a work happy hour. BAC was 0.11. Spent night in jail, hired lawyer, pled to reduced charge. Completed alcohol education classes, community service, and 90-day license suspension.`;
    }
  }
  
  if (packUpper.includes('DRUG')) {
    if (riskLevel === 'low') {
      return `Tried marijuana once at a college party in 2018. Didn't enjoy the experience and never used again.`;
    } else if (riskLevel === 'moderate') {
      return `Used marijuana socially about 10-15 times between 2017-2019, mostly at parties. Never purchased, never daily use. Stopped completely when getting serious about career.`;
    } else {
      return `Used marijuana regularly for about 2 years (2015-2017), smoking 2-3 times per week. Also tried cocaine twice at parties. Stopped when it started affecting work. Have been clean for over 5 years.`;
    }
  }
  
  if (packUpper.includes('FINANCIAL') || packUpper.includes('DEBT')) {
    if (riskLevel === 'low') {
      return `Had one medical bill go to collections in 2021 due to insurance dispute. Resolved and paid in full within 60 days.`;
    } else if (riskLevel === 'moderate') {
      return `After job loss in 2020, one credit card and utility bill went to collections. Set up payment plans and paid everything off by 2022. Credit score has recovered.`;
    } else {
      return `Currently have about $12,000 in collections including medical bills, broken apartment lease, and credit card debt from unemployment period. Working with debt management company on payment plans.`;
    }
  }
  
  if (packUpper.includes('EMPLOYMENT') || packUpper.includes('TERMINATED')) {
    if (riskLevel === 'low') {
      return `Left a retail job in 2020 after scheduling disagreement. Gave two weeks notice, parted on reasonable terms.`;
    } else if (riskLevel === 'moderate') {
      return `Was terminated from a job in 2018 for attendance issues during a family health crisis. Learned to communicate better with employers about personal issues.`;
    } else {
      return `Have been terminated twice: once in 2017 for insubordination (argument with supervisor), and once in 2019 for attendance during personal difficulties. Have matured since then, last two jobs have excellent references.`;
    }
  }
  
  if (packUpper.includes('DOMESTIC') || packUpper.includes('VIOLENCE')) {
    if (riskLevel === 'low') {
      return `Had a verbal argument with family member that got loud. Neighbor called police. Officers talked to both parties, determined no issue, left without filing report.`;
    } else if (riskLevel === 'moderate') {
      return `During divorce in 2019, ex-wife called police during argument. Both upset and yelling. Officers separated us, I left for the night. No arrests, charges, or protective orders.`;
    } else {
      return `Toxic relationship with ex-girlfriend. Police called 3 times in 2020 during arguments. Once threw phone at wall out of frustration. Never arrested but completed counseling. Now in healthy relationship.`;
    }
  }
  
  if (packUpper.includes('CRIME') || packUpper.includes('ARREST') || packUpper.includes('POLICE')) {
    if (riskLevel === 'low') {
      return `Was questioned as witness to a car accident in 2020. Gave statement and that was extent of police contact.`;
    } else if (riskLevel === 'moderate') {
      return `Police called to apartment in 2019 due to noise complaint. Roommate and I were arguing about bills. Officers came, we calmed down, they left without action.`;
    } else {
      return `Arrested in 2017 for disorderly conduct after bar fight. Didn't throw first punch but participated. Charges dropped after completing anger management. No physical altercations since.`;
    }
  }
  
  if (packUpper.includes('LE_APP') || packUpper.includes('PRIOR') || packUpper.includes('APPLICATION')) {
    if (riskLevel === 'low') {
      return `Applied to one other agency in 2021 but withdrew when relocated for family reasons. No issues with application, just timing.`;
    } else if (riskLevel === 'moderate') {
      return `Applied to two agencies before this one. First: not selected after oral board. Second: completed process but another candidate was chosen. Got valuable feedback from both.`;
    } else {
      return `Applied to law enforcement three times before. First two times was immature and didn't take process seriously. Third time made it further but DQ'd for financial history. Spent last two years getting life in order.`;
    }
  }
  
  // PACK_WORKPLACE_STANDARD - Workplace integrity & misconduct incidents
  if (packUpper.includes('WORKPLACE')) {
    if (riskLevel === 'low') {
      return `Received verbal warning in June 2022 for being late twice in one week due to car trouble. Manager understood, gave verbal counseling. Fixed car, haven't been late since. Left on good terms.`;
    } else if (riskLevel === 'moderate') {
      return `Received written warning in March 2020 at a warehouse job for using phone on the floor, which violated safety policy. Understood the concern, stopped immediately, and followed all policies after. Left later for a better opportunity with good reference.`;
    } else {
      return `Two workplace issues: First, terminated from insurance company in 2019 after investigation found I falsified time records. Made a serious mistake due to financial problems. Second, resigned in lieu of termination from call center in 2020 after performance warnings. Both taught me hard lessons about integrity and finding the right fit.`;
    }
  }
  
  // Default fallback
  return `${riskAdjective.charAt(0).toUpperCase() + riskAdjective.slice(1)} incident related to ${baseQuestionText || 'the disclosed matter'}. The applicant has addressed the situation and learned from the experience.`;
}

/**
 * Get section info from pack ID
 */
function getSectionInfoFromPack(packId, sectionName) {
  const packUpper = (packId || '').toUpperCase();
  
  if (packUpper.includes('COLLISION')) {
    return { sectionId: 'CAT_DRIVING_COLLISION', sectionName: sectionName || 'Driving History – Collisions' };
  }
  if (packUpper.includes('DUI') || packUpper.includes('DWI')) {
    return { sectionId: 'CAT_DRIVING_DUI', sectionName: sectionName || 'Driving History – DUI/DWI' };
  }
  if (packUpper.includes('DRIVING') || packUpper.includes('VIOLATION')) {
    return { sectionId: 'CAT_DRIVING_VIOLATIONS', sectionName: sectionName || 'Driving History – Violations' };
  }
  if (packUpper.includes('DRUG') || packUpper.includes('MARIJUANA') || packUpper.includes('SUBSTANCE')) {
    return { sectionId: 'CAT_DRUG_USE', sectionName: sectionName || 'Illegal Drug / Narcotic History' };
  }
  if (packUpper.includes('FINANCIAL') || packUpper.includes('DEBT') || packUpper.includes('CREDIT')) {
    return { sectionId: 'CAT_FINANCIAL', sectionName: sectionName || 'Financial History' };
  }
  if (packUpper.includes('EMPLOYMENT') || packUpper.includes('TERMINATED')) {
    return { sectionId: 'CAT_EMPLOYMENT', sectionName: sectionName || 'Employment History' };
  }
  if (packUpper.includes('WORKPLACE')) {
    return { sectionId: 'CAT_EMPLOYMENT', sectionName: sectionName || 'Employment History' };
  }
  if (packUpper.includes('DOMESTIC') || packUpper.includes('VIOLENCE')) {
    return { sectionId: 'CAT_DOMESTIC', sectionName: sectionName || 'Domestic Incidents' };
  }
  if (packUpper.includes('CRIME') || packUpper.includes('ARREST') || packUpper.includes('POLICE')) {
    return { sectionId: 'CAT_CRIME', sectionName: sectionName || 'Criminal Involvement / Police Contacts' };
  }
  if (packUpper.includes('LE_APP') || packUpper.includes('PRIOR') || packUpper.includes('APPLICATION')) {
    return { sectionId: 'CAT_PRIOR_LE', sectionName: sectionName || 'Applications with other Law Enforcement Agencies' };
  }
  
  return { sectionId: 'CAT_GENERAL', sectionName: sectionName || 'General Disclosures' };
}

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

// ========== WORKPLACE QUESTION POOL ==========
// Questions mapped to PACK_WORKPLACE_STANDARD for workplace misconduct/integrity testing
const WORKPLACE_QUESTIONS = ["Q127", "Q128", "Q129", "Q130", "Q163", "Q203"];

const QUESTION_POOLS = {
  low: { pool: ["Q008", "Q009", "Q091", "Q001"], minYes: 1, maxYes: 3 },
  // Moderate: includes at least 1 workplace question (Q128 - disciplined/reprimanded)
  moderate: { pool: ["Q008", "Q009", "Q096", "Q091", "Q092", "Q125", "Q022", "Q301", "Q126", "Q159", "Q128"], minYes: 5, maxYes: 7, guaranteedQuestions: ["Q128"] },
  // High: includes 2+ workplace questions (Q127 - misconduct, Q129 - terminated, Q163 - policy violations)
  high: { pool: ["Q007", "Q008", "Q009", "Q096", "Q097", "Q098", "Q022", "Q301", "Q024", "Q025", "Q091", "Q092", "Q093", "Q094", "Q125", "Q126", "Q127", "Q129", "Q163", "Q159", "Q160", "Q161"], minYes: 10, maxYes: 15, guaranteedQuestions: ["Q127", "Q129"] }
};

const FOLLOWUP_TEMPLATES = {
  low: {
    "PACK_DRIVING_VIOLATIONS_STANDARD": { incident_date: "March 2021", incident_location: "Highway, local area", incident_description: "Minor speeding ticket, less than 10 mph over limit", legal_outcome: "Paid fine, no points", circumstances: "Was running late, wasn't paying attention to speed", accountability_response: "My fault. I've been more careful since." },
    "PACK_PRIOR_LE_APPS_STANDARD": { incident_date: "2022", incident_location: "Local area", incident_description: "Applied to nearby agency, withdrew application", legal_outcome: "Withdrew voluntarily", circumstances: "Family circumstances changed, timing wasn't right", accountability_response: "Made the right choice for my family. Ready now." },
    "PACK_FINANCIAL_STANDARD": { incident_date: "2022", incident_description: "Minor bill went to collections", legal_outcome: "Fully paid off", circumstances: "Unexpected expense, set up payment plan and completed it", accountability_response: "Should have addressed it sooner but paid in full." },
    // PACK_WORKPLACE_STANDARD - low risk (minor verbal warning)
    "PACK_WORKPLACE_STANDARD": { incident_date: "June 2022", incident_location: "Main Office", employer: "Local Retail Store", position_at_time: "Sales Associate", misconduct_type: "Attendance Issue", incident_description: "Was late twice in one week due to car trouble", corrective_action: "Verbal warning from manager", accountability_response: "Understood their concern. Got car fixed and haven't been late since." }
  },
  moderate: {
    "PACK_DRIVING_VIOLATIONS_STANDARD": { incident_date: "Around October 2020", incident_location: "Local area", incident_description: "Red light or speeding violation", legal_outcome: "Paid the fine", circumstances: "Was distracted, not sure exactly what happened", accountability_response: "My fault for not paying attention." },
    "PACK_DRUG_USE_STANDARD": { incident_date: "First used around 2012-2015", frequency: "Maybe 10-15 times total", last_occurrence: "2018 or early 2019", incident_description: "Marijuana experimentation at parties", circumstances: "Social use only at parties. Never bought my own.", accountability_response: "It was a phase. Haven't used in years." },
    "PACK_FINANCIAL_STANDARD": { incident_date: "2020", incident_description: "Credit account went 90+ days late", legal_outcome: "Caught up and current now", circumstances: "Hours got cut during economic downturn. Paid off once stable.", accountability_response: "Should have communicated with creditor sooner." },
    "PACK_EMPLOYMENT_STANDARD": { incident_date: "2018", incident_description: "Terminated for attendance", legal_outcome: "Clean separation", circumstances: "Calling out too much during rough personal time. Got write-ups then terminated.", accountability_response: "My fault. Should have communicated better." },
    "PACK_GENERAL_CRIME_STANDARD": { incident_date: "Summer 2019", incident_description: "Noise complaint, roommate argument", legal_outcome: "No arrests, no charges. Officers talked to us and left.", circumstances: "Arguing about bills and chores. Got loud but never physical.", accountability_response: "We both got too heated. I've learned to walk away." },
    // PACK_WORKPLACE_STANDARD - moderate risk (written warning, policy violation)
    "PACK_WORKPLACE_STANDARD": { incident_date: "March 2020", incident_location: "Warehouse, Distribution Center", employer: "Regional Logistics Company", position_at_time: "Warehouse Associate", misconduct_type: "Policy Violation", incident_description: "Received written warning for using personal phone during shift, which violated safety policy on the warehouse floor", corrective_action: "Written Warning", separation_type: "Still employed at time, left later for better opportunity", accountability_response: "I understood their concern for safety. Stopped using phone on floor immediately and followed all policies after that." }
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
    "PACK_GENERAL_DISCLOSURE_STANDARD": { incident_date: "Over the years", incident_description: "Problematic social media posts", circumstances: "Angry posts when going through stuff. Arguments online. Some inappropriate comments.", accountability_response: "Deleted most of it. Need to be more careful." },
    // PACK_WORKPLACE_STANDARD - high risk (termination, multiple incidents)
    "PACK_WORKPLACE_STANDARD": [
      { instance_number: 1, incident_date: "January 2019", incident_location: "Corporate Office, Downtown", employer: "Insurance Company", position_at_time: "Claims Processor", misconduct_type: "Dishonesty", incident_description: "Terminated after investigation found I had falsified time records by clocking in early when arriving late", corrective_action: "Termination", separation_type: "Terminated", accountability_response: "I made a serious mistake. I was having financial problems and thought no one would notice. I was wrong and it cost me my job. I've learned that integrity matters more than anything." },
      { instance_number: 2, incident_date: "August 2020", incident_location: "Call Center", employer: "Telecom Company", position_at_time: "Customer Service Rep", misconduct_type: "Performance Issue", incident_description: "Resigned in lieu of termination after multiple performance warnings for call handle time and customer complaints", corrective_action: "Resignation in Lieu of Termination", separation_type: "Resigned in Lieu of Termination", accountability_response: "That job wasn't a good fit. I was struggling with the metrics and got frustrated. Should have found a better position sooner instead of letting it get to that point." }
    ]
  }
};

const AI_PROBING_TEMPLATES = {
  "Q096": [{ probing_question: "You mentioned drug use. Can you be more specific about when you first tried it?", candidate_response: "It was in high school, probably around 16 or 17." }, { probing_question: "And how many times total would you estimate you used?", candidate_response: "Maybe 10-15 times total. It was just at parties." }],
  "Q097": [{ probing_question: "You mentioned other controlled substances. Can you be specific about what and when?", candidate_response: "It was years ago. Tried something a few times when I was young." }, { probing_question: "How many times exactly?", candidate_response: "Maybe 3 or 4 times. I was hanging with a bad crowd." }],
  "Q022": [{ probing_question: "Can you provide an approximate date for this police contact?", candidate_response: "I think... maybe 2017 or 2018. Around there." }, { probing_question: "What were the circumstances?", candidate_response: "Got into a situation, cops were called. Nothing serious came of it." }],
  "Q007": [{ probing_question: "Regarding the DUI, can you provide more details about the year?", candidate_response: "It was 2019. February I think." }],
  "Q159": [{ probing_question: "Can you describe what might cause embarrassment?", candidate_response: "Some old social media posts. Arguments online. Maybe some inappropriate comments." }]
};

// Follow-up answer templates by pack type and risk level
const FOLLOWUP_ANSWER_TEMPLATES = {
  // DUI/DWI answers
  DRIVING_DUI: {
    low: [
      "I received a warning for a minor traffic violation in 2021. The officer let me go with a verbal warning after checking my license and registration. No citation was issued."
    ],
    moderate: [
      "I was pulled over in late 2019 after leaving a friend's birthday party. I had two drinks over several hours. The officer conducted field sobriety tests. I passed and was released without charges, but it was a wake-up call.",
      "In 2018, I was stopped at a checkpoint. I had one beer with dinner. They tested me and I blew under the limit. No arrest or citation, but I learned to be more careful."
    ],
    high: [
      "Yes, I was arrested for DUI in late 2016 after leaving a bar downtown. My BAC was just over the legal limit at 0.09. I pled guilty, paid approximately $3,500 in fines, completed the required alcohol education classes, and my license was suspended for 90 days. I haven't driven after drinking since then.",
      "I got a DWI in early 2019. I had been at a work happy hour and thought I was okay to drive. I was wrong. I hit a parked car trying to parallel park. No one was hurt. I took full responsibility, completed all court requirements, and installed an interlock device for a year.",
      "In 2017, I was arrested for DUI after running a red light. I had been drinking at a friend's house. My BAC was 0.11. I spent the night in jail, hired a lawyer, and pled to a reduced charge. I completed 40 hours of community service and two years of probation. It was the lowest point of my life."
    ]
  },
  // Traffic violations
  DRIVING_VIOLATIONS: {
    low: [
      "I received one speeding ticket in 2020 for going 8 mph over the limit on the freeway. I paid it on time and haven't had any other issues since.",
      "I got a fix-it ticket in 2021 for an expired registration sticker. I renewed it immediately and got the ticket dismissed. That's my only citation."
    ],
    moderate: [
      "I've had two speeding tickets over the past five years. One in 2019 for 15 over on the highway, and another in 2021 for 12 over in a school zone (though school was not in session). Both were paid.",
      "In 2018, I was cited for running a yellow light that turned red. I thought I could make it. I took traffic school to keep it off my record."
    ],
    high: [
      "I've had multiple traffic citations over the years. Two speeding tickets, one for failure to yield, and one for improper lane change. The most recent was about 18 months ago. I've been more careful since.",
      "I had several tickets between 2016 and 2020. Speeding mostly, but also one for driving with a suspended license (I didn't realize it was suspended). All fines are paid and my license is current now."
    ]
  },
  // Drug use
  DRUG_USE: {
    low: [
      "I tried marijuana once at a college party around 2018. I took a couple of puffs, didn't like how it made me feel, and never tried it again. That's the extent of my drug use."
    ],
    moderate: [
      "I experimented with marijuana between 2017 and 2019, mostly at parties with friends. I'd estimate I used it maybe 10-12 times total. I never purchased it myself. I stopped completely about three years ago when I started taking my career more seriously.",
      "I used marijuana occasionally during my early twenties. It was a social thing at parties or concerts. Never daily use. I stopped in 2019 and have no interest in using it again."
    ],
    high: [
      "I used marijuana regularly for about two years, from 2015 to 2017. At its peak, I was smoking 2-3 times a week. I also tried cocaine twice at parties during that period. I stopped everything when I realized it was affecting my work and relationships. I've been completely clean for over five years.",
      "I went through a rough period after my divorce. I used marijuana daily for about six months in 2018. I also misused some prescription anxiety medication that wasn't prescribed to me. I got help through an outpatient program and have been clean since early 2019.",
      "I experimented with several substances in my late teens and early twenties. Marijuana, ecstasy at raves, and mushrooms a couple of times. This was all before age 25. I grew up, got a real job, and left that life behind."
    ]
  },
  // Financial issues
  FINANCIAL: {
    low: [
      "I had one medical bill go to collections in 2021 due to an insurance dispute. Once it was resolved, I paid the balance in full. My credit is now in good standing."
    ],
    moderate: [
      "I went through a difficult period after losing my job in 2020. A credit card and a utility bill went to collections. I've since paid off both and am current on all my obligations. My credit score has improved significantly.",
      "I had some credit card debt that got out of hand a few years ago. At one point I was about $8,000 in debt with one card 90 days past due. I worked with a credit counselor, set up payment plans, and paid everything off by 2022."
    ],
    high: [
      "I have about $12,000 in collections currently. It's a mix of medical bills, an old apartment lease I broke, and credit card debt from when I was unemployed. I'm working with a debt management company and making monthly payments. It's a work in progress.",
      "I filed for Chapter 7 bankruptcy in 2019. I had over $35,000 in credit card debt and couldn't keep up. The bankruptcy was discharged in 2020. Since then, I've been rebuilding my credit and living within my means. I have one secured credit card that I pay off monthly."
    ]
  },
  // Employment issues
  EMPLOYMENT: {
    low: [
      "I left one job in 2020 after a disagreement about scheduling. I gave two weeks' notice and left on reasonable terms. I would not say I was fired, but we agreed it wasn't the right fit."
    ],
    moderate: [
      "I was terminated from a retail job in 2018 for attendance issues. I was going through a difficult time with family health problems and missed too many shifts. I learned to communicate better with employers about personal issues.",
      "I was let go from a position in 2019 during a company restructure. They called it a layoff, but my position was eliminated due to performance concerns. I've been successful in my jobs since then."
    ],
    high: [
      "I've been terminated twice. First in 2017 for insubordination—I had an argument with a supervisor and said some things I regret. Second in 2019 for attendance after going through a rough patch personally. I've matured a lot since then and my last two jobs have excellent references.",
      "I was fired in 2018 for what they called policy violations. I was taking too many breaks and leaving early without approval. I was young and had a bad attitude. I've grown up since then and take my responsibilities seriously."
    ]
  },
  // Criminal/police contact
  CRIME: {
    low: [
      "I was questioned as a witness to a minor car accident in 2020. I gave a statement and that was the extent of my involvement with law enforcement."
    ],
    moderate: [
      "Police were called to my apartment in 2019 due to a noise complaint. My roommate and I were having a loud argument about bills. Officers came, we calmed down, and they left without any further action.",
      "I was a victim of a theft in 2018 and filed a police report. I also was questioned once as a possible witness to an altercation at a bar, but I hadn't seen anything useful."
    ],
    high: [
      "I was arrested in 2017 for disorderly conduct after a fight outside a bar. I didn't throw the first punch, but I participated. Charges were dropped after I completed anger management. Haven't been in any physical altercations since.",
      "Police have responded to my residence several times over the years. Once for a domestic argument with my ex-girlfriend, once for a neighbor dispute, and once when my car was vandalized. No arrests from any of these, but I understand it looks concerning."
    ]
  },
  // Domestic issues
  DOMESTIC: {
    low: [
      "I had a verbal disagreement with a family member that got loud enough for a neighbor to call police. Officers came, talked to both of us, and determined there was no issue. No arrests or reports filed."
    ],
    moderate: [
      "During my divorce in 2019, my ex-wife called police during an argument. We were both upset and yelling. Officers separated us and I left for the night. No arrests, no charges, no protective orders.",
      "I was involved in a heated argument with my brother at a family gathering. Someone called 911 because we were shouting. Police came, we had both calmed down, and they left after talking to us."
    ],
    high: [
      "My ex-girlfriend and I had a toxic relationship. Police were called three times in 2020 during arguments. On one occasion, I threw a phone against the wall out of frustration. I was not arrested, but I know it doesn't look good. I've since completed counseling and am in a healthy relationship.",
      "In 2018, I was arrested on a domestic violence charge after an argument with my ex. She had some bruises but they were from her grabbing me. Charges were eventually dropped when she didn't want to pursue it. We've both moved on."
    ]
  },
  // Prior LE applications
  PRIOR_LE: {
    low: [
      "I applied to one other agency in 2021 but withdrew my application when I relocated for family reasons. There were no issues with my application; the timing just wasn't right."
    ],
    moderate: [
      "I applied to two other agencies before this one. I was not selected by the first after the oral board stage. The second, I completed the process but ultimately they chose another candidate. Both gave me feedback that helped me improve.",
      "I was in the process with another department but was eliminated after the background phase. The investigator said there were concerns about my employment history, which I've since stabilized."
    ],
    high: [
      "I've applied to law enforcement three times before. First two times I was too immature and didn't take the process seriously. Third time I made it further but was DQ'd for my financial history. I've spent the last two years getting my life in order.",
      "I was disqualified from a previous agency in 2019 due to drug use history. At that time, I wasn't as far removed from my past. Now I have over five years clean and feel confident about this application."
    ]
  },
  // Workplace misconduct/integrity (PACK_WORKPLACE_STANDARD)
  WORKPLACE: {
    low: [
      "I received a verbal warning in 2022 for being late twice in one week. My car had broken down. Manager understood but still documented it. I got it fixed right away and haven't been late since.",
      "I had a minor issue where I accidentally used a company printer for personal documents. Supervisor gave me a verbal reminder about policy. It was an honest mistake and didn't happen again."
    ],
    moderate: [
      "I received a written warning in March 2020 at a warehouse job for using my phone on the floor, which was against safety policy. I understood their concern—it was a safety issue. I stopped immediately and followed all policies after that. Left later for a better opportunity with a good reference.",
      "I was reprimanded in 2019 for a conflict with a coworker. We had a disagreement that got heated. HR mediated it, I apologized, and we worked professionally together after that. I learned to handle workplace conflicts better.",
      "I received disciplinary action for unauthorized overtime in 2020. I was trying to finish a project and didn't get approval. Got a written warning and had to review the overtime policy. Understood the importance of following procedures."
    ],
    high: [
      "I was terminated from an insurance company in January 2019 after an investigation found I had falsified time records. I was having financial problems and thought no one would notice. I was wrong and it cost me my job. It was a serious mistake that I deeply regret. I've learned that integrity matters more than anything.",
      "I've had two workplace issues. First, I was terminated in 2019 for dishonesty related to time records. Second, I resigned in lieu of termination from a call center in 2020 after multiple performance warnings. Both experiences taught me hard lessons about integrity and finding work that's a good fit for my skills.",
      "I was fired in 2018 for what they called misconduct. I had taken supplies from the office—pens, paper, small things—thinking it wasn't a big deal. They considered it theft. Looking back, I understand why. I've never done anything like that since and I'm committed to complete honesty in everything I do."
    ]
  },
  // General fallback
  GENERAL: {
    low: [
      "I don't have much to add beyond what I indicated. It was a minor situation that was resolved appropriately."
    ],
    moderate: [
      "This was a situation I learned from. At the time, I didn't handle it as well as I should have, but I've grown from the experience and it hasn't repeated.",
      "Looking back, I would have made different choices. But I was younger and less mature. I'm a different person now."
    ],
    high: [
      "I know my history has some concerning elements. I'm not going to make excuses. I made mistakes, faced consequences, and have worked hard to become a better person. I'm ready to prove myself.",
      "I've had more life experience than most applicants, including some negative experiences. Those experiences have taught me accountability and the importance of making good decisions."
    ]
  }
};

// Generate answer for a specific deterministic follow-up question
function generateFollowUpAnswerForQuestion(followUpQuestion, packId, riskLevel, packData, questionIndex) {
  const questionText = (followUpQuestion.question_text || '').toLowerCase();
  const questionId = followUpQuestion.followup_question_id || '';
  const packUpper = (packId || '').toUpperCase();
  
  // ========== PACK_WORKPLACE_STANDARD SPECIFIC HANDLING ==========
  if (packUpper.includes('WORKPLACE')) {
    // Employer name
    if (questionText.includes('employer') || questionText.includes('company') || questionText.includes('organization') || questionText.includes('working at')) {
      const employers = ['Regional Logistics Company', 'Insurance Company', 'Telecom Company', 'Local Retail Store', 'Restaurant Group', 'Warehouse Distribution Center', 'Call Center Services', 'Office Supply Store'];
      return employers[Math.floor(Math.random() * employers.length)];
    }
    
    // Position/role
    if (questionText.includes('position') || questionText.includes('role') || questionText.includes('job title') || questionText.includes('your role')) {
      const positions = ['Sales Associate', 'Warehouse Associate', 'Customer Service Rep', 'Claims Processor', 'Shift Supervisor', 'Administrative Assistant', 'Cashier', 'Stock Clerk'];
      return positions[Math.floor(Math.random() * positions.length)];
    }
    
    // Type of misconduct/issue
    if (questionText.includes('type of') && (questionText.includes('misconduct') || questionText.includes('issue') || questionText.includes('workplace'))) {
      if (riskLevel === 'low') return 'Attendance Issue';
      if (riskLevel === 'moderate') return 'Policy Violation';
      return 'Dishonesty';
    }
    
    // Corrective/disciplinary action
    if (questionText.includes('corrective') || questionText.includes('disciplinary') || questionText.includes('action taken') || questionText.includes('employer take')) {
      if (riskLevel === 'low') return 'Verbal Warning';
      if (riskLevel === 'moderate') return 'Written Warning';
      return 'Termination';
    }
    
    // Describe incident
    if (questionText.includes('describe') && (questionText.includes('incident') || questionText.includes('what happened') || questionText.includes('detail'))) {
      if (riskLevel === 'low') return 'Minor attendance issue - was late twice in one week due to car trouble. Manager gave verbal counseling.';
      if (riskLevel === 'moderate') return 'Received written warning for policy violation - used phone on warehouse floor which was against safety rules. Understood their concern and stopped immediately.';
      return 'Terminated after investigation found time record discrepancies. I was having financial problems and made a serious mistake. I take full responsibility.';
    }
    
    // Separation type
    if (questionText.includes('separation') || questionText.includes('how did') && questionText.includes('end') || questionText.includes('left')) {
      if (riskLevel === 'low') return 'Left on good terms';
      if (riskLevel === 'moderate') return 'Resigned for better opportunity';
      return 'Terminated';
    }
    
    // Isolated or recurring
    if (questionText.includes('isolated') || questionText.includes('recurring') || questionText.includes('one-time') || questionText.includes('part of')) {
      if (riskLevel === 'low') return 'Isolated Incident';
      if (riskLevel === 'moderate') return 'Isolated Incident';
      return 'Part of Multiple Issues';
    }
    
    // Policies involved
    if (questionText.includes('policy') || questionText.includes('policies') || questionText.includes('rule')) {
      return 'Company attendance policy / time and attendance procedures';
    }
    
    // Location/worksite
    if (questionText.includes('location') || questionText.includes('worksite') || questionText.includes('where')) {
      const locations = ['Main Office', 'Warehouse', 'Distribution Center', 'Retail Store', 'Call Center Floor', 'Corporate Office'];
      return locations[Math.floor(Math.random() * locations.length)];
    }
    
    // Date/when
    if (questionText.includes('when') || questionText.includes('date') || questionText.includes('month') || questionText.includes('year')) {
      const years = ['2019', '2020', '2021', '2022'];
      const months = ['January', 'March', 'June', 'August', 'November'];
      return `${months[Math.floor(Math.random() * months.length)]} ${years[Math.floor(Math.random() * years.length)]}`;
    }
    
    // Others involved
    if (questionText.includes('others') || questionText.includes('involved') || questionText.includes('aware')) {
      if (riskLevel === 'low') return 'Just my direct supervisor was aware.';
      if (riskLevel === 'moderate') return 'My supervisor and HR were involved in documenting the warning.';
      return 'HR conducted an investigation. My supervisor, HR manager, and department head were involved.';
    }
    
    // Accountability/responsibility/learned
    if (questionText.includes('accountability') || questionText.includes('responsibility') || questionText.includes('learned') || questionText.includes('lesson')) {
      if (riskLevel === 'low') return 'I took responsibility and made sure it didnt happen again. Fixed my car and improved my attendance.';
      if (riskLevel === 'moderate') return 'I understood their concerns, accepted the warning, and changed my behavior immediately. Left later with a good reference.';
      return 'I made a serious mistake. I take full responsibility and have learned that integrity is non-negotiable. It cost me my job but taught me an important lesson.';
    }
    
    // Anything else / additional
    if (questionText.includes('anything else') || questionText.includes('additional')) {
      return 'No, I believe I have provided all relevant information about this workplace incident.';
    }
    
    // Default workplace answer by risk
    if (riskLevel === 'low') return 'It was a minor issue that was addressed and resolved appropriately.';
    if (riskLevel === 'moderate') return 'I learned from the experience and made sure it didnt happen again.';
    return 'I take full responsibility for my actions and have grown significantly since then.';
  }
  
  // ========== OTHER PACKS (original logic) ==========
  // Check question keywords to generate appropriate answers
  if (questionText.includes('agency') || questionText.includes('department') || questionText.includes('which law enforcement')) {
    const agencies = ['Metro Police Department', 'County Sheriff\'s Office', 'State Highway Patrol', 'City Police Department'];
    return agencies[Math.floor(Math.random() * agencies.length)];
  }
  
  if (questionText.includes('position') || questionText.includes('what position')) {
    return 'Police Officer';
  }
  
  if (questionText.includes('month') || questionText.includes('year') || questionText.includes('date') || questionText.includes('when')) {
    const years = ['2019', '2020', '2021', '2022'];
    const months = ['January', 'March', 'June', 'September', 'November'];
    return `${months[Math.floor(Math.random() * months.length)]} ${years[Math.floor(Math.random() * years.length)]}`;
  }
  
  if (questionText.includes('outcome') || questionText.includes('status') || questionText.includes('result')) {
    const outcomes = ['Not selected', 'Withdrew application', 'Still in process', 'Did not pass background'];
    return outcomes[Math.floor(Math.random() * outcomes.length)];
  }
  
  if (questionText.includes('why') || questionText.includes('reason') || questionText.includes('tell you')) {
    const reasons = [
      'They said there were more qualified candidates',
      'I was told my background check revealed some concerns',
      'No specific reason was given',
      'The process took too long and I accepted another position'
    ];
    return reasons[Math.floor(Math.random() * reasons.length)];
  }
  
  if (questionText.includes('issues') || questionText.includes('concerns') || questionText.includes('problems')) {
    if (riskLevel === 'low') {
      return 'No issues were raised during the process.';
    }
    return 'There were some questions about my employment history that I addressed.';
  }
  
  if (questionText.includes('disclosed') || questionText.includes('told')) {
    return 'Yes, I have disclosed this on all subsequent applications.';
  }
  
  if (questionText.includes('learned') || questionText.includes('lesson')) {
    return 'I learned the importance of thorough preparation and being completely honest throughout the process.';
  }
  
  if (questionText.includes('steps') || questionText.includes('improve') || questionText.includes('strengthen')) {
    return 'I have taken additional courses, improved my physical fitness, and addressed the concerns raised in my previous applications.';
  }
  
  if (questionText.includes('integrity') || questionText.includes('honesty') || questionText.includes('background concerns')) {
    if (riskLevel === 'low') {
      return 'No integrity or honesty concerns were raised.';
    }
    return 'Some questions were raised about my background that I have since addressed.';
  }
  
  if (questionText.includes('anything else') || questionText.includes('additional')) {
    return 'No, I believe I have provided all relevant information about this application.';
  }
  
  // Default response based on risk level
  if (riskLevel === 'low') {
    return 'No significant issues to report.';
  } else if (riskLevel === 'moderate') {
    return 'There were some minor concerns that have since been resolved.';
  } else {
    return 'I have addressed all previous concerns and am committed to transparency in this process.';
  }
}

// Generate a follow-up question text based on pack type
function getFollowupQuestionText(packId) {
  const packUpper = (packId || '').toUpperCase();
  
  if (packUpper.includes('DUI') || packUpper.includes('DWI')) {
    return "Please describe the circumstances of this incident, including when it occurred and what happened.";
  } else if (packUpper.includes('DRIVING') || packUpper.includes('TRAFFIC') || packUpper.includes('COLLISION')) {
    return "Please provide details about this driving incident, including when it occurred and the outcome.";
  } else if (packUpper.includes('DRUG') || packUpper.includes('MARIJUANA')) {
    return "Please describe your experience with this substance, including when you used it, how often, and when you last used it.";
  } else if (packUpper.includes('FINANCIAL') || packUpper.includes('DEBT') || packUpper.includes('CREDIT')) {
    return "Please explain the circumstances of this financial issue and its current status.";
  } else if (packUpper.includes('EMPLOYMENT') || packUpper.includes('TERMINATED') || packUpper.includes('FIRED')) {
    return "Please describe the circumstances of this employment issue, including what happened and how it was resolved.";
  } else if (packUpper.includes('CRIME') || packUpper.includes('ARREST') || packUpper.includes('POLICE') || packUpper.includes('CHARGE')) {
    return "Please provide details about this incident, including what happened and the outcome.";
  } else if (packUpper.includes('DOMESTIC') || packUpper.includes('FAMILY')) {
    return "Please describe the circumstances of this incident and how it was resolved.";
  } else if (packUpper.includes('LE_APP') || packUpper.includes('PRIOR') || packUpper.includes('APPLICATION')) {
    return "Please provide details about this application, including the agency and outcome.";
  } else if (packUpper.includes('SOCIAL') || packUpper.includes('MEDIA') || packUpper.includes('DISCLOSURE')) {
    return "Please describe what information might be found and the circumstances.";
  } else {
    return "Please provide additional details about this matter.";
  }
}

// Generate realistic follow-up answer based on pack type and risk level
function generateFollowUpAnswer(packId, riskLevel, followupData) {
  // Map risk levels to template keys
  const riskKey = riskLevel === 'low' ? 'low' : riskLevel === 'moderate' ? 'moderate' : 'high';
  
  // Determine pack category based on packId
  let category = 'GENERAL';
  const packUpper = (packId || '').toUpperCase();
  
  if (packUpper.includes('DUI') || packUpper.includes('DWI')) {
    category = 'DRIVING_DUI';
  } else if (packUpper.includes('DRIVING') || packUpper.includes('TRAFFIC') || packUpper.includes('VIOLATION')) {
    category = 'DRIVING_VIOLATIONS';
  } else if (packUpper.includes('DRUG') || packUpper.includes('SUBSTANCE') || packUpper.includes('MARIJUANA') || packUpper.includes('PRESCRIPTION')) {
    category = 'DRUG_USE';
  } else if (packUpper.includes('FINANCIAL') || packUpper.includes('DEBT') || packUpper.includes('CREDIT') || packUpper.includes('BANKRUPTCY')) {
    category = 'FINANCIAL';
  } else if (packUpper.includes('EMPLOYMENT') || packUpper.includes('TERMINATED') || packUpper.includes('FIRED') || packUpper.includes('JOB')) {
    category = 'EMPLOYMENT';
  } else if (packUpper.includes('WORKPLACE')) {
    category = 'WORKPLACE';
  } else if (packUpper.includes('CRIME') || packUpper.includes('ARREST') || packUpper.includes('POLICE') || packUpper.includes('CHARGE')) {
    category = 'CRIME';
  } else if (packUpper.includes('DOMESTIC') || packUpper.includes('FAMILY') || packUpper.includes('RELATIONSHIP')) {
    category = 'DOMESTIC';
  } else if (packUpper.includes('LE_APP') || packUpper.includes('PRIOR') || packUpper.includes('APPLICATION')) {
    category = 'PRIOR_LE';
  }
  
  // Get templates for this category and risk level
  const categoryTemplates = FOLLOWUP_ANSWER_TEMPLATES[category] || FOLLOWUP_ANSWER_TEMPLATES.GENERAL;
  const templates = categoryTemplates[riskKey] || categoryTemplates.moderate || categoryTemplates.high;
  
  // Pick a random template
  const template = templates[Math.floor(Math.random() * templates.length)];
  
  // Optionally customize with follow-up data if available
  let answer = template;
  if (followupData) {
    // Replace placeholders with actual data if present
    if (followupData.incident_date && answer.includes('20')) {
      // Could enhance to replace dates, but template already has realistic dates
    }
  }
  
  return answer;
}

function generateSessionHash() {
  const chars = 'abcdef0123456789';
  return Array.from({length: 64}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function generateFileNumber(riskLevel, index, randomize) {
  const prefix = riskLevel === 'low' ? 'LOW' : riskLevel === 'moderate' ? 'MID' : 'HIGH';
  const suffix = randomize ? Math.random().toString(36).substring(2, 6).toUpperCase() : String(index + 1).padStart(3, '0');
  return `TEST-${prefix}-${suffix}`;
}

function selectRandomYesQuestions(pool, min, max, guaranteedQuestions = []) {
  const count = Math.floor(Math.random() * (max - min + 1)) + min;
  
  // Start with guaranteed questions
  const selected = new Set(guaranteedQuestions);
  
  // Filter out guaranteed questions from pool to avoid duplicates
  const remainingPool = pool.filter(q => !guaranteedQuestions.includes(q));
  const shuffled = [...remainingPool].sort(() => Math.random() - 0.5);
  
  // Add random questions until we reach the count
  for (const q of shuffled) {
    if (selected.size >= count) break;
    selected.add(q);
  }
  
  // Log workplace question selection
  const workplaceSelected = [...selected].filter(q => WORKPLACE_QUESTIONS.includes(q));
  if (workplaceSelected.length > 0) {
    console.log('[TEST_DATA][WORKPLACE] Selected workplace questions for "Yes" answers:', workplaceSelected);
  }
  
  return selected;
}

function getFollowupData(packId, riskLevel, templates) {
  const levelTemplates = templates[riskLevel] || templates.moderate;
  return levelTemplates[packId] || null;
}

async function createMockSession(base44, config, candidateConfig, allQuestions, sections, allFollowUpQuestions) {
  const { deptCode, includeAiProbing, enableMultiLoopBackgrounds, useAiFollowups } = config;
  const { fileNumber, name, riskLevel, yesQuestionIds } = candidateConfig;
  const sessionCode = `${deptCode}_${fileNumber}`;
  const yesSet = new Set(yesQuestionIds);
  
  // FULL INTERVIEW COVERAGE: Use ALL active questions, not just the subset
  // yesSet only determines which questions get "Yes" answers
  console.log(`[TEST_DATA][FULL_INTERVIEW] Processing ${fileNumber} (${name}), risk: ${riskLevel}`);
  console.log(`[TEST_DATA][FULL_INTERVIEW] Total questions: ${allQuestions.length}, Yes answers: ${yesSet.size}, useAiFollowups: ${useAiFollowups}`);
  
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
  // Also map by database ID for questions that use section DB ID
  for (const s of sections) sectionMap[s.id] = s.section_name;
  
  const transcript = [];
  let yesCount = 0, noCount = 0, redFlagsCount = 0, followupsCreated = 0;
  
  // FULL INTERVIEW: Iterate through ALL questions (not filtered by yesSet)
  for (const q of allQuestions) {
    const sectionName = sectionMap[q.section_id] || q.category || 'Unknown';
    const isYes = yesSet.has(q.question_id);
    if (isYes) yesCount++; else noCount++;
    
    currentTime += 5000 + Math.floor(Math.random() * 5000);
    transcript.push({ type: "question", section: sectionName, question_id: q.question_id, question_text: q.question_text, timestamp: new Date(currentTime).toISOString() });
    currentTime += 3000 + Math.floor(Math.random() * 4000);
    transcript.push({ type: "answer", question_id: q.question_id, answer: isYes ? "Yes" : "No", triggered_followup: isYes && !!q.followup_pack, timestamp: new Date(currentTime).toISOString() });
    
    // Add deterministic follow-up Q&A to transcript for Yes answers with follow-up packs
    // This will be populated with actual FollowUpQuestion entities after the loop
    
    if (includeAiProbing && isYes && riskLevel !== 'low') {
      const probes = AI_PROBING_TEMPLATES[q.question_id];
      if (probes) {
        for (const probe of probes) {
          currentTime += 3000 + Math.floor(Math.random() * 3000);
          transcript.push({ type: "ai_probe", kind: "ai_probe_question", question_id: q.question_id, baseQuestionId: q.question_id, question_text: probe.probing_question, text: probe.probing_question, timestamp: new Date(currentTime).toISOString() });
          currentTime += 4000 + Math.floor(Math.random() * 4000);
          transcript.push({ type: "ai_probe_answer", kind: "ai_probe_answer", question_id: q.question_id, baseQuestionId: q.question_id, answer: probe.candidate_response, text: probe.candidate_response, timestamp: new Date(currentTime).toISOString() });
        }
      }
    }
    
    const isFlagged = isYes && (q.followup_pack?.includes('CRIME') || q.followup_pack?.includes('DRUG') || q.followup_pack?.includes('DUI') || q.followup_pack?.includes('DOMESTIC'));
    if (isFlagged) redFlagsCount++;
  }
  
  const endTime = new Date(currentTime + 60000);
  
  // Use pre-fetched FollowUpQuestions (passed from runSeeder to avoid duplicate fetches)
  const allFollowUpQuestionsForTranscript = allFollowUpQuestions || [];
  console.log('[PROCESS] Using', allFollowUpQuestionsForTranscript.length, 'FollowUpQuestions for transcript');
  
  // Insert deterministic follow-up Q&A entries into transcript after their base answers
  // NOTE: We need responsesByQuestionId to be populated first, but it's populated AFTER session creation.
  // So we'll do a TWO-PASS approach: first create transcript with placeholders, then update after Response creation.
  // For now, we'll store the transcript entries with question_id and update the session after Response creation.
  const finalTranscript = [];
  let transcriptFollowupCount = 0;
  
  // Store mapping of question_id to transcript indices that need response_id
  const transcriptIndicesToUpdate = {}; // question_id -> [indices]
  
  for (let i = 0; i < transcript.length; i++) {
    const entry = transcript[i];
    finalTranscript.push(entry);
    
    // After a Yes answer with follow-up pack, insert the deterministic follow-up Q&A
    if (entry.type === 'answer' && entry.answer === 'Yes' && entry.triggered_followup) {
      const questionId = entry.question_id;
      const baseQ = questions.find(q => q.question_id === questionId);
      const packId = baseQ?.followup_pack;
      
      if (packId) {
        const packQuestions = allFollowUpQuestionsForTranscript
          .filter(fuq => fuq.followup_pack_id === packId)
          .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
        
        const sectionName = sectionMap[baseQ.section_id] || baseQ.category || 'Unknown';
        const packData = getFollowupData(packId, riskLevel, FOLLOWUP_TEMPLATES);
        
        // Track indices for this question's follow-ups
        if (!transcriptIndicesToUpdate[questionId]) {
          transcriptIndicesToUpdate[questionId] = [];
        }
        
        // === AI-POWERED ANSWER GENERATION ===
        let answerByQuestionId = new Map();
        
        if (useAiFollowups && packQuestions.length > 0) {
          // Build AI payload
          const sectionInfo = getSectionInfoFromPack(packId, sectionName);
          const incidentStory = buildIncidentStory(packId, riskLevel, baseQ.question_text);
          
          const aiPayload = {
            candidateProfile: {
              riskBand: riskLevel,
              deptCode: deptCode,
              fileNumber: fileNumber,
              candidateName: name
            },
            sectionInfo: sectionInfo,
            incidentStory: incidentStory,
            questions: packQuestions.map(q => ({
              questionId: q.followup_question_id,
              code: q.followup_question_id,
              text: q.question_text
            }))
          };
          
          // Call AI to generate answers
          const aiResult = await generateAIFollowupAnswers(base44, aiPayload);
          
          // Build map from questionId to answer
          if (aiResult.answers && Array.isArray(aiResult.answers)) {
            aiResult.answers.forEach(a => {
              if (a.questionId && a.answer) {
                answerByQuestionId.set(a.questionId, a.answer);
              }
            });
          }
        }
        
        // Add each deterministic follow-up question and answer
        packQuestions.forEach((fuq, idx) => {
          currentTime += 2000 + Math.floor(Math.random() * 1000);
          
          // Use AI-generated answer if available, otherwise fall back to template-based
          let answer = answerByQuestionId.get(fuq.followup_question_id);
          if (!answer) {
            answer = generateFollowUpAnswerForQuestion(fuq, packId, riskLevel, packData, idx);
          }
          
          const questionEntryIndex = finalTranscript.length;
          
          // Add follow-up question entry (responseId will be added later)
          finalTranscript.push({
            type: "followup_question",
            kind: "deterministic_followup_question",
            questionId: questionId,
            baseQuestionId: questionId,
            // responseId: null - will be populated after Response creation
            packId: packId,
            followupPackId: packId,
            followupQuestionId: fuq.followup_question_id,
            instanceNumber: 1,
            questionText: fuq.question_text,
            text: fuq.question_text,
            fieldKey: fuq.followup_question_id,
            category: sectionName,
            sectionName: sectionName,
            timestamp: new Date(currentTime).toISOString()
          });
          
          transcriptIndicesToUpdate[questionId].push(questionEntryIndex);
          
          currentTime += 3000 + Math.floor(Math.random() * 2000);
          
          const answerEntryIndex = finalTranscript.length;
          
          // Add follow-up answer entry (responseId will be added later)
          finalTranscript.push({
            type: "followup_answer",
            kind: "deterministic_followup_answer",
            questionId: questionId,
            baseQuestionId: questionId,
            // responseId: null - will be populated after Response creation
            packId: packId,
            followupPackId: packId,
            followupQuestionId: fuq.followup_question_id,
            instanceNumber: 1,
            text: answer,
            answer: answer,
            fieldKey: fuq.followup_question_id,
            category: sectionName,
            sectionName: sectionName,
            timestamp: new Date(currentTime).toISOString()
          });
          
          transcriptIndicesToUpdate[questionId].push(answerEntryIndex);
          
          transcriptFollowupCount++;
        });
      }
    }
  }
  
  console.log('[TEST_DATA][TRANSCRIPT_COUNTS]', {
    totalQuestions: allQuestions.length,
    totalTranscriptEvents: finalTranscript.length,
    yesCount,
    noCount,
    followupCount: transcriptFollowupCount
  });
  
  const sessionData = {
    session_code: sessionCode, department_code: deptCode, file_number: fileNumber, status: "completed", is_archived: false,
    started_at: startTime.toISOString(), completed_at: endTime.toISOString(), last_activity_at: endTime.toISOString(),
    questions_answered_count: allQuestions.length, followups_count: 0,
    ai_probes_count: includeAiProbing && riskLevel !== 'low' ? Math.floor(yesCount * 0.3) : 0,
    red_flags_count: redFlagsCount, completion_percent: 100,
    elapsed_seconds: Math.floor((endTime.getTime() - startTime.getTime()) / 1000),
    active_seconds: Math.floor((endTime.getTime() - startTime.getTime()) / 1000) - 300,
    transcript_snapshot: finalTranscript, session_hash: generateSessionHash(), risk_rating: riskLevel,
    metadata: { isTestData: true, testPersona: fileNumber, candidateName: name, generatedAt: now.toISOString(), yesCount, noCount, config: { includeAiProbing, enableMultiLoopBackgrounds, randomized: config.randomizeWithinPersona } },
    data_version: "v2.5-hybrid"
  };
  
  let sessionId;
  if (session) {
    sessionId = session.id;
    await base44.asServiceRole.entities.InterviewSession.update(sessionId, sessionData);
  } else {
    const created = await base44.asServiceRole.entities.InterviewSession.create(sessionData);
    sessionId = created.id;
    session = created;
  }
  
  console.log('[PROCESS] Session ID for FollowUpResponse creation:', sessionId);
  
  // Create Response records for ALL questions and track them by question_id for linking FollowUpResponses
  const responsesByQuestionId = {};
  let responsesCreated = 0;
  
  // FULL INTERVIEW: Create Response for every question
  for (const q of allQuestions) {
    const sectionName = sectionMap[q.section_id] || q.category || 'Unknown';
    const isYes = yesSet.has(q.question_id);
    const investigatorProbing = [];
    if (includeAiProbing && isYes && riskLevel !== 'low') {
      const probes = AI_PROBING_TEMPLATES[q.question_id];
      if (probes) probes.forEach((p, i) => investigatorProbing.push({ sequence_number: i + 1, probing_question: p.probing_question, candidate_response: p.candidate_response, timestamp: new Date().toISOString() }));
    }
    try {
      const responseRecord = await base44.asServiceRole.entities.Response.create({
        session_id: sessionId, question_id: q.question_id, question_text: q.question_text, category: sectionName,
        answer: isYes ? "Yes" : "No", triggered_followup: isYes && !!q.followup_pack, followup_pack: isYes ? q.followup_pack : null,
        is_flagged: isYes && (q.followup_pack?.includes('CRIME') || q.followup_pack?.includes('DRUG')),
        response_timestamp: new Date(startTime.getTime() + responsesCreated * 7000).toISOString(),
        investigator_probing: investigatorProbing.length > 0 ? investigatorProbing : undefined
      });
      // Store for linking FollowUpResponses
      const createdResponseId = responseRecord?.id || responseRecord?.data?.id;
      responsesByQuestionId[q.question_id] = createdResponseId;
      responsesCreated++;
      
      // Update transcript entries with responseId for this question's follow-ups
      const indicesToUpdate = transcriptIndicesToUpdate[q.question_id] || [];
      for (const idx of indicesToUpdate) {
        if (finalTranscript[idx]) {
          finalTranscript[idx].responseId = createdResponseId;
          finalTranscript[idx].parentResponseId = createdResponseId;
        }
      }
    } catch (e) {
      console.log('[PROCESS] Failed to create Response for', q.question_id, e.message);
    }
  }
  
  // After all Responses created, update the session's transcript_snapshot with responseIds
  console.log('[PROCESS] Updating session transcript with responseIds...');
  try {
    await base44.asServiceRole.entities.InterviewSession.update(sessionId, {
      transcript_snapshot: finalTranscript
    });
    console.log('[PROCESS] Session transcript updated with responseIds');
  } catch (e) {
    console.error('[PROCESS] Failed to update session transcript:', e.message);
  }
  
  // Use pre-fetched FollowUpQuestions (passed from runSeeder)
  console.log('[PROCESS] Using', allFollowUpQuestions.length, 'FollowUpQuestion entities for FollowUpResponse creation');
  
  // ========== CREATE ONE FollowUpResponse PER FollowUpQuestion ==========
  // This is the CRITICAL fix: we create one FollowUpResponse for each deterministic FollowUpQuestion,
  // NOT one per pack. This ensures FollowUpResponse count matches the transcript follow-up count.
  
  console.log('[PROCESS] Starting FollowUpResponse creation. Session ID:', sessionId);
  console.log('[PROCESS] Questions with Yes answers and followup_pack:', 
    allQuestions.filter(q => yesSet.has(q.question_id) && q.followup_pack).map(q => ({ id: q.question_id, pack: q.followup_pack }))
  );
  console.log('[PROCESS] Total FollowUpQuestion entities loaded:', allFollowUpQuestions.length);
  
  // Only create FollowUpResponses for Yes answers with followup_pack
  for (const q of allQuestions) {
    if (!yesSet.has(q.question_id) || !q.followup_pack) continue;
    const packData = getFollowupData(q.followup_pack, riskLevel, FOLLOWUP_TEMPLATES);
    
    // Get the response_id for linking
    const responseId = responsesByQuestionId[q.question_id] || null;
    
    // Get deterministic follow-up questions for this pack
    const packFollowUpQuestions = allFollowUpQuestions
      .filter(fuq => fuq.followup_pack_id === q.followup_pack)
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    
    // Log workplace pack specifically
    if (q.followup_pack === 'PACK_WORKPLACE_STANDARD') {
      console.log('[TEST_DATA][WORKPLACE] 🏢 Generating PACK_WORKPLACE_STANDARD incident for question', q.question_id, '- risk:', riskLevel);
    }
    console.log('[PROCESS] Creating FollowUpResponses for pack', q.followup_pack, '- found', packFollowUpQuestions.length, 'questions for base Q', q.question_id, '- responseId:', responseId);
    
    if (packFollowUpQuestions.length === 0) {
      console.log('[PROCESS] WARNING: No FollowUpQuestion entities found for pack', q.followup_pack);
      // Even if no FollowUpQuestion entities, create at least one generic FollowUpResponse
      const narrativeAnswer = generateFollowUpAnswer(q.followup_pack, riskLevel, packData);
      try {
        const fallbackPayload = { 
          session_id: sessionId, 
          response_id: responseId, // REQUIRED: Link to parent Response
          question_id: q.question_id, 
          followup_pack: q.followup_pack, 
          instance_number: 1, 
          question_text_snapshot: q.question_text, 
          incident_description: narrativeAnswer,
          circumstances: narrativeAnswer,
          accountability_response: "I take full responsibility for my actions.",
          additional_details: { 
            candidate_narrative: narrativeAnswer,
            // Generic fallback field
            generic_response: narrativeAnswer
          }, 
          completed: true, 
          completed_timestamp: endTime.toISOString() 
        };
        
        if (!responseId) {
          console.error('[PROCESS] WARNING: No response_id for fallback FollowUpResponse! Question:', q.question_id);
        }
        
        console.log('[PROCESS] Creating fallback FollowUpResponse with payload:', JSON.stringify({
          session_id: fallbackPayload.session_id,
          question_id: fallbackPayload.question_id,
          followup_pack: fallbackPayload.followup_pack
        }));
        
        const created = await base44.asServiceRole.entities.FollowUpResponse.create(fallbackPayload);
        const createdId = created?.id || created?.data?.id;
        
        if (createdId) {
          console.log('[PROCESS] SUCCESS: Created fallback FollowUpResponse', createdId, 'for', q.question_id);
          followupsCreated++;
        } else {
          console.error('[PROCESS] WARNING: Fallback create returned but no id. Result:', JSON.stringify(created).substring(0, 300));
        }
      } catch (e) {
        console.error('[PROCESS] FAILED to create fallback FollowUpResponse for', q.question_id);
        console.error('[PROCESS] Error:', e.message);
        console.error('[PROCESS] Stack:', e.stack?.substring(0, 500));
      }
      continue;
    }
    
    const items = packData ? (Array.isArray(packData) ? packData : [packData]) : [{}];
    const maxInstances = enableMultiLoopBackgrounds && riskLevel !== 'low' ? Math.min(items.length, 3) : 1;
    
    // For each instance (multi-instance support)
    for (let i = 0; i < maxInstances; i++) {
      const data = items[i] || {};
      const instanceNum = data.instance_number || (i + 1);
      
      // Create ONE FollowUpResponse PER FollowUpQuestion in the pack
      for (let fuqIdx = 0; fuqIdx < packFollowUpQuestions.length; fuqIdx++) {
        const fuq = packFollowUpQuestions[fuqIdx];
        const followupQuestionId = fuq.followup_question_id;
        const followupQuestionText = fuq.question_text;
        
        // Generate a realistic answer for this specific follow-up question
        const answer = generateFollowUpAnswerForQuestion(fuq, q.followup_pack, riskLevel, packData, fuqIdx);
        
        // Build additional_details for this specific question
        const questionDetails = {
          followup_question_id: followupQuestionId,
          followup_question_text: followupQuestionText,
          answer_text: answer,
          question_text_snapshot: { [followupQuestionId]: followupQuestionText }
        };
        
        // Add legacy template data if available
        if (packData && !Array.isArray(packData)) {
          Object.entries(packData || {}).forEach(([key, value]) => {
            if (key !== 'instance_number' && key !== 'substance_name') {
              questionDetails[key] = value;
            }
          });
        }
        if (data.substance_name) questionDetails.substance_name = data.substance_name;
        
        // Build the FollowUpResponse payload
        // CRITICAL: response_id links this FollowUpResponse to the base Response record
        // This is required for the UI to properly display follow-ups under their parent question
        const followupPayload = { 
          session_id: sessionId, 
          response_id: responseId, // REQUIRED: Link to parent Response
          question_id: q.question_id, 
          followup_pack: q.followup_pack, 
          instance_number: instanceNum, 
          question_text_snapshot: followupQuestionText, 
          incident_description: answer,
          circumstances: answer,
          accountability_response: data.accountability_response || "I take full responsibility for my actions and have grown from this experience.",
          additional_details: {
            ...questionDetails,
            // Store the followup_question_id in additional_details for transcript builder
            [followupQuestionId]: answer
          }, 
          completed: true, 
          completed_timestamp: endTime.toISOString() 
        };
        
        // Log if response_id is missing (this would be a bug)
        if (!responseId) {
          console.error('[PROCESS] WARNING: No response_id for FollowUpResponse! Question:', q.question_id);
        }
        
        // Add optional fields only if they have values
        if (data.substance_name) followupPayload.substance_name = data.substance_name;
        if (data.incident_date) followupPayload.incident_date = data.incident_date;
        if (data.incident_location) followupPayload.incident_location = data.incident_location;
        if (data.frequency) followupPayload.frequency = data.frequency;
        if (data.last_occurrence) followupPayload.last_occurrence = data.last_occurrence;
        if (data.legal_outcome) followupPayload.legal_outcome = data.legal_outcome;
        
        try {
          console.log('[PROCESS] Creating FollowUpResponse with payload:', JSON.stringify({
            session_id: followupPayload.session_id,
            question_id: followupPayload.question_id,
            followup_pack: followupPayload.followup_pack,
            instance_number: followupPayload.instance_number
          }));
          
          const createResult = await base44.asServiceRole.entities.FollowUpResponse.create(followupPayload);
          
          // Handle nested data structure from API response
          const createdId = createResult?.id || createResult?.data?.id;
          
          if (createdId) {
            console.log('[PROCESS] SUCCESS: Created FollowUpResponse', createdId, 'for', q.question_id, '/', followupQuestionId, 'instance', instanceNum);
            followupsCreated++;
          } else {
            console.error('[PROCESS] WARNING: FollowUpResponse.create returned but no id found. Result:', JSON.stringify(createResult).substring(0, 300));
          }
        } catch (e) {
          console.error('[PROCESS] FAILED to create FollowUpResponse for', q.question_id, '/', followupQuestionId, 'instance', instanceNum);
          console.error('[PROCESS] Error:', e.message);
          console.error('[PROCESS] Error stack:', e.stack?.substring(0, 500));
          console.error('[PROCESS] Payload was:', JSON.stringify(followupPayload).substring(0, 500));
        }
      }
    }
  }
  
  console.log('[PROCESS] Total FollowUpResponse records created:', followupsCreated);
  console.log('[PROCESS] Total transcript follow-up exchanges:', transcriptFollowupCount);
  
  // Compute followups_count from transcript_snapshot (canonical source)
  // This ensures the count matches what the UI renders, regardless of FollowUpResponse persistence
  const followupAnswerEventsInTranscript = finalTranscript.filter(
    e => e.type === 'followup_answer' || e.kind === 'deterministic_followup_answer'
  ).length;
  
  console.log('[PROCESS] followupAnswerEventsInTranscript:', followupAnswerEventsInTranscript);
  
  // Use the larger of: actual FollowUpResponse records created OR transcript count
  // This handles cases where FollowUpResponse creation might partially fail
  const finalFollowupsCount = Math.max(followupsCreated, followupAnswerEventsInTranscript);
  
  console.log('[PROCESS] Setting followups_count to:', finalFollowupsCount);
  
  // Verify FollowUpResponse records were actually persisted
  try {
    const verifyFollowups = await base44.asServiceRole.entities.FollowUpResponse.filter({ session_id: sessionId });
    console.log('[PROCESS] VERIFICATION: Found', verifyFollowups.length, 'FollowUpResponse records for session', sessionId);
    if (verifyFollowups.length === 0 && followupsCreated > 0) {
      console.error('[PROCESS] CRITICAL: Created', followupsCreated, 'FollowUpResponses but verification query returned 0!');
    }
  } catch (verifyErr) {
    console.error('[PROCESS] VERIFICATION failed:', verifyErr.message);
  }
  
  await base44.asServiceRole.entities.InterviewSession.update(sessionId, { followups_count: finalFollowupsCount });
  
  console.log('[TEST_DATA][SESSION_COMPLETE]', {
    fileNumber,
    riskLevel,
    totalQuestionsAnswered: allQuestions.length,
    responsesCreated,
    yesCount,
    noCount,
    followupsCreated,
    transcriptFollowupCount
  });
  
  return { action: sessionId ? "updated" : "created", fileNumber, riskLevel, stats: { responsesCreated, followupsCreated, transcriptFollowupCount, yesCount, noCount, redFlagsCount, totalQuestions: allQuestions.length } };
}

async function runSeeder(base44, config, jobId) {
  const { deptCode, totalCandidates, lowRiskCount, midRiskCount, highRiskCount, randomizeWithinPersona, useAiFollowups } = config;
  
  console.log('[PROCESS] runSeeder config:', { deptCode, totalCandidates, lowRiskCount, midRiskCount, highRiskCount, randomizeWithinPersona, useAiFollowups });
  
  const rawQuestions = await base44.asServiceRole.entities.Question.filter({ active: true });
  // Normalize question data - API may return nested 'data' property
  const questions = rawQuestions.map(q => {
    const d = q.data || q;
    return {
      id: q.id,
      question_id: d.question_id,
      section_id: d.section_id,
      question_text: d.question_text,
      response_type: d.response_type,
      display_order: d.display_order,
      active: d.active,
      followup_pack_id: d.followup_pack_id,
      followup_pack: d.followup_pack,
      followup_multi_instance: d.followup_multi_instance,
      category: d.category
    };
  });
  const rawSections = await base44.asServiceRole.entities.Section.filter({ active: true });
  // Normalize section data
  const sections = rawSections.map(s => {
    const d = s.data || s;
    return {
      id: s.id,
      section_id: d.section_id,
      section_name: d.section_name,
      section_order: d.section_order,
      active: d.active
    };
  });
  
  const sectionOrderMap = {};
  for (const s of sections) sectionOrderMap[s.section_id] = s.section_order || 999;
  questions.sort((a, b) => {
    const sA = sectionOrderMap[a.section_id] || 999;
    const sB = sectionOrderMap[b.section_id] || 999;
    if (sA !== sB) return sA - sB;
    return (a.display_order || 0) - (b.display_order || 0);
  });
  
  // Pre-fetch all FollowUpQuestion entities ONCE for reuse across all candidates
  let allFollowUpQuestions = [];
  try {
    const rawFollowUpQuestions = await base44.asServiceRole.entities.FollowUpQuestion.filter({ active: true });
    allFollowUpQuestions = rawFollowUpQuestions.map(q => {
      const data = q.data || q;
      return {
        id: q.id,
        followup_question_id: data.followup_question_id,
        followup_pack_id: data.followup_pack_id,
        display_order: data.display_order,
        question_text: data.question_text,
        response_type: data.response_type,
        active: data.active
      };
    });
    console.log('[PROCESS] Pre-fetched', allFollowUpQuestions.length, 'FollowUpQuestion entities');
    const uniquePackIds = [...new Set(allFollowUpQuestions.map(q => q.followup_pack_id))];
    console.log('[PROCESS] Unique pack IDs:', uniquePackIds.slice(0, 10));
  } catch (e) {
    console.log('[PROCESS] Could not pre-fetch FollowUpQuestion entities:', e.message);
  }
  
  const candidateConfigs = [];
  const isLegacyMode = !randomizeWithinPersona && deptCode === "MPD-12345" && totalCandidates === 5 && lowRiskCount === 2 && midRiskCount === 1 && highRiskCount === 2;
  
  if (isLegacyMode) {
    Object.entries(LEGACY_PERSONAS).forEach(([key, persona]) => {
      candidateConfigs.push({ fileNumber: key, name: persona.name, riskLevel: persona.riskLevel, yesQuestionIds: persona.yesQuestionIds });
    });
  } else {
    let lowIdx = 0, midIdx = 0, highIdx = 0;
    for (let i = 0; i < lowRiskCount; i++) {
      const poolConfig = QUESTION_POOLS.low;
      const yesIds = randomizeWithinPersona 
        ? Array.from(selectRandomYesQuestions(poolConfig.pool, poolConfig.minYes, poolConfig.maxYes, poolConfig.guaranteedQuestions || [])) 
        : poolConfig.pool.slice(0, 2);
      candidateConfigs.push({ fileNumber: generateFileNumber('low', lowIdx++, randomizeWithinPersona), name: `TEST – Low Risk Candidate ${lowIdx}`, riskLevel: 'low', yesQuestionIds: yesIds });
    }
    for (let i = 0; i < midRiskCount; i++) {
      const poolConfig = QUESTION_POOLS.moderate;
      // ALWAYS include guaranteed workplace questions for mid-risk (Q128 - disciplined/reprimanded)
      const guaranteed = poolConfig.guaranteedQuestions || ["Q128"];
      const yesIds = randomizeWithinPersona 
        ? Array.from(selectRandomYesQuestions(poolConfig.pool, poolConfig.minYes, poolConfig.maxYes, guaranteed)) 
        : [...new Set([...poolConfig.pool.slice(0, 6), ...guaranteed])];
      console.log('[TEST_DATA][WORKPLACE] Mid-risk candidate', midIdx + 1, 'yesIds:', yesIds, '- guaranteed workplace:', guaranteed);
      candidateConfigs.push({ fileNumber: generateFileNumber('moderate', midIdx++, randomizeWithinPersona), name: `TEST – Mid Risk Candidate ${midIdx}`, riskLevel: 'moderate', yesQuestionIds: Array.isArray(yesIds) ? yesIds : Array.from(yesIds) });
    }
    for (let i = 0; i < highRiskCount; i++) {
      const poolConfig = QUESTION_POOLS.high;
      // ALWAYS include guaranteed workplace questions for high-risk (Q127 - misconduct, Q129 - terminated)
      const guaranteed = poolConfig.guaranteedQuestions || ["Q127", "Q129"];
      const yesIds = randomizeWithinPersona 
        ? Array.from(selectRandomYesQuestions(poolConfig.pool, poolConfig.minYes, poolConfig.maxYes, guaranteed)) 
        : [...new Set([...poolConfig.pool.slice(0, 12), ...guaranteed])];
      console.log('[TEST_DATA][WORKPLACE] High-risk candidate', highIdx + 1, 'yesIds:', yesIds, '- guaranteed workplace:', guaranteed);
      candidateConfigs.push({ fileNumber: generateFileNumber('high', highIdx++, randomizeWithinPersona), name: `TEST – High Risk Candidate ${highIdx}`, riskLevel: 'elevated', yesQuestionIds: Array.isArray(yesIds) ? yesIds : Array.from(yesIds) });
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
      const result = await createMockSession(base44, config, candidateConfig, questions, sections, allFollowUpQuestions);
      results.push({ ...result, success: true });
      if (result.action === "created") created++; else updated++;
    } catch (error) {
      console.error('[PROCESS] Error creating session for', candidateConfig.fileNumber, error.message);
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