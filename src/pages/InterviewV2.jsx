
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

export default function InterviewV2() {
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

  // AI agent integration
  const [conversation, setConversation] = useState(null);
  const [agentMessages, setAgentMessages] = useState([]);
  const [isWaitingForAgent, setIsWaitingForAgent] = useState(false);
  const [currentFollowUpPack, setCurrentFollowUpPack] = useState(null);
  const [answeredAgentQuestions, setAnsweredAgentQuestions] = useState(new Set());

  // AI robustness states
  const [aiProbingDisabled, setAiProbingDisabled] = useState(false);
  const [aiFailureCount, setAiFailureCount] = useState(0);
  const AI_FAILURE_THRESHOLD = 3;


  // Input state
  const [input, setInput] = useState("");
  const [validationHint, setValidationHint] = useState(null);
  const [isCommitting, setIsCommitting] = useState(false);

  // Modal state
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [isCompletingInterview, setIsCompletingInterview] = useState(false);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [wasPaused, setWasPaused] = useState(false);
  const [routingError, setRoutingError] = useState(false);

  // Refs
  const historyRef = useRef(null);
  const displayOrderRef = useRef(0);
  const inputRef = useRef(null);
  const yesButtonRef = useRef(null);
  const noButtonRef = useRef(null);
  const unsubscribeRef = useRef(null);
  const displayNumberMapRef = useRef({});

  // ============================================================================
  // DATABASE PERSISTENCE
  // ============================================================================

  const saveAnswerToDatabase = useCallback(async (questionId, answer, question) => {
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

      await base44.entities.Response.create({
        session_id: sessionId,
        question_id: questionId,
        question_text: question.question_text,
        category: question.category,
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
  }, [sessionId]);

  const saveFollowUpAnswer = useCallback(async (packId, fieldKey, answer, substanceName) => {
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
        followup_pack: packId
      });

      if (existingFollowups.length === 0) {
        await base44.entities.FollowUpResponse.create({
          session_id: sessionId,
          response_id: triggeringResponse.id,
          question_id: triggeringResponse.question_id,
          followup_pack: packId,
          instance_number: 1,
          substance_name: substanceName || null,
          incident_description: answer,
          additional_details: { [fieldKey]: answer }
        });
      } else {
        const existing = existingFollowups[0];
        await base44.entities.FollowUpResponse.update(existing.id, {
          substance_name: substanceName || existing.substance_name,
          additional_details: {
            ...(existing.additional_details || {}),
            [fieldKey]: answer
          }
        });
      }

    } catch (err) {
      console.error('❌ Follow-up save error:', err);
    }
  }, [sessionId]);

  const saveProbingToDatabase = useCallback(async (questionId, packId, messages) => {
    try {
      console.log(`💾 Saving AI probing exchanges for ${questionId}/${packId} to database...`);

      const exchanges = [];
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
          continue;
        }

        if (startIndex !== -1 && msg.role === 'assistant' && typeof msg.content === 'string' && msg.content.match(/\bQ\d{1,3}\b/i)) {
          endIndex = i;
          break;
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

      console.log(`📊 Extracted ${exchanges.length} probing exchanges to save`);

      if (exchanges.length > 0) {
        const responses = await base44.entities.Response.filter({
          session_id: sessionId,
          question_id: questionId,
          followup_pack: packId
        });

        if (responses.length > 0) {
          const responseRecord = responses[0];

          await base44.entities.Response.update(responseRecord.id, {
            investigator_probing: exchanges
          });

          console.log(`✅ Saved ${exchanges.length} probing exchanges to Response ${responseRecord.id}`);
        } else {
          console.error(`❌ No Response record found for ${questionId}/${packId}`);
        }
      }

    } catch (err) {
      console.error('❌ Error saving probing to database:', err);
    }
  }, [sessionId]);

  const generateAndSaveInvestigatorSummary = useCallback(async (questionId, packId) => {
    try {
      console.log(`📝 Generating investigator summary for ${questionId}/${packId}...`);

      const responses = await base44.entities.Response.filter({
        session_id: sessionId,
        question_id: questionId,
        followup_pack: packId
      });

      if (responses.length === 0) {
        console.warn(`⚠️ No Response record found for ${questionId}/${packId}`);
        return;
      }

      const responseRecord = responses[0];

      if (responseRecord.investigator_summary && responseRecord.investigator_summary.trim() !== '') {
        console.log(`ℹ️ Summary already exists for ${questionId}, skipping`);
        return;
      }

      if (questionId === 'Q161') {
        console.log(`ℹ️ Skipping summary for U.S. citizenship question ${questionId}`);
        return;
      }

      const followups = await base44.entities.FollowUpResponse.filter({
        session_id: sessionId,
        response_id: responseRecord.id
      });

      const followupDetails = followups.map(f => ({
        substance_name: f.substance_name,
        ...f.additional_details
      }));

      const probingData = responseRecord.investigator_probing || [];
      const question = engine.QById[questionId];

      if (!question) {
        console.warn(`⚠️ Question ${questionId} not found in engine`);
        return;
      }

      const prompt = `You are generating a single-line investigator summary for a background interview question.

Question: ${question.question_text}
Answer: ${responseRecord.answer}

${followupDetails.length > 0 ? `Deterministic Follow-Up Details:\n${JSON.stringify(followupDetails, null, 2)}\n` : ''}
${probingData.length > 0 ? `AI Probing Exchanges (IMPORTANT - often contains critical details):\n${probingData.map(p => `Q: ${p.probing_question}\nA: ${p.candidate_response}`).join('\n\n')}\n` : ''}

Generate exactly ONE sentence that synthesizes ALL the information above into a complete investigator summary.
- Include key facts from BOTH the deterministic details AND the probing exchanges
- Probing exchanges often reveal the most important details - make sure to incorporate them
- Max ${probingData.length > 0 ? '40' : '30'} words
- Use neutral, factual, investigator-style tone
- Focus on: what happened, when, where, outcome/status, and any critical details revealed during probing
- Do not include "the candidate said" or similar meta language

Examples:
- "2018 speeding citation in Italy; applicant received but did not address the ticket and reports no further consequences."
- "Applied to Yuma PD in June 2023; failed polygraph after lying about speeding ticket received in Italy in 2018."
- "Used marijuana recreationally from 2019-2021; last use was spring 2021, obtained from friends, reports no legal issues."

Return ONLY the summary sentence, nothing else.`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: false
      });

      const summary = result.trim();

      await base44.entities.Response.update(responseRecord.id, {
        investigator_summary: summary
      });

      console.log(`✅ Saved investigator summary for ${questionId}: "${summary}"`);

    } catch (err) {
      console.error(`❌ Error generating summary for ${questionId}:`, err);
    }
  }, [sessionId, engine]);

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
    };
  }, [sessionId, navigate]);

  useEffect(() => {
    if (!isCommitting) {
      requestAnimationFrame(() => {
        if (isWaitingForAgent && inputRef.current) {
          inputRef.current.focus({ preventScroll: false });
        }
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
      console.log('🚀 [SINGLE-SOURCE] Initializing interview (Question Manager = source of truth)...');
      const startTime = performance.now();

      // PERFORMANCE: Parallelize session load and engine bootstrap
      const [loadedSession, engineData] = await Promise.all([
        base44.entities.InterviewSession.get(sessionId),
        bootstrapEngine(base44)
      ]);

      if (!loadedSession || !loadedSession.id) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      if (loadedSession.status === 'paused') {
        setWasPaused(true);
        setShowResumeBanner(true);
        await base44.entities.InterviewSession.update(sessionId, {
          status: 'in_progress'
        });
        loadedSession.status = 'in_progress';
      }

      setSession(loadedSession);
      setEngine(engineData);

      if (engineData.hasValidationErrors) {
        console.error('❌ Question configuration errors detected:', engineData.validationErrors);
      }

      // PERFORMANCE: Load department in background (non-blocking)
      void (async () => {
        try {
          const departments = await base44.entities.Department.filter({
            department_code: loadedSession.department_code
          });
          if (departments.length > 0) {
            setDepartment(departments[0]);
          }
        } catch (err) {
          console.warn('⚠️ Could not load department info:', err);
        }
      })();

      // PERFORMANCE: Initialize conversation in background (non-blocking)
      void (async () => {
        try {
          if (!loadedSession.conversation_id) {
            const newConversation = await base44.agents.createConversation({
              agent_name: 'clearquest_interviewer',
              metadata: {
                session_id: sessionId,
                department_code: loadedSession.department_code,
                file_number: loadedSession.file_number,
                debug_mode: loadedSession.metadata?.debug_mode || false
              }
            });

            if (newConversation?.id) {
              await base44.entities.InterviewSession.update(sessionId, {
                conversation_id: newConversation.id
              });

              setConversation(newConversation);
              loadedSession.conversation_id = newConversation.id;

              // Subscribe to conversation
              unsubscribeRef.current = base44.agents.subscribeToConversation(
                newConversation.id,
                (data) => {
                  setAgentMessages(data.messages || []);
                }
              );
            }
          } else {
            const existingConversation = await base44.agents.getConversation(loadedSession.conversation_id);

            if (existingConversation?.id) {
              setConversation(existingConversation);
              if (existingConversation.messages) {
                setAgentMessages(existingConversation.messages);
              }

              // Subscribe to conversation
              unsubscribeRef.current = base44.agents.subscribeToConversation(
                loadedSession.conversation_id,
                (data) => {
                  setAgentMessages(data.messages || []);
                }
              );
            }
          }
        } catch (convError) {
          console.warn('⚠️ Conversation setup failed (non-fatal):', convError);
          setConversation(null);
        }
      })();

      // ARCHITECTURAL CHANGE: ALWAYS rebuild from current config + responses
      // Never restore stale snapshots - Question Manager is single source of truth
      console.log('🔄 Rebuilding interview flow from current Question Manager config...');
      await rebuildSessionFromResponses(engineData, loadedSession);

      setIsLoading(false);
      console.log(`✅ Interview ready in ${(performance.now() - startTime).toFixed(2)}ms`);

    } catch (err) {
      console.error('❌ Initialization failed:', err);
      setError(`Failed to load interview: ${err.message}`);
      setIsLoading(false);
    }
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
          restoredTranscript.push({
            id: `q-${response.id}`,
            questionId: response.question_id,
            questionText: question.question_text,
            answer: response.answer,
            category: question.category,
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
        nextQuestionId = computeNextQuestionId(engineData, lastResponse.question_id, lastResponse.answer);
      } else {
        // First question from first active section
        const firstSection = Object.values(engineData.sectionConfig)
          .filter(s => s.active)
          .sort((a, b) => a.section_order - b.section_order)[0];
        
        if (firstSection && engineData.questionsBySection[firstSection.id]?.length > 0) {
          nextQuestionId = engineData.questionsBySection[firstSection.id][0].question_id;
        }
      }

      // Special case: Q162 (final question) answered = interview complete
      const lastQuestionId = sortedResponses.length > 0 ? sortedResponses[sortedResponses.length - 1].question_id : null;
      if (lastQuestionId === 'Q162') {
        nextQuestionId = null;
      }

      if (!nextQuestionId || !engineData.QById[nextQuestionId]) {
        // Only mark complete if we actually finished with Q162
        if (lastQuestionId === 'Q162') {
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
          // Routing failure before reaching Q162 - treat as error
          console.error(
            '❌ Routing failure: nextQuestionId is null or invalid before final question.',
            { lastQuestionId, engineValidationErrors: engineData.validationErrors }
          );
          setCurrentItem(null);
          setQueue([]);
          await base44.entities.InterviewSession.update(sessionId, {
            transcript_snapshot: restoredTranscript,
            queue_snapshot: [],
            current_item_snapshot: null,
            total_questions_answered: restoredTranscript.filter(t => t.type === 'question').length,
            status: 'in_progress'
          });
          setRoutingError(true);
        }
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
      console.error('❌ Error rebuilding session:', err);
      throw err;
    }
  };

  const persistStateToDatabase = async (newTranscript, newQueue, newCurrentItem) => {
    try {
      await base44.entities.InterviewSession.update(sessionId, {
        transcript_snapshot: newTranscript,
        queue_snapshot: newQueue,
        current_item_snapshot: newCurrentItem,
        total_questions_answered: newTranscript.filter(t => t.type === 'question').length,
        completion_percentage: Math.round((newTranscript.filter(t => t.type === 'question').length / engine.TotalQuestions) * 100),
        data_version: 'v2.6-single-source'
      });
    } catch (err) {
      console.error('❌ Failed to persist state:', err);
    }
  };

  const moveToNextDeterministicQuestion = useCallback(async (previousQuestionId, previousAnswer) => {
    const newTranscript = [...transcript];

    setIsWaitingForAgent(false);
    setCurrentFollowUpPack(null);
    setCurrentFollowUpAnswers({});

    const nextQuestionId = computeNextQuestionId(engine, previousQuestionId, previousAnswer);
    
    if (nextQuestionId && engine.QById[nextQuestionId]) {
      const nextItem = { id: nextQuestionId, type: 'question' };
      setQueue([]);
      setCurrentItem(nextItem);
      await persistStateToDatabase(newTranscript, [], nextItem);
      console.log(`➡️ Moving to next deterministic question: ${nextQuestionId}`);
    } else {
      // Only mark complete if previous was Q162
      if (previousQuestionId === 'Q162') {
        setCurrentItem(null);
        setQueue([]);
        await persistStateToDatabase(newTranscript, [], null);
        setShowCompletionModal(true);
        console.log('✅ Final question Q162 answered - interview complete.');
      } else {
        // Routing failure before Q162 - treat as error
        console.error(
          '❌ Routing failure in moveToNextDeterministicQuestion.',
          { previousQuestionId, previousAnswer, engineValidationErrors: engine.validationErrors }
        );
        setCurrentItem(null);
        setQueue([]);
        await persistStateToDatabase(newTranscript, [], null);
        setRoutingError(true);
      }
    }
  }, [engine, transcript, persistStateToDatabase]);


  const handleCompleteProbingAndContinue = useCallback(async (questionId, packId, originalTriggeringQuestionId, originalTriggeringAnswer) => {
    if (aiProbingDisabled) {
        console.log(`⚠️ AI probing already disabled, skipping completion and continuing.`);
        return;
    }

    const messagesToSave = [...agentMessages];

    setIsWaitingForAgent(false);
    setCurrentFollowUpPack(null);
    setCurrentFollowUpAnswers({});

    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    if (messagesToSave.length > 0) {
      await saveProbingToDatabase(questionId, packId, messagesToSave);
      await generateAndSaveInvestigatorSummary(questionId, packId);
    }

    await moveToNextDeterministicQuestion(originalTriggeringQuestionId, originalTriggeringAnswer);

  }, [agentMessages, aiProbingDisabled, generateAndSaveInvestigatorSummary, saveProbingToDatabase, moveToNextDeterministicQuestion, unsubscribeRef]);


  const handoffToAgentForProbing = useCallback(async (questionId, packId, substanceName, followUpAnswers) => {
    if (aiProbingDisabled) {
      console.log(`⚠️ AI probing disabled for session, skipping probing for ${questionId}`);
      
      const triggeringQuestionEntry = [...transcript].reverse().find(t =>
        t.type === 'question' &&
        engine.QById[t.questionId]?.followup_pack === packId &&
        t.answer === 'Yes'
      );

      if (triggeringQuestionEntry) {
          await moveToNextDeterministicQuestion(triggeringQuestionEntry.questionId, triggeringQuestionEntry.answer);
      } else {
          console.error("Could not find triggering question in transcript for deterministic fallback.");
          setCurrentItem(null);
          setQueue([]);
          await persistStateToDatabase(transcript, [], null);
          setShowCompletionModal(true);
      }
      return false;
    }

    if (!conversation) {
      console.warn('⚠️ No conversation object available, AI probing skipped.');
      const triggeringQuestionEntry = [...transcript].reverse().find(t =>
        t.type === 'question' &&
        engine.QById[t.questionId]?.followup_pack === packId &&
        t.answer === 'Yes'
      );
      if (triggeringQuestionEntry) {
          toast.error("AI Investigator not available. Moving to next question...", { duration: 2000 });
          await moveToNextDeterministicQuestion(triggeringQuestionEntry.questionId, triggeringQuestionEntry.answer);
      } else {
          setCurrentItem(null);
          setQueue([]);
          await persistStateToDatabase(transcript, [], null);
          setShowCompletionModal(true);
      }
      return false;
    }

    setAiFailureCount(0);

    const question = engine.QById[questionId];
    const packSteps = injectSubstanceIntoPackSteps(engine, packId, substanceName);

    let summaryLines = [
      `Follow-up pack completed.`,
      ``,
      `Question ID: ${questionId}`,
      `Question: ${question.question_text}`,
      `Base Answer: Yes`,
      `Follow-up Pack: ${packId}`,
      ``,
      `Deterministic Follow-Up Answers:`
    ];

    followUpAnswers.forEach((answer) => {
      const step = packSteps.find(s => s.Prompt === answer.questionText);
      if (step) {
        summaryLines.push(`- ${step.Prompt}: ${answer.answer}`);
      } else {
        summaryLines.push(`- ${answer.questionText}: ${answer.answer}`);
      }
    });

    summaryLines.push(``);
    summaryLines.push(`Please evaluate whether this story is complete. If not, ask probing questions (up to 5) to get the full story. When satisfied, ask: "Before we move on, is there anything else investigators should know about this situation?" Then send the next base question.`);

    try {
      setIsWaitingForAgent(true);
      setCurrentFollowUpPack({ questionId, packId, substanceName, originalTriggeringQuestionId: questionId, originalTriggeringAnswer: "Yes" });

      await base44.agents.addMessage(conversation, {
        role: 'user',
        content: summaryLines.join('\n')
      });

      return true;
    } catch (err) {
      console.error('❌ Error sending to agent:', err);
      const newFailureCount = aiFailureCount + 1;
      setAiFailureCount(newFailureCount);

      if (newFailureCount >= AI_FAILURE_THRESHOLD) {
        console.warn(`⚠️ AI probing failed ${newFailureCount} times, disabling for session`);
        setAiProbingDisabled(true);
        toast.error("AI Investigator experienced multiple errors. Disabling AI probing.", { duration: 3000 });
      } else {
        toast.error("AI Investigator failed to start. Moving to next question...", { duration: 2000 });
      }

      setIsWaitingForAgent(false);
      setCurrentFollowUpPack(null);

      const triggeringQuestionEntry = [...transcript].reverse().find(t =>
        t.type === 'question' &&
        engine.QById[t.questionId]?.followup_pack === packId &&
        t.answer === 'Yes'
      );

      if (triggeringQuestionEntry) {
          await moveToNextDeterministicQuestion(triggeringQuestionEntry.questionId, triggeringQuestionEntry.answer);
      } else {
          console.error("Could not find triggering question in transcript for deterministic fallback.");
          setCurrentItem(null);
          setQueue([]);
          await persistStateToDatabase(transcript, [], null);
          setShowCompletionModal(true);
      }

      return false;
    }
  }, [conversation, engine, aiProbingDisabled, aiFailureCount, transcript, moveToNextDeterministicQuestion, persistStateToDatabase]);

  useEffect(() => {
    if (!isWaitingForAgent || agentMessages.length === 0 || !engine || !currentFollowUpPack) return;

    const lastAgentMessage = [...agentMessages].reverse().find(m => m.role === 'assistant');
    if (!lastAgentMessage?.content) return;

    const allQuestionMatches = lastAgentMessage.content.match(/\bQ\d{1,3}\b/gi);
    if (allQuestionMatches && allQuestionMatches.length > 0) {
      const nextQuestionId = allQuestionMatches[allQuestionMatches.length - 1].toUpperCase();

      if (nextQuestionId !== currentFollowUpPack.questionId) {
        console.log(`🤖 AI signaled completion with next question: ${nextQuestionId}`);
        
        handleCompleteProbingAndContinue(
          currentFollowUpPack.questionId,
          currentFollowUpPack.packId,
          currentFollowUpPack.originalTriggeringQuestionId,
          currentFollowUpPack.originalTriggeringAnswer
        );
      }
    }
  }, [agentMessages, isWaitingForAgent, transcript, engine, currentFollowUpPack, handleCompleteProbingAndContinue]);


  // ============================================================================
  // ANSWER HANDLING - OPTIMIZED FOR PERFORMANCE
  // ============================================================================

  const handleAnswer = useCallback(async (value) => {
    if (isCommitting || !currentItem || !engine) return;

    setIsCommitting(true);
    setValidationHint(null);

    try {
      if (currentItem.type === 'question') {
        const question = engine.QById[currentItem.id];
        if (!question) throw new Error(`Question ${currentItem.id} not found`);

        const transcriptEntry = {
          id: `q-${Date.now()}`,
          questionId: currentItem.id,
          questionText: question.question_text,
          answer: value,
          category: question.category,
          type: 'question',
          timestamp: new Date().toISOString()
        };

        const newTranscript = [...transcript, transcriptEntry];

        // SPECIAL CASE: Q162 is the final question - keep synchronous for completion
        if (currentItem.id === 'Q162') {
          console.log('✅ Final question (Q162) answered - completing interview');
          setTranscript(newTranscript);
          setCurrentItem(null);
          setQueue([]);
          await saveAnswerToDatabase(currentItem.id, value, question);
          await persistStateToDatabase(newTranscript, [], null);
          setShowCompletionModal(true);
          setIsCommitting(false);
          return;
        }

        // PERFORMANCE OPTIMIZATION: Compute next state and update UI immediately
        if (value === 'Yes') {
          const followUpResult = checkFollowUpTrigger(engine, currentItem.id, value);

          if (followUpResult) {
            const { packId, substanceName } = followUpResult;
            const packSteps = injectSubstanceIntoPackSteps(engine, packId, substanceName);

            if (packSteps && packSteps.length > 0) {
              const followupQueue = [];
              for (let i = 0; i < packSteps.length; i++) {
                followupQueue.push({
                  id: `${packId}:${i}`,
                  type: 'followup',
                  packId: packId,
                  stepIndex: i,
                  substanceName: substanceName,
                  totalSteps: packSteps.length
                });
              }

              const firstItem = followupQueue[0];
              const remainingQueue = followupQueue.slice(1);

              // Update UI immediately
              setTranscript(newTranscript);
              setCurrentFollowUpAnswers({});
              setQueue(remainingQueue);
              setCurrentItem(firstItem);
              setIsCommitting(false);
              setInput("");

              // Persist to database in background
              void (async () => {
                try {
                  await saveAnswerToDatabase(currentItem.id, value, question);
                  await persistStateToDatabase(newTranscript, remainingQueue, firstItem);
                } catch (error) {
                  console.error("❌ Failed to persist interview state", error);
                }
              })();
              return;
            }
          }

          // No follow-up or empty pack - move to next question
          const nextQuestionId = computeNextQuestionId(engine, currentItem.id, value);
          if (nextQuestionId && engine.QById[nextQuestionId]) {
            const nextItem = { id: nextQuestionId, type: 'question' };
            
            // Update UI immediately
            setTranscript(newTranscript);
            setQueue([]);
            setCurrentItem(nextItem);
            setIsCommitting(false);
            setInput("");

            // Persist to database in background
            void (async () => {
              try {
                await saveAnswerToDatabase(currentItem.id, value, question);
                await persistStateToDatabase(newTranscript, [], nextItem);
              } catch (error) {
                console.error("❌ Failed to persist interview state", error);
              }
            })();
          } else {
            // Routing failure
            console.error('❌ Routing failure after Yes answer', { 
              currentQuestionId: currentItem.id, 
              value, 
              engineValidationErrors: engine.validationErrors 
            });
            setTranscript(newTranscript);
            setCurrentItem(null);
            setQueue([]);
            await persistStateToDatabase(newTranscript, [], null); // Persist synchronously on error
            setRoutingError(true);
            setIsCommitting(false);
          }

        } else { // Answer was 'No'
          const nextQuestionId = computeNextQuestionId(engine, currentItem.id, value);
          
          if (nextQuestionId && engine.QById[nextQuestionId]) {
            const nextItem = { id: nextQuestionId, type: 'question' };
            
            // Update UI immediately
            setTranscript(newTranscript);
            setQueue([]);
            setCurrentItem(nextItem);
            setIsCommitting(false);
            setInput("");

            // Persist to database in background
            void (async () => {
              try {
                await saveAnswerToDatabase(currentItem.id, value, question);
                await persistStateToDatabase(newTranscript, [], nextItem);
              } catch (error) {
                console.error("❌ Failed to persist interview state", error);
              }
            })();
          } else {
            // Routing failure
            console.error('❌ Routing failure after No answer', { 
              currentQuestionId: currentItem.id, 
              value, 
              engineValidationErrors: engine.validationErrors 
            });
            setTranscript(newTranscript);
            setCurrentItem(null);
            setQueue([]);
            await persistStateToDatabase(newTranscript, [], null); // Persist synchronously on error
            setRoutingError(true);
            setIsCommitting(false);
          }
        }
      }

      else if (currentItem.type === 'followup') {
        const { packId, stepIndex, substanceName } = currentItem;
        const packSteps = injectSubstanceIntoPackSteps(engine, packId, substanceName);

        if (!packSteps || !packSteps[stepIndex]) {
          throw new Error(`Follow-up pack ${packId} step ${stepIndex} not found`);
        }
        const step = packSteps[stepIndex];

        // Handle prefilled answer
        if (step.PrefilledAnswer && step.Field_Key === 'substance_name') {
          const transcriptEntry = {
            id: `fu-${Date.now()}`,
            questionId: currentItem.id,
            questionText: step.Prompt,
            answer: step.PrefilledAnswer,
            packId: packId,
            substanceName: substanceName,
            type: 'followup',
            timestamp: new Date().toISOString()
          };

          const newTranscript = [...transcript, transcriptEntry];
          const updatedFollowUpAnswers = {
            ...currentFollowUpAnswers,
            [step.Field_Key]: step.PrefilledAnswer
          };

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

          const isLastFollowUp = !nextItem || nextItem.type !== 'followup' || nextItem.packId !== packId;

          // Update UI immediately
          setTranscript(newTranscript);
          setCurrentFollowUpAnswers(updatedFollowUpAnswers);
          setQueue(updatedQueue);
          setCurrentItem(nextItem);
          setIsCommitting(false);
          setInput("");

          // Persist to database in background
          void (async () => {
            try {
              await saveFollowUpAnswer(packId, step.Field_Key, step.PrefilledAnswer, substanceName);
              if (isLastFollowUp) {
                const triggeringQuestion = [...newTranscript].reverse().find(t =>
                  t.type === 'question' &&
                  engine.QById[t.questionId]?.followup_pack === packId &&
                  t.answer === 'Yes'
                );

                if (shouldSkipProbingForHired(packId, updatedFollowUpAnswers)) {
                  if (triggeringQuestion) {
                    await moveToNextDeterministicQuestion(triggeringQuestion.questionId, triggeringQuestion.answer);
                  } else {
                    console.error("Could not find triggering question for deterministic skip after prefilled answer.");
                    await persistStateToDatabase(newTranscript, [], null);
                    setShowCompletionModal(true);
                  }
                } else {
                  if (triggeringQuestion) {
                    // This will also persist via handoffToAgentForProbing/moveToNextDeterministicQuestion
                    await handoffToAgentForProbing(
                      triggeringQuestion.questionId,
                      packId,
                      substanceName,
                      newTranscript.filter(t => t.type === 'followup' && t.packId === packId)
                    );
                  } else {
                    console.error("Could not find triggering question for AI handoff after prefilled answer.");
                    await persistStateToDatabase(newTranscript, [], null);
                    setShowCompletionModal(true);
                  }
                }
              } else {
                await persistStateToDatabase(newTranscript, updatedQueue, nextItem);
              }
            } catch (error) {
              console.error("❌ Failed to persist interview state", error);
            }
          })();
          return;
        }


        const validation = validateFollowUpAnswer(value, step.Expected_Type || 'TEXT', step.Options);

        if (!validation.valid) {
          setValidationHint(validation.hint);
          setIsCommitting(false);
          setTimeout(() => inputRef.current?.focus(), 100);
          return;
        }

        const transcriptEntry = {
          id: `fu-${Date.now()}`,
          questionId: currentItem.id,
          questionText: step.Prompt,
          answer: validation.normalized || value,
          packId: packId,
          substanceName: substanceName,
          type: 'followup',
          timestamp: new Date().toISOString()
        };

        const newTranscript = [...transcript, transcriptEntry];
        const updatedFollowUpAnswers = {
          ...currentFollowUpAnswers,
          [step.Field_Key]: validation.normalized || value
        };

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

        const isLastFollowUp = !nextItem || nextItem.type !== 'followup' || nextItem.packId !== packId;

        // Update UI immediately
        setTranscript(newTranscript);
        setCurrentFollowUpAnswers(updatedFollowUpAnswers);
        setQueue(updatedQueue);
        setCurrentItem(nextItem);
        setIsCommitting(false);
        setInput("");

        // Persist to database in background
        void (async () => {
          try {
            await saveFollowUpAnswer(packId, step.Field_Key, validation.normalized || value, substanceName);
            if (isLastFollowUp) {
              const triggeringQuestion = [...newTranscript].reverse().find(t =>
                t.type === 'question' &&
                engine.QById[t.questionId]?.followup_pack === packId &&
                t.answer === 'Yes'
              );

              if (shouldSkipProbingForHired(packId, updatedFollowUpAnswers)) {
                if (triggeringQuestion) {
                  await moveToNextDeterministicQuestion(triggeringQuestion.questionId, triggeringQuestion.answer);
                } else {
                  console.error("Could not find triggering question for deterministic skip.");
                  await persistStateToDatabase(newTranscript, [], null);
                  setShowCompletionModal(true);
                }
              } else {
                if (triggeringQuestion) {
                  // This will also persist via handoffToAgentForProbing/moveToNextDeterministicQuestion
                  await handoffToAgentForProbing(
                    triggeringQuestion.questionId,
                    packId,
                    substanceName,
                    newTranscript.filter(t => t.type === 'followup' && t.packId === packId)
                  );
                } else {
                  console.error("Could not find triggering question for AI handoff.");
                  await persistStateToDatabase(newTranscript, [], null);
                  setShowCompletionModal(true);
                }
              }
            } else {
              await persistStateToDatabase(newTranscript, updatedQueue, nextItem);
            }
          } catch (error) {
            console.error("❌ Failed to persist interview state", error);
          }
        })();
      }

    } catch (err) {
      console.error('❌ Error processing answer:', err);
      setIsCommitting(false);
      setError(`Error: ${err.message}`);
    }

  }, [currentItem, engine, queue, transcript, sessionId, isCommitting, conversation, currentFollowUpAnswers, handoffToAgentForProbing, persistStateToDatabase, saveFollowUpAnswer, saveAnswerToDatabase, moveToNextDeterministicQuestion]);

  const handleAgentAnswer = useCallback(async (value) => {
    if (!conversation || isCommitting || !isWaitingForAgent || !currentFollowUpPack) return;

    setIsCommitting(true);
    setInput("");

    try {
      await base44.agents.addMessage(conversation, {
        role: 'user',
        content: value
      });

      setAiFailureCount(0);

      setIsCommitting(false);
    } catch (err) {
      console.error('❌ Error sending to agent:', err);
      setError('Failed to send message to AI agent');

      const newFailureCount = aiFailureCount + 1;
      setAiFailureCount(newFailureCount);

      if (newFailureCount >= AI_FAILURE_THRESHOLD) {
        console.warn(`⚠️ AI probing failed ${newFailureCount} times, disabling for session`);
        setAiProbingDisabled(true);
        toast.error("AI Investigator experienced multiple errors. Disabling AI probing.", { duration: 3000 });
      } else {
        toast.error("AI Investigator failed to respond. Moving to next question...", { duration: 2000 });
      }

      await handleCompleteProbingAndContinue(
        currentFollowUpPack.questionId,
        currentFollowUpPack.packId,
        currentFollowUpPack.originalTriggeringQuestionId,
        currentFollowUpPack.originalTriggeringAnswer
      );

      setIsCommitting(false);
    }
  }, [conversation, isCommitting, isWaitingForAgent, aiFailureCount, AI_FAILURE_THRESHOLD, setAiFailureCount, setAiProbingDisabled, handleCompleteProbingAndContinue, currentFollowUpPack]);


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
      toast.error('Failed to complete interview. Please try again.');
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
    window.close();
    toast.info('You can now close this tab. Use your Dept Code and File Number to resume later.');
  };

  const getQuestionDisplayNumber = useCallback((questionId) => {
    if (!engine) return '';

    if (displayNumberMapRef.current[questionId]) {
      return displayNumberMapRef.current[questionId];
    }

    // Use ActiveOrdered for display number only (not routing)
    const index = engine.ActiveOrdered.indexOf(questionId);
    if (index !== -1) {
      const displayNum = index + 1;
      displayNumberMapRef.current[questionId] = displayNum;
      return displayNum;
    }

    return questionId.replace(/^Q0*/, '');
  }, [engine]);

  const getFollowUpPackName = (packId) => {
    return FOLLOWUP_PACK_NAMES[packId] || 'Follow-up Questions';
  };

  const getCurrentPrompt = () => {
    if (isWaitingForAgent) return null;
    if (!currentItem || !engine) return null;

    if (currentItem.type === 'question') {
      const question = engine.QById[currentItem.id];

      if (!question) {
        console.error(`❌ Current question ${currentItem.id} not found in engine - interview flow error`);
        // If an error in engine data, this should not trigger completion, but routing error.
        // The rebuildSessionFromResponses handles this during init.
        // If it happens mid-interview, it's a critical error for which we should mark routingError.
        // For now, let's keep it as is, as it's an edge case due to invalid engine configuration.
        // The parent error handling will catch the error thrown from `handleAnswer` eventually.
        return null;
      }

      return {
        type: 'question',
        id: question.question_id,
        text: question.question_text,
        responseType: question.response_type,
        category: question.category
      };
    }

    if (currentItem.type === 'followup') {
      const { packId, stepIndex, substanceName } = currentItem;
      const packSteps = injectSubstanceIntoPackSteps(engine, packId, substanceName);
      if (!packSteps) return null;

      const step = packSteps[stepIndex];

      if (step.PrefilledAnswer && step.Field_Key === 'substance_name') {
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

    return null;
  };

  const getPlaceholder = () => {
    if (isWaitingForAgent) return "Respond to investigator's question...";
    const currentPrompt = getCurrentPrompt();
    if (!currentPrompt) return "Type your answer...";

    if (currentPrompt.type === 'followup') {
      const expectedType = currentPrompt.expectedType;
      if (expectedType === 'DATE' || expectedType === 'DATERANGE') {
        return "MM/DD/YYYY or Month YYYY (e.g., June 2023)";
      }
      if (expectedType === 'NUMBER') return "Enter a number";
      if (expectedType === 'BOOLEAN') return "Yes or No";
    }

    return "Type your answer...";
  };

  const getLastAgentQuestion = useCallback(() => {
    if (!isWaitingForAgent || agentMessages.length === 0) return null;

    const lastAssistantMessage = [...agentMessages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistantMessage?.content) return null;

    if (lastAssistantMessage.content?.match(/\b(Q\d{1,3})\b/i)) return null;

    const lastIndex = agentMessages.findIndex(m => m === lastAssistantMessage);
    if (lastIndex !== -1 && agentMessages[lastIndex + 1]?.role === 'user') {
      return null;
    }

    return lastAssistantMessage.content;
  }, [agentMessages, isWaitingForAgent]);

  const getDisplayableAgentMessages = useCallback(() => {
    if (!isWaitingForAgent || agentMessages.length === 0) return [];

    const displayable = [];
    let processingProbingStart = false;

    for (let i = 0; i < agentMessages.length; i++) {
      const msg = agentMessages[i];

      if (msg.role === 'user' && msg.content?.includes('Follow-up pack completed') && currentFollowUpPack && msg.content?.includes(`Question ID: ${currentFollowUpPack.questionId}`)) {
        processingProbingStart = true;
        continue;
      }
      if (!processingProbingStart && msg.role === 'user' && !msg.content?.includes('Follow-up pack completed')) {
        continue;
      }
      if (msg.content?.match(/\b(Q\d{1,3})\b/i)) {
        processingProbingStart = false;
        continue;
      }

      if (!msg.content || msg.content.trim() === '') continue;

      if (msg.role === 'assistant') {
        const nextMsg = agentMessages[i + 1];
        if (nextMsg && nextMsg.role === 'user') {
          displayable.push(msg);
          displayable.push(nextMsg);
          i++;
        }
      } else if (msg.role === 'user') {
        continue;
      }
    }

    return displayable;
  }, [agentMessages, isWaitingForAgent, currentFollowUpPack]);


  // ============================================================================
  // RENDER
  // ============================================================================

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
  const lastAgentQuestion = getLastAgentQuestion();

  const totalQuestions = engine?.TotalQuestions || 0;
  const answeredCount = transcript.filter(t => t.type === 'question').length;
  const progress = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  // Calculate section progress - ENHANCED UI/UX
  let currentSection = null;
  let sectionAnswered = 0;
  let sectionTotal = 0;
  let sectionProgress = 0;
  let sectionColor = 'blue'; // Default color

  if (currentPrompt && currentPrompt.type === 'question' && engine) {
    const currentQuestion = engine.QById[currentPrompt.id];
    if (currentQuestion?.section_id) {
      const sectionId = currentQuestion.section_id;
      const sectionData = engine.sectionConfig[sectionId];
      
      if (sectionData) {
        currentSection = sectionData.section_name;
        
        const sectionQuestions = engine.questionsBySection[sectionId] || [];
        sectionTotal = sectionQuestions.length;
        
        // Count answered questions in current section
        sectionAnswered = transcript.filter(t => {
          if (t.type !== 'question') return false;
          const q = engine.QById[t.questionId];
          return q?.section_id === sectionId;
        }).length;
        
        sectionProgress = sectionTotal > 0 ? Math.round((sectionAnswered / sectionTotal) * 100) : 0;
        
        // Dynamic color based on progress
        if (sectionProgress >= 75) sectionColor = 'emerald';
        else if (sectionProgress >= 50) sectionColor = 'blue';
        else if (sectionProgress >= 25) sectionColor = 'cyan';
        else sectionColor = 'indigo';
      }
    }
  }

  const isYesNoQuestion = currentPrompt?.type === 'question' && currentPrompt?.responseType === 'yes_no' && !isWaitingForAgent;
  const isFollowUpMode = currentPrompt?.type === 'followup';
  const requiresClarification = validationHint !== null;

  const displayableAgentMessages = getDisplayableAgentMessages();

  return (
    <>
      <div className="h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex flex-col overflow-hidden">
        <header className="flex-shrink-0 bg-slate-800/95 backdrop-blur-sm border-b border-slate-700 px-3 md:px-4 py-2 md:py-3">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-2 md:mb-3">
              <div className="flex items-center gap-2 md:gap-3">
                <Shield className="w-5 h-5 md:w-6 md:h-6 text-blue-400" />
                <h1 className="text-base md:text-lg font-semibold text-white">ClearQuest</h1>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePauseClick}
                className="bg-slate-700/50 border-slate-600 text-slate-200 hover:bg-slate-700 hover:text-white hover:border-slate-500 flex items-center gap-1.5 px-2 md:px-3 h-8 md:h-9 text-xs md:text-sm"
              >
                <Pause className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span className="hidden sm:inline">Pause</span>
              </Button>
            </div>
            
            {department && (
              <div className="hidden md:flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 border-t border-slate-700/50 pt-2 pb-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-slate-300">{department.department_name}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">•</span>
                  <span className="text-slate-500">Dept Code:</span>
                  <span className="font-mono text-slate-300">{session?.department_code}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">•</span>
                  <span className="text-slate-500">File:</span>
                  <span className="font-mono text-slate-300">{session?.file_number}</span>
                </div>
              </div>
            )}
            
            {department && (
              <div className="md:hidden text-[10px] text-slate-500 border-t border-slate-700/50 pt-1.5 pb-1.5">
                {session?.department_code} • {session?.file_number}
              </div>
            )}
            
            {/* Section Progress Bar - ENHANCED */}
            {currentSection && (
              <div className="mt-2 md:mt-3 pb-2 md:pb-3 border-b border-slate-700/50">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                      sectionColor === 'emerald' ? 'bg-emerald-400' :
                      sectionColor === 'blue' ? 'bg-blue-400' :
                      sectionColor === 'cyan' ? 'bg-cyan-400' :
                      'bg-indigo-400'
                    } shadow-lg ${
                      sectionColor === 'emerald' ? 'shadow-emerald-400/50' :
                      sectionColor === 'blue' ? 'shadow-blue-400/50' :
                      sectionColor === 'cyan' ? 'shadow-cyan-400/50' :
                      'shadow-indigo-400/50'
                    }`}></div>
                    <span className="text-[11px] md:text-sm text-slate-300 font-semibold tracking-wide">
                      {currentSection}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] md:text-sm font-bold ${
                      sectionColor === 'emerald' ? 'text-emerald-400' :
                      sectionColor === 'blue' ? 'text-blue-400' :
                      sectionColor === 'cyan' ? 'text-cyan-400' :
                      'text-indigo-400'
                    }`}>
                      {sectionProgress}%
                    </span>
                    <span className="text-[10px] md:text-xs text-slate-500">
                      {sectionAnswered}/{sectionTotal}
                    </span>
                  </div>
                </div>
                <div 
                  className="relative w-full h-2 md:h-2.5 bg-slate-700/50 rounded-full overflow-hidden ring-1 ring-slate-600/30"
                  role="progressbar"
                  aria-label="Section progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={sectionProgress}
                >
                  <div 
                    className={`h-full rounded-full transition-all duration-700 ease-out ${
                      sectionColor === 'emerald' ? 'bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500' :
                      sectionColor === 'blue' ? 'bg-gradient-to-r from-blue-500 via-blue-400 to-blue-500' :
                      sectionColor === 'cyan' ? 'bg-gradient-to-r from-cyan-500 via-cyan-400 to-cyan-500' :
                      'bg-gradient-to-r from-indigo-500 via-indigo-400 to-indigo-500'
                    }`}
                    style={{ 
                      width: `${sectionProgress}%`,
                      boxShadow: sectionProgress > 0 ? (
                        sectionColor === 'emerald' ? '0 0 16px rgba(16, 185, 129, 0.6), inset 0 1px 0 rgba(255,255,255,0.2)' :
                        sectionColor === 'blue' ? '0 0 16px rgba(59, 130, 246, 0.6), inset 0 1px 0 rgba(255,255,255,0.2)' :
                        sectionColor === 'cyan' ? '0 0 16px rgba(34, 211, 238, 0.6), inset 0 1px 0 rgba(255,255,255,0.2)' :
                        '0 0 16px rgba(99, 102, 241, 0.6), inset 0 1px 0 rgba(255,255,255,0.2)'
                      ) : 'none'
                    }}
                  />
                  {/* Animated shimmer effect */}
                  {sectionProgress > 0 && sectionProgress < 100 && (
                    <div 
                      className="absolute inset-0 opacity-30"
                      style={{
                        background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
                        animation: 'shimmer 2s infinite',
                        backgroundSize: '200% 100%'
                      }}
                    />
                  )}
                </div>
              </div>
            )}
            
            {/* Overall Progress Bar - ENHANCED */}
            <div className="mt-2">
              <div 
                className="relative w-full h-2 md:h-2.5 bg-slate-700/50 rounded-full overflow-hidden ring-1 ring-slate-600/30"
                role="progressbar"
                aria-label="Overall progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
              >
                <div 
                  className="h-full bg-gradient-to-r from-green-500 via-green-400 to-green-500 rounded-full transition-all duration-700 ease-out"
                  style={{ 
                    width: `${progress}%`,
                    boxShadow: progress > 0 ? '0 0 16px rgba(34, 197, 94, 0.7), inset 0 1px 0 rgba(255,255,255,0.2)' : 'none'
                  }}
                />
                {/* Animated shimmer */}
                {progress > 0 && progress < 100 && (
                  <div 
                    className="absolute inset-0 opacity-30"
                    style={{
                      background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
                      animation: 'shimmer 2s infinite',
                      backgroundSize: '200% 100%'
                    }}
                  />
                )}
              </div>
              <div className="flex justify-between items-center mt-1.5">
                <span className="text-[10px] md:text-xs text-slate-400">Overall Progress</span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] md:text-sm font-bold text-green-400">{progress}%</span>
                  <span className="text-[10px] md:text-xs text-slate-500">{answeredCount}/{totalQuestions}</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {engine?.hasValidationErrors && (
          <div className="flex-shrink-0 bg-yellow-950/90 border-b border-yellow-800/50 px-3 md:px-4 py-2 md:py-3">
            <div className="max-w-5xl mx-auto">
              <div className="flex items-start gap-2 md:gap-3">
                <AlertCircle className="w-4 h-4 md:w-5 md:h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 text-xs md:text-sm text-yellow-100">
                  <p className="font-semibold mb-1">Configuration Warning</p>
                  <p>Some questions have duplicate or empty IDs and were skipped. Interview routing may be incomplete. Contact administrator to review question configuration.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {routingError && (
          <div className="flex-shrink-0 bg-red-950/90 border-b border-red-800/50 px-3 md:px-4 py-2 md:py-3">
            <div className="max-w-5xl mx-auto">
              <div className="flex items-start gap-2 md:gap-3">
                <AlertCircle className="w-4 h-4 md:w-5 md:h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 text-xs md:text-sm text-red-100">
                  <p className="font-semibold mb-1">Interview Flow Error</p>
                  <p>We encountered a configuration problem (duplicate or missing question IDs). The interview cannot continue until this is fixed. Please contact an administrator.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {showResumeBanner && (
          <div className="flex-shrink-0 bg-emerald-950/90 border-b border-emerald-800/50 px-3 md:px-4 py-2 md:py-3">
            <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2 md:gap-3">
              <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
                <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5 text-emerald-400 flex-shrink-0" />
                <div className="flex flex-wrap items-center gap-1.5 md:gap-2 text-xs md:text-sm text-emerald-100 min-w-0">
                  <span className="truncate">Resuming interview</span>
                  <span className="px-1.5 py-0.5 bg-emerald-900/50 rounded font-mono text-[10px] md:text-xs text-emerald-300 flex-shrink-0">
                    {session?.department_code}
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowResumeBanner(false)}
                className="text-emerald-300 hover:text-emerald-100 hover:bg-emerald-900/30 h-7 md:h-8 px-2 text-xs"
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-hidden flex flex-col">
          <div 
            ref={historyRef}
            className="flex-1 overflow-y-auto px-3 md:px-4 py-3 md:py-6"
          >
            <div className="max-w-5xl mx-auto space-y-3 md:space-y-4">
              {answeredCount > 0 && (
                <Alert className="bg-blue-950/30 border-blue-800/50 text-blue-200">
                  <AlertCircle className="h-3.5 w-3.5 md:h-4 md:w-4" />
                  <AlertDescription className="text-xs md:text-sm">
                    You've completed {answeredCount} of {totalQuestions} questions. Keep going!
                  </AlertDescription>
                </Alert>
              )}
              
              {transcript.map((entry) => (
                <HistoryEntry 
                  key={entry.id} 
                  entry={entry}
                  getQuestionDisplayNumber={getQuestionDisplayNumber}
                  getFollowUpPackName={getFollowUpPackName}
                />
              ))}
              
              {isWaitingForAgent && (
                <div className="space-y-3 md:space-y-4 border-t-2 border-purple-500/30 pt-3 md:pt-4 mt-3 md:mt-4">
                  <div className="text-xs md:text-sm font-semibold text-purple-400 flex items-center gap-1.5 md:gap-2">
                    <AlertCircle className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    Investigator Follow-up
                  </div>
                  {displayableAgentMessages.length > 0 && displayableAgentMessages.map((msg, idx) => (
                    <AgentMessageBubble 
                      key={msg.id || `msg-${idx}`} 
                      message={msg} 
                    />
                  ))}
                  {displayableAgentMessages.length === 0 && !lastAgentQuestion && (
                    <div className="flex items-center gap-2 text-slate-400 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Investigator is reviewing your responses...</span>
                    </div>
                  )}
                </div>
              )}
              {aiProbingDisabled && (
                  <Alert className="bg-red-950/30 border-red-800/50 text-red-200">
                      <XCircle className="h-4 w-4" />
                      <AlertDescription className="text-xs md:text-sm">
                          AI Investigator probing has been temporarily disabled due to multiple errors. Continuing with deterministic questions.
                      </AlertDescription>
                  </Alert>
              )}
            </div>
          </div>

          {lastAgentQuestion && isWaitingForAgent ? (
            <div className="flex-shrink-0 px-3 md:px-4 pb-3 md:pb-4">
              <div className="max-w-5xl mx-auto">
                <div 
                  className="bg-purple-950/95 border-2 border-purple-500/50 rounded-lg md:rounded-xl p-4 md:p-6 shadow-2xl"
                  style={{
                    boxShadow: '0 12px 36px rgba(0,0,0,0.55), 0 0 0 3px rgba(200,160,255,0.30) inset'
                  }}
                >
                  <div className="flex items-start gap-2 md:gap-3">
                    <div className="w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center flex-shrink-0 border bg-purple-600/30 border-purple-500/50">
                      <AlertCircle className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 md:gap-2 mb-1.5 md:mb-2 flex-wrap">
                        <span className="text-xs md:text-sm font-semibold text-purple-400">Investigator Question</span>
                        <span className="text-[10px] md:text-xs text-slate-500">•</span>
                        <span className="text-xs md:text-sm text-purple-300">Story Clarification</span>
                      </div>
                      <p className="text-white text-base md:text-lg font-semibold leading-relaxed break-words">
                        {lastAgentQuestion}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : currentPrompt ? (
            <div className="flex-shrink-0 px-3 md:px-4 pb-3 md:pb-4">
              <div className="max-w-5xl mx-auto">
                <div 
                  className={requiresClarification 
                    ? "bg-purple-950/95 border-2 border-purple-500/50 rounded-lg md:rounded-xl p-4 md:p-6 shadow-2xl"
                    : "bg-slate-800/95 backdrop-blur-sm border-2 border-blue-500/50 rounded-lg md:rounded-xl p-4 md:p-6 shadow-2xl"
                  }
                  style={{
                    boxShadow: requiresClarification
                      ? '0 12px 36px rgba(0,0,0,0.55), 0 0 0 3px rgba(200,160,255,0.30) inset'
                      : '0 10px 30px rgba(0,0,0,0.45), 0 0 0 3px rgba(59, 130, 246, 0.2) inset'
                  }}
                >
                  <div className="flex items-start gap-2 md:gap-3">
                    <div className={`w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center flex-shrink-0 border ${
                      requiresClarification 
                        ? 'bg-purple-600/30 border-purple-500/50'
                        : 'bg-blue-600/30 border-blue-500/50'
                    }`}>
                      {requiresClarification ? (
                        <AlertCircle className="w-3.5 h-3.5 md:w-4 md:h-4 text-purple-400" />
                      ) : isFollowUpMode ? (
                        <Layers className="w-3.5 h-3.5 md:w-4 md:h-4 text-orange-400" />
                      ) : (
                        <Shield className="w-3.5 h-3.5 md:w-4 md:h-4 text-blue-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2 mb-1.5 md:mb-2">
                        {requiresClarification ? (
                          <>
                            <span className="text-xs md:text-sm font-semibold text-purple-400">Clarification Needed</span>
                            <span className="hidden md:inline text-xs text-slate-500">•</span>
                            <span className="text-xs md:text-sm text-purple-300">
                              {getFollowUpPackName(currentPrompt.packId)}
                            </span>
                          </>
                        ) : isFollowUpMode ? (
                          <>
                            <span className="text-xs md:text-sm font-semibold text-orange-400">
                              Follow-up {currentPrompt.stepNumber}/{currentPrompt.totalSteps}
                            </span>
                            <span className="hidden md:inline text-xs text-slate-500">•</span>
                            <span className="text-[11px] md:text-sm text-orange-300 truncate">
                              {currentPrompt.substanceName ? `${currentPrompt.substanceName} Use` : getFollowUpPackName(currentPrompt.packId)}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-base md:text-lg font-bold text-blue-400">
                              Question {getQuestionDisplayNumber(currentPrompt.id)}
                            </span>
                            <span className="text-[11px] md:text-sm font-medium text-slate-400 truncate">{currentPrompt.category}</span>
                          </>
                        )}
                      </div>
                      <p className="text-white text-base md:text-lg font-semibold leading-snug md:leading-relaxed break-words">
                        {currentPrompt.text}
                      </p>
                      
                      {validationHint && (
                        <div className="mt-2 md:mt-3 bg-yellow-900/40 border border-yellow-700/60 rounded-lg p-2.5 md:p-3">
                          <div className="flex items-start gap-1.5 md:gap-2">
                            <AlertCircle className="w-3.5 h-3.5 md:w-4 md:h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                            <p className="text-yellow-200 text-xs md:text-sm leading-relaxed">{validationHint}</p>
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

        <footer 
          className="flex-shrink-0 bg-[#121c33] border-t border-slate-700/50 shadow-[0_-6px_16px_rgba(0,0,0,0.45)] rounded-t-[14px]"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <div className="max-w-5xl mx-auto px-3 md:px-4 py-2.5 md:py-4">
            {isYesNoQuestion ? (
              <div className="flex gap-2 md:gap-3 mb-2 md:mb-3">
                <button
                  ref={yesButtonRef}
                  type="button"
                  onClick={() => handleAnswer("Yes")}
                  disabled={isCommitting || showPauseModal}
                  className="btn-yn btn-yes flex-1 min-h-[44px] sm:min-h-[48px] md:min-h-[48px] rounded-lg font-bold text-white transition-all flex items-center justify-center gap-2 text-base md:text-lg bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 active:scale-[0.98] disabled:opacity-50 focus-visible:outline-none"
                >
                  <Check className="w-5 h-5 md:w-6 md:h-6" />
                  <span>Yes</span>
                </button>
                <button
                  ref={noButtonRef}
                  type="button"
                  onClick={() => handleAnswer("No")}
                  disabled={isCommitting || showPauseModal}
                  className="btn-yn btn-no flex-1 min-h-[44px] sm:min-h-[48px] md:min-h-[48px] rounded-lg font-bold text-white transition-all flex items-center justify-center gap-2 text-base md:text-lg bg-red-500 hover:bg-red-600 active:scale-[0.98] disabled:opacity-50 focus-visible:outline-none"
                >
                  <X className="w-5 h-5 md:w-6 md:h-6" />
                  <span>No</span>
                </button>
              </div>
            ) : (
              <form onSubmit={handleTextSubmit} className="flex gap-2 sm:gap-3 mb-2 md:mb-3">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={getPlaceholder()}
                  className="flex-1 bg-slate-900/50 border-slate-600 text-white h-12 md:h-14 text-base md:text-lg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-green-600"
                  disabled={isCommitting || showPauseModal}
                  autoComplete="off"
                />
                <Button
                  type="submit"
                  disabled={!input.trim() || isCommitting || showPauseModal}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 sm:px-6 h-12 md:h-14"
                >
                  <Send className="w-5 h-5" />
                  <span className="hidden sm:inline ml-2">Send</span>
                </Button>
              </form>
            )}
            
            <p className="text-[10px] md:text-xs text-slate-400 text-center leading-relaxed px-1 md:px-2">
              {isWaitingForAgent 
                ? "Responding to investigator's probing questions..." 
                : "Once you submit an answer, it cannot be changed."}
            </p>
          </div>
        </footer>
      </div>

      <Dialog open={showPauseModal} onOpenChange={setShowPauseModal}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Pause className="w-5 h-5 text-blue-400" />
              Interview Paused
            </DialogTitle>
            <DialogDescription className="text-slate-300 pt-3 space-y-3">
              <p>Your interview is paused. You can close this window and come back anytime to continue.</p>
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
            <Button variant="outline" onClick={handleCopyDetails} className="w-full bg-slate-800 border-slate-600 text-slate-200">
              <Copy className="w-4 h-4 mr-2" />
              Copy Details
            </Button>
            <Button variant="outline" onClick={handleCloseWindow} className="w-full bg-slate-800 border-slate-600 text-slate-200">
              <XCircle className="w-4 h-4 mr-2" />
              Close Window
            </Button>
            <Button onClick={() => setShowPauseModal(false)} className="w-full bg-blue-600 hover:bg-blue-700">
              Keep Working
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCompletionModal} onOpenChange={() => {}}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md" hideClose>
          <DialogHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-4 rounded-full bg-green-600/20">
                <CheckCircle2 className="w-12 h-12 text-green-400" />
              </div>
            </div>
            <DialogTitle className="text-2xl font-bold">Interview Complete</DialogTitle>
            <DialogDescription className="text-slate-300 pt-4 space-y-3">
              <p>Thank you for completing your background interview with {department?.department_name || 'the department'}.</p>
              <p>Your responses have been securely recorded and will be reviewed by your assigned investigator.</p>
              <p className="text-sm text-slate-400">
                Your investigator will follow up with next steps. If you have any questions in the meantime, please contact your investigator.
              </p>
              <p className="text-sm text-slate-400 pt-2">
                Session: <span className="font-mono text-slate-300">{session?.session_code}</span>
              </p>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center pt-4">
            <Button
              onClick={handleCompletionConfirm}
              disabled={isCompletingInterview}
              className="bg-blue-600 hover:bg-blue-700 px-8 h-12"
            >
              {isCompletingInterview ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Close'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </>
  );
}

function HistoryEntry({ entry, getQuestionDisplayNumber, getFollowUpPackName }) {
  if (entry.type === 'question') {
    return (
      <div className="space-y-2 md:space-y-3">
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg md:rounded-xl p-3 md:p-5 opacity-85">
          <div className="flex items-start gap-2 md:gap-3">
            <div className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0">
              <Shield className="w-3 h-3 md:w-3.5 md:h-3.5 text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-col md:flex-row md:items-center gap-0.5 md:gap-2 mb-1 md:mb-1.5">
                <span className="text-xs md:text-sm font-bold text-blue-400">
                  Question {getQuestionDisplayNumber(entry.questionId)}
                </span>
                <span className="text-[10px] md:text-sm font-medium text-slate-400 truncate">{entry.category}</span>
              </div>
              <p className="text-white text-sm md:text-base leading-snug md:leading-relaxed break-words">{entry.questionText}</p>
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <div className="bg-blue-600 rounded-lg md:rounded-xl px-3 md:px-5 py-2 md:py-3 max-w-[85%] md:max-w-2xl">
            <p className="text-white text-sm md:text-base font-medium break-words">{entry.answer}</p>
          </div>
        </div>
      </div>
    );
  }

  if (entry.type === 'followup') {
    return (
      <div className="space-y-2 md:space-y-3">
        <div className="bg-orange-950/30 border border-orange-800/50 rounded-lg md:rounded-xl p-3 md:p-5 opacity-85">
          <div className="flex items-start gap-2 md:gap-3">
            <div className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-orange-600/20 flex items-center justify-center flex-shrink-0">
              <Layers className="w-3 h-3 md:w-3.5 h-3.5 text-orange-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-col md:flex-row md:items-center gap-0.5 md:gap-2 mb-1 md:mb-1.5">
                <span className="text-xs md:text-sm font-semibold text-orange-400">Follow-up</span>
                <span className="text-[10px] md:text-sm text-orange-300 truncate">
                  {entry.substanceName ? `${entry.substanceName} Use` : getFollowUpPackName(entry.packId)}
                </span>
              </div>
              <p className="text-white text-sm md:text-base leading-snug md:leading-relaxed break-words">{entry.questionText}</p>
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <div className="bg-orange-600 rounded-lg md:rounded-xl px-3 md:px-5 py-2 md:py-3 max-w-[85%] md:max-w-2xl">
            <p className="text-white text-sm md:text-base font-medium break-words">{entry.answer}</p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

const AgentMessageBubble = React.memo(({ message }) => {
  const isUser = message.role === 'user';
  
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="bg-purple-600 rounded-lg md:rounded-xl px-3 md:px-5 py-2 md:py-3 max-w-[85%] md:max-w-2xl">
          <p className="text-white text-sm md:text-base font-medium break-words">{message.content}</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-purple-950/30 border border-purple-800/50 rounded-lg md:rounded-xl p-3 md:p-5 opacity-85">
      <div className="flex items-start gap-2 md:gap-3">
        <div className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-purple-600/20 flex items-center justify-center flex-shrink-0">
          <AlertCircle className="w-3 h-3 md:w-3.5 h-3.5 text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 md:gap-2 mb-1 md:mb-1.5">
            <span className="text-xs md:text-sm font-semibold text-purple-400">Investigator</span>
          </div>
          <p className="text-white text-sm md:text-base leading-snug md:leading-relaxed break-words">{message.content}</p>
        </div>
      </div>
    </div>
  );
});

AgentMessageBubble.displayName = 'AgentMessageBubble';
