import { useEffect } from "react";

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
    console.log('[AUTH][BOOT] AuthProvider=false route=public/candidate');
  }, []);

  return (
    <div className="public-app-shell">
      {children}
    </div>
  );
}