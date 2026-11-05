import { describe, expect, it } from 'vitest';
import { adherence, plannedFor, validateMedication } from '../src/medication';
import { buildRecurringIcs } from '../src/appointment';

const TZ = 'Europe/Paris';

describe('saisie d’un traitement', () => {
  it('accepte un traitement avec horaires, triés', () => {
    const r = validateMedication({ name: ' Metformine ', strength: '1000 mg', posology: '1 comprimé matin et soir', times: ['20:00', '08:00', ''], qty: ['1 cp', '1 cp'] });
    expect(r.ok && r.value).toMatchObject({ name: 'Metformine', schedule: [{ time: '08:00', qty: '1 cp' }, { time: '20:00', qty: '1 cp' }] });
  });
  it('accepte un traitement « si besoin » sans horaire', () => {
    expect(validateMedication({ name: 'Paracétamol', posology: '1 g si douleur, 4 g/jour maximum' })).toMatchObject({ ok: true, value: { schedule: [] } });
  });
  it('refuse nom ou posologie absents, heures invalides ou en double, dates incohérentes', () => {
    expect(validateMedication({ name: '', posology: '' })).toMatchObject({ ok: false, errors: { name: expect.any(String), posology: expect.any(String) } });
    expect(validateMedication({ name: 'X', posology: 'x', times: ['8h'] }).ok).toBe(false);
    expect(validateMedication({ name: 'X', posology: 'x', times: ['08:00', '08:00'] }).ok).toBe(false);
    expect(validateMedication({ name: 'X', posology: 'x', startDate: '2026-11-10', endDate: '2026-11-01' }).ok).toBe(false);
  });
});

describe('prises prévues et suivi', () => {
  const med = { id: 'm1', schedule: [{ time: '08:00', qty: '1' }, { time: '20:00', qty: '1' }], startDate: '2026-11-02', endDate: '2026-11-10' };
  it('prises du jour à l’heure locale, rien hors période', () => {
    expect(plannedFor([med], { year: 2026, month: 11, day: 4 }, TZ).map((p) => p.at.toISOString())).toEqual(['2026-11-04T07:00:00.000Z', '2026-11-04T19:00:00.000Z']);
    expect(plannedFor([med], { year: 2026, month: 11, day: 1 }, TZ)).toEqual([]);
    expect(plannedFor([{ ...med, stoppedOn: '2026-11-04' }], { year: 2026, month: 11, day: 4 }, TZ)).toEqual([]);
  });
  it('suivi : les prises non renseignées ne sont jamais comptées comme oubliées', () => {
    const now = new Date('2026-11-04T12:00:00Z'); // après la prise de 08:00 du 4, avant celle de 20:00
    const a = adherence(
      [med],
      [
        { medicationId: 'm1', scheduledAt: new Date('2026-11-02T07:00:00Z'), status: 'taken' },
        { medicationId: 'm1', scheduledAt: new Date('2026-11-02T19:00:00Z'), status: 'skipped' },
        { medicationId: 'm1', scheduledAt: new Date('2026-11-04T07:00:00Z'), status: 'taken' },
      ],
      { year: 2026, month: 11, day: 2 },
      { year: 2026, month: 11, day: 4 },
      now,
      TZ,
    );
    expect(a).toEqual({ planned: 5, taken: 2, skipped: 1, unrecorded: 2, takenPctOfRecorded: (2 / 3) * 100 });
  });
});

describe('rappel récurrent dans l’agenda', () => {
  it('un événement quotidien par horaire, jusqu’à la date de fin, avec alarme', () => {
    const ics = buildRecurringIcs({
      uidPrefix: 'm1',
      title: 'Médicament',
      times: ['08:00', '20:00'],
      startDate: '2026-11-04',
      endDate: '2026-11-10',
      timeZone: TZ,
      stamp: new Date('2026-11-04T10:00:00Z'),
    });
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain('DTSTART;TZID=Europe/Paris:20261104T080000');
    expect(ics).toContain('RRULE:FREQ=DAILY;UNTIL=20261110T225959Z');
    expect(ics).toContain('TRIGGER:PT0M');
    expect(ics).toContain('BEGIN:VTIMEZONE');
  });
});
