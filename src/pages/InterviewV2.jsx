
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
  validateFollowUpAnswer,
  checkFollowUpTrigger,
  computeNextQuestionId
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
 * InterviewV2 - Single-Active Question Flow (No AI)
 * Queue-based system: only show current question, hide future questions
 */
export default function InterviewV2() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('session');

  // Core state - REFACTORED FOR SINGLE-ACTIVE FLOW
  const [engine, setEngine] = useState(null);
  const [session, setSession] = useState(null);
  const [department, setDepartment] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // NEW: Queue-based state (no transcript stored, only answered pairs)
  const [transcript, setTranscript] = useState([]); // Array<{id, questionId, questionText, answer, category, type}>
  const [queue, setQueue] = useState([]); // Array<{id, type: 'question'|'followup', packId?, stepIndex?}>
  const [currentItem, setCurrentItem] = useState(null); // Current active question
  
  // Input state
  const [input, setInput] = useState("");
  const [validationHint, setValidationHint] = useState(null);
  
  // Modal state
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [isCompletingInterview, setIsCompletingInterview] = useState(false);

  // Refs
  const historyRef = useRef(null);
  const isCommittingRef = useRef(false);
  const displayOrderRef.current = 0;
  const inputRef = useRef(null);

  // ============================================================================
  // INITIALIZATION
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
      console.log('🚀 Initializing single-active interview flow...');
      const startTime = performance.now();

      // Step 1: Load session
      const loadedSession = await base44.entities.InterviewSession.get(sessionId);
      
      if (loadedSession.status === 'completed') {
        setError('This interview has already been completed and is no longer accessible.');
        setIsLoading(false);
        return;
      }
      
      setSession(loadedSession);
      
      // Step 1.5: Load department info
      try {
        const departments = await base44.entities.Department.filter({ 
          department_code: loadedSession.department_code 
        });
        if (departments.length > 0) {
          setDepartment(departments[0]);
        }
      } catch (err) {
        console.warn('⚠️ Could not load department info:', err);
      }
      
      // Step 2: Bootstrap engine
      const engineData = await bootstrapEngine(base44);
      setEngine(engineData);
      
      // Step 3: Load existing responses (for resume support)
      const existingResponses = await base44.entities.Response.filter({ 
        session_id: sessionId 
      });
      
      if (existingResponses.length > 0) {
        displayOrderRef.current = existingResponses.length;
      }
      
      // Step 4: Initialize queue-based state
      if (existingResponses.length > 0) {
        console.log('🔄 Restoring from existing responses...');
        await restoreFromResponses(engineData, existingResponses);
      } else {
        console.log('🎯 Starting fresh interview');
        // FIXED: Initialize with EMPTY queue, only set currentItem
        const firstQuestionId = engineData.ActiveOrdered[0];
        setQueue([]); // Queue is empty at start
        setCurrentItem({ id: firstQuestionId, type: 'question' });
      }
      
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
  // RESTORE FROM DATABASE
  // ============================================================================

  const restoreFromResponses = async (engineData, responses) => {
    console.log('🔄 Rebuilding state from database...');
    
    // Sort responses by timestamp
    const sortedResponses = responses.sort((a, b) => 
      new Date(a.response_timestamp) - new Date(b.response_timestamp)
    );
    
    const restoredTranscript = [];
    let lastQuestionId = null;
    let lastAnswer = null;
    
    // Build transcript from responses
    for (const response of sortedResponses) {
      const question = engineData.QById[response.question_id];
      if (question) {
        restoredTranscript.push({
          id: `q-${response.id}`,
          questionId: response.question_id,
          questionText: question.question_text,
          answer: response.answer,
          category: question.category,
          type: 'question',
          timestamp: response.response_timestamp
        });
        lastQuestionId = response.question_id;
        lastAnswer = response.answer;
      }
    }
    
    setTranscript(restoredTranscript);
    
    // Compute next question from last answered
    if (lastQuestionId && lastAnswer) {
      const nextQuestionId = computeNextQuestionId(engineData, lastQuestionId, lastAnswer);
      if (nextQuestionId) {
        // FIXED: Empty queue, only set currentItem
        setQueue([]);
        setCurrentItem({ id: nextQuestionId, type: 'question' });
      } else {
        // Interview complete
        setCurrentItem(null);
        setShowCompletionModal(true);
      }
    }
    
    console.log(`✅ Restored ${restoredTranscript.length} answered questions`);
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

  // ============================================================================
  // ANSWER SUBMISSION - QUEUE-BASED FLOW
  // ============================================================================

  const handleAnswer = useCallback(async (value) => {
    if (isCommittingRef.current || !currentItem || !engine) {
      console.warn('⚠️ Already committing or no current item');
      return;
    }

    isCommittingRef.current = true;
    setValidationHint(null);

    try {
      console.log(`📝 Processing answer for ${currentItem.type}:`, value);

      if (currentItem.type === 'question') {
        // PRIMARY QUESTION
        const question = engine.QById[currentItem.id];
        if (!question) {
          throw new Error(`Question ${currentItem.id} not found`);
        }

        // Add to transcript
        const transcriptEntry = {
          id: `q-${Date.now()}`,
          questionId: currentItem.id,
          questionText: question.question_text,
          answer: value,
          category: question.category,
          type: 'question',
          timestamp: new Date().toISOString()
        };
        
        setTranscript(prev => [...prev, transcriptEntry]);

        // Save to database
        await saveAnswerToDatabase(currentItem.id, value, question);

        // Determine next items (deterministic routing)
        const nextIds = [];
        
        // Check for follow-ups
        const followUpTrigger = checkFollowUpTrigger(engine, currentItem.id, value);
        if (followUpTrigger) {
          console.log(`🔔 Follow-up triggered: ${followUpTrigger}`);
          const packSteps = engine.PackStepsById[followUpTrigger];
          if (packSteps && packSteps.length > 0) {
            // Add all follow-up steps to queue
            for (let i = 0; i < packSteps.length; i++) {
              nextIds.push({
                id: `${followUpTrigger}:${i}`,
                type: 'followup',
                packId: followUpTrigger,
                stepIndex: i
              });
            }
          }
        }
        
        // Then add next primary question
        const nextQuestionId = computeNextQuestionId(engine, currentItem.id, value);
        console.log(`➡️ Next question ID: ${nextQuestionId}`);
        if (nextQuestionId) {
          nextIds.push({ id: nextQuestionId, type: 'question' });
        }

        console.log(`📋 Next items to queue:`, nextIds);

        // FIXED: Update queue and dequeue next item properly
        // Add new items to EXISTING queue, then shift
        const updatedQueue = [...queue, ...nextIds];
        const nextItem = updatedQueue.shift() || null;
        
        console.log(`✅ Next item:`, nextItem);
        console.log(`✅ Remaining queue:`, updatedQueue);
        
        setQueue(updatedQueue);
        setCurrentItem(nextItem);
        
        if (!nextItem) {
          // Interview complete
          setShowCompletionModal(true);
        }

      } else if (currentItem.type === 'followup') {
        // FOLLOW-UP QUESTION
        const { packId, stepIndex } = currentItem;
        const packSteps = engine.PackStepsById[packId];
        const step = packSteps[stepIndex];

        // Validate answer
        const validation = validateFollowUpAnswer(value, step.Expected_Type || 'TEXT', step.Options);
        
        if (!validation.valid) {
          console.log(`❌ Validation failed: ${validation.hint}`);
          setValidationHint(validation.hint);
          isCommittingRef.current = false;
          
          setTimeout(() => {
            if (inputRef.current) {
              inputRef.current.focus();
            }
          }, 100);
          return;
        }

        // Add to transcript
        const transcriptEntry = {
          id: `fu-${Date.now()}`,
          questionId: currentItem.id,
          questionText: step.Prompt,
          answer: validation.normalized || value,
          packId: packId,
          type: 'followup',
          timestamp: new Date().toISOString()
        };
        
        setTranscript(prev => [...prev, transcriptEntry]);

        // Save to database
        await saveFollowUpAnswer(packId, step.Field_Key, validation.normalized || value);

        // FIXED: Move to next in queue properly
        const nextItem = queue.shift() || null;
        setQueue([...queue]); // Update queue state after shift
        setCurrentItem(nextItem);
        
        if (!nextItem) {
          setShowCompletionModal(true);
        }
      }

      isCommittingRef.current = false;
      setInput(""); // Clear input
      setTimeout(autoScrollToBottom, 100);

    } catch (err) {
      console.error('❌ Error processing answer:', err);
      isCommittingRef.current = false;
      setError(`Error: ${err.message}`);
    }

  }, [currentItem, engine, queue, autoScrollToBottom]);

  // Text input submit handler
  const handleTextSubmit = useCallback((e) => {
    e.preventDefault();
    const answer = input.trim();
    if (!answer) return;
    handleAnswer(answer);
  }, [input, handleAnswer]);

  // ============================================================================
  // DATABASE PERSISTENCE
  // ============================================================================

  const saveAnswerToDatabase = async (questionId, answer, question) => {
    try {
      // Check if already exists
      const existing = await base44.entities.Response.filter({
        session_id: sessionId,
        question_id: questionId
      });
      
      if (existing.length > 0) {
        console.log(`ℹ️ Response for ${questionId} already exists, skipping`);
        return;
      }
      
      const currentDisplayOrder = displayOrderRef.current++;
      const triggersFollowup = question.followup_pack && answer.toLowerCase() === 'yes';
      
      await base44.entities.Response.create({
        session_id: sessionId,
        question_id: questionId,
        question_text: question.question_text,
        category: question.category,
        answer: answer,
        answer_array: null,
        triggered_followup: triggersFollowup,
        followup_pack: triggersFollowup ? question.followup_pack : null,
        is_flagged: false,
        flag_reason: null,
        response_timestamp: new Date().toISOString(),
        display_order: currentDisplayOrder
      });
      
      // Update session progress
      const totalAnswered = transcript.length + 1;
      const percentage = Math.round((totalAnswered / engine.TotalQuestions) * 100);
      
      await base44.entities.InterviewSession.update(sessionId, {
        total_questions_answered: totalAnswered,
        completion_percentage: percentage,
        followups_triggered: triggersFollowup ? (session?.followups_triggered || 0) + 1 : (session?.followups_triggered || 0)
      });

    } catch (err) {
      console.error('❌ Database save error:', err);
    }
  };

  const saveFollowUpAnswer = async (packId, fieldKey, answer) => {
    try {
      const responses = await base44.entities.Response.filter({
        session_id: sessionId,
        followup_pack: packId,
        triggered_followup: true
      });
      
      if (responses.length === 0) {
        console.error(`❌ No triggering response found for pack ${packId}`);
        return;
      }
      
      const triggeringResponse = responses[responses.length - 1];
      const existingFollowups = await base44.entities.FollowUpResponse.filter({
        session_id: sessionId,
        response_id: triggeringResponse.id,
        followup_pack: packId
      });
      
      if (existingFollowups.length === 0) {
        await base44.entities.FollowUpResponse.create({
          session_id: sessionId,
          response_id: triggeringResponse.id,
          question_id: triggeringResponse.question_id,
          followup_pack: packId,
          instance_number: 1,
          incident_description: answer,
          completed: false,
          additional_details: { [fieldKey]: answer }
        });
      } else {
        const existing = existingFollowups[0];
        await base44.entities.FollowUpResponse.update(existing.id, {
          additional_details: {
            ...(existing.additional_details || {}),
            [fieldKey]: answer
          }
        });
      }

    } catch (err) {
      console.error('❌ Follow-up save error:', err);
    }
  };

  // ============================================================================
  // COMPLETION HANDLING
  // ============================================================================

  const handleCompletionConfirm = async () => {
    setIsCompletingInterview(true);
    
    try {
      await base44.entities.InterviewSession.update(sessionId, {
        status: 'completed',
        completed_date: new Date().toISOString(),
        completion_percentage: 100
      });

      console.log('✅ Interview marked as completed');
      navigate(createPageUrl("Home"));
      
    } catch (err) {
      console.error('❌ Error completing interview:', err);
      setError('Failed to complete interview. Please try again.');
      setIsCompletingInterview(false);
    }
  };

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  const getQuestionNumber = (questionId) => {
    if (!questionId) return '';
    return questionId.replace(/^Q0*/, '');
  };

  const getFollowUpPackName = (packId) => {
    return FOLLOWUP_PACK_NAMES[packId] || 'Follow-up Questions';
  };

  const getCurrentPrompt = () => {
    if (!currentItem || !engine) return null;

    if (currentItem.type === 'question') {
      const question = engine.QById[currentItem.id];
      return question ? {
        type: 'question',
        id: question.question_id,
        text: question.question_text,
        responseType: question.response_type,
        category: question.category
      } : null;
    }

    if (currentItem.type === 'followup') {
      const { packId, stepIndex } = currentItem;
      const packSteps = engine.PackStepsById[packId];
      if (!packSteps) return null;
      
      const step = packSteps[stepIndex];
      return {
        type: 'followup',
        id: currentItem.id,
        text: step.Prompt,
        responseType: step.Response_Type || 'text',
        expectedType: step.Expected_Type || 'TEXT',
        packId: packId,
        stepNumber: stepIndex + 1,
        totalSteps: packSteps.length
      };
    }

    return null;
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
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button onClick={() => navigate(createPageUrl("Home"))} className="w-full">
            Return to Home
          </Button>
        </div>
      </div>
    );
  }

  const currentPrompt = getCurrentPrompt();
  const totalQuestions = engine?.TotalQuestions || 162;
  const answeredCount = transcript.length;
  const progress = Math.round((answeredCount / totalQuestions) * 100);
  const isYesNoQuestion = currentPrompt?.responseType === 'yes_no';
  const isFollowUpMode = currentPrompt?.type === 'followup';
  const requiresClarification = validationHint !== null;

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
                  {answeredCount} / {totalQuestions}
                </div>
                <div className="text-xs text-slate-400">
                  {progress}% Complete
                </div>
              </div>
            </div>
            
            {department && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 border-t border-slate-700/50 pt-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-slate-300">{department.department_name}</span>
                </div>
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
            )}
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {/* History (Answered Q&A Only) */}
          <div 
            ref={historyRef}
            className="flex-1 overflow-y-auto px-4 py-6"
          >
            <div className="max-w-5xl mx-auto space-y-4">
              {answeredCount > 0 && (
                <Alert className="bg-blue-950/30 border-blue-800/50 text-blue-200">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    You've completed {answeredCount} of {totalQuestions} questions. Keep going!
                  </AlertDescription>
                </Alert>
              )}
              
              {transcript.map((entry) => (
                <HistoryEntry 
                  key={entry.id} 
                  entry={entry}
                  getQuestionNumber={getQuestionNumber}
                  getFollowUpPackName={getFollowUpPackName}
                />
              ))}
            </div>
          </div>

          {/* Active Question (Single, Fixed at Bottom) */}
          {currentPrompt && (
            <div className="flex-shrink-0 px-4 pb-4">
              <div className="max-w-5xl mx-auto">
                <div 
                  className={requiresClarification 
                    ? "bg-purple-950/95 border-2 border-purple-500/50 rounded-xl p-6 shadow-2xl"
                    : "bg-slate-800/95 backdrop-blur-sm border-2 border-blue-500/50 rounded-xl p-6 shadow-2xl"
                  }
                  style={{
                    boxShadow: requiresClarification
                      ? '0 12px 36px rgba(0,0,0,0.55), 0 0 0 3px rgba(200,160,255,0.30) inset'
                      : '0 10px 30px rgba(0,0,0,0.45), 0 0 0 3px rgba(59, 130, 246, 0.2) inset'
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border ${
                      requiresClarification 
                        ? 'bg-purple-600/30 border-purple-500/50'
                        : 'bg-blue-600/30 border-blue-500/50'
                    }`}>
                      {requiresClarification ? (
                        <AlertCircle className="w-4 h-4 text-purple-400" />
                      ) : isFollowUpMode ? (
                        <Layers className="w-4 h-4 text-orange-400" />
                      ) : (
                        <Shield className="w-4 h-4 text-blue-400" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {requiresClarification ? (
                          <>
                            <span className="text-xs font-semibold text-purple-400">Clarification Needed</span>
                            <span className="text-xs text-slate-500">•</span>
                            <span className="text-xs text-purple-300">
                              {getFollowUpPackName(currentPrompt.packId)}
                            </span>
                          </>
                        ) : isFollowUpMode ? (
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
                            <span className="text-xs text-slate-400">{currentPrompt.category}</span>
                          </>
                        )}
                      </div>
                      <p className="text-white text-lg font-semibold leading-relaxed">
                        {currentPrompt.text}
                      </p>
                      
                      {validationHint && (
                        <div className="mt-3 bg-yellow-900/40 border border-yellow-700/60 rounded-lg p-3" role="alert">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                            <p className="text-yellow-200 text-sm leading-relaxed">{validationHint}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Prompt Panel */}
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
                  ref={inputRef}
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
              Once you submit an answer, it cannot be changed. Contact your investigator after the interview if corrections are needed.
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
            <DialogTitle className="text-2xl font-bold text-center">Interview Complete</DialogTitle>
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
// HISTORY ENTRY COMPONENT (Answered Q&A Only)
// ============================================================================

function HistoryEntry({ entry, getQuestionNumber, getFollowUpPackName }) {
  if (entry.type === 'question') {
    return (
      <div className="space-y-3">
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5 opacity-85">
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
                <span className="text-xs text-slate-400">{entry.category}</span>
              </div>
              <p className="text-white leading-relaxed">{entry.questionText}</p>
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <div className="bg-blue-600 rounded-xl px-5 py-3 max-w-2xl">
            <p className="text-white font-medium">{entry.answer}</p>
          </div>
        </div>
      </div>
    );
  }

  if (entry.type === 'followup') {
    return (
      <div className="space-y-3">
        <div className="bg-orange-950/30 border border-orange-800/50 rounded-xl p-5 opacity-85">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-orange-600/20 flex items-center justify-center flex-shrink-0">
              <Layers className="w-3.5 h-3.5 text-orange-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-semibold text-orange-400">Follow-up</span>
                <span className="text-xs text-slate-500">•</span>
                <span className="text-xs text-orange-300">
                  {getFollowUpPackName(entry.packId)}
                </span>
              </div>
              <p className="text-white leading-relaxed">{entry.questionText}</p>
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <div className="bg-orange-600 rounded-xl px-5 py-3 max-w-2xl">
            <p className="text-white font-medium">{entry.answer}</p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
