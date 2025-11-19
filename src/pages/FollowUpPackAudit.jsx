import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ChevronLeft, AlertTriangle, CheckCircle, XCircle, ChevronDown, ChevronRight, Download, Search } from "lucide-react";

export default function FollowUpPackAudit() {
  const navigate = useNavigate();
  const [expandedPacks, setExpandedPacks] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState("");

  const { data: packs = [] } = useQuery({
    queryKey: ['followUpPacks'],
    queryFn: () => base44.entities.FollowUpPack.list()
  });

  const { data: followUpQuestions = [] } = useQuery({
    queryKey: ['followUpQuestions'],
    queryFn: () => base44.entities.FollowUpQuestion.list()
  });

  const { data: interviewQuestions = [] } = useQuery({
    queryKey: ['questions'],
    queryFn: () => base44.entities.Question.list()
  });

  const auditData = useMemo(() => {
    // Build pack lookup
    const packMap = new Map();
    packs.forEach(pack => {
      packMap.set(pack.followup_pack_id, pack);
    });

    // Count deterministic questions per pack
    const packQuestionCounts = new Map();
    followUpQuestions.forEach(q => {
      const count = packQuestionCounts.get(q.followup_pack_id) || 0;
      packQuestionCounts.set(q.followup_pack_id, count + 1);
    });

    // Count interview questions using each pack
    const packUsageCounts = new Map();
    const packUsageQuestions = new Map();
    interviewQuestions.forEach(q => {
      const packId = q.followup_pack || q.followup_pack_id;
      if (packId) {
        const count = packUsageCounts.get(packId) || 0;
        packUsageCounts.set(packId, count + 1);
        
        if (!packUsageQuestions.has(packId)) {
          packUsageQuestions.set(packId, []);
        }
        packUsageQuestions.get(packId).push(q);
      }
    });

    // Find questions with missing packs
    const missingPacks = [];
    interviewQuestions.forEach(q => {
      const packId = q.followup_pack || q.followup_pack_id;
      if (packId && !packMap.has(packId)) {
        missingPacks.push({
          question: q,
          missingPackId: packId
        });
      }
    });

    // Build pack summary
    const packSummary = packs.map(pack => {
      const deterministicCount = packQuestionCounts.get(pack.followup_pack_id) || 0;
      const usageCount = packUsageCounts.get(pack.followup_pack_id) || 0;
      const usageQuestions = packUsageQuestions.get(pack.followup_pack_id) || [];
      
      return {
        pack,
        deterministicCount,
        usageCount,
        usageQuestions,
        flags: {
          noDeterministic: deterministicCount === 0,
          unused: usageCount === 0,
          healthy: deterministicCount > 0 && usageCount > 0
        }
      };
    });

    return {
      packSummary,
      missingPacks,
      packMap,
      packQuestionCounts,
      followUpQuestions
    };
  }, [packs, followUpQuestions, interviewQuestions]);

  const filteredSummary = auditData.packSummary.filter(item => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      item.pack.pack_name?.toLowerCase().includes(search) ||
      item.pack.followup_pack_id?.toLowerCase().includes(search)
    );
  });

  const togglePack = (packId) => {
    setExpandedPacks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(packId)) {
        newSet.delete(packId);
      } else {
        newSet.add(packId);
      }
      return newSet;
    });
  };

  const exportCSV = () => {
    const rows = [
      ['Pack Name', 'Pack ID', 'Deterministic Questions', 'Used By Questions', 'Status'].join(',')
    ];
    
    auditData.packSummary.forEach(item => {
      const status = item.flags.healthy ? 'Healthy' : 
                     item.flags.noDeterministic ? 'No Deterministic' :
                     item.flags.unused ? 'Unused' : 'Warning';
      rows.push([
        item.pack.pack_name,
        item.pack.followup_pack_id,
        item.deterministicCount,
        item.usageCount,
        status
      ].join(','));
    });

    const csv = rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'followup-pack-audit.csv';
    a.click();
  };

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
              <AlertTriangle className="w-6 h-6 text-blue-400" />
              <div>
                <h1 className="text-xl font-bold text-white">Follow-Up Pack Audit</h1>
                <p className="text-xs text-slate-400">Verify pack connections and data integrity</p>
              </div>
            </div>
            <Button onClick={exportCSV} size="sm" className="bg-emerald-600 hover:bg-emerald-700">
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto p-6 space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-white">{packs.length}</div>
              <div className="text-sm text-slate-400">Total Packs</div>
            </CardContent>
          </Card>
          <Card className="bg-emerald-950/30 border-emerald-500/30">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-emerald-400">
                {auditData.packSummary.filter(p => p.flags.healthy).length}
              </div>
              <div className="text-sm text-slate-400">Healthy Packs</div>
            </CardContent>
          </Card>
          <Card className="bg-yellow-950/30 border-yellow-500/30">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-yellow-400">
                {auditData.packSummary.filter(p => p.flags.noDeterministic).length}
              </div>
              <div className="text-sm text-slate-400">No Deterministic Questions</div>
            </CardContent>
          </Card>
          <Card className="bg-red-950/30 border-red-500/30">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-red-400">
                {auditData.missingPacks.length}
              </div>
              <div className="text-sm text-slate-400">Missing Pack References</div>
            </CardContent>
          </Card>
        </div>

        {/* Missing Packs Warning */}
        {auditData.missingPacks.length > 0 && (
          <Card className="bg-red-950/20 border-red-500/50">
            <CardContent className="p-6">
              <h2 className="text-lg font-bold text-red-400 mb-4 flex items-center gap-2">
                <XCircle className="w-5 h-5" />
                Questions with Missing Pack References ({auditData.missingPacks.length})
              </h2>
              <div className="space-y-2">
                {auditData.missingPacks.map((item, idx) => (
                  <div key={idx} className="bg-slate-900/50 border border-red-500/30 rounded-lg p-3">
                    <div className="flex items-start gap-3">
                      <Badge variant="outline" className="text-xs border-red-500 text-red-400 font-mono">
                        {item.question.question_id}
                      </Badge>
                      <div className="flex-1">
                        <p className="text-sm text-white">{item.question.question_text}</p>
                        <div className="flex gap-2 mt-2">
                          <Badge variant="outline" className="text-xs text-slate-400">
                            {item.question.category || item.question.section_id}
                          </Badge>
                          <Badge className="text-xs bg-red-500/20 text-red-400">
                            Missing: {item.missingPackId}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pack Usage Summary */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Pack Usage Summary</h2>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  placeholder="Search packs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-slate-900 border-slate-600 text-white"
                />
              </div>
            </div>

            <div className="space-y-2">
              {filteredSummary.map(item => {
                const isExpanded = expandedPacks.has(item.pack.id);
                const deterministicQuestions = auditData.followUpQuestions.filter(
                  q => q.followup_pack_id === item.pack.followup_pack_id
                );

                return (
                  <div key={item.pack.id} className="bg-slate-900/50 border border-slate-700 rounded-lg">
                    <button
                      onClick={() => togglePack(item.pack.id)}
                      className="w-full p-4 flex items-center gap-3 hover:bg-slate-800/50 transition-colors"
                    >
                      {isExpanded ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
                      
                      <div className="flex-1 text-left">
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-semibold text-white">{item.pack.pack_name}</h3>
                          {item.flags.healthy && <CheckCircle className="w-4 h-4 text-emerald-400" />}
                          {item.flags.noDeterministic && <AlertTriangle className="w-4 h-4 text-yellow-400" />}
                          {item.flags.unused && <XCircle className="w-4 h-4 text-red-400" />}
                        </div>
                        <p className="text-xs text-slate-400 font-mono mt-1">{item.pack.followup_pack_id}</p>
                      </div>

                      <div className="flex gap-2">
                        <Badge variant="outline" className="text-xs bg-purple-500/20 border-purple-500/30 text-purple-300">
                          {item.deterministicCount} deterministic
                        </Badge>
                        <Badge variant="outline" className="text-xs bg-emerald-500/20 border-emerald-500/30 text-emerald-300">
                          {item.usageCount} usage
                        </Badge>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-slate-700 p-4 space-y-4">
                        {/* Deterministic Questions */}
                        <div>
                          <h4 className="text-sm font-semibold text-purple-400 mb-2">
                            Deterministic Questions ({deterministicQuestions.length})
                          </h4>
                          {deterministicQuestions.length === 0 ? (
                            <p className="text-xs text-slate-500">No deterministic questions defined</p>
                          ) : (
                            <div className="space-y-1">
                              {deterministicQuestions.map((q, idx) => (
                                <div key={q.id} className="bg-slate-800/50 border border-slate-600 rounded p-2">
                                  <div className="flex items-start gap-2">
                                    <span className="text-xs text-purple-400">#{idx + 1}</span>
                                    <p className="text-xs text-slate-300 flex-1">{q.question_text}</p>
                                    <Badge variant="outline" className="text-xs">
                                      {q.active !== false ? 'Active' : 'Inactive'}
                                    </Badge>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Usage Questions */}
                        <div>
                          <h4 className="text-sm font-semibold text-emerald-400 mb-2">
                            Used By Interview Questions ({item.usageQuestions.length})
                          </h4>
                          {item.usageQuestions.length === 0 ? (
                            <p className="text-xs text-slate-500">No interview questions reference this pack</p>
                          ) : (
                            <div className="space-y-1">
                              {item.usageQuestions.map(q => (
                                <div key={q.id} className="bg-slate-800/50 border border-slate-600 rounded p-2">
                                  <div className="flex items-start gap-2">
                                    <Badge variant="outline" className="text-xs border-blue-500 text-blue-400 font-mono">
                                      {q.question_id}
                                    </Badge>
                                    <p className="text-xs text-slate-300 flex-1">{q.question_text}</p>
                                    <Badge variant="outline" className="text-xs text-slate-400">
                                      {q.category || q.section_id}
                                    </Badge>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}