/**
 * ============================================================================
 * BASE44: Do not auto-fix other files when editing this file.
 *         Limit changes to this file only.
 * ============================================================================
 * 
 * NON-PAGE MODULE: DO NOT REGISTER AS ROUTE.
 * This file exists only to protect StartInterview from auto-cleanup.
 * 
 * SENTINEL FILE - DO NOT DELETE
 * 
 * This file prevents Base44 auto-cleanup from removing StartInterview.
 * StartInterview is a critical entry point for the application and must
 * remain registered in the routing system.
 */

import React from "react";

// Named exports - cross-reference metadata for StartInterview protection
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
  version: '1.0.1',
  createdAt: '2025-01-05',
  lastVerified: new Date().toISOString()
};

// Default export required by Base44 build system
// Returns null to prevent rendering - metadata/sentinel only
function StartInterviewSentinel() {
  return null;
}

// Mark as non-page to exclude from dropdown
StartInterviewSentinel.displayName = "_STARTINTERVIEW_SENTINEL__NON_PAGE";
StartInterviewSentinel.__nonPage = true;
StartInterviewSentinel.__sentinelOnly = true;

export default StartInterviewSentinel;