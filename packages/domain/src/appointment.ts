/**
 * Rendez-vous médicaux : validation de la saisie et export vers un agenda (iCalendar).
 * L'export .ics permet un vrai rappel par l'agenda du téléphone, sans service tiers.
 */
import { parseLocalDate, zonedTimeToUtc } from './time';

/** Rappels proposés (minutes avant le rendez-vous). */
export const REMINDER_OPTIONS: Record<string, string> = {
  '': 'Aucun',
  '60': '1 heure avant',
  '1440': 'La veille (24 h avant)',
  '2880': '2 jours avant',
};

export interface AppointmentInput {
  date: string; // AAAA-MM-JJ
  time: string; // HH:MM
  specialty?: string;
  practitioner?: string;
  location?: string;
  reason?: string;
  toPrepare?: string;
  reminder?: string;
  notesAfter?: string;
}

export type AppointmentErrors = Partial<Record<keyof AppointmentInput, string>>;

export interface ValidAppointment {
  startsAt: Date;
  specialty: string | null;
  practitioner: string | null;
  location: string | null;
  reason: string | null;
  toPrepare: string | null;
  reminderMinutes: number | null;
  notesAfter: string | null;
}

export function validateAppointment(
  input: AppointmentInput,
  now: Date,
  timeZone: string,
): { ok: true; value: ValidAppointment } | { ok: false; errors: AppointmentErrors } {
  const errors: AppointmentErrors = {};
  const d = parseLocalDate(input.date);
  const t = /^(\d{2}):(\d{2})$/.exec(input.time);
  let startsAt: Date | null = null;
  if (!d) errors.date = 'Indiquez la date du rendez-vous.';
  if (!t || Number(t[1]) > 23 || Number(t[2]) > 59) errors.time = 'Indiquez l’heure (HH:MM).';
  if (d && t) {
    startsAt = zonedTimeToUtc(d, Number(t[1]), Number(t[2]), timeZone);
    const days = (startsAt.getTime() - now.getTime()) / 86_400_000;
    if (days > 3 * 365) errors.date = 'Date trop lointaine (plus de 3 ans).';
    if (days < -5 * 365) errors.date = 'Date trop ancienne (plus de 5 ans).';
  }
  const text = (v: string | undefined, max: number, k: keyof AppointmentInput) => {
    const s = v?.trim() || null;
    if (s && s.length > max) errors[k] = `${max} caractères maximum.`;
    return s;
  };
  const specialty = text(input.specialty, 80, 'specialty');
  const practitioner = text(input.practitioner, 120, 'practitioner');
  const location = text(input.location, 200, 'location');
  const reason = text(input.reason, 300, 'reason');
  const toPrepare = text(input.toPrepare, 500, 'toPrepare');
  const notesAfter = text(input.notesAfter, 2000, 'notesAfter');
  if (!specialty && !practitioner) errors.specialty = 'Indiquez la spécialité ou le nom du professionnel.';
  const reminder = input.reminder ?? '';
  if (!(reminder in REMINDER_OPTIONS)) errors.reminder = 'Rappel invalide.';
  if (Object.keys(errors).length || !startsAt) return { ok: false, errors };
  return {
    ok: true,
    value: { startsAt, specialty, practitioner, location, reason, toPrepare, reminderMinutes: reminder ? Number(reminder) : null, notesAfter },
  };
}

// ───────────────────────── iCalendar (RFC 5545) ─────────────────────────
function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

const utf8 = new TextEncoder();

/** Coupe les lignes à 75 octets (règle iCalendar), sans casser un caractère UTF-8. */
function fold(line: string): string {
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (utf8.encode(cur + ch).length > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
    }
    cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export interface IcsAppointment {
  uid: string;
  startsAt: Date;
  durationMinutes?: number;
  title: string;
  location?: string | null;
  description?: string | null;
  reminderMinutes?: number | null;
  stamp: Date;
}

/** Fichier .ics d'un rendez-vous. Aucune donnée de santé au-delà de ce que l'utilisateur a saisi. */
export function buildIcs(a: IcsAppointment): string {
  const end = new Date(a.startsAt.getTime() + (a.durationMinutes ?? 30) * 60_000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BILANX//Rendez-vous//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${a.uid}@bilanx.fr`,
    `DTSTAMP:${icsDate(a.stamp)}`,
    `DTSTART:${icsDate(a.startsAt)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(a.title)}`,
    ...(a.location ? [`LOCATION:${icsEscape(a.location)}`] : []),
    ...(a.description ? [`DESCRIPTION:${icsEscape(a.description)}`] : []),
    ...(a.reminderMinutes
      ? ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(a.title)}`, `TRIGGER:-PT${a.reminderMinutes}M`, 'END:VALARM']
      : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
