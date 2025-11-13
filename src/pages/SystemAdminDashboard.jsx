import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Shield, Building2, Users, CheckCircle, XCircle, Rocket, FileText, Clock, ArrowUpCircle, Search, ArrowLeft, Plus, Trash2, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { format, differenceInDays } from "date-fns";
import { toast } from "sonner";

export default function SystemAdminDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [systemMetrics, setSystemMetrics] = useState({
    totalDepartments: 0,
    activeTrials: 0,
    trialsExpiringSoon: 0,
    totalInterviewsStarted: 0,
    totalInterviewsCompleted: 0,
    followUpsTriggeredLast30Days: 0
  });
  const [departmentStats, setDepartmentStats] = useState({});
  const [confirmDeleteId, setConfirmDeleteId] = useState(null); // Track which dept is in confirm state
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

  // Calculate system-wide metrics
  useEffect(() => {
    if (!departments.length || !allSessions.length) return;

    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Active departments (not deleted)
    const activeDepts = departments.filter(d => !d.is_deleted && !d.deleted_at);

    // Active trials (trial_ends_at in future)
    const activeTrials = activeDepts.filter(d => {
      if (d.plan_level !== 'Trial') return false;
      if (!d.trial_ends_at && !d.trial_end_date) return false;
      const endDate = new Date(d.trial_ends_at || d.trial_end_date);
      return endDate > now;
    });

    // Trials expiring soon (within 7 days)
    const expiringSoon = activeDepts.filter(d => {
      if (d.plan_level !== 'Trial') return false;
      if (!d.trial_ends_at && !d.trial_end_date) return false;
      const endDate = new Date(d.trial_ends_at || d.trial_end_date);
      return endDate > now && endDate <= sevenDaysFromNow;
    });

    // Interview stats
    const completedSessions = allSessions.filter(s => s.status === 'completed');

    // Follow-ups in last 30 days
    const recentFollowUps = allFollowUps.filter(f => {
      if (!f.created_date) return false;
      return new Date(f.created_date) >= thirtyDaysAgo;
    });

    setSystemMetrics({
      totalDepartments: activeDepts.length,
      activeTrials: activeTrials.length,
      trialsExpiringSoon: expiringSoon.length,
      totalInterviewsStarted: allSessions.length,
      totalInterviewsCompleted: completedSessions.length,
      followUpsTriggeredLast30Days: recentFollowUps.length
    });
  }, [departments, allSessions, allFollowUps]);

  // Calculate per-department stats
  useEffect(() => {
    if (!departments.length || !allSessions.length) return;

    const stats = {};
    
    departments.forEach(dept => {
      const deptSessions = allSessions.filter(s => s.department_code === dept.department_code);
      const completedSessions = deptSessions.filter(s => s.status === 'completed');
      
      // Get follow-ups for this department's sessions
      const sessionIds = deptSessions.map(s => s.id);
      const deptFollowUps = allFollowUps.filter(f => sessionIds.includes(f.session_id));
      
      // Calculate average completion time (simplified - could use started_date and completed_date)
      let avgCompletionMinutes = null;
      if (completedSessions.length > 0) {
        const durationsInMinutes = completedSessions
          .filter(s => s.started_date && s.completed_date)
          .map(s => {
            const start = new Date(s.started_date);
            const end = new Date(s.completed_date);
            return (end - start) / 1000 / 60; // minutes
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
      
      stats[dept.id] = {
        interviewsCount: deptSessions.length,
        completedInterviewsCount: completedSessions.length,
        avgCompletionMinutes,
        followUpsCount: deptFollowUps.length,
        lastActivityAt
      };
    });
    
    setDepartmentStats(stats);
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
    // Prevent deletion of paid departments
    if (dept.plan_level === 'Paid') {
      toast.error('Cannot delete paid departments. Contact support for assistance.');
      return;
    }
    
    // If this department is already in confirm state, proceed with delete
    if (confirmDeleteId === dept.id) {
      handleDeleteDepartment(dept);
    } else {
      // Enter confirm state
      setConfirmDeleteId(dept.id);
      
      // Auto-cancel confirmation after 5 seconds
      setTimeout(() => {
        setConfirmDeleteId(prevId => prevId === dept.id ? null : prevId);
      }, 5000);
    }
  };

  const handleDeleteDepartment = async (dept) => {
    setIsDeleting(true);
    
    try {
      console.log(`🗑️ Deleting department: ${dept.department_name}`);
      
      // Delete all sessions for this department
      const deptSessions = allSessions.filter(s => s.department_code === dept.department_code);
      for (const session of deptSessions) {
        try {
          await base44.entities.InterviewSession.delete(session.id);
        } catch (err) {
          console.error(`Error deleting session ${session.id}:`, err);
        }
      }
      
      // Delete the department
      await base44.entities.Department.delete(dept.id);
      
      console.log(`✅ Department deleted successfully`);
      
      // Refresh data
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

  const getTrialDaysRemaining = (dept) => {
    if (dept.plan_level !== 'Trial') return null;
    const endDate = dept.trial_ends_at || dept.trial_end_date;
    if (!endDate) return null;
    
    const days = differenceInDays(new Date(endDate), new Date());
    return days > 0 ? days : 0;
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 md:mb-8">
          <Link to={createPageUrl("HomeHub")}>
            <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-slate-700 mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white flex items-center gap-2 md:gap-3">
                <Shield className="w-6 h-6 md:w-8 md:h-8 text-blue-400 flex-shrink-0" />
                <span>System Admin Dashboard</span>
              </h1>
              <p className="text-sm md:text-base text-slate-300 mt-2">
                Global system management and oversight
              </p>
            </div>
            <Link to={createPageUrl("CreateDepartment")} className="w-full md:w-auto">
              <Button className="w-full md:w-auto bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                Create Department
              </Button>
            </Link>
          </div>
        </div>

        {/* Enhanced System Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 mb-6 md:mb-8">
          <StatCard
            title="Total Departments"
            value={systemMetrics.totalDepartments}
            icon={Building2}
            color="blue"
          />
          <StatCard
            title="Active Trials"
            value={systemMetrics.activeTrials}
            icon={Rocket}
            color="orange"
          />
          <StatCard
            title="Trials Expiring (7 Days)"
            value={systemMetrics.trialsExpiringSoon}
            icon={AlertTriangle}
            color="red"
          />
          <StatCard
            title="Interviews Started"
            value={systemMetrics.totalInterviewsStarted}
            icon={FileText}
            color="cyan"
          />
          <StatCard
            title="Interviews Completed"
            value={systemMetrics.totalInterviewsCompleted}
            icon={CheckCircle}
            color="green"
          />
          <StatCard
            title="Follow-Ups (30 Days)"
            value={systemMetrics.followUpsTriggeredLast30Days}
            icon={ArrowUpCircle}
            color="purple"
          />
        </div>

        {/* Upgrade Requests */}
        {upgradeRequests.length > 0 && (
          <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 mb-6">
            <CardHeader>
              <CardTitle className="text-white">Pending Upgrade Requests ({upgradeRequests.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {upgradeRequests.map(request => {
                const dept = departments.find(d => d.id === request.department_id);
                return (
                  <div key={request.id} className="border border-slate-700 rounded-lg p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-medium break-words">{dept?.department_name}</h3>
                      <p className="text-slate-400 text-sm">
                        {request.current_plan_level} → {request.requested_plan_level}
                      </p>
                      {request.note && <p className="text-slate-400 text-sm mt-1">{request.note}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => handleApproveUpgrade(request)}
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-600 text-red-400 hover:bg-red-950/30"
                        onClick={() => handleDeclineUpgrade(request)}
                      >
                        <XCircle className="w-4 h-4 mr-1" />
                        Decline
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Departments List with Enhanced Cards */}
        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
          <CardHeader>
            <div className="flex flex-col gap-4">
              <CardTitle className="text-white text-lg md:text-xl">All Departments</CardTitle>
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  placeholder="Search departments..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-slate-900/50 border-slate-600 text-white"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {departmentsLoading ? (
                <div className="text-center py-8 text-slate-400">Loading departments...</div>
              ) : filteredDepartments.length === 0 ? (
                <div className="text-center py-8 text-slate-400">No departments found</div>
              ) : (
                filteredDepartments.map(dept => {
                  const stats = departmentStats[dept.id] || {};
                  const daysRemaining = getTrialDaysRemaining(dept);
                  const isInConfirmState = confirmDeleteId === dept.id;
                  
                  return (
                    <div
                      key={dept.id}
                      className="border border-slate-700 rounded-lg p-4 hover:border-blue-500/50 transition-colors"
                    >
                      <div className="flex flex-col lg:flex-row gap-4">
                        {/* Left Side - Department Info */}
                        <div className="flex-1 min-w-0">
                          {/* Top Row - Name & Badges */}
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h3 className="text-white font-medium text-sm md:text-base break-words">{dept.department_name}</h3>
                            <Badge className={getPlanBadgeColor(dept.plan_level)}>
                              {dept.plan_level}
                            </Badge>
                            {daysRemaining !== null && (
                              <Badge variant="outline" className={daysRemaining <= 3 ? "border-red-500 text-red-400" : "border-orange-500 text-orange-400"}>
                                {daysRemaining} days left
                              </Badge>
                            )}
                          </div>
                          
                          {/* Stats Row */}
                          <div className="flex flex-wrap gap-3 md:gap-4 text-xs text-slate-400 mb-2">
                            <span>Interviews: <span className="text-slate-300 font-medium">{stats.interviewsCount || 0}</span></span>
                            <span>•</span>
                            <span>Completed: <span className="text-slate-300 font-medium">{stats.completedInterviewsCount || 0}</span></span>
                            <span>•</span>
                            <span>Avg Time: <span className="text-slate-300 font-medium">{stats.avgCompletionMinutes ? `${stats.avgCompletionMinutes} min` : '-'}</span></span>
                            <span>•</span>
                            <span>Follow-Ups: <span className="text-slate-300 font-medium">{stats.followUpsCount || 0}</span></span>
                            {stats.lastActivityAt && (
                              <>
                                <span>•</span>
                                <span>Last Activity: <span className="text-slate-300 font-medium">{format(stats.lastActivityAt, 'MMM d, yyyy')}</span></span>
                              </>
                            )}
                          </div>
                          
                          {/* Contact Info */}
                          {dept.contact_name && (
                            <div className="text-xs text-slate-500 mt-2">
                              <span>{dept.contact_name}</span>
                              {dept.contact_email && <span> • {dept.contact_email}</span>}
                              {dept.contact_phone && <span> • {dept.contact_phone}</span>}
                            </div>
                          )}
                        </div>
                        
                        {/* Right Side - Actions */}
                        <div className="flex lg:flex-col gap-2 lg:ml-auto flex-shrink-0">
                          <Link to={createPageUrl(`DepartmentDashboard?id=${dept.id}`)} className="flex-1 lg:flex-none">
                            <Button size="sm" variant="outline" className="w-full bg-slate-900/50 border-slate-600 text-white hover:bg-slate-700 text-xs">
                              View
                            </Button>
                          </Link>
                          <Link to={createPageUrl(`EditDepartment?id=${dept.id}`)} className="flex-1 lg:flex-none">
                            <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-700 text-xs">
                              Edit
                            </Button>
                          </Link>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleDeleteClick(dept)}
                            disabled={dept.plan_level === 'Paid' || isDeleting}
                            className={`flex-1 lg:flex-none text-xs ${
                              dept.plan_level === 'Paid' 
                                ? 'opacity-50 cursor-not-allowed border-slate-600 text-slate-500' 
                                : isInConfirmState
                                ? 'border-red-600 bg-red-950/30 text-red-300 hover:bg-red-950/50 animate-pulse'
                                : 'border-red-600 text-red-400 hover:bg-red-950/30'
                            }`}
                            title={dept.plan_level === 'Paid' ? 'Contact support to remove paid departments' : isInConfirmState ? 'Click again to confirm deletion' : 'Delete department'}
                          >
                            <Trash2 className="w-3 h-3 lg:mr-1" />
                            <span className="hidden lg:inline">{isInConfirmState ? 'Confirm?' : 'Delete'}</span>
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

function StatCard({ title, value, icon: Icon, color }) {
  const colorClasses = {
    blue: "from-blue-500/20 to-blue-600/10 border-blue-500/30 text-blue-400",
    orange: "from-orange-500/20 to-orange-600/10 border-orange-500/30 text-orange-400",
    cyan: "from-cyan-500/20 to-cyan-600/10 border-cyan-500/30 text-cyan-400",
    green: "from-green-500/20 to-green-600/10 border-green-500/30 text-green-400",
    purple: "from-purple-500/20 to-purple-600/10 border-purple-500/30 text-purple-400",
    red: "from-red-500/20 to-red-600/10 border-red-500/30 text-red-400"
  };

  return (
    <Card className={`relative overflow-hidden bg-gradient-to-br border ${colorClasses[color]}`}>
      <CardContent className="p-4 md:p-6">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs md:text-sm text-slate-400 truncate">{title}</p>
            <p className="text-2xl md:text-3xl font-bold text-white mt-1">{value}</p>
          </div>
          <div className="p-2 md:p-3 rounded-xl bg-opacity-20 flex-shrink-0 ml-2">
            <Icon className="w-5 h-5 md:w-6 md:h-6" />
          </div>
        </div>
      </CardContent>
    </Card>
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