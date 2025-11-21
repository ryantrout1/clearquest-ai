import React from "react";
import { Badge } from "@/components/ui/badge";
import { Shield, Layers, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveFollowupQuestionText } from "../utils/transcriptBuilder";

const REVIEW_KEYWORDS = [
  'arrest', 'fired', 'failed', 'polygraph', 'investigated',
  'suspended', 'terminated', 'dui', 'drugs', 'felony', 'charge',
  'conviction', 'probation', 'parole', 'violence', 'assault', 'disqualified'
];

const needsReview = (text) => {
  const lower = String(text || '').toLowerCase();
  return REVIEW_KEYWORDS.some(keyword => lower.includes(keyword));
};

/**
 * Renders structured view: events grouped by base question
 */
export function StructuredEventRenderer({ event, followUpQuestionEntities, questionNumber }) {
  const { kind, role, text, instanceNumber, followupPackId, fieldKey } = event;

  // Base question
  if (kind === "base_question") {
    return (
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3 mb-2">
        <div className="flex items-center gap-2 mb-1.5">
          <Shield className="w-4 h-4 text-blue-400" />
          <span className="text-xs text-slate-400">Base Question</span>
        </div>
        <p className="text-white text-sm leading-relaxed">{text}</p>
      </div>
    );
  }

  // Base answer
  if (kind === "base_answer") {
    return (
      <div className="flex justify-end mb-3">
        <div className="bg-blue-600 rounded-lg px-4 py-2 max-w-md">
          <p className="text-white text-sm font-medium">{text}</p>
        </div>
      </div>
    );
  }

  // Deterministic follow-up question
  if (kind === "deterministic_followup_question") {
    const resolvedText = resolveFollowupQuestionText(fieldKey || text, followupPackId, followUpQuestionEntities);
    
    return (
      <div className="mb-1">
        <p className="text-orange-200 text-xs leading-snug">{resolvedText}</p>
      </div>
    );
  }

  // Deterministic follow-up answer
  if (kind === "deterministic_followup_answer") {
    const requiresReview = needsReview(text);
    
    return (
      <div className="flex items-center gap-2 mb-2">
        <div className="bg-orange-600 rounded px-3 py-1 inline-block">
          <p className="text-white text-xs font-medium">{text}</p>
        </div>
        {requiresReview && (
          <Badge className="text-xs bg-yellow-500/20 text-yellow-300 border-yellow-500/30 flex-shrink-0">
            Needs Review
          </Badge>
        )}
      </div>
    );
  }

  // AI probe question
  if (kind === "ai_probe_question") {
    return (
      <div className="mb-1 mt-2">
        <div className="flex items-start gap-1.5">
          <AlertCircle className="w-3 h-3 text-purple-400 flex-shrink-0 mt-0.5" />
          <span className="text-xs text-purple-400 font-medium">Investigator Follow-Up:</span>
        </div>
        <p className="text-purple-200 text-xs leading-snug ml-4">{text}</p>
      </div>
    );
  }

  // AI probe answer
  if (kind === "ai_probe_answer") {
    return (
      <div className="flex items-center gap-2 mb-2 ml-4">
        <div className="bg-purple-600 rounded px-3 py-1 inline-block">
          <p className="text-white text-xs font-medium">{text}</p>
        </div>
      </div>
    );
  }

  // Multi-instance prompt
  if (kind === "multi_instance_prompt") {
    return (
      <div className="bg-cyan-950/30 border border-cyan-800/50 rounded-lg p-3 mb-2">
        <div className="flex items-start gap-2">
          <span className="text-xs text-cyan-400 font-medium">Additional Instance Check:</span>
          <p className="text-white text-sm">{text}</p>
        </div>
      </div>
    );
  }

  // Multi-instance answer
  if (kind === "multi_instance_answer") {
    return (
      <div className="flex justify-end mb-2">
        <div className="bg-cyan-600 rounded-lg px-4 py-2 max-w-md">
          <p className="text-white text-sm font-medium">{text}</p>
        </div>
      </div>
    );
  }

  return null;
}

/**
 * Renders transcript view: all events in chronological order
 */
export function TranscriptEventRenderer({ event, followUpQuestionEntities, questionNumber }) {
  const { kind, role, text, instanceNumber, followupPackId, fieldKey } = event;

  // Base question
  if (kind === "base_question") {
    return (
      <div className="space-y-2">
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <Badge variant="outline" className="text-xs text-blue-400 border-blue-500/30">
              Q{String(questionNumber).padStart(3, '0')}
            </Badge>
          </div>
          <p className="text-white text-sm">{text}</p>
        </div>
      </div>
    );
  }

  // Base answer
  if (kind === "base_answer") {
    return (
      <div className="flex justify-end mb-3">
        <div className="bg-blue-600 rounded-lg px-4 py-2 max-w-md">
          <p className="text-white text-sm font-medium">{text}</p>
        </div>
      </div>
    );
  }

  // Deterministic follow-up question
  if (kind === "deterministic_followup_question") {
    const resolvedText = resolveFollowupQuestionText(fieldKey || text, followupPackId, followUpQuestionEntities);
    
    return (
      <div className="ml-4 md:ml-8">
        <div className="bg-orange-950/30 border border-orange-800/50 rounded-lg p-3 mb-2">
          <p className="text-white text-sm">{resolvedText}</p>
        </div>
      </div>
    );
  }

  // Deterministic follow-up answer
  if (kind === "deterministic_followup_answer") {
    const requiresReview = needsReview(text);
    
    return (
      <div className="ml-4 md:ml-8 flex justify-end mb-2">
        <div className="bg-orange-600 rounded-lg px-4 py-2 max-w-md">
          <p className="text-white text-sm break-words">{text}</p>
          {requiresReview && (
            <Badge className="mt-1 text-xs bg-yellow-500/20 text-yellow-300 border-yellow-500/30">
              Needs Review
            </Badge>
          )}
        </div>
      </div>
    );
  }

  // AI probe question
  if (kind === "ai_probe_question") {
    return (
      <div className="ml-4 md:ml-8">
        <div className="bg-purple-950/30 border border-purple-800/50 rounded-lg p-3 mb-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
            <div>
              <span className="text-xs text-purple-400 font-medium">Investigator:</span>
              <p className="text-white text-sm mt-0.5 leading-relaxed">{text}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // AI probe answer
  if (kind === "ai_probe_answer") {
    return (
      <div className="ml-4 md:ml-8 flex justify-end mb-2">
        <div className="bg-purple-600 rounded-lg px-4 py-2 max-w-md">
          <p className="text-white text-sm break-words">{text}</p>
        </div>
      </div>
    );
  }

  // Multi-instance prompt
  if (kind === "multi_instance_prompt") {
    return (
      <div className="ml-4 md:ml-8">
        <div className="bg-cyan-950/30 border border-cyan-800/50 rounded-lg p-3 mb-2">
          <p className="text-white text-sm">{text}</p>
        </div>
      </div>
    );
  }

  // Multi-instance answer
  if (kind === "multi_instance_answer") {
    return (
      <div className="ml-4 md:ml-8 flex justify-end mb-3">
        <div className="bg-cyan-600 rounded-lg px-4 py-2 max-w-md">
          <p className="text-white text-sm font-medium">{text}</p>
        </div>
      </div>
    );
  }

  return null;
}