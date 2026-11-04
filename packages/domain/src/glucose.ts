/**
 * Statistiques glycémiques DESCRIPTIVES à partir des mesures du capteur.
 *
 * - Les mesures capillaires et les résultats de laboratoire ne sont jamais
 *   mélangés aux statistiques du capteur.
 * - Les pourcentages de temps sont calculés sur le nombre de mesures (méthode
 *   usuelle des rapports CGM, mesures à intervalle régulier).
 * - Le GMI est un indicateur ESTIMÉ ; il ne remplace pas l'HbA1c de laboratoire.
 * - Aucune fonction de ce module ne produit de recommandation ou de dose.
 */

export type GlucoseKind = 'sensor' | 'capillary' | 'lab';

export interface GlucoseReading {
  at: Date;
  mgdl: number;
  kind: GlucoseKind;
}

export interface GlucoseTargets {
  veryLow: number; // < veryLow
  low: number; // [veryLow, low[
  high: number; // ]high, veryHigh]
  veryHigh: number; // > veryHigh
}

/** Valeurs par défaut du consensus international (Battelino et al., Diabetes Care 2019). */
export const DEFAULT_TARGETS: GlucoseTargets = { veryLow: 54, low: 70, high: 180, veryHigh: 250 };

export interface GlucoseStats {
  count: number;
  mean: number | null;
  sd: number | null;
  /** Coefficient de variation en % (écart-type / moyenne). */
  cv: number | null;
  min: number | null;
  max: number | null;
  pctVeryLow: number;
  pctLow: number;
  pctInRange: number;
  pctHigh: number;
  pctVeryHigh: number;
  /** % de mesures disponibles par rapport aux mesures attendues sur la période. */
  coveragePct: number;
  /** GMI (%) — estimation dérivée du capteur, à n'afficher qu'avec ce libellé. */
  gmiPercent: number | null;
  /** Vrai si la période et la couverture permettent un GMI interprétable (≥ 14 j et ≥ 70 %). */
  gmiReliable: boolean;
}

export interface StatsOptions {
  targets?: GlucoseTargets;
  /** Intervalle attendu entre deux mesures du capteur, en minutes (Libre 2 : 15 min d'historique). */
  expectedIntervalMinutes?: number;
  periodStart: Date;
  periodEnd: Date;
}

export function computeGlucoseStats(readings: readonly GlucoseReading[], opts: StatsOptions): GlucoseStats {
  const targets = opts.targets ?? DEFAULT_TARGETS;
  validateTargets(targets);
  const interval = opts.expectedIntervalMinutes ?? 15;
  const start = opts.periodStart.getTime();
  const end = opts.periodEnd.getTime();
  if (!(end > start)) throw new Error('Période invalide : la fin doit être postérieure au début.');

  const values = readings
    .filter((r) => r.kind === 'sensor' && r.at.getTime() >= start && r.at.getTime() < end)
    .map((r) => r.mgdl);

  const n = values.length;
  const expected = Math.floor((end - start) / (interval * 60_000));
  const coveragePct = expected > 0 ? Math.min(100, (n / expected) * 100) : 0;
  const periodDays = (end - start) / 86_400_000;

  if (n === 0) {
    return {
      count: 0, mean: null, sd: null, cv: null, min: null, max: null,
      pctVeryLow: 0, pctLow: 0, pctInRange: 0, pctHigh: 0, pctVeryHigh: 0,
      coveragePct: 0, gmiPercent: null, gmiReliable: false,
    };
  }

  let sum = 0, min = Infinity, max = -Infinity;
  let vl = 0, lo = 0, inr = 0, hi = 0, vh = 0;
  for (const v of values) {
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
    if (v < targets.veryLow) vl++;
    else if (v < targets.low) lo++;
    else if (v <= targets.high) inr++;
    else if (v <= targets.veryHigh) hi++;
    else vh++;
  }
  const mean = sum / n;
  // Écart-type de population (convention des rapports CGM).
  const sd = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / n);
  const pct = (k: number) => (k / n) * 100;

  return {
    count: n,
    mean,
    sd,
    cv: mean > 0 ? (sd / mean) * 100 : null,
    min,
    max,
    pctVeryLow: pct(vl),
    pctLow: pct(lo),
    pctInRange: pct(inr),
    pctHigh: pct(hi),
    pctVeryHigh: pct(vh),
    coveragePct,
    gmiPercent: gmiFromMeanMgdl(mean),
    gmiReliable: periodDays >= 14 && coveragePct >= 70,
  };
}

/** GMI (%) = 3,31 + 0,02392 × glycémie moyenne (mg/dL) — Bergenstal et al., 2018. */
export function gmiFromMeanMgdl(meanMgdl: number): number {
  return 3.31 + 0.02392 * meanMgdl;
}

export function validateTargets(t: GlucoseTargets): void {
  if (!(t.veryLow < t.low && t.low < t.high && t.high < t.veryHigh)) {
    throw new Error('Plages cibles incohérentes : il faut très bas < bas < haut < très haut.');
  }
}

/**
 * Découpe une série en segments continus pour le tracé : un trou supérieur à
 * `maxGapMinutes` interrompt la courbe (pas d'interpolation trompeuse).
 */
export function splitIntoSegments<T extends { at: Date }>(
  points: readonly T[],
  maxGapMinutes = 30,
): T[][] {
  const sorted = [...points].sort((a, b) => a.at.getTime() - b.at.getTime());
  const segments: T[][] = [];
  let current: T[] = [];
  for (const p of sorted) {
    const prev = current[current.length - 1];
    if (prev && p.at.getTime() - prev.at.getTime() > maxGapMinutes * 60_000) {
      segments.push(current);
      current = [];
    }
    current.push(p);
  }
  if (current.length) segments.push(current);
  return segments;
}

/** Variation relative entre deux périodes (ex. moyenne 14 j vs 14 j précédents). */
export function periodDelta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return current - previous;
}
