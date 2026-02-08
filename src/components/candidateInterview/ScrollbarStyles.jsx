import React from "react";

/**
 * ScrollbarStyles - Dumb presentational component for custom scrollbar CSS
 * No hooks, no side effects, no API calls - just renders style tag
 */
export function ScrollbarStyles() {
  return (
    <style>
      {`
        .cq-scroll {
          scrollbar-color: #232a33 #0f1216;
        }
        .cq-scroll::-webkit-scrollbar-track {
          background: #0f1216;
        }
        .cq-scroll::-webkit-scrollbar-thumb {
          background: #232a33;
          border-radius: 6px;
        }
      `}
    </style>
  );
}