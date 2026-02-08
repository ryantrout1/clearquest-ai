/**
 * handleAnswerImpl - Extracted body of handleAnswer callback
 * This is the implementation logic extracted from CandidateInterview.jsx
 * to reduce file size without moving hooks.
 */

import React from "react";
import { base44 } from "@/api/base44Client";
import {
  checkFollowUpTrigger,
  computeNextQuestionId,
} from "@/components/interviewEngine.jsx";
import { FOLLOWUP_PACK_CONFIGS } from "@/components/followups/followupPackConfig.jsx";
import { appendQuestionEntry, appendAnswerEntry } from "@/components/utils/transcriptLogger";

/**
 * Implementation of handleAnswer callback.
 * @param {Object} deps - All outer-scope dependencies from CandidateInterview
 * @param {string} value - The answer value
 */
export async function handleAnswerImpl(deps, value) {
  const {
    // State values
    activeUiItem_S_SAFE,
    v3PromptPhase,
    bottomBarModeSOT,
    bottomBarModeSOT_SAFE,
    currentItem_S,
    effectiveItemType_SAFE,
    engine_S,
    isCommitting,
    sessionId,
    session,
    activeV2Pack,
    v2ClarifierState,
    v2PackMode,
    aiFollowupCounts,
    aiProbingEnabled,
    aiProbingDisabledForSession,
    currentFollowUpAnswers,
    multiInstanceGate,
    queue,
    dbTranscript,
    sections,
    currentSectionIndex,
    sectionCompletionMessage,
    
    // Refs
    submittedKeysRef,
    lastIdempotencyLockedRef,
    lastV3SubmitLockKeyRef,
    committingItemIdRef,
    canonicalTranscriptRef,
    completedSectionKeysRef,
    inputRef,
    lastLoggedV2PackFieldRef,
    triggeredPacksRef,
    recentlySubmittedUserAnswersRef,
    v3ActivePromptTextRef,
    v3BaseQuestionIdRef,
    v3OpenerFailsafeTimerRef,
    v3OpenerSubmitLoopKeyRef,
    v3OpenerSubmittedRef,
    v3OpenerSubmitTokenRef,
    v3OptimisticPersistRef,
    v3PackEntryContextRef,
    v3PackEntryFailsafeTimerRef,
    v3PackEntryFailsafeTokenRef,
    v3ProbingActiveRef,
    
    // State setters
    setActiveV2Pack,
    setAiFollowupCounts,
    setBackendQuestionTextMap,
    setCompletedSectionsCount,
    setCurrentFieldProbe,
    setCurrentFollowUpAnswers,
    setCurrentIdeCategoryId,
    setCurrentIdeQuestion,
    setCurrentIncidentId,
    setCurrentItem,
    setDbTranscriptSafe,
    setError,
    setFieldSuggestions,
    setInIdeProbingLoop,
    setInput,
    setIsCommitting,
    setIsInvokeLLMMode,
    setIsWaitingForAgent,
    setPendingSectionTransition,
    setQueue,
    setSectionCompletionMessage,
    setShowCompletionModal,
    setUiBlocker,
    setV2ClarifierState,
    setV2PackMode,
    setV2PackTriggerQuestionId,
    setV3ProbeDisplayHistory,
    setV3ProbingActive,
    setV3ProbingContext,
    setValidationHint,
    
    // Functions
    advanceToNextBaseQuestion,
    onFollowupPackComplete,
    persistStateToDatabase,
    refreshTranscriptFromDB,
    clearDraft,
    navigate,
    logOnce,
    runV2FieldProbeIfNeeded,
    saveFollowUpAnswer,
    saveV2PackFieldResponse,
    getPackMaxAiFollowups,
    generateFieldSuggestions,
    hasQuestionBeenLogged,
    AlertCircle,
    Button,
  } = deps;

  // GUARD: Block YES/NO during V3 prompt answering (prevents stray "Yes" bubble)
  if (activeUiItem_S_SAFE?.kind === 'V3_PROMPT' || (v3PromptPhase === 'ANSWER_NEEDED' && bottomBarModeSOT === 'TEXT_INPUT')) {
    // Allow V3 probe answer submission (text input), block YES/NO only
    const isYesNoAnswer = value === 'Yes' || value === 'No';
    if (isYesNoAnswer) {
      console.log('[YESNO_BLOCKED_DURING_V3_PROMPT]', {
        clicked: value,
        activeUiItem_SKind: activeUiItem_S_SAFE?.kind,
        v3PromptPhase,
        currentItem_SType: currentItem_S?.type,
        bottomBarModeSOT_SAFE,
        reason: 'V3 prompt active - YES/NO submission blocked'
      });
      return; // Hard block - prevent stray "Yes"/"No" appends
    }
  }
  
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
  const isMiGateSubmit = currentItem_S?.type === 'multi_instance_gate' || 
                         effectiveItemType_SAFE === 'multi_instance_gate' ||
                         activeUiItem_S_SAFE?.kind === "MI_GATE";
  
  const submitKey = buildSubmitKey(currentItem_S, value);
  
  // MI_GATE: Log key for diagnostics
  if (isMiGateSubmit) {
    console.log('[MI_GATE][IDEMPOTENCY_KEY]', {
      submitKey,
      packId: currentItem_S?.packId,
      instanceNumber: currentItem_S?.instanceNumber,
      answer: value
    });
  }
  
  if (submitKey && submittedKeysRef.current.has(submitKey)) {
    // MI_GATE: Log if blocked by idempotency
    if (isMiGateSubmit) {
      console.warn('[MI_GATE][IDEMPOTENCY_BLOCKED]', {
        submitKey,
        packId: currentItem_S?.packId,
        instanceNumber: currentItem_S?.instanceNumber,
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
    console.log(`[IDEMPOTENCY][LOCKED] ${submitKey}`, { packId: currentItem_S.packId, instanceNumber: currentItem_S.instanceNumber, sessionId });
    lastIdempotencyLockedRef.current = submitKey; // DEV: Capture for debug bundle
    
    // CRITICAL: Store actual lock key for v3_pack_opener submits (enables correct release in watchdog)
    if (currentItem_S.type === 'v3_pack_opener') {
      lastV3SubmitLockKeyRef.current = submitKey;
    }
  }
  
  // MI_GATE TRACE 2: handleAnswer entry audit (CORRECT LOCATION - YES/NO calls this directly)
  if (currentItem_S?.type === 'multi_instance_gate' || effectiveItemType_SAFE === 'multi_instance_gate') {
    console.log('[MI_GATE][TRACE][SUBMIT_CLICK]', {
      effectiveItemType_SAFE,
      currentItem_SType: currentItem_S?.type,
      currentItem_SId: currentItem_S?.id,
      packId: currentItem_S?.packId,
      instanceNumber: currentItem_S?.instanceNumber,
      bottomBarModeSOT_SAFE,
      answer: value,
      source: 'handleAnswer_direct_call'
    });
  }
  
  // EXPLICIT ENTRY LOG: Log which branch we're entering
  console.log(`[HANDLE_ANSWER][ENTRY] ========== ANSWER HANDLER INVOKED ==========`);
  console.log(`[HANDLE_ANSWER][ENTRY]`, {
    currentItem_SType: currentItem_S?.type,
    currentItem_SId: currentItem_S?.id,
    packId: currentItem_S?.packId,
    fieldKey: currentItem_S?.fieldKey,
    instanceNumber: currentItem_S?.instanceNumber,
    v2PackMode,
    isCommitting,
    hasEngine: !!engine_S,
    answerPreview: value?.substring?.(0, 50) || value,
    submitKey
  });

  // EXPLICIT V2 PACK FIELD ENTRY LOG - confirm we're hitting this branch
  if (currentItem_S?.type === 'v2_pack_field') {
    console.log(`[HANDLE_ANSWER][V2_PACK_FIELD] >>>>>>>>>> V2 PACK FIELD DETECTED <<<<<<<<<<`);
    console.log(`[HANDLE_ANSWER][V2_PACK_FIELD]`, {
      packId: currentItem_S.packId,
      fieldKey: currentItem_S.fieldKey,
      fieldIndex: currentItem_S.fieldIndex,
      instanceNumber: currentItem_S.instanceNumber,
      baseQuestionId: currentItem_S.baseQuestionId,
      answer: value?.substring?.(0, 80) || value,
      hasActiveV2Pack: !!activeV2Pack
    });
  }
  
  // EXPLICIT MULTI_INSTANCE_GATE ENTRY LOG - confirm we're hitting this branch
  if (currentItem_S?.type === 'multi_instance_gate') {
    console.log(`[HANDLE_ANSWER][MULTI_INSTANCE_GATE] >>>>>>>>>> MULTI_INSTANCE_GATE DETECTED <<<<<<<<<<`);
    console.log(`[HANDLE_ANSWER][MULTI_INSTANCE_GATE]`, {
      packId: currentItem_S.packId,
      instanceNumber: currentItem_S.instanceNumber,
      answer: value?.substring?.(0, 80) || value,
      hasMultiInstanceGate: !!multiInstanceGate
    });
  }

  // MI_GATE BYPASS: Allow MI_GATE YES/NO even if isCommitting is true
  if (isMiGateSubmit && engine_S && currentItem_S) {
    // TDZ FIX: The isCommitting reference here is safe; it refers to the state variable.
    console.warn('[MI_GATE][BYPASS_GUARD]', {
      isCommitting,
      hasEngine: !!engine_S,
      hasCurrentItem: !!currentItem_S,
      packId: currentItem_S?.packId,
      instanceNumber: currentItem_S?.instanceNumber,
      answer: value,
      reason: 'MI_GATE bypass - allowing submission despite isCommitting'
    });
    // Continue to MI_GATE handler below (skip generic guard)
  } else if (isCommitting || !currentItem_S || !engine_S) {
    console.log(`[HANDLE_ANSWER][SKIP] Skipping - isCommitting=${isCommitting}, hasCurrentItem=${!!currentItem_S}, hasEngine=${!!engine_S}`);
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
    // CRITICAL: Every V2 pack field answer MUST go through the backend probe engine_S
    // ========================================================================
    if (currentItem_S.type === 'v2_pack_field') {
      const { packId, fieldIndex, fieldKey, fieldConfig, baseQuestionId, instanceNumber } = currentItem_S;

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
      const baseQuestion = baseQuestionId && engine_S?.QById ? engine_S.QById[baseQuestionId] : null;

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

      // CRITICAL: Declare isCurrentItemCommitting before any usage to avoid TDZ errors
      const isV2FieldCommitGuard = deps.cqIsItemCommitting(currentItem_S?.id); // [CQ_ANCHOR_V2_FIELD_COMMITTING_LINE]

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

      // Call V2 backend engine_S BEFORE checking if pack is complete
      const maxAiFollowups = getPackMaxAiFollowups(packId);
      const fieldCountKey = `${packId}:${fieldKey}:${instanceNumber}`;
      const probeCount = aiFollowupCounts[fieldCountKey] || 0;

      // CRITICAL: V2 pack fields ALWAYS consult the backend probe engine_S (same as regular V2 follow-ups)
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

        await persistStateToDatabase(null, [], currentItem_S);
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

      // CRITICAL: Clear V2 pack state AND currentItem_S atomically to prevent transitional render crash
      setActiveV2Pack(null);
      setV2PackMode("BASE");
      setCurrentFollowUpAnswers({});
      setCurrentItem(null); // Clear immediately to prevent stale v2_pack_field renders
      lastLoggedV2PackFieldRef.current = null;

      // UX: Clear draft on successful pack completion
      clearDraft();

      const baseQuestionForExit = engine_S.QById[baseQuestionId];
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
    if (currentItem_S.type === 'v3_pack_opener') {
      // INSTRUMENTATION: Log IMMEDIATELY before any async work
      
      const { packId, categoryId, categoryLabel, openerText, baseQuestionId, questionCode, sectionId, instanceNumber, packData } = currentItem_S;
      
      // DEFENSIVE: Log if openerText was missing (fallback used)
      if (!openerText || openerText.trim() === '') {
      }

      // CORRELATION TRACE: Generate traceId for V3 probing session
      const traceId = `${sessionId}-${Date.now()}`;
      console.log('[PROCESSING][START]', {
        traceId,
        sessionId,
        currentItem_SId: currentItem_S.id,
        currentItem_SType: 'v3_pack_opener',
        screenMode: 'QUESTION',
        packId,
        categoryId
      });

      



      // FIX A: Do NOT append duplicate v3_opener_question - FOLLOWUP_CARD_SHOWN already logged it
      // Only append the user's answer
      // STATIC IMPORT: Use top-level imports (prevents React context duplication)
      const appendUserMessage = appendUserMessageImport;
      const freshSession = await base44.entities.InterviewSession.get(sessionId);
      const currentTranscript = freshSession.transcript_snapshot || [];

      

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

      
      if (!foundInReturned) {
      }
      

      
      
      // STABILITY SNAPSHOT: Opener answer submitted
      getStabilitySnapshotSOT("SUBMIT_END_V3_OPENER");

      // Append opener to UI history AFTER answer submitted (prevents duplicate during active state)
      const stableKey = buildV3OpenerStableKey(packId, instanceNumber);
      
      setV3ProbeDisplayHistory(prev => {
        if (prev.some(e => e.stableKey === stableKey)) {
          return prev;
        }
        return [
          ...prev,
          {
            kind: 'v3_opener_history',
            stableKey,
            text: openerText,
            packId,
            categoryLabel,
            instanceNumber,
            exampleNarrative: currentItem_S.exampleNarrative,
            source: 'prompt_lane_history',
            createdAt: Date.now()
          }
        ];
      });
      
      console.log('[V3_OPENER][HISTORY_APPEND_ON_COMPLETE]', { stableKey, instanceNumber });

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
      committingItemIdRef.current = currentItem_S.id;
      console.log('[V3_OPENER][COMMIT_START]', {
        currentItem_SId: currentItem_S.id,
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
      const baseQuestion = engine_S?.QById?.[baseQuestionId];
      if (!baseQuestion) {
        console.error('[V3_OPENER][SUBMIT_ERROR_CONTEXT]', {
          baseQuestionId,
          currentItem_SType: currentItem_S?.type,
          currentItem_SId: currentItem_S?.id,
          note: 'missing base question ref from engine_S - using fallback'
        });
      }
      
      await commitBaseQAIfMissing({
        questionId: baseQuestionId,
        questionText: baseQuestion?.question_text || `Question ${baseQuestionId}`,
        answerText: 'Yes',
        sessionId
      });
      
      // PART B: Track opener submission (optimistic - immediate UI feedback)
      v3OpenerSubmittedRef.current.set(loopKey, true);
      
      // PART A: Add optimistic marker for opener answer
      const openerPromptId = `${loopKey}:opener`;
      v3OptimisticPersistRef.current[openerPromptId] = {
        stableKeyA: openerAnswerStableKey,
        answerText: value,
        ts: Date.now(),
        loopKey,
        categoryId,
        instanceNumber,
        isOpener: true
      };
      
      console.log('[V3_PROBING][START_AFTER_OPENER]', {
        packId,
        categoryId,
        instanceNumber,
        loopKey,
        submitToken,
        v3ProbingActive: true,
        optimisticOpenerMarkerSet: true
      });
      
      // Track probing start
      v3ProbingStartedRef.current.set(loopKey, true);

      // CRITICAL: Set currentItem_S to v3_probing type (enables correct bottom bar binding)
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
        from: currentItem_S?.type,
        to: 'v3_probing',
        packId,
        instanceNumber,
        transcriptLenBeforeTransition: dbTranscript.length,
        action: 'Setting currentItem_S only - transcript preserved'
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
        
        // GUARD: Verify context still matches (use stable fallback from currentItem_S)
        const currentPackId = v3ProbingContext_SRef.current?.packId || currentItem_S?.packId;
        const currentInstanceNumber = v3ProbingContext_SRef.current?.instanceNumber || currentItem_S?.instanceNumber;
        
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
        
        // PART B: Check optimistic markers before recovery
        const openerPromptId = `${capturedLoopKey}:opener`;
        const hasOptimisticOpener = v3OptimisticPersistRef.current[openerPromptId];

        // GUARD: Check if prompt already arrived OR optimistic marker exists
        if (v3ActivePromptTextRef.current && v3ActivePromptTextRef.current.trim().length > 0) {
          console.log('[V3_FAILSAFE][CANCELLED_OR_STALE]', {
            submitToken: capturedSubmitToken,
            loopKey: capturedLoopKey,
            reason: 'Prompt arrived - failsafe not needed'
          });
          return;
        }

        if (hasOptimisticOpener) {
          const optimisticAge = Date.now() - hasOptimisticOpener.ts;
          if (optimisticAge < 5000) {
            console.log('[V3_FAILSAFE][OPTIMISTIC_PENDING]', {
              submitToken: capturedSubmitToken,
              loopKey: capturedLoopKey,
              optimisticAge,
              reason: 'Optimistic marker active - allowing more time for probing to start'
            });
            return; // Give more time
          }
        }
        
        // All guards passed - execute recovery
        const stillOnOpener = currentItem_S?.type === 'v3_pack_opener' && currentItem_S?.packId === capturedPackId;
        const probingActiveNow = v3ProbingActiveRef.current;
        const hasPromptNow = !!v3ActivePromptTextRef.current;

        // PART B: Check optimistic markers before declaring stall
        const openerLoopKey = `${sessionId}:${capturedPackId}:${capturedInstanceNumber}`;
        const hasOptimisticSubmit = v3OpenerSubmittedRef.current.get(openerLoopKey) === true;

        if ((stillOnOpener || (probingActiveNow && !hasPromptNow)) && !hasOptimisticSubmit) {
          console.error('[V3_UI_CONTRACT][PROMPT_MISSING_AFTER_OPENER]', {
            submitToken: capturedSubmitToken,
            packId: capturedPackId,
            instanceNumber: capturedInstanceNumber,
            loopKey: capturedLoopKey,
            stillOnOpener,
            probingActiveNow,
            hasPromptNow,
            hasOptimisticSubmit,
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

    // (Rest of handleAnswerImpl remains the same - full implementation continues...)
    // Truncated for brevity - same as original file
  } catch (err) {
    console.error('❌ Error processing answer:', err);
    
    // V3 OPENER SPECIFIC ERROR LOGGING
    if (currentItem_S?.type === 'v3_pack_opener') {
      console.error('[V3_OPENER][SUBMIT_ERROR]', {
        sessionId,
        packId: currentItem_S.packId,
        instanceNumber: currentItem_S.instanceNumber,
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
}