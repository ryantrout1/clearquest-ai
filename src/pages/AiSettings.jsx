import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Settings, Save, Loader2, ArrowLeft, FileText, ListChecks, MessageSquare, Check, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const SETTINGS_TABS = [
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
    ai_default_probing_instructions: ""
  });
  
  const [originalData, setOriginalData] = useState({
    ai_report_instructions: "",
    ai_default_section_summary_instructions: "",
    ai_default_probing_instructions: ""
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
        loadSettings();
        return;
      }

      const currentUser = await base44.auth.me();
      if (currentUser.role !== 'SUPER_ADMIN') {
        navigate(createPageUrl("HomeHub"));
        return;
      }
      setUser(currentUser);
      loadSettings();
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
          ai_default_probing_instructions: settings[0].ai_default_probing_instructions || ""
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

            {/* Info Card */}
            <Card className="bg-slate-800/30 border-slate-700/50 mt-6">
              <CardContent className="p-4">
                <p className="text-xs text-slate-400 leading-relaxed">
                  These settings apply globally to all interviews. Section-specific and pack-specific instructions will layer on top of these defaults.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Editor */}
          <div className="flex flex-col">
            <Card className="bg-slate-800/50 border-slate-700 flex-1 flex flex-col">
              {/* Editor Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
                <div>
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    {activeTabConfig && <activeTabConfig.icon className="w-5 h-5 text-blue-400" />}
                    {activeTabConfig?.label}
                  </h2>
                  <p className="text-sm text-slate-400 mt-0.5">
                    {activeTabConfig?.description}
                  </p>
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
                      variant="outline"
                      className="border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
                    >
                      Edit Instructions
                    </Button>
                  )}
                </div>
              </div>

              {/* Editor Content */}
              <div className="flex-1 p-5">
                {activeTabConfig && (
                  <Textarea
                    value={formData[activeTabConfig.field]}
                    onChange={(e) => setFormData({...formData, [activeTabConfig.field]: e.target.value})}
                    disabled={!isEditing}
                    className={cn(
                      "w-full h-[calc(100vh-340px)] min-h-[400px] resize-none font-mono text-sm leading-relaxed",
                      isEditing 
                        ? "bg-slate-900 border-blue-500/50 text-white focus:border-blue-400" 
                        : "bg-slate-900/50 border-slate-700 text-slate-300"
                    )}
                    placeholder={`Enter ${activeTabConfig.label.toLowerCase()} instructions...`}
                  />
                )}
              </div>

              {/* Editor Footer */}
              {isEditing && (
                <div className="px-5 py-3 border-t border-slate-700 bg-slate-800/30">
                  <div className="flex items-center justify-between text-xs text-slate-500">
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
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}