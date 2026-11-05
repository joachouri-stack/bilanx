import { describe, expect, it } from 'vitest';
import { validateGlucoseEntry } from '../src';

const now = new Date('2026-11-05T14:00:00Z'); // 15:00 à Paris
const base = { date: '2026-11-05', time: '08:30', context: 'fasting' };

describe('saisie d’une glycémie capillaire', () => {
  it('convertit chaque unité en mg/dL', () => {
    const mg = validateGlucoseEntry({ ...base, value: '110', unit: 'mg/dL' }, now, 'Europe/Paris');
    expect(mg).toMatchObject({ ok: true, value: { mgdl: 110, context: 'fasting' } });
    if (mg.ok) expect(mg.value.at.toISOString()).toBe('2026-11-05T07:30:00.000Z');
    expect(validateGlucoseEntry({ ...base, value: '1,10', unit: 'g/L' }, now, 'Europe/Paris')).toMatchObject({ ok: true, value: { mgdl: 110 } });
    expect(validateGlucoseEntry({ ...base, value: '6,1', unit: 'mmol/L' }, now, 'Europe/Paris')).toMatchObject({ ok: true, value: { mgdl: 109.9 } });
  });
  it('refuse une valeur dans la mauvaise unité ou illisible', () => {
    expect(validateGlucoseEntry({ ...base, value: '110', unit: 'g/L' }, now, 'Europe/Paris')).toMatchObject({ ok: false, errors: { value: expect.stringContaining('vérifiez l’unité') } });
    expect(validateGlucoseEntry({ ...base, value: '1,1', unit: 'mg/dL' }, now, 'Europe/Paris')).toMatchObject({ ok: false });
    expect(validateGlucoseEntry({ ...base, value: 'abc', unit: 'mg/dL' }, now, 'Europe/Paris')).toMatchObject({ ok: false });
    expect(validateGlucoseEntry({ ...base, value: '-5', unit: 'mg/dL' }, now, 'Europe/Paris')).toMatchObject({ ok: false });
  });
  it('refuse le futur, une heure invalide et un moment inconnu ; le moment est facultatif', () => {
    expect(validateGlucoseEntry({ ...base, value: '110', unit: 'mg/dL', time: '16:00' }, now, 'Europe/Paris')).toMatchObject({ ok: false, errors: { time: expect.stringContaining('futur') } });
    expect(validateGlucoseEntry({ ...base, value: '110', unit: 'mg/dL', time: '25:00' }, now, 'Europe/Paris')).toMatchObject({ ok: false });
    expect(validateGlucoseEntry({ ...base, value: '110', unit: 'mg/dL', context: 'dessert' }, now, 'Europe/Paris')).toMatchObject({ ok: false });
    expect(validateGlucoseEntry({ ...base, value: '110', unit: 'mg/dL', context: '' }, now, 'Europe/Paris')).toMatchObject({ ok: true, value: { context: null } });
  });
});
