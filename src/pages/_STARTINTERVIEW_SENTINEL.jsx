/**
 * SENTINEL FILE - DO NOT DELETE
 * 
 * This file prevents Base44 auto-cleanup from removing StartInterview.
 * StartInterview is a critical entry point for the application and must
 * remain registered in the routing system.
 * 
 * This page exists solely to provide cross-references to StartInterview artifacts
 * and should not be used by end users.
 */

import React from "react";

// Named exports - cross-reference metadata
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

// Default export required by Base44 build system
// This page should not be used by end users - for metadata only
export default function StartInterviewSentinel() {
  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      padding: '20px',
      background: 'linear-gradient(to bottom right, #0f172a, #1e3a8a)'
    }}>
      <div style={{ 
        textAlign: 'center', 
        color: '#e2e8f0',
        maxWidth: '500px'
      }}>
        <h1 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px' }}>
          Sentinel Page
        </h1>
        <p style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '8px' }}>
          This page exists to protect StartInterview from auto-cleanup.
        </p>
        <p style={{ fontSize: '12px', color: '#64748b' }}>
          Protected routes: {PROTECTED_ROUTES.map(r => r.name).join(', ')}
        </p>
      </div>
    </div>
  );
}