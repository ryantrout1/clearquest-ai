import React from "react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Package, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function FollowUpPackList({ 
  packs, 
  selectedPackId, 
  onSelectPack, 
  onToggleActive,
  packUsageMap,
  questionsMap 
}) {
  if (packs.length === 0) {
    return (
      <div className="bg-slate-900/30 border border-slate-800/50 rounded-md p-6 text-center">
        <p className="text-slate-500 text-xs">No packs in this category</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {packs.map((pack) => {
        const packQuestions = questionsMap[pack.followup_pack_id] || [];
        const activeQuestions = packQuestions.filter(q => q.active !== false).length;
        const triggeringQuestions = packUsageMap[pack.followup_pack_id] || [];
        const isSelected = selectedPackId === pack.id;
        const hasNoTriggers = triggeringQuestions.length === 0;

        return (
          <div
            key={pack.id}
            onClick={() => onSelectPack(pack)}
            className={cn(
              "px-3 py-3 rounded-md transition-all cursor-pointer group",
              isSelected
                ? "bg-slate-800/50 border border-slate-700"
                : "bg-slate-900/30 border border-slate-800/50 hover:bg-slate-800/30 hover:border-slate-700/50"
            )}
          >
            <div className="flex items-start gap-2.5">
              <Package className={cn(
                "w-4 h-4 mt-0.5 flex-shrink-0",
                isSelected ? "text-amber-400" : "text-purple-400 group-hover:text-purple-300"
              )} />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h4 className="text-sm font-medium text-white leading-tight">
                    {pack.pack_name}
                  </h4>
                  <Switch
                    checked={pack.active !== false}
                    onCheckedChange={(checked) => {
                      onToggleActive(pack.id, checked);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="data-[state=checked]:bg-emerald-600 flex-shrink-0 scale-75"
                  />
                </div>
                <p className="text-xs text-slate-500 font-mono break-all mb-2">
                  {pack.followup_pack_id}
                </p>

                <div className="flex gap-1.5 flex-wrap">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-slate-800/50 border border-slate-700/50 text-slate-400">
                    {packQuestions.length} q ({activeQuestions} active)
                  </span>
                  {triggeringQuestions.length > 0 ? (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-900/30 border border-emerald-800/50 text-emerald-400">
                      Used by {triggeringQuestions.length}
                    </span>
                  ) : (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-900/30 border border-yellow-800/50 text-yellow-400 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      No triggers
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}