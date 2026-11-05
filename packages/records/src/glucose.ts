import { validateGlucoseEntry, type GlucoseContext, type GlucoseEntryErrors, type GlucoseEntryInput } from '@bilanx/domain';
import type { Actor, ProfilesService } from '@bilanx/profiles';

export interface GlucoseConfig {
  profiles: ProfilesService;
  timeZone?: string;
  now?: () => Date;
}

export interface CapillaryReading {
  at: Date;
  mgdl: number;
  context: GlucoseContext | null;
}

/** Glycémies capillaires saisies à la main (le capteur, lui, est importé). */
export function createGlucoseService(cfg: GlucoseConfig) {
  const tz = cfg.timeZone ?? 'Europe/Paris';
  const now = cfg.now ?? (() => new Date());
  const P = cfg.profiles;

  /** Ajoute une mesure ; une mesure à la même minute est remplacée (correction d'une faute de frappe). */
  async function addCapillary(actor: Actor, profileId: string, input: GlucoseEntryInput): Promise<{ ok: true; at: Date } | { ok: false; errors: GlucoseEntryErrors }> {
    const v = validateGlucoseEntry(input, now(), tz);
    if (!v.ok) return v;
    await P.withProfileData(actor, profileId, 'glucose', 'write', (tx) =>
      tx`INSERT INTO glucose_reading (profile_id, measured_at, value_mgdl, kind, context)
         VALUES (${profileId}, ${v.value.at}, ${v.value.mgdl}, 'capillary', ${v.value.context})
         ON CONFLICT (profile_id, kind, measured_at) DO UPDATE SET value_mgdl = EXCLUDED.value_mgdl, context = EXCLUDED.context`,
    );
    return { ok: true, at: v.value.at };
  }

  async function listCapillary(actor: Actor, profileId: string, start: Date, end: Date, limit = 200): Promise<CapillaryReading[]> {
    const rows = await P.withProfileData(actor, profileId, 'glucose', 'read', (tx) =>
      tx<{ measured_at: Date; value_mgdl: string; context: GlucoseContext | null }[]>`
        SELECT measured_at, value_mgdl, context FROM glucose_reading
        WHERE profile_id = ${profileId} AND kind = 'capillary' AND measured_at >= ${start} AND measured_at < ${end}
        ORDER BY measured_at DESC LIMIT ${limit}`,
    );
    return rows.map((r) => ({ at: r.measured_at, mgdl: Number(r.value_mgdl), context: r.context }));
  }

  /** Dernières mesures capillaires, toutes dates confondues. */
  async function recentCapillary(actor: Actor, profileId: string, limit = 10): Promise<CapillaryReading[]> {
    return listCapillary(actor, profileId, new Date(0), new Date(now().getTime() + 3_600_000), limit);
  }

  async function removeCapillary(actor: Actor, profileId: string, at: Date): Promise<boolean> {
    if (Number.isNaN(at.getTime())) return false;
    const rows = await P.withProfileData(actor, profileId, 'glucose', 'write', (tx) =>
      tx`DELETE FROM glucose_reading WHERE profile_id = ${profileId} AND kind = 'capillary' AND measured_at = ${at} RETURNING measured_at`,
    );
    return rows.length > 0;
  }

  return { addCapillary, listCapillary, recentCapillary, removeCapillary };
}

export type GlucoseService = ReturnType<typeof createGlucoseService>;
