import { describe, expect, it } from 'vitest';
import { computeGlucoseStats, gmiFromMeanMgdl, splitIntoSegments, type GlucoseReading } from '../src/glucose';

const T0 = new Date('2026-11-03T00:00:00Z');
const at = (min: number) => new Date(T0.getTime() + min * 60_000);
const day = { periodStart: T0, periodEnd: at(24 * 60) };

describe('computeGlucoseStats', () => {
  it('calcule moyenne, écart-type, CV, min/max et répartition', () => {
    const values = [50, 60, 100, 150, 200, 300];
    const readings: GlucoseReading[] = values.map((v, i) => ({ at: at(i * 15), mgdl: v, kind: 'sensor' }));
    const s = computeGlucoseStats(readings, day);
    expect(s.count).toBe(6);
    expect(s.mean).toBeCloseTo(143.333, 3);
    // écart-type de population calculé à la main
    const m = 860 / 6;
    const sd = Math.sqrt(values.reduce((a, v) => a + (v - m) ** 2, 0) / 6);
    expect(s.sd).toBeCloseTo(sd, 10);
    expect(s.cv).toBeCloseTo((sd / m) * 100, 10);
    expect(s.min).toBe(50);
    expect(s.max).toBe(300);
    expect(s.pctVeryLow).toBeCloseTo(100 / 6); // 50
    expect(s.pctLow).toBeCloseTo(100 / 6); // 60
    expect(s.pctInRange).toBeCloseTo(200 / 6); // 100, 150
    expect(s.pctHigh).toBeCloseTo(100 / 6); // 200
    expect(s.pctVeryHigh).toBeCloseTo(100 / 6); // 300
  });

  it('inclut les bornes 70 et 180 dans la cible', () => {
    const r: GlucoseReading[] = [70, 180].map((v, i) => ({ at: at(i), mgdl: v, kind: 'sensor' }));
    expect(computeGlucoseStats(r, day).pctInRange).toBe(100);
  });

  it('ignore les mesures capillaires et de laboratoire', () => {
    const r: GlucoseReading[] = [
      { at: at(0), mgdl: 100, kind: 'sensor' },
      { at: at(5), mgdl: 400, kind: 'capillary' },
      { at: at(6), mgdl: 400, kind: 'lab' },
    ];
    const s = computeGlucoseStats(r, day);
    expect(s.count).toBe(1);
    expect(s.mean).toBe(100);
  });

  it('calcule la couverture : 96 mesures attendues sur 24 h', () => {
    const r: GlucoseReading[] = Array.from({ length: 48 }, (_, i) => ({ at: at(i * 15), mgdl: 120, kind: 'sensor' as const }));
    expect(computeGlucoseStats(r, day).coveragePct).toBe(50);
  });

  it('ne déclare le GMI fiable qu’à partir de 14 jours et 70 % de données', () => {
    const r: GlucoseReading[] = Array.from({ length: 96 }, (_, i) => ({ at: at(i * 15), mgdl: 154, kind: 'sensor' as const }));
    expect(computeGlucoseStats(r, day).gmiReliable).toBe(false);
    expect(computeGlucoseStats(r, day).gmiPercent).toBeCloseTo(gmiFromMeanMgdl(154), 10);
  });

  it('renvoie des statistiques vides sans inventer de valeur', () => {
    const s = computeGlucoseStats([], day);
    expect(s.mean).toBeNull();
    expect(s.gmiPercent).toBeNull();
    expect(s.coveragePct).toBe(0);
  });

  it('rejette des plages cibles incohérentes', () => {
    expect(() =>
      computeGlucoseStats([], { ...day, targets: { veryLow: 70, low: 54, high: 180, veryHigh: 250 } }),
    ).toThrow();
  });
});

describe('GMI', () => {
  it('suit la formule publiée (154 mg/dL ≈ 7,0 %)', () => {
    expect(gmiFromMeanMgdl(154)).toBeCloseTo(6.99, 2);
  });
});

describe('splitIntoSegments', () => {
  it('interrompt la courbe au-delà de 30 min sans donnée', () => {
    const pts = [0, 15, 30, 90, 105].map((m) => ({ at: at(m) }));
    const seg = splitIntoSegments(pts);
    expect(seg.map((s) => s.length)).toEqual([3, 2]);
  });
});
