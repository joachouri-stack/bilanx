/**
 * Vérification d'une sauvegarde RESTAURÉE : prouve qu'elle est exploitable avec la clé maîtresse.
 * Une sauvegarde jamais restaurée n'est pas une sauvegarde ; une base sans sa clé est illisible
 * (documents et secrets de double authentification chiffrés).
 *
 * À exécuter sur une base de restauration, avec un compte qui voit toutes les lignes
 * (superutilisateur ou BYPASSRLS) : la RLS masquerait sinon les données vérifiées.
 */
import { readdir } from 'node:fs/promises';
import { decrypt, deriveKey, sha256, verifyAuditChain, type AuditChainReport } from '@bilanx/auth';
import type { Sql } from '@bilanx/db';

export interface BackupReport {
  ok: boolean;
  problems: string[];
  migrations: { applied: number; expected: number | null; missing: string[] };
  counts: Record<string, number>;
  documents: { checked: number; pages: number; failed: number; missingPages: number };
  mfaSecrets: { checked: number; failed: number };
  audit: AuditChainReport;
}

const COUNTED = ['account', 'profile', 'lab_result', 'glucose_reading', 'insulin_dose', 'medication', 'medication_intake', 'journal_entry', 'appointment', 'activity_daily', 'gym_visit', 'document', 'audit_log'] as const;

export async function checkBackup(sql: Sql, secretKey: Buffer, migrationsDir?: string): Promise<BackupReport> {
  const problems: string[] = [];
  const [role] = await sql<{ bypass: boolean }[]>`SELECT rolsuper OR rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user`;
  if (!role?.bypass) {
    throw new Error('Ce contrôle doit voir toutes les lignes : connectez-vous à la base restaurée avec un compte superutilisateur (ou BYPASSRLS).');
  }

  // Migrations : la sauvegarde doit correspondre à une version connue du schéma.
  const applied = (await sql<{ name: string }[]>`SELECT name FROM schema_migration ORDER BY name`).map((r) => r.name);
  let expected: string[] | null = null;
  if (migrationsDir) expected = (await readdir(migrationsDir)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  const missing = expected ? expected.filter((f) => !applied.includes(f)) : [];
  // Une sauvegarde plus ancienne que le code est normale : les migrations manquantes s'appliqueront au démarrage.

  const counts: Record<string, number> = {};
  for (const t of COUNTED) counts[t] = (await sql.unsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM ${t}`))[0]!.n;

  // Documents : chaque page est déchiffrée et son empreinte comparée.
  const kek = deriveKey(secretKey, 'document-dek');
  const documents = { checked: 0, pages: 0, failed: 0, missingPages: 0 };
  // Documents supprimés : contenu effacé volontairement, seule la fiche reste ; ils ne sont pas vérifiés.
  const docs = await sql<{ id: string; dek_enc: Buffer; page_count: number | null }[]>`
    SELECT id, dek_enc, page_count FROM document WHERE storage_key LIKE 'db:%' AND deleted_at IS NULL`;
  for (const d of docs) {
    documents.checked++;
    try {
      const dek = decrypt(kek, d.dek_enc, d.id);
      const pages = await sql<{ page: number; data_enc: Buffer; sha256: Buffer }[]>`SELECT page, data_enc, sha256 FROM document_file WHERE document_id = ${d.id}`;
      if (d.page_count !== null && pages.length < d.page_count) documents.missingPages += d.page_count - pages.length;
      for (const p of pages) {
        documents.pages++;
        if (!sha256(decrypt(dek, p.data_enc, `${d.id}:${p.page}`)).equals(p.sha256)) throw new Error('empreinte');
      }
    } catch {
      documents.failed++;
    }
  }
  if (documents.missingPages) problems.push(`${documents.missingPages} page(s) de document absente(s) de la sauvegarde.`);
  if (documents.failed) problems.push(`${documents.failed} document(s) illisible(s) avec cette clé ou altéré(s).`);

  // Secrets de double authentification.
  const totpKey = deriveKey(secretKey, 'totp-secret');
  const mfaSecrets = { checked: 0, failed: 0 };
  for (const f of await sql<{ account_id: string; secret_enc: Buffer }[]>`SELECT account_id, secret_enc FROM mfa_factor WHERE kind = 'totp'`) {
    mfaSecrets.checked++;
    try {
      decrypt(totpKey, f.secret_enc, f.account_id);
    } catch {
      mfaSecrets.failed++;
    }
  }
  if (mfaSecrets.failed) problems.push(`${mfaSecrets.failed} secret(s) de double authentification indéchiffrable(s) : la clé ne correspond pas à cette sauvegarde ?`);

  const audit = await verifyAuditChain(sql);
  if (audit.brokenLinks) problems.push(`Journal d'audit : ${audit.brokenLinks} rupture(s) de chaînage (entrées supprimées ou insérées).`);
  if (audit.altered) problems.push(`Journal d'audit : ${audit.altered} entrée(s) modifiée(s).`);

  return {
    ok: problems.length === 0,
    problems,
    migrations: { applied: applied.length, expected: expected?.length ?? null, missing },
    counts,
    documents,
    mfaSecrets,
    audit,
  };
}
