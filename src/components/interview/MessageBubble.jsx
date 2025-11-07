import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Button } from "@/components/ui/button";
import { Copy, Zap, CheckCircle2, AlertCircle, Loader2, ChevronRight, Clock } from 'lucide-react';
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const FunctionDisplay = ({ toolCall }) => {
  // Hidden by default - users don't need to see function calls
  return null;
};

// Extract question number from message content
const extractQuestionNumber = (content) => {
  if (!content) return null;
  
  // Try to match Q### pattern (like Q001, Q023, Q113)
  const qMatch = content.match(/\b(Q\d{3})\b/);
  if (qMatch) {
    // Convert Q001 to just "1", Q023 to "23", etc
    return parseInt(qMatch[1].substring(1), 10).toString();
  }
  
  // Try to match "Question ###" pattern
  const questionMatch = content.match(/Question\s+(\d+)/i);
  if (questionMatch) {
    return questionMatch[1];
  }
  
  return null;
};

export default function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  
  // Hide initial trigger messages and Continue messages
  if (isUser && (
    message.content === 'Ready to begin' || 
    message.content === 'Continue' ||
    message.content?.includes('Start interview')
  )) {
    return null;
  }
  
  // Clean message content - remove markers like [SHOW_CATEGORY_OVERVIEW]
  const cleanContent = message.content?.replace(/\[SHOW_.*?\]/g, '').trim();
  
  // Don't render if content is empty after cleaning
  if (!cleanContent) {
    return null;
  }
  
  // Extract question number for AI messages
  const questionNumber = !isUser ? extractQuestionNumber(message.content) : null;
  
  return (
    <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="h-8 w-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center mt-0.5 flex-shrink-0">
          {questionNumber ? (
            <span className="text-xs font-semibold text-blue-300">{questionNumber}</span>
          ) : (
            <div className="h-2 w-2 rounded-full bg-blue-400" />
          )}
        </div>
      )}
      <div className={cn("max-w-[85%]", isUser && "flex flex-col items-end")}>
        <div className={cn(
          "rounded-2xl px-4 py-3",
          isUser ? "bg-slate-700 text-white" : "bg-slate-800/80 backdrop-blur-sm border border-slate-700 text-slate-100"
        )}>
          {isUser ? (
            <p className="text-sm leading-relaxed">{cleanContent}</p>
          ) : (
            <ReactMarkdown 
              className="text-sm prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
              components={{
                code: ({ inline, className, children, ...props }) => {
                  const match = /language-(\w+)/.exec(className || '');
                  return !inline && match ? (
                    <div className="relative group/code">
                      <pre className="bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto my-2">
                        <code className={className} {...props}>{children}</code>
                      </pre>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover/code:opacity-100 bg-slate-800 hover:bg-slate-700"
                        onClick={() => {
                          navigator.clipboard.writeText(String(children).replace(/\n$/, ''));
                          toast.success('Code copied');
                        }}
                      >
                        <Copy className="h-3 w-3 text-slate-400" />
                      </Button>
                    </div>
                  ) : (
                    <code className="px-1 py-0.5 rounded bg-slate-700 text-slate-200 text-xs">
                      {children}
                    </code>
                  );
                },
                a: ({ children, ...props }) => (
                  <a {...props} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">{children}</a>
                ),
                p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,
                ul: ({ children }) => <ul className="my-1 ml-4 list-disc">{children}</ul>,
                ol: ({ children }) => <ol className="my-1 ml-4 list-decimal">{children}</ol>,
                li: ({ children }) => <li className="my-0.5">{children}</li>,
                h1: ({ children }) => <h1 className="text-lg font-semibold my-2">{children}</h1>,
                h2: ({ children }) => <h2 className="text-base font-semibold my-2">{children}</h2>,
                h3: ({ children }) => <h3 className="text-sm font-semibold my-2">{children}</h3>,
                strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-slate-600 pl-3 my-2 text-slate-300">
                    {children}
                  </blockquote>
                ),
              }}
            >
              {cleanContent}
            </ReactMarkdown>
          )}
        </div>
        
        {message.tool_calls?.length > 0 && (
          <div className="space-y-1 mt-2">
            {message.tool_calls.map((toolCall, idx) => (
              <FunctionDisplay key={idx} toolCall={toolCall} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}