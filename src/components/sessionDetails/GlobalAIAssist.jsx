import React, { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { base44 } from "@/api/base44Client";

/**
 * Global AI Investigator Assist Card
 * Shows interview-wide AI summary with show more/less behavior
 * Now reads from stored DB summary instead of generating on load
 */
export default function GlobalAIAssist({ session }) {
  const [showMore, setShowMore] = useState(false);

  const getRiskColor = (riskLevel) => {
    if (riskLevel === "High") return "bg-red-500/20 text-red-300 border-red-500/30";
    if (riskLevel === "Medium") return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
    return "bg-green-500/20 text-green-300 border-green-500/30";
  };

  // Read from stored summary in session
  const aiSummary = session.global_ai_summary;

  if (!aiSummary) {
    return (
      <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 mb-6">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">🧠</span>
            <h3 className="text-base font-bold text-white">AI Investigator Assist</h3>
          </div>
          <p className="text-sm text-slate-500 italic">
            No AI summary available. Click 'Generate AI Summaries' to create one.
          </p>
        </CardContent>
      </Card>
    );
  }

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