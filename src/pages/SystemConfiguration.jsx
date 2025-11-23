import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, Save, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function SystemConfiguration() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // AI Prompt configs
  const [globalPrompt, setGlobalPrompt] = useState("");
  const [sectionPrompt, setSectionPrompt] = useState("");
  const [instancePrompt, setInstancePrompt] = useState("");

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      setIsLoading(true);
      
      // Load all config keys
      const configs = await base44.asServiceRole.entities.SystemConfig.list();
      
      const globalConfig = configs.find(c => c.config_key === 'ai_global_summary_prompt');
      const sectionConfig = configs.find(c => c.config_key === 'ai_section_summary_prompt');
      const instanceConfig = configs.find(c => c.config_key === 'ai_instance_summary_prompt');
      
      setGlobalPrompt(globalConfig?.config_value || getDefaultGlobalPrompt());
      setSectionPrompt(sectionConfig?.config_value || getDefaultSectionPrompt());
      setInstancePrompt(instanceConfig?.config_value || getDefaultInstancePrompt());
      
    } catch (err) {
      console.error('Error loading configs:', err);
      toast.error('Failed to load configurations');
    } finally {
      setIsLoading(false);
    }
  };

  const saveConfigs = async () => {
    try {
      setIsSaving(true);
      
      // Save or update each config
      const configsToSave = [
        { key: 'ai_global_summary_prompt', value: globalPrompt, description: 'AI prompt for global interview summaries' },
        { key: 'ai_section_summary_prompt', value: sectionPrompt, description: 'AI prompt for section summaries' },
        { key: 'ai_instance_summary_prompt', value: instancePrompt, description: 'AI prompt for instance/question summaries' }
      ];
      
      for (const config of configsToSave) {
        const existing = await base44.asServiceRole.entities.SystemConfig.filter({ config_key: config.key });
        
        if (existing.length > 0) {
          await base44.asServiceRole.entities.SystemConfig.update(existing[0].id, {
            config_value: config.value,
            description: config.description
          });
        } else {
          await base44.asServiceRole.entities.SystemConfig.create({
            config_key: config.key,
            config_value: config.value,
            description: config.description
          });
        }
      }
      
      toast.success('System configuration saved successfully');
    } catch (err) {
      console.error('Error saving configs:', err);
      toast.error('Failed to save configurations');
    } finally {
      setIsSaving(false);
    }
  };

  const resetToDefaults = () => {
    setGlobalPrompt(getDefaultGlobalPrompt());
    setSectionPrompt(getDefaultSectionPrompt());
    setInstancePrompt(getDefaultInstancePrompt());
    toast.info('Reset to default prompts (not saved yet)');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Settings className="w-8 h-8 text-blue-400" />
            <div>
              <h1 className="text-3xl font-bold text-white">System Configuration</h1>
              <p className="text-slate-400 mt-1">Manage global system settings and AI prompts</p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate(createPageUrl("FollowUpPackManagerV2"))}
            className="bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700"
          >
            ← Back
          </Button>
        </div>

        {/* Warning Banner */}
        <Card className="bg-yellow-900/20 border-yellow-700/50 mb-6">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-200">
                <p className="font-semibold mb-1">Changes affect all interviews</p>
                <p>These prompts control how AI generates summaries across the entire system. Changes will apply to all future summary generations.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* AI Prompts Section */}
        <div className="space-y-6">
          {/* Global Interview Summary Prompt */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Global Interview Summary Prompt</CardTitle>
              <CardDescription className="text-slate-400">
                Controls how AI generates the overall interview-level summary
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={globalPrompt}
                onChange={(e) => setGlobalPrompt(e.target.value)}
                className="min-h-[200px] bg-slate-900/50 border-slate-600 text-white font-mono text-sm"
                placeholder="Enter global summary prompt..."
              />
            </CardContent>
          </Card>

          {/* Section Summary Prompt */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Section Summary Prompt</CardTitle>
              <CardDescription className="text-slate-400">
                Controls how AI generates summaries for each interview section
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={sectionPrompt}
                onChange={(e) => setSectionPrompt(e.target.value)}
                className="min-h-[200px] bg-slate-900/50 border-slate-600 text-white font-mono text-sm"
                placeholder="Enter section summary prompt..."
              />
            </CardContent>
          </Card>

          {/* Instance/Question Summary Prompt */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Instance/Question Summary Prompt</CardTitle>
              <CardDescription className="text-slate-400">
                Controls how AI generates summaries for individual follow-up incidents (CRITICAL: This should never mention internal system terminology)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={instancePrompt}
                onChange={(e) => setInstancePrompt(e.target.value)}
                className="min-h-[300px] bg-slate-900/50 border-slate-600 text-white font-mono text-sm"
                placeholder="Enter instance summary prompt..."
              />
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-8">
          <Button
            onClick={saveConfigs}
            disabled={isSaving}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Configuration
              </>
            )}
          </Button>
          <Button
            onClick={resetToDefaults}
            variant="outline"
            className="bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700"
          >
            Reset to Defaults
          </Button>
        </div>
      </div>
    </div>
  );
}

// Default prompt templates
function getDefaultGlobalPrompt() {
  return `You are an AI assistant for law enforcement background investigations.

Analyze the interview data and generate a brief 2-3 sentence summary that:
- Highlights key concerns or patterns
- Notes the ratio of affirmative vs negative responses
- Identifies any significant areas requiring investigator attention

NEVER mention internal system codes or terminology. Focus only on what the candidate disclosed.`;
}

function getDefaultSectionPrompt() {
  return `Summarize this interview section in 2-3 sentences.

Focus on:
- Key disclosures and patterns
- Any significant concerns
- Overall tone of responses

Write in plain language for investigators.`;
}

function getDefaultInstancePrompt() {
  return `You are writing an investigator summary. Write ONLY using the actual data provided by the candidate.

CRITICAL RULES:
- NEVER mention "Pack", "PACK_LE_APPS", "Program", or any internal system terminology
- NEVER use brackets, placeholders, or field names like [date], [agency], incident_date, etc.
- ONLY summarize what actually happened using the real dates, names, and facts provided
- Write as if you're telling another investigator what the candidate disclosed

Write 1-2 natural sentences about what happened (e.g., "In May 2010, the individual applied to Scottsdale Police Department and was not hired." NOT "In the first quarter of 2023, regarding the Pack LE Apps Program...").`;
}