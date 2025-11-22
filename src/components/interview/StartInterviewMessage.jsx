import React from "react";
import { Button } from "@/components/ui/button";
import { Shield, CheckCircle2 } from "lucide-react";

export default function StartInterviewMessage({ onStart }) {
  return (
    <div className="flex justify-center my-6">
      <div className="bg-slate-800/95 border-2 border-blue-500/50 rounded-xl p-6 max-w-2xl shadow-2xl">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-12 h-12 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0 border-2 border-blue-500/50">
            <Shield className="w-6 h-6 text-blue-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-white mb-2">
              Welcome to your ClearQuest Interview
            </h2>
            <p className="text-slate-300 text-sm leading-relaxed mb-4">
              This interview is part of your application process. Here's what to expect:
            </p>
          </div>
        </div>
        
        <div className="space-y-2 mb-6 ml-16">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
            <p className="text-slate-300 text-sm">You will answer questions one at a time</p>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
            <p className="text-slate-300 text-sm">Honesty helps investigators understand your background</p>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
            <p className="text-slate-300 text-sm">You can pause and return anytime using your Dept Code and File Number</p>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
            <p className="text-slate-300 text-sm">Once submitted, answers cannot be changed</p>
          </div>
        </div>
        
        <div className="flex justify-center">
          <Button
            onClick={onStart}
            size="lg"
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 h-12"
          >
            <Shield className="w-5 h-5 mr-2" />
            Start Interview
          </Button>
        </div>
      </div>
    </div>
  );
}