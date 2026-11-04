import { validateManualLab, zonedTimeToUtc, type ManualLabErrors, type ManualLabInput } from '@bilanx/domain';
import type { Actor, ProfilesService } from '@bilanx/profiles';

export interface LabServiceConfig {
  profiles: ProfilesService;
  timeZone?: string;
  now?: () => Date;
}

export type AddLabResult =
  | { ok: true; id: string; analyteCode: string }
  | { ok: false; errors: ManualLabErrors }
  | { ok: false; duplicate: true; message: string };

export function createLabService(cfg: LabServiceConfig) {
  const tz = cfg.timeZone ?? 'Europe/Paris';
  const now = cfg.now ?? (() => new Date());
  const todayLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now());

  /**
   * Ajoute un résultat saisi à la main. La saisie par l'utilisateur vaut confirmation :
   * le résultat est marqué « manual » et rattaché au compte qui l'a saisi.
   */
  async function addManual(actor: Actor, profileId: string, input: ManualLabInput & { acceptDuplicate?: boolean }): Promise<AddLabResult> {
    const v = validateManualLab(input, todayLocal());
    if (!v.ok) return v;
    const r = v.value;
    const [y, m, d] = r.sampledOn.split('-').map(Number) as [number, number, number];
    // Heure inconnue : midi local, pour ne jamais basculer sur un autre jour.
    const sampledAt = zonedTimeToUtc({ year: y, month: m, day: d }, 12, 0, tz);

    return cfg.profiles.withProfileData(actor, profileId, 'lab', 'write', async (tx) => {
      if (!input.acceptDuplicate) {
        const [dup] = await tx`
          SELECT 1 FROM lab_result
          WHERE profile_id = ${profileId} AND analyte_code = ${r.analyte.code} AND deleted_at IS NULL
            AND (sampled_at AT TIME ZONE ${tz})::date = ${r.sampledOn}::date AND value = ${r.value} AND unit = ${r.unit}`;
        if (dup)
          return {
            ok: false as const,
            duplicate: true as const,
            message: `Un résultat identique (${r.analyte.nameFr}, même date, même valeur) est déjà enregistré. Confirmez s’il s’agit bien d’un second résultat.`,
          };
      }
      const [row] = await tx<{ id: string }[]>`
        INSERT INTO lab_result (profile_id, analyte_code, value, unit, value_canonical, comparator, ref_low, ref_high,
                                sampled_at, laboratory, source_type, confirmed_by, confirmed_at, note)
        VALUES (${profileId}, ${r.analyte.code}, ${r.value}, ${r.unit}, ${r.valueCanonical}, ${r.comparator}, ${r.refLow}, ${r.refHigh},
                ${sampledAt}, ${r.laboratory}, 'manual', ${actor.accountId}, ${now()}, ${r.note})
        RETURNING id`;
      return { ok: true as const, id: row!.id, analyteCode: r.analyte.code };
    });
  }

  /** Suppression logique (récupérable par l'équipe, invisible pour l'utilisateur), tracée au journal. */
  async function remove(actor: Actor, profileId: string, resultId: string): Promise<boolean> {
    if (!/^[0-9a-f-]{36}$/i.test(resultId)) return false;
    return cfg.profiles.withProfileData(actor, profileId, 'lab', 'write', async (tx) => {
      const rows = await tx`
        UPDATE lab_result SET deleted_at = ${now()}
        WHERE id = ${resultId} AND profile_id = ${profileId} AND deleted_at IS NULL RETURNING id`;
      return rows.length > 0;
    });
  }

  return { addManual, remove };
}

export type LabService = ReturnType<typeof createLabService>;
