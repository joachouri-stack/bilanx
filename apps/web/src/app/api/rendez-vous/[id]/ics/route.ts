import { cookies } from 'next/headers';
import { buildIcs } from '@bilanx/domain';
import { ForbiddenError } from '@bilanx/profiles';
import { appointments, currentSession, profiles } from '@/lib/server/auth';
import { PROFILE_COOKIE } from '@/lib/server/context';

export const dynamic = 'force-dynamic';

/**
 * Fichier .ics pour ajouter le rendez-vous à l'agenda du téléphone (avec l'alarme choisie).
 * Par défaut, titre neutre « Rendez-vous médical » : l'agenda est souvent synchronisé chez un tiers.
 * Les détails (spécialité, lieu, préparation) ne sont inclus qu'avec ?details=1.
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
    const a = await appointments().get(s, profile.profileId, id);
    if (!a) return new Response('Introuvable.', { status: 404 });
    const details = new URL(request.url).searchParams.get('details') === '1';
    const who = [a.specialty, a.practitioner].filter(Boolean).join(' — ');
    const ics = buildIcs({
      uid: a.id,
      startsAt: a.startsAt,
      title: details ? `${who}${profile.relationship === 'self' ? '' : ` (${profile.displayName})`}` : 'Rendez-vous médical',
      location: details ? a.location : null,
      description: details ? [a.reason && `Motif : ${a.reason}`, a.toPrepare && `À préparer : ${a.toPrepare}`].filter(Boolean).join('\n') || null : null,
      reminderMinutes: a.reminderMinutes,
      stamp: new Date(),
    });
    return new Response(ics, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="rendez-vous.ics"',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response('Accès non autorisé.', { status: 403 });
    throw e;
  }
}
