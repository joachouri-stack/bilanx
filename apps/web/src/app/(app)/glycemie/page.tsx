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
import { Button, ButtonLink, Card, CardHeader, Chip, EmptyState, Meta, PageHeader, RangeBar, Segmented, Stat, buttonClass, pct } from '@/components/ui';
import { DayNav } from '@/components/day-nav';
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

  const addCard = canWrite && (
    <Card id="ajouter-glycemie" className={`scroll-mt-20 ${formFirst ? 'max-md:order-first' : ''}`}>
      <CardHeader title="Ajouter une glycémie" tag="◆ Lecteur (doigt)" />
      {sp.ajoute && (
        <p role="status" className="mb-3 rounded-xl bg-sage-2 px-4 py-3 text-sm">
          Glycémie enregistrée : {sp.ajoute.slice(0, 40)}.
        </p>
      )}
      <p className="mb-3 text-sm text-ink-2">La valeur affichée par votre lecteur, au bout du doigt.</p>
      <GlucoseEntryForm unit={unit} today={formatLocalDate(today)} defaultDate={dayIso} defaultTime={isToday ? nowTime : '12:00'} />
    </Card>
  );

  return (
    <div className="fade-in">
      <PageHeader title="Glycémie" subtitle="Capteur et lecteur (doigt). L’HbA1c de laboratoire est dans Analyses." actions={periodNav} />

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="md:col-span-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
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
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone="glucose">● Capteur</Chip>
              <Chip tone="neutral">◆ Lecteur (doigt)</Chip>
            </div>
          </div>
          {canWrite && !formFirst && (
            <ButtonLink href="#ajouter-glycemie" variant="secondary" className="mt-3 w-full sm:hidden">
              Ajouter une glycémie
            </ButtonLink>
          )}

          <div className="mt-4">
            {data.sensor.length || data.capillary.length ? (
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
            ) : (
              <EmptyState
                title="Aucune mesure ce jour-là."
                description={isDemo ? undefined : 'Ajoutez la glycémie de votre lecteur. Aucune synchronisation automatique de capteur n’est active.'}
              />
            )}
          </div>
          {isDemo && <Meta className="mt-2">Données de démonstration fictives.</Meta>}
        </Card>

        {(canWrite || meter.length > 0) && (
          <Card>
            <CardHeader title="Lecteur (doigt) : mesures du jour" />
            {meter.length === 0 ? (
              <p className="text-sm text-ink-2">Aucune glycémie du lecteur ce jour-là.</p>
            ) : (
              <ul className="divide-y divide-line">
                {[...meter].reverse().map((m) => (
                  <li key={m.at.toISOString()} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                    <span className="min-w-0">
                      <span className="tabular text-ink-2">{hm(m.at)}</span> ·{' '}
                      <span className="tabular font-semibold">
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
            )}
            <Meta className="mt-2">Points ◆ sur la courbe. Ces mesures ne comptent pas dans les statistiques du capteur.</Meta>
          </Card>
        )}

        {stats && (
          <Card>
            <CardHeader title={`Statistiques de la journée${isToday ? ' (jusqu’à maintenant)' : ''}`} tag="● Capteur" tagTone="glucose" />
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Stat size="md" label="Moyenne" value={g(stats.mean)} unit={unit} />
              <Stat size="md" label="Min / max" value={`${g(stats.min)} / ${g(stats.max)}`} />
              <Stat size="md" label="Variations" value={stats.cv === null ? '—' : pct(stats.cv)} />
              <Stat size="md" label="Capteur actif" value={pct(stats.coveragePct)} hint={`${stats.count} mesure${stats.count > 1 ? 's' : ''}`} />
            </div>
            <RangeBar veryLow={stats.pctVeryLow} low={stats.pctLow} inRange={stats.pctInRange} high={stats.pctHigh} veryHigh={stats.pctVeryHigh} />
            <Meta>
              Très bas {pct(stats.pctVeryLow)} · bas {pct(stats.pctLow)} · dans la cible {pct(stats.pctInRange)} · élevé {pct(stats.pctHigh)} · très élevé{' '}
              {pct(stats.pctVeryHigh)}
            </Meta>
          </Card>
        )}

        {addCard}

        <Card>
          <CardHeader title="Plage cible" />
          <p className="tabular text-2xl font-semibold">
            {g(TARGETS.low)} – {g(TARGETS.high)} <span className="text-base font-normal text-ink-3">{unit}</span>
          </p>
          <Meta className="mt-1">Valeurs habituelles du consensus international. Votre équipe soignante peut vous en indiquer d’autres.</Meta>
          <div className="mt-3 border-t border-line pt-2">{unitChoice(`jour=${dayIso}`)}</div>
        </Card>
      </div>
    </div>
  );
}
