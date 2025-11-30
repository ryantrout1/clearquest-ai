import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronRight, Edit, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Reusable collapsible section with optional edit/save workflow.
 * Supports section-specific editing without affecting other sections.
 */
export default function CollapsibleSection({
  title,
  subtitle,
  icon: Icon,
  iconColor = "text-slate-400",
  bgColor = "bg-slate-900/50",
  borderColor = "border-slate-700",
  isExpanded,
  onToggleExpand,
  children,
  pills = [],
  // Edit mode props
  editable = false,
  isEditing = false,
  onEdit,
  onSave,
  onCancel,
  editDisabled = false,
  saveDisabled = false
}) {
  return (
    <div className={cn(bgColor, "border rounded-lg p-4", borderColor)}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <button
          onClick={onToggleExpand}
          className="flex items-center gap-3 group flex-1 text-left"
          disabled={isEditing}
        >
          <ChevronRight 
            className={cn(
              "w-5 h-5 transition-transform flex-shrink-0",
              iconColor,
              isExpanded ? "rotate-90" : ""
            )} 
          />
          {Icon && <Icon className={cn("w-5 h-5 flex-shrink-0", iconColor)} />}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn("text-lg font-semibold", iconColor.replace("text-", "text-"))}>{title}</span>
              {pills.map((pill, idx) => (
                <span
                  key={idx}
                  className={cn(
                    "px-2 py-0.5 rounded-full text-[11px] font-medium",
                    pill.className || "bg-slate-700/50 text-slate-300"
                  )}
                >
                  {pill.label}
                </span>
              ))}
            </div>
            {subtitle && (
              <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
            )}
          </div>
        </button>

        {/* Edit/Save buttons */}
        {editable && isExpanded && (
          <div className="flex gap-1 flex-shrink-0">
            {!isEditing ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={onEdit}
                disabled={editDisabled}
                className="h-8 px-2 text-slate-400 hover:text-white hover:bg-slate-700"
              >
                <Edit className="w-4 h-4 mr-1" />
                Edit
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onCancel}
                  className="h-8 px-2 text-slate-400 hover:text-white hover:bg-slate-700"
                >
                  <X className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  onClick={async () => {
                    if (onSave) {
                      await onSave();
                    }
                  }}
                  disabled={saveDisabled}
                  className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700"
                >
                  <Check className="w-4 h-4 mr-1" />
                  Save
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="mt-4">
          {children}
        </div>
      )}
    </div>
  );
}