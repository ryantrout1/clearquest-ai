import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Shield, Send, Loader2, Pause, AlertCircle, Check, X, ArrowRight } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import MessageBubble from "../components/interview/MessageBubble";
import CategoryProgress from "../components/interview/CategoryProgress";

export default function Interview() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('session');

  const [session, setSession] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showQuickButtons, setShowQuickButtons] = useState(false);
  const [showContinueButton, setShowContinueButton] = useState(false);
  const [showWelcomeMessage, setShowWelcomeMessage] = useState(true);
  const [initStatus, setInitStatus] = useState("Loading session...");
  const [showCategoryProgress, setShowCategoryProgress] = useState(false);
  const [categories, setCategories] = useState([]);
  const [currentCategory, setCurrentCategory] = useState(null);
  const [isInitialOverview, setIsInitialOverview] = useState(false);
  const [isCompletionView, setIsCompletionView] = useState(false);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [firstQuestion, setFirstQuestion] = useState(null);
  
  const messagesEndRef = useRef(null);
  const unsubscribeRef = useRef(null);
  const isConversationActiveRef = useRef(false);
  const hasShownInitialOverviewRef = useRef(false);
  const hasTriggeredAgentRef = useRef(false);
  const isNewSessionRef = useRef(false);
  const lastMessageUpdateRef = useRef(0);
  const placeholderShownRef = useRef(false);

  useEffect(() => {
    if (!sessionId) {
      navigate(createPageUrl("StartInterview"));
      return;
    }
    loadSession();
  }, [sessionId]);

  // Debounced message handling
  useEffect(() => {
    if (messages.length === 0) return;
    
    const now = Date.now();
    if (now - lastMessageUpdateRef.current < 100) return;
    lastMessageUpdateRef.current = now;

    const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');
    
    if (lastAssistantMessage?.content) {
      if (lastAssistantMessage.content.includes('[SHOW_CATEGORY_OVERVIEW]')) {
        setShowContinueButton(true);
        setShowWelcomeMessage(true);
        setShowQuickButtons(false);
        return;
      }
      
      if (lastAssistantMessage.content.includes('[SHOW_CATEGORY_TRANSITION:')) {
        if (!showCategoryProgress) {
          const match = lastAssistantMessage.content.match(/\[SHOW_CATEGORY_TRANSITION:(.*?)\]/);
          if (match) {
            handleCategoryTransition(match[1]);
            return;
          }
        }
      }
      
      if (lastAssistantMessage.content.includes('[SHOW_COMPLETION]')) {
        if (!showCategoryProgress) {
          handleCategoryTransition('complete');
          return;
        }
      }

      if (!showCategoryProgress && !showContinueButton) {
        const content = lastAssistantMessage.content.replace(/\[.*?\]/g, '').toLowerCase();
        const hasQuestion = content.includes('?');
        const isContinuePrompt = /please say.*continue|say.*continue.*ready|ready to proceed/i.test(content);
        setShowQuickButtons(hasQuestion && !isContinuePrompt);
      }
    }
  }, [messages, showCategoryProgress, showContinueButton]);

  const loadSession = async () => {
    try {
      setInitStatus("Loading session...");
      
      // Load session, conversation, and first question in parallel
      const [sessionData, q001Data] = await Promise.all([
        base44.entities.InterviewSession.get(sessionId),
        base44.entities.Question.filter({ question_id: "Q001" }).then(q => q[0])
      ]);
      
      setSession(sessionData);
      
      if (q001Data) {
        setFirstQuestion(q001Data);
        console.log("✅ Loaded Q001:", q001Data.question_text);
      } else {
        console.error("❌ Q001 not found in database");
      }

      if (!sessionData.conversation_id) {
        throw new Error("No conversation linked to this session");
      }

      const conversationData = await base44.agents.getConversation(sessionData.conversation_id);
      setConversation(conversationData);
      
      const existingMessages = conversationData.messages || [];
      setMessages(existingMessages);

      unsubscribeRef.current = base44.agents.subscribeToConversation(
        sessionData.conversation_id,
        (data) => {
          const newMessages = data.messages || [];
          // Don't overwrite placeholder if agent hasn't responded yet
          if (!placeholderShownRef.current || newMessages.length > 1) {
            setMessages(newMessages);
          }
        }
      );

      // Check for new session
      if (existingMessages.length === 0) {
        isNewSessionRef.current = true;
        hasShownInitialOverviewRef.current = true;
        setIsInitialOverview(true);
        setShowCategoryProgress(true);
        setIsLoading(false);
        return;
      }

      // Check for existing overview marker
      if (existingMessages.length > 0) {
        const lastMsg = [...existingMessages].reverse().find(m => m.role === 'assistant');
        if (lastMsg?.content?.includes('[SHOW_CATEGORY_OVERVIEW]')) {
          hasShownInitialOverviewRef.current = true;
          handleCategoryTransition('initial');
        }
      }

      setIsLoading(false);
    } catch (err) {
      console.error("❌ Error loading session:", err);
      setError(`Failed to load interview session: ${err.message}`);
      setIsLoading(false);
    }
  };

  const handleCategoryTransition = useCallback(async (type) => {
    try {
      const [categoriesData, responsesData] = await Promise.all([
        base44.entities.Category.list('display_order'),
        base44.entities.Response.filter({ session_id: sessionId })
      ]);

      const questionsData = await base44.entities.Question.filter({ active: true });

      const categoryProgress = categoriesData.map(cat => {
        const categoryQuestions = questionsData.filter(q => q.category === cat.category_label);
        const answeredInCategory = responsesData.filter(r => 
          categoryQuestions.some(q => q.question_id === r.question_id)
        );

        return {
          ...cat,
          total_questions: categoryQuestions.length,
          answered_questions: answeredInCategory.length
        };
      });

      setCategories(categoryProgress);
      setAnsweredCount(responsesData.length);

      if (type === 'initial') {
        setIsInitialOverview(true);
        setIsCompletionView(false);
        setCurrentCategory(null);
        setShowCategoryProgress(true);
      } else if (type === 'complete') {
        setIsInitialOverview(false);
        setIsCompletionView(true);
        setCurrentCategory(null);
        setShowCategoryProgress(true);
      } else {
        const category = categoriesData.find(cat => cat.category_id === type);
        setCurrentCategory(category);
        setIsInitialOverview(false);
        setIsCompletionView(false);
        setShowCategoryProgress(true);
      }
    } catch (err) {
      console.error("Error refreshing category progress:", err);
    }
  }, [sessionId]);

  const handleContinueFromProgress = async () => {
    setShowCategoryProgress(false);
    setIsInitialOverview(false);
    setIsCompletionView(false);
    setCurrentCategory(null);

    if (isCompletionView) {
      navigate(createPageUrl("InterviewDashboard"));
      return;
    }

    // For new sessions, show Q001 immediately from cache
    if (isNewSessionRef.current && firstQuestion && !hasTriggeredAgentRef.current) {
      console.log("🚀 Showing Q001 immediately:", firstQuestion.question_text);
      
      // Add Q001 message immediately
      const placeholderMessage = {
        role: 'assistant',
        content: `Q001: ${firstQuestion.question_text}`,
        tool_calls: [],
        created_at: new Date().toISOString()
      };
      
      placeholderShownRef.current = true;
      setMessages([placeholderMessage]);
      setShowQuickButtons(true);
      
      // Send to agent in background (non-blocking)
      if (conversation) {
        hasTriggeredAgentRef.current = true;
        isNewSessionRef.current = false;
        
        // Small delay to ensure UI updates first
        setTimeout(() => {
          base44.agents.addMessage(conversation, {
            role: "user",
            content: "Start with Q001"
          }).then(() => {
            placeholderShownRef.current = false;
          }).catch(err => {
            console.error("❌ Error sending to agent:", err);
            setError("Failed to start interview");
            placeholderShownRef.current = false;
          });
        }, 100);
      }
      return;
    }

    if (conversation) {
      try {
        setIsSending(true);
        isConversationActiveRef.current = true;
        
        await base44.agents.addMessage(conversation, {
          role: "user",
          content: "Continue"
        });
      } catch (err) {
        console.error("❌ Error sending message:", err);
        setError("Failed to continue interview");
      } finally {
        setIsSending(false);
        setTimeout(() => {
          isConversationActiveRef.current = false;
        }, 500);
      }
    }
  };

  const handleContinueFromWelcome = async () => {
    setShowContinueButton(false);
    setShowWelcomeMessage(false);
    
    if (conversation && !isSending && !isConversationActiveRef.current) {
      try {
        setIsSending(true);
        isConversationActiveRef.current = true;
        
        await base44.agents.addMessage(conversation, {
          role: "user",
          content: "Continue"
        });
      } catch (err) {
        console.error("❌ Error sending continue:", err);
        setError("Failed to continue. Please try again.");
      } finally {
        setIsSending(false);
        setTimeout(() => {
          isConversationActiveRef.current = false;
        }, 500);
      }
    }
  };

  const handleSend = async (messageText = null) => {
    const textToSend = messageText || input.trim();
    if (!textToSend || isSending || !conversation) return;

    if (!messageText) {
      setInput("");
    }
    setIsSending(true);
    setError(null);
    setShowQuickButtons(false);
    setShowContinueButton(false);
    isConversationActiveRef.current = true;

    try {
      await base44.agents.addMessage(conversation, {
        role: "user",
        content: textToSend
      });
    } catch (err) {
      console.error("Error sending message:", err);
      setError("Failed to send message. Please try again.");
      isConversationActiveRef.current = false;
    } finally {
      setIsSending(false);
      setTimeout(() => {
        isConversationActiveRef.current = false;
      }, 300);
    }
  };

  const handleEditResponse = async (message, newAnswer) => {
    if (!conversation || isSending) return;
    
    setIsSending(true);
    setError(null);
    
    try {
      await base44.agents.addMessage(conversation, {
        role: "user",
        content: `I want to change my previous answer to: ${newAnswer}`
      });
    } catch (err) {
      console.error("Error editing response:", err);
      setError("Failed to update answer. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  const handleQuickResponse = (response) => {
    handleSend(response);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleSend();
  };

  const handlePause = async () => {
    try {
      await base44.entities.InterviewSession.update(sessionId, {
        status: "paused"
      });
      navigate(createPageUrl("AdminDashboard"));
    } catch (err) {
      console.error("Error pausing session:", err);
    }
  };

  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages.length]);

  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-md">
          <Loader2 className="w-12 h-12 text-blue-400 animate-spin mx-auto" />
          <p className="text-slate-300">{initStatus}</p>
          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md space-y-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button onClick={() => navigate(createPageUrl("StartInterview"))} className="w-full">
            Start New Interview
          </Button>
        </div>
      </div>
    );
  }

  if (showCategoryProgress) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <CategoryProgress
          categories={categories}
          currentCategory={currentCategory}
          onContinue={handleContinueFromProgress}
          isInitial={isInitialOverview}
          isComplete={isCompletionView}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-800/95 backdrop-blur-sm border-b border-slate-700 px-4 py-3">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 md:w-6 md:h-6 text-blue-400 flex-shrink-0" />
              <div>
                <h1 className="text-sm md:text-lg font-semibold text-white">ClearQuest Interview</h1>
                <p className="text-xs md:text-sm text-slate-400 mt-0.5">
                  {session?.current_category || 'Applications with Other LE Agencies'}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePause}
              className="border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700 bg-transparent flex-shrink-0 text-xs md:text-sm"
            >
              <Pause className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" />
              Pause
            </Button>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto pb-6">
        <div className="max-w-5xl mx-auto px-4 pt-6 space-y-6">
          {messages.length === 0 ? (
            <div className="text-center py-12 space-y-4">
              <Shield className="w-16 h-16 text-blue-400 mx-auto opacity-50 animate-pulse" />
              <p className="text-slate-400">Waiting for AI interviewer to start...</p>
            </div>
          ) : (
            messages
              .filter(message => message.content && message.content.trim() !== '')
              .map((message, index) => (
                <MessageBubble 
                  key={`${message.role}-${index}-${message.content?.substring(0, 20)}`}
                  message={message} 
                  onEditResponse={handleEditResponse}
                  showWelcome={showWelcomeMessage}
                />
              ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="bg-slate-800/80 backdrop-blur-sm border-t border-slate-700 px-4 py-6">
        <div className="max-w-5xl mx-auto">
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          {showContinueButton ? (
            <Button
              onClick={handleContinueFromWelcome}
              disabled={isSending}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white h-14 text-lg"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  Continue to Questions
                  <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>
          ) : showQuickButtons && !isSending ? (
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => handleQuickResponse("Yes")}
                className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2 flex-1 min-w-[140px]"
                size="lg"
              >
                <Check className="w-5 h-5" />
                Yes
              </Button>
              <Button
                onClick={() => handleQuickResponse("No")}
                className="bg-red-600 hover:bg-red-700 text-white flex items-center gap-2 flex-1 min-w-[140px]"
                size="lg"
              >
                <X className="w-5 h-5" />
                No
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex gap-3">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your response..."
                className="flex-1 bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
                disabled={isSending}
              />
              <Button
                type="submit"
                disabled={isSending || !input.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isSending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Send className="w-5 h-5 mr-2" />
                    <span className="font-medium">Send</span>
                  </>
                )}
              </Button>
            </form>
          )}
          
          <p className="text-xs text-slate-500 mt-3 text-center">
            All responses are encrypted and will be reviewed by authorized investigators
          </p>
        </div>
      </div>
    </div>
  );
}