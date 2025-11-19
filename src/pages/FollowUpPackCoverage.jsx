import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, AlertTriangle, Package, FileQuestion } from "lucide-react";

export default function FollowUpPackCoverage() {
  const navigate = useNavigate();

  const { data: questions = [] } = useQuery({
    queryKey: ['questions'],
    queryFn: () => base44.entities.Question.list()
  });

  const { data: followUpPacks = [] } = useQuery({
    queryKey: ['followUpPacks'],
    queryFn: () => base44.entities.FollowUpPack.list()
  });

  const { data: sections = [] } = useQuery({
    queryKey: ['sections'],
    queryFn: () => base44.entities.Section.list()
  });

  const analysis = useMemo(() => {
    // Get unique pack codes from questions
    const questionPackCodes = new Set(
      questions
        .filter(q => q.followup_pack)
        .map(q => q.followup_pack)
    );

    // Get unique pack codes from FollowUpPack records
    const definedPackCodes = new Set(
      followUpPacks.map(p => p.followup_pack_id)
    );

    // Calculate missing and unused
    const missingPackCodes = Array.from(questionPackCodes).filter(
      code => !definedPackCodes.has(code)
    );

    const unusedPackCodes = Array.from(definedPackCodes).filter(
      code => !questionPackCodes.has(code)
    );

    // Build detailed missing pack info
    const missingPackDetails = missingPackCodes.map(code => {
      const questionsUsingPack = questions.filter(q => q.followup_pack === code);
      return {
        code,
        questions: questionsUsingPack.map(q => {
          const section = sections.find(s => s.id === q.section_id);
          return {
            questionId: q.question_id,
            questionText: q.question_text,
            sectionName: section?.section_name || q.category || 'Unknown'
          };
        })
      };
    });

    // Build detailed unused pack info
    const unusedPackDetails = unusedPackCodes.map(code => {
      const pack = followUpPacks.find(p => p.followup_pack_id === code);
      return {
        code,
        packName: pack?.pack_name || code,
        description: pack?.description || ''
      };
    });

    return {
      missingPackDetails,
      unusedPackDetails,
      totalMissing: missingPackCodes.length,
      totalUnused: unusedPackCodes.length,
      totalDefined: definedPackCodes.size,
      totalReferenced: questionPackCodes.size
    };
  }, [questions, followUpPacks, sections]);

  return (
    <div className="min-h-screen bg-[#0a0f1e]">
      {/* Header */}
      <div className="border-b border-slate-800/50 bg-[#0f1629] px-4 py-3">
        <div className="max-w-[1600px] mx-auto">
          <div className="flex items-center justify-between">
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
              <FileQuestion className="w-5 h-5 text-blue-400" />
              <div>
                <h1 className="text-lg font-semibold text-white">Follow-Up Pack Coverage Report</h1>
                <p className="text-xs text-slate-400">
                  Analysis of pack assignments across all questions
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1600px] mx-auto p-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <div className="text-sm text-slate-400 mb-1">Total Packs Defined</div>
            <div className="text-3xl font-bold text-white">{analysis.totalDefined}</div>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <div className="text-sm text-slate-400 mb-1">Packs Referenced</div>
            <div className="text-3xl font-bold text-white">{analysis.totalReferenced}</div>
          </div>
          <div className="bg-red-900/30 border border-red-800/50 rounded-lg p-4">
            <div className="text-sm text-red-400 mb-1">Missing Packs</div>
            <div className="text-3xl font-bold text-red-400">{analysis.totalMissing}</div>
          </div>
          <div className="bg-yellow-900/30 border border-yellow-800/50 rounded-lg p-4">
            <div className="text-sm text-yellow-400 mb-1">Unused Packs</div>
            <div className="text-3xl font-bold text-yellow-400">{analysis.totalUnused}</div>
          </div>
        </div>

        {/* Missing Packs Section */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <h2 className="text-xl font-bold text-white">
              A. Missing Packs ({analysis.totalMissing})
            </h2>
          </div>
          <p className="text-sm text-slate-400 mb-4">
            These questions reference follow-up packs that don't exist in the FollowUpPack entity.
          </p>

          {analysis.missingPackDetails.length === 0 ? (
            <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-lg p-6 text-center">
              <p className="text-emerald-400">✓ All referenced packs are defined</p>
            </div>
          ) : (
            <div className="space-y-4">
              {analysis.missingPackDetails.map(({ code, questions }) => (
                <div key={code} className="bg-red-950/30 border border-red-800/50 rounded-lg overflow-hidden">
                  <div className="bg-red-900/30 border-b border-red-800/50 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-red-400 font-mono">{code}</h3>
                        <p className="text-xs text-red-300 mt-1">
                          Referenced by {questions.length} {questions.length === 1 ? 'question' : 'questions'}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => navigate(createPageUrl("FollowupPackManager"))}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        Create Pack
                      </Button>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="border-b border-red-800/50">
                          <tr>
                            <th className="text-left py-2 px-3 text-xs font-semibold text-red-400">Section</th>
                            <th className="text-left py-2 px-3 text-xs font-semibold text-red-400">Question ID</th>
                            <th className="text-left py-2 px-3 text-xs font-semibold text-red-400">Question Text</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-red-800/30">
                          {questions.map(q => (
                            <tr key={q.questionId} className="hover:bg-red-900/20">
                              <td className="py-2 px-3 text-sm text-slate-300">{q.sectionName}</td>
                              <td className="py-2 px-3">
                                <Badge variant="outline" className="font-mono text-xs border-red-600 text-red-400">
                                  {q.questionId}
                                </Badge>
                              </td>
                              <td className="py-2 px-3 text-sm text-white">{q.questionText}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Unused Packs Section */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-5 h-5 text-yellow-400" />
            <h2 className="text-xl font-bold text-white">
              B. Unused Packs ({analysis.totalUnused})
            </h2>
          </div>
          <p className="text-sm text-slate-400 mb-4">
            These packs exist in the database but are not referenced by any question.
          </p>

          {analysis.unusedPackDetails.length === 0 ? (
            <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-lg p-6 text-center">
              <p className="text-emerald-400">✓ All defined packs are in use</p>
            </div>
          ) : (
            <div className="bg-yellow-950/30 border border-yellow-800/50 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-yellow-900/30 border-b border-yellow-800/50">
                    <tr>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-yellow-400">Pack Code</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-yellow-400">Pack Name</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-yellow-400">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-yellow-800/30">
                    {analysis.unusedPackDetails.map(pack => (
                      <tr key={pack.code} className="hover:bg-yellow-900/20">
                        <td className="py-3 px-4">
                          <Badge variant="outline" className="font-mono text-xs border-yellow-600 text-yellow-400">
                            {pack.code}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-sm text-white font-medium">{pack.packName}</td>
                        <td className="py-3 px-4 text-sm text-slate-300">{pack.description || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}