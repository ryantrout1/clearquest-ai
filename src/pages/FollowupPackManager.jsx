import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ChevronLeft, Plus, Edit, Trash2, GripVertical, Package, Layers, AlertCircle } from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { toast } from "sonner";

const BEHAVIOR_TYPE_NAMES = {
  'standard': 'Standard',
  'strict': 'Strict',
  'light': 'Light',
  'multi_incident': 'Multi-Incident'
};

export default function FollowupPackManager() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [user, setUser] = useState(null);
  const [selectedPack, setSelectedPack] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteInput, setDeleteInput] = useState("");

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const adminAuth = sessionStorage.getItem("clearquest_admin_auth");
    if (adminAuth) {
      try {
        const auth = JSON.parse(adminAuth);
        if (auth.role !== 'SUPER_ADMIN') {
          navigate(createPageUrl("HomeHub"));
          return;
        }
        setUser(auth);
      } catch (err) {
        navigate(createPageUrl("AdminLogin"));
      }
    } else {
      try {
        const currentUser = await base44.auth.me();
        if (currentUser.role !== 'SUPER_ADMIN') {
          navigate(createPageUrl("HomeHub"));
          return;
        }
        setUser(currentUser);
      } catch (err) {
        navigate(createPageUrl("AdminLogin"));
      }
    }
  };

  const { data: packs = [], isLoading: packsLoading } = useQuery({
    queryKey: ['followUpPacks'],
    queryFn: () => base44.entities.FollowUpPack.list(),
    enabled: !!user
  });

  const { data: allQuestions = [] } = useQuery({
    queryKey: ['followUpQuestions'],
    queryFn: () => base44.entities.FollowUpQuestion.list(),
    enabled: !!user
  });

  const sortedPacks = [...packs].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

  const createNewPack = async () => {
    try {
      const maxOrder = Math.max(0, ...packs.map(p => p.display_order || 0));
      const newPack = await base44.entities.FollowUpPack.create({
        followup_pack_id: `PACK_NEW_${Date.now()}`,
        pack_name: "New Follow-Up Pack",
        description: "Description of this follow-up pack",
        behavior_type: "standard",
        requires_completion: true,
        active: true,
        display_order: maxOrder + 1,
        trigger_notes: "Define when this pack should be triggered",
        ai_probe_instructions: "For any YES response linked to this follow-up pack, collect detailed, incident-by-incident information including date, location, context, actions taken, outcomes, and whether the candidate reported the incident. Ask follow-up questions until the investigator has enough detail to understand the full pattern of behavior."
      });
      queryClient.invalidateQueries({ queryKey: ['followUpPacks'] });
      setSelectedPack(newPack);
      toast.success('New pack created');
    } catch (err) {
      console.error('Error creating pack:', err);
      toast.error('Failed to create pack');
    }
  };

  const handlePackDragEnd = async (result) => {
    if (!result.destination) return;
    
    const items = Array.from(sortedPacks);
    const [reordered] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reordered);

    try {
      await Promise.all(items.map((pack, index) => 
        base44.entities.FollowUpPack.update(pack.id, { display_order: index + 1 })
      ));
      queryClient.invalidateQueries({ queryKey: ['followUpPacks'] });
      toast.success('Pack order updated');
    } catch (err) {
      toast.error('Failed to reorder packs');
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-slate-300">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a]">
      <div className="border-b border-slate-700/50 bg-[#1e293b]/80 backdrop-blur-sm px-6 py-4">
        <div className="max-w-[1600px] mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(createPageUrl("HomeHub"))}
                className="text-slate-300 hover:text-white -ml-2"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
              <Package className="w-6 h-6 text-purple-400" />
              <div>
                <h1 className="text-xl font-bold text-white">Follow-Up Pack Manager</h1>
                <p className="text-xs text-slate-400">Configure follow-up packs and their probing questions</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-6">
        <div className="max-w-[1600px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 bg-slate-800/30 border border-slate-700/50 rounded-lg p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-white">Follow-Up Packs</h2>
                <Button
                  onClick={createNewPack}
                  size="sm"
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  New Pack
                </Button>
              </div>

              {packsLoading ? (
                <p className="text-slate-400 text-center py-8">Loading packs...</p>
              ) : sortedPacks.length === 0 ? (
                <p className="text-slate-400 text-center py-8">No packs yet. Create your first pack to get started.</p>
              ) : (
                <DragDropContext onDragEnd={handlePackDragEnd}>
                  <Droppable droppableId="packs">
                    {(provided) => (
                      <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                        {sortedPacks.map((pack, index) => {
                          const packQuestions = allQuestions.filter(q => q.followup_pack_id === pack.followup_pack_id);
                          const activeQuestions = packQuestions.filter(q => q.active !== false).length;
                          
                          return (
                            <Draggable key={pack.id} draggableId={pack.id} index={index}>
                              {(provided) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  className={`bg-slate-900/50 border rounded-lg p-3 transition-colors cursor-pointer ${
                                    selectedPack?.id === pack.id 
                                      ? 'border-purple-500/50 bg-purple-950/20' 
                                      : pack.active 
                                        ? 'border-slate-700 hover:border-purple-500/30' 
                                        : 'border-slate-700 opacity-60'
                                  }`}
                                  onClick={() => setSelectedPack(pack)}
                                >
                                  <div className="flex items-start gap-2">
                                    <div {...provided.dragHandleProps} onClick={(e) => e.stopPropagation()}>
                                      <GripVertical className="w-4 h-4 text-slate-500 hover:text-slate-300 cursor-grab active:cursor-grabbing mt-1" />
                                    </div>
                                    <Package className="w-4 h-4 text-purple-400 mt-1" />
                                    <div className="flex-1 min-w-0">
                                      <h3 className="text-sm font-semibold text-white">
                                        {pack.pack_name}
                                      </h3>
                                      <p className="text-xs text-slate-400 mt-0.5 font-mono">
                                        {pack.followup_pack_id}
                                      </p>
                                      <div className="flex gap-1.5 mt-2 flex-wrap">
                                        <Badge variant="outline" className="text-xs bg-slate-700/50 border-slate-600 text-slate-300">
                                          {activeQuestions} questions
                                        </Badge>
                                        {pack.requires_completion && (
                                          <Badge className="text-xs bg-orange-500/20 border-orange-500/50 text-orange-400">
                                            Required
                                          </Badge>
                                        )}
                                        <Badge variant="outline" className="text-xs border-slate-600 text-slate-300">
                                          {BEHAVIOR_TYPE_NAMES[pack.behavior_type] || pack.behavior_type}
                                        </Badge>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>
              )}
            </div>

            <div className="lg:col-span-2 lg:sticky lg:top-6 lg:self-start bg-slate-800/30 border border-slate-700/50 rounded-lg p-6 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
              <PackDetailPanel
                pack={selectedPack}
                questions={allQuestions.filter(q => q.followup_pack_id === selectedPack?.followup_pack_id)}
                onClose={() => setSelectedPack(null)}
                onDelete={(pack) => setDeleteConfirm(pack)}
              />
            </div>
          </div>
        </div>
      </div>

      <Dialog open={!!deleteConfirm} onOpenChange={() => {
        setDeleteConfirm(null);
        setDeleteInput("");
      }}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-red-400">Confirm Deletion</DialogTitle>
            <DialogDescription className="text-slate-300">
              Type <strong>DELETE</strong> to confirm deletion of this pack.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={deleteInput}
            onChange={(e) => setDeleteInput(e.target.value)}
            placeholder="Type DELETE"
            className="bg-slate-800 border-slate-600 text-white"
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteConfirm(null);
                setDeleteInput("");
              }}
              className="bg-slate-800 border-slate-600"
            >
              Cancel
            </Button>
            <Button
              disabled={deleteInput !== "DELETE"}
              className="bg-red-600 hover:bg-red-700"
              onClick={async () => {
                try {
                  await base44.entities.FollowUpPack.delete(deleteConfirm.id);
                  queryClient.invalidateQueries({ queryKey: ['followUpPacks'] });
                  toast.success('Pack deleted');
                  setDeleteConfirm(null);
                  setDeleteInput("");
                  setSelectedPack(null);
                } catch (err) {
                  toast.error('Failed to delete pack');
                }
              }}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PackDetailPanel({ pack, questions, onClose, onDelete }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({});
  const [editedQuestions, setEditedQuestions] = useState([]);

  useEffect(() => {
    if (pack) {
      setFormData({
        followup_pack_id: pack.followup_pack_id || '',
        pack_name: pack.pack_name || '',
        description: pack.description || '',
        behavior_type: pack.behavior_type || 'standard',
        requires_completion: pack.requires_completion !== false,
        max_probe_loops: pack.max_probe_loops || null,
        trigger_notes: pack.trigger_notes || '',
        ai_probe_instructions: pack.ai_probe_instructions || '',
        active: pack.active !== false
      });
      setEditedQuestions([...questions].sort((a, b) => (a.display_order || 0) - (b.display_order || 0)));
    } else {
      setFormData({});
      setEditedQuestions([]);
    }
  }, [pack, questions]);

  const handleSave = async () => {
    try {
      await base44.entities.FollowUpPack.update(pack.id, {
        ...formData,
        followup_pack_id: formData.followup_pack_id.toUpperCase()
      });

      for (const question of editedQuestions) {
        if (question.id) {
          await base44.entities.FollowUpQuestion.update(question.id, {
            question_text: question.question_text,
            display_order: question.display_order,
            active: question.active
          });
        }
      }

      queryClient.invalidateQueries({ queryKey: ['followUpPacks'] });
      queryClient.invalidateQueries({ queryKey: ['followUpQuestions'] });
      toast.success('Pack updated successfully');
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Failed to save pack');
    }
  };

  const addQuestion = async () => {
    try {
      const maxOrder = Math.max(0, ...editedQuestions.map(q => q.display_order || 0));
      const newQuestion = await base44.entities.FollowUpQuestion.create({
        followup_question_id: `FQ_${Date.now()}`,
        followup_pack_id: pack.followup_pack_id,
        question_text: "New follow-up question...",
        display_order: maxOrder + 1,
        response_type: "text",
        active: true
      });
      queryClient.invalidateQueries({ queryKey: ['followUpQuestions'] });
      toast.success('Question added');
    } catch (err) {
      toast.error('Failed to add question');
    }
  };

  const deleteQuestion = async (questionId) => {
    try {
      await base44.entities.FollowUpQuestion.delete(questionId);
      queryClient.invalidateQueries({ queryKey: ['followUpQuestions'] });
      toast.success('Question deleted');
    } catch (err) {
      toast.error('Failed to delete question');
    }
  };

  const handleQuestionDragEnd = async (result) => {
    if (!result.destination) return;
    
    const items = Array.from(editedQuestions);
    const [reordered] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reordered);

    const reorderedWithNumbers = items.map((q, index) => ({
      ...q,
      display_order: index + 1
    }));

    setEditedQuestions(reorderedWithNumbers);
  };

  if (!pack) {
    return (
      <div className="text-center py-12">
        <Package className="w-16 h-16 text-slate-600 mx-auto mb-4" />
        <p className="text-slate-400 text-sm">Select a pack to view and edit its details</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-white">{pack.pack_name}</h3>
          <p className="text-sm text-slate-400 font-mono mt-1">{pack.followup_pack_id}</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleSave}
            className="bg-purple-600 hover:bg-purple-700"
          >
            Save Changes
          </Button>
          <Button
            variant="outline"
            onClick={() => onDelete(pack)}
            className="border-red-600 text-red-400 hover:bg-red-950/30"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="bg-slate-900/30 border border-slate-700 rounded-lg p-4 space-y-4">
        <h4 className="text-sm font-semibold text-white">Pack Configuration</h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-slate-300">Pack Code</Label>
            <Input
              value={formData.followup_pack_id || ''}
              onChange={(e) => setFormData({...formData, followup_pack_id: e.target.value.toUpperCase()})}
              className="bg-slate-800 border-slate-600 text-white mt-1 font-mono"
            />
          </div>

          <div>
            <Label className="text-slate-300">Pack Name</Label>
            <Input
              value={formData.pack_name || ''}
              onChange={(e) => setFormData({...formData, pack_name: e.target.value})}
              className="bg-slate-800 border-slate-600 text-white mt-1"
            />
          </div>
        </div>

        <div>
          <Label className="text-slate-300">Description</Label>
          <Textarea
            value={formData.description || ''}
            onChange={(e) => setFormData({...formData, description: e.target.value})}
            className="bg-slate-800 border-slate-600 text-white mt-1 min-h-20"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-slate-300">Behavior Type</Label>
            <Select
              value={formData.behavior_type || 'standard'}
              onValueChange={(v) => setFormData({...formData, behavior_type: v})}
            >
              <SelectTrigger className="bg-slate-800 border-slate-600 text-white mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(BEHAVIOR_TYPE_NAMES).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {formData.behavior_type === 'multi_incident' && (
            <div>
              <Label className="text-slate-300">Max Probe Loops</Label>
              <Input
                type="number"
                value={formData.max_probe_loops || ''}
                onChange={(e) => setFormData({...formData, max_probe_loops: parseInt(e.target.value) || null})}
                placeholder="e.g., 5"
                className="bg-slate-800 border-slate-600 text-white mt-1"
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-lg p-3">
          <div>
            <Label className="text-slate-300 font-semibold">Requires Completion</Label>
            <p className="text-xs text-slate-400 mt-1">All active questions must be answered before progressing</p>
          </div>
          <Switch
            checked={formData.requires_completion}
            onCheckedChange={(checked) => setFormData({...formData, requires_completion: checked})}
            className="data-[state=checked]:bg-emerald-600"
          />
        </div>

        <div className="flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-lg p-3">
          <Label className="text-slate-300">Active</Label>
          <Switch
            checked={formData.active}
            onCheckedChange={(checked) => setFormData({...formData, active: checked})}
            className="data-[state=checked]:bg-emerald-600"
          />
        </div>

        <div>
          <Label className="text-slate-300">Trigger Notes</Label>
          <Textarea
            value={formData.trigger_notes || ''}
            onChange={(e) => setFormData({...formData, trigger_notes: e.target.value})}
            placeholder="Explain when this pack should be triggered..."
            className="bg-slate-800 border-slate-600 text-white mt-1 min-h-20"
          />
        </div>
      </div>

      <div className="bg-slate-900/30 border border-slate-700 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-white mb-3">AI Probe Instructions</h4>
        <Textarea
          value={formData.ai_probe_instructions || ''}
          onChange={(e) => setFormData({...formData, ai_probe_instructions: e.target.value})}
          placeholder="Instructions for AI probing behavior for this pack..."
          className="bg-slate-800 border-slate-600 text-white min-h-32"
        />
        <p className="text-xs text-slate-400 mt-2">
          <AlertCircle className="w-3 h-3 inline mr-1" />
          These instructions guide the AI agent when probing for follow-up details after this pack is triggered.
        </p>
      </div>

      <div className="bg-slate-900/30 border border-slate-700 rounded-lg p-4">
        <div className="flex justify-between items-center mb-4">
          <h4 className="text-sm font-semibold text-white">Follow-Up Questions in This Pack</h4>
          <Button
            onClick={addQuestion}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Question
          </Button>
        </div>

        {editedQuestions.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">No questions yet. Add your first question.</p>
        ) : (
          <DragDropContext onDragEnd={handleQuestionDragEnd}>
            <Droppable droppableId="questions">
              {(provided) => (
                <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                  {editedQuestions.map((question, index) => (
                    <Draggable key={question.id} draggableId={question.id} index={index}>
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className="bg-slate-800/50 border border-slate-600 rounded-lg p-3"
                        >
                          <div className="flex items-start gap-3">
                            <div {...provided.dragHandleProps}>
                              <GripVertical className="w-4 h-4 text-slate-500 hover:text-slate-300 cursor-grab active:cursor-grabbing mt-2" />
                            </div>
                            <Layers className="w-4 h-4 text-emerald-400 mt-2" />
                            <div className="flex-1 space-y-2">
                              <Input
                                value={question.question_text}
                                onChange={(e) => {
                                  const updated = [...editedQuestions];
                                  updated[index] = {...updated[index], question_text: e.target.value};
                                  setEditedQuestions(updated);
                                }}
                                className="bg-slate-900 border-slate-600 text-white text-sm"
                              />
                              <div className="flex items-center gap-3">
                                <Badge variant="outline" className="text-xs">
                                  #{question.display_order}
                                </Badge>
                                <div className="flex items-center gap-2">
                                  <Label className="text-xs text-slate-400">Active</Label>
                                  <Switch
                                    checked={question.active !== false}
                                    onCheckedChange={(checked) => {
                                      const updated = [...editedQuestions];
                                      updated[index] = {...updated[index], active: checked};
                                      setEditedQuestions(updated);
                                    }}
                                    className="data-[state=checked]:bg-emerald-600 scale-75"
                                  />
                                </div>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (confirm('Delete this question?')) {
                                  deleteQuestion(question.id);
                                }
                              }}
                              className="text-red-400 hover:text-red-300 hover:bg-red-950/30"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </div>
    </div>
  );
}