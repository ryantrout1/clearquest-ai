
import React, { useState } from 'react';
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, FileText, AlertTriangle, Eye, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";

export default function SessionCard({ session }) {
  const queryClient = useQueryClient();
  const [isDeleting, setIsDeleting] = useState(false);

  const statusConfig = {
    in_progress: { label: "In Progress", color: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
    completed: { label: "Completed", color: "bg-green-500/20 text-green-300 border-green-500/30" },
    paused: { label: "Paused", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
    error: { label: "Error", color: "bg-red-500/20 text-red-300 border-red-500/30" }
  };

  const riskConfig = {
    low: { label: "Low Risk", color: "bg-green-500/20 text-green-300 border-green-500/30" },
    moderate: { label: "Moderate", color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
    elevated: { label: "Elevated", color: "bg-red-500/20 text-red-300 border-red-500/30" }
  };

  const status = statusConfig[session.status] || statusConfig.in_progress;
  const risk = riskConfig[session.risk_rating] || riskConfig.low;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      // Delete all related responses first
      const responses = await base44.entities.Response.filter({ session_id: session.id });
      for (const response of responses) {
        await base44.entities.Response.delete(response.id);
      }

      // Delete all related follow-up responses
      const followups = await base44.entities.FollowUpResponse.filter({ session_id: session.id });
      for (const followup of followups) {
        await base44.entities.FollowUpResponse.delete(followup.id);
      }

      // Delete the session
      await base44.entities.InterviewSession.delete(session.id);
      
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      
      toast.success("Interview session deleted successfully");
    } catch (err) {
      console.error("Error deleting session:", err);
      toast.error("Failed to delete session");
      setIsDeleting(false);
    }
  };

  return (
    <Card className="bg-slate-900/30 border-slate-700 hover:border-blue-500/50 transition-colors">
      <CardContent className="p-4 md:p-6">
        <div className="flex flex-col gap-4">
          <div className="space-y-3 flex-1">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="text-base md:text-lg font-semibold text-white flex items-center gap-2 break-all">
                  {session.session_code}
                  {session.red_flags?.length > 0 && (
                    <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  )}
                </h3>
                <p className="text-xs md:text-sm text-slate-400 mt-1 break-words">
                  Department: {session.department_code} • File: {session.file_number}
                </p>
              </div>
              <Badge className={cn("border self-start whitespace-nowrap", status.color)}>
                {status.label}
              </Badge>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs md:text-sm">
              <div>
                <p className="text-slate-500">Progress</p>
                <p className="text-white font-medium">
                  {session.completion_percentage || 0}%
                </p>
              </div>
              <div>
                <p className="text-slate-500">Questions</p>
                <p className="text-white font-medium">
                  {session.total_questions_answered || 0}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Follow-ups</p>
                <p className="text-white font-medium">
                  {session.followups_triggered || 0}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Risk Level</p>
                <Badge className={cn("text-xs", risk.color)}>
                  {risk.label}
                </Badge>
              </div>
            </div>

            <div className="flex flex-col gap-2 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 flex-shrink-0" />
                <span className="break-words">Started {format(new Date(session.created_date), "MMM d, yyyy 'at' h:mm a")}</span>
              </span>
              {session.completed_date && (
                <span className="flex items-center gap-1">
                  <FileText className="w-3 h-3 flex-shrink-0" />
                  <span className="break-words">Completed {format(new Date(session.completed_date), "MMM d, yyyy 'at' h:mm a")}</span>
                </span>
              )}
            </div>

            {session.red_flags?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {session.red_flags.slice(0, 3).map((flag, idx) => (
                  <Badge key={idx} variant="outline" className="text-red-300 border-red-500/30 bg-red-950/30 text-xs break-words">
                    {flag}
                  </Badge>
                ))}
                {session.red_flags.length > 3 && (
                  <Badge variant="outline" className="text-slate-300 border-slate-600 bg-slate-900/50 text-xs">
                    +{session.red_flags.length - 3} more
                  </Badge>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col md:flex-row gap-2 w-full md:min-w-[140px]">
            <Link to={createPageUrl(`SessionDetails?id=${session.id}`)} className="flex-1">
              <Button size="sm" variant="outline" className="w-full bg-slate-900/50 border-slate-600 text-slate-200 hover:bg-slate-800 hover:text-white hover:border-slate-500 text-xs md:text-sm">
                <Eye className="w-4 h-4 mr-2" />
                View Details
              </Button>
            </Link>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="w-full bg-slate-900/50 border-red-500/50 text-red-400 hover:bg-red-950/30 hover:text-red-300 hover:border-red-500 text-xs md:text-sm"
                  disabled={isDeleting}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-slate-800 border-slate-700">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-white">Delete Interview Session?</AlertDialogTitle>
                  <AlertDialogDescription className="text-slate-300">
                    This will permanently delete session <strong>{session.session_code}</strong> and all associated responses. 
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-slate-700 text-white border-slate-600">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={handleDelete}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    Delete Session
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
