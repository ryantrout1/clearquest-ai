import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Loader2 } from "lucide-react";

export default function Departments() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    handleRouting();
  }, []);

  const handleRouting = async () => {
    try {
      // Check for mock admin authentication first
      const adminAuth = sessionStorage.getItem("clearquest_admin_auth");
      if (adminAuth) {
        try {
          const auth = JSON.parse(adminAuth);
          // Mock super admins - check if they have a department_id
          // For now, always go to DepartmentDashboard (they can use System Admin button for system admin dashboard)
          navigate(createPageUrl("DepartmentDashboard"));
          return;
        } catch (err) {
          console.error("Error parsing admin auth:", err);
        }
      }

      // Otherwise check Base44 authentication
      const user = await base44.auth.me();

      if (user.department_id) {
        // Users with department go to their department dashboard
        navigate(createPageUrl(`DepartmentDashboard?id=${user.department_id}`));
      } else {
        // No department - go to home
        navigate(createPageUrl("HomeHub"));
      }
    } catch (err) {
      console.error("Error routing:", err);
      navigate(createPageUrl("AdminLogin"));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
      <Loader2 className="w-12 h-12 text-blue-400 animate-spin" />
    </div>
  );
}