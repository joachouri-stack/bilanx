/**
 * Historique des résultats de laboratoire : uniquement les dates réelles de
 * prélèvement, jamais de valeurs interpolées ou « mensualisées ».
 */
import { getAnalyte, toCanonical } from './analytes';

export interface LabResult {
  analyteCode: string;
  value: number;
  unit: string;
  sampledAt: Date;
  refLow?: number | null;
  refHigh?: number | null;
  laboratory?: string | null;
}

export function sortHistory<T extends LabResult>(results: readonly T[]): T[] {
  return [...results].sort((a, b) => a.sampledAt.getTime() - b.sampledAt.getTime());
}

export interface Evolution<T extends LabResult = LabResult> {
  latest: T;
  previous: T | null;
  /** Différence dans l'unité canonique ; null si non comparable (unités non convertibles). */
  delta: number | null;
  /** Jours entre les deux prélèvements. */
  daysBetween: number | null;
  /** Vrai si les deux valeurs ont été comparées après conversion d'unité. */
  converted: boolean;
}

/** Évolution entre le dernier résultat et le précédent pour un analyte. */
export function latestEvolution<T extends LabResult>(results: readonly T[]): Evolution<T> | null {
  const sorted = sortHistory(results);
  const latest = sorted[sorted.length - 1];
  if (!latest) return null;
  const previous = sorted[sorted.length - 2] ?? null;
  if (!previous) return { latest, previous: null, delta: null, daysBetween: null, converted: false };

  const daysBetween = Math.round((latest.sampledAt.getTime() - previous.sampledAt.getTime()) / 86_400_000);
  if (latest.unit === previous.unit) {
    return { latest, previous, delta: latest.value - previous.value, daysBetween, converted: false };
  }
  const analyte = getAnalyte(latest.analyteCode);
  const a = analyte ? toCanonical(analyte, latest.value, latest.unit) : null;
  const b = analyte ? toCanonical(analyte, previous.value, previous.unit) : null;
  return {
    latest,
    previous,
    delta: a !== null && b !== null ? a - b : null,
    daysBetween,
    converted: a !== null && b !== null,
  };
}

/** Filtre une fenêtre (ex. 6 ou 12 derniers mois) sans rien ajouter. */
export function historyWindow<T extends LabResult>(results: readonly T[], months: number, now: Date): T[] {
  const from = new Date(now);
  from.setMonth(from.getMonth() - months);
  return sortHistory(results).filter((r) => r.sampledAt >= from && r.sampledAt <= now);
}
