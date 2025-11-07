
import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Shield, Send, Loader2, Pause, AlertCircle, Check, X } from "lucide-react";
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
  const [initStatus, setInitStatus] = useState("Loading session...");
  const [showCategoryProgress, setShowCategoryProgress] = useState(false);
  const [categories, setCategories] = useState([]);
  const [currentCategory, setCurrentCategory] = useState(null);
  const [isInitialOverview, setIsInitialOverview] = useState(false);
  const [isCompletionView, setIsCompletionView] = useState(false);
  
  const messagesEndRef = useRef(null);
  const unsubscribeRef = useRef(null);

  useEffect(() => {
    if (!sessionId) {
      navigate(createPageUrl("StartInterview"));
      return;
    }
    loadSession();
  }, [sessionId]);

  useEffect(() => {
    // Check if we should show quick response buttons or category transitions
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant' && lastMessage.content) {
        // Check for category transition triggers - MUST check before other logic
        if (lastMessage.content.includes('[SHOW_CATEGORY_OVERVIEW]')) {
          handleCategoryTransition('initial');
          return;
        }
        if (lastMessage.content.includes('[SHOW_CATEGORY_TRANSITION:')) {
          const match = lastMessage.content.match(/\[SHOW_CATEGORY_TRANSITION:(.*?)\]/);
          if (match) {
            handleCategoryTransition(match[1]);
          }
          return;
        }
        if (lastMessage.content.includes('[SHOW_COMPLETION]')) {
          handleCategoryTransition('complete');
          return;
        }

        // Also detect category transitions from text patterns (backup detection)
        const cleanContent = lastMessage.content.toLowerCase();
        if (cleanContent.includes('moving to the next section') || 
            cleanContent.includes("we're now moving to")) {
          // Try to extract category from the message
          const categoryMatch = lastMessage.content.match(/moving to the next section[.\s]*([^\n]+)/i);
          if (categoryMatch) {
            const categoryName = categoryMatch[1].trim().replace(/\.$/, '');
            // Find matching category by label
            const category = categories.find(cat => 
              cat.category_label.toLowerCase() === categoryName.toLowerCase()
            );
            if (category) {
              handleCategoryTransition(category.category_id);
              return;
            }
          }
        }

        // Remove any markers from content before checking for yes/no patterns
        const content = lastMessage.content.replace(/\[.*?\]/g, '').toLowerCase();

        // Check if message is asking a Yes/No question
        const hasQuestion = content.includes('?');
        
        // More comprehensive yes/no detection
        const mentionsYesNo = /\b(yes|no)\b/i.test(content);
        const isYesNoQuestion = /\b(have you|did you|were you|are you|do you|will you|would you|can you|could you|has|had|was|is)\b/i.test(content);
        
        // Exclude follow-up meta questions that aren't about the actual interview
        const isMetaQuestion = /\b(single|multiple|other incidents?|any other|anything else|continue|ready to proceed)\b/i.test(content);
        
        setShowQuickButtons(hasQuestion && !isMetaQuestion && (mentionsYesNo || isYesNoQuestion));
      } else {
        setShowQuickButtons(false);
      }
    }
  }, [messages, categories]);

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
      setMessages(conversationData.messages || []);

      // Load categories and questions for progress tracking
      await loadCategoryProgress();

      setInitStatus("Setting up real-time updates...");
      unsubscribeRef.current = base44.agents.subscribeToConversation(
        sessionData.conversation_id,
        (data) => {
          setMessages(data.messages || []);
          scrollToBottom();
        }
      );

      // If no messages, send initial greeting and show overview
      if (!conversationData.messages || conversationData.messages.length === 0) {
        setInitStatus("Preparing interview overview...");
        setIsInitialOverview(true);
        setShowCategoryProgress(true);
      }

      setIsLoading(false);
    } catch (err) {
      console.error("Error loading session:", err);
      setError(`Failed to load interview session: ${err.message}`);
      setIsLoading(false);
    }
  };

  const loadCategoryProgress = async () => {
    try {
      const [categoriesData, questionsData, responsesData] = await Promise.all([
        base44.entities.Category.list('display_order'),
        base44.entities.Question.filter({ active: true }),
        base44.entities.Response.filter({ session_id: sessionId })
      ]);

      const categoryProgress = categoriesData.map(cat => {
        // Match questions by category_label (full name) not category_id
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
    } catch (err) {
      console.error("Error loading category progress:", err);
    }
  };

  const handleCategoryTransition = async (type) => {
    await loadCategoryProgress(); // Refresh progress

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
      // Find category by ID
      const category = categories.find(cat => cat.category_id === type);
      setCurrentCategory(category);
      setIsInitialOverview(false);
      setIsCompletionView(false);
      setShowCategoryProgress(true);
    }
  };

  const handleContinueFromProgress = async () => {
    setShowCategoryProgress(false);
    setIsInitialOverview(false);
    setIsCompletionView(false);
    setCurrentCategory(null);

    if (isCompletionView) {
      navigate(createPageUrl("InterviewDashboard"));
      return;
    }

    // Send message to agent to continue
    if (conversation) {
      try {
        setIsSending(true);
        await base44.agents.addMessage(conversation, {
          role: "user",
          content: "Continue"
        });
      } catch (err) {
        console.error("Error sending continue message:", err);
        setError("Failed to continue interview");
      } finally {
        setIsSending(false);
      }
    }
  };

  const sendInitialGreeting = async (conv, sessionData) => {
    try {
      await base44.agents.addMessage(conv, {
        role: "user",
        content: `Ready to begin`
      });
    } catch (err) {
      console.error("Error sending initial greeting:", err);
      setError(`Failed to start interview: ${err.message}`);
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

    try {
      await base44.agents.addMessage(conversation, {
        role: "user",
        content: textToSend
      });
    } catch (err) {
      console.error("Error sending message:", err);
      setError("Failed to send message. Please try again.");
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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
      <div className="bg-slate-800/80 backdrop-blur-sm border-b border-slate-700 px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-blue-400" />
            <div>
              <h1 className="text-lg font-semibold text-white">ClearQuest Interview</h1>
              <p className="text-sm text-slate-400">
                Session: {session?.session_code} • {session?.total_questions_answered || 0} questions answered
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePause}
            className="border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700 bg-transparent"
          >
            <Pause className="w-4 h-4 mr-2" />
            Pause
          </Button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto pb-6">
        <div className="max-w-5xl mx-auto px-4 pt-6 space-y-6">
          {messages.length === 0 ? (
            <div className="text-center py-12 space-y-4">
              <Shield className="w-16 h-16 text-blue-400 mx-auto opacity-50 animate-pulse" />
              <p className="text-slate-400">Waiting for AI interviewer to respond...</p>
              <p className="text-xs text-slate-500">This should only take a few seconds</p>
            </div>
          ) : (
            messages
              .filter(message => message.content && message.content.trim() !== '')
              .map((message, index) => (
                <MessageBubble key={index} message={message} />
              ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area - with more top padding */}
      <div className="bg-slate-800/80 backdrop-blur-sm border-t border-slate-700 px-4 py-6">
        <div className="max-w-5xl mx-auto">
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          {/* Quick Response Buttons */}
          {showQuickButtons && !isSending && (
            <div className="flex flex-wrap gap-3 mb-4">
              <Button
                onClick={() => handleQuickResponse("Yes")}
                className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
                size="lg"
              >
                <Check className="w-5 h-5" />
                Yes
              </Button>
              <Button
                onClick={() => handleQuickResponse("No")}
                className="bg-red-600 hover:bg-red-700 text-white flex items-center gap-2"
                size="lg"
              >
                <X className="w-5 h-5" />
                No
              </Button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex gap-3">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={showQuickButtons ? "Or type your response..." : "Type your response..."}
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
          
          <p className="text-xs text-slate-500 mt-3 text-center">
            All responses are encrypted and will be reviewed by authorized investigators
          </p>
        </div>
      </div>
    </div>
  );
}
