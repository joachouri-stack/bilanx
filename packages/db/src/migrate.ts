import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type postgres from 'postgres';

/**
 * Applique, dans l'ordre et une seule fois, les fichiers `NNNN_nom.sql` du dossier.
 * Chaque migration s'exécute dans une transaction ; une somme de contrôle
 * empêche de modifier silencieusement une migration déjà appliquée.
 */
export async function migrate(sql: postgres.Sql, dir: string, log: (m: string) => void = () => {}): Promise<string[]> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migration (
      name       text PRIMARY KEY,
      checksum   text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`;
  const files = (await readdir(dir)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  const applied = new Map((await sql<{ name: string; checksum: string }[]>`SELECT name, checksum FROM schema_migration`).map((r) => [r.name, r.checksum]));
  const done: string[] = [];
  for (const file of files) {
    const content = await readFile(join(dir, file), 'utf8');
    const checksum = createHash('sha256').update(content).digest('hex');
    const prev = applied.get(file);
    if (prev) {
      if (prev !== checksum) throw new Error(`La migration ${file} a été modifiée après application. Créez une nouvelle migration.`);
      continue;
    }
    await sql.begin(async (tx) => {
      await tx.unsafe(content);
      await tx`INSERT INTO schema_migration (name, checksum) VALUES (${file}, ${checksum})`;
    });
    log(`✓ ${file}`);
    done.push(file);
  }
  return done;
}
