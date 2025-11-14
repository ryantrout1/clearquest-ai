
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
  computeNextQuestionId,
  injectSubstanceIntoPackSteps,
  shouldSkipFollowUpStep,
  shouldSkipProbingForHired
} from "../components/interviewEngine";
import {
  logMainQuestion,
  logMainAnswer,
  logFollowUpQuestion,
  logFollowUpAnswer,
  logAIQuestion,
  logAIAnswer,
  loadChatHistory,
  generateAIProbePackId
} from "../components/interview/interactionLogger";
import { toast } from "sonner";

// Follow-up pack display names
const FOLLOWUP_PACK_NAMES = {
  'PACK_LE_APPS': 'Applications with other Law Enforcement Agencies',
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
 * InterviewV2 - HYBRID FLOW (v2.5)
 * Deterministic base questions + follow-up packs (UI-driven) with conditional logic
 * AI agent handles probing + closure (after follow-up packs complete)
 * State persisted to database for seamless resume
 * PATCH: Smooth chat UI for investigator follow-ups (no refresh)
 */
export default function InterviewV2() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('session');

  // Core state
  const [engine, setEngine] = useState(null);
  const [session, setSession] = useState(null);
  const [department, setDepartment] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // NEW: Chat history from InteractionLog (source of truth for display)
  const [chatHistory, setChatHistory] = useState([]);

  // Queue-based state (persisted to DB for resume) - used for internal engine logic
  const [transcript, setTranscript] = useState([]); // This stores answered items for engine logic.
  const [queue, setQueue] = useState([]);
  const [currentItem, setCurrentItem] = useState(null);

  // Track answers within current follow-up pack for conditional logic
  const [currentFollowUpAnswers, setCurrentFollowUpAnswers] = useState({});

  // AI agent integration
  const [conversation, setConversation] = useState(null);
  const [agentMessages, setAgentMessages] = useState([]); // Raw messages from the agent API
  const [isWaitingForAgent, setIsWaitingForAgent] = useState(false);
  const [currentFollowUpPack, setCurrentFollowUpPack] = useState(null); // Track active pack for handoff
  const [currentAIProbePackId, setCurrentAIProbePackId] = useState(null); // Unique ID for current AI probing session
  const [aiProbeCount, setAIProbeCount] = useState(0); // Track AI question count within current probing session

  // Input state
  const [input, setInput] = useState("");
  const [validationHint, setValidationHint] = useState(null);
  const [isCommitting, setIsCommitting] = useState(false);

  // Modal state
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [isCompletingInterview, setIsCompletingInterview] = useState(false);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [wasPaused, setWasPaused] = useState(false);

  // Refs
  const historyRef = useRef(null);
  const displayOrderRef = useRef(0); // This was used for Response entities, less critical with InteractionLog
  const inputRef = useRef(null);
  const yesButtonRef = useRef(null);
  const noButtonRef = useRef(null);
  const unsubscribeRef = useRef(null);

  // NEW: Track global display numbers for questions
  const displayNumberMapRef = useRef({}); // Map question_id -> display number
  const lastActivityRef = useRef(Date.now());
  const activeTimeIntervalRef = useRef(null);

  // ============================================================================
  // ACTIVE TIME TRACKING
  // ============================================================================

  const ACTIVE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

  const updateActiveTime = useCallback(async () => {
    if (!sessionId || !session) return;

    const now = Date.now();
    const timeSinceActivity = now - lastActivityRef.current;

    // Only count time if within active window
    if (timeSinceActivity <= ACTIVE_WINDOW_MS) {
      const secondsToAdd = Math.floor(timeSinceActivity / 1000);

      if (secondsToAdd > 0) {
        try {
          await base44.entities.InterviewSession.update(sessionId, {
            active_seconds: (session.active_seconds || 0) + secondsToAdd,
            last_activity_at: new Date().toISOString()
          });
          setSession(prev => ({
            ...prev,
            active_seconds: (prev.active_seconds || 0) + secondsToAdd,
            last_activity_at: new Date().toISOString()
          }));
        } catch (err) {
          console.warn('⚠️ Error updating active time:', err);
        }
      }
    }

    lastActivityRef.current = now;
  }, [sessionId, session]);

  // Track activity and update active time
  useEffect(() => {
    lastActivityRef.current = Date.now();

    // Update active time every 30 seconds
    activeTimeIntervalRef.current = setInterval(updateActiveTime, 30000);

    return () => {
      if (activeTimeIntervalRef.current) {
        clearInterval(activeTimeIntervalRef.current);
      }
      // Ensure final active time update on unmount
      updateActiveTime();
    };
  }, [updateActiveTime]);

  // ============================================================================
  // REFRESH CHAT HISTORY FROM DATABASE
  // ============================================================================

  const refreshChatHistory = useCallback(async () => {
    if (!sessionId) return;

    try {
      const history = await loadChatHistory(sessionId);
      setChatHistory(history);
      // console.log(`📜 Loaded ${history.length} chat messages from InteractionLog`);
    } catch (err) {
      console.error('❌ Error refreshing chat history:', err);
    }
  }, [sessionId]);

  // Auto-refresh chat history when agent messages update, or when a manual log entry is created.
  useEffect(() => {
    // This effect is specifically for reflecting agent messages in the UI.
    // Manual log entries (main/followup Q&A) trigger refreshChatHistory directly from handleAnswer.
    if (isWaitingForAgent) { // Only refresh chat when agent messages are actively being received.
      refreshChatHistory();
    }
  }, [agentMessages.length, isWaitingForAgent, refreshChatHistory]);


  // ============================================================================
  // INITIALIZATION
  // ============================================================================

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

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [sessionId, navigate]);

  // Enhanced autofocus - handles both deterministic and agent modes
  useEffect(() => {
    if (!isCommitting) {
      requestAnimationFrame(() => {
        // Agent mode - always focus text input
        if (isWaitingForAgent && inputRef.current) {
          inputRef.current.focus({ preventScroll: false });
        }
        // Deterministic mode - prefer Y/N buttons if present
        else if (currentItem && !isWaitingForAgent) {
          if (yesButtonRef.current) {
            yesButtonRef.current.focus({ preventScroll: false });
          } else if (inputRef.current) {
            inputRef.current.focus({ preventScroll: false });
          }
        }
      });
    }
  }, [currentItem, isCommitting, isWaitingForAgent]);

  // ENHANCED: Scroll when chat history updates
  useEffect(() => {
    if (chatHistory.length > 0) {
      setTimeout(autoScrollToBottom, 150);
    }
  }, [chatHistory.length, autoScrollToBottom]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (yesButtonRef.current && noButtonRef.current) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          if (document.activeElement === yesButtonRef.current) {
            noButtonRef.current.focus();
          } else if (document.activeElement === noButtonRef.current) {
            yesButtonRef.current.focus();
          } else {
            yesButtonRef.current.focus();
          }
        }

        if (e.key === ' ' && (document.activeElement === yesButtonRef.current || document.activeElement === noButtonRef.current)) {
          e.preventDefault();
          document.activeElement.click();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentItem]);

  const initializeInterview = async () => {
    try {
      console.log('🚀 [PRODUCTION] Initializing HYBRID interview flow (v2.5)...');
      console.log('   - Session ID from URL:', sessionId);
      const startTime = performance.now();

      // Step 1: Load session with validation
      console.log('📡 [PRODUCTION] Fetching session from database...');
      const loadedSession = await base44.entities.InterviewSession.get(sessionId);

      console.log('📥 [PRODUCTION] Session fetch response:', loadedSession);
      console.log('   - Type:', typeof loadedSession);
      console.log('   - Is null:', loadedSession === null);
      console.log('   - Is undefined:', loadedSession === undefined);
      console.log('   - Has id:', !!loadedSession?.id);

      // PRODUCTION FIX: Handle null/undefined session
      if (!loadedSession) {
        console.error('❌ [PRODUCTION] Session not found in database');
        throw new Error(`Session not found: ${sessionId}. It may have been deleted or never created.`);
      }

      if (!loadedSession.id) {
        console.error('❌ [PRODUCTION] Session object missing ID field:', loadedSession);
        throw new Error('Invalid session object returned from database');
      }

      console.log('✅ [PRODUCTION] Session loaded successfully');
      console.log('   - Session ID:', loadedSession.id);
      console.log('   - Session Code:', loadedSession.session_code);
      console.log('   - Status:', loadedSession.status);

      // Check if session was paused
      if (loadedSession.status === 'paused') {
        setWasPaused(true);
        setShowResumeBanner(true);
        await base44.entities.InterviewSession.update(sessionId, {
          status: 'active', // Changed to 'active'
          last_activity_at: new Date().toISOString()
        });
        loadedSession.status = 'active';
      } else if (loadedSession.status === 'completed') {
        console.log('ℹ️ Session marked completed - will verify after loading data...');
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
      console.log('⚙️ [PRODUCTION] Bootstrapping engine...');
      const engineData = await bootstrapEngine(base44);
      console.log('✅ [PRODUCTION] Engine bootstrapped');
      setEngine(engineData);

      // Step 3: Load chat history from InteractionLog
      await refreshChatHistory();


      // Step 4: Initialize or restore AI conversation
      if (!loadedSession.conversation_id) {
        console.log('🤖 [PRODUCTION] Creating new AI conversation...');

        try {
          const newConversation = await base44.agents.createConversation({
            agent_name: 'clearquest_interviewer',
            metadata: {
              session_id: sessionId,
              department_code: loadedSession.department_code,
              file_number: loadedSession.file_number,
              debug_mode: loadedSession.metadata?.debug_mode || false
            }
          });

          console.log('✅ [PRODUCTION] Conversation created:', newConversation?.id);

          // ROBUSTNESS: Check if conversation was created successfully
          if (!newConversation || !newConversation.id) {
            console.error('❌ [PRODUCTION] Conversation creation returned invalid object:', newConversation);
            console.warn('⚠️ [PRODUCTION] AI conversation unavailable - continuing without AI probing');

            // Set conversation to null and continue - interview will work without AI
            setConversation(null);
            loadedSession.conversation_id = null;
          } else {
            await base44.entities.InterviewSession.update(sessionId, {
              conversation_id: newConversation.id
            });

            setConversation(newConversation);
            loadedSession.conversation_id = newConversation.id;
          }
        } catch (convError) {
          console.error('❌ [PRODUCTION] Error creating AI conversation:', convError);
          console.error('   Error message:', convError?.message || 'Unknown');
          console.warn('⚠️ [PRODUCTION] Continuing without AI probing - deterministic questions will still work');

          // Set conversation to null and continue
          setConversation(null);
          loadedSession.conversation_id = null;
        }
      } else {
        console.log('🤖 [PRODUCTION] Loading existing AI conversation:', loadedSession.conversation_id);

        try {
          const existingConversation = await base44.agents.getConversation(loadedSession.conversation_id);

          if (!existingConversation || !existingConversation.id) {
            console.warn('⚠️ [PRODUCTION] Existing conversation not found or invalid - continuing without AI');
            setConversation(null);
          } else {
            setConversation(existingConversation);

            // Load agent messages if any
            if (existingConversation.messages) {
              setAgentMessages(existingConversation.messages);
            }
          }
        } catch (convError) {
          console.error('❌ [PRODUCTION] Error loading existing conversation:', convError);
          console.warn('⚠️ [PRODUCTION] Continuing without AI probing');
          setConversation(null);
        }
      }

      // Step 5: Subscribe to agent conversation updates (only if conversation exists)
      if (loadedSession.conversation_id) {
        console.log('📡 [PRODUCTION] Subscribing to conversation updates...');

        try {
          unsubscribeRef.current = base44.agents.subscribeToConversation(
            loadedSession.conversation_id,
            (data) => {
              // console.log('📨 Agent message update received');
              setAgentMessages(data.messages || []);
            }
          );
        } catch (subError) {
          console.warn('⚠️ [PRODUCTION] Could not subscribe to conversation:', subError);
        }
      }

      // Step 6: Restore state from snapshots or rebuild from responses
      const hasValidSnapshots = loadedSession.transcript_snapshot &&
                                 loadedSession.transcript_snapshot.length > 0;

      const needsRebuild = loadedSession.status === 'active' &&
                           (!loadedSession.current_item_snapshot || !hasValidSnapshots);

      if (needsRebuild) {
        console.log('🔧 [PRODUCTION] Session needs rebuild - rebuilding from Response entities...');
        await rebuildSessionFromResponses(engineData, loadedSession);
      } else if (hasValidSnapshots) {
        console.log('🔄 [PRODUCTION] Restoring from session snapshots...');
        restoreFromSnapshots(engineData, loadedSession);
      } else {
        console.log('🎯 [PRODUCTION] Starting fresh interview');
        const firstQuestionId = engineData.ActiveOrdered[0];
        setQueue([]);
        setCurrentItem({ id: firstQuestionId, type: 'question' });

        // Log the first question to InteractionLog
        const firstQuestion = engineData.QById[firstQuestionId];
        if (firstQuestion) {
          await logMainQuestion(sessionId, firstQuestionId, firstQuestion.question_text, firstQuestion.category);
          await refreshChatHistory();
        }
      }

      setIsLoading(false);
      const elapsed = performance.now() - startTime;
      console.log(`✅ [PRODUCTION] Hybrid interview ready in ${elapsed.toFixed(2)}ms`);

    } catch (err) {
      console.error('❌ [PRODUCTION] Initialization failed:', err);
      console.error('   - Error type:', err?.constructor?.name || 'Unknown');
      console.error('   - Error message:', err?.message || 'No message');
      console.error('   - Stack:', err?.stack);

      const errorMessage = err?.message || err?.toString() || 'Unknown error occurred';
      setError(`Failed to load interview: ${errorMessage}`);
      setIsLoading(false);
    }
  };

  // ============================================================================
  // RESTORE FUNCTIONS
  // ============================================================================

  const restoreFromSnapshots = (engineData, loadedSession) => {
    console.log('📸 Restoring from snapshots...');

    const restoredTranscript = loadedSession.transcript_snapshot || [];
    setTranscript(restoredTranscript);

    const restoredQueue = loadedSession.queue_snapshot || [];
    setQueue(restoredQueue);

    const restoredCurrentItem = loadedSession.current_item_snapshot || null;
    setCurrentItem(restoredCurrentItem);

    console.log(`✅ Restored ${restoredTranscript.length} transcript entries`);
    console.log(`✅ Restored queue with ${restoredQueue.length} pending items`);
    console.log(`✅ Current item:`, restoredCurrentItem);

    if (!restoredCurrentItem && restoredQueue.length > 0) {
      console.warn('⚠️ No current item but queue exists - self-healing...');
      const nextItem = restoredQueue[0];
      setCurrentItem(nextItem);
      setQueue(restoredQueue.slice(1));
    }

    // FIXED: Only show completion if status is actually 'completed'
    if (!restoredCurrentItem && restoredQueue.length === 0 && restoredTranscript.length > 0) {
      if (loadedSession.status === 'completed') {
        console.log('✅ Interview marked as completed - showing completion modal.');
        setShowCompletionModal(true);
      } else {
        console.warn('⚠️ No current item or queue, but status is not completed. This should have been caught by rebuild logic.');
      }
    }

    setTimeout(() => autoScrollToBottom(), 100);
  };

  // ENHANCED: Rebuild session queue from Response entities
  const rebuildSessionFromResponses = async (engineData, loadedSession) => {
    console.log('🔧 Rebuilding session queue from Response entities...');

    try {
      const responses = await base44.entities.Response.filter({
        session_id: sessionId
      });

      const sortedResponses = responses.sort((a, b) =>
        new Date(a.response_timestamp) - new Date(b.response_timestamp)
      );

      // Build transcript from responses
      const restoredTranscript = [];

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
        }
      }

      setTranscript(restoredTranscript);
      displayOrderRef.current = restoredTranscript.length;

      console.log(`✅ Rebuilt transcript with ${restoredTranscript.length} answered questions`);

      // Find next unanswered question
      let nextQuestionId = null;

      if (sortedResponses.length > 0) {
        // Get last answered question and compute what should come next
        const lastResponse = sortedResponses[sortedResponses.length - 1];
        const lastQuestionId = lastResponse.question_id;
        const lastAnswer = lastResponse.answer;

        // Use engine logic to determine next question
        nextQuestionId = computeNextQuestionId(engineData, lastQuestionId, lastAnswer);
      } else {
        // No responses yet - start from first question
        nextQuestionId = engineData.ActiveOrdered[0];
      }

      // CRITICAL FIX: If nextQuestionId is null OR question doesn't exist, mark complete
      if (!nextQuestionId || !engineData.QById[nextQuestionId]) {
        console.log('✅ No next question found (end of interview) - marking as completed');

        setCurrentItem(null);
        setQueue([]);

        await base44.entities.InterviewSession.update(sessionId, {
          transcript_snapshot: restoredTranscript,
          queue_snapshot: [],
          current_item_snapshot: null,
          total_questions_answered: restoredTranscript.filter(t => t.type === 'question').length,
          completion_percentage: 100,
          status: 'completed',
          completed_date: new Date().toISOString()
        });

        setShowCompletionModal(true);
      } else {
        console.log(`✅ Next unanswered question: ${nextQuestionId}`);

        const nextItem = { id: nextQuestionId, type: 'question' };
        setCurrentItem(nextItem);
        setQueue([]);

        // Log the current question to the interaction log for display
        const nextQuestion = engineData.QById[nextQuestionId];
        if (nextQuestion) {
          await logMainQuestion(sessionId, nextQuestionId, nextQuestion.question_text, nextQuestion.category);
          await refreshChatHistory(); // Refresh to display this new question
        }

        // Persist rebuilt state to database
        await base44.entities.InterviewSession.update(sessionId, {
          transcript_snapshot: restoredTranscript,
          queue_snapshot: [],
          current_item_snapshot: nextItem,
          total_questions_answered: restoredTranscript.filter(t => t.type === 'question').length,
          completion_percentage: Math.round((restoredTranscript.filter(t => t.type === 'question').length / engineData.TotalQuestions) * 100),
          status: 'active' // Ensure status is active
        });

        console.log('✅ Session rebuilt and persisted successfully');
      }

    } catch (err) {
      console.error('❌ Error rebuilding session:', err);
      throw err;
    }
  };

  // DEPRECATED: Old restoreFromResponses - replaced by rebuildSessionFromResponses
  // Keeping for reference but not used anymore
  const restoreFromResponses = async (engineData, responses) => {
    console.log('🔄 Rebuilding state from Response entities (legacy fallback)...');

    const sortedResponses = responses.sort((a, b) =>
      new Date(a.response_timestamp) - new Date(b.response_timestamp)
    );

    const restoredTranscript = [];
    let lastQuestionId = null;
    let lastAnswer = null;

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
        const firstQuestionId = engineData.ActiveOrdered[0];
        setQueue([]);
        setCurrentItem({ id: firstQuestionId, type: 'question' });
    }

    console.log(`✅ Restored ${restoredTranscript.length} answered questions from Response entities`);
  };

  // ============================================================================
  // PERSIST STATE TO DATABASE
  // ============================================================================

  const persistStateToDatabase = async (newTranscript, newQueue, newCurrentItem) => {
    try {
      // console.log('💾 Persisting state to database...');

      await base44.entities.InterviewSession.update(sessionId, {
        transcript_snapshot: newTranscript,
        queue_snapshot: newQueue,
        current_item_snapshot: newCurrentItem,
        total_questions_answered: newTranscript.filter(t => t.type === 'question').length,
        completion_percentage: Math.round((newTranscript.filter(t => t.type === 'question').length / engine.TotalQuestions) * 100),
        data_version: 'v2.5-hybrid',
        status: 'active' // Ensure status is active when saving state
      });

      // console.log('✅ State persisted successfully');
    } catch (err) {
      console.error('❌ Failed to persist state:', err);
    }
  };

  // ============================================================================
  // NEW: AI AGENT HANDOFF AFTER FOLLOW-UP PACK COMPLETION - WITH LOGGING
  // ============================================================================

  const handoffToAgentForProbing = async (questionId, packId, substanceName, followUpAnswers) => {
    console.log(`🤖 Follow-up pack ${packId} completed for ${questionId} — handing off to agent for probing...`);

    if (!conversation) {
      console.warn('⚠️ No AI conversation available - skipping probing, moving to next question');

      // Move to next question without AI
      const nextQuestionId = computeNextQuestionId(engine, questionId, 'Yes');
      if (nextQuestionId && engine.QById[nextQuestionId]) {
        setQueue([]);
        setCurrentItem({ id: nextQuestionId, type: 'question' });
        const nextQuestion = engine.QById[nextQuestionId];
        await logMainQuestion(sessionId, nextQuestionId, nextQuestion.question_text, nextQuestion.category);
        await refreshChatHistory(); // Refresh to display new main question
      } else {
        setShowCompletionModal(true);
      }
      return false;
    }

    // Generate unique AI probe pack ID for this probing sequence
    const aiProbePackId = generateAIProbePackId(questionId, packId);
    setCurrentAIProbePackId(aiProbePackId);
    setAIProbeCount(0); // Reset counter for new probing session

    // Build summary message for the agent
    const question = engine.QById[questionId];
    const packSteps = injectSubstanceIntoPackSteps(engine, packId, substanceName);

    let summaryLines = [
      `Follow-up pack completed.`,
      ``,
      `Question ID: ${questionId}`,
      `Question: ${question.question_text}`,
      `Base Answer: Yes`,
      `Follow-up Pack: ${packId}`,
      ``,
      `Deterministic Follow-Up Answers:`
    ];

    // Add each follow-up answer
    followUpAnswers.forEach((answer) => {
      // Find the original step prompt by Field_Key if possible, otherwise use questionText
      const step = packSteps.find(s => s.Field_Key === answer.questionId);
      summaryLines.push(`- ${step ? step.Prompt : answer.questionText}: ${answer.answer}`);
    });

    summaryLines.push(``);
    summaryLines.push(`CRITICAL INSTRUCTIONS:`);
    summaryLines.push(`1. Ask up to 5 probing questions to ensure the candidate's story is complete.`);
    summaryLines.push(`2. After 5 questions OR when you are satisfied that the story is complete, ask: "Before we move on, is there anything else investigators should know about this situation?"`);
    summaryLines.push(`3. Immediately after that, send the next base question. You MUST format the next base question as follows: "${computeNextQuestionId(engine, questionId, 'Yes')}: [question text]" without any other text around it.`);
    summaryLines.push(`4. Do NOT attempt to ask more than 5 probing questions.`);

    const summaryMessage = summaryLines.join('\n');

    console.log('📤 Sending follow-up summary to agent:', summaryMessage);

    try {
      await base44.agents.addMessage(conversation, {
        role: 'user',
        content: summaryMessage
      });

      setIsWaitingForAgent(true);
      setCurrentFollowUpPack({ questionId, packId, substanceName, aiProbePackId, category: question.category });

      return true;
    } catch (err) {
      console.error('❌ Error sending to agent:', err);
      toast.error('Failed to connect to AI agent');
      return false;
    }
  };

  // ============================================================================
  // NEW: DETECT WHEN AGENT SENDS NEXT BASE QUESTION + SAVE PROBING TO DATABASE
  // This useEffect processes the raw agentMessages and logs them to InteractionLog.
  // It also detects the end of probing and transitions back to deterministic mode.
  // ============================================================================

  useEffect(() => {
    if (!isWaitingForAgent || !agentMessages.length || !currentFollowUpPack) return;

    const processAgentMessages = async () => {
      const { aiProbePackId, questionId, packId, category } = currentFollowUpPack;

      // Find the starting point of the current probing session messages
      const probingStartIdx = agentMessages.findIndex(m =>
        m.role === 'user' &&
        typeof m.content === 'string' &&
        m.content.includes('Follow-up pack completed') &&
        m.content.includes(`Question ID: ${questionId}`) &&
        m.content.includes(`Follow-up Pack: ${packId}`)
      );

      if (probingStartIdx === -1) {
        // If the handoff message isn't found, we're likely still waiting for the initial AI response
        return;
      }

      // Filter messages relevant to the current probing session
      const relevantMessages = agentMessages.slice(probingStartIdx + 1);

      let lastLoggedAgentMessageIdx = -1; // Track last agent message that was logged as an AI question
      let currentProbes = 0; // Count probes in this cycle

      // Iterate through relevant messages to log Q&A and detect end of probing
      for (let i = 0; i < relevantMessages.length; i++) {
        const msg = relevantMessages[i];
        const nextMsg = relevantMessages[i + 1];

        // Case 1: AI sends a probing question (assistant role, not a system message or next base question signal)
        if (msg.role === 'assistant' &&
            typeof msg.content === 'string' &&
            !msg.content.includes('Follow-up pack completed') && // Exclude system message for handoff
            !msg.content.match(/^Q\d{1,3}:/i)) { // Exclude the next base question signal

          // If this agent message hasn't been logged yet as an AI question
          if (lastLoggedAgentMessageIdx < i) {
            currentProbes++; // Increment probe count
            if (currentProbes <= 5) { // Only log if within the limit
              await logAIQuestion(sessionId, questionId, packId, aiProbePackId, msg.content, category);
              setAIProbeCount(prev => prev + 1); // Update local state for prompt display
            }
            lastLoggedAgentMessageIdx = i;

            // If the next message is a user response, log it
            if (nextMsg && nextMsg.role === 'user' && typeof nextMsg.content === 'string') {
              if (currentProbes <= 5) { // Only log if within the limit
                await logAIAnswer(sessionId, questionId, packId, aiProbePackId, nextMsg.content, category);
              }
              i++; // Skip the next message since it's the answer to this question
            }
          }
        }
        // Case 2: AI sends the signal for the next base question (ends probing)
        else if (msg.role === 'assistant' && typeof msg.content === 'string' && msg.content.match(/^Q\d{1,3}:/i)) {
          const nextQuestionMatch = msg.content.match(/^(Q\d{1,3}):\s*(.*)/i);
          if (nextQuestionMatch) {
            const nextQuestionId = nextQuestionMatch[1].toUpperCase();
            const nextQuestionText = nextQuestionMatch[2].trim();

            console.log(`✅ Agent sent next base question: ${nextQuestionId}`);

            // CRITICAL FIX: Verify question exists before setting it
            if (!engine.QById[nextQuestionId]) {
              console.error(`❌ Agent sent invalid question ID: ${nextQuestionId} - marking interview complete`);
              setIsWaitingForAgent(false);
              setCurrentFollowUpPack(null);
              setCurrentAIProbePackId(null);
              setAIProbeCount(0);
              setCurrentItem(null);
              setQueue([]);
              await persistStateToDatabase(transcript, [], null); // Persist state before showing completion
              setShowCompletionModal(true);
              return; // Exit processAgentMessages
            }

            // Log the next base question
            await logMainQuestion(sessionId, nextQuestionId, nextQuestionText, engine.QById[nextQuestionId].category);

            // Clear waiting state and continue with deterministic engine
            setIsWaitingForAgent(false);
            setCurrentFollowUpPack(null);
            setCurrentAIProbePackId(null);
            setAIProbeCount(0);

            // Set next question as current item
            setCurrentItem({ id: nextQuestionId, type: 'question' });
            setQueue([]);

            // Persist state
            await persistStateToDatabase(transcript, [], { id: nextQuestionId, type: 'question' });
            await refreshChatHistory(); // Ensure all logs are visible

            return; // Exit processAgentMessages
          }
        }
      }
    };

    processAgentMessages();
  }, [agentMessages, isWaitingForAgent, currentFollowUpPack, sessionId, engine, transcript, refreshChatHistory]);

  // ============================================================================
  // DEPRECATED: SAVE PROBING EXCHANGES TO DATABASE (now handled by InteractionLog)
  // This function is no longer needed as probing is logged real-time via InteractionLog.
  // Keeping it commented for reference or in case a structured record in Response is still desired.
  // ============================================================================

  // const saveProbingToDatabase = async (questionId, packId, messages) => {
  //   try {
  //     console.log(`💾 Saving AI probing exchanges for ${questionId}/${packId} to database...`);

  //     const exchanges = [];
  //     let startIndex = -1;
  //     let endIndex = -1;

  //     for (let i = 0; i < messages.length; i++) {
  //       const msg = messages[i];

  //       if (msg.role === 'user' &&
  //           typeof msg.content === 'string' &&
  //           msg.content.includes('Follow-up pack completed') &&
  //           msg.content.includes(`Question ID: ${questionId}`) &&
  //           msg.content.includes(`Follow-up Pack: ${packId}`)) {
  //         startIndex = i + 1;
  //       }

  //       if (startIndex !== -1 && msg.role === 'assistant' && typeof msg.content === 'string' && msg.content.match(/\bQ\d{1,3}\b/i)) {
  //         endIndex = i;
  //         break;
  //       }
  //     }

  //     if (startIndex !== -1) {
  //       const probingMessages = endIndex !== -1
  //         ? messages.slice(startIndex, endIndex)
  //         : messages.slice(startIndex);

  //       let sequenceNumber = 1;

  //       for (let i = 0; i < probingMessages.length; i++) {
  //         const currentMsg = probingMessages[i];
  //         const nextMsg = probingMessages[i + 1];

  //         if (currentMsg.role === 'assistant' &&
  //             typeof currentMsg.content === 'string' &&
  //             !currentMsg.content.includes('Follow-up pack completed') &&
  //             !currentMsg.content.match(/\bQ\d{1,3}\b/i) &&
  //             nextMsg?.role === 'user' &&
  //             typeof nextMsg.content === 'string' &&
  //             !nextMsg.content.includes('Follow-up pack completed')) {

  //           const cleanQuestion = currentMsg.content
  //             .replace(/\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}]/g, '')
  //             .trim();

  //           if (cleanQuestion && nextMsg.content && cleanQuestion.length > 5) {
  //             exchanges.push({
  //               sequence_number: sequenceNumber++,
  //               probing_question: cleanQuestion,
  //               candidate_response: nextMsg.content,
  //               timestamp: new Date().toISOString()
  //             });
  //           }

  //           i++;
  //         }
  //       }
  //     }

  //     console.log(`📊 Extracted ${exchanges.length} probing exchanges to save`);

  //     if (exchanges.length > 0) {
  //       const responses = await base44.entities.Response.filter({
  //         session_id: sessionId,
  //         question_id: questionId,
  //         followup_pack: packId
  //       });

  //       if (responses.length > 0) {
  //         const responseRecord = responses[0];

  //         await base44.entities.Response.update(responseRecord.id, {
  //           investigator_probing: exchanges
  //         });

  //         console.log(`✅ Saved ${exchanges.length} probing exchanges to Response ${responseRecord.id}`);
  //       } else {
  //         console.error(`❌ No Response record found for ${questionId}/${packId}`);
  //       }
  //     }

  //   } catch (err) {
  //     console.error('❌ Error saving probing to database:', err);
  //   }
  // };

  // ============================================================================
  // ANSWER SUBMISSION - HYBRID LOGIC WITH CONDITIONAL FOLLOW-UPS & LOGGING
  // ============================================================================

  const handleAnswer = useCallback(async (value) => {
    if (isCommitting || !currentItem || !engine) {
      console.warn('⚠️ Already committing or no current item');
      return;
    }

    setIsCommitting(true);
    setValidationHint(null);

    // Update activity time
    lastActivityRef.current = Date.now();
    await updateActiveTime();

    try {
      // console.log(`📝 Processing answer for ${currentItem.type}:`, value);

      if (currentItem.type === 'question') {
        // PRIMARY QUESTION
        const question = engine.QById[currentItem.id];
        if (!question) {
          throw new Error(`Question ${currentItem.id} not found`);
        }

        // Log candidate's answer to InteractionLog
        await logMainAnswer(sessionId, currentItem.id, value, question.category);
        await refreshChatHistory(); // Refresh chat after logging candidate's answer

        // Add to in-memory transcript (for engine logic only)
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

        // Update session metrics
        await base44.entities.InterviewSession.update(sessionId, {
          questions_answered_count: (session.questions_answered_count || 0) + 1,
          last_activity_at: new Date().toISOString()
        });
        setSession(prev => ({ ...prev, questions_answered_count: (prev.questions_answered_count || 0) + 1 }));


        // CRITICAL FIX: Handle "Yes" and "No" answers distinctly for follow-up triggering
        if (value === 'Yes') {
          const followUpResult = checkFollowUpTrigger(engine, currentItem.id, value);

          if (followUpResult) {
            const { packId, substanceName } = followUpResult;
            // console.log(`🔔 Follow-up triggered: ${packId}`, substanceName ? `with substance: ${substanceName}` : '');

            // Update session metrics for follow-ups triggered
            await base44.entities.InterviewSession.update(sessionId, {
              followups_count: (session.followups_count || 0) + 1
            });
            setSession(prev => ({ ...prev, followups_count: (prev.followups_count || 0) + 1 }));


            const packSteps = injectSubstanceIntoPackSteps(engine, packId, substanceName);

            if (packSteps && packSteps.length > 0) {
              // Reset follow-up answers tracker for new pack
              setCurrentFollowUpAnswers({});

              // Queue all follow-up steps
              const followupQueue = [];
              for (let i = 0; i < packSteps.length; i++) {
                followupQueue.push({
                  id: `${packId}:${i}`,
                  type: 'followup',
                  packId: packId,
                  stepIndex: i,
                  substanceName: substanceName,
                  totalSteps: packSteps.length
                });
              }

              // Set current to first item, queue to rest
              const firstItem = followupQueue[0];
              const remainingQueue = followupQueue.slice(1);

              setQueue(remainingQueue);
              setCurrentItem(firstItem);

              // Log the first follow-up question to InteractionLog, if not auto-prefilled
              const firstStep = packSteps[0];
              if (firstStep && !(firstStep.PrefilledAnswer && firstStep.Field_Key === 'substance_name')) {
                await logFollowUpQuestion(sessionId, currentItem.id, packId, firstStep.Prompt, question.category, 0);
                await refreshChatHistory(); // Refresh to display this new follow-up question
              }


              await persistStateToDatabase(newTranscript, remainingQueue, firstItem);
            } else {
              // Empty or invalid pack - advance to next question
              console.warn(`⚠️ Follow-up pack ${packId} has no steps or is invalid - advancing to next question`);
              const nextQuestionId = computeNextQuestionId(engine, currentItem.id, value);
              if (nextQuestionId && engine.QById[nextQuestionId]) {
                setQueue([]);
                setCurrentItem({ id: nextQuestionId, type: 'question' });
                // Log the next main question
                const nextQuestion = engine.QById[nextQuestionId];
                await logMainQuestion(sessionId, nextQuestionId, nextQuestion.question_text, nextQuestion.category);
                await refreshChatHistory();
                await persistStateToDatabase(newTranscript, [], { id: nextQuestionId, type: 'question' });
              } else {
                // No next question - interview complete
                console.log('✅ No next question after empty/invalid follow-up pack - marking interview complete');
                setCurrentItem(null);
                setQueue([]);
                await persistStateToDatabase(newTranscript, [], null);
                setShowCompletionModal(true);
              }
            }
          } else {
            // No follow-up triggered - advance to next question
            const nextQuestionId = computeNextQuestionId(engine, currentItem.id, value);
            if (nextQuestionId && engine.QById[nextQuestionId]) {
              setQueue([]);
              setCurrentItem({ id: nextQuestionId, type: 'question' });
              // Log the next main question
              const nextQuestion = engine.QById[nextQuestionId];
              await logMainQuestion(sessionId, nextQuestionId, nextQuestion.question_text, nextQuestion.category);
              await refreshChatHistory();
              await persistStateToDatabase(newTranscript, [], { id: nextQuestionId, type: 'question' });
            } else {
              // No next question - interview complete
              console.log('✅ No next question after "Yes" answer with no follow-up - marking interview complete');
              setCurrentItem(null);
              setQueue([]);
              await persistStateToDatabase(newTranscript, [], null);
              setShowCompletionModal(true);
            }
          }
        } else {
          // CRITICAL FIX: "No" answer - ALWAYS advance to next question, NEVER trigger follow-ups
          // console.log(`➡️ Answer is "No" - skipping any follow-ups and advancing to next question`);
          const nextQuestionId = computeNextQuestionId(engine, currentItem.id, value);

          // CRITICAL: Enhanced logging and validation
          // console.log(`🔍 Computing next question after ${currentItem.id}:`);
          // console.log(`   - Returned nextQuestionId: ${nextQuestionId}`);
          // console.log(`   - Question exists in engine: ${nextQuestionId ? !!engine.QById[nextQuestionId] : 'N/A'}`);
          // console.log(`   - Total questions answered: ${newTranscript.filter(t => t.type === 'question').length}`);
          // console.log(`   - Total questions in bank: ${engine.TotalQuestions}`);

          // CRITICAL: Only mark complete if we've TRULY answered ALL questions
          const answeredCount = newTranscript.filter(t => t.type === 'question').length;
          const hasAnsweredAll = answeredCount >= engine.TotalQuestions;

          if (nextQuestionId && engine.QById[nextQuestionId]) {
            // console.log(`✅ Advancing to next question: ${nextQuestionId}`);
            setQueue([]);
            setCurrentItem({ id: nextQuestionId, type: 'question' });
            // Log the next main question
            const nextQuestion = engine.QById[nextQuestionId];
            await logMainQuestion(sessionId, nextQuestionId, nextQuestion.question_text, nextQuestion.category);
            await refreshChatHistory();
            await persistStateToDatabase(newTranscript, [], { id: nextQuestionId, type: 'question' });
          } else if (hasAnsweredAll) {
            // Only mark complete if we've answered ALL questions
            // console.log(`✅ Answered all ${answeredCount}/${engine.TotalQuestions} questions - marking interview complete`);
            setCurrentItem(null);
            setQueue([]);
            await persistStateToDatabase(newTranscript, [], null);
            setShowCompletionModal(true);
          } else {
            // CRITICAL ERROR: No next question but haven't answered all questions
            console.error(`❌ CRITICAL ERROR: No next question found for ${currentItem.id}, but only answered ${answeredCount}/${engine.TotalQuestions} questions`);
            console.error(`   This indicates a data integrity issue - missing next_question_id or broken question chain`);

            // EMERGENCY FALLBACK: Try to find the next unanswered question manually
            const answeredIds = new Set(newTranscript.filter(t => t.type === 'question').map(t => t.questionId));
            const nextUnanswered = engine.ActiveOrdered.find(qid => !answeredIds.has(qid));

            if (nextUnanswered) {
              // console.log(`🔧 EMERGENCY RECOVERY: Found unanswered question ${nextUnanswered} - continuing interview`);
              setQueue([]);
              setCurrentItem({ id: nextUnanswered, type: 'question' });
              // Log the next main question
              const nextQuestion = engine.QById[nextUnanswered];
              await logMainQuestion(sessionId, nextUnanswered, nextQuestion.question_text, nextQuestion.category);
              await refreshChatHistory();
              await persistStateToDatabase(newTranscript, [], { id: nextUnanswered, type: 'question' });
            } else {
              // Truly no more questions - mark complete
              // console.log(`✅ Emergency scan found no more unanswered questions - marking complete`);
              setCurrentItem(null);
              setQueue([]);
              await persistStateToDatabase(newTranscript, [], null);
              setShowCompletionModal(true);
            }
          }
        }

        await saveAnswerToDatabase(currentItem.id, value, question);

      } else if (currentItem.type === 'followup') {
        // FOLLOW-UP QUESTION
        const { packId, stepIndex, substanceName, totalSteps } = currentItem;

        const packSteps = injectSubstanceIntoPackSteps(engine, packId, substanceName);

        if (!packSteps || !packSteps[stepIndex]) {
          throw new Error(`Follow-up pack ${packId} step ${stepIndex} not found`);
        }
        const step = packSteps[stepIndex];

        // Find the original question that triggered this pack to get its category
        const triggeringQuestion = [...transcript].reverse().find(t =>
          t.type === 'question' &&
          engine.QById[t.questionId]?.followup_pack === packId
        );
        const category = triggeringQuestion?.category || 'Unknown';


        // Auto-fill substance_name field if prefilled
        if (step.PrefilledAnswer && step.Field_Key === 'substance_name') {
          // console.log(`💉 Auto-filling substance_name: ${step.PrefilledAnswer}`);

          // Log the auto-filled question and answer to InteractionLog
          await logFollowUpQuestion(sessionId, triggeringQuestion.questionId, packId, step.Prompt, category, stepIndex);
          await logFollowUpAnswer(sessionId, triggeringQuestion.questionId, packId, step.PrefilledAnswer, category, stepIndex);
          await refreshChatHistory(); // Refresh chat after logging auto-fill


          const transcriptEntry = {
            id: `fu-${Date.now()}`,
            questionId: currentItem.id, // This refers to the followup 'id' which is packId:stepIndex
            questionText: step.Prompt,
            answer: step.PrefilledAnswer,
            packId: packId,
            substanceName: substanceName,
            type: 'followup',
            timestamp: new Date().toISOString()
          };

          const newTranscript = [...transcript, transcriptEntry];
          setTranscript(newTranscript);

          // Update follow-up answers tracker
          const updatedFollowUpAnswers = {
            ...currentFollowUpAnswers,
            [step.Field_Key]: step.PrefilledAnswer
          };
          setCurrentFollowUpAnswers(updatedFollowUpAnswers);

          let updatedQueue = [...queue];
          let nextItem = updatedQueue.shift() || null;

          // NEW: Skip conditional follow-ups based on previous answers
          while (nextItem && nextItem.type === 'followup') {
            const nextPackSteps = injectSubstanceIntoPackSteps(engine, nextItem.packId, nextItem.substanceName);
            const nextStep = nextPackSteps[nextItem.stepIndex];

            if (shouldSkipFollowUpStep(nextStep, updatedFollowUpAnswers)) {
              // console.log(`⏭️ Skipping conditional step: ${nextStep.Field_Key}`);
              // Skip this step and move to next
              nextItem = updatedQueue.shift() || null;
            } else {
              // This step should be asked
              break;
            }
          }

          setQueue(updatedQueue);
          setCurrentItem(nextItem);

          // If there's a next follow-up, log it
          if (nextItem && nextItem.type === 'followup') {
            const nextPackSteps = injectSubstanceIntoPackSteps(engine, nextItem.packId, nextItem.substanceName);
            const nextStep = nextPackSteps[nextItem.stepIndex];
            await logFollowUpQuestion(sessionId, triggeringQuestion.questionId, nextItem.packId, nextStep.Prompt, category, nextItem.stepIndex);
            await refreshChatHistory();
          }

          await persistStateToDatabase(newTranscript, updatedQueue, nextItem);
          await saveFollowUpAnswer(packId, step.Field_Key, step.PrefilledAnswer, substanceName);

          setIsCommitting(false);
          setInput("");

          if (!nextItem) { // If no next item, pack finished, potentially trigger completion
            // No completion modal here, handoff or next question logic will handle it.
            // This is just for auto-fill, not end of pack.
          }

          return; // Exit handleAnswer since auto-fill is processed
        }

        // Validate answer
        const validation = validateFollowUpAnswer(value, step.Expected_Type || 'TEXT', step.Options);

        if (!validation.valid) {
          // console.log(`❌ Validation failed: ${validation.hint}`);
          setValidationHint(validation.hint);
          setIsCommitting(false);

          setTimeout(() => {
            if (inputRef.current) {
              inputRef.current.focus();
            }
          }, 100);
          return;
        }

        // Log candidate's answer to InteractionLog
        await logFollowUpAnswer(sessionId, triggeringQuestion.questionId, packId, validation.normalized || value, category, stepIndex);
        await refreshChatHistory(); // Refresh chat after logging candidate's answer


        // Add to transcript - store answer exactly as entered (no date normalization)
        const transcriptEntry = {
          id: `fu-${Date.now()}`,
          questionId: currentItem.id, // This refers to the followup 'id' which is packId:stepIndex
          questionText: step.Prompt,
          answer: validation.normalized || value, // Plain text, no date conversion
          packId: packId,
          substanceName: substanceName,
          type: 'followup',
          timestamp: new Date().toISOString()
        };

        const newTranscript = [...transcript, transcriptEntry];
        setTranscript(newTranscript);

        // Update follow-up answers tracker
        const updatedFollowUpAnswers = {
          ...currentFollowUpAnswers,
          [step.Field_Key]: validation.normalized || value
        };
        setCurrentFollowUpAnswers(updatedFollowUpAnswers);

        // Save to database - dates stored as plain text
        await saveFollowUpAnswer(packId, step.Field_Key, validation.normalized || value, substanceName);

        // Check if there are more steps in the queue
        let updatedQueue = [...queue];
        let nextItem = updatedQueue.shift() || null;

        // NEW: Skip conditional follow-ups based on previous answers
        while (nextItem && nextItem.type === 'followup') {
          const nextPackSteps = injectSubstanceIntoPackSteps(engine, nextItem.packId, nextItem.substanceName);
          const nextStep = nextPackSteps[nextItem.stepIndex];

          if (shouldSkipFollowUpStep(nextStep, updatedFollowUpAnswers)) {
            // console.log(`⏭️ Skipping conditional step: ${nextStep.Field_Key}`);
            // Skip this step and move to next
            nextItem = updatedQueue.shift() || null;
          } else {
            // This step should be asked
            break;
            }
          }

        // Check if this was the LAST follow-up in the pack (or all remaining were skipped)
        const isLastFollowUp = !nextItem || nextItem.type !== 'followup' || nextItem.packId !== packId;

        if (isLastFollowUp) {
          // console.log(`🎯 Last follow-up in ${packId} completed`);

          // NEW: Check if we should skip probing for PACK_LE_APPS when hired
          if (shouldSkipProbingForHired(packId, updatedFollowUpAnswers)) {
            // console.log(`✅ Skipping AI probing for PACK_LE_APPS (outcome: hired) - moving to next base question`);

            // Find the original question that triggered this pack
            // Use newTranscript here as it's the most up-to-date
            const triggeringQuestionLatest = [...newTranscript].reverse().find(t =>
              t.type === 'question' &&
              engine.QById[t.questionId]?.followup_pack === packId &&
              t.answer === 'Yes'
            );

            if (triggeringQuestionLatest) {
              // Compute next base question
              const nextQuestionId = computeNextQuestionId(engine, triggeringQuestionLatest.questionId, 'Yes');

              // Reset follow-up answers tracker
              setCurrentFollowUpAnswers({});

              if (nextQuestionId && engine.QById[nextQuestionId]) {
                setQueue([]);
                setCurrentItem({ id: nextQuestionId, type: 'question' });
                // Log the next main question
                const nextQuestion = engine.QById[nextQuestionId];
                await logMainQuestion(sessionId, nextQuestionId, nextQuestion.question_text, nextQuestion.category);
                await refreshChatHistory();
                await persistStateToDatabase(newTranscript, [], { id: nextQuestionId, type: 'question' });
              } else {
                console.log('✅ No next base question after skipping AI probing - marking interview complete');
                setCurrentItem(null);
                setQueue([]);
                await persistStateToDatabase(newTranscript, [], null);
                setShowCompletionModal(true);
              }
            } else {
              // If triggering question not found (error case), fallback to showing completion modal.
              console.error(`❌ Could not find triggering question for pack ${packId} when trying to skip probing. Marking interview complete.`);
              setCurrentItem(null);
              setQueue([]);
              await persistStateToDatabase(newTranscript, [], null);
              setShowCompletionModal(true);
            }
          } else {
            // Normal flow: hand off to AI for probing
            const packAnswers = newTranscript.filter(t =>
              t.type === 'followup' && t.packId === packId
            );

            // Use newTranscript here as it's the most up-to-date
            const triggeringQuestionLatest = [...newTranscript].reverse().find(t =>
              t.type === 'question' &&
              engine.QById[t.questionId]?.followup_pack === packId &&
              t.answer === 'Yes'
            );

            if (triggeringQuestionLatest) {
              // Reset follow-up answers tracker
              setCurrentFollowUpAnswers({});

              // Clear current item and queue - we're handing off to AI
              setCurrentItem(null);
              setQueue([]);
              await persistStateToDatabase(newTranscript, [], null);

              // Hand off to AI agent
              await handoffToAgentForProbing(
                triggeringQuestionLatest.questionId,
                packId,
                substanceName,
                packAnswers
              );
            } else {
              // If triggering question not found (error case), fallback to showing completion modal.
              console.error(`❌ Could not find triggering question for pack ${packId} when trying to hand off to AI. Marking interview complete.`);
              setCurrentItem(null);
              setQueue([]);
              await persistStateToDatabase(newTranscript, [], null);
              setShowCompletionModal(true);
            }
          }
        } else {
          // More follow-ups remain - continue with deterministic engine
          setQueue(updatedQueue);
          setCurrentItem(nextItem);

          // Log the next follow-up question
          const nextPackSteps = injectSubstanceIntoPackSteps(engine, nextItem.packId, nextItem.substanceName);
          const nextStep = nextPackSteps[nextItem.stepIndex];
          await logFollowUpQuestion(sessionId, triggeringQuestion.questionId, nextItem.packId, nextStep.Prompt, category, nextItem.stepIndex);
          await refreshChatHistory();

          await persistStateToDatabase(newTranscript, updatedQueue, nextItem);
        }
      }

      setIsCommitting(false);
      setInput("");

    } catch (err) {
      console.error('❌ Error processing answer:', err);
      setIsCommitting(false);
      setError(`Error: ${err.message}`);
    }

  }, [currentItem, engine, queue, transcript, sessionId, isCommitting, conversation, currentFollowUpAnswers, handoffToAgentForProbing, session, updateActiveTime, refreshChatHistory]);

  // NEW: Handle agent probing questions
  const handleAgentAnswer = useCallback(async (value) => {
    if (!conversation || isCommitting || !isWaitingForAgent || !currentFollowUpPack) return;

    setIsCommitting(true);
    setInput("");

    // Update activity
    lastActivityRef.current = Date.now();
    await updateActiveTime();

    // Update session metrics for AI probes
    await base44.entities.InterviewSession.update(sessionId, {
      ai_probes_count: (session.ai_probes_count || 0) + 1,
      last_activity_at: new Date().toISOString()
    });
    setSession(prev => ({ ...prev, ai_probes_count: (prev.ai_probes_count || 0) + 1 }));


    try {
      // console.log('📤 Sending answer to AI agent:', value);

      await base44.agents.addMessage(conversation, {
        role: 'user',
        content: value
      });

      // We log the AI answer when we process agentMessages via the useEffect
      // Refresh chat to show the candidate's response
      await refreshChatHistory();

      setIsCommitting(false);
    } catch (err) {
      console.error('❌ Error sending to agent:', err);
      setError('Failed to send message to AI agent');
      setIsCommitting(false);
    }
  }, [conversation, isCommitting, isWaitingForAgent, currentFollowUpPack, sessionId, session, updateActiveTime, refreshChatHistory]);

  const handleTextSubmit = useCallback((e) => {
    e.preventDefault();
    const answer = input.trim();
    if (!answer) return;

    if (isWaitingForAgent) {
      handleAgentAnswer(answer);
    } else {
      handleAnswer(answer);
    }
  }, [input, isWaitingForAgent, handleAnswer, handleAgentAnswer]);

  // ============================================================================
  // DATABASE PERSISTENCE (for structured data)
  // ============================================================================

  const saveAnswerToDatabase = async (questionId, answer, question) => {
    try {
      const existing = await base44.entities.Response.filter({
        session_id: sessionId,
        question_id: questionId
      });

      if (existing.length > 0) {
        // console.log(`ℹ️ Response for ${questionId} already exists, skipping`);
        return;
      }

      // displayOrderRef.current is only incremented for main questions
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
      console.error('❌ Database save error (Response entity):', err);
    }
  };

  const saveFollowUpAnswer = async (packId, fieldKey, answer, substanceName) => {
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

      const triggeringResponse = responses[responses.length - 1]; // Use the last one if multiple exist

      const existingFollowupRecords = await base44.entities.FollowUpResponse.filter({
        session_id: sessionId,
        response_id: triggeringResponse.id,
        followup_pack: packId,
        // If substanceName is present, we might be looking for a specific instance
        ...(substanceName && { substance_name: substanceName })
      });

      if (existingFollowupRecords.length === 0) {
        await base44.entities.FollowUpResponse.create({
          session_id: sessionId,
          response_id: triggeringResponse.id,
          question_id: triggeringResponse.question_id, // Original question ID
          followup_pack: packId,
          instance_number: 1, // This logic needs to be enhanced for multiple instances if needed
          substance_name: substanceName || null,
          incident_description: null, // Keep null or derive from initial detail if any
          completed: false,
          additional_details: { [fieldKey]: answer }
        });
      } else {
        const existing = existingFollowupRecords[0];
        await base44.entities.FollowUpResponse.update(existing.id, {
          substance_name: substanceName || existing.substance_name,
          additional_details: {
            ...(existing.additional_details || {}),
            [fieldKey]: answer
          }
        });
      }

    } catch (err) {
      console.error('❌ Follow-up save error (FollowUpResponse entity):', err);
    }
  };

  // ============================================================================
  // COMPLETION & PAUSE HANDLING
  // ============================================================================

  const handleCompletionConfirm = async () => {
    setIsCompletingInterview(true);

    try {
      await base44.entities.InterviewSession.update(sessionId, {
        status: 'completed',
        completed_date: new Date().toISOString(),
        completion_percentage: 100,
        // Clear snapshots upon completion
        transcript_snapshot: null,
        queue_snapshot: null,
        current_item_snapshot: null,
      });

      console.log('✅ Interview marked as completed');
      navigate(createPageUrl("Home"));

    } catch (err) {
      console.error('❌ Error completing interview:', err);
      setError('Failed to complete interview. Please try again.');
      setIsCompletingInterview(false);
    }
  };

  const handlePauseClick = async () => {
    try {
      // Ensure current state is persisted before pausing
      await persistStateToDatabase(transcript, queue, currentItem);
      await base44.entities.InterviewSession.update(sessionId, {
        status: 'paused',
        last_activity_at: new Date().toISOString()
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
    const canClose = window.close();
    if (!canClose) {
      toast.info('You can now close this tab. Use your Dept Code and File Number to resume later.');
    }
  };

  // ============================================================================
  // RENDER HELPERS - OPTIMIZED FOR SMOOTH CHAT
  // ============================================================================

  // NEW: Generate display number based on position in active questions list
  const getQuestionDisplayNumber = useCallback((questionId) => {
    if (!engine) return '';

    // Check if already mapped
    if (displayNumberMapRef.current[questionId]) {
      return displayNumberMapRef.current[questionId];
    }

    // Find position in ordered list
    const index = engine.ActiveOrdered.indexOf(questionId);
    if (index !== -1) {
      const displayNum = index + 1;
      displayNumberMapRef.current[questionId] = displayNum;
      return displayNum;
    }

    // Fallback - shouldn't happen for valid questions
    return questionId.replace(/^Q0*/, '');
  }, [engine]);

  const getFollowUpPackName = (packId) => {
    return FOLLOWUP_PACK_NAMES[packId] || 'Follow-up Questions';
  };

  const getCurrentPrompt = () => {
    if (isWaitingForAgent) {
      return null; // Agent messages will be rendered separately as part of chatHistory
    }

    if (!currentItem || !engine) return null;

    if (currentItem.type === 'question') {
      const question = engine.QById[currentItem.id];

      // CRITICAL FIX: If question doesn't exist, mark interview complete
      if (!question) {
        console.error(`❌ Question ${currentItem.id} not found in engine - marking interview complete`);
        setCurrentItem(null);
        setQueue([]);
        setShowCompletionModal(true);
        return null;
      }

      return {
        type: 'question',
        id: question.question_id,
        text: question.question_text,
        responseType: question.response_type,
        category: question.category
      };
    }

    if (currentItem.type === 'followup') {
      const { packId, stepIndex, substanceName } = currentItem;

      const packSteps = injectSubstanceIntoPackSteps(engine, packId, substanceName);
      if (!packSteps) return null;

      const step = packSteps[stepIndex];

      // Auto-fill handling needs to trigger handleAnswer then return null to avoid rendering
      // This is now handled within handleAnswer itself. Here we just ensure we don't display it.
      if (step.PrefilledAnswer && step.Field_Key === 'substance_name') {
        // console.log(`⏩ Skipping UI render for auto-filled question: ${step.Field_Key}`);
        // `handleAnswer` is called at the beginning of its block if `step.PrefilledAnswer` is true.
        // Returning null here prevents it from rendering in the prompt box.
        return null;
      }

      return {
        type: 'followup',
        id: currentItem.id,
        text: step.Prompt,
        responseType: step.Response_Type || 'text',
        expectedType: step.Expected_Type || 'TEXT',
        packId: packId,
        substanceName: substanceName,
        stepNumber: stepIndex + 1,
        totalSteps: packSteps.length
      };
    }

    return null;
  };

  const getPlaceholder = () => {
    if (isWaitingForAgent) {
      return "Respond to investigator's question...";
    }

    const currentPrompt = getCurrentPrompt(); // Get current prompt in this function context
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

  // SIMPLIFIED: Get last unanswered agent question (for active question box only)
  const getLastAgentQuestion = useCallback(() => {
    if (!isWaitingForAgent || agentMessages.length === 0) return null;

    // Filter messages that belong to the current AI probing session
    const probingStartIdx = agentMessages.findIndex(m =>
      m.role === 'user' &&
      typeof m.content === 'string' &&
      m.content.includes('Follow-up pack completed') &&
      m.content.includes(`Question ID: ${currentFollowUpPack?.questionId}`) &&
      m.content.includes(`Follow-up Pack: ${currentFollowUpPack?.packId}`)
    );

    if (probingStartIdx === -1) return null; // Probing hasn't officially started yet or no handoff message found

    const currentProbingMessages = agentMessages.slice(probingStartIdx + 1);

    // Find the last assistant message that is NOT a system message or a next question signal
    // and is NOT immediately followed by a user message (i.e., it's the current unanswered question)
    for (let i = currentProbingMessages.length - 1; i >= 0; i--) {
      const msg = currentProbingMessages[i];
      const prevMsg = currentProbingMessages[i - 1]; // To check if it's a response to a previous AI question

      if (msg.role === 'assistant' &&
          typeof msg.content === 'string' &&
          !msg.content.includes('Follow-up pack completed') && // Not the handoff system message
          !msg.content.match(/^Q\d{1,3}:/i)) { // Not the next base question signal

        // If the previous message was NOT a user message (meaning this AI question hasn't been answered yet)
        if (!prevMsg || prevMsg.role !== 'user') {
          return msg.content;
        }
      }
    }

    return null;
  }, [agentMessages, isWaitingForAgent, currentFollowUpPack]);

  // ============================================================================
  // RENDER
  // ============================================================================

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-blue-400 animate-spin mx-auto" />
          <p className="text-slate-300">Loading hybrid interview engine...</p>
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
  const lastAgentQuestion = getLastAgentQuestion();

  // DYNAMIC: Use engine.TotalQuestions (no hardcoded fallback)
  const totalQuestions = engine?.TotalQuestions || 0;
  // `transcript` is used for engine's internal progress tracking. `chatHistory` for display.
  const answeredCount = transcript.filter(t => t.type === 'question').length;
  const progress = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  // CRITICAL FIX: Only show Y/N buttons if:
  // 1. Current item exists
  // 2. Current prompt exists AND is of type 'question'
  // 3. Question response_type is 'yes_no'
  // 4. NOT in agent mode
  const isYesNoQuestion = currentPrompt?.type === 'question' && currentPrompt?.responseType === 'yes_no' && !isWaitingForAgent;
  const isFollowUpMode = currentPrompt?.type === 'followup';
  const requiresClarification = validationHint !== null;

  return (
    <>
      <div className="h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex-shrink-0 bg-slate-800/95 backdrop-blur-sm border-b border-slate-700 px-4 py-3">
          <div className="max-w-5xl mx-auto">
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
              <div className="flex justify-end items-center gap-2 mt-1.5">
                <span className="sr-only">Progress: {answeredCount} of {totalQuestions} questions answered</span>
                <span className="text-xs font-medium text-green-400">{progress}% Complete</span>
                <span className="text-xs text-green-400">•</span>
                <span className="text-xs font-medium text-green-400">{answeredCount} / {totalQuestions}</span>
              </div>
            </div>
          </div>
        </header>

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

              {/* Display chat history from InteractionLog */}
              {chatHistory.map((log) => (
                <ChatMessage
                  key={log.id}
                  log={log}
                  getQuestionDisplayNumber={getQuestionDisplayNumber}
                  getFollowUpPackName={getFollowUpPackName}
                />
              ))}
            </div>
          </div>

          {/* Active Question (Deterministic) or Agent Probing */}
          {lastAgentQuestion && isWaitingForAgent ? (
            <div className="flex-shrink-0 px-4 pb-4">
              <div className="max-w-5xl mx-auto">
                <div
                  className="bg-purple-950/95 border-2 border-purple-500/50 rounded-xl p-6 shadow-2xl"
                  style={{
                    boxShadow: '0 12px 36px rgba(0,0,0,0.55), 0 0 0 3px rgba(200,160,255,0.30) inset'
                  }}
                  role="region"
                  aria-live="polite"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border bg-purple-600/30 border-purple-500/50">
                      <AlertCircle className="w-4 h-4 text-purple-400" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-semibold text-purple-400">Investigator Question</span>
                        <span className="text-xs text-slate-500">•</span>
                        <span className="text-sm text-purple-300">Probing {aiProbeCount + 1} of 5</span>
                      </div>
                      <p className="text-white text-lg font-semibold leading-relaxed">
                        {lastAgentQuestion}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : currentPrompt ? (
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
                              {currentPrompt.substanceName ? `${currentPrompt.substanceName} Use` : getFollowUpPackName(currentPrompt.packId)}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-lg font-bold text-blue-400">
                              Question {getQuestionDisplayNumber(currentPrompt.id)}
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
          ) : null}
        </main>

        {/* Footer */}
        <footer
          className="flex-shrink-0 bg-[#121c33] border-t border-slate-700/50 shadow-[0_-6px_16px_rgba(0,0,0,0.45)] rounded-t-[14px]"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          role="form"
          aria-label="Response area"
        >
          <div className="max-w-5xl mx-auto px-4 py-3 md:py-4">
            {isYesNoQuestion ? (
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
              {isWaitingForAgent
                ? `Probing question ${aiProbeCount} of 5 - answer to continue`
                : "Once you submit an answer, it cannot be changed. Contact your investigator after the interview if corrections are needed."}
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

// Chat message component - renders from InteractionLog
function ChatMessage({ log, getQuestionDisplayNumber, getFollowUpPackName }) {
  // Determine if it's a candidate's message based on log type and sender_type
  const isCandidate = (log.message_type === 'main_answer' || log.message_type === 'followup_answer' || log.message_type === 'ai_answer') && log.sender_type === 'candidate';

  if (log.message_type === 'main_question') {
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
                  Question {getQuestionDisplayNumber(log.question_id)}
                </span>
                <span className="text-xs text-slate-500">•</span>
                <span className="text-sm font-medium text-slate-300">{log.section_id}</span>
              </div>
              <p className="text-white leading-relaxed">{log.content}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (log.message_type === 'main_answer' && isCandidate) {
    return (
      <div className="flex justify-end">
        <div className="bg-blue-600 rounded-xl px-5 py-3 max-w-2xl">
          <p className="text-white font-medium">{log.content}</p>
        </div>
      </div>
    );
  }

  if (log.message_type === 'followup_question') {
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
                  {log.substance_name ? `${log.substance_name}` : getFollowUpPackName(log.followup_id)}
                </span>
              </div>
              <p className="text-white leading-relaxed">{log.content}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (log.message_type === 'followup_answer' && isCandidate) {
    return (
      <div className="flex justify-end">
        <div className="bg-orange-600 rounded-xl px-5 py-3 max-w-2xl">
          <p className="text-white font-medium">{log.content}</p>
        </div>
      </div>
    );
  }

  // AI Interaction Messages
  if (log.message_type === 'ai_question') {
    return (
      <div className="space-y-3">
        <div className="bg-purple-950/30 border border-purple-800/50 rounded-xl p-5 opacity-85">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-purple-600/20 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm font-semibold text-purple-400">Investigator</span>
              </div>
              <p className="text-white leading-relaxed">{log.content}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (log.message_type === 'ai_answer' && isCandidate) {
    return (
      <div className="flex justify-end">
        <div className="bg-purple-600 rounded-xl px-5 py-3 max-w-2xl">
          <p className="text-white font-medium">{log.content}</p>
        </div>
      </div>
    );
  }

  return null;
}
