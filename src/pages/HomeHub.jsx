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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8 md:mb-12">
          <div className="flex justify-center mb-4 md:mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-500 blur-3xl opacity-50" />
              <Shield className="relative w-16 h-16 md:w-20 md:h-20 text-blue-400" strokeWidth={1.5} />
            </div>
          </div>
          
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4 px-4">
            Welcome to ClearQuest AI
          </h1>
          
          <div className="space-y-2 px-4">
            <p className="text-lg md:text-xl text-blue-300 break-words">
              {user?.first_name} {user?.last_name}
            </p>
            <p className="text-sm md:text-base text-slate-400 break-words">
              Super Administrator
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 mb-8 md:mb-12 max-w-4xl mx-auto">
          <div
            onClick={() => handleNavigate("SystemAdminDashboard")}
            className="cursor-pointer group"
          >
            <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 hover:border-blue-500/50 transition-all h-full">
              <CardContent className="p-8 md:p-10 text-center">
                <div className="flex justify-center mb-6">
                  <div className="p-5 md:p-6 rounded-full bg-blue-600/20 group-hover:bg-blue-600/30 transition-colors">
                    <Settings className="w-10 h-10 md:w-12 md:h-12 text-blue-400" />
                  </div>
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">System Admin</h2>
                <p className="text-base md:text-lg text-slate-400">
                  Manage departments and system settings
                </p>
              </CardContent>
            </Card>
          </div>

          <div
            onClick={() => handleNavigate("InterviewStructureManager")}
            className="cursor-pointer group"
          >
            <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 hover:border-purple-500/50 transition-all h-full">
              <CardContent className="p-8 md:p-10 text-center">
                <div className="flex justify-center mb-6">
                  <div className="p-5 md:p-6 rounded-full bg-purple-600/20 group-hover:bg-purple-600/30 transition-colors">
                    <FolderOpen className="w-10 h-10 md:w-12 md:h-12 text-purple-400" />
                  </div>
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">Interview Manager</h2>
                <p className="text-base md:text-lg text-slate-400">
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
              <CardContent className="p-8 md:p-10 text-center">
                <div className="flex justify-center mb-6">
                  <div className="p-5 md:p-6 rounded-full bg-amber-600/20 group-hover:bg-amber-600/30 transition-colors">
                    <Package className="w-10 h-10 md:w-12 md:h-12 text-amber-400" />
                  </div>
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">Follow-Up Packs</h2>
                <p className="text-base md:text-lg text-slate-400">
                  Configure standardized follow-up packs (V2)
                </p>
              </CardContent>
            </Card>
          </div>

          <div
            onClick={() => handleNavigate("InterviewDashboard")}
            className="cursor-pointer group"
          >
            <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 hover:border-green-500/50 transition-all h-full">
              <CardContent className="p-8 md:p-10 text-center">
                <div className="flex justify-center mb-6">
                  <div className="p-5 md:p-6 rounded-full bg-green-600/20 group-hover:bg-green-600/30 transition-colors">
                    <Shield className="w-10 h-10 md:w-12 md:h-12 text-green-400" />
                  </div>
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">Current Interviews</h2>
                <p className="text-base md:text-lg text-slate-400">
                  Monitor and manage interview sessions
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-3 md:gap-4 px-4">
          <Link to={createPageUrl("Home")} className="w-full sm:w-auto">
            <Button
              variant="outline"
              className="w-full bg-slate-900/50 border-slate-600 text-white hover:bg-slate-800 hover:text-white"
            >
              <Shield className="w-4 h-4 mr-2" />
              Public Home
            </Button>
          </Link>
          
          <Button
            variant="outline"
            className="w-full sm:w-auto bg-slate-900/50 border-slate-600 text-white hover:bg-slate-800 hover:text-white"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
          
          <a href="mailto:support@clearquest.ai" className="w-full sm:w-auto">
            <Button
              variant="outline"
              className="w-full bg-slate-900/50 border-slate-600 text-white hover:bg-slate-800 hover:text-white"
            >
              <HelpCircle className="w-4 h-4 mr-2" />
              Help & Support
            </Button>
          </a>
        </div>

        <p className="text-center text-slate-500 text-xs md:text-sm mt-6 md:mt-8 px-4">
          © 2025 ClearQuest AI™ • CJIS Compliant
        </p>
      </div>
    </div>
  );
}