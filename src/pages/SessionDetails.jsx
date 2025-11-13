
import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  ArrowLeft, Shield, FileText, AlertTriangle, Download, Loader2, 
  ChevronDown, ChevronRight, Search, Eye, Trash2,
  ChevronsDown, ChevronsUp, ToggleLeft, ToggleRight
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

// Keywords that trigger "Needs Review" badge
const REVIEW_KEYWORDS = [
  'arrest', 'fired', 'failed', 'polygraph', 'investigated', 
  'suspended', 'terminated', 'dui', 'drugs', 'felony', 'charge',
  'conviction', 'probation', 'parole', 'violence', 'assault', 'disqualified'
];

export default function SessionDetails() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('id');

  const [session, setSession] = useState(null);
  const [responses, setResponses] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [department, setDepartment] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // UI State
  const [searchTerm, setSearchTerm] = useState("");
  const [showOnlyFollowUps, setShowOnlyFollowUps] = useState(false);
  const [viewMode, setViewMode] = useState("structured");
  const [expandedQuestions, setExpandedQuestions] = useState(new Set());
  const [selectedCategory, setSelectedCategory] = useState("all");

  // Refs for scroll-to functionality
  const categoryRefs = useRef({});

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
      console.log("🔍 Loading session:", sessionId);
      
      const sessionData = await base44.entities.InterviewSession.get(sessionId);
      setSession(sessionData);

      // Load department info
      if (sessionData.department_code) {
        const depts = await base44.entities.Department.filter({ 
          department_code: sessionData.department_code 
        });
        if (depts.length > 0) {
          setDepartment(depts[0]);
        }
      }

      const [responsesData, followupsData, questionsData] = await Promise.all([
        base44.entities.Response.filter({ session_id: sessionId }),
        base44.entities.FollowUpResponse.filter({ session_id: sessionId }),
        base44.entities.Question.filter({ active: true })
      ]);

      setResponses(responsesData.sort((a, b) => 
        new Date(a.response_timestamp) - new Date(b.response_timestamp)
      ));
      setFollowups(followupsData);
      setQuestions(questionsData);
      
      setIsLoading(false);
    } catch (err) {
      console.error("❌ Error loading session:", err);
      toast.error("Failed to load session data");
      setIsLoading(false);
    }
  };

  const handleExpandAll = () => {
    const allIds = new Set(responses.map(r => r.id));
    setExpandedQuestions(allIds);
  };

  const handleCollapseAll = () => {
    setExpandedQuestions(new Set());
  };

  const toggleQuestion = (responseId) => {
    const newExpanded = new Set(expandedQuestions);
    if (newExpanded.has(responseId)) {
      newExpanded.delete(responseId);
    } else {
      newExpanded.add(responseId);
    }
    setExpandedQuestions(newExpanded);
  };

  const handleCategoryJump = (category) => {
    setSelectedCategory(category);
    if (category !== "all" && categoryRefs.current[category]) {
      categoryRefs.current[category].scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
      });
    }
  };

  const handleDeleteLastResponse = async () => {
    if (responses.length === 0) return;
    
    const lastResponse = responses[responses.length - 1];
    
    if (!window.confirm(`Delete last response: "${lastResponse.question_text}"?`)) {
      return;
    }

    try {
      await base44.entities.Response.delete(lastResponse.id);
      
      // Also delete related follow-ups
      const relatedFollowups = followups.filter(f => f.response_id === lastResponse.id);
      for (const fu of relatedFollowups) {
        await base44.entities.FollowUpResponse.delete(fu.id);
      }
      
      toast.success("Response deleted");
      loadSessionData();
    } catch (err) {
      console.error("Error deleting response:", err);
      toast.error("Failed to delete response");
    }
  };

  const generateReport = async () => {
    setIsGeneratingReport(true);
    
    try {
      const reportContent = generateReportHTML(session, responses, followups, questions, department);
      const printContainer = document.createElement('div');
      printContainer.innerHTML = reportContent;
      printContainer.style.position = 'absolute';
      printContainer.style.left = '-9999px';
      document.body.appendChild(printContainer);
      window.print();
      setTimeout(() => document.body.removeChild(printContainer), 100);
      toast.success("Report ready - use your browser's print dialog to save as PDF");
    } catch (err) {
      console.error("Error generating report:", err);
      toast.error("Failed to generate report");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // Filter logic
  const categories = [...new Set(responses.map(r => r.category))].filter(Boolean).sort();
  
  const filteredResponses = responses.filter(response => {
    // Search filter
    const matchesSearch = !searchTerm || 
      response.question_text?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      response.answer?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      followups.some(f => 
        f.response_id === response.id && 
        JSON.stringify(f.additional_details || {}).toLowerCase().includes(searchTerm.toLowerCase())
      );

    // Follow-up filter
    const hasFollowups = followups.some(f => f.response_id === response.id);
    const matchesFollowUpFilter = !showOnlyFollowUps || hasFollowups;

    return matchesSearch && matchesFollowUpFilter;
  });

  // Group by category for structured view
  const responsesByCategory = {};
  filteredResponses.forEach(r => {
    const cat = r.category || 'Other';
    if (!responsesByCategory[cat]) responsesByCategory[cat] = [];
    responsesByCategory[cat].push(r);
  });

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
    in_progress: { label: "In Progress", color: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
    completed: { label: "Completed", color: "bg-green-500/20 text-green-300 border-green-500/30" },
    paused: { label: "Paused", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" }
  };

  const riskConfig = {
    low: { label: "Low Risk", color: "bg-green-500/20 text-green-300 border-green-500/30" },
    moderate: { label: "Moderate Risk", color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
    elevated: { label: "Elevated Risk", color: "bg-red-500/20 text-red-300 border-red-500/30" }
  };

  const actualQuestionsAnswered = responses.length;
  const actualFollowupsTriggered = followups.length;
  const actualCompletion = Math.round((actualQuestionsAnswered / 198) * 100);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        {/* Back Button */}
        <Link to={createPageUrl("InterviewDashboard")}>
          <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-slate-700 mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>

        {/* Compact Header - Mobile Friendly */}
        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 mb-4">
          <CardContent className="p-4">
            {/* Top Row */}
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-3">
              <div className="flex-1">
                <h1 className="text-xl md:text-2xl font-bold text-white mb-1">
                  {department?.department_name || session.department_code}
                </h1>
                <div className="flex flex-wrap items-center gap-2 text-xs md:text-sm text-slate-400">
                  <span>Dept Code: <span className="font-mono text-slate-300">{session.department_code}</span></span>
                  <span>•</span>
                  <span>File: <span className="font-mono text-slate-300">{session.file_number}</span></span>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Badge className={cn("text-xs", statusConfig[session.status]?.color)}>
                  {statusConfig[session.status]?.label}
                </Badge>
                <Badge className={cn("text-xs", riskConfig[session.risk_rating]?.color)}>
                  {riskConfig[session.risk_rating]?.label}
                </Badge>
              </div>
            </div>

            {/* Metrics Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-slate-700">
              <CompactMetric label="Questions" value={actualQuestionsAnswered} />
              <CompactMetric label="Follow-Ups" value={actualFollowupsTriggered} />
              <CompactMetric label="Red Flags" value={session.red_flags?.length || 0} color="red" />
              <CompactMetric label="Completion" value={`${actualCompletion}%`} />
            </div>
          </CardContent>
        </Card>

        {/* Controls Bar (Sticky) - FIXED LAYOUT */}
        <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-sm border border-slate-700 rounded-lg p-3 md:p-4 mb-4">
          {/* First Row - Responsive Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 md:gap-3 items-center">
            {/* Search - Full width on mobile, larger on desktop */}
            <div className="lg:col-span-4 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                placeholder="Search questions or answers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-slate-800 border-slate-600 text-white text-sm h-9"
              />
            </div>

            {/* Category Jump */}
            <div className="lg:col-span-3">
              <Select value={selectedCategory} onValueChange={handleCategoryJump}>
                <SelectTrigger className="bg-slate-800 border-slate-600 text-white text-sm h-9 w-full">
                  <SelectValue placeholder="Jump to Category" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                  <SelectItem value="all" className="text-white text-sm">All Categories</SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat} value={cat} className="text-white text-sm">
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* View Mode Toggle */}
            <div className="lg:col-span-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewMode(viewMode === "structured" ? "transcript" : "structured")}
                className="w-full bg-slate-800 border-slate-600 text-white hover:bg-slate-700 h-9 text-sm"
              >
                {viewMode === "structured" ? <FileText className="w-4 h-4 mr-1 md:mr-2" /> : <Eye className="w-4 h-4 mr-1 md:mr-2" />}
                {viewMode === "structured" ? "Transcript" : "Structured"}
              </Button>
            </div>

            {/* Expand/Collapse - Single row on all screens */}
            <div className="lg:col-span-3 grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExpandAll}
                className="bg-slate-800 border-slate-600 text-white hover:bg-slate-700 h-9 text-sm"
              >
                <ChevronsDown className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">Expand</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCollapseAll}
                className="bg-slate-800 border-slate-600 text-white hover:bg-slate-700 h-9 text-sm"
              >
                <ChevronsUp className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">Collapse</span>
              </Button>
            </div>
          </div>

          {/* Second Row - Filters & Actions */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mt-3 pt-3 border-t border-slate-700">
            <button
              onClick={() => setShowOnlyFollowUps(!showOnlyFollowUps)}
              className="flex items-center gap-2 text-sm text-slate-300 hover:text-white transition-colors"
            >
              {showOnlyFollowUps ? (
                <ToggleRight className="w-5 h-5 text-blue-400" />
              ) : (
                <ToggleLeft className="w-5 h-5 text-slate-500" />
              )}
              <span>Show Only Questions with Follow-Ups</span>
            </button>
            
            <div className="flex items-center gap-3 flex-wrap">
              {searchTerm && (
                <span className="text-xs text-slate-400">
                  Found {filteredResponses.length} result{filteredResponses.length !== 1 ? 's' : ''}
                </span>
              )}
              <Button 
                onClick={generateReport} 
                disabled={isGeneratingReport || responses.length === 0}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white h-9"
              >
                {isGeneratingReport ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">Generate PDF</span>
                    <span className="sm:hidden">PDF</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Red Flags Alert (if any) */}
        {session.red_flags?.length > 0 && (
          <Card className="bg-red-950/20 border-red-800/50 mb-4">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-red-400 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Red Flags Identified ({session.red_flags.length})
              </h3>
              <div className="space-y-1">
                {session.red_flags.map((flag, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                    <p className="text-xs text-red-300">{flag}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Responses Display */}
        {responses.length === 0 ? (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-12 text-center">
              <FileText className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">No responses recorded yet</p>
            </CardContent>
          </Card>
        ) : viewMode === "structured" ? (
          <StructuredView
            responsesByCategory={responsesByCategory}
            responses={filteredResponses}
            followups={followups}
            expandedQuestions={expandedQuestions}
            toggleQuestion={toggleQuestion}
            categoryRefs={categoryRefs}
          />
        ) : (
          <TranscriptView
            responses={filteredResponses}
            followups={followups}
          />
        )}

        {/* Delete Last Response */}
        {responses.length > 0 && (
          <div className="mt-6">
            <Button
              variant="outline"
              onClick={handleDeleteLastResponse}
              className="bg-red-950/20 border-red-800/30 text-red-300 hover:bg-red-950/40 hover:text-red-200"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Last Response
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function CompactMetric({ label, value, color = "blue" }) {
  const colorClass = color === "red" ? "text-red-400" : "text-blue-400";
  return (
    <div className="text-center md:text-left">
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className={cn("text-lg md:text-xl font-bold", colorClass)}>{value}</p>
    </div>
  );
}

function StructuredView({ responsesByCategory, responses, followups, expandedQuestions, toggleQuestion, categoryRefs }) {
  return (
    <div className="space-y-6">
      {Object.entries(responsesByCategory).map(([category, categoryResponses]) => (
        <div key={category}>
          <div 
            ref={el => categoryRefs.current[category] = el}
            className="sticky top-28 md:top-32 bg-slate-900/95 backdrop-blur-sm border-b-2 border-blue-500/30 py-2 mb-3 z-10"
          >
            <h2 className="text-base md:text-lg font-bold text-blue-400">{category}</h2>
          </div>
          
          <div className="space-y-2">
            {categoryResponses.map(response => (
              <QuestionCard
                key={response.id}
                response={response}
                followups={followups.filter(f => f.response_id === response.id)}
                isExpanded={expandedQuestions.has(response.id)}
                onToggle={() => toggleQuestion(response.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function QuestionCard({ response, followups, isExpanded, onToggle }) {
  const hasFollowups = followups.length > 0;
  
  return (
    <Card className="bg-slate-900/30 border-slate-700 hover:border-slate-600 transition-colors">
      <CardContent className="p-3 md:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="text-xs text-slate-400 border-slate-600">
                {response.question_id}
              </Badge>
              <span className="text-xs text-slate-500">{response.category}</span>
              {response.is_flagged && (
                <Badge className="text-xs bg-red-500/20 text-red-300 border-red-500/30">
                  Flagged
                </Badge>
              )}
            </div>
            <p className="text-white text-sm font-medium mb-2">{response.question_text}</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Answer:</span>
              <Badge className={response.answer === "Yes" ? "bg-blue-600 text-xs" : "bg-slate-700 text-xs"}>
                {response.answer}
              </Badge>
            </div>
          </div>

          {hasFollowups && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggle}
              className="text-slate-400 hover:text-white flex-shrink-0"
            >
              {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
            </Button>
          )}
        </div>

        {isExpanded && hasFollowups && (
          <div className="mt-3 pl-2 md:pl-4 border-l-2 border-orange-500/30 space-y-2">
            <p className="text-xs font-semibold text-orange-400 mb-2">Follow-Up Thread</p>
            {followups.map((followup, idx) => (
              <FollowUpThread key={idx} followup={followup} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FollowUpThread({ followup }) {
  const additionalDetails = followup.additional_details || {};
  const entries = Object.entries(additionalDetails);
  
  const needsReview = (text) => {
    const lower = String(text || '').toLowerCase();
    return REVIEW_KEYWORDS.some(keyword => lower.includes(keyword));
  };
  
  return (
    <div className="space-y-2">
      {followup.substance_name && (
        <div className="bg-slate-800/50 rounded-lg p-2 md:p-3 border border-slate-700">
          <p className="text-xs text-slate-400 mb-0.5">Substance</p>
          <p className="text-sm text-white font-medium">{followup.substance_name}</p>
        </div>
      )}
      
      {entries.map(([key, value]) => {
        const requiresReview = needsReview(value);
        return (
          <div key={key} className="bg-slate-800/30 rounded-lg p-2 md:p-3">
            <div className="flex items-start justify-between gap-2 mb-1">
              <p className="text-xs text-orange-300 font-medium">
                {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </p>
              {requiresReview && (
                <Badge className="text-xs bg-yellow-500/20 text-yellow-300 border-yellow-500/30 flex-shrink-0">
                  Needs Review
                </Badge>
              )}
            </div>
            <p className="text-sm text-slate-200 whitespace-pre-wrap break-words">{value}</p>
          </div>
        );
      })}
    </div>
  );
}

function TranscriptView({ responses, followups }) {
  const timeline = [];
  
  responses.forEach(response => {
    timeline.push({ type: 'question', data: response });
    
    const relatedFollowups = followups.filter(f => f.response_id === response.id);
    relatedFollowups.forEach(fu => {
      timeline.push({ type: 'followup', data: fu });
    });
  });

  return (
    <div className="space-y-2">
      {timeline.map((item, idx) => (
        <TranscriptEntry key={idx} item={item} />
      ))}
    </div>
  );
}

function TranscriptEntry({ item }) {
  if (item.type === 'question') {
    const response = item.data;
    return (
      <div className="space-y-2">
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <Badge variant="outline" className="text-xs text-blue-400 border-blue-500/30">
              {response.question_id}
            </Badge>
            <span className="text-xs text-slate-400">{response.category}</span>
          </div>
          <p className="text-white text-sm">{response.question_text}</p>
        </div>
        <div className="flex justify-end">
          <div className="bg-blue-600 rounded-lg px-4 py-2 max-w-md">
            <p className="text-white text-sm font-medium">{response.answer}</p>
          </div>
        </div>
      </div>
    );
  }

  if (item.type === 'followup') {
    const followup = item.data;
    const details = followup.additional_details || {};
    
    const needsReview = (text) => {
      const lower = String(text || '').toLowerCase();
      return REVIEW_KEYWORDS.some(keyword => lower.includes(keyword));
    };
    
    return (
      <div className="ml-4 md:ml-8 space-y-2">
        {followup.substance_name && (
          <>
            <div className="bg-orange-950/30 border border-orange-800/50 rounded-lg p-3">
              <p className="text-xs text-orange-400">Substance</p>
            </div>
            <div className="flex justify-end">
              <div className="bg-orange-600 rounded-lg px-4 py-2 max-w-md">
                <p className="text-white text-sm font-medium">{followup.substance_name}</p>
              </div>
            </div>
          </>
        )}
        
        {Object.entries(details).map(([key, value]) => {
          const requiresReview = needsReview(value);
          return (
            <React.Fragment key={key}>
              <div className="bg-orange-950/30 border border-orange-800/50 rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-orange-400">
                    {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </p>
                  {requiresReview && (
                    <Badge className="text-xs bg-yellow-500/20 text-yellow-300 border-yellow-500/30 flex-shrink-0">
                      Needs Review
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex justify-end">
                <div className="bg-orange-600 rounded-lg px-4 py-2 max-w-md">
                  <p className="text-white text-sm break-words">{value}</p>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  return null;
}

function generateReportHTML(session, responses, followups, questions, department) {
  const now = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });

  const categorizedResponses = {};
  responses.forEach(response => {
    const category = response.category || 'Other';
    if (!categorizedResponses[category]) {
      categorizedResponses[category] = [];
    }
    categorizedResponses[category].push(response);
  });

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Interview Report - ${session.session_code}</title>
      <style>
        @media print {
          @page { margin: 0.75in; size: letter; }
          body { margin: 0; padding: 0; }
        }
        
        body {
          font-family: 'Times New Roman', serif;
          font-size: 10pt;
          line-height: 1.4;
          color: #000;
          max-width: 8.5in;
          margin: 0 auto;
          padding: 20px;
        }
        
        .header {
          text-align: center;
          border-bottom: 3px solid #000;
          padding-bottom: 12px;
          margin-bottom: 16px;
        }
        
        .header h1 {
          font-size: 16pt;
          font-weight: bold;
          margin: 0 0 8px 0;
          text-transform: uppercase;
        }
        
        .header .session-info {
          font-size: 9pt;
          color: #333;
          line-height: 1.6;
        }
        
        .section {
          margin-bottom: 20px;
          page-break-inside: avoid;
        }
        
        .section-title {
          font-size: 11pt;
          font-weight: bold;
          border-bottom: 2px solid #333;
          padding-bottom: 3px;
          margin-bottom: 10px;
          text-transform: uppercase;
        }
        
        .question-block {
          margin-bottom: 14px;
          padding: 8px;
          background: #f9f9f9;
          border-left: 3px solid #333;
          page-break-inside: avoid;
        }
        
        .question-id {
          font-weight: bold;
          color: #0066cc;
          font-size: 9pt;
        }
        
        .question-text {
          font-weight: bold;
          margin: 3px 0;
          font-size: 10pt;
        }
        
        .answer {
          margin-left: 16px;
          padding: 6px;
          background: white;
          border: 1px solid #ddd;
        }
        
        .answer-label {
          font-weight: bold;
          font-size: 8pt;
          color: #666;
        }
        
        .follow-up {
          margin-left: 32px;
          margin-top: 8px;
          padding: 8px;
          background: #fff3cd;
          border-left: 3px solid #ff9800;
          page-break-inside: avoid;
        }
        
        .follow-up-title {
          font-weight: bold;
          color: #ff6600;
          font-size: 9pt;
          margin-bottom: 4px;
        }
        
        .follow-up-item {
          margin: 4px 0;
          font-size: 9pt;
        }
        
        .summary-box {
          background: #e8f4f8;
          border: 2px solid #0066cc;
          padding: 12px;
          margin-bottom: 16px;
          font-size: 9pt;
        }
        
        .footer {
          margin-top: 24px;
          padding-top: 12px;
          border-top: 2px solid #333;
          text-align: center;
          font-size: 8pt;
          color: #666;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Applicant Background Interview Report</h1>
        <div class="session-info">
          <strong>Department:</strong> ${department?.department_name || session.department_code}<br>
          <strong>Dept Code:</strong> ${session.department_code} | <strong>File:</strong> ${session.file_number}<br>
          <strong>Report Generated:</strong> ${now}<br>
          <strong>Questions Answered:</strong> ${responses.length} / 198<br>
          <strong>Follow-Ups:</strong> ${followups.length}<br>
          <strong>Status:</strong> ${session.status.toUpperCase()}<br>
          <strong>Risk Level:</strong> ${session.risk_rating?.toUpperCase() || 'N/A'}
        </div>
      </div>

      <div class="summary-box">
        <strong>Interview Summary:</strong><br>
        Applicant completed ${responses.length} questions across ${Object.keys(categorizedResponses).length} categories. 
        ${followups.length} follow-up packs were triggered and completed.
        ${session.red_flags?.length > 0 ? `<br><strong style="color: #cc0000;">Red Flags Identified: ${session.red_flags.length}</strong>` : ''}
      </div>

      ${Object.entries(categorizedResponses).map(([category, categoryResponses]) => `
        <div class="section">
          <div class="section-title">${category}</div>
          ${categoryResponses.map(response => {
            const relatedFollowups = followups.filter(f => f.response_id === response.id);
            
            return `
              <div class="question-block">
                <div class="question-id">${response.question_id}</div>
                <div class="question-text">${response.question_text}</div>
                <div class="answer">
                  <span class="answer-label">Response:</span> <strong>${response.answer}</strong>
                </div>
                
                ${relatedFollowups.map(followup => {
                  const details = followup.additional_details || {};
                  return `
                    <div class="follow-up">
                      <div class="follow-up-title">📋 Follow-Up Details${followup.substance_name ? `: ${followup.substance_name}` : ''}</div>
                      ${Object.entries(details).map(([key, value]) => `
                        <div class="follow-up-item">
                          <strong>${key.replace(/_/g, ' ')}:</strong> ${value}
                        </div>
                      `).join('')}
                    </div>
                  `;
                }).join('')}
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
        Report generated: ${new Date().toLocaleString('en-US')}<br>
        <em>This report is confidential and intended for authorized investigators only.</em>
      </div>
    </body>
    </html>
  `;
}
