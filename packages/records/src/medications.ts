/**
 * Médicaments : traitement prescrit (recopié par l'utilisateur, jamais modifié par BILANX),
 * historique des prescriptions, arrêt daté et suivi des prises.
 */
import {
  addDays,
  adherence,
  dayBounds,
  formatLocalDate,
  localDateOf,
  parseLocalDate,
  plannedFor,
  validateMedication,
  type Adherence,
  type LocalDate,
  type MedicationErrors,
  type MedicationInput,
  type ScheduleSlot,
} from '@bilanx/domain';
import type { Actor, ProfilesService } from '@bilanx/profiles';

export interface MedicationsConfig {
  profiles: ProfilesService;
  timeZone?: string;
  now?: () => Date;
}

export interface MedicationRow {
  id: string;
  name: string;
  strength: string | null;
  posology: string;
  schedule: ScheduleSlot[];
  startDate: string | null;
  endDate: string | null;
  prescriber: string | null;
  status: 'active' | 'stopped';
  stoppedOn: string | null;
  stopReason: string | null;
  replacesId: string | null;
  createdAt: Date;
}

export interface DoseOfDay {
  medicationId: string;
  name: string;
  strength: string | null;
  at: Date;
  time: string;
  qty: string;
  status: 'taken' | 'skipped' | null;
  /** La prise peut être renseignée (elle n'est pas plus d'une heure dans le futur). */
  recordable: boolean;
}

const UUID = /^[0-9a-f-]{36}$/i;
type Row = {
  id: string;
  name: string;
  strength: string | null;
  posology_text: string;
  schedule: ScheduleSlot[];
  start_date: string | null;
  end_date: string | null;
  prescriber: string | null;
  status: 'active' | 'stopped';
  stopped_on: string | null;
  stop_reason: string | null;
  replaces_id: string | null;
  created_at: Date;
};
const COLS = 'id, name, strength, posology_text, schedule, start_date::text, end_date::text, prescriber, status, stopped_on::text, stop_reason, replaces_id, created_at';
const toRow = (r: Row): MedicationRow => ({
  id: r.id,
  name: r.name,
  strength: r.strength,
  posology: r.posology_text,
  schedule: r.schedule,
  startDate: r.start_date,
  endDate: r.end_date,
  prescriber: r.prescriber,
  status: r.status,
  stoppedOn: r.stopped_on,
  stopReason: r.stop_reason,
  replacesId: r.replaces_id,
  createdAt: r.created_at,
});

/**
 * Traitement en cours le jour `today` (AAAA-MM-JJ) : ni terminé (date de fin passée), ni arrêté
 * (un arrêt daté du futur laisse le traitement en cours jusqu'à la veille de l'arrêt).
 */
export function isOngoing(m: Pick<MedicationRow, 'status' | 'endDate' | 'stoppedOn'>, today: string): boolean {
  if (m.endDate && m.endDate < today) return false;
  if (m.status === 'stopped') return !!m.stoppedOn && m.stoppedOn > today;
  return m.status === 'active';
}

/** Dernier jour de prise prévu (veille de l'arrêt, ou date de fin), ou null si sans fin. */
export function lastDay(m: Pick<MedicationRow, 'endDate' | 'stoppedOn'>): string | null {
  const beforeStop = m.stoppedOn ? formatLocalDate(addDays(parseLocalDate(m.stoppedOn)!, -1)) : null;
  if (beforeStop && m.endDate) return beforeStop < m.endDate ? beforeStop : m.endDate;
  return beforeStop ?? m.endDate;
}

/** Délai pendant lequel une prise future peut déjà être renseignée. */
const EARLY_RECORD_MS = 60 * 60_000;

export function createMedicationsService(cfg: MedicationsConfig) {
  const tz = cfg.timeZone ?? 'Europe/Paris';
  const now = cfg.now ?? (() => new Date());
  const P = cfg.profiles;
  const today = () => formatLocalDate(localDateOf(now(), tz));

  async function list(actor: Actor, profileId: string): Promise<{ current: MedicationRow[]; past: MedicationRow[] }> {
    const rows = await P.withProfileData(actor, profileId, 'medications', 'read', (tx) =>
      tx<Row[]>`SELECT ${tx.unsafe(COLS)} FROM medication
                WHERE profile_id = ${profileId} AND deleted_at IS NULL AND status IN ('active', 'stopped')
                ORDER BY name, start_date NULLS FIRST, created_at`,
    );
    const t = today();
    const all = rows.map(toRow);
    const isCurrent = (m: MedicationRow) => isOngoing(m, t);
    return {
      current: all.filter(isCurrent),
      past: all.filter((m) => !isCurrent(m)).sort((a, b) => (b.stoppedOn ?? b.endDate ?? '').localeCompare(a.stoppedOn ?? a.endDate ?? '')),
    };
  }

  async function get(actor: Actor, profileId: string, id: string): Promise<(MedicationRow & { history: MedicationRow[] }) | null> {
    if (!UUID.test(id)) return null;
    return P.withProfileData(actor, profileId, 'medications', 'read', async (tx) => {
      const [r] = await tx<Row[]>`SELECT ${tx.unsafe(COLS)} FROM medication WHERE id = ${id} AND profile_id = ${profileId} AND deleted_at IS NULL`;
      if (!r) return null;
      // Prescriptions précédentes (chaîne `replaces_id`), de la plus récente à la plus ancienne.
      const history: MedicationRow[] = [];
      let prev = r.replaces_id;
      while (prev && history.length < 50) {
        const [p] = await tx<Row[]>`SELECT ${tx.unsafe(COLS)} FROM medication WHERE id = ${prev} AND profile_id = ${profileId} AND deleted_at IS NULL`;
        if (!p) break;
        history.push(toRow(p));
        prev = p.replaces_id;
      }
      return { ...toRow(r), history };
    });
  }

  type SaveResult = { ok: true; id: string } | { ok: false; errors: MedicationErrors };

  /** Ajout, ou correction d'une saisie (faute de frappe) : ne crée pas d'historique. */
  async function save(actor: Actor, profileId: string, input: MedicationInput, id?: string): Promise<SaveResult> {
    const v = validateMedication(input);
    if (!v.ok) return v;
    const m = v.value;
    return P.withProfileData(actor, profileId, 'medications', 'write', async (tx) => {
      if (id) {
        if (!UUID.test(id)) return { ok: false as const, errors: { name: 'Traitement introuvable.' } };
        const r = await tx`
          UPDATE medication SET name = ${m.name}, strength = ${m.strength}, posology_text = ${m.posology}, schedule = ${tx.json(m.schedule as never)},
                 start_date = ${m.startDate}, end_date = ${m.endDate}, prescriber = ${m.prescriber}, updated_at = ${now()}
          WHERE id = ${id} AND profile_id = ${profileId} AND deleted_at IS NULL RETURNING id`;
        return r.length ? { ok: true as const, id } : { ok: false as const, errors: { name: 'Traitement introuvable.' } };
      }
      const [r] = await tx<{ id: string }[]>`
        INSERT INTO medication (profile_id, name, strength, posology_text, schedule, start_date, end_date, prescriber, status,
                                source_type, confirmed_by, confirmed_at, created_by, created_at)
        VALUES (${profileId}, ${m.name}, ${m.strength}, ${m.posology}, ${tx.json(m.schedule as never)}, ${m.startDate}, ${m.endDate}, ${m.prescriber}, 'active',
                'manual', ${actor.accountId}, ${now()}, ${actor.accountId}, ${now()})
        RETURNING id`;
      return { ok: true as const, id: r!.id };
    });
  }

  /**
   * Nouvelle prescription (changement de dose, d'horaires…) à partir de `effectiveDate` :
   * l'ancienne ligne est arrêtée ce jour-là, la nouvelle la remplace. Rien n'est effacé.
   */
  async function change(actor: Actor, profileId: string, id: string, input: MedicationInput, effectiveDate: string): Promise<SaveResult> {
    if (!UUID.test(id)) return { ok: false, errors: { name: 'Traitement introuvable.' } };
    const eff = parseLocalDate(effectiveDate.trim()) ? effectiveDate.trim() : null;
    if (!eff) return { ok: false, errors: { startDate: 'Indiquez la date du changement.' } };
    const v = validateMedication({ ...input, startDate: eff });
    if (!v.ok) return v;
    const m = v.value;
    return P.withProfileData(actor, profileId, 'medications', 'write', async (tx) => {
      const [old] = await tx<{ start_date: string | null }[]>`
        SELECT start_date::text FROM medication WHERE id = ${id} AND profile_id = ${profileId} AND deleted_at IS NULL AND status = 'active' FOR UPDATE`;
      if (!old) return { ok: false as const, errors: { name: 'Traitement introuvable ou déjà arrêté.' } };
      if (old.start_date && eff <= old.start_date) return { ok: false as const, errors: { startDate: 'Le changement doit être postérieur au début du traitement actuel.' } };
      await tx`UPDATE medication SET status = 'stopped', stopped_on = ${eff}, stop_reason = 'Nouvelle prescription', updated_at = ${now()}
               WHERE id = ${id}`;
      const [r] = await tx<{ id: string }[]>`
        INSERT INTO medication (profile_id, name, strength, posology_text, schedule, start_date, end_date, prescriber, status,
                                source_type, confirmed_by, confirmed_at, created_by, created_at, replaces_id)
        VALUES (${profileId}, ${m.name}, ${m.strength}, ${m.posology}, ${tx.json(m.schedule as never)}, ${eff}, ${m.endDate}, ${m.prescriber}, 'active',
                'manual', ${actor.accountId}, ${now()}, ${actor.accountId}, ${now()}, ${id})
        RETURNING id`;
      return { ok: true as const, id: r!.id };
    });
  }

  /** Arrêt du traitement à partir de `date` (ce jour-là n'est plus prévu). */
  async function stop(actor: Actor, profileId: string, id: string, date: string, reason?: string): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!UUID.test(id)) return { ok: false, error: 'Traitement introuvable.' };
    const d = date.trim();
    if (!parseLocalDate(d)) return { ok: false, error: 'Indiquez la date d’arrêt.' };
    const why = reason?.trim().slice(0, 300) || null;
    return P.withProfileData(actor, profileId, 'medications', 'write', async (tx) => {
      const r = await tx`
        UPDATE medication SET status = 'stopped', stopped_on = ${d}, stop_reason = ${why}, updated_at = ${now()}
        WHERE id = ${id} AND profile_id = ${profileId} AND deleted_at IS NULL AND status = 'active'
          AND (start_date IS NULL OR start_date < ${d}::date) RETURNING id`;
      return r.length ? { ok: true as const } : { ok: false as const, error: 'Arrêt impossible : traitement introuvable, déjà arrêté, ou date antérieure au début.' };
    });
  }

  /** Suppression d'une saisie erronée (suppression logique). La prescription précédente reprend si besoin. */
  async function remove(actor: Actor, profileId: string, id: string): Promise<boolean> {
    if (!UUID.test(id)) return false;
    return P.withProfileData(actor, profileId, 'medications', 'write', async (tx) =>
      (await tx`UPDATE medication SET deleted_at = ${now()} WHERE id = ${id} AND profile_id = ${profileId} AND deleted_at IS NULL RETURNING id`).length > 0,
    );
  }

  async function schedulable(tx: Parameters<Parameters<ProfilesService['withProfileData']>[4]>[0], profileId: string) {
    const rows = await tx<Row[]>`SELECT ${tx.unsafe(COLS)} FROM medication
                                 WHERE profile_id = ${profileId} AND deleted_at IS NULL AND status IN ('active', 'stopped')`;
    return rows.map(toRow);
  }

  /** Prises prévues un jour donné, avec ce qui a été renseigné. */
  async function day(actor: Actor, profileId: string, d: LocalDate): Promise<DoseOfDay[]> {
    return P.withProfileData(actor, profileId, 'medications', 'read', async (tx) => {
      const meds = await schedulable(tx, profileId);
      const planned = plannedFor(meds, d, tz);
      if (!planned.length) return [];
      const recs = await tx<{ medication_id: string; scheduled_at: Date; status: 'taken' | 'skipped' }[]>`
        SELECT medication_id, scheduled_at, status FROM medication_intake
        WHERE profile_id = ${profileId} AND scheduled_at >= ${planned[0]!.at} AND scheduled_at <= ${planned.at(-1)!.at} AND status <> 'missed'`;
      const byKey = new Map(recs.map((r) => [`${r.medication_id}|${r.scheduled_at.getTime()}`, r.status]));
      const byId = new Map(meds.map((m) => [m.id, m]));
      const limit = now().getTime() + EARLY_RECORD_MS;
      return planned.map((p) => ({
        medicationId: p.medicationId,
        name: byId.get(p.medicationId)!.name,
        strength: byId.get(p.medicationId)!.strength,
        at: p.at,
        time: p.time,
        qty: p.qty,
        status: byKey.get(`${p.medicationId}|${p.at.getTime()}`) ?? null,
        recordable: p.at.getTime() <= limit,
      }));
    });
  }

  /**
   * Renseigne une prise prévue (prise / non prise), ou efface la saisie (`status` null).
   * Refuse une heure qui ne correspond à aucune prise prévue de ce traitement.
   */
  async function record(actor: Actor, profileId: string, medicationId: string, scheduledAt: Date, status: 'taken' | 'skipped' | null): Promise<boolean> {
    if (!UUID.test(medicationId) || Number.isNaN(scheduledAt.getTime())) return false;
    if (scheduledAt.getTime() > now().getTime() + EARLY_RECORD_MS) return false;
    return P.withProfileData(actor, profileId, 'medications', 'write', async (tx) => {
      const meds = (await schedulable(tx, profileId)).filter((m) => m.id === medicationId);
      if (!meds.length) return false;
      const d = localDateOf(scheduledAt, tz);
      if (!plannedFor(meds, d, tz).some((p) => p.at.getTime() === scheduledAt.getTime())) return false;
      if (status === null) {
        await tx`DELETE FROM medication_intake WHERE medication_id = ${medicationId} AND profile_id = ${profileId} AND scheduled_at = ${scheduledAt}`;
        return true;
      }
      await tx`
        INSERT INTO medication_intake (medication_id, profile_id, scheduled_at, taken_at, status, recorded_by, recorded_at)
        VALUES (${medicationId}, ${profileId}, ${scheduledAt}, ${status === 'taken' ? now() : null}, ${status}, ${actor.accountId}, ${now()})
        ON CONFLICT (medication_id, scheduled_at) DO UPDATE
          SET status = EXCLUDED.status, taken_at = EXCLUDED.taken_at, recorded_by = EXCLUDED.recorded_by, recorded_at = EXCLUDED.recorded_at`;
      return true;
    });
  }

  /** Suivi des prises sur les `days` derniers jours (aujourd'hui inclus). */
  async function followUp(actor: Actor, profileId: string, days: number): Promise<Adherence & { from: string; to: string }> {
    const to = localDateOf(now(), tz);
    return followUpRange(actor, profileId, addDays(to, -(Math.max(1, days) - 1)), to);
  }

  /** Suivi des prises sur [from, to] (jours locaux), limité aux prises déjà passées. */
  async function followUpRange(actor: Actor, profileId: string, from: LocalDate, to: LocalDate): Promise<Adherence & { from: string; to: string }> {
    return P.withProfileData(actor, profileId, 'medications', 'read', async (tx) => {
      const meds = await schedulable(tx, profileId);
      const recs = await tx<{ medication_id: string; scheduled_at: Date; status: 'taken' | 'skipped' }[]>`
        SELECT medication_id, scheduled_at, status FROM medication_intake
        WHERE profile_id = ${profileId} AND status IN ('taken', 'skipped')
          AND scheduled_at >= ${dayBounds(from, tz).start} AND scheduled_at < ${dayBounds(addDays(to, 1), tz).start}`;
      const a = adherence(meds, recs.map((r) => ({ medicationId: r.medication_id, scheduledAt: r.scheduled_at, status: r.status })), from, to, now(), tz);
      return { ...a, from: formatLocalDate(from), to: formatLocalDate(to) };
    });
  }

  return { list, get, save, change, stop, remove, day, record, followUp, followUpRange };
}

export type MedicationsService = ReturnType<typeof createMedicationsService>;
