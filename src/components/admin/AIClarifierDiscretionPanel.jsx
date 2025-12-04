import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Save, Plus, Trash2, Loader2, ChevronDown, ChevronUp, 
  Anchor, MessageSquare, Shield, AlertCircle, Lock
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const CONFIG_KEY = "ai_clarifier_discretion_config";

// System-locked messages (display only, non-editable)
const SYSTEM_LOCKED_MESSAGES = {
  singleInstanceOpening: "Thanks. I'll ask a few quick factual questions to keep things clear.",
  multiInstanceOpening: "Got it. I'll take these one at a time so everything stays clear."
};

const DEFAULT_CONFIG = {
  anchorCategories: [
    "agency",
    "month_year",
    "location",
    "position",
    "outcome",
    "amount",
    "frequency",
    "duration"
  ],
  clarifierStrategy: {
    maxCombinedClarifiersPerInstance: 1,
    maxMicroClarifiersPerInstance: 2,
    maxTotalClarifiersPerInstance: 3,
    allowCombinedClarifier: true,
    allowMicroClarifier: true
  },
  toneControl: "soft",
  severityProfile: "standard",
  vagueAnswerDetection: {
    vagueTokens: [
      "i don't recall",
      "i dont recall",
      "i don't know",
      "i dont know",
      "not sure",
      "unknown",
      "can't remember",
      "cant remember",
      "no idea",
      "idk"
    ],
    maxNonSubstantiveAllowed: 2
  },
  instanceHandling: {
    allowMultipleInstances: true
  }
};

export default function AIClarifierDiscretionPanel() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [newAnchor, setNewAnchor] = useState("");
  const [newVagueToken, setNewVagueToken] = useState("");

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setIsLoading(true);
    try {
      const configs = await base44.entities.SystemConfig.filter({ config_key: CONFIG_KEY });
      if (configs.length > 0 && configs[0].config_data) {
        const loaded = { ...DEFAULT_CONFIG, ...configs[0].config_data };
        // Ensure nested objects are merged
        loaded.clarifierStrategy = { ...DEFAULT_CONFIG.clarifierStrategy, ...configs[0].config_data.clarifierStrategy };
        loaded.vagueAnswerDetection = { ...DEFAULT_CONFIG.vagueAnswerDetection, ...configs[0].config_data.vagueAnswerDetection };
        loaded.instanceHandling = { ...DEFAULT_CONFIG.instanceHandling, ...configs[0].config_data.instanceHandling };
        setConfig(loaded);
      } else {
        setConfig(DEFAULT_CONFIG);
      }
    } catch (err) {
      console.error("Error loading AI clarifier config:", err);
      toast.error("Failed to load configuration");
    } finally {
      setIsLoading(false);
    }
  };

  const saveConfig = async () => {
    setIsSaving(true);
    try {
      const configs = await base44.entities.SystemConfig.filter({ config_key: CONFIG_KEY });
      
      if (configs.length > 0) {
        await base44.entities.SystemConfig.update(configs[0].id, {
          config_data: config
        });
      } else {
        await base44.entities.SystemConfig.create({
          config_key: CONFIG_KEY,
          config_value: "AI Clarifier & Discretion Configuration",
          description: "Configuration for clarifier strategy, tone, severity, and vague answer detection",
          config_data: config
        });
      }
      
      toast.success("AI Clarifier & Discretion settings saved");
    } catch (err) {
      console.error("Error saving config:", err);
      toast.error("Failed to save configuration");
    } finally {
      setIsSaving(false);
    }
  };

  // Anchor management
  const addAnchor = () => {
    if (newAnchor.trim() && !config.anchorCategories.includes(newAnchor.toLowerCase().replace(/\s+/g, '_'))) {
      setConfig(prev => ({
        ...prev,
        anchorCategories: [...prev.anchorCategories, newAnchor.toLowerCase().replace(/\s+/g, '_')]
      }));
      setNewAnchor("");
    }
  };

  const removeAnchor = (index) => {
    setConfig(prev => ({
      ...prev,
      anchorCategories: prev.anchorCategories.filter((_, i) => i !== index)
    }));
  };

  // Vague token management
  const addVagueToken = () => {
    if (newVagueToken.trim() && !config.vagueAnswerDetection.vagueTokens.includes(newVagueToken.toLowerCase())) {
      setConfig(prev => ({
        ...prev,
        vagueAnswerDetection: {
          ...prev.vagueAnswerDetection,
          vagueTokens: [...prev.vagueAnswerDetection.vagueTokens, newVagueToken.toLowerCase()]
        }
      }));
      setNewVagueToken("");
    }
  };

  const removeVagueToken = (index) => {
    setConfig(prev => ({
      ...prev,
      vagueAnswerDetection: {
        ...prev.vagueAnswerDetection,
        vagueTokens: prev.vagueAnswerDetection.vagueTokens.filter((_, i) => i !== index)
      }
    }));
  };

  if (isLoading) {
    return (
      <Card className="bg-slate-800/30 border-slate-700/50">
        <CardContent className="p-6 text-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-400 mx-auto" />
          <p className="text-slate-400 text-sm mt-2">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-800/30 border-slate-700/50">
      <CardHeader 
        className="cursor-pointer select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageSquare className="w-5 h-5 text-amber-400" />
            <CardTitle className="text-base font-semibold text-white">
              AI Clarifier & Discretion Settings
            </CardTitle>
          </div>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          )}
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-6 pt-0">
          {/* A. Anchor Categories */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <Anchor className="w-4 h-4 text-blue-400" />
              Anchor Categories
            </Label>
            <p className="text-xs text-slate-500">
              Define fact types that can be extracted from candidate answers.
            </p>
            <div className="flex flex-wrap gap-2">
              {config.anchorCategories.map((anchor, index) => (
                <Badge 
                  key={index} 
                  className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-xs flex items-center gap-1"
                >
                  {anchor}
                  <button 
                    onClick={() => removeAnchor(index)}
                    className="ml-1 hover:text-red-400"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newAnchor}
                onChange={(e) => setNewAnchor(e.target.value)}
                placeholder="Add custom anchor..."
                className="bg-slate-900 border-slate-600 text-white text-sm h-8 flex-1"
                onKeyDown={(e) => e.key === 'Enter' && addAnchor()}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={addAnchor}
                className="h-8 border-slate-600 text-slate-300"
              >
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          </div>

          {/* B. Clarifier Strategy Settings */}
          <div className="space-y-3 pt-4 border-t border-slate-700">
            <Label className="text-sm font-medium text-slate-300">Clarifier Strategy</Label>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-slate-400">Max Combined/Instance</Label>
                <Input
                  type="number"
                  min={0}
                  max={5}
                  value={config.clarifierStrategy.maxCombinedClarifiersPerInstance}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    clarifierStrategy: { 
                      ...prev.clarifierStrategy, 
                      maxCombinedClarifiersPerInstance: parseInt(e.target.value) || 1 
                    }
                  }))}
                  className="bg-slate-900 border-slate-600 text-white h-9"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-400">Max Micro/Instance</Label>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  value={config.clarifierStrategy.maxMicroClarifiersPerInstance}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    clarifierStrategy: { 
                      ...prev.clarifierStrategy, 
                      maxMicroClarifiersPerInstance: parseInt(e.target.value) || 2 
                    }
                  }))}
                  className="bg-slate-900 border-slate-600 text-white h-9"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-400">Max Total/Instance</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={config.clarifierStrategy.maxTotalClarifiersPerInstance}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    clarifierStrategy: { 
                      ...prev.clarifierStrategy, 
                      maxTotalClarifiersPerInstance: parseInt(e.target.value) || 3 
                    }
                  }))}
                  className="bg-slate-900 border-slate-600 text-white h-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="flex items-center justify-between bg-slate-900/50 rounded-lg p-3">
                <Label className="text-xs text-slate-300">Allow Combined Clarifier</Label>
                <Switch
                  checked={config.clarifierStrategy.allowCombinedClarifier}
                  onCheckedChange={(checked) => setConfig(prev => ({
                    ...prev,
                    clarifierStrategy: { ...prev.clarifierStrategy, allowCombinedClarifier: checked }
                  }))}
                />
              </div>
              <div className="flex items-center justify-between bg-slate-900/50 rounded-lg p-3">
                <Label className="text-xs text-slate-300">Allow Micro Clarifier</Label>
                <Switch
                  checked={config.clarifierStrategy.allowMicroClarifier}
                  onCheckedChange={(checked) => setConfig(prev => ({
                    ...prev,
                    clarifierStrategy: { ...prev.clarifierStrategy, allowMicroClarifier: checked }
                  }))}
                />
              </div>
            </div>
          </div>

          {/* C. Tone Control */}
          <div className="space-y-3 pt-4 border-t border-slate-700">
            <Label className="text-sm font-medium text-slate-300">Tone Control</Label>
            <Select
              value={config.toneControl}
              onValueChange={(value) => setConfig(prev => ({ ...prev, toneControl: value }))}
            >
              <SelectTrigger className="bg-slate-900 border-slate-600 text-white w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="soft">Soft (default)</SelectItem>
                <SelectItem value="neutral">Neutral</SelectItem>
                <SelectItem value="firm">Firm</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* D. Severity Profile */}
          <div className="space-y-3 pt-4 border-t border-slate-700">
            <Label className="text-sm font-medium text-slate-300">Severity Profile</Label>
            <Select
              value={config.severityProfile}
              onValueChange={(value) => setConfig(prev => ({ ...prev, severityProfile: value }))}
            >
              <SelectTrigger className="bg-slate-900 border-slate-600 text-white w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="laxed">Laxed</SelectItem>
                <SelectItem value="standard">Standard (default)</SelectItem>
                <SelectItem value="strict">Strict</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* E. Vague Answer Detection */}
          <div className="space-y-3 pt-4 border-t border-slate-700">
            <Label className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-orange-400" />
              Vague Answer Detection
            </Label>
            
            <div className="space-y-2">
              <Label className="text-xs text-slate-400">Vague Tokens</Label>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {config.vagueAnswerDetection.vagueTokens.map((token, index) => (
                  <Badge 
                    key={index} 
                    className="bg-orange-500/20 text-orange-300 border-orange-500/30 text-xs flex items-center gap-1"
                  >
                    {token}
                    <button 
                      onClick={() => removeVagueToken(index)}
                      className="ml-1 hover:text-red-400"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newVagueToken}
                  onChange={(e) => setNewVagueToken(e.target.value)}
                  placeholder="Add vague token..."
                  className="bg-slate-900 border-slate-600 text-white text-sm h-8 flex-1"
                  onKeyDown={(e) => e.key === 'Enter' && addVagueToken()}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addVagueToken}
                  className="h-8 border-slate-600 text-slate-300"
                >
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-slate-400">Max Non-Substantive Allowed</Label>
              <Input
                type="number"
                min={1}
                max={5}
                value={config.vagueAnswerDetection.maxNonSubstantiveAllowed}
                onChange={(e) => setConfig(prev => ({
                  ...prev,
                  vagueAnswerDetection: { 
                    ...prev.vagueAnswerDetection, 
                    maxNonSubstantiveAllowed: parseInt(e.target.value) || 2 
                  }
                }))}
                className="bg-slate-900 border-slate-600 text-white h-9 w-32"
              />
            </div>
          </div>

          {/* F. Instance Handling */}
          <div className="space-y-3 pt-4 border-t border-slate-700">
            <Label className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <Shield className="w-4 h-4 text-green-400" />
              Instance Handling
            </Label>

            <div className="flex items-center justify-between bg-slate-900/50 rounded-lg p-3">
              <Label className="text-xs text-slate-300">Allow Multiple Instances</Label>
              <Switch
                checked={config.instanceHandling.allowMultipleInstances}
                onCheckedChange={(checked) => setConfig(prev => ({
                  ...prev,
                  instanceHandling: { ...prev.instanceHandling, allowMultipleInstances: checked }
                }))}
              />
            </div>

            {/* System-locked messages (display only) */}
            <div className="space-y-3 bg-slate-900/30 rounded-lg p-4 border border-slate-700/50">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Lock className="w-3 h-3" />
                <span>System-Locked Opening Messages</span>
              </div>
              
              <div className="space-y-2">
                <Label className="text-xs text-slate-500">Single Instance Opening</Label>
                <div className="bg-slate-800/50 rounded p-2 text-xs text-slate-400 italic border border-slate-700/50">
                  "{SYSTEM_LOCKED_MESSAGES.singleInstanceOpening}"
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-slate-500">Multi-Instance Opening</Label>
                <div className="bg-slate-800/50 rounded p-2 text-xs text-slate-400 italic border border-slate-700/50">
                  "{SYSTEM_LOCKED_MESSAGES.multiInstanceOpening}"
                </div>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-4 border-t border-slate-700">
            <Button
              onClick={saveConfig}
              disabled={isSaving}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Settings
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}