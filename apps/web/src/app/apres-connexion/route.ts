import { takeNext } from '@/lib/server/auth';

/**
 * Après l'activation de la MFA : reprend la page demandée avant la connexion (ex. invitation).
 * Redirection relative : derrière un proxy (Coolify, Traefik), l'URL interne de la requête
 * n'est pas l'adresse publique du site.
 */
export async function GET() {
  return new Response(null, { status: 303, headers: { Location: await takeNext() } });
}
