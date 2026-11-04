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
