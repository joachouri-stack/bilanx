import { createSql } from '@bilanx/db';

export const dynamic = 'force-dynamic';

const globalForHealth = globalThis as unknown as { bilanxHealthSql?: ReturnType<typeof createSql> };

/** Contrôle de santé pour l'hébergeur : application démarrée et base joignable. Aucune donnée renvoyée. */
export async function GET() {
  try {
    globalForHealth.bilanxHealthSql ??= createSql(process.env.DATABASE_URL, { max: 1 });
    await globalForHealth.bilanxHealthSql`SELECT 1`;
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
