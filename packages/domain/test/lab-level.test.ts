import { describe, expect, it } from 'vitest';
import { labLevel, labTrend } from '../src/reference-gauge';

describe('niveau d’un résultat en trois couleurs', () => {
  const r = { low: 30, high: 300 }; // ferritine
  it('bon au milieu, moyen près d’une borne ou juste en dehors, à revoir nettement en dehors', () => {
    expect(labLevel(150, r)).toBe('good');
    expect(labLevel(45, r)).toBe('fair'); // 15 / 270 < 10 %
    expect(labLevel(25, r)).toBe('fair'); // juste en dessous
    expect(labLevel(5, r)).toBe('fair'); // 25 / 270 < 25 %
    expect(labLevel(310, r)).toBe('fair');
    expect(labLevel(500, r)).toBe('poor');
    const vitD = { low: 30, high: 100 };
    expect(labLevel(18, vitD)).toBe('fair'); // 12 / 70 = 17 %
    expect(labLevel(10, vitD)).toBe('poor');
  });
  it('intervalle à une seule borne', () => {
    expect(labLevel(2, { high: 5 })).toBe('good');
    expect(labLevel(4.8, { high: 5 })).toBe('fair');
    expect(labLevel(6, { high: 5 })).toBe('fair');
    expect(labLevel(12, { high: 5 })).toBe('poor');
    expect(labLevel(95, { low: 90 })).toBe('fair');
    expect(labLevel(110, { low: 90 })).toBe('good');
    expect(labLevel(50, { low: 90 })).toBe('poor');
  });
  it('sans référence ou intervalle incohérent', () => {
    expect(labLevel(5, {})).toBe('unknown');
    expect(labLevel(5, { low: 10, high: 2 })).toBe('unknown');
  });
});

describe('évolution entre deux résultats', () => {
  const vitD = { low: 30, high: 100 };
  it('se rapproche ou s’éloigne de l’intervalle', () => {
    expect(labTrend(12, 18, vitD)).toBe('better');
    expect(labTrend(18, 12, vitD)).toBe('worse');
    expect(labTrend(45, 65, vitD)).toBe('better'); // vers le milieu
    expect(labTrend(65, 95, vitD)).toBe('worse');
    expect(labTrend(18, 18.5, vitD)).toBe('stable');
  });
  it('borne haute seule (CRP) : baisser rapproche', () => {
    expect(labTrend(12, 6, { high: 5 })).toBe('better');
    expect(labTrend(2, 3, { high: 5 })).toBe('stable'); // dans l’intervalle, sans milieu
  });
});
