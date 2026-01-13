/**
 * System Config Helpers
 * Canonical functions for reading and updating global system configuration
 */

import { base44 } from "@/api/base44Client";

const CONFIG_KEY = "global_config";

// Default configuration - DETERMINISTIC mode ensures no behavior changes
const DEFAULT_CONFIG = {
  interviewMode: "DETERMINISTIC",
  sandboxAiProbingOnly: true,
  decisionEngine: {
    maxProbesPerIncident: 10,
    maxNonSubstantiveResponses: 3,
    stopWhenMandatoryFactsComplete: true,
    fallbackBehaviorOnError: "DETERMINISTIC_FALLBACK",
    categorySeverityDefaults: {
      DUI: "MODERATE",
      DOMESTIC_VIOLENCE: "STRICT",
      THEFT: "LAXED",
      DRUG_USE: "MODERATE",
      FINANCIAL: "LAXED",
      EMPLOYMENT: "LAXED"
    }
  },
  logging: {
    decisionLoggingEnabled: true,
    decisionLoggingLevel: "STANDARD"
  },
  interviewModeOverridesByDepartment: {},
  v3: {
    enabled_categories: [],
    max_turns_per_incident: 12,
    non_substantive_threshold_chars: 15,
    logging_level: "BASIC",
    stop_when_required_complete: true,
    debug_mode_enabled: false
  }
};

/**
 * Merge existing config with defaults to ensure all fields exist
 */
function mergeWithDefaults(existingData) {
  if (!existingData) return { ...DEFAULT_CONFIG };
  
  return {
    ...DEFAULT_CONFIG,
    ...existingData,
    decisionEngine: {
      ...DEFAULT_CONFIG.decisionEngine,
      ...(existingData.decisionEngine || {}),
      categorySeverityDefaults: {
        ...DEFAULT_CONFIG.decisionEngine.categorySeverityDefaults,
        ...(existingData.decisionEngine?.categorySeverityDefaults || {})
      }
    },
    logging: {
      ...DEFAULT_CONFIG.logging,
      ...(existingData.logging || {})
    },
    interviewModeOverridesByDepartment: existingData.interviewModeOverridesByDepartment || {},
    v3: {
      ...DEFAULT_CONFIG.v3,
      ...(existingData.v3 || {}),
      debug_mode_enabled: existingData.v3?.debug_mode_enabled || false
    }
  };
}

/**
 * Get the current system configuration
 * Returns merged config with defaults to ensure all fields exist
 * 
 * @returns {Promise<{config: object, id: string|null}>}
 */
export async function getSystemConfig() {
  try {
    const configs = await base44.entities.SystemConfig.filter({ config_key: CONFIG_KEY });
    
    if (configs.length > 0) {
      const existingConfig = configs[0];
      return {
        config: mergeWithDefaults(existingConfig.config_data || {}),
        id: existingConfig.id
      };
    }
    
    // No config exists yet, return defaults
    return {
      config: { ...DEFAULT_CONFIG },
      id: null
    };
  } catch (err) {
    console.error("[SystemConfig] Error loading config:", err);
    return {
      config: { ...DEFAULT_CONFIG },
      id: null
    };
  }
}

/**
 * Update the system configuration
 * Creates config if it doesn't exist
 * 
 * @param {object} partialConfig - Partial config object to merge with existing
 * @returns {Promise<{success: boolean, id: string|null}>}
 */
export async function updateSystemConfig(partialConfig) {
  try {
    const { config: existingConfig, id: existingId } = await getSystemConfig();
    
    // Deep merge the partial config with existing
    const newConfig = {
      ...existingConfig,
      ...partialConfig,
      decisionEngine: {
        ...existingConfig.decisionEngine,
        ...(partialConfig.decisionEngine || {}),
        categorySeverityDefaults: {
          ...existingConfig.decisionEngine.categorySeverityDefaults,
          ...(partialConfig.decisionEngine?.categorySeverityDefaults || {})
        }
      },
      logging: {
        ...existingConfig.logging,
        ...(partialConfig.logging || {})
      },
      v3: {
        ...existingConfig.v3,
        ...(partialConfig.v3 || {})
      }
    };
    
    if (existingId) {
      // Update existing config
      await base44.entities.SystemConfig.update(existingId, {
        config_data: newConfig,
        description: "Global IDE configuration"
      });
      return { success: true, id: existingId };
    } else {
      // Create new config
      const created = await base44.entities.SystemConfig.create({
        config_key: CONFIG_KEY,
        config_data: newConfig,
        description: "Global IDE configuration"
      });
      return { success: true, id: created.id };
    }
  } catch (err) {
    console.error("[SystemConfig] Error updating config:", err);
    return { success: false, id: null };
  }
}

/**
 * Get a specific config value by path
 * 
 * @param {string} path - Dot-notation path (e.g., "decisionEngine.maxProbesPerIncident")
 * @returns {Promise<any>}
 */
export async function getConfigValue(path) {
  const { config } = await getSystemConfig();
  
  const keys = path.split(".");
  let value = config;
  
  for (const key of keys) {
    if (value === undefined || value === null) return undefined;
    value = value[key];
  }
  
  return value;
}

/**
 * Check if AI Probing is enabled for a given context
 * Respects sandboxAiProbingOnly setting
 * 
 * @param {object} options - { isSandbox?: boolean, departmentCode?: string }
 * @returns {Promise<boolean>}
 */
export async function isAiProbingEnabled(options = {}) {
  const { config } = await getSystemConfig();
  const { isSandbox = false, departmentCode } = options;
  
  // Check department override first
  if (departmentCode && config.interviewModeOverridesByDepartment[departmentCode]) {
    const override = config.interviewModeOverridesByDepartment[departmentCode];
    return override === "AI_PROBING" || override === "HYBRID";
  }
  
  // If sandboxAiProbingOnly is true and we're not in sandbox, always use deterministic
  if (config.sandboxAiProbingOnly && !isSandbox) {
    return false;
  }
  
  // Check global mode
  return config.interviewMode === "AI_PROBING" || config.interviewMode === "HYBRID";
}

/**
 * Get the effective interview mode for a context
 * 
 * @param {object} options - { isSandbox?: boolean, departmentCode?: string }
 * @returns {Promise<string>} - "DETERMINISTIC" | "AI_PROBING" | "HYBRID"
 */
export async function getEffectiveInterviewMode(options = {}) {
  const { config } = await getSystemConfig();
  const { isSandbox = false, departmentCode } = options;
  
  // Check department override first
  if (departmentCode && config.interviewModeOverridesByDepartment[departmentCode]) {
    return config.interviewModeOverridesByDepartment[departmentCode];
  }
  
  // If sandboxAiProbingOnly is true and we're not in sandbox, always use deterministic
  if (config.sandboxAiProbingOnly && !isSandbox && config.interviewMode !== "DETERMINISTIC") {
    return "DETERMINISTIC";
  }
  
  const finalMode = config.interviewMode;
  if (finalMode !== "HYBRID") {
      console.error('[V3_ONLY_GUARD] V2 path detected and blocked in getEffectiveInterviewMode.', { 
          requestedMode: finalMode,
          departmentCode,
          isSandbox
      });
      throw new Error('V3_ONLY_GUARD: V2 path blocked by systemConfigHelper. Only HYBRID mode is allowed.');
  }
  return finalMode;
}

// Export constants
export { DEFAULT_CONFIG, CONFIG_KEY };