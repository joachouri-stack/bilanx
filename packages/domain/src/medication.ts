/**
 * Médicaments : saisie du traitement PRESCRIT (jamais modifié par BILANX), prises prévues
 * par jour, suivi des prises et rappels via l'agenda du téléphone (.ics récurrent).
 */
import { addDays, compareLocalDates, formatLocalDate, parseLocalDate, zonedTimeToUtc, type LocalDate } from './time';

export interface ScheduleSlot {
  time: string; // HH:MM
  qty: string; // ex. « 1 comprimé »
}

export interface MedicationInput {
  name: string;
  strength?: string;
  posology: string;
  times?: string[]; // HH:MM
  qty?: string[];
  startDate?: string;
  endDate?: string;
  prescriber?: string;
}

export type MedicationErrors = Partial<Record<'name' | 'strength' | 'posology' | 'times' | 'startDate' | 'endDate' | 'prescriber', string>>;

export interface ValidMedication {
  name: string;
  strength: string | null;
  posology: string;
  schedule: ScheduleSlot[];
  startDate: string | null;
  endDate: string | null;
  prescriber: string | null;
}

export function validateMedication(input: MedicationInput): { ok: true; value: ValidMedication } | { ok: false; errors: MedicationErrors } {
  const errors: MedicationErrors = {};
  const name = input.name.trim();
  if (!name || name.length > 120) errors.name = 'Indiquez le nom du médicament (120 caractères maximum).';
  const posology = input.posology.trim();
  if (!posology || posology.length > 300) errors.posology = 'Recopiez la posologie prescrite (ex. « 1 comprimé matin et soir »).';
  const strength = input.strength?.trim() || null;
  if (strength && strength.length > 60) errors.strength = '60 caractères maximum.';
  const prescriber = input.prescriber?.trim() || null;
  if (prescriber && prescriber.length > 120) errors.prescriber = '120 caractères maximum.';

  const schedule: ScheduleSlot[] = [];
  (input.times ?? []).forEach((t, i) => {
    const time = t.trim();
    if (!time) return;
    const m = /^(\d{2}):(\d{2})$/.exec(time);
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) errors.times = 'Heure de prise invalide (HH:MM).';
    else schedule.push({ time, qty: (input.qty?.[i] ?? '').trim().slice(0, 40) });
  });
  schedule.sort((a, b) => a.time.localeCompare(b.time));
  if (new Set(schedule.map((s) => s.time)).size !== schedule.length) errors.times = 'Deux prises à la même heure : regroupez-les.';
  if (schedule.length > 8) errors.times = '8 prises par jour au maximum.';

  const startDate = input.startDate?.trim() || null;
  const endDate = input.endDate?.trim() || null;
  if (startDate && !parseLocalDate(startDate)) errors.startDate = 'Date de début invalide.';
  if (endDate && !parseLocalDate(endDate)) errors.endDate = 'Date de fin invalide.';
  if (startDate && endDate && endDate < startDate) errors.endDate = 'La date de fin précède la date de début.';
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name, strength, posology, schedule, startDate, endDate, prescriber } };
}

export interface MedicationForSchedule {
  id: string;
  schedule: ScheduleSlot[];
  startDate: string | null;
  endDate: string | null;
  stoppedOn?: string | null; // jour d'arrêt (exclu)
}

export interface PlannedDose {
  medicationId: string;
  at: Date;
  time: string;
  qty: string;
}

export function activeOn(m: MedicationForSchedule, day: LocalDate): boolean {
  const d = formatLocalDate(day);
  if (m.startDate && d < m.startDate) return false;
  if (m.endDate && d > m.endDate) return false;
  if (m.stoppedOn && d >= m.stoppedOn) return false;
  return true;
}

/** Prises prévues un jour donné (heures locales). Un traitement « si besoin » (sans heure) n'en a pas. */
export function plannedFor(meds: readonly MedicationForSchedule[], day: LocalDate, timeZone: string): PlannedDose[] {
  const out: PlannedDose[] = [];
  for (const m of meds) {
    if (!activeOn(m, day)) continue;
    for (const s of m.schedule) {
      const [h, mi] = s.time.split(':').map(Number) as [number, number];
      out.push({ medicationId: m.id, at: zonedTimeToUtc(day, h, mi, timeZone), time: s.time, qty: s.qty });
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export interface IntakeRecord {
  medicationId: string;
  scheduledAt: Date;
  status: 'taken' | 'skipped';
}

export interface Adherence {
  planned: number; // prises prévues passées
  taken: number;
  skipped: number;
  /** Prévues mais non renseignées : on ne sait pas si elles ont été prises (jamais comptées comme oubliées). */
  unrecorded: number;
  /** Part des prises renseignées comme prises, parmi les prises renseignées. */
  takenPctOfRecorded: number | null;
}

/** Suivi des prises sur [from, to] jusqu'à `now` (les prises futures ne comptent pas). */
export function adherence(
  meds: readonly MedicationForSchedule[],
  intakes: readonly IntakeRecord[],
  from: LocalDate,
  to: LocalDate,
  now: Date,
  timeZone: string,
): Adherence {
  const recorded = new Map(intakes.map((i) => [`${i.medicationId}|${i.scheduledAt.getTime()}`, i.status]));
  let planned = 0;
  let taken = 0;
  let skipped = 0;
  for (let d = from; compareLocalDates(d, to) <= 0; d = addDays(d, 1)) {
    for (const p of plannedFor(meds, d, timeZone)) {
      if (p.at.getTime() > now.getTime()) continue;
      planned++;
      const st = recorded.get(`${p.medicationId}|${p.at.getTime()}`);
      if (st === 'taken') taken++;
      else if (st === 'skipped') skipped++;
    }
  }
  const rec = taken + skipped;
  return { planned, taken, skipped, unrecorded: planned - rec, takenPctOfRecorded: rec ? (taken / rec) * 100 : null };
}
