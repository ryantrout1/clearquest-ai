import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Shield, Building2, Users, CheckCircle, XCircle, Rocket, FileText, Clock, ArrowUpCircle, Search, ArrowLeft, Plus, Trash2, AlertTriangle, TrendingUp, Activity, Target } from "lucide-react";
import { Link } from "react-router-dom";
import { format, differenceInDays } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function SystemAdminDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const adminAuth = sessionStorage.getItem("clearquest_admin_auth");
      if (adminAuth) {
        try {
          const auth = JSON.parse(adminAuth);
          const mockUser = {
            email: `${auth.username.toLowerCase()}@clearquest.ai`,
            first_name: auth.username,
            last_name: "Admin",
            role: "SUPER_ADMIN",
            id: "mock-admin-id"
          };
          setUser(mockUser);
          return;
        } catch (err) {
          console.error("Error parsing admin auth:", err);
        }
      }

      const currentUser = await base44.auth.me();
      if (currentUser.role !== 'SUPER_ADMIN') {
        navigate(createPageUrl("HomeHub"));
        return;
      }
      setUser(currentUser);
    } catch (err) {
      navigate(createPageUrl("AdminLogin"));
    }
  };

  const { data: departments = [], isLoading: departmentsLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: () => base44.entities.Department.list('-created_date'),
    enabled: !!user
  });

  const { data: allSessions = [] } = useQuery({
    queryKey: ['all-sessions'],
    queryFn: () => base44.entities.InterviewSession.list(),
    enabled: !!user
  });

  const { data: allFollowUps = [] } = useQuery({
    queryKey: ['all-followups'],
    queryFn: () => base44.entities.FollowUpResponse.list(),
    enabled: !!user
  });

  const { data: upgradeRequests = [] } = useQuery({
    queryKey: ['upgrade-requests'],
    queryFn: () => base44.entities.UpgradeRequest.filter({ status: 'Open' }),
    enabled: !!user
  });

  // Helper function - defined early so it can be used in useMemo
  const getTrialDaysRemaining = (dept) => {
    if (dept.plan_level !== 'Trial') return null;
    const endDate = dept.trial_ends_at || dept.trial_end_date;
    if (!endDate) return null;
    
    const days = differenceInDays(new Date(endDate), new Date());
    return days > 0 ? days : 0;
  };

  // Enhanced system metrics
  const systemMetrics = useMemo(() => {
    if (!departments.length) return null;

    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const activeDepts = departments.filter(d => !d.is_deleted && !d.deleted_at);
    const activeTrials = activeDepts.filter(d => {
      if (d.plan_level !== 'Trial') return false;
      if (!d.trial_ends_at && !d.trial_end_date) return false;
      const endDate = new Date(d.trial_ends_at || d.trial_end_date);
      return endDate > now;
    });

    const expiringSoon = activeDepts.filter(d => {
      if (d.plan_level !== 'Trial') return false;
      if (!d.trial_ends_at && !d.trial_end_date) return false;
      const endDate = new Date(d.trial_ends_at || d.trial_end_date);
      return endDate > now && endDate <= sevenDaysFromNow;
    });

    const paidDepts = activeDepts.filter(d => d.plan_level === 'Paid');
    const pilotDepts = activeDepts.filter(d => d.plan_level === 'Pilot');
    
    // Calculate conversion rate (trial to paid)
    const totalTrialsEver = departments.filter(d => d.plan_level === 'Trial' || d.plan_level === 'Paid' || d.plan_level === 'Pilot').length;
    const conversionRate = totalTrialsEver > 0 ? Math.round((paidDepts.length / totalTrialsEver) * 100) : 0;

    const completedSessions = allSessions.filter(s => s.status === 'completed');
    const inProgressSessions = allSessions.filter(s => s.status === 'in_progress');
    const recentSessions = allSessions.filter(s => {
      if (!s.created_date) return false;
      return new Date(s.created_date) >= thirtyDaysAgo;
    });

    // Average interviews per active department
    const avgInterviewsPerDept = activeDepts.length > 0 
      ? Math.round(allSessions.length / activeDepts.length) 
      : 0;

    return {
      totalDepartments: activeDepts.length,
      activeTrials: activeTrials.length,
      trialsExpiringSoon: expiringSoon.length,
      paidDepartments: paidDepts.length,
      pilotDepartments: pilotDepts.length,
      conversionRate,
      totalInterviews: allSessions.length,
      completedInterviews: completedSessions.length,
      inProgressInterviews: inProgressSessions.length,
      recentInterviews: recentSessions.length,
      avgInterviewsPerDept,
      completionRate: allSessions.length > 0 ? Math.round((completedSessions.length / allSessions.length) * 100) : 0
    };
  }, [departments, allSessions]);

  // Per-department stats with enhanced metrics
  const departmentStats = useMemo(() => {
    if (!departments.length || !allSessions.length) return {};

    const stats = {};
    
    departments.forEach(dept => {
      const deptSessions = allSessions.filter(s => s.department_code === dept.department_code);
      const completedSessions = deptSessions.filter(s => s.status === 'completed');
      const inProgressSessions = deptSessions.filter(s => s.status === 'in_progress');
      
      const sessionIds = deptSessions.map(s => s.id);
      const deptFollowUps = allFollowUps.filter(f => sessionIds.includes(f.session_id));
      
      // Calculate average completion time
      let avgCompletionMinutes = null;
      if (completedSessions.length > 0) {
        const durationsInMinutes = completedSessions
          .filter(s => s.started_date && s.completed_date)
          .map(s => {
            const start = new Date(s.started_date);
            const end = new Date(s.completed_date);
            return (end - start) / 1000 / 60;
          });
        
        if (durationsInMinutes.length > 0) {
          const sum = durationsInMinutes.reduce((a, b) => a + b, 0);
          avgCompletionMinutes = Math.round(sum / durationsInMinutes.length);
        }
      }
      
      // Last activity
      let lastActivityAt = null;
      if (deptSessions.length > 0) {
        const timestamps = deptSessions
          .map(s => s.updated_date || s.created_date)
          .filter(t => t)
          .map(t => new Date(t));
        
        if (timestamps.length > 0) {
          lastActivityAt = new Date(Math.max(...timestamps));
        }
      }

      // Activity score (0-100 based on recent usage)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recentActivity = deptSessions.filter(s => {
        const created = new Date(s.created_date);
        return created >= thirtyDaysAgo;
      }).length;
      
      const activityScore = Math.min(100, Math.round((recentActivity / 10) * 100));
      
      // Health status
      let healthStatus = 'good';
      if (dept.plan_level === 'Trial') {
        const daysLeft = getTrialDaysRemaining(dept);
        if (daysLeft !== null && daysLeft <= 3) healthStatus = 'critical';
        else if (daysLeft !== null && daysLeft <= 7) healthStatus = 'warning';
      }
      if (inProgressSessions.length > 5) healthStatus = 'active';
      if (deptSessions.length === 0 && dept.plan_level !== 'Trial') healthStatus = 'idle';
      
      stats[dept.id] = {
        interviewsCount: deptSessions.length,
        completedInterviewsCount: completedSessions.length,
        inProgressCount: inProgressSessions.length,
        avgCompletionMinutes,
        followUpsCount: deptFollowUps.length,
        lastActivityAt,
        activityScore,
        healthStatus,
        completionRate: deptSessions.length > 0 ? Math.round((completedSessions.length / deptSessions.length) * 100) : 0
      };
    });
    
    return stats;
  }, [departments, allSessions, allFollowUps]);

  const handleApproveUpgrade = async (request) => {
    try {
      await base44.entities.Department.update(request.department_id, {
        plan_level: request.requested_plan_level,
        activity_log: [`Plan upgraded to ${request.requested_plan_level}`, ...(departments.find(d => d.id === request.department_id)?.activity_log || [])]
      });

      await base44.entities.UpgradeRequest.update(request.id, {
        status: 'Approved',
        resolved_date: new Date().toISOString(),
        resolved_by_user_id: user.id
      });

      queryClient.invalidateQueries({ queryKey: ['departments'] });
      queryClient.invalidateQueries({ queryKey: ['upgrade-requests'] });
      toast.success('Upgrade approved successfully');
    } catch (err) {
      console.error('Error approving upgrade:', err);
      toast.error('Failed to approve upgrade');
    }
  };

  const handleDeclineUpgrade = async (request) => {
    try {
      await base44.entities.UpgradeRequest.update(request.id, {
        status: 'Declined',
        resolved_date: new Date().toISOString(),
        resolved_by_user_id: user.id
      });
      
      queryClient.invalidateQueries({ queryKey: ['upgrade-requests'] });
      toast.success('Upgrade request declined');
    } catch (err) {
      console.error('Error declining upgrade:', err);
      toast.error('Failed to decline upgrade');
    }
  };

  const handleDeleteClick = (dept) => {
    if (dept.plan_level === 'Paid') {
      toast.error('Cannot delete paid departments. Contact support for assistance.');
      return;
    }
    
    if (confirmDeleteId === dept.id) {
      handleDeleteDepartment(dept);
    } else {
      setConfirmDeleteId(dept.id);
      setTimeout(() => {
        setConfirmDeleteId(prevId => prevId === dept.id ? null : prevId);
      }, 5000);
    }
  };

  const handleDeleteDepartment = async (dept) => {
    setIsDeleting(true);
    
    try {
      const deptSessions = allSessions.filter(s => s.department_code === dept.department_code);
      for (const session of deptSessions) {
        try {
          await base44.entities.InterviewSession.delete(session.id);
        } catch (err) {
          console.error(`Error deleting session ${session.id}:`, err);
        }
      }
      
      await base44.entities.Department.delete(dept.id);
      
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
      
      toast.success(`Department "${dept.department_name}" deleted successfully`);
      setConfirmDeleteId(null);
    } catch (err) {
      console.error('Error deleting department:', err);
      toast.error('Failed to delete department. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredDepartments = departments.filter(dept =>
    dept.department_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    dept.department_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    dept.department_code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#0a0f1e]">
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
                <h1 className="text-xl font-semibold text-white">Department Dashboard</h1>
                <span className="text-xs text-slate-400 block mt-0.5">
                  Platform health, department management, and system-wide metrics
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <Link to={createPageUrl("QuestionsManager")}>
                <Button variant="outline" size="sm" className="bg-slate-800/50 border-slate-700/50 text-white hover:bg-slate-800 text-xs hidden md:inline-flex">
                  <FileText className="w-4 h-4 mr-1" />
                  Questions
                </Button>
              </Link>
              <Link to={createPageUrl("BackfillSummaries")}>
                <Button variant="outline" size="sm" className="bg-slate-800/50 border-slate-700/50 text-white hover:bg-slate-800 text-xs hidden md:inline-flex">
                  <Shield className="w-4 h-4 mr-1" />
                  Backfill
                </Button>
              </Link>
              <Link to={createPageUrl("CreateDepartment")}>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-xs">
                  <Plus className="w-4 h-4 mr-1" />
                  <span className="hidden md:inline">New Dept</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto px-4">

        {systemMetrics && (
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-3">
            <MetricCard
              title="Departments"
              value={systemMetrics.totalDepartments}
              subtitle={`${systemMetrics.paidDepartments} paid`}
              icon={Building2}
              color="blue"
            />
            <MetricCard
              title="Active Trials"
              value={systemMetrics.activeTrials}
              subtitle={`${systemMetrics.trialsExpiringSoon} expiring soon`}
              icon={Rocket}
              color="orange"
              alert={systemMetrics.trialsExpiringSoon > 0}
            />
            <MetricCard
              title="Conversion"
              value={`${systemMetrics.conversionRate}%`}
              subtitle="Trial → Paid"
              icon={TrendingUp}
              color="green"
            />
            <MetricCard
              title="Interviews"
              value={systemMetrics.totalInterviews}
              subtitle={`${systemMetrics.inProgressInterviews} active`}
              icon={FileText}
              color="cyan"
            />
            <MetricCard
              title="Completion"
              value={`${systemMetrics.completionRate}%`}
              subtitle={`${systemMetrics.completedInterviews} done`}
              icon={CheckCircle}
              color="green"
            />
            <MetricCard
              title="Avg/Dept"
              value={systemMetrics.avgInterviewsPerDept}
              subtitle="interviews"
              icon={Target}
              color="purple"
            />
          </div>
        )}

        {upgradeRequests.length > 0 && (
          <Card className="bg-[#0f1629] border-slate-800/50 mb-3">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-400" />
                Pending Upgrade Requests ({upgradeRequests.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {upgradeRequests.map(request => {
                const dept = departments.find(d => d.id === request.department_id);
                return (
                  <div key={request.id} className="border border-slate-700 rounded-lg p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-medium text-sm break-words">{dept?.department_name}</h3>
                      <p className="text-slate-400 text-xs">
                        {request.current_plan_level} → {request.requested_plan_level}
                      </p>
                      {request.note && <p className="text-slate-400 text-xs mt-1">{request.note}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-xs h-8"
                        onClick={() => handleApproveUpgrade(request)}
                      >
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-600 text-red-400 hover:bg-red-950/30 text-xs h-8"
                        onClick={() => handleDeclineUpgrade(request)}
                      >
                        <XCircle className="w-3 h-3 mr-1" />
                        Decline
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        <Card className="bg-[#0f1629] border-slate-800/50 mb-3">
          <CardContent className="p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                placeholder="Search departments..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-slate-900/50 border-slate-700/50 text-white placeholder:text-slate-500 text-sm h-9"
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {departmentsLoading ? (
            <Card className="bg-[#0f1629] border-slate-800/50">
              <CardContent className="p-12 text-center">
                <div className="text-slate-400 text-sm">Loading departments...</div>
              </CardContent>
            </Card>
          ) : filteredDepartments.length === 0 ? (
            <Card className="bg-[#0f1629] border-slate-800/50">
              <CardContent className="p-12 text-center">
                <p className="text-slate-400 text-sm">No departments found</p>
              </CardContent>
            </Card>
          ) : (
            filteredDepartments.map(dept => {
              const stats = departmentStats[dept.id] || {};
              const daysRemaining = getTrialDaysRemaining(dept);
              const isInConfirmState = confirmDeleteId === dept.id;
              
              return (
                <Card key={dept.id} className="bg-[#0f1629] border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <CardContent className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                      <div className="md:col-span-4 space-y-2">
                        <div>
                          <h3 className="text-base font-medium text-white mb-1">
                            {dept.department_name}
                          </h3>
                          <div className="space-y-0.5">
                            <p className="text-sm text-slate-400">
                              Code: <span className="text-slate-300 font-mono font-normal">{dept.department_code}</span>
                            </p>
                            {dept.city && dept.state && (
                              <p className="text-sm text-slate-400">
                                Location: <span className="text-slate-300 font-normal">{dept.city}, {dept.state}</span>
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Clock className="w-3 h-3" />
                          <span>
                            {dept.date_joined 
                              ? format(new Date(dept.date_joined), "MMM d, yyyy") 
                              : 'N/A'}
                          </span>
                        </div>
                      </div>

                      <div className="md:col-span-5 grid grid-cols-4 gap-3">
                        <div>
                          <p className="text-xs text-slate-500 mb-1">Interviews</p>
                          <p className="text-xl font-bold text-white">{stats.interviewsCount || 0}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 mb-1">Completed</p>
                          <p className="text-xl font-bold text-white">{stats.completedInterviewsCount || 0}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 mb-1">In Progress</p>
                          <p className={cn("text-xl font-bold", stats.inProgressCount > 0 ? "text-orange-400" : "text-white")}>
                            {stats.inProgressCount || 0}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 mb-1">Follow-Ups</p>
                          <p className="text-xl font-bold text-white">{stats.followUpsCount || 0}</p>
                        </div>
                      </div>

                      <div className="md:col-span-3 flex flex-col justify-between gap-3">
                        <div className="flex justify-end gap-2">
                          <Badge className={cn("text-xs font-medium", getPlanBadgeColor(dept.plan_level))}>
                            {dept.plan_level}
                          </Badge>
                          {daysRemaining !== null && (
                            <Badge className={cn("text-xs font-medium", 
                              daysRemaining <= 3 
                                ? "bg-red-500/20 text-red-300 border-red-500/30" 
                                : "bg-orange-500/20 text-orange-300 border-orange-500/30"
                            )}>
                              {daysRemaining}d left
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-col gap-1.5 items-end">
                          <Link to={createPageUrl(`DepartmentDashboard?id=${dept.id}`)} className="w-32">
                            <Button size="sm" variant="outline" className="w-full bg-slate-800/50 border-slate-700/50 text-white hover:bg-slate-700 text-xs h-8">
                              View
                            </Button>
                          </Link>
                          <Link to={createPageUrl(`EditDepartment?id=${dept.id}`)} className="w-32">
                            <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-700 text-xs h-8">
                              Edit
                            </Button>
                          </Link>
                          <Button 
                            size="sm" 
                            onClick={() => handleDeleteClick(dept)}
                            disabled={dept.plan_level === 'Paid' || isDeleting}
                            className={cn(
                              "text-xs h-8 w-32 transition-colors",
                              dept.plan_level === 'Paid' 
                                ? 'opacity-50 cursor-not-allowed bg-slate-700 text-slate-500' 
                                : isInConfirmState
                                ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                                : 'bg-red-600 hover:bg-red-700 text-white'
                            )}
                            title={dept.plan_level === 'Paid' ? 'Contact support to remove paid departments' : isInConfirmState ? 'Click again to confirm' : 'Delete'}
                          >
                            {isInConfirmState ? 'Confirm Delete' : 'Delete'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
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

function MetricCard({ title, value, subtitle, icon: Icon, color, alert }) {
  const iconColorClasses = {
    blue: "text-blue-400",
    orange: "text-orange-400",
    cyan: "text-cyan-400",
    green: "text-green-400",
    purple: "text-purple-400"
  };

  return (
    <div className={`bg-[#0f1629] border border-slate-800/50 rounded-lg p-4 ${alert ? 'ring-2 ring-orange-500/50' : ''}`}>
      <p className="text-xs text-slate-400 mb-1 uppercase tracking-wide">{title}</p>
      <p className={cn("text-2xl font-bold", iconColorClasses[color])}>{value}</p>
    </div>
  );
}





function getPlanBadgeColor(plan) {
  switch (plan) {
    case 'Trial': return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
    case 'Pilot': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    case 'Paid': return 'bg-green-500/20 text-green-300 border-green-500/30';
    case 'Suspended': return 'bg-red-500/20 text-red-300 border-red-500/30';
    default: return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
  }
}