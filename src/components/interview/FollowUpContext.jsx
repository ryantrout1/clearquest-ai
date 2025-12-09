import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

/**
 * FollowUpContext - Shows prior question and answer as compact, expandable context
 * Displays at the top of follow-up cards to provide context without duplicating
 */
export default function FollowUpContext({ originalQuestionText, priorAnswer }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  if (!priorAnswer || priorAnswer.trim().length === 0) {
    return null;
  }
  
  const MAX_CHARS = 220;
  const shouldTruncate = priorAnswer.length > MAX_CHARS;
  
  const truncatedAnswer = shouldTruncate 
    ? priorAnswer.substring(0, MAX_CHARS) + "…" 
    : priorAnswer;
  
  const displayAnswer = isExpanded ? priorAnswer : truncatedAnswer;
  
  return (
    <div className="mb-4 pb-4 border-b border-slate-700/50">
      <div className="text-xs font-medium text-slate-500 mb-2">
        Context from earlier in this interview
      </div>
      
      {originalQuestionText && (
        <div className="mb-2">
          <span className="text-xs text-slate-500">Prior question: </span>
          <span className="text-xs text-slate-400">{originalQuestionText}</span>
        </div>
      )}
      
      <div>
        <span className="text-xs text-slate-500">Your answer: </span>
        <span className="text-sm text-slate-300 leading-relaxed">{displayAnswer}</span>
      </div>
      
      {shouldTruncate && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs text-blue-400 hover:text-blue-300 mt-1 flex items-center gap-1"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-3 h-3" />
              Hide full answer
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3" />
              Show full answer
            </>
          )}
        </button>
      )}
    </div>
  );
}