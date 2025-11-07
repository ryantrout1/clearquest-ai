import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Shield, CheckCircle, Circle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export default function CategoryProgress({ 
  categories = [], 
  currentCategory = null,
  onContinue,
  isInitial = false,
  isComplete = false 
}) {
  const totalQuestions = categories.reduce((sum, cat) => sum + (cat.total_questions || 0), 0);
  const answeredQuestions = categories.reduce((sum, cat) => sum + (cat.answered_questions || 0), 0);
  const overallProgress = totalQuestions > 0 ? Math.round((answeredQuestions / totalQuestions) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-4">
      {/* Header */}
      <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Shield className="w-12 h-12 text-blue-400" />
          </div>
          <CardTitle className="text-2xl text-white">
            {isInitial && "Interview Overview"}
            {isComplete && "Interview Complete"}
            {!isInitial && !isComplete && currentCategory && `Entering: ${currentCategory.category_label}`}
          </CardTitle>
          <CardDescription className="text-slate-300 text-base">
            {isInitial && "Here's what we'll cover in this interview"}
            {isComplete && "Thank you for completing all sections"}
            {!isInitial && !isComplete && currentCategory?.description}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Overall Progress */}
      {!isInitial && (
        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
          <CardContent className="p-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-slate-300 font-medium">Overall Progress</span>
                <span className="text-blue-400 font-bold">{answeredQuestions} / {totalQuestions} questions</span>
              </div>
              <Progress value={overallProgress} className="h-3" />
              <p className="text-sm text-slate-400 text-center">
                {overallProgress}% Complete
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Categories List */}
      <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Interview Sections</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {categories.map((category, idx) => {
            const progress = category.total_questions > 0 
              ? Math.round((category.answered_questions / category.total_questions) * 100) 
              : 0;
            const isComplete = progress === 100;
            const isCurrent = currentCategory?.category_id === category.category_id;
            const isPending = progress === 0;

            return (
              <div
                key={category.category_id}
                className={cn(
                  "border rounded-lg p-4 transition-all",
                  isCurrent && "border-blue-500 bg-blue-950/20",
                  isComplete && "border-green-500/30 bg-green-950/10",
                  isPending && "border-slate-700 bg-slate-900/30"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-1">
                    {isComplete ? (
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    ) : (
                      <Circle className={cn(
                        "w-5 h-5",
                        isCurrent ? "text-blue-400 fill-blue-400" : "text-slate-500"
                      )} />
                    )}
                  </div>
                  
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className={cn(
                          "font-medium",
                          isCurrent && "text-blue-400",
                          isComplete && "text-green-400",
                          isPending && "text-slate-300"
                        )}>
                          {idx + 1}. {category.category_label}
                        </h3>
                        {(isInitial || isCurrent) && (
                          <p className="text-sm text-slate-400 mt-1">
                            {category.description}
                          </p>
                        )}
                      </div>
                      <span className="text-sm text-slate-400 whitespace-nowrap">
                        {category.answered_questions || 0} / {category.total_questions || 0}
                      </span>
                    </div>
                    
                    {!isInitial && (
                      <Progress 
                        value={progress} 
                        className={cn(
                          "h-2",
                          isComplete && "[&>div]:bg-green-500",
                          isCurrent && "[&>div]:bg-blue-500"
                        )} 
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Continue Button */}
      {onContinue && (
        <div className="flex justify-center pt-4">
          <Button
            size="lg"
            onClick={onContinue}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8"
          >
            {isInitial && (
              <>
                Begin Interview
                <ArrowRight className="w-5 h-5 ml-2" />
              </>
            )}
            {isComplete && "Return to Dashboard"}
            {!isInitial && !isComplete && (
              <>
                Continue to This Section
                <ArrowRight className="w-5 h-5 ml-2" />
              </>
            )}
          </Button>
        </div>
      )}

      {isInitial && (
        <p className="text-center text-sm text-slate-400">
          Each section contains targeted questions. Some answers may trigger detailed follow-ups.
        </p>
      )}
    </div>
  );
}