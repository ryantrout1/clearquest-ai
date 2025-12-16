import React, { useEffect } from "react";

/**
 * PublicAppShell - NO-AUTH wrapper for anonymous/public routes
 * 
 * CRITICAL: This component does NOT import or mount AuthContext.
 * It is used exclusively for candidate-facing routes where authentication
 * should never be checked.
 * 
 * Routes using this shell:
 * - CandidateInterview (anonymous candidate sessions)
 * - StartInterview (public entry point)
 */
export default function PublicAppShell({ children }) {
  useEffect(() => {
    console.log('[PUBLIC_SHELL] Mounted (NO AuthContext) — Candidate routes are anonymous');
  }, []);

  return (
    <div className="public-app-shell">
      {children}
    </div>
  );
}