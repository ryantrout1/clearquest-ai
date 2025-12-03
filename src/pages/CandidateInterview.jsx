import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  shouldSkipProbingForHired
} from "../components/interviewEngine";
import { toast } from "sonner";
import { getAiAgentConfig } from "../components/utils/aiConfig";
import SectionCompletionMessage from "../components/interview/SectionCompletionMessage";
import StartResumeMessage from "../components/interview/StartResumeMessage";
import { updateFactForField } from "../components/followups/factsManager";
import { validateFollowupValue, answerLooksLikeNoRecall } from "../components/followups/semanticValidator";
import { FOLLOWUP_PACK_CONFIGS, getPackMaxAiFollowups, usePerFieldProbing } from "../components/followups/followupPackConfig";
import { getSystemConfig, getEffectiveInterviewMode } from "../components/utils/systemConfigHelpers";
import { getFactModelForCategory, mapPackIdToCategory } from "../components/utils/factModelHelpers";
import V3ProbingLoop from "../components/interview/V3ProbingLoop";
import V3DebugPanel from "../components/interview/V3DebugPanel";

// Global logging flag for CandidateInterview
const DEBUG_MODE = false;

// V3 Probing feature flag
const ENABLE_V3_PROBING = true;

// Feature flag: Enable chat virtualization for long interviews
const ENABLE_CHAT_VIRTUALIZATION = false;

// File revision: 2025-12-02 - Cleaned and validated

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

const useProbeEngineV2 = usePerFieldProbing;

const getFieldProbeKey = (packId, instanceNumber, fieldKey) => `${packId}_${instanceNumber || 1}_${fieldKey}`;

const callProbeEngineV2PerField = async (base44Client, params) => {
  const { packId, fieldKey, fieldValue, previousProbesCount, incidentContext, sessionId, questionCode, baseQuestionId, instanceNumber } = params;

  console.log('[V2_PER_FIELD][SEND] ========== CALLING BACKEND PER-FIELD PROBE ==========');
  console.log(`[V2_PER_FIELD][SEND] pack=${packId} field=${fieldKey} instance=${instanceNumber || 1}`);
  console.log('[V2_PER_FIELD][SEND] params:', { 
    packId, 
    fieldKey, 
    fieldValue: fieldValue?.substring?.(0, 50) || fieldValue,
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
    
    return response.data;
  } catch (err) {
    console.error('[V2_PER_FIELD][ERROR] Backend call failed:', { packId, fieldKey, message: err?.message });
    return {
      mode: 'ERROR',
      message: err.message || 'Failed to call probeEngineV2'
    };
  }
};

// Centralized V2 probe runner for both base questions and follow-ups
// CRITICAL: For V2 packs, we ALWAYS call the backend - it controls progression
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
instanceNumber
}) => {
const probeCount = previousProbesCount || 0;

// EXPLICIT ENTRY LOG
console.log(`[V2_PACK][CALL] packId=${packId} fieldId=${fieldKey} instanceNumber=${instanceNumber || 1} answerPreview="${String(fieldValue).slice(0, 80)}"`);

// Log the request before any checks
console.log("[V2_PACK][REQUEST]", {
  packId,
  fieldCode: fieldKey,
  answer: fieldValue?.substring?.(0, 50) || fieldValue,
  sessionId,
  questionCode,
  baseQuestionId,
  probeCount,
  maxAiFollowups,
  instanceNumber: instanceNumber || 1
});

// Check if feature is globally disabled
if (!ENABLE_LIVE_AI_FOLLOWUPS) {
  console.log(`[V2_PACK][SKIP_BACKEND] reason=FEATURE_DISABLED packId=${packId} fieldId=${fieldKey}`);
  // Return NEXT_FIELD to allow deterministic progression when AI is disabled
  return { mode: 'NEXT_FIELD', reason: 'feature disabled - deterministic fallback' };
}

// For V2 packs, we ALWAYS call the backend regardless of AI probing settings
// The backend decides whether to probe or advance - AI settings only affect probing behavior
// This is different from the old approach where we skipped backend calls entirely

console.log('[V2_PACK][CALLING_BACKEND]', {
  packId,
  fieldKey,
  questionCode,
  baseQuestionId,
  answer: fieldValue?.substring?.(0, 50) || fieldValue,
  aiProbingEnabled,
  probeCount,
  maxAiFollowups
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
    instanceNumber
  });
  
  // EXPLICIT RESPONSE LOG
  const decisionType = v2Result?.mode || 'UNKNOWN';
  const nextFieldId = v2Result?.nextField || (v2Result?.mode === 'NEXT_FIELD' ? 'next' : 'none');
  console.log(`[V2_PACK][RESPONSE] packId=${packId} fieldId=${fieldKey} decision=${decisionType} nextField=${nextFieldId}`);
  
  console.log("[V2_PACK][RESPONSE]", {
    packId,
    fieldCode: fieldKey,
    mode: v2Result?.mode,
    hasQuestion: !!v2Result?.question,
    questionPreview: v2Result?.question?.substring?.(0, 60),
    isComplete: v2Result?.mode === 'COMPLETE' || v2Result?.isComplete,
    nextField: v2Result?.nextField || null
  });
  
  // If AI probing is disabled but backend returned a probe question, convert to NEXT_FIELD
  if (!aiProbingEnabled || aiProbingDisabledForSession || probeCount >= maxAiFollowups) {
    if (v2Result?.mode === 'QUESTION') {
      console.log(`[V2_PACK][SKIP_BACKEND] reason=AI_DISABLED packId=${packId} fieldId=${fieldKey} (aiEnabled=${aiProbingEnabled}, sessionDisabled=${aiProbingDisabledForSession}, probeCount=${probeCount}/${maxAiFollowups})`);
      return { mode: 'NEXT_FIELD', reason: 'AI disabled - skipping probe' };
    }
  }
  
  return v2Result;
} catch (err) {
  console.log(`[V2_PACK][SKIP_BACKEND] reason=BACKEND_ERROR packId=${packId} fieldId=${fieldKey} error="${err?.message}"`);
  console.error('[V2_PACK][ERROR] Backend pack engine failed', { packId, fieldKey, error: err?.message });
  // On error, return NEXT_FIELD to allow deterministic progression
  return { mode: 'NEXT_FIELD', reason: 'backend error - deterministic fallback', error: err?.message };
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
  
  const [transcript, setTranscript] = useState([]);
  const [queue, setQueue] = useState([]);
  const [currentItem, setCurrentItem] = useState(null);
  
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
  
  const [fieldProbingState, setFieldProbingState] = useState({});
  const [completedFields, setCompletedFields] = useState({});
  const [currentFieldProbe, setCurrentFieldProbe] = useState(null);
  const [pendingProbe, setPendingProbe] = useState(null);
  const v2ProbingInProgressRef = useRef(new Set());

  const [aiProbingEnabled, setAiProbingEnabled] = useState(true);
  const [aiFailureReason, setAiFailureReason] = useState(null);
  const [handoffProcessed, setHandoffProcessed] = useState(false);
  
  const [input, setInput] = useState("");
  const [validationHint, setValidationHint] = useState(null);
  const [isCommitting, setIsCommitting] = useState(false);
  
  const triggeredPacksRef = useRef(new Set());
  const lastLoggedV2PackFieldRef = useRef(null);
  
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [isCompletingInterview, setIsCompletingInterview] = useState(false);
  const [showPauseModal, setShowPauseModal] = useState(false);
  
  const [screenMode, setScreenMode] = useState("LOADING");
  const introLoggedRef = useRef(false);
  
  const [sectionCompletionMessage, setSectionCompletionMessage] = useState(null);
  const [sectionTransitionInfo, setSectionTransitionInfo] = useState(null);
  const [pendingSectionTransition, setPendingSectionTransition] = useState(null);

  const historyRef = useRef(null);
  const displayOrderRef = useRef(0);
  const inputRef = useRef(null);
  const yesButtonRef = useRef(null);
  const noButtonRef = useRef(null);
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
  
  const displayNumberMapRef = useRef({});
  
  const totalQuestionsAllSections = engine?.TotalQuestions || 0;
  const answeredQuestionsAllSections = React.useMemo(
    () => transcript.filter(t => t.type === 'question').length,
    [transcript]
  );
  const questionCompletionPct = totalQuestionsAllSections > 0
    ? Math.round((answeredQuestionsAllSections / totalQuestionsAllSections) * 100)
    : 0;
  
  const MAX_PROBE_TURNS = 6;
  const AI_RESPONSE_TIMEOUT_MS = 45000;
  const TYPING_TIMEOUT_MS = 240000;

  const autoScrollToBottom = useCallback(() => {
    if (!historyRef.current) return;
    requestAnimationFrame(() => {
      if (historyRef.current) {
        historyRef.current.scrollTop = historyRef.current.scrollHeight;
      }
    });
  }, []);

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
    };
  }, [sessionId, navigate]);

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

      // Check if current user is admin
      try {
        const user = await base44.auth.me();
        setIsAdminUser(user?.role === 'admin' || user?.role === 'SUPER_ADMIN');
      } catch (e) {
        setIsAdminUser(false);
      }
      
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
        const restoreSuccessful = restoreFromSnapshots(engineData, loadedSession);

        if (!restoreSuccessful) {
          await rebuildSessionFromResponses(engineData, loadedSession);
        }
      } else {
        const firstQuestionId = engineData.ActiveOrdered[0];
        setQueue([]);
        setCurrentItem({ id: firstQuestionId, type: 'question' });
      }

      const hasAnyResponses = loadedSession.transcript_snapshot && loadedSession.transcript_snapshot.length > 0;
      const isNewSession = !hasAnyResponses;

      console.log("[CandidateInterview] init", {
        isNewSession,
        screenMode: isNewSession ? "WELCOME" : "QUESTION",
        layoutVersion: "section-first"
      });

      setScreenMode(isNewSession ? "WELCOME" : "QUESTION");
      setIsLoading(false);

    } catch (err) {
      const errorMessage = err?.message || err?.toString() || 'Unknown error occurred';
      setError(`Failed to load interview: ${errorMessage}`);
      setIsLoading(false);
    }
  };

  const restoreFromSnapshots = (engineData, loadedSession) => {
    const restoredTranscript = loadedSession.transcript_snapshot || [];
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

    setTranscript(restoredTranscript);
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
            questionId: response.question_id,
            questionText: question.question_text,
            answer: response.answer,
            category: sectionName,
            type: 'question',
            timestamp: response.response_timestamp
          });
        }
      }
      
      setTranscript(restoredTranscript);
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
      await base44.entities.InterviewSession.update(sessionId, {
        transcript_snapshot: newTranscript,
        queue_snapshot: newQueue,
        current_item_snapshot: newCurrentItem,
        total_questions_answered: newTranscript.filter(t => t.type === 'question').length,
        completion_percentage: Math.round((newTranscript.filter(t => t.type === 'question').length / engine.TotalQuestions) * 100),
        data_version: 'v2.5-hybrid'
      });
    } catch (err) {
      // Silently fail
    }
  }, [sessionId, engine]);

  const persistStateToDatabase = useCallback(async (newTranscript, newQueue, newCurrentItem) => {
    pendingPersistRef.current = { newTranscript, newQueue, newCurrentItem };
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

  const advanceToNextBaseQuestion = useCallback(async (baseQuestionId) => {
    const currentQuestion = engine.QById[baseQuestionId];
    if (!currentQuestion) {
      setShowCompletionModal(true);
      return;
    }

    const answeredQuestionIds = new Set(
      transcript.filter(t => t.type === 'question').map(t => t.questionId)
    );

    if (sections.length > 0) {
      const nextResult = getNextQuestionInSectionFlow({
        sections,
        currentSectionIndex,
        currentQuestionId: baseQuestionId,
        answeredQuestionIds
      });

      if (nextResult.mode === 'QUESTION') {
        const newTranscript = [...transcript];
        
        setCurrentSectionIndex(nextResult.nextSectionIndex);
        setQueue([]);
        setCurrentItem({ id: nextResult.nextQuestionId, type: 'question' });
        await persistStateToDatabase(newTranscript, [], { id: nextResult.nextQuestionId, type: 'question' });
        return;
      } else if (nextResult.mode === 'SECTION_TRANSITION') {
        const whatToExpect = WHAT_TO_EXPECT[nextResult.nextSection.id] || 'important background information';
        
        setCompletedSectionsCount(prev => Math.max(prev, nextResult.nextSectionIndex));
        
        const totalSectionsCount = sections.length;
        const answeredQuestionsCount = transcript.filter(t => t.type === 'question').length + 1;
        const totalQuestionsCount = engine?.TotalQuestions || 0;
        
        const completionMessage = {
          id: `section-complete-${Date.now()}`,
          type: 'system_section_complete',
          timestamp: new Date().toISOString(),
          kind: 'section_completion',
          role: 'system',
          completedSectionId: nextResult.completedSection.id,
          completedSectionName: nextResult.completedSection.displayName,
          nextSectionId: nextResult.nextSection.id,
          nextSectionName: nextResult.nextSection.displayName,
          whatToExpect: whatToExpect,
          progress: {
            completedSections: nextResult.nextSectionIndex,
            totalSections: totalSectionsCount,
            answeredQuestions: answeredQuestionsCount,
            totalQuestions: totalQuestionsCount
          }
        };
        
        const newTranscript = [...transcript, completionMessage];
        setTranscript(newTranscript);
        
        setPendingSectionTransition({
          nextSectionIndex: nextResult.nextSectionIndex,
          nextQuestionId: nextResult.nextQuestionId,
          nextSectionName: nextResult.nextSection.displayName
        });
        
        setQueue([]);
        setCurrentItem(null);
        await persistStateToDatabase(newTranscript, [], null);
        return;
      } else {
        const completionMessage = {
          id: `interview-complete-${Date.now()}`,
          type: 'system_message',
          content: 'Interview complete! Thank you for your thorough and honest responses.',
          timestamp: new Date().toISOString(),
          kind: 'interview_complete',
          role: 'system'
        };
        
        const newTranscript = [...transcript, completionMessage];
        setTranscript(newTranscript);
        
        setCurrentItem(null);
        setQueue([]);
        await persistStateToDatabase(newTranscript, [], null);
        setShowCompletionModal(true);
        return;
      }
    }

    const nextQuestionId = computeNextQuestionId(engine, baseQuestionId, 'Yes');
    if (nextQuestionId && engine.QById[nextQuestionId]) {
      setQueue([]);
      setCurrentItem({ id: nextQuestionId, type: 'question' });
      await persistStateToDatabase(transcript, [], { id: nextQuestionId, type: 'question' });
    } else {
      setCurrentItem(null);
      setQueue([]);
      await persistStateToDatabase(transcript, [], null);
      setShowCompletionModal(true);
    }
  }, [engine, transcript, sections, currentSectionIndex]);

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

        const multiInstanceQuestionEntry = {
          id: `mi-q-${Date.now()}`,
          type: 'multi_instance_question',
          content: multiInstancePrompt,
          questionId: baseQuestionId,
          packId: packId,
          instanceNumber: currentInstanceCount + 1,
          maxInstances: maxInstances,
          timestamp: new Date().toISOString()
        };

        setTranscript(prev => {
          const newTranscript = [...prev, multiInstanceQuestionEntry];

          setCurrentItem({
            id: `multi-instance-${baseQuestionId}-${packId}`,
            type: 'multi_instance',
            questionId: baseQuestionId,
            packId: packId,
            instanceNumber: currentInstanceCount + 1,
            maxInstances: maxInstances,
            prompt: multiInstancePrompt
          });

          persistStateToDatabase(newTranscript, [], {
            id: `multi-instance-${baseQuestionId}-${packId}`,
            type: 'multi_instance',
            questionId: baseQuestionId,
            packId: packId
          });

          return newTranscript;
        });
        return;
      }
    }
    
    advanceToNextBaseQuestion(baseQuestionId);
  }, [engine, sessionId, transcript, advanceToNextBaseQuestion]);

  const handleAnswer = useCallback(async (value) => {
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
      answerPreview: value?.substring?.(0, 50) || value
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
          hasActiveV2Pack: !!activeV2Pack
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
        
        console.log(`[HANDLE_ANSWER][V2_PACK_FIELD] Processing field ${fieldIndex + 1}/${totalFieldsInPack}: ${fieldKey}`);
        
        // Log Q&A to transcript
        const v2CombinedEntry = createChatEvent('followup_question', {
          questionId: `v2pack-${packId}-${fieldIndex}`,
          questionText: questionText,
          packId: packId,
          kind: 'v2_pack_followup',
          text: questionText,
          content: questionText,
          fieldKey: fieldKey,
          followupPackId: packId,
          instanceNumber: instanceNumber,
          baseQuestionId: baseQuestionId,
          source: 'V2_PACK',
          stepNumber: fieldIndex + 1,
          totalSteps: totalFieldsInPack,
          answer: finalAnswer
        });
        
        const newTranscript = [...transcript, v2CombinedEntry];
        setTranscript(newTranscript);
        
        // Update collected answers
        const updatedCollectedAnswers = {
          ...activeV2Pack.collectedAnswers,
          [fieldKey]: finalAnswer
        };
        
        // Save to database
        await saveFollowUpAnswer(packId, fieldKey, finalAnswer, activeV2Pack.substanceName, instanceNumber, 'user');
        
        // Call V2 backend engine
        const maxAiFollowups = getPackMaxAiFollowups(packId);
        const fieldCountKey = `${packId}:${fieldKey}:${instanceNumber}`;
        const probeCount = aiFollowupCounts[fieldCountKey] || 0;
        const baseQuestion = engine.QById[baseQuestionId];
        
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
          aiProbingDisabledForSession
        });
        
        const v2Result = await runV2FieldProbeIfNeeded({
          base44Client: base44,
          packId,
          fieldKey,
          fieldValue: finalAnswer,
          previousProbesCount: probeCount,
          incidentContext: updatedCollectedAnswers,
          sessionId,
          questionCode: baseQuestion?.question_id,
          baseQuestionId,
          aiProbingEnabled,
          aiProbingDisabledForSession,
          maxAiFollowups,
          instanceNumber
        });
        
        console.log(`[V2_PACK_FIELD][PROBE_RESULT] ========== BACKEND RESPONSE RECEIVED ==========`);
        console.log(`[V2_PACK_FIELD][PROBE_RESULT]`, {
          packId,
          fieldKey,
          instanceNumber,
          mode: v2Result?.mode,
          hasQuestion: !!v2Result?.question,
          questionPreview: v2Result?.question?.substring?.(0, 60),
          nextField: v2Result?.nextField || null,
          isComplete: v2Result?.isComplete || false
        });
        
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
        
        const isLastField = fieldIndex >= totalFieldsInPack - 1;
        
        // Handle AI probe question from backend
        if (v2Result?.mode === 'QUESTION' && v2Result.question) {
          console.log(`[V2_PACK_FIELD][AI_PROBE] ========== SHOWING AI FOLLOW-UP QUESTION ==========`);
          console.log(`[V2_PACK_FIELD][AI_PROBE]`, {
            packId,
            fieldKey,
            instanceNumber,
            question: v2Result.question?.substring?.(0, 80),
            newProbeCount: probeCount + 1
          });
          
          setAiFollowupCounts(prev => ({
            ...prev,
            [fieldCountKey]: probeCount + 1
          }));
          
          setIsWaitingForAgent(true);
          setIsInvokeLLMMode(true);
          setCurrentFieldProbe({
            packId,
            instanceNumber,
            fieldKey,
            baseQuestionId,
            substanceName: activeV2Pack.substanceName,
            currentItem,
            question: v2Result.question,
            isV2PackMode: true
          });
          
          setActiveV2Pack(prev => ({
            ...prev,
            collectedAnswers: updatedCollectedAnswers
          }));
          
          await persistStateToDatabase(newTranscript, [], currentItem);
          setIsCommitting(false);
          setInput("");
          return;
        }
        
        // Advance to next field or complete pack (only after backend says NEXT_FIELD)
        if (v2Result?.mode === 'NEXT_FIELD' && !isLastField) {
          const nextFieldIdx = fieldIndex + 1;
          const nextFieldConfig = activeV2Pack.fields[nextFieldIdx];
          
          console.log(`[V2_PACK_FIELD][NEXT_FIELD] ========== ADVANCING TO NEXT FIELD ==========`);
          console.log(`[V2_PACK_FIELD][NEXT_FIELD]`, {
            packId,
            currentField: fieldKey,
            nextField: nextFieldConfig.fieldKey,
            fieldProgress: `${nextFieldIdx + 1}/${totalFieldsInPack}`,
            instanceNumber
          });
          
          setActiveV2Pack(prev => ({
            ...prev,
            currentIndex: nextFieldIdx,
            collectedAnswers: updatedCollectedAnswers
          }));
          
          const nextItemForV2 = {
            id: `v2pack-${packId}-${nextFieldIdx}`,
            type: 'v2_pack_field',
            packId: packId,
            fieldIndex: nextFieldIdx,
            fieldKey: nextFieldConfig.fieldKey,
            fieldConfig: nextFieldConfig,
            baseQuestionId: baseQuestionId,
            instanceNumber: instanceNumber
          };
          
          setCurrentItem(nextItemForV2);
          setQueue([]);
          
          await persistStateToDatabase(newTranscript, [], nextItemForV2);
          console.log(`[V2_PACK_FIELD][NEXT_FIELD][DONE] Now showing: ${nextFieldConfig.fieldKey}`);
          setIsCommitting(false);
          setInput("");
          return;
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
        
        setActiveV2Pack(null);
        setV2PackMode("BASE");
        setCurrentFollowUpAnswers({});
        lastLoggedV2PackFieldRef.current = null;
        
        const baseQuestionForExit = engine.QById[baseQuestionId];
        if (baseQuestionForExit?.followup_multi_instance) {
          onFollowupPackComplete(baseQuestionId, packId);
        } else {
          advanceToNextBaseQuestion(baseQuestionId);
        }
        
        await persistStateToDatabase(newTranscript, [], null);
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
        
        const questionEvent = createChatEvent('question', {
          questionId: currentItem.id,
          questionCode: question.question_id,
          questionText: question.question_text,
          category: sectionName,
          sectionId: question.section_id,
          kind: 'base_question',
          text: question.question_text,
          content: question.question_text
        });

        const answerEvent = createChatEvent('answer', {
          questionId: currentItem.id,
          questionCode: question.question_id,
          answer: value,
          category: sectionName,
          sectionId: question.section_id,
          kind: 'base_answer',
          text: value,
          content: value
        });

        const combinedEntry = {
          ...questionEvent,
          answer: value,
          text: value
        };

        const newTranscript = [...transcript, combinedEntry];
        setTranscript(newTranscript);

        if (value === 'Yes') {
          const followUpResult = checkFollowUpTrigger(engine, currentItem.id, value, interviewMode);

          if (followUpResult) {
            const { packId, substanceName, isV3Pack } = followUpResult;

            console.log(`[FOLLOWUP-TRIGGER] Pack triggered: ${packId}, checking versions...`);
            const isV2Pack = useProbeEngineV2(packId);
            console.log(`[FOLLOWUP-TRIGGER] ${packId} isV2Pack=${isV2Pack}`);
            
            // === V2 PACK HANDLING: Enter V2_PACK mode ===
            // V2 packs take priority - check V2 first before any V3 logic
            if (isV2Pack) {
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
              
              // Special log for PACK_PRIOR_LE_APPS_STANDARD
              if (packId === 'PACK_PRIOR_LE_APPS_STANDARD') {
                console.log(`[V2_PACK][PRIOR_LE_APPS][ENTER] ========== ENTERING PRIOR LE APPS PACK ==========`);
                console.log(`[V2_PACK][PRIOR_LE_APPS][ENTER] fields=[${orderedFields.map(f => f.fieldKey).join(', ')}]`);
              }
              
              // Save the base question answer first
              saveAnswerToDatabase(currentItem.id, value, question);
              
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
              
              // Set the first V2 pack field as current item
              const firstField = orderedFields[0];
              setCurrentItem({
                id: `v2pack-${packId}-0`,
                type: 'v2_pack_field',
                packId: packId,
                fieldIndex: 0,
                fieldKey: firstField.fieldKey,
                fieldConfig: firstField,
                baseQuestionId: currentItem.id,
                instanceNumber: 1
              });
              setQueue([]);
              setCurrentFollowUpAnswers({});
              
              await persistStateToDatabase(newTranscript, [], {
                id: `v2pack-${packId}-0`,
                type: 'v2_pack_field',
                packId: packId,
                fieldIndex: 0
              });
              
              setIsCommitting(false);
              setInput("");
              return;
            }
            
            // === V3 PROBING CHECK (only for non-V2 packs) ===
            const categoryId = mapPackIdToCategory(packId);
            
            if (ENABLE_V3_PROBING && categoryId && !isV2Pack) {
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
                      incidentId: null // Will be created by decisionEngineV3
                    });
                    
                    await persistStateToDatabase(newTranscript, [], {
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
              
              await persistStateToDatabase(newTranscript, remainingQueue, firstItem);
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
            advanceToNextBaseQuestion(currentItem.id);
          }
        } else {
          advanceToNextBaseQuestion(currentItem.id);
        }
        
        saveAnswerToDatabase(currentItem.id, value, question);

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
          const prefilledEntry = {
            id: `fu-${Date.now()}`,
            questionId: currentItem.id,
            questionText: step.Prompt,
            packId: packId,
            substanceName: substanceName,
            type: 'followup',
            timestamp: new Date().toISOString(),
            kind: 'deterministic_followup',
            role: 'candidate',
            answer: step.PrefilledAnswer,
            text: step.PrefilledAnswer,
            fieldKey: step.Field_Key,
            followupPackId: packId,
            instanceNumber: currentItem.instanceNumber || 1
          };

          const newTranscript = [...transcript, prefilledEntry];
          setTranscript(newTranscript);

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
          
          await persistStateToDatabase(newTranscript, updatedQueue, nextItem);
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
            maxAiFollowups
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

            const followupEntry = {
              ...followupQuestionEvent,
              type: 'followup',
              answer: normalizedAnswer,
              text: normalizedAnswer
            };

            const newTranscript = [...transcript, followupEntry];
            setTranscript(newTranscript);
            
            setCurrentFollowUpAnswers(prev => ({
              ...prev,
              [fieldKey]: normalizedAnswer
            }));
            
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

        const followupEntry = {
          ...followupQuestionEvent,
          type: 'followup',
          answer: normalizedAnswer,
          text: normalizedAnswer
        };

        const newTranscript = [...transcript, followupEntry];
        setTranscript(newTranscript);

        const updatedFollowUpAnswers = {
          ...currentFollowUpAnswers,
          [step.Field_Key]: normalizedAnswer
        };
        setCurrentFollowUpAnswers(updatedFollowUpAnswers);

        await saveFollowUpAnswer(packId, step.Field_Key, normalizedAnswer, substanceName, instanceNumber);
        
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
        
        const transcriptEntry = {
          id: `mi-a-${questionId}-${packId}-${instanceNumber}-${Date.now()}`,
          type: 'multi_instance_answer',
          content: answer,
          questionId: questionId,
          packId: packId,
          instanceNumber: instanceNumber,
          timestamp: new Date().toISOString()
        };

        setTranscript(prev => {
          const newTranscript = [...prev, transcriptEntry];

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

              persistStateToDatabase(newTranscript, remainingQueue, firstItem);
            }
          } else {
            setCurrentItem(null);
            setQueue([]);
            persistStateToDatabase(newTranscript, [], null);
            advanceToNextBaseQuestion(questionId);
          }

          return newTranscript;
        });
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
  }, [currentItem, engine, queue, transcript, sessionId, isCommitting, currentFollowUpAnswers, onFollowupPackComplete, advanceToNextBaseQuestion, sectionCompletionMessage, activeV2Pack, v2PackMode, aiFollowupCounts, aiProbingEnabled, aiProbingDisabledForSession]);

  const saveAnswerToDatabase = async (questionId, answer, question) => {
    try {
      const existing = await base44.entities.Response.filter({
        session_id: sessionId,
        question_id: questionId
      });
      
      if (existing.length > 0) {
        return;
      }
      
      const currentDisplayOrder = displayOrderRef.current++;
      const triggersFollowup = question.followup_pack && answer.toLowerCase() === 'yes';
      
      const sectionEntity = engine.Sections.find(s => s.id === question.section_id);
      const sectionName = sectionEntity?.section_name || question.category || '';
      
      await base44.entities.Response.create({
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
        display_order: currentDisplayOrder
      });

    } catch (err) {
      console.error('❌ Database save error:', err);
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

  // V3 probing completion handler
  const handleV3ProbingComplete = useCallback(async (result) => {
    console.log("[V3 PROBING] Complete", result);
    
    const { incidentId, categoryId, completionReason, messages } = result;
    const baseQuestionId = v3ProbingContext?.baseQuestionId;
    
    // Add V3 completion to transcript
    const v3CompleteEntry = {
      id: `v3-complete-${Date.now()}`,
      type: 'v3_probing_complete',
      categoryId,
      incidentId,
      completionReason,
      messageCount: messages?.length || 0,
      timestamp: new Date().toISOString()
    };
    
    const newTranscript = [...transcript, v3CompleteEntry];
    setTranscript(newTranscript);
    
    // Exit V3 probing mode
    setV3ProbingActive(false);
    setV3ProbingContext(null);
    
    // Advance to next base question
    if (baseQuestionId) {
      await advanceToNextBaseQuestion(baseQuestionId);
    }
    
    await persistStateToDatabase(newTranscript, [], null);
  }, [v3ProbingContext, transcript, advanceToNextBaseQuestion, persistStateToDatabase]);
  
  // V3 transcript update handler
  const handleV3TranscriptUpdate = useCallback((entry) => {
    setTranscript(prev => [...prev, {
      ...entry,
      id: `v3-${entry.type}-${Date.now()}`
    }]);
  }, []);

  const getCurrentPrompt = () => {
    // V3 probing mode - no prompt, V3ProbingLoop handles it
    if (v3ProbingActive) {
      return null;
    }
    
    if (inIdeProbingLoop && currentIdeQuestion) {
      return {
        type: 'ide_probe',
        text: currentIdeQuestion,
        responseType: 'text',
        category: currentIdeCategoryId || 'Follow-up'
      };
    }
    
    if (isWaitingForAgent) {
      return null;
    }
    
    if (!currentItem || !engine) return null;

    if (currentItem.type === 'question') {
      const question = engine.QById[currentItem.id];
      
      if (!question) {
        setCurrentItem(null);
        setQueue([]);
        setShowCompletionModal(true);
        return null;
      }
      
      const sectionEntity = engine.Sections.find(s => s.id === question.section_id);
      const sectionName = sectionEntity?.section_name || question.category || '';
      
      return {
        type: 'question',
        id: currentItem.id,
        text: question.question_text,
        responseType: question.response_type,
        category: sectionName
      };
    }

    if (currentItem.type === 'followup') {
      const { packId, stepIndex, substanceName } = currentItem;
      
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
        id: currentItem.id,
        text: step.Prompt,
        responseType: step.Response_Type || 'text',
        expectedType: step.Expected_Type || 'TEXT',
        packId: packId,
        substanceName: substanceName,
        stepNumber: stepIndex + 1,
        totalSteps: packSteps.length
      };
    }

    if (currentItem.type === 'multi_instance') {
      return {
        type: 'multi_instance',
        id: currentItem.id,
        text: currentItem.prompt,
        responseType: 'yes_no',
        instanceNumber: currentItem.instanceNumber,
        maxInstances: currentItem.maxInstances
      };
    }

    // V2 Pack field question
    if (currentItem.type === 'v2_pack_field') {
      const { packId, fieldIndex, fieldConfig, instanceNumber } = currentItem;
      const packConfig = FOLLOWUP_PACK_CONFIGS[packId];
      const totalFields = packConfig?.fields?.length || 0;
      
      console.log("[V2_PACK] Rendering question", currentItem.fieldKey, "for pack", packId);
      
      // Log currentItem structure for debugging
      console.log("[V2_PACK][CURRENT_ITEM]", {
        type: currentItem.type,
        id: currentItem.id,
        v2PackId: packId,
        fieldKey: currentItem.fieldKey,
        v2InstanceNumber: instanceNumber
      });
      
      // Special log for PACK_PRIOR_LE_APPS_STANDARD rendering
      if (packId === 'PACK_PRIOR_LE_APPS_STANDARD') {
        console.log(`[V2_PACK][PRIOR_LE_APPS][RENDER] Rendering ${currentItem.fieldKey} (${fieldIndex + 1}/${totalFields})`, {
          label: fieldConfig?.label,
          inputType: fieldConfig?.inputType
        });
      }
      
      return {
        type: 'v2_pack_field',
        id: currentItem.id,
        text: fieldConfig.label,
        responseType: fieldConfig.inputType === 'yes_no' ? 'yes_no' : 'text',
        inputType: fieldConfig.inputType,
        placeholder: fieldConfig.placeholder,
        options: fieldConfig.options,
        packId: packId,
        fieldKey: currentItem.fieldKey,
        stepNumber: fieldIndex + 1,
        totalSteps: totalFields,
        instanceNumber: instanceNumber,
        category: packConfig?.instancesLabel || 'Follow-up'
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

  const currentPrompt = getCurrentPrompt();

  // Treat v2_pack_field the same as a normal question for bottom-bar input
  const isAnswerableItem = (item) => {
    if (!item) return false;
    return item.type === "question" || item.type === "v2_pack_field" || item.type === "followup";
  };

  // Normalize bottom-bar mode flags
  const currentItemType = currentItem?.type || null;
  const isQuestion = currentItemType === "question" || currentItemType === "v2_pack_field";
  const isV2PackField = currentItemType === "v2_pack_field";
  const isFollowup = currentItemType === "followup";
  const answerable = isAnswerableItem(currentItem) || isV2PackField;

  const isYesNoQuestion = (currentPrompt?.type === 'question' && currentPrompt?.responseType === 'yes_no' && !isWaitingForAgent && !inIdeProbingLoop) ||
                          (currentPrompt?.type === 'v2_pack_field' && currentPrompt?.responseType === 'yes_no');

  // Show text input for question, v2_pack_field, or followup types (unless yes/no)
  const showTextInput = answerable && !isYesNoQuestion;

  // Debug log: confirm which bottom bar path is rendering
  console.log("[BOTTOM_BAR_RENDER]", {
    currentItemType,
    currentItemId: currentItem?.id,
    packId: currentItem?.packId,
    fieldKey: currentItem?.fieldKey,
    isQuestion,
    isV2PackField,
    answerable,
    isYesNoQuestion,
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
    setInput("");
  };

  // Keydown handler for Enter key on bottom bar input
  const handleInputKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      console.log("[BOTTOM_BAR][KEYDOWN_ENTER]", {
        key: e.key,
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
  const isBottomBarSubmitDisabled = !answerable || isCommitting || !(input ?? "").trim();

  if (screenMode === "WELCOME") {
    return (
      <div className="h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex flex-col">
        {/* Header - same as question view */}
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

        {/* Main content - flex-1 with flex-end to dock card at bottom */}
        <main className="flex-1 flex flex-col justify-end items-center px-4 py-6">
          <div className="w-full max-w-4xl mb-6">
            <div className="bg-slate-800/95 backdrop-blur-sm border-2 border-blue-500/50 rounded-xl p-6 shadow-2xl">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0 border-2 border-blue-500/50">
                  <Shield className="w-6 h-6 text-blue-400" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-white mb-2">
                    Welcome to your ClearQuest Interview
                  </h2>
                  <p className="text-slate-300 text-sm leading-relaxed mb-4">
                    This interview is part of your application process. Here's what to expect:
                  </p>

                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                      <p className="text-slate-300 text-sm">One question at a time, at your own pace</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                      <p className="text-slate-300 text-sm">Clear, complete, and honest answers help investigators understand the full picture</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                      <p className="text-slate-300 text-sm">You can pause and come back — we'll pick up where you left off</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Footer - same pattern as question view */}
        <footer className="flex-shrink-0 bg-[#121c33] border-t border-slate-700 px-4 py-4">
          <div className="max-w-5xl mx-auto flex flex-col items-center">
            <Button
              onClick={() => {
                console.log("[CandidateInterview] Starting interview - switching to QUESTION mode");
                setScreenMode("QUESTION");
                setTimeout(() => autoScrollToBottom(), 100);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-12 py-3 text-base font-semibold"
              size="lg"
            >
              Next
            </Button>
            <p className="text-xs text-blue-400 text-center mt-3">
              Click Next to begin your interview
            </p>
          </div>
        </footer>
      </div>
    );
  }

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

      <main className="flex-1 overflow-y-auto px-4 py-6" ref={historyRef}>
        <div className="max-w-5xl mx-auto space-y-4">
          {transcript.map((entry, index) => (
            <div key={`${entry.type}-${entry.id || index}`}>
              {/* Base questions with answers */}
              {entry.type === 'question' && (
                <div className="space-y-3">
                  <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5">
                    <p className="text-white">{entry.questionText}</p>
                  </div>
                  <div className="flex justify-end">
                    <div className="bg-blue-600 rounded-xl px-5 py-3">
                      <p className="text-white">{entry.answer}</p>
                    </div>
                  </div>
                </div>
              )}
              
              {/* V2 Pack followups (combined question+answer, logged on answer submission) */}
              {entry.type === 'followup_question' && entry.source === 'V2_PACK' && entry.answer && (
                <div className="space-y-2 ml-4">
                  <div className="bg-purple-900/30 border border-purple-700/50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-purple-400 font-medium">
                        Follow-up {entry.stepNumber} of {entry.totalSteps}
                      </span>
                    </div>
                    <p className="text-white text-sm">{entry.questionText || entry.text}</p>
                  </div>
                  <div className="flex justify-end">
                    <div className="bg-purple-600 rounded-xl px-4 py-2">
                      <p className="text-white text-sm">{entry.answer}</p>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Legacy/deterministic followup entries (combined question+answer) */}
              {entry.type === 'followup' && !entry.source && (
                <div className="space-y-2 ml-4">
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
              )}
            </div>
          ))}
          
          {/* V3 Probing Loop */}
          {v3ProbingActive && v3ProbingContext && (
            <V3ProbingLoop
              sessionId={sessionId}
              categoryId={v3ProbingContext.categoryId}
              incidentId={v3ProbingContext.incidentId}
              baseQuestionId={v3ProbingContext.baseQuestionId}
              onComplete={handleV3ProbingComplete}
              onTranscriptUpdate={handleV3TranscriptUpdate}
            />
          )}
          
          {/* Section Completion Card - shown when a section is complete and waiting to begin next */}
          {pendingSectionTransition && !currentItem && !v3ProbingActive && (
            <div className="bg-gradient-to-br from-emerald-900/80 to-emerald-800/60 backdrop-blur-sm border-2 border-emerald-500/50 rounded-xl p-6 shadow-2xl">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-emerald-600/30 flex items-center justify-center flex-shrink-0 border-2 border-emerald-500/50">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-white mb-2">
                    Section Complete: {activeSection?.displayName || 'Current Section'}
                  </h2>
                  <p className="text-emerald-200 text-sm leading-relaxed mb-4">
                    Nice work — you've finished this section. Ready for the next one?
                  </p>
                  
                  <div className="bg-emerald-950/40 rounded-lg p-3 mb-4">
                    <p className="text-emerald-300 text-sm font-medium">
                      Next up: {pendingSectionTransition.nextSectionName}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-4 text-xs text-emerald-300/80">
                    <span>{completedSectionsCount + 1} of {sections.length} sections complete</span>
                    <span>•</span>
                    <span>{answeredQuestionsAllSections} of {totalQuestionsAllSections} questions answered</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentPrompt && !v3ProbingActive && !pendingSectionTransition && (
            <div className={`bg-slate-800/95 backdrop-blur-sm border-2 rounded-xl p-6 ${isV2PackField ? 'border-purple-500/50' : 'border-blue-500/50'}`}>
              <div className="flex items-center gap-2 mb-3">
                {isV2PackField ? (
                  <>
                    <span className="text-lg font-bold text-purple-400">
                      Follow-up {currentPrompt.stepNumber} of {currentPrompt.totalSteps}
                    </span>
                    <span className="text-sm text-slate-500">•</span>
                    <span className="text-sm font-medium text-slate-300">{currentPrompt.category}</span>
                  </>
                ) : (
                  <>
                    <span className="text-lg font-bold text-blue-400">
                      Question {getQuestionDisplayNumber(currentItem.id)}
                    </span>
                    <span className="text-sm text-slate-500">•</span>
                    <span className="text-sm font-medium text-slate-300">{currentPrompt.category}</span>
                  </>
                )}
              </div>
              <p className="text-white text-lg font-semibold">{currentPrompt.text}</p>
              {currentPrompt.placeholder && (
                <p className="text-slate-400 text-sm mt-1">{currentPrompt.placeholder}</p>
              )}
              {validationHint && (
                <div className="mt-3 bg-yellow-900/40 border border-yellow-700/60 rounded-lg p-3">
                  <p className="text-yellow-200 text-sm">{validationHint}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <footer className="flex-shrink-0 bg-[#121c33] border-t border-slate-700 px-4 py-4">
        <div className="max-w-5xl mx-auto">
          {/* Section transition: show "Begin Next Section" button */}
          {pendingSectionTransition && !currentItem && !v3ProbingActive ? (
            <div className="flex flex-col items-center">
              <Button
                onClick={() => {
                  console.log("[CandidateInterview] Beginning next section", pendingSectionTransition);
                  setCurrentSectionIndex(pendingSectionTransition.nextSectionIndex);
                  setCurrentItem({ id: pendingSectionTransition.nextQuestionId, type: 'question' });
                  setPendingSectionTransition(null);
                  persistStateToDatabase(transcript, [], { id: pendingSectionTransition.nextQuestionId, type: 'question' });
                  setTimeout(() => autoScrollToBottom(), 100);
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 text-base font-semibold"
                size="lg"
              >
                Begin Next Section →
              </Button>
              <p className="text-xs text-emerald-400 text-center mt-3">
                Click to continue to {pendingSectionTransition.nextSectionName}
              </p>
            </div>
          ) : v3ProbingActive ? (
                <p className="text-xs text-emerald-400 text-center">
                  Please respond to the AI follow-up questions above.
                </p>
              ) : isYesNoQuestion && !isV2PackField ? (
            <div className="flex gap-3">
              <Button
                ref={yesButtonRef}
                onClick={() => handleAnswer("Yes")}
                disabled={isCommitting}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                <Check className="w-5 h-5 mr-2" />
                Yes
              </Button>
              <Button
                ref={noButtonRef}
                onClick={() => handleAnswer("No")}
                disabled={isCommitting}
                className="flex-1 bg-red-600 hover:bg-red-700"
              >
                <X className="w-5 h-5 mr-2" />
                No
              </Button>
            </div>
          ) : isV2PackField && currentPrompt?.inputType === 'select_single' && currentPrompt?.options ? (
            <div className="flex flex-wrap gap-2">
              {currentPrompt.options.map((option) => (
                <Button
                  key={option}
                  onClick={() => handleAnswer(option)}
                  disabled={isCommitting}
                  className="bg-purple-600 hover:bg-purple-700 text-sm"
                >
                  {option}
                </Button>
              ))}
            </div>
          ) : isV2PackField && currentPrompt?.inputType === 'yes_no' ? (
            <div className="flex gap-3">
              <Button
                onClick={() => handleAnswer("Yes")}
                disabled={isCommitting}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                <Check className="w-5 h-5 mr-2" />
                Yes
              </Button>
              <Button
                onClick={() => handleAnswer("No")}
                disabled={isCommitting}
                className="flex-1 bg-red-600 hover:bg-red-700"
              >
                <X className="w-5 h-5 mr-2" />
                No
              </Button>
            </div>
          ) : showTextInput && !pendingSectionTransition ? (
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              handleBottomBarSubmit();
            }}
            className="flex gap-3"
          >
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Type your answer..."
              className="flex-1 bg-slate-900/50 border-slate-600 text-white"
              disabled={isCommitting}
            />
            <Button
              type="submit"
              disabled={isBottomBarSubmitDisabled}
              className={isV2PackField ? "bg-purple-600 hover:bg-purple-700" : "bg-blue-600 hover:bg-blue-700"}
            >
              <Send className="w-5 h-5" />
            </Button>
          </form>
          ) : null}
          
          {!v3ProbingActive && (
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