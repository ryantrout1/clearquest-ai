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
        latestAnswerText: answer
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
    <div className="bg-gradient-to-br from-emerald-900/20 to-slate-900/40 border border-emerald-600/30 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-emerald-900/40 border-b border-emerald-700/30 px-4 py-2">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-medium text-emerald-300">AI Follow-Up (V3)</span>
          {isComplete && (
            <span className="ml-auto text-xs text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Complete
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="max-h-80 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-4 py-2.5 ${
                msg.role === "user"
                  ? "bg-blue-600 text-white"
                  : msg.isCompletion
                  ? "bg-emerald-600/30 border border-emerald-500/40 text-emerald-100"
                  : msg.isError
                  ? "bg-red-900/30 border border-red-700/40 text-red-200"
                  : "bg-slate-700/60 text-slate-100"
              }`}
            >
              <div className="flex items-start gap-2">
                {msg.role === "ai" && !msg.isCompletion && (
                  <Bot className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                )}
                {msg.isCompletion && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                )}
                <p className="text-sm leading-relaxed">{msg.content}</p>
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-700/60 rounded-xl px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                <span className="text-sm text-slate-300">Thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input or Continue Button */}
      <div className="border-t border-emerald-700/30 p-3 bg-slate-900/50">
        {isComplete ? (
          <Button
            onClick={handleContinue}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            Continue to Next Question
          </Button>
        ) : (
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your response..."
              className="flex-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-400"
              disabled={isLoading}
            />
            <Button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}