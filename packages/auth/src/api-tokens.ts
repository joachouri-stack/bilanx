import { createHash, randomBytes } from 'node:crypto';
import type { Sql } from '@bilanx/db';

/**
 * Clés d'envoi automatique (Raccourcis iPhone → BILANX).
 * Format « bx_ » + 32 octets aléatoires (base64url) ; seule l'empreinte SHA-256 est stockée.
 * La clé est liée à un compte ET à un profil ; l'appelant revérifie les droits à chaque usage.
 */
export type ApiTokenScope = 'steps';

export interface ApiTokenInfo {
  id: string;
  label: string;
  hint: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

const hash = (token: string) => createHash('sha256').update(token, 'utf8').digest();
const MAX_ACTIVE = 5;

export function createApiTokenService(cfg: { sql: Sql; now?: () => Date }) {
  const { sql } = cfg;
  const now = cfg.now ?? (() => new Date());

  /** Crée une clé et la renvoie en clair (une seule fois). */
  async function create(accountId: string, profileId: string, scope: ApiTokenScope, label: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
    const [{ n } = { n: 0 }] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM api_token WHERE account_id = ${accountId} AND profile_id = ${profileId} AND scope = ${scope} AND revoked_at IS NULL`;
    if (n >= MAX_ACTIVE) return { ok: false, error: `${MAX_ACTIVE} clés actives au plus : révoquez-en une d’abord.` };
    const token = `bx_${randomBytes(32).toString('base64url')}`;
    await sql`
      INSERT INTO api_token (account_id, profile_id, scope, label, token_hash, hint, created_at)
      VALUES (${accountId}, ${profileId}, ${scope}, ${label.slice(0, 60)}, ${hash(token)}, ${token.slice(-4)}, ${now()})`;
    return { ok: true, token };
  }

  async function list(accountId: string, profileId: string, scope: ApiTokenScope): Promise<ApiTokenInfo[]> {
    const rows = await sql<{ id: string; label: string; hint: string; created_at: Date; last_used_at: Date | null }[]>`
      SELECT id, label, hint, created_at, last_used_at FROM api_token
      WHERE account_id = ${accountId} AND profile_id = ${profileId} AND scope = ${scope} AND revoked_at IS NULL
      ORDER BY created_at DESC`;
    return rows.map((r) => ({ id: r.id, label: r.label, hint: r.hint, createdAt: r.created_at, lastUsedAt: r.last_used_at }));
  }

  async function revoke(accountId: string, id: string): Promise<boolean> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
    const rows = await sql`UPDATE api_token SET revoked_at = ${now()} WHERE id = ${id} AND account_id = ${accountId} AND revoked_at IS NULL RETURNING id`;
    return rows.length > 0;
  }

  /** Clé valide et non révoquée → compte et profil ; met à jour la date de dernière utilisation. */
  async function verify(token: string, scope: ApiTokenScope): Promise<{ accountId: string; profileId: string } | null> {
    if (!/^bx_[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const [row] = await sql<{ account_id: string; profile_id: string }[]>`
      UPDATE api_token t SET last_used_at = ${now()}
      FROM account a
      WHERE t.token_hash = ${hash(token)} AND t.scope = ${scope} AND t.revoked_at IS NULL AND a.id = t.account_id AND a.deleted_at IS NULL
      RETURNING t.account_id, t.profile_id`;
    return row ? { accountId: row.account_id, profileId: row.profile_id } : null;
  }

  return { create, list, revoke, verify };
}

export type ApiTokenService = ReturnType<typeof createApiTokenService>;
