
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, Settings, Building2, LogOut, HelpCircle, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";

export default function HomeHub() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [department, setDepartment] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [rememberChoice, setRememberChoice] = useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      // Check for mock admin authentication first (for Ryan/Dylan local testing)
      const adminAuth = sessionStorage.getItem("clearquest_admin_auth");
      if (adminAuth) {
        try {
          const auth = JSON.parse(adminAuth);
          // Create a mock super admin user for Ryan/Dylan
          const mockUser = {
            email: `${auth.username.toLowerCase()}@clearquest.ai`,
            first_name: auth.username,
            last_name: "Admin",
            role: "SUPER_ADMIN",
            department_id: null
          };
          setUser(mockUser);
          
          // Check for remembered preference
          const remembered = localStorage.getItem('clearquest_home_preference');
          if (remembered) {
            navigate(createPageUrl(remembered));
          }
          
          setIsLoading(false);
          return; // Exit function after handling mock admin
        } catch (err) {
          console.error("Error parsing admin auth from sessionStorage:", err);
          // Continue to attempt regular auth if mock auth fails to parse
        }
      }

      // Otherwise try to get authenticated Base44 user
      const currentUser = await base44.auth.me();
      setUser(currentUser);

      // Load department if user has one
      if (currentUser.department_id) {
        const dept = await base44.entities.Department.get(currentUser.department_id);
        setDepartment(dept);
      }

      // Check for remembered preference
      // Only apply if not a SUPER_ADMIN, as SUPER_ADMINs always see the hub first
      const remembered = localStorage.getItem('clearquest_home_preference');
      if (remembered && currentUser.role !== 'SUPER_ADMIN') {
        navigate(createPageUrl(remembered));
      }

      setIsLoading(false);
    } catch (err) {
      console.error("Error loading user:", err);
      // Redirect to login if user is not authenticated or an error occurs
      navigate(createPageUrl("AdminLogin"));
    }
  };

  const handleNavigate = (destination) => {
    if (rememberChoice) {
      localStorage.setItem('clearquest_home_preference', destination);
    }
    navigate(createPageUrl(destination));
  };

  const handleLogout = () => {
    base44.auth.logout();
    sessionStorage.removeItem("clearquest_admin_auth");
    localStorage.removeItem("clearquest_home_preference");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-blue-400 animate-spin" />
      </div>
    );
  }

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-500 blur-3xl opacity-50" />
              <Shield className="relative w-20 h-20 text-blue-400" strokeWidth={1.5} />
            </div>
          </div>
          
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Welcome to ClearQuest AI
          </h1>
          
          <div className="space-y-2">
            <p className="text-xl text-blue-300">
              {user?.first_name} {user?.last_name}
            </p>
            <p className="text-slate-400">
              {user?.role === 'SUPER_ADMIN' && 'Super Administrator'}
              {user?.role === 'DEPT_ADMIN' && 'Department Administrator'}
              {user?.role === 'DEPT_USER' && 'Department User'}
              {department && ` • ${department.department_name}`}
            </p>
          </div>
        </div>

        {/* Action Cards */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {isSuperAdmin && (
            <button
              onClick={() => handleNavigate("SystemAdminDashboard")}
              className="text-left w-full"
            >
              <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 hover:border-blue-500/50 transition-all cursor-pointer group h-full">
                <CardContent className="p-8 text-center">
                  <div className="flex justify-center mb-4">
                    <div className="p-4 rounded-full bg-blue-600/20 group-hover:bg-blue-600/30 transition-colors">
                      <Settings className="w-10 h-10 text-blue-400" />
                    </div>
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2">Admin Dashboard</h2>
                  <p className="text-slate-400">
                    Manage all departments, users, and system settings
                  </p>
                </CardContent>
              </Card>
            </button>
          )}

          <button
            onClick={() => handleNavigate("Departments")}
            className="text-left w-full"
          >
            <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 hover:border-blue-500/50 transition-all cursor-pointer group h-full">
              <CardContent className="p-8 text-center">
                <div className="flex justify-center mb-4">
                  <div className="p-4 rounded-full bg-purple-600/20 group-hover:bg-purple-600/30 transition-colors">
                    <Building2 className="w-10 h-10 text-purple-400" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">
                  {isSuperAdmin ? 'Departments' : 'My Department'}
                </h2>
                <p className="text-slate-400">
                  {isSuperAdmin 
                    ? 'View and manage all departments' 
                    : 'Access your department dashboard and settings'}
                </p>
              </CardContent>
            </Card>
          </button>
        </div>

        {/* Remember Choice */}
        {!isSuperAdmin && (
          <div className="flex items-center justify-center gap-2 mb-8">
            <Checkbox 
              id="remember" 
              checked={rememberChoice}
              onCheckedChange={setRememberChoice}
            />
            <label htmlFor="remember" className="text-sm text-slate-400 cursor-pointer">
              Remember my choice and skip this page
            </label>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex flex-wrap justify-center gap-4">
          <Button
            variant="outline"
            className="bg-slate-900/50 border-slate-600 text-white hover:bg-slate-800"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
          
          <a href="mailto:support@clearquest.ai">
            <Button
              variant="outline"
              className="bg-slate-900/50 border-slate-600 text-white hover:bg-slate-800"
            >
              <HelpCircle className="w-4 h-4 mr-2" />
              Help & Support
            </Button>
          </a>
        </div>

        {/* Version */}
        <p className="text-center text-slate-500 text-sm mt-8">
          ClearQuest AI v1 • CJIS Compliant
        </p>
      </div>
    </div>
  );
}
