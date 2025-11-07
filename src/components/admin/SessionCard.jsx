
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
    in_progress: { label: "In Progress", color: "bg-orange-100 text-orange-800 border-orange-200" },
    completed: { label: "Completed", color: "bg-green-100 text-green-800 border-green-200" },
    paused: { label: "Paused", color: "bg-blue-100 text-blue-800 border-blue-200" },
    error: { label: "Error", color: "bg-red-100 text-red-800 border-red-200" }
  };

  const riskConfig = {
    low: { label: "Low Risk", color: "bg-green-100 text-green-800" },
    moderate: { label: "Moderate", color: "bg-yellow-100 text-yellow-800" },
    elevated: { label: "Elevated", color: "bg-red-100 text-red-800" }
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
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row justify-between gap-4">
          <div className="space-y-3 flex-1">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  {session.session_code}
                  {session.red_flags?.length > 0 && (
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                  )}
                </h3>
                <p className="text-sm text-slate-400 mt-1">
                  Department: {session.department_code} • File: {session.file_number}
                </p>
              </div>
              <Badge className={cn("border", status.color)}>
                {status.label}
              </Badge>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
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

            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Started {format(new Date(session.created_date), "MMM d, yyyy 'at' h:mm a")}
              </span>
              {session.completed_date && (
                <span className="flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  Completed {format(new Date(session.completed_date), "MMM d, yyyy 'at' h:mm a")}
                </span>
              )}
            </div>

            {session.red_flags?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {session.red_flags.slice(0, 3).map((flag, idx) => (
                  <Badge key={idx} variant="outline" className="text-red-400 border-red-400/30 bg-red-950/20">
                    {flag}
                  </Badge>
                ))}
                {session.red_flags.length > 3 && (
                  <Badge variant="outline" className="text-slate-400 border-slate-600">
                    +{session.red_flags.length - 3} more
                  </Badge>
                )}
              </div>
            )}
          </div>

          <div className="flex md:flex-col gap-2">
            <Link to={createPageUrl(`SessionDetails?id=${session.id}`)} className="flex-1 md:flex-none">
              <Button size="sm" variant="outline" className="w-full border-slate-600 text-white hover:bg-slate-700">
                <Eye className="w-4 h-4 mr-2" />
                View Details
              </Button>
            </Link>
            {session.status === "in_progress" && (
              <Link to={createPageUrl(`Interview?session=${session.id}`)} className="flex-1 md:flex-none">
                <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-700">
                  Resume
                </Button>
              </Link>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="w-full border-red-600/50 text-red-400 hover:bg-red-950/30 hover:text-red-300"
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
