import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Bug, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";

/**
 * V3 Debug Panel - Admin-only debug view for CandidateInterview
 * Shows live, read-only snapshots of session/incident state during V3 probing.
 */
export default function V3DebugPanel({ sessionId, incidentId }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSnapshot = async () => {
    if (!sessionId) return;
    setIsLoading(true);
    try {
      const session = await base44.entities.InterviewSession.get(sessionId);
      const transcripts = await base44.entities.InterviewTranscript.filter({
        session_id: sessionId
      });

      const aiCount = transcripts.filter(t => t.role === "AI").length;
      const candidateCount = transcripts.filter(t => t.role === "CANDIDATE").length;

      const activeIncident = incidentId
        ? (session.incidents || []).find(i => i.incident_id === incidentId)
        : (session.incidents || [])[0];

      const data = {
        sessionId: session.id,
        ide_version: session.ide_version,
        incidentsCount: (session.incidents || []).length,
        activeIncident: activeIncident ? {
          incident_id: activeIncident.incident_id,
          category_id: activeIncident.category_id,
          incident_type: activeIncident.incident_type,
          factsPopulated: Object.keys(activeIncident.facts || {}).filter(k => activeIncident.facts[k]),
          probeCount: activeIncident.fact_state?.probe_count || 0
        } : null,
        transcript: {
          total: transcripts.length,
          ai: aiCount,
          candidate: candidateCount
        },
        rawIncidents: session.incidents,
        rawFactState: session.fact_state
      };

      setSnapshot(data);

      // Console logging for admins
      console.log("V3 DEBUG: Session snapshot", {
        sessionId: session.id,
        incidentsCount: data.incidentsCount,
        transcriptTotal: data.transcript.total
      });
      if (activeIncident) {
        console.log("V3 DEBUG: Active incident", activeIncident);
      }
    } catch (err) {
      console.error("V3 DEBUG: Failed to fetch snapshot", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isExpanded) {
      fetchSnapshot();
    }
  }, [isExpanded, sessionId, incidentId]);

  const copyJson = () => {
    if (snapshot) {
      navigator.clipboard.writeText(JSON.stringify({
        incidents: snapshot.rawIncidents?.slice(0, 2),
        fact_state: snapshot.rawFactState
      }, null, 2));
      toast.success("Debug JSON copied to clipboard");
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      <Card className="bg-amber-950/90 border-amber-700/50 backdrop-blur-sm shadow-lg">
        <CardHeader className="py-2 px-3 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
          <CardTitle className="text-xs font-medium text-amber-300 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Bug className="w-3 h-3" />
              V3 Debug – Session Snapshot
              <Badge className="bg-amber-600/30 text-amber-200 text-[10px] px-1">Admin</Badge>
            </span>
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </CardTitle>
        </CardHeader>

        {isExpanded && (
          <CardContent className="py-2 px-3 text-xs space-y-2">
            <div className="flex gap-2 mb-2">
              <Button size="sm" variant="ghost" onClick={fetchSnapshot} disabled={isLoading}
                className="h-6 px-2 text-[10px] text-amber-300 hover:bg-amber-800/50">
                <RefreshCw className={`w-3 h-3 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowJson(!showJson)}
                className="h-6 px-2 text-[10px] text-amber-300 hover:bg-amber-800/50">
                {showJson ? 'Hide' : 'View'} JSON
              </Button>
              <Button size="sm" variant="ghost" onClick={copyJson}
                className="h-6 px-2 text-[10px] text-amber-300 hover:bg-amber-800/50">
                <Copy className="w-3 h-3 mr-1" />
                Copy
              </Button>
            </div>

            {snapshot ? (
              <div className="space-y-2 text-amber-200">
                <div className="flex justify-between">
                  <span className="text-amber-400">Session ID:</span>
                  <span className="font-mono text-[10px]">{snapshot.sessionId?.slice(-8)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-amber-400">IDE Version:</span>
                  <span>{snapshot.ide_version || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-amber-400">Incidents:</span>
                  <span>{snapshot.incidentsCount}</span>
                </div>

                {snapshot.activeIncident && (
                  <div className="border-t border-amber-700/50 pt-2 mt-2">
                    <div className="text-amber-400 mb-1">Active Incident:</div>
                    <div className="pl-2 space-y-1">
                      <div className="flex justify-between">
                        <span>Category:</span>
                        <span>{snapshot.activeIncident.category_id}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Probes:</span>
                        <span>{snapshot.activeIncident.probeCount}</span>
                      </div>
                      <div>
                        <span className="text-amber-400">Facts ({snapshot.activeIncident.factsPopulated.length}):</span>
                        <div className="text-[10px] text-amber-300/70 mt-1">
                          {snapshot.activeIncident.factsPopulated.join(', ') || 'None yet'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="border-t border-amber-700/50 pt-2 mt-2">
                  <div className="text-amber-400 mb-1">Transcript:</div>
                  <div className="flex gap-4 pl-2">
                    <span>Total: {snapshot.transcript.total}</span>
                    <span>AI: {snapshot.transcript.ai}</span>
                    <span>User: {snapshot.transcript.candidate}</span>
                  </div>
                </div>

                {showJson && (
                  <div className="border-t border-amber-700/50 pt-2 mt-2">
                    <pre className="text-[9px] text-amber-300/80 bg-amber-950/50 p-2 rounded overflow-auto max-h-32">
                      {JSON.stringify({
                        incidents: snapshot.rawIncidents?.slice(0, 1),
                        fact_state: snapshot.rawFactState
                      }, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-amber-400 text-center py-2">
                {isLoading ? 'Loading...' : 'Click Refresh to load'}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}