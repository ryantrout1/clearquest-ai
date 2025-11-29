import React from "react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, FolderOpen, Package, FileText, CheckCircle2, AlertCircle } from "lucide-react";
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
    
    return { packCount, activePacks: activePacks.length, totalQuestions, activeQuestions, hasValidationIssues };
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
                  "w-full text-left px-3 py-2.5 rounded-md transition-all group",
                  isSelected
                    ? "bg-slate-700/50"
                    : "bg-transparent hover:bg-slate-800/30"
                )}
              >
                <div className="flex items-center gap-2.5 mb-1.5">
                  <FolderOpen className={cn(
                    "w-4 h-4 flex-shrink-0",
                    isSelected ? "text-blue-400" : "text-slate-500 group-hover:text-slate-400"
                  )} />
                  <h4 className={cn(
                    "text-sm font-medium leading-tight flex-1",
                    isSelected ? "text-white" : "text-slate-300 group-hover:text-white"
                  )}>
                    {category.label}
                  </h4>
                  <Switch
                    checked={true}
                    className="data-[state=checked]:bg-emerald-600 scale-75"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <div className="flex items-center gap-2 ml-6 flex-wrap">
                  <span className={cn(
                    "inline-flex items-center gap-1 text-xs",
                    isSelected ? "text-amber-400" : "text-amber-500/80"
                  )}>
                    <Package className="w-3 h-3" />
                    {kpis.packCount}
                  </span>
                  <span className="text-slate-600">·</span>
                  <span className={cn(
                    "inline-flex items-center gap-1 text-xs",
                    isSelected ? "text-purple-400" : "text-purple-500/80"
                  )}>
                    <FileText className="w-3 h-3" />
                    {kpis.totalQuestions}
                  </span>
                  <span className="text-slate-600">·</span>
                  <span className={cn(
                    "inline-flex items-center gap-1 text-xs",
                    isSelected ? "text-emerald-400" : "text-emerald-500/80"
                  )}>
                    <CheckCircle2 className="w-3 h-3" />
                    {kpis.activeQuestions}
                  </span>
                  <span className="text-slate-600">·</span>
                  {kpis.hasValidationIssues ? (
                    <span className="inline-flex items-center text-xs text-yellow-400">
                      <AlertCircle className="w-3 h-3" />
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-xs text-emerald-400">
                      <CheckCircle2 className="w-3 h-3" />
                    </span>
                  )}
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
            <h4 className="text-base font-medium text-red-400">
              Uncategorized
            </h4>
            <span className="text-sm text-red-500/80 block mt-0.5">
              {packsByCategory["UNCATEGORIZED"].length} packs
            </span>
          </div>
        </button>
      )}
    </div>
  );
}