import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  ChevronDown, ChevronUp, Anchor, Plus, Trash2, Save, 
  Loader2, GripVertical, AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const ANSWER_TYPES = [
  { value: "text", label: "Text" },
  { value: "month_year", label: "Month/Year" },
  { value: "single_choice", label: "Single Choice" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Yes/No" }
];

const CLARIFIER_STYLES = [
  { value: "micro", label: "Micro (single question)" },
  { value: "combined", label: "Combined (multiple anchors)" }
];

export default function FactAnchorsSection({ 
  pack, 
  isExpanded, 
  onToggleExpand,
  onSave
}) {
  const [anchors, setAnchors] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (pack?.fact_anchors) {
      setAnchors([...pack.fact_anchors].sort((a, b) => a.priority - b.priority));
    } else {
      setAnchors([]);
    }
    setHasChanges(false);
  }, [pack?.id, pack?.fact_anchors]);

  const handleAddAnchor = () => {
    const maxPriority = anchors.length > 0 
      ? Math.max(...anchors.map(a => a.priority)) 
      : 0;
    
    setAnchors([...anchors, {
      key: "",
      label: "",
      answerType: "text",
      priority: maxPriority + 1,
      multiInstanceAware: true,
      clarifierStyle: "micro",
      required: false
    }]);
    setHasChanges(true);
  };

  const handleUpdateAnchor = (index, field, value) => {
    const updated = [...anchors];
    updated[index] = { ...updated[index], [field]: value };
    
    // Auto-format key to lowercase with underscores
    if (field === "key") {
      updated[index].key = value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    }
    
    setAnchors(updated);
    setHasChanges(true);
  };

  const handleRemoveAnchor = (index) => {
    setAnchors(anchors.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  const handleMoveUp = (index) => {
    if (index === 0) return;
    const updated = [...anchors];
    // Swap priorities
    const tempPriority = updated[index].priority;
    updated[index].priority = updated[index - 1].priority;
    updated[index - 1].priority = tempPriority;
    // Re-sort
    updated.sort((a, b) => a.priority - b.priority);
    setAnchors(updated);
    setHasChanges(true);
  };

  const handleMoveDown = (index) => {
    if (index === anchors.length - 1) return;
    const updated = [...anchors];
    // Swap priorities
    const tempPriority = updated[index].priority;
    updated[index].priority = updated[index + 1].priority;
    updated[index + 1].priority = tempPriority;
    // Re-sort
    updated.sort((a, b) => a.priority - b.priority);
    setAnchors(updated);
    setHasChanges(true);
  };

  const handleSave = async () => {
    // Validation
    const keys = anchors.map(a => a.key).filter(k => k);
    const uniqueKeys = new Set(keys);
    if (keys.length !== uniqueKeys.size) {
      toast.error("Anchor keys must be unique");
      return;
    }
    
    for (const anchor of anchors) {
      if (!anchor.key) {
        toast.error("All anchors must have a key");
        return;
      }
      if (anchor.priority < 1) {
        toast.error("Priority must be at least 1");
        return;
      }
    }

    setIsSaving(true);
    try {
      // Normalize priorities to be sequential
      const normalized = anchors.map((a, i) => ({ ...a, priority: i + 1 }));
      await onSave({ fact_anchors: normalized });
      setHasChanges(false);
    } catch (err) {
      // Error handled by parent
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * V2 packs store Fact Anchors directly on the FollowUpPack record (fact_anchors).
   * Legacy packs continue using the original anchors collection.
   * Only show this section for V2 packs.
   */
  const isV2Pack = 
    pack?.openingStrategy && pack.openingStrategy !== 'none' ||
    pack?.is_standard_cluster === true ||
    pack?.ide_version === 'V2' ||
    pack?.ide_version === 'V3';
  
  if (!isV2Pack) {
    return null;
  }

  return (
    <div className="bg-slate-900/50 border border-amber-700/50 rounded-lg overflow-hidden">
      <button
        onClick={onToggleExpand}
        className="w-full flex items-center justify-between p-4 hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Anchor className="w-5 h-5 text-amber-400" />
          <div className="text-left">
            <h4 className="text-sm font-semibold text-white">
              Fact Anchors (AI Clarifiers)
            </h4>
            <p className="text-xs text-slate-400">
              {anchors.length > 0 
                ? `${anchors.length} anchor${anchors.length !== 1 ? 's' : ''} configured`
                : "Configure BI-critical facts for AI clarifiers"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-xs">
              Unsaved
            </Badge>
          )}
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="p-4 pt-0 space-y-4">
          <p className="text-xs text-slate-500">
            Define factual anchors the AI should collect. These drive the Discretion Engine's clarifier decisions.
          </p>

          {anchors.length === 0 ? (
            <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-6 text-center">
              <Anchor className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-400 mb-3">No fact anchors configured</p>
              <Button
                size="sm"
                onClick={handleAddAnchor}
                className="bg-amber-600 hover:bg-amber-700"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add First Anchor
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {anchors.map((anchor, index) => (
                <div 
                  key={index}
                  className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 space-y-3"
                >
                  {/* Row 1: Priority controls + Key + Label */}
                  <div className="flex items-start gap-2">
                    <div className="flex flex-col gap-1 pt-1">
                      <button
                        onClick={() => handleMoveUp(index)}
                        disabled={index === 0}
                        className={cn(
                          "p-1 rounded hover:bg-slate-700",
                          index === 0 ? "opacity-30 cursor-not-allowed" : "text-slate-400"
                        )}
                      >
                        <ChevronUp className="w-3 h-3" />
                      </button>
                      <span className="text-xs text-slate-500 text-center">{index + 1}</span>
                      <button
                        onClick={() => handleMoveDown(index)}
                        disabled={index === anchors.length - 1}
                        className={cn(
                          "p-1 rounded hover:bg-slate-700",
                          index === anchors.length - 1 ? "opacity-30 cursor-not-allowed" : "text-slate-400"
                        )}
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </div>
                    
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs text-slate-400">Key (machine name)</Label>
                        <Input
                          value={anchor.key}
                          onChange={(e) => handleUpdateAnchor(index, 'key', e.target.value)}
                          placeholder="e.g., agency_type"
                          className="bg-slate-900 border-slate-600 text-white text-sm h-8 font-mono"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-400">Label (admin description)</Label>
                        <Input
                          value={anchor.label}
                          onChange={(e) => handleUpdateAnchor(index, 'label', e.target.value)}
                          placeholder="e.g., Type of agency"
                          className="bg-slate-900 border-slate-600 text-white text-sm h-8"
                        />
                      </div>
                    </div>

                    <button
                      onClick={() => handleRemoveAnchor(index)}
                      className="p-1.5 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400 mt-5"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Row 2: Type + Clarifier Style + Flags */}
                  <div className="flex items-center gap-3 pl-8">
                    <div className="w-32">
                      <Label className="text-xs text-slate-400">Answer Type</Label>
                      <Select
                        value={anchor.answerType}
                        onValueChange={(v) => handleUpdateAnchor(index, 'answerType', v)}
                      >
                        <SelectTrigger className="bg-slate-900 border-slate-600 text-white h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ANSWER_TYPES.map(t => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="w-40">
                      <Label className="text-xs text-slate-400">Clarifier Style</Label>
                      <Select
                        value={anchor.clarifierStyle}
                        onValueChange={(v) => handleUpdateAnchor(index, 'clarifierStyle', v)}
                      >
                        <SelectTrigger className="bg-slate-900 border-slate-600 text-white h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CLARIFIER_STYLES.map(s => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center gap-4 ml-auto">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={anchor.multiInstanceAware}
                          onCheckedChange={(c) => handleUpdateAnchor(index, 'multiInstanceAware', c)}
                          className="scale-75"
                        />
                        <Label className="text-xs text-slate-400">Multi-instance</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={anchor.required}
                          onCheckedChange={(c) => handleUpdateAnchor(index, 'required', c)}
                          className="scale-75"
                        />
                        <Label className="text-xs text-slate-400">Required</Label>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleAddAnchor}
              className="border-slate-600 text-slate-300 hover:bg-slate-800"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Anchor
            </Button>

            {anchors.length > 0 && (
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving || !hasChanges}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <Save className="w-4 h-4 mr-1" />
                )}
                Save Anchors
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}