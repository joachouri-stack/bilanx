import { describe, expect, it } from 'vitest';
import { addMonthsIso, carePlanDue, carePlanFrequency, carePlanState, validateCarePlan } from '../src';

const TODAY = '2026-11-17';

describe('suivis réguliers', () => {
  it('ajoute des mois sans déborder', () => {
    expect(addMonthsIso('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsIso('2026-11-30', 3)).toBe('2027-02-28');
    expect(addMonthsIso('2026-08-12', 3)).toBe('2026-11-12');
  });

  it('tous les 3 mois : en retard, à prendre, à jour', () => {
    const late = carePlanState({ everyMonths: 3, fixedMonth: null, remindDays: 30, lastDone: '2026-08-12', nextBooked: null }, TODAY);
    expect(late).toMatchObject({ status: 'late', due: '2026-11-12', daysToDue: -5 });
    const soon = carePlanState({ everyMonths: 4, fixedMonth: null, remindDays: 21, lastDone: '2026-08-05', nextBooked: null }, TODAY);
    expect(soon).toMatchObject({ status: 'soon', due: '2026-12-05', remindOn: '2026-11-14', daysToDue: 18 });
    const ok = carePlanState({ everyMonths: 12, fixedMonth: null, remindDays: 30, lastDone: '2026-03-15', nextBooked: null }, TODAY);
    expect(ok.status).toBe('ok');
    expect(ok.progress).toBeGreaterThan(0.6);
  });

  it('un RDV pris l’emporte, même en retard', () => {
    expect(carePlanState({ everyMonths: 3, fixedMonth: null, remindDays: 30, lastDone: '2026-08-12', nextBooked: '2026-11-30' }, TODAY).status).toBe('booked');
  });

  it('dernier passage inconnu : à renseigner', () => {
    expect(carePlanState({ everyMonths: 3, fixedMonth: null, remindDays: 30, lastDone: null, nextBooked: null }, TODAY).status).toBe('unknown');
  });

  it('chaque année en juillet', () => {
    // Fait en juillet 2026 : prochain juillet 2027, rappel début juin.
    const s = carePlanState({ everyMonths: null, fixedMonth: 7, remindDays: 30, lastDone: '2026-07-08', nextBooked: null }, TODAY);
    expect(s).toMatchObject({ status: 'ok', due: '2027-07-01', remindOn: '2027-06-01' });
    // Jamais renseigné, juillet passé : l'an prochain.
    expect(carePlanDue({ everyMonths: null, fixedMonth: 7, lastDone: null }, TODAY)).toBe('2027-07-01');
    // Dernier passage en 2025, juillet 2026 passé sans passage : en retard.
    expect(carePlanState({ everyMonths: null, fixedMonth: 7, remindDays: 30, lastDone: '2025-07-03', nextBooked: null }, TODAY).status).toBe('late');
    // En juin, pas encore fait cette année : à prendre.
    expect(carePlanState({ everyMonths: null, fixedMonth: 7, remindDays: 30, lastDone: '2025-07-03', nextBooked: null }, '2026-06-10').status).toBe('soon');
  });

  it('validation et libellés', () => {
    expect(validateCarePlan({ label: '', everyMonths: 3 }, TODAY).ok).toBe(false);
    expect(validateCarePlan({ label: 'X', everyMonths: 3, fixedMonth: 7 }, TODAY).ok).toBe(false);
    expect(validateCarePlan({ label: 'X', everyMonths: 3, lastDone: '2027-01-01' }, TODAY).ok).toBe(false);
    const v = validateCarePlan({ label: '  Podologue ', everyMonths: 4, icon: 'foot' }, TODAY);
    expect(v.ok && v.value).toMatchObject({ label: 'Podologue', icon: 'foot', remindDays: 30 });
    expect(carePlanFrequency({ everyMonths: 12, fixedMonth: null })).toBe('1 fois par an');
    expect(carePlanFrequency({ everyMonths: null, fixedMonth: 7 })).toBe('Chaque année en juillet');
  });
});
