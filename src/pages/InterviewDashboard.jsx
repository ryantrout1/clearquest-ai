import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, ArrowLeft, X, Trash2, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function InterviewDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [sortBy, setSortBy] = useState("most_recent");
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedSessions, setSelectedSessions] = useState(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const adminAuth = sessionStorage.getItem("clearquest_admin_auth");
      if (adminAuth) {
        const auth = JSON.parse(adminAuth);
        setCurrentUser({
          username: auth.username,
          email: `${auth.username.toLowerCase()}@clearquest.ai`,
          role: "SUPER_ADMIN"
        });
        return;
      }

      const user = await base44.auth.me();
      setCurrentUser({
        username: user.first_name,
        email: user.email,
        role: user.role
      });
    } catch (err) {
      navigate(createPageUrl("AdminLogin"));
    }
  };

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => base44.entities.InterviewSession.list('-created_date'),
    refetchInterval: 5000,
    enabled: !!currentUser
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => base44.entities.Department.list(),
    enabled: !!currentUser,
    staleTime: 60000
  });

  const { data: allResponses = [] } = useQuery({
    queryKey: ['all-responses'],
    queryFn: () => base44.entities.Response.list(),
    enabled: !!currentUser,
    refetchInterval: 5000
  });

  const { data: allFollowUps = [] } = useQuery({
    queryKey: ['all-followups'],
    queryFn: () => base44.entities.FollowUpResponse.list(),
    enabled: !!currentUser,
    refetchInterval: 5000
  });

  const { data: allQuestions = [] } = useQuery({
    queryKey: ['all-questions'],
    queryFn: () => base44.entities.Question.filter({ active: true }),
    enabled: !!currentUser,
    staleTime: 60000
  });

  const totalActiveQuestions = allQuestions.length;

  const sessionCounts = useMemo(() => {
    const counts = {};
    
    sessions.forEach(session => {
      const sessionResponses = allResponses.filter(r => r.session_id === session.id);
      const sessionFollowUps = allFollowUps.filter(f => f.session_id === session.id);
      
      counts[session.id] = {
        questions: sessionResponses.length,
        followups: sessionFollowUps.length
      };
    });
    
    return counts;
  }, [sessions, allResponses, allFollowUps]);

  const uniqueDepartments = useMemo(() => {
    const deptMap = new Map();
    sessions.forEach(session => {
      if (session.department_code) {
        const dept = departments.find(d => d.department_code === session.department_code);
        if (dept) {
          deptMap.set(session.department_code, {
            code: session.department_code,
            name: dept.department_name
          });
        } else {
          deptMap.set(session.department_code, {
            code: session.department_code,
            name: session.department_code
          });
        }
      }
    });
    return Array.from(deptMap.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [sessions, departments]);

  const handleLogout = () => {
    sessionStorage.removeItem("clearquest_admin_auth");
    window.location.href = createPageUrl("Home");
  };

  const processedSessions = useMemo(() => {
    let filtered = sessions.filter(session => {
      const matchesSearch = 
        session.session_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        session.department_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        session.file_number?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === "all" || session.status === statusFilter;
      const matchesDepartment = departmentFilter === "all" || session.department_code === departmentFilter;
      
      return matchesSearch && matchesStatus && matchesDepartment;
    });

    filtered.sort((a, b) => {
      switch (sortBy) {
        case "most_recent":
          return new Date(b.created_date) - new Date(a.created_date);
        case "oldest":
          return new Date(a.created_date) - new Date(b.created_date);
        case "highest_progress":
          const progressA = totalActiveQuestions > 0 ? (sessionCounts[a.id]?.questions || 0) / totalActiveQuestions : 0;
          const progressB = totalActiveQuestions > 0 ? (sessionCounts[b.id]?.questions || 0) / totalActiveQuestions : 0;
          return progressB - progressA;
        case "lowest_progress":
          const progA = totalActiveQuestions > 0 ? (sessionCounts[a.id]?.questions || 0) / totalActiveQuestions : 0;
          const progB = totalActiveQuestions > 0 ? (sessionCounts[b.id]?.questions || 0) / totalActiveQuestions : 0;
          return progA - progB;
        case "department_az":
          return (a.department_code || "").localeCompare(b.department_code || "");
        default:
          return 0;
      }
    });

    return filtered;
  }, [sessions, searchTerm, statusFilter, departmentFilter, sortBy, sessionCounts, totalActiveQuestions]);

  const stats = useMemo(() => {
    const filteredByDepartment = departmentFilter === "all" 
      ? sessions 
      : sessions.filter(s => s.department_code === departmentFilter);
    
    return {
      total: filteredByDepartment.length,
      inProgress: filteredByDepartment.filter(s => s.status === "in_progress").length,
      completed: filteredByDepartment.filter(s => s.status === "completed").length,
      flagged: filteredByDepartment.filter(s => s.red_flags?.length > 0).length
    };
  }, [sessions, departmentFilter]);

  const selectedDepartmentName = uniqueDepartments.find(d => d.code === departmentFilter)?.name;

  const toggleSessionSelect = (sessionId) => {
    const newSelected = new Set(selectedSessions);
    if (newSelected.has(sessionId)) {
      newSelected.delete(sessionId);
    } else {
      newSelected.add(sessionId);
    }
    setSelectedSessions(newSelected);
  };

  const handleBulkDelete = async () => {
    if (!bulkDeleteConfirm) {
      setBulkDeleteConfirm(true);
      setTimeout(() => setBulkDeleteConfirm(false), 3000);
      return;
    }

    const sessionsToDelete = Array.from(selectedSessions);
    setIsBulkDeleting(true);
    
    try {
      // Fetch all related data in parallel
      const [allRelatedResponses, allRelatedFollowups] = await Promise.all([
        Promise.all(sessionsToDelete.map(sid => base44.entities.Response.filter({ session_id: sid }))),
        Promise.all(sessionsToDelete.map(sid => base44.entities.FollowUpResponse.filter({ session_id: sid })))
      ]);

      const responsesToDelete = allRelatedResponses.flat();
      const followupsToDelete = allRelatedFollowups.flat();

      // Delete all related data in parallel
      await Promise.all([
        ...responsesToDelete.map(r => base44.entities.Response.delete(r.id)),
        ...followupsToDelete.map(f => base44.entities.FollowUpResponse.delete(f.id))
      ]);

      // Delete all sessions in parallel
      await Promise.all(sessionsToDelete.map(sid => base44.entities.InterviewSession.delete(sid)));

      toast.success(`Deleted ${sessionsToDelete.length} session${sessionsToDelete.length > 1 ? 's' : ''}`);
      setSelectedSessions(new Set());
      setBulkDeleteConfirm(false);
      
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['all-responses'] });
      queryClient.invalidateQueries({ queryKey: ['all-followups'] });
      
    } catch (err) {
      toast.error("Failed to delete sessions");
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['all-responses'] });
      queryClient.invalidateQueries({ queryKey: ['all-followups'] });
    } finally {
      setIsBulkDeleting(false);
    }
  };

  if (!currentUser) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <div className="border-b border-slate-800/50 bg-[#0f1629] px-4 py-3 mb-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to={createPageUrl("HomeHub")}>
                <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white hover:bg-slate-800 -ml-2">
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Back
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-semibold text-white">Interview Dashboard</h1>
                <span className="text-xs text-slate-400 block mt-0.5">
                  Monitor and manage interview sessions
                </span>
              </div>
            </div>
            <Button 
              variant="outline" 
              onClick={handleLogout}
              size="sm"
              className="bg-slate-800/50 border-slate-700/50 text-white hover:bg-slate-800 text-xs"
            >
              Logout
            </Button>
          </div>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto px-4">

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <CompactStat label="Total Sessions" value={stats.total} color="blue" />
          <CompactStat label="In Progress" value={stats.inProgress} color="orange" />
          <CompactStat label="Completed" value={stats.completed} color="green" />
          <CompactStat label="Flagged" value={stats.flagged} color="red" />
        </div>

        {/* Search & Filters Card */}
        <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950/90 via-slate-950/70 to-slate-900/70 px-5 py-4 space-y-3 mb-4">
          {/* Search Row */}
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                placeholder="Search by session code, file number, or department..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 text-sm h-9"
              />
            </div>

            <div className="flex gap-2">
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="bg-slate-800 border-slate-600 text-white text-sm h-9 w-[180px]">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                  <SelectItem value="all" className="text-white text-sm">All Departments</SelectItem>
                  {uniqueDepartments.map(dept => (
                    <SelectItem key={dept.code} value={dept.code} className="text-white text-sm">
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="bg-slate-800 border-slate-600 text-white text-sm h-9 w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                  <SelectItem value="most_recent" className="text-white text-sm">Most Recent</SelectItem>
                  <SelectItem value="oldest" className="text-white text-sm">Oldest</SelectItem>
                  <SelectItem value="highest_progress" className="text-white text-sm">Highest Progress</SelectItem>
                  <SelectItem value="lowest_progress" className="text-white text-sm">Lowest Progress</SelectItem>
                  <SelectItem value="department_az" className="text-white text-sm">Department A–Z</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Status Filter Pills */}
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip 
              label="All" 
              active={statusFilter === "all"} 
              onClick={() => setStatusFilter("all")}
            />
            <StatusChip 
              label="In Progress" 
              active={statusFilter === "in_progress"} 
              onClick={() => setStatusFilter("in_progress")}
            />
            <StatusChip 
              label="Completed" 
              active={statusFilter === "completed"} 
              onClick={() => setStatusFilter("completed")}
            />
            <StatusChip 
              label="Paused" 
              active={statusFilter === "paused"} 
              onClick={() => setStatusFilter("paused")}
            />
            
            {selectedSessions.size > 0 && (
              <>
                <div className="h-4 w-px bg-slate-600 mx-1" />
                <Button
                  onClick={handleBulkDelete}
                  size="sm"
                  variant="destructive"
                  disabled={isBulkDeleting}
                  className={cn(
                    "h-7 px-3 text-xs transition-colors",
                    bulkDeleteConfirm && !isBulkDeleting
                      ? "bg-red-700 hover:bg-red-800 text-white animate-pulse"
                      : "bg-red-600 hover:bg-red-700 text-white"
                  )}
                >
                  {isBulkDeleting ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3 h-3 mr-1.5" />
                      {bulkDeleteConfirm ? 'Confirm Delete' : `Delete ${selectedSessions.size} Selected`}
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>

        {departmentFilter !== "all" && selectedDepartmentName && (
          <div className="mb-3">
            <Badge 
              className="bg-blue-600/20 text-blue-300 border border-blue-500/30 px-3 py-1.5 text-xs cursor-pointer hover:bg-blue-600/30"
              onClick={() => setDepartmentFilter("all")}
            >
              Department: {selectedDepartmentName}
              <X className="w-3 h-3 ml-2" />
            </Badge>
          </div>
        )}

        <div className="space-y-3">
          {isLoading ? (
            <Card className="bg-[#0f1629] border-slate-800/50">
              <CardContent className="p-12 text-center">
                <div className="text-slate-400 text-sm">Loading sessions...</div>
              </CardContent>
            </Card>
          ) : processedSessions.length === 0 ? (
            <Card className="bg-[#0f1629] border-slate-800/50">
              <CardContent className="p-12 text-center space-y-4">
                <p className="text-slate-400 text-sm">
                  {searchTerm || statusFilter !== "all" || departmentFilter !== "all"
                    ? "No sessions match your filters" 
                    : "No interview sessions yet"}
                </p>
                {(searchTerm || statusFilter !== "all" || departmentFilter !== "all") && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchTerm("");
                      setStatusFilter("all");
                      setDepartmentFilter("all");
                    }}
                    size="sm"
                    className="bg-slate-900/50 border-slate-700/50 text-white hover:bg-slate-800/50 text-xs"
                  >
                    Clear Filters
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            processedSessions.map(session => (
              <InterviewSessionCard 
                key={session.id} 
                session={session} 
                departments={departments}
                actualCounts={sessionCounts[session.id]}
                isSelected={selectedSessions.has(session.id)}
                onToggleSelect={() => toggleSessionSelect(session.id)}
                totalActiveQuestions={totalActiveQuestions}
              />
            ))
          )}
        </div>

        <div className="mt-8 text-center">
          <p className="text-slate-500 text-xs">
            © 2025 ClearQuest™ • CJIS Compliant
          </p>
        </div>
      </div>
    </div>
  );
}

function CompactStat({ label, value, color }) {
  const colorClasses = {
    blue: { bg: "bg-slate-900/70", border: "border-slate-800", text: "text-slate-50" },
    orange: { bg: "bg-gradient-to-br from-amber-900/70 to-slate-900/70", border: "border-amber-900", text: "text-slate-50" },
    green: { bg: "bg-gradient-to-br from-emerald-900/70 to-slate-900/70", border: "border-emerald-900", text: "text-slate-50" },
    red: { bg: "bg-gradient-to-br from-red-900/70 to-slate-900/70", border: "border-red-900", text: "text-slate-50" }
  };

  const styles = colorClasses[color] || colorClasses.blue;

  return (
    <div className={cn("rounded-xl border px-3 py-2 flex flex-col justify-between", styles.bg, styles.border)}>
      <div className="text-[11px] font-semibold tracking-wide text-slate-300 uppercase">
        {label}
      </div>
      <div className={cn("text-xl font-semibold", styles.text)}>
        {value}
      </div>
      <div className="text-[10px] text-slate-400">
        {color === 'orange' ? 'active' : color === 'green' ? 'done' : color === 'red' && value > 0 ? 'identified' : 'tracked'}
      </div>
    </div>
  );
}

function StatusChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1 rounded-full text-xs font-medium transition-all border",
        active 
          ? "bg-purple-600/30 text-purple-200 border-purple-500/40" 
          : "bg-slate-800/20 text-slate-400 border-slate-700/40 hover:bg-slate-800/40 hover:border-slate-600"
      )}
    >
      {label}
    </button>
  );
}

function InterviewSessionCard({ session, departments, actualCounts, isSelected, onToggleSelect, totalActiveQuestions }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const department = departments.find(d => d.department_code === session.department_code);
  const departmentName = department?.department_name || session.department_code;

  // Match SessionDetails status config
  const statusConfig = {
    active: { label: "In-Progress", color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
    in_progress: { label: "In-Progress", color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
    completed: { label: "Completed", color: "bg-green-500/20 text-green-300 border-green-500/30" },
    paused: { label: "Paused", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      setTimeout(() => setDeleteConfirm(false), 3000);
      return;
    }

    setIsDeleting(true);
    try {
      const [responses, followups] = await Promise.all([
        base44.entities.Response.filter({ session_id: session.id }),
        base44.entities.FollowUpResponse.filter({ session_id: session.id })
      ]);

      await Promise.all([
        ...responses.map(r => base44.entities.Response.delete(r.id)),
        ...followups.map(f => base44.entities.FollowUpResponse.delete(f.id)),
        base44.entities.InterviewSession.delete(session.id)
      ]);

      toast.success("Session deleted successfully");

      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['all-responses'] });
      queryClient.invalidateQueries({ queryKey: ['all-followups'] });

    } catch (err) {
      toast.error("Failed to delete session");
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['all-responses'] });
      queryClient.invalidateQueries({ queryKey: ['all-followups'] });
    } finally {
      setIsDeleting(false);
      setDeleteConfirm(false);
    }
  };

  const questionsAnswered = actualCounts?.questions || 0;
  const followupsTriggered = actualCounts?.followups || 0;
  const progress = totalActiveQuestions > 0 
    ? Math.round((questionsAnswered / totalActiveQuestions) * 100)
    : 0;

  // Calculate Yes/No counts
  const [yesCount, setYesCount] = useState(0);
  const [noCount, setNoCount] = useState(0);
  
  useEffect(() => {
    const fetchResponseCounts = async () => {
      try {
        const responses = await base44.entities.Response.filter({ session_id: session.id });
        const yes = responses.filter(r => r.answer === 'Yes').length;
        const no = responses.filter(r => r.answer === 'No').length;
        setYesCount(yes);
        setNoCount(no);
      } catch (err) {
        console.error('Error fetching response counts:', err);
      }
    };
    fetchResponseCounts();
  }, [session.id]);

  const redFlagsCount = session.red_flags?.length || 0;

  return (
    <Card className="bg-[#0f1629] border-slate-800/50 hover:border-slate-700 hover:shadow-lg transition-all">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* Left side - Checkbox + Content */}
          <div className="flex items-start gap-3 flex-1">
            <Checkbox 
              checked={isSelected} 
              onCheckedChange={onToggleSelect}
              className="border-slate-600 mt-1"
            />

            <div className="flex-1 space-y-2.5">
              {/* Row 1: Department + Session Code + Status */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-[200px]">
                  <div className="text-xs text-slate-400">
                    {departmentName}
                  </div>
                  <h3 className="text-xl font-semibold text-slate-50">
                    {session.session_code}
                  </h3>
                </div>
                <Badge className={cn("text-xs font-medium px-2.5 py-1 rounded-full border", statusConfig[session.status]?.color)}>
                  {statusConfig[session.status]?.label || session.status}
                </Badge>
              </div>

              {/* Row 2: Meta Info */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                <span>
                  # <span className="font-medium text-slate-200">{session.file_number}</span>
                </span>
                <span>•</span>
                <span>
                  Dept: <span className="font-medium text-slate-200">{session.department_code}</span>
                </span>
                <span>•</span>
                <span>
                  {format(new Date(session.created_date), "MMM d, yyyy")}
                </span>
              </div>

              {/* Row 3: Metrics Strip */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-300">
                <span>
                  <span className="text-slate-400">Questions</span> <span className="font-semibold text-slate-50">{questionsAnswered}/{totalActiveQuestions || 207}</span>
                </span>
                <span className="text-slate-600">•</span>
                <span>
                  <span className="text-slate-400">Yes</span> <span className="font-semibold text-green-400">{yesCount}</span>
                </span>
                <span className="text-slate-600">•</span>
                <span>
                  <span className="text-slate-400">No</span> <span className="font-semibold text-slate-50">{noCount}</span>
                </span>
                <span className="text-slate-600">•</span>
                <span>
                  <span className="text-slate-400">Follow-Ups</span> <span className="font-semibold text-indigo-400">{followupsTriggered}</span>
                </span>
                <span className="text-slate-600">•</span>
                <span>
                  <span className="text-slate-400">Red Flags</span> <span className={cn("font-semibold", redFlagsCount > 0 ? "text-red-400" : "text-slate-50")}>{redFlagsCount}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Right side - Completion + Actions */}
          <div className="flex flex-col items-end gap-2.5 flex-shrink-0">
            <div className="text-right">
              <div className="text-2xl font-bold text-amber-400">{progress}%</div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wide">Complete</div>
            </div>
            <div className="flex flex-row gap-1.5 w-full">
              <Button
                onClick={() => navigate(createPageUrl(`SessionDetails?id=${session.id}`))}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8 flex-1"
              >
                View Interview
              </Button>
              <Button
                onClick={handleDelete}
                size="sm"
                variant="outline"
                disabled={isDeleting}
                className={cn(
                  "text-xs h-8 flex-1 transition-colors",
                  deleteConfirm
                    ? "bg-red-600/20 text-red-300 border-red-600 hover:bg-red-600/30"
                    : "bg-transparent text-slate-400 border-slate-700 hover:bg-slate-800 hover:text-white"
                )}
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  deleteConfirm ? "Confirm" : "Delete"
                )}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}