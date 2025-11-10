import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Building2, Loader2, Save } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { generateDepartmentCode } from "@/utils/generateDepartmentCode";

export default function CreateDepartment() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
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
    phone_number: "",
    website_url: "",
    contact_name: "",
    contact_title: "",
    contact_email: "",
    contact_phone: "",
    plan_type: "Free Trial",
    plan_level: "Trial",
    seats_allocated: 5,
    retention_period: 30,
    active_status: "Active"
  });

  useEffect(() => {
    checkAuth();
  }, []);

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

    const timeoutId = setTimeout(generateCode, 500); // Debounce
    return () => clearTimeout(timeoutId);
  }, [formData.department_name, formData.zip_code]);

  const checkAuth = async () => {
    try {
      const adminAuth = sessionStorage.getItem("clearquest_admin_auth");
      if (adminAuth) {
        try {
          const auth = JSON.parse(adminAuth);
          const mockUser = {
            email: `${auth.username.toLowerCase()}@clearquest.ai`,
            first_name: auth.username,
            last_name: "Admin",
            role: "SUPER_ADMIN",
            id: "mock-admin-id"
          };
          setUser(mockUser);
          return;
        } catch (err) {
          console.error("Error parsing admin auth:", err);
        }
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    console.log("🚀 Form submitted", formData);
    
    if (!formData.department_name || !formData.department_code || !formData.contact_email ||
        !formData.address_line1 || !formData.city || !formData.state || !formData.zip_code) {
      toast.error("Please fill in all required fields");
      return;
    }
    
    setIsSubmitting(true);

    try {
      console.log("📝 Creating department...");
      
      const deptId = `DEPT-${Date.now().toString(36).toUpperCase()}`;
      const trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + 30);

      const departmentData = {
        ...formData,
        department_id: deptId,
        date_joined: new Date().toISOString(),
        trial_end_date: trialEndDate.toISOString(),
        activity_log: [`Department created by ${user.email}`],
        applicants_processed: 0,
        avg_processing_time: 0,
        cjis_compliance: true,
        anonymity_mode: true,
        use_default_branding: true,
        color_primary: "#1F2937",
        color_accent: "#E6B980"
      };

      console.log("📦 Department data:", departmentData);

      const newDept = await base44.entities.Department.create(departmentData);
      
      console.log("✅ Department created:", newDept);
      
      toast.success("Department created successfully!");
      navigate(createPageUrl(`DepartmentDashboard?id=${newDept.id}`));
    } catch (err) {
      console.error("❌ Error creating department:", err);
      toast.error(`Failed to create department: ${err.message || 'Unknown error'}`);
      setIsSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <Link to={createPageUrl("SystemAdminDashboard")}>
          <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-slate-700 mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>

        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
          <CardHeader className="p-6 md:p-8">
            <div className="flex items-center gap-3">
              <Building2 className="w-8 h-8 text-blue-400 flex-shrink-0" />
              <div>
                <CardTitle className="text-xl md:text-2xl text-white">Create New Department</CardTitle>
                <CardDescription className="text-slate-300 text-sm md:text-base">
                  Set up a new department with trial access
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-6 md:p-8">
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="space-y-4">
                <h3 className="text-base md:text-lg font-semibold text-white border-b border-slate-700 pb-2">
                  Department Information
                </h3>
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="department_name" className="text-white text-sm">Department Name *</Label>
                    <Input
                      id="department_name"
                      value={formData.department_name}
                      onChange={(e) => setFormData({...formData, department_name: e.target.value})}
                      className="bg-slate-900/50 border-slate-600 text-white h-11"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="department_code" className="text-white text-sm">
                      Department Code * {isGeneratingCode && <span className="text-blue-400 text-xs">(Generating...)</span>}
                    </Label>
                    <Input
                      id="department_code"
                      value={formData.department_code}
                      className="bg-slate-900/70 border-slate-600 text-slate-400 h-11 cursor-not-allowed"
                      placeholder="Auto-generated from name & zip"
                      readOnly
                      disabled
                    />
                    <p className="text-xs text-slate-400">
                      Auto-generated from department name and zip code
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="department_type" className="text-white text-sm">Department Type *</Label>
                    <Select
                      value={formData.department_type}
                      onValueChange={(value) => setFormData({...formData, department_type: value})}
                    >
                      <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white h-11">
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
                    <Label htmlFor="jurisdiction" className="text-white text-sm">Jurisdiction</Label>
                    <Input
                      id="jurisdiction"
                      value={formData.jurisdiction}
                      onChange={(e) => setFormData({...formData, jurisdiction: e.target.value})}
                      className="bg-slate-900/50 border-slate-600 text-white h-11"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone_number" className="text-white text-sm">Phone Number</Label>
                    <Input
                      id="phone_number"
                      type="tel"
                      value={formData.phone_number}
                      onChange={(e) => setFormData({...formData, phone_number: e.target.value})}
                      className="bg-slate-900/50 border-slate-600 text-white h-11"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="website_url" className="text-white text-sm">Website</Label>
                    <Input
                      id="website_url"
                      type="url"
                      value={formData.website_url}
                      onChange={(e) => setFormData({...formData, website_url: e.target.value})}
                      className="bg-slate-900/50 border-slate-600 text-white h-11"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="address_line1" className="text-white text-sm">Address Line 1 *</Label>
                    <Input
                      id="address_line1"
                      value={formData.address_line1}
                      onChange={(e) => setFormData({...formData, address_line1: e.target.value})}
                      className="bg-slate-900/50 border-slate-600 text-white h-11"
                      placeholder="Street address"
                      required
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="address_line2" className="text-white text-sm">Address Line 2</Label>
                    <Input
                      id="address_line2"
                      value={formData.address_line2}
                      onChange={(e) => setFormData({...formData, address_line2: e.target.value})}
                      className="bg-slate-900/50 border-slate-600 text-white h-11"
                      placeholder="Apt, Suite, Unit, etc. (optional)"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="city" className="text-white text-sm">City *</Label>
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => setFormData({...formData, city: e.target.value})}
                      className="bg-slate-900/50 border-slate-600 text-white h-11"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="state" className="text-white text-sm">State *</Label>
                    <Input
                      id="state"
                      value={formData.state}
                      onChange={(e) => setFormData({...formData, state: e.target.value.toUpperCase()})}
                      className="bg-slate-900/50 border-slate-600 text-white h-11"
                      placeholder="e.g., CA"
                      maxLength={2}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="zip_code" className="text-white text-sm">ZIP Code *</Label>
                    <Input
                      id="zip_code"
                      value={formData.zip_code}
                      onChange={(e) => setFormData({...formData, zip_code: e.target.value})}
                      className="bg-slate-900/50 border-slate-600 text-white h-11"
                      placeholder="e.g., 90210"
                      required
                    />
                    <p className="text-xs text-slate-400">
                      Used to generate department code
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-base md:text-lg font-semibold text-white border-b border-slate-700 pb-2">
                  Primary Contact
                </h3>
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="contact_name" className="text-white text-sm">Contact Name</Label>
                    <Input
                      id="contact_name"
                      value={formData.contact_name}
                      onChange={(e) => setFormData({...formData, contact_name: e.target.value})}
                      className="bg-slate-900/50 border-slate-600 text-white h-11"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="contact_title" className="text-white text-sm">Title</Label>
                    <Input
                      id="contact_title"
                      value={formData.contact_title}
                      onChange={(e) => setFormData({...formData, contact_title: e.target.value})}
                      className="bg-slate-900/50 border-slate-600 text-white h-11"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="contact_email" className="text-white text-sm">Email *</Label>
                    <Input
                      id="contact_email"
                      type="email"
                      value={formData.contact_email}
                      onChange={(e) => setFormData({...formData, contact_email: e.target.value})}
                      className="bg-slate-900/50 border-slate-600 text-white h-11"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="contact_phone" className="text-white text-sm">Phone</Label>
                    <Input
                      id="contact_phone"
                      type="tel"
                      value={formData.contact_phone}
                      onChange={(e) => setFormData({...formData, contact_phone: e.target.value})}
                      className="bg-slate-900/50 border-slate-600 text-white h-11"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-base md:text-lg font-semibold text-white border-b border-slate-700 pb-2">
                  Account Settings
                </h3>
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="seats_allocated" className="text-white text-sm">Seats Allocated</Label>
                    <Input
                      id="seats_allocated"
                      type="number"
                      min="1"
                      value={formData.seats_allocated}
                      onChange={(e) => setFormData({...formData, seats_allocated: parseInt(e.target.value)})}
                      className="bg-slate-900/50 border-slate-600 text-white h-11"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="retention_period" className="text-white text-sm">Retention Period (days)</Label>
                    <Input
                      id="retention_period"
                      type="number"
                      min="7"
                      max="365"
                      value={formData.retention_period}
                      onChange={(e) => setFormData({...formData, retention_period: parseInt(e.target.value)})}
                      className="bg-slate-900/50 border-slate-600 text-white h-11"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col md:flex-row justify-end gap-3 pt-4 border-t border-slate-700">
                <Link to={createPageUrl("SystemAdminDashboard")} className="w-full md:w-auto">
                  <Button type="button" variant="outline" className="w-full bg-slate-900/50 border-slate-600 text-white hover:bg-slate-700 hover:text-white h-11">
                    Cancel
                  </Button>
                </Link>
                <Button
                  type="submit"
                  disabled={isSubmitting || isGeneratingCode}
                  className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 h-11"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Create Department
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}