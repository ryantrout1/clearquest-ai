import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Rocket, Clock, AlertTriangle, CheckCircle, Shield, Zap, Database, Loader2, XCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export default function TestDataGenerator() {
  const queryClient = useQueryClient();
  const [isEnqueuing, setIsEnqueuing] = useState(false);
  
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

  // Fetch latest job for the selected department
  const { data: latestJob, refetch: refetchJob, isLoading: isLoadingJob } = useQuery({
    queryKey: ['latest-test-job', config.deptCode],
    queryFn: async () => {
      if (!config.deptCode) return null;
      const jobs = await base44.entities.TestDataJob.filter(
        { dept_code: config.deptCode },
        '-created_date',
        1
      );
      return jobs.length > 0 ? jobs[0] : null;
    },
    enabled: !!config.deptCode,
    refetchInterval: (data) => {
      // Poll every 10s if job is queued or running
      if (data?.status === 'queued' || data?.status === 'running') {
        return 10000;
      }
      return false;
    }
  });

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

  const handleEnqueueJob = async () => {
    if (!isValid) {
      toast.error("Risk profile counts must equal total candidates");
      return;
    }

    setIsEnqueuing(true);
    console.log('[TEST_DATA] Enqueueing job with config:', config);
    
    try {
      const response = await base44.functions.invoke('enqueueTestDataJob', config);
      console.log('[TEST_DATA] Enqueue response:', response);
      const result = response.data;
      
      if (result.error) {
        console.error('[TEST_DATA] Enqueue error:', result.error);
        toast.error(`Failed to queue job: ${result.error}`);
        return;
      }

      // Find department name for toast
      const dept = departments.find(d => d.department_code === config.deptCode);
      const deptName = dept?.department_name || config.deptCode;

      toast.success(
        `Test data generation queued for ${deptName}. You can navigate away; sessions will appear in the Interview Dashboard when ready.`,
        { duration: 6000 }
      );
      
      // Refresh the job status
      refetchJob();
      
    } catch (error) {
      console.error('[TEST_DATA] Exception:', error);
      toast.error(`Failed to queue job: ${error.message || 'Network error'}`);
    } finally {
      setIsEnqueuing(false);
    }
  };

  // Get status badge color and icon
  const getJobStatusDisplay = (status) => {
    switch (status) {
      case 'queued':
        return { color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30', icon: Clock, label: 'Queued' };
      case 'running':
        return { color: 'bg-blue-500/20 text-blue-300 border-blue-500/30', icon: Loader2, label: 'Running…' };
      case 'completed':
        return { color: 'bg-green-500/20 text-green-300 border-green-500/30', icon: CheckCircle, label: 'Completed' };
      case 'failed':
        return { color: 'bg-red-500/20 text-red-300 border-red-500/30', icon: XCircle, label: 'Failed' };
      default:
        return { color: 'bg-slate-500/20 text-slate-300 border-slate-500/30', icon: Clock, label: status };
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Column: Main Settings */}
      <div className="lg:col-span-2 space-y-4">
        {/* Department & Count Row */}
        <Card className="bg-slate-900/70 border-slate-800">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Department Selector */}
              <div className="space-y-2">
                <Label className="text-slate-300 text-sm font-medium">Department</Label>
                <Select
                  value={config.deptCode}
                  onValueChange={(value) => setConfig(prev => ({ ...prev, deptCode: value }))}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-600 text-white h-10">
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
                <Label className="text-slate-300 text-sm font-medium">Number of candidates</Label>
                <div className="flex items-center gap-3">
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
                    className="w-16 bg-slate-800 border-slate-600 text-white text-center h-10"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Risk Profile Mix */}
        <Card className="bg-slate-900/70 border-slate-800">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium text-slate-300">Risk Profile Mix</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-green-950/30 border border-green-800/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
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
                  className="bg-slate-800/80 border-green-700/50 text-white text-center text-lg font-semibold h-12"
                />
                <p className="text-xs text-green-400/70 text-center">Low-risk</p>
              </div>
              
              <div className="bg-yellow-950/30 border border-yellow-800/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
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
                  className="bg-slate-800/80 border-yellow-700/50 text-white text-center text-lg font-semibold h-12"
                />
                <p className="text-xs text-yellow-400/70 text-center">Mid-risk</p>
              </div>
              
              <div className="bg-red-950/30 border border-red-800/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
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
                  className="bg-slate-800/80 border-red-700/50 text-white text-center text-lg font-semibold h-12"
                />
                <p className="text-xs text-red-400/70 text-center">High-risk</p>
              </div>
            </div>
            
            {/* Validation message */}
            <div className={cn(
              "flex items-center gap-2 text-xs px-3 py-2 rounded-lg mt-3",
              isValid 
                ? "bg-green-500/10 text-green-400 border border-green-500/20" 
                : "bg-red-500/10 text-red-400 border border-red-500/20"
            )}>
              {isValid ? (
                <>
                  <CheckCircle className="w-3.5 h-3.5" />
                  Total: {riskCountTotal} candidates
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Sum ({riskCountTotal}) ≠ Total ({config.totalCandidates})
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Options Row */}
        <Card className="bg-slate-900/70 border-slate-800">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Randomization Mode */}
              <div className="flex items-center justify-between gap-3 bg-slate-800/50 rounded-lg px-3 py-2.5">
                <div>
                  <Label className="text-slate-300 text-xs font-medium">Randomize</Label>
                  <p className="text-[10px] text-slate-500 mt-0.5">Vary answers</p>
                </div>
                <Switch
                  checked={config.randomizeWithinPersona}
                  onCheckedChange={(checked) => setConfig(prev => ({ ...prev, randomizeWithinPersona: checked }))}
                  className="data-[state=checked]:bg-purple-600"
                />
              </div>

              {/* AI Probing */}
              <div className="flex items-center justify-between gap-3 bg-slate-800/50 rounded-lg px-3 py-2.5">
                <div>
                  <Label className="text-slate-300 text-xs font-medium">AI Probing</Label>
                  <p className="text-[10px] text-slate-500 mt-0.5">Add follow-ups</p>
                </div>
                <Switch
                  checked={config.includeAiProbing}
                  onCheckedChange={(checked) => setConfig(prev => ({ ...prev, includeAiProbing: checked }))}
                  className="data-[state=checked]:bg-purple-600"
                />
              </div>

              {/* Multi-loop Backgrounds */}
              <div className="flex items-center justify-between gap-3 bg-slate-800/50 rounded-lg px-3 py-2.5">
                <div>
                  <Label className="text-slate-300 text-xs font-medium">Multi-loop</Label>
                  <p className="text-[10px] text-slate-500 mt-0.5">Complex histories</p>
                </div>
                <Switch
                  checked={config.enableMultiLoopBackgrounds}
                  onCheckedChange={(checked) => setConfig(prev => ({ ...prev, enableMultiLoopBackgrounds: checked }))}
                  className="data-[state=checked]:bg-purple-600"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Column: Summary & Actions */}
      <div className="space-y-4">
        {/* Generate Card */}
        <Card className="bg-gradient-to-br from-purple-900/40 to-slate-900/60 border-purple-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-purple-300 flex items-center gap-2">
              <Database className="w-4 h-4" />
              Generate Test Data
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Summary */}
            <div className="bg-slate-800/60 rounded-lg p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Department</span>
                <span className="text-white font-mono text-xs">{config.deptCode}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Candidates</span>
                <span className="text-white font-semibold">{config.totalCandidates}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Mix</span>
                <div className="flex gap-1.5">
                  <span className="text-green-400">{config.lowRiskCount}G</span>
                  <span className="text-slate-500">/</span>
                  <span className="text-yellow-400">{config.midRiskCount}M</span>
                  <span className="text-slate-500">/</span>
                  <span className="text-red-400">{config.highRiskCount}C</span>
                </div>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Options</span>
                <div className="flex gap-1">
                  {config.randomizeWithinPersona && <Badge className="bg-purple-500/20 text-purple-300 text-[10px] px-1.5 py-0">Rand</Badge>}
                  {config.includeAiProbing && <Badge className="bg-blue-500/20 text-blue-300 text-[10px] px-1.5 py-0">AI</Badge>}
                  {config.enableMultiLoopBackgrounds && <Badge className="bg-orange-500/20 text-orange-300 text-[10px] px-1.5 py-0">Multi</Badge>}
                  {!config.randomizeWithinPersona && !config.includeAiProbing && !config.enableMultiLoopBackgrounds && (
                    <span className="text-slate-500 text-xs">None</span>
                  )}
                </div>
              </div>
            </div>

            {/* Generate Button */}
            <Button
              onClick={handleEnqueueJob}
              disabled={isEnqueuing || !isValid}
              size="lg"
              className={cn(
                "w-full text-sm font-medium h-12",
                isEnqueuing 
                  ? "bg-purple-800" 
                  : "bg-purple-600 hover:bg-purple-700"
              )}
            >
              {isEnqueuing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Queueing...
                </>
              ) : (
                <>
                  <Rocket className="w-4 h-4 mr-2" />
                  Generate Test Data
                </>
              )}
            </Button>

            <p className="text-[10px] text-slate-500 text-center">
              Job runs in background — you can navigate away
            </p>

            {/* Last Job Status */}
            {latestJob && (
              <div className="bg-slate-800/40 rounded-lg p-3 space-y-2 border border-slate-700/50">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-medium">Last Job</span>
                  <button
                    onClick={() => refetchJob()}
                    className="text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    <RefreshCw className={cn("w-3 h-3", isLoadingJob && "animate-spin")} />
                  </button>
                </div>
                
                {(() => {
                  const statusDisplay = getJobStatusDisplay(latestJob.status);
                  const StatusIcon = statusDisplay.icon;
                  return (
                    <div className="flex items-center gap-2">
                      <Badge className={cn("text-[10px] px-2 py-0.5", statusDisplay.color)}>
                        <StatusIcon className={cn("w-3 h-3 mr-1", latestJob.status === 'running' && "animate-spin")} />
                        {statusDisplay.label}
                      </Badge>
                      {latestJob.config && (
                        <span className="text-[10px] text-slate-500">
                          {latestJob.config.totalCandidates} candidates
                        </span>
                      )}
                    </div>
                  );
                })()}

                <div className="text-[10px] text-slate-500 space-y-0.5">
                  <div>
                    Queued: {latestJob.created_date ? format(new Date(latestJob.created_date), "MMM d, h:mm a") : 'N/A'}
                  </div>
                  {latestJob.started_at && (
                    <div>
                      Started: {format(new Date(latestJob.started_at), "MMM d, h:mm a")}
                    </div>
                  )}
                  {latestJob.finished_at && (
                    <div>
                      Finished: {format(new Date(latestJob.finished_at), "MMM d, h:mm a")}
                    </div>
                  )}
                  {latestJob.status === 'completed' && latestJob.result_summary && (
                    <div className="text-green-400">
                      Created {latestJob.result_summary.created || 0}, Updated {latestJob.result_summary.updated || 0}
                    </div>
                  )}
                  {latestJob.status === 'failed' && latestJob.error_message && (
                    <div className="text-red-400 truncate" title={latestJob.error_message}>
                      Error: {latestJob.error_message}
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Presets */}
        <Card className="bg-slate-900/70 border-slate-800">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wide">Quick Presets</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 grid grid-cols-2 gap-2">
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
            className="text-xs h-9 bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700 hover:text-white"
          >
            Default (5)
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
            className="text-xs h-9 bg-green-900/50 border-green-600 text-green-300 hover:bg-green-800/60 hover:text-green-200"
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
            className="text-xs h-9 bg-red-900/50 border-red-600 text-red-300 hover:bg-red-800/60 hover:text-red-200"
          >
            All Hard (10)
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
            className="text-xs h-9 bg-purple-900/50 border-purple-600 text-purple-300 hover:bg-purple-800/60 hover:text-purple-200"
          >
            Full Demo (20)
          </Button>
        </CardContent>
        </Card>
      </div>
    </div>
  );
}