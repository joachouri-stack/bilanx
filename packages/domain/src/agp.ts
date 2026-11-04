/**
 * Profil glycémique ambulatoire (type AGP) : pour chaque heure de la journée,
 * percentiles des mesures du CAPTEUR sur la période. Descriptif uniquement.
 */
import type { GlucoseReading } from './glucose';
import { localHourOf } from './time';

export interface AgpHour {
  hour: number; // 0..23
  n: number;
  p5: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p95: number | null;
}

/** Percentile par interpolation linéaire (méthode usuelle, type 7). */
export function percentile(sorted: readonly number[], p: number): number | null {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** Une heure n'est renseignée que si elle a au moins `minPerHour` mesures (sinon : pas de valeur inventée). */
export function agpProfile(readings: readonly GlucoseReading[], timeZone: string, minPerHour = 5): AgpHour[] {
  const buckets: number[][] = Array.from({ length: 24 }, () => []);
  for (const r of readings) {
    if (r.kind !== 'sensor') continue;
    buckets[Math.floor(localHourOf(r.at, timeZone)) % 24]!.push(r.mgdl);
  }
  return buckets.map((b, hour) => {
    const s = [...b].sort((x, y) => x - y);
    const ok = s.length >= minPerHour;
    return {
      hour,
      n: s.length,
      p5: ok ? percentile(s, 0.05) : null,
      p25: ok ? percentile(s, 0.25) : null,
      p50: ok ? percentile(s, 0.5) : null,
      p75: ok ? percentile(s, 0.75) : null,
      p95: ok ? percentile(s, 0.95) : null,
    };
  });
}
