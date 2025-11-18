
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Send, Loader2, Pause, AlertCircle, Check, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import MessageBubble from "../components/interview/MessageBubble";
import SectionProgress from "../components/interview/SectionProgress";

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
  const [showSectionProgress, setShowSectionProgress] = useState(false);
  const [sections, setSections] = useState([]);
  const [isCompletionView, setIsCompletionView] = useState(false);
  const [lastFailedMessage, setLastFailedMessage] = useState(null);
  const [isDownloadingReport, setIsDownloadingReport] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [currentSectionName, setCurrentSectionName] = useState("");
  
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const footerRef = useRef(null);
  const unsubscribeRef = useRef(null);
  const retryCountRef = useRef(0);
  const processedPairsRef = useRef(new Set());
  const processedFollowupsRef = useRef(new Set());
  const lastProcessedIndexRef = useRef(0);
  const isInitializedRef = useRef(false);
  const shouldAutoScrollRef = useRef(true);

  useEffect(() => {
    if (!sessionId || !messages || messages.length === 0 || !questions || questions.length === 0) return;

    const processMessages = async () => {
      console.log("🔍 Processing messages for Response/FollowUpResponse creation...");
      
      for (let i = lastProcessedIndexRef.current; i < messages.length; i++) {
        const message = messages[i];
        
        if (message.role === 'assistant') {
          const questionMatch = message.content?.match(/\b(Q\d{1,3})\b/i);
          if (questionMatch) {
            const questionId = questionMatch[1].toUpperCase();
            
            const nextMessage = messages[i + 1];
            if (nextMessage && nextMessage.role === 'user') {
              const pairKey = `${questionId}-${nextMessage.id}`;
              
              if (!processedPairsRef.current.has(pairKey)) {
                let userAnswer = nextMessage.content?.trim() || '';
                
                if (userAnswer === "Ready to begin" || userAnswer === "Continue" || userAnswer === "Start with Q001") {
                  processedPairsRef.current.add(pairKey);
                  i++;
                  continue;
                }
                
                const normalized = userAnswer.toLowerCase();
                if (normalized === 'yes' || normalized === 'no') {
                  userAnswer = userAnswer.charAt(0).toUpperCase() + userAnswer.slice(1).toLowerCase();
                }
                
                const questionData = questions.find(q => q.question_id === questionId);
                if (!questionData) {
                  console.warn(`⚠️ Question ${questionId} not found`);
                  processedPairsRef.current.add(pairKey);
                  i++;
                  continue;
                }
                
                // Update current section name for header
                if (questionData.section_id) {
                  const sectionData = sections.find(s => s.id === questionData.section_id);
                  if (sectionData) {
                    setCurrentSectionName(sectionData.section_name);
                  }
                }
                
                const existing = await base44.entities.Response.filter({
                  session_id: sessionId,
                  question_id: questionId
                });
                
                if (existing.length === 0) {
                  console.log(`📝 Creating Response: ${questionId} = "${userAnswer}"`);
                  
                  const triggersFollowup = questionData.followup_pack && userAnswer.toLowerCase() === 'yes';
                  
                  try {
                    await base44.entities.Response.create({
                      session_id: sessionId,
                      question_id: questionId,
                      question_text: questionData.question_text,
                      category: questionData.category || '',
                      answer: userAnswer,
                      answer_array: null,
                      triggered_followup: triggersFollowup,
                      followup_pack: triggersFollowup ? questionData.followup_pack : null,
                      is_flagged: false,
                      flag_reason: null,
                      response_timestamp: nextMessage.created_at || new Date().toISOString()
                    });
                    
                    console.log(`✅ Response created for ${questionId}`);
                    
                    const allResponses = await base44.entities.Response.filter({ session_id: sessionId });
                    const progress = totalQuestions > 0 ? Math.round((allResponses.length / totalQuestions) * 100) : 0;
                    
                    await base44.entities.InterviewSession.update(sessionId, {
                      total_questions_answered: allResponses.length,
                      completion_percentage: progress,
                      followups_triggered: triggersFollowup ? (session?.followups_triggered || 0) + 1 : (session?.followups_triggered || 0)
                    });
                    
                  } catch (err) {
                    console.error(`❌ Error creating Response:`, err);
                  }
                } else {
                  console.log(`✅ Response already exists for ${questionId}`);
                }
                
                processedPairsRef.current.add(pairKey);
                i++;
              }
            }
          }
        }
        
        if (message.role === 'assistant' && message.content) {
          const content = message.content.toLowerCase();
          const isFollowupAssistantPrompt = 
            (content.includes('tell me more') || content.includes('provide details') || 
             content.includes('what happened') || content.includes('describe the incident') ||
             content.includes('details about') || content.includes('can you explain')) &&
            !content.match(/\b(q\d{1,3})\b/i) &&
            !content.includes('[show_completion]') &&
            !content.includes('[show_category_overview]') &&
            !content.includes('[show_category_transition:');
          
          if (isFollowupAssistantPrompt) {
            const nextMessage = messages[i + 1];
            if (nextMessage && nextMessage.role === 'user') {
              const followupKey = `followup-prompt-${message.id}-user-answer-${nextMessage.id}`;
              
              if (!processedFollowupsRef.current.has(followupKey)) {
                const allResponses = await base44.entities.Response.filter({ session_id: sessionId });
                const lastTriggeredResponse = allResponses.slice().reverse().find(r => r.triggered_followup);
                
                if (lastTriggeredResponse) {
                  const existingFollowups = await base44.entities.FollowUpResponse.filter({
                    session_id: sessionId,
                    response_id: lastTriggeredResponse.id
                  });

                  const followupAlreadyRecorded = existingFollowups.some(f => f.incident_description);

                  if (!followupAlreadyRecorded) {
                    console.log(`📋 Creating FollowUpResponse for QID: ${lastTriggeredResponse.question_id}, Response ID: ${lastTriggeredResponse.id}`);
                    
                    try {
                      const userAnswer = nextMessage.content;
                      const incidentDescription = userAnswer;

                      await base44.entities.FollowUpResponse.create({
                        session_id: sessionId,
                        response_id: lastTriggeredResponse.id,
                        question_id: lastTriggeredResponse.question_id,
                        followup_pack: lastTriggeredResponse.followup_pack,
                        instance_number: 1, 
                        incident_description: incidentDescription, 
                        completed: true, 
                        completed_timestamp: nextMessage.created_at || new Date().toISOString()
                      });
                      
                      console.log(`✅ FollowUpResponse created for ${lastTriggeredResponse.question_id}`);
                    } catch (err) {
                      console.error(`❌ Error creating FollowUpResponse:`, err);
                    }
                  } else {
                    console.log(`✅ FollowUpResponse already recorded for Response ID: ${lastTriggeredResponse.id}`);
                  }
                } else {
                  console.warn("⚠️ Assistant asked a follow-up question, but no recent 'triggered_followup' response found.");
                }
                
                processedFollowupsRef.current.add(followupKey);
                i++;
              }
            }
          }
        }
      }
      
      lastProcessedIndexRef.current = messages.length;
    };

    const timeoutId = setTimeout(processMessages, 1500);
    return () => clearTimeout(timeoutId);
  }, [messages, sessionId, questions, session, sections, totalQuestions]);

  const smoothScrollToBottom = useCallback(() => {
    if (!messagesContainerRef.current) return;
    
    const container = messagesContainerRef.current;
    
    requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth'
      });
    });
  }, []);

  const instantScrollToBottom = useCallback(() => {
    if (!messagesContainerRef.current) return;
    const container = messagesContainerRef.current;
    container.scrollTop = container.scrollHeight;
  }, []);

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
            <strong>Questions Answered:</strong> ${responses.length} / ${totalQuestions || 162}<br>
            <strong>Follow-Ups Triggered:</strong> ${followups.length}
          </div>
        </div>
        <div class="summary-box">
          <strong>Interview Summary:</strong><br>
          Applicant completed ${responses.length} questions across ${sortedCategories.length} sections. 
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
    shouldAutoScrollRef.current = true;

    console.log(`🚀 Sending${isRetry ? ' (retry)' : ''}: "${textToSend}"`);

    try {
      await base44.agents.addMessage(conversation, {
        role: "user",
        content: textToSend
      });
      
      retryCountRef.current = 0;
      setLastFailedMessage(null);
      
      setTimeout(() => {
        if (shouldAutoScrollRef.current) {
          smoothScrollToBottom();
        }
      }, 300);
      
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
    } finally {
      setIsSending(false);
    }
  }, [input, isSending, conversation, smoothScrollToBottom]);

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
    shouldAutoScrollRef.current = true;
    
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
      setIsPaused(true);
    } catch (err) {
      console.error("Error pausing session:", err);
      setError("Failed to pause interview. Please try again.");
    }
  }, [sessionId]);

  const handleResume = useCallback(async () => {
    try {
      await base44.entities.InterviewSession.update(sessionId, {
        status: "in_progress"
      });
      setIsPaused(false);
      
      if (conversation) {
        const conversationData = await base44.agents.getConversation(conversation.id);
        const existingMessages = conversationData.messages || [];
        setMessages(existingMessages);
        shouldAutoScrollRef.current = true;
        
        setTimeout(() => instantScrollToBottom(), 100);
        
        if (existingMessages.length > 0) {
          const lastAssistantMessage = [...existingMessages].reverse().find(m => m.role === 'assistant');
          if (lastAssistantMessage?.content) {
            const content = lastAssistantMessage.content.replace(/\[.*?\]/g, '').toLowerCase();
            const hasQuestion = content.includes('?');
            setShowQuickButtons(hasQuestion);
          }
        }
      }
    } catch (err) {
      console.error("Error resuming session:", err);
      setError("Failed to resume interview. Please try again.");
    }
  }, [sessionId, conversation, instantScrollToBottom]);

  const handleCompletion = useCallback(async () => {
    try {
      const [sectionsData, responsesData, questionsData] = await Promise.all([
        base44.entities.Section.list(),
        base44.entities.Response.filter({ session_id: sessionId }),
        base44.entities.Question.filter({ active: true })
      ]);

      const sectionProgress = sectionsData
        .filter(s => s.active !== false)
        .sort((a, b) => (a.section_order || 0) - (b.section_order || 0))
        .map(sec => {
          const sectionQuestions = questionsData.filter(q => q.section_id === sec.id);
          const answeredInSection = responsesData.filter(r => 
            sectionQuestions.some(q => q.question_id === r.question_id)
          );

          return {
            ...sec,
            section_name: sec.section_name,
            section_order: sec.section_order,
            total_questions: sectionQuestions.length,
            answered_questions: answeredInSection.length
          };
        });

      setSections(sectionProgress);
      setIsCompletionView(true);
      setShowSectionProgress(true);
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
  }, [sessionId, totalQuestions]);

  const handleContinueFromCompletion = () => {
    navigate(createPageUrl("InterviewDashboard"));
  };

  const loadSession = async () => {
    try {
      console.log("🔄 Loading session:", sessionId);
      
      const [sessionData, allQuestions, allSections] = await Promise.all([
        base44.entities.InterviewSession.get(sessionId),
        base44.entities.Question.filter({ active: true }),
        base44.entities.Section.list()
      ]);
      
      setSession(sessionData);
      setQuestions(allQuestions);
      setSections(allSections);
      
      // Calculate total questions from active sections
      const activeSections = allSections.filter(s => s.active !== false);
      const totalQs = activeSections.reduce((sum, sec) => {
        const secQuestions = allQuestions.filter(q => q.section_id === sec.id);
        return sum + secQuestions.length;
      }, 0);
      setTotalQuestions(totalQs);
      
      console.log(`📊 Total active questions: ${totalQs}`);

      if (!sessionData.conversation_id) {
        throw new Error("No conversation linked to this session");
      }

      const conversationData = await base44.agents.getConversation(sessionData.conversation_id);
      setConversation(conversationData);
      
      const existingMessages = conversationData.messages || [];
      console.log(`📥 Loaded ${existingMessages.length} existing messages`);

      if (sessionData.status === 'paused') {
        console.log("📍 Session is paused");
        setIsPaused(true);
        setIsLoading(false);
        setMessages(existingMessages);
        return;
      } else {
        setIsPaused(false);
      }

      console.log("📡 Setting up message subscription");
      unsubscribeRef.current = base44.agents.subscribeToConversation(
        sessionData.conversation_id,
        (data) => {
          const newMessages = data.messages || [];
          console.log(`📨 Subscription update: ${newMessages.length} messages`);
          setMessages(newMessages);
        }
      );

      setMessages(existingMessages);
      
      if (existingMessages.length === 0 && !isInitializedRef.current) {
        console.log("🎬 Initializing new conversation with Q001");
        isInitializedRef.current = true;
        
        try {
          await base44.agents.addMessage(conversationData, {
            role: "user",
            content: "Start with Q001"
          });
          console.log("✅ Q001 initialization sent");
          // Set loading to false after successful initialization
          setIsLoading(false);
        } catch (err) {
          console.error("❌ Error initializing conversation:", err);
          setError("Failed to start interview. Please try again.");
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
      }

      shouldAutoScrollRef.current = true;
      
      setTimeout(() => {
        instantScrollToBottom();
        
        if (existingMessages.length > 0) {
          const lastAssistantMessage = [...existingMessages].reverse().find(m => m.role === 'assistant');
          if (lastAssistantMessage?.content) {
            const content = lastAssistantMessage.content.replace(/\[.*?\]/g, '').toLowerCase();
            const hasQuestion = content.includes('?');
            setShowQuickButtons(hasQuestion);
          }
        }
      }, 100);

    } catch (err) {
      console.error("❌ Error loading session:", err);
      setError(`Failed to load interview session: ${err.message}`);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!sessionId) {
      navigate(createPageUrl("StartInterview"));
      return;
    }
    
    loadSession();
    
    return () => {
      console.log("🧹 Cleaning up subscription");
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [sessionId, navigate]);

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

    const handleScroll = () => {
      const threshold = 200;
      const position = container.scrollTop + container.clientHeight;
      const bottom = container.scrollHeight;
      shouldAutoScrollRef.current = (bottom - position < threshold);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (messages.length > 0 && shouldAutoScrollRef.current) {
      setTimeout(() => {
        smoothScrollToBottom();
      }, 100);
    }
  }, [messages.length, smoothScrollToBottom]);

  useEffect(() => {
    if (messages.length === 0) return;

    const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');
    
    if (!lastAssistantMessage?.content) return;

    if (lastAssistantMessage.content.includes('[SHOW_COMPLETION]')) {
      if (!showSectionProgress) {
        handleCompletion();
      }
      return;
    }

    if (!showSectionProgress) {
      const content = lastAssistantMessage.content.replace(/\[.*?\]/g, '').toLowerCase();
      const hasQuestion = content.includes('?');
      setShowQuickButtons(hasQuestion);
    }
  }, [messages, showSectionProgress, handleCompletion]);

  const displayMessages = useMemo(() => {
    return messages
      .filter(message => 
        message.content && 
        message.content.trim() !== '' &&
        !message.content.includes('[SHOW_CATEGORY_OVERVIEW]') &&
        !message.content.includes('[SHOW_CATEGORY_TRANSITION:') &&
        message.content !== 'Start with Q001' &&
        message.content !== 'Ready to begin' &&
        message.content !== 'Continue'
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

  if (isPaused) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full">
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-8 md:p-12 text-center space-y-6">
            <div className="flex justify-center">
              <div className="p-4 rounded-full bg-blue-600/20">
                <Pause className="w-12 h-12 text-blue-400" />
              </div>
            </div>
            
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
                Interview Paused
              </h2>
              <p className="text-lg text-slate-300 mb-4">
                Your progress has been saved.
              </p>
              <p className="text-slate-400 leading-relaxed max-w-lg mx-auto">
                You can come back anytime and pick up exactly where you left off. 
                Your responses are securely stored and encrypted.
              </p>
            </div>

            <div className="bg-slate-900/50 rounded-lg p-6 space-y-2 max-w-md mx-auto">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400">Session Code</span>
                <span className="text-white font-semibold">{session?.session_code}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400">Questions Completed</span>
                <span className="text-white font-semibold">{session?.total_questions_answered || 0} / {totalQuestions}</span>
              </div>
            </div>

            <Button
              onClick={handleResume}
              size="lg"
              className="bg-blue-600 hover:bg-blue-700 text-white w-full md:w-auto px-8"
            >
              Resume Interview
            </Button>
            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <p className="text-xs text-slate-500 pt-4">
              All data is encrypted and compliant with CJIS standards
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (showSectionProgress && isCompletionView) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <SectionProgress
          sections={sections}
          currentSection={null}
          onContinue={handleContinueFromCompletion}
          isInitial={false}
          isComplete={true}
          onDownloadReport={handleDownloadReport}
          isDownloading={isDownloadingReport}
          totalQuestions={totalQuestions}
        />
      </div>
    );
  }

  return (
    <div className="h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex flex-col overflow-hidden">
      <header className="flex-shrink-0 bg-slate-800/95 backdrop-blur-sm border-b border-slate-700 px-4 py-3">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 md:w-6 md:h-6 text-blue-400 flex-shrink-0" />
              <div>
                <h1 className="text-sm md:text-lg font-semibold text-white">ClearQuest Interview</h1>
                <p className="text-xs md:text-sm text-slate-400 mt-0.5">
                  {currentSectionName || 'Background Investigation'}
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
