import React, { useState, useEffect, useRef } from "react";
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
  openerAnswer // NEW: Opener narrative from candidate
}) {
  // Create local incidentId if not provided to ensure summary generation always has a target
  const [incidentId, setIncidentId] = useState(() => {
    if (initialIncidentId) return initialIncidentId;
    const localId = `v3-incident-${sessionId}-${categoryId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log("[V3_PROBING_LOOP][INIT] Created local incidentId:", localId);
    return localId;
  });
  const [probeCount, setProbeCount] = useState(0);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [completionReason, setCompletionReason] = useState(null);
  const messagesEndRef = useRef(null);
  const hasInitialized = useRef(false);

  // Initialize V3 probing with opener answer
  useEffect(() => {
    if (hasInitialized.current) return;
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

      // Log candidate answer to InterviewTranscript
      logCandidateAnswer(sessionId, incidentId, categoryId, answer, probeCount);
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
      console.log('[V3_PROBING][CALLING_ENGINE]', {
        sessionId,
        categoryId,
        incidentId: incidentId || '(will create)',
        answerLength: answer?.length || 0,
        isInitialCall
      });
      
      // Call V3 decision engine
      const result = await base44.functions.invoke('decisionEngineV3', {
        sessionId,
        categoryId,
        incidentId,
        latestAnswerText: answer,
        baseQuestionId: baseQuestionId || null,
        questionCode: questionCode || null,
        sectionId: sectionId || null,
        instanceNumber: instanceNumber || 1
      });

      const data = result.data || result;
      
      console.log('[V3_PROBING][ENGINE_RESPONSE]', {
        ok: data.ok,
        nextAction: data.nextAction,
        hasPrompt: !!data.nextPrompt,
        errorCode: data.errorCode,
        incidentId: data.incidentId
      });
      
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
        const aiMessage = {
          id: `v3-ai-${Date.now()}`,
          role: "ai",
          content: data.nextPrompt,
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, aiMessage]);
        
        // Log AI follow-up to InterviewTranscript
        const targetFieldId = data.missingFields?.[0]?.field_id || null;
        logAIFollowUp(sessionId, currentIncidentId, categoryId, data.nextPrompt, newProbeCount, targetFieldId);

        // Persist AI message to local transcript
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
        setIsComplete(true);
        setCompletionReason(data.nextAction);
        
        // Determine final incident ID - use engine's if provided, otherwise local
        const finalIncidentId = (data.incidentId && data.incidentId.trim() !== '') ? data.incidentId : incidentId;
        
        // Log completion to InterviewTranscript
        if (data.nextAction === "RECAP") {
          logIncidentCompleted(sessionId, finalIncidentId, categoryId, "RECAP");
        } else {
          logProbingStopped(sessionId, finalIncidentId, categoryId, data.stopReason || "UNKNOWN", newProbeCount);
        }
        
        // ALWAYS generate summary after opener submission - with fallback on failure
        setTimeout(async () => {
          try {
            await base44.functions.invoke('generateV3IncidentSummary', {
              sessionId,
              incidentId: finalIncidentId,
              categoryId
            });
            console.log("[V3_SUMMARY_OK] Saved summary", {
              categoryId,
              finalIncidentId
            });
          } catch (err) {
            console.error("[V3_SUMMARY_FALLBACK] Summary generator failed — saved fallback summary", {
              error: err.message,
              incidentId: finalIncidentId
            });
            
            // Create and save fallback summary directly
            try {
              const session = await base44.entities.InterviewSession.get(sessionId);
              const fallbackSummary = `[Auto-generated] ${categoryLabel || categoryId}: ${openerAnswer?.substring(0, 200) || 'Details provided'}${openerAnswer?.length > 200 ? '...' : ''}`;
              
              const updatedIncidents = (session.incidents || []).map(inc => {
                if (inc.incident_id === finalIncidentId) {
                  return { ...inc, narrative_summary: fallbackSummary };
                }
                return inc;
              });
              
              await base44.entities.InterviewSession.update(sessionId, {
                incidents: updatedIncidents
              });
            } catch (fallbackErr) {
              console.error("[V3_SUMMARY_FALLBACK_ERROR] Could not save fallback", fallbackErr);
            }
          }
        }, 500);

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
      console.error("[V3_PROBING][EXCEPTION] Error calling decision engine:", err);
      console.error("[V3_PROBING][EXCEPTION_DETAILS]", {
        message: err.message,
        name: err.name,
        stack: err.stack
      });
      
      // Show error and allow graceful exit
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
    }
  };

  const handleContinue = () => {
    if (onComplete) {
      onComplete({
        incidentId,
        categoryId,
        completionReason,
        messages
      });
    }
  };

  return (
    <div className="space-y-3">
      {/* V3 Messages - using existing ClearQuest bubble style */}
      {messages.map((msg) => (
        <div key={msg.id}>
          {msg.role === "ai" && (
            <div className="space-y-2 ml-4">
              <div className="bg-purple-900/30 border border-purple-700/50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Bot className="w-4 h-4 text-purple-400" />
                  <span className="text-xs text-purple-400 font-medium">AI Follow-Up (V3)</span>
                  {msg.isCompletion && (
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 ml-auto" />
                  )}
                </div>
                <p className="text-white text-sm leading-relaxed">{msg.content}</p>
              </div>
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

      {isLoading && (
        <div className="ml-4">
          <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-4">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
              <span className="text-sm text-slate-300">Thinking...</span>
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="ml-4">
          <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-4">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
              <span className="text-sm text-slate-300">Thinking...</span>
            </div>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />

      {/* Input Form - shown inline unless complete */}
      {!isComplete && (
        <div className="mt-4">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your response..."
              className="flex-1 bg-slate-800/50 border-slate-600 text-white placeholder:text-slate-400"
              disabled={isLoading}
              autoFocus
            />
            <Button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </form>
        </div>
      )}

      {/* Continue button after completion */}
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