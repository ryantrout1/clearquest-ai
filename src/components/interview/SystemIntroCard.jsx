import React from "react";
import { Button } from "@/components/ui/button";
import { Shield, CheckCircle } from "lucide-react";

/**
 * Inline system card for interview intro (replaces modal)
 * Stateless, presentational component
 */
export default function SystemIntroCard({ onNext }) {
  return (
    <div className="bg-slate-800/95 backdrop-blur-sm border-2 border-blue-500/50 rounded-xl p-8 shadow-2xl max-w-2xl mx-auto">
      <div className="text-center mb-6">
        <div className="flex justify-center mb-4">
          <div className="p-4 rounded-full bg-blue-600/20">
            <Shield className="w-12 h-12 text-blue-400" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">
          Welcome to your ClearQuest Interview
        </h2>
        <p className="text-slate-300 leading-relaxed">
          This confidential interview will help us understand your background. 
          Please answer all questions honestly and completely.
        </p>
      </div>

      <div className="space-y-3 mb-6">
        <div className="flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
          <p className="text-slate-300 text-sm leading-relaxed">
            All responses are encrypted and stored securely
          </p>
        </div>
        <div className="flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
          <p className="text-slate-300 text-sm leading-relaxed">
            You can pause at any time and resume later using your Dept Code and File Number
          </p>
        </div>
        <div className="flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
          <p className="text-slate-300 text-sm leading-relaxed">
            Once submitted, answers cannot be changed—contact your investigator after the interview if corrections are needed
          </p>
        </div>
      </div>

      <Button
        onClick={onNext}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 text-lg font-semibold"
      >
        Next
      </Button>
    </div>
  );
}