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
    <div className="space-y-2">
      {categories.map((category) => {
        const packsInCategory = packsByCategory[category.id] || [];
        const hasIssues = validationIssues[category.id] > 0;
        const isSelected = selectedCategoryId === category.id;
        
        return (
          <button
            key={category.id}
            onClick={() => onSelectCategory(category.id)}
            className={cn(
              "w-full text-left p-4 rounded-lg transition-all",
              isSelected
                ? "bg-amber-950/50 border-2 border-amber-500/50"
                : "bg-slate-800/50 border border-slate-700 hover:border-amber-500/30 hover:bg-slate-800/70"
            )}
          >
            <div className="flex items-start gap-3">
              <Folder className={cn(
                "w-5 h-5 mt-0.5 flex-shrink-0",
                isSelected ? "text-amber-400" : "text-slate-400"
              )} />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h4 className={cn(
                    "text-sm font-semibold leading-tight",
                    isSelected ? "text-white" : "text-slate-300"
                  )}>
                    {category.label}
                  </h4>
                  {hasIssues && (
                    <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline" className={cn(
                    "text-xs",
                    isSelected 
                      ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                      : "bg-slate-700/50 border-slate-600 text-slate-400"
                  )}>
                    {packsInCategory.length} {packsInCategory.length === 1 ? 'pack' : 'packs'}
                  </Badge>
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
            "w-full text-left p-4 rounded-lg transition-all border-2",
            selectedCategoryId === "UNCATEGORIZED"
              ? "bg-red-950/50 border-red-500/50"
              : "bg-red-950/20 border-red-800/50 hover:border-red-500/50"
          )}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-red-300 mb-1">
                Uncategorized (Needs Review)
              </h4>
              <Badge variant="outline" className="text-xs bg-red-500/20 border-red-500/50 text-red-300">
                {packsByCategory["UNCATEGORIZED"].length} {packsByCategory["UNCATEGORIZED"].length === 1 ? 'pack' : 'packs'}
              </Badge>
            </div>
          </div>
        </button>
      )}
    </div>
  );
}