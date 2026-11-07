import type { Metadata } from 'next';
import { formatGlucose, formatHba1c, localDateOf } from '@bilanx/domain';
import { DEMO_PROFILE, DEMO_TIMEZONE } from '@/lib/demo-data';
import { appContext, displayUnits, moduleAllowed, NAV_MODULES } from '@/lib/server/context';
import { dashboardData } from '@/lib/server/dashboard-data';
import { QUICK_ADD } from '@/lib/navigation';
import { WeightCard } from '@/components/weight-card';
import { ButtonLink } from '@/components/ui';
import { Icon } from '@/components/icon';
import {
  DashboardHero,
  type HeroItem,
  AppointmentCard,
  DocumentsCard,
  FirstStepsCard,
  GlucoseCard,
  GymCard,
  Hba1cCard,
  StepsCard,
  TodayCard,
  WatchCard,
} from '@/components/dashboard-cards';

export const metadata: Metadata = { title: 'Tableau de bord' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const ctx = await appContext();
  const data = await dashboardData(ctx, new Date());
  const { isDemo, now } = data;
  const real = ctx.active.kind === 'real';
  const UNIT = displayUnits(ctx.active).glucose;
  const A1C = displayUnits(ctx.active).hba1c;
  const canWrite = (m: Parameters<typeof moduleAllowed>[1]) => real && moduleAllowed(ctx.active, m, 'write');

  // Ajouts rapides (ordinateur seulement : sur téléphone, le ＋ de la barre du bas fait la même chose).
  const quick = real
    ? QUICK_ADD.filter((q) => {
        const m = NAV_MODULES[q.base];
        return !!m && moduleAllowed(ctx.active, m, 'write');
      })
    : [];

  const profileName = isDemo ? DEMO_PROFILE.displayName : ctx.active.kind === 'real' ? ctx.active.access.displayName : '';
  const isSelf = ctx.active.kind === 'real' && ctx.active.access.relationship === 'self' && ctx.active.access.role === 'owner';
  const dateFr = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, dateStyle: 'full' }).format(now);

  // Chiffres du bandeau : dernière HbA1c, glycémie moyenne, prochain rendez-vous (seulement ceux qui existent).
  const heroItems: HeroItem[] = [];
  const lastA1c = data.hba1c.at(-1);
  if (lastA1c) {
    const f = formatHba1c(lastA1c.percent, A1C);
    const prevA1c = data.hba1c.at(-2);
    let subTone: HeroItem['subTone'];
    let sub = `Le ${new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, day: 'numeric', month: 'short' }).format(lastA1c.sampledAt)}`;
    if (prevA1c) {
      const d = Math.round((lastA1c.percent - prevA1c.percent) * 10) / 10;
      sub = d === 0 ? '→ Stable' : `${d < 0 ? '↓' : '↑'} ${String(Math.abs(d)).replace('.', ',')}\u00a0pt`;
      // Baisse = vert, hausse = rouge, stable = orange.
      subTone = d < 0 ? 'ok' : d > 0 ? 'out' : 'mid';
    }
    heroItems.push({ icon: 'flask', label: 'HbA1c', value: f.value, unit: f.unit, sub, subTone, href: '/analyses/hba1c' });
  }
  // Glycémie : moyenne du capteur sur 7 jours s'il y en a un (référence, mesures continues) ; sinon celle du lecteur.
  const gMean = data.sensor?.mean7 ?? data.meter?.mean7 ?? null;
  if (gMean != null) {
    // Vert : dans la plage 70–180 ; orange : entre les deux (54–69 ou 181–250) ; rouge : hors plage (< 54 ou > 250).
    const dot = gMean >= 70 && gMean <= 180 ? 'ok' : gMean >= 54 && gMean <= 250 ? 'mid' : 'out';
    heroItems.push({
      icon: 'drop',
      label: 'Glycémie',
      value: formatGlucose(gMean, UNIT),
      sub: `${UNIT} · 7 j`,
      dot,
      dotLabel:
        dot === 'ok'
          ? 'Moyenne dans la plage'
          : `Moyenne ${dot === 'mid' ? 'un peu ' : ''}${gMean > 180 ? 'au-dessus' : 'en dessous'} de la plage`,
      href: '/glycemie?periode=7',
    });
  }
  const nextA = data.appointments?.upcoming[0];
  if (nextA) {
    const days = Math.round((Date.UTC(...ymdParis(nextA.startsAt)) - Date.UTC(...ymdParis(now))) / 86_400_000);
    const when = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, day: 'numeric', month: 'short' }).format(nextA.startsAt).replace('.', '');
    heroItems.push({
      icon: 'calendar',
      label: 'RDV',
      value: days <= 0 ? 'Auj.' : days === 1 ? 'Demain' : `J-${days}`,
      sub: when,
      href: '/rendez-vous',
    });
  }

  return (
    <div className="fade-in">
      <DashboardHero
        title={isDemo || isSelf ? `Bonjour ${isDemo ? profileName : (ctx.user.displayName ?? '')}` : `Profil de ${profileName}`}
        subtitle={
          <>
            {dateFr}
            {isDemo || isSelf ? '' : ' · données de votre proche'}
          </>
        }
        items={heroItems}
      />

      {quick.length > 0 && (
        <nav aria-label="Ajouter rapidement" className="mb-5 hidden flex-wrap gap-2 sm:flex">
          {quick.map((q) => (
            <ButtonLink key={q.href} href={q.href}>
              <Icon name={q.svg} className="size-5 text-ink-3" />
              {q.label}
            </ButtonLink>
          ))}
        </nav>
      )}

      {data.firstSteps.length > 0 && <FirstStepsCard steps={data.firstSteps} />}

      {/* Une colonne sur téléphone (ordre de lecture = ordre d'importance) ; deux colonnes sans trou au-delà. */}
      <div className="lg:columns-2 lg:gap-4 [&>*]:mb-4 [&>*]:break-inside-avoid">
        {/* Les pas en premier (choix de l'utilisateur). */}
        {/* Pas puis Salle de sport, toujours ensemble (la salle juste en dessous, même sur deux colonnes). */}
        {(data.steps || data.gym) && (
          <div className="space-y-4">
            {data.steps && <StepsCard steps={data.steps} canWrite={canWrite('activity')} isDemo={isDemo} />}
            {data.gym && <GymCard gym={data.gym} canWrite={canWrite('activity')} isDemo={isDemo} />}
          </div>
        )}
        {data.showGlucose && (
          <GlucoseCard sensor={data.sensor} meter={data.meter} unit={UNIT} today={data.today} isDemo={isDemo} canWrite={canWrite('glucose')} />
        )}
        {data.showLab && <Hba1cCard points={data.hba1c} unit={A1C} canWrite={canWrite('lab')} />}
        {data.weight && <WeightCard weight={data.weight} canWrite={canWrite('activity')} isDemo={isDemo} />}
        {data.today_ && <TodayCard data={data.today_} />}
        {data.appointments && <AppointmentCard data={data.appointments} now={now} />}
        {/* Seulement s'il y a un résultat à signaler (le message « tout va bien » est retiré). */}
        {data.showLab && data.watch.length > 0 && <WatchCard watch={data.watch} />}
      </div>

      {data.docs && <DocumentsCard docs={data.docs} />}
    </div>
  );
}

/** Jour civil à Paris, pour compter les jours jusqu'à un rendez-vous. */
function ymdParis(d: Date): [number, number, number] {
  const p = localDateOf(d, DEMO_TIMEZONE);
  return [p.year, p.month - 1, p.day];
}
