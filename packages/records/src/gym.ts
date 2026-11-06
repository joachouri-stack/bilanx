import { addDays, compareLocalDates, formatLocalDate, localDateOf, parseLocalDate } from '@bilanx/domain';
import type { Actor, ProfilesService } from '@bilanx/profiles';

export interface GymConfig {
  profiles: ProfilesService;
  timeZone?: string;
  now?: () => Date;
}

/** Au plus 10 ans en arrière, jamais dans le futur (comme la saisie des pas). */
const MAX_YEARS = 10;

/**
 * Salle de sport : un jour coché = une séance. Droits de la rubrique Activité
 * (un aidant en lecture voit les séances mais ne peut pas en cocher).
 */
export function createGymService(cfg: GymConfig) {
  const tz = cfg.timeZone ?? 'Europe/Paris';
  const now = cfg.now ?? (() => new Date());
  const P = cfg.profiles;

  /** Coche (`present`) ou décoche un jour. Idempotent : cocher deux fois ne crée qu'une séance. */
  async function setVisit(actor: Actor, profileId: string, dayIso: string, present: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
    const day = parseLocalDate(dayIso);
    if (!day) return { ok: false, error: 'Choisissez une date.' };
    const today = localDateOf(now(), tz);
    if (compareLocalDates(day, today) > 0) return { ok: false, error: 'La date ne peut pas être dans le futur.' };
    if (compareLocalDates(day, addDays(today, -MAX_YEARS * 366)) < 0) return { ok: false, error: `Date trop ancienne (${MAX_YEARS} ans au plus).` };
    const iso = formatLocalDate(day);
    await P.withProfileData(actor, profileId, 'activity', 'write', (tx) =>
      present
        ? tx`INSERT INTO gym_visit (profile_id, day) VALUES (${profileId}, ${iso}::date) ON CONFLICT (profile_id, day) DO NOTHING`
        : tx`DELETE FROM gym_visit WHERE profile_id = ${profileId} AND day = ${iso}::date`,
    );
    return { ok: true };
  }

  /** Jours de séance entre deux dates incluses, du plus ancien au plus récent. */
  async function listVisits(actor: Actor, profileId: string, fromIso: string, toIso: string): Promise<string[]> {
    if (!parseLocalDate(fromIso) || !parseLocalDate(toIso)) return [];
    const rows = await P.withProfileData(actor, profileId, 'activity', 'read', (tx) =>
      tx<{ day: string }[]>`
        SELECT to_char(day, 'YYYY-MM-DD') AS day FROM gym_visit
        WHERE profile_id = ${profileId} AND day BETWEEN ${fromIso}::date AND ${toIso}::date ORDER BY day`,
    );
    return rows.map((r) => r.day);
  }

  return { setVisit, listVisits };
}

export type GymService = ReturnType<typeof createGymService>;
