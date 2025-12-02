import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Bug, Copy } from "lucide-react";
import { toast } from "sonner";

/**
 * V3 Debug Session Panel - Admin-only debug view for SessionDetails
 * Shows persisted incident/transcript data for verification.
 */
export default function V3DebugSessionPanel({ session, transcripts = [] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showJson, setShowJson] = useState(false);

  if (!session) return null;

  const incidents = session.incidents || [];
  const factState = session.fact_state || {};
  
  const aiCount = transcripts.filter(t => t.role === "AI").length;
  const candidateCount = transcripts.filter(t => t.role === "CANDIDATE").length;

  const copyJson = () => {
    const data = {
      session_id: session.id,
      ide_version: session.ide_version,
      incidents: incidents,
      fact_state: factState,
      transcript_count: transcripts.length
    };
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    toast.success("Debug data copied to clipboard");
  };

  return (
    <Card className="bg-amber-950/30 border-amber-700/40 mb-4">
      <CardHeader 
        className="py-2 px-4 cursor-pointer" 
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <CardTitle className="text-sm font-medium text-amber-300 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Bug className="w-4 h-4" />
            V3 Debug – Persisted Data
            <Badge className="bg-amber-600/30 text-amber-200 text-xs">Admin Only</Badge>
          </span>
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </CardTitle>
      </CardHeader>

      {isExpanded && (
        <CardContent className="py-3 px-4 text-sm space-y-3">
          <div className="flex gap-2 mb-3">
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={() => setShowJson(!showJson)}
              className="h-7 px-3 text-xs text-amber-300 hover:bg-amber-800/30"
            >
              {showJson ? 'Hide' : 'View'} Raw JSON
            </Button>
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={copyJson}
              className="h-7 px-3 text-xs text-amber-300 hover:bg-amber-800/30"
            >
              <Copy className="w-3 h-3 mr-1" />
              Copy JSON
            </Button>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-4 text-amber-200">
            <div className="bg-amber-950/40 rounded p-2">
              <div className="text-amber-400 text-xs mb-1">Incidents</div>
              <div className="text-lg font-semibold">{incidents.length}</div>
            </div>
            <div className="bg-amber-950/40 rounded p-2">
              <div className="text-amber-400 text-xs mb-1">Transcripts</div>
              <div className="text-lg font-semibold">{transcripts.length}</div>
            </div>
            <div className="bg-amber-950/40 rounded p-2">
              <div className="text-amber-400 text-xs mb-1">AI / User</div>
              <div className="text-lg font-semibold">{aiCount} / {candidateCount}</div>
            </div>
          </div>

          {/* Incidents Detail */}
          {incidents.length > 0 && (
            <div className="border-t border-amber-700/30 pt-3">
              <div className="text-amber-400 text-xs mb-2 font-medium">Incidents:</div>
              <div className="space-y-2">
                {incidents.map((inc, idx) => {
                  const incState = factState[inc.incident_id] || {};
                  const collectedCount = incState.required_fields_collected?.length || 0;
                  const missingCount = incState.required_fields_missing?.length || 0;
                  
                  return (
                    <div key={inc.incident_id || idx} className="bg-amber-950/30 rounded p-2 text-xs">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-amber-300 font-mono">{inc.incident_id?.slice(-12) || `Incident ${idx + 1}`}</span>
                        {inc.risk_score && (
                          <Badge className="bg-red-500/20 text-red-300 text-[10px]">
                            Risk: {inc.risk_score}
                          </Badge>
                        )}
                      </div>
                      <div className="text-amber-200/80 space-y-0.5">
                        <div>Category: {inc.category_id}</div>
                        <div>Type: {inc.incident_type || 'N/A'}</div>
                        <div>Facts: {Object.keys(inc.facts || {}).filter(k => inc.facts[k]).length} populated</div>
                        <div className="flex gap-2">
                          <span className="text-emerald-400">Collected: {collectedCount}</span>
                          <span className="text-red-400">Missing: {missingCount}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Raw JSON View */}
          {showJson && (
            <div className="border-t border-amber-700/30 pt-3">
              <div className="text-amber-400 text-xs mb-2 font-medium">Raw Data:</div>
              <pre className="text-[10px] text-amber-300/70 bg-amber-950/50 p-3 rounded overflow-auto max-h-48">
                {JSON.stringify({
                  incidents: incidents.slice(0, 3),
                  fact_state: factState
                }, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}