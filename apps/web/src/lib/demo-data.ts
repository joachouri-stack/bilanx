/**
 * ⚠️ DONNÉES FICTIVES DE DÉMONSTRATION.
 *
 * Générées de façon déterministe pour illustrer l'interface tant que les
 * comptes, la base de données et les imports réels ne sont pas branchés.
 * Elles ne représentent aucune personne réelle. Toute l'interface qui les
 * affiche porte la mention « données fictives ».
 */
import {
  addDays,
  compareLocalDates,
  dayBounds,
  localDateOf,
  type GlucoseReading,
  type InsulinDose,
  type LabResult,
  type LocalDate,
} from '@bilanx/domain';

export const DEMO_TIMEZONE = 'Europe/Paris';
export const DEMO_PROFILE = { displayName: 'Claire', initials: 'CM', isDemo: true } as const;
/** Nombre de jours d'historique glycémique fictif. */
export const DEMO_HISTORY_DAYS = 90;

export function demoToday(now: Date = new Date()): LocalDate {
  return localDateOf(now, DEMO_TIMEZONE);
}

export function demoFirstDay(now: Date = new Date()): LocalDate {
  return addDays(demoToday(now), -(DEMO_HISTORY_DAYS - 1));
}

function seeded(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const daySeed = (d: LocalDate) => d.year * 10000 + d.month * 100 + d.day;

export interface DemoEvent {
  at: Date;
  kind: 'meal' | 'injection' | 'activity' | 'note';
  label: string;
  detail: string;
  units?: number;
}

export interface DemoDay {
  sensor: GlucoseReading[];
  capillary: GlucoseReading[];
  events: DemoEvent[];
  insulin: InsulinDose[];
}

export function demoDay(d: LocalDate, now: Date = new Date()): DemoDay {
  const empty: DemoDay = { sensor: [], capillary: [], events: [], insulin: [] };
  if (compareLocalDates(d, demoFirstDay(now)) < 0 || compareLocalDates(d, demoToday(now)) > 0) return empty;

  const rnd = seeded(daySeed(d));
  const { start, end } = dayBounds(d, DEMO_TIMEZONE);
  const limit = Math.min(end.getTime(), now.getTime());
  const meals = [
    { h: 7.5 + rnd() * 0.5, amp: 45 + rnd() * 45, label: 'Petit-déjeuner', detail: 'Tartines, yaourt' },
    { h: 12.5 + rnd() * 0.75, amp: 55 + rnd() * 55, label: 'Déjeuner', detail: 'Plat du jour' },
    { h: 19.5 + rnd() * 0.75, amp: 45 + rnd() * 65, label: 'Dîner', detail: 'Repas à la maison' },
  ];
  const base = 108 + rnd() * 25;
  const nightDip = daySeed(d) % 4 === 0;
  // Petit trou de données certains jours (capteur non scanné) pour montrer l'interruption de courbe.
  const gapStart = daySeed(d) % 5 === 0 ? 2 + rnd() * 2 : -1;

  const sensor: GlucoseReading[] = [];
  for (let t = start.getTime(); t < limit; t += 15 * 60_000) {
    const h = (t - start.getTime()) / 3_600_000;
    if (gapStart > 0 && h >= gapStart && h < gapStart + 1.25) continue;
    let v = base + 10 * Math.sin(h / 3.1) + (rnd() - 0.5) * 9;
    for (const m of meals) {
      const dt = h - m.h;
      if (dt > 0) v += m.amp * Math.exp(-((dt - 1) ** 2) / 1.1);
    }
    if (nightDip && h > 3 && h < 4.6) v -= 52 * Math.sin(((h - 3) / 1.6) * Math.PI);
    sensor.push({ at: new Date(t), mgdl: Math.round(Math.max(40, Math.min(400, v))), kind: 'sensor' });
  }

  const at = (h: number) => new Date(start.getTime() + h * 3_600_000);
  const visible = (e: { at: Date }) => e.at.getTime() <= limit;

  const capillary: GlucoseReading[] = [7.2, 12.4]
    .map((h) => ({ at: at(h), mgdl: Math.round(base + (rnd() - 0.5) * 20), kind: 'capillary' as const }))
    .filter(visible);

  const rapid = meals.map((m) => ({ h: m.h - 0.1, units: 3 + Math.round(rnd() * 3) }));
  const insulin: InsulinDose[] = [
    ...rapid.map((r) => ({ at: at(r.h), units: r.units, type: 'rapid' as const, status: 'taken' as const })),
    { at: at(22), units: 16, type: 'long' as const, status: 'taken' as const },
  ].filter(visible);

  const events: DemoEvent[] = [
    ...meals.map((m) => ({ at: at(m.h), kind: 'meal' as const, label: m.label, detail: m.detail })),
    ...insulin.map((i) => ({
      at: i.at,
      kind: 'injection' as const,
      label: i.type === 'long' ? 'Insuline lente' : 'Insuline rapide',
      detail: `${i.units} U — effectuée (saisie manuelle)`,
      units: i.units,
    })),
    { at: at(17), kind: 'activity' as const, label: 'Marche', detail: '40 min, intensité modérée' },
    ...(daySeed(d) % 3 === 0 ? [{ at: at(15), kind: 'note' as const, label: 'Commentaire', detail: 'Journée stressante' }] : []),
  ].filter(visible);

  return { sensor, capillary, events, insulin };
}

export function demoSensorRange(from: LocalDate, to: LocalDate, now: Date = new Date()): GlucoseReading[] {
  const out: GlucoseReading[] = [];
  for (let d = from; compareLocalDates(d, to) <= 0; d = addDays(d, 1)) out.push(...demoDay(d, now).sensor);
  return out;
}

export function demoInsulinRange(from: LocalDate, to: LocalDate, now: Date = new Date()): InsulinDose[] {
  const out: InsulinDose[] = [];
  for (let d = from; compareLocalDates(d, to) <= 0; d = addDays(d, 1)) out.push(...demoDay(d, now).insulin);
  return out;
}

export interface DemoLabResult extends LabResult {
  laboratory: string;
  source: 'document' | 'manual';
}

const lab = 'Laboratoire Exemple (fictif)';
const r = (analyteCode: string, iso: string, value: number, unit: string, refLow: number | null, refHigh: number | null): DemoLabResult => ({
  analyteCode, value, unit, refLow, refHigh, sampledAt: new Date(`${iso}T07:00:00Z`), laboratory: lab, source: 'document',
});

export const DEMO_LAB_RESULTS: DemoLabResult[] = [
  r('hba1c', '2025-11-14', 8.1, '%', 4, 6),
  r('hba1c', '2026-02-17', 7.9, '%', 4, 6),
  r('hba1c', '2026-05-12', 7.6, '%', 4, 6),
  r('hba1c', '2026-09-03', 7.2, '%', 4, 6),
  r('ferritin', '2026-02-17', 19, 'µg/L', 30, 300),
  r('ferritin', '2026-09-03', 25, 'µg/L', 30, 300),
  r('vitamin_d_25oh', '2026-02-17', 14, 'ng/mL', 30, 100),
  r('vitamin_d_25oh', '2026-09-03', 18, 'ng/mL', 30, 100),
  r('magnesium', '2026-09-03', 0.75, 'mmol/L', 0.7, 1.05),
  r('vitamin_b12', '2026-05-12', 310, 'pmol/L', 145, 569),
  r('tsh', '2026-05-12', 2.1, 'mUI/L', 0.4, 4),
  r('crp', '2026-05-12', 1.8, 'mg/L', null, 5),
];

export const DEMO_NEXT_APPOINTMENT = {
  specialty: 'Endocrinologue',
  inDays: 13,
  time: '10:30',
  toPrepare: 'Rapport 90 jours, dernier bilan sanguin',
};

export const DEMO_MEDICATIONS = [
  { name: 'Metformine 1000 mg', posology: 'Matin et soir' },
  { name: 'Vitamine D3', posology: '1 ampoule par mois' },
];

export const DEMO_LAST_IMPORT_MINUTES_AGO = 32;
