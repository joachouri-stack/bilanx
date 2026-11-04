import { describe, expect, it } from 'vitest';
import { buildIcs, validateAppointment } from '../src/appointment';

const TZ = 'Europe/Paris';
const NOW = new Date('2026-11-04T18:00:00Z');
const base = { date: '2026-11-17', time: '10:30', specialty: 'Endocrinologie' };

describe('saisie d’un rendez-vous', () => {
  it('accepte un rendez-vous et le convertit à l’heure locale', () => {
    const r = validateAppointment({ ...base, practitioner: 'Dr Exemple', reminder: '1440' }, NOW, TZ);
    expect(r.ok && r.value).toMatchObject({ startsAt: new Date('2026-11-17T09:30:00Z'), reminderMinutes: 1440, practitioner: 'Dr Exemple' });
  });
  it('accepte un rendez-vous passé (historique, notes après consultation)', () => {
    expect(validateAppointment({ ...base, date: '2026-09-01', notesAfter: 'Bilan à refaire dans 3 mois' }, NOW, TZ).ok).toBe(true);
  });
  it('exige la spécialité ou le professionnel, une date et une heure valides', () => {
    expect(validateAppointment({ date: '2026-11-17', time: '10:30' }, NOW, TZ)).toMatchObject({ ok: false, errors: { specialty: expect.any(String) } });
    expect(validateAppointment({ ...base, date: '2026-02-30' }, NOW, TZ).ok).toBe(false);
    expect(validateAppointment({ ...base, time: '10h30' }, NOW, TZ).ok).toBe(false);
    expect(validateAppointment({ ...base, date: '2031-01-01' }, NOW, TZ).ok).toBe(false);
  });
  it('refuse un rappel non proposé', () => {
    expect(validateAppointment({ ...base, reminder: '5' }, NOW, TZ).ok).toBe(false);
  });
});

describe('export agenda (.ics)', () => {
  const ics = buildIcs({
    uid: 'abc',
    startsAt: new Date('2026-11-17T09:30:00Z'),
    title: 'Endocrinologie — Dr Exemple',
    location: '12, rue de la Santé; Paris',
    description: 'À préparer : bilan sanguin\nrapport 90 jours',
    reminderMinutes: 1440,
    stamp: new Date('2026-11-04T18:00:00Z'),
  });
  it('produit un événement iCalendar valide, en UTC, avec alarme', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics).toContain('DTSTART:20261117T093000Z');
    expect(ics).toContain('DTEND:20261117T100000Z');
    expect(ics).toContain('TRIGGER:-PT1440M');
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
  });
  it('échappe virgules, points-virgules et retours à la ligne', () => {
    expect(ics).toContain('LOCATION:12\\, rue de la Santé\\; Paris');
    expect(ics).toContain('DESCRIPTION:À préparer : bilan sanguin\\nrapport 90 jours');
  });
  it('coupe les lignes longues à 75 octets', () => {
    const long = buildIcs({ uid: 'x', startsAt: new Date(0), title: 'é'.repeat(100), stamp: new Date(0) });
    for (const line of long.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
});
