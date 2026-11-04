/**
 * Statistiques DESCRIPTIVES des injections d'insuline enregistrées.
 *
 * Ce module ne calcule, ne suggère et ne recommande AUCUNE dose. Il additionne
 * uniquement ce que l'utilisateur a déclaré comme réellement effectué.
 */
import { localDateOf, formatLocalDate } from './time';

export type InsulinType = 'rapid' | 'long' | 'intermediate' | 'mixed' | 'other';

export interface InsulinDose {
  at: Date;
  units: number;
  type: InsulinType;
  status: 'planned' | 'taken' | 'skipped';
}

export interface InsulinSummary {
  /** Total par jour local (AAAA-MM-JJ), injections effectuées seulement. */
  dailyTotals: Record<string, number>;
  total: number;
  /** Moyenne sur les jours AYANT au moins une injection enregistrée. */
  dailyAverage: number | null;
  daysWithData: number;
  byType: Record<InsulinType, number>;
  /** Part de l'insuline rapide dans le total (%), null si total nul. */
  rapidSharePct: number | null;
}

export function summarizeInsulin(doses: readonly InsulinDose[], timeZone: string): InsulinSummary {
  const byType: Record<InsulinType, number> = { rapid: 0, long: 0, intermediate: 0, mixed: 0, other: 0 };
  const dailyTotals: Record<string, number> = {};
  let total = 0;
  for (const d of doses) {
    if (d.status !== 'taken') continue;
    if (!(d.units > 0)) continue;
    const key = formatLocalDate(localDateOf(d.at, timeZone));
    dailyTotals[key] = (dailyTotals[key] ?? 0) + d.units;
    byType[d.type] += d.units;
    total += d.units;
  }
  const daysWithData = Object.keys(dailyTotals).length;
  return {
    dailyTotals,
    total,
    dailyAverage: daysWithData ? total / daysWithData : null,
    daysWithData,
    byType,
    rapidSharePct: total > 0 ? (byType.rapid / total) * 100 : null,
  };
}
