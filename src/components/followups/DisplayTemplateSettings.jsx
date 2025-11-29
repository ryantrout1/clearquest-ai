import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Layout, Eye, Edit, Check, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import CollapsibleSection from "./CollapsibleSection";

// Mock data for preview
const MOCK_INSTANCE_DATA = {
  instance_number: 1,
  pack_name: "Driving Violations",
  field: {
    incident_date: "Mar 2020",
    location: "Los Angeles, CA",
    violation_type: "Speeding",
    classification: "Civil",
    summary: "Cited for exceeding speed limit by 15 mph on Highway 101"
  }
};

function renderTemplate(template, data) {
  if (!template) return null;
  
  let result = template;
  
  // Replace {{instance_number}}
  result = result.replace(/\{\{instance_number\}\}/g, data.instance_number || '1');
  
  // Replace {{pack_name}}
  result = result.replace(/\{\{pack_name\}\}/g, data.pack_name || 'Unknown Pack');
  
  // Replace {{field.xxx}} patterns
  const fieldPattern = /\{\{field\.([a-zA-Z0-9_]+)\}\}/g;
  result = result.replace(fieldPattern, (match, fieldName) => {
    return data.field?.[fieldName] || `[${fieldName}]`;
  });
  
  return result;
}

export default function DisplayTemplateSettings({ 
  pack, 
  isExpanded, 
  onToggleExpand, 
  onSave
}) {
  const [showPreview, setShowPreview] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [localData, setLocalData] = useState({
    instance_header_template: '',
    instance_title_format: '',
    label_mapping_overrides: null
  });

  useEffect(() => {
    setLocalData({
      instance_header_template: pack?.instance_header_template || '',
      instance_title_format: pack?.instance_title_format || '',
      label_mapping_overrides: pack?.label_mapping_overrides || null
    });
  }, [pack?.id]);

  // Get available field keys from pack's field_config
  const availableFields = (pack?.field_config || []).map(f => f.fieldKey);

  const previewResult = renderTemplate(
    localData.instance_header_template || '',
    {
      ...MOCK_INSTANCE_DATA,
      pack_name: pack?.pack_name || 'Unknown Pack'
    }
  );

  const handleSave = async () => {
    await onSave({
      instance_header_template: localData.instance_header_template || '',
      instance_title_format: localData.instance_title_format || '',
      label_mapping_overrides: localData.label_mapping_overrides || null
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setLocalData({
      instance_header_template: pack?.instance_header_template || '',
      instance_title_format: pack?.instance_title_format || '',
      label_mapping_overrides: pack?.label_mapping_overrides || null
    });
    setIsEditing(false);
  };

  // Build pills
  const pills = [];
  if (localData.instance_header_template) {
    pills.push({ label: 'Template Set', className: 'bg-teal-500/20 text-teal-300' });
  }

  return (
    <>
      <CollapsibleSection
        title="Display / Template Settings"
        subtitle="Controls how each incident instance is displayed in transcripts, summaries, and investigator views"
        icon={Layout}
        iconColor="text-teal-400"
        bgColor="bg-teal-950/20"
        borderColor="border-teal-500/30"
        isExpanded={isExpanded}
        onToggleExpand={onToggleExpand}
        pills={pills}
        editable={true}
        isEditing={isEditing}
        onEdit={() => setIsEditing(true)}
        onSave={handleSave}
        onCancel={handleCancel}
      >
        <div className="space-y-4">
          {/* Instance Header Template */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm text-slate-300">Instance Header Template</Label>
              {localData.instance_header_template && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowPreview(true)}
                  className="border-teal-500/50 text-teal-300 hover:bg-teal-500/10 h-7 text-xs"
                >
                  <Eye className="w-3 h-3 mr-1" />
                  Preview
                </Button>
              )}
            </div>
            {isEditing ? (
              <>
                <Textarea
                  value={localData.instance_header_template || ''}
                  onChange={(e) => setLocalData({...localData, instance_header_template: e.target.value})}
                  className="bg-slate-800 border-slate-600 text-white min-h-20 font-mono text-sm"
                  placeholder="{{field.violation_type}} • {{field.classification}} • {{field.incident_date}}"
                />
                <p className="text-xs text-slate-500">
                  Use variables: <code className="text-teal-400">{"{{field.<fieldKey>}}"}</code>, <code className="text-teal-400">{"{{instance_number}}"}</code>, <code className="text-teal-400">{"{{pack_name}}"}</code>
                </p>
                {availableFields.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    <span className="text-xs text-slate-500">Available fields:</span>
                    {availableFields.map(key => (
                      <Badge 
                        key={key} 
                        variant="outline" 
                        className="border-slate-600 text-slate-400 text-[10px] cursor-pointer hover:border-teal-500 hover:text-teal-300"
                        onClick={() => {
                          const insertion = `{{field.${key}}}`;
                          setLocalData({
                            ...localData, 
                            instance_header_template: (localData.instance_header_template || '') + insertion
                          });
                        }}
                      >
                        {key}
                      </Badge>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3">
                {localData.instance_header_template ? (
                  <code className="text-sm text-teal-300 font-mono break-all">
                    {localData.instance_header_template}
                  </code>
                ) : (
                  <p className="text-sm text-slate-500 italic">No template configured — system default will be used</p>
                )}
              </div>
            )}
          </div>

          {/* Instance Title Format (future use) */}
          <div className="space-y-2">
            <Label className="text-sm text-slate-300">Instance Title Format <span className="text-slate-500">(optional)</span></Label>
            {isEditing ? (
              <Input
                value={localData.instance_title_format || ''}
                onChange={(e) => setLocalData({...localData, instance_title_format: e.target.value})}
                className="bg-slate-800 border-slate-600 text-white font-mono text-sm"
                placeholder="e.g., Incident #{{instance_number}}"
              />
            ) : (
              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3">
                {localData.instance_title_format ? (
                  <code className="text-sm text-teal-300 font-mono">{localData.instance_title_format}</code>
                ) : (
                  <p className="text-sm text-slate-500 italic">Not configured</p>
                )}
              </div>
            )}
          </div>

          {/* Label Mapping Overrides (future use) */}
          <div className="space-y-2">
            <Label className="text-sm text-slate-300">Label Mapping Overrides <span className="text-slate-500">(JSON, optional)</span></Label>
            {isEditing ? (
              <>
                <Textarea
                  value={localData.label_mapping_overrides ? JSON.stringify(localData.label_mapping_overrides, null, 2) : ''}
                  onChange={(e) => {
                    try {
                      const parsed = e.target.value ? JSON.parse(e.target.value) : null;
                      setLocalData({...localData, label_mapping_overrides: parsed});
                    } catch {
                      // Allow invalid JSON while typing
                    }
                  }}
                  className="bg-slate-800 border-slate-600 text-white min-h-16 font-mono text-sm"
                  placeholder='{"incident_date": "Date of Occurrence"}'
                />
                <p className="text-xs text-slate-500">
                  Override default field labels in display. Format: <code className="text-slate-400">{`{"fieldKey": "Custom Label"}`}</code>
                </p>
              </>
            ) : (
              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3">
                {localData.label_mapping_overrides && Object.keys(localData.label_mapping_overrides).length > 0 ? (
                  <pre className="text-sm text-teal-300 font-mono whitespace-pre-wrap">
                    {JSON.stringify(localData.label_mapping_overrides, null, 2)}
                  </pre>
                ) : (
                  <p className="text-sm text-slate-500 italic">No overrides configured</p>
                )}
              </div>
            )}
          </div>
        </div>
      </CollapsibleSection>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>Instance Header Preview</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-sm text-slate-400 mb-2 block">Template</Label>
              <code className="text-xs text-teal-300 font-mono bg-slate-800 p-2 rounded block">
                {localData.instance_header_template || '(empty)'}
              </code>
            </div>
            <div>
              <Label className="text-sm text-slate-400 mb-2 block">Mock Data</Label>
              <pre className="text-xs text-slate-300 font-mono bg-slate-800 p-2 rounded overflow-auto max-h-32">
                {JSON.stringify(MOCK_INSTANCE_DATA, null, 2)}
              </pre>
            </div>
            <div>
              <Label className="text-sm text-slate-400 mb-2 block">Rendered Output</Label>
              <div className="bg-slate-800 border border-teal-500/50 rounded-lg p-3">
                <p className="text-base font-semibold text-white">
                  {previewResult || <span className="text-slate-500 italic">Empty template</span>}
                </p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}