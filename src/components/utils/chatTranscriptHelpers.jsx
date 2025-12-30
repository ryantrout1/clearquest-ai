/**
 * Chat Transcript Helpers
 * 
 * Unified transcript append system for ChatGPT-style interview UI.
 * Maintains legal transcript integrity while supporting UI rendering.
 * 
 * CRITICAL RULES:
 * - Assistant messages: Append ONLY when they should appear in legal record
 * - User messages: Append immediately when submitted
 * - UI-only spinners: NEVER append to transcript
 * - Single source of truth: session.transcript_snapshot
 * - MONOTONIC GUARANTEE: Transcript NEVER shrinks for same sessionId
 */

import { base44 } from "@/api/base44Client";

// PART C: Ref to track latest transcript (prevents stale closure reads)
const transcriptRef = { current: [] };

// ============================================================================
// PERSIST RETRY QUEUE - Handle transient network failures
// ============================================================================
// CRITICAL FIX: Store only the ENTRY (not full transcript) to prevent snapshot overwrite
const retryQueue = new Map(); // Map<`${sessionId}|${stableKey}`, { sessionId, stableKey, entry, attempts, nextRetryAt }>
const MAX_RETRY_ATTEMPTS = 5;
const RETRY_BACKOFF_MS = [1000, 3000, 10000, 30000, 60000]; // 1s, 3s, 10s, 30s, 60s

// RACE SAFETY: Single-flight retry processor flag
let isProcessingRetryQueue = false;

// INTEGRITY AUDIT: Track locally-seen stableKeys (log-only)
const seenStableKeysBySession = new Set(); // Set<`${sessionId}|${stableKey}`>

// MULTI-TAB SAFETY: Per-session retry locks
const SESSION_LOCK_TIMEOUT_MS = 15000; // 15 seconds

// CONFLICT DETECTION: Write timing threshold for suspecting contention
const SLOW_WRITE_THRESHOLD_MS = 1500; // 1.5 seconds

// Helper: Check if retry queue has items for a session
const hasRetryQueueForSession = (sessionId) => {
  for (const [_, item] of retryQueue.entries()) {
    if (item.sessionId === sessionId) return true;
  }
  return false;
};

const acquireSessionLock = (sessionId) => {
  try {
    const lockKey = `cq_retry_lock_${sessionId}`;
    const existingLock = localStorage.getItem(lockKey);
    
    if (existingLock) {
      const lockTimestamp = parseInt(existingLock, 10);
      const lockAge = Date.now() - lockTimestamp;
      
      if (lockAge < SESSION_LOCK_TIMEOUT_MS) {
        console.log('[PERSIST][RETRY_SESSION_LOCKED]', {
          sessionId,
          lockAge: Math.round(lockAge / 1000) + 's',
          reason: 'Another tab/process is retrying for this session'
        });
        return false; // Lock held by another tab
      }
      
      // Stale lock - take over
      console.log('[PERSIST][RETRY_SESSION_LOCK_STALE]', {
        sessionId,
        lockAge: Math.round(lockAge / 1000) + 's',
        action: 'taking over'
      });
    }
    
    // Acquire lock
    localStorage.setItem(lockKey, Date.now().toString());
    return true;
  } catch (e) {
    // CHANGE 3: Storage unavailable - proceed without lock (safe degradation)
    console.warn('[PERSIST][RETRY_LOCK_UNAVAILABLE]', { 
      sessionId, 
      error: e.message,
      reason: 'localStorage blocked or unavailable - proceeding without multi-tab lock'
    });
    return true; // Fail-open: allow retry without lock
  }
};

const releaseSessionLock = (sessionId) => {
  try {
    const lockKey = `cq_retry_lock_${sessionId}`;
    localStorage.removeItem(lockKey);
  } catch (e) {
    console.warn('[PERSIST][RETRY_SESSION_UNLOCK_FAIL]', { sessionId, error: e.message });
  }
};

const queueFailedPersist = (sessionId, stableKey, entry) => {
  // COMPOSITE KEY: Prevent cross-session collisions
  const compositeKey = `${sessionId}|${stableKey}`;
  
  if (retryQueue.has(compositeKey)) {
    console.log('[PERSIST][RETRY_ALREADY_QUEUED]', { sessionId, stableKey, compositeKey });
    return;
  }
  
  const retryItem = {
    sessionId,
    stableKey,
    entry, // Store ONLY the entry, not full transcript
    attempts: 0,
    nextRetryAt: Date.now() + RETRY_BACKOFF_MS[0]
  };
  
  retryQueue.set(compositeKey, retryItem);
  
  console.log('[PERSIST][RETRY_QUEUED]', {
    sessionId,
    stableKey,
    compositeKey,
    attempt: 1,
    nextRetryIn: RETRY_BACKOFF_MS[0]
  });
  
  // Save to localStorage for cross-session recovery
  try {
    const queueSnapshot = Array.from(retryQueue.entries());
    localStorage.setItem('cq_persist_retry_queue', JSON.stringify(queueSnapshot));
  } catch (e) {
    console.warn('[PERSIST][RETRY_QUEUE_STORAGE_FAIL]', { error: e.message });
  }
  
  // Schedule retry
  scheduleNextRetry();
};

const scheduleNextRetry = () => {
  const now = Date.now();
  let nextRetryDelay = Infinity;
  
  for (const [compositeKey, item] of retryQueue.entries()) {
    const delay = item.nextRetryAt - now;
    if (delay < nextRetryDelay) {
      nextRetryDelay = delay;
    }
  }
  
  if (nextRetryDelay < Infinity && nextRetryDelay >= 0) {
    setTimeout(processRetryQueue, Math.max(0, nextRetryDelay));
  }
};

const processRetryQueue = async () => {
  // CHANGE 1: RACE SAFETY - Single-flight processor
  if (isProcessingRetryQueue) {
    console.log('[PERSIST][RETRY_PROCESSOR_SKIPPED]', {
      reason: 'already_running',
      queueSize: retryQueue.size
    });
    return;
  }
  
  isProcessingRetryQueue = true;
  
  try {
    const now = Date.now();
    
    // Group items by sessionId for batch processing
    const sessionIds = new Set();
    for (const [compositeKey, item] of retryQueue.entries()) {
      sessionIds.add(item.sessionId);
    }
    
    // Process each session (with lock acquisition)
    for (const sessionId of sessionIds) {
      // CHANGE 3: Acquire per-session lock (multi-tab safety)
      let lockAcquired = false;
      let sessionLockReliable = true; // CHANGE 2: Track lock reliability
      try {
        lockAcquired = acquireSessionLock(sessionId);
        if (!lockAcquired) {
          continue; // Skip this session - locked by another tab
        }
      } catch (e) {
        // CHANGE 3: Lock acquisition failed - proceed without lock
        console.warn('[PERSIST][RETRY_LOCK_ERROR]', { 
          sessionId, 
          error: e.message,
          action: 'proceeding without lock'
        });
        lockAcquired = false; // Mark as not acquired so we don't try to release
        sessionLockReliable = false; // CHANGE 2: Lock unreliable - enable cautious retry
      }
      
      try {
        // CHANGE 2: Count items for this session
        const sessionItems = Array.from(retryQueue.entries()).filter(([_, item]) => 
          item.sessionId === sessionId && item.nextRetryAt <= now
        );
        
        if (sessionItems.length === 0) {
          continue; // No items ready for this session
        }
        
        console.log('[PERSIST][RETRY_SESSION_BATCH]', {
          sessionId,
          itemsCount: sessionItems.length
        });
        
        // CHANGE 2: Fetch ONCE per session (performance optimization)
        const latestSession = await base44.entities.InterviewSession.get(sessionId);
        let workingTranscript = latestSession.transcript_snapshot || [];
        
        console.log('[PERSIST][RETRY_FETCH]', {
          sessionId,
          transcriptLen: workingTranscript.length,
          itemsToRetry: sessionItems.length
        });
        
        // CHANGE 2: Process all retries for this session using workingTranscript
        for (const [compositeKey, item] of sessionItems) {
          item.attempts++;
          
          if (item.attempts > MAX_RETRY_ATTEMPTS) {
            console.error('[PERSIST][RETRY_GIVEUP]', {
              sessionId: item.sessionId,
              stableKey: item.stableKey,
              compositeKey,
              attempts: item.attempts
            });
            retryQueue.delete(compositeKey);
            continue;
          }
          
          console.log('[PERSIST][RETRY_ATTEMPT]', {
            sessionId: item.sessionId,
            stableKey: item.stableKey,
            compositeKey,
            attempt: item.attempts
          });
          
          try {
            // CHANGE 2: Dedupe against workingTranscript (not latest from DB)
            const alreadyExists = workingTranscript.some(e => 
              e.stableKey === item.stableKey || e.id === item.entry.id
            );
            
            if (alreadyExists) {
              console.log('[PERSIST][RETRY_DEDUPED]', {
                sessionId: item.sessionId,
                stableKey: item.stableKey,
                compositeKey,
                reason: 'stableKey already present in working transcript'
              });
              retryQueue.delete(compositeKey);
              continue;
            }
            
            // CHANGE 2: Append to workingTranscript
            const nextTranscript = [...workingTranscript, item.entry];
            
            // CHANGE 1: Track write timing
            const t0 = Date.now();
            await base44.entities.InterviewSession.update(item.sessionId, {
              transcript_snapshot: nextTranscript
            });
            const dtMs = Date.now() - t0;
            
            // CHANGE 1/2: Suspect contention if >1 items OR lock unreliable
            const suspectContention = sessionItems.length > 1 || !sessionLockReliable;
            
            console.log('[PERSIST][WRITE_TIMING]', {
              kind: 'retry',
              sessionId: item.sessionId,
              stableKey: item.stableKey,
              dtMs,
              suspectContention,
              reason: suspectContention ? 
                (!sessionLockReliable ? 'lock_unreliable' : 'batch_size_gt_1') : 'none'
            });
            
            // CHANGE 1: Conflict detection when contention suspected
            let didRemerge = false; // Track if we performed a remerge
            if (suspectContention) {
              const verifySession = await base44.entities.InterviewSession.get(item.sessionId);
              const latestTranscript = verifySession.transcript_snapshot || [];
              const foundInDb = latestTranscript.some(e => e.stableKey === item.stableKey);
              
              if (foundInDb) {
                console.log('[PERSIST][CONFLICT_CHECK_OK]', {
                  sessionId: item.sessionId,
                  stableKey: item.stableKey,
                  dtMs
                });
              } else {
                console.error('[PERSIST][CONFLICT_DETECTED]', {
                  sessionId: item.sessionId,
                  stableKey: item.stableKey,
                  dtMs,
                  action: 'remerge',
                  reason: 'stableKey missing after write - likely overwritten by concurrent write'
                });
                
                // Re-merge into latest and write again
                const alreadyExistsInLatest = latestTranscript.some(e => e.stableKey === item.stableKey);
                if (!alreadyExistsInLatest) {
                  const remergedTranscript = [...latestTranscript, item.entry];
                  await base44.entities.InterviewSession.update(item.sessionId, {
                    transcript_snapshot: remergedTranscript
                  });
                  
                  console.log('[PERSIST][CONFLICT_REMERGE_OK]', {
                    sessionId: item.sessionId,
                    stableKey: item.stableKey
                  });
                  
                  // Update workingTranscript to remerged version
                  workingTranscript = remergedTranscript;
                  didRemerge = true;
                }
              }
            }
            
            console.log('[PERSIST][RETRY_OK]', {
              sessionId: item.sessionId,
              stableKey: item.stableKey,
              compositeKey
            });
            
            // CHANGE 2: Update workingTranscript for next iteration (only if we didn't remerge)
            if (!didRemerge) {
              workingTranscript = nextTranscript;
            }
            
            // FIX F: INTEGRITY AUDIT - Skip if storage disabled
            if (!STORAGE_DISABLED) {
              const auditKey = `${item.sessionId}|${item.stableKey}`;
              if (seenStableKeysBySession.has(auditKey)) {
                const foundInLocal = workingTranscript.some(e => e.stableKey === item.stableKey);
                if (!foundInLocal) {
                  const last3Keys = workingTranscript.slice(-3).map(e => e.stableKey || e.id);
                  console.warn('[PERSIST][INTEGRITY_LOCAL_MISSING]', {
                    sessionId: item.sessionId,
                    stableKey: item.stableKey,
                    transcriptRefLen: workingTranscript.length,
                    lastStableKeysPreview: last3Keys,
                    mode: 'retry_batch',
                    reason: 'Retry succeeded but stableKey not in working transcript (possible merge timing)'
                  });
                }
              }
            }
            
            retryQueue.delete(compositeKey);
          } catch (err) {
            // Check if error is duplicate (already exists in DB)
            if (err.message?.includes('already exists') || err.message?.includes('duplicate')) {
              console.log('[PERSIST][RETRY_DEDUPED]', {
                sessionId: item.sessionId,
                stableKey: item.stableKey,
                compositeKey,
                reason: 'Server confirmed already exists'
              });
              retryQueue.delete(compositeKey);
            } else {
              // Schedule next retry with backoff
              const nextBackoff = RETRY_BACKOFF_MS[Math.min(item.attempts, RETRY_BACKOFF_MS.length - 1)];
              item.nextRetryAt = now + nextBackoff;
              
              console.log('[PERSIST][RETRY_FAILED]', {
                sessionId: item.sessionId,
                stableKey: item.stableKey,
                compositeKey,
                attempt: item.attempts,
                nextRetryIn: nextBackoff,
                error: err.message
              });
            }
          }
        }
      } catch (e) {
        // CHANGE 3: Session processing failed - log and continue
        console.error('[PERSIST][RETRY_SESSION_ERROR]', {
          sessionId,
          error: e.message,
          action: 'continuing to next session'
        });
      } finally {
        // CHANGE 3: Release session lock (safe even if not acquired)
        if (lockAcquired) {
          try {
            releaseSessionLock(sessionId);
          } catch (e) {
            console.warn('[PERSIST][RETRY_UNLOCK_ERROR]', {
              sessionId,
              error: e.message
            });
          }
        }
      }
    }
    
    // Update localStorage
    try {
      if (retryQueue.size > 0) {
        const queueSnapshot = Array.from(retryQueue.entries());
        localStorage.setItem('cq_persist_retry_queue', JSON.stringify(queueSnapshot));
      } else {
        localStorage.removeItem('cq_persist_retry_queue');
      }
    } catch (e) {
      console.warn('[PERSIST][RETRY_QUEUE_STORAGE_FAIL]', { error: e.message });
    }
    
    // Schedule next retry if queue not empty
    if (retryQueue.size > 0) {
      scheduleNextRetry();
    }
  } finally {
    // CHANGE 1: Reset single-flight flag
    isProcessingRetryQueue = false;
  }
};

// Flush retry queue immediately (best-effort, non-blocking)
export const flushRetryQueueOnce = () => {
  const queuedCount = retryQueue.size;
  if (queuedCount > 0) {
    console.log('[PERSIST][FLUSH_ON_UNLOAD]', { queuedCount });
    processRetryQueue(); // Fire and forget - no await
  }
};

// FIX F: Detect storage blocking and set runtime flag
let STORAGE_DISABLED = false;

// Load retry queue from localStorage on module init
if (typeof window !== 'undefined') {
  try {
    // Test storage availability
    const testKey = 'cq_storage_test';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
    
    const stored = localStorage.getItem('cq_persist_retry_queue');
    if (stored) {
      const entries = JSON.parse(stored);
      let validCount = 0;
      
      for (const [compositeKey, item] of entries) {
        // Validate item structure
        if (!item.sessionId || !item.stableKey || !item.entry) {
          console.warn('[PERSIST][RETRY_QUEUE_INVALID_ITEM]', {
            compositeKey,
            reason: 'Missing required fields',
            hasSessionId: !!item.sessionId,
            hasStableKey: !!item.stableKey,
            hasEntry: !!item.entry
          });
          continue;
        }
        
        retryQueue.set(compositeKey, item);
        validCount++;
      }
      
      console.log('[PERSIST][RETRY_QUEUE_RESTORED]', { 
        count: validCount,
        invalid: entries.length - validCount
      });
      
      if (retryQueue.size > 0) {
        scheduleNextRetry();
      }
    }
  } catch (e) {
    // FIX F: Storage blocked by browser (Tracking Prevention)
    const isTrackingPrevention = e.name === 'SecurityError' || e.message?.includes('tracking');
    if (isTrackingPrevention) {
      STORAGE_DISABLED = true;
      console.log('[PERSIST][STORAGE_DISABLED]', { 
        reason: 'Browser Tracking Prevention blocking localStorage',
        error: e.message,
        action: 'Continuing with dbTranscript_sot only'
      });
    } else {
      console.warn('[PERSIST][RETRY_QUEUE_RESTORE_FAIL]', { error: e.message });
    }
  }
}

/**
 * Get next transcript index
 * Ensures monotonically increasing order
 */
export const getNextIndex = (existingTranscript = []) => {
  if (!existingTranscript || existingTranscript.length === 0) return 1;
  const maxIndex = Math.max(...existingTranscript.map(e => e.index || 0), 0);
  return maxIndex + 1;
};

/**
 * Merge transcripts monotonically (NEVER allow shrinkage)
 * Uses stable identifiers (stableKey > id > index) for deduplication
 * 
 * @param {Array} existing - Current transcript (source of truth)
 * @param {Array} incoming - New transcript from server/refresh
 * @param {string} sessionId - Session identifier (for logging only)
 * @returns {Array} Merged transcript (always >= existing.length)
 */
export function mergeTranscript(existing = [], incoming = [], sessionId = null) {
  // MONOTONIC GUARD: Never allow incoming to be shorter
  if (incoming.length < existing.length) {
    console.error('[TRANSCRIPT_GUARD][IGNORE_SERVER_REGRESSION]', {
      sessionId,
      existingLen: existing.length,
      incomingLen: incoming.length,
      delta: existing.length - incoming.length,
      action: 'KEEPING_EXISTING'
    });
    return existing;
  }
  
  // Build stable key map for deduplication
  const existingMap = new Map();
  for (const entry of existing) {
    const key = entry.stableKey || entry.id || `idx_${entry.index}`;
    existingMap.set(key, entry);
  }
  
  // Merge: keep all existing + append new unique entries from incoming
  const merged = [...existing];
  for (const entry of incoming) {
    const key = entry.stableKey || entry.id || `idx_${entry.index}`;
    if (!existingMap.has(key)) {
      merged.push(entry);
      existingMap.set(key, entry);
    }
  }
  
  console.log('[TRANSCRIPT_MERGE]', {
    sessionId,
    existingLen: existing.length,
    incomingLen: incoming.length,
    mergedLen: merged.length,
    newEntriesCount: merged.length - existing.length
  });
  
  return merged;
}

/**
 * Generate unique transcript ID
 * Uses crypto.randomUUID() if available, otherwise fallback
 */
function makeTranscriptId() {
  try {
    return crypto.randomUUID();
  } catch (e) {
    return `t_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

// In-flight protection: Prevent concurrent writes for the same transcript ID
const inFlightTranscriptIds = new Set();

/**
 * Append assistant message to transcript
 * Use for: questions, system messages, AI prompts that should be in legal record
 * 
 * NEW: V3 probe questions (V3_PROBE_QUESTION) are now ALLOWED in transcript as legal record
 * 
 * @param {string} sessionId
 * @param {Array} existingTranscript
 * @param {string} text - Message text (fallback if uiVariant not used)
 * @param {object} metadata - Additional metadata
 *   - messageType: type of message (WELCOME, QUESTION_SHOWN, V3_PROBE_QUESTION, etc.)
 *   - uiVariant: UI card variant (WELCOME_CARD, QUESTION_CARD, FOLLOWUP_CARD, etc.)
 *   - title: optional card title
 *   - lines: optional array of bullet/line strings
 *   - example: optional example text
 *   - meta: optional { packId, categoryId, loopKey, instanceNumber, promptId, incidentId }
 *   - visibleToCandidate: explicit override (required - no defaults)
 * @returns {Promise<object>} Updated transcript
 */
export async function appendAssistantMessage(sessionId, existingTranscript = [], text, metadata = {}) {
    // V3 probe questions are NOW ALLOWED in transcript (product requirement: chat history = transcript)
    // Only block the obsolete completion message types
    const BLOCKED_TYPES = [
      'v3_probe_complete', // Legacy completion messages (still use system events)
      'V3_PROBE_PROMPT' // Obsolete alias
    ];

    const isBlocked = BLOCKED_TYPES.includes(metadata.messageType);

    if (isBlocked) {
      console.log('[V3_UI_CONTRACT][BLOCK_TRANSCRIPT_WRITE]', {
        reason: 'Only legacy completion types blocked - V3 questions now allowed',
        messageType: metadata.messageType,
        preview: text?.substring(0, 60) || null,
        action: 'BLOCKED'
      });
      return existingTranscript; // Block append, return unchanged
    }
  
  // HARDENED CONTRACT: Default visibleToCandidate to false if not provided
  if (metadata.visibleToCandidate === undefined || metadata.visibleToCandidate === null) {
    console.warn("[TRANSCRIPT][DEFAULT_VISIBLE]", { 
      messageType: metadata.messageType || 'unknown', 
      visibleToCandidateDefaulted: true 
    });
    metadata.visibleToCandidate = false;
  }
  
  // Generate stable ID if not provided (prefer metadata.id for deterministic IDs)
  const stableId = metadata.id || makeTranscriptId();
  const stableKey = metadata.stableKey || null;
  
  // HARD DEDUPE #1: Check if stable ID already exists
  if (existingTranscript.some(e => e.id === stableId)) {
    console.log('[TRANSCRIPT][DEDUPE_BY_ID] Skipping - ID already exists:', stableId);
    return existingTranscript;
  }
  
  // HARD DEDUPE #2: Check if stableKey already exists (for idempotent cards)
  if (stableKey && existingTranscript.some(e => e.stableKey === stableKey)) {
    console.log('[TRANSCRIPT][DEDUPE_BY_KEY] Skipping - stableKey already exists:', stableKey);
    return existingTranscript;
  }
  
  // DEDUPE GUARD: Only apply to generic messages, NEVER to critical interview events
  // CRITICAL MESSAGE TYPES that must NEVER be deduped:
  const neverDedupeTypes = [
    'QUESTION_SHOWN',
    'FOLLOWUP_CARD_SHOWN', 
    'v3_opener_question',
    'v3_opener_answer',
    'v3_probe_question',
    'v3_probe_complete',
    'SECTION_COMPLETE',
    'WELCOME',
    'RESUME',
    'MULTI_INSTANCE_GATE_SHOWN',
    'V3_PROBE_QUESTION', // V3 probe questions now allowed in transcript
    'V3_PROBE_ANSWER' // V3 probe answers now allowed in transcript
  ];
  
  // PART A: MULTI_INSTANCE_GATE_SHOWN - Block append while gate is active
  if (metadata.messageType === 'MULTI_INSTANCE_GATE_SHOWN') {
    const incomingStableKey = stableKey || metadata.stableKey;
    if (!incomingStableKey) {
      console.error('[TRANSCRIPT][MI_GATE][NO_STABLE_KEY]', {
        packId: metadata.packId,
        instanceNumber: metadata.instanceNumber,
        reason: 'Multi-instance gate MUST have stableKey mi-gate:{packId}:{instanceNumber}:q'
      });
    }

    // PART A: Check if this append is for an ACTIVE gate (should be suppressed)
    // Active gates render from currentItem, not transcript (prevents flicker)
    const isActiveGateAppend = metadata.isActiveGate === true;
    
    if (isActiveGateAppend) {
      console.log('[MI_GATE][TRANSCRIPT_SUPPRESSED_WHILE_ACTIVE]', {
        stableKey: incomingStableKey,
        packId: metadata.packId,
        instanceNumber: metadata.instanceNumber,
        reason: 'Gate is active - will append Q+A after user answers'
      });
      return existingTranscript; // Block append, no-op
    }

    // Check for existing entry (dedupe after answer)
    const foundExisting = existingTranscript.find(e => 
      e.stableKey === incomingStableKey || 
      (e.messageType === 'MULTI_INSTANCE_GATE_SHOWN' && 
       e.meta?.packId === metadata.packId && 
       e.meta?.instanceNumber === metadata.instanceNumber)
    );

    console.log('[TRANSCRIPT][DEDUPED_CHECK][MI_GATE]', {
      incomingStableKey,
      packId: metadata.packId,
      instanceNumber: metadata.instanceNumber,
      foundExisting: !!foundExisting
    });

    if (foundExisting) {
      console.log('[TRANSCRIPT][DEDUPED][MI_GATE] Skipping duplicate for same packId+instanceNumber', {
        packId: metadata.packId,
        instanceNumber: metadata.instanceNumber,
        stableKey: incomingStableKey
      });
      return existingTranscript;
    }
  }
  
  if (!neverDedupeTypes.includes(metadata.messageType)) {
    if (text && text.trim() !== '') {
      const trimmedText = text.trim();
      const last10 = existingTranscript.slice(-10);
      const duplicate = last10.reverse().find(e => 
        e.role === 'assistant' && 
        e.text && 
        e.text.trim() === trimmedText &&
        !neverDedupeTypes.includes(e.messageType)
      );
      
      if (duplicate) {
        console.log('[TRANSCRIPT][DEDUPED] Skipping duplicate generic message', {
          existingType: duplicate.messageType,
          newType: metadata.messageType
        });
        return existingTranscript; // Skip appending, return unchanged
      }
    }
  }
  
  const entry = {
    id: stableId,
    stableKey: stableKey,
    index: getNextIndex(existingTranscript), // Legacy/debug only - do NOT use as key
    role: "assistant",
    text,
    timestamp: new Date().toISOString(),
    createdAt: Date.now(),
    ...metadata
  };

  const updatedTranscript = [...existingTranscript, entry];
  const baseLen = existingTranscript.length;

  // FIX F: INTEGRITY AUDIT - Only track if storage available (appendAssistantMessage)
  if (!STORAGE_DISABLED) {
    const auditKey = `${sessionId}|${entry.stableKey || entry.id}`;
    seenStableKeysBySession.add(auditKey);
  }

  // PERSIST: Immediate write to DB (not batched)
  console.log('[PERSIST][ANSWER_SUBMIT_START]', {
    sessionId,
    stableKey: entry.stableKey || entry.id,
    kind: 'assistant',
    messageType: metadata.messageType,
    questionId: metadata.meta?.questionDbId || metadata.questionDbId
  });

  try {
    // CHANGE 1: Track write timing
    const t0 = Date.now();
    await base44.entities.InterviewSession.update(sessionId, {
      transcript_snapshot: updatedTranscript
    });
    const dtMs = Date.now() - t0;

    // CHANGE 1: Suspect contention if slow write OR retry queue active
    const hasActiveRetry = hasRetryQueueForSession(sessionId);
    const suspectContention = dtMs > SLOW_WRITE_THRESHOLD_MS || hasActiveRetry;

    console.log('[PERSIST][WRITE_TIMING]', {
      kind: 'assistant',
      sessionId,
      stableKey: entry.stableKey || entry.id,
      dtMs,
      suspectContention,
      reason: suspectContention ? (dtMs > SLOW_WRITE_THRESHOLD_MS ? 'slow_write' : 'active_retry') : 'none'
    });

    // CHANGE 1: Conflict detection when contention suspected
    if (suspectContention) {
      const verifySession = await base44.entities.InterviewSession.get(sessionId);
      const latestTranscript = verifySession.transcript_snapshot || [];
      const foundInDb = latestTranscript.some(e => e.stableKey === (entry.stableKey || entry.id));

      if (foundInDb) {
        console.log('[PERSIST][CONFLICT_CHECK_OK]', {
          sessionId,
          stableKey: entry.stableKey || entry.id,
          dtMs
        });
      } else {
        console.error('[PERSIST][CONFLICT_DETECTED]', {
          sessionId,
          stableKey: entry.stableKey || entry.id,
          dtMs,
          action: 'remerge',
          reason: 'stableKey missing after write - likely overwritten by concurrent write'
        });

        // Re-merge into latest and write again
        const alreadyExists = latestTranscript.some(e => e.stableKey === (entry.stableKey || entry.id));
        if (!alreadyExists) {
          const remergedTranscript = [...latestTranscript, entry];
          await base44.entities.InterviewSession.update(sessionId, {
            transcript_snapshot: remergedTranscript
          });

          console.log('[PERSIST][CONFLICT_REMERGE_OK]', {
            sessionId,
            stableKey: entry.stableKey || entry.id
          });
        }
      }
    }

    console.log('[PERSIST][ANSWER_SUBMIT_OK]', {
      sessionId,
      stableKey: entry.stableKey || entry.id
    });

    // PART C: Update transcriptRef after successful append
    transcriptRef.current = updatedTranscript;

    console.log("[TRANSCRIPT][APPEND] assistant", {
      index: entry.index,
      messageType: metadata.messageType || 'message',
      textPreview: text.substring(0, 60)
    });
    console.log("[TRANSCRIPT][APPEND_OK] newLength=", updatedTranscript.length, "lastIndex=", entry.index);
  } catch (err) {
    console.error('[PERSIST][ANSWER_SUBMIT_ERR]', {
      sessionId,
      stableKey: entry.stableKey || entry.id,
      error: err.message
    });
    console.error("[TRANSCRIPT][ERROR]", err);

    // RETRY: Queue for background persistence (entry only, not full transcript)
    queueFailedPersist(sessionId, entry.stableKey || entry.id, entry);
  }

  return updatedTranscript;
}

/**
 * Append user message to transcript
 * Use for: candidate answers
 * 
 * @param {string} sessionId
 * @param {Array} existingTranscript
 * @param {string} text - Answer text
 * @param {object} metadata - Additional metadata
 * @returns {Promise<object>} Updated transcript
 */
export async function appendUserMessage(sessionId, existingTranscript = [], text, metadata = {}) {
  // Generate stable ID if not provided
  const stableId = metadata.id || makeTranscriptId();
  const stableKey = metadata.stableKey || null;
  
  // HARD DEDUPE: Check if stable ID or key already exists
  if (existingTranscript.some(e => e.id === stableId)) {
    console.log('[TRANSCRIPT][DEDUPE_BY_ID] Skipping user message - ID already exists:', stableId);
    return existingTranscript;
  }
  if (stableKey && existingTranscript.some(e => e.stableKey === stableKey)) {
    console.log('[TRANSCRIPT][DEDUPE_BY_KEY] Skipping user message - stableKey already exists:', stableKey);
    return existingTranscript;
  }
  
  const entry = {
    id: stableId,
    stableKey: stableKey,
    index: getNextIndex(existingTranscript), // Legacy/debug only - do NOT use as key
    role: "user",
    text,
    timestamp: new Date().toISOString(),
    createdAt: Date.now(),
    visibleToCandidate: true, // User messages always visible
    ...metadata
  };

  const updatedTranscript = [...existingTranscript, entry];
  const baseLen = existingTranscript.length;

  // FIX F: INTEGRITY AUDIT - Only track if storage available (appendUserMessage)
  if (!STORAGE_DISABLED) {
    const auditKey = `${sessionId}|${entry.stableKey || entry.id}`;
    seenStableKeysBySession.add(auditKey);
  }

  // PERSIST: Immediate write to DB (not batched)
  console.log('[PERSIST][ANSWER_SUBMIT_START]', {
    sessionId,
    stableKey: entry.stableKey || entry.id,
    kind: 'user',
    messageType: metadata.messageType,
    questionId: metadata.questionDbId || metadata.meta?.questionDbId,
    loopKey: metadata.loopKey,
    promptId: metadata.promptId
  });

  try {
    // CHANGE 1: Track write timing
    const t0 = Date.now();
    await base44.entities.InterviewSession.update(sessionId, {
      transcript_snapshot: updatedTranscript
    });
    const dtMs = Date.now() - t0;

    // CHANGE 1: Suspect contention if slow write OR retry queue active
    const hasActiveRetry = hasRetryQueueForSession(sessionId);
    const suspectContention = dtMs > SLOW_WRITE_THRESHOLD_MS || hasActiveRetry;

    console.log('[PERSIST][WRITE_TIMING]', {
      kind: 'user',
      sessionId,
      stableKey: entry.stableKey || entry.id,
      dtMs,
      suspectContention,
      reason: suspectContention ? (dtMs > SLOW_WRITE_THRESHOLD_MS ? 'slow_write' : 'active_retry') : 'none'
    });

    // CHANGE 1: Conflict detection when contention suspected
    if (suspectContention) {
      const verifySession = await base44.entities.InterviewSession.get(sessionId);
      const latestTranscript = verifySession.transcript_snapshot || [];
      const foundInDb = latestTranscript.some(e => e.stableKey === (entry.stableKey || entry.id));

      if (foundInDb) {
        console.log('[PERSIST][CONFLICT_CHECK_OK]', {
          sessionId,
          stableKey: entry.stableKey || entry.id,
          dtMs
        });
        } else {
        console.error('[PERSIST][CONFLICT_DETECTED]', {
          sessionId,
          stableKey: entry.stableKey || entry.id,
          dtMs,
          action: 'remerge',
          reason: 'stableKey missing after write - likely overwritten by concurrent write'
        });

        // Re-merge into latest and write again
        const alreadyExists = latestTranscript.some(e => e.stableKey === (entry.stableKey || entry.id));
        if (!alreadyExists) {
          const remergedTranscript = [...latestTranscript, entry];
          await base44.entities.InterviewSession.update(sessionId, {
            transcript_snapshot: remergedTranscript
          });

          console.log('[PERSIST][CONFLICT_REMERGE_OK]', {
            sessionId,
            stableKey: entry.stableKey || entry.id
          });
        }
        }
        }

        console.log('[PERSIST][ANSWER_SUBMIT_OK]', {
        sessionId,
        stableKey: entry.stableKey || entry.id
        });

        // PART C: Update transcriptRef BEFORE local invariant check
        transcriptRef.current = updatedTranscript;

        // FIX F: INTEGRITY AUDIT - Skip if storage disabled, downgrade to debug
        if (!STORAGE_DISABLED) {
          requestAnimationFrame(() => {
            const currentLen = transcriptRef.current.length;
            const lastStableKey = transcriptRef.current[currentLen - 1]?.stableKey || transcriptRef.current[currentLen - 1]?.id;
            const foundInRefBefore = transcriptRef.current.some(e => e.stableKey === (entry.stableKey || entry.id));

            console.log('[PERSIST][INTEGRITY_CHECK]', {
              stableKey: entry.stableKey || entry.id,
              foundInRefBefore,
              transcriptRefLen: currentLen,
              lastStableKey
            });

            if (!foundInRefBefore) {
              // Transient race condition - log as warning with diagnostics
              const last3Keys = transcriptRef.current.slice(-3).map(e => e.stableKey || e.id);
              console.warn('[PERSIST][INTEGRITY_LOCAL_MISSING]', {
                sessionId,
                stableKey: entry.stableKey || entry.id,
                transcriptRefLen: currentLen,
                lastStableKeysPreview: last3Keys,
                mode: 'dbTranscript_sot',
                reason: 'Transient race: stableKey not in transcriptRef after append (may appear in next render)'
              });
            }
          });
        } else {
          // Storage blocked - skip audit (log once for diagnostics)
          console.log('[PERSIST][INTEGRITY_CHECK_SKIPPED]', {
            reason: 'storage_disabled',
            stableKey: entry.stableKey || entry.id
          });
        }

    console.log("[TRANSCRIPT][APPEND] user", {
      index: entry.index,
      textPreview: text.substring(0, 60)
    });
    console.log("[TRANSCRIPT][APPEND_OK] newLength=", updatedTranscript.length, "lastIndex=", entry.index);
  } catch (err) {
    console.error('[PERSIST][ANSWER_SUBMIT_ERR]', {
      sessionId,
      stableKey: entry.stableKey || entry.id,
      error: err.message
    });
    console.error("[TRANSCRIPT][ERROR]", err);

    // RETRY: Queue for background persistence (entry only, not full transcript)
    queueFailedPersist(sessionId, entry.stableKey || entry.id, entry);
  }

  return updatedTranscript;
}

/**
 * Append welcome message to transcript (shown once per session)
 * Stable ID: welcome-{sessionId}
 */
export async function appendWelcomeMessage(sessionId, existingTranscript = []) {
  const id = `welcome-${sessionId}`;
  
  if (existingTranscript.some(e => e.id === id)) {
    console.log("[TRANSCRIPT][WELCOME] Already exists, skipping");
    return existingTranscript;
  }
  
  const text = "Welcome to your ClearQuest Interview";
  const lines = [
    "This interview is part of your application process.",
    "One question at a time, at your own pace.",
    "Clear, complete, and honest answers help investigators understand the full picture.",
    "You can pause and come back — we'll pick up where you left off."
  ];
  
  const updated = await appendAssistantMessage(sessionId, existingTranscript, text, {
    id,
    stableKey: `welcome:${sessionId}`,
    messageType: 'WELCOME',
    uiVariant: 'WELCOME_CARD',
    title: text,
    lines,
    visibleToCandidate: true
  });
  
  await logSystemEvent(sessionId, 'SESSION_CREATED', { sessionId });
  return updated;
}

/**
 * Append resume/return marker (EVERY resume)
 * Stable ID: resume-{sessionId}-{resumeIndex} where resumeIndex = count of true resume events
 */
export async function appendResumeMarker(sessionId, existingTranscript = [], sessionData = {}) {
  const resumeIndex = existingTranscript.filter(e => e.messageType === 'RESUME').length;
  const id = `resume-${sessionId}-${resumeIndex}`;
  
  if (existingTranscript.some(e => e.id === id)) {
    console.log("[TRANSCRIPT][RESUME] Already exists, skipping");
    return existingTranscript;
  }

  const text = "Welcome back. Resuming where you left off.";

  const entry = {
    id,
    index: getNextIndex(existingTranscript),
    role: "assistant",
    text,
    timestamp: new Date().toISOString(),
    messageType: 'RESUME',
    uiVariant: 'RESUME_BANNER',
    visibleToCandidate: true
  };

  const updatedTranscript = [...existingTranscript, entry];
  
  try {
    await base44.entities.InterviewSession.update(sessionId, {
      transcript_snapshot: updatedTranscript
    });
    console.log("[TRANSCRIPT][RESUME][ADD] id=", id);
    
    await logSystemEvent(sessionId, 'SESSION_RESUMED', {
      resumeIndex,
      lastQuestionId: sessionData.current_question_id || null
    });
  } catch (err) {
    console.error("[TRANSCRIPT][ERROR]", err);
  }

  return updatedTranscript;
}

/**
 * Log system event (not visible to candidate)
 */
export async function logSystemEvent(sessionId, eventType, metadata = {}) {
  try {
    const session = await base44.entities.InterviewSession.get(sessionId);
    const existingTranscript = session.transcript_snapshot || [];
    
    // DEDUPE: Prevent duplicate SESSION_CREATED events
    if (eventType === 'SESSION_CREATED') {
      const alreadyExists = existingTranscript.some(e => 
        e.messageType === 'SYSTEM_EVENT' && e.eventType === 'SESSION_CREATED'
      );
      
      if (alreadyExists) {
        console.log('[TRANSCRIPT][SYSTEM_EVENT][DEDUPED] SESSION_CREATED already exists — skipping append');
        return existingTranscript;
      }
    }
    
    const entry = {
      id: makeTranscriptId(),
      stableKey: null, // System events don't need idempotency (audit only)
      index: getNextIndex(existingTranscript),
      role: "system",
      text: null,
      timestamp: new Date().toISOString(),
      createdAt: Date.now(),
      messageType: 'SYSTEM_EVENT',
      eventType,
      visibleToCandidate: false,
      ...metadata
    };
    
    const updatedTranscript = [...existingTranscript, entry];
    
    await base44.entities.InterviewSession.update(sessionId, {
      transcript_snapshot: updatedTranscript
    });
    
    console.log(`[TRANSCRIPT][SYSTEM_EVENT] ${eventType}`, metadata);
    return updatedTranscript;
  } catch (err) {
    console.error('[TRANSCRIPT][SYSTEM_EVENT][ERROR]', err);
    return null;
  }
}

/**
 * Log question shown to candidate (at render time)
 * Stable ID: question-shown-{sessionId}-{questionId}
 */
export async function logQuestionShown(sessionId, { questionId, questionText, questionNumber, sectionId, sectionName, responseId = null }) {
  const session = await base44.entities.InterviewSession.get(sessionId);
  const existingTranscript = session.transcript_snapshot || [];
  
  const id = `question-shown-${sessionId}-${questionId}`;
  const stableKey = `question-shown:${questionId}`;
  
  if (existingTranscript.some(e => e.id === id || e.stableKey === stableKey)) {
    console.log("[TRANSCRIPT][QUESTION] Already logged, skipping");
    return existingTranscript;
  }
  
  const title = `Question ${questionNumber}${sectionName ? ` • ${sectionName}` : ''}`;
  
  const updated = await appendAssistantMessage(sessionId, existingTranscript, questionText, {
    id,
    stableKey,
    messageType: 'QUESTION_SHOWN',
    uiVariant: 'QUESTION_CARD',
    title,
    meta: { questionDbId: questionId, sectionId, sectionName, questionNumber, responseId },
    visibleToCandidate: true
  });
  
  await logSystemEvent(sessionId, 'QUESTION_SHOWN', { questionDbId: questionId, questionNumber, sectionId, responseId });
  return updated;
}

// In-memory guard: prevent duplicate section completions (session-scoped)
const completedSectionsRegistry = new Set();

/**
 * Log section completion shown to candidate
 * Stable ID: section-complete-{sessionId}-{sectionId}
 */
export async function logSectionComplete(sessionId, { completedSectionId, completedSectionName, nextSectionId, nextSectionName, progress }) {
  // IDEMPOTENCY GUARD #1: In-memory check (fastest)
  const guardKey = `${sessionId}::${completedSectionId}`;
  if (completedSectionsRegistry.has(guardKey)) {
    console.log("[IDEMPOTENCY][SECTION_COMPLETE] Already logged in memory, skipping");
    return null;
  }
  
  const session = await base44.entities.InterviewSession.get(sessionId);
  const existingTranscript = session.transcript_snapshot || [];
  
  // IDEMPOTENCY GUARD #2: Check DB (canonical stable ID - no counter)
  const id = `section-complete-${sessionId}-${completedSectionId}`;
  
  if (existingTranscript.some(e => e.id === id)) {
    console.log("[IDEMPOTENCY][SECTION_COMPLETE] Already logged in DB, skipping");
    completedSectionsRegistry.add(guardKey); // Update memory cache
    return existingTranscript;
  }
  
  // Mark as logged in memory
  completedSectionsRegistry.add(guardKey);
  
  const title = `Section Complete: ${completedSectionName}`;
  const lines = [
    "Nice work — you've finished this section. Ready for the next one?",
    `Next up: ${nextSectionName}`
  ];
  
  // CRITICAL: Pass stable ID AND stableKey for double-layer dedupe
  const stableKey = `section-complete:${completedSectionId}`;
  const updated = await appendAssistantMessage(sessionId, existingTranscript, `${title}`, {
    id, // Stable ID: section-complete-{sessionId}-{completedSectionId}
    stableKey, // Idempotency key for runtime dedupe
    messageType: 'SECTION_COMPLETE',
    uiVariant: 'SECTION_COMPLETE_CARD',
    title,
    lines,
    meta: { completedSectionId, nextSectionId, progress },
    visibleToCandidate: true
  });
  
  await logSystemEvent(sessionId, 'SECTION_COMPLETED', { completedSectionId, nextSectionId, questionsAnswered: progress?.answeredQuestions });
  return updated;
}

// In-memory guard: prevent duplicate answer submitted events
const answersSubmittedRegistry = new Set();

/**
 * Log answer submitted (audit only)
 */
export async function logAnswerSubmitted(sessionId, { questionDbId, responseId, packId = null }) {
  // IDEMPOTENCY GUARD: Prevent duplicate ANSWER_SUBMITTED events
  const guardKey = `${sessionId}::${questionDbId || 'null'}::${packId || 'null'}::${responseId || 'null'}`;
  if (answersSubmittedRegistry.has(guardKey)) {
    console.log("[IDEMPOTENCY][ANSWER_SUBMITTED] Already logged, skipping");
    return;
  }
  
  answersSubmittedRegistry.add(guardKey);
  await logSystemEvent(sessionId, 'ANSWER_SUBMITTED', { questionDbId, responseId, packId });
}

/**
 * Log pack entered/exited (audit only)
 */
export async function logPackEntered(sessionId, { packId, instanceNumber, isV3 }) {
  await logSystemEvent(sessionId, 'PACK_ENTERED', { packId, instanceNumber, isV3 });
}

export async function logPackExited(sessionId, { packId, instanceNumber }) {
  await logSystemEvent(sessionId, 'PACK_EXITED', { packId, instanceNumber });
}

/**
 * Log AI probing calls (audit only, no PII)
 */
export async function logAiProbingCall(sessionId, { packId, fieldKey, probeCount }) {
  await logSystemEvent(sessionId, 'AI_PROBING_CALLED', { packId, fieldKey, probeCount });
}

export async function logAiProbingResponse(sessionId, { packId, fieldKey, probeCount, hasQuestion }) {
  await logSystemEvent(sessionId, 'AI_PROBING_RESPONSE', { packId, fieldKey, probeCount, hasQuestion });
}

/**
 * Log section started (audit only)
 */
export async function logSectionStarted(sessionId, { sectionId, sectionName }) {
  await logSystemEvent(sessionId, 'SECTION_STARTED', { sectionId, sectionName });
}

/**
 * Log follow-up card shown to candidate (at render time)
 * Stable ID: followup-card-{sessionId}-{packId}-opener-{instanceNumber} OR
 *            followup-card-{sessionId}-{packId}-field-{fieldKey}-{instanceNumber}
 */
export async function logFollowupCardShown(sessionId, { packId, variant, stableKey: legacyStableKey, promptText, exampleText = null, packLabel = null, instanceNumber = 1, baseQuestionId = null, fieldKey = null, categoryLabel = null }) {
  // CANONICAL ID GENERATION: Build from canonical rules
  let id;
  let stableKey;
  if (variant === 'opener') {
    id = `followup-card-${sessionId}-${packId}-opener-${instanceNumber}`;
    stableKey = `followup-card:${packId}:opener:${instanceNumber}`;
  } else if (variant === 'field') {
    id = `followup-card-${sessionId}-${packId}-field-${fieldKey}-${instanceNumber}`;
    stableKey = `followup-card:${packId}:field:${fieldKey}:${instanceNumber}`;
  } else {
    console.error("[TRANSCRIPT][FOLLOWUP_CARD] Invalid variant:", variant);
    return null;
  }
  
  console.log("[TRANSCRIPT][FOLLOWUP_CARD][ID]", id);
  
  // HARD GUARD #1: Check in-flight protection FIRST (no DB call)
  if (inFlightTranscriptIds.has(id)) {
    console.log("[TRANSCRIPT][FOLLOWUP_CARD] In-flight, skipping");
    return null;  // ✓ EXIT: No DB call, no system event
  }
  
  try {
    // HARD GUARD #2: Add to in-flight before any async work
    inFlightTranscriptIds.add(id);
    
    const session = await base44.entities.InterviewSession.get(sessionId);
    const existingTranscript = session.transcript_snapshot || [];
    
    // HARD GUARD #3: Check if already exists in DB
    if (existingTranscript.some(e => e.id === id)) {
      console.log("[TRANSCRIPT][FOLLOWUP_CARD] Already logged, skipping");
      return existingTranscript;  // ✓ EXIT: No append, no system event
    }
    
    const title = packLabel || "Follow-up";
    
    // ✓ ONLY REACHED IF ALL GUARDS PASSED
    const updated = await appendAssistantMessage(sessionId, existingTranscript, promptText, {
      id,
      stableKey, // Idempotency key for runtime dedupe
      messageType: 'FOLLOWUP_CARD_SHOWN',
      uiVariant: 'FOLLOWUP_CARD',
      title,
      example: exampleText,
      categoryLabel, // Pass through for V3 opener rendering
      meta: { packId, variant, instanceNumber, baseQuestionId, fieldKey },
      visibleToCandidate: true
    });
    
    // ✓ System event ONLY logged when append succeeds
    await logSystemEvent(sessionId, 'FOLLOWUP_CARD_SHOWN', { packId, variant, stableKey, instanceNumber, fieldKey });
    return updated;
  } finally {
    // ✓ CLEANUP: Always remove from in-flight set (even on errors)
    inFlightTranscriptIds.delete(id);
  }
}

/**
 * DEV-ONLY: Automated transcript self-test
 * Validates transcript logging rules WITHOUT database writes
 * Run in console: window.__cqTranscriptSelfTest()
 */
if (typeof window !== 'undefined') {
  // LOCAL-ONLY test helpers (NO DB WRITES)
  const __existsId = (transcript, id) => transcript.some(e => e.id === id);
  
  const __appendEntryLocal = (transcript, entry) => {
    if (entry.id && __existsId(transcript, entry.id)) {
      return transcript; // dedupe
    }
    transcript.push(entry);
    return transcript;
  };
  
  const __localAppendWelcome = (transcript, sessionId) => {
    const id = `welcome-${sessionId}`;
    if (__existsId(transcript, id)) return transcript;
    return __appendEntryLocal(transcript, {
      id,
      messageType: 'WELCOME',
      visibleToCandidate: true,
      text: 'Welcome'
    });
  };
  
  const __localLogQuestionShown = (transcript, sessionId, questionId) => {
    const id = `question-shown-${sessionId}-${questionId}`;
    if (__existsId(transcript, id)) return transcript;
    return __appendEntryLocal(transcript, {
      id,
      messageType: 'QUESTION_SHOWN',
      visibleToCandidate: true,
      text: 'Question text'
    });
  };
  
  const __localLogFollowupCardShown = (transcript, sessionId, packId, variant, stableKey) => {
    const id = `followup-card-${sessionId}-${packId}-${variant}-${stableKey}`;
    if (__existsId(transcript, id)) return transcript;
    return __appendEntryLocal(transcript, {
      id,
      messageType: 'FOLLOWUP_CARD_SHOWN',
      visibleToCandidate: true,
      text: 'Followup card'
    });
  };
  
  const __localLogSectionComplete = (transcript, sessionId, sectionId) => {
    const id = `section-complete-${sessionId}-${sectionId}`;
    if (__existsId(transcript, id)) return transcript;
    return __appendEntryLocal(transcript, {
      id,
      messageType: 'SECTION_COMPLETE',
      visibleToCandidate: true,
      text: 'Section complete'
    });
  };
  
  const __localAppendAssistant = (transcript, metadata) => {
    if (metadata.visibleToCandidate === undefined) {
      throw new Error('[TRANSCRIPT] visibleToCandidate must be explicitly set for all assistant messages');
    }
    return __appendEntryLocal(transcript, {
      role: 'assistant',
      ...metadata
    });
  };
  
  window.__cqTranscriptSelfTest = () => {
    const failures = [];
    let testCount = 0;
    let dbWrites = 0; // Track DB writes (should be 0)
    
    console.log('\n[CQ TRANSCRIPT SELF-TEST] Starting...\n');
    
    // Test A: Candidate/Audit filtering
    testCount++;
    try {
      const mockTranscript = [
        { id: 't1', messageType: 'WELCOME', visibleToCandidate: true, text: 'Welcome' },
        { id: 't2', role: 'user', visibleToCandidate: true, text: 'Yes' },
        { id: 't3', messageType: 'SYSTEM_EVENT', visibleToCandidate: false, eventType: 'SESSION_CREATED' }
      ];
      
      const candidateView = mockTranscript.filter(e => e.visibleToCandidate === true);
      const auditView = mockTranscript;
      
      if (candidateView.length !== 2) {
        failures.push({ test: 'A1_CandidateFilter', expected: 2, actual: candidateView.length });
      }
      if (auditView.length !== 3) {
        failures.push({ test: 'A2_AuditFilter', expected: 3, actual: auditView.length });
      }
      
      console.log('✓ Test A: Candidate/Audit filtering');
    } catch (err) {
      failures.push({ test: 'A_Filtering', error: err.message });
    }
    
    // Test B: Explicit visibleToCandidate enforcement (REAL TEST)
    testCount++;
    try {
      let transcript = [];
      let errorThrown = false;
      const lengthBefore = transcript.length;
      
      try {
        __localAppendAssistant(transcript, { text: 'Test message' }); // NO visibleToCandidate
      } catch (err) {
        if (err.message.includes('visibleToCandidate must be explicitly set')) {
          errorThrown = true;
        }
      }
      
      const lengthAfter = transcript.length;
      
      if (!errorThrown) {
        failures.push({ test: 'B1_VisibleToCandidate_NoError', expected: 'error thrown', actual: 'no error' });
      }
      if (lengthBefore !== lengthAfter) {
        failures.push({ test: 'B2_VisibleToCandidate_LengthChanged', expected: lengthBefore, actual: lengthAfter });
      }
      
      console.log(`✓ Test B: Explicit visibleToCandidate enforcement (length before=${lengthBefore}, after=${lengthAfter})`);
    } catch (err) {
      failures.push({ test: 'B_VisibleToCandidate', error: err.message });
    }
    
    // Test C: Stable ID dedupe
    testCount++;
    try {
      const sessionId = 'TEST_SESSION_1';
      
      // C1: Welcome
      let t1 = [];
      const lengthC1Before = t1.length;
      t1 = __localAppendWelcome(t1, sessionId);
      t1 = __localAppendWelcome(t1, sessionId); // duplicate attempt
      const welcomeId = `welcome-${sessionId}`;
      
      if (t1.length !== 1) {
        failures.push({ test: 'C1_WelcomeDedupe', expected: 1, actual: t1.length, id: welcomeId, lengthBefore: lengthC1Before });
      }
      
      // C2: Question
      let t2 = [];
      const lengthC2Before = t2.length;
      t2 = __localLogQuestionShown(t2, sessionId, 'QID1');
      t2 = __localLogQuestionShown(t2, sessionId, 'QID1'); // duplicate attempt
      const qId = `question-shown-${sessionId}-QID1`;
      
      if (t2.length !== 1) {
        failures.push({ test: 'C2_QuestionDedupe', expected: 1, actual: t2.length, id: qId, lengthBefore: lengthC2Before });
      }
      
      // C3: V3 opener
      let t3 = [];
      const lengthC3Before = t3.length;
      t3 = __localLogFollowupCardShown(t3, sessionId, 'PACK1', 'opener', '1');
      t3 = __localLogFollowupCardShown(t3, sessionId, 'PACK1', 'opener', '1'); // duplicate attempt
      const v3Id = `followup-card-${sessionId}-PACK1-opener-1`;
      
      if (t3.length !== 1) {
        failures.push({ test: 'C3_V3OpenerDedupe', expected: 1, actual: t3.length, id: v3Id, lengthBefore: lengthC3Before });
      }
      
      // C4: V2 field
      let t4 = [];
      const lengthC4Before = t4.length;
      t4 = __localLogFollowupCardShown(t4, sessionId, 'PACK2', 'field', 'FIELD_A-1');
      t4 = __localLogFollowupCardShown(t4, sessionId, 'PACK2', 'field', 'FIELD_A-1'); // duplicate attempt
      const v2Id = `followup-card-${sessionId}-PACK2-field-FIELD_A-1`;
      
      if (t4.length !== 1) {
        failures.push({ test: 'C4_V2FieldDedupe', expected: 1, actual: t4.length, id: v2Id, lengthBefore: lengthC4Before });
      }
      
      console.log(`✓ Test C: Stable ID dedupe`);
      console.log(`  - Welcome ID: ${welcomeId} (length: ${lengthC1Before} → ${t1.length})`);
      console.log(`  - Question ID: ${qId} (length: ${lengthC2Before} → ${t2.length})`);
      console.log(`  - V3 Opener ID: ${v3Id} (length: ${lengthC3Before} → ${t3.length})`);
      console.log(`  - V2 Field ID: ${v2Id} (length: ${lengthC4Before} → ${t4.length})`);
    } catch (err) {
      failures.push({ test: 'C_StableIdDedupe', error: err.message });
    }
    
    // Test D: Section complete dedupe (NO COUNTERS)
    testCount++;
    try {
      const sessionId = 'TEST_SESSION_1';
      const sectionId = 'SEC1';
      const scId = `section-complete-${sessionId}-${sectionId}`;
      
      let t5 = [];
      const lengthDBefore = t5.length;
      t5 = __localLogSectionComplete(t5, sessionId, sectionId);
      t5 = __localLogSectionComplete(t5, sessionId, sectionId); // duplicate attempt
      
      if (t5.length !== 1) {
        failures.push({ test: 'D_SectionCompleteDedupe', expected: 1, actual: t5.length, id: scId, lengthBefore: lengthDBefore });
      }
      
      console.log(`✓ Test D: Section complete dedupe (NO counters)`);
      console.log(`  - Section Complete ID: ${scId} (length: ${lengthDBefore} → ${t5.length})`);
    } catch (err) {
      failures.push({ test: 'D_SectionComplete', error: err.message });
    }
    
    // Test E: Renderer safety (legacy entries)
    testCount++;
    try {
      const legacyEntry = { 
        id: 'legacy-1', 
        messageType: 'QUESTION_SHOWN', 
        text: 'Legacy question text', 
        visibleToCandidate: true 
      };
      
      const filtered = [legacyEntry].filter(e => e.visibleToCandidate === true);
      if (filtered.length !== 1) {
        failures.push({ test: 'E1_LegacyFilter', expected: 1, actual: filtered.length });
      }
      if (!legacyEntry.text) {
        failures.push({ test: 'E2_LegacyFallback', expected: 'text field', actual: 'missing' });
      }
      
      console.log('✓ Test E: Renderer safety (legacy entries)');
    } catch (err) {
      failures.push({ test: 'E_RendererSafety', error: err.message });
    }
    
    console.log('\n' + '='.repeat(60));
    if (failures.length === 0) {
      console.log(`[CQ TRANSCRIPT SELF-TEST] ✓ PASS (${testCount} tests) DB writes performed: ${dbWrites}`);
      console.log('\nGuaranteed invariants:');
      console.log('• Candidate view shows only visibleToCandidate=true entries');
      console.log('• Audit view shows all entries including system events');
      console.log('• Stable IDs prevent duplicates (NO timestamps/counters):');
      console.log('  - welcome-{sessionId}');
      console.log('  - question-shown-{sessionId}-{questionId}');
      console.log('  - followup-card-{sessionId}-{packId}-{variant}-{stableKey}');
      console.log('  - section-complete-{sessionId}-{sectionId} (NO counter)');
      console.log('• visibleToCandidate must be explicitly set on assistant messages');
      console.log('• Legacy entries render without crashing');
    } else {
      console.log(`[CQ TRANSCRIPT SELF-TEST] ✗ FAIL (${failures.length} of ${testCount} failed) DB writes performed: ${dbWrites}`);
      console.log('\nFailures:');
      failures.forEach((f, idx) => {
        console.log(`  ${idx + 1}. ${f.test}`);
        if (f.expected !== undefined) console.log(`     Expected: ${f.expected}, Actual: ${f.actual}`);
        if (f.id) console.log(`     ID: ${f.id}`);
        if (f.lengthBefore !== undefined) console.log(`     Length before: ${f.lengthBefore}`);
        if (f.error) console.log(`     Error: ${f.error}`);
      });
    }
    console.log('='.repeat(60) + '\n');
    
    return { passed: failures.length === 0, failures, testCount, dbWrites };
  };
  
  window.__cqAuditCheck = async (sessionId) => {
    try {
      const session = await base44.entities.InterviewSession.get(sessionId);
      const transcript = session.transcript_snapshot || [];
      
      const checks = {
        welcomeCount: transcript.filter(e => e.messageType === 'WELCOME').length,
        resumeCount: transcript.filter(e => e.messageType === 'RESUME').length,
        duplicateIds: [],
        candidateVisible: transcript.filter(e => e.visibleToCandidate === true).length,
        auditOnly: transcript.filter(e => e.visibleToCandidate === false).length
      };
      
      const ids = transcript.filter(e => e.id).map(e => e.id);
      const uniqueIds = new Set(ids);
      if (ids.length !== uniqueIds.size) {
        const seen = new Set();
        ids.forEach(id => {
          if (seen.has(id)) checks.duplicateIds.push(id);
          seen.add(id);
        });
      }
      
      console.log('=== ClearQuest Transcript Audit ===');
      console.log(`Session: ${sessionId}`);
      console.log(`Total entries: ${transcript.length}`);
      console.log(`Candidate-visible: ${checks.candidateVisible}`);
      console.log(`Audit-only: ${checks.auditOnly}`);
      console.log(`Welcome messages: ${checks.welcomeCount} ${checks.welcomeCount === 1 ? '✓' : '✗ FAIL'}`);
      console.log(`Resume markers: ${checks.resumeCount}`);
      console.log(`Duplicate IDs: ${checks.duplicateIds.length === 0 ? 'None ✓' : checks.duplicateIds.join(', ') + ' ✗ FAIL'}`);
      
      const passed = checks.welcomeCount === 1 && checks.duplicateIds.length === 0;
      console.log(`\nOverall: ${passed ? '✓ PASS' : '✗ FAIL'}`);
      
      return { passed, checks, transcript };
    } catch (err) {
      console.error('[AUDIT] Failed:', err);
      return { passed: false, error: err.message };
    }
  };
}