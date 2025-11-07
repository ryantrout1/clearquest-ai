
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Building2, Loader2, Save, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

export default function EditDepartment() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const deptId = urlParams.get('id');

  const [user, setUser] = useState(null);
  const [department, setDepartment] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Check for mock admin authentication first
      const adminAuth = sessionStorage.getItem("clearquest_admin_auth");
      if (adminAuth) {
        try {
          const auth = JSON.parse(adminAuth);
          // Create mock super admin user
          const mockUser = {
            email: `${auth.username.toLowerCase()}@clearquest.ai`,
            first_name: auth.username,
            last_name: "Admin",
            role: "SUPER_ADMIN",
            id: "mock-admin-id"
          };
          setUser(mockUser);

          if (!deptId) {
            navigate(createPageUrl("SystemAdminDashboard"));
            return;
          }

          const dept = await base44.entities.Department.get(deptId);
          setDepartment(dept);
          setFormData(dept);
          return; // Exit after successful mock admin auth and data load
        } catch (err) {
          console.error("Error with mock admin auth:", err);
          // If mock admin auth fails, proceed to normal Base44 authentication
        }
      }

      // Otherwise check Base44 authentication
      const currentUser = await base44.auth.me();
      setUser(currentUser);

      if (!deptId) {
        navigate(createPageUrl("SystemAdminDashboard"));
        return;
      }

      const dept = await base44.entities.Department.get(deptId);
      
      // Check permissions
      const canEdit = currentUser.role === 'SUPER_ADMIN' || 
                     (currentUser.role === 'DEPT_ADMIN' && dept.id === currentUser.department_id);
      
      if (!canEdit) {
        navigate(createPageUrl("HomeHub"));
        return;
      }

      setDepartment(dept);
      setFormData(dept);
    } catch (err) {
      console.error("Error loading department:", err);
      navigate(createPageUrl("HomeHub"));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const updateData = { ...formData };
      
      // Add activity log entry
      const activityLog = formData.activity_log || [];
      activityLog.unshift(`Department updated by ${user.email}`);
      updateData.activity_log = activityLog.slice(0, 10); // Keep last 10

      await base44.entities.Department.update(department.id, updateData);
      
      toast.success("Department updated successfully!");
      navigate(createPageUrl(`DepartmentDashboard?id=${department.id}`));
    } catch (err) {
      console.error("Error updating department:", err);
      toast.error("Failed to update department");
      setIsSubmitting(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setFormData({ ...formData, logo_url: file_url, use_default_branding: false });
      toast.success("Logo uploaded!");
    } catch (err) {
      console.error("Error uploading logo:", err);
      toast.error("Failed to upload logo");
    }
  };

  if (!user || !formData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-blue-400 animate-spin" />
      </div>
    );
  }

  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  const isDeptAdmin = user.role === 'DEPT_ADMIN';
  const canEditBranding = formData.plan_level === 'Paid' && (isSuperAdmin || isDeptAdmin);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <Link to={createPageUrl(`DepartmentDashboard?id=${department.id}`)}>
          <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-slate-700 mb-4 md:mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>

        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Building2 className="w-6 h-6 md:w-8 md:h-8 text-blue-400 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <CardTitle className="text-xl md:text-2xl text-white break-words">Edit Department</CardTitle>
                <p className="text-slate-300 text-sm mt-1 truncate">{department.department_name}</p>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6 md:space-y-8">
              {/* Basic Info */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white border-b border-slate-700 pb-2">
                  Department Information
                </h3>
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-white">Department Name *</Label>
                    <Input
                      value={formData.department_name}
                      onChange={(e) => setFormData({...formData, department_name: e.target.value})}
                      className="bg-slate-900/50 border-slate-600 text-white"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white">Department Type</Label>
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
                    <Label className="text-white">Jurisdiction</Label>
                    <Input
                      value={formData.jurisdiction || ""}
                      onChange={(e) => setFormData({...formData, jurisdiction: e.target.value})}
                      className="bg-slate-900/50 border-slate-600 text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white">Phone Number</Label>
                    <Input
                      value={formData.phone_number || ""}
                      onChange={(e) => setFormData({...formData, phone_number: e.target.value})}
                      className="bg-slate-900/50 border-slate-600 text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Branding (Paid plans only) */}
              {canEditBranding && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white border-b border-slate-700 pb-2">
                    Branding
                  </h3>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="use_default_branding"
                      checked={formData.use_default_branding}
                      onCheckedChange={(checked) => setFormData({...formData, use_default_branding: checked})}
                    />
                    <label htmlFor="use_default_branding" className="text-sm text-white cursor-pointer">
                      Use default ClearQuest branding
                    </label>
                  </div>

                  {!formData.use_default_branding && (
                    <div className="space-y-4 pl-6 border-l-2 border-blue-500/30">
                      <div className="space-y-2">
                        <Label className="text-white">Department Logo</Label>
                        <div className="flex items-center gap-4">
                          {formData.logo_url && (
                            <img src={formData.logo_url} alt="Logo" className="w-16 h-16 object-contain bg-white rounded p-1" />
                          )}
                          <Input
                            type="file"
                            accept="image/*"
                            onChange={handleLogoUpload}
                            className="bg-slate-900/50 border-slate-600 text-white"
                          />
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-white">Primary Color</Label>
                          <div className="flex gap-2">
                            <Input
                              type="color"
                              value={formData.color_primary}
                              onChange={(e) => setFormData({...formData, color_primary: e.target.value})}
                              className="w-16 h-10 bg-slate-900/50 border-slate-600"
                            />
                            <Input
                              value={formData.color_primary}
                              onChange={(e) => setFormData({...formData, color_primary: e.target.value})}
                              className="flex-1 bg-slate-900/50 border-slate-600 text-white"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-white">Accent Color</Label>
                          <div className="flex gap-2">
                            <Input
                              type="color"
                              value={formData.color_accent}
                              onChange={(e) => setFormData({...formData, color_accent: e.target.value})}
                              className="w-16 h-10 bg-slate-900/50 border-slate-600"
                            />
                            <Input
                              value={formData.color_accent}
                              onChange={(e) => setFormData({...formData, color_accent: e.target.value})}
                              className="flex-1 bg-slate-900/50 border-slate-600 text-white"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Security Settings */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white border-b border-slate-700 pb-2">
                  Security & Compliance
                </h3>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-white">Data Retention (days)</Label>
                    <Input
                      type="number"
                      min="7"
                      max="365"
                      value={formData.retention_period}
                      onChange={(e) => setFormData({...formData, retention_period: parseInt(e.target.value)})}
                      className="bg-slate-900/50 border-slate-600 text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white">Data Sharing Level</Label>
                    <Select
                      value={formData.data_sharing_level}
                      onValueChange={(value) => setFormData({...formData, data_sharing_level: value})}
                    >
                      <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Internal Only">Internal Only</SelectItem>
                        <SelectItem value="Shared with HR">Shared with HR</SelectItem>
                        <SelectItem value="Shared with CJIS Partner">Shared with CJIS Partner</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="anonymity_mode"
                    checked={formData.anonymity_mode}
                    onCheckedChange={(checked) => setFormData({...formData, anonymity_mode: checked})}
                  />
                  <label htmlFor="anonymity_mode" className="text-sm text-white cursor-pointer">
                    Enable anonymity mode (recommended)
                  </label>
                </div>
              </div>

              {/* Super Admin Only - Plan Management */}
              {isSuperAdmin && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white border-b border-slate-700 pb-2">
                    Account Management
                  </h3>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-white">Plan Level</Label>
                      <Select
                        value={formData.plan_level}
                        onValueChange={(value) => setFormData({...formData, plan_level: value})}
                      >
                        <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Trial">Trial</SelectItem>
                          <SelectItem value="Pilot">Pilot</SelectItem>
                          <SelectItem value="Paid">Paid</SelectItem>
                          <SelectItem value="Suspended">Suspended</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-white">Seats Allocated</Label>
                      <Input
                        type="number"
                        min="1"
                        value={formData.seats_allocated}
                        onChange={(e) => setFormData({...formData, seats_allocated: parseInt(e.target.value)})}
                        className="bg-slate-900/50 border-slate-600 text-white"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-white">Status</Label>
                      <Select
                        value={formData.active_status}
                        onValueChange={(value) => setFormData({...formData, active_status: value})}
                      >
                        <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Active">Active</SelectItem>
                          <SelectItem value="Inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col-reverse md:flex-row justify-end gap-3 pt-4 border-t border-slate-700">
                <Link to={createPageUrl(`DepartmentDashboard?id=${department.id}`)} className="w-full md:w-auto">
                  <Button type="button" variant="outline" className="w-full md:w-auto bg-slate-900/50 border-slate-600 text-white hover:bg-slate-700 hover:text-white">
                    Cancel
                  </Button>
                </Link>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full md:w-auto bg-blue-600 hover:bg-blue-700"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save Changes
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
