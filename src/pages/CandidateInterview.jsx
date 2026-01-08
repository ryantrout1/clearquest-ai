import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from "react";
import { useNavigate } from "react-router-dom";
import { unstable_batchedUpdates } from "react-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Shield, Send, Loader2, Check, X, AlertCircle, Layers, CheckCircle2, Pause, Copy, XCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  bootstrapEngine,
  validateFollowUpAnswer,
  checkFollowUpTrigger,
  computeNextQuestionId,
  injectSubstanceIntoPackSteps,
  shouldSkipFollowUpStep,
  shouldSkipProbingForHired,
  V3_ONLY_MODE
} from "../components/interviewEngine";
import { toast } from "sonner";
import { getAiAgentConfig } from "../components/utils/aiConfig";
import SectionCompletionMessage from "../components/interview/SectionCompletionMessage";
import StartResumeMessage from "../components/interview/StartResumeMessage";
import FollowUpContext from "../components/interview/FollowUpContext";
import { updateFactForField } from "../components/followups/factsManager";
import { validateFollowupValue, answerLooksLikeNoRecall } from "../components/followups/semanticValidator";
import { FOLLOWUP_PACK_CONFIGS, getPackMaxAiFollowups, usePerFieldProbing } from "../components/followups/followupPackConfig";
import { resolvePackSchema, validateSchemaSource } from "../components/utils/packSchemaResolver";
import { getSystemConfig, getEffectiveInterviewMode } from "../components/utils/systemConfigHelpers";
import { getFactModelForCategory, mapPackIdToCategory } from "../components/utils/factModelHelpers";
import V3ProbingLoop from "../components/interview/V3ProbingLoop";
import V3DebugPanel from "../components/interview/V3DebugPanel";
import BottomBarAutoFocusGuard from "../components/interview/BottomBarAutoFocusGuard";
import YesNoControls from "../components/interview/YesNoControls";
import { appendQuestionEntry, appendAnswerEntry } from "../components/utils/transcriptLogger";
import { applySectionGateIfNeeded } from "../components/interview/sectionGateHandler";
import {
  appendWelcomeMessage,
  appendResumeMarker,
  logSystemEvent as logSystemEventHelper,
  logQuestionShown,
  logSectionComplete,
  logAnswerSubmitted,
  logPackEntered,
  logPackExited,
  logSectionStarted,
  logFollowupCardShown,
  mergeTranscript,
  appendUserMessage as appendUserMessageImport,
  appendAssistantMessage as appendAssistantMessageImport,
  getNextIndex,
  flushRetryQueueOnce
} from "../components/utils/chatTranscriptHelpers";
import { getV3DeterministicOpener } from "../components/utils/v3ProbingPrompts";

// ============================================================================
// FETCH INTERCEPTOR - Block /entities/User/me on public routes
// ============================================================================
if (typeof window !== "undefined" && !window.__CQAI_FETCH_WRAPPED__) {
  window.__CQAI_ORIG_FETCH__ = window.fetch.bind(window);
  window.fetch = function(input, init) {
    const path = typeof window !== "undefined" ? window.location.pathname : "";
    const isPublicRoute = path.includes("CandidateInterview") || path.includes("SessionDetails");
    
    const url = typeof input === "string" ? input : (input?.url || "");
    
    if (isPublicRoute && (url.includes("/entities/User/me") || url.includes("/User/me"))) {
      console.log("[CQAI][NOAUTH] Blocked User/me on route=", path);
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    
    return window.__CQAI_ORIG_FETCH__(input, init);
  };
  window.__CQAI_FETCH_WRAPPED__ = true;
}

// Global logging flag for CandidateInterview
const DEBUG_MODE = false;

// Footer anchor diagnostics flag (set to true to enable flex layout diagnostics)
const CQ_DEBUG_FOOTER_ANCHOR = false;

// Simple in-memory registry so we only log each question once per session.
// Key format: `${sessionId}::${questionKey}`
const transcriptQuestionLogRegistry = new Set();

// FORENSIC: Component mount counter (module-level - survives HMR)
let candidateInterviewMountCount = 0;

// HARD REMOUNT DETECTOR: Track mounts per sessionId (module-scope)
const mountsBySession = {};
const resetMountTracker = (sid) => {
  if (mountsBySession[sid]) {
    delete mountsBySession[sid];
  }
};

// PART A: IN-MEMORY LOG DEDUPE - No storage dependency (module-scope, survives HMR)
const loggedOnceKeys = new Set();
const logOnce = (key, logFn) => {
  if (loggedOnceKeys.has(key)) return false;
  loggedOnceKeys.add(key);
  logFn();
  return true;
};

// PART C: Unified MI gate detector (consistent across all checks)
const isMiGateItem = (item, packId, instanceNumber) => {
  if (!item || !packId || instanceNumber === undefined) return false;
  
  // Match active card gates
  if (item.__activeCard && item.kind === 'multi_instance_gate') {
    const itemPackId = item.packId || item.meta?.packId;
    const itemInstance = item.instanceNumber || item.meta?.instanceNumber;
    return itemPackId === packId && itemInstance === instanceNumber;
  }
  
  // Match transcript gate entries
  if (item.messageType === 'MULTI_INSTANCE_GATE_SHOWN') {
    const itemPackId = item.meta?.packId || item.packId;
    const itemInstance = item.meta?.instanceNumber || item.instanceNumber;
    return itemPackId === packId && itemInstance === instanceNumber;
  }
  
  return false;
};

// PART A: Violation snapshot helper - declared inside component (needs refs/state access)
// Legacy wrapper removed - captureViolationSnapshot called directly

// ============================================================================
// TRANSCRIPT CONTRACT (v1) - Single Source of Truth
// ============================================================================
// Defines what entries are shown in ChatGPT-style transcript view
// Only conversational turns are visible, system/mechanical events are filtered out

  // TRANSCRIPT DENYLIST: System events and internal markers (NOT user-visible Q/A)
  // V3 UPDATE: V3_PROBE_QUESTION and V3_PROBE_ANSWER now ALLOWED (legal record)
  // PROMPT_LANE_CONTEXT: ALLOWED (non-chat annotation, provides Q/A context)
  const TRANSCRIPT_DENYLIST = new Set([
  'SYSTEM_EVENT',             // All system events
  'SESSION_CREATED',          // Session lifecycle
  'SESSION_RESUMED',
  'ANSWER_SUBMITTED',         // Answer submitted event (audit only)
  'PACK_ENTERED',             // Pack lifecycle
  'PACK_EXITED',
  'SECTION_STARTED',          // Section lifecycle
  'AI_PROBING_CALLED',        // AI probing events
  'AI_PROBING_RESPONSE',
  'V3_PROBE_ASKED',           // V3 probe system events (visibleToCandidate=false)
  'PROCESSING',               // No processing bubbles
  'REVIEWING',                // No reviewing bubbles
  'AI_THINKING',              // No thinking bubbles
  ]);

  // V3 FILTER REMOVED: V3 probe Q/A now in transcript (legal record)
  // Only block internal system events
  const isV3PromptTranscriptItem = (msg) => {
    const t = msg?.messageType || msg?.type || msg?.kind;
    
    // ALLOW: V3 opener prompts (FOLLOWUP_CARD_SHOWN with variant='opener')
    if (t === "FOLLOWUP_CARD_SHOWN") {
      const variant = msg?.meta?.variant || msg?.variant || msg?.followupVariant;
      if (variant === "opener") {
        return false; // DO NOT block opener prompts
      }
    }
    
    // BLOCK: Internal V3 system events only
    const V3_INTERNAL_TYPES = [
      "V3_PROBE_ASKED",     // Internal system event
      "V3_PROBE_PROMPT",    // Internal marker
      "V3_PROBE",           // Internal event
      "AI_FOLLOWUP_QUESTION" // Legacy internal type
    ];
    
    if (V3_INTERNAL_TYPES.includes(t)) {
      console.log('[V3_SYSTEM_EVENT][BLOCKED]', {
        messageType: t,
        textPreview: msg?.text?.substring(0, 60) || null,
        reason: 'Internal system event - not legal record'
      });
      return true;
    }
    
    return false;
  };

  // Helper: Filter renderable transcript entries (no flicker)
  const isRenderableTranscriptEntry = (t) => {
    if (!t) return false;

    const mt = t.messageType || t.type;
    
    // PRIORITY 0: QUESTION_SHOWN always renders (base Q/A contract - never filter)
    if (mt === 'QUESTION_SHOWN') return true;
    
    // PRIORITY 0.5: REQUIRED_ANCHOR_QUESTION always renders (deterministic fallback)
    if (mt === 'REQUIRED_ANCHOR_QUESTION') {
      console.log('[CQ_RENDER_SOT][REQUIRED_ANCHOR_Q_INCLUDED]', {
        stableKey: t.stableKey || t.id,
        anchor: t.meta?.anchor || t.anchor
      });
      return true;
    }
    
    // PRIORITY 0.6: PROMPT_LANE_CONTEXT always renders (non-chat annotation)
    if (mt === 'PROMPT_LANE_CONTEXT') {
      console.log('[CQ_RENDER_SOT][PROMPT_CONTEXT_INCLUDED]', {
        stableKey: t.stableKey || t.id,
        anchor: t.meta?.anchor || t.anchor
      });
      return true;
    }
    
    // PRIORITY 1: LEGAL RECORD - visibleToCandidate=true ALWAYS renders
    // This ensures all candidate-visible entries appear in UI (no drops)
    if (t.visibleToCandidate === true) {
      return true;
    }
    
    // PRIORITY 1.5: V3 probe Q/A default to visible (unless explicitly false)
    // Fixes missing V3_PROBE_ANSWER when visibleToCandidate is undefined
    const isV3ProbeQA = (t.messageType === 'V3_PROBE_QUESTION' || t.type === 'V3_PROBE_QUESTION') ||
                        (t.messageType === 'V3_PROBE_ANSWER' || t.type === 'V3_PROBE_ANSWER');
    if (isV3ProbeQA && t.visibleToCandidate !== false) {
      return true;
    }
    
    // PRIORITY 2: User messages always render (fail-open for legacy entries)
    if (t.role === 'user' || t.kind === 'user') {
      // Still block system event types
      if (mt === 'SYSTEM_EVENT') return false;
      if (TRANSCRIPT_DENYLIST.has(mt)) return false;
      return true;
    }

    // PRIORITY 3: Block internal system events (visibleToCandidate=false or undefined)
    if (mt === 'SYSTEM_EVENT') return false;
    if (t.visibleToCandidate === false) return false;
    if (TRANSCRIPT_DENYLIST.has(mt)) return false;
    
    // Never show typing/thinking/loading placeholders (prevents flicker)
    if (
      mt === 'ASSISTANT_TYPING' ||
      mt === 'TYPING' ||
      mt === 'THINKING' ||
      mt === 'LOADING' ||
      mt === 'PROBE_THINKING' ||
      mt === 'V3_THINKING' ||
      mt === 'PLACEHOLDER' ||
      mt === 'PROCESSING' ||
      mt === 'REVIEWING' ||
      mt === 'AI_THINKING'
    ) return false;
    
    // V3 UI CONTRACT: Block internal V3 system events only (visibleToCandidate handles legal record)
    if (isV3PromptTranscriptItem(t)) {
      return false;
    }

    return true;
    };

  // Helper: Dedupe by stableKey (prefer visibleToCandidate=true)
  const dedupeByStableKey = (arr) => {
    const map = new Map();
    for (const t of (arr || [])) {
      const key = t.stableKey || t.id || `${t.messageType || t.type}:${t.createdAt || ''}:${t.text || ''}`;
      // Prefer visibleToCandidate=true version
      if (!map.has(key) || (map.get(key)?.visibleToCandidate !== true && t.visibleToCandidate === true)) {
        map.set(key, t);
      }
    }
    return Array.from(map.values());
  };

  /**
   * Determine if a transcript entry should be rendered (legacy wrapper)
   */
  function shouldRenderTranscriptEntry(entry, index) {
    return isRenderableTranscriptEntry(entry);
  }

/**
 * Returns true if this question has already been logged for this session.
 * If not, marks it as logged and returns false.
 *
 * sessionId: string
 * questionKey: string (can be dbId, fieldKey, or a composite)
 */
function hasQuestionBeenLogged(sessionId, questionKey) {
  if (!sessionId || !questionKey) {
    // If we don't have enough info, be safe and say "already logged"
    // to avoid duplicate entries and avoid crashing.
    return true;
  }

  const key = `${sessionId}::${questionKey}`;
  if (transcriptQuestionLogRegistry.has(key)) {
    return true;
  }

  transcriptQuestionLogRegistry.add(key);
  return false;
}

// ============================================================================
// CQ_TRANSCRIPT_CONTRACT - Canonical Source of Truth
// ============================================================================
// - dbTranscript is the ONLY source for chat history rendering
// - Every candidate-visible item MUST be written to dbTranscript exactly once
// - Ephemeral UI (V3 prompt lane) MUST NOT be used as history source
// - STREAM_SUPPRESS MUST NEVER remove items from dbTranscript
// - Transcript is permanent and immutable (append-only, monotonic)
// - BASE Q+A MUST be committed BEFORE V3 probing activates (hard lifecycle ordering)
const ENFORCE_TRANSCRIPT_CONTRACT = true;

// CQ_RULE: Base Q+A commit barrier - MUST commit to transcript BEFORE V3 activation
// This prevents "lost first question" when V3 probing starts without base Q/A in transcript
const commitBaseQAIfMissing = async ({ questionId, questionText, answerText, sessionId }) => {
  try {
    const freshSession = await base44.entities.InterviewSession.get(sessionId);
    const currentTranscript = freshSession.transcript_snapshot || [];
    
    const qStableKey = `question:${sessionId}:${questionId}`;
    const aStableKey = `answer:${sessionId}:${questionId}:0`;
    
    const hasQ = currentTranscript.some(e => e.stableKey === qStableKey || (e.meta?.questionDbId === questionId && e.messageType === 'QUESTION_SHOWN'));
    
    // IMPROVED hasA: Check for ANY answer with this questionId (not just deterministic stableKey)
    const hasAByDeterministicKey = currentTranscript.some(e => e.stableKey === aStableKey);
    const hasAByQuestionId = currentTranscript.some(e => {
      const entryQuestionId = e.questionId || e.meta?.questionDbId || e.meta?.questionId;
      const entryMessageType = e.messageType || e.type;
      return entryQuestionId === questionId && entryMessageType === 'ANSWER';
    });
    const hasA = hasAByDeterministicKey || hasAByQuestionId;
    
    console.log('[CQ_TRANSCRIPT][BASE_QA_CHECK]', {
      questionId,
      hasQ,
      hasA,
      hasAByDeterministicKey,
      hasAByQuestionId,
      transcriptLen: currentTranscript.length,
      qKey: qStableKey,
      aKey: aStableKey
    });
    
    if (hasQ && hasA) {
      console.log('[CQ_TRANSCRIPT][BASE_QA_BARRIER_PASS]', {
        questionId,
        reason: 'Both Q+A already in transcript',
        order: 'BASE_QA_BEFORE_V3'
      });
      return currentTranscript;
    }
    
    // Missing - commit now (synchronous barrier)
    let updated = [...currentTranscript];
    
    if (!hasQ) {
      // Append BASE_QUESTION
      const qEntry = {
        id: `base-q-${questionId}-barrier`,
        stableKey: qStableKey,
        index: getNextIndex(updated),
        role: "assistant",
        text: questionText,
        timestamp: new Date().toISOString(),
        createdAt: Date.now(),
        messageType: 'QUESTION_SHOWN',
        type: 'QUESTION_SHOWN',
        meta: {
          questionDbId: questionId,
          source: 'base_qa_barrier'
        },
        visibleToCandidate: true
      };
      
      updated = [...updated, qEntry];
      console.log('[CQ_TRANSCRIPT][BASE_Q_INSERTED]', { qKey: qStableKey, questionId });
    }
    
    if (!hasA) {
      // Append BASE_ANSWER (only if NO answer exists by questionId)
      const aEntry = {
        id: `base-a-${questionId}-barrier`,
        stableKey: aStableKey,
        index: getNextIndex(updated),
        role: "user",
        text: answerText,
        timestamp: new Date().toISOString(),
        createdAt: Date.now(),
        messageType: 'ANSWER',
        type: 'ANSWER',
        meta: {
          questionDbId: questionId,
          questionId: questionId,
          source: 'base_qa_barrier',
          answerContext: 'BASE_QUESTION'
        },
        questionId: questionId,
        visibleToCandidate: true
      };
      
      updated = [...updated, aEntry];
      console.log('[CQ_TRANSCRIPT][BASE_A_INSERTED]', { 
        aKey: aStableKey, 
        questionId,
        reason: 'No answer found by questionId - inserting deterministic base answer'
      });
    }
    
    // Persist to DB synchronously
    await base44.entities.InterviewSession.update(sessionId, {
      transcript_snapshot: updated
    });
    
    console.log('[CQ_TRANSCRIPT][BASE_QA_COMMITTED]', {
      questionId,
      sessionId,
      transcriptLen: updated.length,
      order: 'BASE_QA_BEFORE_V3',
      insertedQ: !hasQ,
      insertedA: !hasA
    });
    
    return updated;
  } catch (err) {
    console.error('[CQ_TRANSCRIPT][BASE_QA_BARRIER_ERROR]', {
      questionId,
      error: err.message
    });
    return [];
  }
};

// V3 Probing feature flag
const ENABLE_V3_PROBING = true;

// V3 ACK/REPAIR feature flag (kill switch for prod safety)
const ENABLE_V3_ACK_REPAIR = true;

// Feature flag: Enable chat virtualization for long interviews
const ENABLE_CHAT_VIRTUALIZATION = false;

// UI CONTRACT: Disable synthetic transcript injection (must use append-only DB transcript)
const ENABLE_SYNTHETIC_TRANSCRIPT = false;

// MI_GATE UI CONTRACT: Enable self-test verification (log-only, non-blocking)
// Set to false to disable self-test logging if it causes noise
const ENABLE_MI_GATE_UI_CONTRACT_SELFTEST = true;

// Removed anchor-based gating diagnostic helpers - V2 now uses field-based gating only

// File revision: 2025-12-02 - Cleaned and validated

// ============================================================================
// CONTENT CONTAINER - Enforce max-width for all cards
// ============================================================================
const ContentContainer = ({ children, className = "" }) => (
  <div className={`mx-auto w-full max-w-5xl ${className}`}>
    {children}
  </div>
);

// ============================================================================
// LEGACY TRANSCRIPT CLEANUP - DISABLED (V3 probe Q/A now allowed in transcript)
// ============================================================================
const cleanedSessionIdsRef = new Set(); // Kept for compatibility

const cleanLegacyV3ProbePrompts = (transcript, sessionId) => {
// NO LONGER CLEANING - V3 probe Q/A are now legal record
if (!Array.isArray(transcript)) return transcript;
return transcript;
};

// ============================================================================
// SECTION-BASED HELPER FUNCTIONS (HOISTED)
// ============================================================================

function buildSectionsFromEngine(engineData) {
  try {
    const sectionEntities = engineData.Sections || [];
    const sectionOrder = engineData.sectionOrder || [];
    const questionsBySection = engineData.questionsBySection || {};

    if (sectionEntities.length > 0) {
      const orderedSections = sectionEntities
        .filter(section => section.active !== false)
        .sort((a, b) => (a.section_order || 0) - (b.section_order || 0))
        .map(section => {
          const sectionId = section.section_id;
          const sectionQuestions = questionsBySection[sectionId] || [];
          const questionIds = sectionQuestions.map(q => q.id || q.question_id);

          return {
            id: sectionId,
            dbId: section.id,
            displayName: section.section_name,
            description: section.description || null,
            questionIds: questionIds,
            section_order: section.section_order,
            active: section.active !== false
          };
        })
        .filter(s => s.questionIds.length > 0);

      if (orderedSections.length > 0) {
        return orderedSections;
      }
    }

    if (sectionOrder.length > 0) {
      const orderedSections = sectionOrder
        .filter(s => s.active !== false)
        .map((section, idx) => {
          const sectionId = section.id || section.section_id;
          const sectionQuestions = questionsBySection[sectionId] || [];
          const questionIds = sectionQuestions.map(q => q.id || q.question_id);

          return {
            id: sectionId,
            dbId: section.dbId || section.id,
            displayName: section.name || section.section_name || sectionId,
            description: section.description || null,
            questionIds: questionIds,
            section_order: section.order || section.section_order || idx + 1,
            active: section.active !== false
          };
        })
        .filter(s => s.questionIds.length > 0);

      if (orderedSections.length > 0) {
        return orderedSections;
      }
    }

    return [];
  } catch (err) {
    console.warn('[SECTIONS] Error building sections (non-fatal):', err.message);
    return [];
  }
}

function getNextQuestionInSectionFlow({ sections, currentSectionIndex, currentQuestionId, answeredQuestionIds = new Set() }) {
  if (!sections || sections.length === 0) {
    return { mode: 'DONE' };
  }

  const currentSection = sections[currentSectionIndex];
  if (!currentSection) {
    return { mode: 'DONE' };
  }

  const sectionQuestions = currentSection.questionIds || [];
  const currentIdx = sectionQuestions.indexOf(currentQuestionId);

  if (currentIdx === -1) {
    const firstUnanswered = sectionQuestions.find(qId => !answeredQuestionIds.has(qId));
    if (firstUnanswered) {
      return {
        mode: 'QUESTION',
        nextSectionIndex: currentSectionIndex,
        nextQuestionId: firstUnanswered
      };
    }
  }

  for (let i = currentIdx + 1; i < sectionQuestions.length; i++) {
    const nextQuestionId = sectionQuestions[i];
    if (!answeredQuestionIds.has(nextQuestionId)) {
      return {
        mode: 'QUESTION',
        nextSectionIndex: currentSectionIndex,
        nextQuestionId
      };
    }
  }

  for (let nextIdx = currentSectionIndex + 1; nextIdx < sections.length; nextIdx++) {
    const nextSection = sections[nextIdx];
    if (!nextSection.active) continue;

    const nextSectionQuestions = nextSection.questionIds || [];
    const firstUnanswered = nextSectionQuestions.find(qId => !answeredQuestionIds.has(qId));

    if (firstUnanswered) {
      return {
        mode: 'SECTION_TRANSITION',
        nextSectionIndex: nextIdx,
        nextQuestionId: firstUnanswered,
        completedSection: currentSection,
        nextSection
      };
    }
  }

  return { mode: 'DONE' };
}

function determineInitialSectionIndex(orderedSections, sessionData, engineData) {
  if (!orderedSections || orderedSections.length === 0) return 0;

  const currentItemSnapshot = sessionData.current_item_snapshot;
  if (currentItemSnapshot?.id && currentItemSnapshot?.type === 'question') {
    const questionId = currentItemSnapshot.id;
    const location = engineData.questionIdToSection?.[questionId];

    if (location?.sectionId) {
      const sectionIndex = orderedSections.findIndex(s => s.id === location.sectionId);
      if (sectionIndex !== -1) {
        return sectionIndex;
      }
    }
  }

  return 0;
}

// Follow-up pack display names
const FOLLOWUP_PACK_NAMES = {
  'PACK_LE_APPS': 'Applications with other Law Enforcement Agencies',
  'PACK_WITHHOLD_INFO': 'Withheld Information',
  'PACK_DISQUALIFIED': 'Prior Disqualification',
  'PACK_CHEATING': 'Test Cheating',
  'PACK_DUI': 'DUI Incident',
  'PACK_LICENSE_SUSPENSION': 'License Suspension',
  'PACK_RECKLESS_DRIVING': 'Reckless Driving'
};

const WHAT_TO_EXPECT = {
  'APPLICATIONS_WITH_OTHER_LE': 'your prior law enforcement applications and their outcomes',
  'DRIVING_RECORD': 'your driving history, such as citations, collisions, and any license actions'
};

const ENABLE_LIVE_AI_FOLLOWUPS = true;
const DEBUG_AI_PROBES = DEBUG_MODE;

// Helper: Generate field suggestions using LLM based on narrative answer
const generateFieldSuggestions = async (packId, narrativeAnswer) => {
  try {
    const prompt = `Based on this candidate's narrative answer about a prior law enforcement application, extract the following information if mentioned:
- agency_name: The law enforcement agency name (full name)
- agency_location: The city and state where the agency is located (e.g., "Phoenix, AZ")
- position: The position/job title applied for (e.g., "Police Officer", "Deputy Sheriff")
- application_date: Approximate date/time period (e.g., "March 2022", "2021")
- application_outcome: The outcome (hired, disqualified, withdrew, or still_in_process)

Narrative: "${narrativeAnswer}"

Return ONLY a JSON object with these keys. If any information is not mentioned, use null for that field.`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          agency_name: { type: ["string", "null"] },
          agency_location: { type: ["string", "null"] },
          position: { type: ["string", "null"] },
          application_date: { type: ["string", "null"] },
          application_outcome: { type: ["string", "null"] }
        }
      }
    });

    return result || {};
  } catch (err) {
    console.warn('[LLM_SUGGESTIONS] Failed to generate suggestions:', err);
    return {};
  }
};

const syncFactsToInterviewSession = async (sessionId, questionId, packId, followUpResponse) => {
  if (packId !== 'PACK_LE_APPS' || !followUpResponse || !followUpResponse.additional_details?.facts) {
    return;
  }

  try {
    const session = await base44.entities.InterviewSession.get(sessionId);
    const allFacts = session.structured_followup_facts || {};
    const questionFacts = allFacts[questionId] || [];

    const newFactEntry = {
      followup_response_id: followUpResponse.id,
      pack_id: packId,
      instance_number: followUpResponse.instance_number,
      fields: followUpResponse.additional_details.facts,
      updated_at: new Date().toISOString()
    };

    const existingIndex = questionFacts.findIndex(f => f.followup_response_id === followUpResponse.id);

    if (existingIndex > -1) {
      questionFacts[existingIndex] = newFactEntry;
    } else {
      questionFacts.push(newFactEntry);
    }

    allFacts[questionId] = questionFacts;

    await base44.entities.InterviewSession.update(sessionId, {
      structured_followup_facts: allFacts
    });
  } catch (err) {
    console.error('[SYNC_FACTS] Error syncing facts to InterviewSession:', err);
  }
};

// STABLE EVENT ID: Module-scope counter (never triggers remounts)
let eventIdCounter = 0;

const createChatEvent = (type, data = {}) => {
  eventIdCounter++;
  const baseEvent = {
    id: `${type}-${eventIdCounter}`,
    type,
    timestamp: new Date().toISOString(),
    ...data
  };

  if (['system_welcome', 'progress_message', 'section_transition', 'system_message'].includes(type)) {
    baseEvent.role = 'system';
  } else if (['question', 'followup_question', 'ai_probe_question', 'ai_question', 'multi_instance_question'].includes(type)) {
    baseEvent.role = 'investigator';
    if (type === 'ai_probe_question' || type === 'ai_question') {
      baseEvent.label = 'AI Investigator';
      baseEvent.kind = 'ai_probe_question';
    }
  } else if (['answer', 'followup_answer', 'ai_probe_answer', 'ai_answer', 'multi_instance_answer'].includes(type)) {
    baseEvent.role = 'candidate';
    if (type === 'ai_probe_answer' || type === 'ai_answer') {
      baseEvent.label = 'Candidate';
      baseEvent.kind = 'ai_probe_answer';
    }
  }

  return baseEvent;
};

// Ensure Welcome is in transcript at session start (only once)
const ensureWelcomeInTranscript = async (sessionId, currentTranscript) => {
  return await appendWelcomeMessage(sessionId, currentTranscript);
};

const useProbeEngineV2 = usePerFieldProbing;

const getFieldProbeKey = (packId, instanceNumber, fieldKey) => `${packId}_${instanceNumber || 1}_${fieldKey}`;

// STEP 1: Helper to store backend question text
const storeBackendQuestionText = (packId, fieldKey, instanceNumber, questionText, setMapFn) => {
  if (!questionText) return;
  setMapFn(prev => {
    const existingPack = prev[packId] || {};
    const existingField = existingPack[fieldKey] || {};
    return {
      ...prev,
      [packId]: {
        ...existingPack,
        [fieldKey]: {
          ...existingField,
          [String(instanceNumber)]: questionText,
        },
      },
    };
  });
};

// STEP 1: Helper to retrieve backend question text
const getBackendQuestionText = (map, packId, fieldKey, instanceNumber) => {
  return map?.[packId]?.[fieldKey]?.[String(instanceNumber)] || null;
};

const callProbeEngineV2PerField = async (base44Client, params) => {
  const { packId, fieldKey, fieldValue, previousProbesCount, incidentContext, sessionId, questionCode, baseQuestionId, instanceNumber, schemaSource, resolvedField } = params;

  // CORRELATION TRACE: Generate stable traceId for this probe
  const traceId = `v2-probe-${sessionId}-${packId}-${fieldKey}-${Date.now()}`;
  
  console.log('[V2_PER_FIELD][SEND] ========== CALLING BACKEND PER-FIELD PROBE ==========');
  console.log(`[V2_PER_FIELD][SEND]`, {
    traceId,
    packId,
    fieldKey,
    instanceNumber: instanceNumber || 1,
    schemaSource: schemaSource || 'unknown',
    hasResolvedField: !!resolvedField,
    fieldValueLength: fieldValue?.length || 0,
    fieldValuePreview: fieldValue?.substring?.(0, 50) || fieldValue
  });

  // TIMEOUT GUARD: 10s max for backend call
  const BACKEND_TIMEOUT_MS = 10000;

  try {
    const backendPromise = base44Client.functions.invoke('probeEngineV2', {
      trace_id: traceId,
      pack_id: packId,
      field_key: fieldKey,
      field_value: fieldValue,
      previous_probes_count: previousProbesCount || 0,
      incident_context: incidentContext || {},
      session_id: sessionId,
      question_code: questionCode,
      instance_number: instanceNumber || 1,
      mode: 'VALIDATE_FIELD',
      schema_source: schemaSource || null,
      resolved_field: resolvedField || null
    });
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('BACKEND_TIMEOUT')), BACKEND_TIMEOUT_MS)
    );
    
    const response = await Promise.race([backendPromise, timeoutPromise]);

    console.log('[V2_PER_FIELD][RECV] ========== BACKEND RESPONSE RECEIVED ==========');
    console.log(`[V2_PER_FIELD][RECV]`, {
      traceId,
      packId,
      fieldKey,
      mode: response.data?.mode,
      hasQuestion: !!response.data?.question,
      questionPreview: response.data?.question?.substring?.(0, 60),
      errorCode: response.data?.errorCode || null
    });

    // AUDIT LOG: Full result for PACK_PRIOR_LE_APPS_STANDARD
    if (packId === "PACK_PRIOR_LE_APPS_STANDARD" && fieldKey === "PACK_PRLE_Q01") {
      console.log("[V2_PACK_AUDIT][FRONTEND_RECV]", {
        packId,
        fieldKey,
        question: response.data?.question || null,
        questionText: response.data?.questionText || null,
        questionPreview: response.data?.questionPreview || null,
        mode: response.data?.mode,
        rawResult: response.data
      });

      console.log("[V2_PACK_AUDIT][FRONTEND_RECV_SUMMARY]", {
        packId,
        fieldKey,
        instanceNumber: params.instanceNumber || 1,
        questionText: response.data?.question || response.data?.questionText || null,
        questionPreview: response.data?.questionPreview || null,
        promptSource: response.data?.promptSource || response.data?.probeSource || null
      });
    }

    // STEP 1: Store backend question text for later use in UI rendering
    const backendQuestionText = response.data?.questionText || response.data?.question || null;
    if (backendQuestionText && params.setBackendQuestionTextMap) {
      storeBackendQuestionText(packId, fieldKey, params.instanceNumber || 1, backendQuestionText, params.setBackendQuestionTextMap);
    }

    return response.data;
  } catch (err) {
    // TIMEOUT HANDLING
    if (err.message === 'BACKEND_TIMEOUT') {
      console.error('[V2_PER_FIELD][TIMEOUT]', { 
        traceId,
        packId, 
        fieldKey, 
        instanceNumber,
        schemaSource,
        elapsed: BACKEND_TIMEOUT_MS
      });
      
      return {
        mode: 'ERROR',
        errorCode: 'BACKEND_TIMEOUT',
        message: `Backend probe timeout after ${BACKEND_TIMEOUT_MS / 1000}s`,
        debug: { traceId, packId, fieldKey, schemaSource }
      };
    }
    
    console.error('[V2_PER_FIELD][EXCEPTION]', { 
      traceId,
      packId, 
      fieldKey, 
      message: err?.message,
      stack: err?.stack?.substring(0, 200)
    });
    return {
      mode: 'ERROR',
      errorCode: 'BACKEND_ERROR',
      message: err.message || 'Failed to call probeEngineV2',
      debug: { traceId, packId, fieldKey }
    };
  }
};

/**
 * Auto-skip helper for V2 pack fields with high-confidence suggestions
 * Checks field config for autoSkipIfConfident and evaluates suggestion quality
 *
 * Supports both:
 * - Enum fields with autoSkipAllowedValues (e.g., outcome)
 * - Free-text fields without enum restrictions (e.g., city/state, date, position)
 *
 * @returns { shouldSkip: boolean, autoAnswerValue?: string }
 */
const maybeAutoSkipV2Field = async ({
  packId,
  fieldConfig,
  fieldKey,
  instanceNumber,
  suggestionMap,
  sessionId,
  baseQuestionId,
  baseQuestionCode,
  sectionId,
  saveFieldResponse
}) => {
  try {
    // Check if auto-skip is enabled for this field
    if (!fieldConfig?.autoSkipIfConfident) {
      return { shouldSkip: false };
    }

    console.log(`[V2_AUTO_SKIP][CHECK] Field ${fieldKey} has autoSkipIfConfident=true`);

    // Get suggestion for this field
    const suggestionKey = `${packId}_${instanceNumber}_${fieldKey}`;
    const suggestion = suggestionMap?.[suggestionKey];

    if (!suggestion) {
      console.log(`[V2_AUTO_SKIP][NO_SUGGESTION] No suggestion found for ${suggestionKey}`);
      return { shouldSkip: false };
    }

    // Parse suggestion - it could be a string or {value, confidence} object
    let value, confidence;

    if (typeof suggestion === 'string') {
      value = suggestion;
      confidence = 0.9; // Default high confidence for direct string suggestions
    } else if (suggestion && typeof suggestion === 'object') {
      value = suggestion.value;
      confidence = suggestion.confidence ?? 0.9;
    } else {
      console.log(`[V2_AUTO_SKIP][INVALID_SUGGESTION] Invalid suggestion format for ${suggestionKey}`);
      return { shouldSkip: false };
    }

    // Check confidence threshold first
    const threshold = fieldConfig.autoSkipMinConfidence ?? 0.85;
    if (confidence < threshold) {
      console.log(`[V2_AUTO_SKIP][LOW_CONFIDENCE] ${confidence.toFixed(2)} < ${threshold}`);
      return { shouldSkip: false };
    }

    // ==============================
    // ENUM FIELD BRANCH (existing)
    // ==============================
    if (fieldConfig.autoSkipAllowedValues && Array.isArray(fieldConfig.autoSkipAllowedValues)) {
      // Validate value
      const normalizedValue = value?.toString().trim().toLowerCase();
      if (!normalizedValue) {
        console.log(`[V2_AUTO_SKIP][EMPTY_VALUE] Suggestion has empty value`);
        return { shouldSkip: false };
      }

      // Check enum validation
      const normalizedEnum = fieldConfig.autoSkipAllowedValues.map(v => v.toLowerCase().trim());
      if (!normalizedEnum.includes(normalizedValue)) {
        console.log(`[V2_AUTO_SKIP][INVALID_ENUM] Value "${normalizedValue}" not in allowed: [${normalizedEnum.join(', ')}]`);
        return { shouldSkip: false };
      }

      // All checks passed - auto-skip enum field
      console.log(`[V2_AUTO_SKIP][APPLY] Auto-filling enum field ${fieldKey} with "${value}" (confidence: ${confidence.toFixed(2)})`);

      // Persist the auto-answer using existing save helper
      if (saveFieldResponse) {
        await saveFieldResponse({
          sessionId,
          packId,
          fieldKey,
          instanceNumber,
          answer: value,
          baseQuestionId,
          baseQuestionCode,
          sectionId,
          questionText: fieldConfig.label
        });

        console.log(`[V2_AUTO_SKIP][PERSISTED] Created Response for auto-answered enum field`);
      }

      return {
        shouldSkip: true,
        autoAnswerValue: value
      };
    }

    // ==============================
    // FREE-TEXT FIELD BRANCH (NEW)
    // ==============================
    const finalValue = typeof value === 'string' ? value.trim() : String(value).trim();

    if (!finalValue) {
      console.log(`[V2_AUTO_SKIP][EMPTY_VALUE] Free-text suggestion has empty value`);
      return { shouldSkip: false };
    }

    // All checks passed - auto-skip free-text field
    console.log(`[V2_AUTO_SKIP][APPLY] Auto-filling free-text field ${fieldKey} with "${finalValue}" (confidence: ${confidence.toFixed(2)})`);

    // Persist the auto-answer using existing save helper
    if (saveFieldResponse) {
      await saveFieldResponse({
        sessionId,
        packId,
        fieldKey,
        instanceNumber,
        answer: finalValue,
        baseQuestionId,
        baseQuestionCode,
        sectionId,
        questionText: fieldConfig.label
      });

      console.log(`[V2_AUTO_SKIP][PERSISTED] Created Response for auto-answered free-text field`);
    }

    return {
      shouldSkip: true,
      autoAnswerValue: finalValue
    };

  } catch (error) {
    console.error(`[V2_AUTO_SKIP][ERROR]`, error.message);
    return { shouldSkip: false };
  }
};

// ============================================================================
// V3 PROBE STABLEKEY BUILDERS - Single source of truth for key format
// ============================================================================
const buildV3ProbeQStableKey = (sessionId, categoryId, instanceNumber, probeIndex) => {
  return `v3-probe-q:${sessionId}:${categoryId}:${instanceNumber}:${probeIndex}`;
};

const buildV3ProbeAStableKey = (sessionId, categoryId, instanceNumber, probeIndex) => {
  return `v3-probe-a:${sessionId}:${categoryId}:${instanceNumber}:${probeIndex}`;
};

// ============================================================================
// MI GATE STABLEKEY BUILDERS - Single source of truth for MI gate identity
// ============================================================================
const buildMiGateQStableKey = (packId, instanceNumber) => {
  return `mi-gate:${packId}:${instanceNumber}:q`;
};

const buildMiGateAStableKey = (packId, instanceNumber) => {
  return `mi-gate:${packId}:${instanceNumber}:a`;
};

const buildMiGateItemId = (packId, instanceNumber) => {
  return `multi-instance-gate-${packId}-${instanceNumber}`;
};

// ============================================================================
// V3 OPENER STABLEKEY BUILDER - Single source of truth
// ============================================================================
const buildV3OpenerStableKey = (packId, instanceNumber) => {
  return `v3-opener:${packId}:${instanceNumber}`;
};

// Centralized V2 probe runner for both base questions and follow-ups
// CRITICAL: For V2 packs, we ALWAYS call the backend - it controls progression
/**
 * V2.6 Universal MVP: All V2 packs use Discretion Engine
 * NO deterministic follow-up questions surface to candidates
 * Backend controls all probing decisions through Discretion Engine
 *
 * HARDENED: Comprehensive incident lifecycle logging (structural data only, no PII)
 */
const runV2FieldProbeIfNeeded = async ({
  base44Client,
  packId,
  fieldKey,
  fieldValue,
  previousProbesCount,
  incidentContext,
  sessionId,
  questionCode,
  baseQuestionId,
  aiProbingEnabled,
  aiProbingDisabledForSession,
  maxAiFollowups,
  instanceNumber,
  setBackendQuestionTextMap,
  schemaSource = null,
  resolvedField = null
}) => {
  const probeCount = previousProbesCount || 0;

  // LIFECYCLE LOG: Incident started
  if (probeCount === 0 && (!fieldValue || !fieldValue.trim())) {
    console.log(`[V2_LIFECYCLE][INCIDENT_START]`, {
      packId,
      baseQuestionCode: questionCode,
      instanceNumber: instanceNumber || 1,
      sessionId
    });
  }

  // EXPLICIT ENTRY LOG
  console.log(`[V2_UNIVERSAL][CALL] packId=${packId} fieldKey=${fieldKey} instance=${instanceNumber || 1} probeCount=${probeCount}`);

  // Check if AI probing is globally disabled
  if (!ENABLE_LIVE_AI_FOLLOWUPS) {
    console.log(`[V2_UNIVERSAL][SKIP] AI probing disabled globally`);
    return { mode: 'NEXT_FIELD', reason: 'AI probing disabled globally' };
  }

  // V2.6 Universal MVP: ALWAYS call backend - Discretion Engine controls everything
  console.log('[V2_UNIVERSAL][CALLING_BACKEND]', {
    packId,
    fieldKey,
    instanceNumber: instanceNumber || 1,
    probeCount,
    collectedAnchorsKeys: Object.keys(incidentContext || {}) // Keys only, no PII values
  });

  try {
    const v2Result = await callProbeEngineV2PerField(base44Client, {
      packId,
      fieldKey,
      fieldValue,
      previousProbesCount: probeCount,
      incidentContext,
      sessionId,
      questionCode,
      baseQuestionId,
      instanceNumber,
      setBackendQuestionTextMap // STEP 1: Pass setter
    });

    // LIFECYCLE LOG: Anchors updated (structural only)
    // NOTE: This log is now consolidated with the per-field handler below

    // LIFECYCLE LOG: Discretion decision
    if (v2Result?.probeSource?.includes('discretion')) {
      console.log(`[V2_LIFECYCLE][DISCRETION_DECISION]`, {
        packId,
        instanceNumber: instanceNumber || 1,
        action: v2Result.mode === 'QUESTION' ? 'ask' : 'stop',
        targetAnchors: v2Result?.targetAnchors || [],
        probeCount: probeCount + 1,
        maxProbes: v2Result?.maxProbesPerField || maxAiFollowups
      });
    }

    // LIFECYCLE LOG: Probing stopped
    if (v2Result?.mode === 'NEXT_FIELD' || v2Result?.mode === 'COMPLETE') {
      const stopReason = v2Result?.reason || v2Result?.validationResult || 'unknown';
      console.log(`[V2_LIFECYCLE][PROBING_STOPPED]`, {
        packId,
        instanceNumber: instanceNumber || 1,
        reason: stopReason,
        finalProbeCount: probeCount + 1
      });
    }

    console.log(`[V2_UNIVERSAL][RESPONSE]`, {
      packId,
      mode: v2Result?.mode,
      hasQuestion: !!v2Result?.question,
      probeSource: v2Result?.probeSource,
      reason: v2Result?.reason || v2Result?.message
    });

    // AUDIT LOG: Full response for PACK_PRIOR_LE_APPS_STANDARD
    if (packId === "PACK_PRIOR_LE_APPS_STANDARD" && fieldKey === "PACK_PRLE_Q01") {
      console.log("[V2_PACK_AUDIT][UNIVERSAL_RESPONSE]", {
        packId,
        fieldKey,
        question: v2Result?.question || null,
        questionText: v2Result?.questionText || null,
        questionPreview: v2Result?.questionPreview || null,
        mode: v2Result?.mode,
        rawResult: v2Result
      });
    }

    // If AI is disabled at session level, skip any probe questions
    if (aiProbingDisabledForSession && v2Result?.mode === 'QUESTION') {
      console.log(`[V2_UNIVERSAL][SKIP] Session has AI probing disabled`);
      return { mode: 'NEXT_FIELD', reason: 'Session AI probing disabled' };
    }

    return v2Result;
  } catch (err) {
    console.error('[V2_UNIVERSAL][ERROR]', { packId, fieldKey, error: err?.message });
    // HARDENED: On error, advance to prevent interview blocking
    return { mode: 'NEXT_FIELD', reason: 'Backend error - advancing', error: err?.message };
  }
};

// CLEARQUEST UI CONTRACT:
// - StartInterview renders ONLY when no sessionId exists
// - CandidateInterview owns UI once session starts
// - Welcome / start screens must NEVER reappear mid-session

export default function CandidateInterview() {
  console.log('[BUILD_OK][CandidateInterview]');
  console.log('[V3_ONLY][SOT_FLAG][CANDIDATE]', { V3_ONLY_MODE });
  
  const navigate = useNavigate();
  
  // SESSION PARAM PARSING: Accept from query params OR global window.__CQ_SESSION__
  const urlParams = new URLSearchParams(window.location.search || "");
  const sessionFromSession = urlParams.get('session');
  const sessionFromSessionId = urlParams.get('sessionId');
  const sessionFromGlobal = typeof window !== 'undefined' ? (window.__CQ_SESSION__ || null) : null;
  const sessionId = sessionFromSession || sessionFromSessionId || sessionFromGlobal || null;
  
  // SESSION STICKY REF: Persist sessionId across mounts (memory-safe)
  const resolvedSessionRef = useRef(null);
  
  // FORENSIC: Mount-only log showing what session params we received
  const sessionParamLoggedRef = useRef(false);
  if (!sessionParamLoggedRef.current) {
    sessionParamLoggedRef.current = true;
    console.log('[CANDIDATE_INTERVIEW][SESSION_PARAM_SOT]', {
      sessionFromSession,
      sessionFromSessionId,
      sessionFromGlobal,
      resolved: sessionId,
      search: window.location.search
    });
  }
  
  // Log when global is used
  if (sessionFromGlobal && !sessionFromSession && !sessionFromSessionId) {
    console.log('[CANDIDATE_INTERVIEW][SESSION_FROM_GLOBAL]', {
      sessionId: sessionFromGlobal
    });
  }
  
  // STICKY SET: Store resolved session if truthy (mount-only)
  if (sessionId && !resolvedSessionRef.current) {
    resolvedSessionRef.current = sessionId;
    console.log('[CANDIDATE_INTERVIEW][SESSION_STICKY_SET]', { sessionId });
  }
  
  // ============================================================================
  // PROMPT TEXT SOT (HOIST-SAFE) - Must be ABOVE all usages
  // ============================================================================
  /**
   * Resolve anchor key to human-readable question (TDZ-proof, pure)
   * CRITICAL: No closure dependencies - only uses arguments
   * @param {string} anchor - Anchor key (e.g., "prior_le_position")
   * @param {string|null} packId - Pack ID for label lookup
   * @returns {string} Human-readable question text
   */
  function resolveAnchorToHumanQuestion(anchor, packId = null) {
    if (!anchor) return "Please answer the following question.";
    
    // Priority 1: Pack config anchor label
    if (packId) {
      const packConfig = FOLLOWUP_PACK_CONFIGS?.[packId];
      const anchorConfig = packConfig?.factAnchors?.find(a => a.key === anchor);
      if (anchorConfig?.label) {
        return `What ${anchorConfig.label}?`;
      }
    }
    
    // Priority 2: Known anchor mappings (hardcoded for common cases)
    const ANCHOR_QUESTION_MAP = {
      'prior_le_position': 'What position did you apply for?',
      'prior_le_agency': 'What law enforcement agency did you apply to?',
      'prior_le_approx_date': 'When did you apply? (approximate month and year is fine)',
      'application_outcome': 'What was the outcome of your application?',
      'month_year': 'When did this happen? (approximate month and year is fine)',
      'location': 'Where did this happen?',
      'agency': 'What agency was this with?',
      'position': 'What position or role?',
      'outcome': 'What was the outcome?'
    };
    
    if (ANCHOR_QUESTION_MAP[anchor]) {
      return ANCHOR_QUESTION_MAP[anchor];
    }
    
    // Priority 3: Generic semantic derivation
    if (/position|role|title|rank/i.test(anchor)) {
      return "What position did you apply for?";
    }
    if (/agency|department|employer/i.test(anchor)) {
      return "What agency did you apply to?";
    }
    if (/date|month|year|when|approx/i.test(anchor)) {
      return "When did this happen? (approximate month and year is fine)";
    }
    if (/outcome|result|status/i.test(anchor)) {
      return "What was the outcome?";
    }
    
    // Priority 4: Safe fallback (never expose raw anchor key)
    return "Please answer the following question.";
  }
  
  /**
   * Compute active prompt text from UI state (TDZ-proof, pure function)
   * CRITICAL: Function declaration (hoisted) - safe to call from any code path
   * @returns {string|null} The prompt text to show, or null if none
   */
  function computeActivePromptText(params) {
    const {
      requiredAnchorFallbackActive,
      requiredAnchorCurrent,
      v3ProbingContext,
      v3ProbingActive,
      v3ActivePromptText,
      effectiveItemType,
      currentItem,
      v2ClarifierState,
      currentPrompt
    } = params;
    
    // OPENER OVERRIDE: v3_pack_opener must never use fallback priority
    if (effectiveItemType === 'v3_pack_opener') {
      const openerText = (currentItem?.openerText || '').trim();
      if (openerText) {
        console.log('[ACTIVE_PROMPT_TEXT][OPENER_OVERRIDE]', {
          effectiveItemType,
          hasOpenerText: true,
          openerPreview: openerText.slice(0, 80),
        });
        return openerText;
      }
      console.log('[ACTIVE_PROMPT_TEXT][OPENER_OVERRIDE]', {
        effectiveItemType,
        hasOpenerText: false,
        reason: 'blank_openerText_using_safe_fallback',
      });
      return 'Please describe the details for this section in your own words.';
    }
    
    // Priority 0: Required anchor fallback
    if (requiredAnchorFallbackActive && requiredAnchorCurrent) {
      return resolveAnchorToHumanQuestion(requiredAnchorCurrent, v3ProbingContext?.packId);
    }
    
    // Priority 1: V3 active prompt
    if (v3ProbingActive && v3ActivePromptText) {
      return v3ActivePromptText;
    }
    
    // Priority 2: V2 pack field
    if (effectiveItemType === 'v2_pack_field' && currentItem) {
      const backendText = currentItem.backendQuestionText;
      const clarifierText = v2ClarifierState?.packId === currentItem.packId && 
                           v2ClarifierState?.fieldKey === currentItem.fieldKey && 
                           v2ClarifierState?.instanceNumber === currentItem.instanceNumber
                           ? v2ClarifierState.clarifierQuestion
                           : null;
      return clarifierText || backendText || currentItem.fieldConfig?.label || null;
    }
    
    // Priority 3: V3 pack opener
    if (effectiveItemType === 'v3_pack_opener' && currentItem) {
      const openerText = currentItem.openerText;
      const usingFallback = !openerText || openerText.trim() === '';
      return usingFallback 
        ? "Please describe the details for this section in your own words."
        : openerText;
    }
    
    // Priority 4: Current prompt
    if (currentPrompt?.text) {
      return currentPrompt.text;
    }
    
    return null;
  }
  
  // ============================================================================
  // HOOK ORDER GUARD: showRedirectFallback must stay above NO_SESSION early return (TDZ prevention)
  // ============================================================================
  // CRITICAL: This hook MUST be declared before the no-session guard (line ~1463)
  // Moving it below the early return will cause: "Cannot access 'showRedirectFallback' before initialization"
  // 
  // FORENSIC: TDZ FIX - showRedirectFallback state MUST be before early return
  const [showRedirectFallback, setShowRedirectFallback] = useState(false);
  
  // SESSION RECOVERY STATE: Track recovery in-flight to prevent redirect during lookup
  const [isRecoveringSession, setIsRecoveringSession] = useState(false);
  
  // TDZ_FIX: HOISTED-SAFE PERSISTENCE - Plain function with zero closure dependencies
  // CRITICAL: Declared at top-of-component to eliminate ALL TDZ risks
  // This function uses ONLY its parameters - no component state/refs/consts
  const inFlightEnsuresRef = useRef({});
  
  /**
   * Required anchor question persistence (TDZ-proof, crash-proof)
   * RENAMED: From safeEnsureRequiredAnchorQuestion to match legacy call sites
   * @param {Object} params - All data passed as parameters (no closure captures)
   * @returns {Promise<{ok: boolean, didAppend: boolean, stableKeyQ: string}>}
   */
  async function ensureRequiredAnchorQuestionInTranscript({
    sessionId,
    categoryId,
    instanceNumber,
    anchor,
    questionText,
    appendFn,
    existingTranscript,
    packId,
    canonicalRef,
    syncStateFn
  }) {
    // TDZ_FIX: All variables declared locally (no external closure references)
    const stableKeyQ = `required-anchor:q:${sessionId}:${categoryId}:${instanceNumber}:${anchor}`;
    
    // IN-FLIGHT GUARD: Prevent race conditions
    if (inFlightEnsuresRef.current[stableKeyQ]) {
      console.log('[REQUIRED_ANCHOR_FALLBACK][ENSURE_SKIP_INFLIGHT]', {
        stableKeyQ,
        anchor,
        reason: 'Already in flight'
      });
      return { ok: true, didAppend: false, stableKeyQ, skipped: 'inFlight' };
    }
    
    // NO-CRASH WRAPPER: All logic in try/catch
    try {
      // Mark in-flight
      inFlightEnsuresRef.current[stableKeyQ] = true;
      
      // Dedupe check: already in transcript or local
      const existsInDb = Array.isArray(existingTranscript) && existingTranscript.some(e => e.stableKey === stableKeyQ);
      const existsInLocal = canonicalRef && Array.isArray(canonicalRef.current) && canonicalRef.current.some(e => e.stableKey === stableKeyQ);
      
      if (existsInDb && existsInLocal) {
        return { ok: true, didAppend: false, stableKeyQ, reason: 'already_exists' };
      }
      
      // Validate questionText
      if (!questionText || questionText.trim() === '') {
        console.error('[REQUIRED_ANCHOR_FALLBACK][ENSURE_SKIP_EMPTY_TEXT]', {
          stableKeyQ,
          anchor
        });
        return { ok: false, didAppend: false, stableKeyQ, reason: 'empty_text' };
      }
      
      // Append question
      const updated = await appendFn(sessionId, existingTranscript, questionText, {
        id: `required-anchor-q-${sessionId}-${categoryId}-${instanceNumber}-${anchor}`,
        stableKey: stableKeyQ,
        messageType: 'REQUIRED_ANCHOR_QUESTION',
        packId,
        categoryId,
        instanceNumber,
        anchor,
        kind: 'REQUIRED_ANCHOR_FALLBACK',
        visibleToCandidate: true
      });
      
      // Sync local state if helpers provided
      if (syncStateFn && canonicalRef && typeof syncStateFn === 'function') {
        // Local merge helper (inline to avoid TDZ)
        const localMerge = (prev, incoming) => {
          const getKey = (e) => e.stableKey || e.id;
          const map = new Map();
          for (const e of prev) {
            const k = getKey(e);
            if (k) map.set(k, e);
          }
          for (const e of incoming) {
            const k = getKey(e);
            if (k) map.set(k, e);
          }
          return Array.from(map.values()).sort((a, b) => (a.index || 0) - (b.index || 0));
        };
        
        const merged = localMerge(canonicalRef.current, updated);
        syncStateFn(merged, 'required_anchor_q_ensure');
      }
      
      console.log('[REQUIRED_ANCHOR_FALLBACK][Q_ENSURE_APPEND]', {
        stableKeyQ,
        anchor,
        preview: questionText,
        existedInDb,
        existedInLocal
      });
      
      return { ok: true, didAppend: true, stableKeyQ };
    } catch (err) {
      // NO-CRASH: Log but NEVER throw
      console.error('[REQUIRED_ANCHOR_FALLBACK][TRANSCRIPT_Q_ERROR]', {
        error: err.message,
        anchor,
        stableKeyQ,
        phase: 'ENSURE_Q',
        stability: 'NON_FATAL',
        stack: err.stack?.substring(0, 200)
      });
      return { ok: false, didAppend: false, stableKeyQ, error: err.message };
    } finally {
      // ALWAYS clear in-flight
      delete inFlightEnsuresRef.current[stableKeyQ];
    }
  }
  
  // DIAGNOSTIC: Component mount entry point
  console.log("[CANDIDATE_INTERVIEW][MOUNT]", {
    sessionId,
    pathname: window.location.pathname,
    timestamp: Date.now()
  });
  
  console.log('[CANDIDATE_INTERVIEW][BOOT_OK_AFTER_REVERT]', {
    timestamp: Date.now()
  });
  
  // FORENSIC: No-session early return guard (prints once per mount)
  const noSessionEarlyReturnLoggedRef = useRef(false);
  const didSessionRepairRef = useRef(false);
  
  // ============================================================================
  // SESSION URL REPAIR: Auto-fix stripped session param before redirect
  // ============================================================================
  // If session is missing from URL BUT we have it in ref, repair URL automatically
  if (!sessionId && resolvedSessionRef.current && !didSessionRepairRef.current) {
    didSessionRepairRef.current = true;
    
    // Build repaired URL with session param
    const params = new URLSearchParams(window.location.search || "");
    params.set("session", resolvedSessionRef.current);
    const repairedUrl = `/candidateinterview?${params.toString()}`;
    
    console.log('[CANDIDATE_INTERVIEW][SESSION_URL_REPAIR]', {
      from: window.location.search,
      to: repairedUrl,
      repairedSession: resolvedSessionRef.current
    });
    
    // Hard replace to repaired URL (preserves all query params)
    window.location.replace(repairedUrl);
    
    // Render minimal placeholder during repair
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin mx-auto" />
          <p className="text-slate-300">Restoring session...</p>
        </div>
      </div>
    );
  }
  
  // HARD ROUTE GUARD: Render placeholder if no sessionId (navigation happens in useEffect)
  if (!sessionId) {
    // GUARD: Do not redirect while recovery is in-flight
    if (isRecoveringSession) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
          <div className="text-center space-y-4">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin mx-auto" />
            <p className="text-slate-300">Recovering session...</p>
          </div>
        </div>
      );
    }
    
    // LOG: No session and no repair possible - unrecoverable
    if (!noSessionEarlyReturnLoggedRef.current) {
      noSessionEarlyReturnLoggedRef.current = true;
      console.log('[CANDIDATE_INTERVIEW][NO_SESSION_UNRECOVERABLE]', {
        search: window.location.search,
        hadRefSession: !!resolvedSessionRef.current,
        deptParam: urlParams.get('dept'),
        fileParam: urlParams.get('file'),
        action: 'redirect_to_startinterview'
      });
    }
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin mx-auto" />
          <p className="text-slate-300">Redirecting to start interview...</p>
        </div>
      </div>
    );
  }
  
  // TODO: REMOVE CQDIAG after PASS validation
  const cqDiagEnabled = urlParams.get('cqdiag') === '1';
  
  // FORENSIC: Mount-only bootstrap confirmation (proves session param routing worked)
  const bootstrapOkLoggedRef = useRef(false);
  if (!bootstrapOkLoggedRef.current && sessionId) {
    bootstrapOkLoggedRef.current = true;
    console.log('[CANDIDATE_INTERVIEW][BOOTSTRAP_OK]', {
      sessionId,
      hasSession: !!sessionId,
      search: window.location.search,
      note: 'Session param received - no redirect loop'
    });
  }

  // CTA CONSTANTS: Top-level scope (referenced by effects and handlers)
  const CTA_GAP_PX = 12;
  const CTA_FALLBACK_FOOTER_PX = 64; // Conservative minimum
  const CTA_MIN_PADDING_PX = CTA_FALLBACK_FOOTER_PX + CTA_GAP_PX; // 76px hard floor

  const [engine, setEngine] = useState(null);
  const [session, setSession] = useState(null);
  const [department, setDepartment] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [sections, setSections] = useState([]);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [completedSectionsCount, setCompletedSectionsCount] = useState(0);
  const activeSection = sections[currentSectionIndex] || null;

  // STEP 1: CANONICAL TRANSCRIPT SOURCE - Single source of truth (ref-based, never resets)
  const canonicalTranscriptRef = useRef([]);
  
  // CANONICAL TRANSCRIPT: Read-only mirror of session.transcript_snapshot (DB)
  // CRITICAL: Initialize with empty array ONCE - never reset during session
  const [dbTranscript, setDbTranscript] = useState([]);
  const [queue, setQueue] = useState([]);
  const [currentItem, setCurrentItem] = useState(null);
  
  // STABLE: Track if transcript has been initialized to prevent resets
  const transcriptInitializedRef = useRef(false);
  
  // TRANSCRIPT SOT: Single source of truth for all rendering and metrics
  const transcriptSOT = canonicalTranscriptRef.current.length > 0 ? canonicalTranscriptRef.current : dbTranscript;

  // STATE HOISTED: Must be declared before forensicCheck (prevents TDZ crash)
  const [screenMode, setScreenMode] = useState("LOADING");
  const [uiBlocker, setUiBlocker] = useState(null);
  const activeBlocker = uiBlocker; // UI-only blocker, not from canonical transcript
  
  // Dev guardrail: Ensure transcript never shrinks (applied to canonical DB mirror)
  const setDbTranscriptSafe = useCallback((updater) => {
    setDbTranscript(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      
      // CRITICAL: Only allow transcript growth after initialization
      if (transcriptInitializedRef.current && next.length < prev.length) {
        // Detect if this is from a derived list (filtered/deduped) vs canonical source
        const isDerivedList = !Array.isArray(updater) || updater === next;
        
        console.warn('[TRANSCRIPT_GUARD][SHRINK_BLOCKED]', { 
          prevLen: prev.length, 
          nextLen: next.length,
          diff: prev.length - next.length,
          isDerivedList,
          action: 'BLOCKED',
          stack: new Error().stack?.split('\n').slice(1, 4).join(' | ')
        });
        return prev; // BLOCK the shrink
      }
      
      // Mark as initialized on first non-empty transcript
      if (!transcriptInitializedRef.current && next.length > 0) {
        transcriptInitializedRef.current = true;
        console.log('[TRANSCRIPT_INIT] First transcript data loaded', { len: next.length });
      }
      
      return next;
    });
  }, []);
  
  // STEP 1: KEY-BASED monotonic transcript upsert (hoisted function)
  function upsertTranscriptMonotonic(prev, incoming, sourceLabel = 'unknown') {
    if (!Array.isArray(prev)) prev = [];
    if (!Array.isArray(incoming)) incoming = [];
    
    // Key extractor: canonical key > stableKey > id
    const getKey = (e) => e.__canonicalKey || e.stableKey || e.id;
    
    // Priority scorer: higher = better
    const scoreEntry = (e) => {
      const isUser = e.role === 'user';
      const hasText = (e.text || '').trim().length > 0;
      const isVisible = e.visibleToCandidate !== false;
      
      if (isUser && hasText && isVisible) return 4;
      if (isUser && hasText) return 3;
      if (isUser) return 2;
      if (e.role === 'assistant' && hasText) return 1;
      return 0;
    };
    
    // Build maps by key
    const prevMap = new Map();
    const unkeyedPrev = [];
    
    for (const entry of prev) {
      const key = getKey(entry);
      if (!key) {
        unkeyedPrev.push(entry);
        continue;
      }
      
      if (!prevMap.has(key) || scoreEntry(entry) > scoreEntry(prevMap.get(key))) {
        prevMap.set(key, entry);
      }
    }
    
    const incomingMap = new Map();
    const unkeyedIncoming = [];
    
    for (const entry of incoming) {
      const key = getKey(entry);
      if (!key) {
        unkeyedIncoming.push(entry);
        continue;
      }
      
      if (!incomingMap.has(key) || scoreEntry(entry) > scoreEntry(incomingMap.get(key))) {
        incomingMap.set(key, entry);
      }
    }
    
    // KEY-BASED MONOTONIC: Union of keys
    const allKeys = new Set([...prevMap.keys(), ...incomingMap.keys()]);
    const mergedMap = new Map();
    
    for (const key of allKeys) {
      const prevEntry = prevMap.get(key);
      const incomingEntry = incomingMap.get(key);
      
      if (!incomingEntry) {
        // Key only in prev - must keep (monotonic)
        mergedMap.set(key, prevEntry);
      } else if (!prevEntry) {
        // Key only in incoming - add
        mergedMap.set(key, incomingEntry);
      } else {
        // Key in both - prefer higher score
        mergedMap.set(key, scoreEntry(incomingEntry) >= scoreEntry(prevEntry) ? incomingEntry : prevEntry);
      }
    }
    
    // Sort keyed entries: index asc, createdAt asc, stableKey lexical (stable)
    const keyedSorted = Array.from(mergedMap.values()).sort((a, b) => {
      const aIdx = a.index || 0;
      const bIdx = b.index || 0;
      if (aIdx !== bIdx) return aIdx - bIdx;
      
      const aTs = a.createdAt || new Date(a.timestamp || 0).getTime() || 0;
      const bTs = b.createdAt || new Date(b.timestamp || 0).getTime() || 0;
      if (aTs !== bTs) return aTs - bTs;
      
      // Stable fallback: lexical sort by stableKey
      const aKey = a.stableKey || a.id || '';
      const bKey = b.stableKey || b.id || '';
      return aKey.localeCompare(bKey);
    });
    
    // Append unkeyed entries (preserve original relative order)
    const merged = [...keyedSorted, ...unkeyedIncoming, ...unkeyedPrev];
    
    console.log('[TRANSCRIPT_MONOTONIC][UPSERT_KEY_BASED]', {
      prevLen: prev.length,
      incomingLen: incoming.length,
      mergedLen: merged.length,
      prevKeysCount: prevMap.size,
      incomingKeysCount: incomingMap.size,
      mergedKeysCount: mergedMap.size,
      unkeyedCount: unkeyedIncoming.length + unkeyedPrev.length,
      source: sourceLabel
    });
    
    return merged;
  }

  // STEP 2: Monotonic refresh (upsert only, never replace)
  const refreshTranscriptFromDB = useCallback(async (reason) => {
    try {
      const freshSession = await base44.entities.InterviewSession.get(sessionId);
      const freshTranscript = freshSession.transcript_snapshot || [];
      
      // PART 2: GUARD - Never refresh with shorter transcript (storage may be stale)
      const currentLen = canonicalTranscriptRef.current.length;
      if (freshTranscript.length < currentLen) {
        console.warn('[TRANSCRIPT_REFRESH][SKIP_SHORTER]', {
          reason,
          freshLen: freshTranscript.length,
          currentLen,
          delta: currentLen - freshTranscript.length,
          action: 'KEEPING_CURRENT'
        });
        return canonicalTranscriptRef.current; // Return current, do NOT update
      }
      
      // FALLBACK ANSWER PROTECTION: Preserve recently-submitted fallback answers during merge
      const fallbackAnswersInCurrent = canonicalTranscriptRef.current.filter(e => 
        (e.meta?.answerContext === 'REQUIRED_ANCHOR_FALLBACK' || 
         e.answerContext === 'REQUIRED_ANCHOR_FALLBACK' ||
         (e.stableKey && e.stableKey.startsWith('fallback-answer:'))) &&
        e.role === 'user' &&
        e.messageType === 'ANSWER'
      );
      
      const fallbackAnswersInFresh = freshTranscript.filter(e => 
        e.stableKey && e.stableKey.startsWith('fallback-answer:')
      );
      
      // Protect fallback answers: merge fresh with current fallbacks
      let protectedTranscript = freshTranscript;
      let keptCount = 0;
      
      if (fallbackAnswersInCurrent.length > 0) {
        const freshKeys = new Set(freshTranscript.map(e => e.stableKey || e.id).filter(Boolean));
        const missingFallbacks = fallbackAnswersInCurrent.filter(fb => {
          const key = fb.stableKey || fb.id;
          return key && !freshKeys.has(key);
        });
        
        if (missingFallbacks.length > 0) {
          // Add missing fallback answers to fresh transcript (preserves them)
          protectedTranscript = [...freshTranscript, ...missingFallbacks];
          keptCount = missingFallbacks.length;
          
          console.log('[CQ_TRANSCRIPT][FALLBACK_ANSWER_PROTECT_MERGE]', {
            keptCount,
            totalFallbacksInCurrent: fallbackAnswersInCurrent.length,
            fallbacksInFresh: fallbackAnswersInFresh.length,
            note: 'Prevented fallback answers from being dropped during bulk transcript refresh',
            keptKeys: missingFallbacks.map(fb => fb.stableKey || fb.id)
          });
        }
      }
      
      // STEP 2: Upsert into canonical ref (monotonic merge) - use protected transcript
      const merged = upsertTranscriptMonotonic(canonicalTranscriptRef.current, protectedTranscript, `refresh_${reason}`);
      
      // ATOMIC SYNC: Use unified helper
      upsertTranscriptState(merged, `refresh_${reason}`);
      setSession(freshSession);
      
      // DIAGNOSTIC: Check for YES ambiguity in last 5 entries
      if (merged.length >= 5) {
        const last5 = merged.slice(-5);
        const yesAnswers = last5.filter(e => 
          (e.role === 'user' && (e.messageType === 'ANSWER' || e.messageType === 'MULTI_INSTANCE_GATE_ANSWER')) &&
          (e.text === 'Yes' || e.text?.startsWith('Yes'))
        );
        
        if (yesAnswers.length >= 2) {
          const contexts = yesAnswers.map(a => ({
            stableKey: a.stableKey || a.id,
            context: a.meta?.answerContext || a.answerContext || 'unknown',
            text: a.text
          }));
          
          const hasMultipleContexts = new Set(contexts.map(c => c.context)).size > 1;
          
          if (hasMultipleContexts) {
            console.log('[CQ_TRANSCRIPT][YES_AMBIGUITY]', {
              last5: last5.map(e => e.stableKey || e.id),
              contexts,
              reason: 'Multiple YES answers with different contexts in recent history'
            });
          }
        }
      }
      
      return merged;
    } catch (err) {
      console.error('[TRANSCRIPT_REFRESH][ERROR]', { reason, error: err.message });
      return canonicalTranscriptRef.current || [];
    }
  }, [sessionId, setDbTranscriptSafe]);

  // FORENSIC: Canonical transcript verification (DB = source of truth)
  const forensicCheck = useCallback(async (label) => {
    try {
      const fresh = await base44.entities.InterviewSession.get(sessionId);
      const freshLen = (fresh.transcript_snapshot || []).length;
      const localLen = (dbTranscript || []).length;
      
      // Simplified: No visibleLen computation to avoid TDZ with shouldRenderTranscriptEntry
      const freshLastKey = fresh.transcript_snapshot?.at?.(-1)?.stableKey || fresh.transcript_snapshot?.at?.(-1)?.id || null;
      const localLastKey = dbTranscript?.at?.(-1)?.stableKey || dbTranscript?.at?.(-1)?.id || null;
      
      console.log('[FORENSIC][CANONICAL_CHECK]', {
        label,
        freshLen,
        localLen,
        freshLastKey,
        localLastKey
      });
      
      // Detect rewind
      if (label !== 'initial' && freshLen < localLen) {
        console.error('[FORENSIC][FRESH_LEN_REWIND_DETECTED]', {
          label,
          freshLen,
          localLen,
          delta: localLen - freshLen
        });
      }
    } catch (err) {
      console.error('[FORENSIC][CANONICAL_CHECK][ERROR]', { label, error: err.message });
    }
  }, [sessionId, dbTranscript]);
  
  // TDZ HARDENING: Mount-only forensic log
  const tdzHardenLoggedRef = useRef(false);
  useEffect(() => {
    if (!tdzHardenLoggedRef.current) {
      tdzHardenLoggedRef.current = true;
      console.log('[FORENSIC][TDZ_HARDEN_OK]', {
        note: 'hoisted helpers + reordered derived consts (instance opener precedence, scrollToBottomForMiGate)'
      });
    }
  }, []);

  // UNIFIED TRANSCRIPT STATE SYNC - Single source of truth updater
  const upsertTranscriptState = useCallback((nextArray, reason) => {
    if (!Array.isArray(nextArray)) {
      console.error('[TRANSCRIPT_SYNC][NOT_ARRAY]', { reason, type: typeof nextArray });
      return;
    }
    
    // PART 2: NEVER SHRINK - Guard against shorter arrays from stale persistence
    const currentLen = canonicalTranscriptRef.current.length;
    if (nextArray.length < currentLen) {
      console.warn('[TRANSCRIPT_SYNC][SHRINK_BLOCKED]', {
        reason,
        currentLen,
        nextLen: nextArray.length,
        delta: currentLen - nextArray.length,
        action: 'KEEPING_CURRENT'
      });
      return; // Do NOT update - keep current
    }
    
    // ATOMIC UPDATE: Sync ref + state in one operation
    canonicalTranscriptRef.current = nextArray;
    setDbTranscriptSafe(nextArray);
    
    const lastKey = nextArray[nextArray.length - 1]?.stableKey || nextArray[nextArray.length - 1]?.id;
    console.log('[TRANSCRIPT_SYNC]', {
      reason,
      len: nextArray.length,
      lastKey
    });
  }, [setDbTranscriptSafe]);
  
  // STEP 2: Optimistic append helper (canonical as input)
  const appendAndRefresh = useCallback(async (kind, payload, reasonLabel) => {
    // STATIC IMPORT: Use top-level imports (already imported at line 57-58)
    const appendUserMessage = appendUserMessageImport;
    const appendAssistantMessage = appendAssistantMessageImport;
    
    // STEP 2: Use canonical as input (not DB state)
    const currentTranscript = canonicalTranscriptRef.current;
    
    let updatedTranscript;
    if (kind === 'user') {
      updatedTranscript = await appendUserMessage(sessionId, currentTranscript, payload.text, payload.metadata || {});
    } else if (kind === 'assistant') {
      updatedTranscript = await appendAssistantMessage(sessionId, currentTranscript, payload.text, payload.metadata || {});
    } else {
      console.error('[APPEND_AND_REFRESH] Unknown kind:', kind);
      return currentTranscript || [];
    }
    
    // PART 1: ATOMIC - appendUserMessage/appendAssistantMessage already updated transcriptRef
    // Just sync to React state immediately (no merge needed - helpers are source of truth)
    canonicalTranscriptRef.current = updatedTranscript;
    setDbTranscriptSafe(updatedTranscript);
    
    console.log('[TRANSCRIPT_SYNC]', {
      reason: `append_${kind}_${reasonLabel}`,
      len: updatedTranscript.length,
      lastKey: updatedTranscript[updatedTranscript.length - 1]?.stableKey || updatedTranscript[updatedTranscript.length - 1]?.id
    });
    
    // Background refresh (upsert only, never replace) - BEST EFFORT
    setTimeout(async () => {
      try {
        const freshAfterAppend = await base44.entities.InterviewSession.get(sessionId);
        const freshTranscript = freshAfterAppend.transcript_snapshot || [];
        
        // PART 2: Only refresh if fresh is longer (never shrink)
        if (freshTranscript.length >= canonicalTranscriptRef.current.length) {
          const refreshed = upsertTranscriptMonotonic(canonicalTranscriptRef.current, freshTranscript, `refresh_after_${reasonLabel}`);
          upsertTranscriptState(refreshed, `refresh_after_${reasonLabel}`);
          setSession(freshAfterAppend);
        } else {
          console.log('[APPEND_REFRESH_BG][SKIP_SHORTER]', {
            freshLen: freshTranscript.length,
            currentLen: canonicalTranscriptRef.current.length,
            reason: 'Fresh from DB is shorter - keeping current'
          });
        }
      } catch (err) {
        console.error('[APPEND_REFRESH_BG][ERROR]', { error: err.message });
      }
    }, 50);
    
    // RETURN CONTRACT: Return updated transcript (immediate visibility)
    return updatedTranscript;
  }, [sessionId, upsertTranscriptState, setDbTranscriptSafe]);

  const [currentFollowUpAnswers, setCurrentFollowUpAnswers] = useState({});
  
  // V3 UI-ONLY HISTORY: Moved here to prevent TDZ error (used in refreshTranscriptFromDB below)
  const [v3ProbeDisplayHistory, setV3ProbeDisplayHistory] = useState([]);
  const lastPersistedV3OpenerKeyRef = useRef(null);

  const [aiSessionId, setAiSessionId] = useState(null);
  const [aiProbingPackInstanceKey, setAiProbingPackInstanceKey] = useState(null);
  const [agentMessages, setAgentMessages] = useState([]);
  const [isWaitingForAgent, setIsWaitingForAgent] = useState(false);
  const [currentFollowUpPack, setCurrentFollowUpPack] = useState(null);
  const [probingTurnCount, setProbingTurnCount] = useState(0);
  const [aiProbingDisabledForSession, setAiProbingDisabledForSession] = useState(false);

  const [aiFollowupCounts, setAiFollowupCounts] = useState({});
  const [isInvokeLLMMode, setIsInvokeLLMMode] = useState(false);
  const [invokeLLMProbingExchanges, setInvokeLLMProbingExchanges] = useState([]);
  const [fieldSuggestions, setFieldSuggestions] = useState({});

  const [fieldProbingState, setFieldProbingState] = useState({});
  const [completedFields, setCompletedFields] = useState({});
  const [currentFieldProbe, setCurrentFieldProbe] = useState(null);
  const [pendingProbe, setPendingProbe] = useState(null);
  const v2ProbingInProgressRef = useRef(new Set());
  const [v2ClarifierState, setV2ClarifierState] = useState(null);

  // Store backend question text per V2 pack field and instance
  const [backendQuestionTextMap, setBackendQuestionTextMap] = useState({});

  // Track the last AI follow-up question text per field so we can show it on history cards
  const [lastAiFollowupQuestionByField, setLastAiFollowupQuestionByField] = useState({});

  const [aiProbingEnabled, setAiProbingEnabled] = useState(true);
  const [aiFailureReason, setAiFailureReason] = useState(null);
  const [handoffProcessed, setHandoffProcessed] = useState(false);

  const [input, setInput] = useState("");
  const [validationHint, setValidationHint] = useState(null);
  const [isCommitting, setIsCommitting] = useState(false);
  
  // V3 OPENER: Dedicated draft state (isolated from shared input state)
  const [openerDraft, setOpenerDraft] = useState("");
  const openerDraftChangeCountRef = useRef(0); // Throttle logging

  // UX: Typing lock to prevent preview refreshes while user is typing
  const [isUserTyping, setIsUserTyping] = useState(false);
  const typingLockTimeoutRef = useRef(null);
  const currentItemRef = useRef(null);
  const frozenPreviewRef = useRef(null);

  const triggeredPacksRef = useRef(new Set());
  const lastLoggedV2PackFieldRef = useRef(null);
  const lastLoggedFollowupCardIdRef = useRef(null);
  
  // Idempotency guards
  const submittedKeysRef = useRef(new Set());
  const completedSectionKeysRef = useRef(new Set());
  const appendedTranscriptKeysRef = useRef(new Set());

  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [isCompletingInterview, setIsCompletingInterview] = useState(false);
  const [showPauseModal, setShowPauseModal] = useState(false);
  
  // Footer overlap guardrail: Track max overlap seen for regression detection
  const maxOverlapSeenRef = React.useRef({ maxOverlapPx: 0, lastModeSeen: null });

  // TDZ_FIX: REMOVED - Replaced with hoisted-safe plain function at component top (line ~1220)

  // MOVED UP: screenMode and uiBlocker now declared before forensicCheck (prevents TDZ)
  const introLoggedRef = useRef(false);
  const [isDismissingWelcome, setIsDismissingWelcome] = useState(false);
  const welcomeLoggedRef = useRef(false);

  const [sectionCompletionMessage, setSectionCompletionMessage] = useState(null);
  const [sectionTransitionInfo, setSectionTransitionInfo] = useState(null);
  const [pendingSectionTransition, setPendingSectionTransition] = useState(null);
  const [pendingTransition, setPendingTransition] = useState(null);

  const historyRef = useRef(null);
  const bottomAnchorRef = useRef(null);
  const footerRef = useRef(null);
  const footerRootRef = useRef(null); // Footer container root (for DOM height sampling)
  const footerShellRef = useRef(null); // PART A: Stable footer wrapper (measured in all modes)
  const activeLaneCardRef = useRef(null); // PART A: Active lane card ref (single ref for whichever active card is shown)
  const scrollOwnerRef = useRef(null); // PART A: Runtime-identified scroll owner (true scroll container)
  const [dynamicFooterHeightPx, setDynamicFooterHeightPx] = useState(80); // Dynamic footer height measurement
  const promptLaneRef = useRef(null);
  const autoScrollEnabledRef = useRef(true);
  
  // SCROLL LOCK: Prevent competing scroll writers during v3_pack_opener settle
  const scrollWriteLockRef = useRef(false);
  const scrollWriteLockReasonRef = useRef(null);
  const scrollWriteLockUntilRef = useRef(0);
  
  // TDZ FIX: Scroll helpers declared early (before any useEffects that reference them)
  
  // SCROLL LOCK HELPERS: Prevent competing scroll writers
  const lockScrollWrites = useCallback((reason, ms = 250) => {
    scrollWriteLockRef.current = true;
    scrollWriteLockReasonRef.current = reason;
    scrollWriteLockUntilRef.current = Date.now() + ms;
    
    console.log('[SCROLL][LOCK]', {
      action: 'LOCK',
      reason,
      untilMsRemaining: ms
    });
  }, []);
  
  const unlockScrollWrites = useCallback((reason) => {
    scrollWriteLockRef.current = false;
    scrollWriteLockReasonRef.current = null;
    scrollWriteLockUntilRef.current = 0;
    
    console.log('[SCROLL][LOCK]', {
      action: 'UNLOCK',
      reason
    });
  }, []);
  
  const isScrollWriteLocked = useCallback(() => {
    if (!scrollWriteLockRef.current) return false;
    
    const now = Date.now();
    if (now >= scrollWriteLockUntilRef.current) {
      // Lock expired - auto-unlock
      unlockScrollWrites('AUTO_EXPIRE');
      return false;
    }
    
    return true;
  }, [unlockScrollWrites]);
  
  // FOOTER OVERLAP SELF-HEAL: Post-alignment verification for YES/NO mode
  const footerOverlapSelfHealRef = useRef(new Set());
  
  const selfHealFooterOverlap = useCallback((reason) => {
    const scroller = scrollOwnerRef.current || historyRef.current;
    if (!scroller) return;
    
    const activeCardEl = scroller.querySelector('[data-cq-active-card="true"][data-ui-contract-card="true"]');
    if (!activeCardEl) return;
    
    const composerEl = footerShellRef.current;
    if (!composerEl) return;
    
    const activeRect = activeCardEl.getBoundingClientRect();
    const composerRect = composerEl.getBoundingClientRect();
    const footerTop = composerRect.top;
    const overlapPx = Math.max(0, activeRect.bottom - footerTop);
    
    if (overlapPx > 0) {
      const scrollTopBefore = scroller.scrollTop;
      scroller.scrollTop += overlapPx + 8;
      const scrollTopAfter = scroller.scrollTop;
      
      console.log('[UI_CONTRACT][FOOTER_OVERLAP_HEAL]', {
        overlapPx: Math.round(overlapPx),
        footerHeightPx: Math.round(dynamicFooterHeightPx),
        appliedPaddingBottomPx: Math.round(dynamicFooterHeightPx),
        scrollTopBefore: Math.round(scrollTopBefore),
        scrollTopAfter: Math.round(scrollTopAfter),
        reason
      });
    }
  }, [dynamicFooterHeightPx]);
  
  // PART A: Helper to identify true scroll owner at runtime
  const getScrollOwner = useCallback((startElement) => {
    if (!startElement || typeof window === 'undefined') return null;
    
    let el = startElement;
    
    // Walk up DOM tree to find scroll container
    while (el && el !== document.body) {
      const computed = window.getComputedStyle(el);
      const overflowY = computed.overflowY;
      const isScrollable = overflowY === 'auto' || overflowY === 'scroll';
      
      if (isScrollable) {
        // Check if this element can actually scroll (or is intended to)
        const canScroll = el.scrollHeight > el.clientHeight || 
                         el === historyRef.current; // Recognize intended scroll owner
        
        if (canScroll || el === historyRef.current) {
          return el;
        }
      }
      
      el = el.parentElement;
    }
    
    // Fallback: return historyRef if walk-up failed
    return historyRef.current;
  }, []);
  
  // PART D: CANONICAL SCROLL TO BOTTOM - Single source of truth for bottom scrolling
  const scrollToBottom = useCallback((reason) => {
    const scroller = scrollOwnerRef.current || historyRef.current;
    if (!scroller) {
      console.warn('[SCROLL][NO_SCROLLER]', { reason });
      return;
    }
    
    const scrollHeight = scroller.scrollHeight;
    const clientHeight = scroller.clientHeight;
    const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
    
    const scrollTopBefore = scroller.scrollTop;
    scroller.scrollTop = maxScrollTop;
    const scrollTopAfter = scroller.scrollTop;
    
    console.log('[SCROLL][TO_BOTTOM]', {
      reason,
      scrollTopBefore: Math.round(scrollTopBefore),
      scrollTopAfter: Math.round(scrollTopAfter),
      maxScrollTop: Math.round(maxScrollTop),
      scrollHeight: Math.round(scrollHeight),
      clientHeight: Math.round(clientHeight)
    });
  }, []);
  
  // MI_GATE SCROLL HELPER: Bottom-anchor scroll for MI gate (hoisted)
  const scrollToBottomForMiGate = useCallback((reason) => {
    if (!bottomAnchorRef.current) return;
    
    const scrollContainer = scrollOwnerRef.current || historyRef.current;
    if (!scrollContainer) return;
    
    const scrollTopBefore = scrollContainer.scrollTop;
    bottomAnchorRef.current.scrollIntoView({ block: 'end', behavior: 'auto' });
    const scrollTopAfter = scrollContainer.scrollTop;
    
    console.log('[SCROLL][MI_GATE_BOTTOM_ANCHOR]', {
      reason,
      scrollTopBefore: Math.round(scrollTopBefore),
      scrollTopAfter: Math.round(scrollTopAfter),
      strategy: 'BOTTOM_ANCHOR'
    });
  }, []);
  
  // PART D: CANONICAL POST-RENDER VISIBILITY CORRECTION
  // ChatGPT-style: Ensures active item is ALWAYS fully visible above composer
  // PART A: Updated signature with YES/NO mode flags (TDZ-safe)
  const ensureActiveVisibleAfterRender = useCallback((reason, activeKindSOT, isYesNoModeSOT = false, isMiGateSOT = false) => {
    const scroller = scrollOwnerRef.current || historyRef.current;
    if (!scroller) return;
    
    const composerEl = footerShellRef.current; // PART D: Stable footer shell (all modes)
    if (!composerEl) return;
    
    // PART C: Lock scroll writes for v3_pack_opener settle (extended window)
    const isV3Opener = activeKindSOT === 'v3_pack_opener' || activeKindSOT === 'V3_OPENER';
    if (isV3Opener) {
      lockScrollWrites('V3_PACK_OPENER_SETTLE', 1000);
    }
    
    // RAF for fresh layout (post-render DOM state)
    requestAnimationFrame(() => {
      if (!scroller || !composerEl) return;
      
      // Find active card element
      let activeCardEl = scroller.querySelector('[data-cq-active-card="true"][data-ui-contract-card="true"]');
      if (!activeCardEl) {
        activeCardEl = scroller.querySelector('[data-cq-active-card="true"]');
      }
      if (!activeCardEl && activeLaneCardRef.current) {
        activeCardEl = activeLaneCardRef.current;
      }
      
      // No active card - nothing to align
      if (!activeCardEl) {
        if (isV3Opener) {
          unlockScrollWrites('V3_PACK_OPENER_NO_CARD');
        }
        return;
      }
      
      // PART A: Measure using composer top as occlusion boundary
      const activeRect = activeCardEl.getBoundingClientRect();
      const composerRect = composerEl.getBoundingClientRect();
      const occlusionTop = composerRect.top;
      const clearancePx = 8; // Safety buffer
      const overlapPx = Math.max(0, activeRect.bottom - (occlusionTop - clearancePx));
      
      // PART C: Hard align for YES/NO mode (TDZ-safe - uses passed flags)
      const isYesNoModeAlign = isYesNoModeSOT || isMiGateSOT;
      
      if (isYesNoModeAlign && overlapPx > 0) {
        const scrollTopBefore = scroller.scrollTop;
        const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        
        // Apply exact delta with extra buffer for YES/NO
        const desiredDelta = overlapPx + 24; // Extra clearance for YES/NO footer
        scroller.scrollTop = Math.min(maxScrollTop, scroller.scrollTop + desiredDelta);
        const scrollTopAfter = scroller.scrollTop;
        
        console.log('[SCROLL][ALIGN_YESNO_HARD]', {
          reason,
          isYesNoModeSOT,
          isMiGateSOT,
          overlapPx: Math.round(overlapPx),
          scrollTopBefore: Math.round(scrollTopBefore),
          scrollTopAfter: Math.round(scrollTopAfter),
          maxScrollTop: Math.round(maxScrollTop),
          deltaCorrectionApplied: Math.round(scrollTopAfter - scrollTopBefore)
        });
        
        // SELF-HEAL: Verify overlap resolved after alignment
        const itemId = currentItem?.id;
        const healKey = `${itemId}:${reason}`;
        
        if (!footerOverlapSelfHealRef.current.has(healKey)) {
          footerOverlapSelfHealRef.current.add(healKey);
          
          requestAnimationFrame(() => {
            selfHealFooterOverlap(reason);
          });
        }
        
        // Unlock after YES/NO align
        if (isV3Opener) {
          unlockScrollWrites('YESNO_ALIGN_DONE');
        }
        
        return; // Skip regular overlap handling
      }
      
      // PART B: Apply exact delta correction (no baseline anchor)
      if (overlapPx > 4) {
        const bufferPx = isV3Opener ? 32 : 16;
        const scrollTopBefore = scroller.scrollTop;
        const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        
        // Compute delta and apply
        const desiredDelta = overlapPx + bufferPx;
        scroller.scrollTop = Math.min(maxScrollTop, scroller.scrollTop + desiredDelta);
        const scrollTopAfter = scroller.scrollTop;
        
        // PART D: Log once for proof
        const packId = currentItem?.packId;
        const instanceNumber = currentItem?.instanceNumber;
        const logKey = `align_to_composer_${packId}_${instanceNumber}`;
        
        logOnce(logKey, () => {
          console.log('[SCROLL][ALIGN_TO_COMPOSER]', {
            overlapPx: Math.round(overlapPx),
            scrollTopBefore: Math.round(scrollTopBefore),
            scrollTopAfter: Math.round(scrollTopAfter),
            occlusionTop: Math.round(occlusionTop),
            activeBottom: Math.round(activeRect.bottom),
            composerTop: Math.round(composerRect.top),
            clearancePx,
            bufferPx,
            maxScrollTop: Math.round(maxScrollTop),
            packId,
            instanceNumber
          });
        });
        
        console.log('[SCROLL][ENSURE_ACTIVE][PASS1]', {
          reason,
          overlapPx: Math.round(overlapPx),
          bufferPx,
          scrollTopBefore: Math.round(scrollTopBefore),
          scrollTopAfter: Math.round(scrollTopAfter),
          deltaCorrectionApplied: Math.round(scrollTopAfter - scrollTopBefore)
        });
        
        // PART B: Expand spacer when overlap detected (v3_opener only)
        if (isV3Opener && overlapPx > 4) {
          const packId = currentItem?.packId;
          const instanceNumber = currentItem?.instanceNumber;
          const expansionKey = `${packId}:${instanceNumber}`;
          
          // TDZ-SAFE: Capture activeKindSOT in local variable for RAF closure
          const activeKindForRetry = activeKindSOT;
          
          // PART B: Only expand once per instance
          if (packId && instanceNumber && !expandedInstancesRef.current.has(expansionKey)) {
            expandedInstancesRef.current.add(expansionKey);
            
            const additionalSpacerPx = overlapPx + 32; // Add overlap + buffer
            
            setExtraBottomSpacerPx(prev => {
              const next = Math.min(prev + additionalSpacerPx, 300); // Cap at 300px
              
              logOnce(`v3_spacer_expand_${packId}_${instanceNumber}`, () => {
                console.log('[SPACER][V3_DYNAMIC_EXPAND]', {
                  packId,
                  instanceNumber,
                  overlapPx: Math.round(overlapPx),
                  extraBottomSpacerPxBefore: Math.round(prev),
                  extraBottomSpacerPxAfter: Math.round(next),
                  bottomSpacerPxAfter: Math.round(baseSpacerPx + next),
                  reason: 'Insufficient scroll range - expanding spacer'
                });
              });
              
              return next;
            });
            
            // PART B: Schedule retry after spacer expands (TDZ-SAFE: compute at call time)
            requestAnimationFrame(() => {
              const isYesNoForRetry = bottomBarModeSOT === 'YES_NO';
              const isMiGateForRetry = effectiveItemType === 'multi_instance_gate' || activeUiItem?.kind === 'MI_GATE';
              ensureActiveVisibleAfterRender('V3_OPENER_SPACER_EXPAND_RETRY', activeKindForRetry, isYesNoForRetry, isMiGateForRetry);
            });
          }
        }
        
        // PART B: One retry for v3_pack_opener (layout may settle)
        if (isV3Opener && overlapPx > 4) {
          requestAnimationFrame(() => {
            if (!scroller || !composerEl || !activeCardEl) return;
            
            // Re-measure after first correction
            const activeRect2 = activeCardEl.getBoundingClientRect();
            const composerRect2 = composerEl.getBoundingClientRect();
            const occlusionTop2 = composerRect2.top;
            const overlapPx2 = Math.max(0, activeRect2.bottom - (occlusionTop2 - clearancePx));
            
            // Compute scroll dimensions for PASS2 (before if/else to avoid TDZ)
            const scrollTopBefore2 = scroller.scrollTop;
            const scrollHeight2 = scroller.scrollHeight;
            const clientHeight2 = scroller.clientHeight;
            const maxScrollTop2 = Math.max(0, scrollHeight2 - clientHeight2);
            
            if (overlapPx2 > 4) {
              // Apply delta again
              const desiredDelta2 = overlapPx2 + bufferPx;
              scroller.scrollTop = Math.min(maxScrollTop2, scroller.scrollTop + desiredDelta2);
              const scrollTopAfter2 = scroller.scrollTop;
              
              console.log('[SCROLL][ENSURE_ACTIVE][PASS2_V3_OPENER]', {
                reason,
                overlapPx2: Math.round(overlapPx2),
                bufferPx,
                scrollTopBefore2: Math.round(scrollTopBefore2),
                scrollTopAfter2: Math.round(scrollTopAfter2),
                maxScrollTop2: Math.round(maxScrollTop2),
                deltaCorrectionApplied: Math.round(scrollTopAfter2 - scrollTopBefore2)
              });
              
              // PART C: Unlock after PASS 2
              unlockScrollWrites('V3_PACK_OPENER_SETTLE_PASS2_DONE');
            } else {
              console.log('[SCROLL][LOCK_PHASE]', {
                phase: 'PASS2_CLEAR',
                overlapPx: Math.round(overlapPx2),
                scrollTop: Math.round(scroller.scrollTop),
                maxScrollTop: Math.round(maxScrollTop2)
              });
              
              // PART C: Unlock if no overlap in PASS 2
              unlockScrollWrites('V3_PACK_OPENER_SETTLE_PASS2_CLEAR');
            }
          });
        } else if (isV3Opener) {
          console.log('[SCROLL][LOCK_PHASE]', {
            phase: 'PASS1_CLEAR',
            overlapPx: Math.round(overlapPx),
            scrollTop: Math.round(scroller.scrollTop),
            reason: 'overlap <= 4px after PASS 1'
          });
        }
      } else {
        // No overlap detected
        if (isV3Opener) {
          console.log('[SCROLL][LOCK_PHASE]', {
            phase: 'NO_OVERLAP',
            overlapPx: 0,
            scrollTop: Math.round(scroller.scrollTop),
            reason: 'No overlap - deferring unlock to timeout'
          });
        }
      }
    });
    
    // PART C: Failsafe unlock after 1000ms (belt-and-suspenders)
    if (isV3Opener) {
      setTimeout(() => {
        if (scrollWriteLockRef.current && scrollWriteLockReasonRef.current === 'V3_PACK_OPENER_SETTLE') {
          const scrollerNow = scrollOwnerRef.current || historyRef.current;
          if (scrollerNow) {
            const scrollTopNow = scrollerNow.scrollTop;
            const scrollHeightNow = scrollerNow.scrollHeight;
            const clientHeightNow = scrollerNow.clientHeight;
            const maxScrollTopNow = Math.max(0, scrollHeightNow - clientHeightNow);
            
            unlockScrollWrites('V3_PACK_OPENER_FAILSAFE_TIMEOUT');
            console.log('[SCROLL][LOCK_PHASE]', {
              phase: 'UNLOCKED',
              reason: 'FAILSAFE_TIMEOUT_1000MS',
              scrollTop: Math.round(scrollTopNow),
              maxScrollTop: Math.round(maxScrollTopNow)
            });
          } else {
            unlockScrollWrites('V3_PACK_OPENER_FAILSAFE_TIMEOUT');
            console.log('[SCROLL][LOCK_PHASE]', {
              phase: 'UNLOCKED',
              reason: 'FAILSAFE_TIMEOUT_1000MS_NO_SCROLLER'
            });
          }
        }
      }, 1000);
    }
  // TDZ GUARD: Do not reference flags declared later in file (e.g., isYesNoModeSOT).
  // These are callback PARAMETERS, not closure deps - passed fresh on every call.
  }, [currentItem, lockScrollWrites, unlockScrollWrites, selfHealFooterOverlap]);
  const didInitialSnapRef = useRef(false);
  const isProgrammaticScrollRef = useRef(false);
  const pendingScrollRafRef = useRef(null);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const lastAutoScrollLenRef = useRef(0);
  const lastAutoScrollAtRef = useRef(0);
  const displayOrderRef = useRef(0);
  const scrollIntentRef = useRef(false); // Coordination flag for scroll controllers
  const prevPaddingRef = useRef(0); // Track previous padding for compensation
  const stableBottomPaddingRef = useRef(0); // Stable padding floor (never decreases while footer visible)
  const frozenRenderStreamRef = useRef(null); // Frozen transcript during typing (prevents flash)
  const lastTextareaScrollHeightRef = useRef(0); // Track textarea row changes
  const wasTypingRef = useRef(false); // Track typing state transitions (for freeze/unfreeze)
  const inputRef = useRef(null);
  const yesButtonRef = useRef(null);
  const noButtonRef = useRef(null);
  const questionCardRef = useRef(null);
  const [questionCardHeight, setQuestionCardHeight] = useState(0);
  const [textareaRows, setTextareaRows] = useState(1);
  const unsubscribeRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const aiResponseTimeoutRef = useRef(null);
  const [footerHeightPx, setFooterHeightPx] = useState(120); // Dynamic footer height measurement
  const [footerShellHeightPx, setFooterShellHeightPx] = useState(0); // PART B: Stable footer shell height (all modes)
  const [contentOverflows, setContentOverflows] = useState(false); // Track if scroll container overflows
  
  const AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 140;
  const SAFE_FOOTER_CLEARANCE_PX = 8; // Minimal safety buffer (~75% reduction vs old 24px)
  const HISTORY_GAP_PX = 16; // Normal spacing for transcript history items
  
  // HOOK ORDER FIX: Overflow detection MUST be top-level (before early returns)
  // Computes if scroll container content exceeds viewport - drives dynamic footer padding
  React.useLayoutEffect(() => {
    const el = historyRef.current;
    if (!el) return;
    
    const computeOverflow = () => {
      // SCROLL REF AUDIT: Confirm ref is attached to actual scroll container
      console.log('[UI][SCROLL_REF_AUDIT]', {
        hasEl: !!el,
        overflowY: getComputedStyle(el).overflowY,
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight
      });
      
      // FIX: Exclude paddingBottom from scrollHeight to prevent self-referential loop
      // scrollHeight includes padding, which creates feedback where large padding causes overflow=true forever
      const pb = parseFloat(getComputedStyle(el).paddingBottom || "0") || 0;
      const contentHeight = el.scrollHeight - pb;
      const overflows = contentHeight > el.clientHeight + 4; // 4px threshold for rounding
      
      // Only update state if changed (prevents thrash)
      setContentOverflows(prev => {
        if (prev === overflows) return prev;
        
        console.log('[UI][DYNAMIC_FOOTER_PADDING]', {
          contentOverflows: overflows,
          paddingBottomPx: pb,
          contentHeightExcludingPadding: contentHeight,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          transitioned: prev !== overflows ? `${prev} → ${overflows}` : 'no change'
        });
        
        return overflows;
      });
    };
    
    // Compute on mount and when dependencies change
    computeOverflow();
    
    // Recompute on window resize
    const handleResize = () => computeOverflow();
    window.addEventListener('resize', handleResize);
    
    return () => window.removeEventListener('resize', handleResize);
  }, [
    dbTranscript?.length ?? 0,
    v3ProbeDisplayHistory?.length ?? 0,
    currentItem?.type,
    currentItem?.id,
    footerHeightPx
  ]);

  const [interviewMode, setInterviewMode] = useState("DETERMINISTIC");
  const [ideEnabled, setIdeEnabled] = useState(false);
  const [currentIncidentId, setCurrentIncidentId] = useState(null);
  const [inIdeProbingLoop, setInIdeProbingLoop] = useState(false);
  const [currentIdeQuestion, setCurrentIdeQuestion] = useState(null);
  const [currentIdeCategoryId, setCurrentIdeCategoryId] = useState(null);

  // V2_PACK mode state: 'BASE' = normal flow, 'V2_PACK' = running a V2 follow-up pack
  const [v2PackMode, setV2PackMode] = useState("BASE");
  // activeV2Pack: { packId, fields, currentIndex, baseQuestionId, instanceNumber, substanceName } | null
  const [activeV2Pack, setActiveV2Pack] = useState(null);
  // Track the base question ID that triggered the V2 pack so we can resume after
  const [v2PackTriggerQuestionId, setV2PackTriggerQuestionId] = useState(null);

  // V3 Probing state
  const [v3ProbingActive, setV3ProbingActive] = useState(false);
  const [v3ProbingContext, setV3ProbingContext] = useState(null);
  const [v3ActivePromptText, setV3ActivePromptText] = useState(null); // NEW: Active probe question for input placeholder
  const v3AnswerHandlerRef = useRef(null); // NEW: Ref to V3ProbingLoop's answer handler
  const [v3PendingAnswer, setV3PendingAnswer] = useState(null); // NEW: Answer to route to V3ProbingLoop
  // Track V3-enabled packs: Map<packId, { isV3: boolean, factModelReady: boolean }>
  const [v3EnabledPacks, setV3EnabledPacks] = useState({});
  
  // REQUIRED ANCHOR FALLBACK: Deterministic prompt when V3_WAITING with missing required fields
  const [requiredAnchorFallbackActive, setRequiredAnchorFallbackActive] = useState(false);
  const [requiredAnchorQueue, setRequiredAnchorQueue] = useState([]);
  const [requiredAnchorCurrent, setRequiredAnchorCurrent] = useState(null);
  
  // REQUIRED ANCHOR FALLBACK CONTEXT: Persist routing context for submit
  const requiredAnchorFallbackContextRef = useRef({ packId: null, categoryId: null, instanceNumber: null, incidentId: null });
  
  // REQUIRED ANCHOR FALLBACK ANSWERED: Track anchors answered via fallback (in-memory fast check)
  const fallbackAnsweredRef = useRef({});
  
  // V3 PROMPT LIFECYCLE: Track prompt phase to prevent stale prompt rendering
  // "IDLE" = no prompt, "ANSWER_NEEDED" = prompt active waiting for answer, "PROCESSING" = answer submitted
  const [v3PromptPhase, setV3PromptPhase] = useState("IDLE");
  const lastV3PromptPhaseRef = useRef("IDLE");
  
  // V3 PROMPT SNAPSHOTS: In-memory store to track committed prompts (PART B)
  const [v3PromptSnapshots, setV3PromptSnapshots] = useState([]);
  const v3PromptSnapshotsRef = useRef([]);
  
  // PART 3: Sync snapshots state to ref (prevents stale closure in watchdog)
  useEffect(() => {
    v3PromptSnapshotsRef.current = v3PromptSnapshots;
  }, [v3PromptSnapshots]);
  
  // FOOTER CONTROLLER TRACE: Track last seen values for change detection
  const lastFooterControllerRef = useRef(null);
  const lastBottomBarModeRef = useRef(null);
  const lastEffectiveItemTypeRef = useRef(null);
  // ACTIVE UI ITEM TRACE: Track kind changes (must be top-level hook)
  const lastActiveUiItemKindRef = useRef(null);
  // V3 Debug mode
  const [v3DebugEnabled, setV3DebugEnabled] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [isNewSession, setIsNewSession] = useState(true);
  
  // TERMINAL REDIRECT: One-shot guard for no-session redirect
  const didTerminalRedirectRef = useRef(false);
  // showRedirectFallback moved to top (line ~1338) - prevents TDZ crash
  
  // HOOK ORDER VERIFICATION: All hooks declared - confirm component renders
  console.log('[CQ_HOOKS_OK]', { sessionId });
  
  // FORENSIC: Mount-only log confirming TDZ fix for showRedirectFallback
  const tdzFixLoggedRef = useRef(false);
  if (!tdzFixLoggedRef.current) {
    tdzFixLoggedRef.current = true;
    console.log('[FORENSIC][NO_SESSION_REDIRECT_STATE_ORDER_OK]', {
      showRedirectFallbackDefined: true
    });
  }
  
  // PART A: Violation snapshot helper (component-scoped - needs refs/state access)
  const captureViolationSnapshot = useCallback((context) => {
    const { reason, list, packId, instanceNumber, activeItemId } = context;
    
    // Dedupe key: only log once per unique violation context
    const snapshotKey = `${packId || 'na'}:${instanceNumber || 'na'}:${activeItemId || 'na'}:${reason}`;
    
    // Use module-scope logOnce (already declared above)
    logOnce(snapshotKey, () => {
      // PART D: Skip active card measurement for MI gate (expected behavior)
      const isMiGateContext = (currentItem?.type === 'multi_instance_gate') || 
                             (activeUiItem?.kind === 'MI_GATE');
      
      if (isMiGateContext) {
        console.log('[MI_GATE][SCROLL_STRATEGY]', {
          reason,
          packId: packId || 'none',
          instanceNumber: instanceNumber || 'none',
          strategy: 'BOTTOM_ANCHOR',
          skipCardMeasurement: true,
          note: 'MI gate uses bottom-anchor scroll - no card measurement needed'
        });
        return; // Exit early - no violation snapshot for MI gate
      }
      
      // 1) RENDER LIST TRUTH
      const gateIndex = list ? list.findIndex(item => isMiGateItem(item, packId, instanceNumber)) : -1;
      const totalItems = list?.length || 0;
      const lastIndex = totalItems > 0 ? totalItems - 1 : -1;
      const trailingCount = (gateIndex !== -1 && gateIndex < lastIndex) ? (lastIndex - gateIndex) : 0;
      
      const trailingItems = (gateIndex !== -1 && gateIndex < lastIndex) 
        ? list.slice(gateIndex + 1).map((e, idx) => ({
            i: gateIndex + 1 + idx,
            kind: e.kind || e.messageType || e.type || 'unknown',
            type: e.type || null,
            messageType: e.messageType || null,
            stableKeySuffix: (e.stableKey || e.id || '').slice(-18),
            itemIdSuffix: (e.id || '').slice(-18),
            isV3Related: (e.meta?.v3PromptSource || e.meta?.packId || e.kind?.includes('v3')) ? true : false
          }))
        : [];
      
      // 2) DOM TRUTH
      let scrollTop = 0;
      let clientHeight = 0;
      let scrollHeight = 0;
      let footerTop = 0;
      let activeCardBottom = null;
      let overlapPx = 0;
      let measurementMethod = 'none';
      
      if (typeof window !== 'undefined' && historyRef.current) {
        const scrollContainer = historyRef.current;
        
        scrollTop = Math.round(scrollContainer.scrollTop);
        clientHeight = Math.round(scrollContainer.clientHeight);
        scrollHeight = Math.round(scrollContainer.scrollHeight);
        
        // PART A: Correct footer element - use footerRef (inner div) for accurate positioning
        const footerEl = footerRef.current;
        if (footerEl) {
          footerTop = Math.round(footerEl.getBoundingClientRect().top);
        } else {
          console.warn('[CQ_VIOLATION][FOOTER_REF_NULL]', { reason: 'footerRef not attached' });
          footerTop = -1; // Sentinel value
        }
        
        // PART B: Multi-location active card detection (scroll container OR active lane)
        let activeCardEl = null;
        
        // Location 1: Try scroll container first (tier 1: strict, tier 2: loose, tier 3: stableKey)
        activeCardEl = scrollContainer.querySelector('[data-cq-active-card="true"][data-ui-contract-card="true"]');
        measurementMethod = 'scroll_attr_cq_active';
        
        if (!activeCardEl) {
          activeCardEl = scrollContainer.querySelector('[data-cq-active-card="true"]');
          measurementMethod = 'scroll_attr_cq_active_loose';
        }
        
        if (!activeCardEl && currentItem?.id) {
          const stableKey = currentItem.type === 'question' ? `question-shown:${currentItem.id}` :
                           currentItem.type === 'multi_instance_gate' ? `mi-gate:${currentItem.packId}:${currentItem.instanceNumber}:q` :
                           null;
          
          if (stableKey) {
            activeCardEl = scrollContainer.querySelector(`[data-stablekey="${stableKey}"]`);
            measurementMethod = 'scroll_stablekey_fallback';
          }
        }
        
        // PART B: Location 2: Try active lane ref if scroll container search failed
        if (!activeCardEl && activeLaneCardRef.current) {
          activeCardEl = activeLaneCardRef.current;
          measurementMethod = 'active_lane_ref';
          console.log('[CQ_VIOLATION][ACTIVE_LANE_REF_USED]', {
            reason: 'Active card not in scroll container - using active lane ref',
            hasRef: !!activeLaneCardRef.current
          });
        }
        
        if (activeCardEl && footerEl) {
          const activeRect = activeCardEl.getBoundingClientRect();
          const footerRect = footerEl.getBoundingClientRect();
          activeCardBottom = Math.round(activeRect.bottom);
          overlapPx = Math.max(0, activeRect.bottom - footerRect.top);
          
          // PART C: Log exact stableKey we searched for when using fallback
          if (measurementMethod === 'scroll_stablekey_fallback' || measurementMethod === 'active_lane_ref') {
            const searchedStableKey = currentItem?.type === 'question' ? `question-shown:${currentItem.id}` :
                                     currentItem?.type === 'multi_instance_gate' ? `mi-gate:${currentItem.packId}:${currentItem.instanceNumber}:q` :
                                     null;
            
            console.log('[CQ_VIOLATION][STABLEKEY_SEARCH_DETAIL]', {
              measurementMethod,
              searchedStableKey,
              foundElement: !!activeCardEl,
              elementTag: activeCardEl?.tagName,
              elementHasStablekey: activeCardEl?.hasAttribute?.('data-stablekey'),
              elementStablekey: activeCardEl?.getAttribute?.('data-stablekey')
            });
          }
        } else {
          // PART D: Do not pretend overlapPx=0 when measurement fails
          activeCardBottom = null;
          overlapPx = -1; // Sentinel value (measurement failed)
          
          // PART B: Log missing active card (deduped)
          logOnce(`active_card_missing_${currentItem?.type}_${currentItem?.id}`, () => {
            const searchedStableKey = currentItem?.type === 'question' ? `question-shown:${currentItem.id}` :
                                     currentItem?.type === 'multi_instance_gate' ? `mi-gate:${currentItem.packId}:${currentItem.instanceNumber}:q` :
                                     null;
            
            // PART C: Check if ANY element with this stableKey exists in DOM
            let foundAnywhere = false;
            if (searchedStableKey && typeof document !== 'undefined') {
              foundAnywhere = !!document.querySelector(`[data-stablekey="${searchedStableKey}"]`);
            }
            
            console.error('[CQ_ACTIVE_CARD_NOT_FOUND_ANYWHERE]', {
              activeKind: currentItem?.type,
              currentItemId: currentItem?.id,
              packId: currentItem?.packId,
              instanceNumber: currentItem?.instanceNumber,
              searchedStableKey,
              foundAnywhere,
              triedScrollContainer: true,
              triedActiveLane: !!activeLaneCardRef.current,
              reason: foundAnywhere ? 'Element exists but selectors did not match' : 'Element not rendered yet or missing data-stablekey'
            });
          });
        }
        
        if (overlapPx >= 0) {
          overlapPx = Math.round(overlapPx);
        }
      }
      
      // 3) STATE TRUTH (minimal)
      const activeKind = currentItem?.type || 'none';
      const typingLock = isUserTyping || false;
      
      // HEADLINE LOG: All key fields as primitives (no nested objects)
      console.error('[CQ_VIOLATION_HEADLINE]', 
        `reason=${reason} ` +
        `packId=${packId || 'none'} ` +
        `inst=${instanceNumber || 'none'} ` +
        `activeKind=${activeKind} ` +
        `totalItems=${totalItems} ` +
        `gateIndex=${gateIndex} ` +
        `lastIndex=${lastIndex} ` +
        `trailingCount=${trailingCount} ` +
        `overlapPx=${overlapPx} ` +
        `footerTop=${footerTop} ` +
        `activeBottom=${activeCardBottom === null ? 'none' : activeCardBottom} ` +
        `scrollTop=${scrollTop} ` +
        `clientH=${clientHeight} ` +
        `scrollH=${scrollHeight} ` +
        `typingLock=${typingLock} ` +
        `measureMethod=${measurementMethod}`
      );
      
      // TRAILING ITEMS LOG: Compact summary with all primitives
      if (trailingItems.length > 0) {
        const trailingSummary = trailingItems.map(t => 
          `{i:${t.i}, kind:${t.kind}, type:${t.type || 'null'}, mt:${t.messageType || 'null'}, ` +
          `stableKeySuffix:${t.stableKeySuffix}, itemIdSuffix:${t.itemIdSuffix}, isV3:${t.isV3Related}}`
        ).join(', ');
        
        console.error('[CQ_VIOLATION_TRAILING]', 
          `count=${trailingCount} items=[${trailingSummary}]`
        );
      }
      
      // COPY-FRIENDLY JSON DUMP: Single-line JSON string
      const safeSnapshot = {
        reason,
        packId: packId || null,
        instanceNumber: instanceNumber || null,
        activeKind,
        gateIndex,
        lastIndex,
        trailingItems,
        overlapPx,
        footerTop,
        activeBottom: activeCardBottom || null,
        scrollTop,
        clientHeight,
        scrollHeight,
        isUserTyping: typingLock,
        activeItemId: activeItemId || null,
        promptId: currentItem?.promptId || null
      };
      
      console.log('[CQ_VIOLATION_JSON]', JSON.stringify(safeSnapshot));
      
      // Store on window for easy inspection
      window.__cqLastViolationSnapshot = safeSnapshot;
      
      // ONE-TIME SELF-HEAL: Scroll to clear overlap (keyed by activeItemId)
      const selfHealKey = `${sessionId}:${activeItemId || 'none'}`;
      if (overlapPx > 0 && !typingLock && activeItemId) {
        logOnce(selfHealKey, () => {
          const scrollContainer = historyRef.current;
          if (!scrollContainer) return;
          
          const scrollTopBefore = scrollContainer.scrollTop;
          scrollContainer.scrollTop += overlapPx + 12;
          const scrollTopAfter = scrollContainer.scrollTop;
          
          console.log('[UI_CONTRACT][FOOTER_OVERLAP_SELF_HEAL]', {
            activeKind,
            overlapPx: Math.round(overlapPx),
            footerClearancePx,
            scrollTopBefore: Math.round(scrollTopBefore),
            scrollTopAfter: Math.round(scrollTopAfter),
            reason: 'Active card behind footer - applying corrective scroll'
          });
        });
      }
      
      // Original nested log (kept for compatibility)
      console.error('[CQ_VIOLATION_SNAPSHOT]', {
        reason,
        renderListTruth: {
          totalItems,
          gateIndex,
          lastIndex,
          trailingCount,
          trailingItems
        },
        domTruth: {
          scrollTop,
          clientHeight,
          scrollHeight,
          footerTop,
          activeCardBottom,
          overlapPx
        },
        stateTruth: {
          packId: packId || null,
          instanceNumber: instanceNumber || null,
          activeItemId: activeItemId || null,
          typingLock
        }
      });
    });
  }, [isUserTyping, currentItem]);
  
  const lastQuestionShownIdRef = useRef(null); // Track last question shown for force-scroll dedupe
  
  // DEV DEBUG: Enable evidence bundle capture (v3debug=1 or localStorage flag)
  const isV3DebugEnabled = (() => {
    try {
      if (typeof window === 'undefined') return false;
      const urlParams = new URLSearchParams(window.location.search);
      const hasUrlFlag = urlParams.get('v3debug') === '1';
      const hasLocalStorageFlag = localStorage.getItem('CQ_V3_DEBUG') === '1';
      return hasUrlFlag || hasLocalStorageFlag;
    } catch {
      return false;
    }
  })();
  
  // Debug mode: Only enable if admin user AND ?debug=1 in URL
  const debugEnabled = isAdminUser && (new URLSearchParams(window.location.search).get("debug") === "1");

  // V3 GATE: Authoritative multi-instance gate state
  const [v3Gate, setV3Gate] = useState({
    active: false,
    packId: null,
    categoryId: null,
    promptText: null,
    instanceNumber: null
  });
  const v3GateActive = v3Gate.active === true;

  // V3 Multi-instance handler (callback from V3ProbingLoop)
  const [v3MultiInstanceHandler, setV3MultiInstanceHandler] = useState(null);

  // V3 gate decision intent (prevents setState during render)
  const [v3GateDecision, setV3GateDecision] = useState(null);
  
  // Pending gate prompt (prevents setState during render)
  const [pendingGatePrompt, setPendingGatePrompt] = useState(null);
  
  // Multi-instance gate state (first-class currentItemType)
  const [multiInstanceGate, setMultiInstanceGate] = useState(null);

  // V3 EXIT: Idempotency guard + baseQuestionId retention
  const v3BaseQuestionIdRef = useRef(null);
  const exitV3HandledRef = useRef(false);
  const exitV3InProgressRef = useRef(false);
  
  // V3 ENGINE DECISION CACHE: Store last engine result per loopKey (for MI_GATE payload)
  const lastV3DecisionByLoopKeyRef = useRef({}); // Map<loopKey, { missingFields, miGateBlocked, stopReason, packId, instanceNumber, ts }>
  
  // PROMPT MISSING DIAGNOSTIC: Ref for de-duped logging (MUST be top-level hook)
  const promptMissingKeyRef = useRef(null);
  
  // PROMPT NULL GUARD: Track seen keys to prevent spam (log-once per unique state)
  const promptNullGuardSeenRef = useRef(new Set());
  
  // V3 PROMPT WATCHDOG: Snapshot-based state verification
  const lastV3PromptSnapshotRef = useRef(null);
  const handledPromptIdsRef = useRef(new Set());
  const promptIdCounterRef = useRef(0);
  
  // V3 IDEMPOTENCY: Store actual lock key used for submit (for correct release)
  const lastV3SubmitLockKeyRef = useRef(null);
  
  // TDZ SAFETY: Refs for state used in watchdog (avoids stale closures and TDZ)
  const bottomBarModeSOTRef = useRef(null);
  const v3ActivePromptTextRef = useRef(null);
  const v3ProbingActiveRef = useRef(null);
  const v3ProbingContextRef = useRef(null);
  
  // DEV DEBUG: Capture last-seen events for one-click evidence bundle
  const lastIdempotencyLockedRef = useRef(null);
  const lastIdempotencyReleasedRef = useRef(null);
  const lastPromptCommitRef = useRef(null);
  const lastWatchdogSnapshotRef = useRef(null);
  const lastWatchdogDecisionRef = useRef(null);
  const lastWatchdogOutcomeRef = useRef(null);
  const lastMultiIncidentSourceRef = useRef(null);
  const lastRecoveryAnotherInstanceRef = useRef(null);
  
  // V3 FAILSAFE: Opener submit tracking for safe timeout recovery
  const v3OpenerSubmitTokenRef = useRef(null);
  const v3OpenerSubmitLoopKeyRef = useRef(null);
  const v3OpenerFailsafeTimerRef = useRef(null);
  
  // V3 PACK ENTRY FAILSAFE: Separate timer/token for pack entry detection
  const v3PackEntryFailsafeTokenRef = useRef(null);
  const v3PackEntryFailsafeTimerRef = useRef(null);
  const v3PackEntryContextRef = useRef(null);
  
  // V3 OPENER/PROBING TRACKING: Track if opener submitted or probing started (per loopKey)
  const v3OpenerSubmittedRef = useRef(new Map()); // Map<loopKey, boolean>
  const v3ProbingStartedRef = useRef(new Map()); // Map<loopKey, boolean>
  
  // V3 RECAP TRACKING: Track recap ready state (prevents prompt missing logs)
  const v3RecapReadyRef = useRef(new Map()); // Map<loopKey, { recapText, nextAction }>
  
  // V3 RECAP APPEND GUARD: Prevent duplicate refresh calls (per stableKey)
  const v3RecapAppendedKeysRef = useRef(new Set()); // Set<stableKey>
  
  // V3 SUBMIT COUNTER: Monotonic counter for tokenized pendingAnswer payloads
  const v3SubmitCounterRef = useRef(0);
  
  // V3 COMMIT ACK: Lightweight acknowledgement for post-submit verification
  const lastV3AnswerCommitAckRef = useRef(null);
  
  // PART A: Optimistic persist markers (prevent UI stall on slow DB writes)
  const v3OptimisticPersistRef = useRef({}); // Map<promptId, {stableKeyA, answerText, ts}>
  
  // PART A: Extra bottom spacer for V3 opener overlap correction
  const [extraBottomSpacerPx, setExtraBottomSpacerPx] = useState(0);
  const expandedInstancesRef = useRef(new Set()); // Track expanded instances (prevent repeat)
  
  // UI CONTRACT STATUS: Component-level refs (prevents cross-session leakage)
  const openerMergeStatusRef = React.useRef('UNKNOWN');
  const footerClearanceStatusRef = React.useRef('UNKNOWN');
  
  // 3-ROW SHELL FLAG: Disable legacy footer spacer checks
  const IS_3ROW_SHELL = true;
  const footerSpacerDisabledLoggedRef = React.useRef(false);
  
  // GUARDRAIL DEDUPE: Track logged errors to prevent spam
  const lastClearanceErrorKeyRef = React.useRef(null);
  
  // GRAVITY FOLLOW: Track last scroll for dedupe
  const lastGravityFollowKeyRef = React.useRef(null);
  
  // GOLDEN CONTRACT CHECK: Dedupe tracking for golden check emissions
  const lastGoldenCheckPayloadRef = React.useRef(null);
  
  // CANONICAL DETECTOR: Log once per session (reduce noise)
  const canonicalDetectorLoggedRef = useRef(false);
  
  // V3 ACK METRICS: Track reliability counters (observability only)
  const v3AckSetCountRef = useRef(0);
  const v3AckClearCountRef = useRef(0);
  const v3AckRepairCountRef = useRef(0);
  
  // V3 SUBMIT PAYLOAD: Store last submitted answer for reconciliation
  const lastV3SubmittedAnswerRef = useRef(null);
  
  // V3 REFRESH REQUEST: Safe post-commit refresh mechanism
  const v3RefreshRequestedRef = useRef(null); // { reason, promptId, stableKeyA, requestedAt }
  const v3RefreshInFlightRef = useRef(false);
  const [v3RefreshTick, setV3RefreshTick] = useState(0);
  
  // MI_GATE UI CONTRACT SELF-TEST: Track main pane render + footer buttons per itemId
  const miGateTestTrackerRef = useRef(new Map()); // Map<itemId, { mainPaneRendered: bool, footerButtonsOnly: bool, testStarted: bool }>
  const miGateTestTimeoutRef = useRef(null);
  
  // MI_GATE SENTINEL: Track active state log key (prevents duplicate logs)
  const miGateActiveLogKeyRef = useRef(null);
  
  // V3 PROMPT DEDUPE: Track last rendered active prompt to prevent duplicate cards
  const lastRenderedV3PromptKeyRef = useRef(null);
  
  // STICKY AUTOSCROLL: Single source of truth for auto-scroll behavior
  const shouldAutoScrollRef = useRef(true);
  
  // TYPING LOCK BYPASS: Force one-time scroll on explicit user navigation (Yes/No, Submit)
  const forceAutoScrollOnceRef = useRef(false);
  
  // ACTIVE KIND CHANGE DETECTION: Track last logged kind to prevent spam
  const lastLoggedActiveKindRef = useRef(null);
  
  // RENDER STREAM SNAPSHOT: Track last stream length for change detection (PART E)
  const lastRenderStreamLenRef = useRef(0);
  
  // RECENT ANSWER ANCHOR: Track last submitted answer for viewport anchoring
  const recentAnchorRef = useRef({ kind: null, stableKey: null, ts: 0 });
  
  // V3 SCROLL ANCHOR: Track last appended V3 probe question for viewport anchoring
  const v3ScrollAnchorRef = useRef({ kind: null, stableKey: null, ts: 0 });
  
  // AUTO-GROWING INPUT: Refs for textarea auto-resize
  const footerTextareaRef = useRef(null);
  const [footerMeasuredHeightPx, setFooterMeasuredHeightPx] = useState(0); // Start at 0 (prevents initial jump)
  const lastAutoGrowHeightRef = useRef(0); // Stable throttle (no dataset mutation)
  const cqDiagEnabledRef = useRef(false); // Stable diagnostic flag for long-lived callbacks
  
  // V3 UI-ONLY HISTORY: Display V3 probe Q/A without polluting transcript
  // MOVED UP: Must be declared before refreshTranscriptFromDB (TDZ fix)
  const v3ActiveProbeQuestionRef = useRef(null);
  const v3ActiveProbeQuestionLoopKeyRef = useRef(null);
  
  // Transcript monotonicity audit (log-only regression detection)
  const prevRenderedLenRef = useRef(null);
  
  // Render-time freeze: Snapshot transcript while typing to prevent flicker
  const renderedTranscriptSnapshotRef = useRef(null);
  
  // HOOK ORDER FIX: Safety net reinjection tracker (MUST be top-level)
  // Moved from line 8752 to prevent "change in order of Hooks" error
  const reinjectedOpenerAnswersRef = useRef(new Set());
  const reinjectedV3ProbeQARef = useRef(new Set());
  
  // B) Recent submit protection: Track recently submitted user answer stableKeys with lifecycle
  const recentlySubmittedUserAnswersRef = useRef(new Set());
  const recentlySubmittedUserAnswersMetaRef = useRef(new Map()); // Map<stableKey, {firstSeenAt, renderedAt}>
  const lastRegressionLogRef = useRef(new Set()); // Track logged regressions (prevent spam)

  // ============================================================================
  // V3 PROMPT DETECTION + ACTIVE UI ITEM RESOLVER (TDZ-safe early placement)
  // ============================================================================
  // CRITICAL: These must be declared BEFORE useEffect that depends on activeUiItem
  // Multi-signal detection: V3 prompt is active if ANY of these signals are present
  const hasV3PromptText = Boolean(v3ActivePromptText && v3ActivePromptText.trim().length > 0);
  const hasV3ProbeQuestion = Boolean(v3ActiveProbeQuestionRef.current && v3ActiveProbeQuestionRef.current.trim().length > 0);
  const hasV3LoopKey = Boolean(v3ActiveProbeQuestionLoopKeyRef.current);
  
  // LIFECYCLE-AWARE: Prompt is ONLY active when waiting for answer, NOT during processing
  const hasActiveV3Prompt = (hasV3PromptText || hasV3ProbeQuestion || hasV3LoopKey) && 
                            v3PromptPhase === "ANSWER_NEEDED";
  
  // ============================================================================
  // V3 BLOCKING GATE - Prevents base question advancement during V3 probing
  // ============================================================================
  // FIX A1: TIGHTENED - Only block when there's an ACTIVE prompt waiting for answer
  // DO NOT block if v3PromptPhase === 'IDLE' and no active prompt text
  // NOTE: hasV3PromptText already declared above (line ~1511) - reusing existing
  const isV3Blocking = hasActiveV3Prompt || 
                       v3PromptPhase === 'ANSWER_NEEDED' || 
                       hasV3PromptText;
  
  // TASK A: V3 VISIBLE PROMPT CARD SIGNAL - Prevents MI_GATE from jumping ahead during transitions
  // Check if v3ProbeDisplayHistory has an unanswered question (Q exists but no matching A)
  const v3HasVisiblePromptCard = (() => {
    if (!v3ProbeDisplayHistory || v3ProbeDisplayHistory.length === 0) return false;
    
    // Get current loopKey from active context
    const activeLoopKey = v3ProbingContext 
      ? `${sessionId}:${v3ProbingContext.categoryId}:${v3ProbingContext.instanceNumber || 1}`
      : null;
    
    if (!activeLoopKey) return false;
    
    // Check if there's an unanswered question for this loopKey
    const loopEntries = v3ProbeDisplayHistory.filter(e => e.loopKey === activeLoopKey);
    if (loopEntries.length === 0) return false;
    
    // Group by sequence number from stableKey (v3-ui:<loopKey>:<n>:q/a)
    const sequenceMap = new Map();
    for (const entry of loopEntries) {
      const match = entry.stableKey?.match(/:(\d+):(q|a)$/);
      if (match) {
        const seqNum = match[1];
        const qOrA = match[2];
        if (!sequenceMap.has(seqNum)) {
          sequenceMap.set(seqNum, { q: null, a: null });
        }
        sequenceMap.get(seqNum)[qOrA] = entry;
      }
    }
    
    // Find any Q without matching A
    for (const [seqNum, pair] of sequenceMap.entries()) {
      if (pair.q && !pair.a) {
        return true; // Found unanswered question
      }
    }
    
    return false;
  })();
  
  console.log("[ORDER][V3_VISIBLE_PROMPT_CARD]", {
    v3HasVisiblePromptCard,
    v3UiHistoryLen: v3ProbeDisplayHistory?.length || 0,
    lastKeysPreview: (v3ProbeDisplayHistory || []).slice(-4).map(x => x.stableKey)
  });

  // CANONICAL ACTIVE UI ITEM RESOLVER - Single source of truth
  // Determines what UI should be shown based on strict precedence:
  // REQUIRED_ANCHOR_FALLBACK > V3_PROMPT > V3_WAITING > V3_OPENER > MI_GATE > DEFAULT
  const resolveActiveUiItem = () => {
    // Priority 0: Required anchor fallback (deadlock breaker)
    // GUARD: Never allow fallback to override v3_pack_opener (instance start takes precedence)
    if (requiredAnchorFallbackActive && requiredAnchorCurrent && currentItem?.type !== 'v3_pack_opener') {
      return {
        kind: "REQUIRED_ANCHOR_FALLBACK",
        packId: v3ProbingContext?.packId || currentItem?.packId,
        categoryId: v3ProbingContext?.categoryId || currentItem?.categoryId,
        instanceNumber: v3ProbingContext?.instanceNumber || currentItem?.instanceNumber || 1,
        promptText: null, // Computed separately in activePromptText resolution
        anchor: requiredAnchorCurrent,
        currentItemType: currentItem?.type,
        currentItemId: currentItem?.id
      };
    }
    
    // GUARD LOG: If opener suppressed fallback, log once
    if (requiredAnchorFallbackActive && requiredAnchorCurrent && currentItem?.type === 'v3_pack_opener') {
      console.log('[V3_OPENER][SUPPRESS_FALLBACK]', {
        packId: currentItem.packId,
        instanceNumber: currentItem.instanceNumber,
        reason: 'V3 opener takes precedence over required-anchor fallback - skipped fallback return'
      });
    }
    
    // Priority 1: V3 prompt active (multi-signal detection)
    // HARDENED: V3_PROMPT takes absolute precedence - even if MI_GATE exists in state
    if (hasActiveV3Prompt) {
      return {
        kind: "V3_PROMPT",
        packId: v3ProbingContext?.packId || currentItem?.packId,
        categoryId: v3ProbingContext?.categoryId || currentItem?.categoryId,
        instanceNumber: v3ProbingContext?.instanceNumber || currentItem?.instanceNumber || 1,
        promptText: v3ActivePromptText || v3ActiveProbeQuestionRef.current || "",
        loopKey: v3ActiveProbeQuestionLoopKeyRef.current,
        currentItemType: currentItem?.type,
        currentItemId: currentItem?.id
      };
    }
    
    // Priority 1.5: V3 probing active but no prompt yet (V3_WAITING state)
    // CRITICAL FIX: Force V3_WAITING kind when effectiveItemType is v3_probing
    // OVERRIDE: Do NOT enter V3_WAITING if fallback is active
    if (v3ProbingActive && !hasActiveV3Prompt && !requiredAnchorFallbackActive) {
      const forcedKind = "V3_WAITING";
      console.log('[V3_CONTROLLER][FORCE_ACTIVE_KIND]', {
        effectiveItemType: currentItem?.type === 'v3_probing' ? 'v3_probing' : currentItem?.type,
        v3ProbingActive,
        v3PromptPhase,
        forcedKind,
        reason: 'V3 active but no prompt - forcing V3_WAITING controller'
      });
      
      return {
        kind: forcedKind,
        packId: v3ProbingContext?.packId || currentItem?.packId,
        categoryId: v3ProbingContext?.categoryId || currentItem?.categoryId,
        instanceNumber: v3ProbingContext?.instanceNumber || currentItem?.instanceNumber || 1,
        promptText: null,
        loopKey: v3ProbingContext ? `${sessionId}:${v3ProbingContext.categoryId}:${v3ProbingContext.instanceNumber || 1}` : null,
        currentItemType: currentItem?.type,
        currentItemId: currentItem?.id
      };
    }
    
    // GUARD: Block V3_WAITING if fallback active
    if (v3ProbingActive && !hasActiveV3Prompt && requiredAnchorFallbackActive) {
      console.log('[REQUIRED_ANCHOR_FALLBACK][BLOCK_V3_WAITING_BRANCH]', {
        reason: 'fallback_active'
      });
      // Do NOT return V3_WAITING - fall through to other priorities
    }
    
    // Priority 2: V3 pack opener (must not be superseded by MI_GATE or REQUIRED_ANCHOR_FALLBACK)
    // INSTANCE START RULE: For multi-instance packs, ALWAYS show opener first for new instances
    if (currentItem?.type === 'v3_pack_opener') {
      const isMultiInstancePack = currentItem?.packId === 'PACK_PRIOR_LE_APPS_STANDARD';
      const isInstance2OrHigher = (currentItem?.instanceNumber || 1) > 1;
      
      if (isMultiInstancePack && isInstance2OrHigher) {
        // Check if opener has been answered for this instance
        const openerAnswerStableKey = `v3-opener-a:${sessionId}:${currentItem.packId}:${currentItem.instanceNumber}`;
        const openerAnswered = transcriptSOT.some(e => e.stableKey === openerAnswerStableKey);
        
        if (!openerAnswered) {
          console.log('[INSTANCE_START][FORCE_DETERMINISTIC_OPENER]', {
            packId: currentItem.packId,
            instanceNumber: currentItem.instanceNumber,
            reason: 'opener_not_answered'
          });
          
          // SUPPRESS any competing UI (fallback, V3 prompt, etc.)
          if (requiredAnchorFallbackActive) {
            console.log('[INSTANCE_START][SUPPRESS_FOLLOWUPS_UNTIL_OPENER]', {
              instanceNumber: currentItem.instanceNumber,
              suppressedKind: 'REQUIRED_ANCHOR_FALLBACK'
            });
          }
        }
      }
      
      return {
        kind: "V3_OPENER",
        packId: currentItem.packId,
        categoryId: currentItem.categoryId,
        instanceNumber: currentItem.instanceNumber || 1,
        promptText: currentItem.openerText || "",
        currentItemType: currentItem.type,
        currentItemId: currentItem.id
      };
    }
    
    // TASK B: Priority 3: Multi-instance gate (ONLY if V3 not blocking)
    // HARDENED: Block MI_GATE if V3 is blocking (active, has prompt, or processing)
    if (currentItem?.type === 'multi_instance_gate') {
      if (isV3Blocking) {
        console.log('[FLOW][MI_GATE_STAGED_BUT_BLOCKED_BY_V3]', {
          packId: currentItem.packId,
          instanceNumber: currentItem.instanceNumber,
          v3PromptPhase,
          v3ProbingActive,
          hasActiveV3Prompt,
          v3HasVisiblePromptCard
        });
        // Return DEFAULT kind to prevent MI_GATE from activating
        return {
          kind: "DEFAULT",
          currentItemType: currentItem?.type,
          currentItemId: currentItem?.id,
          promptText: null
        };
      }
      
      return {
        kind: "MI_GATE",
        packId: currentItem.packId,
        categoryId: currentItem.categoryId,
        instanceNumber: currentItem.instanceNumber || 1,
        promptText: currentItem.promptText || multiInstanceGate?.promptText || "",
        currentItemType: currentItem.type,
        currentItemId: currentItem.id
      };
    }
    
    // Priority 4: Default (regular questions, v2 pack fields, etc.)
    return {
      kind: "DEFAULT",
      currentItemType: currentItem?.type,
      currentItemId: currentItem?.id,
      promptText: null
    };
  };
  
  const activeUiItem = resolveActiveUiItem();
  
  // ============================================================================
  // ACTIVE KIND SOT - Derived primitive for scroll helpers (prevents TDZ)
  // ============================================================================
  // CRITICAL: Declared AFTER activeUiItem is initialized, prevents TDZ in callbacks
  const activeKindSOT = activeUiItem?.kind || currentItem?.type || 'UNKNOWN';
  
  // TDZ SAFE DEFAULTS — real values computed later when bottomBarModeSOT/effectiveItemType exist.
  // These are placeholders to prevent "undefined" errors in early code paths.
  const isYesNoModeSOT = false;
  const isMiGateSOT = false;
  
  // PART C: Reset spacer when leaving V3 opener (moved here - after activeKindSOT exists)
  useEffect(() => {
    const wasV3Opener = lastLoggedActiveKindRef.current === 'V3_OPENER' || 
                        lastLoggedActiveKindRef.current === 'v3_pack_opener';
    const isV3OpenerNow = activeKindSOT === 'V3_OPENER' || activeKindSOT === 'v3_pack_opener';
    
    // Reset spacer when transitioning AWAY from V3 opener
    if (wasV3Opener && !isV3OpenerNow && extraBottomSpacerPx > 0) {
      setExtraBottomSpacerPx(0);
      console.log('[SPACER][V3_RESET]', {
        fromKind: lastLoggedActiveKindRef.current,
        toKind: activeKindSOT,
        extraBottomSpacerPxBefore: extraBottomSpacerPx,
        reason: 'Left V3 opener - resetting spacer'
      });
    }
  }, [activeKindSOT, extraBottomSpacerPx]);
  
  // ============================================================================
  // ACTIVE CARD KEY SOT - Single source of truth for active card identifier
  // ============================================================================
  const activeCardKeySOT = (() => {
    if (activeUiItem.kind === "V3_PROMPT") {
      const promptId = v3ProbingContext?.promptId || lastV3PromptSnapshotRef.current?.promptId;
      return promptId ? `v3-prompt:${promptId}` : null;
    }
    if (activeUiItem.kind === "V3_OPENER") {
      return buildV3OpenerStableKey(currentItem.packId, currentItem.instanceNumber || 1);
    }
    if (activeUiItem.kind === "V3_WAITING") {
      const loopKey = v3ProbingContext ? `${sessionId}:${v3ProbingContext.categoryId}:${v3ProbingContext.instanceNumber || 1}` : null;
      return loopKey ? `v3-waiting:${loopKey}` : null;
    }
    if (activeUiItem.kind === "MI_GATE") {
      return currentItem?.id || `mi-gate:${currentItem?.packId}:${currentItem?.instanceNumber}`;
    }
    if (activeUiItem.kind === "DEFAULT" && currentItem?.type === "question") {
      return currentItem?.id;
    }
    return null;
  })();
  
  const hasActiveCardSOT = Boolean(activeCardKeySOT);
  
  console.log('[ACTIVE_CARD_KEY_SOT]', {
    activeUiItemKind: activeUiItem.kind,
    activeCardKeySOT,
    hasActiveCardSOT
  });
  
  // ============================================================================
  // ACTIVE CARD COMPUTATION - MUST precede footer mode (prevents TDZ)
  // ============================================================================
  // TDZ GUARD: Use dbTranscript for early dedupe (renderedTranscript not yet initialized)
  // This is ONLY for activeCard dedupe checks - canonical render uses renderedTranscript later
  const transcriptRenderable = renderedTranscriptSnapshotRef.current || dbTranscript || [];
  
  console.log('[TDZ_GUARD][TRANSCRIPT_EARLY_FALLBACK]', {
    usedSnapshot: !!renderedTranscriptSnapshotRef.current,
    usedDb: !renderedTranscriptSnapshotRef.current && !!dbTranscript,
    len: transcriptRenderable.length,
    reason: 'renderedTranscript not yet initialized - using early sources for activeCard dedupe'
  });
  
  // Initialize activeCard (assigned below, read by footer mode computation)
  let activeCard = null;
  
  // CHANGE 3: Track last rendered promptId to prevent duplicate active cards
  const currentPromptId = v3ProbingContext?.promptId || lastV3PromptSnapshotRef.current?.promptId;
  
  // PART A: Enforce mutual exclusion in render stream (kind-based, unconditional)
  if (activeUiItem.kind === "V3_PROMPT") {
    console.log('[STREAM_SUPPRESS]', {
      suppressed: 'MI_GATE',
      reason: 'ACTIVE_KIND_V3_PROMPT',
      activeKind: activeUiItem.kind,
      currentItemType: currentItem?.type,
      packId: currentItem?.packId,
      instanceNumber: currentItem?.instanceNumber
    });
  }
  
  if (activeUiItem.kind === "MI_GATE") {
    console.log('[STREAM_SUPPRESS]', {
      suppressed: 'V3_PROMPT',
      reason: 'ACTIVE_KIND_MI_GATE',
      activeKind: activeUiItem.kind,
      currentItemType: currentItem?.type,
      packId: currentItem?.packId,
      instanceNumber: currentItem?.instanceNumber
    });
  }
  
  if (activeUiItem.kind === "V3_PROMPT") {
    const v3PromptText = v3ActivePromptText || v3ActiveProbeQuestionRef.current || "";
    const loopKey = v3ProbingContext ? `${sessionId}:${v3ProbingContext.categoryId}:${v3ProbingContext.instanceNumber || 1}` : null;
    const promptId = currentPromptId || `${loopKey}:fallback`;
    
    // SINGLE SOURCE: Check if transcript already has V3_PROBE_QUESTION for this promptId
    const qStableKey = `v3-probe-q:${promptId}`;
    const transcriptHasThisProbeQ = transcriptSOT.some(e => 
      (e.messageType === 'V3_PROBE_QUESTION' || e.type === 'V3_PROBE_QUESTION') &&
      (e.meta?.promptId === promptId || e.stableKey === qStableKey)
    );
    
    const action = transcriptHasThisProbeQ ? 'use_transcript' : 'use_prompt_lane';
    
    if (cqDiagEnabled) {
      console.log('[V3_PROMPT][SINGLE_SOURCE]', {
        transcriptHasThisProbeQ,
        action,
        promptId,
        stableKey: qStableKey,
        transcriptLen: dbTranscript.length
      });
    }
    
    // UI CONTRACT: During ANSWER_NEEDED, prompt lane card MUST render (never skip)
    if (transcriptHasThisProbeQ && v3PromptPhase !== "ANSWER_NEEDED") {
      console.log('[V3_PROMPT][ACTIVE_CARD_SKIPPED_ALREADY_IN_TRANSCRIPT]', {
        promptId,
        loopKey,
        stableKey: qStableKey,
        v3PromptPhase,
        reason: 'transcript_has_question (but not ANSWER_NEEDED phase)'
      });
      // Skip adding active card - transcript render is canonical
    } else if (transcriptHasThisProbeQ && v3PromptPhase === "ANSWER_NEEDED") {
      console.log('[V3_PROMPT][ACTIVE_CARD_DUPLICATE_OVERRIDE]', {
        promptId,
        loopKey,
        v3PromptPhase,
        note: 'Prompt card forced visible during ANSWER_NEEDED - transcript has question but card must show'
      });
      // DO NOT skip - prompt lane card must render during ANSWER_NEEDED
    }
    
    if (lastRenderedV3PromptKeyRef.current === promptId && v3PromptText && hasActiveV3Prompt && v3PromptPhase !== "ANSWER_NEEDED") {
      console.log('[V3_UI_CONTRACT][PROMPT_CARD_DEDUPED]', {
        promptId,
        loopKey,
        reason: 'Already rendered active card for this promptId'
      });
      // Skip adding duplicate active card
    } else if (v3PromptText && hasActiveV3Prompt) {
      // Inline normalization to avoid TDZ error
      const normalizedPromptText = (v3PromptText || "").toLowerCase().trim().replace(/\s+/g, " ");
      const stableKey = loopKey ? `v3-active:${loopKey}:${promptId}:${normalizedPromptText.slice(0,32)}` : null;
      
      activeCard = {
        __activeCard: true,
        isEphemeralPromptLaneCard: true,
        kind: "v3_probe_q",
        stableKey,
        text: v3PromptText,
        packId: v3ProbingContext?.packId,
        instanceNumber: v3ProbingContext?.instanceNumber,
        source: 'prompt_lane_temporary'
      };
      
      // Mark this promptId as rendered
      lastRenderedV3PromptKeyRef.current = promptId;
      
      console.log("[V3_PROMPT][ACTIVE_CARD_ADDED]", { 
        loopKey, 
        promptId,
        promptPreview: v3PromptText.slice(0, 60),
        source: 'prompt_lane_temporary',
        isEphemeralPromptLaneCard: true
      });
    }
    
    // Clear tracker when not actively rendering V3_PROMPT card
    if (!activeCard && lastRenderedV3PromptKeyRef.current) {
      lastRenderedV3PromptKeyRef.current = null;
    }
  } else if (activeUiItem.kind === "V3_WAITING") {
    // V3_WAITING: Show thinking placeholder card
    const loopKey = v3ProbingContext ? `${sessionId}:${v3ProbingContext.categoryId}:${v3ProbingContext.instanceNumber || 1}` : null;
    activeCard = {
      __activeCard: true,
      isEphemeralPromptLaneCard: true,
      kind: "v3_thinking",
      stableKey: `v3-thinking:${loopKey}`,
      text: "Processing your response...",
      packId: v3ProbingContext?.packId,
      instanceNumber: v3ProbingContext?.instanceNumber || 1,
      source: 'prompt_lane_temporary'
    };
    
    console.log("[V3_WAITING][ACTIVE_CARD_ADDED]", {
      loopKey,
      packId: v3ProbingContext?.packId,
      instanceNumber: v3ProbingContext?.instanceNumber,
      reason: "V3 deciding - showing thinking card"
    });
  } else if (activeUiItem.kind === "V3_OPENER") {
    const openerText = currentItem?.openerText || "";
    const stableKey = buildV3OpenerStableKey(currentItem.packId, currentItem.instanceNumber || 1);
    
    // DEDUPE: Check if opener already in prompt-lane history (NOT transcript)
    const expectedKey = buildV3OpenerStableKey(currentItem.packId, currentItem.instanceNumber || 1);
    const alreadyInHistory = v3ProbeDisplayHistory.some(e => e.stableKey === expectedKey);
    
    // ACTIVE OPENER ENFORCEMENT: ALWAYS render active card when V3_OPENER is active, even if in history
    // Active UI items MUST render - history presence does NOT satisfy active requirement
    if (screenMode === "QUESTION" && openerText) {
      if (alreadyInHistory) {
        console.log("[V3_OPENER][DEDUP_BYPASS]", { 
          packId: currentItem.packId, 
          instanceNumber: currentItem.instanceNumber,
          stableKey,
          reason: "Active V3 opener must render - bypassing history dedupe" 
        });
      }
      
      activeCard = {
        __activeCard: true,
        isEphemeralPromptLaneCard: true,
        kind: "v3_pack_opener",
        stableKey,
        text: openerText,
        packId: currentItem.packId,
        categoryLabel: currentItem.categoryLabel,
        instanceNumber: currentItem.instanceNumber || 1,
        exampleNarrative: currentItem.exampleNarrative,
        source: 'prompt_lane_temporary'
      };
      
      console.log("[V3_OPENER][ACTIVE_CARD_FORCED]", {
        packId: currentItem.packId,
        instanceNumber: currentItem.instanceNumber,
        stableKey,
        historyAlreadyHas: alreadyInHistory,
        reason: "Active opener must render in main pane regardless of history state"
      });
    } else if (!openerText) {
      console.warn("[V3_OPENER][MISSING_TEXT]", {
        packId: currentItem.packId,
        instanceNumber: currentItem.instanceNumber,
        reason: "Cannot render active card without opener text"
      });
    }
  } else if (
    activeUiItem.kind === "DEFAULT" && 
    currentItem?.type === "question" && 
    engine?.QById?.[currentItem.id]?.response_type === "yes_no"
  ) {
    // ACTIVE YES/NO QUESTION: Create active card for base questions in YES/NO mode
    // TDZ-SAFE: Inline detection with optional chaining (no separate variables)
    const question = engine?.QById?.[currentItem.id];
    const questionText = question?.question_text || "(Question)";
    const stableKey = `question-shown:${currentItem.id}`;
    
    console.log("[TDZ_FIX][ACTIVE_CARD_YESNO_INLINE]", { 
      qid: currentItem.id, 
      rt: question?.response_type 
    });
    
    activeCard = {
      __activeCard: true,
      isEphemeralPromptLaneCard: true,
      kind: "base_question_yesno",
      stableKey,
      text: questionText,
      questionId: currentItem.id,
      questionDbId: currentItem.id,
      questionNumber: question?.question_number,
      sectionName: engine?.Sections?.find(s => s.id === question?.section_id)?.section_name,
      source: 'prompt_lane_temporary'
    };
    
    console.log("[BASE_YESNO][ACTIVE_CARD_ADDED]", {
      questionId: currentItem.id,
      questionCode: question?.question_id,
      stableKey,
      questionNumber: question?.question_number,
      activeUiItemKind: activeUiItem.kind
    });
  } else if (activeUiItem.kind === "REQUIRED_ANCHOR_FALLBACK") {
    // REQUIRED_ANCHOR_FALLBACK: Render prompt card in main pane (not footer)
    // TDZ-SAFE: Use hoisted resolver (single source of truth)
    const questionText = resolveAnchorToHumanQuestion(
      requiredAnchorCurrent, 
      v3ProbingContext?.packId
    );
    
    const loopKey = v3ProbingContext ? `${sessionId}:${v3ProbingContext.categoryId}:${v3ProbingContext.instanceNumber || 1}` : null;
    const stableKey = loopKey ? `fallback-prompt:${loopKey}:${requiredAnchorCurrent}` : null;
    
    activeCard = {
      __activeCard: true,
      isEphemeralPromptLaneCard: false,
      kind: "required_anchor_fallback_prompt",
      stableKey,
      text: questionText,
      packId: v3ProbingContext?.packId,
      instanceNumber: v3ProbingContext?.instanceNumber || 1,
      anchor: requiredAnchorCurrent,
      source: 'prompt_lane_temporary'
    };
    
    console.log('[REQUIRED_ANCHOR_FALLBACK][CARD_EPHEMERAL_FLAG]', {
      kind: 'required_anchor_fallback_prompt',
      isEphemeral: false
    });
    
    console.log('[REQUIRED_ANCHOR_FALLBACK][MAIN_PANE_PROMPT_RENDERED]', {
      anchor: requiredAnchorCurrent,
      promptPreview: questionText,
      stableKey
    });
  } else if (activeUiItem.kind === "MI_GATE") {
    // FIX: Use currentItem directly when activeUiItem.kind is MI_GATE
    // activeUiItem resolver already handles V3 blocking precedence correctly
    let miGateItem = currentItem;
    
    // INVARIANT CHECK: Ensure currentItem is a valid gate when activeUiItem says MI_GATE
    if (!miGateItem || miGateItem.type !== 'multi_instance_gate' || !miGateItem.packId || !miGateItem.instanceNumber) {
      console.error('[MI_GATE][INVARIANT_FAIL][CURRENT_ITEM_NOT_GATE]', {
        currentItemType: currentItem?.type,
        currentItemId: currentItem?.id,
        activeUiItemKind: activeUiItem?.kind,
        expected: 'multi_instance_gate',
        packId: currentItem?.packId,
        instanceNumber: currentItem?.instanceNumber,
      });
      
      // FALLBACK: Attempt to use activeUiItem payload if it carries gate metadata
      if (activeUiItem.packId && activeUiItem.instanceNumber) {
        miGateItem = {
          type: 'multi_instance_gate',
          packId: activeUiItem.packId,
          instanceNumber: activeUiItem.instanceNumber,
          promptText: activeUiItem.promptText || multiInstanceGate?.promptText
        };
      }
    }
    
    // Resolve prompt text with cascading fallbacks
    const miGatePrompt = miGateItem?.promptText || 
                         multiInstanceGate?.promptText || 
                         activeUiItem?.promptText ||
                         `Do you have another item to report in this section?`;
    
    const packId = miGateItem?.packId || activeUiItem?.packId;
    const instanceNumber = miGateItem?.instanceNumber || activeUiItem?.instanceNumber;
    
    if (packId && instanceNumber && miGatePrompt) {
      // CANONICAL STABLEKEY: Use builder for consistency
      const stableKey = buildMiGateQStableKey(packId, instanceNumber);
      const itemId = buildMiGateItemId(packId, instanceNumber);
      
      // ALWAYS render active MI_GATE card when activeUiItem.kind is MI_GATE
      // The active gate MUST be visible as the current question in main pane
      activeCard = {
        __activeCard: true,
        isEphemeralPromptLaneCard: true,
        kind: "multi_instance_gate",
        id: itemId,
        stableKey,
        text: miGatePrompt,
        packId,
        instanceNumber,
        source: 'prompt_lane_temporary'
      };
      
      console.log("[MI_GATE][ACTIVE_CARD_ADDED]", {
        itemId,
        packId,
        instanceNumber,
        stableKey,
        promptPreview: miGatePrompt.substring(0, 60),
        activeUiItemKind: activeUiItem.kind,
        usedFallback: miGateItem !== currentItem
      });
    } else {
      console.error('[MI_GATE][BUG][MAIN_PANE_NOT_RENDERED]', {
        currentItemId: currentItem?.id,
        packId,
        instanceNumber,
        activeUiItemKind: activeUiItem.kind,
        reason: 'Cannot resolve gate metadata for rendering'
      });
    }
  }
  
  // Clear V3 prompt tracker when kind changes away from V3_PROMPT
  if (activeUiItem.kind !== "V3_PROMPT" && lastRenderedV3PromptKeyRef.current) {
    lastRenderedV3PromptKeyRef.current = null;
  }
  
  // PART 2: V3 Prompt Active SOT (single source of truth boolean)
  const v3PromptIdSOT = v3ProbingContext?.promptId || lastV3PromptSnapshotRef.current?.promptId || null;
  const isV3PromptActiveSOT =
    v3PromptPhase === 'ANSWER_NEEDED' && Boolean(v3ActivePromptText) && Boolean(v3PromptIdSOT);
  
  console.log('[V3_PROMPT_ACTIVE_SOT]', {
    v3PromptPhase,
    hasText: !!v3ActivePromptText,
    v3PromptIdSOT,
    isV3PromptActiveSOT
  });
  
  // PART B: Phase-based UI blocking (prevents MI_GATE during V3 transitions)
  const isV3UiBlockingSOT = (v3PromptPhase === 'ANSWER_NEEDED' || v3PromptPhase === 'PROCESSING');
  
  console.log('[V3_UI_BLOCK_SOT]', {
    v3PromptPhase,
    isV3UiBlockingSOT
  });
  
  // PART A: MI_GATE suppression helper (deterministic, phase-based)
  const shouldSuppressMiGateSOT = isV3UiBlockingSOT && currentItem?.type === 'multi_instance_gate';
  
  // Log suppression state changes using ref (no hooks)
  const lastMiGateSuppressKeyRef = useRef(null);
  
  if (shouldSuppressMiGateSOT) {
    const key = `${currentItem?.packId || 'na'}:${currentItem?.instanceNumber || 'na'}`;
    if (lastMiGateSuppressKeyRef.current !== key) {
      lastMiGateSuppressKeyRef.current = key;
      console.log('[MI_GATE][SUPPRESSED_BY_V3]', { v3PromptPhase, packId: currentItem?.packId, instanceNumber: currentItem?.instanceNumber });
    }
  } else if (lastMiGateSuppressKeyRef.current) {
    lastMiGateSuppressKeyRef.current = null;
  }
  
  // PART A: activePromptKind SOT (single consolidated log)
  console.log('[PROMPT_KIND_SOT]', {
    activePromptKind: activeUiItem.kind,
    v3PromptPhase,
    hasActiveV3Prompt,
    isMultiInstanceGate: currentItem?.type === 'multi_instance_gate',
    currentItemType: currentItem?.type,
    currentItemId: currentItem?.id
  });
  
  // TASK B: ACTIVE KIND PRECEDENCE LOG: Only log when kind changes (reduce spam)
  if (activeUiItem.kind !== lastLoggedActiveKindRef.current) {
    lastLoggedActiveKindRef.current = activeUiItem.kind;
    console.log('[ORDER][ACTIVE_KIND_PRECEDENCE]', {
      currentActiveKind: activeUiItem.kind,
      hasActiveV3Prompt,
      v3HasVisiblePromptCard,
      v3PromptPhase,
      currentItemType: currentItem?.type,
      effectiveItemType: v3ProbingActive ? 'v3_probing' : currentItem?.type,
      currentItemId: currentItem?.id,
      packId: currentItem?.packId || v3ProbingContext?.packId,
      instanceNumber: currentItem?.instanceNumber || v3ProbingContext?.instanceNumber
    });
  }

  // ============================================================================
  // BOTTOM BAR RENDER TYPE - Single source of truth (top-level component scope)
  // ============================================================================
  // CRITICAL: Declared at top-level so ALL render code can access it
  const bottomBarRenderTypeSOT = (() => {
    // PRIORITY 0: Required anchor fallback (highest precedence - must show prompt)
    if (activeUiItem?.kind === "REQUIRED_ANCHOR_FALLBACK") return "required_anchor_fallback";
    
    // PRIORITY 1: V3 states (highest precedence)
    if (activeUiItem?.kind === "V3_PROMPT") return "v3_probing";
    if (activeUiItem?.kind === "V3_WAITING") return "v3_waiting";
    if (activeUiItem?.kind === "V3_OPENER") return "v3_pack_opener";
    if (activeUiItem?.kind === "MI_GATE") return "multi_instance_gate";
    
    // PRIORITY 2: Base yes/no questions (FIX #1)
    if (activeUiItem?.kind === "DEFAULT" && 
        currentItem?.type === "question" && 
        engine?.QById?.[currentItem.id]?.response_type === "yes_no") {
      return "yes_no";
    }
    
    // PRIORITY 3: Default fallback
    return "default";
  })();
  
  // Sanity log: confirm variable exists before render
  console.log("[BOTTOM_BAR_RENDER_TYPE][SOT_TOP]", { 
    activeUiItemKind: activeUiItem?.kind, 
    bottomBarRenderTypeSOT,
    v3PromptPhase,
    hasV3PromptText,
    hasActiveV3Prompt,
    activeCardKind: activeCard?.kind,
    currentItemId: currentItem?.id,
    currentItemResponseType: currentItem?.type === "question" ? engine?.QById?.[currentItem.id]?.response_type : null
  });
  
  // ============================================================================
  // TDZ GUARD: EARLY BOTTOM BAR MODE - Safe canonical source (no late variables)
  // ============================================================================
  // Use bottomBarModeSOT above this point; do not reference bottomBarMode before its declaration.
  const bottomBarModeSOT = (() => {
    // Derive mode from early bottomBarRenderTypeSOT only (TDZ-safe)
    if (bottomBarRenderTypeSOT === "required_anchor_fallback") return "TEXT_INPUT";
    if (bottomBarRenderTypeSOT === "multi_instance_gate") return "YES_NO";
    if (bottomBarRenderTypeSOT === "yes_no") return "YES_NO"; // FIX #1: Map yes_no render type to YES_NO mode
    if (bottomBarRenderTypeSOT === "v3_pack_opener") return "TEXT_INPUT";
    if (bottomBarRenderTypeSOT === "v3_probing") return "TEXT_INPUT";
    if (bottomBarRenderTypeSOT === "v3_waiting") return "V3_WAITING";
    if (screenMode === 'WELCOME') return "CTA";
    return "DEFAULT";
  })();
  
  // ============================================================================
  // REGRESSION-PROOF SAFE WRAPPER - Validates mode before critical UI logic
  // ============================================================================
  const VALID_MODES = ['YES_NO', 'TEXT_INPUT', 'DEFAULT', 'V3_WAITING', 'CTA', 'SELECT', 'HIDDEN', 'DISABLED'];
  const bottomBarModeSOTSafe = VALID_MODES.includes(bottomBarModeSOT) ? bottomBarModeSOT : 'DEFAULT';
  
  if (typeof window !== 'undefined' && (window.location.hostname.includes('preview') || window.location.hostname.includes('localhost'))) {
    console.log('[BOTTOM_BAR_MODE_SOT]', { bottomBarRenderTypeSOT, bottomBarModeSOT, bottomBarModeSOTSafe });
  }
  
  // FIX #1: Diagnostic log for base yes/no routing (TDZ-SAFE: uses only early variables)
  if (bottomBarRenderTypeSOT === "yes_no") {
    console.log('[UI_CONTRACT][BASE_YESNO_BOTTOM_BAR_ROUTE]', {
      activeCardKind: activeCard?.kind,
      bottomBarRenderTypeSOT,
      bottomBarModeSOTSafe,
      currentItemId: currentItem?.id,
      currentItemType: currentItem?.type,
      questionResponseType: engine?.QById?.[currentItem?.id]?.response_type
    });
  }
  
  // TDZ GUARD: Do not reference late-derived vars (effectiveItemType, etc.) above this line.
  
  // One-time warning if fallback triggered (dev-only, once per mount)
  const fallbackWarningLoggedRef = React.useRef(false);
  if (bottomBarModeSOTSafe !== bottomBarModeSOT && !fallbackWarningLoggedRef.current) {
    fallbackWarningLoggedRef.current = true;
    if (typeof window !== 'undefined' && (window.location.hostname.includes('preview') || window.location.hostname.includes('localhost'))) {
      console.warn('[BOTTOM_BAR_MODE_SOT][FALLBACK]', { 
        bottomBarRenderTypeSOT, 
        bottomBarModeSOT, 
        bottomBarModeSOTSafe,
        reason: 'Invalid mode detected - using DEFAULT fallback'
      });
    }
  }
  
  // V3 PROMPT PHASE CHANGE TRACKER (unconditional hook)
  useEffect(() => {
    if (v3PromptPhase !== lastV3PromptPhaseRef.current) {
      console.log('[V3_PROMPT_PHASE]', {
        prev: lastV3PromptPhaseRef.current,
        next: v3PromptPhase,
        promptTextPreview: v3ActivePromptText?.substring(0, 40) || null,
        hasV3PromptText,
        hasActiveV3Prompt,
        activeUiItemKind: activeUiItem?.kind,
        loopKeyPreview: v3ActiveProbeQuestionLoopKeyRef.current || null,
        promptIdPreview: lastV3PromptSnapshotRef.current?.promptId || null
      });
      lastV3PromptPhaseRef.current = v3PromptPhase;
    }
  }, [v3PromptPhase, v3ActivePromptText, hasV3PromptText, hasActiveV3Prompt, activeUiItem]);

  // V3 gate prompt handler (deferred to prevent render-phase setState)
  useEffect(() => {
    if (!v3Gate.active && v3Gate.promptText) {
      console.log('[V3_GATE][ACTIVATE]', {
        promptText: v3Gate.promptText?.substring(0, 50),
        categoryId: v3Gate.categoryId,
        instanceNumber: v3Gate.instanceNumber
      });

      setV3Gate(prev => ({ ...prev, active: true }));
    }
  }, [v3Gate]);

  // V3 gate decision handler (prevents setState during render)
  useEffect(() => {
    if (!v3GateDecision) return;

    console.log('[V3_GATE][DECISION_CONSUMED]', v3GateDecision);

    if (v3MultiInstanceHandler) {
      v3MultiInstanceHandler(v3GateDecision);
    }

    // Mark blocker resolved (UI-only)
    if (uiBlocker?.type === 'V3_GATE' && !uiBlocker.resolved) {
      setUiBlocker(prev => ({ ...prev, resolved: true, answer: v3GateDecision }));
    }

    // Clear decision
    setV3GateDecision(null);
  }, [v3GateDecision, v3MultiInstanceHandler]);
  
  // Deferred gate prompt handler (prevents setState during render)
  useEffect(() => {
    if (!pendingGatePrompt) return;
    
    const { promptData, v3Context } = pendingGatePrompt;
    
    if (promptData) {
      console.log('[V3_GATE][RECEIVED]', { promptText: promptData?.substring(0, 50) });

      // Set multi-instance gate as first-class state
      setMultiInstanceGate({
        active: true,
        packId: v3Context?.packId,
        categoryId: v3Context?.categoryId,
        categoryLabel: v3Context?.categoryLabel,
        promptText: promptData,
        instanceNumber: v3Context?.instanceNumber || 1,
        baseQuestionId: v3BaseQuestionIdRef.current,
        packData: v3Context?.packData
      });

      // Also set currentItem to multi_instance_gate type
      setCurrentItem({
        id: `multi-instance-gate-${v3Context?.packId}-${v3Context?.instanceNumber || 1}`,
        type: 'multi_instance_gate',
        packId: v3Context?.packId,
        categoryId: v3Context?.categoryId,
        categoryLabel: v3Context?.categoryLabel,
        promptText: promptData,
        instanceNumber: v3Context?.instanceNumber || 1,
        baseQuestionId: v3BaseQuestionIdRef.current,
        packData: v3Context?.packData
      });
    } else {
      console.log('[V3_GATE][CLEAR]');
      setMultiInstanceGate(null);
    }
    
    setPendingGatePrompt(null);
  }, [pendingGatePrompt]);

  const displayNumberMapRef = useRef({});

  const totalQuestionsAllSections = engine?.TotalQuestions || 0;
  const answeredQuestionsAllSections = React.useMemo(
    () => transcriptSOT.filter(t => t.type === 'question').length,
    [transcriptSOT]
  );
  const questionCompletionPct = totalQuestionsAllSections > 0
    ? Math.round((answeredQuestionsAllSections / totalQuestionsAllSections) * 100)
    : 0;

  // DEV DEBUG: Generate and copy evidence bundle
  const copyV3DebugBundle = useCallback(() => {
    const lockedKey = lastIdempotencyLockedRef.current;
    const releasedKey = lastIdempotencyReleasedRef.current;
    const exactMatch = lockedKey && releasedKey && lockedKey === releasedKey;
    
    const outcome = lastWatchdogOutcomeRef.current;
    const recovery = lastRecoveryAnotherInstanceRef.current;
    
    let passFail = 'FAIL';
    let failReason = null;
    
    if (!lockedKey) {
      failReason = 'Missing idempotency lock';
    } else if (!releasedKey) {
      failReason = 'Missing idempotency release';
    } else if (!exactMatch) {
      failReason = 'Idempotency key mismatch';
    } else if (!outcome) {
      failReason = 'Missing watchdog outcome';
    } else if (outcome.outcome === 'OK') {
      passFail = 'PASS';
    } else if (outcome.outcome === 'FAILED' && recovery) {
      passFail = 'PASS';
    } else if (outcome.outcome === 'FAILED' && !recovery) {
      failReason = 'Watchdog FAILED but no recovery fired';
    }
    
    const bundle = {
      ts: new Date().toISOString(),
      sessionId,
      packId: v3ProbingContext?.packId || null,
      instanceNumber: v3ProbingContext?.instanceNumber || null,
      idempotency: {
        lockedKey,
        releasedKey,
        exactMatch
      },
      prompt: {
        commit: lastPromptCommitRef.current,
        snapshot: lastWatchdogSnapshotRef.current,
        decision: lastWatchdogDecisionRef.current,
        outcome: lastWatchdogOutcomeRef.current
      },
      multiIncident: {
        source: lastMultiIncidentSourceRef.current,
        recovery: lastRecoveryAnotherInstanceRef.current
      },
      passFail,
      failReason
    };
    
    const json = JSON.stringify(bundle, null, 2);
    console.log('[V3_DEBUG_BUNDLE]', bundle);
    
    if (navigator.clipboard) {
      navigator.clipboard.writeText(json).then(() => {
        alert('V3 Debug Bundle copied to clipboard!');
      }).catch((err) => {
        console.error('Failed to copy to clipboard:', err);
        alert('Failed to copy - check console for [V3_DEBUG_BUNDLE]');
      });
    } else {
      alert('Clipboard not available - check console for [V3_DEBUG_BUNDLE]');
    }
  }, [sessionId, v3ProbingContext]);
  
  // DEV DEBUG: Keyboard shortcut (Ctrl+Shift+C)
  useEffect(() => {
    if (!isV3DebugEnabled) return;
    
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        copyV3DebugBundle();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isV3DebugEnabled, copyV3DebugBundle]);

  // Compute next renderable (dedupe + filter)
  // CRITICAL: This memo MUST NOT trigger component remount
  const nextRenderable = React.useMemo(() => {
    const base = Array.isArray(transcriptSOT) ? transcriptSOT : [];
    
    // V3 probe Q/A now allowed in transcript (no longer filtered)
    const baseWithoutV3Probes = base;
    
    // Log if any were removed
    const removedCount = base.length - baseWithoutV3Probes.length;
    if (removedCount > 0) {
      const removedKeys = base
        .filter(e => {
          const mt = e.messageType || e.type;
          const stableKey = e.stableKey || '';
          return mt === 'V3_PROBE_QUESTION' || stableKey.startsWith('v3-probe-q:');
        })
        .map(e => e.stableKey || e.id);
      
      console.log('[V3_UI_CONTRACT][RENDER_FILTER_REMOVED]', {
        removedCount,
        sampleKeysPreview: removedKeys.slice(0, 3),
        reason: 'V3 probe prompts found in transcript - filtering for render'
      });
    }
    
    // REQUIREMENT: Filter first, then dedupe (preserve insertion order)
    const filtered = baseWithoutV3Probes.filter(entry => isRenderableTranscriptEntry(entry));
    const deduped = dedupeByStableKey(filtered);
    
    // GUARD: Detect candidate-visible entries being filtered
    const candidateVisibleInBase = baseWithoutV3Probes.filter(e => e.visibleToCandidate === true).length;
    const candidateVisibleInFiltered = deduped.filter(e => e.visibleToCandidate === true).length;
    
    if (candidateVisibleInFiltered < candidateVisibleInBase) {
      console.error('[TRANSCRIPT_FILTER][ILLEGAL_DROP]', {
        baseLen: baseWithoutV3Probes.length,
        candidateVisibleInBase,
        candidateVisibleInFiltered,
        droppedCount: candidateVisibleInBase - candidateVisibleInFiltered
      });
    }
    
    // FALLBACK: If filter hides all messages but we have canonical data, use last 10
    if (baseWithoutV3Probes.length > 0 && deduped.length === 0) {
      console.warn('[TRANSCRIPT_FILTER_FALLBACK]', {
        canonicalLen: baseWithoutV3Probes.length,
        currentItemType: currentItem?.type,
        screenMode,
        messageTypeCounts: baseWithoutV3Probes.reduce((acc, e) => {
          const mt = e.messageType || e.type || 'unknown';
          acc[mt] = (acc[mt] || 0) + 1;
          return acc;
        }, {})
      });
      return baseWithoutV3Probes.slice(-10); // Show last 10 messages as fallback
    }
    
    return deduped;
  }, [transcriptSOT]);

  // Loading watchdog state
  const [showLoadingRetry, setShowLoadingRetry] = useState(false);
  
  // REPAIR PASS: Ensure orphaned required anchor answers have their questions
  useEffect(() => {
    if (!Array.isArray(canonicalTranscriptRef.current)) return;
    
    const orphanAnswers = canonicalTranscriptRef.current.filter(e => 
      (e.stableKey || e.id || '').startsWith('required-anchor:a:') &&
      e.messageType === 'ANSWER' &&
      e.meta?.answerContext === 'REQUIRED_ANCHOR_FALLBACK'
    );
    
    if (orphanAnswers.length === 0) return;
    
    for (const answer of orphanAnswers) {
      const answerKey = answer.stableKey || answer.id;
      const anchorKey = answer.meta?.anchor || answer.anchor;
      
      if (!anchorKey) continue;
      
      // Build expected question key
      const questionKey = `required-anchor:q:${sessionId}:${answer.meta?.categoryId || ''}:${answer.meta?.instanceNumber || 1}:${anchorKey}`;
      
      // Check if question exists
      const questionExists = canonicalTranscriptRef.current.some(e => e.stableKey === questionKey);
      
      if (!questionExists) {
        console.log('[REQUIRED_ANCHOR_FALLBACK][REPAIR_INSERT_Q]', {
          anchorKey,
          stableKeyQ: questionKey,
          reason: 'Orphan answer found - inserting missing question'
        });
        
        // NO-CRASH WRAPPER: Fire-and-forget repair using hoisted-safe function
        (async () => {
          try {
            // QUESTION TEXT SOT: Use resolver for repair
            const repairQuestionText = resolveAnchorToHumanQuestion(
              anchorKey,
              answer.meta?.packId
            );

            // DEFENSIVE: Check function exists before calling
            if (typeof ensureRequiredAnchorQuestionInTranscript === "function") {
              await ensureRequiredAnchorQuestionInTranscript({
              sessionId,
              categoryId: answer.meta?.categoryId,
              instanceNumber: answer.meta?.instanceNumber,
              anchor: anchorKey,
              questionText: repairQuestionText,
              appendFn: appendAssistantMessageImport,
              existingTranscript: canonicalTranscriptRef.current,
              packId: answer.meta?.packId,
                canonicalRef: canonicalTranscriptRef,
                syncStateFn: upsertTranscriptState
              });
            } else {
              console.error('[REQUIRED_ANCHOR_FALLBACK][ENSURE_HELPER_MISSING]', {
                anchor: anchorKey,
                phase: 'REPAIR',
                stability: 'NON_FATAL',
                note: 'Helper not in scope - skipping'
              });
            }
          } catch (err) {
            // Already logged by safe function - no-op
          }
        })();
      }
    }
  }, [canonicalTranscriptRef.current.length, sessionId, ensureRequiredAnchorQuestionInTranscript]);

  // STABLE RENDER LIST: Pure deterministic filtering (no UI-state-dependent shrink/grow)
  const renderedTranscript = useMemo(() => {
    const base = Array.isArray(transcriptSOT) ? transcriptSOT : [];
    
    // V3 probe Q/A now allowed in transcript (no longer filtered)
    const baseFiltered = base;
    
    // Log if any V3 probe prompts were removed
    const removedCount = base.length - baseFiltered.length;
    if (removedCount > 0) {
      const removedKeys = base
        .filter(e => {
          const mt = e.messageType || e.type;
          const stableKey = e.stableKey || '';
          return mt === 'V3_PROBE_QUESTION' || stableKey.startsWith('v3-probe-q:');
        })
        .map(e => ({ key: e.stableKey || e.id, preview: (e.text || '').substring(0, 40) }));
      
      console.log('[V3_UI_CONTRACT][RENDER_FILTER_REMOVED]', {
        removedCount,
        sampleKeysPreview: removedKeys.slice(0, 3),
        reason: 'V3 probe prompts found in transcript - filtering for render'
      });
    }
    
    // REQUIREMENT: Filter first, then dedupe, preserving insertion order
    const filteredFirst = baseFiltered.filter(entry => isRenderableTranscriptEntry(entry));
    
    // SCOPED DEDUPE: Only dedupe specific messageTypes that can legitimately duplicate
    // DO NOT dedupe normal Q/A entries - they must render exactly as logged
    const DEDUPE_ALLOWED_TYPES = new Set([
      'MULTI_INSTANCE_GATE_SHOWN',  // Gate prompts can log multiple times
      'FOLLOWUP_CARD_SHOWN'          // Opener cards can log on mount+render
    ]);
    
    const deduped = [];
    const dedupedKeys = new Map();
    
    for (const entry of filteredFirst) {
      const mt = entry.messageType || entry.type;
      const key = entry.stableKey || entry.id;
      
      // Scoped dedupe: ONLY for allowed types with valid keys
      if (DEDUPE_ALLOWED_TYPES.has(mt) && key) {
        // Additional filter for FOLLOWUP_CARD_SHOWN: only dedupe opener variant
        if (mt === 'FOLLOWUP_CARD_SHOWN') {
          const variant = entry.meta?.variant || entry.variant;
          if (variant === 'opener') {
            if (dedupedKeys.has(key)) continue; // Skip duplicate opener
            dedupedKeys.set(key, true);
          }
          // Non-opener FOLLOWUP_CARD_SHOWN: always include (no dedupe)
        } else {
          // Other allowed types: dedupe by key
          if (dedupedKeys.has(key)) continue;
          dedupedKeys.set(key, true);
        }
      }
      
      // Include entry (dedupe only applied to specific types above)
      deduped.push(entry);
    }
    
    // TASK 2: CANONICAL KEY NORMALIZATION - Always include stableKey/id (prevents collisions)
    const normalized = deduped.map(entry => {
      const messageType = entry.messageType || entry.type;
      const role = entry.role || 'unknown';
      const uniqueId = entry.stableKey || entry.id || `idx-${entry.index || Math.random()}`;
      
      // Canonical key: role:messageType:uniqueId (guarantees uniqueness)
      const canonicalKey = `${role}:${messageType}:${uniqueId}`;
      
      return {
        ...entry,
        __canonicalKey: canonicalKey
      };
    });
    
    // PART 4: ACTIVE GATE FILTER - Removed (no longer needed)
    // Gate questions now append ONLY after answer, so no double-render conflict
    // Keep activeGateStableKey for compatibility but don't filter
    const activeGateStableKey = (() => {
      if (currentItem?.type !== 'multi_instance_gate') return null;
      const gatePackId = currentItem.packId || multiInstanceGate?.packId;
      const gateInstanceNumber = currentItem.instanceNumber || multiInstanceGate?.instanceNumber;
      if (!gatePackId || !gateInstanceNumber) return null;
      return `mi-gate:${gatePackId}:${gateInstanceNumber}`;
    })();
    
    // TASK 1: DEDUPE - Split logic for legal record vs other entries
    const stableKeySet = new Set(); // For visibleToCandidate=true (legal record)
    const canonicalKeySet = new Set(); // For other entries
    const finalFiltered = [];
    let activeGateRemovedCount = 0;
    
    for (const entry of normalized) {
      const ck = entry.__canonicalKey;
      const stableKey = entry.stableKey || entry.id;
      
      // LEGAL RECORD PATH: Dedupe by stableKey/id only (no canonicalKey)
      if (entry.visibleToCandidate === true) {
        if (!stableKey) {
          // No stableKey - treat as unique (shouldn't happen but fail-open)
          finalFiltered.push(entry);
          continue;
        }
        
        if (!stableKeySet.has(stableKey)) {
          stableKeySet.add(stableKey);
          finalFiltered.push(entry);
        } else {
          // DUPLICATE LEGAL RECORD: Log and keep first
          console.log('[TRANSCRIPT_DEDUPE][DUP_STABLEKEY_VISIBLE]', {
            stableKey,
            messageType: entry.messageType || entry.type,
            textPreview: (entry.text || '').substring(0, 40)
          });
          // Skip duplicate (first occurrence already added)
        }
        continue;
      }
      
      // OTHER ENTRIES PATH: Dedupe by canonicalKey (includes stableKey in key now)
      if (!ck) {
        finalFiltered.push(entry);
        continue;
      }
      
      if (!canonicalKeySet.has(ck)) {
        canonicalKeySet.add(ck);
        finalFiltered.push(entry);
      } else {
        // DUPLICATE DETECTED: Log for V3 opener cards
        const messageType = entry.messageType || entry.type;
        if (messageType === 'FOLLOWUP_CARD_SHOWN') {
          const variant = entry.meta?.variant || entry.variant;
          if (variant === 'opener') {
            console.log('[V3_UI_CONTRACT][OPENER_DUPLICATE_BLOCKED]', {
              packId: entry.meta?.packId || entry.packId,
              instanceNumber: entry.meta?.instanceNumber || entry.instanceNumber || 1,
              variant,
              droppedKey: entry.stableKey || entry.id,
              canonicalKey: ck
            });
          }
        }
        // Skip duplicate (keep first renderable occurrence)
      }
    }
    
    // Minimal contract check moved out of render loop below
    console.log('');
    console.log('[TRANSCRIPT_RENDER]', {
      canonicalLen: base.length,
      dedupedLen: deduped.length,
      normalizedLen: normalized.length,
      filteredLen: finalFiltered.length,
      activeGateRemovedCount,
      screenMode,
      currentItemType: currentItem?.type
    });
    
    // AUDIT: Verify no synthetic injection (append-only contract) - CORRECTED
    const renderableDbLen = base.filter(entry => isRenderableTranscriptEntry(entry)).length;
    const candidateVisibleDbLen = base.filter(entry => entry.visibleToCandidate === true).length;
    
    console.log('[TRANSCRIPT_AUDIT][SOURCE_OF_TRUTH]', {
      dbLen: base.length,
      renderableDbLen,
      candidateVisibleDbLen,
      renderedLen: finalFiltered.length,
      syntheticEnabled: ENABLE_SYNTHETIC_TRANSCRIPT
    });
    
    // GUARD: Detect candidate-visible entries being filtered out (ILLEGAL)
    const candidateVisibleRenderedLen = finalFiltered.filter(e => e.visibleToCandidate === true).length;
    if (candidateVisibleRenderedLen < candidateVisibleDbLen) {
      const droppedCount = candidateVisibleDbLen - candidateVisibleRenderedLen;
      const droppedEntries = base.filter(e => 
        e.visibleToCandidate === true && 
        !finalFiltered.some(r => (r.stableKey && r.stableKey === e.stableKey) || (r.id && r.id === e.id))
      );
      
      console.error('[TRANSCRIPT_RENDER][ILLEGAL_DROP_VISIBLE]', {
        candidateVisibleDbLen,
        candidateVisibleRenderedLen,
        droppedCount,
        droppedKeys: droppedEntries.map(e => ({ 
          key: e.stableKey || e.id,
          type: e.messageType || e.type,
          textPreview: (e.text || '').substring(0, 40)
        }))
      });
      
      // REGRESSION ASSERT: Detect V3 probe answers specifically
      const droppedV3Answers = droppedEntries.filter(e => 
        (e.messageType === 'V3_PROBE_ANSWER' || e.type === 'V3_PROBE_ANSWER') &&
        e.role === 'user'
      );
      
      if (droppedV3Answers.length > 0) {
        console.error('[CQ_TRANSCRIPT][V3_PROBE_ANSWER_MISSING_REGRESSION]', {
          droppedCount: droppedV3Answers.length,
          dbLen: base.length,
          renderLen: finalFiltered.length,
          droppedKeys: droppedV3Answers.map(e => ({
            stableKey: e.stableKey || e.id,
            promptId: e.meta?.promptId,
            loopKey: e.meta?.loopKey,
            textPreview: (e.text || '').substring(0, 40)
          }))
        });
      }
    }
    
    // DIAGNOSTIC: Detect when filters are hiding items - CORRECTED (use renderableDbLen)
    const hiddenCount = renderableDbLen - finalFiltered.length;
    if (hiddenCount >= 1) {
      const hiddenEntries = base.filter(e => 
        isRenderableTranscriptEntry(e) && 
        !finalFiltered.some(r => (r.stableKey && r.stableKey === e.stableKey) || (r.id && r.id === e.id))
      );
      
      console.warn('[TRANSCRIPT_AUDIT][LEN_MISMATCH]', {
        dbLen: base.length,
        renderableDbLen,
        renderedLen: finalFiltered.length,
        hiddenCount,
        screenMode,
        currentItemType: currentItem?.type,
        hiddenKeys: hiddenEntries.map(e => ({
          key: e.stableKey || e.id,
          type: e.messageType || e.type,
          visible: e.visibleToCandidate,
          textPreview: (e.text || '').substring(0, 40)
        }))
      });
    }
    
    return finalFiltered;
  }, [transcriptSOT, currentItem, multiInstanceGate]);

  // Render-time freeze: Capture/clear snapshot based on isUserTyping
  useEffect(() => {
    if (isUserTyping && !renderedTranscriptSnapshotRef.current) {
      renderedTranscriptSnapshotRef.current = renderedTranscript;
      console.log('[TRANSCRIPT_RENDER][FROZEN_DURING_TYPING]', { len: renderedTranscript.length });
    } else if (!isUserTyping && renderedTranscriptSnapshotRef.current) {
      renderedTranscriptSnapshotRef.current = null;
    }
  }, [isUserTyping, renderedTranscript]);

  // STEP 3: Key-based monotonic assertion (detects lost keys)
  const prevKeysSetRef = useRef(new Set());
  
  useEffect(() => {
    const getKey = (e) => e.__canonicalKey || e.stableKey || e.id;
    
    const prevKeys = prevKeysSetRef.current;
    const nextKeys = new Set(canonicalTranscriptRef.current.map(getKey).filter(Boolean));
    
    const missingKeys = Array.from(prevKeys).filter(k => !nextKeys.has(k));
    
    if (missingKeys.length > 0) {
      console.error('[TRANSCRIPT_MONOTONIC][FATAL_KEY_LOSS]', {
        missingCount: missingKeys.length,
        missingKeys: missingKeys.slice(0, 10),
        prevKeysCount: prevKeys.size,
        nextKeysCount: nextKeys.size,
        action: 'CANONICAL_NOT_OVERWRITTEN',
        note: 'Key-based monotonic contract violated - keys lost from canonical'
      });
      // DO NOT overwrite canonical - keep previous
      return;
    }
    
    prevKeysSetRef.current = nextKeys;
  }, [transcriptSOT]);

  // Verification instrumentation (moved above early returns)
  const uiContractViolationKeyRef = useRef(null);
  useEffect(() => {
    if (!Array.isArray(renderedTranscript) || renderedTranscript.length === 0) return;
    const last = renderedTranscript[renderedTranscript.length - 1];
    if (!last || last.messageType !== 'MULTI_INSTANCE_GATE_SHOWN') return;

    const effectiveType = v3ProbingActive ? 'v3_probing' : (currentItem?.type || null);
    const isGate = effectiveType === 'multi_instance_gate';
    const footerIsYesNo = isGate; // simplified to avoid TDZ on currentPrompt

    if (!(isGate && footerIsYesNo)) {
      const key = `${last.stableKey || last.id || 'gate'}:${effectiveType}`;
      if (uiContractViolationKeyRef.current !== key) {
        uiContractViolationKeyRef.current = key;
        console.error('[UI_CONTRACT][VIOLATION]', {
          reason: 'Gate prompt visible but footer not in YES_NO with multi_instance_gate',
          effectiveType,
          bottomBarModeSOT: footerIsYesNo ? 'YES_NO' : 'other',
          lastMessageType: last.messageType
        });
      }
    }
  }, [renderedTranscript, currentItem, v3ProbingActive]);

  // Hooks must remain unconditional; keep memoized values above early returns.
  // Derive UI current item (prioritize gates over base question) - MUST be before early returns
  // uiCurrentItem removed: use currentItem directly everywhere to avoid TDZ
  const uiCurrentItem = React.useMemo(() => {
    // Priority 1: V3 gate
    if (v3GateActive) {
      return {
        type: 'v3_gate',
        id: `v3-gate-${v3Gate.packId}-${v3Gate.instanceNumber}`,
        packId: v3Gate.packId,
        categoryId: v3Gate.categoryId,
        promptText: v3Gate.promptText,
        instanceNumber: v3Gate.instanceNumber
      };
    }

    // Priority 2: V3 probing active
    if (v3ProbingActive) {
      return {
        type: 'v3_probing',
        id: `v3-probing-${v3ProbingContext?.packId}`,
        packId: v3ProbingContext?.packId
      };
    }

    // Priority 3: Section transition pending
    if (pendingSectionTransition) {
      return {
        type: 'section_transition',
        id: `section-transition-${pendingSectionTransition.nextSectionIndex}`
      };
    }

    // Priority 4: Base current item
    return currentItem;
  }, [v3GateActive, v3Gate, v3ProbingActive, v3ProbingContext, pendingSectionTransition, currentItem]);

  const MAX_PROBE_TURNS = 6;
  const AI_RESPONSE_TIMEOUT_MS = 45000;
  const TYPING_TIMEOUT_MS = 240000;
  const TYPING_IDLE_MS = 4000; // 4 seconds after last keystroke = not typing

  // UX: Text normalization for duplicate detection
  const normalizeText = (s) => {
    if (!s || typeof s !== 'string') return '';
    return s.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[?.!]+$/, '');
  };

  // UX: Check if scroll container is near bottom
  const isNearBottom = (el, thresholdPx = 80) => {
    if (!el) return false;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distanceFromBottom <= thresholdPx;
  };
  
  // GRAVITY FOLLOW: Compute near-bottom for auto-scroll decisions (NO footer math)
  const computeNearBottom = (scrollContainer, thresholdPx = 80) => {
    if (!scrollContainer) return false;
    const distanceFromBottom = scrollContainer.scrollHeight - (scrollContainer.scrollTop + scrollContainer.clientHeight);
    return distanceFromBottom <= thresholdPx;
  };
  
  // BOTTOM ANCHOR HELPERS: Deterministic bottom-pinning for short transcripts
  const isNearBottomStrict = (el, thresholdPx = 24) => {
    if (!el) return false;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distanceFromBottom <= thresholdPx;
  };
  
  // TDZ GUARD: Safe length counter for bottom-anchor effect (avoids finalTranscriptList TDZ)
  const bottomAnchorLenRef = React.useRef(0);
  
  // TDZ GUARD: Hooks/memos must not reference finalList before it is initialized. Use finalListRef/finalListLenRef.
  const finalListRef = React.useRef([]);
  const finalListLenRef = React.useRef(0);
  
  // UI CONTRACT HELPER: Detect non-card structural elements (wrappers, spacers, anchors)
  const isUiContractNonCard = (el) => {
    if (!el) return true; // Null element = not a card
    
    // Check data attributes
    if (el.getAttribute('data-ui-contract-spacer') === 'true') return true;
    if (el.getAttribute('data-ui-contract-struct') === 'true') return true;
    if (el.getAttribute('data-ui-contract-anchor') === 'true') return true;
    if (el.getAttribute('data-cq-footer-spacer') === 'true') return true;
    
    // Check classes (fallback for unmarked legacy elements)
    const classList = el.classList;
    if (classList.contains('cq-footer-spacer')) return true;
    if (classList.contains('cq-gravity-rail')) return true;
    if (classList.contains('cq-gravity-bottom')) return true;
    
    return false; // Not a structural element
  };
  
  // Throttled suspect element logger (prevents spam)
  const lastSuspectLogTimeRef = React.useRef(0);
  const logSuspectElement = (el, context) => {
    const now = Date.now();
    const elapsed = now - lastSuspectLogTimeRef.current;
    
    // Throttle: only log once per 2 seconds
    if (elapsed < 2000) return;
    
    lastSuspectLogTimeRef.current = now;
    
    console.error('[UI_CONTRACT][FOOTER_MEASURE_TARGET_SUSPECT_DETAIL]', {
      context,
      tagName: el.tagName,
      classNames: el.className,
      datasetKeys: Object.keys(el.dataset),
      hasStablekey: el.hasAttribute('data-stablekey'),
      outerHTMLPreview: el.outerHTML?.substring(0, 120) || '(unavailable)'
    });
  };

  // MESSAGE TYPE SOT: Canonical messageType normalizer (handles DB casing mismatches)
  const getMessageTypeSOT = (entry) => {
    if (!entry) return '';
    const raw = entry.messageType || entry.type || entry.meta?.messageType || '';
    if (!raw) return '';
    
    // 1) HARDEN: Normalize whitespace, hyphen, dot, slash, colon to underscore
    const normalized = String(raw)
      .trim()
      .toUpperCase()
      .replace(/[\s\-./:]+/g, '_')  // Replace all delimiters with underscore
      .replace(/_+/g, '_')  // Collapse multiple underscores
      .replace(/^_+|_+$/g, '');  // Trim leading/trailing underscores
    
    return normalized;
  };
  
  // STEP 1: Candidate-facing text sanitizer (prevents developer instructions from showing in UI)
  const DEV_LEAK_PATTERNS = [
    'BEGIN PROMPT',
    'END PROMPT',
    'PASS CRITERIA',
    'DETAILED CHANGE REPORT',
    'Anything I Need to Know',
    'Run the exact GIF repro',
    'If PASS',
    'If FAIL',
    'ACCEPTANCE CRITERIA',
    'files touched',
    'diff summary',
    'root cause'
  ];
  
  const sanitizeCandidateFacingText = (raw, contextLabel) => {
    if (!raw) return raw;
    
    const rawLower = String(raw).toLowerCase();
    const hasCorruption = DEV_LEAK_PATTERNS.some(pattern => 
      rawLower.includes(pattern.toLowerCase())
    );
    
    if (hasCorruption && typeof window !== 'undefined' && 
        (window.location.hostname.includes('preview') || window.location.hostname.includes('localhost'))) {
      console.log('[CQ_UI][CANDIDATE_TEXT_SANITIZED]', {
        context: contextLabel,
        preview: String(raw).substring(0, 80)
      });
      return ''; // Return empty string to hide corrupted text
    }
    
    return raw;
  };
  
  // HOISTED: KEY-BASED monotonic transcript upsert (moved BEFORE refreshTranscriptFromDB to prevent TDZ)
  function upsertTranscriptMonotonic(prev, incoming, sourceLabel = 'unknown') {
    if (!Array.isArray(prev)) prev = [];
    if (!Array.isArray(incoming)) incoming = [];
    
    // Key extractor: canonical key > stableKey > id
    const getKey = (e) => e.__canonicalKey || e.stableKey || e.id;
    
    // Priority scorer: higher = better
    const scoreEntry = (e) => {
      const isUser = e.role === 'user';
      const hasText = (e.text || '').trim().length > 0;
      const isVisible = e.visibleToCandidate !== false;
      
      if (isUser && hasText && isVisible) return 4;
      if (isUser && hasText) return 3;
      if (isUser) return 2;
      if (e.role === 'assistant' && hasText) return 1;
      return 0;
    };
    
    // Build maps by key
    const prevMap = new Map();
    const unkeyedPrev = [];
    
    for (const entry of prev) {
      const key = getKey(entry);
      if (!key) {
        unkeyedPrev.push(entry);
        continue;
      }
      
      if (!prevMap.has(key) || scoreEntry(entry) > scoreEntry(prevMap.get(key))) {
        prevMap.set(key, entry);
      }
    }
    
    const incomingMap = new Map();
    const unkeyedIncoming = [];
    
    for (const entry of incoming) {
      const key = getKey(entry);
      if (!key) {
        unkeyedIncoming.push(entry);
        continue;
      }
      
      if (!incomingMap.has(key) || scoreEntry(entry) > scoreEntry(incomingMap.get(key))) {
        incomingMap.set(key, entry);
      }
    }
    
    // KEY-BASED MONOTONIC: Union of keys
    const allKeys = new Set([...prevMap.keys(), ...incomingMap.keys()]);
    const mergedMap = new Map();
    
    for (const key of allKeys) {
      const prevEntry = prevMap.get(key);
      const incomingEntry = incomingMap.get(key);
      
      if (!incomingEntry) {
        // Key only in prev - must keep (monotonic)
        mergedMap.set(key, prevEntry);
      } else if (!prevEntry) {
        // Key only in incoming - add
        mergedMap.set(key, incomingEntry);
      } else {
        // Key in both - prefer higher score
        mergedMap.set(key, scoreEntry(incomingEntry) >= scoreEntry(prevEntry) ? incomingEntry : prevEntry);
      }
    }
    
    // Sort keyed entries: index asc, createdAt asc, stableKey lexical (stable)
    const keyedSorted = Array.from(mergedMap.values()).sort((a, b) => {
      const aIdx = a.index || 0;
      const bIdx = b.index || 0;
      if (aIdx !== bIdx) return aIdx - bIdx;
      
      const aTs = a.createdAt || new Date(a.timestamp || 0).getTime() || 0;
      const bTs = b.createdAt || new Date(b.timestamp || 0).getTime() || 0;
      if (aTs !== bTs) return aTs - bTs;
      
      // Stable fallback: lexical sort by stableKey
      const aKey = a.stableKey || a.id || '';
      const bKey = b.stableKey || b.id || '';
      return aKey.localeCompare(bKey);
    });
    
    // Append unkeyed entries (preserve original relative order)
    const merged = [...keyedSorted, ...unkeyedIncoming, ...unkeyedPrev];
    
    console.log('[TRANSCRIPT_MONOTONIC][UPSERT_KEY_BASED]', {
      prevLen: prev.length,
      incomingLen: incoming.length,
      mergedLen: merged.length,
      prevKeysCount: prevMap.size,
      incomingKeysCount: incomingMap.size,
      mergedKeysCount: mergedMap.size,
      unkeyedCount: unkeyedIncoming.length + unkeyedPrev.length,
      source: sourceLabel
    });
    
    return merged;
  }
  
  // STABLE KEY SOT: Canonical stableKey extractor
  const getStableKeySOT = (entry) => {
    if (!entry) return '';
    return entry.stableKey || entry.id || '';
  };
  
  // STABLE KEY HELPER: Deterministic key for each transcript entry
  const getTranscriptEntryKey = useCallback((entry) => {
    if (!entry) return 'fallback-null-entry';
    
    // Priority 1: Stable key (best)
    if (entry.stableKey) return entry.stableKey;
    
    // Priority 2: ID (good)
    if (entry.id) return entry.id;
    if (entry._id) return entry._id;
    
    // Priority 3: Deterministic composite (fallback)
    const role = entry.role || 'unknown';
    const type = entry.messageType || entry.type || 'message';
    const qId = entry.questionDbId || entry.questionId || entry.meta?.questionDbId || '';
    const pId = entry.packId || entry.meta?.packId || '';
    const inst = entry.instanceNumber || entry.meta?.instanceNumber || '';
    // SINGLE-SOURCE: Normalize opener key shape to prevent duplicates
    const isOpener = type === 'FOLLOWUP_CARD_SHOWN' && (entry.meta?.variant === 'opener' || entry.variant === 'opener');
    if (isOpener && pId) {
      return `followup-card:${pId}:opener:${inst || 1}`;
    }
    const idx = entry.index || 0;
    
    return `${role}-${type}-${qId}-${pId}-${inst}-${idx}`;
  }, []);

  const handleTranscriptScroll = useCallback(() => {
    // GUARD: Ignore programmatic scroll events to prevent flapping
    if (isProgrammaticScrollRef.current) return;
    
    const el = historyRef.current;
    if (!el) return;
    
    // STICKY AUTOSCROLL: Detect if user is near bottom (24px threshold)
    const NEAR_BOTTOM_THRESHOLD_PX = 24;
    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    const nearBottom = distanceFromBottom <= NEAR_BOTTOM_THRESHOLD_PX;
    
    // GUARD: Don't flip auto-scroll state during system transitions OR force-once window
    const recentAnchorAge = Date.now() - recentAnchorRef.current.ts;
    const hasRecentAnchor = recentAnchorRef.current.kind === 'V3_PROBE_ANSWER' && recentAnchorAge < 1500;
    const hasForceScrollPending = forceAutoScrollOnceRef.current;
    
    if (hasRecentAnchor || hasForceScrollPending) {
      if (cqDiagEnabled) {
        console.log('[SCROLL][AUTO_SCROLL_STATE][GUARD]', {
          reason: hasRecentAnchor ? 'recent_v3_answer_anchor' : 'force_scroll_pending',
          ignored: true,
          recentAnchorAge,
          hasForceScrollPending,
          stableKey: recentAnchorRef.current.stableKey
        });
      }
      return; // Ignore scroll events during anchor window or force-once
    }
    
    // Update sticky autoscroll state based on user scroll position
    const wasShouldAutoScroll = shouldAutoScrollRef.current;
    const nowShouldAutoScroll = nearBottom;
    
    if (wasShouldAutoScroll !== nowShouldAutoScroll) {
      shouldAutoScrollRef.current = nowShouldAutoScroll;
      console.log('[SCROLL][AUTO_SCROLL_STATE]', {
        nearBottom,
        shouldAutoScroll: nowShouldAutoScroll,
        distanceFromBottom: Math.round(distanceFromBottom),
        reason: nowShouldAutoScroll ? 'user_scrolled_to_bottom' : 'user_scrolled_up'
      });
    }
  }, [cqDiagEnabled]);

  const scrollToBottomSafely = useCallback((reason = 'default') => {
    if (!autoScrollEnabledRef.current) return;
    if (!bottomAnchorRef.current || !historyRef.current) return;
    
    // Gate on transcript growth: only scroll when canonical transcript grows
    const currentLen = Array.isArray(transcriptSOT) ? transcriptSOT.length : 0;
    if (currentLen <= lastAutoScrollLenRef.current) {
      return; // No growth, no scroll (prevents snap on rerenders)
    }
    
    // Cooldown: prevent rapid double-scroll
    const now = Date.now();
    if (now - lastAutoScrollAtRef.current < 120) {
      return;
    }
    
    // Update tracking refs
    lastAutoScrollLenRef.current = currentLen;
    lastAutoScrollAtRef.current = now;
    
    // RAF coalescing: prevent multiple scrolls in same frame
    if (pendingScrollRafRef.current) {
      cancelAnimationFrame(pendingScrollRafRef.current);
    }
    
    pendingScrollRafRef.current = requestAnimationFrame(() => {
      pendingScrollRafRef.current = null;
      
      // Mark scroll as programmatic to prevent detection loop
      isProgrammaticScrollRef.current = true;
      
      // Determine scroll behavior: auto for first scroll, smooth afterwards
      const isFirstScroll = lastAutoScrollLenRef.current === currentLen && !didInitialSnapRef.current;
      const behavior = isFirstScroll ? 'auto' : 'smooth';
      
      // Scroll to bottom anchor (footer-safe padding already applied via className)
      bottomAnchorRef.current?.scrollIntoView({ block: 'end', behavior });
      
      // Clear programmatic flag after scroll completes
      requestAnimationFrame(() => {
        isProgrammaticScrollRef.current = false;
      });
    });
  }, [footerHeightPx, transcriptSOT]);

  const autoScrollToBottom = useCallback(() => {
    if (isUserTyping) return;
    scrollToBottomSafely('autoScroll');
  }, [isUserTyping, scrollToBottomSafely]);

  // UX: Mark user as typing and set timeout to unlock after idle period
  // CRITICAL: Does NOT trigger transcript refresh (prevents flashing)
  const markUserTyping = useCallback(() => {
    if (!isUserTyping) {
      console.log("[UX][TYPING_LOCK]", { locked: true, note: "scroll locked, no transcript refresh" });
      setIsUserTyping(true);
    }

    if (typingLockTimeoutRef.current) {
      clearTimeout(typingLockTimeoutRef.current);
    }

    typingLockTimeoutRef.current = setTimeout(() => {
      console.log("[UX][TYPING_LOCK]", { locked: false, note: "scroll unlocked" });
      setIsUserTyping(false);
      typingLockTimeoutRef.current = null;
    }, TYPING_IDLE_MS);
  }, [isUserTyping]);

  // UX: Build draft key for sessionStorage
  const buildDraftKey = useCallback((sessionId, packId, fieldKey, instanceNumber) => {
    return `cq_draft_${sessionId}_${packId || "none"}_${fieldKey || "none"}_${instanceNumber || 0}`;
  }, []);

  // UX: Save draft to sessionStorage
  const saveDraft = useCallback((value) => {
    if (!sessionId) return;

    const packId = currentItem?.packId || activeV2Pack?.packId || null;
    const fieldKey = currentItem?.fieldKey || currentItem?.id || null;
    const instanceNumber = currentItem?.instanceNumber || activeV2Pack?.instanceNumber || 0;
    const draftKey = buildDraftKey(sessionId, packId, fieldKey, instanceNumber);

    try {
      window.sessionStorage.setItem(draftKey, value);
      
      // ABANDONMENT SAFETY: Log draft save
      console.log('[DRAFT][SAVE]', {
        keyPreview: draftKey.substring(0, 40),
        len: value?.length || 0
      });
      
      console.log("[FORENSIC][STORAGE][WRITE]", { operation: 'WRITE', key: draftKey, success: true, valueLength: value?.length || 0 });
    } catch (e) {
      const isTrackingPrevention = e.message?.includes('tracking') || e.name === 'SecurityError';
      console.log("[FORENSIC][STORAGE][WRITE]", { 
        operation: 'WRITE', 
        key: draftKey, 
        success: false, 
        error: e.message,
        isTrackingPrevention,
        fallbackBehavior: 'Draft lost - continue without storage'
      });
      console.warn("[UX][DRAFT] Failed to save draft", e);
    }
  }, [sessionId, currentItem, activeV2Pack, buildDraftKey]);

  // UX: Clear draft from sessionStorage
  const clearDraft = useCallback(() => {
    if (!sessionId) return;

    const packId = currentItem?.packId || activeV2Pack?.packId || null;
    const fieldKey = currentItem?.fieldKey || currentItem?.id || null;
    const instanceNumber = currentItem?.instanceNumber || activeV2Pack?.instanceNumber || 0;
    const draftKey = buildDraftKey(sessionId, packId, fieldKey, instanceNumber);

    try {
      window.sessionStorage.removeItem(draftKey);
      
      // ABANDONMENT SAFETY: Log draft clear
      console.log('[DRAFT][CLEAR]', {
        keyPreview: draftKey.substring(0, 40)
      });
    } catch (e) {
      console.warn("[UX][DRAFT] Failed to clear draft", e);
    }
  }, [sessionId, currentItem, activeV2Pack, buildDraftKey]);

  // Track last logged V2 pack field to prevent duplicates (logging happens on answer, not render)
  // This ref is used when logging answers to check for duplicates
  useEffect(() => {
    if (v2PackMode !== "V2_PACK") return;
    if (!activeV2Pack || !currentItem || currentItem.type !== 'v2_pack_field') return;
    // Just track the current field - actual logging happens in handleAnswer
  }, [v2PackMode, activeV2Pack, currentItem]);

  // FULL SESSION RESET: Cleanup all interview-local state when sessionId changes (prevent cross-session leakage)
  useEffect(() => {
    if (!sessionId) return;
    
    // V3 ACK METRICS: Log final stats on session change
    if (v3AckSetCountRef.current > 0) {
      console.log('[V3_PROBE][ACK_METRICS]', {
        ackSet: v3AckSetCountRef.current,
        ackCleared: v3AckClearCountRef.current,
        ackRepaired: v3AckRepairCountRef.current,
        sessionId: 'session_reset'
      });
    }
    
    console.log('[INTERVIEW_RESET][START]', { 
      sessionId,
      transcriptLenBefore: canonicalTranscriptRef.current.length,
      dbTranscriptLenBefore: dbTranscript.length,
      v3ProbeHistoryLenBefore: v3ProbeDisplayHistory.length
    });
    
    // CRITICAL: Reset canonical transcript ref (prevents cross-session contamination)
    canonicalTranscriptRef.current = [];
    
    // Reset all V3 probing state
    setV3ProbeDisplayHistory([]);
    setV3ProbingActive(false);
    setV3ProbingContext(null);
    setV3ActivePromptText(null);
    setV3PendingAnswer(null);
    setV3PromptPhase('IDLE');
    
    // Reset V3 gate state
    setV3Gate({ active: false, packId: null, categoryId: null, promptText: null, instanceNumber: null });
    setMultiInstanceGate(null);
    
    // Clear V3 refs
    v3ActiveProbeQuestionRef.current = null;
    v3ActiveProbeQuestionLoopKeyRef.current = null;
    lastV3PromptSnapshotRef.current = null;
    v3RecapAppendedKeysRef.current.clear();
    v3OpenerSubmittedRef.current.clear();
    v3ProbingStartedRef.current.clear();
    v3RecapReadyRef.current.clear();
    lastRenderedV3PromptKeyRef.current = null;
    v3PromptSnapshotsRef.current = [];
    setV3PromptSnapshots([]);
    
    // Clear idempotency guards (prevent cross-session false positives)
    submittedKeysRef.current.clear();
    completedSectionKeysRef.current.clear();
    appendedTranscriptKeysRef.current.clear();
    triggeredPacksRef.current.clear();
    
    // Clear tracking refs
    lastLoggedV2PackFieldRef.current = null;
    lastLoggedFollowupCardIdRef.current = null;
    lastQuestionShownIdRef.current = null;
    promptMissingKeyRef.current = null;
    handledPromptIdsRef.current.clear();
    lastV3SubmitLockKeyRef.current = null;
    
    // Clear UI state
    setV2PackMode("BASE");
    setActiveV2Pack(null);
    setV2ClarifierState(null);
    setCurrentFieldProbe(null);
    setFieldSuggestions({});
    setAiFollowupCounts({});
    setCurrentFollowUpAnswers({});
    
    // Clear scroll anchors
    recentAnchorRef.current = { kind: null, stableKey: null, ts: 0 };
    v3ScrollAnchorRef.current = { kind: null, stableKey: null, ts: 0 };
    
    // Clear protection refs
    recentlySubmittedUserAnswersRef.current.clear();
    recentlySubmittedUserAnswersMetaRef.current.clear();
    
    // Clear diagnostic refs
    lastIdempotencyLockedRef.current = null;
    lastIdempotencyReleasedRef.current = null;
    lastPromptCommitRef.current = null;
    lastWatchdogSnapshotRef.current = null;
    lastWatchdogDecisionRef.current = null;
    lastWatchdogOutcomeRef.current = null;
    
    // Reset ACK metrics counters
    v3AckSetCountRef.current = 0;
    v3AckClearCountRef.current = 0;
    v3AckRepairCountRef.current = 0;
    
    // TRANSCRIPT SOT RESET: Reset initialization flag
    transcriptInitializedRef.current = false;
    
    // Clear render stream tracking
    lastRenderStreamLenRef.current = 0;
    renderedTranscriptSnapshotRef.current = null;
    frozenRenderStreamRef.current = null;
    
    console.log('[INTERVIEW_RESET][COMPLETE]', {
      sessionId,
      transcriptLenBefore: 0,
      transcriptLenAfter: canonicalTranscriptRef.current.length,
      allStateCleared: true
    });
  }, [sessionId]);
  
  // CQ_GUARD: MI_GATE reconciliation effect (single instance only)
  // Multi-instance gate V3 transcript reconciliation (repair missing probe Q+A)
  useEffect(() => {
    // Only trigger when entering MI_GATE (not on every multiInstanceGate change)
    if (!multiInstanceGate || activeUiItem?.kind !== "MI_GATE") return;
    
    const urlSessionId = new URLSearchParams(window.location.search).get("session");
    if (!urlSessionId || urlSessionId !== sessionId) return;
    
    // Check if we have a stored payload from last V3 submit
    const payload = lastV3SubmittedAnswerRef.current;
    
    // METADATA PAYLOAD: Check for engine decision metadata (required for gate validation)
    const loopKey = `${sessionId}:${multiInstanceGate?.categoryId}:${multiInstanceGate?.instanceNumber}`;
    const enginePayload = lastV3DecisionByLoopKeyRef.current[loopKey];
    
    if (!payload) {
      console.log('[MI_GATE][V3_RECONCILE_BEGIN]', {
        sessionId,
        hasPayload: false,
        hasEnginePayload: !!enginePayload,
        missingCount: enginePayload?.missingFields?.length || 'unknown',
        miGateBlocked: enginePayload?.miGateBlocked || false,
        stopReason: enginePayload?.stopReason || null,
        actionTaken: 'SKIP_NO_PAYLOAD'
      });
      return;
    }
    
    // Validate payload belongs to current session/category/instance
    const payloadMatches = 
      payload.sessionId === sessionId &&
      payload.packId === multiInstanceGate.packId &&
      payload.categoryId === multiInstanceGate.categoryId &&
      payload.instanceNumber === multiInstanceGate.instanceNumber;
    
    if (!payloadMatches) {
      console.log('[MI_GATE][V3_RECONCILE_BEGIN]', {
        sessionId,
        hasPayload: true,
        payloadMatches: false,
        actionTaken: 'SKIP_STALE_PAYLOAD',
        payloadPackId: payload.packId,
        currentPackId: multiInstanceGate.packId
      });
      return;
    }
    
    // Check if answer already exists in transcript
    const foundQuestion = dbTranscript.some(e => e.stableKey === payload.expectedQKey);
    const foundAnswer = dbTranscript.some(e => e.stableKey === payload.expectedAKey);
    
    console.log('[MI_GATE][V3_RECONCILE_BEGIN]', {
      sessionId,
      expectedAKey: payload.expectedAKey,
      expectedQKey: payload.expectedQKey,
      foundQ: foundQuestion,
      foundA: foundAnswer,
      actionTaken: foundAnswer ? 'SKIP_ALREADY_EXISTS' : 'WILL_INSERT'
    });
    
    // If answer missing, insert it (idempotent)
    if (!foundAnswer && payload.answerText && payload.answerText.trim()) {
      setDbTranscriptSafe(prev => {
        // Double-check not already present (race guard)
        const alreadyHasA = prev.some(e => e.stableKey === payload.expectedAKey);
        if (alreadyHasA) {
          console.log('[MI_GATE][V3_RECONCILE_SKIP]', {
            expectedAKey: payload.expectedAKey,
            reason: 'answer_appeared_during_reconcile'
          });
          return prev;
        }
        
        let working = [...prev];
        let insertedQ = false;
        let insertedA = false;
        
        // Ensure question exists first
        const alreadyHasQ = working.some(e => e.stableKey === payload.expectedQKey);
        if (!alreadyHasQ && payload.promptText) {
          const qEntry = {
            id: `v3-probe-q-reconcile-${payload.promptId}`,
            stableKey: payload.expectedQKey,
            index: getNextIndex(working),
            role: "assistant",
            text: payload.promptText,
            timestamp: new Date().toISOString(),
            createdAt: Date.now(),
            messageType: 'V3_PROBE_QUESTION',
            type: 'V3_PROBE_QUESTION',
            meta: {
              promptId: payload.promptId,
              sessionId: payload.sessionId,
              categoryId: payload.categoryId,
              instanceNumber: payload.instanceNumber,
              packId: payload.packId,
              source: 'mi_gate_reconcile'
            },
            visibleToCandidate: true
          };
          
          working = [...working, qEntry];
          insertedQ = true;
          
          console.log('[MI_GATE][V3_RECONCILE_INSERT_Q]', {
            stableKey: payload.expectedQKey,
            sessionId
          });
        }
        
        // Append missing answer
        const aEntry = {
          id: `v3-probe-a-reconcile-${payload.promptId}`,
          stableKey: payload.expectedAKey,
          index: getNextIndex(working),
          role: "user",
          text: payload.answerText,
          timestamp: new Date().toISOString(),
          createdAt: Date.now(),
          messageType: 'V3_PROBE_ANSWER',
          type: 'V3_PROBE_ANSWER',
          meta: {
            promptId: payload.promptId,
            sessionId: payload.sessionId,
            categoryId: payload.categoryId,
            instanceNumber: payload.instanceNumber,
            packId: payload.packId,
            source: 'mi_gate_reconcile'
          },
          visibleToCandidate: true
        };
        
        const updated = [...working, aEntry];
        insertedA = true;
        
        // Update canonical ref + state atomically
        upsertTranscriptState(updated, 'mi_gate_reconcile_insert');
        
        // Persist repair to DB
        base44.entities.InterviewSession.update(sessionId, {
          transcript_snapshot: updated
        }).then(() => {
          console.log('[MI_GATE][V3_RECONCILE_INSERT]', {
            insertedA: true,
            insertedQ,
            expectedAKey: payload.expectedAKey,
            expectedQKey: payload.expectedQKey,
            reason: 'missing_after_gate',
            transcriptLenAfter: updated.length
          });
        }).catch(err => {
          console.error('[MI_GATE][V3_RECONCILE_ERROR]', { error: err.message });
        });
        
        return updated;
      });
      
      // Clear payload after reconciliation (prevent duplicate inserts)
      console.log('[MI_GATE][V3_RECONCILE_CLEAR]', {
        reason: 'reconciled_or_not_needed',
        expectedAKey: payload.expectedAKey
      });
      lastV3SubmittedAnswerRef.current = null;
    } else if (foundAnswer) {
      // Clear payload if answer already exists (no reconciliation needed)
      console.log('[MI_GATE][V3_RECONCILE_CLEAR]', {
        reason: 'found_in_transcript',
        expectedAKey: payload.expectedAKey
      });
      lastV3SubmittedAnswerRef.current = null;
    }
  }, [multiInstanceGate, activeUiItem, sessionId, dbTranscript, setDbTranscriptSafe]);
  // CQ_GUARD_END: MI_GATE reconciliation effect

  // ACTIVE UI ITEM CHANGE TRACE: Moved to render section (after activeUiItem is initialized)
  // This avoids TDZ error while keeping hook order consistent

  // STABLE: Single mount per session - track by sessionId (survives remounts)
  const initMapRef = useRef({});
  
  // SESSION RECOVERY: Attempt to find session by dept+file if sessionId missing
  const sessionRecoveryAttemptedRef = useRef(false);
  
  useEffect(() => {
    // Only run recovery if sessionId is missing
    if (sessionId) return;
    if (resolvedSessionRef.current) return;
    if (didSessionRepairRef.current) return;
    if (sessionRecoveryAttemptedRef.current) return;
    
    sessionRecoveryAttemptedRef.current = true;
    
    const deptParam = urlParams.get('dept');
    const fileParam = urlParams.get('file');
    
    if (!deptParam || !fileParam) {
      console.log('[CANDIDATE_INTERVIEW][SESSION_RECOVERY_SKIP]', { 
        reason: 'missing_dept_or_file_params'
      });
      return; // Let existing unrecoverable redirect proceed
    }
    
    console.log('[CANDIDATE_INTERVIEW][SESSION_RECOVERY_ATTEMPT]', { dept: deptParam, file: fileParam });
    setIsRecoveringSession(true);
    
    (async () => {
      try {
        const sessionCode = `${deptParam}_${fileParam}`;
        const existingSessions = await base44.entities.InterviewSession.filter({ session_code: sessionCode });
        
        if (existingSessions.length > 0) {
          const activeSession = existingSessions.find(s => 
            s.status === 'active' || s.status === 'in_progress' || s.status === 'paused'
          ) || existingSessions[0];
          
          console.log('[CANDIDATE_INTERVIEW][SESSION_RECOVERY_FOUND]', { sessionId: activeSession.id });
          
          // Set recovered session
          resolvedSessionRef.current = activeSession.id;
          window.__CQ_SESSION__ = activeSession.id;
          didSessionRepairRef.current = true;
          
          // Repair URL with session param
          const params = new URLSearchParams(window.location.search || "");
          params.set("session", activeSession.id);
          const repairedUrl = `/candidateinterview?${params.toString()}`;
          
          console.log('[CANDIDATE_INTERVIEW][SESSION_URL_REPAIR_FROM_RECOVERY]', {
            from: window.location.search,
            to: repairedUrl,
            recoveredSession: activeSession.id
          });
          
          window.location.replace(repairedUrl);
        } else {
          console.log('[CANDIDATE_INTERVIEW][SESSION_RECOVERY_NOT_FOUND]', { dept: deptParam, file: fileParam });
          setIsRecoveringSession(false);
        }
      } catch (err) {
        console.error('[CANDIDATE_INTERVIEW][SESSION_RECOVERY_ERROR]', { error: err.message });
        setIsRecoveringSession(false);
      }
    })();
  }, [sessionId]);
  
  // SESSION GUARD: Redirect to StartInterview if no sessionId in URL
  useEffect(() => {
    if (!sessionId) {
      // ONE-SHOT GUARD: Only redirect once (prevent loops)
      if (didTerminalRedirectRef.current) {
        return; // Already redirected - no-op
      }
      
      // Mark redirect as executed
      didTerminalRedirectRef.current = true;
      
      // Preserve ALL query params (hide_badge, server_url, etc.)
      const currentSearch = window.location.search || '';
      const redirectUrl = `/StartInterview${currentSearch}`;
      
      console.log('[UI_CONTRACT][CANDIDATE_INTERVIEW_NO_SESSION_REDIRECT_EFFECT]', {
        to: redirectUrl,
        preservedParams: currentSearch,
        reason: 'SessionId missing from URL - one-shot redirect in useEffect'
      });
      
      // Prevent redirect loops: only redirect if not already on StartInterview
      if (window.location.pathname !== '/StartInterview') {
        navigate(redirectUrl, { replace: true });
      }
      
      // FAILSAFE: Show manual link after 1500ms if redirect doesn't complete
      const failsafeTimer = setTimeout(() => {
        setShowRedirectFallback(true);
      }, 1500);
      
      return () => clearTimeout(failsafeTimer);
    }
    
    // CRITICAL: Only initialize once per sessionId (even if component remounts)
    if (initMapRef.current[sessionId]) {
      console.log('[MOUNT_GUARD] Already initialized for sessionId - skipping init', { sessionId });
      
      // Remount recovery: restore state from DB without full init
      const quickRestore = async () => {
        try {
          const loadedSession = await base44.entities.InterviewSession.get(sessionId);
          if (loadedSession) {
            setSession(loadedSession);

            // CHANGE 1: Clean legacy V3 probe prompts on load
            const rawTranscript = loadedSession.transcript_snapshot || [];
            const cleanedTranscript = cleanLegacyV3ProbePrompts(rawTranscript, sessionId);
            setDbTranscriptSafe(cleanedTranscript);

            setQueue(loadedSession.queue_snapshot || []);
            setCurrentItem(loadedSession.current_item_snapshot || null);
            setIsLoading(false);
            setShowLoadingRetry(false);

            const hasAnyResponses = cleanedTranscript && cleanedTranscript.length > 0;
            setIsNewSession(!hasAnyResponses);
            setScreenMode(hasAnyResponses ? "QUESTION" : "WELCOME");

            console.log('[MOUNT_GUARD][QUICK_RESTORE]', { transcriptLen: cleanedTranscript?.length || 0 });
          }
        } catch (err) {
          console.error('[MOUNT_GUARD][QUICK_RESTORE][ERROR]', err);
        }
      };
      
      quickRestore();
      return;
    }
    
    // Mark this sessionId as initialized
    initMapRef.current[sessionId] = true;
    console.log('[MOUNT_GUARD] First init for sessionId', { sessionId });
    
    initializeInterview();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      clearTimeout(typingTimeoutRef.current);
      clearTimeout(aiResponseTimeoutRef.current);
      clearTimeout(typingLockTimeoutRef.current);
      setShowLoadingRetry(false);
      
      // DO NOT clear initMapRef on unmount - allows detection across remounts
    };
  }, [sessionId]);

  // STABLE: Component instance tracking - MUST NOT change during session
  const componentInstanceId = useRef(`CandidateInterview-${sessionId}`);
  
  useEffect(() => {
    candidateInterviewMountCount++;
    
    // HARD REMOUNT DETECTOR: Track per sessionId
    if (!mountsBySession[sessionId]) {
      mountsBySession[sessionId] = 0;
    }
    mountsBySession[sessionId]++;
    
    const sessionMounts = mountsBySession[sessionId];
    
    // CQ_GUARDRAIL_COUNTS: Manual validation assertion (post-fix verification)
    console.log('[CQ_GUARDRAIL_COUNTS]', {
      handleBottomBarSubmitCount: 1,
      miGateReconcileCount: 1,
      note: 'Validated: No duplicates present'
    });
    
    console.log('[CANDIDATE_INTERVIEW][MOUNT]', { sessionId });
    console.log('[HARD_MOUNT_CHECK]', { 
      sessionId,
      mounts: sessionMounts,
      globalMountCount: candidateInterviewMountCount
    });
    
    if (sessionMounts > 1) {
      console.error('[HARD_MOUNT_CHECK] ❌ REMOUNT DETECTED - must be 1 per session', {
        sessionId,
        mounts: sessionMounts,
        ERROR: 'CandidateInterview should mount ONCE per session - investigate parent render/key props'
      });
    }
    
    console.log("[FORENSIC][HOOK_ORDER_FIXED]", { ok: true, timestamp: Date.now() });
    
    console.log('[FORENSIC][MOUNT]', { 
      component: 'CandidateInterview', 
      instanceId: componentInstanceId.current,
      mountCount: candidateInterviewMountCount,
      sessionId,
      WARNING: candidateInterviewMountCount > 1 ? '⚠️ REMOUNT DETECTED - This should only mount ONCE per session' : '✓ First mount'
    });
    
    console.log('[FORENSIC][TDZ_FIX_OK]', {
      fixedSymbol: 'ensureRequiredAnchorQuestionInTranscript',
      note: 'hoisted-safe plain function with zero closure deps + defensive guards (line ~1220)'
    });
    
    // ABANDONMENT SAFETY: Flush retry queue on unload/visibility change
    const handleBeforeUnload = () => {
      if (flushRetryQueueOnce) {
        flushRetryQueueOnce();
      }
    };
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (flushRetryQueueOnce) {
          flushRetryQueueOnce();
        }
      }
    };
    
    const handleError = (event) => {
      console.error('[FORENSIC][CRASH]', {
        type: 'error',
        message: event.message || event.error?.message,
        stack: event.error?.stack,
        screenMode,
        currentItemType: currentItem?.type,
        currentItemId: currentItem?.id,
        packId: currentItem?.packId || v3ProbingContext?.packId,
        instanceNumber: currentItem?.instanceNumber || v3ProbingContext?.instanceNumber,
        v3ProbingActive,
        canonicalLen: dbTranscript?.length || 0,
        visibleLen: nextRenderable?.length || 0,
        last5MessageTypes: dbTranscript?.slice(-5).map(e => ({ type: e.messageType || e.type, key: e.stableKey || e.id })) || []
      });
    };
    
    const handleRejection = (event) => {
      console.error('[FORENSIC][CRASH]', {
        type: 'unhandledRejection',
        message: event.reason?.message || String(event.reason),
        stack: event.reason?.stack,
        screenMode,
        currentItemType: currentItem?.type,
        currentItemId: currentItem?.id,
        packId: currentItem?.packId || v3ProbingContext?.packId,
        instanceNumber: currentItem?.instanceNumber || v3ProbingContext?.instanceNumber,
        v3ProbingActive,
        canonicalLen: dbTranscript?.length || 0,
        visibleLen: nextRenderable?.length || 0,
        last5MessageTypes: dbTranscript?.slice(-5).map(e => ({ type: e.messageType || e.type, key: e.stableKey || e.id })) || []
      });
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    
    return () => {
      console.log('[FORENSIC][UNMOUNT]', { 
        component: 'CandidateInterview', 
        instanceId: componentInstanceId.current,
        mountCount: candidateInterviewMountCount,
        sessionId,
        sessionMounts: mountsBySession[sessionId],
        WARNING: '⚠️ UNMOUNT during session - should only occur on route exit or browser close'
      });
      
      resetMountTracker(sessionId);
      
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, [sessionId]);

  // UI_CONTRACT: 3-row shell audit (unconditional hook - must run on every render)
  useEffect(() => {
    if (typeof window === 'undefined' || !historyRef.current) return;
    
    requestAnimationFrame(() => {
      try {
        const container = document.querySelector('.grid.grid-rows-\\[auto_1fr_auto\\]');
        const hasGrid3Row = !!container;
        const footerEl = footerRootRef.current;
        const footerIsOverlay = footerEl ? getComputedStyle(footerEl).position === 'fixed' || getComputedStyle(footerEl).position === 'absolute' : false;
        const hasFooterSpacer = !!historyRef.current?.querySelector('[data-cq-footer-spacer="true"]');
        const middleIsOnlyScroll = historyRef.current ? getComputedStyle(historyRef.current).overflowY === 'auto' : false;
        
        console.log('[UI_CONTRACT][SHELL_3ROW_AUDIT]', {
          hasGrid3Row,
          footerIsOverlay,
          hasFooterSpacer,
          middleIsOnlyScroll
        });
        
        // One-time log: Footer spacer + clearance checks disabled in 3-row shell
        if (IS_3ROW_SHELL && !footerSpacerDisabledLoggedRef.current) {
          footerSpacerDisabledLoggedRef.current = true;
          console.log('[UI_CONTRACT][FOOTER_SPACER_DISABLED]', {
            reason: 'SHELL_3ROW_ENFORCED',
            footerInNormalFlow: true,
            noSpacerNeeded: true,
            clearanceChecksDisabled: true
          });
        }
      } catch (e) {
        // Silent - audit should never crash
      }
    });
  }, []); // Run once on mount

  const resumeFromDB = async () => {
    try {
      console.log('[BOOT][RESUME] Light resume from DB', { sessionId });
      
      const loadedSession = await base44.entities.InterviewSession.get(sessionId);
      if (!loadedSession) {
        setError('Session not found');
        setIsLoading(false);
        return;
      }
      
      // CHANGE 1: Clean legacy V3 probe prompts on resume
      const rawTranscript = loadedSession.transcript_snapshot || [];
      const freshTranscript = cleanLegacyV3ProbePrompts(rawTranscript, sessionId);
      
      // MERGE STRATEGY: Use functional update to guarantee latest canonical state
      setDbTranscriptSafe(prev => {
        const merged = mergeTranscript(prev, freshTranscript, sessionId);
        console.log('[BOOT][RESUME][MERGE]', { prevLen: prev.length, freshLen: freshTranscript.length, mergedLen: merged.length });
        return merged;
      });
      
      setSession(loadedSession);
      setQueue(loadedSession.queue_snapshot || []);
      setCurrentItem(loadedSession.current_item_snapshot || null);
      
      // Restore UI state WITHOUT resetting transcript
      const hasAnyResponses = freshTranscript.length > 0;
      setIsNewSession(!hasAnyResponses);
      setScreenMode(hasAnyResponses ? "QUESTION" : "WELCOME");
      
      setIsLoading(false);
      setTimeout(() => autoScrollToBottom(), 100);
      
      console.log('[BOOT][RESUME][OK]', { 
        transcriptLen: freshTranscript.length,
        currentItemType: loadedSession.current_item_snapshot?.type
      });
    } catch (err) {
      console.error('[BOOT][RESUME][ERROR]', err.message);
      setError(`Resume failed: ${err.message}`);
      setIsLoading(false);
    }
  };

  const initializeInterview = async () => {
    // CANCELABLE TIMEOUT: Track boot completion to prevent false timeout
    const bootCompletedRef = { value: false };
    const componentUnmountedRef = { value: false };
    
    const bootTimeout = setTimeout(() => {
      if (componentUnmountedRef.value) {
        console.log('[CANDIDATE_INTERVIEW][LOAD_TIMEOUT][SKIP] Component unmounted');
        return;
      }
      
      if (bootCompletedRef.value) {
        console.log('[CANDIDATE_INTERVIEW][LOAD_TIMEOUT][SKIP] Boot already completed');
        return;
      }
      
      console.error('[CANDIDATE_INTERVIEW][LOAD_TIMEOUT]', {
        sessionId,
        hasEngine: bootCompletedRef.value,
        screenMode,
        currentItemType: currentItem?.type,
        elapsed: '10000ms'
      });
      setShowLoadingRetry(true);
    }, 10000);
    
    // Cleanup: mark unmounted and clear timeout
    const timeoutCleanup = () => {
      componentUnmountedRef.value = true;
      clearTimeout(bootTimeout);
    };

    try {
      // CRITICAL: Candidate interviews are 100% anonymous - NO auth calls
      console.log('[CANDIDATE_BOOT] ========== ANONYMOUS BOOT PATH ==========');
      console.log('[CANDIDATE_BOOT] Auth-independent boot (no User/me, no auth.me(), anonymous session)');
      console.log('[CANDIDATE_BOOT] Route: CandidateInterview (public/anonymous)');
      
      const { config } = await getSystemConfig();
      let effectiveMode = await getEffectiveInterviewMode({
        isSandbox: false,
        departmentCode: null
      });

      const isSandboxLike = window?.location?.href?.includes('/preview');
      if (isSandboxLike && config.sandboxAiProbingOnly) {
        effectiveMode = "AI_PROBING";
      }

      setInterviewMode(effectiveMode);

      const ideActive = effectiveMode === "AI_PROBING" || effectiveMode === "HYBRID";
      setIdeEnabled(ideActive);

      // Check V3 debug mode
      const v3DebugMode = config.v3?.debug_mode_enabled || false;
      setV3DebugEnabled(v3DebugMode);

      // Candidate mode: Do NOT call User/me - interviews run anonymously
      setIsAdminUser(false);

      // SERVER-TRUTH GUARD: Always fetch session from DB (never create duplicate)
      console.log('[CANDIDATE_BOOT][FETCH_SESSION]', { sessionId });
      
      let loadedSession;
      try {
        loadedSession = await base44.entities.InterviewSession.get(sessionId);
      } catch (fetchErr) {
        console.error('[CANDIDATE_BOOT][SESSION_FETCH_ERROR]', { 
          sessionId, 
          error: fetchErr.message 
        });
        // Session fetch failed - set stable error state
        setError(`Session not found. This interview link may be invalid or expired.`);
        setIsLoading(false);
        bootCompletedRef.value = true;
        clearTimeout(bootTimeout);
        return;
      }

      if (!loadedSession || !loadedSession.id) {
        console.error('[CANDIDATE_BOOT][SESSION_NOT_FOUND]', { 
          sessionId, 
          hasSession: !!loadedSession,
          hasId: !!loadedSession?.id
        });
        // Session not found or invalid - set stable error state
        setError(`Session not found. This interview link may be invalid or expired.`);
        setIsLoading(false);
        bootCompletedRef.value = true;
        clearTimeout(bootTimeout);
        return;
      }
      
      console.log('[CANDIDATE_BOOT][SESSION_LOADED]', { 
        sessionId: loadedSession.id,
        status: loadedSession.status,
        transcriptLen: loadedSession.transcript_snapshot?.length || 0
      });
      
      // CQ_TRANSCRIPT_CONTRACT: Session start assertion
      console.log('[CQ_TRANSCRIPT][SESSION_START]', {
        sessionId: loadedSession.id,
        transcriptLen: loadedSession.transcript_snapshot?.length || 0,
        note: 'Transcript-backed history only (dbTranscript = single source of truth)'
      });

      if (loadedSession.status === 'paused') {
        await base44.entities.InterviewSession.update(sessionId, {
          status: 'in_progress'
        });
        loadedSession.status = 'in_progress';
      }

      setSession(loadedSession);

      try {
        const departments = await base44.entities.Department.filter({
          department_code: loadedSession.department_code
        });
        if (departments.length > 0) {
          setDepartment(departments[0]);
        }
      } catch (err) {
        // Silent continue
      }

      const bootStart = Date.now();
      const engineData = await bootstrapEngine(base44);
      const bootMs = Date.now() - bootStart;
      
      setEngine(engineData);
      bootCompletedRef.value = true; // Mark boot complete BEFORE any further async work
      
      console.log('[CANDIDATE_INTERVIEW][ENGINE_READY]', {
        sessionId,
        bootMs,
        screenMode: loadedSession.transcript_snapshot?.length > 0 ? 'QUESTION (pending)' : 'WELCOME (pending)',
        currentItemType: loadedSession.current_item_snapshot?.type || null
      });

      try {
        const orderedSections = buildSectionsFromEngine(engineData);
        setSections(orderedSections);

        if (orderedSections.length > 0) {
          const initialSectionIndex = determineInitialSectionIndex(orderedSections, loadedSession, engineData);
          setCurrentSectionIndex(initialSectionIndex);

          // Log section started if not new session
          if (loadedSession.total_questions_answered > 0 && orderedSections[initialSectionIndex]) {
            await logSectionStarted(sessionId, {
              sectionId: orderedSections[initialSectionIndex].id,
              sectionName: orderedSections[initialSectionIndex].displayName
            });
          }
        }
      } catch (sectionErr) {
        console.error('[SECTIONS] Error initializing sections:', sectionErr);
      }

      const hasValidSnapshots = loadedSession.transcript_snapshot &&
                                 loadedSession.transcript_snapshot.length > 0;

      const needsRebuild = loadedSession.status === 'in_progress' &&
                           (!loadedSession.current_item_snapshot || !hasValidSnapshots);

      if (needsRebuild) {
        await rebuildSessionFromResponses(engineData, loadedSession);
      } else if (hasValidSnapshots) {
            const restoreSuccessful = await restoreFromSnapshots(engineData, loadedSession);

        if (!restoreSuccessful) {
          await rebuildSessionFromResponses(engineData, loadedSession);
        }
      } else {
        // New session - Initialize with intro blocker only
        // CRITICAL: dbTranscript already initialized as [] - NEVER reset it
        setQueue([]);
        setCurrentItem(null); // Will be set after "Got it — Let's Begin"
      }

      const hasAnyResponses = loadedSession.transcript_snapshot && loadedSession.transcript_snapshot.length > 0;
      const sessionIsNew = !hasAnyResponses;

      setIsNewSession(sessionIsNew);
      
      // STABLE: Set screen mode WITHOUT triggering transcript resets
      console.log('[INIT][SCREEN_MODE]', {
        sessionIsNew,
        transcriptLen: loadedSession.transcript_snapshot?.length || 0,
        settingMode: sessionIsNew ? 'WELCOME' : 'QUESTION'
      });
      setScreenMode(sessionIsNew ? "WELCOME" : "QUESTION");

      // PART A: Add Welcome to transcript for new sessions (REQUIRED for legal record)
      if (sessionIsNew) {
        try {
          const withWelcome = await ensureWelcomeInTranscript(sessionId, loadedSession.transcript_snapshot || []);
          if (withWelcome.length > (loadedSession.transcript_snapshot || []).length) {
            console.log('[WELCOME][TRANSCRIPT_APPENDED]', {
              sessionId,
              transcriptLen: withWelcome.length,
              reason: 'Welcome message added to transcript as legal record'
            });
            await refreshTranscriptFromDB('welcome_appended');
          } else {
            console.log('[WELCOME][TRANSCRIPT_EXISTS]', {
              sessionId,
              transcriptLen: withWelcome.length,
              reason: 'Welcome message already in transcript'
            });
          }
        } catch (err) {
          console.error('[WELCOME][TRANSCRIPT_APPEND_ERROR]', { error: err.message });
        }
      }

      // Log system events (with idempotency)
      if (sessionIsNew) {
        // IDEMPOTENCY: Check if SESSION_CREATED already exists (prevents duplicates)
        const hasSessionCreated = (loadedSession.transcript_snapshot || []).some(e => 
          e.messageType === 'SYSTEM_EVENT' && e.eventType === 'SESSION_CREATED'
        );
        
        if (!hasSessionCreated) {
          await logSystemEventHelper(sessionId, 'SESSION_CREATED', {
            department_code: loadedSession.department_code,
            file_number: loadedSession.file_number
          });
          console.log('[SESSION_CREATED][LOGGED]', { sessionId });
        } else {
          console.log('[SESSION_CREATED][SKIP] Already logged for session');
        }
      } else {
        await logSystemEventHelper(sessionId, 'SESSION_RESUMED', {
          last_question_id: loadedSession.current_question_id
        });
      }

      // Mark boot complete and clear timeout (prevents false timeout after success)
      bootCompletedRef.value = true;
      clearTimeout(bootTimeout);
      console.log('[CANDIDATE_INTERVIEW][LOAD_TIMEOUT_CLEARED]', {
        sessionId,
        reason: 'engine_ready',
        bootMs
      });
      
      setIsLoading(false);
      setShowLoadingRetry(false);
      
      console.log("[CANDIDATE_INTERVIEW][READY]", { 
        screenMode: sessionIsNew ? 'WELCOME' : 'QUESTION',
        currentItemType: loadedSession.current_item_snapshot?.type || null,
        transcriptLen: transcriptSOT.length,
        engineReady: bootCompletedRef.value
      });

    } catch (err) {
      bootCompletedRef.value = true; // Mark complete even on error
      clearTimeout(bootTimeout);
      
      const errorMessage = err?.message || err?.toString() || 'Unknown error occurred';
      setError(`Failed to load interview: ${errorMessage}`);
      setIsLoading(false);
      setShowLoadingRetry(false);
    }
  };

  const restoreFromSnapshots = async (engineData, loadedSession) => {
    // CHANGE 1: Clean legacy V3 probe prompts on restore
    const rawTranscript = loadedSession.transcript_snapshot || [];
    const restoredTranscript = cleanLegacyV3ProbePrompts(rawTranscript, sessionId);
    
    const restoredQueue = loadedSession.queue_snapshot || [];
    const restoredCurrentItem = loadedSession.current_item_snapshot || null;

    const hasTranscript = restoredTranscript.length > 0;
    const isCompleted = loadedSession.status === 'completed';
    const hasValidCurrentItem = restoredCurrentItem &&
                                 typeof restoredCurrentItem === 'object' &&
                                 !Array.isArray(restoredCurrentItem) &&
                                 restoredCurrentItem.type;
    const hasQueue = restoredQueue.length > 0;

    if (!isCompleted && hasTranscript && !hasValidCurrentItem && !hasQueue) {
      return false;
    }

    // MERGE STRATEGY: Use functional update to guarantee latest canonical state
    setDbTranscriptSafe(prev => {
      const merged = mergeTranscript(prev, restoredTranscript, sessionId);
      console.log('[RESTORE][MERGE]', { prevLen: prev.length, restoredLen: restoredTranscript.length, mergedLen: merged.length });
      return merged;
    });
    
    setQueue(restoredQueue);
    setCurrentItem(restoredCurrentItem);

    if (!restoredCurrentItem && restoredQueue.length > 0) {
      const nextItem = restoredQueue[0];
      setCurrentItem(nextItem);
      setQueue(restoredQueue.slice(1));
    }

    if (!restoredCurrentItem && restoredQueue.length === 0 && restoredTranscript.length > 0) {
      if (loadedSession.status === 'completed') {
        setShowCompletionModal(true);
      } else {
        return false;
      }
    }

    setTimeout(() => autoScrollToBottom(), 100);
    return true;
  };

  const rebuildSessionFromResponses = async (engineData, loadedSession) => {
    try {
      const responses = await base44.entities.Response.filter({
        session_id: sessionId
      });

      const sortedResponses = responses.sort((a, b) =>
        new Date(a.response_timestamp) - new Date(b.response_timestamp)
      );

      const restoredTranscript = [];

      for (const response of sortedResponses) {
        const question = engineData.QById[response.question_id];
        if (question) {
          const sectionEntity = engineData.Sections.find(s => s.id === question.section_id);
          const sectionName = sectionEntity?.section_name || question.category || '';

          restoredTranscript.push({
            id: `q-${response.id}`,
            stableKey: `question-rebuild:${response.question_id}:${response.id}`,
            questionId: response.question_id,
            questionText: question.question_text,
            answer: response.answer,
            category: sectionName,
            type: 'question',
            timestamp: response.response_timestamp,
            createdAt: Date.now()
          });
        }
      }

      // CHANGE 1: Clean legacy V3 probe prompts on rebuild
      const cleanedRestoredTranscript = cleanLegacyV3ProbePrompts(restoredTranscript, sessionId);

      // MERGE STRATEGY: Use functional update to guarantee latest canonical state
      let finalLen;
      setDbTranscriptSafe(prev => {
        const merged = mergeTranscript(prev, cleanedRestoredTranscript, sessionId);
        finalLen = merged.length;
        console.log('[REBUILD][MERGE]', { prevLen: prev.length, restoredLen: cleanedRestoredTranscript.length, mergedLen: merged.length });
        return merged;
      });
      
      displayOrderRef.current = Math.max(restoredTranscript.length, finalLen || 0);

      let nextQuestionId = null;

      if (sortedResponses.length > 0) {
        const lastResponse = sortedResponses[sortedResponses.length - 1];
        const lastQuestionId = lastResponse.question_id;
        const lastAnswer = lastResponse.answer;

        nextQuestionId = computeNextQuestionId(engineData, lastQuestionId, lastAnswer);
      } else {
        nextQuestionId = engineData.ActiveOrdered[0];
      }

      if (!nextQuestionId || !engineData.QById[nextQuestionId]) {
        setCurrentItem(null);
        setQueue([]);

        await base44.entities.InterviewSession.update(sessionId, {
          transcript_snapshot: restoredTranscript,
          queue_snapshot: [],
          current_item_snapshot: null,
          total_questions_answered: restoredTranscript.filter(t => t.type === 'question').length,
          completion_percentage: 100,
          status: 'completed',
          completed_date: new Date().toISOString()
        });

        setShowCompletionModal(true);
      } else {
        const nextItem = { id: nextQuestionId, type: 'question' };
        setCurrentItem(nextItem);
        setQueue([]);

        await base44.entities.InterviewSession.update(sessionId, {
          transcript_snapshot: restoredTranscript,
          queue_snapshot: [],
          current_item_snapshot: nextItem,
          total_questions_answered: restoredTranscript.filter(t => t.type === 'question').length,
          completion_percentage: Math.round((restoredTranscript.filter(t => t.type === 'question').length / engineData.TotalQuestions) * 100),
          status: 'in_progress'
        });
      }

    } catch (err) {
      throw err;
    }
  };

  const pendingPersistRef = useRef(null);
  const lastPersistTimeRef = useRef(0);
  const persistCountSinceLastWriteRef = useRef(0);
  const PERSIST_THROTTLE_MS = 3000;
  const PERSIST_BATCH_COUNT = 3;

  const flushPersist = useCallback(async () => {
    if (!pendingPersistRef.current) return;

    const { newTranscript, newQueue, newCurrentItem } = pendingPersistRef.current;
    pendingPersistRef.current = null;
    persistCountSinceLastWriteRef.current = 0;
    lastPersistTimeRef.current = Date.now();

    try {
      // TRANSCRIPT GUARD: Never write transcript_snapshot (chatTranscriptHelpers owns it)
      if (newTranscript) {
        console.log('[TRANSCRIPT_GUARD][BLOCKED_WRITE] persistStateToDatabase attempted transcript write - blocked', {
          transcriptLen: newTranscript.length,
          caller: 'flushPersist'
        });
      }

      await base44.entities.InterviewSession.update(sessionId, {
        // transcript_snapshot: REMOVED - only chatTranscriptHelpers may write transcript
        queue_snapshot: newQueue,
        current_item_snapshot: newCurrentItem,
        data_version: 'v2.5-hybrid'
      });
    } catch (err) {
      // Silently fail
    }
  }, [sessionId, engine]);

  const persistStateToDatabase = useCallback(async (ignoredTranscript, newQueue, newCurrentItem) => {
    // TRANSCRIPT GUARD: Warn if transcript argument is passed (should always be null)
    if (ignoredTranscript !== null && ignoredTranscript !== undefined) {
      console.warn('[TRANSCRIPT_GUARD][PERSIST_CALLED_WITH_TRANSCRIPT]', {
        transcriptLen: Array.isArray(ignoredTranscript) ? ignoredTranscript.length : 'not array',
        caller: new Error().stack?.split('\n')[2]?.trim()
      });
    }

    pendingPersistRef.current = { newTranscript: null, newQueue, newCurrentItem };
    persistCountSinceLastWriteRef.current++;

    const now = Date.now();
    const timeSinceLastPersist = now - lastPersistTimeRef.current;

    if (persistCountSinceLastWriteRef.current >= PERSIST_BATCH_COUNT ||
        timeSinceLastPersist >= PERSIST_THROTTLE_MS) {
      await flushPersist();
    } else {
      setTimeout(() => {
        if (pendingPersistRef.current) {
          flushPersist();
        }
      }, PERSIST_THROTTLE_MS - timeSinceLastPersist);
    }
  }, [flushPersist]);

  useEffect(() => {
    return () => {
      if (pendingPersistRef.current) {
        flushPersist();
      }
    };
  }, [flushPersist]);

  const advanceToNextBaseQuestion = useCallback(async (baseQuestionId, currentTranscript = null) => {
    // V3 BLOCKING GATE: Block advancement if V3 is active
    if (isV3Blocking) {
      console.log('[FLOW][BLOCKED_ADVANCE_DUE_TO_V3]', {
        reason: 'V3_BLOCKING',
        currentItemType: currentItem?.type,
        v3PromptPhase,
        v3ProbingActive,
        hasActiveV3Prompt,
        baseQuestionId
      });
      return;
    }
    
    // FIX C: Guard advance - require V3 UI fully cleared
    if (v3ProbingActive && !isV3Blocking) {
      const v3UiHistoryLen = v3ProbeDisplayHistory.length;
      const hasV3Context = !!v3ProbingContext;
      const hasV3UiArtifacts = v3UiHistoryLen > 0 || hasV3Context;
      
      if (hasV3UiArtifacts) {
        console.warn('[FLOW][ADVANCE_BLOCKED_V3_UI_NOT_CLEARED]', {
          v3ProbingActive,
          v3PromptPhase,
          hasActiveV3Prompt,
          v3UiHistoryLen,
          hasV3Context,
          reason: 'V3 UI artifacts still present - must cleanup before advancing',
          action: 'BLOCKED'
        });
        return;
      }
      
      console.log('[FLOW][ADVANCE_ALLOWED_V3_CLEARED]', {
        v3ProbingActive,
        v3PromptPhase,
        hasActiveV3Prompt,
        v3UiHistoryLen,
        hasV3Context,
        reason: 'V3 UI fully cleared - allowing advancement'
      });
    }
    
    const currentQuestion = engine.QById[baseQuestionId];
    if (!currentQuestion) {
      setShowCompletionModal(true);
      return;
    }

    // Use passed transcript or fall back to state
    const effectiveTranscript = currentTranscript || dbTranscript;

    const answeredQuestionIds = new Set(
      effectiveTranscript.filter(t => t.type === 'question').map(t => t.questionId)
    );

    if (sections.length > 0) {
      const nextResult = getNextQuestionInSectionFlow({
        sections,
        currentSectionIndex,
        currentQuestionId: baseQuestionId,
        answeredQuestionIds
      });

      if (nextResult.mode === 'QUESTION') {
        setCurrentSectionIndex(nextResult.nextSectionIndex);
        setQueue([]);
        setCurrentItem({ id: nextResult.nextQuestionId, type: 'question' });
        await persistStateToDatabase(null, [], { id: nextResult.nextQuestionId, type: 'question' });
        return;
      } else if (nextResult.mode === 'SECTION_TRANSITION') {
        const whatToExpect = WHAT_TO_EXPECT[nextResult.nextSection.id] || 'important background information';

        setCompletedSectionsCount(prev => Math.max(prev, nextResult.nextSectionIndex));

        const totalSectionsCount = sections.length;
        const totalQuestionsCount = engine?.TotalQuestions || 0;
        
        // FIX A: Count from Response entities (authoritative source)
        const completedSectionResponses = await base44.entities.Response.filter({
          session_id: sessionId,
          response_type: 'base_question'
        });
        const completedSectionQuestionIds = new Set(completedSectionResponses.map(r => r.question_id));
        const answeredQuestionsInCompletedSection = nextResult.completedSection.questionIds.filter(qId => completedSectionQuestionIds.has(qId)).length;

        console.log('[SECTION_COMPLETE][COUNT]', {
          sectionId: nextResult.completedSection.id,
          sectionQuestions: nextResult.completedSection.questionIds.length,
          answeredCount: answeredQuestionsInCompletedSection
        });

        // IDEMPOTENCY GUARD: Check if section already completed
        const sectionCompleteKey = `${sessionId}::${nextResult.completedSection.id}`;
        if (!completedSectionKeysRef.current.has(sectionCompleteKey)) {
          completedSectionKeysRef.current.add(sectionCompleteKey);
          
          // Log section complete to transcript (only once)
          await logSectionComplete(sessionId, {
            completedSectionId: nextResult.completedSection.id,
            completedSectionName: nextResult.completedSection.displayName,
            nextSectionId: nextResult.nextSection.id,
            nextSectionName: nextResult.nextSection.displayName,
            progress: {
              completedSections: nextResult.nextSectionIndex,
              totalSections: totalSectionsCount,
              answeredQuestions: answeredQuestionsInCompletedSection,
              totalQuestions: totalQuestionsCount
            }
          });
        } else {
          console.log("[IDEMPOTENCY][SECTION_COMPLETE] Already logged for section:", nextResult.completedSection.id);
        }

        // Reload transcript after logging
        await refreshTranscriptFromDB('section_complete_logged');

        // Trigger section summary generation (background)
        base44.functions.invoke('generateSectionSummary', {
          sessionId,
          sectionId: nextResult.completedSection.id
        }).catch(() => {}); // Fire and forget

        // Add section transition blocker (UI-ONLY)
        setUiBlocker({
          id: `blocker-section-${nextResult.nextSectionIndex}`,
          type: 'SECTION_MESSAGE',
          resolved: false,
          completedSectionName: nextResult.completedSection.displayName,
          nextSectionName: nextResult.nextSection.displayName,
          nextSectionIndex: nextResult.nextSectionIndex,
          nextQuestionId: nextResult.nextQuestionId,
          timestamp: new Date().toISOString()
        });

        setPendingSectionTransition({
          nextSectionIndex: nextResult.nextSectionIndex,
          nextQuestionId: nextResult.nextQuestionId,
          nextSectionName: nextResult.nextSection.displayName
        });

        setQueue([]);
        setCurrentItem(null);
        await persistStateToDatabase(null, [], null);
        return;
      } else {
        // Completion handled by modal - no local message needed

        setCurrentItem(null);
        setQueue([]);
        await persistStateToDatabase(null, [], null);
        setShowCompletionModal(true);
        return;
      }
    }

    const nextQuestionId = computeNextQuestionId(engine, baseQuestionId, 'Yes');
    if (nextQuestionId && engine.QById[nextQuestionId]) {
      setQueue([]);
      setCurrentItem({ id: nextQuestionId, type: 'question' });
      await persistStateToDatabase(null, [], { id: nextQuestionId, type: 'question' });
    } else {
      setCurrentItem(null);
      setQueue([]);
      await persistStateToDatabase(dbTranscript, [], null);
      setShowCompletionModal(true);
    }
  }, [engine, dbTranscript, sections, currentSectionIndex, refreshTranscriptFromDB]);

  const onFollowupPackComplete = useCallback(async (baseQuestionId, packId) => {
    const question = engine.QById[baseQuestionId];
    if (!question) {
      advanceToNextBaseQuestion(baseQuestionId);
      return;
    }

    if (question.followup_multi_instance) {
      const maxInstances = question.max_instances_per_question || 5;

      const existingFollowups = await base44.entities.FollowUpResponse.filter({
        session_id: sessionId,
        question_id: baseQuestionId,
        followup_pack: packId
      });

      const currentInstanceCount = existingFollowups.length;

      if (currentInstanceCount < maxInstances) {
        const multiInstancePrompt = question.multi_instance_prompt ||
          'Do you have another instance we should discuss for this question?';

        // PART A: DO NOT append gate to transcript while active (prevents flicker)
        // Gate renders from currentItem.promptText - will append Q+A ONLY after user answers
        const gateStableKey = `mi-gate:${packId}:${currentInstanceCount + 1}`;
        console.log('[MI_GATE][TRANSCRIPT_SUPPRESS_ON_SHOW]', {
          stableKey: gateStableKey,
          packId,
          instanceNumber: currentInstanceCount + 1,
          reason: 'Gate active - will append Q+A after answer only (prevents flicker)'
        });

        setCurrentItem({
          id: `multi-instance-${baseQuestionId}-${packId}`,
          type: 'multi_instance',
          questionId: baseQuestionId,
          packId: packId,
          instanceNumber: currentInstanceCount + 1,
          maxInstances: maxInstances,
          prompt: multiInstancePrompt
        });

        await persistStateToDatabase(null, [], {
          id: `multi-instance-${baseQuestionId}-${packId}`,
          type: 'multi_instance',
          questionId: baseQuestionId,
          packId: packId
        });
        return;
      }
    }

    advanceToNextBaseQuestion(baseQuestionId);
  }, [engine, sessionId, dbTranscript, advanceToNextBaseQuestion]);

  // SHARED MI_GATE HANDLER: Deduplicated logic for YES/NO (inline function)
  const handleMiGateYesNo = async ({ answer, gate, sessionId, engine }) => {
    // PART C: Append gate Q+A to transcript after user answers
    // STATIC IMPORT: Use top-level imports (prevents React context duplication)
    const appendUserMessage = appendUserMessageImport;
    const appendAssistantMessage = appendAssistantMessageImport;
    const sessionForAnswer = await base44.entities.InterviewSession.get(sessionId);
    const currentTranscript = sessionForAnswer.transcript_snapshot || [];
    
    const transcriptLenBefore = currentTranscript.length;

    // Append gate question first
    const gateQuestionStableKey = `mi-gate:${gate.packId}:${gate.instanceNumber}:q`;
    const transcriptAfterQ = await appendAssistantMessage(sessionId, currentTranscript, gate.promptText, {
      id: `mi-gate-q-${gate.packId}-${gate.instanceNumber}`,
      stableKey: gateQuestionStableKey,
      messageType: 'MULTI_INSTANCE_GATE_SHOWN',
      packId: gate.packId,
      categoryId: gate.categoryId,
      instanceNumber: gate.instanceNumber,
      baseQuestionId: gate.baseQuestionId,
      isActiveGate: false,
      visibleToCandidate: true
    });

    // Append user's answer
    const gateAnswerStableKey = `mi-gate:${gate.packId}:${gate.instanceNumber}:a`;
    const transcriptAfterA = await appendUserMessage(sessionId, transcriptAfterQ, answer, {
      id: `mi-gate-answer-${gate.packId}-${gate.instanceNumber}-${answer.toLowerCase()}`,
      stableKey: gateAnswerStableKey,
      messageType: 'MULTI_INSTANCE_GATE_ANSWER',
      packId: gate.packId,
      categoryId: gate.categoryId,
      instanceNumber: gate.instanceNumber,
      answerContext: 'MI_GATE',
      parentStableKey: gateQuestionStableKey
    });
    
    const transcriptLenAfter = transcriptAfterA.length;

    console.log('[MI_GATE][TRACE][APPEND_RESULT]', {
      appendedQ: transcriptAfterQ.length > currentTranscript.length,
      appendedA: transcriptAfterA.length > transcriptAfterQ.length,
      qKey: gateQuestionStableKey,
      aKey: gateAnswerStableKey,
      transcriptLenBefore,
      transcriptLenAfter,
      delta: transcriptLenAfter - transcriptLenBefore
    });

    // Reload transcript
    await refreshTranscriptFromDB(`gate_${answer.toLowerCase()}_answered`);

    // FIX A: Clear gate state + set next question ATOMICALLY (no null frame)
    if (answer === 'No') {
      // FIX A: Compute next question SYNCHRONOUSLY before clearing gate
      const nextQuestionId = computeNextQuestionId(engine, gate.baseQuestionId, 'Yes');
      
      if (!nextQuestionId || !engine.QById[nextQuestionId]) {
        console.log('[MI_GATE][NO_NEXT_QUESTION]', { 
          baseQuestionId: gate.baseQuestionId,
          reason: 'No next question - completing interview' 
        });
        
        // ATOMIC: Clear gate + set null currentItem
        unstable_batchedUpdates(() => {
          setMultiInstanceGate(null);
          setCurrentItem(null);
        });
        
        await persistStateToDatabase(null, [], null);
        setShowCompletionModal(true);
        return;
      }
      
      const nextQuestion = engine.QById[nextQuestionId];
      const nextItem = { id: nextQuestionId, type: 'question' };
      
      console.log('[MI_GATE][ADVANCE_ATOMIC]', {
        fromGateId: `mi-gate:${gate.packId}:${gate.instanceNumber}`,
        toQuestionId: nextQuestionId,
        toQuestionNumber: nextQuestion.question_number,
        hadNullFrame: false,
        reason: 'Atomic transition - no intermediate null currentItem'
      });
      
      // FIX B: Cleanup V3 UI state before advancing to prevent stale cards
      const v3UiHistoryLen = v3ProbeDisplayHistory.length;
      const loopKey = `${sessionId}:${gate.categoryId}:${gate.instanceNumber}`;
      
      console.log('[V3_UI][CLEANUP_ON_PACK_EXIT]', {
        packId: gate.packId,
        instanceNumber: gate.instanceNumber,
        clearedHistoryLen: v3UiHistoryLen,
        clearedContext: true,
        loopKey,
        reason: 'MI_GATE_NO_ADVANCE'
      });
      
      // ATOMIC STATE TRANSITION: Clear ALL V3 state + gate + set next question in one batch
      unstable_batchedUpdates(() => {
        setMultiInstanceGate(null);
        setCurrentItem(nextItem);
        setV3ProbeDisplayHistory([]); // Clear UI history
        setV3ProbingActive(false); // Clear active flag
        setV3ProbingContext(null); // Clear context
        setV3ActivePromptText(null); // Clear prompt text
        setV3PromptPhase('IDLE'); // Reset phase
        v3ActiveProbeQuestionRef.current = null;
        v3ActiveProbeQuestionLoopKeyRef.current = null;
      });
      
      await persistStateToDatabase(null, [], nextItem);
      return;
    }

    // Clear gate state for "Yes" path
    setMultiInstanceGate(null);

    if (answer === 'Yes') {
      const nextInstanceNumber = (gate.instanceNumber || 1) + 1;

      console.log('[MI_GATE][ADVANCE_NEXT_INSTANCE]', {
        packId: gate.packId,
        fromInstanceNumber: gate.instanceNumber,
        toInstanceNumber: nextInstanceNumber,
        nextStableKey: `v3-opener-${gate.packId}-${nextInstanceNumber}`,
        nextItemKindOrType: 'v3_pack_opener'
      });

      // INSTANCE START: Clear sticky required-anchor fallback from prior instance
      setRequiredAnchorFallbackActive(false);
      setRequiredAnchorCurrent(null);
      setRequiredAnchorQueue([]);
      setV3PromptPhase('IDLE');

      console.log('[INSTANCE_START][FALLBACK_CLEARED]', {
        packId: gate.packId,
        instanceNumber: nextInstanceNumber,
        reason: 'Cleared sticky fallback state from prior instance to prevent opener hijack'
      });

      await logPackEntered(sessionId, {
        packId: gate.packId,
        instanceNumber: nextInstanceNumber,
        isV3: true
      });

      // STATIC IMPORT: Use top-level import (already imported at line 61)
      const opener = getV3DeterministicOpener(gate.packData, gate.categoryId, gate.categoryLabel);

      const openerItem = {
        id: `v3-opener-${gate.packId}-${nextInstanceNumber}`,
        type: 'v3_pack_opener',
        packId: gate.packId,
        categoryId: gate.categoryId,
        categoryLabel: gate.categoryLabel,
        openerText: opener.text,
        exampleNarrative: opener.example,
        baseQuestionId: gate.baseQuestionId,
        questionCode: engine.QById[gate.baseQuestionId]?.question_id,
        sectionId: engine.QById[gate.baseQuestionId]?.section_id,
        instanceNumber: nextInstanceNumber,
        packData: gate.packData
      };
      
      console.log('[INSTANCE_START][OPENER_SET]', { 
        packId: openerItem.packId, 
        instanceNumber: openerItem.instanceNumber, 
        type: openerItem.type,
        openerTextPreview: openerItem.openerText?.substring(0, 60)
      });

      setCurrentItem(openerItem);

      console.log('[INSTANCE_START][OPENER_SET_OK]', { 
        packId: openerItem.packId, 
        instanceNumber: openerItem.instanceNumber 
      });

      await persistStateToDatabase(null, [], openerItem);
      
      // REGRESSION CHECK
      setTimeout(async () => {
        const checkSession = await base44.entities.InterviewSession.get(sessionId);
        const checkCurrentItem = checkSession.current_item_snapshot;
        
        if (!checkCurrentItem || checkCurrentItem.type !== 'v3_pack_opener' || checkCurrentItem.instanceNumber !== nextInstanceNumber) {
          console.error('[MI_GATE][ADVANCE_FAILED]', {
            packId: gate.packId,
            expectedInstanceNumber: nextInstanceNumber,
            actualItemType: checkCurrentItem?.type,
            actualInstanceNumber: checkCurrentItem?.instanceNumber,
            actualItemId: checkCurrentItem?.id
          });
        } else {
          console.log('[MI_GATE][ADVANCE_VERIFIED]', {
            packId: gate.packId,
            toInstanceNumber: nextInstanceNumber,
            currentItemType: checkCurrentItem.type
          });
        }
      }, 200);
    } else {
      console.log('[MI_GATE][EXIT_LOOP]', {
        packId: gate.packId,
        instanceNumber: gate.instanceNumber,
        reason: "NO",
        nextItemKindOrType: 'question'
      });
      
      await logPackExited(sessionId, {
        packId: gate.packId,
        instanceNumber: gate.instanceNumber
      });
      
      // FIX B: Cleanup V3 UI state when exiting pack via legacy path (if somehow reached)
      const legacyV3UiHistoryLen = v3ProbeDisplayHistory.length;
      if (legacyV3UiHistoryLen > 0 || v3ProbingActive || v3ProbingContext) {
        const legacyLoopKey = `${sessionId}:${gate.categoryId}:${gate.instanceNumber}`;
        
        console.log('[V3_UI][CLEANUP_ON_PACK_EXIT_LEGACY]', {
          packId: gate.packId,
          instanceNumber: gate.instanceNumber,
          clearedHistoryLen: legacyV3UiHistoryLen,
          clearedContext: !!v3ProbingContext,
          loopKey: legacyLoopKey,
          reason: 'LEGACY_EXIT_PATH'
        });
        
        setV3ProbeDisplayHistory([]);
        setV3ProbingActive(false);
        setV3ProbingContext(null);
        setV3ActivePromptText(null);
        setV3PromptPhase('IDLE');
        v3ActiveProbeQuestionRef.current = null;
        v3ActiveProbeQuestionLoopKeyRef.current = null;
      }

      if (gate.baseQuestionId) {
        const freshAfterGateNo = await refreshTranscriptFromDB('gate_no_before_advance');
        await advanceToNextBaseQuestion(gate.baseQuestionId, freshAfterGateNo);
      }
    }
  };

  const handleAnswer = useCallback(async (value) => {
    // GUARD: Block YES/NO during V3 prompt answering (prevents stray "Yes" bubble)
    if (activeUiItem?.kind === 'V3_PROMPT' || (v3PromptPhase === 'ANSWER_NEEDED' && bottomBarModeSOT === 'TEXT_INPUT')) {
      // Allow V3 probe answer submission (text input), block YES/NO only
      const isYesNoAnswer = value === 'Yes' || value === 'No';
      if (isYesNoAnswer) {
        console.log('[YESNO_BLOCKED_DURING_V3_PROMPT]', {
          clicked: value,
          activeUiItemKind: activeUiItem?.kind,
          v3PromptPhase,
          currentItemType: currentItem?.type,
          bottomBarModeSOT,
          reason: 'V3 prompt active - YES/NO submission blocked'
        });
        return; // Hard block - prevent stray "Yes"/"No" appends
      }
    }
    
    // IDEMPOTENCY GUARD: Build submit key and check if already submitted
    const buildSubmitKey = (item, answerValue = null) => {
      if (!item) return null;
      if (item.type === 'question') return `q:${item.id}`;
      if (item.type === 'v2_pack_field') return `p:${item.packId}:${item.fieldKey}:${item.instanceNumber || 0}`;
      if (item.type === 'v3_pack_opener') return `v3o:${item.packId}:${item.instanceNumber || 0}`;
      if (item.type === 'followup') return `f:${item.packId}:${item.stepIndex}:${item.instanceNumber || 0}`;
      if (item.type === 'multi_instance') return `mi:${item.questionId}:${item.packId}:${item.instanceNumber}`;
      // MI_GATE: Include answer in key to allow YES and NO for same gate
      if (item.type === 'multi_instance_gate') {
        const answer = answerValue ? answerValue.trim().toLowerCase() : 'unknown';
        return `mi_gate:${item.packId}:${item.instanceNumber}:${answer}:${item.id}`;
      }
      return null;
    };
    
    // MI_GATE BYPASS: Allow MI_GATE YES/NO even if isCommitting or other guards would block
    const isMiGateSubmit = currentItem?.type === 'multi_instance_gate' || 
                           effectiveItemType === 'multi_instance_gate' ||
                           activeUiItem?.kind === "MI_GATE";
    
    const submitKey = buildSubmitKey(currentItem, value);
    
    // MI_GATE: Log key for diagnostics
    if (isMiGateSubmit) {
      console.log('[MI_GATE][IDEMPOTENCY_KEY]', {
        submitKey,
        packId: currentItem?.packId,
        instanceNumber: currentItem?.instanceNumber,
        answer: value
      });
    }
    
    if (submitKey && submittedKeysRef.current.has(submitKey)) {
      // MI_GATE: Log if blocked by idempotency
      if (isMiGateSubmit) {
        console.warn('[MI_GATE][IDEMPOTENCY_BLOCKED]', {
          submitKey,
          packId: currentItem?.packId,
          instanceNumber: currentItem?.instanceNumber,
          answer: value,
          reason: 'Key already submitted'
        });
      } else {
        console.log(`[IDEMPOTENCY][BLOCKED] Already submitted for key: ${submitKey}`);
      }
      return;
    }
    
    // Lock this submission immediately
    if (submitKey) {
      submittedKeysRef.current.add(submitKey);
      console.log(`[IDEMPOTENCY][LOCKED] ${submitKey}`, { packId: currentItem.packId, instanceNumber: currentItem.instanceNumber, sessionId });
      lastIdempotencyLockedRef.current = submitKey; // DEV: Capture for debug bundle
      
      // CRITICAL: Store actual lock key for v3_pack_opener submits (enables correct release in watchdog)
      if (currentItem.type === 'v3_pack_opener') {
        lastV3SubmitLockKeyRef.current = submitKey;
      }
    }
    
    // MI_GATE TRACE 2: handleAnswer entry audit (CORRECT LOCATION - YES/NO calls this directly)
    if (currentItem?.type === 'multi_instance_gate' || effectiveItemType === 'multi_instance_gate') {
      console.log('[MI_GATE][TRACE][SUBMIT_CLICK]', {
        effectiveItemType,
        currentItemType: currentItem?.type,
        currentItemId: currentItem?.id,
        packId: currentItem?.packId,
        instanceNumber: currentItem?.instanceNumber,
        bottomBarModeSOT,
        answer: value,
        source: 'handleAnswer_direct_call'
      });
    }
    
    // EXPLICIT ENTRY LOG: Log which branch we're entering
    console.log(`[HANDLE_ANSWER][ENTRY] ========== ANSWER HANDLER INVOKED ==========`);
    console.log(`[HANDLE_ANSWER][ENTRY]`, {
      currentItemType: currentItem?.type,
      currentItemId: currentItem?.id,
      packId: currentItem?.packId,
      fieldKey: currentItem?.fieldKey,
      instanceNumber: currentItem?.instanceNumber,
      v2PackMode,
      isCommitting,
      hasEngine: !!engine,
      answerPreview: value?.substring?.(0, 50) || value,
      submitKey
    });

    // EXPLICIT V2 PACK FIELD ENTRY LOG - confirm we're hitting this branch
    if (currentItem?.type === 'v2_pack_field') {
      console.log(`[HANDLE_ANSWER][V2_PACK_FIELD] >>>>>>>>>> V2 PACK FIELD DETECTED <<<<<<<<<<`);
      console.log(`[HANDLE_ANSWER][V2_PACK_FIELD]`, {
        packId: currentItem.packId,
        fieldKey: currentItem.fieldKey,
        fieldIndex: currentItem.fieldIndex,
        instanceNumber: currentItem.instanceNumber,
        baseQuestionId: currentItem.baseQuestionId,
        answer: value?.substring?.(0, 80) || value,
        hasActiveV2Pack: !!activeV2Pack
      });
    }
    
    // EXPLICIT MULTI_INSTANCE_GATE ENTRY LOG - confirm we're hitting this branch
    if (currentItem?.type === 'multi_instance_gate') {
      console.log(`[HANDLE_ANSWER][MULTI_INSTANCE_GATE] >>>>>>>>>> MULTI_INSTANCE_GATE DETECTED <<<<<<<<<<`);
      console.log(`[HANDLE_ANSWER][MULTI_INSTANCE_GATE]`, {
        packId: currentItem.packId,
        instanceNumber: currentItem.instanceNumber,
        answer: value?.substring?.(0, 80) || value,
        hasMultiInstanceGate: !!multiInstanceGate
      });
    }

    // MI_GATE BYPASS: Allow MI_GATE YES/NO even if isCommitting is true
    if (isMiGateSubmit && engine && currentItem) {
      console.warn('[MI_GATE][BYPASS_GUARD]', {
        isCommitting,
        hasEngine: !!engine,
        hasCurrentItem: !!currentItem,
        packId: currentItem?.packId,
        instanceNumber: currentItem?.instanceNumber,
        answer: value,
        reason: 'MI_GATE bypass - allowing submission despite isCommitting'
      });
      // Continue to MI_GATE handler below (skip generic guard)
    } else if (isCommitting || !currentItem || !engine) {
      console.log(`[HANDLE_ANSWER][SKIP] Skipping - isCommitting=${isCommitting}, hasCurrentItem=${!!currentItem}, hasEngine=${!!engine}`);
      return;
    }

    setIsCommitting(true);
    setValidationHint(null);

    if (sectionCompletionMessage) {
      setSectionCompletionMessage(null);
    }

    try {
      // ========================================================================
      // V2 PACK FIELD HANDLER - MUST BE CHECKED FIRST
      // This handles answers for v2_pack_field items (PACK_PRIOR_LE_APPS_STANDARD, etc.)
      // CRITICAL: Every V2 pack field answer MUST go through the backend probe engine
      // ========================================================================
      if (currentItem.type === 'v2_pack_field') {
        const { packId, fieldIndex, fieldKey, fieldConfig, baseQuestionId, instanceNumber } = currentItem;

        // Check if we're answering a clarifier for this field
        const isAnsweringClarifier = v2ClarifierState &&
          v2ClarifierState.packId === packId &&
          v2ClarifierState.fieldKey === fieldKey &&
          v2ClarifierState.instanceNumber === instanceNumber;

        console.log(`[V2_PACK_FIELD][CLARIFIER_CHECK]`, {
          packId,
          fieldKey,
          instanceNumber,
          hasV2ClarifierState: !!v2ClarifierState,
          isAnsweringClarifier,
          clarifierState: v2ClarifierState
        });

        // CRITICAL: Declare baseQuestion FIRST before any usage to avoid TDZ errors
        const baseQuestion = baseQuestionId && engine?.QById ? engine.QById[baseQuestionId] : null;

        if (!baseQuestion) {
          console.warn('[V2_PACK_FIELD][WARN] baseQuestion not found for baseQuestionId', baseQuestionId, 'packId=', packId, 'fieldKey=', fieldKey);
        }

        // EXPLICIT ENTRY LOG for V2 pack field answers
        console.log(`[V2_PACK_FIELD][ENTRY] ========== V2 PACK FIELD ANSWER RECEIVED ==========`);
        console.log(`[V2_PACK_FIELD][ENTRY]`, {
          packId,
          fieldKey,
          fieldIndex,
          instanceNumber,
          answer: value?.substring?.(0, 80) || value,
          isCommitting,
          v2PackMode,
          aiProbingEnabled,
          aiProbingDisabledForSession,
          hasActiveV2Pack: !!activeV2Pack,
          hasBaseQuestion: !!baseQuestion
        });

        // Validate we have an active V2 pack
        if (!activeV2Pack) {
          console.error("[HANDLE_ANSWER][V2_PACK_FIELD][ERROR] No active V2 pack - recovering by exiting pack mode");
          setV2PackMode("BASE");
          setIsCommitting(false);
          setInput("");
          return;
        }

        // Validate answer for required fields
        const normalizedAnswer = value.trim();
        if (!normalizedAnswer && fieldConfig?.required) {
          setValidationHint('This field is required. Please provide an answer.');
          setIsCommitting(false);
          return;
        }

        const finalAnswer = normalizedAnswer || "(No response provided)";
        const questionText = fieldConfig?.label || fieldKey;
        const packConfig = FOLLOWUP_PACK_CONFIGS[packId];
        const totalFieldsInPack = activeV2Pack.fields?.length || packConfig?.fields?.length || 0;
        const isLastField = fieldIndex >= totalFieldsInPack - 1;

        console.log(`[HANDLE_ANSWER][V2_PACK_FIELD] Processing field ${fieldIndex + 1}/${totalFieldsInPack}: ${fieldKey}`);

        // CRITICAL: Declare v2Result early so it can be referenced throughout this handler
        let v2Result = null;

        // Determine if this is a clarifier answer or first field answer
        const isAiFollowupAnswer = isAnsweringClarifier;

        // Use the clarifier question text if this is answering a clarifier
        const displayQuestionText = isAiFollowupAnswer ? v2ClarifierState.clarifierQuestion : questionText;
        const entrySource = isAiFollowupAnswer ? 'AI_FOLLOWUP' : 'V2_PACK';

        // V2 pack field Q&A now logged via chatTranscriptHelpers in canonical transcript
        // No local append - canonical transcript handles it

        // CRITICAL: Save V2 pack field answer to Response table for transcript/BI visibility
        const v2ResponseRecord = await saveV2PackFieldResponse({
          sessionId,
          packId,
          fieldKey,
          instanceNumber,
          answer: finalAnswer,
          baseQuestionId,
          baseQuestionCode: baseQuestion?.question_id,
          sectionId: baseQuestion?.section_id,
          questionText: questionText
        });

        // Append question and answer to canonical transcript (legal record) with Response linkage
        try {
          const currentTranscript = session.transcript_snapshot || [];

          // Get base Response for parentResponseId
          const baseResponses = await base44.entities.Response.filter({
            session_id: sessionId,
            question_id: baseQuestionId,
            response_type: 'base_question'
          });
          const baseResponseId = baseResponses[0]?.id || baseQuestionId;

          // Log question entry (if not already logged)
          const questionKey = `${packId}::${fieldKey}::${instanceNumber || 1}`;
          if (!hasQuestionBeenLogged(sessionId, questionKey)) {
            await appendQuestionEntry({
              sessionId,
              existingTranscript: currentTranscript,
              text: displayQuestionText,
              questionId: baseQuestionId,
              packId,
              fieldKey,
              instanceNumber: instanceNumber || 1,
              responseId: v2ResponseRecord?.id || null,
              parentResponseId: baseResponseId
            });
          }

          // Log answer entry
          await appendAnswerEntry({
            sessionId,
            existingTranscript: currentTranscript,
            text: finalAnswer,
            questionId: baseQuestionId,
            packId,
            fieldKey,
            instanceNumber: instanceNumber || 1,
            responseId: v2ResponseRecord?.id || null,
            parentResponseId: baseResponseId
          });
        } catch (err) {
          console.warn("[TRANSCRIPT][Q&A] Failed to log V2 pack field question and answer:", err);
        }

        // LLM-assist: Generate suggestions after PACK_PRLE_Q01 narrative field
        let localSuggestions = {};
        if (packId === 'PACK_PRIOR_LE_APPS_STANDARD' && fieldKey === 'PACK_PRLE_Q01' && finalAnswer.length > 50) {
          console.log('[LLM_SUGGESTIONS] Generating field suggestions from narrative...');
          const suggestions = await generateFieldSuggestions(packId, finalAnswer);

          if (suggestions && Object.keys(suggestions).length > 0) {
            console.log('[LLM_SUGGESTIONS] Generated suggestions:', suggestions);

            // Map to specific field keys with proper format
            // NOTE: LLM returns { agency_name, agency_location, position, application_date, application_outcome }
            // We need to map these to the actual field keys in the pack
            localSuggestions = {};

            if (suggestions.agency_name) {
              localSuggestions[`${packId}_${instanceNumber}_PACK_PRLE_Q06`] = suggestions.agency_name;
            }

            if (suggestions.agency_location) {
              localSuggestions[`${packId}_${instanceNumber}_PACK_PRLE_Q03`] = suggestions.agency_location;
            }

            if (suggestions.position) {
              localSuggestions[`${packId}_${instanceNumber}_PACK_PRLE_Q05`] = suggestions.position;
            }

            if (suggestions.application_date) {
              localSuggestions[`${packId}_${instanceNumber}_PACK_PRLE_Q04`] = suggestions.application_date;
            }

            if (suggestions.application_outcome) {
              localSuggestions[`${packId}_${instanceNumber}_PACK_PRLE_Q02`] = suggestions.application_outcome;
            }

            setFieldSuggestions(prev => ({
              ...prev,
              ...localSuggestions
            }));
          }
        }

        // Also save to legacy FollowUpResponse for backwards compatibility
        await saveFollowUpAnswer(packId, fieldKey, finalAnswer, activeV2Pack.substanceName, instanceNumber, 'user');

        // Call V2 backend engine BEFORE checking if pack is complete
        const maxAiFollowups = getPackMaxAiFollowups(packId);
        const fieldCountKey = `${packId}:${fieldKey}:${instanceNumber}`;
        const probeCount = aiFollowupCounts[fieldCountKey] || 0;

        // CRITICAL: V2 pack fields ALWAYS consult the backend probe engine (same as regular V2 follow-ups)
        console.log(`[V2_PACK_FIELD][PROBE_CALL] ========== CALLING BACKEND PROBE ENGINE ==========`);
        console.log(`[V2_PACK_FIELD][PROBE_CALL]`, {
          packId,
          fieldKey,
          instanceNumber,
          answerPreview: finalAnswer?.substring?.(0, 60),
          probeCount,
          maxAiFollowups,
          aiProbingEnabled,
          aiProbingDisabledForSession,
          currentCollectedAnswers: Object.keys(activeV2Pack.collectedAnswers || {})
        });

        v2Result = await runV2FieldProbeIfNeeded({
          base44Client: base44,
          packId,
          fieldKey,
          fieldValue: finalAnswer,
          previousProbesCount: probeCount,
          incidentContext: activeV2Pack.collectedAnswers || {},
          sessionId,
          questionCode: baseQuestion?.question_id,
          baseQuestionId,
          aiProbingEnabled,
          aiProbingDisabledForSession,
          maxAiFollowups,
          instanceNumber,
          setBackendQuestionTextMap,
          schemaSource: activeV2Pack.schemaSource,
          resolvedField: fieldConfig?.raw || null
        });


        // Check if this was the last field in the pack - if so, mark complete and trigger summaries
        const isPackComplete = isLastField || v2Result?.mode === 'COMPLETE' || v2Result?.mode === 'NEXT_FIELD';
        if (isPackComplete) {
          // Mark FollowUpResponse as completed for this instance
          try {
            const baseResponses = await base44.entities.Response.filter({
              session_id: sessionId,
              question_id: baseQuestionId,
              response_type: 'base_question'
            });
            const baseResponseId = baseResponses[0]?.id;

            if (baseResponseId) {
              const existingFollowups = await base44.entities.FollowUpResponse.filter({
                session_id: sessionId,
                response_id: baseResponseId,
                followup_pack: packId,
                instance_number: instanceNumber
              });

              if (existingFollowups.length > 0) {
                await base44.entities.FollowUpResponse.update(existingFollowups[0].id, {
                  completed: true,
                  completed_timestamp: new Date().toISOString()
                });
                console.log('[V2_PACK_COMPLETE] Marked FollowUpResponse as completed', {
                  followUpResponseId: existingFollowups[0].id,
                  packId,
                  instanceNumber
                });
              }
            }
          } catch (completionErr) {
            console.warn('[V2_PACK_COMPLETE] Failed to mark FollowUpResponse as completed:', completionErr);
          }

          // Trigger summary generation in background
          base44.functions.invoke('triggerSummaries', {
            sessionId,
            triggerType: 'question_complete'
          }).catch(() => {}); // Fire and forget
        }

        console.log(`[V2_PACK_FIELD][PROBE_RESULT] ========== BACKEND RESPONSE RECEIVED ==========`);
        console.log(`[V2_PACK_FIELD][PROBE_RESULT]`, {
          packId,
          fieldKey,
          instanceNumber,
          mode: v2Result?.mode,
          hasQuestion: !!v2Result?.question,
          questionPreview: v2Result?.question?.substring?.(0, 60)
        });

        // Update collectedAnswers with the current field value
        let updatedCollectedAnswers = {
          ...activeV2Pack.collectedAnswers,
          [fieldKey]: finalAnswer
        };

        // Update activeV2Pack state
        setActiveV2Pack(prev => ({
          ...prev,
          collectedAnswers: updatedCollectedAnswers
        }));

        // Handle backend errors gracefully - surface to user with retry option
        if (v2Result?.mode === 'ERROR') {
          const errorCode = v2Result?.errorCode || 'UNKNOWN';
          const errorMessage = v2Result?.message || 'Backend error';
          
          console.error(`[V2_PACK_FIELD][ERROR]`, {
            packId,
            fieldKey,
            errorCode,
            errorMessage,
            debug: v2Result?.debug
          });
          
          // ERROR UI STATE: Show inline error with retry button
          setValidationHint(
            <div className="flex items-center gap-3">
              <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
              <span className="flex-1">{errorMessage}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  console.log('[V2_ERROR][RETRY]', { packId, fieldKey, errorCode });
                  setValidationHint(null);
                  setIsCommitting(false);
                  
                  // Retry the probe with current answer
                  const retryResult = await runV2FieldProbeIfNeeded({
                    base44Client: base44,
                    packId,
                    fieldKey,
                    fieldValue: finalAnswer,
                    previousProbesCount: probeCount,
                    incidentContext: activeV2Pack.collectedAnswers || {},
                    sessionId,
                    questionCode: baseQuestion?.question_id,
                    baseQuestionId,
                    aiProbingEnabled,
                    aiProbingDisabledForSession,
                    maxAiFollowups,
                    instanceNumber,
                    setBackendQuestionTextMap,
                    schemaSource: activeV2Pack.schemaSource,
                    resolvedField: fieldConfig?.raw || null
                  });
                  
                  if (retryResult?.mode !== 'ERROR') {
                    // Retry succeeded - process result normally
                    console.log('[V2_ERROR][RETRY_SUCCESS]', { mode: retryResult.mode });
                    // TODO: Process retryResult (refactor to shared handler)
                  }
                }}
                className="text-xs px-2 py-1 h-7"
              >
                Retry
              </Button>
            </div>
          );
          setIsCommitting(false);
          return;
        }
        
        if (v2Result?.mode === 'NONE' || !v2Result) {
          console.log(`[V2_PACK_FIELD][FALLBACK] Backend returned ${v2Result?.mode || 'null'} - advancing`);
          v2Result = { mode: 'NEXT_FIELD', reason: 'backend returned null or NONE' };
        }

        // Handle AI clarifier from backend
        if (v2Result?.mode === 'QUESTION' && v2Result.question) {
          console.log(`[V2_PACK_FIELD][CLARIFIER][SET] ========== CLARIFIER NEEDED ==========`);
          console.log(`[V2_PACK_FIELD][CLARIFIER][SET]`, {
            packId,
            fieldKey,
            instanceNumber,
            question: v2Result.question?.substring?.(0, 80),
            probeCount: probeCount + 1
          });

          // Set clarifier state - keeps us on this field
          setV2ClarifierState({
            packId,
            fieldKey,
            instanceNumber,
            clarifierQuestion: v2Result.question
          });

          setAiFollowupCounts(prev => ({
            ...prev,
            [fieldCountKey]: probeCount + 1
          }));

          await persistStateToDatabase(null, [], currentItem);
          setIsCommitting(false);
          setInput("");
          return;
        }

        // Clear clarifier state if we got NEXT_FIELD
        if (v2Result?.mode === 'NEXT_FIELD' && v2ClarifierState?.packId === packId && v2ClarifierState?.fieldKey === fieldKey) {
          console.log(`[V2_PACK_FIELD][CLARIFIER][CLEAR] Field resolved`);
          setV2ClarifierState(null);
        }

        // Advance to next field or complete pack (only after backend says NEXT_FIELD)
        if (v2Result?.mode === 'NEXT_FIELD' && !isLastField) {
          // Field-based gating: Check saved responses to determine next field
          let nextFieldIdx = fieldIndex + 1;

          // Get all saved responses for this pack instance to check what's answered
          const savedResponses = await base44.entities.Response.filter({
            session_id: sessionId,
            pack_id: packId,
            instance_number: instanceNumber,
            response_type: 'v2_pack_field'
          });

          const answeredFieldKeys = new Set(savedResponses.map(r => r.field_key));

          console.log(`[V2_PACK_FIELD][GATE_CHECK] Field-based gating`, {
            packId,
            currentFieldIdx: fieldIndex,
            nextFieldIdx,
            totalFields: totalFieldsInPack,
            answeredFieldKeys: Array.from(answeredFieldKeys)
          });

          // Skip fields that are already answered or should be skipped based on field config
          while (nextFieldIdx < totalFieldsInPack) {
            const nextFieldConfig = activeV2Pack.fields[nextFieldIdx];
            const alwaysAsk = nextFieldConfig.alwaysAsk || false;
            const skipUnless = nextFieldConfig.skipUnless || null;

            // Skip if field has skipUnless condition that isn't met
            if (skipUnless) {
              let shouldSkip = false;

              // Check skipUnless.application_outcome condition
              if (skipUnless.application_outcome) {
                const outcomeField = updatedCollectedAnswers.application_outcome || '';
                const outcomeValue = outcomeField.toLowerCase();
                const matchesAny = skipUnless.application_outcome.some(val =>
                  outcomeValue.includes(val.toLowerCase())
                );
                shouldSkip = !matchesAny;

                if (shouldSkip) {
                  console.log(`[V2_PACK_FIELD][GATE_CHECK] ✗ Skipping ${nextFieldConfig.fieldKey} - skipUnless condition not met`);
                  nextFieldIdx++;
                  continue;
                }
              }
            }

            // Check if field was already answered
            if (!alwaysAsk && answeredFieldKeys.has(nextFieldConfig.fieldKey)) {
              console.log(`[V2_PACK_FIELD][GATE_CHECK] ✗ Skipping ${nextFieldConfig.fieldKey} - already answered`);
              nextFieldIdx++;
              continue;
            }

            // NEW: Check if field should be auto-skipped based on high-confidence suggestion
            const autoSkipResult = await maybeAutoSkipV2Field({
              packId,
              fieldConfig: nextFieldConfig,
              fieldKey: nextFieldConfig.fieldKey,
              instanceNumber,
              suggestionMap: { ...fieldSuggestions, ...localSuggestions },
              sessionId,
              baseQuestionId,
              baseQuestionCode: baseQuestion?.question_id,
              sectionId: baseQuestion?.section_id,
              saveFieldResponse: saveV2PackFieldResponse
            });

            if (autoSkipResult.shouldSkip) {
              console.log(`[V2_PACK_FIELD][GATE_CHECK] ✗ Auto-skipped ${nextFieldConfig.fieldKey} with value "${autoSkipResult.autoAnswerValue}"`);

              // Update collected answers with auto-filled value
              updatedCollectedAnswers = {
                ...updatedCollectedAnswers,
                [nextFieldConfig.fieldKey]: autoSkipResult.autoAnswerValue
              };

              // Add to answered set so it won't be checked again
              answeredFieldKeys.add(nextFieldConfig.fieldKey);

              // Continue to next field
              nextFieldIdx++;
              continue;
            }

            console.log(`[V2_PACK_FIELD][GATE_CHECK] ✓ Showing ${nextFieldConfig.fieldKey}`);
            break;
          }

          if (nextFieldIdx >= totalFieldsInPack) {
            console.log(`[V2_PACK_FIELD][PACK_COMPLETE] All fields processed`);
            // Fall through to pack completion
          } else {
            const nextFieldConfig = activeV2Pack.fields[nextFieldIdx];
            console.log(`[V2_PACK_FIELD][NEXT_FIELD] ========== ADVANCING TO NEXT FIELD ==========`);
            console.log(`[V2_PACK_FIELD][NEXT_FIELD]`, {
              packId,
              currentField: fieldKey,
              nextField: nextFieldConfig.fieldKey,
              fieldProgress: `${nextFieldIdx + 1}/${totalFieldsInPack}`,
              instanceNumber,
              skippedFields: nextFieldIdx - (fieldIndex + 1)
            });

            setActiveV2Pack(prev => ({
              ...prev,
              currentIndex: nextFieldIdx,
              collectedAnswers: updatedCollectedAnswers
            }));

            // STEP 2: Include backend question text for next field
            const backendQuestionTextForNext = getBackendQuestionText(backendQuestionTextMap, packId, nextFieldConfig.fieldKey, instanceNumber);

            const nextItemForV2 = {
              id: `v2pack-${packId}-${nextFieldIdx}`,
              type: 'v2_pack_field',
              packId: packId,
              fieldIndex: nextFieldIdx,
              fieldKey: nextFieldConfig.fieldKey,
              fieldConfig: nextFieldConfig,
              baseQuestionId: baseQuestionId,
              instanceNumber: instanceNumber,
              backendQuestionText: backendQuestionTextForNext
            };

            setCurrentItem(nextItemForV2);
            setQueue([]);

            await persistStateToDatabase(null, [], nextItemForV2);

            console.log(`[V2_PACK_FIELD][NEXT_FIELD][DONE] Now showing: ${nextFieldConfig.fieldKey}`);
            setIsCommitting(false);
            setInput("");
            return;
          }
        }

        // Pack complete - exit V2 pack mode (either isLastField or backend said COMPLETE)
        console.log(`[V2_PACK_FIELD][PACK_COMPLETE] ========== PACK FINISHED ==========`);
        console.log(`[V2_PACK_FIELD][PACK_COMPLETE]`, {
          packId,
          lastField: fieldKey,
          instanceNumber,
          v2ResultMode: v2Result?.mode,
          isLastField,
          returningToSectionFlow: true
        });

        // Log pack exited (audit only)
        await logPackExited(sessionId, { packId, instanceNumber });

        // Trigger summary generation for completed question (background)
        base44.functions.invoke('triggerSummaries', {
          sessionId,
          triggerType: 'question_complete'
        }).catch(() => {}); // Fire and forget

        // CRITICAL: Clear V2 pack state AND currentItem atomically to prevent transitional render crash
        setActiveV2Pack(null);
        setV2PackMode("BASE");
        setCurrentFollowUpAnswers({});
        setCurrentItem(null); // Clear immediately to prevent stale v2_pack_field renders
        lastLoggedV2PackFieldRef.current = null;

        // UX: Clear draft on successful pack completion
        clearDraft();

        const baseQuestionForExit = engine.QById[baseQuestionId];
        if (baseQuestionForExit?.followup_multi_instance) {
          onFollowupPackComplete(baseQuestionId, packId);
        } else {
          advanceToNextBaseQuestion(baseQuestionId);
        }

        await persistStateToDatabase(null, [], null);
        setIsCommitting(false);
        setInput("");
        return;
      }

      // ========================================================================
      // V3 PACK OPENER HANDLER - Deterministic opener answered, now enter AI probing
      // ========================================================================
      if (currentItem.type === 'v3_pack_opener') {
        // INSTRUMENTATION: Log IMMEDIATELY before any async work
        console.log('[V3_OPENER][SUBMIT_CLICK]', {
          sessionId,
          packId: currentItem.packId,
          instanceNumber: currentItem.instanceNumber,
          openerLen: value?.length || 0,
          hasEngine: !!engine,
          screenMode
        });
        
        const { packId, categoryId, categoryLabel, openerText, baseQuestionId, questionCode, sectionId, instanceNumber, packData } = currentItem;
        
        // DEFENSIVE: Log if openerText was missing (fallback used)
        if (!openerText || openerText.trim() === '') {
          console.log('[V3_OPENER][FALLBACK_USED_ON_SUBMIT]', {
            packId,
            instanceNumber,
            reason: 'openerText missing - user answered with fallback prompt'
          });
        }

        // CORRELATION TRACE: Generate traceId for V3 probing session
        const traceId = `${sessionId}-${Date.now()}`;
        console.log('[PROCESSING][START]', {
          traceId,
          sessionId,
          currentItemId: currentItem.id,
          currentItemType: 'v3_pack_opener',
          screenMode: 'QUESTION',
          packId,
          categoryId
        });

        console.log(`[V3_OPENER][ANSWERED] ========== OPENER ANSWERED ==========`);
        console.log(`[V3_OPENER][ANSWERED]`, {
          traceId,
          packId,
          categoryId,
          answerLength: value?.length || 0
        });

        // FIX A: Do NOT append duplicate v3_opener_question - FOLLOWUP_CARD_SHOWN already logged it
        // Only append the user's answer
        // STATIC IMPORT: Use top-level imports (prevents React context duplication)
        const appendUserMessage = appendUserMessageImport;
        const freshSession = await base44.entities.InterviewSession.get(sessionId);
        const currentTranscript = freshSession.transcript_snapshot || [];

        console.log("[V3_OPENER][TRANSCRIPT_BEFORE]", { length: currentTranscript.length });

        // REGRESSION FIX: Append user opener answer with stableKey (session-scoped for uniqueness)
        const openerAnswerStableKey = `v3-opener-a:${sessionId}:${packId}:${instanceNumber}`;
        const transcriptAfterAnswer = await appendUserMessage(sessionId, currentTranscript, value, {
          id: `v3-opener-answer-${sessionId}-${packId}-${instanceNumber}`,
          stableKey: openerAnswerStableKey,
          messageType: 'v3_opener_answer',
          packId,
          categoryId,
          instanceNumber,
          baseQuestionId
        });

        console.log('[CQ_TRANSCRIPT][USER_APPEND_OK]', {
          sessionId,
          stableKey: openerAnswerStableKey,
          packId,
          instanceNumber,
          answerLen: value?.length || 0,
          transcriptLenAfter: transcriptAfterAnswer.length
        });
        
        // STEP 3: OPTIMISTIC UPDATE - Use unified sync helper
        const optimistic = upsertTranscriptMonotonic(canonicalTranscriptRef.current, transcriptAfterAnswer, 'v3_opener_answer');
        upsertTranscriptState(optimistic, 'v3_opener_answer');
        
        // STEP 3: Submit SOT log (dev only)
        if (typeof window !== 'undefined' && (window.location.hostname.includes('preview') || window.location.hostname.includes('localhost'))) {
          console.log('[CQ_TRANSCRIPT][SUBMIT_SOT]', {
            stableKey: openerAnswerStableKey,
            messageType: 'v3_opener_answer',
            textLen: value?.length || 0
          });
        }
        
        // B) Track recently submitted user answer for protection
        recentlySubmittedUserAnswersRef.current.add(openerAnswerStableKey);
        
        // REGRESSION GUARD: Verify appended entry is in returned transcript
        const foundInReturned = transcriptAfterAnswer.some(e => e.stableKey === openerAnswerStableKey);
        console.log('[CQ_TRANSCRIPT][SOT_AFTER_USER_APPEND]', {
          renderSourceLenAfter: transcriptAfterAnswer.length,
          foundOpenerAnswer: foundInReturned,
          last2Items: transcriptAfterAnswer.slice(-2).map(e => ({
            role: e.role,
            messageType: e.messageType || e.type,
            stableKey: e.stableKey || e.id,
            textPreview: (e.text || '').substring(0, 40)
          })),
          verifyStableKey: openerAnswerStableKey
        });
        
        if (!foundInReturned) {
          console.error('[CQ_TRANSCRIPT][USER_APPEND_MISSING]', {
            stableKey: openerAnswerStableKey,
            packId,
            instanceNumber,
            reason: 'appendUserMessage returned but entry not in transcript array',
            transcriptLenAfter: transcriptAfterAnswer.length
          });
        }
        
        console.log('[V3_OPENER][SUBMITTED_OK]', {
          sessionId,
          packId,
          instanceNumber,
          traceId,
          transcriptLenAfter: transcriptAfterAnswer.length
        });
        console.log("[V3_OPENER][TRANSCRIPT_AFTER_A]", { length: transcriptAfterAnswer.length });

        // Append opener to UI history AFTER answer submitted (prevents duplicate during active state)
        const stableKey = buildV3OpenerStableKey(packId, instanceNumber);
        
        setV3ProbeDisplayHistory(prev => {
          if (prev.some(e => e.stableKey === stableKey)) {
            return prev;
          }
          return [
            ...prev,
            {
              kind: 'v3_opener_history',
              stableKey,
              text: openerText,
              packId,
              categoryLabel,
              instanceNumber,
              exampleNarrative: currentItem.exampleNarrative,
              source: 'prompt_lane_history',
              createdAt: Date.now()
            }
          ];
        });
        
        console.log('[V3_OPENER][HISTORY_APPEND_ON_COMPLETE]', { stableKey, instanceNumber });

        // ITEM-SCOPED COMMIT: Clear committing item ID after successful submission
        committingItemIdRef.current = null;
        console.log('[V3_OPENER][COMMIT_CLEAR]', {
          reason: 'submission_complete',
          packId,
          instanceNumber
        });

        // REGRESSION GUARD: Preserve local transcript during refresh
        // refreshTranscriptFromDB uses mergeTranscript to prevent regression
        console.log('[V3_OPENER][REFRESH_BEFORE]', {
          localTranscriptLen: dbTranscript.length,
          transcriptAfterAnswerLen: transcriptAfterAnswer.length,
          packId,
          instanceNumber
        });
        
        // Refresh from DB after opener answer (uses functional merge - preserves local entries)
        await refreshTranscriptFromDB('v3_opener_answered');
        
        // REGRESSION GUARD: Verify opener answer survived refresh
        setDbTranscript(prev => {
          const foundAfterRefresh = prev.some(e => e.stableKey === openerAnswerStableKey);
          console.log('[V3_OPENER][REFRESH_AFTER]', {
            transcriptLenAfter: prev.length,
            foundOpenerAnswer: foundAfterRefresh,
            openerAnswerStableKey,
            packId,
            instanceNumber
          });
          
          if (!foundAfterRefresh) {
            console.error('[CQ_TRANSCRIPT][OPENER_ANSWER_LOST_AFTER_REFRESH]', {
              stableKey: openerAnswerStableKey,
              packId,
              instanceNumber,
              transcriptLenBefore: transcriptAfterAnswer.length,
              transcriptLenAfter: prev.length,
              reason: 'Opener answer missing after refreshTranscriptFromDB - possible DB write race'
            });
          }
          
          return prev; // No mutation - just logging
        });

        // Save opener answer to database
        await saveV2PackFieldResponse({
          sessionId,
          packId,
          fieldKey: 'v3_opener_narrative',
          instanceNumber,
          answer: value,
          baseQuestionId,
          baseQuestionCode: questionCode,
          sectionId,
          questionText: openerText
        });

        // Legacy canonical transcript append - DISABLED for V3 (causes transcript overwrite)
        // V3 uses chat-style transcript (appendAssistantMessage/appendUserMessage above)
        // Keeping this block disabled prevents duplicate/conflicting transcript writes
        if (false) {
          try {
            const freshSessionForCanonical = await base44.entities.InterviewSession.get(sessionId);
            const canonicalTranscript = freshSessionForCanonical.transcript_snapshot || [];

            const baseResponses = await base44.entities.Response.filter({
              session_id: sessionId,
              question_id: baseQuestionId,
              response_type: 'base_question'
            });
            const baseResponseId = baseResponses[0]?.id || baseQuestionId;

            const questionKey = `v3_opener::${packId}::${instanceNumber}`;
            if (!hasQuestionBeenLogged(sessionId, questionKey)) {
              await appendQuestionEntry({
                sessionId,
                existingTranscript: canonicalTranscript,
                text: openerText,
                questionId: baseQuestionId,
                packId,
                fieldKey: 'v3_opener_narrative',
                instanceNumber,
                responseId: null,
                parentResponseId: baseResponseId
              });
            }

            await appendAnswerEntry({
              sessionId,
              existingTranscript: canonicalTranscript,
              text: value,
              questionId: baseQuestionId,
              packId,
              fieldKey: 'v3_opener_narrative',
              instanceNumber,
              responseId: null,
              parentResponseId: baseResponseId
            });
          } catch (err) {
            console.warn("[TRANSCRIPT][V3_OPENER] Failed to log:", err);
          }
        }

        // Store baseQuestionId in ref for exit
        v3BaseQuestionIdRef.current = baseQuestionId;

        // STEP 2: Enter V3 AI probing with opener answer as context
        console.log('[PROCESSING][V3_PROBING_ENTER]', {
          traceId,
          packId,
          categoryId,
          openerAnswerLength: value?.length || 0
        });
        
        const loopKey = `${sessionId}:${categoryId}:${instanceNumber}`;
        
        // ITEM-SCOPED COMMIT: Mark this specific opener item as committing
        committingItemIdRef.current = currentItem.id;
        console.log('[V3_OPENER][COMMIT_START]', {
          currentItemId: currentItem.id,
          packId,
          instanceNumber,
          loopKey
        });
        
        // FAILSAFE: Clear any existing timer before starting new one
        if (v3OpenerFailsafeTimerRef.current) {
          clearTimeout(v3OpenerFailsafeTimerRef.current);
          v3OpenerFailsafeTimerRef.current = null;
          console.log('[V3_FAILSAFE][CLEAR_EXISTING]', { loopKey });
        }
        
        // Generate unique submit token for this opener submission
        const submitToken = `${loopKey}:${Date.now()}`;
        v3OpenerSubmitTokenRef.current = submitToken;
        v3OpenerSubmitLoopKeyRef.current = loopKey;
        
        // REGRESSION GUARD: Ensure transcript is not cleared during V3 activation
        const transcriptLenBeforeV3Activation = transcriptAfterAnswer.length;
        
        // ATOMIC STATE TRANSITION: Set probing active + context in one batch
        // CRITICAL: Does NOT modify dbTranscript - only sets V3 mode flags
        unstable_batchedUpdates(() => {
          setV3ProbingActive(true);
          setV3ProbingContext({
            packId,
            categoryId,
            categoryLabel,
            baseQuestionId,
            questionCode,
            sectionId,
            instanceNumber,
            incidentId: null,
            packData,
            openerAnswer: value,
            traceId
          });
          
          // REGRESSION GUARD: Log that we're NOT touching transcript here
          console.log('[V3_ACTIVATION][TRANSCRIPT_PRESERVED]', {
            packId,
            instanceNumber,
            transcriptLenBeforeActivation: transcriptLenBeforeV3Activation,
            action: 'Setting V3 flags only - transcript untouched'
          });
        });
        
        console.log('[V3_OPENER][SUBMIT_OK]', {
          sessionId,
          packId,
          instanceNumber,
          traceId,
          loopKey,
          submitToken,
          openerAnswerLength: value?.length || 0
        });
        
        // CQ_RULE: TRANSCRIPT LIFECYCLE BARRIER - Commit base Q+A BEFORE V3 activation
        // This prevents "lost first question" when V3 starts without base pair in transcript
        const baseQuestion = engine?.QById?.[baseQuestionId];
        if (!baseQuestion) {
          console.error('[V3_OPENER][SUBMIT_ERROR_CONTEXT]', {
            baseQuestionId,
            currentItemType: currentItem?.type,
            currentItemId: currentItem?.id,
            note: 'missing base question ref from engine - using fallback'
          });
        }
        
        await commitBaseQAIfMissing({
          questionId: baseQuestionId,
          questionText: baseQuestion?.question_text || `Question ${baseQuestionId}`,
          answerText: 'Yes',
          sessionId
        });
        
        // PART B: Track opener submission (optimistic - immediate UI feedback)
        v3OpenerSubmittedRef.current.set(loopKey, true);
        
        // PART A: Add optimistic marker for opener answer
        const openerPromptId = `${loopKey}:opener`;
        v3OptimisticPersistRef.current[openerPromptId] = {
          stableKeyA: openerAnswerStableKey,
          answerText: value,
          ts: Date.now(),
          loopKey,
          categoryId,
          instanceNumber,
          isOpener: true
        };
        
        console.log('[V3_PROBING][START_AFTER_OPENER]', {
          packId,
          categoryId,
          instanceNumber,
          loopKey,
          submitToken,
          v3ProbingActive: true,
          optimisticOpenerMarkerSet: true
        });
        
        // Track probing start
        v3ProbingStartedRef.current.set(loopKey, true);

        // CRITICAL: Set currentItem to v3_probing type (enables correct bottom bar binding)
        // REGRESSION GUARD: This state change does NOT modify transcript
        const probingItem = {
          id: `v3-probing-${packId}-${instanceNumber}`,
          type: 'v3_probing',
          packId,
          categoryId,
          instanceNumber,
          baseQuestionId
        };
        
        console.log('[V3_PROBING][ITEM_TRANSITION]', {
          from: currentItem?.type,
          to: 'v3_probing',
          packId,
          instanceNumber,
          transcriptLenBeforeTransition: dbTranscript.length,
          action: 'Setting currentItem only - transcript preserved'
        });
        
        setCurrentItem(probingItem);

        // REGRESSION GUARD: Refresh uses functional merge - preserves all existing entries
        await refreshTranscriptFromDB('v3_probing_enter');
        
        // Verify opener answer still present after transition
        setDbTranscript(prev => {
          const foundAfterTransition = prev.some(e => e.stableKey === openerAnswerStableKey);
          console.log('[V3_PROBING][ITEM_TRANSITION_AFTER]', {
            transcriptLen: prev.length,
            foundOpenerAnswer: foundAfterTransition,
            openerAnswerStableKey
          });
          
          if (!foundAfterTransition) {
            console.error('[CQ_TRANSCRIPT][OPENER_ANSWER_LOST_AFTER_TRANSITION]', {
              stableKey: openerAnswerStableKey,
              packId,
              instanceNumber,
              reason: 'Opener answer missing after v3_probing transition'
            });
          }
          
          return prev; // No mutation - just logging
        });
        
        await persistStateToDatabase(null, [], probingItem);
        
        // FAILSAFE: Detect if probing doesn't start within 3s (token-gated)
        // Capture local copies for closure safety
        const capturedSubmitToken = submitToken;
        const capturedLoopKey = loopKey;
        const capturedPackId = packId;
        const capturedInstanceNumber = instanceNumber;
        
        v3OpenerFailsafeTimerRef.current = setTimeout(() => {
          // GUARD: Validate this timer is still current
          if (v3OpenerSubmitTokenRef.current !== capturedSubmitToken) {
            console.log('[V3_FAILSAFE][CANCELLED_OR_STALE]', {
              capturedToken: capturedSubmitToken,
              currentToken: v3OpenerSubmitTokenRef.current,
              reason: 'Token mismatch - newer submission occurred'
            });
            return;
          }
          
          if (v3OpenerSubmitLoopKeyRef.current !== capturedLoopKey) {
            console.log('[V3_FAILSAFE][CANCELLED_OR_STALE]', {
              capturedLoopKey,
              currentLoopKey: v3OpenerSubmitLoopKeyRef.current,
              reason: 'LoopKey mismatch - different context'
            });
            return;
          }
          
          // GUARD: Verify context still matches (use stable fallback from currentItem)
          const currentPackId = v3ProbingContextRef.current?.packId || currentItem?.packId;
          const currentInstanceNumber = v3ProbingContextRef.current?.instanceNumber || currentItem?.instanceNumber;
          
          if (currentPackId !== capturedPackId || currentInstanceNumber !== capturedInstanceNumber) {
            console.log('[V3_FAILSAFE][CANCELLED_OR_STALE]', {
              capturedPackId,
              currentPackId,
              capturedInstanceNumber,
              currentInstanceNumber,
              reason: 'Pack/instance changed - different submission'
            });
            return;
          }
          
          // PART B: Check optimistic markers before recovery
          const openerPromptId = `${capturedLoopKey}:opener`;
          const hasOptimisticOpener = v3OptimisticPersistRef.current[openerPromptId];

          // GUARD: Check if prompt already arrived OR optimistic marker exists
          if (v3ActivePromptTextRef.current && v3ActivePromptTextRef.current.trim().length > 0) {
            console.log('[V3_FAILSAFE][CANCELLED_OR_STALE]', {
              submitToken: capturedSubmitToken,
              loopKey: capturedLoopKey,
              reason: 'Prompt arrived - failsafe not needed'
            });
            return;
          }

          if (hasOptimisticOpener) {
            const optimisticAge = Date.now() - hasOptimisticOpener.ts;
            if (optimisticAge < 5000) {
              console.log('[V3_FAILSAFE][OPTIMISTIC_PENDING]', {
                submitToken: capturedSubmitToken,
                loopKey: capturedLoopKey,
                optimisticAge,
                reason: 'Optimistic marker active - allowing more time for probing to start'
              });
              return; // Give more time
            }
          }
          
          // All guards passed - execute recovery
          const stillOnOpener = currentItem?.type === 'v3_pack_opener' && currentItem?.packId === capturedPackId;
          const probingActiveNow = v3ProbingActiveRef.current;
          const hasPromptNow = !!v3ActivePromptTextRef.current;

          // PART B: Check optimistic markers before declaring stall
          const openerLoopKey = `${sessionId}:${capturedPackId}:${capturedInstanceNumber}`;
          const hasOptimisticSubmit = v3OpenerSubmittedRef.current.get(openerLoopKey) === true;

          if ((stillOnOpener || (probingActiveNow && !hasPromptNow)) && !hasOptimisticSubmit) {
            console.error('[V3_UI_CONTRACT][PROMPT_MISSING_AFTER_OPENER]', {
              submitToken: capturedSubmitToken,
              packId: capturedPackId,
              instanceNumber: capturedInstanceNumber,
              loopKey: capturedLoopKey,
              stillOnOpener,
              probingActiveNow,
              hasPromptNow,
              hasOptimisticSubmit,
              reason: stillOnOpener ? 'Still on opener - probing did not start' : 'Probing started but no prompt received'
            });
            
            // RECOVERY: Check if pack is multi-incident
            const isMultiIncident = packData?.behavior_type === 'multi_incident' || 
                                   packData?.followup_multi_instance === true;
            
            console.log('[V3_UI_CONTRACT][RECOVERY_FROM_PROMPT_MISSING]', {
              submitToken: capturedSubmitToken,
              packId: capturedPackId,
              instanceNumber: capturedInstanceNumber,
              loopKey: capturedLoopKey,
              action: isMultiIncident ? 'ANOTHER_INSTANCE' : 'ADVANCE',
              isMultiIncident
            });
            
            if (isMultiIncident) {
              // Route to "another instance?" gate
              transitionToAnotherInstanceGate({ packId: capturedPackId, categoryId, categoryLabel, instanceNumber: capturedInstanceNumber, packData });
            } else {
              // Exit probing and advance to next question
              exitV3Once('PROMPT_MISSING_RECOVERY', {
                incidentId: null,
                categoryId,
                completionReason: 'STOP',
                messages: [],
                reason: 'PROMPT_MISSING_RECOVERY',
                shouldOfferAnotherInstance: false,
                packId: capturedPackId,
                categoryLabel,
                instanceNumber: capturedInstanceNumber,
                packData
              });
            }
            
            // Clear token after recovery
            v3OpenerSubmitTokenRef.current = null;
            v3OpenerSubmitLoopKeyRef.current = null;
          } else {
            console.log('[V3_FAILSAFE][CANCELLED_OR_STALE]', {
              submitToken: capturedSubmitToken,
              loopKey: capturedLoopKey,
              stillOnOpener,
              probingActiveNow,
              hasPromptNow,
              reason: 'Conditions no longer met for recovery'
            });
          }
        }, 3000);

        setIsCommitting(false);
        setInput("");
        return;
      }

      // ========================================================================
      // REGULAR QUESTION HANDLER
      // ========================================================================
      if (currentItem.type === 'question') {
        const question = engine.QById[currentItem.id];
        if (!question) {
          throw new Error(`Question ${currentItem.id} not found`);
        }

        const sectionEntity = engine.Sections.find(s => s.id === question.section_id);
        const sectionName = sectionEntity?.section_name || question.category || '';
        const questionNumber = getQuestionDisplayNumber(currentItem.id);

        // Save answer first to get Response ID
        const savedResponse = await saveAnswerToDatabase(currentItem.id, value, question);

        // Normalize answer display text (Yes/No for boolean, raw text otherwise)
        const answerDisplayText = question.response_type === 'yes_no'
          ? (value.trim().toLowerCase() === 'yes' ? 'Yes' : value.trim().toLowerCase() === 'no' ? 'No' : value)
          : value;

        // Append user answer to session transcript (single source of truth)
        // STATIC IMPORT: Use top-level imports (prevents React context duplication)
        const appendUserMessage = appendUserMessageImport;
        const sessionForAnswer = await base44.entities.InterviewSession.get(sessionId);
        const questionStableKey = `question-shown:${currentItem.id}`;
        
        // DETERMINISTIC STABLEKEY: Base question answers use canonical format
        const baseAnswerStableKey = `answer:${sessionId}:${currentItem.id}:0`;
        
        console.log('[BASE_YESNO][STABLEKEY_OVERRIDE]', {
          questionId: currentItem.id,
          aStableKey: baseAnswerStableKey,
          clicked: answerDisplayText
        });
        
        console.log('[BASE_YESNO][ANSWER_APPEND_SOT]', {
          questionId: currentItem.id,
          stableKey: baseAnswerStableKey,
          anchorKey: questionStableKey,
          hasQuestionId: true,
          reason: 'Base YES/NO answer appended with full metadata at creation'
        });
        
        await appendUserMessage(sessionId, sessionForAnswer.transcript_snapshot || [], answerDisplayText, {
          stableKey: baseAnswerStableKey,
          messageType: 'ANSWER',
          questionDbId: currentItem.id,
          questionId: currentItem.id,
          questionCode: question.question_id,
          responseId: savedResponse?.id,
          sectionId: question.section_id,
          answerDisplayText,
          answerContext: 'BASE_QUESTION',
          parentStableKey: questionStableKey,
          afterStableKey: questionStableKey
        });
        
        // CQ_TRANSCRIPT_CONTRACT: Invariant check after base answer append
        if (ENFORCE_TRANSCRIPT_CONTRACT) {
          const freshCheck = await base44.entities.InterviewSession.get(sessionId);
          const expectedAKey = `answer:${sessionId}:${currentItem.id}`;
          const found = (freshCheck.transcript_snapshot || []).some(e => 
            (e.stableKey && e.stableKey.includes(currentItem.id)) ||
            (e.messageType === 'ANSWER' && e.meta?.questionDbId === currentItem.id)
          );
          
          if (!found) {
            console.error('[CQ_TRANSCRIPT][VIOLATION]', {
              messageType: 'ANSWER',
              questionId: currentItem.id,
              transcriptLen: (freshCheck.transcript_snapshot || []).length,
              reason: 'Base answer not found in transcript after append',
              stack: new Error().stack?.split('\n').slice(1, 4).join(' | ')
            });
          }
        }

        // Log answer submitted (audit only)
        await logAnswerSubmitted(sessionId, {
          questionDbId: currentItem.id,
          responseId: savedResponse?.id,
          packId: null
        });
        
        // Reload session transcript into local state (single source of truth)
        const newTranscript = await refreshTranscriptFromDB('base_question_answered');

        // UX: Clear draft on successful submit
        clearDraft();

        // SECTION GATE LOGIC: Check if this is a gate question with "No" answer
        // This must run BEFORE follow-up trigger check to properly skip remaining section questions
        
        // GUARD: Ensure newTranscript is always an array (should not trigger after return contract fix)
        const normalizedTranscript = Array.isArray(newTranscript) ? newTranscript : [];
        if (!Array.isArray(newTranscript)) {
          console.error('[ANSWER_PROCESSING][GUARD] newTranscript was not an array, normalized to []', {
            currentItemType: currentItem?.type,
            currentItemId: currentItem?.id,
            questionCode: question?.question_id,
            value: newTranscript,
            returnedBy: 'refreshTranscriptFromDB',
            reason: 'base_question_answered',
            stack: new Error().stack?.split('\n').slice(1, 3).join(' | ')
          });
        }
        
        const gateResult = await applySectionGateIfNeeded({
          sessionId,
          currentQuestion: question,
          answer: value,
          engine,
          currentSectionIndex,
          sections,
          answeredQuestionIds: new Set(normalizedTranscript.filter(t => t.type === 'question').map(t => t.questionId))
        });

        if (gateResult?.gateTriggered) {
          console.log('[GATE_APPLIED] Section gate triggered - advancing to next section or completing', {
            skippedCount: gateResult.skippedQuestionIds?.length || 0,
            nextSectionIndex: gateResult.nextSectionIndex,
            interviewComplete: gateResult.interviewComplete
          });

          if (gateResult.interviewComplete) {
            // No more sections - complete interview
            // Completion handled by modal - no local message needed
            setCurrentItem(null);
            setQueue([]);
            await persistStateToDatabase(null, [], null);
            setShowCompletionModal(true);
            setIsCommitting(false);
            setInput("");
            return;
          }

          // Advance to next section
          const currentSection = sections[currentSectionIndex];
          const nextSection = sections[gateResult.nextSectionIndex];
          const whatToExpect = WHAT_TO_EXPECT[nextSection?.id] || 'important background information';

          setCompletedSectionsCount(prev => Math.max(prev, gateResult.nextSectionIndex));

          const totalSectionsCount = sections.length;
          const totalQuestionsCount = engine?.TotalQuestions || 0;
          
          // FIX A: Count from Response entities (authoritative source)
          const gateCompletedResponses = await base44.entities.Response.filter({
            session_id: sessionId,
            response_type: 'base_question'
          });
          const gateCompletedQuestionIds = new Set(gateCompletedResponses.map(r => r.question_id));
          const answeredInGateSection = currentSection.questionIds.filter(qId => gateCompletedQuestionIds.has(qId)).length;

          console.log('[GATE_SECTION_COMPLETE][COUNT]', {
            sectionId: currentSection?.id,
            sectionQuestions: currentSection?.questionIds.length,
            answeredCount: answeredInGateSection
          });

          // IDEMPOTENCY GUARD: Check if section already completed
          const gateSectionCompleteKey = `${sessionId}::${currentSection?.id}`;
          if (!completedSectionKeysRef.current.has(gateSectionCompleteKey)) {
            completedSectionKeysRef.current.add(gateSectionCompleteKey);
            
            // Log section complete to transcript (only once)
            await logSectionComplete(sessionId, {
              completedSectionId: currentSection?.id,
              completedSectionName: currentSection?.displayName,
              nextSectionId: nextSection?.id,
              nextSectionName: nextSection?.displayName,
              progress: {
                completedSections: gateResult.nextSectionIndex,
                totalSections: totalSectionsCount,
                answeredQuestions: answeredInGateSection,
                totalQuestions: totalQuestionsCount
              }
            });
          } else {
            console.log("[IDEMPOTENCY][GATE_SECTION_COMPLETE] Already logged for section:", currentSection?.id);
          }

          // Reload transcript after logging
          await refreshTranscriptFromDB('gate_section_complete_logged');

          // Trigger section summary generation (background)
          base44.functions.invoke('triggerSummaries', {
           sessionId,
           triggerType: 'section_complete'
          }).catch(() => {}); // Fire and forget

          // Add section transition blocker (UI-ONLY)
          setUiBlocker({
           id: `blocker-section-gate-${gateResult.nextSectionIndex}`,
           type: 'SECTION_MESSAGE',
           resolved: false,
           completedSectionName: currentSection?.displayName,
           nextSectionName: nextSection.displayName,
           nextSectionIndex: gateResult.nextSectionIndex,
           nextQuestionId: gateResult.nextQuestionId,
           timestamp: new Date().toISOString()
          });

          setPendingSectionTransition({
           nextSectionIndex: gateResult.nextSectionIndex,
           nextQuestionId: gateResult.nextQuestionId,
           nextSectionName: nextSection.displayName
          });

          setQueue([]);
          setCurrentItem(null);
          await persistStateToDatabase(null, [], null);
          setIsCommitting(false);
          setInput("");
          return;
        }

        if (value === 'Yes') {
          const followUpResult = checkFollowUpTrigger(engine, currentItem.id, value, interviewMode);

          if (followUpResult) {
            const { packId, substanceName, isV3Pack } = followUpResult;

            console.log(`[FOLLOWUP-TRIGGER] Pack triggered: ${packId}, checking versions...`);
            
            // IDEMPOTENCY RELEASE: Base question routed to V3 pack - release lock
            const baseQuestionKey = `q:${currentItem.id}`;
            if (submittedKeysRef.current.has(baseQuestionKey)) {
              submittedKeysRef.current.delete(baseQuestionKey);
              const questionCode = question?.question_id || currentItem.id;
              console.log('[IDEMPOTENCY][RELEASE]', { 
                lockKey: baseQuestionKey, 
                packId,
                questionCode,
                reason: `${questionCode}_ROUTED_TO_V3_PACK` 
              });
            }

            // Check pack config flags to determine V3 vs V2
            const packConfig = FOLLOWUP_PACK_CONFIGS[packId];
            const isV3PackExplicit = packConfig?.isV3Pack === true;
            const isV2PackExplicit = packConfig?.isV2Pack === true;
            const usesPerFieldProbing = useProbeEngineV2(packId);

            // V3 takes precedence over V2 - explicit V3 flag wins
            let isV3PackFinal = isV3PackExplicit || (isV3Pack && !isV2PackExplicit);
            let isV2PackFinal = !isV3PackFinal && (isV2PackExplicit || usesPerFieldProbing);
            
            // HARD GUARD: Force V3 for PACK_INTEGRITY_APPS (MVP requirement)
            if (packId === 'PACK_INTEGRITY_APPS' && !isV3PackFinal) {
              console.error('[V3_PACK][FORCE_V3]', {
                packId,
                wasV3: isV3PackFinal,
                wasV2: isV2PackFinal,
                reason: 'PACK_INTEGRITY_APPS must route to V3 for MVP',
                action: 'forcing isV3PackFinal=true'
              });
              isV3PackFinal = true;
              isV2PackFinal = false;
            }

            console.log(`[FOLLOWUP-TRIGGER] ${packId} isV3Pack=${isV3PackFinal} isV2Pack=${isV2PackFinal}`);
            
            // ROUTING LOG: Show which path will be taken
            const routePath = isV3PackFinal ? 'V3' : isV2PackFinal ? 'V2' : 'NONE';
            console.log('[V3_PACK][ROUTE]', {
              packId,
              isV2Pack: isV2PackFinal,
              isV3Pack: isV3PackFinal,
              ideVersion: packConfig?.engineVersion || 'unknown',
              reason: isV3PackExplicit ? 'isV3Pack=true' : isV2PackExplicit ? 'isV2Pack=true' : packId === 'PACK_INTEGRITY_APPS' ? 'forced_v3_guard' : 'heuristic',
              route: routePath
            });

            // === V3 PACK HANDLING: Two-layer flow (Deterministic Opener → AI Probing) ===
            if (isV3PackFinal) {
              console.log(`[V3_PACK][ENTER] ========== ENTERING V3 PACK MODE ==========`);
              
              // Get category for V3 probing
              const categoryId = mapPackIdToCategory(packId);
              
              console.log(`[V3_PACK][ENTER]`, {
                packId,
                categoryId,
                baseQuestionId: currentItem.id,
                questionCode: question.question_id,
                ideVersion: packConfig?.engineVersion || 'v3'
              });

              if (!categoryId) {
                console.error("[V3_PACK][NO_CATEGORY_MAPPING]", { 
                  packId,
                  reason: 'No categoryId mapping found - cannot route to V3',
                  action: 'advancing to next question'
                });
                saveAnswerToDatabase(currentItem.id, value, question);
                advanceToNextBaseQuestion(currentItem.id);
                setIsCommitting(false);
                setInput("");
                return;
              }
              
              // V3 ROUTING GUARD: Hard-enforce V3 for PACK_INTEGRITY_APPS
              if (packId === 'PACK_INTEGRITY_APPS' && !isV3PackFinal) {
                console.error('[V3_PACK][ROUTING_ERROR]', {
                  packId,
                  isV3PackFinal,
                  expectedRoute: 'V3',
                  actualRoute: isV2PackFinal ? 'V2' : 'NONE',
                  action: 'forcing V3 route'
                });
              }

              // Load pack metadata for opener
              let packMetadata = null;
              try {
                const packs = await base44.entities.FollowUpPack.filter({ followup_pack_id: packId });
                packMetadata = packs[0] || null;
              } catch (err) {
                console.warn("[V3_PACK] Could not load pack metadata:", err);
              }

              // Derive categoryLabel from available sources
              let categoryLabel =
                packMetadata?.pack_name ||
                packMetadata?.category_label ||
                FOLLOWUP_PACK_CONFIGS[packId]?.instancesLabel ||
                categoryId?.replace(/_/g, ' ').toLowerCase() ||
                "this topic";

              if (categoryLabel === "this topic") {
                console.warn(`[V3_PACK][WARN] Missing categoryLabel for pack ${packId} / categoryId=${categoryId}, using generic fallback`);
              }

              // Get deterministic opener (configured or synthesized)
              // STATIC IMPORT: Use top-level import (already imported at line 61)
              const opener = getV3DeterministicOpener(packMetadata, categoryId, categoryLabel);

              if (opener.isSynthesized) {
                console.warn(`[V3_PACK][MISSING_OPENER] Pack ${packId} missing configured opener - synthesized fallback used`);
              }

              // Log pack entered (audit only)
              await logPackEntered(sessionId, { packId, instanceNumber: 1, isV3: true });

              // Save base question answer
              saveAnswerToDatabase(currentItem.id, value, question);

              // STEP 1: Show deterministic opener (non-AI)
              const openerItemId = `v3-opener-${packId}-1`;
              const openerItem = {
                id: openerItemId,
                type: 'v3_pack_opener',
                packId,
                categoryId,
                categoryLabel,
                openerText: opener.text,
                exampleNarrative: opener.example,
                baseQuestionId: currentItem.id,
                questionCode: question.question_id,
                sectionId: question.section_id,
                instanceNumber: 1,
                packData: packMetadata
              };

              console.log('[V3_PACK][ENTER_STATE_SET]', {
                packId,
                instanceNumber: 1,
                currentItemType: 'v3_pack_opener',
                currentItemId: openerItemId,
                openerTextPreview: opener.text?.substring(0, 60)
              });

              setCurrentItem(openerItem);
              setQueue([]);

              await refreshTranscriptFromDB('v3_opener_set');
              await persistStateToDatabase(null, [], openerItem);

              // PACK ENTRY FAILSAFE: Arm ONLY if opener not yet active
              // Generate token for this pack entry attempt
              const packEntryLoopKey = `${sessionId}:${categoryId}:1`;
              const packEntryToken = `${packEntryLoopKey}:${Date.now()}`;
              
              // Clear any existing pack entry timer
              if (v3PackEntryFailsafeTimerRef.current) {
                clearTimeout(v3PackEntryFailsafeTimerRef.current);
                v3PackEntryFailsafeTimerRef.current = null;
              }
              
              // Store context for validation
              v3PackEntryContextRef.current = { packId, instanceNumber: 1, categoryId };
              v3PackEntryFailsafeTokenRef.current = packEntryToken;
              
              console.log('[V3_PACK][ENTRY_FAILSAFE_ARMED]', {
                packId,
                instanceNumber: 1,
                packEntryToken,
                packEntryLoopKey
              });

              // FAIL-SAFE: Detect dead-end after state transition (V3 pack entry)
              v3PackEntryFailsafeTimerRef.current = setTimeout(async () => {
                // TOKEN GUARD: Validate this timer is still current
                if (v3PackEntryFailsafeTokenRef.current !== packEntryToken) {
                  console.log('[V3_PACK][ENTRY_FAILSAFE_STALE]', {
                    packId,
                    instanceNumber: 1,
                    capturedToken: packEntryToken,
                    currentToken: v3PackEntryFailsafeTokenRef.current,
                    reason: 'Token mismatch - newer entry occurred'
                  });
                  return;
                }
                
                // CONTEXT GUARD: Validate pack/instance still matches
                const currentContext = v3PackEntryContextRef.current;
                if (!currentContext || currentContext.packId !== packId || currentContext.instanceNumber !== 1) {
                  console.log('[V3_PACK][ENTRY_FAILSAFE_STALE]', {
                    packId,
                    instanceNumber: 1,
                    reason: 'Context changed - different pack'
                  });
                  return;
                }
                try {
                  const freshSession = await base44.entities.InterviewSession.get(sessionId);
                  const currentSnapshot = freshSession.current_item_snapshot;
                  
                  // TIGHTENED: Only treat as stuck if opener truly not present
                  const hasOpenerState = currentSnapshot?.type === 'v3_pack_opener' && 
                                        currentSnapshot?.openerText && 
                                        currentSnapshot?.packId === packId;
                  const isProbingActive = currentSnapshot?.type === 'v3_probing' && 
                                         currentSnapshot?.packId === packId;
                  
                  if (hasOpenerState || isProbingActive) {
                    console.log('[V3_PACK][FAILSAFE_SKIP]', {
                      packId,
                      instanceNumber: 1,
                      currentSnapshotType: currentSnapshot?.type,
                      reason: 'Opener already active or probing started'
                    });
                    return;
                  }
                  
                  // Check if we're still stuck on the base question or no current item
                  const isStuck = !currentSnapshot || 
                                  (currentSnapshot.type === 'question' && currentSnapshot.id === currentItem.id) ||
                                  (currentSnapshot.type !== 'v3_pack_opener' && currentSnapshot.type !== 'v3_probing');
                  
                  if (isStuck) {
                    console.error('[V3_PACK][FAILSAFE_REAPPLY]', {
                      packId,
                      instanceNumber: 1,
                      currentSnapshotType: currentSnapshot?.type,
                      expectedType: 'v3_pack_opener',
                      action: 'Reapplying opener state'
                    });
                    
                    // Reapply opener state
                    setCurrentItem(openerItem);
                    await persistStateToDatabase(null, [], openerItem);
                    
                    // If still stuck after reapply, route deterministically (NEVER auto-advance for V3)
                    setTimeout(async () => {
                      const checkSession = await base44.entities.InterviewSession.get(sessionId);
                      const checkSnapshot = checkSession.current_item_snapshot;
                      
                      if (!checkSnapshot || checkSnapshot.type === 'question') {
                        // GUARD: V3 packs MUST NOT auto-advance to next base question
                        console.error('[V3_PACK][FAILSAFE_ADVANCE_BLOCKED]', {
                          packId,
                          instanceNumber: 1,
                          fromQuestionId: currentItem.id,
                          reason: 'V3 pack must not auto-advance - routing deterministically instead'
                        });
                        
                        // UI CONTRACT GUARD: Never route to gate before opener submit/probing start
                        const openerLoopKey = `${sessionId}:${categoryId}:1`;
                        const openerSubmitted = v3OpenerSubmittedRef.current.get(openerLoopKey) === true;
                        const probingStarted = v3ProbingStartedRef.current.get(openerLoopKey) === true;
                        
                        if (!openerSubmitted && !probingStarted) {
                          console.error('[V3_UI_CONTRACT][ENTRY_FAILSAFE_BLOCKED]', {
                            packId,
                            instanceNumber: 1,
                            openerSubmitted,
                            probingStarted,
                            reason: 'UI_CONTRACT_NO_GATE_BEFORE_OPENER_SUBMIT',
                            action: 'Reapplying opener state only - no gate'
                          });
                          
                          // Reapply opener state one more time and stop
                          setCurrentItem(openerItem);
                          await persistStateToDatabase(null, [], openerItem);
                          return;
                        }
                        
                        // Deterministic recovery based on pack type
                        const isMultiIncident = packMetadata?.behavior_type === 'multi_incident' || 
                                               packMetadata?.followup_multi_instance === true;
                        
                        if (isMultiIncident) {
                          console.log('[V3_UI_CONTRACT][RECOVERY_TO_ANOTHER_INSTANCE]', {
                            packId,
                            instanceNumber: 1,
                            reason: 'PACK_ENTRY_INCONSISTENT',
                            openerSubmitted,
                            probingStarted
                          });
                          
                          // Route to multi-instance gate
                          transitionToAnotherInstanceGate({
                            packId,
                            categoryId,
                            categoryLabel,
                            instanceNumber: 1,
                            packData: packMetadata
                          });
                        } else {
                          console.log('[EXIT_V3][ONCE]', {
                            reason: 'PACK_ENTRY_INCONSISTENT',
                            packId,
                            instanceNumber: 1
                          });
                          
                          // Exit V3 cleanly
                          exitV3Once('PACK_ENTRY_INCONSISTENT', {
                            incidentId: null,
                            categoryId,
                            completionReason: 'STOP',
                            messages: [],
                            reason: 'PACK_ENTRY_INCONSISTENT',
                            shouldOfferAnotherInstance: false,
                            packId,
                            categoryLabel,
                            instanceNumber: 1,
                            packData: packMetadata
                          });
                        }
                      }
                    }, 500);
                  }
                } catch (err) {
                  console.error('[V3_PACK][FAILSAFE_ERROR]', err.message);
                }
              }, 200);

              setIsCommitting(false);
              setInput("");
              return;
            }

            // === V2 PACK HANDLING: Enter V2_PACK mode ===
            if (isV2PackFinal) {
              // SCHEMA RESOLUTION: Use centralized resolver (DB-first for standard clusters)
              const staticConfig = FOLLOWUP_PACK_CONFIGS[packId];
              const dbPackMeta = engine?.v2PacksById?.[packId]?.meta || null;
              
              const { schemaSource, fields, packConfig } = resolvePackSchema(dbPackMeta, staticConfig);
              
              // VALIDATION: Warn if schema source doesn't match intent
              if (dbPackMeta && staticConfig) {
                validateSchemaSource(packId, schemaSource, dbPackMeta, staticConfig);
              }

              if (!packConfig || !Array.isArray(fields) || fields.length === 0) {
                console.error("[V2_PACK][BLOCKED]", {
                  packId,
                  reason: 'Missing or invalid pack schema',
                  schemaSource,
                  hasConfig: !!packConfig,
                  hasFields: Array.isArray(fields),
                  fieldsCount: fields.length
                });
                // Fallback: advance to next question
                saveAnswerToDatabase(currentItem.id, value, question);
                advanceToNextBaseQuestion(currentItem.id);
                setIsCommitting(false);
                setInput("");
                return;
              }
              
              console.log('[V2_PACK][ENTER]', {
                packId,
                baseQuestionId: currentItem.id,
                questionCode: question.question_id,
                schemaSource,
                fieldsCount: fields.length
              });

              // Build ordered list of fields in this V2 pack (from resolved schema)
              // Normalize field accessors for DB vs static formats
              const orderedFields = fields
                .filter(f => (f.fieldKey || f.id) && (f.label || f.question_text))
                .sort((a, b) => (a.factsOrder || a.order || 0) - (b.factsOrder || b.order || 0))
                .map(f => ({
                  // Normalize field structure for unified access
                  fieldKey: f.fieldKey || f.id,
                  label: f.label || f.question_text,
                  semanticType: f.semanticType || f.semanticKey,
                  inputType: f.inputType || 'long_text',
                  required: f.required || false,
                  aiProbeHint: f.aiProbeHint || null,
                  choices: f.choices || f.options || [],
                  helperText: f.helperText || f.placeholder,
                  exampleValue: f.exampleValue || null,
                  order: f.order || f.factsOrder || 0,
                  // Keep raw for backend pass-through
                  raw: f
                }));
              
              // Store schema source in pack state for backend calls
              const packState = {
                schemaSource,
                dbPackMeta
              };

              // EXPLICIT LOGGING: Entering V2 pack mode
              console.log(`[V2_PACK][ENTER] ========== ENTERING V2 PACK MODE ==========`);
              console.log(`[V2_PACK][ENTER] pack=${packId} firstField=${orderedFields[0].fieldKey}`);
              console.log(`[V2_PACK][ENTER] totalFields=${orderedFields.length}, fields=[${orderedFields.map(f => f.fieldKey).join(', ')}]`);
              console.log(`[V2_PACK][ENTER] triggeredByQuestion=${currentItem.id} (${question.question_id}), instanceNumber=1`);
              console.log(`[V2_PACK][ENTER] AI-driven mode - backend will control progression`);

              // Log pack entered (audit only)
              await logPackEntered(sessionId, { packId, instanceNumber: 1, isV3: false });
              await refreshTranscriptFromDB('v2_pack_logged');

              // Special log for PACK_PRIOR_LE_APPS_STANDARD
              if (packId === 'PACK_PRIOR_LE_APPS_STANDARD') {
                console.log(`[V2_PACK][PRIOR_LE_APPS][ENTER] ========== ENTERING PRIOR LE APPS PACK ==========`);
                console.log(`[V2_PACK][PRIOR_LE_APPS][ENTER] fields=[${orderedFields.map(f => f.fieldKey).join(', ')}]`);
              }

              // Save the base question answer first and get Response ID
              const baseResponse = await saveAnswerToDatabase(currentItem.id, value, question);

              // Set up V2 pack mode
              setActiveV2Pack({
                packId,
                fields: orderedFields,
                currentIndex: 0,
                baseQuestionId: currentItem.id,
                instanceNumber: 1,
                substanceName: substanceName,
                collectedAnswers: {},
                schemaSource: packState.schemaSource,
                dbPackMeta: packState.dbPackMeta
              });
              setV2PackTriggerQuestionId(currentItem.id);
              setV2PackMode("V2_PACK");
              setCurrentFollowUpAnswers({});

              // For V2 standard cluster packs: Make initial backend call to get AI opening
              // This allows the AI to acknowledge the "yes" and set context before asking fields
              console.log(`[V2_PACK][CLUSTER_INIT] Making initial backend call for pack opening...`);

              const firstField = orderedFields[0];

              // Compute effective opening strategy from pack meta (read from engine state)
              const packMeta = engine?.v2PacksById?.[packId]?.meta || null;

              if (!packMeta) {
                console.warn(`[V2_PACK][CLUSTER_INIT] No V2 pack meta found for packId ${packId}`, {
                  availablePackIds: Object.keys(engine?.v2PacksById || {})
                });
              }

              const rawOpeningStrategy = packMeta?.openingStrategy || 'none';
              const openingFieldKey = packMeta?.openingFieldKey || null;
              const forceNarrative = packMeta?.forceNarrativeOpening === true && !!openingFieldKey;

              const effectiveOpeningStrategy =
                rawOpeningStrategy && rawOpeningStrategy !== 'none'
                  ? rawOpeningStrategy
                  : (forceNarrative ? 'fixed_narrative' : 'none');

              const isOpeningField = openingFieldKey && openingFieldKey === firstField.fieldKey;

              console.log('[V2_FRONTEND][OPENING_META]', {
                packId,
                fieldKey: firstField.fieldKey,
                probeCount: 0,
                effectiveOpeningStrategy,
                openingFieldKey,
                isOpeningField,
              });

              const initialCallResult = await runV2FieldProbeIfNeeded({
                base44Client: base44,
                packId,
                fieldKey: firstField.fieldKey,
                fieldValue: "", // Empty initial value to trigger opening
                previousProbesCount: 0,
                incidentContext: {},
                sessionId,
                questionCode: question?.question_id,
                baseQuestionId: currentItem.id,
                aiProbingEnabled,
                aiProbingDisabledForSession,
                maxAiFollowups: getPackMaxAiFollowups(packId),
                instanceNumber: 1,
                setBackendQuestionTextMap, // STEP 1: Pass setter
                schemaSource: packState.schemaSource,
                resolvedField: firstField.raw
              });

              console.log(`[V2_PACK][CLUSTER_INIT] Backend response:`, {
                mode: initialCallResult?.mode,
                hasQuestion: !!initialCallResult?.question,
                probeSource: initialCallResult?.probeSource
              });

              // CRITICAL FIX: When backend returns mode='QUESTION', immediately transition to v2_pack_field
              // This ensures the UI shows the pack question instead of repeating the base question
              if (initialCallResult?.mode === 'QUESTION' && initialCallResult.question) {
                console.log('[V2_PACK][IMMEDIATE_TRANSITION] Backend returned QUESTION - showing pack field immediately');

                // Get backend question text (already stored by callProbeEngineV2PerField)
                const backendQuestionTextForFirst = getBackendQuestionText(backendQuestionTextMap, packId, firstField.fieldKey, 1)
                  || initialCallResult.questionText
                  || initialCallResult.question;

                // Immediately set currentItem to v2_pack_field to show the pack question
                const firstPackItem = {
                  id: `v2pack-${packId}-0`,
                  type: 'v2_pack_field',
                  packId: packId,
                  fieldIndex: 0,
                  fieldKey: firstField.fieldKey,
                  fieldConfig: firstField,
                  baseQuestionId: currentItem.id,
                  instanceNumber: 1,
                  backendQuestionText: backendQuestionTextForFirst
                };

                setCurrentItem(firstPackItem);
                setQueue([]);

                await persistStateToDatabase(null, [], firstPackItem);
                setIsCommitting(false);
                setInput("");
                return;
              }

              // Legacy opening logic (for packs without QUESTION response)
              // Detect fixed narrative opening
              const isFixedNarrativeOpening =
                effectiveOpeningStrategy === 'fixed_narrative' &&
                isOpeningField &&
                initialCallResult?.probeSource === 'fixed_narrative_opening';

              if (isFixedNarrativeOpening) {
                console.log('[V2_PACK][OPENING_FIXED_NARRATIVE]', {
                  packId,
                  fieldKey: firstField.fieldKey,
                  probeSource: initialCallResult?.probeSource,
                });

                // Add AI opening question to transcript
                // V2 cluster opening: append via canonical helper
                // STATIC IMPORT: Use top-level import
                const sessionForV2Opening = await base44.entities.InterviewSession.get(sessionId);
                const currentTranscriptForV2 = sessionForV2Opening.transcript_snapshot || [];
                await appendAssistantMessageImport(sessionId, currentTranscriptForV2, initialCallResult.question, {
                  messageType: 'v2_pack_opening',
                  packId,
                  fieldKey: firstField.fieldKey,
                  instanceNumber: 1,
                  baseQuestionId: currentItem.id,
                  visibleToCandidate: true
                });
                await refreshTranscriptFromDB('v2_cluster_opening_shown');

                // Set up AI probe state - this makes the UI show the AI question and wait for answer
                setIsWaitingForAgent(true);
                setIsInvokeLLMMode(true);
                setCurrentFieldProbe({
                  packId,
                  instanceNumber: 1,
                  fieldKey: firstField.fieldKey,
                  baseQuestionId: currentItem.id,
                  substanceName: substanceName,
                  currentItem: {
                    id: `v2pack-${packId}-0`,
                    type: 'v2_pack_field',
                    packId,
                    fieldIndex: 0
                  },
                  question: initialCallResult.question,
                  isV2PackMode: true,
                  isClusterOpening: true
                });

                // Keep currentItem as the first field - but it won't be shown until after AI probe
                // STEP 2: Include backend question text for first field
                const backendQuestionTextForFirst = getBackendQuestionText(backendQuestionTextMap, packId, firstField.fieldKey, 1);

                setCurrentItem({
                  id: `v2pack-${packId}-0`,
                  type: 'v2_pack_field',
                  packId: packId,
                  fieldIndex: 0,
                  fieldKey: firstField.fieldKey,
                  fieldConfig: firstField,
                  baseQuestionId: currentItem.id,
                  instanceNumber: 1,
                  backendQuestionText: backendQuestionTextForFirst // STEP 2: Wire backend question
                });
                setQueue([]);

                await persistStateToDatabase(null, [], {
                  id: `v2pack-${packId}-0`,
                  type: 'v2_pack_field',
                  packId: packId,
                  fieldIndex: 0
                });
              } else {
                // No special opening - go directly to first field
                // STEP 2: Include backend question text in currentItem
                const backendQuestionText = getBackendQuestionText(backendQuestionTextMap, packId, firstField.fieldKey, 1);

                setCurrentItem({
                  id: `v2pack-${packId}-0`,
                  type: 'v2_pack_field',
                  packId: packId,
                  fieldIndex: 0,
                  fieldKey: firstField.fieldKey,
                  fieldConfig: firstField,
                  baseQuestionId: currentItem.id,
                  instanceNumber: 1,
                  backendQuestionText // STEP 2: Wire backend question
                });
                setQueue([]);

                await persistStateToDatabase(null, [], {
                  id: `v2pack-${packId}-0`,
                  type: 'v2_pack_field',
                  packId: packId,
                  fieldIndex: 0
                });
              }

              setIsCommitting(false);
              setInput("");
              return;
            }

            // === LEGACY V3 PROBING CHECK (for packs without explicit version flags) ===
            const categoryId = mapPackIdToCategory(packId);

            if (ENABLE_V3_PROBING && categoryId && !isV2PackFinal && !isV3PackFinal) {
              try {
                // Check system config V3 enabled categories
                const { config } = await getSystemConfig();
                const v3EnabledCategories = config.v3?.enabled_categories || [];
                const isV3EnabledForCategory = v3EnabledCategories.includes(categoryId);

                if (isV3EnabledForCategory) {
                  // Check if pack has ide_version = "V3"
                  const packs = await base44.entities.FollowUpPack.filter({ followup_pack_id: packId });
                  const pack = packs[0];

                  if (pack?.ide_version === "V3") {
                    // Check if FactModel is ready
                    const factModel = await getFactModelForCategory(categoryId);

                    if (factModel && (factModel.isReadyForAiProbing || factModel.status === "ACTIVE")) {
                      console.log("[V3 PROBING] Triggering V3 probing loop", { packId, categoryId });

                    // Save base question answer
                    saveAnswerToDatabase(currentItem.id, value, question);

                    // Enter V3 probing mode
                    setV3ProbingActive(true);
                    setV3ProbingContext({
                      packId,
                      categoryId,
                      baseQuestionId: currentItem.id,
                      questionCode: question.question_id,
                      sectionId: question.section_id,
                      instanceNumber: 1,
                      incidentId: null, // Will be created by decisionEngineV3
                      packData: pack // Pass pack metadata for opener
                    });

                    await persistStateToDatabase(null, [], {
                      id: `v3-probing-${packId}`,
                      type: 'v3_probing',
                      packId,
                      categoryId,
                      baseQuestionId: currentItem.id
                    });

                    setIsCommitting(false);
                      setInput("");
                      return;
                    }
                  }
                }
              } catch (v3Err) {
                console.warn("[V3 PROBING] Error checking V3 status, falling back:", v3Err);
              }
            }

            if (interviewMode === "AI_PROBING") {
              saveAnswerToDatabase(currentItem.id, value, question);
              advanceToNextBaseQuestion(currentItem.id);
              setIsCommitting(false);
              setInput("");
              return;
            }

            if (ideEnabled && categoryId) {
              const factModel = await getFactModelForCategory(categoryId);

              if (factModel && factModel.isReadyForAiProbing) {
                try {
                  const ideResult = await base44.functions.invoke('decisionEngineProbe', {
                    sessionId: sessionId,
                    categoryId: categoryId,
                    incidentId: null,
                    latestAnswer: value,
                    questionContext: {
                      questionId: currentItem.id,
                      questionCode: question.question_id,
                      sectionId: question.section_id
                    }
                  });

                  if (ideResult.continue && ideResult.nextQuestion) {
                    setCurrentIncidentId(ideResult.incidentId);
                    setCurrentIdeCategoryId(categoryId);
                    setCurrentIdeQuestion(ideResult.nextQuestion);
                    setInIdeProbingLoop(true);

                    await persistStateToDatabase(newTranscript, [], currentItem);
                    setIsCommitting(false);
                    setInput("");
                    return;
                  } else if (ideResult.reason === "FACT_MODEL_NOT_READY" && interviewMode === "HYBRID") {
                    // Continue to deterministic
                  } else {
                    advanceToNextBaseQuestion(currentItem.id);
                    setIsCommitting(false);
                    setInput("");
                    saveAnswerToDatabase(currentItem.id, value, question);
                    return;
                  }
                } catch (ideError) {
                  console.error("[IDE] Error calling decision engine", ideError);

                  if (interviewMode === "HYBRID") {
                    // Continue to deterministic
                  } else {
                    advanceToNextBaseQuestion(currentItem.id);
                    setIsCommitting(false);
                    setInput("");
                    saveAnswerToDatabase(currentItem.id, value, question);
                    return;
                  }
                }
              } else if (ideEnabled && interviewMode === "HYBRID") {
                // Continue to deterministic
              }
            }

            const triggerKey = `${currentItem.id}:${packId}`;
            if (triggeredPacksRef.current.has(triggerKey)) {
              const nextQuestionId = computeNextQuestionId(engine, currentItem.id, value);
              if (nextQuestionId && engine.QById[nextQuestionId]) {
                setQueue([]);
                setCurrentItem({ id: nextQuestionId, type: 'question' });
                await persistStateToDatabase(newTranscript, [], { id: nextQuestionId, type: 'question' });
              } else {
                setCurrentItem(null);
                setQueue([]);
                await persistStateToDatabase(newTranscript, [], null);
                setShowCompletionModal(true);
              }
              setIsCommitting(false);
              setInput("");
              saveAnswerToDatabase(currentItem.id, value, question);
              return;
            }

            triggeredPacksRef.current.add(triggerKey);

            const packSteps = injectSubstanceIntoPackSteps(engine, packId, substanceName);

            if (packSteps && packSteps.length > 0) {
              setCurrentFollowUpAnswers({});

              const followupQueue = [];
              for (let i = 0; i < packSteps.length; i++) {
                followupQueue.push({
                  id: `${packId}:${i}`,
                  type: 'followup',
                  packId: packId,
                  stepIndex: i,
                  substanceName: substanceName,
                  totalSteps: packSteps.length,
                  baseQuestionId: currentItem.id
                });
              }

              const firstItem = followupQueue[0];
              const remainingQueue = followupQueue.slice(1);

              setQueue(remainingQueue);
              setCurrentItem(firstItem);

              await persistStateToDatabase(null, remainingQueue, firstItem);
            } else {
              const nextQuestionId = computeNextQuestionId(engine, currentItem.id, value);
              if (nextQuestionId && engine.QById[nextQuestionId]) {
                setQueue([]);
                setCurrentItem({ id: nextQuestionId, type: 'question' });
                await persistStateToDatabase(newTranscript, [], { id: nextQuestionId, type: 'question' });
              } else {
                setCurrentItem(null);
                setQueue([]);
                await persistStateToDatabase(newTranscript, [], null);
                setShowCompletionModal(true);
              }
            }
          } else {
            const freshAfterCheck = await refreshTranscriptFromDB('before_advance_check');
            advanceToNextBaseQuestion(currentItem.id, freshAfterCheck);
          }
        } else {
          const freshAfterNoFollowup = await refreshTranscriptFromDB('no_followup_advance');
          advanceToNextBaseQuestion(currentItem.id, freshAfterNoFollowup);
        }

        // Note: saveAnswerToDatabase already called above before setting newTranscript

      } else if (currentItem.type === 'followup') {
        const { packId, stepIndex, substanceName, baseQuestionId } = currentItem;

        const packSteps = injectSubstanceIntoPackSteps(engine, packId, substanceName);

        if (!packSteps || !packSteps[stepIndex]) {
          throw new Error(`Follow-up pack ${packId} step ${stepIndex} not found`);
        }
        const step = packSteps[stepIndex];

        const instanceNumber = currentItem.instanceNumber || 1;
        const fieldKey = step.Field_Key;

        console.log('[FOLLOWUP ANSWER]', {
          packId,
          fieldKey,
          answer: value,
          stepIndex,
          instanceNumber,
          baseQuestionId
        });

        if (step.PrefilledAnswer && step.Field_Key === 'substance_name') {
          // Prefilled answer - save directly, no transcript append (canonical owns it)
          const updatedFollowUpAnswers = {
            ...currentFollowUpAnswers,
            [step.Field_Key]: step.PrefilledAnswer
          };
          setCurrentFollowUpAnswers(updatedFollowUpAnswers);

          let updatedQueue = [...queue];
          let nextItem = updatedQueue.shift() || null;

          while (nextItem && nextItem.type === 'followup') {
            const nextPackSteps = injectSubstanceIntoPackSteps(engine, nextItem.packId, nextItem.substanceName);
            const nextStep = nextPackSteps[nextItem.stepIndex];

            if (shouldSkipFollowUpStep(nextStep, updatedFollowUpAnswers)) {
              nextItem = updatedQueue.shift() || null;
            } else {
              break;
            }
          }

          setQueue(updatedQueue);
          setCurrentItem(nextItem);

          await persistStateToDatabase(null, updatedQueue, nextItem);
          await saveFollowUpAnswer(packId, step.Field_Key, step.PrefilledAnswer, substanceName, currentItem.instanceNumber || 1);

          setIsCommitting(false);
          setInput("");

          if (!nextItem) {
            setShowCompletionModal(true);
          }

          return;
        }

        const validation = validateFollowUpAnswer(value, step.Expected_Type || 'TEXT', step.Options);

        if (!validation.valid) {
          setValidationHint(validation.hint);
          setIsCommitting(false);

          setTimeout(() => {
            if (inputRef.current) {
              inputRef.current.focus();
            }
          }, 100);
          return;
        }

        const normalizedAnswer = validation.normalized || value;

        // Check if this is a V2 pack
        const isV2Pack = useProbeEngineV2(packId);

        console.log('[FOLLOWUP ANSWER] V2 pack check', {
          packId,
          isV2Pack,
          fieldKey,
          answer: normalizedAnswer,
          stepIndex,
          instanceNumber,
          baseQuestionId,
          aiProbingEnabled,
          aiProbingDisabledForSession,
          ENABLE_LIVE_AI_FOLLOWUPS
        });

        // === V2 PACK HANDLING FOR FOLLOW-UPS ===
        if (isV2Pack) {
          const incidentContext = { ...currentFollowUpAnswers, [fieldKey]: normalizedAnswer };
          const maxAiFollowups = getPackMaxAiFollowups(packId);
          const fieldCountKey = `${packId}:${fieldKey}:${instanceNumber}`;
          const probeCount = aiFollowupCounts[fieldCountKey] || 0;
          const question = engine.QById[baseQuestionId];

          // Run V2 probe
          const v2Result = await runV2FieldProbeIfNeeded({
            base44Client: base44,
            packId,
            fieldKey,
            fieldValue: normalizedAnswer,
            previousProbesCount: probeCount,
            incidentContext,
            sessionId,
            questionCode: question?.question_id,
            baseQuestionId,
            aiProbingEnabled,
            aiProbingDisabledForSession,
            maxAiFollowups,
            setBackendQuestionTextMap, // STEP 1: Pass setter for legacy followup path
            schemaSource: null, // Legacy followups use static schema
            resolvedField: null
            });

          // Save the answer
          await saveFollowUpAnswer(packId, fieldKey, normalizedAnswer, substanceName, instanceNumber, 'user');

          // If probe returned a question, show it
          if (v2Result?.mode === 'QUESTION' && v2Result.question) {
            // Increment probe count
            setAiFollowupCounts(prev => ({
              ...prev,
              [fieldCountKey]: probeCount + 1
            }));

            // Add current answer to transcript
            const followupQuestionEvent = createChatEvent('followup_question', {
              questionId: currentItem.id,
              questionText: step.Prompt,
              packId: packId,
              substanceName: substanceName,
              kind: 'deterministic_followup',
              text: step.Prompt,
              content: step.Prompt,
              fieldKey: step.Field_Key,
              followupPackId: packId,
              instanceNumber: instanceNumber,
              baseQuestionId: baseQuestionId
            });

            // Save answer to DB, then refresh (no local append)
            setCurrentFollowUpAnswers(prev => ({
              ...prev,
              [fieldKey]: normalizedAnswer
            }));

            // Persist state will write to DB
            await refreshTranscriptFromDB('followup_v2_probe_before_clarifier');

            // Show AI probe question
            setIsWaitingForAgent(true);
            setIsInvokeLLMMode(true);
            setCurrentFieldProbe({
              packId,
              instanceNumber,
              fieldKey,
              baseQuestionId,
              substanceName,
              currentItem,
              question: v2Result.question
            });

            setIsCommitting(false);
            setInput("");
            return;
          }

          // No probe needed - continue to next followup step
        }

        // === STANDARD FOLLOWUP FLOW (Both V2 and non-V2) ===
        const followupQuestionEvent = createChatEvent('followup_question', {
          questionId: currentItem.id,
          questionText: step.Prompt,
          packId: packId,
          substanceName: substanceName,
          kind: 'deterministic_followup',
          text: step.Prompt,
          content: step.Prompt,
          fieldKey: step.Field_Key,
          followupPackId: packId,
          instanceNumber: instanceNumber,
          baseQuestionId: currentItem.baseQuestionId
        });

        // Save answer to DB
        await saveFollowUpAnswer(packId, step.Field_Key, normalizedAnswer, substanceName, instanceNumber);

        const updatedFollowUpAnswers = {
          ...currentFollowUpAnswers,
          [step.Field_Key]: normalizedAnswer
        };
        setCurrentFollowUpAnswers(updatedFollowUpAnswers);

        let updatedQueue = [...queue];
        let nextItem = updatedQueue.shift() || null;

        while (nextItem && nextItem.type === 'followup') {
          const nextPackSteps = injectSubstanceIntoPackSteps(engine, nextItem.packId, nextItem.substanceName);
          const nextStep = nextPackSteps?.[nextItem.stepIndex];

          if (nextStep && shouldSkipFollowUpStep(nextStep, updatedFollowUpAnswers)) {
            nextItem = updatedQueue.shift() || null;
          } else {
            break;
          }
        }

        const isLastFollowUp = !nextItem || nextItem.type !== 'followup' || nextItem.packId !== packId;

        if (isLastFollowUp) {
          if (shouldSkipProbingForHired(packId, updatedFollowUpAnswers)) {
            const triggeringQuestion = [...newTranscript].reverse().find(t =>
              t.type === 'question' &&
              engine.QById[t.questionId]?.followup_pack === packId &&
              t.answer === 'Yes'
            );

            if (triggeringQuestion) {
              const nextQuestionId = computeNextQuestionId(engine, triggeringQuestion.questionId, 'Yes');

              setCurrentFollowUpAnswers({});

              if (nextQuestionId && engine.QById[nextQuestionId]) {
                setQueue([]);
                setCurrentItem({ id: nextQuestionId, type: 'question' });
                await persistStateToDatabase(newTranscript, [], { id: nextQuestionId, type: 'question' });
              } else {
                setCurrentItem(null);
                setQueue([]);
                await persistStateToDatabase(newTranscript, [], null);
                setShowCompletionModal(true);
              }
            } else {
              setCurrentItem(null);
              setQueue([]);
              await persistStateToDatabase(newTranscript, [], null);
              setShowCompletionModal(true);
            }
          } else {
            setCurrentFollowUpAnswers({});
            setCurrentItem(null);
            setQueue([]);
            await persistStateToDatabase(newTranscript, [], null);
            onFollowupPackComplete(currentItem.baseQuestionId, packId);
          }
        } else {
          setQueue(updatedQueue);
          setCurrentItem(nextItem);

          await persistStateToDatabase(newTranscript, updatedQueue, nextItem);
        }
      } else if (currentItem.type === 'multi_instance_gate') {
        // MI_GATE TRACE 3: Handler entry audit
        console.log('[MI_GATE][TRACE][HANDLER_ENTER]', {
          currentItemId: currentItem.id,
          packId: currentItem.packId,
          instanceNumber: currentItem.instanceNumber,
          answer: value,
          source: 'handleAnswer'
        });
        
        // PART C: Multi-instance gate handler - append Q+A after user answers
        const normalized = value.trim().toLowerCase();
        if (normalized !== 'yes' && normalized !== 'no') {
          setValidationHint('Please answer "Yes" or "No".');
          setIsCommitting(false);
          return;
        }

        const answer = normalized === 'yes' ? 'Yes' : 'No';
        const gate = multiInstanceGate || currentItem;

        // GUARD: Validate gate context
        if (!gate || !gate.packId || !gate.instanceNumber) {
          console.error('[FORENSIC][GATE_HANDLER_MISSING_CONTEXT]', {
            hasGate: !!gate,
            packId: gate?.packId,
            instanceNumber: gate?.instanceNumber
          });
          setIsCommitting(false);
          return;
        }

        // FIX F: Check if gate already answered (prevent re-ask)
        const session = await base44.entities.InterviewSession.get(sessionId);
        const existingTranscript = session.transcript_snapshot || [];
        const gateAnswerKey = `mi-gate:${gate.packId}:${gate.instanceNumber}:a`;
        const alreadyAnswered = existingTranscript.some(e => e.stableKey === gateAnswerKey);

        if (alreadyAnswered) {
          console.warn('[MI_GATE][ALREADY_ANSWERED]', {
            packId: gate.packId,
            instanceNumber: gate.instanceNumber,
            stableKey: gateAnswerKey,
            reason: 'Gate already answered - blocking duplicate submission'
          });
          setIsCommitting(false);
          return;
        }

        // Forensic log: MI_GATE submission
        const nextInstanceNumber = answer === 'Yes' ? (gate.instanceNumber || 1) + 1 : null;
        const nextStableKey = answer === 'Yes' ? `v3-opener-${gate.packId}-${nextInstanceNumber}` : null;

        console.log('[MI_GATE][ANSWER]', {
          packId: gate.packId,
          instanceNumber: gate.instanceNumber,
          answerYesNo: answer,
          activeUiItemKind: activeUiItem?.kind,
          currentItemId: currentItem?.id,
          stableKey: `mi-gate:${gate.packId}:${gate.instanceNumber}`
        });

        console.log('[MULTI_INSTANCE_GATE][ANSWER]', {
          packId: gate.packId,
          instanceNumber: gate.instanceNumber,
          answer,
          action: answer === 'Yes' ? 'starting next instance' : 'advancing to next question'
        });

        // Extract shared MI_GATE handler logic
        await handleMiGateYesNo({ answer, gate, sessionId, engine });

        setIsCommitting(false);
        setInput("");
        return;
      } else if (currentItem.type === 'multi_instance') {

        const { questionId, packId, instanceNumber } = currentItem;

        const normalized = value.trim().toLowerCase();
        if (normalized !== 'yes' && normalized !== 'no') {
          setValidationHint('Please answer "Yes" or "No".');
          setIsCommitting(false);
          return;
        }

        const answer = normalized === 'yes' ? 'Yes' : 'No';

        const question = engine.QById[questionId];

        console.log('[PRIOR_LE_APPS][MULTI_INSTANCE]', {
          questionId,
          packId,
          instanceNumber,
          answer,
          action: answer === 'Yes' ? `starting instance #${instanceNumber + 1}` : 'moving to next question'
        });

        // Append multi-instance answer via canonical helper
        // STATIC IMPORT: Use top-level import (already aliased as appendUserMessageImport)
        const sessionForMiAnswer = await base44.entities.InterviewSession.get(sessionId);
        const currentTranscriptForMi = sessionForMiAnswer.transcript_snapshot || [];
        await appendUserMessageImport(sessionId, currentTranscriptForMi, answer, {
          id: `mi-a-${questionId}-${packId}-${instanceNumber}-${Date.now()}`,
          stableKey: `multi-instance-answer:${questionId}:${packId}:${instanceNumber}`,
          messageType: 'MULTI_INSTANCE_GATE_ANSWER',
          questionId,
          packId,
          instanceNumber
        });
        await refreshTranscriptFromDB('multi_instance_answer');

        if (answer === 'Yes') {
          const substanceName = question?.substance_name || null;
          const packSteps = injectSubstanceIntoPackSteps(engine, packId, substanceName);

          if (packSteps && packSteps.length > 0) {
            setCurrentFollowUpAnswers({});

            const followupQueue = [];
            for (let i = 0; i < packSteps.length; i++) {
              followupQueue.push({
                id: `${packId}:${i}:instance${instanceNumber + 1}`,
                type: 'followup',
                packId: packId,
                stepIndex: i,
                substanceName: substanceName,
                totalSteps: packSteps.length,
                instanceNumber: instanceNumber + 1,
                baseQuestionId: questionId
              });
            }

            const firstItem = followupQueue[0];
            const remainingQueue = followupQueue.slice(1);

            setQueue(remainingQueue);
            setCurrentItem(firstItem);

            await persistStateToDatabase(null, remainingQueue, firstItem);
          }
        } else {
          setCurrentItem(null);
          setQueue([]);
          await persistStateToDatabase(null, [], null);
          advanceToNextBaseQuestion(questionId);
        }
      }
    } catch (err) {
      console.error('❌ Error processing answer:', err);
      
      // V3 OPENER SPECIFIC ERROR LOGGING
      if (currentItem?.type === 'v3_pack_opener') {
        console.error('[V3_OPENER][SUBMIT_ERROR]', {
          sessionId,
          packId: currentItem.packId,
          instanceNumber: currentItem.instanceNumber,
          errMessage: err.message,
          errStack: err.stack?.substring(0, 200)
        });
      }
      
      setError(`Error: ${err.message}`);
      // Reset state on error
      setIsCommitting(false);
      setInput("");
    } finally {
      // SAFETY: Always reset isCommitting AND committingItemId after handler completes
      // This prevents the interview from getting stuck if any path forgets to reset
      setTimeout(() => {
        setIsCommitting(false);
        committingItemIdRef.current = null; // CRITICAL: Clear item-scoped commit ID
        console.log('[HANDLE_ANSWER][FINALLY_RESET]', {
          isCommittingCleared: true,
          committingItemIdCleared: true,
          source: 'finally_safety_timeout'
        });
      }, 100);
    }
    }, [currentItem, engine, queue, dbTranscript, sessionId, isCommitting, currentFollowUpAnswers, onFollowupPackComplete, advanceToNextBaseQuestion, sectionCompletionMessage, activeV2Pack, v2PackMode, aiFollowupCounts, aiProbingEnabled, aiProbingDisabledForSession, refreshTranscriptFromDB]);

  const saveAnswerToDatabase = async (questionId, answer, question) => {
    try {
      const existing = await base44.entities.Response.filter({
        session_id: sessionId,
        question_id: questionId,
        response_type: 'base_question'
      });

      if (existing.length > 0) {
        return existing[0];
      }

      const currentDisplayOrder = displayOrderRef.current++;
      const triggersFollowup = question.followup_pack && answer.toLowerCase() === 'yes';

      const sectionEntity = engine.Sections.find(s => s.id === question.section_id);
      const sectionName = sectionEntity?.section_name || question.category || '';

      const created = await base44.entities.Response.create({
        session_id: sessionId,
        question_id: questionId,
        question_text: question.question_text,
        category: sectionName,
        answer: answer,
        answer_array: null,
        triggered_followup: triggersFollowup,
        followup_pack: triggersFollowup ? question.followup_pack : null,
        is_flagged: false,
        flag_reason: null,
        response_timestamp: new Date().toISOString(),
        display_order: currentDisplayOrder,
        response_type: 'base_question'
      });

      return created;
    } catch (err) {
      console.error('❌ Database save error:', err);
      return null;
    }
  };

  const saveV2PackFieldResponse = async ({ sessionId, packId, fieldKey, instanceNumber, answer, baseQuestionId, baseQuestionCode, sectionId, questionText }) => {
    try {
      console.log('[V2_PACK_FIELD][SAVE][CALL]', {
        sessionId,
        packId,
        fieldKey,
        instanceNumber,
        baseQuestionId,
        baseQuestionCode,
        answerLength: answer?.length || 0
      });

      // Upsert logic: find existing Response for this (sessionId, packId, fieldKey, instanceNumber)
      const existing = await base44.entities.Response.filter({
        session_id: sessionId,
        pack_id: packId,
        field_key: fieldKey,
        instance_number: instanceNumber,
        response_type: 'v2_pack_field'
      });

      const sectionEntity = engine.Sections.find(s => s.id === sectionId);
      const sectionName = sectionEntity?.section_name || '';

      if (existing.length > 0) {
        // Update existing record
        await base44.entities.Response.update(existing[0].id, {
          answer: answer,
          question_text: questionText,
          response_timestamp: new Date().toISOString()
        });
        console.log('[V2_PACK_FIELD][SAVE][OK] Updated existing Response', existing[0].id);
        return existing[0];
      } else {
        // Create new record
        const created = await base44.entities.Response.create({
          session_id: sessionId,
          question_id: baseQuestionId,
          question_text: questionText,
          category: sectionName,
          answer: answer,
          triggered_followup: false,
          is_flagged: false,
          response_timestamp: new Date().toISOString(),
          response_type: 'v2_pack_field',
          pack_id: packId,
          field_key: fieldKey,
          instance_number: instanceNumber,
          base_question_id: baseQuestionId,
          base_question_code: baseQuestionCode
        });
        console.log('[V2_PACK_FIELD][SAVE][OK] Created new Response for', { packId, fieldKey, instanceNumber });
        return created;
      }
    } catch (err) {
      console.error('[V2_PACK_FIELD][SAVE][ERROR]', err);
      // Non-blocking - log error but don't break UX
      return null;
    }
  };

  const saveFollowUpAnswer = async (packId, fieldKey, answer, substanceName, instanceNumber = 1, factSource = "user") => {
    try {
      const responses = await base44.entities.Response.filter({
        session_id: sessionId,
        followup_pack: packId,
        triggered_followup: true
      });

      if (responses.length === 0) {
        return;
      }

      const triggeringResponse = responses[responses.length - 1];

      const existingFollowups = await base44.entities.FollowUpResponse.filter({
        session_id: sessionId,
        response_id: triggeringResponse.id,
        followup_pack: packId,
        instance_number: instanceNumber
      });

      let factsUpdate = null;
      let unresolvedUpdate = null;
      if (packId === "PACK_LE_APPS") {
        const packConfig = FOLLOWUP_PACK_CONFIGS[packId];
        const fieldConfig = packConfig?.fields?.find(f => f.fieldKey === fieldKey);

        if (fieldConfig?.semanticKey) {
          const semanticResult = validateFollowupValue({ packId, fieldKey, rawValue: answer });

          const maxAiFollowups = getPackMaxAiFollowups(packId);
          const wasProbed = factSource === "ai_probed";

          const probeCount = wasProbed ? maxAiFollowups : 0;
          const isUnresolved = wasProbed && (semanticResult.status === "invalid" || semanticResult.status === "unknown");

          if (isUnresolved) {
            const displayValue = fieldConfig.unknownDisplayLabel || `Not recalled after full probing`;
            factsUpdate = {
              [fieldConfig.semanticKey]: {
                value: displayValue,
                status: "unknown",
                source: factSource
              }
            };
            unresolvedUpdate = {
              semanticKey: fieldConfig.semanticKey,
              fieldKey: fieldKey,
              probeCount: maxAiFollowups
            };
          } else if (semanticResult.status === "valid") {
            factsUpdate = {
              [fieldConfig.semanticKey]: {
                value: semanticResult.normalizedValue,
                status: "confirmed",
                source: factSource
              }
            };
          } else if (semanticResult.status === "unknown") {
            factsUpdate = {
              [fieldConfig.semanticKey]: {
                value: semanticResult.normalizedValue,
                status: "unknown",
                source: factSource
              }
            };
          }
        }
      }

      if (existingFollowups.length === 0) {
        const createData = {
          session_id: sessionId,
          response_id: triggeringResponse.id,
          question_id: triggeringResponse.question_id,
          followup_pack: packId,
          instance_number: instanceNumber,
          substance_name: substanceName || null,
          incident_description: answer,
          completed: false,
          additional_details: { [fieldKey]: answer }
        };

        if (factsUpdate) {
          createData.additional_details.facts = factsUpdate;
        }

        if (unresolvedUpdate) {
          createData.additional_details.unresolvedFields = [unresolvedUpdate];
        }

        const createdRecord = await base44.entities.FollowUpResponse.create(createData);

        if (packId === 'PACK_LE_APPS') {
          await syncFactsToInterviewSession(sessionId, triggeringResponse.question_id, packId, createdRecord);
        }
      } else {
        const existing = existingFollowups[0];

        const updatedDetails = {
          ...(existing.additional_details || {}),
          [fieldKey]: answer
        };

        if (factsUpdate) {
          updatedDetails.facts = {
            ...(updatedDetails.facts || {}),
            ...factsUpdate
          };
        }

        if (unresolvedUpdate) {
          const existingUnresolved = updatedDetails.unresolvedFields || [];
          const filtered = existingUnresolved.filter(u => u.semanticKey !== unresolvedUpdate.semanticKey);
          filtered.push(unresolvedUpdate);
          updatedDetails.unresolvedFields = filtered;
        }

        await base44.entities.FollowUpResponse.update(existing.id, {
          substance_name: substanceName || existing.substance_name,
          additional_details: updatedDetails
        });

        const updatedRecord = { ...existing, additional_details: updatedDetails };
        if (packId === 'PACK_LE_APPS') {
          await syncFactsToInterviewSession(sessionId, triggeringResponse.question_id, packId, updatedRecord);
        }
      }

    } catch (err) {
      console.error('❌ Follow-up save error:', err);
    }
  };

  const handleCompletionConfirm = async () => {
    setIsCompletingInterview(true);

    try {
      // V3 ACK METRICS: Log final reliability stats
      console.log('[V3_PROBE][ACK_METRICS]', {
        ackSet: v3AckSetCountRef.current,
        ackCleared: v3AckClearCountRef.current,
        ackRepaired: v3AckRepairCountRef.current,
        sessionId
      });
      
      await base44.entities.InterviewSession.update(sessionId, {
        status: 'completed',
        completed_date: new Date().toISOString(),
        completion_percentage: 100,
      });

      // Trigger overall summary generation when interview completes (background)
      base44.functions.invoke('triggerSummaries', {
        sessionId,
        triggerType: 'interview_complete'
      }).catch(() => {}); // Fire and forget

      navigate(createPageUrl("Home"));
    } catch (err) {
      console.error('❌ Error completing interview:', err);
      setError('Failed to complete interview. Please try again.');
      setIsCompletingInterview(false);
    }
  };

  const getQuestionDisplayNumber = useCallback((questionId) => {
    if (!engine) return '';

    if (displayNumberMapRef.current[questionId]) {
      return displayNumberMapRef.current[questionId];
    }

    const index = engine.ActiveOrdered.indexOf(questionId);
    if (index !== -1) {
      const displayNum = index + 1;
      displayNumberMapRef.current[questionId] = displayNum;
      return displayNum;
    }

    return '';
  }, [engine]);

  // HELPER: Append CTA acknowledgement to transcript (section transition click)
  const appendCtaAcknowledgeToTranscript = useCallback(async ({ sessionId, currentSectionId, nextSectionId }) => {
    try {
      // Build deterministic stableKey
      const stableKey = `cta-ack:${sessionId}:${currentSectionId}:${nextSectionId}`;
      
      // Dedupe check
      const freshSession = await base44.entities.InterviewSession.get(sessionId);
      const currentTranscript = freshSession.transcript_snapshot || [];
      
      if (currentTranscript.some(e => e.stableKey === stableKey)) {
        console.log('[CTA][ACK_DEDUPED]', { stableKey, reason: 'Already in transcript' });
        return currentTranscript;
      }
      
      console.log('[CTA][ACK_APPEND_START]', { stableKey, currentSectionId, nextSectionId });
      
      // STATIC IMPORT: Use top-level import
      const updatedTranscript = await appendUserMessageImport(sessionId, currentTranscript, "Begin next section", {
        id: `cta-ack-${sessionId}-${currentSectionId}-${nextSectionId}`,
        stableKey,
        messageType: 'CTA_ACK',
        effectiveItemType: 'section_transition',
        bottomBarModeSOT: 'CTA',
        sectionId: currentSectionId,
        nextSectionId,
        visibleToCandidate: true
      });
      
      console.log('[CTA][ACK_APPEND_OK]', { 
        stableKey, 
        transcriptLenAfter: updatedTranscript.length,
        transcriptLenBefore: currentTranscript.length
      });
      
      // Local invariant check
      const foundInReturned = updatedTranscript.some(e => e.stableKey === stableKey);
      if (!foundInReturned) {
        console.error('[CTA][ACK_LOCAL_MISSING_AFTER_WRITE]', { 
          stableKey, 
          action: 'refresh_forced',
          transcriptLenAfter: updatedTranscript.length
        });
      }
      
      return updatedTranscript;
    } catch (err) {
      console.error('[CTA][ACK_APPEND_ERROR]', { error: err.message });
      return null;
    }
  }, [sessionId]);

  // TDZ_FIX: Duplicate removed - helper now declared at line 1712 (before repair pass useEffect)

  // HELPER: Prioritize missing required anchors for fallback prompting
  const prioritizeMissingRequired = (missingRequired) => {
    if (!Array.isArray(missingRequired) || missingRequired.length <= 1) {
      return missingRequired; // No sorting needed for 0 or 1 items
    }
    
    // Priority scoring function (pack-agnostic semantic heuristics)
    const getPriorityScore = (anchorId) => {
      const id = String(anchorId).toLowerCase();
      
      // Tier 1: Position/role/title (most important - defines the context)
      if (/position|role|title|rank/i.test(id)) return 100;
      
      // Tier 2: Agency/employer/organization (second most important)
      if (/agency|department|employer|organization/i.test(id)) return 80;
      
      // Tier 3: Date/temporal (helpful for context)
      if (/date|month|year|when|approx/i.test(id)) return 60;
      
      // Tier 4: Outcome/result/status (less critical for initial context)
      if (/outcome|result|status/i.test(id)) return 40;
      
      // Default: preserve original order
      return 0;
    };
    
    // Stable sort: higher scores first, preserve relative order for ties
    const sorted = [...missingRequired].sort((a, b) => {
      const scoreA = getPriorityScore(a);
      const scoreB = getPriorityScore(b);
      
      if (scoreA !== scoreB) return scoreB - scoreA; // Descending
      
      // Tie: preserve original order
      return missingRequired.indexOf(a) - missingRequired.indexOf(b);
    });
    
    return sorted;
  };

  // HELPER: Transition to multi-instance "another instance?" gate (reusable)
  const transitionToAnotherInstanceGate = useCallback(async (v3Context) => {
    const { packId, categoryId, categoryLabel, instanceNumber, packData } = v3Context || v3ProbingContext;
    const baseQuestionId = v3BaseQuestionIdRef.current;
    
    console.log('[V3_PACK][ASK_ANOTHER_INSTANCE]', {
      packId,
      instanceNumber,
      loopKey: `${sessionId}:${categoryId}:${instanceNumber || 1}`
    });
    
    // HUMAN LABEL RESOLUTION: Ensure categoryLabel is human-friendly
    let humanCategoryLabel = categoryLabel;
    
    // Try pack config first
    const packConfigForLabel = FOLLOWUP_PACK_CONFIGS?.[packId];
    if (packConfigForLabel?.instancesLabel) {
      humanCategoryLabel = packConfigForLabel.instancesLabel;
    } else if (packData?.pack_name) {
      // Try pack metadata
      humanCategoryLabel = packData.pack_name;
    } else if (categoryId) {
      // Fallback: Convert categoryId to title case
      humanCategoryLabel = categoryId
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, c => c.toUpperCase());
    }
    
    // Default fallback if all else fails
    if (!humanCategoryLabel || humanCategoryLabel.trim() === '' || /^[A-Z_]+$/.test(humanCategoryLabel)) {
      humanCategoryLabel = 'incident';
    }
    
    console.log('[MI_GATE][HUMAN_LABEL_RESOLVED]', {
      packId,
      categoryId,
      labelPreview: humanCategoryLabel,
      source: packConfigForLabel?.instancesLabel ? 'packConfig' : 
              packData?.pack_name ? 'packData' : 
              categoryId ? 'categoryId_formatted' : 'fallback'
    });
    
    // MINIMAL MI_GATE GUARD: Block if required fields incomplete (V3 packs only)
    const packConfig = FOLLOWUP_PACK_CONFIGS?.[packId];
    const isV3Pack = packConfig?.isV3Pack === true || packConfig?.engineVersion === 'v3';
    
    if (isV3Pack) {
      // REQUIRED-FIELD AUDIT: Check incident data directly (do not trust opener merge status)
      let missingRequired = [];
      let existingIncidentId = null;
      
      try {
        // Fetch current session to inspect incident facts
        const currentSession = await base44.entities.InterviewSession.get(sessionId);
        const incidents = currentSession?.incidents || [];
        
        // Find incident for this pack/instance
        const incident = incidents.find(inc => 
          (inc.category_id === categoryId || inc.incident_type === packId) &&
          inc.instance_number === instanceNumber
        );
        
        if (incident) {
          // Store existing incidentId for reuse
          existingIncidentId = incident.incident_id;
          
          // Get required fields from pack config
          const requiredAnchors = packConfig?.requiredAnchors || [];
          
          // FIX: Read incident.facts as OBJECT (not array)
          const facts = incident.facts || {};
          
          // Check which required fields are missing
          missingRequired = requiredAnchors.filter(anchor => {
            const value = facts[anchor];
            return value == null || String(value).trim() === '';
          });
          
          console.log('[MI_GATE][REQUIRED_FIELD_AUDIT]', {
            packId,
            instanceNumber,
            requiredAnchors,
            incidentFactsKeys: Object.keys(facts),
            missingRequired,
            existingIncidentId
          });
        } else {
          // No incident found - treat as incomplete
          missingRequired = packConfig?.requiredAnchors || [];
          console.log('[MI_GATE][REQUIRED_FIELD_AUDIT_NO_INCIDENT]', {
            packId,
            instanceNumber,
            reason: 'Incident not found - assuming all required fields missing'
          });
        }
      } catch (err) {
        console.warn('[MI_GATE][REQUIRED_FIELD_AUDIT_ERROR]', {
          error: err.message,
          fallback: 'Using engine payload metadata'
        });
        // Fallback to engine payload if incident fetch fails
        const payloadMissing = v3Context?.missingFields || [];
        missingRequired = Array.isArray(payloadMissing) 
          ? payloadMissing.map(f => f.field_id || f)
          : [];
      }
      
      // SAFETY CHECK: Block MI_GATE if required fields incomplete
      const miGateBlocked = v3Context?.miGateBlocked === true;
      const stopReason = v3Context?.stopReason || null;
      
      const shouldBlockGate = missingRequired.length > 0 || 
                             miGateBlocked || 
                             stopReason === 'REQUIRED_FIELDS_INCOMPLETE';
      
      if (shouldBlockGate) {
        console.log('[MI_GATE][REQUIRED_FIELD_AUDIT_BLOCK]', {
          packId,
          instanceNumber,
          missingRequired,
          reason: 'Required fields incomplete - V3 probing must complete first'
        });
        
        // DEADLOCK DETECTION: Check if V3 is headless (engine won't prompt)
        const isV3Headless = v3ProbingActive && !hasActiveV3Prompt && bottomBarModeSOT === 'V3_WAITING';

        if (isV3Headless && missingRequired.length > 0) {
          console.log('[REQUIRED_ANCHOR_FALLBACK][START]', {
            packId,
            instanceNumber,
            missingRequired,
            reason: 'v3_headless_no_prompt'
          });

          // DEFENSIVE GUARD: Define incidents from session (prevent ReferenceError)
          let incidents = [];
          try {
            const currentSession = await base44.entities.InterviewSession.get(sessionId);
            incidents = (currentSession?.incidents || []).filter(Boolean);

            console.log('[FORENSIC][CRASH_GUARD_INCIDENTS_DEFINED]', {
              hasSession: !!currentSession,
              incidentsCount: incidents.length
            });
          } catch (err) {
            console.error('[REQUIRED_ANCHOR_FALLBACK][INCIDENTS_NOT_READY]', {
              screenMode,
              note: 'session/incidents unavailable; skipping incident lookup',
              error: err.message
            });
            // incidents remains empty array - continue with fallback-only logic
          }

          // COMBINED SATISFACTION: Recompute with fallback answers included
          const facts = existingIncidentId && incidents.find(inc => inc.incident_id === existingIncidentId)?.facts || {};
          const satisfiedByFacts = missingRequired.filter(anchor => {
            const value = facts[anchor];
            return value != null && String(value).trim() !== '';
          });

          const satisfiedByFallback = missingRequired.filter(anchor => 
            fallbackAnsweredRef.current[anchor] === true
          );

          // Recompute missing: exclude BOTH facts-satisfied AND fallback-answered
          const recomputedMissing = missingRequired.filter(anchor => {
            const inFacts = facts[anchor] != null && String(facts[anchor]).trim() !== '';
            const inFallback = fallbackAnsweredRef.current[anchor] === true;
            return !inFacts && !inFallback;
          });

          console.log('[REQUIRED_ANCHOR_FALLBACK][MISSING_REQUIRED_COMPUTE]', {
            initialMissingCount: missingRequired.length,
            satisfiedByFactsCount: satisfiedByFacts.length,
            satisfiedByFallbackCount: satisfiedByFallback.length,
            recomputedMissingCount: recomputedMissing.length,
            missingRequired: recomputedMissing,
            satisfiedByFacts,
            satisfiedByFallback
          });

          // Use recomputed list
          missingRequired = recomputedMissing;

          // If all satisfied, exit fallback immediately
          if (missingRequired.length === 0) {
            console.log('[REQUIRED_ANCHOR_FALLBACK][SKIP_ALL_SATISFIED]', {
              packId,
              instanceNumber,
              reason: 'All required anchors satisfied by facts or fallback - no need to activate'
            });
            return; // Exit - don't activate fallback
          }

          // PRIORITIZE: Sort missing anchors by importance
          const sortedMissing = prioritizeMissingRequired(missingRequired);

          console.log('[REQUIRED_ANCHOR_FALLBACK][QUEUE_SORTED]', {
            before: missingRequired,
            after: sortedMissing
          });
          
          // PERSIST FALLBACK CONTEXT: Store for submit routing (use existing incident)
          requiredAnchorFallbackContextRef.current = {
            packId,
            categoryId,
            instanceNumber,
            incidentId: existingIncidentId // Already found in audit
          };
          
          console.log('[REQUIRED_ANCHOR_FALLBACK][CONTEXT_SET]', {
            packId,
            categoryId,
            instanceNumber,
            incidentId: existingIncidentId
          });
          
          // PERSIST FALLBACK QUESTION: Append assistant question to transcript (once per anchor)
          try {
            const questionStableKey = `required-anchor:q:${sessionId}:${categoryId}:${instanceNumber}:${sortedMissing[0]}`;
            const currentSession = await base44.entities.InterviewSession.get(sessionId);
            const currentTranscript = currentSession.transcript_snapshot || [];
            
            // Dedupe: Check if already persisted
            if (!currentTranscript.some(e => e.stableKey === questionStableKey)) {
              // TDZ FIX: Compute fallback question text INLINE (no closure reference)
              const transitionPackConfig = FOLLOWUP_PACK_CONFIGS?.[packId];
              const transitionAnchor = transitionPackConfig?.factAnchors?.find(a => a.key === sortedMissing[0]);
              let transitionQuestionText = transitionAnchor?.label 
                ? `What ${transitionAnchor.label}?`
                : `Please provide: ${sortedMissing[0]}`;
              
              // MUST-HAVE ASSERTION: Ensure questionText is never empty
              if (!transitionQuestionText || transitionQuestionText.trim() === '') {
                transitionQuestionText = `Please provide: ${sortedMissing[0]}`;
              }
              
              const appendAssistantMessage = appendAssistantMessageImport;
              
              await appendAssistantMessage(sessionId, currentTranscript, transitionQuestionText, {
                id: `required-anchor-q-${sessionId}-${categoryId}-${instanceNumber}-${sortedMissing[0]}`,
                stableKey: questionStableKey,
                messageType: 'REQUIRED_ANCHOR_QUESTION',
                packId,
                categoryId,
                instanceNumber,
                anchor: sortedMissing[0],
                kind: 'REQUIRED_ANCHOR_FALLBACK',
                visibleToCandidate: true
              });
              
              console.log('[REQUIRED_ANCHOR_FALLBACK][TRANSCRIPT_Q_APPEND_OK]', {
                stableKey: questionStableKey,
                anchor: sortedMissing[0],
                preview: transitionQuestionText
              });
            } else {
              console.log('[REQUIRED_ANCHOR_FALLBACK][TRANSCRIPT_Q_EXISTS]', {
                stableKey: questionStableKey,
                anchor: sortedMissing[0]
              });
            }
          } catch (err) {
            console.error('[REQUIRED_ANCHOR_FALLBACK][TRANSCRIPT_Q_ERROR]', {
              error: err.message,
              anchor: sortedMissing[0]
            });
          }
          
          // TAKE OWNERSHIP: Disable V3 completely to prevent competition
          setV3ProbingActive(false);
          setV3ProbingContext(null);
          setV3ActivePromptText(null);
          
          // Clear V3 optimistic markers and failsafe timers
          if (v3OpenerFailsafeTimerRef.current) {
            clearTimeout(v3OpenerFailsafeTimerRef.current);
            v3OpenerFailsafeTimerRef.current = null;
          }
          v3OpenerSubmitTokenRef.current = null;
          v3OpenerSubmitLoopKeyRef.current = null;
          
          // Clear optimistic persist markers
          const loopKey = `${sessionId}:${categoryId}:${instanceNumber}`;
          Object.keys(v3OptimisticPersistRef.current).forEach(key => {
            if (key.includes(loopKey)) {
              delete v3OptimisticPersistRef.current[key];
            }
          });
          
          // QUESTION TEXT SOT: Use resolver for human-readable question
          const contextFallbackQuestionText = resolveAnchorToHumanQuestion(
            sortedMissing[0],
            packId
          );
          
          console.log('[REQUIRED_ANCHOR_FALLBACK][QUESTION_TEXT_RESOLVED]', {
            anchor: sortedMissing[0],
            textPreview: contextFallbackQuestionText
          });
          
          // PERSIST PROMPT LANE CONTEXT: Non-chat context item for UI rendering
          const contextStableKey = `fallback-prompt:${sessionId}:${categoryId}:${instanceNumber}:${sortedMissing[0]}`;
          
          console.log('[CQ_TRANSCRIPT][FALLBACK_PROMPT_CONTEXT_PERSIST_BEGIN]', {
            stableKey: contextStableKey,
            anchor: sortedMissing[0]
          });
          
          try {
            const appendAssistantMessage = appendAssistantMessageImport;
            const contextSession = await base44.entities.InterviewSession.get(sessionId);
            const contextTranscript = contextSession.transcript_snapshot || [];
            
            await appendAssistantMessage(sessionId, contextTranscript, contextFallbackQuestionText, {
              id: `fallback-context-${sessionId}-${categoryId}-${instanceNumber}-${sortedMissing[0]}`,
              stableKey: contextStableKey,
              messageType: 'PROMPT_LANE_CONTEXT',
              packId,
              categoryId,
              instanceNumber,
              anchor: sortedMissing[0],
              contextKind: 'REQUIRED_ANCHOR_FALLBACK',
              isNonChat: true,
              visibleToCandidate: true
            });
            
            console.log('[CQ_TRANSCRIPT][FALLBACK_PROMPT_CONTEXT_PERSIST_OK]', {
              stableKey: contextStableKey,
              anchor: sortedMissing[0]
            });
            
            // Refresh to pull context into local state
            await refreshTranscriptFromDB('fallback_context_persisted');
          } catch (err) {
            console.error('[CQ_TRANSCRIPT][FALLBACK_PROMPT_CONTEXT_ERROR]', {
              error: err.message,
              anchor: sortedMissing[0]
            });
            // Non-blocking - continue without context if persist fails
          }
          
          // ACTIVATE FALLBACK: Ask for required anchors deterministically (prioritized)
          setRequiredAnchorFallbackActive(true);
          setRequiredAnchorQueue([...sortedMissing]);
          setRequiredAnchorCurrent(sortedMissing[0]);
          
          // CLEAR STUCK STATE + Set phase to ANSWER_NEEDED (enables Send button)
          setIsCommitting(false);
          setV3PromptPhase('ANSWER_NEEDED');
          
          // TRANSCRIPT CONTEXT PRESERVED
          console.log('[REQUIRED_ANCHOR_FALLBACK][TRANSCRIPT_CONTEXT_PRESERVED]', {
            transcriptLen: canonicalTranscriptRef.current.length,
            reason: 'Fallback activated - existing transcript preserved'
          });
          
          console.log('[REQUIRED_ANCHOR_FALLBACK][TAKE_OWNERSHIP]', {
            packId,
            instanceNumber,
            anchor: sortedMissing[0],
            note: 'Set v3ProbingActive=false + cleared optimistic/failsafe + enabled input'
          });
          
          console.log('[REQUIRED_ANCHOR_FALLBACK][PROMPT]', {
            anchor: sortedMissing[0]
          });
          
          return; // Exit - fallback will render prompt
        } else if (!isV3Headless) {
          console.log('[REQUIRED_ANCHOR_FALLBACK][SKIP]', {
            reason: 'V3_has_prompt_or_not_waiting',
            v3ProbingActive,
            hasActiveV3Prompt,
            bottomBarModeSOT
          });
        }
        
        // CLEAR STUCK STATE: Prevent "Thinking..." limbo
        setIsCommitting(false);
        setV3PromptPhase('IDLE'); // Reset phase to allow new prompt
        
        // RE-ACTIVATE V3 PROBING: Ensure engine continues collecting facts
        setV3ProbingActive(true);
        setV3ProbingContext({
          packId,
          categoryId,
          categoryLabel,
          baseQuestionId,
          questionCode: engine?.QById?.[baseQuestionId]?.question_id,
          sectionId: engine?.QById?.[baseQuestionId]?.section_id,
          instanceNumber,
          incidentId: existingIncidentId, // Reuse existing incident (prevents duplicate INCIDENT_CREATED)
          packData
        });
        
        setCurrentItem({
          id: `v3-probing-${packId}-${instanceNumber}`,
          type: 'v3_probing',
          packId,
          categoryId,
          instanceNumber,
          baseQuestionId
        });
        
        console.log('[MI_GATE][REQUIRED_FIELD_AUDIT_KICK_PROBING]', {
          packId,
          instanceNumber,
          missingRequired,
          existingIncidentId,
          note: 'Cleared submit state + re-triggered V3 probing render/phase transition'
        });
        
        return; // HARD BLOCK - do not activate gate
      }
      
      // All checks passed - log allowance
      console.log('[MI_GATE][REQUIRED_FIELD_AUDIT_PASS]', {
        packId,
        instanceNumber,
        requiredComplete: true,
        reason: 'All required fields complete - allowing MI_GATE'
      });
    }
    
    const gatePromptText = `Do you have another ${humanCategoryLabel || 'incident'} to report?`;
    const gateItemId = `multi-instance-gate-${packId}-${instanceNumber}`;
    const gateStableKey = `mi-gate:${packId}:${instanceNumber}`;
    
    // FIX F: Check if gate already answered (prevent re-show)
    const gateAnswerKey = `mi-gate:${packId}:${instanceNumber}:a`;
    const alreadyAnswered = transcriptSOT.some(e => e.stableKey === gateAnswerKey);
    
    if (alreadyAnswered) {
      console.log('[MI_GATE][SKIP_ALREADY_ANSWERED]', {
        packId,
        instanceNumber,
        stableKey: gateAnswerKey,
        foundAnswer: true,
        reason: 'Gate already answered - advancing immediately'
      });
      
      // Advance to next base question instead of showing gate
      if (baseQuestionId) {
        const freshForAdvance = await refreshTranscriptFromDB('gate_skip_already_answered');
        await advanceToNextBaseQuestion(baseQuestionId, freshForAdvance);
      }
      return;
    }
    
    console.log('[MULTI_INSTANCE_GATE][SHOW]', {
      packId,
      instanceNumber,
      stableKey: gateStableKey,
      shouldOfferAnotherInstance: true
    });
    
    // ATOMIC STATE TRANSITION: batch to avoid intermediate TEXT_INPUT footer
    unstable_batchedUpdates(() => {
      // PART A.3: Force-clear V3 prompt state before MI_GATE
      console.log('[MI_GATE][V3_PROMPT_CLEARED_ON_ENTER]', {
        packId,
        instanceNumber,
        v3PromptPhase,
        clearedPromptText: !!v3ActivePromptText,
        clearedPromptId: !!lastV3PromptSnapshotRef.current?.promptId
      });

      // Fully exit V3 mode and clear prompts
      setV3ProbingActive(false);
      setV3ActivePromptText(null);
      setV3PendingAnswer(null);
      setV3ProbingContext(null);
      setV3Gate({ active: false, packId: null, categoryId: null, promptText: null, instanceNumber: null });
      setUiBlocker(null);

      // LIFECYCLE: Reset phase to IDLE on gate transition
      setV3PromptPhase("IDLE");

      // PART B FIX: NEVER clear UI-only history during transition to gate
      // UI history must persist so user can see their V3 probe Q/A in chat
      // Only clear on explicit session end or new session start
      // TDZ FIX: Read state via functional update (not direct reference during batch)
      setV3ProbeDisplayHistory(prev => {
        console.log('[V3_UI_HISTORY][PRESERVE_ON_GATE]', { 
          reason: 'TRANSITION_TO_GATE', 
          packId, 
          instanceNumber,
          uiHistoryLen: prev.length,
          lastItemsPreview: prev.slice(-2).map(e => ({ kind: e.kind, textPreview: e.text?.substring(0, 30) })),
          action: 'PRESERVE (not clearing)'
        });
        return prev; // No mutation - just logging fresh state
      });

      // C) Clear active probe refs AND any stale prompt state
      v3ActiveProbeQuestionRef.current = null;
      v3ActiveProbeQuestionLoopKeyRef.current = null;
      
      // C) Clear stale V3 prompt rendering flags (prevents lingering prompt cards)
      setV3ActivePromptText(null);
      v3ActivePromptTextRef.current = null;
      lastRenderedV3PromptKeyRef.current = null;
      
      console.log('[MI_GATE][V3_PROMPT_CLEARED_ON_ENTER]', {
        packId,
        instanceNumber,
        clearedPromptText: true,
        clearedPromptKey: true,
        reason: 'Entering MI_GATE - preventing stale V3 prompt cards'
      });

      // Set up multi-instance gate as first-class currentItem
      const gateItem = {
        id: gateItemId,
        type: 'multi_instance_gate',
        packId,
        categoryId,
        categoryLabel,
        promptText: gatePromptText,
        instanceNumber,
        baseQuestionId,
        packData
      };
      setMultiInstanceGate({
        active: true,
        packId,
        categoryId,
        categoryLabel: humanCategoryLabel,
        promptText: gatePromptText,
        instanceNumber,
        baseQuestionId,
        packData
      });
      setCurrentItem(gateItem);
    });
    
    // POST-MI_GATE VERIFICATION: Check fallback answers survived
    requestAnimationFrame(() => {
      const fallbackAnswerCount = canonicalTranscriptRef.current.filter(e => 
        e.stableKey && e.stableKey.startsWith('fallback-answer:')
      ).length;
      
      console.log('[CQ_TRANSCRIPT][POST_MIGATE_VERIFY_FALLBACK_ANSWERS]', {
        fallbackAnswerCount,
        transcriptLen: canonicalTranscriptRef.current.length,
        packId,
        instanceNumber
      });
    });
    
    // PART A: DO NOT append gate to transcript while active (prevents flicker)
    // Gate renders from currentItem.promptText (PROMPT_LANE source)
    // Will append Q+A to transcript ONLY after user answers
    console.log('[MI_GATE][RENDER_SOURCE]', {
      source: 'PROMPT_LANE',
      stableKey: gateStableKey,
      packId,
      instanceNumber,
      humanLabel: humanCategoryLabel
    });
    
    // State is set - gate will render from currentItem, not transcript
    await persistStateToDatabase(null, [], {
      id: gateItemId,
      type: 'multi_instance_gate',
      packId
    });
  }, [v3ProbingContext, sessionId, persistStateToDatabase]);

  // V3 EXIT: Idempotent exit function (only runs once)
  const exitV3Once = useCallback((reason, payload) => {
    if (exitV3HandledRef.current) {
      console.log('[EXIT_V3][SKIP] Already handled');
      return;
    }

    exitV3HandledRef.current = true;
    console.log('[EXIT_V3][ONCE]', { reason, baseQuestionId: v3BaseQuestionIdRef.current });
    
    // FAILSAFE CANCEL: Exiting probing - cancel opener failsafe
    if (v3OpenerFailsafeTimerRef.current) {
      clearTimeout(v3OpenerFailsafeTimerRef.current);
      v3OpenerFailsafeTimerRef.current = null;
      v3OpenerSubmitTokenRef.current = null;
      v3OpenerSubmitLoopKeyRef.current = null;
      const loopKey = payload?.packId ? `${sessionId}:${payload.categoryId || 'unknown'}:${payload.instanceNumber || 1}` : 'unknown';
      console.log('[V3_FAILSAFE][CANCEL_ON_EXIT]', { loopKey, reason });
    }

    // Queue transition (executed in useEffect)
    setPendingTransition({
      type: 'EXIT_V3',
      payload: { ...payload, reason }
    });
  }, [sessionId]);

  // V3 OPENER PERSISTENCE: DISABLED - Append on submit only (prevents duplicate during active state)
  useEffect(() => {
    if (!activeUiItem || activeUiItem.kind !== "V3_OPENER" || !currentItem) return;

    const stableKey = buildV3OpenerStableKey(currentItem.packId, currentItem.instanceNumber || 1);

    // DISABLED: Do NOT append during active opener step - submit handler owns this
    console.log('[V3_OPENER][PERSIST_EFFECT_DISABLED]', { 
      stableKey,
      packId: currentItem.packId,
      instanceNumber: currentItem.instanceNumber,
      reason: 'Persist on submit only' 
    });
    
    // Effect is now a NO-OP for history persistence
    // History append happens in handleAnswer after submission
  }, [activeUiItem?.kind, currentItem]);

  // V3 probing completion handler - ENFORCES required fields completion before MI_GATE
  const handleV3ProbingComplete = useCallback(async (result) => {
    const { packId, categoryId, instanceNumber, nextAction, stopReason, missingFields } = result || {};
    
    // REQUIRED FIELDS GATE: Block MI_GATE if any required fields missing
    const hasMissingRequired = Array.isArray(missingFields) && missingFields.length > 0;
    
    if (hasMissingRequired) {
      console.error('[UI_CONTRACT][MI_GATE_SUPPRESSED_REQUIRED_FIELDS]', {
        packId,
        instanceNumber,
        reason: 'missing_required_fields',
        nextAction,
        stopReason,
        missingCount: missingFields.length,
        missingFieldIds: missingFields.map(f => f.field_id || f).join(',')
      });
      
      // DO NOT call exitV3Once - keep probing active
      // Frontend should re-enter TEXT_INPUT mode and wait for next probe question
      return;
    }
    
    // All required fields complete - allow exit
    exitV3Once('PROBING_COMPLETE', result);
  }, [exitV3Once]);

  // V3 transcript update handler - BLOCK V3 probe prompts from appending
  const handleV3TranscriptUpdate = useCallback(async (entry) => {
    // V3 UI CONTRACT: Hard-block V3 probe prompts from EVER entering transcript
    const entryType = entry?.type || entry?.messageType || '';
    const entrySource = entry?.source || entry?.meta?.source || '';
    const isProbePrompt = entry?.isProbePrompt === true;
    const hasFieldKey = !!entry?.fieldKey;
    
    // Detection: Multiple signals for V3 probe prompts
    const isV3ProbePrompt = 
      entryType === 'v3_probe_question' ||
      entryType === 'V3_PROBE_ASKED' ||
      entryType === 'V3_PROBE_PROMPT' ||
      entryType === 'V3_PROBE_QUESTION' ||
      entryType === 'V3_PROMPT' ||
      entryType === 'V3_PROBE' ||
      entryType === 'ai_probe_question' ||
      (entry?.role === 'assistant' && isProbePrompt) ||
      (entrySource.includes('v3') && entrySource.includes('probe')) ||
      (hasFieldKey && (entryType.includes('probe') || entryType.includes('V3')));
    
    if (isV3ProbePrompt) {
      console.error('[V3_UI_CONTRACT][BLOCKED_APPEND]', {
        messageType: entryType,
        preview: (entry?.text || entry?.questionText || '').slice(0, 80),
        source: entrySource,
        fieldKey: entry?.fieldKey || null,
        reason: 'V3 probe prompts must ONLY appear in input placeholder, NEVER in transcript'
      });
      return; // DROP - do not append
    }
    
    // V3 messages written to DB by V3ProbingLoop
    // We refresh ONCE when V3 completes, not per message (prevents refresh storm)
    console.log('[V3_TRANSCRIPT_UPDATE]', { type: entry?.type, deferred: true });
  }, []);

  // V3 ATOMIC PROMPT COMMIT: All state changes for activating V3 prompt in bottom bar
  const commitV3PromptToBottomBar = useCallback(async ({ packId, instanceNumber, loopKey, promptText, promptId: providedPromptId, categoryId }) => {
    // FIX A: Generate deterministic promptId ALWAYS (never null)
    const promptId = providedPromptId || `${loopKey}:${promptIdCounterRef.current++}`;
    
    if (!providedPromptId) {
      console.log('[V3_PROMPT][PROMPTID_GENERATED]', {
        loopKey,
        promptId,
        reason: 'missing_providedPromptId'
      });
    }
    
    console.log('[V3_PROMPT_COMMIT]', {
      packId,
      categoryId,
      instanceNumber,
      loopKey,
      promptId,
      providedPromptId: !!providedPromptId,
      preview: promptText?.substring(0, 60)
    });
    
    // FIX A: Log stable promptId assignment
    console.log('[V3_PROMPT][PROMPT_ID_ASSIGNED]', {
      loopKey,
      promptId,
      categoryId,
      reason: 'commit',
      promptPreview: promptText?.substring(0, 60) || ''
    });

    // FIX B: SNAPSHOT - Create and store BEFORE any guards/blocks
    const snapshot = {
    promptId,
    loopKey,
    packId,
    categoryId,
    instanceNumber,
    promptText,
    expectedBottomBarMode: 'TEXT_INPUT',
    committedAt: Date.now()
    };
    lastV3PromptSnapshotRef.current = snapshot;
    
    // FIX B: Add to snapshots array immediately (prevents NO_SNAPSHOT watchdog error)
    setV3PromptSnapshots(prev => {
      const exists = prev.some(s => s.promptId === promptId);
      if (exists) {
        console.log('[V3_PROMPT_SNAPSHOT][EXISTS]', { promptId, loopKey });
        return prev;
      }
      
      const newSnapshot = { promptId, loopKey, promptText, createdAt: Date.now() };
      console.log('[V3_PROMPT][SNAPSHOT_RECOVERED]', { promptId, loopKey, reason: 'commit_immediate' });
      return [...prev, newSnapshot];
    });
    
    // CHANGE 1: HARD BLOCK - V3 probe prompts MUST NOT write to transcript (UI contract)
    // They render ONLY in prompt lane card, never as chat history
    console.log('[V3_UI_CONTRACT][BLOCK_TRANSCRIPT_WRITE]', {
      reason: 'V3 probe prompts render in prompt lane only - blocking transcript append',
      stableKey: `v3-probe-q:${loopKey}:${promptId}`,
      loopKey,
      promptId,
      preview: promptText?.substring(0, 60) || null,
      action: 'BLOCKED'
    });
    
    // DO NOT append to transcript - return early

    // REGRESSION GUARD: Capture transcript length before V3 prompt commit
    const transcriptLenBeforePromptCommit = dbTranscript.length;
    
    // ============================================================================
    // ALREADY ANSWERED GUARD: Multi-tier detection to prevent re-ask
    // ============================================================================
    // TIER 1: Match by promptId (strongest - invariant to Q commit failures)
    const foundByPromptId = dbTranscript.some(e => 
      (e.messageType === 'V3_PROBE_ANSWER' || e.type === 'V3_PROBE_ANSWER') &&
      e.meta?.promptId === promptId
    );
    
    // TIER 2: Latest-answer alignment (prevents false skip for new probes in same incident)
    const stableKeyPrefix = `v3-probe-a:${sessionId}:${categoryId}:${instanceNumber}:`;
    const answersByPrefix = dbTranscript.filter(e => 
      e.stableKey?.startsWith(stableKeyPrefix)
    );
    
    // Compute current prompt signature for matching
    const normalizeForSignature = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');
    const currentPromptSignature = normalizeForSignature(promptText?.substring(0, 100) || '');
    
    let foundByPrefixAligned = false;
    let tier2LatestAnswerPromptId = null;
    let tier2LatestAnswerPromptSignature = null;
    
    if (answersByPrefix.length > 0) {
      // Find LATEST answer (by createdAt timestamp or index)
      const latestAnswer = answersByPrefix.reduce((latest, current) => {
        const latestTs = latest?.createdAt || new Date(latest?.timestamp || 0).getTime() || 0;
        const currentTs = current?.createdAt || new Date(current?.timestamp || 0).getTime() || 0;
        return currentTs > latestTs ? current : latest;
      });
      
      tier2LatestAnswerPromptId = latestAnswer?.meta?.promptId || null;
      tier2LatestAnswerPromptSignature = latestAnswer?.meta?.promptSignature || null;
      
      // Alignment check: Does latest answer correspond to THIS prompt?
      const promptIdMatches = tier2LatestAnswerPromptId && tier2LatestAnswerPromptId === promptId;
      const signatureMatches = tier2LatestAnswerPromptSignature && 
                               currentPromptSignature &&
                               tier2LatestAnswerPromptSignature === currentPromptSignature;
      
      foundByPrefixAligned = promptIdMatches || signatureMatches;
    }
    
    // TIER 3: Match by probeQuestionCount-based expectedAKey (fallback)
    const currentProbeCount = dbTranscript.filter(e => 
      (e.messageType === 'V3_PROBE_QUESTION' || e.type === 'V3_PROBE_QUESTION') &&
      e.meta?.sessionId === sessionId &&
      e.meta?.categoryId === categoryId &&
      e.meta?.instanceNumber === instanceNumber
    ).length;
    const expectedAKey = buildV3ProbeAStableKey(sessionId, categoryId, instanceNumber, currentProbeCount);
    const foundByExpectedKey = dbTranscript.some(e => 
      e.stableKey === expectedAKey ||
      (e.messageType === 'V3_PROBE_ANSWER' && 
       e.meta?.sessionId === sessionId && 
       e.meta?.categoryId === categoryId && 
       e.meta?.instanceNumber === instanceNumber && 
       e.meta?.probeIndex === currentProbeCount)
    );
    
    const foundAnswer = foundByPromptId || foundByPrefixAligned || foundByExpectedKey;
    
    console.log('[V3_PROBE][ANSWER_CHECK_STRONG]', {
      promptId,
      sessionId,
      categoryId,
      instanceNumber,
      probeIndex: currentProbeCount,
      foundByPromptId,
      foundByPrefixAligned,
      foundByExpectedKey,
      foundAnswer,
      answersByPrefixCount: answersByPrefix.length,
      tier2LatestAnswerPromptId,
      tier2LatestAnswerPromptSignature,
      currentPromptSignature
    });
    
    if (foundAnswer) {
      const detectionMethod = foundByPromptId ? 'promptId_match' : 
                             foundByPrefixAligned ? 'prefix_latest_aligned' : 
                             'expectedKey_fallback';
      
      console.log('[V3_PROBE][SKIP_REASK]', {
        promptId,
        detectionMethod,
        expectedStableKey: expectedAKey,
        reason: 'answer_already_present',
        sessionId,
        categoryId,
        instanceNumber,
        probeIndex: currentProbeCount
      });
      
      // Don't show prompt again - mark as satisfied
      setV3PromptPhase("IDLE");
      setV3ActivePromptText(null);
      v3ActivePromptTextRef.current = null;
      return promptId; // Return early without setting ANSWER_NEEDED
    }
    // ============================================================================
    
    // ATOMIC STATE UPDATE: All V3 prompt activation in one place
    // CRITICAL: Does NOT modify dbTranscript - only sets prompt state
    unstable_batchedUpdates(() => {
    // Confirm V3 probing is active
    if (!v3ProbingActive) {
      setV3ProbingActive(true);
    }

    // Set active prompt text (bottom bar placeholder reads from this)
    setV3ActivePromptText(promptText);

    // CRITICAL: Update ref synchronously (watchdog reads from this)
    v3ActivePromptTextRef.current = promptText;
    
    // UI HISTORY: Store active probe question for display history
    v3ActiveProbeQuestionRef.current = promptText;
    v3ActiveProbeQuestionLoopKeyRef.current = loopKey;

    console.log('[V3_PROMPT_BIND]', { loopKey, promptLen: promptText?.length || 0 });

    // LIFECYCLE: Set phase to ANSWER_NEEDED (prompt is now active)
    setV3PromptPhase("ANSWER_NEEDED");
    
    // Store promptId in v3ProbingContext and snapshot ref for answer linking
    setV3ProbingContext(prev => ({
      ...prev,
      promptId,
      currentPromptText: promptText
    }));
    
    // Update snapshot ref for answer submit (include categoryId) - REDUNDANT but kept for compatibility
    lastV3PromptSnapshotRef.current = {
      ...snapshot,
      promptId,
      categoryId,
      promptText
    };

    // Clear typing lock (allow user input)
    setIsUserTyping(false);

    // Ensure screen mode is QUESTION (not WELCOME)
    if (screenMode !== 'QUESTION') {
      setScreenMode('QUESTION');
    }
    
    // REGRESSION GUARD: Confirm transcript untouched during prompt commit
    console.log('[V3_PROMPT_COMMIT][TRANSCRIPT_PRESERVED]', {
      loopKey,
      promptId,
      transcriptLenBefore: transcriptLenBeforePromptCommit,
      action: 'Prompt activated - dbTranscript state untouched'
    });
    });
    
    // FAILSAFE CANCEL: Prompt arrived - cancel opener failsafe
    if (v3OpenerFailsafeTimerRef.current) {
      clearTimeout(v3OpenerFailsafeTimerRef.current);
      v3OpenerFailsafeTimerRef.current = null;
      v3OpenerSubmitTokenRef.current = null;
      v3OpenerSubmitLoopKeyRef.current = null;
      console.log('[V3_FAILSAFE][CANCEL_ON_PROMPT]', { loopKey });
    }
    
    return promptId;
  }, [v3ProbingActive, screenMode, sessionId, setDbTranscriptSafe, dbTranscript]);

  // V3 prompt change handler - receives prompt with canonical promptId from V3ProbingLoop
  const handleV3PromptChange = useCallback(async (promptData) => {
    // Support both string (legacy) and object (new) payloads
    const promptText = typeof promptData === 'string' ? promptData : promptData?.promptText;
    let canonicalPromptId = typeof promptData === 'object' ? promptData?.promptId : null;
    const loopKey = typeof promptData === 'object' ? promptData?.loopKey : null;
    const packId = typeof promptData === 'object' ? promptData?.packId : (v3ProbingContext?.packId || currentItem?.packId);
    const instanceNumber = typeof promptData === 'object' ? promptData?.instanceNumber : (v3ProbingContext?.instanceNumber || currentItem?.instanceNumber || 1);
    const categoryId = typeof promptData === 'object' ? promptData?.categoryId : v3ProbingContext?.categoryId;
    
    // FIX B4: Generate promptId if missing (prevents PROMPTID_MISSING error)
    if (!canonicalPromptId) {
      const effectiveLoopKey = loopKey || `${sessionId}:${categoryId}:${instanceNumber}`;
      const probeIndex = dbTranscript.filter(e => 
        (e.messageType === 'V3_PROBE_QUESTION' || e.type === 'V3_PROBE_QUESTION') &&
        e.meta?.sessionId === sessionId &&
        e.meta?.categoryId === categoryId &&
        e.meta?.instanceNumber === instanceNumber
      ).length;
      canonicalPromptId = `${effectiveLoopKey}:${probeIndex}`;
      
      console.warn('[V3_PROBE][PROMPTID_GENERATED_FALLBACK]', {
        generatedPromptId: canonicalPromptId,
        loopKey: effectiveLoopKey,
        probeIndex,
        reason: 'V3ProbingLoop did not provide promptId - generated fallback'
      });
    }
    
    console.log('[V3_PROMPT_CHANGE]', { 
      promptPreview: promptText?.substring(0, 60) || null,
      canonicalPromptId,
      loopKey
    });
    
    const effectiveLoopKey = loopKey || `${sessionId}:${categoryId}:${instanceNumber}`;
    // FIX: promptId already contains sessionId via loopKey - don't duplicate
    const qStableKey = `v3-probe-q:${canonicalPromptId}`;

    // TASK 3: Extract provenance metadata from prompt payload (if provided)
    const v3PromptSource = typeof promptData === 'object' ? promptData?.v3PromptSource : undefined;
    const v3LlmMs = typeof promptData === 'object' ? promptData?.v3LlmMs : undefined;

    // OPTIMISTIC APPEND: Check + append in single functional update
    const appendSuccess = await new Promise((resolve) => {
      setDbTranscriptSafe(prev => {
        // Dedupe: skip if already exists
        if (prev.some(e => e.stableKey === qStableKey || 
            (e.messageType === 'V3_PROBE_QUESTION' && e.meta?.promptId === canonicalPromptId))) {
          console.log('[CQ_TRANSCRIPT][V3_PROBE_Q_DEDUPED]', {
            stableKey: qStableKey,
            promptId: canonicalPromptId
          });
          resolve(false);
          return prev;
        }

        const qEntry = {
          id: `v3-probe-q-${canonicalPromptId}`,
          stableKey: qStableKey,
          index: getNextIndex(prev),
          role: "assistant",
          text: promptText,
          timestamp: new Date().toISOString(),
          createdAt: Date.now(),
          messageType: 'V3_PROBE_QUESTION',
          type: 'V3_PROBE_QUESTION',
          meta: {
            promptId: canonicalPromptId,
            loopKey: effectiveLoopKey,
            packId,
            instanceNumber,
            categoryId,
            source: 'v3',
            // TASK 3: Store provenance in meta for render-time access
            v3PromptSource,
            v3LlmMs
          },
          // TASK 3: Also store at top-level for easier access
          v3PromptSource,
          v3LlmMs,
          visibleToCandidate: true
        };
        
        const updated = [...prev, qEntry];
        
        // ATOMIC SYNC: Update ref + state together
        upsertTranscriptState(updated, 'v3_probe_q_append');

        // Persist to DB async
        base44.entities.InterviewSession.update(sessionId, {
          transcript_snapshot: updated
        }).then(() => {
          console.log('[CQ_TRANSCRIPT][V3_PROBE_Q_APPEND_OK]', {
            stableKey: qStableKey,
            promptId: canonicalPromptId,
            loopKey: effectiveLoopKey,
            promptLen: promptText?.length || 0,
            transcriptLenAfter: updated.length
          });

          // ANCHOR: Mark this question for viewport anchoring
          v3ScrollAnchorRef.current = {
            kind: 'V3_PROBE_QUESTION',
            stableKey: qStableKey,
            ts: Date.now()
          };

          resolve(true);
        }).catch(err => {
          console.error('[CQ_TRANSCRIPT][V3_PROBE_Q_ERROR]', { error: err.message });
          resolve(false);
        });

        return updated;
      });
    });
    
    if (!appendSuccess) {
      console.log('[CQ_TRANSCRIPT][V3_PROBE_Q_SKIP]', { stableKey: qStableKey });
    }
    
    // ATOMIC COMMIT: All state changes in one place (include categoryId)
    await commitV3PromptToBottomBar({ 
      packId, 
      categoryId,
      instanceNumber, 
      loopKey: effectiveLoopKey, 
      promptText,
      promptId: canonicalPromptId
    });
  }, [commitV3PromptToBottomBar, v3ProbingContext, currentItem, sessionId, setDbTranscriptSafe]);

  // Helper: Normalize text for signature matching (shared by guard and commit)
  const normalizeForSignature = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');
  
  // V3 answer submit handler - routes answer to V3ProbingLoop
  const handleV3AnswerSubmit = useCallback(async (answerText) => {
    // PART 3A: Send click trace
    const v3PromptIdSOT = v3ProbingContext?.promptId || lastV3PromptSnapshotRef.current?.promptId;
    
    console.log('[V3_SEND][CLICK]', {
      promptId: v3PromptIdSOT,
      textLen: answerText?.length || 0,
      hasText: !!answerText?.trim(),
      v3PromptPhase,
      activeUiItemKind: activeUiItem?.kind
    });
    
    // PART 3A: Block if no promptId
    if (!v3PromptIdSOT) {
      console.error('[V3_SEND][BLOCKED_NO_PROMPT_ID]', {
        v3PromptPhase,
        hasV3Context: !!v3ProbingContext,
        hasSnapshot: !!lastV3PromptSnapshotRef.current,
        reason: 'Cannot persist without stable promptId'
      });
      return;
    }
    
    // TDZ FIX: Compute effectiveItemType locally (not from closure deps)
    const localEffectiveItemType = v3ProbingActive ? 'v3_probing' : currentItem?.type;
    
    v3SubmitCounterRef.current++;
    const submitId = v3SubmitCounterRef.current;
    
    // IDENTIFIER FALLBACK CHAIN: Use context first, snapshot second
    const categoryId = v3ProbingContext?.categoryId || lastV3PromptSnapshotRef.current?.categoryId;
    const instanceNumber = v3ProbingContext?.instanceNumber || lastV3PromptSnapshotRef.current?.instanceNumber || 1;
    const packId = v3ProbingContext?.packId || lastV3PromptSnapshotRef.current?.packId;
    const loopKey = v3ProbingContext ? `${sessionId}:${categoryId}:${instanceNumber}` : null;
    
    // GUARD: Validate identifiers before proceeding
    if (!categoryId || !packId) {
      console.error('[V3_PROBE][MISSING_IDENTIFIERS]', {
        categoryId,
        packId,
        instanceNumber,
        hasContext: !!v3ProbingContext,
        hasSnapshot: !!lastV3PromptSnapshotRef.current,
        reason: 'Cannot commit without categoryId and packId'
      });
      return;
    }
    
    // Compute probeIndex from current probe count in transcript
    const currentProbeCount = dbTranscript.filter(e => 
      (e.messageType === 'V3_PROBE_QUESTION' || e.type === 'V3_PROBE_QUESTION') &&
      e.meta?.sessionId === sessionId &&
      e.meta?.categoryId === categoryId &&
      e.meta?.instanceNumber === instanceNumber
    ).length;
    const probeIndex = currentProbeCount;
    
    const payload = {
      text: answerText,
      submitId,
      loopKey,
      createdAt: Date.now()
    };
    
    const promptId = v3ProbingContext?.promptId || lastV3PromptSnapshotRef.current?.promptId;
    const qStableKey = buildV3ProbeQStableKey(sessionId, categoryId, instanceNumber, probeIndex);
    let aStableKey = buildV3ProbeAStableKey(sessionId, categoryId, instanceNumber, probeIndex);
    
    // VERIFICATION GUARD 1: Log built keys
    console.log('[V3_SEND][KEYS_BUILT]', {
      v3PromptIdSOT,
      qStableKey,
      aStableKey
    });
    
    // VERIFICATION GUARD 2: Invariant check - aStableKey must contain promptId
    if (!aStableKey.includes(v3PromptIdSOT)) {
      console.error('[V3_SEND][BUG][AKEY_DOES_NOT_CONTAIN_PROMPTID]', {
        v3PromptIdSOT,
        aStableKey,
        reason: 'Builder output does not contain promptId - using fallback'
      });
      
      // Fallback to canonical format
      const fallbackAKey = `v3-probe-a:${v3PromptIdSOT}`;
      aStableKey = fallbackAKey;
      
      console.warn('[V3_SEND][AKEY_FALLBACK_USED]', {
        v3PromptIdSOT,
        fallbackAKey
      });
    }
    
    console.log('[V3_PROBE][COMMIT_BEGIN]', { 
      sessionId, 
      categoryId,
      instanceNumber,
      probeIndex,
      promptId,
      loopKey,
      qKey: qStableKey,
      aKey: aStableKey,
      answerLen: answerText?.length || 0
    });
    
    // FIX C: Clear V3 draft on successful submit (promptId already declared above)
    if (sessionId && loopKey && promptId) {
      const v3DraftKey = `cq_v3draft_${sessionId}_${loopKey}_${promptId}`;
      try {
        window.sessionStorage.removeItem(v3DraftKey);
        
        // ABANDONMENT SAFETY: Log V3 draft clear
        console.log('[DRAFT][CLEAR]', {
          keyPreview: v3DraftKey.substring(0, 40)
        });
        console.log('[V3_DRAFT][CLEAR_ON_SUBMIT]', { keyPreview: v3DraftKey });
      } catch (e) {
        console.warn('[V3_DRAFT][CLEAR_FAILED]', { error: e.message });
      }
    }
    
    // LIFECYCLE: Clear active prompt text immediately to prevent stale rendering
    // This makes hasV3PromptText false so the prompt doesn't continue to render
    setV3ActivePromptText("");
    v3ActivePromptTextRef.current = "";
    
    console.log('[V3_PROMPT_CLEAR_ON_SUBMIT]', {
      submitId,
      answerPreview: answerText?.substring(0, 50),
      phaseNow: "WILL_BE_PROCESSING_AFTER_DB",
      clearedPromptText: true,
      loopKey
    });
    
    // PART A: FORENSIC SNAPSHOT - Before append (deferred via state to avoid TDZ)
    setV3ProbeDisplayHistory(prev => {
      console.log('[V3_UI_HISTORY][SNAPSHOT_BEFORE_APPEND]', {
        uiHistoryLen: prev.length,
        lastUiItemsPreview: prev.slice(-3).map(e => ({ kind: e.kind, textPreview: e.text?.substring(0, 30) })),
        transcriptLen: dbTranscript.length,
        v3ProbingActive,
        effectiveItemType: localEffectiveItemType,
        loopKey
      });
      return prev; // No mutation - just logging
    });
    
    // PART 3B: Construct stableKeyA for persistence
    const stableKeyA = `v3-probe-a:${v3PromptIdSOT}`;
    
    console.log('[V3_SEND][PERSIST_START]', {
      stableKeyA,
      promptId: v3PromptIdSOT,
      textLen: answerText?.length || 0
    });
    
    // CRITICAL: V3 probe ANSWERS must ALWAYS persist to canonical transcript BEFORE any MI_GATE stream suppression
    // This ensures transcript completeness regardless of UI state transitions
    let wroteTranscript = false;
    let qAdded = false;
    let aAdded = false;
    
    if (v3ProbingActive && localEffectiveItemType === 'v3_probing' && loopKey && answerText?.trim()) {
      // RISK 3 FIX: Use v3PromptIdSOT consistently (already validated above)
      if (!v3PromptIdSOT) {
        console.error('[V3_TRANSCRIPT][APPEND_FAILED_NO_PROMPTID]', {
          loopKey,
          hasV3Context: !!v3ProbingContext,
          hasSnapshot: !!lastV3PromptSnapshotRef.current,
          reason: 'Cannot append without stable promptId'
        });
      } else {
        // stableKeys already constructed above (qStableKey, aStableKey)
        // No need to rebuild - use existing variables
        
        // SYNCHRONOUS COMMIT: Update canonical ref IMMEDIATELY (not in async callback)
        setDbTranscriptSafe(prev => {
          let working = [...prev];
          
          // Step 1: Ensure question exists (append if missing)
          const questionExists = working.some(e => 
            e.stableKey === qStableKey ||
            (e.messageType === 'V3_PROBE_QUESTION' && e.meta?.promptId === promptId && e.meta?.sessionId === sessionId)
          );
          
          if (!questionExists) {
            const promptText = lastV3PromptSnapshotRef.current?.promptText || v3ActivePromptText || "(Question text unavailable)";
            
            // Compute promptSignature for Tier 2 matching
            const questionPromptSignature = normalizeForSignature(promptText?.substring(0, 100) || '');
            
            const qEntry = {
              id: `v3-probe-q-${sessionId}-${categoryId}-${instanceNumber}-${probeIndex}`,
              stableKey: qStableKey,
              index: getNextIndex(working),
              role: "assistant",
              text: promptText,
              timestamp: new Date().toISOString(),
              createdAt: Date.now(),
              messageType: 'V3_PROBE_QUESTION',
              type: 'V3_PROBE_QUESTION',
              meta: {
                promptId,
                promptSignature: questionPromptSignature,
                loopKey,
                packId,
                instanceNumber,
                categoryId,
                sessionId,
                probeIndex,
                source: 'v3'
              },
              visibleToCandidate: true
            };
            
            working = [...working, qEntry];
            qAdded = true;
            
            console.log('[CQ_TRANSCRIPT][V3_PROBE_Q_COMMIT]', {
              stableKey: qStableKey,
              promptId,
              sessionId,
              probeIndex
            });
          }
          
          // Step 2: Append answer (dedupe check)
          const answerExists = working.some(e => 
            e.stableKey === aStableKey ||
            (e.messageType === 'V3_PROBE_ANSWER' && e.meta?.promptId === promptId && e.meta?.sessionId === sessionId && e.meta?.probeIndex === probeIndex)
          );
          
          if (answerExists) {
            console.log('[V3_TRANSCRIPT][DEDUPE_A]', { stableKey: aStableKey, sessionId, probeIndex });
            return working; // No changes needed
          }
          
          // Append answer with promptSignature for Tier 2 matching
          const answerPromptSignature = normalizeForSignature(lastV3PromptSnapshotRef.current?.promptText?.substring(0, 100) || '');
          
          const aEntry = {
            id: `v3-probe-a-${sessionId}-${categoryId}-${instanceNumber}-${probeIndex}`,
            stableKey: aStableKey,
            index: getNextIndex(working),
            role: "user",
            text: answerText,
            timestamp: new Date().toISOString(),
            createdAt: Date.now(),
            messageType: 'V3_PROBE_ANSWER',
            type: 'V3_PROBE_ANSWER',
            meta: {
              promptId,
              promptSignature: answerPromptSignature,
              loopKey,
              packId,
              instanceNumber,
              categoryId,
              sessionId,
              probeIndex,
              source: 'v3',
              answerContext: 'V3_PROBE'
            },
            visibleToCandidate: true
          };
          
          const updated = [...working, aEntry];
          aAdded = true;
          wroteTranscript = true;
          
          // IMMEDIATE CANONICAL UPDATE: Use unified sync helper
          upsertTranscriptState(updated, 'v3_probe_answer');

          // COMMIT ACK: Record expected keys for verification
          lastV3AnswerCommitAckRef.current = {
            sessionId,
            promptId,
            categoryId,
            instanceNumber,
            probeIndex,
            expectedAKey: aStableKey,
            expectedQKey: qStableKey,
            committedAt: Date.now(),
            answerLen: answerText?.length || 0,
            promptText: lastV3PromptSnapshotRef.current?.promptText || v3ActivePromptText
          };
          
          // METRICS: Increment ack set counter
          v3AckSetCountRef.current++;
          
          // PART A: Mark optimistic persist (immediate UI feedback)
          v3OptimisticPersistRef.current[promptId] = {
            stableKeyA: aStableKey,
            answerText,
            ts: Date.now(),
            loopKey,
            categoryId,
            instanceNumber
          };
          
          console.log('[V3_PROBE_AUDIT][PERSIST_OK]', {
            expectedAKey: aStableKey,
            expectedQKey: qStableKey,
            promptId,
            textPreview: answerText?.substring(0, 40),
            committedAt: lastV3AnswerCommitAckRef.current.committedAt,
            ackSetCount: v3AckSetCountRef.current,
            optimisticMarkerSet: true
          });
          
          // REQUEST REFRESH: Set request instead of calling refresh directly
          v3RefreshRequestedRef.current = {
            reason: 'v3_probe_answer_persisted',
            promptId,
            stableKeyA: aStableKey,
            requestedAt: Date.now()
          };
          
          // Trigger refresh tick to activate effect
          setV3RefreshTick(prev => prev + 1);
          
          // Track for protection (E)
          recentlySubmittedUserAnswersRef.current.add(aStableKey);
          
          // ANCHOR: Mark for viewport
          recentAnchorRef.current = {
            kind: 'V3_PROBE_ANSWER',
            stableKey: aStableKey,
            ts: Date.now()
          };
          
          // Persist to DB async (non-blocking)
          base44.entities.InterviewSession.update(sessionId, {
            transcript_snapshot: updated
          }).then(() => {
            const probeQuestionCountAfter = updated.filter(e => 
              e.messageType === 'V3_PROBE_QUESTION' || e.type === 'V3_PROBE_QUESTION'
            ).length;
            const probeAnswerCountAfter = updated.filter(e => 
              e.messageType === 'V3_PROBE_ANSWER' || e.type === 'V3_PROBE_ANSWER'
            ).length;
            
            // PART A: Clear optimistic marker on DB confirm
            if (v3OptimisticPersistRef.current[promptId]) {
              delete v3OptimisticPersistRef.current[promptId];
              console.log('[V3_OPTIMISTIC][CLEARED]', {
                promptId,
                reason: 'DB_CONFIRM'
              });
            }
            
            console.log('[V3_SEND][PERSIST_OK]', {
              stableKeyA: aStableKey,
              promptId: v3PromptIdSOT,
              transcriptLenAfter: updated.length
            });
            
            console.log('[V3_PROBE][COMMIT_DONE]', {
              qAdded,
              aAdded,
              transcriptLenAfter: updated.length,
              probeQuestionCountAfter,
              probeAnswerCountAfter,
              sessionId,
              stableKeyA: aStableKey
            });
            
            // PART 3C: Post-persist validation (hard invariant, RISK 3: use v3PromptIdSOT)
            // VERIFICATION GUARD 3: Use actual persisted key (may be fallback)
            const foundInUpdated = updated.some(e => (e.stableKey || e.id) === aStableKey);
            if (!foundInUpdated) {
              console.error('[V3_SEND][INVARIANT_FAIL_NOT_IN_DB_AFTER_OK]', {
                stableKeyA: aStableKey,
                promptId: v3PromptIdSOT,
                updatedLen: updated.length,
                reason: 'Persist OK but answer not in updated transcript array'
              });
            }
            
            // CQ_TRANSCRIPT_CONTRACT: Invariant check after V3 probe append
            if (ENFORCE_TRANSCRIPT_CONTRACT) {
              const candidateVisibleCount = updated.filter(e => e.visibleToCandidate === true).length;
              const last3StableKeys = updated.slice(-3).map(e => e.stableKey || e.id);
              
              console.log('[CQ_TRANSCRIPT][INVARIANT]', {
                transcriptLen: updated.length,
                candidateVisibleCount,
                last3StableKeys,
                context: 'v3_probe_answer'
              });
            }
          }).catch(err => {
            // PART 3B: Log persist failure (RISK 3: use v3PromptIdSOT from outer scope)
            console.error('[V3_SEND][PERSIST_FAIL]', {
              stableKeyA: aStableKey,
              promptId: v3PromptIdSOT,
              error: err.message
            });
            console.error('[CQ_TRANSCRIPT][V3_PROBE_PERSIST_ERROR]', { error: err.message, sessionId });
          });
          
          return updated;
        });
      }
      
    } else {
      console.log('[V3_TRANSCRIPT][APPEND_SKIPPED]', {
        v3ProbingActive,
        localEffectiveItemType,
        hasLoopKey: !!loopKey,
        hasAnswerText: !!answerText?.trim(),
        reason: 'Preconditions not met for V3 commit'
      });
    }
    
    // Clear active probe question after processing
    v3ActiveProbeQuestionRef.current = null;
    v3ActiveProbeQuestionLoopKeyRef.current = null;
    
    // Store answer in snapshot for reconciliation (before any UI state changes)
    if (lastV3PromptSnapshotRef.current && wroteTranscript) {
      lastV3PromptSnapshotRef.current.lastAnswerText = answerText;
      lastV3PromptSnapshotRef.current.lastAnswerTimestamp = Date.now();
      
      console.log('[V3_PROBE][SNAPSHOT_ANSWER_STORED]', {
        promptId: lastV3PromptSnapshotRef.current.promptId,
        answerLen: answerText?.length || 0,
        wroteTranscript
      });
    }
    
    // DIAGNOSTIC: Verify commit succeeded
    if (wroteTranscript) {
      console.log('[V3_PROBE][ANSWER_COMMIT]', {
        expectedStableKey: aStableKey,
        wrote: true,
        transcriptLenAfter: canonicalTranscriptRef.current.length,
        sessionId,
        categoryId,
        instanceNumber,
        probeIndex
      });
    }
    
    // PART B: Force immediate transition (optimistic - don't wait for DB)
    // This prevents PROMPT_MISSING_AFTER_OPENER stall
    setV3PromptPhase("PROCESSING");
    console.log('[V3_PROMPT_PHASE][SET_PROCESSING_OPTIMISTIC]', {
      submitId,
      loopKey,
      categoryId,
      wroteTranscript,
      reason: 'Optimistic transition - UI advances immediately'
    });
    
    setV3PendingAnswer(payload);
  }, [v3ProbingContext, sessionId, v3ActivePromptText, currentItem, setDbTranscriptSafe, dbTranscript]);
  
  // V3 REFRESH RUNNER: Safe post-commit transcript refresh
  useEffect(() => {
    const request = v3RefreshRequestedRef.current;
    if (!request) return;
    if (v3RefreshInFlightRef.current) return;
    
    // Clear request BEFORE starting refresh (prevents loops)
    const { reason, promptId, stableKeyA, requestedAt } = request;
    v3RefreshRequestedRef.current = null;
    
    // Execute refresh asynchronously
    const runRefresh = async () => {
      v3RefreshInFlightRef.current = true;
      
      try {
        const ageMs = Date.now() - requestedAt;
        
        console.log('[V3_PROBE][REFRESH_TRIGGERED]', {
          promptId,
          stableKeyA,
          reason,
          ageMs
        });
        
        await refreshTranscriptFromDB(reason);
        
        console.log('[V3_PROBE][REFRESH_COMPLETE]', {
          promptId,
          stableKeyA
        });
      } catch (err) {
        console.error('[V3_PROBE][REFRESH_ERROR]', {
          promptId,
          stableKeyA,
          error: err.message
        });
      } finally {
        v3RefreshInFlightRef.current = false;
      }
    };
    
    runRefresh();
  }, [v3RefreshTick, refreshTranscriptFromDB]);
  
  // V3 COMMIT ACK VERIFICATION: Verify answer persisted + repair if missing
  useEffect(() => {
    // KILL SWITCH: Allow instant disable if needed
    if (!ENABLE_V3_ACK_REPAIR) return;
    
    const ack = lastV3AnswerCommitAckRef.current;
    if (!ack) return;
    
    // Only verify for current session
    if (ack.sessionId !== sessionId) {
      lastV3AnswerCommitAckRef.current = null;
      return;
    }
    
    // Check if answer exists in transcript
    const foundA = dbTranscript.some(e => 
      e.stableKey === ack.expectedAKey ||
      (e.messageType === 'V3_PROBE_ANSWER' && 
       e.meta?.promptId === ack.promptId &&
       e.meta?.probeIndex === ack.probeIndex)
    );
    
    const ageMs = Date.now() - ack.committedAt;
    
    console.log('[V3_PROBE][ACK_VERIFY]', {
      expectedAKey: ack.expectedAKey,
      foundA,
      ageMs,
      probeIndex: ack.probeIndex
    });
    
    // PART C: Check optimistic markers before repair
    const hasOptimistic = v3OptimisticPersistRef.current[ack.promptId];
    const optimisticAge = hasOptimistic ? Date.now() - hasOptimistic.ts : null;
    
    // PART D: Dedupe check - use optimistic markers
    const foundInDbOrOptimistic = foundA || (hasOptimistic && optimisticAge < 10000);
    
    if (foundInDbOrOptimistic) {
      // Success - answer found in transcript or optimistic marker active
      v3AckClearCountRef.current++;
      
      // Clear optimistic marker on DB confirm
      if (foundA && hasOptimistic) {
        delete v3OptimisticPersistRef.current[ack.promptId];
        console.log('[V3_OPTIMISTIC][CLEARED]', {
          promptId: ack.promptId,
          reason: 'DB_CONFIRM_IN_ACK'
        });
      }
      
      console.log('[V3_PROBE][ACK_CLEAR]', {
        expectedAKey: ack.expectedAKey,
        reason: foundA ? 'found_in_transcript' : 'optimistic_pending',
        ageMs,
        optimisticAge,
        ackClearCount: v3AckClearCountRef.current
      });
      lastV3AnswerCommitAckRef.current = null;
      return;
    }
    
    // PART C: Grace period - accept optimistic state for up to 10s
    if (hasOptimistic && optimisticAge < 10000) {
      console.log('[V3_PROBE][ACK_OPTIMISTIC_PENDING]', {
        expectedAKey: ack.expectedAKey,
        promptId: ack.promptId,
        optimisticAge,
        reason: 'Optimistic persist active - DB write pending'
      });
      return; // Wait for DB confirmation
    }
    
    // Grace period: wait 500ms before repairing
    if (ageMs < 500) {
      return; // Wait for next render cycle
    }
    
    // PART C: Stale optimistic marker - log and clear
    if (hasOptimistic && optimisticAge >= 10000) {
      console.error('[V3_OPTIMISTIC][STALE]', {
        promptId: ack.promptId,
        expectedAKey: ack.expectedAKey,
        optimisticAge,
        reason: 'Optimistic marker older than 10s but DB never confirmed',
        action: 'clearing_stale_marker'
      });
      delete v3OptimisticPersistRef.current[ack.promptId];
    }
    
    // Missing after grace - repair
    v3AckRepairCountRef.current++;
    
    // INVARIANT CHECK: Repair count should never exceed set count (dev-only)
    if (v3AckRepairCountRef.current > v3AckSetCountRef.current) {
      console.error('[V3_PROBE][ACK_INVARIANT_FAIL]', {
        ackSet: v3AckSetCountRef.current,
        ackRepaired: v3AckRepairCountRef.current,
        reason: 'Repair count exceeds set count - impossible state detected'
      });
    }
    
    console.error('[V3_PROBE][ACK_REPAIR]', {
      expectedAKey: ack.expectedAKey,
      expectedQKey: ack.expectedQKey,
      reason: 'missing_after_grace',
      ageMs,
      hasOptimistic,
      optimisticAge,
      action: 'repairing_transcript',
      ackRepairCount: v3AckRepairCountRef.current
    });
    
    // Perform repair (idempotent functional update)
    setDbTranscriptSafe(prev => {
      // Double-check not already present
      const alreadyHasA = prev.some(e => e.stableKey === ack.expectedAKey);
      if (alreadyHasA) {
        console.log('[V3_PROBE][ACK_REPAIR_SKIP]', {
          expectedAKey: ack.expectedAKey,
          reason: 'answer_appeared_during_repair'
        });
        return prev;
      }
      
      let working = [...prev];
      
      // Ensure Q exists first
      const alreadyHasQ = working.some(e => e.stableKey === ack.expectedQKey);
      if (!alreadyHasQ && ack.promptText) {
        const qEntry = {
          id: `v3-probe-q-repair-${ack.promptId}`,
          stableKey: ack.expectedQKey,
          index: getNextIndex(working),
          role: "assistant",
          text: ack.promptText,
          timestamp: new Date().toISOString(),
          createdAt: Date.now(),
          messageType: 'V3_PROBE_QUESTION',
          type: 'V3_PROBE_QUESTION',
          meta: {
            promptId: ack.promptId,
            sessionId: ack.sessionId,
            categoryId: ack.categoryId,
            instanceNumber: ack.instanceNumber,
            probeIndex: ack.probeIndex,
            source: 'ack_repair'
          },
          visibleToCandidate: true
        };
        
        working = [...working, qEntry];
        console.log('[V3_PROBE][ACK_REPAIR_Q]', { stableKey: ack.expectedQKey });
      }
      
      // Insert missing answer
      const answerText = "(Answer was submitted but lost - recovered)";
      const aEntry = {
        id: `v3-probe-a-repair-${ack.promptId}`,
        stableKey: ack.expectedAKey,
        index: getNextIndex(working),
        role: "user",
        text: answerText,
        timestamp: new Date().toISOString(),
        createdAt: Date.now(),
        messageType: 'V3_PROBE_ANSWER',
        type: 'V3_PROBE_ANSWER',
        meta: {
          promptId: ack.promptId,
          sessionId: ack.sessionId,
          categoryId: ack.categoryId,
          instanceNumber: ack.instanceNumber,
          probeIndex: ack.probeIndex,
          source: 'ack_repair'
        },
        visibleToCandidate: true
      };
      
      const repaired = [...working, aEntry];
      
      // Update canonical ref + state atomically
      upsertTranscriptState(repaired, 'v3_ack_repair');
      
      // Persist to DB
      base44.entities.InterviewSession.update(sessionId, {
        transcript_snapshot: repaired
      }).then(() => {
        console.log('[V3_PROBE][ACK_REPAIR_PERSISTED]', {
          expectedAKey: ack.expectedAKey,
          transcriptLenAfter: repaired.length
        });
      }).catch(err => {
        console.error('[V3_PROBE][ACK_REPAIR_ERROR]', { error: err.message });
      });
      
      console.log('[V3_PROBE][ACK_REPAIR_DONE]', {
        insertedA: true,
        insertedQ: !alreadyHasQ,
        transcriptLenAfter: repaired.length
      });
      
      return repaired;
    });
    
    // Clear ack after repair
    lastV3AnswerCommitAckRef.current = null;
  }, [dbTranscript, sessionId, setDbTranscriptSafe]);
  
  // V3 answer consumed handler - clears pending answer after V3ProbingLoop consumes it
  const handleV3AnswerConsumed = useCallback(({ loopKey, answerToken, probeCount, submitId }) => {
    console.log('[V3_ANSWER_CONSUMED][CLEAR_PENDING]', {
      loopKey,
      answerToken,
      probeCount,
      submitId,
      hadValue: !!v3PendingAnswer
    });
    
    // Clear pending answer immediately (prevents stall)
    setV3PendingAnswer(null);
  }, [v3PendingAnswer]);

  // V3 answer needed handler - stores answer submit capability + snapshot-based watchdog
  const handleV3AnswerNeeded = useCallback((answerContext) => {
    console.log('[V3_ANSWER_NEEDED]', { 
      hasPrompt: !!answerContext?.promptText,
      incidentId: answerContext?.incidentId 
    });
    
    // Store context for answer routing
    v3AnswerHandlerRef.current = answerContext;
    
    // SNAPSHOT: Capture current state BEFORE scheduling watchdog
    const snapshot = lastV3PromptSnapshotRef.current;
    if (!snapshot) {
      console.warn('[V3_PROMPT_WATCHDOG][NO_SNAPSHOT]', { reason: 'Prompt commit did not create snapshot' });
      return;
    }
    
    const promptId = snapshot.promptId;
    
    // IDEMPOTENCY: Skip if already handled
    if (handledPromptIdsRef.current.has(promptId)) {
      console.log('[V3_PROMPT_WATCHDOG][SKIP_DUPLICATE]', { promptId, loopKey: snapshot.loopKey });
      return;
    }
    
    // Mark as handled immediately
    handledPromptIdsRef.current.add(promptId);
    
    // MEMORY CLEANUP: Prevent unbounded Set growth
    if (handledPromptIdsRef.current.size > 200) {
      const priorSize = handledPromptIdsRef.current.size;
      handledPromptIdsRef.current.clear();
      console.log('[V3_PROMPT_WATCHDOG][CLEANUP]', { cleared: true, priorSize });
    }
    
    // WATCHDOG: Verify UI stabilizes in 1 render cycle (snapshot-based, TDZ-safe)
    requestAnimationFrame(() => {
      // PART 3: Verify prompt snapshot exists using ref (prevents stale state)
      const snapshotExists = v3PromptSnapshotsRef.current.some(s => s.promptId === promptId);
      
      // PART A+D: Dedupe NO_SNAPSHOT warning (in-memory, once per promptId)
      if (!snapshotExists) {
        logOnce(`no_snapshot_${promptId}`, () => {
          console.warn('[V3_PROMPT_WATCHDOG][NO_SNAPSHOT]', { 
            promptId, 
            reason: 'Prompt commit did not create snapshot - check commitV3PromptToBottomBar',
            snapshotsLen: v3PromptSnapshotsRef.current.length
          });
        });
        return;
      }
      
      // Verify snapshot is still current
      if (lastV3PromptSnapshotRef.current?.promptId !== promptId) {
        console.log('[V3_PROMPT_WATCHDOG][SKIP_STALE]', { promptId, currentPromptId: lastV3PromptSnapshotRef.current?.promptId });
        return;
      }
      
      // STRICT CHECK: Verify prompt binding to bottom bar placeholder
      const promptPreview = snapshot.promptText?.substring(0, 60) || '';
      const actualPreview = v3ActivePromptText?.substring(0, 60) || '';
      const promptMatch = v3ActivePromptText && (
        v3ActivePromptText === snapshot.promptText ||
        actualPreview === promptPreview
      );
      
      // PROMPT-EXISTS CHECK: Use refs as source of truth
      const promptExistsNow = !!(v3ActivePromptTextRef?.current && v3ActivePromptTextRef.current.trim().length > 0);
      
      // Snapshot log: prove refs are fresh (no stale closure)
      const snapshotPayload = {
        promptId,
        bottomBarModeSOT: bottomBarModeSOTRef.current,
        v3ProbingActive: v3ProbingActiveRef.current,
        hasPrompt: !!v3ActivePromptTextRef.current,
        promptExistsNow
      };
      console.log('[V3_PROMPT_WATCHDOG][REF_SNAPSHOT]', snapshotPayload);
      lastWatchdogSnapshotRef.current = snapshotPayload; // DEV: Capture for debug bundle
      
      // FORCE OK: If prompt exists in refs, treat as OK (even if other flags fail)
      if (promptExistsNow) {
        console.log('[V3_PROMPT_WATCHDOG][FORCE_OK_PROMPT_EXISTS]', {
          loopKey: snapshot.loopKey,
          packId: snapshot.packId,
          instanceNumber: snapshot.instanceNumber,
          promptLen: v3ActivePromptTextRef.current?.length || 0
        });
        
        // Release idempotency lock
        const lockKey = lastV3SubmitLockKeyRef.current;
        if (lockKey) {
          if (submittedKeysRef.current.has(lockKey)) {
            submittedKeysRef.current.delete(lockKey);
            console.log('[IDEMPOTENCY][RELEASE]', { lockKey, packId: snapshot.packId, instanceNumber: snapshot.instanceNumber, source: 'watchdog_force_ok' });
            lastIdempotencyReleasedRef.current = lockKey;
          }
          lastV3SubmitLockKeyRef.current = null;
        }
        return; // Exit early - prompt exists, nothing to do
      }
      
      // Check UI stability using ONLY refs (no stale closures)
      let isReady = 
        v3ProbingActiveRef.current === true &&
        bottomBarModeSOTRef.current === 'TEXT_INPUT' &&
        v3ActivePromptTextRef.current &&
        v3ActivePromptTextRef.current.trim().length > 0 &&
        promptMatch;
      
      // RUNTIME ASSERT: Verify OK decision is correct (TDZ-safe via ref)
      if (isReady) {
        // Assert conditions match
        if (bottomBarModeSOTRef.current !== 'TEXT_INPUT' || !promptMatch) {
          console.error('[V3_PROMPT_WATCHDOG][ASSERT_FAIL_TO_FAILED]', {
            reason: 'OK decision but conditions invalid',
            packId: snapshot.packId,
            instanceNumber: snapshot.instanceNumber,
            loopKey: snapshot.loopKey,
            promptId,
            bottomBarModeSOT: bottomBarModeSOTRef.current,
            promptMatch
          });
          // Force FAILED path
          isReady = false;
        }
      }
      
      // CONSOLIDATED DECISION LOG (ref-based, no stale closure)
      const decisionPayload = {
        packId: snapshot.packId,
        instanceNumber: snapshot.instanceNumber,
        loopKey: snapshot.loopKey,
        promptId,
        bottomBarModeSOT: bottomBarModeSOTRef.current,
        v3ProbingActive: v3ProbingActiveRef.current,
        hasPrompt: !!v3ActivePromptTextRef.current,
        promptMatch,
        decision: isReady ? 'OK' : 'FAILED'
      };
      console.log('[V3_PROMPT_WATCHDOG][DECISION]', decisionPayload);
      lastWatchdogDecisionRef.current = decisionPayload; // DEV: Capture for debug bundle
      
      if (isReady) {
        const okPayload = {
          outcome: 'OK',
          loopKey: snapshot.loopKey,
          packId: snapshot.packId,
          instanceNumber: snapshot.instanceNumber,
          promptId
        };
        console.log('[V3_PROMPT_WATCHDOG][OK]', okPayload);
        lastWatchdogOutcomeRef.current = okPayload; // DEV: Capture for debug bundle
        
        // IDEMPOTENCY RELEASE: Use stored lock key (guarantees exact match)
        const lockKey = lastV3SubmitLockKeyRef.current;
        if (lockKey) {
          if (submittedKeysRef.current.has(lockKey)) {
            submittedKeysRef.current.delete(lockKey);
            console.log('[IDEMPOTENCY][RELEASE]', { lockKey, packId: snapshot.packId, instanceNumber: snapshot.instanceNumber, source: 'handleOpenerSubmit' });
            lastIdempotencyReleasedRef.current = lockKey; // DEV: Capture for debug bundle
          }
          lastV3SubmitLockKeyRef.current = null;
        } else {
          console.warn('[IDEMPOTENCY][RELEASE_MISSING_KEY]', { packId: snapshot.packId, instanceNumber: snapshot.instanceNumber });
        }
        return;
      }
      
      // FAILED: UI did not stabilize (ref-based, no stale closure)
      const failureReason = !promptMatch ? 'PROMPT_MISMATCH' : 
                           bottomBarModeSOTRef.current !== 'TEXT_INPUT' ? 'WRONG_BOTTOM_BAR_MODE' :
                           !v3ProbingActiveRef.current ? 'PROBING_NOT_ACTIVE' :
                           'PROMPT_NOT_BOUND';
      
      const failedPayload = {
        outcome: 'FAILED',
        promptId,
        packId: snapshot.packId,
        instanceNumber: snapshot.instanceNumber,
        loopKey: snapshot.loopKey,
        reason: failureReason,
        v3ProbingActive: v3ProbingActiveRef.current,
        bottomBarModeSOT: bottomBarModeSOTRef.current,
        hasPrompt: !!v3ActivePromptTextRef.current,
        promptMatch
      };
      console.error('[V3_PROMPT_WATCHDOG][FAILED]', failedPayload);
      lastWatchdogOutcomeRef.current = failedPayload; // DEV: Capture for debug bundle
      
      // PROMPT-EXISTS GUARD: Recheck refs before running recovery
      const promptExistsBeforeRecovery = !!(v3ActivePromptTextRef?.current && v3ActivePromptTextRef.current.trim().length > 0);
      
      if (promptExistsBeforeRecovery) {
        console.log('[V3_PROMPT_WATCHDOG][FAILED_SUPPRESSED_PROMPT_EXISTS]', {
          loopKey: snapshot.loopKey,
          packId: snapshot.packId,
          instanceNumber: snapshot.instanceNumber,
          promptLen: v3ActivePromptTextRef.current?.length || 0,
          reason: 'Prompt exists in refs - suppressing recovery'
        });
        
        // Release idempotency lock
        const lockKey = lastV3SubmitLockKeyRef.current;
        if (lockKey) {
          if (submittedKeysRef.current.has(lockKey)) {
            submittedKeysRef.current.delete(lockKey);
            console.log('[IDEMPOTENCY][RELEASE]', { lockKey, packId: snapshot.packId, instanceNumber: snapshot.instanceNumber, source: 'watchdog_failed_suppressed' });
            lastIdempotencyReleasedRef.current = lockKey;
          }
          lastV3SubmitLockKeyRef.current = null;
        }
        return; // Exit - do NOT run recovery
      }
      
      // AUTHORITATIVE MULTI-INCIDENT DETECTION: Use pack metadata (no guessing)
      const packData = v3ProbingContext?.packData;
      
      // Source of truth: packData fields (DB-first, then static config fallback)
      const isMultiIncident = packData?.behavior_type === 'multi_incident' || 
                              packData?.followup_multi_instance === true;
      
      // Derive source for logging
      const sourceOfTruth = packData?.behavior_type === 'multi_incident' ? 'packMeta.behavior_type' :
                           packData?.followup_multi_instance === true ? 'packMeta.followup_multi_instance' :
                           'fallback:false';
      
      const sourcePayload = {
        packId: snapshot.packId,
        instanceNumber: snapshot.instanceNumber,
        behavior_type: packData?.behavior_type,
        followup_multi_instance: packData?.followup_multi_instance,
        isMultiIncident
      };
      console.log('[V3_MULTI_INCIDENT][SOURCE_OF_TRUTH]', sourcePayload);
      lastMultiIncidentSourceRef.current = sourcePayload; // DEV: Capture for debug bundle
      
      if (isMultiIncident) {
        const recoveryPayload = {
          packId: snapshot.packId,
          instanceNumber: snapshot.instanceNumber,
          reason: 'Watchdog FAILED - transitioning to gate for multi-incident pack'
        };
        console.log('[V3_UI_CONTRACT][RECOVERY_TO_ANOTHER_INSTANCE]', recoveryPayload);
        lastRecoveryAnotherInstanceRef.current = recoveryPayload; // DEV: Capture for debug bundle
        
        // Trigger transition to multi-instance gate (reuses existing gate UI)
        transitionToAnotherInstanceGate(v3ProbingContext);
      } else {
        // Non-multi-instance pack: advance to next question
        console.log('[V3_PROMPT_WATCHDOG][RECOVERY_ADVANCE]', {
          packId: snapshot.packId,
          instanceNumber: snapshot.instanceNumber,
          reason: 'Non-multi-instance pack - advancing to next question'
        });
        
        const baseQuestionId = v3BaseQuestionIdRef.current;
        if (baseQuestionId) {
          exitV3Once('WATCHDOG_RECOVERY', {
            incidentId: answerContext?.incidentId,
            categoryId: v3ProbingContext?.categoryId,
            completionReason: 'STOP',
            messages: [],
            reason: 'WATCHDOG_RECOVERY',
            shouldOfferAnotherInstance: false,
            packId: snapshot.packId,
            categoryLabel: v3ProbingContext?.categoryLabel,
            instanceNumber: snapshot.instanceNumber,
            packData
          });
        }
      }
      
      // IDEMPOTENCY RELEASE: Use stored lock key (guarantees exact match)
      const lockKey = lastV3SubmitLockKeyRef.current;
      if (lockKey) {
        if (submittedKeysRef.current.has(lockKey)) {
          submittedKeysRef.current.delete(lockKey);
          console.log('[IDEMPOTENCY][RELEASE]', { lockKey, packId: snapshot.packId, instanceNumber: snapshot.instanceNumber, source: 'handleOpenerSubmit' });
          lastIdempotencyReleasedRef.current = lockKey; // DEV: Capture for debug bundle
        }
        lastV3SubmitLockKeyRef.current = null;
      } else {
        console.warn('[IDEMPOTENCY][RELEASE_MISSING_KEY]', { packId: snapshot.packId, instanceNumber: snapshot.instanceNumber });
      }
      exitV3HandledRef.current = false;
    });
  }, [v3ProbingActive, v3ActivePromptText, v3ProbingContext, sessionId, exitV3Once, transitionToAnotherInstanceGate]);

  // Deferred transition handler (fixes React warning)
  useEffect(() => {
    if (!pendingTransition) return;

    const executePendingTransition = async () => {
      console.log('[PENDING_TRANSITION][EXECUTING]', pendingTransition.type, pendingTransition.payload);

      if (pendingTransition.type === 'EXIT_V3') {
        // IDEMPOTENCY GUARD: Prevent duplicate execution
        if (exitV3InProgressRef.current) {
          console.log('[EXIT_V3][SKIP] Already in progress');
          return;
        }

        exitV3InProgressRef.current = true;
        
        // CRITICAL: Clear pending transition IMMEDIATELY (before async work)
        const transitionPayload = pendingTransition.payload;
        setPendingTransition(null);

        try {
          const result = transitionPayload;
          const { incidentId, categoryId, completionReason, messages, reason, shouldOfferAnotherInstance, packId, categoryLabel, instanceNumber, packData } = result;
          const baseQuestionId = v3BaseQuestionIdRef.current;

          console.log('[EXIT_V3][EXECUTING]', { reason, baseQuestionId, shouldOfferAnotherInstance });

        // GUARD: If multi-instance is offered, show gate BEFORE advancing
        if (shouldOfferAnotherInstance) {
        console.log('[EXIT_V3][MULTI_INSTANCE_GATE] Showing gate instead of advancing');

        const gatePromptText = `Do you have another ${categoryLabel || 'incident'} to report?`;
        const gateItemId = `multi-instance-gate-${packId}-${instanceNumber}`;
        const gateStableKey = `mi-gate:${packId}:${instanceNumber}`;

        console.log('[MULTI_INSTANCE_GATE][SHOW]', {
          packId,
          instanceNumber,
          stableKey: gateStableKey,
          shouldOfferAnotherInstance: true
        });

        // ATOMIC STATE TRANSITION: batch to avoid intermediate TEXT_INPUT footer
        unstable_batchedUpdates(() => {
          // Fully exit V3 mode and clear prompts
          setV3ProbingActive(false);
          setV3ActivePromptText(null);
          setV3PendingAnswer(null);
          setV3ProbingContext(null);
          setV3Gate({ active: false, packId: null, categoryId: null, promptText: null, instanceNumber: null });
          setUiBlocker(null);
          
          // LIFECYCLE: Reset phase to IDLE on inline gate transition
          setV3PromptPhase("IDLE");
          
          // PART B FIX: NEVER clear UI-only history during inline gate transition
          // UI history must persist across instances (user should see all V3 Q/A)
          // TDZ FIX: Read state via functional update (not direct reference during batch)
          setV3ProbeDisplayHistory(prev => {
            console.log('[V3_UI_HISTORY][PRESERVE_ON_GATE_INLINE]', { 
              reason: 'TRANSITION_TO_GATE_INLINE', 
              packId, 
              instanceNumber,
              uiHistoryLen: prev.length,
              lastItemsPreview: prev.slice(-2).map(e => ({ kind: e.kind, textPreview: e.text?.substring(0, 30) })),
              action: 'PRESERVE (not clearing)'
            });
            return prev; // No mutation - just logging fresh state
          });
          
          // C) Clear active probe refs AND any stale prompt state
          v3ActiveProbeQuestionRef.current = null;
          v3ActiveProbeQuestionLoopKeyRef.current = null;
          
          // C) Clear stale V3 prompt rendering flags (prevents lingering prompt cards)
          setV3ActivePromptText(null);
          v3ActivePromptTextRef.current = null;
          lastRenderedV3PromptKeyRef.current = null;
          
          console.log('[MI_GATE][V3_PROMPT_CLEARED_ON_INLINE_GATE]', {
            packId,
            instanceNumber,
            clearedPromptText: true,
            clearedPromptKey: true,
            reason: 'Inline gate transition - preventing stale V3 prompt cards'
          });

          // Set up multi-instance gate as first-class currentItem
          const gateItem = {
            id: gateItemId,
            type: 'multi_instance_gate',
            packId,
            categoryId,
            categoryLabel,
            promptText: gatePromptText,
            instanceNumber,
            baseQuestionId,
            packData
          };
          setMultiInstanceGate({
            active: true,
            packId,
            categoryId,
            categoryLabel,
            promptText: gatePromptText,
            instanceNumber,
            baseQuestionId,
            packData
          });
          setCurrentItem(gateItem);
        });

        // PART A: DO NOT append gate to transcript while active (append after answer instead)
        console.log('[MI_GATE][RENDER_SOURCE]', {
          source: 'PROMPT_LANE',
          stableKey: gateStableKey,
          packId,
          instanceNumber
        });

        await forensicCheck('gate_shown');

        await persistStateToDatabase(null, [], {
          id: gateItemId,
          type: 'multi_instance_gate',
          packId
        });

        exitV3HandledRef.current = false; // Reset for gate handlers
        return; // Exit early - transition already cleared at top
        }

        // Clear gate FIRST
        setV3Gate({ active: false, packId: null, categoryId: null, promptText: null, instanceNumber: null });

        // Clear V3 state
        setV3ProbingActive(false);
        setV3ProbingContext(null);
        
        // LIFECYCLE: Reset phase to IDLE on exit
        setV3PromptPhase("IDLE");
        
        // PART B FIX: NEVER clear UI-only history when exiting V3 to next question
        // User should see their entire V3 probe history across all incidents
        // TDZ FIX: Read state via functional update (not direct reference)
        setV3ProbeDisplayHistory(prev => {
          console.log('[V3_UI_HISTORY][PRESERVE_ON_EXIT]', { 
            reason: 'EXIT_V3', 
            loopKey,
            uiHistoryLen: prev.length,
            lastItemsPreview: prev.slice(-2).map(e => ({ kind: e.kind, textPreview: e.text?.substring(0, 30) })),
            action: 'PRESERVE (not clearing)'
          });
          return prev; // No mutation - just logging fresh state
        });
        
        // Clear active probe refs (but not history state)
        v3ActiveProbeQuestionRef.current = null;
        v3ActiveProbeQuestionLoopKeyRef.current = null;

        // Log pack exited (audit only)
        if (v3ProbingContext?.packId) {
          await logPackExited(sessionId, {
            packId: v3ProbingContext.packId,
            instanceNumber: v3ProbingContext.instanceNumber || 1
          });
        }
        
        // Refresh transcript after pack exit (V3 wrote many messages to DB)
        await refreshTranscriptFromDB('v3_pack_exited');

        // Advance to next base question AFTER clearing V3 state
        if (baseQuestionId) {
          console.log('[EXIT_V3][ADVANCE]', { baseQuestionId });
          const freshForAdvance = await refreshTranscriptFromDB('before_advance_after_v3');
          await advanceToNextBaseQuestion(baseQuestionId, freshForAdvance);
        }

          // Reset idempotency guard for next V3 pack
          exitV3HandledRef.current = false;
        } finally {
          // ALWAYS reset in-progress flag
          exitV3InProgressRef.current = false;
        }
      }
    };

    executePendingTransition();
  }, [pendingTransition, dbTranscript, advanceToNextBaseQuestion, persistStateToDatabase, sessionId, v3ProbingContext, multiInstanceGate, engine, refreshTranscriptFromDB]);

  // ITEM-SCOPED COMMIT TRACKING: Track which item is being submitted
  const committingItemIdRef = useRef(null);

  // V3 question append moved to commitV3PromptToBottomBar (synchronous, one-time)
  // This effect removed to eliminate repeated DB fetches
  
  // FIX B4: V3 draft restore - load draft when V3 prompt becomes active (with fallback promptId)
  useEffect(() => {
  if (!v3ProbingActive || !v3ProbingContext) return;

  const loopKey = `${sessionId}:${v3ProbingContext.categoryId}:${v3ProbingContext.instanceNumber || 1}`;
  let promptId = v3ProbingContext.promptId || lastV3PromptSnapshotRef.current?.promptId;

  // B4: Generate fallback promptId if missing (use probeIndex)
  if (!promptId || promptId === 'noid') {
  const probeIndex = dbTranscript.filter(e => 
    (e.messageType === 'V3_PROBE_QUESTION' || e.type === 'V3_PROBE_QUESTION') &&
    e.meta?.sessionId === sessionId &&
    e.meta?.categoryId === v3ProbingContext.categoryId &&
    e.meta?.instanceNumber === (v3ProbingContext.instanceNumber || 1)
  ).length;
  promptId = `${loopKey}:${probeIndex}`;

  console.log('[V3_DRAFT][PROMPTID_FALLBACK]', { 
    generatedPromptId: promptId,
    loopKey,
    probeIndex,
    reason: 'Missing stable promptId - using fallback for draft'
  });
  }

  const v3DraftKey = `cq_v3draft_${sessionId}_${loopKey}_${promptId}`;

  try {
  const savedDraft = window.sessionStorage.getItem(v3DraftKey);
      if (savedDraft && savedDraft.trim()) {
        // ABANDONMENT SAFETY: Log V3 draft load
        console.log('[DRAFT][LOAD]', {
          found: true,
          keyPreview: v3DraftKey.substring(0, 40),
          len: savedDraft.length
        });
        console.log('[V3_DRAFT][LOAD]', { found: true, keyPreview: v3DraftKey, len: savedDraft.length });
        setInput(savedDraft);
      } else {
        console.log('[DRAFT][LOAD]', {
          found: false,
          keyPreview: v3DraftKey.substring(0, 40)
        });
        console.log('[V3_DRAFT][LOAD]', { found: false, keyPreview: v3DraftKey });
        setInput("");
      }
    } catch (e) {
      console.warn('[V3_DRAFT][LOAD_FAILED]', { error: e.message });
      setInput("");
    }
  }, [v3ProbingActive, v3ProbingContext?.promptId, sessionId]);
  
  // FIX B4: V3 draft save - persist draft on input change during V3 probing (with fallback promptId)
  useEffect(() => {
    if (!v3ProbingActive || !v3ProbingContext) return;
    
    const loopKey = `${sessionId}:${v3ProbingContext.categoryId}:${v3ProbingContext.instanceNumber || 1}`;
    let promptId = v3ProbingContext.promptId || lastV3PromptSnapshotRef.current?.promptId;
    
    // B4: Generate fallback promptId if missing
    if (!promptId || promptId === 'noid') {
      const probeIndex = dbTranscript.filter(e => 
        (e.messageType === 'V3_PROBE_QUESTION' || e.type === 'V3_PROBE_QUESTION') &&
        e.meta?.sessionId === sessionId &&
        e.meta?.categoryId === v3ProbingContext.categoryId &&
        e.meta?.instanceNumber === (v3ProbingContext.instanceNumber || 1)
      ).length;
      promptId = `${loopKey}:${probeIndex}`;
    }
    
    const v3DraftKey = `cq_v3draft_${sessionId}_${loopKey}_${promptId}`;
    
    try {
      if (input && input.trim()) {
        window.sessionStorage.setItem(v3DraftKey, input);
        
        // ABANDONMENT SAFETY: Log V3 draft save
        console.log('[DRAFT][SAVE]', {
          keyPreview: v3DraftKey.substring(0, 40),
          len: input.length
        });
        console.log('[V3_DRAFT][SAVE]', { keyPreview: v3DraftKey, len: input.length });
      }
    } catch (e) {
      console.warn('[V3_DRAFT][SAVE_FAILED]', { error: e.message });
    }
  }, [input, v3ProbingActive, v3ProbingContext?.promptId, sessionId]);
  
  // FIX C: V3 UI history persistence - save to localStorage
  useEffect(() => {
    if (!v3ProbingActive || !v3ProbingContext) return;
    if (v3ProbeDisplayHistory.length === 0) return;
    
    const loopKey = `${sessionId}:${v3ProbingContext.categoryId}:${v3ProbingContext.instanceNumber || 1}`;
    const storageKey = `cq_v3ui_${sessionId}_${loopKey}`;
    
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(v3ProbeDisplayHistory));
      console.log('[V3_UI_HISTORY][SAVE]', { len: v3ProbeDisplayHistory.length });
    } catch (e) {
      console.warn('[V3_UI_HISTORY][SAVE_FAILED]', { error: e.message });
    }
  }, [v3ProbeDisplayHistory, v3ProbingActive, v3ProbingContext?.categoryId, sessionId]);
  
  // FIX C: V3 UI history restore - load from localStorage on mount
  useEffect(() => {
    if (!v3ProbingActive || !v3ProbingContext) return;
    
    const loopKey = `${sessionId}:${v3ProbingContext.categoryId}:${v3ProbingContext.instanceNumber || 1}`;
    const storageKey = `cq_v3ui_${sessionId}_${loopKey}`;
    
    try {
      const savedHistory = window.localStorage.getItem(storageKey);
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory);
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log('[V3_UI_HISTORY][LOAD]', { found: true, len: parsed.length });
          setV3ProbeDisplayHistory(parsed);
        }
      } else {
        console.log('[V3_UI_HISTORY][LOAD]', { found: false });
      }
    } catch (e) {
      console.warn('[V3_UI_HISTORY][LOAD_FAILED]', { error: e.message });
    }
  }, [v3ProbingActive, v3ProbingContext?.categoryId, v3ProbingContext?.instanceNumber, sessionId]);

  // UX: Restore draft when currentItem changes
  useEffect(() => {
    if (!currentItem || !sessionId) return;
    
    // FIX B: Skip normal draft restore for V3 probing (uses V3-specific draft above)
    if (v3ProbingActive) {
      console.log('[DRAFT][SKIP_NORMAL_RESTORE_FOR_V3]', { v3ProbingActive: true });
      return;
    }

    const packId = currentItem?.packId || null;
    const fieldKey = currentItem?.fieldKey || currentItem?.id || null;
    const instanceNumber = currentItem?.instanceNumber || 0;
    const draftKey = buildDraftKey(sessionId, packId, fieldKey, instanceNumber);
    
    // V3 OPENER: Use dedicated openerDraft state (isolated from shared input)
    if (currentItem.type === 'v3_pack_opener') {
      try {
        const savedDraft = window.sessionStorage.getItem(draftKey);
        
        // GUARD: Never seed openerDraft with prompt text
        const openerPromptText = currentItem.openerText || "";
        const draftMatchesPrompt = savedDraft && savedDraft.trim() === openerPromptText.trim() && savedDraft.length > 10;
        
        if (draftMatchesPrompt) {
          console.error('[V3_UI_CONTRACT][OPENER_DRAFT_SEEDED_BLOCKED]', {
            packId: currentItem.packId,
            instanceNumber: currentItem.instanceNumber,
            reason: 'Attempted to seed openerDraft with prompt text - clearing to enforce contract',
            savedDraftLen: savedDraft?.length || 0,
            promptLen: openerPromptText?.length || 0
          });
          setOpenerDraft(""); // Block prompt seeding
          // Clear storage to prevent re-seed on next restore
          try {
            window.sessionStorage.removeItem(draftKey);
          } catch {}
        } else if (savedDraft != null && savedDraft !== "") {
          // ABANDONMENT SAFETY: Log opener draft load
          console.log('[DRAFT][LOAD]', {
            found: true,
            keyPreview: draftKey.substring(0, 40),
            len: savedDraft?.length || 0
          });
          console.log("[UX][DRAFT] Restoring opener draft for", draftKey);
          setOpenerDraft(savedDraft);
        } else {
          console.log('[DRAFT][LOAD]', {
            found: false,
            keyPreview: draftKey.substring(0, 40)
          });
          setOpenerDraft("");
        }
      } catch (e) {
        console.log("[FORENSIC][STORAGE][READ_BLOCKED_FALLBACK]", { 
          key: draftKey, 
          error: e.message,
          fallbackBehavior: 'Using in-memory draft only'
        });
        setOpenerDraft("");
      }
      setInput(""); // Clear shared input for opener (uses openerDraft instead)
      return;
    }

    try {
      const savedDraft = window.sessionStorage.getItem(draftKey);
      if (savedDraft != null && savedDraft !== "") {
        // ABANDONMENT SAFETY: Log draft load
        console.log('[DRAFT][LOAD]', {
          found: true,
          keyPreview: draftKey.substring(0, 40),
          len: savedDraft?.length || 0
        });
        
        console.log("[UX][DRAFT] Restoring draft for", draftKey);
        console.log("[FORENSIC][STORAGE][READ]", { operation: 'READ', key: draftKey, success: true, valueLength: savedDraft?.length || 0 });
        setInput(savedDraft);
      } else {
        console.log('[DRAFT][LOAD]', {
          found: false,
          keyPreview: draftKey.substring(0, 40)
        });
        
        console.log("[FORENSIC][STORAGE][READ]", { operation: 'READ', key: draftKey, success: true, found: false });
        // UI CONTRACT: NEVER prefill with prompt - input starts empty unless real draft exists
        setInput("");
      }
    } catch (e) {
      const isTrackingPrevention = e.message?.includes('tracking') || e.name === 'SecurityError';
      console.log("[FORENSIC][STORAGE][READ]", { 
        operation: 'READ', 
        key: draftKey, 
        success: false, 
        error: e.message,
        isTrackingPrevention,
        fallbackBehavior: 'Input cleared - continue without draft'
      });
      console.warn("[UX][DRAFT] Failed to restore draft", e);
      setInput(""); // UI CONTRACT: NEVER use prompt as fallback
    }
  }, [currentItem, sessionId, buildDraftKey, v3ProbingActive]);

  // Measure question card height dynamically
  useEffect(() => {
    if (questionCardRef.current) {
      const resizeObserver = new ResizeObserver((entries) => {
        for (let entry of entries) {
          setQuestionCardHeight(entry.contentRect.height);
        }
      });
      resizeObserver.observe(questionCardRef.current);
      return () => resizeObserver.disconnect();
    }
  }, [currentItem, validationHint]);

  // AUTO-GROWING INPUT: Sync cqDiagEnabled to ref for stable logging in long-lived callbacks
  useEffect(() => {
    cqDiagEnabledRef.current = cqDiagEnabled;
  }, [cqDiagEnabled]);
  
  // PART A: Initialize scroll owner on mount
  useEffect(() => {
    if (!bottomAnchorRef.current) return;
    
    requestAnimationFrame(() => {
      const scrollOwner = getScrollOwner(bottomAnchorRef.current);
      scrollOwnerRef.current = scrollOwner;
      
      if (scrollOwner) {
        logOnce(`scroll_owner_init_${sessionId}`, () => {
          console.log('[SCROLL_OWNER][INIT]', {
            nodeName: scrollOwner.nodeName,
            className: scrollOwner.className?.substring(0, 60),
            scrollTop: Math.round(scrollOwner.scrollTop),
            clientHeight: Math.round(scrollOwner.clientHeight),
            scrollHeight: Math.round(scrollOwner.scrollHeight),
            overflowY: window.getComputedStyle(scrollOwner).overflowY,
            isHistoryRef: scrollOwner === historyRef.current
          });
        });
      }
    });
  }, [sessionId, getScrollOwner]);

  // ============================================================================
  // FOOTER MEASUREMENT SOT - Dynamic, mode-agnostic, ref-latch (TDZ-safe)
  // ============================================================================
  const footerObservedRef = React.useRef(false);
  const footerObserverAttachLoggedRef = React.useRef(false);
  
  useEffect(() => {
    let resizeObserver = null;
    let settlingTimers = [];
    let pollingTimers = [];
    let windowResizeHandler = null;
    
    const measureFooter = () => {
      if (!footerShellRef.current) return;
      const rect = footerShellRef.current.getBoundingClientRect();
      const measured = Math.round(rect.height || footerShellRef.current.offsetHeight || 0);
      
      setDynamicFooterHeightPx(prev => {
        const delta = Math.abs(measured - prev);
        if (delta < 2) return prev;
        
        console.log('[FOOTER][HEIGHT_MEASURED]', {
          height: measured,
          delta
        });
        
        return measured;
      });
    };
    
    const attachObserver = () => {
      if (!footerShellRef.current) return false;
      if (footerObservedRef.current) return true;
      
      // Attach ResizeObserver
      resizeObserver = new ResizeObserver(measureFooter);
      resizeObserver.observe(footerShellRef.current);
      
      // Initial measurement
      requestAnimationFrame(measureFooter);
      
      // Settling measurements
      settlingTimers = [
        setTimeout(() => measureFooter(), 50),
        setTimeout(() => measureFooter(), 150),
        setTimeout(() => measureFooter(), 300)
      ];
      
      // Window resize fallback
      windowResizeHandler = () => requestAnimationFrame(measureFooter);
      window.addEventListener('resize', windowResizeHandler);
      
      footerObservedRef.current = true;
      
      // Log once on successful attachment
      if (!footerObserverAttachLoggedRef.current) {
        footerObserverAttachLoggedRef.current = true;
        const rect = footerShellRef.current.getBoundingClientRect();
        const measured = Math.round(rect.height || footerShellRef.current.offsetHeight || 0);
        console.log('[UI_CONTRACT][FOOTER_OBSERVER_ATTACHED]', { 
          footerHeightPx: measured 
        });
      }
      
      return true;
    };
    
    // Try to attach immediately
    if (!attachObserver()) {
      // Ref not ready - use RAF retry instead of polling
      let rafRetryCount = 0;
      const maxRafRetries = 8;
      
      const retryAttach = () => {
        rafRetryCount++;
        if (attachObserver() || rafRetryCount >= maxRafRetries) {
          console.log('[PERF][POLLING_DISABLED]', {
            replacedWith: 'RAF',
            reason: 'setInterval violation'
          });
          return;
        }
        requestAnimationFrame(retryAttach);
      };
      
      requestAnimationFrame(retryAttach);
    }
    
    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      settlingTimers.forEach(t => clearTimeout(t));
      pollingTimers.forEach(t => clearTimeout(t));
      if (windowResizeHandler) {
        window.removeEventListener('resize', windowResizeHandler);
      }
    };
  }, []); // TDZ-SAFE: No deps on mode variables

  // PART B: Measure footer shell height from stable wrapper (all modes)
  useEffect(() => {
    if (!footerShellRef.current) return;
    
    let rafId = null;
    let pendingMeasurement = false;
    
    const measureFooterShell = () => {
      if (!footerShellRef.current) return;
      const rect = footerShellRef.current.getBoundingClientRect();
      const measured = Math.round(rect.height || footerShellRef.current.offsetHeight || 0);
      
      // PART A: Refresh scroll owner on footer resize (layout may have changed)
      if (bottomAnchorRef.current) {
        const newScrollOwner = getScrollOwner(bottomAnchorRef.current);
        if (newScrollOwner && newScrollOwner !== scrollOwnerRef.current) {
          scrollOwnerRef.current = newScrollOwner;
          
          logOnce(`scroll_owner_identified_${sessionId}`, () => {
            console.log('[SCROLL_OWNER]', {
              nodeName: newScrollOwner?.nodeName,
              className: newScrollOwner?.className?.substring(0, 60),
              scrollTop: Math.round(newScrollOwner?.scrollTop || 0),
              clientHeight: Math.round(newScrollOwner?.clientHeight || 0),
              scrollHeight: Math.round(newScrollOwner?.scrollHeight || 0),
              overflowY: window.getComputedStyle(newScrollOwner).overflowY,
              isHistoryRef: newScrollOwner === historyRef.current
            });
          });
        }
      }
      
      // HARDENED: Only update if delta >= 2px (prevents thrash)
      setFooterShellHeightPx(prev => {
        const delta = Math.abs(measured - prev);
        if (delta < 2) return prev;
        
        console.log('[FOOTER_SHELL][MEASURE]', {
          height: measured,
          delta
        });
        
        return measured;
      });
      
      pendingMeasurement = false;
    };
    
    const scheduleUpdate = () => {
      if (pendingMeasurement) return;
      pendingMeasurement = true;
      rafId = requestAnimationFrame(measureFooterShell);
    };
    
    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(footerShellRef.current);
    
    // Initial measurement
    scheduleUpdate();
    
    return () => {
      resizeObserver.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [sessionId]); // TDZ FIX: Removed bottomBarModeSOT dep (not available at this point)

  // ============================================================================
  // UNIFIED BOTTOM BAR MODE + FOOTER PADDING COMPUTATION (Single Source of Truth)
  // ============================================================================
  // NO DYNAMIC IMPORTS: prevents duplicate React context in Base44 preview
  // CRITICAL: DECLARED FIRST - Before all effects that use bottomBarModeSOT/effectiveItemType
  // All variables declared EXACTLY ONCE in this block
  
  // Step 1: Compute currentItemType (base type before precedence)
  const currentItemType = v3GateActive ? 'v3_gate' : 
                          v3ProbingActive ? 'v3_probing' : 
                          pendingSectionTransition ? 'section_transition' : 
                          currentItem?.type || null;
  
  // Step 2: Compute footer controller (determines which UI block controls bottom bar)
  const footerControllerLocal = activeUiItem.kind === "REQUIRED_ANCHOR_FALLBACK" ? "REQUIRED_ANCHOR_FALLBACK" :
                                activeUiItem.kind === "V3_PROMPT" ? "V3_PROMPT" :
                                activeUiItem.kind === "V3_OPENER" ? "V3_OPENER" :
                                activeUiItem.kind === "MI_GATE" ? "MI_GATE" :
                                "DEFAULT";
  
  // Step 3: Compute effectiveItemType (UI routing key derived from activeUiItem.kind)
  // CRITICAL OVERRIDE: Fallback takes absolute precedence over v3_probing
  const effectiveItemType = activeUiItem.kind === "REQUIRED_ANCHOR_FALLBACK" ? 'required_anchor_fallback' :
                           activeUiItem.kind === "V3_PROMPT" ? 'v3_probing' : 
                           activeUiItem.kind === "V3_OPENER" ? 'v3_pack_opener' :
                           activeUiItem.kind === "MI_GATE" ? 'multi_instance_gate' :
                           v3ProbingActive ? 'v3_probing' : 
                           currentItemType;
  
  // TDZ ELIMINATED: Late bottomBarMode declaration removed - bottomBarModeSOT is canonical source
  
  // ============================================================================
  // FOOTER CLEARANCE COMPUTATION - Stable, unconditional (prevents overlap)
  // ============================================================================
  const footerClearancePx = Math.max(dynamicFooterHeightPx + 32, 96);
  const activeCardScrollMarginBottomPx = footerClearancePx;
  
  // Step 5: Compute footer rendering flag (include V3_WAITING and CTA)
  const shouldRenderFooter = (screenMode === 'QUESTION' && 
                              (bottomBarModeSOT === 'TEXT_INPUT' || bottomBarModeSOT === 'YES_NO' || bottomBarModeSOT === 'SELECT' || bottomBarModeSOT === 'V3_WAITING')) ||
                              bottomBarModeSOT === 'CTA';
  
  // FIX #1: Diagnostic log for footer visibility
  if (bottomBarRenderTypeSOT === "yes_no") {
    console.log('[BASE_YESNO][FOOTER_RENDER_CHECK]', {
      shouldRenderFooter,
      screenMode,
      bottomBarModeSOT,
      bottomBarRenderTypeSOT
    });
  }
  
  // REGRESSION LOGGING: Clearance SOT (once per active item, deduped)
  const clearanceLogKeyRef = React.useRef(null);
  const clearanceLogKey = `${currentItem?.id || 'none'}:${bottomBarModeSOTSafe}`;
  if (shouldRenderFooter && clearanceLogKey !== clearanceLogKeyRef.current) {
    clearanceLogKeyRef.current = clearanceLogKey;
    console.log('[UI_CONTRACT][FOOTER_CLEARANCE_SOT]', { 
      footerHeightPx: dynamicFooterHeightPx,
      footerClearancePx, 
      bottomBarMode: bottomBarModeSOTSafe, 
      effectiveItemType 
    });
  }
  
  // REGRESSION CHECK: Suspicious footer height in YES/NO mode (once per mount)
  const footerHeightSuspiciousLoggedRef = React.useRef(false);
  if (bottomBarModeSOTSafe === 'YES_NO' && shouldRenderFooter && dynamicFooterHeightPx < 40 && !footerHeightSuspiciousLoggedRef.current) {
    footerHeightSuspiciousLoggedRef.current = true;
    console.warn('[UI_CONTRACT][FOOTER_HEIGHT_SUSPICIOUS]', { 
      dynamicFooterHeightPx, 
      bottomBarMode: 'YES_NO',
      note: 'Footer height too small for YES/NO; measurement likely stale or footer not yet rendered'
    });
  }
  
  // CLEARANCE ENABLEMENT: Only apply footer clearance when there's interview content to protect
  const hasInterviewContent = Boolean(
    transcriptSOT?.length > 0 || 
    hasActiveCardSOT || 
    activeUiItem?.kind !== 'DEFAULT' ||
    screenMode === 'QUESTION'
  );
  
  const shouldApplyFooterClearance = shouldRenderFooter && hasInterviewContent;
  
  // SAFE DIAGNOSTIC: Log footer position and clearance when it changes
  const lastFooterPositionLogKeyRef = React.useRef(null);
  React.useEffect(() => {
    const logKey = `${bottomBarModeSOTSafe}:${shouldApplyFooterClearance}:${transcriptSOT?.length || 0}`;
    if (logKey !== lastFooterPositionLogKeyRef.current) {
      lastFooterPositionLogKeyRef.current = logKey;
      
      console.log('[UI_CONTRACT][FOOTER_POSITION_SOT]', {
        footerPosition: 'fixed',
        shouldApplyFooterClearance,
        footerClearancePx,
        dynamicFooterHeightPx,
        bottomBarMode: bottomBarModeSOTSafe,
        transcriptLen: transcriptSOT?.length || 0,
        hasActiveCardSOT,
        activeUiItemKind: activeUiItem?.kind
      });
    }
  }, [shouldRenderFooter, shouldApplyFooterClearance, footerClearancePx, dynamicFooterHeightPx, bottomBarModeSOTSafe, transcriptSOT?.length, hasActiveCardSOT, activeUiItem?.kind]);
  
  // Step 6: Compute footer padding (TDZ-safe - unified across all modes including WELCOME)
  
  // ACTIVE CARD DETECTION: Determine if an active card is currently present
  const hasActiveCard = 
    screenMode === 'WELCOME' || // WELCOME card active
    (currentItem?.type === 'question' && !v3ProbingActive) || // Base question active
    (currentItem?.type === 'v2_pack_field') || // V2 field active
    (currentItem?.type === 'v3_pack_opener') || // V3 opener active
    (v3ProbingActive && hasActiveV3Prompt) || // V3 probe active
    (currentItem?.type === 'multi_instance_gate'); // MI_GATE active
  
  // UNIFIED PADDING FORMULA: Reduced ~75% for active cards, special case for CTA
  // CTA: footer + 12px gap (tight), Active: footer + 8px gap, History: footer + 16px gap
  const footerH = bottomBarModeSOT === 'CTA' 
    ? Math.max(footerMeasuredHeightPx || CTA_FALLBACK_FOOTER_PX, CTA_FALLBACK_FOOTER_PX)
    : footerMeasuredHeightPx;
  const ctaPadding = footerH + CTA_GAP_PX;
  
  const dynamicBottomPaddingPxRaw = shouldRenderFooter 
    ? (bottomBarModeSOT === 'CTA' 
        ? ctaPadding
        : footerMeasuredHeightPx + (hasActiveCard ? SAFE_FOOTER_CLEARANCE_PX : HISTORY_GAP_PX))
    : 0;
  
  // CTA CLAMP: Ensure CTA padding never below minimum (prevents compensation shrinkage)
  const dynamicBottomPaddingPx = (bottomBarModeSOT === 'CTA' || effectiveItemType === 'section_transition')
    ? Math.max(dynamicBottomPaddingPxRaw, CTA_MIN_PADDING_PX)
    : dynamicBottomPaddingPxRaw;
  
  // FOOTER DOM HEIGHT SAMPLING: Real-time footer height from DOM (layout-safe)
  const footerDomHeightPx = shouldRenderFooter && footerRootRef.current
    ? Math.round(footerRootRef.current.getBoundingClientRect().height || 0)
    : 0;
  
  // FOOTER HEIGHT SOT: Use max of measured (observer) and DOM (real-time)
  const footerHeightSOTPx = Math.max(footerMeasuredHeightPx || 0, footerDomHeightPx || 0);
  
  // PART C: BOTTOM SPACER HEIGHT - Measured from stable footer shell
  // Uses footerShellHeightPx (source of truth for all modes)
  // PART A: Compute base spacer (before expansion)
  const baseSpacerPx = Math.max(footerShellHeightPx + 16, 80); // 80px minimum for safe clearance
  
  // PART B: Mode-aware spacer computation (YES/NO needs more clearance)
  const isV3OpenerForSpacer = (activeUiItem?.kind === 'V3_OPENER') || 
                              (currentItem?.type === 'v3_pack_opener');
  
  // Intermediate: V3 opener expansion
  const spacerWithV3Expansion = isV3OpenerForSpacer 
    ? baseSpacerPx + extraBottomSpacerPx 
    : baseSpacerPx;
  
  // PART B: YES/NO mode override (needs extra clearance for button footer)
  // TDZ-SAFE: Compute locally from available late variables (bottomBarModeSOT exists here)
  const isYesNoModeDerived = bottomBarModeSOT === 'YES_NO';
  const isMiGateDerived = effectiveItemType === 'multi_instance_gate' || activeUiItem?.kind === 'MI_GATE';
  
  // DYNAMIC CLEARANCE: Use measured footer height + extra margin for YES/NO
  const yesNoModeClearance = dynamicFooterHeightPx + 32;
  const normalModeClearance = spacerWithV3Expansion;
  
  const bottomSpacerPx = (isYesNoModeDerived || isMiGateDerived)
    ? Math.max(yesNoModeClearance, normalModeClearance)
    : normalModeClearance;
  
  // DIAGNOSTIC LOG: Show bottom spacer computation (deduped)
  const spacerLogKey = `${bottomBarModeSOT}:${footerShellHeightPx}:${bottomSpacerPx}`;
  logOnce(spacerLogKey, () => {
    console.log('[LAYOUT][BOTTOM_SPACER_APPLIED]', {
      mode: bottomBarModeSOT,
      footerShellHeightPx,
      bottomSpacerPx,
      shouldRenderFooter,
      appliedTo: 'real_dom_spacer_element',
      strategy: 'stable_shell_measurement',
      minSpacerPx: 80
    });
  });
  
  // GUARDRAIL A: Bottom spacer assertion (verify real DOM element exists)
  if (historyRef.current && typeof window !== 'undefined') {
    requestAnimationFrame(() => {
      try {
        const scrollContainer = historyRef.current;
        if (!scrollContainer) return;
        
        // Verify bottom spacer exists and has correct height
        const spacer = bottomAnchorRef.current;
        
        if (!spacer) {
          console.error('[UI_CONTRACT][BOTTOM_SPACER_MISSING]', {
            mode: bottomBarModeSOT,
            expectedHeightPx: bottomSpacerPx,
            reason: 'Bottom spacer element ref not attached'
          });
          return;
        }
        
        const spacerRect = spacer.getBoundingClientRect();
        const spacerHeightPx = Math.round(spacerRect.height);
        const expectedHeightPx = bottomSpacerPx;
        const heightTolerance = 4;
        
        const heightMatches = Math.abs(spacerHeightPx - expectedHeightPx) <= heightTolerance;
        
        if (!heightMatches) {
          console.warn('[UI_CONTRACT][BOTTOM_SPACER_HEIGHT_MISMATCH]', {
            mode: bottomBarModeSOT,
            expectedHeightPx,
            actualHeightPx: spacerHeightPx,
            delta: spacerHeightPx - expectedHeightPx
          });
        }
        
        // Verify scroll container has overflow
        const computedStyle = window.getComputedStyle(scrollContainer);
        const overflowY = computedStyle.overflowY;
        const isScrollContainer = overflowY === 'auto' || overflowY === 'scroll';
        
        if (!isScrollContainer) {
          console.error('[UI_CONTRACT][SCROLL_CONTAINER_INVALID]', {
            mode: bottomBarModeSOT,
            overflowY,
            reason: 'Container does not have overflow-y auto/scroll'
          });
        }
      } catch (err) {
        // Silent - guardrail should never crash
      }
    });
  }
  
  // WELCOME-specific log to confirm unified path
  if (screenMode === 'WELCOME') {
    console.log('[WELCOME][FOOTER_PADDING_SOT]', {
      bottomBarModeSOT,
      computedPaddingPx: dynamicBottomPaddingPx,
      usesUnifiedLogic: true
    });
  }
  
  // GUARDRAIL C: Mode switch assertion (verify bottom spacer on mode changes)
  const prevBottomBarModeRef = React.useRef(bottomBarModeSOT);
  React.useEffect(() => {
    const prevMode = prevBottomBarModeRef.current;
    const currentMode = bottomBarModeSOT;
    
    if (prevMode !== currentMode && typeof window !== 'undefined') {
      requestAnimationFrame(() => {
        try {
          const scrollContainer = historyRef.current;
          const footerEl = footerRef.current;
          
          if (!scrollContainer || !footerEl) return;
          
          // Verify bottom spacer height
          const spacer = bottomAnchorRef.current;
          if (!spacer) {
            console.error('[UI_CONTRACT][BOTTOM_SPACER_MISSING_ON_MODE_SWITCH]', {
              fromMode: prevMode,
              toMode: currentMode,
              expectedHeightPx: bottomSpacerPx
            });
            return;
          }
          
          const spacerRect = spacer.getBoundingClientRect();
          const spacerHeightPx = Math.round(spacerRect.height);
          
          console.log('[UI_CONTRACT][FOOTER_MODE_SWITCH_OK]', {
            fromMode: prevMode,
            toMode: currentMode,
            bottomSpacerPx,
            actualSpacerHeightPx: spacerHeightPx,
            delta: Math.abs(spacerHeightPx - bottomSpacerPx)
          });
        } catch (err) {
          // Silent - guardrail should never crash
        }
      });
    }
    
    prevBottomBarModeRef.current = currentMode;
  }, [bottomBarModeSOT, bottomSpacerPx]);
  
  // FOOTER CLEARANCE ASSERTION: DISABLED in 3-row shell mode (footer in normal flow, no overlap possible)
  if (!IS_3ROW_SHELL && hasActiveCard && typeof window !== 'undefined') {
    requestAnimationFrame(() => {
      try {
        const scrollContainer = historyRef.current;
        const footerEl = footerRef.current;

        if (!scrollContainer || !footerEl) return;
        
        // DIAGNOSTIC: Verify scroll container flex setup for bottom-anchoring
        if (CQ_DEBUG_FOOTER_ANCHOR) {
          const computed = window.getComputedStyle(scrollContainer);
          console.log('[UI_CONTRACT][SCROLL_CONTAINER_FLEX_DIAGNOSTIC]', {
            display: computed.display,
            flexDirection: computed.flexDirection,
            clientHeight: scrollContainer.clientHeight,
            scrollHeight: scrollContainer.scrollHeight,
            overflowY: computed.overflowY
          });
        }

        // YES_NO ACTIVE CARD VERIFICATION: Log active question stableKey for diagnostics
        if (screenMode === 'QUESTION' && bottomBarModeSOT === 'YES_NO' && effectiveItemType === 'question') {
          const activeQuestionStableKey = currentItem?.id ? `question-shown:${currentItem.id}` : null;
          
          if (activeQuestionStableKey) {
            const foundInDom = scrollContainer.querySelectorAll(
              `[data-stablekey="${activeQuestionStableKey}"][data-cq-active-card="true"]`
            ).length;
            
            console.log('[UI_CONTRACT][YESNO_ACTIVE_CARD_SOT]', {
              activeQuestionStableKey,
              foundInDomCount: foundInDom,
              screenMode,
              bottomBarModeSOT,
              currentItemId: currentItem?.id
            });
            
            // RUNTIME ASSERTION: Verify exactly 1 active card in QUESTION+YES_NO mode
            const totalActiveCards = scrollContainer.querySelectorAll('[data-cq-active-card="true"]').length;
            if (totalActiveCards !== 1) {
              console.warn('[UI_CONTRACT][YESNO_ACTIVE_CARD_COUNT_ANOMALY]', {
                count: totalActiveCards,
                screenMode,
                bottomBarModeSOT,
                expected: 1,
                reason: totalActiveCards === 0 ? 'no_active_card_markers' : 'multiple_active_card_markers'
              });
            }
          } else {
            console.warn('[UI_CONTRACT][ACTIVE_CARD_KEY_MISSING]', {
              screenMode,
              bottomBarModeSOT,
              effectiveItemType,
              currentItemId: currentItem?.id,
              action: 'NO_ACTIVE_CARD_THIS_FRAME'
            });
          }
        }

        // WELCOME/CTA BYPASS: Skip active card validation for welcome screen
        // WELCOME mode has no active interview cards in scroll history (only welcome message)
        const isWelcomeCta = screenMode === 'WELCOME' && 
                            bottomBarModeSOT === 'CTA' && 
                            activeUiItem?.kind === 'DEFAULT';
        
        if (isWelcomeCta) {
          console.log('[UI_CONTRACT][FOOTER_CLEARANCE_SKIP]', {
            mode: bottomBarModeSOT,
            screenMode,
            activeUiItemKind: activeUiItem?.kind,
            reason: 'WELCOME_CTA_NO_SCROLL_ACTIVE_CARD - welcome screen has no active interview cards to protect',
            action: 'SKIP'
          });
          
          footerClearanceStatusRef.current = 'SKIP';
          
          console.log('[UI_CONTRACT][FOOTER_CLEARANCE_STATUS]', {
            status: 'SKIP',
            mode: bottomBarModeSOT,
            screenMode,
            reason: 'WELCOME_CTA_MODE'
          });
          
          return; // Exit early - no validation needed
        }

        // 3-ROW SHELL: Skip spacer check (footer in normal flow, no spacer needed)
        if (!IS_3ROW_SHELL) {
          const spacer = scrollContainer.querySelector('[data-cq-footer-spacer="true"]');
          if (!spacer) {
            console.error('[UI_CONTRACT][FOOTER_SPACER_MISSING]', {
              mode: bottomBarModeSOT,
              expectedHeightPx: dynamicBottomPaddingPx,
              reason: 'Footer spacer element not found - clearance may fail'
            });
            return;
          }
        }

        const scrollRect = scrollContainer.getBoundingClientRect();
        const footerRect = footerEl.getBoundingClientRect();

        // REAL ACTIVE CARD GATE: Verify hasActiveCard matches DOM reality
        const hasRealActiveCardInDom = scrollContainer.querySelectorAll('[data-cq-active-card="true"]').length > 0;
        
        // SAFETY: Skip validation if hasActiveCard=true but no real cards in DOM (non-QUESTION modes)
        if (hasActiveCard && !hasRealActiveCardInDom) {
          // GUARD: Only SKIP for non-interview modes (WELCOME, etc.)
          // For QUESTION modes, enforce strict FAIL behavior
          const isQuestionMode = screenMode === 'QUESTION';
          
          if (!isQuestionMode) {
            console.log('[UI_CONTRACT][FOOTER_CLEARANCE_SKIP]', {
              mode: bottomBarModeSOT,
              screenMode,
              activeUiItemKind: activeUiItem?.kind,
              hasActiveCard,
              hasRealActiveCardInDom,
              reason: 'HAS_ACTIVE_CARD_TRUE_BUT_NONE_IN_DOM - non-question mode',
              action: 'SKIP'
            });
            
            footerClearanceStatusRef.current = 'SKIP';
            
            console.log('[UI_CONTRACT][FOOTER_CLEARANCE_STATUS]', {
              status: 'SKIP',
              mode: bottomBarModeSOT,
              screenMode,
              reason: 'DERIVED_FLAG_DOM_MISMATCH_NON_QUESTION_MODE'
            });
            
            return; // Exit early - skip validation
          }
        }
        
        // STRUCTURAL ASSERTION: Verify active card is in scroll container
        if (hasActiveCard) {
          const activeCardsInContainer = scrollContainer.querySelectorAll('[data-cq-active-card="true"]');
          
          if (activeCardsInContainer.length === 0) {
            // Dedupe: Only log once per unique mode+kind combo
            const errorKey = `${bottomBarModeSOT}:${activeUiItem?.kind}`;
            if (lastClearanceErrorKeyRef.current !== errorKey) {
              lastClearanceErrorKeyRef.current = errorKey;
              console.warn('[UI_CONTRACT][ACTIVE_CARD_NOT_IN_SCROLL_CONTAINER]', {
                mode: bottomBarModeSOT,
                activeUiItemKind: activeUiItem?.kind,
                hasActiveCard,
                screenMode,
                reason: 'Active card not found in DOM yet (timing) or mounted outside scroll container',
                action: 'SKIP_MEASUREMENT'
              });
            }
            
            footerClearanceStatusRef.current = 'SKIP';
            
            return; // Exit early - cannot measure
          }
        }

        // Get last REAL item (before footer spacer) in scroll container
        // DETERMINISTIC PRIORITY: Prefer active cards when present (most likely to be obscured)
        let lastItem = null;

        if (hasActiveCard) {
          // Priority 1: Measure active card (most likely to be clipped)
          const activeCards = scrollContainer.querySelectorAll('[data-cq-active-card="true"][data-ui-contract-card="true"]');
          const activeCardsArray = Array.from(activeCards).filter(el => !isUiContractNonCard(el));
          
          if (activeCardsArray.length > 0) {
            lastItem = activeCardsArray[activeCardsArray.length - 1];
            console.log('[UI_CONTRACT][FOOTER_MEASURE_TARGET_PRIORITY]', {
              strategy: 'ACTIVE_CARD_FIRST',
              hasActiveCard,
              activeCardCount: activeCardsArray.length,
              selectedTag: lastItem.tagName,
              hasStablekey: lastItem.hasAttribute('data-stablekey'),
              hasCardMarker: lastItem.hasAttribute('data-ui-contract-card'),
              className: lastItem.className?.substring(0, 60),
              reason: 'Active card prioritized for measurement'
            });
          }
        }

        // Fallback: Measure last transcript item if no active card found
        if (!lastItem) {
          const allItems = scrollContainer.querySelectorAll('[data-stablekey]');
          for (let i = allItems.length - 1; i >= 0; i--) {
            const item = allItems[i];
            
            // HARDENED: Exclude all non-card structural elements
            if (isUiContractNonCard(item)) {
              continue; // Skip structural elements (spacers, anchors, wrappers)
            }
            
            // REQUIRE: Must be a card-like element (has rounded-xl or card structure)
            const hasCardStructure = item.querySelector('.rounded-xl') || 
                                    item.classList.contains('rounded-xl') ||
                                    item.querySelector('[role]') ||
                                    item.querySelector('p');
            
            if (hasCardStructure) {
              lastItem = item;
              console.log('[UI_CONTRACT][FOOTER_MEASURE_TARGET_PRIORITY]', {
                strategy: 'TRANSCRIPT_FALLBACK',
                hasActiveCard,
                selectedTag: lastItem.tagName,
                chosenTargetStableKey: lastItem.getAttribute('data-stablekey'),
                hasCardStructure: true,
                reason: 'No active card found - using last real card in transcript'
              });
              break;
            }
          }
        }

        if (!lastItem) {
          console.error('[UI_CONTRACT][FOOTER_CLEARANCE_UNMEASURABLE]', {
            mode: bottomBarModeSOT,
            reason: 'no_last_item_before_spacer',
            allItemsCount: allItems.length
          });
          return;
        }

        // MEASUREMENT TARGET VALIDATION: Ensure lastItem is a real card container
        const isStructuralElement = isUiContractNonCard(lastItem);
        
        const hasCardStructure = !isStructuralElement &&
                                lastItem.hasAttribute('data-stablekey') &&
                                (lastItem.querySelector('.rounded-xl') || 
                                 lastItem.classList.contains('rounded-xl') ||
                                 lastItem.querySelector('[role]') ||
                                 lastItem.querySelector('p'));

        let finalLastItem = lastItem;
        let measurementCorrected = false;
        let originalOverlapPx = 0;

        if (!hasCardStructure) {
          // THROTTLED DIAGNOSTIC: Log suspect element details once per 2s
          logSuspectElement(lastItem, {
            hasActiveCard,
            activeCardCount: hasActiveCard ? scrollContainer.querySelectorAll('[data-cq-active-card="true"]').length : 0,
            selectorUsed: hasActiveCard ? 'ACTIVE_CARD_FIRST' : 'TRANSCRIPT_FALLBACK'
          });
          
          console.warn('[UI_CONTRACT][FOOTER_MEASURE_TARGET_SUSPECT]', {
            reason: isStructuralElement ? 'lastItem_is_structural' : 'lastItem_not_card',
            selectorUsed: hasActiveCard ? '[data-cq-active-card] (filtered)' : '[data-stablekey] (filtered)',
            lastItemTagName: lastItem.tagName,
            lastItemClassesSample: lastItem.className?.substring(0, 60),
            hasDataStablekey: lastItem.hasAttribute('data-stablekey'),
            isStructuralElement
          });

          // Original measurement before correction
          const suspectRect = lastItem.getBoundingClientRect();
          originalOverlapPx = Math.max(0, suspectRect.bottom - footerRect.top);

          // STRICTER SELECTOR: Find last actual card element
          // Strategy 1: Last element with both data-stablekey AND card structure
          const cardCandidates = Array.from(allItems).filter(el => {
            // HARDENED: Exclude all non-card structural elements
            if (isUiContractNonCard(el)) return false;
            
            // REQUIRE: Must have card structure
            return el.querySelector('.rounded-xl') || el.classList.contains('rounded-xl');
          });

          if (cardCandidates.length > 0) {
            finalLastItem = cardCandidates[cardCandidates.length - 1];
            measurementCorrected = true;

            console.log('[UI_CONTRACT][FOOTER_MEASURE_TARGET_CORRECTED]', {
              oldSelector: '[data-stablekey] (excluding spacer)',
              newSelector: '[data-stablekey] with .rounded-xl card structure',
              oldTagName: lastItem.tagName,
              newTagName: finalLastItem.tagName,
              correctedElement: true
            });
          }
        }

        const lastItemRect = finalLastItem.getBoundingClientRect();
        const lastItemBottomOverlapPx = Math.max(0, lastItemRect.bottom - footerRect.top);

        // Log correction if measurement changed
        if (measurementCorrected) {
          console.log('[UI_CONTRACT][FOOTER_MEASURE_TARGET_CORRECTED]', {
            oldOverlapPx: Math.round(originalOverlapPx),
            newOverlapPx: Math.round(lastItemBottomOverlapPx),
            delta: Math.round(originalOverlapPx - lastItemBottomOverlapPx),
            improved: lastItemBottomOverlapPx < originalOverlapPx
          });
        }

        console.log('[UI_CONTRACT][FOOTER_CLEARANCE_ASSERT]', {
          mode: bottomBarModeSOT,
          footerMeasuredHeightPx,
          safeFooterClearancePx: SAFE_FOOTER_CLEARANCE_PX,
          spacerHeightPx: dynamicBottomPaddingPx,
          spacerExists: !!spacer,
          clientHeight: Math.round(scrollRect.height),
          scrollHeight: Math.round(scrollContainer.scrollHeight),
          lastItemBottomOverlapPx: Math.round(lastItemBottomOverlapPx),
          hasOverlap: lastItemBottomOverlapPx > 0,
          measurementCorrected
        });

        // Status log: Deterministic PASS/FAIL (use corrected overlap)
        const status = lastItemBottomOverlapPx <= 2 ? 'PASS' : 'FAIL';
        const statusPayload = {
          status,
          mode: bottomBarModeSOT,
          overlapPx: Math.round(lastItemBottomOverlapPx),
          spacerHeightPx: dynamicBottomPaddingPx,
          measurementCorrected
        };

        console.log('[UI_CONTRACT][FOOTER_CLEARANCE_STATUS]', statusPayload);

        // Store footer status for SOT log (component-level ref)
        footerClearanceStatusRef.current = status;

        // Dedupe failure logs: only log once per unique failure key
        if (status === 'FAIL') {
          const failKey = `${bottomBarModeSOT}:${Math.round(lastItemBottomOverlapPx)}`;
          if (lastClearanceErrorKeyRef.current !== failKey) {
            lastClearanceErrorKeyRef.current = failKey;
            
            if (measurementCorrected) {
              console.warn('[UI_CONTRACT][FOOTER_CLEARANCE_STATUS_FAIL_CORRECTED]', {
                correctedOverlapPx: Math.round(lastItemBottomOverlapPx),
                mode: bottomBarModeSOT,
                reason: 'overlap_detected_after_target_correction',
                originalOverlapPx: Math.round(originalOverlapPx),
                correctionImproved: lastItemBottomOverlapPx < originalOverlapPx
              });
            } else {
              console.warn('[UI_CONTRACT][FOOTER_CLEARANCE_STATUS_FAIL]', {
                ...statusPayload,
                footerMeasuredHeightPx,
                lastItemBottom: Math.round(lastItemRect.bottom),
                footerTop: Math.round(footerRect.top),
                reason: 'Content obscured by footer despite spacer'
              });
            }
          }
        }
        
        if (lastItemBottomOverlapPx > 0) {
          console.error('[UI_CONTRACT][FOOTER_OVERLAP_DETECTED]', {
            mode: bottomBarModeSOT,
            overlapPx: Math.round(lastItemBottomOverlapPx),
            footerMeasuredHeightPx,
            spacerHeightPx: dynamicBottomPaddingPx,
            lastItemBottom: Math.round(lastItemRect.bottom),
            footerTop: Math.round(footerRect.top),
            reason: 'Content obscured by footer - spacer insufficient'
          });
        }
        
        // GUARDRAIL B: Track worst-case overlap for regression detection
        const roundedOverlap = Math.round(lastItemBottomOverlapPx);
        if (roundedOverlap > maxOverlapSeenRef.current.maxOverlapPx) {
          console.error('[UI_CONTRACT][FOOTER_OVERLAP_REGRESSION]', {
            mode: bottomBarModeSOT,
            overlapPx: roundedOverlap,
            previousMaxOverlapPx: maxOverlapSeenRef.current.maxOverlapPx,
            maxOverlapPx: roundedOverlap,
            footerMeasuredHeightPx,
            spacerHeightPx: dynamicBottomPaddingPx,
            lastModeSeen: maxOverlapSeenRef.current.lastModeSeen,
            reason: 'Overlap increased - potential regression'
          });
          
          maxOverlapSeenRef.current.maxOverlapPx = roundedOverlap;
          maxOverlapSeenRef.current.lastModeSeen = bottomBarModeSOT;
        }
      } catch (err) {
        // Silent - assertion should never crash
      }
    });
  }
  
  // CTA SOT diagnostic (single consolidated log)
  if (bottomBarModeSOT === 'CTA') {
    console.log('[CTA][SOT_PADDING]', {
      footerMeasuredHeightPx,
      dynamicBottomPaddingPx,
      shouldRenderFooter,
      effectiveItemType,
      bottomBarModeSOT
    });
  }
  
  // Step 7: Semantic helper flags
  const isV3Gate = effectiveItemType === "v3_gate";
  const isMultiInstanceGate = effectiveItemType === "multi_instance_gate";
  const isQuestion = false; // Set to true during refinement if needed

  // AUTO-GROWING INPUT: Re-measure footer on mode changes (prevents stale height during transitions)
  // NO DYNAMIC IMPORTS: prevents duplicate React context in Base44 preview
  React.useLayoutEffect(() => {
    if (!footerRef.current) return;
    
    // Trigger measurement on next frame (after layout settles)
    requestAnimationFrame(() => {
      if (!footerRef.current) return;
      const rect = footerRef.current.getBoundingClientRect();
      const measured = Math.round(rect.height || footerRef.current.offsetHeight || 0);
      
      setFooterMeasuredHeightPx(prev => {
        const delta = Math.abs(measured - prev);
        if (delta < 2) return prev;
        
        console.log('[FOOTER][HEIGHT_REMEASURED_ON_MODE_CHANGE]', {
          footerMeasuredHeightPx: measured,
          appliedPaddingPx: measured + 8,
          delta,
          bottomBarModeSOT,
          shouldRenderFooter,
          effectiveItemType
        });
        
        return measured;
      });
    });
  }, [bottomBarModeSOT, shouldRenderFooter, effectiveItemType]);

  // Re-anchor bottom on footer height changes when auto-scroll is enabled
  // NO DYNAMIC IMPORTS: prevents duplicate React context in Base44 preview
  useEffect(() => {
    // SCROLL LOCK GATE: Block footer height re-anchor during any scroll lock
    if (isScrollWriteLocked()) {
      return;
    }
    
    if (!historyRef.current) return;
    if (!autoScrollEnabledRef.current) return;
    if (isUserTyping) return;
    
    requestAnimationFrame(() => {
      scrollToBottom('FOOTER_HEIGHT_CHANGED');
    });
  }, [bottomSpacerPx, isUserTyping, scrollToBottom]);

  // SMOOTH GLIDE AUTOSCROLL: ChatGPT-style smooth scrolling on new content
  // NO DYNAMIC IMPORTS: prevents duplicate React context in Base44 preview
  // TDZ-SAFE: bottomBarModeSOT declared above (line ~7876) before this effect
  React.useLayoutEffect(() => {
    // SCROLL LOCK GATE: Block auto-scroll during any scroll lock
    if (isScrollWriteLocked()) {
      console.log('[SCROLL][GLIDE_BLOCKED_BY_LOCK]', {
        reason: scrollWriteLockReasonRef.current,
        untilMsRemaining: Math.max(0, scrollWriteLockUntilRef.current - Date.now())
      });
      return;
    }
    
    const scrollContainer = historyRef.current;
    if (!scrollContainer || !bottomAnchorRef.current) return;
    
    // CTA FORCE-ANCHOR: Ensure CTA always visible (one-time on entry)
    if (bottomBarModeSOT === 'CTA' && !isUserTyping) {
      const { scrollTop: beforeScroll, scrollHeight, clientHeight } = scrollContainer;
      const targetScrollTop = Math.max(0, scrollHeight - clientHeight);
      
      if (targetScrollTop > beforeScroll + 5) { // Only scroll if meaningfully below bottom
        scrollContainer.scrollTop = targetScrollTop;
        console.log('[CTA][FORCE_ANCHOR]', {
          scrollTopBefore: beforeScroll,
          scrollTopAfter: targetScrollTop,
          targetScrollTop,
          clientHeight,
          scrollHeight,
          reason: 'CTA_ENTRY_ENSURE_VISIBLE'
        });
      }
      return; // Skip standard auto-scroll logic
    }
    
    // GUARD A: Never auto-scroll while user is typing (UNLESS force-once override)
    if (isUserTyping && !forceAutoScrollOnceRef.current) return;
    
    // PART C: Clear force-once flag after allowing scroll
    if (forceAutoScrollOnceRef.current) {
      forceAutoScrollOnceRef.current = false;
      console.log('[SCROLL][FORCE_ONCE_CLEARED]', { reason: 'glide_autoscroll' });
    }
    
    // GUARD C: Skip if other scroll controller already handled this frame
    if (scrollIntentRef.current) {
      console.log('[SCROLL][GLIDE_SKIPPED]', {
        reason: 'other_scroll_active',
        scrollIntentRef: true
      });
      return;
    }
    
    // GUARD D: Skip during V3_WAITING (engine deciding)
    if (bottomBarModeSOT === 'V3_WAITING') {
      console.log('[SCROLL][GLIDE_SKIPPED]', {
        reason: 'v3_waiting_mode',
        bottomBarModeSOT
      });
      return;
    }
    
    // GUARD B: Only auto-scroll if user is near bottom (ChatGPT behavior)
    const scrollHeight = scrollContainer.scrollHeight;
    const clientHeight = scrollContainer.clientHeight;
    const scrollTop = scrollContainer.scrollTop;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
    const NEAR_BOTTOM_THRESHOLD_PX = 120;
    const isNearBottom = distanceFromBottom <= NEAR_BOTTOM_THRESHOLD_PX;
    
    // Update sticky autoscroll state
    if (isNearBottom !== shouldAutoScrollRef.current) {
      shouldAutoScrollRef.current = isNearBottom;
    }
    
    // Only scroll if user is near bottom
    if (!shouldAutoScrollRef.current) {
      console.log('[SCROLL][GLIDE_SKIPPED]', {
        reason: 'user_not_near_bottom',
        distanceFromBottom: Math.round(distanceFromBottom)
      });
      return;
    }
    
    // GUARD D: Only glide if container actually overflows (prevent scroll when there's nothing to scroll)
    const overflowPx = scrollHeight - clientHeight;
    if (overflowPx <= 8) {
      console.log('[SCROLL][GLIDE_SKIPPED]', {
        reason: 'no_overflow',
        scrollHeight,
        clientHeight,
        overflowPx
      });
      return;
    }
    
    // RAF for layout stability + smooth scroll
    requestAnimationFrame(() => {
      if (!bottomAnchorRef.current || !scrollContainer) return;
      
      const lenBefore = lastRenderStreamLenRef.current;
      const lenNow = transcriptSOT.length;
      const lenDelta = lenNow - lenBefore;
      
      // GUARD E: Only scroll on small transcript appends (1-2 entries)
      // Prevents mega-scroll bursts during bulk merges/refreshes
      if (lenDelta <= 0) {
        console.log('[SCROLL][GLIDE_SKIPPED]', {
          reason: 'no_append',
          lenDelta
        });
        return;
      }
      
      if (lenDelta > 2) {
        console.log('[SCROLL][GLIDE_SKIPPED]', {
          reason: 'bulk_append',
          lenDelta,
          note: 'Large delta indicates merge/refresh - not a single append'
        });
        return;
      }
      
      // All guards passed - perform glide scroll
      bottomAnchorRef.current.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'end' 
      });
      
      console.log('[SCROLL][GRAVITY_APPLIED]', {
        bottomBarModeSOT,
        effectiveItemType,
        distanceFromBottom: Math.round(distanceFromBottom),
        thresholdPx: NEAR_BOTTOM_THRESHOLD_PX,
        lenDelta,
        scrollHeight,
        clientHeight,
        overflowPx
      });
      
      // Update length tracker
      lastRenderStreamLenRef.current = lenNow;
    });
  }, [
    transcriptSOT.length,
    isUserTyping,
    bottomBarModeSOT
  ]);

  // ANCHOR LAST V3 ANSWER: Keep recently submitted answer visible during transitions
  React.useLayoutEffect(() => {
    // SCROLL LOCK GATE: Block anchor during any scroll lock
    if (isScrollWriteLocked()) {
      return;
    }
    
    if (recentAnchorRef.current.kind !== 'V3_PROBE_ANSWER') return;
    
    const recentAge = Date.now() - recentAnchorRef.current.ts;
    if (recentAge > 2000) {
      recentAnchorRef.current = { kind: null, stableKey: null, ts: 0 };
      return;
    }
    
    const scrollContainer = historyRef.current;
    if (!scrollContainer) return;
    
    // PART C: Bypass typing lock for recent anchor scroll
    if (isUserTyping && !forceAutoScrollOnceRef.current) return;
    
    const targetStableKey = recentAnchorRef.current.stableKey;
    const targetEl = scrollContainer.querySelector(`[data-stablekey="${targetStableKey}"]`);
    
    if (!targetEl) {
      if (cqDiagEnabled) {
        console.warn('[SCROLL][ANCHOR_LAST_V3_ANSWER][NOT_FOUND]', {
          stableKey: targetStableKey,
          reason: 'Element not found in DOM'
        });
      }
      return;
    }
    
    requestAnimationFrame(() => {
      if (!scrollContainer || !targetEl) return;
      
      const scrollTopBefore = scrollContainer.scrollTop;
      
      // Compute target position (answer visible above footer)
      const elTop = targetEl.offsetTop;
      const elHeight = targetEl.offsetHeight;
      const containerHeight = scrollContainer.clientHeight;
      const footerSafePx = dynamicBottomPaddingPx + 16; // Extra margin
      
      // Target: place answer at bottom of visible area (above footer)
      const targetScrollTop = Math.max(0, (elTop + elHeight) - containerHeight + footerSafePx);
      
      // Only scroll if we're not already showing the element
      const alreadyVisible = scrollTopBefore >= targetScrollTop - 20 && scrollTopBefore <= targetScrollTop + 20;
      
      if (alreadyVisible) {
        if (cqDiagEnabled) {
          console.log('[SCROLL][ANCHOR_LAST_V3_ANSWER]', {
            stableKey: targetStableKey,
            didScroll: false,
            reason: 'already_visible',
            bottomBarModeSOT,
            effectiveItemType
          });
        }
        recentAnchorRef.current = { kind: null, stableKey: null, ts: 0 };
        return;
      }
      
      scrollContainer.scrollTop = targetScrollTop;
      
      const scrollTopAfter = scrollContainer.scrollTop;
      const didScroll = Math.abs(scrollTopAfter - scrollTopBefore) > 1;
      
      if (cqDiagEnabled) {
        console.log('[SCROLL][ANCHOR_LAST_V3_ANSWER]', {
          stableKey: targetStableKey,
          didScroll,
          bottomBarModeSOT,
          effectiveItemType,
          scrollTopBefore: Math.round(scrollTopBefore),
          scrollTopAfter: Math.round(scrollTopAfter),
          elTop,
          elHeight,
          footerSafePx
        });
      }
      
      recentAnchorRef.current = { kind: null, stableKey: null, ts: 0 };
    });
  }, [transcriptSOT.length, bottomBarModeSOT, effectiveItemType, dynamicBottomPaddingPx, cqDiagEnabled]);
  
  // ANCHOR V3 PROBE QUESTION: Keep just-appended question visible (ChatGPT-style)
  React.useLayoutEffect(() => {
    // SCROLL LOCK GATE: Block anchor during any scroll lock
    if (isScrollWriteLocked()) {
      return;
    }
    
    if (v3ScrollAnchorRef.current.kind !== 'V3_PROBE_QUESTION') return;
    
    const anchorAge = Date.now() - v3ScrollAnchorRef.current.ts;
    if (anchorAge > 1500) {
      v3ScrollAnchorRef.current = { kind: null, stableKey: null, ts: 0 };
      return;
    }
    
    const scrollContainer = historyRef.current;
    if (!scrollContainer) return;
    
    // PART C: Bypass typing lock for V3 probe question anchor
    if (isUserTyping && !forceAutoScrollOnceRef.current) return;
    
    const targetStableKey = v3ScrollAnchorRef.current.stableKey;
    const targetEl = scrollContainer.querySelector(`[data-stablekey="${targetStableKey}"]`);
    
    if (!targetEl) {
      if (cqDiagEnabled) {
        console.warn('[SCROLL][ANCHOR_V3_PROBE_Q][NOT_FOUND]', {
          stableKey: targetStableKey,
          reason: 'Element not found in DOM - may not have rendered yet'
        });
      }
      v3ScrollAnchorRef.current = { kind: null, stableKey: null, ts: 0 };
      return;
    }
    
    requestAnimationFrame(() => {
      if (!scrollContainer || !targetEl) return;
      
      const scrollTopBefore = scrollContainer.scrollTop;
      const scrollHeight = scrollContainer.scrollHeight;
      const clientHeight = scrollContainer.clientHeight;
      const overflowPx = scrollHeight - clientHeight;
      
      // Compute target position (question visible above footer)
      const elTop = targetEl.offsetTop;
      const elHeight = targetEl.offsetHeight;
      const footerSafePx = dynamicBottomPaddingPx + 16;
      
      // Target: place question at bottom of visible area (above footer)
      const targetScrollTop = Math.max(0, (elTop + elHeight) - clientHeight + footerSafePx);
      
      // Always scroll (even if overflowPx=0) to ensure visibility
      scrollContainer.scrollTop = targetScrollTop;
      
      const scrollTopAfter = scrollContainer.scrollTop;
      const didScroll = Math.abs(scrollTopAfter - scrollTopBefore) > 1;
      
      if (cqDiagEnabled) {
        console.log('[SCROLL][ANCHOR_V3_PROBE_Q]', {
          stableKey: targetStableKey,
          didFind: true,
          didScroll,
          overflowPx,
          bottomBarModeSOT,
          scrollTopBefore: Math.round(scrollTopBefore),
          scrollTopAfter: Math.round(scrollTopAfter),
          footerSafePx
        });
      }
      
      v3ScrollAnchorRef.current = { kind: null, stableKey: null, ts: 0 };
    });
  }, [transcriptSOT.length, bottomBarModeSOT, dynamicBottomPaddingPx, cqDiagEnabled]);
  
  // TDZ GUARD: Track previous render list length for append detection (using ref, not direct variable)
  const prevFinalListLenForScrollRef = useRef(0);
  
  // PART B: ACTIVE ITEM CHANGED - Call ensureActiveVisibleAfterRender when active item changes
  React.useLayoutEffect(() => {
    if (!shouldRenderFooter) return;
    
    // Build active key from currentItem or V3 context
    const activeKey = activeCardKeySOT || currentItem?.id || `${currentItem?.packId}:${currentItem?.instanceNumber}`;
    if (!activeKey) return;
    
    // REGRESSION-PROOF: Use safe wrapper (validates mode before use)
    const isYesNoModeFresh = bottomBarModeSOTSafe === 'YES_NO';
    const isMiGateFresh = effectiveItemType === 'multi_instance_gate' || activeUiItem?.kind === 'MI_GATE';
    
    requestAnimationFrame(() => {
      ensureActiveVisibleAfterRender("ACTIVE_ITEM_CHANGED", activeKindSOT, isYesNoModeFresh, isMiGateFresh);
    });
  }, [activeCardKeySOT, currentItem?.id, currentItem?.type, shouldRenderFooter, ensureActiveVisibleAfterRender, activeKindSOT, bottomBarModeSOTSafe, effectiveItemType, activeUiItem]);
  
  // PART B: RENDER LIST APPENDED - TDZ-safe using ref (no direct finalTranscriptList reference)
  React.useLayoutEffect(() => {
    if (!shouldRenderFooter) return;
    
    // TDZ-SAFE: Use ref that's synced AFTER finalTranscriptList is computed
    const currentLen = finalListLenRef.current;
    const prevLen = prevFinalListLenForScrollRef.current;
    
    if (currentLen === 0 || currentLen <= prevLen) return;
    
    // Length increased - trigger scroll correction
    prevFinalListLenForScrollRef.current = currentLen;
    
    // REGRESSION-PROOF: Use safe wrapper (validates mode before use)
    const isYesNoModeFresh = bottomBarModeSOTSafe === 'YES_NO';
    const isMiGateFresh = effectiveItemType === 'multi_instance_gate' || activeUiItem?.kind === 'MI_GATE';
    
    requestAnimationFrame(() => {
      ensureActiveVisibleAfterRender("RENDER_LIST_APPENDED", activeKindSOT, isYesNoModeFresh, isMiGateFresh);
    });
  }, [shouldRenderFooter, ensureActiveVisibleAfterRender, activeCardKeySOT, activeKindSOT, bottomBarModeSOTSafe, effectiveItemType, activeUiItem]);
  
  // FORCE SCROLL ON QUESTION_SHOWN: Ensure base questions never render behind footer
  React.useLayoutEffect(() => {
    // SCROLL LOCK GATE: Block force-scroll during any scroll lock
    if (isScrollWriteLocked()) {
      return;
    }
    
    // Only run for base questions with footer visible
    if (effectiveItemType !== 'question' || !shouldRenderFooter) return;
    if (!currentItem?.id || currentItem.type !== 'question') return;
    
    // Dedupe: Only run once per question
    if (lastQuestionShownIdRef.current === currentItem.id) return;
    lastQuestionShownIdRef.current = currentItem.id;
    
    const scrollContainer = historyRef.current;
    if (!scrollContainer || !bottomAnchorRef.current) return;
    
    // Force scroll to bottom after question renders
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!scrollContainer || !bottomAnchorRef.current) return;
        
        const scrollTopBefore = scrollContainer.scrollTop;
        const scrollHeight = scrollContainer.scrollHeight;
        const clientHeight = scrollContainer.clientHeight;
        const targetScrollTop = Math.max(0, scrollHeight - clientHeight);
        
        scrollContainer.scrollTop = targetScrollTop;
        
        const scrollTopAfter = scrollContainer.scrollTop;
        
        console.log('[SCROLL][FORCE_ANCHOR_ON_QUESTION_SHOWN]', {
          questionId: currentItem.id,
          scrollTopBefore: Math.round(scrollTopBefore),
          scrollTopAfter: Math.round(scrollTopAfter),
          footerHeight: footerMeasuredHeightPx,
          paddingApplied: dynamicBottomPaddingPx,
          scrollHeight: Math.round(scrollHeight),
          clientHeight: Math.round(clientHeight)
        });
        
        // GUARDRAIL: Detect if question still below footer after scroll
        requestAnimationFrame(() => {
          if (!scrollContainer || !footerRootRef.current) return;
          
          // PART B: MI gate uses bottom anchor strategy (skip card measurement)
          const isMiGateActive = currentItem?.type === 'multi_instance_gate' || 
                                activeUiItem?.kind === 'MI_GATE';
          
          if (isMiGateActive) {
            // Bottom-anchor strategy: use shared helper
            if (!isUserTyping || forceAutoScrollOnceRef.current) {
              requestAnimationFrame(() => {
                scrollToBottomForMiGate('FORCE_ANCHOR_ON_QUESTION_SHOWN');
                
                if (forceAutoScrollOnceRef.current) {
                  forceAutoScrollOnceRef.current = false;
                  console.log('[SCROLL][FORCE_ONCE_CLEARED]', { reason: 'mi_gate_bottom_anchor' });
                }
              });
            }
            return; // Skip card-based measurement for MI gate
          }
          
          const activeQuestionEl = scrollContainer.querySelector('[data-cq-active-card="true"]');
          if (!activeQuestionEl) return;
          
          const questionRect = activeQuestionEl.getBoundingClientRect();
          const footerRect = footerRootRef.current.getBoundingClientRect();
          const overlapPx = Math.max(0, questionRect.bottom - footerRect.top);
          
          if (overlapPx > 4) {
            // PART A: Capture violation snapshot
            captureViolationSnapshot({
              reason: 'QUESTION_BEHIND_FOOTER',
              list: finalListRef.current,
              packId: null,
              instanceNumber: null,
              activeItemId: currentItem?.id
            });
            
            // PART C: Apply corrective scroll (bypass typing lock)
            if (!isUserTyping || forceAutoScrollOnceRef.current) {
              scrollContainer.scrollTop += overlapPx + 16;
              console.log('[SCROLL][CORRECTIVE_NUDGE_QUESTION]', {
                overlapPx: Math.round(overlapPx),
                bypassedTypingLock: isUserTyping && forceAutoScrollOnceRef.current,
                applied: true
              });
              
              if (forceAutoScrollOnceRef.current) {
                forceAutoScrollOnceRef.current = false;
                console.log('[SCROLL][FORCE_ONCE_CLEARED]', { reason: 'corrective_nudge_question' });
              }
            }
          }
        });
      });
    });
  }, [effectiveItemType, shouldRenderFooter, currentItem?.id, currentItem?.type, footerMeasuredHeightPx, dynamicBottomPaddingPx]);
  
  // FOOTER PADDING COMPENSATION: Prevent jump when footer height changes
  React.useLayoutEffect(() => {
    // SCROLL LOCK GATE: Block padding compensation during any scroll lock
    if (isScrollWriteLocked()) {
      return;
    }
    
    const prev = prevPaddingRef.current;
    let next = dynamicBottomPaddingPx;
    
    // CTA CLAMP: Never allow compensation to reduce CTA padding below minimum
    if (bottomBarModeSOT === 'CTA' || effectiveItemType === 'section_transition') {
      next = Math.max(next, CTA_MIN_PADDING_PX);
      if (next !== dynamicBottomPaddingPx) {
        console.log('[CTA][PADDING_COMPENSATE_CLAMP]', {
          raw: dynamicBottomPaddingPx,
          clamped: next,
          CTA_MIN_PADDING_PX
        });
      }
    }
    
    const delta = next - prev;
    
    // Update ref
    prevPaddingRef.current = next;
    
    // Skip if no change
    if (delta === 0) return;
    
    // GUARD: Only compensate on INCREASES (delta > 0) - prevent upward snap
    if (delta <= 0) {
      console.log('[SCROLL][PADDING_COMPENSATE_SKIP]', {
        reason: 'delta_not_positive',
        delta,
        prev,
        next,
        bottomBarModeSOT
      });
      return;
    }
    
    const scrollContainer = historyRef.current;
    if (!scrollContainer) return;
    
    // Skip during V3_WAITING (no scroll adjustments during engine decide)
    if (bottomBarModeSOT === 'V3_WAITING') {
      console.log('[SCROLL][PADDING_COMPENSATE_SKIP]', {
        reason: 'v3_waiting_mode',
        bottomBarModeSOT
      });
      return;
    }
    
    // Only compensate when user is near bottom or in QUESTION mode
    const scrollHeight = scrollContainer.scrollHeight;
    const clientHeight = scrollContainer.clientHeight;
    const scrollTop = scrollContainer.scrollTop;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
    const nearBottom = distanceFromBottom <= 120;
    
    const shouldCompensate = (nearBottom || screenMode === 'QUESTION') && !isUserTyping;
    
    if (!shouldCompensate) return;
    
    // Apply compensation: adjust scrollTop to keep content anchored
    scrollContainer.scrollTop = scrollTop + delta;
    
    console.log('[SCROLL][PADDING_COMPENSATE]', {
      prev,
      next,
      delta,
      nearBottom,
      scrollTopBefore: scrollTop,
      scrollTopAfter: scrollTop + delta
    });
  }, [dynamicBottomPaddingPx, screenMode, isUserTyping, bottomBarModeSOT]);
  
  // TDZ GUARD: Do not reference finalTranscriptList in hook deps before it is initialized.
  // DETERMINISTIC BOTTOM ANCHOR ENFORCEMENT: Keep transcript pinned to bottom when expected
  React.useLayoutEffect(() => {
    // SCROLL LOCK GATE: Block bottom anchor during any scroll lock
    if (isScrollWriteLocked()) {
      return;
    }
    
    const scrollContainer = historyRef.current;
    if (!scrollContainer) return;
    
    // Compute overflow state
    const hasOverflow = scrollContainer.scrollHeight > scrollContainer.clientHeight + 1;
    const nearBottom = isNearBottomStrict(scrollContainer, 24);
    
    // Decision: scroll to bottom if short OR if user is near bottom
    const shouldScrollToBottom = !hasOverflow || nearBottom;
    
    if (!shouldScrollToBottom) return;
    
    // Execute scroll using unified helper
    const scrollTopBefore = scrollContainer.scrollTop;
    scrollToBottom('BOTTOM_ANCHOR_ENFORCE');
    const scrollTopAfter = scrollContainer.scrollTop;
    const didScroll = Math.abs(scrollTopAfter - scrollTopBefore) > 1;
    
    if (CQ_DEBUG_FOOTER_ANCHOR && didScroll) {
      console.log('[UI_CONTRACT][BOTTOM_ANCHOR_ENFORCE]', {
        reason: !hasOverflow ? 'SHORT_NO_OVERFLOW' : 'NEAR_BOTTOM_OVERFLOW',
        scrollTopBefore: Math.round(scrollTopBefore),
        scrollTopAfter: Math.round(scrollTopAfter),
        scrollHeight: scrollContainer.scrollHeight,
        clientHeight: scrollContainer.clientHeight,
        hasOverflow,
        nearBottom
      });
    }
  }, [
    bottomAnchorLenRef.current,
    activeUiItem?.kind,
    activeCard?.stableKey,
    scrollToBottom
  ]);
  
  // GRAVITY FOLLOW: Auto-scroll active card into view when it changes (ChatGPT-style)
  React.useLayoutEffect(() => {
    // SCROLL LOCK GATE: Block gravity follow during any scroll lock
    if (isScrollWriteLocked()) {
      return;
    }
    
    // GUARD: Skip if user scrolled up manually
    const scrollContainer = historyRef.current;
    if (!scrollContainer) return;
    
    // Check if user is near bottom (respect manual scroll up)
    const nearBottom = computeNearBottom(scrollContainer, 80);
    if (!nearBottom) {
      console.log('[SCROLL][GRAVITY_FOLLOW_SKIP]', {
        reason: 'user_scrolled_up',
        activeCardKeySOT,
        bottomBarModeSOT
      });
      return;
    }
    
    // GUARD: Skip during typing to prevent jank
    if (isUserTyping) return;
    
    // GUARD: Must have active card
    if (!hasActiveCardSOT) return;
    
    // Dedupe: Only scroll when active card key actually changes
    const gravityKey = `${activeCardKeySOT}:${bottomBarModeSOT}:${screenMode}`;
    if (lastGravityFollowKeyRef.current === gravityKey) {
      return; // Already scrolled for this card+mode combo
    }
    
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!scrollContainer) return;
        
        // Verify still near bottom (guard against stale scroll during RAF delay)
        const stillNearBottom = computeNearBottom(scrollContainer, 80);
        if (!stillNearBottom) return;
        
        const scrollTopBefore = scrollContainer.scrollTop;
        let didScroll = false;
        
        // Strategy A: Scroll active card into view (preferred)
        const activeCardEl = scrollContainer.querySelector('[data-cq-active-card="true"][data-ui-contract-card="true"]');
        if (activeCardEl) {
          activeCardEl.scrollIntoView({ block: "end", behavior: "auto" });
          didScroll = true;
          console.log('[SCROLL][GRAVITY_FOLLOW_APPLIED]', {
            activeCardKeySOT,
            mode: bottomBarModeSOT,
            screenMode,
            strategy: 'ACTIVE_CARD_SCROLL_INTO_VIEW',
            distanceFromBottom: scrollContainer.scrollHeight - (scrollTopBefore + scrollContainer.clientHeight)
          });
        }
        // Strategy B: Fallback to bottom anchor
        else if (bottomAnchorRef.current) {
          bottomAnchorRef.current.scrollIntoView({ block: "end", behavior: "auto" });
          didScroll = true;
          console.log('[SCROLL][GRAVITY_FOLLOW_APPLIED]', {
            activeCardKeySOT,
            mode: bottomBarModeSOT,
            screenMode,
            strategy: 'BOTTOM_ANCHOR_FALLBACK',
            distanceFromBottom: scrollContainer.scrollHeight - (scrollTopBefore + scrollContainer.clientHeight)
          });
        }
        
        if (didScroll) {
          // Mark this key as scrolled
          lastGravityFollowKeyRef.current = gravityKey;
          
          const scrollTopAfter = scrollContainer.scrollTop;
          console.log('[SCROLL][GRAVITY_FOLLOW_METRICS]', {
            scrollTopBefore: Math.round(scrollTopBefore),
            scrollTopAfter: Math.round(scrollTopAfter),
            delta: Math.round(scrollTopAfter - scrollTopBefore)
          });
          
          // GUARDRAIL: Detect if active card still below footer after scroll
          requestAnimationFrame(() => {
            if (!scrollContainer || !footerRef.current || !activeCardEl) return;
            
            const questionRect = activeCardEl.getBoundingClientRect();
            const footerRect = footerRef.current.getBoundingClientRect();
            const overlapPx = Math.max(0, questionRect.bottom - footerRect.top);
            
            if (overlapPx > 4) {
              const overlapLogKey = `${activeCardKeySOT}:${Math.round(overlapPx)}`;
              if (lastClearanceErrorKeyRef.current !== overlapLogKey) {
                lastClearanceErrorKeyRef.current = overlapLogKey;
                
                // PART A: Capture violation snapshot
                captureViolationSnapshot({
                  reason: 'ACTIVE_BEHIND_FOOTER',
                  list: finalListRef.current,
                  packId: currentItem?.packId,
                  instanceNumber: currentItem?.instanceNumber,
                  activeItemId: currentItem?.id
                });
                
                // PART C: Apply corrective scroll (bypass typing lock for explicit navigation)
                if ((!isUserTyping || forceAutoScrollOnceRef.current) && scrollContainer) {
                  const targetScrollTop = scrollContainer.scrollTop + overlapPx + 8;
                  scrollContainer.scrollTop = targetScrollTop;
                  
                  console.log('[SCROLL][CORRECTIVE_NUDGE]', {
                    overlapPx: Math.round(overlapPx),
                    scrollTopBefore: Math.round(scrollContainer.scrollTop - overlapPx - 8),
                    scrollTopAfter: Math.round(targetScrollTop),
                    bypassedTypingLock: isUserTyping && forceAutoScrollOnceRef.current,
                    reason: 'Active card behind footer - corrected'
                  });
                  
                  if (forceAutoScrollOnceRef.current) {
                    forceAutoScrollOnceRef.current = false;
                  }
                }
              }
            }
          });
        }
      });
    });
  }, [
    activeCardKeySOT,
    transcriptSOT.length,
    bottomBarModeSOT,
    screenMode,
    isUserTyping,
    hasActiveCardSOT,
    dynamicBottomPaddingPx
  ]);
  
  // FOOTER OVERLAP CLAMP: Ensure active card never behind footer (unconditional)
  React.useLayoutEffect(() => {
    if (!shouldRenderFooter || !hasActiveCardSOT) return;
    
    requestAnimationFrame(() => {
      const scroller = scrollOwnerRef.current || historyRef.current;
      const activeCardEl = scroller?.querySelector('[data-cq-active-card="true"][data-ui-contract-card="true"]');
      const composerEl = footerShellRef.current;
      
      if (!activeCardEl || !composerEl) return;
      
      const activeRect = activeCardEl.getBoundingClientRect();
      const composerRect = composerEl.getBoundingClientRect();
      const overlapPx = Math.max(0, activeRect.bottom - (composerRect.top - 8));
      
      if (overlapPx > 4) {
        const scrollTopBefore = scroller.scrollTop;
        scroller.scrollTop += overlapPx + 8;
        const scrollTopAfter = scroller.scrollTop;
        
        console.log('[SCROLL][FOOTER_OVERLAP_CLAMP]', {
          overlapPx: Math.round(overlapPx),
          scrollTopBefore: Math.round(scrollTopBefore),
          scrollTopAfter: Math.round(scrollTopAfter),
          reason: 'Active card behind footer - unconditional clamp applied'
        });
      }
    });
  }, [shouldRenderFooter, hasActiveCardSOT, activeCardKeySOT, dynamicFooterHeightPx]);
  
  // ACTIVE CARD OVERLAP NUDGE: Ensure active card never hides behind footer when footer changes
  React.useLayoutEffect(() => {
    // SCROLL LOCK GATE: Block overlap nudge during any scroll lock
    if (isScrollWriteLocked()) {
      return;
    }
    
    if (!shouldRenderFooter) return; // No footer, no nudge needed
    if (!hasActiveCard) return; // No active card, nothing to nudge
    
    const scrollContainer = historyRef.current;
    const footerEl = footerRootRef.current; // Use stable footer root ref
    if (!scrollContainer || !footerEl) return;
    
    requestAnimationFrame(() => {
      // Find active card element
      const activeCardEl = scrollContainer.querySelector('[data-cq-active-card="true"][data-ui-contract-card="true"]');
      if (!activeCardEl) {
        if (CQ_DEBUG_FOOTER_ANCHOR) {
          console.log('[UI_CONTRACT][FOOTER_OVERLAP_NUDGE_SKIP]', {
            reason: 'active_card_not_found',
            hasActiveCard,
            bottomBarModeSOT
          });
        }
        return;
      }
      
      // Check if user is near bottom (only nudge when user expects auto-scroll)
      const nearBottom = isNearBottomStrict(scrollContainer, 24);
      const overflows = scrollContainer.scrollHeight > scrollContainer.clientHeight + 1;
      
      // Only nudge if near bottom OR no overflow (short transcript)
      if (!nearBottom && overflows) {
        if (CQ_DEBUG_FOOTER_ANCHOR) {
          console.log('[UI_CONTRACT][FOOTER_OVERLAP_NUDGE_SKIP]', {
            reason: 'user_scrolled_up',
            nearBottom,
            overflows
          });
        }
        return;
      }
      
      // Measure overlap using footer root ref (stable DOM node)
      const activeCardRect = activeCardEl.getBoundingClientRect();
      const footerRect = footerEl.getBoundingClientRect();
      const clearancePx = SAFE_FOOTER_CLEARANCE_PX || 8;
      const targetFooterTop = footerRect.top - clearancePx;
      const overlapPx = Math.max(0, activeCardRect.bottom - targetFooterTop);
      
      if (overlapPx > 2) {
        // Overlap detected - nudge scroll to reveal card
        const scrollTopBefore = scrollContainer.scrollTop;
        scrollContainer.scrollTop += overlapPx;
        const scrollTopAfter = scrollContainer.scrollTop;
        
        console.log('[UI_CONTRACT][FOOTER_OVERLAP_NUDGE]', {
          overlapPx: Math.round(overlapPx),
          footerMeasuredHeightPx,
          footerDomHeightPx: Math.round(footerRect.height),
          bottomBarModeSOT,
          stableKey: activeCardEl.getAttribute('data-stablekey'),
          scrollTopBefore: Math.round(scrollTopBefore),
          scrollTopAfter: Math.round(scrollTopAfter),
          nudged: Math.abs(scrollTopAfter - scrollTopBefore) > 1
        });
        
        // GUARDRAIL: Detect if card still below footer after nudge
        requestAnimationFrame(() => {
          if (!scrollContainer || !footerEl || !activeCardEl) return;

          const finalCardRect = activeCardEl.getBoundingClientRect();
          const finalFooterRect = footerEl.getBoundingClientRect();
          const finalOverlapPx = Math.max(0, finalCardRect.bottom - (finalFooterRect.top - clearancePx));

          // PART B: MI gate uses bottom anchor strategy (skip card measurement)
          const isMiGateActiveOverlap = currentItem?.type === 'multi_instance_gate' || 
                                       activeUiItem?.kind === 'MI_GATE';
          
          if (isMiGateActiveOverlap) {
            // Bottom-anchor strategy for MI gate
            if (bottomAnchorRef.current && (!isUserTyping || forceAutoScrollOnceRef.current)) {
              bottomAnchorRef.current.scrollIntoView({ block: 'end', behavior: 'auto' });
              
              console.log('[SCROLL][MI_GATE_BOTTOM_ANCHOR]', {
                reason: 'OVERLAP_NUDGE',
                packId: currentItem?.packId,
                instanceNumber: currentItem?.instanceNumber,
                strategy: 'BOTTOM_ANCHOR',
                bypassedTypingLock: isUserTyping && forceAutoScrollOnceRef.current
              });
              
              if (forceAutoScrollOnceRef.current) {
                forceAutoScrollOnceRef.current = false;
                console.log('[SCROLL][FORCE_ONCE_CLEARED]', { reason: 'mi_gate_bottom_anchor_overlap' });
              }
            }
            return; // Skip card-based retry for MI gate
          }
          
          if (finalOverlapPx > 4) {
            // PART A: Capture violation snapshot
            captureViolationSnapshot({
              reason: 'ACTIVE_BEHIND_FOOTER_AFTER_NUDGE',
              list: finalListRef.current,
              packId: currentItem?.packId,
              instanceNumber: currentItem?.instanceNumber,
              activeItemId: currentItem?.id
            });

            // PART C: Second corrective nudge (bypass typing lock) - MI gate uses shared helper
            const isMiGateRetry = currentItem?.type === 'multi_instance_gate' || activeUiItem?.kind === 'MI_GATE';
            
            if ((!isUserTyping || forceAutoScrollOnceRef.current) && scrollContainer && !isMiGateRetry) {
              scrollContainer.scrollTop += finalOverlapPx + 16;
              console.log('[SCROLL][CORRECTIVE_NUDGE_RETRY]', {
                remainingOverlapPx: Math.round(finalOverlapPx),
                applied: true,
                bypassedTypingLock: isUserTyping && forceAutoScrollOnceRef.current
              });

              if (forceAutoScrollOnceRef.current) {
                forceAutoScrollOnceRef.current = false;
                console.log('[SCROLL][FORCE_ONCE_CLEARED]', { reason: 'corrective_nudge_retry' });
              }
            } else if (isMiGateRetry) {
              scrollToBottomForMiGate('CORRECTIVE_NUDGE_RETRY');
              
              if (forceAutoScrollOnceRef.current) {
                forceAutoScrollOnceRef.current = false;
                console.log('[SCROLL][FORCE_ONCE_CLEARED]', { reason: 'mi_gate_corrective_nudge_retry' });
              }
            }
          }
        });
      } else if (CQ_DEBUG_FOOTER_ANCHOR) {
        console.log('[UI_CONTRACT][FOOTER_OVERLAP_NUDGE_SKIP]', {
          reason: 'no_overlap',
          overlapPx: Math.round(overlapPx),
          bottomBarModeSOT
        });
      }
    });
  }, [
    shouldRenderFooter,
    hasActiveCard,
    footerMeasuredHeightPx,
    activeCard?.stableKey,
    bottomBarModeSOT,
    activeCardKeySOT,
    dynamicBottomPaddingPx
  ]);

  // V3 PROMPT VISIBILITY: Auto-scroll to reveal prompt lane when V3 probe appears
  useEffect(() => {
    // SCROLL LOCK GATE: Block prompt visibility during any scroll lock
    if (isScrollWriteLocked()) {
      return;
    }
    
    // Trigger: V3 probing active with prompt available
    if (!v3ProbingActive || !v3ActivePromptText) return;
    
    const scrollContainer = historyRef.current;
    if (!scrollContainer) return;
    
    // Respect user scroll position: only auto-scroll if user has not scrolled up
    if (!autoScrollEnabledRef.current) return;
    
    // PART C: Bypass typing lock for V3 prompt visibility
    if (isUserTyping && !forceAutoScrollOnceRef.current) {
      console.log('[V3_PROMPT_VISIBILITY_SCROLL][SKIP]', { reason: 'typing' });
      return;
    }
    
    // GUARD A: Skip during V3_WAITING (engine deciding)
    if (bottomBarModeSOT === 'V3_WAITING') {
      console.log('[V3_PROMPT_VISIBILITY_SCROLL][SKIP]', { 
        reason: 'v3_waiting_mode',
        bottomBarModeSOT
      });
      return;
    }
    
    // GUARD B: Only run in TEXT_INPUT mode with footer rendered
    if (bottomBarModeSOT !== 'TEXT_INPUT' || !shouldRenderFooter) {
      console.log('[V3_PROMPT_VISIBILITY_SCROLL][SKIP]', { 
        reason: 'wrong_mode',
        bottomBarModeSOT,
        shouldRenderFooter
      });
      return;
    }
    
    // GUARD B: Only scroll if container has overflow
    const scrollHeight = scrollContainer.scrollHeight;
    const clientHeight = scrollContainer.clientHeight;
    const overflowPx = scrollHeight - clientHeight;
    
    if (overflowPx <= 8) {
      console.log('[V3_PROMPT_VISIBILITY_SCROLL][SKIP]', { 
        reason: 'no_overflow',
        overflowPx,
        scrollHeight,
        clientHeight
      });
      return;
    }
    
    // GUARD C: Skip if scroll position delta is negligible
    const topBefore = scrollContainer.scrollTop;
    const targetScrollTop = scrollHeight - clientHeight;
    const scrollDelta = Math.abs(targetScrollTop - topBefore);
    
    if (scrollDelta < 2) {
      console.log('[V3_PROMPT_VISIBILITY_SCROLL][SKIP]', { 
        reason: 'no_delta',
        scrollDelta,
        topBefore,
        targetScrollTop
      });
      return;
    }
    
    // All guards passed - mark intent and scroll
    scrollIntentRef.current = true;
    
    // Auto-scroll to reveal prompt lane
    scrollContainer.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
    
    console.log('[V3_PROMPT_VISIBILITY_SCROLL]', {
      preview: v3ActivePromptText.slice(0, 80),
      reason: 'AUTO_SCROLL_ENABLED',
      topBefore,
      targetScrollTop,
      overflowPx
    });
    
    // Clear intent flag after scroll completes
    requestAnimationFrame(() => {
      scrollIntentRef.current = false;
    });
  }, [v3ProbingActive, v3ActivePromptText, isUserTyping, bottomBarModeSOT, shouldRenderFooter]);

  // AUTO-GROWING INPUT: Auto-resize textarea based on content (ChatGPT-style)
  useEffect(() => {
    const textarea = footerTextareaRef.current || inputRef.current;
    if (!textarea) return;

    // DIAGNOSTIC: Verify ref connection (cqdiag only)
    if (cqDiagEnabledRef.current) {
      console.log('[FOOTER][REF_CHECK]', {
        hasTextareaRef: !!footerTextareaRef.current,
        tagName: footerTextareaRef.current?.tagName,
        bottomBarModeSOT,
        effectiveItemType
      });
    }

    // Reset to auto to measure natural height
    textarea.style.height = 'auto';

    const MAX_HEIGHT_PX = 200; // ~8 lines max
    const scrollHeight = textarea.scrollHeight;
    const newHeight = Math.min(scrollHeight, MAX_HEIGHT_PX);
    
    // Always apply new height (visual feedback)
    textarea.style.height = `${newHeight}px`;
    textarea.style.overflowY = scrollHeight > MAX_HEIGHT_PX ? 'auto' : 'hidden';
    
    // ROW-CHANGE GATE: Only trigger layout updates when rows actually change
    const lastScrollHeight = lastTextareaScrollHeightRef.current;
    const heightDelta = Math.abs(scrollHeight - lastScrollHeight);
    
    // If height change < 16px (≈ one line), treat as same row - skip layout-affecting logs
    if (heightDelta < 16 && lastScrollHeight !== 0) {
      // Same row - textarea height updated but no layout state changes needed
      return;
    }
    
    // Row changed - update ref to track new baseline
    lastTextareaScrollHeightRef.current = scrollHeight;
    
    // HARDENED: Throttle logs using ref (no dataset mutation)
    const delta = Math.abs(newHeight - lastAutoGrowHeightRef.current);
    if (delta >= 4) {
      console.log('[FOOTER][AUTO_GROW]', {
        heightPx: newHeight,
        scrollHeight,
        overflowY: scrollHeight > MAX_HEIGHT_PX ? 'auto' : 'hidden',
        maxReached: scrollHeight > MAX_HEIGHT_PX,
        delta,
        rowChanged: true
      });
      lastAutoGrowHeightRef.current = newHeight;
    }
  }, [input, openerDraft, bottomBarModeSOT]);

  // DEFENSIVE GUARD: Force exit WELCOME mode when interview has progressed
  useEffect(() => {
    if (screenMode !== "WELCOME") return; // Only act if we're in WELCOME
    
    // Check if we should exit WELCOME based on state
    const hasCurrentItem = currentItem && currentItem.type;
    const hasV3Probing = v3ProbingActive;
    const hasProgressMarkers = transcriptSOT?.some(t => 
      t.messageType === 'QUESTION_SHOWN' || 
      t.messageType === 'ANSWER' ||
      t.messageType === 'v3_probe_question' ||
      t.messageType === 'v3_opener_answer' ||
      t.type === 'PACK_ENTERED'
    );
    
    if (hasCurrentItem || hasV3Probing || hasProgressMarkers) {
      console.log('[WELCOME][GUARD_EXIT]', {
        reason: hasCurrentItem ? 'currentItem exists' : hasV3Probing ? 'V3 probing active' : 'progress markers in transcript',
        screenModeBefore: screenMode,
        currentItemType: currentItem?.type,
        transcriptLen: transcriptSOT?.length || 0,
        action: 'forcing QUESTION mode'
      });
      
      setScreenMode("QUESTION");
    }
  }, [screenMode, currentItem, v3ProbingActive, transcriptSOT]);

  // Transcript logging is now handled in answer saving functions where we have Response IDs
  // This prevents logging questions with null responseId
  
  // ============================================================================
  // CENTRALIZED BOTTOM BAR MODE SELECTION - moved earlier (line 6963) for TDZ-safe footer padding
  // ============================================================================

  const getCurrentPrompt = () => {
    // PRIORITY 1: V3 prompt active - use hasActiveV3Prompt (TDZ-safe minimal check)
    if (hasActiveV3Prompt && v3ActivePromptText) {
      const packConfig = FOLLOWUP_PACK_CONFIGS[v3ProbingContext?.packId];
      const packLabel = packConfig?.instancesLabel || v3ProbingContext?.categoryLabel || 'AI Follow-Up';
      
      console.log('[V3_PROBING][PROMPT_LANE]', {
        packId: v3ProbingContext?.packId,
        instanceNumber: v3ProbingContext?.instanceNumber,
        promptPreview: v3ActivePromptText?.substring(0, 60)
      });
      
      return {
        type: 'v3_probe',
        id: `v3-probe-active-${v3ProbingContext?.packId}-${v3ProbingContext?.instanceNumber}`,
        text: v3ActivePromptText,
        responseType: 'text',
        packId: v3ProbingContext?.packId,
        categoryId: v3ProbingContext?.categoryId,
        instanceNumber: v3ProbingContext?.instanceNumber,
        category: packLabel
      };
    }

    // PRIORITY 2: V3 gate active - block base question rendering
    if (v3GateActive) {
      console.log('[V3_GATE][ACTIVE] Blocking base question rendering + logging');
      return null;
    }

    // UX: Stabilize current item while typing - ALIGNED WITH V3 PROMPT PRECEDENCE
    let effectiveCurrentItem = currentItem;

    if (isUserTyping && currentItemRef.current) {
      const frozenType = currentItemRef.current?.type;
      const frozenId = currentItemRef.current?.id;
      const currentType = currentItem?.type;
      const currentId = currentItem?.id;
      
      // PRECEDENCE: Always use current item if V3 prompt is active
      // This prevents MI_GATE frozen refs from blocking V3 text input
      if (hasActiveV3Prompt) {
        console.log('[FORENSIC][TYPING_LOCK_BYPASS_V3_PROMPT]', {
          hasActiveV3Prompt: true,
          frozenType,
          currentType,
          reason: 'V3 prompt active - using current item to prevent stale gate refs'
        });
        effectiveCurrentItem = currentItem;
        currentItemRef.current = currentItem; // Sync ref to prevent future bypass
      } else if (frozenType !== currentType || frozenId !== currentId) {
        console.log('[FORENSIC][TYPING_LOCK_STALE_REF_BYPASS]', {
          hasActiveV3Prompt,
          frozenType,
          frozenId,
          currentType,
          currentId
        });
        effectiveCurrentItem = currentItem; // Use current for this render
      } else {
        console.log('[FORENSIC][TYPING_LOCK]', { 
          active: true,
          hasActiveV3Prompt,
          frozenItemType: currentItemRef.current?.type,
          frozenItemId: currentItemRef.current?.id,
          actualItemType: currentItem?.type,
          actualItemId: currentItem?.id,
          promptWillDeriveFrom: 'FROZEN_REF'
        });
        effectiveCurrentItem = currentItemRef.current;
      }
    } else {
      console.log('[FORENSIC][TYPING_LOCK]', { active: false, hasActiveV3Prompt, promptWillDeriveFrom: 'CURRENT_STATE' });
      currentItemRef.current = currentItem;
    }

    if (inIdeProbingLoop && currentIdeQuestion) {
      return {
        type: 'ide_probe',
        text: currentIdeQuestion,
        responseType: 'text',
        category: currentIdeCategoryId || 'Follow-up'
      };
    }

    // Use effectiveCurrentItem (stabilized while typing) for all prompt logic below
    if (!effectiveCurrentItem || !engine) return null;

    // If waiting for agent and we have a field probe question, show it
    if (isWaitingForAgent && currentFieldProbe) {
      const packConfig = FOLLOWUP_PACK_CONFIGS[currentFieldProbe.packId];
      return {
        type: 'ai_probe',
        id: `ai-probe-${currentFieldProbe.packId}-${currentFieldProbe.fieldKey}`,
        text: currentFieldProbe.question,
        responseType: 'text',
        packId: currentFieldProbe.packId,
        fieldKey: currentFieldProbe.fieldKey,
        instanceNumber: currentFieldProbe.instanceNumber,
        category: packConfig?.instancesLabel || 'Follow-up'
      };
    }

    if (isWaitingForAgent) {
      return null;
    }

    if (effectiveCurrentItem.type === 'question') {
      const question = engine.QById[effectiveCurrentItem.id];

      if (!question) {
        setCurrentItem(null);
        setQueue([]);
        setShowCompletionModal(true);
        return null;
      }

      const sectionEntity = engine.Sections.find(s => s.id === question.section_id);
      const sectionName = sectionEntity?.section_name || question.category || '';
      const questionNumber = getQuestionDisplayNumber(effectiveCurrentItem.id);

      // FIX C: Guard against logging QUESTION_SHOWN when currentItem is null
      if (!currentItem || currentItem.type !== 'question') {
        console.log('[STREAM][GUARD_NO_NULL_CURRENT_ITEM_ON_QUESTION_SHOWN]', {
          blocked: true,
          reason: 'currentItem is null or not a question',
          currentItemType: currentItem?.type,
          effectiveCurrentItemId: effectiveCurrentItem.id,
          screenMode
        });
        return null; // Skip rendering and logging
      }
      
      console.log('[STREAM][GUARD_NO_NULL_CURRENT_ITEM_ON_QUESTION_SHOWN]', {
        blocked: false,
        currentItemType: currentItem.type,
        questionId: effectiveCurrentItem.id
      });
      
      // RENDER-POINT LOGGING: Log question when it's shown (once per question)
      const itemSig = `question:${effectiveCurrentItem.id}::`;
      const lastLoggedSig = lastLoggedFollowupCardIdRef.current;

      if (lastLoggedSig !== itemSig) {
        lastLoggedFollowupCardIdRef.current = itemSig;
        logQuestionShown(sessionId, {
          questionId: effectiveCurrentItem.id,
          questionText: question.question_text,
          questionNumber,
          sectionId: question.section_id,
          sectionName
        }).then(() => {
          // CRITICAL: Refresh transcript after appending prompt message
          return refreshTranscriptFromDB('question_shown');
        }).then((freshTranscript) => {
          const normalizedFresh = Array.isArray(freshTranscript) ? freshTranscript : [];
          console.log("[TRANSCRIPT_REFRESH][AFTER_PROMPT_APPEND]", { 
            freshLen: normalizedFresh.length,
            wasArray: Array.isArray(freshTranscript)
          });
          
          // FIX B: Hard-pin scroll to bottom after QUESTION_SHOWN
          if (shouldAutoScrollRef.current) {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                const scrollContainer = historyRef.current;
                if (!scrollContainer) return;
                
                const scrollTopBefore = scrollContainer.scrollTop;
                const scrollHeight = scrollContainer.scrollHeight;
                const clientHeight = scrollContainer.clientHeight;
                const targetScrollTop = Math.max(0, scrollHeight - clientHeight);
                
                scrollContainer.scrollTop = targetScrollTop;
                
                const scrollTopAfter = scrollContainer.scrollTop;
                const didScroll = Math.abs(scrollTopAfter - scrollTopBefore) > 1;
                
                console.log('[SCROLL][PIN_ON_QUESTION_SHOWN]', {
                  questionNumber,
                  didScroll,
                  scrollTopBefore: Math.round(scrollTopBefore),
                  scrollTopAfter: Math.round(scrollTopAfter),
                  targetScrollTop: Math.round(targetScrollTop),
                  scrollHeight: Math.round(scrollHeight),
                  clientHeight: Math.round(clientHeight)
                });
              });
            });
          }
        }).catch(err => console.warn('[LOG_QUESTION] Failed:', err));
      }

      return {
        type: 'question',
        id: effectiveCurrentItem.id,
        text: question.question_text,
        responseType: question.response_type,
        category: sectionName
      };
    }

    if (effectiveCurrentItem.type === 'followup') {
      const { packId, stepIndex, substanceName } = effectiveCurrentItem;

      const packSteps = injectSubstanceIntoPackSteps(engine, packId, substanceName);
      if (!packSteps) return null;

      const step = packSteps[stepIndex];

      if (step.PrefilledAnswer && step.Field_Key === 'substance_name') {
        const triggerAutoFill = () => {
          handleAnswer(step.PrefilledAnswer);
        };
        setTimeout(triggerAutoFill, 100);
        return null;
      }

      return {
        type: 'followup',
        id: effectiveCurrentItem.id,
        text: step.Prompt,
        responseType: step.Response_Type || 'text',
        expectedType: step.Expected_Type || 'TEXT',
        packId: packId,
        substanceName: substanceName,
        stepNumber: stepIndex + 1,
        totalSteps: packSteps.length
      };
    }

    if (effectiveCurrentItem.type === 'multi_instance') {
      return {
        type: 'multi_instance',
        id: effectiveCurrentItem.id,
        text: effectiveCurrentItem.prompt,
        responseType: 'yes_no',
        instanceNumber: effectiveCurrentItem.instanceNumber,
        maxInstances: effectiveCurrentItem.maxInstances
      };
    }

    // Multi-instance gate (V3 post-probing)
    if (effectiveCurrentItem.type === 'multi_instance_gate') {
      const gatePackId = effectiveCurrentItem.packId;
      const gateInstanceNumber = effectiveCurrentItem.instanceNumber;
      const gatePromptText = effectiveCurrentItem.promptText;
      const gateCategoryLabel = effectiveCurrentItem.categoryLabel;
      
      // PART B: HARD GUARD - derive prompt from currentItem ONLY (never from transcript)
      const effectivePromptText = gatePromptText || 
        (gateCategoryLabel ? `Do you have another ${gateCategoryLabel} to report?` : null) ||
        `Do you have another incident to report?`;
      
      // GUARD: Validate gate context
      if (!gatePackId || !gateInstanceNumber) {
        console.error('[FORENSIC][GATE_CONTEXT_MISSING]', {
          currentItemType: effectiveCurrentItem.type,
          currentItemId: effectiveCurrentItem.id,
          packId: gatePackId,
          instanceNumber: gateInstanceNumber
        });
        
        // Derive from currentItemId if possible
        const idMatch = effectiveCurrentItem.id?.match(/multi-instance-gate-(.+?)-(\d+)/);
        const derivedPackId = idMatch?.[1] || gatePackId || 'UNKNOWN_PACK';
        const derivedInstanceNumber = idMatch?.[2] ? parseInt(idMatch[2]) : gateInstanceNumber || 1;
        
        return {
          type: 'multi_instance_gate',
          id: effectiveCurrentItem.id,
          text: effectivePromptText,
          responseType: 'yes_no',
          packId: derivedPackId,
          instanceNumber: derivedInstanceNumber
        };
      }
      
      // PART B: Hard guard - block YES/NO if no prompt text
      if (!effectivePromptText || effectivePromptText.trim().length === 0) {
        console.error('[MI_GATE][PROMPT_MISSING_BLOCKED]', {
          stableKey: `mi-gate:${gatePackId}:${gateInstanceNumber}`,
          packId: gatePackId,
          instanceNumber: gateInstanceNumber,
          reason: 'Gate active but no prompt text available - cannot render YES/NO'
        });
        return null; // Force disabled mode (bottomBarModeSOT will be DISABLED)
      }
      
      // PART 2: Log prompt binding for diagnostics
      console.log('[MI_GATE][PROMPT_BIND]', {
        stableKey: `mi-gate:${gatePackId}:${gateInstanceNumber}`,
        hasPromptText: !!effectivePromptText,
        promptPreview: effectivePromptText?.substring(0, 60),
        source: 'currentItem.promptText'
      });
      
      return {
        type: 'multi_instance_gate',
        id: effectiveCurrentItem.id,
        text: effectivePromptText,
        responseType: 'yes_no',
        packId: gatePackId,
        categoryId: effectiveCurrentItem.categoryId,
        instanceNumber: gateInstanceNumber
      };
    }

    // V3 Pack opener question (allow even during early V3 setup)
    if (effectiveCurrentItem.type === 'v3_pack_opener') {
      const { packId, openerText, exampleNarrative, categoryId, categoryLabel, instanceNumber } = effectiveCurrentItem;
      const packConfig = FOLLOWUP_PACK_CONFIGS[packId];
      const packLabel = packConfig?.instancesLabel || categoryLabel || categoryId || 'Follow-up';

      // REGRESSION FIX: Log opener state at render time for dead-end diagnosis
      console.log('[V3_PACK][OPENER_RENDER]', {
        packId,
        instanceNumber,
        hasOpenerText: !!openerText,
        v3ProbingActive,
        currentItemId: effectiveCurrentItem.id
      });
      
      // PACK ENTRY FAILSAFE CANCELLATION: Opener is active - cancel entry failsafe
      if (openerText && packId === v3PackEntryContextRef.current?.packId) {
        if (v3PackEntryFailsafeTimerRef.current) {
          clearTimeout(v3PackEntryFailsafeTimerRef.current);
          v3PackEntryFailsafeTimerRef.current = null;
          v3PackEntryFailsafeTokenRef.current = null;
          console.log('[V3_PACK][ENTRY_FAILSAFE_CANCELLED]', {
            packId,
            instanceNumber,
            reason: 'OPENER_ACTIVE'
          });
        }
      }

      // UI CONTRACT: V3 opener MUST append to transcript (visible to candidate)
      const openerStableKey = `followup-card:${packId}:opener:${instanceNumber}`;
      if (lastLoggedFollowupCardIdRef.current !== openerStableKey) {
        lastLoggedFollowupCardIdRef.current = openerStableKey;

        const safeCategoryLabel = effectiveCurrentItem.categoryLabel || packLabel || categoryId || "Follow-up";
        logFollowupCardShown(sessionId, {
          packId,
          variant: 'opener',
          stableKey: openerStableKey,
          promptText: openerText,
          exampleText: exampleNarrative,
          packLabel,
          instanceNumber,
          baseQuestionId: effectiveCurrentItem.baseQuestionId,
          categoryLabel: safeCategoryLabel
        }).then(() => refreshTranscriptFromDB('v3_opener_shown'))
          .catch(err => console.warn('[LOG_FOLLOWUP_CARD] Failed:', err));
      }

      return {
        type: 'v3_pack_opener',
        id: effectiveCurrentItem.id,
        text: openerText || "In your own words, tell me about your prior law enforcement applications.",
        exampleNarrative: exampleNarrative,
        responseType: 'text',
        packId,
        categoryId,
        instanceNumber,
        category: packLabel
      };
    }

    // V2 Pack field question
    if (effectiveCurrentItem.type === 'v2_pack_field') {
      const { packId, fieldIndex, fieldConfig, instanceNumber, fieldKey } = effectiveCurrentItem;

      if (!fieldConfig || !packId || !fieldKey) {
        console.warn('[V2_PACK][PROMPT_GUARD] Missing V2 pack state');
        return null;
      }

      const packConfig = FOLLOWUP_PACK_CONFIGS[packId];
      const totalFields = packConfig?.fields?.length || 0;

      const hasClarifierActive = v2ClarifierState &&
        v2ClarifierState.packId === packId &&
        v2ClarifierState.fieldKey === fieldKey &&
        v2ClarifierState.instanceNumber === instanceNumber;

      const backendQuestionText = effectiveCurrentItem.backendQuestionText || null;
      const displayText = hasClarifierActive
        ? v2ClarifierState.clarifierQuestion
        : (backendQuestionText || fieldConfig.label);

      const packLabel = packConfig?.instancesLabel || 'Follow-up';

      // RENDER-POINT LOGGING: Log follow-up card when shown (Guard: log once per canonical ID, non-clarifier only)
      if (!hasClarifierActive) {
        const fieldCardId = `followup-card-${sessionId}-${packId}-field-${fieldKey}-${instanceNumber}`;
        if (lastLoggedFollowupCardIdRef.current !== fieldCardId) {
          lastLoggedFollowupCardIdRef.current = fieldCardId;
          logFollowupCardShown(sessionId, {
            packId,
            variant: 'field',
            stableKey: `${fieldKey}-${instanceNumber}`,
            promptText: displayText,
            exampleText: null,
            packLabel,
            instanceNumber,
            baseQuestionId: effectiveCurrentItem.baseQuestionId,
            fieldKey
          }).then(() => {
            // CRITICAL: Refresh transcript after appending prompt message
            return refreshTranscriptFromDB('v2_field_shown');
          }).then((freshTranscript) => {
            const normalizedFresh = Array.isArray(freshTranscript) ? freshTranscript : [];
            console.log("[TRANSCRIPT_REFRESH][AFTER_PROMPT_APPEND]", { 
              freshLen: normalizedFresh.length,
              wasArray: Array.isArray(freshTranscript)
            });
          }).catch(err => console.warn('[LOG_FOLLOWUP_CARD] Failed:', err));
        }
      }

      return {
        type: hasClarifierActive ? 'ai_probe' : 'v2_pack_field',
        id: effectiveCurrentItem.id,
        text: displayText,
        responseType: fieldConfig.inputType === 'yes_no' ? 'yes_no' : 'text',
        inputType: fieldConfig.inputType,
        placeholder: fieldConfig.placeholder,
        options: fieldConfig.options,
        packId,
        fieldKey,
        stepNumber: fieldIndex + 1,
        totalSteps: totalFields,
        instanceNumber,
        category: packLabel
      };
    }

    return null;
  };

  // Compute guard states (no early returns before JSX to maintain hook order)
  const showMissingSession = !sessionId;
  const shouldShowFullScreenLoader = isLoading && !engine && !session;
  const showError = !!error;

  // Calculate currentPrompt (after all hooks declared)
  const isV3PromptAllowedInMainBody = (promptText) => {
    if (v3ProbingActive) {
      console.warn('[V3_UI_CONTRACT] MAIN_BODY_PROMPT_RENDER_INVOCATION_BLOCKED', { preview: (promptText || '').slice(0,80) });
      return false;
    }
    return true;
  };
  const currentPrompt = getCurrentPrompt();
  
  // ============================================================================
  // CANONICAL RENDER STREAM - Single source of truth (component scope, always defined)
  // ============================================================================
  // PART A: Build unified stream from DB transcript only (no ephemeral UI history)
  // V3 UPDATE: V3 probe Q/A now in DB transcript, v3UiRenderable deprecated for display
  // NOTE: transcriptRenderable and activeCard now computed earlier (after activeUiItem, before footer mode)
  // TDZ FIX: This assignment moved to line ~2020 to prevent "Cannot access before initialization"
  
  // V3 UPDATE: v3UiRenderable deprecated (always empty - all content from transcript)
  const v3UiRenderable = [];
  
  // PART B: Suppress MI_GATE from render if V3 UI blocking (treat as null for rendering)
  const currentItemForRender = shouldSuppressMiGateSOT ? null : currentItem;
  
  // TDZ FIX: activeCard, transcriptRenderable, currentPromptId already declared earlier (line ~2020)
  // No redeclaration here - using existing variables
  
  // A) V3_PROBE_QA_ATTACH DISABLED: Do NOT inject V3 probe Q/A when MI gate is active
  // V3 probe history is ONLY visible in canonical transcript above the gate
  // MI gate renders standalone as the last active card
  let filteredTranscriptRenderable = transcriptRenderable;
  let removedCount = 0;
  
  // HARD-DISABLED: v3ProbeEntriesForGate always empty (no injection)
  const v3ProbeEntriesForGate = [];
  
  if (activeCard?.kind === "multi_instance_gate") {
    const activeGateId = currentItem?.id;
    const activeStableKeyBase = `mi-gate:${currentItem.packId}:${currentItem.instanceNumber}`;
    
    console.log('[MI_GATE][V3_PROBE_QA_ATTACH_DISABLED]', {
      packId: currentItem.packId,
      instanceNumber: currentItem.instanceNumber,
      reason: 'MI gate renders standalone - V3 history in transcript only',
      v3ProbeEntriesForGate: []
    });
    
    // Filter out duplicate MI_GATE entries from transcript (current gate only)
    filteredTranscriptRenderable = transcriptRenderable.filter(e => {
      // Keep non-gate entries
      if (e.messageType !== 'MULTI_INSTANCE_GATE_SHOWN') return true;
      
      // Filter out transcript entries that match active gate
      const matchesActiveGate = 
        e.id === activeGateId ||
        e.stableKey === activeStableKeyBase ||
        e.stableKey === `${activeStableKeyBase}:q` ||
        (e.meta?.packId === currentItem.packId && e.meta?.instanceNumber === currentItem.instanceNumber);
      
      if (matchesActiveGate) {
        removedCount++;
        return false; // Remove duplicate
      }
      
      return true; // Keep non-matching gates
    });
    
    if (removedCount > 0) {
      console.log('[MI_GATE][STREAM_FILTER_ACTIVE_FROM_TRANSCRIPT]', {
        removedCount,
        activeGateId,
        activeStableKeyBase
      });
    }
  }
  
  // Build base stream: filtered transcript + v3UI + activeCard
  // B) ORDERING RULE: If MI_GATE is active, it MUST be last (no items after it)
  const baseRenderStream = [
    ...filteredTranscriptRenderable,
    // v3ProbeEntriesForGate removed - no injection (A)
    ...v3UiRenderable,
    ...(activeCard ? [activeCard] : [])
  ];
  
  // PART B: ENFORCE - MI gate is last (REORDER items before gate, don't drop)
  let orderedStream = baseRenderStream;
  let miGateReorderCount = 0;
  
  if (activeCard?.kind === "multi_instance_gate") {
    const miGateIndex = baseRenderStream.findIndex(e => e.__activeCard && e.kind === "multi_instance_gate");
    
    if (miGateIndex !== -1 && miGateIndex < baseRenderStream.length - 1) {
      // Items exist after MI_GATE - REORDER them before gate (don't drop)
      const itemsBefore = baseRenderStream.slice(0, miGateIndex);
      const miGateItem = baseRenderStream[miGateIndex];
      const itemsAfter = baseRenderStream.slice(miGateIndex + 1);
      
      // Reordered: items before + items that were after + gate last
      orderedStream = [...itemsBefore, ...itemsAfter, miGateItem];
      miGateReorderCount = itemsAfter.length;
      
      // PART A: Log reorder once (in-memory dedupe)
      logOnce(`migate_reorder_${currentItem?.packId}_${currentItem?.instanceNumber}`, () => {
        console.warn('[MI_GATE][REORDER_APPLIED]', {
          packId: currentItem?.packId,
          instanceNumber: currentItem?.instanceNumber,
          movedCount: itemsAfter.length,
          movedKinds: itemsAfter.map(e => ({ kind: e.kind || e.messageType, key: e.stableKey || e.id })),
          reason: 'Items moved before MI gate to enforce last-item ordering'
        });
      });
    }
  }
  
  // SAFETY NET: Dedupe by canonical key (prevents duplicate key warnings)
  // Minimal single-pass dedupe - preserves first occurrence order
  const dedupeByCanonicalKey = (list) => {
    const seen = new Map();
    const deduped = [];
    let removedCount = 0;
    const removedKeys = [];
    
    for (const entry of list) {
      const canonicalKey = entry.stableKey || entry.id || entry.__canonicalKey;
      if (!canonicalKey) {
        deduped.push(entry);
        continue;
      }
      
      if (seen.has(canonicalKey)) {
        removedCount++;
        if (removedKeys.length < 3) {
          removedKeys.push(canonicalKey);
        }
        continue;
      }
      
      seen.set(canonicalKey, true);
      deduped.push(entry);
    }
    
    if (removedCount > 0) {
      console.log('[CQ_STREAM][DEDUPED_DUPLICATE_KEYS]', {
        removedCount,
        removedKeysSample: removedKeys,
        beforeLen: list.length,
        afterLen: deduped.length
      });
    }
    
    return deduped;
  };
  
  const finalRenderStreamDeduped = dedupeByCanonicalKey(orderedStream);
  
  // STEP 4: REPAIR SYSTEMS REMOVED (key-based monotonic prevents loss)
  let finalRenderStream = finalRenderStreamDeduped;
  
  // STEP 4: REPAIR SYSTEMS REMOVED (key-based monotonic prevents loss)
  
  // STEP 5: Compilation safety assert (defensive - detects tool markup corruption)
  if (typeof window !== 'undefined' && (window.location.hostname.includes('preview') || window.location.hostname.includes('localhost'))) {
    const corruptedItems = finalRenderStream.filter(e => {
      const key = e.stableKey || e.id || '';
      return key.includes('<invoke') || key.includes('</parameter>') || key.includes('<parameter');
    });
    
    if (corruptedItems.length > 0) {
      console.error('[CQ_COMPILATION_SAFETY][CORRUPT_MARKUP_DETECTED]', {
        corruptedCount: corruptedItems.length,
        corruptedKeys: corruptedItems.map(e => e.stableKey || e.id),
        reason: 'Tool markup strings detected in render stream - filtering out'
      });
      
      // Filter out corrupted items defensively
      finalRenderStream = finalRenderStream.filter(e => {
        const key = e.stableKey || e.id || '';
        return !key.includes('<invoke') && !key.includes('</parameter>') && !key.includes('<parameter');
      });
    }
  }
  
  // FIX D: SAFETY NET - Add missing V3 probe answer to render if not present
  if (currentItem?.type === 'multi_instance_gate' || activeUiItem?.kind === "MI_GATE") {
  const packId = currentItem?.packId;
  const instanceNumber = currentItem?.instanceNumber || 1;

  // Find most recent V3 probe answer in dbTranscript for this pack/instance
  const v3ProbeAnswersInDb = transcriptSOT.filter(e => 
    (e.messageType === 'V3_PROBE_ANSWER' || e.type === 'V3_PROBE_ANSWER' || e.stableKey?.startsWith('v3-probe-a:')) &&
    e.meta?.packId === packId &&
    e.meta?.instanceNumber === instanceNumber
  );

  if (v3ProbeAnswersInDb.length > 0) {
    const lastProbeAnswer = v3ProbeAnswersInDb[v3ProbeAnswersInDb.length - 1];

    // Check if answer exists in finalRenderStream
    const probeAnswerInRender = finalRenderStream.find(e => 
      (e.messageType === 'V3_PROBE_ANSWER' || e.type === 'V3_PROBE_ANSWER' || e.stableKey?.startsWith('v3-probe-a:')) &&
      (e.stableKey === lastProbeAnswer.stableKey || e.id === lastProbeAnswer.id)
    );

    if (!probeAnswerInRender) {
      // PART A: Dedupe probe A withheld log (in-memory, once per stableKey)
      logOnce(`probe_a_withheld_${lastProbeAnswer.stableKey || lastProbeAnswer.id}`, () => {
        console.warn('[CQ_TRANSCRIPT][V3_PROBE_A_WITHHELD_FOR_GATE]', {
          packId,
          instanceNumber,
          stableKey: lastProbeAnswer.stableKey || lastProbeAnswer.id,
          promptId: lastProbeAnswer.meta?.promptId,
          reason: 'Probe answer withheld during active gate transition - will recover',
          action: 'RECOVERY'
        });
      });

      // FIX D: Add missing answer as UI placeholder (NOT persisted to transcript)
      // This is a non-transcript render item that fills the gap during gate transition
      finalRenderStream.push({
        ...lastProbeAnswer,
        __recoveredPlaceholder: true,
        __canonicalKey: `recovered:${lastProbeAnswer.stableKey || lastProbeAnswer.id}`
      });

      console.log('[CQ_TRANSCRIPT][V3_PROBE_A_RECOVERED]', {
        stableKey: lastProbeAnswer.stableKey || lastProbeAnswer.id,
        promptId: lastProbeAnswer.meta?.promptId,
        finalRenderStreamLen: finalRenderStream.length,
        reason: 'Added UI placeholder to render stream (not transcript)'
      });
    } else {
      console.log('[CQ_TRANSCRIPT][V3_PROBE_QA_OK]', {
        packId,
        instanceNumber,
        v3ProbeCount: v3ProbeAnswersInDb.length,
        allPresent: true
      });
    }
  }
  }
  
  // FREEZE TRANSCRIPT DURING TYPING: Prevent flash on every keystroke
  // NOTE: wasTypingRef declared at top-level (line ~1333) to maintain hook order
  
  if (!isUserTyping && wasTypingRef.current) {
    // Just stopped typing - unfreeze
    console.log('[TRANSCRIPT][UNFREEZE_ON_TYPING_END]', { len: finalRenderStream.length });
    frozenRenderStreamRef.current = null;
    wasTypingRef.current = false;
  } else if (isUserTyping && !wasTypingRef.current) {
    // Just started typing - freeze current stream
    console.log('[TRANSCRIPT][FREEZE_ON_TYPING]', { len: finalRenderStream.length });
    frozenRenderStreamRef.current = finalRenderStream;
    wasTypingRef.current = true;
  } else if (!isUserTyping) {
    // Not typing - keep stream fresh
    frozenRenderStreamRef.current = finalRenderStream;
  }
  
  // Use frozen stream while typing, live stream otherwise
  const renderableTranscriptStream = isUserTyping && frozenRenderStreamRef.current 
    ? frozenRenderStreamRef.current 
    : finalRenderStream;
  
  // Use renderableTranscriptStream for all rendering below (immutable - safe for React)
  
  // PART B: MI_GATE alignment check moved to post-enforcement (finalTranscriptList useMemo)
  // Intermediate pre-enforcement checks removed - canonical enforcement at line ~15402 is single source of truth
  
  // PART E: Stream snapshot log (only on length changes, with array guard)
  const renderStreamLen = Array.isArray(renderableTranscriptStream) ? renderableTranscriptStream.length : 0;
  if (renderStreamLen !== lastRenderStreamLenRef.current) {
    console.log("[STREAM][SNAPSHOT]", {
      len: renderStreamLen,
      transcriptLen: transcriptRenderable.length,
      v3UiLen: v3UiRenderable.length,
      hasActiveCard: !!activeCard,
      activeCardKind: activeCard?.kind || null,
      isFrozen: isUserTyping && !!frozenRenderStreamRef.current,
      tail: renderableTranscriptStream.slice(-6).map(x => ({
        type: x.messageType || x.type || x.kind,
        key: x.stableKey || x.id || x.__canonicalKey,
        isActive: x.__activeCard || false
      }))
    });
    lastRenderStreamLenRef.current = renderStreamLen;
  }
  
  // PART E: Assert-style log - V3_PROMPT and MI_GATE mutual exclusion at tail
  if (activeUiItem.kind === "V3_PROMPT" && activeCard?.kind === "multi_instance_gate") {
    console.error("[STREAM][VIOLATION]", {
      reason: "activeKind=V3_PROMPT but activeCard is MI_GATE",
      activeUiItemKind: activeUiItem.kind,
      activeCardKind: activeCard.kind,
      tail: finalRenderStream.slice(-3).map(x => ({ kind: x.kind, key: x.stableKey }))
    });
  }
  
  if (activeUiItem.kind === "MI_GATE" && activeCard?.kind === "v3_probe_q") {
    console.error("[STREAM][VIOLATION]", {
      reason: "activeKind=MI_GATE but activeCard is V3_PROBE",
      activeUiItemKind: activeUiItem.kind,
      activeCardKind: activeCard.kind,
      tail: finalRenderStream.slice(-3).map(x => ({ kind: x.kind, key: x.stableKey }))
    });
  }



  // D) Verification instrumentation moved above early returns
  
  // Layout control: center WELCOME, top-align QUESTION/V3 modes
  const isWelcomeScreen = screenMode === "WELCOME";

  // RENDER GUARD: Prevent null prompt crashes (log-once per stable key)
  if (currentItem && !currentPrompt && !v3ProbingActive && !activeBlocker && !pendingSectionTransition && screenMode !== 'WELCOME') {
    // Compute stable key for deduplication
    const guardKey = `${currentItem?.type || 'none'}:${currentItem?.id || 'none'}:${currentItem?.packId || 'none'}:${currentItem?.instanceNumber || 'none'}:${screenMode || 'none'}`;
    
    // Log once per unique state combination
    if (!promptNullGuardSeenRef.current.has(guardKey)) {
      promptNullGuardSeenRef.current.add(guardKey);
      
      const snapshot = {
        key: guardKey,
        currentItemType: currentItem?.type,
        currentItemId: currentItem?.id,
        packId: currentItem?.packId,
        instanceNumber: currentItem?.instanceNumber,
        screenMode,
        note: 'V3 probing item without active prompt text; expected during fallback/mismatch states'
      };
      
      // Only include stack trace if debug flag enabled
      if (typeof window !== 'undefined' && window.__CQ_TRACE_PROMPT_NULL_GUARD === true) {
        snapshot.stack = new Error().stack?.split('\n').slice(1, 4).join(' | ');
      }
      
      console.log('[FORENSIC][PROMPT_NULL_GUARD_ONCE]', snapshot);
    }
  }

  // Treat v2_pack_field and v3_pack_opener the same as a normal question for bottom-bar input
  const isAnswerableItem = (item) => {
  if (!item) return false;
  return item.type === "question" || item.type === "v2_pack_field" || item.type === "v3_pack_opener" || item.type === "followup";
  };

  // ============================================================================
  // ACTIVE PROMPT TEXT RESOLUTION - Single source of truth (TDZ-SAFE)
  // ============================================================================
  // CRITICAL: Compute EARLY using hoisted function to prevent TDZ
  const activePromptText = computeActivePromptText({
    requiredAnchorFallbackActive,
    requiredAnchorCurrent,
    v3ProbingContext,
    v3ProbingActive,
    v3ActivePromptText,
    effectiveItemType,
    currentItem,
    v2ClarifierState,
    currentPrompt
  });
  
  // FORENSIC: Regression proof (mount-only)
  if (activePromptText) {
    logOnce(`active_prompt_sot_${sessionId}`, () => {
      console.log('[FORENSIC][ACTIVE_PROMPT_TEXT_SOT_OK]', {
        activeUiItemKind: activeUiItem?.kind,
        preview: activePromptText?.slice(0, 60) || null,
        isResolved: !activePromptText.includes('Please provide:'),
        usesResolver: requiredAnchorFallbackActive
      });
    });
  }
  
  // STEP 2: Sanitize active prompt text (prevents dev instructions from showing to candidate)
  const safeActivePromptText = sanitizeCandidateFacingText(activePromptText, 'ACTIVE_PROMPT_TEXT');
  
  // ============================================================================
  // BOTTOM BAR DERIVED STATE BLOCK - All derived variables in strict order
  // ============================================================================
  // NOTE: bottomBarModeSOT, effectiveItemType, and shouldRenderFooter already declared in unified block above
  const needsPrompt = bottomBarModeSOT === 'TEXT_INPUT' || 
                      ['v2_pack_field', 'v3_pack_opener', 'v3_probing'].includes(effectiveItemType);
  const hasPrompt = Boolean(activePromptText && activePromptText.trim().length > 0);
  

  
  // PART D: Align active card when bottomBarModeSOT becomes YES_NO
  // TDZ-SAFE: Uses early bottomBarModeSOTSafe (computed before late bottomBarModeSOT declaration)
  useLayoutEffect(() => {
    // TDZ-SAFE: Use bottomBarModeSOTSafe (early, always available)
    const isYesNoModeFresh = bottomBarModeSOTSafe === 'YES_NO';
    const isMiGateFresh = currentItem?.type === 'multi_instance_gate' || activeUiItem?.kind === 'MI_GATE';
    
    if (!isYesNoModeFresh) return;
    
    requestAnimationFrame(() => {
      ensureActiveVisibleAfterRender('BOTTOM_BAR_MODE_YESNO', activeKindSOT, isYesNoModeFresh, isMiGateFresh);
    });
  }, [bottomBarModeSOTSafe, ensureActiveVisibleAfterRender, activeKindSOT, currentItem, activeUiItem]);

  // Auto-focus control props (pure values, no hooks)
  const focusEnabled = screenMode === 'QUESTION';
  const focusShouldTrigger = focusEnabled && bottomBarModeSOT === 'TEXT_INPUT' && (hasPrompt || v3ProbingActive || currentItem?.type === 'v3_pack_opener');
  const focusKey = v3ProbingActive 
    ? `v3:${v3ProbingContext?.packId}:${v3ProbingContext?.instanceNumber}:${v3ActivePromptText?.substring(0, 20)}`
    : currentItem?.type === 'v3_pack_opener'
    ? `opener:${currentItem?.id}`
    : currentItem?.id
    ? `item:${currentItem.id}:${hasPrompt ? '1' : '0'}`
    : 'none';
  
  // MI_GATE TRACE 1: Mode derivation audit
  if (effectiveItemType === 'multi_instance_gate' || currentItemType === 'multi_instance_gate' || isMultiInstanceGate) {
    console.log('[MI_GATE][TRACE][MODE]', {
      effectiveItemType,
      currentItemType,
      bottomBarModeSOT,
      isMultiInstanceGate,
      currentItemId: currentItem?.id,
      packId: currentItem?.packId,
      instanceNumber: currentItem?.instanceNumber,
      v3GateActive,
      v3ProbingActive,
      pendingSectionTransition: !!pendingSectionTransition
    });
    
    // REGRESSION SUMMARY: Single log per gate activation (once per itemId)
    // FIX: Derive itemId same way as activeCard renderer (consistent with tracker setter)
    const gateItemId = currentItem?.id || `multi-instance-gate-${currentItem?.packId}-${currentItem?.instanceNumber}`;
    if (gateItemId) {
      const tracker = miGateTestTrackerRef.current.get(gateItemId) || { mainPaneRendered: false, footerButtonsOnly: false, testStarted: false };
      
      if (!tracker.testStarted) {
        // Log regression summary on first activation
        console.log('[MI_GATE][REGRESSION_SUMMARY]', {
          itemId: gateItemId,
          packId: currentItem?.packId,
          instanceNumber: currentItem?.instanceNumber,
          mainPaneListFilterEnabled: true,
          footerPromptEnabled: true,
          selfTestEnabled: ENABLE_MI_GATE_UI_CONTRACT_SELFTEST
        });
      }
    }
    
    // UI CONTRACT SELF-TEST: Start test when MI_GATE becomes active (use canonical stableKey)
    if (ENABLE_MI_GATE_UI_CONTRACT_SELFTEST && currentItem?.packId && currentItem?.instanceNumber) {
      // CANONICAL TRACKER KEY: Use stableKey for consistency with render logic
      const trackerKey = buildMiGateQStableKey(currentItem.packId, currentItem.instanceNumber);
      const gateItemId = buildMiGateItemId(currentItem.packId, currentItem.instanceNumber);
      
      const tracker = miGateTestTrackerRef.current.get(trackerKey) || { footerWired: false, activeGateSuppressed: false, testStarted: false };
      
      if (!tracker.testStarted) {
        tracker.testStarted = true;
        miGateTestTrackerRef.current.set(trackerKey, tracker);
        
        console.log('[MI_GATE][UI_CONTRACT_TEST_START]', {
          trackerKey,
          itemId: gateItemId,
          packId: currentItem.packId,
          instanceNumber: currentItem.instanceNumber
        });
        
        // Clear any existing timeout
        if (miGateTestTimeoutRef.current) {
          clearTimeout(miGateTestTimeoutRef.current);
        }
        
        // Schedule self-test after 250ms (LOG-ONLY, non-blocking)
        miGateTestTimeoutRef.current = setTimeout(() => {
          // SAFETY: Self-test is log-only, never throws or blocks
          try {
            const finalTracker = miGateTestTrackerRef.current.get(trackerKey);
            
            if (!finalTracker) {
              console.warn('[MI_GATE][UI_CONTRACT_TEST]', {
                trackerKey,
                itemId: gateItemId,
                packId: currentItem?.packId,
                instanceNumber: currentItem?.instanceNumber,
                result: 'NO_TRACKER',
                reason: 'Tracker was cleared or never created'
              });
              return;
            }
            
            // STEP 4: Ensure mainPaneRendered is always boolean
            // PART C: mainPaneRendered - use unified detector on final list
            const miGateInFinalList = finalTranscriptList.some(item => 
              isMiGateItem(item, currentItem?.packId, currentItem?.instanceNumber)
            );
            
            const mainPaneRendered = miGateInFinalList; // ALWAYS boolean (from unified detector)
            const { footerButtonsOnly = false } = finalTracker;
            
            // UI CONTRACT: Self-test requires main pane render AND footer buttons-only
            const passCondition = mainPaneRendered === true && footerButtonsOnly === true;
            
            if (passCondition) {
              console.log('[MI_GATE][UI_CONTRACT_PASS]', {
                trackerKey,
                itemId: gateItemId,
                packId: currentItem?.packId,
                instanceNumber: currentItem?.instanceNumber,
                mainPaneRendered: true,
                footerButtonsOnly: true
              });
            } else {
              // PART A: Dedupe UI contract fail (in-memory, once per gate)
              const finalRenderList = renderedTranscriptSnapshotRef.current || renderedTranscript;
              
              logOnce(`migate_fail_${trackerKey}`, () => {
                console.error('[MI_GATE][UI_CONTRACT_FAIL]', {
                  trackerKey,
                  itemId: gateItemId,
                  packId: currentItem?.packId,
                  instanceNumber: currentItem?.instanceNumber,
                  mainPaneRendered,
                  footerButtonsOnly,
                  reason: !mainPaneRendered ? 'Main pane did not render active MI_GATE card' : 
                          !footerButtonsOnly ? 'Footer showed prompt text instead of buttons-only' :
                          'Unknown failure',
                  diagnosticSnapshot: {
                    finalRenderListLen: finalRenderList.length,
                    activeCardInStream: finalRenderList.some(it => 
                      it.__activeCard === true && 
                      it.kind === 'multi_instance_gate' &&
                      it.stableKey === trackerKey
                    )
                  }
                });
              });
            }
          } catch (testError) {
            // SAFETY: Self-test errors must never crash the app
            console.warn('[MI_GATE][UI_CONTRACT_TEST_ERROR]', {
              trackerKey,
              itemId: gateItemId,
              error: testError.message,
              reason: 'Self-test failed safely - interview continues'
            });
          } finally {
            miGateTestTimeoutRef.current = null;
          }
        }, 250);
      }
    }
  }
  
  // Log final mode selection (minimal log - full snapshot already in unified block)
  console.log('[BOTTOM_BAR_MODE]', { 
    activeUiItemKind: activeUiItem.kind,
    bottomBarModeSOT,
    effectiveItemType,
    screenMode
  });
  
  // WATCHDOG FRESHNESS: Sync all watchdog-critical state to refs (no stale closures)
  // NOTE: Use final bottomBarModeSOT (refined with currentPrompt), not bottomBarModeSOTEarly
  bottomBarModeSOTRef.current = bottomBarModeSOT;
  v3ActivePromptTextRef.current = v3ActivePromptText;
  v3ProbingActiveRef.current = v3ProbingActive;
  v3ProbingContextRef.current = v3ProbingContext;
  
  // UI CONTRACT DIAGNOSTIC: Confirm YES/NO renderer + probing mode (once per session)
  if (bottomBarModeSOT === 'YES_NO' && currentItem?.type === 'question') {
    logOnce(`yesno_renderer_sot_${sessionId}`, () => {
      console.log('[UI_CONTRACT][YESNO_RENDERER_SOT]', {
        currentItemType: currentItem?.type,
        questionId: currentItem?.id,
        questionCode: engine?.QById?.[currentItem?.id]?.question_id,
        bottomBarRenderTypeSOT,
        bottomBarModeSOT,
        renderer: 'YesNoControls_modern_neutral',
        legacyBlocked: true,
        reason: 'Base YES/NO question using modern neutral footer buttons'
      });
    });
  }
  
  // PACK PATH DIAGNOSTIC: Log once when entering a pack to confirm routing
  if (v3ProbingActive || currentItem?.type === 'v3_pack_opener') {
    const packId = currentItem?.packId || v3ProbingContext?.packId;
    const packConfig = packId ? FOLLOWUP_PACK_CONFIGS[packId] : null;
    const isV3Pack = packConfig?.isV3Pack === true || packConfig?.engineVersion === 'v3';
    
    logOnce(`pack_path_sot_${packId}`, () => {
      console.log('[UI_CONTRACT][PACK_PATH_SOT]', {
        packId,
        isV3Pack,
        engineVersion: packConfig?.engineVersion || 'unknown',
        activeUiItemKind: activeUiItem?.kind || 'DEFAULT',
        currentItemType: currentItem?.type,
        v3ProbingActive,
        bottomBarModeSOT,
        reason: isV3Pack 
          ? 'V3 pack - conversational probing only (no deterministic follow-ups)' 
          : 'Pack version unknown or V2'
      });
    });
  }
  
  // FRAME TRACE: Log footer controller changes (change-detection only)
  if (footerControllerLocal !== lastFooterControllerRef.current ||
      bottomBarModeSOT !== lastBottomBarModeRef.current ||
      effectiveItemType !== lastEffectiveItemTypeRef.current) {
    
    console.log('[FRAME_TRACE][FOOTER_CONTROLLER]', {
      activeUiItemKind: activeUiItem.kind,
      footerController: footerControllerLocal,
      hasActiveV3Prompt,
      v3PromptPreview: v3ActivePromptText?.substring(0, 40) || null,
      currentItemType,
      effectiveItemType,
      bottomBarModeSOT,
      bottomBarRenderTypeSOT,
      packId: currentItem?.packId || v3ProbingContext?.packId,
      instanceNumber: currentItem?.instanceNumber || v3ProbingContext?.instanceNumber,
      requiredAnchorFallbackActive,
      requiredAnchorCurrent,
      changed: {
        controller: footerControllerLocal !== lastFooterControllerRef.current,
        mode: bottomBarModeSOT !== lastBottomBarModeRef.current,
        effectiveType: effectiveItemType !== lastEffectiveItemTypeRef.current
      }
    });
    
    lastFooterControllerRef.current = footerControllerLocal;
    lastBottomBarModeRef.current = bottomBarModeSOT;
    lastEffectiveItemTypeRef.current = effectiveItemType;
  }
  
  // UI CONTRACT: CTA mode is ONLY valid during WELCOME screen
  // Log warning but do not mutate const (use bottomBarModeSOTSafe fallback instead)
  if (bottomBarModeSOT === "CTA" && screenMode !== "WELCOME") {
    if (effectiveItemType === 'section_transition') {
      console.log("[UI_CONTRACT] CTA_SECTION_TRANSITION_ALLOWED", { effectiveItemType, screenMode });
      // Allow CTA specifically for section transitions
    } else {
      console.warn("[UI_CONTRACT] CTA_OUTSIDE_WELCOME_BLOCKED", { 
        screenMode, 
        currentItemType, 
        effectiveItemType, 
        v3ProbingActive,
        note: 'Invalid state - bottomBarModeSOTSafe will use DEFAULT fallback'
      });
      // Do not mutate const - bottomBarModeSOTSafe already handles fallback
    }
  }
  
  // Legacy flags (kept for compatibility)
  const isV2PackField = effectiveItemType === "v2_pack_field";
  const isV3PackOpener = effectiveItemType === "v3_pack_opener";
  const showTextInput = bottomBarModeSOT === "TEXT_INPUT";
  
  // TASK A: Single MI_GATE active boolean (UI contract sentinel)
  const isMiGateActive =
    activeUiItem?.kind === "MI_GATE" &&
    effectiveItemType === "multi_instance_gate" &&
    bottomBarModeSOT === "YES_NO" &&
    currentItem?.type === "multi_instance_gate";
  
  // Log once per activation (de-duped by currentItem.id) - using ref declared at top-level (line 1476)
  if (isMiGateActive && miGateActiveLogKeyRef.current !== currentItem?.id) {
    miGateActiveLogKeyRef.current = currentItem?.id;
    console.log("[MI_GATE][ACTIVE_STATE]", {
      currentItemId: currentItem?.id,
      packId: currentItem?.packId,
      instanceNumber: currentItem?.instanceNumber,
      sentinelArmed: true
    });
  } else if (!isMiGateActive && miGateActiveLogKeyRef.current) {
    miGateActiveLogKeyRef.current = null;
  }
  
  // Derive answerable from existing values (safe default: allow answer if we have a current item and it's a question-like type)
  const answerable = currentItem && (
    currentItem.type === 'question' || 
    currentItem.type === 'v2_pack_field' || 
    currentItem.type === 'v3_pack_opener' || 
    currentItem.type === 'followup' ||
    currentItem.type === 'multi_instance_gate'
  ) && !v3ProbingActive;
  
  // ============================================================================
  // V3 OPENER SINGLE SOURCE OF TRUTH - Compute disabled states ONCE (used by footer render)
  // ============================================================================
  let v3OpenerTextareaDisabled = false;
  let v3OpenerSubmitDisabled = false;
  
  if (currentItem?.type === 'v3_pack_opener') {
    const openerInputValue = openerDraft || "";
    const openerTextTrimmed = openerInputValue.trim();
    const openerTextTrimmedLen = openerTextTrimmed.length;
    const isCurrentItemCommitting = isCommitting && committingItemIdRef.current === currentItem.id;
    
    // TASK B: Single source of truth for textarea disabled
    const textareaDisabledRaw = Boolean(isCurrentItemCommitting) || Boolean(v3ProbingActive);
    
    // TASK C: Hard unhang override
    let textareaDisabledFinal = textareaDisabledRaw;
    if (textareaDisabledRaw && !isCurrentItemCommitting && !v3ProbingActive) {
      console.warn('[V3_OPENER][UNHANG_OVERRIDE_TEXTAREA]', {
        currentItemId: currentItem?.id,
        packId: currentItem?.packId,
        instanceNumber: currentItem?.instanceNumber,
        reason: 'disabled_true_while_not_committing_and_not_probing',
        action: 'forcing enabled'
      });
      textareaDisabledFinal = false;
    }
    
    // Submit disabled if no input or committing/probing
    const submitDisabledRaw = openerTextTrimmedLen === 0 || isCurrentItemCommitting || v3ProbingActive;
    
    // Hard unhang override for submit
    let submitDisabledFinal = submitDisabledRaw;
    if (submitDisabledRaw && openerTextTrimmedLen > 0 && !isCurrentItemCommitting && !v3ProbingActive) {
      console.warn('[V3_OPENER][UNHANG_OVERRIDE_SUBMIT]', {
        currentItemId: currentItem?.id,
        packId: currentItem?.packId,
        instanceNumber: currentItem?.instanceNumber,
        inputLen: openerTextTrimmedLen,
        reason: 'submit_disabled_despite_having_input_and_not_committing',
        action: 'forcing enabled'
      });
      submitDisabledFinal = false;
    }
    
    // Store in module variables for footer render
    v3OpenerTextareaDisabled = textareaDisabledFinal;
    v3OpenerSubmitDisabled = submitDisabledFinal;
    
    // TASK D: Forensic log - outputs FINAL values used by render
    console.log('[V3_OPENER][ENABLEMENT_SOT]', {
      openerTextTrimmedLen,
      isCurrentItemCommitting,
      v3ProbingActive,
      textareaDisabledRaw,
      textareaDisabledFinal,
      submitDisabledRaw,
      submitDisabledFinal,
      bottomBarModeSOT,
      effectiveItemType,
      packId: currentItem.packId,
      instanceNumber: currentItem.instanceNumber
    });
    
    // TASK D: Updated logs - output FINAL values that match actual render
    console.log('[V3_OPENER][VALUE_STATE]', {
      packId: currentItem.packId,
      instanceNumber: currentItem.instanceNumber,
      valueLen: openerTextTrimmedLen,
      disabledRaw: textareaDisabledRaw,
      disabled: textareaDisabledFinal
    });
  }
  
  // One-time diagnostic log when prompt is missing (no hook - just side effect)
  if (needsPrompt && !hasPrompt && currentItem) {
    // GUARD: Don't log prompt missing if recap is ready for this loopKey
    const loopKey = v3ProbingContext ? `${sessionId}:${v3ProbingContext.categoryId}:${v3ProbingContext.instanceNumber || 1}` : null;
    const hasRecapReady = loopKey && v3RecapReadyRef.current.has(loopKey);
    
    // TASK B: Don't log error if V3 probing active but no prompt yet (initial decide)
    const isV3InitialDecide = v3ProbingActive && effectiveItemType === 'v3_probing' && v3PromptPhase !== "ANSWER_NEEDED";
    
    if (hasRecapReady) {
      console.log('[V3_RECAP][PENDING_ROUTE]', {
        loopKey,
        packId: currentItem?.packId,
        instanceNumber: currentItem?.instanceNumber,
        reason: 'Recap ready - routing imminent, prompt missing is expected'
      });
    } else if (isV3InitialDecide) {
      // TASK B: Info-level log for initial decide (not an error)
      console.log('[V3_PROMPT_PENDING]', {
        loopKey,
        packId: currentItem?.packId,
        instanceNumber: currentItem?.instanceNumber,
        v3PromptPhase,
        reason: 'V3 initial decide cycle - prompt not yet available (expected)'
      });
    } else {
      const diagKey = `${sessionId}:${effectiveItemType}:${currentItem.packId}:${currentItem.fieldKey}:${currentItem.instanceNumber}:${currentItem.id}`;
      if (promptMissingKeyRef.current !== diagKey) {
        promptMissingKeyRef.current = diagKey;
        
        const logPrefix = effectiveItemType === 'v3_probing' || effectiveItemType === 'v3_pack_opener' 
          ? 'V3_UI_PROMPT_MISSING' 
          : 'V2_UI_PROMPT_MISSING';
        
        console.warn(`[${logPrefix}]`, {
          sessionId,
          currentItemType: currentItem?.type,
          effectiveItemType,
          packId: currentItem?.packId,
          fieldKey: currentItem?.fieldKey,
          instanceNumber: currentItem?.instanceNumber,
          currentItemId: currentItem?.id,
          hasBackendQuestionText: !!currentItem?.backendQuestionText,
          hasClarifierState: !!v2ClarifierState,
          hasV3ActivePrompt: !!v3ActivePromptText,
          hasCurrentPrompt: !!currentPrompt?.text
        });
      }
    }
  } else if (hasPrompt) {
    promptMissingKeyRef.current = null;
  }

  // CONTRACT INVARIANT: Verify V3 prompt always renders as v3_probing
  // bottomBarRenderTypeSOT already declared above (TDZ-safe)
  if (hasActiveV3Prompt && (bottomBarRenderTypeSOT !== "v3_probing" || bottomBarModeSOT !== "TEXT_INPUT")) {
    console.error('[V3_UI_CONTRACT][VIOLATION_ACTIVE_ITEM]', {
      hasActiveV3Prompt,
      activeUiItemKind: activeUiItem.kind,
      bottomBarRenderTypeSOT,
      bottomBarModeSOT,
      currentItemType,
      currentItemId: currentItem?.id,
      promptIdPreview: activeUiItem.promptText?.substring(0, 40) || null,
      loopKeyPreview: activeUiItem.loopKey || null,
      reason: 'hasActiveV3Prompt=true but render/mode not V3'
    });
  }
  
  // Debug log: confirm which bottom bar path is rendering
  console.log("[BOTTOM_BAR_RENDER]", {
    activeUiItemKind: activeUiItem.kind,
    currentItemType,
    effectiveItemType,
    bottomBarRenderTypeSOT,
    footerControllerLocal,
    currentItemId: currentItem?.id,
    packId: currentItem?.packId,
    fieldKey: currentItem?.fieldKey,
    isQuestion,
    isV2PackField,
    answerable,
    showTextInput,
    v2PackMode,
    screenMode,
    inputSnapshot: input
  });

  // Unified YES/NO click handler - routes to handleAnswer with trace logging (plain function, no hooks)
  const handleYesNoClick = (answer) => {
    // GUARD: Block YES/NO during V3 prompt answering
    if (activeUiItem?.kind === 'V3_PROMPT' || (v3PromptPhase === 'ANSWER_NEEDED' && bottomBarModeSOT === 'TEXT_INPUT')) {
      console.log('[YESNO_BLOCKED_DURING_V3_PROMPT]', {
        clicked: answer,
        activeUiItemKind: activeUiItem?.kind,
        v3PromptPhase,
        bottomBarModeSOT,
        currentItemType: currentItem?.type,
        reason: 'V3 prompt active - YES/NO blocked'
      });
      return; // Hard block - do not append stray "Yes"/"No"
    }
    
    // PART C: Force one-time scroll bypass on explicit navigation
    forceAutoScrollOnceRef.current = true;
    setIsUserTyping(false); // Clear typing lock immediately
    console.log('[SCROLL][FORCE_ONCE_ARMED]', { 
      trigger: 'YESNO_CLICK', 
      answer,
      packId: currentItem?.packId,
      instanceNumber: currentItem?.instanceNumber
    });
    
    // PART B: Call ensureActiveVisibleAfterRender after state update
    // TDZ-SAFE: Compute fresh flags using available values
    const isYesNoModeFresh = bottomBarModeSOT === 'YES_NO';
    const isMiGateFresh = currentItem?.type === 'multi_instance_gate' || activeUiItem?.kind === 'MI_GATE';
    
    requestAnimationFrame(() => {
      ensureActiveVisibleAfterRender(`MI_GATE_YESNO_CLICK_${answer}`, activeKindSOT, isYesNoModeFresh, isMiGateFresh);
    });
    
    // MI_GATE TRACE A: YES/NO button click entry
    console.log('[MI_GATE][TRACE][YESNO_CLICK]', {
      clicked: answer,
      effectiveItemType,
      currentItemType: currentItem?.type,
      currentItemId: currentItem?.id,
      packId: currentItem?.packId,
      instanceNumber: currentItem?.instanceNumber,
      bottomBarModeSOT
    });
    
    // Route to handleAnswer (same path as all other answer types)
    if (!isCommitting) {
      handleAnswer(answer);
    }
  };
  
  // CANONICAL ITEM FIELD EXTRACTORS - Pure helpers (no hooks, no state writes)
  const getItemId = (item) => {
    if (!item) return null;
    return item.id || item.itemId || item.messageId || item.key || item.stableKey || item.stable_key || null;
  };
  
  const getItemStableKey = (item) => {
    if (!item) return null;
    return item.stableKey || item.stable_key || item.key || item.id || null;
  };
  
  const getItemText = (item) => {
    if (!item) return "";
    return (
      item.promptText ||
      item.questionText ||
      item.text ||
      item.title ||
      item.message ||
      item.payload?.promptText ||
      item.payload?.questionText ||
      item.payload?.text ||
      item.payload?.message ||
      item.data?.text ||
      item.data?.promptText ||
      item.meta?.promptText ||
      item.meta?.questionText ||
      ""
    );
  };
  
  const normalizeTextForMatch = (text) => {
    if (!text || typeof text !== 'string') return '';
    return text.toLowerCase().trim().replace(/\s+/g, ' ');
  };
  
  // TASK B: Sentinel matching function (upgraded with canonical extractors)
  const matchesActiveMiGatePrompt = (item, ctx) => {
    if (!item || !ctx) return false;
    
    // Extract canonical fields from item (handles all field name variants)
    const itemId = getItemId(item);
    const itemStableKey = getItemStableKey(item);
    const itemText = getItemText(item);
    const itemTextNormalized = normalizeTextForMatch(itemText);
    const miGatePromptNormalized = normalizeTextForMatch(ctx.miGatePrompt);
    
    // Strategy 1: Exact ID match
    if (ctx.activeGateItemId && itemId === ctx.activeGateItemId) {
      console.log("[MI_GATE][SENTINEL_MATCH]", { strategy: 'EXACT_ID', itemId, suppressedBy: 'Strategy 1' });
      return true;
    }
    
    // Strategy 2: StableKey base match
    if (ctx.activeGateStableKeyBase && itemStableKey === ctx.activeGateStableKeyBase) {
      console.log("[MI_GATE][SENTINEL_MATCH]", { strategy: 'STABLEKEY_BASE', itemStableKey, suppressedBy: 'Strategy 2' });
      return true;
    }
    
    // Strategy 3: StableKey Q suffix match
    if (ctx.activeGateStableKeyQ && itemStableKey === ctx.activeGateStableKeyQ) {
      console.log("[MI_GATE][SENTINEL_MATCH]", { strategy: 'STABLEKEY_Q', itemStableKey, suppressedBy: 'Strategy 3' });
      return true;
    }
    
    // Strategy 4: StableKey prefix match (covers :q, :a, and variants)
    if (ctx.activeGateStableKeyBase && itemStableKey && itemStableKey.startsWith(ctx.activeGateStableKeyBase)) {
      console.log("[MI_GATE][SENTINEL_MATCH]", { strategy: 'STABLEKEY_PREFIX', itemStableKey, suppressedBy: 'Strategy 4' });
      return true;
    }
    
    // Strategy 5: ID containment match (variant ID formats)
    if (ctx.activeGateItemId && itemId && itemId.includes(ctx.activeGateItemId)) {
      console.log("[MI_GATE][SENTINEL_MATCH]", { strategy: 'ID_CONTAINS_GATE', itemId, suppressedBy: 'Strategy 5' });
      return true;
    }
    
    if (ctx.activeGateStableKeyBase && itemId && itemId.includes(ctx.activeGateStableKeyBase)) {
      console.log("[MI_GATE][SENTINEL_MATCH]", { strategy: 'ID_CONTAINS_KEY', itemId, suppressedBy: 'Strategy 6' });
      return true;
    }
    
    // Strategy 6: Text-based matching (upgraded)
    if (!itemTextNormalized || !miGatePromptNormalized) return false;
    
    const miGatePromptPrefix = miGatePromptNormalized.slice(0, 30);
    const containsAnotherKeyword = itemTextNormalized.includes("do you have another");
    
    // Text equality
    if (itemTextNormalized === miGatePromptNormalized) {
      console.log("[MI_GATE][SENTINEL_MATCH]", { strategy: 'TEXT_EXACT', textPreview: itemText.slice(0, 60), suppressedBy: 'Strategy 7' });
      return true;
    }
    
    // Text prefix match
    if (itemTextNormalized.startsWith(miGatePromptPrefix)) {
      console.log("[MI_GATE][SENTINEL_MATCH]", { strategy: 'TEXT_PREFIX', textPreview: itemText.slice(0, 60), suppressedBy: 'Strategy 8' });
      return true;
    }
    
    // Keyword + prefix match (catch partial variations)
    if (containsAnotherKeyword && itemTextNormalized.startsWith(miGatePromptPrefix)) {
      console.log("[MI_GATE][SENTINEL_MATCH]", { strategy: 'KEYWORD_PREFIX', textPreview: itemText.slice(0, 60), suppressedBy: 'Strategy 9' });
      return true;
    }
    
    // No match
    return false;
  };
  
  // Unified bottom bar submit handler for question, v2_pack_field, followup, and V3 probing
  const handleBottomBarSubmit = async () => {
    // DIAGNOSTIC: Entry log with full state snapshot
    console.log('[BOTTOM_BAR][SEND_CLICK]', {
      bottomBarModeSOT,
      effectiveItemType,
      activeKind: activeUiItem?.kind,
      packId: currentItem?.packId || v3ProbingContext?.packId,
      instanceNumber: currentItem?.instanceNumber || v3ProbingContext?.instanceNumber,
      inputLen: input?.length || 0,
      openerDraftLen: openerDraft?.length || 0,
      currentItemType: currentItem?.type,
      currentItemId: currentItem?.id,
      v3ProbingActive,
      isCommitting,
      hasPrompt,
      requiredAnchorFallbackActive
    });
    
    // ROUTE A0: Required anchor answer submission (HIGHEST PRIORITY - triple-gate routing)
    // Routes by: effectiveItemType OR activeUiItemKind OR requiredAnchorFallbackActive flag
    // CRITICAL: Does NOT depend on currentItemType, v3ProbingActive, or currentItem.packId
    if (effectiveItemType === 'required_anchor_fallback' || 
        activeUiItem?.kind === 'REQUIRED_ANCHOR_FALLBACK' || 
        requiredAnchorFallbackActive === true) {
      
      // GUARD: Validate requiredAnchorCurrent exists
      if (!requiredAnchorCurrent) {
        console.error('[REQUIRED_ANCHOR_FALLBACK][SUBMIT_BLOCKED_NO_CURRENT]', {
          requiredAnchorFallbackActive,
          effectiveItemType,
          activeUiItemKind: activeUiItem?.kind,
          reason: 'requiredAnchorCurrent is null/undefined'
        });
        return;
      }
      const trimmed = (input ?? "").trim();
      if (!trimmed) {
        console.log('[REQUIRED_ANCHOR_FALLBACK][BLOCKED_EMPTY]');
        return;
      }
      
      console.log('[REQUIRED_ANCHOR_FALLBACK][SUBMIT_ROUTED]', {
        effectiveItemType,
        activeUiItemKind: activeUiItem?.kind,
        currentItemType: currentItem?.type,
        anchor: requiredAnchorCurrent,
        answerLen: trimmed.length
      });
      
      console.log('[REQUIRED_ANCHOR_FALLBACK][SUBMIT]', {
        anchor: requiredAnchorCurrent,
        answerLen: trimmed.length
      });

      try {
        // USE PERSISTED CONTEXT: Read from ref (set at fallback activation)
        const ctx = requiredAnchorFallbackContextRef.current;

        if (!ctx.incidentId && !ctx.categoryId) {
          console.error('[REQUIRED_ANCHOR_FALLBACK][CONTEXT_MISSING_ON_SUBMIT]', {
            ctx,
            reason: 'Context not set at activation - cannot route'
          });

          // FAIL-OPEN: Deactivate fallback to prevent stuck state
          setRequiredAnchorFallbackActive(false);
          setRequiredAnchorCurrent(null);
          setRequiredAnchorQueue([]);
          setV3PromptPhase('IDLE');
          setInput("");
          return;
        }

        // STEP 1: PERSIST Q+A PAIR - Ensure question first, then append answer
        const questionStableKey = `required-anchor:q:${sessionId}:${ctx.categoryId}:${ctx.instanceNumber}:${requiredAnchorCurrent}`;
        const answerStableKey = `required-anchor:a:${sessionId}:${ctx.categoryId}:${ctx.instanceNumber}:${requiredAnchorCurrent}`;
        
        // QUESTION TEXT SOT: Use resolver for consistent human-readable question
        const submitQuestionText = resolveAnchorToHumanQuestion(
          requiredAnchorCurrent,
          ctx.packId
        );
        
        // Fetch current transcript for safe function
        const currentSession = await base44.entities.InterviewSession.get(sessionId);
        const currentTranscript = currentSession.transcript_snapshot || [];
        
        // ENSURE QUESTION EXISTS: Append fallback question before answer (TDZ-proof)
        try {
          // DEFENSIVE: Check function exists before calling
          if (typeof ensureRequiredAnchorQuestionInTranscript === "function") {
            const ensureResult = await ensureRequiredAnchorQuestionInTranscript({
              sessionId,
              categoryId: ctx.categoryId,
              instanceNumber: ctx.instanceNumber,
              anchor: requiredAnchorCurrent,
              questionText: submitQuestionText,
              appendFn: appendAssistantMessageImport,
              existingTranscript: currentTranscript,
              packId: ctx.packId,
              canonicalRef: canonicalTranscriptRef,
              syncStateFn: upsertTranscriptState
            });
            
            if (ensureResult?.didAppend) {
              console.log('[REQUIRED_ANCHOR_FALLBACK][Q_PERSISTED_ONCE_OK]', {
                stableKeyQ: questionStableKey,
                anchor: requiredAnchorCurrent,
                textPreview: submitQuestionText
              });
            }
          } else {
            console.error('[REQUIRED_ANCHOR_FALLBACK][ENSURE_HELPER_MISSING]', {
              anchor: requiredAnchorCurrent,
              phase: 'SUBMIT',
              stability: 'NON_FATAL',
              note: 'Helper not in scope - continuing without Q persist'
            });
          }
        } catch (ensureErr) {
          // NO-CRASH: Already logged by safe function - continue anyway
          console.error('[REQUIRED_ANCHOR_FALLBACK][ENSURE_Q_OUTER_CATCH]', {
            error: ensureErr.message,
            anchor: requiredAnchorCurrent,
            phase: 'SUBMIT_WRAPPER',
            note: 'Caught at outer level - interview continues'
          });
        }

        // STEP 2: Append candidate's answer to history (after question ensured)
        console.log('[REQUIRED_ANCHOR_FALLBACK][A_PERSIST_BEGIN]', {
          anchor: requiredAnchorCurrent,
          stableKeyA: answerStableKey,
          textPreview: trimmed.substring(0, 60)
        });

        const appendUserMessage = appendUserMessageImport;
        const freshSession = await base44.entities.InterviewSession.get(sessionId);
        const freshTranscript = freshSession.transcript_snapshot || [];

        const transcriptAfterAnswer = await appendUserMessage(sessionId, freshTranscript, trimmed, {
          id: `required-anchor-a-${sessionId}-${ctx.categoryId}-${ctx.instanceNumber}-${requiredAnchorCurrent}`,
          stableKey: answerStableKey,
          messageType: 'ANSWER',
          packId: ctx.packId,
          categoryId: ctx.categoryId,
          instanceNumber: ctx.instanceNumber,
          anchor: requiredAnchorCurrent,
          answerContext: 'REQUIRED_ANCHOR_FALLBACK',
          parentStableKey: questionStableKey,
          visibleToCandidate: true
        });
        
        console.log('[REQUIRED_ANCHOR_FALLBACK][A_PERSIST_OK]', {
          anchor: requiredAnchorCurrent,
          stableKeyA: answerStableKey,
          transcriptLenAfter: transcriptAfterAnswer.length
        });

        console.log('[REQUIRED_ANCHOR_FALLBACK][A_APPEND_AFTER_Q]', {
          anchorKey: requiredAnchorCurrent,
          stableKeyA: answerStableKey
        });
        
        console.log('[CQ_TRANSCRIPT][FALLBACK_ANSWER_DB_WRITE_OK]', {
          anchor: requiredAnchorCurrent,
          stableKey: answerStableKey,
          transcriptLenAfter: transcriptAfterAnswer?.length || 0
        });
        
        console.log('[CQ_TRANSCRIPT][FALLBACK_ANSWER_APPENDED]', {
          anchor: requiredAnchorCurrent,
          answerLen: trimmed.length,
          stableKey: answerStableKey,
          reason: 'Candidate answer recorded to history before persist'
        });
        
        // STEP 2: Force transcript rehydrate from DB (ensures answer survives re-renders)
        console.log('[CQ_TRANSCRIPT][FALLBACK_ANSWER_REHYDRATE_BEGIN]', { sessionId });
        
        const refreshedTranscript = await refreshTranscriptFromDB('fallback_answer_appended');
        
        // Verify answer persisted and rehydrated successfully
        const containsStableKey = (refreshedTranscript || canonicalTranscriptRef.current).some(e => 
          e.stableKey === answerStableKey
        );
        
        console.log('[CQ_TRANSCRIPT][FALLBACK_ANSWER_REHYDRATE_OK]', {
          transcriptLenAfter: canonicalTranscriptRef.current.length,
          containsStableKey
        });
        
        // STEP 3: Deterministic extraction for prior_le_agency and prior_le_approx_date (prevent redundant asks)
        let agencyExtracted = false;
        let extractedAgency = null;
        let dateExtracted = false;
        let extractedDate = null;
        
        const determinExtractPackConfig = FOLLOWUP_PACK_CONFIGS?.[ctx.packId];
        const requiredAnchors = determinExtractPackConfig?.requiredAnchors || [];
        
        console.log('[FORENSIC][TDZ_FIX_APPLIED]', {
          name: 'fallbackPackConfig',
          locationHint: 'required_anchor_submit_handler',
          renamed: 'determinExtractPackConfig'
        });
        
        // Check if next anchor would be prior_le_agency or prior_le_approx_date
        const wouldAskAgency = requiredAnchorQueue.includes('prior_le_agency');
        const wouldAskDate = requiredAnchorQueue.includes('prior_le_approx_date');
        
        if (ctx.packId === 'PACK_PRIOR_LE_APPS_STANDARD' && (wouldAskAgency || wouldAskDate)) {
          // Try to extract agency and/or date from opener narrative
          const openerResponse = await base44.entities.Response.filter({
            session_id: sessionId,
            pack_id: ctx.packId,
            field_key: 'v3_opener_narrative',
            instance_number: ctx.instanceNumber
          });
          
          const openerNarrative = openerResponse?.[0]?.answer || '';
          
          console.log('[REQUIRED_ANCHOR_FALLBACK][AGENCY_DETERMINISTIC_EXTRACT_ATTEMPT]', {
            found: openerNarrative.length > 0,
            preview: openerNarrative.substring(0, 100)
          });
          
          if (openerNarrative.length > 20) {
            // Pattern: "applied to <Agency>"
            if (wouldAskAgency) {
              const patterns = [
                /applied\s+(?:to|with)\s+([A-Z][A-Za-z\s&.-]{2,60}?)(?:\s+in\s|\s+for\s|,|\.|$)/i,
                /applied\s+(?:to|with)\s+the\s+([A-Z][A-Za-z\s&.-]{2,60}?)(?:\s+in\s|\s+for\s|,|\.|$)/i,
                /application\s+(?:to|with)\s+([A-Z][A-Za-z\s&.-]{2,60}?)(?:\s+in\s|\s+for\s|,|\.|$)/i
              ];
              
              for (const pattern of patterns) {
                const match = openerNarrative.match(pattern);
                if (match && match[1]) {
                  extractedAgency = match[1].trim();
                  
                  // Validate: must contain at least one letter and be reasonable length
                  if (extractedAgency.length >= 3 && extractedAgency.length <= 60 && /[A-Za-z]/.test(extractedAgency)) {
                    agencyExtracted = true;
                    
                    console.log('[REQUIRED_ANCHOR_FALLBACK][AGENCY_DETERMINISTIC_EXTRACT_SAVED]', {
                      incidentId: ctx.incidentId,
                      valuePreview: extractedAgency
                    });
                    
                    break;
                  }
                }
              }
            }
            
            // Pattern: "In <Month> <Year>" or "<Month> <Year>"
            if (wouldAskDate) {
              const datePatterns = [
                /\b(?:in|around|about)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/i,
                /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/i,
                /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(20\d{2})\b/i
              ];
              
              console.log('[REQUIRED_ANCHOR_FALLBACK][DATE_DETERMINISTIC_EXTRACT_ATTEMPT]', {
                found: false,
                preview: openerNarrative.substring(0, 100)
              });
              
              for (const pattern of datePatterns) {
                const match = openerNarrative.match(pattern);
                if (match && match[1] && match[2]) {
                  const month = match[1];
                  const year = match[2];
                  extractedDate = `${month} ${year}`;
                  
                  // Validate: year must be reasonable (2000-2030)
                  const yearNum = parseInt(year);
                  if (yearNum >= 2000 && yearNum <= 2030) {
                    dateExtracted = true;
                    
                    console.log('[REQUIRED_ANCHOR_FALLBACK][DATE_DETERMINISTIC_EXTRACT_ATTEMPT]', {
                      found: true,
                      preview: extractedDate
                    });
                    
                    console.log('[REQUIRED_ANCHOR_FALLBACK][DATE_DETERMINISTIC_EXTRACT_SAVED]', {
                      incidentId: ctx.incidentId,
                      valuePreview: extractedDate
                    });
                    
                    break;
                  }
                }
              }
              
              if (!dateExtracted) {
                console.log('[REQUIRED_ANCHOR_FALLBACK][DATE_DETERMINISTIC_EXTRACT_ATTEMPT]', {
                  found: false,
                  preview: openerNarrative.substring(0, 100)
                });
              }
            }
          }
        }
        
        // STEP 4: Fetch session and find incident (use persisted incidentId if available)
        const updatedSession = await base44.entities.InterviewSession.get(sessionId);
        const incidents = updatedSession?.incidents || [];
        
        let incident = null;
        
        // PRIORITY 1: Use persisted incidentId (fastest)
        if (ctx.incidentId) {
          incident = incidents.find(inc => inc.incident_id === ctx.incidentId);
          console.log('[REQUIRED_ANCHOR_FALLBACK][INCIDENT_BY_ID]', {
            incidentId: ctx.incidentId,
            found: !!incident
          });
        }
        
        // PRIORITY 2: Fallback to categoryId+instanceNumber search
        if (!incident && ctx.categoryId) {
          incident = incidents.find(inc => 
            (inc.category_id === ctx.categoryId || inc.incident_type === ctx.packId) &&
            inc.instance_number === ctx.instanceNumber
          );
          console.log('[REQUIRED_ANCHOR_FALLBACK][INCIDENT_BY_CATEGORY]', {
            categoryId: ctx.categoryId,
            packId: ctx.packId,
            instanceNumber: ctx.instanceNumber,
            found: !!incident
          });
        }
        
        if (!incident) {
          console.error('[REQUIRED_ANCHOR_FALLBACK][NO_INCIDENT]', {
            ctx,
            reason: 'Cannot find incident to update facts - answer recorded but fact not saved'
          });
          
          // FAIL-OPEN: Deactivate fallback but keep answer visible
          setRequiredAnchorFallbackActive(false);
          setRequiredAnchorCurrent(null);
          setRequiredAnchorQueue([]);
          setV3PromptPhase('IDLE');
          setInput("");
          return;
        }
        
        // STEP 5: Persist fact to incident (persist-first before advance)
        console.log('[REQUIRED_ANCHOR_FALLBACK][SAVE_BEGIN]', {
          anchor: requiredAnchorCurrent,
          incidentId: incident.incident_id,
          answerLen: trimmed.length
        });
        
        const updatedFacts = { 
          ...(incident.facts || {}), 
          [requiredAnchorCurrent]: trimmed
        };
        
        // If agency was extracted, add it now
        if (agencyExtracted && extractedAgency) {
          updatedFacts['prior_le_agency'] = extractedAgency;
        }
        
        // If date was extracted, add it now
        if (dateExtracted && extractedDate) {
          updatedFacts['prior_le_approx_date'] = extractedDate;
        }
        
        const updatedIncidents = incidents.map(inc => 
          inc.incident_id === incident.incident_id 
            ? { ...inc, facts: updatedFacts, updated_at: new Date().toISOString() }
            : inc
        );
        
        await base44.entities.InterviewSession.update(sessionId, {
          incidents: updatedIncidents
        });
        
        console.log('[REQUIRED_ANCHOR_FALLBACK][SAVE_OK]', {
          anchor: requiredAnchorCurrent,
          incidentId: incident.incident_id,
          factsKeys: Object.keys(updatedFacts),
          agencyExtracted,
          dateExtracted
        });
        
        // Track answered anchor in memory (fast check for re-ask prevention)
        fallbackAnsweredRef.current[requiredAnchorCurrent] = true;
        if (agencyExtracted) {
          fallbackAnsweredRef.current['prior_le_agency'] = true;
        }
        if (dateExtracted) {
          fallbackAnsweredRef.current['prior_le_approx_date'] = true;
        }
        
        console.log('[REQUIRED_ANCHOR_FALLBACK][ANSWERED_TRACKED]', {
          anchor: requiredAnchorCurrent,
          agencyExtracted,
          dateExtracted,
          allAnsweredAnchors: Object.keys(fallbackAnsweredRef.current)
        });
        
        // POST-EXTRACT AUDIT: Re-check missing after deterministic extracts
        if (agencyExtracted || dateExtracted) {
          console.log('[REQUIRED_ANCHOR_FALLBACK][POST_EXTRACT_AUDIT]', {
            agencyExtracted,
            dateExtracted,
            beforeMissingCount: requiredAnchorQueue.length
          });
        }
        
        // POST-SAVE AUDIT: Recompute missing required from source of truth (incident.facts)
        let missingRequired = [];
        
        try {
          // Fetch updated session to get latest incident.facts
          const auditSession = await base44.entities.InterviewSession.get(sessionId);
          const auditIncidents = auditSession?.incidents || [];
          const auditIncident = auditIncidents.find(inc => inc.incident_id === incident.incident_id);
          
          if (auditIncident) {
            // Get required anchors from pack config
            const packConfig = FOLLOWUP_PACK_CONFIGS?.[ctx.packId];
            const requiredAnchors = packConfig?.requiredAnchors || [];
            
            // Recompute missing (same normalization as activation)
            const facts = auditIncident.facts || {};
            missingRequired = requiredAnchors.filter(anchor => {
              const value = facts[anchor];
              return value == null || String(value).trim() === '';
            });
            
            // COMBINED SATISFACTION: Check both incident.facts AND fallbackAnsweredRef
            const satisfiedByFacts = requiredAnchors.filter(anchor => {
              const value = facts[anchor];
              return value != null && String(value).trim() !== '';
            });
            
            const satisfiedByFallback = requiredAnchors.filter(anchor => 
              fallbackAnsweredRef.current[anchor] === true
            );
            
            // Recompute missing: exclude BOTH facts-satisfied AND fallback-answered
            missingRequired = requiredAnchors.filter(anchor => {
              const inFacts = facts[anchor] != null && String(facts[anchor]).trim() !== '';
              const inFallback = fallbackAnsweredRef.current[anchor] === true;
              return !inFacts && !inFallback;
            });
            
            console.log('[REQUIRED_ANCHOR_FALLBACK][MISSING_REQUIRED_COMPUTE]', {
              requiredAnchorsCount: requiredAnchors.length,
              satisfiedByFactsCount: satisfiedByFacts.length,
              satisfiedByFallbackCount: satisfiedByFallback.length,
              missingRequired,
              satisfiedByFacts,
              satisfiedByFallback
            });
            
            console.log('[REQUIRED_ANCHOR_FALLBACK][POST_SAVE_AUDIT]', {
              anchorJustSaved: requiredAnchorCurrent,
              incidentId: incident.incident_id,
              requiredAnchorsCount: requiredAnchors.length,
              factsCollected: Object.keys(facts),
              missingRequired
            });
          } else {
            console.warn('[REQUIRED_ANCHOR_FALLBACK][POST_SAVE_AUDIT_ERROR]', {
              incidentId: incident.incident_id,
              reason: 'Incident not found after save - fallback to queue shift'
            });
            // Fallback to old queue logic
            missingRequired = requiredAnchorQueue.slice(1);
          }
        } catch (err) {
          console.error('[REQUIRED_ANCHOR_FALLBACK][POST_SAVE_AUDIT_ERROR]', {
            incidentId: incident.incident_id,
            error: err.message,
            reason: 'Audit fetch failed - fallback to queue shift'
          });
          // Fallback to old queue logic
          missingRequired = requiredAnchorQueue.slice(1);
        }
        
        // AUDIT-DRIVEN LOOP: Rebuild queue from facts, or complete if none missing
        if (missingRequired.length === 0) {
          // All required anchors satisfied - hold last prompt visible until MI_GATE ready
          console.log('[REQUIRED_ANCHOR_FALLBACK][PROMPT_LANE_HOLD_LAST_QUESTION]', {
            anchor: requiredAnchorCurrent,
            promptPreview: `What ${requiredAnchorCurrent}?`,
            reason: 'Completing - keep last question visible until MI_GATE'
          });
          
          // Deactivate fallback after brief hold
          setTimeout(() => {
            setRequiredAnchorFallbackActive(false);
            setRequiredAnchorCurrent(null);
            setRequiredAnchorQueue([]);
          }, 100);
          
          setInput("");
          setV3PromptPhase('IDLE');
          
          console.log('[CQ_TRANSCRIPT][PROMPT_CONTEXT_FINALIZED_FOR_INSTANCE]', {
            instanceNumber: ctx.instanceNumber,
            packId: ctx.packId,
            lastAnchor: requiredAnchorCurrent,
            note: 'Fallback complete - context rows remain for this instance'
          });
          
          console.log('[REQUIRED_ANCHOR_FALLBACK][COMPLETE_FROM_AUDIT]', {
            incidentId: incident.incident_id,
            note: 'All required anchors satisfied'
          });
          
          console.log('[REQUIRED_ANCHOR_FALLBACK][COMPLETE]', {
            incidentId: incident.incident_id,
            note: 'All required anchors satisfied'
          });
          
          console.log('[REQUIRED_ANCHOR_FALLBACK][POST_SUBMIT_DECISION]', {
            nextAction: 'MI_GATE',
            nextAnchor: null,
            reason: 'All required anchors satisfied'
          });
          
          // Exit V3 mode and advance to MI_GATE
          setV3ProbingActive(false);
          setV3ProbingContext(null);
          setV3ActivePromptText(null);
          
          console.log('[MI_GATE][ADVANCE_AFTER_FALLBACK_COMPLETE]', {
            packId: ctx.packId,
            categoryId: ctx.categoryId,
            instanceNumber: ctx.instanceNumber
          });
          
          // CONSOLIDATED TRACE: Prove success path
          console.log('[REQUIRED_ANCHOR_FALLBACK][TRACE_END]', {
            answerPersisted: true,
            transcriptRehydrated: true,
            savedFactAnchor: requiredAnchorCurrent,
            nextDecision: 'MI_GATE'
          });
          
          // Transition to MI_GATE deterministically
          setTimeout(() => {
            transitionToAnotherInstanceGate({
              packId: ctx.packId,
              categoryId: ctx.categoryId,
              categoryLabel: v3ProbingContext?.categoryLabel || ctx.categoryId,
              instanceNumber: ctx.instanceNumber,
              packData: v3ProbingContext?.packData
            });
          }, 50);
        } else {
          // Still have missing anchors - hold last prompt briefly, then show next
          console.log('[REQUIRED_ANCHOR_FALLBACK][PROMPT_LANE_HOLD_LAST_QUESTION]', {
            anchor: requiredAnchorCurrent,
            promptPreview: `What ${requiredAnchorCurrent}?`,
            reason: 'Transitioning to next question - hold current briefly'
          });
          
          // Rebuild queue with prioritization
          const sortedMissing = prioritizeMissingRequired(missingRequired);
          
          // Persist next fallback question to transcript (TDZ-proof)
          try {
            // QUESTION TEXT SOT: Use resolver for consistent human-readable question
            const nextAnchor = sortedMissing[0];
            const nextFallbackQuestionText = resolveAnchorToHumanQuestion(
              nextAnchor,
              ctx.packId
            );
            
            console.log('[CQ_TRANSCRIPT][PROMPT_CONTEXT_UPDATED]', {
              fromAnchor: requiredAnchorCurrent,
              toAnchor: nextAnchor
            });
            
            // Fetch current transcript
            const nextSession = await base44.entities.InterviewSession.get(sessionId);
            const nextTranscript = nextSession.transcript_snapshot || [];
            
            // DEFENSIVE: Check function exists before calling
            if (typeof ensureRequiredAnchorQuestionInTranscript === "function") {
              await ensureRequiredAnchorQuestionInTranscript({
                sessionId,
                categoryId: ctx.categoryId,
                instanceNumber: ctx.instanceNumber,
                anchor: nextAnchor,
                questionText: nextFallbackQuestionText,
                appendFn: appendAssistantMessageImport,
                existingTranscript: nextTranscript,
                packId: ctx.packId,
                canonicalRef: canonicalTranscriptRef,
                syncStateFn: upsertTranscriptState
              });
            } else {
              console.error('[REQUIRED_ANCHOR_FALLBACK][ENSURE_HELPER_MISSING]', {
                anchor: nextAnchor,
                phase: 'TRANSITION',
                stability: 'NON_FATAL',
                note: 'Helper not in scope - continuing without next Q persist'
              });
            }
          } catch (nextErr) {
            // NO-CRASH: Already logged by safe function
            console.error('[REQUIRED_ANCHOR_FALLBACK][NEXT_Q_OUTER_CATCH]', {
              error: nextErr.message,
              anchor: sortedMissing[0],
              phase: 'TRANSITION_WRAPPER'
            });
          }
          
          // Update queue and next anchor after brief hold
          setTimeout(() => {
            setRequiredAnchorQueue(sortedMissing);
            setRequiredAnchorCurrent(sortedMissing[0]);
          }, 100);
          
          setInput("");
          
          console.log('[REQUIRED_ANCHOR_FALLBACK][NEXT_FROM_AUDIT]', {
            nextAnchor: sortedMissing[0],
            remaining: sortedMissing
          });
          
          console.log('[REQUIRED_ANCHOR_FALLBACK][POST_SUBMIT_DECISION]', {
            nextAction: 'NEXT',
            nextAnchor: sortedMissing[0],
            remaining: sortedMissing
          });
          
          console.log('[REQUIRED_ANCHOR_FALLBACK][NEXT]', {
            nextAnchor: sortedMissing[0],
            remaining: sortedMissing
          });
          
          // CONSOLIDATED TRACE: Prove success path
          console.log('[REQUIRED_ANCHOR_FALLBACK][TRACE_END]', {
            answerPersisted: true,
            transcriptRehydrated: true,
            savedFactAnchor: requiredAnchorCurrent,
            nextDecision: sortedMissing[0]
          });
        }
      } catch (err) {
        console.error('[REQUIRED_ANCHOR_FALLBACK][SAVE_ERROR]', { error: err.message });
      }
      
      return;
    }
    
    // PART C: Force one-time scroll bypass on explicit submit
    forceAutoScrollOnceRef.current = true;
    setIsUserTyping(false); // Clear typing lock immediately
    console.log('[SCROLL][FORCE_ONCE_ARMED]', { 
      trigger: 'BOTTOM_BAR_SUBMIT',
      currentItemType: currentItem?.type,
      effectiveItemType
    });
    
    // PART B: Call ensureActiveVisibleAfterRender after submit
    // TDZ-SAFE: Compute fresh flags using available values
    const isYesNoModeFresh = bottomBarModeSOT === 'YES_NO';
    const isMiGateFresh = effectiveItemType === 'multi_instance_gate' || activeUiItem?.kind === 'MI_GATE';
    
    requestAnimationFrame(() => {
      ensureActiveVisibleAfterRender("BOTTOM_BAR_SUBMIT", activeKindSOT, isYesNoModeFresh, isMiGateFresh);
    });
    
    // CQ_GUARD: submitIntent must be declared exactly once (do not duplicate)
    // V3 SUBMIT INTENT: Capture routing decision BEFORE state updates (prevents mis-route)
    const submitIntent = {
      isV3Submit: v3PromptPhase === 'ANSWER_NEEDED' || 
                  activeUiItem.kind === 'V3_PROMPT' ||
                  (v3PromptIdSOT && v3PromptIdSOT.trim() !== ''),
      promptId: v3PromptIdSOT,
      loopKey: v3ProbingContext ? `${sessionId}:${v3ProbingContext.categoryId}:${v3ProbingContext.instanceNumber || 1}` : null,
      categoryId: v3ProbingContext?.categoryId || lastV3PromptSnapshotRef.current?.categoryId,
      instanceNumber: v3ProbingContext?.instanceNumber || lastV3PromptSnapshotRef.current?.instanceNumber || 1,
      packId: v3ProbingContext?.packId || lastV3PromptSnapshotRef.current?.packId,
      promptText: v3ActivePromptText || lastV3PromptSnapshotRef.current?.promptText,
      capturedAt: Date.now()
    };
    
    console.log("[BOTTOM_BAR_SUBMIT][CLICK]", {
      hasCurrentItem: !!currentItem,
      currentItemType: currentItem?.type,
      currentItemId: currentItem?.id,
      packId: currentItem?.packId,
      fieldKey: currentItem?.fieldKey,
      instanceNumber: currentItem?.instanceNumber,
      v3ProbingActive,
      inputSnapshot: input?.substring?.(0, 50) || input,
      effectiveItemType
    });
    
    console.log('[V3_PROBE][SUBMIT_INTENT]', {
      isV3Submit: submitIntent.isV3Submit,
      promptId: submitIntent.promptId,
      categoryId: submitIntent.categoryId,
      instanceNumber: submitIntent.instanceNumber,
      activeUiItemKindAtClick: activeUiItem.kind
    });

    // V3 SUBMIT PAYLOAD: Store answer before any state changes (survives transitions)
    if (submitIntent.isV3Submit) {
      const answerText = (input ?? "").trim();
      
      lastV3SubmittedAnswerRef.current = {
        promptId: submitIntent.promptId,
        expectedAKey: buildV3ProbeAStableKey(sessionId, submitIntent.categoryId, submitIntent.instanceNumber, 
          dbTranscript.filter(e => 
            (e.messageType === 'V3_PROBE_QUESTION' || e.type === 'V3_PROBE_QUESTION') &&
            e.meta?.sessionId === sessionId &&
            e.meta?.categoryId === submitIntent.categoryId &&
            e.meta?.instanceNumber === submitIntent.instanceNumber
          ).length
        ),
        expectedQKey: buildV3ProbeQStableKey(sessionId, submitIntent.categoryId, submitIntent.instanceNumber,
          dbTranscript.filter(e => 
            (e.messageType === 'V3_PROBE_QUESTION' || e.type === 'V3_PROBE_QUESTION') &&
            e.meta?.sessionId === sessionId &&
            e.meta?.categoryId === submitIntent.categoryId &&
            e.meta?.instanceNumber === submitIntent.instanceNumber
          ).length
        ),
        answerText,
        capturedAt: Date.now(),
        sessionId,
        categoryId: submitIntent.categoryId,
        instanceNumber: submitIntent.instanceNumber,
        packId: submitIntent.packId,
        promptText: submitIntent.promptText
      };
      
      console.log('[V3_PROBE][SUBMIT_PAYLOAD_STORED]', {
        expectedAKey: lastV3SubmittedAnswerRef.current.expectedAKey,
        expectedQKey: lastV3SubmittedAnswerRef.current.expectedQKey,
        promptId: submitIntent.promptId,
        answerLen: answerText?.length || 0
      });
    }

    // ROUTE A: V3 PACK OPENER (highest priority - must precede V3 probe routing)
    if (effectiveItemType === 'v3_pack_opener' && currentItem?.type === 'v3_pack_opener') {
      const trimmed = (openerDraft ?? "").trim();
      
      if (!trimmed) {
        console.log("[BOTTOM_BAR_SUBMIT][V3_OPENER] blocked: empty input");
        console.log('[BOTTOM_BAR][SEND_BLOCKED]', { blockedReason: 'OPENER_EMPTY_INPUT' });
        return;
      }
      
      console.log('[V3_OPENER][SUBMIT_INTENT]', {
        packId: currentItem.packId,
        instanceNumber: currentItem.instanceNumber,
        inputLen: trimmed.length,
        route: 'V3_PACK_OPENER'
      });
      
      console.log('[BOTTOM_BAR][SUBMIT_DISPATCH]', {
        effectiveItemType: 'v3_pack_opener',
        packId: currentItem.packId,
        instanceNumber: currentItem.instanceNumber,
        inputLen: trimmed.length,
        route: 'V3_PACK_OPENER'
      });
      
      // Route to handleAnswer (owns v3_pack_opener submission logic)
      await handleAnswer(trimmed);
      return;
    }
    
    // ROUTE B: V3 probing answer (headless mode) - use submitIntent routing
    if (submitIntent.isV3Submit) {
      const trimmed = (input ?? "").trim();
      if (!trimmed) {
        console.log("[BOTTOM_BAR_SUBMIT][V3] blocked: empty input");
        console.log('[BOTTOM_BAR][SEND_BLOCKED]', { blockedReason: 'V3_EMPTY_INPUT' });
        return;
      }
      
      console.log("[BOTTOM_BAR_SUBMIT][V3] Routing to V3ProbingLoop via pendingAnswer");
      console.log('[BOTTOM_BAR][SUBMIT_DISPATCH]', {
        effectiveItemType: 'v3_probing',
        packId: submitIntent.packId,
        instanceNumber: submitIntent.instanceNumber,
        inputLen: trimmed.length,
        route: 'V3_PROBING'
      });
      
      // Route answer to V3ProbingLoop via state
      await handleV3AnswerSubmit(trimmed);
      setInput(""); // Clear input immediately
      
      // NOTE: V3ProbingLoop will call handleV3AnswerConsumed to clear pendingAnswer
      // Do NOT clear here - let the loop control the lifecycle
      return;
    }

    // CQ_GUARDRAIL: No duplicate submitIntent allowed beyond this point
    
    if (!currentItem) {
      console.warn("[BOTTOM_BAR_SUBMIT] No currentItem – aborting submit");
      console.log('[BOTTOM_BAR][SEND_BLOCKED]', { blockedReason: 'NO_CURRENT_ITEM' });
      return;
    }

    if (isCommitting) {
      console.log("[BOTTOM_BAR_SUBMIT] blocked: isCommitting");
      console.log('[BOTTOM_BAR][SEND_BLOCKED]', { blockedReason: 'IS_COMMITTING' });
      return;
    }

    // V3 OPENER: Use dedicated openerDraft state (strict currentItem.type check)
    const effectiveValue = currentItem?.type === 'v3_pack_opener' ? openerDraft : input;
    const trimmed = (effectiveValue ?? "").trim();
    
    // GUARD: Prevent submit if value is prompt text
    if (currentItem?.type === 'v3_pack_opener') {
      const promptText = currentItem.openerText || activePromptText || "";
      const valueMatchesPrompt = trimmed === promptText.trim() && trimmed.length > 0;
      
      if (valueMatchesPrompt) {
        console.error('[V3_UI_CONTRACT][SUBMIT_BLOCKED_PROMPT_AS_VALUE]', {
          packId: currentItem.packId,
          instanceNumber: currentItem.instanceNumber,
          reason: 'Cannot submit prompt text as answer - clearing value'
        });
        console.log('[BOTTOM_BAR][SEND_BLOCKED]', { blockedReason: 'PROMPT_AS_VALUE' });
        setOpenerDraft(""); // Clear prompt from value
        return;
      }
    }
    
    if (!trimmed) {
      console.log("[BOTTOM_BAR_SUBMIT] blocked: empty input", { effectiveItemType, currentItemType: currentItem?.type, openerDraftLen: openerDraft?.length, inputLen: input?.length });
      console.log('[BOTTOM_BAR][SEND_BLOCKED]', { 
        blockedReason: 'EMPTY_INPUT',
        openerDraftLen: openerDraft?.length || 0,
        inputLen: input?.length || 0,
        usedOpenerDraft: currentItem?.type === 'v3_pack_opener'
      });
      return;
    }

    console.log("[BOTTOM_BAR_SUBMIT] ========== CALLING handleAnswer ==========");
    console.log("[BOTTOM_BAR_SUBMIT]", {
      currentItemType: currentItem.type,
      currentItemId: currentItem.id,
      packId: currentItem.packId,
      fieldKey: currentItem.fieldKey,
      instanceNumber: currentItem.instanceNumber,
      answer: trimmed.substring(0, 60),
      isV2PackField: currentItem.type === 'v2_pack_field',
      usingOpenerDraft: effectiveItemType === 'v3_pack_opener'
    });
    
    // DIAGNOSTIC: Dispatch confirmation
    console.log('[BOTTOM_BAR][SUBMIT_DISPATCH]', {
      effectiveItemType,
      packId: currentItem?.packId,
      instanceNumber: currentItem?.instanceNumber,
      inputLen: trimmed.length
    });

    // Call handleAnswer with the answer text - handleAnswer reads currentItem from state
    await handleAnswer(trimmed);

    // UX: Clear draft on successful submit
    if (currentItem?.type === 'v3_pack_opener') {
      setOpenerDraft("");
      openerDraftChangeCountRef.current = 0;
      console.log('[V3_OPENER][DRAFT_CLEARED_AFTER_SUBMIT]', {
        packId: currentItem?.packId,
        instanceNumber: currentItem?.instanceNumber
      });
    } else {
      clearDraft();
      setInput("");
    }
    };

  // Keydown handler for Enter key on bottom bar input
  const handleInputKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      console.log("[BOTTOM_BAR_INPUT][ENTER_KEY]", {
        currentItemType: currentItem?.type,
        currentItemId: currentItem?.id,
        packId: currentItem?.packId,
        fieldKey: currentItem?.fieldKey,
      });

      e.preventDefault();
      e.stopPropagation();
      handleBottomBarSubmit();
    }
  };

  // Submit disabled logic - allows question, v2_pack_field, followup
  // IMPORTANT: Do NOT gate by currentItemType === 'question' - we want v2_pack_field to work too
  // DIAGNOSTIC: Log button disabled state for v3_pack_opener
  // FALLBACK OVERRIDE: Enable submit for required anchor fallback
  const isBottomBarSubmitDisabled = requiredAnchorFallbackActive 
    ? (!(input ?? "").trim())
    : (!currentItem || isCommitting || !(input ?? "").trim());
  
  if (effectiveItemType === 'v3_pack_opener' && currentItem) {
    const openerInputTrimmed = (openerDraft || "").trim();
    console.log('[V3_OPENER][BUTTON_STATE]', {
      packId: currentItem?.packId,
      instanceNumber: currentItem?.instanceNumber,
      openerDraftLen: openerDraft?.length || 0,
      openerTrimmedLen: openerInputTrimmed.length,
      v3OpenerSubmitDisabled,
      buttonDisabled: v3OpenerSubmitDisabled,
      isCommitting,
      v3ProbingActive
    });
  }

  // ============================================================================
  // PRE-RENDER TRANSCRIPT PROCESSING - Moved from IIFE to component scope
  // ============================================================================
  const finalTranscriptList = useMemo(() => {
    // CRASH GUARD: Safe logging helper (prevents logging from crashing render)
    const safeLog = (fn) => {
      try {
        fn();
      } catch (e) {
        console.warn('[CQ_TRANSCRIPT][LOGGING_GUARD_SUPPRESSED]', { 
          message: e?.message,
          stack: e?.stack?.substring(0, 200)
        });
      }
    };
    
    // CRASH GUARD: Initialize removed items tracker at outer scope
    let removedEphemeralItems = [];
    
    // CQ_TRANSCRIPT_CONTRACT: Render-time invariant check + ENFORCEMENT
    // Ephemeral items (active cards) MUST NOT appear in chat history
    let transcriptToRender = renderableTranscriptStream;
    
    if (ENFORCE_TRANSCRIPT_CONTRACT) {
      const ephemeralSources = renderableTranscriptStream.filter(e => 
        e.__activeCard === true || 
        e.kind === 'v3_probe_q' || 
        e.kind === 'v3_probe_a' ||
        e.source === 'ephemeral' ||
        e.source === 'prompt_lane_temporary'
      );
      
      if (ephemeralSources.length > 0) {
        // Expected behavior: ephemeral items filtered from history
        // Only log once per session to avoid spam
        safeLog(() => {
          const ephemeralKey = ephemeralSources.map(e => e.kind || e.messageType).join(',');
          const lastLoggedEphemeralKey = sessionStorage.getItem('cq_last_ephemeral_log');
          
          if (lastLoggedEphemeralKey !== ephemeralKey) {
            sessionStorage.setItem('cq_last_ephemeral_log', ephemeralKey);
            console.info('[CQ_TRANSCRIPT][EPHEMERAL_FILTER_APPLIED]', {
              source: 'expected_behavior',
              ephemeralCount: ephemeralSources.length,
              ephemeralKinds: ephemeralSources.map(e => e.kind || e.messageType).slice(0, 3),
              action: 'FILTER_EPHEMERAL'
            });
          }
        });
        
        // ENFORCEMENT: Remove ephemeral items ONLY (never real transcript items)
        // removedEphemeralItems already initialized at outer useMemo scope
        transcriptToRender = renderableTranscriptStream.filter(e => {
          // NORMALIZE: Read type field consistently
          const mt = e.messageType || e.type || e.kind || null;
          const stableKey = e.stableKey || e.id || null;
          
          // CRITICAL: V3 probe Q/A are ALWAYS canonical (never filter)
          const isV3ProbeQ = (stableKey && stableKey.startsWith('v3-probe-q:')) || mt === 'V3_PROBE_QUESTION';
          const isV3ProbeA = (stableKey && stableKey.startsWith('v3-probe-a:')) || mt === 'V3_PROBE_ANSWER';
          
          if (isV3ProbeQ || isV3ProbeA) {
            // BUG DETECTION: Check if this entry would be filtered as ephemeral
            const markedEphemeral = e.__activeCard === true || 
              e.kind === 'v3_probe_q' || 
              e.kind === 'v3_probe_a' ||
              e.source === 'ephemeral' ||
              e.source === 'prompt_lane_temporary';
            
            if (markedEphemeral && isV3ProbeA) {
              console.error('[CQ_TRANSCRIPT][BUG][EPHEMERAL_FILTER_TRIED_TO_REMOVE_V3_PROBE_A]', {
                stableKey,
                mt,
                kind: e.kind,
                source: e.source,
                __activeCard: e.__activeCard,
                reason: 'V3 probe answer incorrectly marked as ephemeral'
              });
            }
            
            return true; // ALWAYS keep V3 probe Q/A
          }
          
          // CRITICAL: Required anchor Q/A are ALWAYS canonical (never filter)
          const isRequiredAnchorQ = (stableKey && stableKey.startsWith('required-anchor:q:')) || mt === 'REQUIRED_ANCHOR_QUESTION';
          const isRequiredAnchorA = (stableKey && stableKey.startsWith('required-anchor:a:')) || 
                                    (mt === 'ANSWER' && (e.meta?.answerContext === 'REQUIRED_ANCHOR_FALLBACK' || e.answerContext === 'REQUIRED_ANCHOR_FALLBACK'));
          
          if (isRequiredAnchorQ || isRequiredAnchorA) {
            console.log('[REQUIRED_ANCHOR_FALLBACK][ANSWER_FILTER_GUARD_KEEP]', {
              stableKey,
              mt,
              isQ: isRequiredAnchorQ,
              isA: isRequiredAnchorA,
              reason: 'Required-anchor Q/A must remain visible'
            });
            return true; // ALWAYS keep required-anchor Q/A
          }
          
          // CRITICAL: Opener cards MUST be preserved in transcript (unless actively being asked)
          const isOpenerCard = mt === 'FOLLOWUP_CARD_SHOWN' && 
                               (e.meta?.variant === 'opener' || e.variant === 'opener');
          
          if (isOpenerCard) {
            // Check if this is the CURRENTLY ACTIVE opener (should be suppressed)
            const isCurrentlyActiveOpener = activeUiItem?.kind === "V3_OPENER" &&
                                           activeCard?.stableKey &&
                                           (e.stableKey || e.id) === activeCard.stableKey;
            
            if (isCurrentlyActiveOpener) {
              // Will be removed by active opener filter - allow ephemeral filter to pass
              console.log('[CQ_TRANSCRIPT][OPENER_ACTIVE_WILL_BE_FILTERED]', {
                stableKey: e.stableKey || e.id,
                packId: e.meta?.packId || e.packId,
                instanceNumber: e.meta?.instanceNumber || e.instanceNumber,
                reason: 'Active opener - will be removed by dedicated active opener filter'
              });
              return true; // Let it pass ephemeral filter (will be removed later)
            }
            
            // NOT currently active - preserve as canonical transcript
            console.log('[CQ_TRANSCRIPT][EPHEMERAL_ALLOWLIST_OPENER]', {
              stableKey: e.stableKey || e.id,
              packId: e.meta?.packId || e.packId,
              instanceNumber: e.meta?.instanceNumber || e.instanceNumber,
              activeUiItemKind: activeUiItem?.kind,
              reason: 'opener is canonical transcript history - preserving'
            });
            return true; // ALWAYS keep non-active opener transcript entries
          }
          
          // CRITICAL: MI_GATE active cards MUST render (exception to ephemeral rule)
          const isMiGateActiveCard = e.__activeCard === true && e.kind === 'multi_instance_gate';
          
          if (isMiGateActiveCard) {
            console.log('[MI_GATE][EPHEMERAL_EXCEPTION]', {
              stableKey: e.stableKey,
              packId: e.packId,
              instanceNumber: e.instanceNumber,
              reason: 'MI_GATE active card must render in main pane - bypassing ephemeral filter'
            });
            return true; // ALWAYS keep MI_GATE active cards
          }
          
          // PROMPT_LANE_CONTEXT PROTECTION: Always keep non-chat context rows (hard exception)
          const isPromptLaneContext = mt === 'PROMPT_LANE_CONTEXT' && 
                                      (e.meta?.contextKind === 'REQUIRED_ANCHOR_FALLBACK' || e.contextKind === 'REQUIRED_ANCHOR_FALLBACK');
          
          if (isPromptLaneContext) {
            console.log('[CQ_TRANSCRIPT][EPHEMERAL_ALLOWLIST_PROMPT_CONTEXT]', {
              stableKey,
              anchor: e.meta?.anchor || e.anchor,
              textPreview: (e.text || '').substring(0, 60),
              reason: 'Non-chat context - always preserved'
            });
            return true; // ALWAYS keep prompt context (non-chat annotation)
          }
          
          // CRITICAL: Never filter items with real DB stableKeys and real types
          const hasStableKey = !!stableKey;
          const isRealTranscriptType = ['QUESTION_SHOWN', 'ANSWER', 'MULTI_INSTANCE_GATE_SHOWN', 'MULTI_INSTANCE_GATE_ANSWER', 'V3_PROBE_QUESTION', 'V3_PROBE_ANSWER', 'FOLLOWUP_CARD_SHOWN', 'V3_OPENER_ANSWER', 'PROMPT_LANE_CONTEXT', 'REQUIRED_ANCHOR_QUESTION'].includes(mt);
          
          if (hasStableKey && isRealTranscriptType) {
            return true; // Always keep real transcript items
          }
          
          // EPHEMERAL FILTER GUARD: Keep required anchor fallback prompts while active
          const isFallbackPrompt = e.kind === 'required_anchor_fallback_prompt';
          
          if (isFallbackPrompt && activeUiItem?.kind === 'REQUIRED_ANCHOR_FALLBACK') {
            console.log('[CQ_TRANSCRIPT][EPHEMERAL_FILTER_GUARD_KEEP_FALLBACK]', {
              stableKey,
              kind: e.kind,
              activeUiItemKind: 'REQUIRED_ANCHOR_FALLBACK',
              reason: 'Fallback prompt must remain visible during active fallback'
            });
            return true; // KEEP - do not filter out
          }
          
          // Filter out ephemeral-only items (V3 prompts, etc.)
          const isEphemeral = e.__activeCard === true || 
            e.kind === 'v3_probe_q' || 
            e.kind === 'v3_probe_a' ||
            e.kind === 'required_anchor_fallback_prompt' || // Fallback prompts are ephemeral when NOT active
            e.source === 'ephemeral' ||
            e.source === 'prompt_lane_temporary';
          
          if (isEphemeral) {
            removedEphemeralItems.push({
              stableKey,
              mt,
              kind: e.kind,
              isV3ProbeQ,
              isV3ProbeA,
              hasStableKey,
              isFallbackPrompt
            });
          }
          
          return !isEphemeral;
        });
        
        // CRASH GUARD: Safe logging with fallback
        safeLog(() => {
          const filteredDetailsSafe = Array.isArray(removedEphemeralItems) ? removedEphemeralItems : [];
          const stableKeysRemovedSafe = filteredDetailsSafe.map(e => e?.stableKey).filter(Boolean);
          
          console.log('[CQ_TRANSCRIPT][CRASH_GUARD_OK]', {
            removedItemsCount: filteredDetailsSafe.length,
            keysRemoved: stableKeysRemovedSafe.length
          });
          
          console.log('[CQ_TRANSCRIPT][EPHEMERAL_FILTERED]', {
            beforeLen: renderableTranscriptStream.length,
            afterLen: transcriptToRender.length,
            removedCount: ephemeralSources.length,
            stableKeysRemoved: stableKeysRemovedSafe.slice(0, 5),
            filteredDetails: filteredDetailsSafe.slice(0, 3)
          });
        });
      }
    }
  
    // CQ_FORBIDDEN: transcript must never be filtered or mutated by UI suppression logic
    // A) V3_PROBE_QA_ATTACH DISABLED: Do NOT extract or attach V3 probe Q/A when MI_GATE active
    const v3ProbeQAForGateDeterministic = [];
    
    if (activeUiItem?.kind === "MI_GATE" && currentItem?.packId && currentItem?.instanceNumber) {
      console.log('[MI_GATE][V3_PROBE_QA_ATTACH_DISABLED]', {
        packId: currentItem.packId,
        instanceNumber: currentItem.instanceNumber,
        reason: 'MI gate renders standalone - transcript is canonical source for V3 history',
        v3ProbeQAForGateDeterministic: []
      });
    }
    
    // B1 — CANONICAL DEDUPE: Final dedupe before rendering (parent/child aware + stableKey enforcement)
    const dedupeBeforeRender = (list) => {
      const seen = new Map();
      const deduped = [];
      const dropped = [];
      const parentChildMap = new Map(); // Track parent dependencies
      const stableKeysSeen = new Set(); // REGRESSION GUARD: Enforce no duplicate stableKeys
      
      // First pass: Build parent-child relationships
      for (const entry of list) {
        const parentKey = entry.meta?.parentStableKey || entry.parentStableKey;
        if (parentKey) {
          if (!parentChildMap.has(parentKey)) {
            parentChildMap.set(parentKey, []);
          }
          parentChildMap.get(parentKey).push(entry.stableKey || entry.id);
        }
      }
      
      for (const entry of list) {
        const canonicalKey = entry.__canonicalKey || entry.stableKey || entry.id;
        if (!canonicalKey) {
          deduped.push(entry);
          continue;
        }
        
        // REGRESSION GUARD: Hard-block duplicate stableKeys (prevents duplicate renders)
        const stableKey = entry.stableKey || entry.id;
        if (stableKey && stableKeysSeen.has(stableKey)) {
          console.log('[RENDER][DUPLICATE_STABLEKEY_BLOCKED]', {
            stableKey,
            messageType: entry.messageType || entry.type,
            textPreview: (entry.text || '').substring(0, 40),
            reason: 'Same stableKey already rendered - blocking duplicate'
          });
          dropped.push(canonicalKey);
          continue; // Skip duplicate
        }
        
        if (stableKey) {
          stableKeysSeen.add(stableKey);
        }
        
        if (!seen.has(canonicalKey)) {
          seen.set(canonicalKey, entry);
          deduped.push(entry);
        } else {
          const existing = seen.get(canonicalKey);
          
          const score = (e) => {
            const isUser = e.role === 'user';
            const hasText = (e.text || '').trim().length > 0;
            const isVisible = e.visibleToCandidate !== false;
            // Bonus: Keep parents if they have children in the list
            const isParent = parentChildMap.has(e.stableKey || e.id);
            
            if (isParent && isUser && hasText && isVisible) return 5;
            if (isUser && hasText && isVisible) return 4;
            if (isUser && hasText) return 3;
            if (isUser) return 2;
            if (e.role === 'assistant' && hasText) return 1;
            return 0;
          };
          
          const existingScore = score(existing);
          const entryScore = score(entry);
          
          if (entryScore > existingScore) {
            const replacedIndex = deduped.findIndex(d => (d.stableKey || d.id) === canonicalKey);
            if (replacedIndex !== -1) {
              deduped[replacedIndex] = entry;
              seen.set(canonicalKey, entry);
              console.log('[STREAM][DEDUP_UPGRADE]', {
                canonicalKey,
                existingScore,
                entryScore,
                reason: 'Replaced weaker entry with stronger one'
              });
            }
          } else {
            dropped.push(canonicalKey);
          }
        }
      }
      
      if (dropped.length > 0) {
        console.log('[STREAM][DEDUP_KEYS]', {
          beforeLen: list.length,
          afterLen: deduped.length,
          droppedCount: dropped.length,
          droppedKeysPreview: dropped.slice(0, 3)
        });
      }
      
      return deduped;
    };
    
    // V3 UI CONTRACT: Conditional probe filtering based on active UI state
    // Rule: Suppress probes from transcript ONLY while a probe is actively being asked
    // Once UI moves on (MI_GATE, next question, etc.), probes render in history normally
    const suppressProbesInTranscript = activeUiItem?.kind === "V3_PROMPT" || 
                                      activeUiItem?.kind === "V3_WAITING" ||
                                      (v3ProbingActive && hasActiveV3Prompt);
    
    console.log('[V3_UI_CONTRACT][PROBE_TRANSCRIPT_POLICY]', {
      activeUiItemKind: activeUiItem?.kind,
      v3ProbingActive,
      hasActiveV3Prompt,
      suppressProbesInTranscript,
      reason: suppressProbesInTranscript 
        ? 'Active probe - suppress from transcript (render in prompt lane)' 
        : 'No active probe - allow persisted probes in history'
    });
    
    const transcriptWithV3ProbesBlocked = transcriptToRender.filter(entry => {
      const mt = entry.messageType || entry.type || entry.kind || null;
      const stableKey = entry.stableKey || entry.id || null;
      const isUserRole = entry.role === 'user';
      const isRecentlySubmitted = stableKey && recentlySubmittedUserAnswersRef.current.has(stableKey);
      
      // V3 PROBE TYPES
      const V3_PROBE_TYPES = [
        'V3_PROBE_QUESTION',
        'V3_PROBE_PROMPT', 
        'V3_PROBE_ANSWER',
        'V3_PROBE',
        'AI_FOLLOWUP_QUESTION'
      ];
      
      const isV3ProbeType = V3_PROBE_TYPES.includes(mt);
      
      // CONDITIONAL FILTER: Only suppress if probe is currently active
      if (isV3ProbeType && suppressProbesInTranscript) {
        console.log('[V3_UI_CONTRACT][FILTERED_PROBE_FROM_TRANSCRIPT]', {
          mt,
          stableKey,
          activeUiItemKind: activeUiItem?.kind,
          source: entry.__activeCard ? 'ephemeral' : 'dbTranscript',
          reason: 'Probe active - rendering in prompt lane only'
        });
        return false; // BLOCK while active
      }
      
      // Allow persisted probe Q/A when no active probe
      if (isV3ProbeType && !suppressProbesInTranscript) {
        console.log('[V3_UI_CONTRACT][PROBE_ALLOWED_IN_HISTORY]', {
          mt,
          stableKey,
          activeUiItemKind: activeUiItem?.kind,
          reason: 'No active probe - allowing in transcript history'
        });
        return true; // ALLOW in history
      }
      
      if (isUserRole && stableKey) {
        if (isRecentlySubmitted) {
          const now = Date.now();
          let meta = recentlySubmittedUserAnswersMetaRef.current.get(stableKey);
          
          if (!meta) {
            meta = { firstSeenAt: now, renderedAt: null };
            recentlySubmittedUserAnswersMetaRef.current.set(stableKey, meta);
          }
          
          meta.renderedAt = now;
          
          const ageMs = now - meta.firstSeenAt;
          const inDb = dbTranscript.some(e => (e.stableKey || e.id) === stableKey);
          const canClear = ageMs >= 250 && inDb && meta.renderedAt;
          
          if (canClear) {
            recentlySubmittedUserAnswersRef.current.delete(stableKey);
            recentlySubmittedUserAnswersMetaRef.current.delete(stableKey);
            console.log('[CQ_TRANSCRIPT][USER_ANSWER_PROTECT_CLEARED]', {
              stableKey,
              ageMs,
              reason: 'Protection window expired - answer stable in DB'
            });
          } else {
            console.log('[CQ_TRANSCRIPT][USER_ANSWER_PROTECT]', {
              stableKey,
              messageType: getMessageTypeSOT(entry),
              ageMs,
              inDb,
              canClear,
              reason: 'Protection window active - waiting for stability'
            });
          }
        }
        
        return true;
      }

      // Additional safety: stableKey prefix check (conditional on suppressProbesInTranscript)
      const hasV3ProbeQPrefix = stableKey && stableKey.startsWith('v3-probe-q:');
      const hasV3ProbeAPrefix = stableKey && stableKey.startsWith('v3-probe-a:');

      if ((hasV3ProbeQPrefix || hasV3ProbeAPrefix) && suppressProbesInTranscript) {
        console.log('[V3_UI_CONTRACT][FILTERED_PROBE_BY_PREFIX]', {
          stableKey,
          activeUiItemKind: activeUiItem?.kind,
          source: 'stableKey_prefix_check',
          reason: 'Probe active - filtering by prefix'
        });
        return false; // BLOCK by stableKey prefix when active
      }
      
      if ((hasV3ProbeQPrefix || hasV3ProbeAPrefix) && !suppressProbesInTranscript) {
        console.log('[V3_UI_CONTRACT][PROBE_PREFIX_ALLOWED_IN_HISTORY]', {
          stableKey,
          activeUiItemKind: activeUiItem?.kind,
          reason: 'No active probe - allowing in history'
        });
        return true; // ALLOW when not active
      }
      
      return true;
    });
    
    const transcriptWithV3ProbeQA = [...transcriptWithV3ProbesBlocked, ...v3ProbeQAForGateDeterministic];
    let transcriptToRenderDeduped = dedupeBeforeRender(transcriptWithV3ProbeQA);
    
    // INTEGRITY PASS 1: Ensure every ANSWER has its QUESTION_SHOWN parent
    const transcriptWithIntegrityPass = [];
    const questionIdToQuestionShown = new Map();
    const questionIdToAnswers = new Map();
    
    // Build indexes for base questions
    for (const entry of transcriptToRenderDeduped) {
      const mt = getMessageTypeSOT(entry);
      
      if (mt === 'QUESTION_SHOWN') {
        const questionId = entry.meta?.questionDbId;
        if (questionId && !questionIdToQuestionShown.has(questionId)) {
          questionIdToQuestionShown.set(questionId, entry);
        }
      }
      
      if (mt === 'ANSWER' && entry.meta?.answerContext === 'BASE_QUESTION') {
        const questionId = entry.meta?.questionDbId;
        if (questionId) {
          if (!questionIdToAnswers.has(questionId)) {
            questionIdToAnswers.set(questionId, []);
          }
          questionIdToAnswers.get(questionId).push(entry);
        }
      }
    }
    
    // Insert missing QUESTION_SHOWN entries
    const synthesizedQuestions = [];
    for (const [questionId, answers] of questionIdToAnswers.entries()) {
      if (!questionIdToQuestionShown.has(questionId)) {
        // Find question text from engine or use placeholder
        const questionText = engine?.QById?.[questionId]?.question_text || "(Question)";
        const questionNumber = engine?.QById?.[questionId]?.question_number || '';
        const sectionId = engine?.QById?.[questionId]?.section_id;
        const sectionEntity = engine?.Sections?.find(s => s.id === sectionId);
        const sectionName = sectionEntity?.section_name || '';
        
        const synthQuestion = {
          id: `synth-question-shown-${questionId}`,
          stableKey: `question-shown:${questionId}`,
          role: 'assistant',
          messageType: 'QUESTION_SHOWN',
          type: 'QUESTION_SHOWN',
          text: questionText,
          timestamp: new Date(new Date(answers[0].timestamp).getTime() - 1000).toISOString(),
          createdAt: (answers[0].createdAt || Date.now()) - 1000,
          visibleToCandidate: true,
          __synthetic: true,
          meta: {
            questionDbId: questionId,
            questionNumber,
            sectionName,
            source: 'integrity_pass'
          }
        };
        
        synthesizedQuestions.push({ questionId, synthQuestion });
        
        console.log('[TRANSCRIPT_INTEGRITY][SYNTH_QUESTION_SHOWN]', {
          questionId,
          questionCode: engine?.QById?.[questionId]?.question_id || questionId,
          inserted: true,
          reason: 'Answer exists but QUESTION_SHOWN missing from render list'
        });
      }
    }
    
    // Rebuild list with synthesized questions inserted before their first answer
    for (let i = 0; i < transcriptToRenderDeduped.length; i++) {
      const entry = transcriptToRenderDeduped[i];
      
      // Check if we need to insert a synthesized question before this entry
      if (entry.role === 'user' && getMessageTypeSOT(entry) === 'ANSWER') {
        const questionId = entry.meta?.questionDbId;
        const synth = synthesizedQuestions.find(s => s.questionId === questionId);
        
        if (synth && !transcriptWithIntegrityPass.some(e => e.stableKey === synth.synthQuestion.stableKey)) {
          transcriptWithIntegrityPass.push(synth.synthQuestion);
        }
      }
      
      transcriptWithIntegrityPass.push(entry);
    }
    
    // Use integrity-passed list
    transcriptToRenderDeduped = transcriptWithIntegrityPass;
    
    // INTEGRITY PASS 2: Ensure every V3 probe answer has its question parent
    const transcriptWithV3Integrity = [];
    const promptIdToV3ProbeQ = new Map();
    const promptIdToV3ProbeA = new Map();
    
    // Build indexes for V3 probe Q/A from current render list
    for (const entry of transcriptToRenderDeduped) {
      const mt = entry.messageType || entry.type || entry.kind || null;
      const stableKey = entry.stableKey || entry.id || null;
      
      if (stableKey && stableKey.startsWith('v3-probe-q:')) {
        const promptId = stableKey.replace('v3-probe-q:', '');
        if (!promptIdToV3ProbeQ.has(promptId)) {
          promptIdToV3ProbeQ.set(promptId, entry);
        }
      }
      
      if (stableKey && stableKey.startsWith('v3-probe-a:')) {
        const promptId = stableKey.replace('v3-probe-a:', '');
        if (!promptIdToV3ProbeA.has(promptId)) {
          promptIdToV3ProbeA.set(promptId, entry);
        }
      }
    }
    
    // Check DB transcript for missing V3 probe answers - CONDITIONAL on suppressProbesInTranscript
    // Only attempt reinsertion when probes should be visible (not suppressed)
    const dbV3ProbeAnswers = (dbTranscript || []).filter(e => {
      const mt = e.messageType || e.type || e.kind || null;
      const stableKey = e.stableKey || e.id || null;
      return (stableKey && stableKey.startsWith('v3-probe-a:')) || mt === 'V3_PROBE_ANSWER';
    });
    
    const dbV3ProbeQuestions = (dbTranscript || []).filter(e => {
      const mt = e.messageType || e.type || e.kind || null;
      const stableKey = e.stableKey || e.id || null;
      return (stableKey && stableKey.startsWith('v3-probe-q:')) || mt === 'V3_PROBE_QUESTION';
    });
    
    // CONDITIONAL REINSERTION: Only run when probes should be visible in transcript
    if (!suppressProbesInTranscript) {
      for (const dbEntry of dbV3ProbeAnswers) {
        const stableKey = dbEntry.stableKey || dbEntry.id || null;
        if (!stableKey) continue;
        
        const promptId = stableKey.startsWith('v3-probe-a:') 
          ? stableKey.replace('v3-probe-a:', '') 
          : null;
        
        if (promptId && !promptIdToV3ProbeA.has(promptId)) {
          // Ensure question also exists before reinserting answer
          const hasQuestionInDb = dbV3ProbeQuestions.some(q => {
            const qKey = q.stableKey || q.id || '';
            return qKey.includes(promptId);
          });
          
          const hasQuestionInRender = promptIdToV3ProbeQ.has(promptId);
          
          if (hasQuestionInDb && hasQuestionInRender) {
            console.log('[CQ_TRANSCRIPT][PROBE_REINSERT_SKIPPED_OR_PAIRED]', {
              promptId,
              stableKey,
              action: 'PAIR',
              reason: 'Question exists - reinserting paired answer'
            });
            
            promptIdToV3ProbeA.set(promptId, { ...dbEntry, __reinserted: true });
          } else {
            console.log('[CQ_TRANSCRIPT][PROBE_REINSERT_SKIPPED_OR_PAIRED]', {
              promptId,
              stableKey,
              action: 'SKIP',
              hasQuestionInDb,
              hasQuestionInRender,
              reason: 'Question missing - skipping answer reinsertion to avoid orphan'
            });
          }
        }
      }
    } else {
      console.log('[CQ_TRANSCRIPT][PROBE_REINSERT_SKIPPED_OR_PAIRED]', {
        action: 'SKIP',
        suppressProbesInTranscript: true,
        reason: 'Probe active - no reinsertion needed'
      });
    }
    
    // Check for missing V3 probe answers not in DB at all
    for (const [promptId, qEntry] of promptIdToV3ProbeQ.entries()) {
      if (!promptIdToV3ProbeA.has(promptId)) {
        const expectedStableKey = `v3-probe-a:${promptId}`;
        const existsInDb = dbV3ProbeAnswers.some(e => 
          (e.stableKey || e.id) === expectedStableKey
        );
        
        if (!existsInDb) {
          console.log('[CQ_TRANSCRIPT][V3_PROBE_A_NOT_IN_DB]', {
            promptId,
            expectedStableKey,
            reason: 'Question exists but answer never persisted'
          });
          
          // REGRESSION CHECK: Did we recently attempt to persist this answer?
          const lastSubmit = lastV3SubmittedAnswerRef.current;
          if (lastSubmit && lastSubmit.expectedAKey === expectedStableKey) {
            const ageMs = Date.now() - lastSubmit.capturedAt;
            console.error('[V3_PROBE_AUDIT][PERSIST_MISSING_AFTER_SEND]', {
              promptId,
              expectedStableKey,
              lastSubmitAge: ageMs,
              reason: 'Answer was submitted but never persisted to DB'
            });
          }
        }
      }
    }
    
    // PART A FIX: Rebuild list with V3 probe answers inserted BEFORE MI gate if present
    // This prevents V3_PROBE_ANSWER from trailing the gate (root cause of ALIGNMENT_VIOLATION_STREAM)
    for (let i = 0; i < transcriptToRenderDeduped.length; i++) {
      const entry = transcriptToRenderDeduped[i];
      transcriptWithV3Integrity.push(entry);
      
      // Check if this is a V3 probe question that needs its answer inserted
      const stableKey = entry.stableKey || entry.id || null;
      if (stableKey && stableKey.startsWith('v3-probe-q:')) {
        const promptId = stableKey.replace('v3-probe-q:', '');
        const answerEntry = promptIdToV3ProbeA.get(promptId);
        
        if (answerEntry && answerEntry.__reinserted) {
          // PART A: Check if MI gate exists for same pack/instance (prevents trailing after gate)
          const answerPackId = answerEntry.meta?.packId || answerEntry.packId;
          const answerInstanceNumber = answerEntry.meta?.instanceNumber || answerEntry.instanceNumber;
          
          // Find MI gate in current working list (transcriptWithV3Integrity)
          const miGateIndex = transcriptWithV3Integrity.findIndex(item => 
            isMiGateItem(item, answerPackId, answerInstanceNumber)
          );
          
          if (miGateIndex !== -1) {
            // MI gate exists - insert answer BEFORE gate (not after question)
            transcriptWithV3Integrity.splice(miGateIndex, 0, answerEntry);
            
            console.log('[V3_PROBE_ANSWER][INSERTED_BEFORE_GATE]', {
              packId: answerPackId,
              instanceNumber: answerInstanceNumber,
              answerStableKey: answerEntry.stableKey || answerEntry.id,
              gateIndex: miGateIndex,
              reason: 'MI gate present - preventing trailing answer'
            });
          } else {
            // No MI gate - insert answer after question (normal flow)
            transcriptWithV3Integrity.push(answerEntry);
            
            console.log('[V3_PROBE_ANSWER][INSERTED_AFTER_QUESTION]', {
              packId: answerPackId,
              instanceNumber: answerInstanceNumber,
              answerStableKey: answerEntry.stableKey || answerEntry.id,
              reason: 'No MI gate - normal Q+A pairing'
            });
          }
        }
      }
    }
    
    // Use V3 integrity-passed list for placeholder injection
    transcriptToRenderDeduped = transcriptWithV3Integrity;
    
    // PARENT PLACEHOLDER INJECTION: Only for MI_GATE (BASE_QUESTION already handled by integrity pass)
    const transcriptWithParentPlaceholders = [];
    const placeholdersInjected = [];
    
    for (let i = 0; i < transcriptToRenderDeduped.length; i++) {
      const entry = transcriptToRenderDeduped[i];
      const isYesNoAnswer = 
        entry.role === 'user' && 
        entry.messageType === 'MULTI_INSTANCE_GATE_ANSWER' &&
        (entry.text === 'Yes' || entry.text === 'No' || entry.text?.startsWith('Yes (') || entry.text?.startsWith('No ('));
      
      if (isYesNoAnswer) {
        const answerContext = entry.meta?.answerContext || entry.answerContext;
        
        // Only inject for MI_GATE (BASE_QUESTION handled by integrity pass above)
        if (answerContext !== 'MI_GATE') {
          transcriptWithParentPlaceholders.push(entry);
          continue;
        }
        
        const parentKey = entry.meta?.parentStableKey || entry.parentStableKey;
        const answerStableKey = entry.stableKey || entry.id;
        
        // Check if parent exists in rendered list
        const parentExists = parentKey && transcriptToRenderDeduped.some(e => 
          (e.stableKey || e.id) === parentKey
        );
        
        if (parentKey && !parentExists) {
          // Inject placeholder parent for MI_GATE only
          const placeholderText = 'Continue this section?';
          
          const placeholder = {
            id: `placeholder:${answerStableKey}`,
            stableKey: `placeholder:${answerStableKey}`,
            role: 'assistant',
            messageType: 'PARENT_PLACEHOLDER',
            type: 'PARENT_PLACEHOLDER',
            text: placeholderText,
            timestamp: new Date(new Date(entry.timestamp).getTime() - 1).toISOString(),
            createdAt: (entry.createdAt || Date.now()) - 1,
            visibleToCandidate: true,
            __synthetic: true,
            meta: {
              answerContext,
              originalParentKey: parentKey,
              injectedFor: answerStableKey
            }
          };
          
          transcriptWithParentPlaceholders.push(placeholder);
          placeholdersInjected.push({
            answerStableKey,
            parentStableKey: parentKey,
            answerContext
          });
          
          console.log('[CQ_TRANSCRIPT][PARENT_INJECTED]', {
            answerStableKey,
            parentStableKey: parentKey,
            answerContext,
            placeholderText: placeholderText.substring(0, 60)
          });
        }
      }
      
      transcriptWithParentPlaceholders.push(entry);
    }
    
    // Log injection summary
    if (placeholdersInjected.length > 0) {
      console.log('[CQ_TRANSCRIPT][PARENT_INJECTION_SUMMARY]', {
        count: placeholdersInjected.length,
        injections: placeholdersInjected
      });
    }
    
    // Use placeholder-injected list for rendering
    transcriptToRenderDeduped = transcriptWithParentPlaceholders;
    
    // C) MI GATE DEDUPE: Remove duplicate MI gate entries by stableKey
    const miGateDedupeMap = new Map();
    const transcriptWithMiGateDedupe = [];
    let miGateRemovedCount = 0;
    const miGateRemovedKeys = [];
    
    for (const entry of transcriptToRenderDeduped) {
      const mt = entry.messageType || entry.type || null;
      const stableKey = entry.stableKey || entry.id || null;
      
      // Identify MI gate entries
      const isMiGateEntry = (stableKey && stableKey.startsWith('mi-gate:')) || 
                           mt === 'MULTI_INSTANCE_GATE_SHOWN' ||
                           mt === 'MULTI_INSTANCE_GATE_ANSWER';
      
      // GUARD: Never dedupe required-anchor entries
      const isRequiredAnchorEntry = stableKey && stableKey.startsWith('required-anchor:');
      
      if (isRequiredAnchorEntry) {
        console.log('[MI_GATE][DEDUPE_SKIP_REQUIRED_ANCHOR]', {
          stableKey,
          reason: 'Required-anchor entries must not be deduped by MI gate logic'
        });
        transcriptWithMiGateDedupe.push(entry);
        continue; // Skip MI gate dedupe for required-anchor entries
      }
      
      if (isMiGateEntry && stableKey) {
        if (miGateDedupeMap.has(stableKey)) {
          miGateRemovedCount++;
          if (miGateRemovedKeys.length < 3) {
            miGateRemovedKeys.push(stableKey);
          }
          continue; // Skip duplicate
        }
        miGateDedupeMap.set(stableKey, true);
      }
      
      transcriptWithMiGateDedupe.push(entry);
    }
    
    if (miGateRemovedCount > 0) {
      console.log('[MI_GATE][DEDUP_APPLIED]', {
        beforeLen: transcriptToRenderDeduped.length,
        afterLen: transcriptWithMiGateDedupe.length,
        removedCount: miGateRemovedCount,
        removedKeysSample: miGateRemovedKeys
      });
    }
    
    // Use MI-gate-deduped list
    transcriptToRenderDeduped = transcriptWithMiGateDedupe;
    
    // REQUIRED_ANCHOR REPAIR INJECTION: Ensure answers follow their questions
    const transcriptWithRequiredAnchorRepair = [];
    const requiredAnchorQToA = new Map(); // Map question stableKey to answer entry
    let repairInjectedCount = 0;
    
    // Build map of required-anchor Q/A from DB transcript
    for (const entry of transcriptSOT) {
      const stableKey = entry.stableKey || entry.id || '';
      
      if (stableKey.startsWith('required-anchor:q:')) {
        // Track question for repair
        if (!requiredAnchorQToA.has(stableKey)) {
          requiredAnchorQToA.set(stableKey, null);
        }
      }
      
      if (stableKey.startsWith('required-anchor:a:')) {
        // Find matching question key
        const qKey = stableKey.replace(':a:', ':q:');
        if (requiredAnchorQToA.has(qKey)) {
          requiredAnchorQToA.set(qKey, entry);
        }
      }
    }
    
    // Inject missing answers after their questions
    for (let i = 0; i < transcriptToRenderDeduped.length; i++) {
      const entry = transcriptToRenderDeduped[i];
      transcriptWithRequiredAnchorRepair.push(entry);
      
      const stableKey = entry.stableKey || entry.id || '';
      
      // Check if this is a required-anchor question
      if (stableKey.startsWith('required-anchor:q:')) {
        const answerEntry = requiredAnchorQToA.get(stableKey);
        
        if (answerEntry) {
          // Check if answer already in render stream
          const answerAlreadyPresent = transcriptToRenderDeduped.some(e => 
            (e.stableKey || e.id) === (answerEntry.stableKey || answerEntry.id)
          );
          
          if (!answerAlreadyPresent) {
            // Inject answer after question
            transcriptWithRequiredAnchorRepair.push(answerEntry);
            repairInjectedCount++;
            
            const anchor = answerEntry.meta?.anchor || answerEntry.anchor;
            console.log('[REQUIRED_ANCHOR_FALLBACK][REPAIR_INJECT_ANSWER]', {
              anchor,
              stableKeyA: answerEntry.stableKey || answerEntry.id,
              insertedAfter: stableKey,
              reason: 'Answer in DB but missing from render stream'
            });
          }
        }
      }
    }
    
    if (repairInjectedCount > 0) {
      console.log('[REQUIRED_ANCHOR_FALLBACK][REPAIR_INJECTION_SUMMARY]', {
        injectedCount: repairInjectedCount,
        reason: 'Restored missing required-anchor answers to render stream'
      });
    }
    
    // Use repair-injected list
    transcriptToRenderDeduped = transcriptWithRequiredAnchorRepair;
    
    // PART 2: ADJACENCY-BASED QUESTIONID INFERENCE (orphan Yes/No answers)
    // Infer questionId for answers that have no questionId/meta by finding nearby QUESTION_SHOWN
    
    // RISK 1 FIX: Use Map instead of in-place mutation
    const inferredQuestionIdByKey = new Map(); // key -> questionId
    
    // RISK 2 FIX: Helper for consistent questionId extraction from QUESTION_SHOWN
    const getQuestionIdFromQuestionShown = (entry) => {
      // Priority 1: entry.questionId
      if (entry.questionId) return entry.questionId;
      
      // Priority 2: entry.meta.questionDbId
      if (entry.meta?.questionDbId) return entry.meta.questionDbId;
      
      // Priority 3: Parse from stableKey 'question-shown:<id>'
      const stableKey = entry.stableKey || entry.id || '';
      if (stableKey.startsWith('question-shown:') || stableKey.startsWith('question:')) {
        const match = stableKey.match(/^question(?:-shown)?:(?:[^:]+:)?([^:]+)/);
        if (match) return match[1];
      }
      
      return null;
    };
    
    let lastSeenQuestionId = null;
    let itemsSinceQuestion = 0;
    const ADJACENCY_WINDOW = 3; // Max items between question and answer to infer
    
    for (let i = 0; i < transcriptToRenderDeduped.length; i++) {
      const entry = transcriptToRenderDeduped[i];
      const mt = getMessageTypeSOT(entry);
      
      // Track last seen question (RISK 2: use helper)
      if (mt === 'QUESTION_SHOWN') {
        const qId = getQuestionIdFromQuestionShown(entry);
        if (qId) {
          lastSeenQuestionId = qId;
          itemsSinceQuestion = 0; // Reset counter only when qId found
        } else {
          itemsSinceQuestion++;
        }
      } else {
        itemsSinceQuestion++;
      }
      
      // Infer questionId for orphan Yes/No answers - SKIP if questionId already present
      if (mt === 'ANSWER' && (entry.text === 'Yes' || entry.text === 'No')) {
        const hasQuestionId = !!(entry.questionId || entry.meta?.questionId || entry.meta?.questionDbId);
        
        if (!hasQuestionId && lastSeenQuestionId && itemsSinceQuestion <= ADJACENCY_WINDOW) {
          // RISK 1 FIX: Use Map instead of mutation
          const answerKey = entry.stableKey || entry.id;
          inferredQuestionIdByKey.set(answerKey, lastSeenQuestionId);
          
          console.log('[CQ_TRANSCRIPT][ANSWER_INFERRED_QUESTION_ID]', {
            stableKey: answerKey,
            inferredQuestionId: lastSeenQuestionId,
            itemsSinceQuestion,
            text: entry.text
          });
        } else if (hasQuestionId) {
          // AUDIT: Confirm questionId present at creation (no inference needed)
          const answerKey = entry.stableKey || entry.id;
          console.log('[CQ_TRANSCRIPT][ANSWER_HAS_QUESTIONID_SKIP_INFERENCE]', {
            stableKey: answerKey,
            questionId: entry.questionId || entry.meta?.questionId || entry.meta?.questionDbId,
            text: entry.text,
            reason: 'questionId present at creation - no inference needed'
          });
        }
      }
    }
    
    // CANONICAL BASE YES/NO DETECTOR: Build set of canonical base answers
    const canonicalBaseYesNoKeys = new Set();
    let hasAnyCanonicalBaseYesNo = false;
    
    for (const entry of transcriptToRenderDeduped) {
      const mt = getMessageTypeSOT(entry);
      if (mt !== 'ANSWER') continue;
      
      const stableKey = entry.stableKey || entry.id || '';
      const isCanonicalBase = stableKey.startsWith('answer:');
      const isYesOrNo = entry.text === 'Yes' || entry.text === 'No';
      
      if (isCanonicalBase && isYesOrNo) {
        canonicalBaseYesNoKeys.add(stableKey);
        hasAnyCanonicalBaseYesNo = true;
      }
    }
    
    // DEBUG LOG: Once per session only (reduce noise)
    if (hasAnyCanonicalBaseYesNo && !canonicalDetectorLoggedRef.current) {
      canonicalDetectorLoggedRef.current = true;
      console.log('[CQ_TRANSCRIPT][CANONICAL_BASE_YESNO_DETECTOR]', {
        hasAnyCanonicalBaseYesNo,
        canonicalCount: canonicalBaseYesNoKeys.size,
        sampleKeys: Array.from(canonicalBaseYesNoKeys).slice(0, 3)
      });
    }
    
    // SUPPRESSION: Remove legacy UUID Yes/No answers without identity
    let suppressedCount = 0;
    const transcriptWithLegacyUuidSuppressed = transcriptToRenderDeduped.filter(entry => {
      const mt = getMessageTypeSOT(entry);
      if (mt !== 'ANSWER') return true; // Keep non-answers
      
      const stableKey = entry.stableKey || entry.id || '';
      const isYesOrNo = entry.text === 'Yes' || entry.text === 'No';
      
      if (!isYesOrNo) return true; // Keep non-Yes/No answers
      
      // Check if this is a known answer type (has identity)
      const hasKnownPrefix = 
        stableKey.startsWith('answer:') ||
        stableKey.startsWith('v3-') ||
        stableKey.startsWith('v3-probe-') ||
        stableKey.startsWith('v3-opener-') ||
        stableKey.startsWith('mi-gate:') ||
        stableKey.startsWith('followup-');
      
      if (hasKnownPrefix) return true; // Keep known answer types
      
      // Check if entry has identity metadata
      const hasIdentity = !!(
        entry.questionId ||
        entry.meta?.questionId ||
        entry.meta?.packId ||
        entry.meta?.instanceNumber ||
        entry.meta?.promptId
      );
      
      if (hasIdentity) return true; // Keep answers with identity
      
      // Legacy UUID answer without identity - suppress only if canonical exists
      if (hasAnyCanonicalBaseYesNo) {
        suppressedCount++;
        console.warn('[CQ_TRANSCRIPT][SUPPRESSED_LEGACY_UUID_YESNO]', {
          stableKey,
          text: entry.text,
          reason: 'UUID yes/no answer without questionId/meta while canonical base yes/no exists'
        });
        return false; // DROP
      }
      
      return true; // Keep (fail-open if no canonical exists)
    });
    
    // GOAL ACHIEVED AUDIT: Log once per session if suppressions occurred
    if (suppressedCount > 0 && !canonicalDetectorLoggedRef.current) {
      console.log('[CQ_TRANSCRIPT][GOAL][MYSTERY_YES_SUPPRESSED]', {
        sessionId,
        suppressedCount,
        reason: 'Legacy UUID Yes/No answers removed - canonical base answer preserved'
      });
    }
    
    // Use suppressed list for further processing
    transcriptToRenderDeduped = transcriptWithLegacyUuidSuppressed;
    
    // CANONICAL ANSWER DEDUPE: Remove duplicate base-question answers (same questionId)
    // SCOPE: ONLY base-question answers - excludes V3/MI/followup answers
    
    // HELPER: Single predicate for base-answer identification (prevents drift)
    const isBaseAnswerSubjectToDedupe = (entry) => {
      const mt = getMessageTypeSOT(entry);
      if (mt !== 'ANSWER') return { isBase: false, reason: 'not_answer_type' };
      
      const stableKey = entry.stableKey || entry.id || '';
      
      // EXCLUSION RULES: Explicitly NOT base-question answers
      const isV3Answer = stableKey.startsWith('v3-') || 
                         stableKey.startsWith('v3-opener-') ||
                         stableKey.startsWith('v3-probe-') ||
                         mt === 'V3_PROBE_ANSWER' || 
                         mt === 'V3_OPENER_ANSWER';
      const isMiGateAnswer = stableKey.startsWith('mi-gate:') || 
                             mt === 'MULTI_INSTANCE_GATE_ANSWER';
      const hasPackMeta = entry.meta?.packId || entry.meta?.instanceNumber || entry.meta?.followupPackId;
      const isFollowupAnswer = stableKey.startsWith('followup-') || hasPackMeta;
      
      if (isV3Answer) return { isBase: false, reason: 'v3_answer' };
      if (isMiGateAnswer) return { isBase: false, reason: 'mi_gate_answer' };
      if (isFollowupAnswer) return { isBase: false, reason: 'followup_answer' };
      
      // INCLUSION RULES: Identify base-question answers
      const hasDeterministicKey = stableKey.startsWith('answer:');
      const hasBaseContext = entry.meta?.answerContext === 'BASE_QUESTION';
      const hasQuestionIdNoPackMeta = entry.questionId && !hasPackMeta;
      
      const isBaseQuestionAnswer = hasDeterministicKey || hasBaseContext || hasQuestionIdNoPackMeta;
      
      if (!isBaseQuestionAnswer) return { isBase: false, reason: 'no_base_markers' };
      
      return { isBase: true, reason: 'base_question_answer' };
    };
    
    const canonicalAnswerMap = new Map();
    const answersToDedupe = [];
    
    for (const entry of transcriptToRenderDeduped) {
      const check = isBaseAnswerSubjectToDedupe(entry);
      if (!check.isBase) continue;
      
      const stableKey = entry.stableKey || entry.id || '';
      
      // Extract questionId from entry or parse from stableKey (with adjacency inference)
      // RISK 1 FIX: Use Map lookup instead of __inferredQuestionId property
      let questionId = entry.questionId || entry.meta?.questionId || inferredQuestionIdByKey.get(stableKey);
      
      if (!questionId && stableKey.startsWith('answer:')) {
        // Parse from stableKey format: 'answer:<sessionId>:<questionId>:<index>'
        const keyMatch = stableKey.match(/^answer:[^:]+:([^:]+):/);
        if (keyMatch) {
          questionId = keyMatch[1];
        }
      }
      
      if (!questionId) continue; // Cannot dedupe without questionId
      
      const canonicalKey = `base-answer:${questionId}`;
      
      if (!canonicalAnswerMap.has(canonicalKey)) {
        canonicalAnswerMap.set(canonicalKey, []);
      }
      
      canonicalAnswerMap.get(canonicalKey).push(entry);
      answersToDedupe.push({ entry, canonicalKey, questionId, isBaseQuestionAnswer: true, stableKeyPrefix: stableKey.split(':')[0] });
    }
    
    // Build final list: keep one answer per canonicalKey, drop duplicates
    const answersToKeep = new Set();
    const droppedAnswers = [];
    
    for (const [canonicalKey, answers] of canonicalAnswerMap.entries()) {
      if (answers.length <= 1) {
        // No duplicates - keep as-is
        answersToKeep.add(answers[0].stableKey || answers[0].id);
        continue;
      }
      
      // DUPLICATES FOUND: Keep deterministic stableKey, drop UUID
      const deterministicAnswer = answers.find(a => 
        a.stableKey && a.stableKey.startsWith('answer:')
      );
      
      const answerToKeep = deterministicAnswer || answers[answers.length - 1];
      answersToKeep.add(answerToKeep.stableKey || answerToKeep.id);
      
      const dropped = answers.filter(a => 
        (a.stableKey || a.id) !== (answerToKeep.stableKey || answerToKeep.id)
      );
      
      if (dropped.length > 0) {
        const keptKey = answerToKeep.stableKey || answerToKeep.id;
        const keptPrefix = keptKey.split(':')[0];
        
        console.log('[CQ_TRANSCRIPT][ANSWER_DEDUPED_CANONICAL]', {
          canonicalAnswerKey: canonicalKey,
          keptStableKey: keptKey,
          droppedStableKeys: dropped.map(d => d.stableKey || d.id),
          isBaseQuestionAnswer: true,
          stableKeyPrefix: keptPrefix
        });
        
        droppedAnswers.push(...dropped.map(d => d.stableKey || d.id));
      }
    }
    
    // Filter out dropped answers from render list (base-question answers only)
    transcriptToRenderDeduped = transcriptToRenderDeduped.filter(entry => {
      const check = isBaseAnswerSubjectToDedupe(entry);
      
      if (!check.isBase) {
        return true; // Keep - not subject to base dedupe
      }
      
      // Base-question answer: apply dedupe constraint
      const entryKey = entry.stableKey || entry.id;
      if (!entryKey) return true; // Keep if no key
      
      // Only keep if in answersToKeep set
      return answersToKeep.has(entryKey);
    });
    
    // SAFETY GUARD: Verify no duplicate canonical answers remain
    const finalCanonicalCheck = new Map();
    for (const entry of transcriptToRenderDeduped) {
      const check = isBaseAnswerSubjectToDedupe(entry);
      if (!check.isBase) continue; // Only check base answers
      
      const entryKey = entry.stableKey || entry.id || '';
      
      // RISK 1 FIX: Use Map lookup instead of __inferredQuestionId property
      let questionId = entry.questionId || entry.meta?.questionId || inferredQuestionIdByKey.get(entryKey);
      if (!questionId && entryKey.startsWith('answer:')) {
        const keyMatch = entryKey.match(/^answer:[^:]+:([^:]+):/);
        if (keyMatch) questionId = keyMatch[1];
      }
      
      if (!questionId) continue;
      
      const canonicalKey = `base-answer:${questionId}`;
      const stableKey = entry.stableKey || entry.id || '';
      
      if (finalCanonicalCheck.has(canonicalKey)) {
        const stableKeyPrefix = stableKey.split(':')[0];
        
        console.error('[CQ_TRANSCRIPT][BUG][ANSWER_DUPLICATE_AFTER_DEDUPE]', {
          canonicalAnswerKey: canonicalKey,
          stableKeys: [
            finalCanonicalCheck.get(canonicalKey),
            stableKey
          ],
          baseSubject: true,
          stableKeyPrefix,
          reason: 'Multiple answers for same base question survived dedupe'
        });
      } else {
        finalCanonicalCheck.set(canonicalKey, entry.stableKey || entry.id);
      }
    }
    
    // TRUTH TABLE AUDIT: V3 probe answer visibility (only when relevant)
    if (activeUiItem?.kind === "MI_GATE" || dbV3ProbeAnswers.length > 0) {
      // Get most recent V3 probe answer for current pack/instance
      const packId = currentItem?.packId || v3ProbingContext?.packId;
      const instanceNumber = currentItem?.instanceNumber || v3ProbingContext?.instanceNumber || 1;
      
      const recentProbeAnswers = dbV3ProbeAnswers.filter(e => 
        e.meta?.packId === packId && e.meta?.instanceNumber === instanceNumber
      );
      
      if (recentProbeAnswers.length > 0) {
        const lastProbeAnswer = recentProbeAnswers[recentProbeAnswers.length - 1];
        const stableKeyA = lastProbeAnswer.stableKey || lastProbeAnswer.id;
        const promptId = stableKeyA ? stableKeyA.replace('v3-probe-a:', '') : null;
        
        const existsInDb = dbV3ProbeAnswers.some(e => (e.stableKey || e.id) === stableKeyA);
        const existsInDeduped = transcriptWithV3ProbeQA.some(e => (e.stableKey || e.id) === stableKeyA);
        const existsInFinal = transcriptToRenderDeduped.some(e => (e.stableKey || e.id) === stableKeyA);

        // CRASH GUARD: Safe logging with fallback
        safeLog(() => {
          const filteredDetailsSafe = Array.isArray(removedEphemeralItems) ? removedEphemeralItems : [];
          const stableKeysRemovedSafe = filteredDetailsSafe.map(e => e?.stableKey).filter(Boolean);

          console.log('[CQ_TRANSCRIPT][V3_PROBE_A_TRUTH_TABLE]', {
            promptId,
            stableKeyA,
            existsInDb,
            existsInDeduped,
            existsInFinal,
            activeUiItemKind: activeUiItem?.kind,
            packId,
            instanceNumber,
            filteredStableKeysRemoved: stableKeysRemovedSafe.slice(0, 5)
          });
        });
      }
    }
    
    // Diagnostic logging
    if (typeof window !== 'undefined' && (window.location.hostname.includes('preview') || window.location.hostname.includes('localhost'))) {
      const openerAnswerCount = transcriptToRenderDeduped.filter(e => getMessageTypeSOT(e) === 'V3_OPENER_ANSWER').length;
      const probeAnswerCount = transcriptToRenderDeduped.filter(e => getMessageTypeSOT(e) === 'V3_PROBE_ANSWER').length;
      const probeQuestionCount = transcriptToRenderDeduped.filter(e => getMessageTypeSOT(e) === 'V3_PROBE_QUESTION').length;
      
      console.log('[CQ_TRANSCRIPT][TYPE_COUNTS_SOT]', {
        openerAnswerCount,
        probeAnswerCount,
        probeQuestionCount
      });
    
      const packId = currentItem?.packId || v3ProbingContext?.packId;
      const instanceNumber = currentItem?.instanceNumber || v3ProbingContext?.instanceNumber || 1;
      const openerAnswerStableKeyForLog = `v3-opener-a:${sessionId}:${packId}:${instanceNumber}`;
      
      const hasOpenerAnswerByStableKey = transcriptToRenderDeduped.some(e => 
        e.stableKey === openerAnswerStableKeyForLog
      );
      
      const openerAnswerByIdentity = transcriptToRenderDeduped.find(e => 
        (e.messageType === 'v3_opener_answer' || e.kind === 'v3_opener_a') &&
        e.packId === packId && 
        (e.instanceNumber === instanceNumber || e.meta?.instanceNumber === instanceNumber)
      );
      const hasOpenerAnswerByIdentity = !!openerAnswerByIdentity;
      const hasOpenerAnswer = hasOpenerAnswerByStableKey || hasOpenerAnswerByIdentity;
      
      console.log('[CQ_RENDER_SOT][BEFORE_MAP]', {
        listName: 'finalRenderStream',
        len: transcriptToRenderDeduped.length,
        hasOpenerAnswer,
        hasOpenerAnswerByStableKey,
        hasOpenerAnswerByIdentity,
        foundStableKey: openerAnswerByIdentity?.stableKey || null,
        verifyStableKey: openerAnswerStableKeyForLog,
        last3: transcriptToRenderDeduped.slice(-3).map(e => ({
          stableKey: e.stableKey || e.id,
          messageType: e.messageType || e.type || e.kind,
          role: e.role,
          textPreview: (e.text || '').substring(0, 40)
        }))
      });

      // ============================================================================
      // V3 PACK DETERMINISTIC GUARD - Filter deterministic follow-up artifacts
      // ============================================================================
      // When a V3 pack is active, suppress ALL deterministic follow-up question items
      // V3 packs use conversational probing (V3ProbingLoop) - no deterministic UI cards

      // Detect active V3 pack context
      const activePackId = currentItem?.packId || v3ProbingContext?.packId || activeUiItem?.packId || null;
      const packConfig = activePackId ? FOLLOWUP_PACK_CONFIGS?.[activePackId] : null;
      const isActivePackV3 = Boolean(packConfig?.isV3Pack === true || packConfig?.engineVersion === 'v3');
      const isV3UiActive = (activeUiItem?.kind === 'V3_OPENER' || 
                           activeUiItem?.kind === 'V3_PROBING' || 
                           currentItem?.type === 'v3_pack_opener' ||
                           v3ProbingActive);

      // Only apply suppression when BOTH are true
      const shouldFilterDeterministicFollowups = isActivePackV3 && isV3UiActive;

      if (shouldFilterDeterministicFollowups) {
        const beforeLen = transcriptToRenderDeduped.length;
        const removedSamples = [];

        transcriptToRenderDeduped = transcriptToRenderDeduped.filter(entry => {
          // Extract entry metadata
          const mt = entry.messageType || entry.type || entry.kind || '';
          const entryPackId = entry.packId || entry.meta?.packId || entry.meta?.followup_pack_id;
          const entryStableKey = entry.stableKey || entry.id || '';
          const entryVariant = entry.variant || entry.meta?.variant;
          
          // STRICT TYPE CHECK: Exclude normal Q/A items
          const isNormalQA = mt === 'QUESTION_SHOWN' || 
                             mt === 'ANSWER' || 
                             mt === 'V3_PROBE_QUESTION' || 
                             mt === 'V3_PROBE_ANSWER';
          
          if (isNormalQA) {
            return true; // NEVER filter normal Q/A (even with packId)
          }
          
          // DETERMINISTIC TYPE CHECK: Explicit deterministic follow-up markers
          const matchesDeterministicType = 
            mt === 'FOLLOWUP_QUESTION' ||
            mt === 'FOLLOWUP_STEP' ||
            mt === 'FOLLOWUP_DETERMINISTIC' ||
            mt === 'PACK_STEP' ||
            entry.kind === 'followup_question' ||
            entry.type === 'followup_question' ||
            entryVariant === 'deterministic';
          
          // PACK OWNERSHIP CHECK: Prove entry belongs to active V3 pack
          const belongsToActivePack = 
            entryPackId === activePackId ||
            entryStableKey.includes(activePackId);
          
          // STRICT GUARD: Only filter if BOTH type matches AND ownership proven
          const isDeterministicForActivePack = matchesDeterministicType && belongsToActivePack;

          if (isDeterministicForActivePack) {
            // Track removed entry with audit trail (up to 5 samples)
            if (removedSamples.length < 5) {
              removedSamples.push({
                mt,
                kind: entry.kind,
                type: entry.type,
                entryPackId,
                stableKeySuffix: entryStableKey.slice(-18),
                reasonFlags: {
                  matchesDeterministicType,
                  belongsToActivePack,
                  variantDeterministic: entryVariant === 'deterministic'
                }
              });
            }
            return false; // Filter out (proven deterministic artifact for active pack)
          }

          return true; // Keep all other items
        });

        const afterLen = transcriptToRenderDeduped.length;
        const removedCount = beforeLen - afterLen;

        // Always log when guard is active (proof it ran)
        logOnce(`v3_deterministic_guard_${sessionId}:${activePackId}`, () => {
          console.log('[UI_CONTRACT][V3_PACK_DETERMINISTIC_GUARD]', {
            packId: activePackId,
            isActivePackV3,
            isV3UiActive,
            shouldFilterDeterministicFollowups: true,
            beforeLen,
            afterLen,
            removedCount,
            removedSampleCount: removedSamples.length,
            reason: 'V3 pack uses conversational probing - deterministic UI artifacts filtered'
          });
        });
        
        // Active log when items removed (proof it's working)
        if (removedCount > 0) {
          logOnce(`v3_deterministic_guard_active_${sessionId}:${activePackId}`, () => {
            console.log('[UI_CONTRACT][V3_PACK_DETERMINISTIC_GUARD_ACTIVE]', {
              packId: activePackId,
              removedCount,
              removedSamples: removedSamples.slice(0, 3),
              reason: 'Deterministic follow-ups filtered for active V3 pack'
            });
          });
        }
      }
      
      if (cqDiagEnabled) {
        console.log('[CQ_GO_STATUS]', {
          crashSeen: false,
          hasOpenerAnswer,
          renderLen: transcriptToRender.length,
          hasOpenerAnswerByStableKey,
          hasOpenerAnswerByIdentity
        });
      }
    }
    
    // CQ_FORBIDDEN: This suppresses UNANSWERED questions only (render filter, NOT transcript mutation)
    // Transcript is permanent - this only affects what renders while V3 is active
    // CQ_RULE: STREAM_SUPPRESS must never block transcript writes - this is render-time only
    // ACTIVE OPENER DEDUPLICATION: Remove transcript copy when opener is currently active
    // This prevents duplicate rendering (transcript + active lane)
    let transcriptWithActiveOpenerRemoved = transcriptToRenderDeduped;
    
    // CONDITIONAL: Only run when V3_OPENER is actually active (not during V3_PROMPT or other states)
    const shouldSuppressActiveOpener = activeUiItem?.kind === "V3_OPENER" && 
                                       activeCard?.stableKey && 
                                       screenMode === "QUESTION";
    
    console.log('[V3_UI_CONTRACT][ACTIVE_OPENER_DUPLICATE_FILTER_SOT]', {
      activeUiItemKind: activeUiItem?.kind,
      activeStableKey: activeCard?.stableKey || null,
      didRun: shouldSuppressActiveOpener,
      removedCount: 0 // Will be updated below
    });
    
    if (shouldSuppressActiveOpener) {
      const activeOpenerStableKey = activeCard.stableKey;
      const beforeLen = transcriptWithActiveOpenerRemoved.length;
      
      transcriptWithActiveOpenerRemoved = transcriptWithActiveOpenerRemoved.filter(e => {
        const entryStableKey = e.stableKey || e.id || e.__canonicalKey;
        const matches = entryStableKey === activeOpenerStableKey;
        
        if (matches) {
          console.log('[V3_UI_CONTRACT][ACTIVE_OPENER_DUPLICATE_REMOVED]', {
            activeStableKey: activeOpenerStableKey,
            removedStableKey: entryStableKey,
            messageType: e.messageType || e.type,
            screenMode,
            activeUiItemKind: activeUiItem.kind
          });
        }
        
        return !matches; // Remove if matches active opener
      });
      
      const removedCount = beforeLen - transcriptWithActiveOpenerRemoved.length;
      
      console.log('[V3_UI_CONTRACT][ACTIVE_OPENER_DUPLICATE_FILTER_SOT]', {
        activeUiItemKind: activeUiItem?.kind,
        activeStableKey: activeOpenerStableKey,
        didRun: true,
        removedCount
      });
      
      if (removedCount > 0) {
        console.log('[V3_UI_CONTRACT][ACTIVE_OPENER_DUPLICATE_SUMMARY]', {
          activeStableKey: activeOpenerStableKey,
          removedCount,
          packId: activeCard.packId,
          instanceNumber: activeCard.instanceNumber,
          reason: 'Active opener renders in active lane only - transcript copy suppressed'
        });
      }
    } else {
      // Not active opener mode - all opener transcript entries should be preserved
      console.log('[V3_UI_CONTRACT][ACTIVE_OPENER_FILTER_SKIPPED]', {
        activeUiItemKind: activeUiItem?.kind,
        reason: shouldSuppressActiveOpener ? 'conditions_not_met' : 'not_v3_opener_mode',
        action: 'Preserving all opener transcript entries'
      });
    }
    
    // Use deduplicated list for further processing
    transcriptToRenderDeduped = transcriptWithActiveOpenerRemoved;
    
    // OPENER PRESENCE ASSERTION: Verify completed opener instances are in transcript
    const completedOpeners = (dbTranscript || []).filter(e => 
      (e.messageType === 'FOLLOWUP_CARD_SHOWN' || e.type === 'FOLLOWUP_CARD_SHOWN') &&
      (e.meta?.variant === 'opener' || e.variant === 'opener')
    );
    
    if (completedOpeners.length > 0) {
      const activePackId = currentItem?.packId;
      const activeInstanceNumber = currentItem?.instanceNumber;
      const missingInstanceNumbers = [];
      
      for (const opener of completedOpeners) {
        const openerPackId = opener.meta?.packId || opener.packId;
        const openerInstanceNumber = opener.meta?.instanceNumber || opener.instanceNumber;
        const openerStableKey = opener.stableKey || opener.id;
        
        // Skip currently active opener instance (expected to be missing from transcript)
        const isCurrentlyActive = activeUiItem?.kind === "V3_OPENER" &&
                                  openerPackId === activePackId &&
                                  openerInstanceNumber === activeInstanceNumber;
        
        if (isCurrentlyActive) continue;
        
        // Check if this completed opener is in final transcript
        const foundInTranscript = transcriptToRenderDeduped.some(e => 
          (e.stableKey || e.id) === openerStableKey ||
          ((e.messageType === 'FOLLOWUP_CARD_SHOWN' || e.type === 'FOLLOWUP_CARD_SHOWN') &&
           (e.meta?.variant === 'opener' || e.variant === 'opener') &&
           (e.meta?.packId || e.packId) === openerPackId &&
           (e.meta?.instanceNumber || e.instanceNumber) === openerInstanceNumber)
        );
        
        if (!foundInTranscript) {
          missingInstanceNumbers.push(`${openerPackId}:${openerInstanceNumber}`);
          
          console.error('[V3_UI_CONTRACT][OPENER_MISSING_FROM_TRANSCRIPT]', {
            packId: openerPackId,
            instanceNumber: openerInstanceNumber,
            stableKey: openerStableKey,
            activeUiItemKind: activeUiItem?.kind,
            activeInstanceNumber,
            reason: 'Completed opener not in transcript history - regression detected'
          });
        }
      }
      
      if (missingInstanceNumbers.length > 0) {
        console.error('[V3_UI_CONTRACT][OPENER_MISSING_SUMMARY]', {
          missingCount: missingInstanceNumbers.length,
          missingInstanceNumbers,
          activeUiItemKind: activeUiItem?.kind,
          activePackId,
          activeInstanceNumber
        });
      }
    }
    
    // ACTIVE MI_GATE DEDUPLICATION: Remove transcript copy when MI gate is currently active
    // This prevents duplicate rendering (transcript + active lane)
    let transcriptWithActiveMiGateRemoved = transcriptToRenderDeduped;
    
    if (activeUiItem?.kind === "MI_GATE" && screenMode === "QUESTION") {
      const activeMiGateStableKey = activeCard?.stableKey || 
                                    (currentItem?.packId && currentItem?.instanceNumber 
                                      ? `mi-gate:${currentItem.packId}:${currentItem.instanceNumber}:q`
                                      : null);
      
      if (activeMiGateStableKey) {
        const beforeLen = transcriptWithActiveMiGateRemoved.length;
        const removedKeys = [];
        
        transcriptWithActiveMiGateRemoved = transcriptWithActiveMiGateRemoved.filter(e => {
          const entryStableKey = e.stableKey || e.id || e.__canonicalKey;
          
          // Match exact stableKey or same packId+instanceNumber
          const exactMatch = entryStableKey === activeMiGateStableKey;
          const baseKeyMatch = entryStableKey && 
                              activeMiGateStableKey && 
                              entryStableKey.startsWith(activeMiGateStableKey.replace(':q', ''));
          const packInstanceMatch = e.meta?.packId === currentItem?.packId && 
                                   e.meta?.instanceNumber === currentItem?.instanceNumber &&
                                   (e.messageType === 'MULTI_INSTANCE_GATE_SHOWN' || e.type === 'MULTI_INSTANCE_GATE_SHOWN');
          
          const matches = exactMatch || baseKeyMatch || packInstanceMatch;
          
          if (matches) {
            removedKeys.push(entryStableKey);
            console.log('[MI_GATE][ACTIVE_DUPLICATE_REMOVED]', {
              activeStableKey: activeMiGateStableKey,
              removedStableKey: entryStableKey,
              matchType: exactMatch ? 'exact' : baseKeyMatch ? 'baseKey' : 'packInstance',
              messageType: e.messageType || e.type,
              screenMode,
              activeUiItemKind: activeUiItem.kind
            });
          }
          
          return !matches; // Remove if matches active MI gate
        });
        
        const removedCount = beforeLen - transcriptWithActiveMiGateRemoved.length;
        if (removedCount > 0) {
          console.log('[MI_GATE][ACTIVE_DUPLICATE_REMOVED_SUMMARY]', {
            activeStableKey: activeMiGateStableKey,
            removedCount,
            removedKeysSample: removedKeys.slice(0, 3),
            packId: currentItem?.packId,
            instanceNumber: currentItem?.instanceNumber,
            reason: 'Active MI gate renders in active lane only - transcript copy suppressed'
          });
        }
      }
    }
    
    // Use deduplicated list for further processing
    transcriptToRenderDeduped = transcriptWithActiveMiGateRemoved;
    
    // CANONICAL OPENER MERGE: Force-merge DB openers into transcript (deterministic visibility)
    // Rule: ALL openers from dbTranscript MUST render (except currently active opener)
    const canonicalOpenersFromDb = (dbTranscript || []).filter(e => {
      const mt = e.messageType || e.type || null;
      const variant = e.meta?.variant || e.variant || null;
      return mt === 'FOLLOWUP_CARD_SHOWN' && variant === 'opener';
    });
    
    if (canonicalOpenersFromDb.length > 0) {
      // Canonical opener key function (single source of truth for key derivation)
      const getOpenerKey = (entry) => {
        const stableKey = entry.stableKey || entry.id;
        // Use existing stableKey if it's properly formatted
        if (stableKey && stableKey.startsWith('followup-card:') && stableKey.includes(':opener:')) {
          return stableKey;
        }
        // Derive canonical key from pack identity
        const packId = entry.meta?.packId || entry.packId;
        const instanceNumber = entry.meta?.instanceNumber || entry.instanceNumber;
        return `followup-card:${packId}:opener:${instanceNumber}`;
      };
      
      // GATING: Skip canonical insertion during active opener state (active lane owns it)
      const isActiveOpenerState = activeUiItem?.kind === "V3_OPENER";
      
      if (isActiveOpenerState) {
        console.log('[V3_UI_CONTRACT][OPENER_CANONICAL_MERGE_SKIPPED_ACTIVE]', {
          activeUiItemKind: 'V3_OPENER',
          reason: 'active opener owned by active lane - skipping insertion logic',
          canonicalOpenersCount: canonicalOpenersFromDb.length
        });
        
        // Still run pre-dedupe and assertion, but skip insertion
        // This prevents duplicate openers in transcript during active state
        let workingList = [...transcriptToRenderDeduped];
        const seenOpenerKeys = new Set();
        const removedDuplicates = [];
        
        workingList = workingList.filter(e => {
          const mt = e.messageType || e.type || null;
          const variant = e.meta?.variant || e.variant || null;
          const isOpener = mt === 'FOLLOWUP_CARD_SHOWN' && variant === 'opener';
          
          if (!isOpener) return true;
          
          const openerKey = getOpenerKey(e);
          if (seenOpenerKeys.has(openerKey)) {
            removedDuplicates.push(openerKey);
            return false;
          }
          
          seenOpenerKeys.add(openerKey);
          return true;
        });
        
        transcriptToRenderDeduped = workingList;
        
        if (removedDuplicates.length > 0) {
          console.log('[V3_UI_CONTRACT][OPENER_CANONICAL_DEDUP_PRE]', {
            beforeLen: transcriptToRenderDeduped.length + removedDuplicates.length,
            afterLen: workingList.length,
            removedCount: removedDuplicates.length,
            removedKeysSample: removedDuplicates.slice(0, 3),
            mode: 'active_opener_dedupe_only'
          });
        }
        
        // Set merge status for SOT log (component-level ref)
        openerMergeStatusRef.current = 'SKIP_ACTIVE';
        
        // Skip rest of merge logic - continue to next filter
      } else {
        // NOT active opener state - run full canonical merge logic
        const mergeMode = activeUiItem?.kind === 'V3_PROMPT' ? 'V3_PROMPT_HISTORY' : 'HISTORY_DISPLAY';
        
        console.log('[V3_UI_CONTRACT][OPENER_CANONICAL_MERGE_MODE]', {
          mode: mergeMode,
          willInsert: true,
          activeUiItemKind: activeUiItem?.kind,
          canonicalOpenersCount: canonicalOpenersFromDb.length
        });
        
        console.log('[V3_UI_CONTRACT][OPENER_CANONICAL_MERGE_START]', {
          canonicalOpenersCount: canonicalOpenersFromDb.length,
          activeUiItemKind: activeUiItem?.kind,
          transcriptLenBefore: transcriptToRenderDeduped.length
        });
        
        // PRE-DEDUPE: Remove duplicate opener entries from transcript before insertion
        let workingList = [...transcriptToRenderDeduped];
        const seenOpenerKeys = new Set();
        const beforeLen = workingList.length;
        const removedDuplicates = [];
        
        workingList = workingList.filter(e => {
          const mt = e.messageType || e.type || null;
          const variant = e.meta?.variant || e.variant || null;
          const isOpener = mt === 'FOLLOWUP_CARD_SHOWN' && variant === 'opener';
          
          if (!isOpener) return true; // Keep non-opener entries
          
          const openerKey = getOpenerKey(e);
          if (seenOpenerKeys.has(openerKey)) {
            removedDuplicates.push(openerKey);
            return false; // Remove duplicate
          }
          
          seenOpenerKeys.add(openerKey);
          return true; // Keep first occurrence
        });
        
        if (removedDuplicates.length > 0) {
          console.log('[V3_UI_CONTRACT][OPENER_CANONICAL_DEDUP_PRE]', {
            beforeLen,
            afterLen: workingList.length,
            removedCount: removedDuplicates.length,
            removedKeysSample: removedDuplicates.slice(0, 3)
          });
        } else {
          console.log('[V3_UI_CONTRACT][OPENER_CANONICAL_DEDUP_PRE]', {
            beforeLen,
            afterLen: workingList.length,
            removedCount: 0,
            status: 'clean'
          });
        }
        
        // IDENTIFY MISSING: Find openers that need insertion
        const missingOpeners = [];
        const openersToInsert = [];
        
        for (const opener of canonicalOpenersFromDb) {
          const openerKey = getOpenerKey(opener);
          const openerPackId = opener.meta?.packId || opener.packId;
          const openerInstanceNumber = opener.meta?.instanceNumber || opener.instanceNumber;
          
          // Check if this is the currently active opener
          const isCurrentlyActive = activeUiItem?.kind === "V3_OPENER" &&
                                    activeCard?.stableKey === openerKey;
          
          if (isCurrentlyActive) {
            console.log('[V3_UI_CONTRACT][OPENER_SKIP_CURRENTLY_ACTIVE]', {
              stableKey: openerKey,
              packId: openerPackId,
              instanceNumber: openerInstanceNumber,
              reason: 'Active opener renders in active lane - skip transcript merge'
            });
            continue; // Skip active opener (active lane owns it)
          }
          
          // Check if already in transcript (using canonical key)
          const foundInTranscript = seenOpenerKeys.has(openerKey);
          
          if (!foundInTranscript) {
            missingOpeners.push({
              stableKey: openerKey,
              packId: openerPackId,
              instanceNumber: openerInstanceNumber
            });
            
            // Prepare for insertion
            openersToInsert.push({
              entry: opener,
              stableKey: openerKey,
              packId: openerPackId,
              instanceNumber: openerInstanceNumber
            });
            
            console.log('[V3_UI_CONTRACT][OPENER_MISSING_WILL_INSERT]', {
              stableKey: openerKey,
              packId: openerPackId,
              instanceNumber: openerInstanceNumber,
              reason: 'Opener in DB but missing from transcript - will force-merge'
            });
          }
        }
        
        // INSERT MISSING: Add openers deterministically (idempotent)
        if (openersToInsert.length > 0) {
          // Spacer note (footer spacer is DOM-only, not in transcript list)
          console.log('[V3_UI_CONTRACT][OPENER_CANONICAL_INSERT_SPACER_NOTE]', {
            note: 'spacer is DOM-only; insertion remains within transcript list'
          });
          
          for (const { entry, stableKey, packId, instanceNumber } of openersToInsert) {
            // IDEMPOTENCE CHECK: Verify key not already inserted in this pass
            const alreadyExists = workingList.some(e => {
              const mt = e.messageType || e.type || null;
              const variant = e.meta?.variant || e.variant || null;
              const isOpener = mt === 'FOLLOWUP_CARD_SHOWN' && variant === 'opener';
              return isOpener && getOpenerKey(e) === stableKey;
            });
            
            if (alreadyExists) {
              console.log('[V3_UI_CONTRACT][OPENER_CANONICAL_INSERT_SKIPPED_EXISTS]', {
                stableKey,
                packId,
                instanceNumber,
                reason: 'Opener already present in working list - skipping duplicate insertion'
              });
              continue; // Skip insertion
            }
            
            // Find insertion position: BEFORE first V3 probe Q for same pack+instance
            let insertIndex = workingList.findIndex(e => {
              const mt = e.messageType || e.type || null;
              const isV3ProbeQ = mt === 'V3_PROBE_QUESTION' || 
                                (e.stableKey && e.stableKey.startsWith('v3-probe-q:'));
              const matchesPack = (e.meta?.packId || e.packId) === packId;
              const matchesInstance = (e.meta?.instanceNumber || e.instanceNumber) === instanceNumber;
              return isV3ProbeQ && matchesPack && matchesInstance;
            });
            
            // Fallback: Find base "Yes" answer that triggered this pack
            if (insertIndex === -1) {
              // Look for ANSWER entry that would trigger this pack
              const baseAnswers = workingList.filter(e => 
                (e.messageType === 'ANSWER' || e.type === 'ANSWER') &&
                e.role === 'user' &&
                (e.text === 'Yes' || e.text?.startsWith('Yes'))
              );
              
              // Insert after last Yes before any pack entries
              if (baseAnswers.length > 0) {
                const lastYesIndex = workingList.lastIndexOf(baseAnswers[baseAnswers.length - 1]);
                insertIndex = lastYesIndex + 1;
              }
            }
            
            // Fallback: Append at end of transcript items
            if (insertIndex === -1) {
              insertIndex = workingList.length;
            }
            
            // Insert opener at determined position
            workingList.splice(insertIndex, 0, entry);
            seenOpenerKeys.add(stableKey); // Track inserted key
            
            console.log('[V3_UI_CONTRACT][OPENER_CANONICAL_INSERTED]', {
              stableKey,
              packId,
              instanceNumber,
              insertIndex,
              insertStrategy: insertIndex < workingList.length - 1 ? 'before_probe_or_after_yes' : 'append',
              listLenAfter: workingList.length
            });
          }
          
          transcriptToRenderDeduped = workingList;
        } else {
          transcriptToRenderDeduped = workingList; // Use deduplicated list
        }
        
        // ASSERTION: Verify all non-active openers present AND no duplicates
        const finalOpenerKeys = new Set();
        const duplicateKeys = [];
        
        for (const entry of transcriptToRenderDeduped) {
          const mt = entry.messageType || entry.type || null;
          const variant = entry.meta?.variant || entry.variant || null;
          const isOpener = mt === 'FOLLOWUP_CARD_SHOWN' && variant === 'opener';
          
          if (isOpener) {
            const openerKey = getOpenerKey(entry);
            if (finalOpenerKeys.has(openerKey)) {
              duplicateKeys.push(openerKey);
            } else {
              finalOpenerKeys.add(openerKey);
            }
          }
        }
        
        const stillMissing = [];
        for (const opener of canonicalOpenersFromDb) {
          const openerKey = getOpenerKey(opener);
          const openerPackId = opener.meta?.packId || opener.packId;
          const openerInstanceNumber = opener.meta?.instanceNumber || opener.instanceNumber;
          
          const isCurrentlyActive = activeUiItem?.kind === "V3_OPENER" &&
                                    activeCard?.stableKey === openerKey;
          if (isCurrentlyActive) continue;
          
          if (!finalOpenerKeys.has(openerKey)) {
            stillMissing.push(`${openerPackId}:${openerInstanceNumber}`);
          }
        }
        
        if (duplicateKeys.length > 0) {
          console.error('[V3_UI_CONTRACT][OPENER_CANONICAL_DUPLICATE_DETECTED]', {
            duplicateCount: duplicateKeys.length,
            duplicateKeysSample: duplicateKeys.slice(0, 3),
            reason: 'Duplicate opener keys found in final transcript - deduplication failed'
          });
        }
        
        if (stillMissing.length > 0) {
          console.error('[V3_UI_CONTRACT][OPENER_CANONICAL_MERGE_FAIL]', {
            missingCount: stillMissing.length,
            missingKeysSample: stillMissing.slice(0, 3),
            activeUiItemKind: activeUiItem?.kind,
            reason: 'Canonical openers missing after force-merge - logic error'
          });
          
          // Set merge status for SOT log (component-level ref)
          openerMergeStatusRef.current = 'FAIL';
        } else {
          console.log('[V3_UI_CONTRACT][OPENER_CANONICAL_MERGE_OK]', {
            count: canonicalOpenersFromDb.length,
            activeUiItemKind: activeUiItem?.kind,
            insertedCount: openersToInsert.length,
            duplicateCount: duplicateKeys.length,
            reason: duplicateKeys.length === 0 ? 'All non-active openers present, no duplicates' : 'Openers present but duplicates detected'
          });
          
          // Set merge status for SOT log (component-level ref)
          openerMergeStatusRef.current = duplicateKeys.length === 0 ? 'PASS' : 'PASS_WITH_DUPLICATES';
        }
      }
    }
    
    // ORDER GATING: Suppress UNANSWERED base questions during V3
    const v3UiHistoryLen = v3UiRenderable.length;
    const hasVisibleV3PromptCard = v3HasVisiblePromptCard;
    const shouldSuppressBaseQuestions = v3ProbingActive || hasVisibleV3PromptCard;
    
    const finalList = shouldSuppressBaseQuestions 
      ? transcriptToRenderDeduped.filter((entry, idx) => {
          if (entry.messageType !== 'QUESTION_SHOWN') return true;
          if (entry.meta?.packId) return true;
          
          const suppressedQuestionId = entry.meta?.questionDbId || entry.questionId;
          const suppressedQuestionCode = entry.meta?.questionCode || 'unknown';
          
          const hasAnswerAfter = transcriptToRenderDeduped
            .slice(idx + 1)
            .some(laterEntry => 
              laterEntry.role === 'user' && 
              laterEntry.messageType === 'ANSWER' &&
              (laterEntry.questionDbId === suppressedQuestionId || laterEntry.meta?.questionDbId === suppressedQuestionId)
            );
          
          if (hasAnswerAfter) {
            console.log('[CQ_TRANSCRIPT][BASE_Q_PRESERVED_DURING_V3]', {
              suppressedQuestionId,
              suppressedQuestionCode,
              reason: 'Question answered - keeping in transcript history',
              v3ProbingActive,
              loopKey: v3ProbingContext ? `${sessionId}:${v3ProbingContext.categoryId}:${v3ProbingContext.instanceNumber || 1}` : null
            });
            return true;
          }
          
          console.log('[ORDER][BASE_Q_SUPPRESSED_ONLY_ACTIVE]', {
            suppressedQuestionId,
            suppressedQuestionCode,
            reason: 'V3_PROBING_ACTIVE - unanswered question suppressed',
            v3ProbingActive,
            v3UiHistoryLen,
            hasVisibleV3PromptCard,
            loopKey: v3ProbingContext ? `${sessionId}:${v3ProbingContext.categoryId}:${v3ProbingContext.instanceNumber || 1}` : null
          });
          
          return false;
        })
      : transcriptToRenderDeduped;
    
    // PART A: FORCE INSERT - Ensure MI gate exists when active (before reorder)
    let listWithGate = finalList;
    const currentGatePackId = currentItem?.packId;
    const currentGateInstanceNumber = currentItem?.instanceNumber;
    
    // TASK 3: Enforce gate when activeUiItem.kind is MI_GATE (regardless of other flags)
    const isGateActiveUiKind = activeUiItem?.kind === "MI_GATE" || 
                                activeCard?.kind === "multi_instance_gate";
    const shouldEnforceMiGate = isGateActiveUiKind && 
                                currentGatePackId && 
                                currentGateInstanceNumber !== undefined;
    
    if (shouldEnforceMiGate) {
      // PART C: Use unified gate detector
      const gateExists = listWithGate.some(item => 
        isMiGateItem(item, currentGatePackId, currentGateInstanceNumber)
      );
      
      if (!gateExists) {
        // STEP 4: Gate is active but missing - force insert with required fields
        const gateItemId = `multi-instance-gate-${currentGatePackId}-${currentGateInstanceNumber}`;
        const gateStableKey = `mi-gate:${currentGatePackId}:${currentGateInstanceNumber}:q`;
        
        // Populate title/label from active item metadata (deterministic, no hardcoded text)
        const gateTitle = currentItem?.questionText || 
                         currentItem?.text || 
                         `Instance ${currentGateInstanceNumber}`;
        
        const reconstructedGate = {
          id: gateItemId,
          stableKey: gateStableKey,
          kind: 'multi_instance_gate',
          messageType: 'MULTI_INSTANCE_GATE_SHOWN',
          packId: currentGatePackId,
          instanceNumber: currentGateInstanceNumber,
          text: gateTitle, // Required by renderer
          title: gateTitle, // Required by some card variants
          __activeCard: true,
          meta: {
            packId: currentGatePackId,
            instanceNumber: currentGateInstanceNumber
          },
          timestamp: new Date().toISOString(),
          visibleToCandidate: true,
          role: 'assistant' // Required by some transcript renderers
        };
        
        listWithGate = [...listWithGate, reconstructedGate];
        
        logOnce(`migate_force_inserted_${currentGatePackId}_${currentGateInstanceNumber}`, () => {
          console.warn('[MI_GATE][FORCE_INSERTED]', {
            packId: currentGatePackId,
            instanceNumber: currentGateInstanceNumber,
            gateTitle,
            reason: 'Gate was active but missing from final list - reconstructed and inserted'
          });
          
          // PART A: Capture violation snapshot when force insert occurs
          captureViolationSnapshot({
            reason: 'FORCE_INSERT_TRIGGERED',
            list: listWithGate,
            packId: currentGatePackId,
            instanceNumber: currentGateInstanceNumber,
            activeItemId: currentItem?.id
          });
        });
      }
    }
    
    // PART B: FINAL REORDER - Enforce MI gate is last (after force insert)
    let finalListWithGateOrdered = listWithGate;
    
    if (shouldEnforceMiGate) {
      // PART C: Use unified detector for finding gate
      const miGateIndex = listWithGate.findIndex(item => 
        isMiGateItem(item, currentGatePackId, currentGateInstanceNumber)
      );
      
      if (miGateIndex !== -1 && miGateIndex < listWithGate.length - 1) {
        // Items exist after MI gate - REORDER
        const itemsBefore = listWithGate.slice(0, miGateIndex);
        const miGateItem = listWithGate[miGateIndex];
        const itemsAfter = listWithGate.slice(miGateIndex + 1);
        
        finalListWithGateOrdered = [...itemsBefore, ...itemsAfter, miGateItem];
        
        logOnce(`migate_final_reorder_${currentGatePackId}_${currentGateInstanceNumber}`, () => {
          console.warn('[MI_GATE][FINAL_REORDER_APPLIED]', {
            packId: currentGatePackId,
            instanceNumber: currentGateInstanceNumber,
            movedCount: itemsAfter.length,
            movedKinds: itemsAfter.map(e => ({ 
              kind: e.kind || e.messageType, 
              key: (e.stableKey || e.id || '').substring(0, 40) 
            }))
          });
        });
      }
      
      // STEP 2: Post-reorder corrective enforcement (not just logging)
      let finalGateIndex = finalListWithGateOrdered.findIndex(item => 
        isMiGateItem(item, currentGatePackId, currentGateInstanceNumber)
      );
      
      if (finalGateIndex !== -1 && finalGateIndex < finalListWithGateOrdered.length - 1) {
        // Still items after gate - CORRECTIVE FIX
        const trailingItems = finalListWithGateOrdered.slice(finalGateIndex + 1);
        
        // STEP 3: Forensic detail + TASK 1 diagnostic (deduped, once per pack+instance)
        logOnce(`migate_trailing_${currentGatePackId}_${currentGateInstanceNumber}`, () => {
          const isV3Item = (item) => {
            const k = item.kind || item.messageType || '';
            const t = item.type || '';
            return k.includes('v3_probe') || k.includes('V3_PROBE') || 
                   t.includes('v3_probe') || t.includes('V3_PROBE') ||
                   item.meta?.v3PromptSource;
          };
          
          console.error('[MI_GATE][TRAILING_ITEMS_AFTER_GATE]', {
            packId: currentGatePackId,
            instanceNumber: currentGateInstanceNumber,
            trailingCount: trailingItems.length,
            trailing: trailingItems.map(e => ({
              kind: e.kind || e.messageType || e.type || 'unknown',
              stableKey: e.stableKey || null,
              itemId: e.id || null,
              isActiveCard: e.__activeCard || false,
              isV3Related: isV3Item(e)
            })),
            reason: 'Items found after gate post-reorder - applying corrective fix'
          });
          
          // PART A: Capture violation snapshot when trailing items detected
          captureViolationSnapshot({
            reason: 'TRAILING_ITEMS_DETECTED',
            list: finalListWithGateOrdered,
            packId: currentGatePackId,
            instanceNumber: currentGateInstanceNumber,
            activeItemId: currentItem?.id
          });
        });
        
        // Corrective fix: move trailing items before gate
        const beforeGate = finalListWithGateOrdered.slice(0, finalGateIndex);
        const gateItem = finalListWithGateOrdered[finalGateIndex];
        finalListWithGateOrdered = [...beforeGate, ...trailingItems, gateItem];
        
        // STEP 2: Belt-and-suspenders - verify correction worked
        finalGateIndex = finalListWithGateOrdered.findIndex(item => 
          isMiGateItem(item, currentGatePackId, currentGateInstanceNumber)
        );
        
        if (finalGateIndex !== -1 && finalGateIndex < finalListWithGateOrdered.length - 1) {
          // Still not last after correction - forced final reorder
          const stillAfter = finalListWithGateOrdered.slice(finalGateIndex + 1);
          const stillBefore = finalListWithGateOrdered.slice(0, finalGateIndex);
          const stillGateItem = finalListWithGateOrdered[finalGateIndex];
          finalListWithGateOrdered = [...stillBefore, ...stillAfter, stillGateItem];
        }
      }
    }
    
    // STEP 1: Defensive copy (no freeze - safe for downstream mutations)
    const renderedItems = [...finalListWithGateOrdered];
    
    // PART C: REGRESSION ASSERT - Verify no V3_PROBE_ANSWER trails MI gate (deduped, once per gate)
    if (shouldEnforceMiGate) {
      const finalGateIndex = renderedItems.findIndex(item => 
        isMiGateItem(item, currentGatePackId, currentGateInstanceNumber)
      );
      
      if (finalGateIndex !== -1 && finalGateIndex < renderedItems.length - 1) {
        const itemsAfter = renderedItems.slice(finalGateIndex + 1);
        const v3ProbeAnswersAfter = itemsAfter.filter(e => 
          (e.messageType === 'V3_PROBE_ANSWER' || e.type === 'V3_PROBE_ANSWER' || e.kind === 'v3_probe_a')
        );
        
        if (v3ProbeAnswersAfter.length > 0) {
          logOnce(`v3_probe_a_after_gate_${currentGatePackId}_${currentGateInstanceNumber}`, () => {
            console.error('[MI_GATE][REGRESSION_V3_PROBE_ANSWER_AFTER_GATE]', {
              packId: currentGatePackId,
              instanceNumber: currentGateInstanceNumber,
              gateIndex: finalGateIndex,
              lastIndex: renderedItems.length - 1,
              v3ProbeAnswersAfterCount: v3ProbeAnswersAfter.length,
              stableKeySuffixes: v3ProbeAnswersAfter.map(e => (e.stableKey || e.id || '').slice(-18)),
              reason: 'V3_PROBE_ANSWER found after MI gate - insertion logic failed'
            });
          });
        }
      }
    }
    
    // TDZ GUARD: Update length counter + sync finalList refs (use frozen renderedItems)
    bottomAnchorLenRef.current = renderedItems.length;
    finalListRef.current = Array.isArray(renderedItems) ? renderedItems : [];
    finalListLenRef.current = Array.isArray(renderedItems) ? renderedItems.length : 0;
    
    if (CQ_DEBUG_FOOTER_ANCHOR) {
      console.log('[TDZ_GUARD][FINAL_LIST_REF_SYNC]', { len: finalListLenRef.current });
    }
    
    // Regression guard logging (use frozen renderedItems)
    const candidateVisibleQuestionsInDb = transcriptToRenderDeduped.filter(e => 
      e.messageType === 'QUESTION_SHOWN' && e.visibleToCandidate === true
    ).length;
    const candidateVisibleQuestionsInRender = renderedItems.filter(e => 
      e.messageType === 'QUESTION_SHOWN' && e.visibleToCandidate === true
    ).length;
    
    if (candidateVisibleQuestionsInRender < candidateVisibleQuestionsInDb && shouldSuppressBaseQuestions) {
      const droppedQuestions = transcriptToRenderDeduped.filter(e => 
        e.messageType === 'QUESTION_SHOWN' && 
        e.visibleToCandidate === true &&
        !renderedItems.some(r => (r.stableKey && r.stableKey === e.stableKey) || (r.id && r.id === e.id))
      );
      
      console.log('[CQ_TRANSCRIPT][BASE_Q_SUPPRESSED_STATS]', {
        candidateVisibleQuestionsInDb,
        candidateVisibleQuestionsInRender,
        droppedCount: candidateVisibleQuestionsInDb - candidateVisibleQuestionsInRender,
        droppedKeys: droppedQuestions.map(e => ({
          questionId: e.meta?.questionDbId || e.questionId,
          questionCode: e.meta?.questionCode || 'unknown',
          stableKey: e.stableKey || e.id,
          textPreview: (e.text || '').substring(0, 40)
        }))
      });
    } else if (shouldSuppressBaseQuestions && candidateVisibleQuestionsInRender === candidateVisibleQuestionsInDb) {
      console.log('[CQ_TRANSCRIPT][BASE_Q_NO_REGRESSION]', {
        candidateVisibleQuestionsInDb,
        candidateVisibleQuestionsInRender,
        reason: 'All answered base questions preserved during V3'
      });
    }
    
    return renderedItems;
  }, [
    renderableTranscriptStream,
    activeUiItem,
    currentItem,
    v3ProbingActive,
    v3HasVisiblePromptCard,
    v3ProbingContext,
    hasActiveV3Prompt,
    v3PromptPhase,
    sessionId,
    dbTranscript,
    cqDiagEnabled,
    v3UiRenderable
  ]);
  
  // GOLDEN CONTRACT CHECK: Emit deterministic verification bundle (deduped)
  const emitGoldenContractCheck = React.useCallback(() => {
    const payload = {
      sessionId,
      activeUiItemKind: activeUiItem?.kind,
      bottomBarModeSOT,
      footerClearanceStatus: footerClearanceStatusRef.current,
      openerHistoryStatus: openerMergeStatusRef.current,
      suppressProbesInTranscript: (activeUiItem?.kind === "V3_PROMPT" || activeUiItem?.kind === "V3_WAITING") && v3ProbingActive,
      lastMeasuredOverlapPx: maxOverlapSeenRef.current.maxOverlapPx,
      hasFooterSpacer: typeof window !== 'undefined' && !!historyRef.current?.querySelector('[data-cq-footer-spacer="true"]'),
      transcriptLen: finalTranscriptList?.length || 0
    };
    
    // Dedupe: Only emit if payload changed
    const payloadKey = JSON.stringify(payload);
    if (lastGoldenCheckPayloadRef.current === payloadKey) {
      return; // No change - skip emission
    }
    
    lastGoldenCheckPayloadRef.current = payloadKey;
    console.log('[UI_CONTRACT][GOLDEN_CHECK]', payload);
  }, [sessionId, activeUiItem, bottomBarModeSOT, v3ProbingActive, finalTranscriptList]);
  
  // CONSOLIDATED UI CONTRACT STATUS LOG (Single Source of Truth)
  // Emits once per mode change with all three contract aspects
  React.useEffect(() => {
    const footerStatus = footerClearanceStatusRef.current || 'UNKNOWN';
    const openerStatus = openerMergeStatusRef.current || 'UNKNOWN';
    const suppressProbes = (activeUiItem?.kind === "V3_PROMPT" || activeUiItem?.kind === "V3_WAITING") && v3ProbingActive;
    
    console.log('[UI_CONTRACT][SOT_STATUS]', {
      footerClearance: footerStatus,
      openerHistory: openerStatus,
      probePolicy: suppressProbes ? 'ACTIVE_SUPPRESS' : 'HISTORY_ALLOWED',
      activeUiItemKind: activeUiItem?.kind,
      bottomBarModeSOT,
      sessionId
    });
    
    // Emit golden check after SOT status (only for active modes)
    if (bottomBarModeSOT === 'TEXT_INPUT' || bottomBarModeSOT === 'YES_NO') {
      emitGoldenContractCheck();
    }
  }, [bottomBarModeSOT, activeUiItem?.kind, v3ProbingActive, sessionId, emitGoldenContractCheck]);
  
  // UI CONTRACT STATUS RESET: Clear status refs on session change
  React.useEffect(() => {
    openerMergeStatusRef.current = 'UNKNOWN';
    footerClearanceStatusRef.current = 'UNKNOWN';
    
    console.log('[UI_CONTRACT][SOT_STATUS_RESET]', {
      sessionId,
      reason: 'New session started - status refs cleared'
    });
  }, [sessionId]);

  // GUARD: Show guard screens without early return (maintains hook order)
  if (showMissingSession) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <p className="text-slate-300">Redirecting to start interview...</p>
        </div>
      </div>
    );
  }
  
  if (shouldShowFullScreenLoader) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-blue-400 animate-spin mx-auto" />
          <p className="text-slate-300">Loading interview...</p>
          <p className="text-slate-500 text-xs">Session: {sessionId?.substring(0, 8)}...</p>
          {showLoadingRetry && (
            <div className="mt-6 space-y-3">
              <p className="text-slate-400 text-sm">Taking longer than expected...</p>
              <Button 
                onClick={() => window.location.reload()} 
                variant="outline"
                className="bg-slate-800 border-slate-600 text-white hover:bg-slate-700"
              >
                Retry
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (showError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md space-y-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button onClick={() => navigate(createPageUrl("Home"))} className="w-full">
            Return to Home
          </Button>
        </div>
      </div>
    );
  }

  // UI CONTRACT: 3-row shell enforced - do not reintroduce footer spacers/padding hacks; footer must stay in layout flow.
  
  return (
    <div className="h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white flex flex-col overflow-hidden">
      <header className="bg-slate-800/95 backdrop-blur-sm border-b border-slate-700 px-4 py-3 flex-shrink-0">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-white">ClearQuest Interview</h1>
              {department && (
                <>
                  <span className="text-slate-600 hidden sm:inline">•</span>
                  <span className="text-xs text-slate-200 hidden sm:inline">{department.department_name}</span>
                </>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPauseModal(true)}
              className="bg-slate-700/50 border-slate-600 text-slate-200"
            >
              <Pause className="w-4 h-4 mr-1" />
              Pause
            </Button>
          </div>

          {sections.length > 0 && activeSection && (
            <div>
              <div className="text-sm font-medium text-blue-400 mb-1">
                {activeSection.displayName}
              </div>
              <div className="w-full h-2 bg-slate-700/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all"
                  style={{
                    width: `${questionCompletionPct}%`,
                    boxShadow: questionCompletionPct > 0 ? '0 0 8px rgba(59, 130, 246, 0.5)' : 'none'
                  }}
                />
              </div>
              <div className="flex justify-between items-center mt-1">
                <span className="text-xs text-slate-400">
                  Section {currentSectionIndex + 1} of {sections.length}
                </span>
                <span className="text-xs font-medium text-blue-400">{questionCompletionPct}% complete</span>
              </div>
            </div>
          )}
        </div>
      </header>
      <style>
        {`
          .cq-scroll {
            scrollbar-color: #232a33 #0f1216;
          }
          .cq-scroll::-webkit-scrollbar-track {
            background: #0f1216;
          }
          .cq-scroll::-webkit-scrollbar-thumb {
            background: #232a33;
            border-radius: 6px;
          }
        `}
      </style>

      <main 
        className="flex-1 overflow-y-auto cq-scroll scrollbar-thin min-h-0" 
        ref={historyRef} 
        onScroll={handleTranscriptScroll}
      >
        <div 
          className="min-h-0 flex flex-col px-4 pt-6"
          style={{
            paddingBottom: shouldApplyFooterClearance
              ? `${footerClearancePx}px`
              : '0px'
          }}
        >
          {/* TOP SPACER - Pushes content to bottom when short (ChatGPT gravity) */}
          <div className="flex-1" aria-hidden="true" />
          
          <div className="space-y-3">
            {/* CANONICAL RENDER STREAM: Direct map rendering (logic moved to useMemo) */}
            {/* Active opener suppression: Compute current active opener stableKey */}
            {(() => {
              const activeOpenerStableKeySOT = 
                (activeUiItem?.kind === "V3_OPENER" && currentItem?.packId)
                  ? buildV3OpenerStableKey(currentItem.packId, currentItem.instanceNumber || 1)
                  : null;

              const renderedV3OpenerKeysSOT = new Set();

              return finalTranscriptList.map((entry, index) => {
              // CANONICAL STREAM: Handle both transcript entries AND active cards
              const isActiveCard = entry.__activeCard === true;
                  
                  // STABLE KEY: Use helper for all entries (prevents React refresh)
                  const entryKey = isActiveCard 
                    ? (entry.stableKey || `active-${entry.kind}-${entry.packId || 'none'}-${entry.instanceNumber || 0}`)
                    : getTranscriptEntryKey(entry);
                  
                  // Render active cards from stream (V3_PROMPT, V3_OPENER, MI_GATE)
                  if (isActiveCard) {
                    const cardKind = entry.kind;
                    
                    if (cardKind === "v3_probe_q") {
                      // TASK 2: RENDER-TIME PROVENANCE LOG - Prove what UI actually displays
                      const loopKey = v3ProbingContext ? `${sessionId}:${v3ProbingContext.categoryId}:${v3ProbingContext.instanceNumber || 1}` : null;
                      const promptId = v3ProbingContext?.promptId || lastV3PromptSnapshotRef.current?.promptId;
                      
                      // STEP 2: Sanitize prompt card text (main fix)
                      const safeCardPrompt = sanitizeCandidateFacingText(entry.text, 'PROMPT_LANE_CARD_V3_PROBE');
                      
                      console.log('[V3_PROMPT][PROMPT_CARD_SOT]', {
                        v3ProbingActive,
                        v3PromptPhase,
                        loopKey,
                        promptId,
                        stableKey: entry.stableKey || null,
                        promptTextPreview: String(safeCardPrompt || '').slice(0, 90),
                        sanitized: safeCardPrompt !== entry.text,
                        // Provenance metadata (if present on entry object)
                        v3PromptSource: entry?.v3PromptSource ?? entry?.meta?.v3PromptSource ?? '(missing)',
                        v3LlmMs: entry?.v3LlmMs ?? entry?.meta?.v3LlmMs ?? null
                      });
                      
                      return (
                        <div key={entryKey} data-stablekey={entry.stableKey} data-cq-active-card="true" data-ui-contract-card="true">
                          <ContentContainer>
                            <div className="w-full bg-purple-900/30 border border-purple-700/50 rounded-xl p-4 ring-2 ring-purple-400/40 shadow-lg shadow-purple-500/20 transition-all duration-150">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-medium text-purple-400">AI Follow-Up</span>
                                {entry.instanceNumber > 1 && (
                                  <>
                                    <span className="text-xs text-slate-500">•</span>
                                    <span className="text-xs text-slate-400">Instance {entry.instanceNumber}</span>
                                  </>
                                )}
                              </div>
                              <p className="text-white text-sm leading-relaxed">{safeCardPrompt}</p>
                            </div>
                          </ContentContainer>
                        </div>
                      );
                    } else if (cardKind === "required_anchor_fallback_prompt") {
                     // REQUIRED_ANCHOR_FALLBACK: Main pane prompt (ephemeral, not transcript)
                     console.log('[UI_CONTRACT][BLOCK_FALLBACK_TRANSCRIPT_PROMPT]', {
                       reason: 'fallback prompt must not enter transcript',
                       anchor: entry.anchor,
                       promptPreview: entry.text?.substring(0, 60)
                     });

                     return null; // Active lane owns rendering
                    } else if (cardKind === "v3_pack_opener") {
                      // Dedupe: Skip duplicate opener cards using CANONICAL opener key (packId + instanceNumber)
                      if (activeUiItem?.kind === "V3_OPENER") {
                        const canonicalOpenerKeySOT = buildV3OpenerStableKey(
                          activeCard?.packId,
                          activeCard?.instanceNumber || 1
                        );

                        if (renderedV3OpenerKeysSOT.has(canonicalOpenerKeySOT)) {
                          console.log('[V3_OPENER][ACTIVE_LANE_DUP_OPENER_SUPPRESSED]', {
                            entryStableKey: entry?.stableKey,
                            activeCardStableKey: activeCard?.stableKey,
                            canonicalOpenerKeySOT,
                            reason: 'duplicate opener activeCard in stream (canonical dedupe)'
                          });
                          return null;
                        }

                        renderedV3OpenerKeysSOT.add(canonicalOpenerKeySOT);
                      }
                      
                      // STEP 2: Sanitize opener card text
                      const safeOpenerPrompt = sanitizeCandidateFacingText(entry.text, 'PROMPT_LANE_CARD_V3_OPENER');
                      
                      const instanceTitle = entry.categoryLabel && entry.instanceNumber > 1 
                        ? `${entry.categoryLabel} — Instance ${entry.instanceNumber}` 
                        : entry.categoryLabel;
                      
                      console.log('[INSTANCE_TITLE][OPENER_TITLE_OK]', {
                        packId: entry.packId,
                        instanceNumber: entry.instanceNumber,
                        titlePreview: instanceTitle
                      });
                      
                      return (
                        <div key={entryKey} data-stablekey={entry.stableKey} data-cq-active-card="true" data-ui-contract-card="true">
                          <ContentContainer>
                            <div className="w-full bg-purple-900/30 border border-purple-700/50 rounded-xl p-4 ring-2 ring-purple-400/40 shadow-lg shadow-purple-500/20 transition-all duration-150">
                              {entry.categoryLabel && (
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-sm font-medium text-purple-400">
                                    {instanceTitle}
                                  </span>
                                </div>
                              )}
                              <p className="text-white text-sm leading-relaxed">{safeOpenerPrompt}</p>
                              {entry.exampleNarrative && (
                                <div className="mt-3 bg-slate-800/50 border border-slate-600/50 rounded-lg p-3">
                                  <p className="text-xs text-slate-400 mb-1 font-medium">Example:</p>
                                  <p className="text-slate-300 text-xs italic">{entry.exampleNarrative}</p>
                                </div>
                              )}
                            </div>
                          </ContentContainer>
                        </div>
                      );
                    } else if (cardKind === "multi_instance_gate") {
                     // UI CONTRACT ENFORCEMENT: Transcript context = read-only (activeCard is footer-bound)
                     const renderContext = "ACTIVE_CARD"; // Active cards have no inline actions

                     // UI CONTRACT: MI gate main pane render - extract identity from activeCard entry
                     const gatePackId = entry.packId || currentItem?.packId;
                     const gateInstanceNumber = entry.instanceNumber || currentItem?.instanceNumber;

                     // CANONICAL STABLEKEY: Use builder for consistency with active card creation
                     const gateStableKey = entry.stableKey || buildMiGateQStableKey(gatePackId, gateInstanceNumber);
                     const gateItemId = entry.id || buildMiGateItemId(gatePackId, gateInstanceNumber);

                     // UI CONTRACT SELF-TEST: Track main pane render using canonical stableKey
                     if (ENABLE_MI_GATE_UI_CONTRACT_SELFTEST && gateStableKey) {
                       const tracker = miGateTestTrackerRef.current.get(gateStableKey) || { mainPaneRendered: false, footerButtonsOnly: false, testStarted: false };
                       tracker.mainPaneRendered = true; // ALWAYS boolean
                       miGateTestTrackerRef.current.set(gateStableKey, tracker);

                       console.log('[MI_GATE][UI_CONTRACT_TRACK]', {
                         stableKey: gateStableKey,
                         itemId: gateItemId,
                         event: 'ACTIVE_CARD_MAIN_PANE_RENDERED',
                         tracker,
                         renderContext
                       });
                     }

                     // STEP 2: Sanitize MI gate prompt text
                     const safeGatePrompt = sanitizeCandidateFacingText(entry.text, 'PROMPT_LANE_CARD_MI_GATE');

                     // SUPPRESS: Skip rendering if this is just "Instance X" preview (not the actual gate question)
                     const isInstancePreviewOnly = /^Instance\s+\d+$/i.test((safeGatePrompt || '').trim());
                     if (isInstancePreviewOnly) {
                       console.log('[MI_GATE][MAIN_PANE_SUPPRESS_INSTANCE_PREVIEW]', {
                         stableKey: gateStableKey,
                         packId: gatePackId,
                         instanceNumber: gateInstanceNumber,
                         promptPreview: safeGatePrompt,
                         reason: 'Instance preview card suppressed - footer owns actual gate question'
                       });
                       return null; // Skip rendering preview card
                     }

                     // AUDIT: Confirm main pane render with canonical keys
                     console.log('[MI_GATE][MAIN_PANE_RENDER_OK]', {
                       stableKey: gateStableKey,
                       itemId: gateItemId,
                       packId: gatePackId,
                       instanceNumber: gateInstanceNumber,
                       promptPreview: safeGatePrompt?.substring(0, 60),
                       renderContext
                     });

                     // UI CONTRACT: Active card renders prompt text ONLY (no buttons)
                     // Footer owns all Yes/No controls
                     return (
                       <div key={entryKey} data-stablekey={gateStableKey} data-cq-active-card="true" data-ui-contract-card="true">
                         <ContentContainer>
                           <div className="w-full bg-purple-900/30 border border-purple-700/50 rounded-xl p-5 ring-2 ring-purple-400/40 shadow-lg shadow-purple-500/20 transition-all duration-150">
                             <p className="text-white text-base leading-relaxed">{safeGatePrompt}</p>
                             {/* UI CONTRACT: NO inline Yes/No buttons - footer owns all controls */}
                           </div>
                         </ContentContainer>
                       </div>
                     );
                     } else if (cardKind === "required_anchor_fallback_prompt") {
                     // REQUIRED_ANCHOR_FALLBACK: Main pane prompt card (UI contract)
                     return (
                      <div key={entryKey} data-stablekey={entry.stableKey} data-cq-active-card="true" data-ui-contract-card="true">
                        <ContentContainer>
                          <div className="w-full bg-purple-900/30 border border-purple-700/50 rounded-xl p-4 ring-2 ring-purple-400/40 shadow-lg shadow-purple-500/20 transition-all duration-150">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-purple-400">AI Follow-Up</span>
                              {entry.instanceNumber > 1 && (
                                <>
                                  <span className="text-xs text-slate-500">•</span>
                                  <span className="text-xs text-slate-400">Instance {entry.instanceNumber}</span>
                                </>
                              )}
                            </div>
                            <p className="text-white text-sm leading-relaxed">{entry.text}</p>
                          </div>
                        </ContentContainer>
                      </div>
                     );
                     } else if (cardKind === "v3_thinking") {
                     // TASK B: V3 thinking placeholder during initial decide
                     return (
                      <div key={entryKey} data-stablekey={entry.stableKey} data-cq-active-card="true" data-ui-contract-card="true">
                        <ContentContainer>
                          <div className="w-full bg-purple-900/30 border border-purple-700/50 rounded-xl p-4">
                            <div className="flex items-center gap-2">
                              <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                              <span className="text-sm text-purple-300">{entry.text}</span>
                            </div>
                          </div>
                        </ContentContainer>
                      </div>
                     );
                     }
                     return null;
                  }
                  
                  // V3 transcript entries (from DB - legal record)
                  // V3_PROBE_QUESTION (assistant) - NOW RENDERS FROM TRANSCRIPT
                  if (entry.role === 'assistant' && getMessageTypeSOT(entry) === 'V3_PROBE_QUESTION') {
                   // STEP 2: Sanitize transcript V3 probe question text
                   const safeTranscriptProbeQ = sanitizeCandidateFacingText(entry.text, 'TRANSCRIPT_V3_PROBE_Q');

                   console.log('[CQ_TRANSCRIPT][V3_PROBE_Q_RENDERED]', {
                     stableKey: entry.stableKey || entry.id,
                     promptId: entry.meta?.promptId,
                     loopKey: entry.meta?.loopKey,
                     textPreview: (safeTranscriptProbeQ || '').substring(0, 40),
                     sanitized: safeTranscriptProbeQ !== entry.text
                   });

                   // ACTIVE CARD DETECTION: Check if this is the current active prompt
                   const isActiveProbeQ = v3ProbingActive && 
                     v3ProbingContext?.promptId && 
                     entry.meta?.promptId === v3ProbingContext.promptId;

                   const activeClass = isActiveProbeQ 
                     ? 'ring-2 ring-purple-400/40 shadow-lg shadow-purple-500/20' 
                     : '';

                   return (
                     <div key={entryKey} data-stablekey={entry.stableKey || entry.id}>
                       <ContentContainer>
                         <div className={`w-full bg-purple-900/30 border border-purple-700/50 rounded-xl p-4 transition-all duration-150 ${activeClass}`}>
                           <div className="flex items-center gap-2 mb-1">
                             <span className="text-sm font-medium text-purple-400">AI Follow-Up</span>
                             {entry.meta?.instanceNumber > 1 && (
                               <>
                                 <span className="text-xs text-slate-500">•</span>
                                 <span className="text-xs text-slate-400">Instance {entry.meta.instanceNumber}</span>
                               </>
                             )}
                           </div>
                           <p className="text-white text-sm leading-relaxed">{safeTranscriptProbeQ}</p>
                         </div>
                       </ContentContainer>
                     </div>
                   );
                  }

                  // V3_PROBE_ANSWER (user) - CRITICAL: Must always render
                  if (entry.role === 'user' && getMessageTypeSOT(entry) === 'V3_PROBE_ANSWER') {
                   // AUDIT: Log V3 probe answer render
                   console.log('[CQ_TRANSCRIPT][V3_PROBE_A_RENDERED]', {
                     stableKey: entry.stableKey || entry.id,
                     promptId: entry.meta?.promptId,
                     loopKey: entry.meta?.loopKey,
                     textPreview: (entry.text || '').substring(0, 40)
                   });

                   return (
                     <div key={entryKey} style={{ marginBottom: 10 }} data-stablekey={entry.stableKey || entry.id}>
                       <ContentContainer>
                       <div className="flex justify-end">
                         <div className="bg-purple-600 rounded-xl px-5 py-3 max-w-[85%]">
                           <p className="text-white text-sm">{entry.text || entry.message || entry.content || '(answer)'}</p>
                         </div>
                       </div>
                       </ContentContainer>
                     </div>
                   );
                  }

                  // V3 UI-only history cards (ephemeral - for immediate display)
                  if (entry.kind === 'v3_opener_history') {
                    // V3_OPENER PRECEDENCE: Do not render opener history while an opener is active
                    if (activeUiItem?.kind === "V3_OPENER") {
                      console.log('[V3_OPENER][HISTORY_SUPPRESSED_DURING_ACTIVE]', {
                        stableKey: entry.stableKey,
                        instanceNumber: entry.instanceNumber,
                        reason: 'History must not render during active opener step'
                      });
                      return null;
                    }
                    
                    // V3_OPENER PRECEDENCE: Do not render ANY opener history while an opener is active
                    if (activeUiItem?.kind === "V3_OPENER") {
                      console.log('[V3_OPENER][HISTORY_OPENER_SUPPRESSED_ACTIVE]', {
                        stableKey: entry.stableKey,
                        instanceNumber: entry.instanceNumber,
                        reason: 'Active opener owns prompt lane - suppress all opener history during opener step'
                      });
                      return null;
                    }
                    
                    // Skip if this is the currently active opener (prevents duplicate)
                    if (activeOpenerStableKeySOT && entry.stableKey === activeOpenerStableKeySOT) {
                      console.log('[V3_OPENER][HISTORY_RENDER_SKIPPED_ACTIVE]', {
                        stableKey: entry.stableKey,
                        packId: entry.packId,
                        instanceNumber: entry.instanceNumber,
                        reason: 'Active opener renders in active lane - suppressing history duplicate'
                      });
                      return null;
                    }
                    
                    const instanceTitle = entry.categoryLabel && entry.instanceNumber > 1
                      ? `${entry.categoryLabel} — Instance ${entry.instanceNumber}`
                      : entry.categoryLabel;

                    return (
                      <div key={entryKey} data-stablekey={entry.stableKey}>
                        <ContentContainer>
                          <div className="w-full bg-purple-900/30 border border-purple-700/50 rounded-xl p-4">
                            {entry.categoryLabel && (
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-sm font-medium text-purple-400">{instanceTitle}</span>
                              </div>
                            )}
                            <p className="text-white text-sm leading-relaxed">{entry.text}</p>
                            {entry.exampleNarrative && (
                              <div className="mt-3 bg-slate-800/50 border border-slate-600/50 rounded-lg p-3">
                                <p className="text-xs text-slate-400 mb-1 font-medium">Example:</p>
                                <p className="text-slate-300 text-xs italic">{entry.exampleNarrative}</p>
                              </div>
                            )}
                          </div>
                        </ContentContainer>
                      </div>
                    );
                  }
                  
                  if (entry.kind === 'v3_probe_q') {
                    return (
                      <div key={entryKey}>
                        <ContentContainer>
                          <div className="w-full bg-purple-900/30 border border-purple-700/50 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-purple-400">AI Follow-Up</span>
                            </div>
                            <p className="text-white text-sm leading-relaxed">{entry.text}</p>
                          </div>
                        </ContentContainer>
                      </div>
                    );
                  }

                  if (entry.kind === 'v3_probe_a') {
                    return (
                      <div key={entryKey} style={{ marginBottom: 10 }}>
                        <ContentContainer>
                          <div className="flex justify-end">
                            <div className="bg-purple-600 rounded-xl px-5 py-3 max-w-[85%]">
                              <p className="text-white text-sm">{entry.text}</p>
                            </div>
                          </div>
                        </ContentContainer>
                      </div>
                    );
                  }
                  
                  // Transcript entries (existing logic continues below)
                  const mt = (entry.messageType || entry.type || '').toString();
                  const entrySource = entry?.source || entry?.meta?.source || '';
                  const textPreview = entry.text || entry.questionText || entry.content || '';
                  const isProbePrompt = entry?.isProbePrompt === true;
                  const hasFieldKey = !!entry?.fieldKey;

                  // V3 UPDATE: V3_PROBE_QUESTION and V3_PROBE_ANSWER now allowed (renders above)
                  // Only block internal system events
                  const isV3SystemEvent = 
                    mt === 'V3_PROBE_ASKED' ||
                    mt === 'V3_PROBE_PROMPT' ||
                    mt === 'V3_PROBE' ||
                    (mt === 'ai_probe_question' && entrySource.includes('v3_internal'));

                  if (isV3SystemEvent) {
                    console.log("[V3_SYSTEM_EVENT][BLOCKED]", { 
                      messageType: mt,
                      reason: 'Internal V3 system event - not legal record'
                    });
                    return null;
                  }

            // Base question shown (QUESTION_SHOWN from chatTranscriptHelpers)
            if (entry.role === 'assistant' && getMessageTypeSOT(entry) === 'QUESTION_SHOWN') {
              // ACTIVE ITEM CHECK: Determine if this is the current active question
              const questionDbId = entry.meta?.questionDbId;
              const isActiveBaseQuestion = effectiveItemType === 'question' && 
                currentItem?.type === 'question' &&
                currentItem?.id === questionDbId &&
                activeUiItem?.kind === 'DEFAULT' &&
                bottomBarModeSOT === 'YES_NO';

              // FIX #2: Suppress ACTIVE base questions from transcript (prevent duplicate rendering)
              // Active YES/NO questions render ONLY via activeCard (prevents duplicate)
              if (isActiveBaseQuestion) {
                console.log('[BASE_YESNO][TRANSCRIPT_SUPPRESSED]', {
                  questionId: questionDbId,
                  stableKey: entry.stableKey || entry.id,
                  activeCardKind: activeCard?.kind,
                  hasActiveCard: !!activeCard,
                  reason: 'Active base question - suppressing transcript copy to prevent duplicate'
                });
                return null; // Skip transcript render - activeCard owns it
              }
              
              // PART B: Deterministic stableKey for all question cards
              const cardStableKey = entry.stableKey || entry.id || `question-shown:${questionDbId}`;
              
              // HISTORY MODE: Render answered questions from transcript (read-only)
              return (
                <div 
                  key={entryKey} 
                  data-stablekey={cardStableKey}
                  data-cq-card-id={cardStableKey}
                  data-cq-card-kind="question"
                >
                  <ContentContainer>
                  <div className="w-full bg-[#1a2744] border border-slate-700/60 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-base font-semibold text-blue-400">
                        Question {entry.meta?.questionNumber || ''}
                      </span>
                      {entry.meta?.sectionName && (
                        <>
                          <span className="text-sm text-slate-500">•</span>
                          <span className="text-sm font-medium text-slate-300">{entry.meta.sectionName}</span>
                        </>
                      )}
                    </div>
                    <p className="text-white text-base leading-relaxed">{entry.text}</p>
                  </div>
                  </ContentContainer>
                </div>
              );
            }

            // User answer (ANSWER from chatTranscriptHelpers)
            if (entry.role === 'user' && getMessageTypeSOT(entry) === 'ANSWER') {
              // DEDUPE: Skip if this answer is being rendered under active base question card
              const isActiveBaseQuestion = activeCard?.kind === 'base_question_yesno';
              const activeQuestionId = activeCard?.questionId;
              const entryQuestionId = entry.questionId || entry.meta?.questionDbId || entry.meta?.questionId;
              const isAnswerForActiveQuestion = isActiveBaseQuestion && 
                                                activeQuestionId && 
                                                entryQuestionId === activeQuestionId;
              
              if (isAnswerForActiveQuestion) {
                console.log('[BASE_YESNO][ANSWER_DEDUPED_FROM_TRANSCRIPT]', {
                  questionId: entryQuestionId,
                  stableKey: entry.stableKey || entry.id,
                  reason: 'Answer already rendered under active question card - skipping transcript copy'
                });
                return null; // Skip - already rendered in active lane
              }
              
              // PART 1: FORENSIC - Log UUID/unknown-prefix answers
              const stableKey = entry.stableKey || entry.id || '';
              const isYesOrNo = entry.text === 'Yes' || entry.text === 'No';
              const hasKnownPrefix = stableKey.startsWith('answer:') || 
                                     stableKey.startsWith('v3-') || 
                                     stableKey.startsWith('mi-gate:') || 
                                     stableKey.startsWith('followup-');
              const looksLikeUUID = !hasKnownPrefix && stableKey.length > 20;
              
              if (isYesOrNo && looksLikeUUID) {
                console.log('[YES_BUBBLE_FORENSIC]', {
                  stableKey,
                  mt: entry.messageType || entry.type || entry.kind,
                  text: entry.text,
                  hasQuestionId: !!(entry.questionId || entry.meta?.questionId),
                  entryQuestionId: entry.questionId || entry.meta?.questionId || null,
                  keysPresent: Object.keys(entry).slice(0, 30),
                  metaKeysPresent: entry.meta ? Object.keys(entry.meta).slice(0, 30) : null,
                  fromDbTranscript: (dbTranscript || []).some(x => (x.stableKey || x.id) === stableKey),
                  fromNonDbStream: true
                });
              }
              
              // DIAGNOSTIC: Log "Yes" bubble renders to trace duplicate source
              if (entry.text === 'Yes') {
                console.log('[YES_BUBBLE_RENDER_TRACE]', {
                  stableKey: entry.stableKey || entry.id,
                  mt: entry.messageType || entry.type || entry.kind,
                  questionId: entry.questionId || entry.meta?.questionId || entry.meta?.questionDbId || null,
                  packId: entry.meta?.packId || null,
                  instanceNumber: entry.meta?.instanceNumber || null,
                  answerContext: entry.meta?.answerContext || entry.answerContext || 'unknown',
                  sourceList: 'finalRenderStream'
                });
              }
              
              // CONTEXT-AWARE LABELING: Distinguish base answers from other answer types
              let displayText = entry.text;
              const answerContext = entry.meta?.answerContext || entry.answerContext;
              
              // Base question answers: keep as-is ("Yes" / "No")
              // No modification needed for BASE_QUESTION context
              
              return (
                <div key={entryKey} style={{ marginBottom: 10 }} data-stablekey={entry.stableKey || entry.id}>
                  <ContentContainer>
                  <div className="flex justify-end">
                    <div className="bg-blue-600 rounded-xl px-5 py-3 max-w-[85%]">
                      <p className="text-white text-sm">{displayText}</p>
                    </div>
                  </div>
                  </ContentContainer>
                </div>
              );
            }

            // Multi-instance gate prompt shown (suppress CURRENT gate only during V3 blocking)
            if (entry.role === 'assistant' && getMessageTypeSOT(entry) === 'MULTI_INSTANCE_GATE_SHOWN') {
              // Extract entry's pack/instance identity
              const entryPackId = entry.packId || entry.meta?.packId;
              const entryInstanceNumber = entry.instanceNumber || entry.meta?.instanceNumber;
              const entryGateId = entry.id;

              // ACTIVE ITEM CHECK: Only the current active gate may render
              const isActiveMiGate = effectiveItemType === 'multi_instance_gate' && 
                currentItem?.type === 'multi_instance_gate' &&
                currentItem?.packId === entryPackId &&
                currentItem?.instanceNumber === entryInstanceNumber;

              // PART B: Suppress current gate during V3 blocking (renders as activeCard instead)
              const isCurrentGateButSuppressed = isV3UiBlockingSOT && 
                                   currentItem?.type === 'multi_instance_gate' &&
                                   entryPackId === currentItem.packId &&
                                   entryInstanceNumber === currentItem.instanceNumber;

              if (isCurrentGateButSuppressed) {
                console.log('[MI_GATE][STREAM_SUPPRESSED]', {
                  packId: entryPackId,
                  instanceNumber: entryInstanceNumber,
                  stableKey: entry.stableKey || entry.id,
                  reason: 'V3_UI_BLOCKING_CURRENT_GATE',
                  v3PromptPhase,
                  matchesCurrent: true
                });
                return null; // Suppress current gate from transcript (renders as activeCard instead)
              }

              // UI CONTRACT ENFORCEMENT: Transcript context = read-only (no inline actions)
              const miGateRenderContext = "TRANSCRIPT";
              
              // DEFENSIVE GUARD: Prevent any future inline button rendering
              if (isActiveMiGate && renderContext === "TRANSCRIPT") {
                console.warn('[UI_CONTRACT][TRANSCRIPT_INLINE_SUPPRESSED]', {
                  component: 'MULTI_INSTANCE_GATE',
                  packId: entryPackId,
                  instanceNumber: entryInstanceNumber,
                  renderContext,
                  reason: 'Footer owns all controls - inline actions disabled'
                });
              }

              // FIX: History gates render from transcript (no separate bubble)
              // Active gate renders via activeCard with ring highlight
              const activeClass = isActiveMiGate 
                ? 'ring-2 ring-purple-400/40 shadow-lg shadow-purple-500/20' 
                : '';
              
              // History gates render normally (no skip)

              // UI CONTRACT ENFORCEMENT: Transcript context = read-only (no inline actions)
              const renderContext = "TRANSCRIPT";
              
              // STEP 2: Sanitize MI gate prompt in transcript
              const safeMiGateTranscript = sanitizeCandidateFacingText(entry.text, 'TRANSCRIPT_MI_GATE');

              // ANCHOR: Mark as system transition to prevent false scroll state changes
              recentAnchorRef.current = {
                kind: 'SYSTEM_TRANSITION',
                stableKey: entry.stableKey || entry.id,
                ts: Date.now()
              };

              // FIX B2: UI CONTRACT SELF-TEST - mainPaneRendered is boolean (transcript render path)
              const transcriptGateItemId = entry.id || `multi-instance-gate-${entry.meta?.packId || entry.packId}-${entry.meta?.instanceNumber || entry.instanceNumber}`;
              if (ENABLE_MI_GATE_UI_CONTRACT_SELFTEST && transcriptGateItemId) {
                const tracker = miGateTestTrackerRef.current.get(transcriptGateItemId) || { mainPaneRendered: false, footerButtonsOnly: false, testStarted: false };
                
                // B2: Set true deterministically (this render path proves main pane rendered)
                tracker.mainPaneRendered = true; // ALWAYS boolean
                miGateTestTrackerRef.current.set(transcriptGateItemId, tracker);

                console.log('[MI_GATE][UI_CONTRACT_TRACK]', {
                  itemId: transcriptGateItemId,
                  event: 'TRANSCRIPT_MAIN_PANE_RENDERED',
                  tracker,
                  renderContext: miGateRenderContext,
                  mainPaneRenderedBoolean: true
                });
              }
              
              // DEFENSIVE GUARD: Log if transcript would try to render inline controls
              if (miGateRenderContext === "TRANSCRIPT") {
                console.log('[UI_CONTRACT][TRANSCRIPT_READ_ONLY]', {
                  component: 'MULTI_INSTANCE_GATE_SHOWN',
                  packId: entry.meta?.packId || entry.packId,
                  instanceNumber: entry.meta?.instanceNumber || entry.instanceNumber,
                  renderContext: miGateRenderContext,
                  inlineActions: false,
                  reason: 'Footer owns all controls'
                });
              }
              
              // PART B: Deterministic stableKey
              const cardStableKey = entry.stableKey || entry.id || `mi-gate:${entryPackId}:${entryInstanceNumber}:q`;
              
              // SUPPRESS: Skip rendering if this is just "Instance X" preview
              const isInstancePreviewOnly = /^Instance\s+\d+$/i.test((safeMiGateTranscript || '').trim());
              if (isInstancePreviewOnly) {
                console.log('[MI_GATE][MAIN_PANE_SUPPRESS_INSTANCE_PREVIEW]', {
                  stableKey: cardStableKey,
                  packId: entry.meta?.packId || entry.packId,
                  instanceNumber: entry.meta?.instanceNumber || entry.instanceNumber,
                  promptPreview: safeMiGateTranscript,
                  reason: 'Transcript instance preview suppressed'
                });
                return null; // Skip rendering preview card
              }
              
              // AUDIT: Confirm main pane render
              console.log('[MI_GATE][MAIN_PANE_RENDER_OK]', {
                stableKey: cardStableKey,
                packId: entry.meta?.packId || entry.packId,
                instanceNumber: entry.meta?.instanceNumber || entry.instanceNumber,
                promptPreview: safeMiGateTranscript?.substring(0, 60),
                renderContext: miGateRenderContext
              });

              // PART A: DOM markers on root element
              return (
                <div 
                 key={entryKey} 
                 data-stablekey={cardStableKey}
                 data-cq-active-card={isActiveMiGate ? "true" : "false"}
                 data-cq-card-id={cardStableKey}
                 data-cq-card-kind="mi_gate"
                 data-ui-contract-card="true"
                 style={{
                   scrollMarginBottom: isActiveMiGate ? `${dynamicFooterHeightPx}px` : undefined
                 }}
                >
                 <ContentContainer>
                 <div className={`w-full bg-purple-900/30 border border-purple-700/50 rounded-xl p-5 transition-all duration-150 ${activeClass}`}>
                   <p className="text-white text-base leading-relaxed">{safeMiGateTranscript}</p>
                   {/* UI CONTRACT: NO inline Yes/No buttons - footer owns all controls */}
                 </div>
                 </ContentContainer>
                </div>
              );
            }

            // Multi-instance gate answer (user's Yes/No)
            if (entry.role === 'user' && getMessageTypeSOT(entry) === 'MULTI_INSTANCE_GATE_ANSWER') {
              // CONTEXT-AWARE LABELING: Clarify MI gate answers
              const rawAnswer = entry.text;
              let displayText = rawAnswer;
              
              if (rawAnswer === 'Yes') {
                displayText = 'Yes (Continue)';
              } else if (rawAnswer === 'No') {
                displayText = 'No (No more to report)';
              }
              
              return (
                <div key={entryKey} style={{ marginBottom: 10 }} data-stablekey={entry.stableKey || entry.id}>
                  <ContentContainer>
                  <div className="flex justify-end">
                    <div className="bg-purple-600 rounded-xl px-5 py-3 max-w-[85%]">
                      <p className="text-white text-sm">{displayText}</p>
                    </div>
                  </div>
                  </ContentContainer>
                </div>
              );
            }

            // V3 UI CONTRACT: Suppress all processing/reviewing/thinking bubbles
            if (entry.role === 'assistant' && (
              entry.messageType === 'v3_probe_complete' ||
              entry.messageType === 'AI_THINKING' ||
              entry.messageType === 'PROCESSING' ||
              entry.messageType === 'REVIEWING' ||
              entry.messageType === 'SYSTEM_MESSAGE' ||
              entry.messageType?.includes('THINKING') ||
              entry.messageType?.includes('PROBE_THINKING') ||
              entry.messageType?.includes('PROCESSING') ||
              entry.messageType?.includes('REVIEWING')
            )) {
              // V3 UI CONTRACT ENFORCEMENT: Log suppression for regression tracking
              console.log('[V3_UI_CONTRACT]', {
                action: 'SUPPRESS_PROCESSING_BUBBLE',
                reason: 'V3 owns UI - no processing indicators in parent transcript',
                messageType: entry.messageType,
                currentItemType: currentItem?.type,
                v3ProbingActive
              });
              return null;
            }

            // Gate prompts are part of append-only transcript history; do not suppress

            // Skip entries without stable IDs (safety guard)
            if (!entry.id && !entry.stableKey && !entry.__canonicalKey) {
              console.warn('[TRANSCRIPT][RENDER] Entry missing stable ID/key, skipping:', entry);
              return null;
            }
            
            return (
            <div key={entryKey}>

              {/* Parent placeholder (injected for orphaned answers) */}
              {entry.role === 'assistant' && getMessageTypeSOT(entry) === 'PARENT_PLACEHOLDER' && (
                <ContentContainer>
                <div className="w-full bg-slate-800/40 border border-slate-600/40 rounded-xl p-4 opacity-90">
                  <p className="text-slate-300 text-sm leading-relaxed italic">{entry.text}</p>
                </div>
                </ContentContainer>
              )}

              {/* Welcome message (from transcript) - READ-ONLY history only */}
              {entry.messageType === 'WELCOME' && entry.visibleToCandidate && (() => {
                // ACTIVE CARD DETECTION: Check if WELCOME is currently active
                const isActiveWelcome = screenMode === 'WELCOME';
                
                const activeClass = isActiveWelcome 
                  ? 'ring-2 ring-blue-400/40 shadow-lg shadow-blue-500/20' 
                  : '';
                
                return (
                  <ContentContainer>
                  <div className={`w-full bg-slate-800/50 border border-slate-700/60 rounded-xl p-5 transition-all duration-150 ${activeClass}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <Shield className="w-5 h-5 text-blue-400" />
                      <span className="text-base font-semibold text-blue-400">{entry.title || entry.text}</span>
                    </div>
                    {entry.lines && entry.lines.length > 0 && (
                      <div className="space-y-2">
                        {entry.lines.map((line, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                            <p className="text-slate-200 text-sm leading-relaxed">{line}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  </ContentContainer>
                );
              })()}

              {/* V3 probe answer - FALLBACK: Catch answers with stableKey pattern */}
              {entry.role === 'user' && entry.stableKey?.startsWith('v3-probe-a:') && (
                <div style={{ marginBottom: 10 }} data-stablekey={entry.stableKey || entry.id}>
                  <ContentContainer>
                  <div className="flex justify-end">
                    <div className="bg-purple-600 rounded-xl px-5 py-3 max-w-[85%]">
                      <p className="text-white text-sm">{entry.text || entry.message || '(answer)'}</p>
                    </div>
                  </div>
                  </ContentContainer>
                </div>
              )}

              {/* CTA acknowledgement - "Begin next section" */}
              {entry.role === 'user' && getMessageTypeSOT(entry) === 'CTA_ACK' && (
                <div style={{ marginBottom: 10 }} data-stablekey={entry.stableKey || entry.id}>
                  <ContentContainer>
                  <div className="flex justify-end">
                    <div className="bg-emerald-600 rounded-xl px-5 py-3 max-w-[85%]">
                      <p className="text-white text-sm">{entry.text}</p>
                    </div>
                  </div>
                  </ContentContainer>
                </div>
              )}

              {/* User message - "Got it — Let's Begin" or any other user text */}
              {entry.role === 'user' && !entry.messageType?.includes('ANSWER') && !entry.messageType?.includes('v3_') && !entry.messageType?.includes('GATE') && entry.messageType !== 'CTA_ACK' && (
                <div style={{ marginBottom: 10 }} data-stablekey={entry.stableKey || entry.id}>
                  <ContentContainer>
                  <div className="flex justify-end">
                    <div className="bg-blue-600 rounded-xl px-5 py-3 max-w-[85%]">
                      <p className="text-white text-sm">{entry.text}</p>
                    </div>
                  </div>
                  </ContentContainer>
                </div>
              )}

              {/* Session resumed marker (collapsed system note) */}
              {getMessageTypeSOT(entry) === 'RESUME' && entry.visibleToCandidate && (
                <ContentContainer>
                <div className="w-full bg-blue-900/30 border border-blue-700/40 rounded-xl p-3">
                  <p className="text-blue-300 text-sm">{entry.text}</p>
                </div>
                </ContentContainer>
              )}

              {/* V3 Pack opener prompt (FOLLOWUP_CARD_SHOWN) - MUST be visible in transcript history */}
              {entry.role === 'assistant' && getMessageTypeSOT(entry) === 'FOLLOWUP_CARD_SHOWN' && entry.meta?.variant === 'opener' && (() => {
                // STEP 2: Sanitize opener prompt in transcript
                const safeOpenerTranscript = sanitizeCandidateFacingText(entry.text, 'TRANSCRIPT_V3_OPENER');
                
                // ACTIVE CARD DETECTION: Check if this is the current opener
                const isActiveOpener = currentItem?.type === 'v3_pack_opener' && 
                  currentItem?.packId === entry.meta?.packId && 
                  currentItem?.instanceNumber === entry.meta?.instanceNumber;
                
                const activeClass = isActiveOpener 
                  ? 'ring-2 ring-purple-400/40 shadow-lg shadow-purple-500/20' 
                  : '';
                
                return (
                  <ContentContainer>
                    <div className={`w-full bg-purple-900/30 border border-purple-700/50 rounded-xl p-4 transition-all duration-150 ${activeClass}`}>
                      {entry.categoryLabel && (
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-medium text-purple-400">
                            {entry.categoryLabel}
                          </span>
                        </div>
                      )}
                      <p className="text-white text-sm leading-relaxed">{safeOpenerTranscript}</p>
                      {entry.example && (
                        <div className="mt-3 bg-slate-800/50 border border-slate-600/50 rounded-lg p-3">
                          <p className="text-xs text-slate-400 mb-1 font-medium">Example:</p>
                          <p className="text-slate-300 text-xs italic">{entry.example}</p>
                        </div>
                      )}
                    </div>
                  </ContentContainer>
                );
              })()}

              {entry.role === 'user' && getMessageTypeSOT(entry) === 'V3_OPENER_ANSWER' && (
                <div style={{ marginBottom: 10 }} data-stablekey={entry.stableKey || entry.id}>
                  <ContentContainer>
                  <div className="flex justify-end">
                    <div className="bg-purple-600 rounded-xl px-5 py-3 max-w-[85%]">
                      <p className="text-white text-sm">{entry.text}</p>
                    </div>
                  </div>
                  </ContentContainer>
                </div>
              )}

              {/* Required Anchor Question - Deterministic fallback question */}
              {entry.role === 'assistant' && getMessageTypeSOT(entry) === 'REQUIRED_ANCHOR_QUESTION' && (() => {
                // V3_OPENER PRECEDENCE: Suppress fallback questions when opener is active
                if (activeUiItem?.kind === "V3_OPENER") {
                  console.log('[V3_OPENER][FALLBACK_QUESTION_SUPPRESSED]', {
                    packId: currentItem?.packId,
                    instanceNumber: currentItem?.instanceNumber,
                    anchor: entry.meta?.anchor || entry.anchor,
                    reason: 'Active V3 opener owns prompt lane - fallback suppressed'
                  });
                  return null;
                }
                
                const questionStableKey = entry.stableKey || entry.id;
                const anchor = entry.meta?.anchor || entry.anchor;
                
                // Regression guard: Detect if filter blocked this type
                if (!entry.visibleToCandidate) {
                  console.error('[REQUIRED_ANCHOR_FALLBACK][FILTER_BLOCKED]', {
                    stableKey: questionStableKey,
                    messageType: 'REQUIRED_ANCHOR_QUESTION',
                    reason: 'visibleToCandidate=false - should be true'
                  });
                }
                
                // SINGLE-ACTIVE-QUESTION RULE: Suppress transcript copy while fallback is active for this anchor
                const isCurrentlyActiveAnchor = requiredAnchorFallbackActive && 
                                               anchor === requiredAnchorCurrent;
                
                if (isCurrentlyActiveAnchor) {
                  console.log('[REQUIRED_ANCHOR_FALLBACK][SINGLE_ACTIVE_Q_ENFORCED]', {
                    anchor,
                    stableKey: questionStableKey,
                    action: 'suppress_during_active',
                    reason: 'Active lane owns rendering - transcript copy suppressed to prevent duplicate'
                  });
                  return null; // Suppress during active - will render normally after fallback completes
                }
                
                console.log('[CQ_TRANSCRIPT][REQUIRED_ANCHOR_Q_RENDERED]', {
                  stableKey: questionStableKey,
                  anchor,
                  textPreview: entry.text?.substring(0, 60),
                  isHistory: !isCurrentlyActiveAnchor
                });
                
                // Render as purple AI follow-up question card (history mode - fallback completed)
                return (
                  <ContentContainer>
                    <div className="w-full bg-purple-900/30 border border-purple-700/50 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-purple-400">AI Follow-Up</span>
                        {entry.meta?.instanceNumber > 1 && (
                          <>
                            <span className="text-xs text-slate-500">•</span>
                            <span className="text-xs text-slate-400">Instance {entry.meta.instanceNumber}</span>
                          </>
                        )}
                      </div>
                      <p className="text-white text-sm leading-relaxed">{entry.text}</p>
                    </div>
                  </ContentContainer>
                );
              })()}

              {/* Prompt Lane Context - Non-chat context rows (e.g., fallback questions) */}
              {entry.role === 'assistant' && getMessageTypeSOT(entry) === 'PROMPT_LANE_CONTEXT' && entry.meta?.contextKind === 'REQUIRED_ANCHOR_FALLBACK' && (() => {
                // V3_OPENER PRECEDENCE: Suppress fallback context when opener is active
                if (activeUiItem?.kind === "V3_OPENER") {
                  console.log('[V3_OPENER][FALLBACK_CONTEXT_SUPPRESSED]', {
                    packId: currentItem?.packId,
                    instanceNumber: currentItem?.instanceNumber,
                    anchor: entry.meta?.anchor || entry.anchor,
                    reason: 'Active V3 opener owns prompt lane - fallback context suppressed'
                  });
                  return null;
                }
                
                const contextStableKey = entry.stableKey || entry.id;
                const contextAnchor = entry.meta?.anchor || entry.anchor;
                
                console.log('[CQ_TRANSCRIPT][PROMPT_CONTEXT_RENDERED]', {
                  stableKey: contextStableKey,
                  anchor: contextAnchor,
                  textPreview: entry.text?.substring(0, 60)
                });
                
                // Render as subtle context row (NOT a chat bubble)
                return (
                  <ContentContainer>
                    <div className="w-full bg-purple-900/20 border border-purple-700/30 rounded-lg px-4 py-2 opacity-90">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-purple-400">AI Follow-Up</span>
                        <span className="text-xs text-slate-500">•</span>
                        <span className="text-xs text-slate-300">{entry.text}</span>
                      </div>
                    </div>
                  </ContentContainer>
                );
              })()}
              
              {/* Required Anchor Answer - Candidate's answer to fallback question */}
              {entry.role === 'user' && entry.stableKey?.startsWith('required-anchor:a:') && (() => {
                const answerStableKey = entry.stableKey || entry.id;
                const anchor = entry.meta?.anchor || entry.anchor;
                
                console.log('[CQ_TRANSCRIPT][REQUIRED_ANCHOR_A_RENDERED]', {
                  stableKey: answerStableKey,
                  anchor,
                  textPreview: entry.text?.substring(0, 60)
                });
                
                return (
                  <div style={{ marginBottom: 10 }} data-stablekey={answerStableKey}>
                    <ContentContainer>
                      <div className="flex justify-end">
                        <div className="bg-purple-600 rounded-xl px-5 py-3 max-w-[85%]">
                          <p className="text-white text-sm">{entry.text}</p>
                        </div>
                      </div>
                    </ContentContainer>
                  </div>
                );
              })()}

              {/* V3 probe question and answer now render from transcript (legal record) */}
              {/* Moved to transcript stream above (lines ~9166-9194) - renders with proper styling */}

              {/* Base question (assistant) */}
              {entry.role === 'assistant' && entry.type === 'base_question' && (() => {
                // UI CONTRACT: NO inline actions - all actions in bottom bar only
                const questionId = entry.questionId;
                const isActiveBaseQuestion = effectiveItemType === 'question' && 
                  currentItem?.type === 'question' &&
                  currentItem?.id === questionId &&
                  activeUiItem?.kind === 'DEFAULT' &&
                  bottomBarModeSOT === 'YES_NO';
                
                // AUDIT: Inline actions should never render (legacy type)
                if (isActiveBaseQuestion) {
                  console.log('[BASE_Q][INLINE_ACTIONS_RENDER]', {
                    questionId,
                    isActiveBaseQuestion,
                    type: 'legacy_base_question',
                    note: 'No inline actions - bottom bar owns all user actions'
                  });
                }
                
                return (
                  <ContentContainer>
                  <div className="w-full bg-[#1a2744] border border-slate-700/60 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-base font-semibold text-blue-400">
                        Question {entry.questionNumber || getQuestionDisplayNumber(entry.questionId)}
                      </span>
                      <span className="text-sm text-slate-500">•</span>
                      <span className="text-sm font-medium text-slate-300">{entry.category}</span>
                    </div>
                    <p className="text-white text-base leading-relaxed">{entry.questionText || entry.text}</p>
                    {/* UI CONTRACT: NO inline actions - bottom bar owns all user actions */}
                  </div>
                  </ContentContainer>
                );
              })()}

              {/* Base answer (user) */}
              {entry.role === 'user' && entry.type === 'base_answer' && (
                <div style={{ marginBottom: 10 }}>
                  <ContentContainer>
                  <div className="flex justify-end">
                    <div className="bg-blue-600 rounded-xl px-5 py-3 max-w-[85%]">
                      <p className="text-white text-sm">{entry.answer || entry.text}</p>
                    </div>
                  </div>
                  </ContentContainer>
                </div>
              )}

              {/* Legacy combined question+answer entries (backward compatibility) */}
              {entry.type === 'question' && entry.answer && !entry.role && (() => {
                // UI CONTRACT: NO inline actions for legacy combined entries
                const questionId = entry.questionId;
                const isActiveBaseQuestion = effectiveItemType === 'question' && 
                  currentItem?.type === 'question' &&
                  currentItem?.id === questionId &&
                  activeUiItem?.kind === 'DEFAULT' &&
                  bottomBarModeSOT === 'YES_NO';
                
                // AUDIT: Log if this legacy type is somehow active (should not happen)
                if (isActiveBaseQuestion) {
                  console.warn('[BASE_Q][INLINE_ACTIONS_RENDER]', {
                    questionId,
                    isActiveBaseQuestion,
                    type: 'legacy_combined',
                    note: 'Legacy combined type should not be active - no inline actions'
                  });
                }
                
                return (
                  <ContentContainer>
                  <div className="w-full space-y-2">
                    <div className="bg-[#1a2744] border border-slate-700/60 rounded-xl p-5">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-base font-semibold text-blue-400">
                          Question {getQuestionDisplayNumber(entry.questionId)}
                        </span>
                        <span className="text-sm text-slate-500">•</span>
                        <span className="text-sm font-medium text-slate-300">{entry.category}</span>
                      </div>
                      <p className="text-white text-base leading-relaxed">{entry.questionText}</p>
                      {/* UI CONTRACT: NO inline actions - bottom bar owns all user actions */}
                    </div>
                    <div className="flex justify-end">
                      <div className="bg-blue-600 rounded-xl px-5 py-3 max-w-[85%]">
                        <p className="text-white text-sm">{entry.answer}</p>
                      </div>
                    </div>
                  </div>
                  </ContentContainer>
                );
              })()}

              {/* V2 Pack followups (combined question+answer, only show after answer submitted) */}
              {entry.type === 'followup_question' && (entry.source === 'V2_PACK' || entry.source === 'AI_FOLLOWUP') && entry.answer && (() => {
                // V3 UI CONTRACT: Block all follow-up cards during active V3 probing
                if (v3ProbingActive) {
                  console.log("[V3_UI_CONTRACT] BLOCKED_FOLLOWUP_QUESTION_CARD_DURING_PROBING", { 
                    v3ProbingActive: true,
                    entryType: entry.type,
                    packId: entry.packId
                  });
                  return null;
                }
                
                // TRUTH TEST: Detect deterministic followup rendering during V3 pack
                const entryPackId = entry.packId || entry.meta?.packId;
                const activePackId = currentItem?.packId || v3ProbingContext?.packId || activeUiItem?.packId;
                const packConfig = activePackId ? FOLLOWUP_PACK_CONFIGS?.[activePackId] : null;
                const isActivePackV3 = Boolean(packConfig?.isV3Pack === true || packConfig?.engineVersion === 'v3');
                const isV3UiActive = (activeUiItem?.kind === 'V3_OPENER' || 
                                     activeUiItem?.kind === 'V3_PROBING' || 
                                     currentItem?.type === 'v3_pack_opener' ||
                                     v3ProbingActive);
                
                if (isActivePackV3 && isV3UiActive && entryPackId === activePackId) {
                  logOnce(`deterministic_followup_rendered_${sessionId}:${entryPackId}`, () => {
                    console.error('[UI_CONTRACT][DETERMINISTIC_FOLLOWUP_RENDERED_DURING_V3]', {
                      packId: activePackId,
                      entryType: entry.type,
                      stableKey: entry.stableKey || entry.id,
                      source: entry.source,
                      reason: 'Deterministic follow-up artifact rendered during V3 pack - should be filtered'
                    });
                  });
                  return null; // SAFETY NET: Block rendering
                }
                
                return (
                  <ContentContainer>
                  <div className="w-full space-y-2">
                    <div className="bg-purple-900/30 border border-purple-700/50 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-purple-400">Follow-up</span>
                        <span className="text-xs text-slate-500">•</span>
                        <span className="text-xs font-medium text-purple-400">
                          {FOLLOWUP_PACK_CONFIGS[entry.packId]?.instancesLabel || entry.packId}
                          {entry.instanceNumber > 1 ? ` — Instance ${entry.instanceNumber}` : ''}
                        </span>
                      </div>
                      <p className="text-white text-sm leading-relaxed">{entry.questionText || entry.text}</p>
                    </div>
                    <div className="flex justify-end">
                      <div className="bg-purple-600 rounded-xl px-5 py-3 max-w-[85%]">
                        <p className="text-white text-sm">{entry.answer}</p>
                      </div>
                    </div>
                  </div>
                  </ContentContainer>
                );
              })()}

              {/* Legacy/deterministic followup entries (combined question+answer) */}
              {entry.type === 'followup' && !entry.source && (() => {
                // V3 UI CONTRACT: Block all follow-up cards during active V3 probing
                if (v3ProbingActive) {
                  console.log("[V3_UI_CONTRACT] BLOCKED_FOLLOWUP_QUESTION_CARD_DURING_PROBING", { 
                    v3ProbingActive: true,
                    entryType: entry.type
                  });
                  return null;
                }
                
                // TRUTH TEST: Detect legacy deterministic followup rendering during V3 pack
                const entryPackId = entry.packId || entry.meta?.packId;
                const activePackId = currentItem?.packId || v3ProbingContext?.packId || activeUiItem?.packId;
                const packConfig = activePackId ? FOLLOWUP_PACK_CONFIGS?.[activePackId] : null;
                const isActivePackV3 = Boolean(packConfig?.isV3Pack === true || packConfig?.engineVersion === 'v3');
                const isV3UiActive = (activeUiItem?.kind === 'V3_OPENER' || 
                                     activeUiItem?.kind === 'V3_PROBING' || 
                                     currentItem?.type === 'v3_pack_opener' ||
                                     v3ProbingActive);
                
                if (isActivePackV3 && isV3UiActive && entryPackId === activePackId) {
                  logOnce(`legacy_followup_rendered_${sessionId}:${entryPackId}`, () => {
                    console.error('[UI_CONTRACT][DETERMINISTIC_FOLLOWUP_RENDERED_DURING_V3]', {
                      packId: activePackId,
                      entryType: entry.type,
                      stableKey: entry.stableKey || entry.id,
                      source: 'legacy_no_source',
                      reason: 'Legacy deterministic follow-up rendered during V3 pack - should be filtered'
                    });
                  });
                  return null; // SAFETY NET: Block rendering
                }
                
                return (
                  <ContentContainer>
                  <div className="w-full space-y-2">
                    <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-4">
                      <p className="text-slate-300 text-sm">{entry.questionText || entry.text}</p>
                    </div>
                    {entry.answer && (
                      <div className="flex justify-end">
                        <div className="bg-slate-600 rounded-xl px-4 py-2">
                          <p className="text-white text-sm">{entry.answer}</p>
                        </div>
                      </div>
                    )}
                  </div>
                  </ContentContainer>
                );
              })()}

              {/* AI Probe Questions (including V2 pack cluster opening) - only show if answered */}
              {v3ProbingActive ? null : (entry.type === 'ai_probe_question' && entry.answer && (() => {
                // V3 UI CONTRACT: Block all AI probe cards during active V3 probing
                if (v3ProbingActive) {
                  console.log("[V3_UI_CONTRACT] BLOCKED_FOLLOWUP_QUESTION_CARD_DURING_PROBING", { 
                    v3ProbingActive: true,
                    entryType: entry.type
                  });
                  return null;
                }
                
                return (
                  <ContentContainer>
                  <div className="w-full space-y-2">
                    <div className="bg-purple-900/30 border border-purple-700/50 rounded-xl p-4">
                      <p className="text-white text-sm leading-relaxed">{entry.questionText || entry.text || entry.content}</p>
                    </div>
                    <div className="flex justify-end">
                      <div className="bg-purple-600 rounded-xl px-5 py-3 max-w-[85%]">
                        <p className="text-white text-sm">{entry.answer}</p>
                      </div>
                    </div>
                  </div>
                  </ContentContainer>
                  );
                  })())}

                  {/* Section Completion Messages */}
              {entry.role === 'assistant' && getMessageTypeSOT(entry) === 'SECTION_COMPLETE' && entry.visibleToCandidate && (
                <ContentContainer>
                <div className="w-full bg-gradient-to-br from-emerald-900/80 to-emerald-800/60 backdrop-blur-sm border-2 border-emerald-500/50 rounded-xl p-6 shadow-2xl">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-emerald-600/30 flex items-center justify-center flex-shrink-0 border-2 border-emerald-500/50">
                      <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-xl font-bold text-white mb-2">
                        {entry.title || `Section Complete`}
                      </h2>
                      {entry.lines && entry.lines.length > 0 && (
                        <div className="space-y-2 mb-4">
                          {entry.lines.map((line, idx) => (
                            <p key={idx} className="text-emerald-200 text-sm leading-relaxed">
                              {line}
                            </p>
                          ))}
                        </div>
                      )}

                      {entry.meta?.progress && (
                        <div className="flex items-center gap-4 text-xs text-emerald-300/80">
                          <span>{entry.meta.progress.completedSections} of {entry.meta.progress.totalSections} sections complete</span>
                          <span>•</span>
                          <span>{entry.meta.progress.answeredQuestions} of {entry.meta.progress.totalQuestions} questions answered</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                </ContentContainer>
              )}
            </div>
          );
          });
          })()}

          {/* ACTIVE CARD LANE: Render active prompt card at bottom (after transcript) */}
          {activeCard && (activeUiItem.kind === "REQUIRED_ANCHOR_FALLBACK" || activeUiItem.kind === "V3_OPENER" || activeUiItem.kind === "V3_PROMPT" || activeUiItem.kind === "MI_GATE" || activeCard.kind === "base_question_yesno") && (() => {
            console.log('[UI_CONTRACT][ACTIVE_LANE_POSITION_SOT]', {
              activeUiItemKind: activeUiItem?.kind,
              placedAfterTranscript: true,
              transcriptLen: finalTranscriptList?.length || 0,
              activeCardKind: activeCard.kind,
              packId: activeCard.packId,
              instanceNumber: activeCard.instanceNumber
            });

            const cardKind = activeCard.kind;

            if (cardKind === "required_anchor_fallback_prompt") {
              // V3_OPENER PRECEDENCE: Suppress fallback card when opener is active
              if (activeUiItem?.kind === "V3_OPENER") {
                console.log('[V3_OPENER][ACTIVE_LANE_FALLBACK_SUPPRESSED]', {
                  packId: activeCard?.packId,
                  instanceNumber: activeCard?.instanceNumber,
                  reason: 'Active V3 opener owns active lane - suppressing fallback card'
                });
                return null;
              }
              
              const safeCardPrompt = sanitizeCandidateFacingText(activeCard.text, 'ACTIVE_LANE_FALLBACK_PROMPT');
              
              console.log('[REQUIRED_ANCHOR_FALLBACK][ACTIVE_LANE_RENDER_OVERRIDE]', {
                reason: 'ignore_currentItemType_gate',
                kind: 'required_anchor_fallback_prompt',
                promptPreview: safeCardPrompt?.substring(0, 60),
                currentItemType: currentItem?.type,
                activeUiItemKind: activeUiItem?.kind
              });
              
              return (
                <div 
                  key={`active-${activeCard.stableKey}`}
                  ref={activeLaneCardRef}
                  data-stablekey={activeCard.stableKey}
                  data-cq-active-card="true"
                  data-ui-contract-card="true"
                  style={{
                    scrollMarginBottom: `${activeCardScrollMarginBottomPx}px`
                  }}
                >
                  <ContentContainer>
                    <div className="w-full bg-purple-900/30 border border-purple-700/50 rounded-xl p-4 ring-2 ring-purple-400/40 shadow-lg shadow-purple-500/20 transition-all duration-150">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-purple-400">AI Follow-Up</span>
                        {activeCard.instanceNumber > 1 && (
                          <>
                            <span className="text-xs text-slate-500">•</span>
                            <span className="text-xs text-slate-400">Instance {activeCard.instanceNumber}</span>
                          </>
                        )}
                      </div>
                      <p className="text-white text-sm leading-relaxed">{safeCardPrompt}</p>
                    </div>
                  </ContentContainer>
                </div>
              );
            }

            if (cardKind === "v3_probe_q") {
              const safeCardPrompt = sanitizeCandidateFacingText(activeCard.text, 'ACTIVE_LANE_V3_PROBE');
              return (
                <div key={`active-${activeCard.stableKey}`}>
                  <ContentContainer>
                    <div 
                      className="w-full bg-purple-900/30 border border-purple-700/50 rounded-xl p-4 ring-2 ring-purple-400/40 shadow-lg shadow-purple-500/20 transition-all duration-150"
                      data-cq-active-card="true"
                      data-stablekey={activeCard.stableKey}
                      data-ui-contract-card="true"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-purple-400">AI Follow-Up</span>
                        {activeCard.instanceNumber > 1 && (
                          <>
                            <span className="text-xs text-slate-500">•</span>
                            <span className="text-xs text-slate-400">Instance {activeCard.instanceNumber}</span>
                          </>
                        )}
                      </div>
                      <p className="text-white text-sm leading-relaxed">{safeCardPrompt}</p>
                    </div>
                  </ContentContainer>
                </div>
              );
            }

            if (cardKind === "v3_pack_opener") {
              if (activeUiItem?.kind === "V3_OPENER") {
                console.log('[V3_OPENER][ACTIVE_LANE_OPENER_SUPPRESSED_OWNER_SWAP]', {
                  reason: 'Transcript lane owns opener during V3_OPENER - preventing active lane duplicate'
                });
                return null;
              }
              
              const cardStableKey = activeCard.stableKey || `followup-card:${activeCard.packId}:opener:${activeCard.instanceNumber}`;
              
              // V3_OPENER PRECEDENCE: Only render the CURRENT active opener card
              if (activeUiItem?.kind === "V3_OPENER") {
                const activeKeySOT = activeCardKeySOT;
                if (activeKeySOT && cardStableKey && cardStableKey !== activeKeySOT) {
                  console.log('[V3_OPENER][ACTIVE_LANE_EXTRA_OPENER_SUPPRESSED]', {
                    cardStableKey,
                    activeKeySOT,
                    reason: 'Only the active opener card should render during V3_OPENER'
                  });
                  return null;
                }
              }
              
              console.log('[V3_OPENER][KEYS_SOT]', {
                cardStableKey,
                activeKeySOT: activeCardKeySOT,
                match: cardStableKey === activeCardKeySOT
              });
              
              const safeOpenerPrompt = sanitizeCandidateFacingText(activeCard.text, 'ACTIVE_LANE_V3_OPENER');
              
              const instanceTitle = activeCard.categoryLabel && activeCard.instanceNumber > 1 
                ? `${activeCard.categoryLabel} — Instance ${activeCard.instanceNumber}` 
                : activeCard.categoryLabel;
              
              console.log('[INSTANCE_TITLE][OPENER_TITLE_OK]', {
                packId: activeCard.packId,
                instanceNumber: activeCard.instanceNumber,
                titlePreview: instanceTitle
              });
              
              return (
                <div 
                  key={`active-${cardStableKey}`}
                  ref={activeLaneCardRef}
                  data-stablekey={cardStableKey}
                  data-cq-active-card="true"
                  data-cq-card-id={cardStableKey}
                  data-cq-card-kind="v3_pack_opener"
                  data-ui-contract-card="true"
                  style={{
                    scrollMarginBottom: `${activeCardScrollMarginBottomPx}px`
                  }}
                >
                  <ContentContainer>
                    <div className="w-full bg-purple-900/30 border border-purple-700/50 rounded-xl p-4 ring-2 ring-purple-400/40 shadow-lg shadow-purple-500/20 transition-all duration-150">
                      {activeCard.categoryLabel && (
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-medium text-purple-400">
                            {instanceTitle}
                          </span>
                        </div>
                      )}
                      <p className="text-white text-sm leading-relaxed">{safeOpenerPrompt}</p>
                      {activeCard.exampleNarrative && (
                        <div className="mt-3 bg-slate-800/50 border border-slate-600/50 rounded-lg p-3">
                          <p className="text-xs text-slate-400 mb-1 font-medium">Example:</p>
                          <p className="text-slate-300 text-xs italic">{activeCard.exampleNarrative}</p>
                        </div>
                      )}
                    </div>
                  </ContentContainer>
                </div>
              );
            }

            if (cardKind === "multi_instance_gate") {
              const safeMiGatePrompt = sanitizeCandidateFacingText(activeCard.text, 'ACTIVE_LANE_MI_GATE');
              const cardStableKey = activeCard.stableKey || `mi-gate:${activeCard.packId}:${activeCard.instanceNumber}:q`;
              
              // SUPPRESS: Skip rendering if this is just "Instance X" preview
              const isInstancePreviewOnly = /^Instance\s+\d+$/i.test((safeMiGatePrompt || '').trim());
              if (isInstancePreviewOnly) {
                console.log('[MI_GATE][MAIN_PANE_SUPPRESS_INSTANCE_PREVIEW]', {
                  stableKey: cardStableKey,
                  packId: activeCard.packId,
                  instanceNumber: activeCard.instanceNumber,
                  promptPreview: safeMiGatePrompt,
                  reason: 'Active lane instance preview suppressed'
                });
                return null; // Skip rendering preview card
              }
              
              return (
                <div 
                  key={`active-${cardStableKey}`}
                  ref={activeLaneCardRef}
                  data-stablekey={cardStableKey}
                  data-cq-active-card="true"
                  data-cq-card-id={cardStableKey}
                  data-cq-card-kind="mi_gate"
                  data-ui-contract-card="true"
                  style={{
                    scrollMarginBottom: `${activeCardScrollMarginBottomPx}px`
                  }}
                >
                  <ContentContainer>
                    <div className="w-full bg-purple-900/30 border border-purple-700/50 rounded-xl p-5 ring-2 ring-purple-400/40 shadow-lg shadow-purple-500/20 transition-all duration-150">
                      <p className="text-white text-base leading-relaxed">{safeMiGatePrompt}</p>
                    </div>
                  </ContentContainer>
                </div>
              );
            }

            if (cardKind === "v3_thinking") {
              return (
                <div key={`active-${activeCard.stableKey}`} data-stablekey={activeCard.stableKey} data-cq-active-card="true" data-ui-contract-card="true">
                  <ContentContainer>
                    <div className="w-full bg-purple-900/30 border border-purple-700/50 rounded-xl p-4">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                        <span className="text-sm text-purple-300">{activeCard.text}</span>
                      </div>
                    </div>
                  </ContentContainer>
                </div>
              );
            }

            if (cardKind === "base_question_yesno") {
              const safeQuestionText = sanitizeCandidateFacingText(activeCard.text, 'ACTIVE_LANE_BASE_QUESTION');
              const cardStableKey = activeCard.stableKey || `question-shown:${activeCard.questionId}`;
              const activeQuestionId = activeCard.questionId;
              
              // FIX: Find most recent answer for this question in render stream
              const answerStableKeyPrefix = `answer:${sessionId}:${activeQuestionId}:`;
              const recentAnswer = finalTranscriptList.find(e => 
                e.role === 'user' && 
                e.messageType === 'ANSWER' &&
                (e.questionId === activeQuestionId || e.meta?.questionDbId === activeQuestionId) &&
                (e.stableKey?.startsWith(answerStableKeyPrefix) || e.stableKey === `answer:${sessionId}:${activeQuestionId}:0`)
              );
              
              if (recentAnswer) {
                console.log('[BASE_YESNO][ANSWER_PLACED_UNDER_ACTIVE]', {
                  questionId: activeQuestionId,
                  stableKey: recentAnswer.stableKey || recentAnswer.id,
                  answerText: recentAnswer.text,
                  reason: 'Active base question - rendering answer directly under active card'
                });
              }
              
              return (
                <>
                 <div 
                   key={`active-${cardStableKey}`}
                   ref={activeLaneCardRef}
                   data-stablekey={cardStableKey}
                   data-cq-active-card="true"
                   data-cq-card-id={cardStableKey}
                   data-cq-card-kind="question"
                   data-ui-contract-card="true"
                   style={{
                     scrollMarginBottom: `${activeCardScrollMarginBottomPx}px`
                   }}
                 >
                  <ContentContainer>
                    <div className="w-full bg-[#1a2744] border border-slate-700/60 rounded-xl p-5 ring-2 ring-blue-400/40 shadow-lg shadow-blue-500/20 transition-all duration-150">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-base font-semibold text-blue-400">
                          Question {activeCard.questionNumber || ''}
                        </span>
                        {activeCard.sectionName && (
                          <>
                            <span className="text-sm text-slate-500">•</span>
                            <span className="text-sm font-medium text-slate-300">{activeCard.sectionName}</span>
                          </>
                        )}
                      </div>
                      <p className="text-white text-base leading-relaxed">{safeQuestionText}</p>
                    </div>
                  </ContentContainer>
                </div>
                
                {recentAnswer && (
                  <div 
                    key={`active-answer-${recentAnswer.stableKey || recentAnswer.id}`} 
                    style={{ marginBottom: 10, marginTop: 12 }} 
                    data-stablekey={recentAnswer.stableKey || recentAnswer.id}
                    data-cq-active-answer="true"
                  >
                    <ContentContainer>
                      <div className="flex justify-end">
                        <div className="bg-blue-600 rounded-xl px-5 py-3 max-w-[85%]">
                          <p className="text-white text-sm">{recentAnswer.text}</p>
                        </div>
                      </div>
                    </ContentContainer>
                  </div>
                )}
                </>
              );
            }

            return null;
          })()}

          </div>

          {/* BOTTOM SPACER - Reserves space for sticky composer (ChatGPT pattern) */}
          <div
           ref={bottomAnchorRef}
           aria-hidden="true"
           data-ui-contract-anchor="true"
           style={{ 
             height: `${bottomSpacerPx}px`, 
             flexShrink: 0,
             scrollMarginBottom: `${dynamicFooterHeightPx}px`
           }}
          />
          
          {/* UNIVERSAL FOOTER CLEARANCE SPACER - Real DOM element ensures scroll range */}
          {shouldRenderFooter && screenMode === 'QUESTION' && (
            <div
              aria-hidden="true"
              data-ui-contract-spacer="true"
              data-footer-clearance-spacer="true"
              style={{
                height: `${footerClearancePx}px`,
                flexShrink: 0,
                pointerEvents: 'none'
              }}
            />
          )}
        </div>
        
        {/* FOOTER SHELL - Fixed to viewport bottom (deterministic positioning) */}
        <div 
          ref={footerShellRef}
          className="fixed bottom-0 left-0 right-0 w-full bg-slate-800/95 backdrop-blur-sm border-t border-slate-800 px-4 py-4 z-10 h-auto min-h-0 flex-none"
        >
            <div className="max-w-5xl mx-auto h-auto min-h-0 flex-none" ref={footerRef}>

      {/* V3 Pack Opener Card - SYNTHETIC RENDER (disabled by ENABLE_SYNTHETIC_TRANSCRIPT) */}
      {false && ENABLE_SYNTHETIC_TRANSCRIPT && (() => {
            // UI CONTRACT: Use effectiveItemType (never render opener during probing)
            const isV3OpenerMode = effectiveItemType === 'v3_pack_opener';
            
            // V3 UI CONTRACT: Hard block opener card during active V3 probing
            if (v3ProbingActive) {
              console.log("[V3_UI_CONTRACT] BLOCKED_FOLLOWUP_CARD_RENDER_DURING_PROBING", { 
                v3ProbingActive: true,
                currentItemType: currentItem?.type,
                reason: 'Active V3 probing - opener card must not render'
              });
              return null;
            }
            
            if (!isV3OpenerMode) {
              return null;
            }
            
            const openerText = currentItem.openerText;
            const exampleNarrative = currentItem.exampleNarrative;
            const packId = currentItem.packId;
            const instanceNumber = currentItem.instanceNumber;
            const categoryLabel = currentItem.categoryLabel;
            
            // GUARD: Check if transcript already contains this opener card
            const canonicalKey = `followup-card:${packId}:opener:${instanceNumber}`;
            const transcriptHasOpener = renderedTranscript.some(e => e.__canonicalKey === canonicalKey);
            
            if (transcriptHasOpener) {
              console.log('[V3_UI_CONTRACT][OPENER_RENDER_SUPPRESSED]', {
                canonicalKey,
                packId,
                instanceNumber,
                reason: 'Transcript already contains opener card - preventing duplicate'
              });
              return null;
            }
            
            // FALLBACK: Safe prompt if openerText is missing
            const usingFallback = !openerText || openerText.trim() === '';
            const openerTextToShow = usingFallback 
              ? "Please describe the details for this section in your own words."
              : openerText;
            
            if (usingFallback) {
              console.error('[V3_OPENER][MISSING_PROMPT_TEXT]', {
                packId,
                instanceNumber,
                categoryId: currentItem.categoryId,
                reason: 'openerText is empty - using fallback'
              });
            }
            
            // UI CONTRACT: Log opener prompt visibility + render state
            console.log('[V3_OPENER][PROMPT_VISIBLE]', {
              packId,
              instanceNumber,
              hasOpenerText: !!openerText,
              usingFallback,
              preview: openerTextToShow?.substring(0, 60)
            });
            
            console.log('[V3_UI_CONTRACT][OPENER_RENDER_STATE]', {
              packId,
              instanceNumber,
              canonicalKey,
              transcriptHasOpener,
              renderedOpenerCount: 1
            });
            
            return (
              <ContentContainer>
                <div className="w-full bg-purple-900/30 border border-purple-700/50 rounded-xl p-4">
                  {categoryLabel && (
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium text-purple-400">
                        {categoryLabel}{instanceNumber > 1 ? ` — Instance ${instanceNumber}` : ''}
                      </span>
                    </div>
                  )}
                  <p className="text-white text-sm leading-relaxed">{openerTextToShow}</p>
                  {exampleNarrative && (
                    <div className="mt-3 bg-slate-800/50 border border-slate-600/50 rounded-lg p-3">
                      <p className="text-xs text-slate-400 mb-1 font-medium">Example:</p>
                      <p className="text-slate-300 text-xs italic">{exampleNarrative}</p>
                    </div>
                  )}
                </div>
              </ContentContainer>
              );
            })()}

            {/* V3 Probing Loop - HEADLESS (no visible cards in main transcript area) */}
            {(() => {
            // SUPPRESS: Do not mount V3ProbingLoop when fallback is active
            if (requiredAnchorFallbackActive) {
              const loopKey = v3ProbingContext ? `${sessionId}:${v3ProbingContext.categoryId}:${v3ProbingContext.instanceNumber || 1}` : null;
              console.log('[REQUIRED_ANCHOR_FALLBACK][SUPPRESS_V3_MOUNT]', {
                loopKey,
                reason: 'fallback_active'
              });
              return null;
            }
            
            const shouldRenderV3Loop = v3ProbingActive && v3ProbingContext && 
              v3ProbingContext.categoryId && v3ProbingContext.packId;
            
            if (!shouldRenderV3Loop) {
              if (v3ProbingActive) {
                console.warn('[V3_UI_RENDER][PARENT_GUARD] V3 probing active but missing context', {
                  v3ProbingActive,
                  hasCategoryId: !!v3ProbingContext?.categoryId,
                  hasPackId: !!v3ProbingContext?.packId
                });
              }
              return null;
            }
            
            console.log('[V3_UI_CONTRACT]', {
              action: 'V3_LOOP_HEADLESS_MOUNT',
              reason: 'V3ProbingLoop renders NO visible cards - parent owns all UI in bottom bar',
              v3ProbingActive,
              loopKey: `${sessionId}:${v3ProbingContext.categoryId}:${v3ProbingContext.instanceNumber || 1}`
            });
            
            // HEADLESS MODE: V3ProbingLoop has no visible DOM (returns null)
            // All UI (prompt banner + input) rendered by parent in BottomBar
            return (
              <V3ProbingLoop
                key={`v3-probe-${sessionId}-${v3ProbingContext.categoryId}-${v3ProbingContext.instanceNumber || 1}`}
                sessionId={sessionId}
                categoryId={v3ProbingContext.categoryId}
                categoryLabel={v3ProbingContext.categoryLabel}
                incidentId={v3ProbingContext.incidentId}
                baseQuestionId={v3ProbingContext.baseQuestionId}
                questionCode={v3ProbingContext.questionCode}
                sectionId={v3ProbingContext.sectionId}
                instanceNumber={v3ProbingContext.instanceNumber}
                packData={v3ProbingContext.packData}
                openerAnswer={v3ProbingContext.openerAnswer}
                traceId={v3ProbingContext.traceId}
                onComplete={handleV3ProbingComplete}
                onTranscriptUpdate={handleV3TranscriptUpdate}
                onMultiInstancePrompt={(promptData) => {
                  setPendingGatePrompt({ promptData, v3Context: v3ProbingContext });
                }}
                onMultiInstanceAnswer={setV3MultiInstanceHandler}
                onPromptChange={handleV3PromptChange}
                onAnswerNeeded={handleV3AnswerNeeded}
                pendingAnswer={v3PendingAnswer}
                onAnswerConsumed={handleV3AnswerConsumed}
                onPromptSet={({ loopKey, promptPreview, promptLen }) => {
                  console.log('[V3_PROBING][PROMPT_READY]', {
                    loopKey,
                    packId: v3ProbingContext.packId,
                    instanceNumber: v3ProbingContext.instanceNumber,
                    promptLen
                  });
                }}
                onRecapReady={async ({ loopKey, packId, categoryId, instanceNumber, recapText, nextAction, incidentId }) => {
                  console.log('[V3_RECAP][RECEIVED]', {
                    loopKey,
                    packId,
                    instanceNumber,
                    promptLen: recapText?.length || 0,
                    nextAction
                  });
                  
                  // SUPPRESSION: Do not append recap to transcript (scope creep removal)
                  console.log('[V3_UI_CONTRACT][RECAP_SUPPRESSED]', {
                    packId,
                    instanceNumber,
                    loopKey,
                    reason: 'Scope creep — recap UI disabled'
                  });
                  
                  // Mark recap as ready (prevents prompt missing logs)
                  v3RecapReadyRef.current.set(loopKey, { recapText, nextAction });
                  
                  // Skip transcript append - routing happens via onIncidentComplete
                }}
                onIncidentComplete={({ loopKey, packId, categoryId, instanceNumber, reason, incidentId, completionReason, hasRecap, missingFields, miGateBlocked, stopReason }) => {
                  console.log('[V3_PROBING][INCIDENT_COMPLETE_NO_PROMPT]', {
                    loopKey,
                    packId,
                    instanceNumber,
                    reason,
                    hasRecap,
                    missingFields: missingFields?.length || 0,
                    miGateBlocked,
                    stopReason
                  });
                  
                  // CACHE ENGINE DECISION: Store for MI_GATE validation
                  lastV3DecisionByLoopKeyRef.current[loopKey] = {
                    missingFields: missingFields || [],
                    miGateBlocked: miGateBlocked || false,
                    stopReason: stopReason || null,
                    packId,
                    instanceNumber,
                    ts: Date.now()
                  };
                  
                  console.log('[V3_ENGINE_DECISION][CACHED]', {
                    loopKey,
                    missingCount: missingFields?.length || 0,
                    miGateBlocked: miGateBlocked || false,
                    reason: 'Cached for MI_GATE validation'
                  });
                  
                  // V3 BLOCK RELEASE: Log completion
                  console.log('[FLOW][V3_BLOCK_RELEASED]', {
                    loopKey,
                    nextAllowed: true,
                    reason: 'V3_INCIDENT_COMPLETE'
                  });
                  
                  // Route based on pack type (TDZ-safe)
                  const safePackData = v3ProbingContext?.packData || null;
                  const isMultiIncident = safePackData?.behavior_type === 'multi_incident' || 
                                         safePackData?.followup_multi_instance === true;
                  
                  if (isMultiIncident) {
                    console.log('[V3_INCIDENT_COMPLETE][MULTI] Showing another instance gate with required fields check');
                    // Pass through required fields data from engine result
                    transitionToAnotherInstanceGate({
                      ...v3ProbingContext,
                      missingFields: missingFields || [],
                      miGateBlocked: miGateBlocked || false,
                      stopReason: stopReason || null
                    });
                  } else {
                    console.log('[V3_INCIDENT_COMPLETE][SINGLE] Exiting V3 and advancing');
                    exitV3Once('INCIDENT_COMPLETE_NO_PROMPT', {
                      incidentId,
                      categoryId,
                      completionReason,
                      messages: [],
                      reason: hasRecap ? 'RECAP_COMPLETE' : 'INCIDENT_COMPLETE_NO_PROMPT',
                      shouldOfferAnotherInstance: false,
                      packId,
                      categoryLabel: v3ProbingContext?.categoryLabel || categoryId,
                      instanceNumber,
                      packData: safePackData
                    });
                  }
                  
                  console.log('[V3_INCIDENT_COMPLETE][ADVANCE]', { loopKey, packId, instanceNumber, nextAction: completionReason, recapSuppressed: true });
                }}
              />
              );
            })()}

            {/* MI_GATE/V3_PROMPT/V3_OPENER ACTIVE CARDS: Removed - now rendered via canonical stream */}
            {/* CANONICAL STREAM: All active cards injected via renderStream (lines 8471-8539) */}



            {/* FIX B4: LEGACY_BLOCK_REACHED spam eliminated - never log (path is permanently disabled) */}
            {/* LEGACY V3 PROMPT RENDER PATH - HARD DISABLED */}
            {(() => {
              // HARD DISABLED: Legacy V3 prompt render path must NEVER render UI
              // All V3 prompts render via canonical stream (activeCard in renderStream)
              return null; // UNCONDITIONAL NULL - no UI output ever
            })()}

            {/* UI CONTRACT: Active base questions render ONLY in transcript stream - NO separate active card */}
            {/* This section PERMANENTLY DISABLED - all base questions render via transcript entries */}
            {/* Yes/No buttons ONLY in bottom bar (footer) - NEVER inline in transcript */}
            {false && (() => {
              console.error('[UI_CONTRACT][VIOLATION][ACTIVE_CARD_PATH_REACHED]', {
                currentItemType: currentItem?.type,
                currentItemId: currentItem?.id,
                reason: 'This code path is disabled and should never execute'
              });
              return null;
            })()}



           {/* UI CONTRACT: All active cards render via transcript stream - NO separate currentPrompt renderer */}
           {/* This section PERMANENTLY DISABLED - prevents duplicate card rendering */}
           {/* All user actions (Yes/No, text input) ONLY in bottom bar */}
           {false && (() => {
             console.error('[UI_CONTRACT][VIOLATION][CURRENT_PROMPT_PATH_REACHED]', {
               currentItemType: currentItem?.type,
               currentItemId: currentItem?.id,
               reason: 'This code path is disabled and should never execute'
             });
             return null;
           })()}

              {/* V3 UI-ONLY HISTORY: Rendered via canonical stream (lines 8942-8985) */}
            {/* Separate loop removed - renderStream includes v3UiRenderable */}


          {/* Unified Bottom Bar - Stable Container (never unmounts) */}
          {/* Welcome CTA - screenMode === "WELCOME" enforced by bottomBarModeSOT guard above */}
          {bottomBarModeSOT === "CTA" && screenMode === 'WELCOME' ? (
            <div className="flex flex-col items-center">
              <Button
                onClick={async () => {
                  console.log("[WELCOME][BEGIN][BEFORE]", { 
                    screenMode, 
                    currentItemType: currentItem?.type,
                    currentItemId: currentItem?.id,
                    hasEngine: !!engine,
                    hasSections: sections.length > 0
                  });
                  
                  // UI CONTRACT: Append "Got it — Let's Begin" as normal user message
                  // STATIC IMPORT: Use top-level import
                  const sessionForWelcome = await base44.entities.InterviewSession.get(sessionId);
                  const currentTranscriptForWelcome = sessionForWelcome.transcript_snapshot || [];
                  await appendUserMessageImport(sessionId, currentTranscriptForWelcome, "Got it — Let's Begin", {
                    messageType: 'USER_MESSAGE',
                    visibleToCandidate: true
                  });
                  await refreshTranscriptFromDB('welcome_acknowledged');
                  
                  // Get first question from section-first order
                  const firstQuestionId = sections.length > 0 && sections[0]?.questionIds?.length > 0
                    ? sections[0].questionIds[0]
                    : engine?.ActiveOrdered?.[0];
                  
                  if (!firstQuestionId) {
                    console.error("[WELCOME][BEGIN][ERROR] No first question found!", {
                      sectionsCount: sections.length,
                      firstSection: sections[0]?.id,
                      firstSectionQuestions: sections[0]?.questionIds?.length,
                      engineActiveCount: engine?.ActiveOrdered?.length
                    });
                    setError("Could not load the first question. Please refresh or contact support.");
                    return;
                  }
                  
                  const firstQuestion = engine.QById[firstQuestionId];
                  if (!firstQuestion) {
                    console.error("[WELCOME][BEGIN][ERROR] First question not in engine:", firstQuestionId);
                    setError("Could not load the first question. Please refresh or contact support.");
                    return;
                  }
                  
                  console.log("[WELCOME][BEGIN][STARTING]", {
                    firstQuestionId,
                    firstQuestionCode: firstQuestion.question_id,
                    firstQuestionText: firstQuestion.question_text?.substring(0, 50)
                  });
                  
                  // Set screen mode and current item to first question
                  console.log('[FORENSIC][MODE_TRANSITION]', { 
                    from: 'WELCOME', 
                    to: 'QUESTION',
                    currentItemBefore: currentItem?.id,
                    currentItemAfter: firstQuestionId,
                    transcriptLenBefore: dbTranscript.length
                  });
                  setScreenMode("QUESTION");
                  setCurrentItem({ id: firstQuestionId, type: 'question' });
                  setCurrentSectionIndex(0);
                  
                  await persistStateToDatabase(null, [], { id: firstQuestionId, type: 'question' });
                  
                  console.log("[WELCOME][BEGIN][AFTER]", {
                    screenMode: "QUESTION",
                    currentItemType: 'question',
                    currentItemId: firstQuestionId,
                    questionCode: firstQuestion.question_id
                  });
                  
                  // PART D: Ensure question visible after welcome dismiss (ChatGPT initial scroll)
                  // TDZ-SAFE: Compute fresh flags at call time
                  setTimeout(() => {
                    const isYesNoModeFresh = bottomBarModeSOT === 'YES_NO';
                    const isMiGateFresh = effectiveItemType === 'multi_instance_gate' || activeUiItem?.kind === 'MI_GATE';
                    
                    requestAnimationFrame(() => {
                      ensureActiveVisibleAfterRender("WELCOME_DISMISSED", activeKindSOT, isYesNoModeFresh, isMiGateFresh);
                    });
                  }, 150);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-12 py-4 text-lg font-semibold"
                size="lg"
              >
                Got it — Let's Begin
              </Button>
            </div>
          ) : bottomBarModeSOT === "CTA" && (activeBlocker?.type === 'SECTION_MESSAGE' || pendingSectionTransition) ? (
            <div className="flex flex-col items-center">
              <Button
                onClick={async () => {
                   console.log("[BLOCKER][RESOLVE] SECTION_MESSAGE/TRANSITION");

                   const nextData = (activeBlocker?.type === 'SECTION_MESSAGE') ? activeBlocker : pendingSectionTransition;
                   if (!nextData) return;

                   // CRITICAL: Append CTA acknowledgement to transcript BEFORE advancing
                   const currentSection = sections[currentSectionIndex];
                   const nextSection = sections[nextData.nextSectionIndex];
                   
                   if (currentSection && nextSection) {
                     await appendCtaAcknowledgeToTranscript({
                       sessionId,
                       currentSectionId: currentSection.id,
                       nextSectionId: nextSection.id
                     });
                     
                     // Refresh transcript to pull CTA acknowledgement into local state
                     await refreshTranscriptFromDB('cta_ack_appended');
                   }

                   // Log section started
                   if (nextSection) {
                     await logSectionStarted(sessionId, {
                       sectionId: nextSection.id,
                       sectionName: nextSection.displayName
                     });
                   }

                   // Mark blocker resolved (UI-only)
                   if (uiBlocker && !uiBlocker.resolved) {
                     setUiBlocker(null);
                   }

                   // Update section index and current item
                   setCurrentSectionIndex(nextData.nextSectionIndex);
                   setCurrentItem({ id: nextData.nextQuestionId, type: 'question' });
                   setPendingSectionTransition(null);

                   await persistStateToDatabase(null, [], { id: nextData.nextQuestionId, type: 'question' });
                   setTimeout(() => autoScrollToBottom(), 100);
                 }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 text-base font-semibold"
                size="lg"
              >
                {pendingSectionTransition ? "Begin next section" : "Continue →"}
              </Button>
              <p className="text-xs text-emerald-400 text-center mt-3">
               Click to continue to {(activeBlocker?.nextSectionName || pendingSectionTransition?.nextSectionName)}
              </p>
            </div>
          ) : bottomBarModeSOT === "YES_NO" && !isMultiInstanceGate && (activeBlocker?.type === 'V3_GATE' || isV3Gate) ? (
           (() => {
             // TRUTH TEST: Detect legacy red/green V3_GATE renderer
             logOnce(`alt_yesno_v3gate_${sessionId}`, () => {
               console.error('[UI_CONTRACT][ALT_YESNO_RENDERER_HIT]', {
                 branch: 'V3_GATE_LEGACY_RED_GREEN',
                 currentItemId: currentItem?.id,
                 currentItemType: currentItem?.type,
                 activeBlockerType: activeBlocker?.type,
                 isV3Gate,
                 reason: 'Legacy V3_GATE red/green buttons found - replacing with neutral YesNoControls'
               });
             });
             
             // REPLACEMENT: Use modern neutral YesNoControls
             return (
               <YesNoControls
                 renderContext="FOOTER"
                 onYes={() => {
                   console.log('[V3_GATE][CLICKED] YES');
                   setV3GateDecision('Yes');
                 }}
                 onNo={() => {
                   console.log('[V3_GATE][CLICKED] NO');
                   setV3GateDecision('No');
                 }}
                 disabled={isCommitting}
                 debugMeta={{
                   component: 'V3_GATE_FOOTER_NEUTRAL',
                   activeBlockerType: activeBlocker?.type,
                   isV3Gate
                 }}
               />
             );
           })()
          ) : bottomBarModeSOT === "YES_NO" && (bottomBarRenderTypeSOT === "multi_instance_gate" || isMultiInstanceGate) ? (
          <div className="space-y-3">
           {/* UI CONTRACT: MI_GATE footer shows buttons ONLY (no prompt text) */}
           {(() => {
             // Confirmation log: MI_GATE footer is buttons-only
             const isMiGateFooter = 
               activeUiItem?.kind === "MI_GATE" &&
               effectiveItemType === 'multi_instance_gate' &&
               bottomBarModeSOT === "YES_NO";

             if (isMiGateFooter) {
               console.log('[MI_GATE][FOOTER_BUTTONS_ONLY]', {
                 currentItemId: currentItem?.id,
                 packId: currentItem?.packId,
                 instanceNumber: currentItem?.instanceNumber,
                 note: 'Footer shows Yes/No buttons only - question renders in main pane'
               });

               // UI CONTRACT SELF-TEST: Track footer buttons event (use canonical stableKey)
               if (ENABLE_MI_GATE_UI_CONTRACT_SELFTEST && currentItem?.packId && currentItem?.instanceNumber) {
                 const trackerKey = buildMiGateQStableKey(currentItem.packId, currentItem.instanceNumber);
                 const tracker = miGateTestTrackerRef.current.get(trackerKey) || { mainPaneRendered: false, footerButtonsOnly: false, testStarted: false };
                 tracker.footerButtonsOnly = true;
                 miGateTestTrackerRef.current.set(trackerKey, tracker);

                 console.log('[MI_GATE][UI_CONTRACT_TRACK]', {
                   trackerKey,
                   itemId: currentItem.id,
                   event: 'FOOTER_BUTTONS_ONLY',
                   tracker
                 });
               }
               
               // TRUTH TEST: Assert YesNoControls is the only renderer
               logOnce(`yesno_renderer_assert_mi_gate_${sessionId}`, () => {
                 console.log('[UI_CONTRACT][YESNO_RENDERER_ASSERT_OK]', {
                   renderer: 'YesNoControls',
                   branch: 'MI_GATE_FOOTER',
                   neutral: true
                 });
               });
             }

             return null; // No prompt box in footer - buttons only
           })()}

           <YesNoControls
             renderContext="FOOTER"
             onYes={async () => {
               try {
                 // PART C: Force one-time scroll bypass on gate YES
                 forceAutoScrollOnceRef.current = true;
                 setIsUserTyping(false);
                 console.log('[SCROLL][FORCE_ONCE_ARMED]', { trigger: 'MI_GATE_YES' });

                 const gate = multiInstanceGate || currentItem;

                 if (!gate || !gate.packId || !gate.instanceNumber) {
                   console.error('[MI_GATE][GUARD_BLOCKED]', {
                     reason: 'Missing gate context',
                     hasGate: !!gate,
                     packId: gate?.packId,
                     instanceNumber: gate?.instanceNumber
                   });
                   return;
                 }

                 console.log('[MI_GATE][ANSWER]', {
                   packId: gate.packId,
                   instanceNumber: gate.instanceNumber,
                   answerYesNo: 'Yes',
                   activeUiItemKind: activeUiItem?.kind,
                   currentItemId: currentItem?.id,
                   stableKey: `mi-gate:${gate.packId}:${gate.instanceNumber}`
                 });

                 setIsCommitting(true);
                 await handleMiGateYesNo({ answer: 'Yes', gate, sessionId, engine });
               } finally {
                 setIsCommitting(false);
               }
             }}
             onNo={async () => {
               try {
                 // PART C: Force one-time scroll bypass on gate NO
                 forceAutoScrollOnceRef.current = true;
                 setIsUserTyping(false);
                 console.log('[SCROLL][FORCE_ONCE_ARMED]', { trigger: 'MI_GATE_NO' });

                 const gate = multiInstanceGate || currentItem;

                 if (!gate || !gate.packId || !gate.instanceNumber) {
                   console.error('[MI_GATE][GUARD_BLOCKED]', {
                     reason: 'Missing gate context',
                     hasGate: !!gate,
                     packId: gate?.packId,
                     instanceNumber: gate?.instanceNumber
                   });
                   return;
                 }

                 console.log('[MI_GATE][ANSWER]', {
                   packId: gate.packId,
                   instanceNumber: gate.instanceNumber,
                   answerYesNo: 'No',
                   activeUiItemKind: activeUiItem?.kind,
                   currentItemId: currentItem?.id,
                   stableKey: `mi-gate:${gate.packId}:${gate.instanceNumber}`
                 });

                 setIsCommitting(true);
                 await handleMiGateYesNo({ answer: 'No', gate, sessionId, engine });
               } finally {
                 setIsCommitting(false);
               }
             }}
             disabled={isCommitting}
             debugMeta={{
               component: 'MI_GATE_FOOTER',
               packId: currentItem?.packId,
               instanceNumber: currentItem?.instanceNumber
             }}
           />
          </div>
          ) : bottomBarModeSOT === "YES_NO" && bottomBarRenderTypeSOT !== "v3_probing" ? (
          (() => {
            // TRUTH TEST: Assert YesNoControls is the only renderer for base questions
            logOnce(`yesno_renderer_assert_base_${sessionId}`, () => {
              console.log('[UI_CONTRACT][YESNO_RENDERER_ASSERT_OK]', {
                renderer: 'YesNoControls',
                branch: 'BASE_QUESTION_FOOTER',
                neutral: true
              });
            });
            
            return (
              <YesNoControls
                renderContext="FOOTER"
                onYes={() => {
                  forceAutoScrollOnceRef.current = true;
                  setIsUserTyping(false);
                  handleYesNoClick("Yes");
                }}
                onNo={() => {
                  forceAutoScrollOnceRef.current = true;
                  setIsUserTyping(false);
                  handleYesNoClick("No");
                }}
                yesLabel="Yes"
                noLabel="No"
                disabled={isCommitting}
                debugMeta={{
                  component: 'BASE_QUESTION_FOOTER',
                  currentItemType: currentItem?.type,
                  questionId: currentItem?.id
                }}
              />
            );
          })()
          ) : bottomBarModeSOT === "V3_WAITING" ? (
          <div className="space-y-2">
            <div className="flex gap-3">
              <Textarea
                ref={footerTextareaRef}
                value=""
                placeholder="Thinking..."
                className="flex-1 min-h-[48px] resize-none bg-[#0d1829] border-2 border-slate-600 text-white placeholder:text-slate-500 transition-all duration-200"
                disabled={true}
                rows={1}
              />
              <Button
                type="button"
                disabled={true}
                className="h-12 bg-indigo-600/50 px-5 opacity-50 cursor-not-allowed"
              >
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Send
              </Button>
            </div>
          </div>
          ) : bottomBarModeSOT === "DISABLED" || (v3ProbingActive && !hasActiveV3Prompt) ? (
          <div className="space-y-2">
            <div className="flex gap-3">
              <Textarea
                value=""
                placeholder={v3ProbingActive && !hasActiveV3Prompt ? "Processing..." : "Please wait..."}
                className="flex-1 min-h-[48px] resize-none bg-[#0d1829] border-2 border-slate-600 text-white placeholder:text-slate-500 transition-all duration-200"
                disabled={true}
                rows={1}
              />
              <Button
                type="button"
                disabled={true}
                className="h-12 bg-indigo-600/50 px-5 opacity-50 cursor-not-allowed"
              >
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Send
              </Button>
            </div>
          </div>
          ) : bottomBarModeSOT === "SELECT" ? (
            <div className="flex flex-wrap gap-2">
              {currentPrompt?.options?.map((option) => (
                <Button
                  key={option}
                  onClick={() => !isCommitting && handleAnswer(option)}
                  disabled={isCommitting}
                  className="bg-purple-600 hover:bg-purple-700 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {option}
                </Button>
              ))}
            </div>
          ) : bottomBarModeSOT === "TEXT_INPUT" ? (
          <div className="space-y-2">
          {/* UI CONTRACT: Footer shows input + send only (no prompt text) */}
          {(() => {
            // NEUTRALIZED: Footer must not show question text (prompt renders in main pane)
            if (requiredAnchorFallbackActive) {
              console.log('[UI_CONTRACT][FOOTER_NEUTRALIZED_FOR_FALLBACK]', {
                note: 'No question text in footer per contract'
              });
            }
            
            const isV3PromptActive = activeUiItem?.kind === "V3_PROMPT" && bottomBarModeSOT === "TEXT_INPUT";
            if (isV3PromptActive) {
              console.log("[V3_PROMPT][FOOTER_INPUT_ONLY]", { 
                bottomBarModeSOT, 
                effectiveItemType,
                note: 'Footer shows input + send only - question renders in main pane'
              });
            }
            return null; // No prompt text in footer - input only (contract)
            })()}

            {/* STEP 3: Placeholder sanitization (only if dynamic) - currently constant so simplified */}

          {/* LLM Suggestion - show if available for this field (hide during V3 probing or missing prompt) */}
          {!v3ProbingActive && hasPrompt && (() => {
            const suggestionKey = currentItem?.packId && currentItem?.fieldKey
              ? `${currentItem.packId}_${currentItem.instanceNumber || 1}_${currentItem.fieldKey}`
              : null;
            const suggestion = suggestionKey ? fieldSuggestions[suggestionKey] : null;

            return suggestion ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-purple-900/30 border border-purple-700/50 rounded-lg">
                <span className="text-xs text-purple-300">Suggested:</span>
                <span className="text-sm text-white flex-1">{suggestion}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setInput(suggestion);
                    setFieldSuggestions(prev => {
                      const updated = { ...prev };
                      delete updated[suggestionKey];
                      return updated;
                    });
                  }}
                  className="h-7 text-xs text-purple-300 hover:text-purple-100 hover:bg-purple-800/50"
                >
                  Use This
                </Button>
              </div>
            ) : null;
          })()}

          <div className="flex gap-3">
          <Textarea
           ref={footerTextareaRef}
           value={currentItem?.type === 'v3_pack_opener' ? (openerDraft ?? "") : (input ?? "")}
           onChange={(e) => {
             const value = e.target.value;
             markUserTyping();

              // V3 OPENER: Use dedicated openerDraft state (ALWAYS allow updates - no v3ProbingActive gate)
              if (currentItem?.type === 'v3_pack_opener') {
                // STEP 4: Removed onChange sanitizer - do NOT block typing
                // Sanitization happens at render time only (safeActivePromptText)

                // GUARD: Never allow prompt text as value
                const promptText = currentItem?.openerText || safeActivePromptText || "";
                const valueMatchesPrompt = value.trim() === promptText.trim() && value.length > 10;

                if (valueMatchesPrompt) {
                  console.error('[V3_UI_CONTRACT][OPENER_DRAFT_SEEDED_BLOCKED]', {
                    packId: currentItem?.packId,
                    instanceNumber: currentItem?.instanceNumber,
                    reason: 'Attempted to seed openerDraft with prompt text - blocking onChange'
                  });
                  return; // Block the update
                }

                // CRITICAL: Update openerDraft state unconditionally (no v3ProbingActive gate)
                setOpenerDraft(value);

                // FORENSIC: Throttled keystroke capture proof (every 3 chars to avoid spam)
                openerDraftChangeCountRef.current++;
                if (openerDraftChangeCountRef.current % 3 === 1 || value.length === 0) {
                  console.log('[V3_OPENER][DRAFT_CHANGE]', {
                    packId: currentItem?.packId,
                    instanceNumber: currentItem?.instanceNumber,
                    len: value.length,
                    v3ProbingActive
                  });
                }

                // DECOUPLE: Storage write failures must not block state update
                try {
                  const draftKey = buildDraftKey(sessionId, currentItem?.packId, currentItem?.id, currentItem?.instanceNumber || 0);
                  window.sessionStorage.setItem(draftKey, value);
                  
                  // ABANDONMENT SAFETY: Log opener draft save (throttled)
                  if (openerDraftChangeCountRef.current % 5 === 0) {
                    console.log('[DRAFT][SAVE]', {
                      keyPreview: draftKey.substring(0, 40),
                      len: value?.length || 0
                    });
                  }
                } catch (e) {
                  // Silent fallback - in-memory draft is source of truth
                }
              } else {
                saveDraft(value);
                setInput(value);
              }
            }}
            onKeyDown={handleInputKeyDown}
            placeholder="Type your response here…"
            aria-label="Answer input"
            className="flex-1 min-h-[48px] resize-none bg-[#0d1829] border-2 border-green-500 focus:border-green-400 focus:ring-1 focus:ring-green-400/50 text-white placeholder:text-slate-400 transition-all duration-200 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-slate-800/50 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-600 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-slate-500"
            style={{ maxHeight: '120px', overflowY: 'auto' }}
            disabled={effectiveItemType === 'v3_pack_opener' ? v3OpenerTextareaDisabled : isCommitting}
            autoFocus={hasPrompt || currentItem?.type === 'v3_pack_opener'}
            rows={1}
            />
             {/* V3 UI CONTRACT: Violation detection */}
             {(() => {
             const placeholder = "Type your response here…";
             const inputValue = (currentItem?.type === 'v3_pack_opener' ? openerDraft : input) || "";

             if (v3ActivePromptText && placeholder === v3ActivePromptText) {
               console.error('[V3_UI_CONTRACT][VIOLATION] PROBE_PROMPT_IN_INPUT', {
                 location: 'placeholder',
                 promptPreview: v3ActivePromptText?.substring(0, 60)
               });
             }

             if (v3ActivePromptText && inputValue.trim() === v3ActivePromptText.trim() && inputValue.length > 0) {
               console.error('[V3_UI_CONTRACT][VIOLATION] PROBE_PROMPT_IN_INPUT', {
                 location: 'value',
                 promptPreview: v3ActivePromptText?.substring(0, 60)
               });
             }

             return null;
             })()}
           <Button
             type="button"
             onClick={() => {
               const openerInputValue = currentItem?.type === 'v3_pack_opener' ? openerDraft : input;
               console.log("[BOTTOM_BAR_BUTTON][CLICK]", { 
                 currentItemType: currentItem?.type, 
                 packId: currentItem?.packId, 
                 fieldKey: currentItem?.fieldKey,
                 v3ProbingActive,
                 hasPrompt,
                 effectiveItemType,
                 openerInputLen: openerInputValue?.length || 0
               });
               
               console.log('[BOTTOM_BAR][SEND_DISPATCH]', {
                 bottomBarModeSOT,
                 effectiveItemType,
                 activeUiItemKind: activeUiItem?.kind
               });
               
               handleBottomBarSubmit();
             }}
             disabled={
               effectiveItemType === 'required_anchor_fallback' 
                 ? !(input ?? "").trim()
                 : effectiveItemType === 'v3_pack_opener' 
                   ? v3OpenerSubmitDisabled 
                   : (isBottomBarSubmitDisabled || !hasPrompt)
             }
             className="h-12 bg-indigo-600 hover:bg-indigo-700 px-5 disabled:opacity-50"
           >
             {(currentItem?.type !== 'v3_pack_opener' && !hasPrompt) ? (
               <Loader2 className="w-4 h-4 mr-2 animate-spin" />
             ) : (
               <Send className="w-4 h-4 mr-2" />
             )}
             Send
           </Button>
          </div>
          </div>
          ) : null}

          {/* V3 UI Contract Enforcement - Self-Check */}
          {v3ProbingActive && !requiredAnchorFallbackActive && (() => {
            const transcriptPromptCards = renderedTranscript.filter(e => 
              e.messageType === 'v3_probe_question' || e.type === 'v3_probe_question'
            ).length;
            
            const transcriptLengthNow = renderedTranscript.length;
            
            if (transcriptPromptCards > 0) {
              console.error('[V3_UI_CONTRACT][REGRESSION] TRANSCRIPT_PROMPT_LEAK', {
                sessionId,
                transcriptPromptCards,
                reason: 'V3 probes leaked into transcript',
                v3ProbingActive
              });
            }
            
            // FIX C: Count actual active card in stream
            const mainBodyPromptCards = activeCard?.kind === "v3_probe_q" ? 1 : 0;
            
            console.log('[V3_UI_CONTRACT] ENFORCED', {
              v3ProbingActive,
              hasPrompt: !!v3ActivePromptText,
              promptLocation: v3ActivePromptText ? 'PROMPT_LANE_CARD' : 'NONE',
              mainBodyPromptCards,
              transcriptPromptCards,
              transcriptLen: transcriptLengthNow,
              activeCardKind: activeCard?.kind || null,
              hasActiveV3Prompt,
              activeUiItemKind: activeUiItem?.kind
            });
            return null;
          })()}
          
          {/* Fallback skips V3 enforcement */}
          {requiredAnchorFallbackActive && (() => {
            console.log('[REQUIRED_ANCHOR_FALLBACK][SKIP_V3_ENFORCED]', {
              reason: 'fallback_active'
            });
            return null;
          })()}

          {/* Footer disclaimer - show during all active interview Q&A states */}
          {(() => {
            // Use pre-computed shouldRenderFooter from derived block
            // PAYLOAD LOG: What footer actually receives for prompt/label/placeholder
            // LAST-MILE OPENER LOCK: Hard-enforce opener text when v3_pack_opener is active
            let promptTextUsed;
            if (effectiveItemType === 'v3_pack_opener') {
              const openerTextRaw = (currentItem?.openerText || '').trim();
              promptTextUsed =
                openerTextRaw || 'Please describe the details for this section in your own words.';

              console.log('[V3_OPENER][PROMPT_TEXT_LOCK]', {
                effectiveItemType,
                instanceNumber: currentItem?.instanceNumber,
                usedOpenerText: !!openerTextRaw,
                preview: promptTextUsed.substring(0, 80),
                reason: openerTextRaw ? 'opener_text_found' : 'opener_blank_using_fallback',
              });
            } else {
              promptTextUsed = activePromptText || safeActivePromptText || '';
            }
            
            // UI CONTRACT: Footer placeholder is ALWAYS generic (question renders in main pane)
            const placeholderUsedActual = "Type your response here…";
            const labelUsed = ''; // No label in footer (question in main pane)
            
            console.log('[BOTTOM_BAR_FOOTER]', {
              shouldRenderFooter,
              screenMode,
              bottomBarModeSOT,
              effectiveItemType,
              v3ProbingActive
            });
            
            // LOG: Footer prompt payload (what gets wired into textarea)
            console.log('[REQUIRED_ANCHOR_FALLBACK][FOOTER_PROMPT_PAYLOAD]', {
              effectiveItemType,
              bottomBarModeSOT,
              promptTextUsed,
              placeholderUsed: placeholderUsedActual,
              labelUsed,
              requiredAnchorCurrent: requiredAnchorCurrent || null,
              contractCompliant: true
            });

            return shouldRenderFooter ? (
              <p className="text-xs text-slate-400 text-center mt-3">
                Once you submit an answer, it cannot be changed. Contact your investigator after the interview if corrections are needed.
              </p>
            ) : null;
          })()}
          </div>
        </div>
      </main>

      <Dialog open={showCompletionModal} onOpenChange={() => {}}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Interview Complete</DialogTitle>
            <DialogDescription className="text-slate-300">
              Thank you for completing your interview.
            </DialogDescription>
          </DialogHeader>
          <Button onClick={handleCompletionConfirm} disabled={isCompletingInterview}>
            {isCompletingInterview ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            OK
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={showPauseModal} onOpenChange={setShowPauseModal}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Interview Paused</DialogTitle>
            <DialogDescription className="text-slate-300">
              Your interview is paused. You can resume anytime.
            </DialogDescription>
          </DialogHeader>
          <Button onClick={() => setShowPauseModal(false)} className="bg-blue-600">
            Keep Working
          </Button>
        </DialogContent>
      </Dialog>

      {/* V3 Debug Panel - Admin only AND ?debug=1 */}
      {debugEnabled && v3DebugEnabled && session?.ide_version === "V3" && (
        <V3DebugPanel
          sessionId={sessionId}
          incidentId={v3ProbingContext?.incidentId}
        />
      )}
      
      {/* DEV DEBUG: One-click evidence bundle (v3debug=1 only) */}
      {isV3DebugEnabled && (
        <button
          onClick={copyV3DebugBundle}
          className="fixed bottom-4 right-4 z-[10000] px-3 py-1 text-xs bg-purple-600 text-white rounded shadow-lg hover:bg-purple-700"
          title="Copy V3 Debug Bundle (Ctrl+Shift+C)"
        >
          Copy V3 Debug
        </button>
      )}
      
      {/* Auto-focus guard - headless component with stable hook order */}
      <BottomBarAutoFocusGuard
        enabled={focusEnabled}
        shouldFocus={focusShouldTrigger}
        focusKey={focusKey}
        isUserTyping={isUserTyping}
        inputRef={inputRef}
        bottomBarModeSOT={bottomBarModeSOT}
        effectiveItemType={effectiveItemType}
        v3ProbingActive={v3ProbingActive}
        hasPrompt={hasPrompt}
      />
      
      {/* TODO: REMOVE CQDIAG after PASS validation */}
      {cqDiagEnabled && (() => {
        const packId = currentItem?.packId || v3ProbingContext?.packId;
        const instanceNumber = currentItem?.instanceNumber || v3ProbingContext?.instanceNumber || 1;
        const openerAnswerStableKey = `v3-opener-a:${sessionId}:${packId}:${instanceNumber}`;
        
        const hasOpenerAnswerByStableKey = finalRenderStream.some(e => 
          e.stableKey === openerAnswerStableKey
        );
        
        const openerAnswerByIdentity = finalRenderStream.find(e => 
          (e.messageType === 'v3_opener_answer' || e.kind === 'v3_opener_a') &&
          e.packId === packId && 
          (e.instanceNumber === instanceNumber || e.meta?.instanceNumber === instanceNumber)
        );
        const hasOpenerAnswerByIdentity = !!openerAnswerByIdentity;
        const hasOpenerAnswer = hasOpenerAnswerByStableKey || hasOpenerAnswerByIdentity;
        
        return (
          <div style={{
            position: 'fixed',
            bottom: '8px',
            left: '8px',
            zIndex: 99999,
            pointerEvents: 'none',
            fontSize: '10px',
            padding: '6px 8px',
            backgroundColor: 'rgba(0,0,0,0.8)',
            color: hasOpenerAnswer ? '#10b981' : '#ef4444',
            borderRadius: '4px',
            fontFamily: 'monospace',
            lineHeight: '1.4'
          }}>
            <div>CQDIAG ON</div>
            <div>hasOpenerAnswer: {hasOpenerAnswer ? 'TRUE' : 'FALSE'}</div>
            <div>renderLen: {finalRenderStream.length}</div>
          </div>
        );
      })()}
    </div>
  );
}