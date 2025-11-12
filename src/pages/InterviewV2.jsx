
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Send, Loader2, Check, X, AlertCircle, Layers, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  bootstrapEngine,
  createInitialState,
  handlePrimaryAnswer,
  handleFollowUpAnswer,
  getCurrentPrompt,
  getProgress,
  appendToTranscript,
  batchUpdate,
  PERF_MONITOR
} from "../components/interviewEngine";

// Follow-up pack display names
const FOLLOWUP_PACK_NAMES = {
  'PACK_LE_APPS': 'Applications with Other Law Enforcement Agencies',
  'PACK_WITHHOLD_INFO': 'Withheld Information',
  'PACK_DISQUALIFIED': 'Prior Disqualification',
  'PACK_CHEATING': 'Test Cheating',
  'PACK_DUI': 'DUI Incident',
  'PACK_LICENSE_SUSPENSION': 'License Suspension',
  'PACK_RECKLESS_DRIVING': 'Reckless Driving',
  'PACK_DRIVE_NO_INSURANCE': 'Driving Without Insurance',
  'PACK_COLLISION': 'Vehicle Collision',
  'PACK_COLLISION_INJURY': 'Collision with Injuries',
  'PACK_ALCOHOL_COLLISION': 'Alcohol-Related Collision',
  'PACK_UNREPORTED_COLLISION': 'Unreported Collision',
  'PACK_HIT_RUN': 'Hit and Run Incident',
  'PACK_HIT_RUN_DAMAGE': 'Hit and Run Damage Details',
  'PACK_FIGHT': 'Physical Fight Incident',
  'PACK_ARREST': 'Arrest History',
  'PACK_CRIMINAL_CHARGE': 'Criminal Charge',
  'PACK_FELONY': 'Felony History',
  'PACK_WARRANT': 'Outstanding Warrant',
  'PACK_PROTECTIVE_ORDER': 'Protective Order',
  'PACK_GANG': 'Gang Affiliation',
  'PACK_WEAPON_VIOLATION': 'Weapons Violation',
  'PACK_EXTREMIST': 'Extremist Organization Involvement',
  'PACK_PROSTITUTION': 'Prostitution Involvement',
  'PACK_PORNOGRAPHY': 'Pornography Involvement',
  'PACK_HARASSMENT': 'Sexual Harassment',
  'PACK_ASSAULT': 'Sexual Assault',
  'PACK_MINOR_CONTACT': 'Contact with Minor',
  'PACK_FINANCIAL': 'Financial Issue',
  'PACK_BANKRUPTCY': 'Bankruptcy',
  'PACK_FORECLOSURE': 'Foreclosure',
  'PACK_REPOSSESSION': 'Property Repossession',
  'PACK_LAWSUIT': 'Civil Lawsuit',
  'PACK_LATE_PAYMENT': 'Late Payments',
  'PACK_GAMBLING': 'Gambling Problem',
  'PACK_DRUG_USE': 'Drug Use History',
  'PACK_DRUG_SALE': 'Drug Sales',
  'PACK_PRESCRIPTION_MISUSE': 'Prescription Medication Misuse',
  'PACK_ALCOHOL_DEPENDENCY': 'Alcohol Dependency',
  'PACK_ALCOHOL_INCIDENT': 'Alcohol-Related Incident',
  'PACK_MIL_DISCHARGE': 'Military Discharge',
  'PACK_MIL_DISCIPLINE': 'Military Discipline',
  'PACK_DISCIPLINE': 'Workplace Discipline',
  'PACK_WORK_DISCIPLINE': 'Employment Discipline',
  'PACK_FIRED': 'Employment Termination',
  'PACK_QUIT_AVOID': 'Resignation to Avoid Discipline',
  'PACK_DRUG_TEST_CHEAT': 'Drug Test Tampering',
  'PACK_FALSE_APPLICATION': 'False Employment Application',
  'PACK_MISUSE_RESOURCES': 'Misuse of Employer Resources',
  'PACK_THEFT': 'Theft Incident',
  'PACK_UNEMPLOYMENT_FRAUD': 'Unemployment Fraud',
  'PACK_LE_PREV': 'Prior Law Enforcement Employment',
  'PACK_ACCUSED_FORCE': 'Excessive Force Accusation',
  'PACK_GRATUITY': 'Gratuity Acceptance',
  'PACK_FALSIFY_REPORT': 'Falsified Report',
  'PACK_INTERNAL_AFFAIRS': 'Internal Affairs Investigation',
  'PACK_LYING_LE': 'Untruthfulness in Law Enforcement',
  'PACK_LE_COMPLAINT': 'Law Enforcement Complaint',
  'PACK_OTHER_PRIOR_LE': 'Other Prior Law Enforcement Issues',
  'PACK_EMBARRASSMENT': 'Potential Embarrassment',
  'PACK_TATTOO': 'Visible Tattoo',
  'PACK_SOCIAL_MEDIA': 'Social Media Content',
  'PACK_DOMESTIC': 'Domestic Violence',
  'PACK_TRAFFIC': 'Traffic Violation'
};

/**
 * InterviewV2 - Zero-refresh, zero-AI question routing
 * Instant responses, pure deterministic flow
 * SUPPORTS PAUSE/RESUME - restores from database
 */
export default function InterviewV2() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('session');

  // Core state
  const [interviewState, setInterviewState] = useState(null);
  const [session, setSession] = useState(null);
  const [department, setDepartment] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [input, setInput] = useState("");
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [isCompletingInterview, setIsCompletingInterview] = useState(false);

  // Refs
  const historyRef = useRef(null);
  const isCommittingRef = useRef(false);

  // ============================================================================
  // INITIALIZATION WITH RESUME SUPPORT
  // ============================================================================

  useEffect(() => {
    if (!sessionId) {
      navigate(createPageUrl("StartInterview"));
      return;
    }

    initializeInterview();
  }, [sessionId, navigate]);

  const initializeInterview = async () => {
    try {
      console.log('🚀 Initializing deterministic interview engine...');
      const startTime = performance.now();

      // Step 1: Load session
      console.log('📋 Step 1: Loading session...');
      const loadedSession = await base44.entities.InterviewSession.get(sessionId);
      console.log('✅ Session loaded:', loadedSession);
      
      // Check if session is already completed
      if (loadedSession.status === 'completed') {
        setError('This interview has already been completed and is no longer accessible.');
        setIsLoading(false);
        return;
      }
      
      setSession(loadedSession);
      
      // Step 1.5: Load department info
      console.log('🏢 Step 1.5: Loading department info...');
      try {
        const departments = await base44.entities.Department.filter({ 
          department_code: loadedSession.department_code 
        });
        if (departments.length > 0) {
          setDepartment(departments[0]);
          console.log('✅ Department loaded:', departments[0].department_name);
        }
      } catch (err) {
        console.warn('⚠️ Could not load department info:', err);
        // Non-fatal, continue with interview
      }
      
      // Step 2: Bootstrap engine (loads questions, caches lookups)
      console.log('⚙️ Step 2: Bootstrapping engine...');
      const engine = await bootstrapEngine(base44);
      console.log(`✅ Engine bootstrapped: ${engine.TotalQuestions} questions loaded`);
      
      // Step 3: Load existing responses (for resume support)
      console.log('📂 Step 3: Loading existing responses...');
      const existingResponses = await base44.entities.Response.filter({ 
        session_id: sessionId 
      });
      console.log(`✅ Found ${existingResponses.length} existing responses`);
      
      // Step 4: Restore state from existing responses
      let restoredState;
      
      if (existingResponses.length > 0) {
        console.log('🔄 Restoring interview state from database...');
        restoredState = await restoreStateFromResponses(engine, existingResponses);
        console.log(`✅ State restored: ${restoredState.questionsAnswered} questions answered`);
      } else {
        console.log('🎯 Creating fresh initial state (no existing responses)');
        restoredState = createInitialState(engine);
      }
      
      setInterviewState(restoredState);
      setIsLoading(false);

      const elapsed = performance.now() - startTime;
      console.log(`✅ Interview ready in ${elapsed.toFixed(2)}ms`);

    } catch (err) {
      console.error('❌ Initialization failed:', err);
      setError(`Failed to load interview: ${err.message}`);
      setIsLoading(false);
    }
  };

  // ============================================================================
  // STATE RESTORATION LOGIC
  // ============================================================================

  const restoreStateFromResponses = async (engine, responses) => {
    console.log('🔄 Rebuilding interview state from responses...');
    
    // Start with initial state
    let state = createInitialState(engine);
    
    // Sort responses by timestamp to replay in order
    const sortedResponses = responses.sort((a, b) => 
      new Date(a.response_timestamp) - new Date(b.response_timestamp)
    );
    
    // Replay each answer through the engine
    for (const response of sortedResponses) {
      console.log(`🔄 Replaying: ${response.question_id} = "${response.answer}"`);
      
      // Add question to transcript
      const question = engine.QById[response.question_id];
      if (question) {
        state = appendToTranscript(state, {
          type: 'question',
          questionId: response.question_id,
          content: question.question_text,
          category: question.category
        });
      }
      
      // Add answer to transcript
      state = appendToTranscript(state, {
        type: 'answer',
        questionId: response.question_id,
        content: response.answer
      });
      
      // Process the answer through the engine
      state = handlePrimaryAnswer(state, response.answer);
    }
    
    // Load follow-up responses if any exist
    const followupResponses = await base44.entities.FollowUpResponse.filter({
      session_id: sessionId
    });
    
    if (followupResponses.length > 0) {
      console.log(`🔄 Found ${followupResponses.length} follow-up responses to restore`);
      
      // Group by response_id and replay
      const followupsByResponse = {};
      followupResponses.forEach(fu => {
        if (!followupsByResponse[fu.response_id]) {
          followupsByResponse[fu.response_id] = [];
        }
        followupsByResponse[fu.response_id].push(fu);
      });
      
      // For each follow-up pack, add to transcript
      Object.values(followupsByResponse).forEach(fuGroup => {
        fuGroup.forEach(fu => {
          if (fu.incident_description) {
            // Add follow-up question to transcript
            state = appendToTranscript(state, {
              type: 'followup_question',
              packId: fu.followup_pack,
              content: "Follow-up details"
            });
            
            // Add follow-up answer to transcript
            state = appendToTranscript(state, {
              type: 'followup_answer',
              packId: fu.followup_pack,
              content: fu.incident_description
            });
          }
        });
      });
    }
    
    console.log(`✅ State restored - Current mode: ${state.currentMode}, Current question: ${state.currentQuestionId}`);
    
    return state;
  };

  // ============================================================================
  // AUTO-SCROLL
  // ============================================================================

  const autoScrollToBottom = useCallback(() => {
    if (!historyRef.current) return;
    
    requestAnimationFrame(() => {
      if (historyRef.current) {
        historyRef.current.scrollTop = historyRef.current.scrollHeight;
      }
    });
  }, []);

  // Check for completion
  useEffect(() => {
    if (interviewState?.isComplete && !showCompletionModal) {
      console.log('🎉 Interview completed!');
      setShowCompletionModal(true);
    }
  }, [interviewState?.isComplete, showCompletionModal]);

  // ============================================================================
  // ANSWER SUBMISSION (NO AI, NO REFRESH, PURE STATE UPDATE)
  // ============================================================================

  const handleAnswer = useCallback((value) => {
    // RULE: Guard against double-submit
    if (isCommittingRef.current || !interviewState) {
      console.warn('⚠️ Already committing or no state');
      return;
    }

    isCommittingRef.current = true;
    const startTime = performance.now();

    try {
      // RULE: Route based on current mode
      let newState;
      
      if (interviewState.currentMode === 'QUESTION') {
        console.log(`📝 Primary answer: "${value}"`);
        newState = handlePrimaryAnswer(interviewState, value);
        
        // RULE: Save to DB async (non-blocking, no UI impact)
        saveAnswerToDatabase(interviewState.currentQuestionId, value).catch(err => {
          console.error('⚠️ Database save failed (non-fatal):', err);
        });
        
      } else if (interviewState.currentMode === 'FOLLOWUP') {
        console.log(`📋 Follow-up answer: "${value}"`);
        newState = handleFollowUpAnswer(interviewState, value);
        
        // Check if we need AI probe (after 1 failed attempt and max 2 probes)
        if (newState.currentStepRetries >= 1 && newState.currentStepProbes < 2 && 
            newState.currentPackIndex === interviewState.currentPackIndex) {
          // Still on same step after validation failure - trigger AI probe
          console.log(`🤖 Triggering AI probe (retry: ${newState.currentStepRetries}, probes: ${newState.currentStepProbes})`);
          triggerAIProbe(newState, value).catch(err => {
            console.error('⚠️ AI probe failed:', err);
          });
        }
        
      } else {
        console.warn('⚠️ Unknown mode:', interviewState.currentMode);
        isCommittingRef.current = false;
        return;
      }
      
      // RULE: Single state commit
      setInterviewState(newState);
      
      // Reset commit guard
      isCommittingRef.current = false;

      // RULE: Auto-scroll after commit
      setTimeout(autoScrollToBottom, 100);

      const elapsed = performance.now() - startTime;
      console.log(`⚡ Processed in ${elapsed.toFixed(2)}ms`);

    } catch (err) {
      console.error('❌ Error processing answer:', err);
      isCommittingRef.current = false;
      setError(`Error processing answer: ${err.message}`);
    }

  }, [interviewState, autoScrollToBottom]);

  // Text input submit handler
  const handleTextSubmit = useCallback((e) => {
    // RULE: Prevent default FIRST
    e.preventDefault();

    const answer = input.trim();
    if (!answer) return;

    // Clear input immediately for instant feedback
    setInput("");

    // Process answer
    handleAnswer(answer);

  }, [input, handleAnswer]);

  // ============================================================================
  // DATABASE PERSISTENCE (ASYNC, NON-BLOCKING)
  // ============================================================================

  const saveAnswerToDatabase = async (questionId, answer) => {
    try {
      const question = interviewState.engine.QById[questionId];
      
      // Check if response already exists (in case of resume/replay)
      const existingResponses = await base44.entities.Response.filter({
        session_id: sessionId,
        question_id: questionId
      });
      
      if (existingResponses.length > 0) {
        console.log(`ℹ️ Response for ${questionId} already exists, skipping save`);
        return;
      }
      
      await base44.entities.Response.create({
        session_id: sessionId,
        question_id: questionId,
        question_text: question.question_text,
        category: question.category,
        answer: answer,
        triggered_followup: false,
        response_timestamp: new Date().toISOString()
      });
      
      console.log(`✅ Saved response: ${questionId} = "${answer}"`);

      // Update session progress
      const progress = getProgress(interviewState);
      await base44.entities.InterviewSession.update(sessionId, {
        total_questions_answered: progress.answered,
        completion_percentage: progress.percentage
      });

    } catch (err) {
      console.error('Database save error:', err);
    }
  };

  // ============================================================================
  // AI PROBE FOR FOLLOW-UP VALIDATION (MINIMAL CREDITS)
  // ============================================================================

  const triggerAIProbe = async (state, failedValue) => {
    try {
      const { engine, currentPack, currentPackIndex } = state;
      const steps = engine.PackStepsById[currentPack.packId];
      const step = steps[currentPackIndex];
      
      console.log(`🤖 Calling AI probe for ${step.Field_Key} (type: ${step.Expected_Type})`);
      
      // Build micro-prompt
      const probePrompt = {
        fieldKey: step.Field_Key,
        expectedType: step.Expected_Type || 'TEXT',
        userInput: failedValue,
        examples: {
          "DATE": ["06/15/2022", "2022-06-15", "Jun 2022"],
          "DATERANGE": ["06/2022 to 08/2022", "2022-06-01 to 2022-08-15"],
          "BOOLEAN": ["Yes", "No"],
          "NUMBER": ["1", "2", "3.5"],
          "LOCATION": ["Phoenix, AZ", "Seattle, WA"],
          "TEXT": ["I rear-ended a vehicle at a stoplight."],
          "ENUM": step.Options || []
        }
      };
      
      // Call LLM with strict JSON-only, temp 0
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `You help collect a single missing field. Output ONLY JSON: {"question": "..."}.
Pick ONE short, plain-English question that will elicit a valid value for the specified field type.
Do not provide answers. Do not add keys. Be concise.

Field details: ${JSON.stringify(probePrompt)}`,
        response_json_schema: {
          type: "object",
          properties: {
            question: { type: "string" }
          },
          required: ["question"]
        }
      });
      
      console.log(`🤖 AI probe response:`, response);
      
      if (response?.question) {
        // Append AI clarification question to transcript
        let newState = appendToTranscript(state, {
          type: 'ai_clarification',
          content: response.question
        });
        
        // Increment probe counter
        newState = batchUpdate(newState, {
          currentStepProbes: state.currentStepProbes + 1
        });
        
        setInterviewState(newState);
        setTimeout(autoScrollToBottom, 50);
      }
      
    } catch (err) {
      console.error('❌ AI probe error:', err);
      // Fallback to deterministic nudge already shown
    }
  };

  // ============================================================================
  // COMPLETION HANDLING
  // ============================================================================

  const handleCompletionConfirm = async () => {
    setIsCompletingInterview(true);
    
    try {
      // Mark session as completed in database
      await base44.entities.InterviewSession.update(sessionId, {
        status: 'completed',
        completed_date: new Date().toISOString(),
        completion_percentage: 100
      });

      console.log('✅ Interview marked as completed');
      
      // Navigate to home page
      navigate(createPageUrl("Home"));
      
    } catch (err) {
      console.error('❌ Error completing interview:', err);
      setError('Failed to complete interview. Please try again.');
      setIsCompletingInterview(false);
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-blue-400 animate-spin mx-auto" />
          <p className="text-slate-300">Loading interview engine...</p>
          {session && (
            <p className="text-slate-400 text-sm">
              Restoring session: {session.session_code}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md space-y-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="whitespace-pre-line">{error}</AlertDescription>
          </Alert>
          <Button onClick={() => navigate(createPageUrl("Home"))} className="w-full">
            Return to Home
          </Button>
        </div>
      </div>
    );
  }

  if (!interviewState) return null;

  const currentPrompt = getCurrentPrompt(interviewState);
  const progress = getProgress(interviewState);
  const isYesNoQuestion = currentPrompt?.responseType === 'yes_no';
  const isFollowUpMode = interviewState.currentMode === 'FOLLOWUP';
  
  // Helper to extract just the number from question ID (e.g., Q001 -> 1)
  const getQuestionNumber = (questionId) => {
    if (!questionId) return '';
    return questionId.replace(/^Q0*/, '');
  };

  // Get follow-up pack display name
  const getFollowUpPackName = (packId) => {
    return FOLLOWUP_PACK_NAMES[packId] || 'Follow-up Questions';
  };

  return (
    <>
      <div className="h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex-shrink-0 bg-slate-800/95 backdrop-blur-sm border-b border-slate-700 px-4 py-3">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <Shield className="w-6 h-6 text-blue-400" />
                <h1 className="text-lg font-semibold text-white">ClearQuest Interview</h1>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-white">
                  {progress.answered} / {progress.total}
                </div>
                <div className="text-xs text-slate-400">
                  {progress.percentage}% Complete
                </div>
              </div>
            </div>
            
            {/* Department & Session Info */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 border-t border-slate-700/50 pt-2">
              {department && (
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-slate-300">{department.department_name}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">•</span>
                <span className="text-slate-500">Dept Code:</span>
                <span className="font-mono text-slate-300">{session?.department_code}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">•</span>
                <span className="text-slate-500">File:</span>
                <span className="font-mono text-slate-300">{session?.file_number}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content - Split into History + Active Question */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {/* Chat History (Scrollable) */}
          <div 
            ref={historyRef}
            className="flex-1 overflow-y-auto px-4 py-6"
            style={{ paddingBottom: '24px' }}
          >
            <div className="max-w-5xl mx-auto space-y-4">
              {/* Show resume message if returning user */}
              {progress.answered > 0 && interviewState.transcript.length > 0 && (
                <Alert className="bg-blue-950/30 border-blue-800/50 text-blue-200">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    <strong>Welcome back!</strong> You've completed {progress.answered} of {progress.total} questions. 
                    Continuing from where you left off...
                  </AlertDescription>
                </Alert>
              )}
              
              {/* Render transcript history */}
              {interviewState.transcript.map((entry) => (
                <TranscriptEntry 
                  key={entry.id} 
                  entry={entry} 
                  getQuestionNumber={getQuestionNumber}
                  getFollowUpPackName={getFollowUpPackName}
                />
              ))}
            </div>
          </div>

          {/* Active Question (Fixed at Bottom) */}
          {currentPrompt && (
            <div className="flex-shrink-0 px-4 pb-4">
              <div className="max-w-5xl mx-auto">
                <div 
                  className="bg-slate-800/95 backdrop-blur-sm border-2 border-blue-500/50 rounded-xl p-6 shadow-2xl"
                  style={{
                    boxShadow: '0 10px 30px rgba(0,0,0,0.45), 0 0 0 3px rgba(59, 130, 246, 0.2) inset'
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-600/30 flex items-center justify-center flex-shrink-0 border border-blue-500/50">
                      {isFollowUpMode ? (
                        <Layers className="w-4 h-4 text-orange-400" />
                      ) : (
                        <Shield className="w-4 h-4 text-blue-400" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {isFollowUpMode ? (
                          <>
                            <span className="text-xs font-semibold text-orange-400">
                              Follow-up {currentPrompt.stepNumber} of {currentPrompt.totalSteps}
                            </span>
                            <span className="text-xs text-slate-500">•</span>
                            <span className="text-xs text-orange-300">
                              {getFollowUpPackName(currentPrompt.packId)}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-xs font-semibold text-blue-400">
                              Question {getQuestionNumber(currentPrompt.id)}
                            </span>
                            <span className="text-xs text-slate-500">•</span>
                            <span className="text-xs text-slate-400">
                              {currentPrompt.category}
                            </span>
                          </>
                        )}
                      </div>
                      <p className="text-white text-lg font-semibold leading-relaxed">
                        {currentPrompt.text}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Prompt Panel (Fixed at Bottom) */}
        <footer className="flex-shrink-0 bg-slate-800/95 backdrop-blur-sm border-t border-slate-700 px-4 py-4">
          <div className="max-w-5xl mx-auto">
            {isYesNoQuestion && !isFollowUpMode ? (
              <div className="flex gap-3 mb-3">
                <Button
                  type="button"
                  onClick={() => handleAnswer("Yes")}
                  disabled={isCommittingRef.current}
                  className="bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2 flex-1 h-14"
                  size="lg"
                >
                  <Check className="w-5 h-5" />
                  <span className="font-semibold">Yes</span>
                </Button>
                <Button
                  type="button"
                  onClick={() => handleAnswer("No")}
                  disabled={isCommittingRef.current}
                  className="bg-red-600 hover:bg-red-700 text-white flex items-center justify-center gap-2 flex-1 h-14"
                  size="lg"
                >
                  <X className="w-5 h-5" />
                  <span className="font-semibold">No</span>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleTextSubmit} className="flex gap-3 mb-3">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={isFollowUpMode ? "Type your follow-up response..." : "Type your response..."}
                  className="flex-1 bg-slate-900/50 border-slate-600 text-white h-12"
                  disabled={isCommittingRef.current}
                  autoComplete="off"
                  autoFocus
                />
                <Button
                  type="submit"
                  disabled={!input.trim() || isCommittingRef.current}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6"
                  size="lg"
                >
                  <Send className="w-5 h-5 mr-2" />
                  Send
                </Button>
              </form>
            )}
            
            <p className="text-xs text-slate-400 text-center leading-relaxed">
              Once you submit an answer, it cannot be changed.<br />
              Please contact your assigned investigator after the interview if any corrections are needed.
            </p>
          </div>
        </footer>
      </div>

      {/* Completion Modal */}
      <Dialog open={showCompletionModal} onOpenChange={() => {}}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md" hideClose>
          <DialogHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-4 rounded-full bg-green-600/20">
                <CheckCircle2 className="w-12 h-12 text-green-400" />
              </div>
            </div>
            <DialogTitle className="text-2xl font-bold text-center">
              Interview Complete
            </DialogTitle>
            <DialogDescription className="text-slate-300 text-center pt-4 space-y-3">
              <p className="text-base leading-relaxed">
                Thank you for completing your background interview.
              </p>
              <p className="text-base leading-relaxed">
                Your responses have been securely recorded and encrypted. This interview will now be sent to the investigators for review.
              </p>
              <p className="text-sm text-slate-400 pt-2">
                Session Code: <span className="font-mono text-slate-300">{session?.session_code}</span>
              </p>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center pt-4">
            <Button
              onClick={handleCompletionConfirm}
              disabled={isCompletingInterview}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 h-12"
              size="lg"
            >
              {isCompletingInterview ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Completing...
                </>
              ) : (
                'OK'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============================================================================
// TRANSCRIPT ENTRY COMPONENT
// ============================================================================

function TranscriptEntry({ entry, getQuestionNumber, getFollowUpPackName }) {
  if (entry.type === 'question') {
    return (
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5 opacity-85 animate-in fade-in slide-in-from-bottom-2 duration-200">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0">
            <Shield className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-semibold text-blue-400">
                Question {getQuestionNumber(entry.questionId)}
              </span>
              <span className="text-xs text-slate-500">•</span>
              <span className="text-xs text-slate-400">
                {entry.category}
              </span>
            </div>
            <p className="text-white leading-relaxed">
              {entry.content}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (entry.type === 'answer') {
    return (
      <div className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-200">
        <div className="bg-blue-600 rounded-xl px-5 py-3 max-w-2xl">
          <p className="text-white font-medium">
            {entry.content}
          </p>
        </div>
      </div>
    );
  }

  if (entry.type === 'followup_question') {
    return (
      <div className="bg-orange-950/30 border border-orange-800/50 rounded-xl p-5 opacity-85 animate-in fade-in slide-in-from-bottom-2 duration-200">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full bg-orange-600/20 flex items-center justify-center flex-shrink-0">
            <Layers className="w-3.5 h-3.5 text-orange-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-semibold text-orange-400">
                Follow-up
              </span>
              <span className="text-xs text-slate-500">•</span>
              <span className="text-xs text-orange-300">
                {getFollowUpPackName(entry.packId)}
              </span>
            </div>
            <p className="text-white leading-relaxed">
              {entry.content}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (entry.type === 'followup_answer') {
    return (
      <div className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-200">
        <div className="bg-orange-600 rounded-xl px-5 py-3 max-w-2xl">
          <p className="text-white font-medium">
            {entry.content}
          </p>
        </div>
      </div>
    );
  }

  // NEW: Validation hint
  if (entry.type === 'validation_hint') {
    return (
      <div className="flex justify-center animate-in fade-in slide-in-from-bottom-2 duration-200">
        <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-xl px-4 py-2 max-w-xl">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
            <p className="text-yellow-200 text-sm">{entry.content}</p>
          </div>
        </div>
      </div>
    );
  }

  // NEW: AI clarification
  if (entry.type === 'ai_clarification') {
    return (
      <div className="bg-purple-950/20 border border-purple-800/50 rounded-xl p-5 animate-in fade-in slide-in-from-bottom-2 duration-200">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full bg-purple-600/20 flex items-center justify-center flex-shrink-0">
            <Layers className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-semibold text-purple-400">
                Clarification
              </span>
            </div>
            <p className="text-white leading-relaxed">
              {entry.content}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
