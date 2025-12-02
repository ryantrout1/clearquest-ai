import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Layers, AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const DEFAULT_V3_CONFIG = {
  enabled_categories: [],
  max_turns_per_incident: 12,
  non_substantive_threshold_chars: 15,
  logging_level: "BASIC",
  stop_when_required_complete: true
};

const CONFIG_KEY = "global_config";

/**
 * V3 Configuration Panel
 * Admin UI for configuring Interview V3 (FactModel-based probing)
 */
export default function V3ConfigPanel() {
  const [v3Config, setV3Config] = useState(DEFAULT_V3_CONFIG);
  const [systemConfigId, setSystemConfigId] = useState(null);
  const [fullSystemConfig, setFullSystemConfig] = useState(null);
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
      const normalized = models.map(m => ({
        id: m.id,
        category_id: m.category_id,
        category_label: m.category_label,
        status: m.status || "DRAFT",
        is_ready_for_ai_probing: m.is_ready_for_ai_probing || false,
        required_fields: m.required_fields || [],
        optional_fields: m.optional_fields || []
      }));
      setFactModels(normalized);
    } catch (err) {
      console.error("[V3 CONFIG] Error loading fact models:", err);
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
        setSystemConfigId(existingConfig.id);
        setFullSystemConfig(existingConfig.config_data || {});
        
        // Extract V3 config
        const v3Data = existingConfig.config_data?.v3 || DEFAULT_V3_CONFIG;
        setV3Config({
          ...DEFAULT_V3_CONFIG,
          ...v3Data
        });
      } else {
        setV3Config(DEFAULT_V3_CONFIG);
        setFullSystemConfig({});
        setSystemConfigId(null);
      }
    } catch (err) {
      console.error("[V3 CONFIG] Error loading config:", err);
      toast.error("Failed to load V3 configuration");
      setV3Config(DEFAULT_V3_CONFIG);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updatedConfigData = {
        ...fullSystemConfig,
        v3: v3Config
      };

      if (systemConfigId) {
        await base44.entities.SystemConfig.update(systemConfigId, {
          config_data: updatedConfigData,
          description: "Global system configuration with V3 settings"
        });
      } else {
        const created = await base44.entities.SystemConfig.create({
          config_key: CONFIG_KEY,
          config_data: updatedConfigData,
          description: "Global system configuration with V3 settings"
        });
        setSystemConfigId(created.id);
      }
      
      setFullSystemConfig(updatedConfigData);
      setHasChanges(false);
      toast.success("V3 Configuration saved successfully");
    } catch (err) {
      console.error("[V3 CONFIG] Error saving:", err);
      toast.error("Failed to save V3 configuration");
    } finally {
      setIsSaving(false);
    }
  };

  const updateV3Config = (field, value) => {
    setV3Config(prev => ({
      ...prev,
      [field]: value
    }));
    setHasChanges(true);
  };

  const toggleCategory = (categoryId) => {
    const enabledSet = new Set(v3Config.enabled_categories || []);
    if (enabledSet.has(categoryId)) {
      enabledSet.delete(categoryId);
    } else {
      enabledSet.add(categoryId);
    }
    updateV3Config("enabled_categories", Array.from(enabledSet));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
      </div>
    );
  }

  const enabledSet = new Set(v3Config.enabled_categories || []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-400" />
            Interview V3 Configuration
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Configure V3 FactModel-based probing per category
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          className={cn(
            "bg-emerald-600 hover:bg-emerald-700",
            hasChanges && "ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-900"
          )}
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {isSaving ? "Saving..." : "Save V3 Config"}
        </Button>
      </div>

      {/* Warning Banner */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-emerald-950/20 border border-emerald-800/50">
        <AlertTriangle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-emerald-200">
          <p className="font-medium">V3 Probing Active</p>
          <p className="text-emerald-300/80 mt-0.5">
            V3 uses FactModel definitions and conversational AI to collect structured incident data. 
            Only categories with ACTIVE FactModels and enabled below will use V3 probing.
          </p>
        </div>
      </div>

      {/* Category Toggles */}
      <Card className="bg-[#0f1629] border-slate-800/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            Enabled Categories for V3 Probing
          </CardTitle>
        </CardHeader>
        <CardContent>
          {factModelsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
            </div>
          ) : factModels.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <p className="text-sm">No FactModels defined yet.</p>
              <p className="text-xs mt-2 text-slate-500">
                Create FactModels in the FactModel Admin to enable V3 probing.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-400 mb-4">
                Toggle V3 probing for each category. Only categories with ACTIVE FactModels can be enabled.
              </p>
              <div className="space-y-2">
                {factModels.map(model => {
                  const isEnabled = enabledSet.has(model.category_id);
                  const canEnable = model.status === "ACTIVE" && model.is_ready_for_ai_probing;
                  const requiredCount = model.required_fields?.length || 0;
                  const optionalCount = model.optional_fields?.length || 0;
                  
                  return (
                    <div
                      key={model.id}
                      className={cn(
                        "flex items-center justify-between rounded-lg border p-4 transition-colors",
                        isEnabled 
                          ? "border-emerald-500/50 bg-emerald-950/20" 
                          : canEnable
                          ? "border-slate-700 hover:border-slate-600"
                          : "border-slate-800 bg-slate-900/30 opacity-60"
                      )}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-sm font-medium text-white">
                            {model.category_label}
                          </span>
                          <Badge className="text-[10px] bg-slate-700 text-slate-300 border-slate-600">
                            {model.category_id}
                          </Badge>
                          <Badge className={`text-[10px] ${
                            model.status === "ACTIVE"
                              ? "bg-green-500/20 text-green-300 border-green-500/30"
                              : model.status === "DRAFT"
                              ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
                              : "bg-red-500/20 text-red-300 border-red-500/30"
                          }`}>
                            {model.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-400">
                          <span>{requiredCount} required</span>
                          <span>•</span>
                          <span>{optionalCount} optional</span>
                          {!canEnable && (
                            <>
                              <span>•</span>
                              <span className="text-amber-400">
                                {model.status !== "ACTIVE" ? "Not ACTIVE" : "Not ready for AI"}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={() => toggleCategory(model.category_id)}
                        disabled={!canEnable}
                      />
                    </div>
                  );
                })}
              </div>
              
              <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                <span>{factModels.length} total categories</span>
                <span className="text-emerald-400 font-medium">
                  {enabledSet.size} enabled for V3
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Behavior Settings */}
      <Card className="bg-[#0f1629] border-slate-800/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-400" />
            V3 Probing Behavior
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Max Turns */}
            <div className="space-y-2">
              <Label className="text-sm text-slate-200">
                Max turns per incident
              </Label>
              <Input
                type="number"
                min={1}
                max={30}
                value={v3Config.max_turns_per_incident}
                onChange={(e) => updateV3Config("max_turns_per_incident", parseInt(e.target.value) || 12)}
                className="bg-slate-800 border-slate-600 text-white"
              />
              <p className="text-xs text-slate-500">
                Maximum AI question/answer exchanges per V3 incident
              </p>
            </div>

            {/* Non-Substantive Threshold */}
            <div className="space-y-2">
              <Label className="text-sm text-slate-200">
                Min characters for substantive answer
              </Label>
              <Input
                type="number"
                min={5}
                max={100}
                value={v3Config.non_substantive_threshold_chars}
                onChange={(e) => updateV3Config("non_substantive_threshold_chars", parseInt(e.target.value) || 15)}
                className="bg-slate-800 border-slate-600 text-white"
              />
              <p className="text-xs text-slate-500">
                Answers shorter than this are flagged as non-substantive
              </p>
            </div>
          </div>

          {/* Stop When Complete */}
          <div className="flex items-center justify-between rounded-lg border border-slate-700 p-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium text-white">
                Stop when all required fields collected
              </Label>
              <p className="text-xs text-slate-400">
                End probing early when all required FactModel fields have values
              </p>
            </div>
            <Switch
              checked={v3Config.stop_when_required_complete}
              onCheckedChange={(checked) => updateV3Config("stop_when_required_complete", checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Logging Settings */}
      <Card className="bg-[#0f1629] border-slate-800/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-purple-400" />
            V3 Logging & Tracing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm text-slate-200">Logging Level</Label>
            <Select
              value={v3Config.logging_level}
              onValueChange={(value) => updateV3Config("logging_level", value)}
            >
              <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="NONE" className="text-white">
                  <div className="flex flex-col items-start">
                    <span className="font-medium">None</span>
                    <span className="text-xs text-slate-400">No V3 logging</span>
                  </div>
                </SelectItem>
                <SelectItem value="BASIC" className="text-white">
                  <div className="flex flex-col items-start">
                    <span className="font-medium">Basic</span>
                    <span className="text-xs text-slate-400">Log start/stop events + transcript</span>
                  </div>
                </SelectItem>
                <SelectItem value="TRACE" className="text-white">
                  <div className="flex flex-col items-start">
                    <span className="font-medium">Trace</span>
                    <span className="text-xs text-slate-400">Full detail including fact extraction</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">
              Controls verbosity of V3 DecisionTrace and InterviewTranscript logging
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Status Summary */}
      <Card className="bg-[#0f1629] border-slate-800/50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-3 h-3 rounded-full",
                enabledSet.size > 0 ? "bg-emerald-500 animate-pulse" : "bg-slate-600"
              )} />
              <span className="text-sm text-slate-300">
                V3 Probing Status:
              </span>
              <Badge className={
                enabledSet.size > 0
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                  : "bg-slate-600/20 text-slate-400 border-slate-600/30"
              }>
                {enabledSet.size > 0 
                  ? `Active for ${enabledSet.size} category(s)` 
                  : "Disabled (no categories enabled)"}
              </Badge>
            </div>
            
            {hasChanges && (
              <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">
                Unsaved Changes
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Footer Save */}
      {hasChanges && (
        <div className="flex justify-end pt-4 border-t border-slate-800">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            size="lg"
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save V3 Configuration
          </Button>
        </div>
      )}
    </div>
  );
}