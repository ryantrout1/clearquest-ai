import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2, Bot, User, CheckCircle2 } from "lucide-react";
import { getCompletionMessage } from "../utils/v3ProbingPrompts";
import { 
  logAIOpening, 
  logAIFollowUp, 
  logCandidateAnswer, 
  logIncidentCreated,
  logIncidentCompleted,
  logProbingStopped 
} from "../utils/v3TranscriptLogger";

/**
 * V3 Probing Loop Component
 * 
 * A conversational micro-interview panel for V3-enabled categories.
 * Calls decisionEngineV3 to drive the probing loop until STOP/RECAP.
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
  traceId: parentTraceId // NEW: Correlation trace from parent
}) {
  const effectiveTraceId = parentTraceId || `${sessionId}-${Date.now()}`;
  console.log('[V3_PROBING_LOOP][INIT]', { traceId: effectiveTraceId, categoryId, instanceNumber });
  // FORENSIC: Component instance tracking
  const componentInstanceId = useRef(`V3ProbingLoop-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  
  useEffect(() => {
    console.log('[FORENSIC][MOUNT]', { component: 'V3ProbingLoop', instanceId: componentInstanceId.current, categoryId, instanceNumber });
    return () => {
      console.log('[FORENSIC][UNMOUNT]', { component: 'V3ProbingLoop', instanceId: componentInstanceId.current, categoryId, instanceNumber });
    };
  }, []);
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

  // Initialize V3 probing with opener answer
  useEffect(() => {
    if (hasInitialized.current) {
      console.log('[V3_PROBING_LOOP][INIT_SKIP] Already initialized - preventing duplicate decide() call');
      return;
    }
    hasInitialized.current = true;
    
    console.log("[V3_PROBING_LOOP][INIT] Starting with opener answer", {
      categoryId,
      incidentId,
      openerAnswerLength: openerAnswer?.length || 0
    });
    
    // Call decision engine with opener to get first probe
    if (openerAnswer) {
      handleSubmit(null, openerAnswer, true);
    }
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e, initialAnswer = null, isInitialCall = false) => {
    e?.preventDefault();
    
    const answer = isInitialCall ? initialAnswer : input.trim();
    if (!answer || isLoading || isComplete) return;

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

    // Add user message (skip for initial opener - it's already in transcript)
    if (!isInitialCall) {
      const userMessage = {
        id: `v3-user-${Date.now()}`,
        role: "user",
        content: answer,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, userMessage]);

      // FIX #4: Append user answer to main transcript
      const { appendUserMessage } = await import("../utils/chatTranscriptHelpers");
      const session = await base44.entities.InterviewSession.get(sessionId);
      await appendUserMessage(sessionId, session.transcript_snapshot || [], answer, {
        messageType: 'v3_probe_answer',
        categoryId,
        incidentId,
        probeCount
      });
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

    try {
      console.log('[ENGINE][DECIDE_START]', { traceId, categoryId, incidentId: incidentId || '(will create)' });
      console.log('[V3_PROBE][LOOP_START]', {
        traceId,
        isInitialCall,
        probeIteration: probeCount + 1,
        answerLength: answer?.length || 0
      });
      
      // FAIL-CLOSED WATCHDOG: 12s timeout for backend call
      const engineCallStart = Date.now();
      const BACKEND_TIMEOUT_MS = 12000;
      
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
        traceId
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
      console.log('[PROCESSING][END]', { traceId, msTotal: engineCallMs });
      console.log('[V3_PROBING][ENGINE_RESPONSE]', {
        ok: data.ok,
        nextAction: data.nextAction,
        hasPrompt: !!data.nextPrompt,
        errorCode: data.errorCode,
        incidentId: data.incidentId
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
        // DUPLICATE PROMPT GUARD: Hash prompt to detect duplicates
        const promptHash = `${data.nextPrompt}-${currentIncidentId}-${newProbeCount}`;
        
        if (lastPromptHashRef.current === promptHash) {
          console.log('[V3_UI_CONTRACT][DUPLICATE_PROMPT_BLOCKED]', {
            promptPreview: data.nextPrompt.substring(0, 60),
            incidentId: currentIncidentId,
            probeCount: newProbeCount,
            reason: 'Same prompt hash as previous - skipping duplicate render'
          });
          setIsDeciding(false);
          setIsLoading(false);
          return;
        }
        
        lastPromptHashRef.current = promptHash;
        
        const aiMessage = {
          id: `v3-ai-${Date.now()}`,
          role: "ai",
          content: data.nextPrompt,
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, aiMessage]);
        
        // UI CONTRACT: Set active prompt state (renders in UI)
        setActivePromptText(data.nextPrompt);
        setActivePromptId(aiMessage.id);
        setIsDeciding(false);
        
        // Log V3 probe as system event only (NOT visible transcript message)
        const { logSystemEvent } = await import("../utils/chatTranscriptHelpers");
        await logSystemEvent(sessionId, 'V3_PROBE_ASKED', {
          categoryId,
          incidentId: currentIncidentId,
          probeCount: newProbeCount,
          promptPreview: data.nextPrompt.substring(0, 60)
        });
        
        // [V3_UI_CONTRACT] Probe rendered as active prompt, not transcript message
        console.log('[V3_UI_CONTRACT]', {
          action: 'SET_ACTIVE_PROMPT',
          promptPreview: data.nextPrompt.substring(0, 60),
          appendedToTranscript: false,
          activePromptSet: true
        });

        // Persist AI message to local transcript (V3ProbingLoop internal state only)
        if (onTranscriptUpdate) {
          onTranscriptUpdate({
            type: 'v3_probe_question',
            content: data.nextPrompt,
            categoryId,
            incidentId: currentIncidentId,
            timestamp: aiMessage.timestamp
          });
        }
      } else if (data.nextAction === "RECAP" || data.nextAction === "STOP") {
        setIsDeciding(false);
        setActivePromptText(null);
        setActivePromptId(null);
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
    }
  };

  const handleContinue = () => {
    console.log('[V3_PROBING_LOOP][EXIT_REQUESTED] handleContinue clicked');

    setExitRequested(true);
    setExitPayload({
      incidentId,
      categoryId,
      completionReason,
      messages,
      reason: 'CONTINUE_BUTTON',
      shouldOfferAnotherInstance: false, // Single-instance packs only
      packId: packData?.followup_pack_id,
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

  return (
    <div className="w-full space-y-2">
      {/* V3 Messages - using existing ClearQuest bubble style */}
      {messages.map((msg) => (
        <div key={msg.id}>
          {msg.role === "ai" && !msg.isCompletion && (
            <div className="w-full bg-purple-900/30 border border-purple-700/50 rounded-xl p-4">
              <p className="text-white text-sm leading-relaxed">{msg.content}</p>
            </div>
          )}
          {msg.role === "user" && (
            <div className="flex justify-end">
              <div className="bg-purple-600 rounded-xl px-5 py-3">
                <p className="text-white text-sm">{msg.answer || msg.content}</p>
              </div>
            </div>
          )}
        </div>
      ))}

      <div ref={messagesEndRef} />

      {/* UI CONTRACT: Always show EITHER deciding state OR active prompt OR fallback */}
      {!isComplete && (
        <>
          {/* PRIORITY 1: Processing indicator while engine decides */}
          {isDeciding && (
            <div className="w-full bg-slate-800/50 border border-slate-600/50 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                <p className="text-slate-300 text-sm">Reviewing your answer...</p>
              </div>
            </div>
          )}
          
          {/* PRIORITY 2: Active prompt card (visible to user) */}
          {!isDeciding && activePromptText && (
            <div className="w-full bg-purple-900/30 border border-purple-700/50 rounded-xl p-4">
              <p className="text-white text-sm leading-relaxed">{activePromptText}</p>
            </div>
          )}
          
          {/* PRIORITY 3: Safe fallback (prevents blank screen) */}
          {!isDeciding && !activePromptText && !isLoading && (
            <div className="w-full bg-slate-800/50 border border-slate-600/50 rounded-xl p-4">
              <p className="text-slate-400 text-sm italic">Preparing the next question...</p>
            </div>
          )}
        </>
      )}

      {/* Input form - shown while probing active and not complete */}
      {!isComplete && !isDeciding && (
        <form onSubmit={handleSubmit} className="mt-4">
          <div className="flex gap-3">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your answer..."
              className="flex-1 bg-[#0d1829] border-2 border-purple-500 focus:border-purple-400 text-white placeholder:text-slate-400"
              disabled={isLoading}
              autoFocus
            />
            <Button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="bg-indigo-600 hover:bg-indigo-700 px-5"
            >
              <Send className="w-4 h-4 mr-2" />
              Send
            </Button>
          </div>
        </form>
      )}

      {/* Loading state while waiting for engine - DISABLED (covered by isDeciding card) */}
      {false && isLoading && (
        <div className="flex items-center justify-center gap-2 py-3 text-purple-300">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Processing...</span>
        </div>
      )}

      {/* Continue button - shown after probing completes */}
      {isComplete && (
        <div className="flex justify-center mt-4">
          <Button
            onClick={handleContinue}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-2"
          >
            Continue to Next Question
          </Button>
        </div>
      )}
    </div>
  );
}