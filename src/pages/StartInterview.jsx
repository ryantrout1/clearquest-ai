import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
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

export default function StartInterview() {
  const navigate = useNavigate();
  const { token } = useParams(); // Optional URL token for prefilling
  
  const [formData, setFormData] = useState({
    departmentCode: "",
    fileNumber: ""
  });
  const [isValidatingCode, setIsValidatingCode] = useState(false);
  const [isCodeValid, setIsCodeValid] = useState(null); // null: no validation yet, true: valid, false: invalid
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [questionCount, setQuestionCount] = useState(0);

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

  useEffect(() => {
    const timer = setTimeout(() => {
      // Only validate if department code has some length, otherwise reset validity state
      if (formData.departmentCode.trim().length >= 3) {
        validateDepartmentCode(formData.departmentCode);
      } else {
        setIsCodeValid(null); // Reset validation status if input is too short or empty
      }
    }, 500); // Debounce for 500ms

    return () => clearTimeout(timer);
  }, [formData.departmentCode]); // Re-run effect when departmentCode changes

  const validateDepartmentCode = async (code) => {
    setIsValidatingCode(true);
    try {
      const departments = await base44.entities.Department.filter({
        department_code: code.trim().toUpperCase()
      });
      
      if (departments.length > 0) {
        setIsCodeValid(true);
      } else {
        setIsCodeValid(false);
      }
    } catch (err) {
      console.error('Error validating department code:', err);
      setIsCodeValid(null); // Keep null on error, could be network issue
    } finally {
      setIsValidatingCode(false);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    setError(null);
    setIsSubmitting(true);

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

      // Even if isCodeValid is true, re-fetch to ensure department exists and get full details if needed
      const departments = await base44.entities.Department.filter({
        department_code: deptCode
      });

      if (departments.length === 0) {
        setError("Invalid department code. Please check and try again.");
        setIsSubmitting(false);
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
          navigate(createPageUrl(`CandidateInterview?session=${activeSession.id}`));
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

      navigate(createPageUrl(`CandidateInterview?session=${newSession.id}`));

    } catch (err) {
      console.error("❌ Error creating session:", err);
      const errorMessage = err?.message || err?.toString() || 'Unknown error occurred';
      setError(`Failed to create interview session: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4 md:p-8">
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
                    className="bg-slate-900/50 border-slate-600 text-white h-12 pr-10" // pr-10 for icon space
                    required
                  />
                  {isValidatingCode && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-400 animate-spin" />
                  )}
                  {!isValidatingCode && formData.departmentCode.trim().length >= 3 && isCodeValid === true && (
                    <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-400" />
                  )}
                  {!isValidatingCode && formData.departmentCode.trim().length >= 3 && isCodeValid === false && (
                    <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-red-400" />
                  )}
                </div>
                {isCodeValid === false && formData.departmentCode.trim().length >= 3 && (
                  <p className="text-xs text-red-400 mt-1">
                    Department code not found. Please verify and try again.
                  </p>
                )}
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
                <p className="text-xs text-slate-400">
                  This identifies the applicant's case file for tracking purposes.
                </p>
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

              <Button
                type="submit"
                size="lg"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 md:h-14 text-base md:text-lg"
                disabled={isSubmitting || isCodeValid === false}
              >
                {isSubmitting ? (
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
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-slate-500 text-xs md:text-sm mt-6">
          © 2025 ClearQuest AI™ • CJIS Compliant • All Rights Reserved
        </p>
      </div>
    </div>
  );
}