import Link from 'next/link';
import {
  addDays,
  agpProfile,
  computeGlucoseStats,
  dayBounds,
  formatGlucose,
  formatLocalDate,
  formatNumberFr,
  GLUCOSE_CONTEXTS,
  localDateOf,
  meterStats,
  type GlucoseContext,
  type GlucoseReading,
  type GlucoseUnit,
  type LocalDate,
  type MeterReading,
} from '@bilanx/domain';
import { DEMO_TIMEZONE } from '@/lib/demo-data';
import { EmptyState, Meta, RangeBar, pct } from '@/components/ui';
import { ProgressRing } from '@/components/progress-ring';
import { AgpChart } from '@/components/agp-chart';

const TARGETS = { veryLow: 54, low: 70, high: 180, veryHigh: 250 };
const fmtDay = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
const fmtTime = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** « 7 h 45 » */
const hm = (d: Date) => {
  const [h = '0', m = '00'] = fmtTime.format(d).split(':');
  return `${Number(h)} h ${m}`;
};

/** Écart (en mg/dL) converti dans l'unité d'affichage, signé à la française : « +5 », « −3 », « = ». */
function delta(mgdlOrPoints: number | null, unit: GlucoseUnit | 'points'): string {
  if (mgdlOrPoints === null) return '';
  const digits = unit === 'g/L' ? 2 : unit === 'mmol/L' ? 1 : 0;
  const v = unit === 'g/L' ? mgdlOrPoints / 100 : unit === 'mmol/L' ? mgdlOrPoints / 18.016 : mgdlOrPoints;
  const r = Number(v.toFixed(digits));
  if (r === 0) return '= par rapport à la période précédente';
  return `${r > 0 ? '+' : '−'}${formatNumberFr(Math.abs(r), digits)} ${unit} par rapport à la période précédente`;
}

/**
 * Vue sur plusieurs jours : capteur (statistiques comparées à la période précédente de même durée,
 * profil sur 24 h), lecteur (doigt) à part, et récapitulatif jour par jour. Rien n'est extrapolé : un jour
 * ou une heure sans mesure reste vide, et l'HbA1c estimée n'est montrée que si elle est interprétable.
 */
export function GlucosePeriod({
  days,
  today,
  now,
  readings,
  previous,
  meter,
  unit,
  unitQuery,
  isDemo,
}: {
  days: number;
  today: LocalDate;
  now: Date;
  readings: GlucoseReading[];
  previous: GlucoseReading[];
  /** Mesures du lecteur de la période ET de la période précédente (pour la comparaison). */
  meter: MeterReading[];
  unit: GlucoseUnit;
  unitQuery: string;
  isDemo: boolean;
}) {
  // Fenêtre glissante de exactement `days` × 24 h jusqu'à maintenant (comme les applications de glycémie) :
  // « 14 derniers jours » couvre bien 14 jours, condition de l'HbA1c estimée. La liste, elle, suit les jours civils.
  const DAY = 86_400_000;
  const start = new Date(now.getTime() - days * DAY);
  const prevStart = new Date(start.getTime() - days * DAY);
  const inWindow = readings.filter((r) => r.at.getTime() >= start.getTime() && r.at.getTime() <= now.getTime());
  const inPrev = [...previous, ...readings].filter((r) => r.at.getTime() >= prevStart.getTime() && r.at.getTime() < start.getTime());
  const stats = computeGlucoseStats(inWindow, { periodStart: start, periodEnd: now, targets: TARGETS });
  const prev = computeGlucoseStats(inPrev, { periodStart: prevStart, periodEnd: start, targets: TARGETS });
  const agp = agpProfile(inWindow, DEMO_TIMEZONE);
  const g = (v: number | null) => (v === null ? '—' : formatGlucose(v, unit));
  const meanDelta = prev.count && stats.mean !== null && prev.mean !== null ? stats.mean - prev.mean : null;
  const tirDelta = prev.count && stats.count ? stats.pctInRange - prev.pctInRange : null;

  // Lecteur (doigt) : même fenêtre, comparée à la précédente.
  const meterNow = meter.filter((r) => r.at.getTime() >= start.getTime() && r.at.getTime() <= now.getTime());
  const meterPrev = meter.filter((r) => r.at.getTime() >= prevStart.getTime() && r.at.getTime() < start.getTime());
  const ms = meterStats(meterNow, TARGETS, DEMO_TIMEZONE);
  const msPrev = meterStats(meterPrev, TARGETS, DEMO_TIMEZONE);
  const meterDelta = ms.mean !== null && msPrev.mean !== null ? ms.mean - msPrev.mean : null;

  const hasSensor = stats.count > 0;
  const hasMeter = ms.count > 0;

  // Jour par jour (du plus récent au plus ancien).
  const sensorByDay = new Map<string, GlucoseReading[]>();
  for (const r of readings) {
    const k = formatLocalDate(localDateOf(r.at, DEMO_TIMEZONE));
    (sensorByDay.get(k) ?? sensorByDay.set(k, []).get(k)!).push(r);
  }
  const meterByDay = new Map<string, MeterReading[]>();
  for (const r of meterNow) {
    const k = formatLocalDate(localDateOf(r.at, DEMO_TIMEZONE));
    (meterByDay.get(k) ?? meterByDay.set(k, []).get(k)!).push(r);
  }
  const rows = Array.from({ length: days }, (_, i) => addDays(today, -i))
    .map((d) => {
      const k = formatLocalDate(d);
      const { start: s, end: e } = dayBounds(d, DEMO_TIMEZONE);
      const st = computeGlucoseStats(sensorByDay.get(k) ?? [], { periodStart: s, periodEnd: e.getTime() > now.getTime() ? now : e, targets: TARGETS });
      return { k, st, m: meterByDay.get(k) ?? [] };
    })
    // Sans capteur sur la période : seuls les jours avec une mesure du lecteur sont listés.
    .filter((r) => hasSensor || r.m.length > 0);
  const dayHref = (k: string) => `/glycemie?jour=${k}${unitQuery ? `&${unitQuery}` : ''}`;
  const dayLabel = (k: string) => fmtDay.format(new Date(`${k}T12:00:00Z`));
  const meterLine = (m: MeterReading) =>
    `${hm(m.at)} · ${formatGlucose(m.mgdl, unit)}${m.context && m.context in GLUCOSE_CONTEXTS ? ` · ${GLUCOSE_CONTEXTS[m.context as GlucoseContext]}` : ''}`;

  if (!hasSensor && !hasMeter)
    return (
      <EmptyState
        title="Aucune mesure sur cette période."
        description={isDemo ? undefined : 'Ajoutez une glycémie de votre lecteur dans la vue Jour, ou reliez votre capteur.'}
      />
    );

  const level = (v: number | null) => (v === null ? '' : v >= TARGETS.low && v <= TARGETS.high ? 'text-go' : v >= TARGETS.veryLow && v <= TARGETS.veryHigh ? 'text-amber' : 'text-red');
  const card = 'relative overflow-hidden rounded-[var(--radius-card,18px)] border border-line bg-surface shadow-[var(--shadow-card)]';
  const Row = ({ dot, label, value, cls = '', sub }: { dot: string; label: string; value: string; cls?: string; sub?: string }) => (
    <li className="flex items-center gap-3 py-2.5">
      <span className={`size-2.5 shrink-0 rounded-full ${dot}`} aria-hidden />
      <span className="min-w-0 flex-1 text-[15px] text-ink-2">
        {label}
        {sub && <span className="block text-[12px] text-ink-3">{sub}</span>}
      </span>
      <span className={`tabular text-[15px] font-semibold ${cls}`}>{value}</span>
    </li>
  );
  const shortDelta = (d: number | null, u: GlucoseUnit | 'points') => {
    if (d === null) return undefined;
    const full = delta(d, u);
    return full.replace(' par rapport à la période précédente', ' vs période préc.');
  };
  const tir = stats.pctInRange;
  const ringColors: [string, string] = tir >= 70 ? ['#34d399', '#22d3ee'] : tir >= 50 ? ['#fbbf24', '#f59e0b'] : ['#fb923c', '#f87171'];

  const meterCard = hasMeter && (
    <section aria-label="Lecteur (doigt)" className={`${card} p-4 sm:p-5`}>
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <span aria-hidden>◆</span> Lecteur (doigt)
      </h2>
      <ul className="divide-y divide-line">
        <Row dot="bg-glucose" label="Moyenne" value={`${g(ms.mean)} ${unit}`} cls={level(ms.mean)} sub={shortDelta(meterDelta, unit)} />
        <Row dot="bg-go" label="À jeun (moyenne)" value={ms.byContext.fasting.count ? g(ms.byContext.fasting.mean) : '—'} cls={level(ms.byContext.fasting.mean)} />
        <Row dot="bg-amber" label="Après un repas (moyenne)" value={ms.byContext.after_meal.count ? g(ms.byContext.after_meal.mean) : '—'} cls={level(ms.byContext.after_meal.mean)} />
        <Row dot="bg-indigo" label="Mesures" value={`${ms.count} · ${ms.days} j`} />
        <Row dot="bg-red" label="Hors cible" value={`${ms.belowLow} bas · ${ms.aboveHigh} haut`} />
      </ul>
    </section>
  );

  return (
    <div className="flex flex-col gap-4">
      {!hasSensor && (
        <p role="status" className="rounded-xl bg-surface-2 px-4 py-3 text-sm">
          Pas de capteur sur cette période : voici les glycémies de votre lecteur (doigt).
        </p>
      )}

      {hasSensor && (
        <div className="grid gap-4 xl:grid-cols-[400px_minmax(0,1fr)] xl:items-start">
          {/* Résumé : temps dans la cible en anneau, chiffres clés en lignes. */}
          <section aria-label="Résumé de la période" className={`${card} p-4 sm:p-6`}>
            <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(96,165,250,0.18),transparent)]" />
            <div className="relative flex flex-col items-center gap-5 sm:flex-row sm:gap-6 xl:flex-col">
              <ProgressRing value={tir / 100} size={168} stroke={15} colors={ringColors}>
                <div>
                  <p className="tabular text-[36px] font-bold leading-none tracking-tight">{pct(tir)}</p>
                  <p className="mt-1 text-[13px] text-ink-3">dans la cible</p>
                  <p className="mt-2 inline-block rounded-full bg-surface-2 px-2 py-0.5 text-[12px] font-semibold text-ink-2">{days} jours</p>
                </div>
              </ProgressRing>
              <ul className="w-full flex-1 divide-y divide-line">
                <Row dot="bg-glucose" label="Moyenne" value={`${g(stats.mean)} ${unit}`} cls={level(stats.mean)} sub={shortDelta(meanDelta, unit)} />
                <Row dot="bg-go" label="Temps dans la cible" value={pct(tir)} sub={shortDelta(tirDelta, 'points')} />
                <Row dot="bg-violet" label="Variations" value={stats.cv === null ? '—' : pct(stats.cv)} />
                <Row
                  dot="bg-petrol"
                  label="HbA1c estimée"
                  value={stats.gmiReliable && stats.gmiPercent !== null ? `${formatNumberFr(stats.gmiPercent, 1)} %` : '—'}
                  sub={
                    stats.gmiReliable
                      ? 'Estimation qui ne remplace pas l’HbA1c de laboratoire.'
                      : 'Non calculée : il faut au moins 14 jours avec le capteur actif 70 % du temps.'
                  }
                />
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
              {stats.coveragePct < 70 && <Meta className="mt-1">Capteur actif {pct(stats.coveragePct)} du temps : chiffres partiels.</Meta>}
            </div>
          </section>

          <section aria-label="Journée type" className={`${card} p-4 sm:p-5`}>
            <h2 className="font-semibold">Journée type</h2>
            <p className="mb-2 text-[13px] text-ink-3">Vos {days} jours superposés, heure par heure</p>
            <AgpChart agp={agp} unit={unit} targetLow={TARGETS.low} targetHigh={TARGETS.high} />
          </section>
        </div>
      )}

      {meterCard}

      {/* Jour par jour : une ligne par jour, cliquable, avec la répartition bas / cible / haut. */}
      <section aria-label="Jour par jour" className={`${card} p-4 sm:p-5`}>
        <h2 className="mb-1 font-semibold">Jour par jour</h2>
        <table className="w-full">
          <caption className="sr-only">Glycémie jour par jour, en {unit}</caption>
          <thead className="sr-only">
            <tr>
              <th>Jour</th>
              <th>Moyenne</th>
              <th>Répartition</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ k, st, m }) => (
              <tr key={k} className="border-b border-line last:border-b-0">
                <td className="py-2.5 pr-2 align-middle">
                  <Link href={dayHref(k)} className="block font-medium first-letter:uppercase hover:text-petrol">
                    {dayLabel(k)}
                  </Link>
                  {m.length > 0 && (
                    <span className="mt-0.5 flex flex-wrap gap-1">
                      {m.map((r) => (
                        <span key={r.at.toISOString()} className={`tabular rounded-full bg-surface-2 px-1.5 text-[11px] ${level(r.mgdl)}`} title={meterLine(r)}>
                          ◆ {formatGlucose(r.mgdl, unit)}
                        </span>
                      ))}
                    </span>
                  )}
                </td>
                <td className={`tabular w-16 py-2.5 text-right align-middle text-lg font-bold ${level(st.count ? st.mean : null)}`}>
                  {st.count ? g(st.mean) : <span className="text-sm font-normal text-ink-3">—</span>}
                </td>
                <td className="w-[38%] py-2.5 pl-3 align-middle">
                  {st.count ? (
                    <span className="flex items-center gap-2">
                      <span className="flex h-2 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                        <span className="bg-red" style={{ width: `${st.pctVeryLow + st.pctLow}%` }} />
                        <span className="bg-sage" style={{ width: `${st.pctInRange}%` }} />
                        <span className="bg-amber" style={{ width: `${st.pctHigh}%` }} />
                        <span className="bg-red" style={{ width: `${st.pctVeryHigh}%` }} />
                      </span>
                      <span className="tabular w-10 text-right text-[13px] text-ink-2">{pct(st.pctInRange)}</span>
                    </span>
                  ) : (
                    <span className="text-[13px] text-ink-3">{hasSensor ? 'aucune mesure' : ''}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
