
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Send, Loader2, Check, X, AlertCircle, Layers, CheckCircle2, Pause, Copy, XCircle } from "lucide-react";
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
import { toast } from "sonner";

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
 * InterviewV2 - Single-Active Question Flow (No AI) with Persistent Resume
 * Queue-based system: only show current question, hide future questions
 * State persisted to database for seamless resume
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
  
  // NEW: Queue-based state (persisted to DB for resume)
  const [transcript, setTranscript] = useState([]); // Array<{id, questionId, questionText, answer, category, type}>
  const [queue, setQueue] = useState([]); // Array<{id, type: 'question'|'followup', packId?, stepIndex?}>
  const [currentItem, setCurrentItem] = useState(null); // Current active question
  
  // Input state
  const [input, setInput] = useState("");
  const [validationHint, setValidationHint] = useState(null);
  
  // FIXED: Use state instead of ref for isCommitting so UI updates properly
  const [isCommitting, setIsCommitting] = useState(false);
  
  // Modal state
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [isCompletingInterview, setIsCompletingInterview] = useState(false);

  // NEW: Pause modal and resume banner state
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [wasPaused, setWasPaused] = useState(false);

  // Refs
  const historyRef = useRef(null);
  const displayOrderRef = useRef(0);
  const inputRef = useRef(null);
  const yesButtonRef = useRef(null);
  const noButtonRef = useRef(null);

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  // Auto-scroll function - DEFINED BEFORE useEffect hooks that use it
  const autoScrollToBottom = useCallback(() => {
    if (!historyRef.current) return;
    
    requestAnimationFrame(() => {
      if (historyRef.current) {
        historyRef.current.scrollTop = historyRef.current.scrollHeight;
      }
    });
  }, []);

  useEffect(() => {
    if (!sessionId) {
      navigate(createPageUrl("StartInterview"));
      return;
    }
    initializeInterview();
  }, [sessionId, navigate]);

  // NEW: Enhanced autofocus - prefers Y/N buttons if present
  useEffect(() => {
    if (currentItem && !isCommitting) {
      requestAnimationFrame(() => {
        // Prefer Y/N buttons for yes_no questions
        if (yesButtonRef.current) {
          yesButtonRef.current.focus({ preventScroll: false });
        } else if (inputRef.current) {
          inputRef.current.focus({ preventScroll: false });
        }
      });
    }
  }, [currentItem, isCommitting]);

  // NEW: Auto-scroll after transcript updates
  useEffect(() => {
    if (transcript.length > 0) {
      setTimeout(autoScrollToBottom, 150);
    }
  }, [transcript.length, autoScrollToBottom]);

  // NEW: Keyboard navigation for Y/N buttons
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Only apply if Yes/No buttons are currently rendered
      if (yesButtonRef.current && noButtonRef.current) {
        
        // Arrow keys to switch focus between Y/N
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault(); // Prevent default scroll behavior
          if (document.activeElement === yesButtonRef.current) {
            noButtonRef.current.focus();
          } else if (document.activeElement === noButtonRef.current) {
            yesButtonRef.current.focus();
          } else {
            // If neither is focused, focus 'Yes' by default when arrow key is pressed
            yesButtonRef.current.focus();
          }
        }
        
        // Space key to activate focused button
        if (e.key === ' ' && (document.activeElement === yesButtonRef.current || document.activeElement === noButtonRef.current)) {
          e.preventDefault(); // Prevent default space bar scroll
          document.activeElement.click(); // Simulate a click
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentItem]); // Re-attach event listener if currentItem changes (e.g., from text to Y/N or vice-versa)

  const initializeInterview = async () => {
    try {
      console.log('🚀 Initializing single-active interview flow with persistent resume...');
      const startTime = performance.now();

      // Step 1: Load session
      const loadedSession = await base44.entities.InterviewSession.get(sessionId);
      
      if (loadedSession.status === 'completed') {
        setError('This interview has already been completed and is no longer accessible.');
        setIsLoading(false);
        return;
      }
      
      // Check if session was paused
      if (loadedSession.status === 'paused') {
        setWasPaused(true);
        setShowResumeBanner(true);
        // Update status to in_progress when resuming
        await base44.entities.InterviewSession.update(sessionId, {
          status: 'in_progress'
        });
        loadedSession.status = 'in_progress'; // Update local state for immediate use
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
      
      // Step 3: Try to restore from snapshots first, then fall back to responses
      if (loadedSession.transcript_snapshot && loadedSession.transcript_snapshot.length > 0 || loadedSession.current_item_snapshot) {
        console.log('🔄 Restoring from session snapshots...');
        restoreFromSnapshots(engineData, loadedSession);
      } else {
        // Fallback: Load from Response entities
        const existingResponses = await base44.entities.Response.filter({ 
          session_id: sessionId 
        });
        
        if (existingResponses.length > 0) {
          displayOrderRef.current = existingResponses.length;
          console.log('🔄 Restoring from Response entities...');
          await restoreFromResponses(engineData, existingResponses);
        } else {
          console.log('🎯 Starting fresh interview');
          const firstQuestionId = engineData.ActiveOrdered[0];
          setQueue([]);
          setCurrentItem({ id: firstQuestionId, type: 'question' });
        }
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
  // RESTORE FROM SNAPSHOTS (Preferred Method)
  // ============================================================================

  const restoreFromSnapshots = (engineData, loadedSession) => {
    console.log('📸 Restoring from snapshots...');
    
    // Restore transcript directly from snapshot
    const restoredTranscript = loadedSession.transcript_snapshot || [];
    setTranscript(restoredTranscript);
    
    // Restore queue directly from snapshot
    const restoredQueue = loadedSession.queue_snapshot || [];
    setQueue(restoredQueue);
    
    // Restore current item from snapshot
    const restoredCurrentItem = loadedSession.current_item_snapshot || null;
    setCurrentItem(restoredCurrentItem);
    
    console.log(`✅ Restored ${restoredTranscript.length} transcript entries`);
    console.log(`✅ Restored queue with ${restoredQueue.length} pending items`);
    console.log(`✅ Current item:`, restoredCurrentItem);
    
    // If no current item but queue has items, something went wrong - self-heal
    if (!restoredCurrentItem && restoredQueue.length > 0) {
      console.warn('⚠️ No current item but queue exists - self-healing...');
      const nextItem = restoredQueue[0];
      setCurrentItem(nextItem);
      setQueue(restoredQueue.slice(1)); // Remove the first item as it's now current
    }
    
    // If we're complete
    if (!restoredCurrentItem && restoredQueue.length === 0 && restoredTranscript.length > 0) {
      console.log('✅ Interview appears complete based on snapshots.');
      setShowCompletionModal(true);
    }
    
    setTimeout(() => autoScrollToBottom(), 100);
  };

  // ============================================================================
  // RESTORE FROM RESPONSE ENTITIES (Fallback)
  // ============================================================================

  const restoreFromResponses = async (engineData, responses) => {
    console.log('🔄 Rebuilding state from Response entities (fallback)...');
    
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
        setQueue([]);
        setCurrentItem({ id: nextQuestionId, type: 'question' });
      } else {
        setCurrentItem(null);
        setShowCompletionModal(true);
      }
    } else if (restoredTranscript.length === 0) {
        // If no responses, start fresh
        const firstQuestionId = engineData.ActiveOrdered[0];
        setQueue([]);
        setCurrentItem({ id: firstQuestionId, type: 'question' });
    }
    
    console.log(`✅ Restored ${restoredTranscript.length} answered questions from Response entities`);
  };

  // ============================================================================
  // PERSIST STATE TO DATABASE (Atomic Write)
  // ============================================================================

  const persistStateToDatabase = async (newTranscript, newQueue, newCurrentItem) => {
    try {
      console.log('💾 Persisting state to database...');
      
      await base44.entities.InterviewSession.update(sessionId, {
        transcript_snapshot: newTranscript,
        queue_snapshot: newQueue,
        current_item_snapshot: newCurrentItem,
        total_questions_answered: newTranscript.filter(t => t.type === 'question').length,
        completion_percentage: Math.round((newTranscript.filter(t => t.type === 'question').length / 162) * 100),
        data_version: 'v1.0' // Versioning for future schema changes
      });
      
      console.log('✅ State persisted successfully');
    } catch (err) {
      console.error('❌ Failed to persist state:', err);
      // Non-fatal - continue anyway
    }
  };

  // ============================================================================
  // ANSWER SUBMISSION - QUEUE-BASED FLOW WITH PERSISTENCE
  // ============================================================================

  const handleAnswer = useCallback(async (value) => {
    if (isCommitting || !currentItem || !engine) {
      console.warn('⚠️ Already committing or no current item');
      return;
    }

    setIsCommitting(true);
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
        
        const newTranscript = [...transcript, transcriptEntry];
        setTranscript(newTranscript);

        // Determine next items (deterministic routing)
        const nextIds = [];
        
        // Check for follow-ups
        const followUpTrigger = checkFollowUpTrigger(engine, currentItem.id, value);
        if (followUpTrigger) {
          console.log(`🔔 Follow-up triggered: ${followUpTrigger}`);
          const packSteps = engine.PackStepsById[followUpTrigger];
          if (packSteps && packSteps.length > 0) {
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
        if (nextQuestionId) {
          nextIds.push({ id: nextQuestionId, type: 'question' });
        }

        // Update queue and current item
        const updatedQueue = [...queue, ...nextIds];
        const nextItem = updatedQueue.shift() || null;
        
        setQueue(updatedQueue);
        setCurrentItem(nextItem);
        
        // Save to DB via snapshots (primary) AND Response entity (for backwards compatibility)
        await persistStateToDatabase(newTranscript, updatedQueue, nextItem);
        await saveAnswerToDatabase(currentItem.id, value, question);
        
        if (!nextItem) {
          setShowCompletionModal(true);
        }

      } else if (currentItem.type === 'followup') {
        // FOLLOW-UP QUESTION
        const { packId, stepIndex } = currentItem;
        const packSteps = engine.PackStepsById[packId];
        if (!packSteps || !packSteps[stepIndex]) {
          throw new Error(`Follow-up pack ${packId} step ${stepIndex} not found`);
        }
        const step = packSteps[stepIndex];

        // Validate answer
        const validation = validateFollowUpAnswer(value, step.Expected_Type || 'TEXT', step.Options);
        
        if (!validation.valid) {
          console.log(`❌ Validation failed: ${validation.hint}`);
          setValidationHint(validation.hint);
          setIsCommitting(false);
          
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
        
        const newTranscript = [...transcript, transcriptEntry];
        setTranscript(newTranscript);

        // Move to next in queue
        const updatedQueue = [...queue];
        const nextItem = updatedQueue.shift() || null;
        
        setQueue(updatedQueue);
        setCurrentItem(nextItem);
        
        // Save to DB via snapshots (primary) AND FollowUpResponse entity (for backwards compatibility)
        await persistStateToDatabase(newTranscript, updatedQueue, nextItem);
        await saveFollowUpAnswer(packId, step.Field_Key, validation.normalized || value);
        
        if (!nextItem) {
          setShowCompletionModal(true);
        }
      }

      setIsCommitting(false);
      setInput("");
      // autoScrollToBottom is now handled by a dedicated useEffect on transcript.length

    } catch (err) {
      console.error('❌ Error processing answer:', err);
      setIsCommitting(false);
      setError(`Error: ${err.message}`);
    }

  }, [currentItem, engine, queue, transcript, sessionId, isCommitting]);

  // Text input submit handler
  const handleTextSubmit = useCallback((e) => {
    e.preventDefault();
    const answer = input.trim();
    if (!answer) return;
    handleAnswer(answer);
  }, [input, handleAnswer]);

  // ============================================================================
  // DATABASE PERSISTENCE (Response/FollowUpResponse entities for backwards compat)
  // ============================================================================

  const saveAnswerToDatabase = async (questionId, answer, question) => {
    try {
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

    } catch (err) {
      console.error('❌ Database save error:', err);
    }
  };

  const saveFollowUpAnswer = async (packId, fieldKey, answer) => {
    try {
      // Find the *original* triggering response to associate this follow-up with.
      // This is a bit tricky with the new snapshot logic. We query for it based on session_id
      // and the packId, assuming the latest such response is the correct trigger.
      const responses = await base44.entities.Response.filter({
        session_id: sessionId,
        followup_pack: packId,
        triggered_followup: true
      });
      
      if (responses.length === 0) {
        console.error(`❌ No triggering response found for pack ${packId}`);
        return;
      }
      
      const triggeringResponse = responses[responses.length - 1]; // Use the latest one
      
      // Now check if a FollowUpResponse for this pack and triggering response already exists
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
          instance_number: 1, // Assuming one instance per pack for now
          incident_description: answer, // Could be generic, specific key is in additional_details
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
      console.error('❌ Follow-up (old FollowUpResponse entity) save error:', err);
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
        completion_percentage: 100,
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
  // PAUSE HANDLING (NEW)
  // ============================================================================
  const handlePauseClick = async () => {
    try {
      await base44.entities.InterviewSession.update(sessionId, {
        status: 'paused'
      });
      setShowPauseModal(true);
      console.log('⏸️ Interview paused');
    } catch (err) {
      console.error('❌ Error pausing interview:', err);
      toast.error('Failed to pause interview');
    }
  };

  const handleCopyDetails = async () => {
    const text = `Dept Code: ${session?.department_code} | File: ${session?.file_number}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Details copied to clipboard');
    } catch (err) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const handleCloseWindow = () => {
    // Attempt to close the window. Some browsers prevent this if not opened by script.
    // If it fails, inform the user they can close it manually.
    const canClose = window.close();
    if (!canClose) {
      toast.info('You can now close this tab. Use your Dept Code and File Number to resume later.');
    }
  };

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  const getQuestionNumber = (questionId) => {
    if (!questionId) return '';
    // This is a generic number extraction, might need to be specific to 'Q' questions
    if (questionId.startsWith('Q')) {
      return questionId.replace(/^Q0*/, '');
    }
    return ''; // Follow-up questions don't have a distinct question number like Q1, Q2.
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

  // NEW: Get contextual placeholder based on expected type
  const getPlaceholder = () => {
    if (!currentPrompt) return "Type your answer...";
    
    if (currentPrompt.type === 'followup') {
      const expectedType = currentPrompt.expectedType;
      if (expectedType === 'DATE' || expectedType === 'DATERANGE') {
        return "MM/DD/YYYY or Month YYYY (e.g., June 2023)";
      }
      if (expectedType === 'NUMBER') {
        return "Enter a number";
      }
      if (expectedType === 'BOOLEAN') {
        return "Yes or No";
      }
    }
    
    return "Type your answer...";
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
  const answeredCount = transcript.length; // Modified: Now counts all entries in transcript
  const progress = Math.round((answeredCount / totalQuestions) * 100);
  const isYesNoQuestion = currentPrompt?.responseType === 'yes_no';
  const isFollowUpMode = currentPrompt?.type === 'followup';
  const requiresClarification = validationHint !== null;

  return (
    <>
      <div className="h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex flex-col overflow-hidden">
        {/* REDESIGNED Header - Clean & Informative */}
        <header className="flex-shrink-0 bg-slate-800/95 backdrop-blur-sm border-b border-slate-700 px-4 py-3">
          <div className="max-w-5xl mx-auto">
            {/* Top Row: Logo + Pause Button */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <Shield className="w-6 h-6 text-blue-400" />
                <h1 className="text-lg font-semibold text-white">ClearQuest Interview</h1>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePauseClick}
                className="bg-slate-700/50 border-slate-600 text-slate-200 hover:bg-slate-700 hover:text-white hover:border-slate-500 flex items-center gap-2"
              >
                <Pause className="w-4 h-4" />
                <span>Pause</span>
              </Button>
            </div>
            
            {/* Department Info Row */}
            {department && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 border-t border-slate-700/50 pt-2 pb-2">
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
            
            {/* Progress Bar */}
            <div className="mt-2">
              <div 
                className="w-full h-2 bg-slate-700/30 rounded-full overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                aria-label={`Interview progress: ${progress}% complete`}
              >
                <div 
                  className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-full transition-all duration-500 ease-out"
                  style={{ 
                    width: `${progress}%`,
                    boxShadow: progress > 0 ? '0 0 12px rgba(34, 197, 94, 0.6)' : 'none'
                  }}
                />
              </div>
              {/* Progress Stats - Right Aligned */}
              <div className="flex justify-end items-center gap-2 mt-1.5">
                <span className="sr-only">Progress: {answeredCount} of {totalQuestions} questions answered</span>
                <span className="text-xs font-medium text-green-400">{progress}% Complete</span>
                <span className="text-xs text-green-400">•</span>
                <span className="text-xs font-medium text-green-400">{answeredCount} / {totalQuestions}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Resume Banner */}
        {showResumeBanner && (
          <div className="flex-shrink-0 bg-emerald-950/90 border-b border-emerald-800/50 px-4 py-3">
            <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-1">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <div className="flex flex-wrap items-center gap-2 text-sm text-emerald-100">
                  <span>Welcome back! Resuming interview with</span>
                  <span className="px-2 py-0.5 bg-emerald-900/50 rounded font-mono text-xs text-emerald-300">
                    {session?.department_code}
                  </span>
                  <span>•</span>
                  <span className="px-2 py-0.5 bg-emerald-900/50 rounded font-mono text-xs text-emerald-300">
                    {session?.file_number}
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowResumeBanner(false)}
                className="text-emerald-300 hover:text-emerald-100 hover:bg-emerald-900/30"
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}

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
                  data-active-question="true"
                  role="region"
                  aria-live="polite"
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
                      {/* ENLARGED Question Meta */}
                      <div className="flex items-center gap-2 mb-2">
                        {requiresClarification ? (
                          <>
                            <span className="text-sm font-semibold text-purple-400">Clarification Needed</span>
                            <span className="text-xs text-slate-500">•</span>
                            <span className="text-sm text-purple-300">
                              {getFollowUpPackName(currentPrompt.packId)}
                            </span>
                          </>
                        ) : isFollowUpMode ? (
                          <>
                            <span className="text-sm font-semibold text-orange-400">
                              Follow-up {currentPrompt.stepNumber} of {currentPrompt.totalSteps}
                            </span>
                            <span className="text-xs text-slate-500">•</span>
                            <span className="text-sm text-orange-300">
                              {getFollowUpPackName(currentPrompt.packId)}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-lg font-bold text-blue-400">
                              Question {getQuestionNumber(currentPrompt.id)}
                            </span>
                            <span className="text-sm text-slate-500">•</span>
                            <span className="text-sm font-medium text-slate-300">{currentPrompt.category}</span>
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

        {/* UPGRADED Footer - Mobile-First Response Composer */}
        <footer 
          className="flex-shrink-0 bg-[#121c33] border-t border-slate-700/50 shadow-[0_-6px_16px_rgba(0,0,0,0.45)] rounded-t-[14px]"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          role="form"
          aria-label="Response area"
        >
          <div className="max-w-5xl mx-auto px-4 py-3 md:py-4">
            {isYesNoQuestion && !isFollowUpMode ? (
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-3">
                <button
                  ref={yesButtonRef}
                  type="button"
                  onClick={() => handleAnswer("Yes")}
                  disabled={isCommitting || showPauseModal}
                  className="btn-yn btn-yes flex-1 min-h-[48px] sm:min-h-[48px] md:min-h-[52px] sm:min-w-[140px] rounded-[10px] font-bold text-white border border-transparent transition-all duration-75 ease-out flex items-center justify-center gap-2 text-base sm:text-base md:text-lg bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 focus-visible:shadow-[0_0_0_4px_rgba(255,255,255,0.15)] disabled:opacity-50 disabled:pointer-events-none"
                  aria-label="Answer Yes"
                >
                  <Check className="w-5 h-5 sm:w-5 sm:h-5 md:w-6 md:h-6" />
                  <span>Yes</span>
                </button>
                <button
                  ref={noButtonRef}
                  type="button"
                  onClick={() => handleAnswer("No")}
                  disabled={isCommitting || showPauseModal}
                  className="btn-yn btn-no flex-1 min-h-[48px] sm:min-h-[48px] md:min-h-[52px] sm:min-w-[140px] rounded-[10px] font-bold text-white border border-transparent transition-all duration-75 ease-out flex items-center justify-center gap-2 text-base sm:text-base md:text-lg bg-red-500 hover:bg-red-600 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 focus-visible:shadow-[0_0_0_4px_rgba(255,255,255,0.15)] disabled:opacity-50 disabled:pointer-events-none"
                  aria-label="Answer No"
                >
                  <X className="w-5 h-5 sm:w-5 sm:h-5 md:w-6 md:h-6" />
                  <span>No</span>
                </button>
              </div>
            ) : (
              <form onSubmit={handleTextSubmit} className="flex gap-2 sm:gap-3 mb-3">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={getPlaceholder()}
                  className="flex-1 bg-slate-900/50 border-slate-600 text-white h-12 sm:h-12 md:h-14 text-base sm:text-base md:text-lg focus:ring-2 focus:ring-green-400 focus:ring-offset-2 focus:ring-offset-[#121c33] focus:border-green-400"
                  disabled={isCommitting || showPauseModal}
                  autoComplete="off"
                />
                <Button
                  type="submit"
                  disabled={!input.trim() || isCommitting || showPauseModal}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 sm:px-6 h-12 sm:h-12 md:h-14 focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-[#121c33]"
                >
                  <Send className="w-5 h-5 sm:mr-2" />
                  <span className="hidden sm:inline">Send</span>
                </Button>
              </form>
            )}
            
            <p className="text-xs text-slate-400 text-center leading-relaxed px-2">
              Once you submit an answer, it cannot be changed. Contact your investigator after the interview if corrections are needed.
            </p>
          </div>
        </footer>
      </div>

      {/* Pause Modal */}
      <Dialog open={showPauseModal} onOpenChange={setShowPauseModal}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Pause className="w-5 h-5 text-blue-400" />
              Interview Paused
            </DialogTitle>
            <DialogDescription className="text-slate-300 pt-3 space-y-3">
              <p>Your interview is paused. You can close this window and come back anytime to continue.</p>
              <p>You will need your <strong className="text-white">Dept Code</strong> and <strong className="text-white">File Number</strong> to resume.</p>
              
              <div className="flex flex-wrap gap-2 pt-2">
                <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg">
                  <span className="text-xs text-slate-400 block mb-1">Dept Code</span>
                  <span className="font-mono text-sm text-slate-200">{session?.department_code}</span>
                </div>
                <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg">
                  <span className="text-xs text-slate-400 block mb-1">File Number</span>
                  <span className="font-mono text-sm text-slate-200">{session?.file_number}</span>
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-col gap-2 pt-4">
            <Button
              variant="outline"
              onClick={handleCopyDetails}
              className="w-full bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700 hover:text-white"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy Details
            </Button>
            <Button
              variant="outline"
              onClick={handleCloseWindow}
              className="w-full bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700 hover:text-white"
            >
              <XCircle className="w-4 h-4 mr-2" />
              Close Window
            </Button>
            <Button
              onClick={() => setShowPauseModal(false)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              Keep Working
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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

// UPDATED: Enlarged typography in history entries
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
                <span className="text-sm font-bold text-blue-400">
                  Question {getQuestionNumber(entry.questionId)}
                </span>
                <span className="text-xs text-slate-500">•</span>
                <span className="text-sm font-medium text-slate-300">{entry.category}</span>
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
                <span className="text-sm font-semibold text-orange-400">Follow-up</span>
                <span className="text-xs text-slate-500">•</span>
                <span className="text-sm text-orange-300">
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
