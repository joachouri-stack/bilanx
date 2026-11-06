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
  // Tolérant aux erreurs de copier-coller sur iPhone : « Bearer » en double ou absent, espaces, retours à la ligne, guillemets.
  const token = auth.replace(/["'\s\u00a0\u200b]/g, '').replace(/^(Bearer:?)+/i, '');
  const who = token ? await apiTokens().verify(token, 'steps') : null;
  if (!who) {
    const error = !auth
      ? 'En-tête « Authorization » absent : vérifiez les En-têtes du raccourci (nom exact : Authorization).'
      : !/^bx_[A-Za-z0-9_-]{43}$/.test(token)
        ? 'Clé incomplète ou mal copiée : elle doit commencer par « Bearer bx_ » suivi de 43 caractères.'
        : 'Clé inconnue ou révoquée : créez-en une nouvelle dans Activité & Pas.';
    return json({ ok: false, error }, 401);
  }

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
