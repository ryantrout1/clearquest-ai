import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";

const AVAILABLE_PACKS = [
  'PACK_LE_APPS', 'PACK_WITHHOLD_INFO', 'PACK_DISQUALIFIED', 'PACK_CHEATING',
  'PACK_DUI', 'PACK_DUI_STOP', 'PACK_DUI_ARREST', 'PACK_LICENSE_SUSPENSION',
  'PACK_LICENSE_SUSPENDED', 'PACK_REVOKED_LICENSE', 'PACK_SUSPENDED_LICENSE',
  'PACK_RECKLESS_DRIVING', 'PACK_TRAFFIC', 'PACK_TRAFFIC_CITATION', 'PACK_CRIMINAL_TRAFFIC',
  'PACK_TRAFFIC_ARREST', 'PACK_ROAD_RAGE', 'PACK_OTHER_DRIVING',
  'PACK_COLLISION', 'PACK_COLLISION_INJURY', 'PACK_ALCOHOL_COLLISION',
  'PACK_UNREPORTED_COLLISION', 'PACK_HIT_RUN', 'PACK_HIT_RUN_DAMAGE',
  'PACK_NO_INSURANCE', 'PACK_INSURANCE_REFUSED', 'PACK_DRIVE_NO_INSURANCE',
  'PACK_ARREST', 'PACK_CHARGES', 'PACK_CRIMINAL_CHARGE', 'PACK_CONVICTION',
  'PACK_DIVERSION', 'PACK_PROBATION', 'PACK_INVESTIGATION', 'PACK_POLICE_CALLED',
  'PACK_FIGHT', 'PACK_DOMESTIC_VIOLENCE', 'PACK_PROTECTIVE_ORDER',
  'PACK_CHILD_CRIME_COMMITTED', 'PACK_CHILD_CRIME_ACCUSED', 'PACK_CHILD_PROTECTION',
  'PACK_SHOPLIFTING', 'PACK_THEFT_QUESTIONING', 'PACK_THEFT',
  'PACK_SIGNATURE_FORGERY', 'PACK_HACKING', 'PACK_ILLEGAL_DOWNLOADS',
  'PACK_STOLEN_PROPERTY', 'PACK_STOLEN_VEHICLE', 'PACK_TRESPASSING',
  'PACK_PROPERTY_DAMAGE', 'PACK_SERIOUS_INJURY', 'PACK_HATE_CRIME',
  'PACK_GANG', 'PACK_WEAPON_VIOLATION', 'PACK_ILLEGAL_WEAPON', 'PACK_CARRY_WEAPON',
  'PACK_WARRANT', 'PACK_FELONY', 'PACK_FELONY_DETAIL', 'PACK_CONSPIRACY',
  'PACK_PLANNED_CRIME', 'PACK_JUVENILE_CRIME', 'PACK_DELETED_SOCIAL_MEDIA',
  'PACK_PRANK_CRIME', 'PACK_UNCAUGHT_CRIME', 'PACK_IRS_INVESTIGATION',
  'PACK_UNREPORTED_INCOME', 'PACK_CRIME_FOR_DEBT', 'PACK_ILLEGAL_FIREWORKS',
  'PACK_FOREIGN_CRIME', 'PACK_POLICE_REPORT', 'PACK_LE_INTERVIEW',
  'PACK_ARRESTABLE_ACTIVITY', 'PACK_CRIMINAL_ASSOCIATES', 'PACK_CRIMINAL_ORGANIZATION',
  'PACK_STOLEN_GOODS', 'PACK_POLICE_BRUTALITY', 'PACK_DOMESTIC_VICTIM',
  'PACK_DOMESTIC_ACCUSED', 'PACK_OTHER_CRIMINAL',
  'PACK_EXTREMIST', 'PACK_EXTREMIST_DETAIL',
  'PACK_PROSTITUTION', 'PACK_PAID_SEX', 'PACK_PORNOGRAPHY',
  'PACK_HARASSMENT', 'PACK_ASSAULT', 'PACK_NON_CONSENT', 'PACK_MINOR_CONTACT',
  'PACK_FINANCIAL', 'PACK_BANKRUPTCY', 'PACK_FORECLOSURE', 'PACK_REPOSSESSION',
  'PACK_LAWSUIT', 'PACK_LATE_PAYMENT', 'PACK_GAMBLING',
  'PACK_DRUG_USE', 'PACK_DRUG_SALE', 'PACK_PRESCRIPTION_MISUSE',
  'PACK_ALCOHOL_DEPENDENCY', 'PACK_ALCOHOL_INCIDENT', 'PACK_PROVIDE_ALCOHOL',
  'PACK_MIL_SERVICE', 'PACK_MIL_REJECTION', 'PACK_MIL_DISCHARGE', 'PACK_MIL_DISCIPLINE',
  'PACK_DISCIPLINE', 'PACK_WORK_DISCIPLINE', 'PACK_FIRED', 'PACK_QUIT_AVOID',
  'PACK_DRUG_TEST_CHEAT', 'PACK_FALSE_APPLICATION', 'PACK_MISUSE_RESOURCES',
  'PACK_UNEMPLOYMENT_FRAUD',
  'PACK_LE_PREV', 'PACK_ACCUSED_FORCE', 'PACK_GRATUITY', 'PACK_FALSIFY_REPORT',
  'PACK_INTERNAL_AFFAIRS', 'PACK_LYING_LE', 'PACK_LE_COMPLAINT', 'PACK_OTHER_PRIOR_LE',
  'PACK_EMBARRASSMENT', 'PACK_TATTOO', 'PACK_SOCIAL_MEDIA', 'PACK_DOMESTIC'
];

export default function QuestionEditModal({ question, onClose, onSave }) {
  const [formData, setFormData] = useState({
    question_id: '',
    category: '',
    question_text: '',
    response_type: 'yes_no',
    display_order: 1,
    active: true,
    followup_pack: '',
    substance_name: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (question) {
      setFormData({
        question_id: question.question_id || '',
        category: question.category || '',
        question_text: question.question_text || '',
        response_type: question.response_type || 'yes_no',
        display_order: question.display_order || 1,
        active: question.active !== false,
        followup_pack: question.followup_pack || '',
        substance_name: question.substance_name || ''
      });
    }
  }, [question]);

  const validate = () => {
    const newErrors = {};
    
    if (!formData.question_text?.trim()) {
      newErrors.question_text = 'Question text is required';
    }
    if (!formData.category?.trim()) {
      newErrors.category = 'Category is required';
    }
    if (!formData.question_id?.trim()) {
      newErrors.question_id = 'Question ID is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    setIsSaving(true);
    try {
      const saveData = {
        question_id: formData.question_id.trim(),
        category: formData.category.trim(),
        question_text: formData.question_text.trim(),
        response_type: formData.response_type,
        display_order: parseInt(formData.display_order) || 1,
        active: formData.active,
        followup_pack: formData.followup_pack || null,
        substance_name: formData.substance_name || null
      };

      if (question?.id) {
        await base44.entities.Question.update(question.id, saveData);
      } else {
        await base44.entities.Question.create(saveData);
      }

      toast.success(question?.id ? 'Question updated' : 'Question created');
      onSave();
    } catch (err) {
      console.error('Error saving question:', err);
      toast.error('Failed to save question');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{question?.id ? 'Edit Question' : 'Add New Question'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="question_id" className="text-slate-300">Question ID</Label>
              <Input
                id="question_id"
                value={formData.question_id}
                onChange={(e) => setFormData({...formData, question_id: e.target.value.toUpperCase()})}
                placeholder="Q001"
                className="bg-slate-800 border-slate-600 text-white mt-1"
                disabled={!!question?.id}
              />
              {errors.question_id && <p className="text-xs text-red-400 mt-1">{errors.question_id}</p>}
            </div>

            <div>
              <Label htmlFor="display_order" className="text-slate-300">Display Order</Label>
              <Input
                id="display_order"
                type="number"
                value={formData.display_order}
                onChange={(e) => setFormData({...formData, display_order: e.target.value})}
                className="bg-slate-800 border-slate-600 text-white mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="category" className="text-slate-300">Section / Category</Label>
            <Input
              id="category"
              value={formData.category}
              onChange={(e) => setFormData({...formData, category: e.target.value})}
              placeholder="e.g., Criminal Involvement / Police Contacts"
              className="bg-slate-800 border-slate-600 text-white mt-1"
            />
            {errors.category && <p className="text-xs text-red-400 mt-1">{errors.category}</p>}
          </div>

          <div>
            <Label htmlFor="question_text" className="text-slate-300">Question Text</Label>
            <Textarea
              id="question_text"
              value={formData.question_text}
              onChange={(e) => setFormData({...formData, question_text: e.target.value})}
              placeholder="Enter the question text..."
              className="bg-slate-800 border-slate-600 text-white mt-1 min-h-24"
            />
            {errors.question_text && <p className="text-xs text-red-400 mt-1">{errors.question_text}</p>}
          </div>

          <div>
            <Label htmlFor="response_type" className="text-slate-300">Response Type</Label>
            <Select value={formData.response_type} onValueChange={(v) => setFormData({...formData, response_type: v})}>
              <SelectTrigger className="bg-slate-800 border-slate-600 text-white mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes_no">Yes/No</SelectItem>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="multi_select">Multi-Select</SelectItem>
                <SelectItem value="date">Date</SelectItem>
                <SelectItem value="number">Number</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="followup_pack" className="text-slate-300 flex items-center gap-2">
              Follow-Up Pack
              {formData.response_type === 'yes_no' && !formData.followup_pack && (
                <span className="text-xs text-yellow-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Recommended for Yes/No questions
                </span>
              )}
            </Label>
            <Select value={formData.followup_pack} onValueChange={(v) => setFormData({...formData, followup_pack: v})}>
              <SelectTrigger className="bg-slate-800 border-slate-600 text-white mt-1">
                <SelectValue placeholder="Select a follow-up pack (optional)" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value={null}>None</SelectItem>
                {AVAILABLE_PACKS.map(pack => (
                  <SelectItem key={pack} value={pack}>{pack}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="substance_name" className="text-slate-300">
              Substance Name (for drug questions only)
            </Label>
            <Input
              id="substance_name"
              value={formData.substance_name}
              onChange={(e) => setFormData({...formData, substance_name: e.target.value})}
              placeholder="e.g., Marijuana, Cocaine"
              className="bg-slate-800 border-slate-600 text-white mt-1"
            />
            <p className="text-xs text-slate-400 mt-1">
              Used to inject substance name into PACK_DRUG_USE prompts
            </p>
          </div>

          <div className="flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-lg p-3">
            <Label htmlFor="active" className="text-slate-300">Active</Label>
            <Switch
              id="active"
              checked={formData.active}
              onCheckedChange={(checked) => setFormData({...formData, active: checked})}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-slate-700">
          <Button variant="outline" onClick={onClose} className="bg-slate-800 border-slate-600 text-slate-200">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700">
            {isSaving ? 'Saving...' : 'Save Question'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}