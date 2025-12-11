import React from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";

export default function CandidateInterviewBackup() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-6">
      <div className="max-w-4xl mx-auto">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(createPageUrl("CandidateInterview"))}
          className="text-slate-400 hover:text-white hover:bg-slate-800 mb-4"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        
        <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-800/50 rounded-lg p-8 text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Backup Page</h1>
          <p className="text-slate-400">This is a backup page that should not be used.</p>
        </div>
      </div>
    </div>
  );
}