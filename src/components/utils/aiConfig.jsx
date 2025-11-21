/**
 * AI Agent Multi-Instance Configuration
 * Handles environment-specific and department-specific agent routing
 */

const ENV =
  import.meta?.env?.MODE ||
  import.meta?.env?.VITE_ENV ||
  process.env.NODE_ENV ||
  "development";

const AI_AGENT_CONFIG = {
  // Production instances
  "production:BPD-85326": {
    agentName: "clearquest_interviewer",
    appId: "clearquest-prod",
  },
  "production:DEFAULT": {
    agentName: "clearquest_interviewer",
    appId: "clearquest-prod",
  },
  
  // Preview/staging instances
  "preview:BPD-85326": {
    agentName: "clearquest_interviewer",
    appId: "clearquest-preview",
  },
  "preview:DEFAULT": {
    agentName: "clearquest_interviewer",
    appId: "clearquest-preview",
  },
  
  // Development instances
  "development:DEFAULT": {
    agentName: "clearquest_interviewer",
    appId: "clearquest-dev",
  },
};

export function getAiAgentConfig(departmentCode) {
  const envKey =
    ENV === "production" || ENV === "prod"
      ? "production"
      : ENV === "preview"
      ? "preview"
      : "development";

  const key = `${envKey}:${departmentCode || "DEFAULT"}`;
  const fallbackKey = `${envKey}:DEFAULT`;

  const config =
    AI_AGENT_CONFIG[key] ||
    AI_AGENT_CONFIG[fallbackKey] ||
    AI_AGENT_CONFIG["development:DEFAULT"];

  console.log("[AI CONFIG]", {
    ENV,
    departmentCode,
    key,
    resolved: config,
  });

  return config;
}