import { describe, expect, it } from 'vitest';
import { agpProfile, percentile } from '../src/agp';
import type { GlucoseReading } from '../src/glucose';

describe('profil glycémique sur 24 h', () => {
  it('percentiles par interpolation', () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(percentile([10, 20], 0.25)).toBe(12.5);
    expect(percentile([], 0.5)).toBeNull();
  });
  it('regroupe par heure locale, ignore capillaire et labo, n’invente rien pour les heures peu renseignées', () => {
    const r: GlucoseReading[] = [];
    // 10 jours, mesure à 08:30 heure de Paris (UTC+1 en novembre), valeurs 100..190
    for (let d = 0; d < 10; d++) r.push({ at: new Date(Date.UTC(2026, 10, 1 + d, 7, 30)), mgdl: 100 + d * 10, kind: 'sensor' });
    r.push({ at: new Date(Date.UTC(2026, 10, 1, 7, 45)), mgdl: 400, kind: 'capillary' });
    r.push({ at: new Date(Date.UTC(2026, 10, 1, 13, 0)), mgdl: 150, kind: 'sensor' }); // 14 h : une seule mesure
    const p = agpProfile(r, 'Europe/Paris');
    expect(p[8]).toMatchObject({ n: 10, p50: 145, p5: 104.5, p95: 185.5 });
    expect(p[14]).toMatchObject({ n: 1, p50: null });
    expect(p[3]!.n).toBe(0);
  });
});
