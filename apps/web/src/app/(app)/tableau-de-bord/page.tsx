import Link from 'next/link';
import type { Metadata } from 'next';
import { formatGlucose, localDateOf } from '@bilanx/domain';
import { DEMO_PROFILE, DEMO_TIMEZONE } from '@/lib/demo-data';
import { appContext, displayUnits, moduleAllowed, NAV_MODULES } from '@/lib/server/context';
import { dashboardData } from '@/lib/server/dashboard-data';
import { QUICK_ADD, type QuickAddItem } from '@/lib/navigation';
import { WeightCard } from '@/components/weight-card';
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

const QUICK_TONE: Record<QuickAddItem['tone'], string> = {
  glucose: 'bg-glucose-2 text-glucose',
  petrol: 'bg-petrol-2 text-petrol',
  sage: 'bg-sage-2 text-sage',
  violet: 'bg-violet-2 text-violet',
  rose: 'bg-rose-2 text-rose',
  indigo: 'bg-indigo-2 text-indigo',
};

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

  // Chiffres du bandeau : glycémie moyenne sur 7 jours, glycémie d'aujourd'hui, prochain rendez-vous (seulement ceux qui existent).
  // L'HbA1c (tous les 3 mois) reste dans sa carte, plus bas.
  const heroItems: HeroItem[] = [];
  // Vert : dans la plage 70–180 ; orange : entre les deux (54–69 ou 181–250) ; rouge : hors plage (< 54 ou > 250).
  const level = (v: number): 'ok' | 'mid' | 'out' => (v >= 70 && v <= 180 ? 'ok' : v >= 54 && v <= 250 ? 'mid' : 'out');
  const levelLabel = (v: number, what: string) => {
    const l = level(v);
    return l === 'ok' ? `${what} dans la plage` : `${what} ${l === 'mid' ? 'un peu ' : ''}${v > 180 ? 'au-dessus' : 'en dessous'} de la plage`;
  };
  // Écart à la plage 70–180 (0 dans la plage) : sert à dire si la moyenne s'en rapproche.
  const offRange = (v: number) => (v > 180 ? v - 180 : v < 70 ? 70 - v : 0);

  const mean7 = data.sensor?.mean7 ?? data.meter?.mean7 ?? null;
  const prev7 = data.sensor ? data.sensor.meanPrev7 : (data.meter?.meanPrev7 ?? null);
  if (mean7 != null) {
    let sub = `${UNIT} · 7 j`;
    let subTone: HeroItem['subTone'];
    if (prev7 != null) {
      const d = Math.round(mean7 - prev7);
      const shown = formatGlucose(Math.abs(mean7 - prev7), UNIT);
      // Court (case étroite sur téléphone) : évolution par rapport aux 7 jours d'avant.
      sub = d === 0 ? '= stable' : `${d < 0 ? '↓' : '↑'} ${shown} ${UNIT}`;
      // Vert si la moyenne se rapproche de la plage (ou y reste), rouge si elle s'en éloigne.
      const a = offRange(mean7);
      const b = offRange(prev7);
      subTone = a < b ? 'ok' : a > b ? 'out' : a === 0 ? 'ok' : 'mid';
    }
    heroItems.push({
      icon: 'chart',
      label: 'Moy. 7 j',
      value: formatGlucose(mean7, UNIT),
      sub,
      subTone,
      dot: level(mean7),
      dotLabel: `${levelLabel(mean7, 'Moyenne sur 7 jours')}${prev7 != null ? ` ; évolution par rapport aux 7 jours d’avant` : ''}`,
      href: '/glycemie?periode=7',
    });
  }
  // Glycémie : moyenne d'aujourd'hui (capteur, sinon mesures au doigt du jour) — elle bouge au fil de la journée.
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: DEMO_TIMEZONE }).format(now);
  const meterToday = data.meter?.week.find((d) => d.date === todayKey)?.readings ?? [];
  const todayMean = data.sensor?.today.mean ?? (meterToday.length ? meterToday.reduce((a, r) => a + r.mgdl, 0) / meterToday.length : null);
  if (todayMean != null) {
    heroItems.push({
      icon: 'drop',
      label: 'Glycémie',
      value: formatGlucose(todayMean, UNIT),
      sub: `${UNIT} · auj.`,
      dot: level(todayMean),
      dotLabel: levelLabel(todayMean, 'Moyenne du jour'),
      href: '/glycemie',
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

  // Moins de 3 chiffres : le poids complète le bandeau.
  const w = data.weight;
  if (heroItems.length < 3 && w?.last) {
    const c = w.change30;
    heroItems.push({
      icon: 'scale',
      label: 'Poids',
      value: w.last.kg.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      unit: 'kg',
      sub: c === null ? 'dernière pesée' : `${c < 0 ? '↓' : c > 0 ? '↑' : '='} ${Math.abs(c).toLocaleString('fr-FR', { minimumFractionDigits: 1 })} kg · 1 mois`,
      href: '/poids',
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
        // Ordinateur : ajouts rapides en pastilles légères, aux couleurs des cartes (sur téléphone : bouton ＋).
        <nav aria-label="Ajouter rapidement" className="mb-5 hidden flex-wrap gap-2 sm:flex">
          {quick.map((q) => (
            <Link
              key={q.href}
              href={q.href}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line bg-surface py-1.5 pl-1.5 pr-3.5 text-sm font-medium transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-petrol"
            >
              <span className={`grid size-7 place-items-center rounded-full ${QUICK_TONE[q.tone]}`} aria-hidden>
                <Icon name={q.svg} className="size-4" />
              </span>
              {q.label}
            </Link>
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
