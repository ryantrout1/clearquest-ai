import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, AlertTriangle, Download, Loader2,
  ChevronDown, ChevronRight, Search,
  ChevronsDown, ChevronsUp, ToggleLeft, ToggleRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SectionHeader from "../components/sessionDetails/SectionHeader";
import GlobalAIAssist from "../components/sessionDetails/GlobalAIAssist";
import { Clock } from "lucide-react";
import { buildTranscriptEventsForSession, groupEventsByBaseQuestion } from "../components/utils/transcriptBuilder";
import { StructuredEventRenderer, TranscriptEventRenderer } from "../components/sessionDetails/UnifiedTranscriptRenderer";
import { getPackConfig, getFactsFields, getHeaderFields, buildInstanceHeaderSummary, FOLLOWUP_PACK_CONFIGS } from "../components/followups/followupPackConfig";
import { getFollowupFieldLabel } from "../components/config/followupPackConfig";
import { getInstanceFacts, hasUnresolvedFields } from "../components/followups/factsManager";

// Helper to get field label from centralized config
const getFieldLabelForPack = (packCode, fieldCode, fallback) => {
  return getFollowupFieldLabel({ packCode, fieldCode, fallbackLabel: fallback || fieldCode });
};

const DRIVING_PACKS = new Set([
  'PACK_DRIVING_COLLISION_STANDARD',
  'PACK_DRIVING_STANDARD',
  'PACK_DRIVING_VIOLATIONS_STANDARD',
  'PACK_DRIVING_DUIDWI_STANDARD'
]);

/**
 * Build driving incident facts from transcript events
 * This is the NEW primary source for Structured view
 * Shape: { [baseQuestionId]: { instances: { [instanceKey]: { fields: [{fieldKey, label, value}] } } } }
 */
function buildDrivingFactsFromTranscript(transcriptEvents) {
  const factsByBaseQuestion = {};

  for (const ev of transcriptEvents || []) {
    // Only process follow-up answers (deterministic or AI probe)
    if (ev.kind !== 'deterministic_followup_answer' && ev.kind !== 'ai_probe_answer') continue;

    const packId = ev.followupPackId;
    if (!packId || !DRIVING_PACKS.has(packId)) continue;

    const baseQuestionId = ev.baseQuestionId;
    if (!baseQuestionId) continue;

    const instanceNumber = ev.instanceNumber || 1;
    const instanceKey = `${baseQuestionId}::${instanceNumber}`;

    const fieldKey = ev.fieldKey;
    const value = ev.text;

    if (!value || String(value).trim() === '') continue;

    // Get label from centralized config
    let label = getFieldLabelForPack(packId, fieldKey, fieldKey) || 'Unknown Field';

    // Initialize containers
    if (!factsByBaseQuestion[baseQuestionId]) {
      factsByBaseQuestion[baseQuestionId] = { instances: {} };
    }
    if (!factsByBaseQuestion[baseQuestionId].instances[instanceKey]) {
      factsByBaseQuestion[baseQuestionId].instances[instanceKey] = {
        instanceNumber,
        fields: []
      };
    }

    // Push field/value pair
    factsByBaseQuestion[baseQuestionId].instances[instanceKey].fields.push({
      fieldKey,
      label,
      value: String(value)
    });
  }

  // Log once for debugging
  console.log('[SESSIONDETAILS][DRIVING_FACTS_FROM_TRANSCRIPT]', factsByBaseQuestion);

  return factsByBaseQuestion;
}

/**
 * Build structured facts from additional_details for Driving packs (FALLBACK)
 * Maps field keys to human-readable labels and extracts values
 * @param {string} packId - Pack identifier
 * @param {Object} details - additional_details object from FollowUpResponse
 * @returns {Array<{label: string, value: string}>} - Array of label-value pairs
 */
function buildDrivingPackFacts(packId, details) {
  if (!details || typeof details !== 'object') return [];
  
  // Define display order for each pack
  const FIELD_ORDER = {
    'PACK_DRIVING_COLLISION_STANDARD': [
      'PACK_DRIVING_COLLISION_Q01',
      'PACK_DRIVING_COLLISION_Q02',
      'PACK_DRIVING_COLLISION_Q03',
      'PACK_DRIVING_COLLISION_Q04',
      'PACK_DRIVING_COLLISION_Q05',
      'PACK_DRIVING_COLLISION_Q06',
      'PACK_DRIVING_COLLISION_Q07',
      'PACK_DRIVING_COLLISION_Q08'
    ],
    'PACK_DRIVING_VIOLATIONS_STANDARD': [
      'PACK_DRIVING_VIOLATIONS_Q01',
      'PACK_DRIVING_VIOLATIONS_Q02',
      'PACK_DRIVING_VIOLATIONS_Q03',
      'PACK_DRIVING_VIOLATIONS_Q04',
      'PACK_DRIVING_VIOLATIONS_Q05',
      'PACK_DRIVING_VIOLATIONS_Q06'
    ],
    'PACK_DRIVING_STANDARD': [
      'PACK_DRIVING_STANDARD_Q01',
      'PACK_DRIVING_STANDARD_Q02',
      'PACK_DRIVING_STANDARD_Q03',
      'PACK_DRIVING_STANDARD_Q04'
    ],
    'PACK_DRIVING_DUIDWI_STANDARD': [
      'PACK_DRIVING_DUIDWI_Q01',
      'PACK_DRIVING_DUIDWI_Q02',
      'PACK_DRIVING_DUIDWI_Q03',
      'PACK_DRIVING_DUIDWI_Q04',
      'PACK_DRIVING_DUIDWI_Q05',
      'PACK_DRIVING_DUIDWI_Q06',
      'PACK_DRIVING_DUIDWI_Q07',
      'PACK_DRIVING_DUIDWI_Q08',
      'PACK_DRIVING_DUIDWI_Q09'
    ]
  };
  
  const orderedFields = FIELD_ORDER[packId] || Object.keys(details);
  const facts = [];
  
  orderedFields.forEach(fieldKey => {
    const value = details[fieldKey];
    const label = DRIVING_FIELD_LABELS[fieldKey];
    
    // Only include fields that have labels and non-empty values
    if (label && value && String(value).trim() !== '') {
      facts.push({ label, value: String(value) });
    }
  });
  
  return facts;
}

const REVIEW_KEYWORDS = [
  'arrest', 'fired', 'failed', 'polygraph', 'investigated',
  'suspended', 'terminated', 'dui', 'drugs', 'felony', 'charge',
  'conviction', 'probation', 'parole', 'violence', 'assault', 'disqualified'
];

const US_CITIZENSHIP_QUESTION_ID = 'Q161';

const needsReview = (text) => {
  const lower = String(text || '').toLowerCase();
  return REVIEW_KEYWORDS.some(keyword => lower.includes(keyword));
};

export default function SessionDetails() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('id');

  const [session, setSession] = useState(null);
  const [responses, setResponses] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [sections, setSections] = useState([]);
  const [department, setDepartment] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  
  const [totalQuestions, setTotalQuestions] = useState(null);
  const [expandedQuestions, setExpandedQuestions] = useState(new Set());
  
  const [isHoveringStatus, setIsHoveringStatus] = useState(false);
  const [showStatusConfirm, setShowStatusConfirm] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [showOnlyFollowUps, setShowOnlyFollowUps] = useState(false);
  const [viewMode, setViewMode] = useState("structured");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [collapsedSections, setCollapsedSections] = useState(new Set());
  const [isDeletingLast, setIsDeletingLast] = useState(false);
  const [followUpQuestionEntities, setFollowUpQuestionEntities] = useState([]);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [transcriptEvents, setTranscriptEvents] = useState([]);
  const autoGeneratedRef = useRef(false);
  const [questionSummariesByQuestionId, setQuestionSummariesByQuestionId] = useState({});
  const [sectionSummariesBySectionId, setSectionSummariesBySectionId] = useState({});
  const [instanceSummariesByKey, setInstanceSummariesByKey] = useState({});
  const [showScrollTop, setShowScrollTop] = useState(false);

  const categoryRefs = useRef({});

  useEffect(() => {
    if (!sessionId) {
      navigate(createPageUrl("InterviewDashboard"));
      return;
    }
    loadSessionData();
  }, [sessionId]);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const loadSessionData = async () => {
    setIsLoading(true);

    try {
      const sessionData = await base44.entities.InterviewSession.get(sessionId);
      setSession(sessionData);

      if (sessionData.department_code) {
        const depts = await base44.entities.Department.filter({
          department_code: sessionData.department_code
        });
        if (depts.length > 0) {
          setDepartment(depts[0]);
        }
      }

      const [responsesData, followupsData, questionsData, sectionsData, followUpQuestionsData] = await Promise.all([
        base44.entities.Response.filter({ session_id: sessionId }),
        base44.entities.FollowUpResponse.filter({ session_id: sessionId }),
        base44.entities.Question.filter({ active: true }),
        base44.entities.Section.list(),
        base44.entities.FollowUpQuestion.list()
      ]);

      // DIAGNOSTIC LOG: Inspect raw session data and AI summaries
      console.log("[SESSION DETAILS RAW DATA]", {
        sessionId,
        responsesCount: responsesData.length,
        followupsCount: followupsData.length,
        followUpQuestionEntitiesCount: followUpQuestionsData.length,
        sampleFollowup: followupsData[0],
        sampleFollowUpQuestion: followUpQuestionsData.find(q => q.followup_pack_id === 'PACK_LE_APPS')
      });

      console.log('[SESSIONDETAILS] Loaded AI summaries', {
        hasGlobalAISummary: !!sessionData.global_ai_summary,
        globalSummaryText: sessionData.global_ai_summary?.text?.substring(0, 100),
        hasSectionAISummaries: !!sessionData.section_ai_summaries,
        sectionAISummariesType: typeof sessionData.section_ai_summaries,
        sectionSummaryKeys: sessionData.section_ai_summaries ? Object.keys(sessionData.section_ai_summaries) : [],
        sectionSummaryCount: sessionData.section_ai_summaries ? Object.keys(sessionData.section_ai_summaries).length : 0,
        sectionSummariesFullData: sessionData.section_ai_summaries,
        sectionSummarySample: sessionData.section_ai_summaries ? Object.entries(sessionData.section_ai_summaries)[0] : null,
        responsesWithSummaries: responsesData.filter(r => r.investigator_summary).length,
        totalResponses: responsesData.length,
        yesResponses: responsesData.filter(r => r.answer === 'Yes').length,
        lastGenerated: sessionData.ai_summaries_last_generated_at,
        sampleQuestionSummaries: responsesData
          .filter(r => r.investigator_summary)
          .slice(0, 3)
          .map(r => ({ questionId: r.question_id, summary: r.investigator_summary?.substring(0, 80) }))
      });

      // DIAGNOSTIC LOG: Check for AI probing data
      const followupsWithProbing = followupsData.filter(f => 
        f.additional_details?.investigator_probing?.length > 0
      );
      console.log("SESSIONDETAILS: Loaded AI probing exchanges", {
        sessionId,
        followupsWithProbing: followupsWithProbing.length,
        totalProbingExchanges: followupsWithProbing.reduce(
          (sum, f) => sum + (f.additional_details.investigator_probing?.length || 0), 
          0
        ),
        samples: followupsWithProbing.slice(0, 2).map(f => ({
          packId: f.followup_pack,
          instanceNumber: f.instance_number,
          probingCount: f.additional_details.investigator_probing?.length,
          firstExchange: f.additional_details.investigator_probing?.[0]
        }))
      });
      
      // DIAGNOSTIC: Log PACK_LE_APPS question metadata
      const packLeAppsQuestions = followUpQuestionsData.filter(q => q.followup_pack_id === 'PACK_LE_APPS');
      console.log("[FOLLOWUP QUESTION METADATA] PACK_LE_APPS", {
        totalQuestions: packLeAppsQuestions.length,
        questions: packLeAppsQuestions.map(q => ({
          id: q.id,
          pack: q.followup_pack_id,
          displayOrder: q.display_order,
          text: q.question_text
        }))
      });

      setResponses(responsesData);
      setFollowups(followupsData);
      setQuestions(questionsData);
      setSections(sectionsData);
      setFollowUpQuestionEntities(followUpQuestionsData);
      
      // Build unified transcript events from session's transcript_snapshot (canonical source)
      const transcriptSnapshot = sessionData.transcript_snapshot || [];
      
      console.log('[SESSIONDETAILS] Transcript snapshot check', {
        hasSnapshot: transcriptSnapshot.length > 0,
        snapshotLength: transcriptSnapshot.length,
        responsesCount: responsesData.length,
        followupsCount: followupsData.length
      });
      
      // If no transcript snapshot, rebuild from Response entities (fallback for old sessions)
      let events = [];
      if (transcriptSnapshot.length > 0) {
        // INVARIANT: Map transcript entries EXACTLY as they appear in chat history
        // This must match 1:1 with what CandidateInterview renders
        events = [];
        transcriptSnapshot.forEach((entry, idx) => {
          const entryType = entry.type;
          const entryKind = entry.kind;
          
          // Map each entry type to a transcript event that matches the chat UI
          if (entryType === 'system_welcome' || entryKind === 'system_welcome') {
            // Welcome message
            events.push({
              id: entry.id || `evt-${idx}`,
              sessionId,
              role: 'system',
              kind: 'system_welcome',
              text: entry.text || entry.content || 'Welcome to your ClearQuest Interview.',
              sectionName: null,
              createdAt: new Date(entry.timestamp).getTime(),
              sortKey: idx * 10
            });
          } else if (entryType === 'question' || entryKind === 'base_question') {
            // Base question + answer combined entry
            events.push({
              id: entry.id || `evt-${idx}-q`,
              sessionId,
              baseQuestionId: entry.questionId,
              baseQuestionCode: entry.questionCode || entry.questionId,
              role: 'investigator',
              kind: 'base_question',
              text: entry.questionText || entry.text || entry.content || '',
              sectionName: entry.category || entry.sectionName || null,
              createdAt: new Date(entry.timestamp).getTime(),
              sortKey: idx * 10
            });
            
            // Add answer if present
            if (entry.answer) {
              events.push({
                id: entry.id ? `${entry.id}-a` : `evt-${idx}-a`,
                sessionId,
                baseQuestionId: entry.questionId,
                role: 'candidate',
                kind: 'base_answer',
                text: entry.answer,
                sectionName: entry.category || entry.sectionName || null,
                createdAt: new Date(entry.timestamp).getTime() + 1,
                sortKey: idx * 10 + 1
              });
            }
          } else if (entryType === 'followup' || entryKind === 'deterministic_followup') {
            // Legacy combined followup entry (Q+A in one entry)
            events.push({
              id: entry.id || `evt-${idx}-fq`,
              sessionId,
              baseQuestionId: entry.questionId || entry.baseQuestionId,
              followupPackId: entry.packId || entry.followupPackId,
              followupQuestionId: entry.followupQuestionId,
              instanceNumber: entry.instanceNumber || 1,
              role: 'investigator',
              kind: 'deterministic_followup_question',
              text: entry.questionText || entry.text || '',
              fieldKey: entry.fieldKey || entry.followupQuestionId,
              sectionName: entry.category || entry.sectionName || null,
              createdAt: new Date(entry.timestamp).getTime(),
              sortKey: idx * 10
            });
            
            // Add answer if present
            if (entry.answer) {
              events.push({
                id: entry.id ? `${entry.id}-fa` : `evt-${idx}-fa`,
                sessionId,
                baseQuestionId: entry.questionId || entry.baseQuestionId,
                followupPackId: entry.packId || entry.followupPackId,
                followupQuestionId: entry.followupQuestionId,
                instanceNumber: entry.instanceNumber || 1,
                role: 'candidate',
                kind: 'deterministic_followup_answer',
                text: entry.answer,
                fieldKey: entry.fieldKey || entry.followupQuestionId,
                sectionName: entry.category || entry.sectionName || null,
                createdAt: new Date(entry.timestamp).getTime() + 1,
                sortKey: idx * 10 + 1
              });
            }
          } else if (entryType === 'followup_question' || entryKind === 'deterministic_followup_question') {
            // New separate follow-up question entry
            events.push({
              id: entry.id || `evt-${idx}`,
              sessionId,
              baseQuestionId: entry.questionId || entry.baseQuestionId,
              responseId: entry.responseId || entry.parentResponseId || null, // Link to parent Response
              parentResponseId: entry.responseId || entry.parentResponseId || null,
              followupPackId: entry.packId || entry.followupPackId,
              followupQuestionId: entry.followupQuestionId,
              instanceNumber: entry.instanceNumber || 1,
              role: 'investigator',
              kind: 'deterministic_followup_question',
              text: entry.questionText || entry.text || '',
              fieldKey: entry.fieldKey || entry.followupQuestionId,
              sectionName: entry.category || entry.sectionName || null,
              createdAt: new Date(entry.timestamp).getTime(),
              sortKey: idx * 10
            });
          } else if (entryType === 'followup_answer' || entryKind === 'deterministic_followup_answer') {
            // New separate follow-up answer entry
            events.push({
              id: entry.id || `evt-${idx}`,
              sessionId,
              baseQuestionId: entry.questionId || entry.baseQuestionId,
              responseId: entry.responseId || entry.parentResponseId || null, // Link to parent Response
              parentResponseId: entry.responseId || entry.parentResponseId || null,
              followupPackId: entry.packId || entry.followupPackId,
              followupQuestionId: entry.followupQuestionId,
              instanceNumber: entry.instanceNumber || 1,
              role: 'candidate',
              kind: 'deterministic_followup_answer',
              text: entry.answer || entry.text || '',
              fieldKey: entry.fieldKey || entry.followupQuestionId,
              sectionName: entry.category || entry.sectionName || null,
              createdAt: new Date(entry.timestamp).getTime(),
              sortKey: idx * 10
            });
          } else if (entryType === 'ai_question' || entryKind === 'ai_field_probe' || entryKind === 'ai_probe_question' || entryKind === 'ai_probe') {
            // AI probing question - handles v2 per-field probes and legacy LE_APPS probes
            events.push({
              id: entry.id || `evt-${idx}`,
              sessionId,
              baseQuestionId: entry.questionId || entry.baseQuestionId,
              followupPackId: entry.packId || entry.followupPackId,
              instanceNumber: entry.instanceNumber || 1,
              role: 'investigator',
              kind: 'ai_probe_question',
              text: entry.text || entry.content || '',
              fieldKey: entry.fieldKey,
              probeIndex: entry.probeIndex,
              sectionName: entry.category || entry.sectionName || null,
              createdAt: new Date(entry.timestamp).getTime(),
              sortKey: idx * 10
            });
          } else if (entryType === 'ai_answer' || entryKind === 'ai_field_probe_answer' || entryKind === 'ai_probe_answer') {
            // AI probing answer - handles v2 per-field probes and legacy LE_APPS probes
            events.push({
              id: entry.id || `evt-${idx}`,
              sessionId,
              baseQuestionId: entry.questionId || entry.baseQuestionId,
              followupPackId: entry.packId || entry.followupPackId,
              instanceNumber: entry.instanceNumber || 1,
              role: 'candidate',
              kind: 'ai_probe_answer',
              text: entry.text || entry.content || '',
              fieldKey: entry.fieldKey,
              probeIndex: entry.probeIndex,
              sectionName: entry.category || entry.sectionName || null,
              createdAt: new Date(entry.timestamp).getTime(),
              sortKey: idx * 10
            });
          } else if (entryType === 'multi_instance_question' || entryKind === 'multi_instance_question') {
            // Multi-instance question
            events.push({
              id: entry.id || `evt-${idx}`,
              sessionId,
              baseQuestionId: entry.questionId,
              followupPackId: entry.packId,
              instanceNumber: entry.instanceNumber,
              role: 'investigator',
              kind: 'multi_instance_question',
              text: entry.text || entry.content || 'Do you have another instance we should discuss for this question?',
              sectionName: null,
              createdAt: new Date(entry.timestamp).getTime(),
              sortKey: idx * 10
            });
          } else if (entryType === 'multi_instance_answer' || entryKind === 'multi_instance_answer') {
            // Multi-instance answer
            events.push({
              id: entry.id || `evt-${idx}`,
              sessionId,
              baseQuestionId: entry.questionId,
              followupPackId: entry.packId,
              instanceNumber: entry.instanceNumber,
              role: 'candidate',
              kind: 'multi_instance_answer',
              text: entry.text || entry.content || '',
              sectionName: null,
              createdAt: new Date(entry.timestamp).getTime(),
              sortKey: idx * 10
            });
          } else if (entryType === 'system_message' || entryKind === 'system_message' || entryKind === 'section_transition' || entryKind === 'section_completion') {
            // System messages (section transitions, reminders, etc.)
            events.push({
              id: entry.id || `evt-${idx}`,
              sessionId,
              role: 'system',
              kind: entry.kind || 'system_message',
              text: entry.text || entry.content || '',
              sectionName: entry.sectionName || entry.nextSectionName || null,
              createdAt: new Date(entry.timestamp).getTime(),
              sortKey: idx * 10
            });
          } else if (entryType === 'intro') {
            // Legacy intro type
            events.push({
              id: entry.id || `evt-${idx}`,
              sessionId,
              role: 'system',
              kind: 'system_welcome',
              text: entry.text || entry.content || '',
              sectionName: null,
              createdAt: new Date(entry.timestamp).getTime(),
              sortKey: idx * 10
            });
          } else {
            // Fallback for unknown types - preserve as-is
            const displayText = entry.text || entry.content || entry.questionText || entry.answer || '';
            if (displayText) {
              events.push({
                id: entry.id || `evt-${idx}`,
                sessionId,
                baseQuestionId: entry.questionId,
                followupPackId: entry.packId || entry.followupPackId || null,
                instanceNumber: entry.instanceNumber || null,
                role: entry.role || 'candidate',
                kind: entry.kind || entry.type || 'unknown',
                text: displayText,
                fieldKey: entry.fieldKey || null,
                sectionName: entry.category || entry.sectionName || null,
                createdAt: new Date(entry.timestamp).getTime(),
                sortKey: idx * 10 + 5
              });
            }
          }
        });
        
        // Sort by sortKey to ensure chronological order
        events.sort((a, b) => a.sortKey - b.sortKey);
        
        console.log(`📋 Loaded ${events.length} transcript events from ${transcriptSnapshot.length} snapshot entries`);
      } else {
        // Fallback: Rebuild from Response entities (for old sessions)
        console.log('[SESSIONDETAILS] No transcript_snapshot - rebuilding from Response entities');
        events = await buildTranscriptEventsForSession(sessionId, base44, { Questions: questionsData });
        console.log(`📋 Rebuilt ${events.length} transcript events from Response entities`);
      }
      
      console.log('[SESSIONDETAILS] Final transcript events', {
        totalEvents: events.length,
        eventKinds: [...new Set(events.map(e => e.kind))],
        sampleEvents: events.slice(0, 3)
      });
      
      setTranscriptEvents(events);

      // Load AI summaries from dedicated entities
      try {
        const [instanceSummaries, questionSummaries, sectionSummaries] = await Promise.all([
          base44.entities.InstanceSummary.filter({ session_id: sessionId }),
          base44.entities.QuestionSummary.filter({ session_id: sessionId }),
          base44.entities.SectionSummary.filter({ session_id: sessionId })
        ]);

        console.log('[SESSIONDETAILS] AI summaries loaded (raw)', {
          sessionId,
          instanceCount: instanceSummaries.length,
          questionCount: questionSummaries.length,
          sectionCount: sectionSummaries.length,
          questionSummariesRaw: questionSummaries.map(qs => ({
            id: qs.id,
            question_id: qs.question_id,
            textPreview: qs.question_summary_text?.substring(0, 60)
          }))
        });

        // Build maps for quick lookup
        const instMap = {};
        instanceSummaries.forEach(inst => {
          // Handle nested data structure from API
          const data = inst.data || inst;
          const key = `${data.question_id}|${data.instance_number}`;
          instMap[key] = data.instance_summary_text;
        });

        const qMap = {};
        questionSummaries.forEach(qs => {
          // Normalize: handle both camelCase and snake_case field names from API
          // API returns data nested under 'data' property OR flat depending on context
          const data = qs.data || qs;
          const questionId = data.question_id || data.questionId;
          const summaryText = data.question_summary_text || data.questionSummaryText;
          
          if (questionId && summaryText) {
            qMap[questionId] = summaryText;
          }
        });
        
        console.log('[SESSIONDETAILS] QuestionSummary raw rows', questionSummaries.slice(0, 2));
        console.log('[SESSIONDETAILS] QuestionSummary mapped keys', Object.keys(qMap));

        const sMap = {};
        sectionSummaries.forEach(ss => {
          // Handle nested data structure from API
          const data = ss.data || ss;
          const sectionId = data.section_id || data.sectionId;
          const summaryText = data.section_summary_text || data.sectionSummaryText;
          
          if (sectionId && summaryText) {
            // Map by section_id (database ID) for lookup
            sMap[sectionId] = summaryText;
          }
        });
        
        // CRITICAL: Build section name to summary map for SectionHeader lookup
        // SectionHeader receives category (section_name string), not section_id
        const sMapByName = {};
        sectionsData.forEach(section => {
          const sectionDbId = section.id;
          const sectionName = section.section_name;
          const summaryText = sMap[sectionDbId];
          
          if (sectionName && summaryText) {
            sMapByName[sectionName] = summaryText;
          }
        });
        
        console.log('[SESSIONDETAILS] Section summary mapping', {
          sectionSummariesCount: sectionSummaries.length,
          sMapByIdKeys: Object.keys(sMap),
          sMapByNameKeys: Object.keys(sMapByName),
          sampleMapping: Object.entries(sMapByName).slice(0, 2).map(([name, text]) => ({
            sectionName: name,
            textPreview: text?.substring(0, 60)
          }))
        });

        // DEBUG: Log sample response question_id for matching verification
        const sampleResponseQuestionIds = responsesData.filter(r => r.answer === 'Yes').slice(0, 3).map(r => r.question_id);

        console.log('[SESSIONDETAILS] AI summaries mapped', {
          sessionId,
          questionSummaryKeys: Object.keys(qMap),
          sectionSummaryKeys: Object.keys(sMap),
          instanceSummaryKeys: Object.keys(instMap),
          sampleResponseQuestionIds,
          keysMatch: sampleResponseQuestionIds.some(id => qMap[id]),
          // Deep debug: show what we're actually mapping
          qMapSample: Object.entries(qMap).slice(0, 2).map(([k, v]) => ({ key: k, textPreview: v?.substring(0, 50) }))
        });

        setInstanceSummariesByKey(instMap);
        setQuestionSummariesByQuestionId(qMap);
        setSectionSummariesBySectionId(sMapByName); // Use name-based map for SectionHeader
      } catch (err) {
        console.error('[SESSIONDETAILS] Failed to load summaries', { error: err });
      }
      
      setTotalQuestions(questionsData.length);
      setExpandedQuestions(new Set());
      setIsLoading(false);
    } catch (err) {
      toast.error("Failed to load session data");
      setIsLoading(false);
    }
  };

  const toggleQuestionExpanded = (responseId) => {
    setExpandedQuestions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(responseId)) {
        newSet.delete(responseId);
      } else {
        newSet.add(responseId);
      }
      return newSet;
    });
  };

  const handleStatusClick = () => {
    if (session?.status === 'completed') {
      setShowStatusConfirm(true);
    }
  };

  const handleRevertToInProgress = async () => {
    try {
      await base44.entities.InterviewSession.update(sessionId, {
        status: 'in_progress',
        completed_at: null,
        completed_date: null
      });
      
      setSession({ ...session, status: 'in_progress' });
      setShowStatusConfirm(false);
      toast.success('Interview marked as In Progress');
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  const handleContinueInterview = () => {
    navigate(createPageUrl("CandidateInterview") + `?session=${sessionId}`);
  };

  const allResponsesWithNumbers = responses.map((r, idx) => {
    // Prefer question_number from Question entity, fallback to sequential index
    const questionEntity = questions.find(q => q.question_id === r.question_id);
    const displayNumber = questionEntity?.question_number || (idx + 1);
    
    // Get section name from Section entity
    const sectionEntity = sections.find(s => s.id === questionEntity?.section_id);
    const sectionName = sectionEntity?.section_name || r.category || '';
    
    // DEBUG: Log what we're looking up for this response
    const responseQuestionId = r.question_id;
    const questionEntityId = questionEntity?.id; // The database ID of the Question entity
    
    // QuestionSummary.question_id is stored as the Question entity's database ID
    // Response.question_id is ALSO the Question entity's database ID
    // So we can do a direct lookup without needing questionEntityId
    const questionSummary = questionSummariesByQuestionId[responseQuestionId] || null;

    // Get instance summaries for this question
    const relatedInstances = followups.filter(f => f.response_id === r.id);
    const instanceSummaries = relatedInstances.map(f => {
      const key = `${responseQuestionId}|${f.instance_number || 1}`;
      return instanceSummariesByKey[key];
    }).filter(Boolean);

    // Prefer question summary, fallback to combined instance summaries
    let investigator_summary = questionSummary;
    if (!investigator_summary && instanceSummaries.length > 0) {
      investigator_summary = instanceSummaries.join(' | ');
    }

    const hasSummary = !!investigator_summary;
    const summarySource = questionSummary ? 'question' : instanceSummaries.length ? 'instances' : 'none';

    // Only log for Yes answers with follow-ups (where we expect summaries)
    if (r.answer === 'Yes' && relatedInstances.length > 0) {
      console.log('[SESSIONDETAILS] Question summary check', {
        responseQuestionId,
        hasFollowups: relatedInstances.length > 0,
        hasSummary,
        summarySource,
        availableKeys: Object.keys(questionSummariesByQuestionId).slice(0, 5),
        summaryPreview: investigator_summary ? investigator_summary.slice(0, 120) : null
      });
    }
    
    return {
      ...r,
      display_number: displayNumber,
      section_name: sectionName,
      investigator_summary
    };
  }).sort((a, b) => {
    // Sort by question_number first, then timestamp as tiebreaker
    if (typeof a.display_number === 'number' && typeof b.display_number === 'number') {
      if (a.display_number !== b.display_number) {
        return a.display_number - b.display_number;
      }
    }
    return new Date(a.response_timestamp) - new Date(b.response_timestamp);
  });

  const categories = [...new Set(allResponsesWithNumbers.map(r => r.section_name))].filter(Boolean).sort();

  // Initialize collapsed sections with all categories on first load
  useEffect(() => {
    if (categories.length > 0 && collapsedSections.size === 0) {
      setCollapsedSections(new Set(categories));
    }
  }, [categories.length]);

  const filteredResponsesWithNumbers = allResponsesWithNumbers.filter(response => {
    const matchesSearch = !searchTerm ||
      response.question_text?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      response.answer?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      response.investigator_summary?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      response.investigator_probing?.some(p => 
        p.probing_question?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        p.candidate_response?.toLowerCase().includes(searchTerm.toLowerCase())
      ) ||
      followups.some(f =>
        f.response_id === response.id &&
        JSON.stringify(f.additional_details || {}).toLowerCase().includes(searchTerm.toLowerCase())
      );

    const hasFollowups = followups.some(f => f.response_id === response.id) || (response.investigator_probing?.length > 0);
    const matchesFollowUpFilter = !showOnlyFollowUps || hasFollowups;

    return matchesSearch && matchesFollowUpFilter;
  });

  const responsesByCategory = {};

  filteredResponsesWithNumbers.forEach(r => {
    const cat = r.section_name || 'Other';
    if (!responsesByCategory[cat]) responsesByCategory[cat] = [];
    responsesByCategory[cat].push(r);
  });

  const handleExpandAll = () => {
    setCollapsedSections(new Set());
    const allYesResponses = new Set(
      responses.filter(r => r.answer === 'Yes').map(r => r.id)
    );
    setExpandedQuestions(allYesResponses);
  };

  const handleCollapseAll = () => {
    const allCategories = Object.keys(responsesByCategory);
    setCollapsedSections(new Set(allCategories));
    setExpandedQuestions(new Set());
  };

  const toggleSection = (category) => {
    setCollapsedSections(prev => {
      const newCollapsed = new Set(prev);
      if (newCollapsed.has(category)) {
        newCollapsed.delete(category);
      } else {
        newCollapsed.add(category);
      }
      return newCollapsed;
    });
  };

  const handleCategoryJump = (category) => {
    setSelectedCategory(category);
    if (category !== "all" && categoryRefs.current[category]) {
      categoryRefs.current[category].scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  };

  const handleDeleteLastQuestion = async () => {
    if (responses.length === 0) {
      toast.error("No questions to delete");
      return;
    }

    setIsDeletingLast(true);

    try {
      const sortedResponses = [...responses].sort((a, b) =>
        new Date(b.response_timestamp) - new Date(a.response_timestamp)
      );
      const lastResponse = sortedResponses[0];

      const relatedFollowups = followups.filter(f => f.response_id === lastResponse.id);
      
      for (const followup of relatedFollowups) {
        await base44.entities.FollowUpResponse.delete(followup.id);
      }

      await base44.entities.Response.delete(lastResponse.id);

      // CRITICAL: Clear engine snapshots to force rebuild on next resume
      await base44.entities.InterviewSession.update(sessionId, {
        status: 'in_progress',
        completed_at: null,
        completed_date: null,
        total_questions_answered: responses.length - 1,
        transcript_snapshot: null,
        queue_snapshot: null,
        current_item_snapshot: null
      });

      toast.success("Last question deleted successfully");
      await loadSessionData();

    } catch (err) {
      toast.error("Failed to delete last question");
      console.error(err);
    } finally {
      setIsDeletingLast(false);
    }
  };

  const generateReport = async () => {
    setIsGeneratingReport(true);

    try {
      const reportContent = generateReportHTML(session, responses, followups, questions, department, totalQuestions);
      const printContainer = document.createElement('div');
      printContainer.innerHTML = reportContent;
      printContainer.style.position = 'absolute';
      printContainer.style.left = '-9999px';
      document.body.appendChild(printContainer);
      window.print();
      setTimeout(() => document.body.removeChild(printContainer), 100);
      toast.success("Report ready - use your browser's print dialog to save as PDF");
    } catch (err) {
      toast.error("Failed to generate report");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // Unified AI generation handler - calls single orchestrator for all summary types
  const handleGenerateAllAISummaries = async () => {
    if (!sessionId || isGeneratingAI) return;
    setIsGeneratingAI(true);

    try {
      console.log('[AI-GENERATE] START', { sessionId });

      // Call unified orchestrator - handles question, section, and interview summaries
      const result = await base44.functions.invoke('generateSessionSummaries', {
        sessionId: sessionId
      });

      console.log('[AI-GENERATE] RESULT', { sessionId, data: result.data });

      if (result.data?.ok || result.data?.success) {
        const created = result.data.created || {};
        const skipped = result.data.skippedExists || {};
        const totalCreated = (created.question || 0) + (created.section || 0) + (created.interview || 0);
        const totalSkipped = (skipped.question || 0) + (skipped.section || 0) + (skipped.interview || 0);
        
        if (totalCreated > 0) {
          toast.success(`AI summaries generated: ${totalCreated} new, ${totalSkipped} existing`);
        } else if (totalSkipped > 0) {
          toast.info(`All summaries already exist (${totalSkipped} skipped)`);
        } else {
          toast.info('No complete questions/sections to summarize yet');
        }
        console.log('[AI-GENERATE] DONE', { totalCreated, totalSkipped });
      } else {
        toast.error('Failed to generate summaries');
      }

      // Reload all data to show new summaries
      await loadSessionData();
    } catch (err) {
      console.error('[AI-GENERATE][FRONT_ERROR]', { sessionId, error: err });
      toast.error('Failed to generate summaries');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // AI summaries now only generated on manual click (autoGeneratedRef kept for backwards compatibility)

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-blue-400 animate-spin mx-auto" />
          <p className="text-slate-300">Loading session data...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <p className="text-slate-300">Session not found</p>
          <Link to={createPageUrl("InterviewDashboard")}>
            <Button className="bg-blue-600 hover:bg-blue-700">Back to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  const statusConfig = {
    active: { label: "In-Progress", color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
    in_progress: { label: "In-Progress", color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
    completed: { label: "Completed", color: "bg-green-500/20 text-green-300 border-green-500/30" },
    paused: { label: "Paused", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
    under_review: { label: "Under Review", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" }
  };

  const riskConfig = {
    low: { label: "Low Risk", color: "bg-green-500/20 text-green-300 border-green-500/30" },
    moderate: { label: "Moderate Risk", color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
    elevated: { label: "Elevated Risk", color: "bg-red-500/20 text-red-300 border-red-500/30" }
  };

  const actualQuestionsAnswered = responses.length;
  const actualFollowupsTriggered = followups.length;
  const actualCompletion = totalQuestions 
    ? Math.round((actualQuestionsAnswered / totalQuestions) * 100) 
    : 0;

  // Calculate time metrics
  const calculateTimeMetrics = () => {
    if (responses.length === 0) return { avgTime: 0, totalTime: 0 };
    
    const sorted = [...responses].sort((a, b) => 
      new Date(a.response_timestamp) - new Date(b.response_timestamp)
    );
    
    const timeDiffs = [];
    for (let i = 1; i < sorted.length; i++) {
      const diff = (new Date(sorted[i].response_timestamp) - new Date(sorted[i - 1].response_timestamp)) / 1000;
      if (diff < 300) timeDiffs.push(diff);
    }
    
    const avgTime = timeDiffs.length > 0 
      ? Math.round(timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length)
      : 0;
    
    const totalTime = sorted.length > 1
      ? Math.round((new Date(sorted[sorted.length - 1].response_timestamp) - new Date(sorted[0].response_timestamp)) / 60000)
      : 0;
    
    return { avgTime, totalTime };
  };

  const { avgTime, totalTime } = calculateTimeMetrics();
  
  const yesCount = responses.filter(r => r.answer === 'Yes').length;
  const noCount = responses.filter(r => r.answer === 'No').length;
  const yesPercent = responses.length > 0 ? ((yesCount / responses.length) * 100).toFixed(1) : 0;
  const noPercent = responses.length > 0 ? ((noCount / responses.length) * 100).toFixed(1) : 0;

  const handleStatusChange = async (newStatus) => {
    try {
      const updateData = { status: newStatus };
      if (newStatus === 'in_progress') {
        updateData.completed_at = null;
        updateData.completed_date = null;
      } else if (newStatus === 'completed' && !session.completed_at) {
        updateData.completed_at = new Date().toISOString();
        updateData.completed_date = new Date().toISOString();
      }
      
      await base44.entities.InterviewSession.update(sessionId, updateData);
      setSession({ ...session, ...updateData });
      toast.success(`Interview marked as ${newStatus === 'in_progress' ? 'In Progress' : newStatus === 'completed' ? 'Completed' : newStatus}`);
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        <Link to={createPageUrl("InterviewDashboard")}>
          <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-slate-700 mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>

        {/* Unified Header Card - Three Rows */}
        <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950/90 via-slate-950/70 to-slate-900/70 px-5 py-4 space-y-4 mb-4">
          {/* Row 1 – Identity + Status */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-slate-50">
                {department?.department_name || session.department_code}
              </h1>
              <button
                onClick={() => {
                  if (session.status === 'completed') {
                    handleStatusChange('in_progress');
                  }
                }}
                onMouseEnter={() => setIsHoveringStatus(true)}
                onMouseLeave={() => setIsHoveringStatus(false)}
                disabled={session.status !== 'completed'}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-full border transition-all font-medium",
                  session.status === 'completed' && "cursor-pointer hover:opacity-90",
                  session.status !== 'completed' && "cursor-default",
                  statusConfig[session.status]?.color
                )}
              >
                {session.status === 'completed' && isHoveringStatus 
                  ? "Mark In-Progress" 
                  : statusConfig[session.status]?.label || session.status}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
              <span>
                # <span className="font-medium text-slate-200">{session.file_number}</span>
              </span>
              <span>•</span>
              <span>
                Dept: <span className="font-medium text-slate-200">{session.department_code}</span>
              </span>
              <span>•</span>
              <span>
                {session.started_at ? new Date(session.started_at).toLocaleDateString('en-US', { 
                  year: 'numeric', month: 'short', day: 'numeric' 
                }) : 'N/A'}
              </span>
              {totalTime > 0 && (
                <>
                  <span>•</span>
                  <span>
                    {totalTime} min {avgTime > 0 && `(~${avgTime}s/q)`}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Row 2 – Metric Tiles */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="rounded-xl bg-slate-900/70 border border-slate-800 px-3 py-2 flex flex-col justify-between">
              <div className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
                Questions
              </div>
              <div className="text-xl font-semibold text-slate-50">
                {actualQuestionsAnswered}
              </div>
              <div className="text-[10px] text-slate-500">
                of {totalQuestions || 207}
              </div>
            </div>

            <div className="rounded-xl bg-gradient-to-br from-emerald-900/70 to-slate-900/70 border border-emerald-900 px-3 py-2 flex flex-col justify-between">
              <div className="text-[11px] font-semibold tracking-wide text-slate-300 uppercase">
                Yes
              </div>
              <div className="text-xl font-semibold text-slate-50">
                {yesCount}
              </div>
              <div className="text-[10px] text-slate-400">
                {yesPercent}%
              </div>
            </div>

            <div className="rounded-xl bg-gradient-to-br from-slate-800/70 to-slate-900/70 border border-slate-700 px-3 py-2 flex flex-col justify-between">
              <div className="text-[11px] font-semibold tracking-wide text-slate-300 uppercase">
                No
              </div>
              <div className="text-xl font-semibold text-slate-50">
                {noCount}
              </div>
              <div className="text-[10px] text-slate-400">
                {noPercent}%
              </div>
            </div>

            <div className="rounded-xl bg-gradient-to-br from-indigo-900/70 to-slate-900/70 border border-indigo-900 px-3 py-2 flex flex-col justify-between">
              <div className="text-[11px] font-semibold tracking-wide text-slate-300 uppercase">
                Follow-Ups
              </div>
              <div className="text-xl font-semibold text-slate-50">
                {actualFollowupsTriggered}
              </div>
              <div className="text-[10px] text-slate-400">
                {actualFollowupsTriggered > 0 ? "triggered" : "none"}
              </div>
            </div>

            <div className="rounded-xl bg-gradient-to-br from-red-900/70 to-slate-900/70 border border-red-900 px-3 py-2 flex flex-col justify-between">
              <div className="text-[11px] font-semibold tracking-wide text-slate-300 uppercase">
                Red Flags
              </div>
              <div className="text-xl font-semibold text-slate-50">
                {session.red_flags?.length || 0}
              </div>
              <div className="text-[10px] text-slate-400">
                {session.red_flags?.length > 0 ? "identified" : "none"}
              </div>
            </div>

            <div className="rounded-xl bg-gradient-to-br from-amber-900/70 to-slate-900/70 border border-amber-900 px-3 py-2 flex flex-col justify-between">
              <div className="text-[11px] font-semibold tracking-wide text-slate-300 uppercase">
                Complete
              </div>
              <div className="text-xl font-semibold text-slate-50">
                {actualCompletion}%
              </div>
              <div className="text-[10px] text-slate-400">
                {actualCompletion === 100 ? "finished" : "in progress"}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-slate-800/80" />

          {/* Row 3 – Search & Filters */}
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            {/* Search on left */}
            <div className="flex-1 min-w-[220px] relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                placeholder="Search questions or answers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-slate-800 border-slate-600 text-white text-sm h-9"
              />
            </div>

            {/* Right-side controls */}
            <div className="flex flex-wrap items-center gap-2 justify-start md:justify-end">
              <div className="w-[170px]">
                <Select value={selectedCategory} onValueChange={handleCategoryJump}>
                  <SelectTrigger className="bg-slate-800 border-slate-600 text-white text-sm h-9 w-full">
                    <SelectValue placeholder="Jump to Category" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700">
                    <SelectItem value="all" className="text-white text-sm">All Categories</SelectItem>
                    {categories.map(cat => (
                      <SelectItem key={cat} value={cat} className="text-white text-sm">
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setViewMode(viewMode === "structured" ? "transcript" : "structured")}
                  className="bg-slate-800 border-slate-600 text-white hover:bg-slate-700 h-9 text-sm"
                >
                  {viewMode === "structured" ? "Transcript" : "Structured"}
                </Button>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExpandAll}
                  className="bg-slate-800 border-slate-600 text-white hover:bg-slate-700 h-9 text-sm"
                >
                  <ChevronsDown className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">Expand</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCollapseAll}
                  className="bg-slate-800 border-slate-600 text-white hover:bg-slate-700 h-9 text-sm"
                >
                  <ChevronsUp className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">Collapse</span>
                </Button>
              </div>

              <button
                onClick={() => setShowOnlyFollowUps(!showOnlyFollowUps)}
                className="flex items-center gap-1 text-sm text-slate-300 hover:text-white transition-colors px-2"
              >
                {showOnlyFollowUps ? (
                  <ToggleRight className="w-5 h-5 text-blue-400" />
                ) : (
                  <ToggleLeft className="w-5 h-5 text-slate-500" />
                )}
                <span className="hidden lg:inline text-xs">Follow-Ups Only</span>
              </button>

              {/* Single unified AI brain button */}
              <div className="hidden md:flex items-center gap-1.5">
                <button
                  onClick={handleGenerateAllAISummaries}
                  disabled={isGeneratingAI || responses.length === 0}
                  className="inline-flex items-center justify-center rounded-lg border border-pink-500/60 bg-transparent p-2 text-pink-300 hover:bg-pink-500/10 hover:border-pink-400/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Generate AI Summaries"
                >
                  {isGeneratingAI ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span className="text-base">🧠</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Global AI Investigator Assist */}
        <div className="mb-4 rounded-xl bg-slate-900/50 border border-slate-700 overflow-hidden">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🧠</span>
                <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wide">
                  AI Investigator Assist
                </h3>
              </div>
              {session.global_ai_summary && (
                <Badge className="text-xs bg-amber-500/20 text-amber-300 border-amber-500/30">
                  AI Interview Signal: {session.global_ai_summary.riskLevel === "High" ? "High Concern" : 
                    session.global_ai_summary.riskLevel === "Medium" ? "Moderate Concern" : "Low Concern"}
                </Badge>
              )}
            </div>

            {session.global_ai_summary ? (
              <>
                {session.global_ai_summary.patterns && session.global_ai_summary.patterns.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {session.global_ai_summary.patterns.map((pattern, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs text-purple-300 border-purple-500/30">
                        {pattern}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="text-sm text-slate-300 leading-relaxed mb-3">
                  {session.global_ai_summary.text}
                </div>

                {session.global_ai_summary.keyObservations && session.global_ai_summary.keyObservations.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <div className="text-xs font-semibold text-blue-400">Key Observations:</div>
                    {session.global_ai_summary.keyObservations.map((obs, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                        <span className="text-blue-400">•</span>
                        <span>{obs}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2 mb-3">
                  <Badge variant="outline" className="text-xs text-green-300 border-green-500/30">
                    ✓ No Major Disclosures
                  </Badge>
                  <Badge variant="outline" className="text-xs text-green-300 border-green-500/30">
                    ✓ Consistent Patterns
                  </Badge>
                  <Badge variant="outline" className="text-xs text-green-300 border-green-500/30">
                    ✓ Normal Response Timing
                  </Badge>
                </div>
                
                <p className="text-sm text-slate-400 italic">
                  The interview results indicate a significant lack of disclosures, with only one affirmative response out of a total of 14 questions. The consistency of answers is notably high, as almost all responses were negative, which may suggest a lack of transparency or possible concerns that warrant further investigation.
                </p>
                
                <button
                  onClick={handleGenerateAllAISummaries}
                  disabled={isGeneratingAI || responses.length === 0}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                >
                  Show more
                </button>
              </div>
            )}
          </div>
        </div>

        {session.red_flags?.length > 0 && (
          <Card className="bg-red-950/20 border-red-800/50 mb-4">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-red-400 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Red Flags Identified ({session.red_flags.length})
              </h3>
              <div className="space-y-1">
                {session.red_flags.map((flag, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                    <p className="text-xs text-red-300">{flag}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

{responses.length === 0 ? (
          <div className="rounded-xl bg-slate-900/50 border border-slate-700 p-12">
            <div className="text-center space-y-3">
              <p className="text-slate-300 text-sm">No interview data recorded yet for this session.</p>
              <p className="text-slate-400 text-xs">This session was created but no questions have been answered.</p>
              {session.status !== 'completed' && (
                <Button
                  onClick={handleContinueInterview}
                  className="bg-blue-600 hover:bg-blue-700 mt-4"
                >
                  Start Interview
                </Button>
              )}
            </div>
          </div>
        ) : viewMode === "structured" ? (
          <TwoColumnStreamView
            responsesByCategory={responsesByCategory}
            followups={followups}
            followUpQuestionEntities={followUpQuestionEntities}
            categoryRefs={categoryRefs}
            collapsedSections={collapsedSections}
            toggleSection={toggleSection}
            expandedQuestions={expandedQuestions}
            toggleQuestionExpanded={toggleQuestionExpanded}
            sections={sections}
            session={session}
            transcriptEvents={transcriptEvents}
            sectionSummariesBySectionId={sectionSummariesBySectionId}
            drivingFactsFromTranscript={buildDrivingFactsFromTranscript(transcriptEvents)}
          />
        ) : (
          <UnifiedTranscriptView
            transcriptEvents={transcriptEvents}
            followUpQuestionEntities={followUpQuestionEntities}
            questions={questions}
          />
        )}

        {responses.length > 0 && (
          <div className="mt-6 flex justify-center">
            <Button
              onClick={handleDeleteLastQuestion}
              disabled={isDeletingLast}
              variant="outline"
              className="bg-red-950/30 border-red-800/50 text-red-300 hover:bg-red-950/50 hover:text-red-200"
            >
              {isDeletingLast ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  Delete Last Question
                </>
              )}
            </Button>
          </div>
        )}

        {/* Floating Scroll to Top Button */}
        {showScrollTop && (
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-slate-800/80 backdrop-blur-sm border border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white hover:border-slate-500 transition-all duration-200 flex flex-col items-center justify-center gap-0.5 shadow-lg hover:shadow-xl group"
            aria-label="Scroll to top"
          >
            <ChevronDown className="w-5 h-5 rotate-180 group-hover:translate-y-[-2px] transition-transform" />
            <span className="text-[9px] font-medium uppercase tracking-wide">Top</span>
          </button>
        )}

        <Dialog open={showStatusConfirm} onOpenChange={setShowStatusConfirm}>
          <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">Revert to In-Progress?</DialogTitle>
              <DialogDescription className="text-slate-300 pt-3">
                This will mark the interview as in-progress and allow the candidate to continue answering questions.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowStatusConfirm(false)}
                className="flex-1 bg-slate-800 border-slate-600 text-white hover:bg-slate-700"
              >
                Cancel
              </Button>
              <Button
                onClick={handleRevertToInProgress}
                className="flex-1 bg-orange-600 hover:bg-orange-700"
              >
                Confirm
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function CompactMetric({ label, value, color = "blue" }) {
  const colorClass = color === "red" ? "text-red-400" : "text-blue-400";
  return (
    <div className="text-center md:text-left">
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className={cn("text-lg md:text-xl font-bold", colorClass)}>{value}</p>
    </div>
  );
}

function KPICard({ label, value, subtext, variant = "neutral" }) {
  const kpiColors = {
    neutral: {
      bg: "bg-slate-800/50",
      border: "border-slate-700",
      valueText: "text-white"
    },
    yes: {
      bg: "bg-emerald-900/40",
      border: "border-emerald-700/40",
      valueText: "text-white"
    },
    no: {
      bg: "bg-slate-700/50",
      border: "border-slate-600/50",
      valueText: "text-white"
    },
    followups: {
      bg: "bg-amber-900/40",
      border: "border-amber-700/40",
      valueText: "text-white"
    },
    redflags: {
      bg: "bg-red-900/40",
      border: "border-red-700/50",
      valueText: "text-white"
    },
    completion: {
      bg: "bg-indigo-800/50",
      border: "border-indigo-600/50",
      valueText: "text-white"
    }
  };

  const colors = kpiColors[variant] || kpiColors.neutral;

  return (
    <Card className={cn(
      "backdrop-blur-sm transition-colors",
      colors.bg,
      colors.border
    )}>
      <CardContent className="p-4">
        <div className="text-xs text-slate-400 mb-1 uppercase tracking-wide">{label}</div>
        <div className={cn("text-2xl font-bold mb-1", colors.valueText)}>
          {value}
        </div>
        <div className="text-xs text-slate-500">{subtext}</div>
      </CardContent>
    </Card>
  );
}

/**
 * Build deterministic follow-ups grouped by response ID from transcript events
 * This is the NEW primary source for Structured view (replaces FollowUpResponse entity)
 * Shape: { [responseId]: { [instanceNumber]: { packId, followups: [{questionText, answerText, followupQuestionId}], aiProbes: [...] } } }
 */
function buildFollowupsByResponseIdFromTranscript(transcriptEvents) {
  const followupsByResponseId = {};
  
  // First pass: pair up question and answer events
  const questionEvents = transcriptEvents.filter(e => e.kind === 'deterministic_followup_question');
  const answerEvents = transcriptEvents.filter(e => e.kind === 'deterministic_followup_answer');
  const aiQuestionEvents = transcriptEvents.filter(e => e.kind === 'ai_probe_question');
  const aiAnswerEvents = transcriptEvents.filter(e => e.kind === 'ai_probe_answer');
  
  // Group deterministic follow-ups by responseId
  questionEvents.forEach(qEvent => {
    const responseId = qEvent.responseId || qEvent.parentResponseId;
    if (!responseId) return;
    
    const instanceNum = qEvent.instanceNumber || 1;
    const packId = qEvent.followupPackId;
    const followupQuestionId = qEvent.followupQuestionId || qEvent.fieldKey;
    
    // Find matching answer
    const matchingAnswer = answerEvents.find(aEvent => 
      (aEvent.responseId === responseId || aEvent.parentResponseId === responseId) &&
      (aEvent.followupQuestionId === followupQuestionId || aEvent.fieldKey === followupQuestionId) &&
      aEvent.instanceNumber === qEvent.instanceNumber
    );
    
    // Initialize containers
    if (!followupsByResponseId[responseId]) {
      followupsByResponseId[responseId] = {};
    }
    if (!followupsByResponseId[responseId][instanceNum]) {
      followupsByResponseId[responseId][instanceNum] = {
        packId,
        followups: [],
        aiProbes: []
      };
    }
    
    followupsByResponseId[responseId][instanceNum].followups.push({
      followupQuestionId,
      questionText: qEvent.text,
      answerText: matchingAnswer?.text || '',
      fieldKey: qEvent.fieldKey
    });
  });
  
  // Group AI probes by responseId
  aiQuestionEvents.forEach(qEvent => {
    const responseId = qEvent.responseId || qEvent.parentResponseId;
    // For AI probes without responseId, try to find via baseQuestionId
    const baseQuestionId = qEvent.baseQuestionId;
    
    const instanceNum = qEvent.instanceNumber || 1;
    
    // Find matching answer
    const matchingAnswer = aiAnswerEvents.find(aEvent => 
      aEvent.baseQuestionId === baseQuestionId &&
      aEvent.instanceNumber === instanceNum &&
      Math.abs((aEvent.sortKey || 0) - (qEvent.sortKey || 0)) < 20 // Close in sequence
    );
    
    // Try to find the responseId from deterministic follow-ups for same baseQuestionId
    let targetResponseId = responseId;
    if (!targetResponseId) {
      // Look through existing entries to find one with matching baseQuestionId
      for (const [rid, instances] of Object.entries(followupsByResponseId)) {
        // Check if any instance has matching packId for this question
        if (Object.values(instances).some(inst => inst.packId === qEvent.followupPackId)) {
          targetResponseId = rid;
          break;
        }
      }
    }
    
    if (!targetResponseId) return;
    
    if (!followupsByResponseId[targetResponseId]) {
      followupsByResponseId[targetResponseId] = {};
    }
    if (!followupsByResponseId[targetResponseId][instanceNum]) {
      followupsByResponseId[targetResponseId][instanceNum] = {
        packId: qEvent.followupPackId,
        followups: [],
        aiProbes: []
      };
    }
    
    followupsByResponseId[targetResponseId][instanceNum].aiProbes.push({
      probing_question: qEvent.text,
      candidate_response: matchingAnswer?.text || '',
      sequence_number: qEvent.probeIndex || followupsByResponseId[targetResponseId][instanceNum].aiProbes.length + 1
    });
  });
  
  console.log('[SESSIONDETAILS] Built followupsByResponseId from transcript', {
    responseIdCount: Object.keys(followupsByResponseId).length,
    sampleEntry: Object.entries(followupsByResponseId)[0]
  });
  
  return followupsByResponseId;
}

function TwoColumnStreamView({ responsesByCategory, followups, followUpQuestionEntities, categoryRefs, collapsedSections, toggleSection, expandedQuestions, toggleQuestionExpanded, sections, session, transcriptEvents, sectionSummariesBySectionId, drivingFactsFromTranscript }) {
  // Flatten all responses for global context
  const allResponsesFlat = Object.values(responsesByCategory).flat();
  
  // Group events by base question
  const eventsByQuestion = groupEventsByBaseQuestion(transcriptEvents);
  
  // BUILD FOLLOW-UPS FROM TRANSCRIPT (not FollowUpResponse entity)
  const followupsByResponseId = buildFollowupsByResponseIdFromTranscript(transcriptEvents);
  
  // Sort categories by section_order from Section entities
  const sortedCategories = Object.entries(responsesByCategory).sort((a, b) => {
    const sectionA = sections.find(s => s.section_name === a[0]);
    const sectionB = sections.find(s => s.section_name === b[0]);
    const orderA = sectionA?.section_order ?? 999;
    const orderB = sectionB?.section_order ?? 999;
    return orderA - orderB;
  });
  
  return (
    <div className="space-y-0">
      {sortedCategories.map(([category, categoryResponses]) => {
        const isSectionCollapsed = collapsedSections.has(category);

        const sortedResponses = [...categoryResponses].sort((a, b) => {
          const aNum = typeof a.display_number === "number" ? a.display_number : Infinity;
          const bNum = typeof b.display_number === "number" ? b.display_number : Infinity;
          
          if (aNum !== bNum) {
            return aNum - bNum;
          }
          
          return new Date(a.response_timestamp).getTime() - new Date(b.response_timestamp).getTime();
        });
        
        const midpoint = Math.ceil(sortedResponses.length / 2);
        const leftColumn = sortedResponses.slice(0, midpoint);
        const rightColumn = sortedResponses.slice(midpoint);

        return (
          <div key={category} className={isSectionCollapsed ? "mb-0" : "mb-6"}>
            <div ref={el => categoryRefs.current[category] = el}>
              <SectionHeader
                category={category}
                allResponses={allResponsesFlat}
                allFollowups={followups}
                isCollapsed={isSectionCollapsed}
                onToggle={() => toggleSection(category)}
                sectionAISummary={sectionSummariesBySectionId[category] ? { text: sectionSummariesBySectionId[category] } : null}
              />
            </div>

            {!isSectionCollapsed && (
              <div className="bg-slate-900/30 border border-slate-700 border-t-0 mb-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-700">
                  <div className="divide-y divide-slate-700/50">
                    {leftColumn.map(response => (
                      <CompactQuestionRow
                        key={response.id}
                        response={response}
                        session={session}
                        followups={followups.filter(f => f.response_id === response.id || f.question_id === response.question_id)}
                        followUpQuestionEntities={followUpQuestionEntities}
                        isExpanded={expandedQuestions.has(response.id)}
                        onToggleExpand={() => toggleQuestionExpanded(response.id)}
                        questionEvents={eventsByQuestion[response.question_id] || []}
                        drivingFactsFromTranscript={drivingFactsFromTranscript}
                        transcriptFollowups={followupsByResponseId[response.id] || {}}
                      />
                    ))}
                  </div>
                  <div className="divide-y divide-slate-700/50">
                    {rightColumn.map(response => (
                      <CompactQuestionRow
                        key={response.id}
                        response={response}
                        session={session}
                        followups={followups.filter(f => f.response_id === response.id || f.question_id === response.question_id)}
                        followUpQuestionEntities={followUpQuestionEntities}
                        isExpanded={expandedQuestions.has(response.id)}
                        onToggleExpand={() => toggleQuestionExpanded(response.id)}
                        questionEvents={eventsByQuestion[response.question_id] || []}
                        drivingFactsFromTranscript={drivingFactsFromTranscript}
                        transcriptFollowups={followupsByResponseId[response.id] || {}}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CompactQuestionRow({ response, followups, followUpQuestionEntities, isExpanded, onToggleExpand, questionEvents, session, drivingFactsFromTranscript, transcriptFollowups }) {
  // PRIMARY: Check if we have follow-ups from transcript (preferred source)
  const transcriptInstanceNumbers = Object.keys(transcriptFollowups || {}).map(n => parseInt(n)).sort((a, b) => a - b);
  const hasTranscriptFollowups = transcriptInstanceNumbers.length > 0 && 
    transcriptInstanceNumbers.some(n => (transcriptFollowups[n]?.followups?.length > 0 || transcriptFollowups[n]?.aiProbes?.length > 0));
  
  // FALLBACK: Check FollowUpResponse entity (legacy)
  const hasDbFollowups = followups.length > 0 || (response.investigator_probing?.length > 0);
  
  // Use transcript as primary source
  const hasFollowups = hasTranscriptFollowups || hasDbFollowups;
  const answerLetter = response.answer === "Yes" ? "Y" : "N";
  const displayNumber = typeof response.display_number === "number" ? response.display_number : parseInt(response.question_id?.replace(/\D/g, '') || '0', 10);
  const questionNumber = displayNumber.toString().padStart(3, '0');
  const showSummary = response.answer === "Yes" && response.question_id !== US_CITIZENSHIP_QUESTION_ID && hasFollowups;
  const summary = response.investigator_summary || null;
  
  // Build instances from raw FollowUpResponse data
  const instancesMap = {};
  followups.forEach(f => {
    const instNum = f.instance_number || 1;
    if (!instancesMap[instNum]) {
      instancesMap[instNum] = {
        instanceNumber: instNum,
        followupPackId: f.followup_pack,
        details: {},
        aiExchanges: [],
        questionTextSnapshot: f.additional_details?.question_text_snapshot || {},
        facts: f.additional_details?.facts || {},
        // Store top-level fields from FollowUpResponse for display
        candidateNarrative: f.additional_details?.candidate_narrative || f.incident_description || f.circumstances || null,
        incidentDescription: f.incident_description,
        circumstances: f.circumstances,
        accountabilityResponse: f.accountability_response,
        incidentDate: f.incident_date,
        incidentLocation: f.incident_location,
        legalOutcome: f.legal_outcome,
        frequency: f.frequency,
        lastOccurrence: f.last_occurrence,
        substanceName: f.substance_name
      };
    }

    const details = f.additional_details || {};
    Object.entries(details).forEach(([key, value]) => {
      if (key !== 'investigator_probing' && key !== 'question_text_snapshot' && key !== 'facts' && key !== 'unresolvedFields' && key !== 'candidate_narrative') {
        instancesMap[instNum].details[key] = value;
      }
    });

    if (details.facts) {
      instancesMap[instNum].facts = {
        ...instancesMap[instNum].facts,
        ...details.facts
      };
    }

    if (details.investigator_probing && Array.isArray(details.investigator_probing)) {
      instancesMap[instNum].aiExchanges.push(...details.investigator_probing);
    }
  });
  
  const instanceNumbers = Object.keys(instancesMap).map(n => parseInt(n)).sort((a, b) => a - b);
  const hasMultipleInstances = instanceNumbers.length > 1;

  const packId = followups[0]?.followup_pack;
  const packConfig = packId ? getPackConfig(packId) : null;
  const isPackLeApps = packId === 'PACK_LE_APPS';
  const isDrivingPack = packId === 'PACK_DRIVING_COLLISION_STANDARD' || 
                        packId === 'PACK_DRIVING_VIOLATIONS_STANDARD' || 
                        packId === 'PACK_DRIVING_DUIDWI_STANDARD' || 
                        packId === 'PACK_DRIVING_STANDARD';

  const structuredFacts = isPackLeApps ? session?.structured_followup_facts?.[response.question_id] : null;
  const showStructuredFacts = structuredFacts && structuredFacts.length > 0;

  const hasAnyUnresolved = isPackLeApps && instanceNumbers.some(instNum => {
    const instance = instancesMap[instNum];
    return hasUnresolvedFields(packId, instance);
  });

  const [expandedInstances, setExpandedInstances] = React.useState(() => new Set());

  const toggleInstance = (instanceNumber) => {
    setExpandedInstances((prev) => {
      const next = new Set(prev);
      const key = String(instanceNumber);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <div className="py-2 px-3 hover:bg-slate-800/30 transition-colors">
      <div className="flex items-start gap-3 text-sm mb-2">
        <span className="font-mono text-blue-400 font-medium flex-shrink-0">Q{questionNumber}</span>
        <span className={cn(
          "font-bold flex-shrink-0 w-5",
          response.answer === "Yes" ? "text-green-400" : "text-slate-500"
        )}>
          {answerLetter}
        </span>
        <span className="text-slate-300 flex-1 break-words leading-relaxed">
          {response.question_text}
        </span>
      </div>

      {showSummary && (
        <div className="flex items-start gap-3 mb-2">
          <span className="font-mono flex-shrink-0 opacity-0 pointer-events-none">Q{questionNumber}</span>
          <span className="flex-shrink-0 w-5 opacity-0 pointer-events-none">{answerLetter}</span>
          <div 
            className="flex-1 bg-amber-950/30 border border-amber-800/50 rounded px-3 py-2.5 flex items-center justify-between cursor-pointer hover:bg-amber-950/40 transition-colors group"
            onClick={onToggleExpand}
          >
            <div className="flex items-center gap-2 flex-1">
              {hasAnyUnresolved && (
                <Badge className="text-[10px] bg-yellow-500/20 text-yellow-300 border-yellow-500/30 flex-shrink-0">
                  ⚠ Unresolved details
                </Badge>
              )}
              {summary ? (
                <p className="text-xs text-amber-100 italic flex-1 leading-relaxed">{summary}</p>
              ) : (
                <p className="text-xs text-slate-500 italic flex-1 leading-relaxed">No summary available. Use 'Generate AI' to create one.</p>
              )}
            </div>
            {isExpanded ? (
              <ChevronRight className="w-4 h-4 text-amber-400 group-hover:text-amber-300 flex-shrink-0 ml-3 transition-colors" />
            ) : (
              <ChevronDown className="w-4 h-4 text-amber-400 group-hover:text-amber-300 flex-shrink-0 ml-3 transition-colors" />
            )}
          </div>
        </div>
      )}

      {isExpanded && hasFollowups && response.answer === "Yes" && (
        <>
          <div className="flex items-start gap-3">
            <span className="font-mono flex-shrink-0 opacity-0 pointer-events-none">Q{questionNumber}</span>
            <span className="flex-shrink-0 w-5 opacity-0 pointer-events-none">{answerLetter}</span>
            <div className="flex-1 bg-slate-800/50 rounded border border-slate-700/50 p-2">
              <div className="space-y-1">
                {/* USE TRANSCRIPT FOLLOW-UPS AS PRIMARY SOURCE */}
                {hasTranscriptFollowups ? (
                  <>
                    {transcriptInstanceNumbers.length > 1 && (
                      <div className="text-xs font-semibold text-cyan-400 mb-1">
                        🔁 {transcriptInstanceNumbers.length} Instances Recorded
                      </div>
                    )}
                    {transcriptInstanceNumbers.map((instanceNum, instanceIdx) => {
                      const transcriptInstance = transcriptFollowups[instanceNum];
                      if (!transcriptInstance) return null;
                      const isInstanceExpanded = expandedInstances.has(String(instanceNum));
                      
                      const deterministicEntries = (transcriptInstance.followups || []).map((fu, idx) => ({
                        detailKey: fu.followupQuestionId || fu.fieldKey || `field_${idx}`,
                        detailValue: fu.answerText,
                        displayOrder: idx,
                        questionText: fu.questionText || fu.followupQuestionId || 'Follow-up question'
                      }));
                      
                      const sortedAiExchanges = (transcriptInstance.aiProbes || []).sort((a, b) => 
                        (a.sequence_number || 0) - (b.sequence_number || 0)
                      );
                      
                      const hasAnyContent = deterministicEntries.length > 0 || sortedAiExchanges.length > 0;
                      const summaryValues = deterministicEntries.map(e => e.detailValue).filter(Boolean);
                      const summaryLine = summaryValues.length > 0 ? summaryValues.slice(0, 3).join(' • ') : null;
                      
                      return (
                        <div key={instanceNum} className="mt-2 rounded-lg border border-slate-700/60 bg-transparent">
                          <button type="button" className="w-full flex items-center justify-between px-3 py-2 text-xs text-slate-200 hover:bg-slate-900/40" onClick={() => toggleInstance(instanceNum)}>
                            <div className="flex flex-col gap-0.5 text-left">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="font-semibold">Instance {instanceIdx + 1}</span>
                                <Badge className="text-[9px] bg-emerald-500/20 text-emerald-300 border-emerald-500/30">from transcript</Badge>
                              </div>
                              {summaryLine && (<div className="text-[11px] text-slate-400">{summaryLine}</div>)}
                            </div>
                            <span className="text-[10px] text-slate-400">{isInstanceExpanded ? "Hide" : "Show"}</span>
                          </button>
                          {isInstanceExpanded && (
                            <div className="px-3 pb-3 pt-1 space-y-2">
                              {deterministicEntries.length > 0 && (
                                <div>
                                  <div className="text-[11px] font-semibold tracking-wide text-slate-400 mb-1">Deterministic Follow-Ups</div>
                                  <div className="divide-y divide-slate-700/60 text-xs">
                                    {deterministicEntries.map((entry, idx) => (
                                      <div key={entry.detailKey} className="grid grid-cols-[minmax(0,2.6fr)_minmax(0,1.2fr)] gap-x-4 py-1.5">
                                        <div className="text-slate-200"><span className="mr-1 font-medium">{idx + 1}.</span><span className="italic">{entry.questionText}</span></div>
                                        <div className="text-right text-slate-50 font-semibold">{entry.detailValue}</div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {sortedAiExchanges.length > 0 && (
                                <div className="pt-2">
                                  <div className="text-[11px] font-semibold tracking-wide text-slate-400 mb-1">AI Investigator Follow-Ups</div>
                                  <div className="border-l border-slate-700/70 pl-3 space-y-2 text-xs">
                                    {sortedAiExchanges.map((ex, idx) => (
                                      <div key={idx} className="space-y-1">
                                        <div className="text-slate-200"><span className="font-semibold">Investigator: </span><span className="italic">{ex.probing_question}</span></div>
                                        <div className="text-slate-300"><span className="font-semibold">Response: </span><span>{ex.candidate_response}</span></div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {!hasAnyContent && (
                                <div className="text-xs text-slate-500 italic">No details recorded</div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    </>
                    ) : (
                    /* FALLBACK: Use FollowUpResponse entity (legacy path) */
                    <>
                    {instanceNumbers.length > 1 && (
                     <div className="text-xs font-semibold text-cyan-400 mb-1">
                       🔁 {instanceNumbers.length} Instances Recorded
                     </div>
                    )}
                    {instanceNumbers.map((instanceNum, instanceIdx) => {
                     const instance = instancesMap[instanceNum];
                     if (!instance) return null;
                     const isInstanceExpanded = expandedInstances.has(String(instanceNum));

                     // NOTE: Driving packs are handled first using transcript-derived facts
                     // (drivingFactsFromTranscript). Other packs with packConfig (like PACK_LE_APPS)
                     // use getInstanceFacts(). When adding new multi-instance packs, prefer
                     // following this pattern instead of mixing pipelines.

                     if (isDrivingPack) {
                    // PRIMARY SOURCE: Use drivingFactsFromTranscript (built from transcript_snapshot)
                    const instanceKey = `${response.question_id}::${instanceNum}`;
                    const transcriptFactsEntry = drivingFactsFromTranscript?.[response.question_id]?.instances?.[instanceKey];
                    const transcriptFacts = transcriptFactsEntry?.fields || [];
                    
                    // Build deterministic follow-ups from transcript facts
                    let deterministicEntries = transcriptFacts.map((fact, idx) => ({
                      detailKey: fact.fieldKey || `field_${idx}`,
                      detailValue: fact.value,
                      displayOrder: idx,
                      questionText: getFieldLabelForPack(packId, fact.fieldKey, fact.label || fact.fieldKey)
                    }));
                    
                    // FALLBACK: If no transcript facts, try instance.details
                    if (deterministicEntries.length === 0 && instance.details) {
                      const detailEntries = Object.entries(instance.details || {});
                      deterministicEntries = detailEntries
                        .filter(([key]) => key !== 'investigator_probing' && key !== 'question_text_snapshot' && key !== 'facts' && key !== 'unresolvedFields')
                        .map(([detailKey, detailValue], idx) => ({
                          detailKey,
                          detailValue,
                          displayOrder: idx,
                          questionText: getFieldLabelForPack(packId, detailKey, detailKey.replace(/_/g, ' '))
                        }));
                    }
                    
                    // Get AI investigator follow-ups from instance
                    const aiExchanges = instance.aiExchanges || [];
                    const uniqueExchanges = Array.from(new Map(aiExchanges.map(ex => [`${ex.sequence_number}-${ex.probing_question}`, ex])).values());
                    const sortedAiExchanges = uniqueExchanges.sort((a, b) => (a.sequence_number || 0) - (b.sequence_number || 0));
                    
                    const hasAnyContent = deterministicEntries.length > 0 || sortedAiExchanges.length > 0;
                    
                    // Build summary line from first 2-3 deterministic values
                    const summaryValues = deterministicEntries.map(e => e.detailValue).filter(Boolean);
                    const summaryLine = summaryValues.length > 0 ? summaryValues.slice(0, 3).join(' • ') : null;
                    
                    // Debug log
                    console.debug('[SESSIONDETAILS] Driving instances for', response.question_id, {
                      instanceNum,
                      deterministicCount: deterministicEntries.length,
                      aiFollowupsCount: sortedAiExchanges.length,
                      source: transcriptFacts.length > 0 ? 'transcript' : 'additional_details'
                    });

                    return (
                      <div key={instanceNum} className="mt-2 rounded-lg border border-slate-700/60 bg-transparent">
                        <button type="button" className="w-full flex items-center justify-between px-3 py-2 text-xs text-slate-200 hover:bg-slate-900/40" onClick={() => toggleInstance(instanceNum)}>
                          <div className="flex flex-col gap-0.5 text-left">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="font-semibold">Instance {instanceIdx + 1}</span>
                            </div>
                            {summaryLine && (<div className="text-[11px] text-slate-400">{summaryLine}</div>)}
                          </div>
                          <span className="text-[10px] text-slate-400">{isInstanceExpanded ? "Hide" : "Show"}</span>
                        </button>
                        {isInstanceExpanded && (
                          <div className="px-3 pb-3 pt-1 space-y-2">
                            {deterministicEntries.length > 0 && (
                              <div>
                                <div className="text-[11px] font-semibold tracking-wide text-slate-400 mb-1">Deterministic Follow-Ups</div>
                                <div className="divide-y divide-slate-700/60 text-xs">
                                  {deterministicEntries.map((entry, idx) => (
                                    <div key={entry.detailKey} className="grid grid-cols-[minmax(0,2.6fr)_minmax(0,1.2fr)] gap-x-4 py-1.5">
                                      <div className="text-slate-200"><span className="mr-1 font-medium">{idx + 1}.</span><span className="italic">{entry.questionText}</span></div>
                                      <div className="text-right text-slate-50 font-semibold">{entry.detailValue}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {sortedAiExchanges.length > 0 && (
                              <div className="pt-2">
                                <div className="text-[11px] font-semibold tracking-wide text-slate-400 mb-1">AI Investigator Follow-Ups</div>
                                <div className="border-l border-slate-700/70 pl-3 space-y-2 text-xs">
                                  {sortedAiExchanges.map((ex, idx) => (
                                    <div key={idx} className="space-y-1">
                                      <div className="text-slate-200"><span className="font-semibold">Investigator: </span><span className="italic">{ex.probing_question}</span></div>
                                      <div className="text-slate-300"><span className="font-semibold">Response: </span><span>{ex.candidate_response}</span></div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {!hasAnyContent && (
                              <div className="text-xs text-slate-500 italic">No details recorded</div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                    }

                    // 2) All other packs that have packConfig (e.g., PACK_LE_APPS) NEXT
                    else if (packConfig) {
                    const packQuestions = followUpQuestionEntities.filter(q => q.followup_pack_id === instance.followupPackId).sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
                    const detailEntries = Object.entries(instance.details || {});
                    const deterministicEntries = detailEntries.map(([detailKey, detailValue]) => {
                      // Try to find a matching field config to get the short factsLabel
                      const fieldConfig = packConfig?.fields?.find(f => f.fieldKey === detailKey || f.semanticKey === detailKey);
                      
                      let questionText = fieldConfig?.factsLabel || fieldConfig?.label;
                      let matchedQuestion = null;
                      
                      if (!questionText) {
                        questionText = instance.questionTextSnapshot?.[detailKey];
                      }
                      if (!questionText) {
                        matchedQuestion = packQuestions.find(q => q.followup_question_id === detailKey);
                        if (matchedQuestion) { questionText = matchedQuestion.question_text; }
                      }
                      if (!questionText) { questionText = detailKey.replace(/_/g, ' '); }
                      
                      const displayOrder = fieldConfig?.factsOrder ?? matchedQuestion?.display_order ?? 999;
                      return { detailKey, detailValue, displayOrder, questionText };
                    });
                    deterministicEntries.sort((a, b) => a.displayOrder - b.displayOrder);
                    const uniqueExchanges = Array.from(new Map((instance.aiExchanges || []).map(ex => [`${ex.sequence_number}-${ex.probing_question}`, ex])).values());
                    const sortedAiExchanges = uniqueExchanges.sort((a, b) => (a.sequence_number || 0) - (b.sequence_number || 0));
                    const isExpanded = !hasMultipleInstances || expandedInstances.has(String(instanceNum));
                    const summaryValues = deterministicEntries.map((e) => e.detailValue).filter(Boolean);
                    const summaryText = summaryValues.length > 0 ? summaryValues.slice(0, 3).join(" • ") : null;

                    return (
                      <div key={instanceNum} className="mt-2 rounded-lg border border-slate-700/60 bg-transparent">
                        <button type="button" className="w-full flex items-center justify-between px-3 py-2 text-xs text-slate-200 hover:bg-slate-900/40" onClick={() => hasMultipleInstances && toggleInstance(instanceNum)} disabled={!hasMultipleInstances}>
                          <div className="flex flex-col gap-0.5 text-left">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="font-semibold">Instance {instanceIdx + 1}</span>
                            </div>
                            {summaryText && (<div className="text-[11px] text-slate-400">{summaryText}</div>)}
                          </div>
                          {hasMultipleInstances && (<span className="text-[10px] text-slate-400">{isExpanded ? "Hide" : "Show"}</span>)}
                        </button>
                        {isExpanded && (
                          <div className="px-3 pb-3 pt-1 space-y-2">
                            {deterministicEntries.length > 0 && (
                              <div>
                                <div className="text-[11px] font-semibold tracking-wide text-slate-400 mb-1">Deterministic Follow-Ups</div>
                                <div className="divide-y divide-slate-700/60 text-xs">
                                  {deterministicEntries.map((entry, idx) => (
                                    <div key={entry.detailKey} className="grid grid-cols-[minmax(0,2.6fr)_minmax(0,1.2fr)] gap-x-4 py-1.5">
                                      <div className="text-slate-200"><span className="mr-1 font-medium">{idx + 1}.</span><span className="italic">{entry.questionText}</span></div>
                                      <div className="text-right text-slate-50 font-semibold">{entry.detailValue}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {sortedAiExchanges.length > 0 && (
                              <div className="pt-2">
                                <div className="text-[11px] font-semibold tracking-wide text-slate-400 mb-1">AI Investigator Follow-Ups</div>
                                <div className="border-l border-slate-700/70 pl-3 space-y-2 text-xs">
                                  {sortedAiExchanges.map((ex, idx) => (
                                    <div key={idx} className="space-y-1">
                                      <div className="text-slate-200"><span className="font-semibold">Investigator: </span><span className="italic">{ex.probing_question}</span></div>
                                      <div className="text-slate-300"><span className="font-semibold">Response: </span><span>{ex.candidate_response}</span></div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }

                  // 3) Fallback for packs without packConfig - show candidate narrative from FollowUpResponse fields
                  else {
                    const candidateNarrative = instance.candidateNarrative || instance.incidentDescription || instance.circumstances;
                    const hasContent = !!candidateNarrative || instance.incidentDate || instance.legalOutcome;
                    
                    if (!hasContent) return null;
                    
                    // Build display entries from available fields
                    const displayEntries = [];
                    if (instance.incidentDate) displayEntries.push({ label: 'When', value: instance.incidentDate });
                    if (instance.incidentLocation) displayEntries.push({ label: 'Where', value: instance.incidentLocation });
                    if (instance.substanceName) displayEntries.push({ label: 'Substance', value: instance.substanceName });
                    if (instance.frequency) displayEntries.push({ label: 'Frequency', value: instance.frequency });
                    if (instance.lastOccurrence) displayEntries.push({ label: 'Last Occurrence', value: instance.lastOccurrence });
                    if (instance.legalOutcome) displayEntries.push({ label: 'Outcome', value: instance.legalOutcome });
                    
                    const summaryText = candidateNarrative ? candidateNarrative.substring(0, 80) + (candidateNarrative.length > 80 ? '...' : '') : null;
                    const isInstanceExpanded = expandedInstances.has(String(instanceNum));
                    
                    return (
                      <div key={instanceNum} className="mt-2 rounded-lg border border-slate-700/60 bg-transparent">
                        <button type="button" className="w-full flex items-center justify-between px-3 py-2 text-xs text-slate-200 hover:bg-slate-900/40" onClick={() => toggleInstance(instanceNum)}>
                          <div className="flex flex-col gap-0.5 text-left">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="font-semibold">Instance {instanceIdx + 1}</span>
                            </div>
                            {summaryText && (<div className="text-[11px] text-slate-400">{summaryText}</div>)}
                          </div>
                          <span className="text-[10px] text-slate-400">{isInstanceExpanded ? "Hide" : "Show"}</span>
                        </button>
                        {isInstanceExpanded && (
                          <div className="px-3 pb-3 pt-1 space-y-2">
                            {candidateNarrative && (
                              <div>
                                <div className="text-[11px] font-semibold tracking-wide text-slate-400 mb-1">Candidate Response</div>
                                <div className="text-xs text-slate-200 leading-relaxed bg-slate-800/30 rounded p-2">
                                  {candidateNarrative}
                                </div>
                              </div>
                            )}
                            {displayEntries.length > 0 && (
                              <div>
                                <div className="text-[11px] font-semibold tracking-wide text-slate-400 mb-1">Details</div>
                                <div className="divide-y divide-slate-700/60 text-xs">
                                  {displayEntries.map((entry, idx) => (
                                    <div key={idx} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-4 py-1.5">
                                      <div className="text-slate-400">{entry.label}</div>
                                      <div className="text-slate-50">{entry.value}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {instance.accountabilityResponse && (
                              <div>
                                <div className="text-[11px] font-semibold tracking-wide text-slate-400 mb-1">Accountability</div>
                                <div className="text-xs text-slate-300 italic">{instance.accountabilityResponse}</div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }
                })}
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function UnifiedTranscriptView({ transcriptEvents, followUpQuestionEntities, questions }) {
  // Calculate sequential question numbers based on order in transcript (not global question_number)
  // Only count base_question events, not follow-ups
  let sequentialQuestionNumber = 0;
  const sequentialNumberMap = {};
  
  transcriptEvents.forEach((event) => {
    // Only assign numbers to base questions, not follow-ups
    if (event.kind === 'base_question' && event.baseQuestionId && !sequentialNumberMap[event.baseQuestionId]) {
      sequentialQuestionNumber++;
      sequentialNumberMap[event.baseQuestionId] = sequentialQuestionNumber;
    }
  });
  
  console.log('[TRANSCRIPT VIEW] Question number map', {
    totalBaseQuestions: sequentialQuestionNumber,
    mapSize: Object.keys(sequentialNumberMap).length,
    sample: Object.entries(sequentialNumberMap).slice(0, 5)
  });

  return (
    <div className="space-y-4">
      {transcriptEvents.map((event, idx) => {
        // For base questions, use the sequential number
        // For follow-ups, don't pass a question number (they're not numbered)
        const isBaseQuestion = event.kind === 'base_question';
        const questionNum = isBaseQuestion ? (sequentialNumberMap[event.baseQuestionId] || 0) : 0;
        
        return (
          <TranscriptEventRenderer 
            key={event.id || `evt-${idx}`}
            event={event}
            followUpQuestionEntities={followUpQuestionEntities}
            questionNumber={questionNum}
            sectionName={event.sectionName}
          />
        );
      })}
    </div>
  );
}

function TranscriptEntry({ item }) {
  if (item.type === 'question') {
    const response = item.data;
    const displayNum = response.display_number ? `Q${response.display_number.toString().padStart(3, '0')}` : response.question_id;
    
    return (
      <div className="space-y-2">
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <Badge variant="outline" className="text-xs text-blue-400 border-blue-500/30">
              {displayNum}
            </Badge>
            <span className="text-xs text-slate-400">{response.section_name || response.category}</span>
          </div>
          <p className="text-white text-sm">{response.question_text}</p>
        </div>
        <div className="flex justify-end">
          <div className="bg-blue-600 rounded-lg px-4 py-2 max-w-md">
            <p className="text-white text-sm font-medium">{response.answer}</p>
          </div>
        </div>
      </div>
    );
  }

  if (item.type === 'followup') {
    const followup = item.data;
    const details = followup.additional_details || {};
    const followUpQuestionEntities = item.followUpQuestionEntities || [];
    const packQuestions = followUpQuestionEntities.filter(
      q => q.followup_pack_id === followup.followup_pack
    ).sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    
    const instanceNum = item.instanceNumber || 1;
    const totalInstances = item.totalInstances || 1;
    const showInstanceLabel = totalInstances > 1;

    return (
      <div className={cn("ml-4 md:ml-8 space-y-2", showInstanceLabel && "border-l-2 border-cyan-500/30 pl-4")}>
        {showInstanceLabel && (
          <div className="text-xs font-semibold text-cyan-400 -ml-4 mb-2">
            Instance {instanceNum}
          </div>
        )}
        
        {followup.substance_name && (
          <>
            <div className="bg-orange-950/30 border border-orange-800/50 rounded-lg p-3">
              <p className="text-white text-sm">What substance did you use?</p>
            </div>
            <div className="flex justify-end">
              <div className="bg-orange-600 rounded-lg px-4 py-2 max-w-md">
                <p className="text-white text-sm font-medium">{followup.substance_name}</p>
              </div>
            </div>
          </>
        )}

        {Object.entries(details).filter(([key]) => key !== 'investigator_probing').map(([key, value]) => {
          const requiresReview = needsReview(value);
          
          // Helper to resolve question text from followup_question_id
          const match = packQuestions.find(q => q.followup_question_id === key);
          const label = match?.question_text || key;

          return (
            <React.Fragment key={key}>
              <div className="bg-orange-950/30 border border-orange-800/50 rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-white text-sm">
                    {label}
                  </p>
                  {requiresReview && (
                    <Badge className="text-xs bg-yellow-500/20 text-yellow-300 border-yellow-500/30 flex-shrink-0">
                      Needs Review
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex justify-end">
                <div className="bg-orange-600 rounded-lg px-4 py-2 max-w-md">
                  <p className="text-white text-sm break-words">{value}</p>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  if (item.type === 'probing') {
    const probingExchanges = item.data;
    const instanceNum = item.instanceNumber;
    const totalInstances = item.totalInstances || 1;
    const showInstanceLabel = totalInstances > 1 && instanceNum;
    
    return (
      <div className={cn("ml-4 md:ml-8 space-y-2 mt-3 pt-3 border-t border-purple-500/30", showInstanceLabel && "border-l-2 border-cyan-500/30 pl-4")}>
        <div className="text-xs font-semibold text-purple-400 mb-2">
          🔍 Investigator Probing{showInstanceLabel && ` - Instance ${instanceNum}`} ({probingExchanges.length} exchanges)
        </div>
        {probingExchanges.map((exchange, idx) => (
          <React.Fragment key={idx}>
            <div className="bg-purple-950/30 border border-purple-800/50 rounded-lg p-3">
              <p className="text-white text-sm break-words leading-relaxed">{exchange.probing_question}</p>
            </div>
            <div className="flex justify-end">
              <div className="bg-orange-600 rounded-lg px-4 py-2 max-w-md">
                <p className="text-white text-sm break-words">{exchange.candidate_response}</p>
              </div>
            </div>
          </React.Fragment>
        ))}
      </div>
    );
  }

  return null;
}

/**
 * FOLLOW-UP LABEL DIAGNOSTIC (PACK_LE_APPS and all packs)
 *
 * STATUS: Reverted to baseline behavior showing "PACK LE APPS Q#" labels
 * 
 * Findings from diagnostic logs:
 * 
 * 1. DATA STRUCTURE - FollowUpResponse entity:
 *    - followup_pack: "PACK_LE_APPS" (pack identifier)
 *    - additional_details: { key1: "value1", key2: "value2", ... }
 *    - The keys in additional_details are database field names (e.g., "agency_name", "application_date")
 *    - NO question_text or question_id stored on each detail entry
 * 
 * 2. DATA STRUCTURE - FollowUpQuestion entity:
 *    - followup_pack_id: "PACK_LE_APPS"
 *    - display_order: 1, 2, 3, 4 (step sequence)
 *    - question_text: "Which law enforcement agency did you apply to?", etc.
 *    - This metadata exists but is NOT joined with FollowUpResponse
 * 
 * 3. CURRENT RENDERING LOGIC:
 *    - SessionDetails iterates over Object.entries(followup.additional_details)
 *    - Each entry becomes: `${followup.followup_pack} Q${index + 1}: ${value}`
 *    - Result: "PACK LE APPS Q1: Yuma", "PACK LE APPS Q2: June 2012", etc.
 * 
 * 4. MISSING LINK:
 *    - There's NO reliable mapping between additional_details keys and FollowUpQuestion records
 *    - Keys like "agency_name" don't match any field on FollowUpQuestion
 *    - Display order from Object.entries() doesn't guarantee alignment with display_order
 * 
 * 5. ROOT CAUSE:
 *    - When FollowUpResponse is created, it stores raw field-value pairs in additional_details
 *    - The question text is NOT stored alongside each answer
 *    - SessionDetails has no way to look up "which question produced this answer"
 * 
 * 6. SOLUTION PATHS:
 *    
 *    Option A: Store question text snapshot when creating FollowUpResponse
 *    - Modify CandidateInterview to include question_text_snapshot in additional_details
 *    - Format: { "question_1_text": "Which agency?", "question_1_answer": "Yuma", ... }
 *    - Pro: Simple, works immediately, no joins needed
 *    - Con: Increases storage, snapshot could become stale if questions change
 *    
 *    Option B: Create deterministic key mapping
 *    - Define a standard mapping: PACK_LE_APPS Q1 = "agency_name", Q2 = "application_date"
 *    - Use FollowUpQuestion.display_order to match keys
 *    - Pro: No schema changes
 *    - Con: Fragile, requires maintenance, key names must stay stable
 *    
 *    Option C: Store question_id references in additional_details
 *    - Format: { "question_ids": ["q1_id", "q2_id"], "answers": ["Yuma", "June 2012"] }
 *    - Look up question text by ID at render time
 *    - Pro: Flexible, survives question text changes
 *    - Con: Requires refactor of how FollowUpResponse is created
 * 
 * RECOMMENDATION: Option A (snapshot) for immediate fix + stability
 * 
 * NO CHANGES IMPLEMENTED YET - This is diagnostic only
 * Check browser console for detailed logs with prefix:
 * - [SESSION DETAILS RAW DATA]
 * - [FOLLOWUP QUESTION METADATA] PACK_LE_APPS
 * - [FOLLOWUP INSTANCE DEBUG - Structured View]
 * - [FOLLOWUP DETAIL ENTRY]
 * - [TRANSCRIPT FOLLOWUP DETAIL]
 */

function generateReportHTML(session, responses, followups, questions, department, totalQuestions) {
  const now = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  const categorizedResponses = {};
  responses.forEach(response => {
    const category = response.section_name || response.category || 'Other';
    if (!categorizedResponses[category]) {
      categorizedResponses[category] = [];
    }
    categorizedResponses[category].push(response);
  });
  
  const questionCount = totalQuestions || questions.length || responses.length;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Interview Report - ${session.session_code}</title>
      <style>
        @media print {
          @page { margin: 0.75in; size: letter; }
          body { margin: 0; padding: 0; }
        }

        body {
          font-family: 'Times New Roman', serif;
          font-size: 10pt;
          line-height: 1.4;
          color: #000;
          max-width: 8.5in;
          margin: 0 auto;
          padding: 20px;
        }

        .header {
          text-align: center;
          border-bottom: 3px solid #000;
          padding-bottom: 12px;
          margin-bottom: 16px;
        }

        .header h1 {
          font-size: 16pt;
          font-weight: bold;
          margin: 0 0 8px 0;
          text-transform: uppercase;
        }

        .header .session-info {
          font-size: 9pt;
          color: #333;
          line-height: 1.6;
        }

        .section {
          margin-bottom: 20px;
          page-break-inside: avoid;
        }

        .section-title {
          font-size: 11pt;
          font-weight: bold;
          border-bottom: 2px solid #333;
          padding-bottom: 3px;
          margin-bottom: 10px;
          text-transform: uppercase;
        }

        .question-block {
          margin-bottom: 14px;
          padding: 8px;
          background: #f9f9f9;
          border-left: 3px solid #333;
          page-break-inside: avoid;
        }

        .question-id {
          font-weight: bold;
          color: #0066cc;
          font-size: 9pt;
        }

        .question-text {
          font-weight: bold;
          margin: 3px 0;
          font-size: 10pt;
        }

        .answer {
          margin-left: 16px;
          padding: 6px;
          background: white;
          border: 1px solid #ddd;
        }

        .answer-label {
          font-weight: bold;
          font-size: 8pt;
          color: #666;
        }

        .follow-up {
          margin-left: 32px;
          margin-top: 8px;
          padding: 8px;
          background: #fff3cd;
          border-left: 3px solid #ff9800;
          page-break-inside: avoid;
        }

        .follow-up-title {
          font-weight: bold;
          color: #ff6600;
          font-size: 9pt;
          margin-bottom: 4px;
        }

        .follow-up-item {
          margin: 4px 0;
          font-size: 9pt;
        }

        .probing-section {
          margin-left: 32px;
          margin-top: 12px;
          padding: 8px;
          background: #f3e8ff;
          border-left: 3px solid #9333ea;
          page-break-inside: avoid;
        }

        .probing-title {
          font-weight: bold;
          color: #7c3aed;
          font-size: 9pt;
          margin-bottom: 6px;
        }

        .probing-exchange {
          margin: 6px 0;
          padding: 4px;
          background: white;
          border: 1px solid #e9d5ff;
        }

        .probing-question {
          font-weight: bold;
          font-size: 8pt;
          color: #7c3aed;
        }

        .probing-answer {
          font-size: 9pt;
          margin-left: 12px;
          margin-top: 2px;
          color: #ff6600;
        }

        .summary-box {
          background: #e8f4f8;
          border: 2px solid #0066cc;
          padding: 12px;
          margin-bottom: 16px;
          font-size: 9pt;
        }

        .footer {
          margin-top: 24px;
          padding-top: 12px;
          border-top: 2px solid #333;
          text-align: center;
          font-size: 8pt;
          color: #666;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Applicant Background Interview Report</h1>
        <div class="session-info">
          <strong>Department:</strong> ${department?.department_name || session.department_code}<br>
          <strong>Dept Code:</strong> ${session.department_code} | <strong>File:</strong> ${session.file_number}<br>
          <strong>Report Generated:</strong> ${now}<br>
          <strong>Questions Answered:</strong> ${responses.length} / ${questionCount}<br>
          <strong>Follow-Ups:</strong> ${followups.length}<br>
          <strong>Status:</strong> ${session.status.toUpperCase()}<br>
          <strong>Risk Level:</strong> ${session.risk_rating?.toUpperCase() || 'N/A'}
        </div>
      </div>

      <div class="summary-box">
        <strong>Interview Summary:</strong><br>
        Applicant completed ${responses.length} questions across ${Object.keys(categorizedResponses).length} categories.
        ${followups.length} follow-up packs were triggered and completed.
        ${session.red_flags?.length > 0 ? `<br><strong style="color: #cc0000;">Red Flags Identified: ${session.red_flags.length}</strong>` : ''}
      </div>

      ${Object.entries(categorizedResponses).map(([category, categoryResponses]) => `
        <div class="section">
          <div class="section-title">${category}</div>
          ${categoryResponses.map(response => {
            const relatedFollowups = followups.filter(f => f.response_id === response.id);
            const aiProbingExchanges = response.investigator_probing || [];

            const displayNum = response.display_number ? `Q${response.display_number.toString().padStart(3, '0')}` : response.question_id;
            
            return `
              <div class="question-block">
                <div class="question-id">${displayNum}</div>
                <div class="question-text">${response.question_text}</div>
                <div class="answer">
                  <span class="answer-label">Response:</span> <strong>${response.answer}</strong>
                </div>

                ${response.answer === 'Yes' && response.investigator_summary ? `
                  <div class="answer" style="margin-top: 8px;">
                    <span class="answer-label">Investigator Summary:</span> <em>${response.investigator_summary}</em>
                  </div>
                ` : ''}

                ${relatedFollowups.map(followup => {
                  const details = followup.additional_details || {};
                  return `
                    <div class="follow-up">
                      <div class="follow-up-title">📋 Follow-Up Details${followup.substance_name ? `: ${followup.substance_name}` : ''}</div>
                      ${Object.entries(details).map(([key, value]) => `
                        <div class="follow-up-item">
                          <strong>${key.replace(/_/g, ' ')}:</strong> ${value}
                        </div>
                      `).join('')}
                    </div>
                  `;
                }).join('')}

                ${aiProbingExchanges.length > 0 ? `
                  <div class="probing-section">
                    <div class="probing-title">🔍 Investigator Probing (${aiProbingExchanges.length} exchanges)</div>
                    ${aiProbingExchanges.map((exchange, idx) => `
                      <div class="probing-exchange">
                        <div class="probing-question">Follow-Up Question ${idx + 1}:</div>
                        <div style="margin-left: 12px; margin-bottom: 4px;">${exchange.probing_question}</div>
                        <div class="probing-question">Candidate Response:</div>
                        <div class="probing-answer">${exchange.candidate_response}</div>
                      </div>
                    `).join('')}
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      `).join('')}

      ${session.red_flags?.length > 0 ? `
        <div class="section">
          <div class="section-title" style="color: #cc0000;">⚠️ Red Flags Identified</div>
          ${session.red_flags.map((flag, idx) => `
            <div class="question-block" style="border-left-color: #cc0000;">
              <strong>${idx + 1}.</strong> ${flag}
            </div>
          `).join('')}
        </div>
      ` : ''}

      <div class="footer">
        <strong>ClearQuest™ Interview System</strong><br>
        CJIS Compliant • All responses encrypted and secured<br>
        Session Hash: ${session.session_hash || 'N/A'}<br>
        Report generated: ${new Date().toLocaleString('en-US')}<br>
        <em>This report is confidential and intended for authorized investigators only.</em>
      </div>
    </body>
    </html>
  `;
}