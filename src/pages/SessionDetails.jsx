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
import { toast } from "sonner";

export default function SessionDetails() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('id');

  const [session, setSession] = useState(null);
  const [responses, setResponses] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      navigate(createPageUrl("InterviewDashboard"));
      return;
    }
    loadSessionData();
  }, [sessionId]);

  const loadSessionData = async () => {
    try {
      const [sessionData, responsesData, followupsData, questionsData] = await Promise.all([
        base44.entities.InterviewSession.get(sessionId),
        base44.entities.Response.filter({ session_id: sessionId }),
        base44.entities.FollowUpResponse.filter({ session_id: sessionId }),
        base44.entities.Question.filter({ active: true })
      ]);

      console.log("📊 Session loaded:", {
        session: sessionData.session_code,
        responses: responsesData.length,
        followups: followupsData.length,
        questions: questionsData.length
      });

      setSession(sessionData);
      setResponses(responsesData);
      setFollowups(followupsData);
      setQuestions(questionsData);
      setIsLoading(false);
    } catch (err) {
      console.error("Error loading session:", err);
      setIsLoading(false);
    }
  };

  const generateReport = async () => {
    setIsGeneratingReport(true);
    
    try {
      console.log("🔍 Generating report for session:", sessionId);
      
      // Generate report content
      const reportContent = generateReportHTML(session, responses, followups, questions);

      // Create a temporary container
      const printContainer = document.createElement('div');
      printContainer.innerHTML = reportContent;
      printContainer.style.position = 'absolute';
      printContainer.style.left = '-9999px';
      document.body.appendChild(printContainer);

      // Trigger print dialog (user can save as PDF)
      window.print();

      // Cleanup
      setTimeout(() => {
        document.body.removeChild(printContainer);
      }, 100);

      console.log("✅ Report generated successfully");
      toast.success("Report ready - use your browser's print dialog to save as PDF");
      
    } catch (err) {
      console.error("❌ Error generating report:", err);
      toast.error("Failed to generate report. Please try again.");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const generateReportHTML = (session, responses, followups, questions) => {
    const now = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });

    // Group responses by category
    const categorizedResponses = {};
    responses.forEach(response => {
      const category = response.category || 'Other';
      if (!categorizedResponses[category]) {
        categorizedResponses[category] = [];
      }
      categorizedResponses[category].push(response);
    });

    // Generate HTML content
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Interview Report - ${session.session_code}</title>
        <style>
          @media print {
            @page { 
              margin: 0.75in;
              size: letter;
            }
            body { margin: 0; padding: 0; }
          }
          
          body {
            font-family: 'Times New Roman', serif;
            font-size: 11pt;
            line-height: 1.5;
            color: #000;
            max-width: 8.5in;
            margin: 0 auto;
            padding: 20px;
          }
          
          .header {
            text-align: center;
            border-bottom: 3px solid #000;
            padding-bottom: 15px;
            margin-bottom: 20px;
          }
          
          .header h1 {
            font-size: 18pt;
            font-weight: bold;
            margin: 0 0 10px 0;
            text-transform: uppercase;
          }
          
          .header .session-info {
            font-size: 10pt;
            color: #333;
          }
          
          .section {
            margin-bottom: 25px;
            page-break-inside: avoid;
          }
          
          .section-title {
            font-size: 13pt;
            font-weight: bold;
            border-bottom: 2px solid #333;
            padding-bottom: 5px;
            margin-bottom: 15px;
            text-transform: uppercase;
          }
          
          .question-block {
            margin-bottom: 20px;
            padding: 10px;
            background: #f9f9f9;
            border-left: 3px solid #333;
            page-break-inside: avoid;
          }
          
          .question-id {
            font-weight: bold;
            color: #0066cc;
            font-size: 10pt;
          }
          
          .question-text {
            font-weight: bold;
            margin: 5px 0;
          }
          
          .answer {
            margin-left: 20px;
            padding: 8px;
            background: white;
            border: 1px solid #ddd;
          }
          
          .answer-label {
            font-weight: bold;
            font-size: 9pt;
            color: #666;
          }
          
          .timestamp {
            font-size: 9pt;
            color: #999;
            margin-top: 3px;
          }
          
          .follow-up {
            margin-left: 40px;
            margin-top: 10px;
            padding: 10px;
            background: #fff3cd;
            border-left: 3px solid #ff9800;
            page-break-inside: avoid;
          }
          
          .follow-up-title {
            font-weight: bold;
            color: #ff6600;
            font-size: 10pt;
            margin-bottom: 5px;
          }
          
          .summary-box {
            background: #e8f4f8;
            border: 2px solid #0066cc;
            padding: 15px;
            margin-bottom: 20px;
          }
          
          .footer {
            margin-top: 30px;
            padding-top: 15px;
            border-top: 2px solid #333;
            text-align: center;
            font-size: 9pt;
            color: #666;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Applicant Background Interview Report</h1>
          <div class="session-info">
            <strong>Session Code:</strong> ${session.session_code}<br>
            <strong>Department:</strong> ${session.department_code} | <strong>File:</strong> ${session.file_number}<br>
            <strong>Report Generated:</strong> ${now}<br>
            <strong>Questions Answered:</strong> ${responses.length} / 162<br>
            <strong>Follow-Ups Triggered:</strong> ${followups.length}<br>
            <strong>Status:</strong> ${session.status.toUpperCase()}<br>
            <strong>Risk Level:</strong> ${session.risk_rating?.toUpperCase() || 'N/A'}
          </div>
        </div>

        <div class="summary-box">
          <strong>Interview Summary:</strong><br>
          Applicant completed ${responses.length} questions across ${Object.keys(categorizedResponses).length} categories. 
          This report contains all responses provided during the interview session, including follow-up details where applicable.
          ${session.red_flags?.length > 0 ? `<br><strong style="color: #cc0000;">Red Flags Identified: ${session.red_flags.length}</strong>` : ''}
        </div>

        ${Object.entries(categorizedResponses).map(([category, categoryResponses]) => `
          <div class="section">
            <div class="section-title">${category}</div>
            ${categoryResponses.map(response => {
              const question = questions.find(q => q.question_id === response.question_id);
              const relatedFollowups = followups.filter(f => f.response_id === response.id);
              
              return `
                <div class="question-block">
                  <div class="question-id">${response.question_id}</div>
                  <div class="question-text">${question?.question_text || response.question_text}</div>
                  <div class="answer">
                    <span class="answer-label">Response:</span> <strong>${response.answer}</strong>
                    ${response.answer_array?.length > 0 ? `<br><strong>Selected Options:</strong> ${response.answer_array.join(', ')}` : ''}
                  </div>
                  <div class="timestamp">Answered: ${new Date(response.response_timestamp).toLocaleString('en-US', { 
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  })}</div>
                  
                  ${relatedFollowups.map(followup => `
                    <div class="follow-up">
                      <div class="follow-up-title">📋 Follow-Up: ${followup.followup_pack?.replace(/_/g, ' ') || 'Additional Details'}</div>
                      ${followup.substance_name ? `<strong>Substance:</strong> ${followup.substance_name}<br>` : ''}
                      ${followup.incident_date ? `<strong>Date of Incident:</strong> ${followup.incident_date}<br>` : ''}
                      ${followup.incident_location ? `<strong>Location:</strong> ${followup.incident_location}<br>` : ''}
                      ${followup.incident_description ? `<strong>Description:</strong> ${followup.incident_description}<br>` : ''}
                      ${followup.frequency ? `<strong>Frequency:</strong> ${followup.frequency}<br>` : ''}
                      ${followup.last_occurrence ? `<strong>Last Occurrence:</strong> ${followup.last_occurrence}<br>` : ''}
                      ${followup.circumstances ? `<strong>Circumstances:</strong> ${followup.circumstances}<br>` : ''}
                      ${followup.accountability_response ? `<strong>Accountability Statement:</strong> ${followup.accountability_response}<br>` : ''}
                      ${followup.changes_since ? `<strong>Changes Since:</strong> ${followup.changes_since}<br>` : ''}
                      ${followup.legal_outcome ? `<strong>Legal Outcome:</strong> ${followup.legal_outcome}<br>` : ''}
                      ${followup.penalties ? `<strong>Penalties:</strong> ${followup.penalties}` : ''}
                    </div>
                  `).join('')}
                </div>
              `;
            }).join('')}
          </div>
        `).join('')}

        ${session.red_flags?.length > 0 ? `
          <div class="section">
            <div class="section-title" style="color: #cc0000;">⚠️ Red Flags Identified</div>
            ${session.red_flags.map((flag, idx) => `
              <div class="question-block" style="border-left-color: #cc0000;">
                <strong>${idx + 1}.</strong> ${flag}
              </div>
            `).join('')}
          </div>
        ` : ''}

        <div class="footer">
          <strong>ClearQuest™ Interview System</strong><br>
          CJIS Compliant • All responses encrypted and secured<br>
          Session Hash: ${session.session_hash || 'N/A'}<br>
          Report generated: ${new Date().toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
          })}<br>
          <em>This report is confidential and intended for authorized investigators only.</em>
        </div>
      </body>
      </html>
    `;
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
    in_progress: { label: "In Progress", color: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
    completed: { label: "Completed", color: "bg-green-500/20 text-green-300 border-green-500/30" },
    paused: { label: "Paused", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" }
  };

  const riskConfig = {
    low: { label: "Low Risk", color: "bg-green-500/20 text-green-300 border-green-500/30" },
    moderate: { label: "Moderate Risk", color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
    elevated: { label: "Elevated Risk", color: "bg-red-500/20 text-red-300 border-red-500/30" }
  };

  // Calculate actual counts from loaded data
  const actualQuestionsAnswered = responses.length;
  const actualFollowupsTriggered = followups.length;
  const actualCompletion = Math.round((actualQuestionsAnswered / 162) * 100);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <Link to={createPageUrl("InterviewDashboard")}>
          <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-slate-700 mb-4 md:mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>

        {/* Header Card */}
        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 mb-4 md:mb-6">
          <CardHeader>
            <div className="flex flex-col gap-4">
              <div>
                <CardTitle className="text-xl md:text-2xl text-white flex items-center gap-2 md:gap-3 break-all">
                  <Shield className="w-5 h-5 md:w-6 md:h-6 text-blue-400 flex-shrink-0" />
                  <span className="break-all">{session.session_code}</span>
                </CardTitle>
                <p className="text-slate-400 mt-2 text-sm">
                  Department: {session.department_code} • File: {session.file_number}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge className={cn("border text-xs md:text-sm", statusConfig[session.status]?.color)}>
                  {statusConfig[session.status]?.label}
                </Badge>
                <Badge className={cn("text-xs md:text-sm", riskConfig[session.risk_rating]?.color)}>
                  {riskConfig[session.risk_rating]?.label}
                </Badge>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Stats Grid - Using actual counts */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4 md:mb-6">
          <StatCard label="Questions Answered" value={actualQuestionsAnswered} />
          <StatCard label="Follow-ups Triggered" value={actualFollowupsTriggered} />
          <StatCard label="Red Flags" value={session.red_flags?.length || 0} color="red" />
          <StatCard label="Completion" value={`${actualCompletion}%`} />
        </div>

        {/* Timeline */}
        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 mb-4 md:mb-6">
          <CardHeader>
            <CardTitle className="text-white text-lg">Timeline</CardTitle>
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
          <Card className="bg-red-950/20 border-red-800/30 mb-4 md:mb-6">
            <CardHeader>
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <span>Red Flags ({session.red_flags.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {session.red_flags.map((flag, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-red-300 text-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-2 flex-shrink-0" />
                    <span className="break-words">{flag}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Responses */}
        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 mb-4 md:mb-6">
          <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <CardTitle className="text-white text-lg">Responses ({responses.length})</CardTitle>
            <Button 
              onClick={generateReport} 
              disabled={isGeneratingReport || responses.length === 0}
              className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-sm"
            >
              {isGeneratingReport ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Generate Report
                </>
              )}
            </Button>
          </CardHeader>
          <CardContent>
            {responses.length === 0 ? (
              <p className="text-slate-400 text-center py-8 text-sm">No responses yet</p>
            ) : (
              <div className="space-y-4">
                {responses.map((response, idx) => (
                  <ResponseCard key={idx} response={response} followups={followups} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-slate-500 text-xs">
            © 2025 ClearQuest AI™ • CJIS Compliant
          </p>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color = "blue" }) {
  const colorClass = color === "red" ? "text-red-400" : "text-blue-400";
  return (
    <Card className="bg-slate-900/30 border-slate-700">
      <CardContent className="p-3 md:p-4">
        <p className="text-slate-400 text-xs md:text-sm truncate">{label}</p>
        <p className={cn("text-2xl md:text-3xl font-bold mt-1", colorClass)}>{value}</p>
      </CardContent>
    </Card>
  );
}

function TimelineItem({ label, date }) {
  return (
    <div className="flex items-start gap-3 text-xs md:text-sm">
      <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
      <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2 flex-1 min-w-0">
        <span className="text-slate-300">{label}</span>
        <span className="text-slate-500 hidden md:inline">•</span>
        <span className="text-slate-400 break-words">
          {format(new Date(date), "MMM d, yyyy 'at' h:mm a")}
        </span>
      </div>
    </div>
  );
}

function ResponseCard({ response, followups }) {
  const relatedFollowups = followups.filter(f => f.response_id === response.id);
  
  return (
    <div className="border border-slate-700 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <Badge variant="outline" className="text-xs text-slate-400 border-slate-600 mb-2">
            {response.category}
          </Badge>
          <p className="text-white font-medium text-sm md:text-base break-words">{response.question_text}</p>
        </div>
        {response.is_flagged && (
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
        )}
      </div>
      
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-slate-400 text-xs md:text-sm">Answer:</span>
        <Badge className={response.answer === "Yes" ? "bg-blue-600 text-xs md:text-sm" : "bg-slate-700 text-xs md:text-sm"}>
          {response.answer}
        </Badge>
      </div>

      {relatedFollowups.length > 0 && (
        <div className="mt-4 pl-4 border-l-2 border-blue-500/30 space-y-2">
          <p className="text-xs md:text-sm font-medium text-blue-400">Follow-up Details</p>
          {relatedFollowups.map((followup, idx) => (
            <div key={idx} className="text-xs md:text-sm text-slate-300 space-y-1 break-words">
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