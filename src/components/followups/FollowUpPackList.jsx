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
      <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-8 text-center">
        <p className="text-slate-400 text-sm">No packs in this category</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
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
              "p-4 rounded-lg transition-all cursor-pointer",
              isSelected
                ? "bg-amber-950/30 border-2 border-amber-500/50"
                : "bg-slate-800/50 border border-slate-700 hover:border-amber-500/30"
            )}
          >
            <div className="flex items-start gap-3">
              <Package className={cn(
                "w-5 h-5 mt-0.5 flex-shrink-0",
                isSelected ? "text-amber-400" : "text-purple-400"
              )} />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h4 className="text-base font-semibold text-white leading-tight">
                    {pack.pack_name}
                  </h4>
                  <Switch
                    checked={pack.active !== false}
                    onCheckedChange={(checked) => {
                      onToggleActive(pack.id, checked);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="data-[state=checked]:bg-emerald-600 flex-shrink-0"
                  />
                </div>
                <p className="text-xs text-slate-400 font-mono break-all mb-2">
                  {pack.followup_pack_id}
                </p>
                
                <div className="flex gap-1.5 flex-wrap">
                  <Badge variant="outline" className="text-xs bg-slate-700/50 border-slate-600 text-slate-300">
                    {packQuestions.length} questions ({activeQuestions} active)
                  </Badge>
                  {triggeringQuestions.length > 0 ? (
                    <Badge className="text-xs bg-emerald-500/20 border-emerald-500/50 text-emerald-400">
                      Used by {triggeringQuestions.length}
                    </Badge>
                  ) : (
                    <Badge className="text-xs bg-yellow-500/20 border-yellow-500/50 text-yellow-400 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      No triggers
                    </Badge>
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