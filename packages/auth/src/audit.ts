import type { TransactionSql } from '@bilanx/db';
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
export async function writeAudit(tx: TransactionSql, at: Date, e: AuditEntry): Promise<void> {
  await tx`SELECT pg_advisory_xact_lock(7426001)`;
  const [prev] = await tx<{ row_hash: Buffer | null }[]>`SELECT row_hash FROM audit_log ORDER BY id DESC LIMIT 1`;
  const ctx = e.context ?? {};
  const resource = e.resource ?? 'account';
  const resourceId = e.resourceId === undefined ? e.accountId : e.resourceId;
  const payload = JSON.stringify([at.toISOString(), e.accountId, e.profileId ?? null, e.action, resource, resourceId, ctx]);
  const rowHash = sha256(Buffer.concat([prev?.row_hash ?? Buffer.alloc(0), Buffer.from(payload)]));
  await tx`
    INSERT INTO audit_log (occurred_at, account_id, profile_id, action, resource, resource_id, context, prev_hash, row_hash)
    VALUES (${at}, ${e.accountId}, ${e.profileId ?? null}, ${e.action}, ${resource}, ${resourceId}, ${tx.json(ctx as never)},
            ${prev?.row_hash ?? null}, ${rowHash})`;
}
