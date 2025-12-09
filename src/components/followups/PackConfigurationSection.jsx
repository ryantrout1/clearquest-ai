import React, { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings2 } from "lucide-react";
import CollapsibleSection from "./CollapsibleSection";

export default function PackConfigurationSection({
  pack,
  isExpanded,
  onToggleExpand,
  onSave
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [localData, setLocalData] = useState({});

  useEffect(() => {
    // Compute effective opening strategy with backwards compatibility
    let effectiveOpeningStrategy = 'none';
    if (pack?.openingStrategy) {
      effectiveOpeningStrategy = pack.openingStrategy;
    } else if (pack?.forceNarrativeOpening === true && pack?.openingFieldKey) {
      effectiveOpeningStrategy = 'fixed_narrative';
    }
    
    setLocalData({
      behavior_type: pack?.behavior_type || 'standard',
      requires_completion: pack?.requires_completion !== false,
      max_probe_loops: pack?.max_probe_loops || '',
      max_ai_followups: pack?.max_ai_followups ?? 3,
      active: pack?.active !== false,
      openingStrategy: effectiveOpeningStrategy,
      openingFieldKey: pack?.openingFieldKey || null,
      openingLabelOverride: pack?.openingLabelOverride || ''
    });
  }, [pack?.id]);

  const handleSave = async () => {
    await onSave({
      behavior_type: localData.behavior_type,
      requires_completion: localData.requires_completion,
      max_probe_loops: localData.max_probe_loops ? parseInt(localData.max_probe_loops) : null,
      max_ai_followups: localData.max_ai_followups ? parseInt(localData.max_ai_followups) : 3,
      active: localData.active,
      openingStrategy: localData.openingStrategy || 'none',
      openingFieldKey: localData.openingFieldKey || null,
      openingLabelOverride: localData.openingLabelOverride || '',
      // Preserve legacy flags for backwards compatibility
      forceNarrativeOpening: localData.openingStrategy === 'fixed_narrative',
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    // Compute effective opening strategy with backwards compatibility
    let effectiveOpeningStrategy = 'none';
    if (pack?.openingStrategy) {
      effectiveOpeningStrategy = pack.openingStrategy;
    } else if (pack?.forceNarrativeOpening === true && pack?.openingFieldKey) {
      effectiveOpeningStrategy = 'fixed_narrative';
    }
    
    setLocalData({
      behavior_type: pack?.behavior_type || 'standard',
      requires_completion: pack?.requires_completion !== false,
      max_probe_loops: pack?.max_probe_loops || '',
      max_ai_followups: pack?.max_ai_followups ?? 3,
      active: pack?.active !== false,
      openingStrategy: effectiveOpeningStrategy,
      openingFieldKey: pack?.openingFieldKey || null,
      openingLabelOverride: pack?.openingLabelOverride || ''
    });
    setIsEditing(false);
  };

  // Build pills
  const pills = [];
  if (localData.behavior_type === 'multi_incident') {
    pills.push({ label: 'Multi-Incident', className: 'bg-purple-500/20 text-purple-300 border border-purple-500/30' });
  }
  if (localData.requires_completion) {
    pills.push({ label: 'Required', className: 'bg-amber-500/20 text-amber-300 border border-amber-500/30' });
  }
  if (localData.max_probe_loops) {
    pills.push({ label: `Max ${localData.max_probe_loops} Loops`, className: 'bg-slate-700/50 text-slate-300 border border-slate-600' });
  }
  if (!localData.active) {
    pills.push({ label: 'Inactive', className: 'bg-red-500/20 text-red-300 border border-red-500/30' });
  }

  return (
    <CollapsibleSection
      title="Pack Configuration"
      subtitle="Behavior type, completion requirements, and loop limits"
      icon={Settings2}
      iconColor="text-purple-400"
      bgColor="bg-purple-950/20"
      borderColor="border-purple-500/30"
      isExpanded={isExpanded}
      onToggleExpand={onToggleExpand}
      pills={pills}
      editable={true}
      isEditing={isEditing}
      onEdit={() => setIsEditing(true)}
      onSave={handleSave}
      onCancel={handleCancel}
    >
      {isEditing ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm text-slate-400">Behavior Type</Label>
              <Select
                value={localData.behavior_type}
                onValueChange={(v) => setLocalData({...localData, behavior_type: v})}
              >
                <SelectTrigger className="bg-slate-800 border-slate-600 text-white mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="strict">Strict</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="multi_incident">Multi-Incident</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {localData.behavior_type === 'multi_incident' && (
              <div>
                <Label className="text-sm text-slate-400">Max Probe Loops</Label>
                <Input
                  type="number"
                  value={localData.max_probe_loops}
                  onChange={(e) => setLocalData({...localData, max_probe_loops: e.target.value})}
                  className="bg-slate-800 border-slate-600 text-white mt-1"
                  placeholder="e.g., 5"
                />
              </div>
            )}
          </div>

          <div>
            <Label className="text-sm text-slate-400 mb-1 block">Max AI Follow-ups</Label>
            <Input
              type="number"
              min="0"
              max="10"
              value={localData.max_ai_followups}
              onChange={(e) => setLocalData({...localData, max_ai_followups: e.target.value})}
              className="bg-slate-800 border-slate-600 text-white w-32"
              placeholder="Default: 3"
            />
            <p className="text-xs text-slate-500 mt-1">
              Maximum AI probing questions per pack instance (0-10)
            </p>
          </div>

          <div className="flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-lg p-3">
            <Label className="text-sm text-slate-300">Requires Completion</Label>
            <Switch
              checked={localData.requires_completion}
              onCheckedChange={(checked) => setLocalData({...localData, requires_completion: checked})}
              className="data-[state=checked]:bg-emerald-600"
            />
          </div>

          <div className="flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-lg p-3">
            <Label className="text-sm text-slate-300">Active</Label>
            <Switch
              checked={localData.active}
              onCheckedChange={(checked) => setLocalData({...localData, active: checked})}
              className="data-[state=checked]:bg-emerald-600"
            />
          </div>

          {/* Opening Strategy Section */}
          <div className="border-t border-slate-700/50 pt-4 mt-4">
            <h4 className="text-sm font-semibold text-slate-300 mb-3">Opening Strategy</h4>
            
            <div>
              <Label className="text-sm text-slate-400 mb-1 block">Opening Strategy</Label>
              <Select
                value={localData.openingStrategy || 'none'}
                onValueChange={(v) => setLocalData({...localData, openingStrategy: v})}
              >
                <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (start with first field normally)</SelectItem>
                  <SelectItem value="fixed_narrative">Fixed narrative opening (use a defined field)</SelectItem>
                  <SelectItem value="ai_narrative">AI-generated opening (LLM)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(localData.openingStrategy === 'fixed_narrative' || localData.openingStrategy === 'ai_narrative') && (
              <div className="mt-3">
                <Label className="text-sm text-slate-400 mb-1 block">Opening Field</Label>
                <Select
                  value={localData.openingFieldKey || ''}
                  onValueChange={(v) => setLocalData({...localData, openingFieldKey: v})}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                    <SelectValue placeholder="Select opening field..." />
                  </SelectTrigger>
                  <SelectContent>
                    {pack?.field_config && Array.isArray(pack.field_config) && pack.field_config.length > 0 ? (
                      pack.field_config.map((field) => (
                        <SelectItem key={field.fieldKey || field.id} value={field.fieldKey || field.id}>
                          {field.fieldKey || field.id} — {(field.label || '').substring(0, 40)}...
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value={null} disabled>No fields configured yet</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {localData.openingStrategy !== 'none' && !localData.openingFieldKey && (
                  <p className="text-xs text-amber-400 mt-1">
                    Select which pack field is used as the opening narrative.
                  </p>
                )}
              </div>
            )}

            {localData.openingStrategy === 'fixed_narrative' && (
              <div className="mt-3">
                <Label className="text-sm text-slate-400 mb-1 block">Opening Label Override (optional)</Label>
                <Textarea
                  value={localData.openingLabelOverride || ''}
                  onChange={(e) => setLocalData({...localData, openingLabelOverride: e.target.value})}
                  className="bg-slate-800 border-slate-600 text-white min-h-20"
                  placeholder="If set, this text will replace the selected field's label for the opening narrative question."
                />
                <p className="text-xs text-slate-500 mt-1">
                  If set, this text will replace the selected field's label for the opening narrative question.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-slate-500">Behavior Type</Label>
              <p className="text-sm text-slate-300 capitalize">{localData.behavior_type}</p>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Max AI Follow-ups</Label>
              <p className="text-sm text-slate-300">{localData.max_ai_followups}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-slate-500">Requires Completion</Label>
              <p className="text-sm text-slate-300">{localData.requires_completion ? 'Yes' : 'No'}</p>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Status</Label>
              <p className="text-sm text-slate-300">{localData.active ? 'Active' : 'Inactive'}</p>
            </div>
          </div>
          
          {/* Opening Strategy Display */}
          {(localData.openingStrategy && localData.openingStrategy !== 'none') && (
            <div className="border-t border-slate-700/50 pt-3 mt-3">
              <Label className="text-xs text-slate-500 mb-2 block">Opening Strategy</Label>
              <div className="space-y-2">
                <div>
                  <p className="text-sm text-slate-300">
                    {localData.openingStrategy === 'fixed_narrative' && 'Fixed narrative opening (use a defined field)'}
                    {localData.openingStrategy === 'ai_narrative' && 'AI-generated opening (LLM)'}
                  </p>
                </div>
                {localData.openingFieldKey && (
                  <div>
                    <Label className="text-xs text-slate-500">Opening Field</Label>
                    <p className="text-sm text-slate-300 font-mono">{localData.openingFieldKey}</p>
                  </div>
                )}
                {localData.openingStrategy === 'fixed_narrative' && localData.openingLabelOverride && (
                  <div>
                    <Label className="text-xs text-slate-500">Label Override</Label>
                    <p className="text-sm text-slate-300 whitespace-pre-wrap">{localData.openingLabelOverride}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </CollapsibleSection>
  );
}