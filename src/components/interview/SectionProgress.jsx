import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, CheckCircle, Circle, ArrowRight, Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SectionProgress({ 
  sections, 
  currentSection, 
  onContinue, 
  isInitial, 
  isComplete,
  onDownloadReport,
  isDownloading,
  totalQuestions
}) {
  const totalCompleted = sections.reduce((sum, sec) => sum + (sec.answered_questions || 0), 0);
  const overallProgress = totalQuestions > 0 ? Math.round((totalCompleted / totalQuestions) * 100) : 0;

  const isReturning = totalCompleted > 0;
  const isSectionTransition = !isInitial && !isComplete;

  const activeSections = sections
    .filter(s => s.active !== false)
    .sort((a, b) => (a.section_order || 0) - (b.section_order || 0));

  const completedSections = activeSections.filter(s => 
    s.answered_questions >= s.total_questions && s.total_questions > 0
  );

  if (isComplete) {
    return (
      <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 max-w-3xl mx-auto">
        <CardContent className="p-6 md:p-8">
          <div className="text-center space-y-6">
            <div className="flex justify-center">
              <div className="p-4 rounded-full bg-green-600/20">
                <CheckCircle className="w-12 h-12 text-green-400" />
              </div>
            </div>
            
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
                Interview Complete
              </h2>
              <p className="text-lg text-green-400 mb-4">
                Thank you for your honesty and thoroughness.
              </p>
              <p className="text-slate-300 leading-relaxed">
                You've successfully completed all {totalQuestions} questions. Your responses demonstrate your commitment 
                to transparency and integrity—qualities essential to law enforcement.
              </p>
            </div>

            <div className="bg-slate-900/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Total Questions</span>
                <span className="text-white font-semibold">{totalCompleted} / {totalQuestions}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Sections Completed</span>
                <span className="text-white font-semibold">{completedSections.length} / {activeSections.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Completion</span>
                <span className="text-green-400 font-semibold">{overallProgress}%</span>
              </div>
            </div>

            <div className="bg-blue-950/30 border border-blue-800/50 rounded-lg p-4">
              <p className="text-sm text-blue-200 leading-relaxed">
                <strong>What's Next:</strong> Your responses have been encrypted and securely stored. 
                An investigator will review your interview and may contact you for follow-up verification. 
                Your candidness throughout this process reflects positively on your character.
              </p>
            </div>

            <Button
              onClick={onDownloadReport}
              disabled={isDownloading}
              size="lg"
              className="bg-blue-600 hover:bg-blue-700 text-white w-full md:w-auto px-8 h-12"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Generating Report...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5 mr-2" />
                  Download Your Interview Report
                </>
              )}
            </Button>

            <p className="text-xs text-slate-500">
              Your interview report will be downloaded as a PDF document containing all your responses.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 max-w-3xl mx-auto">
      <CardContent className="p-6 md:p-8">
        <div className="text-center space-y-4 mb-8">
          <div className="flex justify-center">
            <div className="p-4 rounded-full bg-blue-600/20">
              <Shield className="w-12 h-12 text-blue-400" />
            </div>
          </div>
          
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
              {isSectionTransition ? (
                <>Section Complete</>
              ) : (
                <>Interview Overview</>
              )}
            </h2>
            <p className="text-slate-300">
              {activeSections.length} sections • {totalQuestions} total questions
            </p>
          </div>
        </div>

        <div className="mb-8">
          <h3 className="text-lg font-semibold text-white mb-4">All Sections</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeSections.map((section) => {
              const isCompleted = section.answered_questions >= section.total_questions && section.total_questions > 0;
              return (
                <div 
                  key={section.section_id || section.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-slate-900/30 border border-slate-700"
                >
                  {isCompleted ? (
                    <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Circle className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
                  )}
                  <span className={cn(
                    "text-sm leading-tight",
                    isCompleted ? "text-slate-300 line-through" : "text-white"
                  )}>
                    {section.section_name || section.category_label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <Button
            onClick={onContinue}
            size="lg"
            className="bg-blue-600 hover:bg-blue-700 text-white w-full"
          >
            {isSectionTransition ? (
              <>Continue to Next Section</>
            ) : isReturning ? (
              <>Continue Interview</>
            ) : (
              <>Begin Interview</>
            )}
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
          
          <p className="text-xs text-center text-slate-400">
            Some sections may be skipped based on your answers. Answer honestly - investigators review all responses.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}