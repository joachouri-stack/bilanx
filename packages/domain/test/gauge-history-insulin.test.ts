import { describe, expect, it } from 'vitest';
import { gaugePosition, referenceStatus } from '../src/reference-gauge';
import { historyWindow, latestEvolution, type LabResult } from '../src/lab-history';
import { summarizeInsulin } from '../src/insulin';

describe('jauge capsule', () => {
  it('place les bornes du laboratoire à 30 % et 70 %', () => {
    expect(gaugePosition(30, { low: 30, high: 300 })!.position).toBeCloseTo(0.3);
    expect(gaugePosition(300, { low: 30, high: 300 })!.position).toBeCloseTo(0.7);
    expect(gaugePosition(165, { low: 30, high: 300 })!.position).toBeCloseTo(0.5);
  });

  it('classe la ferritine à 25 sous l’intervalle 30–300', () => {
    const g = gaugePosition(25, { low: 30, high: 300 })!;
    expect(g.status).toBe('below');
    expect(g.position).toBeLessThan(0.3);
  });

  it('plafonne les valeurs extrêmes et le signale', () => {
    const g = gaugePosition(5000, { low: 30, high: 300 })!;
    expect(g.position).toBe(0.97);
    expect(g.clamped).toBe(true);
  });

  it('gère une borne unique (CRP < 5)', () => {
    const g = gaugePosition(2.5, { high: 5 })!;
    expect(g.status).toBe('within');
    expect(g.partialRange).toBe(true);
    expect(g.position).toBeCloseTo(0.35);
  });

  it('ne dessine rien sans intervalle ou avec un intervalle incohérent', () => {
    expect(gaugePosition(5, {})).toBeNull();
    expect(gaugePosition(5, { low: 10, high: 2 })).toBeNull();
    expect(referenceStatus(5, {})).toBe('unknown');
  });
});

describe('historique de laboratoire', () => {
  const r = (iso: string, value: number, unit = '%'): LabResult => ({
    analyteCode: 'hba1c', value, unit, sampledAt: new Date(iso),
  });

  it('compare le dernier résultat au précédent, aux dates réelles', () => {
    const ev = latestEvolution([r('2026-09-03', 7.2), r('2026-05-12', 7.6), r('2026-02-17', 7.9)])!;
    expect(ev.latest.value).toBe(7.2);
    expect(ev.previous!.value).toBe(7.6);
    expect(ev.delta).toBeCloseTo(-0.4, 10);
    expect(ev.daysBetween).toBe(114);
  });

  it('convertit les unités avant comparaison quand c’est possible', () => {
    const vd = (iso: string, v: number, u: string): LabResult => ({ analyteCode: 'vitamin_d_25oh', value: v, unit: u, sampledAt: new Date(iso) });
    const ev = latestEvolution([vd('2026-01-01', 50, 'nmol/L'), vd('2026-06-01', 30, 'ng/mL')])!;
    expect(ev.converted).toBe(true);
    expect(ev.delta).toBeCloseTo(30 - 50 * 0.4006, 6);
  });

  it('refuse de comparer des unités non convertibles', () => {
    const ev = latestEvolution([r('2026-01-01', 55, 'mmol/L?'), r('2026-06-01', 7.2)])!;
    expect(ev.delta).toBeNull();
  });

  it('ne fabrique aucun point intermédiaire', () => {
    const w = historyWindow([r('2025-11-14', 8.1), r('2026-09-03', 7.2)], 12, new Date('2026-11-04'));
    expect(w).toHaveLength(2);
  });
});

describe('insuline (descriptif uniquement)', () => {
  it('additionne seulement les injections effectuées, par jour local', () => {
    const s = summarizeInsulin(
      [
        { at: new Date('2026-11-03T06:30:00Z'), units: 4, type: 'rapid', status: 'taken' },
        { at: new Date('2026-11-03T21:00:00Z'), units: 16, type: 'long', status: 'taken' },
        { at: new Date('2026-11-03T11:30:00Z'), units: 3, type: 'rapid', status: 'skipped' },
        { at: new Date('2026-11-03T23:30:00Z'), units: 2, type: 'rapid', status: 'taken' }, // 00:30 le 04/11 à Paris
      ],
      'Europe/Paris',
    );
    expect(s.dailyTotals).toEqual({ '2026-11-03': 20, '2026-11-04': 2 });
    expect(s.total).toBe(22);
    expect(s.dailyAverage).toBe(11);
    expect(s.rapidSharePct).toBeCloseTo((6 / 22) * 100);
  });
});
