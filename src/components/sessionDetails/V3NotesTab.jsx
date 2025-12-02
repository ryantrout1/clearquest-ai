import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Save, Loader2, FileText, AlertTriangle, CheckCircle2, Download } from "lucide-react";
import { toast } from "sonner";

/**
 * V3 BI Notes Tab - Investigator notes and summary for V3 sessions
 */
export default function V3NotesTab({ session, incidents, onSessionUpdate }) {
  const [notes, setNotes] = useState("");
  const [observations, setObservations] = useState("");
  const [conclusion, setConclusion] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Load existing notes from session metadata
  useEffect(() => {
    if (session?.metadata?.bi_notes) {
      setNotes(session.metadata.bi_notes.summary || "");
      setObservations(session.metadata.bi_notes.observations || "");
      setConclusion(session.metadata.bi_notes.conclusion || "");
    }
  }, [session]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updatedMetadata = {
        ...(session.metadata || {}),
        bi_notes: {
          summary: notes,
          observations: observations,
          conclusion: conclusion,
          last_updated: new Date().toISOString()
        }
      };

      await base44.entities.InterviewSession.update(session.id, {
        metadata: updatedMetadata
      });

      setHasChanges(false);
      toast.success("BI Notes saved successfully");
      
      if (onSessionUpdate) {
        onSessionUpdate({ ...session, metadata: updatedMetadata });
      }
    } catch (err) {
      console.error("[V3 NOTES] Error saving notes:", err);
      toast.error("Failed to save notes");
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (setter) => (e) => {
    setter(e.target.value);
    setHasChanges(true);
  };

  // Build incident summary list
  const incidentSummaries = (incidents || []).map((inc, idx) => {
    const categoryLabel = inc.category_id?.replace(/_/g, ' ') || "Unknown";
    const dateValue = inc.facts?.incident_date || inc.facts?.date || "";
    const status = inc.fact_state?.completion_status || "incomplete";
    return {
      id: inc.incident_id,
      number: idx + 1,
      category: categoryLabel,
      date: dateValue,
      status
    };
  });

  return (
    <div className="space-y-6">
      {/* Incident Quick Links */}
      <Card className="bg-slate-900/50 border-slate-700">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-400" />
            V3 Incidents Overview
          </h3>
          
          {incidentSummaries.length > 0 ? (
            <div className="space-y-2">
              {incidentSummaries.map((inc) => (
                <div 
                  key={inc.id}
                  className="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg hover:bg-slate-800/70 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-emerald-400">#{inc.number}</span>
                    <span className="text-sm text-slate-200">{inc.category}</span>
                    {inc.date && (
                      <span className="text-xs text-slate-400">({inc.date})</span>
                    )}
                  </div>
                  <Badge className={`text-[10px] ${
                    inc.status === "complete"
                      ? "bg-green-500/20 text-green-300 border-green-500/30"
                      : inc.status === "blocked"
                      ? "bg-red-500/20 text-red-300 border-red-500/30"
                      : "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
                  }`}>
                    {inc.status === "complete" ? (
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                    ) : (
                      <AlertTriangle className="w-3 h-3 mr-1" />
                    )}
                    {inc.status}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic">No V3 incidents recorded</p>
          )}
        </CardContent>
      </Card>

      {/* Overall Summary */}
      <Card className="bg-slate-900/50 border-slate-700">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-2">
            Overall Background Summary
          </h3>
          <p className="text-xs text-slate-500 mb-3">
            Summarize the candidate's background based on the interview findings.
          </p>
          <Textarea
            value={notes}
            onChange={handleChange(setNotes)}
            placeholder="Enter overall summary of the candidate's background..."
            className="bg-slate-800 border-slate-600 text-white min-h-[120px] text-sm"
          />
        </CardContent>
      </Card>

      {/* Observations */}
      <Card className="bg-slate-900/50 border-slate-700">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-2">
            Observations About Incidents
          </h3>
          <p className="text-xs text-slate-500 mb-3">
            Note any patterns, concerns, or notable findings from the disclosed incidents.
          </p>
          <Textarea
            value={observations}
            onChange={handleChange(setObservations)}
            placeholder="Enter observations about the incidents..."
            className="bg-slate-800 border-slate-600 text-white min-h-[100px] text-sm"
          />
        </CardContent>
      </Card>

      {/* Suitability Conclusion */}
      <Card className="bg-slate-900/50 border-slate-700">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-2">
            Suitability Conclusion
          </h3>
          <p className="text-xs text-slate-500 mb-3">
            Your professional assessment of the candidate's suitability.
          </p>
          <Textarea
            value={conclusion}
            onChange={handleChange(setConclusion)}
            placeholder="Enter suitability conclusion..."
            className="bg-slate-800 border-slate-600 text-white min-h-[80px] text-sm"
          />
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">
          {session?.metadata?.bi_notes?.last_updated && (
            <span>Last saved: {new Date(session.metadata.bi_notes.last_updated).toLocaleString()}</span>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700"
            disabled
          >
            <Download className="w-4 h-4 mr-2" />
            Export Report
          </Button>
          
          <Button
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Notes
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}