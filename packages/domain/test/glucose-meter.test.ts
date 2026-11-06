import { describe, expect, it } from 'vitest';
import { meterStats } from '../src';

const at = (iso: string) => new Date(iso);

describe('statistiques des glycémies du lecteur', () => {
  it('sans mesure : tout est vide, rien n’est inventé', () => {
    const s = meterStats([]);
    expect(s).toMatchObject({ count: 0, mean: null, min: null, max: null, belowLow: 0, aboveHigh: 0, days: 0, noContext: 0 });
    expect(s.byContext.fasting).toEqual({ count: 0, mean: null });
  });

  it('moyenne, extrêmes, moments, valeurs hors plage et jours de mesure', () => {
    const s = meterStats([
      { at: at('2026-11-04T06:30:00Z'), mgdl: 100, context: 'fasting' },
      { at: at('2026-11-04T11:30:00Z'), mgdl: 190, context: 'after_meal' },
      { at: at('2026-11-05T06:30:00Z'), mgdl: 120, context: 'fasting' },
      { at: at('2026-11-05T19:00:00Z'), mgdl: 65, context: null },
      // 23 h 30 UTC le 5 = 0 h 30 le 6 à Paris : un troisième jour
      { at: at('2026-11-05T23:30:00Z'), mgdl: 180, context: 'night' },
    ]);
    expect(s.count).toBe(5);
    expect(s.mean).toBeCloseTo(131);
    expect([s.min, s.max]).toEqual([65, 190]);
    expect(s.byContext.fasting).toEqual({ count: 2, mean: 110 });
    expect(s.byContext.after_meal).toEqual({ count: 1, mean: 190 });
    expect(s.byContext.night.count).toBe(1);
    expect(s.byContext.bedtime).toEqual({ count: 0, mean: null });
    expect(s.noContext).toBe(1);
    // 180 n'est pas « au-dessus » de 180 ; 65 est sous 70.
    expect([s.belowLow, s.aboveHigh]).toEqual([1, 1]);
    expect(s.days).toBe(3);
    expect(meterStats([{ at: at('2026-11-05T23:30:00Z'), mgdl: 100, context: null }], undefined, 'UTC').days).toBe(1);
  });

  it('cibles personnalisées et contrôle de cohérence', () => {
    const r = [{ at: at('2026-11-04T06:30:00Z'), mgdl: 150, context: 'other' }];
    expect(meterStats(r, { low: 80, high: 140 }).aboveHigh).toBe(1);
    expect(meterStats(r).byContext.other.count).toBe(1);
    expect(() => meterStats(r, { low: 180, high: 70 })).toThrow();
  });
});
