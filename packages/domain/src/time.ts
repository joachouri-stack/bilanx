/**
 * Gestion des journées dans le fuseau du profil (ex. Europe/Paris), y compris
 * les jours de changement d'heure (23 h ou 25 h). Les instants sont en UTC (Date).
 */

export interface LocalDate {
  year: number;
  month: number; // 1-12
  day: number;
}

function partsInZone(instant: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p: Record<string, number> = {};
  for (const { type, value } of fmt.formatToParts(instant)) {
    if (type !== 'literal') p[type] = Number(value);
  }
  return p as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Décalage (ms) du fuseau par rapport à UTC à un instant donné. */
export function zoneOffsetMs(instant: Date, timeZone: string): number {
  const p = partsInZone(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Instant UTC correspondant à une heure locale donnée dans le fuseau. */
export function zonedTimeToUtc(
  d: LocalDate,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(d.year, d.month - 1, d.day, hour, minute);
  // Deux itérations suffisent pour converger autour des changements d'heure.
  let t = guess - zoneOffsetMs(new Date(guess), timeZone);
  t = guess - zoneOffsetMs(new Date(t), timeZone);
  return new Date(t);
}

export function localDateOf(instant: Date, timeZone: string): LocalDate {
  const p = partsInZone(instant, timeZone);
  return { year: p.year, month: p.month, day: p.day };
}

/** Heure locale décimale (ex. 13,5 = 13:30) d'un instant dans le fuseau. */
export function localHourOf(instant: Date, timeZone: string): number {
  const p = partsInZone(instant, timeZone);
  return p.hour + p.minute / 60 + p.second / 3600;
}

export function addDays(d: LocalDate, n: number): LocalDate {
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day + n));
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

export function compareLocalDates(a: LocalDate, b: LocalDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

export function formatLocalDate(d: LocalDate): string {
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

export function parseLocalDate(s: string): LocalDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  const check = addDays(d, 0);
  return compareLocalDates(check, d) === 0 ? d : null;
}

/** Bornes [début, fin[ d'une journée locale, en UTC. Durée = 23, 24 ou 25 h. */
export function dayBounds(d: LocalDate, timeZone: string): { start: Date; end: Date } {
  return {
    start: zonedTimeToUtc(d, 0, 0, timeZone),
    end: zonedTimeToUtc(addDays(d, 1), 0, 0, timeZone),
  };
}
