import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Rocket, Clock, AlertTriangle, CheckCircle, Users, Shield, Zap, Database } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function TestDataGenerator() {
  const queryClient = useQueryClient();
  const [isSeeding, setIsSeeding] = useState(false);
  
  // Configuration state
  const [config, setConfig] = useState({
    deptCode: "MPD-12345",
    totalCandidates: 5,
    lowRiskCount: 2,
    midRiskCount: 1,
    highRiskCount: 2,
    randomizeWithinPersona: false,
    includeAiProbing: false,
    enableMultiLoopBackgrounds: true
  });

  // Fetch departments for dropdown
  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => base44.entities.Department.list('-created_date')
  });

  // Set default department on load
  useEffect(() => {
    if (departments.length > 0 && !config.deptCode) {
      const mpd = departments.find(d => d.department_code === "MPD-12345");
      setConfig(prev => ({
        ...prev,
        deptCode: mpd?.department_code || departments[0].department_code
      }));
    }
  }, [departments]);

  // Validate risk counts
  const riskCountTotal = config.lowRiskCount + config.midRiskCount + config.highRiskCount;
  const isValid = riskCountTotal === config.totalCandidates;

  // Handle total candidates change - auto-adjust risk counts
  const handleTotalCandidatesChange = (value) => {
    const total = Math.max(1, Math.min(50, parseInt(value) || 1));
    
    // Distribute proportionally: 40% low, 20% mid, 40% high
    let lowCount = Math.round(total * 0.4);
    let midCount = Math.round(total * 0.2);
    let highCount = total - lowCount - midCount;
    
    // Ensure at least 1 in each if total >= 3
    if (total >= 3) {
      lowCount = Math.max(1, lowCount);
      midCount = Math.max(1, midCount);
      highCount = Math.max(1, highCount);
      
      // Adjust if over
      while (lowCount + midCount + highCount > total) {
        if (lowCount > 1) lowCount--;
        else if (highCount > 1) highCount--;
        else midCount--;
      }
      while (lowCount + midCount + highCount < total) {
        highCount++;
      }
    } else if (total === 2) {
      lowCount = 1;
      midCount = 0;
      highCount = 1;
    } else {
      lowCount = 0;
      midCount = 1;
      highCount = 0;
    }

    setConfig(prev => ({
      ...prev,
      totalCandidates: total,
      lowRiskCount: lowCount,
      midRiskCount: midCount,
      highRiskCount: highCount
    }));
  };

  const handleRiskCountChange = (key, value) => {
    const numValue = Math.max(0, parseInt(value) || 0);
    setConfig(prev => ({ ...prev, [key]: numValue }));
  };

  const handleSeed = async () => {
    if (!isValid) {
      toast.error("Risk profile counts must equal total candidates");
      return;
    }

    setIsSeeding(true);
    console.log('[TEST_DATA] Starting seed with config:', config);
    
    try {
      const response = await base44.functions.invoke('seedMockInterviews', config);
      console.log('[TEST_DATA] Response:', response);
      const result = response.data;
      
      if (result.error) {
        console.error('[TEST_DATA] Error:', result.error);
        toast.error(`Seed failed: ${result.error}`);
        return;
      }

      const msg = `Generated ${result.created || 0} new, ${result.updated || 0} updated candidates for ${config.deptCode}`;
      console.log('[TEST_DATA] Success:', msg);
      toast.success(msg);
      
      // Refresh queries
      queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['departments'] });
    } catch (error) {
      console.error('[TEST_DATA] Exception:', error);
      toast.error(`Failed to generate: ${error.message || 'Network error'}`);
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Main Configuration Card */}
      <Card className="bg-gradient-to-br from-purple-900/30 to-slate-900/50 border-purple-700/50">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-purple-300 flex items-center gap-2">
            <Database className="w-5 h-5" />
            Test Data Generator
          </CardTitle>
          <CardDescription className="text-slate-400">
            Configure and generate mock interview sessions for testing and demos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          
          {/* Department Selector */}
          <div className="space-y-2">
            <Label className="text-slate-300 text-sm font-medium">Department</Label>
            <Select
              value={config.deptCode}
              onValueChange={(value) => setConfig(prev => ({ ...prev, deptCode: value }))}
            >
              <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-600">
                {departments.map(dept => (
                  <SelectItem 
                    key={dept.id} 
                    value={dept.department_code}
                    className="text-white hover:bg-slate-700"
                  >
                    {dept.department_name} ({dept.department_code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Number of Candidates */}
          <div className="space-y-2">
            <Label className="text-slate-300 text-sm font-medium">Number of candidates to generate</Label>
            <div className="flex items-center gap-4">
              <Slider
                value={[config.totalCandidates]}
                onValueChange={([value]) => handleTotalCandidatesChange(value)}
                min={1}
                max={50}
                step={1}
                className="flex-1"
              />
              <Input
                type="number"
                value={config.totalCandidates}
                onChange={(e) => handleTotalCandidatesChange(e.target.value)}
                min={1}
                max={50}
                className="w-20 bg-slate-800 border-slate-600 text-white text-center"
              />
            </div>
          </div>

          {/* Risk Profile Mix */}
          <div className="space-y-3">
            <Label className="text-slate-300 text-sm font-medium">Risk profile mix</Label>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-500/20 text-green-300 border-green-500/30 text-xs">
                    <Shield className="w-3 h-3 mr-1" />
                    Great
                  </Badge>
                </div>
                <Input
                  type="number"
                  value={config.lowRiskCount}
                  onChange={(e) => handleRiskCountChange('lowRiskCount', e.target.value)}
                  min={0}
                  max={config.totalCandidates}
                  className="bg-slate-800 border-slate-600 text-white text-center"
                />
                <p className="text-xs text-slate-500">Low-risk profiles</p>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30 text-xs">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Moderate
                  </Badge>
                </div>
                <Input
                  type="number"
                  value={config.midRiskCount}
                  onChange={(e) => handleRiskCountChange('midRiskCount', e.target.value)}
                  min={0}
                  max={config.totalCandidates}
                  className="bg-slate-800 border-slate-600 text-white text-center"
                />
                <p className="text-xs text-slate-500">Mid-risk profiles</p>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Badge className="bg-red-500/20 text-red-300 border-red-500/30 text-xs">
                    <Zap className="w-3 h-3 mr-1" />
                    Challenging
                  </Badge>
                </div>
                <Input
                  type="number"
                  value={config.highRiskCount}
                  onChange={(e) => handleRiskCountChange('highRiskCount', e.target.value)}
                  min={0}
                  max={config.totalCandidates}
                  className="bg-slate-800 border-slate-600 text-white text-center"
                />
                <p className="text-xs text-slate-500">High-risk profiles</p>
              </div>
            </div>
            
            {/* Validation message */}
            <div className={cn(
              "flex items-center gap-2 text-xs px-3 py-2 rounded-lg",
              isValid 
                ? "bg-green-500/10 text-green-400 border border-green-500/20" 
                : "bg-red-500/10 text-red-400 border border-red-500/20"
            )}>
              {isValid ? (
                <>
                  <CheckCircle className="w-3.5 h-3.5" />
                  Risk counts equal total candidates ({riskCountTotal})
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Risk counts ({riskCountTotal}) must equal total candidates ({config.totalCandidates})
                </>
              )}
            </div>
          </div>

          {/* Toggle Options */}
          <div className="space-y-4 pt-2 border-t border-slate-700">
            {/* Randomization Mode */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-slate-300 text-sm font-medium">Answer style</Label>
                <p className="text-xs text-slate-500">
                  {config.randomizeWithinPersona 
                    ? "Randomized but persona-consistent answers" 
                    : "Fixed deterministic persona patterns"}
                </p>
              </div>
              <Switch
                checked={config.randomizeWithinPersona}
                onCheckedChange={(checked) => setConfig(prev => ({ ...prev, randomizeWithinPersona: checked }))}
                className="data-[state=checked]:bg-purple-600"
              />
            </div>

            {/* AI Probing */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-slate-300 text-sm font-medium">Include AI probing sequences</Label>
                <p className="text-xs text-slate-500">
                  {config.includeAiProbing 
                    ? "Deterministic + AI probing follow-ups" 
                    : "Deterministic follow-up packs only"}
                </p>
              </div>
              <Switch
                checked={config.includeAiProbing}
                onCheckedChange={(checked) => setConfig(prev => ({ ...prev, includeAiProbing: checked }))}
                className="data-[state=checked]:bg-purple-600"
              />
            </div>

            {/* Multi-loop Backgrounds */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-slate-300 text-sm font-medium">Deep background complexity</Label>
                <p className="text-xs text-slate-500">
                  Include multi-instance histories (jobs, addresses, incidents)
                </p>
              </div>
              <Switch
                checked={config.enableMultiLoopBackgrounds}
                onCheckedChange={(checked) => setConfig(prev => ({ ...prev, enableMultiLoopBackgrounds: checked }))}
                className="data-[state=checked]:bg-purple-600"
              />
            </div>
          </div>

          {/* Generate Button */}
          <Button
            onClick={handleSeed}
            disabled={isSeeding || !isValid}
            size="lg"
            className={cn(
              "w-full text-sm font-medium",
              isSeeding 
                ? "bg-purple-800" 
                : "bg-purple-600 hover:bg-purple-700"
            )}
          >
            {isSeeding ? (
              <>
                <Clock className="w-4 h-4 mr-2 animate-spin" />
                Generating Test Data...
              </>
            ) : (
              <>
                <Rocket className="w-4 h-4 mr-2" />
                Generate Test Data
              </>
            )}
          </Button>

          {/* Config Summary */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
            <p className="text-xs text-slate-400 font-medium mb-2">Configuration Summary</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <span className="text-slate-500">Department:</span>
              <span className="text-slate-300 font-mono">{config.deptCode}</span>
              <span className="text-slate-500">Candidates:</span>
              <span className="text-slate-300">{config.totalCandidates} total</span>
              <span className="text-slate-500">Risk Mix:</span>
              <span className="text-slate-300">
                {config.lowRiskCount}L / {config.midRiskCount}M / {config.highRiskCount}H
              </span>
              <span className="text-slate-500">Style:</span>
              <span className="text-slate-300">{config.randomizeWithinPersona ? "Randomized" : "Deterministic"}</span>
              <span className="text-slate-500">AI Probing:</span>
              <span className="text-slate-300">{config.includeAiProbing ? "Enabled" : "Disabled"}</span>
              <span className="text-slate-500">Multi-loop:</span>
              <span className="text-slate-300">{config.enableMultiLoopBackgrounds ? "Enabled" : "Disabled"}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Presets */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-slate-400">Quick Presets</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfig({
              ...config,
              totalCandidates: 5,
              lowRiskCount: 2,
              midRiskCount: 1,
              highRiskCount: 2,
              randomizeWithinPersona: false,
              includeAiProbing: false
            })}
            className="text-xs border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Default (5 mixed)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfig({
              ...config,
              totalCandidates: 10,
              lowRiskCount: 10,
              midRiskCount: 0,
              highRiskCount: 0,
              randomizeWithinPersona: true
            })}
            className="text-xs border-green-700 text-green-400 hover:bg-green-900/30"
          >
            All Great (10)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfig({
              ...config,
              totalCandidates: 10,
              lowRiskCount: 0,
              midRiskCount: 0,
              highRiskCount: 10,
              randomizeWithinPersona: true,
              includeAiProbing: true
            })}
            className="text-xs border-red-700 text-red-400 hover:bg-red-900/30"
          >
            All Challenging (10)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfig({
              ...config,
              totalCandidates: 20,
              lowRiskCount: 8,
              midRiskCount: 4,
              highRiskCount: 8,
              randomizeWithinPersona: true,
              includeAiProbing: true,
              enableMultiLoopBackgrounds: true
            })}
            className="text-xs border-purple-700 text-purple-400 hover:bg-purple-900/30"
          >
            Full Demo (20)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}