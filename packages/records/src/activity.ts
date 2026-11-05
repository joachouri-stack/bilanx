import { addSample, dedupHourly, type StepSample } from '@bilanx/domain';
import type { Actor, ProfilesService } from '@bilanx/profiles';
import { readAppleHealthSteps } from './apple-health';

export interface ActivityConfig {
  profiles: ProfilesService;
  timeZone?: string;
  now?: () => Date;
}

export interface ImportResult {
  ok: true;
  stepRecords: number;
  hours: number;
  days: number;
  from: string | null;
  to: string | null;
  sources: string[];
}

export interface ActivitySourceInfo {
  label: string;
  status: string;
  lastImportAt: Date | null;
  dataFrom: string | null;
  dataTo: string | null;
  sources: string[];
}

const MAX_YEARS = 10;

export function createActivityService(cfg: ActivityConfig) {
  const tz = cfg.timeZone ?? 'Europe/Paris';
  const now = cfg.now ?? (() => new Date());
  const P = cfg.profiles;

  /**
   * Importe les pas d'un export Apple Santé (flux d'octets). Lecture et agrégation en flux ;
   * écriture des heures dédoublonnées, puis recalcul des totaux quotidiens concernés.
   */
  async function importAppleHealth(actor: Actor, profileId: string, chunks: AsyncIterable<Uint8Array>): Promise<ImportResult | { ok: false; error: string }> {
    // Contrôle des droits AVANT de lire le fichier.
    const access = await P.getAccess(actor.accountId, profileId);
    if (!access || !(access.role === 'owner' || access.permissions.activity === 'write')) {
      await P.withProfileData(actor, profileId, 'activity', 'write', async () => null); // lève ForbiddenError
    }
    const t = now().getTime();
    const minT = t - MAX_YEARS * 365 * 86_400_000;
    const bySource = new Map<number, Map<string, number>>();
    const sources = new Set<string>();
    let stats;
    try {
      stats = await readAppleHealthSteps(chunks, (s: StepSample) => {
        if (s.start.getTime() > t + 60_000 || s.start.getTime() < minT) return; // futur ou trop ancien : ignoré
        if (addSample(bySource, s)) sources.add(s.source);
      });
    } catch {
      return { ok: false, error: 'Le fichier n’a pas pu être lu : déposez l’archive export.zip telle que créée par l’app Santé.' };
    }
    if (!stats.xmlFound) return { ok: false, error: 'Aucun fichier export.xml (ou exportation.xml) trouvé dans l’archive.' };
    if (!stats.stepRecords) return { ok: false, error: 'Aucun nombre de pas trouvé dans cet export.' };

    const hourly = dedupHourly(bySource);
    const hours = [...hourly.keys()].sort((a, b) => a - b);
    const starts = hours.map((h) => new Date(h).toISOString());
    const values = hours.map((h) => hourly.get(h)!);

    return P.withProfileData(actor, profileId, 'activity', 'write', async (tx) => {
      const [src] = await tx<{ id: string }[]>`
        INSERT INTO activity_source (profile_id, source_type, device_label, status, last_sync_at, details)
        VALUES (${profileId}, 'healthkit', 'Export Apple Santé (fichier)', 'file_import', ${now()}, ${tx.json({ sources: [...sources] })})
        ON CONFLICT (profile_id, source_type) DO UPDATE
          SET last_sync_at = EXCLUDED.last_sync_at, status = 'file_import',
              details = jsonb_build_object('sources', (SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements_text(COALESCE(activity_source.details->'sources', '[]'::jsonb) || COALESCE(EXCLUDED.details->'sources', '[]'::jsonb)) x))
        RETURNING id`;
      // Écriture par lots (tableaux) : rapide même pour plusieurs années d'heures.
      for (let i = 0; i < starts.length; i += 5000) {
        const s = starts.slice(i, i + 5000);
        const v = values.slice(i, i + 5000);
        await tx`
          INSERT INTO activity_hourly (profile_id, hour_start, steps, source_id)
          SELECT ${profileId}, h::timestamptz, st, ${src!.id} FROM unnest(${s}::text[], ${v}::int[]) AS u(h, st)
          ON CONFLICT (profile_id, hour_start) DO UPDATE SET steps = EXCLUDED.steps, source_id = EXCLUDED.source_id`;
      }
      // Totaux quotidiens recalculés à partir des heures, pour les jours concernés (jour local).
      const days = await tx<{ day: string }[]>`
        WITH touched AS (
          SELECT DISTINCT (hour_start AT TIME ZONE ${tz})::date AS day FROM unnest(${starts}::timestamptz[]) AS hour_start
        ), totals AS (
          SELECT t.day, sum(h.steps)::int AS steps FROM touched t
          JOIN activity_hourly h ON h.profile_id = ${profileId} AND (h.hour_start AT TIME ZONE ${tz})::date = t.day
          GROUP BY t.day
        )
        INSERT INTO activity_daily (profile_id, day, steps, source_id)
        SELECT ${profileId}, day, steps, ${src!.id} FROM totals
        ON CONFLICT (profile_id, day) DO UPDATE SET steps = EXCLUDED.steps, source_id = EXCLUDED.source_id
        RETURNING to_char(day, 'YYYY-MM-DD') AS day`;
      const sorted = days.map((d) => d.day).sort();
      await tx`
        UPDATE activity_source SET
          data_from = LEAST(COALESCE(data_from, ${sorted[0] ?? null}::date), ${sorted[0] ?? null}::date),
          data_to = GREATEST(COALESCE(data_to, ${sorted.at(-1) ?? null}::date), ${sorted.at(-1) ?? null}::date)
        WHERE id = ${src!.id}`;
      return { ok: true as const, stepRecords: stats.stepRecords, hours: hours.length, days: sorted.length, from: sorted[0] ?? null, to: sorted.at(-1) ?? null, sources: [...sources] };
    });
  }

  async function daily(actor: Actor, profileId: string, from: string, to: string): Promise<Map<string, number>> {
    const rows = await P.withProfileData(actor, profileId, 'activity', 'read', (tx) =>
      tx<{ day: string; steps: number }[]>`
        SELECT to_char(day, 'YYYY-MM-DD') AS day, steps FROM activity_daily
        WHERE profile_id = ${profileId} AND day BETWEEN ${from}::date AND ${to}::date`,
    );
    return new Map(rows.map((r) => [r.day, r.steps]));
  }

  async function hourly(actor: Actor, profileId: string, start: Date, end: Date): Promise<Map<number, number>> {
    const rows = await P.withProfileData(actor, profileId, 'activity', 'read', (tx) =>
      tx<{ hour_start: Date; steps: number }[]>`
        SELECT hour_start, steps FROM activity_hourly WHERE profile_id = ${profileId} AND hour_start >= ${start} AND hour_start < ${end}`,
    );
    return new Map(rows.map((r) => [r.hour_start.getTime(), r.steps]));
  }

  async function goal(actor: Actor, profileId: string): Promise<number> {
    const [g] = await P.withProfileData(actor, profileId, 'activity', 'read', (tx) =>
      tx<{ daily_steps: number }[]>`SELECT daily_steps FROM activity_goal WHERE profile_id = ${profileId}`,
    );
    return g?.daily_steps ?? 8000;
  }

  async function setGoal(actor: Actor, profileId: string, steps: number): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!Number.isInteger(steps) || steps < 500 || steps > 50000) return { ok: false, error: 'Objectif entre 500 et 50 000 pas.' };
    await P.withProfileData(actor, profileId, 'activity', 'write', (tx) =>
      tx`INSERT INTO activity_goal (profile_id, daily_steps) VALUES (${profileId}, ${steps})
         ON CONFLICT (profile_id) DO UPDATE SET daily_steps = EXCLUDED.daily_steps`,
    );
    return { ok: true };
  }

  async function source(actor: Actor, profileId: string): Promise<ActivitySourceInfo | null> {
    const [s] = await P.withProfileData(actor, profileId, 'activity', 'read', (tx) =>
      tx<{ device_label: string; status: string; last_sync_at: Date | null; data_from: string | null; data_to: string | null; details: { sources?: string[] } }[]>`
        SELECT device_label, status, last_sync_at, to_char(data_from, 'YYYY-MM-DD') AS data_from, to_char(data_to, 'YYYY-MM-DD') AS data_to, details
        FROM activity_source WHERE profile_id = ${profileId} ORDER BY last_sync_at DESC NULLS LAST LIMIT 1`,
    );
    return s
      ? { label: s.device_label, status: s.status, lastImportAt: s.last_sync_at, dataFrom: s.data_from, dataTo: s.data_to, sources: s.details?.sources ?? [] }
      : null;
  }

  /** Efface toutes les données d'activité importées pour ce profil. */
  async function clear(actor: Actor, profileId: string): Promise<void> {
    await P.withProfileData(actor, profileId, 'activity', 'write', async (tx) => {
      await tx`DELETE FROM activity_hourly WHERE profile_id = ${profileId}`;
      await tx`DELETE FROM activity_daily WHERE profile_id = ${profileId}`;
      await tx`DELETE FROM activity_source WHERE profile_id = ${profileId}`;
    });
  }

  return { importAppleHealth, daily, hourly, goal, setGoal, source, clear };
}

export type ActivityService = ReturnType<typeof createActivityService>;
