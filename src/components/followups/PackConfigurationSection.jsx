import React, { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
    setLocalData({
      behavior_type: pack?.behavior_type || 'standard',
      requires_completion: pack?.requires_completion !== false,
      max_probe_loops: pack?.max_probe_loops || '',
      max_ai_followups: pack?.max_ai_followups ?? 3,
      active: pack?.active !== false
    });
  }, [pack?.id]);

  const handleSave = async () => {
    await onSave({
      behavior_type: localData.behavior_type,
      requires_completion: localData.requires_completion,
      max_probe_loops: localData.max_probe_loops ? parseInt(localData.max_probe_loops) : null,
      max_ai_followups: localData.max_ai_followups ? parseInt(localData.max_ai_followups) : 3,
      active: localData.active
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setLocalData({
      behavior_type: pack?.behavior_type || 'standard',
      requires_completion: pack?.requires_completion !== false,
      max_probe_loops: pack?.max_probe_loops || '',
      max_ai_followups: pack?.max_ai_followups ?? 3,
      active: pack?.active !== false
    });
    setIsEditing(false);
  };

  // Build pills
  const pills = [];
  if (localData.behavior_type === 'multi_incident') {
    pills.push({ label: 'Multi-Incident', className: 'bg-purple-500/20 text-purple-300' });
  }
  if (localData.requires_completion) {
    pills.push({ label: 'Required', className: 'bg-orange-500/20 text-orange-300' });
  }
  if (localData.max_probe_loops) {
    pills.push({ label: `Max ${localData.max_probe_loops} Loops`, className: 'bg-slate-700/50 text-slate-300' });
  }
  if (!localData.active) {
    pills.push({ label: 'Inactive', className: 'bg-red-500/20 text-red-300' });
  }

  return (
    <CollapsibleSection
      title="Pack Configuration"
      subtitle="Behavior type, completion requirements, and loop limits"
      icon={Settings}
      iconColor="text-slate-400"
      bgColor="bg-slate-900/50"
      borderColor="border-slate-700"
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
        </div>
      )}
    </CollapsibleSection>
  );
}