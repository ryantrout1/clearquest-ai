import { useState, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Button } from "@/components/ui/button";
import { Copy } from 'lucide-react';
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Extract question number from message content
const extractQuestionNumber = (content) => {
    if (!content) return null;
    
    // Look for Q### or Q## or Q# pattern
    const match = content.match(/\b(Q\d{1,3})\b/i);
    if (match) {
        // Extract just the number and remove leading zeros
        const number = match[1].replace(/^Q0*/i, '');
        return number;
    }
    
    return null;
};

// Remove Q###: prefix from content
const removeQuestionPrefix = (content) => {
    if (!content) return '';
    return content.replace(/^Q\d{1,3}:\s*/i, '');
};

const MessageBubble = memo(({ message, onEditResponse }) => {
    const isUser = message.role === 'user';
    
    // Hide system command messages
    if (isUser && (
        message.content === "Ready to begin" || 
        message.content === "Continue" ||
        message.content === "Start with Q001"
    )) {
        return null;
    }
    
    // Clean content - remove ALL markers
    let cleanContent = message.content || '';
    cleanContent = cleanContent.replace(/\[SHOW_CATEGORY_OVERVIEW.*?\]/g, '');
    cleanContent = cleanContent.replace(/\[SHOW_CATEGORY_TRANSITION:.*?\]/g, '');
    cleanContent = cleanContent.replace(/\[SHOW_COMPLETION\]/g, '');
    cleanContent = cleanContent.trim();
    
    if (!cleanContent) return null;
    
    // Extract question number for AI messages (before removing prefix)
    const questionNumber = !isUser ? extractQuestionNumber(cleanContent) : null;
    
    // Remove Q###: prefix from the displayed content
    if (!isUser) {
        cleanContent = removeQuestionPrefix(cleanContent);
    }
    
    // Check if this is a Yes/No answer
    const isYesNoAnswer = isUser && (cleanContent.toLowerCase() === 'yes' || cleanContent.toLowerCase() === 'no');
    
    return (
        <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
            {!isUser && questionNumber && (
                <div className="h-7 w-7 rounded-lg bg-blue-600 flex items-center justify-center mt-0.5 flex-shrink-0">
                    <span className="text-xs font-bold text-white">{questionNumber}</span>
                </div>
            )}
            {!isUser && !questionNumber && (
                <div className="h-7 w-7 rounded-lg bg-slate-700 flex items-center justify-center mt-0.5 flex-shrink-0">
                    <div className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                </div>
            )}
            <div className={cn("max-w-[85%]", isUser && "flex flex-col items-end")}>
                {cleanContent && (
                    <div className="relative group">
                        <div className={cn(
                            "rounded-2xl px-4 py-2.5",
                            isUser ? "bg-slate-800 text-white" : "bg-slate-800 text-white"
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
                                            <a {...props} target="_blank" rel="noopener noreferrer" className="text-blue-300 hover:text-blue-200">{children}</a>
                                        ),
                                        p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,
                                        ul: ({ children }) => <ul className="my-1 ml-4 list-disc">{children}</ul>,
                                        ol: ({ children }) => <ol className="my-1 ml-4 list-decimal">{children}</ol>,
                                        li: ({ children }) => <li className="my-0.5">{children}</li>,
                                        h1: ({ children }) => <h1 className="text-lg font-semibold my-2">{children}</h1>,
                                        h2: ({ children }) => <h2 className="text-base font-semibold my-2">{children}</h2>,
                                        h3: ({ children }) => <h3 className="text-sm font-semibold my-2">{children}</h3>,
                                        blockquote: ({ children }) => (
                                            <blockquote className="border-l-2 border-slate-500 pl-3 my-2 text-slate-300">
                                                {children}
                                            </blockquote>
                                        ),
                                    }}
                                >
                                    {cleanContent}
                                </ReactMarkdown>
                            )}
                        </div>
                        
                        {/* Edit button for Yes/No answers */}
                        {isYesNoAnswer && onEditResponse && (
                            <div className="absolute -bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="flex gap-2">
                                    {cleanContent.toLowerCase() === 'no' ? (
                                        <Button
                                            size="sm"
                                            onClick={() => onEditResponse(message, 'Yes')}
                                            className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs px-3"
                                        >
                                            Change to Yes
                                        </Button>
                                    ) : (
                                        <Button
                                            size="sm"
                                            onClick={() => onEditResponse(message, 'No')}
                                            className="bg-red-600 hover:bg-red-700 text-white h-7 text-xs px-3"
                                        >
                                            Change to No
                                        </Button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}, (prevProps, nextProps) => {
    // Only re-render if content actually changed
    return prevProps.message.content === nextProps.message.content &&
           prevProps.message.id === nextProps.message.id;
});

MessageBubble.displayName = 'MessageBubble';

export default MessageBubble;