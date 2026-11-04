/**
 * Journal des repas et des événements de la journée (contexte de la glycémie).
 * Données déclaratives : rien n'est estimé à la place de l'utilisateur
 * (les glucides ne sont enregistrés que s'il les indique).
 */
import { parseLocalDate, zonedTimeToUtc } from './time';

export const JOURNAL_KINDS = {
  meal: { label: 'Repas', icon: '🍽' },
  activity: { label: 'Activité physique', icon: '🚶' },
  stress: { label: 'Stress', icon: '😮‍💨' },
  sleep: { label: 'Sommeil', icon: '😴' },
  illness: { label: 'Maladie', icon: '🤒' },
  symptom: { label: 'Symptôme', icon: '🩺' },
  medication: { label: 'Médicament pris', icon: '💊' },
  other: { label: 'Autre événement', icon: '📝' },
} as const;
export type JournalKind = keyof typeof JOURNAL_KINDS;

export const MEAL_KINDS = {
  breakfast: 'Petit-déjeuner',
  lunch: 'Déjeuner',
  dinner: 'Dîner',
  snack: 'Collation',
} as const;
export type MealKind = keyof typeof MEAL_KINDS;

/** Événements pour lesquels une intensité (1 à 5) a du sens. */
export const KINDS_WITH_INTENSITY: readonly JournalKind[] = ['activity', 'stress', 'symptom', 'illness'];
/** Événements qui ont une durée (heure de fin facultative). */
export const KINDS_WITH_DURATION: readonly JournalKind[] = ['activity', 'sleep'];

export interface JournalInput {
  kind: string;
  mealKind?: string;
  date: string; // AAAA-MM-JJ
  time: string; // HH:MM
  endTime?: string; // HH:MM, facultatif
  description?: string;
  quantities?: string;
  carbs?: string;
  intensity?: string;
  comment?: string;
}

export type JournalErrors = Partial<Record<keyof JournalInput, string>>;

export interface ValidJournalEntry {
  kind: JournalKind;
  mealKind: MealKind | null;
  at: Date;
  endedAt: Date | null;
  description: string | null;
  quantities: string | null;
  carbsG: number | null;
  intensity: number | null;
  comment: string | null;
}

export function validateJournalEntry(input: JournalInput, now: Date, timeZone: string): { ok: true; value: ValidJournalEntry } | { ok: false; errors: JournalErrors } {
  const errors: JournalErrors = {};
  const kind = input.kind as JournalKind;
  if (!(input.kind in JOURNAL_KINDS)) errors.kind = 'Choisissez le type d’événement.';
  const mealKind = kind === 'meal' ? ((input.mealKind ?? '') as MealKind) : null;
  if (kind === 'meal' && !(mealKind! in MEAL_KINDS)) errors.mealKind = 'Choisissez le repas.';

  const d = parseLocalDate(input.date);
  const t = /^(\d{2}):(\d{2})$/.exec(input.time);
  let at: Date | null = null;
  if (!d) errors.date = 'Indiquez la date.';
  if (!t || Number(t[1]) > 23 || Number(t[2]) > 59) errors.time = 'Indiquez l’heure (HH:MM).';
  if (d && t) {
    at = zonedTimeToUtc(d, Number(t[1]), Number(t[2]), timeZone);
    if (at.getTime() - now.getTime() > 10 * 60_000) errors.time = 'Le journal décrit ce qui s’est passé : l’heure ne peut pas être dans le futur.';
    if (now.getTime() - at.getTime() > 2 * 365 * 86_400_000) errors.date = 'Date trop ancienne (plus de 2 ans).';
  }

  let endedAt: Date | null = null;
  if (input.endTime) {
    const e = /^(\d{2}):(\d{2})$/.exec(input.endTime);
    if (!e || Number(e[1]) > 23 || Number(e[2]) > 59) errors.endTime = 'Heure de fin invalide.';
    else if (d && at && KINDS_WITH_DURATION.includes(kind)) {
      endedAt = zonedTimeToUtc(d, Number(e[1]), Number(e[2]), timeZone);
      // Fin avant le début : l'événement se termine le lendemain (ex. sommeil 23:00 → 07:00).
      if (endedAt <= at) endedAt = new Date(endedAt.getTime() + 86_400_000);
      if (endedAt.getTime() - at.getTime() > 16 * 3_600_000) errors.endTime = 'Durée supérieure à 16 heures : vérifiez les heures.';
    }
  }

  const text = (v: string | undefined, max: number, k: keyof JournalInput) => {
    const s = v?.trim() || null;
    if (s && s.length > max) errors[k] = `${max} caractères maximum.`;
    return s;
  };
  const description = text(input.description, 300, 'description');
  const quantities = text(input.quantities, 200, 'quantities');
  const comment = text(input.comment, 500, 'comment');
  if (kind === 'meal' && !description) errors.description = 'Décrivez le repas en quelques mots.';
  if (kind !== 'meal' && !description && !comment) errors.description = 'Ajoutez une description ou un commentaire.';

  let carbsG: number | null = null;
  if (input.carbs?.trim()) {
    const raw = input.carbs.trim().replace(',', '.');
    carbsG = Number(raw);
    if (kind !== 'meal') errors.carbs = 'Les glucides ne concernent que les repas.';
    else if (!/^\d{1,3}(\.\d)?$/.test(raw) || carbsG > 400) errors.carbs = 'Indiquez une quantité de glucides entre 0 et 400 g.';
  }

  let intensity: number | null = null;
  if (input.intensity?.trim()) {
    intensity = Number(input.intensity);
    if (!KINDS_WITH_INTENSITY.includes(kind)) intensity = null;
    else if (!Number.isInteger(intensity) || intensity < 1 || intensity > 5) errors.intensity = 'Intensité de 1 à 5.';
  }

  if (Object.keys(errors).length || !at) return { ok: false, errors };
  return { ok: true, value: { kind, mealKind, at, endedAt, description, quantities, carbsG, intensity, comment } };
}
