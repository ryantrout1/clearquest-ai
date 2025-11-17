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
import { ChevronLeft, ChevronRight, ChevronDown, Plus, Edit, Trash2, GripVertical, FolderOpen, FileText, Layers, Package, RefreshCw } from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { toast } from "sonner";

export default function InterviewStructureManager() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [user, setUser] = useState(null);
  const [expandedNodes, setExpandedNodes] = useState({});
  const [selectedItem, setSelectedItem] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteInput, setDeleteInput] = useState("");
  const [isMigrating, setIsMigrating] = useState(false);

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

  const { data: sections = [], isLoading: sectionsLoading } = useQuery({
    queryKey: ['sections'],
    queryFn: () => base44.entities.Section.list(),
    enabled: !!user
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list(),
    enabled: !!user
  });

  const { data: questions = [] } = useQuery({
    queryKey: ['questions'],
    queryFn: () => base44.entities.Question.list(),
    enabled: !!user
  });

  const { data: followUpPacks = [] } = useQuery({
    queryKey: ['followUpPacks'],
    queryFn: () => base44.entities.FollowUpPack.list(),
    enabled: !!user
  });

  const { data: followUpQuestions = [] } = useQuery({
    queryKey: ['followUpQuestions'],
    queryFn: () => base44.entities.FollowUpQuestion.list(),
    enabled: !!user
  });

  // Auto-migrate Categories to Sections and link Questions
  const runMigration = async () => {
    setIsMigrating(true);
    try {
      // Step 1: Create Section records from Categories
      const sectionMap = {};
      for (const cat of categories) {
        const newSection = await base44.entities.Section.create({
          section_id: cat.category_id || `SEC_${cat.category_label.replace(/\s+/g, '_').toUpperCase()}`,
          section_name: cat.category_label,
          section_order: cat.section_order || cat.display_order || 999,
          active: cat.active !== false,
          required: true,
          description: cat.description || ''
        });
        sectionMap[cat.category_label] = newSection.id;
      }

      // Step 2: Link Questions to Sections based on category field
      let updatedCount = 0;
      for (const q of questions) {
        if (q.category && sectionMap[q.category]) {
          await base44.entities.Question.update(q.id, {
            section_id: sectionMap[q.category]
          });
          updatedCount++;
        }
      }

      queryClient.invalidateQueries({ queryKey: ['sections'] });
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      toast.success(`Migration complete: ${Object.keys(sectionMap).length} sections created, ${updatedCount} questions linked`);
    } catch (err) {
      console.error('Migration error:', err);
      toast.error('Migration failed: ' + err.message);
    } finally {
      setIsMigrating(false);
    }
  };

  const sortedSections = [...sections].sort((a, b) => (a.section_order || 0) - (b.section_order || 0));

  const toggleNode = (nodeId) => {
    setExpandedNodes(prev => ({
      ...prev,
      [nodeId]: !prev[nodeId]
    }));
  };

  const handleSectionDragEnd = async (result) => {
    if (!result.destination) return;
    
    const items = Array.from(sortedSections);
    const [reordered] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reordered);

    try {
      await Promise.all(items.map((section, index) => 
        base44.entities.Section.update(section.id, { section_order: index + 1 })
      ));
      queryClient.invalidateQueries({ queryKey: ['sections'] });
      toast.success('Section order updated');
    } catch (err) {
      toast.error('Failed to reorder sections');
    }
  };

  const handleQuestionDragEnd = async (result, sectionId) => {
    if (!result.destination) return;

    const sectionQuestions = questions
      .filter(q => q.section_id === sectionId)
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    
    const items = Array.from(sectionQuestions);
    const [reordered] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reordered);

    try {
      await Promise.all(items.map((q, index) => 
        base44.entities.Question.update(q.id, { display_order: index + 1 })
      ));
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      toast.success('Question order updated');
    } catch (err) {
      toast.error('Failed to reorder questions');
    }
  };

  const handleFollowUpQuestionDragEnd = async (result, packId) => {
    if (!result.destination) return;

    const packQuestions = followUpQuestions
      .filter(q => q.followup_pack_id === packId)
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    
    const items = Array.from(packQuestions);
    const [reordered] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reordered);

    try {
      await Promise.all(items.map((q, index) => 
        base44.entities.FollowUpQuestion.update(q.id, { display_order: index + 1 })
      ));
      queryClient.invalidateQueries({ queryKey: ['followUpQuestions'] });
      toast.success('Follow-up question order updated');
    } catch (err) {
      toast.error('Failed to reorder follow-up questions');
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-slate-300">Loading...</div>
      </div>
    );
  }

  const needsMigration = !sectionsLoading && sections.length === 0 && categories.length > 0;

  return (
    <div className="min-h-screen bg-[#0f172a]">
      {/* Header */}
      <div className="border-b border-slate-700/50 bg-[#1e293b]/80 backdrop-blur-sm px-6 py-4">
        <div className="max-w-[1600px] mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(createPageUrl("SystemAdminDashboard"))}
              className="text-slate-300 hover:text-white -ml-2"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <FolderOpen className="w-6 h-6 text-blue-400" />
            <div>
              <h1 className="text-xl font-bold text-white">Interview Structure Manager</h1>
              <p className="text-xs text-slate-400">Manage sections, questions, and follow-up packs</p>
            </div>
          </div>
        </div>
      </div>

      {/* Migration Banner */}
      {needsMigration && (
        <div className="bg-amber-950/30 border-b border-amber-800/50 px-6 py-4">
          <div className="max-w-[1600px] mx-auto flex items-center justify-between">
            <div>
              <p className="text-amber-400 font-medium">Migration Required</p>
              <p className="text-sm text-amber-300/80">
                Import {categories.length} sections and {questions.length} questions from your existing data
              </p>
            </div>
            <Button
              onClick={runMigration}
              disabled={isMigrating}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {isMigrating ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Migrating...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Run Migration
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="px-6 py-6">
        <div className="max-w-[1600px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Tree View */}
            <div className="lg:col-span-2 bg-slate-800/30 border border-slate-700/50 rounded-lg p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-white">Structure Tree</h2>
                <Button
                  onClick={() => setSelectedItem({ type: 'new-section' })}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  New Section
                </Button>
              </div>

              {sectionsLoading ? (
                <p className="text-slate-400 text-center py-8">Loading sections...</p>
              ) : sortedSections.length === 0 ? (
                <p className="text-slate-400 text-center py-8">No sections yet. {needsMigration ? 'Run migration above.' : 'Create your first section.'}</p>
              ) : (
                <DragDropContext onDragEnd={handleSectionDragEnd}>
                  <Droppable droppableId="sections">
                    {(provided) => (
                      <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                        {sortedSections.map((section, index) => (
                          <Draggable key={section.id} draggableId={section.id} index={index}>
                            {(provided) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className="bg-slate-900/50 border border-slate-700 rounded-lg hover:border-blue-500/50 transition-colors"
                              >
                                {/* Section Header */}
                                <div className="p-3 flex items-center gap-2">
                                  <div {...provided.dragHandleProps}>
                                    <GripVertical className="w-4 h-4 text-slate-500 hover:text-slate-300 cursor-grab active:cursor-grabbing" />
                                  </div>
                                  <button
                                    onClick={() => toggleNode(`section-${section.id}`)}
                                    className="text-slate-400 hover:text-white transition-colors"
                                  >
                                    {expandedNodes[`section-${section.id}`] ? 
                                      <ChevronDown className="w-5 h-5" /> : 
                                      <ChevronRight className="w-5 h-5" />
                                    }
                                  </button>
                                  <FolderOpen className="w-5 h-5 text-blue-400" />
                                  <div className="flex-1">
                                    <span className="text-white font-medium text-base">{section.section_name}</span>
                                    <div className="flex gap-2 mt-1">
                                      <Badge variant="outline" className="text-xs bg-slate-700/50 border-slate-600 text-slate-300">
                                        #{section.section_order}
                                      </Badge>
                                      {!section.active && (
                                        <Badge className="text-xs bg-red-500/20 border-red-500/50 text-red-400">
                                          Inactive
                                        </Badge>
                                      )}
                                      {section.required && (
                                        <Badge className="text-xs bg-orange-500/20 border-orange-500/50 text-orange-400">
                                          Required
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setSelectedItem({ type: 'section', data: section })}
                                    className="text-slate-400 hover:text-white hover:bg-slate-700"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                </div>

                                {/* Questions in Section */}
                                {expandedNodes[`section-${section.id}`] && (
                                  <div className="border-t border-slate-700/50 p-3 pl-12 bg-slate-900/30">
                                    <QuestionList 
                                      sectionId={section.id} 
                                      questions={questions}
                                      followUpPacks={followUpPacks}
                                      followUpQuestions={followUpQuestions}
                                      expandedNodes={expandedNodes}
                                      toggleNode={toggleNode}
                                      setSelectedItem={setSelectedItem}
                                      onDragEnd={handleQuestionDragEnd}
                                      onFollowUpDragEnd={handleFollowUpQuestionDragEnd}
                                    />
                                  </div>
                                )}
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

            {/* Detail Panel */}
            <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-6">
              <DetailPanel
                selectedItem={selectedItem}
                sections={sections}
                followUpPacks={followUpPacks}
                onClose={() => setSelectedItem(null)}
                onDelete={(item) => setDeleteConfirm(item)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => {
        setDeleteConfirm(null);
        setDeleteInput("");
      }}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-red-400">Confirm Deletion</DialogTitle>
            <DialogDescription className="text-slate-300">
              Type <strong>DELETE</strong> to confirm.
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
                setDeleteConfirm(null);
                setDeleteInput("");
                toast.success('Item deleted');
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

function QuestionList({ sectionId, questions, followUpPacks, followUpQuestions, expandedNodes, toggleNode, setSelectedItem, onDragEnd, onFollowUpDragEnd }) {
  const sectionQuestions = questions
    .filter(q => q.section_id === sectionId)
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

  if (sectionQuestions.length === 0) {
    return <p className="text-sm text-slate-400">No questions yet</p>;
  }

  return (
    <DragDropContext onDragEnd={(result) => onDragEnd(result, sectionId)}>
      <Droppable droppableId={`questions-${sectionId}`}>
        {(provided) => (
          <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
            {sectionQuestions.map((question, index) => {
              const pack = followUpPacks.find(p => p.followup_pack_id === question.followup_pack_id || p.pack_name === question.followup_pack);
              
              return (
                <Draggable key={question.id} draggableId={question.id} index={index}>
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className="bg-slate-800/50 border border-slate-600 rounded-lg p-3 hover:border-emerald-500/50 transition-colors cursor-pointer"
                      onClick={() => setSelectedItem({ type: 'question', data: question })}
                    >
                      <div className="flex items-start gap-3">
                        <div {...provided.dragHandleProps} onClick={(e) => e.stopPropagation()}>
                          <GripVertical className="w-4 h-4 text-slate-500 hover:text-slate-300 cursor-grab active:cursor-grabbing" />
                        </div>
                        {pack && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleNode(`question-${question.id}`);
                            }}
                            className="text-slate-400 hover:text-white mt-0.5 transition-colors"
                          >
                            {expandedNodes[`question-${question.id}`] ? 
                              <ChevronDown className="w-4 h-4" /> : 
                              <ChevronRight className="w-4 h-4" />
                            }
                          </button>
                        )}
                        <FileText className="w-4 h-4 text-emerald-400 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white leading-relaxed">{question.question_text}</p>
                          <div className="flex gap-2 mt-2 flex-wrap">
                            <Badge variant="outline" className="text-xs bg-slate-700/50 border-slate-600 text-slate-300 font-mono">
                              {question.question_id}
                            </Badge>
                            {!question.active && (
                              <Badge className="text-xs bg-red-500/20 border-red-500/50 text-red-400">
                                Inactive
                              </Badge>
                            )}
                            {pack && (
                              <Badge className="text-xs bg-purple-500/20 border-purple-500/50 text-purple-400">
                                Has Follow-ups
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedItem({ type: 'question', data: question });
                          }}
                          className="text-slate-400 hover:text-white hover:bg-slate-700 h-8"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      </div>

                      {/* Follow-up Pack */}
                      {pack && expandedNodes[`question-${question.id}`] && (
                        <div className="ml-10 mt-3 border-l-2 border-purple-500/30 pl-4">
                          <FollowUpPackNode
                            pack={pack}
                            followUpQuestions={followUpQuestions}
                            expandedNodes={expandedNodes}
                            toggleNode={toggleNode}
                            setSelectedItem={setSelectedItem}
                            onDragEnd={onFollowUpDragEnd}
                          />
                        </div>
                      )}
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
  );
}

function FollowUpPackNode({ pack, followUpQuestions, expandedNodes, toggleNode, setSelectedItem, onDragEnd }) {
  const packQuestions = followUpQuestions
    .filter(q => q.followup_pack_id === pack.followup_pack_id)
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

  return (
    <div className="bg-purple-950/30 border border-purple-600/40 rounded-lg p-3">
      <div className="flex items-center gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleNode(`pack-${pack.id}`);
          }}
          className="text-purple-400 hover:text-purple-300 transition-colors"
        >
          {expandedNodes[`pack-${pack.id}`] ? 
            <ChevronDown className="w-4 h-4" /> : 
            <ChevronRight className="w-4 h-4" />
          }
        </button>
        <Package className="w-4 h-4 text-purple-400" />
        <span className="text-sm text-purple-200 font-medium flex-1">{pack.pack_name}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedItem({ type: 'pack', data: pack });
          }}
          className="text-purple-400 hover:text-purple-300 hover:bg-purple-900/30 h-7"
        >
          <Edit className="w-3 h-3" />
        </Button>
      </div>

      {expandedNodes[`pack-${pack.id}`] && packQuestions.length > 0 && (
        <DragDropContext onDragEnd={(result) => onDragEnd(result, pack.followup_pack_id)}>
          <Droppable droppableId={`followup-${pack.followup_pack_id}`}>
            {(provided) => (
              <div {...provided.droppableProps} ref={provided.innerRef} className="ml-6 mt-3 space-y-2">
                {packQuestions.map((q, index) => (
                  <Draggable key={q.id} draggableId={q.id} index={index}>
                    {(provided) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className="bg-purple-900/20 border border-purple-600/30 rounded p-2 flex items-start gap-2 hover:border-purple-500/50 transition-colors cursor-pointer"
                        onClick={() => setSelectedItem({ type: 'followup-question', data: q })}
                      >
                        <div {...provided.dragHandleProps} onClick={(e) => e.stopPropagation()}>
                          <GripVertical className="w-3 h-3 text-purple-500/70 hover:text-purple-400 cursor-grab active:cursor-grabbing" />
                        </div>
                        <Layers className="w-3 h-3 text-purple-400 mt-0.5" />
                        <p className="text-xs text-purple-100 flex-1 leading-relaxed">{q.question_text}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedItem({ type: 'followup-question', data: q });
                          }}
                          className="text-purple-400 hover:text-purple-300 hover:bg-purple-900/30 h-6"
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
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
  );
}

function DetailPanel({ selectedItem, sections, followUpPacks, onClose, onDelete }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({});

  useEffect(() => {
    if (selectedItem?.data) {
      setFormData(selectedItem.data);
    } else {
      setFormData({});
    }
  }, [selectedItem]);

  const handleSave = async () => {
    try {
      if (selectedItem?.type === 'section') {
        await base44.entities.Section.update(selectedItem.data.id, formData);
        queryClient.invalidateQueries({ queryKey: ['sections'] });
        toast.success('Section updated');
      } else if (selectedItem?.type === 'question') {
        await base44.entities.Question.update(selectedItem.data.id, formData);
        queryClient.invalidateQueries({ queryKey: ['questions'] });
        toast.success('Question updated');
      } else if (selectedItem?.type === 'pack') {
        await base44.entities.FollowUpPack.update(selectedItem.data.id, formData);
        queryClient.invalidateQueries({ queryKey: ['followUpPacks'] });
        toast.success('Pack updated');
      } else if (selectedItem?.type === 'followup-question') {
        await base44.entities.FollowUpQuestion.update(selectedItem.data.id, formData);
        queryClient.invalidateQueries({ queryKey: ['followUpQuestions'] });
        toast.success('Follow-up question updated');
      } else if (selectedItem?.type === 'new-section') {
        const maxOrder = Math.max(0, ...sections.map(s => s.section_order || 0));
        await base44.entities.Section.create({
          ...formData,
          section_id: `SEC_${Date.now()}`,
          section_order: maxOrder + 1
        });
        queryClient.invalidateQueries({ queryKey: ['sections'] });
        toast.success('Section created');
        onClose();
      }
    } catch (err) {
      toast.error('Failed to save');
    }
  };

  if (!selectedItem) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-400 text-sm">Select an item to edit</p>
      </div>
    );
  }

  if (selectedItem.type === 'section' || selectedItem.type === 'new-section') {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">
          {selectedItem.type === 'new-section' ? 'New Section' : 'Edit Section'}
        </h3>
        
        <div>
          <Label className="text-slate-300">Section Name</Label>
          <Input
            value={formData.section_name || ''}
            onChange={(e) => setFormData({...formData, section_name: e.target.value})}
            className="bg-slate-800 border-slate-600 text-white mt-1"
          />
        </div>

        <div>
          <Label className="text-slate-300">Description</Label>
          <Textarea
            value={formData.description || ''}
            onChange={(e) => setFormData({...formData, description: e.target.value})}
            className="bg-slate-800 border-slate-600 text-white mt-1"
          />
        </div>

        {selectedItem.type !== 'new-section' && (
          <>
            <div>
              <Label className="text-slate-300">Section Order</Label>
              <Input
                type="number"
                value={formData.section_order || 0}
                onChange={(e) => setFormData({...formData, section_order: parseInt(e.target.value)})}
                className="bg-slate-800 border-slate-600 text-white mt-1"
              />
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-slate-300">Active</Label>
              <Switch
                checked={formData.active !== false}
                onCheckedChange={(checked) => setFormData({...formData, active: checked})}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-slate-300">Required</Label>
              <Switch
                checked={formData.required !== false}
                onCheckedChange={(checked) => setFormData({...formData, required: checked})}
                disabled={formData.active === false}
              />
            </div>
          </>
        )}

        <div className="flex gap-2 pt-4">
          <Button onClick={handleSave} className="flex-1 bg-blue-600 hover:bg-blue-700">
            Save
          </Button>
          {selectedItem.type !== 'new-section' && (
            <Button
              variant="outline"
              onClick={() => onDelete(selectedItem)}
              className="border-red-600 text-red-400 hover:bg-red-950/30"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (selectedItem.type === 'question') {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Edit Question</h3>
        
        <div>
          <Label className="text-slate-300">Question ID</Label>
          <Input
            value={formData.question_id || ''}
            disabled
            className="bg-slate-800 border-slate-600 text-slate-400 mt-1"
          />
        </div>

        <div>
          <Label className="text-slate-300">Question Text</Label>
          <Textarea
            value={formData.question_text || ''}
            onChange={(e) => setFormData({...formData, question_text: e.target.value})}
            className="bg-slate-800 border-slate-600 text-white mt-1 min-h-24"
          />
        </div>

        <div>
          <Label className="text-slate-300">Response Type</Label>
          <Select
            value={formData.response_type || 'yes_no'}
            onValueChange={(v) => setFormData({...formData, response_type: v})}
          >
            <SelectTrigger className="bg-slate-800 border-slate-600 text-white mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes_no">Yes / No</SelectItem>
              <SelectItem value="text">Text</SelectItem>
              <SelectItem value="date">Date</SelectItem>
              <SelectItem value="number">Number</SelectItem>
              <SelectItem value="multi_select">Multiple Choice</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-slate-300">Move to Section</Label>
          <Select
            value={formData.section_id || ''}
            onValueChange={async (v) => {
              const newSection = sections.find(s => s.id === v);
              if (newSection) {
                const questionsInNewSection = await base44.entities.Question.filter({ section_id: v });
                const maxOrder = Math.max(0, ...questionsInNewSection.map(q => q.display_order || 0));
                setFormData({...formData, section_id: v, display_order: maxOrder + 1});
              }
            }}
          >
            <SelectTrigger className="bg-slate-800 border-slate-600 text-white mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sections.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.section_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-slate-300">Active</Label>
          <Switch
            checked={formData.active !== false}
            onCheckedChange={(checked) => setFormData({...formData, active: checked})}
          />
        </div>

        <div className="flex gap-2 pt-4">
          <Button onClick={handleSave} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
            Save Changes
          </Button>
        </div>
      </div>
    );
  }

  return null;
}