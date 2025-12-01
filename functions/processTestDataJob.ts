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
  
  // Now fetch FollowUpQuestions and add deterministic follow-up entries to transcript
  let allFollowUpQuestionsForTranscript = [];
  try {
    allFollowUpQuestionsForTranscript = await base44.asServiceRole.entities.FollowUpQuestion.filter({ active: true });
  } catch (e) {
    console.log('[PROCESS] Could not load FollowUpQuestions for transcript:', e.message);
  }
  
  // Insert deterministic follow-up Q&A entries into transcript after their base answers
  const finalTranscript = [];
  let transcriptFollowupCount = 0;
  
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
        
        // Add each deterministic follow-up question and answer
        packQuestions.forEach((fuq, idx) => {
          currentTime += 2000 + Math.floor(Math.random() * 1000);
          const answer = generateFollowUpAnswerForQuestion(fuq, packId, riskLevel, packData, idx);
          
          // Add follow-up question entry
          finalTranscript.push({
            type: "followup_question",
            kind: "deterministic_followup_question",
            questionId: questionId,
            baseQuestionId: questionId,
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
          
          currentTime += 3000 + Math.floor(Math.random() * 2000);
          
          // Add follow-up answer entry
          finalTranscript.push({
            type: "followup_answer",
            kind: "deterministic_followup_answer",
            questionId: questionId,
            baseQuestionId: questionId,
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
          
          transcriptFollowupCount++;
        });
      }
    }
  }
  
  console.log('[PROCESS] Added', transcriptFollowupCount, 'deterministic follow-up exchanges to transcript');
  
  const sessionData = {
    session_code: sessionCode, department_code: deptCode, file_number: fileNumber, status: "completed", is_archived: false,
    started_at: startTime.toISOString(), completed_at: endTime.toISOString(), last_activity_at: endTime.toISOString(),
    questions_answered_count: questions.length, followups_count: 0,
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
  
  // Create Response records and track them by question_id for linking FollowUpResponses
  const responsesByQuestionId = {};
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
      const responseRecord = await base44.asServiceRole.entities.Response.create({
        session_id: session.id, question_id: q.question_id, question_text: q.question_text, category: sectionName,
        answer: isYes ? "Yes" : "No", triggered_followup: isYes && !!q.followup_pack, followup_pack: isYes ? q.followup_pack : null,
        is_flagged: isYes && (q.followup_pack?.includes('CRIME') || q.followup_pack?.includes('DRUG')),
        response_timestamp: new Date(startTime.getTime() + responsesCreated * 7000).toISOString(),
        investigator_probing: investigatorProbing.length > 0 ? investigatorProbing : undefined
      });
      // Store for linking FollowUpResponses
      responsesByQuestionId[q.question_id] = responseRecord.id;
      responsesCreated++;
    } catch (e) {
      console.log('[PROCESS] Failed to create Response for', q.question_id, e.message);
    }
  }
  
  // Fetch all FollowUpQuestion entities for deterministic follow-up generation
  let allFollowUpQuestions = [];
  try {
    allFollowUpQuestions = await base44.asServiceRole.entities.FollowUpQuestion.filter({ active: true });
    console.log('[PROCESS] Loaded', allFollowUpQuestions.length, 'FollowUpQuestion entities');
  } catch (e) {
    console.log('[PROCESS] Could not load FollowUpQuestion entities:', e.message);
  }
  
  // ========== CREATE ONE FollowUpResponse PER FollowUpQuestion ==========
  // This is the CRITICAL fix: we create one FollowUpResponse for each deterministic FollowUpQuestion,
  // NOT one per pack. This ensures FollowUpResponse count matches the transcript follow-up count.
  
  for (const q of questions) {
    if (!yesSet.has(q.question_id) || !q.followup_pack) continue;
    const packData = getFollowupData(q.followup_pack, riskLevel, FOLLOWUP_TEMPLATES);
    
    // Get the response_id for linking
    const responseId = responsesByQuestionId[q.question_id] || null;
    
    // Get deterministic follow-up questions for this pack
    const packFollowUpQuestions = allFollowUpQuestions
      .filter(fuq => fuq.followup_pack_id === q.followup_pack)
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    
    console.log('[PROCESS] Creating FollowUpResponses for pack', q.followup_pack, '- found', packFollowUpQuestions.length, 'questions for base Q', q.question_id);
    
    if (packFollowUpQuestions.length === 0) {
      console.log('[PROCESS] WARNING: No FollowUpQuestion entities found for pack', q.followup_pack);
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
        
        try {
          const created = await base44.asServiceRole.entities.FollowUpResponse.create({ 
            session_id: sessionId, 
            response_id: responseId,
            question_id: q.question_id, 
            question_text_snapshot: followupQuestionText, 
            followup_pack: q.followup_pack, 
            instance_number: instanceNum, 
            substance_name: data.substance_name || null, 
            incident_date: data.incident_date || null, 
            incident_location: data.incident_location || null, 
            incident_description: answer,
            frequency: data.frequency || null, 
            last_occurrence: data.last_occurrence || null, 
            circumstances: answer,
            accountability_response: data.accountability_response || "I take full responsibility for my actions and have grown from this experience.",
            legal_outcome: data.legal_outcome || null, 
            additional_details: questionDetails, 
            completed: true, 
            completed_timestamp: endTime.toISOString() 
          });
          console.log('[PROCESS] Created FollowUpResponse', created.id, 'for', q.question_id, '/', followupQuestionId, 'instance', instanceNum);
          followupsCreated++;
        } catch (e) {
          console.error('[PROCESS] FAILED to create FollowUpResponse for', q.question_id, '/', followupQuestionId, 'instance', instanceNum, ':', e.message, e.stack);
        }
      }
    }
  }
  
  console.log('[PROCESS] Total FollowUpResponse records created:', followupsCreated);
  console.log('[PROCESS] Total transcript follow-up exchanges:', transcriptFollowupCount);
  
  await base44.asServiceRole.entities.InterviewSession.update(sessionId, { followups_count: followupsCreated });
  
  return { action: sessionId ? "updated" : "created", fileNumber, riskLevel, stats: { responsesCreated, followupsCreated, transcriptFollowupCount, yesCount, noCount, redFlagsCount } };
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