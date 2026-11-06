import { ForbiddenError } from '@bilanx/profiles';
import { activity, apiTokens } from '@/lib/server/auth';
import { parseDay, parseSteps } from '@/lib/steps-sync';

export const dynamic = 'force-dynamic';

/**
 * Réception du nombre de pas envoyé par le Raccourci iPhone.
 *   POST /api/v1/pas
 *   Authorization: Bearer bx_…   (clé personnelle créée dans Activité & Pas)
 *   Corps JSON : { "pas": 8450, "date": "2026-11-06" }   (date facultative : aujourd'hui, heure de Paris)
 * Le total d'un jour remplace le précédent (renvoyer le même jour ne crée pas de doublon).
 */
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  const auth = request.headers.get('authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  const who = token ? await apiTokens().verify(token, 'steps') : null;
  if (!who) return json({ ok: false, error: 'Clé absente, invalide ou révoquée.' }, 401);

  if (Number(request.headers.get('content-length') ?? 0) > 10_000) return json({ ok: false, error: 'Requête trop volumineuse.' }, 413);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'Corps JSON attendu : { "pas": 8450 }.' }, 400);
  }
  const steps = parseSteps(body?.pas ?? body?.steps);
  if (steps === null) return json({ ok: false, error: 'Champ « pas » manquant ou illisible.' }, 400);
  const day = parseDay(body?.date);
  if (!day) return json({ ok: false, error: 'Date illisible (format AAAA-MM-JJ).' }, 400);

  try {
    const r = await activity().syncDay({ accountId: who.accountId, email: '' }, who.profileId, day, steps);
    if (!r.ok) return json({ ok: false, error: r.error }, 400);
  } catch (e) {
    if (e instanceof ForbiddenError) return json({ ok: false, error: 'Ce compte n’a plus le droit de modifier l’activité de ce profil.' }, 403);
    throw e;
  }
  return json({ ok: true, date: day, pas: steps });
}
