import React from "react";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Folder } from "lucide-react";
import { cn } from "@/lib/utils";

export default function FollowUpCategorySidebar({ 
  categories, 
  packsByCategory, 
  selectedCategoryId, 
  onSelectCategory,
  validationIssues = {}
}) {
  return (
    <div className="space-y-1">
          {categories.map((category) => {
            const packsInCategory = packsByCategory[category.id] || [];
            const hasIssues = validationIssues[category.id] > 0;
            const isSelected = selectedCategoryId === category.id;

            return (
              <button
                key={category.id}
                onClick={() => onSelectCategory(category.id)}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-md transition-all group",
                  isSelected
                    ? "bg-slate-700/50 border border-slate-600"
                    : "bg-transparent border border-transparent hover:bg-slate-800/30 hover:border-slate-700/50"
                )}
              >
                <div className="flex items-start gap-2.5">
                  <Folder className={cn(
                    "w-4 h-4 mt-0.5 flex-shrink-0",
                    isSelected ? "text-amber-400" : "text-slate-500 group-hover:text-slate-400"
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className={cn(
                        "text-xs font-medium leading-tight",
                        isSelected ? "text-white" : "text-slate-400 group-hover:text-slate-300"
                      )}>
                        {category.label}
                      </h4>
                      {hasIssues && (
                        <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={cn(
                        "text-xs",
                        isSelected ? "text-slate-400" : "text-slate-600 group-hover:text-slate-500"
                      )}>
                        {packsInCategory.length} {packsInCategory.length === 1 ? 'pack' : 'packs'}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
      
      {/* Uncategorized section */}
      {packsByCategory["UNCATEGORIZED"]?.length > 0 && (
        <button
          onClick={() => onSelectCategory("UNCATEGORIZED")}
          className={cn(
            "w-full text-left px-3 py-2.5 rounded-md transition-all mt-2 border",
            selectedCategoryId === "UNCATEGORIZED"
              ? "bg-red-900/20 border-red-800/50"
              : "bg-red-950/10 border-red-900/30 hover:bg-red-900/20 hover:border-red-800/50"
          )}
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-medium text-red-400 mb-1">
                Uncategorized
              </h4>
              <span className="text-xs text-red-500/80">
                {packsByCategory["UNCATEGORIZED"].length} {packsByCategory["UNCATEGORIZED"].length === 1 ? 'pack' : 'packs'}
              </span>
            </div>
          </div>
        </button>
      )}
    </div>
  );
}