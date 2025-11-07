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
  AlertCircle, Calendar, Shield, TrendingUp 
} from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";

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
      const currentUser = await base44.auth.me();
      setUser(currentUser);

      // Load department
      const deptIdToLoad = deptId || currentUser.department_id;
      if (!deptIdToLoad) {
        navigate(createPageUrl("HomeHub"));
        return;
      }

      const dept = await base44.entities.Department.get(deptIdToLoad);
      
      // Check access - users can only see their own department unless super admin
      if (currentUser.role !== 'SUPER_ADMIN' && dept.id !== currentUser.department_id) {
        navigate(createPageUrl("HomeHub"));
        return;
      }

      setDepartment(dept);
    } catch (err) {
      console.error("Error loading data:", err);
      navigate(createPageUrl("AdminLogin"));
    }
  };

  const { data: departmentUsers = [] } = useQuery({
    queryKey: ['department-users', department?.id],
    queryFn: () => base44.entities.User.filter({ department_id: department.id }),
    enabled: !!department
  });

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
            <div className="flex items-start gap-4">
              {department.logo_url && !department.use_default_branding ? (
                <img 
                  src={department.logo_url} 
                  alt={department.department_name}
                  className="w-16 h-16 object-contain"
                />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                  <Building2 className="w-8 h-8 text-blue-400" />
                </div>
              )}
              <div>
                <h1 className="text-3xl md:text-4xl font-bold text-white">
                  {department.department_name}
                </h1>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <Badge className={getPlanBadgeColor(department.plan_level)}>
                    {department.plan_level}
                  </Badge>
                  <Badge variant="outline" className="text-slate-400 border-slate-600">
                    {department.department_type}
                  </Badge>
                  <span className="text-slate-400 text-sm">
                    {departmentUsers.length} users • {department.seats_allocated} seats
                  </span>
                </div>
              </div>
            </div>

            {canEdit && (
              <Link to={createPageUrl(`EditDepartment?id=${department.id}`)}>
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Trial Expiring Warning */}
        {isTrialExpiring && daysUntilExpiry <= 7 && (
          <Alert className="mb-6 bg-orange-950/20 border-orange-800/50 text-orange-200">
            <AlertCircle className="h-4 h-4" />
            <AlertDescription>
              <strong>Trial Ending Soon:</strong> Your trial expires in {daysUntilExpiry} days.
              {isDeptAdmin && " Contact support to upgrade your plan."}
            </AlertDescription>
          </Alert>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Applicants Processed"
            value={department.applicants_processed || 0}
            icon={FileText}
            color="blue"
          />
          <StatCard
            title="Active Users"
            value={departmentUsers.filter(u => u.is_active).length}
            icon={Users}
            color="green"
          />
          <StatCard
            title="Avg Processing Time"
            value={`${department.avg_processing_time || 0}m`}
            icon={TrendingUp}
            color="purple"
          />
          <StatCard
            title="Data Retention"
            value={`${department.retention_period} days`}
            icon={Calendar}
            color="orange"
          />
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Department Info */}
          <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Department Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InfoRow label="Department ID" value={department.department_id} />
              <InfoRow label="Jurisdiction" value={department.jurisdiction} />
              <InfoRow label="Address" value={department.department_address} />
              <InfoRow label="Phone" value={department.phone_number} />
              <InfoRow label="Website" value={department.website_url} link />
              <InfoRow label="Contact" value={`${department.contact_name} (${department.contact_email})`} />
            </CardContent>
          </Card>

          {/* Security Settings */}
          <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
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

          {/* Users */}
          <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Department Users</CardTitle>
            </CardHeader>
            <CardContent>
              {departmentUsers.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-4">No users yet</p>
              ) : (
                <div className="space-y-2">
                  {departmentUsers.map(u => (
                    <div key={u.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-900/30 border border-slate-700">
                      <div>
                        <p className="text-white font-medium">{u.first_name} {u.last_name}</p>
                        <p className="text-slate-400 text-xs">{u.email}</p>
                      </div>
                      <Badge variant="outline" className="text-xs text-slate-300 border-slate-600">
                        {u.role.replace('DEPT_', '')}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Activity Log */}
          <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {!department.activity_log || department.activity_log.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-4">No activity yet</p>
              ) : (
                <div className="space-y-2">
                  {department.activity_log.slice(0, 10).map((activity, idx) => (
                    <div key={idx} className="text-sm text-slate-300 flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2" />
                      <span>{activity}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
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
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-400">{title}</p>
            <p className="text-3xl font-bold text-white mt-1">{value}</p>
          </div>
          <Icon className="w-6 h-6" />
        </div>
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value, badge, link }) {
  if (!value) return null;

  return (
    <div className="flex justify-between items-start">
      <span className="text-slate-400">{label}</span>
      {badge ? (
        <Badge className={badge === 'success' ? 'bg-green-500/20 text-green-300' : 'bg-orange-500/20 text-orange-300'}>
          {value}
        </Badge>
      ) : link && value ? (
        <a href={value} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
          {value}
        </a>
      ) : (
        <span className="text-white text-right">{value}</span>
      )}
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