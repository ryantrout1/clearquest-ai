import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";

export default function StartInterviewTest() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-8 text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-green-600/20 border-2 border-green-500 flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-green-400" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white">
            Route Test OK
          </h1>
          <p className="text-slate-300">
            StartInterviewTest page loaded successfully.
          </p>
        </div>
        
        <div className="pt-4 border-t border-slate-700">
          <Link to={createPageUrl("StartInterview")}>
            <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
              Go to StartInterview
            </Button>
          </Link>
        </div>
        
        <p className="text-xs text-slate-500">
          This page confirms Base44 routing registration works.
        </p>
      </div>
    </div>
  );
}