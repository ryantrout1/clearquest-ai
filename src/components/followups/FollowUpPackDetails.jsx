import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Package, Edit, Trash, AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { FOLLOWUP_CATEGORIES, mapPackToCategory } from "./categoryMapping";
import FollowUpFieldDesigner from "./FollowUpFieldDesigner";
import DisplayTemplateSettings from "./DisplayTemplateSettings";
import PackConfigurationSection from "./PackConfigurationSection";
import AIInstructionsSection from "./AIInstructionsSection";
import TriggeringQuestionsSection from "./TriggeringQuestionsSection";
import FollowUpQuestionsSection from "./FollowUpQuestionsSection";

export default function FollowUpPackDetails({ 
  pack, 
  questions,
  triggeringQuestions,
  onUpdate,
  onDelete
}) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({});
  const [isEditing, setIsEditing] = useState(false);
  
  // Section expansion states
  const [isDisplaySettingsExpanded, setIsDisplaySettingsExpanded] = useState(false);
  const [isConfigExpanded, setIsConfigExpanded] = useState(false);
  const [isProbeInstructionsExpanded, setIsProbeInstructionsExpanded] = useState(false);
  const [isSummaryInstructionsExpanded, setIsSummaryInstructionsExpanded] = useState(false);
  const [isTriggeringExpanded, setIsTriggeringExpanded] = useState(false);
  const [isFollowupQuestionsExpanded, setIsFollowupQuestionsExpanded] = useState(false);
  const [isFieldsExpanded, setIsFieldsExpanded] = useState(false);
  
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showFinalDeleteConfirm, setShowFinalDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!pack) return;
    
    const categoryId = pack.category_id || mapPackToCategory(pack.followup_pack_id);
    setFormData({
      pack_name: pack.pack_name || '',
      description: pack.description || '',
      categoryId: categoryId
    });
  }, [pack?.followup_pack_id]);

  // Save basic info (name, description, category)
  const handleSaveBasicInfo = async () => {
    if (!pack) return;
    
    try {
      const payload = {
        pack_name: formData.pack_name,
        description: formData.description,
        category_id: formData.categoryId || null
      };
      
      const updatedPack = await base44.entities.FollowUpPack.update(pack.id, payload);
      
      setFormData({
        pack_name: updatedPack.pack_name || formData.pack_name,
        description: updatedPack.description || formData.description,
        categoryId: updatedPack.category_id || formData.categoryId
      });
      
      setIsEditing(false);
      toast.success('Pack updated');
      onUpdate(updatedPack);
    } catch (err) {
      console.error('[PACK-SAVE] Error:', err);
      toast.error('Failed to save pack');
    }
  };

  // Generic section save handler
  const handleSectionSave = async (updates) => {
    if (!pack) return;
    
    try {
      const updatedPack = await base44.entities.FollowUpPack.update(pack.id, updates);
      toast.success('Saved');
      onUpdate(updatedPack);
    } catch (err) {
      console.error('[SECTION-SAVE] Error:', err);
      toast.error('Failed to save');
      throw err;
    }
  };
  
  // Reset expansion states when pack changes
  useEffect(() => {
    setIsDisplaySettingsExpanded(false);
    setIsConfigExpanded(false);
    setIsProbeInstructionsExpanded(false);
    setIsSummaryInstructionsExpanded(false);
    setIsTriggeringExpanded(false);
    setIsFollowupQuestionsExpanded(false);
    setIsFieldsExpanded(false);
  }, [pack?.id]);

  if (!pack) {
    return (
      <div className="text-center py-12">
        <Package className="w-16 h-16 text-slate-600 mx-auto mb-4" />
        <p className="text-lg font-semibold text-slate-400 mb-2">Select a pack to view details</p>
        <p className="text-sm text-slate-500">Choose a pack from the middle column</p>
      </div>
    );
  }

  const categoryInfo = FOLLOWUP_CATEGORIES.find(c => c.id === formData.categoryId);
  const hasNoTriggers = triggeringQuestions.length === 0;
  const canDelete = triggeringQuestions.length === 0;

  const handleDeletePack = async () => {
    if (!pack || !canDelete) return;
    try {
      await base44.entities.FollowUpPack.delete(pack.id);
      toast.success('Pack deleted successfully');
      setShowFinalDeleteConfirm(false);
      if (onDelete) onDelete(pack.id);
    } catch (err) {
      console.error('Failed to delete pack:', err);
      toast.error('Failed to delete pack');
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <Input
              value={formData.pack_name}
              onChange={(e) => setFormData({...formData, pack_name: e.target.value})}
              className="text-lg font-semibold bg-slate-800 border-slate-600 text-white"
            />
          ) : (
            <h3 className="text-xl font-semibold text-white">{formData.pack_name}</h3>
          )}
          <p className="text-xs text-slate-500 font-mono mt-1">{pack.followup_pack_id}</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {!isEditing ? (
            <>
              <Button
                onClick={() => setIsEditing(true)}
                size="sm"
                className="bg-purple-600 hover:bg-purple-700"
              >
                <Edit className="w-4 h-4 mr-1.5" />
                Edit
              </Button>
              <Button
                onClick={() => setShowDeleteConfirm(true)}
                size="sm"
                variant="outline"
                className="border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-300"
              >
                <Trash className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={() => {
                  const categoryIdCancel = pack.category_id || mapPackToCategory(pack.followup_pack_id);
                  setFormData({
                    pack_name: pack.pack_name || '',
                    description: pack.description || '',
                    categoryId: categoryIdCancel
                  });
                  setIsEditing(false);
                }}
                size="sm"
                variant="outline"
                className="border-slate-600 text-slate-300"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveBasicInfo}
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                Save
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Warning for no triggers */}
      {hasNoTriggers && (
        <div className="bg-yellow-950/30 border border-yellow-500/50 rounded-lg p-3 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-yellow-400 mb-1">No Triggering Questions</h4>
            <p className="text-xs text-slate-300">
              This follow-up pack has no interview questions assigned to trigger it.
            </p>
          </div>
        </div>
      )}

      {/* Category - Compact single line */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-400">Category:</span>
        {isEditing ? (
          <Select
            value={formData.categoryId}
            onValueChange={(v) => setFormData({...formData, categoryId: v})}
          >
            <SelectTrigger className="bg-slate-800 border-slate-600 text-white h-8 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FOLLOWUP_CATEGORIES.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-sm font-medium text-amber-300">
            {categoryInfo?.label || "Uncategorized"}
          </span>
        )}
      </div>

      {/* Description & Purpose */}
      <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
        <Label className="text-sm font-semibold text-white mb-2 block">Description & Purpose</Label>
        {isEditing ? (
          <Textarea
            value={formData.description}
            onChange={(e) => setFormData({...formData, description: e.target.value})}
            className="bg-slate-800 border-slate-600 text-white min-h-20"
            placeholder="Admin-facing description of what this pack captures..."
          />
        ) : (
          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
            {formData.description || 'No description provided'}
          </p>
        )}
      </div>

      {/* Display / Template Settings */}
      <DisplayTemplateSettings
        pack={pack}
        isExpanded={isDisplaySettingsExpanded}
        onToggleExpand={() => setIsDisplaySettingsExpanded(!isDisplaySettingsExpanded)}
        onSave={handleSectionSave}
      />

      {/* Pack Configuration */}
      <PackConfigurationSection
        pack={pack}
        isExpanded={isConfigExpanded}
        onToggleExpand={() => setIsConfigExpanded(!isConfigExpanded)}
        onSave={handleSectionSave}
      />

      {/* AI Probe Instructions */}
      <AIInstructionsSection
        pack={pack}
        type="probe"
        isExpanded={isProbeInstructionsExpanded}
        onToggleExpand={() => setIsProbeInstructionsExpanded(!isProbeInstructionsExpanded)}
        onSave={handleSectionSave}
      />

      {/* AI Investigator Summary Instructions */}
      <AIInstructionsSection
        pack={pack}
        type="summary"
        isExpanded={isSummaryInstructionsExpanded}
        onToggleExpand={() => setIsSummaryInstructionsExpanded(!isSummaryInstructionsExpanded)}
        onSave={handleSectionSave}
      />

      {/* Triggering Questions */}
      <TriggeringQuestionsSection
        triggeringQuestions={triggeringQuestions}
        isExpanded={isTriggeringExpanded}
        onToggleExpand={() => setIsTriggeringExpanded(!isTriggeringExpanded)}
      />

      {/* Follow-Up Questions */}
      <FollowUpQuestionsSection
        pack={pack}
        questions={questions}
        isExpanded={isFollowupQuestionsExpanded}
        onToggleExpand={() => setIsFollowupQuestionsExpanded(!isFollowupQuestionsExpanded)}
        onUpdate={onUpdate}
      />

      {/* Follow-Up Fields (Structured Data) */}
      <FollowUpFieldDesigner
        pack={pack}
        isExpanded={isFieldsExpanded}
        onToggleExpand={() => setIsFieldsExpanded(!isFieldsExpanded)}
        onSaveFields={async (updatedFields) => {
          try {
            const updatedPack = await base44.entities.FollowUpPack.update(pack.id, { field_config: updatedFields });
            onUpdate({ ...pack, field_config: updatedFields });
            toast.success('Fields saved');
            return true;
          } catch (err) {
            toast.error('Failed to save fields');
            throw err;
          }
        }}
      />

      {/* Delete Confirmation Dialog - Step 1 */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete this follow-up pack?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              {canDelete ? (
                <>
                  You are about to delete <span className="text-white font-medium">{pack?.pack_name}</span>. 
                  This will remove the pack configuration, all follow-up questions, and field definitions.
                </>
              ) : (
                <>
                  <span className="text-red-400 font-medium">Cannot delete this pack.</span>
                  <br /><br />
                  This pack is currently assigned to {triggeringQuestions.length} interview question{triggeringQuestions.length !== 1 ? 's' : ''}. 
                  You must remove all trigger assignments in the Interview Structure Manager before deleting this pack.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-600 text-slate-300">Cancel</AlertDialogCancel>
            {canDelete && (
              <AlertDialogAction 
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setShowFinalDeleteConfirm(true);
                }}
                className="bg-red-600 hover:bg-red-700"
              >
                Continue
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog - Step 2 (Final) */}
      <AlertDialog open={showFinalDeleteConfirm} onOpenChange={setShowFinalDeleteConfirm}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-400">Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This action cannot be undone. This will permanently delete the pack 
              <span className="text-white font-medium"> {pack?.pack_name}</span> and all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-600 text-slate-300">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeletePack}
              className="bg-red-600 hover:bg-red-700"
            >
              Yes, delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}