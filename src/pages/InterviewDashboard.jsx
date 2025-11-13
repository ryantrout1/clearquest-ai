import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Shield, FileText, Clock, CheckCircle, AlertTriangle, Search, ArrowLeft, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function InterviewDashboard() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [sortBy, setSortBy] = useState("most_recent");
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      // Check for mock admin authentication first
      const adminAuth = sessionStorage.getItem("clearquest_admin_auth");
      if (adminAuth) {
        try {
          const auth = JSON.parse(adminAuth);
          setCurrentUser({
            username: auth.username,
            email: `${auth.username.toLowerCase()}@clearquest.ai`,
            role: "SUPER_ADMIN"
          });
          return;
        } catch (err) {
          console.error("Error parsing admin auth:", err);
        }
      }

      // Otherwise check Base44 authentication
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

  // Filter and sort sessions
  const processedSessions = useMemo(() => {
    // Filter
    let filtered = sessions.filter(session => {
      const matchesSearch = 
        session.session_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        session.department_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        session.file_number?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === "all" || session.status === statusFilter;
      const matchesDepartment = departmentFilter === "all" || session.department_code === departmentFilter;
      
      return matchesSearch && matchesStatus && matchesDepartment;
    });

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "most_recent":
          return new Date(b.created_date) - new Date(a.created_date);
        case "oldest":
          return new Date(a.created_date) - new Date(b.created_date);
        case "highest_progress":
          return (b.completion_percentage || 0) - (a.completion_percentage || 0);
        case "lowest_progress":
          return (a.completion_percentage || 0) - (b.completion_percentage || 0);
        case "department_az":
          return (a.department_code || "").localeCompare(b.department_code || "");
        default:
          return 0;
      }
    });

    return filtered;
  }, [sessions, searchTerm, statusFilter, departmentFilter, sortBy]);

  const stats = {
    total: sessions.length,
    inProgress: sessions.filter(s => s.status === "in_progress").length,
    completed: sessions.filter(s => s.status === "completed").length,
    flagged: sessions.filter(s => s.red_flags?.length > 0).length
  };

  const selectedDepartmentName = uniqueDepartments.find(d => d.code === departmentFilter)?.name;

  if (!currentUser) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Compact Header */}
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

        {/* Compact Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <CompactStat label="Total Sessions" value={stats.total} color="blue" />
          <CompactStat label="In Progress" value={stats.inProgress} color="orange" />
          <CompactStat label="Completed" value={stats.completed} color="green" />
          <CompactStat label="Flagged" value={stats.flagged} color="red" />
        </div>

        {/* Controls Bar */}
        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 mb-4">
          <CardContent className="p-3 md:p-4">
            {/* Search + Department + Sort Row */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-3">
              {/* Search */}
              <div className="md:col-span-5 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  placeholder="Search by session code, file number, or department..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-slate-900/50 border-slate-600 text-white text-sm h-9"
                />
              </div>

              {/* Department Filter */}
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

              {/* Sort By */}
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

            {/* Status Filter Chips */}
            <div className="flex flex-wrap gap-2">
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
            </div>
          </CardContent>
        </Card>

        {/* Department Filter Chip */}
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

        {/* Sessions List */}
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
                <FileText className="w-16 h-16 text-slate-600 mx-auto" />
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
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-slate-500 text-xs">
            © 2025 ClearQuest™ • CJIS Compliant
          </p>
        </div>
      </div>
    </div>
  );
}

// Compact Stat Component
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

// Status Chip Component
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

// Interview Session Card Component
function InterviewSessionCard({ session, departments }) {
  const navigate = useNavigate();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const department = departments.find(d => d.department_code === session.department_code);
  const departmentName = department?.department_name || session.department_code;

  const statusConfig = {
    in_progress: { label: "In Progress", color: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
    completed: { label: "Completed", color: "bg-green-500/20 text-green-300 border-green-500/30" },
    paused: { label: "Paused", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      // Fetch and delete all responses
      const responses = await base44.entities.Response.filter({ session_id: session.id });
      for (const response of responses) {
        await base44.entities.Response.delete(response.id);
      }

      // Fetch and delete all follow-ups
      const followups = await base44.entities.FollowUpResponse.filter({ session_id: session.id });
      for (const followup of followups) {
        await base44.entities.FollowUpResponse.delete(followup.id);
      }

      // Delete the session
      await base44.entities.InterviewSession.delete(session.id);

      toast.success("Session deleted successfully");
      setIsDeleteDialogOpen(false);
      
      // Trigger refetch by reloading (simple approach)
      window.location.reload();
    } catch (err) {
      console.error("Error deleting session:", err);
      toast.error("Failed to delete session");
    } finally {
      setIsDeleting(false);
    }
  };

  const progress = session.completion_percentage || 0;
  const questionsAnswered = session.total_questions_answered || 0;
  const followupsTriggered = session.followups_triggered || 0;

  return (
    <>
      <Card className="bg-slate-800/50 border-slate-700 hover:border-slate-600 transition-colors">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Left Column - Session Info */}
            <div className="md:col-span-5 space-y-2">
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

            {/* Middle Column - Metrics */}
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

            {/* Right Column - Status & Actions */}
            <div className="md:col-span-3 flex flex-col justify-between gap-3">
              <div className="flex justify-end">
                <Badge className={cn("text-xs", statusConfig[session.status]?.color)}>
                  {statusConfig[session.status]?.label}
                </Badge>
              </div>
              <div className="flex flex-col sm:flex-row md:flex-col gap-2">
                <Button
                  onClick={() => navigate(createPageUrl(`SessionDetails?id=${session.id}`))}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm h-9 w-full"
                >
                  View Interview
                </Button>
                <Button
                  onClick={() => setIsDeleteDialogOpen(true)}
                  variant="outline"
                  className="bg-red-950/20 border-red-800/30 text-red-300 hover:bg-red-950/40 hover:text-red-200 text-sm h-9 w-full"
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="bg-slate-800 border-slate-700 max-w-md mx-4">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Interview Session?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-300">
              This will permanently delete session <span className="font-semibold text-white break-all">{session.session_code}</span> and all associated responses. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              disabled={isDeleting}
              className="bg-slate-700 text-white border-slate-600 hover:bg-slate-600"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}