
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Search, Plus, GripVertical, AlertCircle, ChevronLeft, Edit, Trash2, Copy, ArrowUpDown, ChevronDown, ChevronRight, Settings, Lock } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { toast } from "sonner";

import QuestionEditModal from "../components/admin/QuestionEditModal";
import FollowUpPackEditor from "../components/admin/FollowUpPackEditor";
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
  const [expandedSections, setExpandedSections] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [requiredFilter, setRequiredFilter] = useState("all");
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showFollowUpEditor, setShowFollowUpEditor] = useState(false);
  const [selectedQuestionForFollowUp, setSelectedQuestionForFollowUp] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteDoubleConfirm, setDeleteDoubleConfirm] = useState(null);
  const [sectionOrderMode, setSectionOrderMode] = useState(false);
  const [sectionMetadata, setSectionMetadata] = useState({});
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [orderInputValue, setOrderInputValue] = useState("");

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

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list(),
    enabled: !!user
  });

  // Load section metadata from Category entities
  useEffect(() => {
    if (categories.length > 0) {
      const metadata = {};
      categories.forEach(cat => {
        metadata[cat.category_label] = {
          section_active: cat.active !== false,
          gate_mode_enabled: cat.gate_skip_if_value === 'No',
          gate_question_id: cat.gate_question_id,
          section_order: cat.section_order
        };
      });
      setSectionMetadata(metadata);
    }
  }, [categories]);

  const updateCategoryMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Category.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    }
  });

  const createCategoryMutation = useMutation({
    mutationFn: (data) => base44.entities.Category.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    }
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
      setDeleteDoubleConfirm(null);
    },
    onError: (err) => {
      console.error('Delete error:', err);
      toast.error('Failed to delete question');
    }
  });

  // Build section list with metadata
  const sections = useMemo(() => {
    const sectionMap = {};
    questions.forEach(q => {
      if (!q.category) return;
      if (!sectionMap[q.category]) {
        sectionMap[q.category] = {
          name: q.category,
          count: 0,
          activeCount: 0,
          inactiveCount: 0,
          requiredCount: 0,
          gateQuestionId: null,
          question2Id: null
        };
      }
      sectionMap[q.category].count++;
      if (q.active) {
        sectionMap[q.category].activeCount++;
      } else {
        sectionMap[q.category].inactiveCount++;
      }
      if (q.is_required) {
        sectionMap[q.category].requiredCount++;
      }
      // Find the #1 position question as default gate question
      if (q.display_order === 1) {
        sectionMap[q.category].gateQuestionId = q.question_id;
      }
      // Find the #2 position question for Military History special case
      if (q.display_order === 2) {
        sectionMap[q.category].question2Id = q.question_id;
      }
    });
    
    const sectionList = Object.values(sectionMap).map(section => {
      // For Military History, use question #2 as gate if gate mode is enabled
      const isMilitaryHistory = section.name === "Military History";
      const storedGateQuestionId = sectionMetadata[section.name]?.gate_question_id;
      const gateQuestionId = isMilitaryHistory && storedGateQuestionId 
        ? storedGateQuestionId 
        : section.gateQuestionId;
      
      return {
        ...section,
        gateQuestionId,
        section_active: sectionMetadata[section.name]?.section_active !== false,
        section_order: sectionMetadata[section.name]?.section_order ?? 999,
        gate_mode_enabled: sectionMetadata[section.name]?.gate_mode_enabled || false
      };
    });
    
    // SORT BY section_order FROM DATABASE
    return sectionList.sort((a, b) => a.section_order - b.section_order);
  }, [questions, sectionMetadata]);

  // Filter sections based on search and filters
  const filteredSections = useMemo(() => {
    return sections.filter(section => {
      if (searchQuery && !section.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (statusFilter === "active" && !section.section_active) {
        return false;
      }
      if (statusFilter === "inactive" && section.section_active) {
        return false;
      }
      return true;
    });
  }, [sections, searchQuery, statusFilter]);

  const toggleSection = (sectionName) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionName]: !prev[sectionName]
    }));
  };

  const toggleSectionActive = async (sectionName) => {
    const currentActiveStatus = sectionMetadata[sectionName]?.section_active !== false;
    const newActiveStatus = !currentActiveStatus;

    // Update local state
    setSectionMetadata(prev => ({
      ...prev,
      [sectionName]: {
        ...prev[sectionName],
        section_active: newActiveStatus
      }
    }));

    // Find or create category entity
    const existingCategory = categories.find(cat => cat.category_label === sectionName);
    
    if (existingCategory) {
      // Update existing category
      await updateCategoryMutation.mutateAsync({
        id: existingCategory.id,
        data: { active: newActiveStatus }
      });
    } else {
      // Create new category (using a default display order if not exists)
      await createCategoryMutation.mutateAsync({
        category_id: `CAT_${sectionName.replace(/\s+/g, '_').toUpperCase()}`,
        category_label: sectionName,
        active: newActiveStatus,
        display_order: SECTION_ORDER.indexOf(sectionName) !== -1 ? SECTION_ORDER.indexOf(sectionName) : 999 // Initial order
      });
    }
    toast.success('Section status updated');
  };

  const toggleGateMode = async (sectionName) => {
    const currentGateMode = sectionMetadata[sectionName]?.gate_mode_enabled || false;
    const newGateMode = !currentGateMode;
    
    // Update local state
    setSectionMetadata(prev => ({
      ...prev,
      [sectionName]: {
        ...prev[sectionName],
        gate_mode_enabled: newGateMode
      }
    }));

    // Find or create category entity
    const existingCategory = categories.find(cat => cat.category_label === sectionName);
    const section = sections.find(s => s.name === sectionName);
    
    // For Military History, use question #2 as the gate question
    const isMilitaryHistory = sectionName === "Military History";
    const gateQuestionId = isMilitaryHistory 
      ? section.question2Id 
      : section.gateQuestionId;
    
    if (existingCategory) {
      // Update existing category
      await updateCategoryMutation.mutateAsync({
        id: existingCategory.id,
        data: {
          gate_skip_if_value: newGateMode ? 'No' : null,
          gate_question_id: newGateMode ? gateQuestionId : null
        }
      });
    } else {
      // Create new category
      await createCategoryMutation.mutateAsync({
        category_id: `CAT_${sectionName.replace(/\s+/g, '_').toUpperCase()}`,
        category_label: sectionName,
        gate_question_id: newGateMode ? gateQuestionId : null,
        gate_skip_if_value: newGateMode ? 'No' : null,
        display_order: SECTION_ORDER.indexOf(sectionName) !== -1 ? SECTION_ORDER.indexOf(sectionName) : 999, // Initial order
        active: true
      });
    }
    
    toast.success('Gate question mode updated');
  };

  const getQuestionsForSection = (sectionName) => {
    return questions
      .filter(q => q.category === sectionName)
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  };

  const handleSectionDragEnd = async (result) => {
    if (!result.destination) return;

    const items = Array.from(filteredSections);
    const [reordered] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reordered);

    // Update section order in metadata and persist to DB
    const updates = items.map((section, index) => {
      const existingCategory = categories.find(cat => cat.category_label === section.name);
      return {
        categoryId: existingCategory?.id, // Use existing ID if available
        categoryLabel: section.name,
        section_order: index,
        existingCategory: existingCategory
      };
    });

    try {
      await Promise.all(updates.map(async (u) => {
        if (u.categoryId) {
          await updateCategoryMutation.mutateAsync({
            id: u.categoryId,
            data: { section_order: u.section_order }
          });
        } else {
          // If category does not exist, create it with the new order
          await createCategoryMutation.mutateAsync({
            category_id: `CAT_${u.categoryLabel.replace(/\s+/g, '_').toUpperCase()}`,
            category_label: u.categoryLabel,
            section_order: u.section_order,
            active: true // Default to active for new categories
          });
        }
      }));
      queryClient.invalidateQueries({ queryKey: ['categories'] }); // Invalidate to refetch updated orders
      toast.success('Section order updated');
    } catch (err) {
      console.error("Failed to update section order:", err);
      toast.error('Failed to reorder sections');
    }
  };

  const handleQuestionDragEnd = async (result, sectionName) => {
    if (!result.destination) return;

    const sectionQuestions = getQuestionsForSection(sectionName);
    const items = Array.from(sectionQuestions);
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

  const handleAddQuestion = (sectionName) => {
    const sectionQuestions = getQuestionsForSection(sectionName);
    setEditingQuestion({
      category: sectionName,
      question_text: "",
      response_type: "yes_no",
      active: true,
      display_order: sectionQuestions.length + 1
    });
    setShowEditModal(true);
  };

  const handleDuplicate = async (question) => {
    try {
      const newQuestion = {
        ...question,
        question_id: `${question.question_id}_COPY_${Date.now()}`,
        question_text: `${question.question_text} (copy)`,
        display_order: getQuestionsForSection(question.category).length + 1
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

  const handleDeleteClick = (question) => {
    setDeleteDoubleConfirm(question);
  };

  const handleDeleteConfirm = () => {
    if (!deleteDoubleConfirm?.id) return;
    setDeleteConfirm(deleteDoubleConfirm);
    setDeleteDoubleConfirm(null);
  };

  const handleDeleteQuestion = () => {
    if (!deleteConfirm?.id) {
      toast.error('No question selected');
      return;
    }
    deleteQuestionMutation.mutate(deleteConfirm.id);
  };

  const handleOrderClick = (question) => {
    setEditingOrderId(question.id);
    setOrderInputValue(String(question.display_order || 1));
  };

  const handleOrderSave = async (question) => {
    const newOrder = parseInt(orderInputValue);
    if (isNaN(newOrder) || newOrder < 1) {
      toast.error('Please enter a valid order number');
      return;
    }

    try {
      await base44.entities.Question.update(question.id, { display_order: newOrder });
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      setEditingOrderId(null);
      toast.success('Question order updated');
    } catch (err) {
      toast.error('Failed to update order');
    }
  };

  const handleOrderBlur = (question) => {
    handleOrderSave(question);
  };

  const handleOrderKeyDown = (e, question) => {
    if (e.key === 'Enter') {
      handleOrderSave(question);
    } else if (e.key === 'Escape') {
      setEditingOrderId(null);
    }
  };

  const getSkipRuleBadge = (section) => {
    const isMilitaryHistory = section.name === "Military History";
    if (section.gate_mode_enabled) {
      return <Badge variant="outline" className="text-xs border-amber-600 text-amber-400">
        Skip if #{isMilitaryHistory ? '2' : '1'} is No
      </Badge>;
    }
    return <Badge variant="outline" className="text-xs border-slate-600 text-slate-400">Always show all</Badge>;
  };

  const getGateExplanation = (section) => {
    const isMilitaryHistory = section.name === "Military History";
    if (isMilitaryHistory) {
      return "Control Question Active: If the question at position #2 is answered \"No\", questions #3+ will be skipped. Questions #1 and #2 are always asked.";
    }
    return "Control Question Active: If the question at position #1 is answered \"No\", the rest of this section will be skipped.";
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
      {/* Header */}
      <div className="border-b border-slate-700/50 bg-[#1e293b]/80 backdrop-blur-sm px-4 md:px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(createPageUrl("SystemAdminDashboard"))}
                className="text-slate-300 hover:text-white -ml-2"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
              <Shield className="w-6 h-6 text-blue-400" />
              <div>
                <h1 className="text-xl font-bold text-white">Question Bank Manager</h1>
                <p className="text-xs text-slate-400">Manage investigative sections, flow, and required questions</p>
              </div>
            </div>
          </div>

          {/* Top controls */}
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <div className="md:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                placeholder="Search sections..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Status: All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <div className="md:col-span-2"></div>
            <Button
              onClick={() => setSectionOrderMode(!sectionOrderMode)}
              variant={sectionOrderMode ? "default" : "outline"}
              className={sectionOrderMode ? "bg-blue-600 hover:bg-blue-700" : "bg-slate-700/30 border-slate-600 text-slate-200 hover:bg-slate-700"}
            >
              <ArrowUpDown className="w-4 h-4 mr-2" />
              {sectionOrderMode ? 'Done Ordering' : 'Edit Section Order'}
            </Button>
          </div>
        </div>
      </div>

      {/* Section order mode banner */}
      {sectionOrderMode && (
        <div className="bg-blue-950/30 border-b border-blue-800/50 px-4 md:px-6 py-3">
          <div className="max-w-7xl mx-auto">
            <p className="text-sm text-blue-300">
              <ArrowUpDown className="w-4 h-4 inline mr-2" />
              Reorder sections – drag rows to change interview flow
            </p>
          </div>
        </div>
      )}

      {/* Main content - Section list */}
      <div className="px-4 md:px-6 py-6">
        <div className="max-w-7xl mx-auto">
          {isLoading ? (
            <div className="text-center text-slate-400 py-12">Loading sections...</div>
          ) : filteredSections.length === 0 ? (
            <div className="text-center text-slate-400 py-12">
              No sections found. Try adjusting your filters.
            </div>
          ) : (
            <DragDropContext onDragEnd={handleSectionDragEnd}>
              <Droppable droppableId="sections" isDropDisabled={!sectionOrderMode}>
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-3">
                    {filteredSections.map((section, index) => (
                      <Draggable
                        key={section.name}
                        draggableId={section.name}
                        index={index}
                        isDragDisabled={!sectionOrderMode}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`bg-slate-800/30 border rounded-lg transition-all ${
                              snapshot.isDragging ? 'border-blue-500 shadow-lg shadow-blue-500/20' : 'border-slate-700/50'
                            } ${!section.section_active ? 'opacity-60' : ''}`}
                          >
                            {/* Section header (always visible) */}
                            <div className="p-4">
                              <div className="flex items-start gap-3">
                                {sectionOrderMode && (
                                  <div {...provided.dragHandleProps} className="pt-1 cursor-grab active:cursor-grabbing">
                                    <GripVertical className="w-5 h-5 text-slate-600 hover:text-slate-400 transition-colors" />
                                  </div>
                                )}
                                
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between mb-2">
                                    <div className="flex-1">
                                      <button
                                        onClick={() => toggleSection(section.name)}
                                        className="flex items-start gap-2 text-left group w-full"
                                      >
                                        {expandedSections[section.name] ? (
                                          <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
                                        ) : (
                                          <ChevronRight className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
                                        )}
                                        <div className="flex-1">
                                          <h3 className="text-base font-semibold text-white group-hover:text-blue-400 transition-colors">
                                            {section.name}
                                          </h3>
                                          <p className="text-sm text-slate-400 mt-1">
                                            {section.count} questions • {section.activeCount} active • {section.inactiveCount} inactive
                                          </p>
                                        </div>
                                      </button>
                                    </div>
                                    
                                    <Button
                                      onClick={() => toggleSection(section.name)}
                                      variant="ghost"
                                      size="sm"
                                      className="text-slate-400 hover:text-white -mr-2"
                                    >
                                      {expandedSections[section.name] ? 'Collapse' : 'Manage questions'}
                                    </Button>
                                  </div>

                                  {/* Section controls */}
                                  <div className="flex flex-wrap items-center gap-3 mt-3">
                                    {/* Status toggle */}
                                    <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 transition-colors ${
                                      section.section_active 
                                        ? 'bg-emerald-500/10 border border-emerald-500/30' 
                                        : 'bg-slate-800/50 border border-slate-700'
                                    }`}>
                                      <Switch
                                        checked={section.section_active}
                                        onCheckedChange={() => toggleSectionActive(section.name)}
                                        className="scale-90"
                                      />
                                      <Label className={`text-xs cursor-pointer font-medium ${
                                        section.section_active ? 'text-emerald-400' : 'text-slate-400'
                                      }`}>
                                        {section.section_active ? 'Active' : 'Inactive'}
                                      </Label>
                                    </div>

                                    {/* Gate question toggle */}
                                    <div 
                                      className="flex items-center gap-2 bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-1.5 cursor-pointer hover:border-slate-600 transition-colors"
                                      onClick={() => toggleGateMode(section.name)}
                                    >
                                      <Settings className="w-3 h-3 text-slate-400" />
                                      {getSkipRuleBadge(section)}
                                    </div>
                                  </div>

                                  {/* Gate mode explanation */}
                                  {section.gate_mode_enabled && (
                                    <div className="mt-3 bg-amber-950/20 border border-amber-800/30 rounded-lg px-3 py-2">
                                      <p className="text-xs text-amber-400">
                                        <Lock className="w-3 h-3 inline mr-1" />
                                        {getGateExplanation(section)}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Expanded section - show questions */}
                            {expandedSections[section.name] && (
                              <div className="border-t border-slate-700/50 bg-slate-900/20 p-4">
                                <div className="flex justify-between items-center mb-4">
                                  <h4 className="text-sm font-medium text-slate-300">
                                    Questions ({getQuestionsForSection(section.name).length})
                                  </h4>
                                  <Button
                                    onClick={() => handleAddQuestion(section.name)}
                                    size="sm"
                                    className="bg-blue-600 hover:bg-blue-700"
                                  >
                                    <Plus className="w-4 h-4 mr-1" />
                                    Add Question
                                  </Button>
                                </div>

                                <DragDropContext onDragEnd={(result) => handleQuestionDragEnd(result, section.name)}>
                                  <Droppable droppableId={`questions-${section.name}`}>
                                    {(provided) => (
                                      <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                                        {getQuestionsForSection(section.name).map((question, qIndex) => {
                                          const isMilitaryHistory = section.name === "Military History";
                                          const isGateQuestion = isMilitaryHistory 
                                            ? question.display_order === 2 
                                            : question.display_order === 1;
                                          const isControlActive = section.gate_mode_enabled && isGateQuestion;
                                          
                                          return (
                                            <Draggable key={question.id} draggableId={question.id} index={qIndex}>
                                              {(provided, snapshot) => (
                                                <div
                                                  ref={provided.innerRef}
                                                  {...provided.draggableProps}
                                                  className={`bg-slate-800/40 border rounded-lg transition-all ${
                                                    snapshot.isDragging ? 'border-blue-500 shadow-lg shadow-blue-500/20' : 
                                                    isControlActive ? 'border-amber-600/50' : 'border-slate-700/50 hover:border-slate-600'
                                                  } ${!question.active ? 'opacity-40' : ''}`}
                                                >
                                                  <div className="p-3">
                                                    <div className="flex items-start gap-3">
                                                      <div {...provided.dragHandleProps} className="pt-1 cursor-grab active:cursor-grabbing">
                                                        <GripVertical className="w-4 h-4 text-slate-600 hover:text-slate-400 transition-colors" />
                                                      </div>
                                                      <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                          {editingOrderId === question.id ? (
                                                            <Input
                                                              type="number"
                                                              value={orderInputValue}
                                                              onChange={(e) => setOrderInputValue(e.target.value)}
                                                              onBlur={() => handleOrderBlur(question)}
                                                              onKeyDown={(e) => handleOrderKeyDown(e, question)}
                                                              className="w-16 h-6 px-2 py-0 text-xs bg-slate-900 border-blue-500 text-blue-400"
                                                              autoFocus
                                                            />
                                                          ) : (
                                                            <button
                                                              onClick={() => handleOrderClick(question)}
                                                              className="font-mono text-xs border border-slate-600 text-blue-400 px-2 py-0.5 rounded hover:bg-slate-700 hover:border-blue-500 transition-colors"
                                                            >
                                                              #{question.display_order || 1}
                                                            </button>
                                                          )}
                                                          <Badge variant="outline" className="font-mono text-xs border-slate-600 text-slate-300">
                                                            {question.question_id}
                                                          </Badge>
                                                          
                                                          {/* Active toggle with same design as section */}
                                                          <div className={`flex items-center gap-2 rounded-lg px-2 py-0.5 transition-colors ${
                                                            question.active 
                                                              ? 'bg-emerald-500/10 border border-emerald-500/30' 
                                                              : 'bg-slate-800/50 border border-slate-700'
                                                          }`}>
                                                            <Switch
                                                              checked={question.active}
                                                              onCheckedChange={() => handleToggleActive(question)}
                                                              className="scale-75"
                                                            />
                                                            <Label className={`text-xs cursor-pointer font-medium ${
                                                              question.active ? 'text-emerald-400' : 'text-slate-400'
                                                            }`}>
                                                              {question.active ? 'Active' : 'Inactive'}
                                                            </Label>
                                                          </div>
                                                          
                                                          {isControlActive && (
                                                            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30" variant="outline">
                                                              <Lock className="w-3 h-3 mr-1" />
                                                              Control Question
                                                            </Badge>
                                                          )}
                                                          {question.is_required && (
                                                            <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30" variant="outline">
                                                              Required question
                                                            </Badge>
                                                          )}
                                                        </div>
                                                        <p className="text-white text-sm leading-relaxed mb-2">
                                                          {question.question_text}
                                                        </p>
                                                        <div className="flex items-center gap-2">
                                                          <Badge variant="outline" className="text-xs border-slate-600 text-slate-300">
                                                            {getResponseTypeDisplay(question.response_type)}
                                                          </Badge>
                                                          {question.followup_pack && (
                                                            <button
                                                              onClick={() => handleFollowUpClick(question)}
                                                              className="px-2 py-0.5 bg-orange-600/10 border border-orange-600/30 rounded text-xs text-orange-400 hover:bg-orange-600/20 transition-colors"
                                                            >
                                                              {getFollowupPackDisplay(question.followup_pack)}
                                                            </button>
                                                          )}
                                                        </div>
                                                      </div>
                                                      <div className="flex gap-1.5">
                                                        <Button
                                                          variant="outline"
                                                          size="sm"
                                                          onClick={() => handleEditClick(question)}
                                                          className="bg-slate-700/30 border-slate-600 text-slate-200 hover:bg-slate-700 h-7 text-xs"
                                                        >
                                                          <Edit className="w-3 h-3 mr-1" />
                                                          Edit
                                                        </Button>
                                                        <Button
                                                          variant="outline"
                                                          size="sm"
                                                          onClick={() => handleDuplicate(question)}
                                                          className="bg-slate-700/30 border-slate-600 text-slate-200 hover:bg-slate-700 h-7 text-xs hidden sm:flex"
                                                        >
                                                          <Copy className="w-3 h-3" />
                                                        </Button>
                                                        <Button
                                                          variant="outline"
                                                          size="sm"
                                                          onClick={() => handleDeleteClick(question)}
                                                          className="bg-slate-700/30 border-slate-600 text-red-400 hover:bg-red-950/30 hover:border-red-600 h-7 text-xs"
                                                        >
                                                          <Trash2 className="w-3 h-3" />
                                                        </Button>
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
      </div>

      {/* Edit question modal */}
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

      {/* Follow-up pack editor */}
      {showFollowUpEditor && selectedQuestionForFollowUp && (
        <FollowUpPackEditor
          question={selectedQuestionForFollowUp}
          onClose={() => {
            setShowFollowUpEditor(false);
            setSelectedQuestionForFollowUp(null);
          }}
        />
      )}

      {/* Delete confirmation dialogs */}
      <Dialog open={!!deleteDoubleConfirm} onOpenChange={() => setDeleteDoubleConfirm(null)}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Delete Question?</DialogTitle>
            <DialogDescription className="text-slate-300">
              Are you sure you want to delete this question? This action requires confirmation.
            </DialogDescription>
          </DialogHeader>
          {deleteDoubleConfirm && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 my-2">
              <p className="text-xs text-slate-400 mb-1">{deleteDoubleConfirm.question_id}</p>
              <p className="text-sm text-white">{deleteDoubleConfirm.question_text}</p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-4">
            <Button 
              variant="outline" 
              onClick={() => setDeleteDoubleConfirm(null)} 
              className="bg-slate-800 border-slate-600 text-slate-200"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteConfirm}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Yes, Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-red-400">⚠️ Permanently Delete Question</DialogTitle>
            <DialogDescription className="text-slate-300">
              This action cannot be undone. The question will be completely removed from the database.
            </DialogDescription>
          </DialogHeader>
          {deleteConfirm && (
            <div className="bg-red-950/30 border border-red-700/50 rounded-lg p-3 my-2">
              <p className="text-xs text-red-300 mb-1">{deleteConfirm.question_id}</p>
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
              {deleteQuestionMutation.isPending ? 'Deleting...' : 'Permanently Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
