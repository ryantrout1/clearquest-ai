import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, Package, AlertTriangle, Save, Check } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function FollowUpPackQuickAssign() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [user, setUser] = useState(null);
  const [assignments, setAssignments] = useState({});
  const [saving, setSaving] = useState(false);

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

  const { data: followUpPacks = [] } = useQuery({
    queryKey: ['followUpPacks'],
    queryFn: () => base44.entities.FollowUpPack.list(),
    enabled: !!user
  });

  // Filter questions that are active and don't have a follow-up pack
  const questionsWithoutPacks = useMemo(() => {
    return questions
      .filter(q => q.active !== false && !q.followup_pack)
      .sort((a, b) => {
        // Sort by question_number if available, otherwise by question_id
        const aNum = typeof a.question_number === 'number' ? a.question_number : parseInt(a.question_id?.replace(/\D/g, '') || '0', 10);
        const bNum = typeof b.question_number === 'number' ? b.question_number : parseInt(b.question_id?.replace(/\D/g, '') || '0', 10);
        return aNum - bNum;
      });
  }, [questions]);

  const handleAssign = (questionId, packCode) => {
    setAssignments(prev => ({
      ...prev,
      [questionId]: packCode
    }));
  };

  const handleSaveAll = async () => {
    if (Object.keys(assignments).length === 0) {
      toast.error('No assignments to save');
      return;
    }

    setSaving(true);
    try {
      // Update all questions with assignments
      await Promise.all(
        Object.entries(assignments).map(([questionId, packCode]) =>
          base44.entities.Question.update(questionId, {
            followup_pack: packCode
          })
        )
      );

      queryClient.invalidateQueries({ queryKey: ['questions'] });
      setAssignments({});
      toast.success(`${Object.keys(assignments).length} questions updated`);
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Failed to save assignments');
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-slate-300">Loading...</div>
      </div>
    );
  }

  const pendingCount = Object.keys(assignments).length;

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
              <Package className="w-6 h-6 text-emerald-400" />
              <div>
                <h1 className="text-xl font-bold text-white">Quick Assign Follow-Up Packs</h1>
                <p className="text-xs text-slate-400">
                  Assign follow-up packs to {questionsWithoutPacks.length} active questions without assignments
                </p>
              </div>
            </div>

            {pendingCount > 0 && (
              <Button
                onClick={handleSaveAll}
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {saving ? (
                  <>Saving...</>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save {pendingCount} {pendingCount === 1 ? 'Assignment' : 'Assignments'}
                  </>
                )}
              </Button>
            )}
          </div>

          {questionsWithoutPacks.length > 0 && (
            <Alert className="mt-4 bg-yellow-950/30 border-yellow-800/50">
              <AlertTriangle className="h-4 w-4 text-yellow-400" />
              <AlertDescription className="text-yellow-300 text-sm">
                <strong>{questionsWithoutPacks.length}</strong> active {questionsWithoutPacks.length === 1 ? 'question is' : 'questions are'} missing follow-up pack assignments. 
                Assign packs below and click "Save Assignments" when ready.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1600px] mx-auto p-6">
        {questionsLoading ? (
          <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-8 text-center">
            <p className="text-slate-400">Loading questions...</p>
          </div>
        ) : questionsWithoutPacks.length === 0 ? (
          <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-lg p-8 text-center">
            <Check className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">All Set!</h3>
            <p className="text-slate-400">All active questions have follow-up packs assigned.</p>
          </div>
        ) : (
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-900/50 border-b border-slate-700">
                  <tr>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase">Section</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase">Q#</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase">Question ID</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase w-1/3">Question Text</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase">Assign Follow-Up Pack</th>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-slate-400 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {questionsWithoutPacks.map((question) => {
                    const section = sections.find(s => s.id === question.section_id);
                    const hasAssignment = !!assignments[question.id];
                    
                    return (
                      <tr key={question.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4 text-sm text-slate-300">
                          {section?.section_name || question.category || '-'}
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant="outline" className="font-mono text-xs border-slate-600 text-blue-400">
                            {question.question_number || '-'}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant="outline" className="font-mono text-xs border-slate-600 text-slate-300">
                            {question.question_id}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-sm text-white leading-relaxed">
                          {question.question_text}
                        </td>
                        <td className="py-3 px-4">
                          <Select
                            value={assignments[question.id] || ""}
                            onValueChange={(value) => handleAssign(question.id, value)}
                          >
                            <SelectTrigger className="bg-slate-900 border-slate-600 text-white">
                              <SelectValue placeholder="Select pack..." />
                            </SelectTrigger>
                            <SelectContent className="max-h-96 bg-slate-900">
                              {followUpPacks.map((pack) => (
                                <SelectItem key={pack.id} value={pack.followup_pack_id}>
                                  <div className="flex flex-col gap-0.5 py-1">
                                    <span className="text-sm font-medium text-white">
                                      {pack.pack_name}
                                    </span>
                                    <span className="text-xs text-slate-500 font-mono">
                                      {pack.followup_pack_id}
                                    </span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {hasAssignment ? (
                            <Badge className="bg-emerald-500/20 border-emerald-500/50 text-emerald-400">
                              Pending
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-slate-600 text-slate-400">
                              Not Assigned
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {questionsWithoutPacks.length > 0 && pendingCount > 0 && (
          <div className="mt-6 flex justify-end">
            <Button
              onClick={handleSaveAll}
              disabled={saving}
              size="lg"
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {saving ? (
                <>Saving...</>
              ) : (
                <>
                  <Save className="w-5 h-5 mr-2" />
                  Save {pendingCount} {pendingCount === 1 ? 'Assignment' : 'Assignments'}
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}