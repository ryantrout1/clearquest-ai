import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const payload = await req.json();
    const { 
      interviewId, 
      questionId, 
      followupPackId, 
      transcriptWindow = [], 
      candidateAnswer,
      mode = "FOLLOWUP_PROBE"
    } = payload;

    // Validate inputs
    if (!interviewId || !questionId || !candidateAnswer) {
      console.error('LIVE_AI_FOLLOWUP_ERROR [validation]', { interviewId, questionId });
      return Response.json({ status: 'error', message: 'Missing required fields' });
    }

    // Build system prompt
    const systemPrompt = `You are a ClearQuest Background Investigation AI Assistant. Your role is to ask clarifying follow-up questions based on candidate responses during background interviews.

CRITICAL RULES:
- Ask ONE concise, specific follow-up question based on the candidate's answer
- Focus on gathering factual details (dates, circumstances, outcomes)
- Be professional and non-judgmental
- Do NOT make hiring decisions or conclusions
- Keep questions brief (under 30 words)
- Ask about specifics that need clarification or expansion

Your response must be a single follow-up question.`;

    // Build user prompt with context
    let userPrompt = `The candidate answered the following question:\n\nQuestion: "${transcriptWindow[transcriptWindow.length - 2]?.content || 'Previous question'}"\n\nCandidate's Answer: "${candidateAnswer}"\n\n`;
    
    if (followupPackId) {
      userPrompt += `This is part of the "${followupPackId}" investigation area.\n\n`;
    }
    
    userPrompt += `Generate ONE specific follow-up question to gather more details about their response. Focus on facts, dates, or circumstances that need clarification.`;

    // Call invokeLLM
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `${systemPrompt}\n\n${userPrompt}`,
      add_context_from_internet: false
    });

    const followupQuestion = result?.trim();

    if (!followupQuestion || followupQuestion.length < 5) {
      console.error('LIVE_AI_FOLLOWUP_ERROR [empty_response]', { interviewId, questionId, followupPackId });
      return Response.json({ status: 'error', message: 'Empty AI response' });
    }

    return Response.json({
      status: 'ok',
      followupQuestion,
      mode
    });

  } catch (error) {
    const { interviewId, questionId, followupPackId } = await req.json().catch(() => ({}));
    console.error('LIVE_AI_FOLLOWUP_ERROR', { interviewId, questionId, followupPackId, error: error.message });
    return Response.json({ status: 'error', message: error.message }, { status: 500 });
  }
});