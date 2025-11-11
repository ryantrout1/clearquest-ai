import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCategoryList, getQuestionsByCategory } from "@/utils/questionCatalog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function QuestionCatalogView() {
  const [expandedCategory, setExpandedCategory] = useState(null);

  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ['question-categories'],
    queryFn: getCategoryList
  });

  const { data: categoryQuestions, isLoading: questionsLoading } = useQuery({
    queryKey: ['category-questions', expandedCategory],
    queryFn: () => getQuestionsByCategory(expandedCategory),
    enabled: !!expandedCategory
  });

  const handleCategoryClick = (categoryId) => {
    setExpandedCategory(expandedCategory === categoryId ? null : categoryId);
  };

  if (categoriesLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {categories?.map((category) => {
        const isExpanded = expandedCategory === category.Category_ID;
        
        return (
          <Card 
            key={category.Category_ID}
            className="bg-slate-800/50 backdrop-blur-sm border-slate-700 hover:border-blue-500/50 transition-all"
          >
            <CardHeader 
              className="cursor-pointer p-4 md:p-6"
              onClick={() => handleCategoryClick(category.Category_ID)}
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
                      {category.Category_Name}
                    </CardTitle>
                  </div>
                  <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 flex-shrink-0">
                    {category.Count_Active} questions
                  </Badge>
                </div>
              </div>
            </CardHeader>

            {isExpanded && (
              <CardContent className="pt-0 pb-4 md:pb-6 px-4 md:px-6">
                {questionsLoading ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                  </div>
                ) : (
                  <div className="space-y-3 pl-8">
                    {categoryQuestions?.map((question) => (
                      <div 
                        key={question.Question_ID}
                        className="bg-slate-900/30 border border-slate-700 rounded-lg p-3 md:p-4"
                      >
                        <div className="flex items-start gap-3">
                          <Badge 
                            variant="outline" 
                            className="text-slate-400 border-slate-600 flex-shrink-0 mt-0.5"
                          >
                            {question.Display_Number}
                          </Badge>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm md:text-base text-white break-words">
                              {question.Question_Text}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              <Badge className="bg-slate-700/50 text-slate-300 text-xs">
                                {question.Question_ID}
                              </Badge>
                              <Badge className="bg-green-500/20 text-green-300 border-green-500/30 text-xs">
                                {question.Response_Type}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}