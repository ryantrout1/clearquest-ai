
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Search, Plus, GripVertical, AlertCircle, ChevronLeft, Edit, Trash2, Copy, X, ChevronRight } from "lucide-react";
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
import { cleanupDuplicateQuestions } from '../functions/cleanupDuplicateQuestions';
import { getFollowupPackDisplay, getResponseTypeDisplay } from "../components/utils/followupPackNames";

const SECTION_ORDER = [
  "Applications with Other Law Enforcement Agencies",
  "Driving Record",
  "Criminal Involvement / Police Contacts",
  "Extremist Organizations",
  "Sexual Activities",
  "Financial History",
  "Illegal Drug / Narcotic History",
  "Alcohol History",
  "Military History",
  "Employment History",
  "Prior Law Enforcement",
  "General Disclosures & Eligibility",
  "Prior Law Enforcement ONLY",
  "All Applicants"
];

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
  const [isCleaningUp, setIsCleaningUp] = useState(false);


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
          console.error("Failed to parse admin auth from session storage", err);
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
        console.error("Failed to fetch current user or not authenticated", err);
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
    mutationFn: (id) => base44.entities.Question.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      toast.success('Question deleted permanently');
      setDeleteConfirm(null);
    },
    onError: (err) => {
      console.error('Delete error:', err);
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
    
    const sectionList = Object.values(sectionMap);
    return sectionList.sort((a, b) => {
      const aIndex = SECTION_ORDER.indexOf(a.name);
      const bIndex = SECTION_ORDER.indexOf(b.name);
      if (aIndex === -1 && bIndex === -1) return a.name.localeCompare(b.name);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
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

  const handleDeleteQuestion = () => {
    if (!deleteConfirm?.id) {
      toast.error('No question selected');
      return;
    }
    deleteQuestionMutation.mutate(deleteConfirm.id);
  };

  const handleCleanupDuplicates = async () => {
    if (!confirm('This will remove all duplicate questions, keeping only the most recent active version of each. Continue?')) {
      return;
    }
    
    setIsCleaningUp(true);
    try {
      const result = await cleanupDuplicateQuestions();
      if (result.success) {
        toast.success(result.summary);
        queryClient.invalidateQueries({ queryKey: ['questions'] });
      } else {
        toast.error('Cleanup failed: ' + result.error);
      }
    } catch (err) {
      toast.error('Cleanup failed');
    } finally {
      setIsCleaningUp(false);
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
    <div className="min-h-screen bg-[#0f172a] flex">
      {/* Left Sidebar - Sections */}
      <div className="hidden lg:block w-72 border-r border-slate-700/50 bg-[#1e293b]/50">
        <div className="p-6 border-b border-slate-700/50">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(createPageUrl("SystemAdminDashboard"))}
            className="text-slate-300 hover:text-white mb-4 -ml-2"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">SECTIONS</h2>
        </div>
        <div className="p-3 space-y-1 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 140px)' }}>
          {sections.map(section => (
            <button
              key={section.name}
              onClick={() => setSelectedSection(section.name)}
              className={`w-full text-left px-4 py-3 rounded-lg transition-all group ${
                selectedSection === section.name
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'text-slate-300 hover:bg-slate-800/50'
              }`}
            >
              <div className="font-medium text-sm mb-1.5 leading-tight">{section.name}</div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={
                  selectedSection === section.name 
                    ? 'border-white/30 text-white/80' 
                    : 'border-slate-600 text-slate-400'
                }>
                  {section.activeCount} questions
                </Badge>
                {section.count !== section.activeCount && (
                  <span className={`text-xs font-semibold ${
                    selectedSection === section.name 
                      ? 'text-red-300' 
                      : 'text-red-400'
                  }`}>
                    ({section.count - section.activeCount} inactive)
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <div className="border-b border-slate-700/50 bg-[#1e293b]/80 backdrop-blur-sm px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Shield className="w-6 h-6 text-blue-400" />
              <h1 className="text-xl font-bold text-white">Question Bank Manager</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleCleanupDuplicates}
                disabled={isCleaningUp}
                variant="outline"
                size="sm"
                className="hidden lg:flex bg-slate-900/50 border-slate-600 text-slate-300 hover:bg-slate-700"
              >
                {isCleaningUp ? 'Cleaning...' : 'Cleanup Duplicates'}
              </Button>
              <Button
                onClick={() => navigate(createPageUrl("SystemAdminDashboard"))}
                variant="ghost"
                size="sm"
                className="lg:hidden text-slate-300"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Section Header - Desktop */}
          <div className="hidden lg:flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">{selectedSection}</h2>
              <p className="text-sm text-slate-400">{filteredQuestions.length} questions in this section</p>
            </div>
            <Button onClick={handleAddQuestion} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Add Question
            </Button>
          </div>

          {/* Mobile Section Selector */}
          <div className="lg:hidden">
            <Select value={selectedSection} onValueChange={setSelectedSection}>
              <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sections.map(section => (
                  <SelectItem key={section.name} value={section.name}>
                    {section.name} ({section.activeCount})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleAddQuestion} className="w-full mt-3 bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Add Question
            </Button>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="border-b border-slate-700/30 bg-[#0f172a] px-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                placeholder="Search questions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
              />
            </div>
            <Select value={activeFilter} onValueChange={setActiveFilter}>
              <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active Only</SelectItem>
                <SelectItem value="inactive">Inactive Only</SelectItem>
              </SelectContent>
            </Select>
            <Select value={followupFilter} onValueChange={setFollowupFilter}>
              <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white">
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
        <div className="flex-1 overflow-y-auto px-6 py-4 bg-[#0f172a]">
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
                  <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2 max-w-5xl">
                    {filteredQuestions.map((question, index) => (
                      <Draggable key={question.id} draggableId={question.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`bg-slate-800/30 border rounded-lg transition-all ${
                              snapshot.isDragging ? 'border-blue-500 shadow-lg shadow-blue-500/20' : 'border-slate-700/50 hover:border-slate-600'
                            } ${!question.active ? 'opacity-40' : ''}`}
                          >
                            <div className="p-4">
                              <div className="flex items-start gap-3">
                                <div {...provided.dragHandleProps} className="pt-1.5 cursor-grab active:cursor-grabbing">
                                  <GripVertical className="w-5 h-5 text-slate-600 hover:text-slate-400 transition-colors" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-3 mb-3">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                                        <Badge variant="outline" className="font-mono text-xs border-slate-600 text-slate-300">
                                          {question.question_id}
                                        </Badge>
                                        <Badge className={question.active ? 'bg-green-600/20 text-green-400 border-green-600/30 font-semibold' : 'bg-red-600/20 text-red-400 border-red-600/30 font-semibold'} variant="outline">
                                          {question.active ? 'Active' : 'Inactive'}
                                        </Badge>
                                        {question.response_type === 'yes_no' && !question.followup_pack && (
                                          <Badge className="bg-red-600/20 text-red-400 border-red-600/30" variant="outline">
                                            <AlertCircle className="w-3 h-3 mr-1" />
                                            No Follow-up
                                          </Badge>
                                        )}
                                      </div>
                                      <p className="text-white text-base leading-relaxed mb-3">
                                        {question.question_text}
                                      </p>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant="outline" className="text-xs border-slate-600 text-slate-400">
                                          {getResponseTypeDisplay(question.response_type)}
                                        </Badge>
                                        {question.followup_pack && (
                                          <button
                                            onClick={() => handleFollowUpClick(question)}
                                            className="px-2.5 py-1 bg-orange-600/10 border border-orange-600/30 rounded text-xs text-orange-400 hover:bg-orange-600/20 transition-colors"
                                          >
                                            {getFollowupPackDisplay(question.followup_pack)}
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                    <Switch
                                      checked={question.active}
                                      onCheckedChange={() => handleToggleActive(question)}
                                    />
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleEditClick(question)}
                                      className="bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white h-8 text-xs"
                                    >
                                      <Edit className="w-3.5 h-3.5 mr-1.5" />
                                      Edit
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleDuplicate(question)}
                                      className="bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white h-8 text-xs"
                                    >
                                      <Copy className="w-3.5 h-3.5 mr-1.5" />
                                      Duplicate
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setDeleteConfirm(question)}
                                      className="bg-slate-800/50 border-slate-700 text-red-400 hover:bg-red-950/30 hover:border-red-600 h-8 text-xs"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                                      Delete
                                    </Button>
                                  </div>
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
            <DialogTitle>Permanently Delete Question</DialogTitle>
            <DialogDescription className="text-slate-300">
              Are you sure you want to permanently delete this question? This action cannot be undone. The question will be completely removed from the database.
            </DialogDescription>
          </DialogHeader>
          {deleteConfirm && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 my-2">
              <p className="text-xs text-slate-400 mb-1">{deleteConfirm.question_id}</p>
              <p className="text-sm text-white">{deleteConfirm.question_text}</p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-4">
            <Button 
              variant="outline" 
              onClick={() => setDeleteConfirm(null)} 
              className="bg-slate-800 border-slate-600 text-slate-200"
              disabled={deleteQuestionMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteQuestion}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteQuestionMutation.isPending}
            >
              {deleteQuestionMutation.isPending ? 'Deleting...' : 'Delete Permanently'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
