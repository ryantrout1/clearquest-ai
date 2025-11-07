
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
    // Check if we should show quick response buttons
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant' && lastMessage.content) {
        // Check if message is asking a Yes/No question or has options
        const hasYesNo = /\b(yes|no)\b/i.test(lastMessage.content) && 
                        lastMessage.content.includes('?');
        const hasOptions = /\[(.*?)\]/i.test(lastMessage.content);
        setShowQuickButtons(hasYesNo || hasOptions);
      }
    }
  }, [messages]);

  const loadSession = async () => {
    try {
      const sessionData = await base44.entities.InterviewSession.get(sessionId);
      setSession(sessionData);

      if (!sessionData.conversation_id) {
        throw new Error("No conversation linked to this session");
      }

      const conversationData = await base44.agents.getConversation(sessionData.conversation_id);
      setConversation(conversationData);
      setMessages(conversationData.messages || []);

      unsubscribeRef.current = base44.agents.subscribeToConversation(
        sessionData.conversation_id,
        (data) => {
          setMessages(data.messages || []);
          scrollToBottom();
        }
      );

      if (!conversationData.messages || conversationData.messages.length === 0) {
        await sendInitialGreeting(conversationData);
      }

      setIsLoading(false);
    } catch (err) {
      console.error("Error loading session:", err);
      setError("Failed to load interview session");
      setIsLoading(false);
    }
  };

  const sendInitialGreeting = async (conv) => {
    try {
      await base44.agents.addMessage(conv, {
        role: "user",
        content: `Hello, I'm ready to begin the interview. My department code is ${session.department_code} and file number is ${session.file_number}. Please skip asking for these and proceed directly to the first question.`
      });
    } catch (err) {
      console.error("Error sending initial greeting:", err);
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
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-blue-400 animate-spin mx-auto" />
          <p className="text-slate-300">Loading interview session...</p>
        </div>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
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
            className="border-slate-600 text-white hover:bg-slate-700"
          >
            <Pause className="w-4 h-4 mr-2" />
            Pause
          </Button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
          {messages.length === 0 ? (
            <div className="text-center py-12 space-y-4">
              <Shield className="w-16 h-16 text-blue-400 mx-auto opacity-50" />
              <p className="text-slate-400">Initializing interview...</p>
            </div>
          ) : (
            messages.map((message, index) => (
              <MessageBubble key={index} message={message} />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="bg-slate-800/80 backdrop-blur-sm border-t border-slate-700 px-4 py-4">
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
                className="bg-green-600 hover:bg-green-700 flex items-center gap-2"
                size="lg"
              >
                <Check className="w-5 h-5" />
                Yes
              </Button>
              <Button
                onClick={() => handleQuickResponse("No")}
                className="bg-red-600 hover:bg-red-700 flex items-center gap-2"
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
              className="flex-1 bg-slate-900/50 border-slate-600 text-white"
              disabled={isSending}
            />
            <Button
              type="submit"
              disabled={isSending || !input.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Send className="w-5 h-5 mr-2" />
                  Send
                </>
              )}
            </Button>
          </form>
          
          <p className="text-xs text-slate-500 mt-2 text-center">
            All responses are encrypted and will be reviewed by authorized investigators
          </p>
        </div>
      </div>
    </div>
  );
}
