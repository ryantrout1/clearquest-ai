
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <Link to={createPageUrl("HomeHub")}>
            <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-slate-700 mb-4" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
                <Shield className="w-7 h-7 text-blue-400 flex-shrink-0" />
                <span>System Admin Dashboard</span>
              </h1>
              <p className="text-sm text-slate-300 mt-1">
                Platform health, department management, and system-wide metrics
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to={createPageUrl("QuestionsManager")} className="w-full md:w-auto">
                <Button variant="outline" className="w-full md:w-auto bg-slate-900/50 border-slate-600 text-white hover:bg-slate-700" size="sm">
                  <FileText className="w-4 h-4 mr-2" />
                  Questions
                </Button>
              </Link>
              <Link to={createPageUrl("BackfillSummaries")} className="w-full md:w-auto">
                <Button variant="outline" className="w-full md:w-auto bg-slate-900/50 border-slate-600 text-white hover:bg-slate-700" size="sm">
                  <Shield className="w-4 h-4 mr-2" />
                  Backfill Tool
                </Button>
              </Link>
              <Link to={createPageUrl("CreateDepartment")} className="w-full md:w-auto">
                <Button className="w-full md:w-auto bg-blue-600 hover:bg-blue-700" size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Department
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Key Business Metrics */}
        {systemMetrics && (
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
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

        {/* Upgrade Requests */}
        {upgradeRequests.length > 0 && (
          <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 mb-6">
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

        {/* Departments List */}
        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3">
              <CardTitle className="text-white text-lg">All Departments</CardTitle>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  placeholder="Search departments..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-slate-900/50 border-slate-600 text-white h-9 text-sm"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {departmentsLoading ? (
                <div className="text-center py-8 text-slate-400 text-sm">Loading departments...</div>
              ) : filteredDepartments.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">No departments found</div>
              ) : (
                filteredDepartments.map(dept => {
                  const stats = departmentStats[dept.id] || {};
                  const daysRemaining = getTrialDaysRemaining(dept);
                  const isInConfirmState = confirmDeleteId === dept.id;
                  
                  return (
                    <div
                      key={dept.id}
                      className="border border-slate-700 rounded-lg p-3 hover:border-blue-500/50 transition-colors"
                    >
                      <div className="flex flex-col lg:flex-row gap-3">
                        {/* Left - Department Info */}
                        <div className="flex-1 min-w-0">
                          {/* Header Row */}
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                              <h3 className="text-white font-semibold text-sm break-words">{dept.department_name}</h3>
                              <Badge className={getPlanBadgeColor(dept.plan_level)} variant="outline">
                                {dept.plan_level}
                              </Badge>
                              {daysRemaining !== null && (
                                <Badge variant="outline" className={
                                  daysRemaining <= 3 
                                    ? "border-red-500 text-red-400 bg-red-950/20" 
                                    : "border-orange-500 text-orange-400 bg-orange-950/20"
                                }>
                                  {daysRemaining}d left
                                </Badge>
                              )}
                            </div>
                            <HealthIndicator status={stats.healthStatus} />
                          </div>

                          {/* Department Code & Location */}
                          <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                            <span className="font-mono">{dept.department_code}</span>
                            {dept.city && dept.state && (
                              <>
                                <span>•</span>
                                <span>{dept.city}, {dept.state}</span>
                              </>
                            )}
                          </div>
                          
                          {/* Key Stats Grid */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                            <StatItem label="Interviews" value={stats.interviewsCount || 0} />
                            <StatItem label="Completed" value={stats.completedInterviewsCount || 0} />
                            <StatItem label="In Progress" value={stats.inProgressCount || 0} highlight={stats.inProgressCount > 0} />
                            <StatItem label="Follow-Ups" value={stats.followUpsCount || 0} />
                          </div>

                          {/* Secondary Stats */}
                          <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                            {stats.avgCompletionMinutes && (
                              <span>⏱ {stats.avgCompletionMinutes}m avg</span>
                            )}
                            {stats.completionRate > 0 && (
                              <span>✓ {stats.completionRate}% completion</span>
                            )}
                            {stats.lastActivityAt && (
                              <span>🕐 Last: {format(stats.lastActivityAt, 'MMM d')}</span>
                            )}
                          </div>

                          {/* Contact */}
                          {(dept.contact_name || dept.contact_email) && (
                            <div className="text-xs text-slate-500 mt-2 pt-2 border-t border-slate-700/50">
                              {dept.contact_name && <span>{dept.contact_name}</span>}
                              {dept.contact_email && (
                                <>
                                  {dept.contact_name && <span> • </span>}
                                  <span>{dept.contact_email}</span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                        
                        {/* Right - Actions */}
                        <div className="flex lg:flex-col gap-2 flex-shrink-0">
                          <Link to={createPageUrl(`DepartmentDashboard?id=${dept.id}`)} className="flex-1 lg:flex-none">
                            <Button size="sm" variant="outline" className="w-full bg-slate-900/50 border-slate-600 text-white hover:bg-slate-700 text-xs h-8">
                              View
                            </Button>
                          </Link>
                          <Link to={createPageUrl(`EditDepartment?id=${dept.id}`)} className="flex-1 lg:flex-none">
                            <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-700 text-xs h-8">
                              Edit
                            </Button>
                          </Link>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleDeleteClick(dept)}
                            disabled={dept.plan_level === 'Paid' || isDeleting}
                            className={`flex-1 lg:flex-none text-xs h-8 ${
                              dept.plan_level === 'Paid' 
                                ? 'opacity-50 cursor-not-allowed border-slate-600 text-slate-500' 
                                : isInConfirmState
                                ? 'bg-red-600 text-white hover:bg-red-700 border-red-600 animate-pulse'
                                : 'bg-slate-900/50 border-slate-600 text-slate-300 hover:bg-red-950/30 hover:border-red-600 hover:text-red-400'
                            }`}
                            title={dept.plan_level === 'Paid' ? 'Contact support to remove paid departments' : isInConfirmState ? 'Click again to confirm' : 'Delete'}
                          >
                            <Trash2 className="w-3 h-3 lg:mr-1" />
                            <span className="hidden lg:inline">{isInConfirmState ? 'Confirm' : 'Delete'}</span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ title, value, subtitle, icon: Icon, color, alert }) {
  const colorClasses = {
    blue: "from-blue-500/20 to-blue-600/10 border-blue-500/30",
    orange: "from-orange-500/20 to-orange-600/10 border-orange-500/30",
    cyan: "from-cyan-500/20 to-cyan-600/10 border-cyan-500/30",
    green: "from-green-500/20 to-green-600/10 border-green-500/30",
    purple: "from-purple-500/20 to-purple-600/10 border-purple-500/30"
  };

  const iconColorClasses = {
    blue: "text-blue-400",
    orange: "text-orange-400",
    cyan: "text-cyan-400",
    green: "text-green-400",
    purple: "text-purple-400"
  };

  return (
    <Card className={`relative overflow-hidden bg-gradient-to-br border ${colorClasses[color]} ${alert ? 'ring-2 ring-orange-500/50' : ''}`}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="text-xs text-slate-400">{title}</p>
          <Icon className={`w-4 h-4 flex-shrink-0 ${iconColorClasses[color]}`} />
        </div>
        <p className="text-2xl font-bold text-white mb-0.5">{value}</p>
        <p className="text-xs text-slate-400">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

function StatItem({ label, value, highlight }) {
  return (
    <div className="bg-slate-900/30 rounded px-2 py-1">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-sm font-semibold ${highlight ? 'text-orange-400' : 'text-white'}`}>{value}</p>
    </div>
  );
}

function HealthIndicator({ status }) {
  const config = {
    good: { color: 'bg-green-500', label: 'Healthy' },
    active: { color: 'bg-blue-500', label: 'Active' },
    warning: { color: 'bg-yellow-500', label: 'Warning' },
    critical: { color: 'bg-red-500', label: 'Critical' },
    idle: { color: 'bg-gray-500', label: 'Idle' }
  };

  const statusConfig = config[status] || config.good;

  return (
    <div className="flex items-center gap-1.5" title={statusConfig.label}>
      <div className={`w-2 h-2 rounded-full ${statusConfig.color} animate-pulse`} />
      <span className="text-xs text-slate-400 hidden sm:inline">{statusConfig.label}</span>
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
