import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Save, Plus, Trash2, Loader2, CheckCircle, AlertCircle, 
  Anchor, Sliders, MessageSquare, Shield, FlaskConical, 
  ChevronDown, ChevronUp
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const CONFIG_KEY = "ai_probing_config";

const DEFAULT_CONFIG = {
  globalAnchors: [
    "agency",
    "month_year",
    "location",
    "position",
    "outcome",
    "value_amount",
    "frequency",
    "who_involved"
  ],
  discretionEngine: {
    defaultMaxProbes: 3,
    defaultMaxFollowups: 2,
    nonSubstantiveThreshold: 2,
    enableStrictSeverity: true,
    enableLaxedSeverity: true,
    enableProbeBudgeting: true
  },
  topicProfiles: [
    { topic: "honesty_integrity", defaultTone: "firm", severityLevel: "strict" },
    { topic: "violence_dv", defaultTone: "soft", severityLevel: "standard" },
    { topic: "dui_drugs", defaultTone: "neutral", severityLevel: "standard" },
    { topic: "prior_apps", defaultTone: "neutral", severityLevel: "laxed" }
  ],
  clarifierGuardrails: {
    enableStyleGuardrail: true,
    maxClarifierWords: 25,
    forbidNarrativeRequests: true,
    forbidWalkMeThrough: true,
    forbidEmotionalPrompts: true,
    allowCombinedClarifier: true
  }
};

export default function AIProbingConfigPanel() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [originalConfig, setOriginalConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [savingSection, setSavingSection] = useState(null);
  const [expandedSections, setExpandedSections] = useState({
    anchors: true,
    discretion: true,
    topics: true,
    guardrails: true,
    sandbox: false
  });

  // Sandbox state
  const [testAnswer, setTestAnswer] = useState("");
  const [testTopic, setTestTopic] = useState("prior_apps");
  const [testResult, setTestResult] = useState(null);
  const [isRunningTest, setIsRunningTest] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setIsLoading(true);
    try {
      const configs = await base44.entities.SystemConfig.filter({ config_key: CONFIG_KEY });
      if (configs.length > 0 && configs[0].config_data) {
        const loaded = { ...DEFAULT_CONFIG, ...configs[0].config_data };
        setConfig(loaded);
        setOriginalConfig(loaded);
      } else {
        setConfig(DEFAULT_CONFIG);
        setOriginalConfig(DEFAULT_CONFIG);
      }
    } catch (err) {
      console.error("Error loading AI probing config:", err);
      toast.error("Failed to load configuration");
    } finally {
      setIsLoading(false);
    }
  };

  const saveSection = async (sectionKey) => {
    setSavingSection(sectionKey);
    try {
      const configs = await base44.entities.SystemConfig.filter({ config_key: CONFIG_KEY });
      
      const newConfigData = { ...config };
      
      if (configs.length > 0) {
        await base44.entities.SystemConfig.update(configs[0].id, {
          config_data: newConfigData
        });
      } else {
        await base44.entities.SystemConfig.create({
          config_key: CONFIG_KEY,
          config_value: "AI Probing Configuration",
          description: "Configuration for Fact Anchors, Discretion Engine, and Clarifier system",
          config_data: newConfigData
        });
      }
      
      setOriginalConfig(newConfigData);
      toast.success(`${sectionKey} settings saved`);
    } catch (err) {
      console.error("Error saving config:", err);
      toast.error("Failed to save configuration");
    } finally {
      setSavingSection(null);
    }
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Anchor management
  const addAnchor = () => {
    setConfig(prev => ({
      ...prev,
      globalAnchors: [...prev.globalAnchors, "new_anchor"]
    }));
  };

  const updateAnchor = (index, value) => {
    setConfig(prev => ({
      ...prev,
      globalAnchors: prev.globalAnchors.map((a, i) => i === index ? value : a)
    }));
  };

  const removeAnchor = (index) => {
    setConfig(prev => ({
      ...prev,
      globalAnchors: prev.globalAnchors.filter((_, i) => i !== index)
    }));
  };

  // Topic profile management
  const addTopicProfile = () => {
    setConfig(prev => ({
      ...prev,
      topicProfiles: [...prev.topicProfiles, { topic: "new_topic", defaultTone: "neutral", severityLevel: "standard" }]
    }));
  };

  const updateTopicProfile = (index, field, value) => {
    setConfig(prev => ({
      ...prev,
      topicProfiles: prev.topicProfiles.map((t, i) => i === index ? { ...t, [field]: value } : t)
    }));
  };

  const removeTopicProfile = (index) => {
    setConfig(prev => ({
      ...prev,
      topicProfiles: prev.topicProfiles.filter((_, i) => i !== index)
    }));
  };

  // Run sandbox test
  const runSandboxTest = async () => {
    if (!testAnswer.trim()) {
      toast.error("Please enter a test answer");
      return;
    }

    setIsRunningTest(true);
    setTestResult(null);

    try {
      // Step 1: Extract facts
      const extractionResult = await base44.functions.invoke('factExtractor', {
        candidateAnswer: testAnswer,
        packId: "TEST_PACK",
        fieldKey: "TEST_FIELD",
        expectedAnchors: config.globalAnchors
      });

      // Step 2: Get discretion decision
      const discretionResult = await base44.functions.invoke('discretionEngine', {
        collectedAnchors: extractionResult.data?.collectedAnchors || {},
        stillMissingAnchors: extractionResult.data?.stillMissingAnchors || [],
        requiredAnchors: config.globalAnchors.slice(0, 3),
        probeCount: 0,
        maxProbes: config.discretionEngine.defaultMaxProbes,
        severity: "standard",
        topic: testTopic,
        nonSubstantiveCount: 0
      });

      // Step 3: Build clarifier if needed
      let clarifierResult = null;
      if (discretionResult.data?.action !== "stop") {
        clarifierResult = await base44.functions.invoke('clarifierBuilder', {
          targetAnchors: discretionResult.data?.targetAnchors || [],
          collectedAnchors: extractionResult.data?.collectedAnchors || {},
          topic: testTopic,
          tone: discretionResult.data?.tone || "neutral"
        });
      }

      setTestResult({
        extraction: extractionResult.data,
        discretion: discretionResult.data,
        clarifier: clarifierResult?.data
      });

    } catch (err) {
      console.error("Sandbox test error:", err);
      toast.error("Test failed: " + err.message);
      setTestResult({ error: err.message });
    } finally {
      setIsRunningTest(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="bg-[#0f1629] border-slate-800/50">
        <CardContent className="p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400 mx-auto mb-3" />
          <p className="text-slate-400">Loading AI Probing Configuration...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Section 1: Global Fact Anchors */}
      <CollapsibleSection
        title="Global Fact Anchors"
        icon={<Anchor className="w-4 h-4" />}
        expanded={expandedSections.anchors}
        onToggle={() => toggleSection("anchors")}
        color="blue"
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-400 mb-3">
            Define the universal anchor types that can be extracted from candidate answers.
          </p>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {config.globalAnchors.map((anchor, index) => (
              <div key={index} className="flex items-center gap-1">
                <Input
                  value={anchor}
                  onChange={(e) => updateAnchor(index, e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                  className="bg-slate-800 border-slate-600 text-white text-sm h-8 flex-1"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => removeAnchor(index)}
                  className="h-8 w-8 text-slate-400 hover:text-red-400"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={addAnchor}
              className="text-xs border-slate-600 text-slate-300 hover:bg-slate-800"
            >
              <Plus className="w-3 h-3 mr-1" />
              Add Anchor
            </Button>
            <Button
              size="sm"
              onClick={() => saveSection("Global Anchors")}
              disabled={savingSection === "Global Anchors"}
              className="bg-blue-600 hover:bg-blue-700 text-xs"
            >
              {savingSection === "Global Anchors" ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ) : (
                <Save className="w-3 h-3 mr-1" />
              )}
              Save Anchors
            </Button>
          </div>
        </div>
      </CollapsibleSection>

      {/* Section 2: Discretion Engine Settings */}
      <CollapsibleSection
        title="Discretion Engine Settings"
        icon={<Sliders className="w-4 h-4" />}
        expanded={expandedSections.discretion}
        onToggle={() => toggleSection("discretion")}
        color="cyan"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-400 mb-3">
            Configure how the discretion engine decides when to probe and when to stop.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-xs text-slate-300">Default Max Probes</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={config.discretionEngine.defaultMaxProbes}
                onChange={(e) => setConfig(prev => ({
                  ...prev,
                  discretionEngine: { ...prev.discretionEngine, defaultMaxProbes: parseInt(e.target.value) || 3 }
                }))}
                className="bg-slate-800 border-slate-600 text-white h-9"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-300">Default Max Follow-ups</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={config.discretionEngine.defaultMaxFollowups}
                onChange={(e) => setConfig(prev => ({
                  ...prev,
                  discretionEngine: { ...prev.discretionEngine, defaultMaxFollowups: parseInt(e.target.value) || 2 }
                }))}
                className="bg-slate-800 border-slate-600 text-white h-9"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-300">Non-Substantive Threshold</Label>
              <Input
                type="number"
                min={1}
                max={5}
                value={config.discretionEngine.nonSubstantiveThreshold}
                onChange={(e) => setConfig(prev => ({
                  ...prev,
                  discretionEngine: { ...prev.discretionEngine, nonSubstantiveThreshold: parseInt(e.target.value) || 2 }
                }))}
                className="bg-slate-800 border-slate-600 text-white h-9"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3">
              <Label className="text-xs text-slate-300">Enable Strict Severity</Label>
              <Switch
                checked={config.discretionEngine.enableStrictSeverity}
                onCheckedChange={(checked) => setConfig(prev => ({
                  ...prev,
                  discretionEngine: { ...prev.discretionEngine, enableStrictSeverity: checked }
                }))}
              />
            </div>
            <div className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3">
              <Label className="text-xs text-slate-300">Enable Laxed Severity</Label>
              <Switch
                checked={config.discretionEngine.enableLaxedSeverity}
                onCheckedChange={(checked) => setConfig(prev => ({
                  ...prev,
                  discretionEngine: { ...prev.discretionEngine, enableLaxedSeverity: checked }
                }))}
              />
            </div>
            <div className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3">
              <Label className="text-xs text-slate-300">Enable Probe Budgeting</Label>
              <Switch
                checked={config.discretionEngine.enableProbeBudgeting}
                onCheckedChange={(checked) => setConfig(prev => ({
                  ...prev,
                  discretionEngine: { ...prev.discretionEngine, enableProbeBudgeting: checked }
                }))}
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              size="sm"
              onClick={() => saveSection("Discretion Engine")}
              disabled={savingSection === "Discretion Engine"}
              className="bg-cyan-600 hover:bg-cyan-700 text-xs"
            >
              {savingSection === "Discretion Engine" ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ) : (
                <Save className="w-3 h-3 mr-1" />
              )}
              Save Discretion Settings
            </Button>
          </div>
        </div>
      </CollapsibleSection>

      {/* Section 3: Topic Profiles */}
      <CollapsibleSection
        title="Topic Profiles"
        icon={<MessageSquare className="w-4 h-4" />}
        expanded={expandedSections.topics}
        onToggle={() => toggleSection("topics")}
        color="purple"
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-400 mb-3">
            Configure tone and severity defaults for specific topics.
          </p>

          <div className="space-y-2">
            {config.topicProfiles.map((profile, index) => (
              <div key={index} className="flex items-center gap-2 bg-slate-800/50 rounded-lg p-2">
                <Input
                  value={profile.topic}
                  onChange={(e) => updateTopicProfile(index, 'topic', e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                  placeholder="Topic"
                  className="bg-slate-700 border-slate-600 text-white text-sm h-8 flex-1"
                />
                <Select
                  value={profile.defaultTone}
                  onValueChange={(value) => updateTopicProfile(index, 'defaultTone', value)}
                >
                  <SelectTrigger className="w-28 bg-slate-700 border-slate-600 text-white text-xs h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="soft">Soft</SelectItem>
                    <SelectItem value="neutral">Neutral</SelectItem>
                    <SelectItem value="firm">Firm</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={profile.severityLevel}
                  onValueChange={(value) => updateTopicProfile(index, 'severityLevel', value)}
                >
                  <SelectTrigger className="w-28 bg-slate-700 border-slate-600 text-white text-xs h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="laxed">Laxed</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="strict">Strict</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => removeTopicProfile(index)}
                  className="h-8 w-8 text-slate-400 hover:text-red-400"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={addTopicProfile}
              className="text-xs border-slate-600 text-slate-300 hover:bg-slate-800"
            >
              <Plus className="w-3 h-3 mr-1" />
              Add Topic
            </Button>
            <Button
              size="sm"
              onClick={() => saveSection("Topic Profiles")}
              disabled={savingSection === "Topic Profiles"}
              className="bg-purple-600 hover:bg-purple-700 text-xs"
            >
              {savingSection === "Topic Profiles" ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ) : (
                <Save className="w-3 h-3 mr-1" />
              )}
              Save Topics
            </Button>
          </div>
        </div>
      </CollapsibleSection>

      {/* Section 4: Clarifier Guardrails */}
      <CollapsibleSection
        title="Clarifier Guardrails"
        icon={<Shield className="w-4 h-4" />}
        expanded={expandedSections.guardrails}
        onToggle={() => toggleSection("guardrails")}
        color="orange"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-400 mb-3">
            Safety and style rules for generated clarifying questions.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs text-slate-300">Max Clarifier Words</Label>
              <Input
                type="number"
                min={10}
                max={50}
                value={config.clarifierGuardrails.maxClarifierWords}
                onChange={(e) => setConfig(prev => ({
                  ...prev,
                  clarifierGuardrails: { ...prev.clarifierGuardrails, maxClarifierWords: parseInt(e.target.value) || 25 }
                }))}
                className="bg-slate-800 border-slate-600 text-white h-9"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3">
              <Label className="text-xs text-slate-300">Enable Style Guardrail</Label>
              <Switch
                checked={config.clarifierGuardrails.enableStyleGuardrail}
                onCheckedChange={(checked) => setConfig(prev => ({
                  ...prev,
                  clarifierGuardrails: { ...prev.clarifierGuardrails, enableStyleGuardrail: checked }
                }))}
              />
            </div>
            <div className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3">
              <Label className="text-xs text-slate-300">Forbid Narrative Requests</Label>
              <Switch
                checked={config.clarifierGuardrails.forbidNarrativeRequests}
                onCheckedChange={(checked) => setConfig(prev => ({
                  ...prev,
                  clarifierGuardrails: { ...prev.clarifierGuardrails, forbidNarrativeRequests: checked }
                }))}
              />
            </div>
            <div className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3">
              <Label className="text-xs text-slate-300">Forbid "Walk Me Through"</Label>
              <Switch
                checked={config.clarifierGuardrails.forbidWalkMeThrough}
                onCheckedChange={(checked) => setConfig(prev => ({
                  ...prev,
                  clarifierGuardrails: { ...prev.clarifierGuardrails, forbidWalkMeThrough: checked }
                }))}
              />
            </div>
            <div className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3">
              <Label className="text-xs text-slate-300">Forbid Emotional Prompts</Label>
              <Switch
                checked={config.clarifierGuardrails.forbidEmotionalPrompts}
                onCheckedChange={(checked) => setConfig(prev => ({
                  ...prev,
                  clarifierGuardrails: { ...prev.clarifierGuardrails, forbidEmotionalPrompts: checked }
                }))}
              />
            </div>
            <div className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3">
              <Label className="text-xs text-slate-300">Allow Combined Clarifier</Label>
              <Switch
                checked={config.clarifierGuardrails.allowCombinedClarifier}
                onCheckedChange={(checked) => setConfig(prev => ({
                  ...prev,
                  clarifierGuardrails: { ...prev.clarifierGuardrails, allowCombinedClarifier: checked }
                }))}
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              size="sm"
              onClick={() => saveSection("Clarifier Guardrails")}
              disabled={savingSection === "Clarifier Guardrails"}
              className="bg-orange-600 hover:bg-orange-700 text-xs"
            >
              {savingSection === "Clarifier Guardrails" ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ) : (
                <Save className="w-3 h-3 mr-1" />
              )}
              Save Guardrails
            </Button>
          </div>
        </div>
      </CollapsibleSection>

      {/* Section 5: Testing Sandbox */}
      <CollapsibleSection
        title="Testing Sandbox"
        icon={<FlaskConical className="w-4 h-4" />}
        expanded={expandedSections.sandbox}
        onToggle={() => toggleSection("sandbox")}
        color="green"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-400 mb-3">
            Test the full pipeline with sample candidate answers.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2 space-y-2">
              <Label className="text-xs text-slate-300">Test Candidate Answer</Label>
              <Textarea
                value={testAnswer}
                onChange={(e) => setTestAnswer(e.target.value)}
                placeholder="Enter a sample answer like: 'I applied to the sheriff's office back in 2021'"
                className="bg-slate-800 border-slate-600 text-white text-sm min-h-20"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-300">Topic</Label>
              <Select value={testTopic} onValueChange={setTestTopic}>
                <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {config.topicProfiles.map((profile) => (
                    <SelectItem key={profile.topic} value={profile.topic}>
                      {profile.topic}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={runSandboxTest}
                disabled={isRunningTest || !testAnswer.trim()}
                className="w-full bg-green-600 hover:bg-green-700 mt-2"
              >
                {isRunningTest ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <FlaskConical className="w-4 h-4 mr-2" />
                )}
                Run Test
              </Button>
            </div>
          </div>

          {testResult && (
            <div className="mt-4 space-y-3">
              {testResult.error ? (
                <div className="bg-red-950/30 border border-red-800 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-red-400 mb-2">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">Error</span>
                  </div>
                  <p className="text-xs text-red-300">{testResult.error}</p>
                </div>
              ) : (
                <>
                  {/* Extraction Result */}
                  <div className="bg-blue-950/30 border border-blue-800 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-blue-400 mb-2">
                      <Anchor className="w-4 h-4" />
                      <span className="text-sm font-medium">Fact Extraction</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="text-slate-400 mb-1">Collected Anchors:</p>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(testResult.extraction?.collectedAnchors || {}).map(([key, value]) => (
                            <Badge key={key} className="bg-green-500/20 text-green-300 border-green-500/30 text-xs">
                              {key}: {value}
                            </Badge>
                          ))}
                          {Object.keys(testResult.extraction?.collectedAnchors || {}).length === 0 && (
                            <span className="text-slate-500">None</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-slate-400 mb-1">Missing Anchors:</p>
                        <div className="flex flex-wrap gap-1">
                          {(testResult.extraction?.stillMissingAnchors || []).map((anchor) => (
                            <Badge key={anchor} className="bg-orange-500/20 text-orange-300 border-orange-500/30 text-xs">
                              {anchor}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Discretion Decision */}
                  <div className="bg-cyan-950/30 border border-cyan-800 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-cyan-400 mb-2">
                      <Sliders className="w-4 h-4" />
                      <span className="text-sm font-medium">Discretion Decision</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div>
                        <p className="text-slate-400 mb-1">Action:</p>
                        <Badge className={cn(
                          "text-xs",
                          testResult.discretion?.action === "stop" 
                            ? "bg-green-500/20 text-green-300 border-green-500/30"
                            : "bg-blue-500/20 text-blue-300 border-blue-500/30"
                        )}>
                          {testResult.discretion?.action || "unknown"}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-slate-400 mb-1">Tone:</p>
                        <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-xs">
                          {testResult.discretion?.tone || "neutral"}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-slate-400 mb-1">Reason:</p>
                        <span className="text-slate-300">{testResult.discretion?.reason || "—"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Clarifier Question */}
                  {testResult.clarifier && (
                    <div className="bg-purple-950/30 border border-purple-800 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-purple-400 mb-2">
                        <MessageSquare className="w-4 h-4" />
                        <span className="text-sm font-medium">Generated Clarifier</span>
                      </div>
                      <p className="text-white text-sm italic">
                        "{testResult.clarifier?.question || "No question generated"}"
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </CollapsibleSection>
    </div>
  );
}

function CollapsibleSection({ title, icon, expanded, onToggle, children, color = "blue" }) {
  const colorClasses = {
    blue: "border-blue-800/50 from-blue-950/30",
    cyan: "border-cyan-800/50 from-cyan-950/30",
    purple: "border-purple-800/50 from-purple-950/30",
    orange: "border-orange-800/50 from-orange-950/30",
    green: "border-green-800/50 from-green-950/30"
  };

  return (
    <Card className={cn(
      "bg-gradient-to-br to-slate-900/70 border",
      colorClasses[color]
    )}>
      <CardHeader 
        className="p-4 cursor-pointer select-none" 
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">{icon}</span>
            <CardTitle className="text-sm font-semibold text-white">{title}</CardTitle>
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="px-4 pb-4 pt-0">
          {children}
        </CardContent>
      )}
    </Card>
  );
}