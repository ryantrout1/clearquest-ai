
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
  // NEW: Track answered agent questions to prevent showing unanswered questions
  const [answeredAgentQuestions, setAnsweredAgentQuestions] = useState(new Set());

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
      console.log('🚀 [PRODUCTION] Initializing HYBRID interview flow (v2.5)...');
      const startTime = performance.now();

      const loadedSession = await base44.entities.InterviewSession.get(sessionId);
      
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
      
      const engineData = await bootstrapEngine(base44);
      setEngine(engineData);
      
      if (!loadedSession.conversation_id) {
        try {
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
          } else {
            setConversation(null);
          }
        } catch (convError) {
          console.warn('⚠️ Continuing without AI probing');
          setConversation(null);
        }
      } else {
        try {
          const existingConversation = await base44.agents.getConversation(loadedSession.conversation_id);
          
          if (existingConversation?.id) {
            setConversation(existingConversation);
            if (existingConversation.messages) {
              setAgentMessages(existingConversation.messages);
            }
          }
        } catch (convError) {
          console.warn('⚠️ Could not load conversation');
        }
      }
      
      if (loadedSession.conversation_id) {
        try {
          unsubscribeRef.current = base44.agents.subscribeToConversation(
            loadedSession.conversation_id,
            (data) => {
              setAgentMessages(data.messages || []);
            }
          );
        } catch (subError) {
          console.warn('⚠️ Could not subscribe to conversation');
        }
      }
      
      const hasValidSnapshots = loadedSession.transcript_snapshot && 
                                 loadedSession.transcript_snapshot.length > 0;
      
      const needsRebuild = loadedSession.status === 'in_progress' && 
                           (!loadedSession.current_item_snapshot || !hasValidSnapshots);
      
      if (needsRebuild) {
        await rebuildSessionFromResponses(engineData, loadedSession);
      } else if (hasValidSnapshots) {
        restoreFromSnapshots(engineData, loadedSession);
      } else {
        const firstQuestionId = engineData.ActiveOrdered[0];
        setQueue([]);
        setCurrentItem({ id: firstQuestionId, type: 'question' });
      }
      
      setIsLoading(false);
      console.log(`✅ Interview ready in ${(performance.now() - startTime).toFixed(2)}ms`);

    } catch (err) {
      console.error('❌ Initialization failed:', err);
      setError(`Failed to load interview: ${err.message}`);
      setIsLoading(false);
    }
  };

  const restoreFromSnapshots = (engineData, loadedSession) => {
    const restoredTranscript = loadedSession.transcript_snapshot || [];
    setTranscript(restoredTranscript);
    
    const restoredQueue = loadedSession.queue_snapshot || [];
    setQueue(restoredQueue);
    
    const restoredCurrentItem = loadedSession.current_item_snapshot || null;
    setCurrentItem(restoredCurrentItem);
    
    if (!restoredCurrentItem && restoredQueue.length > 0) {
      const nextItem = restoredQueue[0];
      setCurrentItem(nextItem);
      setQueue(restoredQueue.slice(1));
    }
    
    if (!restoredCurrentItem && restoredQueue.length === 0 && restoredTranscript.length > 0) {
      if (loadedSession.status === 'completed') {
        setShowCompletionModal(true);
      }
    }
    
    setTimeout(() => autoScrollToBottom(), 100);
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
        data_version: 'v2.5-hybrid'
      });
    } catch (err) {
      console.error('❌ Failed to persist state:', err);
    }
  };

  const handoffToAgentForProbing = useCallback(async (questionId, packId, substanceName, followUpAnswers) => {
    if (!conversation) {
      return false;
    }
    
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
      // CRITICAL FIX: Set waiting state BEFORE sending message to show loading immediately
      setIsWaitingForAgent(true);
      setCurrentFollowUpPack({ questionId, packId, substanceName });
      
      await base44.agents.addMessage(conversation, {
        role: 'user',
        content: summaryLines.join('\n')
      });
      
      return true;
    } catch (err) {
      console.error('❌ Error sending to agent:', err);
      setIsWaitingForAgent(false);
      setCurrentFollowUpPack(null);
      return false;
    }
  }, [conversation, engine]);

  useEffect(() => {
    if (!isWaitingForAgent || agentMessages.length === 0 || !engine || !currentFollowUpPack) return;
    
    const lastAgentMessage = [...agentMessages].reverse().find(m => m.role === 'assistant');
    if (!lastAgentMessage?.content) return;
    
    const allQuestionMatches = lastAgentMessage.content.match(/\bQ\d{1,3}\b/gi);
    if (allQuestionMatches && allQuestionMatches.length > 0) {
      const nextQuestionId = allQuestionMatches[allQuestionMatches.length - 1].toUpperCase();
      
      if (nextQuestionId === currentFollowUpPack.questionId) {
        return;
      }
      
      if (!engine.QById[nextQuestionId]) {
        setIsWaitingForAgent(false);
        setCurrentFollowUpPack(null);
        setCurrentItem(null);
        setQueue([]);
        setShowCompletionModal(true);
        return;
      }

      saveProbingToDatabase(currentFollowUpPack.questionId, currentFollowUpPack.packId, agentMessages);
      
      setIsWaitingForAgent(false);
      setCurrentFollowUpPack(null);
      setCurrentItem({ id: nextQuestionId, type: 'question' });
      setQueue([]);
      persistStateToDatabase(transcript, [], { id: nextQuestionId, type: 'question' });
    }
  }, [agentMessages, isWaitingForAgent, transcript, engine, currentFollowUpPack, saveProbingToDatabase, persistStateToDatabase]);

  // ============================================================================
  // ANSWER HANDLING
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
        setTranscript(newTranscript);

        if (value === 'Yes') {
          const followUpResult = checkFollowUpTrigger(engine, currentItem.id, value);
          
          if (followUpResult) {
            const { packId, substanceName } = followUpResult;
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
                  totalSteps: packSteps.length
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
          const nextQuestionId = computeNextQuestionId(engine, currentItem.id, value);
          const answeredCount = newTranscript.filter(t => t.type === 'question').length;
          const hasAnsweredAll = answeredCount >= engine.TotalQuestions;
          
          if (nextQuestionId && engine.QById[nextQuestionId]) {
            setQueue([]);
            setCurrentItem({ id: nextQuestionId, type: 'question' });
            await persistStateToDatabase(newTranscript, [], { id: nextQuestionId, type: 'question' });
          } else if (hasAnsweredAll) {
            setCurrentItem(null);
            setQueue([]);
            await persistStateToDatabase(newTranscript, [], null);
            setShowCompletionModal(true);
          } else {
            const answeredIds = new Set(newTranscript.filter(t => t.type === 'question').map(t => t.questionId));
            const nextUnanswered = engine.ActiveOrdered.find(qid => !answeredIds.has(qid));
            
            if (nextUnanswered) {
              setQueue([]);
              setCurrentItem({ id: nextUnanswered, type: 'question' });
              await persistStateToDatabase(newTranscript, [], { id: nextUnanswered, type: 'question' });
            } else {
              setCurrentItem(null);
              setQueue([]);
              await persistStateToDatabase(newTranscript, [], null);
              setShowCompletionModal(true);
            }
          }
        }
        
        await saveAnswerToDatabase(currentItem.id, value, question);

      } else if (currentItem.type === 'followup') {
        const { packId, stepIndex, substanceName } = currentItem;
        const packSteps = injectSubstanceIntoPackSteps(engine, packId, substanceName);
        
        if (!packSteps || !packSteps[stepIndex]) {
          throw new Error(`Follow-up pack ${packId} step ${stepIndex} not found`);
        }
        const step = packSteps[stepIndex];

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
          await saveFollowUpAnswer(packId, step.Field_Key, step.PrefilledAnswer, substanceName);
          
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
        setTranscript(newTranscript);

        const updatedFollowUpAnswers = {
          ...currentFollowUpAnswers,
          [step.Field_Key]: validation.normalized || value
        };
        setCurrentFollowUpAnswers(updatedFollowUpAnswers);

        await saveFollowUpAnswer(packId, step.Field_Key, validation.normalized || value, substanceName);
        
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
            const packAnswers = newTranscript.filter(t => 
              t.type === 'followup' && t.packId === packId
            );
            
            const triggeringQuestion = [...newTranscript].reverse().find(t => 
              t.type === 'question' && 
              engine.QById[t.questionId]?.followup_pack === packId &&
              t.answer === 'Yes'
            );
            
            if (triggeringQuestion) {
              setCurrentFollowUpAnswers({});
              setCurrentItem(null);
              setQueue([]);
              await persistStateToDatabase(newTranscript, [], null);
              
              await handoffToAgentForProbing(
                triggeringQuestion.questionId,
                packId,
                substanceName,
                packAnswers
              );
            } else {
              setCurrentItem(null);
              setQueue([]);
              await persistStateToDatabase(newTranscript, [], null);
              setShowCompletionModal(true);
            }
          }
        } else {
          setQueue(updatedQueue);
          setCurrentItem(nextItem);
          await persistStateToDatabase(newTranscript, updatedQueue, nextItem);
        }
      }

      setIsCommitting(false);
      setInput("");

    } catch (err) {
      console.error('❌ Error processing answer:', err);
      setIsCommitting(false);
      setError(`Error: ${err.message}`);
    }

  }, [currentItem, engine, queue, transcript, sessionId, isCommitting, conversation, currentFollowUpAnswers, handoffToAgentForProbing, persistStateToDatabase, saveFollowUpAnswer, saveAnswerToDatabase]);

  const handleAgentAnswer = useCallback(async (value) => {
    if (!conversation || isCommitting || !isWaitingForAgent) return;
    
    setIsCommitting(true);
    setInput("");
    
    try {
      await base44.agents.addMessage(conversation, {
        role: 'user',
        content: value
      });
      
      setIsCommitting(false);
    } catch (err) {
      console.error('❌ Error sending to agent:', err);
      setError('Failed to send message to AI agent');
      setIsCommitting(false);
    }
  }, [conversation, isCommitting, isWaitingForAgent]);

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
        setCurrentItem(null);
        setQueue([]);
        setShowCompletionModal(true);
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
        setTimeout(() => handleAnswer(step.PrefilledAnswer), 100);
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
    
    if (lastAssistantMessage.content?.includes('Follow-up pack completed')) return null;
    if (lastAssistantMessage.content?.match(/\b(Q\d{1,3})\b/i)) return null;

    const lastIndex = agentMessages.findIndex(m => m === lastAssistantMessage);
    if (lastIndex !== -1 && agentMessages[lastIndex + 1]?.role === 'user') {
      return null;
    }
    
    return lastAssistantMessage.content;
  }, [agentMessages, isWaitingForAgent]);

  // CRITICAL FIX: Only show agent messages that have been answered (completed Q&A pairs)
  const getDisplayableAgentMessages = useCallback(() => {
    if (!isWaitingForAgent || agentMessages.length === 0) return [];
    
    const displayable = [];
    
    for (let i = 0; i < agentMessages.length; i++) {
      const msg = agentMessages[i];
      
      // Skip empty or system messages
      if (!msg.content || msg.content.trim() === '') continue;
      if (msg.content?.includes('Follow-up pack completed')) continue;
      if (msg.content?.match(/\b(Q\d{1,3})\b/i)) continue;
      
      // For assistant messages, only show if followed by user response
      if (msg.role === 'assistant') {
        const nextMsg = agentMessages[i + 1];
        if (nextMsg && nextMsg.role === 'user') {
          // Q&A pair complete - show both
          displayable.push(msg);
          displayable.push(nextMsg);
          i++; // Skip next iteration since we already added it
        }
        // If no answer yet, don't add (it will show in active question box)
      } else if (msg.role === 'user') {
        // User messages are part of previous Q&A pair, if not caught by assistant message above, skip
        continue;
      }
    }
    
    return displayable;
  }, [agentMessages, isWaitingForAgent]);

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

  const isYesNoQuestion = currentPrompt?.type === 'question' && currentPrompt?.responseType === 'yes_no' && !isWaitingForAgent;
  const isFollowUpMode = currentPrompt?.type === 'followup';
  const requiresClarification = validationHint !== null;

  // CRITICAL FIX: Use memoized function that only shows answered Q&A pairs
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
            
            <div className="mt-1.5 md:mt-2">
              <div 
                className="w-full h-1.5 md:h-2 bg-slate-700/30 rounded-full overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
              >
                <div 
                  className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-full transition-all duration-500 ease-out"
                  style={{ 
                    width: `${progress}%`,
                    boxShadow: progress > 0 ? '0 0 12px rgba(34, 197, 94, 0.6)' : 'none'
                  }}
                />
              </div>
              <div className="flex justify-end items-center gap-1.5 md:gap-2 mt-1 md:mt-1.5">
                <span className="text-[10px] md:text-xs font-medium text-green-400">{progress}%</span>
                <span className="text-[10px] md:text-xs text-green-400">•</span>
                <span className="text-[10px] md:text-xs font-medium text-green-400">{answeredCount}/{totalQuestions}</span>
              </div>
            </div>
          </div>
        </header>

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
              
              {/* CRITICAL FIX: Always show section if waiting for agent, render answered Q&A pairs */}
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
                  {displayableAgentMessages.length === 0 && (
                    <div className="flex items-center gap-2 text-slate-400 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Investigator is reviewing your responses...</span>
                    </div>
                  )}
                </div>
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
                      <AlertCircle className="w-3.5 h-3.5 md:w-4 md:h-4 text-purple-400" />
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
                              {currentPrompt.substanceName ? `${currentPrompt.substanceName}` : getFollowUpPackName(currentPrompt.packId)}
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
                  className="btn-yn btn-yes flex-1 min-h-[44px] sm:min-h-[48px] md:min-h-[48px] rounded-lg font-bold text-white transition-all flex items-center justify-center gap-2 text-base md:text-lg bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 active:scale-[0.98] disabled:opacity-50"
                >
                  <Check className="w-5 h-5 md:w-6 md:h-6" />
                  <span>Yes</span>
                </button>
                <button
                  ref={noButtonRef}
                  type="button"
                  onClick={() => handleAnswer("No")}
                  disabled={isCommitting || showPauseModal}
                  className="btn-yn btn-no flex-1 min-h-[44px] sm:min-h-[48px] md:min-h-[48px] rounded-lg font-bold text-white transition-all flex items-center justify-center gap-2 text-base md:text-lg bg-red-500 hover:bg-red-600 active:scale-[0.98] disabled:opacity-50"
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
                  className="flex-1 bg-slate-900/50 border-slate-600 text-white h-12 md:h-14 text-base md:text-lg focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 focus-visible:ring-offset-[#121c33]"
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
              <p>Thank you for completing your background interview.</p>
              <p>Your responses have been securely recorded and will be reviewed by investigators.</p>
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
              {isCompletingInterview ? <Loader2 className="w-5 h-5 animate-spin" /> : 'OK'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
              <Layers className="w-3 h-3 md:w-3.5 md:h-3.5 text-orange-400" />
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

// CRITICAL FIX: Memoize to prevent re-renders
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
