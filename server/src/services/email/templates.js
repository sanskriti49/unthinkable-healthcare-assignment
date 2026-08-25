import { formatForHumans } from '../../lib/time.js';
import { env } from '../../config/env.js';

/**
 * Email bodies. Plain, self-contained HTML — no external assets, so they render
 * the same in every client and can be diffed in review.
 */

const shell = (title, bodyHtml) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:24px;background:#f4f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2933;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px;border:1px solid #e4e7eb;">
    <h1 style="margin:0 0 16px;font-size:20px;color:#0f766e;">${escapeHtml(title)}</h1>
    ${bodyHtml}
    <hr style="border:none;border-top:1px solid #e4e7eb;margin:24px 0;">
    <p style="margin:0;font-size:12px;color:#7b8794;">
      This is an automated message from the clinic appointment system.
      Times shown are ${escapeHtml(env.clinicTimezone)}.
    </p>
  </div>
</body></html>`;

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const p = (text) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;">${text}</p>`;

const detailTable = (rows) => `
<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
  ${rows
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 0;color:#7b8794;width:38%;">${escapeHtml(k)}</td>
             <td style="padding:6px 0;font-weight:600;">${escapeHtml(v)}</td></tr>`
    )
    .join('')}
</table>`;

const bullets = (items) =>
  items?.length
    ? `<ul style="margin:0 0 12px;padding-left:20px;font-size:15px;line-height:1.6;">${items
        .map((i) => `<li>${escapeHtml(i)}</li>`)
        .join('')}</ul>`
    : '';

/**
 * Each template returns { subject, html }. `templates` is keyed by the
 * template name persisted on EmailLog, so a dead-lettered email can be
 * re-rendered and resent later.
 */
export const templates = {
  appointment_confirmed_patient: ({ patientName, doctorName, specialisation, startsAt, roomNumber }) => ({
    subject: `Appointment confirmed — ${doctorName}, ${formatForHumans(new Date(startsAt))}`,
    html: shell(
      'Your appointment is confirmed',
      p(`Hello ${escapeHtml(patientName)}, your appointment has been booked.`) +
        detailTable([
          ['Doctor', doctorName],
          ['Specialisation', specialisation],
          ['When', formatForHumans(new Date(startsAt))],
          ['Room', roomNumber],
        ]) +
        p('Please arrive 10 minutes early. You can reschedule or cancel from your patient portal.')
    ),
  }),

  appointment_confirmed_doctor: ({ doctorName, patientName, startsAt, symptoms }) => ({
    subject: `New booking — ${patientName}, ${formatForHumans(new Date(startsAt))}`,
    html: shell(
      'New appointment booked',
      p(`Dr ${escapeHtml(doctorName)}, a new appointment has been added to your schedule.`) +
        detailTable([
          ['Patient', patientName],
          ['When', formatForHumans(new Date(startsAt))],
          ['Reported symptoms', symptoms],
        ]) +
        p('A pre-visit summary will appear in your portal shortly before the consultation.')
    ),
  }),

  appointment_reminder: ({ recipientName, otherPartyName, startsAt, isDoctor }) => ({
    subject: `Reminder — appointment ${formatForHumans(new Date(startsAt))}`,
    html: shell(
      'Appointment reminder',
      p(`Hello ${escapeHtml(recipientName)}, this is a reminder of your upcoming appointment.`) +
        detailTable([
          [isDoctor ? 'Patient' : 'Doctor', otherPartyName],
          ['When', formatForHumans(new Date(startsAt))],
        ])
    ),
  }),

  appointment_cancelled: ({ recipientName, otherPartyName, startsAt, reason, rebookUrl }) => ({
    subject: `Appointment cancelled — ${formatForHumans(new Date(startsAt))}`,
    html: shell(
      'Appointment cancelled',
      p(`Hello ${escapeHtml(recipientName)}, the appointment below has been cancelled.`) +
        detailTable([
          ['With', otherPartyName],
          ['Was scheduled for', formatForHumans(new Date(startsAt))],
          ['Reason', reason],
        ]) +
        (rebookUrl
          ? p(
              `<a href="${escapeHtml(rebookUrl)}" style="color:#0f766e;font-weight:600;">Book another slot</a>`
            )
          : '')
    ),
  }),

  /**
   * Sent when a doctor is marked on leave for a date that already had
   * bookings. Deliberately apologetic and action-oriented: it names the next
   * available slots so the patient can rebook in one step.
   */
  doctor_leave_cancellation: ({ patientName, doctorName, startsAt, reason, alternatives, rebookUrl }) => ({
    subject: `Important — your appointment with ${doctorName} needs rescheduling`,
    html: shell(
      'Your appointment needs rescheduling',
      p(
        `Hello ${escapeHtml(patientName)}, we are sorry — Dr ${escapeHtml(
          doctorName
        )} is unavailable on the date of your appointment, so it has been cancelled.`
      ) +
        detailTable([
          ['Was scheduled for', formatForHumans(new Date(startsAt))],
          ['Reason', reason || 'Doctor on leave'],
        ]) +
        (alternatives?.length
          ? p('<strong>Next available slots:</strong>') +
            bullets(alternatives.map((a) => formatForHumans(new Date(a))))
          : p('Please visit your portal to choose a new time.')) +
        (rebookUrl
          ? p(`<a href="${escapeHtml(rebookUrl)}" style="color:#0f766e;font-weight:600;">Rebook now</a>`)
          : '')
    ),
  }),

  appointment_rescheduled: ({ recipientName, otherPartyName, oldStartsAt, newStartsAt }) => ({
    subject: `Appointment moved to ${formatForHumans(new Date(newStartsAt))}`,
    html: shell(
      'Appointment rescheduled',
      p(`Hello ${escapeHtml(recipientName)}, your appointment has been moved.`) +
        detailTable([
          ['With', otherPartyName],
          ['Previously', formatForHumans(new Date(oldStartsAt))],
          ['Now', formatForHumans(new Date(newStartsAt))],
        ])
    ),
  }),

  medication_reminder: ({ patientName, medicationName, dosage, instructions, doctorName }) => ({
    subject: `Time for your ${medicationName}`,
    html: shell(
      'Medication reminder',
      p(`Hello ${escapeHtml(patientName)}, it is time to take your medication.`) +
        detailTable([
          ['Medication', medicationName],
          ['Dose', dosage],
          ['Instructions', instructions],
          ['Prescribed by', doctorName],
        ]) +
        p('If you are experiencing side effects, contact your doctor before the next dose.')
    ),
  }),

  visit_summary_ready: ({ patientName, doctorName, visitDate, summary, portalUrl }) => ({
    subject: `Your visit summary from ${doctorName}`,
    html: shell(
      'Your visit summary is ready',
      p(`Hello ${escapeHtml(patientName)}, here is a summary of your consultation.`) +
        detailTable([
          ['Doctor', doctorName],
          ['Visit date', formatForHumans(new Date(visitDate))],
        ]) +
        (summary ? p(escapeHtml(summary)) : '') +
        (portalUrl
          ? p(
              `<a href="${escapeHtml(portalUrl)}" style="color:#0f766e;font-weight:600;">View full summary and medication schedule</a>`
            )
          : '')
    ),
  }),

  welcome: ({ fullName, role }) => ({
    subject: 'Welcome to the clinic portal',
    html: shell(
      'Welcome',
      p(`Hello ${escapeHtml(fullName)}, your ${escapeHtml(role.toLowerCase())} account is ready.`) +
        p('You can now sign in to book and manage appointments.')
    ),
  }),
};

/** Render a template by name. Throws on unknown names — callers use constants. */
export function render(template, data) {
  const fn = templates[template];
  if (!fn) throw new Error(`Unknown email template: ${template}`);
  return fn(data ?? {});
}
