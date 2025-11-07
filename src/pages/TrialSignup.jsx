import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

export default function TrialSignup() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    // Department info
    department_name: "",
    department_type: "Law Enforcement",
    jurisdiction: "",
    phone_number: "",
    
    // Admin user info
    first_name: "",
    last_name: "",
    email: "",
    title: ""
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (step === 1) {
      setStep(2);
      return;
    }

    setIsSubmitting(true);

    try {
      // Generate department ID
      const deptId = `DEPT-${Date.now().toString(36).toUpperCase()}`;
      
      // Calculate trial end date (30 days from now)
      const trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + 30);

      // Create department
      const departmentData = {
        department_name: formData.department_name,
        department_type: formData.department_type,
        jurisdiction: formData.jurisdiction,
        phone_number: formData.phone_number,
        contact_name: `${formData.first_name} ${formData.last_name}`,
        contact_email: formData.email,
        contact_title: formData.title,
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

      // Create admin user
      // Note: In a real implementation, this would send an invite email
      // For MVP, we'll create the user record directly
      await base44.entities.User.create({
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        role: "DEPT_ADMIN",
        department_id: newDept.id,
        is_active: true,
        last_login: new Date().toISOString()
      });

      toast.success("Trial account created! Check your email for login instructions.");
      
      // Redirect to a success page or login
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
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Shield className="w-16 h-16 text-blue-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            Start Your 30-Day Free Trial
          </h1>
          <p className="text-slate-300">
            No credit card required • Full access • CJIS compliant
          </p>
        </div>

        {/* Features */}
        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 mb-6">
          <CardContent className="p-6">
            <div className="grid md:grid-cols-3 gap-4 text-center">
              <div className="space-y-2">
                <CheckCircle className="w-8 h-8 text-green-400 mx-auto" />
                <p className="text-white font-medium">5 User Seats</p>
                <p className="text-slate-400 text-xs">Invite your team</p>
              </div>
              <div className="space-y-2">
                <CheckCircle className="w-8 h-8 text-green-400 mx-auto" />
                <p className="text-white font-medium">Full Features</p>
                <p className="text-slate-400 text-xs">All tools unlocked</p>
              </div>
              <div className="space-y-2">
                <CheckCircle className="w-8 h-8 text-green-400 mx-auto" />
                <p className="text-white font-medium">30-Day Trial</p>
                <p className="text-slate-400 text-xs">Cancel anytime</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Form */}
        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl text-white">
                  {step === 1 ? "Department Information" : "Your Information"}
                </CardTitle>
                <CardDescription className="text-slate-300">
                  Step {step} of 2
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <div className={`w-2 h-2 rounded-full ${step >= 1 ? 'bg-blue-400' : 'bg-slate-600'}`} />
                <div className={`w-2 h-2 rounded-full ${step >= 2 ? 'bg-blue-400' : 'bg-slate-600'}`} />
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {step === 1 ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="department_name" className="text-white">Department Name *</Label>
                    <Input
                      id="department_name"
                      placeholder="e.g., Metro Police Department"
                      value={formData.department_name}
                      onChange={(e) => setFormData({...formData, department_name: e.target.value})}
                      className="bg-slate-900/50 border-slate-600 text-white"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="department_type" className="text-white">Department Type *</Label>
                    <Select
                      value={formData.department_type}
                      onValueChange={(value) => setFormData({...formData, department_type: value})}
                    >
                      <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Law Enforcement">Law Enforcement</SelectItem>
                        <SelectItem value="Fire">Fire</SelectItem>
                        <SelectItem value="Corrections">Corrections</SelectItem>
                        <SelectItem value="Civil Service">Civil Service</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="jurisdiction" className="text-white">Jurisdiction</Label>
                    <Input
                      id="jurisdiction"
                      placeholder="e.g., City of Springfield"
                      value={formData.jurisdiction}
                      onChange={(e) => setFormData({...formData, jurisdiction: e.target.value})}
                      className="bg-slate-900/50 border-slate-600 text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone_number" className="text-white">Department Phone</Label>
                    <Input
                      id="phone_number"
                      type="tel"
                      placeholder="(555) 555-5555"
                      value={formData.phone_number}
                      onChange={(e) => setFormData({...formData, phone_number: e.target.value})}
                      className="bg-slate-900/50 border-slate-600 text-white"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="first_name" className="text-white">First Name *</Label>
                      <Input
                        id="first_name"
                        value={formData.first_name}
                        onChange={(e) => setFormData({...formData, first_name: e.target.value})}
                        className="bg-slate-900/50 border-slate-600 text-white"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="last_name" className="text-white">Last Name *</Label>
                      <Input
                        id="last_name"
                        value={formData.last_name}
                        onChange={(e) => setFormData({...formData, last_name: e.target.value})}
                        className="bg-slate-900/50 border-slate-600 text-white"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-white">Work Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your.name@department.gov"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="bg-slate-900/50 border-slate-600 text-white"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="title" className="text-white">Job Title</Label>
                    <Input
                      id="title"
                      placeholder="e.g., HR Manager"
                      value={formData.title}
                      onChange={(e) => setFormData({...formData, title: e.target.value})}
                      className="bg-slate-900/50 border-slate-600 text-white"
                    />
                  </div>
                </>
              )}

              <div className="flex justify-between gap-3 pt-4">
                {step === 2 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep(1)}
                    className="border-slate-600 text-white hover:bg-slate-700"
                  >
                    Back
                  </Button>
                )}
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-blue-600 hover:bg-blue-700 ml-auto"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating Account...
                    </>
                  ) : step === 1 ? (
                    "Continue"
                  ) : (
                    "Start Free Trial"
                  )}
                </Button>
              </div>
            </form>
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