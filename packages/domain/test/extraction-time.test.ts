import { describe, expect, it } from 'vitest';
import { assessDraft, parseLabNumber, parseReference, valueAppearsInSource } from '../src/extraction-checks';
import { dayBounds, localHourOf, parseLocalDate, zonedTimeToUtc } from '../src/time';

const SOURCE = `LABORATOIRE EXEMPLE — DOCUMENT FICTIF
Prélevé le : 03/09/2026
Hémoglobine glyquée   7,2 %      (4,0-6,0)
Ferritine             25 µg/L    (30-300)
25-OH Vitamine D      18 ng/mL   (30-100)
Magnésium             0,75 mmol/L (0,70-1,05)
Plaquettes            1 250 G/L`;

const now = new Date('2026-11-04T12:00:00Z');
const sampled = new Date('2026-09-03T06:12:00Z');

describe('lecture des nombres', () => {
  it.each([
    ['7,2', 7.2, null],
    ['0.75', 0.75, null],
    ['1 250', 1250, null],
    ['< 5', 5, '<'],
    ['≥ 90', 90, '>='],
  ])('« %s »', (raw, value, comp) => {
    expect(parseLabNumber(raw)).toEqual({ value, comparator: comp });
  });
  it('refuse le texte', () => {
    expect(parseLabNumber('positif')).toBeNull();
  });
  it('lit les intervalles de référence', () => {
    expect(parseReference('(4,0-6,0)')).toEqual({ low: 4, high: 6 });
    expect(parseReference('30 à 300')).toEqual({ low: 30, high: 300 });
    expect(parseReference('< 5')).toEqual({ low: null, high: 5 });
    expect(parseReference('> 90')).toEqual({ low: 90, high: null });
  });
});

describe('anti-hallucination', () => {
  it('retrouve les valeurs présentes, virgule ou point', () => {
    expect(valueAppearsInSource('7,2', SOURCE)).toBe(true);
    expect(valueAppearsInSource('7.2', SOURCE)).toBe(true);
    expect(valueAppearsInSource('0,75', SOURCE)).toBe(true);
    expect(valueAppearsInSource('1 250', SOURCE)).toBe(true);
  });
  it('rejette une valeur absente ou incluse dans un autre nombre', () => {
    expect(valueAppearsInSource('7', SOURCE)).toBe(false); // seulement « 7,2 »
    expect(valueAppearsInSource('2', SOURCE)).toBe(false);
    expect(valueAppearsInSource('42', SOURCE)).toBe(false);
    expect(valueAppearsInSource('125', SOURCE)).toBe(false);
  });
  it('ne fusionne pas deux colonnes voisines', () => {
    expect(valueAppearsInSource('1225', 'Résultats 12 25')).toBe(false);
  });
});

describe('assessDraft — exemple du cahier des charges', () => {
  const cases = [
    { rawLabel: 'Hémoglobine glyquée', rawValue: '7,2', rawUnit: '%', rawReference: '(4,0-6,0)', code: 'hba1c' },
    { rawLabel: 'Ferritine', rawValue: '25', rawUnit: 'µg/L', rawReference: '(30-300)', code: 'ferritin' },
    { rawLabel: '25-OH Vitamine D', rawValue: '18', rawUnit: 'ng/mL', rawReference: '(30-100)', code: 'vitamin_d_25oh' },
    { rawLabel: 'Magnésium', rawValue: '0,75', rawUnit: 'mmol/L', rawReference: '(0,70-1,05)', code: 'magnesium' },
  ];
  it.each(cases)('identifie $rawLabel sans alerte', (c) => {
    const a = assessDraft({ ...c, samplingDate: sampled }, SOURCE, now);
    expect(a.status).toBe('ok');
    expect(a.analyteCode).toBe(c.code);
    expect(a.checks).toEqual([]);
  });

  it('bloque une valeur inventée', () => {
    const a = assessDraft({ rawLabel: 'Vitamine B12', rawValue: '310', rawUnit: 'pmol/L', samplingDate: sampled }, SOURCE, now);
    expect(a.status).toBe('block');
    expect(a.checks.map((c) => c.code)).toContain('value_not_in_source');
  });

  it('bloque une virgule perdue (HbA1c 72 %)', () => {
    const a = assessDraft({ rawLabel: 'HbA1c', rawValue: '72', rawUnit: '%', samplingDate: sampled }, 'HbA1c 72 %', now);
    expect(a.checks.map((c) => c.code)).toContain('implausible_value');
    expect(a.status).toBe('block');
  });

  it('signale une unité inhabituelle et une date manquante', () => {
    const a = assessDraft({ rawLabel: 'Ferritine', rawValue: '25', rawUnit: 'mmol/L' }, SOURCE, now);
    expect(a.checks.map((c) => c.code)).toEqual(expect.arrayContaining(['unit_unknown', 'sampling_date_missing']));
    expect(a.status).toBe('warn');
  });

  it('bloque une date de prélèvement future', () => {
    const a = assessDraft({ rawLabel: 'Ferritine', rawValue: '25', rawUnit: 'µg/L', samplingDate: new Date('2027-01-01') }, SOURCE, now);
    expect(a.checks.map((c) => c.code)).toContain('sampling_date_future');
  });
});

describe('journées locales et changements d’heure (Europe/Paris)', () => {
  const tz = 'Europe/Paris';
  it('journée normale : 24 h', () => {
    const { start, end } = dayBounds({ year: 2026, month: 11, day: 4 }, tz);
    expect(start.toISOString()).toBe('2026-11-03T23:00:00.000Z');
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(24);
  });
  it('passage à l’heure d’été : 23 h', () => {
    const { start, end } = dayBounds({ year: 2026, month: 3, day: 29 }, tz);
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(23);
  });
  it('passage à l’heure d’hiver : 25 h', () => {
    const { start, end } = dayBounds({ year: 2026, month: 10, day: 25 }, tz);
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(25);
  });
  it('convertit heure locale ↔ UTC', () => {
    const t = zonedTimeToUtc({ year: 2026, month: 7, day: 1 }, 8, 30, tz);
    expect(t.toISOString()).toBe('2026-07-01T06:30:00.000Z');
    expect(localHourOf(t, tz)).toBe(8.5);
  });
  it('valide les dates saisies', () => {
    expect(parseLocalDate('2026-02-30')).toBeNull();
    expect(parseLocalDate('2026-11-04')).toEqual({ year: 2026, month: 11, day: 4 });
  });
});
