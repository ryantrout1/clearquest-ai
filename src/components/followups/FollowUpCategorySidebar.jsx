import React from "react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, Folder } from "lucide-react";
import { cn } from "@/lib/utils";

export default function FollowUpCategorySidebar({ 
  categories, 
  packsByCategory, 
  selectedCategoryId, 
  onSelectCategory,
  validationIssues = {},
  questionsMap = {}
}) {
  // Compute KPIs for each category
  const computeCategoryKPIs = (category) => {
    const packsInCategory = packsByCategory[category.id] || [];
    const packCount = packsInCategory.length;
    const activePacks = packsInCategory.filter(p => p.active !== false);
    
    let totalQuestions = 0;
    let activeQuestions = 0;
    
    packsInCategory.forEach(pack => {
      const packQuestions = questionsMap[pack.followup_pack_id] || [];
      totalQuestions += packQuestions.length;
      activeQuestions += packQuestions.filter(q => q.active !== false).length;
    });
    
    const hasValidationIssues = validationIssues[category.id] > 0;
    const validationIcon = hasValidationIssues ? "⚠️" : "✓";
    
    return { packCount, totalQuestions, activeQuestions, validationIcon };
  };

  return (
    <div className="space-y-1">
          {categories.map((category) => {
            const packsInCategory = packsByCategory[category.id] || [];
            const isSelected = selectedCategoryId === category.id;
            const kpis = computeCategoryKPIs(category);

            return (
              <button
                key={category.id}
                onClick={() => onSelectCategory(category.id)}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-md transition-all group",
                  isSelected
                    ? "bg-slate-700/50"
                    : "bg-transparent hover:bg-slate-800/30"
                )}
              >
                <div className="flex items-center gap-2.5 mb-1">
                  <Folder className={cn(
                    "w-4 h-4 flex-shrink-0",
                    isSelected ? "text-slate-400" : "text-slate-500 group-hover:text-slate-400"
                  )} />
                  <h4 className={cn(
                    "text-xs font-normal leading-tight flex-1",
                    isSelected ? "text-white" : "text-slate-400 group-hover:text-slate-300"
                  )}>
                    {category.label}
                  </h4>
                  <Switch
                    checked={true}
                    className="data-[state=checked]:bg-emerald-600 scale-75"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <div className={cn(
                  "text-xs ml-6.5 opacity-70",
                  isSelected ? "text-slate-400" : "text-slate-500"
                )}>
                  📦 {kpis.packCount} · 📝 {kpis.totalQuestions} · ✔️ {kpis.activeQuestions} · {kpis.validationIcon}
                </div>
              </button>
            );
          })}
      
      {/* Uncategorized section */}
      {packsByCategory["UNCATEGORIZED"]?.length > 0 && (
        <button
          onClick={() => onSelectCategory("UNCATEGORIZED")}
          className={cn(
            "w-full text-left px-3 py-2 rounded-md transition-all mt-2 flex items-center gap-2.5",
            selectedCategoryId === "UNCATEGORIZED"
              ? "bg-red-900/20"
              : "bg-red-950/10 hover:bg-red-900/20"
          )}
        >
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-normal text-red-400">
              Uncategorized
            </h4>
            <span className="text-xs text-red-500/80 block mt-0.5">
              {packsByCategory["UNCATEGORIZED"].length} packs
            </span>
          </div>
        </button>
      )}
    </div>
  );
}