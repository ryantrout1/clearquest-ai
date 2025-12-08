/**
 * Canonical Transcript Renderer
 * 
 * Renders the legal interview transcript from the canonical transcript_snapshot.
 * Uses exact question and answer text as seen by the candidate.
 * Visually matches the live candidate interview UI (CandidateInterview.jsx).
 * 
 * NO RECOMPUTATION OR PARAPHRASING - this is the legal record.
 */

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

export default function CanonicalTranscriptRenderer({ session, questions = [], searchTerm = "", showOnlyFollowUps = false }) {
  const originalEntries = session?.transcript_snapshot || [];
  
  console.log("[TRANSCRIPT][SESSION_DETAILS] Loaded entries:", originalEntries.length);
  console.log("[TRANSCRIPT][ENTRY_SAMPLE]", originalEntries?.slice(0, 3));
  
  // Apply filters
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
  
  // Empty state when filters hide everything
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
            <Shield className="w-5 h-5 text-yellow-600 mt-0.5" />
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
  
  // Sort chronologically
  const sortedEntries = [...filteredEntries].sort((a, b) => {
    const timeA = a.timestamp || a.createdAt || a.index || 0;
    const timeB = b.timestamp || b.createdAt || b.index || 0;
    return timeA - timeB;
  });
  
  // Group entries into renderable blocks that match the candidate UI
  const blocks = buildTranscriptBlocks(sortedEntries, questions);
  
  return (
    <div className="space-y-4 max-w-5xl">
      {blocks.map((block, idx) => (
        <TranscriptBlock key={block.id || `block-${idx}`} block={block} />
      ))}
    </div>
  );
}

/**
 * Build renderable blocks from raw transcript entries
 * Each block represents a visual card/bubble in the candidate interview UI
 */
function buildTranscriptBlocks(entries, questions = []) {
  const blocks = [];
  let i = 0;
  
  // Build question lookup map for quick access to question_number
  const questionMap = {};
  questions.forEach(q => {
    const qId = q.id || q.question_id;
    questionMap[qId] = q.question_number;
  });
  
  // Build sequential counter for questions without question_number
  let sequentialNumber = 0;
  
  while (i < entries.length) {
    const entry = entries[i];
    const kind = entry.kind || entry.eventType || entry.type || "";
    
    // System welcome message
    if (kind === 'system_welcome') {
      blocks.push({
        id: `block-${i}`,
        type: 'system_welcome',
        text: entry.text || entry.content || 'Welcome to your ClearQuest Interview.',
        timestamp: entry.timestamp
      });
      i++;
      continue;
    }
    
    // Section completion card
    if (kind === 'section_completion' || kind === 'system_section_complete') {
      blocks.push({
        id: `block-${i}`,
        type: 'section_complete',
        completedSectionName: entry.completedSectionName || entry.sectionName,
        nextSectionName: entry.nextSectionName,
        whatToExpect: entry.whatToExpect,
        progress: entry.progress,
        timestamp: entry.timestamp
      });
      i++;
      continue;
    }
    
    // Section transition divider
    if (kind === 'section_transition' || kind === 'section_start') {
      blocks.push({
        id: `block-${i}`,
        type: 'section_divider',
        sectionName: entry.sectionName || entry.nextSectionName,
        timestamp: entry.timestamp
      });
      i++;
      continue;
    }
    
    // System message
    if (kind === 'system_message' || kind === 'system') {
      blocks.push({
        id: `block-${i}`,
        type: 'system_message',
        text: entry.text || entry.content || '[System message]',
        timestamp: entry.timestamp
      });
      i++;
      continue;
    }
    
    // Base question + answer (may be a single combined entry or two separate entries)
    if (kind === 'base_question' || kind === 'question') {
      // Check if this entry has both question and answer (combined)
      const hasAnswer = Boolean(entry.answer);
      
      // If separate, look ahead for answer
      let answerEntry = null;
      if (!hasAnswer && i + 1 < entries.length) {
        const nextEntry = entries[i + 1];
        const nextKind = nextEntry.kind || nextEntry.eventType || nextEntry.type || "";
        if (nextKind === 'base_answer' || nextKind === 'answer') {
          answerEntry = nextEntry;
        }
      }
      
      // Get question ID from various possible field names
      const questionId = entry.questionId || entry.baseQuestionId || entry.id;
      
      // Try to get question_number from Question entity, fallback to sequential
      let questionNumber = questionMap[questionId];
      if (!questionNumber) {
        sequentialNumber++;
        questionNumber = sequentialNumber;
      }
      
      blocks.push({
        id: `block-${i}`,
        type: 'main_question',
        questionNumber: questionNumber,
        questionCode: entry.questionCode || entry.code,
        questionText: entry.questionText || entry.text || entry.content,
        answer: entry.answer || answerEntry?.answer || answerEntry?.text,
        sectionName: entry.sectionName || entry.category,
        timestamp: entry.timestamp,
        questionId: questionId
      });
      
      // Skip the answer entry if we consumed it
      if (answerEntry) {
        i += 2;
      } else {
        i++;
      }
      continue;
    }
    
    // Follow-up question (deterministic or AI probe)
    const isFollowupQuestion = kind === 'deterministic_followup_question' ||
                               kind === 'v2_pack_followup' ||
                               kind === 'ai_probe_question' ||
                               kind === 'followup_question';
    
    if (isFollowupQuestion) {
      // Look ahead for answer
      let answerEntry = null;
      const hasEmbeddedAnswer = Boolean(entry.answer);
      
      if (!hasEmbeddedAnswer && i + 1 < entries.length) {
        const nextEntry = entries[i + 1];
        const nextKind = nextEntry.kind || nextEntry.eventType || nextEntry.type || "";
        const isFollowupAnswer = nextKind === 'deterministic_followup_answer' ||
                                 nextKind === 'ai_probe_answer' ||
                                 nextKind === 'followup_answer';
        
        // Match by packId and fieldKey to ensure we're pairing the right Q&A
        const sameContext = nextEntry.packId === entry.packId &&
                            nextEntry.fieldKey === entry.fieldKey &&
                            (nextEntry.instanceNumber || 1) === (entry.instanceNumber || 1);
        
        if (isFollowupAnswer && sameContext) {
          answerEntry = nextEntry;
        }
      }
      
      blocks.push({
        id: `block-${i}`,
        type: 'followup_question',
        questionText: entry.questionText || entry.text || entry.content,
        answer: entry.answer || answerEntry?.answer || answerEntry?.text,
        packId: entry.packId || entry.followupPackId,
        fieldKey: entry.fieldKey,
        instanceNumber: entry.instanceNumber || 1,
        isAiProbe: kind === 'ai_probe_question',
        timestamp: entry.timestamp
      });
      
      // Skip answer entry if consumed
      if (answerEntry) {
        i += 2;
      } else {
        i++;
      }
      continue;
    }
    
    // Multi-instance question/answer
    if (kind === 'multi_instance_question') {
      let answerEntry = null;
      if (i + 1 < entries.length) {
        const nextEntry = entries[i + 1];
        const nextKind = nextEntry.kind || nextEntry.eventType || nextEntry.type || "";
        if (nextKind === 'multi_instance_answer') {
          answerEntry = nextEntry;
        }
      }
      
      blocks.push({
        id: `block-${i}`,
        type: 'multi_instance',
        questionText: entry.text || entry.content,
        answer: answerEntry?.text || answerEntry?.content,
        packId: entry.packId,
        instanceNumber: entry.instanceNumber,
        timestamp: entry.timestamp
      });
      
      if (answerEntry) {
        i += 2;
      } else {
        i++;
      }
      continue;
    }
    
    // Fallback: skip unhandled entries
    i++;
  }
  
  return blocks;
}

/**
 * Render a single transcript block matching the candidate UI
 */
function TranscriptBlock({ block }) {
  const { type, timestamp } = block;
  const timeLabel = formatTranscriptTime(timestamp);
  
  // System welcome message
  if (type === 'system_welcome') {
    return (
      <div className="space-y-2">
        <RoleTimestamp role="System" time={timeLabel} />
        <div className="bg-slate-800/95 backdrop-blur-sm border-2 border-blue-500/50 rounded-xl p-6 shadow-2xl">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0 border-2 border-blue-500/50">
              <Shield className="w-6 h-6 text-blue-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-white mb-2">
                Welcome to your ClearQuest Interview
              </h2>
              <p className="text-slate-300 text-sm leading-relaxed">
                This interview is part of your application process. One question at a time, at your own pace.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Section complete card (compact)
  if (type === 'section_complete') {
    // Calculate section time if available
    const sectionTimeText = block.sectionTime ? `Completed in ${block.sectionTime}` : null;
    
    return (
      <div className="space-y-2">
        <RoleTimestamp role="System" time={timeLabel} />
        <div className="bg-gradient-to-br from-emerald-900/60 to-emerald-800/40 backdrop-blur-sm border border-emerald-500/40 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-600/30 flex items-center justify-center flex-shrink-0 border border-emerald-500/50">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-white leading-tight">
                Section Complete: {block.completedSectionName}
              </h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {sectionTimeText && (
                  <>
                    <span className="text-emerald-300 text-sm">{sectionTimeText}</span>
                    <span className="text-emerald-400/50">•</span>
                  </>
                )}
                <span className="text-emerald-300 text-sm">
                  {block.progress?.completedSections || 0} of {block.progress?.totalSections || 0} sections complete
                </span>
                {block.progress?.answeredQuestions && (
                  <>
                    <span className="text-emerald-400/50">•</span>
                    <Badge className="bg-emerald-600/20 text-emerald-300 border-emerald-500/30 text-xs px-2 py-0">
                      {block.progress.answeredQuestions} questions answered
                    </Badge>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Section divider
  if (type === 'section_divider') {
    return (
      <div className="mt-8 mb-4 text-sm uppercase tracking-wide text-slate-400 font-semibold">
        {block.sectionName}
      </div>
    );
  }
  
  // System message
  if (type === 'system_message') {
    return (
      <div className="flex justify-center my-3">
        <div className="rounded-full bg-slate-800/80 px-4 py-2 text-xs text-slate-200">
          {block.text}
        </div>
      </div>
    );
  }
  
  // Main question card (blue) with optional Yes/No chip
  if (type === 'main_question') {
    const isYesNo = block.answer === 'Yes' || block.answer === 'No';
    const hasTextAnswer = block.answer && !isYesNo;
    
    return (
      <div className="space-y-3">
        <RoleTimestamp role="Investigator" time={timeLabel} />
        
        {/* Blue question card matching candidate UI */}
        <div className="bg-[#1a2744] border border-slate-700/60 rounded-xl p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base font-semibold text-blue-400">
                  Question {block.questionNumber || ''}
                </span>
                {block.sectionName && (
                  <>
                    <span className="text-sm text-slate-500">•</span>
                    <span className="text-sm font-medium text-slate-300">{block.sectionName}</span>
                  </>
                )}
              </div>
              <p className="text-white text-base leading-relaxed">{block.questionText}</p>
            </div>
            
            {/* Yes/No chip on the right side of card */}
            {isYesNo && (
              <div className={cn(
                "flex-shrink-0 px-4 py-2 rounded-lg font-semibold",
                block.answer === 'Yes' ? "bg-green-600" : "bg-red-600"
              )}>
                <span className="text-white">{block.answer}</span>
              </div>
            )}
          </div>
        </div>
        
        {/* Text answer bubble (purple) below question */}
        {hasTextAnswer && (
          <>
            <RoleTimestamp role="Candidate" time={timeLabel} />
            <div className="flex justify-end">
              <div className="bg-purple-600 rounded-xl px-5 py-3 max-w-3xl">
                <p className="text-white">{block.answer}</p>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }
  
  // Follow-up question card (purple) with answer
  if (type === 'followup_question') {
    const hasAnswer = Boolean(block.answer);
    const isYesNo = block.answer === 'Yes' || block.answer === 'No';
    const hasTextAnswer = hasAnswer && !isYesNo;
    const packDisplayName = getPackDisplayName(block.packId);
    
    return (
      <div className="space-y-2 ml-4">
        <RoleTimestamp role={block.isAiProbe ? "AI Investigator" : "Investigator"} time={timeLabel} />
        
        {/* Purple follow-up question card */}
        <div className="bg-[#1a2744] border border-slate-700/60 rounded-xl p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base font-semibold text-purple-400">
                  Follow-up Pack
                </span>
                {packDisplayName && (
                  <>
                    <span className="text-sm text-slate-500">•</span>
                    <span className="text-sm font-medium text-purple-400">
                      {packDisplayName}
                      {block.instanceNumber > 1 ? ` — Instance ${block.instanceNumber}` : ''}
                    </span>
                  </>
                )}
              </div>
              <p className="text-white text-base leading-relaxed">{block.questionText}</p>
            </div>
            
            {/* Yes/No chip on the right side of card */}
            {isYesNo && (
              <div className={cn(
                "flex-shrink-0 px-4 py-2 rounded-lg font-semibold",
                block.answer === 'Yes' ? "bg-green-600" : "bg-red-600"
              )}>
                <span className="text-white">{block.answer}</span>
              </div>
            )}
          </div>
        </div>
        
        {/* Text answer bubble (purple) - only for non-Yes/No answers */}
        {hasTextAnswer && (
          <>
            <RoleTimestamp role="Candidate" time={timeLabel} />
            <div className="flex justify-end">
              <div className="bg-purple-600 rounded-xl px-5 py-3 max-w-3xl">
                <p className="text-white">{block.answer}</p>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }
  
  // Multi-instance question
  if (type === 'multi_instance') {
    const isYesNo = block.answer === 'Yes' || block.answer === 'No';
    
    return (
      <div className="space-y-2 ml-4">
        <RoleTimestamp role="Investigator" time={timeLabel} />
        <div className="bg-[#1a2744] border border-slate-700/60 rounded-xl p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="text-white text-base leading-relaxed">{block.questionText}</p>
            </div>
            
            {/* Yes/No chip on the right side of card */}
            {isYesNo && (
              <div className={cn(
                "flex-shrink-0 px-4 py-2 rounded-lg font-semibold",
                block.answer === 'Yes' ? "bg-green-600" : "bg-red-600"
              )}>
                <span className="text-white">{block.answer}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
  
  return null;
}

/**
 * Role and timestamp header above each block
 */
function RoleTimestamp({ role, time }) {
  if (!role && !time) return null;
  
  return (
    <div className="flex items-center gap-2 text-[11px] text-slate-400 px-1">
      {role && <span className="font-medium">{role}</span>}
      {role && time && <span className="text-slate-500">•</span>}
      {time && <span className="text-slate-500">{time}</span>}
    </div>
  );
}

/**
 * Get display name for follow-up pack
 */
function getPackDisplayName(packId) {
  const PACK_NAMES = {
    'PACK_LE_APPS': 'Applications with other Law Enforcement Agencies',
    'PACK_PRIOR_LE_APPS_STANDARD': 'Prior Law Enforcement Applications',
    'PACK_WITHHOLD_INFO': 'Withheld Information',
    'PACK_DISQUALIFIED': 'Prior Disqualification',
    'PACK_CHEATING': 'Test Cheating',
    'PACK_DUI': 'DUI Incident',
    'PACK_LICENSE_SUSPENSION': 'License Suspension',
    'PACK_RECKLESS_DRIVING': 'Reckless Driving',
    'PACK_DRIVING_COLLISION_STANDARD': 'Driving Collision',
    'PACK_DRIVING_STANDARD': 'Driving Record',
    'PACK_DRIVING_VIOLATIONS_STANDARD': 'Driving Violations',
    'PACK_DRIVING_DUIDWI_STANDARD': 'DUI/DWI Incident'
  };
  
  return PACK_NAMES[packId] || packId;
}

/**
 * Format timestamp for display
 */
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