import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, Settings, LogOut, HelpCircle, Loader2, FolderOpen, Package } from "lucide-react";
import { Link } from "react-router-dom";

export default function HomeHub() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
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
            department_id: null
          };
          setUser(mockUser);
          setIsLoading(false);
          return;
        } catch (err) {
          console.error("Error parsing admin auth from sessionStorage:", err);
        }
      }

      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsLoading(false);
    } catch (err) {
      console.error("Error loading user:", err);
      navigate(createPageUrl("AdminLogin"));
    }
  };

  const handleNavigate = (destination) => {
    navigate(createPageUrl(destination));
  };

  const handleLogout = () => {
    sessionStorage.removeItem("clearquest_admin_auth");
    window.location.href = createPageUrl("Home");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-blue-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4 md:p-6 flex items-center">
      <div className="max-w-5xl mx-auto w-full">
        <div className="text-center mb-4 md:mb-6">
          <div className="flex justify-center mb-2 md:mb-3">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-500 blur-3xl opacity-50" />
              <Shield className="relative w-12 h-12 md:w-14 md:h-14 text-blue-400" strokeWidth={1.5} />
            </div>
          </div>
          
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
            Welcome to ClearQuest AI
          </h1>
          
          <p className="text-base md:text-lg text-blue-300">
            {user?.first_name} {user?.last_name}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5 mb-4 md:mb-6 max-w-4xl mx-auto">
          <div
            onClick={() => handleNavigate("SystemAdminDashboard")}
            className="cursor-pointer group"
          >
            <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 hover:border-blue-500/50 transition-all h-full">
              <CardContent className="p-5 md:p-6 text-center">
                <div className="flex justify-center mb-3">
                  <div className="p-3 md:p-4 rounded-full bg-blue-600/20 group-hover:bg-blue-600/30 transition-colors">
                    <Settings className="w-8 h-8 md:w-9 md:h-9 text-blue-400" />
                  </div>
                </div>
                <h2 className="text-lg md:text-xl font-bold text-white mb-1.5">System Dashboard</h2>
                <p className="text-sm text-slate-400">
                  Manage departments and system settings
                </p>
              </CardContent>
            </Card>
          </div>

          <div
            onClick={() => handleNavigate("InterviewDashboard")}
            className="cursor-pointer group"
          >
            <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 hover:border-green-500/50 transition-all h-full">
              <CardContent className="p-5 md:p-6 text-center">
                <div className="flex justify-center mb-3">
                  <div className="p-3 md:p-4 rounded-full bg-green-600/20 group-hover:bg-green-600/30 transition-colors">
                    <Shield className="w-8 h-8 md:w-9 md:h-9 text-green-400" />
                  </div>
                </div>
                <h2 className="text-lg md:text-xl font-bold text-white mb-1.5">Interview Dashboard</h2>
                <p className="text-sm text-slate-400">
                  Monitor and manage interview sessions
                </p>
              </CardContent>
            </Card>
          </div>

          <div
            onClick={() => handleNavigate("InterviewStructureManager")}
            className="cursor-pointer group"
          >
            <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 hover:border-purple-500/50 transition-all h-full">
              <CardContent className="p-5 md:p-6 text-center">
                <div className="flex justify-center mb-3">
                  <div className="p-3 md:p-4 rounded-full bg-purple-600/20 group-hover:bg-purple-600/30 transition-colors">
                    <FolderOpen className="w-8 h-8 md:w-9 md:h-9 text-purple-400" />
                  </div>
                </div>
                <h2 className="text-lg md:text-xl font-bold text-white mb-1.5">Interview Manager</h2>
                <p className="text-sm text-slate-400">
                  Manage interview sections and questions
                </p>
              </CardContent>
            </Card>
          </div>

          <div
            onClick={() => handleNavigate("FollowUpPackManagerV2")}
            className="cursor-pointer group"
          >
            <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 hover:border-amber-500/50 transition-all h-full">
              <CardContent className="p-5 md:p-6 text-center">
                <div className="flex justify-center mb-3">
                  <div className="p-3 md:p-4 rounded-full bg-amber-600/20 group-hover:bg-amber-600/30 transition-colors">
                    <Package className="w-8 h-8 md:w-9 md:h-9 text-amber-400" />
                  </div>
                </div>
                <h2 className="text-lg md:text-xl font-bold text-white mb-1.5">Follow-Up Packs</h2>
                <p className="text-sm text-slate-400">
                  Configure standardized follow-up packs
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-2 md:gap-3 px-4">
          <Link to={createPageUrl("Home")} className="w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              className="w-full bg-slate-900/50 border-slate-600 text-white hover:bg-slate-800 hover:text-white"
            >
              <Shield className="w-4 h-4 mr-2" />
              Public Home
            </Button>
          </Link>
          
          <Button
            variant="outline"
            size="sm"
            className="w-full sm:w-auto bg-slate-900/50 border-slate-600 text-white hover:bg-slate-800 hover:text-white"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>

        <p className="text-center text-slate-500 text-xs mt-3 md:mt-4 px-4">
          © 2025 ClearQuest AI™ • CJIS Compliant
        </p>
      </div>
    </div>
  );
}