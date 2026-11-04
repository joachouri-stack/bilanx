import { describe, expect, it } from 'vitest';
import { validateJournalEntry } from '../src/journal-entry';

const TZ = 'Europe/Paris';
const NOW = new Date('2026-11-04T18:00:00Z'); // 19:00 à Paris
const meal = { kind: 'meal', mealKind: 'lunch', date: '2026-11-04', time: '12:30', description: 'Salade de lentilles, poisson' };

describe('journal : repas', () => {
  it('accepte un repas, glucides seulement s’ils sont indiqués', () => {
    const r = validateJournalEntry(meal, NOW, TZ);
    expect(r.ok && r.value).toMatchObject({ kind: 'meal', mealKind: 'lunch', carbsG: null, at: new Date('2026-11-04T11:30:00Z') });
    expect(validateJournalEntry({ ...meal, carbs: '45,5' }, NOW, TZ)).toMatchObject({ ok: true, value: { carbsG: 45.5 } });
  });
  it('exige le type de repas et une description', () => {
    expect(validateJournalEntry({ ...meal, mealKind: '' }, NOW, TZ)).toMatchObject({ ok: false, errors: { mealKind: expect.any(String) } });
    expect(validateJournalEntry({ ...meal, description: ' ' }, NOW, TZ)).toMatchObject({ ok: false, errors: { description: expect.any(String) } });
  });
  it('refuse des glucides invraisemblables', () => {
    for (const carbs of ['-5', '1000', 'beaucoup']) expect(validateJournalEntry({ ...meal, carbs }, NOW, TZ).ok, carbs).toBe(false);
  });
  it('refuse une heure future', () => {
    expect(validateJournalEntry({ ...meal, time: '21:00' }, NOW, TZ)).toMatchObject({ ok: false, errors: { time: expect.stringContaining('futur') } });
  });
});

describe('journal : événements', () => {
  it('activité avec durée et intensité', () => {
    const r = validateJournalEntry({ kind: 'activity', date: '2026-11-04', time: '17:00', endTime: '17:40', description: 'Marche', intensity: '3' }, NOW, TZ);
    expect(r.ok && r.value).toMatchObject({ intensity: 3, endedAt: new Date('2026-11-04T16:40:00Z') });
  });
  it('sommeil qui se termine le lendemain', () => {
    const r = validateJournalEntry({ kind: 'sleep', date: '2026-11-03', time: '23:00', endTime: '07:00', comment: 'Nuit agitée' }, NOW, TZ);
    expect(r.ok && (r.value.endedAt!.getTime() - r.value.at.getTime()) / 3_600_000).toBe(8);
  });
  it('n’accepte ni glucides hors repas ni intensité hors échelle', () => {
    expect(validateJournalEntry({ kind: 'stress', date: '2026-11-04', time: '10:00', description: 'Réunion', carbs: '20' }, NOW, TZ).ok).toBe(false);
    expect(validateJournalEntry({ kind: 'stress', date: '2026-11-04', time: '10:00', description: 'Réunion', intensity: '7' }, NOW, TZ).ok).toBe(false);
  });
  it('exige un texte et un type connu', () => {
    expect(validateJournalEntry({ kind: 'symptom', date: '2026-11-04', time: '10:00' }, NOW, TZ).ok).toBe(false);
    expect(validateJournalEntry({ kind: 'diagnostic', date: '2026-11-04', time: '10:00', description: 'x' }, NOW, TZ).ok).toBe(false);
  });
});
