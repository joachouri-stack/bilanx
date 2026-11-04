import { validateAppointment, type AppointmentErrors, type AppointmentInput } from '@bilanx/domain';
import type { Actor, ProfilesService } from '@bilanx/profiles';

export interface AppointmentsConfig {
  profiles: ProfilesService;
  timeZone?: string;
  now?: () => Date;
}

export interface AppointmentRow {
  id: string;
  startsAt: Date;
  specialty: string | null;
  practitioner: string | null;
  location: string | null;
  reason: string | null;
  toPrepare: string | null;
  reminderMinutes: number | null;
  notesAfter: string | null;
}

export interface LinkRow {
  id: string;
  documentId: string | null;
  labResultId: string | null;
}

const UUID = /^[0-9a-f-]{36}$/i;
type Row = { id: string; starts_at: Date; specialty: string | null; practitioner: string | null; location: string | null; reason: string | null; to_prepare: string | null; reminder_minutes: number[] | null; notes_after: string | null };
const toRow = (r: Row): AppointmentRow => ({
  id: r.id,
  startsAt: r.starts_at,
  specialty: r.specialty,
  practitioner: r.practitioner,
  location: r.location,
  reason: r.reason,
  toPrepare: r.to_prepare,
  reminderMinutes: r.reminder_minutes?.[0] ?? null,
  notesAfter: r.notes_after,
});

export function createAppointmentsService(cfg: AppointmentsConfig) {
  const tz = cfg.timeZone ?? 'Europe/Paris';
  const now = cfg.now ?? (() => new Date());
  const P = cfg.profiles;

  async function save(actor: Actor, profileId: string, input: AppointmentInput, id?: string): Promise<{ ok: true; id: string } | { ok: false; errors: AppointmentErrors }> {
    const v = validateAppointment(input, now(), tz);
    if (!v.ok) return v;
    const a = v.value;
    const reminder = a.reminderMinutes === null ? null : [a.reminderMinutes];
    return P.withProfileData(actor, profileId, 'appointments', 'write', async (tx) => {
      if (id) {
        if (!UUID.test(id)) return { ok: false as const, errors: { date: 'Rendez-vous introuvable.' } };
        const r = await tx<{ id: string }[]>`
          UPDATE appointment SET starts_at = ${a.startsAt}, specialty = ${a.specialty}, practitioner = ${a.practitioner}, location = ${a.location},
                 reason = ${a.reason}, to_prepare = ${a.toPrepare}, reminder_minutes = ${reminder}, notes_after = ${a.notesAfter}, updated_at = ${now()}
          WHERE id = ${id} AND profile_id = ${profileId} AND deleted_at IS NULL RETURNING id`;
        return r.length ? { ok: true as const, id } : { ok: false as const, errors: { date: 'Rendez-vous introuvable.' } };
      }
      const [r] = await tx<{ id: string }[]>`
        INSERT INTO appointment (profile_id, starts_at, specialty, practitioner, location, reason, to_prepare, reminder_minutes, notes_after, created_by, created_at)
        VALUES (${profileId}, ${a.startsAt}, ${a.specialty}, ${a.practitioner}, ${a.location}, ${a.reason}, ${a.toPrepare}, ${reminder}, ${a.notesAfter},
                ${actor.accountId}, ${now()})
        RETURNING id`;
      return { ok: true as const, id: r!.id };
    });
  }

  async function list(actor: Actor, profileId: string): Promise<{ upcoming: AppointmentRow[]; past: AppointmentRow[] }> {
    const rows = await P.withProfileData(actor, profileId, 'appointments', 'read', (tx) =>
      tx<Row[]>`
        SELECT id, starts_at, specialty, practitioner, location, reason, to_prepare, reminder_minutes, notes_after
        FROM appointment WHERE profile_id = ${profileId} AND deleted_at IS NULL ORDER BY starts_at`,
    );
    // Un rendez-vous reste « à venir » jusqu'à 2 h après son début.
    const limit = now().getTime() - 2 * 3_600_000;
    const all = rows.map(toRow);
    return { upcoming: all.filter((a) => a.startsAt.getTime() >= limit), past: all.filter((a) => a.startsAt.getTime() < limit).reverse() };
  }

  async function get(actor: Actor, profileId: string, id: string): Promise<(AppointmentRow & { links: LinkRow[] }) | null> {
    if (!UUID.test(id)) return null;
    return P.withProfileData(actor, profileId, 'appointments', 'read', async (tx) => {
      const [r] = await tx<Row[]>`
        SELECT id, starts_at, specialty, practitioner, location, reason, to_prepare, reminder_minutes, notes_after
        FROM appointment WHERE id = ${id} AND profile_id = ${profileId} AND deleted_at IS NULL`;
      if (!r) return null;
      const links = await tx<{ id: string; document_id: string | null; lab_result_id: string | null }[]>`
        SELECT id, document_id, lab_result_id FROM appointment_link WHERE appointment_id = ${id} AND profile_id = ${profileId}`;
      return { ...toRow(r), links: links.map((l) => ({ id: l.id, documentId: l.document_id, labResultId: l.lab_result_id })) };
    });
  }

  async function remove(actor: Actor, profileId: string, id: string): Promise<boolean> {
    if (!UUID.test(id)) return false;
    return P.withProfileData(actor, profileId, 'appointments', 'write', async (tx) =>
      (await tx`UPDATE appointment SET deleted_at = ${now()} WHERE id = ${id} AND profile_id = ${profileId} AND deleted_at IS NULL RETURNING id`).length > 0,
    );
  }

  /**
   * Associe un document ou un résultat au rendez-vous. L'élément doit appartenir au même
   * profil et être lisible par le compte (module Documents ou Analyses).
   */
  async function link(actor: Actor, profileId: string, appointmentId: string, target: { documentId?: string; labResultId?: string }): Promise<boolean> {
    const docId = target.documentId && UUID.test(target.documentId) ? target.documentId : null;
    const labId = target.labResultId && UUID.test(target.labResultId) ? target.labResultId : null;
    if (!UUID.test(appointmentId) || (docId ? 1 : 0) + (labId ? 1 : 0) !== 1) return false;
    const exists = docId
      ? await P.withProfileData(actor, profileId, 'documents', 'read', async (tx) =>
          (await tx`SELECT 1 FROM document WHERE id = ${docId} AND profile_id = ${profileId} AND deleted_at IS NULL`).length > 0)
      : await P.withProfileData(actor, profileId, 'lab', 'read', async (tx) =>
          (await tx`SELECT 1 FROM lab_result WHERE id = ${labId} AND profile_id = ${profileId} AND deleted_at IS NULL`).length > 0);
    if (!exists) return false;
    return P.withProfileData(actor, profileId, 'appointments', 'write', async (tx) => {
      const [a] = await tx`SELECT 1 FROM appointment WHERE id = ${appointmentId} AND profile_id = ${profileId} AND deleted_at IS NULL`;
      if (!a) return false;
      await tx`
        INSERT INTO appointment_link (appointment_id, profile_id, document_id, lab_result_id)
        VALUES (${appointmentId}, ${profileId}, ${docId}, ${labId}) ON CONFLICT DO NOTHING`;
      return true;
    });
  }

  async function unlink(actor: Actor, profileId: string, linkId: string): Promise<boolean> {
    if (!UUID.test(linkId)) return false;
    return P.withProfileData(actor, profileId, 'appointments', 'write', async (tx) =>
      (await tx`DELETE FROM appointment_link WHERE id = ${linkId} AND profile_id = ${profileId} RETURNING id`).length > 0,
    );
  }

  return { save, list, get, remove, link, unlink };
}

export type AppointmentsService = ReturnType<typeof createAppointmentsService>;
