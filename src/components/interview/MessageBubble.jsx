import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Button } from "@/components/ui/button";
import { Copy } from 'lucide-react';
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const FunctionDisplay = ({ toolCall }) => {
    return null; // Hide function calls from UI
};

// Extract question number from message content
const extractQuestionNumber = (content) => {
    if (!content) return null;
    
    // Look for Q### or Q## or Q# pattern
    const match = content.match(/\b(Q\d{1,3})\b/i);
    if (match) {
        return match[1].toUpperCase();
    }
    
    return null;
};

export default function MessageBubble({ message }) {
    const isUser = message.role === 'user';
    
    // Hide initial "Ready to begin" and "Continue" messages
    if (isUser && (message.content === "Ready to begin" || message.content === "Continue")) {
        return null;
    }
    
    // Clean content - remove markers before rendering
    let cleanContent = message.content || '';
    cleanContent = cleanContent.replace(/\[SHOW_CATEGORY_OVERVIEW\]/g, '');
    cleanContent = cleanContent.replace(/\[SHOW_CATEGORY_TRANSITION:.*?\]/g, '');
    cleanContent = cleanContent.replace(/\[SHOW_COMPLETION\]/g, '');
    cleanContent = cleanContent.trim();
    
    if (!cleanContent) return null;
    
    // Extract question number for AI messages
    const questionNumber = !isUser ? extractQuestionNumber(cleanContent) : null;
    
    return (
        <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
            {!isUser && questionNumber && (
                <div className="h-7 w-7 rounded-lg bg-blue-600 flex items-center justify-center mt-0.5 flex-shrink-0">
                    <span className="text-xs font-bold text-white">{questionNumber.replace('Q', '')}</span>
                </div>
            )}
            {!isUser && !questionNumber && (
                <div className="h-7 w-7 rounded-lg bg-slate-100 flex items-center justify-center mt-0.5 flex-shrink-0">
                    <div className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                </div>
            )}
            <div className={cn("max-w-[85%]", isUser && "flex flex-col items-end")}>
                {cleanContent && (
                    <div className={cn(
                        "rounded-2xl px-4 py-2.5",
                        isUser ? "bg-slate-800 text-white" : "bg-white border border-slate-200"
                    )}>
                        {isUser ? (
                            <p className="text-sm leading-relaxed">{cleanContent}</p>
                        ) : (
                            <ReactMarkdown 
                                className="text-sm prose prose-sm prose-slate max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
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
                                            <code className="px-1 py-0.5 rounded bg-slate-100 text-slate-700 text-xs">
                                                {children}
                                            </code>
                                        );
                                    },
                                    a: ({ children, ...props }) => (
                                        <a {...props} target="_blank" rel="noopener noreferrer">{children}</a>
                                    ),
                                    p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,
                                    ul: ({ children }) => <ul className="my-1 ml-4 list-disc">{children}</ul>,
                                    ol: ({ children }) => <ol className="my-1 ml-4 list-decimal">{children}</ol>,
                                    li: ({ children }) => <li className="my-0.5">{children}</li>,
                                    h1: ({ children }) => <h1 className="text-lg font-semibold my-2">{children}</h1>,
                                    h2: ({ children }) => <h2 className="text-base font-semibold my-2">{children}</h2>,
                                    h3: ({ children }) => <h3 className="text-sm font-semibold my-2">{children}</h3>,
                                    blockquote: ({ children }) => (
                                        <blockquote className="border-l-2 border-slate-300 pl-3 my-2 text-slate-600">
                                            {children}
                                        </blockquote>
                                    ),
                                }}
                            >
                                {cleanContent}
                            </ReactMarkdown>
                        )}
                    </div>
                )}
                
                {message.tool_calls?.length > 0 && (
                    <div className="space-y-1">
                        {message.tool_calls.map((toolCall, idx) => (
                            <FunctionDisplay key={idx} toolCall={toolCall} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}