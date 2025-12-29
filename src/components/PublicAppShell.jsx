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
    
    // DEFENSIVE: Intercept Base44 platform sandbox file errors (non-critical for candidates)
    // Platform sometimes calls /sandbox/files internally - suppress 500s to prevent cascade
    const originalFetch = window.fetch;
    const suppressedUrls = new Set();
    
    window.fetch = function(input, init) {
      const url = typeof input === 'string' ? input : input?.url || '';
      
      // Detect sandbox files endpoint
      if (url.includes('/sandbox/files') || url.includes('sandbox/files')) {
        const urlKey = url.split('?')[0]; // Dedupe by base URL
        
        return originalFetch.apply(this, arguments)
          .then(response => {
            // If 500, log once and return empty response
            if (response.status === 500 && !suppressedUrls.has(urlKey)) {
              suppressedUrls.add(urlKey);
              console.warn('[BASE44_SANDBOX_FILES][FETCH_FAILED]', {
                url: urlKey,
                status: 500,
                action: 'FALLBACK_EMPTY',
                note: 'Sandbox files are non-critical for candidate interview - suppressing error'
              });
              
              // Return synthetic empty response
              return new Response(JSON.stringify([]), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            }
            return response;
          })
          .catch(err => {
            // Network error - log and return empty
            if (!suppressedUrls.has(urlKey)) {
              suppressedUrls.add(urlKey);
              console.warn('[BASE44_SANDBOX_FILES][FETCH_ERROR]', {
                url: urlKey,
                error: err.message,
                action: 'FALLBACK_EMPTY',
                note: 'Sandbox files are non-critical for candidate interview'
              });
            }
            
            // Return synthetic empty response
            return new Response(JSON.stringify([]), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          });
      }
      
      // All other requests pass through unchanged
      return originalFetch.apply(this, arguments);
    };
    
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return (
    <div className="public-app-shell">
      {children}
    </div>
  );
}