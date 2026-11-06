import type { Metadata } from 'next';
import { formatGlucose, formatHba1c, getAnalyte } from '@bilanx/domain';
import { DEMO_PROFILE, DEMO_TIMEZONE } from '@/lib/demo-data';
import { appContext, displayUnits, moduleAllowed, NAV_MODULES } from '@/lib/server/context';
import { dashboardData } from '@/lib/server/dashboard-data';
import { QUICK_ADD } from '@/lib/navigation';
import { ButtonLink, PageHeader, pct } from '@/components/ui';
import { Icon } from '@/components/icon';
import {
  AppointmentCard,
  DocumentsRow,
  FirstStepsCard,
  GlucoseCard,
  Hba1cCard,
  StepsCard,
  SummaryCard,
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

  // Résumé : uniquement des phrases tirées des données (aucune interprétation).
  const g = (v: number) => `${formatGlucose(v, UNIT)} ${UNIT}`;
  const sentences: React.ReactNode[] = [];
  if (data.sensor && data.sensor.stats14.count)
    sentences.push(
      <>
        Sur 14 jours, le capteur est dans la cible <strong>{pct(data.sensor.stats14.pctInRange)}</strong> du temps
        {data.sensor.stats14.mean !== null ? <> (moyenne {g(data.sensor.stats14.mean)})</> : null}.
      </>,
    );
  if (data.meter && data.meter.mean7 !== null)
    sentences.push(
      <>
        Sur 7 jours, la moyenne du lecteur est de <strong>{g(data.meter.mean7)}</strong> ({data.meter.count7}{' '}
        {data.meter.count7 > 1 ? 'mesures' : 'mesure'}).
      </>,
    );
  const [a1Prev, a1Last] = data.hba1c.slice(-2).length === 2 ? data.hba1c.slice(-2) : [null, null];
  if (a1Prev && a1Last) {
    const d = Math.round((a1Last.percent - a1Prev.percent) * 10);
    sentences.push(
      <>
        La dernière HbA1c ({formatHba1c(a1Last.percent, A1C).value} {formatHba1c(a1Last.percent, A1C).unit}) est{' '}
        {d < 0 ? 'plus basse que' : d > 0 ? 'plus haute que' : 'égale à'} la précédente.
      </>,
    );
  }
  if (data.watch.length)
    sentences.push(
      <>
        {data.watch.map((w) => getAnalyte(w.analyteCode)!.nameFr).join(', ')} : en dehors des valeurs de référence,{' '}
        <strong>à évoquer avec votre médecin</strong>.
      </>,
    );

  return (
    <div className="fade-in">
      <PageHeader
        title={isDemo || isSelf ? `Bonjour ${isDemo ? profileName : (ctx.user.displayName ?? '')}` : `Profil de ${profileName}`}
        subtitle={
          <span className="first-letter:uppercase">
            {dateFr}
            {isDemo || isSelf ? '' : ' · données de votre proche'}
          </span>
        }
        actionsMobile={false}
        actions={
          real && moduleAllowed(ctx.active, 'documents', 'write') ? (
            <ButtonLink href="/documents#ajouter" variant="primary">
              <Icon name="plus" className="size-5" />
              Ajouter un document
            </ButtonLink>
          ) : undefined
        }
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
        {data.steps && <StepsCard steps={data.steps} canWrite={canWrite('activity')} isDemo={isDemo} />}
        {data.showGlucose && (
          <GlucoseCard sensor={data.sensor} meter={data.meter} unit={UNIT} today={data.today} isDemo={isDemo} canWrite={canWrite('glucose')} />
        )}
        {data.showLab && <Hba1cCard points={data.hba1c} unit={A1C} canWrite={canWrite('lab')} />}
        {data.today_ && <TodayCard data={data.today_} />}
        {data.appointment && <AppointmentCard appt={data.appointment} now={now} showReport={moduleAllowed(ctx.active, 'reports')} />}
        {/* Seulement s'il y a un résultat à signaler (le message « tout va bien » est retiré). */}
        {data.showLab && data.watch.length > 0 && <WatchCard watch={data.watch} />}
        {sentences.length > 0 && <SummaryCard sentences={sentences} />}
      </div>

      {data.docs && data.docs.length > 0 && <DocumentsRow docs={data.docs} />}
    </div>
  );
}
