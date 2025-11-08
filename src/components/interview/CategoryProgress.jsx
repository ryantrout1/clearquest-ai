import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, CheckCircle, Circle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export default function CategoryProgress({ 
  categories, 
  currentCategory, 
  onContinue, 
  isInitial, 
  isComplete 
}) {
  const totalQuestions = 162;
  const totalCompleted = categories.reduce((sum, cat) => sum + (cat.answered_questions || 0), 0);
  const overallProgress = Math.round((totalCompleted / totalQuestions) * 100);

  // Determine if this is a returning candidate (has any answers)
  const isReturning = totalCompleted > 0;

  // Determine if this is a category transition (not initial, not complete)
  const isCategoryTransition = !isInitial && !isComplete;

  // Define the 12 sections with their names
  const sections = [
    "Applications with Other LE Agencies",
    "Driving Record",
    "Criminal Involvement / Police Contacts",
    "Extremist Organizations",
    "Sexual Activities",
    "Financial History",
    "Illegal Drug / Narcotic History",
    "Alcohol History",
    "Military History",
    "Employment History",
    "Prior Law Enforcement",
    "General Disclosures & Eligibility"
  ];

  // Match categories to sections and determine completion
  const sectionData = sections.map(sectionName => {
    const category = categories.find(cat => cat.category_label === sectionName);
    const isCompleted = category ? 
      (category.answered_questions >= category.total_questions && category.total_questions > 0) : 
      false;
    return {
      name: sectionName,
      completed: isCompleted,
      answered: category?.answered_questions || 0,
      total: category?.total_questions || 0
    };
  });

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
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
                Interview Complete
              </h2>
              <p className="text-slate-300">
                All 162 questions answered across 12 sections
              </p>
            </div>

            <div className="bg-slate-900/50 rounded-lg p-4">
              <p className="text-sm text-slate-400">
                Your responses have been recorded and encrypted. An investigator will review your interview shortly.
              </p>
            </div>

            <Button
              onClick={onContinue}
              size="lg"
              className="bg-blue-600 hover:bg-blue-700 text-white w-full md:w-auto px-8"
            >
              Return to Dashboard
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 max-w-3xl mx-auto">
      <CardContent className="p-6 md:p-8">
        {/* Header */}
        <div className="text-center space-y-4 mb-8">
          <div className="flex justify-center">
            <div className="p-4 rounded-full bg-blue-600/20">
              <Shield className="w-12 h-12 text-blue-400" />
            </div>
          </div>
          
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
              {isCategoryTransition ? (
                <>Section Complete</>
              ) : (
                <>Interview Overview</>
              )}
            </h2>
            <p className="text-slate-300">
              12 sections • 162 total questions
            </p>
          </div>
        </div>

        {/* Sections Grid - Two Columns */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-white mb-4">All Sections</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sectionData.map((section, idx) => (
              <div 
                key={idx}
                className="flex items-start gap-3 p-3 rounded-lg bg-slate-900/30 border border-slate-700"
              >
                {section.completed ? (
                  <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <Circle className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
                )}
                <span className={cn(
                  "text-sm leading-tight",
                  section.completed ? "text-slate-300 line-through" : "text-white"
                )}>
                  {section.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Action Button */}
        <div className="space-y-4">
          <Button
            onClick={onContinue}
            size="lg"
            className="bg-blue-600 hover:bg-blue-700 text-white w-full"
          >
            {isCategoryTransition ? (
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