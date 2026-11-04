import { addDays, compareLocalDates, formatLocalDate, parseLocalDate } from '@bilanx/domain';
import { buildReportPdf, SECTION_KEYS, type SectionKey } from '@bilanx/reports';
import { ForbiddenError } from '@bilanx/profiles';
import { currentSession } from '@/lib/server/auth';
import { appContext, moduleAllowed } from '@/lib/server/context';
import { collectReport } from '@/lib/server/report-data';
import { demoToday } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 40) || 'profil';

/** Rapport PDF du profil affiché : ?jours=30 ou ?du=AAAA-MM-JJ&au=AAAA-MM-JJ, &s=glucose,hba1c,… */
export async function GET(request: Request) {
  const s = await currentSession();
  if (!s?.mfaPassed) return new Response('Non connecté.', { status: 401 });
  const ctx = await appContext();
  if (!moduleAllowed(ctx.active, 'reports')) return new Response('Accès non autorisé.', { status: 403 });
  const q = new URL(request.url).searchParams;
  const today = demoToday();
  let from = parseLocalDate(q.get('du') ?? '');
  let to = parseLocalDate(q.get('au') ?? '');
  const jours = Number(q.get('jours'));
  if (!from || !to) {
    const n = [7, 30, 90, 180].includes(jours) ? jours : 30;
    to = today;
    from = addDays(today, -(n - 1));
  }
  if (compareLocalDates(to, today) > 0) to = today;
  if (compareLocalDates(from, to) > 0) return new Response('La date de début doit précéder la date de fin.', { status: 400 });
  if (compareLocalDates(from, addDays(to, -366)) < 0) return new Response('Période limitée à 12 mois.', { status: 400 });
  const sections = (q.get('s') ?? SECTION_KEYS.join(',')).split(',').filter((x): x is SectionKey => (SECTION_KEYS as readonly string[]).includes(x));
  if (!sections.length) return new Response('Choisissez au moins une rubrique.', { status: 400 });
  try {
    const data = await collectReport(ctx, from, to, sections);
    const pdf = await buildReportPdf(data);
    const name = `bilanx-rapport-${slug(data.profile.name)}-${formatLocalDate(from)}-au-${formatLocalDate(to)}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${q.get('telecharger') === '1' ? 'attachment' : 'inline'}; filename="${name}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response('Accès non autorisé.', { status: 403 });
    throw e;
  }
}
