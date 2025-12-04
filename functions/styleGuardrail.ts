/**
 * STYLE & SAFETY GUARDRAIL
 * Ensures clarifying questions are safe, factual, neutral, and appropriate.
 * Adjusts tone for sensitive topics and enforces BI professionalism.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

// Sensitive topics requiring gentle language
const SENSITIVE_TOPICS = [
  'domestic_violence', 'dv', 'abuse', 'trauma', 'assault',
  'child', 'minor', 'sexual', 'mental_health', 'suicide'
];

// Integrity topics requiring firm language
const INTEGRITY_TOPICS = [
  'integrity', 'honesty', 'deception', 'false_statement',
  'cheating', 'fraud', 'misconduct', 'lying'
];

// Forbidden phrases that request narratives or stories
const FORBIDDEN_PHRASES = [
  'walk me through',
  'tell me the story',
  'describe in detail',
  'explain everything',
  'tell me about your feelings',
  'how did that make you feel',
  'what were you thinking',
  'why did you',
  'what possessed you',
  'what was going through your mind'
];

// Shaming/blaming language to reject
const SHAMING_PHRASES = [
  'why would you',
  'how could you',
  'you should have',
  'you shouldn\'t have',
  'that was wrong',
  'that was a mistake',
  'you failed',
  'you lied'
];

function containsForbiddenPhrase(question) {
  const lower = question.toLowerCase();
  return FORBIDDEN_PHRASES.some(phrase => lower.includes(phrase));
}

function containsShamingPhrase(question) {
  const lower = question.toLowerCase();
  return SHAMING_PHRASES.some(phrase => lower.includes(phrase));
}

function isSensitiveTopic(topic) {
  const lower = (topic || '').toLowerCase();
  return SENSITIVE_TOPICS.some(t => lower.includes(t));
}

function isIntegrityTopic(topic) {
  const lower = (topic || '').toLowerCase();
  return INTEGRITY_TOPICS.some(t => lower.includes(t));
}

function quickValidation(question, topic) {
  const issues = [];
  
  if (containsForbiddenPhrase(question)) {
    issues.push('contains_narrative_request');
  }
  if (containsShamingPhrase(question)) {
    issues.push('contains_shaming_language');
  }
  if (question.length > 200) {
    issues.push('too_long');
  }
  if (question.split('?').length > 2) {
    issues.push('multiple_questions');
  }
  
  return issues;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      question,
      topic = 'general',
      targetAnchors = [],
      tone = 'neutral'
    } = await req.json();

    if (!question) {
      return Response.json({ 
        success: false,
        error: 'No question provided'
      }, { status: 400 });
    }

    // Quick validation checks
    const issues = quickValidation(question, topic);
    
    // Determine if topic requires tone adjustment
    const isSensitive = isSensitiveTopic(topic);
    const isIntegrity = isIntegrityTopic(topic);
    const recommendedTone = isSensitive ? 'soft' : (isIntegrity ? 'firm' : tone);

    // If no issues and tone matches, pass through
    if (issues.length === 0 && tone === recommendedTone) {
      return Response.json({
        success: true,
        approved: true,
        question: question,
        adjustedQuestion: null,
        issues: [],
        recommendedTone
      });
    }

    // Use LLM to adjust the question if needed
    const guardrailPrompt = `You are the STYLE & SAFETY GUARDRAIL for a law-enforcement background investigation system.

Original question: "${question}"
Topic: ${topic}
Target anchors: ${JSON.stringify(targetAnchors)}
Current tone: ${tone}
Recommended tone: ${recommendedTone}
Issues detected: ${JSON.stringify(issues)}

Rules:
1. Never request narratives, stories, or emotional detail.
2. Never shame, blame, or moralize.
3. Keep questions short and factual (one sentence, under 100 characters if possible).
4. Use gentle language for sensitive topics (DV, trauma, minors): "If you're comfortable sharing..." or "To the extent you recall..."
5. Use firm, direct language for honesty and integrity topics: "Please specify..." or "For the record..."
6. Never ask for more detail than required to fill missing anchors.
7. Never invent information or assumptions.
8. Maintain a professional BI tone at all times.
9. Remove any conversational fillers like "Alright", "Great", "Thanks".

${issues.length > 0 ? 'The question has issues that need fixing.' : 'The question needs tone adjustment.'}

Return the improved question only. Keep it SHORT and FACTUAL.`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: guardrailPrompt,
      response_json_schema: {
        type: "object",
        properties: {
          adjustedQuestion: {
            type: "string",
            description: "The improved, guardrail-compliant question"
          }
        },
        required: ["adjustedQuestion"]
      }
    });

    const adjustedQuestion = result.adjustedQuestion || question;

    return Response.json({
      success: true,
      approved: issues.length === 0,
      question: question,
      adjustedQuestion: adjustedQuestion !== question ? adjustedQuestion : null,
      finalQuestion: adjustedQuestion,
      issues,
      recommendedTone,
      topicFlags: {
        isSensitive,
        isIntegrity
      }
    });

  } catch (error) {
    console.error('Style Guardrail error:', error);
    
    // On error, pass through the original question
    const { question = '' } = await req.json().catch(() => ({}));
    
    return Response.json({ 
      success: true,
      approved: true,
      question: question,
      adjustedQuestion: null,
      finalQuestion: question,
      issues: ['guardrail_error'],
      error: error.message
    });
  }
});