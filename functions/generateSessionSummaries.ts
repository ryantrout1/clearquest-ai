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

    console.log(`✅ Updated ${updatedCount} question summaries for session ${session_id}`);

    // Generate global AI summary
    console.log('🌐 Generating global AI summary...');
    const yesCount = responses.filter(r => r.answer === 'Yes').length;
    const noCount = responses.filter(r => r.answer === 'No').length;

    // Compute pattern pills
    const patterns = [];
    if (noCount > yesCount * 3) patterns.push("No Major Disclosures");
    if (responses.length > 0) patterns.push("Consistent Patterns");
    
    const sortedResponses = [...responses].sort((a, b) => 
      new Date(a.response_timestamp) - new Date(b.response_timestamp)
    );
    
    let avgTimePerQuestion = 0;
    if (sortedResponses.length > 1) {
      const timeDiffs = [];
      for (let i = 1; i < sortedResponses.length; i++) {
        const diff = (new Date(sortedResponses[i].response_timestamp) - new Date(sortedResponses[i - 1].response_timestamp)) / 1000;
        if (diff < 300) timeDiffs.push(diff);
      }
      if (timeDiffs.length > 0) {
        avgTimePerQuestion = Math.round(timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length);
      }
    }
    
    if (avgTimePerQuestion > 0 && avgTimePerQuestion < 60) {
      patterns.push("Normal Response Timing");
    }

    const globalPrompt = `You are an AI assistant supporting a background investigator reviewing a completed interview.

Interview Statistics:
- Total Questions Answered: ${responses.length}
- Yes Responses: ${yesCount}
- No Responses: ${noCount}
- Follow-Up Packs Triggered: ${allFollowups.length}

Generate a concise interview-wide summary for investigators that includes:

1. Main overview paragraph (2-3 sentences): Overall pattern of disclosures, response consistency, and timing
2. Key Observations (3-5 bullet points): Specific notable points across all sections
3. Suggested verification areas (3-4 bullet points): Standard verification steps the investigator should take

Format your response as JSON:
{
  "mainSummary": "2-3 sentence overview paragraph",
  "keyObservations": ["observation 1", "observation 2", "observation 3"],
  "suggestedVerification": ["verification step 1", "verification step 2", "verification step 3"],
  "riskLevel": "Low|Medium|High"
}`;

    const globalSummary = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: globalPrompt,
      response_json_schema: {
        type: "object",
        properties: {
          mainSummary: { type: "string" },
          keyObservations: { type: "array", items: { type: "string" } },
          suggestedVerification: { type: "array", items: { type: "string" } },
          riskLevel: { type: "string", enum: ["Low", "Medium", "High"] }
        },
        required: ["mainSummary", "keyObservations", "suggestedVerification", "riskLevel"]
      }
    });

    globalSummary.patterns = patterns;

    // Generate section-level summaries
    console.log('📊 Generating section-level AI summaries...');
    const sectionSummaries = {};
    
    // Group responses by section
    const responsesBySection = {};
    responses.forEach(r => {
      const section = r.category || r.section_name || 'Other';
      if (!responsesBySection[section]) {
        responsesBySection[section] = [];
      }
      responsesBySection[section].push(r);
    });

    for (const [sectionName, sectionResponses] of Object.entries(responsesBySection)) {
      const sectionYesCount = sectionResponses.filter(r => r.answer === 'Yes').length;
      
      if (sectionYesCount === 0) {
        // No Yes answers - simple summary
        sectionSummaries[sectionName] = {
          text: `No disclosures in this section (${sectionResponses.length} questions answered, all "No").`,
          riskLevel: "Low",
          concerns: []
        };
        continue;
      }

      const sectionFollowups = allFollowups.filter(fu => {
        return sectionResponses.some(r => r.id === fu.response_id);
      });

      const sectionPrompt = `You are an AI assistant supporting a background investigator.

Section: ${sectionName}
Questions Answered: ${sectionResponses.length}
Yes Responses: ${sectionYesCount}
Follow-Ups: ${sectionFollowups.length}

Generate a brief section summary (2-3 sentences) that covers:
- What was disclosed in this section
- Any patterns or concerns
- Risk level: Low, Medium, or High

Format as JSON:
{
  "text": "2-3 sentence summary",
  "riskLevel": "Low|Medium|High",
  "concerns": ["concern 1", "concern 2"] (optional array, can be empty)
}`;

      try {
        const sectionSummary = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: sectionPrompt,
          response_json_schema: {
            type: "object",
            properties: {
              text: { type: "string" },
              riskLevel: { type: "string", enum: ["Low", "Medium", "High"] },
              concerns: { type: "array", items: { type: "string" } }
            },
            required: ["text", "riskLevel"]
          }
        });

        sectionSummaries[sectionName] = sectionSummary;
      } catch (err) {
        console.error(`Error generating summary for section ${sectionName}:`, err);
      }
    }

    // Update session with all AI summaries
    await base44.asServiceRole.entities.InterviewSession.update(session_id, {
      global_ai_summary: globalSummary,
      section_ai_summaries: sectionSummaries,
      ai_summaries_last_generated_at: new Date().toISOString()
    });

    console.log(`✅ Saved global and ${Object.keys(sectionSummaries).length} section summaries`);

    return Response.json({
      success: true,
      updatedCount: updatedCount,
      globalSummaryGenerated: true,
      sectionSummariesGenerated: Object.keys(sectionSummaries).length
    });

  } catch (error) {
    console.error('❌ Error in generateSessionSummaries:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});