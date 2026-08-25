import React, { useState } from 'react';
import { api } from '../../lib/api.js';
import { ErrorBanner, Field } from '../../components/ui.jsx';
import { FileText, Pill, Sparkles, CheckCircle2, ArrowRight } from 'lucide-react';

const RX_PRESETS = [
  'Amoxicillin 500mg 1-0-1 x 5 days after food',
  'Paracetamol 650mg TDS for 3 days as needed',
  'Cetirizine 10mg 0-0-1 at bedtime for 5 days',
  'Pantoprazole 40mg 1-0-0 before breakfast for 7 days',
  'Azithromycin 500mg OD for 3 days',
];

export default function ConsultationForm({ appointment, onDone }) {
  const [form, setForm] = useState({
    doctorNotes: appointment.visitNote?.doctorNotes ?? '',
    diagnosis: appointment.visitNote?.diagnosis ?? '',
    prescriptionText: appointment.visitNote?.prescriptionText ?? '',
    followUpInDays: appointment.visitNote?.followUpInDays ?? '',
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const addRxPreset = (preset) => {
    setForm((prev) => ({
      ...prev,
      prescriptionText: prev.prescriptionText
        ? `${prev.prescriptionText}\n${preset}`
        : preset,
    }));
  };

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/doctor/appointments/${appointment.id}/complete`, {
        doctorNotes: form.doctorNotes.trim(),
        diagnosis: form.diagnosis.trim() || undefined,
        prescriptionText: form.prescriptionText.trim() || undefined,
        followUpInDays: form.followUpInDays === '' ? undefined : Number(form.followUpInDays),
      });
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorBanner error={error} />

      <Field
        label="Clinical Consultation Notes"
        required
        hint="Clinical assessment, observations and instructions. The patient receives a structured AI-generated summary, not this raw note."
      >
        <textarea
          required
          rows={3}
          minLength={5}
          className="input"
          value={form.doctorNotes}
          onChange={set('doctorNotes')}
          placeholder="E.g. Patient presents with mild pharyngitis and low-grade pyrexia. Throat examination shows mild erythema without exudates. Advised hydration, rest, and prescribed symptomatic relief."
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Clinical Diagnosis">
          <input
            className="input"
            value={form.diagnosis}
            onChange={set('diagnosis')}
            placeholder="e.g. Acute Viral Pharyngitis"
          />
        </Field>
        <Field label="Recommended Follow-up (in days)" hint="Triggers follow-up recommendation in patient care plan.">
          <input
            type="number"
            min={0}
            max={365}
            className="input"
            value={form.followUpInDays}
            onChange={set('followUpInDays')}
            placeholder="e.g. 7"
          />
        </Field>
      </div>

      <Field
        label="Prescription &amp; Dosage Instructions"
        hint="One medicine per line. Standard format (e.g. 1-0-1 x 5 days) is automatically parsed into dose reminders."
      >
        {/* Presets Chips */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <span className="text-2xs font-semibold text-slate-500">Insert preset:</span>
          {RX_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => addRxPreset(p)}
              className="rounded-full bg-white border border-teal-200 px-2 py-0.5 text-2xs font-medium text-teal-800 hover:bg-teal-50 transition-colors"
            >
              + {p.split(' ')[0]}
            </button>
          ))}
        </div>

        <textarea
          rows={4}
          className="input font-mono text-xs"
          value={form.prescriptionText}
          onChange={set('prescriptionText')}
          placeholder={'Amoxicillin 500mg 1-0-1 x 5 days after food\nParacetamol 650mg TDS for 3 days as needed'}
        />
      </Field>

      <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200">
        <button type="button" className="btn-secondary text-xs" onClick={onDone} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn-primary text-xs" disabled={busy}>
          {busy ? 'Saving & Generating Summary…' : 'Complete Consultation'}
          <CheckCircle2 className="w-4 h-4" />
        </button>
      </div>
    </form>
  );
}
