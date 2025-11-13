
import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Shield, CheckCircle, Loader2, ArrowLeft, Copy, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Department code generation utility - SAME as CreateDepartment.js
async function generateDepartmentCode(departmentName, zipCode) {
  if (!departmentName || !zipCode) return "";

  const words = departmentName.trim().split(/\s+/).filter(word => word.length > 0);
  const generateRandomLetter = () => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return letters[Math.floor(Math.random() * letters.length)];
  };

  let prefix = "";
  if (words.length >= 3) {
    prefix = words.slice(0, 3).map(word => word[0].toUpperCase()).join("");
  } else if (words.length === 2) {
    prefix = words[0].substring(0, 2).toUpperCase() + generateRandomLetter();
  } else if (words.length === 1) {
    prefix = words[0][0].toUpperCase() + generateRandomLetter() + generateRandomLetter();
  } else {
    prefix = generateRandomLetter() + generateRandomLetter() + generateRandomLetter();
  }

  const baseCode = `${prefix}-${zipCode}`;

  try {
    const existingDepts = await base44.entities.Department.filter({ department_code: baseCode });
    if (existingDepts.length === 0) return baseCode;

    const firstTwoLetters = prefix.substring(0, 2);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let i = 0; i < alphabet.length; i++) {
      const newCode = `${firstTwoLetters}${alphabet[i]}-${zipCode}`;
      const exists = await base44.entities.Department.filter({ department_code: newCode });
      if (exists.length === 0) return newCode;
    }

    for (let attempt = 0; attempt < 50; attempt++) {
      const randomPrefix = generateRandomLetter() + generateRandomLetter() + generateRandomLetter();
      const newCode = `${randomPrefix}-${zipCode}`;
      const exists = await base44.entities.Department.filter({ department_code: newCode });
      if (exists.length === 0) return newCode;
    }
    
    return `${prefix}-${zipCode}-${Date.now().toString().slice(-4)}`;
  } catch (err) {
    console.error("Error finding unique department code:", err);
    return baseCode;
  }
}

export default function TrialSignup() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdDepartment, setCreatedDepartment] = useState(null);
  const [error, setError] = useState(null);
  
  const [formData, setFormData] = useState({
    department_name: "",
    department_code: "",
    city: "",
    state: "",
    zip_code: "",
    department_phone: "",
    contact_name: "", 
    contact_email: "",
    contact_phone: "",
  });

  // Auto-generate department code when name and zip change
  useEffect(() => {
    const generateCode = async () => {
      if (formData.department_name && formData.zip_code) {
        setIsGeneratingCode(true);
        try {
          const code = await generateDepartmentCode(formData.department_name, formData.zip_code);
          setFormData(prev => ({ ...prev, department_code: code }));
        } catch (err) {
          console.error("Error generating code:", err);
        } finally {
          setIsGeneratingCode(false);
        }
      }
    };

    const timeoutId = setTimeout(generateCode, 500);
    return () => clearTimeout(timeoutId);
  }, [formData.department_name, formData.zip_code]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.department_name || !formData.city || !formData.state || 
        !formData.zip_code || !formData.contact_name || !formData.contact_email || 
        !formData.contact_phone) {
      setError("Please fill in all required fields.");
      return;
    }

    if (!/\S+@\S+\.\S+/.test(formData.contact_email)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (!formData.department_code) {
      setError("Department code is still generating, please wait a moment.");
      return;
    }

    setIsSubmitting(true);

    try {
      const deptId = `DEPT-${Date.now().toString(36).toUpperCase()}`;
      const now = new Date().toISOString();
      const trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + 30);

      const departmentData = {
        department_name: formData.department_name,
        department_code: formData.department_code,
        department_type: "Law Enforcement",
        city: formData.city,
        state: formData.state,
        zip_code: formData.zip_code,
        phone_number: formData.department_phone || null,
        contact_name: formData.contact_name,
        contact_email: formData.contact_email,
        contact_phone: formData.contact_phone,
        department_id: deptId,
        plan_type: "Free Trial",
        plan_level: "Trial",
        active_status: "Active",
        seats_allocated: 5,
        retention_period: 30,
        date_joined: now,
        trial_end_date: trialEndDate.toISOString(),
        trial_status: "active",
        trial_started_at: now,
        trial_ends_at: trialEndDate.toISOString(),
        activity_log: ["Trial account created via self-service signup"],
        use_default_branding: true,
        cjis_compliance: true,
        anonymity_mode: true,
        applicants_processed: 0,
        color_primary: "#1F2937",
        color_accent: "#E6B980"
      };

      console.log("📝 Creating trial department:", departmentData);
      const newDept = await base44.entities.Department.create(departmentData);
      console.log("✅ Trial department created successfully:", newDept);

      setCreatedDepartment(newDept);
      setShowSuccessModal(true);
      setIsSubmitting(false);
      
    } catch (err) {
      console.error("❌ Error creating trial department:", err);
      setError("We couldn't start your trial right now. Please check your connection or try again in a few minutes.");
      setIsSubmitting(false);
    }
  };

  const interviewLink = typeof window !== 'undefined' 
    ? `${window.location.origin}${createPageUrl("StartInterview")}`
    : '';

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  const instructionsText = createdDepartment ? `ClearQuest Applicant Instructions

Department Code: ${createdDepartment.department_code}

Interview Link:
${interviewLink}

What the applicant needs to do:
• Enter the Department Code
• Enter the File Number you provide (e.g., case number or applicant ID)
• Complete all questions truthfully and completely
• The interview can be started, paused, and resumed on any device
• No personal identifying information is collected` : '';

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
            <CardTitle className="text-2xl md:text-3xl text-white">Start Your Free Trial</CardTitle>
            <CardDescription className="text-slate-300 text-sm md:text-base">
              30 days of full access • No credit card required • CJIS aligned
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 p-6 md:p-8">
            {error && (
              <div className="bg-red-950/30 border border-red-800/50 rounded-lg p-4">
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <h3 className="text-lg font-semibold text-white">Department Information</h3>
              
              <div className="space-y-2">
                <Label htmlFor="department_name" className="text-white text-sm">Department Name *</Label>
                <Input
                  id="department_name"
                  placeholder="e.g., Metro Police Department"
                  value={formData.department_name}
                  onChange={(e) => setFormData({...formData, department_name: e.target.value})}
                  className="bg-slate-900/50 border-slate-600 text-white h-12"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city" className="text-white text-sm">City *</Label>
                  <Input
                    id="city"
                    placeholder="e.g., Buckeye"
                    value={formData.city}
                    onChange={(e) => setFormData({...formData, city: e.target.value})}
                    className="bg-slate-900/50 border-slate-600 text-white h-12"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="state" className="text-white text-sm">State *</Label>
                  <Input
                    id="state"
                    placeholder="e.g., AZ"
                    value={formData.state}
                    onChange={(e) => setFormData({...formData, state: e.target.value.toUpperCase()})}
                    className="bg-slate-900/50 border-slate-600 text-white h-12"
                    maxLength={2}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="zip_code" className="text-white text-sm">ZIP Code *</Label>
                <Input
                  id="zip_code"
                  placeholder="e.g., 85326"
                  value={formData.zip_code}
                  onChange={(e) => setFormData({...formData, zip_code: e.target.value})}
                  className="bg-slate-900/50 border-slate-600 text-white h-12"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="department_phone" className="text-white text-sm">Department Phone</Label>
                <Input
                  id="department_phone"
                  type="tel"
                  placeholder="e.g., 623-555-0100"
                  value={formData.department_phone}
                  onChange={(e) => setFormData({...formData, department_phone: e.target.value})}
                  className="bg-slate-900/50 border-slate-600 text-white h-12"
                />
                <p className="text-xs text-slate-400">Primary main line for your department (optional)</p>
              </div>

              <div className="border-t border-slate-700 pt-6 mt-6">
                <h3 className="text-lg font-semibold text-white mb-4">Contact Information</h3>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="contact_name" className="text-white text-sm">Your Full Name *</Label>
                    <Input
                      id="contact_name"
                      placeholder="e.g., Sgt. Jane Smith"
                      value={formData.contact_name}
                      onChange={(e) => setFormData({...formData, contact_name: e.target.value})}
                      className="bg-slate-900/50 border-slate-600 text-white h-12"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="contact_email" className="text-white text-sm">Work Email Address *</Label>
                    <Input
                      id="contact_email"
                      type="email"
                      placeholder="e.g., jane.smith@metroPD.gov"
                      value={formData.contact_email}
                      onChange={(e) => setFormData({...formData, contact_email: e.target.value})}
                      className="bg-slate-900/50 border-slate-600 text-white h-12"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="contact_phone" className="text-white text-sm">Contact Phone *</Label>
                    <Input
                      id="contact_phone"
                      type="tel"
                      placeholder="e.g., 623-555-0123"
                      value={formData.contact_phone}
                      onChange={(e) => setFormData({...formData, contact_phone: e.target.value})}
                      className="bg-slate-900/50 border-slate-600 text-white h-12"
                      required
                    />
                    <p className="text-xs text-slate-400">Direct line for the primary contact during the trial</p>
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                disabled={isSubmitting || isGeneratingCode}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 text-base"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Creating Account...
                  </>
                ) : isGeneratingCode ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Generating Code...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5 mr-2" />
                    Start Trial
                  </>
                )}
              </Button>
            </form>

            <div className="mt-8 pt-8 border-t border-slate-700">
              <h4 className="font-semibold text-white mb-4 text-center text-sm">What's Included in Your Free Trial</h4>
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300">Full structured background interview system</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300">Automated follow-up packs</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300">CJIS-aligned security and encryption</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300">Printable investigation-ready reports</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300">Applicant tracking & progress history</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300">5 user seats included</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Success Modal */}
      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-[90vw] md:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="space-y-3">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-2xl font-bold text-white">
                Your Trial Is Ready – Here's How to Get Started
              </DialogTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowSuccessModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </DialogHeader>
          
          {createdDepartment && (
            <div className="space-y-6 pt-4">
              {/* Department Code */}
              <div className="bg-blue-950/30 border border-blue-800/50 rounded-lg p-4">
                <Label className="text-sm text-slate-300 mb-2 block">Department Code</Label>
                <div className="flex items-center gap-3">
                  <code className="flex-1 text-2xl font-bold text-blue-400 font-mono">
                    {createdDepartment.department_code}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(createdDepartment.department_code)}
                    className="bg-slate-800 border-slate-600 text-white hover:bg-slate-700"
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copy
                  </Button>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  Use this code to identify all applicant interviews. Share it only within your department.
                </p>
              </div>

              {/* Interview Link */}
              <div>
                <Label className="text-sm text-slate-300 mb-2 block">Interview Link to Send to Applicants</Label>
                <div className="flex items-center gap-3">
                  <Input
                    value={interviewLink}
                    readOnly
                    className="bg-slate-800 border-slate-600 text-white h-10 text-sm"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(interviewLink)}
                    className="bg-slate-800 border-slate-600 text-white hover:bg-slate-700 flex-shrink-0"
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copy
                  </Button>
                </div>
              </div>

              {/* Instructions */}
              <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                <h4 className="font-semibold text-white mb-3 text-sm">What Investigators Need To Do</h4>
                <ol className="space-y-2 text-sm text-slate-300 list-decimal list-inside">
                  <li>Give the applicant your Department Code: <code className="text-blue-400 font-mono">{createdDepartment.department_code}</code></li>
                  <li>Give them a File Number (any number your agency uses, such as a case number or applicant ID).</li>
                  <li>Send them the interview link shown above.</li>
                  <li>The applicant completes the interview on their own device.</li>
                  <li>You will automatically receive a structured transcript, follow-up details, and a ready-to-review report.</li>
                </ol>
              </div>

              {/* No PII Statement */}
              <div className="bg-green-950/20 border border-green-800/50 rounded-lg p-3">
                <p className="text-sm text-green-300">
                  <strong>Privacy Notice:</strong> ClearQuest does not collect any personally identifiable information. 
                  All sessions are anonymous and encrypted end-to-end.
                </p>
              </div>

              {/* Copy-Paste Instructions */}
              <div>
                <Label className="text-sm text-slate-300 mb-2 block">Copy & Paste Instructions for Applicants</Label>
                <Textarea
                  value={instructionsText}
                  readOnly
                  className="bg-slate-800 border-slate-600 text-white text-xs font-mono h-48"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(instructionsText)}
                  className="mt-2 bg-slate-800 border-slate-600 text-white hover:bg-slate-700"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Instructions
                </Button>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-center pt-4 border-t border-slate-700">
                <Button
                  onClick={() => setShowSuccessModal(false)}
                  className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-8"
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
