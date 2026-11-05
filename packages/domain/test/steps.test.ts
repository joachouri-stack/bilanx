import { describe, expect, it } from 'vitest';
import { dailyTotals, dedupHourly, hourlyBySource, monthlyAverages, stepsSeries, stepsStats, type StepSample } from '../src/steps';

const t = (iso: string) => new Date(iso);
const s = (source: string, a: string, b: string, value: number): StepSample => ({ source, start: t(a), end: t(b), value });

describe('pas par heure', () => {
  it('répartit au prorata un échantillon à cheval sur deux heures', () => {
    const h = hourlyBySource([s('Watch', '2026-11-04T09:50:00Z', '2026-11-04T10:10:00Z', 200)]);
    expect(h.get(Date.parse('2026-11-04T09:00:00Z'))!.get('Watch')).toBeCloseTo(100);
    expect(h.get(Date.parse('2026-11-04T10:00:00Z'))!.get('Watch')).toBeCloseTo(100);
  });
  it('dédoublonne iPhone et Apple Watch : la source la plus complète par heure, sans addition', () => {
    const h = dedupHourly(
      hourlyBySource([
        s('Watch', '2026-11-04T09:00:00Z', '2026-11-04T09:30:00Z', 1000),
        s('iPhone', '2026-11-04T09:05:00Z', '2026-11-04T09:25:00Z', 900),
        s('iPhone', '2026-11-04T10:00:00Z', '2026-11-04T10:20:00Z', 300), // montre retirée : seul l'iPhone compte
      ]),
    );
    expect(h.get(Date.parse('2026-11-04T09:00:00Z'))).toBe(1000);
    expect(h.get(Date.parse('2026-11-04T10:00:00Z'))).toBe(300);
  });
  it('ignore les valeurs nulles, négatives et les échantillons de plus de 24 h', () => {
    expect(hourlyBySource([s('X', '2026-11-04T09:00:00Z', '2026-11-04T09:10:00Z', 0), s('X', '2026-11-01T00:00:00Z', '2026-11-04T00:00:00Z', 5000)]).size).toBe(0);
  });
});

describe('jours et statistiques', () => {
  const hourly = new Map([
    [Date.parse('2026-11-03T22:30:00Z') - 30 * 60_000, 500], // 23:00 Paris le 3 → jour local du 3
    [Date.parse('2026-11-03T23:00:00Z'), 700], // 00:00 Paris le 4
    [Date.parse('2026-11-04T10:00:00Z'), 9000],
  ]);
  const daily = dailyTotals(hourly, 'Europe/Paris');
  it('regroupe par jour local', () => {
    expect(Object.fromEntries(daily)).toEqual({ '2026-11-03': 500, '2026-11-04': 9700 });
  });
  it('les jours sans donnée restent vides (null), pas zéro', () => {
    const days = stepsSeries(daily, { year: 2026, month: 11, day: 2 }, { year: 2026, month: 11, day: 4 });
    expect(days).toEqual([
      { date: '2026-11-02', steps: null },
      { date: '2026-11-03', steps: 500 },
      { date: '2026-11-04', steps: 9700 },
    ]);
    expect(stepsStats(days, 8000)).toMatchObject({ daysWithData: 2, total: 10200, averagePerDay: 5100, goalReachedDays: 1, best: { date: '2026-11-04' } });
  });
  it('moyennes mensuelles sur les jours renseignés', () => {
    expect(monthlyAverages([{ date: '2026-10-31', steps: 4000 }, { date: '2026-11-01', steps: null }, { date: '2026-11-02', steps: 6000 }])).toEqual([
      { month: '2026-10', averagePerDay: 4000, daysWithData: 1 },
      { month: '2026-11', averagePerDay: 6000, daysWithData: 1 },
    ]);
  });
});
