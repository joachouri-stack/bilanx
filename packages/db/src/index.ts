import postgres from 'postgres';

export type Sql = postgres.Sql;
export type TransactionSql = postgres.TransactionSql;

/**
 * Client PostgreSQL. En production, DATABASE_URL doit imposer TLS
 * (`?sslmode=require`) vers la base de l'hébergeur certifié HDS.
 */
export function createSql(url = process.env.DATABASE_URL, options: postgres.Options<{}> = {}): Sql {
  if (!url) throw new Error('DATABASE_URL manquant : voir .env.example');
  return postgres(url, {
    max: 10,
    idle_timeout: 30,
    onnotice: () => {},
    // Les bytea sont renvoyés en Buffer, les timestamptz en Date.
    ...options,
  });
}

/** Rôle sous lequel l'application accède aux données (migration 0012) : la RLS s'applique toujours. */
export const APP_DB_ROLE = 'bilanx_app';

/**
 * Client de l'application : connexion avec DATABASE_URL, mais requêtes exécutées sous le rôle
 * `bilanx_app` (ni superutilisateur, ni BYPASSRLS, ni propriétaire des tables), même si le
 * compte fourni par l'hébergeur est superutilisateur. Les migrations utilisent `createSql`.
 */
export function createAppSql(url = process.env.DATABASE_URL, options: postgres.Options<{}> = {}): Sql {
  return createSql(url, { ...options, connection: { ...options.connection, role: APP_DB_ROLE } });
}
