import { describe, expect, it } from 'vitest';
import { insulinPeriod, validateDose, validateTreatmentChange } from '../src/insulin-entry';
import type { InsulinDose } from '../src/insulin';

const TZ = 'Europe/Paris';
const NOW = new Date('2026-11-04T18:00:00Z'); // 19:00 à Paris
const base = { productId: 'p1', units: '4', date: '2026-11-04', time: '12:30', status: 'taken' };

describe('saisie d’une injection', () => {
  it('accepte une injection faite, convertie à l’heure locale', () => {
    const r = validateDose(base, NOW, TZ);
    expect(r.ok && r.value).toMatchObject({ units: 4, status: 'taken', at: new Date('2026-11-04T11:30:00Z') });
  });
  it('accepte les demi-unités avec virgule', () => {
    expect(validateDose({ ...base, units: '4,5' }, NOW, TZ)).toMatchObject({ ok: true, value: { units: 4.5 } });
  });
  it('refuse zéro, le texte, les centièmes et les doses invraisemblables', () => {
    for (const units of ['0', 'abc', '4,25', '-2', '151'])
      expect(validateDose({ ...base, units }, NOW, TZ), units).toMatchObject({ ok: false, errors: { units: expect.any(String) } });
  });
  it('refuse une injection « faite » dans le futur, accepte une injection prévue', () => {
    expect(validateDose({ ...base, time: '21:00' }, NOW, TZ)).toMatchObject({ ok: false, errors: { time: expect.stringContaining('futur') } });
    expect(validateDose({ ...base, time: '21:00', status: 'planned' }, NOW, TZ).ok).toBe(true);
    expect(validateDose({ ...base, date: '2026-11-20', status: 'planned' }, NOW, TZ).ok).toBe(false);
  });
  it('refuse une heure invalide et un statut inconnu', () => {
    expect(validateDose({ ...base, time: '25:00' }, NOW, TZ).ok).toBe(false);
    expect(validateDose({ ...base, status: 'suggested' }, NOW, TZ).ok).toBe(false);
  });
});

describe('modification de traitement prescrite', () => {
  it('exige la description du traitement prescrit et la date d’effet', () => {
    expect(validateTreatmentChange({ subject: 'insulin:p1', effectiveDate: '', newRegimen: ' ' }, '2026-11-04')).toMatchObject({
      ok: false,
      errors: { effectiveDate: expect.any(String), newRegimen: expect.any(String) },
    });
    const ok = validateTreatmentChange(
      { subject: 'insulin:p1', effectiveDate: '2026-10-01', previousRegimen: '16 U le soir', newRegimen: '14 U le soir', prescribedBy: 'Dr Exemple', goalNote: '' },
      '2026-11-04',
    );
    expect(ok).toMatchObject({ ok: true, value: { newRegimen: '14 U le soir', goalNote: null } });
  });
});

describe('statistiques de période', () => {
  const at = (iso: string) => new Date(iso);
  const doses: InsulinDose[] = [
    { at: at('2026-11-02T06:00:00Z'), units: 4, type: 'rapid', status: 'taken' },
    { at: at('2026-11-02T21:00:00Z'), units: 16, type: 'long', status: 'taken' },
    { at: at('2026-11-03T11:00:00Z'), units: 3, type: 'rapid', status: 'skipped' },
    { at: at('2026-11-04T21:30:00Z'), units: 16, type: 'long', status: 'planned' },
    { at: at('2026-11-04T06:00:00Z'), units: 5, type: 'rapid', status: 'taken' },
    { at: at('2026-10-20T06:00:00Z'), units: 99, type: 'rapid', status: 'taken' }, // hors période
  ];
  const p = insulinPeriod(doses, TZ, { year: 2026, month: 11, day: 2 }, { year: 2026, month: 11, day: 4 });

  it('additionne par jour les seules injections faites', () => {
    expect(p.days).toEqual([
      { date: '2026-11-02', rapid: 4, long: 16, other: 0, total: 20 },
      { date: '2026-11-03', rapid: 0, long: 0, other: 0, total: 0 },
      { date: '2026-11-04', rapid: 5, long: 0, other: 0, total: 5 },
    ]);
  });
  it('moyenne sur les jours avec saisie, sans inventer les jours vides', () => {
    expect(p.daysWithData).toBe(2);
    expect(p.averagePerRecordedDay).toBe(12.5);
    expect(p.periodDays).toBe(3);
    expect(p.summary.total).toBe(25);
  });
});
