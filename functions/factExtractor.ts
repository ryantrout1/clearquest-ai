/**
 * FACT EXTRACTOR
 * Extracts BI-relevant factual anchors from candidate answers.
 * No inference, no guessing, no narrative expansion.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { candidateAnswer, packId, fieldKey, expectedAnchors } = await req.json();

    if (!candidateAnswer || !expectedAnchors || !Array.isArray(expectedAnchors)) {
      return Response.json({ 
        error: 'Missing required fields: candidateAnswer, expectedAnchors' 
      }, { status: 400 });
    }

    // Use LLM to extract facts
    const extractionPrompt = `You are a FACT EXTRACTOR for a law-enforcement background investigation system.

Your job:
Extract ONLY factual BI-relevant details from the candidate's answer.
Do NOT generate stories. Do NOT guess. Do NOT fill in missing details.

Given:
- candidateAnswer: "${candidateAnswer}"
- packId: ${packId || 'unknown'}
- fieldKey: ${fieldKey || 'unknown'}
- expectedAnchors: ${JSON.stringify(expectedAnchors)}

Rules:
1. Look only at the candidate's words.
2. Extract BI facts only if clearly stated:
   - agency / organization
   - month and/or year
   - location (city/state/agency)
   - position / role
   - outcome / disposition
   - who else was involved
   - frequency / count
   - value or amounts
   - any anchors listed in expectedAnchors
3. Leave anchors blank if the answer didn't provide them.
4. Never infer or assume. Never expand with narratives.
5. For dates, accept partial info (e.g., "2021" alone is valid for month_year).
6. For agency_type, accept general terms like "sheriff's office", "city police", "state agency", "federal agency".

Return JSON with these exact keys:
- collectedAnchors: object with anchor names as keys and extracted values
- stillMissingAnchors: array of anchor names not provided in the answer`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: extractionPrompt,
      response_json_schema: {
        type: "object",
        properties: {
          collectedAnchors: {
            type: "object",
            description: "Anchors extracted from the answer with their values"
          },
          stillMissingAnchors: {
            type: "array",
            items: { type: "string" },
            description: "Anchors not provided in the answer"
          }
        },
        required: ["collectedAnchors", "stillMissingAnchors"]
      }
    });

    return Response.json({
      success: true,
      collectedAnchors: result.collectedAnchors || {},
      stillMissingAnchors: result.stillMissingAnchors || expectedAnchors,
      rawAnswer: candidateAnswer
    });

  } catch (error) {
    console.error('Fact Extractor error:', error);
    return Response.json({ 
      error: error.message,
      success: false,
      collectedAnchors: {},
      stillMissingAnchors: []
    }, { status: 500 });
  }
});