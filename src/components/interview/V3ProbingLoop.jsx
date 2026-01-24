import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2, Bot, User, CheckCircle2, AlertCircle } from "lucide-react";
import { getCompletionMessage } from "../utils/v3ProbingPrompts";
import { 
  logAIOpening, 
  logAIFollowUp, 
  logCandidateAnswer, 
  logIncidentCreated,
  logIncidentCompleted,
  logProbingStopped 
} from "../utils/v3TranscriptLogger";
import { normalizeV3ProbeQuestion } from "../utils/v3FactStateHelpers";

// GLOBAL V3 LOOP REGISTRY: Prevent duplicate mounts
const __v3LoopRegistry = globalThis.__cqV3LoopRegistry || (globalThis.__cqV3LoopRegistry = new Map());

// V3 DEBUG UI: FALSE by default (never show debug UI to candidates)
const SHOW_V3_DEBUG_UI = false;

/**
 * V3 Probing Loop Component
 * 
 * A conversational micro-interview panel for V3-enabled categories.
 * Calls decisionEngineV3 to drive the probing loop until STOP/RECAP.
 * 
 * MOUNT GUARD: Only one instance per (sessionId, categoryId, instanceNumber) allowed.
 */
export default function V3ProbingLoop({
  sessionId,
  categoryId,
  categoryLabel,
  incidentId: initialIncidentId,
  baseQuestionId,
  questionCode,
  sectionId,
  instanceNumber,
  onComplete,
  onTranscriptUpdate,
  packData, // Pack metadata with author-controlled opener
  openerAnswer, // NEW: Opener narrative from candidate
  isInitialCall,
  onMultiInstancePrompt, // NEW: Callback when multi-instance question is shown
  onMultiInstanceAnswer, // NEW: Callback to handle Yes/No from footer
  traceId: parentTraceId, // NEW: Correlation trace from parent
  onPromptChange, // NEW: Callback to expose active prompt to parent
  onAnswerNeeded, // NEW: Callback when ready for user input
  pendingAnswer, // NEW: Answer from parent to consume
  onAnswerConsumed, // NEW: Callback to clear pending answer after consumption
  onPromptSet, // NEW: Callback when prompt is committed to state
  onIncidentComplete, // NEW: Callback when incident completes with no further prompts
  onRecapReady // NEW: Callback when engine returns RECAP/STOP with completion message
}) {
  const effectiveTraceId = parentTraceId || `${sessionId}-${Date.now()}`;
  console.log('[V3_PROBING_LOOP][INIT]', { traceId: effectiveTraceId, categoryId, instanceNumber });
  
  // FORENSIC: Component instance tracking
  const componentInstanceId = useRef(`V3ProbingLoop-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  
  // MOUNT GUARD: Prevent duplicate instances
  const loopKey = `${sessionId}:${categoryId}:${instanceNumber || 1}`;
  const [isBlocked, setIsBlocked] = useState(false);
  
  useEffect(() => {
    // Check if another instance is already mounted for this key
    if (__v3LoopRegistry.has(loopKey)) {
      console.error('[V3_UI_CONTRACT][ERROR] DUPLICATE_LOOP_MOUNT_BLOCKED', {
        loopKey,
        existing: __v3LoopRegistry.get(loopKey),
        incoming: componentInstanceId.current,
        reason: 'Another V3ProbingLoop instance is already active for this session/category/instance'
      });
      setIsBlocked(true);
      return; // Do not register or proceed
    }
    
    // Register this instance
    __v3LoopRegistry.set(loopKey, componentInstanceId.current);
    console.log('[FORENSIC][MOUNT]', { 
      component: 'V3ProbingLoop', 
      instanceId: componentInstanceId.current, 
      loopKey,
      categoryId, 
      instanceNumber,
      registrySize: __v3LoopRegistry.size
    });
    
    return () => {
      // Only delete if we're still the registered instance
      if (__v3LoopRegistry.get(loopKey) === componentInstanceId.current) {
        __v3LoopRegistry.delete(loopKey);
        console.log('[FORENSIC][UNMOUNT]', { 
          component: 'V3ProbingLoop', 
          instanceId: componentInstanceId.current, 
          loopKey,
          categoryId, 
          instanceNumber,
          registrySize: __v3LoopRegistry.size
        });
      }
    };
  }, []); // Only run on mount/unmount
  // Idempotent incidentId creation using ref (prevents duplicate on remount)
  const incidentIdRef = useRef(null);
  if (!incidentIdRef.current) {
    if (initialIncidentId) {
      incidentIdRef.current = initialIncidentId;
    } else {
      incidentIdRef.current = `v3-incident-${sessionId}-${categoryId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      console.log("[V3_PROBING_LOOP][INIT] Created local incidentId:", incidentIdRef.current);
    }
  }
  const incidentId = incidentIdRef.current;
  const setIncidentId = (newId) => {
    incidentIdRef.current = newId;
  };
  const [probeCount, setProbeCount] = useState(0);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [completionReason, setCompletionReason] = useState(null);
  const [showMultiInstancePrompt, setShowMultiInstancePrompt] = useState(false);
  const [exitRequested, setExitRequested] = useState(false);
  const [exitPayload, setExitPayload] = useState(null);
  const messagesEndRef = useRef(null);
  const hasInitialized = useRef(false);
  
  // UI CONTRACT: Explicit state for what user sees during probing
  const [isDeciding, setIsDeciding] = useState(false);
  const [activePromptText, setActivePromptText] = useState(null);
  const [activePromptId, setActivePromptId] = useState(null);
  
  // DUPLICATE PROMPT GUARD: Track last prompt hash to prevent duplicates
  const lastPromptHashRef = useRef(null);
  
  // INIT-ONCE GUARD: Ensure initialization only runs once per mount
  const initRanRef = useRef(false);
  
  // INITIAL DECIDE GUARD: Ensure first decide cycle runs exactly once
  const initialDecideRanRef = useRef(false);
  
  // IN-FLIGHT GUARD: Prevent concurrent engine calls
  const engineInFlightRef = useRef(false);
  
  // LOOP-KEY GUARD: Prevent re-initialization for same loopKey during active session
  const activeLoopKeysRef = useRef(new Set());
  
  // IDEMPOTENCY GUARD: Track last consumed answer to prevent duplicate processing
  const lastConsumedAnswerRef = useRef(null);
  
  // DECIDE CYCLE DIAGNOSTICS: Track decide sequence number and timeout
  const decideSeqRef = useRef(0);
  const decideTimeoutRef = useRef(null);
  
  // STALE IN-FLIGHT FAILSAFE: Track when in-flight was set to detect stuck states
  const lastInFlightAtRef = useRef(null);

  // RENDER TRUTH: Diagnostic logging for prompt card visibility
  const shouldShowPromptCard = !!activePromptText && !isComplete;
  
  useEffect(() => {
    console.log('[V3_RENDER_TRUTH]', {
      loopKey,
      isBlocked,
      isDeciding,
      isComplete,
      activePromptLen: activePromptText?.length || 0,
      shouldShowPromptCard,
      engineInFlight: engineInFlightRef?.current,
      initRan: initRanRef?.current
    });
  }, [loopKey, isBlocked, isDeciding, isComplete, activePromptText, shouldShowPromptCard]);
  
  // Render logging
  useEffect(() => {
    console.log('[V3_UI_RENDER][LOOP_INSTANCE]', {
      loopKey,
      instanceId: componentInstanceId.current,
      isBlocked,
      activePromptPreview: activePromptText?.substring(0, 60) || null,
      isComplete
    });
  }, [loopKey, isBlocked, activePromptText, isComplete]);
  
  // Initialize V3 probing with opener answer
  useEffect(() => {
    if (isBlocked) {
      console.log('[V3_PROBING_LOOP][INIT_SKIP] Instance blocked - will not initialize');
      return;
    }

    // LOOP-KEY GUARD: Prevent re-initialization for same loopKey during active session
    if (activeLoopKeysRef.current.has(loopKey)) {
      console.log('[V3_PROBING_LOOP][INIT_SKIPPED_ALREADY_ACTIVE]', { loopKey });
      return;
    }

    // INIT-ONCE GUARD: Strictly enforce single initialization
    if (initRanRef.current) {
      console.log('[V3_PROBING_LOOP][INIT_ONCE_GUARD] Already initialized - blocking duplicate init', {
        loopKey,
        initRanRef: initRanRef.current
      });
      return;
    }

    if (hasInitialized.current) {
      console.log('[V3_PROBING_LOOP][INIT_SKIP] Already initialized - preventing duplicate decide() call');
      return;
    }

    // Mark loopKey as active
    activeLoopKeysRef.current.add(loopKey);

    // Mark as initialized BEFORE calling handleSubmit
    initRanRef.current = true;
    hasInitialized.current = true;

    console.log("[V3_PROBING_LOOP][INIT] Starting with opener answer", {
      categoryId,
      incidentId,
      loopKey,
      openerAnswerLength: openerAnswer?.length || 0,
      initRanRef: initRanRef.current,
      isInitialCall: true
    });
    
    // CRITICAL: Trigger initial decide cycle immediately (must run exactly once)
    if (!initialDecideRanRef.current && openerAnswer) {
      initialDecideRanRef.current = true;
      
      console.log('[V3_PROBING_LOOP][DECIDE_START]', { 
        loopKey, 
        reason: 'INIT_DECIDE',
        openerAnswerLength: openerAnswer.length 
      });
      
      // Schedule initial decide cycle on next tick (after mount completes)
      setTimeout(() => {
        handleSubmit(null, openerAnswer, isInitialCall);
      }, 0);
    }

    // Cleanup: remove loopKey on unmount
    return () => {
      activeLoopKeysRef.current.delete(loopKey);
      
      // Cleanup watchdog timeout on unmount
      if (decideTimeoutRef.current) {
        clearTimeout(decideTimeoutRef.current);
        decideTimeoutRef.current = null;
      }
    };
  }, []);

  // V3 PROMPT WATCHDOG: Timer ref for stall detection (declared at top to prevent TDZ)
  const promptWatchdogTimerRef = useRef(null);
  
  // HEADLESS MODE: Consume pending answer from parent
  useEffect(() => {
    if (!pendingAnswer || isComplete) return;

    // TOKENIZED PAYLOAD: Support both string (legacy) and object (new)
    const answerText = typeof pendingAnswer === 'string' ? pendingAnswer : pendingAnswer?.text;
    const submitId = typeof pendingAnswer === 'object' ? pendingAnswer?.submitId : null;

    console.log('[V3_PENDING_ANSWER_SEEN]', {
      hasPending: !!pendingAnswer,
      submitId,
      answerPreview: answerText?.substring(0, 40)
    });

    // IDEMPOTENCY: Generate stable token for this answer (use submitId if present)
    const answerToken = submitId ? `${loopKey}:${submitId}` : `${loopKey}:${probeCount}:${answerText?.substring(0, 50)}`;

    // DEDUPE: Skip if we already consumed this exact answer
    if (lastConsumedAnswerRef.current === answerToken) {
      console.log('[V3_PROBING_LOOP][CONSUME_ANSWER_DEDUPED]', {
        answerToken,
        loopKey,
        probeCount,
        submitId,
        reason: 'Same answer already processed - skipping'
      });
      return;
    }

    // EDIT 2C: Diagnostic log - prove answer consumed by loop
    console.log('[V3_LOOP][ANSWER_CONSUMED]', { 
      loopKey, 
      probeCount, 
      answerLen: answerText?.length || 0, 
      ts: Date.now() 
    });

    console.log('[V3_PROBING_LOOP][CONSUME_ANSWER]', { 
      answerPreview: answerText?.substring(0, 50),
      answerToken,
      loopKey,
      probeCount,
      submitId,
      isComplete 
    });

    // Mark as consumed BEFORE processing (prevents race conditions)
    lastConsumedAnswerRef.current = answerToken;

    console.log('[V3_PROBING_LOOP][DECIDE_START]', {
      loopKey,
      reason: 'ANSWER_SUBMITTED',
      answerPreview: answerText?.substring(0, 50),
      probeCount,
      submitId
    });

    // Process the answer through decision engine
    handleSubmit(null, answerText, false);

    // CRITICAL: Clear parent's pending answer after consumption
    // This MUST happen to prevent stall (parent won't trigger again otherwise)
    if (onAnswerConsumed) {
      console.log('[V3_PROBING_LOOP][ANSWER_CONSUMED_ACK]', {
        answerToken,
        loopKey,
        probeCount,
        submitId
      });

      // Defer clearing to avoid state update during render
      setTimeout(() => {
        onAnswerConsumed({
          loopKey,
          answerToken,
          probeCount,
          submitId
        });
      }, 0);
    }
    
    // EDIT 2B: Watchdog - force failopen if no prompt arrives within 2s
    if (promptWatchdogTimerRef.current) {
      clearTimeout(promptWatchdogTimerRef.current);
    }
    
    promptWatchdogTimerRef.current = setTimeout(() => {
      if (isComplete) return;
      
      const hasPromptNow = !!activePromptText && activePromptText.trim().length > 0;
      if (hasPromptNow) return;
      
      console.error('[V3_LOOP][PROMPT_WATCHDOG_FIRE]', {
        loopKey,
        probeCount,
        reason: 'No prompt arrived 2s after answer consumed',
        ts: Date.now()
      });
      
      setIsDeciding(false);
      setActivePromptText("What additional details can you provide?");
      setActivePromptId(`${loopKey}:watchdog-${Date.now()}`);
      
      if (onPromptChange) {
        onPromptChange({
          promptText: "What additional details can you provide?",
          promptId: `${loopKey}:watchdog`,
          loopKey,
          v3PromptSource: 'WATCHDOG_FAILOPEN'
        });
      }
      
      if (onPromptSet) {
        onPromptSet({ loopKey, promptPreview: "What additional details", promptLen: 43 });
      }
    }, 2000);
    
    return () => {
      if (promptWatchdogTimerRef.current) {
        clearTimeout(promptWatchdogTimerRef.current);
        promptWatchdogTimerRef.current = null;
      }
    };
  }, [pendingAnswer, isComplete, loopKey, probeCount, onAnswerConsumed, activePromptText, onPromptChange, onPromptSet]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // V3 LLM ENABLEMENT SOT - Single source of truth for LLM probe wording
  const computeV3LLMEnablementSOT = () => {
    if (typeof window === 'undefined') {
      return {
        enabled: false,
        reason: 'server_side_render',
        pathname: '',
        href: ''
      };
    }

    // EDIT 1: localStorage override (deterministic control)
    const overrideRaw = (typeof window !== 'undefined' && window.localStorage)
      ? window.localStorage.getItem('cq_v3_llm')
      : null;
    const override = (overrideRaw || '').toLowerCase().trim();

    const pathname = window.location?.pathname || '';
    const href = window.location?.href || '';
    const isEditorPreviewPath = pathname.includes('/editor/preview/');
    const isEditorPreviewHref = href.includes('/editor/preview/');
    const isPreviewSandbox = href.includes('preview-sandbox');
    const isPreviewSandboxDash = href.includes('preview-sandbox--');
    const isBase44AppDomain = href.includes('.base44.app');
    
    // EDIT 2: Extended preview detection
    let enabled = isEditorPreviewPath || isEditorPreviewHref || isPreviewSandbox || isPreviewSandboxDash || isBase44AppDomain;

    // EDIT 1: Apply localStorage override
    if (override === '1' || override === 'true') {
      enabled = true;
      // ONE-TIME LOG (guard prevents spam)
      if (!window.__CQ_V3_LLM_OVERRIDE_LOGGED__) {
        window.__CQ_V3_LLM_OVERRIDE_LOGGED__ = true;
        console.log('[V3_LLM][OVERRIDE]', { value: overrideRaw, enabled: true });
      }
    } else if (override === '0' || override === 'false') {
      enabled = false;
      // ONE-TIME LOG (guard prevents spam)
      if (!window.__CQ_V3_LLM_OVERRIDE_LOGGED__) {
        window.__CQ_V3_LLM_OVERRIDE_LOGGED__ = true;
        console.log('[V3_LLM][OVERRIDE]', { value: overrideRaw, enabled: false });
      }
    }

    let reason = 'not_preview_context';
    if (isEditorPreviewPath || isEditorPreviewHref) {
      reason = 'editor_preview_path_detected';
    } else if (isPreviewSandbox || isPreviewSandboxDash) {
      reason = 'preview_sandbox_detected';
    } else if (isBase44AppDomain) {
      reason = 'base44_app_domain_detected';
    }
    
    if (override === '1' || override === 'true' || override === '0' || override === 'false') {
      reason = `override_${override}`;
    }

    return {
      enabled,
      reason,
      pathname,
      href,
      isPreviewSandbox
    };
  };

  const handleSubmit = async (e, initialAnswer = null, isInitialCall = false) => {
    e?.preventDefault();
    
    // MARKER: Proof-of-invocation (must be first log, before any guards)
    console.log('[V3_SUBMIT][MARKER_TOP]', { loopKey, ts: Date.now() });

    // Use initialAnswer (from parent's pendingAnswer) if provided, otherwise fall back to local input
    const answer = initialAnswer || input.trim();
    
    // SUBMIT ENTRY LOG: Track all handleSubmit invocations
    console.log('[V3_SUBMIT][ENTRY]', {
      loopKey,
      hasAnswer: !!answer,
      answerLen: (answer || '').length,
      isLoading,
      isDeciding,
      isComplete,
      inFlight: !!engineInFlightRef.current
    });
    
    // STALE IN-FLIGHT FAILSAFE: Clear stuck in-flight guard if >20s old
    if (engineInFlightRef.current && lastInFlightAtRef.current) {
      const ageMs = Date.now() - lastInFlightAtRef.current;
      if (ageMs > 20000) {
        console.warn('[V3_SUBMIT][STALE_INFLIGHT_CLEARED]', {
          loopKey,
          ageMs,
          reason: 'In-flight guard stuck for >20s - clearing to allow new decide'
        });
        engineInFlightRef.current = false;
        setIsLoading(false);
        setIsDeciding(false);
      }
    }
    
    if (!answer || isLoading || isComplete) {
      console.log('[V3_SUBMIT][EARLY_RETURN]', { 
        loopKey, 
        reason: !answer ? 'NO_ANSWER' : isLoading ? 'ALREADY_LOADING' : 'COMPLETE' 
      });
      return;
    }

    // PART 3: Ensure stable promptId exists BEFORE any callbacks (prevents NO_SNAPSHOT)
    const probeIndex = messages.filter(m => m.role === 'ai').length;
    // TDZ FIX: Use component-scope loopKey (line 63) - do NOT redeclare
    const stablePromptId = `${loopKey}:${probeIndex}`;

    console.log('[V3_PROBE][PROMPTID_ENSURED]', {
      stablePromptId,
      loopKey,
      probeIndex,
      reason: 'Pre-engine-call generation'
    });
    
    // IN-FLIGHT GUARD: Prevent concurrent engine calls
    if (engineInFlightRef.current) {
      console.log('[V3_SUBMIT][EARLY_RETURN]', { 
        loopKey, 
        reason: 'IN_FLIGHT',
        ageMs: lastInFlightAtRef.current ? Date.now() - lastInFlightAtRef.current : null
      });
      console.log('[V3_PROBING_LOOP][IN_FLIGHT_GUARD] Engine call already in progress - blocking duplicate', {
        loopKey,
        isInitialCall,
        engineInFlight: engineInFlightRef.current
      });
      return;
    }

    // FEATURE FLAG: Enable LLM probe wording in Base44 editor preview (auto-detect)
    const v3LLMSOT = computeV3LLMEnablementSOT();
    const shouldUseLLMProbeWording = v3LLMSOT.enabled;
    
    if (isInitialCall) {
      console.log('[V3_LLM][SOT_ENABLEMENT]', {
        ...v3LLMSOT,
        sessionId,
        categoryId,
        instanceNumber: instanceNumber || 1,
        loopKey
      });
    }

    // CORRELATION TRACE: Generate traceId for this probing turn
    const traceId = `${sessionId}-${Date.now()}`;
    console.log('[PROCESSING][START]', {
      traceId,
      sessionId,
      categoryId,
      incidentId: incidentId || '(will create)',
      currentItemType: 'v3_probing',
      screenMode: 'QUESTION',
      isInitialCall,
      probeIteration: probeCount + 1
    });

    // UI CONTRACT: Show deciding state BEFORE async work
    setIsDeciding(true);
    setIsLoading(true);
    if (!isInitialCall) {
      setInput("");
    }
    
    // Mark engine call as in-flight
    engineInFlightRef.current = true;
    lastInFlightAtRef.current = Date.now(); // Track when in-flight was set
    
    // DECIDE DIAGNOSTICS: Increment sequence and log start
    decideSeqRef.current += 1;
    const decideSeq = decideSeqRef.current;
    
    console.log('[V3_DECIDE][START]', {
      loopKey,
      decideSeq,
      hasOpenerAnswerLen: answer?.length || 0,
      isInitialCall
    });
    
    // TDZ FIX: Capture safe snapshot primitives BEFORE watchdog (prevents closure TDZ crash)
    const watchdogSnapshot = {
      loopKey,
      decideSeq,
      hasPromptNow: !!activePromptText,
      isDecidingNow: isDeciding,
      isBlockedNow: isBlocked,
      isCompleteNow: isComplete,
      engineInFlightNow: !!engineInFlightRef.current
    };
    
    // WATCHDOG: 15s timeout to detect stuck decide cycle
    decideTimeoutRef.current = setTimeout(() => {
      console.error('[V3_DECIDE][TIMEOUT]', {
        ...watchdogSnapshot,
        reason: 'Decide cycle did not complete within 15 seconds'
      });
    }, 15000);

    // Add user message (skip for initial opener - it's already in transcript)
    if (!isInitialCall) {
      const userMessage = {
        id: `v3-user-${Date.now()}`,
        role: "user",
        content: answer,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, userMessage]);

      // Transcript persistence moved to parent (CandidateInterview)
      // V3ProbingLoop only notifies parent via callbacks
    }

    // Persist user message to local transcript (skip for initial call)
    if (onTranscriptUpdate && !isInitialCall) {
      const userMessage = messages[messages.length - 1];
      onTranscriptUpdate({
        type: 'v3_probe_answer',
        content: answer,
        categoryId,
        incidentId,
        timestamp: userMessage?.timestamp || new Date().toISOString()
      });
    }

    // Start timing for backend call
    const engineCallStart = Date.now();
    
    // EDIT 2A: Wrap engine call in try/catch for guaranteed error handling
    try {
      console.log('[ENGINE][DECIDE_START]', { traceId, categoryId, incidentId: incidentId || '(will create)' });
      console.log('[V3_PROBE][LOOP_START]', {
        traceId,
        isInitialCall,
        probeIteration: probeCount + 1,
        answerLength: answer?.length || 0
      });
      
      // FAIL-CLOSED WATCHDOG: 12s timeout for backend call
      const BACKEND_TIMEOUT_MS = 12000;
      
      // TASK 1A: Compute editor preview flag (frontend SOT) - include preview-sandbox
      const payloadIsEditorPreview = Boolean(window?.location?.pathname?.includes('/editor/preview/') || window?.location?.href?.includes('preview-sandbox'));
      
      // TASK 1B: Force LLM in editor preview (preview-only)
      const payloadUseLLMProbeWording = payloadIsEditorPreview ? true : Boolean(shouldUseLLMProbeWording);
      const payloadUseLLMForced = payloadIsEditorPreview && !Boolean(shouldUseLLMProbeWording);
      const payloadPackInstructions = packData?.ai_probe_instructions || '';
      const packInstructionsLen = payloadPackInstructions.length;
      const hasPackInstructions = packInstructionsLen > 0;
      
      // PACK IDENTITY: Explicit packId for backend correlation
      const payloadPackId = packData?.followup_pack_id || packData?.packId || packData?.id || null;
      const packIdSource = packData?.followup_pack_id ? 'followup_pack_id' 
        : packData?.packId ? 'packId' 
        : packData?.id ? 'id' 
        : 'none';
      
      // DECIDE DIAGNOSTICS: Log effective instructions before engine call
      console.log('[V3_DECIDE][INPUTS]', {
        loopKey,
        decideSeq,
        effectiveInstructionsLen: packInstructionsLen,
        hasPackInstructions
      });
      
      // FRONTEND ASSERTION: Warn if enablement is true but instructions are missing
      if (payloadUseLLMProbeWording && !hasPackInstructions) {
        console.warn('[V3_LLM][MISSING_INSTRUCTIONS_WARNING]', {
          sessionId,
          categoryId,
          instanceNumber: instanceNumber || 1,
          loopKey
        });
      }
      
      // TASK 1C: PAYLOAD SOT LOG - Extended with forcing metadata
      console.log('[V3_LLM][PAYLOAD_SOT]', {
        sessionId,
        categoryId,
        instanceNumber: instanceNumber || 1,
        loopKey,
        packId: payloadPackId,
        packIdSource,
        shouldUseLLMProbeWording,
        payloadUseLLMProbeWording,
        payloadUseLLMForced,
        packInstructionsLen,
        hasPackInstructions,
        isEditorPreview: payloadIsEditorPreview,
        pathname: window.location?.pathname || '',
        href: window.location?.href || ''
      });
      
      // TASK 1B: Include isEditorPreview in payload (frontend SOT)
      console.log('[V3_PROBING_LOOP][INVARIANT]', { loopKey, isInitialCall: Boolean(isInitialCall), hasIncidentId: !!incidentId });
      const enginePromise = base44.functions.invoke('decisionEngineV3', {
        sessionId,
        categoryId,
        incidentId,
        latestAnswerText: answer,
        baseQuestionId: baseQuestionId || null,
        questionCode: questionCode || null,
        sectionId: sectionId || null,
        instanceNumber: instanceNumber || 1,
        isInitialCall: isInitialCall || false,
        traceId,
        packId: payloadPackId,
        packInstructions: payloadPackInstructions,
        useLLMProbeWording: payloadUseLLMProbeWording,
        isEditorPreview: payloadIsEditorPreview
      });

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('BACKEND_TIMEOUT')), BACKEND_TIMEOUT_MS)
      );

      // Race: backend call vs timeout
      let result;
      try {
        result = await Promise.race([enginePromise, timeoutPromise]);
      } catch (raceErr) {
        // Re-throw for outer catch to handle
        throw raceErr;
      }

      const engineCallMs = Date.now() - engineCallStart;
      const data = result.data || result;

      // FAIL-OPEN GUARD 1: Malformed response
      if (!data || !data.nextAction) {
        console.error('[V3_FAILOPEN][ENGINE_MALFORMED_RESPONSE]', {
          loopKey,
          categoryId,
          instanceNumber,
          hasData: !!data,
          hasNextAction: data?.nextAction || null,
          reason: 'Engine returned null/undefined or missing nextAction - synthesizing safe fallback'
        });

        const fallbackPrompt = "What additional details can you provide to make this complete?";

        // Normalize prompt (same as normal ASK path)
        let normalizedPrompt = await (async () => {
          try {
            const [sessionData, allFactModels] = await Promise.all([
              base44.entities.InterviewSession.get(sessionId),
              base44.entities.FactModel.list()
            ]);
            const factModel = allFactModels.find(fm => fm.category_id === categoryId);
            return normalizeV3ProbeQuestion(fallbackPrompt, {
              factModel,
              session: sessionData,
              incidentId: incidentId,
              packId: packData?.followup_pack_id
            });
          } catch (err) {
            console.warn('[V3_FAILOPEN][NORMALIZATION_SKIP]', { error: err.message });
            return fallbackPrompt;
          }
        })();

        setActivePromptText(normalizedPrompt);
        setActivePromptId(`v3-failopen-malformed-${incidentId}-${newProbeCount}`);
        setIsDeciding(false);
        setIsLoading(false);
        engineInFlightRef.current = false;

        if (onPromptChange) {
          onPromptChange({
            promptText: normalizedPrompt,
            promptId: `${loopKey}:failopen-malformed`,
            loopKey,
            packId: packData?.followup_pack_id,
            instanceNumber: instanceNumber || 1,
            categoryId,
            v3PromptSource: 'FAILOPEN_MALFORMED',
            v3LlmMs: null
          });
        }

        if (onAnswerNeeded) {
          onAnswerNeeded({
            promptText: normalizedPrompt,
            incidentId: incidentId,
            probeCount: newProbeCount
          });
        }

        if (onPromptSet) {
          onPromptSet({ loopKey, promptPreview: normalizedPrompt.substring(0, 60), promptLen: normalizedPrompt.length });
        }

        return;
      }

      console.log('[ENGINE][DECIDE_END]', {
        traceId,
        nextAction: data.nextAction,
        nextItemType: data.nextAction === 'ASK' ? 'v3_probe_question' : 'v3_probe_complete',
        ms: engineCallMs
      });
      
      // PROVENANCE LOG: Prove what frontend received from backend (LLM vs template)
      console.log('[V3_LLM][ENGINE_RESPONSE_SOT]', {
        sessionId,
        categoryId,
        instanceNumber: instanceNumber || 1,
        loopKey,
        packId: payloadPackId || null,
        engineBuildId: data?.engineBuildId || '(missing)',
        v3PromptSource: data?.v3PromptSource || '(missing)',
        v3LlmMs: data?.v3LlmMs ?? null,
        v3UseLLMProbeWording: data?.v3UseLLMProbeWording ?? '(missing)',
        v3EffectiveInstructionsLen: data?.v3EffectiveInstructionsLen ?? '(missing)',
        nextPromptPreview: String(data?.nextPrompt || '').slice(0, 80)
      });
      console.log('[PROCESSING][END]', { traceId, msTotal: engineCallMs });
      console.log('[V3_PROBING][ENGINE_RESPONSE]', {
        ok: data.ok,
        nextAction: data.nextAction,
        hasPrompt: !!data.nextPrompt,
        errorCode: data.errorCode,
        incidentId: data.incidentId
      });
      
      console.log('[V3_PROBING_LOOP][DECIDE_END]', {
        loopKey,
        hasPrompt: !!data.nextPrompt,
        promptLen: data.nextPrompt?.length || 0,
        isComplete: data.nextAction === 'STOP' || data.nextAction === 'RECAP',
        nextAction: data.nextAction
      });
      
      // ENGINE DEBUG VISIBILITY: Log debug object for PRIOR_LE_APPS
      if (data.debug) {
        console.log('[V3_ENGINE_DEBUG]', data.debug);
      }
      
      // ENGINE PROMPT VISIBILITY: Log prompt details
      console.log('[V3_ENGINE_PROMPT]', {
        instanceNumber: instanceNumber || 1,
        nextAction: data.nextAction,
        nextItemType: data.nextAction === 'ASK' ? 'v3_probe_question' : data.nextAction?.toLowerCase(),
        promptPreview: data.nextPrompt?.substring(0, 80) || null,
        gateStatus: data.debug?.gateStatus || null
      });

      // DIAGNOSTIC: Explicit STOP reason logging (console-truncation-proof)
      if (data.nextAction === 'STOP' || data.nextAction === 'RECAP') {
        console.log('[V3_PROBING][STOP_REASON_CODE]', data.stopReasonCode || 'NONE');
        console.log('[V3_PROBING][STOP_REASON_DETAIL]', data.stopReasonDetail || 'No detail provided');
        console.log('[V3_PROBING][MISSING_FIELDS_COUNT]', data.missingFields?.length || 0);
      }

      // DIAGNOSTIC: Dump STOP reasons on initial call
      if (isInitialCall && (data.nextAction === 'STOP' || data.nextAction === 'RECAP')) {
        console.log('[V3_PROBING][INITIAL_STOP_DUMP] ========== ENGINE STOPPED ON FIRST CALL ==========');
        console.log('[V3_PROBING][INITIAL_STOP_DUMP]', {
          categoryId,
          packId: packData?.followup_pack_id || null,
          incidentId_local: incidentId,
          incidentId_engine: data.incidentId,
          nextAction: data.nextAction,
          hasPrompt: !!data.nextPrompt,
          errorCode: data.errorCode || null,
          stopReasonCode: data.stopReasonCode || null,
          stopReasonDetail: data.stopReasonDetail || null,
          missingFieldsCount: data.missingFields?.length || 0
        });
      }
      
      // Handle controlled errors from engine
      if (data.ok === false) {
        console.error('[V3_PROBING][ENGINE_ERROR]', {
          errorCode: data.errorCode,
          errorMessage: data.errorMessage,
          details: data.details
        });
        
        // Show error message and allow graceful exit
        const errorMessage = {
          id: `v3-error-${Date.now()}`,
          role: "ai",
          content: data.nextPrompt || "I apologize, there was a technical issue. Let's continue with the interview.",
          isError: true,
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, errorMessage]);
        setIsComplete(true);
        setCompletionReason("ERROR");
        setIsLoading(false);
        return;
      }

      // Update incident ID if new one was created
      const currentIncidentId = data.incidentId || incidentId;
      if (data.incidentId && data.incidentId !== incidentId) {
        setIncidentId(data.incidentId);
        // Log new incident creation
        logIncidentCreated(sessionId, data.incidentId, categoryId);
      }
      
      // Update probe count (skip for initial call)
      const newProbeCount = isInitialCall ? 0 : probeCount + 1;
      setProbeCount(newProbeCount);

      // FAIL-OPEN GUARD 2: ASK with empty prompt
      if (data.nextAction === "ASK" && (!data.nextPrompt || data.nextPrompt.trim() === '')) {
        console.warn('[V3_FAILOPEN][ASK_EMPTY_PROMPT_LOCAL]', {
          loopKey,
          categoryId,
          instanceNumber,
          hasMissingFieldId: !!(data.missingFields?.[0]?.field_id),
          reason: 'Engine returned ASK but prompt is empty - synthesizing local fallback'
        });

        // Synthesize local fallback prompt
        let localFallbackPrompt = "What additional details can you provide to make this complete?";

        const missingFieldId = data.missingFields?.[0]?.field_id;
        if (missingFieldId) {
          const idLower = missingFieldId.toLowerCase();
          if (idLower.includes('agency') || idLower.includes('department')) {
            localFallbackPrompt = "What was the name of the law enforcement agency you applied to?";
          } else if (idLower.includes('position') || idLower.includes('title') || idLower.includes('role')) {
            localFallbackPrompt = "What position did you apply for?";
          } else if (idLower.includes('date') || idLower.includes('month') || idLower.includes('year') || idLower.includes('when')) {
            localFallbackPrompt = "About what month and year was this?";
          }
        }

        // Normalize prompt (same as normal ASK path)
        let normalizedPrompt = await (async () => {
          try {
            const [sessionData, allFactModels] = await Promise.all([
              base44.entities.InterviewSession.get(sessionId),
              base44.entities.FactModel.list()
            ]);
            const factModel = allFactModels.find(fm => fm.category_id === categoryId);
            return normalizeV3ProbeQuestion(localFallbackPrompt, {
              factModel,
              session: sessionData,
              incidentId: data.incidentId || incidentId,
              packId: packData?.followup_pack_id
            });
          } catch (err) {
            console.warn('[V3_FAILOPEN][NORMALIZATION_SKIP]', { error: err.message });
            return localFallbackPrompt;
          }
        })();

        console.log('[V3_FAILOPEN][ASK_EMPTY_PROMPT_LOCAL]', {
          loopKey,
          hasMissingFieldId: !!missingFieldId,
          promptLen: normalizedPrompt.length,
          synthesizedPrompt: normalizedPrompt
        });

        setActivePromptText(normalizedPrompt);
        setActivePromptId(`v3-failopen-${data.incidentId || incidentId}-${newProbeCount}`);
        setIsDeciding(false);
        setIsLoading(false);
        engineInFlightRef.current = false;

        if (onPromptChange) {
          onPromptChange({
            promptText: normalizedPrompt,
            promptId: `${loopKey}:failopen-empty`,
            loopKey,
            packId: packData?.followup_pack_id,
            instanceNumber: instanceNumber || 1,
            categoryId,
            v3PromptSource: 'FAILOPEN_EMPTY',
            v3LlmMs: null
          });
        }

        if (onAnswerNeeded) {
          onAnswerNeeded({
            promptText: normalizedPrompt,
            incidentId: data.incidentId || incidentId,
            probeCount: newProbeCount
          });
        }

        // SNAPSHOT: Call onPromptSet to create parent marker
        console.warn('[V3_SNAPSHOT][CALLING_ONPROMPTSET]', {
          loopKey,
          decideSeq: Date.now(),
          hasOnPromptSet: typeof onPromptSet === 'function',
          promptLen: normalizedPrompt?.length || 0,
          reason: 'FAILOPEN_MALFORMED'
        });

        if (onPromptSet) {
          onPromptSet({ loopKey, promptPreview: normalizedPrompt.substring(0, 60), promptLen: normalizedPrompt.length });
          console.warn('[V3_SNAPSHOT][ONPROMPTSET_CALLED]', { loopKey, decideSeq: Date.now() });
        }

        // SNAPSHOT COMMITTED: Mark fail-open prompt as committed (prevents NO_SNAPSHOT)
        console.log('[V3_SNAPSHOT][FAILOPEN_COMMITTED]', {
          loopKey,
          promptLen: normalizedPrompt.length,
          reason: 'FAILOPEN_MALFORMED'
        });

        return;
        }

        // Handle next action
        if (data.nextAction === "ASK" && data.nextPrompt) {
        // PROMPT-SET DEDUPE: Compute stable hash and check for duplicates
        const canon = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const promptHash = `${loopKey}:${newProbeCount}:${canon(data.nextPrompt)}`;

        if (lastPromptHashRef.current === promptHash) {
          console.log('[V3_PROBING_LOOP][DUPLICATE_ENGINE_RESPONSE_IGNORED]', {
            promptHash,
            loopKey,
            incidentId: currentIncidentId,
            probeCount: newProbeCount,
            reason: 'Engine returned same prompt as last time - ignoring state update'
          });
          setIsDeciding(false);
          setIsLoading(false);
          engineInFlightRef.current = false;
          return;
        }

        // Update hash reference only for genuinely new prompts
        lastPromptHashRef.current = promptHash;

        // PART 3: Compute canonical promptId for this probe BEFORE callback
        const canonicalPromptIdForCallback = `${loopKey}:${newProbeCount}`;

        console.log('[V3_PROBE][PROMPTID_FOR_CALLBACK]', {
          promptId: canonicalPromptIdForCallback,
          loopKey,
          probeCount: newProbeCount,
          reason: 'Pre-callback generation for snapshot'
        });

        // EDIT 2C: Diagnostic log - prove prompt received from backend
        console.log('[V3_LOOP][PROMPT_RECEIVED]', { 
          loopKey, 
          promptLen: data.nextPrompt?.length || 0, 
          v3PromptSource: data?.v3PromptSource, 
          ts: Date.now() 
        });

        // OUTPUT BOUNDARY: Normalize probe question to enforce Date Rule
        // This is the ONLY normalization layer - runs before setting state
        let normalizedPrompt = await (async () => {
          try {
            // Fetch session and factModel for normalization context
            const [sessionData, allFactModels] = await Promise.all([
              base44.entities.InterviewSession.get(sessionId),
              base44.entities.FactModel.list()
            ]);

            // Find the FactModel for this category
            const factModel = allFactModels.find(fm => fm.category_id === categoryId);

            return normalizeV3ProbeQuestion(data.nextPrompt, {
              factModel,
              session: sessionData,
              incidentId: currentIncidentId,
              packId: packData?.followup_pack_id
            });
          } catch (err) {
            console.warn('[V3_OUTPUT_CONTRACT][NORMALIZATION_SKIP]', {
              reason: 'Failed to fetch context for normalization',
              error: err.message
            });
            // Fail open: return original prompt if normalization fails
            return data.nextPrompt;
          }
        })();

        // FIX: Define preview context from v3LLMSOT
        const isPreviewContextSOT = Boolean(v3LLMSOT?.enabled);

        // UI FAILSAFE: Sanitize in preview-sandbox if backend is stale
        if (isPreviewContextSOT && normalizedPrompt && /omitted information/i.test(normalizedPrompt)) {
          const beforePrompt = normalizedPrompt;
          normalizedPrompt = "What was the name of the law enforcement agency you applied to?";
          console.warn('[V3_UI_FAILSAFE_SANITIZE]', {
            engineBuildId: data?.engineBuildId || '(missing)',
            beforePreview: beforePrompt.slice(0, 80),
            afterPreview: normalizedPrompt
          });
        }

        // Log prompt set for render-truth tracking
        console.log('[V3_SET_PROMPT]', {
          loopKey,
          activePromptLen: normalizedPrompt?.length || 0,
          preview: normalizedPrompt?.substring(0, 60) || null
        });

        // UI CONTRACT: SINGLE SOURCE OF TRUTH - only set activePromptText
        // Do NOT add to messages array (prevents duplicate rendering)
        setActivePromptText(normalizedPrompt);
        setActivePromptId(`v3-prompt-${currentIncidentId}-${newProbeCount}`);
        setIsDeciding(false);

        // PART 3: Use pre-computed promptId for callback (ensures snapshot can be created)
        if (onPromptChange) {
          onPromptChange({
            promptText: normalizedPrompt,
            promptId: canonicalPromptIdForCallback,
            loopKey,
            packId: packData?.followup_pack_id,
            instanceNumber: instanceNumber || 1,
            categoryId,
            // TASK 3: Wire provenance metadata through to parent
            v3PromptSource: data?.v3PromptSource,
            v3LlmMs: data?.v3LlmMs
          });
        }

        // HEADLESS MODE: Signal parent that answer is needed
        if (onAnswerNeeded) {
          onAnswerNeeded({
            promptText: data.nextPrompt,
            incidentId: currentIncidentId,
            probeCount: newProbeCount
          });
        }
        
        // HEADLESS MODE: Notify parent that prompt is ready
        if (onPromptSet) {
          onPromptSet({
            loopKey,
            promptPreview: data.nextPrompt?.substring(0, 60) || null,
            promptLen: data.nextPrompt?.length || 0
          });
        }

        // Transcript persistence moved to parent (CandidateInterview)
        // V3ProbingLoop only notifies parent via callbacks
      } else if (data.nextAction === "RECAP" || data.nextAction === "STOP") {
        setIsDeciding(false);
        setActivePromptText(null);
        setActivePromptId(null);
        
        // Check if engine provided no prompt (immediate complete)
        if (!data.nextPrompt || data.nextPrompt.trim() === '') {
          console.log('[V3_PROBING_LOOP][COMPLETE_NO_PROMPT]', {
            loopKey,
            nextAction: data.nextAction,
            reason: 'ENGINE_NO_PROMPT_COMPLETE'
          });
          
          setIsComplete(true);
          setCompletionReason(data.nextAction);
          
          // Notify parent immediately (no Continue button)
          if (onIncidentComplete) {
            const safePackId = packData?.followup_pack_id || categoryId || null;
            onIncidentComplete({
              loopKey,
              packId: safePackId,
              categoryId,
              instanceNumber,
              reason: 'ENGINE_NO_PROMPT_COMPLETE',
              incidentId: data.incidentId || incidentId,
              completionReason: data.nextAction,
              // CRITICAL: Pass engine metadata for MI_GATE validation
              missingFields: data.missingFields || [],
              miGateBlocked: data.miGateBlocked || false,
              stopReason: data.stopReasonCode || data.stopReason || null
            });
            console.log('[V3_INCIDENT_COMPLETE][CALLBACK]', { 
              loopKey, 
              packId: safePackId, 
              instanceNumber, 
              nextAction: data.nextAction,
              missingCount: data.missingFields?.length || 0,
              miGateBlocked: data.miGateBlocked || false
            });
          }
          
          setIsLoading(false);
          setIsDeciding(false);
          engineInFlightRef.current = false;
          return;
        }
        
        // RECAP PATH: Engine returned completion message (non-interactive)
        console.log('[V3_PROBING_LOOP][RECAP_READY]', {
          loopKey,
          promptLen: data.nextPrompt?.length || 0,
          nextAction: data.nextAction
        });
        
        // Notify parent of recap text (parent renders as allowed system event, not probe prompt)
        const safePackId = packData?.followup_pack_id || categoryId || null;
        if (onRecapReady) {
          onRecapReady({
            loopKey,
            packId: safePackId,
            categoryId,
            instanceNumber,
            recapText: data.nextPrompt,
            nextAction: data.nextAction,
            incidentId: data.incidentId || incidentId
          });
        }
        
        // Mark complete and trigger routing via onIncidentComplete
        setIsComplete(true);
        setCompletionReason(data.nextAction);
        
        // Trigger parent routing (multi-instance gate or advance)
        if (onIncidentComplete) {
          onIncidentComplete({
            loopKey,
            packId: safePackId,
            categoryId,
            instanceNumber,
            reason: 'RECAP_COMPLETE',
            incidentId: data.incidentId || incidentId,
            completionReason: data.nextAction,
            hasRecap: true,
            // CRITICAL: Pass engine metadata for MI_GATE validation
            missingFields: data.missingFields || [],
            miGateBlocked: data.miGateBlocked || false,
            stopReason: data.stopReasonCode || data.stopReason || null
          });
          console.log('[V3_INCIDENT_COMPLETE][CALLBACK]', { 
            loopKey, 
            packId: safePackId, 
            instanceNumber, 
            nextAction: data.nextAction,
            missingCount: data.missingFields?.length || 0,
            miGateBlocked: data.miGateBlocked || false
          });
        }
        
        setIsLoading(false);
        setIsDeciding(false);
        engineInFlightRef.current = false;
        return;
        
        // LEGACY PATH BELOW (kept for backwards compatibility if onRecapReady not provided)
        // Probing complete - use centralized completion message
        const completionMessage = data.nextPrompt || getCompletionMessage(data.nextAction, data.stopReason);

        const aiMessage = {
          id: `v3-ai-complete-${Date.now()}`,
          role: "ai",
          content: completionMessage,
          isCompletion: true,
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, aiMessage]);
        setCompletionReason(data.nextAction);

        // Determine final incident ID - use engine's if provided, otherwise local
        const finalIncidentId = (data.incidentId && data.incidentId.trim() !== '') ? data.incidentId : incidentId;

        // Log completion to InterviewTranscript
        if (data.nextAction === "RECAP") {
          logIncidentCompleted(sessionId, finalIncidentId, categoryId, "RECAP");
        } else {
          logProbingStopped(sessionId, finalIncidentId, categoryId, data.stopReason || "UNKNOWN", newProbeCount);
        }

        console.log('[V3_PROBING_COMPLETE] Summary generated by engine', { 
          categoryId, 
          incidentId: finalIncidentId 
        });

        // FIX #4: Append completion message to main transcript
        const { appendAssistantMessage } = await import("../utils/chatTranscriptHelpers");
        const sessionData = await base44.entities.InterviewSession.get(sessionId);
        await appendAssistantMessage(sessionId, sessionData.transcript_snapshot || [], completionMessage, {
          messageType: 'v3_probe_complete',
          categoryId,
          incidentId: finalIncidentId,
          nextAction: data.nextAction,
          visibleToCandidate: true
        });

        // Check if pack supports multi-instance (from pack metadata)
        const shouldOfferAnotherInstance = packData?.behavior_type === 'multi_incident' || 
                                            packData?.followup_multi_instance === true;

        console.log('[V3_PROBING][MULTI_INSTANCE_CHECK]', {
          packId: packData?.followup_pack_id,
          behavior: packData?.behavior_type,
          shouldOffer: shouldOfferAnotherInstance
        });

        // If multi-instance, call onComplete immediately (don't wait for button)
        if (shouldOfferAnotherInstance) {
          console.log('[V3_PROBING][COMPLETE][AUTO] Calling onComplete immediately for multi-instance');
          if (onComplete) {
            onComplete({
              incidentId: finalIncidentId,
              categoryId,
              completionReason: data.nextAction,
              messages,
              reason: 'AUTO_COMPLETE',
              shouldOfferAnotherInstance: true,
              packId: packData?.followup_pack_id,
              categoryLabel,
              instanceNumber,
              packData
            });
          }
          // Don't show "Continue" button - parent will show gate
          return;
        }

        setIsComplete(true);

        // Persist completion to local transcript
        if (onTranscriptUpdate) {
          onTranscriptUpdate({
            type: 'v3_probe_complete',
            content: completionMessage,
            categoryId,
            incidentId: finalIncidentId,
            nextAction: data.nextAction,
            timestamp: aiMessage.timestamp
          });
        }
      }
    } catch (err) {
      const engineCallMs = Date.now() - engineCallStart;
      
      // DECIDE DIAGNOSTICS: Log error
      console.error('[V3_DECIDE][ERR]', {
        loopKey,
        decideSeq,
        message: err?.message || String(err),
        stackPreview: err?.stack?.substring(0, 200) || 'N/A'
      });
      
      // EDIT 2A: Engine call failed - log and force failopen prompt
      console.error('[V3_LOOP][ENGINE_CALL_FAILED]', { 
        loopKey, 
        err: String(err), 
        ts: Date.now() 
      });
      
      console.error("[V3_PROBING][ENGINE_CALL_ERROR]", { 
        error: String(err), 
        stack: err?.stack,
        traceId,
        elapsedMs: engineCallMs
      });
      
      // FAIL-OPEN: Backend timeout detected - show fallback probe instead of completing
      if (err.message === 'BACKEND_TIMEOUT') {
        console.error("[V3_PROBE][TIMEOUT_FAIL_OPEN]", {
          traceId,
          elapsedMs: engineCallMs,
          reason: 'Backend call exceeded 12s timeout - failing open with fallback probe'
        });
        
        // Set safe fallback probe question - same state as normal ASK response
        const fallbackPrompt = "What was the name of the law enforcement agency you applied to?";
        const fallbackPromptId = `v3-fallback-${sessionId}-${categoryId}-${instanceNumber || 1}-${Date.now()}`;
        
        setActivePromptText(fallbackPrompt);
        setActivePromptId(fallbackPromptId);

        // ANSWER_NEEDED state: same as normal ASK response
        setIsDeciding(false);
        setIsLoading(false);

        // Notify parent that answer is needed (same as normal ASK)
        if (onAnswerNeeded) {
          onAnswerNeeded({
            promptText: fallbackPrompt,
            incidentId: incidentId,
            probeCount: probeCount
          });
        }

        if (onPromptChange) {
          onPromptChange({
            promptText: fallbackPrompt,
            promptId: fallbackPromptId,
            loopKey,
            packId: packData?.followup_pack_id,
            instanceNumber: instanceNumber || 1,
            categoryId,
            v3PromptSource: 'FALLBACK_TIMEOUT',
            v3LlmMs: null
          });
        }

        // SNAPSHOT: Call onPromptSet to create parent marker
        console.warn('[V3_SNAPSHOT][CALLING_ONPROMPTSET]', {
          loopKey,
          decideSeq: Date.now(),
          hasOnPromptSet: typeof onPromptSet === 'function',
          promptLen: fallbackPrompt?.length || 0,
          reason: 'FALLBACK_TIMEOUT'
        });

        if (onPromptSet) {
          onPromptSet({ loopKey, promptPreview: fallbackPrompt.substring(0, 60), promptLen: fallbackPrompt.length });
          console.warn('[V3_SNAPSHOT][ONPROMPTSET_CALLED]', { loopKey, decideSeq: Date.now() });
        }

        // SNAPSHOT COMMITTED: Mark timeout fail-open as committed
        console.log('[V3_SNAPSHOT][FAILOPEN_COMMITTED]', {
          loopKey,
          promptLen: fallbackPrompt.length,
          reason: 'FALLBACK_TIMEOUT'
        });

        console.log('[V3_PROBE][FALLBACK_PROMPT_SET]', {
          promptPreview: fallbackPrompt.slice(0, 60),
          reason: 'BACKEND_TIMEOUT',
          answerNeeded: true
        });
        return;
      }
      
      console.error("[V3_PROBING][EXCEPTION] Error calling decision engine:", err);
      console.error("[V3_PROBING][EXCEPTION_DETAILS]", {
        traceId,
        message: err.message,
        name: err.name,
        stack: err.stack,
        elapsedMs: engineCallMs
      });
      
      // Only show "technical issue" card for truly fatal errors, NOT for transcript logging issues
      const isTranscriptLoggingError = err.message?.includes('visibleToCandidate must be explicitly set');
      
      if (isTranscriptLoggingError) {
        console.warn("[V3_PROBING][TRANSCRIPT_ERROR] Transcript logging failed but interview can continue:", err.message);
        // Continue interview flow - don't show error card
        setIsComplete(true);
        setCompletionReason("STOP");
        return; // ✓ EXPLICIT RETURN - guarantees no fallthrough to error card
      }
      
      // EDIT 2A: Runtime exception failopen
      console.error('[V3_LOOP][ENGINE_CALL_FAILED]', { 
        loopKey, 
        err: String(err), 
        ts: Date.now() 
      });
      
      console.warn("[V3_PROBE][EXCEPTION_FAIL_OPEN]", {
        traceId,
        reason: 'Runtime exception - failing open with fallback probe'
      });
      
      const fallbackPrompt = "What was the name of the law enforcement agency you applied to?";
      const fallbackPromptId = `v3-fallback-${sessionId}-${categoryId}-${instanceNumber || 1}-${Date.now()}`;
      
      setActivePromptText(fallbackPrompt);
      setActivePromptId(fallbackPromptId);
      setIsDeciding(false);
      setIsLoading(false);
      engineInFlightRef.current = false;
      
      if (onAnswerNeeded) {
        onAnswerNeeded({
          promptText: fallbackPrompt,
          incidentId: incidentId,
          probeCount: probeCount
        });
      }
      
      if (onPromptChange) {
        onPromptChange({
          promptText: fallbackPrompt,
          promptId: fallbackPromptId,
          loopKey,
          packId: packData?.followup_pack_id,
          instanceNumber: instanceNumber || 1,
          categoryId,
          v3PromptSource: 'FALLBACK_EXCEPTION',
          v3LlmMs: null
        });
      }

      if (onPromptSet) {
        onPromptSet({ loopKey, promptPreview: fallbackPrompt.substring(0, 60), promptLen: fallbackPrompt.length });
      }

      console.log('[V3_SNAPSHOT][FAILOPEN_COMMITTED]', {
        loopKey,
        promptLen: fallbackPrompt.length,
        reason: 'FALLBACK_EXCEPTION'
      });

      console.log('[V3_PROBE][FALLBACK_PROMPT_SET]', {
        promptPreview: fallbackPrompt.slice(0, 60),
        reason: 'RUNTIME_EXCEPTION',
        answerNeeded: true
      });
      return;
    } finally {
      // DECIDE DIAGNOSTICS: Log end and clear watchdog
      console.log('[V3_DECIDE][END]', {
        loopKey,
        decideSeq,
        hasPrompt: !!activePromptText,
        promptLen: activePromptText?.length || 0
      });
      
      // Clear watchdog timeout
      if (decideTimeoutRef.current) {
        clearTimeout(decideTimeoutRef.current);
        decideTimeoutRef.current = null;
      }
      
      setIsLoading(false);
      setIsDeciding(false);
      engineInFlightRef.current = false;
    }
  };

  const handleContinue = () => {
    console.log('[V3_PROBING_LOOP][EXIT_REQUESTED] handleContinue clicked');

    const safePackId = packData?.followup_pack_id || categoryId || null;
    setExitRequested(true);
    setExitPayload({
      incidentId,
      categoryId,
      completionReason,
      messages,
      reason: 'CONTINUE_BUTTON',
      shouldOfferAnotherInstance: false, // Single-instance packs only
      packId: safePackId,
      categoryLabel,
      instanceNumber,
      packData
    });
  };
  
  // Expose multi-instance handler to parent (DISABLED - parent now owns gate)
  const handleMultiInstanceAnswer = useCallback((answer) => {
    console.log('[V3_MULTI_INSTANCE][LEGACY_HANDLER] Called but should not be used - parent owns gate now');
  }, []);
  
  // Multi-instance gate hooks DISABLED - parent now owns gate fully
  
  // Deferred exit: call parent callback ONLY from useEffect (fixes React warning)
  const completeCalledRef = useRef(false);
  useEffect(() => {
    if (exitRequested && exitPayload && !completeCalledRef.current) {
      completeCalledRef.current = true;
      console.log('[V3_PROBING_LOOP][EXIT_EXECUTING] Calling onComplete from useEffect (ONCE)', exitPayload);
      setIsComplete(true);

      // Clear gate in parent first
      if (onMultiInstancePrompt) {
        onMultiInstancePrompt(null);
      }

      // Then call exit
      if (onComplete) {
        onComplete(exitPayload);
      }

      setExitRequested(false);
      setExitPayload(null);
    }
  }, [exitRequested, exitPayload, onComplete, onMultiInstancePrompt]);

  // MOUNT GUARD: Render nothing if blocked
  if (isBlocked) {
    return (
      <div style={{ display: 'none' }} data-blocked="true" data-loop-key={loopKey}>
        {/* Blocked duplicate V3ProbingLoop instance */}
      </div>
    );
  }
  
  // UI CONTRACT: Prompt ONLY in placeholder (never as label/bubble)
  const placeholderText = !isComplete && activePromptText ? activePromptText : "Type your answer...";
  
  // PORTAL COMPOSER: Minimal flat bar, prompt in placeholder only
  const composerNode = (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] px-4 pb-4">
      <div className="max-w-4xl mx-auto">
        {!isComplete && (
          <div className="rounded-xl bg-slate-950/40 backdrop-blur px-3 py-3">
            {/* Processing indicator - inline minimal */}
            {isDeciding && (
              <div className="flex items-center gap-2 mb-2">
                <Loader2 className="w-3 h-3 text-purple-400 animate-spin" />
                <span className="text-xs text-slate-400">Processing...</span>
              </div>
            )}

            {/* Input form - prompt in placeholder only */}
            {!isDeciding && (
              <form onSubmit={handleSubmit} className="flex gap-2 items-center">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={placeholderText}
                  aria-label={activePromptText || "Type your answer"}
                  className="flex-1 bg-slate-900/60 border border-slate-600/50 rounded-lg text-slate-100 placeholder:text-slate-400"
                  disabled={isLoading}
                  autoFocus
                />
                <Button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="bg-indigo-600 hover:bg-indigo-700 px-4"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </form>
            )}
          </div>
        )}

        {/* Continue button - shown after probing completes */}
        {isComplete && (
          <div className="rounded-xl bg-slate-950/40 backdrop-blur px-3 py-3 flex justify-center">
            <Button
              onClick={handleContinue}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-2"
            >
              Continue to Next Question
            </Button>
          </div>
        )}
      </div>
    </div>
  );
  
  // HEADLESS MODE: V3ProbingLoop renders NO UI (parent owns all rendering)
  // Return null - component is logic-only, no DOM
  return null;
  }