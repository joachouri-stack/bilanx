/**
 * Saisie manuelle d'une glycémie capillaire (lecteur au bout du doigt).
 * La valeur est saisie dans l'unité d'affichage du profil et stockée en mg/dL.
 */
import { addDays, compareLocalDates, localDateOf, parseLocalDate, zonedTimeToUtc } from './time';
import { GLUCOSE_MGDL_PER_MMOLL, type GlucoseUnit } from './units';

export type GlucoseContext = 'fasting' | 'before_meal' | 'after_meal' | 'bedtime' | 'night' | 'other';
export const GLUCOSE_CONTEXTS: Record<GlucoseContext, string> = {
  fasting: 'À jeun',
  before_meal: 'Avant un repas',
  after_meal: 'Après un repas',
  bedtime: 'Au coucher',
  night: 'La nuit',
  other: 'Autre moment',
};

/** Plage plausible d'un lecteur capillaire (mg/dL) ; au-delà, la saisie est très probablement une erreur d'unité. */
export const CAPILLARY_MIN_MGDL = 20;
export const CAPILLARY_MAX_MGDL = 600;

export interface GlucoseEntryInput {
  value: string;
  unit: GlucoseUnit;
  /** AAAA-MM-JJ, jour local */
  date: string;
  /** HH:MM, heure locale */
  time: string;
  context?: string;
}
export type GlucoseEntryErrors = Partial<Record<keyof GlucoseEntryInput, string>>;
export interface ValidGlucoseEntry {
  mgdl: number;
  at: Date;
  context: GlucoseContext | null;
}

const EXAMPLE: Record<GlucoseUnit, string> = { 'mg/dL': '110', 'g/L': '1,10', 'mmol/L': '6,1' };

export function validateGlucoseEntry(input: GlucoseEntryInput, now: Date, timeZone: string): { ok: true; value: ValidGlucoseEntry } | { ok: false; errors: GlucoseEntryErrors } {
  const errors: GlucoseEntryErrors = {};
  const raw = input.value.trim().replace(/\s/g, '').replace(',', '.');
  const n = Number(raw);
  let mgdl: number | null = null;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(raw) || !(n > 0)) errors.value = `Indiquez la valeur lue sur le lecteur, par exemple ${EXAMPLE[input.unit]} ${input.unit}.`;
  else {
    mgdl = input.unit === 'mg/dL' ? n : input.unit === 'g/L' ? n * 100 : n * GLUCOSE_MGDL_PER_MMOLL;
    mgdl = Math.round(mgdl * 10) / 10;
    if (mgdl < CAPILLARY_MIN_MGDL || mgdl > CAPILLARY_MAX_MGDL)
      errors.value = `Valeur inhabituelle en ${input.unit} : vérifiez l’unité (exemple : ${EXAMPLE[input.unit]} ${input.unit}).`;
  }
  const d = parseLocalDate(input.date);
  const t = /^(\d{2}):(\d{2})$/.exec(input.time);
  let at: Date | null = null;
  if (!d) errors.date = 'Indiquez la date.';
  if (!t || Number(t[1]) > 23 || Number(t[2]) > 59) errors.time = 'Indiquez l’heure (HH:MM).';
  if (d && t) {
    at = zonedTimeToUtc(d, Number(t[1]), Number(t[2]), timeZone);
    if (at.getTime() - now.getTime() > 5 * 60_000) errors.time = 'La mesure ne peut pas être dans le futur.';
    if (compareLocalDates(d, addDays(localDateOf(now, timeZone), -3650)) < 0) errors.date = 'Date trop ancienne (plus de 10 ans).';
  }
  const context = input.context && input.context in GLUCOSE_CONTEXTS ? (input.context as GlucoseContext) : null;
  if (input.context && !context) errors.context = 'Moment non reconnu.';
  if (Object.keys(errors).length || mgdl === null || !at) return { ok: false, errors };
  return { ok: true, value: { mgdl, at, context } };
}
