import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Generate AI Investigator Summaries for all questions in a session
 * Input: { session_id }
 * Output: { success: true, updatedCount: N }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { session_id } = await req.json();

    if (!session_id) {
      return Response.json({ error: 'session_id required' }, { status: 400 });
    }

    console.log(`🤖 Generating AI summaries for session: ${session_id}`);

    // Fetch all responses for this session
    const responses = await base44.asServiceRole.entities.Response.filter({
      session_id: session_id
    });

    console.log(`📊 Found ${responses.length} responses`);

    // Fetch all follow-up responses for this session
    const allFollowups = await base44.asServiceRole.entities.FollowUpResponse.filter({
      session_id: session_id
    });

    let updatedCount = 0;

    // Process each "Yes" response
    for (const response of responses) {
      if (response.answer !== 'Yes') continue;

      // Find related follow-ups
      const relatedFollowups = allFollowups.filter(f => f.response_id === response.id);
      
      // Skip if no follow-ups and no probing (nothing to summarize)
      if (relatedFollowups.length === 0 && (!response.investigator_probing || response.investigator_probing.length === 0)) {
        continue;
      }

      // Build context for AI
      let context = `Question: ${response.question_text}\n`;
      context += `Base Answer: Yes\n\n`;

      // Add follow-up details
      if (relatedFollowups.length > 0) {
        context += `Follow-up Details:\n`;
        relatedFollowups.forEach(fu => {
          if (fu.substance_name) {
            context += `- Substance: ${fu.substance_name}\n`;
          }
          const details = fu.additional_details || {};
          Object.entries(details).forEach(([key, value]) => {
            if (key !== 'investigator_probing') {
              context += `- ${key.replace(/_/g, ' ')}: ${value}\n`;
            }
          });
        });
        context += `\n`;
      }

      // Add AI probing exchanges
      if (response.investigator_probing && response.investigator_probing.length > 0) {
        context += `Investigator Probing:\n`;
        response.investigator_probing.forEach((exchange, idx) => {
          context += `Q${idx + 1}: ${exchange.probing_question}\n`;
          context += `A: ${exchange.candidate_response}\n\n`;
        });
      }

      // Generate summary via LLM
      const prompt = `You are assisting a background investigator reviewing a law enforcement applicant interview.

${context}

Create a brief, professional investigator summary (1-2 sentences) that captures:
- What was disclosed
- Key details (dates, circumstances, outcomes if mentioned)
- Any notable patterns or concerns

Keep it factual, concise, and suitable for a case file. Do not editorialize or make hiring recommendations.`;

      try {
        const summary = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: prompt
        });

        // Update Response with summary
        await base44.asServiceRole.entities.Response.update(response.id, {
          investigator_summary: summary,
          investigator_summary_last_generated_at: new Date().toISOString()
        });

        updatedCount++;
        console.log(`✅ Updated summary for response ${response.id}`);

      } catch (err) {
        console.error(`❌ Error generating summary for response ${response.id}:`, err);
        // Continue with other responses
      }
    }

    console.log(`✅ Updated ${updatedCount} summaries for session ${session_id}`);

    return Response.json({
      success: true,
      updatedCount: updatedCount
    });

  } catch (error) {
    console.error('❌ Error in generateSessionSummaries:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});