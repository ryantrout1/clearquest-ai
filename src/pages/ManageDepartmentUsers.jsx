import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, User, Mail, Phone, Edit, Trash2, Plus, AlertCircle, Loader2,
  Users as UsersIcon, Shield
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function ManageDepartmentUsers() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const deptId = urlParams.get('id');

  const [user, setUser] = useState(null);
  const [department, setDepartment] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showChangePrimaryModal, setShowChangePrimaryModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedContact, setSelectedContact] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    title: ""
  });

  useEffect(() => {
    checkAuthAndLoad();
  }, []);

  const checkAuthAndLoad = async () => {
    try {
      // Check for mock admin authentication
      const adminAuth = sessionStorage.getItem("clearquest_admin_auth");
      if (adminAuth) {
        const auth = JSON.parse(adminAuth);
        const mockUser = {
          email: `${auth.username.toLowerCase()}@clearquest.ai`,
          first_name: auth.username,
          last_name: "Admin",
          role: "SUPER_ADMIN",
          id: "mock-admin-id"
        };
        setUser(mockUser);
      } else {
        const currentUser = await base44.auth.me();
        if (currentUser.role !== 'SUPER_ADMIN') {
          navigate(createPageUrl("HomeHub"));
          return;
        }
        setUser(currentUser);
      }

      if (!deptId) {
        navigate(createPageUrl("SystemAdminDashboard"));
        return;
      }

      const dept = await base44.entities.Department.get(deptId);
      setDepartment(dept);
    } catch (err) {
      console.error("Auth/load error:", err);
      navigate(createPageUrl("AdminLogin"));
    }
  };

  const { data: departmentUsers = [], isLoading } = useQuery({
    queryKey: ['department-users', deptId],
    queryFn: () => base44.entities.DepartmentUser.filter({ department_id: deptId }),
    enabled: !!deptId
  });

  const primaryContact = departmentUsers.find(u => u.is_primary) || departmentUsers[0];
  const additionalContacts = departmentUsers.filter(u => !u.is_primary);

  const handleAddContact = async (e) => {
    e.preventDefault();
    
    if (!formData.full_name || !formData.email || !formData.phone) {
      toast.error("Name, email, and phone are required");
      return;
    }

    setIsSubmitting(true);
    try {
      await base44.entities.DepartmentUser.create({
        department_id: deptId,
        full_name: formData.full_name,
        email: formData.email,
        phone: formData.phone,
        title: formData.title || "",
        is_primary: false,
        role: "investigator",
        can_login: false
      });

      toast.success("Contact added successfully");
      queryClient.invalidateQueries({ queryKey: ['department-users'] });
      setShowAddModal(false);
      setFormData({ full_name: "", email: "", phone: "", title: "" });
    } catch (err) {
      console.error("Error adding contact:", err);
      toast.error("Failed to add contact");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditContact = async (e) => {
    e.preventDefault();
    
    if (!formData.full_name || !formData.email || !formData.phone) {
      toast.error("Name, email, and phone are required");
      return;
    }

    setIsSubmitting(true);
    try {
      await base44.entities.DepartmentUser.update(selectedContact.id, {
        full_name: formData.full_name,
        email: formData.email,
        phone: formData.phone,
        title: formData.title || ""
      });

      toast.success("Contact updated successfully");
      queryClient.invalidateQueries({ queryKey: ['department-users'] });
      setShowEditModal(false);
      setSelectedContact(null);
      setFormData({ full_name: "", email: "", phone: "", title: "" });
    } catch (err) {
      console.error("Error updating contact:", err);
      toast.error("Failed to update contact");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangePrimary = async (newPrimaryId) => {
    setIsSubmitting(true);
    try {
      // Set old primary to false
      if (primaryContact) {
        await base44.entities.DepartmentUser.update(primaryContact.id, { is_primary: false });
      }
      
      // Set new primary to true
      await base44.entities.DepartmentUser.update(newPrimaryId, { is_primary: true });

      toast.success("Primary contact changed successfully");
      queryClient.invalidateQueries({ queryKey: ['department-users'] });
      setShowChangePrimaryModal(false);
    } catch (err) {
      console.error("Error changing primary:", err);
      toast.error("Failed to change primary contact");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteContact = async () => {
    if (!selectedContact) return;

    // Prevent deleting the only contact if it's primary
    if (departmentUsers.length === 1) {
      toast.error("Every department must have at least one primary contact. Please add a new contact and set them as primary before deleting this one.");
      setShowDeleteDialog(false);
      return;
    }

    setIsSubmitting(true);
    try {
      await base44.entities.DepartmentUser.delete(selectedContact.id);
      toast.success("Contact deleted successfully");
      queryClient.invalidateQueries({ queryKey: ['department-users'] });
      setShowDeleteDialog(false);
      setSelectedContact(null);
    } catch (err) {
      console.error("Error deleting contact:", err);
      toast.error("Failed to delete contact");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = (contact) => {
    setSelectedContact(contact);
    setFormData({
      full_name: contact.full_name,
      email: contact.email,
      phone: contact.phone,
      title: contact.title || ""
    });
    setShowEditModal(true);
  };

  const openDeleteDialog = (contact) => {
    setSelectedContact(contact);
    setShowDeleteDialog(true);
  };

  if (!user || !department) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-slate-300">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Breadcrumb */}
        <Link to={createPageUrl(`DepartmentDashboard?id=${deptId}`)}>
          <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-slate-700 mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Department
          </Button>
        </Link>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <UsersIcon className="w-8 h-8 text-blue-400" />
            <h1 className="text-2xl md:text-3xl font-bold text-white">Department Contacts</h1>
          </div>
          <p className="text-slate-300 text-sm md:text-base">
            Manage primary and additional contacts for <strong>{department.department_name}</strong> (Code: {department.department_code})
          </p>
          <p className="text-slate-400 text-xs md:text-sm mt-1">
            Contacts do not have system login access in the current version.
          </p>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <Loader2 className="w-12 h-12 text-blue-400 animate-spin mx-auto mb-4" />
            <p className="text-slate-300">Loading contacts...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Primary Contact Card */}
            <Card className="bg-slate-800/50 backdrop-blur-sm border-blue-500/30">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white text-lg flex items-center gap-2">
                    <Shield className="w-5 h-5 text-blue-400" />
                    Primary Contact
                  </CardTitle>
                  {primaryContact && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEditModal(primaryContact)}
                        className="bg-slate-900/50 border-slate-600 text-white hover:bg-slate-700"
                      >
                        <Edit className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                      {departmentUsers.length > 1 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowChangePrimaryModal(true)}
                          className="bg-slate-900/50 border-slate-600 text-white hover:bg-slate-700"
                        >
                          Change Primary
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {!primaryContact ? (
                  <div className="text-center py-6">
                    <AlertCircle className="w-12 h-12 text-orange-400 mx-auto mb-3" />
                    <p className="text-slate-400 text-sm">No primary contact found. Add a contact below.</p>
                  </div>
                ) : (
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                      <User className="w-6 h-6 text-blue-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-white font-semibold text-lg">
                        {primaryContact.full_name}
                        {primaryContact.title && <span className="text-slate-400 font-normal text-base"> — {primaryContact.title}</span>}
                      </h3>
                      <div className="flex flex-col gap-2 mt-2 text-sm">
                        <a 
                          href={`mailto:${primaryContact.email}`}
                          className="text-slate-300 hover:text-blue-400 transition-colors flex items-center gap-2"
                        >
                          <Mail className="w-4 h-4" />
                          {primaryContact.email}
                        </a>
                        <a 
                          href={`tel:${primaryContact.phone}`}
                          className="text-slate-300 hover:text-blue-400 transition-colors flex items-center gap-2"
                        >
                          <Phone className="w-4 h-4" />
                          {primaryContact.phone}
                        </a>
                      </div>
                      <Badge className="mt-3 bg-blue-600/20 text-blue-300 border-blue-500/30 text-xs">
                        Login access: Not enabled
                      </Badge>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Additional Contacts Card */}
            <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white text-lg">Additional Contacts</CardTitle>
                  <Button
                    size="sm"
                    onClick={() => setShowAddModal(true)}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Contact
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {additionalContacts.length === 0 ? (
                  <p className="text-slate-400 text-sm text-center py-6">
                    No additional contacts. Click "Add Contact" to create one.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {additionalContacts.map((contact) => (
                      <div key={contact.id} className="flex items-start justify-between p-4 rounded-lg bg-slate-900/30 border border-slate-700 gap-4">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-slate-700/50 flex items-center justify-center flex-shrink-0">
                            <User className="w-5 h-5 text-slate-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-medium break-words">
                              {contact.full_name}
                              {contact.title && <span className="text-slate-400 font-normal"> — {contact.title}</span>}
                            </p>
                            <div className="flex flex-col gap-1 text-xs text-slate-400 mt-1">
                              <span className="flex items-center gap-1.5">
                                <Mail className="w-3 h-3" />
                                {contact.email}
                              </span>
                              <span className="flex items-center gap-1.5">
                                <Phone className="w-3 h-3" />
                                {contact.phone}
                              </span>
                            </div>
                            {contact.role && (
                              <Badge className="mt-2 bg-slate-700/50 text-slate-300 border-slate-600 text-xs">
                                {contact.role}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEditModal(contact)}
                            className="bg-slate-900/50 border-slate-600 text-white hover:bg-slate-700"
                          >
                            <Edit className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openDeleteDialog(contact)}
                            className="bg-slate-900/50 border-red-600 text-red-400 hover:bg-red-950/30"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Add Contact Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Add Contact</DialogTitle>
            <DialogDescription className="text-slate-400">
              Add a new contact to this department
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddContact} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="add_full_name" className="text-white">Full Name *</Label>
              <Input
                id="add_full_name"
                value={formData.full_name}
                onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                className="bg-slate-800 border-slate-600 text-white"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add_email" className="text-white">Email *</Label>
              <Input
                id="add_email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                className="bg-slate-800 border-slate-600 text-white"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add_phone" className="text-white">Phone *</Label>
              <Input
                id="add_phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
                className="bg-slate-800 border-slate-600 text-white"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add_title" className="text-white">Title</Label>
              <Input
                id="add_title"
                value={formData.title}
                onChange={(e) => setFormData({...formData, title: e.target.value})}
                className="bg-slate-800 border-slate-600 text-white"
                placeholder="e.g., Investigator"
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddModal(false)}
                className="bg-slate-800 border-slate-600 text-white hover:bg-slate-700"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add Contact"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Contact Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Edit Contact</DialogTitle>
            <DialogDescription className="text-slate-400">
              Update contact information
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditContact} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit_full_name" className="text-white">Full Name *</Label>
              <Input
                id="edit_full_name"
                value={formData.full_name}
                onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                className="bg-slate-800 border-slate-600 text-white"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_email" className="text-white">Email *</Label>
              <Input
                id="edit_email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                className="bg-slate-800 border-slate-600 text-white"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_phone" className="text-white">Phone *</Label>
              <Input
                id="edit_phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
                className="bg-slate-800 border-slate-600 text-white"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_title" className="text-white">Title</Label>
              <Input
                id="edit_title"
                value={formData.title}
                onChange={(e) => setFormData({...formData, title: e.target.value})}
                className="bg-slate-800 border-slate-600 text-white"
                placeholder="e.g., Investigator"
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowEditModal(false)}
                className="bg-slate-800 border-slate-600 text-white hover:bg-slate-700"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Change Primary Modal */}
      <Dialog open={showChangePrimaryModal} onOpenChange={setShowChangePrimaryModal}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Change Primary Contact</DialogTitle>
            <DialogDescription className="text-slate-400">
              Select a contact to set as the new primary
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {departmentUsers.map((contact) => (
              <Button
                key={contact.id}
                variant="outline"
                onClick={() => handleChangePrimary(contact.id)}
                disabled={contact.is_primary || isSubmitting}
                className="w-full bg-slate-800 border-slate-600 text-white hover:bg-slate-700 justify-start"
              >
                {contact.full_name}
                {contact.is_primary && <Badge className="ml-auto bg-blue-600/20 text-blue-300">Current</Badge>}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-slate-900 border-slate-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contact?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Are you sure you want to delete {selectedContact?.full_name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-600 text-white hover:bg-slate-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteContact}
              disabled={isSubmitting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}