
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Shield, Building2, Users, DollarSign, Search, ArrowLeft, Plus, CheckCircle, XCircle } from "lucide-react";
import { Link } from "react-router-dom";

export default function SystemAdminDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

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
          // Create mock super admin user
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

      // Otherwise check Base44 authentication
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

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => base44.entities.Department.list('-created_date'),
    enabled: !!user
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['all-users'],
    queryFn: () => base44.entities.User.list(),
    enabled: !!user
  });

  const { data: upgradeRequests = [] } = useQuery({
    queryKey: ['upgrade-requests'],
    queryFn: () => base44.entities.UpgradeRequest.filter({ status: 'Open' }),
    enabled: !!user
  });

  const handleApproveUpgrade = async (request) => {
    try {
      // Update department plan level
      await base44.entities.Department.update(request.department_id, {
        plan_level: request.requested_plan_level,
        activity_log: [`Plan upgraded to ${request.requested_plan_level}`, ...(departments.find(d => d.id === request.department_id)?.activity_log || [])]
      });

      // Update request status
      await base44.entities.UpgradeRequest.update(request.id, {
        status: 'Approved',
        resolved_date: new Date().toISOString(),
        resolved_by_user_id: user.id
      });

      alert('Upgrade approved successfully');
    } catch (err) {
      console.error('Error approving upgrade:', err);
      alert('Failed to approve upgrade');
    }
  };

  const handleDeclineUpgrade = async (request) => {
    try {
      await base44.entities.UpgradeRequest.update(request.id, {
        status: 'Declined',
        resolved_date: new Date().toISOString(),
        resolved_by_user_id: user.id
      });
      alert('Upgrade request declined');
    } catch (err) {
      console.error('Error declining upgrade:', err);
    }
  };

  const filteredDepartments = departments.filter(dept =>
    dept.department_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    dept.department_id?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = {
    totalDepartments: departments.length,
    activeTrial: departments.filter(d => d.plan_level === 'Trial').length,
    paidAccounts: departments.filter(d => d.plan_level === 'Paid').length,
    totalUsers: allUsers.length
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link to={createPageUrl("HomeHub")}>
            <Button variant="ghost" className="text-slate-300 hover:text-white mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>

          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-white flex items-center gap-3">
                <Shield className="w-8 h-8 text-blue-400" />
                System Admin Dashboard
              </h1>
              <p className="text-slate-300 mt-2">
                Global system management and oversight
              </p>
            </div>
            <Link to={createPageUrl("CreateDepartment")}>
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                Create Department
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Total Departments"
            value={stats.totalDepartments}
            icon={Building2}
            color="blue"
          />
          <StatCard
            title="Active Trials"
            value={stats.activeTrial}
            icon={DollarSign}
            color="orange"
          />
          <StatCard
            title="Paid Accounts"
            value={stats.paidAccounts}
            icon={CheckCircle}
            color="green"
          />
          <StatCard
            title="Total Users"
            value={stats.totalUsers}
            icon={Users}
            color="purple"
          />
        </div>

        {/* Pending Upgrades */}
        {upgradeRequests.length > 0 && (
          <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 mb-6">
            <CardHeader>
              <CardTitle className="text-white">Pending Upgrade Requests ({upgradeRequests.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {upgradeRequests.map(request => {
                const dept = departments.find(d => d.id === request.department_id);
                return (
                  <div key={request.id} className="border border-slate-700 rounded-lg p-4 flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="text-white font-medium">{dept?.department_name}</h3>
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

        {/* Departments Table */}
        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
          <CardHeader>
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <CardTitle className="text-white">All Departments</CardTitle>
              <div className="relative w-full md:w-auto md:max-w-xs">
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
              {filteredDepartments.map(dept => (
                <div
                  key={dept.id}
                  className="border border-slate-700 rounded-lg p-4 hover:border-blue-500/50 transition-colors"
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 md:gap-3">
                        <h3 className="text-white font-medium">{dept.department_name}</h3>
                        <Badge className={getPlanBadgeColor(dept.plan_level)}>
                          {dept.plan_level}
                        </Badge>
                        <Badge variant="outline" className="text-slate-400 border-slate-600">
                          {dept.department_type}
                        </Badge>
                      </div>
                      <p className="text-slate-400 text-sm mt-2">
                        {dept.applicants_processed || 0} applicants • {dept.seats_allocated} seats
                      </p>
                    </div>
                    <div className="flex gap-2 w-full md:w-auto">
                      <Link to={createPageUrl(`DepartmentDashboard?id=${dept.id}`)} className="flex-1 md:flex-none">
                        <Button size="sm" variant="outline" className="w-full bg-slate-900/50 border-slate-600 text-white hover:bg-slate-700 hover:text-white hover:border-slate-500">
                          View
                        </Button>
                      </Link>
                      <Link to={createPageUrl(`EditDepartment?id=${dept.id}`)} className="flex-1 md:flex-none">
                        <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-700">
                          Edit
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
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
    green: "from-green-500/20 to-green-600/10 border-green-500/30 text-green-400",
    purple: "from-purple-500/20 to-purple-600/10 border-purple-500/30 text-purple-400"
  };

  return (
    <Card className={`relative overflow-hidden bg-gradient-to-br border ${colorClasses[color]}`}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-400">{title}</p>
            <p className="text-3xl font-bold text-white mt-1">{value}</p>
          </div>
          <div className="p-3 rounded-xl bg-opacity-20">
            <Icon className="w-6 h-6" />
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
