import React, { useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Eye, MoreVertical, Trash2, Clock } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const statusConfig = {
  in_progress: { label: "In Progress", color: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
  completed: { label: "Completed", color: "bg-green-500/20 text-green-300 border-green-500/30" },
  paused: { label: "Paused", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  error: { label: "Error", color: "bg-red-500/20 text-red-300 border-red-500/30" }
};

const riskConfig = {
  low: { label: "Low Risk", color: "bg-green-500/20 text-green-300 border-green-500/30" },
  moderate: { label: "Moderate Risk", color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
  elevated: { label: "Elevated Risk", color: "bg-red-500/20 text-red-300 border-red-500/30" }
};

export default function SessionCard({ session }) {
  const queryClient = useQueryClient();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch actual response and follow-up counts for this session
  const { data: responses = [] } = useQuery({
    queryKey: ['session-responses', session.id],
    queryFn: () => base44.entities.Response.filter({ session_id: session.id }),
    staleTime: 5000
  });

  const { data: followups = [] } = useQuery({
    queryKey: ['session-followups', session.id],
    queryFn: () => base44.entities.FollowUpResponse.filter({ session_id: session.id }),
    staleTime: 5000
  });

  // Calculate actual progress from responses
  const answeredCount = responses.length;
  const completionPercentage = Math.round((answeredCount / 162) * 100);
  const followupsCount = followups.length;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      // Delete all responses associated with this session
      for (const response of responses) {
        await base44.entities.Response.delete(response.id);
      }

      // Delete all follow-up responses
      for (const followup of followups) {
        await base44.entities.FollowUpResponse.delete(followup.id);
      }

      // Delete the session itself
      await base44.entities.InterviewSession.delete(session.id);

      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      toast.success("Session deleted successfully");
      setIsDeleteDialogOpen(false);
    } catch (err) {
      console.error("Error deleting session:", err);
      toast.error("Failed to delete session");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Card className="bg-slate-900/30 border-slate-700 hover:border-slate-600 transition-colors">
        <CardContent className="p-4">
          {/* Header Row */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <h3 className="text-base md:text-lg font-semibold text-white break-all">
                {session.session_code}
              </h3>
              <p className="text-xs md:text-sm text-slate-400 mt-1">
                Department: {session.department_code} • File: {session.file_number}
              </p>
            </div>
            
            {/* Action Menu - Mobile & Desktop */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge className={cn("text-xs", statusConfig[session.status]?.color)}>
                {statusConfig[session.status]?.label}
              </Badge>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-800"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700">
                  <DropdownMenuItem asChild className="cursor-pointer">
                    <Link to={createPageUrl(`SessionDetails?id=${session.id}`)} className="flex items-center">
                      <Eye className="w-4 h-4 mr-2" />
                      View Details
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setIsDeleteDialogOpen(true)}
                    className="cursor-pointer text-red-400 focus:text-red-300 focus:bg-red-950/20"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <div>
              <p className="text-xs text-slate-500">Progress</p>
              <p className="text-sm md:text-base font-semibold text-blue-400">
                {completionPercentage}%
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Questions</p>
              <p className="text-sm md:text-base font-semibold text-white">
                {answeredCount}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Follow-ups</p>
              <p className="text-sm md:text-base font-semibold text-white">
                {followupsCount}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Risk Level</p>
              <Badge className={cn("text-xs mt-1", riskConfig[session.risk_rating]?.color)}>
                {riskConfig[session.risk_rating]?.label}
              </Badge>
            </div>
          </div>

          {/* Footer - Date */}
          <div className="flex items-center gap-2 text-xs text-slate-500 pt-3 border-t border-slate-700">
            <Clock className="w-3 h-3" />
            <span>Started {format(new Date(session.created_date), "MMM d, yyyy 'at' h:mm a")}</span>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="bg-slate-800 border-slate-700 max-w-md mx-4">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Interview Session?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-300">
              This will permanently delete session <span className="font-semibold text-white">{session.session_code}</span> and all associated responses. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-700 text-white border-slate-600 hover:bg-slate-600">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}