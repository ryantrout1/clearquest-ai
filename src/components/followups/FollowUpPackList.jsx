import React, { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Package, AlertTriangle, FileText, Link2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function FollowUpPackList({ 
  packs, 
  selectedPackId, 
  onSelectPack, 
  onToggleActive,
  packUsageMap,
  questionsMap 
}) {
  // Safety: de-duplicate by followup_pack_id in case of ghost/duplicate entries
  const uniquePacks = useMemo(() => {
    if (!packs || packs.length === 0) return [];

    const seen = new Map(); // followup_pack_id -> pack
    const duplicates = [];

    packs.forEach((pack) => {
      const key = pack.followup_pack_id || pack.id;

      if (seen.has(key)) {
        duplicates.push({
          key,
          existingId: seen.get(key).id,
          duplicateId: pack.id,
        });
      } else {
        seen.set(key, pack);
      }
    });

    if (duplicates.length > 0) {
      console.warn(
        "[FollowUpPackList] Detected duplicate follow-up packs by followup_pack_id:",
        duplicates.map((d) => `${d.key} (existing: ${d.existingId}, duplicate: ${d.duplicateId})`)
      );
    }

    return Array.from(seen.values());
  }, [packs]);

  if (uniquePacks.length === 0) {
    return (
      <div className="bg-slate-900/30 border border-slate-800/50 rounded-md p-6 text-center">
        <Package className="w-8 h-8 text-slate-600 mx-auto mb-2" />
        <p className="text-slate-500 text-sm">No packs in this category</p>
      </div>
    );
  }

  // Sort packs alphabetically by pack_name
  const sortedPacks = [...uniquePacks].sort((a, b) => 
    (a.pack_name || '').localeCompare(b.pack_name || '')
  );

  return (
    <div className="space-y-1.5">
      {sortedPacks.map((pack) => {
        const packQuestions = questionsMap[pack.followup_pack_id] || [];
        const activeQuestions = packQuestions.filter(q => q.active !== false).length;
        const triggeringQuestions = packUsageMap[pack.followup_pack_id] || [];
        const isSelected = selectedPackId === pack.id;
        const hasNoTriggers = triggeringQuestions.length === 0;
        const isInactive = pack.active === false;

        return (
          <div
            key={pack.followup_pack_id || pack.id}
            id={`pack-${pack.id}`}
            onClick={() => onSelectPack(pack)}
            className={cn(
              "px-3 py-2.5 rounded-md transition-all cursor-pointer group",
              isSelected
                ? "bg-slate-800/50"
                : "bg-transparent hover:bg-slate-800/30",
              isInactive && "opacity-60"
            )}
          >
            <div className="flex items-start gap-2.5">
              <Package className={cn(
                "w-4 h-4 mt-0.5 flex-shrink-0",
                isSelected ? "text-purple-400" : "text-slate-500 group-hover:text-slate-400"
              )} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div>
                    <h4 className={cn(
                      "text-sm font-medium leading-tight",
                      isSelected ? "text-white" : "text-slate-200 group-hover:text-white"
                    )}>
                      {pack.pack_name}
                    </h4>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      {pack.followup_pack_id}
                    </p>
                  </div>
                  <Switch
                    checked={pack.active !== false}
                    onCheckedChange={(checked) => {
                      onToggleActive(pack.id, checked);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="data-[state=checked]:bg-emerald-600 flex-shrink-0 scale-75"
                  />
                </div>

                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {/* Questions pill */}
                  <span className={cn(
                    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium",
                    activeQuestions === packQuestions.length 
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-slate-700/50 text-slate-300"
                  )}>
                    <FileText className="w-3 h-3" />
                    {packQuestions.length} q ({activeQuestions} active)
                  </span>
                  
                  {/* Triggers pill */}
                  {triggeringQuestions.length > 0 ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-blue-500/15 text-blue-400">
                      <Link2 className="w-3 h-3" />
                      Used by {triggeringQuestions.length}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-yellow-500/15 text-yellow-400">
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