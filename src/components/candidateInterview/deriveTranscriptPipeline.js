/**
 * deriveTranscriptPipeline.js
 * 
 * Extracted from CandidateInterview.jsx - the finalTranscriptList_S_computed IIFE.
 * This function computes the final transcript list to render after applying
 * all filtering, deduplication, integrity passes, and ordering rules.
 * 
 * @param {Object} deps - Dependencies from the component closure
 * @returns {{ renderedItems: Array }} - The computed transcript items to render
 */
export function deriveTranscriptPipeline(deps) {
  const {
    // Closure variables
    activePromptText,
    cqTdzIsolate,
    renderableTranscriptStream,
    ENFORCE_TRANSCRIPT_CONTRACT,
    activeUiItem_S_SAFE,
    activeCard_S_SAFE,
    v3ProbingActive,
    hasActiveV3Prompt,
    currentItem_S,
    v3ProbingContext_S,
    sessionId,
    dbTranscript,
    engine_S,
    transcriptSOT_S,
    activeUiItem_S,
    activeCard_S,
    FOLLOWUP_PACK_CONFIGS,
    cqDiagEnabled,
    screenMode,
    v3UiRenderable,
    v3HasVisiblePromptCard,
    // Refs
    recentlySubmittedUserAnswersRef,
    recentlySubmittedUserAnswersMetaRef,
    lastV3SubmittedAnswerRef,
    canonicalDetectorLoggedRef,
    openerMergeStatusRef,
    bottomAnchorLenRef,
    finalListRef,
    finalListLenRef,
    // Functions
    cqTdzMark,
    cqSetRenderStep,
    getMessageTypeSOT_SAFE,
    isMiGateItem,
    logOnce,
    captureViolationSnapshot,
    // Module-level vars
    CQ_DEBUG_FOOTER_ANCHOR,
  } = deps;

  // Local debug marker (assignments don't propagate back to caller)
  let __cqLastRenderStep_MEM = '';

    // EDIT 1: Micro-step marker 07
    try {
      __cqLastRenderStep_MEM = 'TRY1:TOP:07_AFTER_RENDERED_TRANSCRIPT';
      if (typeof window !== 'undefined') {
        const hn = window.location?.hostname || '';
        const isDevEnv = hn.includes('preview') || hn.includes('localhost');
        if (isDevEnv) {
          console.log('[CQ_TRY1_STEP]', { step: '07_AFTER_RENDERED_TRANSCRIPT', ts: Date.now() });
        }
      }
    } catch (_) {}
    const hasVisibleActivePromptForSuppression = (activePromptText || '').trim().length > 0;
    cqTdzMark('INSIDE_FINAL_TRANSCRIPT_LIST_MEMO_START');

    
    // TDZ ISOLATE: This memo is bypassed when tdz_isolate=1
    if (cqTdzIsolate) {
      console.log('[TDZ_ISOLATE][FINAL_TRANSCRIPT_LIST_BYPASSED]', { enabled: true });
      return [];
    }
    
    // CRASH GUARD: Safe logging helper (prevents logging from crashing render)
    const safeLog = (fn) => {
      try {
        fn();
      } catch (e) {
        console.warn('[CQ_TRANSCRIPT][LOGGING_GUARD_SUPPRESSED]', { 
          message: e?.message,
          stack: e?.stack?.substring(0, 200)
        });
      }
    };
    
    // CRASH GUARD: Initialize removed items tracker at outer scope
    let removedEphemeralItems = [];
    
    // CQ_TRANSCRIPT_CONTRACT: Render-time invariant check + ENFORCEMENT
    // Ephemeral items (active cards) MUST NOT appear in chat history
    let transcriptToRender = renderableTranscriptStream;
    
    if (ENFORCE_TRANSCRIPT_CONTRACT) {
      const ephemeralSources = renderableTranscriptStream.filter(e => 
        e.__activeCard_S === true || 
        e.kind === 'v3_probe_q' || 
        e.kind === 'v3_probe_a' ||
        e.source === 'ephemeral' ||
        e.source === 'prompt_lane_temporary'
      );
      
      if (ephemeralSources.length > 0) {
        // Expected behavior: ephemeral items filtered from history
        // Only log once per session to avoid spam
        safeLog(() => {
          const ephemeralKey = ephemeralSources.map(e => e.kind || e.messageType).join(',');
          let lastLoggedEphemeralKey = null;
          try {
            lastLoggedEphemeralKey = sessionStorage.getItem('cq_last_ephemeral_log');
          } catch (e) {
            // sessionStorage is not available
          }
          
          if (lastLoggedEphemeralKey !== ephemeralKey) {
            try {
              sessionStorage.setItem('cq_last_ephemeral_log', ephemeralKey);
            } catch (e) {
              // sessionStorage is not available
            }
            console.info('[CQ_TRANSCRIPT][EPHEMERAL_FILTER_APPLIED]', {
              source: 'expected_behavior',
              ephemeralCount: ephemeralSources.length,
              ephemeralKinds: ephemeralSources.map(e => e.kind || e.messageType).slice(0, 3),
              action: 'FILTER_EPHEMERAL'
            });
          }
        });


        
        // ENFORCEMENT: Remove ephemeral items ONLY (never real transcript items)
        // removedEphemeralItems already initialized at outer useMemo scope
        transcriptToRender = renderableTranscriptStream.filter(e => {
          // NORMALIZE: Read type field consistently
          const mt = e.messageType || e.type || e.kind || null;
          const stableKey = e.stableKey || e.id || null;
          
          // CRITICAL: V3 probe Q/A are ALWAYS canonical (never filter)
          const isV3ProbeQ = (stableKey && stableKey.startsWith('v3-probe-q:')) || mt === 'V3_PROBE_QUESTION';
          const isV3ProbeA = (stableKey && stableKey.startsWith('v3-probe-a:')) || mt === 'V3_PROBE_ANSWER';
          
          if (isV3ProbeQ || isV3ProbeA) {
            // BUG DETECTION: Check if this entry would be filtered as ephemeral
            const markedEphemeral = e.__activeCard_S === true || 
              e.kind === 'v3_probe_q' || 
              e.kind === 'v3_probe_a' ||
              e.source === 'ephemeral' ||
              e.source === 'prompt_lane_temporary';
            
            if (markedEphemeral && isV3ProbeA) {

            }
            
            return true; // ALWAYS keep V3 probe Q/A
          }
          
          // CRITICAL: Required anchor Q/A are ALWAYS canonical (never filter)
          const isRequiredAnchorQ = (stableKey && stableKey.startsWith('required-anchor:q:')) || mt === 'REQUIRED_ANCHOR_QUESTION';
          const isRequiredAnchorA = (stableKey && stableKey.startsWith('required-anchor:a:')) || 
                                    (mt === 'ANSWER' && (e.meta?.answerContext === 'REQUIRED_ANCHOR_FALLBACK' || e.answerContext === 'REQUIRED_ANCHOR_FALLBACK'));
          
          if (isRequiredAnchorQ || isRequiredAnchorA) {
            console.log('[REQUIRED_ANCHOR_FALLBACK][ANSWER_FILTER_GUARD_KEEP]', {
              stableKey,
              mt,
              isQ: isRequiredAnchorQ,
              isA: isRequiredAnchorA,
              reason: 'Required-anchor Q/A must remain visible'
            });
            return true; // ALWAYS keep required-anchor Q/A
          }
          
          // CRITICAL: Opener cards MUST be preserved in transcript (unless actively being asked)
          const isOpenerCard = mt === 'FOLLOWUP_CARD_SHOWN' && 
                               (e.meta?.variant === 'opener' || e.variant === 'opener');
          
          if (isOpenerCard) {
            // Check if this is the CURRENTLY ACTIVE opener (should be suppressed)
            const isCurrentlyActiveOpener = activeUiItem_S_SAFE?.kind === "V3_OPENER" &&
                                           activeCard_S_SAFE?.stableKey &&
                                           (e.stableKey || e.id) === activeCard_S_SAFE.stableKey;
            
            if (isCurrentlyActiveOpener) {
              // Will be removed by active opener filter - allow ephemeral filter to pass
              console.log('[CQ_TRANSCRIPT][OPENER_ACTIVE_WILL_BE_FILTERED]', {
                stableKey: e.stableKey || e.id,
                packId: e.meta?.packId || e.packId,
                instanceNumber: e.meta?.instanceNumber || e.instanceNumber,
                reason: 'Active opener - will be removed by dedicated active opener filter'
              });
              return true; // Let it pass ephemeral filter (will be removed later)
            }
            
            // NOT currently active - preserve as canonical transcript
            console.log('[CQ_TRANSCRIPT][EPHEMERAL_ALLOWLIST_OPENER]', {
              stableKey: e.stableKey || e.id,
              packId: e.meta?.packId || e.packId,
              instanceNumber: e.meta?.instanceNumber || e.instanceNumber,
              activeUiItem_SKind: activeUiItem_S_SAFE?.kind,
              reason: 'opener is canonical transcript history - preserving'
            });
            return true; // ALWAYS keep non-active opener transcript entries
          }
          
          // CRITICAL: MI_GATE active cards MUST render (exception to ephemeral rule)
          const isMiGateActiveCard = e.__activeCard_S === true && e.kind === 'multi_instance_gate';
          
          if (isMiGateActiveCard) {
            console.log('[MI_GATE][EPHEMERAL_EXCEPTION]', {
              stableKey: e.stableKey,
              packId: e.packId,
              instanceNumber: e.instanceNumber,
              reason: 'MI_GATE active card must render in main pane - bypassing ephemeral filter'
            });
            return true; // ALWAYS keep MI_GATE active cards
          }
          
          // PROMPT_LANE_CONTEXT PROTECTION: Always keep non-chat context rows (hard exception)
          const isPromptLaneContext = mt === 'PROMPT_LANE_CONTEXT' && 
                                      (e.meta?.contextKind === 'REQUIRED_ANCHOR_FALLBACK' || e.contextKind === 'REQUIRED_ANCHOR_FALLBACK');
          
          if (isPromptLaneContext) {
            console.log('[CQ_TRANSCRIPT][EPHEMERAL_ALLOWLIST_PROMPT_CONTEXT]', {
              stableKey,
              anchor: e.meta?.anchor || e.anchor,
              textPreview: (e.text || '').substring(0, 60),
              reason: 'Non-chat context - always preserved'
            });
            return true; // ALWAYS keep prompt context (non-chat annotation)
          }
          
          // CRITICAL: Never filter items with real DB stableKeys and real types
          const hasStableKey = !!stableKey;
          const isRealTranscriptType = ['QUESTION_SHOWN', 'ANSWER', 'MULTI_INSTANCE_GATE_SHOWN', 'MULTI_INSTANCE_GATE_ANSWER', 'V3_PROBE_QUESTION', 'V3_PROBE_ANSWER', 'FOLLOWUP_CARD_SHOWN', 'V3_OPENER_ANSWER', 'PROMPT_LANE_CONTEXT', 'REQUIRED_ANCHOR_QUESTION'].includes(mt);
          
          if (hasStableKey && isRealTranscriptType) {
            return true; // Always keep real transcript items
          }
          
          // EPHEMERAL FILTER GUARD: Keep required anchor fallback prompts while active
          const isFallbackPrompt = e.kind === 'required_anchor_fallback_prompt';
          
          if (isFallbackPrompt && activeUiItem_S_SAFE?.kind === 'REQUIRED_ANCHOR_FALLBACK') {
            console.log('[CQ_TRANSCRIPT][EPHEMERAL_FILTER_GUARD_KEEP_FALLBACK]', {
              stableKey,
              kind: e.kind,
              activeUiItem_SKind: 'REQUIRED_ANCHOR_FALLBACK',
              reason: 'Fallback prompt must remain visible during active fallback'
            });
            return true; // KEEP - do not filter out
          }
          
          // Filter out ephemeral-only items (V3 prompts, etc.)
          const isEphemeral = e.__activeCard_S === true || 
            e.kind === 'v3_probe_q' || 
            e.kind === 'v3_probe_a' ||
            e.kind === 'required_anchor_fallback_prompt' || // Fallback prompts are ephemeral when NOT active
            e.source === 'ephemeral' ||
            e.source === 'prompt_lane_temporary';
          
          if (isEphemeral) {
            removedEphemeralItems.push({
              stableKey,
              mt,
              kind: e.kind,
              isV3ProbeQ,
              isV3ProbeA,
              hasStableKey,
              isFallbackPrompt
            });
          }
          
          return !isEphemeral;
        });
        
        // CRASH GUARD: Safe logging with fallback
        safeLog(() => {
          const filteredDetailsSafe = Array.isArray(removedEphemeralItems) ? removedEphemeralItems : [];
          const stableKeysRemovedSafe = filteredDetailsSafe.map(e => e?.stableKey).filter(Boolean);
          
          console.log('[CQ_TRANSCRIPT][CRASH_GUARD_OK]', {
            removedItemsCount: filteredDetailsSafe.length,
            keysRemoved: stableKeysRemovedSafe.length
          });
          
          console.log('[CQ_TRANSCRIPT][EPHEMERAL_FILTERED]', {
            beforeLen: renderableTranscriptStream.length,
            afterLen: transcriptToRender.length,
            removedCount: ephemeralSources.length,
            stableKeysRemoved: stableKeysRemovedSafe.slice(0, 5),
            filteredDetails: filteredDetailsSafe.slice(0, 3)
          });
        });
      }
    }
  
    // CQ_FORBIDDEN: transcript must never be filtered or mutated by UI suppression logic
    // A) V3_PROBE_QA_ATTACH DISABLED: Do NOT extract or attach V3 probe Q/A when MI_GATE active
    const v3ProbeQAForGateDeterministic = [];
    
    if (activeUiItem_S_SAFE?.kind === "MI_GATE" && currentItem_S?.packId && currentItem_S?.instanceNumber) {
      console.log('[MI_GATE][V3_PROBE_QA_ATTACH_DISABLED]', {
        packId: currentItem_S.packId,
        instanceNumber: currentItem_S.instanceNumber,
        reason: 'MI gate renders standalone - transcript is canonical source for V3 history',
        v3ProbeQAForGateDeterministic: []
      });
    }
    
    // B1 — CANONICAL DEDUPE: Final dedupe before rendering (parent/child aware + stableKey enforcement)
    const dedupeBeforeRender = (list) => {
      const seen = new Map();
      const deduped = [];
      const dropped = [];
      const parentChildMap = new Map(); // Track parent dependencies
      const stableKeysSeen = new Set(); // REGRESSION GUARD: Enforce no duplicate stableKeys
      
      // First pass: Build parent-child relationships
      for (const entry of list) {
        const parentKey = entry.meta?.parentStableKey || entry.parentStableKey;
        if (parentKey) {
          if (!parentChildMap.has(parentKey)) {
            parentChildMap.set(parentKey, []);
          }
          parentChildMap.get(parentKey).push(entry.stableKey || entry.id);
        }
      }
      
      for (const entry of list) {
        const canonicalKey = entry.__canonicalKey || entry.stableKey || entry.id;
        if (!canonicalKey) {
          deduped.push(entry);
          continue;
        }
        
        // REGRESSION GUARD: Hard-block duplicate stableKeys (prevents duplicate renders)
        const stableKey = entry.stableKey || entry.id;
        if (stableKey && stableKeysSeen.has(stableKey)) {
          console.log('[RENDER][DUPLICATE_STABLEKEY_BLOCKED]', {
            stableKey,
            messageType: entry.messageType || entry.type,
            textPreview: (entry.text || '').substring(0, 40),
            reason: 'Same stableKey already rendered - blocking duplicate'
          });
          dropped.push(canonicalKey);
          continue; // Skip duplicate
        }
        
        if (stableKey) {
          stableKeysSeen.add(stableKey);
        }
        
        if (!seen.has(canonicalKey)) {
          seen.set(canonicalKey, entry);
          deduped.push(entry);
        } else {
          const existing = seen.get(canonicalKey);
          
          const score = (e) => {
            const isUser = e.role === 'user';
            const hasText = (e.text || '').trim().length > 0;
            const isVisible = e.visibleToCandidate !== false;
            // Bonus: Keep parents if they have children in the list
            const isParent = parentChildMap.has(e.stableKey || e.id);
            
            if (isParent && isUser && hasText && isVisible) return 5;
            if (isUser && hasText && isVisible) return 4;
            if (isUser && hasText) return 3;
            if (isUser) return 2;
            if (e.role === 'assistant' && hasText) return 1;
            return 0;
          };
          
          const existingScore = score(existing);
          const entryScore = score(entry);
          
          if (entryScore > existingScore) {
            const replacedIndex = deduped.findIndex(d => (d.stableKey || d.id) === canonicalKey);
            if (replacedIndex !== -1) {
              deduped[replacedIndex] = entry;
              seen.set(canonicalKey, entry);
              console.log('[STREAM][DEDUP_UPGRADE]', {
                canonicalKey,
                existingScore,
                entryScore,
                reason: 'Replaced weaker entry with stronger one'
              });
            }
          } else {
            dropped.push(canonicalKey);
          }
        }
      }
      
      if (dropped.length > 0) {
        console.log('[STREAM][DEDUP_KEYS]', {
          beforeLen: list.length,
          afterLen: deduped.length,
          droppedCount: dropped.length,
          droppedKeysPreview: dropped.slice(0, 3)
        });
      }
      
      return deduped;
    };
    
    // V3 UI CONTRACT: Conditional probe filtering based on active UI state
    // Rule: Suppress probes from transcript ONLY while a probe is actively being asked
    // Once UI moves on (MI_GATE, next question, etc.), probes render in history normally
    const suppressProbesInTranscript = activeUiItem_S_SAFE?.kind === "V3_PROMPT" || 
                                      activeUiItem_S_SAFE?.kind === "V3_WAITING" ||
                                      (v3ProbingActive && hasActiveV3Prompt);
    
    console.log('[V3_UI_CONTRACT][PROBE_TRANSCRIPT_POLICY]', {
      activeUiItem_SKind: activeUiItem_S_SAFE?.kind,
      v3ProbingActive,
      hasActiveV3Prompt,
      suppressProbesInTranscript,
      reason: suppressProbesInTranscript 
        ? 'Active probe - suppress from transcript (render in prompt lane)' 
        : 'No active probe - allow persisted probes in history'
    });
    
    const transcriptWithV3ProbesBlocked = transcriptToRender.filter(entry => {
      const mt = entry.messageType || entry.type || entry.kind || null;
      const stableKey = entry.stableKey || entry.id || null;
      const isUserRole = entry.role === 'user';
      const isRecentlySubmitted = stableKey && recentlySubmittedUserAnswersRef.current.has(stableKey);
      
      // V3 PROBE TYPES
      const V3_PROBE_TYPES = [
        'V3_PROBE_QUESTION',
        'V3_PROBE_PROMPT', 
        'V3_PROBE_ANSWER',
        'V3_PROBE',
        'AI_FOLLOWUP_QUESTION'
      ];
      
      const isV3ProbeType = V3_PROBE_TYPES.includes(mt);
      
      // CONDITIONAL FILTER: Only suppress if probe is currently active
      if (isV3ProbeType && suppressProbesInTranscript) {
        console.log('[V3_UI_CONTRACT][FILTERED_PROBE_FROM_TRANSCRIPT]', {
          mt,
          stableKey,
          activeUiItem_SKind: activeUiItem_S_SAFE?.kind,
          source: entry.__activeCard_S ? 'ephemeral' : 'dbTranscript',
          reason: 'Probe active - rendering in prompt lane only'
        });
        return false; // BLOCK while active
      }
      
      // Allow persisted probe Q/A when no active probe
      if (isV3ProbeType && !suppressProbesInTranscript) {
        console.log('[V3_UI_CONTRACT][PROBE_ALLOWED_IN_HISTORY]', {
          mt,
          stableKey,
          activeUiItem_SKind: activeUiItem_S_SAFE?.kind,
          reason: 'No active probe - allowing in transcript history'
        });
        return true; // ALLOW in history
      }
      
      if (isUserRole && stableKey) {
        if (isRecentlySubmitted) {
          const now = Date.now();
          let meta = recentlySubmittedUserAnswersMetaRef.current.get(stableKey);
          
          if (!meta) {
            meta = { firstSeenAt: now, renderedAt: null };
            recentlySubmittedUserAnswersMetaRef.current.set(stableKey, meta);
          }
          
          meta.renderedAt = now;
          
          const ageMs = now - meta.firstSeenAt;
          const inDb = dbTranscript.some(e => (e.stableKey || e.id) === stableKey);
          const canClear = ageMs >= 250 && inDb && meta.renderedAt;
          
          if (canClear) {
            recentlySubmittedUserAnswersRef.current.delete(stableKey);
            recentlySubmittedUserAnswersMetaRef.current.delete(stableKey);
            console.log('[CQ_TRANSCRIPT][USER_ANSWER_PROTECT_CLEARED]', {
              stableKey,
              ageMs,
              reason: 'Protection window expired - answer stable in DB'
            });
          } else {
            console.log('[CQ_TRANSCRIPT][USER_ANSWER_PROTECT]', {
              stableKey,
              messageType: getMessageTypeSOT_SAFE(entry),
              ageMs,
              inDb,
              canClear,
              reason: 'Protection window active - waiting for stability'
            });
          }
        }
        
        return true;
      }

      // Additional safety: stableKey prefix check (conditional on suppressProbesInTranscript)
      const hasV3ProbeQPrefix = stableKey && stableKey.startsWith('v3-probe-q:');
      const hasV3ProbeAPrefix = stableKey && stableKey.startsWith('v3-probe-a:');

      if ((hasV3ProbeQPrefix || hasV3ProbeAPrefix) && suppressProbesInTranscript) {
        console.log('[V3_UI_CONTRACT][FILTERED_PROBE_BY_PREFIX]', {
          stableKey,
          activeUiItem_SKind: activeUiItem_S_SAFE?.kind,
          source: 'stableKey_prefix_check',
          reason: 'Probe active - filtering by prefix'
        });
        return false; // BLOCK by stableKey prefix when active
      }
      
      if ((hasV3ProbeQPrefix || hasV3ProbeAPrefix) && !suppressProbesInTranscript) {
        console.log('[V3_UI_CONTRACT][PROBE_PREFIX_ALLOWED_IN_HISTORY]', {
          stableKey,
          activeUiItem_SKind: activeUiItem_S_SAFE?.kind,
          reason: 'No active probe - allowing in history'
        });
        return true; // ALLOW when not active
      }
      
      return true;
    });
    
    const transcriptWithV3ProbeQA = [...transcriptWithV3ProbesBlocked, ...v3ProbeQAForGateDeterministic];
    let transcriptToRenderDeduped = dedupeBeforeRender(transcriptWithV3ProbeQA);
    
    // INTEGRITY PASS 1: Ensure every ANSWER has its QUESTION_SHOWN parent
    const transcriptWithIntegrityPass = [];
    const questionIdToQuestionShown = new Map();
    const questionIdToAnswers = new Map();
    
    // Build indexes for base questions
    for (const entry of transcriptToRenderDeduped) {
      const mt = getMessageTypeSOT_SAFE(entry);
      
      if (mt === 'QUESTION_SHOWN') {
        const questionId = entry.meta?.questionDbId;
        if (questionId && !questionIdToQuestionShown.has(questionId)) {
          questionIdToQuestionShown.set(questionId, entry);
        }
      }
      
      if (mt === 'ANSWER' && entry.meta?.answerContext === 'BASE_QUESTION') {
        const questionId = entry.meta?.questionDbId;
        if (questionId) {
          if (!questionIdToAnswers.has(questionId)) {
            questionIdToAnswers.set(questionId, []);
          }
          questionIdToAnswers.get(questionId).push(entry);
        }
      }
    }
    
    // Insert missing QUESTION_SHOWN entries
    const synthesizedQuestions = [];
    for (const [questionId, answers] of questionIdToAnswers.entries()) {
      if (!questionIdToQuestionShown.has(questionId)) {
        // Find question text from engine_S or use placeholder
        const questionText = engine_S?.QById?.[questionId]?.question_text || "(Question)";
        const questionNumber = engine_S?.QById?.[questionId]?.question_number || '';
        const sectionId = engine_S?.QById?.[questionId]?.section_id;
        const sectionEntity = engine_S?.Sections?.find(s => s.id === sectionId);
        const sectionName = sectionEntity?.section_name || '';
        
        const synthQuestion = {
          id: `synth-question-shown-${questionId}`,
          stableKey: `question-shown:${questionId}`,
          role: 'assistant',
          messageType: 'QUESTION_SHOWN',
          type: 'QUESTION_SHOWN',
          text: questionText,
          timestamp: new Date(new Date(answers[0].timestamp).getTime() - 1000).toISOString(),
          createdAt: (answers[0].createdAt || Date.now()) - 1000,
          visibleToCandidate: true,
          __synthetic: true,
          meta: {
            questionDbId: questionId,
            questionNumber,
            sectionName,
            source: 'integrity_pass'
          }
        };
        
        synthesizedQuestions.push({ questionId, synthQuestion });
        
        console.log('[TRANSCRIPT_INTEGRITY][SYNTH_QUESTION_SHOWN]', {
          questionId,
          questionCode: engine_S?.QById?.[questionId]?.question_id || questionId,
          inserted: true,
          reason: 'Answer exists but QUESTION_SHOWN missing from render list'
        });
      }
    }
    
    // Rebuild list with synthesized questions inserted before their first answer
    for (let i = 0; i < transcriptToRenderDeduped.length; i++) {
      const entry = transcriptToRenderDeduped[i];
      
      // Check if we need to insert a synthesized question before this entry
      if (entry.role === 'user' && getMessageTypeSOT_SAFE(entry) === 'ANSWER') {
        const questionId = entry.meta?.questionDbId;
        const synth = synthesizedQuestions.find(s => s.questionId === questionId);
        
        if (synth && !transcriptWithIntegrityPass.some(e => e.stableKey === synth.synthQuestion.stableKey)) {
          transcriptWithIntegrityPass.push(synth.synthQuestion);
        }
      }
      
      transcriptWithIntegrityPass.push(entry);
    }
    
    // Use integrity-passed list
    transcriptToRenderDeduped = transcriptWithIntegrityPass;
    
    // INTEGRITY PASS 2: Ensure every V3 probe answer has its question parent
    const transcriptWithV3Integrity = [];
    const promptIdToV3ProbeQ = new Map();
    const promptIdToV3ProbeA = new Map();
    
    // Build indexes for V3 probe Q/A from current render list
    for (const entry of transcriptToRenderDeduped) {
      const mt = entry.messageType || entry.type || entry.kind || null;
      const stableKey = entry.stableKey || entry.id || null;
      
      if (stableKey && stableKey.startsWith('v3-probe-q:')) {
        const promptId = stableKey.replace('v3-probe-q:', '');
        if (!promptIdToV3ProbeQ.has(promptId)) {
          promptIdToV3ProbeQ.set(promptId, entry);
        }
      }
      
      if (stableKey && stableKey.startsWith('v3-probe-a:')) {
        const promptId = stableKey.replace('v3-probe-a:', '');
        if (!promptIdToV3ProbeA.has(promptId)) {
          promptIdToV3ProbeA.set(promptId, entry);
        }
      }
    }
    
    // Check DB transcript for missing V3 probe answers - CONDITIONAL on suppressProbesInTranscript
    // Only attempt reinsertion when probes should be visible (not suppressed)
    const dbV3ProbeAnswers = (dbTranscript || []).filter(e => {
      const mt = e.messageType || e.type || e.kind || null;
      const stableKey = e.stableKey || e.id || null;
      return (stableKey && stableKey.startsWith('v3-probe-a:')) || mt === 'V3_PROBE_ANSWER';
    });
    
    const dbV3ProbeQuestions = (dbTranscript || []).filter(e => {
      const mt = e.messageType || e.type || e.kind || null;
      const stableKey = e.stableKey || e.id || null;
      return (stableKey && stableKey.startsWith('v3-probe-q:')) || mt === 'V3_PROBE_QUESTION';
    });
    
    // CONDITIONAL REINSERTION: Only run when probes should be visible in transcript
    if (!suppressProbesInTranscript) {
      for (const dbEntry of dbV3ProbeAnswers) {
        const stableKey = dbEntry.stableKey || dbEntry.id || null;
        if (!stableKey) continue;
        
        const promptId = stableKey.startsWith('v3-probe-a:') 
          ? stableKey.replace('v3-probe-a:', '') 
          : null;
        
        if (promptId && !promptIdToV3ProbeA.has(promptId)) {
          // Ensure question also exists before reinserting answer
          const hasQuestionInDb = dbV3ProbeQuestions.some(q => {
            const qKey = q.stableKey || q.id || '';
            return qKey.includes(promptId);
          });
          
          const hasQuestionInRender = promptIdToV3ProbeQ.has(promptId);
          
          if (hasQuestionInDb && hasQuestionInRender) {
            console.log('[CQ_TRANSCRIPT][PROBE_REINSERT_SKIPPED_OR_PAIRED]', {
              promptId,
              stableKey,
              action: 'PAIR',
              reason: 'Question exists - reinserting paired answer'
            });
            
            promptIdToV3ProbeA.set(promptId, { ...dbEntry, __reinserted: true });
          } else {
            console.log('[CQ_TRANSCRIPT][PROBE_REINSERT_SKIPPED_OR_PAIRED]', {
              promptId,
              stableKey,
              action: 'SKIP',
              hasQuestionInDb,
              hasQuestionInRender,
              reason: 'Question missing - skipping answer reinsertion to avoid orphan'
            });
          }
        }
      }
    } else {
      console.log('[CQ_TRANSCRIPT][PROBE_REINSERT_SKIPPED_OR_PAIRED]', {
        action: 'SKIP',
        suppressProbesInTranscript: true,
        reason: 'Probe active - no reinsertion needed'
      });
    }
    
    // Check for missing V3 probe answers not in DB at all
    for (const [promptId, qEntry] of promptIdToV3ProbeQ.entries()) {
      if (!promptIdToV3ProbeA.has(promptId)) {
        const expectedStableKey = `v3-probe-a:${promptId}`;
        const existsInDb = dbV3ProbeAnswers.some(e => 
          (e.stableKey || e.id) === expectedStableKey
        );
        
        if (!existsInDb) {
          console.log('[CQ_TRANSCRIPT][V3_PROBE_A_NOT_IN_DB]', {
            promptId,
            expectedStableKey,
            reason: 'Question exists but answer never persisted'
          });
          
          // REGRESSION CHECK: Did we recently attempt to persist this answer?
          const lastSubmit = lastV3SubmittedAnswerRef.current;
          if (lastSubmit && lastSubmit.expectedAKey === expectedStableKey) {
            const ageMs = Date.now() - lastSubmit.capturedAt;
            console.error('[V3_PROBE_AUDIT][PERSIST_MISSING_AFTER_SEND]', {
              promptId,
              expectedStableKey,
              lastSubmitAge: ageMs,
              reason: 'Answer was submitted but never persisted to DB'
            });
          }
        }
      }
    }
    
    // PART A FIX: Rebuild list with V3 probe answers inserted BEFORE MI gate if present
    // This prevents V3_PROBE_ANSWER from trailing the gate (root cause of ALIGNMENT_VIOLATION_STREAM)
    for (let i = 0; i < transcriptToRenderDeduped.length; i++) {
      const entry = transcriptToRenderDeduped[i];
      transcriptWithV3Integrity.push(entry);
      
      // Check if this is a V3 probe question that needs its answer inserted
      const stableKey = entry.stableKey || entry.id || null;
      if (stableKey && stableKey.startsWith('v3-probe-q:')) {
        const promptId = stableKey.replace('v3-probe-q:', '');
        const answerEntry = promptIdToV3ProbeA.get(promptId);
        
        if (answerEntry && answerEntry.__reinserted) {
          // PART A: Check if MI gate exists for same pack/instance (prevents trailing after gate)
          const answerPackId = answerEntry.meta?.packId || answerEntry.packId;
          const answerInstanceNumber = answerEntry.meta?.instanceNumber || answerEntry.instanceNumber;
          
          // Find MI gate in current working list (transcriptWithV3Integrity)
          const miGateIndex = transcriptWithV3Integrity.findIndex(item => 
            isMiGateItem(item, answerPackId, answerInstanceNumber)
          );
          
          if (miGateIndex !== -1) {
            // MI gate exists - insert answer BEFORE gate (not after question)
            transcriptWithV3Integrity.splice(miGateIndex, 0, answerEntry);
            
            console.log('[V3_PROBE_ANSWER][INSERTED_BEFORE_GATE]', {
              packId: answerPackId,
              instanceNumber: answerInstanceNumber,
              answerStableKey: answerEntry.stableKey || answerEntry.id,
              gateIndex: miGateIndex,
              reason: 'MI gate present - preventing trailing answer'
            });
          } else {
            // No MI gate - insert answer after question (normal flow)
            transcriptWithV3Integrity.push(answerEntry);
            
            console.log('[V3_PROBE_ANSWER][INSERTED_AFTER_QUESTION]', {
              packId: answerPackId,
              instanceNumber: answerInstanceNumber,
              answerStableKey: answerEntry.stableKey || answerEntry.id,
              reason: 'No MI gate - normal Q+A pairing'
            });
          }
        }
      }
    }
    
    // Use V3 integrity-passed list for placeholder injection
    transcriptToRenderDeduped = transcriptWithV3Integrity;
    
    // PARENT PLACEHOLDER INJECTION: Only for MI_GATE (BASE_QUESTION already handled by integrity pass)
    const transcriptWithParentPlaceholders = [];
    const placeholdersInjected = [];
    
    for (let i = 0; i < transcriptToRenderDeduped.length; i++) {
      const entry = transcriptToRenderDeduped[i];
      const isYesNoAnswer = 
        entry.role === 'user' && 
        entry.messageType === 'MULTI_INSTANCE_GATE_ANSWER' &&
        (entry.text === 'Yes' || entry.text === 'No' || entry.text?.startsWith('Yes (') || entry.text?.startsWith('No ('));
      
      if (isYesNoAnswer) {
        const answerContext = entry.meta?.answerContext || entry.answerContext;
        
        // Only inject for MI_GATE (BASE_QUESTION handled by integrity pass above)
        if (answerContext !== 'MI_GATE') {
          transcriptWithParentPlaceholders.push(entry);
          continue;
        }
        
        const parentKey = entry.meta?.parentStableKey || entry.parentStableKey;
        const answerStableKey = entry.stableKey || entry.id;
        
        // Check if parent exists in rendered list
        const parentExists = parentKey && transcriptToRenderDeduped.some(e => 
          (e.stableKey || e.id) === parentKey
        );
        
        if (parentKey && !parentExists) {
          // Inject placeholder parent for MI_GATE only
          const placeholderText = 'Continue this section?';
          
          const placeholder = {
            id: `placeholder:${answerStableKey}`,
            stableKey: `placeholder:${answerStableKey}`,
            role: 'assistant',
            messageType: 'PARENT_PLACEHOLDER',
            type: 'PARENT_PLACEHOLDER',
            text: placeholderText,
            timestamp: new Date(new Date(entry.timestamp).getTime() - 1).toISOString(),
            createdAt: (entry.createdAt || Date.now()) - 1,
            visibleToCandidate: true,
            __synthetic: true,
            meta: {
              answerContext,
              originalParentKey: parentKey,
              injectedFor: answerStableKey
            }
          };
          
          transcriptWithParentPlaceholders.push(placeholder);
          placeholdersInjected.push({
            answerStableKey,
            parentStableKey: parentKey,
            answerContext
          });
          
          console.log('[CQ_TRANSCRIPT][PARENT_INJECTED]', {
            answerStableKey,
            parentStableKey: parentKey,
            answerContext,
            placeholderText: placeholderText.substring(0, 60)
          });
        }
      }
      
      transcriptWithParentPlaceholders.push(entry);
    }
    
    // Log injection summary
    if (placeholdersInjected.length > 0) {
      console.log('[CQ_TRANSCRIPT][PARENT_INJECTION_SUMMARY]', {
        count: placeholdersInjected.length,
        injections: placeholdersInjected
      });
    }
    
    // Use placeholder-injected list for rendering
    transcriptToRenderDeduped = transcriptWithParentPlaceholders;
    
    // C) MI GATE DEDUPE: Remove duplicate MI gate entries by stableKey
    const miGateDedupeMap = new Map();
    const transcriptWithMiGateDedupe = [];
    let miGateRemovedCount = 0;
    const miGateRemovedKeys = [];
    
    for (const entry of transcriptToRenderDeduped) {
      const mt = entry.messageType || entry.type || null;
      const stableKey = entry.stableKey || entry.id || null;
      
      // Identify MI gate entries
      const isMiGateEntry = (stableKey && stableKey.startsWith('mi-gate:')) || 
                           mt === 'MULTI_INSTANCE_GATE_SHOWN' ||
                           mt === 'MULTI_INSTANCE_GATE_ANSWER';
      
      // GUARD: Never dedupe required-anchor entries
      const isRequiredAnchorEntry = stableKey && stableKey.startsWith('required-anchor:');
      
      if (isRequiredAnchorEntry) {
        console.log('[MI_GATE][DEDUPE_SKIP_REQUIRED_ANCHOR]', {
          stableKey,
          reason: 'Required-anchor entries must not be deduped by MI gate logic'
        });
        transcriptWithMiGateDedupe.push(entry);
        continue; // Skip MI gate dedupe for required-anchor entries
      }
      
      if (isMiGateEntry && stableKey) {
        if (miGateDedupeMap.has(stableKey)) {
          miGateRemovedCount++;
          if (miGateRemovedKeys.length < 3) {
            miGateRemovedKeys.push(stableKey);
          }
          continue; // Skip duplicate
        }
        miGateDedupeMap.set(stableKey, true);
      }
      
      transcriptWithMiGateDedupe.push(entry);
    }
    
    if (miGateRemovedCount > 0) {
      console.log('[MI_GATE][DEDUP_APPLIED]', {
        beforeLen: transcriptToRenderDeduped.length,
        afterLen: transcriptWithMiGateDedupe.length,
        removedCount: miGateRemovedCount,
        removedKeysSample: miGateRemovedKeys
      });
    }
    
    // Use MI-gate-deduped list
    transcriptToRenderDeduped = transcriptWithMiGateDedupe;
    
    // REQUIRED_ANCHOR REPAIR INJECTION: Ensure answers follow their questions
    const transcriptWithRequiredAnchorRepair = [];
    const requiredAnchorQToA = new Map(); // Map question stableKey to answer entry
    let repairInjectedCount = 0;
    
    // Build map of required-anchor Q/A from DB transcript
    for (const entry of transcriptSOT_S) {
      const stableKey = entry.stableKey || entry.id || '';
      
      if (stableKey.startsWith('required-anchor:q:')) {
        // Track question for repair
        if (!requiredAnchorQToA.has(stableKey)) {
          requiredAnchorQToA.set(stableKey, null);
        }
      }
      
      if (stableKey.startsWith('required-anchor:a:')) {
        // Find matching question key
        const qKey = stableKey.replace(':a:', ':q:');
        if (requiredAnchorQToA.has(qKey)) {
          requiredAnchorQToA.set(qKey, entry);
        }
      }
    }
    
    // Inject missing answers after their questions
    for (let i = 0; i < transcriptToRenderDeduped.length; i++) {
      const entry = transcriptToRenderDeduped[i];
      transcriptWithRequiredAnchorRepair.push(entry);
      
      const stableKey = entry.stableKey || entry.id || '';
      
      // Check if this is a required-anchor question
      if (stableKey.startsWith('required-anchor:q:')) {
        const answerEntry = requiredAnchorQToA.get(stableKey);
        
        if (answerEntry) {
          // Check if answer already in render stream
          const answerAlreadyPresent = transcriptToRenderDeduped.some(e => 
            (e.stableKey || e.id) === (answerEntry.stableKey || answerEntry.id)
          );
          
          if (!answerAlreadyPresent) {
            // Inject answer after question
            transcriptWithRequiredAnchorRepair.push(answerEntry);
            repairInjectedCount++;
            
            const anchor = answerEntry.meta?.anchor || answerEntry.anchor;
            console.log('[REQUIRED_ANCHOR_FALLBACK][REPAIR_INJECT_ANSWER]', {
              anchor,
              stableKeyA: answerEntry.stableKey || answerEntry.id,
              insertedAfter: stableKey,
              reason: 'Answer in DB but missing from render stream'
            });
          }
        }
      }
    }
    
    if (repairInjectedCount > 0) {
      console.log('[REQUIRED_ANCHOR_FALLBACK][REPAIR_INJECTION_SUMMARY]', {
        injectedCount: repairInjectedCount,
        reason: 'Restored missing required-anchor answers to render stream'
      });
    }
    
    // Use repair-injected list
    transcriptToRenderDeduped = transcriptWithRequiredAnchorRepair;
    
    // PART 2: ADJACENCY-BASED QUESTIONID INFERENCE (orphan Yes/No answers)
    // Infer questionId for answers that have no questionId/meta by finding nearby QUESTION_SHOWN
    
    // RISK 1 FIX: Use Map instead of in-place mutation
    const inferredQuestionIdByKey = new Map(); // key -> questionId
    
    // RISK 2 FIX: Helper for consistent questionId extraction from QUESTION_SHOWN
    const getQuestionIdFromQuestionShown = (entry) => {
      // Priority 1: entry.questionId
      if (entry.questionId) return entry.questionId;
      
      // Priority 2: entry.meta.questionDbId
      if (entry.meta?.questionDbId) return entry.meta.questionDbId;
      
      // Priority 3: Parse from stableKey 'question-shown:<id>'
      const stableKey = entry.stableKey || entry.id || '';
      if (stableKey.startsWith('question-shown:') || stableKey.startsWith('question:')) {
        const match = stableKey.match(/^question(?:-shown)?:(?:[^:]+:)?([^:]+)/);
        if (match) return match[1];
      }
      
      return null;
    };
    
    let lastSeenQuestionId = null;
    let itemsSinceQuestion = 0;
    const ADJACENCY_WINDOW = 3; // Max items between question and answer to infer
    
    for (let i = 0; i < transcriptToRenderDeduped.length; i++) {
      const entry = transcriptToRenderDeduped[i];
      const mt = getMessageTypeSOT_SAFE(entry);
      
      // Track last seen question (RISK 2: use helper)
      if (mt === 'QUESTION_SHOWN') {
        const qId = getQuestionIdFromQuestionShown(entry);
        if (qId) {
          lastSeenQuestionId = qId;
          itemsSinceQuestion = 0; // Reset counter only when qId found
        } else {
          itemsSinceQuestion++;
        }
      } else {
        itemsSinceQuestion++;
      }
      
      // Infer questionId for orphan Yes/No answers - SKIP if questionId already present
      if (mt === 'ANSWER' && (entry.text === 'Yes' || entry.text === 'No')) {
        const hasQuestionId = !!(entry.questionId || entry.meta?.questionId || entry.meta?.questionDbId);
        
        if (!hasQuestionId && lastSeenQuestionId && itemsSinceQuestion <= ADJACENCY_WINDOW) {
          // RISK 1 FIX: Use Map instead of mutation
          const answerKey = entry.stableKey || entry.id;
          inferredQuestionIdByKey.set(answerKey, lastSeenQuestionId);
          
          console.log('[CQ_TRANSCRIPT][ANSWER_INFERRED_QUESTION_ID]', {
            stableKey: answerKey,
            inferredQuestionId: lastSeenQuestionId,
            itemsSinceQuestion,
            text: entry.text
          });
        } else if (hasQuestionId) {
          // AUDIT: Confirm questionId present at creation (no inference needed)
          const answerKey = entry.stableKey || entry.id;
          console.log('[CQ_TRANSCRIPT][ANSWER_HAS_QUESTIONID_SKIP_INFERENCE]', {
            stableKey: answerKey,
            questionId: entry.questionId || entry.meta?.questionId || entry.meta?.questionDbId,
            text: entry.text,
            reason: 'questionId present at creation - no inference needed'
          });
        }
      }
    }
    
    // CANONICAL BASE YES/NO DETECTOR: Build set of canonical base answers
    const canonicalBaseYesNoKeys = new Set();
    let hasAnyCanonicalBaseYesNo = false;
    
    for (const entry of transcriptToRenderDeduped) {
      const mt = getMessageTypeSOT_SAFE(entry);
      if (mt !== 'ANSWER') continue;
      
      const stableKey = entry.stableKey || entry.id || '';
      const isCanonicalBase = stableKey.startsWith('answer:');
      const isYesOrNo = entry.text === 'Yes' || entry.text === 'No';
      
      if (isCanonicalBase && isYesOrNo) {
        canonicalBaseYesNoKeys.add(stableKey);
        hasAnyCanonicalBaseYesNo = true;
      }
    }
    
    // DEBUG LOG: Once per session only (reduce noise)
    if (hasAnyCanonicalBaseYesNo && !canonicalDetectorLoggedRef.current) {
      canonicalDetectorLoggedRef.current = true;
      console.log('[CQ_TRANSCRIPT][CANONICAL_BASE_YESNO_DETECTOR]', {
        hasAnyCanonicalBaseYesNo,
        canonicalCount: canonicalBaseYesNoKeys.size,
        sampleKeys: Array.from(canonicalBaseYesNoKeys).slice(0, 3)
      });
    }
    
    // SUPPRESSION: Remove legacy UUID Yes/No answers without identity
    let suppressedCount = 0;
    const transcriptWithLegacyUuidSuppressed = transcriptToRenderDeduped.filter(entry => {
      const mt = getMessageTypeSOT_SAFE(entry);
      if (mt !== 'ANSWER') return true; // Keep non-answers
      
      const stableKey = entry.stableKey || entry.id || '';
      const isYesOrNo = entry.text === 'Yes' || entry.text === 'No';
      
      if (!isYesOrNo) return true; // Keep non-Yes/No answers
      
      // Check if this is a known answer type (has identity)
      const hasKnownPrefix = 
        stableKey.startsWith('answer:') ||
        stableKey.startsWith('v3-') ||
        stableKey.startsWith('v3-probe-') ||
        stableKey.startsWith('v3-opener-') ||
        stableKey.startsWith('mi-gate:') ||
        stableKey.startsWith('followup-');
      
      if (hasKnownPrefix) return true; // Keep known answer types
      
      // Check if entry has identity metadata
      const hasIdentity = !!(
        entry.questionId ||
        entry.meta?.questionId ||
        entry.meta?.packId ||
        entry.meta?.instanceNumber ||
        entry.meta?.promptId
      );
      
      if (hasIdentity) return true; // Keep answers with identity
      
      // Legacy UUID answer without identity - suppress only if canonical exists
      if (hasAnyCanonicalBaseYesNo) {
        suppressedCount++;
        console.warn('[CQ_TRANSCRIPT][SUPPRESSED_LEGACY_UUID_YESNO]', {
          stableKey,
          text: entry.text,
          reason: 'UUID yes/no answer without questionId/meta while canonical base yes/no exists'
        });
        return false; // DROP
      }
      
      return true; // Keep (fail-open if no canonical exists)
    });
    
    // GOAL ACHIEVED AUDIT: Log once per session if suppressions occurred
    if (suppressedCount > 0 && !canonicalDetectorLoggedRef.current) {
      console.log('[CQ_TRANSCRIPT][GOAL][MYSTERY_YES_SUPPRESSED]', {
        sessionId,
        suppressedCount,
        reason: 'Legacy UUID Yes/No answers removed - canonical base answer preserved'
      });
    }
    
    // Use suppressed list for further processing
    transcriptToRenderDeduped = transcriptWithLegacyUuidSuppressed;
    
    // CANONICAL ANSWER DEDUPE: Remove duplicate base-question answers (same questionId)
    // SCOPE: ONLY base-question answers - excludes V3/MI/followup answers
    
    // HELPER: Single predicate for base-answer identification (prevents drift)
    const isBaseAnswerSubjectToDedupe = (entry) => {
      const mt = getMessageTypeSOT_SAFE(entry);
      if (mt !== 'ANSWER') return { isBase: false, reason: 'not_answer_type' };
      
      const stableKey = entry.stableKey || entry.id || '';
      
      // EXCLUSION RULES: Explicitly NOT base-question answers
      const isV3Answer = stableKey.startsWith('v3-') || 
                         stableKey.startsWith('v3-opener-') ||
                         stableKey.startsWith('v3-probe-') ||
                         mt === 'V3_PROBE_ANSWER' || 
                         mt === 'V3_OPENER_ANSWER';
      const isMiGateAnswer = stableKey.startsWith('mi-gate:') || 
                             mt === 'MULTI_INSTANCE_GATE_ANSWER';
      const hasPackMeta = entry.meta?.packId || entry.meta?.instanceNumber || entry.meta?.followupPackId;
      const isFollowupAnswer = stableKey.startsWith('followup-') || hasPackMeta;
      
      if (isV3Answer) return { isBase: false, reason: 'v3_answer' };
      if (isMiGateAnswer) return { isBase: false, reason: 'mi_gate_answer' };
      if (isFollowupAnswer) return { isBase: false, reason: 'followup_answer' };
      
      // INCLUSION RULES: Identify base-question answers
      const hasDeterministicKey = stableKey.startsWith('answer:');
      const hasBaseContext = entry.meta?.answerContext === 'BASE_QUESTION';
      const hasQuestionIdNoPackMeta = entry.questionId && !hasPackMeta;
      
      const isBaseQuestionAnswer = hasDeterministicKey || hasBaseContext || hasQuestionIdNoPackMeta;
      
      if (!isBaseQuestionAnswer) return { isBase: false, reason: 'no_base_markers' };
      
      return { isBase: true, reason: 'base_question_answer' };
    };
    
    const canonicalAnswerMap = new Map();
    const answersToDedupe = [];
    
    for (const entry of transcriptToRenderDeduped) {
      const check = isBaseAnswerSubjectToDedupe(entry);
      if (!check.isBase) continue;
      
      const stableKey = entry.stableKey || entry.id || '';
      
      // Extract questionId from entry or parse from stableKey (with adjacency inference)
      // RISK 1 FIX: Use Map lookup instead of __inferredQuestionId property
      let questionId = entry.questionId || entry.meta?.questionId || inferredQuestionIdByKey.get(stableKey);
      
      if (!questionId && stableKey.startsWith('answer:')) {
        // Parse from stableKey format: 'answer:<sessionId>:<questionId>:<index>'
        const keyMatch = stableKey.match(/^answer:[^:]+:([^:]+):/);
        if (keyMatch) {
          questionId = keyMatch[1];
        }
      }
      
      if (!questionId) continue; // Cannot dedupe without questionId
      
      const canonicalKey = `base-answer:${questionId}`;
      
      if (!canonicalAnswerMap.has(canonicalKey)) {
        canonicalAnswerMap.set(canonicalKey, []);
      }
      
      canonicalAnswerMap.get(canonicalKey).push(entry);
      answersToDedupe.push({ entry, canonicalKey, questionId, isBaseQuestionAnswer: true, stableKeyPrefix: stableKey.split(':')[0] });
    }
    
    // Build final list: keep one answer per canonicalKey, drop duplicates
    const answersToKeep = new Set();
    const droppedAnswers = [];
    
    for (const [canonicalKey, answers] of canonicalAnswerMap.entries()) {
      if (answers.length <= 1) {
        // No duplicates - keep as-is
        answersToKeep.add(answers[0].stableKey || answers[0].id);
        continue;
      }
      
      // DUPLICATES FOUND: Keep deterministic stableKey, drop UUID
      const deterministicAnswer = answers.find(a => 
        a.stableKey && a.stableKey.startsWith('answer:')
      );
      
      const answerToKeep = deterministicAnswer || answers[answers.length - 1];
      answersToKeep.add(answerToKeep.stableKey || answerToKeep.id);
      
      const dropped = answers.filter(a => 
        (a.stableKey || a.id) !== (answerToKeep.stableKey || answerToKeep.id)
      );
      
      if (dropped.length > 0) {
        const keptKey = answerToKeep.stableKey || answerToKeep.id;
        const keptPrefix = keptKey.split(':')[0];
        
        console.log('[CQ_TRANSCRIPT][ANSWER_DEDUPED_CANONICAL]', {
          canonicalAnswerKey: canonicalKey,
          keptStableKey: keptKey,
          droppedStableKeys: dropped.map(d => d.stableKey || d.id),
          isBaseQuestionAnswer: true,
          stableKeyPrefix: keptPrefix
        });
        
        droppedAnswers.push(...dropped.map(d => d.stableKey || d.id));
      }
    }
    
    // Filter out dropped answers from render list (base-question answers only)
    transcriptToRenderDeduped = transcriptToRenderDeduped.filter(entry => {
      const check = isBaseAnswerSubjectToDedupe(entry);
      
      if (!check.isBase) {
        return true; // Keep - not subject to base dedupe
      }
      
      // Base-question answer: apply dedupe constraint
      const entryKey = entry.stableKey || entry.id;
      if (!entryKey) return true; // Keep if no key
      
      // Only keep if in answersToKeep set
      return answersToKeep.has(entryKey);
    });
    
    // SAFETY GUARD: Verify no duplicate canonical answers remain
    const finalCanonicalCheck = new Map();
    for (const entry of transcriptToRenderDeduped) {
      const check = isBaseAnswerSubjectToDedupe(entry);
      if (!check.isBase) continue; // Only check base answers
      
      const entryKey = entry.stableKey || entry.id || '';
      
      // RISK 1 FIX: Use Map lookup instead of __inferredQuestionId property
      let questionId = entry.questionId || entry.meta?.questionId || inferredQuestionIdByKey.get(entryKey);
      if (!questionId && entryKey.startsWith('answer:')) {
        const keyMatch = entryKey.match(/^answer:[^:]+:([^:]+):/);
        if (keyMatch) questionId = keyMatch[1];
      }
      
      if (!questionId) continue;
      
      const canonicalKey = `base-answer:${questionId}`;
      const stableKey = entry.stableKey || entry.id || '';
      
      if (finalCanonicalCheck.has(canonicalKey)) {
        const stableKeyPrefix = stableKey.split(':')[0];
        
        console.error('[CQ_TRANSCRIPT][BUG][ANSWER_DUPLICATE_AFTER_DEDUPE]', {
          canonicalAnswerKey: canonicalKey,
          stableKeys: [
            finalCanonicalCheck.get(canonicalKey),
            stableKey
          ],
          baseSubject: true,
          stableKeyPrefix,
          reason: 'Multiple answers for same base question survived dedupe'
        });
      } else {
        finalCanonicalCheck.set(canonicalKey, entry.stableKey || entry.id);
      }
    }
    
    // TRUTH TABLE AUDIT: V3 probe answer visibility (only when relevant)
    if (activeUiItem_S_SAFE?.kind === "MI_GATE" || dbV3ProbeAnswers.length > 0) {
      // Get most recent V3 probe answer for current pack/instance
      const packId = currentItem_S?.packId || v3ProbingContext_S?.packId;
      const instanceNumber = currentItem_S?.instanceNumber || v3ProbingContext_S?.instanceNumber || 1;
      
      const recentProbeAnswers = dbV3ProbeAnswers.filter(e => 
        e.meta?.packId === packId && e.meta?.instanceNumber === instanceNumber
      );
      
      if (recentProbeAnswers.length > 0) {
        const lastProbeAnswer = recentProbeAnswers[recentProbeAnswers.length - 1];
        const stableKeyA = lastProbeAnswer.stableKey || lastProbeAnswer.id;
        const promptId = stableKeyA ? stableKeyA.replace('v3-probe-a:', '') : null;
        
        const existsInDb = dbV3ProbeAnswers.some(e => (e.stableKey || e.id) === stableKeyA);
        const existsInDeduped = transcriptWithV3ProbeQA.some(e => (e.stableKey || e.id) === stableKeyA);
        const existsInFinal = transcriptToRenderDeduped.some(e => (e.stableKey || e.id) === stableKeyA);

        // CRASH GUARD: Safe logging with fallback
        safeLog(() => {
          const filteredDetailsSafe = Array.isArray(removedEphemeralItems) ? removedEphemeralItems : [];
          const stableKeysRemovedSafe = filteredDetailsSafe.map(e => e?.stableKey).filter(Boolean);

          console.log('[CQ_TRANSCRIPT][V3_PROBE_A_TRUTH_TABLE]', {
            promptId,
            stableKeyA,
            existsInDb,
            existsInDeduped,
            existsInFinal,
            activeUiItem_SKind: activeUiItem_S_SAFE?.kind,
            packId,
            instanceNumber,
            filteredStableKeysRemoved: stableKeysRemovedSafe.slice(0, 5)
          });
        });
      }
    }
    
    // Diagnostic logging
    if (typeof window !== 'undefined' && (window.location.hostname.includes('preview') || window.location.hostname.includes('localhost'))) {
      const openerAnswerCount = transcriptToRenderDeduped.filter(e => getMessageTypeSOT_SAFE(e) === 'V3_OPENER_ANSWER').length;
      const probeAnswerCount = transcriptToRenderDeduped.filter(e => getMessageTypeSOT_SAFE(e) === 'V3_PROBE_ANSWER').length;
      const probeQuestionCount = transcriptToRenderDeduped.filter(e => getMessageTypeSOT_SAFE(e) === 'V3_PROBE_QUESTION').length;
      
      console.log('[CQ_TRANSCRIPT][TYPE_COUNTS_SOT]', {
        openerAnswerCount,
        probeAnswerCount,
        probeQuestionCount
      });
    
      const packId = currentItem_S?.packId || v3ProbingContext_S?.packId;
      const instanceNumber = currentItem_S?.instanceNumber || v3ProbingContext_S?.instanceNumber || 1;
      const openerAnswerStableKeyForLog = `v3-opener-a:${sessionId}:${packId}:${instanceNumber}`;
      
      const hasOpenerAnswerByStableKey = transcriptToRenderDeduped.some(e => 
        e.stableKey === openerAnswerStableKeyForLog
      );
      
      const openerAnswerByIdentity = transcriptToRenderDeduped.find(e => 
        (e.messageType === 'v3_opener_answer' || e.kind === 'v3_opener_a') &&
        e.packId === packId && 
        (e.instanceNumber === instanceNumber || e.meta?.instanceNumber === instanceNumber)
      );
      const hasOpenerAnswerByIdentity = !!openerAnswerByIdentity;
      const hasOpenerAnswer = hasOpenerAnswerByStableKey || hasOpenerAnswerByIdentity;
      
      console.log('[CQ_RENDER_SOT][BEFORE_MAP]', {
        listName: 'finalRenderStream',
        len: transcriptToRenderDeduped.length,
        hasOpenerAnswer,
        hasOpenerAnswerByStableKey,
        hasOpenerAnswerByIdentity,
        foundStableKey: openerAnswerByIdentity?.stableKey || null,
        verifyStableKey: openerAnswerStableKeyForLog,
        last3: transcriptToRenderDeduped.slice(-3).map(e => ({
          stableKey: e.stableKey || e.id,
          messageType: e.messageType || e.type || e.kind,
          role: e.role,
          textPreview: (e.text || '').substring(0, 40)
        }))
      });

      // ============================================================================
      // V3 PACK DETERMINISTIC GUARD - Filter deterministic follow-up artifacts
      // ============================================================================
      // When a V3 pack is active, suppress ALL deterministic follow-up question items
      // V3 packs use conversational probing (V3ProbingLoop) - no deterministic UI cards

      // Detect active V3 pack context
      const activePackId = currentItem_S?.packId || v3ProbingContext_S?.packId || activeUiItem_S?.packId || null;
      const packConfig = activePackId ? FOLLOWUP_PACK_CONFIGS?.[activePackId] : null;
      const isActivePackV3 = Boolean(packConfig?.isV3Pack === true || packConfig?.engine_SVersion === 'v3');
      const isV3UiActive = (activeUiItem_S_SAFE?.kind === 'V3_OPENER' || 
                           activeUiItem_S_SAFE?.kind === 'V3_PROBING' || 
                           currentItem_S?.type === 'v3_pack_opener' ||
                           v3ProbingActive);

      // Only apply suppression when BOTH are true
      const shouldFilterDeterministicFollowups = isActivePackV3 && isV3UiActive;

      if (shouldFilterDeterministicFollowups) {
        const beforeLen = transcriptToRenderDeduped.length;
        const removedSamples = [];

        transcriptToRenderDeduped = transcriptToRenderDeduped.filter(entry => {
          // Extract entry metadata
          const mt = entry.messageType || entry.type || entry.kind || '';
          const entryPackId = entry.packId || entry.meta?.packId || entry.meta?.followup_pack_id;
          const entryStableKey = entry.stableKey || entry.id || '';
          const entryVariant = entry.variant || entry.meta?.variant;
          
          // STRICT TYPE CHECK: Exclude normal Q/A items
          const isNormalQA = mt === 'QUESTION_SHOWN' || 
                             mt === 'ANSWER' || 
                             mt === 'V3_PROBE_QUESTION' || 
                             mt === 'V3_PROBE_ANSWER';
          
          if (isNormalQA) {
            return true; // NEVER filter normal Q/A (even with packId)
          }
          
          // DETERMINISTIC TYPE CHECK: Explicit deterministic follow-up markers
          const matchesDeterministicType = 
            mt === 'FOLLOWUP_QUESTION' ||
            mt === 'FOLLOWUP_STEP' ||
            mt === 'FOLLOWUP_DETERMINISTIC' ||
            mt === 'PACK_STEP' ||
            entry.kind === 'followup_question' ||
            entry.type === 'followup_question' ||
            entryVariant === 'deterministic';
          
          // PACK OWNERSHIP CHECK: Prove entry belongs to active V3 pack
          const belongsToActivePack = 
            entryPackId === activePackId ||
            entryStableKey.includes(activePackId);
          
          // STRICT GUARD: Only filter if BOTH type matches AND ownership proven
          const isDeterministicForActivePack = matchesDeterministicType && belongsToActivePack;

          if (isDeterministicForActivePack) {
            // Track removed entry with audit trail (up to 5 samples)
            if (removedSamples.length < 5) {
              removedSamples.push({
                mt,
                kind: entry.kind,
                type: entry.type,
                entryPackId,
                stableKeySuffix: entryStableKey.slice(-18),
                reasonFlags: {
                  matchesDeterministicType,
                  belongsToActivePack,
                  variantDeterministic: entryVariant === 'deterministic'
                }
              });
            }
            return false; // Filter out (proven deterministic artifact for active pack)
          }

          return true; // Keep all other items
        });

        const afterLen = transcriptToRenderDeduped.length;
        const removedCount = beforeLen - afterLen;

        // Always log when guard is active (proof it ran)
        logOnce(`v3_deterministic_guard_${sessionId}:${activePackId}`, () => {
          console.log('[UI_CONTRACT][V3_PACK_DETERMINISTIC_GUARD]', {
            packId: activePackId,
            isActivePackV3,
            isV3UiActive,
            shouldFilterDeterministicFollowups: true,
            beforeLen,
            afterLen,
            removedCount,
            removedSampleCount: removedSamples.length,
            reason: 'V3 pack uses conversational probing - deterministic UI artifacts filtered'
          });
        });
        
        // Active log when items removed (proof it's working)
        if (removedCount > 0) {
          logOnce(`v3_deterministic_guard_active_${sessionId}:${activePackId}`, () => {
            console.log('[UI_CONTRACT][V3_PACK_DETERMINISTIC_GUARD_ACTIVE]', {
              packId: activePackId,
              removedCount,
              removedSamples: removedSamples.slice(0, 3),
              reason: 'Deterministic follow-ups filtered for active V3 pack'
            });
          });
        }
      }
      
      if (cqDiagEnabled) {
        console.log('[CQ_GO_STATUS]', {
          crashSeen: false,
          hasOpenerAnswer,
          renderLen: transcriptToRender.length,
          hasOpenerAnswerByStableKey,
          hasOpenerAnswerByIdentity
        });
      }
    }
    
    // CQ_FORBIDDEN: This suppresses UNANSWERED questions only (render filter, NOT transcript mutation)
    // Transcript is permanent - this only affects what renders while V3 is active
    // CQ_RULE: STREAM_SUPPRESS must never block transcript writes - this is render-time only
    // ACTIVE OPENER DEDUPLICATION: Remove transcript copy when opener is currently active
    // This prevents duplicate rendering (transcript + active lane)
    let transcriptWithActiveOpenerRemoved = transcriptToRenderDeduped;
    
    // CONDITIONAL: Only run when V3_OPENER is actually active (not during V3_PROMPT or other states)
    const shouldSuppressActiveOpener = activeUiItem_S_SAFE?.kind === "V3_OPENER" && 
                                       activeCard_S_SAFE?.stableKey && 
                                       screenMode === "QUESTION";
    
    console.log('[V3_UI_CONTRACT][ACTIVE_OPENER_DUPLICATE_FILTER_SOT]', {
      activeUiItem_SKind: activeUiItem_S_SAFE?.kind,
      activeStableKey: activeCard_S_SAFE?.stableKey || null,
      didRun: shouldSuppressActiveOpener,
      removedCount: 0 // Will be updated below
    });
    
    if (shouldSuppressActiveOpener) {
      const activeOpenerStableKey = activeCard_S_SAFE.stableKey;
      const activeOpenerPackId = activeCard_S.packId;
      const activeOpenerInstanceNumber = activeCard_S.instanceNumber;
      const activeV3OpenerStableKey = `v3-opener:${activeOpenerPackId}:${activeOpenerInstanceNumber}`;
      const activeV3OpenerFollowupShownKey = `followup-card:${activeOpenerPackId}:opener:${activeOpenerInstanceNumber}`;
      const beforeLen = transcriptWithActiveOpenerRemoved.length;
      
      transcriptWithActiveOpenerRemoved = transcriptWithActiveOpenerRemoved.filter(e => {
        const entryStableKey = e.stableKey || e.id || e.__canonicalKey;
        const entryPackId = e.packId || e.meta?.packId;
        const entryInstanceNumber = e.instanceNumber || e.meta?.instanceNumber;
        const entryVariant = e.meta?.variant || e.variant;
        const isOpenerByType = (e.messageType === 'FOLLOWUP_CARD_SHOWN' || e.type === 'FOLLOWUP_CARD_SHOWN') && entryVariant === 'opener';
        
        const matchesByKey = entryStableKey === activeOpenerStableKey || 
                            entryStableKey === activeV3OpenerStableKey || 
                            entryStableKey === activeV3OpenerFollowupShownKey;
        const matchesByMetadata = isOpenerByType && entryPackId === activeOpenerPackId && entryInstanceNumber === activeOpenerInstanceNumber;
        const matches = matchesByKey || matchesByMetadata;
        
        if (matches) {
          console.log('[V3_UI_CONTRACT][ACTIVE_OPENER_DUPLICATE_REMOVED]', {
            activeStableKey: activeOpenerStableKey,
            removedStableKey: entryStableKey,
            messageType: e.messageType || e.type,
            matchedBy: matchesByKey ? 'stableKey' : 'metadata',
            screenMode,
            activeUiItem_SKind: activeUiItem_S_SAFE.kind
          });
        }
        
        return !matches; // Remove if matches active opener
      });
      
      const removedCount = beforeLen - transcriptWithActiveOpenerRemoved.length;
      
      if (removedCount > 0) {
        console.log('[V3_OPENER][DEDUP_TRANSCRIPT_OPENER_REMOVED]', { 
          packId: activeOpenerPackId, 
          instanceNumber: activeOpenerInstanceNumber, 
          removedCount 
        });
      }
      
      console.log('[V3_UI_CONTRACT][ACTIVE_OPENER_DUPLICATE_FILTER_SOT]', {
        activeUiItem_SKind: activeUiItem_S_SAFE?.kind,
        activeStableKey: activeOpenerStableKey,
        didRun: true,
        removedCount
      });
      
      if (removedCount > 0) {
        console.log('[V3_UI_CONTRACT][ACTIVE_OPENER_DUPLICATE_SUMMARY]', {
          activeStableKey: activeOpenerStableKey,
          removedCount,
          packId: activeCard_S.packId,
          instanceNumber: activeCard_S.instanceNumber,
          reason: 'Active opener renders in active lane only - transcript copy suppressed'
        });
      }
    } else {
      // Not active opener mode - all opener transcript entries should be preserved
      console.log('[V3_UI_CONTRACT][ACTIVE_OPENER_FILTER_SKIPPED]', {
        activeUiItem_SKind: activeUiItem_S_SAFE?.kind,
        reason: shouldSuppressActiveOpener ? 'conditions_not_met' : 'not_v3_opener_mode',
        action: 'Preserving all opener transcript entries'
      });
    }
    
    // Use deduplicated list for further processing
    transcriptToRenderDeduped = transcriptWithActiveOpenerRemoved;
    
    // OPENER PRESENCE ASSERTION: Verify completed opener instances are in transcript
    const completedOpeners = (dbTranscript || []).filter(e => 
      (e.messageType === 'FOLLOWUP_CARD_SHOWN' || e.type === 'FOLLOWUP_CARD_SHOWN') &&
      (e.meta?.variant === 'opener' || e.variant === 'opener')
    );
    
    if (completedOpeners.length > 0) {
      const activePackId = currentItem_S?.packId;
      const activeInstanceNumber = currentItem_S?.instanceNumber;
      const missingInstanceNumbers = [];
      
      for (const opener of completedOpeners) {
        const openerPackId = opener.meta?.packId || opener.packId;
        const openerInstanceNumber = opener.meta?.instanceNumber || opener.instanceNumber;
        const openerStableKey = opener.stableKey || opener.id;
        
        // Skip currently active opener instance (expected to be missing from transcript)
        const isCurrentlyActive = activeUiItem_S_SAFE?.kind === "V3_OPENER" &&
                                  openerPackId === activePackId &&
                                  openerInstanceNumber === activeInstanceNumber;
        
        if (isCurrentlyActive) continue;
        
        // Check if this completed opener is in final transcript
        const foundInTranscript = transcriptToRenderDeduped.some(e => 
          (e.stableKey || e.id) === openerStableKey ||
          ((e.messageType === 'FOLLOWUP_CARD_SHOWN' || e.type === 'FOLLOWUP_CARD_SHOWN') &&
           (e.meta?.variant === 'opener' || e.variant === 'opener') &&
           (e.meta?.packId || e.packId) === openerPackId &&
           (e.meta?.instanceNumber || e.instanceNumber) === openerInstanceNumber)
        );
        
        if (!foundInTranscript) {
          missingInstanceNumbers.push(`${openerPackId}:${openerInstanceNumber}`);
          
          console.error('[V3_UI_CONTRACT][OPENER_MISSING_FROM_TRANSCRIPT]', {
            packId: openerPackId,
            instanceNumber: openerInstanceNumber,
            stableKey: openerStableKey,
            activeUiItem_SKind: activeUiItem_S_SAFE?.kind,
            activeInstanceNumber,
            reason: 'Completed opener not in transcript history - regression detected'
          });
        }
      }
      
      if (missingInstanceNumbers.length > 0) {
        console.error('[V3_UI_CONTRACT][OPENER_MISSING_SUMMARY]', {
          missingCount: missingInstanceNumbers.length,
          missingInstanceNumbers,
          activeUiItem_SKind: activeUiItem_S_SAFE?.kind,
          activePackId,
          activeInstanceNumber
        });
      }
    }
    
    // ACTIVE MI_GATE DEDUPLICATION: Remove transcript copy when MI gate is currently active
    // This prevents duplicate rendering (transcript + active lane)
    let transcriptWithActiveMiGateRemoved = transcriptToRenderDeduped;
    
    if (activeUiItem_S_SAFE?.kind === "MI_GATE" && screenMode === "QUESTION") {
      const activeMiGateStableKey = activeCard_S_SAFE?.stableKey || 
                                    (currentItem_S?.packId && currentItem_S?.instanceNumber 
                                      ? `mi-gate:${currentItem_S.packId}:${currentItem_S.instanceNumber}:q`
                                      : null);
      
      if (activeMiGateStableKey) {
        const beforeLen = transcriptWithActiveMiGateRemoved.length;
        const removedKeys = [];
        
        transcriptWithActiveMiGateRemoved = transcriptWithActiveMiGateRemoved.filter(e => {
          const entryStableKey = e.stableKey || e.id || e.__canonicalKey;
          
          // Match exact stableKey or same packId+instanceNumber
          const exactMatch = entryStableKey === activeMiGateStableKey;
          const baseKeyMatch = entryStableKey && 
                              activeMiGateStableKey && 
                              entryStableKey.startsWith(activeMiGateStableKey.replace(':q', ''));
          const packInstanceMatch = e.meta?.packId === currentItem_S?.packId && 
                                   e.meta?.instanceNumber === currentItem_S?.instanceNumber &&
                                   (e.messageType === 'MULTI_INSTANCE_GATE_SHOWN' || e.type === 'MULTI_INSTANCE_GATE_SHOWN');
          
          const matches = exactMatch || baseKeyMatch || packInstanceMatch;
          
          if (matches) {
            removedKeys.push(entryStableKey);
            console.log('[MI_GATE][ACTIVE_DUPLICATE_REMOVED]', {
              activeStableKey: activeMiGateStableKey,
              removedStableKey: entryStableKey,
              matchType: exactMatch ? 'exact' : baseKeyMatch ? 'baseKey' : 'packInstance',
              messageType: e.messageType || e.type,
              screenMode,
              activeUiItem_SKind: activeUiItem_S_SAFE.kind
            });
          }
          
          return !matches; // Remove if matches active MI gate
        });
        
        const removedCount = beforeLen - transcriptWithActiveMiGateRemoved.length;
        if (removedCount > 0) {
          console.log('[MI_GATE][ACTIVE_DUPLICATE_REMOVED_SUMMARY]', {
            activeStableKey: activeMiGateStableKey,
            removedCount,
            removedKeysSample: removedKeys.slice(0, 3),
            packId: currentItem_S?.packId,
            instanceNumber: currentItem_S?.instanceNumber,
            reason: 'Active MI gate renders in active lane only - transcript copy suppressed'
          });
        }
      }
    }
    
    // Use deduplicated list for further processing
    transcriptToRenderDeduped = transcriptWithActiveMiGateRemoved;
    
    // CANONICAL OPENER MERGE: Force-merge DB openers into transcript (deterministic visibility)
    // Rule: ALL openers from dbTranscript MUST render (except currently active opener)
    const canonicalOpenersFromDb = (dbTranscript || []).filter(e => {
      const mt = e.messageType || e.type || null;
      const variant = e.meta?.variant || e.variant || null;
      return mt === 'FOLLOWUP_CARD_SHOWN' && variant === 'opener';
    });
    
    if (canonicalOpenersFromDb.length > 0) {
      // Canonical opener key function (single source of truth for key derivation)
      const getOpenerKey = (entry) => {
        const stableKey = entry.stableKey || entry.id;
        // Use existing stableKey if it's properly formatted
        if (stableKey && stableKey.startsWith('followup-card:') && stableKey.includes(':opener:')) {
          return stableKey;
        }
        // Derive canonical key from pack identity
        const packId = entry.meta?.packId || entry.packId;
        const instanceNumber = entry.meta?.instanceNumber || entry.instanceNumber;
        return `followup-card:${packId}:opener:${instanceNumber}`;
      };
      
      // GATING: Skip canonical insertion during active opener state (active lane owns it)
      const isActiveOpenerState = activeUiItem_S_SAFE?.kind === "V3_OPENER";
      
      if (isActiveOpenerState) {
        console.log('[V3_UI_CONTRACT][OPENER_CANONICAL_MERGE_SKIPPED_ACTIVE]', {
          activeUiItem_SKind: 'V3_OPENER',
          reason: 'active opener owned by active lane - skipping insertion logic',
          canonicalOpenersCount: canonicalOpenersFromDb.length
        });
        
        // Still run pre-dedupe and assertion, but skip insertion
        // This prevents duplicate openers in transcript during active state
        let workingList = [...transcriptToRenderDeduped];
        const seenOpenerKeys = new Set();
        const removedDuplicates = [];
        
        workingList = workingList.filter(e => {
          const mt = e.messageType || e.type || null;
          const variant = e.meta?.variant || e.variant || null;
          const isOpener = mt === 'FOLLOWUP_CARD_SHOWN' && variant === 'opener';
          
          if (!isOpener) return true;
          
          const openerKey = getOpenerKey(e);
          if (seenOpenerKeys.has(openerKey)) {
            removedDuplicates.push(openerKey);
            return false;
          }
          
          seenOpenerKeys.add(openerKey);
          return true;
        });
        
        transcriptToRenderDeduped = workingList;
        
        if (removedDuplicates.length > 0) {
          console.log('[V3_UI_CONTRACT][OPENER_CANONICAL_DEDUP_PRE]', {
            beforeLen: transcriptToRenderDeduped.length + removedDuplicates.length,
            afterLen: workingList.length,
            removedCount: removedDuplicates.length,
            removedKeysSample: removedDuplicates.slice(0, 3),
            mode: 'active_opener_dedupe_only'
          });
        }
        
        // Set merge status for SOT log (component-level ref)
        openerMergeStatusRef.current = 'SKIP_ACTIVE';
        
        // Skip rest of merge logic - continue to next filter
      } else {
        // NOT active opener state - run full canonical merge logic
        const mergeMode = activeUiItem_S_SAFE?.kind === 'V3_PROMPT' ? 'V3_PROMPT_HISTORY' : 'HISTORY_DISPLAY';
        
        console.log('[V3_UI_CONTRACT][OPENER_CANONICAL_MERGE_MODE]', {
          mode: mergeMode,
          willInsert: true,
          activeUiItem_SKind: activeUiItem_S_SAFE?.kind,
          canonicalOpenersCount: canonicalOpenersFromDb.length
        });
        
        console.log('[V3_UI_CONTRACT][OPENER_CANONICAL_MERGE_START]', {
          canonicalOpenersCount: canonicalOpenersFromDb.length,
          activeUiItem_SKind: activeUiItem_S_SAFE?.kind,
          transcriptLenBefore: transcriptToRenderDeduped.length
        });
        
        // PRE-DEDUPE: Remove duplicate opener entries from transcript before insertion
        let workingList = [...transcriptToRenderDeduped];
        const seenOpenerKeys = new Set();
        const beforeLen = workingList.length;
        const removedDuplicates = [];
        
        workingList = workingList.filter(e => {
          const mt = e.messageType || e.type || null;
          const variant = e.meta?.variant || e.variant || null;
          const isOpener = mt === 'FOLLOWUP_CARD_SHOWN' && variant === 'opener';
          
          if (!isOpener) return true; // Keep non-opener entries
          
          const openerKey = getOpenerKey(e);
          if (seenOpenerKeys.has(openerKey)) {
            removedDuplicates.push(openerKey);
            return false; // Remove duplicate
          }
          
          seenOpenerKeys.add(openerKey);
          return true; // Keep first occurrence
        });
        
        if (removedDuplicates.length > 0) {
          console.log('[V3_UI_CONTRACT][OPENER_CANONICAL_DEDUP_PRE]', {
            beforeLen,
            afterLen: workingList.length,
            removedCount: removedDuplicates.length,
            removedKeysSample: removedDuplicates.slice(0, 3)
          });
        } else {
          console.log('[V3_UI_CONTRACT][OPENER_CANONICAL_DEDUP_PRE]', {
            beforeLen,
            afterLen: workingList.length,
            removedCount: 0,
            status: 'clean'
          });
        }
        
        // IDENTIFY MISSING: Find openers that need insertion
        const missingOpeners = [];
        const openersToInsert = [];
        
        for (const opener of canonicalOpenersFromDb) {
          const openerKey = getOpenerKey(opener);
          const openerPackId = opener.meta?.packId || opener.packId;
          const openerInstanceNumber = opener.meta?.instanceNumber || opener.instanceNumber;
          
          // Check if this is the currently active opener
          const isCurrentlyActive = activeUiItem_S_SAFE?.kind === "V3_OPENER" &&
                                    activeCard_S_SAFE?.stableKey === openerKey;
          
          if (isCurrentlyActive) {
            console.log('[V3_UI_CONTRACT][OPENER_SKIP_CURRENTLY_ACTIVE]', {
              stableKey: openerKey,
              packId: openerPackId,
              instanceNumber: openerInstanceNumber,
              reason: 'Active opener renders in active lane - skip transcript merge'
            });
            continue; // Skip active opener (active lane owns it)
          }
          
          // Check if already in transcript (using canonical key)
          const foundInTranscript = seenOpenerKeys.has(openerKey);
          
          if (!foundInTranscript) {
            missingOpeners.push({
              stableKey: openerKey,
              packId: openerPackId,
              instanceNumber: openerInstanceNumber
            });
            
            // Prepare for insertion
            openersToInsert.push({
              entry: opener,
              stableKey: openerKey,
              packId: openerPackId,
              instanceNumber: openerInstanceNumber
            });
            
            console.log('[V3_UI_CONTRACT][OPENER_MISSING_WILL_INSERT]', {
              stableKey: openerKey,
              packId: openerPackId,
              instanceNumber: openerInstanceNumber,
              reason: 'Opener in DB but missing from transcript - will force-merge'
            });
          }
        }
        
        // INSERT MISSING: Add openers deterministically (idempotent)
        if (openersToInsert.length > 0) {
          // Spacer note (footer spacer is DOM-only, not in transcript list)
          console.log('[V3_UI_CONTRACT][OPENER_CANONICAL_INSERT_SPACER_NOTE]', {
            note: 'spacer is DOM-only; insertion remains within transcript list'
          });
          
          for (const { entry, stableKey, packId, instanceNumber } of openersToInsert) {
            // IDEMPOTENCE CHECK: Verify key not already inserted in this pass
            const alreadyExists = workingList.some(e => {
              const mt = e.messageType || e.type || null;
              const variant = e.meta?.variant || e.variant || null;
              const isOpener = mt === 'FOLLOWUP_CARD_SHOWN' && variant === 'opener';
              return isOpener && getOpenerKey(e) === stableKey;
            });
            
            if (alreadyExists) {
              console.log('[V3_UI_CONTRACT][OPENER_CANONICAL_INSERT_SKIPPED_EXISTS]', {
                stableKey,
                packId,
                instanceNumber,
                reason: 'Opener already present in working list - skipping duplicate insertion'
              });
              continue; // Skip insertion
            }
            
            // Find insertion position: BEFORE first V3 probe Q for same pack+instance
            let insertIndex = workingList.findIndex(e => {
              const mt = e.messageType || e.type || null;
              const isV3ProbeQ = mt === 'V3_PROBE_QUESTION' || 
                                (e.stableKey && e.stableKey.startsWith('v3-probe-q:'));
              const matchesPack = (e.meta?.packId || e.packId) === packId;
              const matchesInstance = (e.meta?.instanceNumber || e.instanceNumber) === instanceNumber;
              return isV3ProbeQ && matchesPack && matchesInstance;
            });
            
            // Fallback: Find base "Yes" answer that triggered this pack
            if (insertIndex === -1) {
              // Look for ANSWER entry that would trigger this pack
              const baseAnswers = workingList.filter(e => 
                (e.messageType === 'ANSWER' || e.type === 'ANSWER') &&
                e.role === 'user' &&
                (e.text === 'Yes' || e.text?.startsWith('Yes'))
              );
              
              // Insert after last Yes before any pack entries
              if (baseAnswers.length > 0) {
                const lastYesIndex = workingList.lastIndexOf(baseAnswers[baseAnswers.length - 1]);
                insertIndex = lastYesIndex + 1;
              }
            }
            
            // Fallback: Append at end of transcript items
            if (insertIndex === -1) {
              insertIndex = workingList.length;
            }
            
            // Insert opener at determined position
            workingList.splice(insertIndex, 0, entry);
            seenOpenerKeys.add(stableKey); // Track inserted key
            
            console.log('[V3_UI_CONTRACT][OPENER_CANONICAL_INSERTED]', {
              stableKey,
              packId,
              instanceNumber,
              insertIndex,
              insertStrategy: insertIndex < workingList.length - 1 ? 'before_probe_or_after_yes' : 'append',
              listLenAfter: workingList.length
            });
          }
          
          transcriptToRenderDeduped = workingList;
        } else {
          transcriptToRenderDeduped = workingList; // Use deduplicated list
        }
        
        // ASSERTION: Verify all non-active openers present AND no duplicates
        const finalOpenerKeys = new Set();
        const duplicateKeys = [];
        
        for (const entry of transcriptToRenderDeduped) {
          const mt = entry.messageType || entry.type || null;
          const variant = entry.meta?.variant || entry.variant || null;
          const isOpener = mt === 'FOLLOWUP_CARD_SHOWN' && variant === 'opener';
          
          if (isOpener) {
            const openerKey = getOpenerKey(entry);
            if (finalOpenerKeys.has(openerKey)) {
              duplicateKeys.push(openerKey);
            } else {
              finalOpenerKeys.add(openerKey);
            }
          }
        }
        
        const stillMissing = [];
        for (const opener of canonicalOpenersFromDb) {
          const openerKey = getOpenerKey(opener);
          const openerPackId = opener.meta?.packId || opener.packId;
          const openerInstanceNumber = opener.meta?.instanceNumber || opener.instanceNumber;
          
          const isCurrentlyActive = activeUiItem_S_SAFE?.kind === "V3_OPENER" &&
                                    activeCard_S_SAFE?.stableKey === openerKey;
          if (isCurrentlyActive) continue;
          
          if (!finalOpenerKeys.has(openerKey)) {
            stillMissing.push(`${openerPackId}:${openerInstanceNumber}`);
          }
        }
        
        if (duplicateKeys.length > 0) {
          console.error('[V3_UI_CONTRACT][OPENER_CANONICAL_DUPLICATE_DETECTED]', {
            duplicateCount: duplicateKeys.length,
            duplicateKeysSample: duplicateKeys.slice(0, 3),
            reason: 'Duplicate opener keys found in final transcript - deduplication failed'
          });
        }
        
        if (stillMissing.length > 0) {
          console.error('[V3_UI_CONTRACT][OPENER_CANONICAL_MERGE_FAIL]', {
            missingCount: stillMissing.length,
            missingKeysSample: stillMissing.slice(0, 3),
            activeUiItem_SKind: activeUiItem_S_SAFE?.kind,
            reason: 'Canonical openers missing after force-merge - logic error'
          });
          
          // Set merge status for SOT log (component-level ref)
          openerMergeStatusRef.current = 'FAIL';
        } else {
          console.log('[V3_UI_CONTRACT][OPENER_CANONICAL_MERGE_OK]', {
            count: canonicalOpenersFromDb.length,
            activeUiItem_SKind: activeUiItem_S_SAFE?.kind,
            insertedCount: openersToInsert.length,
            duplicateCount: duplicateKeys.length,
            reason: duplicateKeys.length === 0 ? 'All non-active openers present, no duplicates' : 'Openers present but duplicates detected'
          });
          
          // Set merge status for SOT log (component-level ref)
          openerMergeStatusRef.current = duplicateKeys.length === 0 ? 'PASS' : 'PASS_WITH_DUPLICATES';
        }
      }
    }
    
    // ORDER GATING: Suppress UNANSWERED base questions during V3
    const v3UiHistoryLen = v3UiRenderable.length;
    const hasVisibleV3PromptCard = v3HasVisiblePromptCard;
    const shouldSuppressBaseQuestions = v3ProbingActive || hasVisibleV3PromptCard;
    
    const finalList = shouldSuppressBaseQuestions 
      ? transcriptToRenderDeduped.filter((entry, idx) => {
          if (entry.messageType !== 'QUESTION_SHOWN') return true;
          if (entry.meta?.packId) return true;
          
          const suppressedQuestionId = entry.meta?.questionDbId || entry.questionId;
          const suppressedQuestionCode = entry.meta?.questionCode || 'unknown';
          
          const hasAnswerAfter = transcriptToRenderDeduped
            .slice(idx + 1)
            .some(laterEntry => 
              laterEntry.role === 'user' && 
              laterEntry.messageType === 'ANSWER' &&
              (laterEntry.questionDbId === suppressedQuestionId || laterEntry.meta?.questionDbId === suppressedQuestionId)
            );
          
          if (hasAnswerAfter) {
            console.log('[CQ_TRANSCRIPT][BASE_Q_PRESERVED_DURING_V3]', {
              suppressedQuestionId,
              suppressedQuestionCode,
              reason: 'Question answered - keeping in transcript history',
              v3ProbingActive,
              loopKey: v3ProbingContext_S ? `${sessionId}:${v3ProbingContext_S.categoryId}:${v3ProbingContext_S.instanceNumber || 1}` : null
            });
            return true;
          }
          
          console.log('[ORDER][BASE_Q_SUPPRESSED_ONLY_ACTIVE]', {
            suppressedQuestionId,
            suppressedQuestionCode,
            reason: 'V3_PROBING_ACTIVE - unanswered question suppressed',
            v3ProbingActive,
            v3UiHistoryLen,
            hasVisibleV3PromptCard,
            loopKey: v3ProbingContext_S ? `${sessionId}:${v3ProbingContext_S.categoryId}:${v3ProbingContext_S.instanceNumber || 1}` : null
          });
          
          return false;
        })
      : transcriptToRenderDeduped;
    
    // PART A: FORCE INSERT - Ensure MI gate exists when active (before reorder)
    let listWithGate = finalList;
    const currentGatePackId = currentItem_S?.packId;
    const currentGateInstanceNumber = currentItem_S?.instanceNumber;
    
    // TASK 3: Enforce gate when activeUiItem_S_SAFE.kind is MI_GATE (regardless of other flags)
    const isGateActiveUiKind = activeUiItem_S_SAFE?.kind === "MI_GATE" || 
                                activeCard_S_SAFE?.kind === "multi_instance_gate";
    const shouldEnforceMiGate = isGateActiveUiKind && 
                                currentGatePackId && 
                                currentGateInstanceNumber !== undefined;
    
    if (shouldEnforceMiGate) {
      // PART C: Use unified gate detector
      const gateExists = listWithGate.some(item => 
        isMiGateItem(item, currentGatePackId, currentGateInstanceNumber)
      );
      
      if (!gateExists) {
        // STEP 4: Gate is active but missing - force insert with required fields
        const gateItemId = `multi-instance-gate-${currentGatePackId}-${currentGateInstanceNumber}`;
        const gateStableKey = `mi-gate:${currentGatePackId}:${currentGateInstanceNumber}:q`;
        
        // Populate title/label from active item metadata (deterministic, no hardcoded text)
        const gateTitle = currentItem_S?.questionText || 
                         currentItem_S?.text || 
                         `Instance ${currentGateInstanceNumber}`;
        
        const reconstructedGate = {
          id: gateItemId,
          stableKey: gateStableKey,
          kind: 'multi_instance_gate',
          messageType: 'MULTI_INSTANCE_GATE_SHOWN',
          packId: currentGatePackId,
          instanceNumber: currentGateInstanceNumber,
          text: gateTitle, // Required by renderer
          title: gateTitle, // Required by some card variants
          __activeCard_S: true,
          meta: {
            packId: currentGatePackId,
            instanceNumber: currentGateInstanceNumber
          },
          timestamp: new Date().toISOString(),
          visibleToCandidate: true,
          role: 'assistant' // Required by some transcript renderers
        };
        
        listWithGate = [...listWithGate, reconstructedGate];
        
        logOnce(`migate_force_inserted_${currentGatePackId}_${currentGateInstanceNumber}`, () => {
          console.warn('[MI_GATE][FORCE_INSERTED]', {
            packId: currentGatePackId,
            instanceNumber: currentGateInstanceNumber,
            gateTitle,
            reason: 'Gate was active but missing from final list - reconstructed and inserted'
          });
          
          // PART A: Capture violation snapshot when force insert occurs
          captureViolationSnapshot({
            reason: 'FORCE_INSERT_TRIGGERED',
            list: listWithGate,
            packId: currentGatePackId,
            instanceNumber: currentGateInstanceNumber,
            activeItemId: currentItem_S?.id
          });
        });
      }
    }
    
    // PART B: FINAL REORDER - Enforce MI gate is last (after force insert)
    let finalListWithGateOrdered = listWithGate;
    
    if (shouldEnforceMiGate) {
      // PART C: Use unified detector for finding gate
      const miGateIndex = listWithGate.findIndex(item => 
        isMiGateItem(item, currentGatePackId, currentGateInstanceNumber)
      );
      
      if (miGateIndex !== -1 && miGateIndex < listWithGate.length - 1) {
        // Items exist after MI gate - REORDER
        const itemsBefore = listWithGate.slice(0, miGateIndex);
        const miGateItem = listWithGate[miGateIndex];
        const itemsAfter = listWithGate.slice(miGateIndex + 1);
        
        finalListWithGateOrdered = [...itemsBefore, ...itemsAfter, miGateItem];
        
        logOnce(`migate_final_reorder_${currentGatePackId}_${currentGateInstanceNumber}`, () => {
          console.warn('[MI_GATE][FINAL_REORDER_APPLIED]', {
            packId: currentGatePackId,
            instanceNumber: currentGateInstanceNumber,
            movedCount: itemsAfter.length,
            movedKinds: itemsAfter.map(e => ({ 
              kind: e.kind || e.messageType, 
              key: (e.stableKey || e.id || '').substring(0, 40) 
            }))
          });
        });
      }
      
      // STEP 2: Post-reorder corrective enforcement (not just logging)
      let finalGateIndex = finalListWithGateOrdered.findIndex(item => 
        isMiGateItem(item, currentGatePackId, currentGateInstanceNumber)
      );
      
      if (finalGateIndex !== -1 && finalGateIndex < finalListWithGateOrdered.length - 1) {
        // Still items after gate - CORRECTIVE FIX
        const trailingItems = finalListWithGateOrdered.slice(finalGateIndex + 1);
        
        // STEP 3: Forensic detail + TASK 1 diagnostic (deduped, once per pack+instance)
        logOnce(`migate_trailing_${currentGatePackId}_${currentGateInstanceNumber}`, () => {
          const isV3Item = (item) => {
            const k = item.kind || item.messageType || '';
            const t = item.type || '';
            return k.includes('v3_probe') || k.includes('V3_PROBE') || 
                   t.includes('v3_probe') || t.includes('V3_PROBE') ||
                   item.meta?.v3PromptSource;
          };
          
          console.error('[MI_GATE][TRAILING_ITEMS_AFTER_GATE]', {
            packId: currentGatePackId,
            instanceNumber: currentGateInstanceNumber,
            trailingCount: trailingItems.length,
            trailing: trailingItems.map(e => ({
              kind: e.kind || e.messageType || e.type || 'unknown',
              stableKey: e.stableKey || null,
              itemId: e.id || null,
              isActiveCard: e.__activeCard_S || false,
              isV3Related: isV3Item(e)
            })),
            reason: 'Items found after gate post-reorder - applying corrective fix'
          });
          
          // PART A: Capture violation snapshot when trailing items detected
          captureViolationSnapshot({
            reason: 'TRAILING_ITEMS_DETECTED',
            list: finalListWithGateOrdered,
            packId: currentGatePackId,
            instanceNumber: currentGateInstanceNumber,
            activeItemId: currentItem_S?.id
          });
        });
        
        // Corrective fix: move trailing items before gate
        const beforeGate = finalListWithGateOrdered.slice(0, finalGateIndex);
        const gateItem = finalListWithGateOrdered[finalGateIndex];
        finalListWithGateOrdered = [...beforeGate, ...trailingItems, gateItem];
        
        // STEP 2: Belt-and-suspenders - verify correction worked
        finalGateIndex = finalListWithGateOrdered.findIndex(item => 
          isMiGateItem(item, currentGatePackId, currentGateInstanceNumber)
        );
        
        if (finalGateIndex !== -1 && finalGateIndex < finalListWithGateOrdered.length - 1) {
          // Still not last after correction - forced final reorder
          const stillAfter = finalListWithGateOrdered.slice(finalGateIndex + 1);
          const stillBefore = finalListWithGateOrdered.slice(0, finalGateIndex);
          const stillGateItem = finalListWithGateOrdered[finalGateIndex];
          finalListWithGateOrdered = [...stillBefore, ...stillAfter, stillGateItem];
        }
      }
    }
    
    // STEP 1: Defensive copy (no freeze - safe for downstream mutations)
    const renderedItems = [...finalListWithGateOrdered];
    
    // PART C: REGRESSION ASSERT - Verify no V3_PROBE_ANSWER trails MI gate (deduped, once per gate)
    if (shouldEnforceMiGate) {
      const finalGateIndex = renderedItems.findIndex(item => 
        isMiGateItem(item, currentGatePackId, currentGateInstanceNumber)
      );
      
      if (finalGateIndex !== -1 && finalGateIndex < renderedItems.length - 1) {
        const itemsAfter = renderedItems.slice(finalGateIndex + 1);
        const v3ProbeAnswersAfter = itemsAfter.filter(e => 
          (e.messageType === 'V3_PROBE_ANSWER' || e.type === 'V3_PROBE_ANSWER' || e.kind === 'v3_probe_a')
        );
        
        if (v3ProbeAnswersAfter.length > 0) {
          logOnce(`v3_probe_a_after_gate_${currentGatePackId}_${currentGateInstanceNumber}`, () => {
            console.error('[MI_GATE][REGRESSION_V3_PROBE_ANSWER_AFTER_GATE]', {
              packId: currentGatePackId,
              instanceNumber: currentGateInstanceNumber,
              gateIndex: finalGateIndex,
              lastIndex: renderedItems.length - 1,
              v3ProbeAnswersAfterCount: v3ProbeAnswersAfter.length,
              stableKeySuffixes: v3ProbeAnswersAfter.map(e => (e.stableKey || e.id || '').slice(-18)),
              reason: 'V3_PROBE_ANSWER found after MI gate - insertion logic failed'
            });
          });
        }
      }
    }
    
    // EDIT 1: Micro-step marker 08
      try {
        __cqLastRenderStep_MEM = 'TRY1:TOP:08_AFTER_BOTTOM_BAR_MODE';
        if (typeof window !== 'undefined') {
          const hn = window.location?.hostname || '';
          const isDevEnv = hn.includes('preview') || hn.includes('localhost');
          if (isDevEnv) {
            console.log('[CQ_TRY1_STEP]', { step: '08_AFTER_BOTTOM_BAR_MODE', ts: Date.now() });
          }
        }
      } catch (_) {}

    cqSetRenderStep('TRY1:FINAL_LIST_REFS_WRITE');

    // EDIT 1: Micro-step marker 09
      try {
        __cqLastRenderStep_MEM = 'TRY1:TOP:09_AFTER_FOOTER_FLAGS';
        if (typeof window !== 'undefined') {
          const hn = window.location?.hostname || '';
          const isDevEnv = hn.includes('preview') || hn.includes('localhost');
          if (isDevEnv) {
            console.log('[CQ_TRY1_STEP]', { step: '09_AFTER_FOOTER_FLAGS', ts: Date.now() });
          }
        }
      } catch (_) {}

    // TDZ GUARD: Update length counter + sync finalList refs (use frozen renderedItems)
    bottomAnchorLenRef.current = renderedItems.length;
    finalListRef.current = Array.isArray(renderedItems) ? renderedItems : [];
    finalListLenRef.current = Array.isArray(renderedItems) ? renderedItems.length : 0;
    
    cqTdzMark('INSIDE_FINAL_TRANSCRIPT_LIST_MEMO_END', { renderedLen: renderedItems.length });
    
    if (CQ_DEBUG_FOOTER_ANCHOR) {
      console.log('[TDZ_GUARD][FINAL_LIST_REF_SYNC]', { len: finalListLenRef.current });
    }
    
    // Regression guard logging (use frozen renderedItems)
    const candidateVisibleQuestionsInDb = transcriptToRenderDeduped.filter(e => 
      e.messageType === 'QUESTION_SHOWN' && e.visibleToCandidate === true
    ).length;
    const candidateVisibleQuestionsInRender = renderedItems.filter(e => 
      e.messageType === 'QUESTION_SHOWN' && e.visibleToCandidate === true
    ).length;
    
    if (candidateVisibleQuestionsInRender < candidateVisibleQuestionsInDb && shouldSuppressBaseQuestions) {
      const droppedQuestions = transcriptToRenderDeduped.filter(e => 
        e.messageType === 'QUESTION_SHOWN' && 
        e.visibleToCandidate === true &&
        !renderedItems.some(r => (r.stableKey && r.stableKey === e.stableKey) || (r.id && r.id === e.id))
      );
      
      console.log('[CQ_TRANSCRIPT][BASE_Q_SUPPRESSED_STATS]', {
        candidateVisibleQuestionsInDb,
        candidateVisibleQuestionsInRender,
        droppedCount: candidateVisibleQuestionsInDb - candidateVisibleQuestionsInRender,
        droppedKeys: droppedQuestions.map(e => ({
          questionId: e.meta?.questionDbId || e.questionId,
          questionCode: e.meta?.questionCode || 'unknown',
          stableKey: e.stableKey || e.id,
          textPreview: (e.text || '').substring(0, 40)
        }))
      });
    } else if (shouldSuppressBaseQuestions && candidateVisibleQuestionsInRender === candidateVisibleQuestionsInDb) {
      console.log('[CQ_TRANSCRIPT][BASE_Q_NO_REGRESSION]', {
        candidateVisibleQuestionsInDb,
        candidateVisibleQuestionsInRender,
        reason: 'All answered base questions preserved during V3'
      });
    }
    
    return { renderedItems };
}
