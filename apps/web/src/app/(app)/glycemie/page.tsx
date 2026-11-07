import type { Metadata } from 'next';
import Link from 'next/link';
import {
  addDays,
  compareLocalDates,
  computeGlucoseStats,
  dayBounds,
  formatLocalDate,
  formatGlucose,
  GLUCOSE_CONTEXTS,
  parseLocalDate,
  type GlucoseContext,
  type GlucoseUnit,
} from '@bilanx/domain';
import { DEMO_TIMEZONE, demoFirstDay, demoToday } from '@/lib/demo-data';
import { appContext, displayUnits, moduleAllowed } from '@/lib/server/context';
import { glucoseDay, hasSensorSince, meterRange, sensorRange } from '@/lib/server/data';
import { GlucosePeriod } from './periode';
import { ModuleForbidden } from '@/components/module-forbidden';
import { LibreLink } from '@/components/libre-link';
import { libreLink } from '@/lib/server/auth';
import { Button, Card, Chip, Meta, PageHeader, RangeBar, Segmented, buttonClass, pct } from '@/components/ui';
import { DayNav } from '@/components/day-nav';
import { Disclosure } from '@/components/disclosure';
import { ProgressRing } from '@/components/progress-ring';
import { Icon } from '@/components/icon';
import { dayHref } from '@/lib/day-href';
import { GlucoseDayChart } from '@/components/glucose-day-chart';
import { GlucoseEntryForm } from '@/components/glucose-forms';
import { removeGlucoseAction } from '@/lib/server/actions';

export const metadata: Metadata = { title: 'Glycémie' };
export const dynamic = 'force-dynamic';

const TARGETS = { veryLow: 54, low: 70, high: 180, veryHigh: 250 };
const UNIT_PARAM: Record<string, GlucoseUnit> = { mgdl: 'mg/dL', gl: 'g/L', mmol: 'mmol/L' };

export default async function GlucosePage({ searchParams }: { searchParams: Promise<{ jour?: string; unite?: string; periode?: string; ajoute?: string }> }) {
  const ctx = await appContext();
  if (!moduleAllowed(ctx.active, 'glucose')) return <ModuleForbidden title="Glycémie" profileName={ctx.active.kind === 'real' ? ctx.active.access.displayName : ''} />;
  const isDemo = ctx.active.kind === 'demo';
  const sp = await searchParams;
  const now = new Date();
  const today = demoToday(now);
  // Profil réel : navigation sur un an ; démonstration : 90 jours générés.
  const first = isDemo ? demoFirstDay(now) : addDays(today, -365);
  let day = (sp.jour && parseLocalDate(sp.jour)) || today;
  if (compareLocalDates(day, today) > 0) day = today;
  if (compareLocalDates(day, first) < 0) day = first;
  // Unité du profil, ou choix ponctuel (?unite=) sans modifier la préférence.
  const temporaryUnit = !!(sp.unite && UNIT_PARAM[sp.unite]);
  const unit: GlucoseUnit = UNIT_PARAM[sp.unite ?? ''] ?? displayUnits(ctx.active).glucose;
  const unitKey = Object.entries(UNIT_PARAM).find(([, u]) => u === unit)![0];
  const unitQuery = temporaryUnit ? `unite=${unitKey}` : '';
  const withUnit = (q: string) => `/glycemie${[q, unitQuery].filter(Boolean).length ? `?${[q, unitQuery].filter(Boolean).join('&')}` : ''}`;
  const isToday = compareLocalDates(day, today) === 0;
  const canWrite = ctx.active.kind === 'real' && moduleAllowed(ctx.active, 'glucose', 'write');
  const profileHref = ctx.active.kind === 'real' ? `/famille/${ctx.active.access.profileId}#unites` : null;
  const libre = canWrite && ctx.active.kind === 'real' ? await libreLink().status(ctx.user, ctx.active.access.profileId) : null;

  const periode = [7, 14, 30, 90].includes(Number(sp.periode)) ? Number(sp.periode) : null;
  const periodNav = (
    <Segmented
      label="Période"
      items={([[null, 'Jour'], [7, '7 j'], [14, '14 j'], [30, '30 j'], [90, '90 j']] as const).map(([n, l]) => ({
        href: withUnit(n ? `periode=${n}` : ''),
        label: l,
        current: periode === n,
      }))}
    />
  );
  /** Choix d'unité discret, replié en bas de page : la préférence se règle dans la fiche du profil. */
  const unitChoice = (base: string) => (
    <details className="group" open={temporaryUnit}>
      <summary className={buttonClass({ variant: 'ghost', className: '-ml-3 cursor-pointer list-none text-sm' })}>Unité d’affichage : {unit}</summary>
      <nav aria-label="Unité d’affichage" className="mt-2 inline-flex rounded-xl bg-surface-2 p-1 text-sm">
        {Object.entries(UNIT_PARAM).map(([k, u]) => (
          <Link
            key={k}
            href={`/glycemie?${[base, `unite=${k}`].filter(Boolean).join('&')}`}
            aria-current={unit === u ? 'true' : undefined}
            className={`flex min-h-11 items-center rounded-lg px-3 font-medium ${unit === u ? 'bg-surface shadow-sm' : 'text-ink-2'}`}
          >
            {u}
          </Link>
        ))}
      </nav>
      <Meta className="mt-2">
        Pour cette page seulement.{' '}
        {profileHref ? (
          <>
            Votre unité habituelle se règle dans la{' '}
            <Link href={profileHref} className="text-petrol underline">
              fiche du profil
            </Link>
            .
          </>
        ) : (
          'Votre unité habituelle se règle dans la fiche du profil.'
        )}
      </Meta>
    </details>
  );

  // Carte du capteur Libre : affichée dans toutes les vues (jour et périodes).
  const libreOk = !!libre && libre.status === 'active' && !libre.lastError;
  const panel = 'group scroll-mt-20 rounded-[var(--radius-card,18px)] border border-line bg-surface shadow-[var(--shadow-card)]';
  const panelSummary = 'flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 [&::-webkit-details-marker]:hidden';
  const libreCard = canWrite && (
    <Disclosure
      id="capteur-libre"
      className={panel}
      initialOpen={!libre}
      summary={
        <summary className={panelSummary}>
          <span className="grid size-9 place-items-center rounded-full bg-glucose-2 text-glucose" aria-hidden>
            <Icon name="drop" className="size-5" />
          </span>
          <h2 className="flex-1 font-semibold">Capteur FreeStyle Libre</h2>
          <Chip tone={libreOk ? 'sage' : libre ? 'red' : 'neutral'}>{libreOk ? 'relié' : libre ? 'en panne' : 'non relié'}</Chip>
          <Icon name="chevronDown" className="size-5 text-ink-3 transition-transform group-open:rotate-180" />
        </summary>
      }
    >
      <div className="border-t border-line px-4 pb-4 pt-4">
        <LibreLink
          status={
            libre && {
              ...libre,
              lastSyncAt: libre.lastSyncAt?.toISOString() ?? null,
              lastReadingAt: libre.lastReadingAt?.toISOString() ?? null,
            }
          }
        />
      </div>
    </Disclosure>
  );

  if (periode) {
    // Un jour civil de plus de chaque côté : la fenêtre glissante commence en cours de journée.
    const pFrom = addDays(today, -periode);
    const [readings, previous, meter] = await Promise.all([
      sensorRange(ctx, pFrom, today, now),
      sensorRange(ctx, addDays(pFrom, -periode), addDays(pFrom, -1), now),
      meterRange(ctx, addDays(pFrom, -periode), today, now),
    ]);
    return (
      <div className="fade-in">
        <PageHeader title="Glycémie" subtitle={`${periode} derniers jours.`} actions={periodNav} />
        <GlucosePeriod days={periode} today={today} now={now} readings={readings} previous={previous} meter={meter} unit={unit} unitQuery={unitQuery} isDemo={isDemo} />
        {libreCard && <div className="mt-6 max-w-2xl">{libreCard}</div>}
        <div className="mt-6">{unitChoice(`periode=${periode}`)}</div>
      </div>
    );
  }

  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86_400_000);
  const [data, meter, sensorRecently] = await Promise.all([glucoseDay(ctx, day, now), meterRange(ctx, day, day, now), hasSensorSince(ctx, fourteenDaysAgo)]);
  const { start, end } = dayBounds(day, DEMO_TIMEZONE);
  const fmtTime = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const nowTime = fmtTime.format(now);
  /** « 7 h 45 » */
  const hm = (d: Date) => {
    const [h = '0', m = '00'] = fmtTime.format(d).split(':');
    return `${Number(h)} h ${m}`;
  };
  const stats = data.sensor.length ? computeGlucoseStats(data.sensor, { periodStart: start, periodEnd: isToday ? now : end }) : null;
  const g = (v: number | null) => (v === null ? '—' : formatGlucose(v, unit));
  // Sans capteur depuis 14 jours : le formulaire passe avant la courbe sur téléphone.
  const formFirst = canWrite && !sensorRecently;
  const dayIso = formatLocalDate(day);

  // Anneau : part du temps dans la cible ; couleur selon le résultat (≥ 70 % : vert, ≥ 50 % : orange, sinon rouge).
  const tir = stats ? stats.pctInRange : null;
  const ringColors: [string, string] = tir === null ? ['#94a3b8', '#94a3b8'] : tir >= 70 ? ['#34d399', '#22d3ee'] : tir >= 50 ? ['#fbbf24', '#f59e0b'] : ['#fb923c', '#f87171'];
  const lastSensor = data.sensor.at(-1) ?? null;
  const level = (v: number) => (v >= TARGETS.low && v <= TARGETS.high ? 'text-go' : v >= TARGETS.veryLow && v <= TARGETS.veryHigh ? 'text-amber' : 'text-red');
  const rows = stats
    ? [
        { dot: 'bg-glucose', label: 'Dernière mesure', value: lastSensor ? `${g(lastSensor.mgdl)} · ${hm(lastSensor.at)}` : '—', cls: lastSensor ? level(lastSensor.mgdl) : '' },
        { dot: 'bg-indigo', label: 'Moyenne', value: `${g(stats.mean)} ${unit}`, cls: stats.mean !== null ? level(stats.mean) : '' },
        { dot: 'bg-amber', label: 'Min – max', value: `${g(stats.min)} – ${g(stats.max)}`, cls: '' },
        { dot: 'bg-violet', label: 'Variations', value: stats.cv === null ? '—' : pct(stats.cv), cls: '' },
      ]
    : [];

  const hero = (
    <section
      aria-label="Résumé de la journée"
      className="relative overflow-hidden rounded-[var(--radius-card,18px)] border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:p-6"
    >
      <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(96,165,250,0.18),transparent)]" />
      <div className="relative">
        <DayNav
          basePath="/glycemie"
          param="jour"
          extraQuery={unitQuery || undefined}
          value={dayIso}
          min={formatLocalDate(first)}
          max={formatLocalDate(today)}
          prevHref={compareLocalDates(day, first) > 0 ? dayHref('/glycemie', 'jour', formatLocalDate(addDays(day, -1)), unitQuery || undefined) : undefined}
          nextHref={!isToday ? dayHref('/glycemie', 'jour', formatLocalDate(addDays(day, 1)), unitQuery || undefined) : undefined}
          todayHref={withUnit('')}
        />
      </div>
      {stats ? (
        <>
          <div className="relative mt-4 flex flex-col items-center gap-5 sm:flex-row sm:gap-8">
            <ProgressRing value={(tir ?? 0) / 100} size={176} stroke={16} colors={ringColors}>
              <div>
                <p className="tabular text-[38px] font-bold leading-none tracking-tight">{pct(tir ?? 0)}</p>
                <p className="mt-1 text-[13px] text-ink-3">dans la cible</p>
                <p className="mt-2 inline-block rounded-full bg-surface-2 px-2 py-0.5 text-[12px] font-semibold text-ink-2">
                  {g(TARGETS.low)}–{g(TARGETS.high)}
                </p>
              </div>
            </ProgressRing>
            <ul className="w-full flex-1 divide-y divide-line">
              {rows.map((r) => (
                <li key={r.label} className="flex items-center gap-3 py-2.5">
                  <span className={`size-2.5 shrink-0 rounded-full ${r.dot}`} aria-hidden />
                  <span className="flex-1 text-[15px] text-ink-2">{r.label}</span>
                  <span className={`tabular text-[15px] font-semibold ${r.cls}`}>{r.value}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative mt-4">
            <RangeBar veryLow={stats.pctVeryLow} low={stats.pctLow} inRange={stats.pctInRange} high={stats.pctHigh} veryHigh={stats.pctVeryHigh} />
            <p className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-[13px] text-ink-2">
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="size-2 rounded-full bg-red" aria-hidden />
                Bas {pct(stats.pctVeryLow + stats.pctLow)}
              </span>
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="size-2 rounded-full bg-sage" aria-hidden />
                Cible {pct(stats.pctInRange)}
              </span>
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="size-2 rounded-full bg-amber" aria-hidden />
                Haut {pct(stats.pctHigh + stats.pctVeryHigh)}
              </span>
            </p>
            {stats.coveragePct < 70 && <Meta className="mt-1">Capteur actif {pct(stats.coveragePct)} de la journée : chiffres partiels.</Meta>}
          </div>
        </>
      ) : (
        <p className="relative mt-4 text-center text-ink-2">
          {data.capillary.length ? 'Pas de mesure du capteur ce jour-là : seules vos mesures au doigt sont affichées.' : 'Aucune mesure ce jour-là.'}
        </p>
      )}
      {isDemo && <Meta className="relative mt-2">Données de démonstration fictives.</Meta>}
    </section>
  );

  const chart = (data.sensor.length > 0 || data.capillary.length > 0) && (
    <Card>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Courbe du jour</h2>
        <span className="flex items-center gap-3 text-[13px] text-ink-2">
          <span className="flex items-center gap-1.5">
            <span className="h-1 w-4 rounded-full bg-[linear-gradient(90deg,#34d399,#fbbf24,#f87171)]" aria-hidden />
            Capteur
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden>◆</span> Doigt
          </span>
        </span>
      </div>
      <GlucoseDayChart
        dayStart={start.getTime()}
        dayEnd={end.getTime()}
        timeZone={DEMO_TIMEZONE}
        unit={unit}
        sensor={data.sensor.map((s) => ({ t: s.at.getTime(), v: s.mgdl }))}
        capillary={data.capillary.map((s) => ({ t: s.at.getTime(), v: s.mgdl }))}
        events={data.events.map((e) => ({ t: e.at.getTime(), kind: e.kind, label: e.label, detail: e.detail }))}
        targetLow={TARGETS.low}
        targetHigh={TARGETS.high}
        veryLow={TARGETS.veryLow}
      />
    </Card>
  );

  const meterCard = meter.length > 0 && (
    <Card>
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <span aria-hidden>◆</span> Mesures au doigt
      </h2>
      <ul className="divide-y divide-line">
        {[...meter].reverse().map((m) => (
          <li key={m.at.toISOString()} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
            <span className="min-w-0">
              <span className="tabular text-ink-2">{hm(m.at)}</span> ·{' '}
              <span className={`tabular font-semibold ${level(m.mgdl)}`}>
                {formatGlucose(m.mgdl, unit)} {unit}
              </span>
              {m.context && <span className="text-sm text-ink-2"> · {GLUCOSE_CONTEXTS[m.context as GlucoseContext]}</span>}
            </span>
            {canWrite && (
              <details className="shrink-0 text-right">
                <summary className={buttonClass({ variant: 'ghost', className: 'cursor-pointer list-none text-sm text-red' })}>
                  Supprimer<span className="sr-only"> la glycémie de {hm(m.at)}</span>
                </summary>
                <form action={removeGlucoseAction} className="mt-1">
                  <input type="hidden" name="at" value={m.at.toISOString()} />
                  <Button type="submit" variant="danger" className="min-h-11 px-4 text-sm">
                    Confirmer la suppression
                  </Button>
                </form>
              </details>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );

  const addCard = canWrite && (
    <Disclosure
      id="ajouter-glycemie"
      className={panel}
      initialOpen={formFirst || !!sp.ajoute}
      summary={
        <summary className={panelSummary}>
          <span className="grid size-9 place-items-center rounded-full bg-sage-2 text-go" aria-hidden>
            <Icon name="plus" className="size-5" />
          </span>
          <h2 className="flex-1 font-semibold">Ajouter une glycémie</h2>
          <span className="text-sm text-ink-3">doigt</span>
          <Icon name="chevronDown" className="size-5 text-ink-3 transition-transform group-open:rotate-180" />
        </summary>
      }
    >
      <div className="border-t border-line px-4 pb-4 pt-4">
        {sp.ajoute && (
          <p role="status" className="mb-3 rounded-xl bg-sage-2 px-4 py-3 text-sm">
            Glycémie enregistrée : {sp.ajoute.slice(0, 40)}.
          </p>
        )}
        <GlucoseEntryForm unit={unit} today={formatLocalDate(today)} defaultDate={dayIso} defaultTime={isToday ? nowTime : '12:00'} />
      </div>
    </Disclosure>
  );

  const settings = (
    <details className={panel}>
      <summary className={panelSummary}>
        <span className="grid size-9 place-items-center rounded-full bg-indigo-2 text-indigo" aria-hidden>
          <Icon name="settings" className="size-5" />
        </span>
        <h2 className="flex-1 font-semibold">Réglages</h2>
        <span className="text-sm text-ink-3">cible, unité</span>
        <Icon name="chevronDown" className="size-5 text-ink-3 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-line px-4 pb-4 pt-4">
        <p className="text-sm text-ink-2">Plage cible</p>
        <p className="tabular text-2xl font-semibold">
          {g(TARGETS.low)} – {g(TARGETS.high)} <span className="text-base font-normal text-ink-3">{unit}</span>
        </p>
        <Meta className="mt-1">Valeurs habituelles du consensus international. Votre équipe soignante peut vous en indiquer d’autres.</Meta>
        <div className="mt-3 border-t border-line pt-2">{unitChoice(`jour=${dayIso}`)}</div>
      </div>
    </details>
  );

  return (
    <div className="fade-in">
      <PageHeader title="Glycémie" actions={periodNav} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          {formFirst && addCard}
          {hero}
          {chart}
          {meterCard}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          {!formFirst && addCard}
          {libreCard}
          {settings}
        </div>
      </div>
    </div>
  );
}
