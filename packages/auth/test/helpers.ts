import { fileURLToPath } from 'node:url';
import { createAppSql, createSql } from '@bilanx/db';
import { migrate } from '../../db/src/migrate';
import { createAuthService, MemoryMailer } from '../src';

export const TEST_DB = process.env.TEST_DATABASE_URL;
const MIGRATIONS = fileURLToPath(new URL('../../../db/migrations', import.meta.url));

/** Base vierge + migrations + service avec horloge contrôlable. */
export async function setupAuth() {
  const admin = createSql(TEST_DB, { max: 1 });
  await admin.unsafe('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await migrate(admin, MIGRATIONS);
  await admin.end();
  // Comme en production : rôle applicatif, la RLS s'applique quel que soit le compte de connexion.
  const sql = createAppSql(TEST_DB, { max: 4 });
  const mailer = new MemoryMailer();
  const clock = { t: new Date('2026-11-04T10:00:00Z') };
  const auth = createAuthService({
    sql,
    mailer,
    secretKey: Buffer.alloc(32, 7),
    appUrl: 'https://bilanx.test',
    now: () => new Date(clock.t),
  });
  const advance = (minutes: number) => {
    clock.t = new Date(clock.t.getTime() + minutes * 60_000);
  };
  return { sql, mailer, auth, clock, advance };
}

export function tokenFrom(text: string | undefined): string {
  const m = /jeton=([A-Za-z0-9_\-%]+)/.exec(text ?? '');
  if (!m) throw new Error('Aucun lien avec jeton dans l’e-mail');
  return decodeURIComponent(m[1]!);
}
