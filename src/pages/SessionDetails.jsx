import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, FileText, AlertTriangle, Download, Loader2,
  Search, Clock, Filter, ChevronDown, ChevronRight
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function SessionDetails() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('id');

  const [session, setSession] = useState(null);
  const [interactionLogs, setInteractionLogs] = useState([]);
  const [sectionMetrics, setSectionMetrics] = useState([]);
  const [department, setDepartment] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filterSection, setFilterSection] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [collapsedSections, setCollapsedSections] = useState(new Set());

  useEffect(() => {
    if (!sessionId) {
      navigate(createPageUrl("InterviewDashboard"));
      return;
    }
    loadSessionData();
  }, [sessionId]);

  const loadSessionData = async () => {
    setIsLoading(true);
    try {
      console.log("🔍 Loading session data (deterministic only)...");
      
      // ONLY 3 QUERIES TOTAL
      const [sessionData, logsData, metricsData] = await Promise.all([
        base44.entities.InterviewSession.get(sessionId),
        base44.entities.InteractionLog.filter({ session_id: sessionId }),
        base44.entities.SectionMetrics.filter({ session_id: sessionId })
      ]);

      setSession(sessionData);
      
      // Sort logs by order_index (strict ordering)
      const sortedLogs = logsData.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
      setInteractionLogs(sortedLogs);
      
      setSectionMetrics(metricsData);

      // Load department
      if (sessionData.department_code) {
        const depts = await base44.entities.Department.filter({
          department_code: sessionData.department_code
        });
        if (depts.length > 0) {
          setDepartment(depts[0]);
        }
      }

      console.log(`✅ Loaded ${sortedLogs.length} interaction logs, ${metricsData.length} section metrics`);
      setIsLoading(false);
    } catch (err) {
      console.error("❌ Error loading session:", err);
      toast.error("Failed to load session data");
      setIsLoading(false);
    }
  };

  // Extract unique sections from logs
  const sections = [...new Set(interactionLogs
    .filter(log => log.type === 'section_header')
    .map(log => log.section_id)
  )].filter(Boolean);

  // Filter logs based on search and filters
  const filteredLogs = interactionLogs.filter(log => {
    if (!log.content) return false; // Skip empty logs
    
    const matchesSearch = !searchTerm || 
      log.content.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesSection = filterSection === "all" || log.section_id === filterSection;
    
    const matchesType = filterType === "all" || log.type === filterType;
    
    return matchesSearch && matchesSection && matchesType;
  });

  const toggleSection = (sectionId) => {
    const newCollapsed = new Set(collapsedSections);
    if (newCollapsed.has(sectionId)) {
      newCollapsed.delete(sectionId);
    } else {
      newCollapsed.add(sectionId);
    }
    setCollapsedSections(newCollapsed);
  };

  const formatTime = (seconds) => {
    if (!seconds || seconds === 0) return "0m";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-blue-400 animate-spin mx-auto" />
          <p className="text-slate-300">Loading session data...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <p className="text-slate-300">Session not found</p>
          <Link to={createPageUrl("InterviewDashboard")}>
            <Button className="bg-blue-600 hover:bg-blue-700">Back to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  const statusConfig = {
    in_progress: { label: "Active", color: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
    idle: { label: "Idle", color: "bg-slate-500/20 text-slate-300 border-slate-500/30" },
    completed: { label: "Completed", color: "bg-green-500/20 text-green-300 border-green-500/30" },
    paused: { label: "Paused", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
    abandoned: { label: "Abandoned", color: "bg-red-500/20 text-red-300 border-red-500/30" },
    review_needed: { label: "Review Needed", color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        <Link to={createPageUrl("InterviewDashboard")}>
          <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-slate-700 mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>

        {/* Header Summary Block */}
        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 mb-6">
          <CardContent className="p-6">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-6">
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-white mb-2">
                  {department?.department_name || session.department_code}
                </h1>
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
                  <span>Session: <span className="font-mono text-slate-300">{session.session_code}</span></span>
                  <span>•</span>
                  <span>File: <span className="font-mono text-slate-300">{session.file_number}</span></span>
                  <span>•</span>
                  <Badge className={cn("text-xs", statusConfig[session.status]?.color)}>
                    {statusConfig[session.status]?.label || session.status}
                  </Badge>
                </div>
              </div>
              
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between gap-8">
                  <span className="text-slate-400">Started:</span>
                  <span className="text-white">{session.started_at ? format(new Date(session.started_at), 'MMM d, yyyy h:mm a') : 'N/A'}</span>
                </div>
                {session.completed_at && (
                  <div className="flex justify-between gap-8">
                    <span className="text-slate-400">Completed:</span>
                    <span className="text-white">{format(new Date(session.completed_at), 'MMM d, yyyy h:mm a')}</span>
                  </div>
                )}
                <div className="flex justify-between gap-8">
                  <span className="text-slate-400">Elapsed Time:</span>
                  <span className="text-white">{formatTime(session.elapsed_seconds || 0)}</span>
                </div>
                <div className="flex justify-between gap-8">
                  <span className="text-slate-400">Active Time:</span>
                  <span className="text-white font-semibold">{formatTime(session.active_seconds || 0)}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-4 border-t border-slate-700">
              <MetricBox label="Questions" value={session.questions_answered_count || 0} />
              <MetricBox label="Follow-Ups" value={session.followups_count || 0} />
              <MetricBox label="AI Probes" value={session.ai_probes_count || 0} />
              <MetricBox label="Red Flags" value={session.red_flags_count || 0} color="red" />
              <MetricBox label="Progress" value={`${session.completion_percent || 0}%`} />
            </div>
          </CardContent>
        </Card>

        {/* Section Analytics Panel */}
        {sectionMetrics.length > 0 && (
          <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 mb-6">
            <CardContent className="p-6">
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-400" />
                Section Analytics
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400">
                      <th className="text-left py-2 pr-4">Section</th>
                      <th className="text-center py-2 px-2">Time</th>
                      <th className="text-center py-2 px-2">Questions</th>
                      <th className="text-center py-2 px-2">Follow-Ups</th>
                      <th className="text-center py-2 px-2">AI Probes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectionMetrics.map((metric, idx) => (
                      <tr key={idx} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                        <td className="py-2 pr-4 text-white">{metric.section_id}</td>
                        <td className="py-2 px-2 text-center text-slate-300">{formatTime(metric.active_seconds)}</td>
                        <td className="py-2 px-2 text-center text-slate-300">{metric.questions_answered || 0}</td>
                        <td className="py-2 px-2 text-center text-slate-300">{metric.followups_triggered || 0}</td>
                        <td className="py-2 px-2 text-center text-slate-300">{metric.ai_probes_triggered || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Investigator Tools */}
        <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-sm border border-slate-700 rounded-lg p-4 mb-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
            <div className="lg:col-span-4 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                placeholder="Search transcript..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-slate-800 border-slate-600 text-white h-10"
              />
            </div>

            <div className="lg:col-span-3">
              <Select value={filterSection} onValueChange={setFilterSection}>
                <SelectTrigger className="bg-slate-800 border-slate-600 text-white h-10">
                  <SelectValue placeholder="All Sections" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                  <SelectItem value="all" className="text-white">All Sections</SelectItem>
                  {sections.map(section => (
                    <SelectItem key={section} value={section} className="text-white">
                      {section}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="lg:col-span-3">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="bg-slate-800 border-slate-600 text-white h-10">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                  <SelectItem value="all" className="text-white">All Types</SelectItem>
                  <SelectItem value="question_main" className="text-white">Main Questions</SelectItem>
                  <SelectItem value="question_followup" className="text-white">Follow-Ups</SelectItem>
                  <SelectItem value="question_ai_probe" className="text-white">AI Probes</SelectItem>
                  <SelectItem value="candidate_answer" className="text-white">Answers</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="lg:col-span-2">
              <Button
                onClick={() => toast.info("Export coming soon")}
                size="sm"
                className="w-full bg-blue-600 hover:bg-blue-700 h-10"
              >
                <Download className="w-4 h-4 mr-2" />
                Export PDF
              </Button>
            </div>
          </div>

          {searchTerm && (
            <div className="mt-3 text-sm text-slate-400">
              Found {filteredLogs.length} of {interactionLogs.filter(l => l.content).length} items
            </div>
          )}
        </div>

        {/* Red Flags Alert */}
        {session.red_flags_count > 0 && (
          <Card className="bg-red-950/20 border-red-800/50 mb-6">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-red-400 font-semibold mb-2">
                <AlertTriangle className="w-5 h-5" />
                Red Flags Identified ({session.red_flags_count})
              </div>
              <p className="text-sm text-red-300">This session contains flagged responses requiring investigator review.</p>
            </CardContent>
          </Card>
        )}

        {/* Full Forensic Timeline */}
        {interactionLogs.length === 0 ? (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-12 text-center">
              <FileText className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">No interaction logs found</p>
            </CardContent>
          </Card>
        ) : (
          <ForensicTimeline 
            logs={filteredLogs}
            collapsedSections={collapsedSections}
            toggleSection={toggleSection}
          />
        )}
      </div>
    </div>
  );
}

function MetricBox({ label, value, color = "blue" }) {
  const colorClass = color === "red" ? "text-red-400" : "text-blue-400";
  return (
    <div className="text-center">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className={cn("text-2xl font-bold", colorClass)}>{value}</p>
    </div>
  );
}

function ForensicTimeline({ logs, collapsedSections, toggleSection }) {
  let currentSection = null;
  const timeline = [];

  logs.forEach((log, idx) => {
    if (log.type === 'section_header') {
      currentSection = log.section_id;
      timeline.push({ type: 'section', log, idx });
    } else {
      timeline.push({ type: 'message', log, idx, section: currentSection });
    }
  });

  return (
    <div className="space-y-1">
      {timeline.map(item => {
        if (item.type === 'section') {
          const isSectionCollapsed = collapsedSections.has(item.log.section_id);
          return (
            <div key={item.idx} className="sticky top-44 z-10">
              <button
                onClick={() => toggleSection(item.log.section_id)}
                className="w-full bg-slate-800 border-l-4 border-blue-500 py-3 px-4 flex items-center justify-between hover:bg-slate-700/80 transition-colors"
              >
                <h3 className="text-sm font-bold text-white uppercase tracking-wide">
                  {item.log.content}
                </h3>
                {isSectionCollapsed ? (
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-slate-400" />
                )}
              </button>
            </div>
          );
        }

        if (collapsedSections.has(item.section)) {
          return null;
        }

        return <TimelineEntry key={item.idx} log={item.log} />;
      })}
    </div>
  );
}

function TimelineEntry({ log }) {
  const typeConfig = {
    question_main: { 
      bg: "bg-blue-950/30", 
      border: "border-blue-800/50", 
      label: "Question",
      labelColor: "text-blue-400" 
    },
    question_followup: { 
      bg: "bg-orange-950/30", 
      border: "border-orange-800/50", 
      label: "Follow-Up",
      labelColor: "text-orange-400" 
    },
    question_ai_probe: { 
      bg: "bg-purple-950/30", 
      border: "border-purple-800/50", 
      label: "AI Probe",
      labelColor: "text-purple-400" 
    },
    candidate_answer: { 
      bg: "bg-slate-800/50", 
      border: "border-slate-700", 
      label: "Answer",
      labelColor: "text-slate-400" 
    },
    clarification: { 
      bg: "bg-cyan-950/30", 
      border: "border-cyan-800/50", 
      label: "Clarification",
      labelColor: "text-cyan-400" 
    },
    narrative: { 
      bg: "bg-slate-800/30", 
      border: "border-slate-700/50", 
      label: "Note",
      labelColor: "text-slate-500" 
    }
  };

  const config = typeConfig[log.type] || typeConfig.narrative;

  return (
    <div className={cn("p-4 border-l-4", config.bg, config.border)}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <span className={cn("text-xs font-semibold uppercase", config.labelColor)}>
          {config.label}
        </span>
        {log.metadata?.timestamp && (
          <span className="text-xs text-slate-500">
            {format(new Date(log.metadata.timestamp), 'h:mm a')}
          </span>
        )}
      </div>
      <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">
        {log.content}
      </p>
      {log.metadata && Object.keys(log.metadata).length > 1 && (
        <div className="mt-2 pt-2 border-t border-slate-700/50">
          {Object.entries(log.metadata).map(([key, value]) => {
            if (key === 'timestamp') return null;
            return (
              <div key={key} className="text-xs text-slate-400">
                <span className="font-medium">{key}:</span> {String(value)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}