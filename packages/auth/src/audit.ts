import type { Sql, TransactionSql } from '@bilanx/db';
import { sha256 } from './crypto';

export interface AuditEntry {
  accountId: string | null;
  action: string;
  /** Profil concerné par l'action (accès aux données, autorisations). */
  profileId?: string | null;
  resource?: string;
  resourceId?: string | null;
  /** Jamais de valeur de santé ici : uniquement des identifiants et des métadonnées. */
  context?: Record<string, unknown>;
}

/**
 * Ajoute une entrée au journal d'audit, chaînée par hachage à la précédente
 * (toute suppression ou modification ultérieure devient détectable).
 * Doit être appelée dans une transaction.
 */
/** JSON à clés triées (récursivement) : identique avant et après stockage en jsonb. */
export function canonicalJson(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : x,
  );
}

export interface AuditRowForHash {
  occurredAt: Date;
  accountId: string | null;
  profileId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  context: Record<string, unknown>;
}

/** Contenu haché d'une entrée. Format 1 : ordre d'écriture (historique) ; format 2 : clés triées. */
export function auditPayload(version: 1 | 2, r: AuditRowForHash): string {
  const fields = [r.occurredAt.toISOString(), r.accountId, r.profileId, r.action, r.resource, r.resourceId, r.context];
  return version === 2 ? canonicalJson(['v2', ...fields]) : JSON.stringify(fields);
}

export function auditHash(prev: Buffer | null, payload: string): Buffer {
  return sha256(Buffer.concat([prev ?? Buffer.alloc(0), Buffer.from(payload)]));
}

/**
 * Ajoute une entrée au journal d'audit, chaînée par hachage à la précédente
 * (toute suppression ou modification ultérieure devient détectable).
 * Doit être appelée dans une transaction.
 */
export async function writeAudit(tx: TransactionSql, at: Date, e: AuditEntry): Promise<void> {
  await tx`SELECT pg_advisory_xact_lock(7426001)`;
  const [prev] = await tx<{ row_hash: Buffer | null }[]>`SELECT row_hash FROM audit_log ORDER BY id DESC LIMIT 1`;
  const ctx = e.context ?? {};
  const resource = e.resource ?? 'account';
  const resourceId = e.resourceId === undefined ? e.accountId : e.resourceId;
  const payload = auditPayload(2, { occurredAt: at, accountId: e.accountId, profileId: e.profileId ?? null, action: e.action, resource, resourceId, context: ctx });
  const rowHash = auditHash(prev?.row_hash ?? null, payload);
  await tx`
    INSERT INTO audit_log (occurred_at, account_id, profile_id, action, resource, resource_id, context, prev_hash, row_hash, hash_version)
    VALUES (${at}, ${e.accountId}, ${e.profileId ?? null}, ${e.action}, ${resource}, ${resourceId}, ${tx.json(ctx as never)},
            ${prev?.row_hash ?? null}, ${rowHash}, 2)`;
}

export interface AuditChainReport {
  entries: number;
  /** Chaînage rompu : entrée supprimée, insérée ou réordonnée. */
  brokenLinks: number;
  /** Contenu recalculé et conforme. */
  verified: number;
  /** Contenu ne correspondant plus au hachage : entrée modifiée. */
  altered: number;
  /** Anciennes entrées (format 1) à contexte multi-clés : chaînage vérifié, contenu non recalculable. */
  unverifiableLegacy: number;
}

/** Vérifie tout le journal (nécessite un accès en lecture à audit_log). */
export async function verifyAuditChain(sql: Sql): Promise<AuditChainReport> {
  const rows = await sql<
    { occurred_at: Date; account_id: string | null; profile_id: string | null; action: string; resource: string; resource_id: string | null; context: Record<string, unknown>; prev_hash: Buffer | null; row_hash: Buffer; hash_version: number }[]
  >`SELECT occurred_at, account_id, profile_id, action, resource, resource_id, context, prev_hash, row_hash, hash_version FROM audit_log ORDER BY id`;
  const r: AuditChainReport = { entries: rows.length, brokenLinks: 0, verified: 0, altered: 0, unverifiableLegacy: 0 };
  let prev: Buffer | null = null;
  for (const row of rows) {
    const linked = prev === null ? row.prev_hash === null : !!row.prev_hash && row.prev_hash.equals(prev);
    if (!linked) r.brokenLinks++;
    const fields: AuditRowForHash = {
      occurredAt: row.occurred_at,
      accountId: row.account_id,
      profileId: row.profile_id,
      action: row.action,
      resource: row.resource,
      resourceId: row.resource_id,
      context: row.context ?? {},
    };
    const ok = auditHash(row.prev_hash, auditPayload(row.hash_version === 2 ? 2 : 1, fields)).equals(row.row_hash);
    if (ok) r.verified++;
    else if (row.hash_version === 1 && Object.keys(fields.context).length > 1) r.unverifiableLegacy++;
    else r.altered++;
    prev = row.row_hash;
  }
  return r;
}
