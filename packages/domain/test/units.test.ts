import { describe, expect, it } from 'vitest';
import {
  glucoseForDisplay,
  hba1cForDisplay,
  hba1cMmolMolToPercent,
  hba1cPercentToMmolMol,
  mgdlToMmoll,
  mmollToMgdl,
  normalizeUnit,
} from '../src/units';
import { getAnalyte, matchAnalyte, toCanonical } from '../src/analytes';

describe('glycémie mg/dL ↔ mmol/L', () => {
  it('convertit les seuils usuels', () => {
    expect(mgdlToMmoll(70)).toBeCloseTo(3.9, 1);
    expect(mgdlToMmoll(180)).toBeCloseTo(10.0, 1);
    expect(mgdlToMmoll(54)).toBeCloseTo(3.0, 1);
    expect(mmollToMgdl(mgdlToMmoll(123))).toBeCloseTo(123, 10);
  });
  it("arrondit pour l'affichage", () => {
    expect(glucoseForDisplay(132.4, 'mg/dL')).toBe(132);
    expect(glucoseForDisplay(132, 'mmol/L')).toBe(7.3);
  });
});

describe('HbA1c % ↔ mmol/mol (équation IFCC/NGSP)', () => {
  it.each([
    [6.5, 48],
    [7.0, 53],
    [7.2, 55],
    [8.0, 64],
    [9.0, 75],
  ])('%s %% ≈ %s mmol/mol', (pct, mmol) => {
    expect(Math.round(hba1cPercentToMmolMol(pct))).toBe(mmol);
  });
  it('est réversible', () => {
    expect(hba1cMmolMolToPercent(hba1cPercentToMmolMol(7.2))).toBeCloseTo(7.2, 10);
    expect(hba1cForDisplay(55, 'mmol/mol', '%')).toBe(7.2);
    expect(hba1cForDisplay(7.2, '%', 'mmol/mol')).toBe(55);
  });
});

describe('unités des analytes', () => {
  it('normalise les écritures courantes', () => {
    expect(normalizeUnit('ug/l')).toBe('µg/L');
    expect(normalizeUnit('μg/L')).toBe('µg/L');
    expect(normalizeUnit(' ng/ml ')).toBe('ng/mL');
    expect(normalizeUnit('mmol/l')).toBe('mmol/L');
  });
  it('convertit vers l’unité canonique', () => {
    const vitD = getAnalyte('vitamin_d_25oh')!;
    expect(toCanonical(vitD, 50, 'nmol/L')).toBeCloseTo(20.03, 2);
    expect(toCanonical(vitD, 18, 'ng/mL')).toBe(18);
    const ferritin = getAnalyte('ferritin')!;
    expect(toCanonical(ferritin, 25, 'ng/ml')).toBe(25);
  });
  it('refuse de deviner une unité inconnue', () => {
    expect(toCanonical(getAnalyte('ferritin')!, 25, 'mmol/L')).toBeNull();
  });
});

describe('reconnaissance des libellés', () => {
  it.each([
    ['Hémoglobine glyquée (HbA1c)', 'hba1c'],
    ['FERRITINE', 'ferritin'],
    ['25-OH Vitamine D', 'vitamin_d_25oh'],
    ['Magnésium sérique', 'magnesium'],
    ['Fer sérique', 'iron_serum'],
    ['Hémoglobine', 'hemoglobin'],
    ['TSH us', 'tsh'],
  ])('« %s » → %s', (label, code) => {
    expect(matchAnalyte(label)?.code).toBe(code);
  });
  it('ne confond pas fer et ferritine', () => {
    expect(matchAnalyte('Ferritine')?.code).toBe('ferritin');
  });
  it('renvoie undefined plutôt que de deviner', () => {
    expect(matchAnalyte('Anticorps anti-TPO')).toBeUndefined();
  });
});

describe('glycémie : unité d’affichage au choix', () => {
  it('mg/dL, g/L (comptes rendus français) et mmol/L, à la française', async () => {
    const { formatGlucose, glucoseAxisTicks, isGlucoseUnit } = await import('../src/units');
    expect([formatGlucose(120, 'mg/dL'), formatGlucose(120, 'g/L'), formatGlucose(120, 'mmol/L')]).toEqual(['120', '1,20', '6,7']);
    expect(formatGlucose(70, 'g/L')).toBe('0,70');
    expect(formatGlucose(54.4, 'mg/dL')).toBe('54');
    expect(glucoseAxisTicks('g/L').map((t) => t.label)).toEqual(['0,54', '0,70', '1,00', '1,40', '1,80', '2,50', '3,00']);
    expect(glucoseAxisTicks('mmol/L').map((t) => t.label)).toEqual(['3', '3,9', '5,5', '7,8', '10', '13,9']);
    expect([isGlucoseUnit('g/L'), isGlucoseUnit('mg/l')]).toEqual([true, false]);
  });
});
