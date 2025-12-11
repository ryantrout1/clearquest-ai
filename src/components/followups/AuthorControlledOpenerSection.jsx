import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ChevronDown, ChevronRight, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import CollapsibleSection from "./CollapsibleSection";

/**
 * Author-Controlled Opener Section
 * Allows pack authors to customize the opening narrative question, example, and AI instructions
 * Only shown for V2 packs
 */
export default function AuthorControlledOpenerSection({ 
  pack, 
  isExpanded, 
  onToggleExpand, 
  onSave 
}) {
  const [localData, setLocalData] = useState({
    use_author_defined_openers: false,
    opening_question_text: '',
    opening_example_narrative: '',
    probing_instruction_text: ''
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Determine if this is a V2 pack - check multiple indicators
  const isV2Pack = 
    pack?.ide_version === 'V2' || 
    pack?.is_standard_cluster === true ||
    pack?.fact_anchors?.length > 0 ||
    pack?.field_config?.length > 0;

  // Load data from pack
  useEffect(() => {
    if (!pack) return;
    
    setLocalData({
      use_author_defined_openers: pack.use_author_defined_openers || false,
      opening_question_text: pack.opening_question_text || '',
      opening_example_narrative: pack.opening_example_narrative || '',
      probing_instruction_text: pack.probing_instruction_text || ''
    });
    setHasChanges(false);
  }, [pack?.id]);

  const handleChange = (field, value) => {
    setLocalData({ ...localData, [field]: value });
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!hasChanges) return;
    
    setIsSaving(true);
    try {
      await onSave({
        use_author_defined_openers: localData.use_author_defined_openers,
        opening_question_text: localData.opening_question_text || null,
        opening_example_narrative: localData.opening_example_narrative || null,
        probing_instruction_text: localData.probing_instruction_text || null
      });
      setHasChanges(false);
    } catch (err) {
      console.error('[AUTHOR_OPENER] Save error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Don't render if not a V2 pack
  if (!isV2Pack) {
    return null;
  }

  const isEnabled = localData.use_author_defined_openers;

  return (
    <CollapsibleSection
      title="Author-Controlled Opener"
      subtitle="V2 Packs Only"
      icon={Sparkles}
      isExpanded={isExpanded}
      onToggle={onToggleExpand}
      hasChanges={hasChanges}
    >
      <div className="space-y-4">
        {/* Enable/Disable Toggle */}
        <div className="flex items-start gap-3 pb-3 border-b border-slate-700/50">
          <Switch
            checked={isEnabled}
            onCheckedChange={(checked) => handleChange('use_author_defined_openers', checked)}
            className="mt-1"
          />
          <div className="flex-1">
            <Label className="text-sm font-semibold text-white">
              Use author-defined opener for this pack
            </Label>
            <p className="text-xs text-slate-400 mt-1">
              When enabled, use the custom fields below instead of the default opening question, example, and AI instructions.
            </p>
          </div>
        </div>

        {/* Opening Question Text */}
        <div className={!isEnabled ? 'opacity-50' : ''}>
          <Label className="text-sm font-semibold text-white mb-2 block">
            Opening Question Text
            <span className="text-slate-500 font-normal ml-2">(shown as the first narrative prompt)</span>
          </Label>
          <Textarea
            value={localData.opening_question_text}
            onChange={(e) => handleChange('opening_question_text', e.target.value)}
            disabled={!isEnabled}
            className="bg-slate-800 border-slate-600 text-white min-h-24 font-mono text-sm"
            placeholder="Example: In your own words, tell me about this incident — who was involved, when it happened, and how it ended."
          />
          {!isEnabled && (
            <p className="text-xs text-slate-500 mt-1">
              This field is ignored unless "Use author-defined opener" is enabled.
            </p>
          )}
        </div>

        {/* Example Narrative */}
        <div className={!isEnabled ? 'opacity-50' : ''}>
          <Label className="text-sm font-semibold text-white mb-2 block">
            Example Narrative
            <span className="text-slate-500 font-normal ml-2">(shown to the candidate as an example)</span>
          </Label>
          <Textarea
            value={localData.opening_example_narrative}
            onChange={(e) => handleChange('opening_example_narrative', e.target.value)}
            disabled={!isEnabled}
            className="bg-slate-800 border-slate-600 text-white min-h-24 font-mono text-sm"
            placeholder="Example: I applied to Phoenix PD in March 2022 for a Police Recruit position. I passed the written test but was disqualified during the background investigation."
          />
          {!isEnabled && (
            <p className="text-xs text-slate-500 mt-1">
              This field is ignored unless "Use author-defined opener" is enabled.
            </p>
          )}
        </div>

        {/* Probing Instructions */}
        <div className={!isEnabled ? 'opacity-50' : ''}>
          <Label className="text-sm font-semibold text-white mb-2 block">
            Probing Instructions
            <span className="text-slate-500 font-normal ml-2">(sent to AI to guide probing and fact extraction)</span>
          </Label>
          <Textarea
            value={localData.probing_instruction_text}
            onChange={(e) => handleChange('probing_instruction_text', e.target.value)}
            disabled={!isEnabled}
            className="bg-slate-800 border-slate-600 text-white min-h-32 font-mono text-sm"
            placeholder="Example: This pack collects facts about prior applications. Focus on extracting: (1) agency name, (2) position, (3) date, (4) outcome. Ask follow-ups ONLY when core facts are missing."
          />
          {!isEnabled && (
            <p className="text-xs text-slate-500 mt-1">
              This field is ignored unless "Use author-defined opener" is enabled.
            </p>
          )}
        </div>

        {/* Save Button */}
        {hasChanges && (
          <div className="flex justify-end pt-2 border-t border-slate-700/50">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Save className="w-4 h-4 mr-1.5" />
              {isSaving ? 'Saving...' : 'Save Author Opener Settings'}
            </Button>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}