
import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, CheckCircle, Loader2, ArrowLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { generateDepartmentCode } from "@/utils/generateDepartmentCode.js";

export default function TrialSignup() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [formData, setFormData] = useState({
    department_name: "",
    department_code: "",
    department_type: "Law Enforcement",
    jurisdiction: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    zip_code: "",
    contact_name: "", 
    contact_email: "",
    phone_number: "",
  });

  // Auto-generate department code when name or zip changes
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
    
    if (step === 1) {
      if (!formData.department_name || !formData.department_type || !formData.jurisdiction ||
          !formData.address_line1 || !formData.city || !formData.state || !formData.zip_code) {
        toast.error("Please fill in all required department fields.");
        return;
      }
      setStep(2);
      return;
    }

    if (step === 2) {
      if (!formData.contact_name || !formData.contact_email || !formData.phone_number) {
        toast.error("Please fill in all required contact fields.");
        return;
      }
      if (!/\S+@\S+\.\S+/.test(formData.contact_email)) {
        toast.error("Please enter a valid email address.");
        return;
      }
      setStep(3);
      return;
    }

    setIsSubmitting(true);

    try {
      const deptId = `DEPT-${Date.now().toString(36).toUpperCase()}`;
      const trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + 30);

      const nameParts = formData.contact_name.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      const departmentData = {
        department_name: formData.department_name,
        department_code: formData.department_code,
        department_type: formData.department_type,
        jurisdiction: formData.jurisdiction,
        address_line1: formData.address_line1,
        address_line2: formData.address_line2,
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

      toast.success("Trial account created! Check your email for login instructions.");
      
      setTimeout(() => {
        navigate(createPageUrl("AdminLogin"));
      }, 2000);
    } catch (err) {
      console.error("Error creating trial:", err);
      toast.error("Failed to create trial account. Please try again.");
      setIsSubmitting(false);
    }
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
            <CardTitle className="text-2xl md:text-3xl text-white">Start Your Free Trial</CardTitle>
            <CardDescription className="text-slate-300 text-sm md:text-base">
              30 days of full access • No credit card required • CJIS compliant
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 p-6 md:p-8">
            <div className="flex items-center justify-center gap-2 mb-6">
              {[1, 2, 3].map((s) => (
                <div
                  key={s}
                  className={`h-2 rounded-full transition-all ${
                    s === step ? 'w-8 bg-blue-500' : s < step ? 'w-2 bg-blue-400' : 'w-2 bg-slate-600'
                  }`}
                />
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {step === 1 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white mb-4">Department Information</h3>
                  
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

                  <div className="space-y-2">
                    <Label htmlFor="department_type" className="text-white text-sm">Department Type *</Label>
                    <Select
                      value={formData.department_type}
                      onValueChange={(value) => setFormData({...formData, department_type: value})}
                    >
                      <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white h-12">
                        <SelectValue placeholder="Select a department type" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 text-white border-slate-700">
                        <SelectItem value="Law Enforcement">Law Enforcement</SelectItem>
                        <SelectItem value="Fire">Fire</SelectItem>
                        <SelectItem value="Corrections">Corrections</SelectItem>
                        <SelectItem value="Civil Service">Civil Service</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="jurisdiction" className="text-white text-sm">Jurisdiction *</Label>
                    <Input
                      id="jurisdiction"
                      placeholder="e.g., City of Springfield"
                      value={formData.jurisdiction}
                      onChange={(e) => setFormData({...formData, jurisdiction: e.target.value})}
                      className="bg-slate-900/50 border-slate-600 text-white h-12"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address_line1" className="text-white text-sm">Address Line 1 *</Label>
                    <Input
                      id="address_line1"
                      placeholder="Street address"
                      value={formData.address_line1}
                      onChange={(e) => setFormData({...formData, address_line1: e.target.value})}
                      className="bg-slate-900/50 border-slate-600 text-white h-12"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address_line2" className="text-white text-sm">Address Line 2</Label>
                    <Input
                      id="address_line2"
                      placeholder="Apt, Suite, Unit, etc. (optional)"
                      value={formData.address_line2}
                      onChange={(e) => setFormData({...formData, address_line2: e.target.value})}
                      className="bg-slate-900/50 border-slate-600 text-white h-12"
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

                  {formData.department_code && (
                    <div className="bg-blue-950/30 border border-blue-800/50 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-300">Your Department Code:</span>
                        <span className="text-lg font-mono font-bold text-blue-400">
                          {isGeneratingCode ? "Generating..." : formData.department_code}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-2">
                        Applicants will use this code to start interviews
                      </p>
                    </div>
                  )}
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white mb-4">Contact Information</h3>
                  
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

                  <div className="space-y-2">
                    <Label htmlFor="phone_number" className="text-white text-sm">Work Phone Number *</Label>
                    <Input
                      id="phone_number"
                      type="tel"
                      placeholder="(555) 555-5555"
                      value={formData.phone_number}
                      onChange={(e) => setFormData({...formData, phone_number: e.target.value})}
                      className="bg-slate-900/50 border-slate-600 text-white h-12"
                      required
                    />
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6">
                  <div className="text-center space-y-4">
                    <CheckCircle className="w-16 h-16 text-green-400 mx-auto" />
                    <h3 className="text-xl font-semibold text-white">Ready to Start Your Trial!</h3>
                    <p className="text-slate-300 text-sm">
                      Review your information and click "Start Trial" to begin your 30-day free access.
                    </p>
                  </div>

                  <div className="bg-slate-900/30 border border-slate-700 rounded-lg p-4 space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Department Name:</span>
                      <span className="text-white font-medium text-right">{formData.department_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Department Code:</span>
                      <span className="text-white font-mono text-right">{formData.department_code}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Department Type:</span>
                      <span className="text-white text-right">{formData.department_type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Address:</span>
                      <span className="text-white text-right">
                        {formData.city}, {formData.state} {formData.zip_code}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Contact Name:</span>
                      <span className="text-white text-right">{formData.contact_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Contact Email:</span>
                      <span className="text-white text-right">{formData.contact_email}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-col md:flex-row gap-3 pt-4">
                {step > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep(step - 1)}
                    className="w-full md:w-auto bg-slate-900/50 border-slate-600 text-white hover:bg-slate-700 h-12"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                  </Button>
                )}
                
                <Button
                  type="submit"
                  disabled={isSubmitting || (step === 1 && isGeneratingCode)}
                  className={`flex-1 bg-blue-600 hover:bg-blue-700 text-white h-12 ${step === 1 ? "md:ml-auto" : ""}`}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Creating Account...
                    </>
                  ) : step === 3 ? (
                    <>
                      <CheckCircle className="w-5 h-5 mr-2" />
                      Start Trial
                    </>
                  ) : (
                    <>
                      Continue
                      <ChevronRight className="w-5 h-5 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </form>

            <div className="mt-8 pt-8 border-t border-slate-700">
              <h4 className="font-semibold text-white mb-4 text-center text-sm">What's Included</h4>
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300">Full 162-question interview system</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300">AI-powered follow-ups</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300">CJIS-compliant security</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300">Complete PDF reports</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300">5 User Seats Included</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300">Detailed Applicant Tracking</span>
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
    </div>
  );
}
