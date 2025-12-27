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
        handleSubmit(null, openerAnswer, true);
      }, 0);
    }

    // Cleanup: remove loopKey on unmount
    return () => {
      activeLoopKeysRef.current.delete(loopKey);
    };
  }, []);

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
  }, [pendingAnswer, isComplete, loopKey, probeCount, onAnswerConsumed]);

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
    
    const pathname = window.location?.pathname || '';
    const href = window.location?.href || '';
    const enabled = pathname.includes('/editor/preview/') || href.includes('/editor/preview/');
    
    return {
      enabled,
      reason: enabled ? 'editor_preview_path_detected' : 'not_editor_preview_path',
      pathname,
      href
    };
  };

  const handleSubmit = async (e, initialAnswer = null, isInitialCall = false) => {
    e?.preventDefault();
    
    // Use initialAnswer (from parent's pendingAnswer) if provided, otherwise fall back to local input
    const answer = initialAnswer || input.trim();
    if (!answer || isLoading || isComplete) return;
    
    // IN-FLIGHT GUARD: Prevent concurrent engine calls
    if (engineInFlightRef.current) {
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
      
      // PAYLOAD HARDENING: Ensure flags are always present and consistent
      const payloadUseLLMProbeWording = Boolean(shouldUseLLMProbeWording);
      const payloadPackInstructions = packData?.ai_probe_instructions || '';
      const packInstructionsLen = payloadPackInstructions.length;
      const hasPackInstructions = packInstructionsLen > 0;
      
      // PACK IDENTITY: Explicit packId for backend correlation
      const payloadPackId = packData?.followup_pack_id || packData?.packId || packData?.id || null;
      const packIdSource = packData?.followup_pack_id ? 'followup_pack_id' 
        : packData?.packId ? 'packId' 
        : packData?.id ? 'id' 
        : 'none';
      
      // FRONTEND ASSERTION: Warn if enablement is true but instructions are missing
      if (payloadUseLLMProbeWording && !hasPackInstructions) {
        console.warn('[V3_LLM][MISSING_INSTRUCTIONS_WARNING]', {
          sessionId,
          categoryId,
          instanceNumber: instanceNumber || 1,
          loopKey
        });
      }
      
      // PAYLOAD SOT LOG: Prove what frontend sends to backend (fires ONCE per submit)
      console.log('[V3_LLM][PAYLOAD_SOT]', {
        sessionId,
        categoryId,
        instanceNumber: instanceNumber || 1,
        loopKey,
        packId: payloadPackId,
        packIdSource,
        shouldUseLLMProbeWording,
        payloadUseLLMProbeWording,
        packInstructionsLen,
        hasPackInstructions,
        pathname: window.location?.pathname || '',
        href: window.location?.href || ''
      });
      
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
        useLLMProbeWording: payloadUseLLMProbeWording
      });
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('BACKEND_TIMEOUT')), BACKEND_TIMEOUT_MS)
      );
      
      // Race: backend call vs timeout
      const result = await Promise.race([enginePromise, timeoutPromise]);

      const engineCallMs = Date.now() - engineCallStart;
      const data = result.data || result;

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
          return;
        }

        // Update hash reference only for genuinely new prompts
        lastPromptHashRef.current = promptHash;

        // OUTPUT BOUNDARY: Normalize probe question to enforce Date Rule
        // This is the ONLY normalization layer - runs before setting state
        const normalizedPrompt = await (async () => {
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

        // HEADLESS MODE: Notify parent of new prompt with canonical promptId
        const canonicalPromptId = `${loopKey}:${newProbeCount}`;
        if (onPromptChange) {
          onPromptChange({
            promptText: normalizedPrompt,
            promptId: canonicalPromptId,
            loopKey,
            packId: packData?.followup_pack_id,
            instanceNumber: instanceNumber || 1,
            categoryId
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
              completionReason: data.nextAction
            });
            console.log('[V3_INCIDENT_COMPLETE][CALLBACK]', { loopKey, packId: safePackId, instanceNumber, nextAction: data.nextAction });
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
            hasRecap: true
          });
          console.log('[V3_INCIDENT_COMPLETE][CALLBACK]', { loopKey, packId: safePackId, instanceNumber, nextAction: data.nextAction });
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
      
      console.error("[V3_PROBING][ENGINE_CALL_ERROR]", { 
        error: String(err), 
        stack: err?.stack,
        traceId,
        elapsedMs: engineCallMs
      });
      
      // UI CONTRACT: Clear deciding state on error
      setIsDeciding(false);
      setActivePromptText(null);
      setActivePromptId(null);
      
      // FAIL-CLOSED: Backend timeout detected
      if (err.message === 'BACKEND_TIMEOUT') {
        console.error("[V3_PROBE][TIMEOUT_FALLBACK]", {
          traceId,
          elapsedMs: engineCallMs,
          reason: 'Backend call exceeded 12s timeout - failing closed to continue interview'
        });
        
        // Show graceful completion message
        const fallbackMessage = {
          id: `v3-timeout-${Date.now()}`,
          role: "ai",
          content: "Thank you for providing those details. Let's continue with the interview.",
          isCompletion: true,
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, fallbackMessage]);
        setIsComplete(true);
        setCompletionReason("STOP");
        setIsLoading(false);
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
      
      // Show error for truly fatal issues
      const errorMessage = {
        id: `v3-error-${Date.now()}`,
        role: "ai",
        content: "I apologize, there was a technical issue. Let's continue with the interview.",
        isError: true,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
      setIsComplete(true);
      setCompletionReason("ERROR");
    } finally {
      setIsLoading(false);
      setIsDeciding(false);
      // ALWAYS reset in-flight guard (even on early returns/errors)
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