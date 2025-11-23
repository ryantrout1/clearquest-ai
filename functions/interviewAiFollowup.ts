import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

// Helper to build unified AI instructions with layered prompts
async function buildAiInstructions(base44, mode, sectionId, packId) {
  try {
    const coreRules = `You are a ClearQuest Background Investigation AI Assistant conducting law enforcement background investigations.

CORE SYSTEM RULES (ALWAYS APPLY):
- All information is strictly confidential and CJIS-compliant
- Maintain professional, non-judgmental tone at all times
- Never make hiring recommendations or conclusions
- Focus on factual, objective information gathering
- Respect the sensitivity of personal disclosures`;

    // Load global settings
    const globalSettings = await base44.entities.GlobalSettings.filter({ settings_id: 'global' });
    const settings = globalSettings.length > 0 ? globalSettings[0] : null;

    if (mode === 'probe') {
      let instructions = coreRules + '\n\n';
      
      // Layer 1: Global probing instructions
      if (settings?.ai_default_probing_instructions) {
        instructions += '=== GLOBAL PROBING GUIDELINES ===\n';
        instructions += settings.ai_default_probing_instructions + '\n\n';
      }
      
      // Layer 2: Section-specific context (optional)
      if (sectionId) {
        const sections = await base44.entities.Section.filter({ id: sectionId });
        if (sections.length > 0 && sections[0].ai_section_summary_instructions) {
          instructions += '=== SECTION CONTEXT ===\n';
          instructions += sections[0].ai_section_summary_instructions + '\n\n';
        }
      }
      
      // Layer 3: Pack-specific probing instructions
      if (packId) {
        const packs = await base44.entities.FollowUpPack.filter({ followup_pack_id: packId });
        if (packs.length > 0 && packs[0].ai_probe_instructions) {
          instructions += '=== PACK-SPECIFIC PROBING INSTRUCTIONS ===\n';
          instructions += packs[0].ai_probe_instructions + '\n\n';
        }
      }
      
      return instructions;
    }
    
    return coreRules;
  } catch (err) {
    console.error('Error building AI instructions:', err);
    return `You are a ClearQuest Background Investigation AI Assistant conducting law enforcement background investigations.

CORE SYSTEM RULES (ALWAYS APPLY):
- All information is strictly confidential and CJIS-compliant
- Maintain professional, non-judgmental tone at all times
- Never make hiring recommendations or conclusions
- Focus on factual, objective information gathering
- Respect the sensitivity of personal disclosures`;
  }
}

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

    // Get question to find section
    let sectionId = null;
    try {
      const question = await base44.entities.Question.get(questionId);
      if (question) {
        sectionId = question.section_id;
      }
    } catch (err) {
      console.warn('Could not load question for section context:', err);
    }

    // Build unified instructions using the layered instruction builder
    const systemPrompt = await buildAiInstructions(base44, 'probe', sectionId, followupPackId);
    
    // Add investigator-specific overlay (subordinate to unified instructions)
    const investigatorOverlay = `

=== INVESTIGATOR PROBING TASK ===
You are generating a small number of follow-up questions as an AI investigator to clarify this specific story for the human background investigator.

CRITICAL TASK RULES:
- Ask ONE concise, specific follow-up question based on the candidate's answer
- Focus on gathering factual details (circumstances, outcomes, context)
- Be professional and non-judgmental
- Keep questions brief (under 30 words)
- Ask about specifics that need clarification or expansion
- Follow all probing rules above, especially regarding dates (month/year only)

Your response must be a single follow-up question.`;

    // Build user prompt with context
    let userPrompt = `The candidate answered the following question:\n\nQuestion: "${transcriptWindow[transcriptWindow.length - 2]?.content || 'Previous question'}"\n\nCandidate's Answer: "${candidateAnswer}"\n\n`;
    
    if (followupPackId) {
      userPrompt += `This is part of the "${followupPackId}" investigation area.\n\n`;
    }
    
    userPrompt += `Generate ONE specific follow-up question to gather more details about their response. Remember to follow all probing guidelines above.`;

    // Call invokeLLM with unified instructions
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `${systemPrompt}${investigatorOverlay}\n\n${userPrompt}`,
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