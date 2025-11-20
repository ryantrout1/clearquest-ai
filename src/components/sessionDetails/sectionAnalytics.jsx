/**
 * Section Analytics Helper Functions
 * Computes KPIs, timing metrics, and generates AI summaries for section headers
 */

import { base44 } from "@/api/base44Client";

/**
 * Compute section-level KPIs from responses and followups
 */
export function computeSectionKPIs(sectionName, allResponses, allFollowups) {
  const sectionResponses = allResponses.filter(r => r.section_name === sectionName);
  
  const totalQuestions = sectionResponses.length;
  const yesCount = sectionResponses.filter(r => r.answer === 'Yes').length;
  const noCount = sectionResponses.filter(r => r.answer === 'No').length;
  
  // Count follow-up packs triggered in this section
  const followUpCount = allFollowups.filter(fu => {
    const response = sectionResponses.find(r => r.id === fu.response_id);
    return response !== undefined;
  }).length;
  
  // Count red flags
  const redFlagCount = sectionResponses.filter(r => r.is_flagged === true).length;
  
  const completionPercent = totalQuestions > 0 ? Math.round((totalQuestions / totalQuestions) * 100) : 0;
  const isComplete = totalQuestions > 0;
  
  return {
    totalQuestions,
    yesCount,
    noCount,
    followUpCount,
    redFlagCount,
    completionPercent,
    isComplete
  };
}

/**
 * Compute time analytics for a section
 */
export function computeSectionTimeAnalytics(sectionName, allResponses) {
  const sectionResponses = allResponses.filter(r => r.section_name === sectionName);
  
  if (sectionResponses.length === 0) {
    return {
      totalSeconds: 0,
      avgSecondsPerQuestion: 0,
      slowestQuestion: null,
      fastestQuestion: null
    };
  }
  
  // Sort by timestamp
  const sorted = [...sectionResponses].sort((a, b) => 
    new Date(a.response_timestamp) - new Date(b.response_timestamp)
  );
  
  const firstTimestamp = new Date(sorted[0].response_timestamp);
  const lastTimestamp = new Date(sorted[sorted.length - 1].response_timestamp);
  const totalSeconds = Math.round((lastTimestamp - firstTimestamp) / 1000);
  
  const avgSecondsPerQuestion = sorted.length > 0 
    ? Math.round(totalSeconds / sorted.length) 
    : 0;
  
  // Compute per-question durations (time between consecutive questions)
  const questionDurations = [];
  for (let i = 1; i < sorted.length; i++) {
    const prevTime = new Date(sorted[i - 1].response_timestamp);
    const currTime = new Date(sorted[i].response_timestamp);
    const duration = Math.round((currTime - prevTime) / 1000);
    questionDurations.push({
      response: sorted[i],
      duration
    });
  }
  
  let slowestQuestion = null;
  let fastestQuestion = null;
  
  if (questionDurations.length > 0) {
    slowestQuestion = questionDurations.reduce((max, curr) => 
      curr.duration > max.duration ? curr : max
    );
    
    fastestQuestion = questionDurations.reduce((min, curr) => 
      curr.duration < min.duration ? curr : min
    );
  }
  
  return {
    totalSeconds,
    avgSecondsPerQuestion,
    slowestQuestion: slowestQuestion ? {
      questionId: slowestQuestion.response.question_id,
      duration: slowestQuestion.duration
    } : null,
    fastestQuestion: fastestQuestion ? {
      questionId: fastestQuestion.response.question_id,
      duration: fastestQuestion.duration
    } : null
  };
}

/**
 * Determine which badges should be shown for a section
 */
export function computeSectionBadges(kpis, timeAnalytics) {
  const badges = [];
  
  // Clean Section (all No answers, no follow-ups, no red flags)
  if (kpis.yesCount === 0 && kpis.followUpCount === 0 && kpis.redFlagCount === 0) {
    badges.push({ type: 'clean', label: 'Clean Section', color: 'green' });
  }
  
  // Has Follow-Ups
  if (kpis.followUpCount > 0) {
    badges.push({ type: 'followups', label: `${kpis.followUpCount} Follow-Up${kpis.followUpCount !== 1 ? 's' : ''}`, color: 'orange' });
  }
  
  // Risk Indicators (red flags or high Yes count)
  if (kpis.redFlagCount > 0) {
    badges.push({ type: 'risk', label: `${kpis.redFlagCount} Red Flag${kpis.redFlagCount !== 1 ? 's' : ''}`, color: 'red' });
  } else if (kpis.yesCount > kpis.totalQuestions * 0.3 && kpis.yesCount > 0) {
    badges.push({ type: 'review', label: 'Review Suggested', color: 'yellow' });
  }
  
  // Hesitation Detection (avg time per question > 2 minutes)
  if (timeAnalytics.avgSecondsPerQuestion > 120) {
    badges.push({ type: 'hesitation', label: 'Hesitation Detected', color: 'purple' });
  }
  
  return badges;
}

/**
 * Generate AI summary for a section
 * Cache results to avoid regenerating on every render
 */
const summaryCache = new Map();

export async function generateSectionSummary(sectionName, sectionResponses, followups) {
  const cacheKey = `${sectionName}_${sectionResponses.length}_${followups.length}`;
  
  if (summaryCache.has(cacheKey)) {
    return summaryCache.get(cacheKey);
  }
  
  try {
    // Build context for AI
    const yesResponses = sectionResponses.filter(r => r.answer === 'Yes');
    const noResponses = sectionResponses.filter(r => r.answer === 'No');
    const hasFollowUps = followups.length > 0;
    
    if (yesResponses.length === 0 && !hasFollowUps) {
      const summary = {
        text: "No disclosures in this section. All questions answered negatively with no follow-up incidents reported.",
        riskLevel: "Low",
        concerns: []
      };
      summaryCache.set(cacheKey, summary);
      return summary;
    }
    
    // Prepare prompt for AI
    const yesQuestions = yesResponses.map(r => `- ${r.question_text}`).join('\n');
    const followUpDetails = followups.map(fu => {
      const details = fu.additional_details || {};
      return `  Follow-up: ${fu.followup_pack}\n  Details: ${JSON.stringify(details, null, 2)}`;
    }).join('\n');
    
    const prompt = `You are an investigator analyzing an applicant's background interview responses for the section "${sectionName}".

Section Statistics:
- Total Questions: ${sectionResponses.length}
- Yes Responses: ${yesResponses.length}
- No Responses: ${noResponses.length}
- Follow-Up Packs: ${followups.length}

Yes Responses:
${yesQuestions || 'None'}

${hasFollowUps ? `Follow-Up Details:\n${followUpDetails}` : ''}

Provide a SHORT investigator summary (3-5 sentences) that includes:
1. What was disclosed in this section
2. Any detected concerns or patterns
3. Recommended follow-up actions (if any)
4. Risk assessment (Low/Medium/High)

Format your response as JSON:
{
  "text": "Your 3-5 sentence summary here",
  "riskLevel": "Low|Medium|High",
  "concerns": ["concern 1", "concern 2"]
}`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: prompt,
      response_json_schema: {
        type: "object",
        properties: {
          text: { type: "string" },
          riskLevel: { type: "string", enum: ["Low", "Medium", "High"] },
          concerns: { type: "array", items: { type: "string" } }
        },
        required: ["text", "riskLevel", "concerns"]
      }
    });
    
    const summary = result || {
      text: "Summary generation in progress...",
      riskLevel: "Low",
      concerns: []
    };
    
    summaryCache.set(cacheKey, summary);
    return summary;
  } catch (err) {
    console.error('Error generating section summary:', err);
    const fallback = {
      text: "Summary unavailable. Manual review recommended.",
      riskLevel: "Low",
      concerns: []
    };
    summaryCache.set(cacheKey, fallback);
    return fallback;
  }
}

/**
 * Format time duration for display
 */
export function formatDuration(seconds) {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}