import React, { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { base44 } from "@/api/base44Client";

/**
 * Global AI Investigator Assist Card
 * Shows interview-wide AI summary with show more/less behavior
 */
export default function GlobalAIAssist({ responses, followups, session }) {
  const [aiSummary, setAiSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    generateGlobalSummary();
  }, [responses.length, followups.length]);

  const generateGlobalSummary = async () => {
    setIsLoading(true);
    
    try {
      const yesCount = responses.filter(r => r.answer === 'Yes').length;
      const noCount = responses.filter(r => r.answer === 'No').length;
      const hasFollowUps = followups.length > 0;
      const hasRedFlags = session.red_flags?.length > 0;

      // Simple heuristic for pattern pills
      const patterns = [];
      if (noCount > yesCount * 3) patterns.push("No Major Disclosures");
      if (responses.length > 0) patterns.push("Consistent Patterns");
      
      // Calculate avg time per question
      const sortedResponses = [...responses].sort((a, b) => 
        new Date(a.response_timestamp) - new Date(b.response_timestamp)
      );
      
      let avgTimePerQuestion = 0;
      if (sortedResponses.length > 1) {
        const timeDiffs = [];
        for (let i = 1; i < sortedResponses.length; i++) {
          const diff = (new Date(sortedResponses[i].response_timestamp) - new Date(sortedResponses[i - 1].response_timestamp)) / 1000;
          if (diff < 300) timeDiffs.push(diff); // Exclude outliers > 5 min
        }
        if (timeDiffs.length > 0) {
          avgTimePerQuestion = Math.round(timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length);
        }
      }
      
      if (avgTimePerQuestion > 0 && avgTimePerQuestion < 60) {
        patterns.push("Normal Response Timing");
      }

      // Determine overall risk level
      let overallRisk = "Low";
      if (hasRedFlags || (yesCount > responses.length * 0.3 && followups.length > 5)) {
        overallRisk = "High";
      } else if (yesCount > responses.length * 0.15 && followups.length > 0) {
        overallRisk = "Medium";
      }

      // Generate AI summary
      const prompt = `You are an AI assistant supporting a background investigator reviewing a completed interview.

Interview Statistics:
- Total Questions Answered: ${responses.length}
- Yes Responses: ${yesCount}
- No Responses: ${noCount}
- Follow-Up Packs Triggered: ${followups.length}
- Red Flags: ${session.red_flags?.length || 0}

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

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: prompt,
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

      setAiSummary({
        ...result,
        patterns
      });
    } catch (err) {
      console.error('Error generating global AI summary:', err);
      setAiSummary({
        mainSummary: "Summary generation unavailable. Manual review recommended.",
        keyObservations: [],
        suggestedVerification: [],
        riskLevel: "Low",
        patterns: ["Summary Unavailable"]
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getRiskColor = (riskLevel) => {
    if (riskLevel === "High") return "bg-red-500/20 text-red-300 border-red-500/30";
    if (riskLevel === "Medium") return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
    return "bg-green-500/20 text-green-300 border-green-500/30";
  };

  if (isLoading) {
    return (
      <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 mb-6">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Generating AI analysis...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!aiSummary) return null;

  return (
    <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 mb-6">
      <CardContent className="p-6">
        {/* Header Row */}
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xl">🧠</span>
            <h3 className="text-base font-bold text-white">AI Investigator Assist</h3>
          </div>
          <Badge className={cn("text-sm px-3 py-1", getRiskColor(aiSummary.riskLevel))}>
            AI Interview Signal: {aiSummary.riskLevel === "High" ? "High Concern" : 
              aiSummary.riskLevel === "Medium" ? "Moderate Concern" : "Low Concern"}
          </Badge>
        </div>

        {/* Pattern Pills */}
        {aiSummary.patterns && aiSummary.patterns.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {aiSummary.patterns.map((pattern, idx) => (
              <Badge
                key={idx}
                className="text-xs px-2 py-1 bg-green-500/20 text-green-300 border-green-500/30"
              >
                ✓ {pattern}
              </Badge>
            ))}
          </div>
        )}

        {/* Main Summary */}
        <div className="text-sm text-slate-300 leading-relaxed mb-3">
          {aiSummary.mainSummary}
        </div>

        {showMore && (
          <>
            {/* Key Observations */}
            {aiSummary.keyObservations && aiSummary.keyObservations.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-white mb-2">Key Observations:</h4>
                <ul className="space-y-1">
                  {aiSummary.keyObservations.map((obs, idx) => (
                    <li key={idx} className="text-sm text-slate-300 flex items-start gap-2">
                      <span className="text-blue-400 flex-shrink-0">•</span>
                      <span>{obs}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Suggested Verification */}
            {aiSummary.suggestedVerification && aiSummary.suggestedVerification.length > 0 && (
              <div className="bg-blue-950/30 border border-blue-800/50 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">💡</span>
                  <h4 className="text-sm font-semibold text-blue-300 uppercase tracking-wide">
                    Suggested Areas for Standard Verification
                  </h4>
                </div>
                <ul className="space-y-1">
                  {aiSummary.suggestedVerification.map((step, idx) => (
                    <li key={idx} className="text-sm text-slate-300 flex items-start gap-2">
                      <span className="text-blue-400 flex-shrink-0">→</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Investigator Authority Disclaimer */}
            <div className="bg-amber-950/30 border border-amber-800/50 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-amber-200 leading-relaxed">
                <strong className="text-amber-300">Investigator Authority:</strong> This AI summary is based solely on interview responses and does not verify truthfulness or completeness. Final judgment and verification remain the responsibility of the background investigator and agency.
              </div>
            </div>
          </>
        )}

        {/* Show More/Less Link */}
        <button
          onClick={() => setShowMore(!showMore)}
          className="text-sm text-blue-400 hover:text-blue-300 transition-colors mt-3"
        >
          {showMore ? "Show less" : "Show more"}
        </button>
      </CardContent>
    </Card>
  );
}