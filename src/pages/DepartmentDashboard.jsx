import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Building2, Users, FileText, Settings, ArrowLeft,
  AlertCircle, Calendar, Shield, TrendingUp, PlayCircle, Download, Mail, Phone, User
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { format, subDays } from "date-fns";

export default function DepartmentDashboard() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const deptId = urlParams.get('id');

  const [user, setUser] = useState(null);
  const [department, setDepartment] = useState(null);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      // Check for mock admin authentication first
      const adminAuth = sessionStorage.getItem("clearquest_admin_auth");
      if (adminAuth) {
        try {
          const auth = JSON.parse(adminAuth);
          // Create mock super admin user
          const mockUser = {
            email: `${auth.username.toLowerCase()}@clearquest.ai`,
            first_name: auth.username,
            last_name: "Admin",
            role: "SUPER_ADMIN",
            id: "mock-admin-id"
          };
          setUser(mockUser);

          // Load department by ID from URL
          if (!deptId) {
            navigate(createPageUrl("SystemAdminDashboard"));
            return;
          }

          const dept = await base44.entities.Department.get(deptId);
          setDepartment(dept);
          return;
        } catch (err) {
          console.error("Error with mock admin auth:", err);
          // If mock auth fails, proceed with regular auth flow
        }
      }

      // Otherwise check Base44 authentication
      const currentUser = await base44.auth.me();
      setUser(currentUser);

      // Load department
      const deptIdToLoad = deptId || currentUser.department_id;
      if (!deptIdToLoad) {
        navigate(createPageUrl("SystemAdminDashboard"));
        return;
      }

      const dept = await base44.entities.Department.get(deptIdToLoad);

      // Check access - users can only see their own department unless super admin
      if (currentUser.role !== 'SUPER_ADMIN' && dept.id !== currentUser.department_id) {
        navigate(createPageUrl("SystemAdminDashboard"));
        return;
      }

      setDepartment(dept);
    } catch (err) {
      console.error("Error loading data:", err);
      navigate(createPageUrl("AdminLogin"));
    }
  };

  // Fetch department users
  const { data: departmentUsers = [] } = useQuery({
    queryKey: ['department-users', department?.id],
    queryFn: () => base44.entities.DepartmentUser.filter({ department_id: department.id }),
    enabled: !!department
  });

  // Fetch all sessions for this department
  const { data: allSessions = [] } = useQuery({
    queryKey: ['department-sessions', department?.department_code],
    queryFn: () => base44.entities.InterviewSession.filter({ department_code: department.department_code }),
    enabled: !!department?.department_code
  });

  // Fetch all responses for this department
  const { data: allResponses = [] } = useQuery({
    queryKey: ['department-responses', department?.department_code],
    queryFn: async () => {
      const sessions = await base44.entities.InterviewSession.filter({ department_code: department.department_code });
      const sessionIds = sessions.map(s => s.id);

      // Fetch responses for all sessions
      const responsePromises = sessionIds.map(id =>
        base44.entities.Response.filter({ session_id: id })
      );
      const responsesArrays = await Promise.all(responsePromises);
      return responsesArrays.flat();
    },
    enabled: !!department?.department_code
  });

  // Computed metrics
  const metrics = React.useMemo(() => {
    if (!allSessions.length) {
      return {
        openInterviews: 0,
        completed7d: 0,
        avgCompletion: 0,
        followupsPending: 0
      };
    }

    const sevenDaysAgo = subDays(new Date(), 7);

    const openInterviews = allSessions.filter(s => s.status === 'in_progress' || s.status === 'active').length;

    const completed7d = allSessions.filter(s => {
      if (s.status !== 'completed') return false;
      const updatedDate = new Date(s.updated_date || s.completed_date);
      return updatedDate >= sevenDaysAgo;
    }).length;

    const completionPercentages = allSessions
      .filter(s => s.completion_percentage != null)
      .map(s => s.completion_percentage);
    const avgCompletion = completionPercentages.length > 0
      ? Math.round(completionPercentages.reduce((a, b) => a + b, 0) / completionPercentages.length)
      : 0;

    const followupsPending = allResponses.filter(r => r.triggered_followup && !r.is_flagged).length;

    return {
      openInterviews,
      completed7d,
      avgCompletion,
      followupsPending
    };
  }, [allSessions, allResponses]);

  // Compute department risk level
  const deptRiskLevel = React.useMemo(() => {
    const riskCounts = allSessions.reduce((acc, s) => {
      if (s.risk_rating) {
        acc[s.risk_rating] = (acc[s.risk_rating] || 0) + 1;
      }
      return acc;
    }, {});

    if (riskCounts.elevated > 0) return 'High';
    if (riskCounts.moderate > 2) return 'Medium';
    return 'Low';
  }, [allSessions]);

  if (!user || !department) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-slate-300">Loading...</div>
      </div>
    );
  }

  const isDeptAdmin = user.role === 'DEPT_ADMIN';
  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  const canEdit = isDeptAdmin || isSuperAdmin;

  // Check trial status
  const isTrialExpiring = department.plan_level === 'Trial' && department.trial_end_date;
  const daysUntilExpiry = isTrialExpiring
    ? Math.ceil((new Date(department.trial_end_date) - new Date()) / (1000 * 60 * 60 * 24))
    : null;

  // Format full address
  const fullAddress = [
    department.address_line1,
    department.address_line2,
    [department.city, department.state].filter(Boolean).join(', '),
    department.zip_code
  ].filter(Boolean).join('\n');

  // Get initials for avatar
  const getInitials = (name) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  // Get primary contact
  const primaryContact = departmentUsers.find(u => u.is_primary) || departmentUsers[0];
  const additionalContacts = departmentUsers.filter(u => !u.is_primary && u.id !== primaryContact?.id);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Back Button - Fixed to go to SystemAdminDashboard */}
        <div className="mb-4">
          <Link to={createPageUrl("SystemAdminDashboard")}>
            <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-slate-700">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to System Admin Dashboard
            </Button>
          </Link>
        </div>

        {/* Unified Header Card - Three Rows (SessionDetails Style) */}
        <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950/90 via-slate-950/70 to-slate-900/70 px-5 py-4 space-y-4 mb-4">
          {/* Row 1 – Department Name + Status Badge */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-slate-50">
                {department.department_name}
              </h1>
              <Badge className={cn(
                "text-xs px-2.5 py-1 rounded-full border transition-all font-medium",
                department.active_status === 'Active' 
                  ? "bg-green-500/20 text-green-300 border-green-500/30"
                  : "bg-red-500/20 text-red-300 border-red-500/30"
              )}>
                {department.active_status || 'Active'}
              </Badge>
              <Badge className={cn(
                "text-xs px-2.5 py-1 rounded-full border transition-all font-medium",
                deptRiskLevel === 'Low' && "bg-green-500/20 text-green-300 border-green-500/30",
                deptRiskLevel === 'Medium' && "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
                deptRiskLevel === 'High' && "bg-red-500/20 text-red-300 border-red-500/30"
              )}>
                {deptRiskLevel} Risk
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
              <span>
                Code: <span className="font-medium text-slate-200">{department.department_code}</span>
              </span>
              <span>•</span>
              <span>
                Tier: <span className="font-medium text-slate-200">{department.plan_level}</span>
              </span>
              {department.phone_number && (
                <>
                  <span>•</span>
                  <span>{department.phone_number}</span>
                </>
              )}
              {department.contact_email && (
                <>
                  <span>•</span>
                  <span>{department.contact_email}</span>
                </>
              )}
            </div>
          </div>

          {/* Row 2 – Metric Tiles */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="rounded-xl bg-slate-900/70 border border-slate-800 px-3 py-2 flex flex-col justify-between">
              <div className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
                Open
              </div>
              <div className="text-xl font-semibold text-slate-50">
                {metrics.openInterviews}
              </div>
              <div className="text-[10px] text-slate-500">
                in progress
              </div>
            </div>

            <div className="rounded-xl bg-gradient-to-br from-emerald-900/70 to-slate-900/70 border border-emerald-900 px-3 py-2 flex flex-col justify-between">
              <div className="text-[11px] font-semibold tracking-wide text-slate-300 uppercase">
                Completed
              </div>
              <div className="text-xl font-semibold text-slate-50">
                {metrics.completed7d}
              </div>
              <div className="text-[10px] text-slate-400">
                last 7 days
              </div>
            </div>

            <div className="rounded-xl bg-gradient-to-br from-indigo-900/70 to-slate-900/70 border border-indigo-900 px-3 py-2 flex flex-col justify-between">
              <div className="text-[11px] font-semibold tracking-wide text-slate-300 uppercase">
                Avg Complete
              </div>
              <div className="text-xl font-semibold text-slate-50">
                {metrics.avgCompletion}%
              </div>
              <div className="text-[10px] text-slate-400">
                completion
              </div>
            </div>

            <div className="rounded-xl bg-gradient-to-br from-amber-900/70 to-slate-900/70 border border-amber-900 px-3 py-2 flex flex-col justify-between">
              <div className="text-[11px] font-semibold tracking-wide text-slate-300 uppercase">
                Follow-Ups
              </div>
              <div className="text-xl font-semibold text-slate-50">
                {metrics.followupsPending}
              </div>
              <div className="text-[10px] text-slate-400">
                pending
              </div>
            </div>

            <div className="rounded-xl bg-gradient-to-br from-blue-900/70 to-slate-900/70 border border-blue-900 px-3 py-2 flex flex-col justify-between">
              <div className="text-[11px] font-semibold tracking-wide text-slate-300 uppercase">
                Total Users
              </div>
              <div className="text-xl font-semibold text-slate-50">
                {departmentUsers.length}
              </div>
              <div className="text-[10px] text-slate-400">
                contacts
              </div>
            </div>

            <div className="rounded-xl bg-gradient-to-br from-purple-900/70 to-slate-900/70 border border-purple-900 px-3 py-2 flex flex-col justify-between">
              <div className="text-[11px] font-semibold tracking-wide text-slate-300 uppercase">
                Retention
              </div>
              <div className="text-xl font-semibold text-slate-50">
                {department.retention_period}d
              </div>
              <div className="text-[10px] text-slate-400">
                data kept
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-slate-800/80" />

          {/* Row 3 – Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 justify-start">
            <Link to={createPageUrl("InterviewDashboard")}>
              <Button variant="outline" size="sm" className="bg-slate-800 border-slate-600 text-white hover:bg-slate-700 h-9 text-sm">
                <FileText className="w-4 h-4 mr-2" />
                View Interviews
              </Button>
            </Link>

            {canEdit && (
              <Link to={createPageUrl(`EditDepartment?id=${department.id}`)}>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white h-9 text-sm">
                  <Settings className="w-4 h-4 mr-2" />
                  Edit Department
                </Button>
              </Link>
            )}

            <Link to={createPageUrl(`ManageDepartmentUsers?id=${department.id}`)}>
              <Button variant="outline" size="sm" className="bg-slate-800 border-slate-600 text-white hover:bg-slate-700 h-9 text-sm">
                <Users className="w-4 h-4 mr-2" />
                Manage Contacts
              </Button>
            </Link>
          </div>
        </div>

        {/* Trial Expiring Warning */}
        {isTrialExpiring && daysUntilExpiry <= 7 && (
          <Alert className="mb-6 bg-orange-950/20 border-orange-800/50 text-orange-200">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              <strong>Trial Ending Soon:</strong> Your trial expires in {daysUntilExpiry} days.
              {isDeptAdmin && " Contact support to upgrade your plan."}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid md:grid-cols-2 gap-4 md:gap-6">
          {/* In-Progress Interviews Section - Scrollable */}
          {(
            <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 md:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white text-lg flex items-center gap-2">
                    <PlayCircle className="w-5 h-5 text-orange-400" />
                    In-Progress Interviews ({metrics.openInterviews})
                  </CardTitle>
                  <Link to={createPageUrl("InterviewDashboard")}>
                    <Button size="sm" variant="outline" className="bg-slate-900/50 border-slate-600 text-white hover:bg-slate-700 text-xs">
                      View All
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {allSessions.filter(s => s.status === 'in_progress' || s.status === 'active').length === 0 ? (
                  <p className="text-slate-400 text-sm text-center py-6">No in-progress interviews</p>
                ) : (
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin', scrollbarColor: '#475569 #1e293b' }}>
                    {allSessions
                      .filter(s => s.status === 'in_progress' || s.status === 'active')
                      .map(session => {
                        const sessionResponses = allResponses.filter(r => r.session_id === session.id);
                        const questionsAnswered = sessionResponses.length;
                        const followupsCount = sessionResponses.filter(r => r.triggered_followup).length;
                        const completionPercentage = Math.round((questionsAnswered / 207) * 100);

                        const yesCount = sessionResponses.filter(r => r.answer === 'Yes').length;
                        const noCount = sessionResponses.filter(r => r.answer === 'No').length;
                        const redFlagsCount = session.red_flags?.length || 0;
                      
                      return (
                        <Card key={session.id} className="bg-[#0f1629] border-slate-800/50 hover:border-slate-700 hover:shadow-lg transition-all">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-4">
                              {/* Left side - Content */}
                              <div className="flex-1 space-y-2.5">
                                {/* Row 1: Department + Session Code + Status */}
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="flex-1 min-w-[200px]">
                                    <div className="text-xs text-slate-400">
                                      {department.department_name}
                                    </div>
                                    <h3 className="text-xl font-semibold text-slate-50">
                                      {session.session_code}
                                    </h3>
                                  </div>
                                  <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30 text-xs font-medium px-2.5 py-1 rounded-full border">
                                    In-Progress
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
                                    <span className="text-slate-400">Questions</span> <span className="font-semibold text-slate-50">{questionsAnswered}/207</span>
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
                                    <span className="text-slate-400">Follow-Ups</span> <span className="font-semibold text-indigo-400">{followupsCount}</span>
                                  </span>
                                  <span className="text-slate-600">•</span>
                                  <span>
                                    <span className="text-slate-400">Red Flags</span> <span className={cn("font-semibold", redFlagsCount > 0 ? "text-red-400" : "text-slate-50")}>{redFlagsCount}</span>
                                  </span>
                                </div>
                              </div>

                              {/* Right side - Completion + Actions */}
                              <div className="flex flex-col items-end gap-2.5 flex-shrink-0">
                                <div className="text-right">
                                  <div className="text-2xl font-bold text-amber-400">{completionPercentage}%</div>
                                  <div className="text-[10px] text-slate-400 uppercase tracking-wide">Complete</div>
                                </div>
                                <div className="flex flex-row gap-1.5 w-full">
                                  <Link to={createPageUrl(`SessionDetails?id=${session.id}`)}>
                                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8">
                                      View Interview
                                    </Button>
                                  </Link>
                                  <Button
                                    onClick={(e) => {
                                      e.preventDefault();
                                      alert('Delete functionality coming soon');
                                    }}
                                    size="sm"
                                    variant="outline"
                                    className="bg-transparent text-slate-400 border-slate-700 hover:bg-slate-800 hover:text-white text-xs h-8"
                                  >
                                    Delete
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Completed Interviews Section */}
          <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 md:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-white text-lg flex items-center gap-2">
                  <FileText className="w-5 h-5 text-green-400" />
                  Completed Interviews ({allSessions.filter(s => s.status === 'completed').length})
                </CardTitle>
                <Link to={createPageUrl("InterviewDashboard")}>
                  <Button size="sm" variant="outline" className="bg-slate-900/50 border-slate-600 text-white hover:bg-slate-700 text-xs">
                    View All
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {allSessions.filter(s => s.status === 'completed').length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-6">No completed interviews yet</p>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin', scrollbarColor: '#475569 #1e293b' }}>
                  {allSessions
                    .filter(s => s.status === 'completed')
                    .sort((a, b) => new Date(b.completed_date || b.updated_date) - new Date(a.completed_date || a.updated_date))
                    .map(session => {
                      const sessionResponses = allResponses.filter(r => r.session_id === session.id);
                      const questionsAnswered = sessionResponses.length;
                      const followupsCount = sessionResponses.filter(r => r.triggered_followup).length;
                      const completionPercentage = Math.round((questionsAnswered / 207) * 100);

                      const yesCount = sessionResponses.filter(r => r.answer === 'Yes').length;
                      const noCount = sessionResponses.filter(r => r.answer === 'No').length;
                      const redFlagsCount = session.red_flags?.length || 0;
                      
                      return (
                        <Card key={session.id} className="bg-[#0f1629] border-slate-800/50 hover:border-slate-700 hover:shadow-lg transition-all">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-4">
                              {/* Left side - Content */}
                              <div className="flex-1 space-y-2.5">
                                {/* Row 1: Department + Session Code + Status */}
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="flex-1 min-w-[200px]">
                                    <div className="text-xs text-slate-400">
                                      {department.department_name}
                                    </div>
                                    <h3 className="text-xl font-semibold text-slate-50">
                                      {session.session_code}
                                    </h3>
                                  </div>
                                  <Badge className="bg-green-500/20 text-green-300 border-green-500/30 text-xs font-medium px-2.5 py-1 rounded-full border">
                                    Completed
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
                                    <span className="text-slate-400">Questions</span> <span className="font-semibold text-slate-50">{questionsAnswered}/207</span>
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
                                    <span className="text-slate-400">Follow-Ups</span> <span className="font-semibold text-indigo-400">{followupsCount}</span>
                                  </span>
                                  <span className="text-slate-600">•</span>
                                  <span>
                                    <span className="text-slate-400">Red Flags</span> <span className={cn("font-semibold", redFlagsCount > 0 ? "text-red-400" : "text-slate-50")}>{redFlagsCount}</span>
                                  </span>
                                </div>
                              </div>

                              {/* Right side - Completion + Actions */}
                              <div className="flex flex-col items-end gap-2.5 flex-shrink-0">
                                <div className="text-right">
                                  <div className="text-2xl font-bold text-amber-400">{completionPercentage}%</div>
                                  <div className="text-[10px] text-slate-400 uppercase tracking-wide">Complete</div>
                                </div>
                                <div className="flex flex-row gap-1.5 w-full">
                                  <Link to={createPageUrl(`SessionDetails?id=${session.id}`)}>
                                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8">
                                      View Interview
                                    </Button>
                                  </Link>
                                  <Button
                                    onClick={(e) => {
                                      e.preventDefault();
                                      alert('Delete functionality coming soon');
                                    }}
                                    size="sm"
                                    variant="outline"
                                    className="bg-transparent text-slate-400 border-slate-700 hover:bg-slate-800 hover:text-white text-xs h-8"
                                  >
                                    Delete
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Department Info */}
          <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-lg">Department Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InfoRow label="Department Code" value={department.department_code} />
              <InfoRow label="Department ID" value={department.department_id} />
              <InfoRow label="Jurisdiction" value={department.jurisdiction} />
              <InfoRow label="Address" value={fullAddress} multiline />
              <InfoRow label="Phone" value={department.phone_number} />
              <InfoRow label="Website" value={department.website_url} link />
              {/* Keeping department.contact_name/email for now, but these should be phased out if DepartmentUser is canonical */}
              {department.contact_name && department.contact_email && (
                <InfoRow label="Contact" value={`${department.contact_name} (${department.contact_email})`} />
              )}
            </CardContent>
          </Card>

          {/* Security Settings */}
          <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-400" />
                Security & Compliance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InfoRow
                label="CJIS Compliance"
                value={department.cjis_compliance ? "Enabled" : "Disabled"}
                badge={department.cjis_compliance ? "success" : "warning"}
              />
              <InfoRow
                label="Anonymity Mode"
                value={department.anonymity_mode ? "Enabled" : "Disabled"}
                badge={department.anonymity_mode ? "success" : "warning"}
              />
              <InfoRow label="Data Sharing" value={department.data_sharing_level} />
              <InfoRow label="Backup Frequency" value={department.backup_frequency} />
              <InfoRow label="Retention Period" value={`${department.retention_period} days`} />
            </CardContent>
          </Card>

          {/* Department Users - NEW IMPLEMENTATION */}
          <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-white text-lg">Department Users</CardTitle>
                <Link to={createPageUrl(`ManageDepartmentUsers?id=${department.id}`)}>
                  <Button size="sm" variant="outline" className="bg-slate-900/50 border-slate-600 text-white hover:bg-slate-700 text-xs">
                    Manage Contacts
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {departmentUsers.length === 0 ? (
                <div className="text-center py-6">
                  <AlertCircle className="w-12 h-12 text-orange-400 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm mb-4">
                    No contacts are on file for this department. Please add at least one contact in Department Contacts.
                  </p>
                  <Link to={createPageUrl(`ManageDepartmentUsers?id=${department.id}`)}>
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                      Manage Contacts
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Primary Contact */}
                  {primaryContact && (
                    <div className="p-4 rounded-lg bg-slate-900/30 border border-blue-500/30">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                            <User className="w-5 h-5 text-blue-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-white font-medium text-sm break-words">
                                {primaryContact.full_name}
                                {primaryContact.title && <span className="text-slate-400 font-normal"> — {primaryContact.title}</span>}
                              </p>
                            </div>
                            <div className="flex flex-col gap-1 text-xs text-slate-400">
                              <a
                                href={`mailto:${primaryContact.email}`}
                                className="hover:text-blue-400 transition-colors flex items-center gap-1.5"
                              >
                                <Mail className="w-3 h-3" />
                                {primaryContact.email}
                              </a>
                              <a
                                href={`tel:${primaryContact.phone}`}
                                className="hover:text-blue-400 transition-colors flex items-center gap-1.5"
                              >
                                <Phone className="w-3 h-3" />
                                {primaryContact.phone}
                              </a>
                            </div>
                          </div>
                        </div>
                        <Badge className="bg-blue-600/20 text-blue-300 border-blue-500/30 text-xs whitespace-nowrap flex-shrink-0">
                          Primary Contact
                        </Badge>
                      </div>
                    </div>
                  )}

                  {/* Additional Contacts */}
                  {additionalContacts.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-400 mb-2">Additional Contacts</p>
                      <div className="space-y-2">
                        {additionalContacts.map(contact => (
                          <div key={contact.id} className="p-3 rounded-lg bg-slate-900/20 border border-slate-700">
                            <div className="flex items-start gap-2">
                              <User className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-white text-sm break-words">
                                  {contact.full_name}
                                  {contact.title && <span className="text-slate-400"> — {contact.title}</span>}
                                </p>
                                <div className="flex flex-col gap-0.5 text-xs text-slate-400 mt-1">
                                  <span>{contact.email}</span>
                                  <span>{contact.phone}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Activity Log */}
          <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-lg">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {!department.activity_log || department.activity_log.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-4">No activity yet</p>
              ) : (
                <div className="space-y-2">
                  {department.activity_log.slice(0, 10).map((activity, idx) => (
                    <div key={idx} className="text-xs md:text-sm text-slate-300 flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 flex-shrink-0" />
                      <span className="break-words">{activity}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-slate-500 text-xs">
            © 2025 ClearQuest AI™ • CJIS Compliant
          </p>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color }) {
  const colorClasses = {
    blue: "from-blue-500/20 to-blue-600/10 border-blue-500/30 text-blue-400",
    green: "from-green-500/20 to-green-600/10 border-green-500/30 text-green-400",
    purple: "from-purple-500/20 to-purple-600/10 border-purple-500/30 text-purple-400",
    orange: "from-orange-500/20 to-orange-600/10 border-orange-500/30 text-orange-400"
  };

  return (
    <Card className={`relative overflow-hidden bg-gradient-to-br border ${colorClasses[color]}`}>
      <CardContent className="p-4 md:p-6">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs md:text-sm text-slate-400 truncate">{title}</p>
            <p className="text-2xl md:text-3xl font-bold text-white mt-1">{value}</p>
          </div>
          <Icon className="w-5 h-5 md:w-6 md:h-6 flex-shrink-0 ml-2" />
        </div>
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value, badge, link, multiline }) {
  if (!value) return null;

  return (
    <div className="flex justify-between items-start gap-2">
      <span className="text-slate-400 flex-shrink-0">{label}</span>
      {badge ? (
        <Badge className={badge === 'success' ? 'bg-green-500/20 text-green-300' : 'bg-orange-500/20 text-orange-300'}>
          {value}
        </Badge>
      ) : link && value ? (
        <a href={value} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 text-right truncate min-w-0 flex-1">
          {value}
        </a>
      ) : multiline ? (
        <span className="text-white text-right whitespace-pre-line min-w-0 flex-1">{value}</span>
      ) : (
        <span className="text-white text-right break-words min-w-0 flex-1">{value}</span>
      )}
    </div>
  );
}