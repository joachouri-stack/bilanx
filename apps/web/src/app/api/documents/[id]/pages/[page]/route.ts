import { ForbiddenError } from '@bilanx/profiles';
import { currentSession, documents, profiles } from '@/lib/server/auth';
import { cookies } from 'next/headers';
import { PROFILE_COOKIE } from '@/lib/server/context';

export const dynamic = 'force-dynamic';

/**
 * Restitue une page originale, déchiffrée à la volée, au compte autorisé (module Documents).
 * Jamais mise en cache ; chaque consultation est journalisée.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string; page: string }> }) {
  const s = await currentSession();
  if (!s?.mfaPassed) return new Response('Non connecté.', { status: 401 });
  const { id, page } = await params;
  const n = Number(page);
  // Même règle que les pages : profil choisi (revalidé), sinon le premier profil accessible.
  const wanted = (await cookies()).get(PROFILE_COOKIE)?.value;
  const list = await profiles().listProfiles(s.accountId);
  const profileId = (list.find((p) => p.profileId === wanted) ?? list[0])?.profileId;
  if (!profileId || !Number.isInteger(n) || n < 1) return new Response('Introuvable.', { status: 404 });
  try {
    const [file] = await documents().readFiles(s, profileId, id, n);
    if (!file) return new Response('Introuvable.', { status: 404 });
    return new Response(new Uint8Array(file.data), {
      headers: {
        'Content-Type': file.mime,
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        // Images : aucun script possible. PDF : type vérifié à l'octet près au dépôt ; affiché par la visionneuse du navigateur.
        ...(file.mime.startsWith('image/') ? { 'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" } : {}),
      },
    });
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response('Accès non autorisé.', { status: 403 });
    throw e;
  }
}
