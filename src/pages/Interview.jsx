
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
  const [lastFailedMessage, setLastFailedMessage] = useState(null);
  const [isDownloadingReport, setIsDownloadingReport] = useState(false);
  
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const footerRef = useRef(null);
  const unsubscribeRef = useRef(null);
  const hasTriggeredAgentRef = useRef(false);
  const lastMessageCountRef = useRef(0);
  const lastMessageContentRef = useRef('');
  const shouldAutoScrollRef = useRef(true);
  const userJustSentMessageRef = useRef(false);
  const scrollLockRef = useRef(false);
  const retryCountRef = useRef(0);

  // Smooth scroll to bottom
  const smoothScrollToBottom = useCallback(() => {
    if (!messagesContainerRef.current) return;
    
    const container = messagesContainerRef.current;
    scrollLockRef.current = false;
    
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth'
          });
        });
      });
    });
  }, []);

  // Instant scroll to bottom
  const instantScrollToBottom = useCallback(() => {
    if (!messagesContainerRef.current) return;
    scrollLockRef.current = false;
    const container = messagesContainerRef.current;
    container.scrollTop = container.scrollHeight;
  }, []);

  // Generate report HTML content
  const generateReportHTML = (session, responses, followups, questions) => {
    const now = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });

    const categorizedResponses = {};
    responses.forEach(response => {
      const question = questions.find(q => q.question_id === response.question_id);
      const category = question?.category || 'Uncategorized';
      if (!categorizedResponses[category]) {
        categorizedResponses[category] = [];
      }
      categorizedResponses[category].push({ response, question });
    });

    const sortedCategories = Object.keys(categorizedResponses).sort((a, b) => a.localeCompare(b));

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Interview Report - ${session.session_code}</title>
        <style>
          @media print {
            @page { margin: 0.75in; size: letter; }
            body { margin: 0; padding: 0; }
          }
          body { font-family: 'Times New Roman', serif; font-size: 11pt; line-height: 1.5; color: #000; max-width: 8.5in; margin: 0 auto; padding: 20px; }
          .header { text-align: center; border-bottom: 3px solid #000; padding-bottom: 15px; margin-bottom: 20px; }
          .header h1 { font-size: 18pt; font-weight: bold; margin: 0 0 10px 0; text-transform: uppercase; }
          .header .session-info { font-size: 10pt; color: #333; }
          .section { margin-bottom: 25px; page-break-inside: avoid; }
          .section-title { font-size: 13pt; font-weight: bold; border-bottom: 2px solid #333; padding-bottom: 5px; margin-bottom: 15px; text-transform: uppercase; }
          .question-block { margin-bottom: 20px; padding: 10px; background: #f9f9f9; border-left: 3px solid #333; break-inside: avoid; }
          .question-id { font-weight: bold; color: #0066cc; font-size: 10pt; }
          .question-text { font-weight: bold; margin: 5px 0; }
          .answer { margin-left: 20px; padding: 8px; background: white; border: 1px solid #ddd; }
          .answer-label { font-weight: bold; font-size: 9pt; color: #666; }
          .timestamp { font-size: 9pt; color: #999; margin-top: 3px; }
          .follow-up { margin-left: 40px; margin-top: 10px; padding: 10px; background: #fff3cd; border-left: 3px solid #ff9800; }
          .follow-up-title { font-weight: bold; color: #ff6600; font-size: 10pt; }
          .summary-box { background: #e8f4f8; border: 2px solid #0066cc; padding: 15px; margin-bottom: 20px; }
          .footer { margin-top: 30px; padding-top: 15px; border-top: 2px solid #333; text-align: center; font-size: 9pt; color: #666; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Applicant Background Interview Report</h1>
          <div class="session-info">
            <strong>Session Code:</strong> ${session.session_code}<br>
            <strong>Date:</strong> ${now}<br>
            <strong>Questions Answered:</strong> ${responses.length} / 162<br>
            <strong>Follow-Ups Triggered:</strong> ${followups.length}
          </div>
        </div>
        <div class="summary-box">
          <strong>Interview Summary:</strong><br>
          Applicant completed ${responses.length} questions across ${sortedCategories.length} categories. 
          This report contains all responses provided during the interview session, including follow-up details where applicable.
        </div>
        ${sortedCategories.map(category => `
          <div class="section">
            <div class="section-title">${category}</div>
            ${categorizedResponses[category].map(({ response, question }) => {
              const relatedFollowups = followups.filter(f => f.response_id === response.id);
              return `
                <div class="question-block">
                  <div class="question-id">${response.question_id}</div>
                  <div class="question-text">${question?.question_text || response.question_text}</div>
                  <div class="answer">
                    <span class="answer-label">Response:</span> ${response.answer || 'N/A'}
                    ${response.answer_array?.length > 0 ? `<br><strong>Details:</strong> ${response.answer_array.join(', ')}` : ''}
                  </div>
                  <div class="timestamp">Answered: ${new Date(response.response_timestamp).toLocaleString()}</div>
                  ${relatedFollowups.map(followup => `
                    <div class="follow-up">
                      <div class="follow-up-title">Follow-Up: ${followup.followup_pack || 'N/A'}</div>
                      ${followup.substance_name ? `<strong>Substance:</strong> ${followup.substance_name}<br>` : ''}
                      ${followup.incident_date ? `<strong>Date:</strong> ${followup.incident_date}<br>` : ''}
                      ${followup.incident_location ? `<strong>Location:</strong> ${followup.incident_location}<br>` : ''}
                      ${followup.incident_description ? `<strong>Description:</strong> ${followup.incident_description}<br>` : ''}
                      ${followup.frequency ? `<strong>Frequency:</strong> ${followup.frequency}<br>` : ''}
                      ${followup.accountability_response ? `<strong>Accountability:</strong> ${followup.accountability_response}<br>` : ''}
                      ${followup.changes_since ? `<strong>Changes Since:</strong> ${followup.changes_since}` : ''}
                    </div>
                  `).join('')}
                </div>
              `;
            }).join('')}
          </div>
        `).join('')}
        <div class="footer">
          <strong>ClearQuest™ Interview System</strong><br>
          CJIS Compliant • All responses encrypted and secured<br>
          Report generated: ${new Date().toLocaleString()}
        </div>
      </body>
      </html>
    `;
  };

  const handleSend = useCallback(async (messageText = null, isRetry = false) => {
    const textToSend = messageText || input.trim();
    if (!textToSend || isSending || !conversation) return;

    if (!messageText && !isRetry) {
      setInput("");
    }
    
    setIsSending(true);
    setError(null);
    setShowQuickButtons(false);
    
    userJustSentMessageRef.current = true;
    shouldAutoScrollRef.current = true;

    console.log(`🚀 Sending${isRetry ? ' (retry)' : ''}: "${textToSend}"`);

    try {
      await base44.agents.addMessage(conversation, {
        role: "user",
        content: textToSend
      });
      
      retryCountRef.current = 0;
      setLastFailedMessage(null);
      
    } catch (err) {
      console.error("❌ Error sending message:", err);
      
      setLastFailedMessage(textToSend);
      retryCountRef.current += 1;
      
      let errorMsg = "Failed to send message.";
      
      if (err.message?.includes('network') || err.message?.includes('fetch')) {
        errorMsg = "Network error - check your connection and try again.";
      } else if (err.message?.includes('timeout')) {
        errorMsg = "Request timed out - please try again.";
      } else if (err.message) {
        errorMsg = `Error: ${err.message}`;
      }
      
      setError(errorMsg);
      setShowQuickButtons(true);
      userJustSentMessageRef.current = false;
    } finally {
      setIsSending(false);
    }
  }, [input, isSending, conversation]);

  const handleRetry = useCallback(() => {
    if (lastFailedMessage) {
      console.log("🔄 Retrying last message...");
      handleSend(lastFailedMessage, true);
    }
  }, [lastFailedMessage, handleSend]);

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

  // Handle completion
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

  const handleDownloadReport = useCallback(async () => {
    setIsDownloadingReport(true);
    
    try {
      console.log("🔍 Generating report for session:", sessionId);
      
      const [sessionData, responses, followups, questions] = await Promise.all([
        base44.entities.InterviewSession.get(sessionId),
        base44.entities.Response.filter({ session_id: sessionId }),
        base44.entities.FollowUpResponse.filter({ session_id: sessionId }),
        base44.entities.Question.filter({ active: true })
      ]);

      console.log(`📊 Loaded: ${responses.length} responses, ${followups.length} follow-ups`);

      const reportContent = generateReportHTML(sessionData, responses, followups, questions);

      const printContainer = document.createElement('div');
      printContainer.innerHTML = reportContent;
      printContainer.style.position = 'absolute';
      printContainer.style.left = '-9999px';
      document.body.appendChild(printContainer);

      window.print();

      setTimeout(() => {
        document.body.removeChild(printContainer);
      }, 100);

      console.log("✅ Report generated successfully");
      
    } catch (err) {
      console.error("❌ Error generating report:", err);
      setError("Failed to generate report. Please try again.");
    } finally {
      setIsDownloadingReport(false);
    }
  }, [sessionId, generateReportHTML]);

  const handleContinueFromCompletion = () => {
    navigate(createPageUrl("InterviewDashboard"));
  };

  const loadSession = async () => {
    try {
      const [sessionData, q001Data] = await Promise.all([
        base44.entities.InterviewSession.get(sessionId),
        base44.entities.Question.filter({ question_id: "Q001" }).then(q => q[0])
      ]);
      
      setSession(sessionData);

      if (!sessionData.conversation_id) {
        throw new Error("No conversation linked to this session");
      }

      const conversationData = await base44.agents.getConversation(sessionData.conversation_id);
      setConversation(conversationData);
      
      const existingMessages = conversationData.messages || [];

      unsubscribeRef.current = base44.agents.subscribeToConversation(
        sessionData.conversation_id,
        (data) => {
          const newMessages = data.messages || [];
          const newCount = newMessages.length;
          const lastContent = newMessages[newCount - 1]?.content || '';
          
          if (newCount !== lastMessageCountRef.current || lastContent !== lastMessageContentRef.current) {
            setMessages(newMessages);
          }
        }
      );

      if (existingMessages.length === 0 && q001Data) {
        console.log("✅ New session - showing Q001");
        
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
        
        setTimeout(() => instantScrollToBottom(), 100);
        
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

      setMessages(existingMessages);
      lastMessageCountRef.current = existingMessages.length;
      lastMessageContentRef.current = existingMessages[existingMessages.length - 1]?.content || '';
      shouldAutoScrollRef.current = true;
      setIsLoading(false);
      
      setTimeout(() => instantScrollToBottom(), 100);

    } catch (err) {
      console.error("❌ Error loading session:", err);
      setError(`Failed to load interview session: ${err.message}`);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
    
    return () => {
      if ('scrollRestoration' in window.history) {
        window.history.scrollRestoration = 'auto';
      }
    };
  }, []);

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
  }, [sessionId, navigate, instantScrollToBottom]); // Added instantScrollToBottom to dependencies

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

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    let savedScrollTop = 0;

    const handleScroll = () => {
      if (scrollLockRef.current) {
        container.scrollTop = savedScrollTop;
        return;
      }
      
      savedScrollTop = container.scrollTop;
      
      const threshold = 200;
      const position = container.scrollTop + container.clientHeight;
      const bottom = container.scrollHeight;
      const nearBottom = bottom - position < threshold;
      
      shouldAutoScrollRef.current = nearBottom;
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const newMessageCount = messages.length;
    
    if (newMessageCount === 0) return;
    
    const previousCount = lastMessageCountRef.current;
    const messagesAdded = newMessageCount - previousCount;
    
    if (messagesAdded > 0) {
      lastMessageCountRef.current = newMessageCount;
      
      console.log(`📨 ${messagesAdded} new message(s) - User action: ${userJustSentMessageRef.current}`);
      
      const container = messagesContainerRef.current;
      if (container) {
        const savedPosition = container.scrollTop;
        scrollLockRef.current = true;
        
        const lockTimer = setInterval(() => {
          if (scrollLockRef.current && container.scrollTop !== savedPosition) {
            container.scrollTop = savedPosition;
          }
        }, 0);
        
        const shouldScroll = userJustSentMessageRef.current || shouldAutoScrollRef.current;
        
        if (shouldScroll) {
          setTimeout(() => {
            clearInterval(lockTimer);
            smoothScrollToBottom();
            console.log('✅ Scrolled to bottom');
          }, 200);
          
          if (userJustSentMessageRef.current) {
            setTimeout(() => {
              userJustSentMessageRef.current = false;
            }, 250);
          }
        } else {
          setTimeout(() => {
            clearInterval(lockTimer);
            scrollLockRef.current = false;
            console.log('⏸️ Position maintained');
          }, 100);
        }
      }
    }
    else if (messagesAdded === 0 && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      const lastContent = lastMessage?.content || '';
      
      if (lastContent !== lastMessageContentRef.current) {
        lastMessageContentRef.current = lastContent;
        
        if (shouldAutoScrollRef.current && !scrollLockRef.current) {
          const container = messagesContainerRef.current;
          if (container) {
            container.scrollTop = container.scrollHeight;
          }
        }
      }
    }
  }, [messages, smoothScrollToBottom]);

  useEffect(() => {
    if (messages.length === 0) return;

    const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');
    
    if (!lastAssistantMessage?.content) return;

    if (lastAssistantMessage.content.includes('[SHOW_COMPLETION]')) {
      if (!showCategoryProgress) {
        handleCompletion();
      }
      return;
    }

    if (!showCategoryProgress) {
      const content = lastAssistantMessage.content.replace(/\[.*?\]/g, '').toLowerCase();
      const hasQuestion = content.includes('?');
      setShowQuickButtons(hasQuestion);
    }
  }, [messages, showCategoryProgress, handleCompletion]);

  const displayMessages = useMemo(() => {
    return messages
      .filter(message => 
        message.content && 
        message.content.trim() !== '' &&
        !message.content.includes('[SHOW_CATEGORY_OVERVIEW]') &&
        !message.content.includes('[SHOW_CATEGORY_TRANSITION:')
      )
      .map((msg, index) => ({
        ...msg,
        stableKey: msg.id || `stable-${msg.created_at}-${index}`
      }));
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
          onDownloadReport={handleDownloadReport}
          isDownloading={isDownloadingReport}
        />
      </div>
    );
  }

  return (
    <div className="h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex flex-col overflow-hidden">
      {/* Header */}
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

      {/* Messages - with CSS overflow anchor */}
      <main 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto"
        style={{ 
          paddingBottom: 'var(--footer-h, 200px)',
          overflowAnchor: 'auto'
        }}
      >
        <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
          {displayMessages.length === 0 ? (
            <div className="text-center py-12 space-y-4">
              <Shield className="w-16 h-16 text-blue-400 mx-auto opacity-50 animate-pulse" />
              <p className="text-slate-400">Starting interview...</p>
            </div>
          ) : (
            displayMessages.map((message) => (
              <MessageBubble 
                key={message.stableKey}
                message={message} 
                onEditResponse={handleEditResponse}
                showWelcome={false}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Footer */}
      <footer 
        ref={footerRef}
        className="fixed bottom-0 left-0 right-0 bg-slate-800/95 backdrop-blur-sm border-t border-slate-700 px-4 py-4 shadow-2xl z-50"
      >
        <div className="max-w-5xl mx-auto">
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between gap-2">
                <span>{error}</span>
                {lastFailedMessage && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRetry}
                    disabled={isSending}
                    className="border-red-400 text-red-200 hover:bg-red-950 hover:text-white flex-shrink-0"
                  >
                    {isSending ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      "Retry"
                    )}
                  </Button>
                )}
              </AlertDescription>
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
