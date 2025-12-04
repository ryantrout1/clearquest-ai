/**
 * CLARIFIER QUESTION BUILDER
 * Generates ONE short clarifying question for missing BI anchors.
 * Never asks for narratives or stories.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

// Static fallback questions by anchor type
const FALLBACK_QUESTIONS = {
  // Time-related
  month_year: "What month and year was that?",
  date: "What was the approximate date?",
  time_period: "About when did this occur?",
  
  // Agency/organization
  agency: "Which agency was this with?",
  agency_type: "What type of agency was this?",
  agency_name: "What was the name of the agency?",
  employer: "What was the employer's name?",
  organization: "Which organization was this?",
  
  // Location
  location: "Where did this occur?",
  location_general: "What city and state was this in?",
  city: "What city was this in?",
  state: "What state was this in?",
  
  // Position/role
  position: "What position were you applying for?",
  role: "What was your role?",
  job_title: "What was the job title?",
  
  // Outcome
  outcome: "What was the final outcome?",
  result: "What was the result?",
  disposition: "How was this resolved?",
  legal_outcome: "What was the legal outcome?",
  
  // Other common anchors
  reason: "What was the reason given?",
  reason_not_hired: "Did they tell you why you weren't hired?",
  frequency: "How often did this occur?",
  amount: "What was the amount involved?",
  description: "Can you briefly describe what happened?",
  circumstances: "What were the circumstances?"
};

// Tone-adjusted prefixes
const TONE_PREFIXES = {
  soft: [
    "If you recall, ",
    "To the best of your memory, ",
    "If you can remember, "
  ],
  neutral: [
    "",
    ""
  ],
  firm: [
    "Please specify: ",
    "We need to confirm: ",
    "For the record, "
  ]
};

function getRandomPrefix(tone) {
  const prefixes = TONE_PREFIXES[tone] || TONE_PREFIXES.neutral;
  return prefixes[Math.floor(Math.random() * prefixes.length)];
}

function buildStaticQuestion(targetAnchors, tone) {
  if (!targetAnchors || targetAnchors.length === 0) {
    return null;
  }

  const prefix = getRandomPrefix(tone);
  
  if (targetAnchors.length === 1) {
    const anchor = targetAnchors[0];
    const question = FALLBACK_QUESTIONS[anchor] || `What was the ${anchor.replace(/_/g, ' ')}?`;
    return prefix + question;
  }

  // Multiple anchors - combine into one question
  const parts = targetAnchors.map(anchor => {
    if (anchor.includes('month') || anchor.includes('year') || anchor.includes('date')) {
      return 'when it occurred';
    }
    if (anchor.includes('agency') || anchor.includes('organization')) {
      return 'which agency';
    }
    if (anchor.includes('location') || anchor.includes('city') || anchor.includes('state')) {
      return 'where';
    }
    if (anchor.includes('position') || anchor.includes('role') || anchor.includes('title')) {
      return 'what position';
    }
    if (anchor.includes('outcome') || anchor.includes('result')) {
      return 'the outcome';
    }
    return anchor.replace(/_/g, ' ');
  });

  const uniqueParts = [...new Set(parts)];
  
  if (uniqueParts.length === 2) {
    return `${prefix}Can you tell me ${uniqueParts[0]} and ${uniqueParts[1]}?`;
  }
  
  const lastPart = uniqueParts.pop();
  return `${prefix}Can you tell me ${uniqueParts.join(', ')}, and ${lastPart}?`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      targetAnchors = [],
      collectedAnchors = {},
      topic = 'general',
      tone = 'neutral',
      useLLM = true
    } = await req.json();

    if (!targetAnchors || targetAnchors.length === 0) {
      return Response.json({ 
        success: false,
        error: 'No target anchors provided',
        question: null
      }, { status: 400 });
    }

    // Try static fallback first for simple cases
    if (!useLLM || targetAnchors.length === 1) {
      const staticQuestion = buildStaticQuestion(targetAnchors, tone);
      if (staticQuestion) {
        return Response.json({
          success: true,
          question: staticQuestion,
          method: 'static',
          targetAnchors,
          tone
        });
      }
    }

    // Use LLM for more complex cases
    const builderPrompt = `You are the CLARIFIER QUESTION BUILDER for a law-enforcement background investigation system.

Your job:
Write ONE short clarifying question that asks ONLY for missing BI anchors.
Never ask for narratives or stories.

Given:
- targetAnchors: ${JSON.stringify(targetAnchors)}
- collectedAnchors: ${JSON.stringify(collectedAnchors)}
- topic: ${topic}
- tone: ${tone}

Rules:
1. Ask for only the missing anchors.
2. Keep the question short and factual (one sentence).
3. Keep the tone appropriate:
   - soft: gentle, understanding ("If you recall...")
   - neutral: direct but polite
   - firm: professional and clear ("Please specify...")
4. Never repeat anchors the candidate already provided.
5. Never ask "walk me through" or "tell the story."
6. Always be respectful and professional.
7. Do NOT use phrases like "Alright" or "Great" or "Thanks" - just ask the question directly.

Examples of allowed forms:
- "What month and year was that?"
- "Which agency was this with?"
- "What position were you applying for?"
- "What was the final outcome?"

Return ONLY the question text as a simple string.`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: builderPrompt,
      response_json_schema: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "The clarifying question to ask"
          }
        },
        required: ["question"]
      }
    });

    const question = result.question || buildStaticQuestion(targetAnchors, tone);

    return Response.json({
      success: true,
      question,
      method: 'llm',
      targetAnchors,
      tone
    });

  } catch (error) {
    console.error('Clarifier Builder error:', error);
    
    // Fallback to static question on error
    const { targetAnchors = [], tone = 'neutral' } = await req.json().catch(() => ({}));
    const fallbackQuestion = buildStaticQuestion(targetAnchors, tone);
    
    return Response.json({ 
      success: true,
      question: fallbackQuestion || "Can you provide more details?",
      method: 'static_fallback',
      error: error.message,
      targetAnchors,
      tone
    });
  }
});