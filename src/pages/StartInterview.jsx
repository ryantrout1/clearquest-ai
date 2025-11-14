import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, ArrowLeft, Loader2, Lock, Bug } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

export default function StartInterview() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    departmentCode: "",
    fileNumber: ""
  });
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState(null);
  const [departmentCodeError, setDepartmentCodeError] = useState(false);
  
  const [debugMode, setDebugMode] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  const [totalQuestions, setTotalQuestions] = useState(198);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);

  useEffect(() => {
    loadQuestionCount();
  }, []);

  const loadQuestionCount = async () => {
    try {
      setIsLoadingQuestions(true);
      const questions = await base44.entities.Question.filter({ active: true });
      setTotalQuestions(questions.length);
    } catch (err) {
      console.error("Error loading question count:", err);
    } finally {
      setIsLoadingQuestions(false);
    }
  };

  const validateDepartmentCode = async (code) => {
    if (!code) {
      setDepartmentCodeError(false);
      return true;
    }

    try {
      const departments = await base44.entities.Department.filter({ 
        department_code: code.toUpperCase()
      });
      
      if (departments.length === 0) {
        setDepartmentCodeError(true);
        return false;
      }
      
      setDepartmentCodeError(false);
      return true;
    } catch (err) {
      console.error("Error validating department code:", err);
      return true; 
    }
  };

  const handleDepartmentCodeChange = async (value) => {
    setFormData({...formData, departmentCode: value.toUpperCase()});
    
    if (value.length >= 3) {
      await validateDepartmentCode(value);
    } else {
      setDepartmentCodeError(false);
    }
  };

  const generateHash = async (text) => {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(text + Date.now() + Math.random());
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (err) {
      console.error("Hash generation error:", err);
      return `hash-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!formData.departmentCode || !formData.fileNumber) {
      setError("Both department code and file number are required");
      return;
    }

    const isValid = await validateDepartmentCode(formData.departmentCode);
    if (!isValid) {
      setError("Invalid department code. Please check and try again.");
      return;
    }

    setIsCreating(true);

    try {
      const sessionCode = `${formData.departmentCode}-${formData.fileNumber}`;
      
      console.log("🔍 [PRODUCTION] Checking for existing sessions with code:", sessionCode);
      
      let existingSessions = [];
      try {
        existingSessions = await base44.entities.InterviewSession.filter({ 
          session_code: sessionCode 
        });
        console.log(`   [PRODUCTION] Found ${existingSessions.length} existing session(s)`);
      } catch (filterErr) {
        console.warn("⚠️ [PRODUCTION] Error checking existing sessions:", filterErr);
      }
      
      const activeSession = existingSessions.find(s => 
        s.status === 'in_progress' || s.status === 'paused'
      );
      
      if (activeSession && activeSession.id) {
        console.log("✅ [PRODUCTION] Found existing active session:", activeSession.id);
        navigate(createPageUrl(`InterviewV2?session=${activeSession.id}`));
        return;
      }
      
      const completedSession = existingSessions.find(s => s.status === 'completed');
      if (completedSession) {
        setError("This interview has already been completed and cannot be accessed again.");
        setIsCreating(false);
        return;
      }

      console.log("📝 [PRODUCTION] Creating new session...");
      console.log("   - Session Code:", sessionCode);
      console.log("   - Department Code:", formData.departmentCode);
      console.log("   - File Number:", formData.fileNumber);
      
      const sessionHash = await generateHash(sessionCode);
      
      const sessionData = {
        session_code: sessionCode,
        department_code: formData.departmentCode,
        file_number: formData.fileNumber,
        status: "in_progress",
        started_date: new Date().toISOString(),
        session_hash: sessionHash,
        red_flags: [],
        total_questions_answered: 0,
        completion_percentage: 0,
        followups_triggered: 0,
        risk_rating: "low",
        transcript_snapshot: [],
        queue_snapshot: [],
        current_item_snapshot: null,
        current_question_id: null,
        current_category: null,
        conversation_id: null,
        data_version: "v2.5-hybrid",
        metadata: {
          created_via: "web_interface",
          user_agent: navigator.userAgent,
          version: "v2.5-hybrid",
          debug_mode: debugMode,
          probing_strength: "production_standard",
          created_timestamp: new Date().toISOString()
        }
      };
      
      console.log("📤 [PRODUCTION] Sending create request with data:", sessionData);
      
      const newSession = await base44.entities.InterviewSession.create(sessionData);
      
      console.log("📥 [PRODUCTION] Create response received:", newSession);
      console.log("   - Type:", typeof newSession);
      console.log("   - Is null:", newSession === null);
      console.log("   - Is undefined:", newSession === undefined);
      console.log("   - Has id:", !!newSession?.id);
      
      if (!newSession) {
        console.error("❌ [PRODUCTION] Session creation returned null/undefined");
        throw new Error("Session creation failed - API returned null");
      }
      
      if (!newSession.id) {
        console.error("❌ [PRODUCTION] Session object missing ID:", JSON.stringify(newSession, null, 2));
        throw new Error("Session creation failed - no ID in response");
      }
      
      console.log("✅ [PRODUCTION] Session created successfully");
      console.log("   - Session ID:", newSession.id);
      console.log("   - Session Code:", newSession.session_code);
      
      // PRODUCTION FIX: Small delay + verification before redirect
      console.log("⏳ [PRODUCTION] Waiting for database commit...");
      await new Promise(resolve => setTimeout(resolve, 500));
      
      console.log("🔍 [PRODUCTION] Verifying session exists in database...");
      let verifyAttempts = 0;
      let verifiedSession = null;
      
      while (verifyAttempts < 3 && !verifiedSession) {
        try {
          verifiedSession = await base44.entities.InterviewSession.get(newSession.id);
          if (verifiedSession && verifiedSession.id) {
            console.log("✅ [PRODUCTION] Session verified in database");
            break;
          }
        } catch (verifyError) {
          console.warn(`⚠️ [PRODUCTION] Verification attempt ${verifyAttempts + 1} failed:`, verifyError);
        }
        verifyAttempts++;
        if (verifyAttempts < 3) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      
      if (!verifiedSession) {
        console.error("❌ [PRODUCTION] Could not verify session after 3 attempts");
        throw new Error("Session was created but could not be verified. Please try again.");
      }
      
      if (debugMode) {
        console.log("🐛 Debug mode enabled for this session");
      }

      console.log("🔄 [PRODUCTION] Navigating to InterviewV2 with session ID:", newSession.id);
      navigate(createPageUrl(`InterviewV2?session=${newSession.id}`));
      
    } catch (err) {
      console.error("❌ [PRODUCTION] Error in session creation flow:");
      console.error("   - Error type:", err?.constructor?.name || 'Unknown');
      console.error("   - Error message:", err?.message || 'No message');
      console.error("   - Full error object:", err);
      
      const errorMessage = err?.message || err?.toString() || 'Unknown error occurred';
      setError(`Failed to create interview session: ${errorMessage}. Please try again or contact support.`);
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 md:mb-8">
          <Link to={createPageUrl("Home")}>
            <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-slate-700 mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>
        </div>

        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
          <CardHeader className="text-center space-y-4 p-6 md:p-8">
            <div className="flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-blue-500 blur-2xl opacity-30" />
                <Shield className="relative w-16 h-16 text-blue-400" />
              </div>
            </div>
            <CardTitle className="text-2xl md:text-3xl text-white">Start New Interview</CardTitle>
            <CardDescription className="text-slate-300 text-sm md:text-base">
              Begin a confidential CJIS-aligned background interview session.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 p-6 md:p-8">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Alert className="bg-blue-950/30 border-blue-800/50 text-blue-200">
              <Lock className="h-4 w-4" />
              <AlertDescription className="text-sm leading-relaxed">
                <strong>Privacy Notice:</strong> This interview is anonymous. No personally identifiable information is collected. 
                Sessions are identified only by department code and file number. 
                All responses are encrypted end-to-end and auto-purged based on retention settings.
              </AlertDescription>
            </Alert>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="departmentCode" className="text-white text-sm md:text-base">
                  Department Code *
                </Label>
                <Input
                  id="departmentCode"
                  placeholder="e.g., PD-2024"
                  value={formData.departmentCode}
                  onChange={(e) => handleDepartmentCodeChange(e.target.value)}
                  className={cn(
                    "bg-slate-900/50 border-slate-600 text-white h-12",
                    departmentCodeError && "border-red-500"
                  )}
                  required
                />
                <p className={cn(
                  "text-sm",
                  departmentCodeError ? "text-red-400" : "text-slate-400"
                )}>
                  {departmentCodeError 
                    ? "The department code you entered does not match, please enter a valid department code" 
                    : "Your department's identifying code"}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fileNumber" className="text-white text-sm md:text-base">
                  File Number *
                </Label>
                <Input
                  id="fileNumber"
                  placeholder="e.g., A-12345"
                  value={formData.fileNumber}
                  onChange={(e) => setFormData({...formData, fileNumber: e.target.value.toUpperCase()})}
                  className="bg-slate-900/50 border-slate-600 text-white h-12"
                  required
                />
                <p className="text-sm text-slate-400">
                  Applicant case or file number
                </p>
              </div>

              <div className="border-t border-slate-700 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-sm text-slate-400 hover:text-slate-300 transition-colors flex items-center gap-2"
                >
                  <Bug className="w-4 h-4" />
                  {showAdvanced ? 'Hide' : 'Show'} Advanced Settings (For Testing)
                </button>
                
                {showAdvanced && (
                  <div className="mt-4 p-4 bg-slate-900/50 border border-slate-700 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="debug-mode" className="text-white text-sm">
                          Debug Mode
                        </Label>
                        <p className="text-xs text-slate-400">
                          Show AI reasoning, probing logic, and scoring details
                        </p>
                      </div>
                      <Switch
                        id="debug-mode"
                        checked={debugMode}
                        onCheckedChange={setDebugMode}
                      />
                    </div>
                    
                    {debugMode && (
                      <Alert className="bg-yellow-950/30 border-yellow-800/50 text-yellow-200">
                        <Bug className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                          <strong>Debug Mode Enabled:</strong> The AI will show internal reasoning after each follow-up event. 
                          This is for testing/development only and should NOT be used in production interviews.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}
              </div>

              <div className="bg-slate-900/30 border border-slate-700 rounded-lg p-4 md:p-6 space-y-3">
                <h4 className="font-semibold text-white flex items-center gap-2 text-sm md:text-base">
                  <Shield className="w-4 h-4 text-blue-400" />
                  What to Expect
                </h4>
                <ul className="space-y-2 text-xs md:text-sm text-slate-300 leading-relaxed">
                  <li>• You will answer <strong>{totalQuestions} structured background questions</strong>.</li>
                  <li>• Questions appear <strong>one at a time</strong> in a conversational, easy-to-read format.</li>
                  <li>• A "Yes" answer may trigger additional follow-up questions to capture facts clearly.</li>
                  <li>• You can <strong>pause, leave, and resume at any time</strong> — even on a different device.</li>
                  <li>• Your progress is saved automatically.</li>
                  <li>• Average completion time varies: <strong>40–90 minutes</strong> depending on your background.</li>
                </ul>
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 md:h-14 text-base md:text-lg"
                disabled={isCreating || departmentCodeError}
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Creating Session...
                  </>
                ) : (
                  <>
                    <Shield className="w-5 h-5 mr-2" />
                    Begin Interview
                  </>
                )}
              </Button>

              <p className="text-xs text-center text-slate-400 px-2 leading-relaxed">
                By starting this interview, you agree that your responses may be reviewed by authorized investigators 
                and may be used in official background screening decisions.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}