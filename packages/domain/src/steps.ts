/**
 * Pas : agrégation par heure à partir d'échantillons (export Apple Santé, etc.).
 *
 * Dédoublonnage iPhone / Apple Watch : les deux appareils comptent souvent les mêmes pas.
 * Pour chaque heure, on retient la source qui en a compté le plus, au lieu d'additionner
 * les sources. C'est une approximation (Apple Santé applique un ordre de priorité des
 * sources, minute par minute) : elle est signalée comme telle dans l'interface.
 */
import { addDays, compareLocalDates, formatLocalDate, localDateOf, type LocalDate } from './time';

export interface StepSample {
  source: string;
  start: Date;
  end: Date;
  value: number;
}

const HOUR = 3_600_000;

/** Pas par heure (début d'heure UTC, en ms) et par source ; un échantillon à cheval est réparti au prorata. */
export function hourlyBySource(samples: Iterable<StepSample>): Map<number, Map<string, number>> {
  const out = new Map<number, Map<string, number>>();
  for (const s of samples) addSample(out, s);
  return out;
}

/** Ajout incrémental (lecture en flux de gros fichiers). Renvoie false si l'échantillon est ignoré. */
export function addSample(out: Map<number, Map<string, number>>, s: StepSample): boolean {
  const add = (hour: number, v: number) => {
    let m = out.get(hour);
    if (!m) out.set(hour, (m = new Map()));
    m.set(s.source, (m.get(s.source) ?? 0) + v);
  };
  if (!(s.value > 0) || !Number.isFinite(s.value)) return false;
  const a = s.start.getTime();
  const b = Math.max(a, s.end.getTime());
  if (!Number.isFinite(a) || b - a > 24 * HOUR) return false; // aberrant : ignoré plutôt que réparti au hasard
  if (b === a) {
    add(Math.floor(a / HOUR) * HOUR, s.value);
    return true;
  }
  for (let h = Math.floor(a / HOUR) * HOUR; h < b; h += HOUR) {
    const overlap = Math.min(b, h + HOUR) - Math.max(a, h);
    if (overlap > 0) add(h, (s.value * overlap) / (b - a));
  }
  return true;
}

/** Une valeur par heure : la source ayant compté le plus de pas. */
export function dedupHourly(bySource: Map<number, Map<string, number>>): Map<number, number> {
  const out = new Map<number, number>();
  for (const [hour, m] of bySource) out.set(hour, Math.round(Math.max(...m.values())));
  return out;
}

/** Totaux par jour local à partir des heures dédoublonnées. */
export function dailyTotals(hourly: Map<number, number>, timeZone: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const [hour, v] of hourly) {
    const k = formatLocalDate(localDateOf(new Date(hour), timeZone));
    out.set(k, (out.get(k) ?? 0) + v);
  }
  return out;
}

export interface StepsDay {
  date: string;
  steps: number | null; // null : aucune donnée ce jour-là (différent de 0)
}

/** Série continue de jours [from, to] : les jours sans donnée restent null, jamais 0 inventé. */
export function stepsSeries(daily: Map<string, number>, from: LocalDate, to: LocalDate): StepsDay[] {
  const out: StepsDay[] = [];
  for (let d = from; compareLocalDates(d, to) <= 0; d = addDays(d, 1)) {
    const k = formatLocalDate(d);
    out.push({ date: k, steps: daily.has(k) ? daily.get(k)! : null });
  }
  return out;
}

export interface StepsStats {
  daysWithData: number;
  total: number;
  averagePerDay: number | null; // moyenne sur les jours avec données
  goalReachedDays: number;
  best: StepsDay | null;
}

export function stepsStats(days: StepsDay[], goal: number): StepsStats {
  const withData = days.filter((d): d is { date: string; steps: number } => d.steps !== null);
  const total = withData.reduce((a, d) => a + d.steps, 0);
  return {
    daysWithData: withData.length,
    total,
    averagePerDay: withData.length ? total / withData.length : null,
    goalReachedDays: withData.filter((d) => d.steps >= goal).length,
    best: withData.length ? withData.reduce((a, d) => (d.steps > a.steps ? d : a)) : null,
  };
}

/** Moyenne quotidienne par mois (jours avec données uniquement) : vue « année ». */
export function monthlyAverages(days: StepsDay[]): { month: string; averagePerDay: number | null; daysWithData: number }[] {
  const by = new Map<string, number[]>();
  for (const d of days) {
    const m = d.date.slice(0, 7);
    if (!by.has(m)) by.set(m, []);
    if (d.steps !== null) by.get(m)!.push(d.steps);
  }
  return [...by].map(([month, v]) => ({ month, averagePerDay: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null, daysWithData: v.length }));
}
