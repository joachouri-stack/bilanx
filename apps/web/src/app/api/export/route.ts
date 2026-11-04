import { currentSession, privacy } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

/** Export RGPD (art. 15 et 20) : archive ZIP du compte et des profils gérés, produite à la demande. */
export async function GET() {
  const s = await currentSession();
  if (!s?.mfaPassed) return new Response('Non connecté.', { status: 401 });
  const { zip } = await privacy().exportAccount(s);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  return new Response(new Uint8Array(zip), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="bilanx-export-${day}.zip"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
