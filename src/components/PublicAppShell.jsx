import { useEffect } from "react";

// ============================================================================
// SANDBOX FILES 500 INTERCEPTOR - One-time install guard
// ============================================================================
// Module-level flag to ensure interceptor is installed exactly once per page load
let sandboxFilesInterceptorInstalled = false;

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
    
    // ONE-TIME INSTALL GUARD: Prevent multiple interceptor installations
    if (sandboxFilesInterceptorInstalled) {
      console.log('[BASE44_SANDBOX_FILES][INTERCEPTOR_SKIP]', { reason: 'already_installed' });
      return;
    }
    
    // Install interceptor exactly once
    if (typeof window !== "undefined" && window.fetch && !window.__BASE44_SANDBOX_FILES_INTERCEPTED__) {
      const originalFetch = window.fetch;
      
      window.fetch = async function(input, init) {
        const url = typeof input === 'string' ? input : input?.url || '';
        
        // SCOPE: Only intercept /api/apps/*/sandbox/files
        const isSandboxFilesCall = url.includes('/api/apps/') && url.includes('/sandbox/files');
        
        if (!isSandboxFilesCall) {
          // Pass through - not the target endpoint
          return originalFetch(input, init);
        }
        
        try {
          const response = await originalFetch(input, init);
          
          // SCOPE: Only suppress 500 errors
          if (response.status === 500) {
            console.warn('[BASE44_SANDBOX_FILES][500_SUPPRESSED]', { 
              url, 
              status: 500, 
              action: 'RETURN_EMPTY' 
            });
            
            // Return empty array (safe for sandbox files list)
            return new Response(JSON.stringify([]), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          // Other statuses: pass through unchanged
          return response;
        } catch (err) {
          // Network errors: pass through unchanged
          throw err;
        }
      };
      
      window.__BASE44_SANDBOX_FILES_INTERCEPTED__ = true;
      sandboxFilesInterceptorInstalled = true;
      
      console.log('[BASE44_SANDBOX_FILES][INTERCEPTOR_INSTALLED]', { 
        target: '/api/apps/*/sandbox/files', 
        behavior: 'suppress_500_only' 
      });
    }
  }, []);

  return (
    <div className="public-app-shell">
      {children}
    </div>
  );
}