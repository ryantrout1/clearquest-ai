/**
 * Analytics Suppression for Preview Sandbox
 * 
 * CORS blocks analytics/track/batch POST in preview environments,
 * causing repeating console errors. This module suppresses analytics
 * in preview-only, keeping production behavior unchanged.
 * 
 * EXTENDED: Also blocks third-party analytics (Clarity, Meta Pixel) 
 * in preview to prevent CORS retry spam.
 */

let suppressionLoggedRef = false;

/**
 * Detect if running in preview sandbox environment
 */
export const isPreviewSandbox = () => {
  if (typeof window === 'undefined') return false;
  
  const hostname = window.location.hostname;
  return hostname.startsWith('preview--') || 
         hostname.includes('preview-sandbox--') ||
         hostname.includes('.preview.') ||
         hostname.endsWith('.base44.run');
};

/**
 * Block third-party analytics (Clarity, Meta Pixel) in preview environments
 * Stubs globals early to prevent script execution and CORS retry loops
 */
const blockThirdPartyAnalyticsInPreview = () => {
  if (!isPreviewSandbox()) return;
  if (typeof window === 'undefined') return;
  
  // Guard: Only log once per page load
  if (window.__CQ_3P_ANALYTICS_LOGGED__) return;
  window.__CQ_3P_ANALYTICS_LOGGED__ = true;
  
  // Stub Microsoft Clarity
  if (typeof window.clarity !== 'function') {
    window.clarity = function() {};
    window.__CQ_CLARITY_BLOCKED__ = true;
  }
  
  // Stub Meta Pixel
  if (typeof window.fbq !== 'function') {
    window.fbq = function() {};
    window._fbq = window.fbq;
    window.__CQ_META_PIXEL_BLOCKED__ = true;
  }
  
  // Single log line
  console.log('[ANALYTICS][3RDPARTY_DISABLED]', { 
    hostname: window.location.hostname 
  });
};

/**
 * Hard network block for third-party analytics in preview
 * Intercepts fetch/XHR/sendBeacon to prevent retry spam
 */
const installThirdPartyNetworkBlock = () => {
  if (!isPreviewSandbox()) return;
  if (typeof window === 'undefined') return;
  if (window.__CQ_3P_NETBLOCK_INSTALLED__) return;
  
  const denylist = [
    'a.clarity.ms',
    'clarity.ms',
    'connect.facebook.net',
    'facebook.com/tr',
    'fbevents.js'
  ];
  
  const isBlocked = (url) => {
    if (!url || typeof url !== 'string') return false;
    const urlLower = url.toLowerCase();
    return denylist.some(domain => urlLower.includes(domain));
  };
  
  // Intercept fetch
  if (window.fetch) {
    const origFetch = window.fetch;
    window.fetch = function(input, init) {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (isBlocked(url)) {
        return Promise.resolve(new Response('', { status: 200 }));
      }
      return origFetch.call(this, input, init);
    };
  }
  
  // Intercept XMLHttpRequest
  if (window.XMLHttpRequest) {
    const OrigXHR = window.XMLHttpRequest;
    const origOpen = OrigXHR.prototype.open;
    const origSend = OrigXHR.prototype.send;
    
    OrigXHR.prototype.open = function(method, url, ...args) {
      this.__cqBlocked = isBlocked(url);
      if (!this.__cqBlocked) {
        return origOpen.apply(this, [method, url, ...args]);
      }
    };
    
    OrigXHR.prototype.send = function(...args) {
      if (this.__cqBlocked) return;
      return origSend.apply(this, args);
    };
  }
  
  // Intercept sendBeacon
  if (window.navigator?.sendBeacon) {
    const origBeacon = window.navigator.sendBeacon.bind(window.navigator);
    window.navigator.sendBeacon = function(url, data) {
      if (isBlocked(url)) return true;
      return origBeacon(url, data);
    };
  }
  
  window.__CQ_3P_NETBLOCK_INSTALLED__ = true;
  console.log('[ANALYTICS][3P_NETBLOCK_INSTALLED]', { hostname: window.location.hostname });
};

// Install network blocks FIRST (before scripts execute)
if (typeof window !== 'undefined') {
  installThirdPartyNetworkBlock();
}

// Auto-run blocker at module load (before scripts execute)
if (typeof window !== 'undefined') {
  blockThirdPartyAnalyticsInPreview();
}

/**
 * Initialize analytics suppression for preview environments
 * Call this once on app mount
 */
export const initAnalyticsSuppression = () => {
  if (!isPreviewSandbox()) return;
  
  // Log once
  if (!suppressionLoggedRef && typeof console !== 'undefined') {
    suppressionLoggedRef = true;
    console.info('[ANALYTICS][PREVIEW_DISABLED]', {
      reason: 'CORS blocks track/batch in preview sandbox',
      hostname: window.location.hostname,
      action: 'Analytics POST suppressed'
    });
  }
  
  // Intercept fetch to block analytics batch calls
  if (typeof window !== 'undefined' && !window.__ANALYTICS_SUPPRESSED__) {
    const originalFetch = window.fetch;
    
    window.fetch = function(input, init) {
      const url = typeof input === 'string' ? input : input?.url || '';
      
      // Block analytics batch tracking calls
      if (url.includes('/analytics/track/batch') || url.includes('/analytics/batch')) {
        console.debug('[ANALYTICS][PREVIEW_BLOCKED]', { 
          url: url.substring(0, 80),
          reason: 'Preview sandbox - analytics suppressed'
        });
        
        // Return resolved promise (silent success)
        return Promise.resolve(new Response(JSON.stringify({ skipped: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }));
      }
      
      // Pass through all other requests
      return originalFetch.call(this, input, init);
    };
    
    window.__ANALYTICS_SUPPRESSED__ = true;
  }
};