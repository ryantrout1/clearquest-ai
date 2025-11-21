import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, AlertTriangle, Download, Loader2,
  ChevronDown, ChevronRight, Search,
  ChevronsDown, ChevronsUp, ToggleLeft, ToggleRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SectionHeader from "../components/sessionDetails/SectionHeader";
import GlobalAIAssist from "../components/sessionDetails/GlobalAIAssist";
import { Clock } from "lucide-react";

const REVIEW_KEYWORDS = [
  'arrest', 'fired', 'failed', 'polygraph', 'investigated',
  'suspended', 'terminated', 'dui', 'drugs', 'felony', 'charge',
  'conviction', 'probation', 'parole', 'violence', 'assault', 'disqualified'
];

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
  const [sections, setSections] = useState([]);
  const [department, setDepartment] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  
  const [totalQuestions, setTotalQuestions] = useState(null);
  const [expandedQuestions, setExpandedQuestions] = useState(new Set());
  
  const [isHoveringStatus, setIsHoveringStatus] = useState(false);
  const [showStatusConfirm, setShowStatusConfirm] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [showOnlyFollowUps, setShowOnlyFollowUps] = useState(false);
  const [viewMode, setViewMode] = useState("structured");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [collapsedSections, setCollapsedSections] = useState(new Set());
  const [isDeletingLast, setIsDeletingLast] = useState(false);
  const [followUpQuestionEntities, setFollowUpQuestionEntities] = useState([]);
  const [isGeneratingSummaries, setIsGeneratingSummaries] = useState(false);

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

      const [responsesData, followupsData, questionsData, sectionsData, followUpQuestionsData] = await Promise.all([
        base44.entities.Response.filter({ session_id: sessionId }),
        base44.entities.FollowUpResponse.filter({ session_id: sessionId }),
        base44.entities.Question.filter({ active: true }),
        base44.entities.Section.list(),
        base44.entities.FollowUpQuestion.list()
      ]);

      // DIAGNOSTIC LOG: Inspect raw session data
      console.log("[SESSION DETAILS RAW DATA]", {
        sessionId,
        responsesCount: responsesData.length,
        followupsCount: followupsData.length,
        followUpQuestionEntitiesCount: followUpQuestionsData.length,
        sampleFollowup: followupsData[0],
        sampleFollowUpQuestion: followUpQuestionsData.find(q => q.followup_pack_id === 'PACK_LE_APPS')
      });
      
      // DIAGNOSTIC: Log PACK_LE_APPS question metadata
      const packLeAppsQuestions = followUpQuestionsData.filter(q => q.followup_pack_id === 'PACK_LE_APPS');
      console.log("[FOLLOWUP QUESTION METADATA] PACK_LE_APPS", {
        totalQuestions: packLeAppsQuestions.length,
        questions: packLeAppsQuestions.map(q => ({
          id: q.id,
          pack: q.followup_pack_id,
          displayOrder: q.display_order,
          text: q.question_text
        }))
      });

      setResponses(responsesData);
      setFollowups(followupsData);
      setQuestions(questionsData);
      setSections(sectionsData);
      setFollowUpQuestionEntities(followUpQuestionsData);
      
      setTotalQuestions(questionsData.length);
      setExpandedQuestions(new Set());
      setIsLoading(false);
    } catch (err) {
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
      toast.error('Failed to update status');
    }
  };

  const handleContinueInterview = () => {
    navigate(createPageUrl("CandidateInterview") + `?session=${sessionId}`);
  };

  const allResponsesWithNumbers = responses.map((r, idx) => {
    // Prefer question_number from Question entity, fallback to sequential index
    const questionEntity = questions.find(q => q.question_id === r.question_id);
    const displayNumber = questionEntity?.question_number || (idx + 1);
    
    // Get section name from Section entity
    const sectionEntity = sections.find(s => s.id === questionEntity?.section_id);
    const sectionName = sectionEntity?.section_name || r.category || '';
    
    return {
      ...r,
      display_number: displayNumber,
      section_name: sectionName
    };
  }).sort((a, b) => {
    // Sort by question_number first, then timestamp as tiebreaker
    if (typeof a.display_number === 'number' && typeof b.display_number === 'number') {
      if (a.display_number !== b.display_number) {
        return a.display_number - b.display_number;
      }
    }
    return new Date(a.response_timestamp) - new Date(b.response_timestamp);
  });

  const categories = [...new Set(allResponsesWithNumbers.map(r => r.section_name))].filter(Boolean).sort();

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
    const cat = r.section_name || 'Other';
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
    setCollapsedSections(prev => {
      const newCollapsed = new Set(prev);
      if (newCollapsed.has(category)) {
        newCollapsed.delete(category);
      } else {
        newCollapsed.add(category);
      }
      return newCollapsed;
    });
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

  const handleDeleteLastQuestion = async () => {
    if (responses.length === 0) {
      toast.error("No questions to delete");
      return;
    }

    setIsDeletingLast(true);

    try {
      const sortedResponses = [...responses].sort((a, b) =>
        new Date(b.response_timestamp) - new Date(a.response_timestamp)
      );
      const lastResponse = sortedResponses[0];

      const relatedFollowups = followups.filter(f => f.response_id === lastResponse.id);
      
      for (const followup of relatedFollowups) {
        await base44.entities.FollowUpResponse.delete(followup.id);
      }

      await base44.entities.Response.delete(lastResponse.id);

      await base44.entities.InterviewSession.update(sessionId, {
        status: 'in_progress',
        completed_at: null,
        completed_date: null,
        total_questions_answered: responses.length - 1
      });

      toast.success("Last question deleted successfully");
      await loadSessionData();

    } catch (err) {
      toast.error("Failed to delete last question");
      console.error(err);
    } finally {
      setIsDeletingLast(false);
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
      toast.error("Failed to generate report");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleGenerateSummaries = async () => {
    setIsGeneratingSummaries(true);

    try {
      const result = await base44.functions.invoke('generateSessionSummaries', {
        session_id: sessionId
      });

      if (result.data.success) {
        const { updatedCount, globalSummaryGenerated, sectionSummariesGenerated } = result.data;
        toast.success(`AI summaries updated: ${updatedCount} questions, global summary, and ${sectionSummariesGenerated} sections`);
        await loadSessionData(); // Reload to show new summaries
      } else {
        toast.error('Failed to generate summaries');
      }
    } catch (err) {
      console.error('Error generating summaries:', err);
      toast.error('Failed to generate summaries');
    } finally {
      setIsGeneratingSummaries(false);
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
    active: { label: "In-Progress", color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
    in_progress: { label: "In-Progress", color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
    completed: { label: "Completed", color: "bg-green-500/20 text-green-300 border-green-500/30" },
    paused: { label: "Paused", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
    under_review: { label: "Under Review", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" }
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

  // Calculate time metrics
  const calculateTimeMetrics = () => {
    if (responses.length === 0) return { avgTime: 0, totalTime: 0 };
    
    const sorted = [...responses].sort((a, b) => 
      new Date(a.response_timestamp) - new Date(b.response_timestamp)
    );
    
    const timeDiffs = [];
    for (let i = 1; i < sorted.length; i++) {
      const diff = (new Date(sorted[i].response_timestamp) - new Date(sorted[i - 1].response_timestamp)) / 1000;
      if (diff < 300) timeDiffs.push(diff);
    }
    
    const avgTime = timeDiffs.length > 0 
      ? Math.round(timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length)
      : 0;
    
    const totalTime = sorted.length > 1
      ? Math.round((new Date(sorted[sorted.length - 1].response_timestamp) - new Date(sorted[0].response_timestamp)) / 60000)
      : 0;
    
    return { avgTime, totalTime };
  };

  const { avgTime, totalTime } = calculateTimeMetrics();
  
  const yesCount = responses.filter(r => r.answer === 'Yes').length;
  const noCount = responses.filter(r => r.answer === 'No').length;
  const yesPercent = responses.length > 0 ? ((yesCount / responses.length) * 100).toFixed(1) : 0;
  const noPercent = responses.length > 0 ? ((noCount / responses.length) * 100).toFixed(1) : 0;

  const handleStatusChange = async (newStatus) => {
    try {
      const updateData = { status: newStatus };
      if (newStatus === 'in_progress') {
        updateData.completed_at = null;
        updateData.completed_date = null;
      } else if (newStatus === 'completed' && !session.completed_at) {
        updateData.completed_at = new Date().toISOString();
        updateData.completed_date = new Date().toISOString();
      }
      
      await base44.entities.InterviewSession.update(sessionId, updateData);
      setSession({ ...session, ...updateData });
      toast.success(`Interview marked as ${newStatus === 'in_progress' ? 'In Progress' : newStatus === 'completed' ? 'Completed' : newStatus}`);
    } catch (err) {
      toast.error('Failed to update status');
    }
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

        {/* Case Overview Header */}
        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 mb-4">
          <CardContent className="p-6">
            {/* Department Name + Status Row */}
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
              <div className="flex-1">
                <h1 className="text-3xl font-bold text-white mb-3">
                  {department?.department_name || session.department_code}
                </h1>
                
                {/* Dept Code, File, Dates */}
                <div className="space-y-1.5 text-sm text-slate-400">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span>Dept Code: <span className="font-mono text-slate-300">{session.department_code}</span></span>
                    <span className="text-slate-600">•</span>
                    <span>File: <span className="font-mono text-slate-300">{session.file_number}</span></span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span>Interview Date: <span className="text-slate-300">
                      {session.started_at ? new Date(session.started_at).toLocaleDateString('en-US', { 
                        year: 'numeric', month: 'long', day: 'numeric' 
                      }) : 'N/A'}
                    </span></span>
                    <span className="text-slate-600">•</span>
                    <span>Last Updated: <span className="text-slate-300">
                      {session.updated_date ? new Date(session.updated_date).toLocaleDateString('en-US', { 
                        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                      }) : 'N/A'}
                    </span></span>
                  </div>
                </div>

                {/* Time Pills */}
                <div className="flex flex-wrap gap-2 mt-3">
                  {avgTime > 0 && (
                    <Badge variant="outline" className="text-xs bg-slate-700/50 text-slate-300 border-slate-600">
                      <Clock className="w-3 h-3 mr-1" />
                      Avg. {avgTime}s per question
                    </Badge>
                  )}
                  {totalTime > 0 && (
                    <Badge variant="outline" className="text-xs bg-slate-700/50 text-slate-300 border-slate-600">
                      <Clock className="w-3 h-3 mr-1" />
                      Total time: {totalTime} min
                    </Badge>
                  )}
                </div>
              </div>

              {/* Generate AI Summaries + Status Pill */}
              <div className="flex flex-col items-end gap-2">
                <Button
                  onClick={handleGenerateSummaries}
                  disabled={isGeneratingSummaries || responses.length === 0}
                  size="sm"
                  className="bg-purple-600 hover:bg-purple-700 text-white h-10"
                >
                  {isGeneratingSummaries ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating AI Summaries...
                    </>
                  ) : (
                    <>
                      <span className="text-lg mr-2">🧠</span>
                      Generate AI Summaries
                    </>
                  )}
                </Button>

                <button
                  onClick={() => {
                    if (session.status === 'completed') {
                      handleStatusChange('in_progress');
                    }
                  }}
                  onMouseEnter={() => setIsHoveringStatus(true)}
                  onMouseLeave={() => setIsHoveringStatus(false)}
                  disabled={session.status !== 'completed'}
                  className={cn(
                    "text-sm px-3 py-1.5 rounded-full border transition-all font-medium",
                    session.status === 'completed' && "cursor-pointer hover:opacity-90",
                    session.status !== 'completed' && "cursor-default",
                    statusConfig[session.status]?.color
                  )}
                >
                  {session.status === 'completed' && isHoveringStatus 
                    ? "Mark In-Progress" 
                    : statusConfig[session.status]?.label || session.status}
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPI Cards Row */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          <KPICard
            label="QUESTIONS"
            value={`${actualQuestionsAnswered} / ${totalQuestions || 207}`}
            subtext={`${actualCompletion}% Complete`}
            variant="neutral"
          />
          <KPICard
            label="YES RESPONSES"
            value={yesCount}
            subtext={`${yesPercent}% of total`}
            variant="yes"
          />
          <KPICard
            label="NO RESPONSES"
            value={noCount}
            subtext={`${noPercent}% of total`}
            variant="no"
          />
          <KPICard
            label="FOLLOW-UPS"
            value={actualFollowupsTriggered}
            subtext={actualFollowupsTriggered > 0 ? "Triggered" : "None"}
            variant="followups"
          />
          <KPICard
            label="RED FLAGS"
            value={session.red_flags?.length || 0}
            subtext={session.red_flags?.length > 0 ? "Identified" : "None"}
            variant="redflags"
          />
          <KPICard
            label="COMPLETION"
            value={`${actualCompletion}%`}
            subtext={actualCompletion === 100 ? "Complete" : "In Progress"}
            variant="completion"
          />
        </div>

        {/* Global AI Investigator Assist */}
        <GlobalAIAssist session={session} />

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

        {viewMode === "structured" ? (
          <TwoColumnStreamView
            responsesByCategory={responsesByCategory}
            followups={followups}
            followUpQuestionEntities={followUpQuestionEntities}
            categoryRefs={categoryRefs}
            collapsedSections={collapsedSections}
            toggleSection={toggleSection}
            expandedQuestions={expandedQuestions}
            toggleQuestionExpanded={toggleQuestionExpanded}
            sections={sections}
            session={session}
          />
        ) : (
          <TranscriptView
            responses={filteredResponsesWithNumbers}
            followups={followups}
            followUpQuestionEntities={followUpQuestionEntities}
          />
        )}

        {responses.length > 0 && (
          <div className="mt-6 flex justify-center">
            <Button
              onClick={handleDeleteLastQuestion}
              disabled={isDeletingLast}
              variant="outline"
              className="bg-red-950/30 border-red-800/50 text-red-300 hover:bg-red-950/50 hover:text-red-200"
            >
              {isDeletingLast ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  Delete Last Question
                </>
              )}
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

function KPICard({ label, value, subtext, variant = "neutral" }) {
  const kpiColors = {
    neutral: {
      bg: "bg-slate-800/50",
      border: "border-slate-700",
      valueText: "text-white"
    },
    yes: {
      bg: "bg-emerald-900/40",
      border: "border-emerald-700/40",
      valueText: "text-white"
    },
    no: {
      bg: "bg-slate-700/50",
      border: "border-slate-600/50",
      valueText: "text-white"
    },
    followups: {
      bg: "bg-amber-900/40",
      border: "border-amber-700/40",
      valueText: "text-white"
    },
    redflags: {
      bg: "bg-red-900/40",
      border: "border-red-700/50",
      valueText: "text-white"
    },
    completion: {
      bg: "bg-indigo-800/50",
      border: "border-indigo-600/50",
      valueText: "text-white"
    }
  };

  const colors = kpiColors[variant] || kpiColors.neutral;

  return (
    <Card className={cn(
      "backdrop-blur-sm transition-colors",
      colors.bg,
      colors.border
    )}>
      <CardContent className="p-4">
        <div className="text-xs text-slate-400 mb-1 uppercase tracking-wide">{label}</div>
        <div className={cn("text-2xl font-bold mb-1", colors.valueText)}>
          {value}
        </div>
        <div className="text-xs text-slate-500">{subtext}</div>
      </CardContent>
    </Card>
  );
}

function TwoColumnStreamView({ responsesByCategory, followups, followUpQuestionEntities, categoryRefs, collapsedSections, toggleSection, expandedQuestions, toggleQuestionExpanded, sections, session }) {
  // Flatten all responses for global context
  const allResponsesFlat = Object.values(responsesByCategory).flat();
  
  // Sort categories by section_order from Section entities
  const sortedCategories = Object.entries(responsesByCategory).sort((a, b) => {
    const sectionA = sections.find(s => s.section_name === a[0]);
    const sectionB = sections.find(s => s.section_name === b[0]);
    const orderA = sectionA?.section_order ?? 999;
    const orderB = sectionB?.section_order ?? 999;
    return orderA - orderB;
  });
  
  return (
    <div className="space-y-0">
      {sortedCategories.map(([category, categoryResponses]) => {
        const isSectionCollapsed = collapsedSections.has(category);

        const sortedResponses = [...categoryResponses].sort((a, b) => {
          const aNum = typeof a.display_number === "number" ? a.display_number : Infinity;
          const bNum = typeof b.display_number === "number" ? b.display_number : Infinity;
          
          if (aNum !== bNum) {
            return aNum - bNum;
          }
          
          return new Date(a.response_timestamp).getTime() - new Date(b.response_timestamp).getTime();
        });
        
        const midpoint = Math.ceil(sortedResponses.length / 2);
        const leftColumn = sortedResponses.slice(0, midpoint);
        const rightColumn = sortedResponses.slice(midpoint);

        return (
          <div key={category} className={isSectionCollapsed ? "mb-0" : "mb-6"}>
            <div ref={el => categoryRefs.current[category] = el}>
              <SectionHeader
                category={category}
                allResponses={allResponsesFlat}
                allFollowups={followups}
                isCollapsed={isSectionCollapsed}
                onToggle={() => toggleSection(category)}
                sectionAISummary={session.section_ai_summaries?.[category]}
              />
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
                        followUpQuestionEntities={followUpQuestionEntities}
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
                        followUpQuestionEntities={followUpQuestionEntities}
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

function CompactQuestionRow({ response, followups, followUpQuestionEntities, isExpanded, onToggleExpand }) {
  const hasFollowups = followups.length > 0 || (response.investigator_probing?.length > 0);
  const answerLetter = response.answer === "Yes" ? "Y" : "N";
  const displayNumber = typeof response.display_number === "number" ? response.display_number : parseInt(response.question_id?.replace(/\D/g, '') || '0', 10);
  const questionNumber = displayNumber.toString().padStart(3, '0');
  const aiProbingExchanges = response.investigator_probing || [];
  const showSummary = response.answer === "Yes" && response.question_id !== US_CITIZENSHIP_QUESTION_ID && hasFollowups;
  const summary = response.investigator_summary || null;
  
  // Group followups by instance_number
  const followupsByInstance = {};
  followups.forEach(fu => {
    const instanceNum = fu.instance_number || 1;
    if (!followupsByInstance[instanceNum]) {
      followupsByInstance[instanceNum] = [];
    }
    followupsByInstance[instanceNum].push(fu);
  });
  
  const instanceNumbers = Object.keys(followupsByInstance).map(n => parseInt(n)).sort((a, b) => a - b);
  const hasMultipleInstances = instanceNumbers.length > 1;
  
  // DIAGNOSTIC: Multi-instance summary
  if (followups.length > 0) {
    console.log("[MI SUMMARY - SESSION DETAILS]", {
      baseQuestionId: response.question_id,
      baseQuestionCode: response.question_id,
      followupPackId: followups[0]?.followup_pack,
      instancesCount: instanceNumbers.length,
      instances: instanceNumbers.map(num => ({
        instanceNumber: num,
        detailKeys: Object.keys(followupsByInstance[num][0]?.additional_details || {})
      }))
    });
  }

  return (
    <div className="py-2 px-3 hover:bg-slate-800/30 transition-colors">
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
                No summary available. Use 'Generate AI Summaries' to create one.
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

      {isExpanded && hasFollowups && response.answer === "Yes" && (
        <div className="flex items-start gap-3">
          <span className="font-mono flex-shrink-0 opacity-0 pointer-events-none">Q{questionNumber}</span>
          <span className="flex-shrink-0 w-5 opacity-0 pointer-events-none">{answerLetter}</span>
          <div className="flex-1 bg-slate-800/50 rounded border border-slate-700/50 p-3">
            <div className="space-y-4">
              {hasMultipleInstances && (
                <div className="text-xs font-semibold text-cyan-400 mb-2">
                  🔁 {instanceNumbers.length} Instances Recorded
                </div>
              )}
              
              {instanceNumbers.map((instanceNum) => {
                const instanceFollowups = followupsByInstance[instanceNum];
                
                return (
                  <div key={instanceNum} className={cn(
                    "space-y-3",
                    hasMultipleInstances && "border-l-2 border-cyan-500/30 pl-3"
                  )}>
                    {hasMultipleInstances && (
                      <div className="text-xs font-semibold text-cyan-400">
                        Instance {instanceNum}
                      </div>
                    )}
                    
                    {instanceFollowups.map((followup, idx) => {
                      const details = followup.additional_details || {};
                      const packQuestions = followUpQuestionEntities
                        .filter(q => q.followup_pack_id === followup.followup_pack)
                        .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
                      
                      // Helper to resolve question text from followup_question_id
                      const getFollowupQuestionText = (detailKey) => {
                        const match = packQuestions.find(q => q.followup_question_id === detailKey);
                        return match?.question_text || detailKey;
                      };
                      
                      // Extract probing from additional_details if stored there (multi-instance)
                      const probingFromDetails = details.investigator_probing || [];
                      const hasInstanceProbing = probingFromDetails.length > 0;

                      return (
                        <div key={idx} className="space-y-1.5">
                          {followup.substance_name && (
                            <div className="text-xs flex items-start">
                              <span className="text-slate-400 font-medium">Substance:</span>
                              <span className="text-slate-200 ml-2">{followup.substance_name}</span>
                              {needsReview(followup.substance_name) && (
                                <Badge className="ml-2 text-xs bg-yellow-500/20 text-yellow-300 border-yellow-500/30 flex-shrink-0">
                                  Needs Review
                                </Badge>
                              )}
                            </div>
                          )}

                          {Object.entries(details).filter(([key]) => key !== 'investigator_probing').map(([key, value]) => {
                            const requiresReview = needsReview(value);
                            const label = getFollowupQuestionText(key);

                            return (
                              <div key={key} className="text-xs flex items-start">
                                <span className="text-slate-400 font-medium">
                                  {label}:
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
                          
                          {hasInstanceProbing && (
                            <div className="border-t border-slate-600/50 pt-2 mt-2 space-y-2">
                              <div className="text-xs font-semibold text-purple-400 mb-2">
                                🔍 Investigator Probing ({probingFromDetails.length} exchanges)
                              </div>
                              {probingFromDetails.map((exchange, eidx) => (
                                <div key={eidx} className="space-y-1.5 pl-2 border-l-2 border-purple-500/30">
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
                      );
                    })}
                  </div>
                );
              })}

              {aiProbingExchanges.length > 0 && !hasMultipleInstances && (
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

function TranscriptView({ responses, followups, followUpQuestionEntities }) {

  // Sort by canonical question order
  const sortedResponses = [...responses].sort((a, b) => {
    const aNum = typeof a.display_number === "number" ? a.display_number : Infinity;
    const bNum = typeof b.display_number === "number" ? b.display_number : Infinity;

    if (aNum !== bNum) {
      return aNum - bNum;
    }

    const aTime = new Date(a.response_timestamp).getTime();
    const bTime = new Date(b.response_timestamp).getTime();
    return aTime - bTime;
  });

  const timeline = [];

  sortedResponses.forEach(response => {
    timeline.push({ type: 'question', data: response });

    const relatedFollowups = followups.filter(f => f.response_id === response.id);
    
    // Group by instance_number
    const followupsByInstance = {};
    relatedFollowups.forEach(fu => {
      const instanceNum = fu.instance_number || 1;
      if (!followupsByInstance[instanceNum]) {
        followupsByInstance[instanceNum] = [];
      }
      followupsByInstance[instanceNum].push(fu);
    });
    
    const instanceNumbers = Object.keys(followupsByInstance).map(n => parseInt(n)).sort((a, b) => a - b);
    
    instanceNumbers.forEach(instanceNum => {
      const instanceFollowups = followupsByInstance[instanceNum];
      instanceFollowups.forEach(fu => {
        timeline.push({ type: 'followup', data: fu, followUpQuestionEntities, instanceNumber: instanceNum, totalInstances: instanceNumbers.length });
      });
      
      // Show probing for this instance if stored in additional_details
      const firstFollowup = instanceFollowups[0];
      if (firstFollowup?.additional_details?.investigator_probing?.length > 0) {
        timeline.push({ 
          type: 'probing', 
          data: firstFollowup.additional_details.investigator_probing, 
          questionId: response.question_id,
          instanceNumber: instanceNum,
          totalInstances: instanceNumbers.length
        });
      }
    });

    // Legacy single-instance probing stored on Response
    if (response.investigator_probing && response.investigator_probing.length > 0 && instanceNumbers.length === 1) {
      timeline.push({ type: 'probing', data: response.investigator_probing, questionId: response.question_id });
    }
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
    const displayNum = response.display_number ? `Q${response.display_number.toString().padStart(3, '0')}` : response.question_id;
    
    return (
      <div className="space-y-2">
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <Badge variant="outline" className="text-xs text-blue-400 border-blue-500/30">
              {displayNum}
            </Badge>
            <span className="text-xs text-slate-400">{response.section_name || response.category}</span>
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
    const followUpQuestionEntities = item.followUpQuestionEntities || [];
    const packQuestions = followUpQuestionEntities.filter(
      q => q.followup_pack_id === followup.followup_pack
    ).sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    
    const instanceNum = item.instanceNumber || 1;
    const totalInstances = item.totalInstances || 1;
    const showInstanceLabel = totalInstances > 1;

    return (
      <div className={cn("ml-4 md:ml-8 space-y-2", showInstanceLabel && "border-l-2 border-cyan-500/30 pl-4")}>
        {showInstanceLabel && (
          <div className="text-xs font-semibold text-cyan-400 -ml-4 mb-2">
            Instance {instanceNum}
          </div>
        )}
        
        {followup.substance_name && (
          <>
            <div className="bg-orange-950/30 border border-orange-800/50 rounded-lg p-3">
              <p className="text-white text-sm">What substance did you use?</p>
            </div>
            <div className="flex justify-end">
              <div className="bg-orange-600 rounded-lg px-4 py-2 max-w-md">
                <p className="text-white text-sm font-medium">{followup.substance_name}</p>
              </div>
            </div>
          </>
        )}

        {Object.entries(details).filter(([key]) => key !== 'investigator_probing').map(([key, value]) => {
          const requiresReview = needsReview(value);
          
          // Helper to resolve question text from followup_question_id
          const match = packQuestions.find(q => q.followup_question_id === key);
          const label = match?.question_text || key;

          return (
            <React.Fragment key={key}>
              <div className="bg-orange-950/30 border border-orange-800/50 rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-white text-sm">
                    {label}
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

  if (item.type === 'probing') {
    const probingExchanges = item.data;
    const instanceNum = item.instanceNumber;
    const totalInstances = item.totalInstances || 1;
    const showInstanceLabel = totalInstances > 1 && instanceNum;
    
    return (
      <div className={cn("ml-4 md:ml-8 space-y-2 mt-3 pt-3 border-t border-purple-500/30", showInstanceLabel && "border-l-2 border-cyan-500/30 pl-4")}>
        <div className="text-xs font-semibold text-purple-400 mb-2">
          🔍 Investigator Probing{showInstanceLabel && ` - Instance ${instanceNum}`} ({probingExchanges.length} exchanges)
        </div>
        {probingExchanges.map((exchange, idx) => (
          <React.Fragment key={idx}>
            <div className="bg-purple-950/30 border border-purple-800/50 rounded-lg p-3">
              <p className="text-white text-sm break-words leading-relaxed">{exchange.probing_question}</p>
            </div>
            <div className="flex justify-end">
              <div className="bg-orange-600 rounded-lg px-4 py-2 max-w-md">
                <p className="text-white text-sm break-words">{exchange.candidate_response}</p>
              </div>
            </div>
          </React.Fragment>
        ))}
      </div>
    );
  }

  return null;
}

/**
 * FOLLOW-UP LABEL DIAGNOSTIC (PACK_LE_APPS and all packs)
 *
 * STATUS: Reverted to baseline behavior showing "PACK LE APPS Q#" labels
 * 
 * Findings from diagnostic logs:
 * 
 * 1. DATA STRUCTURE - FollowUpResponse entity:
 *    - followup_pack: "PACK_LE_APPS" (pack identifier)
 *    - additional_details: { key1: "value1", key2: "value2", ... }
 *    - The keys in additional_details are database field names (e.g., "agency_name", "application_date")
 *    - NO question_text or question_id stored on each detail entry
 * 
 * 2. DATA STRUCTURE - FollowUpQuestion entity:
 *    - followup_pack_id: "PACK_LE_APPS"
 *    - display_order: 1, 2, 3, 4 (step sequence)
 *    - question_text: "Which law enforcement agency did you apply to?", etc.
 *    - This metadata exists but is NOT joined with FollowUpResponse
 * 
 * 3. CURRENT RENDERING LOGIC:
 *    - SessionDetails iterates over Object.entries(followup.additional_details)
 *    - Each entry becomes: `${followup.followup_pack} Q${index + 1}: ${value}`
 *    - Result: "PACK LE APPS Q1: Yuma", "PACK LE APPS Q2: June 2012", etc.
 * 
 * 4. MISSING LINK:
 *    - There's NO reliable mapping between additional_details keys and FollowUpQuestion records
 *    - Keys like "agency_name" don't match any field on FollowUpQuestion
 *    - Display order from Object.entries() doesn't guarantee alignment with display_order
 * 
 * 5. ROOT CAUSE:
 *    - When FollowUpResponse is created, it stores raw field-value pairs in additional_details
 *    - The question text is NOT stored alongside each answer
 *    - SessionDetails has no way to look up "which question produced this answer"
 * 
 * 6. SOLUTION PATHS:
 *    
 *    Option A: Store question text snapshot when creating FollowUpResponse
 *    - Modify CandidateInterview to include question_text_snapshot in additional_details
 *    - Format: { "question_1_text": "Which agency?", "question_1_answer": "Yuma", ... }
 *    - Pro: Simple, works immediately, no joins needed
 *    - Con: Increases storage, snapshot could become stale if questions change
 *    
 *    Option B: Create deterministic key mapping
 *    - Define a standard mapping: PACK_LE_APPS Q1 = "agency_name", Q2 = "application_date"
 *    - Use FollowUpQuestion.display_order to match keys
 *    - Pro: No schema changes
 *    - Con: Fragile, requires maintenance, key names must stay stable
 *    
 *    Option C: Store question_id references in additional_details
 *    - Format: { "question_ids": ["q1_id", "q2_id"], "answers": ["Yuma", "June 2012"] }
 *    - Look up question text by ID at render time
 *    - Pro: Flexible, survives question text changes
 *    - Con: Requires refactor of how FollowUpResponse is created
 * 
 * RECOMMENDATION: Option A (snapshot) for immediate fix + stability
 * 
 * NO CHANGES IMPLEMENTED YET - This is diagnostic only
 * Check browser console for detailed logs with prefix:
 * - [SESSION DETAILS RAW DATA]
 * - [FOLLOWUP QUESTION METADATA] PACK_LE_APPS
 * - [FOLLOWUP INSTANCE DEBUG - Structured View]
 * - [FOLLOWUP DETAIL ENTRY]
 * - [TRANSCRIPT FOLLOWUP DETAIL]
 */

function generateReportHTML(session, responses, followups, questions, department, totalQuestions) {
  const now = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  const categorizedResponses = {};
  responses.forEach(response => {
    const category = response.section_name || response.category || 'Other';
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

            const displayNum = response.display_number ? `Q${response.display_number.toString().padStart(3, '0')}` : response.question_id;
            
            return `
              <div class="question-block">
                <div class="question-id">${displayNum}</div>
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