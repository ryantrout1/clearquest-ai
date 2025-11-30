import React from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Badge } from "@/components/ui/badge";
import { Target, ExternalLink } from "lucide-react";
import CollapsibleSection from "./CollapsibleSection";

export default function TriggeringQuestionsSection({
  triggeringQuestions,
  isExpanded,
  onToggleExpand
}) {
  const navigate = useNavigate();

  const sortedQuestions = [...triggeringQuestions].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

  const handleNavigateToQuestion = (questionId) => {
    navigate(createPageUrl(`InterviewStructureManager?questionId=${questionId}`));
  };

  // Build pills
  const pills = [
    { label: `${sortedQuestions.length} trigger${sortedQuestions.length !== 1 ? 's' : ''}`, className: 'bg-teal-500/20 text-teal-300 border border-teal-500/30' }
  ];
  if (sortedQuestions.length > 0) {
    pills.push({ label: 'Triggers Pack', className: 'bg-slate-700/50 text-slate-300 border border-slate-600' });
  }

  return (
    <CollapsibleSection
      title="Triggering Questions"
      subtitle="Interview questions where a 'Yes' answer triggers this pack — manage these in Interview Structure"
      icon={Target}
      iconColor="text-teal-400"
      bgColor="bg-teal-950/20"
      borderColor="border-teal-500/30"
      isExpanded={isExpanded}
      onToggleExpand={onToggleExpand}
      pills={pills}
      editable={false}
    >
      {sortedQuestions.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 text-center">
          <p className="text-sm text-slate-400">
            No interview questions currently trigger this pack.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedQuestions.map((q) => (
            <button
              key={q.id}
              onClick={() => handleNavigateToQuestion(q.question_id)}
              className="w-full bg-slate-900/50 border border-slate-700 rounded-lg p-3 hover:border-emerald-500/50 hover:bg-slate-800/70 transition-all text-left group"
            >
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="font-mono text-xs font-medium border-slate-600 text-blue-400 group-hover:border-blue-500 group-hover:text-blue-300 transition-colors">
                  {q.question_id}
                </Badge>
                <p className="text-base font-medium text-slate-300 leading-relaxed flex-1 group-hover:text-white transition-colors">
                  {q.question_text}
                </p>
                <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors flex-shrink-0" />
              </div>
            </button>
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}