import React from "react";

/**
 * ContentContainer - Enforces max-width for all cards
 * Dumb presentational component - no hooks, no side effects
 */
const ContentContainer = ({ children, className = "" }) => (
  <div className={`mx-auto w-full max-w-5xl ${className}`}>
    {children}
  </div>
);

export default ContentContainer;
