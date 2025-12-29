import React from "react";
import { Button } from "@/components/ui/button";

/**
 * YesNoControls - SINGLE SOURCE OF TRUTH for Yes/No buttons
 * 
 * UI CONTRACT ENFORCEMENT:
 * - renderContext="FOOTER": Renders interactive buttons (ONLY valid context)
 * - renderContext="TRANSCRIPT": Returns null (transcript is read-only)
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

  // FOOTER CONTEXT: Render interactive buttons
  return (
    <div className="flex gap-3 w-full">
      <Button
        onClick={onYes}
        disabled={disabled}
        className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-6 text-lg"
      >
        {yesLabel}
      </Button>
      <Button
        onClick={onNo}
        disabled={disabled}
        className="flex-1 bg-slate-600 hover:bg-slate-700 text-white font-medium py-6 text-lg"
      >
        {noLabel}
      </Button>
    </div>
  );
}