import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Shield, CheckCircle, Loader2, ArrowLeft, Copy, FileDown, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Simplified department code generation (3 letters + hyphen + 5-digit number)
function generateDepartmentCode(departmentName) {
  if (!departmentName) return "";

  // Extract first 3 letters from department name
  const cleanName = departmentName.trim().replace(/[^a-zA-Z\s]/g, '');
  const words = cleanName.split(/\s+/).filter(word => word.length > 0);
  
  let prefix = "";
  if (words.length >= 1) {
    const firstWord = words[0];
    if (firstWord.length >= 3) {
      prefix = firstWord.substring(0, 3).toUpperCase();
    } else if (firstWord.length === 2) {
      prefix = (firstWord + (words[1]?.[0] || 'X')).toUpperCase();
    } else {
      prefix = (firstWord + 'XX').substring(0, 3).toUpperCase();
    }
  } else {
    prefix = "DEP";
  }

  // Generate 5-digit random number
  const randomNum = Math.floor(10000 + Math.random() * 90000);
  
  return `${prefix}-${randomNum}`;
}

export default function TrialSignup() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdDepartment, setCreatedDepartment] = useState(null);
  
  const [formData, setFormData] = useState({
    department_name: "",
    city: "",
    state: "",
    zip_code: "",
    phone_number: "",
    contact_name: "", 
    contact_email: "",
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    if (!formData.department_name || !formData.city || !formData.state || 
        !formData.zip_code || !formData.phone_number || !formData.contact_name || 
        !formData.contact_email) {
      toast.error("Please fill in all required fields.");
      return;
    }

    if (!/\S+@\S+\.\S+/.test(formData.contact_email)) {
      toast.error("Please enter a valid email address.");
      return;
    }

    setIsSubmitting(true);

    try {
      const deptCode = generateDepartmentCode(formData.department_name);
      const deptId = `DEPT-${Date.now().toString(36).toUpperCase()}`;
      const trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + 30);

      const nameParts = formData.contact_name.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      const departmentData = {
        department_name: formData.department_name,
        department_code: deptCode,
        department_type: "Law Enforcement", // Default value
        city: formData.city,
        state: formData.state,
        zip_code: formData.zip_code,
        phone_number: formData.phone_number,
        contact_name: formData.contact_name,
        contact_email: formData.contact_email,
        department_id: deptId,
        plan_type: "Free Trial",
        plan_level: "Trial",
        active_status: "Active",
        seats_allocated: 5,
        retention_period: 30,
        date_joined: new Date().toISOString(),
        trial_end_date: trialEndDate.toISOString(),
        activity_log: ["Trial account created via self-service signup"],
        use_default_branding: true,
        cjis_compliance: true,
        anonymity_mode: true,
        applicants_processed: 0,
        color_primary: "#1F2937",
        color_accent: "#E6B980"
      };

      const newDept = await base44.entities.Department.create(departmentData);

      await base44.entities.User.create({
        first_name: firstName,
        last_name: lastName,
        email: formData.contact_email,
        role: "DEPT_ADMIN",
        department_id: newDept.id,
        is_active: true,
        last_login: new Date().toISOString()
      });

      console.log("✅ Trial department created:", newDept);
      setCreatedDepartment(newDept);
      setShowSuccessModal(true);
      setIsSubmitting(false);
      
    } catch (err) {
      console.error("Error creating trial:", err);
      toast.error("Failed to create trial account. Please try again.");
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
                    placeholder="City"
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
                    placeholder="e.g., CA"
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
                  placeholder="e.g., 90210"
                  value={formData.zip_code}
                  onChange={(e) => setFormData({...formData, zip_code: e.target.value})}
                  className="bg-slate-900/50 border-slate-600 text-white h-12"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone_number" className="text-white text-sm">Phone Number *</Label>
                <Input
                  id="phone_number"
                  type="tel"
                  placeholder="(555) 555-5555"
                  value={formData.phone_number}
                  onChange={(e) => setFormData({...formData, phone_number: e.target.value})}
                  className="bg-slate-900/50 border-slate-600 text-white h-12"
                  required
                />
                <p className="text-xs text-slate-400">Primary contact number for your department</p>
              </div>

              <div className="border-t border-slate-700 pt-6 mt-6">
                <h3 className="text-lg font-semibold text-white mb-4">Contact Information</h3>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="contact_name" className="text-white text-sm">Your Full Name *</Label>
                    <Input
                      id="contact_name"
                      placeholder="John Doe"
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
                      placeholder="your.name@department.gov"
                      value={formData.contact_email}
                      onChange={(e) => setFormData({...formData, contact_email: e.target.value})}
                      className="bg-slate-900/50 border-slate-600 text-white h-12"
                      required
                    />
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 text-base"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Creating Account...
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
                  <span className="text-slate-300">Full structured interview system</span>
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
                  <span className="text-slate-300">Complete PDF summaries</span>
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

        <p className="text-center text-sm text-slate-400 mt-6">
          Already have an account?{" "}
          <Link to={createPageUrl("AdminLogin")} className="text-blue-400 hover:text-blue-300">
            Sign in
          </Link>
        </p>
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
              <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-700">
                <Button
                  variant="outline"
                  onClick={() => setShowSuccessModal(false)}
                  className="flex-1 bg-slate-800 border-slate-600 text-white hover:bg-slate-700"
                >
                  Close
                </Button>
                <Button
                  onClick={() => navigate(createPageUrl(`DepartmentDashboard?id=${createdDepartment.id}`))}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Go to Dashboard
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}