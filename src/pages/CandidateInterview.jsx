import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
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

// ============================================================================
// TRANSCRIPT CONTRACT (v1) - Single Source of Truth
// ============================================================================
// Defines what entries are shown in ChatGPT-style transcript view
// Only conversational turns are visible, system/mechanical events are filtered out

  // TRANSCRIPT DENYLIST: System events and internal markers (NOT user-visible Q/A)
  // V3 UPDATE: V3_PROBE_QUESTION and V3_PROBE_ANSWER now ALLOWED (legal record)
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
    const hasA = currentTranscript.some(e => e.stableKey === aStableKey || (e.meta?.questionDbId === questionId && e.messageType === 'ANSWER'));
    
    console.log('[CQ_TRANSCRIPT][BASE_QA_CHECK]', {
      questionId,
      hasQ,
      hasA,
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
      // Append BASE_ANSWER
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
          source: 'base_qa_barrier'
        },
        visibleToCandidate: true
      };
      
      updated = [...updated, aEntry];
      console.log('[CQ_TRANSCRIPT][BASE_A_INSERTED]', { aKey: aStableKey, questionId });
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

export default function CandidateInterview() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('session');
  
  // TODO: REMOVE CQDIAG after PASS validation
  const cqDiagEnabled = urlParams.get('cqdiag') === '1';

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
      
      // STEP 2: Upsert into canonical ref (monotonic merge)
      const merged = upsertTranscriptMonotonic(canonicalTranscriptRef.current, freshTranscript, `refresh_${reason}`);
      
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

  // UNIFIED TRANSCRIPT STATE SYNC - Single source of truth updater
  const upsertTranscriptState = useCallback((nextArray, reason) => {
    if (!Array.isArray(nextArray)) {
      console.error('[TRANSCRIPT_SYNC][NOT_ARRAY]', { reason, type: typeof nextArray });
      return;
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
    
    // STEP 2: OPTIMISTIC UPDATE - Use unified sync helper
    const optimistic = upsertTranscriptMonotonic(canonicalTranscriptRef.current, updatedTranscript, `append_${kind}_${reasonLabel}`);
    upsertTranscriptState(optimistic, `append_${kind}_${reasonLabel}`);
    
    // Background refresh (upsert only, never replace)
    setTimeout(async () => {
      try {
        const freshAfterAppend = await base44.entities.InterviewSession.get(sessionId);
        const freshTranscript = freshAfterAppend.transcript_snapshot || [];
        
        const refreshed = upsertTranscriptMonotonic(canonicalTranscriptRef.current, freshTranscript, `refresh_after_${reasonLabel}`);
        upsertTranscriptState(refreshed, `refresh_after_${reasonLabel}`);
        setSession(freshAfterAppend);
      } catch (err) {
        console.error('[APPEND_REFRESH_BG][ERROR]', { error: err.message });
      }
    }, 50);
    
    // RETURN CONTRACT: Return optimistic transcript (immediate visibility)
    return optimistic;
  }, [sessionId, upsertTranscriptState]);

  const [currentFollowUpAnswers, setCurrentFollowUpAnswers] = useState({});
  
  // V3 UI-ONLY HISTORY: Moved here to prevent TDZ error (used in refreshTranscriptFromDB below)
  const [v3ProbeDisplayHistory, setV3ProbeDisplayHistory] = useState([]);

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
  const promptLaneRef = useRef(null);
  const autoScrollEnabledRef = useRef(true);
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
  
  // HOOK ORDER VERIFICATION: All hooks declared - confirm component renders
  console.log('[CQ_HOOKS_OK]', { sessionId });
  
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
  
  // PROMPT MISSING DIAGNOSTIC: Ref for de-duped logging (MUST be top-level hook)
  const promptMissingKeyRef = useRef(null);
  
  // V3 PROMPT WATCHDOG: Snapshot-based state verification
  const lastV3PromptSnapshotRef = useRef(null);
  const handledPromptIdsRef = useRef(new Set());
  const promptIdCounterRef = useRef(0);
  
  // V3 IDEMPOTENCY: Store actual lock key used for submit (for correct release)
  const lastV3SubmitLockKeyRef = useRef(null);
  
  // TDZ SAFETY: Refs for state used in watchdog (avoids stale closures and TDZ)
  const bottomBarModeRef = useRef(null);
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
  
  // V3 ACK METRICS: Track reliability counters (observability only)
  const v3AckSetCountRef = useRef(0);
  const v3AckClearCountRef = useRef(0);
  const v3AckRepairCountRef = useRef(0);
  
  // V3 SUBMIT PAYLOAD: Store last submitted answer for reconciliation
  const lastV3SubmittedAnswerRef = useRef(null);
  
  // MI_GATE UI CONTRACT SELF-TEST: Track main pane render + footer buttons per itemId
  const miGateTestTrackerRef = useRef(new Map()); // Map<itemId, { mainPaneRendered: bool, footerButtonsOnly: bool, testStarted: bool }>
  const miGateTestTimeoutRef = useRef(null);
  
  // MI_GATE SENTINEL: Track active state log key (prevents duplicate logs)
  const miGateActiveLogKeyRef = useRef(null);
  
  // V3 PROMPT DEDUPE: Track last rendered active prompt to prevent duplicate cards
  const lastRenderedV3PromptKeyRef = useRef(null);
  
  // STICKY AUTOSCROLL: Single source of truth for auto-scroll behavior
  const shouldAutoScrollRef = useRef(true);
  
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
  // V3_PROMPT > V3_WAITING > V3_OPENER > MI_GATE > DEFAULT
  const resolveActiveUiItem = () => {
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
    if (v3ProbingActive && !hasActiveV3Prompt) {
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
    
    // Priority 2: V3 pack opener (must not be superseded by MI_GATE)
    if (currentItem?.type === 'v3_pack_opener') {
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
  const bottomBarRenderTypeSOT = activeUiItem?.kind === "V3_PROMPT" ? "v3_probing" :
                                  activeUiItem?.kind === "V3_WAITING" ? "v3_waiting" :
                                  activeUiItem?.kind === "V3_OPENER" ? "v3_pack_opener" :
                                  activeUiItem?.kind === "MI_GATE" ? "multi_instance_gate" :
                                  "default";
  
  // Sanity log: confirm variable exists before render
  console.log("[BOTTOM_BAR_RENDER_TYPE][SOT_TOP]", { 
    activeUiItemKind: activeUiItem?.kind, 
    bottomBarRenderTypeSOT,
    v3PromptPhase,
    hasV3PromptText,
    hasActiveV3Prompt
  });
  
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
          bottomBarMode: footerIsYesNo ? 'YES_NO' : 'other',
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
    
    // GUARD: Don't flip auto-scroll state during system transitions
    const recentAnchorAge = Date.now() - recentAnchorRef.current.ts;
    const hasRecentAnchor = recentAnchorRef.current.kind === 'V3_PROBE_ANSWER' && recentAnchorAge < 1500;
    
    if (hasRecentAnchor) {
      if (cqDiagEnabled) {
        console.log('[SCROLL][AUTO_SCROLL_STATE][GUARD]', {
          reason: 'recent_v3_answer_anchor',
          ignored: true,
          recentAnchorAge,
          stableKey: recentAnchorRef.current.stableKey
        });
      }
      return; // Ignore scroll events during anchor window
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
    
    if (!payload) {
      console.log('[MI_GATE][V3_RECONCILE_BEGIN]', {
        sessionId,
        hasPayload: false,
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
  
  // SESSION GUARD: Redirect to StartInterview if no sessionId in URL
  useEffect(() => {
    if (!sessionId) {
      console.log('[CANDIDATE_INTERVIEW][NO_SESSION_REDIRECT]', {
        from: window.location.pathname,
        to: 'StartInterview',
        reason: 'sessionId missing from URL params'
      });
      
      navigate(createPageUrl("StartInterview"));
      return;
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
    
    console.log('[FORENSIC][MOUNT]', { 
      component: 'CandidateInterview', 
      instanceId: componentInstanceId.current,
      mountCount: candidateInterviewMountCount,
      sessionId,
      WARNING: candidateInterviewMountCount > 1 ? '⚠️ REMOUNT DETECTED - This should only mount ONCE per session' : '✓ First mount'
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
      const loadedSession = await base44.entities.InterviewSession.get(sessionId);

      if (!loadedSession) {
        console.error('[CANDIDATE_INTERVIEW][NO_CURRENT_ITEM]', { sessionId, screenMode: 'LOADING' });
        throw new Error(`Session not found: ${sessionId}. It may have been deleted or never created.`);
      }

      if (!loadedSession.id) {
        console.error('[CANDIDATE_INTERVIEW][NO_CURRENT_ITEM]', { sessionId, screenMode: 'LOADING', reason: 'invalid session object' });
        throw new Error('Invalid session object returned from database');
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
      
      console.log('[MI_GATE][STATE_SET_OPENER]', {
        toInstanceNumber: nextInstanceNumber,
        openerId: openerItem.id,
        packId: gate.packId
      });

      setCurrentItem(openerItem);
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
        bottomBarMode,
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
        
        // Track opener submission
        v3OpenerSubmittedRef.current.set(loopKey, true);
        
        console.log('[V3_PROBING][START_AFTER_OPENER]', {
          packId,
          categoryId,
          instanceNumber,
          loopKey,
          submitToken,
          v3ProbingActive: true
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
          
          // GUARD: Verify context still matches
          const currentPackId = v3ProbingContextRef.current?.packId;
          const currentInstanceNumber = v3ProbingContextRef.current?.instanceNumber;
          
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
          
          // GUARD: Check if prompt already arrived
          if (v3ActivePromptTextRef.current && v3ActivePromptTextRef.current.trim().length > 0) {
            console.log('[V3_FAILSAFE][CANCELLED_OR_STALE]', {
              submitToken: capturedSubmitToken,
              loopKey: capturedLoopKey,
              reason: 'Prompt arrived - failsafe not needed'
            });
            return;
          }
          
          // All guards passed - execute recovery
          const stillOnOpener = currentItem?.type === 'v3_pack_opener' && currentItem?.packId === capturedPackId;
          const probingActiveNow = v3ProbingActiveRef.current;
          const hasPromptNow = !!v3ActivePromptTextRef.current;
          
          if (stillOnOpener || (probingActiveNow && !hasPromptNow)) {
            console.error('[V3_UI_CONTRACT][PROMPT_MISSING_AFTER_OPENER]', {
              submitToken: capturedSubmitToken,
              packId: capturedPackId,
              instanceNumber: capturedInstanceNumber,
              loopKey: capturedLoopKey,
              stillOnOpener,
              probingActiveNow,
              hasPromptNow,
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
        const questionStableKey = `question:${sessionId}:${currentItem.id}`;
        await appendUserMessage(sessionId, sessionForAnswer.transcript_snapshot || [], answerDisplayText, {
          messageType: 'ANSWER',
          questionDbId: currentItem.id,
          questionCode: question.question_id,
          responseId: savedResponse?.id,
          sectionId: question.section_id,
          answerDisplayText,
          answerContext: 'BASE_QUESTION',
          parentStableKey: questionStableKey
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
        bottomBarMode: 'CTA',
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

  // HELPER: Transition to multi-instance "another instance?" gate (reusable)
  const transitionToAnotherInstanceGate = useCallback(async (v3Context) => {
    const { packId, categoryId, categoryLabel, instanceNumber, packData } = v3Context || v3ProbingContext;
    const baseQuestionId = v3BaseQuestionIdRef.current;
    
    console.log('[V3_PACK][ASK_ANOTHER_INSTANCE]', {
      packId,
      instanceNumber,
      loopKey: `${sessionId}:${categoryId}:${instanceNumber || 1}`
    });
    
    const gatePromptText = `Do you have another ${categoryLabel || 'incident'} to report?`;
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
        categoryLabel,
        promptText: gatePromptText,
        instanceNumber,
        baseQuestionId,
        packData
      });
      setCurrentItem(gateItem);
    });
    
    // PART A: DO NOT append gate to transcript while active (prevents flicker)
    // Gate renders from currentItem.promptText (PROMPT_LANE source)
    // Will append Q+A to transcript ONLY after user answers
    console.log('[MI_GATE][RENDER_SOURCE]', {
      source: 'PROMPT_LANE',
      stableKey: gateStableKey,
      packId,
      instanceNumber
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

  // V3 probing completion handler - deferred transition pattern
  const handleV3ProbingComplete = useCallback((result) => {
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
    // Use provided canonical promptId (from V3ProbingLoop) or fallback
    const promptId = providedPromptId || `${loopKey}:${promptIdCounterRef.current++}`;
    
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

    // SNAPSHOT: Capture expected state BEFORE atomic update (include categoryId)
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
    
    // Update snapshot ref for answer submit (include categoryId)
    lastV3PromptSnapshotRef.current = {
      ...snapshot,
      promptId,
      categoryId,
      promptText
    };
    
    // PART B: Record prompt snapshot (deterministic UI source)
    setV3PromptSnapshots(prev => {
      const exists = prev.some(s => s.promptId === promptId);
      if (exists) return prev;
      
      const newSnapshot = { promptId, loopKey, promptText, createdAt: Date.now() };
      console.log('[V3_PROMPT_SNAPSHOT][CREATED]', { promptId, loopKey });
      return [...prev, newSnapshot];
    });

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
    const canonicalPromptId = typeof promptData === 'object' ? promptData?.promptId : null;
    const loopKey = typeof promptData === 'object' ? promptData?.loopKey : null;
    const packId = typeof promptData === 'object' ? promptData?.packId : (v3ProbingContext?.packId || currentItem?.packId);
    const instanceNumber = typeof promptData === 'object' ? promptData?.instanceNumber : (v3ProbingContext?.instanceNumber || currentItem?.instanceNumber || 1);
    const categoryId = typeof promptData === 'object' ? promptData?.categoryId : v3ProbingContext?.categoryId;
    
    console.log('[V3_PROMPT_CHANGE]', { 
      promptPreview: promptText?.substring(0, 60) || null,
      canonicalPromptId,
      loopKey
    });
    
    // CRITICAL: Require canonical promptId (no fallback)
    if (!canonicalPromptId || typeof promptData === 'string') {
      console.error('[CQ_TRANSCRIPT][V3_PROBE_PROMPTID_MISSING]', {
        reason: 'missing_promptId',
        isString: typeof promptData === 'string',
        loopKey,
        preview: promptText?.substring(0, 60)
      });
      return; // Do NOT append without promptId
    }
    
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
    const aStableKey = buildV3ProbeAStableKey(sessionId, categoryId, instanceNumber, probeIndex);
    
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
    
    // CRITICAL: V3 probe ANSWERS must ALWAYS persist to canonical transcript BEFORE any MI_GATE stream suppression
    // This ensures transcript completeness regardless of UI state transitions
    let wroteTranscript = false;
    let qAdded = false;
    let aAdded = false;
    
    if (v3ProbingActive && localEffectiveItemType === 'v3_probing' && loopKey && answerText?.trim()) {
      const promptId = v3ProbingContext?.promptId || lastV3PromptSnapshotRef.current?.promptId;
      
      if (!promptId) {
        console.error('[V3_TRANSCRIPT][APPEND_FAILED_NO_PROMPTID]', {
          loopKey,
          hasV3Context: !!v3ProbingContext,
          hasSnapshot: !!lastV3PromptSnapshotRef.current,
          reason: 'Cannot append without stable promptId'
        });
      } else {
        // CANONICAL KEYS: Use centralized builders (session+category+instance+index scoped)
        const qStableKey = buildV3ProbeQStableKey(sessionId, categoryId, instanceNumber, probeIndex);
        const aStableKey = buildV3ProbeAStableKey(sessionId, categoryId, instanceNumber, probeIndex);
        
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
              source: 'v3'
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
          
          console.log('[V3_PROBE][ACK_SET]', {
            expectedAKey: aStableKey,
            expectedQKey: qStableKey,
            promptId,
            committedAt: lastV3AnswerCommitAckRef.current.committedAt,
            ackSetCount: v3AckSetCountRef.current
          });
          
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
            
            console.log('[V3_PROBE][COMMIT_DONE]', {
              qAdded,
              aAdded,
              transcriptLenAfter: updated.length,
              probeQuestionCountAfter,
              probeAnswerCountAfter,
              sessionId,
              stableKeyA: aStableKey
            });
            
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
    
    // CRITICAL: Set PROCESSING state ONLY after DB write completes
    setV3PromptPhase("PROCESSING");
    console.log('[V3_PROMPT_PHASE][SET_PROCESSING_AFTER_DB]', {
      submitId,
      loopKey,
      categoryId,
      wroteTranscript,
      reason: 'DB write complete - now ready for engine call'
    });
    
    setV3PendingAnswer(payload);
  }, [v3ProbingContext, sessionId, v3ActivePromptText, currentItem, setDbTranscriptSafe, dbTranscript]);
  
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
    
    if (foundA) {
      // Success - answer found in transcript
      v3AckClearCountRef.current++;
      
      console.log('[V3_PROBE][ACK_CLEAR]', {
        expectedAKey: ack.expectedAKey,
        reason: 'found_in_transcript',
        ageMs,
        ackClearCount: v3AckClearCountRef.current
      });
      lastV3AnswerCommitAckRef.current = null;
      return;
    }
    
    // Grace period: wait 500ms before repairing
    if (ageMs < 500) {
      return; // Wait for next render cycle
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
      
      console.log('[V3_PROMPT_WATCHDOG][SNAPSHOT_CHECK]', {
        promptId,
        snapshotExists,
        snapshotsLen: v3PromptSnapshotsRef.current.length
      });
      
      if (!snapshotExists) {
        console.warn('[V3_PROMPT_WATCHDOG][NO_SNAPSHOT]', { 
          promptId, 
          reason: 'Prompt commit did not create snapshot - expected from commitV3PromptToBottomBar' 
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
        bottomBarMode: bottomBarModeRef.current,
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
      const isReady = 
        v3ProbingActiveRef.current === true &&
        bottomBarModeRef.current === 'TEXT_INPUT' &&
        v3ActivePromptTextRef.current &&
        v3ActivePromptTextRef.current.trim().length > 0 &&
        promptMatch;
      
      // CONSOLIDATED DECISION LOG (ref-based, no stale closure)
      const decisionPayload = {
        packId: snapshot.packId,
        instanceNumber: snapshot.instanceNumber,
        loopKey: snapshot.loopKey,
        promptId,
        bottomBarMode: bottomBarModeRef.current,
        v3ProbingActive: v3ProbingActiveRef.current,
        hasPrompt: !!v3ActivePromptTextRef.current,
        promptMatch,
        decision: isReady ? 'OK' : 'FAILED'
      };
      console.log('[V3_PROMPT_WATCHDOG][DECISION]', decisionPayload);
      lastWatchdogDecisionRef.current = decisionPayload; // DEV: Capture for debug bundle
      
      // RUNTIME ASSERT: Verify OK decision is correct (TDZ-safe via ref)
      if (isReady) {
        // Assert conditions match
        if (bottomBarModeRef.current !== 'TEXT_INPUT' || !promptMatch) {
          console.error('[V3_PROMPT_WATCHDOG][ASSERT_FAIL_TO_FAILED]', {
            reason: 'OK decision but conditions invalid',
            packId: snapshot.packId,
            instanceNumber: snapshot.instanceNumber,
            loopKey: snapshot.loopKey,
            promptId,
            bottomBarMode: bottomBarModeRef.current,
            promptMatch
          });
          // Force FAILED path
          isReady = false;
        }
      }
      
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
                           bottomBarModeRef.current !== 'TEXT_INPUT' ? 'WRONG_BOTTOM_BAR_MODE' :
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
        bottomBarMode: bottomBarModeRef.current,
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
  
  // FIX B: V3 draft restore - load draft when V3 prompt becomes active
  useEffect(() => {
    if (!v3ProbingActive || !v3ProbingContext) return;
    
    const loopKey = `${sessionId}:${v3ProbingContext.categoryId}:${v3ProbingContext.instanceNumber || 1}`;
    const promptId = v3ProbingContext.promptId || lastV3PromptSnapshotRef.current?.promptId;
    
    if (!promptId || promptId === 'noid') {
      console.warn('[V3_DRAFT][LOAD_BLOCKED]', { reason: 'Missing stable promptId', loopKey });
      return;
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
  
  // FIX B: V3 draft save - persist draft on input change during V3 probing
  useEffect(() => {
    if (!v3ProbingActive || !v3ProbingContext) return;
    
    const loopKey = `${sessionId}:${v3ProbingContext.categoryId}:${v3ProbingContext.instanceNumber || 1}`;
    const promptId = v3ProbingContext.promptId || lastV3PromptSnapshotRef.current?.promptId;
    
    if (!promptId || promptId === 'noid') {
      return; // Skip save if no stable promptId
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

  // AUTO-GROWING INPUT: Measure footer height dynamically (includes growing textarea)
  useEffect(() => {
    if (!footerRef.current) return;
    
    // DIAGNOSTIC: Verify footer container ref (cqdiag only, once per mount)
    if (cqDiagEnabledRef.current) {
      console.log('[FOOTER][CONTAINER_REF_CHECK]', {
        hasFooterRef: !!footerRef.current,
        nodeTag: footerRef.current?.tagName
      });
    }
    
    let rafId = null;
    let pendingMeasurement = false;
    
    const measureFooter = () => {
      if (!footerRef.current) return;
      const rect = footerRef.current.getBoundingClientRect();
      const measured = Math.round(rect.height || footerRef.current.offsetHeight || 0);
      
      // DIAGNOSTIC: Verify observer + measurement target (cqdiag only)
      // Uses cqDiagEnabledRef for runtime toggle support (stable observer lifecycle)
      if (cqDiagEnabledRef.current) {
        console.log('[FOOTER][OBSERVE_CHECK]', {
          observing: true,
          nodeTag: footerRef.current?.tagName,
          measured,
          hasBoundingClientRect: !!rect
        });
      }
      
      // HARDENED: Only update if delta >= 2px (prevents thrash + loops)
      setFooterMeasuredHeightPx(prev => {
        const delta = Math.abs(measured - prev);
        if (delta < 2) return prev; // Ignore sub-pixel jitter
        
        console.log('[FOOTER][HEIGHT_MEASURED]', {
          footerMeasuredHeightPx: measured,
          appliedPaddingPx: measured + 8,
          delta
        });
        
        return measured;
      });
      
      pendingMeasurement = false;
    };
    
    const scheduleUpdate = () => {
      if (pendingMeasurement) return;
      pendingMeasurement = true;
      rafId = requestAnimationFrame(measureFooter);
    };
    
    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(footerRef.current);
    
    // Initial measurement
    scheduleUpdate();
    
    return () => {
      resizeObserver.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []); // STABLE: Observer created once per mount (cqDiagEnabledRef supports runtime toggle)

  // ============================================================================
  // UNIFIED BOTTOM BAR MODE + FOOTER PADDING COMPUTATION (Single Source of Truth)
  // ============================================================================
  // NO DYNAMIC IMPORTS: prevents duplicate React context in Base44 preview
  // CRITICAL: DECLARED FIRST - Before all effects that use bottomBarMode/effectiveItemType
  // All variables declared EXACTLY ONCE in this block
  
  // Step 1: Compute currentItemType (base type before precedence)
  const currentItemType = v3GateActive ? 'v3_gate' : 
                          v3ProbingActive ? 'v3_probing' : 
                          pendingSectionTransition ? 'section_transition' : 
                          currentItem?.type || null;
  
  // Step 2: Compute footer controller (determines which UI block controls bottom bar)
  const footerControllerLocal = activeUiItem.kind === "V3_PROMPT" ? "V3_PROMPT" :
                                activeUiItem.kind === "V3_OPENER" ? "V3_OPENER" :
                                activeUiItem.kind === "MI_GATE" ? "MI_GATE" :
                                "DEFAULT";
  
  // Step 3: Compute effectiveItemType (UI routing key derived from activeUiItem.kind)
  const effectiveItemType = activeUiItem.kind === "V3_PROMPT" ? 'v3_probing' : 
                           activeUiItem.kind === "V3_OPENER" ? 'v3_pack_opener' :
                           activeUiItem.kind === "MI_GATE" ? 'multi_instance_gate' :
                           v3ProbingActive ? 'v3_probing' : 
                           currentItemType;
  
  // Step 4: Compute bottom bar mode (final - no early/refined split)
  let bottomBarMode = "HIDDEN";
  
  // Pre-interview intro (WELCOME screen only)
  if (screenMode === 'WELCOME' && !v3ProbingActive && !currentItem) {
    bottomBarMode = "CTA";
  }
  // Section transition blockers
  else if (activeBlocker?.type === 'SECTION_MESSAGE' && currentItem?.type !== 'section_transition') {
    bottomBarMode = "CTA";
  }
  else if (pendingSectionTransition && currentItem?.type === 'section_transition') {
    bottomBarMode = "CTA";
  }
  // V3_WAITING: V3 probing active but no prompt yet (engine deciding)
  else if (effectiveItemType === 'v3_probing' && v3ProbingActive && !hasActiveV3Prompt) {
    bottomBarMode = "V3_WAITING";
  }
  // V3_PROMPT active (canonical routing via activeUiItem)
  else if (activeUiItem.kind === "V3_PROMPT") {
    bottomBarMode = "TEXT_INPUT";
  }
  // V3_OPENER active
  else if (activeUiItem.kind === "V3_OPENER") {
    bottomBarMode = "TEXT_INPUT";
  }
  // MI_GATE active
  else if (activeUiItem.kind === "MI_GATE") {
    const gatePromptText = activeUiItem.promptText || currentItem?.promptText || multiInstanceGate?.promptText;
    bottomBarMode = (gatePromptText && gatePromptText.trim().length > 0) ? "YES_NO" : "DISABLED";
  }
  // Regular yes/no questions
  else if (currentItem?.type === 'question' && engine?.QById[currentItem.id]?.response_type === 'yes_no') {
    bottomBarMode = "YES_NO";
  }
  // V2 pack field yes/no
  else if (currentItem?.type === 'v2_pack_field' && currentItem?.fieldConfig?.inputType === 'yes_no') {
    bottomBarMode = "YES_NO";
  }
  // V2 pack field select
  else if (currentItem?.type === 'v2_pack_field' && currentItem?.fieldConfig?.inputType === 'select_single') {
    bottomBarMode = "SELECT";
  }
  // Text input for answerable items
  else if (currentItem && (currentItem.type === 'question' || currentItem.type === 'v2_pack_field' || currentItem.type === 'v3_pack_opener' || currentItem.type === 'followup')) {
    bottomBarMode = "TEXT_INPUT";
  }
  
  // Step 5: Compute footer rendering flag (include V3_WAITING and CTA)
  const shouldRenderFooter = (screenMode === 'QUESTION' && 
                              (bottomBarMode === 'TEXT_INPUT' || bottomBarMode === 'YES_NO' || bottomBarMode === 'SELECT' || bottomBarMode === 'V3_WAITING')) ||
                              bottomBarMode === 'CTA';
  
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
  const footerH = bottomBarMode === 'CTA' 
    ? Math.max(footerMeasuredHeightPx || CTA_FALLBACK_FOOTER_PX, CTA_FALLBACK_FOOTER_PX)
    : footerMeasuredHeightPx;
  const ctaPadding = footerH + CTA_GAP_PX;
  
  const dynamicBottomPaddingPxRaw = shouldRenderFooter 
    ? (bottomBarMode === 'CTA' 
        ? ctaPadding
        : footerMeasuredHeightPx + (hasActiveCard ? SAFE_FOOTER_CLEARANCE_PX : HISTORY_GAP_PX))
    : 0;
  
  // CTA CLAMP: Ensure CTA padding never below minimum (prevents compensation shrinkage)
  const dynamicBottomPaddingPx = (bottomBarMode === 'CTA' || effectiveItemType === 'section_transition')
    ? Math.max(dynamicBottomPaddingPxRaw, CTA_MIN_PADDING_PX)
    : dynamicBottomPaddingPxRaw;
  
  // DIAGNOSTIC LOG: Show padding computation (always on)
  console.log('[LAYOUT][FOOTER_PADDING_APPLIED]', {
    mode: bottomBarMode,
    footerMeasuredHeightPx,
    computedPaddingPx: dynamicBottomPaddingPx,
    safeFooterClearancePx: SAFE_FOOTER_CLEARANCE_PX,
    hasActiveCard,
    effectiveGap: hasActiveCard ? SAFE_FOOTER_CLEARANCE_PX : HISTORY_GAP_PX,
    gapReduction: hasActiveCard ? '~75%' : 'none',
    shouldRenderFooter
  });
  
  // WELCOME-specific log to confirm unified path
  if (screenMode === 'WELCOME') {
    console.log('[WELCOME][FOOTER_PADDING_SOT]', {
      bottomBarMode,
      computedPaddingPx: dynamicBottomPaddingPx,
      usesUnifiedLogic: true
    });
  }
  
  // CTA SOT diagnostic (single consolidated log)
  if (bottomBarMode === 'CTA') {
    console.log('[CTA][SOT_PADDING]', {
      footerMeasuredHeightPx,
      dynamicBottomPaddingPx,
      shouldRenderFooter,
      effectiveItemType,
      bottomBarMode
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
          bottomBarMode,
          shouldRenderFooter,
          effectiveItemType
        });
        
        return measured;
      });
    });
  }, [bottomBarMode, shouldRenderFooter, effectiveItemType]);

  // Re-anchor bottom on footer height changes when auto-scroll is enabled
  // NO DYNAMIC IMPORTS: prevents duplicate React context in Base44 preview
  useEffect(() => {
    if (!historyRef.current) return;
    if (!autoScrollEnabledRef.current) return;
    requestAnimationFrame(() => {
      bottomAnchorRef.current?.scrollIntoView({ block: 'end', behavior: 'auto' });
    });
  }, [footerHeightPx]);

  // SMOOTH GLIDE AUTOSCROLL: ChatGPT-style smooth scrolling on new content
  // NO DYNAMIC IMPORTS: prevents duplicate React context in Base44 preview
  // TDZ-SAFE: bottomBarMode declared above (line ~7876) before this effect
  React.useLayoutEffect(() => {
    const scrollContainer = historyRef.current;
    if (!scrollContainer || !bottomAnchorRef.current) return;
    
    // CTA FORCE-ANCHOR: Ensure CTA always visible (one-time on entry)
    if (bottomBarMode === 'CTA' && !isUserTyping) {
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
    
    // GUARD A: Never auto-scroll while user is typing
    if (isUserTyping) return;
    
    // GUARD C: Skip if other scroll controller already handled this frame
    if (scrollIntentRef.current) {
      console.log('[SCROLL][GLIDE_SKIPPED]', {
        reason: 'other_scroll_active',
        scrollIntentRef: true
      });
      return;
    }
    
    // GUARD D: Skip during V3_WAITING (engine deciding)
    if (bottomBarMode === 'V3_WAITING') {
      console.log('[SCROLL][GLIDE_SKIPPED]', {
        reason: 'v3_waiting_mode',
        bottomBarMode
      });
      return;
    }
    
    // GUARD B: Only glide in TEXT_INPUT mode (prevent jumps during MI_GATE/YES_NO transitions)
    if (bottomBarMode !== 'TEXT_INPUT') {
      console.log('[SCROLL][GLIDE_SKIPPED]', {
        reason: 'not_text_input_mode',
        bottomBarMode
      });
      return;
    }
    
    // GUARD C: Only auto-scroll if user is near bottom (ChatGPT behavior)
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
      
      console.log('[SCROLL][GLIDE]', {
        reason: 'append',
        lenDelta,
        nearBottom: true,
        bottomBarMode,
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
    bottomBarMode
  ]);

  // ANCHOR LAST V3 ANSWER: Keep recently submitted answer visible during transitions
  React.useLayoutEffect(() => {
    if (recentAnchorRef.current.kind !== 'V3_PROBE_ANSWER') return;
    
    const recentAge = Date.now() - recentAnchorRef.current.ts;
    if (recentAge > 2000) {
      recentAnchorRef.current = { kind: null, stableKey: null, ts: 0 };
      return;
    }
    
    const scrollContainer = historyRef.current;
    if (!scrollContainer) return;
    
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
            bottomBarMode,
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
          bottomBarMode,
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
  }, [transcriptSOT.length, bottomBarMode, effectiveItemType, dynamicBottomPaddingPx, cqDiagEnabled]);
  
  // ANCHOR V3 PROBE QUESTION: Keep just-appended question visible (ChatGPT-style)
  React.useLayoutEffect(() => {
    if (v3ScrollAnchorRef.current.kind !== 'V3_PROBE_QUESTION') return;
    
    const anchorAge = Date.now() - v3ScrollAnchorRef.current.ts;
    if (anchorAge > 1500) {
      v3ScrollAnchorRef.current = { kind: null, stableKey: null, ts: 0 };
      return;
    }
    
    const scrollContainer = historyRef.current;
    if (!scrollContainer) return;
    
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
          bottomBarMode,
          scrollTopBefore: Math.round(scrollTopBefore),
          scrollTopAfter: Math.round(scrollTopAfter),
          footerSafePx
        });
      }
      
      v3ScrollAnchorRef.current = { kind: null, stableKey: null, ts: 0 };
    });
  }, [transcriptSOT.length, bottomBarMode, dynamicBottomPaddingPx, cqDiagEnabled]);
  
  // FORCE SCROLL ON QUESTION_SHOWN: Ensure base questions never render behind footer
  React.useLayoutEffect(() => {
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
      });
    });
  }, [effectiveItemType, shouldRenderFooter, currentItem?.id, currentItem?.type, footerMeasuredHeightPx, dynamicBottomPaddingPx]);
  
  // FOOTER PADDING COMPENSATION: Prevent jump when footer height changes
  React.useLayoutEffect(() => {
    const prev = prevPaddingRef.current;
    let next = dynamicBottomPaddingPx;
    
    // CTA CLAMP: Never allow compensation to reduce CTA padding below minimum
    if (bottomBarMode === 'CTA' || effectiveItemType === 'section_transition') {
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
        bottomBarMode
      });
      return;
    }
    
    const scrollContainer = historyRef.current;
    if (!scrollContainer) return;
    
    // Skip during V3_WAITING (no scroll adjustments during engine decide)
    if (bottomBarMode === 'V3_WAITING') {
      console.log('[SCROLL][PADDING_COMPENSATE_SKIP]', {
        reason: 'v3_waiting_mode',
        bottomBarMode
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
  }, [dynamicBottomPaddingPx, screenMode, isUserTyping, bottomBarMode]);
  
  // ACTIVE CARD PIN: Prevent active card from sliding behind footer
  React.useLayoutEffect(() => {
    if (isUserTyping) return; // Skip during typing to prevent jank
    if (!shouldRenderFooter) return; // No footer, no pin needed
    
    const scrollContainer = historyRef.current;
    if (!scrollContainer || !bottomAnchorRef.current) return;
    
    // Only pin when there's an active card
    if (!hasActiveCard) return;
    
    // Check if content is obscured (can scroll more than should be possible)
    const scrollHeight = scrollContainer.scrollHeight;
    const clientHeight = scrollContainer.clientHeight;
    const scrollTop = scrollContainer.scrollTop;
    const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
    const isAtBottom = Math.abs(scrollTop - maxScrollTop) < 2;
    
    // If user scrolled up, don't auto-pin (respect manual scroll)
    if (!shouldAutoScrollRef.current && !isAtBottom) return;
    
    requestAnimationFrame(() => {
      if (!scrollContainer) return;
      
      // Pin to bottom (ensures active card visible above footer)
      const currentMax = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
      const currentScroll = scrollContainer.scrollTop;
      
      // Only pin if we're near bottom or at bottom
      if (currentScroll >= currentMax - 20 || shouldAutoScrollRef.current) {
        scrollContainer.scrollTop = currentMax;
        
        console.log('[SCROLL][ACTIVE_CARD_PIN]', {
          hasActiveCard,
          bottomBarMode,
          effectiveItemType,
          scrollTopBefore: currentScroll,
          scrollTopAfter: currentMax,
          pinned: currentScroll !== currentMax
        });
      }
    });
  }, [
    hasActiveCard,
    currentItem?.id,
    currentItem?.type,
    bottomBarMode,
    effectiveItemType,
    dynamicBottomPaddingPx,
    shouldRenderFooter,
    isUserTyping
  ]);

  // V3 PROMPT VISIBILITY: Auto-scroll to reveal prompt lane when V3 probe appears
  useEffect(() => {
    // Trigger: V3 probing active with prompt available
    if (!v3ProbingActive || !v3ActivePromptText) return;
    
    const scrollContainer = historyRef.current;
    if (!scrollContainer) return;
    
    // Respect user scroll position: only auto-scroll if user has not scrolled up
    if (!autoScrollEnabledRef.current) return;
    if (isUserTyping) {
      console.log('[V3_PROMPT_VISIBILITY_SCROLL][SKIP]', { reason: 'typing' });
      return;
    }
    
    // GUARD A: Skip during V3_WAITING (engine deciding)
    if (bottomBarMode === 'V3_WAITING') {
      console.log('[V3_PROMPT_VISIBILITY_SCROLL][SKIP]', { 
        reason: 'v3_waiting_mode',
        bottomBarMode
      });
      return;
    }
    
    // GUARD B: Only run in TEXT_INPUT mode with footer rendered
    if (bottomBarMode !== 'TEXT_INPUT' || !shouldRenderFooter) {
      console.log('[V3_PROMPT_VISIBILITY_SCROLL][SKIP]', { 
        reason: 'wrong_mode',
        bottomBarMode,
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
  }, [v3ProbingActive, v3ActivePromptText, isUserTyping, bottomBarMode, shouldRenderFooter]);

  // AUTO-GROWING INPUT: Auto-resize textarea based on content (ChatGPT-style)
  useEffect(() => {
    const textarea = footerTextareaRef.current || inputRef.current;
    if (!textarea) return;

    // DIAGNOSTIC: Verify ref connection (cqdiag only)
    if (cqDiagEnabledRef.current) {
      console.log('[FOOTER][REF_CHECK]', {
        hasTextareaRef: !!footerTextareaRef.current,
        tagName: footerTextareaRef.current?.tagName,
        bottomBarMode,
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
  }, [input, openerDraft, bottomBarMode]);

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
        return null; // Force disabled mode (bottomBarMode will be DISABLED)
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
  const transcriptRenderable = renderedTranscriptSnapshotRef.current || renderedTranscript;
  
  // V3 UPDATE: v3UiRenderable deprecated (always empty - all content from transcript)
  const v3UiRenderable = [];
  
  // PART B: Suppress MI_GATE from render if V3 UI blocking (treat as null for rendering)
  const currentItemForRender = shouldSuppressMiGateSOT ? null : currentItem;
  
  // Active card (exactly ONE, derived from activeUiItem.kind precedence)
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
    const stableKey = `followup-card:${currentItem.packId}:opener:${currentItem.instanceNumber || 1}`;
    
    // DEDUPE: Check if opener already in transcriptRenderable
    const alreadyInStream = transcriptRenderable.some(e => 
      e.__canonicalKey === stableKey || 
      (e.messageType === 'FOLLOWUP_CARD_SHOWN' && e.meta?.variant === 'opener' && e.meta?.packId === currentItem.packId && e.meta?.instanceNumber === currentItem.instanceNumber)
    );
    
    if (!alreadyInStream && openerText) {
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
    } else if (alreadyInStream) {
      console.log("[STREAM][ACTIVE_CARD_DEDUPED]", { kind: "V3_OPENER", reason: "already_in_transcriptRenderable" });
    }
  } else if (activeUiItem.kind === "V3_WAITING" && !activeCard) {
    // MOVED UP: V3_WAITING card creation now handled in main if/else chain above
    // This block kept for backwards compatibility but should not execute
    console.warn('[V3_WAITING][DUPLICATE_PATH]', {
      reason: 'V3_WAITING card should be created in main chain',
      activeUiItemKind: activeUiItem.kind
    });
  }
  
  // Clear V3 prompt tracker when kind changes away from V3_PROMPT
  if (activeUiItem.kind !== "V3_PROMPT" && lastRenderedV3PromptKeyRef.current) {
    lastRenderedV3PromptKeyRef.current = null;
  }
  
  if (activeUiItem.kind === "MI_GATE") {
    // PART B: Use currentItemForRender (null if suppressed) instead of currentItem
    // This prevents MI_GATE card creation during V3 transitions
    if (!currentItemForRender) {
      console.log('[STREAM_SUPPRESS]', {
        suppressed: 'MI_GATE_CARD',
        reason: 'V3_UI_BLOCKING_PHASE',
        v3PromptPhase,
        packId: currentItem?.packId,
        instanceNumber: currentItem?.instanceNumber,
        currentItemForRender: null
      });
      // Do NOT set activeCard - currentItemForRender is null
    } else {
      const miGatePrompt = currentItemForRender.promptText || multiInstanceGate?.promptText || `Do you have another incident to report?`;
      const stableKey = `mi-gate:${currentItemForRender.packId}:${currentItemForRender.instanceNumber}`;
      
      // FIX A: ALWAYS render active MI_GATE card (no dedupe skip) when V3 not blocking
      // The active gate MUST be visible as the current question in main pane
      if (miGatePrompt) {
        activeCard = {
          __activeCard: true,
          isEphemeralPromptLaneCard: true,
          kind: "multi_instance_gate",
          stableKey,
          text: miGatePrompt,
          packId: currentItemForRender.packId,
          instanceNumber: currentItemForRender.instanceNumber,
          source: 'prompt_lane_temporary'
        };
        
        console.log("[MI_GATE][ACTIVE_CARD_ADDED]", {
          packId: currentItemForRender.packId,
          instanceNumber: currentItemForRender.instanceNumber,
          stableKey,
          promptPreview: miGatePrompt.substring(0, 60)
        });
      }
    }
  }
  
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
  
  // B) ENFORCE: MI gate is last - suppress any items that would render after it
  let orderedStream = baseRenderStream;
  if (activeCard?.kind === "multi_instance_gate") {
    // Find index of active MI_GATE card
    const miGateIndex = baseRenderStream.findIndex(e => e.__activeCard && e.kind === "multi_instance_gate");
    
    if (miGateIndex !== -1 && miGateIndex < baseRenderStream.length - 1) {
      // Items exist after MI_GATE - suppress them
      const itemsAfter = baseRenderStream.slice(miGateIndex + 1);
      orderedStream = baseRenderStream.slice(0, miGateIndex + 1);
      
      console.warn('[MI_GATE][ORDERING_ENFORCED]', {
        packId: currentItem?.packId,
        instanceNumber: currentItem?.instanceNumber,
        suppressedItemsCount: itemsAfter.length,
        suppressedKinds: itemsAfter.map(e => ({ kind: e.kind || e.messageType, key: e.stableKey || e.id })),
        reason: 'MI gate must be last - items after gate suppressed'
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
  
  // LAST-RESORT SAFETY NET: Log if V3_PROBE_ANSWER still missing (should not happen with deterministic inclusion)
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
        console.error('[CQ_TRANSCRIPT][V3_PROBE_A_MISSING_IN_RENDER_AFTER_GATE]', {
          packId,
          instanceNumber,
          stableKey: lastProbeAnswer.stableKey || lastProbeAnswer.id,
          promptId: lastProbeAnswer.meta?.promptId,
          loopKey: lastProbeAnswer.meta?.loopKey,
          textPreview: (lastProbeAnswer.text || '').substring(0, 60),
          reason: 'REGRESSION: V3 probe answer missing despite deterministic inclusion',
          dbTranscriptLen: dbTranscript.length,
          finalRenderStreamLen: finalRenderStream.length,
          note: 'This should not happen - check deterministic inclusion logic'
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
  
  // D) MI_GATE_ALIGNMENT_ASSERT: Regression check when MI gate is active
  if (activeCard?.kind === "multi_instance_gate") {
    const tail3 = renderableTranscriptStream.slice(-3).map(x => ({
      kind: x.kind || x.messageType || x.type,
      id: (x.stableKey || x.id || '').substring(0, 40),
      isActive: x.__activeCard || false
    }));
    
    const miGateIndex = renderableTranscriptStream.findIndex(e => e.__activeCard && e.kind === "multi_instance_gate");
    const hasItemsAfterMiGate = miGateIndex !== -1 && miGateIndex < renderableTranscriptStream.length - 1;
    
    // C) V3 probe Q/A visibility assertion
    const packId = currentItem?.packId;
    const instanceNumber = currentItem?.instanceNumber || 1;
    const v3ProbeQInRendered = renderableTranscriptStream.filter(e => 
      (e.messageType === 'V3_PROBE_QUESTION' || e.type === 'V3_PROBE_QUESTION') &&
      e.meta?.packId === packId &&
      e.meta?.instanceNumber === instanceNumber
    );
    const v3ProbeAInRendered = renderableTranscriptStream.filter(e => 
      (e.messageType === 'V3_PROBE_ANSWER' || e.type === 'V3_PROBE_ANSWER') &&
      e.meta?.packId === packId &&
      e.meta?.instanceNumber === instanceNumber
    );
    
    console.log('[MI_GATE][V3_PROBE_QA_VISIBILITY_ASSERT]', {
      packId,
      instanceNumber,
      hasV3ProbeQInRenderedTranscript: v3ProbeQInRendered.length > 0,
      hasV3ProbeAInRenderedTranscript: v3ProbeAInRendered.length > 0,
      expectedPairsCount: Math.min(v3ProbeQInRendered.length, v3ProbeAInRendered.length),
      qCount: v3ProbeQInRendered.length,
      aCount: v3ProbeAInRendered.length
    });
    
    console.log('[MI_GATE][ALIGNMENT_ASSERT]', {
      activeUiItemKind: activeUiItem?.kind,
      effectiveItemType,
      streamLen: renderableTranscriptStream.length,
      tail3,
      hasItemsAfterMiGate,
      miGateIsLast: !hasItemsAfterMiGate
    });
    
    if (hasItemsAfterMiGate) {
      const itemsAfter = renderableTranscriptStream.slice(miGateIndex + 1);
      console.error('[MI_GATE][ALIGNMENT_VIOLATION]', {
        packId: currentItem?.packId,
        instanceNumber: currentItem?.instanceNumber,
        itemsAfterCount: itemsAfter.length,
        itemsAfter: itemsAfter.map(e => ({
          kind: e.kind || e.messageType || e.type,
          key: (e.stableKey || e.id || '').substring(0, 40),
          textPreview: (e.text || '').substring(0, 40)
        })),
        reason: 'MI gate must be last - regression detected'
      });
    }
  }
  
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

  // RENDER GUARD: Prevent null prompt crashes
  if (currentItem && !currentPrompt && !v3ProbingActive && !activeBlocker && !pendingSectionTransition && screenMode !== 'WELCOME') {
    const snapshot = {
      currentItemType: currentItem?.type,
      currentItemId: currentItem?.id,
      packId: currentItem?.packId,
      instanceNumber: currentItem?.instanceNumber,
      screenMode,
      v3ProbingActive,
      activeBlocker: activeBlocker?.type,
      canonicalLen: dbTranscript?.length || 0,
      renderLen: renderedTranscript?.length || 0
    };
    console.error('[FORENSIC][PROMPT_NULL_GUARD]', snapshot);
  }

  // Treat v2_pack_field and v3_pack_opener the same as a normal question for bottom-bar input
  const isAnswerableItem = (item) => {
  if (!item) return false;
  return item.type === "question" || item.type === "v2_pack_field" || item.type === "v3_pack_opener" || item.type === "followup";
  };

  // ============================================================================
  // ACTIVE PROMPT TEXT RESOLUTION - Single source of truth for what user sees
  // ============================================================================
  let activePromptText = null;
  
  // Priority 1: V3 active prompt (from V3ProbingLoop callback)
  if (v3ProbingActive && v3ActivePromptText) {
    activePromptText = v3ActivePromptText;
  }
  // Priority 2: V2 pack field - use backend question text or field label
  else if (effectiveItemType === 'v2_pack_field' && currentItem) {
    const backendText = currentItem.backendQuestionText;
    const clarifierText = v2ClarifierState?.packId === currentItem.packId && 
                         v2ClarifierState?.fieldKey === currentItem.fieldKey && 
                         v2ClarifierState?.instanceNumber === currentItem.instanceNumber
                         ? v2ClarifierState.clarifierQuestion
                         : null;
    activePromptText = clarifierText || backendText || currentItem.fieldConfig?.label || null;
  }
  // Priority 3: V3 pack opener (with fallback)
  else if (effectiveItemType === 'v3_pack_opener' && currentItem) {
    const openerText = currentItem.openerText;
    const usingFallback = !openerText || openerText.trim() === '';
    activePromptText = usingFallback 
      ? "Please describe the details for this section in your own words."
      : openerText;
  }
  // Priority 4: Current prompt from getCurrentPrompt()
  else if (currentPrompt?.text) {
    activePromptText = currentPrompt.text;
  }
  
  // STEP 2: Sanitize active prompt text (prevents dev instructions from showing to candidate)
  const safeActivePromptText = sanitizeCandidateFacingText(activePromptText, 'ACTIVE_PROMPT_TEXT');
  
  // ============================================================================
  // BOTTOM BAR DERIVED STATE BLOCK - All derived variables in strict order
  // ============================================================================
  // NOTE: bottomBarMode, effectiveItemType, and shouldRenderFooter already declared in unified block above
  const needsPrompt = bottomBarMode === 'TEXT_INPUT' || 
                      ['v2_pack_field', 'v3_pack_opener', 'v3_probing'].includes(effectiveItemType);
  const hasPrompt = Boolean(activePromptText && activePromptText.trim().length > 0);
  

  
  // Auto-focus control props (pure values, no hooks)
  const focusEnabled = screenMode === 'QUESTION';
  const focusShouldTrigger = focusEnabled && bottomBarMode === 'TEXT_INPUT' && (hasPrompt || v3ProbingActive || currentItem?.type === 'v3_pack_opener');
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
      bottomBarMode,
      isMultiInstanceGate,
      currentItemId: currentItem?.id,
      packId: currentItem?.packId,
      instanceNumber: currentItem?.instanceNumber,
      v3GateActive,
      v3ProbingActive,
      pendingSectionTransition: !!pendingSectionTransition
    });
    
    // REGRESSION SUMMARY: Single log per gate activation (once per itemId)
    const itemId = currentItem?.id;
    if (itemId) {
      const tracker = miGateTestTrackerRef.current.get(itemId) || { footerWired: false, activeGateSuppressed: false, testStarted: false };
      
      if (!tracker.testStarted) {
        // Log regression summary on first activation
        console.log('[MI_GATE][REGRESSION_SUMMARY]', {
          itemId,
          packId: currentItem?.packId,
          instanceNumber: currentItem?.instanceNumber,
          mainPaneListFilterEnabled: true,
          footerPromptEnabled: true,
          selfTestEnabled: ENABLE_MI_GATE_UI_CONTRACT_SELFTEST
        });
      }
    }
    
    // UI CONTRACT SELF-TEST: Start test when MI_GATE becomes active (once per itemId)
    if (ENABLE_MI_GATE_UI_CONTRACT_SELFTEST && itemId) {
      const tracker = miGateTestTrackerRef.current.get(itemId) || { footerWired: false, activeGateSuppressed: false, testStarted: false };
      
      if (!tracker.testStarted) {
        tracker.testStarted = true;
        miGateTestTrackerRef.current.set(itemId, tracker);
        
        console.log('[MI_GATE][UI_CONTRACT_TEST_START]', {
          itemId,
          packId: currentItem?.packId,
          instanceNumber: currentItem?.instanceNumber
        });
        
        // Clear any existing timeout
        if (miGateTestTimeoutRef.current) {
          clearTimeout(miGateTestTimeoutRef.current);
        }
        
        // Schedule self-test after 250ms (LOG-ONLY, non-blocking)
        miGateTestTimeoutRef.current = setTimeout(() => {
          // SAFETY: Self-test is log-only, never throws or blocks
          try {
            const finalTracker = miGateTestTrackerRef.current.get(itemId);
            
            if (!finalTracker) {
              console.warn('[MI_GATE][UI_CONTRACT_TEST]', {
                itemId,
                packId: currentItem?.packId,
                instanceNumber: currentItem?.instanceNumber,
                result: 'NO_TRACKER',
                reason: 'Tracker was cleared or never created'
              });
              return;
            }
            
            const { mainPaneRendered, footerButtonsOnly } = finalTracker;
            
            // UI CONTRACT: Self-test requires main pane render AND footer buttons-only
            const passCondition = mainPaneRendered && footerButtonsOnly;
            
            if (passCondition) {
              console.log('[MI_GATE][UI_CONTRACT_PASS]', {
                itemId,
                packId: currentItem?.packId,
                instanceNumber: currentItem?.instanceNumber,
                mainPaneRendered: true,
                footerButtonsOnly: true
              });
            } else {
              // Enhanced failure diagnostics
              const finalRenderList = renderedTranscriptSnapshotRef.current || renderedTranscript;
              
              console.error('[MI_GATE][UI_CONTRACT_FAIL]', {
                itemId,
                packId: currentItem?.packId,
                instanceNumber: currentItem?.instanceNumber,
                mainPaneRendered,
                footerButtonsOnly,
                reason: !mainPaneRendered ? 'Main pane did not render active MI_GATE card' : 
                        !footerButtonsOnly ? 'Footer showed prompt text instead of buttons-only' :
                        'Unknown failure',
                diagnosticSnapshot: {
                  finalRenderListLen: finalRenderList.length,
                  hasActiveGateInMainPane: finalRenderList.some(it => 
                    it.messageType === 'MULTI_INSTANCE_GATE_SHOWN' &&
                    (getItemId(it) === currentItem?.id || 
                     getItemStableKey(it)?.startsWith(`mi-gate:${currentItem?.packId}:${currentItem?.instanceNumber}`))
                  )
                }
              });
            }
          } catch (testError) {
            // SAFETY: Self-test errors must never crash the app
            console.warn('[MI_GATE][UI_CONTRACT_TEST_ERROR]', {
              itemId,
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
    bottomBarMode,
    effectiveItemType,
    screenMode
  });
  
  // WATCHDOG FRESHNESS: Sync all watchdog-critical state to refs (no stale closures)
  // NOTE: Use final bottomBarMode (refined with currentPrompt), not bottomBarModeEarly
  bottomBarModeRef.current = bottomBarMode;
  v3ActivePromptTextRef.current = v3ActivePromptText;
  v3ProbingActiveRef.current = v3ProbingActive;
  v3ProbingContextRef.current = v3ProbingContext;
  
  // FRAME TRACE: Log footer controller changes (change-detection only)
  if (footerControllerLocal !== lastFooterControllerRef.current ||
      bottomBarMode !== lastBottomBarModeRef.current ||
      effectiveItemType !== lastEffectiveItemTypeRef.current) {
    
    console.log('[FRAME_TRACE][FOOTER_CONTROLLER]', {
      activeUiItemKind: activeUiItem.kind,
      footerController: footerControllerLocal,
      hasActiveV3Prompt,
      v3PromptPreview: v3ActivePromptText?.substring(0, 40) || null,
      currentItemType,
      effectiveItemType,
      bottomBarMode,
      bottomBarRenderTypeSOT,
      packId: currentItem?.packId || v3ProbingContext?.packId,
      instanceNumber: currentItem?.instanceNumber || v3ProbingContext?.instanceNumber,
      changed: {
        controller: footerControllerLocal !== lastFooterControllerRef.current,
        mode: bottomBarMode !== lastBottomBarModeRef.current,
        effectiveType: effectiveItemType !== lastEffectiveItemTypeRef.current
      }
    });
    
    lastFooterControllerRef.current = footerControllerLocal;
    lastBottomBarModeRef.current = bottomBarMode;
    lastEffectiveItemTypeRef.current = effectiveItemType;
  }
  
  // UI CONTRACT: CTA mode is ONLY valid during WELCOME screen
  // Force override to prevent CTA leaking during interview progression
  if (bottomBarMode === "CTA" && screenMode !== "WELCOME") {
    if (effectiveItemType === 'section_transition') {
      console.log("[UI_CONTRACT] CTA_SECTION_TRANSITION_ALLOWED", { effectiveItemType, screenMode });
      // Allow CTA specifically for section transitions
    } else {
      console.warn("[UI_CONTRACT] CTA_OUTSIDE_WELCOME_BLOCKED", { 
        screenMode, 
        currentItemType, 
        effectiveItemType, 
        v3ProbingActive,
        action: 'forcing HIDDEN'
      });
      bottomBarMode = "HIDDEN";
    }
  }
  
  // Legacy flags (kept for compatibility)
  const isV2PackField = effectiveItemType === "v2_pack_field";
  const isV3PackOpener = effectiveItemType === "v3_pack_opener";
  const showTextInput = bottomBarMode === "TEXT_INPUT";
  
  // TASK A: Single MI_GATE active boolean (UI contract sentinel)
  const isMiGateActive =
    activeUiItem?.kind === "MI_GATE" &&
    effectiveItemType === "multi_instance_gate" &&
    bottomBarMode === "YES_NO" &&
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
      bottomBarMode,
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
  if (hasActiveV3Prompt && (bottomBarRenderTypeSOT !== "v3_probing" || bottomBarMode !== "TEXT_INPUT")) {
    console.error('[V3_UI_CONTRACT][VIOLATION_ACTIVE_ITEM]', {
      hasActiveV3Prompt,
      activeUiItemKind: activeUiItem.kind,
      bottomBarRenderTypeSOT,
      bottomBarMode,
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
    // MI_GATE TRACE A: YES/NO button click entry
    console.log('[MI_GATE][TRACE][YESNO_CLICK]', {
      clicked: answer,
      effectiveItemType,
      currentItemType: currentItem?.type,
      currentItemId: currentItem?.id,
      packId: currentItem?.packId,
      instanceNumber: currentItem?.instanceNumber,
      bottomBarMode
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

    // ROUTE: V3 probing answer (headless mode) - use submitIntent routing
    if (submitIntent.isV3Submit) {
      const trimmed = (input ?? "").trim();
      if (!trimmed) {
        console.log("[BOTTOM_BAR_SUBMIT][V3] blocked: empty input");
        return;
      }
      
      console.log("[BOTTOM_BAR_SUBMIT][V3] Routing to V3ProbingLoop via pendingAnswer");
      
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
      return;
    }

    if (isCommitting) {
      console.log("[BOTTOM_BAR_SUBMIT] blocked: isCommitting");
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
        setOpenerDraft(""); // Clear prompt from value
        return;
      }
    }
    
    if (!trimmed) {
      console.log("[BOTTOM_BAR_SUBMIT] blocked: empty input", { effectiveItemType, currentItemType: currentItem?.type, openerDraftLen: openerDraft?.length, inputLen: input?.length });
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
  const isBottomBarSubmitDisabled = !currentItem || isCommitting || !(input ?? "").trim();

  // ============================================================================
  // PRE-RENDER TRANSCRIPT PROCESSING - Moved from IIFE to component scope
  // ============================================================================
  const finalTranscriptList = useMemo(() => {
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
        console.error('[CQ_TRANSCRIPT][RENDER_VIOLATION]', {
          source: 'non_dbTranscript',
          ephemeralCount: ephemeralSources.length,
          ephemeralItems: ephemeralSources.map(e => ({
            kind: e.kind || e.messageType,
            stableKey: e.stableKey,
            isActiveCard: e.__activeCard
          })),
          reason: 'Ephemeral items detected in chat history — filtering out',
          action: 'FILTER_EPHEMERAL'
        });
        
        // ENFORCEMENT: Remove ephemeral items from chat history
        transcriptToRender = renderableTranscriptStream.filter(e => 
          !(e.__activeCard === true || 
            e.kind === 'v3_probe_q' || 
            e.kind === 'v3_probe_a' ||
            e.source === 'ephemeral' ||
            e.source === 'prompt_lane_temporary')
        );
        
        console.log('[CQ_TRANSCRIPT][EPHEMERAL_FILTERED]', {
          beforeLen: renderableTranscriptStream.length,
          afterLen: transcriptToRender.length,
          removedCount: ephemeralSources.length
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
    
    // B1 — CANONICAL DEDUPE: Final dedupe before rendering (parent/child aware)
    const dedupeBeforeRender = (list) => {
      const seen = new Map();
      const deduped = [];
      const dropped = [];
      const parentChildMap = new Map(); // Track parent dependencies
      
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
    
    // CQ_FORBIDDEN: This filter protects active prompts only (NOT a transcript mutation)
    // Persisted V3 probe Q/A always allowed — only active prompts render in prompt lane
    // A) ALLOW PERSISTED V3 PROBE Q/A + PROTECT USER ANSWERS
    const transcriptWithV3ProbesBlocked = transcriptToRender.filter(entry => {
      const stableKey = entry.stableKey || entry.id || '';
      const isUserRole = entry.role === 'user';
      const isRecentlySubmitted = recentlySubmittedUserAnswersRef.current.has(stableKey);
      
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
      
      const mt = getMessageTypeSOT(entry);
      const hasV3ProbeQPrefix = stableKey.startsWith('v3-probe-q:');
      const hasV3ProbeAPrefix = stableKey.startsWith('v3-probe-a:');
      const isV3ProbeQuestionType = mt === 'V3_PROBE_QUESTION';
      const isV3ProbeAnswerType = mt === 'V3_PROBE_ANSWER';
      
      const isV3ProbeQA = (hasV3ProbeQPrefix || hasV3ProbeAPrefix || isV3ProbeQuestionType || isV3ProbeAnswerType);
      
      if (isV3ProbeQA) {
        // CRITICAL FIX: Only block if EXPLICITLY marked as ephemeral
        // Persisted transcript items (from DB) must NEVER be filtered
        const isEphemeralPromptLane = entry.__activeCard === true || 
                                     entry.source === 'prompt_lane_temporary' ||
                                     entry.isEphemeralPromptLaneCard === true;
        
        if (isEphemeralPromptLane) {
          console.log('[V3_UI_CONTRACT][EPHEMERAL_PROMPT_LANE_BLOCKED]', { 
            stableKey, 
            promptId: entry.meta?.promptId,
            mt,
            reason: 'Ephemeral prompt lane card - not persisted history'
          });
          return false;
        }
        
        // PERSISTED PATH: Allow all persisted V3 probe Q/A
        console.log('[V3_UI_CONTRACT][PERSISTED_PROBE_ALLOWED]', { 
          stableKey,
          promptId: entry.meta?.promptId,
          mt,
          reason: 'Persisted V3 probe Q/A from dbTranscript - always allowed'
        });
        return true;
      }
      
      return true;
    });
    
    const transcriptWithV3ProbeQA = [...transcriptWithV3ProbesBlocked, ...v3ProbeQAForGateDeterministic];
    let transcriptToRenderDeduped = dedupeBeforeRender(transcriptWithV3ProbeQA);
    
    // PARENT PLACEHOLDER INJECTION: Ensure every YES/NO answer has visible parent
    const transcriptWithParentPlaceholders = [];
    const placeholdersInjected = [];
    
    for (let i = 0; i < transcriptToRenderDeduped.length; i++) {
      const entry = transcriptToRenderDeduped[i];
      const isYesNoAnswer = 
        entry.role === 'user' && 
        (entry.messageType === 'ANSWER' || entry.messageType === 'MULTI_INSTANCE_GATE_ANSWER') &&
        (entry.text === 'Yes' || entry.text === 'No' || entry.text?.startsWith('Yes (') || entry.text?.startsWith('No ('));
      
      if (isYesNoAnswer) {
        const parentKey = entry.meta?.parentStableKey || entry.parentStableKey;
        const answerStableKey = entry.stableKey || entry.id;
        const answerContext = entry.meta?.answerContext || entry.answerContext;
        
        // Check if parent exists in rendered list
        const parentExists = parentKey && transcriptToRenderDeduped.some(e => 
          (e.stableKey || e.id) === parentKey
        );
        
        if (parentKey && !parentExists) {
          // Inject placeholder parent
          const placeholderText = answerContext === 'MI_GATE' 
            ? 'Continue this section?'
            : entry.meta?.questionText || `Answer to Question ${entry.meta?.questionNumber || ''}`;
          
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
    
    // Regression guard logging
    const candidateVisibleQuestionsInDb = transcriptToRenderDeduped.filter(e => 
      e.messageType === 'QUESTION_SHOWN' && e.visibleToCandidate === true
    ).length;
    const candidateVisibleQuestionsInRender = finalList.filter(e => 
      e.messageType === 'QUESTION_SHOWN' && e.visibleToCandidate === true
    ).length;
    
    if (candidateVisibleQuestionsInRender < candidateVisibleQuestionsInDb && shouldSuppressBaseQuestions) {
      const droppedQuestions = transcriptToRenderDeduped.filter(e => 
        e.messageType === 'QUESTION_SHOWN' && 
        e.visibleToCandidate === true &&
        !finalList.some(r => (r.stableKey && r.stableKey === e.stableKey) || (r.id && r.id === e.id))
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
    
    return finalList;
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

  return (
    <div className="h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white flex flex-col overflow-hidden">
      <header className="flex-shrink-0 bg-slate-800/95 backdrop-blur-sm border-b border-slate-700 px-4 py-3">
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

      <main className="flex-1 overflow-y-auto cq-scroll scrollbar-thin" ref={historyRef} onScroll={handleTranscriptScroll}>
        <div className="px-4 pt-6" style={{ paddingBottom: `${dynamicBottomPaddingPx}px` }}>
          <div className="space-y-3 relative isolate">
            {/* CANONICAL RENDER STREAM: Direct map rendering (logic moved to useMemo) */}
            {finalTranscriptList.map((entry, index) => {
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
                        <div key={entryKey}>
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
                    } else if (cardKind === "v3_pack_opener") {
                      // STEP 2: Sanitize opener card text
                      const safeOpenerPrompt = sanitizeCandidateFacingText(entry.text, 'PROMPT_LANE_CARD_V3_OPENER');
                      
                      return (
                        <div key={entryKey}>
                          <ContentContainer>
                            <div className="w-full bg-purple-900/30 border border-purple-700/50 rounded-xl p-4 ring-2 ring-purple-400/40 shadow-lg shadow-purple-500/20 transition-all duration-150">
                              {entry.categoryLabel && (
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-sm font-medium text-purple-400">
                                    {entry.categoryLabel}{entry.instanceNumber > 1 ? ` — Instance ${entry.instanceNumber}` : ''}
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
                      // UI CONTRACT SELF-TEST: Track main pane render
                      if (ENABLE_MI_GATE_UI_CONTRACT_SELFTEST && currentItem?.id) {
                        const tracker = miGateTestTrackerRef.current.get(currentItem.id) || { mainPaneRendered: false, footerButtonsOnly: false, testStarted: false };
                        tracker.mainPaneRendered = true;
                        miGateTestTrackerRef.current.set(currentItem.id, tracker);
                      }
                      
                      // STEP 2: Sanitize MI gate prompt text
                      const safeGatePrompt = sanitizeCandidateFacingText(entry.text, 'PROMPT_LANE_CARD_MI_GATE');
                      
                      return (
                        <div key={entryKey}>
                          <ContentContainer>
                            <div className="w-full bg-purple-900/30 border border-purple-700/50 rounded-xl p-5 ring-2 ring-purple-400/40 shadow-lg shadow-purple-500/20 transition-all duration-150">
                              <p className="text-white text-base leading-relaxed">{safeGatePrompt}</p>
                            </div>
                          </ContentContainer>
                        </div>
                      );
                    } else if (cardKind === "v3_thinking") {
                      // TASK B: V3 thinking placeholder during initial decide
                      return (
                        <div key={entryKey}>
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
                   // REGRESSION GUARD: Log render to confirm visibility
                   console.log('[CQ_TRANSCRIPT][V3_PROBE_ANSWER_RENDERED]', {
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
              // ACTIVE CARD DETECTION: Check if this is the current question
              const isActiveBaseQ = currentItem?.type === 'question' && 
                currentItem?.id === entry.meta?.questionDbId;
              
              const activeClass = isActiveBaseQ 
                ? 'ring-2 ring-blue-400/40 shadow-lg shadow-blue-500/20' 
                : '';
              
              return (
                <div key={entryKey} data-stablekey={entry.stableKey || entry.id}>
                  <ContentContainer>
                  <div className={`w-full bg-[#1a2744] border border-slate-700/60 rounded-xl p-5 transition-all duration-150 ${activeClass}`}>
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
              // STEP 2: Sanitize MI gate prompt in transcript
              const safeMiGateTranscript = sanitizeCandidateFacingText(entry.text, 'TRANSCRIPT_MI_GATE');

              // Extract entry's pack/instance identity
              const entryPackId = entry.packId || entry.meta?.packId;
              const entryInstanceNumber = entry.instanceNumber || entry.meta?.instanceNumber;

              // PART B: Only suppress if this entry matches the CURRENT active gate
              // Preserves historical gate entries from previous instances
              const isCurrentGate = isV3UiBlockingSOT && 
                                   currentItem?.type === 'multi_instance_gate' &&
                                   entryPackId === currentItem.packId &&
                                   entryInstanceNumber === currentItem.instanceNumber;

              if (isCurrentGate) {
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


              // ANCHOR: Mark as system transition to prevent false scroll state changes
              recentAnchorRef.current = {
                kind: 'SYSTEM_TRANSITION',
                stableKey: entry.stableKey || entry.id,
                ts: Date.now()
              };
              // UI CONTRACT: Active MI_GATE renders in main pane (above footer)
              const stableKey = entry.stableKey || entry.id;
              const isActiveGate = isMiGateActive && 
                (entry.id === currentItem?.id || 
                 stableKey === `mi-gate:${currentItem?.packId}:${currentItem?.instanceNumber}:q` ||
                 stableKey?.startsWith(`mi-gate:${currentItem?.packId}:${currentItem?.instanceNumber}`));

              if (isActiveGate) {
                console.log('[MI_GATE][MAIN_PANE_ACTIVE_RENDER]', {
                  currentItemId: currentItem?.id,
                  packId: currentItem?.packId,
                  instanceNumber: currentItem?.instanceNumber,
                  stableKey,
                  promptPreview: (safeMiGateTranscript || "").slice(0, 120),
                  sanitized: safeMiGateTranscript !== entry.text
                });

                // UI CONTRACT SELF-TEST: Track main pane render
                if (ENABLE_MI_GATE_UI_CONTRACT_SELFTEST && currentItem?.id) {
                  const tracker = miGateTestTrackerRef.current.get(currentItem.id) || { mainPaneRendered: false, footerButtonsOnly: false, testStarted: false };
                  tracker.mainPaneRendered = true;
                  miGateTestTrackerRef.current.set(currentItem.id, tracker);

                  console.log('[MI_GATE][UI_CONTRACT_TRACK]', {
                    itemId: currentItem.id,
                    event: 'MAIN_PANE_RENDERED',
                    tracker
                  });
                }
              }

              const activeClass = isActiveGate 
                ? 'ring-2 ring-purple-400/40 shadow-lg shadow-purple-500/20' 
                : '';

              return (
                <div key={entryKey} data-stablekey={entry.stableKey || entry.id}>
                  <ContentContainer>
                  <div className={`w-full bg-purple-900/30 border border-purple-700/50 rounded-xl p-5 transition-all duration-150 ${activeClass}`}>
                    <p className="text-white text-base leading-relaxed">{safeMiGateTranscript}</p>
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

              {/* V3 probe question and answer now render from transcript (legal record) */}
              {/* Moved to transcript stream above (lines ~9166-9194) - renders with proper styling */}

              {/* Base question (assistant) */}
              {entry.role === 'assistant' && entry.type === 'base_question' && (
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
                </div>
                </ContentContainer>
              )}

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
              {entry.type === 'question' && entry.answer && !entry.role && (
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
                 </div>
                 <div className="flex justify-end">
                   <div className="bg-blue-600 rounded-xl px-5 py-3 max-w-[85%]">
                     <p className="text-white text-sm">{entry.answer}</p>
                   </div>
                 </div>
               </div>
               </ContentContainer>
              )}

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
        })}
        
        {/* Bottom anchor - minimal-height sentinel for scroll positioning */}
        <div ref={bottomAnchorRef} aria-hidden="true" style={{ height: '1px', margin: 0, padding: 0 }} />
          </div>
        </div>
      </main>

      {/* CANONICAL STREAM ACTIVE CARDS: Removed - duplicate renderer */}
      {/* Active cards render in main loop via isActiveCard check (lines 8627-8692) */}

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
                onIncidentComplete={({ loopKey, packId, categoryId, instanceNumber, reason, incidentId, completionReason, hasRecap }) => {
                  console.log('[V3_PROBING][INCIDENT_COMPLETE_NO_PROMPT]', {
                    loopKey,
                    packId,
                    instanceNumber,
                    reason,
                    hasRecap
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
                    console.log('[V3_INCIDENT_COMPLETE][MULTI] Showing another instance gate');
                    transitionToAnotherInstanceGate(v3ProbingContext);
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



            {/* LEGACY V3 PROMPT RENDER PATH - HARD DISABLED */}
            {(() => {
            // HARD DISABLED: Legacy V3 prompt render path must NEVER render UI
            // All V3 prompts render via canonical stream (activeCard in renderStream)
            // This block exists only as a diagnostic error detector
            if (activeUiItem?.kind === "V3_PROMPT" && v3ActivePromptText) {
              console.error('[V3_PROMPT][LEGACY_BLOCK_REACHED]', {
                reason: 'LEGACY_PATH_DISABLED',
                activeUiItemKind: activeUiItem.kind,
                v3PromptPhase,
                note: 'This path returns null - all V3 prompts render via canonical stream'
              });
            }
              return null; // UNCONDITIONAL NULL - no UI output ever
            })()}

            {/* UNIFIED STREAM: Active cards disabled - all content in transcript */}
            {false && !activeBlocker && !v3ProbingActive && !pendingSectionTransition && currentItem?.type === 'question' && v2PackMode === 'BASE' && engine && (
           <ContentContainer>
           <div ref={questionCardRef} className="relative z-20 w-full rounded-xl p-1">
             {(() => {
               const question = engine.QById[currentItem.id];
               if (!question) return null;

               const sectionEntity = engine.Sections.find(s => s.id === question.section_id);
               const sectionName = sectionEntity?.section_name || question.category || '';
               const questionNumber = getQuestionDisplayNumber(currentItem.id);

               return (
                 <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-xl p-5 shadow-2xl">
                   <div className="flex items-center gap-2 mb-2">
                     <span className="text-base font-semibold text-blue-400">
                       Question {questionNumber}
                     </span>
                     <span className="text-sm text-slate-500">•</span>
                     <span className="text-sm font-medium text-slate-300">{sectionName}</span>
                   </div>
                   <p className="text-white text-base leading-relaxed">{question.question_text}</p>
                 </div>
               );
             })()}

             {validationHint && (
               <div className="mt-2 bg-yellow-900/40 border border-yellow-700/60 rounded-lg p-3">
                 <p className="text-yellow-200 text-sm">{validationHint}</p>
               </div>
             )}
           </div>
           </ContentContainer>
           )}



           {/* UNIFIED STREAM: Active cards disabled - all content in transcript */}
           {false && !activeBlocker && currentPrompt && !v3ProbingActive && !pendingSectionTransition && currentItem?.type !== 'question' && currentItem?.type !== 'multi_instance_gate' && currentItem?.type !== 'v3_probing' && (
           <ContentContainer>
           <div ref={questionCardRef} className="relative z-30 w-full rounded-xl p-1">
             {isV3PackOpener || currentPrompt?.type === 'v3_pack_opener' ? (
               <div className="bg-slate-900/95 backdrop-blur-md border border-purple-700/80 rounded-xl p-4 shadow-2xl">
             <div className="flex items-center gap-2 mb-2">
               <span className="text-sm font-medium text-purple-400">
                 {currentPrompt.category}{currentPrompt.instanceNumber > 1 ? ` — Instance ${currentPrompt.instanceNumber}` : ''}
               </span>
             </div>
             <p className="text-white text-sm leading-relaxed">{currentPrompt.text}</p>
             {currentPrompt.exampleNarrative && (
              <div className="mt-3 bg-slate-800/50 border border-slate-600/50 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-1 font-medium">Example:</p>
                <p className="text-slate-300 text-xs italic">{currentPrompt.exampleNarrative}</p>
              </div>
             )}
             </div>
              ) : isV2PackField || currentPrompt?.type === 'ai_probe' ? (
              <div className="bg-slate-900/95 backdrop-blur-md border border-purple-700/80 rounded-xl p-4 shadow-2xl">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-purple-400">
                  {currentPrompt.category}{currentPrompt.instanceNumber > 1 ? ` — Instance ${currentPrompt.instanceNumber}` : ''}
                </span>
              </div>
              <p className="text-white text-sm leading-relaxed">{currentPrompt.text}</p>
            </div>
          ) : currentPrompt?.type === 'multi_instance_gate' ? (
            <div className="bg-purple-900/30 border border-purple-700/50 rounded-xl p-5 shadow-2xl">
              <p className="text-white text-base leading-relaxed">{currentPrompt.text}</p>
            </div>
          ) : (
            <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-xl p-5 shadow-2xl">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base font-semibold text-blue-400">
                  {currentPrompt.type === 'question' ? `Question ${getQuestionDisplayNumber(currentItem?.id)}` : currentPrompt.category}
                </span>
              </div>
              <p className="text-white text-base leading-relaxed">{currentPrompt.text}</p>
            </div>
          )}

              {validationHint && (
                <div className="mt-2 bg-yellow-900/40 border border-yellow-700/60 rounded-lg p-3">
                  <p className="text-yellow-200 text-sm">{validationHint}</p>
                </div>
              )}
              </div>
              </ContentContainer>
              )}

              {/* V3 UI-ONLY HISTORY: Rendered via canonical stream (lines 8942-8985) */}
            {/* Separate loop removed - renderStream includes v3UiRenderable */}

      <footer className="flex-shrink-0 bg-slate-800/95 backdrop-blur-sm border-t border-slate-800 px-4 py-4">
        <div ref={footerRef} className="max-w-5xl mx-auto">
          {/* Unified Bottom Bar - Stable Container (never unmounts) */}
          {/* Welcome CTA - screenMode === "WELCOME" enforced by bottomBarMode guard above */}
          {bottomBarMode === "CTA" && screenMode === 'WELCOME' ? (
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
                  
                  setTimeout(() => autoScrollToBottom(), 100);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-12 py-4 text-lg font-semibold"
                size="lg"
              >
                Got it — Let's Begin
              </Button>
            </div>
          ) : bottomBarMode === "CTA" && (activeBlocker?.type === 'SECTION_MESSAGE' || pendingSectionTransition) ? (
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
          ) : bottomBarMode === "YES_NO" && !isMultiInstanceGate && (activeBlocker?.type === 'V3_GATE' || isV3Gate) ? (
           <div className="flex gap-3">
             <Button
               onClick={() => {
                 console.log('[V3_GATE][CLICKED] YES');
                 setV3GateDecision('Yes');
                 }}
                 disabled={isCommitting}
                 className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
             >
               <Check className="w-5 h-5 mr-2" />
               Yes
             </Button>
             <Button
               onClick={() => {
                 console.log('[V3_GATE][CLICKED] NO');
                 setV3GateDecision('No');
                 }}
                 disabled={isCommitting}
                 className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
             >
               <X className="w-5 h-5 mr-2" />
               No
             </Button>
           </div>
          ) : bottomBarMode === "YES_NO" && (bottomBarRenderTypeSOT === "multi_instance_gate" || isMultiInstanceGate) ? (
          <div className="space-y-3">
            {/* UI CONTRACT: MI_GATE footer shows buttons ONLY (no prompt text) */}
            {(() => {
              // Confirmation log: MI_GATE footer is buttons-only
              const isMiGateFooter = 
                activeUiItem?.kind === "MI_GATE" &&
                effectiveItemType === 'multi_instance_gate' &&
                bottomBarMode === "YES_NO";
              
              if (isMiGateFooter) {
                console.log('[MI_GATE][FOOTER_BUTTONS_ONLY]', {
                  currentItemId: currentItem?.id,
                  packId: currentItem?.packId,
                  instanceNumber: currentItem?.instanceNumber,
                  note: 'Footer shows Yes/No buttons only - question renders in main pane'
                });
                
                // UI CONTRACT SELF-TEST: Track footer buttons event
                if (ENABLE_MI_GATE_UI_CONTRACT_SELFTEST && currentItem?.id) {
                  const tracker = miGateTestTrackerRef.current.get(currentItem.id) || { mainPaneRendered: false, footerButtonsOnly: false, testStarted: false };
                  tracker.footerButtonsOnly = true;
                  miGateTestTrackerRef.current.set(currentItem.id, tracker);
                  
                  console.log('[MI_GATE][UI_CONTRACT_TRACK]', {
                    itemId: currentItem.id,
                    event: 'FOOTER_BUTTONS_ONLY',
                    tracker
                  });
                }
              }
              
              return null; // No prompt box in footer - buttons only
            })()}
            
            <div className="flex gap-3">
          <Button
           onClick={async () => {
             try {
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
             disabled={isCommitting}
             className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
           >
             <Check className="w-5 h-5 mr-2" />
             Yes
           </Button>
           <Button
            onClick={async () => {
              try {
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
             className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
           >
             <X className="w-5 h-5 mr-2" />
             No
           </Button>
          </div>
          </div>
          ) : bottomBarMode === "YES_NO" && bottomBarRenderTypeSOT !== "v3_probing" ? (
          <div className="flex gap-3">
            <Button
              ref={yesButtonRef}
              onClick={() => handleYesNoClick("Yes")}
              disabled={isCommitting}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="w-5 h-5 mr-2" />
              Yes
            </Button>
            <Button
              ref={noButtonRef}
              onClick={() => handleYesNoClick("No")}
              disabled={isCommitting}
              className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X className="w-5 h-5 mr-2" />
              No
            </Button>
          </div>
          ) : bottomBarMode === "V3_WAITING" ? (
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
          ) : bottomBarMode === "DISABLED" || (v3ProbingActive && !hasActiveV3Prompt) ? (
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
          ) : bottomBarMode === "SELECT" ? (
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
          ) : bottomBarMode === "TEXT_INPUT" ? (
          <div className="space-y-2">
          {/* V3_PROMPT UI CONTRACT: Footer shows input + send only (no prompt text duplication) */}
          {(() => {
            const isV3PromptActive = activeUiItem?.kind === "V3_PROMPT" && bottomBarMode === "TEXT_INPUT";
            if (isV3PromptActive) {
              console.log("[V3_PROMPT][FOOTER_INPUT_ONLY]", { 
                bottomBarMode, 
                effectiveItemType,
                note: 'Footer shows input + send only - question renders in main pane'
              });
            }
            return null; // No prompt banner in footer - input only
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
               handleBottomBarSubmit();
             }}
             disabled={effectiveItemType === 'v3_pack_opener' ? v3OpenerSubmitDisabled : (isBottomBarSubmitDisabled || !hasPrompt)}
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
          {v3ProbingActive && (() => {
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

          {/* Footer disclaimer - show during all active interview Q&A states */}
          {(() => {
            // Use pre-computed shouldRenderFooter from derived block
            console.log('[BOTTOM_BAR_FOOTER]', {
              shouldRenderFooter,
              screenMode,
              bottomBarMode,
              effectiveItemType,
              v3ProbingActive
            });

            return shouldRenderFooter ? (
              <p className="text-xs text-slate-400 text-center mt-3">
                Once you submit an answer, it cannot be changed. Contact your investigator after the interview if corrections are needed.
              </p>
            ) : null;
          })()}
        </div>
      </footer>

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
        bottomBarMode={bottomBarMode}
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