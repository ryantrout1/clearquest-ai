
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Keywords that trigger "Needs Review" badge
const REVIEW_KEYWORDS = [
  'arrest', 'fired', 'failed', 'polygraph', 'investigated',
  'suspended', 'terminated', 'dui', 'drugs', 'felony', 'charge',
  'conviction', 'probation', 'parole', 'violence', 'assault', 'disqualified'
];

// U.S. Citizenship question ID - no summary needed
const US_CITIZENSHIP_QUESTION_ID = 'Q161';

const needsReview = (text) => {
  const lower = String(text || '').toLowerCase();
  return REVIEW_KEYWORDS.some(keyword => lower.includes(keyword));
};

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
  
  const [totalQuestions, setTotalQuestions] = useState(null);
  const [expandedQuestions, setExpandedQuestions] = useState(new Set());
  
  const [isHoveringStatus, setIsHoveringStatus] = useState(false);
  const [showStatusConfirm, setShowStatusConfirm] = useState(false);

  // UI State
  const [searchTerm, setSearchTerm] = useState("");
  const [showOnlyFollowUps, setShowOnlyFollowUps] = useState(false);
  const [viewMode, setViewMode] = useState("structured");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [collapsedSections, setCollapsedSections] = useState(new Set());

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
      const sessionData = await base44.entities.InterviewSession.get(sessionId);
      setSession(sessionData);

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
      
      setTotalQuestions(questionsData.length);
      
      // Default all to collapsed
      setExpandedQuestions(new Set());

      setIsLoading(false);
    } catch (err) {
      console.error("Error loading session:", err);
      toast.error("Failed to load session data");
      setIsLoading(false);
    }
  };

  const toggleQuestionExpanded = (responseId) => {
    setExpandedQuestions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(responseId)) {
        newSet.delete(responseId);
      } else {
        newSet.add(responseId);
      }
      return newSet;
    });
  };

  const handleStatusClick = () => {
    if (session?.status === 'completed') {
      setShowStatusConfirm(true);
    }
  };

  const handleRevertToInProgress = async () => {
    try {
      await base44.entities.InterviewSession.update(sessionId, {
        status: 'in_progress',
        completed_at: null,
        completed_date: null
      });
      
      setSession({ ...session, status: 'in_progress' });
      setShowStatusConfirm(false);
      toast.success('Interview marked as In Progress');
    } catch (err) {
      console.error('Error updating status:', err);
      toast.error('Failed to update status');
    }
  };

  const categories = [...new Set(responses.map(r => r.category))].filter(Boolean).sort();

  const allResponsesWithNumbers = responses.map((r, idx) => ({
    ...r,
    display_number: idx + 1
  }));

  const filteredResponsesWithNumbers = allResponsesWithNumbers.filter(response => {
    const matchesSearch = !searchTerm ||
      response.question_text?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      response.answer?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      response.investigator_summary?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      response.investigator_probing?.some(p => 
        p.probing_question?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        p.candidate_response?.toLowerCase().includes(searchTerm.toLowerCase())
      ) ||
      followups.some(f =>
        f.response_id === response.id &&
        JSON.stringify(f.additional_details || {}).toLowerCase().includes(searchTerm.toLowerCase())
      );

    const hasFollowups = followups.some(f => f.response_id === response.id) || (response.investigator_probing?.length > 0);
    const matchesFollowUpFilter = !showOnlyFollowUps || hasFollowups;

    return matchesSearch && matchesFollowUpFilter;
  });

  const responsesByCategory = {};

  filteredResponsesWithNumbers.forEach(r => {
    const cat = r.category || 'Other';
    if (!responsesByCategory[cat]) responsesByCategory[cat] = [];
    responsesByCategory[cat].push(r);
  });

  const handleExpandAll = () => {
    setCollapsedSections(new Set());
    const allYesResponses = new Set(
      responses.filter(r => r.answer === 'Yes').map(r => r.id)
    );
    setExpandedQuestions(allYesResponses);
  };

  const handleCollapseAll = () => {
    const allCategories = Object.keys(responsesByCategory);
    setCollapsedSections(new Set(allCategories));
    setExpandedQuestions(new Set());
  };

  const toggleSection = (category) => {
    const newCollapsed = new Set(collapsedSections);
    if (newCollapsed.has(category)) {
      newCollapsed.delete(category);
    } else {
      newCollapsed.add(category);
    }
    return newCollapsed;
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

      const relatedFollowups = followups.filter(f => f.response_id === lastResponse.id);
      for (const fu of relatedFollowups) {
        await base44.entities.FollowUpResponse.delete(fu.id);
      }

      const currentSession = await base44.entities.InterviewSession.get(sessionId);

      let updatedTranscript = (currentSession.transcript_snapshot || []).filter(
        entry => entry.questionId !== lastResponse.question_id
      );

      await base44.entities.InterviewSession.update(sessionId, {
        transcript_snapshot: updatedTranscript,
        queue_snapshot: [],
        current_item_snapshot: null,
        total_questions_answered: updatedTranscript.filter(t => t.type === 'question').length,
        completion_percentage: totalQuestions 
          ? Math.round((updatedTranscript.filter(t => t.type === 'question').length / totalQuestions) * 100)
          : 0
      });

      toast.success("Response deleted and session updated");
      loadSessionData();
    } catch (err) {
      console.error("Error deleting response:", err);
      toast.error("Failed to delete response");
    }
  };

  const generateReport = async () => {
    setIsGeneratingReport(true);

    try {
      const reportContent = generateReportHTML(session, responses, followups, questions, department, totalQuestions);
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
  const actualCompletion = totalQuestions 
    ? Math.round((actualQuestionsAnswered / totalQuestions) * 100) 
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        <Link to={createPageUrl("InterviewDashboard")}>
          <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-slate-700 mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>

        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 mb-4">
          <CardContent className="p-4 md:p-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-4">
              <div className="flex-1">
                <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
                  {department?.department_name || session.department_code}
                </h1>
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
                  <span>Dept Code: <span className="font-mono text-slate-300">{session.department_code}</span></span>
                  <span>•</span>
                  <span>File: <span className="font-mono text-slate-300">{session.file_number || 'RA-1Q0'}</span></span>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {session.status === 'completed' ? (
                  <button
                    onClick={handleStatusClick}
                    onMouseEnter={() => setIsHoveringStatus(true)}
                    onMouseLeave={() => setIsHoveringStatus(false)}
                    className={cn(
                      "text-sm px-3 py-1 rounded-full border transition-all",
                      statusConfig.completed.color,
                      "hover:bg-orange-500/20 hover:text-orange-300 hover:border-orange-500/30 cursor-pointer"
                    )}
                  >
                    {isHoveringStatus ? "Mark In-Progress" : statusConfig.completed.label}
                  </button>
                ) : (
                  <Badge className={cn("text-sm", statusConfig[session.status]?.color)}>
                    {statusConfig[session.status]?.label}
                  </Badge>
                )}
                <Badge className={cn("text-sm", riskConfig[session.risk_rating || 'low']?.color)}>
                  {riskConfig[session.risk_rating || 'low']?.label}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <CompactMetric label="Questions" value={actualQuestionsAnswered} />
              <CompactMetric label="Follow-Ups" value={actualFollowupsTriggered} />
              <CompactMetric label="Red Flags" value={session.red_flags?.length || 0} color="red" />
              <CompactMetric label="Completion" value={`${actualCompletion}%`} />
            </div>
          </CardContent>
        </Card>

        <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-sm border border-slate-700 rounded-lg p-3 md:p-4 mb-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 md:gap-3 items-center">
            <div className="lg:col-span-4 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                placeholder="Search questions or answers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-slate-800 border-slate-600 text-white text-sm h-9"
              />
            </div>

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
                  Found {filteredResponsesWithNumbers.length} of {responses.length} result{filteredResponsesWithNumbers.length !== 1 ? 's' : ''}
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

        {responses.length === 0 ? (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-12 text-center">
              <FileText className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">No responses recorded yet</p>
            </CardContent>
          </Card>
        ) : viewMode === "structured" ? (
          <TwoColumnStreamView
            responsesByCategory={responsesByCategory}
            followups={followups}
            categoryRefs={categoryRefs}
            collapsedSections={collapsedSections}
            toggleSection={toggleSection}
            expandedQuestions={expandedQuestions}
            toggleQuestionExpanded={toggleQuestionExpanded}
          />
        ) : (
          <TranscriptView
            responses={filteredResponsesWithNumbers}
            followups={followups}
          />
        )}

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

        <Dialog open={showStatusConfirm} onOpenChange={setShowStatusConfirm}>
          <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">Revert to In-Progress?</DialogTitle>
              <DialogDescription className="text-slate-300 pt-3">
                This will mark the interview as in-progress and allow the candidate to continue answering questions.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowStatusConfirm(false)}
                className="flex-1 bg-slate-800 border-slate-600 text-white hover:bg-slate-700"
              >
                Cancel
              </Button>
              <Button
                onClick={handleRevertToInProgress}
                className="flex-1 bg-orange-600 hover:bg-orange-700"
              >
                Confirm
              </Button>
            </div>
          </DialogContent>
        </Dialog>
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

function TwoColumnStreamView({ responsesByCategory, followups, categoryRefs, collapsedSections, toggleSection, expandedQuestions, toggleQuestionExpanded }) {
  return (
    <div className="space-y-0">
      {Object.entries(responsesByCategory).map(([category, categoryResponses]) => {
        const isSectionCollapsed = collapsedSections.has(category);

        // Sort by display_number for vertical column layout
        const sortedResponses = [...categoryResponses].sort((a, b) => a.display_number - b.display_number);
        
        // Split vertically: first half in left column, second half in right
        const midpoint = Math.ceil(sortedResponses.length / 2);
        const leftColumn = sortedResponses.slice(0, midpoint);
        const rightColumn = sortedResponses.slice(midpoint);

        return (
          <div key={category} className={isSectionCollapsed ? "mb-0" : "mb-6"}>
            <div
              ref={el => categoryRefs.current[category] = el}
              className="sticky top-28 md:top-32 bg-slate-800 border-l-4 border-blue-500 py-3 px-4 mb-0 z-10 flex items-center justify-between"
            >
              <h2 className="text-sm font-bold text-white uppercase tracking-wide">{category}</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCollapsedSections(toggleSection(category))}
                className="text-slate-300 hover:text-white hover:bg-slate-700 h-8 px-2"
              >
                {isSectionCollapsed ? (
                  <ChevronRight className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </Button>
            </div>

            {!isSectionCollapsed && (
              <div className="bg-slate-900/30 border border-slate-700 border-t-0 mb-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-700">
                  <div className="divide-y divide-slate-700/50">
                    {leftColumn.map(response => (
                      <CompactQuestionRow
                        key={response.id}
                        response={response}
                        followups={followups.filter(f => f.response_id === response.id)}
                        isExpanded={expandedQuestions.has(response.id)}
                        onToggleExpand={() => toggleQuestionExpanded(response.id)}
                      />
                    ))}
                  </div>
                  <div className="divide-y divide-slate-700/50">
                    {rightColumn.map(response => (
                      <CompactQuestionRow
                        key={response.id}
                        response={response}
                        followups={followups.filter(f => f.response_id === response.id)}
                        isExpanded={expandedQuestions.has(response.id)}
                        onToggleExpand={() => toggleQuestionExpanded(response.id)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CompactQuestionRow({ response, followups, isExpanded, onToggleExpand }) {
  const hasFollowups = followups.length > 0 || (response.investigator_probing?.length > 0);
  const answerLetter = response.answer === "Yes" ? "Y" : "N";
  const questionNumber = response.display_number.toString().padStart(3, '0');
  const aiProbingExchanges = response.investigator_probing || [];
  const showSummary = response.answer === "Yes" && response.question_id !== US_CITIZENSHIP_QUESTION_ID && hasFollowups;
  const summary = response.investigator_summary || null;

  return (
    <div className="py-2 px-3 hover:bg-slate-800/30 transition-colors">
      {/* Question Line */}
      <div className="flex items-start gap-3 text-sm mb-2">
        <span className="font-mono text-blue-400 font-medium flex-shrink-0">Q{questionNumber}</span>
        <span className={cn(
          "font-bold flex-shrink-0 w-5",
          response.answer === "Yes" ? "text-green-400" : "text-slate-500"
        )}>
          {answerLetter}
        </span>
        <span className="text-slate-300 flex-1 break-words leading-relaxed">
          {response.question_text}
        </span>
      </div>

      {/* Investigator Summary Row - Always visible for Yes with followups */}
      {showSummary && (
        <div className="flex items-start gap-3 mb-2">
          <span className="font-mono flex-shrink-0 opacity-0 pointer-events-none">Q{questionNumber}</span>
          <span className="flex-shrink-0 w-5 opacity-0 pointer-events-none">{answerLetter}</span>
          <div 
            className="flex-1 bg-slate-800/40 border border-slate-600/50 rounded px-3 py-2.5 flex items-center justify-between cursor-pointer hover:bg-slate-800/60 transition-colors group"
            onClick={onToggleExpand}
          >
            {summary ? (
              <p className="text-xs text-slate-300 italic flex-1 leading-relaxed">
                {summary}
              </p>
            ) : (
              <p className="text-xs text-slate-500 italic flex-1 leading-relaxed">
                No summary available
              </p>
            )}
            {isExpanded ? (
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-300 flex-shrink-0 ml-3 transition-colors" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-300 flex-shrink-0 ml-3 transition-colors" />
            )}
          </div>
        </div>
      )}

      {/* Expandable Blue Section - Detail Card + Probing */}
      {isExpanded && hasFollowups && response.answer === "Yes" && (
        <div className="flex items-start gap-3">
          <span className="font-mono flex-shrink-0 opacity-0 pointer-events-none">Q{questionNumber}</span>
          <span className="flex-shrink-0 w-5 opacity-0 pointer-events-none">{answerLetter}</span>
          <div className="flex-1 bg-slate-800/50 rounded border border-slate-700/50 p-3">
            <div className="space-y-3">
              {/* Deterministic Follow-Up Details */}
              {followups.map((followup, idx) => {
                const details = followup.additional_details || {};

                return (
                  <div key={idx} className="space-y-1.5">
                    {followup.substance_name && (
                      <div className="text-xs flex items-center">
                        <span className="text-slate-400 font-medium">Substance:</span>
                        <span className="text-slate-200 ml-2">{followup.substance_name}</span>
                        {needsReview(followup.substance_name) && (
                          <Badge className="ml-2 text-xs bg-yellow-500/20 text-yellow-300 border-yellow-500/30 flex-shrink-0">
                            Needs Review
                          </Badge>
                        )}
                      </div>
                    )}

                    {Object.entries(details).map(([key, value]) => {
                      const requiresReview = needsReview(value);
                      return (
                        <div key={key} className="text-xs flex items-start">
                          <span className="text-slate-400">
                            {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:
                          </span>
                          <span className="text-slate-200 ml-2 break-words">{value}</span>
                          {requiresReview && (
                            <Badge className="ml-2 text-xs bg-yellow-500/20 text-yellow-300 border-yellow-500/30 flex-shrink-0">
                              Needs Review
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* AI Investigator Probing Section */}
              {aiProbingExchanges.length > 0 && (
                <div className="border-t border-slate-600/50 pt-3 space-y-2 ml-3">
                  <div className="text-xs font-semibold text-purple-400 mb-2">
                    🔍 Investigator Probing ({aiProbingExchanges.length} exchanges)
                  </div>
                  {aiProbingExchanges.map((exchange, idx) => (
                    <div key={idx} className="space-y-1.5 pl-2 border-l-2 border-purple-500/30">
                      <div className="text-xs">
                        <span className="text-blue-400 font-medium">Follow-Up Question:</span>
                        <p className="text-slate-200 mt-0.5 break-words leading-relaxed">{exchange.probing_question}</p>
                      </div>
                      <div className="text-xs">
                        <span className="text-orange-400 font-medium">Candidate Response:</span>
                        <p className="text-orange-200 mt-0.5 break-words leading-relaxed">{exchange.candidate_response}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
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
    const aiProbingExchanges = response.investigator_probing || [];
    
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
        
        {aiProbingExchanges.length > 0 && (
          <div className="ml-4 md:ml-8 space-y-2 mt-3 pt-3 border-t border-purple-500/30">
            <div className="text-xs font-semibold text-purple-400 mb-2">
              🔍 Investigator Probing ({aiProbingExchanges.length} exchanges)
            </div>
            {aiProbingExchanges.map((exchange, idx) => (
              <React.Fragment key={idx}>
                <div className="bg-purple-950/30 border border-purple-800/50 rounded-lg p-3">
                  <p className="text-xs text-blue-400 font-medium">Follow-Up Question {idx + 1}</p>
                  <p className="text-white text-sm mt-1 break-words leading-relaxed">{exchange.probing_question}</p>
                </div>
                <div className="flex justify-end">
                  <div className="bg-orange-600 rounded-lg px-4 py-2 max-w-md">
                    <p className="text-white text-sm break-words">{exchange.candidate_response}</p>
                  </div>
                </div>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (item.type === 'followup') {
    const followup = item.data;
    const details = followup.additional_details || {};

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

function generateReportHTML(session, responses, followups, questions, department, totalQuestions) {
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
  
  const questionCount = totalQuestions || questions.length || responses.length;

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

        .probing-section {
          margin-left: 32px;
          margin-top: 12px;
          padding: 8px;
          background: #f3e8ff;
          border-left: 3px solid #9333ea;
          page-break-inside: avoid;
        }

        .probing-title {
          font-weight: bold;
          color: #7c3aed;
          font-size: 9pt;
          margin-bottom: 6px;
        }

        .probing-exchange {
          margin: 6px 0;
          padding: 4px;
          background: white;
          border: 1px solid #e9d5ff;
        }

        .probing-question {
          font-weight: bold;
          font-size: 8pt;
          color: #7c3aed;
        }

        .probing-answer {
          font-size: 9pt;
          margin-left: 12px;
          margin-top: 2px;
          color: #ff6600;
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
          <strong>Questions Answered:</strong> ${responses.length} / ${questionCount}<br>
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
            const aiProbingExchanges = response.investigator_probing || [];

            return `
              <div class="question-block">
                <div class="question-id">${response.question_id}</div>
                <div class="question-text">${response.question_text}</div>
                <div class="answer">
                  <span class="answer-label">Response:</span> <strong>${response.answer}</strong>
                </div>

                ${response.answer === 'Yes' && response.investigator_summary ? `
                  <div class="answer" style="margin-top: 8px;">
                    <span class="answer-label">Investigator Summary:</span> <em>${response.investigator_summary}</em>
                  </div>
                ` : ''}

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

                ${aiProbingExchanges.length > 0 ? `
                  <div class="probing-section">
                    <div class="probing-title">🔍 Investigator Probing (${aiProbingExchanges.length} exchanges)</div>
                    ${aiProbingExchanges.map((exchange, idx) => `
                      <div class="probing-exchange">
                        <div class="probing-question">Follow-Up Question ${idx + 1}:</div>
                        <div style="margin-left: 12px; margin-bottom: 4px;">${exchange.probing_question}</div>
                        <div class="probing-question">Candidate Response:</div>
                        <div class="probing-answer">${exchange.candidate_response}</div>
                      </div>
                    `).join('')}
                  </div>
                ` : ''}
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
