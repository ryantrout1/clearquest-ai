import React from "react";
import { Button } from "@/components/ui/button";
import { Shield, CheckCircle2, ArrowRight } from "lucide-react";

export default function StartResumeMessage({ 
  mode, 
  currentSectionName, 
  currentQuestionNumber, 
  progressPercent,
  onStart 
}) {
  if (mode === 'start') {
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
              <p className="text-slate-300 text-sm pl-6" style={{ textIndent: '-1.5rem' }}>One question at a time, at your own pace</p>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
              <p className="text-slate-300 text-sm pl-6" style={{ textIndent: '-1.5rem' }}>Clear, complete, and honest answers help investigators understand the full picture</p>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
              <p className="text-slate-300 text-sm pl-6" style={{ textIndent: '-1.5rem' }}>You can pause and come back — we'll pick up where you left off</p>
            </div>
          </div>
          
          <div className="flex justify-center">
            <Button
              onClick={onStart}
              size="lg"
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 h-12"
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // mode === 'resume'
  return (
    <div className="flex justify-center my-6">
      <div className="bg-emerald-950/40 border-2 border-emerald-700/60 rounded-xl p-6 max-w-2xl shadow-xl">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-emerald-600/20 flex items-center justify-center flex-shrink-0 border-2 border-emerald-500/50">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="flex-1 space-y-3">
            <h3 className="text-lg font-bold text-white">
              Welcome back
            </h3>
            <p className="text-emerald-100 text-sm leading-relaxed">
              You're resuming your interview from <strong>{currentSectionName || 'where you left off'}</strong>
              {currentQuestionNumber && `, around Question ${currentQuestionNumber}`}.
            </p>
            {progressPercent !== undefined && (
              <p className="text-emerald-100 text-sm leading-relaxed">
                You're about <strong>{progressPercent}%</strong> complete. Take a breath and continue when you're ready.
              </p>
            )}
            <div className="pt-2">
              <Button 
                onClick={onStart}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6"
              >
                <ArrowRight className="w-4 h-4 mr-2" />
                Continue Interview
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}