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
import { Clock, Search, ArrowLeft, X, Trash2, Loader2 } from "lucide-react";
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
      for (const sessionId of sessionsToDelete) {
        const responses = await base44.entities.Response.filter({ session_id: sessionId });
        for (const response of responses) {
          await base44.entities.Response.delete(response.id);
        }

        const followups = await base44.entities.FollowUpResponse.filter({ session_id: sessionId });
        for (const followup of followups) {
          await base44.entities.FollowUpResponse.delete(followup.id);
        }

        await base44.entities.InterviewSession.delete(sessionId);
      }

      queryClient.setQueryData(['sessions'], (oldSessions) => 
        oldSessions.filter(s => !sessionsToDelete.includes(s.id))
      );
      queryClient.setQueryData(['all-responses'], (oldResponses) =>
        oldResponses.filter(r => !sessionsToDelete.includes(r.session_id))
      );
      queryClient.setQueryData(['all-followups'], (oldFollowups) =>
        oldFollowups.filter(f => !sessionsToDelete.includes(f.session_id))
      );

      toast.success(`Deleted ${sessionsToDelete.length} session${sessionsToDelete.length > 1 ? 's' : ''}`);
      setSelectedSessions(new Set());
      setBulkDeleteConfirm(false);
      
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4">
          <Link to={createPageUrl("HomeHub")}>
            <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-slate-700 mb-3" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>
          
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-white">Interview Dashboard</h1>
              <p className="text-xs md:text-sm text-slate-400 mt-1">
                Monitor and manage interview sessions • Logged in as {currentUser.username}
              </p>
            </div>
            <Button 
              variant="outline" 
              onClick={handleLogout}
              size="sm"
              className="w-full sm:w-auto bg-slate-800/50 border-slate-600 text-white hover:bg-slate-700"
            >
              Logout
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <CompactStat label="Total Sessions" value={stats.total} color="blue" />
          <CompactStat label="In Progress" value={stats.inProgress} color="orange" />
          <CompactStat label="Completed" value={stats.completed} color="green" />
          <CompactStat label="Flagged" value={stats.flagged} color="red" />
        </div>

        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 mb-4">
          <CardContent className="p-3 md:p-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-3">
              <div className="md:col-span-5 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  placeholder="Search by session code, file number, or department..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-slate-900/50 border-slate-600 text-white text-sm h-9"
                />
              </div>

              <div className="md:col-span-4">
                <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                  <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white text-sm h-9 w-full">
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
              </div>

              <div className="md:col-span-3">
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white text-sm h-9 w-full">
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
          </CardContent>
        </Card>

        {departmentFilter !== "all" && selectedDepartmentName && (
          <div className="mb-4">
            <Badge 
              className="bg-blue-600/20 text-blue-300 border-blue-500/30 px-3 py-1.5 text-sm cursor-pointer hover:bg-blue-600/30"
              onClick={() => setDepartmentFilter("all")}
            >
              Department: {selectedDepartmentName}
              <X className="w-3 h-3 ml-2" />
            </Badge>
          </div>
        )}

        <div className="space-y-3">
          {isLoading ? (
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-12 text-center">
                <div className="text-slate-400">Loading sessions...</div>
              </CardContent>
            </Card>
          ) : processedSessions.length === 0 ? (
            <Card className="bg-slate-800/50 border-slate-700">
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
                    className="bg-slate-900/50 border-slate-600 text-white hover:bg-slate-800"
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
    blue: "text-blue-400",
    orange: "text-orange-400",
    green: "text-green-400",
    red: "text-red-400"
  };

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className={cn("text-2xl font-bold", colorClasses[color])}>{value}</p>
    </div>
  );
}

function StatusChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1 rounded-full text-xs font-medium transition-colors",
        active 
          ? "bg-blue-600 text-white" 
          : "bg-slate-700/50 text-slate-300 hover:bg-slate-700"
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

  const statusConfig = {
    in_progress: { label: "In Progress", color: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
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
      const responses = await base44.entities.Response.filter({ session_id: session.id });
      for (const response of responses) {
        await base44.entities.Response.delete(response.id);
      }

      const followups = await base44.entities.FollowUpResponse.filter({ session_id: session.id });
      for (const followup of followups) {
        await base44.entities.FollowUpResponse.delete(followup.id);
      }

      await base44.entities.InterviewSession.delete(session.id);

      queryClient.setQueryData(['sessions'], (oldSessions) => 
        oldSessions.filter(s => s.id !== session.id)
      );
      queryClient.setQueryData(['all-responses'], (oldResponses) =>
        oldResponses.filter(r => r.session_id !== session.id)
      );
      queryClient.setQueryData(['all-followups'], (oldFollowups) =>
        oldFollowups.filter(f => f.session_id !== session.id)
      );

      toast.success("Session deleted successfully");
      
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

  return (
    <Card className="bg-slate-800/50 border-slate-700 hover:border-slate-600 transition-colors">
      <CardContent className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-1 flex items-center justify-center">
            <Checkbox 
              checked={isSelected} 
              onCheckedChange={onToggleSelect}
              className="border-slate-400 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
            />
          </div>

          <div className="md:col-span-4 space-y-2">
            <div>
              <h3 className="text-lg font-bold text-white mb-1">
                {session.session_code}
              </h3>
              <div className="space-y-0.5">
                <p className="text-sm text-slate-400">
                  Department: <span className="text-slate-300">{departmentName}</span>
                  {session.department_code !== departmentName && (
                    <span className="text-slate-500"> ({session.department_code})</span>
                  )}
                </p>
                <p className="text-sm text-slate-400">
                  File: <span className="text-slate-300 font-mono">{session.file_number}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Clock className="w-3 h-3" />
              <span>{format(new Date(session.created_date), "MMM d, yyyy 'at' h:mm a")}</span>
            </div>
          </div>

          <div className="md:col-span-4 grid grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-slate-500 mb-1">Progress</p>
              <p className="text-xl font-bold text-blue-400">{progress}%</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Questions</p>
              <p className="text-xl font-bold text-white">{questionsAnswered}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Follow-Ups</p>
              <p className="text-xl font-bold text-white">{followupsTriggered}</p>
            </div>
          </div>

          <div className="md:col-span-3 flex flex-col justify-between gap-3">
            <div className="flex justify-end">
              <Badge className={cn("text-xs", statusConfig[session.status]?.color)}>
                {statusConfig[session.status]?.label}
              </Badge>
            </div>
            <div className="flex flex-col gap-1.5 items-end">
              <Button
                onClick={() => navigate(createPageUrl(`SessionDetails?id=${session.id}`))}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-7 w-32"
              >
                View Interview
              </Button>
              <Button
                onClick={handleDelete}
                variant="outline"
                size="sm"
                disabled={isDeleting}
                className={cn(
                  "text-xs h-7 w-32 transition-colors",
                  deleteConfirm
                    ? "bg-red-600 hover:bg-red-700 text-white border-red-600"
                    : "bg-red-950/20 border-red-800/30 text-red-300 hover:bg-red-950/40 hover:text-red-200"
                )}
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  deleteConfirm ? "Confirm Delete" : "Delete"
                )}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}