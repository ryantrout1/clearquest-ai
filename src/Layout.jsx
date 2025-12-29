import React from "react";

export default function Layout({ children }) {
  // PREVIEW CACHE-BUST: One-time reload guard (prevents stale Vite chunk 404s)
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const hostname = window.location.hostname;
    const isPreview = hostname.includes('preview-sandbox') || 
                     hostname.includes('base44.app') ||
                     hostname.includes('.base44.run');
    
    if (!isPreview) return;
    
    const MARKER_KEY = 'cq_preview_cache_bust_applied';
    const hasMarker = sessionStorage.getItem(MARKER_KEY);
    
    if (!hasMarker) {
      sessionStorage.setItem(MARKER_KEY, '1');
      console.log('[PREVIEW_CACHE_BUST]', { 
        strategy: 'ONE_TIME_RELOAD', 
        hostname, 
        applied: true 
      });
      
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set('cb', Date.now().toString());
      window.location.replace(currentUrl.toString());
    }
  }, []);
  
  return (
    <div className="min-h-screen">
      {children}
    </div>
  );
}