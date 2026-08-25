import { useState } from 'react';
import { api } from '../../lib/api.js';
import { ErrorBanner, Field } from '../../components/ui.jsx';

/**
 * Records the consultation.
 *
 * The patient-facing summary and the medication reminders are generated in the
 * background from this input, so the doctor is never left waiting on a model
 * call — submitting returns as soon as the notes are saved.
 */
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

      <Field label="Consultation notes" required hint="Clinical notes. The patient sees a plain-language summary, not this text.">
        <textarea
          required
          rows={4}
          minLength={5}
          className="input"
          value={form.doctorNotes}
          onChange={set('doctorNotes')}
          placeholder="Examination findings, assessment, plan…"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Diagnosis">
          <input className="input" value={form.diagnosis} onChange={set('diagnosis')} placeholder="e.g. Viral URTI" />
        </Field>
        <Field label="Follow up in (days)">
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
        label="Prescription"
        hint="One medicine per line. Standard notation is understood — e.g. “Amoxicillin 500mg 1-0-1 x 5 days after food”. Reminders are scheduled from this."
      >
        <textarea
          rows={4}
          className="input font-mono text-sm"
          value={form.prescriptionText}
          onChange={set('prescriptionText')}
          placeholder={'Amoxicillin 500mg 1-0-1 x 5 days after food\nParacetamol 650mg TDS for 3 days'}
        />
      </Field>

      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Complete consultation'}
        </button>
        <button type="button" className="btn-secondary" onClick={onDone} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
