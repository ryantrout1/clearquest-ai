import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Loader2 } from "lucide-react";

export default function QuestionsManager() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to new InterviewStructureManager
    console.log("🔄 QuestionsManager deprecated - redirecting to InterviewStructureManager");
    navigate(createPageUrl("InterviewStructureManager"), { replace: true });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
      <div className="text-center space-y-4">
        <Loader2 className="w-12 h-12 text-blue-400 animate-spin mx-auto" />
        <p className="text-slate-300">Redirecting to Interview Structure Manager...</p>
      </div>
    </div>
  );
}