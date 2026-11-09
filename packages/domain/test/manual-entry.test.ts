import { describe, expect, it } from 'vitest';
import { getAnalyte } from '../src/analytes';
import { unitsFor, validateManualLab } from '../src/manual-entry';

const TODAY = '2026-11-04';
const base = { analyteCode: 'ferritin', value: '25', unit: 'µg/L', sampledOn: '2026-09-03' };

describe('saisie manuelle d’un résultat', () => {
  it('accepte une saisie complète et calcule la valeur canonique', () => {
    const r = validateManualLab({ ...base, laboratory: ' Labo du centre ', refLow: '30', refHigh: '300' }, TODAY);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ value: 25, unit: 'µg/L', valueCanonical: 25, refLow: 30, refHigh: 300, laboratory: 'Labo du centre' });
  });

  it('lit la virgule décimale et le comparateur', () => {
    const r = validateManualLab({ analyteCode: 'crp', value: '< 5', unit: 'mg/L', sampledOn: '2026-09-03' }, TODAY);
    expect(r.ok && r.value).toMatchObject({ value: 5, comparator: '<' });
    const h = validateManualLab({ analyteCode: 'hba1c', value: '7,2', unit: '%', sampledOn: '2026-09-03' }, TODAY);
    expect(h.ok && h.value.value).toBe(7.2);
  });

  it('convertit une unité alternative', () => {
    const r = validateManualLab({ analyteCode: 'vitamin_d_25oh', value: '45', unit: 'nmol/L', sampledOn: '2026-09-03' }, TODAY);
    expect(r.ok && r.value.valueCanonical).toBeCloseTo(18.03, 2);
  });

  it('refuse une unité qui ne correspond pas à l’analyse', () => {
    const r = validateManualLab({ ...base, unit: 'mmol/L' }, TODAY);
    expect(!r.ok && r.errors.unit).toContain('Unités possibles : µg/L, ng/mL');
  });

  it('refuse une valeur improbable (virgule oubliée)', () => {
    const r = validateManualLab({ analyteCode: 'hba1c', value: '72', unit: '%', sampledOn: '2026-09-03' }, TODAY);
    expect(!r.ok && r.errors.value).toContain('improbable');
  });

  it('refuse une date future, invalide ou absente', () => {
    expect(validateManualLab({ ...base, sampledOn: '2026-11-05' }, TODAY)).toMatchObject({ ok: false, errors: { sampledOn: expect.stringContaining('futur') } });
    expect(validateManualLab({ ...base, sampledOn: '2026-02-30' }, TODAY)).toMatchObject({ ok: false });
    expect(validateManualLab({ ...base, sampledOn: '' }, TODAY)).toMatchObject({ ok: false });
  });

  it('vérifie l’intervalle de référence', () => {
    expect(validateManualLab({ ...base, refLow: '300', refHigh: '30' }, TODAY)).toMatchObject({ ok: false, errors: { refHigh: expect.any(String) } });
    expect(validateManualLab({ ...base, refLow: 'abc' }, TODAY)).toMatchObject({ ok: false, errors: { refLow: expect.any(String) } });
    expect(validateManualLab({ ...base, refHigh: '300' }, TODAY).ok).toBe(true); // borne unique acceptée
  });

  it('refuse une analyse inconnue et un texte au lieu d’un nombre', () => {
    const r = validateManualLab({ ...base, analyteCode: 'inconnue', value: 'positif' }, TODAY);
    expect(r).toMatchObject({ ok: false, errors: { analyteCode: expect.any(String), value: expect.any(String) } });
  });

  it('propose les unités de chaque analyse', () => {
    expect(unitsFor(getAnalyte('vitamin_d_25oh')!)).toEqual(['ng/mL', 'nmol/L']);
  });
});

describe('sérologies : résultat positif / négatif', () => {
  const sero = { analyteCode: 'hcv_ab', value: '', unit: '', sampledOn: '2026-09-03' };
  it('accepte « Négatif » seul, sans valeur ni unité', () => {
    const r = validateManualLab({ ...sero, qualitative: 'negative' }, TODAY);
    expect(r.ok && r.value).toMatchObject({ value: null, unit: '', qualitative: 'negative', valueCanonical: null });
  });
  it('accepte la conclusion avec l’index chiffré', () => {
    const r = validateManualLab({ ...sero, value: '0,12', unit: 'index', qualitative: 'positive' }, TODAY);
    expect(r.ok && r.value).toMatchObject({ value: 0.12, unit: 'index', qualitative: 'positive' });
  });
  it('exige une conclusion ou une valeur', () => {
    const r = validateManualLab(sero, TODAY);
    expect(!r.ok && r.errors.value).toContain('Positif / Négatif');
  });
  it('refuse une conclusion inconnue', () => {
    const r = validateManualLab({ ...sero, qualitative: 'peut-être' }, TODAY);
    expect(!r.ok && r.errors.qualitative).toBeTruthy();
  });
  it('ignore la conclusion pour une analyse chiffrée (ferritine)', () => {
    const r = validateManualLab({ ...base, qualitative: 'positive' }, TODAY);
    expect(r.ok && r.value.qualitative).toBeNull();
    expect(validateManualLab({ ...base, value: '', qualitative: 'negative' }, TODAY).ok).toBe(false);
  });
});
