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
import { MessageSquare, FileText } from "lucide-react";
import { groupTranscriptIntoPairs } from "../utils/transcriptLogger";

export default function CanonicalTranscriptRenderer({ session, searchTerm = "", showOnlyFollowUps = false }) {
  const originalEntries = session?.transcript_snapshot || [];
  
  console.log("[TRANSCRIPT][SESSION_DETAILS] Loaded entries:", originalEntries.length);
  
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
  
  return (
    <div className="space-y-3 max-w-4xl">
      {sortedEntries.map((entry, idx) => (
        <TranscriptEntry key={entry.index || idx} entry={entry} />
      ))}
    </div>
  );
}

function TranscriptEntry({ entry }) {
  // Determine if this is a question or answer
  const isQuestion = entry.eventType === 'question' || 
                     entry.eventType === 'base_question' ||
                     entry.eventType === 'followup_question' ||
                     entry.kind === 'base_question' ||
                     entry.kind === 'deterministic_followup_question' ||
                     entry.kind === 'v2_pack_followup' ||
                     entry.kind === 'v2_pack_ai_followup' ||
                     entry.kind === 'ai_probe_question' ||
                     Boolean(entry.questionText || entry.questionCode);
  
  const isAnswer = entry.eventType === 'answer' ||
                   entry.eventType === 'base_answer' ||
                   entry.eventType === 'followup_answer' ||
                   entry.kind === 'base_answer' ||
                   entry.kind === 'deterministic_followup_answer' ||
                   entry.kind === 'ai_probe_answer' ||
                   Boolean(entry.answer || entry.answerText || entry.responseText);
  
  const isFollowUp = Boolean(entry.packId) || 
                     entry.eventType === 'followup_question' ||
                     entry.kind === 'deterministic_followup_question' ||
                     entry.kind === 'v2_pack_followup' ||
                     entry.kind === 'v2_pack_ai_followup' ||
                     entry.kind === 'ai_probe_question';
  
  // Extract text content
  const text = entry.questionText || entry.text || entry.content || 
               entry.answer || entry.answerText || entry.responseText || "";
  
  // Extract metadata
  const questionCode = entry.questionCode || "";
  const sectionName = entry.sectionName || entry.category || "";
  const timestamp = entry.timestamp || entry.createdAt;
  
  if (isQuestion) {
    return (
      <div className="flex gap-3">
        <div className="flex-shrink-0 w-24 pt-1">
          <div className="text-xs font-medium text-slate-600">
            {questionCode && <div className="mb-0.5">{questionCode}</div>}
            <div className="text-slate-500">Interviewer</div>
          </div>
        </div>
        <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-4">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-slate-600" />
              {sectionName && (
                <span className="text-xs text-slate-600 font-medium">
                  {sectionName}
                </span>
              )}
              {isFollowUp && (
                <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                  Follow-up
                </Badge>
              )}
            </div>
            {timestamp && (
              <span className="text-xs text-slate-400">
                {new Date(timestamp).toLocaleTimeString()}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
            {text}
          </p>
        </div>
      </div>
    );
  }
  
  if (isAnswer) {
    return (
      <div className="flex gap-3">
        <div className="flex-shrink-0 w-24 pt-1">
          <div className="text-xs font-medium text-green-700">
            Candidate
          </div>
        </div>
        <div className="flex-1 bg-white border border-green-200 rounded-lg p-4">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-xs text-slate-600 font-medium">Answer</span>
            </div>
            {timestamp && (
              <span className="text-xs text-slate-400">
                {new Date(timestamp).toLocaleTimeString()}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
            {text}
          </p>
        </div>
      </div>
    );
  }
  
  // Fallback for unknown entry types
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-24 pt-1">
        <div className="text-xs font-medium text-slate-500">
          System
        </div>
      </div>
      <div className="flex-1 bg-slate-100 border border-slate-200 rounded-lg p-4">
        <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
          {text}
        </p>
      </div>
    </div>
  );
}