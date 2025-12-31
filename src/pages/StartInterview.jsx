import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import PublicAppShell from "../components/PublicAppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, CheckCircle, Loader2, AlertCircle, ChevronLeft } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox"; // Added as per outline, though not used in JSX
import { Link } from "react-router-dom";
// cn is removed as it's no longer used for conditional styling of input border.
// Switch is removed as debugMode is removed.

// CLEARQUEST UI CONTRACT:
// - StartInterview renders ONLY when no sessionId exists
// - CandidateInterview owns UI once session starts
// - Welcome / start screens must NEVER reappear mid-session

export default function StartInterview() {
  const navigate = useNavigate();
  const { token } = useParams(); // Optional URL token for prefilling
  
  // LOGGING CONTRACT: Diagnostic-only. Do not add new log labels without explicit request.
  // DIAGNOSTIC: Component render entry point
  console.log("[START_INTERVIEW][RENDER]", {
    pathname: window.location.pathname,
    search: window.location.search,
    timestamp: Date.now()
  });
  
  // UI CONTRACT GUARD: Check if sessionId already exists
  const urlParams = new URLSearchParams(window.location.search);
  const existingSessionId = urlParams.get('session');
  
  // HOOKS MUST ALWAYS RUN (unconditional) - declare all hooks BEFORE any conditional logic
  const [formData, setFormData] = useState({
    departmentCode: "",
    fileNumber: ""
  });
  const [isValidatingCode, setIsValidatingCode] = useState(false);
  const [isCodeValid, setIsCodeValid] = useState(null); // null: no validation yet, true: valid, false: invalid
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [questionCount, setQuestionCount] = useState(0);
  const [checkingExisting, setCheckingExisting] = useState(false); // For "checking sessions" status
  
  // Layout shift audit (dev-only, change detection)
  const lastLayoutSnapshotRef = React.useRef(null);
  
  // Terminal redirect flag (computed after hooks)
  const shouldTerminalRedirect = Boolean(existingSessionId);
  
  // DIAGNOSTIC: Post-hooks snapshot (after all useState/useEffect declarations)
  console.log("[START_INTERVIEW][POST_HOOKS_SNAPSHOT]", {
    existingSessionId,
    hasSessionId: Boolean(existingSessionId),
    shouldTerminalRedirect,
    formDataDeptCode: formData.departmentCode,
    formDataFileNum: formData.fileNumber,
    isValidatingCode,
    isCodeValid,
    timestamp: Date.now()
  });
  
  // EARLY EXIT: Terminal navigation guard (effect-based, NOT early return)
  const didNavigateRef = React.useRef(false);
  
  React.useEffect(() => {
    if (shouldTerminalRedirect && !didNavigateRef.current) {
      console.log("[START_INTERVIEW][TERMINAL_REDIRECT_INTENT]", {
        reason: "SESSION_ID_PRESENT",
        sessionId: existingSessionId,
        destination: `CandidateInterview?session=${existingSessionId}`,
        timestamp: Date.now()
      });
      
      console.log('[UI_CONTRACT][START_INTERVIEW_RENDER_BLOCKED]', {
        sessionId: existingSessionId,
        reason: 'SessionId exists - StartInterview terminal redirect'
      });
      
      console.log('[UI_CONTRACT][START_INTERVIEW_TERMINAL_NAV]', {
        sessionId: existingSessionId,
        reason: 'EXISTING_SESSION_REDIRECT',
        action: 'TERMINAL_REDIRECT'
      });
      
      console.log("[START_INTERVIEW][NAVIGATE_CALL]", {
        to: `CandidateInterview?session=${existingSessionId}`,
        sessionId: existingSessionId,
        replace: true,
        timestamp: Date.now()
      });
      
      didNavigateRef.current = true;
      navigate(createPageUrl(`CandidateInterview?session=${existingSessionId}`), { replace: true });
    }
  }, [shouldTerminalRedirect, existingSessionId, navigate]);
  
  // DIAGNOSTIC: Component unmount tracker
  React.useEffect(() => {
    return () => {
      console.log("[START_INTERVIEW][UNMOUNT]", {
        sessionId: existingSessionId,
        timestamp: Date.now()
      });
    };
  }, []);

  useEffect(() => {
    loadQuestionCount();
    
    // FUTURE BRANDING NOTE:
    // In a future version, the department_code from the URL will be used to load
    // department-specific branding (logo, colors, welcome message) for the CandidateInterview page.
    // For now, we only implement prefill behavior.
    
    // Parse URL token for prefilling form fields
    if (token) {
      try {
        // Token format: <DEPT> or <DEPT>-<FILE>
        const firstDashIndex = token.indexOf('-');
        
        if (firstDashIndex !== -1) {
          // Token contains dash - split into dept code and file number
          const deptCode = token.substring(0, firstDashIndex);
          const fileNumber = token.substring(firstDashIndex + 1);
          
          setFormData({
            departmentCode: deptCode,
            fileNumber: fileNumber
          });
        } else {
          // No dash - entire token is dept code
          setFormData(prev => ({
            ...prev,
            departmentCode: token
          }));
        }
      } catch (err) {
        // Parsing failed - fall back to no prefill (silent failure)
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
      
      const activeSections = allSections.filter(s => s.active !== false); // Filter for active sections
      const totalQs = activeSections.reduce((sum, sec) => {
        const secQuestions = allQuestions.filter(q => q.section_id === sec.id);
        return sum + secQuestions.length;
      }, 0);
      
      setQuestionCount(totalQs);
      console.log(`📊 Total active questions: ${totalQs}`);
    } catch (err) {
      console.error('Error loading question count:', err);
      setQuestionCount(162); // Fallback if API fails
    }
  };

  // DEBOUNCED VALIDATION: Prevent rapid API calls while typing
  const validationTimerRef = React.useRef(null);
  const validationAbortRef = React.useRef(null);
  
  useEffect(() => {
    // Cancel in-flight validation
    if (validationAbortRef.current) {
      validationAbortRef.current.cancelled = true;
    }
    
    // Clear existing timer
    if (validationTimerRef.current) {
      clearTimeout(validationTimerRef.current);
    }
    
    // Reset validation state immediately when input is too short
    if (formData.departmentCode.trim().length < 3) {
      setIsCodeValid(null);
      setIsValidatingCode(false);
      return;
    }
    
    // Debounce validation check
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
    // Create abort token for this validation
    const abortToken = { cancelled: false };
    validationAbortRef.current = abortToken;
    
    setIsValidatingCode(true);
    
    try {
      const departments = await base44.entities.Department.filter({
        department_code: code.trim().toUpperCase()
      });
      
      // Check if cancelled before updating state
      if (abortToken.cancelled) {
        console.log('[VALIDATION][CANCELLED]', { code });
        return;
      }
      
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
    const dataToHash = `${sessionCode}-${timestamp}-${randomData}`; // Use more unique data for hash
    
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(dataToHash);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      return hashHex;
    } catch (err) {
      console.error("Hash generation error:", err);
      // Fallback in case crypto API is unavailable or fails
      return `hash-${timestamp}-${Math.random().toString(36).substr(2, 9)}`;
    }
  };

  // Terminal navigation guard (prevents re-render after navigate)
  const didNavigateToInterviewRef = React.useRef(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // TERMINAL NAVIGATION GUARD: Prevent duplicate navigation
    if (didNavigateToInterviewRef.current) {
      console.log('[UI_CONTRACT][START_INTERVIEW_SUBMIT_BLOCKED]', {
        reason: 'Already navigated to interview',
        action: 'SKIP_DUPLICATE_SUBMIT'
      });
      return;
    }
    
    setError(null);
    setIsSubmitting(true);

    // CANCELABLE TIMEOUT: Track request completion to prevent false timeout
    const requestCompletedRef = { value: false };
    
    const sessionTimeout = setTimeout(() => {
      // Non-destructive: only fire if request still pending
      if (requestCompletedRef.value) {
        console.log("[START_INTERVIEW][TIMEOUT_SKIP] Request already completed");
        return;
      }
      
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

      // Re-validate department code just before submission if not already valid
      if (isCodeValid === false || isCodeValid === null) {
        await validateDepartmentCode(deptCode); // Re-run validation
        if (isCodeValid === false) { // Check state after re-validation
          setError("Invalid department code. Please check and try again.");
          setIsSubmitting(false);
          return;
        }
      }

      console.log(`🔍 Checking for existing sessions: ${deptCode} / ${fileNum}`);
      setCheckingExisting(true);

      // Even if isCodeValid is true, re-fetch to ensure department exists and get full details if needed
      const departments = await base44.entities.Department.filter({
        department_code: deptCode
      });

      if (departments.length === 0) {
        setError("Invalid department code. Please check and try again.");
        setIsSubmitting(false);
        setCheckingExisting(false);
        return;
      }

      // Use underscore for session_code as per new outline logic
      const sessionCode = `${deptCode}_${fileNum}`;
      
      const existingSessions = await base44.entities.InterviewSession.filter({
        session_code: sessionCode
      });

      if (existingSessions.length > 0) {
        // Active/In_progress/Paused session means resume
        const activeSession = existingSessions.find(s => 
          s.status === 'active' || s.status === 'in_progress' || s.status === 'paused'
        );
        
        if (activeSession) {
          console.log("📍 Found active session - navigating to interview");

          console.log("[START_INTERVIEW][NAVIGATE]", { 
            sessionId: activeSession.id, 
            status: activeSession.status,
            tokenPresent: Boolean(token) 
          });
          
          console.log('[UI_CONTRACT][START_INTERVIEW_TERMINAL_NAV]', {
            sessionId: activeSession.id,
            reason: 'RESUME_EXISTING_SESSION',
            action: 'TERMINAL_REDIRECT'
          });
          
          didNavigateToInterviewRef.current = true;
          navigate(createPageUrl(`CandidateInterview?session=${activeSession.id}`), { replace: true });
          return;
        }

        // Completed session means show details page
        const completedSession = existingSessions.find(s => s.status === 'completed');
        if (completedSession) {
          console.log("✅ Session already completed");
          navigate(createPageUrl(`SessionDetails?id=${completedSession.id}`));
          return;
        }
      }

      console.log("🆕 Creating new interview session");
      
      const sessionHash = await generateSessionHash(sessionCode);

      const newSession = await base44.entities.InterviewSession.create({
        session_code: sessionCode,
        department_code: deptCode,
        file_number: fileNum,
        status: "active", // Initial status as 'active'
        started_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
        questions_answered_count: 0,
        followups_count: 0,
        ai_probes_count: 0,
        red_flags_count: 0,
        completion_percent: 0,
        elapsed_seconds: 0,
        active_seconds: 0,
        current_question_id: "Q001", // Assuming Q001 is the starting question
        current_category: "Applications with Other Law Enforcement Agencies", // Assuming this is the starting category
        transcript_snapshot: [],
        queue_snapshot: [],
        current_item_snapshot: {}, // Empty object as per outline
        total_questions_answered: 0, // Duplicative but present in outline
        followups_triggered: 0, // Duplicative but present in outline
        red_flags: [], // Duplicative but present in outline
        risk_rating: "low", // Default
        started_date: new Date().toISOString(), // Duplicative but present in outline
        session_hash: sessionHash,
        metadata: {}, // Empty metadata as per outline
        data_version: "v3.0-section-based" // New data version
      });

      console.log("✅ Session created:", newSession.id);

      console.log("[START_INTERVIEW][NAVIGATE]", { 
        sessionId: newSession.id, 
        departmentCode: deptCode,
        fileNumber: fileNum,
        tokenPresent: Boolean(token) 
      });

      console.log('[UI_CONTRACT][START_INTERVIEW_TERMINAL_NAV]', {
        sessionId: newSession.id,
        reason: 'NEW_SESSION_CREATED',
        action: 'TERMINAL_REDIRECT'
      });
      
      console.log("[START_INTERVIEW][TERMINAL_REDIRECT_INTENT]", {
        reason: "NEW_SESSION_CREATED",
        sessionId: newSession.id,
        destination: `CandidateInterview?session=${newSession.id}`,
        timestamp: Date.now()
      });
      
      console.log("[START_INTERVIEW][NAVIGATE_CALL]", {
        to: `CandidateInterview?session=${newSession.id}`,
        sessionId: newSession.id,
        replace: true,
        timestamp: Date.now()
      });

      // Mark request complete BEFORE navigate (prevents timeout race)
      requestCompletedRef.value = true;
      clearTimeout(sessionTimeout);
      
      // TERMINAL NAVIGATION: Mark as navigated before redirect
      didNavigateToInterviewRef.current = true;

      navigate(createPageUrl(`CandidateInterview?session=${newSession.id}`), { replace: true });

    } catch (err) {
      requestCompletedRef.value = true;
      clearTimeout(sessionTimeout);
      console.error("❌ Error creating session:", err);
      const errorMessage = err?.message || err?.toString() || 'Unknown error occurred';
      setError(`Failed to create interview session: ${errorMessage}`);
    } finally {
      requestCompletedRef.value = true;
      clearTimeout(sessionTimeout);
      setIsSubmitting(false);
      setCheckingExisting(false);
    }
  };

  // CONDITIONAL RENDER: Show placeholder during terminal redirect (preserves hook order)
  if (shouldTerminalRedirect) {
    return (
      <PublicAppShell>
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-4" />
            <p className="text-slate-300">Redirecting to interview...</p>
          </div>
        </div>
      </PublicAppShell>
    );
  }
  
  // LAYOUT SHIFT AUDIT: Compute UI snapshot for change detection (dev-only)
  React.useEffect(() => {
    const snapshot = {
      deptLen: formData.departmentCode.length,
      fileLen: formData.fileNumber.length,
      isChecking: isValidatingCode,
      isValidDept: isCodeValid,
      isValidFile: formData.fileNumber.length > 0,
      helperShown: isCodeValid === false,
      canSubmit: !isSubmitting && isCodeValid !== false,
      checkingExisting
    };
    
    const key = JSON.stringify(snapshot);
    if (lastLayoutSnapshotRef.current !== key) {
      console.log('[START_INTERVIEW][LAYOUT_SOT]', snapshot);
      lastLayoutSnapshotRef.current = key;
    }
  }, [formData, isValidatingCode, isCodeValid, isSubmitting, checkingExisting]);
  
  // NORMAL RENDER: Show StartInterview form
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
                  {/* RESERVED ICON SLOT: Always present, opacity transitions (prevents input text shift) */}
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
                {/* RESERVED STATUS SLOT: Always rendered, min-height prevents layout shift */}
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
                {/* RESERVED STATUS SLOT: Always rendered for stable layout */}
                <div className="min-h-[20px]">
                  <p className="text-xs text-slate-400">
                    This identifies the applicant's case file for tracking purposes.
                  </p>
                </div>
              </div>
              
              {/* RESERVED STATUS SLOT: "Checking sessions" message (stable position) */}
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

              {/* STABLE BUTTON ROW: Fixed height, no layout shift on state changes */}
              <div className="min-h-[56px] md:min-h-[64px]">
                <Button
                  type="submit"
                  size="lg"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 md:h-14 text-base md:text-lg transition-opacity duration-200"
                  disabled={isSubmitting || isCodeValid === false}
                >
                  <div className="flex items-center justify-center gap-2">
                    {/* FIXED ICON SLOT: 24px reserved (prevents text shift) */}
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