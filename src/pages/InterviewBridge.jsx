/**
 * ============================================================================
 * INTERVIEW BRIDGE - Session ID Routing Proxy
 * ============================================================================
 * 
 * Purpose: Bypass platform query param stripping on direct CandidateInterview navigation
 * 
 * Flow:
 * 1. StartInterview → InterviewBridge (with sid + session params)
 * 2. InterviewBridge → CandidateInterview (session param restored)
 * 
 * This page exists ONLY to forward session IDs reliably. It renders no UI.
 */

import React, { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import PublicAppShell from "../components/PublicAppShell";

export default function InterviewBridge() {
  const didForwardRef = useRef(false);
  
  useEffect(() => {
    // ONE-SHOT GUARD: Only forward once per mount
    if (didForwardRef.current) return;
    didForwardRef.current = true;
    
    // Parse session ID from URL (both formats)
    const urlParams = new URLSearchParams(window.location.search || "");
    const sessionId = urlParams.get('session') || urlParams.get('sid') || null;
    
    if (sessionId) {
      // Forward to session query route (static route, no 404)
      const params = new URLSearchParams(window.location.search || "");
      params.set("sid", sessionId);
      const to = `/candidateinterviewsession?${params.toString()}`;
      
      console.log('[INTERVIEW_BRIDGE][FORWARD_TO_SESSION_QUERY_ROUTE]', {
        sessionId,
        to
      });
      
      // Forward to session query route
      window.location.replace(to);
    } else {
      // No session - return to StartInterview
      const redirectUrl = `/startinterview${window.location.search || ""}`;
      
      console.log('[INTERVIEW_BRIDGE][MISSING_SESSION]', {
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