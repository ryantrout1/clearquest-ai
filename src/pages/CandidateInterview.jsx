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

// Follow-up pack display names
const FOLLOWUP_PACK_NAMES = {
  'PACK_LE_APPS': 'Applications with other Law Enforcement Agencies',
  'PACK_WITHHOLD_INFO': 'Withheld Information',
  'PACK_DISQUALIFIED': 'Prior Disqualification',
  'PACK_CHEATING': 'Test Cheating',
  'PACK_DUI': 'DUI Incident',
  'PACK_LICENSE_SUSPENSION': 'License Suspension',
  'PACK_RECKLESS_DRIVING': 'Reckless Driving',
  'PACK_DRIVE_NO_INSURANCE': 'Driving Without Insurance',
  'PACK_COLLISION': 'Vehicle Collision',
  'PACK_COLLISION_INJURY': 'Collision with Injuries',
  'PACK_ALCOHOL_COLLISION': 'Alcohol-Related Collision',
  'PACK_UNREPORTED_COLLISION': 'Unreported Collision',
  'PACK_HIT_RUN': 'Hit and Run Incident',
  'PACK_HIT_RUN_DAMAGE': 'Hit and Run Damage Details',
  'PACK_FIGHT': 'Physical Fight Incident',
  'PACK_ARREST': 'Arrest History',
  'PACK_CRIMINAL_CHARGE': 'Criminal Charge',
  'PACK_FELONY': 'Felony History',
  'PACK_WARRANT': 'Outstanding Warrant',
  'PACK_PROTECTIVE_ORDER': 'Protective Order',
  'PACK_GANG': 'Gang Affiliation',
  'PACK_WEAPON_VIOLATION': 'Weapons Violation',
  'PACK_EXTREMIST': 'Extremist Organization Involvement',
  'PACK_PROSTITUTION': 'Prostitution Involvement',
  'PACK_PORNOGRAPHY': 'Pornography Involvement',
  'PACK_HARASSMENT': 'Sexual Harassment',
  'PACK_ASSAULT': 'Sexual Assault',
  'PACK_MINOR_CONTACT': 'Contact with Minor',
  'PACK_FINANCIAL': 'Financial Issue',
  'PACK_BANKRUPTCY': 'Bankruptcy',
  'PACK_FORECLOSURE': 'Foreclosure',
  'PACK_REPOSSESSION': 'Property Repossession',
  'PACK_LAWSUIT': 'Civil Lawsuit',
  'PACK_LATE_PAYMENT': 'Late Payments',
  'PACK_GAMBLING': 'Gambling Problem',
  'PACK_DRUG_USE': 'Drug Use History',
  'PACK_DRUG_SALE': 'Drug Sales',
  'PACK_PRESCRIPTION_MISUSE': 'Prescription Medication Misuse',
  'PACK_ALCOHOL_DEPENDENCY': 'Alcohol Dependency',
  'PACK_ALCOHOL_INCIDENT': 'Alcohol-Related Incident',
  'PACK_MIL_DISCHARGE': 'Military Discharge',
  'PACK_MIL_DISCIPLINE': 'Military Discipline',
  'PACK_DISCIPLINE': 'Workplace Discipline',
  'PACK_WORK_DISCIPLINE': 'Employment Discipline',
  'PACK_FIRED': 'Employment Termination',
  'PACK_QUIT_AVOID': 'Resignation to Avoid Discipline',
  'PACK_DRUG_TEST_CHEAT': 'Drug Test Tampering',
  'PACK_FALSE_APPLICATION': 'False Employment Application',
  'PACK_MISUSE_RESOURCES': 'Misuse of Employer Resources',
  'PACK_THEFT': 'Theft Incident',
  'PACK_UNEMPLOYMENT_FRAUD': 'Unemployment Fraud',
  'PACK_LE_PREV': 'Prior Law Enforcement Employment',
  'PACK_ACCUSED_FORCE': 'Excessive Force Accusation',
  'PACK_GRATUITY': 'Gratuity Acceptance',
  'PACK_FALSIFY_REPORT': 'Falsified Report',
  'PACK_INTERNAL_AFFAIRS': 'Internal Affairs Investigation',
  'PACK_LYING_LE': 'Untruthfulness in Law Enforcement',
  'PACK_LE_COMPLAINT': 'Law Enforcement Complaint',
  'PACK_OTHER_PRIOR_LE': 'Other Prior Law Enforcement Issues',
  'PACK_EMBARRASSMENT': 'Potential Embarrassment',
  'PACK_TATTOO': 'Visible Tattoo',
  'PACK_SOCIAL_MEDIA': 'Social Media Content',
  'PACK_DOMESTIC': 'Domestic Violence',
  'PACK_TRAFFIC': 'Traffic Violation'
};

// Heavy sections requiring sensitive handling
const HEAVY_SECTIONS = [
  'Illegal Drug / Narcotic History',
  'Criminal Involvement / Police Contacts',
  'Sexual Activities',
  'Gang Affiliation',
  'Extremist Organizations',
  'Domestic Violence'
];

// FEATURE FLAG: Enable live AI follow-ups (via invokeLLM server function)
const ENABLE_LIVE_AI_FOLLOWUPS = true;

// DEBUG FLAG: Enable detailed AI probe logging
const DEBUG_AI_PROBES = true;

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
        
        console.log(`[SYNC_FACTS] Synced facts for Q:${questionId} on session ${sessionId}`, newFactEntry);

    } catch (err) {
        console.error('[SYNC_FACTS] Error syncing facts to InterviewSession:', err);
    }
};


function logAiProbeDebug(label, payload) {
  if (!DEBUG_AI_PROBES) return;
  try {
    console.log('[AI-PROBE-DEBUG]', label, payload);
  } catch (e) {
    // ignore logging errors
  }
}

// ============================================================================
// CENTRALIZED CHAT EVENT HELPER
// ============================================================================

/**
 * Creates a standardized chat event object for the transcript
 * Supports: system_welcome, question, answer, followup_question, followup_answer,
 *           ai_probe_question, ai_probe_answer, progress_message, section_transition
 */
const createChatEvent = (type, data = {}) => {
  const baseEvent = {
    id: `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    timestamp: new Date().toISOString(),
    ...data
  };
  
  // Normalize role based on type
  if (['system_welcome', 'progress_message', 'section_transition', 'system_message'].includes(type)) {
    baseEvent.role = 'system';
  } else if (['question', 'followup_question', 'ai_probe_question', 'ai_question', 'multi_instance_question'].includes(type)) {
    baseEvent.role = 'investigator';
  } else if (['answer', 'followup_answer', 'ai_probe_answer', 'ai_answer', 'multi_instance_answer'].includes(type)) {
    baseEvent.role = 'candidate';
  }
  
  return baseEvent;
};

// ============================================================================
// PROBE ENGINE V2 - FEATURE FLAG & HELPER
// ============================================================================

/**
 * Feature flag: Determines which packs use ProbeEngineV2
 * NOW CONFIG-DRIVEN: Checks FOLLOWUP_PACK_CONFIGS[packId].usePerFieldProbing
 * This allows any pack to opt into V2 per-field probing via configuration
 */
const useProbeEngineV2 = usePerFieldProbing;

const getProbeKey = (packId, instanceNumber) => `${packId}_${instanceNumber || 1}`;
const getFieldProbeKey = (packId, instanceNumber, fieldKey) => `${packId}_${instanceNumber || 1}_${fieldKey}`;

/**
 * Call probeEngineV2 for per-field validation (PACK_LE_APPS only)
 */
const callProbeEngineV2PerField = async (base44Client, params) => {
  const { packId, fieldKey, fieldValue, previousProbesCount, incidentContext } = params;

  try {
    console.log('[V2-PER-FIELD] Calling backend for field validation:', {
      pack_id: packId,
      field_key: fieldKey,
      field_value: fieldValue,
      previous_probes_count: previousProbesCount
    });

    const response = await base44Client.functions.invoke('probeEngineV2', {
      pack_id: packId,
      field_key: fieldKey,
      field_value: fieldValue,
      previous_probes_count: previousProbesCount || 0,
      incident_context: incidentContext || {},
      mode: 'VALIDATE_FIELD'
    });

    console.log('[V2-PER-FIELD] Response:', response.data);
    
    // NOTE: AI probe question logging is handled in the calling code after this returns
    // when response.data.mode === 'QUESTION'
    
    return response.data;
  } catch (err) {
    console.error('[V2-PER-FIELD] Error calling backend:', err);
    return {
      mode: 'ERROR',
      message: err.message || 'Failed to call probeEngineV2'
    };
  }
};

/**
 * CandidateInterview - CANONICAL INTERVIEW PAGE (v2.5)
 * Deterministic base questions + follow-up packs (UI-driven) with conditional logic
 * AI agent handles probing + closure (after follow-up packs complete)
 * State persisted to database for seamless resume
 * PATCH: Smooth chat UI for investigator follow-ups (no refresh)
 * 
 * AI probing architecture (2025-11 refactor):
 * - Per-pack mini-sessions (start after last deterministic follow-up, end after probing/timeout)
 * - Separate typing timeout (4 min) and AI response timeout (45s)
 * - Graceful fallback: system message + deterministic handoff + disable further AI probing
 */
export default function CandidateInterview() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('session');

  // Core state
  const [engine, setEngine] = useState(null);
  const [session, setSession] = useState(null);
  const [department, setDepartment] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Queue-based state (persisted to DB for resume)
  const [transcript, setTranscript] = useState([]);
  const [queue, setQueue] = useState([]);
  const [currentItem, setCurrentItem] = useState(null);
  
  // Track answers within current follow-up pack for conditional logic
  const [currentFollowUpAnswers, setCurrentFollowUpAnswers] = useState({});
  
  // AI agent integration - per-pack mini-sessions
  const [aiSessionId, setAiSessionId] = useState(null); // Current conversation ID for active probing
  const [aiProbingPackInstanceKey, setAiProbingPackInstanceKey] = useState(null); // e.g. "PACK_COLLISION#1"
  const [agentMessages, setAgentMessages] = useState([]);
  const [isWaitingForAgent, setIsWaitingForAgent] = useState(false);
  const [currentFollowUpPack, setCurrentFollowUpPack] = useState(null); // Track active pack for handoff
  const [probingTurnCount, setProbingTurnCount] = useState(0); // Safety counter
  const [aiProbingDisabledForSession, setAiProbingDisabledForSession] = useState(false); // Global disable flag

  // NEW: Track AI follow-up counts per pack instance
  const [aiFollowupCounts, setAiFollowupCounts] = useState({});
  const [isInvokeLLMMode, setIsInvokeLLMMode] = useState(false); // Track if using invokeLLM vs agent
  const [invokeLLMProbingExchanges, setInvokeLLMProbingExchanges] = useState([]); // Accumulate Q&A for current pack
  
  // State for V2 per-field probing logic
  // Shape: { [packId_instanceNumber_fieldKey]: { probeCount: number, lastQuestion: string, isProbing: boolean } }
  const [fieldProbingState, setFieldProbingState] = useState({});
  // Track which fields have been fully validated for each pack instance
  const [completedFields, setCompletedFields] = useState({});
  // Track current field being probed (for inline AI question rendering)
  const [currentFieldProbe, setCurrentFieldProbe] = useState(null);
  // Ref to prevent duplicate V2 triggers in StrictMode
  const v2ProbingInProgressRef = useRef(new Set());

  // NEW: Session-level AI probing control
  const [aiProbingEnabled, setAiProbingEnabled] = useState(true);
  const [aiFailureReason, setAiFailureReason] = useState(null);
  const [handoffProcessed, setHandoffProcessed] = useState(false);

  // NOTE: Pack config is now fetched from centralized FOLLOWUP_PACK_CONFIGS via getPackMaxAiFollowups()
  
  // Input state
  const [input, setInput] = useState("");
  const [validationHint, setValidationHint] = useState(null);
  const [isCommitting, setIsCommitting] = useState(false);
  
  // IDEMPOTENCY: Track triggered packs to prevent duplicate triggers (React StrictMode safe)
  const triggeredPacksRef = useRef(new Set()); // Set of "baseQuestionId:packId" keys
  
  // Modal state
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [isCompletingInterview, setIsCompletingInterview] = useState(false);
  const [showPauseModal, setShowPauseModal] = useState(false);
  
  // Start/Resume interview state
  const [showStartMessage, setShowStartMessage] = useState(false);
  const [showResumeMessage, setShowResumeMessage] = useState(false);
  const introLoggedRef = useRef(false);
  
  // Section completion message state
  const [sectionCompletionMessage, setSectionCompletionMessage] = useState(null);
  const [sectionTransitionInfo, setSectionTransitionInfo] = useState(null);

  // Refs
  const historyRef = useRef(null);
  const displayOrderRef = useRef(0);
  const inputRef = useRef(null);
  const yesButtonRef = useRef(null);
  const noButtonRef = useRef(null);
  const unsubscribeRef = useRef(null);
  const typingTimeoutRef = useRef(null); // Typing timeout (4 min)
  const aiResponseTimeoutRef = useRef(null); // AI response timeout (45s)
  
  // NEW: Track global display numbers for questions
  const displayNumberMapRef = useRef({}); // Map question_id -> display number
  
  // CONSTANTS - Separate timeouts for typing vs AI response
  const MAX_PROBE_TURNS = 6; // Safety cap for probing exchanges
  const AI_RESPONSE_TIMEOUT_MS = 45000; // 45 seconds - how long we wait for AI to respond
  const TYPING_TIMEOUT_MS = 240000; // 4 minutes - how long candidate can type
  
  // NEW: Helper to disable AI probing for this session
  const disableAiForSession = useCallback((reason, error) => {
      if (!aiProbingEnabled) return;

      setAiProbingEnabled(false);
      setAiFailureReason(reason);

      // Show user-friendly message
      if (reason.includes('500')) {
        toast.info('AI assistance temporarily unavailable - continuing with standard interview');
      }
    }, [aiProbingEnabled]);

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

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
      // Clear all timers on unmount
      clearTimeout(typingTimeoutRef.current);
      clearTimeout(aiResponseTimeoutRef.current);
    };
  }, [sessionId, navigate]);

  // Enhanced autofocus - handles both deterministic and agent modes
  useEffect(() => {
    if (!isCommitting) {
      requestAnimationFrame(() => {
        // Agent mode - always focus text input
        if (isWaitingForAgent && inputRef.current) {
          inputRef.current.focus({ preventScroll: false });
        }
        // Deterministic mode - prefer Y/N buttons if present
        else if (currentItem && !isWaitingForAgent) {
          if (yesButtonRef.current) {
            yesButtonRef.current.focus({ preventScroll: false });
          } else if (inputRef.current) {
            inputRef.current.focus({ preventScroll: false });
          }
        }
      });
    }
  }, [currentItem, isCommitting, isWaitingForAgent]);

  // ENHANCED: Scroll when agent messages update
  useEffect(() => {
    if (transcript.length > 0 || agentMessages.length > 0) {
      setTimeout(autoScrollToBottom, 150);
    }
  }, [transcript.length, agentMessages.length, autoScrollToBottom]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (yesButtonRef.current && noButtonRef.current) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          if (document.activeElement === yesButtonRef.current) {
            noButtonRef.current.focus();
          } else if (document.activeElement === noButtonRef.current) {
            yesButtonRef.current.focus();
          } else {
            yesButtonRef.current.focus();
          }
        }
        
        if (e.key === ' ' && (document.activeElement === yesButtonRef.current || document.activeElement === noButtonRef.current)) {
          e.preventDefault();
          document.activeElement.click();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentItem]);

  const initializeInterview = async () => {
    try {
      // Step 1: Load session with validation
      const loadedSession = await base44.entities.InterviewSession.get(sessionId);

      // PRODUCTION FIX: Handle null/undefined session
      if (!loadedSession) {
        throw new Error(`Session not found: ${sessionId}. It may have been deleted or never created.`);
      }

      if (!loadedSession.id) {
        throw new Error('Invalid session object returned from database');
      }
      
      // Check if session was paused
      if (loadedSession.status === 'paused') {
        setWasPaused(true);
        await base44.entities.InterviewSession.update(sessionId, {
          status: 'in_progress'
        });
        loadedSession.status = 'in_progress';
      }

      setSession(loadedSession);

      // Step 1.5: Load department info
      try {
        const departments = await base44.entities.Department.filter({ 
          department_code: loadedSession.department_code 
        });
        if (departments.length > 0) {
          setDepartment(departments[0]);
        }
      } catch (err) {
        // Silently continue without department info
      }

      // Step 2: Bootstrap engine
      const engineData = await bootstrapEngine(base44);
      setEngine(engineData);
      
      // Step 5: Restore state from snapshots or rebuild from responses
      const hasValidSnapshots = loadedSession.transcript_snapshot && 
                                 loadedSession.transcript_snapshot.length > 0;

      // FIXED: Check if snapshots are missing/inconsistent for in_progress sessions
      const needsRebuild = loadedSession.status === 'in_progress' && 
                           (!loadedSession.current_item_snapshot || !hasValidSnapshots);

      if (needsRebuild) {
        await rebuildSessionFromResponses(engineData, loadedSession);
      } else if (hasValidSnapshots) {
        const restoreSuccessful = restoreFromSnapshots(engineData, loadedSession);

        // SAFETY: If restore detected invalid state, rebuild instead
        if (!restoreSuccessful) {
          await rebuildSessionFromResponses(engineData, loadedSession);
        }
      } else {
        const firstQuestionId = engineData.ActiveOrdered[0];
        setQueue([]);
        setCurrentItem({ id: firstQuestionId, type: 'question' });
      }

      // Detect new vs resume interview
      const hasAnyResponses = loadedSession.transcript_snapshot && loadedSession.transcript_snapshot.length > 0;

      if (!hasAnyResponses) {
        setShowStartMessage(true);
        setShowResumeMessage(false);
      } else {
        setShowStartMessage(false);
        setShowResumeMessage(true);
      }

      setIsLoading(false);

    } catch (err) {
      const errorMessage = err?.message || err?.toString() || 'Unknown error occurred';
      setError(`Failed to load interview: ${errorMessage}`);
      setIsLoading(false);
    }
    };

  // ============================================================================
  // RESTORE FUNCTIONS
  // ============================================================================

  const restoreFromSnapshots = (engineData, loadedSession) => {
    const restoredTranscript = loadedSession.transcript_snapshot || [];
    const restoredQueue = loadedSession.queue_snapshot || [];
    const restoredCurrentItem = loadedSession.current_item_snapshot || null;
    
    // VALIDATION: Check if restored state is valid
    const hasTranscript = restoredTranscript.length > 0;
    const isCompleted = loadedSession.status === 'completed';
    const hasValidCurrentItem = restoredCurrentItem && 
                                 typeof restoredCurrentItem === 'object' && 
                                 !Array.isArray(restoredCurrentItem) &&
                                 restoredCurrentItem.type;
    const hasQueue = restoredQueue.length > 0;

    // If not completed but has transcript and invalid state, flag for rebuild
    if (!isCompleted && hasTranscript && !hasValidCurrentItem && !hasQueue) {
      return false; // Signal that restore failed
    }

    // Apply restored state
    setTranscript(restoredTranscript);
    setQueue(restoredQueue);
    setCurrentItem(restoredCurrentItem);

    if (!restoredCurrentItem && restoredQueue.length > 0) {
      const nextItem = restoredQueue[0];
      setCurrentItem(nextItem);
      setQueue(restoredQueue.slice(1));
    }

    // FIXED: Only show completion if status is actually 'completed'
    if (!restoredCurrentItem && restoredQueue.length === 0 && restoredTranscript.length > 0) {
      if (loadedSession.status === 'completed') {
        setShowCompletionModal(true);
      } else {
        return false; // Signal that restore failed
      }
    }

    setTimeout(() => autoScrollToBottom(), 100);
    return true; // Restore successful
    };

  // ENHANCED: Rebuild session queue from Response entities
  const rebuildSessionFromResponses = async (engineData, loadedSession) => {
    try {
      const responses = await base44.entities.Response.filter({ 
        session_id: sessionId 
      });
      
      const sortedResponses = responses.sort((a, b) => 
        new Date(a.response_timestamp) - new Date(b.response_timestamp)
      );
      
      // Build transcript from responses
      const restoredTranscript = [];
      
      for (const response of sortedResponses) {
        // CRITICAL FIX: response.question_id is the database ID now, not the code
        const question = engineData.QById[response.question_id];
        if (question) {
          // FIX: Get section name from Section entity, not legacy category field
          const sectionEntity = engineData.Sections.find(s => s.id === question.section_id);
          const sectionName = sectionEntity?.section_name || question.category || '';
          
          restoredTranscript.push({
            id: `q-${response.id}`,
            questionId: response.question_id, // This is database ID
            questionText: question.question_text,
            answer: response.answer,
            category: sectionName, // Use Section name, not legacy category
            type: 'question',
            timestamp: response.response_timestamp
          });
        }
      }
      
      setTranscript(restoredTranscript);
      displayOrderRef.current = restoredTranscript.length;

      // Find next unanswered question
      let nextQuestionId = null;
      
      if (sortedResponses.length > 0) {
        // Get last answered question and compute what should come next
        const lastResponse = sortedResponses[sortedResponses.length - 1];
        const lastQuestionId = lastResponse.question_id;
        const lastAnswer = lastResponse.answer;
        
        // Use engine logic to determine next question
        nextQuestionId = computeNextQuestionId(engineData, lastQuestionId, lastAnswer);
      } else {
        // No responses yet - start from first question
        nextQuestionId = engineData.ActiveOrdered[0];
      }
      
      // CRITICAL FIX: If nextQuestionId is null OR question doesn't exist, mark complete
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

        // Persist rebuilt state to database
        await base44.entities.InterviewSession.update(sessionId, {
          transcript_snapshot: restoredTranscript,
          queue_snapshot: [],
          current_item_snapshot: nextItem,
          total_questions_answered: restoredTranscript.filter(t => t.type === 'question').length,
          completion_percentage: Math.round((restoredTranscript.filter(t => t.type === 'question').length / engineData.TotalQuestions) * 100),
          status: 'in_progress' // Ensure status is in_progress
        });
      }
      
    } catch (err) {
      throw err;
    }
    };

    // DEPRECATED: Old restoreFromResponses - replaced by rebuildSessionFromResponses
    // Keeping for reference but not used anymore
    const restoreFromResponses = async (engineData, responses) => {
    
    const sortedResponses = responses.sort((a, b) => 
      new Date(a.response_timestamp) - new Date(b.response_timestamp)
    );
    
    const restoredTranscript = [];
    let lastQuestionId = null;
    let lastAnswer = null;
    
    for (const response of sortedResponses) {
      const question = engineData.QById[response.question_id];
      if (question) {
        // FIX: Get section name from Section entity, not legacy category field
        const sectionEntity = engineData.Sections.find(s => s.id === question.section_id);
        const sectionName = sectionEntity?.section_name || question.category || '';
        
        restoredTranscript.push({
          id: `q-${response.id}`,
          questionId: response.question_id,
          questionText: question.question_text,
          answer: response.answer,
          category: sectionName, // Use Section name, not legacy category
          type: 'question',
          timestamp: response.response_timestamp
        });
        lastQuestionId = response.question_id;
        lastAnswer = response.answer;
      }
    }
    
    setTranscript(restoredTranscript);
    
    if (lastQuestionId && lastAnswer) {
      const nextQuestionId = computeNextQuestionId(engineData, lastQuestionId, lastAnswer);
      if (nextQuestionId) {
        setQueue([]);
        setCurrentItem({ id: nextQuestionId, type: 'question' });
      } else {
        setCurrentItem(null);
        setShowCompletionModal(true);
      }
    } else if (restoredTranscript.length === 0) {
        const firstQuestionId = engineData.ActiveOrdered[0];
        setQueue([]);
        setCurrentItem({ id: firstQuestionId, type: 'question' });
    }
    
    console.log(`✅ Restored ${restoredTranscript.length} answered questions from Response entities`);
  };

  // ============================================================================
  // PERSIST STATE TO DATABASE (THROTTLED)
  // ============================================================================

  // PERF: Throttle/batch persistence - max once per 3 seconds OR 3 answers
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
      // Silently fail - will retry on next persist
    }
  }, [sessionId, engine]);

  const persistStateToDatabase = useCallback(async (newTranscript, newQueue, newCurrentItem) => {
    // Always update the pending state
    pendingPersistRef.current = { newTranscript, newQueue, newCurrentItem };
    persistCountSinceLastWriteRef.current++;

    const now = Date.now();
    const timeSinceLastPersist = now - lastPersistTimeRef.current;

    // Flush immediately if: 3+ answers since last write OR 3+ seconds since last write
    if (persistCountSinceLastWriteRef.current >= PERSIST_BATCH_COUNT || 
        timeSinceLastPersist >= PERSIST_THROTTLE_MS) {
      await flushPersist();
    } else {
      // Schedule a delayed flush
      setTimeout(() => {
        if (pendingPersistRef.current) {
          flushPersist();
        }
      }, PERSIST_THROTTLE_MS - timeSinceLastPersist);
    }
  }, [flushPersist]);

  // Flush on unmount or completion
  useEffect(() => {
    return () => {
      if (pendingPersistRef.current) {
        flushPersist();
      }
    };
  }, [flushPersist]);

  // ============================================================================
  // NEW: AI AGENT HANDOFF AFTER FOLLOW-UP PACK COMPLETION
  // ============================================================================

  const advanceToNextBaseQuestion = useCallback(async (baseQuestionId) => {
    const currentQuestion = engine.QById[baseQuestionId];
    if (!currentQuestion) {
      setShowCompletionModal(true);
      return;
    }

    const currentSectionId = currentQuestion.section_id;
    const currentSectionIndex = engine.Sections.findIndex(s => s.id === currentSectionId);

    // Compute next question in linear flow
    const nextQuestionId = computeNextQuestionId(engine, baseQuestionId, 'Yes');
    
    if (nextQuestionId && engine.QById[nextQuestionId]) {
      const nextQuestion = engine.QById[nextQuestionId];
      const nextSectionId = nextQuestion.section_id;
      const nextSectionIndex = engine.Sections.findIndex(s => s.id === nextSectionId);

      const isSectionTransition = currentSectionId !== nextSectionId;

      if (isSectionTransition) {
        
        // Add section completion message to transcript
        const completionMessage = {
          id: `section-complete-${Date.now()}`,
          type: 'system_message',
          content: `You've completed the ${engine.Sections[currentSectionIndex]?.section_name} section. Moving to ${engine.Sections[nextSectionIndex]?.section_name}...`,
          timestamp: new Date().toISOString(),
          kind: 'section_completion',
          role: 'system'
        };
        
        const newTranscript = [...transcript, completionMessage];
        setTranscript(newTranscript);
        
        setQueue([]);
        setCurrentItem({ id: nextQuestionId, type: 'question' });
        await persistStateToDatabase(newTranscript, [], { id: nextQuestionId, type: 'question' });
        } else {
        setQueue([]);
        setCurrentItem({ id: nextQuestionId, type: 'question' });
        await persistStateToDatabase(transcript, [], { id: nextQuestionId, type: 'question' });
        }
        } else {
        // CRITICAL: Only mark complete if we're truly at the end
        const lastSectionIndex = engine.Sections.length - 1;
        const lastSection = engine.Sections[lastSectionIndex];
        const questionsInLastSection = Object.values(engine.QById).filter(
        q => q.section_id === lastSection.id && q.active !== false
        );
        const lastQuestionInLastSection = questionsInLastSection[questionsInLastSection.length - 1];

        if (currentSectionIndex === lastSectionIndex && baseQuestionId === lastQuestionInLastSection?.id) {
        
        // Add completion message to transcript
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
        } else {
        setShowCompletionModal(true);
        }
        }
        }, [engine, transcript]);

  const onFollowupPackComplete = useCallback(async (baseQuestionId, packId) => {
    const question = engine.QById[baseQuestionId];
    if (!question) {
      advanceToNextBaseQuestion(baseQuestionId);
      return;
    }
    
    // Check if multi-instance is enabled for this question
    if (question.followup_multi_instance) {
      const maxInstances = question.max_instances_per_question || 5;
      
      // Count existing instances for this question
      const existingFollowups = await base44.entities.FollowUpResponse.filter({
        session_id: sessionId,
        question_id: baseQuestionId,
        followup_pack: packId
      });
      
      const currentInstanceCount = existingFollowups.length;

      if (currentInstanceCount < maxInstances) {
        const multiInstancePrompt = question.multi_instance_prompt || 
          'Do you have another instance we should discuss for this question?';

        // Add multi-instance question to transcript using functional update
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

        // Use functional update to preserve any recent AI answers
        setTranscript(prev => {
          const newTranscript = [...prev, multiInstanceQuestionEntry];

          // Queue multi-instance question
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
    
    // No multi-instance or max reached - advance to next base question
    advanceToNextBaseQuestion(baseQuestionId);
  }, [engine, sessionId, transcript, advanceToNextBaseQuestion]);

  // NEW: Helper to call server-side AI function for live follow-ups
  const requestLiveAiFollowup = async (params) => {
    const { interviewId, questionId, followupPackId, transcriptWindow, candidateAnswer } = params;

    try {
      const response = await base44.functions.invoke("interviewAiFollowup", {
        interviewId,
        questionId,
        followupPackId,
        transcriptWindow,
        candidateAnswer,
        mode: "FOLLOWUP_PROBE"
      });

      return response.data;
    } catch (err) {
      return { status: 'error' };
    }
  };

  // Helper to build transcript window for AI context
  const buildTranscriptWindowForAi = (questionId, packId) => {
    const recentTranscript = [...transcript].slice(-10); // Last 10 exchanges
    
    const window = recentTranscript.map(entry => {
      if (entry.type === 'question') {
        return { role: 'assistant', content: entry.questionText };
      } else if (entry.type === 'followup') {
        return { role: 'user', content: entry.answer };
      }
      return null;
    }).filter(Boolean);
    
    return window;
  };

  // ============================================================================
  // NEW: TIMEOUT HELPERS - Separate typing and AI response timeouts
  // ============================================================================

  const startTypingTimeout = useCallback(() => {
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      // Add system message reminder (non-blocking)
      const reminderEntry = {
        id: `sys-reminder-${Date.now()}`,
        type: 'system_message',
        content: "Take your time—when you're ready, type your answer and press Send to continue.",
        timestamp: new Date().toISOString(),
        kind: 'system_message',
        role: 'system',
        text: "Take your time—when you're ready, type your answer and press Send to continue."
      };
      setTranscript(prev => [...prev, reminderEntry]);
    }, TYPING_TIMEOUT_MS);
  }, []);

  const clearTypingTimeout = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  }, []);

  const startAiResponseTimeout = useCallback(() => {
    clearTimeout(aiResponseTimeoutRef.current);
    aiResponseTimeoutRef.current = setTimeout(() => {
      handleAiResponseTimeout();
    }, AI_RESPONSE_TIMEOUT_MS);
  }, []);

  const clearAiResponseTimeout = useCallback(() => {
    if (aiResponseTimeoutRef.current) {
      clearTimeout(aiResponseTimeoutRef.current);
      aiResponseTimeoutRef.current = null;
    }
  }, []);

  // NEW: End AI mini-session cleanly
  const endAiProbingSession = useCallback(() => {
    setAiSessionId(null);
    setAiProbingPackInstanceKey(null);
    clearTypingTimeout();
    clearAiResponseTimeout();
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
  }, [clearTypingTimeout, clearAiResponseTimeout]);

  // NEW: Graceful fallback handler
  const handleAiResponseTimeout = useCallback(() => {
    // 1) Add system message to chat
    const systemEntry = {
      id: `sys-timeout-${Date.now()}`,
      type: 'system_message',
      content: "Our AI assistant is taking too long to respond, so we'll continue with the standard questions.",
      timestamp: new Date().toISOString(),
      kind: 'system_message',
      role: 'system',
      text: "Our AI assistant is taking too long to respond, so we'll continue with the standard questions."
    };
    setTranscript(prev => [...prev, systemEntry]);

    // 2) Disable AI for rest of session
    setAiProbingDisabledForSession(true);

    // 3) Save any probing we got before timeout
    if (currentFollowUpPack) {
      saveProbingToDatabase(
        currentFollowUpPack.questionId,
        currentFollowUpPack.packId,
        agentMessages
      );
    }

    // 4) End AI session cleanly
    endAiProbingSession();
    setIsWaitingForAgent(false);
    setProbingTurnCount(0);

    // 5) Handoff to deterministic engine
    const baseQuestionId = currentFollowUpPack?.questionId;
    setCurrentFollowUpPack(null);

    if (baseQuestionId) {
      advanceToNextBaseQuestion(baseQuestionId);
    }
  }, [currentFollowUpPack, agentMessages, endAiProbingSession, advanceToNextBaseQuestion, transcript]);

  // NEW: Start per-pack AI mini-session
  const startAiProbingForPackInstance = async (questionId, packId, substanceName, followUpAnswers, instanceNumber = 1) => {
    // Check if AI is disabled for this session
    if (aiProbingDisabledForSession) {
      return false;
    }
    
    const packInstanceKey = `${packId}#${instanceNumber}`;
    setAiProbingPackInstanceKey(packInstanceKey);

    // ============================================================================
    // PROBE ENGINE V2 - Packs configured for per-field probing skip pack-level AI
    // ============================================================================
    if (useProbeEngineV2(packId)) {
      // Per-field probing packs handle AI validation after each deterministic answer
      // Skip pack-level probing entirely for these packs
      console.log(`[V2-PER-FIELD] Skipping pack-level probing for ${packId} (per-field mode active)`);
      
      // Advance directly to next base question or multi-instance check
      onFollowupPackComplete(questionId, packId);
      return true; // Per-field mode handled this pack - skip all other probing
    }

    // NEW: Check feature flag and attempt invokeLLM-based AI (lightweight alternative)
    if (ENABLE_LIVE_AI_FOLLOWUPS) {
      // Check if we've reached the AI follow-up limit for this pack instance
      const countKey = `${packId}:${instanceNumber}`;
      const currentCount = aiFollowupCounts[countKey] || 0;
      
      // Get max AI followups from centralized config - SINGLE SOURCE OF TRUTH
      const maxAiFollowups = getPackMaxAiFollowups(packId);
      
      console.log('[LIVE_AI_FOLLOWUP] Count', currentCount, '/', maxAiFollowups, 'for pack', packId);
      
      if (currentCount >= maxAiFollowups) {
        console.log('[LIVE_AI_FOLLOWUP] Max AI follow-ups reached for pack', packId, '– not asking another probe');
        return false;
      }
      
      console.log('LIVE_AI_FOLLOWUP start', { 
        interviewId: sessionId, 
        questionId, 
        followupPackId: packId,
        currentCount,
        maxAiFollowups
      });
      
      const lastFollowUpAnswer = followUpAnswers[followUpAnswers.length - 1];
      const transcriptWindow = buildTranscriptWindowForAi(questionId, packId);
      
      const aiResult = await requestLiveAiFollowup({
        interviewId: sessionId,
        questionId,
        followupPackId: packId,
        transcriptWindow,
        candidateAnswer: lastFollowUpAnswer?.answer || ''
      });
      
      if (aiResult?.status === 'ok' && aiResult.followupQuestion) {
        
        // Increment counter for this pack instance
        setAiFollowupCounts(prev => ({
          ...prev,
          [countKey]: currentCount + 1
        }));
        
        // Add AI question to transcript with stable unique ID
        const aiQuestionEntry = {
          id: `ai-q-${questionId}-${packId}-${instanceNumber}-1-${Date.now()}`,
          type: 'ai_question',
          content: aiResult.followupQuestion,
          questionId: questionId,
          packId: packId,
          timestamp: new Date().toISOString(),
          kind: 'ai_probe_question',
          role: 'investigator',
          text: aiResult.followupQuestion,
          followupPackId: packId,
          instanceNumber: instanceNumber,
          probingSequence: 1
        };

        const newTranscript = [...transcript, aiQuestionEntry];
        setTranscript(newTranscript);
        
        // Initialize probing exchanges array for this instance
        setInvokeLLMProbingExchanges([{
          sequence_number: 1,
          probing_question: aiResult.followupQuestion,
          candidate_response: null, // Will be filled when candidate answers
          timestamp: new Date().toISOString()
        }]);
        
        await persistStateToDatabase(newTranscript, [], null);
        
        // Set invokeLLM mode and waiting state
        setIsInvokeLLMMode(true);
        setIsWaitingForAgent(true);
        setCurrentFollowUpPack({ questionId, packId, substanceName, instanceNumber });
        return true;
      } else {
        // Fall through to agent-based probing or skip
      }
      }
    
    // Create a fresh AI conversation JUST for this pack instance
    try {
      const aiConfig = getAiAgentConfig(session.department_code);
      console.log('🔧 [AI MINI-SESSION] Creating conversation for', packInstanceKey);

      const newConversation = await base44.agents.createConversation({
        agent_name: aiConfig.agentName,
        metadata: {
          session_id: sessionId,
          department_code: session.department_code,
          file_number: session.file_number,
          pack_id: packId,
          instance_number: instanceNumber,
          ai_config: aiConfig
        }
      });

      if (!newConversation || !newConversation.id) {
        console.error('❌ Failed to create AI mini-session');
        handleAiResponseTimeout();
        return false;
      }

      setAiSessionId(newConversation.id);
      console.log('✅ AI mini-session created:', newConversation.id);
    
    // Build summary message for the agent (context for THIS pack only)
    const question = engine.QById[questionId];
    const packSteps = injectSubstanceIntoPackSteps(engine, packId, substanceName);

    let summaryLines = [
      `Follow-up pack completed for instance ${instanceNumber}.`,
      ``,
      `Question ID: ${questionId}`,
      `Question: ${question.question_text}`,
      `Base Answer: Yes`,
      `Follow-up Pack: ${packId}`,
      ``,
      `Deterministic Follow-Up Answers:`
    ];

    // Add each follow-up answer
    followUpAnswers.forEach((answer, idx) => {
      const step = packSteps.find(s => s.Prompt === answer.questionText);
      if (step) {
        summaryLines.push(`- ${step.Prompt}: ${answer.answer}`);
      } else {
        summaryLines.push(`- ${answer.questionText}: ${answer.answer}`);
      }
    });

    // Get max AI followups from centralized config - SINGLE SOURCE OF TRUTH
    const maxFollowupsForAgent = getPackMaxAiFollowups(packId);

    summaryLines.push(``);
    summaryLines.push(`INSTRUCTIONS FOR AI INVESTIGATOR:`);
    summaryLines.push(`1. Your goal is to fully understand and clarify the story in about 3 probing questions.`);
    summaryLines.push(`2. You may ask up to ${maxFollowupsForAgent} probing questions if truly needed, but stop sooner if the story is clear.`);
    summaryLines.push(`3. Always conclude by asking: "Before we move on, is there anything else investigators should know about this situation?"`);
    summaryLines.push(`4. After the candidate answers that closing question, respond with a brief acknowledgment and include the literal marker [[HANDOFF_TO_ENGINE]] in your message.`);
    summaryLines.push(``);
    summaryLines.push(`CRITICAL: Do NOT send the next base question yourself. The system will automatically present the next question after you send [[HANDOFF_TO_ENGINE]].`);

    const summaryMessage = summaryLines.join('\n');

    console.log('📤 [AI MINI-SESSION] Sending context to agent');

    await base44.agents.addMessage(newConversation, {
      role: 'user',
      content: summaryMessage
    });

    // Subscribe to this specific conversation
    const unsubscribe = base44.agents.subscribeToConversation(
      newConversation.id,
      (data) => {
        console.log('📨 [AI MINI-SESSION] Message update');
        setAgentMessages(data.messages || []);
      }
    );

    // Store unsubscribe for cleanup
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }
    unsubscribeRef.current = unsubscribe;

    setIsWaitingForAgent(true);
    setCurrentFollowUpPack({ questionId, packId, substanceName, instanceNumber });
    setProbingTurnCount(0);
    setHandoffProcessed(false);

    // Start typing timeout (candidate has 4 min to start typing)
    startTypingTimeout();

    return true;
    } catch (err) {
    console.error('❌ [AI MINI-SESSION] Error creating conversation:', err);
    handleAiResponseTimeout();
    return false;
    }
    };

  // ============================================================================
  // NEW: SAVE PROBING EXCHANGES TO DATABASE
  // ============================================================================

  // NEW: Save invokeLLM-based probing exchanges directly
  const saveInvokeLLMProbingToDatabase = async (questionId, packId, exchanges, instanceNumber = 1) => {
    try {
      console.log(`💾 Saving ${exchanges.length} invokeLLM probing exchanges for ${questionId}/${packId} (instance ${instanceNumber})`);
      
      const responses = await base44.entities.Response.filter({
        session_id: sessionId,
        question_id: questionId,
        followup_pack: packId,
        triggered_followup: true
      });
      
      if (responses.length === 0) {
        console.error(`❌ No triggering response found for pack ${packId}`);
        return;
      }
      
      const triggeringResponse = responses[responses.length - 1];
      
      const followUpResponses = await base44.entities.FollowUpResponse.filter({
        session_id: sessionId,
        response_id: triggeringResponse.id,
        followup_pack: packId,
        instance_number: instanceNumber
      });
      
      if (followUpResponses.length > 0) {
        const followUpResponse = followUpResponses[0];
        
        console.log("[MI AI-SAVE BEFORE]", {
          instanceNumber,
          existingDetails: followUpResponse.additional_details || {},
          probingExchangesCount: exchanges.length
        });
        
        const updatedDetails = {
          ...(followUpResponse.additional_details || {}),
          investigator_probing: exchanges
        };
        
        await base44.entities.FollowUpResponse.update(followUpResponse.id, {
          additional_details: updatedDetails
        });
        
        console.log("[MI AI-SAVE AFTER]", {
          instanceNumber,
          updatedDetails: updatedDetails
        });
        
        console.log(`✅ Saved ${exchanges.length} invokeLLM probing exchanges to instance ${instanceNumber}`);
      }
    } catch (err) {
      console.error('❌ Error saving invokeLLM probing:', err);
    }
  };

  const extractProbingFromAgentMessages = (messages, questionId, packId) => {
    const probingEntries = [];
    
    // Find the handoff summary message (start)
    let startIndex = -1;
    let endIndex = -1;
    
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      
      if (msg.role === 'user' &&
          typeof msg.content === 'string' &&
          msg.content.includes('Follow-up pack completed') &&
          msg.content.includes(`Question ID: ${questionId}`) &&
          msg.content.includes(`Follow-up Pack: ${packId}`)) {
        startIndex = i + 1;
      }
      
      // Find handoff marker (end)
      if (startIndex !== -1 && msg.role === 'assistant' && msg.content?.includes('[[HANDOFF_TO_ENGINE]]')) {
        endIndex = i;
        break;
      }
    }
    
    if (startIndex === -1) return probingEntries;
    
    // Only process messages between start and handoff marker
    const probingMessages = endIndex !== -1
      ? messages.slice(startIndex, endIndex + 1)
      : messages.slice(startIndex);
    
    for (let i = 0; i < probingMessages.length; i++) {
      const msg = probingMessages[i];
      
      // Skip handoff marker message itself and base questions
      if (msg.content?.includes('[[HANDOFF_TO_ENGINE]]')) continue;
      if (msg.content?.match(/\b(Q\d{1,3})\b/i)) continue;
      if (msg.content?.includes('Follow-up pack completed')) continue;
      
      if (msg.role === 'assistant') {
        probingEntries.push({
          id: `ai-q-${Date.now()}-${i}`,
          type: 'ai_question',
          content: msg.content,
          questionId: questionId,
          packId: packId,
          timestamp: new Date().toISOString()
        });
      } else if (msg.role === 'user') {
        probingEntries.push({
          id: `ai-a-${Date.now()}-${i}`,
          type: 'ai_answer',
          content: msg.content,
          questionId: questionId,
          packId: packId,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    return probingEntries;
  };

  const saveProbingToDatabase = async (questionId, packId, messages) => {
    try {
      const instanceNumber = currentFollowUpPack?.instanceNumber || 1;
      console.log(`💾 Saving AI probing exchanges for ${questionId}/${packId} (instance ${instanceNumber}) to database...`);
      
      // Extract Q&A pairs from agent conversation
      const exchanges = [];
      
      // Find the handoff summary message (start) and handoff marker (end)
      let startIndex = -1;
      let endIndex = -1;
      
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        
        if (msg.role === 'user' &&
            typeof msg.content === 'string' &&
            msg.content.includes('Follow-up pack completed') &&
            msg.content.includes(`Question ID: ${questionId}`) &&
            msg.content.includes(`Follow-up Pack: ${packId}`)) {
          startIndex = i + 1;
        }
        
        // Look for handoff marker first, then Q### pattern
        if (startIndex !== -1 && msg.role === 'assistant' && typeof msg.content === 'string') {
          if (msg.content.includes('[[HANDOFF_TO_ENGINE]]')) {
            endIndex = i;
            break;
          }
          if (msg.content.match(/\bQ\d{1,3}\b/i)) {
            endIndex = i;
            break;
          }
        }
      }
      
      if (startIndex !== -1) {
        const probingMessages = endIndex !== -1
          ? messages.slice(startIndex, endIndex)
          : messages.slice(startIndex);
        
        let sequenceNumber = 1;
        
        for (let i = 0; i < probingMessages.length; i++) {
          const currentMsg = probingMessages[i];
          const nextMsg = probingMessages[i + 1];
          
          if (currentMsg.role === 'assistant' &&
              typeof currentMsg.content === 'string' &&
              !currentMsg.content.includes('Follow-up pack completed') &&
              !currentMsg.content.match(/\bQ\d{1,3}\b/i) &&
              !currentMsg.content.includes('[[HANDOFF_TO_ENGINE]]') &&
              nextMsg?.role === 'user' &&
              typeof nextMsg.content === 'string' &&
              !nextMsg.content.includes('Follow-up pack completed')) {
            
            const cleanQuestion = currentMsg.content
              .replace(/\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}]/g, '')
              .trim();
            
            if (cleanQuestion && nextMsg.content && cleanQuestion.length > 5) {
              exchanges.push({
                sequence_number: sequenceNumber++,
                probing_question: cleanQuestion,
                candidate_response: nextMsg.content,
                timestamp: new Date().toISOString()
              });
            }
            
            i++;
          }
        }
      }
      
      console.log(`📊 Extracted ${exchanges.length} probing exchanges to save for instance ${instanceNumber}`);
      
      if (exchanges.length > 0) {
        // Find the Response record for this question
        const responses = await base44.entities.Response.filter({
          session_id: sessionId,
          question_id: questionId,
          followup_pack: packId
        });
        
        if (responses.length > 0) {
          const responseRecord = responses[0];
          
          // Find the FollowUpResponse for this specific instance
          const followUpResponses = await base44.entities.FollowUpResponse.filter({
            session_id: sessionId,
            response_id: responseRecord.id,
            followup_pack: packId,
            instance_number: instanceNumber
          });
          
          if (followUpResponses.length > 0) {
            const followUpResponse = followUpResponses[0];
            
            console.log("[MI AI-SAVE BEFORE]", {
              instanceNumber,
              existingDetails: followUpResponse.additional_details || {},
              probingExchangesCount: exchanges.length
            });
            
            const updatedDetails = {
              ...(followUpResponse.additional_details || {}),
              investigator_probing: exchanges
            };
            
            // Save probing to this instance's additional_details
            await base44.entities.FollowUpResponse.update(followUpResponse.id, {
              additional_details: updatedDetails
            });
            
            console.log("[MI AI-SAVE AFTER]", {
              instanceNumber,
              updatedDetails: updatedDetails
            });
            
            console.log(`✅ Saved ${exchanges.length} probing exchanges to FollowUpResponse instance ${instanceNumber} (${followUpResponse.id})`);
          } else {
            console.error(`❌ No FollowUpResponse found for instance ${instanceNumber}`);
          }
        } else {
          console.error(`❌ No Response record found for ${questionId}/${packId}`);
        }
      }
      
    } catch (err) {
      console.error('❌ Error saving probing to database:', err);
    }
  };

  // ============================================================================
  // NEW: DETECT HANDOFF MARKER + SAVE PROBING TO DATABASE
  // ============================================================================

  useEffect(() => {
    if (!isWaitingForAgent || agentMessages.length === 0 || !engine || !currentFollowUpPack || handoffProcessed) return;
    
    // Find ANY message with handoff marker (not just last)
    const handoffMessage = agentMessages.find(m => 
      m.role === 'assistant' && 
      m.content?.includes('[[HANDOFF_TO_ENGINE]]')
    );
    
    if (handoffMessage) {
      console.log(`🎯 AI probing complete (handoff marker detected) for base question ${currentFollowUpPack.questionId} — delegating to follow-up completion handler`);
      
      // Set flag to prevent re-processing
      setHandoffProcessed(true);
      
      // NEW: Add AI probing messages to transcript (only up to handoff marker)
      const probingEntries = extractProbingFromAgentMessages(agentMessages, currentFollowUpPack.questionId, currentFollowUpPack.packId);
      const newTranscript = [...transcript, ...probingEntries];
      setTranscript(newTranscript);
      
      // Save probing to database (async but don't await)
      saveProbingToDatabase(currentFollowUpPack.questionId, currentFollowUpPack.packId, agentMessages);
      
      // Persist transcript with AI probing entries
      persistStateToDatabase(newTranscript, [], null);
      
      const baseQuestionId = currentFollowUpPack.questionId;
      const packId = currentFollowUpPack.packId;
      
      // End AI session cleanly
      endAiProbingSession();
      setIsWaitingForAgent(false);
      setProbingTurnCount(0);
      setCurrentFollowUpPack(null);

      // NEW: Delegate to follow-up completion handler (checks multi-instance)
      onFollowupPackComplete(baseQuestionId, packId);
      return;
    }
    
    const lastAgentMessage = [...agentMessages].reverse().find(m => m.role === 'assistant');
    if (!lastAgentMessage?.content) return;
    
    // LEGACY FALLBACK: Check if agent sent a base question (Q###) - old behavior
    const questionMatch = lastAgentMessage.content.match(/\b(Q\d{1,3})\b/i);
    if (questionMatch) {
      const nextQuestionId = questionMatch[1].toUpperCase();
      
      if (!engine.QById[nextQuestionId]) {
        console.error(`❌ Agent sent invalid question ID: ${nextQuestionId} - marking interview complete`);
        endAiProbingSession();
        setIsWaitingForAgent(false);
        setCurrentFollowUpPack(null);
        setCurrentItem(null);
        setQueue([]);
        setShowCompletionModal(true);
        return;
      }

      console.log(`✅ Agent sent next base question (legacy): ${nextQuestionId}`);

      saveProbingToDatabase(currentFollowUpPack.questionId, currentFollowUpPack.packId, agentMessages);

      // End AI session cleanly
      endAiProbingSession();
      setIsWaitingForAgent(false);
      setCurrentFollowUpPack(null);
      setProbingTurnCount(0);

      setCurrentItem({ id: nextQuestionId, type: 'question' });
      setQueue([]);

      persistStateToDatabase(transcript, [], { id: nextQuestionId, type: 'question' });
    }
  }, [agentMessages, isWaitingForAgent, transcript, engine, currentFollowUpPack, advanceToNextBaseQuestion, endAiProbingSession, onFollowupPackComplete]);

  // ============================================================================
  // ANSWER SUBMISSION - HYBRID LOGIC WITH CONDITIONAL FOLLOW-UPS
  // ============================================================================

  const handleAnswer = useCallback(async (value) => {
    if (isCommitting || !currentItem || !engine) {
      console.warn('⚠️ Already committing or no current item');
      return;
    }

    setIsCommitting(true);
    setValidationHint(null);
    
    // Clear section completion message when answering any question
    if (sectionCompletionMessage) {
      setSectionCompletionMessage(null);
    }

    try {
      console.log(`📝 Processing answer for ${currentItem.type}:`, value);

      if (currentItem.type === 'question') {
        // PRIMARY QUESTION
        const question = engine.QById[currentItem.id];
        if (!question) {
          throw new Error(`Question ${currentItem.id} not found`);
        }

        // FIX: Get section name from Section entity, not legacy category field
        const sectionEntity = engine.Sections.find(s => s.id === question.section_id);
        const sectionName = sectionEntity?.section_name || question.category || '';
        
        // Create question event using centralized helper
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

        // Create answer event using centralized helper
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

        // Combine question and answer into single entry for render (legacy compatibility)
        const combinedEntry = {
          ...questionEvent,
          answer: value,
          text: value
        };

        const newTranscript = [...transcript, combinedEntry];
        setTranscript(newTranscript);
        
        // Detect section transition BEFORE advancing to next question
        const detectAndSetSectionTransition = (currentQuestionId, answerValue) => {
          // Compute what the next question will be
          let nextQuestionId = null;
          
          if (answerValue === 'Yes') {
            // Check if follow-up will be triggered
            const followUpResult = checkFollowUpTrigger(engine, currentQuestionId, answerValue);
            if (followUpResult) {
              // Follow-up will be triggered, so section transition won't happen immediately
              return;
            }
          }
          
          // Get next base question
          nextQuestionId = computeNextQuestionId(engine, currentQuestionId, answerValue);
          
          if (nextQuestionId && engine.QById[nextQuestionId]) {
            const nextQuestion = engine.QById[nextQuestionId];
            const currentSectionId = question.section_id;
            const nextSectionId = nextQuestion.section_id;
            
            const isSectionTransition = currentSectionId && nextSectionId && currentSectionId !== nextSectionId;
            
            if (isSectionTransition) {
              const nextSectionEntity = engine.Sections.find(s => s.id === nextSectionId);
              const nextSectionName = nextSectionEntity?.section_name || 'the next section';

              console.log('[SECTION-TRANSITION] Setting transition info for acknowledgment', {
                from: sectionName,
                to: nextSectionName,
                nextQuestionId
              });

              // Store transition info to show as acknowledgment screen
              setSectionTransitionInfo({
                fromSection: sectionName,
                toSection: nextSectionName,
                nextQuestionId: nextQuestionId
              });

              // Don't advance yet - wait for user to click Next
              return;
            }
          }
        };
        
        detectAndSetSectionTransition(currentItem.id, value);
        
        // CRITICAL FIX: Handle "Yes" and "No" answers distinctly for follow-up triggering
        if (value === 'Yes') {
          const followUpResult = checkFollowUpTrigger(engine, currentItem.id, value);
          
          if (followUpResult) {
            const { packId, substanceName } = followUpResult;
            
            // IDEMPOTENCY: Check if this pack was already triggered for this base question
            const triggerKey = `${currentItem.id}:${packId}`;
            if (triggeredPacksRef.current.has(triggerKey)) {
              console.log(`⏭️ Skipping duplicate pack trigger for ${packId} on base question ${currentItem.id}`);
              // Still advance to next question since the pack is already being handled
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
            
            // Mark this pack as triggered
            triggeredPacksRef.current.add(triggerKey);
            console.log(`🔔 Follow-up triggered: ${packId}`, substanceName ? `with substance: ${substanceName}` : '');
            
            const packSteps = injectSubstanceIntoPackSteps(engine, packId, substanceName);
            
            if (packSteps && packSteps.length > 0) {
              // Reset follow-up answers tracker for new pack
              setCurrentFollowUpAnswers({});
              
              // Queue all follow-up steps (include baseQuestionId for AI handoff later)
              const followupQueue = [];
              for (let i = 0; i < packSteps.length; i++) {
                followupQueue.push({
                  id: `${packId}:${i}`,
                  type: 'followup',
                  packId: packId,
                  stepIndex: i,
                  substanceName: substanceName,
                  totalSteps: packSteps.length,
                  baseQuestionId: currentItem.id // Store for AI handoff
                });
              }
              
              // Set current to first item, queue to rest
              const firstItem = followupQueue[0];
              const remainingQueue = followupQueue.slice(1);
              
              setQueue(remainingQueue);
              setCurrentItem(firstItem);
              
              await persistStateToDatabase(newTranscript, remainingQueue, firstItem);
            } else {
              // Empty or invalid pack - advance to next question
              console.warn(`⚠️ Follow-up pack ${packId} has no steps or is invalid - advancing to next question`);
              const nextQuestionId = computeNextQuestionId(engine, currentItem.id, value);
              if (nextQuestionId && engine.QById[nextQuestionId]) {
                setQueue([]);
                setCurrentItem({ id: nextQuestionId, type: 'question' });
                await persistStateToDatabase(newTranscript, [], { id: nextQuestionId, type: 'question' });
              } else {
                // No next question - interview complete
                console.log('✅ No next question after empty/invalid follow-up pack - marking interview complete');
                setCurrentItem(null);
                setQueue([]);
                await persistStateToDatabase(newTranscript, [], null);
                setShowCompletionModal(true);
              }
            }
          } else {
            // No follow-up triggered - advance to next question
            const nextQuestionId = computeNextQuestionId(engine, currentItem.id, value);
            if (nextQuestionId && engine.QById[nextQuestionId]) {
              setQueue([]);
              setCurrentItem({ id: nextQuestionId, type: 'question' });
              await persistStateToDatabase(newTranscript, [], { id: nextQuestionId, type: 'question' });
            } else {
              // No next question - interview complete
              console.log('✅ No next question after "Yes" answer with no follow-up - marking interview complete');
              setCurrentItem(null);
              setQueue([]);
              await persistStateToDatabase(newTranscript, [], null);
              setShowCompletionModal(true);
            }
          }
        } else {
          // CRITICAL FIX: "No" answer - ALWAYS advance to next question, NEVER trigger follow-ups
          console.log(`➡️ Answer is "No" - skipping any follow-ups and advancing to next question`);
          const nextQuestionId = computeNextQuestionId(engine, currentItem.id, value);
          
          console.log(`🔍 Computing next question after ${currentItem.id}:`);
          console.log(`   - Returned nextQuestionId: ${nextQuestionId}`);
          
          // RESTORED ORIGINAL LOGIC: If no next question, interview is complete
          if (nextQuestionId && engine.QById[nextQuestionId]) {
            console.log(`✅ Advancing to next question: ${nextQuestionId}`);
            setQueue([]);
            setCurrentItem({ id: nextQuestionId, type: 'question' });
            await persistStateToDatabase(newTranscript, [], { id: nextQuestionId, type: 'question' });
          } else {
            // No next question - interview complete
            console.log(`✅ No next question found - marking interview complete`);
            setCurrentItem(null);
            setQueue([]);
            await persistStateToDatabase(newTranscript, [], null);
            setShowCompletionModal(true);
          }
        }
        
        // PERFORMANCE FIX: Parallelize database saves
        saveAnswerToDatabase(currentItem.id, value, question);

      } else if (currentItem.type === 'followup') {
        // FOLLOW-UP QUESTION
        const { packId, stepIndex, substanceName, totalSteps } = currentItem;
        
        const packSteps = injectSubstanceIntoPackSteps(engine, packId, substanceName);
        
        if (!packSteps || !packSteps[stepIndex]) {
          throw new Error(`Follow-up pack ${packId} step ${stepIndex} not found`);
        }
        const step = packSteps[stepIndex];

        // Auto-fill substance_name field if prefilled
        if (step.PrefilledAnswer && step.Field_Key === 'substance_name') {
          console.log(`💉 Auto-filling substance_name: ${step.PrefilledAnswer}`);
          
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

          // Update follow-up answers tracker
          const updatedFollowUpAnswers = {
            ...currentFollowUpAnswers,
            [step.Field_Key]: step.PrefilledAnswer
          };
          setCurrentFollowUpAnswers(updatedFollowUpAnswers);

          let updatedQueue = [...queue];
          let nextItem = updatedQueue.shift() || null;
          
          // NEW: Skip conditional follow-ups based on previous answers
          while (nextItem && nextItem.type === 'followup') {
            const nextPackSteps = injectSubstanceIntoPackSteps(engine, nextItem.packId, nextItem.substanceName);
            const nextStep = nextPackSteps[nextItem.stepIndex];
            
            if (shouldSkipFollowUpStep(nextStep, updatedFollowUpAnswers)) {
              console.log(`⏭️ Skipping conditional step: ${nextStep.Field_Key}`);
              // Skip this step and move to next
              nextItem = updatedQueue.shift() || null;
            } else {
              // This step should be asked
              break;
            }
          }
          
          setQueue(updatedQueue);
          setCurrentItem(nextItem);
          
          await persistStateToDatabase(newTranscript, updatedQueue, nextItem);
          
          console.log("[MI INSTANCES SNAPSHOT]", {
            packId,
            currentInstanceNumber: currentItem.instanceNumber || 1,
            fieldKey: step.Field_Key,
            answer: step.PrefilledAnswer,
            note: "prefilled_answer"
          });
          
          await saveFollowUpAnswer(packId, step.Field_Key, step.PrefilledAnswer, substanceName, currentItem.instanceNumber || 1);
          
          setIsCommitting(false);
          setInput("");
          
          if (!nextItem) {
            setShowCompletionModal(true);
          }
          
          return;
        }

        // Validate answer using standard validation
        const validation = validateFollowUpAnswer(value, step.Expected_Type || 'TEXT', step.Options);
        
        if (!validation.valid) {
          console.log(`❌ Validation failed: ${validation.hint}`);
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
        const instanceNumber = currentItem.instanceNumber || 1;
        const fieldKey = step.Field_Key;

        // ============================================================================
        // V2 PER-FIELD PROBING FOR PACK_LE_APPS
        // ============================================================================
        if (useProbeEngineV2(packId)) {
          const probeKey = getFieldProbeKey(packId, instanceNumber, fieldKey);
          
          // Check if we're already probing this field (StrictMode guard)
          if (v2ProbingInProgressRef.current.has(probeKey)) {
            console.log(`[V2-PER-FIELD] Already probing ${probeKey}, skipping duplicate`);
            setIsCommitting(false);
            return;
          }

          // Build incident context from all answers so far
          const incidentContext = { ...currentFollowUpAnswers, [fieldKey]: normalizedAnswer };
          
          console.log(`📝 Processing answer for followup:`, normalizedAnswer);
          
          // ============================================================================
          // SEMANTIC VALIDATION - Check if answer is valid, unknown, or invalid
          // ============================================================================
          const semanticResult = validateFollowupValue({
            packId,
            fieldKey,
            rawValue: normalizedAnswer
          });
          
          console.log(`[V2-SEMANTIC] Validation result for ${fieldKey}:`, semanticResult);
          
          // Get max AI followups from centralized config - SINGLE SOURCE OF TRUTH
          const maxAiFollowups = getPackMaxAiFollowups(packId);
          
          // Get probe count from aiFollowupCounts using per-field key
          const fieldCountKey = `${packId}:${fieldKey}:${instanceNumber}`;
          const probeCount = aiFollowupCounts[fieldCountKey] || 0;
          
          console.log(`[V2-SEMANTIC] Probe count for ${fieldKey}: ${probeCount}/${maxAiFollowups}`);
          
          logAiProbeDebug('semanticResult', {
            packId,
            fieldKey,
            instanceNumber,
            status: semanticResult.status,
            normalizedAnswer,
            probeCount,
            maxAiFollowups
          });
          
          // If semantic validation passed as "valid", save fact immediately and continue
          if (semanticResult.status === "valid") {
            console.log(`[V2-SEMANTIC] Valid answer - saving fact and continuing`);
            await saveFollowUpAnswer(packId, fieldKey, semanticResult.normalizedValue, substanceName, instanceNumber, "user");
            
            // Mark field as completed
            setCompletedFields(prev => ({
              ...prev,
              [`${packId}_${instanceNumber}`]: {
                ...(prev[`${packId}_${instanceNumber}`] || {}),
                [fieldKey]: true
              }
            }));
            
            // Clear probing state for this field
            setFieldProbingState(prev => {
              const updated = { ...prev };
              delete updated[probeKey];
              return updated;
            });
            
            // Reset probe count for this field
            setAiFollowupCounts(prev => {
              const updated = { ...prev };
              delete updated[fieldCountKey];
              return updated;
            });
            
            // Fall through to advance to next step
          } else if (semanticResult.status === "invalid" || semanticResult.status === "unknown") {
            // Invalid or unknown value - check if we can probe more
            if (probeCount < maxAiFollowups) {
              console.log(`[V2-SEMANTIC] ${semanticResult.status} answer "${normalizedAnswer}" - triggering probe (${probeCount}/${maxAiFollowups})`);
              
              logAiProbeDebug('triggerProbe', {
                packId,
                fieldKey,
                instanceNumber,
                probeCount,
                maxAiFollowups,
                status: semanticResult.status
              });
              
              // Mark as in progress
              v2ProbingInProgressRef.current.add(probeKey);
              
              // Call backend to get AI probe question
              console.log(`[V2-PER-FIELD] Calling probeEngineV2 with:`, {
                packId,
                fieldKey,
                fieldValue: normalizedAnswer,
                previousProbesCount: probeCount
              });
              
              const v2Result = await callProbeEngineV2PerField(base44, {
                packId,
                fieldKey,
                fieldValue: normalizedAnswer,
                previousProbesCount: probeCount,
                incidentContext
              });
              
              // Extract mode and question text safely
              const mode = v2Result?.mode;
              const rawQuestion = typeof v2Result?.question === "string" ? v2Result.question.trim() : "";
              const hasProbeQuestion = rawQuestion.length > 0;

              console.log('[V2-PER-FIELD][RAW-RESPONSE]', {
                packId,
                fieldKey,
                previousProbesCount: probeCount,
                raw: v2Result
              });

              console.log(`[V2-PER-FIELD][RESULT]`, fieldKey, { mode, question: rawQuestion });

              // 1) Backend explicitly says QUESTION → always probe
              // 2) Backend mistakenly says NEXT_FIELD but still provides a question → also probe
              if (mode === 'QUESTION' || hasProbeQuestion) {
                // AI probe question generated - increment counter and show question
                console.log(`[V2-PER-FIELD] Field ${fieldKey} needs probing → showing AI question (mode=${mode})`);
                
                // Increment probe count for this field
                setAiFollowupCounts(prev => ({
                  ...prev,
                  [fieldCountKey]: probeCount + 1
                }));
                
                // Clear the text input immediately when entering probe mode
                setInput("");
                
                // Add the deterministic follow-up Q+A to transcript
                const followupEntry = createChatEvent('followup', {
                  questionId: currentItem.id,
                  questionText: step.Prompt,
                  packId: packId,
                  substanceName: substanceName,
                  kind: 'deterministic_followup',
                  answer: normalizedAnswer,
                  text: normalizedAnswer,
                  content: normalizedAnswer,
                  fieldKey: fieldKey,
                  followupPackId: packId,
                  instanceNumber: instanceNumber,
                  baseQuestionId: currentItem.baseQuestionId
                });
                followupEntry.type = 'followup';
                followupEntry.role = 'candidate';
                
                const probeText = rawQuestion; // guaranteed clean string
                
                // FIX #3: Log AI probe question IMMEDIATELY to transcript
                const aiProbeQuestionEntry = createChatEvent('ai_question', {
                  questionId: currentItem.baseQuestionId,
                  packId: packId,
                  content: probeText,
                  text: probeText,
                  kind: 'ai_field_probe',
                  followupPackId: packId,
                  instanceNumber: instanceNumber,
                  fieldKey: fieldKey,
                  probeEngineVersion: 'v2-per-field'
                });
                aiProbeQuestionEntry.type = 'ai_question';
                
                const newTranscript = [...transcript, followupEntry, aiProbeQuestionEntry];
                setTranscript(newTranscript);

                // Update probe state for this field
                setFieldProbingState(prev => ({
                  ...prev,
                  [probeKey]: {
                    probeCount: probeCount + 1,
                    lastQuestion: probeText,
                    isProbing: true
                  }
                }));
                
                // Update follow-up answers tracker
                setCurrentFollowUpAnswers(prev => ({ ...prev, [fieldKey]: normalizedAnswer }));
                
                // Set current field probe for UI
                setCurrentFieldProbe({
                  packId,
                  instanceNumber,
                  fieldKey,
                  semanticField: v2Result.semanticField,
                  question: probeText,
                  baseQuestionId: currentItem.baseQuestionId,
                  substanceName,
                  currentItem: currentItem
                });
                
                // Save current answer to database
                await saveFollowUpAnswer(packId, fieldKey, normalizedAnswer, substanceName, instanceNumber, "user");
                await persistStateToDatabase(newTranscript, queue, currentItem);
                
                // Stay on current item - waiting for probe answer
                setIsWaitingForAgent(true);
                setIsInvokeLLMMode(true);
                setIsCommitting(false);
                v2ProbingInProgressRef.current.delete(probeKey);
                return;
              }
              
              // Handle backend errors with one retry
              if (mode === 'ERROR') {
                console.log(`[V2-PER-FIELD] Backend returned ERROR for ${fieldKey}. Retrying once...`);

                const retry = await callProbeEngineV2PerField(base44, {
                  packId,
                  fieldKey,
                  fieldValue: normalizedAnswer,
                  previousProbesCount: probeCount,
                  incidentContext
                });

                const retryMode = retry?.mode;
                const retryQuestion = typeof retry?.question === "string" ? retry.question.trim() : "";

                console.log("[V2-PER-FIELD][RETRY-RESULT]", fieldKey, { retryMode, retryQuestion });

                // If retry yields a valid probe, show it
                if (retryMode === 'QUESTION' || retryQuestion.length > 0) {
                  console.log(`[V2-PER-FIELD] Retry succeeded → showing AI question for ${fieldKey}`);
                  
                  // Increment probe count for this field
                  setAiFollowupCounts(prev => ({
                    ...prev,
                    [fieldCountKey]: probeCount + 1
                  }));
                  
                  // Clear the text input immediately when entering probe mode
                  setInput("");
                  
                  // Add the deterministic follow-up Q+A to transcript
                  const followupEntry = createChatEvent('followup', {
                    questionId: currentItem.id,
                    questionText: step.Prompt,
                    packId: packId,
                    substanceName: substanceName,
                    kind: 'deterministic_followup',
                    answer: normalizedAnswer,
                    text: normalizedAnswer,
                    content: normalizedAnswer,
                    fieldKey: fieldKey,
                    followupPackId: packId,
                    instanceNumber: instanceNumber,
                    baseQuestionId: currentItem.baseQuestionId
                  });
                  followupEntry.type = 'followup';
                  followupEntry.role = 'candidate';
                  
                  // FIX #3: Log AI probe question IMMEDIATELY to transcript (retry path)
                  const aiProbeQuestionEntry = createChatEvent('ai_question', {
                    questionId: currentItem.baseQuestionId,
                    packId: packId,
                    content: retryQuestion,
                    text: retryQuestion,
                    kind: 'ai_field_probe',
                    followupPackId: packId,
                    instanceNumber: instanceNumber,
                    fieldKey: fieldKey,
                    probeEngineVersion: 'v2-per-field-retry'
                  });
                  aiProbeQuestionEntry.type = 'ai_question';
                  
                  const newTranscript = [...transcript, followupEntry, aiProbeQuestionEntry];
                  setTranscript(newTranscript);
                  
                  // Update probe state for this field
                  setFieldProbingState(prev => ({
                    ...prev,
                    [probeKey]: {
                      probeCount: probeCount + 1,
                      lastQuestion: retryQuestion,
                      isProbing: true
                    }
                  }));
                  
                  // Update follow-up answers tracker
                  setCurrentFollowUpAnswers(prev => ({ ...prev, [fieldKey]: normalizedAnswer }));
                  
                  // Set current field probe for UI
                  setCurrentFieldProbe({
                    packId,
                    instanceNumber,
                    fieldKey,
                    semanticField: retry.semanticField,
                    question: retryQuestion,
                    baseQuestionId: currentItem.baseQuestionId,
                    substanceName,
                    currentItem: currentItem
                  });
                  
                  // Save current answer to database
                  await saveFollowUpAnswer(packId, fieldKey, normalizedAnswer, substanceName, instanceNumber, "user");
                  await persistStateToDatabase(newTranscript, queue, currentItem);
                  
                  // Stay on current item - waiting for probe answer
                  setIsWaitingForAgent(true);
                  setIsInvokeLLMMode(true);
                  setIsCommitting(false);
                  v2ProbingInProgressRef.current.delete(probeKey);
                  return;
                }

                console.log(`[V2-PER-FIELD] Retry failed → treating ${fieldKey} as complete for safety`);
                // fall through to "complete" logic
              }

              // No probe to show — field is complete
              v2ProbingInProgressRef.current.delete(probeKey);
              console.log(`[V2-PER-FIELD] Backend says field ${fieldKey} is complete (mode=${mode})`)
              
              // Save the answer and mark complete
              await saveFollowUpAnswer(packId, fieldKey, normalizedAnswer, substanceName, instanceNumber, "user");
              
              setCompletedFields(prev => ({
                ...prev,
                [`${packId}_${instanceNumber}`]: {
                  ...(prev[`${packId}_${instanceNumber}`] || {}),
                  [fieldKey]: true
                }
              }));
              
              setFieldProbingState(prev => {
                const updated = { ...prev };
                delete updated[probeKey];
                return updated;
              });
              
              setAiFollowupCounts(prev => {
                const updated = { ...prev };
                delete updated[fieldCountKey];
                return updated;
              });
              
              // Fall through to advance to next step
            } else {
              // Max probes reached - mark as unresolved
              console.log(`[V2-SEMANTIC] Max probes (${maxAiFollowups}) reached for ${fieldKey} - marking as unresolved`);
              
              logAiProbeDebug('markUnresolved', {
                packId,
                fieldKey,
                instanceNumber,
                probeCount,
                maxAiFollowups,
                status: semanticResult.status
              });
              const packConfig = FOLLOWUP_PACK_CONFIGS[packId];
              const fieldConfig = packConfig?.fields?.find(f => f.fieldKey === fieldKey);
              const displayValue = fieldConfig?.unknownDisplayLabel || `Not recalled after ${probeCount} attempts`;
              
              // Save unresolved fact
              await saveFollowUpAnswer(packId, fieldKey, displayValue, substanceName, instanceNumber, "ai_probed");
              
              // Mark field as completed (unresolved)
              setCompletedFields(prev => ({
                ...prev,
                [`${packId}_${instanceNumber}`]: {
                  ...(prev[`${packId}_${instanceNumber}`] || {}),
                  [fieldKey]: true
                }
              }));
              
              // Clear probing state
              setFieldProbingState(prev => {
                const updated = { ...prev };
                delete updated[probeKey];
                return updated;
              });
              
              setAiFollowupCounts(prev => {
                const updated = { ...prev };
                delete updated[fieldCountKey];
                return updated;
              });
              
              // Fall through to advance to next step
            }
          }
        }
        // ============================================================================
        // END V2 PER-FIELD PROBING
        // ============================================================================

        // Create followup question event (for the transcript history)
        const followupQuestionEvent = createChatEvent('followup_question', {
          questionId: currentItem.id,
          questionText: step.Prompt,
          packId: packId,
          substanceName: substanceName,
          kind: 'deterministic_followup_question',
          text: step.Prompt,
          content: step.Prompt,
          fieldKey: step.Field_Key,
          followupPackId: packId,
          instanceNumber: instanceNumber,
          baseQuestionId: currentItem.baseQuestionId
        });

        // Create followup answer event
        const followupAnswerEvent = createChatEvent('followup_answer', {
          questionId: currentItem.id,
          packId: packId,
          substanceName: substanceName,
          kind: 'deterministic_followup_answer',
          answer: normalizedAnswer,
          text: normalizedAnswer,
          content: normalizedAnswer,
          fieldKey: step.Field_Key,
          followupPackId: packId,
          instanceNumber: instanceNumber,
          baseQuestionId: currentItem.baseQuestionId
        });

        // For render, combine into single entry (legacy format for HistoryEntry)
        const followupEntry = {
          ...followupQuestionEvent,
          type: 'followup',
          answer: normalizedAnswer,
          text: normalizedAnswer
        };

        const newTranscript = [...transcript, followupEntry];
        setTranscript(newTranscript);

        // Update follow-up answers tracker
        const updatedFollowUpAnswers = {
          ...currentFollowUpAnswers,
          [step.Field_Key]: normalizedAnswer
        };
        setCurrentFollowUpAnswers(updatedFollowUpAnswers);

        // Save to database - dates stored as plain text
        console.log("[MI INSTANCES SNAPSHOT]", {
          packId,
          currentInstanceNumber: instanceNumber,
          fieldKey: step.Field_Key,
          answer: normalizedAnswer
        });
        
        await saveFollowUpAnswer(packId, step.Field_Key, normalizedAnswer, substanceName, instanceNumber);
        
        // Check if there are more steps in the queue
        let updatedQueue = [...queue];
        let nextItem = updatedQueue.shift() || null;
        
        // NEW: Skip conditional follow-ups based on previous answers
        while (nextItem && nextItem.type === 'followup') {
          const nextPackSteps = injectSubstanceIntoPackSteps(engine, nextItem.packId, nextItem.substanceName);
          const nextStep = nextPackSteps[nextItem.stepIndex];
          
          if (shouldSkipFollowUpStep(nextStep, updatedFollowUpAnswers)) {
            console.log(`⏭️ Skipping conditional step: ${nextStep.Field_Key}`);
            // Skip this step and move to next
            nextItem = updatedQueue.shift() || null;
          } else {
            // This step should be asked
            break;
          }
        }
        
        // Check if this was the LAST follow-up in the pack (or all remaining were skipped)
        const isLastFollowUp = !nextItem || nextItem.type !== 'followup' || nextItem.packId !== packId;
        
        if (isLastFollowUp) {
          console.log("[MI INSTANCE FINALIZED]", {
            packId,
            instanceNumber: currentItem.instanceNumber || 1,
            allDeterministicAnswers: updatedFollowUpAnswers
          });
          
          console.log(`🎯 Last follow-up in ${packId} completed`);
          
          // NEW: Check if we should skip probing for PACK_LE_APPS when hired
          if (shouldSkipProbingForHired(packId, updatedFollowUpAnswers)) {
            console.log(`✅ Skipping AI probing for PACK_LE_APPS (outcome: hired) - moving to next base question`);
            
            // Find the original question that triggered this pack
            const triggeringQuestion = [...newTranscript].reverse().find(t => 
              t.type === 'question' && 
              engine.QById[t.questionId]?.followup_pack === packId &&
              t.answer === 'Yes'
            );
            
            if (triggeringQuestion) {
              // Compute next base question
              const nextQuestionId = computeNextQuestionId(engine, triggeringQuestion.questionId, 'Yes');
              
              // Reset follow-up answers tracker
              setCurrentFollowUpAnswers({});
              
              if (nextQuestionId && engine.QById[nextQuestionId]) {
                setQueue([]);
                setCurrentItem({ id: nextQuestionId, type: 'question' });
                await persistStateToDatabase(newTranscript, [], { id: nextQuestionId, type: 'question' });
              } else {
                console.log('✅ No next base question after skipping AI probing - marking interview complete');
                setCurrentItem(null);
                setQueue([]);
                await persistStateToDatabase(newTranscript, [], null);
                setShowCompletionModal(true);
              }
            } else {
              // If triggering question not found (error case), fallback to showing completion modal.
              console.error(`❌ Could not find triggering question for pack ${packId} when trying to skip probing. Marking interview complete.`);
              setCurrentItem(null);
              setQueue([]);
              await persistStateToDatabase(newTranscript, [], null);
              setShowCompletionModal(true);
            }
          } else {
            // Normal flow: hand off to AI for probing (FAIL-SAFE)
            const packAnswers = newTranscript.filter(t => 
              t.type === 'followup' && t.packId === packId
            );
            
            // Use stored baseQuestionId from currentItem (set when pack was triggered)
            const baseQuestionId = currentItem.baseQuestionId;
            
            if (baseQuestionId && engine.QById[baseQuestionId]) {
              console.log(`✅ Using stored baseQuestionId for AI handoff: ${baseQuestionId}`);
              
              // Reset follow-up answers tracker
              setCurrentFollowUpAnswers({});
              
              // Clear current item and queue - we're handing off to AI
              setCurrentItem(null);
              setQueue([]);
              await persistStateToDatabase(newTranscript, [], null);
              
              // Call the new per-pack AI probing starter
              const aiHandoffSuccessful = await startAiProbingForPackInstance(
                baseQuestionId,
                packId,
                substanceName,
                packAnswers,
                currentItem.instanceNumber || 1
              );
              
              // FAIL-SAFE: If AI handoff failed, advance to next base question immediately
              if (!aiHandoffSuccessful) {
                console.log('⚠️ AI handoff failed - skipping AI probing and advancing to next base question');
                advanceToNextBaseQuestion(baseQuestionId);
              }
            } else {
              // FIXED: Don't end interview - skip AI probing and continue
              console.error(`❌ Could not find triggering question for pack ${packId} (baseQuestionId: ${baseQuestionId}) - skipping AI probing and continuing interview`);
              
              // Reset follow-up answers tracker
              setCurrentFollowUpAnswers({});
              
              // Try to find baseQuestionId from transcript as fallback
              const triggeringAnswer = [...newTranscript].reverse().find(t => 
                t.type === 'question' && t.answer === 'Yes'
              );
              
              const fallbackQuestionId = triggeringAnswer?.questionId;
              
              if (fallbackQuestionId && engine.QById[fallbackQuestionId]) {
                console.log(`⚠️ Using fallback baseQuestionId from transcript: ${fallbackQuestionId}`);
                setCurrentItem(null);
                setQueue([]);
                await persistStateToDatabase(newTranscript, [], null);
                advanceToNextBaseQuestion(fallbackQuestionId);
              } else {
                console.error(`❌ Could not find any valid base question - advancing to next question in sequence`);
                // Last resort: use computeNextQuestionId with first active question
                const firstActiveQuestion = engine.ActiveOrdered[0];
                if (firstActiveQuestion) {
                  const nextId = computeNextQuestionId(engine, firstActiveQuestion, 'Yes');
                  if (nextId && engine.QById[nextId]) {
                    setCurrentItem({ id: nextId, type: 'question' });
                    setQueue([]);
                    await persistStateToDatabase(newTranscript, [], { id: nextId, type: 'question' });
                  } else {
                    // Truly can't continue - mark complete
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
              }
            }
          }
        } else {
          // More follow-ups remain - continue with deterministic engine
          setQueue(updatedQueue);
          setCurrentItem(nextItem);
          
          await persistStateToDatabase(newTranscript, updatedQueue, nextItem);
        }
      } else if (currentItem.type === 'multi_instance') {
        // MULTI-INSTANCE QUESTION
        const { questionId, packId, instanceNumber } = currentItem;
        
        const normalized = value.trim().toLowerCase();
        if (normalized !== 'yes' && normalized !== 'no') {
          setValidationHint('Please answer "Yes" or "No".');
          setIsCommitting(false);
          return;
        }
        
        const answer = normalized === 'yes' ? 'Yes' : 'No';
        
        const question = engine.QById[questionId];
        
        console.log("[MI ANSWER]", {
          baseQuestionId: questionId,
          baseQuestionCode: question?.question_id,
          followupPackId: packId,
          answer,
          instanceNumber,
          existingInstancesCount: instanceNumber - 1
        });
        
        // Add to transcript using functional update (single call to avoid duplicates)
        const transcriptEntry = {
          id: `mi-a-${questionId}-${packId}-${instanceNumber}-${Date.now()}`,
          type: 'multi_instance_answer',
          content: answer,
          questionId: questionId,
          packId: packId,
          instanceNumber: instanceNumber,
          timestamp: new Date().toISOString()
        };

        // Use functional update for persistence
        setTranscript(prev => {
          const newTranscript = [...prev, transcriptEntry];

          if (answer === 'Yes') {
            console.log("[MI DECISION]", {
              action: "create_new_instance",
              baseQuestionId: questionId,
              baseQuestionCode: question?.question_id,
              followupPackId: packId,
              newInstanceNumber: instanceNumber + 1
            });

            // Re-trigger the same follow-up pack for new instance
            const substanceName = question?.substance_name || null;
            const packSteps = injectSubstanceIntoPackSteps(engine, packId, substanceName);

            if (packSteps && packSteps.length > 0) {
              console.log("[MI INSTANCE NEW CREATED]", {
                baseQuestionId: questionId,
                baseQuestionCode: question?.question_id,
                followupPackId: packId,
                instanceNumber: instanceNumber + 1,
                totalSteps: packSteps.length,
                substanceName,
                details: {}
              });

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
                  baseQuestionId: questionId // Store for AI handoff
                });
              }

              const firstItem = followupQueue[0];
              const remainingQueue = followupQueue.slice(1);

              setQueue(remainingQueue);
              setCurrentItem(firstItem);

              persistStateToDatabase(newTranscript, remainingQueue, firstItem);
            }
          } else {
            console.log("[MI DECISION]", {
              action: "stop_multi_instance_and_advance",
              baseQuestionId: questionId,
              baseQuestionCode: question?.question_id,
              followupPackId: packId,
              recordedInstancesCount: instanceNumber
            });

            // No more instances - advance to next base question
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
  }, [currentItem, engine, queue, transcript, sessionId, isCommitting, currentFollowUpAnswers, onFollowupPackComplete, advanceToNextBaseQuestion, startAiProbingForPackInstance, sectionCompletionMessage]);

  // NEW: Handle agent probing questions (FAIL-SAFE)
  const handleAgentAnswer = useCallback(async (value) => {
    if (isCommitting || !isWaitingForAgent) return;
    
    setIsCommitting(true);
    setInput("");
    
    // ============================================================================
    // V2 PER-FIELD PROBING ANSWER HANDLER
    // ============================================================================
    if (currentFieldProbe) {
      const { packId, instanceNumber, fieldKey, semanticField, baseQuestionId, substanceName, currentItem: savedCurrentItem } = currentFieldProbe;
      const probeKey = getFieldProbeKey(packId, instanceNumber, fieldKey);
      
      console.log(`[V2-PER-FIELD] Processing probe answer for ${fieldKey}:`, value);
      
      // Get max AI followups from centralized config - SINGLE SOURCE OF TRUTH
      const maxAiFollowups = getPackMaxAiFollowups(packId);
      const packConfig = FOLLOWUP_PACK_CONFIGS[packId];
      const fieldConfig = packConfig?.fields?.find(f => f.fieldKey === fieldKey);
      
      // Get probe count from aiFollowupCounts using per-field key
      const fieldCountKey = `${packId}:${fieldKey}:${instanceNumber}`;
      const probeCount = aiFollowupCounts[fieldCountKey] || 0;
      
      console.log(`[V2-PER-FIELD] Current probe count for ${fieldKey}: ${probeCount}/${maxAiFollowups}`);
      
      // For per-field probing, add BOTH the probe question and answer to transcript now
      const currentProbeQuestion = currentFieldProbe.question;
      
      // Create AI probe question event
      const aiQuestionEntry = createChatEvent('ai_probe_question', {
        questionId: baseQuestionId,
        packId: packId,
        content: currentProbeQuestion,
        text: currentProbeQuestion,
        kind: 'ai_field_probe',
        followupPackId: packId,
        instanceNumber: instanceNumber,
        fieldKey: fieldKey,
        probeEngineVersion: 'v2-per-field'
      });
      aiQuestionEntry.type = 'ai_question';
      
      // Create AI probe answer event
      const aiAnswerEntry = createChatEvent('ai_probe_answer', {
        questionId: baseQuestionId,
        packId: packId,
        content: value,
        text: value,
        kind: 'ai_field_probe_answer',
        followupPackId: packId,
        instanceNumber: instanceNumber,
        fieldKey: fieldKey
      });
      aiAnswerEntry.type = 'ai_answer';
      
      setTranscript(prev => [...prev, aiQuestionEntry, aiAnswerEntry]);
      
      const updatedAnswers = { ...currentFollowUpAnswers, [fieldKey]: value };
      setCurrentFollowUpAnswers(updatedAnswers);
      
      // Run semantic validation on the probe answer
      const semanticResult = validateFollowupValue({ packId, fieldKey, rawValue: value });
      console.log(`[V2-SEMANTIC] Probe answer validation for ${fieldKey}:`, semanticResult);
      
      // Check if semantic validation passes now
      if (semanticResult.status === "valid") {
        // Valid answer - save and continue
        console.log(`[V2-SEMANTIC] Probe answer is valid - saving fact and continuing`);
        await saveFollowUpAnswer(packId, fieldKey, semanticResult.normalizedValue, substanceName, instanceNumber, "ai_probed");
        
        // Field is now complete - clean up and advance
        setCompletedFields(prev => ({
          ...prev,
          [`${packId}_${instanceNumber}`]: {
            ...(prev[`${packId}_${instanceNumber}`] || {}),
            [fieldKey]: true
          }
        }));
        
        setFieldProbingState(prev => {
          const updated = { ...prev };
          delete updated[probeKey];
          return updated;
        });
        
        setAiFollowupCounts(prev => {
          const updated = { ...prev };
          delete updated[fieldCountKey];
          return updated;
        });
        
        setCurrentFieldProbe(null);
        setIsWaitingForAgent(false);
        setIsInvokeLLMMode(false);
        
        // Move to next step
        let updatedQueue = [...queue];
        let nextItem = updatedQueue.shift() || null;
        
        while (nextItem && nextItem.type === 'followup') {
          const nextPackSteps = injectSubstanceIntoPackSteps(engine, nextItem.packId, nextItem.substanceName);
          const nextStep = nextPackSteps?.[nextItem.stepIndex];
          if (nextStep && shouldSkipFollowUpStep(nextStep, updatedAnswers)) {
            nextItem = updatedQueue.shift() || null;
          } else {
            break;
          }
        }
        
        const isLastFollowUp = !nextItem || nextItem.type !== 'followup' || nextItem.packId !== packId;
        
        if (isLastFollowUp) {
          setQueue([]);
          setCurrentItem(null);
          if (shouldSkipProbingForHired(packId, updatedAnswers)) {
            advanceToNextBaseQuestion(baseQuestionId);
          } else {
            onFollowupPackComplete(baseQuestionId, packId);
          }
        } else {
          setQueue(updatedQueue);
          setCurrentItem(nextItem);
          await persistStateToDatabase(transcript, updatedQueue, nextItem);
        }
        
        setIsCommitting(false);
        return;
      }
      
      // Still invalid/unknown - check if we can probe again
      if (probeCount < maxAiFollowups) {
        // Can probe again - call backend for next question
        console.log(`[V2-SEMANTIC] Probe answer still ${semanticResult.status} - probing again (${probeCount + 1}/${maxAiFollowups})`);
        
        // Increment probe count BEFORE calling backend
        const newProbeCount = probeCount + 1;
        setAiFollowupCounts(prev => ({
          ...prev,
          [fieldCountKey]: newProbeCount
        }));
        
        setInput("");
        
        // Call V2 to get next probe question - pass CURRENT probe count (before increment)
        console.log('[V2-PER-FIELD] Calling backend for next probe question:', {
          pack_id: packId,
          field_key: fieldKey,
          field_value: value,
          previous_probes_count: probeCount
        });
        
        const v2Result = await callProbeEngineV2PerField(base44, {
          packId,
          fieldKey,
          fieldValue: value,
          previousProbesCount: probeCount,
          incidentContext: updatedAnswers
        });
        
        console.log('[V2-PER-FIELD][RAW-RESPONSE]', {
          packId,
          fieldKey,
          previousProbesCount: probeCount,
          raw: v2Result
        });
        
        if (v2Result.mode === 'QUESTION') {
          setFieldProbingState(prev => ({
            ...prev,
            [probeKey]: {
              probeCount: probeCount + 1,
              lastQuestion: v2Result.question,
              isProbing: true
            }
          }));
          
          setCurrentFieldProbe(prev => ({
            ...prev,
            question: v2Result.question
          }));
          
          setIsCommitting(false);
          return;
        }
        // If backend says complete, fall through to completion logic
      }
      
      // Max probes reached or backend says done - mark as unresolved
      console.log(`[V2-SEMANTIC] Max probes (${maxAiFollowups}) reached for ${fieldKey} - marking unresolved`);
      const displayValue = fieldConfig?.unknownDisplayLabel || `Not recalled after ${probeCount} attempts`;
      await saveFollowUpAnswer(packId, fieldKey, displayValue, substanceName, instanceNumber, "ai_probed");
      
      // Clean up and advance
      setCompletedFields(prev => ({
        ...prev,
        [`${packId}_${instanceNumber}`]: {
          ...(prev[`${packId}_${instanceNumber}`] || {}),
          [fieldKey]: true
        }
      }));
      
      setFieldProbingState(prev => {
        const updated = { ...prev };
        delete updated[probeKey];
        return updated;
      });
      
      setAiFollowupCounts(prev => {
        const updated = { ...prev };
        delete updated[fieldCountKey];
        return updated;
      });
      
      setCurrentFieldProbe(null);
      setIsWaitingForAgent(false);
      setIsInvokeLLMMode(false);
      
      // Move to next step
      let updatedQueue = [...queue];
      let nextItem = updatedQueue.shift() || null;
      
      while (nextItem && nextItem.type === 'followup') {
        const nextPackSteps = injectSubstanceIntoPackSteps(engine, nextItem.packId, nextItem.substanceName);
        const nextStep = nextPackSteps?.[nextItem.stepIndex];
        if (nextStep && shouldSkipFollowUpStep(nextStep, updatedAnswers)) {
          nextItem = updatedQueue.shift() || null;
        } else {
          break;
        }
      }
      
      const isLastFollowUp = !nextItem || nextItem.type !== 'followup' || nextItem.packId !== packId;
      
      if (isLastFollowUp) {
        setQueue([]);
        setCurrentItem(null);
        if (shouldSkipProbingForHired(packId, updatedAnswers)) {
          advanceToNextBaseQuestion(baseQuestionId);
        } else {
          onFollowupPackComplete(baseQuestionId, packId);
        }
      } else {
        setQueue(updatedQueue);
        setCurrentItem(nextItem);
        await persistStateToDatabase(transcript, updatedQueue, nextItem);
      }
      
      setIsCommitting(false);
      return;
    }
    // ============================================================================
    // END V2 PER-FIELD ANSWER HANDLER
    // ============================================================================
    
    // NEW: Check if we're in invokeLLM mode (no agent calls needed)
    if (isInvokeLLMMode) {
      try {
        // Update the last exchange with candidate's response FIRST
        const updatedExchanges = [...invokeLLMProbingExchanges];
        const lastExchange = updatedExchanges[updatedExchanges.length - 1];
        if (lastExchange && !lastExchange.candidate_response) {
          lastExchange.candidate_response = value;
        }
        
        // Add answer to transcript using centralized event helper
        const probingSequence = updatedExchanges.length;
        const aiAnswerEntry = createChatEvent('ai_probe_answer', {
          questionId: currentFollowUpPack.questionId,
          packId: currentFollowUpPack.packId,
          content: value,
          text: value,
          kind: 'ai_probe_answer',
          followupPackId: currentFollowUpPack.packId,
          instanceNumber: currentFollowUpPack.instanceNumber,
          probingSequence: probingSequence
        });
        // Override type for render compatibility
        aiAnswerEntry.type = 'ai_answer';
        
        // Use functional update to ensure we have latest transcript
        setTranscript(prev => {
          const newTranscript = [...prev, aiAnswerEntry];
          persistStateToDatabase(newTranscript, [], null);
          return newTranscript;
        });
        
        // Check if we should ask another AI question or continue
        const countKey = `${currentFollowUpPack.packId}:${currentFollowUpPack.instanceNumber}`;
        const currentCount = aiFollowupCounts[countKey] || 0;
        
        // Get max AI followups from centralized config - SINGLE SOURCE OF TRUTH
        const maxAiFollowups = getPackMaxAiFollowups(currentFollowUpPack.packId);
        console.log('[LIVE_AI_FOLLOWUP] Count', currentCount, '/', maxAiFollowups, 'for pack', currentFollowUpPack.packId);
        
        if (currentCount < maxAiFollowups) {
          // Ask another AI question
          const transcriptWindow = buildTranscriptWindowForAi(
            currentFollowUpPack.questionId, 
            currentFollowUpPack.packId
          );
          
          const aiResult = await requestLiveAiFollowup({
            interviewId: sessionId,
            questionId: currentFollowUpPack.questionId,
            followupPackId: currentFollowUpPack.packId,
            transcriptWindow,
            candidateAnswer: value
          });
          
          if (aiResult?.status === 'ok' && aiResult.followupQuestion) {
            // Increment counter
            setAiFollowupCounts(prev => ({
              ...prev,
              [countKey]: currentCount + 1
            }));
            
            // Add new exchange to array BEFORE adding to transcript
            const newExchangeIndex = updatedExchanges.length + 1;
            updatedExchanges.push({
              sequence_number: newExchangeIndex,
              probing_question: aiResult.followupQuestion,
              candidate_response: null,
              timestamp: new Date().toISOString()
            });
            setInvokeLLMProbingExchanges(updatedExchanges);
            
            // Add AI question to transcript using functional update with stable unique ID
            const nextAiQuestion = {
              id: `ai-q-${currentFollowUpPack.questionId}-${currentFollowUpPack.packId}-${currentFollowUpPack.instanceNumber}-${newExchangeIndex}-${Date.now()}`,
              type: 'ai_question',
              content: aiResult.followupQuestion,
              questionId: currentFollowUpPack.questionId,
              packId: currentFollowUpPack.packId,
              timestamp: new Date().toISOString(),
              kind: 'ai_probe_question',
              role: 'investigator',
              text: aiResult.followupQuestion,
              followupPackId: currentFollowUpPack.packId,
              instanceNumber: currentFollowUpPack.instanceNumber,
              probingSequence: newExchangeIndex
            };
            
            setTranscript(prev => {
              const updatedTranscript = [...prev, nextAiQuestion];
              persistStateToDatabase(updatedTranscript, [], null);
              return updatedTranscript;
            });
            
            setIsCommitting(false);
            return;
          }
        }
        
        // Done with AI probing - save all exchanges and continue interview
        console.log(`💾 Saving ${updatedExchanges.length} invokeLLM probing exchanges for ${currentFollowUpPack.questionId}/${currentFollowUpPack.packId}`);
        await saveInvokeLLMProbingToDatabase(
          currentFollowUpPack.questionId,
          currentFollowUpPack.packId,
          updatedExchanges,
          currentFollowUpPack.instanceNumber
        );
        
        setIsWaitingForAgent(false);
        setIsInvokeLLMMode(false);
        setInvokeLLMProbingExchanges([]);
        
        const baseQuestionId = currentFollowUpPack.questionId;
        const packId = currentFollowUpPack.packId;
        setCurrentFollowUpPack(null);
        
        onFollowupPackComplete(baseQuestionId, packId);
        setIsCommitting(false);
        return;
        
      } catch (err) {
        console.error('❌ Error handling invokeLLM answer:', err);
        setError('Failed to process answer');
        setIsCommitting(false);
        return;
      }
    }
    
    // NEW: Agent mode with per-pack mini-session
    if (!aiSessionId) {
      console.error('❌ No AI session ID - cannot send message');
      setIsCommitting(false);
      return;
    }

    try {
      // Clear typing timeout (candidate submitted)
      clearTypingTimeout();

      // Start AI response timeout
      startAiResponseTimeout();

      // Get conversation object
      const currentConversation = await base44.agents.getConversation(aiSessionId);
      if (!currentConversation) {
        throw new Error('Conversation not found');
      }

      await base44.agents.addMessage(currentConversation, {
        role: 'user',
        content: value
      });

      // Increment turn count for safety cap
      const newTurnCount = probingTurnCount + 1;
      setProbingTurnCount(newTurnCount);

      // Check if we've exceeded max turns
      if (newTurnCount >= MAX_PROBE_TURNS) {
        console.warn(`⚠️ AI probing exceeded ${MAX_PROBE_TURNS} turns — forcing handoff`);

        // Wait a moment for final AI response, then force handoff
        setTimeout(() => {
          if (isWaitingForAgent && currentFollowUpPack) {
            handleAiResponseTimeout();
          }
        }, 3000);
      }

      setIsCommitting(false);
    } catch (err) {
      console.error('❌ Error sending to agent:', err);
      clearAiResponseTimeout();
      handleAiResponseTimeout();
      setIsCommitting(false);
    }
  }, [aiSessionId, isCommitting, isWaitingForAgent, probingTurnCount, currentFollowUpPack, agentMessages, advanceToNextBaseQuestion, clearTypingTimeout, startAiResponseTimeout, clearAiResponseTimeout, handleAiResponseTimeout, isInvokeLLMMode, invokeLLMProbingExchanges, aiFollowupCounts, transcript, sessionId, onFollowupPackComplete]);

  const handleTextSubmit = useCallback((e) => {
    e.preventDefault();
    const answer = input.trim();
    if (!answer) return;
    
    if (isWaitingForAgent) {
      handleAgentAnswer(answer);
    } else {
      handleAnswer(answer);
    }
  }, [input, isWaitingForAgent, handleAnswer, handleAgentAnswer]);

  // ============================================================================
  // DATABASE PERSISTENCE
  // ============================================================================

  const saveAnswerToDatabase = async (questionId, answer, question) => {
    try {
      const existing = await base44.entities.Response.filter({
        session_id: sessionId,
        question_id: questionId
      });
      
      if (existing.length > 0) {
        console.log(`ℹ️ Response for ${questionId} already exists, skipping`);
        return;
      }
      
      const currentDisplayOrder = displayOrderRef.current++;
      const triggersFollowup = question.followup_pack && answer.toLowerCase() === 'yes';
      
      // FIX: Get section name from Section entity, not legacy category field
      const sectionEntity = engine.Sections.find(s => s.id === question.section_id);
      const sectionName = sectionEntity?.section_name || question.category || '';
      
      await base44.entities.Response.create({
        session_id: sessionId,
        question_id: questionId,
        question_text: question.question_text,
        category: sectionName, // Use Section name from Interview Manager
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
        console.error(`❌ No triggering response found for pack ${packId}`);
        return;
      }
      
      const triggeringResponse = responses[responses.length - 1];
      
      const existingFollowups = await base44.entities.FollowUpResponse.filter({
        session_id: sessionId,
        response_id: triggeringResponse.id,
        followup_pack: packId,
        instance_number: instanceNumber
      });
      
      // Build fact entry for PACK_LE_APPS using semantic validation
      let factsUpdate = null;
      let unresolvedUpdate = null;
      if (packId === "PACK_LE_APPS") {
        const { validateFollowupValue: validateForFact } = await import("../components/followups/semanticValidator");
        
        const packConfig = FOLLOWUP_PACK_CONFIGS[packId];
        const fieldConfig = packConfig?.fields?.find(f => f.fieldKey === fieldKey);
        
        if (fieldConfig?.semanticKey) {
          // Use semantic validation to determine fact status
          const semanticResult = validateForFact({ packId, fieldKey, rawValue: answer });
          
          // Get max AI followups from centralized config - SINGLE SOURCE OF TRUTH
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
            // Valid value - store as confirmed fact
            factsUpdate = {
              [fieldConfig.semanticKey]: {
                value: semanticResult.normalizedValue,
                status: "confirmed",
                source: factSource
              }
            };
          } else if (semanticResult.status === "unknown") {
            // Unknown but allowed - store with unknown status (user's first answer)
            factsUpdate = {
              [fieldConfig.semanticKey]: {
                value: semanticResult.normalizedValue,
                status: "unknown",
                source: factSource
              }
            };
          }
          // Note: "invalid" status without being probed to max won't reach here
          // because semantic validation triggers probing for invalid values
        }
      }
      
      if (existingFollowups.length === 0) {
        console.log("[MI SAVE-DET BEFORE]", {
          action: "create",
          baseQuestionId: triggeringResponse.question_id,
          followupPackId: packId,
          instanceNumber,
          savingKey: fieldKey,
          savingValue: answer,
          existingDetails: null,
          factsUpdate
        });
        
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
        
        // Add facts for PACK_LE_APPS
        if (factsUpdate) {
          createData.additional_details.facts = factsUpdate;
        }
        
        // Add unresolved fields for PACK_LE_APPS
        if (unresolvedUpdate) {
          createData.additional_details.unresolvedFields = [unresolvedUpdate];
        }
        
        const createdRecord = await base44.entities.FollowUpResponse.create(createData);
        
        if (packId === 'PACK_LE_APPS') {
            await syncFactsToInterviewSession(sessionId, triggeringResponse.question_id, packId, createdRecord);
        }
        
        console.log("[MI SAVE-DET AFTER]", {
          action: "create",
          instanceNumber,
          createdRecordId: createdRecord.id,
          updatedDetails: createData.additional_details
        });
      } else {
        const existing = existingFollowups[0];
        
        console.log("[MI SAVE-DET BEFORE]", {
          action: "update",
          baseQuestionId: triggeringResponse.question_id,
          followupPackId: packId,
          instanceNumber,
          savingKey: fieldKey,
          savingValue: answer,
          existingDetails: existing.additional_details || {},
          factsUpdate
        });
        
        const updatedDetails = {
          ...(existing.additional_details || {}),
          [fieldKey]: answer
        };
        
        // Merge facts for PACK_LE_APPS
        if (factsUpdate) {
          updatedDetails.facts = {
            ...(updatedDetails.facts || {}),
            ...factsUpdate
          };
        }
        
        // Merge unresolved fields for PACK_LE_APPS
        if (unresolvedUpdate) {
          const existingUnresolved = updatedDetails.unresolvedFields || [];
          // Remove existing entry for this field if present, then add new one
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
        
        console.log("[MI SAVE-DET AFTER]", {
          action: "update",
          instanceNumber,
          existingFollowupId: existing.id,
          updatedDetails: updatedDetails
        });
      }

    } catch (err) {
      console.error('❌ Follow-up save error:', err);
    }
  };

  // ============================================================================
  // COMPLETION & PAUSE HANDLING
  // ============================================================================

  const handleCompletionConfirm = async () => {
    setIsCompletingInterview(true);
    
    try {
      await base44.entities.InterviewSession.update(sessionId, {
        status: 'completed',
        completed_date: new Date().toISOString(),
        completion_percentage: 100,
      });

      console.log('✅ Interview marked as completed');
      navigate(createPageUrl("Home"));
      
    } catch (err) {
      console.error('❌ Error completing interview:', err);
      setError('Failed to complete interview. Please try again.');
      setIsCompletingInterview(false);
    }
  };

  const handlePauseClick = async () => {
    try {
      await base44.entities.InterviewSession.update(sessionId, {
        status: 'paused'
      });
      setShowPauseModal(true);
      console.log('⏸️ Interview paused');
    } catch (err) {
      console.error('❌ Error pausing interview:', err);
      toast.error('Failed to pause interview');
    }
  };

  const handleCopyDetails = async () => {
    const text = `Dept Code: ${session?.department_code} | File: ${session?.file_number}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Details copied to clipboard');
    } catch (err) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const handleCloseWindow = () => {
    const canClose = window.close();
    if (!canClose) {
      toast.info('You can now close this tab. Use your Dept Code and File Number to resume later.');
    }
  };

  // ============================================================================
  // RENDER HELPERS - OPTIMIZED FOR SMOOTH CHAT
  // ============================================================================

  // NEW: Generate display number based on position in active questions list
  const getQuestionDisplayNumber = useCallback((questionId) => {
    if (!engine) return '';
    
    // Check if already mapped
    if (displayNumberMapRef.current[questionId]) {
      return displayNumberMapRef.current[questionId];
    }
    
    // Find position in ordered list
    const index = engine.ActiveOrdered.indexOf(questionId);
    if (index !== -1) {
      const displayNum = index + 1;
      displayNumberMapRef.current[questionId] = displayNum;
      return displayNum;
    }
    
    // Fallback - strip letters from question code (e.g., "68C" → "68")
    const questionObj = engine.QById[questionId];
    const rawCode = questionObj?.question_id || String(questionId);
    const strippedCode = rawCode.replace(/^Q0*/, '').replace(/[A-Z]+$/i, '');
    return strippedCode;
  }, [engine]);

  const getFollowUpPackName = (packId) => {
    return FOLLOWUP_PACK_NAMES[packId] || 'Follow-up Questions';
  };

  const getCurrentPrompt = () => {
    if (isWaitingForAgent) {
      // Show last agent message
      return null; // Agent messages will be rendered separately
    }
    
    if (!currentItem || !engine) return null;

    if (currentItem.type === 'question') {
      const question = engine.QById[currentItem.id];
      
      // CRITICAL FIX: If question doesn't exist, mark interview complete
      if (!question) {
        console.error(`❌ Question ${currentItem.id} not found in engine - marking interview complete`);
        setCurrentItem(null);
        setQueue([]);
        setShowCompletionModal(true);
        return null;
      }
      
      // FIX: Get section name from Section entity, not legacy category field
      const sectionEntity = engine.Sections.find(s => s.id === question.section_id);
      const sectionName = sectionEntity?.section_name || question.category || '';
      
      return {
        type: 'question',
        id: currentItem.id, // Use database ID, not question_code
        text: question.question_text,
        responseType: question.response_type,
        category: sectionName // Use Section name from Interview Manager
      };
    }

    if (currentItem.type === 'followup') {
      const { packId, stepIndex, substanceName } = currentItem;
      
      const packSteps = injectSubstanceIntoPackSteps(engine, packId, substanceName);
      if (!packSteps) return null;
      
      const step = packSteps[stepIndex];
      
      if (step.PrefilledAnswer && step.Field_Key === 'substance_name') {
        console.log(`⏩ Skipping auto-filled question in UI: ${step.Field_Key}`);
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

  const getPlaceholder = () => {
    if (isWaitingForAgent) {
      return "Respond to investigator's question...";
    }
    
    const currentPrompt = getCurrentPrompt(); // Get current prompt in this function context
    if (!currentPrompt) return "Type your answer...";
    
    if (currentPrompt.type === 'followup') {
      const expectedType = currentPrompt.expectedType;
      if (expectedType === 'DATE' || expectedType === 'DATERANGE') {
        return "MM/DD/YYYY or Month YYYY (e.g., June 2023)";
      }
      if (expectedType === 'NUMBER') {
        return "Enter a number";
      }
      if (expectedType === 'BOOLEAN') {
        return "Yes or No";
      }
    }
    
    return "Type your answer...";
  };
  
  // Get current question object for resume message
  const currentQuestion = currentItem?.type === 'question' && engine?.QById?.[currentItem.id]
    ? engine.QById[currentItem.id]
    : null;

  // Check if we're showing section transition acknowledgment
  const isSectionTransitionMode = sectionTransitionInfo !== null;
  
  // SIMPLIFIED: Get last unanswered agent question (for active question box only)
  const getLastAgentQuestion = useCallback(() => {
    // V2 per-field probe question
    if (currentFieldProbe?.question) {
      return currentFieldProbe.question;
    }
    
    if (!isWaitingForAgent || agentMessages.length === 0) return null;
    
    const lastAssistantMessage = [...agentMessages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistantMessage?.content) return null;
    
    // Filter out base questions and system messages
    if (lastAssistantMessage.content?.includes('Follow-up pack completed')) return null;
    if (lastAssistantMessage.content?.match(/\b(Q\d{1,3})\b/i)) return null;

    // Check if already answered (has user message after it)
    const lastIndex = agentMessages.findIndex(m => m === lastAssistantMessage);
    if (lastIndex !== -1 && agentMessages[lastIndex + 1]?.role === 'user') {
      return null; // Already answered
    }
    
    return lastAssistantMessage.content;
  }, [agentMessages, isWaitingForAgent, currentFieldProbe]);

  // ============================================================================
  // RENDER
  // ============================================================================

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-blue-400 animate-spin mx-auto" />
          <p className="text-slate-300">Loading hybrid interview engine...</p>
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
  const lastAgentQuestion = getLastAgentQuestion();
  
  // DYNAMIC: Use engine.TotalQuestions (no hardcoded fallback)
  const totalQuestions = engine?.TotalQuestions || 0;
  const answeredCount = transcript.filter(t => t.type === 'question').length;
  const progress = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  // Intro phase flag
  const isIntroPhase = showStartMessage && answeredCount === 0 && currentItem?.type === 'question';
  // Resume phase flag
  const isResumePhase = showResumeMessage && currentItem?.type === 'question';

  // CRITICAL FIX: Only show Y/N buttons if:
  // 1. Current item exists
  // 2. Current prompt exists AND is of type 'question' OR 'multi_instance'
  // 3. Question response_type is 'yes_no'
  // 4. NOT in agent mode
  const isYesNoQuestion = (currentPrompt?.type === 'question' && currentPrompt?.responseType === 'yes_no' && !isWaitingForAgent) ||
                          (currentPrompt?.type === 'multi_instance' && !isWaitingForAgent);
  const isFollowUpMode = currentPrompt?.type === 'followup';
  const isMultiInstanceMode = currentPrompt?.type === 'multi_instance';
  const requiresClarification = validationHint !== null;

  // OPTIMIZED: Filter displayable agent messages inline (avoid useCallback recalculation)
  const displayableAgentMessages = isWaitingForAgent && agentMessages.length > 0
    ? (() => {
        // Find handoff marker index
        const handoffIdx = agentMessages.findIndex(m => 
          m.role === 'assistant' && m.content?.includes('[[HANDOFF_TO_ENGINE]]')
        );
        
        // If handoff found, only show messages up to (not including) handoff
        const messagesToShow = handoffIdx !== -1 
          ? agentMessages.slice(0, handoffIdx)
          : agentMessages;
        
        return messagesToShow.filter(msg => {
          // Filter out system summary messages
          if (msg.content?.includes('Follow-up pack completed')) return false;
          // Filter out base question signals (Q###)
          if (msg.content?.match(/\b(Q\d{1,3})\b/i)) return false;
          // Keep everything else (both assistant and user messages)
          return true;
        });
      })()
    : [];

  return (
    <>
      <div className="h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex-shrink-0 bg-slate-800/95 backdrop-blur-sm border-b border-slate-700 px-4 py-2">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <img 
                  src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690e1cd45172f1b62aa6dbb0/271f2b6c5_IMG_2762.PNG" 
                  alt="ClearQuest" 
                  className="w-8 h-8 object-contain drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                />
                <h1 className="text-base font-semibold text-white">ClearQuest Interview</h1>
                {department && (
                  <>
                    <span className="text-slate-600 hidden sm:inline">•</span>
                    <span className="text-xs text-slate-200 hidden sm:inline">{department.department_name}</span>
                  </>
                )}
                {session && (
                  <>
                    <span className="text-slate-600 hidden md:inline">•</span>
                    <span className="text-xs text-slate-400 hidden md:inline">
                      <span className="text-slate-500">Code:</span> {session.department_code}
                    </span>
                    <span className="text-slate-600 hidden md:inline">•</span>
                    <span className="text-xs text-slate-400 hidden md:inline">
                      <span className="text-slate-500">File:</span> {session.file_number}
                    </span>
                  </>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePauseClick}
                className="bg-slate-700/50 border-slate-600 text-slate-200 hover:bg-slate-700 hover:text-white hover:border-slate-500 flex items-center gap-1.5 h-8 text-xs"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>Pause</span>
              </Button>
            </div>
            
            <div>
              <div 
                className="w-full h-2 bg-slate-700/30 rounded-full overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                aria-label={`Interview progress: ${progress}% complete`}
              >
                <div 
                  className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-full transition-all duration-500 ease-out"
                  style={{ 
                    width: `${progress}%`,
                    boxShadow: progress > 0 ? '0 0 12px rgba(34, 197, 94, 0.6)' : 'none'
                  }}
                />
              </div>
              <div className="flex justify-between items-center mt-1">
                <span className="text-[10px] text-slate-300">Overall</span>
                <div className="flex items-center gap-2">
                  <span className="sr-only">Progress: {answeredCount} of {totalQuestions} questions answered</span>
                  <span className="text-xs font-medium text-green-400">{progress}%</span>
                  <span className="text-xs text-green-400">•</span>
                  <span className="text-xs font-medium text-green-400">{answeredCount} / {totalQuestions}</span>
                </div>
              </div>
              
              {/* Current Section Progress */}
              {engine && engine.Sections && currentPrompt && (
                <div className="mt-2">
                  {(() => {
                    // Get current section from current question
                    let currentSectionName = currentPrompt.category;
                    
                    // Find the section entity
                    const currentSection = engine.Sections.find(s => s.section_name === currentSectionName);
                    
                    if (!currentSection) return null;
                    
                    const sectionQuestions = Object.values(engine.QById).filter(
                      q => q.section_id === currentSection.id && q.active !== false
                    );
                    const answeredInSection = transcript.filter(
                      t => t.type === 'question' && t.category === currentSection.section_name
                    ).length;
                    const totalInSection = sectionQuestions.length;
                    const sectionProgress = totalInSection > 0 
                      ? Math.round((answeredInSection / totalInSection) * 100) 
                      : 0;
                    
                    return (
                      <div>
                        <div 
                          className="w-full h-1.5 bg-slate-700/30 rounded-full overflow-hidden"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={sectionProgress}
                          aria-label={`${currentSection.section_name} progress: ${sectionProgress}% complete`}
                        >
                          <div 
                            className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500 ease-out"
                            style={{ 
                              width: `${sectionProgress}%`,
                              boxShadow: sectionProgress > 0 ? '0 0 8px rgba(59, 130, 246, 0.5)' : 'none'
                            }}
                          />
                        </div>
                        <div className="flex justify-between items-center mt-1">
                          <span className="text-[10px] text-slate-300">{currentSection.section_name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-blue-400">{sectionProgress}%</span>
                            <span className="text-xs text-blue-400">•</span>
                            <span className="text-xs font-medium text-blue-400">{answeredInSection} / {totalInSection}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        </header>



        {/* Main Content */}
        <main className="flex-1 overflow-hidden flex flex-col">
          <div 
            ref={historyRef}
            className="flex-1 overflow-y-auto px-4 py-6"
          >
            <div className="max-w-5xl mx-auto space-y-4">
              {answeredCount > 0 && !showStartMessage && (
                <Alert className="bg-blue-950/30 border-blue-800/50 text-blue-200">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    You've completed {answeredCount} of {totalQuestions} questions. Keep going!
                  </AlertDescription>
                </Alert>
              )}
              
              {/* Show deterministic transcript + AI probing */}
              {transcript.map((entry, index) => {
                // Build stable composite key to prevent React key warnings
                const keyParts = [
                  sessionId || 'session',
                  entry.questionId || 'no-question',
                  entry.packId || entry.followupPackId || 'no-pack',
                  entry.instanceNumber ?? 0,
                  entry.type || 'unknown',
                  entry.id || `index-${index}`
                ];
                const stableKey = keyParts.join(':');
                
                return (
                  <HistoryEntry 
                    key={stableKey}
                    entry={entry}
                    getQuestionDisplayNumber={getQuestionDisplayNumber}
                    getFollowUpPackName={getFollowUpPackName}
                  />
                );
              })}
              
              {/* Show ALL agent messages as continuous thread (NO REFRESH) */}
              {displayableAgentMessages.length > 0 && (
                <div className="space-y-4 border-t-2 border-purple-500/30 pt-4 mt-4">
                  <div className="text-sm font-semibold text-purple-400 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Investigator Follow-up Conversations
                  </div>
                  {displayableAgentMessages.map((msg, idx) => (
                    <AgentMessageBubble 
                      key={msg.id || `msg-${idx}`} 
                      message={msg} 
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Active Question (Deterministic) or Agent Probing or Intro */}
          {lastAgentQuestion && isWaitingForAgent ? (
            <div className="flex-shrink-0 px-4 pb-4">
              <div className="max-w-5xl mx-auto">
                <div 
                  className="bg-purple-950/95 border-2 border-purple-500/50 rounded-xl p-6 shadow-2xl"
                  style={{
                    boxShadow: '0 12px 36px rgba(0,0,0,0.55), 0 0 0 3px rgba(200,160,255,0.30) inset'
                  }}
                  role="region"
                  aria-live="polite"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border bg-purple-600/30 border-purple-500/50">
                      <AlertCircle className="w-4 h-4 text-purple-400" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-semibold text-purple-400">Investigator Question</span>
                        <span className="text-xs text-slate-500">•</span>
                        <span className="text-sm text-purple-300">Story Clarification</span>
                      </div>
                      <p className="text-white text-lg font-semibold leading-relaxed">
                        {lastAgentQuestion}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : isIntroPhase ? (
            <div className="flex-shrink-0 px-4 pb-4">
              <div className="max-w-5xl mx-auto">
                <div 
                  className="bg-slate-800/95 backdrop-blur-sm border-2 border-blue-500/50 rounded-xl p-6 shadow-2xl"
                  style={{
                    boxShadow: '0 10px 30px rgba(0,0,0,0.45), 0 0 0 3px rgba(59, 130, 246, 0.2) inset'
                  }}
                  data-active-question="true"
                  role="region"
                  aria-live="polite"
                >
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
            </div>
          ) : isResumePhase ? (
            <div className="flex-shrink-0 px-4 pb-4">
              <div className="max-w-5xl mx-auto">
                <div 
                  className="bg-emerald-950/40 border-2 border-emerald-700/60 rounded-xl p-6 shadow-xl"
                  data-active-question="true"
                  role="region"
                  aria-live="polite"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-600/20 flex items-center justify-center flex-shrink-0 border-2 border-emerald-500/50">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="flex-1 space-y-3">
                      <h3 className="text-lg font-bold text-white">
                        Welcome back
                      </h3>
                      <p className="text-emerald-100 text-sm leading-relaxed">
                        You're resuming your interview from <strong>{currentQuestion?.section_id ? Object.values(engine?.SectionById || {}).find(s => s.id === currentQuestion.section_id)?.section_name : 'where you left off'}</strong>
                        {currentQuestion?.question_number && `, around Question ${currentQuestion.question_number}`}.
                      </p>
                      {totalQuestions > 0 && (
                        <p className="text-emerald-100 text-sm leading-relaxed">
                          You're about <strong>{progress}%</strong> complete. Take a breath and continue when you're ready.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : isSectionTransitionMode ? (
            <div className="flex-shrink-0 px-4 pb-4">
              <div className="max-w-5xl mx-auto">
                <div 
                  className="bg-slate-800/95 backdrop-blur-sm border-2 border-green-500/50 rounded-xl p-6 shadow-2xl"
                  style={{
                    boxShadow: '0 10px 30px rgba(0,0,0,0.45), 0 0 0 3px rgba(34, 197, 94, 0.2) inset'
                  }}
                  data-active-question="true"
                  role="region"
                  aria-live="polite"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-600/30 flex items-center justify-center flex-shrink-0 border border-green-500/50">
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-semibold text-green-400">Section Complete</span>
                      </div>
                      <p className="text-white text-lg leading-relaxed">
                        You've completed <strong>{sectionTransitionInfo.fromSection}</strong> and are now moving to <strong>{sectionTransitionInfo.toSection}</strong>.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : currentPrompt ? (
            <div className="flex-shrink-0 px-4 pb-4">
              <div className="max-w-5xl mx-auto">
                <div 
                  className={requiresClarification 
                    ? "bg-purple-950/95 border-2 border-purple-500/50 rounded-xl p-6 shadow-2xl"
                    : "bg-slate-800/95 backdrop-blur-sm border-2 border-blue-500/50 rounded-xl p-6 shadow-2xl"
                  }
                  style={{
                    boxShadow: requiresClarification
                      ? '0 12px 36px rgba(0,0,0,0.55), 0 0 0 3px rgba(200,160,255,0.30) inset'
                      : '0 10px 30px rgba(0,0,0,0.45), 0 0 0 3px rgba(59, 130, 246, 0.2) inset'
                  }}
                  data-active-question="true"
                  role="region"
                  aria-live="polite"
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border ${
                      requiresClarification 
                        ? 'bg-purple-600/30 border-purple-500/50'
                        : 'bg-blue-600/30 border-blue-500/50'
                    }`}>
                      {requiresClarification ? (
                        <AlertCircle className="w-4 h-4 text-purple-400" />
                      ) : isFollowUpMode ? (
                        <Layers className="w-4 h-4 text-orange-400" />
                      ) : (
                        <Shield className="w-4 h-4 text-blue-400" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {requiresClarification ? (
                          <>
                            <span className="text-sm font-semibold text-purple-400">Clarification Needed</span>
                            <span className="text-xs text-slate-500">•</span>
                            <span className="text-sm text-purple-300">
                              {getFollowUpPackName(currentPrompt.packId)}
                            </span>
                          </>
                        ) : isMultiInstanceMode ? (
                          <>
                            <span className="text-sm font-semibold text-cyan-400">
                              Additional Instance Check
                            </span>
                            <span className="text-xs text-slate-500">•</span>
                            <span className="text-sm text-cyan-300">
                              Instance {currentPrompt.instanceNumber} of {currentPrompt.maxInstances}
                            </span>
                          </>
                        ) : isFollowUpMode ? (
                          <>
                            <span className="text-sm font-semibold text-orange-400">
                              Follow-up {currentPrompt.stepNumber} of {currentPrompt.totalSteps}
                            </span>
                            <span className="text-xs text-slate-500">•</span>
                            <span className="text-sm text-orange-300">
                              {currentPrompt.substanceName ? `${currentPrompt.substanceName} Use` : getFollowUpPackName(currentPrompt.packId)}
                            </span>
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
                      <p className="text-white text-lg font-semibold leading-relaxed">
                        {currentPrompt.text}
                      </p>
                      
                      {validationHint && (
                        <div className="mt-3 bg-yellow-900/40 border border-yellow-700/60 rounded-lg p-3" role="alert">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                            <p className="text-yellow-200 text-sm leading-relaxed">{validationHint}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </main>

        {/* Footer - show for intro (with Next button) and normal questions */}
        <footer 
          className="flex-shrink-0 bg-[#121c33] border-t border-slate-700/50 shadow-[0_-6px_16px_rgba(0,0,0,0.45)] rounded-t-[14px]"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          role="form"
          aria-label="Response area"
        >
          <div className="max-w-5xl mx-auto px-4 py-3 md:py-4">
            {isIntroPhase ? (
              <div className="flex justify-center mb-3">
                <button
                  type="button"
                  onClick={() => {
                    // Log welcome message to transcript
                    const welcomeEvent = createChatEvent('system_welcome', {
                      content: "Welcome to your ClearQuest Interview. This interview is part of your application process. You'll answer one question at a time, at your own pace. Clear, complete, and honest answers help investigators understand the full picture. You can pause and come back — we'll pick up where you left off.",
                      text: "Welcome to your ClearQuest Interview.",
                      kind: 'system_welcome'
                    });
                    setTranscript(prev => [...prev, welcomeEvent]);
                    setShowStartMessage(false);
                    setTimeout(() => autoScrollToBottom(), 0);
                  }}
                    disabled={isCommitting || showPauseModal}
                    className="min-h-[48px] sm:min-h-[48px] md:min-h-[52px] px-12 rounded-[10px] font-bold text-white border border-transparent transition-all duration-75 ease-out flex items-center justify-center gap-2 text-base sm:text-base md:text-lg bg-blue-600 hover:bg-blue-700 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 focus-visible:shadow-[0_0_0_4px_rgba(255,255,255,0.15)] disabled:opacity-50 disabled:pointer-events-none"
                    aria-label="Continue to first question"
                  >
                    Next
                  </button>
                  </div>
                  ) : isResumePhase ? (
                    <div className="flex justify-center mb-3">
                      <button
                        type="button"
                        onClick={() => {
                          setShowResumeMessage(false);
                          setTimeout(() => autoScrollToBottom(), 0);
                        }}
                        disabled={isCommitting || showPauseModal}
                        className="min-h-[48px] sm:min-h-[48px] md:min-h-[52px] px-12 rounded-[10px] font-bold text-white border border-transparent transition-all duration-75 ease-out flex items-center justify-center gap-2 text-base sm:text-base md:text-lg bg-emerald-600 hover:bg-emerald-700 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 focus-visible:shadow-[0_0_0_4px_rgba(255,255,255,0.15)] disabled:opacity-50 disabled:pointer-events-none"
                        aria-label="Continue interview"
                      >
                        Next
                      </button>
                    </div>
                  ) : isSectionTransitionMode ? (
                    <div className="flex justify-center mb-3">
                      <button
                        type="button"
                        onClick={async () => {
                          // Add transition message to transcript
                          const transitionMessage = {
                            id: `section-transition-${Date.now()}`,
                            type: 'system_message',
                            content: `You've completed ${sectionTransitionInfo.fromSection} and are now moving to ${sectionTransitionInfo.toSection}.`,
                            timestamp: new Date().toISOString(),
                            kind: 'section_transition',
                            role: 'system',
                            sectionName: sectionTransitionInfo.fromSection,
                            nextSectionName: sectionTransitionInfo.toSection
                          };
                          const newTranscript = [...transcript, transitionMessage];
                          setTranscript(newTranscript);

                          // Advance to next question
                          const nextQuestionId = sectionTransitionInfo.nextQuestionId;
                          setCurrentItem({ id: nextQuestionId, type: 'question' });
                          setQueue([]);

                          // Clear transition state
                          setSectionTransitionInfo(null);

                          // Persist
                          await persistStateToDatabase(newTranscript, [], { id: nextQuestionId, type: 'question' });
                          setTimeout(() => autoScrollToBottom(), 0);
                        }}
                        disabled={isCommitting || showPauseModal}
                        className="min-h-[48px] sm:min-h-[48px] md:min-h-[52px] px-12 rounded-[10px] font-bold text-white border border-transparent transition-all duration-75 ease-out flex items-center justify-center gap-2 text-base sm:text-base md:text-lg bg-green-600 hover:bg-green-700 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 focus-visible:shadow-[0_0_0_4px_rgba(255,255,255,0.15)] disabled:opacity-50 disabled:pointer-events-none"
                        aria-label="Continue to next section"
                      >
                        Next
                      </button>
                    </div>
                  ) : isYesNoQuestion ? (
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-3">
                <button
                  ref={yesButtonRef}
                  type="button"
                  onClick={() => handleAnswer("Yes")}
                  disabled={isCommitting || showPauseModal}
                  className="btn-yn btn-yes flex-1 min-h-[48px] sm:min-h-[48px] md:min-h-[52px] sm:min-w-[140px] rounded-[10px] font-bold text-white border border-transparent transition-all duration-75 ease-out flex items-center justify-center gap-2 text-base sm:text-base md:text-lg bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 focus-visible:shadow-[0_0_0_4px_rgba(255,255,255,0.15)] disabled:opacity-50 disabled:pointer-events-none"
                  aria-label="Answer Yes"
                >
                  <Check className="w-5 h-5 sm:w-5 sm:h-5 md:w-6 md:h-6" />
                  <span>Yes</span>
                </button>
                <button
                  ref={noButtonRef}
                  type="button"
                  onClick={() => handleAnswer("No")}
                  disabled={isCommitting || showPauseModal}
                  className="btn-yn btn-no flex-1 min-h-[48px] sm:min-h-[48px] md:min-h-[52px] sm:min-w-[140px] rounded-[10px] font-bold text-white border border-transparent transition-all duration-75 ease-out flex items-center justify-center gap-2 text-base sm:text-base md:text-lg bg-red-500 hover:bg-red-600 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 focus-visible:shadow-[0_0_0_4px_rgba(255,255,255,0.15)] disabled:opacity-50 disabled:pointer-events-none"
                  aria-label="Answer No"
                >
                  <X className="w-5 h-5 sm:w-5 sm:h-5 md:w-6 md:h-6" />
                  <span>No</span>
                </button>
              </div>
            ) : (
              <form onSubmit={handleTextSubmit} className="flex gap-2 sm:gap-3 mb-3">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={getPlaceholder()}
                  className="flex-1 bg-slate-900/50 border-slate-600 text-white h-12 sm:h-12 md:h-14 text-base sm:text-base md:text-lg focus:ring-2 focus:ring-green-400 focus:ring-offset-2 focus:ring-offset-[#121c33] focus:border-green-400"
                  disabled={isCommitting || showPauseModal}
                  autoComplete="off"
                />
                <Button
                  type="submit"
                  disabled={!input.trim() || isCommitting || showPauseModal}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 sm:px-6 h-12 sm:h-12 md:h-14 focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-[#121c33]"
                >
                  <Send className="w-5 h-5 sm:mr-2" />
                  <span className="hidden sm:inline">Send</span>
                </Button>
              </form>
            )}
            
              <p className="text-xs text-slate-400 text-center leading-relaxed px-2">
                {isIntroPhase
                  ? "Click Next to begin your interview"
                  : isResumePhase
                    ? "Click Next to continue where you left off"
                    : isSectionTransitionMode
                      ? "Click Next to continue to the next section"
                      : isWaitingForAgent 
                        ? "Responding to investigator's probing questions..." 
                        : "Once you submit an answer, it cannot be changed. Contact your investigator after the interview if corrections are needed."}
              </p>
              </div>
              </footer>
              </div>

      {/* Pause Modal */}
      <Dialog open={showPauseModal} onOpenChange={setShowPauseModal}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Pause className="w-5 h-5 text-blue-400" />
              Interview Paused
            </DialogTitle>
            <DialogDescription className="text-slate-300 pt-3 space-y-3">
              <p>Your interview is paused. You can close this window and come back anytime to continue.</p>
              <p>You will need your <strong className="text-white">Dept Code</strong> and <strong className="text-white">File Number</strong> to resume.</p>
              
              <div className="flex flex-wrap gap-2 pt-2">
                <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg">
                  <span className="text-xs text-slate-400 block mb-1">Dept Code</span>
                  <span className="font-mono text-sm text-slate-200">{session?.department_code}</span>
                </div>
                <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg">
                  <span className="text-xs text-slate-400 block mb-1">File Number</span>
                  <span className="font-mono text-sm text-slate-200">{session?.file_number}</span>
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-col gap-2 pt-4">
            <Button
              variant="outline"
              onClick={handleCopyDetails}
              className="w-full bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700 hover:text-white"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy Details
            </Button>
            <Button
              variant="outline"
              onClick={handleCloseWindow}
              className="w-full bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700 hover:text-white"
            >
              <XCircle className="w-4 h-4 mr-2" />
              Close Window
            </Button>
            <Button
              onClick={() => setShowPauseModal(false)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              Keep Working
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Completion Modal */}
      <Dialog open={showCompletionModal} onOpenChange={() => {}}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md" hideClose>
          <DialogHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-4 rounded-full bg-green-600/20">
                <CheckCircle2 className="w-12 h-12 text-green-400" />
              </div>
            </div>
            <DialogTitle className="text-2xl font-bold text-center">Interview Complete</DialogTitle>
            <DialogDescription className="text-slate-300 text-center pt-4 space-y-3">
              <p className="text-base leading-relaxed">
                Thank you for completing your background interview.
              </p>
              <p className="text-base leading-relaxed">
                Your responses have been securely recorded and encrypted. This interview will now be sent to the investigators for review.
              </p>
              <p className="text-sm text-slate-400 pt-2">
                Session Code: <span className="font-mono text-slate-300">{session?.session_code}</span>
              </p>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center pt-4">
            <Button
              onClick={handleCompletionConfirm}
              disabled={isCompletingInterview}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 h-12"
              size="lg"
            >
              {isCompletingInterview ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Completing...
                </>
              ) : (
                'OK'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Deterministic transcript entries + AI probing
function HistoryEntry({ entry, getQuestionDisplayNumber, getFollowUpPackName }) {
  // Welcome message
  if (entry.type === 'system_welcome') {
    return (
      <div className="bg-blue-950/30 border border-blue-800/50 rounded-xl p-5 opacity-90">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0">
            <Shield className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-sm font-semibold text-blue-400">Welcome</span>
            </div>
            <p className="text-white leading-relaxed">{entry.text || entry.content}</p>
          </div>
        </div>
      </div>
    );
  }

  // Intro type (legacy compatibility)
  if (entry.type === 'intro') {
    return (
      <div className="bg-blue-950/30 border border-blue-800/50 rounded-xl p-5 opacity-90">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0">
            <Shield className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-sm font-semibold text-blue-400">Welcome</span>
            </div>
            <p className="text-white leading-relaxed">{entry.text || entry.content}</p>
          </div>
        </div>
      </div>
    );
  }

  // System messages (timeouts, reminders)
  if (entry.type === 'system_message') {
    // Section transition messages get special styling
    if (entry.kind === 'section_transition') {
      return (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5 opacity-85">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-green-600/20 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm font-semibold text-green-400">Section Complete</span>
              </div>
              <p className="text-white leading-relaxed">{entry.content}</p>
            </div>
          </div>
        </div>
      );
    }

    // Regular system messages
    return (
      <div className="flex justify-center my-2">
        <div className="bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 max-w-lg text-center">
          <p className="text-slate-300 text-sm">{entry.content}</p>
        </div>
      </div>
    );
  }
  
  if (entry.type === 'question') {
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
                  Question {getQuestionDisplayNumber(entry.questionId)}
                </span>
                <span className="text-xs text-slate-500">•</span>
                <span className="text-sm font-medium text-slate-300">{entry.category}</span>
              </div>
              <p className="text-white leading-relaxed">{entry.questionText}</p>
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <div className="bg-blue-600 rounded-xl px-5 py-3 max-w-2xl">
            <p className="text-white font-medium">{entry.answer}</p>
          </div>
        </div>
      </div>
    );
  }

  if (entry.type === 'followup') {
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
                <span className="text-sm text-orange-300">
                  {entry.substanceName ? `${entry.substanceName} Use` : getFollowUpPackName(entry.packId)}
                </span>
              </div>
              <p className="text-white leading-relaxed">{entry.questionText}</p>
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <div className="bg-orange-600 rounded-xl px-5 py-3 max-w-2xl">
            <p className="text-white font-medium">{entry.answer}</p>
          </div>
        </div>
      </div>
    );
  }

  if (entry.type === 'ai_question') {
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
              <p className="text-white leading-relaxed">{entry.content}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (entry.type === 'ai_answer') {
    return (
      <div className="flex justify-end">
        <div className="bg-purple-600 rounded-xl px-5 py-3 max-w-2xl">
          <p className="text-white font-medium">{entry.content}</p>
        </div>
      </div>
    );
  }

  if (entry.type === 'multi_instance_question') {
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
              <p className="text-white leading-relaxed">{entry.content}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (entry.type === 'multi_instance_answer') {
    return (
      <div className="flex justify-end">
        <div className="bg-cyan-600 rounded-xl px-5 py-3 max-w-2xl">
          <p className="text-white font-medium">{entry.content}</p>
        </div>
      </div>
    );
  }

  return null;
}

// Agent message bubbles (for probing questions)
function AgentMessageBubble({ message }) {
  const isUser = message.role === 'user';
  
  return (
    <div className="space-y-3">
      <div className={`${isUser ? 'flex justify-end' : ''}`}>
        <div className={`${
          isUser 
            ? 'bg-purple-600 rounded-xl px-5 py-3 max-w-2xl'
            : 'bg-purple-950/30 border border-purple-800/50 rounded-xl p-5 opacity-85'
        }`}>
          {!isUser && (
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-purple-600/20 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-3.5 h-3.5 text-purple-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm font-semibold text-purple-400">Investigator</span>
                </div>
                <p className="text-white leading-relaxed">{message.content}</p>
              </div>
            </div>
          )}
          {isUser && (
            <p className="text-white font-medium">{message.content}</p>
          )}
        </div>
      </div>
    </div>
  );
}