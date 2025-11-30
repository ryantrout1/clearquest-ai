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
import { ChevronLeft, ChevronRight, ChevronDown, Plus, Edit, Trash2, GripVertical, FolderOpen, FileText, Layers, Package, Lock, AlertCircle, ShieldAlert, PanelLeftClose, PanelLeftOpen, CheckCircle2, Link2 } from "lucide-react";
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
  
  const urlParams = new URLSearchParams(window.location.search);
  const highlightQuestionId = urlParams.get('questionId');
  
  const [user, setUser] = useState(null);
  const [selectedSection, setSelectedSection] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteInput, setDeleteInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [middleCollapsed, setMiddleCollapsed] = useState(false);

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

  // Auto-select section and question from URL
  useEffect(() => {
    if (highlightQuestionId && questions.length > 0 && sections.length > 0) {
      const question = questions.find(q => q.question_id === highlightQuestionId);
      if (question) {
        const section = sections.find(s => s.id === question.section_id);
        if (section) {
          setSelectedSection(section);
          setTimeout(() => {
            setSelectedItem({ type: 'question', data: question });
          }, 100);
        }
      }
    }
  }, [highlightQuestionId, questions, sections]);

  const sortedSections = [...sections].sort((a, b) => (a.section_order || 0) - (b.section_order || 0));
  
  // Auto-select first section if none selected
  useEffect(() => {
    if (!selectedSection && sortedSections.length > 0) {
      setSelectedSection(sortedSections[0]);
    }
  }, [sortedSections]);

  // Auto-select first question when section is selected
  useEffect(() => {
    if (selectedSection && questions.length > 0) {
      const sectionQuestions = questions
        .filter(q => q.section_id === selectedSection.id)
        .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
      
      if (sectionQuestions.length > 0) {
        // Only auto-select if no item is selected or if selected item is not from this section
        const currentIsQuestionFromSection = selectedItem?.type === 'question' && 
          selectedItem?.data?.section_id === selectedSection.id;
        
        if (!selectedItem || !currentIsQuestionFromSection) {
          setSelectedItem({ type: 'question', data: sectionQuestions[0] });
        }
      }
    }
  }, [selectedSection?.id, questions]);

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



  const recalculateGlobalQuestionNumbers = async () => {
    if (!sections || !questions) {
      toast.error('Sections or questions not loaded');
      return;
    }

    try {
      const sortedSections = [...sections].sort(
        (a, b) => (a.section_order || 0) - (b.section_order || 0)
      );

      let globalNumber = 1;

      for (const section of sortedSections) {
        if (section.active === false) continue;

        const sectionQuestions = questions
          .filter((q) => q.section_id === section.id && q.active !== false)
          .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

        for (const question of sectionQuestions) {
          await base44.entities.Question.update(question.id, {
            question_number: globalNumber++
          });
        }
      }

      console.log(`✅ Recalculated question_number for ${globalNumber - 1} questions`);
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      toast.success(`Updated ${globalNumber - 1} question numbers`);
    } catch (err) {
      console.error('Error recalculating question numbers:', err);
      toast.error('Failed to recalculate question numbers');
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-800/50 bg-slate-900/80 backdrop-blur-sm px-4 py-3">
        <div className="max-w-[2000px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(createPageUrl("HomeHub"))}
              className="text-slate-400 hover:text-white hover:bg-slate-800 -ml-2"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <FolderOpen className="w-5 h-5 text-blue-400" />
            <div>
              <h1 className="text-xl font-semibold text-white">Interview Manager</h1>
              <span className="text-xs text-slate-400 block mt-0.5">
                Manage sections and questions
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div id="interview-container" className="flex-1 flex overflow-hidden" style={{ height: 'calc(100vh - 60px)' }}>
        {/* Left Panel - Sections */}
        {leftCollapsed ? (
          <div 
            className="w-10 flex-shrink-0 border-r border-slate-800/50 bg-slate-900/40 backdrop-blur-sm flex flex-col items-center py-4 cursor-pointer hover:bg-slate-800/40 transition-colors"
            onClick={() => setLeftCollapsed(false)}
          >
            <PanelLeftOpen className="w-4 h-4 text-slate-400 mb-3" />
            <span 
              className="text-xs font-semibold text-slate-400 whitespace-nowrap"
              style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)' }}
            >
              Sections
            </span>
          </div>
        ) : (
          <div className="overflow-auto border-r border-slate-800/50 bg-slate-900/40 backdrop-blur-sm p-4 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-slate-900/50 [&::-webkit-scrollbar-thumb]:bg-slate-700 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:hover:bg-slate-600" style={{ width: '20%' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-white">Sections</h3>
              <div className="flex gap-1">
                <Button
                  onClick={recalculateGlobalQuestionNumbers}
                  size="sm"
                  variant="ghost"
                  className="text-slate-400 hover:text-white hover:bg-slate-800 h-8 px-2"
                  title="Recalculate Question Numbers"
                >
                  <Layers className="w-4 h-4" />
                </Button>
                <Button
                  onClick={() => setSelectedItem({ type: 'new-section' })}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 h-8 px-2"
                >
                  <Plus className="w-4 h-4" />
                </Button>
                <button 
                  onClick={() => setLeftCollapsed(true)}
                  className="p-1 rounded hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
                  title="Collapse panel"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              </div>
            </div>

            {sectionsLoading ? (
              <div className="text-center py-8">
                <p className="text-slate-500 text-sm">Loading sections...</p>
              </div>
            ) : sortedSections.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-slate-500 text-sm">No sections yet</p>
              </div>
            ) : (
              <DragDropContext onDragEnd={handleSectionDragEnd}>
                <Droppable droppableId="sections">
                  {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-1">
                      {sortedSections.map((section, index) => {
                       const sectionQuestionsAll = questions.filter(q => q.section_id === section.id);
                       const activeCount = sectionQuestionsAll.filter(q => q.active !== false).length;
                       const isSelected = selectedSection?.id === section.id;
                       const hasGate = sectionQuestionsAll.some(q => q.is_control_question === true);

                       return (
                          <Draggable key={section.id} draggableId={section.id} index={index}>
                            {(provided) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                onClick={() => {
                                  setSelectedSection(section);
                                  setSelectedItem({ type: 'section', data: section });
                                }}
                                className={`px-3 py-2.5 rounded-md transition-all cursor-pointer group ${
                                  isSelected
                                    ? 'bg-slate-700/50'
                                    : 'bg-transparent hover:bg-slate-800/30'
                                }`}
                              >
                                <div className="flex items-start gap-2.5 mb-1.5">
                                  <FolderOpen className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                                    isSelected ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-400'
                                  }`} />
                                  <div className="flex-1 min-w-0">
                                   <h4 className={`text-sm font-medium leading-tight ${
                                     isSelected ? 'text-white' : 'text-slate-300 group-hover:text-white'
                                   }`}>
                                     {section.section_name}
                                   </h4>
                                  </div>
                                  <Switch
                                    checked={section.active !== false}
                                    onCheckedChange={(checked) => {
                                      const e = { stopPropagation: () => {} };
                                      toggleSectionActive(e, section);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="data-[state=checked]:bg-emerald-600 scale-75"
                                  />
                                </div>
                                <div className="flex items-center gap-1.5 ml-6 flex-wrap">
                                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                                    isSelected 
                                      ? "bg-amber-500/20 text-amber-300 border-amber-500/30" 
                                      : "bg-amber-500/15 text-amber-400/80 border-amber-500/20"
                                  }`}>
                                    <FileText className="w-3 h-3" />
                                    {sectionQuestionsAll.length}
                                  </span>
                                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                                    isSelected 
                                      ? "bg-teal-500/20 text-teal-300 border-teal-500/30" 
                                      : "bg-teal-500/15 text-teal-400/80 border-teal-500/20"
                                  }`}>
                                    <CheckCircle2 className="w-3 h-3" />
                                    {activeCount}
                                  </span>
                                  {hasGate && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-500/20 text-orange-300 border border-orange-500/30">
                                      <Lock className="w-3 h-3" />
                                      Gate
                                    </span>
                                  )}
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
        )}

        {/* Middle Panel - Questions List */}
        {middleCollapsed ? (
          <div 
            className="w-10 flex-shrink-0 border-r border-slate-800/50 bg-slate-900/30 backdrop-blur-sm flex flex-col items-center py-4 cursor-pointer hover:bg-slate-800/40 transition-colors"
            onClick={() => setMiddleCollapsed(false)}
          >
            <PanelLeftOpen className="w-4 h-4 text-slate-400 mb-3" />
            <span 
              className="text-xs font-semibold text-slate-400 whitespace-nowrap"
              style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)' }}
            >
              {selectedSection?.section_name || 'Questions'}
            </span>
          </div>
        ) : (
          <div className="overflow-auto border-r border-slate-800/50 bg-slate-900/30 backdrop-blur-sm [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-slate-900/50 [&::-webkit-scrollbar-thumb]:bg-slate-700 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:hover:bg-slate-600" style={{ width: leftCollapsed ? '35%' : '30%' }}>
            <div className="p-4">
              {!selectedSection ? (
                <div className="text-center py-12">
                  <p className="text-slate-500 text-sm">Select a section to view questions</p>
                </div>
              ) : (
                <>
                  {(() => {
                    const sectionQuestions = questions.filter(q => q.section_id === selectedSection.id);
                    const filtered = sectionQuestions.filter(q => {
                      if (!searchTerm) return true;
                      const search = searchTerm.toLowerCase();
                      return (
                        q.question_text?.toLowerCase().includes(search) ||
                        q.question_id?.toLowerCase().includes(search) ||
                        q.followup_pack?.toLowerCase().includes(search)
                      );
                    });
                    
                    return (
                      <>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-lg font-semibold text-white">
                            {selectedSection.section_name}
                          </h3>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-500">
                              {filtered.length} {filtered.length === 1 ? 'question' : 'questions'}
                            </span>
                            <button 
                              onClick={() => setMiddleCollapsed(true)}
                              className="p-1 rounded hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
                              title="Collapse panel"
                            >
                              <PanelLeftClose className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="mb-3">
                          <Input
                            placeholder="Search questions..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-slate-900/50 border-slate-700/50 text-white placeholder:text-slate-500 h-9 text-sm"
                          />
                        </div>

                        <Button
                          onClick={() => setSelectedItem({ type: 'new-question', sectionId: selectedSection.id, sectionName: selectedSection.section_name })}
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 w-full mb-3"
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Add Question
                        </Button>

                        <QuestionsList
                          section={selectedSection}
                          questions={questions}
                          categories={categories}
                          followUpPacks={followUpPacks}
                          searchTerm={searchTerm}
                          selectedItem={selectedItem}
                          setSelectedItem={setSelectedItem}
                          toggleQuestionActive={toggleQuestionActive}
                          onDragEnd={handleQuestionDragEnd}
                        />
                      </>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        )}

        {/* Right Panel - Details */}
        <div className="overflow-auto bg-slate-900/30 backdrop-blur-sm flex-1 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-slate-900/50 [&::-webkit-scrollbar-thumb]:bg-slate-700 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:hover:bg-slate-600">
          <div className="p-4">
            <DetailPanel
              selectedItem={selectedItem}
              sections={sections}
              categories={categories}
              questions={questions}
              followUpPacks={followUpPacks}
              followUpQuestions={followUpQuestions}
              onClose={() => setSelectedItem(null)}
              onDelete={(item) => setDeleteConfirm(item)}
            />
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

function QuestionsList({ section, questions, categories, followUpPacks, searchTerm, selectedItem, setSelectedItem, toggleQuestionActive, onDragEnd }) {
  const sectionQuestions = questions
    .filter(q => q.section_id === section.id)
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

  const filteredQuestions = sectionQuestions.filter(q => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      q.question_text?.toLowerCase().includes(search) ||
      q.question_id?.toLowerCase().includes(search) ||
      q.followup_pack?.toLowerCase().includes(search)
    );
  });

  if (filteredQuestions.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-slate-500 text-sm">
          {searchTerm ? 'No matching questions' : 'No questions in this section'}
        </p>
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={(result) => onDragEnd(result, section.id)}>
      <Droppable droppableId={`questions-${section.id}`}>
        {(provided) => (
          <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-1">
            {filteredQuestions.map((question, index) => {
              const isSelected = selectedItem?.type === 'question' && selectedItem?.data?.id === question.id;
              
              return (
                <Draggable key={question.id} draggableId={question.id} index={index}>
                  {(provided) => (
                    <div
                      id={`question-${question.id}`}
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      onClick={() => setSelectedItem({ type: 'question', data: question })}
                      className={`px-3 py-2.5 rounded-md transition-all cursor-pointer group ${
                        isSelected
                          ? 'bg-slate-800/50'
                          : 'bg-transparent hover:bg-slate-800/30'
                      } ${question.active === false ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-start gap-2.5">
                        <FileText className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                          isSelected ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-400'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div>
                              <h4 className={`text-base font-medium leading-tight ${
                                isSelected ? 'text-white' : 'text-slate-300 group-hover:text-white'
                              }`}>
                                {question.question_text}
                              </h4>
                              <p className="text-sm text-slate-500 font-mono mt-0.5">
                                {question.question_id}
                                {question.is_control_question && (
                                  <Badge className="ml-2 text-xs bg-amber-500/20 border-amber-500/50 text-amber-400 px-2 py-0.5">
                                    <Lock className="w-3 h-3 mr-1" />
                                    Gate
                                  </Badge>
                                )}
                              </p>
                            </div>
                            <Switch
                              checked={question.active !== false}
                              onCheckedChange={(checked) => {
                                const e = { stopPropagation: () => {} };
                                toggleQuestionActive(e, question);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="data-[state=checked]:bg-emerald-500 scale-75"
                            />
                          </div>
                          
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-500/20 text-slate-300 border border-slate-500/30">
                              {getResponseTypeDisplay(question.response_type)}
                            </span>
                            {question.followup_pack && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                <Link2 className="w-3 h-3" />
                                {question.followup_pack}
                              </span>
                            )}
                            {question.followup_multi_instance && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                Multi
                              </span>
                            )}
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
  );
}



function DetailPanel({ selectedItem, sections, categories, questions, followUpPacks, followUpQuestions, onClose, onDelete }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({});
  const [defaultPackGroup, setDefaultPackGroup] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [originalData, setOriginalData] = useState({});

  // Load follow-up pack details if this is a question with a pack
  // Using same logic as FollowupPackManager to ensure consistency
  const selectedFollowUpPack = React.useMemo(() => {
    if (selectedItem?.type !== 'question' || !formData?.followup_pack) {
      return null;
    }
    
    const pack = followUpPacks.find(p => 
      p.followup_pack_id === formData.followup_pack || 
      p.pack_name === formData.followup_pack
    );
    
    // Debug logging
    if (pack) {
      console.log('📦 Selected Follow-Up Pack:', {
        packId: pack.followup_pack_id,
        packName: pack.pack_name,
        questionFollowupPack: formData.followup_pack
      });
    }
    
    return pack;
  }, [selectedItem, formData?.followup_pack, followUpPacks]);

  // Filter questions using the exact same logic as FollowupPackManager
  const packQuestions = React.useMemo(() => {
    if (!selectedFollowUpPack) return [];
    
    const questions = followUpQuestions
      .filter(q => q.followup_pack_id === selectedFollowUpPack.followup_pack_id)
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    
    // Debug logging
    console.log('📋 Pack Questions:', {
      packId: selectedFollowUpPack.followup_pack_id,
      totalQuestions: followUpQuestions.length,
      matchingQuestions: questions.length,
      questions: questions.map(q => ({ id: q.id, text: q.question_text, active: q.active }))
    });
    
    return questions;
  }, [selectedFollowUpPack, followUpQuestions]);

  useEffect(() => {
    if (selectedItem?.data) {
      const data = {
        ...selectedItem.data,
        is_control_question: selectedItem.data.is_control_question ?? false,
        ai_section_summary_instructions: selectedItem.data.ai_section_summary_instructions || ''
      };
      setFormData(data);
      setOriginalData(data);
      setIsEditMode(false);
      } else {
      setFormData({});
      setOriginalData({});
      setIsEditMode(false);
      }
  }, [selectedItem]);

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
        await base44.entities.Section.update(selectedItem.data.id, {
          section_name: formData.section_name,
          description: formData.description,
          section_order: formData.section_order,
          active: formData.active,
          required: formData.required,
          ai_section_summary_instructions: formData.ai_section_summary_instructions || null
        });
        queryClient.invalidateQueries({ queryKey: ['sections'] });
        toast.success('Section updated');
      } else if (selectedItem?.type === 'question') {
        const section = sections.find(s => s.id === formData.section_id);
        const saveData = {
          ...formData,
          category: section?.section_name || formData.category,
          is_control_question: formData.is_control_question ?? false
        };
        
        // Auto-disable multi-instance if follow-up pack is removed
        if (!formData.followup_pack && selectedItem.data.followup_multi_instance) {
          saveData.followup_multi_instance = false;
          saveData.max_instances_per_question = undefined;
          toast.info('Multi-Instance Follow-Up disabled (no Follow-Up Pack assigned)');
        }
        
        await base44.entities.Question.update(selectedItem.data.id, saveData);
        queryClient.invalidateQueries({ queryKey: ['questions'] });
        queryClient.invalidateQueries({ queryKey: ['sections'] });
        toast.success('Question updated');
        setIsEditMode(false);
        setOriginalData(saveData);
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
          required: formData.required !== false, // Default to true if not specified
          ai_section_summary_instructions: formData.ai_section_summary_instructions || null
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
        <h4 className="text-lg font-semibold text-slate-400 mb-2">Select a question to edit</h4>
        <p className="text-sm text-slate-500">Choose a question from the middle column to view and edit its details</p>
      </div>
    );
  }

  if (selectedItem.type === 'section' || selectedItem.type === 'new-section') {
    const section = selectedItem.data;
    const sectionQuestionsAll = questions.filter(q => q.section_id === section?.id);
    const isNewSection = selectedItem.type === 'new-section';
    const isReadOnly = !isEditMode && !isNewSection;
    
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">
            {isNewSection ? 'New Section' : 'Section Details'}
          </h3>
          <div className="flex gap-2">
            {!isNewSection && !isEditMode && (
              <Button
                onClick={() => setIsEditMode(true)}
                size="sm"
                className="bg-purple-600 hover:bg-purple-700"
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
            )}
            {!isNewSection && isEditMode && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFormData(originalData);
                  setIsEditMode(false);
                }}
                className="border-slate-600 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </Button>
            )}
            {!isNewSection && (
              <Button
                onClick={() => setSelectedItem({ type: 'new-question', sectionId: section.id, sectionName: section.section_name })}
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Question
              </Button>
            )}
            {!isNewSection && !isEditMode && (
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
        </div>
        
        <div>
          <Label className="text-sm text-slate-400">Section Name</Label>
          <Input
            value={formData.section_name || ''}
            onChange={(e) => setFormData({...formData, section_name: e.target.value})}
            disabled={isReadOnly}
            className="bg-slate-800 border-slate-600 text-white mt-1"
          />
        </div>

        <div>
          <Label className="text-sm text-slate-400">Description</Label>
          <Textarea
            value={formData.description || ''}
            onChange={(e) => setFormData({...formData, description: e.target.value})}
            disabled={isReadOnly}
            className="bg-slate-800 border-slate-600 text-white mt-1"
          />
        </div>

        {!isNewSection && (
          <>
            <div>
              <Label className="text-sm text-slate-400">Section Order</Label>
              <Input
                type="number"
                value={formData.section_order || 0}
                onChange={(e) => setFormData({...formData, section_order: parseInt(e.target.value)})}
                disabled={isReadOnly}
                className="bg-slate-800 border-slate-600 text-white mt-1"
              />
            </div>

            <div className="flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-lg p-3">
              <Label className="text-sm text-slate-400">Active</Label>
              <Switch
                checked={formData.active !== false}
                onCheckedChange={(checked) => setFormData({...formData, active: checked})}
                disabled={isReadOnly}
                className="data-[state=checked]:bg-emerald-600"
              />
            </div>

            <div className="flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-lg p-3">
              <Label className="text-sm text-slate-400">Required</Label>
              <Switch
                checked={formData.required !== false}
                onCheckedChange={(checked) => setFormData({...formData, required: checked})}
                disabled={isReadOnly || formData.active === false}
                className="data-[state=checked]:bg-emerald-600"
              />
            </div>

            <div>
              <Label className="text-sm text-slate-400">Section Summary Instructions (optional)</Label>
              <Textarea
                value={formData.ai_section_summary_instructions || ''}
                onChange={(e) => setFormData({...formData, ai_section_summary_instructions: e.target.value})}
                disabled={isReadOnly}
                className="bg-slate-800 border-slate-600 text-white mt-1 min-h-32"
                placeholder="Optional AI instructions for summarizing this section..."
              />
              <p className="text-xs text-slate-500 mt-1">
                If provided, these instructions will be used when AI generates summaries for this section
              </p>
            </div>
            </>
            )}

        {(isEditMode || isNewSection) && (
          <div className="flex gap-2 pt-4">
            <Button onClick={handleSave} className="flex-1 bg-blue-600 hover:bg-blue-700">
              {isNewSection ? 'Create Section' : 'Save Changes'}
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (selectedItem.type === 'question' || selectedItem.type === 'new-question') {
    const sortedSectionsAlpha = [...sections].sort((a, b) => 
      (a.section_name || '').localeCompare(b.section_name || '')
    );
    
    const isNewQuestion = selectedItem.type === 'new-question';
    const isReadOnly = !isEditMode && !isNewQuestion;
    
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">
              {isNewQuestion ? selectedItem.sectionName : formData.question_text || 'Question Details'}
            </h3>
            {!isNewQuestion && (
              <p className="text-sm text-slate-400 font-mono mt-1">{formData.question_id}</p>
            )}
          </div>
          <div className="flex gap-2">
            {!isNewQuestion && !isEditMode && (
              <Button
                onClick={() => setIsEditMode(true)}
                size="sm"
                className="bg-purple-600 hover:bg-purple-700"
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
            )}
            {!isNewQuestion && isEditMode && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFormData(originalData);
                  setIsEditMode(false);
                }}
                className="border-slate-600 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </Button>
            )}
            {!isNewQuestion && (
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
        </div>
        
        {/* Basic Information Section */}
        <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
          <Label className="text-lg font-semibold text-white mb-3 block">Basic Information</Label>
          
          {isNewQuestion ? (
            <div className="space-y-3">
              <div>
                <Label className="text-sm text-slate-400">Question Text</Label>
                <Textarea
                  value={formData.question_text || ''}
                  onChange={(e) => setFormData({...formData, question_text: e.target.value})}
                  className="bg-slate-800 border-slate-600 text-white mt-1 min-h-24"
                  placeholder="Enter the question text..."
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm text-slate-400">Response Type</Label>
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
                
                <div>
                  <Label className="text-sm text-slate-400">Display Order</Label>
                  <Input
                    type="number"
                    value={formData.display_order || 1}
                    onChange={(e) => setFormData({...formData, display_order: parseInt(e.target.value)})}
                    className="bg-slate-800 border-slate-600 text-white mt-1"
                  />
                </div>
              </div>
            </div>
          ) : isEditMode ? (
            <div className="space-y-3">
              <div>
                <Label className="text-sm text-slate-400">Question Text</Label>
                <Textarea
                  value={formData.question_text || ''}
                  onChange={(e) => setFormData({...formData, question_text: e.target.value})}
                  className="bg-slate-800 border-slate-600 text-white mt-1 min-h-24"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm text-slate-400">Response Type</Label>
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
                
                <div>
                  <Label className="text-sm text-slate-400">Display Order</Label>
                  <Input
                    type="number"
                    value={formData.display_order || 1}
                    onChange={(e) => setFormData({...formData, display_order: parseInt(e.target.value)})}
                    className="bg-slate-800 border-slate-600 text-white mt-1"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label className="text-sm text-slate-400 mb-2 block">Question Text</Label>
                <p className="text-sm text-slate-300 leading-relaxed">{formData.question_text}</p>
              </div>
              
              <div className="flex gap-2">
                <Badge variant="outline" className="text-xs font-medium border-slate-600 text-slate-300">
                  {getResponseTypeDisplay(formData.response_type)}
                </Badge>
                <Badge variant="outline" className="text-xs font-medium border-slate-600 text-slate-300">
                  Order: {formData.display_order}
                </Badge>
              </div>
            </div>
          )}
        </div>

        {/* Section & Classification */}
        <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
          <Label className="text-lg font-semibold text-white mb-3 block">Section & Classification</Label>
          
          {isEditMode || isNewQuestion ? (
            <div>
              <Label className="text-sm text-slate-400">Section</Label>
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
          ) : (
            <div>
              <Label className="text-sm text-slate-400 mb-2 block">Section</Label>
              <Badge className="bg-amber-500/20 border-amber-500/50 text-amber-300 text-xs font-medium">
                {sections.find(s => s.id === formData.section_id)?.section_name || 'Unknown'}
              </Badge>
            </div>
          )}
        </div>

        {/* Follow-Up Configuration */}
        <div className="bg-purple-950/20 border border-purple-500/30 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <Label className="text-lg font-semibold text-purple-400">Follow-Up Pack</Label>
            {!isNewQuestion && formData?.followup_pack && selectedFollowUpPack && (
              <Button
                size="sm"
                onClick={() => navigate(createPageUrl(`FollowUpPackManagerV2?packId=${selectedFollowUpPack.followup_pack_id}`))}
                className="bg-purple-600 hover:bg-purple-700"
              >
                <Edit className="w-4 h-4 mr-2" />
                Manage Pack
              </Button>
            )}
          </div>
          
          <div className="space-y-3">
            <div>
              <Label className="text-sm text-slate-400 flex items-center gap-2 mb-1">
                {isEditMode || isNewQuestion ? 'Select Pack' : 'Assigned Pack'}
                {formData.response_type === 'yes_no' && !formData.followup_pack && (
                  <span className="text-xs text-yellow-400 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Recommended
                  </span>
                )}
              </Label>
              
              {isEditMode || isNewQuestion ? (
                <Select 
                  value={formData.followup_pack || ""} 
                  onValueChange={(v) => setFormData({...formData, followup_pack: v === "" ? null : v})}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
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
              ) : (
                <>
                  {formData.followup_pack && selectedFollowUpPack ? (
                    <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3">
                      <div className="flex items-center gap-2">
                        <Package className="w-5 h-5 text-purple-400" />
                        <div className="flex-1">
                          <p className="text-base font-medium text-white">{selectedFollowUpPack.pack_name}</p>
                          <p className="text-sm text-slate-400 font-mono">{selectedFollowUpPack.followup_pack_id}</p>
                        </div>
                        <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-xs font-medium">
                          {packQuestions.length} questions
                        </Badge>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">No follow-up pack assigned</p>
                  )}
                </>
              )}
            </div>

            {(isEditMode || isNewQuestion) && (
              <div>
                <Label className="text-sm text-slate-400">Substance Name (for drug questions)</Label>
                <Input
                  value={formData.substance_name || ''}
                  onChange={(e) => setFormData({...formData, substance_name: e.target.value})}
                  placeholder="e.g., Marijuana, Cocaine"
                  className="bg-slate-800 border-slate-600 text-white mt-1"
                />
              </div>
            )}
            
            {!isNewQuestion && !isEditMode && formData.substance_name && (
              <div>
                <Label className="text-sm text-slate-400 mb-2 block">Substance Name</Label>
                <p className="text-sm text-slate-300">{formData.substance_name}</p>
              </div>
            )}
          </div>
        </div>

        {/* Advanced Configuration */}
        <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
          <Label className="text-lg font-semibold text-white mb-3 block">Advanced Configuration</Label>
          
          <div className="space-y-3">
            {formData.followup_pack ? (
              <>
                <div className="flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                  <div className="flex-1 pr-3">
                    <Label className="text-sm text-slate-400 font-semibold">Multi-Instance Follow-Up</Label>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Ask "Do you have another instance?" after completing this pack
                    </p>
                  </div>
                  <Switch
                    checked={formData.followup_multi_instance || false}
                    onCheckedChange={(checked) => {
                      setFormData({
                        ...formData, 
                        followup_multi_instance: checked,
                        max_instances_per_question: checked ? (formData.max_instances_per_question || 5) : undefined
                      });
                    }}
                    disabled={isReadOnly}
                    className="data-[state=checked]:bg-emerald-600"
                  />
                </div>
                
                {formData.followup_multi_instance && (isEditMode || isNewQuestion) && (
                  <div>
                    <Label className="text-sm text-slate-400">Maximum Instances</Label>
                    <Input
                      type="number"
                      min="1"
                      max="20"
                      value={formData.max_instances_per_question || 5}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        if (val >= 1 && val <= 20) {
                          setFormData({...formData, max_instances_per_question: val});
                        }
                      }}
                      className="bg-slate-800 border-slate-600 text-white mt-1"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Allowed range: 1-20 instances (default: 5)
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <Label className="text-sm text-slate-400 font-semibold">Multi-Instance Follow-Up</Label>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Requires a Follow-Up Pack. Please select a pack above to enable this feature.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-lg p-3">
              <Label className="text-sm text-slate-400">Active</Label>
              <Switch
                checked={formData.active !== false}
                onCheckedChange={(checked) => setFormData({...formData, active: checked})}
                disabled={isReadOnly}
                className="data-[state=checked]:bg-emerald-600"
              />
            </div>

            <div className="flex items-start justify-between bg-orange-950/30 border border-orange-900/50 rounded-lg p-3">
              <div className="flex-1 pr-3">
                <div className="flex items-center gap-2 mb-1">
                  <ShieldAlert className="w-4 h-4 text-orange-400" />
                  <Label className="text-sm text-slate-400 font-semibold">
                    Control Question (Gate)
                  </Label>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  If enabled, a "No" response to this question will skip all remaining questions in this section
                </p>
              </div>
              <Switch
                checked={formData.is_control_question ?? false}
                onCheckedChange={(checked) => setFormData({...formData, is_control_question: checked})}
                disabled={isReadOnly || formData.response_type !== 'yes_no'}
                className="data-[state=checked]:bg-emerald-600"
              />
            </div>
            {formData.response_type !== 'yes_no' && (
              <p className="text-xs text-yellow-400">
                Control questions must be Yes/No type
              </p>
            )}
          </div>
        </div>

        {(isEditMode || isNewQuestion) && (
          <div className="flex gap-2 pt-4">
            <Button onClick={handleSave} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
              {isNewQuestion ? 'Create Question' : 'Save Changes'}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return null;
}