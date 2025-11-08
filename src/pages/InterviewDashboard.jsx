
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Shield, FileText, Clock, CheckCircle, AlertTriangle, Search, ArrowLeft, MessageSquare } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SessionCard from "../components/admin/SessionCard";
import StatsCard from "../components/admin/StatsCard";

export default function InterviewDashboard() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentUser, setCurrentUser] = useState(null);

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
          setCurrentUser({
            username: auth.username,
            email: `${auth.username.toLowerCase()}@clearquest.ai`,
            role: "SUPER_ADMIN"
          });
          return;
        } catch (err) {
          console.error("Error parsing admin auth:", err);
        }
      }

      // Otherwise check Base44 authentication
      const user = await base44.auth.me();
      setCurrentUser({
        username: user.first_name,
        email: user.email,
        role: user.role
      });
    } catch (err) {
      navigate(createPageUrl("AdminLogin"));
    }
  };

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => base44.entities.InterviewSession.list('-created_date'),
    refetchInterval: 5000,
    enabled: !!currentUser
  });

  const handleLogout = () => {
    sessionStorage.removeItem("clearquest_admin_auth");
    window.location.href = createPageUrl("Home");
  };

  const filteredSessions = sessions.filter(session => {
    const matchesSearch = session.session_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         session.department_code?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || session.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: sessions.length,
    inProgress: sessions.filter(s => s.status === "in_progress").length,
    completed: sessions.filter(s => s.status === "completed").length,
    flagged: sessions.filter(s => s.red_flags?.length > 0).length
  };

  if (!currentUser) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <Link to={createPageUrl("HomeHub")}>
            <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-slate-700 mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>
          
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white flex items-center gap-2 md:gap-3 break-words">
                <Shield className="w-6 h-6 md:w-8 md:h-8 text-blue-400 flex-shrink-0" />
                <span>Interview Dashboard</span>
              </h1>
              <p className="text-sm md:text-base text-slate-300 mt-2">
                Monitor and manage interview sessions • Logged in as {currentUser.username}
              </p>
            </div>
            <Button 
              variant="outline" 
              onClick={handleLogout}
              className="w-full md:w-auto bg-slate-900/50 border-slate-600 text-white hover:bg-slate-800 hover:text-white hover:border-slate-500"
            >
              Logout
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6 mb-6 md:mb-8">
          <StatsCard
            title="Total Sessions"
            value={stats.total}
            icon={FileText}
            color="blue"
          />
          <StatsCard
            title="In Progress"
            value={stats.inProgress}
            icon={Clock}
            color="orange"
          />
          <StatsCard
            title="Completed"
            value={stats.completed}
            icon={CheckCircle}
            color="green"
          />
          <StatsCard
            title="Flagged"
            value={stats.flagged}
            icon={AlertTriangle}
            color="red"
          />
        </div>

        {/* Filters */}
        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 mb-6">
          <CardContent className="p-4 md:p-6">
            <div className="flex flex-col gap-4">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  placeholder="Search by session code or department..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-slate-900/50 border-slate-600 text-white"
                />
              </div>
              
              <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full">
                <TabsList className="bg-slate-900/50 w-full grid grid-cols-4">
                  <TabsTrigger value="all" className="text-xs md:text-sm">All</TabsTrigger>
                  <TabsTrigger value="in_progress" className="text-xs md:text-sm">In Progress</TabsTrigger>
                  <TabsTrigger value="completed" className="text-xs md:text-sm">Completed</TabsTrigger>
                  <TabsTrigger value="paused" className="text-xs md:text-sm">Paused</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardContent>
        </Card>

        {/* Sessions List */}
        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
          <CardHeader>
            <div className="flex flex-col gap-4">
              <CardTitle className="text-white text-lg md:text-xl">
                Interview Sessions ({filteredSessions.length})
              </CardTitle>
              <Link to={createPageUrl("StartInterview")} className="w-full md:w-auto">
                <Button size="sm" className="w-full md:w-auto bg-blue-600 hover:bg-blue-700">
                  New Interview
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-4 md:p-6">
            {isLoading ? (
              <div className="text-center py-12 text-slate-400">
                Loading sessions...
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="text-center py-12 space-y-4">
                <FileText className="w-16 h-16 text-slate-600 mx-auto" />
                <p className="text-slate-400 text-sm">
                  {searchTerm || statusFilter !== "all" 
                    ? "No sessions match your filters" 
                    : "No interview sessions yet"}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredSessions.map(session => (
                  <SessionCard key={session.id} session={session} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

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
