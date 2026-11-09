import { randomUUID } from 'node:crypto';
import type { Sql } from '@bilanx/db';
import { writeAudit } from './audit';
import { decrypt, deriveKey, encrypt } from './crypto';

/**
 * Coffre d'identifiants personnels (Doctolib, Ameli, mutuelle…). Rattaché au compte, jamais partagé.
 * Le mot de passe est chiffré (lié au compte et à l'entrée) ; il n'est déchiffré qu'à la demande, et chaque
 * affichage est journalisé.
 */
export interface VaultEntryView {
  id: string;
  service: string;
  url: string | null;
  login: string | null;
  note: string | null;
  updatedAt: Date;
}

export interface VaultInput {
  service: string;
  url?: string | null;
  login?: string | null;
  password: string;
  note?: string | null;
}

const MAX_ENTRIES = 200;

function cleanUrl(u: string | null | undefined): string | null {
  const t = (u ?? '').trim();
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString().slice(0, 300) : null;
  } catch {
    return null;
  }
}

export function createVaultService(cfg: { sql: Sql; secretKey: Buffer; now?: () => Date }) {
  const { sql } = cfg;
  const now = cfg.now ?? (() => new Date());
  const key = deriveKey(cfg.secretKey, 'vault');
  const aad = (accountId: string, id: string) => `vault:${accountId}:${id}`;

  async function list(accountId: string): Promise<VaultEntryView[]> {
    const rows = await sql<{ id: string; service: string; url: string | null; login: string | null; note: string | null; updated_at: Date }[]>`
      SELECT id, service, url, login, note, updated_at FROM vault_entry WHERE account_id = ${accountId} ORDER BY lower(service), created_at`;
    return rows.map((r) => ({ id: r.id, service: r.service, url: r.url, login: r.login, note: r.note, updatedAt: r.updated_at }));
  }

  async function add(accountId: string, input: VaultInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
    const service = input.service.trim().slice(0, 80);
    if (!service) return { ok: false, error: 'Indiquez le nom du service (ex. Doctolib).' };
    if (!input.password) return { ok: false, error: 'Indiquez le mot de passe.' };
    if (input.password.length > 500) return { ok: false, error: 'Mot de passe trop long.' };
    const [{ n } = { n: 0 }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM vault_entry WHERE account_id = ${accountId}`;
    if (n >= MAX_ENTRIES) return { ok: false, error: `${MAX_ENTRIES} identifiants au plus.` };
    const id = randomUUID();
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO vault_entry (id, account_id, service, url, login, secret_enc, note, created_at, updated_at)
        VALUES (${id}, ${accountId}, ${service}, ${cleanUrl(input.url)}, ${input.login?.trim().slice(0, 200) || null},
                ${encrypt(key, Buffer.from(input.password, 'utf8'), aad(accountId, id))}, ${input.note?.trim().slice(0, 500) || null}, ${now()}, ${now()})`;
      await writeAudit(tx, now(), { accountId, action: 'vault.add', resource: 'vault_entry', resourceId: id });
    });
    return { ok: true, id };
  }

  /** Mot de passe en clair, pour l'afficher ou le copier : l'accès est journalisé. */
  async function reveal(accountId: string, id: string): Promise<string | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    return sql.begin(async (tx) => {
      const [row] = await tx<{ secret_enc: Buffer }[]>`SELECT secret_enc FROM vault_entry WHERE id = ${id} AND account_id = ${accountId}`;
      if (!row) return null;
      await writeAudit(tx, now(), { accountId, action: 'vault.reveal', resource: 'vault_entry', resourceId: id });
      return decrypt(key, row.secret_enc, aad(accountId, id)).toString('utf8');
    }) as Promise<string | null>;
  }

  async function updatePassword(accountId: string, id: string, password: string): Promise<boolean> {
    if (!/^[0-9a-f-]{36}$/i.test(id) || !password || password.length > 500) return false;
    const rows = await sql.begin(async (tx) => {
      const r = await tx`UPDATE vault_entry SET secret_enc = ${encrypt(key, Buffer.from(password, 'utf8'), aad(accountId, id))}, updated_at = ${now()}
                         WHERE id = ${id} AND account_id = ${accountId} RETURNING id`;
      if (r.length) await writeAudit(tx, now(), { accountId, action: 'vault.update', resource: 'vault_entry', resourceId: id });
      return r;
    });
    return rows.length > 0;
  }

  async function remove(accountId: string, id: string): Promise<boolean> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
    const rows = await sql.begin(async (tx) => {
      const r = await tx`DELETE FROM vault_entry WHERE id = ${id} AND account_id = ${accountId} RETURNING id`;
      if (r.length) await writeAudit(tx, now(), { accountId, action: 'vault.delete', resource: 'vault_entry', resourceId: id });
      return r;
    });
    return rows.length > 0;
  }

  return { list, add, reveal, updatePassword, remove };
}

export type VaultService = ReturnType<typeof createVaultService>;
