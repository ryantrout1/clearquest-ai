/**
 * ============================================================================
 * BASE44: Do not auto-fix other files when editing this file.
 *         Limit changes to this file only.
 * ============================================================================
 * 
 * DO NOT DELETE/RENAME: Canonical public candidate entry page required for routing.
 * 
 * This is the primary entry point for all candidate interviews. Removing or renaming
 * this file will break the interview workflow and prevent candidates from starting sessions.
 * 
 * Route: /startinterview
 * Purpose: Anonymous session creation + validation
 * Dependencies: CandidateInterview (interview UI), PublicAppShell (auth bypass)
 * 
 * Protected by: pages/_STARTINTERVIEW_SENTINEL.js
 */

import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import PublicAppShell from "../components/PublicAppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, CheckCircle, Loader2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function StartInterview() {
  const navigate = useNavigate();
  const { token } = useParams();
  
  const [formData, setFormData] = useState({
    departmentCode: "",
    fileNumber: ""
  });
  const [isValidatingCode, setIsValidatingCode] = useState(false);
  const [isCodeValid, setIsCodeValid] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [questionCount, setQuestionCount] = useState(0);
  const [checkingExisting, setCheckingExisting] = useState(false);
  
  const validationTimerRef = React.useRef(null);
  const validationAbortRef = React.useRef(null);
  const createInFlightRef = React.useRef(false);
  const didNavigateToInterviewRef = React.useRef(false);
  
  // URL BUILDER: Deterministic CandidateInterview URL with preserved query params
  function buildCandidateInterviewUrl(sessionId) {
    // Start with current query params (preserves hide_badge, server_url, etc.)
    const params = new URLSearchParams(window.location.search || "");
    
    // Set session param (overwrite if it exists)
    params.set("session", sessionId);
    
    // Build canonical URL
    return `/candidateinterview?${params.toString()}`;
  }

  // CANONICAL CHECK: Log once on mount to confirm page is registered
  useEffect(() => {
    console.log('[START_INTERVIEW][CANONICAL_OK]', {
      path: '/startinterview',
      file: 'pages/StartInterview.js',
      route: window.location.pathname
    });
    
    // DEFENSIVE CHECK: Warn if session param is missing on candidate route (log-only, non-blocking)
    if (window.location.pathname.includes('candidateinterview')) {
      const urlParams = new URLSearchParams(window.location.search);
      if (!urlParams.get('session')) {
        console.warn('[START_INTERVIEW][WARN_MISSING_SESSION_PARAM]', {
          pathname: window.location.pathname,
          search: window.location.search,
          note: 'CandidateInterview loaded without session param - should redirect'
        });
      }
    }
  }, []); // Mount-only

  useEffect(() => {
    loadQuestionCount();
    
    if (token) {
      try {
        const firstDashIndex = token.indexOf('-');
        
        if (firstDashIndex !== -1) {
          const deptCode = token.substring(0, firstDashIndex);
          const fileNumber = token.substring(firstDashIndex + 1);
          
          setFormData({
            departmentCode: deptCode,
            fileNumber: fileNumber
          });
        } else {
          setFormData(prev => ({
            ...prev,
            departmentCode: token
          }));
        }
      } catch (err) {
        console.warn('Failed to parse URL token:', err);
      }
    }
  }, [token]);

  const loadQuestionCount = async () => {
    try {
      const [allQuestions, allSections] = await Promise.all([
        base44.entities.Question.filter({ active: true }),
        base44.entities.Section.list()
      ]);
      
      const activeSections = allSections.filter(s => s.active !== false);
      const totalQs = activeSections.reduce((sum, sec) => {
        const secQuestions = allQuestions.filter(q => q.section_id === sec.id);
        return sum + secQuestions.length;
      }, 0);
      
      setQuestionCount(totalQs);
    } catch (err) {
      console.error('Error loading question count:', err);
      setQuestionCount(162);
    }
  };

  useEffect(() => {
    if (validationAbortRef.current) {
      validationAbortRef.current.cancelled = true;
    }
    
    if (validationTimerRef.current) {
      clearTimeout(validationTimerRef.current);
    }
    
    if (formData.departmentCode.trim().length < 3) {
      setIsCodeValid(null);
      setIsValidatingCode(false);
      return;
    }
    
    validationTimerRef.current = setTimeout(() => {
      validateDepartmentCode(formData.departmentCode);
    }, 500);

    return () => {
      if (validationTimerRef.current) {
        clearTimeout(validationTimerRef.current);
      }
      if (validationAbortRef.current) {
        validationAbortRef.current.cancelled = true;
      }
    };
  }, [formData.departmentCode]);

  const validateDepartmentCode = async (code) => {
    const abortToken = { cancelled: false };
    validationAbortRef.current = abortToken;
    
    setIsValidatingCode(true);
    
    try {
      const departments = await base44.entities.Department.filter({
        department_code: code.trim().toUpperCase()
      });
      
      if (abortToken.cancelled) return;
      
      if (departments.length > 0) {
        setIsCodeValid(true);
      } else {
        setIsCodeValid(false);
      }
    } catch (err) {
      if (abortToken.cancelled) return;
      console.error('Error validating department code:', err);
      setIsCodeValid(null);
    } finally {
      if (!abortToken.cancelled) {
        setIsValidatingCode(false);
      }
    }
  };

  const generateSessionHash = async (sessionCode) => {
    const timestamp = Date.now();
    const randomData = Math.random().toString(36);
    const dataToHash = `${sessionCode}-${timestamp}-${randomData}`;
    
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(dataToHash);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      return hashHex;
    } catch (err) {
      console.error("Hash generation error:", err);
      return `hash-${timestamp}-${Math.random().toString(36).substr(2, 9)}`;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (createInFlightRef.current) {
      return;
    }
    
    if (didNavigateToInterviewRef.current) {
      return;
    }
    
    createInFlightRef.current = true;
    setError(null);
    setIsSubmitting(true);

    const requestCompletedRef = { value: false };
    
    const sessionTimeout = setTimeout(() => {
      if (requestCompletedRef.value) return;
      
      console.error("[START_INTERVIEW][TIMEOUT]", { 
        departmentCode: formData.departmentCode,
        fileNumber: formData.fileNumber
      });
      setError("We couldn't load the interview. Please refresh or contact support.");
      setIsSubmitting(false);
    }, 10000);

    try {
      const deptCode = formData.departmentCode.trim().toUpperCase();
      const fileNum = formData.fileNumber.trim();

      if (!deptCode || !fileNum) {
        setError("Please enter both department code and file number.");
        setIsSubmitting(false);
        return;
      }

      if (isCodeValid === false || isCodeValid === null) {
        await validateDepartmentCode(deptCode);
        if (isCodeValid === false) {
          setError("Invalid department code. Please check and try again.");
          setIsSubmitting(false);
          return;
        }
      }

      setCheckingExisting(true);

      const departments = await base44.entities.Department.filter({
        department_code: deptCode
      });

      if (departments.length === 0) {
        setError("Invalid department code. Please check and try again.");
        setIsSubmitting(false);
        setCheckingExisting(false);
        return;
      }

      const sessionCode = `${deptCode}_${fileNum}`;
      
      const existingSessions = await base44.entities.InterviewSession.filter({
        session_code: sessionCode
      });

      if (existingSessions.length > 0) {
        const activeSession = existingSessions.find(s => 
          s.status === 'active' || s.status === 'in_progress' || s.status === 'paused'
        );
        
        if (activeSession) {
          if (didNavigateToInterviewRef.current) return;
          didNavigateToInterviewRef.current = true;

          // BRIDGE REDIRECT: Route via InterviewBridge to preserve session param
          const params = new URLSearchParams(window.location.search || "");
          params.set("sid", activeSession.id);
          params.set("session", activeSession.id);
          const to = `/interviewbridge?${params.toString()}`;

          console.log('[START_INTERVIEW][HARD_REDIRECT_TO_BRIDGE]', {
            sessionId: activeSession.id,
            to,
            containsSession: to.includes('session='),
            containsSid: to.includes('sid=')
          });

          window.location.replace(to);
          return;
        }

        const completedSession = existingSessions.find(s => s.status === 'completed');
        if (completedSession) {
          navigate(createPageUrl(`SessionDetails?id=${completedSession.id}`));
          return;
        }
      }

      const sessionHash = await generateSessionHash(sessionCode);

      const newSession = await base44.entities.InterviewSession.create({
        session_code: sessionCode,
        department_code: deptCode,
        file_number: fileNum,
        status: "active",
        started_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
        questions_answered_count: 0,
        followups_count: 0,
        ai_probes_count: 0,
        red_flags_count: 0,
        completion_percent: 0,
        elapsed_seconds: 0,
        active_seconds: 0,
        current_question_id: "Q001",
        current_category: "Applications with Other Law Enforcement Agencies",
        transcript_snapshot: [],
        queue_snapshot: [],
        current_item_snapshot: {},
        total_questions_answered: 0,
        followups_triggered: 0,
        red_flags: [],
        risk_rating: "low",
        started_date: new Date().toISOString(),
        session_hash: sessionHash,
        metadata: {},
        data_version: "v3.0-section-based"
      });

      requestCompletedRef.value = true;
      clearTimeout(sessionTimeout);
      
      if (didNavigateToInterviewRef.current) return;
      didNavigateToInterviewRef.current = true;

      // BRIDGE REDIRECT: Route via InterviewBridge to preserve session param
      const params = new URLSearchParams(window.location.search || "");
      params.set("sid", newSession.id);
      params.set("session", newSession.id);
      const to = `/interviewbridge?${params.toString()}`;

      console.log('[START_INTERVIEW][HARD_REDIRECT_TO_BRIDGE]', {
        sessionId: newSession.id,
        to,
        containsSession: to.includes('session='),
        containsSid: to.includes('sid=')
      });

      window.location.replace(to);

    } catch (err) {
      requestCompletedRef.value = true;
      clearTimeout(sessionTimeout);
      console.error("❌ Error creating session:", err);
      const errorMessage = err?.message || err?.toString() || 'Unknown error occurred';
      setError(`Failed to create interview session: ${errorMessage}`);
    } finally {
      requestCompletedRef.value = true;
      clearTimeout(sessionTimeout);
      createInFlightRef.current = false;
      setIsSubmitting(false);
      setCheckingExisting(false);
    }
  };

  return (
    <PublicAppShell>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4 md:p-8 pt-12 md:pt-16">
      <div className="max-w-2xl mx-auto">
        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
          <CardContent className="p-6 md:p-8">
            <div className="text-center mb-8">
              <div className="flex justify-center mb-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-blue-500 blur-2xl opacity-30" />
                  <img 
                    src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690e1cd45172f1b62aa6dbb0/271f2b6c5_IMG_2762.PNG" 
                    alt="ClearQuest" 
                    className="relative w-16 h-16 object-contain drop-shadow-[0_0_12px_rgba(59,130,246,0.4)]"
                  />
                </div>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-white mb-3">
                Start Interview
              </h1>
              <p className="text-slate-300 leading-relaxed">
                This is a confidential, CJIS-compliant interview process. {questionCount} total questions across multiple investigative sections.
              </p>
            </div>

            {error && (
              <Alert variant="destructive" className="mb-6">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="departmentCode" className="text-white text-sm md:text-base">
                  Department Code
                </Label>
                <div className="relative">
                  <Input
                    id="departmentCode"
                    type="text"
                    placeholder="Enter code (e.g., PD-2024)"
                    value={formData.departmentCode}
                    onChange={(e) => setFormData({...formData, departmentCode: e.target.value.toUpperCase()})}
                    className="bg-slate-900/50 border-slate-600 text-white h-12 pr-10"
                    required
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 transition-opacity duration-200">
                    {isValidatingCode && (
                      <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                    )}
                    {!isValidatingCode && formData.departmentCode.trim().length >= 3 && isCodeValid === true && (
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    )}
                    {!isValidatingCode && formData.departmentCode.trim().length >= 3 && isCodeValid === false && (
                      <AlertCircle className="w-5 h-5 text-red-400" />
                    )}
                  </div>
                </div>
                <div className="min-h-[20px] transition-opacity duration-200" style={{ opacity: (isCodeValid === false && formData.departmentCode.trim().length >= 3) ? 1 : 0 }}>
                  <p className="text-xs text-red-400">
                    {isCodeValid === false ? "Department code not found. Please verify and try again." : "\u00A0"}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fileNumber" className="text-white text-sm md:text-base">
                  Applicant File Number
                </Label>
                <Input
                  id="fileNumber"
                  type="text"
                  placeholder="Enter file number"
                  value={formData.fileNumber}
                  onChange={(e) => {
                    const value = e.target.value;
                    const filtered = value.replace(/[^A-Z0-9-]/gi, '').toUpperCase();
                    setFormData({...formData, fileNumber: filtered});
                  }}
                  className="bg-slate-900/50 border-slate-600 text-white h-12"
                  required
                />
                <div className="min-h-[20px]">
                  <p className="text-xs text-slate-400">
                    This identifies the applicant's case file for tracking purposes.
                  </p>
                </div>
              </div>
              
              <div className="min-h-[32px] transition-opacity duration-200" style={{ opacity: checkingExisting ? 1 : 0 }}>
                {checkingExisting && (
                  <div className="flex items-center gap-2 text-sm text-blue-300">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Checking for existing sessions...</span>
                  </div>
                )}
              </div>

              <div className="bg-blue-950/20 border border-blue-800/30 rounded-lg p-4 space-y-2">
                <h3 className="text-sm font-semibold text-blue-300">Privacy & Security Notice</h3>
                <ul className="text-xs text-slate-300 space-y-1 list-disc list-inside">
                  <li>All responses are encrypted and CJIS-compliant</li>
                  <li>No personal identifying information is collected</li>
                  <li>Sessions are identified only by department code + file number</li>
                  <li>You can pause and resume at any time</li>
                </ul>
              </div>

              <div className="min-h-[56px] md:min-h-[64px]">
                <Button
                  type="submit"
                  size="lg"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 md:h-14 text-base md:text-lg transition-opacity duration-200"
                  disabled={isSubmitting || isCodeValid === false}
                >
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 flex items-center justify-center">
                      {isSubmitting ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Shield className="w-5 h-5" />
                      )}
                    </div>
                    <span>{isSubmitting ? "Creating Session..." : "Begin Interview"}</span>
                  </div>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-slate-500 text-xs md:text-sm mt-6">
          © 2025 ClearQuest™ • CJIS Compliant • All Rights Reserved
        </p>
      </div>
      </div>
    </PublicAppShell>
  );
}