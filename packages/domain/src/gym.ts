/**
 * Salle de sport : une séance = un jour coché. Objectif : 3 séances par semaine.
 * Semaines du lundi au dimanche. Fonctions pures sur des jours ISO (« AAAA-MM-JJ »).
 */
import { addDays, formatLocalDate, parseLocalDate, type LocalDate } from './time';

export const GYM_WEEKLY_GOAL = 3;

const toDate = (iso: string): LocalDate => {
  const d = parseLocalDate(iso);
  if (!d) throw new Error(`Jour invalide : ${iso}`);
  return d;
};
const shift = (iso: string, n: number) => formatLocalDate(addDays(toDate(iso), n));

/** Jour de la semaine, lundi = 0 … dimanche = 6. */
export function gymWeekday(dayIso: string): number {
  const d = toDate(dayIso);
  return (new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay() + 6) % 7;
}

/** Lundi de la semaine contenant ce jour. */
export function gymWeekStart(dayIso: string): string {
  return shift(dayIso, -gymWeekday(dayIso));
}

/** Les 7 jours (lundi … dimanche) de la semaine commençant à `mondayIso`. */
export function gymWeekDays(mondayIso: string): string[] {
  return Array.from({ length: 7 }, (_, i) => shift(mondayIso, i));
}

/** Nombre de séances par semaine (clé : lundi de la semaine). Les doublons et jours invalides sont ignorés. */
export function gymVisitsByWeek(days: Iterable<string>): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of new Set(days)) {
    if (!parseLocalDate(d)) continue;
    const k = gymWeekStart(d);
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

export interface GymWeekStatus {
  /** Lundi de la semaine. */
  start: string;
  count: number;
  goal: number;
  reached: boolean;
  /** Séances manquantes pour atteindre l'objectif (0 si atteint). */
  remaining: number;
  /** Semaine en cours (contient aujourd'hui). */
  current: boolean;
  /** Semaine pas encore commencée. */
  future: boolean;
}

/** Statut d'une semaine : atteinte dès 3 séances. */
export function gymWeekStatus(count: number, mondayIso: string, todayIso: string): GymWeekStatus {
  const start = gymWeekStart(mondayIso);
  const thisWeek = gymWeekStart(todayIso);
  return {
    start,
    count,
    goal: GYM_WEEKLY_GOAL,
    reached: count >= GYM_WEEKLY_GOAL,
    remaining: Math.max(0, GYM_WEEKLY_GOAL - count),
    current: start === thisWeek,
    future: start > thisWeek,
  };
}

/**
 * Série en cours : nombre de semaines réussies d'affilée, en remontant depuis la semaine dernière.
 * La semaine en cours compte seulement si son objectif est déjà atteint (sinon elle ne casse pas la série).
 */
export function gymStreak(days: Iterable<string>, todayIso: string): number {
  const byWeek = gymVisitsByWeek(days);
  let week = gymWeekStart(todayIso);
  let n = 0;
  if ((byWeek.get(week) ?? 0) >= GYM_WEEKLY_GOAL) n++;
  week = shift(week, -7);
  while ((byWeek.get(week) ?? 0) >= GYM_WEEKLY_GOAL) {
    n++;
    week = shift(week, -7);
  }
  return n;
}

/** Plus longue suite de semaines réussies consécutives parmi des semaines données dans l'ordre. */
function longestRun(weeks: { reached: boolean }[]): number {
  let best = 0;
  let cur = 0;
  for (const w of weeks) {
    cur = w.reached ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  return best;
}

/** Meilleure série de tous les temps (semaines réussies consécutives). */
export function gymBestStreak(days: Iterable<string>): number {
  const byWeek = gymVisitsByWeek(days);
  const starts = [...byWeek.keys()].sort();
  if (!starts.length) return 0;
  const weeks: { reached: boolean }[] = [];
  for (let w = starts[0]!; w <= starts.at(-1)!; w = shift(w, 7)) weeks.push({ reached: (byWeek.get(w) ?? 0) >= GYM_WEEKLY_GOAL });
  return longestRun(weeks);
}

export interface GymMonthWeek extends GymWeekStatus {
  /** Les 7 jours de la semaine ; `null` pour un jour hors du mois (case vide de la grille). */
  days: (string | null)[];
}

export interface GymMonthStats {
  year: number;
  month: number;
  /** Séances dans le mois. */
  visits: number;
  /** Semaines de la grille du mois (du lundi au dimanche, y compris celles à cheval sur un autre mois). */
  weeks: GymMonthWeek[];
  /** Semaines commencées (lundi passé ou aujourd'hui). */
  weeksElapsed: number;
  weeksReached: number;
  /** Plus longue suite de semaines réussies dans le mois. */
  bestStreak: number;
}

/** Nombre de jours d'un mois. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Statistiques d'un mois : séances du mois, et semaines (lundi → dimanche) de sa grille.
 * Le nombre de séances d'une semaine compte toute la semaine, même les jours d'un mois voisin.
 */
export function gymMonthStats(days: Iterable<string>, year: number, month: number, todayIso: string): GymMonthStats {
  const set = new Set([...days].filter((d) => parseLocalDate(d)));
  const byWeek = gymVisitsByWeek(set);
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  const first = `${prefix}01`;
  const last = `${prefix}${String(daysInMonth(year, month)).padStart(2, '0')}`;
  const weeks: GymMonthWeek[] = [];
  for (let w = gymWeekStart(first); w <= last; w = shift(w, 7)) {
    weeks.push({ ...gymWeekStatus(byWeek.get(w) ?? 0, w, todayIso), days: gymWeekDays(w).map((d) => (d.startsWith(prefix) ? d : null)) });
  }
  const started = weeks.filter((w) => !w.future);
  return {
    year,
    month,
    visits: [...set].filter((d) => d.startsWith(prefix)).length,
    weeks,
    weeksElapsed: started.length,
    weeksReached: started.filter((w) => w.reached).length,
    bestStreak: longestRun(started),
  };
}

export interface GymYearStats {
  year: number;
  /** Séances par mois (index 0 = janvier). */
  months: number[];
  total: number;
  /** Semaines réussies dont le jeudi tombe dans l'année (règle ISO : chaque semaine compte une seule fois). */
  weeksReached: number;
}

/** Statistiques d'une année : séances par mois, total, semaines réussies. */
export function gymYearStats(days: Iterable<string>, year: number): GymYearStats {
  const set = new Set([...days].filter((d) => parseLocalDate(d)));
  const months = Array.from({ length: 12 }, () => 0);
  for (const d of set) if (d.startsWith(`${year}-`)) months[Number(d.slice(5, 7)) - 1]!++;
  let weeksReached = 0;
  for (const [monday, n] of gymVisitsByWeek(set)) if (n >= GYM_WEEKLY_GOAL && shift(monday, 3).startsWith(`${year}-`)) weeksReached++;
  return { year, months, total: months.reduce((a, b) => a + b, 0), weeksReached };
}
