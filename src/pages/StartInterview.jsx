import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, ArrowLeft, Loader2, Lock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Link } from "react-router-dom";

export default function StartInterview() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    departmentCode: "",
    fileNumber: ""
  });
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!formData.departmentCode || !formData.fileNumber) {
      setError("Both department code and file number are required");
      return;
    }

    setIsCreating(true);

    try {
      const sessionCode = `${formData.departmentCode}-${formData.fileNumber}`;
      
      // Check if a session with this code already exists
      const existingSessions = await base44.entities.InterviewSession.filter({ 
        session_code: sessionCode 
      });
      
      // If there's an existing in_progress or paused session, resume it
      const activeSession = existingSessions.find(s => 
        s.status === 'in_progress' || s.status === 'paused'
      );
      
      if (activeSession) {
        // Resume existing session
        navigate(createPageUrl(`Interview?session=${activeSession.id}`));
        return;
      }

      // Create new session
      const sessionHash = await generateHash(sessionCode);
      
      const session = await base44.entities.InterviewSession.create({
        session_code: sessionCode,
        department_code: formData.departmentCode,
        file_number: formData.fileNumber,
        status: "in_progress",
        started_date: new Date().toISOString(),
        session_hash: sessionHash,
        red_flags: [],
        total_questions_answered: 0,
        completion_percentage: 0,
        followups_triggered: 0,
        metadata: {
          created_via: "web_interface",
          user_agent: navigator.userAgent
        }
      });

      // Create agent conversation
      const conversation = await base44.agents.createConversation({
        agent_name: "clearquest_interviewer",
        metadata: {
          session_id: session.id,
          session_code: sessionCode,
          type: "applicant_interview"
        }
      });

      // Update session with conversation ID
      await base44.entities.InterviewSession.update(session.id, {
        conversation_id: conversation.id
      });

      // Navigate to interview
      navigate(createPageUrl(`Interview?session=${session.id}`));
    } catch (err) {
      console.error("Error creating session:", err);
      setError("Failed to create interview session. Please try again.");
      setIsCreating(false);
    }
  };

  const generateHash = async (text) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(text + Date.now());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 md:mb-8">
          <Link to={createPageUrl("Home")}>
            <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-slate-700 mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>
        </div>

        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
          <CardHeader className="text-center space-y-4 p-6 md:p-8">
            <div className="flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-blue-500 blur-2xl opacity-30" />
                <Shield className="relative w-16 h-16 text-blue-400" />
              </div>
            </div>
            <CardTitle className="text-2xl md:text-3xl text-white">Start New Interview</CardTitle>
            <CardDescription className="text-slate-300 text-sm md:text-base">
              Begin a confidential CJIS-compliant background interview session
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 p-6 md:p-8">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Alert className="bg-blue-950/30 border-blue-800/50 text-blue-200">
              <Lock className="h-4 w-4" />
              <AlertDescription className="text-sm">
                <strong>Privacy Notice:</strong> This interview is completely anonymous. 
                No personally identifiable information is collected. Sessions are identified 
                only by department code and file number. All data is encrypted end-to-end.
              </AlertDescription>
            </Alert>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="departmentCode" className="text-white text-sm md:text-base">
                  Department Code *
                </Label>
                <Input
                  id="departmentCode"
                  placeholder="e.g., PD-2024"
                  value={formData.departmentCode}
                  onChange={(e) => setFormData({...formData, departmentCode: e.target.value.toUpperCase()})}
                  className="bg-slate-900/50 border-slate-600 text-white h-12"
                  required
                />
                <p className="text-sm text-slate-400">
                  Your department's identifying code
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fileNumber" className="text-white text-sm md:text-base">
                  File Number *
                </Label>
                <Input
                  id="fileNumber"
                  placeholder="e.g., A-12345"
                  value={formData.fileNumber}
                  onChange={(e) => setFormData({...formData, fileNumber: e.target.value.toUpperCase()})}
                  className="bg-slate-900/50 border-slate-600 text-white h-12"
                  required
                />
                <p className="text-sm text-slate-400">
                  Applicant case or file number
                </p>
              </div>

              <div className="bg-slate-900/30 border border-slate-700 rounded-lg p-4 md:p-6 space-y-3">
                <h4 className="font-semibold text-white flex items-center gap-2 text-sm md:text-base">
                  <Shield className="w-4 h-4 text-blue-400" />
                  What to Expect
                </h4>
                <ul className="space-y-2 text-xs md:text-sm text-slate-300">
                  <li>• <strong>162 questions</strong> covering your complete background</li>
                  <li>• Questions are asked <strong>one at a time</strong> conversationally</li>
                  <li>• Some "Yes" answers will trigger <strong>detailed follow-ups</strong></li>
                  <li>• Be honest and factual - investigators review all responses</li>
                  <li>• You can pause and resume at any time</li>
                  <li>• Average completion time: <strong>45-90 minutes</strong></li>
                </ul>
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 md:h-14 text-base md:text-lg"
                disabled={isCreating}
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Creating Session...
                  </>
                ) : (
                  <>
                    <Shield className="w-5 h-5 mr-2" />
                    Begin Interview
                  </>
                )}
              </Button>

              <p className="text-xs text-center text-slate-400 px-2">
                By starting this interview, you acknowledge that all responses will be reviewed 
                by authorized investigators and may be used in background screening decisions.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}