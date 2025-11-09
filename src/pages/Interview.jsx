import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [showCategoryProgress, setShowCategoryProgress] = useState(false);
  const [categories, setCategories] = useState([]);
  const [isCompletionView, setIsCompletionView] = useState(false);
  
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const footerRef = useRef(null);
  const unsubscribeRef = useRef(null);
  const hasTriggeredAgentRef = useRef(false);
  const lastMessageCountRef = useRef(0);
  const lastMessageContentRef = useRef('');
  const shouldAutoScrollRef = useRef(true); // Track if we should auto-scroll
  const userJustSentMessageRef = useRef(false); // Track if user just sent a message

  useEffect(() => {
    if (!sessionId) {
      navigate(createPageUrl("StartInterview"));
      return;
    }
    loadSession();
    
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [sessionId]);

  // Measure footer height and set CSS variable
  useEffect(() => {
    const updateFooterHeight = () => {
      if (footerRef.current) {
        const height = footerRef.current.offsetHeight;
        document.documentElement.style.setProperty('--footer-h', `${height}px`);
      }
    };

    updateFooterHeight();
    window.addEventListener('resize', updateFooterHeight);
    const timer = setTimeout(updateFooterHeight, 100);

    return () => {
      window.removeEventListener('resize', updateFooterHeight);
      clearTimeout(timer);
    };
  }, [showQuickButtons, error]);

  // Monitor user scroll to detect manual scrolling
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      // Check if user is near bottom
      const threshold = 200;
      const position = container.scrollTop + container.clientHeight;
      const bottom = container.scrollHeight;
      const nearBottom = bottom - position < threshold;
      
      // Update auto-scroll flag based on scroll position
      shouldAutoScrollRef.current = nearBottom;
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Force scroll to bottom - simple and reliable
  const forceScrollToBottom = useCallback(() => {
    if (!messagesContainerRef.current) return;
    
    const container = messagesContainerRef.current;
    
    // Use requestAnimationFrame to ensure DOM is painted
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth'
        });
      });
    });
  }, []);

  // Instant scroll to bottom (no animation)
  const instantScrollToBottom = useCallback(() => {
    if (!messagesContainerRef.current) return;
    
    const container = messagesContainerRef.current;
    container.scrollTop = container.scrollHeight;
  }, []);

  // Handle message updates and auto-scroll
  useEffect(() => {
    const newMessageCount = messages.length;
    
    // No messages yet, nothing to do
    if (newMessageCount === 0) return;
    
    // Messages added
    if (newMessageCount > lastMessageCountRef.current) {
      const messagesAdded = newMessageCount - lastMessageCountRef.current;
      lastMessageCountRef.current = newMessageCount;
      
      console.log(`📨 ${messagesAdded} new message(s) - User just sent: ${userJustSentMessageRef.current}, Auto-scroll: ${shouldAutoScrollRef.current}`);
      
      // Always scroll if user just sent a message (they expect to see response)
      // OR if auto-scroll is enabled (user is at bottom)
      if (userJustSentMessageRef.current || shouldAutoScrollRef.current) {
        // Longer delay to ensure DOM is fully rendered with new messages
        setTimeout(() => {
          forceScrollToBottom();
          console.log('✅ Auto-scrolled to bottom');
        }, 150);
        
        // Reset the flag after scrolling
        if (userJustSentMessageRef.current) {
          setTimeout(() => {
            userJustSentMessageRef.current = false;
          }, 200);
        }
      } else {
        console.log('⏸️ User scrolled up - not auto-scrolling');
      }
    }
  }, [messages, forceScrollToBottom]);

  // Optimized message state updates
  useEffect(() => {
    if (messages.length === 0) return;

    const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');
    
    if (!lastAssistantMessage?.content) return;

    // Check for completion
    if (lastAssistantMessage.content.includes('[SHOW_COMPLETION]')) {
      if (!showCategoryProgress) {
        handleCompletion();
      }
      return;
    }

    // Show quick buttons for questions (only if not in special view)
    if (!showCategoryProgress) {
      const content = lastAssistantMessage.content.replace(/\[.*?\]/g, '').toLowerCase();
      const hasQuestion = content.includes('?');
      setShowQuickButtons(hasQuestion);
    }
  }, [messages, showCategoryProgress]);

  const loadSession = async () => {
    try {
      // Load session and Q001 in parallel for instant start
      const [sessionData, q001Data] = await Promise.all([
        base44.entities.InterviewSession.get(sessionId),
        base44.entities.Question.filter({ question_id: "Q001" }).then(q => q[0])
      ]);
      
      setSession(sessionData);

      if (!sessionData.conversation_id) {
        throw new Error("No conversation linked to this session");
      }

      // Load conversation
      const conversationData = await base44.agents.getConversation(sessionData.conversation_id);
      setConversation(conversationData);
      
      const existingMessages = conversationData.messages || [];

      // OPTIMIZED SUBSCRIPTION - Only update when truly necessary
      unsubscribeRef.current = base44.agents.subscribeToConversation(
        sessionData.conversation_id,
        (data) => {
          const newMessages = data.messages || [];
          
          // Check if messages actually changed
          const newCount = newMessages.length;
          const lastContent = newMessages[newCount - 1]?.content || '';
          
          // Only update if message count changed OR last message content changed (streaming)
          if (newCount !== lastMessageCountRef.current || lastContent !== lastMessageContentRef.current) {
            lastMessageContentRef.current = lastContent;
            
            setMessages(newMessages);
          }
        }
      );

      // Handle new session - show Q001 immediately
      if (existingMessages.length === 0 && q001Data) {
        console.log("✅ New session - showing Q001 immediately");
        
        // Create stable placeholder message with unique ID
        const q001Message = {
          id: 'q001-initial',
          role: 'assistant',
          content: `Q001: ${q001Data.question_text}`,
          tool_calls: [],
          created_at: new Date().toISOString()
        };
        
        setMessages([q001Message]);
        lastMessageCountRef.current = 1;
        lastMessageContentRef.current = q001Message.content;
        shouldAutoScrollRef.current = true;
        setShowQuickButtons(true);
        setIsLoading(false);
        
        // Instant scroll after render
        setTimeout(() => {
          instantScrollToBottom();
        }, 100);
        
        // Trigger agent in background ONCE
        if (!hasTriggeredAgentRef.current) {
          hasTriggeredAgentRef.current = true;
          
          setTimeout(() => {
            base44.agents.addMessage(conversationData, {
              role: "user",
              content: "Start with Q001"
            }).catch(err => {
              console.error("❌ Error starting interview:", err);
              setError("Failed to start interview. Please refresh.");
            });
          }, 50);
        }
        
        return;
      }

      // Existing session - show messages immediately and scroll to bottom
      setMessages(existingMessages);
      lastMessageCountRef.current = existingMessages.length;
      lastMessageContentRef.current = existingMessages[existingMessages.length - 1]?.content || '';
      shouldAutoScrollRef.current = true;
      setIsLoading(false);
      
      // Instant scroll to bottom after messages render
      setTimeout(() => {
        instantScrollToBottom();
      }, 100);

    } catch (err) {
      console.error("❌ Error loading session:", err);
      setError(`Failed to load interview session: ${err.message}`);
      setIsLoading(false);
    }
  };

  const handleCompletion = useCallback(async () => {
    try {
      const [categoriesData, responsesData, questionsData] = await Promise.all([
        base44.entities.Category.list('display_order'),
        base44.entities.Response.filter({ session_id: sessionId }),
        base44.entities.Question.filter({ active: true })
      ]);

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
      setIsCompletionView(true);
      setShowCategoryProgress(true);
    } catch (err) {
      console.error("Error loading completion data:", err);
    }
  }, [sessionId]);

  const handleContinueFromCompletion = () => {
    navigate(createPageUrl("InterviewDashboard"));
  };

  const handleSend = useCallback(async (messageText = null) => {
    const textToSend = messageText || input.trim();
    if (!textToSend || isSending || !conversation) return;

    if (!messageText) {
      setInput("");
    }
    
    setIsSending(true);
    setError(null);
    setShowQuickButtons(false);
    
    // Flag that user just sent a message - ensure we scroll to show response
    userJustSentMessageRef.current = true;
    shouldAutoScrollRef.current = true;

    console.log(`🚀 User sending: "${textToSend}"`);

    try {
      await base44.agents.addMessage(conversation, {
        role: "user",
        content: textToSend
      });
    } catch (err) {
      console.error("Error sending message:", err);
      setError("Failed to send message. Please try again.");
      setShowQuickButtons(true);
      userJustSentMessageRef.current = false;
    } finally {
      setIsSending(false);
    }
  }, [input, isSending, conversation]);

  const handleEditResponse = useCallback(async (message, newAnswer) => {
    if (!conversation || isSending) return;
    
    setIsSending(true);
    setError(null);
    userJustSentMessageRef.current = true;
    shouldAutoScrollRef.current = true;
    
    try {
      await base44.agents.addMessage(conversation, {
        role: "user",
        content: `I want to change my previous answer to: ${newAnswer}`
      });
    } catch (err) {
      console.error("Error editing response:", err);
      setError("Failed to update answer. Please try again.");
      userJustSentMessageRef.current = false;
    } finally {
      setIsSending(false);
    }
  }, [conversation, isSending]);

  const handleQuickResponse = useCallback((response) => {
    handleSend(response);
  }, [handleSend]);

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    handleSend();
  }, [handleSend]);

  const handlePause = useCallback(async () => {
    try {
      await base44.entities.InterviewSession.update(sessionId, {
        status: "paused"
      });
      navigate(createPageUrl("InterviewDashboard"));
    } catch (err) {
      console.error("Error pausing session:", err);
    }
  }, [sessionId, navigate]);

  // Memoize filtered messages to prevent re-filtering on every render
  const displayMessages = useMemo(() => {
    return messages.filter(message => 
      message.content && 
      message.content.trim() !== '' &&
      !message.content.includes('[SHOW_CATEGORY_OVERVIEW]') &&
      !message.content.includes('[SHOW_CATEGORY_TRANSITION:')
    );
  }, [messages]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-md">
          <Loader2 className="w-12 h-12 text-blue-400 animate-spin mx-auto" />
          <p className="text-slate-300">Loading interview session...</p>
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

  if (showCategoryProgress && isCompletionView) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <CategoryProgress
          categories={categories}
          currentCategory={null}
          onContinue={handleContinueFromCompletion}
          isInitial={false}
          isComplete={true}
        />
      </div>
    );
  }

  return (
    <div className="h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex flex-col overflow-hidden">
      {/* Header - Fixed at Top */}
      <header className="flex-shrink-0 bg-slate-800/95 backdrop-blur-sm border-b border-slate-700 px-4 py-3">
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
      </header>

      {/* Messages Area - Scrollable with dynamic padding */}
      <main 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: 'var(--footer-h, 200px)' }}
      >
        <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
          {displayMessages.length === 0 ? (
            <div className="text-center py-12 space-y-4">
              <Shield className="w-16 h-16 text-blue-400 mx-auto opacity-50 animate-pulse" />
              <p className="text-slate-400">Starting interview...</p>
            </div>
          ) : (
            displayMessages.map((message, index) => (
              <MessageBubble 
                key={message.id || `msg-${message.created_at}-${index}`}
                message={message} 
                onEditResponse={handleEditResponse}
                showWelcome={false}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Footer - Fixed at Bottom */}
      <footer 
        ref={footerRef}
        className="fixed bottom-0 left-0 right-0 bg-slate-800/95 backdrop-blur-sm border-t border-slate-700 px-4 py-4 shadow-2xl z-50"
      >
        <div className="max-w-5xl mx-auto">
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          {showQuickButtons && !isSending ? (
            <div className="flex gap-3 mb-3">
              <Button
                onClick={() => handleQuickResponse("Yes")}
                className="bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2 flex-1 h-14"
                size="lg"
              >
                <Check className="w-5 h-5" />
                <span className="font-semibold">Yes</span>
              </Button>
              <Button
                onClick={() => handleQuickResponse("No")}
                className="bg-red-600 hover:bg-red-700 text-white flex items-center justify-center gap-2 flex-1 h-14"
                size="lg"
              >
                <X className="w-5 h-5" />
                <span className="font-semibold">No</span>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex gap-3 mb-3">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your response..."
                className="flex-1 bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 h-12"
                disabled={isSending}
                autoComplete="off"
              />
              <Button
                type="submit"
                disabled={isSending || !input.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6"
                size="lg"
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
          
          <p className="text-xs text-slate-400 text-center">
            All responses are encrypted and reviewed by authorized investigators
          </p>
        </div>
      </footer>
    </div>
  );
}