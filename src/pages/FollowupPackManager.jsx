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
import { ChevronLeft, ChevronDown, ChevronRight, Package, AlertTriangle, FileText, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const BEHAVIOR_TYPE_NAMES = {
  'standard': 'Standard',
  'strict': 'Strict',
  'light': 'Light',
  'multi_incident': 'Multi-Incident'
};

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
  
  const [user, setUser] = useState(null);
  const [selectedPack, setSelectedPack] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});

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

  const { data: interviewQuestions = [] } = useQuery({
    queryKey: ['questions'],
    queryFn: () => base44.entities.Question.list(),
    enabled: !!user
  });

  // Build usage map: which questions trigger which packs
  const packUsageMap = useMemo(() => {
    const map = {};
    interviewQuestions.forEach(q => {
      const packCode = q.followup_pack;
      if (packCode) {
        if (!map[packCode]) {
          map[packCode] = [];
        }
        map[packCode].push(q);
      }
    });
    return map;
  }, [interviewQuestions]);

  // Group packs by category
  const groupedPacks = {};
  Object.entries(PACK_GROUPS).forEach(([groupName, packIds]) => {
    const groupPacks = packs.filter(p => packIds.includes(p.followup_pack_id));
    if (groupPacks.length > 0) {
      groupedPacks[groupName] = groupPacks;
    }
  });

  // Handle ungrouped packs
  const allGroupedIds = Object.values(PACK_GROUPS).flat();
  const ungroupedPacks = packs.filter(p => !allGroupedIds.includes(p.followup_pack_id));
  if (ungroupedPacks.length > 0) {
    groupedPacks["Other"] = ungroupedPacks;
  }

  const toggleGroup = (groupName) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupName]: !prev[groupName]
    }));
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

      <div className="px-6 py-6">
        <div className="max-w-[1600px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Pack List - Grouped */}
            <div className="lg:col-span-1 space-y-3">
              {packsLoading ? (
                <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-6">
                  <p className="text-slate-400 text-center py-8">Loading packs...</p>
                </div>
              ) : (
                Object.entries(groupedPacks).map(([groupName, groupPacks]) => (
                  <div key={groupName} className="bg-slate-800/30 border border-slate-700/50 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleGroup(groupName)}
                      className="w-full flex items-center justify-between p-4 hover:bg-slate-700/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {expandedGroups[groupName] ? (
                          <ChevronDown className="w-5 h-5 text-amber-400" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-amber-400" />
                        )}
                        <h3 className="text-base font-semibold text-amber-400">{groupName}</h3>
                      </div>
                      <Badge variant="outline" className="text-xs bg-slate-700/50 border-slate-600 text-slate-300">
                        {groupPacks.length}
                      </Badge>
                    </button>

                    {expandedGroups[groupName] && (
                      <div className="border-t border-slate-700/50 p-2 space-y-1">
                        {groupPacks.map((pack) => {
                          const packQuestions = allQuestions.filter(q => q.followup_pack_id === pack.followup_pack_id);
                          const activeQuestions = packQuestions.filter(q => q.active !== false).length;
                          const triggeringQuestions = packUsageMap[pack.followup_pack_id] || [];
                          const isOrphaned = triggeringQuestions.length === 0;
                          
                          return (
                            <div
                              key={pack.id}
                              onClick={() => setSelectedPack(pack)}
                              className={`p-3 rounded-lg transition-all cursor-pointer ${
                                selectedPack?.id === pack.id 
                                  ? 'bg-amber-950/30 border border-amber-500/50' 
                                  : 'bg-slate-900/50 border border-slate-700 hover:border-amber-500/30'
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                <Package className="w-4 h-4 text-amber-400 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-sm font-medium text-white leading-tight">
                                    {pack.pack_name}
                                  </h4>
                                  <p className="text-xs text-slate-400 mt-1 font-mono">
                                    {pack.followup_pack_id}
                                  </p>
                                  <div className="flex gap-1.5 mt-2 flex-wrap">
                                    <Badge variant="outline" className="text-xs bg-slate-700/50 border-slate-600 text-slate-300">
                                      {activeQuestions} questions
                                    </Badge>
                                    {isOrphaned ? (
                                      <Badge variant="outline" className="text-xs border-yellow-600 text-yellow-400">
                                        Not used
                                      </Badge>
                                    ) : (
                                      <Badge className="text-xs bg-emerald-500/20 border-emerald-500/50 text-emerald-400">
                                        <FileText className="w-3 h-3 mr-1" />
                                        {triggeringQuestions.length} Q
                                      </Badge>
                                    )}
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
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Detail Panel - Editable */}
            <div className="lg:col-span-2 lg:sticky lg:top-6 lg:self-start bg-slate-800/30 border border-slate-700/50 rounded-lg p-6 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
              <PackDetailPanel
                pack={selectedPack}
                questions={allQuestions.filter(q => q.followup_pack_id === selectedPack?.followup_pack_id)}
                triggeringQuestions={packUsageMap[selectedPack?.followup_pack_id] || []}
                onUpdate={() => {
                  queryClient.invalidateQueries({ queryKey: ['followUpPacks'] });
                  queryClient.invalidateQueries({ queryKey: ['questions'] });
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PackDetailPanel({ pack, questions, triggeringQuestions, onUpdate }) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({});
  const [isEditing, setIsEditing] = useState(false);

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

  const sortedQuestions = [...questions].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  const sortedTriggeringQuestions = [...triggeringQuestions].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

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

      {/* Triggering Questions - Moved to bottom */}
      <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-emerald-400 mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Triggered by {sortedTriggeringQuestions.length} {sortedTriggeringQuestions.length === 1 ? 'Question' : 'Questions'}:
        </h4>
        {sortedTriggeringQuestions.length === 0 ? (
          <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 text-center">
            <p className="text-sm text-slate-400">
              No questions in the Interview Structure currently reference this Follow-Up Pack.
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
                  <Badge variant="outline" className="font-mono text-xs border-slate-600 text-blue-400 group-hover:border-blue-500 group-hover:text-blue-300 transition-colors">
                    {q.question_id}
                  </Badge>
                  <p className="text-sm text-slate-300 leading-relaxed flex-1 group-hover:text-white transition-colors">{q.question_text}</p>
                  <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors flex-shrink-0" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}