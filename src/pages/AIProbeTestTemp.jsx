import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AIProbeTestTemp() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [promptInput, setPromptInput] = useState("");
  const [resultBox, setResultBox] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const adminAuth = sessionStorage.getItem("clearquest_admin_auth");
      if (adminAuth) {
        const auth = JSON.parse(adminAuth);
        setUser({
          username: auth.username,
          role: "SUPER_ADMIN"
        });
        return;
      }

      const currentUser = await base44.auth.me();
      if (currentUser.role !== 'SUPER_ADMIN') {
        navigate(createPageUrl("Home"));
        return;
      }
      setUser(currentUser);
    } catch (err) {
      navigate(createPageUrl("Home"));
    }
  };

  const handleRunBackendAI = async () => {
    if (!promptInput.trim()) {
      toast.error("Please enter a prompt");
      return;
    }

    setIsLoading(true);
    setResultBox("");

    try {
      const response = await base44.functions.invoke('probe_test_backend', {
        prompt: promptInput
      });

      setResultBox(response.data.result || "No result returned");
      toast.success("AI probe completed");
    } catch (err) {
      console.error("Error running AI probe:", err);
      setResultBox(`Error: ${err.message || "Failed to run AI probe"}`);
      toast.error("Failed to run AI probe");
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
          <CardHeader>
            <CardTitle className="text-white text-2xl">AI Probe Test (Temp)</CardTitle>
            <p className="text-slate-400 text-sm">Super Admin only - Backend AI testing</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-white text-sm font-medium mb-2 block">
                Prompt Input
              </label>
              <Textarea
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                placeholder="Enter your prompt here..."
                className="bg-slate-900/50 border-slate-600 text-white min-h-[120px]"
              />
            </div>

            <Button
              onClick={handleRunBackendAI}
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Running Backend AI...
                </>
              ) : (
                "Run Backend AI"
              )}
            </Button>

            <div>
              <label className="text-white text-sm font-medium mb-2 block">
                Result Box
              </label>
              <Textarea
                value={resultBox}
                readOnly
                placeholder="Results will appear here..."
                className="bg-slate-900/50 border-slate-600 text-white min-h-[200px] font-mono text-xs"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}