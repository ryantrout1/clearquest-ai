import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Clock, MapPin, User, Scale } from "lucide-react";

/**
 * V3 Incidents Tab - Structured view of V3 incidents with facts and summaries
 */
export default function V3IncidentsTab({ incidents, factState }) {
  if (!incidents || incidents.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <p>No V3 incidents recorded for this session.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {incidents.map((incident, idx) => (
        <V3IncidentCard 
          key={incident.incident_id || idx} 
          incident={incident} 
          incidentNumber={idx + 1}
          factState={factState?.[incident.incident_id]}
        />
      ))}
    </div>
  );
}

function V3IncidentCard({ incident, incidentNumber, factState }) {
  const facts = incident.facts || {};
  const incidentType = incident.incident_type || incident.category_id || "Incident";
  const categoryLabel = incident.category_id?.replace(/_/g, ' ') || "Unknown Category";
  
  // Determine completion status
  const requiredMissing = factState?.required_fields_missing || [];
  const requiredCollected = factState?.required_fields_collected || [];
  const isComplete = requiredMissing.length === 0 && requiredCollected.length > 0;
  const completionStatus = incident.fact_state?.completion_status || (isComplete ? "complete" : "incomplete");
  
  // Build title from facts
  const dateValue = facts.incident_date || facts.date || facts.month_year || "";
  const locationValue = facts.location || facts.incident_location || facts.city || "";
  const title = `${incidentType}${dateValue ? ` – ${dateValue}` : ""}${locationValue ? ` – ${locationValue}` : ""}`;
  
  // Risk and police info
  const riskScore = incident.risk_score;
  const policeInvolved = facts.police_involved || facts.arrest_status;
  
  return (
    <Card className="bg-slate-900/50 border-slate-700">
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-emerald-400">V3 Incident #{incidentNumber}</span>
              <Badge className={`text-[10px] ${
                completionStatus === "complete" 
                  ? "bg-green-500/20 text-green-300 border-green-500/30"
                  : completionStatus === "blocked"
                  ? "bg-red-500/20 text-red-300 border-red-500/30"
                  : "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
              }`}>
                {completionStatus === "complete" ? (
                  <><CheckCircle2 className="w-3 h-3 mr-1" /> Complete</>
                ) : completionStatus === "blocked" ? (
                  <><AlertTriangle className="w-3 h-3 mr-1" /> Blocked</>
                ) : (
                  <><Clock className="w-3 h-3 mr-1" /> Incomplete</>
                )}
              </Badge>
              {requiredMissing.length > 0 && (
                <Badge className="text-[10px] bg-amber-500/20 text-amber-300 border-amber-500/30">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  {requiredMissing.length} missing
                </Badge>
              )}
            </div>
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            <p className="text-xs text-slate-400">{categoryLabel}</p>
          </div>
          
          {/* Risk/Police subtitle */}
          <div className="text-right text-xs">
            {riskScore !== null && riskScore !== undefined && (
              <div className="flex items-center gap-1 text-slate-300">
                <Scale className="w-3 h-3" />
                Risk: {riskScore}
              </div>
            )}
            {policeInvolved && (
              <div className="flex items-center gap-1 text-slate-400 mt-1">
                <User className="w-3 h-3" />
                Police: {policeInvolved}
              </div>
            )}
          </div>
        </div>
        
        {/* Facts List */}
        <div className="bg-slate-800/50 rounded-lg p-3 mb-3">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Collected Facts
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {Object.entries(facts).length > 0 ? (
              Object.entries(facts).map(([key, value]) => {
                if (!value || value === "") return null;
                return (
                  <div key={key} className="flex items-start gap-2 text-xs">
                    <span className="text-slate-400 capitalize">
                      {key.replace(/_/g, ' ')}:
                    </span>
                    <span className="text-slate-200 font-medium">
                      {String(value)}
                    </span>
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-slate-500 italic">No facts collected yet</p>
            )}
          </div>
        </div>
        
        {/* Missing Fields Warning */}
        {requiredMissing.length > 0 && (
          <div className="bg-amber-950/30 border border-amber-800/50 rounded-lg p-2 mb-3">
            <div className="flex items-center gap-2 text-xs text-amber-300">
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              <span>Missing required fields: {requiredMissing.join(', ')}</span>
            </div>
          </div>
        )}
        
        {/* Narrative Summary */}
        {incident.narrative_summary && (
          <div className="bg-emerald-950/30 border border-emerald-800/50 rounded-lg p-3">
            <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wide mb-1">
              AI Narrative Summary
            </h4>
            <p className="text-sm text-slate-200 leading-relaxed">
              {incident.narrative_summary}
            </p>
          </div>
        )}
        
        {/* Probe Count */}
        <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
          <span>Probes: {incident.fact_state?.probe_count || 0}</span>
          <span>Non-substantive: {incident.fact_state?.non_substantive_count || 0}</span>
          {incident.fact_state?.stop_reason && (
            <span>Stop reason: {incident.fact_state.stop_reason}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}