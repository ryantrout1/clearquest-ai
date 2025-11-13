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
            navigate(createPageUrl("HomeHub"));
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

    const openInterviews = allSessions.filter(s => s.status === 'in_progress').length;
    
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

  // Check if primary contact exists
  const hasPrimaryContact = department.contact_name && department.contact_email && department.contact_phone;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Back Button */}
        <div className="mb-4">
          <Link to={createPageUrl("HomeHub")}>
            <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-slate-700">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>
        </div>

        {/* Department Header Card */}
        <style>{`
          :root { 
            --brand: ${department.color_primary || 'rgba(120,160,255,.25)'}; 
          }
          .dept-header-card {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 16px;
            padding: 16px 20px;
            border-radius: 12px;
            background: rgba(20,24,44,.9);
            border: 1px solid rgba(255,255,255,.08);
            box-shadow: 0 8px 28px rgba(0,0,0,.35), 0 0 0 2px var(--brand) inset;
            margin-bottom: 12px;
            flex-wrap: wrap;
          }
          .dept-header-left {
            display: flex;
            gap: 14px;
            align-items: center;
            min-width: 0;
            flex: 1;
          }
          .dept-header-logo {
            width: 42px;
            height: 42px;
            object-fit: contain;
            border-radius: 6px;
            background: #0e1325;
            flex-shrink: 0;
          }
          .dept-header-logo-initials {
            width: 42px;
            height: 42px;
            border-radius: 6px;
            background: rgba(59, 130, 246, 0.2);
            border: 1px solid rgba(59, 130, 246, 0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 16px;
            color: rgb(96, 165, 250);
            flex-shrink: 0;
          }
          .dept-header-titles {
            min-width: 0;
            flex: 1;
          }
          .dept-header-name {
            font-weight: 700;
            font-size: 18px;
            color: white;
            margin-bottom: 4px;
          }
          .dept-header-meta, .dept-header-contact {
            opacity: 0.8;
            font-size: 12px;
            color: rgb(203, 213, 225);
          }
          .dept-header-right {
            display: flex;
            gap: 18px;
            align-items: center;
            flex-wrap: wrap;
          }
          .dept-header-stat {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
          }
          .dept-header-stat-key {
            opacity: 0.7;
            font-size: 11px;
            color: rgb(148, 163, 184);
          }
          .dept-header-stat-value {
            font-weight: 700;
            font-size: 16px;
            color: white;
          }
          .dept-header-badges {
            display: flex;
            gap: 6px;
            align-items: center;
          }
          .dept-header-badge {
            padding: 4px 8px;
            border-radius: 999px;
            font-size: 11px;
            border: 1px solid rgba(255,255,255,.12);
          }
          .dept-header-badge.status-Active {
            background: rgba(46,204,113,.15);
            color: rgb(74, 222, 128);
          }
          .dept-header-badge.status-Suspended {
            background: rgba(231,76,60,.15);
            color: rgb(248, 113, 113);
          }
          .dept-header-badge.risk-Low {
            background: rgba(39,174,96,.15);
            color: rgb(74, 222, 128);
          }
          .dept-header-badge.risk-Medium {
            background: rgba(241,196,15,.15);
            color: rgb(250, 204, 21);
          }
          .dept-header-badge.risk-High {
            background: rgba(231,76,60,.15);
            color: rgb(248, 113, 113);
          }
          .dept-actions {
            margin-top: 10px;
            margin-bottom: 20px;
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
          }
          @media (max-width: 768px) {
            .dept-header-card {
              flex-direction: column;
              align-items: flex-start;
            }
            .dept-header-right {
              width: 100%;
            }
          }
        `}</style>

        <div className="dept-header-card">
          <div className="dept-header-left">
            {department.logo_url && !department.use_default_branding ? (
              <img 
                src={department.logo_url} 
                alt={department.department_name}
                className="dept-header-logo"
              />
            ) : (
              <div className="dept-header-logo-initials">
                {getInitials(department.department_name)}
              </div>
            )}
            <div className="dept-header-titles">
              <div className="dept-header-name">{department.department_name}</div>
              <div className="dept-header-meta">
                Dept Code: {department.department_code} • Tier: {department.plan_level}
              </div>
              <div className="dept-header-contact">
                {department.phone_number} • {department.contact_email}
              </div>
            </div>
          </div>
          <div className="dept-header-right">
            <div className="dept-header-stat">
              <span className="dept-header-stat-key">Open</span>
              <span className="dept-header-stat-value">{metrics.openInterviews}</span>
            </div>
            <div className="dept-header-stat">
              <span className="dept-header-stat-key">Completed (7d)</span>
              <span className="dept-header-stat-value">{metrics.completed7d}</span>
            </div>
            <div className="dept-header-stat">
              <span className="dept-header-stat-key">Avg Completion</span>
              <span className="dept-header-stat-value">{metrics.avgCompletion}%</span>
            </div>
            <div className="dept-header-stat">
              <span className="dept-header-stat-key">Follow-ups</span>
              <span className="dept-header-stat-value">{metrics.followupsPending}</span>
            </div>
            <div className="dept-header-badges">
              <span className={`dept-header-badge status-${department.active_status || 'Active'}`}>
                {department.active_status || 'Active'}
              </span>
              <span className={`dept-header-badge risk-${deptRiskLevel}`}>
                {deptRiskLevel} Risk
              </span>
            </div>
          </div>
        </div>

        {/* Actions Row */}
        <div className="dept-actions">
          <Link to={createPageUrl("InterviewDashboard")}>
            <Button variant="outline" className="bg-slate-900/50 border-slate-600 text-white hover:bg-slate-800">
              <FileText className="w-4 h-4 mr-2" />
              Interviews
            </Button>
          </Link>
          
          {canEdit && (
            <Link to={createPageUrl(`EditDepartment?id=${department.id}`)}>
              <Button variant="outline" className="bg-slate-900/50 border-slate-600 text-white hover:bg-slate-800">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
            </Link>
          )}
          
          <Link to={createPageUrl("StartInterview")}>
            <Button variant="outline" className="bg-blue-600/20 border-blue-500/30 text-blue-300 hover:bg-blue-600/30">
              <PlayCircle className="w-4 h-4 mr-2" />
              Start Interview
            </Button>
          </Link>
          
          <Button 
            variant="outline" 
            className="bg-slate-900/50 border-slate-600 text-white hover:bg-slate-800"
            onClick={() => alert('Export functionality coming soon')}
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>

        {/* Trial Expiring Warning */}
        {isTrialExpiring && daysUntilExpiry <= 7 && (
          <Alert className="mb-6 bg-orange-950/20 border-orange-800/50 text-orange-200">
            <AlertCircle className="h-4 h-4" />
            <AlertDescription className="text-sm">
              <strong>Trial Ending Soon:</strong> Your trial expires in {daysUntilExpiry} days.
              {isDeptAdmin && " Contact support to upgrade your plan."}
            </AlertDescription>
          </Alert>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6 mb-6 md:mb-8">
          <StatCard
            title="Applicants Processed"
            value={department.applicants_processed || 0}
            icon={FileText}
            color="blue"
          />
          <StatCard
            title="Active Users"
            value={hasPrimaryContact ? 1 : 0}
            icon={Users}
            color="green"
          />
          <StatCard
            title="Avg Time"
            value={`${department.avg_processing_time || 0}m`}
            icon={TrendingUp}
            color="purple"
          />
          <StatCard
            title="Retention"
            value={`${department.retention_period}d`}
            icon={Calendar}
            color="orange"
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4 md:gap-6">
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
              <InfoRow label="Contact" value={`${department.contact_name} (${department.contact_email})`} />
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

          {/* Primary Contact (Department Users) */}
          <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-lg">Department Users</CardTitle>
            </CardHeader>
            <CardContent>
              {!hasPrimaryContact ? (
                <div className="text-center py-6">
                  <AlertCircle className="w-12 h-12 text-orange-400 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm mb-4">
                    No primary contact is on file for this department. Please add one in Department Settings.
                  </p>
                  <Link to={createPageUrl(`EditDepartment?id=${department.id}`)}>
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                      Edit Department
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-slate-900/30 border border-slate-700">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                        <User className="w-5 h-5 text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-white font-medium text-sm break-words">
                            {department.contact_name}
                            {department.contact_title && <span className="text-slate-400 font-normal"> — {department.contact_title}</span>}
                          </p>
                        </div>
                        <div className="flex flex-col gap-1 text-xs text-slate-400">
                          <a 
                            href={`mailto:${department.contact_email}`}
                            className="hover:text-blue-400 transition-colors flex items-center gap-1.5"
                          >
                            <Mail className="w-3 h-3" />
                            {department.contact_email}
                          </a>
                          <a 
                            href={`tel:${department.contact_phone}`}
                            className="hover:text-blue-400 transition-colors flex items-center gap-1.5"
                          >
                            <Phone className="w-3 h-3" />
                            {department.contact_phone}
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

function getPlanBadgeColor(plan) {
  switch (plan) {
    case 'Trial': return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
    case 'Pilot': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    case 'Paid': return 'bg-green-500/20 text-green-300 border-green-500/30';
    case 'Suspended': return 'bg-red-500/20 text-red-300 border-red-500/30';
    default: return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
  }
}