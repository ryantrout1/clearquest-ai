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
  
  const pairs = groupTranscriptIntoPairs(filteredEntries);
  
  return (
    <div className="space-y-4">
      {pairs.map((pair, idx) => (
        <TranscriptPair key={pair.question.index} pair={pair} pairNumber={idx + 1} />
      ))}
    </div>
  );
}

function TranscriptPair({ pair, pairNumber }) {
  const question = pair.question;
  const answers = pair.answers;
  
  const isFollowUp = Boolean(question.packId);
  
  return (
    <Card className="bg-white border-slate-200">
      <CardContent className="p-5 space-y-3">
        {/* Question */}
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <MessageSquare className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-slate-500">
                  Question {pairNumber}
                </span>
                {isFollowUp && (
                  <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                    Follow-up
                  </Badge>
                )}
              </div>
              <p className="text-sm text-slate-800 leading-relaxed">
                {question.text}
              </p>
            </div>
          </div>
        </div>
        
        {/* Answers */}
        {answers.map((answer, ansIdx) => (
          <div key={answer.index} className="ml-6 pl-4 border-l-2 border-slate-200">
            <div className="flex items-start gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-500 mb-1">
                  Answer
                </p>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {answer.text}
                </p>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}