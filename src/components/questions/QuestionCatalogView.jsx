import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function QuestionCatalogView() {
  const [expandedCategory, setExpandedCategory] = useState(null);

  // Fetch all active questions
  const { data: allQuestions = [], isLoading } = useQuery({
    queryKey: ['all-questions'],
    queryFn: async () => {
      const questions = await base44.entities.Question.filter({ active: true });
      return questions.sort((a, b) => a.display_order - b.display_order);
    }
  });

  // Group by category and assign display numbers
  const categoriesWithQuestions = React.useMemo(() => {
    const grouped = {};
    let globalDisplayNumber = 1;
    
    allQuestions.forEach(q => {
      const category = q.category || 'Other';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push({
        ...q,
        display_number: globalDisplayNumber++
      });
    });
    
    return Object.entries(grouped).map(([name, questions]) => ({
      name,
      questions,
      count: questions.length
    }));
  }, [allQuestions]);

  const handleCategoryClick = (categoryName) => {
    setExpandedCategory(expandedCategory === categoryName ? null : categoryName);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {categoriesWithQuestions?.map((category) => {
        const isExpanded = expandedCategory === category.name;
        
        return (
          <Card 
            key={category.name}
            className="bg-slate-800/50 backdrop-blur-sm border-slate-700 hover:border-blue-500/50 transition-all"
          >
            <CardHeader 
              className="cursor-pointer p-4 md:p-6"
              onClick={() => handleCategoryClick(category.name)}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex-shrink-0">
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-blue-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-slate-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg md:text-xl text-white break-words">
                      {category.name}
                    </CardTitle>
                  </div>
                  <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 flex-shrink-0">
                    {category.count} questions
                  </Badge>
                </div>
              </div>
            </CardHeader>

            {isExpanded && (
              <CardContent className="pt-0 pb-4 md:pb-6 px-4 md:px-6">
                <div className="space-y-3 pl-8">
                  {category.questions.map((question) => (
                    <div 
                      key={question.id}
                      className="bg-slate-900/30 border border-slate-700 rounded-lg p-3 md:p-4"
                    >
                      <div className="flex items-start gap-3">
                        <Badge 
                          variant="outline" 
                          className="text-slate-400 border-slate-600 flex-shrink-0 mt-0.5"
                        >
                          {question.display_number}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm md:text-base text-white break-words">
                            {question.question_text}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <Badge className="bg-slate-700/50 text-slate-300 text-xs">
                              {question.question_id}
                            </Badge>
                            <Badge className="bg-green-500/20 text-green-300 border-green-500/30 text-xs">
                              {question.response_type}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}