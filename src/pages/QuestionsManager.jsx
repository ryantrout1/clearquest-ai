
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Search, Plus, GripVertical, AlertCircle, ChevronLeft, Edit, Trash2, Copy, X, Menu } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { toast } from "sonner";
import QuestionEditModal from "../components/admin/QuestionEditModal";
import FollowUpPackEditor from "../components/admin/FollowUpPackEditor";

export default function QuestionsManager() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [user, setUser] = useState(null);
  const [selectedSection, setSelectedSection] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [followupFilter, setFollowupFilter] = useState("all");
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showFollowUpEditor, setShowFollowUpEditor] = useState(false);
  const [selectedQuestionForFollowUp, setSelectedQuestionForFollowUp] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showMobileSections, setShowMobileSections] = useState(false);

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

  const { data: questions = [], isLoading } = useQuery({
    queryKey: ['questions'],
    queryFn: () => base44.entities.Question.list(),
    enabled: !!user
  });

  const updateQuestionMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Question.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      toast.success('Question updated');
    },
    onError: () => {
      toast.error('Failed to update question');
    }
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: (id) => base44.entities.Question.update(id, { active: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      toast.success('Question deleted');
      setDeleteConfirm(null);
    },
    onError: () => {
      toast.error('Failed to delete question');
    }
  });

  const sections = useMemo(() => {
    const sectionMap = {};
    questions.forEach(q => {
      if (!q.category) return;
      if (!sectionMap[q.category]) {
        sectionMap[q.category] = {
          name: q.category,
          count: 0,
          activeCount: 0
        };
      }
      sectionMap[q.category].count++;
      if (q.active) sectionMap[q.category].activeCount++;
    });
    return Object.values(sectionMap).sort((a, b) => a.name.localeCompare(b.name));
  }, [questions]);

  useEffect(() => {
    if (!selectedSection && sections.length > 0) {
      setSelectedSection(sections[0].name);
    }
  }, [sections, selectedSection]);

  const filteredQuestions = useMemo(() => {
    let filtered = questions.filter(q => q.category === selectedSection);

    if (searchQuery) {
      filtered = filtered.filter(q => 
        q.question_text?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        q.question_id?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (activeFilter === "active") {
      filtered = filtered.filter(q => q.active);
    } else if (activeFilter === "inactive") {
      filtered = filtered.filter(q => !q.active);
    }

    if (followupFilter === "has") {
      filtered = filtered.filter(q => q.followup_pack);
    } else if (followupFilter === "missing") {
      filtered = filtered.filter(q => !q.followup_pack && q.response_type === 'yes_no');
    }

    return filtered.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  }, [questions, selectedSection, searchQuery, activeFilter, followupFilter]);

  const handleDragEnd = async (result) => {
    if (!result.destination) return;

    const items = Array.from(filteredQuestions);
    const [reordered] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reordered);

    const updates = items.map((item, index) => ({
      id: item.id,
      display_order: index + 1
    }));

    try {
      await Promise.all(updates.map(u => 
        base44.entities.Question.update(u.id, { display_order: u.display_order })
      ));
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      toast.success('Question order updated');
    } catch (err) {
      toast.error('Failed to reorder questions');
    }
  };

  const handleToggleActive = async (question) => {
    updateQuestionMutation.mutate({
      id: question.id,
      data: { active: !question.active }
    });
  };

  const handleEditClick = (question) => {
    setEditingQuestion(question);
    setShowEditModal(true);
  };

  const handleAddQuestion = () => {
    setEditingQuestion({
      category: selectedSection,
      question_text: "",
      response_type: "yes_no",
      active: true,
      display_order: filteredQuestions.length + 1
    });
    setShowEditModal(true);
  };

  const handleDuplicate = async (question) => {
    try {
      const newQuestion = {
        ...question,
        question_id: `${question.question_id}_COPY_${Date.now()}`,
        question_text: `${question.question_text} (copy)`,
        display_order: filteredQuestions.length + 1
      };
      delete newQuestion.id;
      delete newQuestion.created_date;
      delete newQuestion.updated_date;
      
      await base44.entities.Question.create(newQuestion);
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      toast.success('Question duplicated');
    } catch (err) {
      toast.error('Failed to duplicate question');
    }
  };

  const handleFollowUpClick = (question) => {
    setSelectedQuestionForFollowUp(question);
    setShowFollowUpEditor(true);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-slate-300">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <div className="border-b border-slate-700 bg-slate-800/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(createPageUrl("SystemAdminDashboard"))}
                className="text-slate-300 hover:text-white"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
              <div className="flex items-center gap-2">
                <Shield className="w-6 h-6 text-blue-400" />
                <h1 className="text-xl md:text-2xl font-bold text-white">Question Bank Manager</h1>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => setShowMobileSections(!showMobileSections)}
              className="md:hidden bg-slate-700 hover:bg-slate-600"
            >
              <Menu className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Left Pane - Sections (Desktop) */}
          <div className="hidden md:block md:col-span-1">
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-4 sticky top-4">
              <h2 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">Sections</h2>
              <div className="space-y-1">
                {sections.map(section => (
                  <button
                    key={section.name}
                    onClick={() => setSelectedSection(section.name)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-all ${
                      selectedSection === section.name
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-300 hover:bg-slate-700/50'
                    }`}
                  >
                    <div className="font-medium text-sm mb-1 line-clamp-2">{section.name}</div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {section.activeCount} questions
                      </Badge>
                      {section.count !== section.activeCount && (
                        <span className="text-xs text-slate-500">({section.count - section.activeCount} inactive)</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Mobile Section Selector */}
          {showMobileSections && (
            <div className="md:hidden fixed inset-0 bg-slate-900/95 z-50 p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white">Select Section</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowMobileSections(false)}
                  className="text-slate-300"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <div className="space-y-2">
                {sections.map(section => (
                  <button
                    key={section.name}
                    onClick={() => {
                      setSelectedSection(section.name);
                      setShowMobileSections(false);
                    }}
                    className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                      selectedSection === section.name
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    <div className="font-medium mb-1">{section.name}</div>
                    <Badge variant="outline" className="text-xs">
                      {section.activeCount} questions
                    </Badge>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Right Pane - Questions */}
          <div className="md:col-span-3">
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700">
              {/* Header */}
              <div className="border-b border-slate-700 p-4 md:p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-lg md:text-xl font-bold text-white mb-1">{selectedSection}</h2>
                    <p className="text-sm text-slate-400">{filteredQuestions.length} questions</p>
                  </div>
                  <Button onClick={handleAddQuestion} className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Question
                  </Button>
                </div>

                {/* Filters */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      placeholder="Search questions..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 bg-slate-900/50 border-slate-600 text-white"
                    />
                  </div>
                  <Select value={activeFilter} onValueChange={setActiveFilter}>
                    <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="active">Active Only</SelectItem>
                      <SelectItem value="inactive">Inactive Only</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={followupFilter} onValueChange={setFollowupFilter}>
                    <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Follow-ups</SelectItem>
                      <SelectItem value="has">Has Follow-up Pack</SelectItem>
                      <SelectItem value="missing">Missing Follow-up Pack</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Questions List */}
              <div className="p-4 md:p-6">
                {isLoading ? (
                  <div className="text-center text-slate-400 py-12">Loading questions...</div>
                ) : filteredQuestions.length === 0 ? (
                  <div className="text-center text-slate-400 py-12">
                    No questions found. Try adjusting your filters.
                  </div>
                ) : (
                  <DragDropContext onDragEnd={handleDragEnd}>
                    <Droppable droppableId="questions">
                      {(provided) => (
                        <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                          {filteredQuestions.map((question, index) => (
                            <Draggable key={question.id} draggableId={question.id} index={index}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  className={`bg-slate-900/50 border rounded-lg transition-all ${
                                    snapshot.isDragging ? 'border-blue-500 shadow-lg' : 'border-slate-700'
                                  } ${!question.active ? 'opacity-50' : ''}`}
                                >
                                  <div className="p-4 flex items-start gap-3">
                                    <div {...provided.dragHandleProps} className="pt-1 cursor-grab active:cursor-grabbing">
                                      <GripVertical className="w-5 h-5 text-slate-500" />
                                    </div>
                                    <div className="flex-1 min-w-0 space-y-2">
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 mb-1">
                                            <Badge variant="outline" className="font-mono text-xs">
                                              {question.question_id}
                                            </Badge>
                                            <Badge className={question.active ? 'bg-green-600' : 'bg-slate-600'}>
                                              {question.active ? 'Active' : 'Inactive'}
                                            </Badge>
                                            {question.response_type === 'yes_no' && !question.followup_pack && (
                                              <Badge variant="destructive" className="text-xs">
                                                <AlertCircle className="w-3 h-3 mr-1" />
                                                No Follow-up
                                              </Badge>
                                            )}
                                          </div>
                                          <p className="text-white text-sm md:text-base leading-relaxed break-words">
                                            {question.question_text}
                                          </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Switch
                                            checked={question.active}
                                            onCheckedChange={() => handleToggleActive(question)}
                                          />
                                        </div>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant="outline" className="text-xs">
                                          {question.response_type}
                                        </Badge>
                                        {question.followup_pack && (
                                          <button
                                            onClick={() => handleFollowUpClick(question)}
                                            className="px-2 py-1 bg-orange-600/20 border border-orange-600/50 rounded text-xs text-orange-300 hover:bg-orange-600/30 transition-colors"
                                          >
                                            {question.followup_pack}
                                          </button>
                                        )}
                                      </div>
                                      <div className="flex flex-wrap gap-2 pt-1">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleEditClick(question)}
                                          className="bg-slate-800 border-slate-600 text-slate-200 h-8"
                                        >
                                          <Edit className="w-3.5 h-3.5 mr-1.5" />
                                          Edit
                                        </Button>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleDuplicate(question)}
                                          className="bg-slate-800 border-slate-600 text-slate-200 h-8"
                                        >
                                          <Copy className="w-3.5 h-3.5 mr-1.5" />
                                          Duplicate
                                        </Button>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => setDeleteConfirm(question)}
                                          className="bg-slate-800 border-slate-600 text-red-400 hover:text-red-300 h-8"
                                        >
                                          <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                                          Delete
                                        </Button>
                                      </div>
                                    </div>
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
          </div>
        </div>
      </div>

      {showEditModal && (
        <QuestionEditModal
          question={editingQuestion}
          onClose={() => {
            setShowEditModal(false);
            setEditingQuestion(null);
          }}
          onSave={() => {
            queryClient.invalidateQueries({ queryKey: ['questions'] });
            setShowEditModal(false);
            setEditingQuestion(null);
          }}
        />
      )}

      {showFollowUpEditor && selectedQuestionForFollowUp && (
        <FollowUpPackEditor
          question={selectedQuestionForFollowUp}
          onClose={() => {
            setShowFollowUpEditor(false);
            setSelectedQuestionForFollowUp(null);
          }}
        />
      )}

      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Delete Question</DialogTitle>
            <DialogDescription className="text-slate-300">
              Are you sure you want to delete this question? It will no longer appear in new interviews, but existing historical data will be preserved.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} className="bg-slate-800 border-slate-600 text-slate-200">
              Cancel
            </Button>
            <Button
              onClick={() => deleteQuestionMutation.mutate(deleteConfirm.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
