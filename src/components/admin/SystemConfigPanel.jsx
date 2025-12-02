import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Settings, Zap, Shield, FileText, AlertTriangle, Database, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
  interviewModeOverridesByDepartment: {}
};

const CONFIG_KEY = "global_config";

// Category severity options
const SEVERITY_OPTIONS = [
  { value: "LAXED", label: "Laxed", description: "Fewer probes, quicker resolution" },
  { value: "MODERATE", label: "Moderate", description: "Balanced probing depth" },
  { value: "STRICT", label: "Strict", description: "Thorough investigation, more probes" }
];

const CATEGORY_LABELS = {
  DUI: "DUI / DWI",
  DOMESTIC_VIOLENCE: "Domestic Violence",
  THEFT: "Theft / Dishonesty",
  DRUG_USE: "Drug Use",
  FINANCIAL: "Financial Issues",
  EMPLOYMENT: "Employment Issues"
};

export default function SystemConfigPanel() {
  const [config, setConfig] = useState(null);
  const [configId, setConfigId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [factModels, setFactModels] = useState([]);
  const [factModelsLoading, setFactModelsLoading] = useState(true);

  useEffect(() => {
    loadConfig();
    loadFactModels();
  }, []);

  const loadFactModels = async () => {
    setFactModelsLoading(true);
    try {
      const models = await base44.entities.FactModel.list();
      // Normalize the data
      const normalized = models.map(m => {
        const data = m.data || m;
        return {
          id: m.id,
          categoryId: data.category_id,
          categoryLabel: data.category_label,
          mandatoryFacts: data.mandatory_facts || [],
          optionalFacts: data.optional_facts || [],
          severityFacts: data.severity_facts || [],
          isReadyForAiProbing: data.is_ready_for_ai_probing || false
        };
      });
      setFactModels(normalized);
    } catch (err) {
      console.error("Error loading fact models:", err);
      setFactModels([]);
    } finally {
      setFactModelsLoading(false);
    }
  };

  const loadConfig = async () => {
    setIsLoading(true);
    try {
      const configs = await base44.entities.SystemConfig.filter({ config_key: CONFIG_KEY });
      
      if (configs.length > 0) {
        const existingConfig = configs[0];
        setConfigId(existingConfig.id);
        // Merge with defaults to ensure all fields exist
        const mergedConfig = mergeWithDefaults(existingConfig.config_data || {});
        setConfig(mergedConfig);
      } else {
        // No config exists yet, use defaults
        setConfig(DEFAULT_CONFIG);
        setConfigId(null);
      }
    } catch (err) {
      console.error("Error loading system config:", err);
      toast.error("Failed to load configuration");
      setConfig(DEFAULT_CONFIG);
    } finally {
      setIsLoading(false);
    }
  };

  const mergeWithDefaults = (existingData) => {
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
      interviewModeOverridesByDepartment: existingData.interviewModeOverridesByDepartment || {}
    };
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (configId) {
        // Update existing config
        await base44.entities.SystemConfig.update(configId, {
          config_data: config,
          description: "Global IDE configuration"
        });
      } else {
        // Create new config
        const created = await base44.entities.SystemConfig.create({
          config_key: CONFIG_KEY,
          config_data: config,
          description: "Global IDE configuration"
        });
        setConfigId(created.id);
      }
      
      setHasChanges(false);
      toast.success("Configuration saved successfully");
    } catch (err) {
      console.error("Error saving config:", err);
      toast.error("Failed to save configuration");
    } finally {
      setIsSaving(false);
    }
  };

  const updateConfig = (path, value) => {
    setConfig(prev => {
      const newConfig = { ...prev };
      const keys = path.split(".");
      let current = newConfig;
      
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) current[keys[i]] = {};
        current[keys[i]] = { ...current[keys[i]] };
        current = current[keys[i]];
      }
      
      current[keys[keys.length - 1]] = value;
      return newConfig;
    });
    setHasChanges(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Save Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">System Configuration</h2>
          <p className="text-sm text-slate-400">
            Configure Interview Mode, Decision Engine, and Logging settings
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          className={cn(
            "bg-blue-600 hover:bg-blue-700",
            hasChanges && "ring-2 ring-blue-400 ring-offset-2 ring-offset-slate-900"
          )}
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {isSaving ? "Saving..." : "Save Configuration"}
        </Button>
      </div>

      {/* Section A: Feature Flags & Modes */}
      <Card className="bg-[#0f1629] border-slate-800/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" />
            Feature Flags & Modes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Interview Mode */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-slate-200">
              Interview Mode (global default)
            </Label>
            <RadioGroup
              value={config.interviewMode}
              onValueChange={(value) => updateConfig("interviewMode", value)}
              className="grid gap-3"
            >
              <div className={cn(
                "flex items-center space-x-3 rounded-lg border p-4 cursor-pointer transition-colors",
                config.interviewMode === "DETERMINISTIC"
                  ? "border-green-500 bg-green-950/20"
                  : "border-slate-700 hover:border-slate-600"
              )}>
                <RadioGroupItem value="DETERMINISTIC" id="mode-deterministic" />
                <div className="flex-1">
                  <Label htmlFor="mode-deterministic" className="text-sm font-medium text-white cursor-pointer">
                    Deterministic Only
                  </Label>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Current behavior - fixed follow-up question packs, no AI probing
                  </p>
                </div>
                <Badge className="bg-green-500/20 text-green-300 border-green-500/30">Active</Badge>
              </div>

              <div className={cn(
                "flex items-center space-x-3 rounded-lg border p-4 cursor-pointer transition-colors",
                config.interviewMode === "AI_PROBING"
                  ? "border-purple-500 bg-purple-950/20"
                  : "border-slate-700 hover:border-slate-600"
              )}>
                <RadioGroupItem value="AI_PROBING" id="mode-ai" />
                <div className="flex-1">
                  <Label htmlFor="mode-ai" className="text-sm font-medium text-white cursor-pointer">
                    AI Probing (IDE v1)
                  </Label>
                  <p className="text-xs text-slate-400 mt-0.5">
                    AI-driven investigative probing based on severity and missing facts
                  </p>
                </div>
                <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30">Future</Badge>
              </div>

              <div className={cn(
                "flex items-center space-x-3 rounded-lg border p-4 cursor-pointer transition-colors",
                config.interviewMode === "HYBRID"
                  ? "border-blue-500 bg-blue-950/20"
                  : "border-slate-700 hover:border-slate-600"
              )}>
                <RadioGroupItem value="HYBRID" id="mode-hybrid" />
                <div className="flex-1">
                  <Label htmlFor="mode-hybrid" className="text-sm font-medium text-white cursor-pointer">
                    Hybrid (AI Probing + Deterministic Fallback)
                  </Label>
                  <p className="text-xs text-slate-400 mt-0.5">
                    AI probing with fallback to deterministic packs on error
                  </p>
                </div>
                <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30">Future</Badge>
              </div>
            </RadioGroup>
          </div>

          {/* Sandbox Toggle */}
          <div className="flex items-center justify-between rounded-lg border border-slate-700 p-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium text-white">
                Enable AI Probing in Sandbox Only
              </Label>
              <p className="text-xs text-slate-400">
                When enabled, AI Probing will only run in sandbox/debug environments. Production remains in Deterministic mode.
              </p>
            </div>
            <Switch
              checked={config.sandboxAiProbingOnly}
              onCheckedChange={(checked) => updateConfig("sandboxAiProbingOnly", checked)}
            />
          </div>

          {/* Per-Department Overrides (Shell) */}
          <div className="rounded-lg border border-slate-700 p-4 bg-slate-800/30">
            <div className="flex items-center gap-2 mb-2">
              <Settings className="w-4 h-4 text-slate-400" />
              <Label className="text-sm font-medium text-slate-300">
                Per-Department Overrides
              </Label>
            </div>
            <p className="text-xs text-slate-400">
              Future: allow specific departments to override the global interview mode. Currently, no overrides are defined.
            </p>
            {Object.keys(config.interviewModeOverridesByDepartment || {}).length === 0 ? (
              <div className="mt-3 p-3 rounded border border-dashed border-slate-600 text-center">
                <p className="text-xs text-slate-500">No department overrides configured</p>
              </div>
            ) : (
              <div className="mt-3 text-xs text-slate-400">
                {Object.keys(config.interviewModeOverridesByDepartment).length} override(s) defined
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Section B: Decision Engine Settings */}
      <Card className="bg-[#0f1629] border-slate-800/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-400" />
            Decision Engine Settings (IDE v1)
            <Badge className="bg-slate-700 text-slate-300 border-slate-600 text-xs ml-2">Shell</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Warning Banner */}
          <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-950/20 border border-amber-800/50">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-200">
              <p className="font-medium">Configuration Only</p>
              <p className="text-amber-300/80 mt-0.5">
                These settings are stored but not yet used by the interview engine. They will be activated in a future update.
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Max Probes Per Incident */}
            <div className="space-y-2">
              <Label className="text-sm text-slate-200">Max probes per incident (soft cap)</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={config.decisionEngine.maxProbesPerIncident}
                onChange={(e) => updateConfig("decisionEngine.maxProbesPerIncident", parseInt(e.target.value) || 10)}
                className="bg-slate-800 border-slate-600 text-white"
              />
            </div>

            {/* Max Non-Substantive Responses */}
            <div className="space-y-2">
              <Label className="text-sm text-slate-200">Max non-substantive responses before stopping</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={config.decisionEngine.maxNonSubstantiveResponses}
                onChange={(e) => updateConfig("decisionEngine.maxNonSubstantiveResponses", parseInt(e.target.value) || 3)}
                className="bg-slate-800 border-slate-600 text-white"
              />
              <p className="text-xs text-slate-500">
                Non-substantive: "I don't remember", "not sure", "prefer not to say"
              </p>
            </div>
          </div>

          {/* Stop When Mandatory Facts Complete */}
          <div className="flex items-center justify-between rounded-lg border border-slate-700 p-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium text-white">
                Stop probing when all mandatory facts are collected
              </Label>
              <p className="text-xs text-slate-400">
                Ends probing early if all required information has been gathered
              </p>
            </div>
            <Switch
              checked={config.decisionEngine.stopWhenMandatoryFactsComplete}
              onCheckedChange={(checked) => updateConfig("decisionEngine.stopWhenMandatoryFactsComplete", checked)}
            />
          </div>

          {/* Fallback Behavior */}
          <div className="space-y-2">
            <Label className="text-sm text-slate-200">On AI error during probing</Label>
            <Select
              value={config.decisionEngine.fallbackBehaviorOnError}
              onValueChange={(value) => updateConfig("decisionEngine.fallbackBehaviorOnError", value)}
            >
              <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="DETERMINISTIC_FALLBACK" className="text-white">
                  Use deterministic follow-up pack as fallback
                </SelectItem>
                <SelectItem value="FLAG_AND_SKIP" className="text-white">
                  Skip incident and flag for BI review
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Category Severity Defaults */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-slate-200">Category Severity Defaults</Label>
            <div className="grid gap-3">
              {Object.entries(CATEGORY_LABELS).map(([categoryId, categoryLabel]) => (
                <div key={categoryId} className="flex items-center justify-between rounded-lg border border-slate-700 p-3">
                  <span className="text-sm text-slate-300">{categoryLabel}</span>
                  <Select
                    value={config.decisionEngine.categorySeverityDefaults[categoryId] || "MODERATE"}
                    onValueChange={(value) => updateConfig(`decisionEngine.categorySeverityDefaults.${categoryId}`, value)}
                  >
                    <SelectTrigger className="w-36 bg-slate-800 border-slate-600 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {SEVERITY_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value} className="text-white">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section C: Logging & Audit */}
      <Card className="bg-[#0f1629] border-slate-800/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-400" />
            Logging & Audit (Decision Engine)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable Logging */}
          <div className="flex items-center justify-between rounded-lg border border-slate-700 p-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium text-white">
                Enable Decision Engine trace logging
              </Label>
              <p className="text-xs text-slate-400">
                Logs the severity, missing facts, probes asked, and stop reason for each incident when AI Probing is used.
              </p>
            </div>
            <Switch
              checked={config.logging.decisionLoggingEnabled}
              onCheckedChange={(checked) => updateConfig("logging.decisionLoggingEnabled", checked)}
            />
          </div>

          {/* Logging Level */}
          <div className="space-y-2">
            <Label className="text-sm text-slate-200">Logging level</Label>
            <Select
              value={config.logging.decisionLoggingLevel}
              onValueChange={(value) => updateConfig("logging.decisionLoggingLevel", value)}
            >
              <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="MINIMAL" className="text-white">
                  <div>
                    <span className="font-medium">Minimal</span>
                    <span className="text-slate-400 ml-2">– Only incident-level start/stop events</span>
                  </div>
                </SelectItem>
                <SelectItem value="STANDARD" className="text-white">
                  <div>
                    <span className="font-medium">Standard</span>
                    <span className="text-slate-400 ml-2">– Incident-level plus probe sequence and stop reason</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Section D: Fact Model Readiness */}
      <Card className="bg-[#0f1629] border-slate-800/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-cyan-400" />
            Fact Model Readiness
            <Badge className="bg-slate-700 text-slate-300 border-slate-600 text-xs ml-2">Read-Only</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {factModelsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
            </div>
          ) : factModels.length === 0 ? (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-950/20 border border-amber-800/50">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-amber-200">
                <p className="font-medium">No Fact Models Defined</p>
                <p className="text-amber-300/80 mt-1">
                  AI Probing will not be available until fact models are configured for each incident category.
                  Fact models define what information needs to be collected for each type of disclosure.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-400 mb-4">
                Fact models define the required and optional facts for each incident category.
                Categories marked as "Ready" can be used with AI Probing.
              </p>
              <div className="rounded-lg border border-slate-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-800/50">
                    <tr>
                      <th className="text-left px-4 py-2 text-slate-300 font-medium">Category</th>
                      <th className="text-center px-3 py-2 text-slate-300 font-medium">Mandatory</th>
                      <th className="text-center px-3 py-2 text-slate-300 font-medium">Optional</th>
                      <th className="text-center px-3 py-2 text-slate-300 font-medium">Severity</th>
                      <th className="text-center px-3 py-2 text-slate-300 font-medium">AI Ready</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {factModels.map(model => (
                      <tr key={model.id} className="hover:bg-slate-800/30">
                        <td className="px-4 py-3">
                          <div className="font-medium text-white">{model.categoryLabel}</div>
                          <div className="text-xs text-slate-500">{model.categoryId}</div>
                        </td>
                        <td className="text-center px-3 py-3">
                          <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30">
                            {model.mandatoryFacts.length}
                          </Badge>
                        </td>
                        <td className="text-center px-3 py-3">
                          <Badge className="bg-slate-600/50 text-slate-300 border-slate-500/30">
                            {model.optionalFacts.length}
                          </Badge>
                        </td>
                        <td className="text-center px-3 py-3">
                          <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30">
                            {model.severityFacts.length}
                          </Badge>
                        </td>
                        <td className="text-center px-3 py-3">
                          {model.isReadyForAiProbing ? (
                            <div className="flex items-center justify-center gap-1 text-green-400">
                              <CheckCircle2 className="w-4 h-4" />
                              <span className="text-xs">Yes</span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1 text-slate-500">
                              <XCircle className="w-4 h-4" />
                              <span className="text-xs">No</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between pt-2 text-xs text-slate-500">
                <span>{factModels.length} category model(s) defined</span>
                <span>{factModels.filter(m => m.isReadyForAiProbing).length} ready for AI Probing</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer Save Button */}
      {hasChanges && (
        <div className="flex justify-end pt-4 border-t border-slate-800">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            size="lg"
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save All Changes
          </Button>
        </div>
      )}
    </div>
  );
}

// Export helper functions for use elsewhere
export const getDefaultConfig = () => ({ ...DEFAULT_CONFIG });
export const SYSTEM_CONFIG_KEY = CONFIG_KEY;