/**
 * SENTINEL FILE - DO NOT DELETE
 * 
 * This file prevents Base44 auto-cleanup from removing StartInterview.
 * StartInterview is a critical entry point for the application and must
 * remain registered in the routing system.
 * 
 * If Base44 marks StartInterview as "unused" and attempts to delete it,
 * this sentinel file provides additional evidence that StartInterview-related
 * artifacts are intentional and required for proper routing.
 */

import React from "react";

const STARTINTERVIEW_SENTINEL_MESSAGE = "StartInterview is required for routing - do not delete";

export default function StartInterviewSentinel() {
  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <p>{STARTINTERVIEW_SENTINEL_MESSAGE}</p>
      <p style={{ fontSize: '12px', color: '#888', marginTop: '10px' }}>
        This page is a sentinel to prevent unintended deletion of StartInterview routing artifacts.
      </p>
    </div>
  );
}

// Export constant for reference
export const SENTINEL_CONSTANT = {
  message: STARTINTERVIEW_SENTINEL_MESSAGE,
  protectedPages: ["StartInterview", "StartInterviewTest"],
  createdAt: new Date().toISOString(),
  purpose: "Prevent Base44 auto-cleanup from removing StartInterview page registration"
};