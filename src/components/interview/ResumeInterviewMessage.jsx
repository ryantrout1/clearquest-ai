import React from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ArrowRight } from "lucide-react";

export default function ResumeInterviewMessage({ onContinue }) {
  return (
    <div className="flex justify-center my-6">
      <div className="bg-emerald-950/40 border-2 border-emerald-700/60 rounded-xl p-6 max-w-2xl shadow-xl">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-10 h-10 rounded-full bg-emerald-600/20 flex items-center justify-center flex-shrink-0 border-2 border-emerald-500/50">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-white mb-2">
              Welcome back!
            </h3>
            <p className="text-emerald-100 text-sm leading-relaxed">
              You're picking up right where you left off. When you're ready, continue with your next question.
            </p>
          </div>
        </div>
        
        <div className="flex justify-center mt-4">
          <Button
            onClick={onContinue}
            size="lg"
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 h-11"
          >
            Continue
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}