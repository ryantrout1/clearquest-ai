import React, { useState, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, FileText } from "lucide-react";
import CollapsibleSection from "./CollapsibleSection";

export default function AIInstructionsSection({
  pack,
  type, // 'probe' or 'summary'
  isExpanded,
  onToggleExpand,
  onSave
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState('');

  const fieldKey = type === 'probe' ? 'ai_probe_instructions' : 'ai_summary_instructions';
  const title = type === 'probe' ? 'AI Probe Instructions' : 'AI Investigator Summary Instructions';
  const subtitle = type === 'probe' 
    ? 'Controls how AI probes for missing details, clarifies vague answers, and handles sensitive topics'
    : 'Defines structure, tone, and required details for AI-generated incident summaries shown to investigators';
  const placeholder = type === 'probe'
    ? 'Instructions for AI probing behavior for this pack...'
    : 'Tell the AI how to write the narrative summary for investigators...';
  const iconColor = type === 'probe' ? 'text-blue-400' : 'text-purple-400';
  const bgColor = type === 'probe' ? 'bg-blue-950/20' : 'bg-purple-950/20';
  const borderColor = type === 'probe' ? 'border-blue-500/30' : 'border-purple-500/30';

  useEffect(() => {
    setLocalValue(pack?.[fieldKey] || '');
  }, [pack?.id, fieldKey]);

  const handleSave = async () => {
    await onSave({ [fieldKey]: localValue || '' });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setLocalValue(pack?.[fieldKey] || '');
    setIsEditing(false);
  };

  // Build pills
  const pills = [];
  if (localValue) {
    const wordCount = localValue.trim().split(/\s+/).length;
    pills.push({ label: `${wordCount} words`, className: 'bg-slate-700/50 text-slate-300 border border-slate-600' });
  }

  return (
    <CollapsibleSection
      title={title}
      subtitle={subtitle}
      icon={type === 'probe' ? Sparkles : FileText}
      iconColor={iconColor}
      bgColor={bgColor}
      borderColor={borderColor}
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
        <Textarea
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          className="bg-slate-800 border-slate-600 text-white min-h-64"
          placeholder={placeholder}
        />
      ) : (
        <div className="max-h-[280px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800/50">
          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
            {localValue || 'No instructions provided'}
          </p>
        </div>
      )}
    </CollapsibleSection>
  );
}