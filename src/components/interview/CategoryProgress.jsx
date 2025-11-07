import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Shield, CheckCircle, Circle, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export default function CategoryProgress({ 
  categories = [], 
  currentCategory = null,
  onContinue,
  isInitial = false,
  isComplete = false 
}) {
  const [showAll, setShowAll] = React.useState(isInitial);
  
  const totalQuestions = categories.reduce((sum, cat) => sum + (cat.total_questions || 0), 0);
  const answeredQuestions = categories.reduce((sum, cat) => sum + (cat.answered_questions || 0), 0);
  const overallProgress = totalQuestions > 0 ? Math.round((answeredQuestions / totalQuestions) * 100) : 0;

  // For transition view, show only relevant categories
  const displayCategories = isInitial || showAll 
    ? categories 
    : categories.filter(cat => {
        const progress = cat.total_questions > 0 
          ? Math.round((cat.answered_questions / cat.total_questions) * 100) 
          : 0;
        return progress === 100 || cat.category_id === currentCategory?.category_id || progress > 0;
      });

  // Find the previous completed category for transition view
  const previousCategory = !isInitial && !isComplete && currentCategory 
    ? categories.find(cat => {
        const progress = cat.total_questions > 0 
          ? Math.round((cat.answered_questions / cat.total_questions) * 100) 
          : 0;
        return progress === 100 && categories.indexOf(cat) < categories.indexOf(currentCategory);
      })
    : null;

  return (
    <div className="max-w-4xl w-full mx-auto space-y-4 md:space-y-6 p-4">
      {/* Header */}
      <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-3 md:mb-4">
            {!isInitial && !isComplete && currentCategory ? (
              <CheckCircle className="w-10 h-10 md:w-12 md:h-12 text-green-400" />
            ) : (
              <Shield className="w-10 h-10 md:w-12 md:h-12 text-blue-400" />
            )}
          </div>
          <CardTitle className="text-xl md:text-2xl text-white">
            {isInitial && "Interview Overview"}
            {isComplete && "Interview Complete"}
            {!isInitial && !isComplete && previousCategory && `${previousCategory.category_label} Complete`}
            {!isInitial && !isComplete && !previousCategory && currentCategory && `Next Section: ${currentCategory.category_label}`}
          </CardTitle>
          <CardDescription className="text-slate-300 text-sm md:text-base mt-2">
            {isInitial && `${categories.length} sections • ${totalQuestions} total questions`}
            {isComplete && "Thank you for completing all sections"}
            {!isInitial && !isComplete && previousCategory && "Great progress! Ready for the next section?"}
            {!isInitial && !isComplete && !previousCategory && currentCategory?.description}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Overall Progress */}
      {!isInitial && (
        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
          <CardContent className="p-4 md:p-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-slate-300 font-medium text-sm md:text-base">Overall Progress</span>
                <span className="text-blue-400 font-bold text-sm md:text-base">{answeredQuestions} / {totalQuestions} questions</span>
              </div>
              <Progress value={overallProgress} className="h-2 md:h-3" />
              <p className="text-xs md:text-sm text-slate-400 text-center">
                {overallProgress}% Complete
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Categories Grid */}
      <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-white text-base md:text-lg">
            {isInitial ? "All Sections" : "Progress Summary"}
          </CardTitle>
          {!isInitial && categories.length > 4 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAll(!showAll)}
              className="text-blue-400 hover:text-blue-300 text-xs md:text-sm"
            >
              {showAll ? (
                <>
                  <ChevronUp className="w-3 h-3 md:w-4 md:h-4 mr-1" />
                  Show Less
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3 md:w-4 md:h-4 mr-1" />
                  Show All
                </>
              )}
            </Button>
          )}
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
          {displayCategories.map((category, idx) => {
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
                  "border rounded-lg p-3 md:p-4 transition-all",
                  isCurrent && "border-blue-500 bg-blue-950/20 ring-2 ring-blue-500/20",
                  isComplete && !isCurrent && "border-green-500/30 bg-green-950/10",
                  isPending && !isCurrent && "border-slate-700 bg-slate-900/30"
                )}
              >
                <div className="flex items-start gap-2 md:gap-3">
                  <div className="mt-0.5 flex-shrink-0">
                    {isComplete ? (
                      <CheckCircle className="w-4 h-4 md:w-5 md:h-5 text-green-400" />
                    ) : (
                      <Circle className={cn(
                        "w-4 h-4 md:w-5 md:h-5",
                        isCurrent ? "text-blue-400 fill-blue-400" : "text-slate-500"
                      )} />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0 space-y-1 md:space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className={cn(
                        "font-medium text-xs md:text-sm leading-tight",
                        isCurrent && "text-blue-400",
                        isComplete && !isCurrent && "text-green-400",
                        isPending && "text-slate-300"
                      )}>
                        {category.category_label}
                      </h3>
                      <span className="text-xs text-slate-400 whitespace-nowrap flex-shrink-0">
                        {category.answered_questions || 0}/{category.total_questions || 0}
                      </span>
                    </div>
                    
                    {(isInitial || isCurrent) && (
                      <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
                        {category.description}
                      </p>
                    )}
                    
                    {!isInitial && (
                      <Progress 
                        value={progress} 
                        className={cn(
                          "h-1 md:h-1.5",
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
        <div className="flex justify-center pt-2 md:pt-4">
          <Button
            size="lg"
            onClick={onContinue}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 md:px-8 w-full md:w-auto"
          >
            {isInitial && (
              <>
                Begin Interview
                <ArrowRight className="w-4 h-4 md:w-5 md:h-5 ml-2" />
              </>
            )}
            {isComplete && "Return to Dashboard"}
            {!isInitial && !isComplete && (
              <>
                Next Section
                <ArrowRight className="w-4 h-4 md:w-5 md:h-5 ml-2" />
              </>
            )}
          </Button>
        </div>
      )}

      {isInitial && (
        <p className="text-center text-xs md:text-sm text-slate-400 px-4">
          Some sections may be skipped based on your answers. Answer honestly - investigators review all responses.
        </p>
      )}
    </div>
  );
}