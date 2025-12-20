import { useEffect, useRef } from "react";

/**
 * BottomBarAutoFocusGuard
 * 
 * Headless component (returns null) that manages auto-focus for bottom bar input.
 * Hooks are called unconditionally on every render (safe hook order).
 * Focus logic guarded by props inside effect body (safe).
 */
export default function BottomBarAutoFocusGuard({
  enabled,
  shouldFocus,
  focusKey,
  isUserTyping,
  inputRef,
  bottomBarMode,
  effectiveItemType,
  v3ProbingActive,
  hasPrompt
}) {
  const lastFocusKeyRef = useRef(null);

  useEffect(() => {
    // Guard: Skip if not enabled
    if (!enabled) return;
    
    // Guard: Skip if typing lock active
    if (isUserTyping) return;
    
    // Guard: Skip if should not focus
    if (!shouldFocus) return;
    
    // Guard: Skip if input ref not available
    if (!inputRef?.current) return;
    
    // Prevent redundant focus (only focus when key changes)
    if (lastFocusKeyRef.current === focusKey) {
      return;
    }
    
    // Log focus attempt
    const focusReason = v3ProbingActive ? 'v3_probe_ready' : 
                       effectiveItemType === 'v3_pack_opener' ? 'opener_ready' :
                       hasPrompt ? 'prompt_ready' : 'key_change';
    
    console.log('[BOTTOM_BAR_FOCUS]', {
      didFocus: 'pending',
      reason: focusReason,
      bottomBarMode,
      effectiveItemType,
      v3ProbingActive,
      hasPrompt,
      focusKey
    });
    
    // Defer focus until DOM updates complete
    const focusTimer = setTimeout(() => {
      if (!inputRef?.current) {
        console.log('[BOTTOM_BAR_FOCUS]', { didFocus: false, reason: 'inputRef null' });
        return;
      }
      
      try {
        inputRef.current.focus();
        
        // Put cursor at end (works on desktop + mobile)
        if (inputRef.current.setSelectionRange) {
          const len = inputRef.current.value?.length || 0;
          inputRef.current.setSelectionRange(len, len);
        }
        
        console.log('[BOTTOM_BAR_FOCUS]', {
          didFocus: true,
          reason: focusReason,
          bottomBarMode,
          effectiveItemType,
          v3ProbingActive,
          focusKey
        });
        
        lastFocusKeyRef.current = focusKey;
      } catch (err) {
        console.log('[BOTTOM_BAR_FOCUS]', {
          didFocus: false,
          reason: 'focus error',
          error: err.message
        });
      }
    }, 0);
    
    return () => clearTimeout(focusTimer);
  }, [enabled, shouldFocus, focusKey, isUserTyping, inputRef, bottomBarMode, effectiveItemType, v3ProbingActive, hasPrompt]);

  return null;
}