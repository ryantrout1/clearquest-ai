import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Get AI runtime configuration from GlobalSettings with safe defaults
 * Single source of truth for all LLM parameters
 */
function getAiRuntimeConfig(globalSettings) {
  return {
    model: globalSettings?.ai_model || "gpt-4o-mini",
    temperature: globalSettings?.ai_temperature ?? 0.2,
    max_tokens: globalSettings?.ai_max_tokens ?? 512,
    top_p: globalSettings?.ai_top_p ?? 1,
  };
}

// Helper to build unified AI instructions with layered prompts
// Returns: { instructions: string, aiConfig: object }
async function buildAiInstructions(base44, mode, sectionId, packId, maxFollowups = 3) {
  const coreRules = `You are a ClearQuest Background Investigation AI Assistant conducting law enforcement background investigations.

CORE SYSTEM RULES (ALWAYS APPLY):
- All information is strictly confidential and CJIS-compliant
- Maintain professional, non-judgmental tone at all times
- Never make hiring recommendations or conclusions
- Focus on factual, objective information gathering
- Respect the sensitivity of personal disclosures`;

  let aiConfig = getAiRuntimeConfig(null); // Defaults

  try {
    if (mode === 'probe') {
      // PERF: Batch fetch all needed entities in parallel
      const [globalSettingsResult, sectionsResult, packsResult] = await Promise.all([
        base44.entities.GlobalSettings.filter({ settings_id: 'global' }).catch(() => []),
        sectionId 
          ? base44.entities.Section.filter({ id: sectionId }).catch(() => [])
          : Promise.resolve([]),
        packId 
          ? base44.entities.FollowUpPack.filter({ followup_pack_id: packId }).catch(() => [])
          : Promise.resolve([])
      ]);
      
      const settings = globalSettingsResult.length > 0 ? globalSettingsResult[0] : null;
      const section = sectionsResult.length > 0 ? sectionsResult[0] : null;
      const pack = packsResult.length > 0 ? packsResult[0] : null;
      
      // Get AI runtime config from GlobalSettings
      aiConfig = getAiRuntimeConfig(settings);
      console.log(`[AI-FOLLOWUP] AI Config: model=${aiConfig.model}, temp=${aiConfig.temperature}, max_tokens=${aiConfig.max_tokens}`);
      
      let instructions = coreRules + '\n\n';
      
      // Layer 1: Global probing instructions
      if (settings?.ai_default_probing_instructions) {
        instructions += '=== GLOBAL PROBING GUIDELINES ===\n';
        instructions += settings.ai_default_probing_instructions + '\n\n';
      }
      
      // Layer 2: Section-specific context (optional)
      if (section?.ai_section_summary_instructions) {
        instructions += '=== SECTION CONTEXT ===\n';
        instructions += section.ai_section_summary_instructions + '\n\n';
      }
      
      // Layer 3: Pack-specific probing instructions
      if (pack?.ai_probe_instructions) {
        instructions += '=== PACK-SPECIFIC PROBING INSTRUCTIONS ===\n';
        instructions += pack.ai_probe_instructions + '\n\n';
      }
      
      // Layer 4: Probing limit instructions (dynamic based on pack config)
      instructions += '=== PROBING LIMITS ===\n';
      instructions += `- Ask follow-up questions ONE at a time.\n`;
      instructions += `- Your goal is to fully understand and clarify the story in about 3 follow-up questions.\n`;
      instructions += `- You may ask up to ${maxFollowups} follow-up questions if needed, but stop sooner if the story is clear.\n`;
      instructions += `- Do NOT exceed ${maxFollowups} probing questions under any circumstances.\n\n`;
      
      return { instructions, aiConfig };
    }
    
    return { instructions: coreRules, aiConfig };
  } catch (err) {
    console.error('Error building AI instructions:', err);
    return { 
      instructions: coreRules, 
      aiConfig 
    };
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
      return Response.json({ status: 'error', message: 'Missing required fields' });
    }

    // Batch fetch: Question, FollowUpPack, and GlobalSettings in parallel
    let sectionId = null;
    let maxFollowups = 3; // Default if pack not found or field not set
    
    try {
      const [questionResult, packResult] = await Promise.all([
        base44.entities.Question.get(questionId).catch(() => null),
        followupPackId 
          ? base44.entities.FollowUpPack.filter({ followup_pack_id: followupPackId }).catch(() => [])
          : Promise.resolve([])
      ]);
      
      if (questionResult) {
        sectionId = questionResult.section_id;
      }
      
      if (packResult && packResult.length > 0) {
        const rawLimit = packResult[0].max_ai_followups;
        if (typeof rawLimit === 'number' && rawLimit > 0) {
          maxFollowups = rawLimit;
        }
      }
    } catch (err) {
      // Silently continue with defaults
    }

    // Build unified instructions using the layered instruction builder
    const { instructions: systemPrompt, aiConfig } = await buildAiInstructions(base44, 'probe', sectionId, followupPackId, maxFollowups);
    
    // Add investigator-specific overlay (subordinate to unified instructions)
    const investigatorOverlay = `

=== INVESTIGATOR PROBING TASK ===
You are generating follow-up questions as an AI investigator to clarify this specific story for the human background investigator.

CRITICAL TASK RULES:
- Ask ONE concise, specific follow-up question based on the candidate's answer
- Your goal is to fully understand the story in about 3 follow-up questions
- You may ask up to ${maxFollowups} follow-up questions if truly needed, but stop sooner if the story is clear
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

    console.log(`[AI-FOLLOWUP] Calling InvokeLLM with model=${aiConfig.model}, temp=${aiConfig.temperature}`);

    // Call invokeLLM with unified instructions AND AI runtime config
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `${systemPrompt}${investigatorOverlay}\n\n${userPrompt}`,
      add_context_from_internet: false,
      model: aiConfig.model,
      temperature: aiConfig.temperature,
      max_tokens: aiConfig.max_tokens,
      top_p: aiConfig.top_p
    });

    const followupQuestion = result?.trim();

    if (!followupQuestion || followupQuestion.length < 5) {
      return Response.json({ status: 'error', message: 'Empty AI response' });
    }

    return Response.json({
      status: 'ok',
      followupQuestion,
      mode
    });

  } catch (error) {
    return Response.json({ status: 'error', message: error.message }, { status: 500 });
  }
});