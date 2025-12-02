import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, CheckCircle2, XCircle, AlertTriangle, Clock, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFactModelForCategory } from "../utils/factModelHelpers";
import { format } from "date-fns";

const FACT_LABELS = {
  // DUI/DWI
  date: "Date",
  location: "Location",
  BAC: "Blood Alcohol Content",
  impairment_indicators: "Impairment Indicators",
  legal_outcome: "Legal Outcome",
  prior_dui_history: "Prior DUI History",
  license_impact: "License Impact",
  criminal_charges: "Criminal Charges",
  
  // Domestic Violence
  relationship_to_victim: "Relationship to Victim",
  incident_description: "Incident Description",
  police_response: "Police Response",
  protective_order: "Protective Order",
  arrests: "Arrests",
  charges_filed: "Charges Filed",
  counseling_completed: "Counseling Completed",
  witnesses: "Witnesses",
  injuries: "Injuries",
  
  // Theft
  item_stolen: "Item Stolen",
  value: "Value",
  employer_or_owner: "Employer/Owner",
  restitution_paid: "Restitution Paid",
  employment_impact: "Employment Impact",
  accountability: "Accountability",
  
  // Drug Use
  substance_name: "Substance",
  first_use_date: "First Use Date",
  frequency: "Frequency",
  last_use_date: "Last Use Date",
  circumstances: "Circumstances",
  purchase_history: "Purchase History",
  social_vs_solo: "Social vs Solo",
  impact_on_life: "Impact on Life",
  addiction_treatment: "Addiction Treatment",
  legal_consequences: "Legal Consequences",
  multiple_substances: "Multiple Substances",
  
  // Financial
  issue_type: "Issue Type",
  amount: "Amount",
  current_status: "Current Status",
  creditor_name: "Creditor Name",
  payment_plan: "Payment Plan",
  bankruptcy_filed: "Bankruptcy Filed",
  wage_garnishment: "Wage Garnishment",
  foreclosure: "Foreclosure",
  
  // Employment
  employer: "Employer",
  position: "Position",
  separation_type: "Separation Type",
  reason: "Reason",
  notice_given: "Notice Given",
  reference_available: "Reference Available",
  termination_cause: "Termination Cause",
  misconduct_type: "Misconduct Type",
  multiple_terminations: "Multiple Terminations",
  
  // Generic
  property_damage: "Property Damage",
  passengers: "Passengers",
  vehicle_type: "Vehicle Type"
};

const CATEGORY_LABELS = {
  DUI: "Driving Under the Influence",
  DOMESTIC_VIOLENCE: "Domestic Violence",
  THEFT: "Theft / Dishonesty",
  DRUG_USE: "Drug Use",
  FINANCIAL: "Financial Issues",
  EMPLOYMENT: "Employment Issues",
  DRIVING: "Driving Violations",
  CRIMINAL: "Criminal Involvement",
  PRIOR_LE_APPS: "Prior LE Applications"
};

function IncidentCard({ incident, traces, loggingEnabled, loggingLevel, factModel }) {
  const [isExpanded, setIsExpanded] = useState(true);
  
  const factState = incident.fact_state || incident.factState || {};
  const facts = factState.facts || {};
  const completionStatus = factState.completionStatus || factState.completion_status || "unknown";
  const severity = factState.severity || "MODERATE";
  const probeCount = factState.probeCount || factState.probe_count || 0;
  const nonSubstantiveCount = factState.nonSubstantiveCount || factState.non_substantive_count || 0;
  const stopReason = factState.stopReason || factState.stop_reason || null;
  
  const categoryLabel = CATEGORY_LABELS[incident.categoryId || incident.category_id] || 
                        incident.categoryId || incident.category_id || "Unknown";
  
  // Get mandatory facts for this category
  const mandatoryFacts = factModel?.mandatoryFacts || [];
  const allFactKeys = Object.keys(facts);
  
  // Calculate missing mandatory facts
  const missingMandatory = mandatoryFacts.filter(key => {
    const value = facts[key];
    return value === null || value === undefined || value === "";
  });
  
  const incidentTraces = traces.filter(t => 
    t.incident_id === incident.incident_id || t.incident_id === incident.incidentId
  );
  
  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader 
        className="cursor-pointer hover:bg-slate-800/70 transition-colors pb-3"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base font-semibold text-white">
                {categoryLabel}
              </CardTitle>
              <Badge className={cn(
                "text-xs",
                severity === "STRICT" 
                  ? "bg-red-500/20 text-red-300 border-red-500/30"
                  : severity === "MODERATE"
                    ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
                    : "bg-blue-500/20 text-blue-300 border-blue-500/30"
              )}>
                {severity}
              </Badge>
              <Badge className={cn(
                "text-xs",
                completionStatus === "complete"
                  ? "bg-green-500/20 text-green-300 border-green-500/30"
                  : completionStatus === "blocked"
                    ? "bg-red-500/20 text-red-300 border-red-500/30"
                    : "bg-slate-500/20 text-slate-300 border-slate-500/30"
              )}>
                {completionStatus === "complete" ? (
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Complete
                  </span>
                ) : completionStatus === "blocked" ? (
                  <span className="flex items-center gap-1">
                    <XCircle className="w-3 h-3" />
                    Blocked
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Incomplete
                  </span>
                )}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span>ID: {incident.incident_id || incident.incidentId}</span>
              <span>•</span>
              <span>Probes: {probeCount}</span>
              {nonSubstantiveCount > 0 && (
                <>
                  <span>•</span>
                  <span>Non-substantive: {nonSubstantiveCount}</span>
                </>
              )}
              {stopReason && (
                <>
                  <span>•</span>
                  <span className="text-orange-400">{stopReason.replace(/_/g, ' ')}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="space-y-4 pt-0">
          {/* Facts Table */}
          <div>
            <h4 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-400" />
              Collected Facts
            </h4>
            {allFactKeys.length === 0 ? (
              <p className="text-xs text-slate-500">No facts collected yet</p>
            ) : (
              <div className="bg-slate-900/50 border border-slate-700 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-800/50">
                    <tr>
                      <th className="text-left px-3 py-2 text-slate-300 font-medium text-xs">Fact</th>
                      <th className="text-left px-3 py-2 text-slate-300 font-medium text-xs">Value</th>
                      <th className="text-center px-3 py-2 text-slate-300 font-medium text-xs">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {allFactKeys.map(key => {
                      const value = facts[key];
                      const isMandatory = mandatoryFacts.includes(key);
                      const isMissing = value === null || value === undefined || value === "";
                      const label = FACT_LABELS[key] || key.replace(/_/g, ' ');
                      
                      return (
                        <tr key={key} className="hover:bg-slate-800/30">
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "text-xs",
                                isMandatory ? "text-slate-200 font-medium" : "text-slate-400"
                              )}>
                                {label}
                              </span>
                              {isMandatory && (
                                <span className="text-[10px] text-red-400">*</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            {isMissing ? (
                              <span className="text-xs text-slate-500 italic">Not collected</span>
                            ) : (
                              <span className="text-xs text-slate-200">{value}</span>
                            )}
                          </td>
                          <td className="text-center px-3 py-2">
                            {isMissing ? (
                              isMandatory ? (
                                <XCircle className="w-4 h-4 text-red-400 inline" />
                              ) : (
                                <span className="text-xs text-slate-600">—</span>
                              )
                            ) : (
                              <CheckCircle2 className="w-4 h-4 text-green-400 inline" />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            
            {missingMandatory.length > 0 && (
              <div className="mt-2 flex items-start gap-2 p-2 bg-red-950/20 border border-red-800/50 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-red-200">
                  <span className="font-medium">Missing {missingMandatory.length} mandatory fact(s):</span>
                  <span className="ml-1 text-red-300">
                    {missingMandatory.map(k => FACT_LABELS[k] || k).join(", ")}
                  </span>
                </div>
              </div>
            )}
          </div>
          
          {/* Decision Trace Timeline */}
          {loggingEnabled && loggingLevel === "STANDARD" && incidentTraces.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-400" />
                Probing Timeline
              </h4>
              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3 space-y-2">
                {incidentTraces.map((trace, idx) => {
                  const timestamp = trace.timestamp 
                    ? format(new Date(trace.timestamp), "MMM d, h:mm:ss a")
                    : "Unknown time";
                  
                  return (
                    <div key={trace.id} className="flex items-start gap-3 text-xs">
                      <div className="w-16 text-slate-500 flex-shrink-0">{timestamp}</div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "font-medium",
                            trace.action === "STOP" ? "text-orange-400" : "text-cyan-400"
                          )}>
                            {trace.action}
                          </span>
                          {trace.stop_reason && (
                            <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/30 text-[10px]">
                              {trace.stop_reason.replace(/_/g, ' ')}
                            </Badge>
                          )}
                        </div>
                        <div className="text-slate-400">
                          Probes: {trace.probe_count ?? "—"} • Non-substantive: {trace.non_substantive_count ?? "—"}
                        </div>
                        {trace.missing_facts_before && trace.missing_facts_before.length > 0 && (
                          <div className="text-slate-500">
                            Missing before: {trace.missing_facts_before.map(k => FACT_LABELS[k] || k).join(", ")}
                          </div>
                        )}
                        {trace.next_question_preview && (
                          <div className="text-slate-400 italic">
                            Next: "{trace.next_question_preview.substring(0, 80)}..."
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          {loggingEnabled && loggingLevel === "MINIMAL" && (
            <div className="text-xs text-slate-500 italic">
              Decision trace logging is in minimal mode. Enable Standard logging in System Config to see full probe history.
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function IdeIncidentsPanel({ incidents, decisionTraces, systemConfig, factModels, setFactModels }) {
  useEffect(() => {
    // Load fact models for all unique categories
    const loadFactModels = async () => {
      const uniqueCategories = [...new Set(incidents.map(inc => inc.categoryId || inc.category_id))];
      const models = {};
      
      for (const categoryId of uniqueCategories) {
        if (!categoryId) continue;
        const model = await getFactModelForCategory(categoryId);
        if (model) {
          models[categoryId] = model;
        }
      }
      
      setFactModels(models);
    };
    
    if (incidents.length > 0) {
      loadFactModels();
    }
  }, [incidents]);
  
  const loggingConfig = systemConfig?.logging || {};
  const loggingEnabled = loggingConfig.decisionLoggingEnabled !== false;
  const loggingLevel = loggingConfig.decisionLoggingLevel || "STANDARD";
  
  const totalIncidents = incidents.length;
  const completeIncidents = incidents.filter(inc => {
    const fs = inc.fact_state || inc.factState || {};
    return fs.completionStatus === "complete" || fs.completion_status === "complete";
  }).length;
  
  return (
    <Card className="bg-[#0f1629] border-slate-800/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-cyan-400" />
            <CardTitle className="text-base font-semibold text-white">
              IDE v1 – Investigative Decision Engine
            </CardTitle>
            <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30 text-xs">
              Beta
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span>{totalIncidents} incident(s)</span>
            <span>•</span>
            <span className="text-green-400">{completeIncidents} complete</span>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          AI-driven fact collection and investigative probing for disclosed incidents. 
          Fact models define required information for each category.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {incidents.map(incident => {
          const categoryId = incident.categoryId || incident.category_id;
          const factModel = factModels[categoryId];
          
          return (
            <IncidentCard
              key={incident.incident_id || incident.incidentId}
              incident={incident}
              traces={decisionTraces}
              loggingEnabled={loggingEnabled}
              loggingLevel={loggingLevel}
              factModel={factModel}
            />
          );
        })}
      </CardContent>
    </Card>
  );
}