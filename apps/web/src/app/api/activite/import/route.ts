import { ForbiddenError } from '@bilanx/profiles';
import { activity, currentSession } from '@/lib/server/auth';
import { appContext } from '@/lib/server/context';

export const dynamic = 'force-dynamic';
export const maxDuration = 600;

const MAX_BYTES = 2 * 1024 ** 3; // 2 Go

/** Import de l'export Apple Santé : le fichier est lu en flux, jamais chargé entièrement en mémoire. */
export async function POST(request: Request) {
  const s = await currentSession();
  if (!s?.mfaPassed) return Response.json({ ok: false, error: 'Non connecté.' }, { status: 401 });
  const ctx = await appContext();
  if (ctx.active.kind !== 'real') return Response.json({ ok: false, error: 'Le profil de démonstration est en lecture seule.' }, { status: 400 });
  if (!request.body) return Response.json({ ok: false, error: 'Fichier manquant.' }, { status: 400 });
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BYTES) return Response.json({ ok: false, error: 'Fichier trop volumineux (2 Go maximum).' }, { status: 413 });
  let seen = 0;
  const body = request.body;
  async function* chunks() {
    for await (const c of body as unknown as AsyncIterable<Uint8Array>) {
      seen += c.length;
      if (seen > MAX_BYTES) throw new Error('trop volumineux');
      yield c;
    }
  }
  try {
    const r = await activity().importAppleHealth(ctx.user, ctx.active.access.profileId, chunks());
    return Response.json(r, { status: r.ok ? 200 : 400 });
  } catch (e) {
    if (e instanceof ForbiddenError) return Response.json({ ok: false, error: e.message }, { status: 403 });
    throw e;
  }
}
