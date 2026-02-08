import React from "react";
import { Button } from "@/components/ui/button";
import { Pause } from "lucide-react";

/**
 * InterviewHeader - Dumb presentational component for the interview header
 * No hooks, no side effects, no API calls - just renders JSX from props
 */
export function InterviewHeader({
  department,
  sections,
  activeSection,
  currentSectionIndex,
  questionCompletionPct,
  onPauseClick,
}) {
  return (
    <header className="bg-slate-800/95 backdrop-blur-sm border-b border-slate-700 px-4 py-3 flex-shrink-0">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-white">ClearQuest Interview</h1>
            {department && (
              <>
                <span className="text-slate-600 hidden sm:inline">•</span>
                <span className="text-xs text-slate-200 hidden sm:inline">{department.department_name}</span>
              </>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onPauseClick}
            className="bg-slate-700/50 border-slate-600 text-slate-200"
          >
            <Pause className="w-4 h-4 mr-1" />
            Pause
          </Button>
        </div>

        {sections.length > 0 && activeSection && (
          <div>
            <div className="text-sm font-medium text-blue-400 mb-1">
              {activeSection.displayName}
            </div>
            <div className="w-full h-2 bg-slate-700/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all"
                style={{
                  width: `${questionCompletionPct}%`,
                  boxShadow: questionCompletionPct > 0 ? '0 0 8px rgba(59, 130, 246, 0.5)' : 'none'
                }}
              />
            </div>
            <div className="flex justify-between items-center mt-1">
              <span className="text-xs text-slate-400">
                Section {currentSectionIndex + 1} of {sections.length}
              </span>
              <span className="text-xs font-medium text-blue-400">{questionCompletionPct}% complete</span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}