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

  const handleSave = async () => {
    if (!pack) return;
    
    try {
      const payload = {
        pack_name: formData.pack_name,
        description: formData.description,
        behavior_type: formData.behavior_type,
        requires_completion: formData.requires_completion,
        max_probe_loops: formData.max_probe_loops ? parseInt(formData.max_probe_loops) : null,
        max_ai_followups: formData.max_ai_followups ? parseInt(formData.max_ai_followups) : 3,
        ai_probe_instructions: formData.ai_probe_instructions || '',
        ai_summary_instructions: formData.ai_summary_instructions || '',
        active: formData.active,
        category_id: formData.categoryId || null,
        instance_header_template: formData.instance_header_template || '',
        instance_title_format: formData.instance_title_format || '',
        label_mapping_overrides: formData.label_mapping_overrides || null
      };
      
      console.log('[PACK-SAVE] Starting save', {
        packId: pack.followup_pack_id,
        categoryId: formData.categoryId,
        hasSummaryInstructions: !!formData.ai_summary_instructions,
        summaryLength: formData.ai_summary_instructions?.length || 0,
      });
      console.log('[PACK-SAVE] Update data full', JSON.stringify(payload, null, 2));
      
      // Save to database
      const updatedPack = await base44.entities.FollowUpPack.update(pack.id, payload);
      
      console.log('[PACK-SAVE] Database response full', JSON.stringify(updatedPack, null, 2));
      
      // Update local form data immediately with saved values
      setFormData({
        pack_name: updatedPack.pack_name || formData.pack_name,
        description: updatedPack.description || formData.description,
        behavior_type: updatedPack.behavior_type || formData.behavior_type,
        requires_completion: updatedPack.requires_completion !== false,
        max_probe_loops: updatedPack.max_probe_loops || '',
        max_ai_followups: updatedPack.max_ai_followups ?? 3,
        ai_probe_instructions: updatedPack.ai_probe_instructions || '',
        ai_summary_instructions: updatedPack.ai_summary_instructions || '',
        active: updatedPack.active !== false,
        categoryId: updatedPack.category_id || formData.categoryId,
        instance_header_template: updatedPack.instance_header_template || '',
        instance_title_format: updatedPack.instance_title_format || '',
        label_mapping_overrides: updatedPack.label_mapping_overrides || null
      });
      
      // Exit edit mode immediately
      setIsEditing(false);
      
      toast.success('Pack updated successfully');
      
      // Notify parent to refetch (without navigating away)
      onUpdate(updatedPack);
      
    } catch (err) {
      console.error('[PACK-SAVE] Error:', err);
      toast.error('Failed to save pack: ' + (err.message || 'Unknown error'));
    }
  };

  const handleNavigateToQuestion = (questionId) => {
    navigate(createPageUrl(`InterviewStructureManager?questionId=${questionId}`));
  };

  const handleAddQuestion = async () => {
    if (!newQuestion.question_text.trim() || !pack) return;
    
    try {
      const maxOrder = Math.max(0, ...questions.map(q => q.display_order || 0));
      await base44.entities.FollowUpQuestion.create({
        followup_question_id: `${pack.followup_pack_id}_Q${Date.now()}`,
        followup_pack_id: pack.followup_pack_id,
        question_text: newQuestion.question_text,
        response_type: newQuestion.response_type,
        display_order: maxOrder + 1,
        active: true
      });
      
      setNewQuestion({ question_text: '', response_type: 'text', active: true });
      setShowAddQuestion(false);
      onUpdate();
      toast.success('Question added');
    } catch (err) {
      toast.error('Failed to add question');
    }
  };

  const handleUpdateQuestion = async (questionId, updates) => {
    try {
      await base44.entities.FollowUpQuestion.update(questionId, updates);
      setEditingQuestion(null);
      onUpdate();
      toast.success('Question updated');
    } catch (err) {
      toast.error('Failed to update question');
    }
  };

  const handleDeleteQuestion = async (questionId) => {
    try {
      await base44.entities.FollowUpQuestion.delete(questionId);
      // Remove from local state immediately (no refresh)
      setLocalDeletedQuestionIds(prev => [...prev, questionId]);
      setShowQuestionDeleteConfirm(false);
      setQuestionToDelete(null);
      toast.success('Question deleted');
    } catch (err) {
      toast.error('Failed to delete question');
    }
  };

  const handleReorderQuestion = async (questionId, direction) => {
    const sortedQuestions = [...questions].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    const currentIndex = sortedQuestions.findIndex(q => q.id === questionId);
    if (currentIndex === -1) return;
    
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= sortedQuestions.length) return;
    
    try {
      const items = [...sortedQuestions];
      const [moved] = items.splice(currentIndex, 1);
      items.splice(newIndex, 0, moved);
      
      await Promise.all(items.map((q, idx) => 
        base44.entities.FollowUpQuestion.update(q.id, { display_order: idx + 1 })
      ));
      
      onUpdate();
      toast.success('Question order updated');
    } catch (err) {
      toast.error('Failed to reorder question');
    }
  };

  // Filter out locally deleted questions to avoid refresh
  const filteredQuestions = questions.filter(q => !localDeletedQuestionIds.includes(q.id));
  const sortedQuestions = [...filteredQuestions].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  const sortedTriggeringQuestions = [...triggeringQuestions].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  
  // Always start collapsed
  useEffect(() => {
    setIsTriggeringExpanded(false);
    setIsFollowupQuestionsExpanded(false);
  }, [pack?.id]);

  // Reset local deleted IDs when pack changes
  useEffect(() => {
    setLocalDeletedQuestionIds([]);
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
    <div className="space-y-6">
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
                    behavior_type: pack.behavior_type || 'standard',
                    requires_completion: pack.requires_completion !== false,
                    max_probe_loops: pack.max_probe_loops || '',
                    max_ai_followups: pack.max_ai_followups ?? 3,
                    ai_probe_instructions: pack.ai_probe_instructions || '',
                    ai_summary_instructions: pack.ai_summary_instructions || '',
                    active: pack.active !== false,
                    categoryId: categoryIdCancel,
                    instance_header_template: pack.instance_header_template || '',
                    instance_title_format: pack.instance_title_format || '',
                    label_mapping_overrides: pack.label_mapping_overrides || null
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
                onClick={handleSave}
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
        <div className="bg-yellow-950/30 border border-yellow-500/50 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-yellow-400 mb-1">No Triggering Questions</h4>
            <p className="text-xs text-slate-300">
              This follow-up pack has no interview questions assigned to trigger it. It will never be used in interviews.
            </p>
          </div>
        </div>
      )}

      {/* Category */}
      <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
        <Label className="text-lg font-semibold text-white mb-3 block">Category</Label>
        {isEditing ? (
          <Select
            value={formData.categoryId}
            onValueChange={(v) => setFormData({...formData, categoryId: v})}
          >
            <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
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
          <div>
            <Badge className="bg-amber-500/20 border-amber-500/50 text-amber-300 mb-2 text-xs font-medium">
              {categoryInfo?.label || "Uncategorized"}
            </Badge>
            {categoryInfo && (
              <p className="text-sm text-slate-400 leading-relaxed mt-2">{categoryInfo.description}</p>
            )}
          </div>
        )}
      </div>

      {/* Description */}
      <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
        <Label className="text-lg font-semibold text-white mb-3 block">Description & Purpose</Label>
        {isEditing ? (
          <Textarea
            value={formData.description}
            onChange={(e) => setFormData({...formData, description: e.target.value})}
            className="bg-slate-800 border-slate-600 text-white min-h-24"
            placeholder="Admin-facing description of what this pack captures..."
          />
        ) : (
          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
            {formData.description || 'No description provided'}
          </p>
        )}
      </div>

      {/* Display / Template Settings - NEW CARD */}
      <DisplayTemplateSettings
        pack={pack}
        isExpanded={isDisplaySettingsExpanded}
        onToggleExpand={() => setIsDisplaySettingsExpanded(!isDisplaySettingsExpanded)}
        isEditing={isEditing}
        formData={formData}
        setFormData={setFormData}
      />

      {/* Pack Configuration */}
      <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
        <Label className="text-lg font-semibold text-white mb-3 block">Pack Configuration</Label>
        
        {isEditing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm text-slate-400">Behavior Type</Label>
                <Select
                  value={formData.behavior_type}
                  onValueChange={(v) => setFormData({...formData, behavior_type: v})}
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

              {formData.behavior_type === 'multi_incident' && (
                <div>
                  <Label className="text-sm text-slate-400">Max Probe Loops</Label>
                  <Input
                    type="number"
                    value={formData.max_probe_loops}
                    onChange={(e) => setFormData({...formData, max_probe_loops: e.target.value})}
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
                value={formData.max_ai_followups}
                onChange={(e) => setFormData({...formData, max_ai_followups: e.target.value})}
                className="bg-slate-800 border-slate-600 text-white"
                placeholder="Default: 3"
              />
              <p className="text-xs text-slate-500 mt-1">
                Maximum AI probing questions per pack instance (0-10)
              </p>
            </div>

            <div className="flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-lg p-3">
              <Label className="text-sm text-slate-400">Requires Completion</Label>
              <Switch
                checked={formData.requires_completion}
                onCheckedChange={(checked) => setFormData({...formData, requires_completion: checked})}
                className="data-[state=checked]:bg-emerald-600"
              />
            </div>

            <div className="flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-lg p-3">
              <Label className="text-sm text-slate-400">Active</Label>
              <Switch
                checked={formData.active}
                onCheckedChange={(checked) => setFormData({...formData, active: checked})}
                className="data-[state=checked]:bg-emerald-600"
              />
            </div>
          </div>
        ) : (
          <div className="flex gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs font-medium border-slate-600 text-slate-300">
              {formData.behavior_type}
            </Badge>
            {pack.requires_completion && (
              <Badge className="text-xs font-medium bg-orange-500/20 border-orange-500/50 text-orange-400">
                Required
              </Badge>
            )}
            {pack.max_probe_loops && (
              <Badge variant="outline" className="text-xs font-medium border-slate-600 text-slate-300">
                Max {pack.max_probe_loops} loops
              </Badge>
            )}
            {pack.active === false && (
              <Badge variant="outline" className="text-xs font-medium border-red-600 text-red-400">
                Inactive
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* AI Probe Instructions */}
      <div className="bg-blue-950/20 border border-blue-500/30 rounded-lg p-4">
        <button
          onClick={() => !isEditing && setIsProbeInstructionsExpanded(!isProbeInstructionsExpanded)}
          className="w-full flex items-center gap-3 group"
          disabled={isEditing}
        >
          {!isEditing && (
            <ChevronRight className={`w-5 h-5 text-blue-400 group-hover:text-blue-300 transition-transform ${isProbeInstructionsExpanded ? 'rotate-90' : ''}`} />
          )}
          <div className="flex-1 text-left">
            <Label className="text-lg font-semibold text-blue-400 cursor-pointer block">AI Probe Instructions</Label>
            <p className="text-xs text-slate-400 mt-0.5">Controls how AI probes for missing details, clarifies vague answers, and handles sensitive topics</p>
          </div>
        </button>
        {isEditing ? (
          <Textarea
            value={formData.ai_probe_instructions}
            onChange={(e) => setFormData({...formData, ai_probe_instructions: e.target.value})}
            className="bg-slate-800 border-slate-600 text-white min-h-64 mt-3"
            placeholder="Instructions for AI probing behavior for this pack..."
          />
        ) : isProbeInstructionsExpanded && (
          <div className="max-h-[280px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800/50 mt-3">
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
              {formData.ai_probe_instructions || 'No instructions provided'}
            </p>
          </div>
        )}
      </div>

      {/* AI Investigator Summary Instructions */}
              <div className="bg-purple-950/20 border border-purple-500/30 rounded-lg p-4">
                <button
                  onClick={() => !isEditing && setIsSummaryInstructionsExpanded(!isSummaryInstructionsExpanded)}
                  className="w-full flex items-center gap-3 group"
                  disabled={isEditing}
                >
                  {!isEditing && (
                    <ChevronRight className={`w-5 h-5 text-purple-400 group-hover:text-purple-300 transition-transform ${isSummaryInstructionsExpanded ? 'rotate-90' : ''}`} />
                  )}
                  <div className="flex-1 text-left">
                    <Label className="text-lg font-semibold text-purple-400 cursor-pointer block">AI Investigator Summary Instructions</Label>
                    <p className="text-xs text-slate-400 mt-0.5">Defines structure, tone, and required details for AI-generated incident summaries shown to investigators</p>
                  </div>
                </button>
                {isEditing ? (
                  <>
                    <Textarea
                      value={formData.ai_summary_instructions}
                      onChange={(e) => setFormData({...formData, ai_summary_instructions: e.target.value})}
                      className="bg-slate-800 border-slate-600 text-white min-h-64 mt-3"
                      placeholder="Tell the AI how to write the narrative summary for investigators. You can specify required details (who, what, when, where, why, impact, risk, etc.), tone, level of detail, and how to describe risk."
                    />
                    <p className="text-xs text-slate-500 mt-2">
                      Tell the AI how to write the narrative summary for investigators. You can specify required details (who, what, when, where, why, impact, risk, etc.), tone, level of detail, and how to describe risk.
                    </p>
                  </>
                ) : isSummaryInstructionsExpanded && (
                  <div className="max-h-[280px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800/50 mt-3">
                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                      {formData.ai_summary_instructions || 'No investigator summary instructions configured yet.'}
                    </p>
                  </div>
                )}
              </div>

              {/* Triggering Questions */}
      <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-lg p-4">
        <button
          onClick={() => setIsTriggeringExpanded(!isTriggeringExpanded)}
          className="w-full flex items-center gap-3 group"
        >
          <ChevronRight className={`w-5 h-5 text-emerald-400 group-hover:text-emerald-300 transition-transform ${isTriggeringExpanded ? 'rotate-90' : ''}`} />
          <div className="flex-1 text-left">
            <h4 className="text-lg font-semibold text-emerald-400">
                                Triggering Questions ({sortedTriggeringQuestions.length})
                              </h4>
            <p className="text-xs text-slate-400 mt-0.5">Interview questions where a "Yes" answer triggers this pack — manage these in Interview Structure</p>
          </div>
        </button>
        {sortedTriggeringQuestions.length === 0 ? (
          <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 text-center mt-3">
            <p className="text-sm text-slate-400">
              No interview questions currently trigger this pack.
            </p>
          </div>
        ) : isTriggeringExpanded && (
          <div className="space-y-2 mt-3">
            {sortedTriggeringQuestions.map((q) => (
              <button
                key={q.id}
                onClick={() => handleNavigateToQuestion(q.question_id)}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg p-3 hover:border-emerald-500/50 hover:bg-slate-800/70 transition-all text-left group"
              >
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="font-mono text-xs font-medium border-slate-600 text-blue-400 group-hover:border-blue-500 group-hover:text-blue-300 transition-colors">
                    {q.question_id}
                  </Badge>
                  <p className="text-base font-medium text-slate-300 leading-relaxed flex-1 group-hover:text-white transition-colors">
                    {q.question_text}
                  </p>
                  <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors flex-shrink-0" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Deterministic Questions */}
      <div className="bg-pink-950/20 border border-pink-500/30 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsFollowupQuestionsExpanded(!isFollowupQuestionsExpanded)}
            className="flex items-center gap-3 group flex-1"
          >
            <ChevronRight className={`w-5 h-5 text-pink-400 group-hover:text-pink-300 transition-transform ${isFollowupQuestionsExpanded ? 'rotate-90' : ''}`} />
            <div className="flex-1 text-left">
              <h4 className="text-lg font-semibold text-pink-400">Follow-Up Questions ({sortedQuestions.length})</h4>
              <p className="text-xs text-slate-400 mt-0.5">Fixed questions asked every time this pack is triggered — candidate answers all before AI probing begins</p>
            </div>
          </button>
          {isFollowupQuestionsExpanded && (
            <Button
              onClick={() => setShowAddQuestion(true)}
              size="sm"
              className="bg-pink-600 hover:bg-pink-700"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          )}
        </div>

        {isFollowupQuestionsExpanded && showAddQuestion && (
          <div className="bg-slate-900/50 border border-purple-500/50 rounded-lg p-3 mb-3">
            <div className="space-y-2">
              <Textarea
                placeholder="Question text..."
                value={newQuestion.question_text}
                onChange={(e) => setNewQuestion({...newQuestion, question_text: e.target.value})}
                className="bg-slate-800 border-slate-600 text-white min-h-20"
              />
              <div className="flex gap-2">
                <Select
                  value={newQuestion.response_type}
                  onValueChange={(v) => setNewQuestion({...newQuestion, response_type: v})}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(RESPONSE_TYPE_NAMES).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleAddQuestion} className="bg-emerald-600 hover:bg-emerald-700">
                  Save
                </Button>
                <Button variant="outline" onClick={() => setShowAddQuestion(false)} className="border-slate-600">
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {isFollowupQuestionsExpanded && sortedQuestions.length === 0 ? (
          <div className="text-center py-6 text-slate-400 bg-slate-900/50 rounded-lg border border-slate-700 mt-3">
            <p className="text-sm">No deterministic questions yet.</p>
          </div>
        ) : isFollowupQuestionsExpanded && sortedQuestions.length > 0 && (
          <div className="space-y-2 mt-3">
            {sortedQuestions.map((q, idx) => (
              <div key={q.id} className="bg-slate-900/50 border border-slate-700 rounded-lg p-2">
                {editingQuestion?.id === q.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editingQuestion.question_text}
                      onChange={(e) => setEditingQuestion({...editingQuestion, question_text: e.target.value})}
                      className="bg-slate-800 border-slate-600 text-white min-h-20"
                    />
                    <div className="flex gap-2">
                      <Button 
                        size="sm"
                        onClick={() => handleUpdateQuestion(q.id, { question_text: editingQuestion.question_text })}
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        Save
                      </Button>
                      <Button 
                        size="sm"
                        variant="outline" 
                        onClick={() => setEditingQuestion(null)}
                        className="border-slate-600"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleReorderQuestion(q.id, 'up')}
                        disabled={idx === 0}
                        className="h-6 w-6 p-0 text-slate-400 hover:text-white"
                      >
                        <ChevronDown className="w-4 h-4 rotate-180" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleReorderQuestion(q.id, 'down')}
                        disabled={idx === sortedQuestions.length - 1}
                        className="h-6 w-6 p-0 text-slate-400 hover:text-white"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                      <span className="text-sm font-bold text-purple-300">#{idx + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white break-words leading-snug">{q.question_text}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Switch
                        checked={q.active !== false}
                        onCheckedChange={(checked) => handleUpdateQuestion(q.id, { active: checked })}
                        className="data-[state=checked]:bg-emerald-600"
                      />
                      <span className="text-xs text-slate-400">
                        {q.active !== false ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingQuestion(q)}
                        className="h-8 w-8 p-0 text-slate-400 hover:text-white"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setQuestionToDelete(q);
                          setShowQuestionDeleteConfirm(true);
                        }}
                        className="h-8 w-8 p-0 text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

        {/* Follow-Up Fields (Structured Data) */}
        <FollowUpFieldDesigner
          pack={pack}
          isExpanded={isFieldsExpanded}
          onToggleExpand={() => setIsFieldsExpanded(!isFieldsExpanded)}
          onSaveFields={async (updatedFields) => {
            console.log('[PACK-FIELDS-SAVE] onSaveFields called', { packId: pack.id, fieldCount: updatedFields.length, fields: updatedFields });
            try {
              const updatedPack = await base44.entities.FollowUpPack.update(pack.id, { field_config: updatedFields });
              console.log('[PACK-FIELDS-SAVE] Database update success', updatedPack);
              onUpdate({ ...pack, field_config: updatedFields });
              toast.success('Fields saved to database');
              return true;
            } catch (err) {
              console.error('[PACK-FIELDS-SAVE] Database update failed:', err);
              toast.error('Failed to save fields: ' + (err.message || 'Unknown error'));
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

      {/* Delete Question Confirmation Dialog */}
      <AlertDialog open={showQuestionDeleteConfirm} onOpenChange={setShowQuestionDeleteConfirm}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete this question?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This will permanently delete the question. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={() => setQuestionToDelete(null)}
              className="border-slate-600 text-slate-300"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => questionToDelete && handleDeleteQuestion(questionToDelete.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}