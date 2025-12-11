import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2, Bot, User, CheckCircle2 } from "lucide-react";
import { getOpeningPrompt, getCompletionMessage } from "../utils/v3ProbingPrompts";
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
  onTranscriptUpdate
}) {
  const [incidentId, setIncidentId] = useState(initialIncidentId);
  const [probeCount, setProbeCount] = useState(0);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [completionReason, setCompletionReason] = useState(null);
  const messagesEndRef = useRef(null);
  const hasLoggedOpening = useRef(false);

  // Initial prompt on mount - use centralized template
  useEffect(() => {
    const openingText = getOpeningPrompt(categoryId, categoryLabel);
    const initialMessage = {
      id: `v3-ai-${Date.now()}`,
      role: "ai",
      content: openingText,
      timestamp: new Date().toISOString()
    };
    setMessages([initialMessage]);
    
    // Log to InterviewTranscript entity
    if (!hasLoggedOpening.current) {
      hasLoggedOpening.current = true;
      logAIOpening(sessionId, initialIncidentId, categoryId, openingText);
      if (initialIncidentId) {
        logIncidentCreated(sessionId, initialIncidentId, categoryId);
      }
    }
    
    // Persist to local transcript
    if (onTranscriptUpdate) {
      onTranscriptUpdate({
        type: 'v3_probe_question',
        content: initialMessage.content,
        categoryId,
        incidentId: initialIncidentId,
        timestamp: initialMessage.timestamp
      });
    }
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    const answer = input.trim();
    if (!answer || isLoading || isComplete) return;

    setIsLoading(true);
    setInput("");

    // Add user message immediately
    const userMessage = {
      id: `v3-user-${Date.now()}`,
      role: "user",
      content: answer,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMessage]);

    // Log candidate answer to InterviewTranscript
    logCandidateAnswer(sessionId, incidentId, categoryId, answer, probeCount);

    // Persist user message to local transcript
    if (onTranscriptUpdate) {
      onTranscriptUpdate({
        type: 'v3_probe_answer',
        content: answer,
        categoryId,
        incidentId,
        timestamp: userMessage.timestamp
      });
    }

    try {
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

      // Update incident ID if new one was created
      const currentIncidentId = data.incidentId || incidentId;
      if (data.incidentId && data.incidentId !== incidentId) {
        setIncidentId(data.incidentId);
        // Log new incident creation
        logIncidentCreated(sessionId, data.incidentId, categoryId);
      }
      
      // Update probe count
      const newProbeCount = probeCount + 1;
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
        
        // Log completion to InterviewTranscript
        if (data.nextAction === "RECAP") {
          logIncidentCompleted(sessionId, currentIncidentId, categoryId, "RECAP");
        } else {
          logProbingStopped(sessionId, currentIncidentId, categoryId, data.stopReason || "UNKNOWN", newProbeCount);
        }
        
        // Trigger incident summary generation (fire and forget)
        base44.functions.invoke('generateV3IncidentSummary', {
          sessionId,
          incidentId: currentIncidentId,
          categoryId
        }).catch(err => console.warn("[V3] Failed to trigger incident summary:", err));

        // Persist completion to local transcript
        if (onTranscriptUpdate) {
          onTranscriptUpdate({
            type: 'v3_probe_complete',
            content: completionMessage,
            categoryId,
            incidentId: currentIncidentId,
            nextAction: data.nextAction,
            timestamp: aiMessage.timestamp
          });
        }
      }
    } catch (err) {
      console.error("[V3 PROBING] Error calling decision engine:", err);
      
      // Show error and allow retry
      const errorMessage = {
        id: `v3-error-${Date.now()}`,
        role: "ai",
        content: "I apologize, there was an issue processing your response. Please try again.",
        isError: true,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
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