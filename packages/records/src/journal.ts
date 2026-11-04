import { validateJournalEntry, type JournalErrors, type JournalInput, type JournalKind, type MealKind } from '@bilanx/domain';
import type { Actor, ProfilesService } from '@bilanx/profiles';

export interface JournalServiceConfig {
  profiles: ProfilesService;
  timeZone?: string;
  now?: () => Date;
}

export interface JournalRow {
  id: string;
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

export function createJournalService(cfg: JournalServiceConfig) {
  const tz = cfg.timeZone ?? 'Europe/Paris';
  const now = cfg.now ?? (() => new Date());
  const P = cfg.profiles;

  async function add(actor: Actor, profileId: string, input: JournalInput): Promise<{ ok: true; id: string } | { ok: false; errors: JournalErrors }> {
    const v = validateJournalEntry(input, now(), tz);
    if (!v.ok) return v;
    const e = v.value;
    return P.withProfileData(actor, profileId, 'journal', 'write', async (tx) => {
      const [row] = await tx<{ id: string }[]>`
        INSERT INTO journal_entry (profile_id, kind, meal_kind, occurred_at, ended_at, description, quantities, carbs_g, intensity, comment, created_by, created_at)
        VALUES (${profileId}, ${e.kind}, ${e.mealKind}, ${e.at}, ${e.endedAt}, ${e.description}, ${e.quantities}, ${e.carbsG}, ${e.intensity}, ${e.comment},
                ${actor.accountId}, ${now()})
        RETURNING id`;
      return { ok: true as const, id: row!.id };
    });
  }

  async function list(actor: Actor, profileId: string, from: Date, to: Date): Promise<JournalRow[]> {
    const rows = await P.withProfileData(actor, profileId, 'journal', 'read', (tx) =>
      tx<{ id: string; kind: JournalKind; meal_kind: MealKind | null; occurred_at: Date; ended_at: Date | null; description: string | null; quantities: string | null; carbs_g: string | null; intensity: number | null; comment: string | null }[]>`
        SELECT id, kind, meal_kind, occurred_at, ended_at, description, quantities, carbs_g, intensity, comment
        FROM journal_entry
        WHERE profile_id = ${profileId} AND deleted_at IS NULL AND occurred_at >= ${from} AND occurred_at < ${to}
        ORDER BY occurred_at`,
    );
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      mealKind: r.meal_kind,
      at: r.occurred_at,
      endedAt: r.ended_at,
      description: r.description,
      quantities: r.quantities,
      carbsG: r.carbs_g === null ? null : Number(r.carbs_g),
      intensity: r.intensity,
      comment: r.comment,
    }));
  }

  async function remove(actor: Actor, profileId: string, id: string): Promise<boolean> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
    return P.withProfileData(actor, profileId, 'journal', 'write', async (tx) =>
      (await tx`UPDATE journal_entry SET deleted_at = ${now()} WHERE id = ${id} AND profile_id = ${profileId} AND deleted_at IS NULL RETURNING id`).length > 0,
    );
  }

  return { add, list, remove };
}

export type JournalService = ReturnType<typeof createJournalService>;
