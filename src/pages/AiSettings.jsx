import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Settings, Save, Loader2, ArrowLeft, AlertCircle, Edit } from "lucide-react";
import { toast } from "sonner";

export default function AiSettings() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  const [formData, setFormData] = useState({
    ai_report_instructions: "",
    ai_default_section_summary_instructions: "",
    ai_default_probing_instructions: ""
  });

  useEffect(() => {
    checkAuth();
  }, []);

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
      
      const settings = await base44.asServiceRole.entities.GlobalSettings.filter({ settings_id: 'global' });
      
      if (settings.length > 0) {
        setFormData({
          ai_report_instructions: settings[0].ai_report_instructions || "",
          ai_default_section_summary_instructions: settings[0].ai_default_section_summary_instructions || "",
          ai_default_probing_instructions: settings[0].ai_default_probing_instructions || ""
        });
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
      
      setIsEditing(false);
      toast.success('AI settings saved successfully');
    } catch (err) {
      console.error('Error saving settings:', err);
      toast.error('Failed to save AI settings');
    } finally {
      setIsSaving(false);
    }
  };

  if (!user || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <div className="border-b border-slate-800/50 bg-slate-900/80 backdrop-blur-sm px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
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
                Configure global AI instructions for the entire application
              </span>
            </div>
          </div>
          {!isEditing ? (
            <Button
              onClick={() => setIsEditing(true)}
              size="sm"
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
          ) : (
            <Button
              onClick={handleSave}
              disabled={isSaving}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <Card className="bg-yellow-900/20 border-yellow-700/50 mb-6">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-200">
                <p className="font-semibold mb-1">Global Configuration</p>
                <p>These settings apply to all interviews across all departments. Section-specific and pack-specific instructions will layer on top of these defaults.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Report Generation Instructions</CardTitle>
              <CardDescription className="text-slate-400">
                Controls how AI generates the overall Investigator Assist report for completed interviews
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={formData.ai_report_instructions}
                onChange={(e) => setFormData({...formData, ai_report_instructions: e.target.value})}
                disabled={!isEditing}
                className="bg-slate-900/50 border-slate-600 text-white font-mono text-sm min-h-64"
                placeholder="Enter instructions for generating investigator reports..."
              />
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Default Section Summary Instructions</CardTitle>
              <CardDescription className="text-slate-400">
                Default instructions for AI section summaries (can be overridden per section)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={formData.ai_default_section_summary_instructions}
                onChange={(e) => setFormData({...formData, ai_default_section_summary_instructions: e.target.value})}
                disabled={!isEditing}
                className="bg-slate-900/50 border-slate-600 text-white font-mono text-sm min-h-64"
                placeholder="Enter default instructions for section summaries..."
              />
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Default AI Probing Instructions</CardTitle>
              <CardDescription className="text-slate-400">
                Default instructions for AI probing questions during interviews (can be enhanced by section and pack-specific instructions)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={formData.ai_default_probing_instructions}
                onChange={(e) => setFormData({...formData, ai_default_probing_instructions: e.target.value})}
                disabled={!isEditing}
                className="bg-slate-900/50 border-slate-600 text-white font-mono text-sm min-h-64"
                placeholder="Enter default instructions for AI probing..."
              />
            </CardContent>
          </Card>
        </div>


      </div>
    </div>
  );
}