
/**
 * SENTINEL FILE - DO NOT DELETE
 * 
 * This file prevents Base44 auto-cleanup from removing StartInterview.
 * StartInterview is a critical entry point for the application and must
 * remain registered in the routing system.
 * 
 * WARNING: This is NOT a routable page - exports only, no default component.
 * It exists solely to provide cross-references to StartInterview artifacts.
 */

// Named exports only - prevents this file from appearing in route registration
export const START_INTERVIEW_CANONICAL = {
  name: 'StartInterview',
  path: '/startinterview',
  file: 'pages/StartInterview.js',
  purpose: 'Public candidate entry point for ClearQuest interviews',
  required: true,
  doNotDelete: true
};

export const PROTECTED_ROUTES = [
  {
    name: 'StartInterview',
    path: '/startinterview',
    purpose: 'Main entry point - creates anonymous interview sessions',
    critical: true
  },
  {
    name: 'StartInterviewTest',
    path: '/startinterviewtest',
    purpose: 'Route registration verification',
    critical: false
  }
];

export const SENTINEL_STATUS = {
  active: true,
  protectedFiles: ['pages/StartInterview.js', 'pages/StartInterviewTest.js'],
  version: '1.0.0',
  createdAt: '2025-01-05',
  lastVerified: new Date().toISOString()
};

// NO default export - this file must NOT be routed
// Base44: Do not register this as a page route
