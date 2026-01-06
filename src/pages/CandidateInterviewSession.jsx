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
  
  // MOUNT LOG: Proof that this page loaded
  React.useEffect(() => {
    console.log('[CANDIDATE_INTERVIEW_SESSION][MOUNT]', {
      search: window.location.search,
      pathname: window.location.pathname,
      hash: window.location.hash || ""
    });
  }, []);
  
  useEffect(() => {
    // ONE-SHOT GUARD: Only forward once per mount
    if (didForwardRef.current) return;
    didForwardRef.current = true;
    
    // Parse sid from hash first, then query params
    const hashRaw = (window.location.hash || "").startsWith("#") ? window.location.hash.slice(1) : (window.location.hash || "");
    const hashParams = new URLSearchParams(hashRaw);
    const hashSid = hashParams.get("sid");
    
    const urlParams = new URLSearchParams(window.location.search || "");
    const sid = hashSid || urlParams.get('sid') || urlParams.get('session') || null;
    
    if (sid) {
      // Store in global for CandidateInterview to read
      window.__CQ_SESSION__ = sid;
      
      // Build forwarding URL without sid/session in query (will use global)
      const params = new URLSearchParams(window.location.search || "");
      params.delete("sid");
      params.delete("session");
      const to = `/candidateinterview?${params.toString()}`;
      
      console.log('[CANDIDATE_INTERVIEW_SESSION][FORWARD_QUERY]', {
        sid,
        to,
        fromSearch: window.location.search
      });
      
      // Forward to CandidateInterview
      window.location.replace(to);
    } else {
      // No session - return to StartInterview
      const redirectUrl = `/startinterview${window.location.search || ""}`;
      
      console.log('[CANDIDATE_INTERVIEW_SESSION][MISSING_SID]', {
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