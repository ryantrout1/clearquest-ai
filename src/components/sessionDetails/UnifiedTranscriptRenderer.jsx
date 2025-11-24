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
export function StructuredEventRenderer({ event, nextEvent, followUpQuestionEntities, questionNumber, isFirstAiProbing }) {
  const { kind, role, text, instanceNumber, followupPackId, fieldKey } = event;

  // Base question and answer not rendered here (handled in CompactQuestionRow)
  if (kind === "base_question" || kind === "base_answer") {
    return null;
  }

  // Deterministic follow-up Q&A on separate lines with clear labels
  if (kind === "deterministic_followup_question" && nextEvent?.kind === "deterministic_followup_answer") {
    const resolvedText = resolveFollowupQuestionText(fieldKey || text, followupPackId, followUpQuestionEntities);
    const answerText = nextEvent.text;
    
    return (
      <div className="mb-2 text-xs">
        <div className="mb-1">
          <span className="text-slate-400 font-medium">Follow-Up Question:</span>
          <p className="text-slate-300 mt-0.5 leading-relaxed">{resolvedText}</p>
        </div>
        <div>
          <span className="text-slate-400 font-medium">Candidate Response:</span>
          <p className="text-white mt-0.5 leading-relaxed">{answerText}</p>
        </div>
      </div>
    );
  }

  // Skip standalone answer (already rendered with question)
  if (kind === "deterministic_followup_answer") {
    return null;
  }

  // AI probing Q&A together (handles both ai_probe_question and ai_question)
  if ((kind === "ai_probe_question" || kind === "ai_question") && 
      (nextEvent?.kind === "ai_probe_answer" || nextEvent?.kind === "ai_answer")) {
    return (
      <div className="mb-2">
        {isFirstAiProbing && (
          <div className="text-xs font-semibold text-purple-400 mb-2 mt-3 pt-2 border-t border-purple-500/20">
            🔍 AI Investigator Probing
          </div>
        )}
        <div className="text-xs pl-2 border-l-2 border-purple-500/20">
          <div className="mb-1">
            <span className="text-purple-400 font-medium">AI Investigator Question:</span>
            <p className="text-slate-300 mt-0.5 leading-relaxed">{text}</p>
          </div>
          <div className="text-xs mt-1">
            <span className="text-slate-400 font-medium">Candidate Response:</span>
            <p className="text-white mt-0.5 leading-relaxed">{nextEvent.text}</p>
          </div>
        </div>
      </div>
    );
  }

  // Skip standalone AI answer (already rendered with question)
  if (kind === "ai_probe_answer" || kind === "ai_answer") {
    return null;
  }

  return null;
}

/**
 * Renders transcript view: all events in chronological order
 * MATCHES THE INTERVIEW CHAT HISTORY EXACTLY
 */
export function TranscriptEventRenderer({ event, followUpQuestionEntities, questionNumber, sectionName }) {
  const { kind, role, text, instanceNumber, followupPackId, fieldKey } = event;

  // Base question with answer combined (matches CandidateInterview HistoryEntry)
  if (kind === "base_question") {
    return (
      <div className="space-y-3">
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5 opacity-85">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0">
              <Shield className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm font-bold text-blue-400">
                  Question {questionNumber}
                </span>
                <span className="text-xs text-slate-500">•</span>
                <span className="text-sm font-medium text-slate-300">{sectionName || ''}</span>
              </div>
              <p className="text-white leading-relaxed">{text}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Base answer
  if (kind === "base_answer") {
    return (
      <div className="flex justify-end">
        <div className="bg-blue-600 rounded-xl px-5 py-3 max-w-2xl">
          <p className="text-white font-medium">{text}</p>
        </div>
      </div>
    );
  }

  // Deterministic follow-up question (matches CandidateInterview format)
  if (kind === "deterministic_followup_question") {
    const resolvedText = resolveFollowupQuestionText(fieldKey || text, followupPackId, followUpQuestionEntities);
    
    return (
      <div className="space-y-3">
        <div className="bg-orange-950/30 border border-orange-800/50 rounded-xl p-5 opacity-85">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-orange-600/20 flex items-center justify-center flex-shrink-0">
              <Layers className="w-3.5 h-3.5 text-orange-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm font-semibold text-orange-400">Follow-up</span>
                <span className="text-xs text-slate-500">•</span>
                <span className="text-sm text-orange-300">Follow-up Questions</span>
              </div>
              <p className="text-white leading-relaxed">{resolvedText}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Deterministic follow-up answer
  if (kind === "deterministic_followup_answer") {
    return (
      <div className="flex justify-end">
        <div className="bg-orange-600 rounded-xl px-5 py-3 max-w-2xl">
          <p className="text-white font-medium">{text}</p>
        </div>
      </div>
    );
  }

  // AI probe question (matches CandidateInterview format)
  if (kind === "ai_probe_question" || kind === "ai_question") {
    return (
      <div className="space-y-3">
        <div className="bg-purple-950/30 border border-purple-800/50 rounded-xl p-5 opacity-85">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-purple-600/20 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm font-semibold text-purple-400">AI Investigator</span>
                <span className="text-xs text-slate-500">•</span>
                <span className="text-sm text-purple-300">Story Clarification</span>
              </div>
              <p className="text-white leading-relaxed">{text}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // AI probe answer
  if (kind === "ai_probe_answer" || kind === "ai_answer") {
    return (
      <div className="flex justify-end">
        <div className="bg-purple-600 rounded-xl px-5 py-3 max-w-2xl">
          <p className="text-white font-medium">{text}</p>
        </div>
      </div>
    );
  }

  // Multi-instance prompt
  if (kind === "multi_instance_prompt") {
    return (
      <div className="space-y-3">
        <div className="bg-cyan-950/30 border border-cyan-800/50 rounded-xl p-5 opacity-85">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-cyan-600/20 flex items-center justify-center flex-shrink-0">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm font-semibold text-cyan-400">Additional Instance Check</span>
              </div>
              <p className="text-white leading-relaxed">{text}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Multi-instance question
  if (kind === "multi_instance_question") {
    return (
      <div className="space-y-3">
        <div className="bg-cyan-950/30 border border-cyan-800/50 rounded-xl p-5 opacity-85">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-cyan-600/20 flex items-center justify-center flex-shrink-0">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm font-semibold text-cyan-400">Additional Instance Check</span>
              </div>
              <p className="text-white leading-relaxed">{text}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Multi-instance answer
  if (kind === "multi_instance_answer") {
    return (
      <div className="flex justify-end">
        <div className="bg-cyan-600 rounded-xl px-5 py-3 max-w-2xl">
          <p className="text-white font-medium">{text}</p>
        </div>
      </div>
    );
  }

  // System message
  if (kind === "system_message") {
    return (
      <div className="flex justify-center my-2">
        <div className="bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 max-w-lg text-center">
          <p className="text-slate-300 text-sm">{text}</p>
        </div>
      </div>
    );
  }

  // Section completion message (matches CandidateInterview format)
  if (kind === "section_completion" || kind === "section_transition") {
    return (
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5 opacity-85">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full bg-green-600/20 flex items-center justify-center flex-shrink-0">
            <Shield className="w-3.5 h-3.5 text-green-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-sm font-semibold text-green-400">Section Complete</span>
            </div>
            <p className="text-white leading-relaxed">{text}</p>
          </div>
        </div>
      </div>
    );
  }

  // Resume/welcome message
  if (kind === "resume_message" || kind === "welcome_message") {
    return (
      <div className="flex justify-center my-4">
        <div className="bg-blue-950/40 border border-blue-700/60 rounded-lg px-4 py-3 max-w-lg">
          <p className="text-blue-100 text-sm leading-relaxed">{text}</p>
        </div>
      </div>
    );
  }

  return null;
}