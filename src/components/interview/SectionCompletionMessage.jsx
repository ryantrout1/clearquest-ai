import React, { useEffect } from "react";
import { CheckCircle2 } from "lucide-react";

export default function SectionCompletionMessage({ 
  sectionName, 
  isHeavy, 
  isLong, 
  hadIncidents,
  onDismiss 
}) {
  // Auto-dismiss after first render
  useEffect(() => {
    if (onDismiss) {
      const timer = setTimeout(onDismiss, 100);
      return () => clearTimeout(timer);
    }
  }, [onDismiss]);

  // Choose message text based on section characteristics
  const getMessage = () => {
    if (isHeavy && hadIncidents) {
      return (
        <>
          <strong>Section complete:</strong> You've finished the questions about <strong>{sectionName}</strong>. 
          Thank you for your honesty — clear, complete answers help investigators understand the full picture.
        </>
      );
    }
    
    if (isHeavy && !hadIncidents) {
      return (
        <>
          <strong>Section complete:</strong> You've finished the questions about <strong>{sectionName}</strong>. 
          We'll move on to the next area of your background.
        </>
      );
    }
    
    if (isLong) {
      return (
        <>
          <strong>Nice work — that was a longer section.</strong> You've finished the questions about <strong>{sectionName}</strong>. 
          Take a breath if you need to, then continue when you're ready.
        </>
      );
    }
    
    // Default
    return (
      <>
        <strong>Section complete:</strong> You've finished the questions about <strong>{sectionName}</strong>. 
        We'll now move into a new topic. Please continue answering as accurately as you can.
      </>
    );
  };

  return (
    <div className="flex justify-center my-3">
      <div className="bg-emerald-950/40 border border-emerald-700/60 rounded-xl px-5 py-3 max-w-2xl">
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-emerald-600/20 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-emerald-100 text-sm leading-relaxed">
            {getMessage()}
          </p>
        </div>
      </div>
    </div>
  );
}