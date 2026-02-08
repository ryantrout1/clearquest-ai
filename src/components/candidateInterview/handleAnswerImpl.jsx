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

    // ========================================================================
    // REGULAR QUESTION HANDLER
    // ========================================================================
    if (currentItem_S.type === 'question') {
      const question = engine_S.QById[currentItem_S.id];
      if (!question) {
        throw new Error(`Question ${currentItem_S.id} not found`);
      }

      const sectionEntity = engine_S.Sections.find(s => s.id === question.section_id);
      const sectionName = sectionEntity?.section_name || question.category || '';
      const questionNumber = getQuestionDisplayNumber(currentItem_S.id);

      // Save answer first to get Response ID
      const savedResponse = await saveAnswerToDatabase(currentItem_S.id, value, question);

      // Normalize answer display text (Yes/No for boolean, raw text otherwise)
      const answerDisplayText = question.response_type === 'yes_no'
        ? (value.trim().toLowerCase() === 'yes' ? 'Yes' : value.trim().toLowerCase() === 'no' ? 'No' : value)
        : value;

      // Append user answer to session transcript (single source of truth)
      // STATIC IMPORT: Use top-level imports (prevents React context duplication)
      const appendUserMessage = appendUserMessageImport;
      const sessionForAnswer = await base44.entities.InterviewSession.get(sessionId);
      const questionStableKey = `question-shown:${currentItem_S.id}`;
      
      // DETERMINISTIC STABLEKEY: Base question answers use canonical format
      const baseAnswerStableKey = `answer:${sessionId}:${currentItem_S.id}:0`;
      
      console.log('[BASE_YESNO][STABLEKEY_OVERRIDE]', {
        questionId: currentItem_S.id,
        aStableKey: baseAnswerStableKey,
        clicked: answerDisplayText
      });
      
      console.log('[BASE_YESNO][ANSWER_APPEND_SOT]', {
        questionId: currentItem_S.id,
        stableKey: baseAnswerStableKey,
        anchorKey: questionStableKey,
        hasQuestionId: true,
        reason: 'Base YES/NO answer appended with full metadata at creation'
      });
      
      await appendUserMessage(sessionId, sessionForAnswer.transcript_snapshot || [], answerDisplayText, {
        stableKey: baseAnswerStableKey,
        messageType: 'ANSWER',
        questionDbId: currentItem_S.id,
        questionId: currentItem_S.id,
        questionCode: question.question_id,
        responseId: savedResponse?.id,
        sectionId: question.section_id,
        answerDisplayText,
        answerContext: 'BASE_QUESTION',
        parentStableKey: questionStableKey,
        afterStableKey: questionStableKey
      });
      
      // CQ_TRANSCRIPT_CONTRACT: Invariant check after base answer append
      if (ENFORCE_TRANSCRIPT_CONTRACT) {
        const freshCheck = await base44.entities.InterviewSession.get(sessionId);
        const expectedAKey = `answer:${sessionId}:${currentItem_S.id}`;
        const found = (freshCheck.transcript_snapshot || []).some(e => 
          (e.stableKey && e.stableKey.includes(currentItem_S.id)) ||
          (e.messageType === 'ANSWER' && e.meta?.questionDbId === currentItem_S.id)
        );
        
        if (!found) {
          console.error('[CQ_TRANSCRIPT][VIOLATION]', {
            messageType: 'ANSWER',
            questionId: currentItem_S.id,
            transcriptLen: (freshCheck.transcript_snapshot || []).length,
            reason: 'Base answer not found in transcript after append',
            stack: new Error().stack?.split('\n').slice(1, 4).join(' | ')
          });
        }
      }

      // Log answer submitted (audit only)
      await logAnswerSubmitted(sessionId, {
        questionDbId: currentItem_S.id,
        responseId: savedResponse?.id,
        packId: null
      });
      
      // STABILITY SNAPSHOT: Base answer submitted
      getStabilitySnapshotSOT("SUBMIT_END_BASE");
      
      // Reload session transcript into local state (single source of truth)
      const newTranscript = await refreshTranscriptFromDB('base_question_answered');

      // UX: Clear draft on successful submit
      clearDraft();

      // SECTION GATE LOGIC: Check if this is a gate question with "No" answer
      // This must run BEFORE follow-up trigger check to properly skip remaining section questions
      
      // GUARD: Ensure newTranscript is always an array (should not trigger after return contract fix)
      const normalizedTranscript = Array.isArray(newTranscript) ? newTranscript : [];
      if (!Array.isArray(newTranscript)) {
        console.error('[ANSWER_PROCESSING][GUARD] newTranscript was not an array, normalized to []', {
          currentItem_SType: currentItem_S?.type,
          currentItem_SId: currentItem_S?.id,
          questionCode: question?.question_id,
          value: newTranscript,
          returnedBy: 'refreshTranscriptFromDB',
          reason: 'base_question_answered',
          stack: new Error().stack?.split('\n').slice(1, 3).join(' | ')
        });
      }
      
      const gateResult = await applySectionGateIfNeeded({
        sessionId,
        currentQuestion: question,
        answer: value,
        engine_S,
        currentSectionIndex,
        sections,
        answeredQuestionIds: new Set(normalizedTranscript.filter(t => t.type === 'question').map(t => t.questionId))
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
        const totalQuestionsCount = engine_S?.TotalQuestions || 0;
        
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
        const followUpResult = checkFollowUpTrigger(engine_S, currentItem_S.id, value, interviewMode);

        if (followUpResult) {
        const { packId, substanceName, isV3Pack } = followUpResult;

        console.log(`[FOLLOWUP-TRIGGER] Pack triggered: ${packId}, checking versions...`);

        // IDEMPOTENCY RELEASE: Base question routed to V3 pack - release lock
        const baseQuestionKey = `q:${currentItem_S.id}`;
        if (submittedKeysRef.current.has(baseQuestionKey)) {
          submittedKeysRef.current.delete(baseQuestionKey);
          const questionCode = question?.question_id || currentItem_S.id;
          console.log('[IDEMPOTENCY][RELEASE]', { 
            lockKey: baseQuestionKey, 
            packId,
            questionCode,
            reason: `${questionCode}_ROUTED_TO_V3_PACK` 
          });
        }

        // Check pack config flags to determine V3 vs V2
        const packConfig = FOLLOWUP_PACK_CONFIGS[packId];
        const isV3PackExplicit = packConfig?.isV3Pack === true;
        const isV2PackExplicit = packConfig?.isV2Pack === true;
        const usesPerFieldProbing = __cqUsesPerFieldProbing;

          // V3 takes precedence over V2 - explicit V3 flag wins
          let isV3PackFinal = isV3PackExplicit || (isV3Pack && !isV2PackExplicit);
          let isV2PackFinal = !isV3PackFinal && (isV2PackExplicit || usesPerFieldProbing);
          
          // HARD GUARD: Force V3 for PACK_INTEGRITY_APPS (MVP requirement)
          if (packId === 'PACK_INTEGRITY_APPS' && !isV3PackFinal) {
            console.error('[V3_PACK][FORCE_V3]', {
              packId,
              wasV3: isV3PackFinal,
              wasV2: isV2PackFinal,
              reason: 'PACK_INTEGRITY_APPS must route to V3 for MVP',
              action: 'forcing isV3PackFinal=true'
            });
            isV3PackFinal = true;
            isV2PackFinal = false;
          }

          console.log(`[FOLLOWUP-TRIGGER] ${packId} isV3Pack=${isV3PackFinal} isV2Pack=${isV2PackFinal}`);
          
          // ROUTING LOG: Show which path will be taken
          const routePath = isV3PackFinal ? 'V3' : isV2PackFinal ? 'V2' : 'NONE';
          console.log('[V3_PACK][ROUTE]', {
            packId,
            isV2Pack: isV2PackFinal,
            isV3Pack: isV3PackFinal,
            ideVersion: packConfig?.engine_SVersion || 'unknown',
            reason: isV3PackExplicit ? 'isV3Pack=true' : isV2PackExplicit ? 'isV2Pack=true' : packId === 'PACK_INTEGRITY_APPS' ? 'forced_v3_guard' : 'heuristic',
            route: routePath
          });

          // === V3 PACK HANDLING: Two-layer flow (Deterministic Opener → AI Probing) ===
          if (isV3PackFinal) {
            console.log(`[V3_PACK][ENTER] ========== ENTERING V3 PACK MODE ==========`);
            
            // Get category for V3 probing
            const categoryId = mapPackIdToCategory(packId);
            
            console.log(`[V3_PACK][ENTER]`, {
              packId,
              categoryId,
              baseQuestionId: currentItem_S.id,
              questionCode: question.question_id,
              ideVersion: packConfig?.engine_SVersion || 'v3'
            });

            if (!categoryId) {
              console.error("[V3_PACK][NO_CATEGORY_MAPPING]", { 
                packId,
                reason: 'No categoryId mapping found - cannot route to V3',
                action: 'advancing to next question'
              });
              saveAnswerToDatabase(currentItem_S.id, value, question);
              advanceToNextBaseQuestion(currentItem_S.id);
              setIsCommitting(false);
              setInput("");
              return;
            }
            
            // V3 ROUTING GUARD: Hard-enforce V3 for PACK_INTEGRITY_APPS
            if (packId === 'PACK_INTEGRITY_APPS' && !isV3PackFinal) {
              console.error('[V3_PACK][ROUTING_ERROR]', {
                packId,
                isV3PackFinal,
                expectedRoute: 'V3',
                actualRoute: isV2PackFinal ? 'V2' : 'NONE',
                action: 'forcing V3 route'
              });
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
            // STATIC IMPORT: Use top-level import (already imported at line 61)
            const opener = getV3DeterministicOpener(packMetadata, categoryId, categoryLabel);

            if (opener.isSynthesized) {
              console.warn(`[V3_PACK][MISSING_OPENER] Pack ${packId} missing configured opener - synthesized fallback used`);
            }

            // Log pack entered (audit only)
            await logPackEntered(sessionId, { packId, instanceNumber: 1, isV3: true });

            // Save base question answer
            saveAnswerToDatabase(currentItem_S.id, value, question);

            // STEP 1: Show deterministic opener (non-AI)
            const openerItemId = `v3-opener-${packId}-1`;
            const openerItem = {
              id: openerItemId,
              type: 'v3_pack_opener',
              packId,
              categoryId,
              categoryLabel,
              openerText: opener.text,
              exampleNarrative: opener.example,
              baseQuestionId: currentItem_S.id,
              questionCode: question.question_id,
              sectionId: question.section_id,
              instanceNumber: 1,
              packData: packMetadata
            };

            console.log('[V3_PACK][ENTER_STATE_SET]', {
              packId,
              instanceNumber: 1,
              currentItem_SType: 'v3_pack_opener',
              currentItem_SId: openerItemId,
              openerTextPreview: opener.text?.substring(0, 60)
            });

            setCurrentItem(openerItem);
            setQueue([]);

            await refreshTranscriptFromDB('v3_opener_set');
            await persistStateToDatabase(null, [], openerItem);

            // PACK ENTRY FAILSAFE: Arm ONLY if opener not yet active
            // Generate token for this pack entry attempt
            const packEntryLoopKey = `${sessionId}:${categoryId}:1`;
            const packEntryToken = `${packEntryLoopKey}:${Date.now()}`;
            
            // Clear any existing pack entry timer
            if (v3PackEntryFailsafeTimerRef.current) {
              clearTimeout(v3PackEntryFailsafeTimerRef.current);
              v3PackEntryFailsafeTimerRef.current = null;
            }
            
            // Store context for validation
            v3PackEntryContextRef.current = { packId, instanceNumber: 1, categoryId };
            v3PackEntryFailsafeTokenRef.current = packEntryToken;
            
            console.log('[V3_PACK][ENTRY_FAILSAFE_ARMED]', {
              packId,
              instanceNumber: 1,
              packEntryToken,
              packEntryLoopKey
            });

            // FAIL-SAFE: Detect dead-end after state transition (V3 pack entry)
            v3PackEntryFailsafeTimerRef.current = setTimeout(async () => {
              // TOKEN GUARD: Validate this timer is still current
              if (v3PackEntryFailsafeTokenRef.current !== packEntryToken) {
                console.log('[V3_PACK][ENTRY_FAILSAFE_STALE]', {
                  packId,
                  instanceNumber: 1,
                  capturedToken: packEntryToken,
                  currentToken: v3PackEntryFailsafeTokenRef.current,
                  reason: 'Token mismatch - newer entry occurred'
                });
                return;
              }
              
              // CONTEXT GUARD: Validate pack/instance still matches
              const currentContext = v3PackEntryContextRef.current;
              if (!currentContext || currentContext.packId !== packId || currentContext.instanceNumber !== 1) {
                console.log('[V3_PACK][ENTRY_FAILSAFE_STALE]', {
                  packId,
                  instanceNumber: 1,
                  reason: 'Context changed - different pack'
                });
                return;
              }
              try {
                const freshSession = await base44.entities.InterviewSession.get(sessionId);
                const currentSnapshot = freshSession.current_item_snapshot;
                
                // TIGHTENED: Only treat as stuck if opener truly not present
                const hasOpenerState = currentSnapshot?.type === 'v3_pack_opener' && 
                                      currentSnapshot?.openerText && 
                                      currentSnapshot?.packId === packId;
                const isProbingActive = currentSnapshot?.type === 'v3_probing' && 
                                       currentSnapshot?.packId === packId;
                
                if (hasOpenerState || isProbingActive) {
                  console.log('[V3_PACK][FAILSAFE_SKIP]', {
                    packId,
                    instanceNumber: 1,
                    currentSnapshotType: currentSnapshot?.type,
                    reason: 'Opener already active or probing started'
                  });
                  return;
                }
                
                // Check if we're still stuck on the base question or no current item
                const isStuck = !currentSnapshot || 
                                (currentSnapshot.type === 'question' && currentSnapshot.id === currentItem_S.id) ||
                                (currentSnapshot.type !== 'v3_pack_opener' && currentSnapshot.type !== 'v3_probing');
                
                if (isStuck) {
                  console.error('[V3_PACK][FAILSAFE_REAPPLY]', {
                    packId,
                    instanceNumber: 1,
                    currentSnapshotType: currentSnapshot?.type,
                    expectedType: 'v3_pack_opener',
                    action: 'Reapplying opener state'
                  });
                  
                  // Reapply opener state
                  setCurrentItem(openerItem);
                  await persistStateToDatabase(null, [], openerItem);
                  
                  // If still stuck after reapply, route deterministically (NEVER auto-advance for V3)
                  setTimeout(async () => {
                    const checkSession = await base44.entities.InterviewSession.get(sessionId);
                    const checkSnapshot = checkSession.current_item_snapshot;
                    
                    if (!checkSnapshot || checkSnapshot.type === 'question') {
                      // GUARD: V3 packs MUST NOT auto-advance to next base question
                      console.error('[V3_PACK][FAILSAFE_ADVANCE_BLOCKED]', {
                        packId,
                        instanceNumber: 1,
                        fromQuestionId: currentItem_S.id,
                        reason: 'V3 pack must not auto-advance - routing deterministically instead'
                      });
                      
                      // UI CONTRACT GUARD: Never route to gate before opener submit/probing start
                      const openerLoopKey = `${sessionId}:${categoryId}:1`;
                      const openerSubmitted = v3OpenerSubmittedRef.current.get(openerLoopKey) === true;
                      const probingStarted = v3ProbingStartedRef.current.get(openerLoopKey) === true;
                      
                      if (!openerSubmitted && !probingStarted) {
                        console.error('[V3_UI_CONTRACT][ENTRY_FAILSAFE_BLOCKED]', {
                          packId,
                          instanceNumber: 1,
                          openerSubmitted,
                          probingStarted,
                          reason: 'UI_CONTRACT_NO_GATE_BEFORE_OPENER_SUBMIT',
                          action: 'Reapplying opener state only - no gate'
                        });
                        
                        // Reapply opener state one more time and stop
                        setCurrentItem(openerItem);
                        await persistStateToDatabase(null, [], openerItem);
                        return;
                      }
                      
                      // Deterministic recovery based on pack type
                      const isMultiIncident = packMetadata?.behavior_type === 'multi_incident' || 
                                             packMetadata?.followup_multi_instance === true;
                      
                      if (isMultiIncident) {
                        console.log('[V3_UI_CONTRACT][RECOVERY_TO_ANOTHER_INSTANCE]', {
                          packId,
                          instanceNumber: 1,
                          reason: 'PACK_ENTRY_INCONSISTENT',
                          openerSubmitted,
                          probingStarted
                        });
                        
                        // Route to multi-instance gate
                        transitionToAnotherInstanceGate({
                          packId,
                          categoryId,
                          categoryLabel,
                          instanceNumber: 1,
                          packData: packMetadata
                        });
                      } else {
                        console.log('[EXIT_V3][ONCE]', {
                          reason: 'PACK_ENTRY_INCONSISTENT',
                          packId,
                          instanceNumber: 1
                        });
                        
                        // Exit V3 cleanly
                        exitV3Once('PACK_ENTRY_INCONSISTENT', {
                          incidentId: null,
                          categoryId,
                          completionReason: 'STOP',
                          messages: [],
                          reason: 'PACK_ENTRY_INCONSISTENT',
                          shouldOfferAnotherInstance: false,
                          packId,
                          categoryLabel,
                          instanceNumber: 1,
                          packData: packMetadata
                        });
                      }
                    }
                  }, 500);
                }
              } catch (err) {
                console.error('[V3_PACK][FAILSAFE_ERROR]', err.message);
              }
            }, 200);

            setIsCommitting(false);
            setInput("");
            return;
          }

          // === V2 PACK HANDLING: Enter V2_PACK mode ===
          if (isV2PackFinal) {
            // SCHEMA RESOLUTION: Use centralized resolver (DB-first for standard clusters)
            const staticConfig = FOLLOWUP_PACK_CONFIGS[packId];
            const dbPackMeta = engine_S?.v2PacksById?.[packId]?.meta || null;
            
            const { schemaSource, fields, packConfig } = resolvePackSchema(dbPackMeta, staticConfig);
            
            // VALIDATION: Warn if schema source doesn't match intent
            if (dbPackMeta && staticConfig) {
              validateSchemaSource(packId, schemaSource, dbPackMeta, staticConfig);
            }

            if (!packConfig || !Array.isArray(fields) || fields.length === 0) {
              console.error("[V2_PACK][BLOCKED]", {
                packId,
                reason: 'Missing or invalid pack schema',
                schemaSource,
                hasConfig: !!packConfig,
                hasFields: Array.isArray(fields),
                fieldsCount: fields.length
              });
              // Fallback: advance to next question
              saveAnswerToDatabase(currentItem_S.id, value, question);
              advanceToNextBaseQuestion(currentItem_S.id);
              setIsCommitting(false);
              setInput("");
              return;
            }
            
            console.log('[V2_PACK][ENTER]', {
              packId,
              baseQuestionId: currentItem_S.id,
              questionCode: question.question_id,
              schemaSource,
              fieldsCount: fields.length
            });

            // Build ordered list of fields in this V2 pack (from resolved schema)
            // Normalize field accessors for DB vs static formats
            const orderedFields = fields
              .filter(f => (f.fieldKey || f.id) && (f.label || f.question_text))
              .sort((a, b) => (a.factsOrder || a.order || 0) - (b.factsOrder || b.order || 0))
              .map(f => ({
                // Normalize field structure for unified access
                fieldKey: f.fieldKey || f.id,
                label: f.label || f.question_text,
                semanticType: f.semanticType || f.semanticKey,
                inputType: f.inputType || 'long_text',
                required: f.required || false,
                aiProbeHint: f.aiProbeHint || null,
                choices: f.choices || f.options || [],
                helperText: f.helperText || f.placeholder,
                exampleValue: f.exampleValue || null,
                order: f.order || f.factsOrder || 0,
                // Keep raw for backend pass-through
                raw: f
              }));
            
            // Store schema source in pack state for backend calls
            const packState = {
              schemaSource,
              dbPackMeta
            };

            // EXPLICIT LOGGING: Entering V2 pack mode
            console.log(`[V2_PACK][ENTER] ========== ENTERING V2 PACK MODE ==========`);
            console.log(`[V2_PACK][ENTER] pack=${packId} firstField=${orderedFields[0].fieldKey}`);
            console.log(`[V2_PACK][ENTER] totalFields=${orderedFields.length}, fields=[${orderedFields.map(f => f.fieldKey).join(', ')}]`);
            console.log(`[V2_PACK][ENTER] triggeredByQuestion=${currentItem_S.id} (${question.question_id}), instanceNumber=1`);
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
            const baseResponse = await saveAnswerToDatabase(currentItem_S.id, value, question);

            // Set up V2 pack mode
            setActiveV2Pack({
              packId,
              fields: orderedFields,
              currentIndex: 0,
              baseQuestionId: currentItem_S.id,
              instanceNumber: 1,
              substanceName: substanceName,
              collectedAnswers: {},
              schemaSource: packState.schemaSource,
              dbPackMeta: packState.dbPackMeta
            });
            setV2PackTriggerQuestionId(currentItem_S.id);
            setV2PackMode("V2_PACK");
            setCurrentFollowUpAnswers({});

            // For V2 standard cluster packs: Make initial backend call to get AI opening
            // This allows the AI to acknowledge the "yes" and set context before asking fields
            console.log(`[V2_PACK][CLUSTER_INIT] Making initial backend call for pack opening...`);

            const firstField = orderedFields[0];

            // Compute effective opening strategy from pack meta (read from engine_S state)
            const packMeta = engine_S?.v2PacksById?.[packId]?.meta || null;

            if (!packMeta) {
              console.warn(`[V2_PACK][CLUSTER_INIT] No V2 pack meta found for packId ${packId}`, {
                availablePackIds: Object.keys(engine_S?.v2PacksById || {})
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
              baseQuestionId: currentItem_S.id,
              aiProbingEnabled,
              aiProbingDisabledForSession,
              maxAiFollowups: getPackMaxAiFollowups(packId),
              instanceNumber: 1,
              setBackendQuestionTextMap, // STEP 1: Pass setter
              schemaSource: packState.schemaSource,
              resolvedField: firstField.raw
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

              // Immediately set currentItem_S to v2_pack_field to show the pack question
              const firstPackItem = {
                id: `v2pack-${packId}-0`,
                type: 'v2_pack_field',
                packId: packId,
                fieldIndex: 0,
                fieldKey: firstField.fieldKey,
                fieldConfig: firstField,
                baseQuestionId: currentItem_S.id,
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
              // STATIC IMPORT: Use top-level import
              const sessionForV2Opening = await base44.entities.InterviewSession.get(sessionId);
              const currentTranscriptForV2 = sessionForV2Opening.transcript_snapshot || [];
              await appendAssistantMessageImport(sessionId, currentTranscriptForV2, initialCallResult.question, {
                messageType: 'v2_pack_opening',
                packId,
                fieldKey: firstField.fieldKey,
                instanceNumber: 1,
                baseQuestionId: currentItem_S.id,
                visibleToCandidate: true
              });
              await refreshTranscriptFromDB('v2_cluster_opening_shown');

              // Set up AI probe state - this makes the UI show the AI question and wait for answer
              setIsWaitingForAgent(true);
              setIsInvokeLLMMode(true);
              setCurrentFieldProbe({
                packId,
                instanceNumber: 1,
                fieldKey: firstField.fieldKey,
                baseQuestionId: currentItem_S.id,
                substanceName: substanceName,
                currentItem_S: {
                  id: `v2pack-${packId}-0`,
                  type: 'v2_pack_field',
                  packId,
                  fieldIndex: 0
                },
                question: initialCallResult.question,
                isV2PackMode: true,
                isClusterOpening: true
              });

              // Keep currentItem_S as the first field - but it won't be shown until after AI probe
              // STEP 2: Include backend question text for first field
              const backendQuestionTextForFirst = getBackendQuestionText(backendQuestionTextMap, packId, firstField.fieldKey, 1);

              setCurrentItem({
                id: `v2pack-${packId}-0`,
                type: 'v2_pack_field',
                packId: packId,
                fieldIndex: 0,
                fieldKey: firstField.fieldKey,
                fieldConfig: firstField,
                baseQuestionId: currentItem_S.id,
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
              // STEP 2: Include backend question text in currentItem_S
              const backendQuestionText = getBackendQuestionText(backendQuestionTextMap, packId, firstField.fieldKey, 1);

              setCurrentItem({
                id: `v2pack-${packId}-0`,
                type: 'v2_pack_field',
                packId: packId,
                fieldIndex: 0,
                fieldKey: firstField.fieldKey,
                fieldConfig: firstField,
                baseQuestionId: currentItem_S.id,
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
                  saveAnswerToDatabase(currentItem_S.id, value, question);

                  // Enter V3 probing mode
                  setV3ProbingActive(true);
                  setV3ProbingContext({
                    packId,
                    categoryId,
                    baseQuestionId: currentItem_S.id,
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
                    baseQuestionId: currentItem_S.id
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
            saveAnswerToDatabase(currentItem_S.id, value, question);
            advanceToNextBaseQuestion(currentItem_S.id);
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
                    questionId: currentItem_S.id,
                    questionCode: question.question_id,
                    sectionId: question.section_id
                  }
                });

                if (ideResult.continue && ideResult.nextQuestion) {
                  setCurrentIncidentId(ideResult.incidentId);
                  setCurrentIdeCategoryId(categoryId);
                  setCurrentIdeQuestion(ideResult.nextQuestion);
                  setInIdeProbingLoop(true);

                  await persistStateToDatabase(newTranscript, [], currentItem_S);
                  setIsCommitting(false);
                  setInput("");
                  return;
                } else if (ideResult.reason === "FACT_MODEL_NOT_READY" && interviewMode === "HYBRID") {
                  // Continue to deterministic
                } else {
                  advanceToNextBaseQuestion(currentItem_S.id);
                  setIsCommitting(false);
                  setInput("");
                  saveAnswerToDatabase(currentItem_S.id, value, question);
                  return;
                }
              } catch (ideError) {
                console.error("[IDE] Error calling decision engine_S", ideError);

                if (interviewMode === "HYBRID") {
                  // Continue to deterministic
                } else {
                  advanceToNextBaseQuestion(currentItem_S.id);
                  setIsCommitting(false);
                  setInput("");
                  saveAnswerToDatabase(currentItem_S.id, value, question);
                  return;
                }
              }
            } else if (ideEnabled && interviewMode === "HYBRID") {
              // Continue to deterministic
            }
          }

          const triggerKey = `${currentItem_S.id}:${packId}`;
          if (triggeredPacksRef.current.has(triggerKey)) {
            const nextQuestionId = computeNextQuestionId(engine_S, currentItem_S.id, value);
            if (nextQuestionId && engine_S.QById[nextQuestionId]) {
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
            saveAnswerToDatabase(currentItem_S.id, value, question);
            return;
          }

          triggeredPacksRef.current.add(triggerKey);

          const packSteps = injectSubstanceIntoPackSteps(engine_S, packId, substanceName);

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
                baseQuestionId: currentItem_S.id
              });
            }

            const firstItem = followupQueue[0];
            const remainingQueue = followupQueue.slice(1);

            setQueue(remainingQueue);
            setCurrentItem(firstItem);

            await persistStateToDatabase(null, remainingQueue, firstItem);
          } else {
            const nextQuestionId = computeNextQuestionId(engine_S, currentItem_S.id, value);
            if (nextQuestionId && engine_S.QById[nextQuestionId]) {
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
          advanceToNextBaseQuestion(currentItem_S.id, freshAfterCheck);
        }
      } else {
        const freshAfterNoFollowup = await refreshTranscriptFromDB('no_followup_advance');
        advanceToNextBaseQuestion(currentItem_S.id, freshAfterNoFollowup);
      }

      // Note: saveAnswerToDatabase already called above before setting newTranscript

    } else if (currentItem_S.type === 'followup') {
      const { packId, stepIndex, substanceName, baseQuestionId } = currentItem_S;

      const packSteps = injectSubstanceIntoPackSteps(engine_S, packId, substanceName);

      if (!packSteps || !packSteps[stepIndex]) {
        throw new Error(`Follow-up pack ${packId} step ${stepIndex} not found`);
      }
      const step = packSteps[stepIndex];

      const instanceNumber = currentItem_S.instanceNumber || 1;
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
          const nextPackSteps = injectSubstanceIntoPackSteps(engine_S, nextItem.packId, nextItem.substanceName);
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
        await saveFollowUpAnswer(packId, step.Field_Key, step.PrefilledAnswer, substanceName, currentItem_S.instanceNumber || 1);

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
      const isV2Pack = __cqUsesPerFieldProbing;

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
        const question = engine_S.QById[baseQuestionId];

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
          setBackendQuestionTextMap, // STEP 1: Pass setter for legacy followup path
          schemaSource: null, // Legacy followups use static schema
          resolvedField: null
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
            questionId: currentItem_S.id,
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
            currentItem_S,
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
        questionId: currentItem_S.id,
        questionText: step.Prompt,
        packId: packId,
        substanceName: substanceName,
        kind: 'deterministic_followup',
        text: step.Prompt,
        content: step.Prompt,
        fieldKey: step.Field_Key,
        followupPackId: packId,
        instanceNumber: instanceNumber,
        baseQuestionId: currentItem_S.baseQuestionId
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
        const nextPackSteps = injectSubstanceIntoPackSteps(engine_S, nextItem.packId, nextItem.substanceName);
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
            engine_S.QById[t.questionId]?.followup_pack === packId &&
            t.answer === 'Yes'
          );

          if (triggeringQuestion) {
            const nextQuestionId = computeNextQuestionId(engine_S, triggeringQuestion.questionId, 'Yes');

            setCurrentFollowUpAnswers({});

            if (nextQuestionId && engine_S.QById[nextQuestionId]) {
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
          onFollowupPackComplete(currentItem_S.baseQuestionId, packId);
        }
      } else {
        setQueue(updatedQueue);
        setCurrentItem(nextItem);

        await persistStateToDatabase(newTranscript, updatedQueue, nextItem);
      }
    } else if (currentItem_S.type === 'multi_instance_gate') {
      // MI_GATE TRACE 3: Handler entry audit
      console.log('[MI_GATE][TRACE][HANDLER_ENTER]', {
        currentItem_SId: currentItem_S.id,
        packId: currentItem_S.packId,
        instanceNumber: currentItem_S.instanceNumber,
        answer: value,
        source: 'handleAnswer'
      });
      
      // PART C: Multi-instance gate handler - append Q+A after user answers
      const normalized = value.trim().toLowerCase();
      if (normalized !== 'yes' && normalized !== 'no') {
        setValidationHint('Please answer "Yes" or "No".');
        setIsCommitting(false);
        return;
      }

      const answer = normalized === 'yes' ? 'Yes' : 'No';
      const gate = multiInstanceGate || currentItem_S;

      // GUARD: Validate gate context
      if (!gate || !gate.packId || !gate.instanceNumber) {
        console.error('[FORENSIC][GATE_HANDLER_MISSING_CONTEXT]', {
          hasGate: !!gate,
          packId: gate?.packId,
          instanceNumber: gate?.instanceNumber
        });
        setIsCommitting(false);
        return;
      }

      // FIX F: Check if gate already answered (prevent re-ask)
      const session = await base44.entities.InterviewSession.get(sessionId);
      const existingTranscript = session.transcript_snapshot || [];
      const gateAnswerKey = `mi-gate:${gate.packId}:${gate.instanceNumber}:a`;
      const alreadyAnswered = existingTranscript.some(e => e.stableKey === gateAnswerKey);

      if (alreadyAnswered) {
        console.warn('[MI_GATE][ALREADY_ANSWERED]', {
          packId: gate.packId,
          instanceNumber: gate.instanceNumber,
          stableKey: gateAnswerKey,
          reason: 'Gate already answered - blocking duplicate submission'
        });
        setIsCommitting(false);
        return;
      }

      // Forensic log: MI_GATE submission
      const nextInstanceNumber = answer === 'Yes' ? (gate.instanceNumber || 1) + 1 : null;
      const nextStableKey = answer === 'Yes' ? `v3-opener-${gate.packId}-${nextInstanceNumber}` : null;

      console.log('[MI_GATE][ANSWER]', {
        packId: gate.packId,
        instanceNumber: gate.instanceNumber,
        answerYesNo: answer,
        activeUiItem_SKind: activeUiItem_S_SAFE?.kind,
        currentItem_SId: currentItem_S?.id,
        stableKey: `mi-gate:${gate.packId}:${gate.instanceNumber}`
      });

      console.log('[MULTI_INSTANCE_GATE][ANSWER]', {
        packId: gate.packId,
        instanceNumber: gate.instanceNumber,
        answer,
        action: answer === 'Yes' ? 'starting next instance' : 'advancing to next question'
      });

      // Extract shared MI_GATE handler logic
      await handleMiGateYesNo({ answer, gate, sessionId, engine_S });

      setIsCommitting(false);
      setInput("");
      return;
    } else if (currentItem_S.type === 'multi_instance') {

      const { questionId, packId, instanceNumber } = currentItem_S;

      const normalized = value.trim().toLowerCase();
      if (normalized !== 'yes' && normalized !== 'no') {
        setValidationHint('Please answer "Yes" or "No".');
        setIsCommitting(false);
        return;
      }

      const answer = normalized === 'yes' ? 'Yes' : 'No';

      const question = engine_S.QById[questionId];

      console.log('[PRIOR_LE_APPS][MULTI_INSTANCE]', {
        questionId,
        packId,
        instanceNumber,
        answer,
        action: answer === 'Yes' ? `starting instance #${instanceNumber + 1}` : 'moving to next question'
      });

      // Append multi-instance answer via canonical helper
      // STATIC IMPORT: Use top-level import (already aliased as appendUserMessageImport)
      const sessionForMiAnswer = await base44.entities.InterviewSession.get(sessionId);
      const currentTranscriptForMi = sessionForMiAnswer.transcript_snapshot || [];
      await appendUserMessageImport(sessionId, currentTranscriptForMi, answer, {
        id: `mi-a-${questionId}-${packId}-${instanceNumber}-${Date.now()}`,
        stableKey: `multi-instance-answer:${questionId}:${packId}:${instanceNumber}`,
        messageType: 'MULTI_INSTANCE_GATE_ANSWER',
        questionId,
        packId,
        instanceNumber
      });
      await refreshTranscriptFromDB('multi_instance_answer');

      if (answer === 'Yes') {
        const substanceName = question?.substance_name || null;
        const packSteps = injectSubstanceIntoPackSteps(engine_S, packId, substanceName);

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
