/**
 * Rendez-vous médicaux : validation de la saisie et export vers un agenda (iCalendar).
 * L'export .ics permet un vrai rappel par l'agenda du téléphone, sans service tiers.
 */
import { addDays, parseLocalDate, zoneOffsetMs, zonedTimeToUtc } from './time';

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

// ───────────────────────── Rappels récurrents (traitements) ─────────────────────────
function offsetStr(ms: number): string {
  const m = Math.round(ms / 60_000);
  const a = Math.abs(m);
  return `${m < 0 ? '-' : '+'}${String(Math.floor(a / 60)).padStart(2, '0')}${String(a % 60).padStart(2, '0')}`;
}

function localStamp(instant: Date, offsetMs: number): string {
  return icsDate(new Date(instant.getTime() + offsetMs)).replace(/Z$/, '');
}

/**
 * Bloc VTIMEZONE déduit des changements d'heure de l'année `year` (règles annuelles « n-ième
 * dimanche du mois »). Suffisant pour les fuseaux européens ; un fuseau sans heure d'été donne
 * un seul bloc STANDARD.
 */
function vtimezone(timeZone: string, year: number): string[] {
  const at = (ms: number) => zoneOffsetMs(new Date(ms), timeZone);
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  const transitions: { instant: Date; from: number; to: number }[] = [];
  let prev = at(start);
  for (let t = start + 86_400_000; t <= end; t += 86_400_000) {
    const cur = at(t);
    if (cur !== prev) {
      // Affinage à l'heure près dans les 24 h précédentes.
      let h = t - 86_400_000;
      while (at(h) === prev) h += 3_600_000;
      transitions.push({ instant: new Date(h), from: prev, to: cur });
      prev = cur;
    }
  }
  const out = ['BEGIN:VTIMEZONE', `TZID:${timeZone}`];
  if (!transitions.length) {
    const o = offsetStr(prev);
    out.push('BEGIN:STANDARD', `DTSTART:${year}0101T000000`, `TZOFFSETFROM:${o}`, `TZOFFSETTO:${o}`, 'END:STANDARD');
  }
  for (const tr of transitions) {
    const local = new Date(tr.instant.getTime() + tr.from);
    const day = local.getUTCDate();
    const daysInMonth = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0)).getUTCDate();
    const nth = day + 7 > daysInMonth ? -1 : Math.ceil(day / 7);
    const wd = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][local.getUTCDay()];
    const kind = tr.to > tr.from ? 'DAYLIGHT' : 'STANDARD';
    out.push(
      `BEGIN:${kind}`,
      `DTSTART:${localStamp(tr.instant, tr.from)}`,
      `TZOFFSETFROM:${offsetStr(tr.from)}`,
      `TZOFFSETTO:${offsetStr(tr.to)}`,
      `RRULE:FREQ=YEARLY;BYMONTH=${local.getUTCMonth() + 1};BYDAY=${nth}${wd}`,
      `END:${kind}`,
    );
  }
  out.push('END:VTIMEZONE');
  return out;
}

export interface RecurringIcsOptions {
  uidPrefix: string;
  title: string;
  description?: string | null;
  times: string[]; // HH:MM, heure locale
  startDate: string; // AAAA-MM-JJ
  endDate?: string | null;
  timeZone: string;
  stamp: Date;
}

/**
 * Rappels quotidiens (un événement récurrent par horaire), à l'heure locale du fuseau,
 * jusqu'à la fin de `endDate` incluse. Alarme à l'heure de la prise.
 */
export function buildRecurringIcs(o: RecurringIcsOptions): string {
  const start = parseLocalDate(o.startDate);
  if (!start) throw new Error('startDate invalide');
  const end = o.endDate ? parseLocalDate(o.endDate) : null;
  const until = end ? new Date(zonedTimeToUtc(addDays(end, 1), 0, 0, o.timeZone).getTime() - 1000) : null;
  const ymd = o.startDate.replace(/-/g, '');
  const events = o.times.flatMap((time) => {
    const hm = time.replace(':', '');
    return [
      'BEGIN:VEVENT',
      `UID:${o.uidPrefix}-${hm}@bilanx.fr`,
      `DTSTAMP:${icsDate(o.stamp)}`,
      `DTSTART;TZID=${o.timeZone}:${ymd}T${hm}00`,
      'DURATION:PT5M',
      `RRULE:FREQ=DAILY${until ? `;UNTIL=${icsDate(until)}` : ''}`,
      `SUMMARY:${icsEscape(o.title)}`,
      ...(o.description ? [`DESCRIPTION:${icsEscape(o.description)}`] : []),
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsEscape(o.title)}`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
    ];
  });
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BILANX//Traitements//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...vtimezone(o.timeZone, start.year),
    ...events,
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
