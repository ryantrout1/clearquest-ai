
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
import {
  logMainQuestion,
  logMainAnswer,
  logFollowUpQuestion,
  logFollowUpAnswer,
  logAIQuestion,
  logAIAnswer,
  loadChatHistory,
  generateAIProbePackId
} from "../components/interview/interactionLogger";
import { toast } from "sonner";

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

  const [engine, setEngine] = useState(null);
  const [session, setSession] = useState(null);
  const [department, setDepartment] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [chatHistory, setChatHistory] = useState([]);
  const [queue, setQueue] = useState([]);
  const [currentItem, setCurrentItem] = useState(null);
  const [currentFollowUpAnswers, setCurrentFollowUpAnswers] = useState({});
  
  const [conversation, setConversation] = useState(null);
  const [agentMessages, setAgentMessages] = useState([]);
  const [isWaitingForAgent, setIsWaitingForAgent] = useState(false);
  const [currentFollowUpPack, setCurrentFollowUpPack] = useState(null);
  const [currentAIProbePackId, setCurrentAIProbePackId] = useState(null);
  const [aiProbeCount, setAIProbeCount] = useState(0);
  
  const [input, setInput] = useState("");
  const [validationHint, setValidationHint] = useState(null);
  const [isCommitting, setIsCommitting] = useState(false);
  
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [isCompletingInterview, setIsCompletingInterview] = useState(false);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [showResumeBanner, setShowResumeBanner] = useState(false);

  const historyRef = useRef(null);
  const inputRef = useRef(null);
  const yesButtonRef = useRef(null);
  const noButtonRef = useRef(null);
  const unsubscribeRef = useRef(null);
  const displayNumberMapRef = useRef({});
  const lastActivityRef = useRef(Date.now());

  const ACTIVE_WINDOW_MS = 5 * 60 * 1000;

  const autoScrollToBottom = useCallback(() => {
    if (!historyRef.current) return;
    requestAnimationFrame(() => {
      if (historyRef.current) {
        historyRef.current.scrollTop = historyRef.current.scrollHeight;
      }
    });
  }, []);

  const updateActiveTime = useCallback(async () => {
    if (!sessionId || !session) return;
    const now = Date.now();
    const timeSinceActivity = now - lastActivityRef.current;
    
    if (timeSinceActivity <= ACTIVE_WINDOW_MS) {
      const secondsToAdd = Math.floor(timeSinceActivity / 1000);
      if (secondsToAdd > 0) {
        try {
          await base44.entities.InterviewSession.update(sessionId, {
            active_seconds: (session.active_seconds || 0) + secondsToAdd,
            last_activity_at: new Date().toISOString()
          });
        } catch (err) {
          console.warn('⚠️ Error updating active time:', err);
        }
      }
    }
    lastActivityRef.current = now;
  }, [sessionId, session]);

  const refreshChatHistory = useCallback(async () => {
    if (!sessionId) return;
    try {
      const history = await loadChatHistory(sessionId);
      setChatHistory(history);
    } catch (err) {
      console.error('❌ Error refreshing chat:', err);
    }
  }, [sessionId]);

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
        } else if (currentItem && !isWaitingForAgent) {
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
    if (chatHistory.length > 0) {
      setTimeout(autoScrollToBottom, 100);
    }
  }, [chatHistory.length, autoScrollToBottom]);

  const initializeInterview = async () => {
    try {
      const loadedSession = await base44.entities.InterviewSession.get(sessionId);
      if (!loadedSession?.id) {
        throw new Error(`Session not found: ${sessionId}`);
      }
      
      if (loadedSession.status === 'paused') {
        setShowResumeBanner(true);
        await base44.entities.InterviewSession.update(sessionId, {
          status: 'active',
          last_activity_at: new Date().toISOString()
        });
        loadedSession.status = 'active';
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
        console.warn('⚠️ Could not load department:', err);
      }
      
      const engineData = await bootstrapEngine(base44);
      setEngine(engineData);
      
      await refreshChatHistory();
      
      if (!loadedSession.conversation_id) {
        try {
          const newConversation = await base44.agents.createConversation({
            agent_name: 'clearquest_interviewer',
            metadata: {
              session_id: sessionId,
              department_code: loadedSession.department_code,
              file_number: loadedSession.file_number
            }
          });
          
          if (newConversation?.id) {
            await base44.entities.InterviewSession.update(sessionId, {
              conversation_id: newConversation.id
            });
            setConversation(newConversation);
          } else {
            setConversation(null);
          }
        } catch (convError) {
          console.warn('⚠️ AI unavailable');
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
          setConversation(null);
        }
      }
      
      if (loadedSession.conversation_id) {
        try {
          unsubscribeRef.current = base44.agents.subscribeToConversation(
            loadedSession.conversation_id,
            (data) => setAgentMessages(data.messages || [])
          );
        } catch (subError) {
          console.warn('⚠️ Could not subscribe');
        }
      }
      
      const hasValidSnapshots = loadedSession.current_item_snapshot;
      
      if (hasValidSnapshots) {
        setCurrentItem(loadedSession.current_item_snapshot);
        setQueue(loadedSession.queue_snapshot || []);
      } else {
        const firstQuestionId = engineData.ActiveOrdered[0];
        setCurrentItem({ id: firstQuestionId, type: 'question' });
        setQueue([]);
      }
      
      setIsLoading(false);

    } catch (err) {
      console.error('❌ Init failed:', err);
      setError(`Failed to load interview: ${err?.message}`);
      setIsLoading(false);
    }
  };

  const persistState = useCallback(async (newCurrentItem, newQueue) => {
    try {
      await base44.entities.InterviewSession.update(sessionId, {
        current_item_snapshot: newCurrentItem,
        queue_snapshot: newQueue,
        last_activity_at: new Date().toISOString()
      });
    } catch (err) {
      console.error('❌ Failed to persist:', err);
    }
  }, [sessionId]);

  const handoffToAI = useCallback(
    async (questionId, packId, substanceName, followUpAnswers) => {
      try {
        console.log("[handoffToAI] Called with:", {
          questionId,
          packId,
          hasConversation: !!conversation,
          conversationType: typeof conversation,
          conversationKeys: conversation ? Object.keys(conversation) : [],
          answersType: typeof followUpAnswers,
          isArray: Array.isArray(followUpAnswers),
          answersLength: Array.isArray(followUpAnswers) ? followUpAnswers.length : 0,
        });

        // If there is no conversation, just fall back to next main question
        if (!conversation || !conversation.id) {
          console.log('[handoffToAI] No valid conversation - skipping to next question');
          const nextQuestionId = computeNextQuestionId(engine, questionId, "Yes");
          if (nextQuestionId && engine.QById[nextQuestionId]) {
            setCurrentItem({ id: nextQuestionId, type: "question" });
            await persistState({ id: nextQuestionId, type: "question" }, []);
          } else {
            setShowCompletionModal(true);
          }
          return;
        }

        // Always work with a safe array
        const safeAnswers =
          Array.isArray(followUpAnswers) && followUpAnswers.length > 0
            ? followUpAnswers
            : [];

        const question = engine.QById[questionId];
        if (!question) {
          console.error("[handoffToAI] Question not found in engine:", questionId);
          return;
        }

        // Build the summary message for the AI
        let summary =
          `Follow-up pack completed for question ${questionId}.\n\n` +
          `Question: ${question.question_text}\n` +
          `Base Answer: Yes\n\n` +
          `Follow-Up Answers:\n`;

        safeAnswers.forEach((a, idx) => {
          summary += `  ${idx + 1}. ${a.questionText}: ${a.answer}\n`;
        });

        summary +=
          `\nUse these answers to probe for more detail.\n` +
          `Ask up to 5 short, focused follow-up questions to clarify any risks, inconsistencies, or missing context.\n` +
          `When you are done, send the next base question as "Qxxx: [question text]".`;

        console.log("[handoffToAI] Summary being sent to AI:\n", summary);

        // Generate and store probe pack id
        const aiProbePackId = generateAIProbePackId(questionId, packId);
        setCurrentAIProbePackId(aiProbePackId);
        setAIProbeCount(0);

        const messagePayload = {
          role: "user",
          content: summary
        };

        console.log("[addMessage] About to send:", {
          conversationObject: {
            id: conversation.id,
            agent_name: conversation.agent_name,
            hasMessages: !!conversation.messages,
            messagesLength: conversation.messages?.length || 0
          },
          messagePayload
        });

        // Send the message to the AI conversation - matching Interview.js signature
        await base44.agents.addMessage(conversation, messagePayload);

        console.log("[handoffToAI] Message sent successfully");

        // Mark that we are now waiting for AI probing
        setIsWaitingForAgent(true);
        setCurrentFollowUpPack({
          questionId,
          packId,
          substanceName,
          aiProbePackId,
          category: question.category,
        });

      } catch (err) {
        console.error("[handoffToAI] Full error object:", err);
        console.error("[handoffToAI] Error stack:", err.stack);
      }
    },
    [conversation, engine, persistState]
  );

  useEffect(() => {
    if (!isWaitingForAgent || !agentMessages.length || !currentFollowUpPack) return;
    
    const processAI = async () => {
      const { aiProbePackId, questionId, packId, category } = currentFollowUpPack;
      
      const probingStart = agentMessages.findIndex(m => 
        m.role === 'user' && 
        m.content?.includes('Follow-up pack completed') &&
        m.content?.includes(questionId)
      );
      
      if (probingStart === -1) return;
      
      const probingMessages = agentMessages.slice(probingStart + 1);
      
      for (let i = 0; i < probingMessages.length; i++) {
        const msg = probingMessages[i];
        const nextMsg = probingMessages[i + 1];
        
        if (msg.role === 'assistant' && msg.content && !msg.content.match(/^Q\d{1,3}:/)) {
          if (nextMsg?.role === 'user' && nextMsg.content) {
            await logAIQuestion(sessionId, questionId, packId, aiProbePackId, msg.content, category);
            await logAIAnswer(sessionId, questionId, packId, aiProbePackId, nextMsg.content, category);
            i++;
          }
        }
        
        if (msg.role === 'assistant' && msg.content?.match(/^Q\d{1,3}:/)) {
          const nextQuestionMatch = msg.content.match(/^(Q\d{1,3}):/);
          if (nextQuestionMatch) {
            const nextQuestionId = nextQuestionMatch[1];
            
            await refreshChatHistory();
            setIsWaitingForAgent(false);
            setCurrentFollowUpPack(null);
            setCurrentAIProbePackId(null);
            setAIProbeCount(0);
            
            if (engine.QById[nextQuestionId]) {
              setCurrentItem({ id: nextQuestionId, type: 'question' });
              await persistState({ id: nextQuestionId, type: 'question' }, []);
            } else {
              setShowCompletionModal(true);
            }
          }
          break;
        }
      }
      
      await refreshChatHistory();
    };
    
    processAI();
  }, [agentMessages, isWaitingForAgent, currentFollowUpPack, sessionId, engine, refreshChatHistory, persistState]);

  const handleAnswer = useCallback(async (value) => {
    if (isCommitting || !currentItem || !engine) return;
    setIsCommitting(true);
    setValidationHint(null);
    lastActivityRef.current = Date.now();

    console.log("[handleAnswer] Called with:", { value, currentItemType: currentItem?.type, currentItem });

    try {
      if (currentItem.type === 'question') {
        const question = engine.QById[currentItem.id];
        if (!question) throw new Error(`Question not found`);

        // Log Q&A pair together
        await logMainQuestion(sessionId, currentItem.id, question.question_text, question.category);
        await logMainAnswer(sessionId, currentItem.id, value, question.category);
        await refreshChatHistory();

        await base44.entities.InterviewSession.update(sessionId, {
          questions_answered_count: (session.questions_answered_count || 0) + 1,
          last_activity_at: new Date().toISOString()
        });

        if (value === 'Yes') {
          const followUpResult = checkFollowUpTrigger(engine, currentItem.id, value);
          
          if (followUpResult) {
            const { packId, substanceName } = followUpResult;
            const packSteps = injectSubstanceIntoPackSteps(engine, packId, substanceName);
            
            if (packSteps?.length > 0) {
              setCurrentFollowUpAnswers({});
              
              const followupQueue = packSteps.map((step, i) => ({
                id: `${packId}:${i}`,
                type: 'followup',
                packId,
                stepIndex: i,
                substanceName,
                totalSteps: packSteps.length,
                category: question.category,
                parentQuestionId: currentItem.id
              }));
              
              setCurrentItem(followupQueue[0]);
              setQueue(followupQueue.slice(1));
              await persistState(followupQueue[0], followupQueue.slice(1));
            } else {
              const nextQuestionId = computeNextQuestionId(engine, currentItem.id, value);
              if (nextQuestionId && engine.QById[nextQuestionId]) {
                setCurrentItem({ id: nextQuestionId, type: 'question' });
                await persistState({ id: nextQuestionId, type: 'question' }, []);
              } else {
                setShowCompletionModal(true);
              }
            }
          } else {
            const nextQuestionId = computeNextQuestionId(engine, currentItem.id, value);
            if (nextQuestionId && engine.QById[nextQuestionId]) {
              setCurrentItem({ id: nextQuestionId, type: 'question' });
              await persistState({ id: nextQuestionId, type: 'question' }, []);
            } else {
              setShowCompletionModal(true);
            }
          }
        } else {
          const nextQuestionId = computeNextQuestionId(engine, currentItem.id, value);
          if (nextQuestionId && engine.QById[nextQuestionId]) {
            setCurrentItem({ id: nextQuestionId, type: 'question' });
            await persistState({ id: nextQuestionId, type: 'question' }, []);
          } else {
            setShowCompletionModal(true);
          }
        }

      } else if (currentItem.type === 'followup') {
        const { packId, stepIndex, substanceName, category } = currentItem;
        const packSteps = injectSubstanceIntoPackSteps(engine, packId, substanceName);
        const step = packSteps[stepIndex];

        console.log("[handleAnswer] Processing follow-up", {
          value,
          packId,
          stepIndex,
          stepsCount: packSteps.length,
          isLastStep: stepIndex === packSteps.length - 1
        });

        if (step.PrefilledAnswer) {
          await logFollowUpQuestion(sessionId, currentItem.id, packId, step.Prompt, category, stepIndex);
          await logFollowUpAnswer(sessionId, currentItem.id, packId, step.PrefilledAnswer, category, stepIndex);
          await refreshChatHistory();
          
          const updatedFollowUpAnswers = {
            ...currentFollowUpAnswers,
            [step.Field_Key]: step.PrefilledAnswer
          };
          setCurrentFollowUpAnswers(updatedFollowUpAnswers);

          let nextItem = queue[0] || null;
          let updatedQueue = queue.slice(1);
          
          while (nextItem?.type === 'followup') {
            const nextStep = packSteps[nextItem.stepIndex];
            if (shouldSkipFollowUpStep(nextStep, updatedFollowUpAnswers)) {
              nextItem = updatedQueue[0] || null;
              updatedQueue = updatedQueue.splice(0,1);
            } else {
              break;
            }
          }
          
          setCurrentItem(nextItem);
          setQueue(updatedQueue);
          await persistState(nextItem, updatedQueue);
          setIsCommitting(false);
          return;
        }

        const validation = validateFollowUpAnswer(value, step.Expected_Type || 'TEXT', step.Options);
        
        if (!validation.valid) {
          console.log("[handleAnswer] Validation failed:", validation.hint);
          setValidationHint(validation.hint);
          setIsCommitting(false);
          setTimeout(() => inputRef.current?.focus(), 100);
          return;
        }

        console.log("[handleAnswer] Validation passed, logging Q&A");

        // Log Q&A pair
        await logFollowUpQuestion(sessionId, currentItem.id, packId, step.Prompt, category, stepIndex);
        await logFollowUpAnswer(sessionId, currentItem.id, packId, validation.normalized || value, category, stepIndex);
        await refreshChatHistory();

        const updatedFollowUpAnswers = {
          ...currentFollowUpAnswers,
          [step.Field_Key]: validation.normalized || value
        };
        setCurrentFollowUpAnswers(updatedFollowUpAnswers);
        
        // CRITICAL: Safe queue advancement with bounds checking
        let nextItem = queue[0] || null;
        let updatedQueue = queue.slice(1);
        
        // Skip any conditional follow-up steps
        while (nextItem?.type === 'followup' && nextItem.packId === packId) {
          const nextStep = packSteps[nextItem.stepIndex];
          if (shouldSkipFollowUpStep(nextStep, updatedFollowUpAnswers)) {
            console.log("[handleAnswer] Skipping conditional step:", nextItem.stepIndex);
            nextItem = updatedQueue[0] || null;
            updatedQueue = updatedQueue.slice(1);
          } else {
            break;
          }
        }
        
        const isLastFollowUp = !nextItem || nextItem.type !== 'followup' || nextItem.packId !== packId;
        
        console.log("[handleAnswer] Follow-up progression", {
          isLastFollowUp,
          nextItemType: nextItem?.type,
          remainingQueueLength: updatedQueue.length
        });
        
        if (isLastFollowUp) {
          console.log("[followup] Completed deterministic follow-up pack", {
            packId,
            stepsCompleted: stepIndex + 1,
            totalSteps: packSteps.length
          });

          // Check if we should skip AI probing (e.g., for hired outcome in PACK_LE_APPS)
          if (shouldSkipProbingForHired(packId, updatedFollowUpAnswers)) {
            console.log("[followup] Skipping AI probing - candidate was hired");
            const triggeringQuestion = [...chatHistory].reverse().find(h => 
              h.question_id && engine.QById[h.question_id]?.followup_pack === packId
            );
            
            if (triggeringQuestion) {
              const nextQuestionId = computeNextQuestionId(engine, triggeringQuestion.question_id, 'Yes');
              setCurrentFollowUpAnswers({});
              
              if (nextQuestionId && engine.QById[nextQuestionId]) {
                console.log("[followup] Advancing to next main question:", nextQuestionId);
                setCurrentItem({ id: nextQuestionId, type: 'question' });
                await persistState({ id: nextQuestionId, type: 'question' }, []);
              } else {
                setShowCompletionModal(true);
              }
            }
          } else {
            console.log("[investigator] Starting AI probing after follow-up pack");
            
            // Build structured list of Q/A pairs from state
            const packSteps = injectSubstanceIntoPackSteps(engine, packId, substanceName);
            const followUpSummary = packSteps
              .map((step) => ({
                questionText: step.Prompt,
                answer: updatedFollowUpAnswers[step.Field_Key],
              }))
              .filter((item) => item.answer != null && item.answer !== "");

            console.log("[investigator] Collected pack answers from state:", followUpSummary.length);

            // Use parentQuestionId from current item or queue
            const parentQuestionId = currentItem.parentQuestionId ||
              queue.find((q) => q.type === "followup" && q.packId === packId)?.parentQuestionId;

            console.log("[investigator] Parent question ID for AI handoff:", parentQuestionId);

            if (parentQuestionId && followUpSummary.length > 0) {
              setCurrentFollowUpAnswers({});
              await handoffToAI(parentQuestionId, packId, substanceName, followUpSummary);
              await refreshChatHistory();
            } else {
              console.error("[followup] Missing parentQuestionId or no follow-up answers", {
                parentQuestionId,
                followUpSummaryCount: followUpSummary.length,
              });

              // Fallback: advance to next main question
              const nextQuestionId = computeNextQuestionId(engine, currentItem.id, "Yes");
              if (nextQuestionId && engine.QById[nextQuestionId]) {
                setCurrentItem({ id: nextQuestionId, type: "question" });
                await persistState({ id: nextQuestionId, type: "question" }, []);
              } else {
                setShowCompletionModal(true);
              }
            }
          }
        } else {
          console.log("[handleAnswer] Advancing to next follow-up step");
          setCurrentItem(nextItem);
          setQueue(updatedQueue);
          await persistState(nextItem, updatedQueue);
        }
      }

      setIsCommitting(false);
      setInput("");

    } catch (err) {
      console.error('❌ Error:', err);
      setIsCommitting(false);
    }
  }, [currentItem, engine, queue, sessionId, conversation, currentFollowUpAnswers, session, chatHistory, refreshChatHistory, isCommitting, handoffToAI, persistState]);

  const handleAgentAnswer = useCallback(async (value) => {
    if (!conversation || !conversation.id || isCommitting || !isWaitingForAgent) return;
    setIsCommitting(true);
    setInput("");
    lastActivityRef.current = Date.now();
    
    setAIProbeCount(aiProbeCount + 1);
    
    await base44.entities.InterviewSession.update(sessionId, {
      ai_probes_count: (session.ai_probes_count || 0) + 1
    });
    
    try {
      const messagePayload = {
        role: 'user',
        content: value
      };

      console.log("[handleAgentAnswer] About to send:", {
        conversationId: conversation.id,
        messagePayload
      });

      await base44.agents.addMessage(conversation, messagePayload);
      
      setIsCommitting(false);
    } catch (err) {
      console.error('❌ [handleAgentAnswer] Error:', err);
      console.error('❌ [handleAgentAnswer] Error stack:', err.stack);
      setIsCommitting(false);
    }
  }, [conversation, isCommitting, isWaitingForAgent, aiProbeCount, sessionId, session]);

  const handleTextSubmit = useCallback((e) => {
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
    }

    const answer = input.trim();
    if (!answer || isCommitting) {
      console.log("[handleTextSubmit] Blocked submit", { answer, isCommitting });
      return;
    }

    console.log("[handleTextSubmit] SUBMIT", {
      answer,
      isWaitingForAgent,
      currentItemType: currentItem?.type
    });

    if (isWaitingForAgent) {
      handleAgentAnswer(answer);
    } else {
      handleAnswer(answer);
    }
  }, [input, isCommitting, isWaitingForAgent, currentItem, handleAnswer, handleAgentAnswer]);

  const handleInputKeyDown = useCallback((e) => {
    console.log("[handleInputKeyDown]", { key: e.key, input });

    // Submit on Enter (but not Shift+Enter), if we have a value and we're not committing
    if (e.key === "Enter" && !e.shiftKey && !isCommitting && input.trim()) {
      handleTextSubmit(e);
    }
  }, [handleTextSubmit, input, isCommitting]);

  const handleCompletionConfirm = async () => {
    setIsCompletingInterview(true);
    try {
      await base44.entities.InterviewSession.update(sessionId, {
        status: 'completed',
        completed_at: new Date().toISOString()
      });
      navigate(createPageUrl("Home"));
    } catch (err) {
      console.error('❌ Error:', err);
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
      toast.error('Failed to pause');
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
        text: step.Prompt,
        packId,
        substanceName,
        stepNumber: stepIndex + 1,
        totalSteps: packSteps.length
      };
    }

    return null;
  };

  const getLastAgentQuestion = useCallback(() => {
    if (!isWaitingForAgent || !agentMessages.length) return null;
    const lastMsg = [...agentMessages].reverse().find(m => m.role === 'assistant');
    if (!lastMsg?.content || lastMsg.content.match(/^Q\d{1,3}:/)) return null;
    const lastIndex = agentMessages.indexOf(lastMsg);
    if (agentMessages[lastIndex + 1]?.role === 'user') return null;
    return lastMsg.content;
  }, [agentMessages, isWaitingForAgent]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-blue-400 animate-spin" />
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
  const answeredCount = chatHistory.filter(h => h.message_type === 'main_question' && h.sender_type === 'candidate').length;
  const progress = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  const isYesNoQuestion = currentPrompt?.type === 'question' && currentPrompt?.responseType === 'yes_no';
  const isFollowUpMode = currentPrompt?.type === 'followup';

  return (
    <>
      <div className="h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex flex-col">
        <header className="flex-shrink-0 bg-slate-800/95 border-b border-slate-700 px-4 py-3">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <Shield className="w-6 h-6 text-blue-400" />
                <h1 className="text-lg font-semibold text-white">ClearQuest Interview</h1>
              </div>
              <Button variant="outline" size="sm" onClick={handlePauseClick} className="text-slate-200">
                <Pause className="w-4 h-4 mr-2" />
                Pause
              </Button>
            </div>
            
            {department && (
              <div className="flex items-center gap-4 text-xs text-slate-400 border-t border-slate-700/50 pt-2">
                <span className="font-medium text-slate-300">{department.department_name}</span>
                <span>•</span>
                <span>Dept Code: <span className="font-mono text-slate-300">{session?.department_code}</span></span>
                <span>•</span>
                <span>File: <span className="font-mono text-slate-300">{session?.file_number}</span></span>
              </div>
            )}
            
            <div className="mt-2">
              <div className="w-full h-2 bg-slate-700/30 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-green-500 to-green-600 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-end gap-2 mt-1.5 text-xs text-green-400">
                <span>{progress}% Complete</span>
                <span>•</span>
                <span>{answeredCount} / {totalQuestions}</span>
              </div>
            </div>
          </div>
        </header>

        {showResumeBanner && (
          <div className="bg-emerald-950/90 border-b border-emerald-800/50 px-4 py-3">
            <div className="max-w-4xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span className="text-sm text-emerald-100">Welcome back! Resuming interview.</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowResumeBanner(false)} className="text-emerald-300">
                Dismiss
              </Button>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-hidden">
          <div ref={historyRef} className="h-full overflow-y-auto px-4 py-6">
            <div className="max-w-4xl mx-auto space-y-4">
              {answeredCount > 0 && (
                <Alert className="bg-blue-950/30 border-blue-800/50 text-blue-200">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    You've completed {answeredCount} of {totalQuestions} questions. Keep going!
                  </AlertDescription>
                </Alert>
              )}
              
              {chatHistory.map((log) => (
                <ChatMessage 
                  key={log.id}
                  log={log}
                  getQuestionDisplayNumber={getQuestionDisplayNumber}
                  getFollowUpPackName={getFollowUpPackName}
                />
              ))}
            </div>
          </div>
        </main>

        <footer className="flex-shrink-0 bg-slate-900/50 border-t border-slate-700">
          <div className="max-w-4xl mx-auto px-4 py-4">
            {lastAgentQuestion && isWaitingForAgent ? (
              <div className="mb-4 bg-slate-800 border border-slate-700 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-purple-600/30 border border-purple-500/50 flex items-center justify-center">
                    <AlertCircle className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-semibold text-purple-400">Investigator</span>
                      <span className="text-xs text-slate-500">•</span>
                      <span className="text-xs text-purple-300">Probing {aiProbeCount + 1} of 5</span>
                    </div>
                    <p className="text-white text-lg">{lastAgentQuestion}</p>
                  </div>
                </div>
              </div>
            ) : currentPrompt ? (
              <div className="mb-4 bg-slate-800 border border-slate-700 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-600/30 border border-blue-500/50 flex items-center justify-center">
                    {isFollowUpMode ? <Layers className="w-4 h-4 text-orange-400" /> : <Shield className="w-4 h-4 text-blue-400" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {isFollowUpMode ? (
                        <>
                          <span className="text-sm font-semibold text-orange-400">
                            Follow-up {currentPrompt.stepNumber} of {currentPrompt.totalSteps}
                          </span>
                          <span className="text-xs text-slate-500">•</span>
                          <span className="text-sm text-orange-300">{getFollowUpPackName(currentPrompt.packId)}</span>
                        </>
                      ) : (
                        <>
                          <span className="text-lg font-bold text-blue-400">
                            Question {getQuestionDisplayNumber(currentPrompt.id)}
                          </span>
                          <span className="text-sm text-slate-500">•</span>
                          <span className="text-sm text-slate-300">{currentPrompt.category}</span>
                        </>
                      )}
                    </div>
                    <p className="text-white text-lg font-semibold">{currentPrompt.text}</p>
                    
                    {validationHint && (
                      <div className="mt-3 bg-yellow-900/40 border border-yellow-700/60 rounded-lg p-3">
                        <p className="text-yellow-200 text-sm">{validationHint}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {isYesNoQuestion ? (
              <div className="flex gap-3">
                <button
                  ref={yesButtonRef}
                  onClick={() => handleAnswer("Yes")}
                  disabled={isCommitting}
                  className="flex-1 min-h-[52px] rounded-lg font-bold text-white bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 transition-all"
                >
                  <Check className="w-5 h-5 inline mr-2" />
                  Yes
                </button>
                <button
                  ref={noButtonRef}
                  onClick={() => handleAnswer("No")}
                  disabled={isCommitting}
                  className="flex-1 min-h-[52px] rounded-lg font-bold text-white bg-red-500 hover:bg-red-600 transition-all"
                >
                  <X className="w-5 h-5 inline mr-2" />
                  No
                </button>
              </div>
            ) : (
              <form onSubmit={handleTextSubmit} className="flex gap-3">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your answer..."
                  className="flex-1 bg-slate-800 border border-slate-600 text-white h-14 text-lg px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isCommitting}
                  onKeyDown={handleInputKeyDown}
                />
                <Button
                  type="submit"
                  disabled={!input.trim() || isCommitting}
                  className="bg-blue-600 hover:bg-blue-700 h-14 px-6"
                >
                  <Send className="w-5 h-5" />
                </Button>
              </form>
            )}
            
            <p className="text-xs text-slate-400 text-center mt-3">
              {isWaitingForAgent ? `Probing question ${aiProbeCount + 1} of 5` : "Once submitted, answers cannot be changed"}
            </p>
          </div>
        </footer>
      </div>

      <Dialog open={showPauseModal} onOpenChange={setShowPauseModal}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pause className="w-5 h-5 text-blue-400" />
              Interview Paused
            </DialogTitle>
            <DialogDescription className="text-slate-300 pt-3 space-y-3">
              <p>Your interview is paused. Come back anytime to continue.</p>
              <div className="flex gap-2">
                <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded">
                  <span className="text-xs text-slate-400 block">Dept Code</span>
                  <span className="font-mono text-sm">{session?.department_code}</span>
                </div>
                <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded">
                  <span className="text-xs text-slate-400 block">File Number</span>
                  <span className="font-mono text-sm">{session?.file_number}</span>
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 pt-4">
            <Button onClick={() => setShowPauseModal(false)} className="w-full bg-blue-600">
              Keep Working
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCompletionModal} onOpenChange={() => {}}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white" hideClose>
          <DialogHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-4 rounded-full bg-green-600/20">
                <CheckCircle2 className="w-12 h-12 text-green-400" />
              </div>
            </div>
            <DialogTitle className="text-2xl font-bold">Interview Complete</DialogTitle>
            <DialogDescription className="text-slate-300 pt-4">
              <p>Thank you for completing your background interview.</p>
              <p className="mt-2">Your responses have been securely recorded.</p>
            </DialogDescription>
          </DialogHeader>
          <Button onClick={handleCompletionConfirm} disabled={isCompletingInterview} className="bg-blue-600 mt-4">
            {isCompletingInterview ? <Loader2 className="w-5 h-5 animate-spin" /> : 'OK'}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ChatMessage({ log, getQuestionDisplayNumber, getFollowUpPackName }) {
  const isQuestion = log.message_type === 'main_question' && log.sender_type === 'investigator';
  const isAnswer = log.message_type === 'main_question' && log.sender_type === 'candidate';
  const isFollowUpQ = log.message_type === 'followup_question';
  const isFollowUpA = log.message_type === 'followup_answer';
  const isAIQ = log.message_type === 'ai_question';
  const isAIA = log.message_type === 'ai_answer';
  
  if (isQuestion) {
    return (
      <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full bg-blue-600/30 flex items-center justify-center">
            <Shield className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <div className="text-sm font-bold text-blue-400 mb-1">
              Question {getQuestionDisplayNumber(log.question_id)} • {log.section_id}
            </div>
            <p className="text-white">{log.content}</p>
          </div>
        </div>
      </div>
    );
  }
  
  if (isAnswer) {
    return (
      <div className="flex justify-end">
        <div className="bg-blue-600 rounded-xl px-5 py-3 max-w-2xl">
          <p className="text-white font-medium">{log.content}</p>
        </div>
      </div>
    );
  }
  
  if (isFollowUpQ) {
    return (
      <div className="bg-orange-950/40 border border-orange-800/50 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full bg-orange-600/30 flex items-center justify-center">
            <Layers className="w-4 h-4 text-orange-400" />
          </div>
          <div>
            <div className="text-sm font-semibold text-orange-400 mb-1">
              Follow-up • {getFollowUpPackName(log.followup_id)}
            </div>
            <p className="text-white">{log.content}</p>
          </div>
        </div>
      </div>
    );
  }
  
  if (isFollowUpA) {
    return (
      <div className="flex justify-end">
        <div className="bg-orange-600 rounded-xl px-5 py-3 max-w-2xl">
          <p className="text-white font-medium">{log.content}</p>
        </div>
      </div>
    );
  }
  
  if (isAIQ) {
    return (
      <div className="bg-purple-950/40 border border-purple-800/50 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full bg-purple-600/30 flex items-center justify-center">
            <AlertCircle className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <div className="text-sm font-semibold text-purple-400 mb-1">Investigator</div>
            <p className="text-white">{log.content}</p>
          </div>
        </div>
      </div>
    );
  }
  
  if (isAIA) {
    return (
      <div className="flex justify-end">
        <div className="bg-purple-600 rounded-xl px-5 py-3 max-w-2xl">
          <p className="text-white font-medium">{log.content}</p>
        </div>
      </div>
    );
  }
  
  return null;
}
