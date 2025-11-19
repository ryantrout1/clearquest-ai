import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileQuestion,
  Package,
  AlertCircle,
  Loader2
} from "lucide-react";

export default function FollowUpPackAuditV2() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

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

  const { data: questions = [], isLoading: questionsLoading } = useQuery({
    queryKey: ['questions-audit'],
    queryFn: () => base44.entities.Question.list(),
    enabled: !!user
  });

  const { data: followUpPacks = [], isLoading: packsLoading } = useQuery({
    queryKey: ['followUpPacks-audit'],
    queryFn: () => base44.entities.FollowUpPack.list(),
    enabled: !!user
  });

  const { data: followUpQuestions = [], isLoading: fqLoading } = useQuery({
    queryKey: ['followUpQuestions-audit'],
    queryFn: () => base44.entities.FollowUpQuestion.list(),
    enabled: !!user
  });

  const { data: sections = [] } = useQuery({
    queryKey: ['sections-audit'],
    queryFn: () => base44.entities.Section.list(),
    enabled: !!user
  });

  const auditData = useMemo(() => {
    if (!questions.length || !followUpPacks.length) return null;

    // Create pack lookup
    const packMap = {};
    followUpPacks.forEach(pack => {
      packMap[pack.followup_pack_id] = pack;
    });

    // Create section lookup
    const sectionMap = {};
    sections.forEach(section => {
      sectionMap[section.id] = section;
    });

    // Count follow-up questions per pack
    const fqCountMap = {};
    followUpQuestions.forEach(fq => {
      fqCountMap[fq.followup_pack_id] = (fqCountMap[fq.followup_pack_id] || 0) + 1;
    });

    // Count triggering questions per pack
    const triggerCountMap = {};
    questions.forEach(q => {
      if (q.followup_pack) {
        triggerCountMap[q.followup_pack] = (triggerCountMap[q.followup_pack] || 0) + 1;
      }
    });

    // Active questions
    const activeQuestions = questions.filter(q => q.active !== false);

    // V2 packs
    const v2Packs = followUpPacks.filter(p => p.is_standard_cluster === true);
    const legacyPacks = followUpPacks.filter(p => p.is_standard_cluster === false);

    // Questions with no follow-up pack
    const questionsNoFollowUp = activeQuestions.filter(q => !q.followup_pack);

    // Questions using V2 packs
    const questionsUsingV2 = activeQuestions.filter(q => {
      const pack = packMap[q.followup_pack];
      return pack && pack.is_standard_cluster === true;
    });

    // Questions using legacy packs
    const questionsUsingLegacy = activeQuestions.filter(q => {
      const pack = packMap[q.followup_pack];
      return pack && pack.is_standard_cluster === false;
    });

    // V2 packs with no triggering questions
    const v2PacksNoTriggers = v2Packs.filter(pack => !triggerCountMap[pack.followup_pack_id]);

    // V2 packs missing AI probe instructions
    const v2PacksNoAI = v2Packs.filter(pack => !pack.ai_probe_instructions || pack.ai_probe_instructions.trim() === '');

    // V2 packs with no follow-up questions
    const v2PacksNoFollowUpQuestions = v2Packs.filter(pack => !fqCountMap[pack.followup_pack_id] || fqCountMap[pack.followup_pack_id] === 0);

    // Legacy packs still in use
    const legacyPacksInUse = legacyPacks.filter(pack => triggerCountMap[pack.followup_pack_id] > 0);

    // Legacy packs unused
    const legacyPacksUnused = legacyPacks.filter(pack => !triggerCountMap[pack.followup_pack_id]);

    // V2 packs missing category
    const v2PacksNoCategory = v2Packs.filter(pack => !pack.category_id || pack.category_id.trim() === '');

    return {
      packMap,
      sectionMap,
      fqCountMap,
      triggerCountMap,
      activeQuestions,
      v2Packs,
      legacyPacks,
      questionsNoFollowUp,
      questionsUsingV2,
      questionsUsingLegacy,
      v2PacksNoTriggers,
      v2PacksNoAI,
      v2PacksNoFollowUpQuestions,
      legacyPacksInUse,
      legacyPacksUnused,
      v2PacksNoCategory
    };
  }, [questions, followUpPacks, followUpQuestions, sections]);

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-blue-400 animate-spin" />
      </div>
    );
  }

  const isLoading = questionsLoading || packsLoading || fqLoading;

  if (isLoading || !auditData) {
    return (
      <div className="min-h-screen bg-[#0a0f1e]">
        <div className="border-b border-slate-800/50 bg-[#0f1629] px-4 py-3">
          <div className="max-w-[2000px] mx-auto flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(createPageUrl("HomeHub"))}
              className="text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <FileQuestion className="w-5 h-5 text-blue-400" />
            <h1 className="text-lg font-semibold text-white">Follow-Up Pack Audit (V2)</h1>
          </div>
        </div>
        <div className="p-8 text-center">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin mx-auto" />
          <p className="text-slate-400 mt-4">Loading audit data...</p>
        </div>
      </div>
    );
  }

  const {
    packMap,
    sectionMap,
    fqCountMap,
    triggerCountMap,
    activeQuestions,
    v2Packs,
    legacyPacks,
    questionsNoFollowUp,
    questionsUsingV2,
    questionsUsingLegacy,
    v2PacksNoTriggers,
    v2PacksNoAI,
    v2PacksNoFollowUpQuestions,
    legacyPacksInUse,
    legacyPacksUnused,
    v2PacksNoCategory
  } = auditData;

  return (
    <div className="min-h-screen bg-[#0a0f1e]">
      {/* Header */}
      <div className="border-b border-slate-800/50 bg-[#0f1629] px-4 py-3">
        <div className="max-w-[2000px] mx-auto flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(createPageUrl("HomeHub"))}
            className="text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <FileQuestion className="w-5 h-5 text-blue-400" />
          <h1 className="text-lg font-semibold text-white">Follow-Up Pack Audit (V2)</h1>
          <span className="text-xs text-slate-500">Read-only health check</span>
        </div>
      </div>

      <div className="p-6 max-w-[2000px] mx-auto">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-8">
          <SummaryCard label="Total Questions" value={activeQuestions.length} icon={FileQuestion} color="blue" />
          <SummaryCard label="Using V2 Packs" value={questionsUsingV2.length} icon={CheckCircle2} color="green" />
          <SummaryCard label="Using Legacy Packs" value={questionsUsingLegacy.length} icon={AlertTriangle} color="yellow" />
          <SummaryCard label="No Follow-Up Pack" value={questionsNoFollowUp.length} icon={XCircle} color="red" />
          <SummaryCard label="Total V2 Packs" value={v2Packs.length} icon={Package} color="purple" />
          <SummaryCard label="V2 No Triggers" value={v2PacksNoTriggers.length} icon={AlertCircle} color="orange" />
          <SummaryCard label="V2 No AI Instructions" value={v2PacksNoAI.length} icon={AlertTriangle} color="yellow" />
          <SummaryCard label="V2 No Follow-Up Qs" value={v2PacksNoFollowUpQuestions.length} icon={AlertCircle} color="amber" />
          <SummaryCard label="Legacy Packs In Use" value={legacyPacksInUse.length} icon={AlertTriangle} color="red" />
          <SummaryCard label="Legacy Packs Unused" value={legacyPacksUnused.length} icon={CheckCircle2} color="slate" />
        </div>

        {/* Section A - Questions with no Follow-Up Pack */}
        <AuditSection
          title="A. Questions with No Follow-Up Pack"
          count={questionsNoFollowUp.length}
          severity={questionsNoFollowUp.length > 0 ? "warning" : "ok"}
        >
          {questionsNoFollowUp.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400" />
              All active questions have follow-up packs assigned
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-700">
                  <tr className="text-left text-slate-400">
                    <th className="pb-2 pr-4">Question ID</th>
                    <th className="pb-2 pr-4">Section / Category</th>
                    <th className="pb-2 pr-4">Question Text</th>
                    <th className="pb-2">Active?</th>
                  </tr>
                </thead>
                <tbody className="text-slate-300">
                  {questionsNoFollowUp.map(q => (
                    <tr key={q.id} className="border-b border-slate-800/50">
                      <td className="py-3 pr-4 font-mono text-xs">{q.question_id}</td>
                      <td className="py-3 pr-4 text-xs">{sectionMap[q.section_id]?.section_name || q.category || '-'}</td>
                      <td className="py-3 pr-4">{q.question_text}</td>
                      <td className="py-3">{q.active !== false ? '✓' : '✗'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AuditSection>

        {/* Section B - Questions using Legacy Packs */}
        <AuditSection
          title="B. Questions Using Legacy Packs (Should Move to V2)"
          count={questionsUsingLegacy.length}
          severity={questionsUsingLegacy.length > 0 ? "error" : "ok"}
        >
          {questionsUsingLegacy.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400" />
              No questions are using legacy packs
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-700">
                  <tr className="text-left text-slate-400">
                    <th className="pb-2 pr-4">Question ID</th>
                    <th className="pb-2 pr-4">Section / Category</th>
                    <th className="pb-2 pr-4">Question Text</th>
                    <th className="pb-2 pr-4">Legacy Pack Code</th>
                    <th className="pb-2">Legacy Pack Name</th>
                  </tr>
                </thead>
                <tbody className="text-slate-300">
                  {questionsUsingLegacy.map(q => {
                    const pack = packMap[q.followup_pack];
                    return (
                      <tr key={q.id} className="border-b border-slate-800/50">
                        <td className="py-3 pr-4 font-mono text-xs">{q.question_id}</td>
                        <td className="py-3 pr-4 text-xs">{sectionMap[q.section_id]?.section_name || q.category || '-'}</td>
                        <td className="py-3 pr-4">{q.question_text}</td>
                        <td className="py-3 pr-4 font-mono text-xs text-yellow-400">{q.followup_pack}</td>
                        <td className="py-3">{pack?.pack_name || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </AuditSection>

        {/* Section C - V2 Packs with No Triggering Questions */}
        <AuditSection
          title="C. V2 Packs with No Triggered Questions"
          count={v2PacksNoTriggers.length}
          severity={v2PacksNoTriggers.length > 0 ? "warning" : "ok"}
        >
          {v2PacksNoTriggers.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400" />
              All V2 packs have triggering questions
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-700">
                  <tr className="text-left text-slate-400">
                    <th className="pb-2 pr-4">Pack Code</th>
                    <th className="pb-2 pr-4">Pack Name</th>
                    <th className="pb-2 pr-4">Category</th>
                    <th className="pb-2 pr-4">Standard Cluster</th>
                    <th className="pb-2">AI Instructions?</th>
                  </tr>
                </thead>
                <tbody className="text-slate-300">
                  {v2PacksNoTriggers.map(pack => (
                    <tr key={pack.id} className="border-b border-slate-800/50">
                      <td className="py-3 pr-4 font-mono text-xs">{pack.followup_pack_id}</td>
                      <td className="py-3 pr-4">{pack.pack_name}</td>
                      <td className="py-3 pr-4 text-xs">{pack.category_id || '-'}</td>
                      <td className="py-3 pr-4">{pack.is_standard_cluster ? '✓' : '✗'}</td>
                      <td className="py-3">
                        {pack.ai_probe_instructions && pack.ai_probe_instructions.trim() ? '✓' : '✗'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AuditSection>

        {/* Section D - V2 Packs Missing AI Probe Instructions */}
        <AuditSection
          title="D. V2 Packs Missing AI Probe Instructions"
          count={v2PacksNoAI.length}
          severity={v2PacksNoAI.length > 0 ? "warning" : "ok"}
        >
          {v2PacksNoAI.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400" />
              All V2 packs have AI probe instructions
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-700">
                  <tr className="text-left text-slate-400">
                    <th className="pb-2 pr-4">Pack Code</th>
                    <th className="pb-2 pr-4">Pack Name</th>
                    <th className="pb-2 pr-4">Category</th>
                    <th className="pb-2 pr-4">Triggered Questions</th>
                    <th className="pb-2">Follow-Up Questions</th>
                  </tr>
                </thead>
                <tbody className="text-slate-300">
                  {v2PacksNoAI.map(pack => (
                    <tr key={pack.id} className="border-b border-slate-800/50">
                      <td className="py-3 pr-4 font-mono text-xs">{pack.followup_pack_id}</td>
                      <td className="py-3 pr-4">{pack.pack_name}</td>
                      <td className="py-3 pr-4 text-xs">{pack.category_id || '-'}</td>
                      <td className="py-3 pr-4">{triggerCountMap[pack.followup_pack_id] || 0}</td>
                      <td className="py-3">{fqCountMap[pack.followup_pack_id] || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AuditSection>

        {/* Section E - V2 Packs With No Follow-Up Questions */}
        <AuditSection
          title="E. V2 Packs With No Deterministic Follow-Up Questions"
          count={v2PacksNoFollowUpQuestions.length}
          severity={v2PacksNoFollowUpQuestions.length > 0 ? "info" : "ok"}
        >
          {v2PacksNoFollowUpQuestions.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400" />
              All V2 packs have follow-up questions
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-700">
                  <tr className="text-left text-slate-400">
                    <th className="pb-2 pr-4">Pack Code</th>
                    <th className="pb-2 pr-4">Pack Name</th>
                    <th className="pb-2 pr-4">Category</th>
                    <th className="pb-2 pr-4">Triggered Questions</th>
                    <th className="pb-2">AI Instructions?</th>
                  </tr>
                </thead>
                <tbody className="text-slate-300">
                  {v2PacksNoFollowUpQuestions.map(pack => (
                    <tr key={pack.id} className="border-b border-slate-800/50">
                      <td className="py-3 pr-4 font-mono text-xs">{pack.followup_pack_id}</td>
                      <td className="py-3 pr-4">{pack.pack_name}</td>
                      <td className="py-3 pr-4 text-xs">{pack.category_id || '-'}</td>
                      <td className="py-3 pr-4">{triggerCountMap[pack.followup_pack_id] || 0}</td>
                      <td className="py-3">
                        {pack.ai_probe_instructions && pack.ai_probe_instructions.trim() ? '✓' : '✗'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AuditSection>

        {/* Section F - Legacy Packs Overview */}
        <AuditSection
          title="F. Legacy Packs Overview"
          count={legacyPacks.length}
          severity="info"
        >
          <div className="space-y-6">
            {/* F1 - Legacy Packs Still in Use */}
            <div>
              <h4 className="text-sm font-semibold text-red-400 mb-3">F1 - Legacy Packs Still in Use</h4>
              {legacyPacksInUse.length === 0 ? (
                <div className="text-center py-4 text-slate-400">
                  <CheckCircle2 className="w-6 h-6 mx-auto mb-2 text-green-400" />
                  No legacy packs are in use
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-700">
                      <tr className="text-left text-slate-400">
                        <th className="pb-2 pr-4">Legacy Pack Code</th>
                        <th className="pb-2 pr-4">Legacy Pack Name</th>
                        <th className="pb-2">Questions Using This Pack</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-300">
                      {legacyPacksInUse.map(pack => (
                        <tr key={pack.id} className="border-b border-slate-800/50">
                          <td className="py-3 pr-4 font-mono text-xs text-red-400">{pack.followup_pack_id}</td>
                          <td className="py-3 pr-4">{pack.pack_name}</td>
                          <td className="py-3">{triggerCountMap[pack.followup_pack_id] || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* F2 - Legacy Packs Unused */}
            <div>
              <h4 className="text-sm font-semibold text-slate-400 mb-3">F2 - Legacy Packs Unused (Safe to Retire Later)</h4>
              {legacyPacksUnused.length === 0 ? (
                <div className="text-center py-4 text-slate-400">
                  No unused legacy packs
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-700">
                      <tr className="text-left text-slate-400">
                        <th className="pb-2 pr-4">Legacy Pack Code</th>
                        <th className="pb-2">Legacy Pack Name</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-300">
                      {legacyPacksUnused.map(pack => (
                        <tr key={pack.id} className="border-b border-slate-800/50">
                          <td className="py-3 pr-4 font-mono text-xs text-slate-500">{pack.followup_pack_id}</td>
                          <td className="py-3">{pack.pack_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </AuditSection>

        {/* Section G - V2 Packs Missing a Category */}
        <AuditSection
          title="G. V2 Packs Missing Category Assignment"
          count={v2PacksNoCategory.length}
          severity={v2PacksNoCategory.length > 0 ? "warning" : "ok"}
        >
          {v2PacksNoCategory.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400" />
              All V2 packs have category assignments
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-700">
                  <tr className="text-left text-slate-400">
                    <th className="pb-2 pr-4">Pack Code</th>
                    <th className="pb-2 pr-4">Pack Name</th>
                    <th className="pb-2 pr-4">Standard Cluster</th>
                    <th className="pb-2">Triggered Questions</th>
                  </tr>
                </thead>
                <tbody className="text-slate-300">
                  {v2PacksNoCategory.map(pack => (
                    <tr key={pack.id} className="border-b border-slate-800/50">
                      <td className="py-3 pr-4 font-mono text-xs">{pack.followup_pack_id}</td>
                      <td className="py-3 pr-4">{pack.pack_name}</td>
                      <td className="py-3 pr-4">{pack.is_standard_cluster ? '✓' : '✗'}</td>
                      <td className="py-3">{triggerCountMap[pack.followup_pack_id] || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AuditSection>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, color }) {
  const colorClasses = {
    blue: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
    green: 'bg-green-500/10 border-green-500/30 text-green-400',
    yellow: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
    red: 'bg-red-500/10 border-red-500/30 text-red-400',
    purple: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
    orange: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
    amber: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
    slate: 'bg-slate-500/10 border-slate-500/30 text-slate-400'
  };

  return (
    <Card className={`${colorClasses[color]} border`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <Icon className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-xs opacity-80 leading-tight">{label}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AuditSection({ title, count, severity, children }) {
  const severityConfig = {
    ok: { icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-950/30', border: 'border-green-500/30' },
    info: { icon: AlertCircle, color: 'text-blue-400', bg: 'bg-blue-950/30', border: 'border-blue-500/30' },
    warning: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-950/30', border: 'border-yellow-500/30' },
    error: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-950/30', border: 'border-red-500/30' }
  };

  const config = severityConfig[severity] || severityConfig.info;
  const Icon = config.icon;

  return (
    <div className={`mb-6 rounded-lg border ${config.border} ${config.bg} p-6`}>
      <div className="flex items-center gap-3 mb-4">
        <Icon className={`w-5 h-5 ${config.color}`} />
        <h3 className="text-base font-semibold text-white">{title}</h3>
        <Badge className={`ml-auto ${config.color} bg-transparent border-current`}>
          {count} {count === 1 ? 'item' : 'items'}
        </Badge>
      </div>
      {children}
    </div>
  );
}