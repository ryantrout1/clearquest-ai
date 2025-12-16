import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent } from "@/components/ui/card";
import { Settings, Save, Loader2, ArrowLeft, FileText, ListChecks, MessageSquare, Check, X, Cpu } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import AIClarifierDiscretionPanel from "../components/admin/AIClarifierDiscretionPanel";

const SETTINGS_TABS = [
  {
    id: "model",
    label: "Model Configuration",
    icon: Cpu,
    field: null,
    description: "Configure AI model, temperature, and token limits"
  },
  {
    id: "report",
    label: "Report Generation",
    icon: FileText,
    field: "ai_report_instructions",
    description: "Controls how AI generates the overall Investigator Assist report for completed interviews"
  },
  {
    id: "section",
    label: "Section Summaries",
    icon: ListChecks,
    field: "ai_default_section_summary_instructions",
    description: "Default instructions for AI section summaries (can be overridden per section)"
  },
  {
    id: "probing",
    label: "AI Probing",
    icon: MessageSquare,
    field: "ai_default_probing_instructions",
    description: "Default instructions for AI probing questions during interviews"
  }
];

const AI_MODELS = [
  { value: "gpt-4o-mini", label: "GPT-4o Mini (Fast, Cost-effective)" },
  { value: "gpt-4o", label: "GPT-4o (Highest quality)" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
  { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo (Fastest)" }
];

export default function AiSettings() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("report");
  const [isEditing, setIsEditing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  
  const [formData, setFormData] = useState({
    ai_report_instructions: "",
    ai_default_section_summary_instructions: "",
    ai_default_probing_instructions: "",
    ai_model: "gpt-4o-mini",
    ai_temperature: 0.2,
    ai_max_tokens: 512,
    ai_top_p: 1
  });
  
  const [originalData, setOriginalData] = useState({
    ai_report_instructions: "",
    ai_default_section_summary_instructions: "",
    ai_default_probing_instructions: "",
    ai_model: "gpt-4o-mini",
    ai_temperature: 0.2,
    ai_max_tokens: 512,
    ai_top_p: 1
  });

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    const changed = JSON.stringify(formData) !== JSON.stringify(originalData);
    setHasChanges(changed);
  }, [formData, originalData]);

  const checkAuth = async () => {
    try {
      const adminAuth = sessionStorage.getItem("clearquest_admin_auth");
      if (adminAuth) {
        const auth = JSON.parse(adminAuth);
        setUser({ ...auth, role: 'SUPER_ADMIN' });
        console.log('[AI_SETTINGS] adminAuthPresent=true (NO user lookup performed)');
        loadSettings();
        return;
      }

      // No admin auth - redirect to login
      console.log('[AI_SETTINGS] adminAuthPresent=false (NO user lookup performed)');
      navigate(createPageUrl("AdminLogin"));
    } catch (err) {
      navigate(createPageUrl("AdminLogin"));
    }
  };

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      
      const settings = await base44.entities.GlobalSettings.filter({ settings_id: 'global' });
      
      if (settings.length > 0) {
        const data = {
          ai_report_instructions: settings[0].ai_report_instructions || "",
          ai_default_section_summary_instructions: settings[0].ai_default_section_summary_instructions || "",
          ai_default_probing_instructions: settings[0].ai_default_probing_instructions || "",
          ai_model: settings[0].ai_model || "gpt-4o-mini",
          ai_temperature: settings[0].ai_temperature ?? 0.2,
          ai_max_tokens: settings[0].ai_max_tokens ?? 512,
          ai_top_p: settings[0].ai_top_p ?? 1
        };
        setFormData(data);
        setOriginalData(data);
      }
    } catch (err) {
      console.error('Error loading settings:', err);
      toast.error('Failed to load AI settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      
      const settings = await base44.entities.GlobalSettings.filter({ settings_id: 'global' });
      
      if (settings.length > 0) {
        await base44.entities.GlobalSettings.update(settings[0].id, formData);
      } else {
        await base44.entities.GlobalSettings.create({
          settings_id: 'global',
          ...formData
        });
      }
      
      setOriginalData({...formData});
      setIsEditing(false);
      toast.success('AI settings saved successfully');
    } catch (err) {
      console.error('Error saving settings:', err);
      toast.error('Failed to save AI settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData({...originalData});
    setIsEditing(false);
  };

  const activeTabConfig = SETTINGS_TABS.find(t => t.id === activeTab);
  const isModelTab = activeTab === "model";

  if (!user || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-800/50 bg-slate-900/80 backdrop-blur-sm px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(createPageUrl("SystemAdminDashboard"))}
              className="text-slate-400 hover:text-white hover:bg-slate-800 -ml-2"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <Settings className="w-5 h-5 text-blue-400" />
            <div>
              <h1 className="text-xl font-semibold text-white">AI Settings</h1>
              <span className="text-xs text-slate-400 block mt-0.5">
                Configure global AI instructions
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          
          {/* Left Column - Tab Navigation */}
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-slate-500 font-medium px-3 mb-3">
              Instruction Types
            </p>
            {SETTINGS_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all",
                    isActive 
                      ? "bg-blue-600/20 border border-blue-500/50 text-white" 
                      : "bg-slate-800/30 border border-transparent text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                  )}
                >
                  <Icon className={cn("w-5 h-5", isActive ? "text-blue-400" : "text-slate-500")} />
                  <div>
                    <p className="font-medium text-sm">{tab.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{tab.description}</p>
                  </div>
                </button>
              );
            })}

            {/* AI Clarifier & Discretion Panel */}
            <AIClarifierDiscretionPanel />

            {/* Info Card */}
            <Card className="bg-slate-800/30 border-slate-700/50 mt-6">
              <CardContent className="p-4">
                <p className="text-xs text-slate-400 leading-relaxed">
                  These settings apply globally to all interviews. Section-specific and pack-specific instructions will layer on top of these defaults.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Content Display */}
          <div className="flex flex-col">
            {/* Header Card */}
            <div className="flex items-center justify-between px-5 py-4 bg-slate-800/50 border border-slate-700 rounded-t-xl">
              <div className="flex items-center gap-3">
                {activeTabConfig && <activeTabConfig.icon className="w-5 h-5 text-blue-400" />}
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    {activeTabConfig?.label}
                  </h2>
                  <p className="text-sm text-slate-400 mt-0.5">
                    {activeTabConfig?.description}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCancel}
                      className="text-slate-400 hover:text-white"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSave}
                      disabled={isSaving || !hasChanges}
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4 mr-1" />
                          Save Changes
                        </>
                      )}
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={() => setIsEditing(true)}
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Edit Instructions
                  </Button>
                )}
              </div>
            </div>

            {/* Content Card */}
            <div className="bg-slate-900/60 border border-t-0 border-slate-700 rounded-b-xl overflow-hidden">
              {isModelTab ? (
                /* Model Configuration Tab */
                <div className="p-6 space-y-6">
                  {/* Model Selection */}
                  <div className="space-y-2">
                    <Label className="text-slate-300">AI Model</Label>
                    <select
                      value={formData.ai_model}
                      onChange={(e) => setFormData({...formData, ai_model: e.target.value})}
                      disabled={!isEditing}
                      className="w-full bg-slate-950 border border-slate-600 rounded-md px-3 py-2 text-white disabled:opacity-60"
                    >
                      {AI_MODELS.map(model => (
                        <option key={model.value} value={model.value}>{model.label}</option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-500">Select the AI model used for all probing and summary generation</p>
                  </div>

                  {/* Temperature */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-slate-300">Temperature</Label>
                      <span className="text-sm font-mono text-blue-400">{formData.ai_temperature.toFixed(2)}</span>
                    </div>
                    <Slider
                      value={[formData.ai_temperature]}
                      onValueChange={([val]) => setFormData({...formData, ai_temperature: val})}
                      min={0}
                      max={2}
                      step={0.1}
                      disabled={!isEditing}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>0.0 (Rigid/Deterministic)</span>
                      <span>2.0 (Creative/Random)</span>
                    </div>
                    <p className="text-xs text-slate-500">Lower values produce more consistent responses; higher values increase creativity</p>
                  </div>

                  {/* Max Tokens */}
                  <div className="space-y-2">
                    <Label className="text-slate-300">Max Tokens</Label>
                    <Input
                      type="number"
                      value={formData.ai_max_tokens}
                      onChange={(e) => setFormData({...formData, ai_max_tokens: parseInt(e.target.value) || 512})}
                      min={50}
                      max={4096}
                      disabled={!isEditing}
                      className="bg-slate-950 border-slate-600 text-white disabled:opacity-60"
                    />
                    <p className="text-xs text-slate-500">Maximum length of AI responses (50-4096). Lower values may truncate summaries.</p>
                  </div>

                  {/* Top P */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-slate-300">Top P (Nucleus Sampling)</Label>
                      <span className="text-sm font-mono text-blue-400">{formData.ai_top_p.toFixed(2)}</span>
                    </div>
                    <Slider
                      value={[formData.ai_top_p]}
                      onValueChange={([val]) => setFormData({...formData, ai_top_p: val})}
                      min={0}
                      max={1}
                      step={0.05}
                      disabled={!isEditing}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>0.0 (Narrow)</span>
                      <span>1.0 (Full distribution)</span>
                    </div>
                    <p className="text-xs text-slate-500">Controls diversity via nucleus sampling. Use 1.0 for default behavior.</p>
                  </div>

                  {/* Status indicator */}
                  <div className="pt-4 border-t border-slate-700">
                    {hasChanges ? (
                      <span className="text-amber-400 text-sm">● Unsaved changes</span>
                    ) : (
                      <span className="text-slate-500 text-sm">No changes</span>
                    )}
                  </div>
                </div>
              ) : isEditing ? (
                <div className="p-4">
                  <Textarea
                    value={formData[activeTabConfig?.field] || ""}
                    onChange={(e) => setFormData({...formData, [activeTabConfig.field]: e.target.value})}
                    className="w-full h-[calc(100vh-340px)] min-h-[400px] resize-none font-mono text-sm leading-relaxed bg-slate-950 border-blue-500/50 text-white focus:border-blue-400"
                    placeholder={`Enter ${activeTabConfig?.label?.toLowerCase()} instructions...`}
                  />
                  <div className="flex items-center justify-between text-xs text-slate-500 mt-3 pt-3 border-t border-slate-700">
                    <span>
                      {hasChanges ? (
                        <span className="text-amber-400">● Unsaved changes</span>
                      ) : (
                        <span className="text-slate-500">No changes</span>
                      )}
                    </span>
                    <span>
                      {formData[activeTabConfig?.field]?.length || 0} characters
                    </span>
                  </div>
                </div>
              ) : (
                <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
                  {formData[activeTabConfig?.field] ? (
                    <div className="p-5">
                      <pre className="whitespace-pre-wrap font-mono text-sm text-slate-300 leading-relaxed">
                        {formData[activeTabConfig?.field]}
                      </pre>
                    </div>
                  ) : (
                    <div className="p-8 text-center">
                      <p className="text-slate-500 text-sm">No instructions configured yet.</p>
                      <Button
                        onClick={() => setIsEditing(true)}
                        variant="link"
                        className="text-blue-400 hover:text-blue-300 mt-2"
                      >
                        Add instructions
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}