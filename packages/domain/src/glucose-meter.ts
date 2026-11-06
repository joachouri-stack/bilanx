/**
 * Statistiques des glycémies du LECTEUR (mesures au bout du doigt, saisies à la main).
 *
 * Elles sont calculées à part de celles du capteur : quelques mesures ponctuelles par jour ne
 * représentent pas « le temps » passé dans la cible. On compte donc des MESURES (combien sous 70,
 * combien au-dessus de 180), jamais des pourcentages de temps.
 */
import { formatLocalDate, localDateOf } from './time';
import type { GlucoseContext } from './glucose-entry';

export const METER_CONTEXTS = ['fasting', 'before_meal', 'after_meal', 'bedtime', 'night', 'other'] as const satisfies readonly GlucoseContext[];

export interface MeterReading {
  at: Date;
  mgdl: number;
  /** Moment de la mesure (à jeun, après un repas…) ; `null` s'il n'a pas été noté. */
  context: string | null;
}

export interface MeterContextStats {
  count: number;
  /** Moyenne en mg/dL, `null` sans mesure. */
  mean: number | null;
}

export interface MeterStats {
  count: number;
  mean: number | null;
  min: number | null;
  max: number | null;
  byContext: Record<GlucoseContext, MeterContextStats>;
  /** Mesures sans moment noté. */
  noContext: number;
  /** Nombre de mesures strictement sous la limite basse. */
  belowLow: number;
  /** Nombre de mesures strictement au-dessus de la limite haute. */
  aboveHigh: number;
  /** Nombre de jours (civils, dans le fuseau donné) avec au moins une mesure. */
  days: number;
}

const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function meterStats(
  readings: readonly MeterReading[],
  targets: { low: number; high: number } = { low: 70, high: 180 },
  timeZone = 'Europe/Paris',
): MeterStats {
  if (!(targets.low < targets.high)) throw new Error('Plage cible invalide : la limite basse doit être inférieure à la limite haute.');
  const values = readings.filter((r) => Number.isFinite(r.mgdl) && r.mgdl > 0);
  const groups = Object.fromEntries(METER_CONTEXTS.map((c) => [c, [] as number[]])) as Record<GlucoseContext, number[]>;
  let noContext = 0;
  const days = new Set<string>();
  for (const r of values) {
    if (r.context && r.context in groups) groups[r.context as GlucoseContext].push(r.mgdl);
    else noContext++;
    days.add(formatLocalDate(localDateOf(r.at, timeZone)));
  }
  const mgdl = values.map((r) => r.mgdl);
  return {
    count: values.length,
    mean: avg(mgdl),
    min: mgdl.length ? Math.min(...mgdl) : null,
    max: mgdl.length ? Math.max(...mgdl) : null,
    byContext: Object.fromEntries(METER_CONTEXTS.map((c) => [c, { count: groups[c].length, mean: avg(groups[c]) }])) as Record<GlucoseContext, MeterContextStats>,
    noContext,
    belowLow: mgdl.filter((v) => v < targets.low).length,
    aboveHigh: mgdl.filter((v) => v > targets.high).length,
    days: days.size,
  };
}
