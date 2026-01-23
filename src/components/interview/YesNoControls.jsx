import React from "react";
import { Button } from "@/components/ui/button";

// BUILD FINGERPRINT (always-on)
try {
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.setAttribute('data-cq-build-yesno', 'YESNO_FIXED_2026-01-23T00:00:00Z');
  }
} catch (_) {}

// BUNDLE CANARY: Detect stale bundle + multiple React instances
if (typeof window !== 'undefined') {
  const canaryEnabled = window.CQ_BUNDLE_CANARY === true || 
                       (typeof localStorage !== 'undefined' && localStorage.getItem('CQ_BUNDLE_CANARY') === '1');
  
  if (canaryEnabled) {
    console.error('[CQ_BUNDLE_CANARY][ARMED]', { file: 'YesNoControls.jsx', enabled: true });
    
    // Canary breadcrumb (non-console)
    try {
      window.__CQ_CANARY_HIT__ = Array.isArray(window.__CQ_CANARY_HIT__) ? window.__CQ_CANARY_HIT__ : [];
      window.__CQ_CANARY_HIT__.push({ file: 'YesNoControls.jsx', ts: Date.now(), buildStamp: 'YESNO_FIXED_2026-01-23T00:00:00Z' });
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.setAttribute('data-cq-canary-yesno', 'YESNO_FIXED_2026-01-23T00:00:00Z');
      }
    } catch (_) {}
    
    const reactVer = React?.version || 'unknown';
    const buildStamp = 'YESNO_FIXED_2026-01-23T00:00:00Z';
    
    console.error('[CQ_BUNDLE_CANARY][YESNO]', {
      buildStamp,
      reactVer,
      hookOrderFixed: true,
      fileLoaded: true
    });
    
    // Multi-React detector
    if (typeof window.CQ_REACT_VER !== 'undefined' && window.CQ_REACT_VER !== reactVer) {
      console.error('[CQ_MULTI_REACT_DETECTED]', {
        existing: window.CQ_REACT_VER,
        incoming: reactVer,
        file: 'YesNoControls.jsx'
      });
    } else {
      window.CQ_REACT_VER = reactVer;
    }
  }
}

/**
 * YesNoControls - SINGLE SOURCE OF TRUTH for Yes/No buttons
 * 
 * UI CONTRACT ENFORCEMENT:
 * - renderContext="FOOTER": Renders interactive buttons (ONLY valid context)
 * - renderContext="TRANSCRIPT": Returns null (transcript is read-only)
 * - STYLE LOCK: Always neutral colors, "Yes"/"No" labels (never red/green Y/N)
 * 
 * This component is the ONLY place Yes/No buttons can render in the app.
 */
export default function YesNoControls({
  renderContext,
  onYes,
  onNo,
  yesLabel = "Yes",
  noLabel = "No",
  disabled = false,
  debugMeta = null
}) {
  // UI CONTRACT ENFORCEMENT: Hard boundary - transcript NEVER renders controls
  if (renderContext === "TRANSCRIPT") {
    // Minimal guard log only if caller attempted render from transcript
    if (debugMeta) {
      console.log('[UI_CONTRACT][YESNO_SUPPRESSED_IN_TRANSCRIPT]', {
        ...debugMeta,
        renderContext,
        action: 'SUPPRESSED'
      });
    }
    return null;
  }

  // UI CONTRACT VIOLATION: Detect invalid render context
  if (renderContext !== "FOOTER") {
    console.error('[UI_CONTRACT][VIOLATION][INVALID_RENDER_CONTEXT]', {
      renderContext,
      expected: 'FOOTER or TRANSCRIPT',
      debugMeta
    });
    return null;
  }

  // STYLE LOCK: Hard-override to prevent legacy styling
  const lockedYesLabel = "Yes";
  const lockedNoLabel = "No";
  
  // Mount-time diagnostic (once per component instance)
  const loggedRef = React.useRef(false);
  React.useEffect(() => {
    if (!loggedRef.current) {
      console.log('[UI_CONTRACT][YESNO_STYLE_LOCK]', {
        labels: `${lockedYesLabel}/${lockedNoLabel}`,
        colors: 'neutral (slate-700)',
        legacyDisabled: true,
        reason: 'Modern neutral disclosure model - no red/green Y/N ever'
      });
      loggedRef.current = true;
    }
  }, []);

  // FOOTER CONTEXT: Render interactive buttons
  // DESIGN: Neutral disclosure model (legal/investigative context)
  // Both buttons use same neutral color - no semantic green/red meaning
  // LOCKED STYLING: Always neutral slate-700 (never red/green), always "Yes"/"No" labels
  return (
    <div className="flex gap-3 w-full">
      <Button
        onClick={onYes}
        disabled={disabled}
        className="flex-1 bg-slate-700 hover:bg-slate-600 active:bg-slate-800 focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 focus:ring-offset-slate-900 text-white font-medium py-6 text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {lockedYesLabel}
      </Button>
      <Button
        onClick={onNo}
        disabled={disabled}
        className="flex-1 bg-slate-700 hover:bg-slate-600 active:bg-slate-800 focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 focus:ring-offset-slate-900 text-white font-medium py-6 text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {lockedNoLabel}
      </Button>
    </div>
  );
}