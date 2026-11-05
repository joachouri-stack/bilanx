import Link from 'next/link';
import { addDays, agpProfile, computeGlucoseStats, dayBounds, formatGlucose, formatLocalDate, formatNumberFr, localDateOf, type GlucoseReading, type GlucoseUnit, type LocalDate } from '@bilanx/domain';
import { DEMO_TIMEZONE } from '@/lib/demo-data';
import { Card, Meta, RangeBar, ScrollRegion, pct } from '@/components/ui';
import { AgpChart } from '@/components/agp-chart';

const TARGETS = { veryLow: 54, low: 70, high: 180, veryHigh: 250 };
const fmtDay = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });

/** Écart signé à la française : « +5 », « −3 », « = ». */
function delta(v: number | null, digits = 0, suffix = ''): string {
  if (v === null) return '';
  const r = Number(v.toFixed(digits));
  if (r === 0) return '= par rapport à la période précédente';
  return `${r > 0 ? '+' : '−'}${formatNumberFr(Math.abs(r), digits)}${suffix} par rapport à la période précédente`;
}

/**
 * Vue sur plusieurs jours : statistiques (comparées à la période précédente de même durée), profil
 * glycémique ambulatoire (AGP) et récapitulatif jour par jour. Rien n'est extrapolé : un jour ou une
 * heure sans mesure reste vide, et le GMI n'est montré que s'il est interprétable.
 */
export function GlucosePeriod({
  days,
  today,
  now,
  readings,
  previous,
  unit,
  unitParam,
  isDemo,
}: {
  days: number;
  today: LocalDate;
  now: Date;
  readings: GlucoseReading[];
  previous: GlucoseReading[];
  unit: GlucoseUnit;
  unitParam: string;
  isDemo: boolean;
}) {
  // Fenêtre glissante de exactement `days` × 24 h jusqu'à maintenant (comme les applications de glycémie) :
  // « 14 derniers jours » couvre bien 14 jours, condition du GMI. Le tableau, lui, suit les jours civils.
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
  const meanDeltaDisplay = meanDelta === null ? null : unit === 'mg/dL' ? meanDelta : unit === 'g/L' ? meanDelta / 100 : meanDelta / 18.016;
  const tirDelta = prev.count && stats.count ? stats.pctInRange - prev.pctInRange : null;

  // Jour par jour (du plus récent au plus ancien).
  const byDay = new Map<string, GlucoseReading[]>();
  for (const r of readings) {
    const k = formatLocalDate(localDateOf(r.at, DEMO_TIMEZONE));
    (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(r);
  }
  const rows = Array.from({ length: days }, (_, i) => addDays(today, -i)).map((d) => {
    const k = formatLocalDate(d);
    const { start: s, end: e } = dayBounds(d, DEMO_TIMEZONE);
    const st = computeGlucoseStats(byDay.get(k) ?? [], { periodStart: s, periodEnd: e.getTime() > now.getTime() ? now : e, targets: TARGETS });
    return { k, d, st };
  });
  const insufficient = stats.count === 0 || stats.coveragePct < 70;

  return (
    <>
      {insufficient && (
        <p role="status" className="mb-4 rounded-xl bg-amber-2 px-4 py-3 text-sm">
          {stats.count === 0
            ? 'Aucune mesure du capteur sur cette période.'
            : `Données disponibles sur ${pct(stats.coveragePct)} du temps : en dessous de 70 %, les statistiques sont à interpréter avec prudence (consensus international).`}
          {!isDemo && ' Aucune synchronisation automatique n’est active.'}
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <h2 className="font-semibold">Profil glycémique sur 24 h</h2>
          <p className="mb-3 text-sm text-ink-3">Toutes les journées de la période superposées : la forme d’une journée type.</p>
          {stats.count ? <AgpChart agp={agp} unit={unit} targetLow={TARGETS.low} targetHigh={TARGETS.high} /> : <p className="rounded-xl border border-dashed border-line p-10 text-center text-ink-3">Pas de mesure à représenter.</p>}
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <p className="text-[12.5px] font-medium text-ink-3">Temps dans la cible ({g(TARGETS.low)}–{g(TARGETS.high)} {unit})</p>
            <p className="tabular mt-1 text-4xl font-semibold">{stats.count ? pct(stats.pctInRange) : '—'}</p>
            {tirDelta !== null && <Meta>{delta(tirDelta, 0, ' points')}</Meta>}
            <RangeBar veryLow={stats.pctVeryLow} low={stats.pctLow} inRange={stats.pctInRange} high={stats.pctHigh} veryHigh={stats.pctVeryHigh} />
            <Meta>
              Très bas {pct(stats.pctVeryLow)} · bas {pct(stats.pctLow)} · élevé {pct(stats.pctHigh)} · très élevé {pct(stats.pctVeryHigh)}
            </Meta>
          </Card>
          <Card>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div className="col-span-2">
                <dt className="text-xs text-ink-3">Moyenne</dt>
                <dd>
                  <span className="tabular text-xl font-semibold">
                    {g(stats.mean)} <span className="text-sm font-medium text-ink-3">{unit}</span>
                  </span>
                  {meanDeltaDisplay !== null && <Meta>{delta(meanDeltaDisplay, unit === 'mg/dL' ? 0 : unit === 'g/L' ? 2 : 1, ` ${unit}`)}</Meta>}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-3">Variabilité (CV)</dt>
                <dd className="tabular text-xl font-semibold">{stats.cv === null ? '—' : pct(stats.cv)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-3">Données disponibles</dt>
                <dd className="tabular text-xl font-semibold">{pct(stats.coveragePct)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-ink-3">GMI (indicateur estimé à partir du capteur)</dt>
                <dd>
                  <span className="tabular text-xl font-semibold">{stats.gmiReliable && stats.gmiPercent !== null ? `${formatNumberFr(stats.gmiPercent, 1)} %` : '—'}</span>
                  <Meta>
                    {stats.gmiReliable
                      ? 'Estimation qui ne remplace pas l’HbA1c de laboratoire.'
                      : 'Non calculé : il faut au moins 14 jours avec des données sur 70 % du temps.'}
                  </Meta>
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>

      <Card className="mt-4">
        <h2 className="font-semibold">Jour par jour</h2>
        <ScrollRegion label="Statistiques jour par jour" className="mt-2 max-h-[480px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface text-left text-xs text-ink-3">
              <tr>
                <th className="py-2 font-medium">Jour</th>
                <th className="py-2 font-medium">Moyenne ({unit})</th>
                <th className="py-2 font-medium">Dans la cible</th>
                <th className="py-2 font-medium">Données</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map(({ k, st }) => (
                <tr key={k}>
                  <td className="py-2">
                    <Link href={`/glycemie?jour=${k}${unitParam}`} className="text-petrol underline first-letter:uppercase">
                      {fmtDay.format(new Date(`${k}T12:00:00Z`))}
                    </Link>
                  </td>
                  <td className="tabular py-2">{st.count ? g(st.mean) : '—'}</td>
                  <td className="tabular py-2">{st.count ? pct(st.pctInRange) : '—'}</td>
                  <td className="tabular py-2 text-ink-3">{st.count ? pct(st.coveragePct) : 'aucune mesure'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
        <Meta className="mt-2">Un jour sans mesure reste vide : BILANX ne complète jamais les données manquantes.</Meta>
      </Card>
    </>
  );
}
