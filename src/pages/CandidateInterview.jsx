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

// Global logging flag for CandidateInterview
const DEBUG_MODE = false;

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
  const { packId, fieldKey, fieldValue, previousProbesCount, incidentContext, sessionId, questionCode, baseQuestionId } = params;

  console.log('[V2 PROBE] calling per-field probe', { 
    packId, 
    fieldKey, 
    fieldValue: fieldValue?.substring?.(0, 50) || fieldValue,
    previousProbesCount,
    sessionId,
    questionCode,
    baseQuestionId
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
      mode: 'VALIDATE_FIELD'
    });
    
    console.log('[V2 PROBE] success', { 
      mode: response.data?.mode,
      hasQuestion: !!response.data?.question,
      followupsCount: response.data?.followups?.length || 0
    });
    
    return response.data;
  } catch (err) {
    console.error('[V2 PROBE] error', { packId, fieldKey, message: err?.message });
    return {
      mode: 'ERROR',
      message: err.message || 'Failed to call probeEngineV2'
    };
  }
};

// Centralized V2 probe runner for both base questions and follow-ups
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
  maxAiFollowups
}) => {
  const probeCount = previousProbesCount || 0;
  
  if (!ENABLE_LIVE_AI_FOLLOWUPS) {
    console.log('[V2 FIELD PROBE] skipping – ENABLE_LIVE_AI_FOLLOWUPS is false');
    return { mode: 'SKIP', reason: 'feature disabled' };
  }
  
  if (!aiProbingEnabled) {
    console.log('[V2 FIELD PROBE] skipping – aiProbingEnabled is false');
    return { mode: 'SKIP', reason: 'AI probing disabled globally' };
  }
  
  if (aiProbingDisabledForSession) {
    console.log('[V2 FIELD PROBE] skipping – AI disabled for this session');
    return { mode: 'SKIP', reason: 'AI disabled for session' };
  }
  
  if (probeCount >= maxAiFollowups) {
    console.log('[V2 FIELD PROBE] skipping – max probes reached', { probeCount, maxAiFollowups });
    return { mode: 'SKIP', reason: 'quota exceeded' };
  }
  
  console.log('[V2 FIELD PROBE] follow-up: calling backend', {
    packId,
    fieldKey,
    questionCode,
    baseQuestionId,
    answer: fieldValue?.substring?.(0, 50) || fieldValue
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
      baseQuestionId
    });
    
    console.log('[V2 FIELD PROBE] success', {
      mode: v2Result?.mode,
      followups: v2Result?.followups?.length ?? 0,
      hasQuestion: !!v2Result?.question
    });
    
    return v2Result;
  } catch (err) {
    console.error('[V2 FIELD PROBE ERROR]', { packId, fieldKey, error: err?.message });
    return { mode: 'ERROR', message: err?.message };
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
    if (isCommitting || !currentItem || !engine) {
      return;
    }

    setIsCommitting(true);
    setValidationHint(null);
    
    if (sectionCompletionMessage) {
      setSectionCompletionMessage(null);
    }

    try {
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
            const { packId, substanceName } = followUpResult;
            
            console.log(`[FOLLOWUP-TRIGGER] Pack triggered: ${packId}, checking if V2 pack...`);
            const isV2Pack = useProbeEngineV2(packId);
            console.log(`[FOLLOWUP-TRIGGER] ${packId} isV2Pack=${isV2Pack}`);
            
            const categoryId = mapPackIdToCategory(packId);
            
            // === V2 PACK HANDLING: Enter V2_PACK mode ===
            if (isV2Pack) {
              const packConfig = FOLLOWUP_PACK_CONFIGS[packId];
              
              if (!packConfig || !Array.isArray(packConfig.fields) || packConfig.fields.length === 0) {
                console.warn("[V2_PACK] Missing or invalid pack config for", packId, packConfig);
              } else {
                // Build ordered list of fields in this V2 pack
                const orderedFields = packConfig.fields
                  .filter(f => f.fieldKey && f.label)
                  .sort((a, b) => (a.factsOrder || 0) - (b.factsOrder || 0));
                
                console.log("[V2_PACK] Entering V2 pack mode:", packId, "fields:", orderedFields.map(f => f.fieldKey));
                
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
      } else if (currentItem.type === 'v2_pack_field') {
        // === V2 PACK FIELD ANSWER HANDLING ===
        const { packId, fieldIndex, fieldKey, fieldConfig, baseQuestionId, instanceNumber } = currentItem;
        
        console.log("[V2_PACK] Handling answer for field", { packId, fieldIndex, fieldKey, answer: value });
        
        if (!activeV2Pack) {
          console.error("[V2_PACK] No active V2 pack but handling v2_pack_field");
          setIsCommitting(false);
          return;
        }
        
        const normalizedAnswer = value.trim();
        
        // Add to transcript
        const v2FieldEntry = createChatEvent('followup_question', {
          questionId: `v2pack-${packId}-${fieldIndex}`,
          questionText: fieldConfig.label,
          packId: packId,
          kind: 'v2_pack_followup',
          text: fieldConfig.label,
          content: fieldConfig.label,
          fieldKey: fieldKey,
          followupPackId: packId,
          instanceNumber: instanceNumber,
          baseQuestionId: baseQuestionId
        });
        
        const v2FieldTranscriptEntry = {
          ...v2FieldEntry,
          type: 'followup',
          answer: normalizedAnswer,
          text: normalizedAnswer
        };
        
        const newTranscript = [...transcript, v2FieldTranscriptEntry];
        setTranscript(newTranscript);
        
        // Update collected answers
        const updatedCollectedAnswers = {
          ...activeV2Pack.collectedAnswers,
          [fieldKey]: normalizedAnswer
        };
        
        // Save the follow-up answer to database
        await saveFollowUpAnswer(packId, fieldKey, normalizedAnswer, activeV2Pack.substanceName, instanceNumber, 'user');
        
        // Run V2 probing if enabled
        const maxAiFollowups = getPackMaxAiFollowups(packId);
        const fieldCountKey = `${packId}:${fieldKey}:${instanceNumber}`;
        const probeCount = aiFollowupCounts[fieldCountKey] || 0;
        const baseQuestion = engine.QById[baseQuestionId];
        
        console.log("[V2_PACK] Calling V2 field probe for follow-up question", { packId, fieldKey });
        
        const v2Result = await runV2FieldProbeIfNeeded({
          base44Client: base44,
          packId,
          fieldKey,
          fieldValue: normalizedAnswer,
          previousProbesCount: probeCount,
          incidentContext: updatedCollectedAnswers,
          sessionId,
          questionCode: baseQuestion?.question_id,
          baseQuestionId,
          aiProbingEnabled,
          aiProbingDisabledForSession,
          maxAiFollowups
        });
        
        // If probe returned a question, show it (AI probe UI)
        if (v2Result?.mode === 'QUESTION' && v2Result.question) {
          setAiFollowupCounts(prev => ({
            ...prev,
            [fieldCountKey]: probeCount + 1
          }));
          
          // Show AI probe question - update state for AI probing
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
          
          // Update activeV2Pack with collected answers
          setActiveV2Pack(prev => ({
            ...prev,
            collectedAnswers: updatedCollectedAnswers
          }));
          
          await persistStateToDatabase(newTranscript, [], currentItem);
          setIsCommitting(false);
          setInput("");
          return;
        }
        
        // Advance to next field in V2 pack or exit
        const nextIndex = fieldIndex + 1;
        
        if (nextIndex < activeV2Pack.fields.length) {
          // Move to next field
          const nextField = activeV2Pack.fields[nextIndex];
          
          console.log("[V2_PACK] Advancing to next question in pack", { packId, nextIndex, fieldKey: nextField.fieldKey });
          
          setActiveV2Pack(prev => ({
            ...prev,
            currentIndex: nextIndex,
            collectedAnswers: updatedCollectedAnswers
          }));
          
          const nextItem = {
            id: `v2pack-${packId}-${nextIndex}`,
            type: 'v2_pack_field',
            packId: packId,
            fieldIndex: nextIndex,
            fieldKey: nextField.fieldKey,
            fieldConfig: nextField,
            baseQuestionId: baseQuestionId,
            instanceNumber: instanceNumber
          };
          
          setCurrentItem(nextItem);
          setQueue([]);
          
          await persistStateToDatabase(newTranscript, [], nextItem);
        } else {
          // Pack complete - return to BASE mode
          console.log("[V2_PACK] Pack complete, returning to BASE mode", { packId });
          
          setActiveV2Pack(null);
          setV2PackMode("BASE");
          setCurrentFollowUpAnswers({});
          
          // Check for multi-instance
          const baseQuestion = engine.QById[baseQuestionId];
          if (baseQuestion?.followup_multi_instance) {
            // Trigger multi-instance prompt
            onFollowupPackComplete(baseQuestionId, packId);
          } else {
            // Advance to next base question
            advanceToNextBaseQuestion(baseQuestionId);
          }
          
          await persistStateToDatabase(newTranscript, [], null);
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
    } finally {
      setIsCommitting(false);
      setInput("");
    }
  }, [currentItem, engine, queue, transcript, sessionId, isCommitting, currentFollowUpAnswers, onFollowupPackComplete, advanceToNextBaseQuestion, sectionCompletionMessage]);

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

  const getCurrentPrompt = () => {
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
  const isYesNoQuestion = currentPrompt?.type === 'question' && currentPrompt?.responseType === 'yes_no' && !isWaitingForAgent && !inIdeProbingLoop;

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
            </div>
          ))}
          
          {currentPrompt && (
            <div className="bg-slate-800/95 backdrop-blur-sm border-2 border-blue-500/50 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg font-bold text-blue-400">
                  Question {getQuestionDisplayNumber(currentItem.id)}
                </span>
                <span className="text-sm text-slate-500">•</span>
                <span className="text-sm font-medium text-slate-300">{currentPrompt.category}</span>
              </div>
              <p className="text-white text-lg font-semibold">{currentPrompt.text}</p>
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
          {isYesNoQuestion ? (
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
          ) : (
            <form onSubmit={(e) => {
              e.preventDefault();
              const answer = input.trim();
              if (answer) handleAnswer(answer);
            }} className="flex gap-3">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your answer..."
                className="flex-1 bg-slate-900/50 border-slate-600 text-white"
                disabled={isCommitting}
              />
              <Button
                type="submit"
                disabled={!input.trim() || isCommitting}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Send className="w-5 h-5" />
              </Button>
            </form>
          )}
          
          <p className="text-xs text-slate-400 text-center mt-3">
            Once you submit an answer, it cannot be changed. Contact your investigator after the interview if corrections are needed.
          </p>
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
    </div>
  );
}