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
                <div className="flex items-center gap-1.5 ml-6 flex-wrap">
                  <span className={cn(
                    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border",
                    isSelected 
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/30" 
                      : "bg-amber-500/15 text-amber-400/80 border-amber-500/20"
                  )}>
                    <Package className="w-3 h-3" />
                    {kpis.packCount}
                  </span>
                  <span className={cn(
                    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border",
                    isSelected 
                      ? "bg-purple-500/20 text-purple-300 border-purple-500/30" 
                      : "bg-purple-500/15 text-purple-400/80 border-purple-500/20"
                  )}>
                    <FileText className="w-3 h-3" />
                    {kpis.totalQuestions}
                  </span>
                  <span className={cn(
                    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border",
                    isSelected 
                      ? "bg-teal-500/20 text-teal-300 border-teal-500/30" 
                      : "bg-teal-500/15 text-teal-400/80 border-teal-500/20"
                  )}>
                    <CheckCircle2 className="w-3 h-3" />
                    {kpis.activeQuestions}
                  </span>
                  {kpis.hasValidationIssues ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                      <AlertCircle className="w-3 h-3" />
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-500/20 text-teal-300 border border-teal-500/30">
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