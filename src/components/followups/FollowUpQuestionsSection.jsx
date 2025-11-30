import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { MessageSquare, Plus, Edit, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import CollapsibleSection from "./CollapsibleSection";

const RESPONSE_TYPE_NAMES = {
  'text': 'Text',
  'yes_no': 'Yes/No',
  'date': 'Date',
  'number': 'Number',
  'multi_select': 'Multi-Select'
};

export default function FollowUpQuestionsSection({
  pack,
  questions,
  isExpanded,
  onToggleExpand,
  onUpdate
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [deleteQuestion, setDeleteQuestion] = useState(null);
  const [newQuestion, setNewQuestion] = useState({
    question_text: '',
    response_type: 'text',
    active: true
  });

  const sortedQuestions = [...questions].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

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
      setShowAddForm(false);
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

  const handleDeleteQuestion = async () => {
    if (!deleteQuestion) return;
    try {
      await base44.entities.FollowUpQuestion.delete(deleteQuestion.id);
      setDeleteQuestion(null);
      onUpdate();
      toast.success('Question deleted');
    } catch (err) {
      toast.error('Failed to delete question');
    }
  };

  const handleReorderQuestion = async (questionId, direction) => {
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

  // Build pills
  const pills = [
    { label: `${sortedQuestions.length} question${sortedQuestions.length !== 1 ? 's' : ''}`, className: 'bg-amber-500/20 text-amber-300 border border-amber-500/30' }
  ];
  if (sortedQuestions.length > 0) {
    pills.push({ label: 'Fixed Sequence', className: 'bg-slate-700/50 text-slate-300 border border-slate-600' });
  }

  return (
    <CollapsibleSection
      title="Follow-Up Questions"
      subtitle="Fixed questions asked every time this pack is triggered — candidate answers all before AI probing begins"
      icon={MessageSquare}
      iconColor="text-amber-400"
      bgColor="bg-amber-950/20"
      borderColor="border-amber-500/30"
      isExpanded={isExpanded}
      onToggleExpand={onToggleExpand}
      pills={pills}
      editable={false}
    >
      {/* Add Button */}
      <div className="mb-3">
        <Button
          onClick={() => setShowAddForm(true)}
          size="sm"
          className="bg-amber-600 hover:bg-amber-700"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Question
        </Button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-slate-900/50 border border-amber-500/50 rounded-lg p-3 mb-3">
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
              <Button variant="outline" onClick={() => setShowAddForm(false)} className="border-slate-600">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Questions List */}
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
                      <ChevronUp className="w-4 h-4" />
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
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                    <span className="text-sm font-bold text-amber-300">#{idx + 1}</span>
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
                      onClick={() => setDeleteQuestion(q)}
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteQuestion} onOpenChange={() => setDeleteQuestion(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete this question?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This will permanently delete the question. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-600 text-slate-300">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteQuestion} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CollapsibleSection>
  );
}