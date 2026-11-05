import type { Metadata } from 'next';
import Link from 'next/link';
import {
  addDays,
  compareLocalDates,
  computeGlucoseStats,
  dayBounds,
  formatLocalDate,
  formatNumberFr,
  formatGlucose,
  parseLocalDate,
  type GlucoseUnit,
} from '@bilanx/domain';
import { DEMO_TIMEZONE, demoFirstDay, demoToday } from '@/lib/demo-data';
import { appContext, displayUnits, moduleAllowed } from '@/lib/server/context';
import { glucoseDay, sensorRange } from '@/lib/server/data';
import { GlucosePeriod } from './periode';
import { ModuleForbidden } from '@/components/module-forbidden';
import { Card, Chip, Meta, PageHeader, RangeBar, pct } from '@/components/ui';
import { GlucoseDayChart } from '@/components/glucose-day-chart';
import { GlucoseEntryForm } from '@/components/glucose-forms';
import { glucose } from '@/lib/server/auth';
import { removeGlucoseAction } from '@/lib/server/actions';
import { GLUCOSE_CONTEXTS } from '@bilanx/domain';

export const metadata: Metadata = { title: 'Glycémie' };
export const dynamic = 'force-dynamic';

const TARGETS = { veryLow: 54, low: 70, high: 180, veryHigh: 250 };

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
  // Unité du profil, ou choix ponctuel (?unite=) sans modifier la préférence.
  const UNIT_PARAM: Record<string, GlucoseUnit> = { mgdl: 'mg/dL', gl: 'g/L', mmol: 'mmol/L' };
  const unit: GlucoseUnit = UNIT_PARAM[sp.unite ?? ''] ?? displayUnits(ctx.active).glucose;
  const unitKey = Object.entries(UNIT_PARAM).find(([, u]) => u === unit)![0];
  const unitParam = sp.unite && UNIT_PARAM[sp.unite] ? `&unite=${unitKey}` : '';
  const isToday = compareLocalDates(day, today) === 0;

  const data = await glucoseDay(ctx, day, now);
  const { start, end } = dayBounds(day, DEMO_TIMEZONE);
  const canWrite = ctx.active.kind === 'real' && moduleAllowed(ctx.active, 'glucose', 'write');
  const manual = ctx.active.kind === 'real' ? await glucose().listCapillary(ctx.user, ctx.active.access.profileId, start, end) : [];
  const fmtTime = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, hour: '2-digit', minute: '2-digit' });
  const nowTime = fmtTime.format(now).replace(' h ', ':');
  const stats = computeGlucoseStats(data.sensor, { periodStart: start, periodEnd: isToday ? now : end });
  const dayLabel = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, dateStyle: 'full' }).format(start);
  const hrefFor = (d: typeof day) => `/glycemie?jour=${formatLocalDate(d)}${unitParam}`;
  const g = (v: number | null) => (v === null ? '—' : formatGlucose(v, unit));
  const navBtn = 'inline-grid min-h-11 min-w-11 place-items-center rounded-xl border border-line bg-surface px-3 font-medium hover:bg-surface-2';

  const periode = [7, 14, 30, 90].includes(Number(sp.periode)) ? Number(sp.periode) : null;
  const periodNav = (
    <nav aria-label="Période" className="inline-flex rounded-xl bg-surface-2 p-1 text-sm">
      {([[null, 'Jour'], [7, '7 j'], [14, '14 j'], [30, '30 j'], [90, '90 j']] as const).map(([n, l]) => (
        <Link
          key={l}
          href={n ? `/glycemie?periode=${n}${unitParam}` : `/glycemie?${unitParam.slice(1)}`}
          aria-current={periode === n ? 'page' : undefined}
          className={`rounded-lg px-3 py-1.5 ${periode === n ? 'bg-surface shadow-sm' : 'text-ink-3'}`}
        >
          {l}
        </Link>
      ))}
    </nav>
  );
  const unitSwitch = (base: string) => (
    <span className="inline-flex rounded-xl bg-surface-2 p-1 text-sm" aria-label="Unité d’affichage">
      {Object.entries(UNIT_PARAM).map(([k, u]) => (
        <Link
          key={k}
          href={`${base}unite=${k}`}
          aria-current={unit === u ? 'true' : undefined}
          className={`rounded-lg px-3 py-1.5 ${unit === u ? 'bg-surface shadow-sm' : 'text-ink-3'}`}
        >
          {u}
        </Link>
      ))}
    </span>
  );

  if (periode) {
    // Un jour civil de plus de chaque côté : la fenêtre glissante commence en cours de journée.
    const pFrom = addDays(today, -periode);
    const [readings, previous] = await Promise.all([
      sensorRange(ctx, pFrom, today, now),
      sensorRange(ctx, addDays(pFrom, -periode), addDays(pFrom, -1), now),
    ]);
    return (
      <div className="fade-in">
        <PageHeader title="Glycémie" subtitle={`${periode} derniers jours — mesures du capteur uniquement.`} actions={periodNav} />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <Chip tone="glucose">● Capteur</Chip>
          {unitSwitch(`/glycemie?periode=${periode}&`)}
        </div>
        <GlucosePeriod days={periode} today={today} now={now} readings={readings} previous={previous} unit={unit} unitParam={unitParam} isDemo={isDemo} />
      </div>
    );
  }

  return (
    <div className="fade-in">
      <PageHeader
        title="Glycémie"
        subtitle="Capteur et glycémies du lecteur (capillaires) — distinctes de l’HbA1c de laboratoire."
        actions={periodNav}
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {compareLocalDates(day, first) > 0 ? (
              <Link href={hrefFor(addDays(day, -1))} className={navBtn} aria-label="Jour précédent">
                ←
              </Link>
            ) : (
              <span className={`${navBtn} opacity-40`} aria-disabled>
                ←
              </span>
            )}
            <h2 className="min-w-[210px] text-center font-semibold first-letter:uppercase" aria-live="polite">
              {dayLabel}
            </h2>
            {!isToday ? (
              <Link href={hrefFor(addDays(day, 1))} className={navBtn} aria-label="Jour suivant">
                →
              </Link>
            ) : (
              <span className={`${navBtn} opacity-40`} aria-disabled>
                →
              </span>
            )}
            <form action="/glycemie" className="flex items-center gap-2">
              <label className="sr-only" htmlFor="jour">
                Choisir une date
              </label>
              <input
                id="jour"
                type="date"
                name="jour"
                defaultValue={formatLocalDate(day)}
                min={formatLocalDate(first)}
                max={formatLocalDate(today)}
                className="min-h-11 rounded-xl border border-line bg-surface px-3"
              />
              {unitParam && <input type="hidden" name="unite" value={unitKey} />}
              <button type="submit" className={navBtn}>
                Afficher
              </button>
            </form>
            {!isToday && (
              <Link href={`/glycemie?${unitParam.slice(1)}`} className={navBtn}>
                Aujourd’hui
              </Link>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="glucose">● Capteur</Chip>
            <Chip tone="neutral">◆ Capillaire</Chip>
            {unitSwitch(`/glycemie?jour=${formatLocalDate(day)}&`)}
          </div>
        </div>

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
            <p className="rounded-xl border border-dashed border-line p-10 text-center text-ink-3">
              Aucune mesure disponible pour cette journée.
              {!isDemo && (
                <span className="mt-1 block text-sm">
                  Saisissez une glycémie de votre lecteur ci-dessous. L’import des fichiers LibreView arrive prochainement ; aucune synchronisation n’est active.
                </span>
              )}
            </p>
          )}
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-2">
          <Meta>Molette, pincement ou boutons ＋/－ : zoom · glisser : déplacement · double-clic : journée entière · survol : heure et valeur exactes</Meta>
          <Meta>
            {isDemo
              ? 'Source : import de fichier LibreView — données de démonstration fictives · aucune synchronisation automatique active'
              : 'Aucune synchronisation automatique active'}
          </Meta>
        </div>
      </Card>

      {sp.ajoute && (
        <p role="status" className="mt-4 rounded-xl bg-sage-2 px-4 py-3 text-sm">
          Glycémie enregistrée : {sp.ajoute.slice(0, 40)}.
        </p>
      )}
      {(canWrite || manual.length > 0) && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {canWrite && (
            <Card id="ajouter-glycemie" className="scroll-mt-4">
              <h2 className="font-semibold">Ajouter une glycémie</h2>
              <p className="mb-3 mt-1 text-sm text-ink-3">Mesure de votre lecteur au bout du doigt (glycémie capillaire).</p>
              <GlucoseEntryForm unit={unit} today={formatLocalDate(today)} defaultDate={formatLocalDate(day)} defaultTime={isToday ? nowTime : '12:00'} />
            </Card>
          )}
          <Card>
            <h2 className="font-semibold">Glycémies capillaires du jour</h2>
            {manual.length === 0 ? (
              <p className="mt-2 text-sm text-ink-3">Aucune glycémie saisie ce jour-là.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {[...manual].reverse().map((m) => (
                  <li key={m.at.toISOString()} className="flex items-center justify-between gap-2 py-2">
                    <span>
                      <span className="tabular text-ink-3">{fmtTime.format(m.at)}</span> ·{' '}
                      <span className="tabular font-semibold">
                        {formatGlucose(m.mgdl, unit)} {unit}
                      </span>
                      {m.context && <span className="text-sm text-ink-3"> · {GLUCOSE_CONTEXTS[m.context]}</span>}
                    </span>
                    {canWrite && (
                      <form action={removeGlucoseAction}>
                        <input type="hidden" name="at" value={m.at.toISOString()} />
                        <button type="submit" className="min-h-9 rounded-lg px-2 text-sm text-red hover:bg-red-2" aria-label={`Supprimer la glycémie de ${fmtTime.format(m.at)}`}>
                          Supprimer
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <Meta className="mt-2">Points ◆ sur la courbe. Les statistiques ci-dessous ne portent que sur le capteur.</Meta>
          </Card>
        </div>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <p className="text-[12.5px] font-medium text-ink-3">Statistiques de la journée{isToday ? ' (jusqu’à maintenant)' : ''}</p>
          <dl className="mt-2.5 flex flex-wrap gap-x-7 gap-y-3">
            {[
              ['Moyenne', `${g(stats.mean)} ${unit}`],
              ['Min / max', `${g(stats.min)} / ${g(stats.max)}`],
              ['Variabilité (CV)', stats.cv === null ? '—' : pct(stats.cv)],
              ['Mesures', String(stats.count)],
              ['Données disponibles', pct(stats.coveragePct)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-ink-3">{k}</dt>
                <dd className="tabular text-xl font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <RangeBar veryLow={stats.pctVeryLow} low={stats.pctLow} inRange={stats.pctInRange} high={stats.pctHigh} veryHigh={stats.pctVeryHigh} />
          <Meta>
            Très bas {pct(stats.pctVeryLow)} · bas {pct(stats.pctLow)} · dans la cible {pct(stats.pctInRange)} · élevé {pct(stats.pctHigh)} · très
            élevé {pct(stats.pctVeryHigh)}
          </Meta>
        </Card>
        <Card>
          <p className="text-[12.5px] font-medium text-ink-3">Plage cible</p>
          <p className="mt-2 text-xl font-semibold">
            {g(TARGETS.low)} – {g(TARGETS.high)} <span className="text-sm font-medium text-ink-3">{unit}</span>
          </p>
          <Meta>Valeurs par défaut du consensus international. À définir avec votre équipe soignante (Paramètres, prochainement).</Meta>
        </Card>
      </div>
    </div>
  );
}
