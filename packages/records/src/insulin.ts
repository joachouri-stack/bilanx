import { INSULIN_TYPES, validateDose, validateTreatmentChange, type DoseErrors, type DoseInput, type InsulinType } from '@bilanx/domain';
import type { Actor, ProfilesService } from '@bilanx/profiles';

export interface InsulinServiceConfig {
  profiles: ProfilesService;
  timeZone?: string;
  now?: () => Date;
}

export interface InsulinProduct {
  id: string;
  name: string;
  type: InsulinType;
  active: boolean;
}

export interface DoseRow {
  id: string;
  productId: string;
  productName: string;
  type: InsulinType;
  units: number;
  at: Date;
  status: 'planned' | 'taken' | 'skipped';
  comment: string | null;
}

export interface ChangeRow {
  id: string;
  subject: string;
  effectiveDate: string;
  previousRegimen: string | null;
  newRegimen: string;
  prescribedBy: string | null;
  goalNote: string | null;
  createdAt: Date;
}

const UUID = /^[0-9a-f-]{36}$/i;

export function createInsulinService(cfg: InsulinServiceConfig) {
  const tz = cfg.timeZone ?? 'Europe/Paris';
  const now = cfg.now ?? (() => new Date());
  const P = cfg.profiles;

  async function listProducts(actor: Actor, profileId: string, includeInactive = false): Promise<InsulinProduct[]> {
    return P.withProfileData(actor, profileId, 'insulin', 'read', (tx) =>
      tx<InsulinProduct[]>`
        SELECT id, name, type, active FROM insulin_product
        WHERE profile_id = ${profileId} ${includeInactive ? tx`` : tx`AND active`} ORDER BY active DESC, type, name`,
    );
  }

  async function addProduct(actor: Actor, profileId: string, input: { name: string; type: string }) {
    const name = input.name.trim();
    if (!name || name.length > 80) return { ok: false as const, error: 'Indiquez le nom de l’insuline (80 caractères maximum).' };
    if (!(input.type in INSULIN_TYPES)) return { ok: false as const, error: 'Choisissez le type d’insuline.' };
    try {
      const id = await P.withProfileData(actor, profileId, 'insulin', 'write', async (tx) => {
        const [r] = await tx<{ id: string }[]>`
          INSERT INTO insulin_product (profile_id, name, type, created_at) VALUES (${profileId}, ${name}, ${input.type}, ${now()}) RETURNING id`;
        return r!.id;
      });
      return { ok: true as const, id };
    } catch (e) {
      if ((e as { code?: string }).code === '23505') return { ok: false as const, error: 'Cette insuline est déjà dans votre liste.' };
      throw e;
    }
  }

  async function archiveProduct(actor: Actor, profileId: string, productId: string): Promise<boolean> {
    if (!UUID.test(productId)) return false;
    return P.withProfileData(actor, profileId, 'insulin', 'write', async (tx) =>
      (await tx`UPDATE insulin_product SET active = false WHERE id = ${productId} AND profile_id = ${profileId} RETURNING id`).length > 0,
    );
  }

  async function addDose(
    actor: Actor,
    profileId: string,
    input: DoseInput & { acceptDuplicate?: boolean },
  ): Promise<{ ok: true; id: string } | { ok: false; errors: DoseErrors } | { ok: false; duplicate: true; message: string }> {
    const v = validateDose(input, now(), tz);
    if (!v.ok) return v;
    const d = v.value;
    if (!UUID.test(d.productId)) return { ok: false, errors: { productId: 'Choisissez l’insuline.' } };
    return P.withProfileData(actor, profileId, 'insulin', 'write', async (tx) => {
      const [prod] = await tx`SELECT 1 FROM insulin_product WHERE id = ${d.productId} AND profile_id = ${profileId} AND active`;
      if (!prod) return { ok: false as const, errors: { productId: 'Choisissez une insuline de la liste.' } };
      if (!input.acceptDuplicate) {
        const [dup] = await tx`
          SELECT 1 FROM insulin_dose WHERE profile_id = ${profileId} AND product_id = ${d.productId} AND deleted_at IS NULL
            AND abs(extract(epoch FROM occurred_at - ${d.at}::timestamptz)) <= 900`;
        if (dup)
          return {
            ok: false as const,
            duplicate: true as const,
            message: 'Une injection de cette insuline est déjà notée à moins de 15 minutes d’intervalle. Confirmez s’il s’agit bien d’une seconde injection.',
          };
      }
      const [row] = await tx<{ id: string }[]>`
        INSERT INTO insulin_dose (profile_id, product_id, units, occurred_at, status, comment, source_type, created_by, created_at)
        VALUES (${profileId}, ${d.productId}, ${d.units}, ${d.at}, ${d.status}, ${d.comment}, 'manual', ${actor.accountId}, ${now()})
        RETURNING id`;
      return { ok: true as const, id: row!.id };
    });
  }

  async function listDoses(actor: Actor, profileId: string, from: Date, to: Date): Promise<DoseRow[]> {
    const rows = await P.withProfileData(actor, profileId, 'insulin', 'read', (tx) =>
      tx<{ id: string; product_id: string; name: string; type: InsulinType; units: string; occurred_at: Date; status: DoseRow['status']; comment: string | null }[]>`
        SELECT d.id, d.product_id, p.name, p.type, d.units, d.occurred_at, d.status, d.comment
        FROM insulin_dose d JOIN insulin_product p ON p.id = d.product_id
        WHERE d.profile_id = ${profileId} AND d.deleted_at IS NULL AND d.occurred_at >= ${from} AND d.occurred_at < ${to}
        ORDER BY d.occurred_at DESC`,
    );
    return rows.map((r) => ({
      id: r.id,
      productId: r.product_id,
      productName: r.name,
      type: r.type,
      units: Number(r.units),
      at: r.occurred_at,
      status: r.status,
      comment: r.comment,
    }));
  }

  async function deleteDose(actor: Actor, profileId: string, doseId: string): Promise<boolean> {
    if (!UUID.test(doseId)) return false;
    return P.withProfileData(actor, profileId, 'insulin', 'write', async (tx) =>
      (await tx`UPDATE insulin_dose SET deleted_at = ${now()} WHERE id = ${doseId} AND profile_id = ${profileId} AND deleted_at IS NULL RETURNING id`).length > 0,
    );
  }

  async function addChange(actor: Actor, profileId: string, input: Parameters<typeof validateTreatmentChange>[0]) {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now());
    const v = validateTreatmentChange(input, today);
    if (!v.ok) return v;
    const c = v.value;
    const m = /^insulin:([0-9a-f-]{36})$/i.exec(c.subject);
    if (!m) return { ok: false as const, errors: { subject: 'Choisissez le traitement concerné.' } };
    return P.withProfileData(actor, profileId, 'insulin', 'write', async (tx) => {
      const [prod] = await tx`SELECT 1 FROM insulin_product WHERE id = ${m[1]!} AND profile_id = ${profileId}`;
      if (!prod) return { ok: false as const, errors: { subject: 'Choisissez le traitement concerné.' } };
      const [row] = await tx<{ id: string }[]>`
        INSERT INTO treatment_change (profile_id, subject, effective_date, previous_regimen, new_regimen, prescribed_by, goal_note, created_by, created_at)
        VALUES (${profileId}, ${c.subject}, ${c.effectiveDate}, ${c.previousRegimen}, ${c.newRegimen}, ${c.prescribedBy}, ${c.goalNote}, ${actor.accountId}, ${now()})
        RETURNING id`;
      return { ok: true as const, id: row!.id };
    });
  }

  async function listChanges(actor: Actor, profileId: string): Promise<ChangeRow[]> {
    const rows = await P.withProfileData(actor, profileId, 'insulin', 'read', (tx) =>
      tx<{ id: string; subject: string; effective_date: string; previous_regimen: string | null; new_regimen: string; prescribed_by: string | null; goal_note: string | null; created_at: Date }[]>`
        SELECT id, subject, to_char(effective_date, 'YYYY-MM-DD') AS effective_date, previous_regimen, new_regimen, prescribed_by, goal_note, created_at
        FROM treatment_change WHERE profile_id = ${profileId} AND deleted_at IS NULL AND subject LIKE 'insulin:%'
        ORDER BY effective_date DESC, created_at DESC`,
    );
    return rows.map((r) => ({
      id: r.id,
      subject: r.subject,
      effectiveDate: r.effective_date,
      previousRegimen: r.previous_regimen,
      newRegimen: r.new_regimen,
      prescribedBy: r.prescribed_by,
      goalNote: r.goal_note,
      createdAt: r.created_at,
    }));
  }

  async function deleteChange(actor: Actor, profileId: string, changeId: string): Promise<boolean> {
    if (!UUID.test(changeId)) return false;
    return P.withProfileData(actor, profileId, 'insulin', 'write', async (tx) =>
      (await tx`UPDATE treatment_change SET deleted_at = ${now()} WHERE id = ${changeId} AND profile_id = ${profileId} AND deleted_at IS NULL RETURNING id`).length > 0,
    );
  }

  return { listProducts, addProduct, archiveProduct, addDose, listDoses, deleteDose, addChange, listChanges, deleteChange };
}

export type InsulinService = ReturnType<typeof createInsulinService>;
