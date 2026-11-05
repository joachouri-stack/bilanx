import { cookies } from 'next/headers';
import { sharing } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

/** PDF partagé : uniquement avec un jeton de consultation valide (code saisi depuis moins de 30 min). */
export async function GET(request: Request, { params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const viewer = (await cookies()).get('bilanx_partage')?.value ?? '';
  const pdf = await sharing().pdf(jeton, viewer);
  if (!pdf) return new Response('Accès expiré ou non autorisé : saisissez à nouveau le code.', { status: 403 });
  const download = new URL(request.url).searchParams.get('telecharger') === '1';
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="rapport-bilanx.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
