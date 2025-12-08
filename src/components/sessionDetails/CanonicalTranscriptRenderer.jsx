/**
 * Canonical Transcript Renderer
 * 
 * Renders the legal interview transcript from the canonical transcript_snapshot.
 * Uses exact question and answer text as seen by the candidate.
 * 
 * NO RECOMPUTATION OR PARAPHRASING - this is the legal record.
 */

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, FileText, CheckCircle } from "lucide-react";

export default function CanonicalTranscriptRenderer({ session, searchTerm = "", showOnlyFollowUps = false }) {
  const originalEntries = session?.transcript_snapshot || [];
  
  console.log("[TRANSCRIPT][SESSION_DETAILS] Loaded entries:", originalEntries.length);
  console.log("[TRANSCRIPT][ENTRY_SAMPLE]", originalEntries?.slice(0, 3));
  
  // STEP 2: Apply filters
  let filteredEntries = originalEntries;
  
  // Filter by search term
  if (searchTerm && searchTerm.trim() !== "") {
    const searchLower = searchTerm.toLowerCase();
    filteredEntries = filteredEntries.filter(entry => {
      const textFields = [
        entry.text,
        entry.content,
        entry.questionText,
        entry.answer
      ].filter(Boolean);
      
      return textFields.some(field => 
        String(field).toLowerCase().includes(searchLower)
      );
    });
  }
  
  // Filter by follow-ups only
  if (showOnlyFollowUps) {
    filteredEntries = filteredEntries.filter(entry => {
      const isFollowup = entry.eventType === 'followup_question' ||
                         entry.kind === 'deterministic_followup_question' ||
                         entry.kind === 'v2_pack_followup' ||
                         entry.kind === 'v2_pack_ai_followup' ||
                         entry.kind === 'ai_probe_question' ||
                         entry.eventType === 'followup_answer' ||
                         entry.kind === 'deterministic_followup_answer' ||
                         entry.kind === 'ai_probe_answer' ||
                         Boolean(entry.packId);
      return isFollowup;
    });
  }
  
  const originalCount = originalEntries.length;
  const filteredCount = filteredEntries.length;
  
  console.log('[TRANSCRIPT][FILTER]', { originalCount, filteredCount, searchTerm, showOnlyFollowUps });
  
  // STEP 3: Empty state when filters hide everything
  if (originalCount > 0 && filteredCount === 0) {
    return (
      <div className="rounded-xl bg-slate-900/50 border border-slate-700 p-8">
        <div className="text-center space-y-2">
          <p className="text-slate-300 text-sm font-medium">
            No transcript entries match your filters
          </p>
          <p className="text-slate-400 text-xs">
            Try turning off 'Follow-Ups Only' or clearing your search to see the full interview timeline.
          </p>
        </div>
      </div>
    );
  }
  
  if (originalCount === 0) {
    return (
      <Card className="bg-yellow-50 border-yellow-200">
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <FileText className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div>
              <p className="text-sm text-yellow-800 font-medium mb-1">
                Legacy Session - No Canonical Transcript
              </p>
              <p className="text-xs text-yellow-700 leading-relaxed">
                This session was created before the canonical transcript system was implemented. 
                The transcript below is reconstructed from Response records and may not reflect 
                the exact question text shown to the candidate.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  // STEP 2: Sort chronologically by timestamp
  const sortedEntries = [...filteredEntries].sort((a, b) => {
    const timeA = a.timestamp || a.createdAt || a.index || 0;
    const timeB = b.timestamp || b.createdAt || b.index || 0;
    return timeA - timeB;
  });
  
  // STEP 1: Add entry-level debug (one log per entry)
  sortedEntries.forEach((entry, index) => {
    console.log("[TRANSCRIPT][ENTRY_DEBUG]", {
      index,
      kind: entry.kind || entry.eventType || entry.type,
      actor: entry.actor || entry.role || entry.source,
      questionId: entry.questionId,
      responseId: entry.responseId,
      questionCode: entry.questionCode,
      hasQuestionText: !!entry.questionText,
      hasText: !!entry.text,
      hasContent: !!entry.content,
      hasAnswerText: !!entry.answerText,
      hasAnswer: !!entry.answer,
      hasResponseText: !!entry.responseText,
    });
  });
  
  return (
    <div className="space-y-3 max-w-4xl">
      {sortedEntries.map((entry, idx) => (
        <TranscriptEntry key={entry.index || entry.id || idx} entry={entry} idx={idx} />
      ))}
    </div>
  );
}

function TranscriptEntry({ entry, idx }) {
  const entryKind = entry.kind || entry.eventType || entry.type || "";
  const messageText = entry.text || entry.questionText || entry.content || entry.answer || entry.answerText || entry.responseText || "";
  const sectionName = entry.sectionName || entry.category || "";
  const timestamp = entry.timestamp || entry.createdAt;
  const questionCode = entry.questionCode || entry.code || "";
  const packId = entry.packId || entry.followupPackId || "";
  
  // SECTION START / DIVIDER
  if (entryKind === 'section_start' || entryKind === 'section_transition') {
    return (
      <div className="mt-6 mb-2 text-xs uppercase tracking-wide text-slate-400">
        {sectionName || 'Section'}
      </div>
    );
  }
  
  // SECTION COMPLETE CARD
  if (entryKind === 'section_complete' || entryKind === 'section_completion') {
    return (
      <div className="mt-3 rounded-xl border border-emerald-500/50 bg-emerald-900/40 px-4 py-3 text-xs text-emerald-50 shadow-sm">
        <div className="flex items-center gap-2 font-semibold">
          <CheckCircle className="w-4 h-4" />
          <span>Section Complete: {sectionName || 'Section'}</span>
        </div>
        {messageText && (
          <div className="mt-1 text-[11px] text-emerald-100/80">
            {messageText}
          </div>
        )}
      </div>
    );
  }
  
  // SYSTEM NOTE
  if (entryKind === 'system' || entryKind === 'system_message' || entryKind === 'system_welcome') {
    return (
      <div className="flex justify-center my-2">
        <div className="rounded-full bg-slate-800/80 px-3 py-1.5 text-[11px] text-slate-200">
          {messageText || '[System message]'}
        </div>
      </div>
    );
  }
  
  // Determine if question or answer
  const isQuestion = entryKind.includes('question') || entryKind === 'base_question' || Boolean(entry.questionText);
  const isAnswer = entryKind.includes('answer') || entryKind === 'base_answer' || Boolean(entry.answer || entry.answerText);
  const isCandidateAnswer = isAnswer || entry.role === 'candidate';
  
  // Determine if follow-up pack question (purple bubble)
  const isFollowupQuestion = isQuestion && (
    packId || 
    entryKind.includes('followup') || 
    entryKind.includes('probe') ||
    entryKind === 'deterministic_followup_question' ||
    entryKind === 'v2_pack_followup' ||
    entryKind === 'ai_probe_question'
  );
  
  // Determine bubble styling
  let bubbleClasses = 'max-w-3xl rounded-xl border px-4 py-3 text-sm shadow-sm';
  
  if (isFollowupQuestion) {
    // Purple bubble for follow-up pack questions
    bubbleClasses += ' bg-purple-900/70 border-purple-500/70 text-purple-50';
  } else if (isQuestion) {
    // Blue bubble for standard investigator questions
    bubbleClasses += ' bg-sky-900/70 border-sky-500/70 text-sky-50';
  } else if (isCandidateAnswer) {
    // Candidate answer styling
    bubbleClasses += ' bg-slate-900/80 border-slate-600/60 text-slate-50';
  } else {
    // Default styling
    bubbleClasses += ' bg-slate-900/80 border-slate-600/60 text-slate-50';
  }
  
  const roleLabel = isCandidateAnswer ? 'Candidate' : 'Investigator';
  const timeLabel = formatTranscriptTime(timestamp);
  
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-[11px] text-slate-400">
        <span className="font-medium">
          {roleLabel}
          {isFollowupQuestion ? ' · Follow-up' : ''}
        </span>
        {timeLabel && <span className="text-slate-500">• {timeLabel}</span>}
      </div>
      <div className={bubbleClasses}>
        {/* Optional header line for questions */}
        {isQuestion && (sectionName || questionCode) && (
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-80">
            {questionCode && <span>{questionCode}</span>}
            {questionCode && sectionName && <span> · </span>}
            {sectionName && <span>{sectionName}</span>}
          </div>
        )}
        <div className="whitespace-pre-wrap leading-relaxed">
          {messageText || '[No text recorded for this event]'}
        </div>
      </div>
    </div>
  );
}

function formatTranscriptTime(timestamp) {
  if (!timestamp) return '';
  try {
    const d = new Date(timestamp);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}