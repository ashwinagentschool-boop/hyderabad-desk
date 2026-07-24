import { useState } from 'react';
import type { Lead, LeadStatus } from '../adapters/types';
import { STATUS_LABEL, STATUS_ORDER } from '../lib/format';
import { optional, type LeadFormValues } from '../lib/leads';
import { useStore } from '../store';
import { useToast } from './Toast';
import { Button, Field, Modal, Select, TextArea, TextField } from './ui';

/* ------------------------------------------------------------------ *
 * Add / edit lead
 *
 * Shared by the Pipeline tab and the Reddit tab. The Reddit tab opens it
 * pre-filled from the classifier (areas, budget, property type) and hands
 * in its own `onSubmit` so saving also marks the post triaged.
 * ------------------------------------------------------------------ */

interface FormState {
  name: string;
  phone: string;
  requirement: string;
  budget: string;
  area: string;
  status: LeadStatus;
  followUpDate: string;
  notes: string;
}

function toForm(lead: Lead | null, prefill?: Partial<LeadFormValues>): FormState {
  return {
    name: lead?.name ?? prefill?.name ?? '',
    phone: lead?.phone ?? prefill?.phone ?? '',
    requirement: lead?.requirement ?? prefill?.requirement ?? '',
    budget: lead?.budget ?? prefill?.budget ?? '',
    area: lead?.area ?? prefill?.area ?? '',
    status: lead?.status ?? prefill?.status ?? 'new',
    followUpDate: lead?.followUpDate ?? prefill?.followUpDate ?? '',
    notes: lead?.notes ?? prefill?.notes ?? '',
  };
}

interface LeadModalProps {
  /** An existing lead to edit, or null to create one. */
  lead: Lead | null;
  /** Starting values when creating. Ignored when editing. */
  prefill?: Partial<LeadFormValues>;
  title?: string;
  submitLabel?: string;
  /** Read-only context shown above the form, e.g. the source post. */
  context?: React.ReactNode;
  /** Overrides the default create/update behaviour. */
  onSubmit?: (values: LeadFormValues) => Promise<void>;
  onClose: () => void;
}

export function LeadModal({
  lead,
  prefill,
  title,
  submitLabel,
  context,
  onSubmit,
  onClose,
}: LeadModalProps) {
  const createLead = useStore((s) => s.createLead);
  const updateLead = useStore((s) => s.updateLead);
  const showToast = useToast((s) => s.show);

  const [form, setForm] = useState<FormState>(() => toForm(lead, prefill));
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const nameError = form.name.trim() === '';
  const requirementError = form.requirement.trim() === '';
  const invalid = nameError || requirementError;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    setTouched(true);
    if (invalid) return;
    setSaving(true);
    try {
      const values: LeadFormValues = {
        name: form.name.trim(),
        phone: optional(form.phone),
        requirement: form.requirement.trim(),
        budget: optional(form.budget),
        area: optional(form.area),
        status: form.status,
        followUpDate: optional(form.followUpDate),
        notes: optional(form.notes),
      };

      if (onSubmit !== undefined) {
        await onSubmit(values);
      } else if (lead === null) {
        await createLead({ source: 'manual', ...values });
        showToast('Lead added');
      } else {
        await updateLead(lead.id, values);
        showToast('Lead updated');
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const heading = title ?? (lead === null ? 'Add lead' : 'Edit lead');
  const action = submitLabel ?? (lead === null ? 'Add lead' : 'Save changes');

  return (
    <Modal
      title={heading}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={() => void submit()}
            busy={saving}
          >
            {action}
          </Button>
        </div>
      }
    >
      <div className="grid gap-3.5">
        {context !== undefined ? context : null}

        <Field label="Name" required>
          <TextField
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Praveen Kumar"
            autoFocus
            aria-invalid={touched && nameError}
          />
          {touched && nameError ? (
            <span className="mt-1 block text-[12px] text-[var(--c-err)]">
              Name is required.
            </span>
          ) : null}
        </Field>

        <Field label="Phone">
          <TextField
            type="tel"
            inputMode="tel"
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            placeholder="+91 98490 11223"
          />
        </Field>

        <Field label="Requirement" required>
          <TextArea
            rows={3}
            value={form.requirement}
            onChange={(e) => set('requirement', e.target.value)}
            placeholder="3BHK, ready to move, near Gachibowli office"
            aria-invalid={touched && requirementError}
          />
          {touched && requirementError ? (
            <span className="mt-1 block text-[12px] text-[var(--c-err)]">
              Requirement is required.
            </span>
          ) : null}
        </Field>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Budget">
            <TextField
              value={form.budget}
              onChange={(e) => set('budget', e.target.value)}
              placeholder="1.3 - 1.5 Cr"
            />
          </Field>
          <Field label="Area">
            <TextField
              value={form.area}
              onChange={(e) => set('area', e.target.value)}
              placeholder="Gachibowli"
            />
          </Field>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Status">
            <Select
              value={form.status}
              onChange={(e) => set('status', e.target.value as LeadStatus)}
            >
              {STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABEL[status]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Follow-up date">
            <TextField
              type="date"
              value={form.followUpDate}
              onChange={(e) => set('followUpDate', e.target.value)}
            />
          </Field>
        </div>

        <Field label="Notes">
          <TextArea
            rows={3}
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Wife wants east facing. Call after 7pm."
          />
        </Field>
      </div>
    </Modal>
  );
}
