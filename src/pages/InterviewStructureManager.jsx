
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
import { ChevronLeft, ChevronRight, ChevronDown, Plus, Edit, Trash2, GripVertical, FolderOpen, FileText, Layers, Package, Lock, AlertCircle, ShieldAlert } from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { toast } from "sonner";
import { getFollowupPackDisplay, getResponseTypeDisplay, FOLLOWUP_PACK_NAMES, RESPONSE_TYPE_NAMES } from "../components/utils/followupPackNames";

const GROUPED_PACKS = {
  "Law Enforcement": [
    'PACK_LE_APPS', 'PACK_LE_PREV', 'PACK_LE_INTERVIEW', 'PACK_LE_COMPLAINT',
    'PACK_ACCUSED_FORCE', 'PACK_GRATUITY', 'PACK_FALSIFY_REPORT',
    'PACK_INTERNAL_AFFAIRS', 'PACK_LYING_LE', 'PACK_OTHER_PRIOR_LE'
  ],
  "Driving & Traffic": [
    'PACK_DUI', 'PACK_DUI_STOP', 'PACK_DUI_ARREST', 'PACK_LICENSE_SUSPENSION',
    'PACK_LICENSE_SUSPENDED', 'PACK_REVOKED_LICENSE', 'PACK_SUSPENDED_LICENSE',
    'PACK_RECKLESS_DRIVING', 'PACK_TRAFFIC', 'PACK_TRAFFIC_CITATION',
    'PACK_CRIMINAL_TRAFFIC', 'PACK_TRAFFIC_ARREST', 'PACK_ROAD_RAGE',
    'PACK_OTHER_DRIVING', 'PACK_COLLISION', 'PACK_COLLISION_INJURY',
    'PACK_ALCOHOL_COLLISION', 'PACK_UNREPORTED_COLLISION', 'PACK_HIT_RUN',
    'PACK_HIT_RUN_DAMAGE', 'PACK_NO_INSURANCE', 'PACK_INSURANCE_REFUSED',
    'PACK_DRIVE_NO_INSURANCE'
  ],
  "Criminal History": [
    'PACK_ARREST', 'PACK_CHARGES', 'PACK_CRIMINAL_CHARGE', 'PACK_CONVICTION',
    'PACK_DIVERSION', 'PACK_PROBATION', 'PACK_INVESTIGATION', 'PACK_POLICE_CALLED',
    'PACK_WARRANT', 'PACK_FELONY', 'PACK_FELONY_DETAIL', 'PACK_CONSPIRACY',
    'PACK_PLANNED_CRIME', 'PACK_JUVENILE_CRIME', 'PACK_UNCAUGHT_CRIME',
    'PACK_FOREIGN_CRIME', 'PACK_POLICE_REPORT', 'PACK_ARRESTABLE_ACTIVITY',
    'PACK_CRIMINAL_ASSOCIATES', 'PACK_CRIMINAL_ORGANIZATION', 'PACK_POLICE_BRUTALITY',
    'PACK_OTHER_CRIMINAL'
  ],
  "Violence & Domestic": [
    'PACK_FIGHT', 'PACK_DOMESTIC_VIOLENCE', 'PACK_PROTECTIVE_ORDER',
    'PACK_ASSAULT', 'PACK_SERIOUS_INJURY', 'PACK_DOMESTIC_VICTIM',
    'PACK_DOMESTIC_ACCUSED', 'PACK_DOMESTIC'
  ],
  "Crimes Against Children": [
    'PACK_CHILD_CRIME_COMMITTED', 'PACK_CHILD_CRIME_ACCUSED',
    'PACK_CHILD_PROTECTION', 'PACK_MINOR_CONTACT'
  ],
  "Theft & Property": [
    'PACK_SHOPLIFTING', 'PACK_THEFT_QUESTIONING', 'PACK_THEFT',
    'PACK_STOLEN_PROPERTY', 'PACK_STOLEN_VEHICLE', 'PACK_TRESPASSING',
    'PACK_PROPERTY_DAMAGE', 'PACK_STOLEN_GOODS'
  ],
  "Fraud & Cybercrime": [
    'PACK_SIGNATURE_FORGERY', 'PACK_HACKING', 'PACK_ILLEGAL_DOWNLOADS',
    'PACK_FALSE_APPLICATION', 'PACK_UNEMPLOYMENT_FRAUD', 'PACK_IRS_INVESTIGATION',
    'PACK_UNREPORTED_INCOME'
  ],
  "Weapons & Gangs": [
    'PACK_WEAPON_VIOLATION', 'PACK_ILLEGAL_WEAPON', 'PACK_CARRY_WEAPON',
    'PACK_GANG', 'PACK_HATE_CRIME'
  ],
  "Extremism": [
    'PACK_EXTREMIST', 'PACK_EXTREMIST_DETAIL'
  ],
  "Sexual Misconduct": [
    'PACK_PROSTITUTION', 'PACK_PAID_SEX', 'PACK_PORNOGRAPHY',
    'PACK_HARASSMENT', 'PACK_NON_CONSENT'
  ],
  "Financial Issues": [
    'PACK_FINANCIAL', 'PACK_BANKRUPTCY', 'PACK_FORECLOSURE', 'PACK_REPOSSESSION',
    'PACK_LAWSUIT', 'PACK_LATE_PAYMENT', 'PACK_GAMBLING', 'PACK_OTHER_FINANCIAL',
    'PACK_CRIME_FOR_DEBT'
  ],
  "Drug Use & Distribution": [
    'PACK_DRUG_USE', 'PACK_DRUG_SALE', 'PACK_PRESCRIPTION_MISUSE',
    'PACK_DRUG_TEST_CHEAT', 'ILLEGAL_DRUG_USE'
  ],
  "Alcohol": [
    'PACK_ALCOHOL_DEPENDENCY', 'PACK_ALCOHOL_INCIDENT', 'PACK_PROVIDE_ALCOHOL'
  ],
  "Military": [
    'PACK_MIL_SERVICE', 'PACK_MIL_REJECTION', 'PACK_MIL_DISCHARGE',
    'PACK_MIL_DISCIPLINE'
  ],
  "Employment & Discipline": [
    'PACK_DISCIPLINE', 'PACK_WORK_DISCIPLINE', 'PACK_FIRED', 'PACK_QUIT_AVOID',
    'PACK_MISUSE_RESOURCES'
  ],
  "Disclosure & Integrity": [
    'PACK_WITHHOLD_INFO', 'PACK_DISQUALIFIED', 'PACK_CHEATING',
    'PACK_DELETED_SOCIAL_MEDIA', 'PACK_PRANK_CRIME', 'PACK_ILLEGAL_FIREWORKS',
    'PACK_EMBARRASSMENT', 'PACK_TATTOO', 'PACK_SOCIAL_MEDIA'
  ]
};

async function generateNextQuestionId() {
  try {
    const allQuestions = await base44.entities.Question.list();
    let maxNum = 0;
    allQuestions.forEach(q => {
      const match = q.question_id?.match(/^Q(\d+)/);
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxNum) maxNum = num;
      }
    });
    const nextNum = maxNum + 1;
    return `Q${String(nextNum).padStart(3, '0')}`;
  } catch (err) {
    console.error('Error generating question ID:', err);
    return 'Q001';
  }
}

export default function InterviewStructureManager() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [user, setUser] = useState(null);
  const [expandedNodes, setExpandedNodes] = useState({});
  const [selectedItem, setSelectedItem] = useState(null);
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

  const sortedSections = [...sections].sort((a, b) => (a.section_order || 0) - (b.section_order || 0));

  const toggleNode = (nodeId) => {
    setExpandedNodes(prev => ({
      ...prev,
      [nodeId]: !prev[nodeId]
    }));
  };

  const toggleSectionActive = async (e, section) => {
    e.stopPropagation();
    try {
      await base44.entities.Section.update(section.id, {
        active: !section.active
      });
      queryClient.invalidateQueries({ queryKey: ['sections'] });
      toast.success(`Section "${section.section_name}" ${!section.active ? 'activated' : 'deactivated'}`);
    } catch (err) {
      toast.error('Failed to update section active status');
    }
  };

  const toggleQuestionActive = async (e, question) => {
    e.stopPropagation();
    try {
      await base44.entities.Question.update(question.id, {
        active: !question.active
      });
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      toast.success(`Question "${question.question_id}" ${!question.active ? 'activated' : 'deactivated'}`);
    } catch (err) {
      toast.error('Failed to update question active status');
    }
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

  return (
    <div className="min-h-screen bg-[#0f172a]">
      {/* Header */}
      <div className="border-b border-slate-700/50 bg-[#1e293b]/80 backdrop-blur-sm px-6 py-4">
        <div className="max-w-[1600px] mx-auto">
          <div className="flex items-center justify-between mb-2">
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
              <FolderOpen className="w-6 h-6 text-blue-400" />
              <div>
                <h1 className="text-xl font-bold text-white">Interview Structure Manager</h1>
                <p className="text-xs text-slate-400">Manage sections, questions, and follow-up packs</p>
              </div>
            </div>
            {/* Removed Sync All Questions button and migration related elements */}
          </div>
        </div>
      </div>

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
                <p className="text-slate-400 text-center py-8">No sections yet. Create your first section to get started.</p>
              ) : (
                <DragDropContext onDragEnd={handleSectionDragEnd}>
                  <Droppable droppableId="sections">
                    {(provided) => (
                      <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                        {sortedSections.map((section, index) => {
                          const sectionQuestionsAll = questions.filter(q => q.section_id === section.id);
                          const activeCount = sectionQuestionsAll.filter(q => q.active !== false).length;
                          const inactiveCount = sectionQuestionsAll.filter(q => q.active === false).length;
                          
                          // Find gate question for this section
                          const gateCategory = categories.find(c => c.category_label === section.section_name);
                          const gateQuestionId = gateCategory?.gate_question_id;
                          
                          return (
                            <Draggable key={section.id} draggableId={section.id} index={index}>
                              {(provided) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  className={`bg-slate-900/50 border rounded-lg hover:border-blue-500/50 transition-colors ${
                                    section.active ? 'border-slate-700' : 'border-slate-700 opacity-60'
                                  }`}
                                >
                                  {/* Section Header */}
                                  <div className="p-3">
                                    <div className="flex items-start gap-2">
                                      <div {...provided.dragHandleProps}>
                                        <GripVertical className="w-4 h-4 text-slate-500 hover:text-slate-300 cursor-grab active:cursor-grabbing mt-1" />
                                      </div>
                                      <button
                                        onClick={() => toggleNode(`section-${section.id}`)}
                                        className="text-slate-400 hover:text-white transition-colors mt-1"
                                      >
                                        {expandedNodes[`section-${section.id}`] ? 
                                          <ChevronDown className="w-5 h-5" /> : 
                                          <ChevronRight className="w-5 h-5" />
                                        }
                                      </button>
                                      <FolderOpen className="w-5 h-5 text-blue-400 mt-1" />
                                      <div className="flex-1 min-w-0">
                                        <button
                                          onClick={() => setSelectedItem({ type: 'section', data: section })}
                                          className="text-left w-full group"
                                        >
                                          <h3 className="text-base font-semibold text-white group-hover:text-blue-400 transition-colors">
                                            {section.section_name}
                                          </h3>
                                          <p className="text-sm text-slate-400 mt-1">
                                            {sectionQuestionsAll.length} questions • {activeCount} active • {inactiveCount} inactive
                                          </p>
                                        </button>
                                        <div className="flex gap-2 mt-2 flex-wrap">
                                          <Badge variant="outline" className="text-xs bg-slate-700/50 border-slate-600 text-slate-300">
                                            #{section.section_order}
                                          </Badge>
                                          <Badge 
                                            onClick={(e) => toggleSectionActive(e, section)}
                                            className={`text-xs cursor-pointer hover:opacity-80 transition-opacity ${
                                              section.active
                                                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                                                : 'bg-slate-700/50 border-slate-600 text-slate-400'
                                            }`}
                                          >
                                            {section.active ? 'Active' : 'Inactive'}
                                          </Badge>
                                          {section.required && (
                                            <Badge className="text-xs bg-orange-500/20 border-orange-500/50 text-orange-400">
                                              Required
                                            </Badge>
                                          )}
                                          {gateQuestionId && (
                                            <Badge className="text-xs bg-amber-500/20 border-amber-500/50 text-amber-400">
                                              <Lock className="w-3 h-3 mr-1" />
                                              Control: {gateQuestionId}
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
                                  </div>

                                  {/* Questions in Section */}
                                  {expandedNodes[`section-${section.id}`] && (
                                    <div className="border-t border-slate-700/50 p-3 pl-12 bg-slate-900/30">
                                      <QuestionList 
                                        section={section}
                                        sectionId={section.id} 
                                        questions={questions}
                                        categories={categories}
                                        followUpPacks={followUpPacks}
                                        followUpQuestions={followUpQuestions}
                                        expandedNodes={expandedNodes}
                                        toggleNode={toggleNode}
                                        toggleQuestionActive={toggleQuestionActive}
                                        setSelectedItem={setSelectedItem}
                                        onDragEnd={handleQuestionDragEnd}
                                        onFollowUpDragEnd={handleFollowUpQuestionDragEnd}
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
              )}
            </div>

            {/* Detail Panel - Sticky */}
            <div className="lg:sticky lg:top-6 lg:self-start bg-slate-800/30 border border-slate-700/50 rounded-lg p-6 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
              <DetailPanel
                selectedItem={selectedItem}
                sections={sections}
                categories={categories}
                questions={questions}
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
                try {
                  if (deleteConfirm.type === 'question') {
                    await base44.entities.Question.delete(deleteConfirm.data.id);
                    queryClient.invalidateQueries({ queryKey: ['questions'] });
                    toast.success('Question deleted');
                  }
                  setDeleteConfirm(null);
                  setDeleteInput("");
                  setSelectedItem(null);
                } catch (err) {
                  toast.error('Failed to delete');
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

function QuestionList({ section, sectionId, questions, categories, followUpPacks, followUpQuestions, expandedNodes, toggleNode, toggleQuestionActive, setSelectedItem, onDragEnd, onFollowUpDragEnd }) {
  const sectionQuestions = questions
    .filter(q => q.section_id === sectionId)
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

  // Find gate question for this section
  const gateCategory = categories.find(c => c.category_label === section.section_name);
  const gateQuestionId = gateCategory?.gate_question_id;

  if (sectionQuestions.length === 0) {
    return (
      <div className="flex justify-between items-center bg-slate-800/30 border border-slate-700 rounded-lg p-3">
        <p className="text-sm text-slate-400">No questions in this section yet.</p>
        <Button
          onClick={() => setSelectedItem({ type: 'new-question', sectionId: section.id, sectionName: section.section_name })}
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Question
        </Button>
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={(result) => onDragEnd(result, sectionId)}>
      <Droppable droppableId={`questions-${sectionId}`}>
        {(provided) => (
          <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
            {sectionQuestions.map((question, index) => {
              const pack = followUpPacks.find(p => p.followup_pack_id === question.followup_pack_id || p.pack_name === question.followup_pack);
              const isControlQuestion = gateQuestionId === question.question_id;
              
              return (
                <Draggable key={question.id} draggableId={question.id} index={index}>
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className={`bg-slate-800/50 border rounded-lg p-3 transition-colors ${
                        isControlQuestion 
                          ? 'border-amber-500/50 bg-amber-950/10 hover:border-amber-500' 
                          : question.active 
                            ? 'border-slate-600 hover:border-emerald-500/50' 
                            : 'border-slate-700 opacity-40 hover:border-slate-600'
                      }`}
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
                        <div 
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => setSelectedItem({ type: 'question', data: question })}
                        >
                          {/* Top metadata row */}
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <Badge variant="outline" className="font-mono text-xs border-slate-600 text-blue-400">
                              #{question.display_order || 1}
                            </Badge>
                            <Badge variant="outline" className="font-mono text-xs border-slate-600 text-slate-300">
                              {question.question_id}
                            </Badge>
                            <Badge 
                              onClick={(e) => toggleQuestionActive(e, question)}
                              className={`text-xs cursor-pointer hover:opacity-80 transition-opacity ${
                                question.active
                                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                                  : 'bg-slate-700/50 border-slate-600 text-slate-400'
                              }`}
                            >
                              {question.active ? 'Active' : 'Inactive'}
                            </Badge>
                            {isControlQuestion && (
                              <Badge className="text-xs bg-amber-500/20 border-amber-500/50 text-amber-400">
                                <Lock className="w-3 h-3 mr-1" />
                                Control
                              </Badge>
                            )}
                          </div>
                          
                          {/* Question Text */}
                          <p className="text-sm text-white leading-relaxed mb-2">{question.question_text}</p>
                          
                          {/* Bottom metadata */}
                          <div className="flex gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs border-slate-600 text-slate-300">
                              {getResponseTypeDisplay(question.response_type)}
                            </Badge>
                            {question.followup_pack && (
                              <Badge className="text-xs bg-purple-500/20 border-purple-500/50 text-purple-400">
                                {FOLLOWUP_PACK_NAMES[question.followup_pack] || question.followup_pack}
                              </Badge>
                            )}
                            {question.followup_multi_instance && (
                              <Badge className="text-xs bg-purple-500/20 border-purple-500/50 text-purple-400">
                                <Layers className="w-3 h-3 mr-1" />
                                Multi
                              </Badge>
                            )}
                            {question.substance_name && (
                              <Badge variant="outline" className="text-xs border-amber-600 text-amber-400">
                                {question.substance_name}
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

function DetailPanel({ selectedItem, sections, categories, questions, followUpPacks, onClose, onDelete }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({});
  const [defaultPackGroup, setDefaultPackGroup] = useState(null);
  const [isGateQuestion, setIsGateQuestion] = useState(false);
  const [currentCategoryEntity, setCurrentCategoryEntity] = useState(null);

  useEffect(() => {
    if (selectedItem?.data) {
      setFormData(selectedItem.data);
      
      // Check if this question is a gate question based on its associated section
      if (selectedItem.type === 'question' && selectedItem.data.section_id) {
        const section = sections.find(s => s.id === selectedItem.data.section_id);
        if (section) {
          const cat = categories.find(c => c.category_label === section.section_name);
          if (cat) {
            setCurrentCategoryEntity(cat);
            setIsGateQuestion(cat.gate_question_id === selectedItem.data.question_id);
          } else {
            setCurrentCategoryEntity(null);
            setIsGateQuestion(false);
          }
        } else {
          setCurrentCategoryEntity(null);
          setIsGateQuestion(false);
        }
      } else {
        setFormData({});
        setIsGateQuestion(false);
        setCurrentCategoryEntity(null);
      }
    } else {
      setFormData({});
      setIsGateQuestion(false);
      setCurrentCategoryEntity(null);
    }
  }, [selectedItem, categories, sections]);

  // Determine default pack group based on category derived from the section
  useEffect(() => {
    if (formData.section_id && sections.length > 0) {
      const section = sections.find(s => s.id === formData.section_id);
      if (section) {
        const categoryMap = {
          "Applications with Other Law Enforcement Agencies": "Law Enforcement",
          "Prior Law Enforcement": "Law Enforcement",
          "Prior Law Enforcement ONLY": "Law Enforcement",
          "Driving Record": "Driving & Traffic",
          "Criminal Involvement / Police Contacts": "Criminal History",
          "Extremist Organizations": "Extremism",
          "Sexual Activities": "Sexual Misconduct",
          "Financial History": "Financial Issues",
          "Illegal Drug / Narcotic History": "Drug Use & Distribution",
          "Alcohol History": "Alcohol",
          "Military History": "Military",
          "Employment History": "Employment & Discipline",
          "General Disclosures & Eligibility": "Disclosure & Integrity"
        };
        setDefaultPackGroup(categoryMap[section.section_name] || null);
      } else {
        setDefaultPackGroup(null);
      }
    } else {
      setDefaultPackGroup(null);
    }
  }, [formData.section_id, sections]);

  const handleSave = async () => {
    try {
      if (selectedItem?.type === 'section') {
        await base44.entities.Section.update(selectedItem.data.id, formData);
        queryClient.invalidateQueries({ queryKey: ['sections'] });
        toast.success('Section updated');
      } else if (selectedItem?.type === 'question') {
        const section = sections.find(s => s.id === formData.section_id);
        const saveData = {
          ...formData,
          category: section?.section_name || formData.category // Ensure category matches section_name
        };
        
        await base44.entities.Question.update(selectedItem.data.id, saveData);
        
        // Update category gate question setting
        if (currentCategoryEntity) {
          await base44.entities.Category.update(currentCategoryEntity.id, {
            gate_question_id: isGateQuestion ? formData.question_id : null,
            gate_skip_if_value: isGateQuestion ? 'No' : null
          });
        }
        
        queryClient.invalidateQueries({ queryKey: ['questions'] });
        queryClient.invalidateQueries({ queryKey: ['categories'] });
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
          section_order: maxOrder + 1,
          active: formData.active !== false, // Default to true if not specified
          required: formData.required !== false // Default to true if not specified
        });
        queryClient.invalidateQueries({ queryKey: ['sections'] });
        toast.success('Section created');
        onClose();
      } else if (selectedItem?.type === 'new-question') {
        const newQuestionId = await generateNextQuestionId();
        const sectionQuestions = questions.filter(q => q.section_id === selectedItem.sectionId);
        const maxOrder = Math.max(0, ...sectionQuestions.map(q => q.display_order || 0));
        
        const section = sections.find(s => s.id === selectedItem.sectionId);
        
        await base44.entities.Question.create({
          ...formData,
          question_id: newQuestionId,
          section_id: selectedItem.sectionId,
          category: section?.section_name || '', // Set category from section name for new questions
          display_order: maxOrder + 1,
          active: true,
          response_type: formData.response_type || 'yes_no'
        });
        queryClient.invalidateQueries({ queryKey: ['questions'] });
        toast.success('Question created');
        onClose();
      }
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Failed to save: ' + (err.message || 'Unknown error'));
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
    const section = selectedItem.data;
    const sectionQuestionsAll = questions.filter(q => q.section_id === section?.id);
    
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">
            {selectedItem.type === 'new-section' ? 'New Section' : 'Edit Section'}
          </h3>
          {selectedItem.type !== 'new-section' && ( // Changed condition here, allow adding questions to empty sections
            <Button
              onClick={() => setSelectedItem({ type: 'new-question', sectionId: section.id, sectionName: section.section_name })}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Question
            </Button>
          )}
        </div>
        
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

            <div className="flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-lg p-3">
              <Label className="text-slate-300">Active</Label>
              <Switch
                checked={formData.active !== false}
                onCheckedChange={(checked) => setFormData({...formData, active: checked})}
                className="data-[state=checked]:bg-emerald-600"
              />
            </div>

            <div className="flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-lg p-3">
              <Label className="text-slate-300">Required</Label>
              <Switch
                checked={formData.required !== false}
                onCheckedChange={(checked) => setFormData({...formData, required: checked})}
                disabled={formData.active === false}
                className="data-[state=checked]:bg-emerald-600"
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

  if (selectedItem.type === 'question' || selectedItem.type === 'new-question') {
    const sortedSectionsAlpha = [...sections].sort((a, b) => 
      (a.section_name || '').localeCompare(b.section_name || '')
    );
    
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">
            {selectedItem.type === 'new-question' ? `Add Question to ${selectedItem.sectionName}` : 'Edit Question'}
          </h3>
          {selectedItem.type === 'question' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(selectedItem)}
              className="text-red-400 hover:text-red-300 hover:bg-red-950/30"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
        
        {selectedItem.type === 'question' && (
          <div>
            <Label className="text-slate-300">Question ID</Label>
            <Input
              value={formData.question_id || ''}
              disabled
              className="bg-slate-800 border-slate-600 text-slate-400 mt-1"
            />
          </div>
        )}

        <div>
          <Label className="text-slate-300">Display Order</Label>
          <Input
            type="number"
            value={formData.display_order || 1}
            onChange={(e) => setFormData({...formData, display_order: parseInt(e.target.value)})}
            className="bg-slate-800 border-slate-600 text-white mt-1"
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
              {Object.entries(RESPONSE_TYPE_NAMES).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Section selection is available for both existing and new questions when creating via the detail panel directly */}
        <div>
          <Label className="text-slate-300">Section</Label>
          <Select
            value={formData.section_id || ''}
            onValueChange={(v) => setFormData({...formData, section_id: v})}
          >
            <SelectTrigger className="bg-slate-800 border-slate-600 text-white mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortedSectionsAlpha.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.section_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-slate-300 flex items-center gap-2">
            Follow-Up Pack
            {formData.response_type === 'yes_no' && !formData.followup_pack && (
              <span className="text-xs text-yellow-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Recommended
              </span>
            )}
          </Label>
          <Select 
            value={formData.followup_pack || ""} 
            onValueChange={(v) => setFormData({...formData, followup_pack: v === "" ? null : v})}
          >
            <SelectTrigger className="bg-slate-800 border-slate-600 text-white mt-1">
              <SelectValue placeholder="None">
                {formData.followup_pack ? `${FOLLOWUP_PACK_NAMES[formData.followup_pack] || formData.followup_pack}` : "None"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-96 bg-slate-900">
              <SelectItem value={null}>None</SelectItem>
              {Object.entries(GROUPED_PACKS).map(([groupName, packs]) => {
                const isDefaultGroup = defaultPackGroup === groupName;
                return (
                  <React.Fragment key={groupName}>
                    <div className={`px-3 py-2 text-xs font-bold bg-slate-950 border-b border-slate-800 sticky top-0 ${
                      isDefaultGroup ? 'text-green-400' : 'text-blue-400'
                    }`}>
                      {groupName}
                      {isDefaultGroup && <span className="ml-2 text-[10px] text-green-500">✓ Suggested</span>}
                    </div>
                    {packs.map(pack => (
                      <SelectItem key={pack} value={pack} className="pl-8 py-2.5">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium text-white">
                            {FOLLOWUP_PACK_NAMES[pack] || pack}
                          </span>
                          <span className="text-xs text-slate-500 font-mono">{pack}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </React.Fragment>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-slate-300">Substance Name (for drug questions)</Label>
          <Input
            value={formData.substance_name || ''}
            onChange={(e) => setFormData({...formData, substance_name: e.target.value})}
            placeholder="e.g., Marijuana, Cocaine"
            className="bg-slate-800 border-slate-600 text-white mt-1"
          />
        </div>

        {formData.followup_pack && (
          <div className="flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-lg p-3">
            <div className="flex-1 pr-3">
              <Label className="text-slate-300 font-semibold">Multi-Instance Follow-Up</Label>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Ask "Do you have another instance?" after completing this pack
              </p>
            </div>
            <Switch
              checked={formData.followup_multi_instance || false}
              onCheckedChange={(checked) => setFormData({...formData, followup_multi_instance: checked})}
              className="data-[state=checked]:bg-emerald-600"
            />
          </div>
        )}

        <div className="flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-lg p-3">
          <Label className="text-slate-300">Active</Label>
          <Switch
            checked={formData.active !== false}
            onCheckedChange={(checked) => setFormData({...formData, active: checked})}
            className="data-[state=checked]:bg-emerald-600"
          />
        </div>

        <div className="flex items-start justify-between bg-orange-950/30 border border-orange-900/50 rounded-lg p-3">
          <div className="flex-1 pr-3">
            <div className="flex items-center gap-2 mb-1">
              <ShieldAlert className="w-4 h-4 text-orange-400" />
              <Label className="text-slate-300 font-semibold">
                Control Question (Gate)
              </Label>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              If enabled, a "No" response to this question will skip all remaining questions in this section
            </p>
          </div>
          <Switch
            checked={isGateQuestion}
            onCheckedChange={setIsGateQuestion}
            disabled={formData.response_type !== 'yes_no'}
            className="data-[state=checked]:bg-emerald-600"
          />
        </div>
        {formData.response_type !== 'yes_no' && (
          <p className="text-xs text-yellow-400">
            Control questions must be Yes/No type
          </p>
        )}

        <div className="flex gap-2 pt-4">
          <Button onClick={handleSave} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
            {selectedItem.type === 'new-question' ? 'Create Question' : 'Save Changes'}
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
