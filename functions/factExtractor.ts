/**
 * FACT EXTRACTOR - Universal V2 MVP
 * 
 * Extracts specific BI-relevant facts (anchors) from candidate answers.
 * Uses LLM to parse free-text answers and pull out structured data.
 * 
 * Input:
 * - packId: Which pack (determines what anchors to extract)
 * - candidateAnswer: The raw answer text
 * - previousAnchors: Already collected anchors (don't overwrite with weaker values)
 * 
 * Output:
 * - newAnchors: Newly extracted anchor values (keyed by anchor name)
 * - stillMissing: Which required anchors are still missing
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

// Pack schemas - defines what facts to extract for each pack
const PACK_SCHEMAS = {
  "PACK_PRIOR_LE_APPS_STANDARD": {
    required: ["agency_type", "position", "month_year", "outcome"],
    optional: ["agency_name", "location", "reason_not_hired"]
  },
  "PACK_LE_APPS": {
    required: ["agency_type", "position", "month_year", "outcome"],
    optional: ["agency_name", "location", "reason_not_hired"]
  },
  "PACK_DRIVING_COLLISION_STANDARD": {
    required: ["month_year", "location", "what_happened", "at_fault"],
    optional: ["injuries", "citations", "property_damage"]
  },
  "PACK_DRIVING_DUIDWI_STANDARD": {
    required: ["substance", "approx_level", "location", "month_year", "outcome"],
    optional: ["arrest_status", "court_outcome"]
  },
  "PACK_DOMESTIC_VIOLENCE_STANDARD": {
    required: ["relationship", "behavior_type", "month_year", "outcome"],
    optional: ["injury_or_damage", "location"]
  },
  "PACK_DRUG_USE_STANDARD": {
    required: ["substance_type", "first_use", "last_use", "frequency"],
    optional: ["total_uses", "consequences"]
  },
  "PACK_INTEGRITY_APPS": {
    required: ["agency", "issue_type", "month_year", "consequences"],
    optional: ["what_omitted", "reason_omitted"]
  },
  // Add more pack schemas as needed
  "_default": {
    required: ["month_year", "what_happened", "outcome"],
    optional: ["location"]
  }
};

/**
 * Get schema for a pack
 */
function getPackSchema(packId) {
  return PACK_SCHEMAS[packId] || PACK_SCHEMAS._default;
}

/**
 * Build LLM prompt for fact extraction
 */
function buildExtractionPrompt(packId, candidateAnswer, schema) {
  const allAnchors = [...schema.required, ...schema.optional];
  
  return `You are a FACT EXTRACTOR for background investigation questionnaires.

Your job: Extract ONLY specific, factual BI-relevant details from the candidate's answer.

CRITICAL RULES:
1. Extract ONLY the following fact anchors: ${allAnchors.join(', ')}
2. DO NOT infer, guess, or add narrative
3. Only extract facts explicitly stated in the answer
4. Return "not found" for anchors not mentioned
5. For dates: Extract month/year format (e.g., "June 2020", "early 2019", "around 2018")
6. For agencies: Extract agency type (city police, sheriff, state, federal) and name if mentioned
7. For outcomes: Extract result (hired, not selected, withdrew, disqualified, etc.)

Candidate's answer:
"${candidateAnswer}"

Extract the following anchors and return as JSON:
${allAnchors.map(a => `- ${a}: (extracted value or "not found")`).join('\n')}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { packId, candidateAnswer, previousAnchors = {} } = await req.json();
    
    if (!packId || !candidateAnswer) {
      return Response.json({ 
        error: 'Missing required fields: packId, candidateAnswer' 
      }, { status: 400 });
    }
    
    console.log(`[FACT_EXTRACTOR] Extracting for pack=${packId}`);
    
    const schema = getPackSchema(packId);
    const prompt = buildExtractionPrompt(packId, candidateAnswer, schema);
    
    // Define JSON schema for LLM response
    const responseSchema = {
      type: "object",
      properties: {
        extractedAnchors: {
          type: "object",
          description: "Map of anchor_name to extracted value"
        },
        stillMissing: {
          type: "array",
          items: { type: "string" },
          description: "List of required anchors not found in this answer"
        }
      }
    };
    
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: false,
        response_json_schema: responseSchema
      });
      
      const extractedAnchors = result?.extractedAnchors || {};
      const stillMissing = result?.stillMissing || [];
      
      // Merge with previous anchors (don't overwrite strong values with "not found")
      const newAnchors = { ...previousAnchors };
      for (const [key, value] of Object.entries(extractedAnchors)) {
        if (value && value !== "not found" && value.trim() !== "") {
          // Only update if we don't have this anchor yet, or new value is more specific
          if (!newAnchors[key] || newAnchors[key] === "not found") {
            newAnchors[key] = value;
          }
        }
      }
      
      console.log(`[FACT_EXTRACTOR] Extracted:`, {
        newKeys: Object.keys(extractedAnchors),
        stillMissing
      });
      
      return Response.json({
        success: true,
        newAnchors,
        extractedFromThisAnswer: extractedAnchors,
        stillMissing,
        candidateAnswer
      });
      
    } catch (llmError) {
      console.error('[FACT_EXTRACTOR] LLM error:', llmError.message);
      
      // Fallback: Simple keyword extraction
      const simpleExtraction = {};
      const answerLower = candidateAnswer.toLowerCase();
      
      // Extract year patterns
      const yearMatch = answerLower.match(/\b(19|20)\d{2}\b/);
      if (yearMatch && (schema.required.includes('month_year') || schema.required.includes('time_period'))) {
        simpleExtraction['month_year'] = yearMatch[0];
      }
      
      return Response.json({
        success: true,
        newAnchors: { ...previousAnchors, ...simpleExtraction },
        extractedFromThisAnswer: simpleExtraction,
        stillMissing: schema.required.filter(a => !previousAnchors[a] && !simpleExtraction[a]),
        candidateAnswer,
        fallback: true,
        fallbackReason: llmError.message
      });
    }
    
  } catch (error) {
    console.error('Fact Extractor error:', error);
    return Response.json({ 
      error: error.message,
      success: false
    }, { status: 500 });
  }
});