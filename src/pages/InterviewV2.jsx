import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Send, Loader2, Check, X, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  bootstrapEngine,
  createInitialState,
  handlePrimaryAnswer,
  getCurrentPrompt,
  getProgress,
  PERF_MONITOR
} from "../components/interviewEngine";

/**
 * InterviewV2 - Zero-refresh, zero-AI question routing
 * Instant responses, pure deterministic flow
 */
export default function InterviewV2() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('session');

  // Core state
  const [interviewState, setInterviewState] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [input, setInput] = useState("");
  const [debugInfo, setDebugInfo] = useState(null);

  // Refs
  const transcriptRef = useRef(null);
  const isCommittingRef = useRef(false);

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
      console.log('🚀 Initializing deterministic interview engine...');
      const startTime = performance.now();

      // Step 1: Load session
      console.log('📋 Step 1: Loading session...');
      const session = await base44.entities.InterviewSession.get(sessionId);
      console.log('✅ Session loaded:', session.session_code);
      
      // Step 2: Bootstrap engine (loads questions, caches lookups)
      console.log('⚙️ Step 2: Bootstrapping engine...');
      const engine = await bootstrapEngine(base44);
      console.log(`✅ Engine bootstrapped: ${engine.TotalQuestions} questions loaded`);
      
      // Step 3: Create initial state
      console.log('🎯 Step 3: Creating initial state...');
      const initialState = createInitialState(engine);
      console.log('✅ Initial state created, starting at:', initialState.currentQuestionId);
      
      setInterviewState(initialState);
      setIsLoading(false);
      setDebugInfo({
        sessionCode: session.session_code,
        totalQuestions: engine.TotalQuestions,
        firstQuestion: initialState.currentQuestionId
      });

      const elapsed = performance.now() - startTime;
      console.log(`✅ Interview ready in ${elapsed.toFixed(2)}ms`);

    } catch (err) {
      console.error('❌ Initialization failed:', err);
      console.error('Error stack:', err.stack);
      
      // Detailed error for debugging
      let errorMsg = `Failed to load interview: ${err.message}`;
      
      if (err.message?.includes('Question')) {
        errorMsg += '\n\n💡 Tip: Make sure Question entities exist in the database.';
      }
      
      setError(errorMsg);
      setDebugInfo({
        error: err.message,
        stack: err.stack
      });
      setIsLoading(false);
    }
  };

  // ============================================================================
  // AUTO-SCROLL (requestAnimationFrame)
  // ============================================================================

  const autoScrollToBottom = useCallback(() => {
    if (!transcriptRef.current) return;
    
    requestAnimationFrame(() => {
      if (transcriptRef.current) {
        transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
      }
    });
  }, []);

  // Auto-scroll after transcript updates
  useEffect(() => {
    if (interviewState?.transcript.length) {
      autoScrollToBottom();
    }
  }, [interviewState?.transcript.length, autoScrollToBottom]);

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

    console.log(`📝 Answer: "${value}"`);

    try {
      // RULE: Process answer deterministically (NO AI)
      const newState = handlePrimaryAnswer(interviewState, value);
      
      // RULE: Single state commit
      setInterviewState(newState);
      
      // Reset commit guard
      isCommittingRef.current = false;

      // RULE: Auto-scroll after commit
      setTimeout(autoScrollToBottom, 50);

      // RULE: Save to DB async (non-blocking, no UI impact)
      saveAnswerToDatabase(interviewState.currentQuestionId, value).catch(err => {
        console.error('⚠️ Database save failed (non-fatal):', err);
      });

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
      
      await base44.entities.Response.create({
        session_id: sessionId,
        question_id: questionId,
        question_text: question.question_text,
        category: question.category,
        answer: answer,
        triggered_followup: false,
        response_timestamp: new Date().toISOString()
      });

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
  // RENDER
  // ============================================================================

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-blue-400 animate-spin mx-auto" />
          <p className="text-slate-300">Loading interview engine...</p>
          {debugInfo && (
            <div className="text-xs text-slate-500 space-y-1">
              <p>Session: {debugInfo.sessionCode}</p>
              <p>Questions: {debugInfo.totalQuestions}</p>
            </div>
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
          {debugInfo?.stack && (
            <details className="text-xs text-slate-400 bg-slate-900/50 p-4 rounded">
              <summary className="cursor-pointer">Debug Info</summary>
              <pre className="mt-2 overflow-auto">{debugInfo.stack}</pre>
            </details>
          )}
          <Button onClick={() => navigate(createPageUrl("StartInterview"))} className="w-full">
            Start New Interview
          </Button>
        </div>
      </div>
    );
  }

  if (!interviewState) return null;

  const currentPrompt = getCurrentPrompt(interviewState);
  const progress = getProgress(interviewState);
  const isYesNoQuestion = currentPrompt?.responseType === 'yes_no';

  return (
    <div className="h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 bg-slate-800/95 backdrop-blur-sm border-b border-slate-700 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-blue-400" />
            <div>
              <h1 className="text-lg font-semibold text-white">ClearQuest Interview</h1>
              <p className="text-sm text-slate-400">
                {currentPrompt?.category || 'Background Screening'}
              </p>
            </div>
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
      </header>

      {/* Transcript Panel (NO RE-MOUNT) */}
      <main 
        ref={transcriptRef}
        className="flex-1 overflow-y-auto"
      >
        <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
          {/* Render transcript history */}
          {interviewState.transcript.map((entry) => (
            <TranscriptEntry key={entry.id} entry={entry} />
          ))}

          {/* Current Question (stays visible while answering) */}
          {currentPrompt && interviewState.transcript.length === 0 && (
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 animate-in fade-in duration-200">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                  <Shield className="w-4 h-4 text-blue-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-blue-400">
                      {currentPrompt.id}
                    </span>
                    <span className="text-xs text-slate-500">•</span>
                    <span className="text-xs text-slate-400">
                      {currentPrompt.category}
                    </span>
                  </div>
                  <p className="text-white text-lg leading-relaxed">
                    {currentPrompt.text}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Prompt Panel (Fixed at Bottom) */}
      <footer className="flex-shrink-0 bg-slate-800/95 backdrop-blur-sm border-t border-slate-700 px-4 py-4">
        <div className="max-w-5xl mx-auto">
          {/* Show current question text at bottom */}
          {currentPrompt && interviewState.transcript.length > 0 && (
            <div className="mb-3 p-3 bg-slate-900/50 rounded-lg border border-slate-700">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-blue-400">{currentPrompt.id}</span>
                <span className="text-xs text-slate-500">•</span>
                <span className="text-xs text-slate-400">{currentPrompt.category}</span>
              </div>
              <p className="text-white text-sm">{currentPrompt.text}</p>
            </div>
          )}

          {isYesNoQuestion ? (
            <div className="flex gap-3">
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
            <form onSubmit={handleTextSubmit} className="flex gap-3">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your response..."
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
          
          <p className="text-xs text-slate-400 text-center mt-3">
            ⚡ Instant responses • Zero AI routing • All data encrypted
          </p>
        </div>
      </footer>
    </div>
  );
}

// ============================================================================
// TRANSCRIPT ENTRY COMPONENT
// ============================================================================

function TranscriptEntry({ entry }) {
  if (entry.type === 'question') {
    return (
      <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-5 animate-in fade-in slide-in-from-bottom-2 duration-200">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0">
            <Shield className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-semibold text-blue-400">
                {entry.questionId}
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

  return null;
}