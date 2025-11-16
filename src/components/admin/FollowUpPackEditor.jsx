import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { X, AlertCircle, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function FollowUpPackEditor({ question, onClose }) {
  const [packData] = useState(() => {
    // This is a read-only viewer for now
    // The actual pack definitions are in interviewEngine.jsx
    return {
      packId: question.followup_pack,
      questionId: question.question_id,
      questionText: question.question_text
    };
  });

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="border-b border-slate-700 p-4 md:p-6 flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-white mb-2">Follow-Up Pack Configuration</h2>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs">{question.question_id}</Badge>
                <Badge className="bg-orange-600">{question.followup_pack || 'None'}</Badge>
              </div>
              <p className="text-sm text-slate-300 line-clamp-2">{question.question_text}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-slate-400 hover:text-white ml-2"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <Alert className="bg-blue-950/30 border-blue-800/50 text-blue-200 mb-4">
            <Info className="h-4 w-4" />
            <AlertDescription className="text-sm">
              <strong>Note:</strong> Follow-up pack definitions are currently managed in the code (interviewEngine.jsx).
              This panel shows the assigned pack. To modify pack steps, contact your development team.
            </AlertDescription>
          </Alert>

          {question.followup_pack ? (
            <div className="space-y-3">
              <div>
                <Label className="text-slate-300 text-sm">Assigned Pack</Label>
                <Input
                  value={question.followup_pack}
                  disabled
                  className="bg-slate-900/50 border-slate-600 text-slate-400 mt-1"
                />
              </div>

              <Alert className="bg-slate-900/30 border-slate-700">
                <AlertCircle className="h-4 w-4 text-slate-400" />
                <AlertDescription className="text-xs text-slate-300">
                  When a candidate answers "Yes" to this question, they will be prompted with the deterministic 
                  follow-up questions defined in <span className="font-mono bg-slate-800 px-1 rounded">{question.followup_pack}</span>.
                  After completing all follow-up questions, the AI Investigator will conduct additional probing 
                  to ensure the story is complete.
                </AlertDescription>
              </Alert>

              <div className="bg-slate-900/30 border border-slate-700 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-slate-300 mb-2">Pack Location</h4>
                <p className="text-xs text-slate-400 font-mono">
                  components/interviewEngine.jsx → FOLLOWUP_PACK_STEPS['{question.followup_pack}']
                </p>
              </div>
            </div>
          ) : (
            <Alert variant="destructive" className="bg-red-950/30 border-red-800/50">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                <strong>No follow-up pack assigned.</strong> For Yes/No questions, it's recommended to assign 
                a follow-up pack to gather detailed information when the candidate answers "Yes".
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className="border-t border-slate-700 p-4 md:p-6 flex justify-end">
          <Button onClick={onClose} className="bg-slate-700 hover:bg-slate-600">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

function Label({ children, className = "" }) {
  return <label className={`block text-sm font-medium ${className}`}>{children}</label>;
}