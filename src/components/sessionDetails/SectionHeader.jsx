import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Clock, AlertCircle, CheckCircle, TrendingUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  computeSectionKPIs,
  computeSectionTimeAnalytics,
  computeSectionBadges,
  generateSectionSummary,
  formatDuration
} from "./sectionAnalytics";

/**
 * Smart Section Header with Analytics, KPIs, and AI Summary
 */
export default function SectionHeader({
  category,
  allResponses,
  allFollowups,
  isCollapsed,
  onToggle,
  sectionAISummary
}) {
  const [showFullSummary, setShowFullSummary] = useState(false);

  const sectionResponses = allResponses.filter(r => r.section_name === category);
  
  const kpis = computeSectionKPIs(category, allResponses, allFollowups);
  const timeAnalytics = computeSectionTimeAnalytics(category, allResponses);
  const badges = computeSectionBadges(kpis, timeAnalytics);

  // Read from stored summary passed as prop
  const aiSummary = sectionAISummary;

  const getBadgeColor = (color) => {
    const colors = {
      green: "bg-green-500/20 text-green-300 border-green-500/30",
      orange: "bg-orange-500/20 text-orange-300 border-orange-500/30",
      red: "bg-red-500/20 text-red-300 border-red-500/30",
      yellow: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
      purple: "bg-purple-500/20 text-purple-300 border-purple-500/30"
    };
    return colors[color] || colors.green;
  };

  const getRiskColor = (riskLevel) => {
    if (riskLevel === "High") return "text-red-400";
    if (riskLevel === "Medium") return "text-yellow-400";
    return "text-green-400";
  };

  return (
    <div className="sticky top-28 md:top-32 bg-slate-800 border-l-4 border-blue-500 z-10">
      {/* Main Header Row */}
      <div className="py-3 px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className="text-slate-300 hover:text-white hover:bg-slate-700 h-8 px-2 flex-shrink-0"
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </Button>

          <h2 className="text-sm font-bold text-white uppercase tracking-wide flex-shrink min-w-0">
            {category}
          </h2>

          {/* Badges */}
          <div className="hidden lg:flex items-center gap-1.5 flex-wrap">
            {badges.map((badge, idx) => (
              <Badge
                key={idx}
                className={cn("text-xs px-2 py-0.5", getBadgeColor(badge.color))}
              >
                {badge.label}
              </Badge>
            ))}
          </div>
        </div>

        {/* KPIs */}
        <div className="hidden md:flex items-center gap-4 text-xs flex-shrink-0">
          <div className="text-center">
            <div className="text-slate-400">Questions</div>
            <div className="text-white font-bold">{kpis.totalQuestions}</div>
          </div>
          <div className="text-center">
            <div className="text-green-400">Yes</div>
            <div className="text-white font-bold">{kpis.yesCount}</div>
          </div>
          <div className="text-center">
            <div className="text-slate-400">No</div>
            <div className="text-white font-bold">{kpis.noCount}</div>
          </div>
          {kpis.followUpCount > 0 && (
            <div className="text-center">
              <div className="text-orange-400">Follow-Ups</div>
              <div className="text-white font-bold">{kpis.followUpCount}</div>
            </div>
          )}
          {timeAnalytics.totalSeconds > 0 && (
            <div className="text-center">
              <Clock className="w-3 h-3 text-blue-400 mx-auto mb-0.5" />
              <div className="text-white font-bold">{formatDuration(timeAnalytics.totalSeconds)}</div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Badges */}
      {badges.length > 0 && (
        <div className="lg:hidden px-4 pb-2 flex flex-wrap gap-1.5">
          {badges.map((badge, idx) => (
            <Badge
              key={idx}
              className={cn("text-xs px-2 py-0.5", getBadgeColor(badge.color))}
            >
              {badge.label}
            </Badge>
          ))}
        </div>
      )}

      {/* Mobile KPIs */}
      <div className="md:hidden px-4 pb-3 grid grid-cols-4 gap-2 text-xs">
        <div className="text-center">
          <div className="text-slate-400">Questions</div>
          <div className="text-white font-bold">{kpis.totalQuestions}</div>
        </div>
        <div className="text-center">
          <div className="text-green-400">Yes</div>
          <div className="text-white font-bold">{kpis.yesCount}</div>
        </div>
        <div className="text-center">
          <div className="text-slate-400">No</div>
          <div className="text-white font-bold">{kpis.noCount}</div>
        </div>
        {kpis.followUpCount > 0 && (
          <div className="text-center">
            <div className="text-orange-400">F-Ups</div>
            <div className="text-white font-bold">{kpis.followUpCount}</div>
          </div>
        )}
      </div>

      {/* AI Summary Section */}
      {!isCollapsed && (
        <div className="border-t border-slate-700 bg-slate-800/50 px-4 py-3">
          {aiSummary ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-base">🧠</span>
                  <span className="text-xs font-semibold text-blue-400 uppercase tracking-wide">
                    AI Investigator Assist
                  </span>
                </div>
                <Badge className={cn("text-xs", getBadgeColor(
                  aiSummary.riskLevel === "High" ? "red" : 
                  aiSummary.riskLevel === "Medium" ? "yellow" : "green"
                ))}>
                  AI Section Signal: {aiSummary.riskLevel === "High" ? "High Concern" : 
                    aiSummary.riskLevel === "Medium" ? "Moderate Concern" : "Low Concern"}
                </Badge>
              </div>

              <div
                className="text-sm text-slate-300 leading-relaxed"
              >
                {showFullSummary ? (
                  <div>{aiSummary.text}</div>
                ) : (
                  <div className="line-clamp-2 cursor-pointer hover:text-white transition-colors" onClick={() => setShowFullSummary(true)}>
                    {aiSummary.text}
                  </div>
                )}
              </div>

              {aiSummary.concerns && aiSummary.concerns.length > 0 && showFullSummary && (
                <div className="mt-2 space-y-1">
                  <div className="text-xs font-semibold text-yellow-400">Concerns:</div>
                  {aiSummary.concerns.map((concern, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                      <AlertCircle className="w-3 h-3 text-yellow-400 flex-shrink-0 mt-0.5" />
                      <span>{concern}</span>
                    </div>
                  ))}
                </div>
              )}

              {aiSummary.text.length > 100 && (
                <button
                  onClick={() => setShowFullSummary(!showFullSummary)}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors mt-1"
                >
                  {showFullSummary ? "Show less" : "Show more"}
                </button>
              )}
            </div>
          ) : (
            <div className="text-sm text-slate-500 italic">
              No summary available. Use 'Generate AI Summaries' to create one.
            </div>
          )}

          {/* Time Analytics Detail (only show when expanded) */}
          {showFullSummary && timeAnalytics.totalSeconds > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-700/50 grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-400">Avg per Question:</span>
                <span className="text-white font-medium ml-2">
                  {formatDuration(timeAnalytics.avgSecondsPerQuestion)}
                </span>
              </div>
              {timeAnalytics.slowestQuestion && (
                <div>
                  <span className="text-slate-400">Slowest:</span>
                  <span className="text-white font-medium ml-2">
                    {formatDuration(timeAnalytics.slowestQuestion.duration)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}