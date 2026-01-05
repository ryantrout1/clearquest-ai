/**
 * ============================================================================
 * CANDIDATE INTERVIEW SESSION - Path-Based Session ID Router
 * ============================================================================
 * 
 * Purpose: Bypass Base44 preview query param stripping on /candidateinterview
 * 
 * Flow:
 * 1. StartInterview → /candidateinterviewsession/<sessionId>?...
 * 2. Extract sessionId from path, store in window.__CQ_SESSION__
 * 3. Forward to /candidateinterview?... (CandidateInterview reads from global)
 * 
 * This page exists ONLY to forward session IDs reliably via path segment.
 */

import React, { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import PublicAppShell from "../components/PublicAppShell";

export default function CandidateInterviewSession() {
  const didForwardRef = useRef(false);
  
  useEffect(() => {
    // ONE-SHOT GUARD: Only forward once per mount
    if (didForwardRef.current) return;
    didForwardRef.current = true;
    
    // Parse sessionId from pathname: /candidateinterviewsession/<sessionId>
    const pathname = window.location.pathname;
    const segments = pathname.split('/').filter(Boolean);
    
    // Extract sessionId from last path segment
    const sessionId = segments[segments.length - 1] || null;
    
    if (sessionId && sessionId !== 'candidateinterviewsession') {
      // Store in global for CandidateInterview to read
      window.__CQ_SESSION__ = sessionId;
      
      // Forward to CandidateInterview with preserved query params
      const preservedSearch = window.location.search || "";
      const to = `/candidateinterview${preservedSearch}`;
      
      console.log('[CANDIDATE_INTERVIEW_SESSION][FORWARD]', {
        sessionId,
        to,
        fromPathname: pathname,
        preservedSearch
      });
      
      // Forward to CandidateInterview
      window.location.replace(to);
    } else {
      // No session - return to StartInterview
      const redirectUrl = `/startinterview${window.location.search || ""}`;
      
      console.log('[CANDIDATE_INTERVIEW_SESSION][MISSING_SESSION]', {
        pathname,
        search: window.location.search,
        redirectTo: redirectUrl
      });
      
      window.location.replace(redirectUrl);
    }
  }, []);
  
  return (
    <PublicAppShell>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin mx-auto" />
          <p className="text-slate-300">Starting interview...</p>
        </div>
      </div>
    </PublicAppShell>
  );
}