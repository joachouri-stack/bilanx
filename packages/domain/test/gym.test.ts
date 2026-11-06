import { describe, expect, it } from 'vitest';
import {
  GYM_WEEKLY_GOAL,
  daysInMonth,
  gymBestStreak,
  gymMonthStats,
  gymStreak,
  gymVisitsByWeek,
  gymWeekDays,
  gymWeekStart,
  gymWeekStatus,
  gymWeekday,
  gymYearStats,
} from '../src';

// Repères : le lundi 2 nov. 2026 ; « aujourd'hui » = vendredi 6 nov. 2026.
const TODAY = '2026-11-06';

describe('semaines du lundi au dimanche', () => {
  it('lundi de la semaine, jour de la semaine', () => {
    expect(GYM_WEEKLY_GOAL).toBe(3);
    expect(gymWeekStart('2026-11-06')).toBe('2026-11-02');
    expect(gymWeekStart('2026-11-08')).toBe('2026-11-02'); // dimanche
    expect(gymWeekStart('2026-11-02')).toBe('2026-11-02');
    expect(gymWeekStart('2027-01-01')).toBe('2026-12-28'); // à cheval sur deux années
    expect(gymWeekday('2026-11-02')).toBe(0);
    expect(gymWeekday('2026-11-08')).toBe(6);
    expect(gymWeekDays('2026-11-30')).toEqual(['2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06']);
  });

  it('séances par semaine : doublons et jours invalides ignorés', () => {
    const m = gymVisitsByWeek(['2026-11-02', '2026-11-04', '2026-11-04', '2026-11-08', '2026-11-09', 'hier', '2026-02-30']);
    expect(Object.fromEntries(m)).toEqual({ '2026-11-02': 3, '2026-11-09': 1 });
  });

  it('statut d’une semaine : atteint dès 3 séances', () => {
    expect(gymWeekStatus(2, '2026-11-02', TODAY)).toMatchObject({ reached: false, remaining: 1, current: true, future: false });
    expect(gymWeekStatus(3, '2026-11-04', TODAY)).toMatchObject({ start: '2026-11-02', reached: true, remaining: 0 });
    expect(gymWeekStatus(5, '2026-10-26', TODAY)).toMatchObject({ reached: true, remaining: 0, current: false, future: false });
    expect(gymWeekStatus(0, '2026-11-09', TODAY)).toMatchObject({ future: true, remaining: 3 });
  });
});

describe('séries', () => {
  // Semaine du 5/10 ratée (2 séances) ; semaines du 12/10, du 19/10 et du 26/10 réussies.
  const days = [
    '2026-10-06', '2026-10-08', // semaine du 5/10 : 2
    '2026-10-12', '2026-10-14', '2026-10-16', // 3
    '2026-10-19', '2026-10-21', '2026-10-23', '2026-10-24', // 4
    '2026-10-26', '2026-10-28', '2026-10-30', // 3
  ];
  it('la semaine en cours non atteinte ne casse pas la série', () => {
    expect(gymStreak([...days, '2026-11-03'], TODAY)).toBe(3);
  });
  it('la semaine en cours compte dès qu’elle est atteinte', () => {
    expect(gymStreak([...days, '2026-11-02', '2026-11-03', '2026-11-05'], TODAY)).toBe(4);
  });
  it('une semaine ratée la semaine dernière remet la série à zéro', () => {
    expect(gymStreak(days.slice(0, 9), TODAY)).toBe(0);
    expect(gymStreak([], TODAY)).toBe(0);
  });
  it('meilleure série de tous les temps', () => {
    expect(gymBestStreak(days)).toBe(3);
    expect(gymBestStreak(['2026-01-05', '2026-01-06', '2026-01-07', ...days])).toBe(3);
    expect(gymBestStreak([])).toBe(0);
  });
});

describe('mois et année', () => {
  it('nombre de jours d’un mois', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 11)).toBe(30);
  });

  it('statistiques d’un mois : grille du lundi au dimanche, semaines commencées', () => {
    const days = ['2026-10-29', '2026-10-30', '2026-11-01', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-10'];
    const s = gymMonthStats(days, 2026, 11, TODAY);
    expect(s.visits).toBe(5); // 1, 3, 4, 5 et 10 novembre
    expect(s.weeks.map((w) => w.start)).toEqual(['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']);
    // Première semaine : 29/10, 30/10 et 1/11 → atteinte, même si deux séances sont en octobre.
    expect(s.weeks[0]).toMatchObject({ count: 3, reached: true, current: false });
    expect(s.weeks[0]!.days).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(s.weeks[1]).toMatchObject({ count: 3, reached: true, current: true });
    expect(s.weeks[2]).toMatchObject({ count: 1, future: true });
    expect(s.weeks[5]!.days).toEqual(['2026-11-30', null, null, null, null, null, null]);
    expect(s).toMatchObject({ weeksElapsed: 2, weeksReached: 2, bestStreak: 2 });
  });

  it('mois sans séance', () => {
    // Le 1er février 2026 est un dimanche : 5 semaines dans la grille.
    expect(gymMonthStats([], 2026, 2, TODAY)).toMatchObject({ visits: 0, weeksElapsed: 5, weeksReached: 0, bestStreak: 0 });
  });

  it('statistiques d’une année : séances par mois, semaines réussies comptées une seule fois', () => {
    const days = ['2025-12-29', '2025-12-30', '2025-12-31', '2026-01-02', '2026-03-10', '2026-03-11', '2026-11-03'];
    const y = gymYearStats(days, 2026);
    expect(y.months).toEqual([1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 1, 0]);
    expect(y.total).toBe(4);
    // Semaine du 29/12/2025 (jeudi 1er janvier 2026) : 4 séances → comptée en 2026.
    expect(y.weeksReached).toBe(1);
    expect(gymYearStats(days, 2025)).toMatchObject({ total: 3, weeksReached: 0 });
  });
});
