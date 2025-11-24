import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Mail, User, Phone, MessageSquare, CheckCircle } from "lucide-react";

export default function InfoRequestModal({ open, onOpenChange }) {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    comment: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const newErrors = {};
    
    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    }
    
    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validate()) return;
    
    setIsSubmitting(true);
    
    try {
      await base44.entities.InfoRequest.create({
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim() || null,
        comment: formData.comment.trim() || null,
        followed_up: false,
        notes: ""
      });
      
      setIsSuccess(true);
      setFormData({ name: "", email: "", phone: "", comment: "" });
      setErrors({});
      
      setTimeout(() => {
        onOpenChange(false);
        setTimeout(() => setIsSuccess(false), 300);
      }, 2500);
      
    } catch (err) {
      console.error("Error submitting info request:", err);
      setErrors({ submit: "Failed to submit request. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onOpenChange(false);
      setTimeout(() => {
        setFormData({ name: "", email: "", phone: "", comment: "" });
        setErrors({});
        setIsSuccess(false);
      }, 300);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-[95vw] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Request More Information</DialogTitle>
          <DialogDescription className="text-slate-300 text-sm">
            Tell us a little about you and your department. We'll follow up with details and next steps.
          </DialogDescription>
        </DialogHeader>

        {isSuccess ? (
          <div className="py-8 text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-green-600/20 flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-400" />
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Thank you!</h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                We've received your request. Someone from the ClearQuest team will reach out shortly.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div>
              <Label className="text-sm text-slate-300 mb-1.5 flex items-center gap-2">
                <User className="w-4 h-4" />
                Name <span className="text-red-400">*</span>
              </Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="John Smith"
                className={`bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 ${
                  errors.name ? 'border-red-500' : ''
                }`}
              />
              {errors.name && (
                <p className="text-xs text-red-400 mt-1">{errors.name}</p>
              )}
            </div>

            <div>
              <Label className="text-sm text-slate-300 mb-1.5 flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Email <span className="text-red-400">*</span>
              </Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="john.smith@department.gov"
                className={`bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 ${
                  errors.email ? 'border-red-500' : ''
                }`}
              />
              {errors.email && (
                <p className="text-xs text-red-400 mt-1">{errors.email}</p>
              )}
            </div>

            <div>
              <Label className="text-sm text-slate-300 mb-1.5 flex items-center gap-2">
                <Phone className="w-4 h-4" />
                Phone <span className="text-xs text-slate-500">(optional)</span>
              </Label>
              <Input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="(555) 123-4567"
                className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
              />
            </div>

            <div>
              <Label className="text-sm text-slate-300 mb-1.5 flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Anything you'd like us to know? <span className="text-xs text-slate-500">(optional)</span>
              </Label>
              <Textarea
                value={formData.comment}
                onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                placeholder="Tell us about your department, timeline, or specific questions..."
                maxLength={1000}
                className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 min-h-20"
              />
              <p className="text-xs text-slate-500 mt-1 text-right">
                {formData.comment.length}/1000
              </p>
            </div>

            {errors.submit && (
              <div className="text-sm text-red-400 bg-red-950/30 border border-red-800/50 rounded-lg p-3">
                {errors.submit}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isSubmitting}
                className="flex-1 bg-slate-800 border-slate-600 text-white hover:bg-slate-700"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                {isSubmitting ? "Submitting..." : "Submit"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}