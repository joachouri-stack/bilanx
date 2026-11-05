import { cookies } from 'next/headers';
import { buildRecurringIcs, formatLocalDate, localDateOf } from '@bilanx/domain';
import { ForbiddenError } from '@bilanx/profiles';
import { isOngoing, lastDay } from '@bilanx/records';
import { currentSession, medications, profiles } from '@/lib/server/auth';
import { PROFILE_COOKIE } from '@/lib/server/context';
import { DEMO_TIMEZONE } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

/**
 * Rappels quotidiens d'un traitement (.ics récurrent) pour l'agenda du téléphone.
 * Titre neutre par défaut ; le nom du médicament n'est inclus qu'avec ?details=1.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await currentSession();
  if (!s?.mfaPassed) return new Response('Non connecté.', { status: 401 });
  const { id } = await params;
  const wanted = (await cookies()).get(PROFILE_COOKIE)?.value;
  const list = await profiles().listProfiles(s.accountId);
  const profile = list.find((p) => p.profileId === wanted) ?? list[0];
  if (!profile) return new Response('Introuvable.', { status: 404 });
  try {
    const m = await medications().get(s, profile.profileId, id);
    if (!m) return new Response('Introuvable.', { status: 404 });
    const now = new Date();
    const today = formatLocalDate(localDateOf(now, DEMO_TIMEZONE));
    if (!isOngoing(m, today) || !m.schedule.length) {
      return new Response('Ce traitement n’a pas de prise à heure fixe à venir.', { status: 409 });
    }
    const details = new URL(request.url).searchParams.get('details') === '1';
    const who = profile.relationship === 'self' ? '' : ` (${profile.displayName})`;
    const ics = buildRecurringIcs({
      uidPrefix: m.id,
      title: details ? `${m.name}${m.strength ? ` ${m.strength}` : ''}${who}` : `Prise de traitement${who}`,
      description: details ? `Posologie prescrite : ${m.posology}` : null,
      times: m.schedule.map((x) => x.time),
      // Les rappels commencent aujourd'hui (pas de rappels rétroactifs).
      startDate: m.startDate && m.startDate > today ? m.startDate : today,
      endDate: lastDay(m),
      timeZone: DEMO_TIMEZONE,
      stamp: now,
    });
    return new Response(ics, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="rappels-traitement.ics"',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response('Accès non autorisé.', { status: 403 });
    throw e;
  }
}
