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
import { Card, CardHeader, EmptyState, Meta, RangeBar, Stat, pct } from '@/components/ui';
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
        description={`Ni capteur, ni lecteur (doigt).${isDemo ? '' : ' Ajoutez une glycémie de votre lecteur dans la vue Jour. Aucune synchronisation automatique n’est active.'}`}
      />
    );

  const meterCard = hasMeter && (
    <Card>
      <CardHeader title="Lecteur (doigt)" tag="◆ Saisies" />
      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
        <Stat size="md" label="Moyenne" value={g(ms.mean)} unit={unit} hint={meterDelta !== null ? delta(meterDelta, unit) : undefined} />
        <Stat size="md" label="Mesures" value={ms.count} hint={`sur ${ms.days} jour${ms.days > 1 ? 's' : ''}`} />
        <Stat size="md" label="Min / max" value={`${g(ms.min)} / ${g(ms.max)}`} />
        <Stat
          size="md"
          label="À jeun (moyenne)"
          value={g(ms.byContext.fasting.mean)}
          hint={ms.byContext.fasting.count ? `${ms.byContext.fasting.count} mesure${ms.byContext.fasting.count > 1 ? 's' : ''}` : 'aucune mesure notée à jeun'}
        />
        <Stat
          size="md"
          label="Après un repas (moyenne)"
          value={g(ms.byContext.after_meal.mean)}
          hint={ms.byContext.after_meal.count ? `${ms.byContext.after_meal.count} mesure${ms.byContext.after_meal.count > 1 ? 's' : ''}` : 'aucune mesure notée après un repas'}
        />
        <div className="col-span-2 sm:col-span-1">
          <p className="text-sm text-ink-3">Hors de la plage cible</p>
          <p className="mt-0.5 font-semibold">
            <span className="tabular">{ms.belowLow}</span> sous {g(TARGETS.low)} {unit}
          </p>
          <p className="font-semibold">
            <span className="tabular">{ms.aboveHigh}</span> au-dessus de {g(TARGETS.high)} {unit}
          </p>
        </div>
      </div>
      <Meta className="mt-3">Des mesures ponctuelles : elles ne disent pas le temps passé dans la cible, contrairement au capteur.</Meta>
    </Card>
  );

  return (
    <div className="flex flex-col gap-4">
      {!hasSensor && (
        <>
          <p role="status" className="rounded-xl bg-surface-2 px-4 py-3 text-sm">
            Pas de capteur sur cette période : voici les glycémies de votre lecteur (doigt).
          </p>
          {meterCard}
        </>
      )}

      {hasSensor && (
        <>
          {stats.coveragePct < 70 && (
            <p role="status" className="rounded-xl bg-amber-2 px-4 py-3 text-sm">
              Capteur actif {pct(stats.coveragePct)} du temps : en dessous de 70 %, les statistiques sont à interpréter avec prudence.
              {!isDemo && ' Aucune synchronisation automatique n’est active.'}
            </p>
          )}
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <Card className="max-xl:order-last">
              <CardHeader title="Profil sur 24 h" tag="● Capteur" tagTone="glucose" />
              <p className="mb-3 text-sm text-ink-2">Toutes les journées de la période superposées : la forme d’une journée type.</p>
              <AgpChart agp={agp} unit={unit} targetLow={TARGETS.low} targetHigh={TARGETS.high} />
            </Card>
            <div className="flex min-w-0 flex-col gap-4">
              <Card>
                <Stat
                  label={`Temps dans la cible (${g(TARGETS.low)}–${g(TARGETS.high)} ${unit})`}
                  value={pct(stats.pctInRange)}
                  hint={tirDelta !== null ? delta(tirDelta, 'points') : undefined}
                />
                <RangeBar veryLow={stats.pctVeryLow} low={stats.pctLow} inRange={stats.pctInRange} high={stats.pctHigh} veryHigh={stats.pctVeryHigh} />
                <Meta>
                  Très bas {pct(stats.pctVeryLow)} · bas {pct(stats.pctLow)} · élevé {pct(stats.pctHigh)} · très élevé {pct(stats.pctVeryHigh)}
                </Meta>
              </Card>
              <Card>
                <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                  <div className="col-span-2">
                    <Stat size="md" label="Moyenne du capteur" value={g(stats.mean)} unit={unit} hint={meanDelta !== null ? delta(meanDelta, unit) : undefined} />
                  </div>
                  <Stat size="md" label="Variations" value={stats.cv === null ? '—' : pct(stats.cv)} />
                  <Stat size="md" label="Capteur actif" value={pct(stats.coveragePct)} />
                  <div className="col-span-2">
                    <Stat
                      size="md"
                      label="HbA1c estimée par le capteur"
                      value={stats.gmiReliable && stats.gmiPercent !== null ? `${formatNumberFr(stats.gmiPercent, 1)} %` : '—'}
                      hint={
                        stats.gmiReliable
                          ? 'Estimation qui ne remplace pas l’HbA1c de laboratoire.'
                          : 'Non calculée : il faut au moins 14 jours avec le capteur actif 70 % du temps.'
                      }
                    />
                  </div>
                </div>
              </Card>
            </div>
          </div>
          {meterCard}
        </>
      )}

      <Card>
        <CardHeader title="Jour par jour" />
        {/* Téléphone : une carte par jour (pas de tableau, pas de défilement imbriqué). */}
        <ul className="divide-y divide-line sm:hidden">
          {rows.map(({ k, st, m }) => (
            <li key={k} className="py-3">
              <Link href={dayHref(k)} className="flex min-h-11 items-center justify-between gap-2 font-semibold text-petrol underline first-letter:uppercase">
                {dayLabel(k)}
              </Link>
              {hasSensor && (
                <p className="text-sm text-ink-2">
                  {st.count ? (
                    <>
                      Capteur : moyenne <span className="tabular font-semibold text-ink">{g(st.mean)}</span> {unit} · {pct(st.pctInRange)} dans la cible
                    </>
                  ) : (
                    'Capteur : aucune mesure'
                  )}
                </p>
              )}
              {m.length > 0 && (
                <ul className="mt-1 text-sm">
                  {m.map((r) => (
                    <li key={r.at.toISOString()} className="tabular">
                      ◆ {meterLine(r)} {unit}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        {/* Ordinateur et tablette : tableau. */}
        <table className="hidden w-full text-sm sm:table">
          <thead className="text-left text-ink-3">
            <tr>
              <th className="py-2 font-medium">Jour</th>
              {hasSensor && (
                <>
                  <th className="py-2 font-medium">Moyenne ({unit})</th>
                  <th className="py-2 font-medium">Dans la cible</th>
                  <th className="py-2 font-medium">Capteur actif</th>
                </>
              )}
              {hasMeter && <th className="py-2 font-medium">Lecteur (doigt), {unit}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(({ k, st, m }) => (
              <tr key={k} className="align-top">
                <td className="py-2 pr-2">
                  <Link href={dayHref(k)} className="text-petrol underline first-letter:uppercase">
                    {dayLabel(k)}
                  </Link>
                </td>
                {hasSensor && (
                  <>
                    <td className="tabular py-2">{st.count ? g(st.mean) : '—'}</td>
                    <td className="tabular py-2">{st.count ? pct(st.pctInRange) : '—'}</td>
                    <td className="tabular py-2 text-ink-3">{st.count ? pct(st.coveragePct) : 'aucune mesure'}</td>
                  </>
                )}
                {hasMeter && (
                  <td className="tabular py-2">
                    {m.length ? m.map((r) => <span key={r.at.toISOString()} className="block">{meterLine(r)}</span>) : <span className="text-ink-3">—</span>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <Meta className="mt-2">
          {hasSensor ? 'Un jour sans mesure reste vide : BILANX ne complète jamais les données manquantes.' : 'Les jours sans mesure ne sont pas affichés.'}
        </Meta>
      </Card>
    </div>
  );
}
