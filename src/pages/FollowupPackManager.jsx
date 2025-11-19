import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ChevronLeft, Package, AlertTriangle, Zap } from "lucide-react";
import { toast } from "sonner";
import FollowUpCategorySidebar from "../components/followups/FollowUpCategorySidebar";
import FollowUpPackList from "../components/followups/FollowUpPackList";
import FollowUpPackDetails from "../components/followups/FollowUpPackDetails";
import { FOLLOWUP_CATEGORIES, getPacksByCategory } from "../components/followups/categoryMapping";

export default function FollowupPackManager() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const urlParams = new URLSearchParams(window.location.search);
  const highlightPackId = urlParams.get('packId');
  
  const [user, setUser] = useState(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState(FOLLOWUP_CATEGORIES[0].id);
  const [selectedPack, setSelectedPack] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [leftWidth, setLeftWidth] = useState(25);
  const [middleWidth, setMiddleWidth] = useState(35);
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);

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

  // Auto-select pack from URL
  useEffect(() => {
    if (highlightPackId && packs.length > 0) {
      const pack = packs.find(p => p.id === highlightPackId);
      if (pack) {
        setSelectedPack(pack);
      }
    }
  }, [highlightPackId, packs]);

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

  // Build questions by pack map
  const questionsMap = useMemo(() => {
    const map = {};
    allQuestions.forEach(q => {
      if (!map[q.followup_pack_id]) {
        map[q.followup_pack_id] = [];
      }
      map[q.followup_pack_id].push(q);
    });
    return map;
  }, [allQuestions]);

  // Categorize packs
  const packsByCategory = useMemo(() => getPacksByCategory(packs), [packs]);

  // Filter packs in selected category by search
  const filteredPacks = useMemo(() => {
    const categoryPacks = packsByCategory[selectedCategoryId] || [];
    if (!searchTerm) return categoryPacks;
    
    const search = searchTerm.toLowerCase();
    return categoryPacks.filter(pack => 
      pack.pack_name?.toLowerCase().includes(search) ||
      pack.followup_pack_id?.toLowerCase().includes(search) ||
      pack.description?.toLowerCase().includes(search)
    );
  }, [packsByCategory, selectedCategoryId, searchTerm]);

  // Validation: count packs with no triggers per category
  const validationIssues = useMemo(() => {
    const issues = {};
    Object.entries(packsByCategory).forEach(([categoryId, categoryPacks]) => {
      const packsWithNoTriggers = categoryPacks.filter(pack => {
        const triggers = packUsageMap[pack.followup_pack_id] || [];
        return triggers.length === 0;
      });
      issues[categoryId] = packsWithNoTriggers.length;
    });
    return issues;
  }, [packsByCategory, packUsageMap]);

  // Count total packs with no triggers
  const totalPacksWithNoTriggers = useMemo(() => {
    return packs.filter(pack => {
      const triggers = packUsageMap[pack.followup_pack_id] || [];
      return triggers.length === 0;
    }).length;
  }, [packs, packUsageMap]);

  // Count uncategorized packs
  const uncategorizedCount = packsByCategory["UNCATEGORIZED"]?.length || 0;

  // Auto-select first pack when category changes
  useEffect(() => {
    if (filteredPacks.length > 0 && !filteredPacks.find(p => p.id === selectedPack?.id)) {
      setSelectedPack(filteredPacks[0]);
    }
  }, [selectedCategoryId, filteredPacks]);

  // Resizable dividers
  const handleMouseDownLeft = (e) => {
    e.preventDefault();
    setIsDraggingLeft(true);
  };

  const handleMouseDownRight = (e) => {
    e.preventDefault();
    setIsDraggingRight(true);
  };

  useEffect(() => {
    if (!isDraggingLeft && !isDraggingRight) return;

    const handleMouseMove = (e) => {
      const container = document.getElementById('followup-container');
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const mouseX = e.clientX - containerRect.left;
      const totalWidth = containerRect.width;

      if (isDraggingLeft) {
        const newLeftWidth = (mouseX / totalWidth) * 100;
        const clampedLeft = Math.min(Math.max(newLeftWidth, 15), 40);
        setLeftWidth(clampedLeft);
      } else if (isDraggingRight) {
        const newMiddleEnd = (mouseX / totalWidth) * 100;
        const newMiddleWidth = newMiddleEnd - leftWidth;
        const clampedMiddle = Math.min(Math.max(newMiddleWidth, 20), 60);
        setMiddleWidth(clampedMiddle);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingLeft(false);
      setIsDraggingRight(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingLeft, isDraggingRight, leftWidth]);

  const handleToggleActive = async (packId, active) => {
    try {
      await base44.entities.FollowUpPack.update(packId, { active });
      queryClient.invalidateQueries({ queryKey: ['followUpPacks'] });
      toast.success(`Pack ${active ? 'activated' : 'deactivated'}`);
    } catch (err) {
      toast.error('Failed to update pack');
    }
  };

  const handleUpdate = () => {
    queryClient.invalidateQueries({ queryKey: ['followUpPacks'] });
    queryClient.invalidateQueries({ queryKey: ['followUpQuestions'] });
    queryClient.invalidateQueries({ queryKey: ['questions'] });
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-slate-300">Loading...</div>
      </div>
    );
  }

  const rightWidth = 100 - leftWidth - middleWidth;

  return (
    <div className="min-h-screen bg-[#0f172a]">
      {/* Header */}
      <div className="border-b border-slate-700/50 bg-[#1e293b]/80 backdrop-blur-sm px-6 py-4">
        <div className="max-w-[1800px] mx-auto">
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
              <Package className="w-6 h-6 text-amber-400" />
              <div>
                <h1 className="text-xl font-bold text-white">Follow-Up Pack Manager</h1>
                <p className="text-xs text-slate-400">
                  Organize and manage all follow-up packs across {FOLLOWUP_CATEGORIES.length} canonical categories
                </p>
              </div>
            </div>
            <Button
              onClick={() => navigate(createPageUrl("FollowUpPackQuickAssign"))}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Zap className="w-4 h-4 mr-2" />
              Quick Assign
            </Button>
          </div>

          {/* Warning Banners */}
          {(uncategorizedCount > 0 || totalPacksWithNoTriggers > 0) && (
            <div className="mt-4 space-y-2">
              {uncategorizedCount > 0 && (
                <Alert className="bg-red-950/30 border-red-800/50">
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                  <AlertDescription className="text-red-300 text-sm">
                    <strong>{uncategorizedCount}</strong> follow-up {uncategorizedCount === 1 ? 'pack is' : 'packs are'} not assigned to a canonical category. Please review and categorize them.
                  </AlertDescription>
                </Alert>
              )}
              {totalPacksWithNoTriggers > 0 && (
                <Alert className="bg-yellow-950/30 border-yellow-800/50">
                  <AlertTriangle className="h-4 w-4 text-yellow-400" />
                  <AlertDescription className="text-yellow-300 text-sm">
                    <strong>{totalPacksWithNoTriggers}</strong> follow-up {totalPacksWithNoTriggers === 1 ? 'pack has' : 'packs have'} no triggering questions and will never be used in interviews.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div id="followup-container" className="flex-1 flex overflow-hidden" style={{ height: 'calc(100vh - 140px)' }}>
        {/* Left Panel - Categories */}
        <div 
          style={{ width: `${leftWidth}%` }}
          className="overflow-auto border-r border-slate-700 p-6"
        >
          <h2 className="text-lg font-semibold text-white mb-4">Categories</h2>
          <FollowUpCategorySidebar
            categories={FOLLOWUP_CATEGORIES}
            packsByCategory={packsByCategory}
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={setSelectedCategoryId}
            validationIssues={validationIssues}
          />
        </div>

        {/* Left Drag Handle */}
        <div 
          className={`w-2 flex-shrink-0 transition-colors ${
            isDraggingLeft ? 'bg-amber-500' : 'bg-slate-800 hover:bg-amber-600'
          }`}
          onMouseDown={handleMouseDownLeft}
          style={{ cursor: 'col-resize', userSelect: 'none' }}
        />

        {/* Middle Panel - Pack List */}
        <div 
          style={{ width: `${middleWidth}%` }}
          className="overflow-auto border-r border-slate-700"
        >
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">
                {selectedCategoryId === "UNCATEGORIZED" 
                  ? "Uncategorized Packs"
                  : FOLLOWUP_CATEGORIES.find(c => c.id === selectedCategoryId)?.label}
              </h2>
              <span className="text-sm text-slate-400">
                {filteredPacks.length} {filteredPacks.length === 1 ? 'pack' : 'packs'}
              </span>
            </div>

            <div className="mb-4">
              <Input
                placeholder="Search packs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-slate-800 border-slate-600 text-white"
              />
            </div>

            {packsLoading ? (
              <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-8">
                <p className="text-slate-400 text-center">Loading packs...</p>
              </div>
            ) : (
              <FollowUpPackList
                packs={filteredPacks}
                selectedPackId={selectedPack?.id}
                onSelectPack={setSelectedPack}
                onToggleActive={handleToggleActive}
                packUsageMap={packUsageMap}
                questionsMap={questionsMap}
              />
            )}
          </div>
        </div>

        {/* Right Drag Handle */}
        <div 
          className={`w-2 flex-shrink-0 transition-colors ${
            isDraggingRight ? 'bg-amber-500' : 'bg-slate-800 hover:bg-amber-600'
          }`}
          onMouseDown={handleMouseDownRight}
          style={{ cursor: 'col-resize', userSelect: 'none' }}
        />

        {/* Right Panel - Pack Details */}
        <div 
          style={{ width: `${rightWidth}%` }}
          className="overflow-auto"
        >
          <div className="p-6">
            <FollowUpPackDetails
              pack={selectedPack}
              questions={questionsMap[selectedPack?.followup_pack_id] || []}
              triggeringQuestions={packUsageMap[selectedPack?.followup_pack_id] || []}
              onUpdate={handleUpdate}
            />
          </div>
        </div>
      </div>
    </div>
  );
}