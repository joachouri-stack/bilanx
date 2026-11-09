import { validateContact, type ContactErrors, type ContactInput } from '@bilanx/domain';
import type { Actor, ProfilesService } from '@bilanx/profiles';

/** Contacts des professionnels de santé d'un profil (mêmes droits que les rendez-vous). */
export interface ContactsConfig {
  profiles: ProfilesService;
  now?: () => Date;
}

export interface ContactRow {
  id: string;
  firstName: string | null;
  lastName: string | null;
  specialty: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
}

const UUID = /^[0-9a-f-]{36}$/i;
type Row = { id: string; first_name: string | null; last_name: string | null; specialty: string | null; phone: string | null; email: string | null; address: string | null; notes: string | null };
const toRow = (r: Row): ContactRow => ({
  id: r.id,
  firstName: r.first_name,
  lastName: r.last_name,
  specialty: r.specialty,
  phone: r.phone,
  email: r.email,
  address: r.address,
  notes: r.notes,
});

export function createContactsService(cfg: ContactsConfig) {
  const now = cfg.now ?? (() => new Date());
  const P = cfg.profiles;

  async function save(actor: Actor, profileId: string, input: ContactInput, id?: string): Promise<{ ok: true; id: string } | { ok: false; errors: ContactErrors }> {
    const v = validateContact(input);
    if (!v.ok) return v;
    const c = v.value;
    return P.withProfileData(actor, profileId, 'appointments', 'write', async (tx) => {
      if (id) {
        if (!UUID.test(id)) return { ok: false as const, errors: { lastName: 'Contact introuvable.' } };
        const r = await tx<{ id: string }[]>`
          UPDATE health_contact SET first_name = ${c.firstName}, last_name = ${c.lastName}, specialty = ${c.specialty}, phone = ${c.phone},
                 email = ${c.email}, address = ${c.address}, notes = ${c.notes}, updated_at = ${now()}
          WHERE id = ${id} AND profile_id = ${profileId} AND deleted_at IS NULL RETURNING id`;
        return r.length ? { ok: true as const, id } : { ok: false as const, errors: { lastName: 'Contact introuvable.' } };
      }
      const [r] = await tx<{ id: string }[]>`
        INSERT INTO health_contact (profile_id, first_name, last_name, specialty, phone, email, address, notes, created_by, created_at)
        VALUES (${profileId}, ${c.firstName}, ${c.lastName}, ${c.specialty}, ${c.phone}, ${c.email}, ${c.address}, ${c.notes}, ${actor.accountId}, ${now()})
        RETURNING id`;
      return { ok: true as const, id: r!.id };
    });
  }

  /** Contacts du profil, par ordre alphabétique (nom, puis prénom). */
  async function list(actor: Actor, profileId: string): Promise<ContactRow[]> {
    const rows = await P.withProfileData(actor, profileId, 'appointments', 'read', (tx) =>
      tx<Row[]>`
        SELECT id, first_name, last_name, specialty, phone, email, address, notes
        FROM health_contact WHERE profile_id = ${profileId} AND deleted_at IS NULL`,
    );
    const key = (c: ContactRow) => `${c.lastName ?? c.firstName ?? ''} ${c.firstName ?? ''}`;
    return rows.map(toRow).sort((a, b) => key(a).localeCompare(key(b), 'fr', { sensitivity: 'base' }));
  }

  async function get(actor: Actor, profileId: string, id: string): Promise<ContactRow | null> {
    if (!UUID.test(id)) return null;
    return P.withProfileData(actor, profileId, 'appointments', 'read', async (tx) => {
      const [r] = await tx<Row[]>`
        SELECT id, first_name, last_name, specialty, phone, email, address, notes
        FROM health_contact WHERE id = ${id} AND profile_id = ${profileId} AND deleted_at IS NULL`;
      return r ? toRow(r) : null;
    });
  }

  async function remove(actor: Actor, profileId: string, id: string): Promise<boolean> {
    if (!UUID.test(id)) return false;
    return P.withProfileData(actor, profileId, 'appointments', 'write', async (tx) =>
      (await tx`UPDATE health_contact SET deleted_at = ${now()} WHERE id = ${id} AND profile_id = ${profileId} AND deleted_at IS NULL RETURNING id`).length > 0,
    );
  }

  return { save, list, get, remove };
}

export type ContactsService = ReturnType<typeof createContactsService>;
