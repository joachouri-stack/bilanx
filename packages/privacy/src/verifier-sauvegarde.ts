/**
 * Contrôle d'une sauvegarde restaurée.
 *   DATABASE_URL=postgres://postgres:…@localhost:5433/restauration \
 *   BILANX_SECRET_KEY=… npm run sauvegarde:verifier
 * Code de sortie 0 si tout est lisible et intact, 1 sinon.
 */
import { fileURLToPath } from 'node:url';
import { parseSecretKey } from '@bilanx/auth';
import { createSql } from '@bilanx/db';
import { checkBackup } from './backup-check';

const sql = createSql(process.env.DATABASE_URL, { max: 1 });
try {
  const r = await checkBackup(sql, parseSecretKey(process.env.BILANX_SECRET_KEY), fileURLToPath(new URL('../../../db/migrations', import.meta.url)));
  console.log(`Migrations : ${r.migrations.applied} appliquée(s)${r.migrations.expected ? ` sur ${r.migrations.expected}` : ''}`);
  if (r.migrations.missing.length) console.log(`  (sauvegarde plus ancienne que le code : ${r.migrations.missing.join(', ')} s'appliqueront au démarrage)`);
  console.log(`Contenu : ${Object.entries(r.counts).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  console.log(`Documents : ${r.documents.checked} vérifié(s), ${r.documents.pages} page(s), ${r.documents.failed} en échec, ${r.documents.missingPages} page(s) manquante(s)`);
  console.log(`Double authentification : ${r.mfaSecrets.checked} secret(s), ${r.mfaSecrets.failed} en échec`);
  console.log(
    `Journal d'audit : ${r.audit.entries} entrée(s), ${r.audit.verified} vérifiée(s), ${r.audit.unverifiableLegacy} ancienne(s) non recalculable(s), ` +
      `${r.audit.altered} modifiée(s), ${r.audit.brokenLinks} rupture(s)`,
  );
  for (const p of r.problems) console.log(`⚠ ${p}`);
  console.log(r.ok ? '✓ Sauvegarde exploitable avec cette clé.' : '✗ Sauvegarde NON fiable : voir ci-dessus.');
  if (!r.ok) process.exitCode = 1;
} catch (e) {
  console.error(`✗ ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
