
import React, { useState, useEffect, useRef } from "react";
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
  const [showWelcomeMessage, setShowWelcomeMessage] = useState(true); // NEW: Track if welcome should be visible
  const [initStatus, setInitStatus] = useState("Loading session...");
  const [showCategoryProgress, setShowCategoryProgress] = useState(false);
  const [categories, setCategories] = useState([]);
  const [currentCategory, setCurrentCategory] = useState(null);
  const [isInitialOverview, setIsInitialOverview] = useState(false);
  const [isCompletionView, setIsCompletionView] = useState(false);
  
  // Cache questions and categories - load once
  const [allQuestions, setAllQuestions] = useState([]);
  const [allCategories, setAllCategories] = useState([]);
  
  // Track actual answered question count from responses
  const [answeredCount, setAnsweredCount] = useState(0);
  
  const messagesEndRef = useRef(null);
  const unsubscribeRef = useRef(null);
  const isConversationActiveRef = useRef(false);
  const lastRefreshRef = useRef(0);
  const lastMessageCountRef = useRef(0); // NEW: Track message count to prevent unnecessary updates
  
  const hasShownInitialOverviewRef = useRef(false);
  const hasTriggeredAgentRef = useRef(false);
  const isNewSessionRef = useRef(false);

  useEffect(() => {
    if (!sessionId) {
      navigate(createPageUrl("StartInterview"));
      return;
    }
    loadSession();
  }, [sessionId]);

  useEffect(() => {
    // CRITICAL: Check for markers and handle them
    if (messages.length > 0) {
      const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');
      
      if (lastAssistantMessage?.content) {
        console.log("📨 Last assistant message:", lastAssistantMessage.content.substring(0, 100));
        
        // Check for welcome message with overview marker - show Continue button
        if (lastAssistantMessage.content.includes('[SHOW_CATEGORY_OVERVIEW]')) {
          console.log("🎯 Detected [SHOW_CATEGORY_OVERVIEW] - showing Continue button");
          setShowContinueButton(true);
          setShowWelcomeMessage(true); // Show welcome while button is visible
          setShowQuickButtons(false);
          return;
        }
        
        if (lastAssistantMessage.content.includes('[SHOW_CATEGORY_TRANSITION:')) {
          if (!showCategoryProgress) {
            const match = lastAssistantMessage.content.match(/\[SHOW_CATEGORY_TRANSITION:(.*?)\]/);
            if (match) {
              console.log("🎯 Detected category transition:", match[1]);
              handleCategoryTransition(match[1]);
              return;
            }
          }
        }
        
        if (lastAssistantMessage.content.includes('[SHOW_COMPLETION]')) {
          if (!showCategoryProgress) {
            console.log("🎯 Detected completion marker");
            handleCategoryTransition('complete');
            return;
          }
        }
      }
    }
  }, [messages, showCategoryProgress]);

  useEffect(() => {
    // This useEffect handles UI state (quick buttons, etc.) - runs AFTER marker detection
    if (showCategoryProgress || showContinueButton) {
      return;
    }
    
    if (messages.length > 0) {
      const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');
      
      if (lastAssistantMessage?.content) {
        // Remove any markers from content before checking for yes/no patterns
        const content = lastAssistantMessage.content.replace(/\[.*?\]/g, '').toLowerCase();

        // Check if message is asking a Yes/No question
        const hasQuestion = content.includes('?');
        
        // Exclude meta/continuation prompts
        const isContinuePrompt = /please say.*continue|say.*continue.*ready|ready to proceed/i.test(content);
        
        setShowQuickButtons(hasQuestion && !isContinuePrompt);
      } else {
        setShowQuickButtons(false);
      }
    }
  }, [messages, allCategories, showCategoryProgress, showContinueButton]);

  const loadSession = async () => {
    try {
      setInitStatus("Loading session data...");
      const sessionData = await base44.entities.InterviewSession.get(sessionId);
      setSession(sessionData);

      if (!sessionData.conversation_id) {
        throw new Error("No conversation linked to this session");
      }

      setInitStatus("Loading conversation...");
      const conversationData = await base44.agents.getConversation(sessionData.conversation_id);
      setConversation(conversationData);
      
      const existingMessages = conversationData.messages || [];
      console.log("📨 Loaded conversation with", existingMessages.length, "messages");
      
      setMessages(existingMessages);
      lastMessageCountRef.current = existingMessages.length; // Track initial count

      setInitStatus("Loading questions and categories...");
      await loadAllQuestionsAndCategories();

      const responses = await base44.entities.Response.filter({ session_id: sessionId });
      setAnsweredCount(responses.length);
      console.log("📊 Response count:", responses.length);

      setInitStatus("Setting up real-time updates...");
      unsubscribeRef.current = base44.agents.subscribeToConversation(
        sessionData.conversation_id,
        (data) => {
          const newMessages = data.messages || [];
          
          // Only update if message count actually changed
          if (newMessages.length !== lastMessageCountRef.current) {
            console.log("📨 New message detected:", newMessages.length, "total");
            lastMessageCountRef.current = newMessages.length;
            setMessages(newMessages);
            
            // Smooth scroll to bottom
            setTimeout(() => {
              messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
            }, 100);
          }
          
          // Throttle session refresh to avoid excessive updates
          const now = Date.now();
          if (now - lastRefreshRef.current > 3000) { // Increased from 2s to 3s
            lastRefreshRef.current = now;
            refreshSessionData();
          }
        }
      );

      // CRITICAL FIX: If this is a brand new session (0 responses, empty conversation)
      // Show the category overview IMMEDIATELY and DON'T trigger agent yet
      if (responses.length === 0 && existingMessages.length === 0) {
        console.log("🎯 NEW SESSION DETECTED - showing overview immediately");
        console.log("⏸️ Agent will be triggered when user clicks 'Begin Interview'");
        isNewSessionRef.current = true;
        hasShownInitialOverviewRef.current = true;
        setIsInitialOverview(true);
        setShowCategoryProgress(true);
        setIsLoading(false);
        return;
      }

      // For existing sessions, check if we need to trigger agent
      if (existingMessages.length > 0) {
        const lastMsg = [...existingMessages].reverse().find(m => m.role === 'assistant');
        if (lastMsg?.content?.includes('[SHOW_CATEGORY_OVERVIEW]')) {
          console.log("🎯 Found [SHOW_CATEGORY_OVERVIEW] in existing messages");
          hasShownInitialOverviewRef.current = true;
          handleCategoryTransition('initial');
        }
      } else if (!hasTriggeredAgentRef.current) {
        // Conversation exists but is empty - this is a resumed session, trigger agent
        console.log("🚀 Empty conversation on resumed session - triggering agent");
        hasTriggeredAgentRef.current = true;
        setTimeout(async () => {
          try {
            await base44.agents.addMessage(conversationData, {
              role: "user",
              content: "Ready to begin"
            });
            console.log("✅ Initial message sent to agent");
          } catch (err) {
            console.error("❌ Error triggering agent:", err);
            setError("Failed to start interview. Please refresh the page.");
          }
        }, 500);
      }

      setIsLoading(false);
    } catch (err) {
      console.error("❌ Error loading session:", err);
      setError(`Failed to load interview session: ${err.message}`);
      setIsLoading(false);
    }
  };

  const refreshSessionData = async () => {
    try {
      const [sessionData, responses] = await Promise.all([
        base44.entities.InterviewSession.get(sessionId),
        base44.entities.Response.filter({ session_id: sessionId })
      ]);
      setSession(sessionData);
      setAnsweredCount(responses.length);
      
      if (allCategories.length > 0 && allQuestions.length > 0) {
        updateCategoryProgressOptimized(responses);
      }
    } catch (err) {
      console.error("Error refreshing session:", err);
    }
  };

  const loadAllQuestionsAndCategories = async () => {
    try {
      const [categoriesData, questionsData, responsesData] = await Promise.all([
        base44.entities.Category.list('display_order'),
        base44.entities.Question.filter({ active: true }),
        base44.entities.Response.filter({ session_id: sessionId })
      ]);

      setAllCategories(categoriesData);
      setAllQuestions(questionsData);

      updateCategoryProgress(categoriesData, questionsData, responsesData);
    } catch (err) {
      console.error("Error loading questions and categories:", err);
    }
  };

  const updateCategoryProgressOptimized = (responses) => {
    const categoryProgress = allCategories.map(cat => {
      const categoryQuestions = allQuestions.filter(q => q.category === cat.category_label);
      const answeredInCategory = responses.filter(r => 
        categoryQuestions.some(q => q.question_id === r.question_id)
      );

      return {
        ...cat,
        total_questions: categoryQuestions.length,
        answered_questions: answeredInCategory.length
      };
    });

    setCategories(categoryProgress);
  };

  const updateCategoryProgress = async (categoriesData = null, questionsData = null, responsesData = null) => {
    try {
      const cats = categoriesData || allCategories;
      const questions = questionsData || allQuestions;
      const responses = responsesData || await base44.entities.Response.filter({ session_id: sessionId });

      const categoryProgress = cats.map(cat => {
        const categoryQuestions = questions.filter(q => q.category === cat.category_label);
        const answeredInCategory = responses.filter(r => 
          categoryQuestions.some(q => q.question_id === r.question_id)
        );

        return {
          ...cat,
          total_questions: categoryQuestions.length,
          answered_questions: answeredInCategory.length
        };
      });

      setCategories(categoryProgress);
    } catch (err) {
      console.error("Error updating category progress:", err);
    }
  };

  const handleCategoryTransition = async (type) => {
    console.log("🔄 handleCategoryTransition called with type:", type);
    
    try {
      // Force a fresh fetch of all data
      const [categoriesData, questionsData, responsesData] = await Promise.all([
        base44.entities.Category.list('display_order'),
        base44.entities.Question.filter({ active: true }),
        base44.entities.Response.filter({ session_id: sessionId })
      ]);

      console.log("📊 Responses fetched:", responsesData.length);
      console.log("📋 Categories fetched:", categoriesData.length);
      console.log("❓ Questions fetched:", questionsData.length);

      const categoryProgress = categoriesData.map(cat => {
        const categoryQuestions = questionsData.filter(q => q.category === cat.category_label);
        const answeredInCategory = responsesData.filter(r => 
          categoryQuestions.some(q => q.question_id === r.question_id)
        );

        console.log(`📦 ${cat.category_label}: ${answeredInCategory.length}/${categoryQuestions.length} answered`);

        return {
          ...cat,
          total_questions: categoryQuestions.length,
          answered_questions: answeredInCategory.length
        };
      });

      setCategories(categoryProgress);
      setAnsweredCount(responsesData.length);

      if (type === 'initial') {
        console.log("✅ Setting initial overview state");
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
        console.log("🎯 Setting current category:", category?.category_label);
        setCurrentCategory(category);
        setIsInitialOverview(false);
        setIsCompletionView(false);
        setShowCategoryProgress(true);
      }
    } catch (err) {
      console.error("Error refreshing category progress:", err);
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
        const category = allCategories.find(cat => cat.category_id === type);
        setCurrentCategory(category);
        setIsInitialOverview(false);
        setIsCompletionView(false);
        setShowCategoryProgress(true);
      }
    }
  };

  const handleContinueFromProgress = async () => {
    console.log("▶️ handleContinueFromProgress called");
    console.log("🔍 isNewSessionRef.current:", isNewSessionRef.current);
    
    setShowCategoryProgress(false);
    setIsInitialOverview(false);
    setIsCompletionView(false);
    setCurrentCategory(null);

    if (isCompletionView) {
      navigate(createPageUrl("InterviewDashboard"));
      return;
    }

    if (conversation) {
      try {
        setIsSending(true);
        isConversationActiveRef.current = true;
        
        // For brand new sessions, send "Start Q001" to skip welcome and go straight to questions
        if (isNewSessionRef.current && !hasTriggeredAgentRef.current) {
          console.log("🚀 NEW SESSION - Sending 'Start with Q001' to skip welcome");
          hasTriggeredAgentRef.current = true;
          await base44.agents.addMessage(conversation, {
            role: "user",
            content: "Start with Q001"
          });
          isNewSessionRef.current = false;
        } else {
          console.log("📤 Sending 'Continue' message to agent");
          await base44.agents.addMessage(conversation, {
            role: "user",
            content: "Continue"
          });
        }
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
    console.log("▶️ User clicked Continue on welcome message");
    setShowContinueButton(false);
    setShowWelcomeMessage(false); // Hide welcome message after user clicks Continue
    
    if (conversation && !isSending && !isConversationActiveRef.current) {
      try {
        setIsSending(true);
        isConversationActiveRef.current = true;
        
        console.log("📤 Sending 'Continue' to agent");
        await base44.agents.addMessage(conversation, {
          role: "user",
          content: "Continue"
        });
        console.log("✅ Continue sent successfully");
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
      
      await refreshSessionData();
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  useEffect(() => {
    // Only scroll when messages actually change
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages.length]); // Changed dependency to messages.length instead of messages

  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  const getCurrentCategoryProgress = () => {
    if (!session?.current_category || categories.length === 0) return 0;
    const currentCat = categories.find(cat => cat.category_label === session.current_category);
    if (!currentCat || currentCat.total_questions === 0) return 0;
    return Math.round((currentCat.answered_questions / currentCat.total_questions) * 100);
  };

  const getOverallProgress = () => {
    return Math.round((answeredCount / 162) * 100);
  };

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
          <p className="text-xs text-slate-500 mt-4">
            If this takes more than 30 seconds, please refresh the page
          </p>
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
    console.log("📊 Rendering CategoryProgress component");
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

  console.log("💬 Rendering main interview UI");
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
              <p className="text-xs text-slate-500">This should only take a few seconds</p>
            </div>
          ) : (
            messages
              .filter(message => message.content && message.content.trim() !== '')
              .map((message, index) => (
                <MessageBubble 
                  key={index} 
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
