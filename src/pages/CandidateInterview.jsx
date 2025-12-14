import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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
import { getSystemConfig, getEffectiveInterviewMode } from "../components/utils/systemConfigHelpers";
import { getFactModelForCategory, mapPackIdToCategory } from "../components/utils/factModelHelpers";
import V3ProbingLoop from "../components/interview/V3ProbingLoop";
import V3DebugPanel from "../components/interview/V3DebugPanel";
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
  logFollowupCardShown
} from "../components/utils/chatTranscriptHelpers";

// Global logging flag for CandidateInterview
const DEBUG_MODE = false;

// Simple in-memory registry so we only log each question once per session.
// Key format: `${sessionId}::${questionKey}`
const transcriptQuestionLogRegistry = new Set();

// ============================================================================
// TRANSCRIPT CONTRACT (v1) - Single Source of Truth
// ============================================================================
// Defines what entries are shown in ChatGPT-style transcript view
// Only conversational turns are visible, system/mechanical events are filtered out

  // TRANSCRIPT FILTERING: Canonical render filter (visibleToCandidate only)
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
  ]);

  // Helper: Filter renderable transcript entries (no flicker)
  const isRenderableTranscriptEntry = (t) => {
    if (!t) return false;

    const mt = t.messageType || t.type;

    // Never show SYSTEM_EVENT or internal markers
    if (mt === 'SYSTEM_EVENT') return false;

    // Never show typing/thinking/loading placeholders (prevents flicker)
    if (
      mt === 'ASSISTANT_TYPING' ||
      mt === 'TYPING' ||
      mt === 'THINKING' ||
      mt === 'LOADING' ||
      mt === 'PROBE_THINKING' ||
      mt === 'V3_THINKING' ||
      mt === 'PLACEHOLDER'
    ) return false;

    // Apply denylist
    if (TRANSCRIPT_DENYLIST.has(mt)) return false;

    // Only show candidate-visible messages
    if (t.visibleToCandidate !== true) return false;

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

// V3 Probing feature flag
const ENABLE_V3_PROBING = true;

// Feature flag: Enable chat virtualization for long interviews
const ENABLE_CHAT_VIRTUALIZATION = false;

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

const createChatEvent = (type, data = {}) => {
  const baseEvent = {
    id: `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
  const { packId, fieldKey, fieldValue, previousProbesCount, incidentContext, sessionId, questionCode, baseQuestionId, instanceNumber } = params;

  console.log('[V2_PER_FIELD][SEND] ========== CALLING BACKEND PER-FIELD PROBE ==========');
  console.log(`[V2_PER_FIELD][SEND] pack=${packId} field=${fieldKey} instance=${instanceNumber || 1}`);
  console.log('[V2_PER_FIELD][SEND] params:', {
    packId,
    fieldKey,
    fieldValueLength: fieldValue?.length || 0,
    fieldValuePreview: fieldValue?.substring?.(0, 50) || fieldValue,
    previousProbesCount,
    sessionId,
    questionCode,
    baseQuestionId,
    instanceNumber: instanceNumber || 1
  });



  try {
    const response = await base44Client.functions.invoke('probeEngineV2', {
      pack_id: packId,
      field_key: fieldKey,
      field_value: fieldValue,
      previous_probes_count: previousProbesCount || 0,
      incident_context: incidentContext || {},
      session_id: sessionId,
      question_code: questionCode,
      instance_number: instanceNumber || 1,
      mode: 'VALIDATE_FIELD'
    });

    console.log('[V2_PER_FIELD][RECV] ========== BACKEND RESPONSE RECEIVED ==========');
    console.log(`[V2_PER_FIELD][RECV] pack=${packId} field=${fieldKey} result:`, {
      mode: response.data?.mode,
      hasQuestion: !!response.data?.question,
      questionPreview: response.data?.question?.substring?.(0, 60),
      followupsCount: response.data?.followups?.length || 0
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
    console.error('[V2_PER_FIELD][ERROR] Backend call failed:', { packId, fieldKey, message: err?.message });
    return {
      mode: 'ERROR',
      message: err.message || 'Failed to call probeEngineV2'
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
  setBackendQuestionTextMap
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

  const [engine, setEngine] = useState(null);
  const [session, setSession] = useState(null);
  const [department, setDepartment] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [sections, setSections] = useState([]);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [completedSectionsCount, setCompletedSectionsCount] = useState(0);
  const activeSection = sections[currentSectionIndex] || null;

  // CANONICAL TRANSCRIPT: Read-only mirror of session.transcript_snapshot (DB)
  const [dbTranscript, setDbTranscript] = useState([]);
  const [queue, setQueue] = useState([]);
  const [currentItem, setCurrentItem] = useState(null);

  // STATE HOISTED: Must be declared before forensicCheck (prevents TDZ crash)
  const [screenMode, setScreenMode] = useState("LOADING");
  const [uiBlocker, setUiBlocker] = useState(null);
  const activeBlocker = uiBlocker; // UI-only blocker, not from canonical transcript
  
  // Dev guardrail: Ensure transcript never shrinks (applied to canonical DB mirror)
  const setDbTranscriptSafe = useCallback((updater) => {
    setDbTranscript(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (process.env.NODE_ENV !== 'production') {
        if (next.length < prev.length) {
          console.error('[TRANSCRIPT_BUG] length decreased!', { 
            prevLen: prev.length, 
            nextLen: next.length,
            diff: prev.length - next.length
          });
        }
      }
      return next;
    });
  }, []);
  
  // CANONICAL SOURCE: Refresh transcript from DB after any write
  const refreshTranscriptFromDB = useCallback(async (reason) => {
    try {
      const freshSession = await base44.entities.InterviewSession.get(sessionId);
      const freshTranscript = freshSession.transcript_snapshot || [];
      setSession(freshSession); // Sync session state to prevent stale reads
      setDbTranscriptSafe(freshTranscript);
      console.log('[TRANSCRIPT_REFRESH]', { reason, freshLen: freshTranscript.length });
      return freshTranscript;
    } catch (err) {
      console.error('[TRANSCRIPT_REFRESH][ERROR]', { reason, error: err.message });
      return dbTranscript; // Fallback to current state on error
    }
  }, [sessionId, dbTranscript, setDbTranscriptSafe]);

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

  // CANONICAL HELPER: Append to DB transcript + refresh local mirror
  const appendAndRefresh = useCallback(async (kind, payload, reasonLabel) => {
    const { appendUserMessage, appendAssistantMessage } = await import("../components/utils/chatTranscriptHelpers");
    
    const freshSession = await base44.entities.InterviewSession.get(sessionId);
    const currentTranscript = freshSession.transcript_snapshot || [];
    
    let updatedTranscript;
    if (kind === 'user') {
      updatedTranscript = await appendUserMessage(sessionId, currentTranscript, payload.text, payload.metadata || {});
    } else if (kind === 'assistant') {
      updatedTranscript = await appendAssistantMessage(sessionId, currentTranscript, payload.text, payload.metadata || {});
    } else {
      console.error('[APPEND_AND_REFRESH] Unknown kind:', kind);
      return currentTranscript;
    }
    
    // Refresh local mirror from DB
    const freshAfterAppend = await base44.entities.InterviewSession.get(sessionId);
    const freshTranscript = freshAfterAppend.transcript_snapshot || [];
    setSession(freshAfterAppend); // Sync session state to prevent stale reads
    setDbTranscriptSafe(freshTranscript);
    
    console.log('[APPEND_AND_REFRESH]', { kind, reasonLabel, freshLen: freshTranscript.length });
    return freshTranscript;
  }, [sessionId, setDbTranscriptSafe]);

  const [currentFollowUpAnswers, setCurrentFollowUpAnswers] = useState({});

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
  const displayOrderRef = useRef(0);
  const inputRef = useRef(null);
  const yesButtonRef = useRef(null);
  const noButtonRef = useRef(null);
  const questionCardRef = useRef(null);
  const [questionCardHeight, setQuestionCardHeight] = useState(0);
  const [textareaRows, setTextareaRows] = useState(1);
  const unsubscribeRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const aiResponseTimeoutRef = useRef(null);

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
  // Track V3-enabled packs: Map<packId, { isV3: boolean, factModelReady: boolean }>
  const [v3EnabledPacks, setV3EnabledPacks] = useState({});
  // V3 Debug mode
  const [v3DebugEnabled, setV3DebugEnabled] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [isNewSession, setIsNewSession] = useState(true);

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
    () => dbTranscript.filter(t => t.type === 'question').length,
    [dbTranscript]
  );
  const questionCompletionPct = totalQuestionsAllSections > 0
    ? Math.round((answeredQuestionsAllSections / totalQuestionsAllSections) * 100)
    : 0;

  // Compute next renderable (dedupe + filter)
  const nextRenderable = React.useMemo(() => {
    const base = Array.isArray(dbTranscript) ? dbTranscript : [];
    return dedupeByStableKey(base).filter(isRenderableTranscriptEntry);
  }, [dbTranscript]);

  // Freeze render during refresh (prevents flash-to-empty)
  const [renderTranscript, setRenderTranscript] = React.useState([]);

  React.useEffect(() => {
    setRenderTranscript((prev) => {
      const prevLen = prev?.length || 0;
      const nextLen = nextRenderable?.length || 0;

      // Keep prev if next is empty (prevents flashing)
      if (nextLen === 0 && prevLen > 0) return prev;

      // Keep prev if stable keys match (prevents micro-flicker)
      const prevLast = prev?.[prevLen - 1]?.stableKey;
      const nextLast = nextRenderable?.[nextLen - 1]?.stableKey;
      if (prevLen === nextLen && prevLast && nextLast && prevLast === nextLast) return prev;

      return nextRenderable;
    });
  }, [nextRenderable]);

  // Hooks must remain unconditional; keep memoized values above early returns.
  // Derive UI current item (prioritize gates over base question) - MUST be before early returns
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

  const autoScrollToBottom = useCallback(() => {
    if (!historyRef.current) return;
    // Gate scroll only if user is typing (transcript still renders live)
    if (isUserTyping) return;
    requestAnimationFrame(() => {
      if (historyRef.current) {
        historyRef.current.scrollTop = historyRef.current.scrollHeight;
      }
    });
  }, [isUserTyping]);

  // UX: Mark user as typing and set timeout to unlock after idle period
  const markUserTyping = useCallback(() => {
    if (!isUserTyping) {
      console.log("[UX][TYPING_LOCK]", { locked: true, note: "scroll locked only, transcript still live" });
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

  useEffect(() => {
    if (!sessionId) {
      navigate(createPageUrl("StartInterview"));
      return;
    }
    initializeInterview();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      clearTimeout(typingTimeoutRef.current);
      clearTimeout(aiResponseTimeoutRef.current);
      clearTimeout(typingLockTimeoutRef.current);
    };
  }, [sessionId, navigate]);

  // FORENSIC: Component instance tracking
  const componentInstanceId = useRef(`CandidateInterview-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  
  useEffect(() => {
    console.log('[FORENSIC][MOUNT]', { component: 'CandidateInterview', instanceId: componentInstanceId.current });
    return () => {
      console.log('[FORENSIC][UNMOUNT]', { component: 'CandidateInterview', instanceId: componentInstanceId.current });
    };
  }, []);

  const initializeInterview = async () => {
    try {
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
      console.log("[AUTH] Candidate mode: skipping /User/me");
      setIsAdminUser(false);

      const loadedSession = await base44.entities.InterviewSession.get(sessionId);

      if (!loadedSession) {
        throw new Error(`Session not found: ${sessionId}. It may have been deleted or never created.`);
      }

      if (!loadedSession.id) {
        throw new Error('Invalid session object returned from database');
      }

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

      const engineData = await bootstrapEngine(base44);
      setEngine(engineData);

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
        // New session - Initialize with intro blocker only (don't clear transcript)
        setQueue([]);
        setCurrentItem(null); // Will be set after "Got it — Let's Begin"
      }

      const hasAnyResponses = loadedSession.transcript_snapshot && loadedSession.transcript_snapshot.length > 0;
      const sessionIsNew = !hasAnyResponses;

      console.log("[CandidateInterview] init", {
        isNewSession: sessionIsNew,
        screenMode: sessionIsNew ? "WELCOME" : "QUESTION",
        layoutVersion: "section-first"
      });
      
      console.log('[FORENSIC][INIT]', {
        sessionId,
        isNewSession: sessionIsNew,
        transcriptLenFromDB: loadedSession.transcript_snapshot?.length || 0,
        initialScreenMode: sessionIsNew ? "WELCOME" : "QUESTION"
      });

      setIsNewSession(sessionIsNew);
      setScreenMode(sessionIsNew ? "WELCOME" : "QUESTION");

      // Add blocking intro message for new sessions (UI-ONLY - not in canonical transcript)
      if (sessionIsNew) {
        setUiBlocker({
          id: `blocker-intro-${sessionId}`,
          type: 'SYSTEM_INTRO',
          resolved: false,
          timestamp: new Date().toISOString()
        });
        await forensicCheck('initial');
      }

      // Log system events
      if (sessionIsNew) {
        await logSystemEventHelper(sessionId, 'SESSION_CREATED', {
          department_code: loadedSession.department_code,
          file_number: loadedSession.file_number
        });
      } else {
        await logSystemEventHelper(sessionId, 'SESSION_RESUMED', {
          last_question_id: loadedSession.current_question_id
        });
      }

      setIsLoading(false);

    } catch (err) {
      const errorMessage = err?.message || err?.toString() || 'Unknown error occurred';
      setError(`Failed to load interview: ${errorMessage}`);
      setIsLoading(false);
    }
  };

  const restoreFromSnapshots = async (engineData, loadedSession) => {
    const restoredTranscript = loadedSession.transcript_snapshot || [];
    const restoredQueue = loadedSession.queue_snapshot || [];
    const restoredCurrentItem = loadedSession.current_item_snapshot || null;
    
    console.log('[FORENSIC][RESTORE]', {
      source: 'DB_SNAPSHOT',
      transcriptLen: restoredTranscript.length,
      queueLen: restoredQueue.length,
      hasCurrentItem: !!restoredCurrentItem,
      currentItemType: restoredCurrentItem?.type,
      currentItemId: restoredCurrentItem?.id
    });

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

    // PART B: No Welcome injection on resume
    console.log('[FORENSIC][RESTORE][SYNC]', { 
      operation: 'SET_LOCAL_STATE', 
      transcriptLen: restoredTranscript.length,
      queueLen: restoredQueue.length,
      currentItemType: restoredCurrentItem?.type
    });
    setDbTranscriptSafe(restoredTranscript);
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

      setDbTranscriptSafe(restoredTranscript);
      displayOrderRef.current = restoredTranscript.length;

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
        await forensicCheck('section_complete');

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

        // Append multi-instance gate question via canonical helper
        const freshGate = await appendAndRefresh('assistant', {
          text: multiInstancePrompt,
          metadata: {
            id: `mi-q-${Date.now()}`,
            stableKey: `multi-instance-gate:${packId}:${currentInstanceCount + 1}`,
            messageType: 'MULTI_INSTANCE_GATE_SHOWN',
            packId,
            questionId: baseQuestionId,
            instanceNumber: currentInstanceCount + 1,
            maxInstances,
            visibleToCandidate: true
          }
        }, 'multi_instance_gate_question');

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

  const handleAnswer = useCallback(async (value) => {
    // IDEMPOTENCY GUARD: Build submit key and check if already submitted
    const buildSubmitKey = (item) => {
      if (!item) return null;
      if (item.type === 'question') return `q:${item.id}`;
      if (item.type === 'v2_pack_field') return `p:${item.packId}:${item.fieldKey}:${item.instanceNumber || 0}`;
      if (item.type === 'v3_pack_opener') return `v3o:${item.packId}:${item.instanceNumber || 0}`;
      if (item.type === 'followup') return `f:${item.packId}:${item.stepIndex}:${item.instanceNumber || 0}`;
      if (item.type === 'multi_instance') return `mi:${item.questionId}:${item.packId}:${item.instanceNumber}`;
      if (item.type === 'multi_instance_gate') return `g:${item.packId}:${item.instanceNumber}`;
      return null;
    };
    
    const submitKey = buildSubmitKey(currentItem);
    
    if (submitKey && submittedKeysRef.current.has(submitKey)) {
      console.log(`[IDEMPOTENCY][BLOCKED] Already submitted for key: ${submitKey}`);
      return;
    }
    
    // Lock this submission immediately
    if (submitKey) {
      submittedKeysRef.current.add(submitKey);
      console.log(`[IDEMPOTENCY][LOCKED] ${submitKey}`);
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

    if (isCommitting || !currentItem || !engine) {
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
          setBackendQuestionTextMap // STEP 1: Pass setter
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

        // Handle backend errors gracefully - fallback to deterministic advancement
        if (v2Result?.mode === 'NONE' || v2Result?.mode === 'ERROR' || !v2Result) {
          console.log(`[V2_PACK_FIELD][FALLBACK] Backend returned ${v2Result?.mode || 'null'} - using deterministic fallback`);
          if (v2Result) {
            v2Result.mode = 'NEXT_FIELD';
          } else {
            // Create a fallback result object
            v2Result = { mode: 'NEXT_FIELD', reason: 'backend returned null' };
          }
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
        const { packId, categoryId, categoryLabel, openerText, baseQuestionId, questionCode, sectionId, instanceNumber, packData } = currentItem;

        console.log(`[V3_OPENER][ANSWERED] ========== OPENER ANSWERED ==========`);
        console.log(`[V3_OPENER][ANSWERED]`, {
          packId,
          categoryId,
          answerLength: value?.length || 0
        });

        // FIX A: Do NOT append duplicate v3_opener_question - FOLLOWUP_CARD_SHOWN already logged it
        // Only append the user's answer
        const { appendUserMessage } = await import("../components/utils/chatTranscriptHelpers");
        const freshSession = await base44.entities.InterviewSession.get(sessionId);
        const currentTranscript = freshSession.transcript_snapshot || [];

        console.log("[V3_OPENER][TRANSCRIPT_BEFORE]", { length: currentTranscript.length });

        // Append user opener answer only (question already in transcript via FOLLOWUP_CARD_SHOWN)
        const transcriptAfterAnswer = await appendUserMessage(sessionId, currentTranscript, value, {
          messageType: 'v3_opener_answer',
          packId,
          categoryId,
          instanceNumber,
          baseQuestionId
        });

        console.log("[V3_OPENER][TRANSCRIPT_AFTER_A]", { length: transcriptAfterAnswer.length });

        // Refresh from DB after opener answer
        await refreshTranscriptFromDB('v3_opener_answered');
        await forensicCheck('v3_opener_answered');

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

        console.log(`[V3_OPENER][ENTER_PROBING] Now entering V3ProbingLoop with opener context`);

        // Store baseQuestionId in ref for exit
        v3BaseQuestionIdRef.current = baseQuestionId;
        console.log('[V3_ENTER] Stored baseQuestionId in ref:', baseQuestionId);

        console.log('[FORENSIC][MODE_TRANSITION]', {
          from: 'V3_PACK_OPENER',
          to: 'V3_PROBING',
          currentItemBefore: currentItem.id,
          packId,
          categoryId,
          transcriptLenBefore: dbTranscript.length
        });

        // STEP 2: Enter V3 AI probing with opener answer as context
        setV3ProbingActive(true);
        setV3ProbingContext({
          packId,
          categoryId,
          categoryLabel, // Add categoryLabel to context
          baseQuestionId,
          questionCode,
          sectionId,
          instanceNumber,
          incidentId: null, // Will be created by decisionEngineV3
          packData,
          openerAnswer: value // Pass opener answer to probing engine
        });

        const freshBeforeProbing = await refreshTranscriptFromDB('v3_probing_enter');
        await forensicCheck('v3_probing_enter');
        await persistStateToDatabase(null, [], {
          id: `v3-probing-${packId}`,
          type: 'v3_probing',
          packId,
          categoryId,
          baseQuestionId
        });

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

        // Append user answer to session transcript (single source of truth)
        const { appendUserMessage } = await import("../components/utils/chatTranscriptHelpers");
        const sessionForAnswer = await base44.entities.InterviewSession.get(sessionId);
        await appendUserMessage(sessionId, sessionForAnswer.transcript_snapshot || [], value, {
          messageType: 'ANSWER',
          questionDbId: currentItem.id,
          questionCode: question.question_id,
          responseId: savedResponse?.id,
          sectionId: question.section_id
        });

        // Log answer submitted (audit only)
        await logAnswerSubmitted(sessionId, {
          questionDbId: currentItem.id,
          responseId: savedResponse?.id,
          packId: null
        });
        
        // Reload session transcript into local state (single source of truth)
        const newTranscript = await refreshTranscriptFromDB('base_question_answered');
        await forensicCheck('base_question_answered');

        // UX: Clear draft on successful submit
        clearDraft();

        // SECTION GATE LOGIC: Check if this is a gate question with "No" answer
        // This must run BEFORE follow-up trigger check to properly skip remaining section questions
        const gateResult = await applySectionGateIfNeeded({
          sessionId,
          currentQuestion: question,
          answer: value,
          engine,
          currentSectionIndex,
          sections,
          answeredQuestionIds: new Set(newTranscript.filter(t => t.type === 'question').map(t => t.questionId))
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
          await forensicCheck('gate_section_complete');

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

            // Check pack config flags to determine V3 vs V2
            const packConfig = FOLLOWUP_PACK_CONFIGS[packId];
            const isV3PackExplicit = packConfig?.isV3Pack === true;
            const isV2PackExplicit = packConfig?.isV2Pack === true;
            const usesPerFieldProbing = useProbeEngineV2(packId);

            // V3 takes precedence over V2 - explicit V3 flag wins
            const isV3PackFinal = isV3PackExplicit || (isV3Pack && !isV2PackExplicit);
            const isV2PackFinal = !isV3PackFinal && (isV2PackExplicit || usesPerFieldProbing);

            console.log(`[FOLLOWUP-TRIGGER] ${packId} isV3Pack=${isV3PackFinal} isV2Pack=${isV2PackFinal}`);

            // === V3 PACK HANDLING: Two-layer flow (Deterministic Opener → AI Probing) ===
            if (isV3PackFinal) {
              console.log(`[V3_PACK][ENTER] ========== ENTERING V3 PACK MODE ==========`);
              console.log(`[V3_PACK][ENTER] pack=${packId} categoryId=${mapPackIdToCategory(packId)}`);

              // Get category for V3 probing
              const categoryId = mapPackIdToCategory(packId);

              if (!categoryId) {
                console.warn("[V3_PACK] No category mapping for pack:", packId);
                saveAnswerToDatabase(currentItem.id, value, question);
                advanceToNextBaseQuestion(currentItem.id);
                setIsCommitting(false);
                setInput("");
                return;
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
              const { getV3DeterministicOpener } = await import("../components/utils/v3ProbingPrompts");
              const opener = getV3DeterministicOpener(packMetadata, categoryId, categoryLabel);

              if (opener.isSynthesized) {
                console.warn(`[V3_PACK][MISSING_OPENER] Pack ${packId} missing configured opener - synthesized fallback used`);
              }

              console.log(`[V3_PACK][OPENER] Showing deterministic opener before AI probing`, {
                packId,
                hasExample: !!opener.example,
                isSynthesized: opener.isSynthesized
              });

              // Log pack entered (audit only)
              await logPackEntered(sessionId, { packId, instanceNumber: 1, isV3: true });

              // Save base question answer
              saveAnswerToDatabase(currentItem.id, value, question);

              // STEP 1: Show deterministic opener (non-AI)
              const openerItem = {
                id: `v3-opener-${packId}-${currentItem.id}`,
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

              console.log('[FORENSIC][MODE_TRANSITION]', {
                from: 'QUESTION',
                to: 'V3_PACK_OPENER',
                currentItemBefore: currentItem.id,
                currentItemAfter: openerItem.id,
                transcriptLenBefore: dbTranscript.length,
                transcriptLenAfter: newTranscript.length
              });

              setCurrentItem(openerItem);
              setQueue([]);

              const freshAfterOpenerSetup = await refreshTranscriptFromDB('v3_opener_set');
              await forensicCheck('v3_opener_shown');
              await persistStateToDatabase(null, [], openerItem);

              setIsCommitting(false);
              setInput("");
              return;
            }

            // === V2 PACK HANDLING: Enter V2_PACK mode ===
            if (isV2PackFinal) {
              // V3-ONLY MODE: Block V2 packs in production
              if (V3_ONLY_MODE) {
                console.warn(`[LEGACY_V2_DISABLED] Attempted to trigger V2-only pack ${packId} in V3-only mode - skipping follow-up`);
                saveAnswerToDatabase(currentItem.id, value, question);
                advanceToNextBaseQuestion(currentItem.id, newTranscript);
                setIsCommitting(false);
                setInput("");
                return;
              }

              const packConfig = FOLLOWUP_PACK_CONFIGS[packId];

              if (!packConfig || !Array.isArray(packConfig.fields) || packConfig.fields.length === 0) {
                console.warn("[V2_PACK] Missing or invalid pack config for", packId, packConfig);
                // Fallback: advance to next question
                saveAnswerToDatabase(currentItem.id, value, question);
                advanceToNextBaseQuestion(currentItem.id);
                setIsCommitting(false);
                setInput("");
                return;
              }

              // Build ordered list of fields in this V2 pack
              const orderedFields = packConfig.fields
                .filter(f => f.fieldKey && f.label)
                .sort((a, b) => (a.factsOrder || 0) - (b.factsOrder || 0));

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
                collectedAnswers: {}
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
                setBackendQuestionTextMap // STEP 1: Pass setter
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
                await appendAndRefresh('assistant', {
                  text: initialCallResult.question,
                  metadata: {
                    messageType: 'v2_pack_opening',
                    packId,
                    fieldKey: firstField.fieldKey,
                    instanceNumber: 1,
                    baseQuestionId: currentItem.id,
                    visibleToCandidate: true
                  }
                }, 'v2_cluster_opening_shown');

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
            setBackendQuestionTextMap // STEP 1: Pass setter for legacy followup path
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
        await appendAndRefresh('user', {
          text: answer,
          metadata: {
            id: `mi-a-${questionId}-${packId}-${instanceNumber}-${Date.now()}`,
            stableKey: `multi-instance-answer:${questionId}:${packId}:${instanceNumber}`,
            messageType: 'MULTI_INSTANCE_GATE_ANSWER',
            questionId,
            packId,
            instanceNumber
          }
        }, 'multi_instance_answer');

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
      setError(`Error: ${err.message}`);
      // Reset state on error
      setIsCommitting(false);
      setInput("");
    } finally {
      // SAFETY: Always reset isCommitting after the handler completes
      // This prevents the interview from getting stuck if any path forgets to reset
      setTimeout(() => {
        setIsCommitting(false);
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

  // V3 EXIT: Idempotent exit function (only runs once)
  const exitV3Once = useCallback((reason, payload) => {
    if (exitV3HandledRef.current) {
      console.log('[EXIT_V3][SKIP] Already handled');
      return;
    }

    exitV3HandledRef.current = true;
    console.log('[EXIT_V3][ONCE]', { reason, baseQuestionId: v3BaseQuestionIdRef.current });

    // Queue transition (executed in useEffect)
    setPendingTransition({
      type: 'EXIT_V3',
      payload: { ...payload, reason }
    });
  }, []);

  // V3 probing completion handler - deferred transition pattern
  const handleV3ProbingComplete = useCallback((result) => {
    console.log("[V3_PROBING][COMPLETE][DEFERRED] ========== V3 EXIT REQUESTED ==========");
    console.log("[V3_PROBING][COMPLETE][DEFERRED]", result);

    exitV3Once('PROBING_COMPLETE', result);
  }, [exitV3Once]);

  // V3 transcript update handler - NO REFRESH (batched at completion)
  const handleV3TranscriptUpdate = useCallback(async (entry) => {
    // V3 messages written to DB by V3ProbingLoop
    // We refresh ONCE when V3 completes, not per message (prevents refresh storm)
    console.log('[V3_TRANSCRIPT_UPDATE]', { type: entry?.type, deferred: true });
  }, []);

  // Deferred transition handler (fixes React warning)
  useEffect(() => {
    if (!pendingTransition) return;

    const executePendingTransition = async () => {
      console.log('[PENDING_TRANSITION][EXECUTING]', pendingTransition.type, pendingTransition.payload);

      if (pendingTransition.type === 'EXIT_V3') {
        const result = pendingTransition.payload;
        const { incidentId, categoryId, completionReason, messages, reason, shouldOfferAnotherInstance, packId, categoryLabel, instanceNumber, packData } = result;
        const baseQuestionId = v3BaseQuestionIdRef.current;

        console.log('[EXIT_V3][EXECUTING]', { reason, baseQuestionId, shouldOfferAnotherInstance });

        // GUARD: If multi-instance is offered, show gate BEFORE advancing
        if (shouldOfferAnotherInstance) {
          console.log('[EXIT_V3][MULTI_INSTANCE_GATE] Showing gate instead of advancing');
          
          const gatePromptText = `Do you have another ${categoryLabel || 'incident'} to report?`;
          
          // Append gate prompt via canonical helper
          await appendAndRefresh('assistant', {
            text: gatePromptText,
            metadata: {
              id: `mi-gate-${packId}-${instanceNumber}`,
              messageType: 'MULTI_INSTANCE_GATE_SHOWN',
              packId,
              categoryId,
              instanceNumber,
              baseQuestionId,
              visibleToCandidate: true
            }
          }, 'gate_shown');
          
          await forensicCheck('gate_shown');
          
          // Clear V3 probing state but DO NOT advance yet
          setV3ProbingActive(false);
          setV3ProbingContext(null);
          setV3Gate({ active: false, packId: null, categoryId: null, promptText: null, instanceNumber: null });
          
          console.log('[FORENSIC][MODE_TRANSITION]', {
            from: 'V3_PROBING',
            to: 'MULTI_INSTANCE_GATE',
            packId,
            instanceNumber,
            transcriptLenBefore: dbTranscript.length
          });

          // Set up multi-instance gate as first-class currentItem
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
          
          setCurrentItem({
            id: `multi-instance-gate-${packId}-${instanceNumber}`,
            type: 'multi_instance_gate',
            packId,
            categoryId,
            categoryLabel,
            promptText: gatePromptText,
            instanceNumber,
            baseQuestionId,
            packData
          });
          
          exitV3HandledRef.current = false; // Reset so gate handlers can advance
          setPendingTransition(null);
          return;
        }

        // Clear gate FIRST
        setV3Gate({ active: false, packId: null, categoryId: null, promptText: null, instanceNumber: null });

        // Clear V3 state
        setV3ProbingActive(false);
        setV3ProbingContext(null);

        // Log pack exited (audit only)
        if (v3ProbingContext?.packId) {
          await logPackExited(sessionId, {
            packId: v3ProbingContext.packId,
            instanceNumber: v3ProbingContext.instanceNumber || 1
          });
        }
        
        // Refresh transcript after pack exit (V3 wrote many messages to DB)
        await refreshTranscriptFromDB('v3_pack_exited');
        await forensicCheck('v3_pack_exited');

        // Advance to next base question AFTER clearing V3 state
        if (baseQuestionId) {
          console.log('[EXIT_V3][ADVANCE]', { baseQuestionId });
          const freshForAdvance = await refreshTranscriptFromDB('before_advance_after_v3');
          await advanceToNextBaseQuestion(baseQuestionId, freshForAdvance);
        }

        // Reset idempotency guard for next V3 pack
        exitV3HandledRef.current = false;
      }

      // Clear transition
      setPendingTransition(null);
    };

    executePendingTransition();
  }, [pendingTransition, dbTranscript, advanceToNextBaseQuestion, persistStateToDatabase, sessionId, v3ProbingContext, multiInstanceGate, engine, refreshTranscriptFromDB]);

  // UX: Restore draft when currentItem changes
  useEffect(() => {
    if (!currentItem || !sessionId) return;

    const packId = currentItem?.packId || null;
    const fieldKey = currentItem?.fieldKey || currentItem?.id || null;
    const instanceNumber = currentItem?.instanceNumber || 0;
    const draftKey = buildDraftKey(sessionId, packId, fieldKey, instanceNumber);

    try {
      const savedDraft = window.sessionStorage.getItem(draftKey);
      if (savedDraft != null && savedDraft !== "") {
        console.log("[UX][DRAFT] Restoring draft for", draftKey);
        console.log("[FORENSIC][STORAGE][READ]", { operation: 'READ', key: draftKey, success: true, valueLength: savedDraft?.length || 0 });
        setInput(savedDraft);
      } else {
        console.log("[FORENSIC][STORAGE][READ]", { operation: 'READ', key: draftKey, success: true, found: false });
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
    }
  }, [currentItem, sessionId, buildDraftKey]);

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

  // Auto-scroll to bottom when transcript or current item updates
  useEffect(() => {
    autoScrollToBottom();
  }, [dbTranscript, currentItem, v3ProbingActive, autoScrollToBottom]);

  // UX: Auto-resize textarea based on content (max 3 lines)
  useEffect(() => {
    if (!inputRef.current) return;

    const textarea = inputRef.current;
    textarea.style.height = 'auto';

    const lineHeight = 24; // Approximate line height in pixels
    const maxLines = 3;
    const maxHeight = lineHeight * maxLines;
    const scrollHeight = textarea.scrollHeight;

    if (scrollHeight <= maxHeight) {
      textarea.style.height = `${scrollHeight}px`;
      textarea.style.overflowY = 'hidden';
      setTextareaRows(Math.min(Math.ceil(scrollHeight / lineHeight), maxLines));
    } else {
      textarea.style.height = `${maxHeight}px`;
      textarea.style.overflowY = 'auto';
      setTextareaRows(maxLines);
    }
  }, [input]);

  // UX: Auto-focus answer input whenever a new question appears
  useEffect(() => {
    if (!currentItem) return;
    if (isCommitting || v3ProbingActive || pendingSectionTransition) return;

    const isAnswerable = currentItem.type === 'question' ||
                         currentItem.type === 'v2_pack_field' ||
                         currentItem.type === 'v3_pack_opener' ||
                         currentItem.type === 'followup';

    if (!isAnswerable) return;

    const currentItemType = currentItem.type;
    const currentItemId = currentItem.id;
    const packId = currentItem.packId;
    const fieldKey = currentItem.fieldKey;
    const instanceNumber = currentItem.instanceNumber;

    console.log("[UX][FOCUS] Auto-focusing answer input for", {
      currentItemType,
      currentItemId,
      packId,
      fieldKey,
      instanceNumber
    });

    window.requestAnimationFrame(() => {
      if (!inputRef.current) return;

      try {
        inputRef.current.focus();

        // Put cursor at end of any existing text (desktop + mobile friendly)
        if (inputRef.current.setSelectionRange) {
          const len = inputRef.current.value.length;
          inputRef.current.setSelectionRange(len, len);
        }
      } catch (err) {
        console.warn("[UX][FOCUS] Failed to focus answer input", err);
      }
    });
  }, [currentItem, isCommitting, v3ProbingActive, pendingSectionTransition]);

  // Transcript logging is now handled in answer saving functions where we have Response IDs
  // This prevents logging questions with null responseId

  const getCurrentPrompt = () => {
    // PRIORITY 1: V3 probing active - V3ProbingLoop handles UI
    if (v3ProbingActive || currentItem?.type === 'v3_probing') {
      console.log('[V3_PROBING][ACTIVE] Blocking base prompt derivation - V3ProbingLoop handles UI');
      return null;
    }

    // PRIORITY 2: V3 gate active - block base question rendering
    if (v3GateActive) {
      console.log('[V3_GATE][ACTIVE] Blocking base question rendering + logging');
      return null;
    }

    // UX: Stabilize current item while typing
    let effectiveCurrentItem = currentItem;

    if (isUserTyping && currentItemRef.current) {
      console.log('[FORENSIC][TYPING_LOCK]', { 
        active: true, 
        frozenItemType: currentItemRef.current?.type,
        frozenItemId: currentItemRef.current?.id,
        actualItemType: currentItem?.type,
        actualItemId: currentItem?.id,
        promptWillDeriveFrom: 'FROZEN_REF'
      });
      effectiveCurrentItem = currentItemRef.current;
    } else {
      console.log('[FORENSIC][TYPING_LOCK]', { active: false, promptWillDeriveFrom: 'CURRENT_STATE' });
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

    // V3 Pack opener question (ONLY if not in v3_probing mode)
    if (effectiveCurrentItem.type === 'v3_pack_opener' && !v3ProbingActive) {
      const { packId, openerText, exampleNarrative, categoryId, instanceNumber } = effectiveCurrentItem;
      const packConfig = FOLLOWUP_PACK_CONFIGS[packId];
      const packLabel = packConfig?.instancesLabel || categoryId || 'Follow-up';

      // RENDER-POINT LOGGING: Log follow-up card when shown (Guard: log once per canonical ID)
      const openerCardId = `followup-card-${sessionId}-${packId}-opener-${instanceNumber}`;
      if (lastLoggedFollowupCardIdRef.current !== openerCardId) {
        lastLoggedFollowupCardIdRef.current = openerCardId;

        const categoryLabelForLog = effectiveCurrentItem.categoryLabel || packLabel;

        logFollowupCardShown(sessionId, {
          packId,
          variant: 'opener',
          stableKey: `${instanceNumber}`,
          promptText: openerText,
          exampleText: exampleNarrative,
          packLabel,
          categoryLabel: categoryLabelForLog,
          instanceNumber,
          baseQuestionId: effectiveCurrentItem.baseQuestionId
        }).catch(err => console.warn('[LOG_FOLLOWUP_CARD] Failed:', err));
      }

      return {
        type: 'v3_pack_opener',
        id: effectiveCurrentItem.id,
        text: openerText,
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-blue-400 animate-spin mx-auto" />
          <p className="text-slate-300">Loading interview...</p>
        </div>
      </div>
    );
  }

  if (error) {
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

  // Calculate currentPrompt (after all hooks declared)
  const currentPrompt = getCurrentPrompt();

  // Treat v2_pack_field and v3_pack_opener the same as a normal question for bottom-bar input
  const isAnswerableItem = (item) => {
  if (!item) return false;
  return item.type === "question" || item.type === "v2_pack_field" || item.type === "v3_pack_opener" || item.type === "followup";
  };

  // ============================================================================
  // CENTRALIZED BOTTOM BAR MODE SELECTION (Single Decision Point)
  // ============================================================================
  const currentItemType = uiCurrentItem?.type || null;
  const isV3Gate = currentItemType === "v3_gate";
  const isMultiInstanceGate = currentItemType === "multi_instance_gate";
  
  // Compute bottom bar mode
  let bottomBarMode = "HIDDEN"; // Default: no controls shown
  let isQuestion = false; // Semantic flag: is this a question-like prompt?
  
  // Pre-interview intro (WELCOME screen only)
  if (screenMode === 'WELCOME' || activeBlocker?.type === 'SYSTEM_INTRO') {
    if (!isMultiInstanceGate && !isV3Gate) {
      bottomBarMode = "CTA"; // "Got it — Let's Begin" button
    }
  }
  // Section transition blockers
  else if (activeBlocker?.type === 'SECTION_MESSAGE' && uiCurrentItem?.type !== 'section_transition') {
    bottomBarMode = "CTA"; // "Continue →" button
  }
  else if (pendingSectionTransition && uiCurrentItem?.type === 'section_transition') {
    bottomBarMode = "CTA"; // "Begin Next Section →" button
  }
  // Multi-instance gate (ALWAYS YES_NO)
  else if (isMultiInstanceGate) {
    bottomBarMode = "YES_NO";
    isQuestion = true; // Treat as question for semantic styling
  }
  // V3 gate (fallback YES_NO)
  else if (isV3Gate) {
    bottomBarMode = "YES_NO";
    isQuestion = true;
  }
  // V3 probing active (keep input visible but disabled)
  else if (v3ProbingActive && !isV3Gate && !isMultiInstanceGate) {
    bottomBarMode = "DISABLED";
  }
  // Normal yes/no questions
  else if (currentPrompt?.type === 'question' && currentPrompt?.responseType === 'yes_no' && !isWaitingForAgent && !inIdeProbingLoop) {
    bottomBarMode = "YES_NO";
    isQuestion = true;
  }
  else if (currentPrompt?.type === 'multi_instance' && currentPrompt?.responseType === 'yes_no') {
    bottomBarMode = "YES_NO";
    isQuestion = true;
  }
  // V2 pack field yes/no
  else if (currentItemType === 'v2_pack_field' && currentPrompt?.inputType === 'yes_no') {
    bottomBarMode = "YES_NO";
    isQuestion = true;
  }
  // V2 pack field select single
  else if (currentItemType === 'v2_pack_field' && currentPrompt?.inputType === 'select_single' && currentPrompt?.options) {
    bottomBarMode = "SELECT";
    isQuestion = true;
  }
  // Text input for questions, v2_pack_field, v3_pack_opener, followup
  else if ((currentItemType === 'question' || currentItemType === 'v2_pack_field' || currentItemType === 'v3_pack_opener' || currentItemType === 'followup' || currentPrompt?.type === 'ai_probe') && !isV3Gate && !isMultiInstanceGate) {
    bottomBarMode = "TEXT_INPUT";
    isQuestion = true;
  }
  
  // Log final mode selection
  console.log('[BOTTOM_BAR_MODE]', { currentItemType, bottomBarMode, isQuestion, screenMode });
  
  // Legacy flags (kept for compatibility)
  const isV2PackField = currentItemType === "v2_pack_field";
  const isV3PackOpener = currentItemType === "v3_pack_opener";
  const showTextInput = bottomBarMode === "TEXT_INPUT";
  
  // Derive answerable from existing values (safe default: allow answer if we have a current item and it's a question-like type)
  const answerable = uiCurrentItem && (
    uiCurrentItem.type === 'question' || 
    uiCurrentItem.type === 'v2_pack_field' || 
    uiCurrentItem.type === 'v3_pack_opener' || 
    uiCurrentItem.type === 'followup' ||
    uiCurrentItem.type === 'multi_instance_gate'
  ) && !v3ProbingActive;

  // Debug log: confirm which bottom bar path is rendering
  console.log("[BOTTOM_BAR_RENDER]", {
    currentItemType,
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

  // Unified bottom bar submit handler for question, v2_pack_field, and followup
  const handleBottomBarSubmit = async () => {
    console.log("[BOTTOM_BAR_SUBMIT][CLICK]", {
      hasCurrentItem: !!currentItem,
      currentItemType: currentItem?.type,
      currentItemId: currentItem?.id,
      packId: currentItem?.packId,
      fieldKey: currentItem?.fieldKey,
      instanceNumber: currentItem?.instanceNumber,
      inputSnapshot: input?.substring?.(0, 50) || input,
    });

    if (!currentItem) {
      console.warn("[BOTTOM_BAR_SUBMIT] No currentItem – aborting submit");
      return;
    }

    if (isCommitting) {
      console.log("[BOTTOM_BAR_SUBMIT] blocked: isCommitting");
      return;
    }

    const trimmed = (input ?? "").trim();
    if (!trimmed) {
      console.log("[BOTTOM_BAR_SUBMIT] blocked: empty input");
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
      isV2PackField: currentItem.type === 'v2_pack_field'
    });

    // Call handleAnswer with the answer text - handleAnswer reads currentItem from state
    await handleAnswer(trimmed);

    // UX: Clear draft on successful submit
    clearDraft();
    setInput("");
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

  return (
    <div className="h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex flex-col">
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

      <main className="flex-1 overflow-y-auto scrollbar-thin" ref={historyRef}>
        <div className="px-4 pt-6 pb-6 flex flex-col justify-end min-h-full">
          <div className="space-y-2">
          {/* Always render transcript history from CANONICAL DB source */}
          {(() => {
            // CANONICAL: Render from frozen state (prevents flashing)
            const visibleTranscript = renderTranscript;
            
            // FORENSIC: Truth table for transcript pipeline
            console.log("[FORENSIC][PIPELINE]", {
              canonicalLen: dbTranscript.length,
              renderableLen: nextRenderable?.length || 0,
              frozenLen: renderTranscript?.length || 0,
              visibleLen: visibleTranscript?.length || 0,
              currentItemType,
              currentItemId: currentItem?.id,
              v3ProbingActive,
              v2PackMode,
              packId: currentItem?.packId || activeV2Pack?.packId,
              instanceNumber: currentItem?.instanceNumber || activeV2Pack?.instanceNumber,
              isTypingLocked: isUserTyping
            });
            
            // CANONICAL SOURCE VERIFICATION
            console.log("[TRANSCRIPT_SOURCE]", {
              canonicalLen: dbTranscript.length,
              displayLen: visibleTranscript.length,
              currentItemType: currentItemType
            });
            
            // DIVERGENCE DETECTION (warning only - does not block)
            if (dbTranscript.length > 0 && visibleTranscript.length === 0) {
              console.warn('[TRANSCRIPT_DIVERGENCE]', {
                canonicalLen: dbTranscript.length,
                displayLen: 0,
                alert: 'All messages hidden by filter'
              });
            }
            
            return visibleTranscript.map((entry, index) => {

            // Base question shown (QUESTION_SHOWN from chatTranscriptHelpers)
            if (entry.role === 'assistant' && entry.messageType === 'QUESTION_SHOWN') {
              return (
                <div key={entry.id}>
                  <ContentContainer>
                  <div className="w-full bg-[#1a2744] border border-slate-700/60 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-base font-semibold text-blue-400">
                        {entry.title || `Question ${entry.meta?.questionNumber || ''}`}
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
            if (entry.role === 'user' && entry.messageType === 'ANSWER') {
              return (
                <div key={entry.id}>
                  <ContentContainer>
                  <div className="flex justify-end">
                    <div className="bg-blue-600 rounded-xl px-5 py-3 max-w-[85%]">
                      <p className="text-white text-sm">{entry.text}</p>
                    </div>
                  </div>
                  </ContentContainer>
                </div>
              );
            }

            // Multi-instance gate prompt shown
            if (entry.role === 'assistant' && entry.messageType === 'MULTI_INSTANCE_GATE_SHOWN') {
              return (
                <div key={entry.id}>
                  <ContentContainer>
                  <div className="w-full bg-purple-900/30 border border-purple-700/50 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-semibold text-purple-400">Follow-up</span>
                    </div>
                    <p className="text-white text-base leading-relaxed">{entry.text}</p>
                  </div>
                  </ContentContainer>
                </div>
              );
            }

            // Multi-instance gate answer (user's Yes/No)
            if (entry.role === 'user' && entry.messageType === 'MULTI_INSTANCE_GATE_ANSWER') {
              return (
                <div key={entry.id}>
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

            // TOP-PRIORITY: v3_probe_complete renders as plain assistant message (NO "AI Follow-Up (V3)" label)
            if (entry.role === 'assistant' && entry.messageType === 'v3_probe_complete') {
              return (
                <div key={entry.id}>
                  <ContentContainer>
                  <div className="w-full bg-slate-800/30 border border-slate-700/40 rounded-xl p-4">
                    <p className="text-white text-sm leading-relaxed">{entry.text}</p>
                  </div>
                  </ContentContainer>
                </div>
              );
            }

            // SUPPRESS: "Do you have another..." prompts in transcript (footer gate shows it)
            if (entry.role === 'assistant' && typeof entry.text === 'string') {
              const textLower = entry.text.trim().toLowerCase();
              if (textLower.startsWith('do you have another')) {
                console.log('[V3 UX] Suppressed transcript gate prompt', {
                  messageType: entry.messageType,
                  textPreview: entry.text?.slice(0, 80)
                });
                return null;
              }
            }

            // Skip entries without stable IDs (safety guard)
            if (!entry.id) {
              console.warn('[TRANSCRIPT][RENDER] Entry missing stable ID, skipping:', entry);
              return null;
            }
            
            return (
            <div key={entry.id}>

              {/* Session resumed marker (collapsed system note) */}
              {entry.messageType === 'RESUME' && entry.visibleToCandidate && (
                <ContentContainer>
                <div className="w-full bg-blue-900/30 border border-blue-700/40 rounded-xl p-3">
                  <p className="text-blue-300 text-sm">{entry.text}</p>
                </div>
                </ContentContainer>
              )}

              {/* V3 opener question (FOLLOWUP_CARD_SHOWN or v3_opener_question) */}
              {entry.role === 'assistant' && (entry.messageType === 'v3_opener_question' ||
                (entry.messageType === 'FOLLOWUP_CARD_SHOWN' && entry.meta?.variant === 'opener')) && (
                <ContentContainer>
                <div className="w-full bg-purple-900/30 border border-purple-700/50 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-purple-400 font-medium">
                      Follow-up • {entry.categoryLabel || entry.title || 'Details'}
                    </span>
                  </div>
                  <p className="text-white text-sm leading-relaxed">{entry.text}</p>
                  {entry.example && (
                    <div className="mt-3 bg-slate-800/50 border border-slate-600/50 rounded-lg p-3">
                      <p className="text-xs text-slate-400 mb-1 font-medium">Example:</p>
                      <p className="text-slate-300 text-xs italic">{entry.example}</p>
                    </div>
                  )}
                </div>
                </ContentContainer>
              )}

              {entry.role === 'user' && entry.messageType === 'v3_opener_answer' && (
                <ContentContainer>
                <div className="flex justify-end">
                  <div className="bg-purple-600 rounded-xl px-5 py-3 max-w-[85%]">
                    <p className="text-white text-sm">{entry.text}</p>
                  </div>
                </div>
                </ContentContainer>
              )}

              {entry.role === 'assistant' && entry.messageType === 'v3_probe_question' && (
                <ContentContainer>
                <div className="w-full bg-purple-900/30 border border-purple-700/50 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-purple-400 font-medium">Follow-up</span>
                  </div>
                  <p className="text-white text-sm leading-relaxed">{entry.text}</p>
                </div>
                </ContentContainer>
              )}

              {entry.role === 'user' && entry.messageType === 'v3_probe_answer' && (
                <ContentContainer>
                <div className="flex justify-end">
                  <div className="bg-purple-600 rounded-xl px-5 py-3 max-w-[85%]">
                    <p className="text-white text-sm">{entry.text}</p>
                  </div>
                </div>
                </ContentContainer>
              )}

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
                <ContentContainer>
                <div className="flex justify-end">
                  <div className="bg-blue-600 rounded-xl px-5 py-3 max-w-[85%]">
                    <p className="text-white text-sm">{entry.answer || entry.text}</p>
                  </div>
                </div>
                </ContentContainer>
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
              {entry.type === 'followup_question' && (entry.source === 'V2_PACK' || entry.source === 'AI_FOLLOWUP') && entry.answer && (
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
              )}

              {/* Legacy/deterministic followup entries (combined question+answer) */}
              {entry.type === 'followup' && !entry.source && (
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
              )}

              {/* AI Probe Questions (including V2 pack cluster opening) - only show if answered */}
              {entry.type === 'ai_probe_question' && entry.answer && (
                <ContentContainer>
                <div className="w-full space-y-2">
                  <div className="bg-purple-900/30 border border-purple-700/50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-purple-400 font-medium">
                        {entry.source === 'V2_PACK_CLUSTER_OPENING' ? 'Follow-up' : 'AI Follow-up'}
                      </span>
                    </div>
                    <p className="text-white text-sm leading-relaxed">{entry.questionText || entry.text || entry.content}</p>
                  </div>
                  <div className="flex justify-end">
                    <div className="bg-purple-600 rounded-xl px-5 py-3 max-w-[85%]">
                      <p className="text-white text-sm">{entry.answer}</p>
                    </div>
                  </div>
                </div>
                </ContentContainer>
              )}

              {/* Section Completion Messages */}
              {entry.role === 'assistant' && entry.messageType === 'SECTION_COMPLETE' && entry.visibleToCandidate && (
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

          {/* Welcome Card - Always show when WELCOME mode */}
          {screenMode === 'WELCOME' && (
              <ContentContainer>
                <div className="w-full bg-slate-800/50 border border-slate-700/60 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Shield className="w-5 h-5 text-blue-400" />
                    <span className="text-base font-semibold text-blue-400">Welcome to your ClearQuest Interview</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                      <p className="text-slate-200 text-sm leading-relaxed">
                        This interview is part of your application process.
                      </p>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                      <p className="text-slate-200 text-sm leading-relaxed">
                        One question at a time, at your own pace.
                      </p>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                      <p className="text-slate-200 text-sm leading-relaxed">
                        Clear, complete, and honest answers help investigators understand the full picture.
                      </p>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                      <p className="text-slate-200 text-sm leading-relaxed">
                        You can pause and come back — we'll pick up where you left off.
                      </p>
                    </div>
                  </div>
                </div>
              </ContentContainer>
          )}

          {/* Other blockers (non-welcome) */}
          {activeBlocker && activeBlocker.type !== 'SYSTEM_INTRO' && (
              <ContentContainer>
              {activeBlocker.type === 'V3_GATE' && (
                <div className="bg-purple-900/30 border border-purple-700/50 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base font-semibold text-purple-400">Next</span>
                  </div>
                  <p className="text-white text-base leading-relaxed">
                    {activeBlocker.promptText || 'Do you have another incident to add?'}
                  </p>
                </div>
              )}
            </ContentContainer>
          )}

          {/* V3 Probing Loop */}
          {(() => {
            console.log('[FORENSIC][V3_PROBING_GUARD]', {
              shouldRenderV3: v3ProbingActive && !!v3ProbingContext,
              v3ProbingActive,
              hasContext: !!v3ProbingContext,
              packId: v3ProbingContext?.packId,
              instanceNumber: v3ProbingContext?.instanceNumber
            });
            return v3ProbingActive && v3ProbingContext;
          })() && (
           <ContentContainer>
           <V3ProbingLoop
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
             onComplete={handleV3ProbingComplete}
             onTranscriptUpdate={handleV3TranscriptUpdate}
             onMultiInstancePrompt={(promptData) => {
               setPendingGatePrompt({ promptData, v3Context: v3ProbingContext });
             }}
             onMultiInstanceAnswer={setV3MultiInstanceHandler}
           />
           </ContentContainer>
          )}

          {/* Base Question Card - shown when no blocker and not in V3 probing and not in pack mode */}
          {(() => {
            const shouldRenderBase = !activeBlocker && !v3ProbingActive && !pendingSectionTransition && currentItem?.type === 'question' && v2PackMode === 'BASE' && engine;
            console.log('[FORENSIC][BASE_CARD_GUARD]', {
              shouldRenderBase,
              activeBlocker: !!activeBlocker,
              v3ProbingActive,
              pendingSectionTransition: !!pendingSectionTransition,
              currentItemType: currentItem?.type,
              currentItemId: currentItem?.id,
              v2PackMode,
              hasEngine: !!engine
            });
            return shouldRenderBase;
          })() && (
           <ContentContainer>
           <div ref={questionCardRef} className="w-full">
             {(() => {
               const question = engine.QById[currentItem.id];
               if (!question) return null;

               const sectionEntity = engine.Sections.find(s => s.id === question.section_id);
               const sectionName = sectionEntity?.section_name || question.category || '';
               const questionNumber = getQuestionDisplayNumber(currentItem.id);

               return (
                 <div className="bg-[#1a2744] border border-slate-700/60 rounded-xl p-5">
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

          {/* Current prompt for other item types (v2_pack_field, v3_pack_opener, followup) */}
          {(() => {
            // GUARD: Never render prompt cards when v3_probing is active (V3ProbingLoop owns UI)
            const shouldRenderPrompt = !activeBlocker && currentPrompt && !v3ProbingActive && !pendingSectionTransition && currentItem?.type !== 'question' && currentItem?.type !== 'multi_instance_gate' && currentItem?.type !== 'v3_probing';
            console.log('[FORENSIC][PROMPT_CARD_GUARD]', {
              shouldRenderPrompt,
              activeBlocker: !!activeBlocker,
              hasCurrentPrompt: !!currentPrompt,
              currentPromptType: currentPrompt?.type,
              v3ProbingActive,
              pendingSectionTransition: !!pendingSectionTransition,
              currentItemType: currentItem?.type,
              currentItemId: currentItem?.id,
              packId: currentItem?.packId,
              fieldKey: currentItem?.fieldKey
            });
            console.log('[ACTIVE_PROMPT_CARD]', { type: currentItem?.type, packId: currentItem?.packId });
            return shouldRenderPrompt;
          })() && (
           <ContentContainer>
           <div ref={questionCardRef} className="w-full">
             {isV3PackOpener || currentPrompt?.type === 'v3_pack_opener' ? (
               <div className="bg-purple-900/30 border border-purple-700/50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-semibold text-purple-400">Follow-up</span>
                <span className="text-xs text-slate-500">•</span>
                <span className="text-xs font-medium text-purple-400">
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
              <div className="bg-purple-900/30 border border-purple-700/50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-semibold text-purple-400">Follow-up</span>
                <span className="text-xs text-slate-500">•</span>
                <span className="text-xs font-medium text-purple-400">
                  {currentPrompt.category}{currentPrompt.instanceNumber > 1 ? ` — Instance ${currentPrompt.instanceNumber}` : ''}
                </span>
              </div>
              <p className="text-white text-sm leading-relaxed">{currentPrompt.text}</p>
            </div>
          ) : (
            <div className="bg-[#1a2744] border border-slate-700/60 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base font-semibold text-blue-400">
                  Question {currentItem ? getQuestionDisplayNumber(currentItem.id) : ''}
                </span>
                <span className="text-sm text-slate-500">•</span>
                <span className="text-sm font-medium text-slate-300">{currentPrompt.category}</span>
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
              </div>
              </div>
              </main>

              <footer className="flex-shrink-0 bg-[#121c33] border-t border-slate-700 px-4 py-4">
        <div className="max-w-5xl mx-auto">
          {/* Unified Bottom Bar - Stable Container (never unmounts) */}
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
                  
                  // Mark blocker resolved (UI-only)
                  if (uiBlocker && !uiBlocker.resolved) {
                    setUiBlocker(null);
                  }
                  
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
          ) : bottomBarMode === "CTA" && activeBlocker?.type === 'SECTION_MESSAGE' ? (
            <div className="flex flex-col items-center">
              <Button
                onClick={async () => {
                  console.log("[BLOCKER][RESOLVE] SECTION_MESSAGE");

                  // Log section started
                  const nextSection = sections[activeBlocker.nextSectionIndex];
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
                  setCurrentSectionIndex(activeBlocker.nextSectionIndex);
                  setCurrentItem({ id: activeBlocker.nextQuestionId, type: 'question' });
                  setPendingSectionTransition(null);

                  await persistStateToDatabase(null, [], { id: activeBlocker.nextQuestionId, type: 'question' });
                  setTimeout(() => autoScrollToBottom(), 100);
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 text-base font-semibold"
                size="lg"
              >
                Continue →
              </Button>
              <p className="text-xs text-emerald-400 text-center mt-3">
                Click to continue to {activeBlocker.nextSectionName}
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
          ) : bottomBarMode === "YES_NO" && isMultiInstanceGate ? (
          <div className="flex gap-3">
          <Button
            onClick={async () => {
              if (isCommitting) return;
              console.log('[MULTI_INSTANCE_GATE][YES] Starting next instance');
              const gate = multiInstanceGate;
              setIsCommitting(true);

               // Append user's "Yes" answer to transcript
               const { appendUserMessage } = await import("../components/utils/chatTranscriptHelpers");
               const sessionForAnswer = await base44.entities.InterviewSession.get(sessionId);
               await appendUserMessage(sessionId, sessionForAnswer.transcript_snapshot || [], 'Yes', {
                 id: `mi-gate-answer-${gate.packId}-${gate.instanceNumber}-yes`,
                 messageType: 'MULTI_INSTANCE_GATE_ANSWER',
                 packId: gate.packId,
                 categoryId: gate.categoryId,
                 instanceNumber: gate.instanceNumber
               });

               // Reload transcript
               const updatedSession = await base44.entities.InterviewSession.get(sessionId);
               setTranscript(updatedSession.transcript_snapshot || []);

               // Clear gate
               setMultiInstanceGate(null);

               // Re-enter V3 pack with incremented instance number
               const nextInstanceNumber = (gate.instanceNumber || 1) + 1;

               console.log('[MULTI_INSTANCE_GATE][YES] Re-entering pack', {
                 packId: gate.packId,
                 categoryId: gate.categoryId,
                 instanceNumber: nextInstanceNumber
               });

               // Log pack re-entered
               await logPackEntered(sessionId, { 
                 packId: gate.packId, 
                 instanceNumber: nextInstanceNumber, 
                 isV3: true 
               });

               // Get deterministic opener for next instance
               const { getV3DeterministicOpener } = await import("../components/utils/v3ProbingPrompts");
               const opener = getV3DeterministicOpener(gate.packData, gate.categoryId, gate.categoryLabel);

               // Set up opener for next instance
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

               setCurrentItem(openerItem);
               await persistStateToDatabase(null, [], openerItem);
               setIsCommitting(false);
             }}
             disabled={isCommitting}
             className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
           >
             <Check className="w-5 h-5 mr-2" />
             Yes
           </Button>
           <Button
             onClick={async () => {
               if (isCommitting) return;
               console.log('[MULTI_INSTANCE_GATE][NO] Advancing to next question');
               const gate = multiInstanceGate;
               setIsCommitting(true);

               // Append user's "No" answer to transcript
               const { appendUserMessage } = await import("../components/utils/chatTranscriptHelpers");
               const sessionForAnswer = await base44.entities.InterviewSession.get(sessionId);
               await appendUserMessage(sessionId, sessionForAnswer.transcript_snapshot || [], 'No', {
                 id: `mi-gate-answer-${gate.packId}-${gate.instanceNumber}-no`,
                 messageType: 'MULTI_INSTANCE_GATE_ANSWER',
                 packId: gate.packId,
                 categoryId: gate.categoryId,
                 instanceNumber: gate.instanceNumber
               });

               // Reload transcript
               const updatedSession = await base44.entities.InterviewSession.get(sessionId);
               setTranscript(updatedSession.transcript_snapshot || []);

               // Clear gate
               setMultiInstanceGate(null);

               // Log pack exited
               await logPackExited(sessionId, {
                 packId: gate.packId,
                 instanceNumber: gate.instanceNumber
               });

               // Advance to next base question
               if (gate.baseQuestionId) {
                 const freshAfterGateNo = await refreshTranscriptFromDB('gate_no_before_advance');
                 await advanceToNextBaseQuestion(gate.baseQuestionId, freshAfterGateNo);
               }
               setIsCommitting(false);
             }}
             disabled={isCommitting}
             className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
           >
             <X className="w-5 h-5 mr-2" />
             No
           </Button>
          </div>
          ) : bottomBarMode === "YES_NO" ? (
           <div className="flex gap-3">
             <Button
               ref={yesButtonRef}
               onClick={() => !isCommitting && handleAnswer("Yes")}
               disabled={isCommitting}
               className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
             >
               <Check className="w-5 h-5 mr-2" />
               Yes
             </Button>
             <Button
               ref={noButtonRef}
               onClick={() => !isCommitting && handleAnswer("No")}
               disabled={isCommitting}
               className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
             >
               <X className="w-5 h-5 mr-2" />
               No
             </Button>
           </div>
          ) : bottomBarMode === "DISABLED" ? (
           <div className="space-y-2">
             <div className="flex gap-3">
               <Textarea
                 value=""
                 placeholder="Please respond above..."
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
            {/* LLM Suggestion - show if available for this field */}
            {(() => {
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
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  const value = e.target.value;
                  markUserTyping();
                  saveDraft(value);
                  setInput(value);
                }}
                onKeyDown={handleInputKeyDown}
                placeholder="Type your answer..."
                className="flex-1 min-h-[48px] resize-none bg-[#0d1829] border-2 border-green-500 focus:border-green-400 focus:ring-1 focus:ring-green-400/50 text-white placeholder:text-slate-400 transition-all duration-200 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-slate-800/50 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-600 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-slate-500"
                disabled={isCommitting}
                autoFocus
                rows={1}
              />
              <Button
                type="button"
                onClick={() => {
                  console.log("[BOTTOM_BAR_BUTTON][CLICK]", { currentItemType: currentItem?.type, packId: currentItem?.packId, fieldKey: currentItem?.fieldKey });
                  handleBottomBarSubmit();
                }}
                disabled={isBottomBarSubmitDisabled}
                className="h-12 bg-indigo-600 hover:bg-indigo-700 px-5"
              >
                <Send className="w-4 h-4 mr-2" />
                Send
              </Button>
            </div>
          </div>
          ) : null}

          {/* Footer disclaimer - always show except during V3 probing */}
          {!isV3Gate && !v3ProbingActive && (
           <p className="text-xs text-slate-400 text-center mt-3">
             Once you submit an answer, it cannot be changed. Contact your investigator after the interview if corrections are needed.
           </p>
          )}
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

      {/* V3 Debug Panel - Admin only */}
      {v3DebugEnabled && isAdminUser && session?.ide_version === "V3" && (
        <V3DebugPanel
          sessionId={sessionId}
          incidentId={v3ProbingContext?.incidentId}
        />
      )}
      </div>
      );
}