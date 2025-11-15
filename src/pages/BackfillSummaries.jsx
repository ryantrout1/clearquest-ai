import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, ArrowLeft, Loader2, CheckCircle, AlertTriangle, FileText, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

const US_CITIZENSHIP_QUESTION_ID = 'Q161';
const BATCH_SIZE = 50;

export default function BackfillSummaries() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({
    total: 0,
    processed: 0,
    generated: 0,
    skipped: 0,
    citizenship_skipped: 0,
    errors: 0
  });
  const [logs, setLogs] = useState([]);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const adminAuth = sessionStorage.getItem("clearquest_admin_auth");
      if (adminAuth) {
        const auth = JSON.parse(adminAuth);
        const mockUser = {
          email: `${auth.username.toLowerCase()}@clearquest.ai`,
          first_name: auth.username,
          role: "SUPER_ADMIN"
        };
        setUser(mockUser);
        return;
      }

      const currentUser = await base44.auth.me();
      if (currentUser.role !== 'SUPER_ADMIN') {
        navigate(createPageUrl("HomeHub"));
        return;
      }
      setUser(currentUser);
    } catch (err) {
      navigate(createPageUrl("AdminLogin"));
    }
  };

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, message, type }]);
  };

  const generateSummaryForResponse = async (response, followups) => {
    try {
      const followupDetails = followups
        .filter(f => f.response_id === response.id)
        .map(f => ({
          substance_name: f.substance_name,
          ...f.additional_details
        }));

      const probingData = response.investigator_probing || [];

      const prompt = `You are generating a single-line investigator summary for a background interview question.

Question: ${response.question_text}
Answer: ${response.answer}

${followupDetails.length > 0 ? `Deterministic Follow-Up Details:\n${JSON.stringify(followupDetails, null, 2)}\n` : ''}
${probingData.length > 0 ? `AI Probing Exchanges:\n${probingData.map(p => `Q: ${p.probing_question}\nA: ${p.candidate_response}`).join('\n\n')}\n` : ''}

Generate exactly ONE sentence (max 30 words) that summarizes what happened, when, where, and the outcome.
Use neutral, factual, investigator-style tone.
Do not include "the candidate said" or similar meta language.
Focus on: what happened, when, where, outcome/status.

Examples:
- "2018 speeding citation in Italy; applicant received but did not address the ticket and reports no further consequences."
- "Applied to Yuma PD in June 2023; application declined, official reason was failure to pass the polygraph examination."
- "Used marijuana recreationally from 2019-2021; last use was spring 2021, obtained from friends, reports no legal issues."

Return ONLY the summary sentence, nothing else.`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: false
      });

      return result.trim();
    } catch (err) {
      console.error('Error generating summary:', err);
      throw err;
    }
  };

  const runBackfill = async () => {
    setIsRunning(true);
    setIsComplete(false);
    setProgress({ total: 0, processed: 0, generated: 0, skipped: 0, citizenship_skipped: 0, errors: 0 });
    setLogs([]);

    addLog('🚀 Starting investigator summary backfill...', 'info');

    try {
      // Fetch all Yes responses
      addLog('📊 Fetching all responses...', 'info');
      const allResponses = await base44.entities.Response.filter({ answer: 'Yes' });
      
      // Filter for responses needing summaries
      const responsesNeedingSummary = allResponses.filter(r => {
        if (r.question_id === US_CITIZENSHIP_QUESTION_ID) return false;
        if (r.investigator_summary && r.investigator_summary.trim() !== '') return false;
        return true;
      });

      const citizenshipSkipped = allResponses.filter(r => r.question_id === US_CITIZENSHIP_QUESTION_ID).length;
      const alreadyHaveSummaries = allResponses.filter(r => 
        r.investigator_summary && r.investigator_summary.trim() !== '' && r.question_id !== US_CITIZENSHIP_QUESTION_ID
      ).length;

      addLog(`✅ Found ${allResponses.length} total Yes responses`, 'success');
      addLog(`   - ${citizenshipSkipped} citizenship responses (skipped)`, 'info');
      addLog(`   - ${alreadyHaveSummaries} already have summaries (skipped)`, 'info');
      addLog(`   - ${responsesNeedingSummary.length} need summaries`, 'info');

      setProgress(prev => ({
        ...prev,
        total: responsesNeedingSummary.length,
        citizenship_skipped: citizenshipSkipped,
        skipped: alreadyHaveSummaries
      }));

      if (responsesNeedingSummary.length === 0) {
        addLog('✅ No responses need backfill. All done!', 'success');
        setIsComplete(true);
        setIsRunning(false);
        return;
      }

      // Fetch all followups once
      addLog('📥 Loading follow-up data...', 'info');
      const allFollowups = await base44.entities.FollowUpResponse.list();

      // Process in batches
      const totalBatches = Math.ceil(responsesNeedingSummary.length / BATCH_SIZE);
      addLog(`⚙️ Processing ${responsesNeedingSummary.length} responses in ${totalBatches} batches...`, 'info');

      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const batchStart = batchIndex * BATCH_SIZE;
        const batchEnd = Math.min(batchStart + BATCH_SIZE, responsesNeedingSummary.length);
        const batch = responsesNeedingSummary.slice(batchStart, batchEnd);

        addLog(`📦 Processing batch ${batchIndex + 1}/${totalBatches} (${batch.length} responses)...`, 'info');

        for (const response of batch) {
          try {
            const summary = await generateSummaryForResponse(response, allFollowups);
            
            await base44.entities.Response.update(response.id, {
              investigator_summary: summary
            });

            setProgress(prev => ({
              ...prev,
              processed: prev.processed + 1,
              generated: prev.generated + 1
            }));

            if (setProgress.generated % 10 === 0) {
              addLog(`✅ Generated ${progress.generated} summaries...`, 'success');
            }

          } catch (err) {
            console.error(`Error processing response ${response.id}:`, err);
            setProgress(prev => ({
              ...prev,
              processed: prev.processed + 1,
              errors: prev.errors + 1
            }));
            addLog(`⚠️ Error on ${response.question_id}: ${err.message}`, 'error');
          }

          // Small delay between AI calls to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        addLog(`✅ Batch ${batchIndex + 1} complete`, 'success');
      }

      addLog('🎉 Backfill complete!', 'success');
      addLog(`📊 Final Stats: ${progress.generated} generated, ${progress.errors} errors, ${progress.skipped + progress.citizenship_skipped} skipped`, 'info');
      
      setIsComplete(true);
      toast.success('Investigator summaries backfill completed!');

    } catch (err) {
      console.error('Backfill error:', err);
      addLog(`❌ Critical error: ${err.message}`, 'error');
      toast.error('Backfill failed');
    } finally {
      setIsRunning(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  const progressPercent = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <Link to={createPageUrl("SystemAdminDashboard")}>
          <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-slate-700 mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to System Admin
          </Button>
        </Link>

        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 mb-6">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Shield className="w-6 h-6 text-blue-400" />
              <div>
                <CardTitle className="text-2xl text-white">Backfill Investigator Summaries</CardTitle>
                <p className="text-sm text-slate-400 mt-1">
                  One-time generation of summaries for historical Yes responses
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert className="bg-blue-950/30 border-blue-800/50 text-blue-200">
              <FileText className="h-4 w-4" />
              <AlertDescription className="text-sm leading-relaxed">
                <strong>What this does:</strong> Generates a one-line investigator summary for every historical "Yes" response 
                that doesn't already have one. Skips U.S. citizenship questions and any responses that already have summaries.
                This is safe to run multiple times (idempotent).
              </AlertDescription>
            </Alert>

            {!isRunning && !isComplete && (
              <Button
                onClick={runBackfill}
                className="w-full bg-blue-600 hover:bg-blue-700 h-12 text-base"
              >
                <Zap className="w-5 h-5 mr-2" />
                Start Backfill Process
              </Button>
            )}

            {isRunning && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-slate-300">
                    <span>Progress</span>
                    <span>{progress.processed} / {progress.total}</span>
                  </div>
                  <Progress value={progressPercent} className="h-2" />
                  <p className="text-xs text-slate-400 text-center">{progressPercent}% complete</p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatBox label="Generated" value={progress.generated} color="green" />
                  <StatBox label="Errors" value={progress.errors} color="red" />
                  <StatBox label="Already Had" value={progress.skipped} color="blue" />
                  <StatBox label="Citizenship" value={progress.citizenship_skipped} color="slate" />
                </div>
              </div>
            )}

            {isComplete && (
              <Alert className="bg-green-950/30 border-green-800/50 text-green-200">
                <CheckCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  <strong>Backfill Complete!</strong> Generated {progress.generated} summaries. 
                  Skipped {progress.skipped + progress.citizenship_skipped} responses (already had summaries or citizenship question).
                  {progress.errors > 0 && ` ${progress.errors} errors encountered.`}
                </AlertDescription>
              </Alert>
            )}

            {/* Logs */}
            {logs.length > 0 && (
              <Card className="bg-slate-900/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-base text-white">Process Log</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 max-h-96 overflow-y-auto pr-2 font-mono text-xs" style={{ scrollbarWidth: 'thin', scrollbarColor: '#475569 #1e293b' }}>
                    {logs.map((log, idx) => (
                      <div key={idx} className={cn(
                        "flex items-start gap-2",
                        log.type === 'error' && "text-red-400",
                        log.type === 'success' && "text-green-400",
                        log.type === 'info' && "text-slate-300"
                      )}>
                        <span className="text-slate-500 flex-shrink-0">[{log.timestamp}]</span>
                        <span className="break-words">{log.message}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatBox({ label, value, color }) {
  const colorClasses = {
    green: "text-green-400",
    red: "text-red-400",
    blue: "text-blue-400",
    slate: "text-slate-400"
  };

  return (
    <div className="bg-slate-900/30 border border-slate-700 rounded-lg p-3 text-center">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className={cn("text-2xl font-bold", colorClasses[color])}>{value}</p>
    </div>
  );
}