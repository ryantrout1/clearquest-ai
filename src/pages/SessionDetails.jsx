
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Shield, FileText, AlertTriangle, Download, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

export default function SessionDetails() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('id');

  const [session, setSession] = useState(null);
  const [responses, setResponses] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) {
      navigate(createPageUrl("AdminDashboard"));
      return;
    }
    loadSessionData();
  }, [sessionId]);

  const loadSessionData = async () => {
    try {
      const [sessionData, responsesData, followupsData] = await Promise.all([
        base44.entities.InterviewSession.get(sessionId),
        base44.entities.Response.filter({ session_id: sessionId }),
        base44.entities.FollowUpResponse.filter({ session_id: sessionId })
      ]);

      setSession(sessionData);
      setResponses(responsesData);
      setFollowups(followupsData);
      setIsLoading(false);
    } catch (err) {
      console.error("Error loading session:", err);
      setIsLoading(false);
    }
  };

  const generateReport = async () => {
    // This would integrate with a PDF generation service
    alert("Report generation feature coming soon!");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-blue-400 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-300">Session not found</p>
          <Link to={createPageUrl("InterviewDashboard")}>
            <Button className="mt-4">Back to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  const statusConfig = {
    in_progress: { label: "In Progress", color: "bg-orange-100 text-orange-800" },
    completed: { label: "Completed", color: "bg-green-100 text-green-800" },
    paused: { label: "Paused", color: "bg-blue-100 text-blue-800" }
  };

  const riskConfig = {
    low: { label: "Low Risk", color: "bg-green-100 text-green-800" },
    moderate: { label: "Moderate Risk", color: "bg-yellow-100 text-yellow-800" },
    elevated: { label: "Elevated Risk", color: "bg-red-100 text-red-800" }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <Link to={createPageUrl("InterviewDashboard")}>
          <Button variant="ghost" className="text-slate-300 hover:text-white mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>

        {/* Header Card */}
        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 mb-6">
          <CardHeader>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <CardTitle className="text-2xl text-white flex items-center gap-3">
                  <Shield className="w-6 h-6 text-blue-400" />
                  {session.session_code}
                </CardTitle>
                <p className="text-slate-400 mt-2">
                  Department: {session.department_code} • File: {session.file_number}
                </p>
              </div>
              <div className="flex gap-2">
                <Badge className={cn("border", statusConfig[session.status]?.color)}>
                  {statusConfig[session.status]?.label}
                </Badge>
                <Badge className={riskConfig[session.risk_rating]?.color}>
                  {riskConfig[session.risk_rating]?.label}
                </Badge>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Stats Grid */}
        <div className="grid md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Questions Answered" value={session.total_questions_answered || 0} />
          <StatCard label="Follow-ups Triggered" value={session.followups_triggered || 0} />
          <StatCard label="Red Flags" value={session.red_flags?.length || 0} color="red" />
          <StatCard label="Completion" value={`${session.completion_percentage || 0}%`} />
        </div>

        {/* Timeline */}
        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 mb-6">
          <CardHeader>
            <CardTitle className="text-white">Timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <TimelineItem
              label="Session Started"
              date={session.created_date}
            />
            {session.completed_date && (
              <TimelineItem
                label="Session Completed"
                date={session.completed_date}
              />
            )}
          </CardContent>
        </Card>

        {/* Red Flags */}
        {session.red_flags?.length > 0 && (
          <Card className="bg-red-950/20 border-red-800/30 mb-6">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                Red Flags ({session.red_flags.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {session.red_flags.map((flag, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-red-300">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-2" />
                    <span>{flag}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Responses */}
        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 mb-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-white">Responses ({responses.length})</CardTitle>
            <Button onClick={generateReport} className="bg-blue-600 hover:bg-blue-700">
              <Download className="w-4 h-4 mr-2" />
              Generate Report
            </Button>
          </CardHeader>
          <CardContent>
            {responses.length === 0 ? (
              <p className="text-slate-400 text-center py-8">No responses yet</p>
            ) : (
              <div className="space-y-4">
                {responses.map((response, idx) => (
                  <ResponseCard key={idx} response={response} followups={followups} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ label, value, color = "blue" }) {
  const colorClass = color === "red" ? "text-red-400" : "text-blue-400";
  return (
    <Card className="bg-slate-900/30 border-slate-700">
      <CardContent className="p-4">
        <p className="text-slate-400 text-sm">{label}</p>
        <p className={cn("text-3xl font-bold mt-1", colorClass)}>{value}</p>
      </CardContent>
    </Card>
  );
}

function TimelineItem({ label, date }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="w-2 h-2 rounded-full bg-blue-400" />
      <span className="text-slate-300">{label}</span>
      <span className="text-slate-500">•</span>
      <span className="text-slate-400">
        {format(new Date(date), "MMM d, yyyy 'at' h:mm a")}
      </span>
    </div>
  );
}

function ResponseCard({ response, followups }) {
  const relatedFollowups = followups.filter(f => f.response_id === response.id);
  
  return (
    <div className="border border-slate-700 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <Badge variant="outline" className="text-xs text-slate-400 border-slate-600 mb-2">
            {response.category}
          </Badge>
          <p className="text-white font-medium">{response.question_text}</p>
        </div>
        {response.is_flagged && (
          <AlertTriangle className="w-4 h-4 text-red-400" />
        )}
      </div>
      
      <div className="flex items-center gap-2">
        <span className="text-slate-400 text-sm">Answer:</span>
        <Badge className={response.answer === "Yes" ? "bg-blue-600" : "bg-slate-700"}>
          {response.answer}
        </Badge>
      </div>

      {relatedFollowups.length > 0 && (
        <div className="mt-4 pl-4 border-l-2 border-blue-500/30 space-y-2">
          <p className="text-sm font-medium text-blue-400">Follow-up Details</p>
          {relatedFollowups.map((followup, idx) => (
            <div key={idx} className="text-sm text-slate-300 space-y-1">
              {followup.substance_name && <p>• Substance: {followup.substance_name}</p>}
              {followup.incident_date && <p>• Date: {followup.incident_date}</p>}
              {followup.incident_description && <p>• Description: {followup.incident_description}</p>}
              {followup.frequency && <p>• Frequency: {followup.frequency}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
