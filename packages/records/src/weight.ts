import { addDays, compareLocalDates, formatLocalDate, localDateOf, parseLocalDate } from '@bilanx/domain';
import type { Actor, ProfilesService } from '@bilanx/profiles';

export interface WeightConfig {
  profiles: ProfilesService;
  timeZone?: string;
  now?: () => Date;
}

export interface WeightEntry {
  day: string;
  kg: number;
}

export const WEIGHT_MIN_KG = 20;
export const WEIGHT_MAX_KG = 350;
const MAX_YEARS = 10;

/** « 72,5 », « 72.5 kg », 72.5 → 72.5 (arrondi à 0,1 kg) ; sinon null. */
export function parseWeightKg(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 10) / 10 : null;
  if (typeof v !== 'string') return null;
  const m = /^\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*(kg)?\s*$/i.exec(v);
  return m ? Math.round(Number(m[1]!.replace(',', '.')) * 10) / 10 : null;
}

/** Poids : une valeur par jour, droits de la rubrique Activité. */
export function createWeightService(cfg: WeightConfig) {
  const tz = cfg.timeZone ?? 'Europe/Paris';
  const now = cfg.now ?? (() => new Date());
  const P = cfg.profiles;

  /** Enregistre le poids d'un jour (remplace la valeur déjà notée ce jour-là). */
  async function setWeight(actor: Actor, profileId: string, dayIso: string, kgInput: unknown): Promise<{ ok: true; kg: number; day: string } | { ok: false; error: string }> {
    const day = parseLocalDate(dayIso);
    if (!day) return { ok: false, error: 'Choisissez une date.' };
    const today = localDateOf(now(), tz);
    if (compareLocalDates(day, today) > 0) return { ok: false, error: 'La date ne peut pas être dans le futur.' };
    if (compareLocalDates(day, addDays(today, -MAX_YEARS * 366)) < 0) return { ok: false, error: `Date trop ancienne (${MAX_YEARS} ans au plus).` };
    const kg = parseWeightKg(kgInput);
    if (kg === null) return { ok: false, error: 'Indiquez votre poids en kilos, par exemple 72,5.' };
    if (kg < WEIGHT_MIN_KG || kg > WEIGHT_MAX_KG) return { ok: false, error: `Poids entre ${WEIGHT_MIN_KG} et ${WEIGHT_MAX_KG} kg.` };
    const iso = formatLocalDate(day);
    await P.withProfileData(actor, profileId, 'activity', 'write', (tx) =>
      tx`INSERT INTO weight_entry (profile_id, day, weight_kg, created_at) VALUES (${profileId}, ${iso}::date, ${kg}, ${now()})
         ON CONFLICT (profile_id, day) DO UPDATE SET weight_kg = EXCLUDED.weight_kg, created_at = EXCLUDED.created_at`,
    );
    return { ok: true, kg, day: iso };
  }

  async function removeWeight(actor: Actor, profileId: string, dayIso: string): Promise<boolean> {
    const day = parseLocalDate(dayIso);
    if (!day) return false;
    const rows = await P.withProfileData(actor, profileId, 'activity', 'write', (tx) =>
      tx`DELETE FROM weight_entry WHERE profile_id = ${profileId} AND day = ${formatLocalDate(day)}::date RETURNING day`,
    );
    return rows.length > 0;
  }

  /** Valeurs entre deux dates incluses, de la plus ancienne à la plus récente. */
  async function listWeights(actor: Actor, profileId: string, fromIso: string, toIso: string): Promise<WeightEntry[]> {
    if (!parseLocalDate(fromIso) || !parseLocalDate(toIso)) return [];
    const rows = await P.withProfileData(actor, profileId, 'activity', 'read', (tx) =>
      tx<{ day: string; kg: string }[]>`
        SELECT to_char(day, 'YYYY-MM-DD') AS day, weight_kg AS kg FROM weight_entry
        WHERE profile_id = ${profileId} AND day BETWEEN ${fromIso}::date AND ${toIso}::date ORDER BY day`,
    );
    return rows.map((r) => ({ day: r.day, kg: Number(r.kg) }));
  }

  return { setWeight, removeWeight, listWeights };
}

export type WeightService = ReturnType<typeof createWeightService>;
