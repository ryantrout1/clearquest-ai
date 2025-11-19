import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, FileText, Package, AlertTriangle, Search } from "lucide-react";

export default function FollowUpCoverageReport() {
  const navigate = useNavigate();
  const [user, setUser] = React.useState(null);
  const [searchQuestions, setSearchQuestions] = useState("");
  const [searchPacks, setSearchPacks] = useState("");

  React.useEffect(() => {
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
    queryKey: ['questions'],
    queryFn: () => base44.entities.Question.list(),
    enabled: !!user
  });

  const { data: sections = [] } = useQuery({
    queryKey: ['sections'],
    queryFn: () => base44.entities.Section.list(),
    enabled: !!user
  });

  const { data: followUpPacks = [], isLoading: packsLoading } = useQuery({
    queryKey: ['followUpPacks'],
    queryFn: () => base44.entities.FollowUpPack.list(),
    enabled: !!user
  });

  // Questions with follow-up packs
  const questionsWithPacks = useMemo(() => {
    return questions
      .filter(q => q.followup_pack || q.followup_pack_id)
      .map(q => {
        const section = sections.find(s => s.id === q.section_id);
        return {
          ...q,
          section_name: section?.section_name || q.category || 'Unknown'
        };
      })
      .sort((a, b) => (a.question_number || 0) - (b.question_number || 0));
  }, [questions, sections]);

  // Follow-up packs with no questions
  const packsWithNoQuestions = useMemo(() => {
    const usedPackIds = new Set(
      questions
        .map(q => q.followup_pack || q.followup_pack_id)
        .filter(Boolean)
    );
    
    return followUpPacks.filter(pack => !usedPackIds.has(pack.followup_pack_id));
  }, [questions, followUpPacks]);

  // Filtered lists
  const filteredQuestions = useMemo(() => {
    if (!searchQuestions) return questionsWithPacks;
    const search = searchQuestions.toLowerCase();
    return questionsWithPacks.filter(q => 
      q.question_id?.toLowerCase().includes(search) ||
      q.question_text?.toLowerCase().includes(search) ||
      q.section_name?.toLowerCase().includes(search) ||
      q.followup_pack?.toLowerCase().includes(search) ||
      q.followup_pack_id?.toLowerCase().includes(search)
    );
  }, [questionsWithPacks, searchQuestions]);

  const filteredPacks = useMemo(() => {
    if (!searchPacks) return packsWithNoQuestions;
    const search = searchPacks.toLowerCase();
    return packsWithNoQuestions.filter(pack => 
      pack.followup_pack_id?.toLowerCase().includes(search) ||
      pack.pack_name?.toLowerCase().includes(search) ||
      pack.description?.toLowerCase().includes(search)
    );
  }, [packsWithNoQuestions, searchPacks]);

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-slate-300">Loading...</div>
      </div>
    );
  }

  const isLoading = questionsLoading || packsLoading;

  return (
    <div className="min-h-screen bg-[#0f172a]">
      {/* Header */}
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
              <FileText className="w-6 h-6 text-blue-400" />
              <div>
                <h1 className="text-xl font-bold text-white">Follow-Up Coverage Report</h1>
                <p className="text-xs text-slate-400">Read-only report showing question-to-pack relationships</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-[1600px] mx-auto p-6">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="text-slate-400">Loading data...</div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-slate-400">Total Questions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">{questions.length}</div>
                </CardContent>
              </Card>
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-slate-400">Questions with Packs</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-emerald-400">{questionsWithPacks.length}</div>
                  <p className="text-xs text-slate-500 mt-1">
                    {questions.length > 0 ? Math.round((questionsWithPacks.length / questions.length) * 100) : 0}% coverage
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-slate-400">Unused Packs</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-yellow-400">{packsWithNoQuestions.length}</div>
                  <p className="text-xs text-slate-500 mt-1">
                    {followUpPacks.length > 0 ? Math.round((packsWithNoQuestions.length / followUpPacks.length) * 100) : 0}% unused
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* List A: Questions with Follow-Up Packs */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-emerald-400" />
                    <CardTitle className="text-white">Questions with Follow-Up Packs</CardTitle>
                    <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                      {filteredQuestions.length}
                    </Badge>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      placeholder="Search questions..."
                      value={searchQuestions}
                      onChange={(e) => setSearchQuestions(e.target.value)}
                      className="pl-10 bg-slate-900 border-slate-600 text-white"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filteredQuestions.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    {searchQuestions ? 'No questions match your search' : 'No questions with follow-up packs'}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="text-left py-3 px-3 text-xs font-semibold text-slate-400">Question ID</th>
                          <th className="text-left py-3 px-3 text-xs font-semibold text-slate-400">Q#</th>
                          <th className="text-left py-3 px-3 text-xs font-semibold text-slate-400">Section</th>
                          <th className="text-left py-3 px-3 text-xs font-semibold text-slate-400">Question Text</th>
                          <th className="text-left py-3 px-3 text-xs font-semibold text-slate-400">Follow-Up Pack</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredQuestions.map((q) => (
                          <tr key={q.id} className="border-b border-slate-800 hover:bg-slate-700/30 transition-colors">
                            <td className="py-3 px-3">
                              <span className="text-sm font-mono text-blue-400">{q.question_id}</span>
                            </td>
                            <td className="py-3 px-3">
                              <span className="text-sm text-slate-300">
                                {q.question_number ? `#${q.question_number}` : '-'}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <Badge variant="outline" className="text-xs border-slate-600 text-slate-300">
                                {q.section_name}
                              </Badge>
                            </td>
                            <td className="py-3 px-3">
                              <p className="text-sm text-slate-200 max-w-lg line-clamp-2">{q.question_text}</p>
                            </td>
                            <td className="py-3 px-3">
                              <Badge className="text-xs bg-purple-500/20 text-purple-300 border-purple-500/30 font-mono">
                                {q.followup_pack || q.followup_pack_id}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* List B: Follow-Up Packs with No Questions */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="w-5 h-5 text-yellow-400" />
                    <CardTitle className="text-white">Follow-Up Packs with No Questions</CardTitle>
                    <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30">
                      {filteredPacks.length}
                    </Badge>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      placeholder="Search packs..."
                      value={searchPacks}
                      onChange={(e) => setSearchPacks(e.target.value)}
                      className="pl-10 bg-slate-900 border-slate-600 text-white"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filteredPacks.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    {searchPacks ? 'No packs match your search' : 'All packs are assigned to questions'}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredPacks.map((pack) => (
                      <div
                        key={pack.id}
                        className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 hover:border-yellow-500/30 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <h4 className="text-base font-semibold text-white">{pack.pack_name}</h4>
                              <Badge variant="outline" className="text-xs font-mono border-slate-600 text-slate-400">
                                {pack.followup_pack_id}
                              </Badge>
                            </div>
                            {pack.description && (
                              <p className="text-sm text-slate-400 leading-relaxed">{pack.description}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}