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
import { Package, FileText, ExternalLink, Plus, Edit, Trash2, ChevronDown, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { FOLLOWUP_CATEGORIES, mapPackToCategory } from "./categoryMapping";

const RESPONSE_TYPE_NAMES = {
  'text': 'Text',
  'yes_no': 'Yes/No',
  'date': 'Date',
  'number': 'Number',
  'multi_select': 'Multi-Select'
};

export default function FollowUpPackDetails({ 
  pack, 
  questions,
  triggeringQuestions,
  onUpdate 
}) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({});
  const [isEditing, setIsEditing] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [newQuestion, setNewQuestion] = useState({
    question_text: '',
    response_type: 'text',
    active: true
  });

  useEffect(() => {
    if (pack) {
      console.log('[PACK-LOAD] Selected pack AI config', {
        packId: pack.id,
        hasProbeInstructions: !!pack.ai_probe_instructions,
        hasSummaryInstructions: !!pack.ai_summary_instructions,
      });
      
      const categoryId = pack.category_id || mapPackToCategory(pack.followup_pack_id);
      setFormData({
        pack_name: pack.pack_name || '',
        description: pack.description || '',
        behavior_type: pack.behavior_type || 'standard',
        requires_completion: pack.requires_completion !== false,
        max_probe_loops: pack.max_probe_loops || '',
        max_ai_followups: pack.max_ai_followups ?? 2,
        ai_probe_instructions: pack.ai_probe_instructions || '',
        ai_summary_instructions: pack.ai_summary_instructions || '',
        active: pack.active !== false,
        categoryId: categoryId
      });
      setIsEditing(false);
    }
  }, [pack]);

  const handleSave = async () => {
    try {
      console.log('[PACK-SAVE] Saving AI summary instructions', {
        packId: pack.id,
        hasSummaryInstructions: !!formData.ai_summary_instructions,
        summaryLength: formData.ai_summary_instructions ? formData.ai_summary_instructions.length : 0,
      });
      
      const originalCategory = pack.category_id || mapPackToCategory(pack.followup_pack_id);
      const categoryChanged = originalCategory !== formData.categoryId;
      
      await base44.entities.FollowUpPack.update(pack.id, {
        pack_name: formData.pack_name,
        description: formData.description,
        behavior_type: formData.behavior_type,
        requires_completion: formData.requires_completion,
        max_probe_loops: formData.max_probe_loops ? parseInt(formData.max_probe_loops) : null,
        max_ai_followups: formData.max_ai_followups ? parseInt(formData.max_ai_followups) : 2,
        ai_probe_instructions: formData.ai_probe_instructions,
        ai_summary_instructions: formData.ai_summary_instructions,
        active: formData.active,
        category_id: formData.categoryId
      });
      onUpdate(categoryChanged ? formData.categoryId : null);
      setIsEditing(false);
      toast.success('Pack updated successfully');
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Failed to save pack');
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
    if (!confirm('Delete this question? This cannot be undone.')) return;
    
    try {
      await base44.entities.FollowUpQuestion.delete(questionId);
      onUpdate();
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

  const sortedQuestions = [...questions].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  const sortedTriggeringQuestions = [...triggeringQuestions].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {isEditing ? (
            <Input
              value={formData.pack_name}
              onChange={(e) => setFormData({...formData, pack_name: e.target.value})}
              className="text-lg font-semibold bg-slate-800 border-slate-600 text-white mb-2"
            />
          ) : (
            <h3 className="text-lg font-semibold text-white">{pack.pack_name}</h3>
          )}
          <p className="text-sm text-slate-400 font-mono mt-1">{pack.followup_pack_id}</p>
        </div>
        <div className="flex gap-2">
          {!isEditing ? (
            <Button
              onClick={() => setIsEditing(true)}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
          ) : (
            <>
              <Button
                onClick={() => {
                  const categoryId = pack.category_id || mapPackToCategory(pack.followup_pack_id);
                  setFormData({
                    pack_name: pack.pack_name || '',
                    description: pack.description || '',
                    behavior_type: pack.behavior_type || 'standard',
                    requires_completion: pack.requires_completion !== false,
                    max_probe_loops: pack.max_probe_loops || '',
                    max_ai_followups: pack.max_ai_followups ?? 2,
                    ai_probe_instructions: pack.ai_probe_instructions || '',
                    ai_summary_instructions: pack.ai_summary_instructions || '',
                    active: pack.active !== false,
                    categoryId: categoryId
                  });
                  setIsEditing(false);
                }}
                variant="outline"
                className="border-slate-600"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
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
            {pack.description || 'No description provided'}
          </p>
        )}
      </div>

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
                placeholder="Default: 2"
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
        <Label className="text-lg font-semibold text-blue-400 mb-3 block">AI Probe Instructions</Label>
        {isEditing ? (
          <Textarea
            value={formData.ai_probe_instructions}
            onChange={(e) => setFormData({...formData, ai_probe_instructions: e.target.value})}
            className="bg-slate-800 border-slate-600 text-white min-h-32"
            placeholder="Instructions for AI probing behavior for this pack..."
          />
        ) : (
          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
            {pack.ai_probe_instructions || 'No instructions provided'}
          </p>
        )}
      </div>

      {/* AI Investigator Summary Instructions */}
      <div className="bg-purple-950/20 border border-purple-500/30 rounded-lg p-4">
        <Label className="text-lg font-semibold text-purple-400 mb-3 block">AI Investigator Summary Instructions</Label>
        <p className="text-xs text-slate-400 mb-3">
          Used to guide AI when generating narrative summaries for investigators about this incident type.
        </p>
        {isEditing ? (
          <>
            <Textarea
              value={formData.ai_summary_instructions}
              onChange={(e) => setFormData({...formData, ai_summary_instructions: e.target.value})}
              className="bg-slate-800 border-slate-600 text-white min-h-32"
              placeholder="Tell the AI how to write the narrative summary for investigators. You can specify required details (who, what, when, where, why, impact, risk, etc.), tone, level of detail, and how to describe risk."
            />
            <p className="text-xs text-slate-500 mt-2">
              Tell the AI how to write the narrative summary for investigators. You can specify required details (who, what, when, where, why, impact, risk, etc.), tone, level of detail, and how to describe risk.
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
            {pack.ai_summary_instructions || 'No investigator summary instructions configured yet.'}
          </p>
        )}
      </div>

      {/* Triggering Questions */}
      <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-lg p-4">
        <h4 className="text-lg font-semibold text-emerald-400 mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Triggered by {sortedTriggeringQuestions.length} Interview {sortedTriggeringQuestions.length === 1 ? 'Question' : 'Questions'}
        </h4>
        {sortedTriggeringQuestions.length === 0 ? (
          <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 text-center">
            <p className="text-sm text-slate-400">
              No interview questions currently trigger this pack.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
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
      <div className="bg-purple-950/20 border border-purple-500/30 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-lg font-semibold text-purple-400">Follow-Up Questions ({sortedQuestions.length})</h4>
          <Button
            onClick={() => setShowAddQuestion(true)}
            size="sm"
            className="bg-purple-600 hover:bg-purple-700"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
        </div>

        {showAddQuestion && (
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

        {sortedQuestions.length === 0 ? (
          <div className="text-center py-6 text-slate-400 bg-slate-900/50 rounded-lg border border-slate-700">
            <p className="text-sm">No deterministic questions yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
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
                        onClick={() => handleDeleteQuestion(q.id)}
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
    </div>
  );
}