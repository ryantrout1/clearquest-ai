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

// ============================================================================
// SECTION-BASED HELPER FUNCTIONS (HOISTED)
// ============================================================================

/**
 * Build ordered sections array from engine metadata
 * Derives sections from Section entities already in engine
 */
function buildSectionsFromEngine(engineData) {
  try {
    // Check multiple possible sources for sections
    const sectionEntities = engineData.Sections || [];
    const sectionOrder = engineData.sectionOrder || [];
    const questionsBySection = engineData.questionsBySection || {};
    
    // If we have Section entities, use them
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
        console.log(`[SECTIONS] Built ${orderedSections.length} sections from engine:`, 
          orderedSections.map(s => `${s.section_order}. ${s.displayName} (${s.questionIds.length} Qs)`));
        return orderedSections;
      }
    }
    
    // Fallback: try to build from sectionOrder if available
    if (sectionOrder.length > 0) {
      console.log('[SECTIONS] Attempting to build from sectionOrder');
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
        console.log(`[SECTIONS] Built ${orderedSections.length} sections from sectionOrder:`, 
          orderedSections.map(s => `${s.section_order}. ${s.displayName} (${s.questionIds.length} Qs)`));
        return orderedSections;
      }
    }
    
    console.warn('[SECTIONS] No section data found - returning empty array');
    return [];
  } catch (err) {
    console.warn('[SECTIONS] Error building sections (non-fatal):', err.message);
    return [];
  }
}

/**
 * Get next question in section-first flow
 * Returns: { mode: 'QUESTION', nextSectionIndex, nextQuestionId } or { mode: 'DONE' }
 */
function getNextQuestionInSectionFlow({
  sections,
  currentSectionIndex,
  currentQuestionId,
  answeredQuestionIds = new Set()
}) {
  if (!sections || sections.length === 0) {
    return { mode: 'DONE' };
  }

  const currentSection = sections[currentSectionIndex];
  if (!currentSection) {
    return { mode: 'DONE' };
  }

  const sectionQuestions = currentSection.questionIds || [];
  
  // Find current question position in this section
  const currentIdx = sectionQuestions.indexOf(currentQuestionId);
  
  if (currentIdx === -1) {
    console.warn('[SECTION-FLOW] Current question not found in section', {
      sectionId: currentSection.id,
      currentQuestionId,
      sectionQuestions
    });
    // Fallback: go to first unanswered question in section
    const firstUnanswered = sectionQuestions.find(qId => !answeredQuestionIds.has(qId));
    if (firstUnanswered) {
      return {
        mode: 'QUESTION',
        nextSectionIndex: currentSectionIndex,
        nextQuestionId: firstUnanswered
      };
    }
  }

  // Look for next question in current section
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

  // No more questions in this section - find next active section
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

  // No more sections with unanswered questions
  return { mode: 'DONE' };
}

/**
 * Determine which section index to start from based on session state
 */
function determineInitialSectionIndex(orderedSections, sessionData, engineData) {
  if (!orderedSections || orderedSections.length === 0) return 0;
  
  // If session has current_item_snapshot with a questionId, find its section
  const currentItemSnapshot = sessionData.current_item_snapshot;
  if (currentItemSnapshot?.id && currentItemSnapshot?.type === 'question') {
    const questionId = currentItemSnapshot.id;
    const location = engineData.questionIdToSection?.[questionId];
    
    if (location?.sectionId) {
      const sectionIndex = orderedSections.findIndex(s => s.id === location.sectionId);
      if (sectionIndex !== -1) {
        console.log(`[SECTIONS] Resuming at section ${sectionIndex}: ${orderedSections[sectionIndex].displayName}`);
        return sectionIndex;
      }
    }
  }
  
  // Default to first section
  return 0;
}

/**
 * Check if current section is complete
 * Section is complete when all base questions + follow-ups are done
 */
function isSectionComplete(section, engineData, transcriptData, queueData, currentItemData) {
  if (!section || !engineData) return false;
  
  // Check 1: All base questions in section have answers
  const answeredQuestionIds = new Set(
    transcriptData.filter(t => t.type === 'question').map(t => t.questionId)
  );
  
  const allBaseQuestionsAnswered = section.questionIds.every(qId => answeredQuestionIds.has(qId));
  
  if (!allBaseQuestionsAnswered) {
    return false;
  }
  
  // Check 2: No active follow-ups in queue for this section
  const hasActiveFollowups = queueData.some(item => 
    item.type === 'followup' || item.type === 'multi_instance'
  );
  
  if (hasActiveFollowups) {
    return false;
  }
  
  // Check 3: Current item is not a follow-up for this section
  if (currentItemData?.type === 'followup' || currentItemData?.type === 'multi_instance') {
    return false;
  }
  
  return true;
}

/**
 * Get next question within current section, or null if section complete
 */
function getNextQuestionInSection(section, engineData, transcriptData) {
  if (!section || !engineData) return null;
  
  const answeredQuestionIds = new Set(
    transcriptData.filter(t => t.type === 'question').map(t => t.questionId)
  );
  
  // Find first unanswered question in section
  for (const questionId of section.questionIds) {
    if (!answeredQuestionIds.has(questionId)) {
      return questionId;
    }
  }
  
  return null;
}

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

// Section "What to Expect" descriptions
const WHAT_TO_EXPECT = {
  'APPLICATIONS_WITH_OTHER_LE': 'your prior law enforcement applications and their outcomes',
  'DRIVING_RECORD': 'your driving history, such as citations, collisions, and any license actions',
  'CRIMINAL_INVOLVEMENT': 'any past criminal involvement, police contacts, or major accusations',
  'EXTREMIST_ORGANIZATIONS': 'any involvement with extremist, hate, or gang organizations',
  'SEXUAL_ACTIVITIES': 'sexual conduct and behavior relevant to suitability for public safety work',
  'FINANCIAL_HISTORY': 'your financial history, including debts, bankruptcies, or unmet obligations',
  'EMPLOYMENT_HISTORY': 'your work history, performance, separations, disputes, and reliability',
  'ALCOHOL_USE': 'past or current alcohol use patterns and any alcohol-related incidents',
  'ILLEGAL_DRUG': 'past or current drug use, possession, sales, or related contacts',
  'MILITARY_HISTORY': 'your military service, including conduct, separations, and performance',
  'PRIOR_LAW_ENFORCEMENT': 'your prior police applications, selections, and agency contacts',
  'GENERAL_DISCLOSURES': 'general eligibility, disclosures, and suitability topics',
  // Category-based keys for legacy compatibility
  'CAT_DRIVING_RECORD': 'your driving history, such as citations, collisions, and any license actions',
  'CAT_CRIMINAL': 'any past criminal involvement, police contacts, or major accusations',
  'CAT_EXTREMIST': 'any involvement with extremist, hate, or gang organizations',
  'CAT_SEXUAL': 'sexual conduct and behavior relevant to suitability for public safety work',
  'CAT_FINANCIAL': 'your financial history, including debts, bankruptcies, or unmet obligations',
  'CAT_EMPLOYMENT': 'your work history, performance, separations, disputes, and reliability',
  'CAT_ALCOHOL': 'past or current alcohol use patterns and any alcohol-related incidents',
  'CAT_DRUGS': 'past or current drug use, possession, sales, or related contacts',
  'CAT_MILITARY_HISTORY': 'your military service, including conduct, separations, and performance',
  'CAT_GENERAL': 'general eligibility, disclosures, and suitability topics',
  'CAT_PRIOR_LAW_ENFORCEMENT': 'your prior police applications, selections, and agency contacts'
};

// FEATURE FLAG: Enable live AI follow-ups (via invokeLLM server function)
const ENABLE_LIVE_AI_FOLLOWUPS = true;

// DEBUG FLAG: Enable detailed AI probe logging
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
        
        if (DEBUG_MODE) console.log(`[SYNC_FACTS] Synced facts for Q:${questionId} on session ${sessionId}`);

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
 * 
 * For AI probes, includes metadata: baseQuestionId, followupPackId, fieldKey, instanceNumber, probeIndex
 * These fields match the existing LE_APPS AI probing pattern for UnifiedTranscriptRenderer compatibility.
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
    // Add label for AI probes - matches LE_APPS pattern
    if (type === 'ai_probe_question' || type === 'ai_question') {
      baseEvent.label = 'AI Investigator';
      baseEvent.kind = 'ai_probe_question'; // Ensure kind is set for UnifiedTranscriptRenderer
    }
  } else if (['answer', 'followup_answer', 'ai_probe_answer', 'ai_answer', 'multi_instance_answer'].includes(type)) {
    baseEvent.role = 'candidate';
    // Add label for AI probe answers - matches LE_APPS pattern
    if (type === 'ai_probe_answer' || type === 'ai_answer') {
      baseEvent.label = 'Candidate';
      baseEvent.kind = 'ai_probe_answer'; // Ensure kind is set for UnifiedTranscriptRenderer
    }
  }
  
  return baseEvent;
};

/**
 * Helper to check if we should skip adding an AI probe message (duplicate guard)
 * Returns true ONLY if the last transcript event is the EXACT same AI probe question.
 * 
 * This guard is NARROW: it does NOT block:
 * - Probe answer events (different type)
 * - Subsequent probes for the same field when probeIndex increments
 * - Probes for different fields
 */
const shouldSkipDuplicateAiProbe = (transcript, newEvent) => {
  if (!transcript || transcript.length === 0) return false;
  if (!newEvent || !['ai_question', 'ai_probe_question'].includes(newEvent.type)) return false;
  
  const lastEvent = transcript[transcript.length - 1];
  if (!lastEvent || !['ai_question', 'ai_probe_question'].includes(lastEvent.type)) return false;
  
  // Check if same probe by matching ALL key fields including probeIndex
  const sameBaseQuestion = lastEvent.baseQuestionId === newEvent.baseQuestionId;
  const samePackId = lastEvent.followupPackId === newEvent.followupPackId;
  const sameFieldKey = lastEvent.fieldKey === newEvent.fieldKey;
  const sameInstance = lastEvent.instanceNumber === newEvent.instanceNumber;
  const sameProbeIndex = lastEvent.probeIndex === newEvent.probeIndex;
  const sameText = lastEvent.text === newEvent.text;
  
  const isDuplicate = sameBaseQuestion && samePackId && sameFieldKey && sameInstance && sameProbeIndex && sameText;
  
  if (isDuplicate) {
    console.debug('[AI-PROBE-TRANSCRIPT] Duplicate guard triggered - skipping duplicate probe question', {
      baseQuestionId: newEvent.baseQuestionId,
      fieldKey: newEvent.fieldKey,
      probeIndex: newEvent.probeIndex
    });
  }
  
  return isDuplicate;
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

  // DEEP DEBUG: Log full request context
  console.debug('[V2 PROBING][REQUEST]', {
    packId,
    fieldKey,
    fieldValuePreview: fieldValue?.substring?.(0, 120) || fieldValue,
    fieldValueLength: fieldValue?.length || 0,
    previousProbesCount,
    hasIncidentContext: !!incidentContext,
    incidentContextKeys: incidentContext ? Object.keys(incidentContext) : []
  });

  if (DEBUG_MODE) {
    console.log('[AI-FOLLOWUP][V2-REQUEST]', {
      packId,
      fieldKey,
      fieldValue: fieldValue?.substring?.(0, 50) || fieldValue,
      previousProbesCount
    });
  }

  try {

    const response = await base44Client.functions.invoke('probeEngineV2', {
      pack_id: packId,
      field_key: fieldKey,
      field_value: fieldValue,
      previous_probes_count: previousProbesCount || 0,
      incident_context: incidentContext || {},
      mode: 'VALIDATE_FIELD'
    });

    // DEEP DEBUG: Log full response
    console.debug('[V2 PROBING][RESPONSE RAW]', {
      packId,
      fieldKey,
      status: response?.status,
      dataKeys: response?.data ? Object.keys(response.data) : [],
      mode: response?.data?.mode,
      hasQuestion: !!response?.data?.question,
      questionPreview: response?.data?.question?.substring?.(0, 100) || null,
      fullData: response?.data
    });

    if (DEBUG_MODE) {
      console.log('[AI-FOLLOWUP][V2-RESPONSE]', {
        packId,
        fieldKey,
        mode: response?.data?.mode,
        hasQuestion: !!response?.data?.question
      });
    }
    
    // NOTE: AI probe question logging is handled in the calling code after this returns
    // when response.data.mode === 'QUESTION'
    
    return response.data;
  } catch (err) {
    console.debug('[V2 PROBING][ERROR]', {
      packId,
      fieldKey,
      errorMessage: err?.message,
      errorName: err?.name,
      errorStack: err?.stack?.substring?.(0, 200)
    });
    console.error('[AI-FOLLOWUP][V2-ERROR]', {
      packId,
      fieldKey,
      message: err?.message
    });
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
  
  // NEW: Section-based state
  const [sections, setSections] = useState([]);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [completedSectionsCount, setCompletedSectionsCount] = useState(0);
  const activeSection = sections[currentSectionIndex] || null;
  
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
  // NEW: Pending probe state - holds probe metadata until candidate answers
  // Question is NOT added to transcript until the answer is submitted
  const [pendingProbe, setPendingProbe] = useState(null);
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
  const [pendingSectionTransition, setPendingSectionTransition] = useState(null);

  // Refs
  const historyRef = useRef(null);
  const displayOrderRef = useRef(0);
  const inputRef = useRef(null);
  const yesButtonRef = useRef(null);
  const noButtonRef = useRef(null);
  const unsubscribeRef = useRef(null);
  const typingTimeoutRef = useRef(null); // Typing timeout (4 min)
  const aiResponseTimeoutRef = useRef(null); // AI response timeout (45s)
  
  // IDE v1 state
  const [interviewMode, setInterviewMode] = useState("DETERMINISTIC");
  const [ideEnabled, setIdeEnabled] = useState(false);
  const [currentIncidentId, setCurrentIncidentId] = useState(null);
  const [inIdeProbingLoop, setInIdeProbingLoop] = useState(false);
  const [currentIdeQuestion, setCurrentIdeQuestion] = useState(null);
  const [currentIdeCategoryId, setCurrentIdeCategoryId] = useState(null);
  
  // NEW: Track global display numbers for questions
  const displayNumberMapRef = useRef({}); // Map question_id -> display number
  
  // QUESTION-LEVEL PROGRESS: Track answered questions vs total
  const totalQuestionsAllSections = engine?.TotalQuestions || 0;
  const answeredQuestionsAllSections = React.useMemo(
    () => transcript.filter(t => t.type === 'question').length,
    [transcript]
  );
  const questionCompletionPct = totalQuestionsAllSections > 0
    ? Math.round((answeredQuestionsAllSections / totalQuestionsAllSections) * 100)
    : 0;
  
  console.log('[QUESTION-PROGRESS]', {
    answeredQuestionsAllSections,
    totalQuestionsAllSections,
    questionCompletionPct
  });
  
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
      // Step 0: Load system config and determine interview mode
      const { config } = await getSystemConfig();
      let effectiveMode = await getEffectiveInterviewMode({ 
        isSandbox: false, // Set to true if you have sandbox detection logic
        departmentCode: null // Will be set after loading session
      });
      
      // Force AI Probing in Preview/Sandbox when enabled in config
      const isSandboxLike = window?.location?.href?.includes('/preview');
      if (isSandboxLike && config.sandboxAiProbingOnly) {
        effectiveMode = "AI_PROBING";
        console.log("[IDE] Forcing AI_PROBING mode in sandbox/preview");
      }
      
      setInterviewMode(effectiveMode);
      
      // Determine if IDE v1 is enabled for this session
      const ideActive = effectiveMode === "AI_PROBING" || effectiveMode === "HYBRID";
      setIdeEnabled(ideActive);
      
      console.log("[IDE] Interview mode initialized", { 
        effectiveMode, 
        ideActive,
        isSandboxLike,
        sandboxOnly: config.sandboxAiProbingOnly 
      });
      
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
      
      // Step 2.5: Build sections from engine metadata (using hoisted helper)
      try {
        const orderedSections = buildSectionsFromEngine(engineData);
        setSections(orderedSections);
        
        if (orderedSections.length > 0) {
          // Determine initial section index from session state
          const initialSectionIndex = determineInitialSectionIndex(orderedSections, loadedSession, engineData);
          setCurrentSectionIndex(initialSectionIndex);
        } else {
          console.warn('[SECTIONS] No sections built - using legacy flow');
        }
      } catch (sectionErr) {
        console.error('[SECTIONS] Error initializing sections:', sectionErr);
        // Continue with legacy flow (sections will be empty array)
      }
      
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

    // Build answered questions set for section-flow navigation
    const answeredQuestionIds = new Set(
      transcript.filter(t => t.type === 'question').map(t => t.questionId)
    );

    // NEW: Section-first navigation
    if (sections.length > 0) {
      const nextResult = getNextQuestionInSectionFlow({
        sections,
        currentSectionIndex,
        currentQuestionId: baseQuestionId,
        answeredQuestionIds
      });

      console.log('[SECTION-FLOW][ADVANCE]', {
        from: baseQuestionId,
        currentSectionIndex,
        result: nextResult
      });

      if (nextResult.mode === 'QUESTION') {
        // Regular question advancement (same section or new section)
        const newTranscript = [...transcript];
        
        setCurrentSectionIndex(nextResult.nextSectionIndex);
        setQueue([]);
        setCurrentItem({ id: nextResult.nextQuestionId, type: 'question' });
        await persistStateToDatabase(newTranscript, [], { id: nextResult.nextQuestionId, type: 'question' });
        return;
      } else if (nextResult.mode === 'SECTION_TRANSITION') {
        // Section complete - add enhanced completion message with progress
        const whatToExpect = WHAT_TO_EXPECT[nextResult.nextSection.id] || 'important background information';
        
        // Update completed sections count (nextSectionIndex is 0-based)
        setCompletedSectionsCount(prev => Math.max(prev, nextResult.nextSectionIndex));
        
        const totalSectionsCount = sections.length;
        const answeredQuestionsCount = transcript.filter(t => t.type === 'question').length + 1;
        const totalQuestionsCount = engine?.TotalQuestions || 0;
        
        console.log('[SECTION-COMPLETE][STATE]', {
          nextSectionIndex: nextResult.nextSectionIndex,
          completedSectionsWillBe: nextResult.nextSectionIndex
        });
        
        console.log('[SECTION-PROGRESS][AFTER-ADVANCE]', {
          baseQuestionId,
          completedSectionName: nextResult.completedSection.displayName,
          nextSectionName: nextResult.nextSection.displayName,
          headerProgress: {
            completedSections: nextResult.nextSectionIndex,
            totalSections: totalSectionsCount,
            percent: Math.round((nextResult.nextSectionIndex / totalSectionsCount) * 100)
          },
          cardProgress: {
            completedSections: nextResult.nextSectionIndex,
            totalSections: totalSectionsCount,
            answeredQuestions: answeredQuestionsCount,
            totalQuestions: totalQuestionsCount
          }
        });
        
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
        
        // Set pending transition - footer button will advance
        setPendingSectionTransition({
          nextSectionIndex: nextResult.nextSectionIndex,
          nextQuestionId: nextResult.nextQuestionId,
          nextSectionName: nextResult.nextSection.displayName
        });
        
        setQueue([]);
        setCurrentItem(null); // Clear current item while waiting for acknowledgment
        await persistStateToDatabase(newTranscript, [], null);
        return;
      } else {
        // Interview complete
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

    // FALLBACK: Legacy flow if sections not available
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
  }, [engine, transcript, sections, currentSectionIndex, queue, currentItem]);

  const onFollowupPackComplete = useCallback(async (baseQuestionId, packId) => {
    const question = engine.QById[baseQuestionId];
    if (!question) {
      advanceToNextBaseQuestion(baseQuestionId);
      return;
    }
    
    console.log('[V2 PROBE DECISION] Pack completed, checking if probing needed', {
      baseQuestionId,
      packId,
      questionCode: question?.question_id
    });
    
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

    if (DEBUG_MODE) {
      console.log('[AI-FOLLOWUP][INVOKE-START]', {
        functionName: 'interviewAiFollowup',
        interviewId,
        questionId,
        followupPackId
      });
    }

    try {
      const response = await base44.functions.invoke("interviewAiFollowup", {
        interviewId,
        questionId,
        followupPackId,
        transcriptWindow,
        candidateAnswer,
        mode: "FOLLOWUP_PROBE"
      });

      if (DEBUG_MODE) {
        console.log('[AI-FOLLOWUP][INVOKE-RESPONSE]', {
          status: response?.data?.status,
          hasData: !!response?.data
        });
      }

      return response.data;
    } catch (err) {
      console.error('[AI-FOLLOWUP][INVOKE-ERROR]', {
        interviewId,
        questionId,
        followupPackId,
        message: err?.message
      });
      return { status: 'error', errorMessage: err?.message };
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
    if (DEBUG_MODE) {
      console.log('[AI-FOLLOWUP][ENTRY]', {
        questionId,
        packId,
        instanceNumber,
        sessionId
      });
    }
    
    // Check if AI is disabled for this session
    if (aiProbingDisabledForSession) {
      if (DEBUG_MODE) console.log('[AI-FOLLOWUP] Disabled for session');
      return false;
    }
    
    const packInstanceKey = `${packId}#${instanceNumber}`;
    setAiProbingPackInstanceKey(packInstanceKey);

    // ============================================================================
    // V2 PACK PROBING DECISION - Metadata-Driven (Not Pack-Specific)
    // Check if this pack uses per-field probing OR has V2 metadata
    // ============================================================================
    const isV2PerFieldPack = useProbeEngineV2(packId);
    const v2PackMeta = engine?.V2Packs?.find(p => p.followup_pack_id === packId);
    const hasV2Metadata = !!v2PackMeta;
    const isStandardCluster = v2PackMeta?.is_standard_cluster === true;
    const hasAiProbeInstructions = !!v2PackMeta?.ai_probe_instructions;
    
    console.log('[V2 PROBE DECISION] Pack metadata analysis', {
      packId,
      isV2PerFieldPack,
      hasV2Metadata,
      isStandardCluster,
      hasAiProbeInstructions,
      maxAiFollowups: v2PackMeta?.max_ai_followups,
      probingEnabled: ENABLE_LIVE_AI_FOLLOWUPS && aiProbingEnabled && !aiProbingDisabledForSession
    });
    
    // V2 per-field packs already handled probing during steps - skip pack-level probing
    if (isV2PerFieldPack) {
      console.log(`[V2 PROBE SKIP] ${packId} uses per-field probing - already handled during steps`);
      onFollowupPackComplete(questionId, packId);
      return true;
    }

    // NEW: Check feature flag and attempt invokeLLM-based AI (lightweight alternative)
    // This is pack-level probing for LEGACY packs (not V2 per-field packs)
    if (ENABLE_LIVE_AI_FOLLOWUPS) {
      console.log('[V2 PROBE DECISION] Legacy pack-level probing check', {
        packId,
        aiProbingEnabled,
        aiProbingDisabledForSession
      });
      
      // Check if we've reached the AI follow-up limit for this pack instance
      const countKey = `${packId}:${instanceNumber}`;
      const currentCount = aiFollowupCounts[countKey] || 0;
      
      // Get max AI followups from centralized config - SINGLE SOURCE OF TRUTH
      const maxAiFollowups = getPackMaxAiFollowups(packId);
      
      if (DEBUG_MODE) {
        console.log('[AI-FOLLOWUP][ELIGIBILITY]', { packId, currentCount, maxAiFollowups });
      }
      
      if (currentCount >= maxAiFollowups) {
        if (DEBUG_MODE) console.log('[AI-FOLLOWUP] Max quota reached for', packId);
        return false;
      }
      
      const lastFollowUpAnswer = followUpAnswers[followUpAnswers.length - 1];
      const transcriptWindow = buildTranscriptWindowForAi(questionId, packId);
      
      let aiResult;
      try {
        aiResult = await requestLiveAiFollowup({
          interviewId: sessionId,
          questionId,
          followupPackId: packId,
          transcriptWindow,
          candidateAnswer: lastFollowUpAnswer?.answer || ''
        });
        
        if (DEBUG_MODE) {
          console.log('[AI-FOLLOWUP][RESPONSE]', {
            packId,
            status: aiResult?.status,
            hasFollowupQuestion: !!aiResult?.followupQuestion
          });
        }
      } catch (aiErr) {
        console.error('[AI-FOLLOWUP][ERROR]', {
          packId,
          questionId,
          message: aiErr?.message
        });
        // Don't throw - fall through to agent-based or skip
        aiResult = { status: 'error', error: aiErr?.message };
      }
      
      if (aiResult?.status === 'ok' && aiResult.followupQuestion) {
        if (DEBUG_MODE) console.log('[AI-FOLLOWUP][SUCCESS]', { packId, questionId });
        
        // Increment counter for this pack instance
        setAiFollowupCounts(prev => ({
          ...prev,
          [countKey]: currentCount + 1
        }));
        
        // Add AI question to transcript with stable unique ID
        // Uses same event structure as LE_APPS for UnifiedTranscriptRenderer compatibility
        const aiQuestionEntry = {
          id: `ai-q-${questionId}-${packId}-${instanceNumber}-1-${Date.now()}`,
          type: 'ai_question',
          content: aiResult.followupQuestion,
          questionId: questionId,
          baseQuestionId: questionId,
          packId: packId,
          timestamp: new Date().toISOString(),
          kind: 'ai_probe_question',
          role: 'investigator',
          label: 'AI Investigator',
          text: aiResult.followupQuestion,
          followupPackId: packId,
          instanceNumber: instanceNumber,
          probeIndex: 0, // First probe is 0-indexed
          isProbe: true
        };
        
        if (DEBUG_MODE) console.debug('[AI-PROBE] Added question event');

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
        if (DEBUG_MODE) console.log('[AI-FOLLOWUP] No followup generated', { packId });
      }
      }
    
    // Create a fresh AI conversation JUST for this pack instance
    try {
      const aiConfig = getAiAgentConfig(session.department_code);

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
      if (DEBUG_MODE) console.log('[AI] Mini-session created:', newConversation.id);
    
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

    await base44.agents.addMessage(newConversation, {
      role: 'user',
      content: summaryMessage
    });

    // Subscribe to this specific conversation
    const unsubscribe = base44.agents.subscribeToConversation(
      newConversation.id,
      (data) => {
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
      if (DEBUG_MODE) console.log(`[AI] Saving ${exchanges.length} probing exchanges`);
      
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
        
        const updatedDetails = {
          ...(followUpResponse.additional_details || {}),
          investigator_probing: exchanges
        };
        
        await base44.entities.FollowUpResponse.update(followUpResponse.id, {
          additional_details: updatedDetails
        });
        
        if (DEBUG_MODE) console.log(`[AI] Saved ${exchanges.length} probing exchanges`);
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
      if (DEBUG_MODE) console.log(`[AI] Saving probing for ${questionId}/${packId}`);
      
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
      
      if (DEBUG_MODE) console.log(`[AI] Extracted ${exchanges.length} probing exchanges`);
      
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
            
            const updatedDetails = {
              ...(followUpResponse.additional_details || {}),
              investigator_probing: exchanges
            };
            
            // Save probing to this instance's additional_details
            await base44.entities.FollowUpResponse.update(followUpResponse.id, {
              additional_details: updatedDetails
            });
            
            if (DEBUG_MODE) console.log(`[AI] Saved ${exchanges.length} probing exchanges`);
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
      if (DEBUG_MODE) console.log('[AI] Handoff marker detected, completing probing');
      
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

      if (DEBUG_MODE) console.log('[AI] Agent sent next base question (legacy):', nextQuestionId);

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
      return;
    }

    setIsCommitting(true);
    setValidationHint(null);
    
    // Clear section completion message when answering any question
    if (sectionCompletionMessage) {
      setSectionCompletionMessage(null);
    }

    try {
      if (DEBUG_MODE) console.log(`[ANSWER] Processing ${currentItem.type}:`, value);

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
        
        // SECTION-AWARE: Remove old section transition detection (now handled in advanceToNextBaseQuestion)

        // CRITICAL FIX: Handle "Yes" and "No" answers distinctly for follow-up triggering
        if (value === 'Yes') {
          const followUpResult = checkFollowUpTrigger(engine, currentItem.id, value);

          if (followUpResult) {
            const { packId, substanceName } = followUpResult;
            
            // ============================================================================
            // IDE v1 INTEGRATION: Check if this category should use AI probing
            // ============================================================================
            const categoryId = mapPackIdToCategory(packId);
            
            if (ideEnabled && categoryId) {
              console.log("[IDE] Checking fact model for category", { categoryId, packId });
              
              const factModel = await getFactModelForCategory(categoryId);
              
              if (factModel && factModel.isReadyForAiProbing) {
                console.log("[IDE] Category ready for AI probing - initiating IDE v1 flow", { 
                  categoryId, 
                  packId,
                  mode: interviewMode 
                });
                
                // Start IDE v1 probing loop instead of deterministic follow-ups
                try {
                  const ideResult = await base44.functions.invoke('decisionEngineProbe', {
                    sessionId: sessionId,
                    categoryId: categoryId,
                    incidentId: null, // First probe - let backend create incident
                    latestAnswer: value, // "Yes" - the base answer
                    questionContext: {
                      questionId: currentItem.id,
                      questionCode: question.question_id,
                      sectionId: question.section_id
                    }
                  });
                  
                  console.log("[IDE] Initial probe result", { 
                    continue: ideResult.continue,
                    incidentId: ideResult.incidentId,
                    hasNextQuestion: !!ideResult.nextQuestion
                  });
                  
                  if (ideResult.continue && ideResult.nextQuestion) {
                    // Set IDE probing state
                    setCurrentIncidentId(ideResult.incidentId);
                    setCurrentIdeCategoryId(categoryId);
                    setCurrentIdeQuestion(ideResult.nextQuestion);
                    setInIdeProbingLoop(true);
                    
                    // Keep current item active (don't advance base question yet)
                    // The next prompt will be from currentIdeQuestion
                    await persistStateToDatabase(newTranscript, [], currentItem);
                    setIsCommitting(false);
                    setInput("");
                    
                    // Don't save base answer to DB yet - IDE will handle it
                    return;
                  } else if (ideResult.reason === "FACT_MODEL_NOT_READY" && interviewMode === "HYBRID") {
                    // Hybrid mode fallback to deterministic
                    console.log("[IDE] Falling back to deterministic for", categoryId);
                    // Continue to normal deterministic flow below
                  } else {
                    // IDE probing complete or not needed - advance normally
                    console.log("[IDE] No probing needed, advancing");
                    advanceToNextBaseQuestion(currentItem.id);
                    setIsCommitting(false);
                    setInput("");
                    saveAnswerToDatabase(currentItem.id, value, question);
                    return;
                  }
                } catch (ideError) {
                  console.error("[IDE] Error calling decision engine", ideError);
                  
                  if (interviewMode === "HYBRID") {
                    // Hybrid mode fallback to deterministic
                    console.log("[IDE] Error - falling back to deterministic");
                    // Continue to normal deterministic flow below
                  } else {
                    // AI_PROBING mode - skip this incident and move on
                    console.log("[IDE] Error in AI_PROBING mode - skipping incident");
                    advanceToNextBaseQuestion(currentItem.id);
                    setIsCommitting(false);
                    setInput("");
                    saveAnswerToDatabase(currentItem.id, value, question);
                    return;
                  }
                }
              } else if (ideEnabled && interviewMode === "HYBRID") {
                console.log("[IDE] Fact model not ready - using deterministic fallback", { categoryId, packId });
                // Continue to deterministic flow below
              }
            }
            // ============================================================================
            // END IDE v1 INTEGRATION
            // ============================================================================
            
            // IDEMPOTENCY: Check if this pack was already triggered for this base question
            const triggerKey = `${currentItem.id}:${packId}`;
            if (triggeredPacksRef.current.has(triggerKey)) {
            if (DEBUG_MODE) console.log(`[SKIP] Duplicate pack trigger for ${packId}`);
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
            if (DEBUG_MODE) console.log(`[FOLLOWUP] Triggered: ${packId}`);
            
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
              console.error(`Invalid pack ${packId} - advancing to next question`);
              const nextQuestionId = computeNextQuestionId(engine, currentItem.id, value);
              if (nextQuestionId && engine.QById[nextQuestionId]) {
                setQueue([]);
                setCurrentItem({ id: nextQuestionId, type: 'question' });
                await persistStateToDatabase(newTranscript, [], { id: nextQuestionId, type: 'question' });
              } else {
                // No next question - interview complete
                setCurrentItem(null);
                setQueue([]);
                await persistStateToDatabase(newTranscript, [], null);
                setShowCompletionModal(true);
              }
            }
          } else {
            // No follow-up triggered - advance within section or to next section
            advanceToNextBaseQuestion(currentItem.id);
          }
          } else {
          // "No" answer - advance within section or to next section
          advanceToNextBaseQuestion(currentItem.id);
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
        
        const instanceNumber = currentItem.instanceNumber || 1;
        const fieldKey = step.Field_Key;
        
        console.log('[HANDLE_ANSWER][FOLLOWUP-ENTRY]', {
          questionId: currentItem.id,
          packId,
          fieldKey,
          instanceNumber,
          isV2Pack: useProbeEngineV2(packId) || packId === 'PACK_PRIOR_LE_APPS_STANDARD'
        });

        // Auto-fill substance_name field if prefilled
        if (step.PrefilledAnswer && step.Field_Key === 'substance_name') {
          if (DEBUG_MODE) console.log(`[AUTO-FILL] substance_name`);
          
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

        // ============================================================================
        // V2 PER-FIELD PROBING FOR PACK_LE_APPS & DRIVING PACKS
        // ============================================================================

        const isV2Pack = useProbeEngineV2(packId);

        console.log('[V2 PROBING][PACK-CHECK]', {
          packId,
          isV2Pack,
          useProbeEngineV2Result: useProbeEngineV2(packId)
        });

        if (isV2Pack) {
          const probeKey = getFieldProbeKey(packId, instanceNumber, fieldKey);

          // StrictMode guard: don't double-probe the same field
          if (v2ProbingInProgressRef.current.has(probeKey)) {
            if (DEBUG_MODE) console.log('[V2] Already probing field', { packId, fieldKey, instanceNumber });
            setIsCommitting(false);
            return;
          }

          // Build incident context from all answers so far (including this one)
          const incidentContext = { ...currentFollowUpAnswers, [fieldKey]: normalizedAnswer };

          // Semantic validation (still useful as a hint to the backend)
          const semanticResult = validateFollowupValue({
            packId,
            fieldKey,
            rawValue: normalizedAnswer
          });

          const { isEmpty, isNoRecall } = semanticResult || {};

          // Centralized per-pack max followups
          const maxAiFollowups = getPackMaxAiFollowups(packId);

          // Per-field probe counter key
          const fieldCountKey = `${packId}:${fieldKey}:${instanceNumber}`;
          const probeCount = aiFollowupCounts[fieldCountKey] || 0;

          // Deep debug entry point
          console.log('[V2 PROBING][FIELD-ENTRY]', {
            packId,
            fieldKey,
            instanceNumber,
            sessionId,
            normalizedAnswerPreview: normalizedAnswer?.substring?.(0, 80) || normalizedAnswer,
            normalizedAnswerLength: normalizedAnswer?.length || 0,
            semanticStatus: semanticResult?.status,
            isEmpty,
            isNoRecall,
            probeCount,
            maxAiFollowups
          });

          if (DEBUG_MODE) {
            console.log('[AI-FOLLOWUP][V2-FIELD-ENTRY]', {
              packId,
              fieldKey,
              instanceNumber,
              probeCount,
              maxAiFollowups
            });
          }

          logAiProbeDebug('semanticResult', {
            packId,
            fieldKey,
            instanceNumber,
            status: semanticResult?.status,
            isEmpty,
            isNoRecall,
            normalizedAnswer,
            probeCount,
            maxAiFollowups
          });

          // Helper: complete field WITHOUT probing (save + mark complete)
          const completeV2FieldWithoutProbe = async () => {
            if (DEBUG_MODE) console.log('[V2] Completing field without probe', { packId, fieldKey, instanceNumber });

            await saveFollowUpAnswer(
              packId,
              fieldKey,
              semanticResult?.normalizedValue ?? normalizedAnswer,
              substanceName,
              instanceNumber,
              'user'
            );

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

            setCurrentFollowUpAnswers(prev => ({
              ...prev,
              [fieldKey]: semanticResult?.normalizedValue ?? normalizedAnswer
            }));
          };

          // ===================== FRONTEND DECISION LAYER =====================
          // 1) If AI is globally disabled or disabled for this session -> never probe
          // 2) If field has hit its probe quota -> never probe
          // 3) Otherwise -> ALWAYS call backend; backend decides whether to probe
          // ==================================================================

          const canCallBackend =
            ENABLE_LIVE_AI_FOLLOWUPS &&
            aiProbingEnabled &&
            !aiProbingDisabledForSession &&
            probeCount < maxAiFollowups;

          console.log('[V2 PROBING][DECISION]', {
            packId,
            fieldKey,
            instanceNumber,
            canCallBackend,
            flags: {
              ENABLE_LIVE_AI_FOLLOWUPS,
              aiProbingEnabled,
              aiProbingDisabledForSession
            },
            counters: {
              probeCount,
              maxAiFollowups
            }
          });

          if (DEBUG_MODE) {
            console.log('[V2 DECISION]', {
              fieldKey,
              canCallBackend,
              probeCount,
              maxAiFollowups
            });
          }

          // Case 1: AI disabled or session disabled
          if (!ENABLE_LIVE_AI_FOLLOWUPS || !aiProbingEnabled || aiProbingDisabledForSession) {
            console.log('[V2 PROBING][SKIP]', {
              reason: 'AI disabled (global or session)',
              packId,
              fieldKey,
              flags: { ENABLE_LIVE_AI_FOLLOWUPS, aiProbingEnabled, aiProbingDisabledForSession }
            });

            await completeV2FieldWithoutProbe();
            // Do NOT return – let the normal follow-up flow advance below
          }
          // Case 2: Field has hit probe quota
          else if (probeCount >= maxAiFollowups) {
            console.log('[V2 PROBING][SKIP]', {
              reason: 'Max probes quota hit',
              packId,
              fieldKey,
              probeCount,
              maxAiFollowups
            });

            await completeV2FieldWithoutProbe();
            // Do NOT return – let the normal follow-up flow advance below
          }
          // Case 3: Call backend and let it decide
          else {
            try {
              console.debug('[V2 PROBING][CALL]', {
                reason: 'Backend decides if probing is needed',
                packId,
                fieldKey,
                instanceNumber,
                probeCount,
                maxAiFollowups,
                semanticStatus: semanticResult?.status,
                isEmpty,
                isNoRecall
              });

              logAiProbeDebug('triggerBackendCheck', {
                packId,
                fieldKey,
                instanceNumber,
                probeCount,
                maxAiFollowups,
                isEmpty,
                isNoRecall,
                status: semanticResult?.status
              });

              v2ProbingInProgressRef.current.add(probeKey);

              const t0 = performance.now();
              
              // Get section context for topic-anchored probing
              const question = engine.QById[currentItem.baseQuestionId || currentItem.id];
              const sectionEntity = engine.Sections?.find(s => s.id === question?.section_id);
              
              const v2Result = await callProbeEngineV2PerField(base44, {
                packId,
                fieldKey,
                fieldValue: semanticResult?.normalizedValue ?? normalizedAnswer,
                previousProbesCount: probeCount,
                incidentContext,
                semanticStatus: semanticResult?.status,
                isEmpty,
                isNoRecall,
                sectionName: sectionEntity?.section_name || null,
                baseQuestionText: question?.question_text || null,
                questionDbId: question?.id || null,
                questionCode: question?.question_id || null
              });
              const t1 = performance.now();
              
              console.log('[V2 PROBING][FRONTEND] Per-field probe latency (ms):', (t1 - t0).toFixed(0), {
                packId,
                fieldKey,
                instanceNumber,
                probeCount
              });

              const mode = v2Result?.mode;
              const rawQuestion = typeof v2Result?.question === 'string' ? v2Result.question.trim() : '';
              const hasProbeQuestion = rawQuestion.length > 0;

              console.log('[V2 PROBING][BACKEND-DECISION]', {
                packId,
                fieldKey,
                mode,
                hasProbeQuestion,
                rawQuestionLength: rawQuestion?.length || 0,
                willShowProbe: mode === 'QUESTION' || hasProbeQuestion,
                willComplete: mode === 'COMPLETE' || mode === 'VALIDATED'
              });

              // Backend says: show AI probe
              if (mode === 'QUESTION' || hasProbeQuestion) {
                if (DEBUG_MODE) console.log('[V2] Backend requested probe for field', fieldKey);

                setAiFollowupCounts(prev => ({
                  ...prev,
                  [fieldCountKey]: probeCount + 1
                }));

                setInput('');

                const followupQuestionEntry = createChatEvent('followup_question', {
                  questionId: currentItem.id,
                  questionText: step.Prompt,
                  packId,
                  substanceName,
                  kind: 'deterministic_followup_question',
                  text: step.Prompt,
                  content: step.Prompt,
                  fieldKey,
                  followupPackId: packId,
                  instanceNumber,
                  baseQuestionId: currentItem.baseQuestionId
                });

                const followupAnswerEntry = createChatEvent('followup_answer', {
                  questionId: currentItem.id,
                  packId,
                  substanceName,
                  kind: 'deterministic_followup_answer',
                  answer: normalizedAnswer,
                  text: normalizedAnswer,
                  content: normalizedAnswer,
                  fieldKey,
                  followupPackId: packId,
                  instanceNumber,
                  baseQuestionId: currentItem.baseQuestionId
                });

                const followupEntry = {
                  ...followupQuestionEntry,
                  type: 'followup',
                  answer: normalizedAnswer,
                  text: normalizedAnswer
                };

                const probeText = rawQuestion;

                const pendingProbeData = {
                  packId,
                  fieldKey,
                  instanceNumber,
                  probeIndex: probeCount,
                  questionText: probeText,
                  baseQuestionId: currentItem.baseQuestionId,
                  probeEngineVersion: 'v2-per-field'
                };

                setPendingProbe(pendingProbeData);

                const newTranscript = [...transcript, followupEntry];
                setTranscript(newTranscript);

                setFieldProbingState(prev => ({
                  ...prev,
                  [probeKey]: {
                    probeCount: probeCount + 1,
                    lastQuestion: probeText,
                    isProbing: true
                  }
                }));

                setCurrentFollowUpAnswers(prev => ({
                  ...prev,
                  [fieldKey]: normalizedAnswer
                }));

                setCurrentFieldProbe({
                  packId,
                  instanceNumber,
                  fieldKey,
                  semanticField: v2Result.semanticField,
                  question: probeText,
                  baseQuestionId: currentItem.baseQuestionId,
                  substanceName,
                  currentItem
                });

                await saveFollowUpAnswer(
                  packId,
                  fieldKey,
                  semanticResult?.normalizedValue ?? normalizedAnswer,
                  substanceName,
                  instanceNumber,
                  'user'
                );

                await persistStateToDatabase(newTranscript, queue, currentItem);

                setIsWaitingForAgent(true);
                setIsInvokeLLMMode(true);
                setIsCommitting(false);
                v2ProbingInProgressRef.current.delete(probeKey);
                return; // important: stop normal follow-up flow while AI probe is active
              }

              // Backend says: no probe needed, field is complete
              v2ProbingInProgressRef.current.delete(probeKey);
              console.log('[V2 PROBING][COMPLETE-NO-PROBE]', { packId, fieldKey, instanceNumber, mode });
              await completeV2FieldWithoutProbe();
              // Do NOT return – let normal follow-up flow advance below

            } catch (err) {
              console.error('[AI-FOLLOWUP][V2-ERROR]', { packId, fieldKey, error: err?.message });
              v2ProbingInProgressRef.current.delete(probeKey);

              // Fail open: save and move on
              await completeV2FieldWithoutProbe();
              // Do NOT return – let normal follow-up flow advance below
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
          if (DEBUG_MODE) console.log(`[PACK] ${packId} completed`);
          
          // NEW: Check if we should skip probing for PACK_LE_APPS when hired
          if (shouldSkipProbingForHired(packId, updatedFollowUpAnswers)) {
            if (DEBUG_MODE) console.log('[SKIP] PACK_LE_APPS hired, no probing');
            
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
              if (DEBUG_MODE) console.log('[AI] Using stored baseQuestionId for handoff');
              
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
                if (DEBUG_MODE) console.log('[AI] Handoff failed, advancing to next question');
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
                if (DEBUG_MODE) console.log('[FALLBACK] Using baseQuestionId from transcript');
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
            if (DEBUG_MODE) console.log('[MI] Creating new instance', instanceNumber + 1);

            // Re-trigger the same follow-up pack for new instance
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
            if (DEBUG_MODE) console.log('[MI] Stopping multi-instance, advancing');

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

  // NEW: Handle IDE v1 probing answers
  const handleIdeAnswer = useCallback(async (value) => {
    if (isCommitting || !inIdeProbingLoop) return;
    
    setIsCommitting(true);
    
    try {
      console.log("[IDE] Submitting probe answer", { 
        incidentId: currentIncidentId,
        categoryId: currentIdeCategoryId,
        answerLength: value.length 
      });
      
      // Call decision engine with the probe answer
      const ideResult = await base44.functions.invoke('decisionEngineProbe', {
        sessionId: sessionId,
        categoryId: currentIdeCategoryId,
        incidentId: currentIncidentId,
        latestAnswer: value,
        questionContext: {}
      });
      
      // Add probe Q&A to transcript
      const probeQuestionEntry = createChatEvent('ai_probe_question', {
        content: currentIdeQuestion,
        text: currentIdeQuestion,
        kind: 'ai_probe_question',
        categoryId: currentIdeCategoryId,
        incidentId: currentIncidentId,
        baseQuestionId: currentItem?.id,
        isProbe: true
      });
      
      const probeAnswerEntry = createChatEvent('ai_probe_answer', {
        content: value,
        text: value,
        kind: 'ai_probe_answer',
        categoryId: currentIdeCategoryId,
        incidentId: currentIncidentId,
        baseQuestionId: currentItem?.id,
        isProbe: true
      });
      
      const newTranscript = [...transcript, probeQuestionEntry, probeAnswerEntry];
      setTranscript(newTranscript);
      
      console.log("[IDE] Probe result", {
        continue: ideResult.continue,
        stopReason: ideResult.stopReason,
        hasNextQuestion: !!ideResult.nextQuestion,
        completionPercent: ideResult.completionPercent
      });
      
      if (ideResult.continue && ideResult.nextQuestion) {
        // Continue probing - show next question
        setCurrentIdeQuestion(ideResult.nextQuestion);
        await persistStateToDatabase(newTranscript, [], currentItem);
      } else {
        // Probing complete - exit IDE loop and advance
        console.log("[IDE] Probing complete for incident", { 
          incidentId: currentIncidentId,
          stopReason: ideResult.stopReason 
        });
        
        setInIdeProbingLoop(false);
        setCurrentIdeQuestion(null);
        setCurrentIncidentId(null);
        setCurrentIdeCategoryId(null);
        
        await persistStateToDatabase(newTranscript, [], null);
        
        // Advance to next base question
        if (currentItem?.id) {
          advanceToNextBaseQuestion(currentItem.id);
        }
      }
      
    } catch (err) {
      console.error("[IDE] Error in probe answer handling", err);
      
      // On error, exit IDE loop and continue interview
      setInIdeProbingLoop(false);
      setCurrentIdeQuestion(null);
      setCurrentIncidentId(null);
      setCurrentIdeCategoryId(null);
      
      if (currentItem?.id) {
        advanceToNextBaseQuestion(currentItem.id);
      }
    } finally {
      setIsCommitting(false);
      setInput("");
    }
  }, [isCommitting, inIdeProbingLoop, currentIncidentId, currentIdeCategoryId, currentIdeQuestion, sessionId, transcript, currentItem, advanceToNextBaseQuestion]);

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
      
      if (DEBUG_MODE) console.log(`[V2] Processing probe answer for ${fieldKey}`);
      
      // Get max AI followups from centralized config - SINGLE SOURCE OF TRUTH
      const maxAiFollowups = getPackMaxAiFollowups(packId);
      const packConfig = FOLLOWUP_PACK_CONFIGS[packId];
      const fieldConfig = packConfig?.fields?.find(f => f.fieldKey === fieldKey);
      
      // Get probe count from aiFollowupCounts using per-field key
      const fieldCountKey = `${packId}:${fieldKey}:${instanceNumber}`;
      const probeCount = aiFollowupCounts[fieldCountKey] || 0;
      
      // NEW: Now that candidate answered, log BOTH the probe question AND answer as a pair
      // This is the ONLY place probe events get added to transcript
      const currentProbeQuestion = currentFieldProbe.question;
      
      // Determine probeIndex from pendingProbe if available, else use probeCount - 1
      const probeIndex = pendingProbe?.probeIndex ?? (probeCount - 1);
      
      // Create AI probe QUESTION event (was pending, now being logged)
      const aiQuestionEntry = createChatEvent('ai_probe_question', {
        questionId: baseQuestionId,
        baseQuestionId: baseQuestionId,
        packId: packId,
        content: currentProbeQuestion,
        text: currentProbeQuestion,
        kind: 'ai_probe_question',
        followupPackId: packId,
        instanceNumber: instanceNumber,
        fieldKey: fieldKey,
        probeIndex: probeIndex,
        probeEngineVersion: pendingProbe?.probeEngineVersion || 'v2-per-field',
        isProbe: true
      });
      aiQuestionEntry.type = 'ai_question';
      aiQuestionEntry.role = 'investigator';
      aiQuestionEntry.label = 'AI Investigator';
      
      // Create AI probe ANSWER event
      const aiAnswerEntry = createChatEvent('ai_probe_answer', {
        questionId: baseQuestionId,
        baseQuestionId: baseQuestionId,
        packId: packId,
        content: value,
        text: value,
        kind: 'ai_probe_answer',
        followupPackId: packId,
        instanceNumber: instanceNumber,
        fieldKey: fieldKey,
        probeIndex: probeIndex,
        isProbe: true
      });
      aiAnswerEntry.type = 'ai_answer';
      aiAnswerEntry.role = 'candidate';
      aiAnswerEntry.label = 'Candidate';
      
      if (DEBUG_MODE) console.debug('[AI-PROBE] Added Q&A pair');
      
      // Clear pendingProbe after logging
      setPendingProbe(null);
      
      // Add BOTH question and answer to transcript as a pair
      setTranscript(prev => [...prev, aiQuestionEntry, aiAnswerEntry]);
      
      const updatedAnswers = { ...currentFollowUpAnswers, [fieldKey]: value };
      setCurrentFollowUpAnswers(updatedAnswers);
      
      // Run semantic validation on the probe answer
      const semanticResult = validateFollowupValue({ packId, fieldKey, rawValue: value });
      
      // Check if semantic validation passes now
      if (semanticResult.status === "valid") {
        // Valid answer - save and continue
        if (DEBUG_MODE) console.log('[V2] Probe answer valid, continuing');
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
        if (DEBUG_MODE) console.log(`[V2] Probing again (${probeCount + 1}/${maxAiFollowups})`);
        
        // Increment probe count BEFORE calling backend
        const newProbeCount = probeCount + 1;
        setAiFollowupCounts(prev => ({
          ...prev,
          [fieldCountKey]: newProbeCount
        }));
        
        setInput("");
        
        const t0 = performance.now();
        
        // Get section context for topic-anchored probing
        const question = engine.QById[baseQuestionId];
        const sectionEntity = engine.Sections?.find(s => s.id === question?.section_id);
        
        const v2Result = await callProbeEngineV2PerField(base44, {
          packId,
          fieldKey,
          fieldValue: value,
          previousProbesCount: probeCount,
          incidentContext: updatedAnswers,
          sectionName: sectionEntity?.section_name || null,
          baseQuestionText: question?.question_text || null,
          questionDbId: question?.id || null,
          questionCode: question?.question_id || null
        });
        const t1 = performance.now();
        
        console.log('[V2 PROBING][FRONTEND] Per-field probe latency (ms):', (t1 - t0).toFixed(0), {
          packId,
          fieldKey,
          instanceNumber,
          probeCount
        });
        
        if (v2Result.mode === 'QUESTION') {
          // NEW: Store subsequent probe as PENDING - do NOT add to transcript yet
          // Question will be added to transcript when candidate answers
          const nextPendingProbe = {
            packId,
            fieldKey,
            instanceNumber,
            probeIndex: probeCount, // Current probe count (0-indexed for this new probe)
            questionText: v2Result.question,
            baseQuestionId: baseQuestionId,
            probeEngineVersion: 'v2-per-field-subsequent'
          };
          
          setPendingProbe(nextPendingProbe);
          
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
      if (DEBUG_MODE) console.log(`[V2] Max probes reached for ${fieldKey}`);
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
        // Uses same event structure as LE_APPS for UnifiedTranscriptRenderer compatibility
        const probingSequence = updatedExchanges.length;
        const aiAnswerEntry = createChatEvent('ai_probe_answer', {
          questionId: currentFollowUpPack.questionId,
          baseQuestionId: currentFollowUpPack.questionId,
          packId: currentFollowUpPack.packId,
          content: value,
          text: value,
          kind: 'ai_probe_answer',
          followupPackId: currentFollowUpPack.packId,
          instanceNumber: currentFollowUpPack.instanceNumber,
          probeIndex: probingSequence - 1, // 0-indexed
          isProbe: true
        });
        // Override type for render compatibility
        aiAnswerEntry.type = 'ai_answer';
        aiAnswerEntry.label = 'Candidate';
        
        if (DEBUG_MODE) console.debug('[AI-PROBE] Added answer event');
        
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
            // Uses same event structure as LE_APPS for UnifiedTranscriptRenderer compatibility
            const nextAiQuestion = {
              id: `ai-q-${currentFollowUpPack.questionId}-${currentFollowUpPack.packId}-${currentFollowUpPack.instanceNumber}-${newExchangeIndex}-${Date.now()}`,
              type: 'ai_question',
              content: aiResult.followupQuestion,
              questionId: currentFollowUpPack.questionId,
              baseQuestionId: currentFollowUpPack.questionId,
              packId: currentFollowUpPack.packId,
              timestamp: new Date().toISOString(),
              kind: 'ai_probe_question',
              role: 'investigator',
              label: 'AI Investigator',
              text: aiResult.followupQuestion,
              followupPackId: currentFollowUpPack.packId,
              instanceNumber: currentFollowUpPack.instanceNumber,
              probeIndex: newExchangeIndex - 1, // 0-indexed
              isProbe: true
            };
            
            if (DEBUG_MODE) console.debug('[AI-PROBE] Added question event');
            
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
        if (DEBUG_MODE) console.log(`[AI] Saving ${updatedExchanges.length} exchanges`);
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
    
    if (inIdeProbingLoop) {
      handleIdeAnswer(answer);
    } else if (isWaitingForAgent) {
      handleAgentAnswer(answer);
    } else {
      handleAnswer(answer);
    }
  }, [input, inIdeProbingLoop, isWaitingForAgent, handleIdeAnswer, handleAgentAnswer, handleAnswer]);

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
      } else {
        const existing = existingFollowups[0];
        
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
  // CHAT VIRTUALIZATION COMPONENTS (VIEW-ONLY)
  // ============================================================================

  /**
   * Plain (non-virtualized) transcript renderer - BASELINE FALLBACK
   * Used when ENABLE_CHAT_VIRTUALIZATION = false
   */
  function PlainTranscript({ transcript, getQuestionDisplayNumber, getFollowUpPackName, sessionId }) {
    return (
      <>
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
      </>
    );
  }

  /**
   * Virtualized transcript renderer - PERFORMANCE OPTIMIZATION
   * Only renders visible messages + overscan buffer
   * Read-only: NEVER mutates transcript array
   */
  function VirtualizedTranscript({ transcript, getQuestionDisplayNumber, getFollowUpPackName, sessionId }) {
    const containerRef = useRef(null);

    // Safe constants for windowing
    const ITEM_HEIGHT = 100; // Average message height in pixels
    const OVERSCAN = 15; // Render 15 extra messages above/below viewport

    const [windowState, setWindowState] = useState({
      startIndex: Math.max(0, transcript.length - 50), // Start showing last 50
      endIndex: transcript.length
    });

    const totalHeight = transcript.length * ITEM_HEIGHT;

    const handleScroll = useCallback(() => {
      const el = containerRef.current;
      if (!el) return;

      const scrollTop = el.scrollTop;
      const containerHeight = el.clientHeight;

      const startIndex = Math.max(
        0,
        Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN
      );
      const endIndex = Math.min(
        transcript.length,
        Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + OVERSCAN
      );

      setWindowState(prev => 
        prev.startIndex === startIndex && prev.endIndex === endIndex
          ? prev
          : { startIndex, endIndex }
      );
    }, [transcript.length]);

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      handleScroll();
    }, [handleScroll, transcript.length]);

    const { startIndex, endIndex } = windowState;
    const visible = transcript.slice(startIndex, endIndex);

    const topSpacerHeight = startIndex * ITEM_HEIGHT;
    const bottomSpacerHeight = (transcript.length - endIndex) * ITEM_HEIGHT;

    return (
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="overflow-y-auto flex-1 px-4 py-6"
        style={{ position: 'relative' }}
      >
        <div className="max-w-5xl mx-auto">
          <div style={{ height: topSpacerHeight }} />
          <div className="space-y-4">
            {visible.map((entry, idx) => {
              const absoluteIndex = startIndex + idx;
              const keyParts = [
                sessionId || 'session',
                entry.questionId || 'no-question',
                entry.packId || entry.followupPackId || 'no-pack',
                entry.instanceNumber ?? 0,
                entry.type || 'unknown',
                entry.id || `index-${absoluteIndex}`
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
          </div>
          <div style={{ height: bottomSpacerHeight }} />
        </div>
      </div>
    );
  }

  // ============================================================================
  // DEBUG-ONLY SANITY CHECK (NO SIDE EFFECTS)
  // ============================================================================

  /**
   * Debug helper – intentionally contains NO React hooks
   * Temporarily disabled to stabilize hook order.
   * Keep this function lightweight and side-effect free for now.
   */
  function useTranscriptSanityCheck({ enabled, transcript }) {
    if (!enabled) {
      return;
    }

    // Optional: simple debug logging that does NOT use hooks
    try {
      // Only log if you want, but no hooks allowed here
      // console.debug('[SanityCheck] Transcript length:', transcript?.length ?? 0);
    } catch (e) {
      // Swallow any errors to avoid interfering with the interview flow
    }
  }

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
    // IDE v1 probing takes precedence
    if (inIdeProbingLoop && currentIdeQuestion) {
      return {
        type: 'ide_probe',
        text: currentIdeQuestion,
        responseType: 'text',
        category: currentIdeCategoryId || 'Follow-up'
      };
    }
    
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
    if (inIdeProbingLoop) {
      return "Provide your answer to the investigator's question...";
    }
    
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
  const isPendingSectionTransition = pendingSectionTransition !== null;
  
  // SIMPLIFIED: Get last unanswered agent question (for active question box only)
  const getLastAgentQuestion = useCallback(() => {
    // IDE v1 probe question takes priority
    if (inIdeProbingLoop && currentIdeQuestion) {
      return currentIdeQuestion;
    }
    
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

  // DEBUG: Log section flow state and header progress on every render
  if (sections.length > 0 && currentItem?.type === 'question') {
    console.log('[SECTION-FLOW][RENDER]', {
      currentSectionIndex,
      currentSectionId: activeSection?.id,
      currentSectionName: activeSection?.displayName,
      currentQuestionId: currentItem.id,
      totalSections: sections.length,
      questionsInSection: activeSection?.questionIds?.length || 0,
      headerProgress: {
        completedSections: completedSectionsCount,
        totalSections: sections.length,
        percent: Math.round((completedSectionsCount / sections.length) * 100)
      }
    });
  }

  // Intro phase flag
  const isIntroPhase = showStartMessage && answeredCount === 0 && currentItem?.type === 'question';
  // Resume phase flag
  const isResumePhase = showResumeMessage && currentItem?.type === 'question';

  // CRITICAL FIX: Only show Y/N buttons if:
  // 1. Current item exists
  // 2. Current prompt exists AND is of type 'question' OR 'multi_instance'
  // 3. Question response_type is 'yes_no'
  // 4. NOT in agent mode OR IDE probing mode
  const isYesNoQuestion = (currentPrompt?.type === 'question' && currentPrompt?.responseType === 'yes_no' && !isWaitingForAgent && !inIdeProbingLoop) ||
                          (currentPrompt?.type === 'multi_instance' && !isWaitingForAgent && !inIdeProbingLoop);
  const isFollowUpMode = currentPrompt?.type === 'followup';
  const isMultiInstanceMode = currentPrompt?.type === 'multi_instance';
  const isIdeProbingMode = currentPrompt?.type === 'ide_probe';
  const requiresClarification = validationHint !== null;

  // DEBUG-ONLY: Sanity check for virtualization (no side effects)
  // Hook always called for stable hook count; conditional logic is internal
  useTranscriptSanityCheck({ 
    enabled: DEBUG_MODE && ENABLE_CHAT_VIRTUALIZATION, 
    transcript 
  });
  
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
              {/* Segmented Overall Bar - uses stateful completedSectionsCount */}
              {(() => {
                // CRITICAL: Use ONLY stateful values - no computed progress
                const headerTotalSections = sections.length || 0;
                const headerCompletedSections = completedSectionsCount;
                
                const sectionCompletionPct = headerTotalSections > 0 
                  ? Math.round((headerCompletedSections / headerTotalSections) * 100) 
                  : 0;
                
                console.log('[HEADER-SECTION-PROGRESS]', {
                  headerCompletedSections,
                  headerTotalSections,
                  sectionCompletionPct,
                  questionCompletionPct
                });
                
                // Build perSection for bar segments
                const answeredQuestionIdsSet = new Set(
                  transcript.filter(t => t.type === 'question' && t.questionId).map(t => t.questionId)
                );
                
                const perSection = sections.map((section, index) => {
                  const sectionQuestionIds = section.questionIds || [];
                  const totalQuestions = sectionQuestionIds.length;
                  const answeredQuestions = sectionQuestionIds.filter(qId => answeredQuestionIdsSet.has(qId)).length;
                  const isComplete = totalQuestions > 0 && answeredQuestions >= totalQuestions;
                  return {
                    id: section.id,
                    index,
                    totalQuestions,
                    isComplete
                  };
                });
                
                const totalQuestionsAllSections = perSection.reduce((sum, s) => sum + s.totalQuestions, 0);
                
                return (
                  <>
                    <div 
                      className="w-full h-2 bg-slate-700/30 rounded-full overflow-hidden flex"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={questionCompletionPct}
                      aria-label={`Interview progress: ${questionCompletionPct}% complete, ${headerCompletedSections} of ${headerTotalSections} sections`}
                    >
                      {perSection.map((s, idx) => {
                        const widthPct = totalQuestionsAllSections > 0 
                          ? (s.totalQuestions / totalQuestionsAllSections) * 100 
                          : 0;
                        const isCurrent = s.index === currentSectionIndex;
                        
                        // Color logic: green if complete, bright cyan/green for current section, gray for future
                        return (
                          <div
                            key={s.id}
                            className={`h-full relative transition-all duration-300 ${
                              idx === 0 ? 'rounded-l-full' : ''
                            } ${
                              idx === perSection.length - 1 ? 'rounded-r-full' : ''
                            } ${
                              s.isComplete 
                                ? 'bg-gradient-to-r from-green-500 to-green-600' 
                                : isCurrent
                                  ? 'bg-gradient-to-r from-emerald-400 to-green-500 border-r border-green-400/60'
                                  : 'bg-slate-700/50 border-r border-slate-600/30'
                            }`}
                            style={{ 
                              width: `${widthPct}%`,
                              boxShadow: s.isComplete 
                                ? '0 0 8px rgba(34, 197, 94, 0.4)' 
                                : isCurrent 
                                  ? '0 0 12px rgba(52, 211, 153, 0.5)' 
                                  : 'none'
                            }}
                          />
                        );
                      })}
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-[10px] text-slate-300">
                        Overall
                        {activeSection && headerTotalSections > 0 && (
                          <> • Section {currentSectionIndex + 1} of {headerTotalSections}: {activeSection.displayName}</>
                        )}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="sr-only">Progress: {questionCompletionPct}% complete, {headerCompletedSections} of {headerTotalSections} sections</span>
                        <span className="text-xs font-medium text-green-400">{questionCompletionPct}%</span>
                        <span className="text-xs text-green-400">•</span>
                        <span className="text-xs font-medium text-green-400">{headerCompletedSections} / {headerTotalSections} sections complete</span>
                      </div>
                    </div>
                  </>
                );
              })()}
              
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
          {ENABLE_CHAT_VIRTUALIZATION ? (
            <VirtualizedTranscript 
              transcript={transcript}
              getQuestionDisplayNumber={getQuestionDisplayNumber}
              getFollowUpPackName={getFollowUpPackName}
              sessionId={sessionId}
            />
          ) : (
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
                <PlainTranscript 
                  transcript={transcript}
                  getQuestionDisplayNumber={getQuestionDisplayNumber}
                  getFollowUpPackName={getFollowUpPackName}
                  sessionId={sessionId}
                />
                
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
          )}

          {/* Active Question (Deterministic) or IDE Probing or Agent Probing or Intro or Section Transition */}
          {/* When pending section transition, the card is already in transcript - no duplicate card here */}
          {isPendingSectionTransition ? null : inIdeProbingLoop && currentIdeQuestion ? (
            <div className="flex-shrink-0 px-4 pb-4">
              <div className="max-w-5xl mx-auto">
                <div 
                  className="bg-cyan-950/95 border-2 border-cyan-500/50 rounded-xl p-6 shadow-2xl"
                  style={{
                    boxShadow: '0 12px 36px rgba(0,0,0,0.55), 0 0 0 3px rgba(34,211,238,0.30) inset'
                  }}
                  role="region"
                  aria-live="polite"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border bg-cyan-600/30 border-cyan-500/50">
                      <AlertCircle className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-semibold text-cyan-400">AI Investigator</span>
                        <span className="text-xs text-slate-500">•</span>
                        <span className="text-sm text-cyan-300">Fact Collection</span>
                      </div>
                      <p className="text-white text-lg font-semibold leading-relaxed">
                        {currentIdeQuestion}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : lastAgentQuestion && isWaitingForAgent ? (
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
                     {/* Progress line for base questions - section-only */}
                     {!requiresClarification && !isFollowUpMode && !isMultiInstanceMode && sections.length > 0 && (
                       <div className="text-xs text-slate-400 mb-2">
                         {completedSectionsCount} of {sections.length} sections complete
                       </div>
                     )}

                     <div className="flex items-center gap-2 mb-2">
                       {requiresClarification ? (
                         <>
                           <span className="text-sm font-semibold text-purple-400">Clarification Needed</span>
                           <span className="text-xs text-slate-500">•</span>
                           <span className="text-sm text-purple-300">
                             {getFollowUpPackName(currentPrompt.packId)}
                           </span>
                         </>
                       ) : isIdeProbingMode ? (
                         <>
                           <span className="text-sm font-semibold text-cyan-400">AI Investigator</span>
                           <span className="text-xs text-slate-500">•</span>
                           <span className="text-sm text-cyan-300">Fact Collection</span>
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
          {isPendingSectionTransition ? (
            <div className="flex justify-center mb-3">
              <button
                type="button"
                onClick={async () => {
                  setCurrentSectionIndex(pendingSectionTransition.nextSectionIndex);
                  setCurrentItem({ id: pendingSectionTransition.nextQuestionId, type: 'question' });
                  setQueue([]);
                  setPendingSectionTransition(null);
                  await persistStateToDatabase(transcript, [], { id: pendingSectionTransition.nextQuestionId, type: 'question' });
                  setTimeout(() => autoScrollToBottom(), 100);
                }}
                disabled={isCommitting}
                className="min-h-[52px] px-12 rounded-[10px] font-bold text-white border-2 border-green-500 transition-all duration-75 ease-out flex items-center justify-center gap-2 text-lg bg-green-600 hover:bg-green-700 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 focus-visible:shadow-[0_0_0_4px_rgba(34,197,94,0.15)] disabled:opacity-50 disabled:pointer-events-none"
                aria-label="Begin next section"
              >
                Begin Next Section →
              </button>
            </div>
          ) : isIntroPhase ? (
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
                {isPendingSectionTransition
                  ? "Click the button above to begin the next section"
                  : isIntroPhase
                    ? "Click Next to begin your interview"
                    : isResumePhase
                      ? "Click Next to continue where you left off"
                      : isSectionTransitionMode
                        ? "Click Next to continue to the next section"
                        : inIdeProbingLoop
                          ? "Responding to AI investigator's fact collection questions..."
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

  // Section completion card (new unified format)
  if (entry.type === 'system_section_complete') {
    const { completedSectionName, nextSectionName, whatToExpect, progress } = entry;
    return (
      <div className="bg-gradient-to-br from-green-950/40 to-slate-900/40 border-2 border-green-500/50 rounded-xl p-6 shadow-lg my-4">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-green-600/20 flex items-center justify-center flex-shrink-0 border-2 border-green-500/50">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
          </div>
          <div className="flex-1 space-y-2">
            {/* Title */}
            <div className="text-lg font-bold text-green-400">
              Section complete: {completedSectionName} ✅
            </div>
            
            {/* Body paragraphs */}
            <div className="text-white leading-relaxed space-y-2 text-sm">
              <p>Nice work — you've finished this section.</p>
              <p>
                <strong>Next up: {nextSectionName}.</strong> This section focuses on {whatToExpect}.
              </p>
              <p>Please answer as accurately and in as much detail as you can, even if events happened a long time ago.</p>
            </div>
            
            {/* Progress line */}
            {progress && (
              <p className="text-xs text-slate-400 pt-2">
                Progress: {progress.completedSections} of {progress.totalSections} sections · {progress.answeredQuestions} of {progress.totalQuestions} questions answered
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // System messages (timeouts, reminders)
  if (entry.type === 'system_message') {
    // Section transition messages get enhanced styling (legacy format)
    if (entry.kind === 'section_completion') {
      return (
        <div className="bg-gradient-to-br from-green-950/40 to-slate-900/40 border-2 border-green-500/50 rounded-xl p-6 shadow-lg my-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-green-600/20 flex items-center justify-center flex-shrink-0 border-2 border-green-500/50">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
            </div>
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-green-400">Section complete: {entry.completedSectionName} ✅</span>
              </div>
              <div className="text-white leading-relaxed space-y-2 text-sm">
                {entry.content?.split('\n\n').map((para, idx) => (
                  <p key={idx}>{para}</p>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Section transition legacy format
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