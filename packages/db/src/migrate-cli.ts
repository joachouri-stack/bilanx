import { fileURLToPath } from 'node:url';
import { createSql } from './index.ts';
import { migrate } from './migrate.ts';

const dir = fileURLToPath(new URL('../../../db/migrations', import.meta.url));
const sql = createSql(process.env.DATABASE_URL, { max: 1 });
try {
  const done = await migrate(sql, dir, console.log);
  console.log(done.length ? `${done.length} migration(s) appliquée(s).` : 'Base à jour.');
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
