import React from "react";
import { initAnalyticsSuppression } from "./components/lib/analyticsSuppress";

try {
  if (typeof window !== "undefined" && !window.__cq_globalCrashLoggerInstalled) {
    window.__cq_globalCrashLoggerInstalled = true;

    window.addEventListener("error", (e) => {
      try {
        console.error("[CQ_BOOT][WINDOW_ERROR_MESSAGE]", e?.message);
        console.error("[CQ_BOOT][WINDOW_ERROR_FILE]", e?.filename);
        console.error("[CQ_BOOT][WINDOW_ERROR_LINECOL]", e?.lineno, e?.colno);
        console.error("[CQ_BOOT][WINDOW_ERROR_STACK]", e?.error?.stack);
      } catch (_) {}
    });

    window.addEventListener("unhandledrejection", (e) => {
      try {
        console.error("[CQ_BOOT][UNHANDLED_REJECTION_REASON]", e?.reason?.message || e?.reason);
        console.error("[CQ_BOOT][UNHANDLED_REJECTION_STACK]", e?.reason?.stack);
      } catch (_) {}
    });

    if (typeof document !== "undefined" && document?.documentElement) {
      document.documentElement.setAttribute("data-cq-boot", "GLOBAL_LOGGER_INSTALLED");
    }

    console.log("[CQ_BOOT][GLOBAL_LOGGER_INSTALLED]");
  }
} catch (_) {}

export default function Layout({ children }) {
  // ANALYTICS SUPPRESSION: Disable in preview sandbox (CORS blocked)
  React.useEffect(() => {
    initAnalyticsSuppression();
  }, []);
  
  // PREVIEW CACHE-BUST: One-time reload guard (prevents stale Vite chunk 404s)
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const hostname = window.location.hostname;
    
    // TIGHTENED: Precise preview detection (avoid matching non-preview contexts)
    const isPreviewSandbox = hostname.includes('preview-sandbox');
    const isPreviewPrefix = hostname.startsWith('preview-') || hostname.includes('--');
    const isBase44Run = hostname.endsWith('.base44.run');
    const isPreview = isPreviewSandbox || isPreviewPrefix || isBase44Run;
    
    if (!isPreview) return;
    
    // FAILSAFE 1: If URL already has cache-bust param, do NOT reload again
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('cb')) {
      return;
    }
    
    // FAILSAFE 2: Try sessionStorage with error handling (Tracking Prevention can block)
    const MARKER_KEY = 'cq_preview_cache_bust_applied';
    let hasMarker = false;
    
    try {
      hasMarker = sessionStorage.getItem(MARKER_KEY) !== null;
      
      if (hasMarker) return;
      
      // Set marker before reload
      sessionStorage.setItem(MARKER_KEY, '1');
    } catch (e) {
      // sessionStorage blocked (Tracking Prevention) - disable cache-bust
      console.warn('[PREVIEW_CACHE_BUST][STORAGE_BLOCKED]', { 
        error: e.message,
        action: 'cache-bust disabled'
      });
      return;
    }
    
    // All guards passed - perform one-time reload
    console.log('[PREVIEW_CACHE_BUST]', { 
      strategy: 'ONE_TIME_RELOAD', 
      hostname,
      isPreviewSandbox,
      isPreviewPrefix,
      isBase44Run,
      reason: 'STALE_CHUNK_GUARD',
      applied: true 
    });
    
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('cb', Date.now().toString());
    window.location.replace(currentUrl.toString());
  }, []);
  
  return (
    <div className="min-h-screen">
      {children}
    </div>
  );
}