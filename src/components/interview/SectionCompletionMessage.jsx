import React, { useEffect } from "react";
import { CheckCircle2 } from "lucide-react";

export default function SectionCompletionMessage({ 
  sectionName,
  nextSectionName,
  isHeavy, 
  isLong, 
  hadIncidents,
  onDismiss 
}) {
  return (
    <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5 opacity-85">
      <div className="flex items-start gap-3">
        <div className="w-7 h-7 rounded-full bg-green-600/20 flex items-center justify-center flex-shrink-0">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-sm font-semibold text-green-400">Section Complete</span>
          </div>
          <p className="text-white leading-relaxed">
            You've completed <strong>{sectionName}</strong> and are now moving to <strong>{nextSectionName}</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}