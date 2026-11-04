/**
 * Saisie et statistiques DESCRIPTIVES de l'insuline.
 *
 * Règles du produit : aucune dose n'est calculée, suggérée ou préremplie ; on
 * enregistre uniquement ce que l'utilisateur déclare (injection faite, prévue
 * ou sautée) et les modifications PRESCRITES par son médecin.
 */
import { summarizeInsulin, type InsulinDose, type InsulinSummary, type InsulinType } from './insulin';
import { addDays, compareLocalDates, formatLocalDate, localDateOf, parseLocalDate, zonedTimeToUtc, type LocalDate } from './time';

export const INSULIN_TYPES: Record<InsulinType, string> = {
  rapid: 'Rapide (repas, correction)',
  long: 'Lente (basale)',
  intermediate: 'Intermédiaire',
  mixed: 'Mélange (prémix)',
  other: 'Autre',
};

/** Limite de saisie : au-delà, il s'agit presque sûrement d'une erreur de frappe. */
export const MAX_UNITS_PER_INJECTION = 150;

export interface DoseInput {
  productId: string;
  units: string;
  /** AAAA-MM-JJ, jour local */
  date: string;
  /** HH:MM, heure locale */
  time: string;
  status: string;
  comment?: string;
}

export type DoseErrors = Partial<Record<keyof DoseInput, string>>;

export interface ValidDose {
  productId: string;
  units: number;
  at: Date;
  status: 'planned' | 'taken' | 'skipped';
  comment: string | null;
}

export function validateDose(input: DoseInput, now: Date, timeZone: string): { ok: true; value: ValidDose } | { ok: false; errors: DoseErrors } {
  const errors: DoseErrors = {};
  if (!input.productId) errors.productId = 'Choisissez l’insuline.';
  const raw = input.units.trim().replace(',', '.');
  const units = Number(raw);
  if (!/^\d{1,3}(\.\d)?$/.test(raw) || !(units > 0)) errors.units = 'Indiquez un nombre d’unités, par exemple 4 ou 4,5.';
  else if (units > MAX_UNITS_PER_INJECTION) errors.units = `Plus de ${MAX_UNITS_PER_INJECTION} unités en une injection : vérifiez la saisie.`;
  if (!['planned', 'taken', 'skipped'].includes(input.status)) errors.status = 'Indiquez si l’injection a été faite.';

  const d = parseLocalDate(input.date);
  const t = /^(\d{2}):(\d{2})$/.exec(input.time);
  let at: Date | null = null;
  if (!d) errors.date = 'Indiquez la date.';
  if (!t || Number(t[1]) > 23 || Number(t[2]) > 59) errors.time = 'Indiquez l’heure (HH:MM).';
  if (d && t) {
    at = zonedTimeToUtc(d, Number(t[1]), Number(t[2]), timeZone);
    const minutesAhead = (at.getTime() - now.getTime()) / 60_000;
    if (input.status !== 'planned' && minutesAhead > 10) errors.time = 'Une injection faite ou sautée ne peut pas être dans le futur.';
    if (input.status === 'planned' && minutesAhead > 7 * 24 * 60) errors.date = 'Une injection prévue doit être dans les 7 prochains jours.';
    if (compareLocalDates(d, addDays(localDateOf(now, timeZone), -730)) < 0) errors.date = 'Date trop ancienne (plus de 2 ans).';
  }
  const comment = input.comment?.trim() || null;
  if (comment && comment.length > 300) errors.comment = '300 caractères maximum.';
  if (Object.keys(errors).length || !at) return { ok: false, errors };
  return { ok: true, value: { productId: input.productId, units, at, status: input.status as ValidDose['status'], comment } };
}

export interface ChangeInput {
  subject: string;
  effectiveDate: string;
  previousRegimen?: string;
  newRegimen: string;
  prescribedBy?: string;
  goalNote?: string;
}

export function validateTreatmentChange(input: ChangeInput, today: string): { ok: true; value: Required<Pick<ChangeInput, 'subject' | 'effectiveDate' | 'newRegimen'>> & { previousRegimen: string | null; prescribedBy: string | null; goalNote: string | null } } | { ok: false; errors: Partial<Record<keyof ChangeInput, string>> } {
  const errors: Partial<Record<keyof ChangeInput, string>> = {};
  if (!input.subject) errors.subject = 'Choisissez le traitement concerné.';
  if (!parseLocalDate(input.effectiveDate)) errors.effectiveDate = 'Indiquez la date d’effet.';
  else if (input.effectiveDate > formatLocalDate(addDays(parseLocalDate(today)!, 365))) errors.effectiveDate = 'Date trop lointaine.';
  const newRegimen = input.newRegimen.trim();
  if (!newRegimen) errors.newRegimen = 'Décrivez le traitement tel que prescrit (ex. « 14 U le soir »).';
  const cap = (v: string | undefined, max: number, k: keyof ChangeInput) => {
    const s = v?.trim() || null;
    if (s && s.length > max) errors[k] = `${max} caractères maximum.`;
    return s;
  };
  const previousRegimen = cap(input.previousRegimen, 200, 'previousRegimen');
  cap(input.newRegimen, 200, 'newRegimen');
  const prescribedBy = cap(input.prescribedBy, 120, 'prescribedBy');
  const goalNote = cap(input.goalNote, 500, 'goalNote');
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { subject: input.subject, effectiveDate: input.effectiveDate, newRegimen, previousRegimen, prescribedBy, goalNote } };
}

export interface DailyInsulin {
  date: string; // AAAA-MM-JJ
  rapid: number;
  long: number;
  other: number;
  total: number;
}

export interface InsulinPeriod {
  from: string;
  to: string;
  days: DailyInsulin[];
  summary: InsulinSummary;
  /** Moyenne sur les jours AYANT au moins une injection notée (jours sans saisie exclus). */
  averagePerRecordedDay: number | null;
  daysWithData: number;
  periodDays: number;
}

/** Statistiques d'une période [from, to] (jours locaux inclus) : injections effectuées uniquement. */
export function insulinPeriod(doses: readonly InsulinDose[], timeZone: string, from: LocalDate, to: LocalDate): InsulinPeriod {
  const inPeriod = doses.filter((d) => {
    const ld = localDateOf(d.at, timeZone);
    return compareLocalDates(ld, from) >= 0 && compareLocalDates(ld, to) <= 0;
  });
  const summary = summarizeInsulin(inPeriod, timeZone);
  const days: DailyInsulin[] = [];
  for (let d = from; compareLocalDates(d, to) <= 0; d = addDays(d, 1)) days.push({ date: formatLocalDate(d), rapid: 0, long: 0, other: 0, total: 0 });
  const idx = new Map(days.map((x, i) => [x.date, i]));
  for (const dose of inPeriod) {
    if (dose.status !== 'taken') continue;
    const row = days[idx.get(formatLocalDate(localDateOf(dose.at, timeZone)))!]!;
    if (dose.type === 'rapid') row.rapid += dose.units;
    else if (dose.type === 'long') row.long += dose.units;
    else row.other += dose.units;
    row.total += dose.units;
  }
  return {
    from: formatLocalDate(from),
    to: formatLocalDate(to),
    days,
    summary,
    averagePerRecordedDay: summary.dailyAverage,
    daysWithData: summary.daysWithData,
    periodDays: days.length,
  };
}
