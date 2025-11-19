import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { ChevronLeft, ChevronDown, ChevronRight, Package, AlertTriangle, FileText, ExternalLink, Plus, Edit, Trash2 } from "lucide-react";
import { useFollowUpIntegrity } from "../components/utils/useFollowUpIntegrity";
import { toast } from "sonner";

const BEHAVIOR_TYPE_NAMES = {
  'standard': 'Standard',
  'strict': 'Strict',
  'light': 'Light',
  'multi_incident': 'Multi-Incident'
};

const MASTER_CATEGORIES = [
  { id: 'DRUG_USE', name: 'Drug Use / Controlled Substances', description: 'Any admission of drug use, drug possession, or drug sales' },
  { id: 'CRIMINAL', name: 'Criminal Charges & Arrests', description: 'Any arrest, criminal charge, conviction, or investigation' },
  { id: 'DRIVING', name: 'Driving Incidents', description: 'DUI, reckless driving, license suspension, collisions' },
  { id: 'EMPLOYMENT', name: 'Employment Terminations', description: 'Being fired, forced to resign, or disciplinary actions at work' },
  { id: 'FINANCIAL', name: 'Financial Issues', description: 'Bankruptcy, late payments, repossessions, judgments, debt' },
  { id: 'SEXUAL', name: 'Sexual Misconduct or Exploitation', description: 'Allegations or incidents of sexual misconduct' },
  { id: 'WEAPONS', name: 'Weapons Violations', description: 'Illegal weapon possession or weapons-related incidents' },
  { id: 'GANG', name: 'Gang Affiliation', description: 'Gang membership, association, or gang-related activity' },
  { id: 'MILITARY', name: 'Military Discipline', description: 'Military discipline, discharge issues, or service problems' },
  { id: 'LAW_ENFORCEMENT', name: 'Law Enforcement Discipline', description: 'Prior LE applications, terminations, or discipline' }
];

const PACK_GROUPS = {
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

export default function FollowupPackManager() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const urlParams = new URLSearchParams(window.location.search);
  const highlightPackId = urlParams.get('packId');
  
  const [user, setUser] = useState(null);
  const [selectedPack, setSelectedPack] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [leftWidth, setLeftWidth] = useState(35);
  const [isDragging, setIsDragging] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState(new Set(MASTER_CATEGORIES.map(c => c.id)));

  useEffect(() => {
    checkAuth();
  }, []);

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

  const { data: interviewQuestions = [] } = useQuery({
    queryKey: ['questions'],
    queryFn: () => base44.entities.Question.list(),
    enabled: !!user
  });

  // Auto-select pack from URL
  useEffect(() => {
    if (highlightPackId && packs.length > 0) {
      const pack = packs.find(p => p.id === highlightPackId);
      if (pack) {
        setSelectedPack(pack);
      }
    }
  }, [highlightPackId, packs]);

  // Resizable divider logic
  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e) => {
      const container = document.getElementById('followup-container');
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
      
      const clampedWidth = Math.min(Math.max(newLeftWidth, 20), 80);
      setLeftWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

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

  // Integrity analysis
  const integrity = useFollowUpIntegrity(interviewQuestions, packs, allQuestions);

  // Group packs by category
  const packsByCategory = useMemo(() => {
    const grouped = {};
    MASTER_CATEGORIES.forEach(cat => {
      grouped[cat.id] = [];
    });
    grouped['UNCATEGORIZED'] = [];

    packs.forEach(pack => {
      const category = pack.followup_category || 'UNCATEGORIZED';
      if (grouped[category]) {
        grouped[category].push(pack);
      } else {
        grouped['UNCATEGORIZED'].push(pack);
      }
    });

    return grouped;
  }, [packs]);

  // Filter packs by search
  const filteredPacksByCategory = useMemo(() => {
    if (!searchTerm) return packsByCategory;

    const search = searchTerm.toLowerCase();
    const filtered = {};
    
    Object.entries(packsByCategory).forEach(([catId, catPacks]) => {
      const matchingPacks = catPacks.filter(pack =>
        pack.pack_name?.toLowerCase().includes(search) ||
        pack.followup_pack_id?.toLowerCase().includes(search) ||
        pack.description?.toLowerCase().includes(search)
      );
      if (matchingPacks.length > 0) {
        filtered[catId] = matchingPacks;
      }
    });

    return filtered;
  }, [packsByCategory, searchTerm]);

  const toggleCategory = (categoryId) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
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
              <AlertTriangle className="w-6 h-6 text-amber-400" />
              <div>
                <h1 className="text-xl font-bold text-white">Follow-Up Pack Manager</h1>
                <p className="text-xs text-slate-400">Every "Yes" answer triggers a structured deep-dive. No detail missed, no investigator guesswork.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div id="followup-container" className="flex-1 flex overflow-hidden">
        {/* Left Panel - Pack List */}
        <div 
          style={{ width: `${leftWidth}%` }}
          className="overflow-auto border-r border-slate-700"
        >
          <div className="p-6">
            <div className="mb-4">
              <Input
                placeholder="Search packs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-slate-800 border-slate-600 text-white"
              />
            </div>

            <div className="space-y-3">
              {packsLoading ? (
                <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-6">
                  <p className="text-slate-400 text-center py-8">Loading packs...</p>
                </div>
              ) : Object.keys(filteredPacksByCategory).length === 0 ? (
                <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-6">
                  <p className="text-slate-400 text-center py-8">No packs found</p>
                </div>
              ) : (
                <>
                  {MASTER_CATEGORIES.map(category => {
                    const categoryPacks = filteredPacksByCategory[category.id] || [];
                    if (categoryPacks.length === 0 && searchTerm) return null;
                    
                    const isExpanded = expandedCategories.has(category.id);
                    
                    return (
                      <div key={category.id} className="bg-slate-800/30 border border-slate-700/50 rounded-lg overflow-hidden">
                        <button
                          onClick={() => toggleCategory(category.id)}
                          className="w-full flex items-center justify-between p-3 hover:bg-slate-700/30 transition-colors"
                        >
                          <div className="flex items-center gap-2 flex-1 text-left">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-amber-400 flex-shrink-0" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-amber-400 flex-shrink-0" />
                            )}
                            <div className="min-w-0">
                              <h3 className="text-sm font-semibold text-amber-400">{category.name}</h3>
                              <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{category.description}</p>
                            </div>
                          </div>
                          <Badge variant="outline" className="text-xs bg-slate-700/50 border-slate-600 text-slate-300 ml-2 flex-shrink-0">
                            {categoryPacks.length}
                          </Badge>
                        </button>

                        {isExpanded && categoryPacks.length > 0 && (
                          <div className="border-t border-slate-700/50 p-2 space-y-1">
                            {categoryPacks.map((pack) => {
                              const packStatus = integrity.getPackStatus(pack);
                              const packQuestions = allQuestions.filter(q => q.followup_pack_id === pack.followup_pack_id);
                              const activeQuestions = packQuestions.filter(q => q.active !== false).length;
                              
                              return (
                                <div
                                  key={pack.id}
                                  onClick={() => setSelectedPack(pack)}
                                  className={`p-3 rounded-lg transition-all cursor-pointer ${
                                    selectedPack?.id === pack.id 
                                      ? 'bg-amber-950/30 border-2 border-amber-500/50' 
                                      : 'bg-slate-900/50 border border-slate-700 hover:border-amber-500/30'
                                  }`}
                                >
                                  <div className="flex items-start gap-2">
                                    <Package className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <h4 className="text-sm font-medium text-white leading-tight">
                                        {pack.pack_name}
                                      </h4>
                                      <p className="text-xs text-slate-400 mt-0.5 font-mono break-all">
                                        {pack.followup_pack_id}
                                      </p>
                                      <div className="flex gap-1.5 mt-2 flex-wrap">
                                        <Badge variant="outline" className="text-xs bg-slate-700/50 border-slate-600 text-slate-300">
                                          {packQuestions.length} Q • {activeQuestions} active
                                        </Badge>
                                        {packStatus?.usageCount > 0 && (
                                          <Badge className="text-xs bg-emerald-500/20 border-emerald-500/50 text-emerald-400">
                                            Used by {packStatus.usageCount}
                                          </Badge>
                                        )}
                                        {packStatus?.isUnused && (
                                          <Badge variant="outline" className="text-xs bg-slate-700/50 border-slate-600 text-slate-400">
                                            Unused
                                          </Badge>
                                        )}
                                        {packStatus?.hasNoDeterministic && (
                                          <Badge className="text-xs bg-yellow-500/20 border-yellow-500/50 text-yellow-400">
                                            No Questions
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Uncategorized packs */}
                  {filteredPacksByCategory['UNCATEGORIZED']?.length > 0 && (
                    <div className="bg-slate-800/30 border border-yellow-700/50 rounded-lg overflow-hidden">
                      <button
                        onClick={() => toggleCategory('UNCATEGORIZED')}
                        className="w-full flex items-center justify-between p-3 hover:bg-slate-700/30 transition-colors"
                      >
                        <div className="flex items-center gap-2 flex-1 text-left">
                          {expandedCategories.has('UNCATEGORIZED') ? (
                            <ChevronDown className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                          )}
                          <div>
                            <h3 className="text-sm font-semibold text-yellow-400">Uncategorized</h3>
                            <p className="text-xs text-slate-500 mt-0.5">Packs without a category assigned</p>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs bg-yellow-700/20 border-yellow-600 text-yellow-400 ml-2">
                          {filteredPacksByCategory['UNCATEGORIZED'].length}
                        </Badge>
                      </button>

                      {expandedCategories.has('UNCATEGORIZED') && (
                        <div className="border-t border-yellow-700/50 p-2 space-y-1">
                          {filteredPacksByCategory['UNCATEGORIZED'].map((pack) => {
                            const packStatus = integrity.getPackStatus(pack);
                            const packQuestions = allQuestions.filter(q => q.followup_pack_id === pack.followup_pack_id);
                            const activeQuestions = packQuestions.filter(q => q.active !== false).length;
                            
                            return (
                              <div
                                key={pack.id}
                                onClick={() => setSelectedPack(pack)}
                                className={`p-3 rounded-lg transition-all cursor-pointer ${
                                  selectedPack?.id === pack.id 
                                    ? 'bg-yellow-950/30 border-2 border-yellow-500/50' 
                                    : 'bg-slate-900/50 border border-slate-700 hover:border-yellow-500/30'
                                }`}
                              >
                                <div className="flex items-start gap-2">
                                  <Package className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <h4 className="text-sm font-medium text-white leading-tight">
                                      {pack.pack_name}
                                    </h4>
                                    <p className="text-xs text-slate-400 mt-0.5 font-mono break-all">
                                      {pack.followup_pack_id}
                                    </p>
                                    <div className="flex gap-1.5 mt-2 flex-wrap">
                                      <Badge variant="outline" className="text-xs bg-slate-700/50 border-slate-600 text-slate-300">
                                        {packQuestions.length} Q • {activeQuestions} active
                                      </Badge>
                                      {packStatus?.usageCount > 0 && (
                                        <Badge className="text-xs bg-emerald-500/20 border-emerald-500/50 text-emerald-400">
                                          Used by {packStatus.usageCount}
                                        </Badge>
                                      )}
                                      {packStatus?.isUnused && (
                                        <Badge variant="outline" className="text-xs bg-slate-700/50 border-slate-600 text-slate-400">
                                          Unused
                                        </Badge>
                                      )}
                                      {packStatus?.hasNoDeterministic && (
                                        <Badge className="text-xs bg-yellow-500/20 border-yellow-500/50 text-yellow-400">
                                          No Questions
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Vertical Drag Handle */}
        <div 
          className={`w-2 flex-shrink-0 transition-colors ${
            isDragging ? 'bg-amber-500' : 'bg-slate-800 hover:bg-amber-600'
          }`}
          onMouseDown={handleMouseDown}
          style={{ cursor: 'col-resize', userSelect: 'none' }}
        />

        {/* Right Panel - Pack Details */}
        <div 
          style={{ width: `${100 - leftWidth}%` }}
          className="overflow-auto"
        >
          <div className="p-6">
            <PackDetailPanel
              pack={selectedPack}
              questions={allQuestions.filter(q => q.followup_pack_id === selectedPack?.followup_pack_id)}
              integrity={integrity}
              onUpdate={() => {
                queryClient.invalidateQueries({ queryKey: ['followUpPacks'] });
                queryClient.invalidateQueries({ queryKey: ['followUpQuestions'] });
                queryClient.invalidateQueries({ queryKey: ['questions'] });
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function PackDetailPanel({ pack, questions, integrity, onUpdate }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
      setFormData({
        trigger_notes: pack.trigger_notes || '',
        description: pack.description || '',
        behavior_type: pack.behavior_type || 'standard',
        requires_completion: pack.requires_completion !== false,
        max_probe_loops: pack.max_probe_loops || '',
        ai_probe_instructions: pack.ai_probe_instructions || '',
        active: pack.active !== false
      });
      setIsEditing(false);
    }
  }, [pack]);

  const handleSave = async () => {
    try {
      await base44.entities.FollowUpPack.update(pack.id, {
        ...formData,
        max_probe_loops: formData.max_probe_loops ? parseInt(formData.max_probe_loops) : null
      });
      onUpdate();
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

  if (!pack) {
    return (
      <div className="text-center py-12">
        <Package className="w-16 h-16 text-slate-600 mx-auto mb-4" />
        <p className="text-slate-400 text-sm">Select a pack to view its details</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold text-white">{pack.pack_name}</h3>
          <p className="text-sm text-slate-400 font-mono mt-1">{pack.followup_pack_id}</p>
        </div>
        <div className="flex gap-2">
          {!isEditing ? (
            <Button
              onClick={() => setIsEditing(true)}
              className="bg-purple-600 hover:bg-purple-700"
            >
              Edit
            </Button>
          ) : (
            <>
              <Button
                onClick={() => {
                  setIsEditing(false);
                  setFormData({
                    trigger_notes: pack.trigger_notes || '',
                    description: pack.description || '',
                    behavior_type: pack.behavior_type || 'standard',
                    requires_completion: pack.requires_completion !== false,
                    max_probe_loops: pack.max_probe_loops || '',
                    ai_probe_instructions: pack.ai_probe_instructions || '',
                    active: pack.active !== false
                  });
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

      {/* Triggered by */}
      <div className="bg-amber-950/20 border border-amber-500/30 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-amber-400 mb-2">Trigger Notes:</h4>
        {isEditing ? (
          <Textarea
            value={formData.trigger_notes}
            onChange={(e) => setFormData({...formData, trigger_notes: e.target.value})}
            className="bg-slate-800 border-slate-600 text-white min-h-20"
            placeholder='Any "Yes" response related to this topic'
          />
        ) : (
          <p className="text-sm text-slate-300 leading-relaxed">{pack.trigger_notes || 'Any "Yes" response related to this topic'}</p>
        )}
      </div>

      {/* Documentation captured */}
      <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-white mb-3">Documentation captured:</h4>
        {isEditing ? (
          <Textarea
            value={formData.description}
            onChange={(e) => setFormData({...formData, description: e.target.value})}
            className="bg-slate-800 border-slate-600 text-white min-h-24"
            placeholder="Description of what documentation is captured"
          />
        ) : (
          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{pack.description || 'No description provided'}</p>
        )}
      </div>

      {/* Pack Configuration */}
      <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-white mb-3">Pack Configuration</h4>
        
        {isEditing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300">Behavior Type</Label>
                <Select
                  value={formData.behavior_type}
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
                    value={formData.max_probe_loops}
                    onChange={(e) => setFormData({...formData, max_probe_loops: e.target.value})}
                    className="bg-slate-800 border-slate-600 text-white mt-1"
                    placeholder="e.g., 5"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-lg p-3">
              <Label className="text-slate-300">Requires Completion</Label>
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
          </div>
        ) : (
          <div className="flex gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs border-slate-600 text-slate-300">
              {BEHAVIOR_TYPE_NAMES[pack.behavior_type] || pack.behavior_type}
            </Badge>
            {pack.requires_completion && (
              <Badge className="text-xs bg-orange-500/20 border-orange-500/50 text-orange-400">
                Required
              </Badge>
            )}
            {pack.max_probe_loops && (
              <Badge variant="outline" className="text-xs border-slate-600 text-slate-300">
                Max {pack.max_probe_loops} loops
              </Badge>
            )}
            {pack.active === false && (
              <Badge variant="outline" className="text-xs border-red-600 text-red-400">
                Inactive
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* AI Probe Instructions */}
      <div className="bg-blue-950/20 border border-blue-500/30 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-400 mb-2">AI Probe Instructions</h4>
        {isEditing ? (
          <Textarea
            value={formData.ai_probe_instructions}
            onChange={(e) => setFormData({...formData, ai_probe_instructions: e.target.value})}
            className="bg-slate-800 border-slate-600 text-white min-h-32"
            placeholder="Instructions for AI probing behavior for this pack..."
          />
        ) : (
          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{pack.ai_probe_instructions || 'No instructions provided'}</p>
        )}
      </div>

      {/* Deterministic Questions Editor */}
      <div className="bg-purple-950/20 border border-purple-500/30 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-purple-400">Deterministic Questions</h4>
          <Button
            onClick={() => setShowAddQuestion(true)}
            size="sm"
            className="bg-purple-600 hover:bg-purple-700"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Question
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
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="yes_no">Yes/No</SelectItem>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
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
            <p className="text-sm">This pack has no deterministic questions yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedQuestions.map((q, idx) => (
              <div key={q.id} className="bg-slate-900/50 border border-slate-700 rounded-lg p-3">
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
                      <p className="text-sm text-white break-words leading-relaxed">{q.question_text}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline" className="text-xs border-slate-600 text-slate-300">
                          {q.response_type || 'text'}
                        </Badge>
                        <Switch
                          checked={q.active !== false}
                          onCheckedChange={(checked) => handleUpdateQuestion(q.id, { active: checked })}
                          className="data-[state=checked]:bg-emerald-600"
                        />
                        <span className="text-xs text-slate-400">
                          {q.active !== false ? 'Active' : 'Inactive'}
                        </span>
                      </div>
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

      {/* Triggering Questions */}
      <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-emerald-400 mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Used by Interview Questions
        </h4>
        {(() => {
          const packAnalysis = integrity.packAnalysis.find(p => p.pack.id === pack.id);
          const usedByQuestions = packAnalysis?.usedByQuestions || [];

          if (usedByQuestions.length === 0) {
            return (
              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 text-center">
                <p className="text-sm text-slate-400">
                  No interview questions currently trigger this pack.
                </p>
              </div>
            );
          }

          return (
            <div className="space-y-2">
              {usedByQuestions.map((q) => (
                <button
                  key={q.questionId}
                  onClick={() => handleNavigateToQuestion(q.questionCode)}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg p-3 hover:border-emerald-500/50 hover:bg-slate-800/70 transition-all text-left group"
                >
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="font-mono text-xs border-slate-600 text-blue-400 group-hover:border-blue-500 group-hover:text-blue-300 transition-colors">
                      {q.questionCode}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-300 leading-relaxed group-hover:text-white transition-colors">{q.questionText}</p>
                      <p className="text-xs text-slate-500 mt-1">{q.section}</p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors flex-shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}