import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  DialogFooter,
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
import { GripVertical, Plus, Edit, Trash2, Database, X } from "lucide-react";
import { toast } from "sonner";
import CollapsibleSection from "./CollapsibleSection";

const INPUT_TYPE_OPTIONS = [
  { value: "short_text", label: "Short text" },
  { value: "long_text", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "choice", label: "Choice list" },
  { value: "boolean", label: "Yes / No" },
];

const INPUT_TYPE_LABELS = {
  short_text: "Short text",
  long_text: "Long text",
  number: "Number",
  date: "Date",
  choice: "Choice list",
  boolean: "Yes / No",
};

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function labelToFieldKey(label) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50);
}

function isValidFieldKey(key) {
  // Allow uppercase since we normalize to lowercase before saving
  return /^[a-zA-Z0-9_]+$/.test(key) && key.length > 0;
}

const emptyField = {
  id: '',
  order: 0,
  fieldKey: '',
  label: '',
  semanticType: '',
  inputType: 'short_text',
  required: false,
  allowUnknown: false,
  unknownLabel: 'Unknown / Not sure',
  helperText: '',
  exampleValue: '',
  choices: [],
  validationRule: '',
  aiProbeHint: '',
};

export default function FollowUpFieldDesigner({ pack, onSaveFields, isExpanded, onToggleExpand }) {
  const [fields, setFields] = useState(pack?.field_config || []);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [deleteConfirmField, setDeleteConfirmField] = useState(null);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [fieldKeyManuallyEdited, setFieldKeyManuallyEdited] = useState(false);

  // Sync fields when pack changes
  React.useEffect(() => {
    setFields(pack?.field_config || []);
  }, [pack?.id, pack?.field_config]);

  const sortedFields = [...fields].sort((a, b) => (a.order || 0) - (b.order || 0));

  const handleOpenAddModal = () => {
    setEditingField({ ...emptyField, id: generateUUID(), order: fields.length });
    setFieldKeyManuallyEdited(false);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (field) => {
    setEditingField({ ...field });
    setFieldKeyManuallyEdited(true);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingField(null);
  };

  const handleLabelChange = (value) => {
    setEditingField(prev => ({
      ...prev,
      label: value,
      fieldKey: fieldKeyManuallyEdited ? prev.fieldKey : labelToFieldKey(value)
    }));
  };

  const handleFieldKeyChange = (value) => {
    setFieldKeyManuallyEdited(true);
    setEditingField(prev => ({ ...prev, fieldKey: value }));
  };

  const handleSaveField = async () => {
    console.log('[FIELD-SAVE] handleSaveField called', { editingField });
    
    if (!editingField) {
      console.error('[FIELD-SAVE] No editingField');
      toast.error('No field to save');
      return;
    }
    
    if (!editingField.label.trim()) {
      console.log('[FIELD-SAVE] Validation failed: label required');
      toast.error('Label is required');
      return;
    }
    if (!editingField.fieldKey.trim()) {
      console.log('[FIELD-SAVE] Validation failed: fieldKey required');
      toast.error('Field Key is required');
      return;
    }
    
    // Normalize fieldKey to lowercase
    const normalizedFieldKey = editingField.fieldKey.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const fieldToSave = { ...editingField, fieldKey: normalizedFieldKey };
    
    if (!isValidFieldKey(normalizedFieldKey)) {
      console.log('[FIELD-SAVE] Validation failed: invalid fieldKey', normalizedFieldKey);
      toast.error('Field Key must contain only lowercase letters, numbers, and underscores');
      return;
    }

    // Check for duplicate fieldKey
    const existingWithKey = fields.find(
      f => f.fieldKey === fieldToSave.fieldKey && f.id !== fieldToSave.id
    );
    if (existingWithKey) {
      console.log('[FIELD-SAVE] Validation failed: duplicate fieldKey');
      toast.error('A field with this key already exists');
      return;
    }

    let updatedFields;
    const existingIndex = fields.findIndex(f => f.id === fieldToSave.id);
    
    if (existingIndex >= 0) {
      updatedFields = [...fields];
      updatedFields[existingIndex] = fieldToSave;
    } else {
      updatedFields = [...fields, fieldToSave];
    }

    // Normalize order
    updatedFields = updatedFields
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((f, idx) => ({ ...f, order: idx }));

    console.log('[FIELD-SAVE] Saving fields', { count: updatedFields.length, updatedFields });

    try {
      setFields(updatedFields);
      console.log('[FIELD-SAVE] Calling onSaveFields...');
      const result = await onSaveFields(updatedFields);
      console.log('[FIELD-SAVE] onSaveFields returned', result);
      handleCloseModal();
      toast.success(existingIndex >= 0 ? 'Field updated' : 'Field added');
    } catch (err) {
      console.error('[FIELD-SAVE] Failed:', err);
      toast.error('Failed to save field: ' + (err.message || 'Unknown error'));
    }
  };

  const handleDeleteField = async () => {
    if (!deleteConfirmField) return;
    
    let updatedFields = fields.filter(f => f.id !== deleteConfirmField.id);
    updatedFields = updatedFields.map((f, idx) => ({ ...f, order: idx }));
    
    setFields(updatedFields);
    await onSaveFields(updatedFields);
    setDeleteConfirmField(null);
    toast.success('Field deleted');
  };

  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    
    const newFields = [...sortedFields];
    const draggedItem = newFields[draggedIndex];
    newFields.splice(draggedIndex, 1);
    newFields.splice(index, 0, draggedItem);
    
    const reorderedFields = newFields.map((f, idx) => ({ ...f, order: idx }));
    setFields(reorderedFields);
    setDraggedIndex(index);
  };

  const handleDragEnd = async () => {
    if (draggedIndex !== null) {
      await onSaveFields(fields);
    }
    setDraggedIndex(null);
  };

  const handleAddChoice = () => {
    setEditingField(prev => ({
      ...prev,
      choices: [...(prev.choices || []), '']
    }));
  };

  const handleChoiceChange = (index, value) => {
    setEditingField(prev => {
      const newChoices = [...(prev.choices || [])];
      newChoices[index] = value;
      return { ...prev, choices: newChoices };
    });
  };

  const handleRemoveChoice = (index) => {
    setEditingField(prev => ({
      ...prev,
      choices: (prev.choices || []).filter((_, i) => i !== index)
    }));
  };

  // Build pills
  const pills = [
    { label: `${fields.length} field${fields.length !== 1 ? 's' : ''}`, className: 'bg-amber-500/20 text-amber-300' }
  ];
  if (fields.length > 0) {
    const mappedCount = fields.filter(f => f.semanticType || f.aiProbeHint).length;
    if (mappedCount === fields.length) {
      pills.push({ label: 'Mapped', className: 'bg-emerald-500/20 text-emerald-300' });
    } else if (mappedCount > 0) {
      pills.push({ label: `${mappedCount}/${fields.length} Mapped`, className: 'bg-slate-700/50 text-slate-300' });
    } else {
      pills.push({ label: 'Not Mapped', className: 'bg-slate-700/50 text-slate-400' });
    }
  }

  return (
    <>
      <CollapsibleSection
        title="Follow-Up Fields"
        subtitle="Defines the structured data fields extracted from candidate answers for investigator review and risk scoring"
        icon={Database}
        iconColor="text-amber-400"
        bgColor="bg-amber-950/20"
        borderColor="border-amber-500/30"
        isExpanded={isExpanded}
        onToggleExpand={onToggleExpand}
        pills={pills}
        editable={false}
      >
        {/* Add Button */}
        <div className="mb-3">
          <Button
            onClick={handleOpenAddModal}
            size="sm"
            className="bg-amber-600 hover:bg-amber-700"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Field
          </Button>
        </div>

        {/* Fields Table */}
        {sortedFields.length === 0 && (
          <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6 text-center">
            <Database className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-400 mb-3">No fields configured yet.</p>
            <Button
              onClick={handleOpenAddModal}
              size="sm"
              variant="outline"
              className="border-amber-500/50 text-amber-300 hover:bg-amber-500/10"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add your first field
            </Button>
          </div>
        )}
        {sortedFields.length > 0 && (
          <div className="space-y-2">
          {sortedFields.map((field, index) => (
            <div
              key={field.id}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={`bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 flex items-center gap-2 cursor-grab active:cursor-grabbing transition-all ${
                draggedIndex === index ? 'opacity-50 border-amber-500' : 'hover:border-slate-600'
              }`}
            >
              {/* Drag Handle */}
              <div className="flex-shrink-0 text-slate-500 hover:text-slate-300">
                <GripVertical className="w-4 h-4" />
              </div>

              {/* Label */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{field.label}</p>
              </div>

              {/* Badges */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Badge variant="outline" className="border-slate-600 text-slate-400 text-[11px] font-normal">
                  {field.fieldKey}
                </Badge>
                <Badge variant="outline" className="border-slate-600 text-slate-300 text-[11px] font-normal">
                  {INPUT_TYPE_LABELS[field.inputType] || field.inputType}
                </Badge>
                {field.required && (
                  <Badge className="bg-orange-500/20 border-orange-500/50 text-orange-400 text-[11px]">
                    Required
                  </Badge>
                )}
                {field.allowUnknown && (
                  <Badge className="bg-slate-700/50 border-slate-600 text-slate-300 text-[11px]">
                    Unknown: "{field.unknownLabel || 'Not recalled'}"
                  </Badge>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleOpenEditModal(field)}
                  className="h-7 w-7 p-0 text-slate-400 hover:text-white"
                >
                  <Edit className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDeleteConfirmField(field)}
                  className="h-7 w-7 p-0 text-red-400 hover:text-red-300"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
          </div>
        )}
      </CollapsibleSection>

      {/* Add/Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingField && fields.find(f => f.id === editingField.id)
                ? 'Edit Follow-Up Field'
                : 'Add Follow-Up Field'}
            </DialogTitle>
          </DialogHeader>

          {editingField && (
            <div className="space-y-5 py-4">
              {/* Label */}
              <div className="space-y-2">
                <Label className="text-sm text-slate-300">
                  Label <span className="text-red-400">*</span>
                </Label>
                <Input
                  value={editingField.label}
                  onChange={(e) => handleLabelChange(e.target.value)}
                  placeholder="e.g., Agency name"
                  className="bg-slate-800 border-slate-600 text-white"
                />
                <p className="text-xs text-slate-500">This is what admins and investigators see.</p>
              </div>

              {/* Field Key */}
              <div className="space-y-2">
                <Label className="text-sm text-slate-300">
                  Field Key <span className="text-red-400">*</span>
                </Label>
                <Input
                  value={editingField.fieldKey}
                  onChange={(e) => handleFieldKeyChange(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="e.g., agency_name"
                  className="bg-slate-800 border-slate-600 text-white font-mono"
                />
                {editingField.fieldKey && !isValidFieldKey(editingField.fieldKey) && (
                  <p className="text-xs text-red-400">Only lowercase letters, numbers, and underscores allowed.</p>
                )}
              </div>

              {/* Semantic Type */}
              <div className="space-y-2">
                <Label className="text-sm text-slate-300">Semantic Type</Label>
                <Input
                  value={editingField.semanticType}
                  onChange={(e) => setEditingField({...editingField, semanticType: e.target.value})}
                  placeholder="e.g., agency_name, discipline_reason, approx_date"
                  className="bg-slate-800 border-slate-600 text-white"
                />
                <p className="text-xs text-slate-500">
                  Short tag used by AI to understand what this field represents.
                </p>
              </div>

              {/* Input Type */}
              <div className="space-y-2">
                <Label className="text-sm text-slate-300">
                  Input Type <span className="text-red-400">*</span>
                </Label>
                <Select
                  value={editingField.inputType}
                  onValueChange={(v) => setEditingField({...editingField, inputType: v})}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INPUT_TYPE_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Choices (only for choice type) */}
              {editingField.inputType === 'choice' && (
                <div className="space-y-2">
                  <Label className="text-sm text-slate-300">Choices</Label>
                  <div className="space-y-2">
                    {(editingField.choices || []).map((choice, idx) => (
                      <div key={idx} className="flex gap-2">
                        <Input
                          value={choice}
                          onChange={(e) => handleChoiceChange(idx, e.target.value)}
                          placeholder={`Choice ${idx + 1}`}
                          className="bg-slate-800 border-slate-600 text-white"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveChoice(idx)}
                          className="h-10 w-10 p-0 text-red-400 hover:text-red-300"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleAddChoice}
                      className="border-slate-600 text-slate-300"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Choice
                    </Button>
                  </div>
                </div>
              )}

              {/* Required Toggle */}
              <div className="flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                <div>
                  <Label className="text-sm text-slate-300">Required</Label>
                  <p className="text-xs text-slate-500">This field is required for this incident type.</p>
                </div>
                <Switch
                  checked={editingField.required}
                  onCheckedChange={(checked) => setEditingField({...editingField, required: checked})}
                  className="data-[state=checked]:bg-orange-600"
                />
              </div>

              {/* Allow Unknown Toggle */}
              <div className="space-y-2">
                <div className="flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                  <div>
                    <Label className="text-sm text-slate-300">Allow Unknown</Label>
                    <p className="text-xs text-slate-500">Interviewer can mark "Unknown / Not sure".</p>
                  </div>
                  <Switch
                    checked={editingField.allowUnknown}
                    onCheckedChange={(checked) => setEditingField({...editingField, allowUnknown: checked})}
                    className="data-[state=checked]:bg-blue-600"
                  />
                </div>
                {editingField.allowUnknown && (
                  <Input
                    value={editingField.unknownLabel}
                    onChange={(e) => setEditingField({...editingField, unknownLabel: e.target.value})}
                    placeholder="Unknown / Not sure"
                    className="bg-slate-800 border-slate-600 text-white"
                  />
                )}
              </div>

              {/* Helper Text */}
              <div className="space-y-2">
                <Label className="text-sm text-slate-300">Helper Text</Label>
                <Textarea
                  value={editingField.helperText}
                  onChange={(e) => setEditingField({...editingField, helperText: e.target.value})}
                  placeholder="Short hint to guide the candidate or interviewer"
                  className="bg-slate-800 border-slate-600 text-white min-h-16"
                />
                <p className="text-xs text-slate-500">
                  Short hint to guide the candidate or interviewer (e.g., "Include agency and state").
                </p>
              </div>

              {/* Example Value */}
              <div className="space-y-2">
                <Label className="text-sm text-slate-300">Example Value</Label>
                <Input
                  value={editingField.exampleValue}
                  onChange={(e) => setEditingField({...editingField, exampleValue: e.target.value})}
                  placeholder="e.g., Los Angeles Police Department"
                  className="bg-slate-800 border-slate-600 text-white"
                />
                <p className="text-xs text-slate-500">Used only for configuration and AI prompt examples.</p>
              </div>

              {/* Validation Rule */}
              <div className="space-y-2">
                <Label className="text-sm text-slate-300">Validation Rule</Label>
                <Input
                  value={editingField.validationRule}
                  onChange={(e) => setEditingField({...editingField, validationRule: e.target.value})}
                  placeholder="e.g., Must be a four-digit year"
                  className="bg-slate-800 border-slate-600 text-white"
                />
                <p className="text-xs text-slate-500">
                  Plain-English validation rule. This is for future use with AI and validation.
                </p>
              </div>

              {/* AI Probe Hint */}
              <div className="space-y-2">
                <Label className="text-sm text-slate-300">AI Probe Hint</Label>
                <Textarea
                  value={editingField.aiProbeHint}
                  onChange={(e) => setEditingField({...editingField, aiProbeHint: e.target.value})}
                  placeholder="e.g., Ask which department and what state this agency is located in"
                  className="bg-slate-800 border-slate-600 text-white min-h-16"
                />
                <p className="text-xs text-slate-500">
                  Short note to guide AI probing when this field is incomplete or unclear.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCloseModal} className="border-slate-600 text-slate-300">
              Cancel
            </Button>
            <Button 
              type="button" 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[FIELD-SAVE] Button clicked');
                handleSaveField();
              }} 
              className="bg-amber-600 hover:bg-amber-700"
            >
              Save Field
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmField} onOpenChange={() => setDeleteConfirmField(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete field?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This will remove this field from the pack configuration. It will not affect previously captured interviews, but AI behavior using this field may change in future versions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-600 text-slate-300">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteField} className="bg-red-600 hover:bg-red-700">
              Delete field
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}