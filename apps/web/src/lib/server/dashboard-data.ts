/**
 * Données du tableau de bord (Accueil) : tout est calculé ici, à partir des modules de données existants,
 * pour le profil affiché (démonstration fictive ou profil réel sous RLS). Rien n'est inventé : une donnée
 * absente reste absente et la carte correspondante est masquée ou remplacée par un état vide.
 */
import {
  addDays,
  computeGlucoseStats,
  dayBounds,
  formatLocalDate,
  getAnalyte,
  gymMonthStats,
  gymStreak,
  gymWeekDays,
  gymWeekStart,
  gymWeekStatus,
  type GymMonthStats,
  type GymWeekStatus,
  localDateOf,
  hba1cMmolMolToPercent,
  normalizeUnit,
  referenceStatus,
  type GlucoseContext,
  type GlucoseStats,
  type LocalDate,
} from '@bilanx/domain';
import type { AppointmentRow, DoseOfDay } from '@bilanx/records';
import { DEMO_NEXT_APPOINTMENT, DEMO_TIMEZONE, demoDay, demoToday } from '@/lib/demo-data';
import { DOC_SHORTCUTS } from '@/lib/document-categories';
import { appointments, documents, glucose, journal, profiles } from './auth';
import { moduleAllowed, type AppContext } from './context';
import { labResults, sensorRange, type LabRow } from './data';
import { insulinDoses, insulinProducts } from './insulin-data';
import { stepsDaily, stepsGoal } from './activity-data';
import { medicationDay, medicationList } from './medication-data';
import { gymHistory } from './gym-data';
import { weightAround, weightRange } from './weight-data';

const DAY = 86_400_000;
/** Mêmes seuils que la page Glycémie (vue sur plusieurs jours). */
export const GLUCOSE_TARGETS = { veryLow: 54, low: 70, high: 180, veryHigh: 250 };

export interface Reading {
  at: Date;
  mgdl: number;
  context: GlucoseContext | null;
}

export interface MeterSummary {
  last: Reading;
  /** Mesures des 7 derniers jours (fenêtre glissante 7 × 24 h). */
  count7: number;
  mean7: number | null;
  meanPrev7: number | null;
  fasting7: number | null;
  afterMeal7: number | null;
  /** Les 7 derniers jours civils, du plus ancien à aujourd'hui, avec leurs mesures. */
  week: { date: string; readings: { at: Date; mgdl: number }[] }[];
}

export interface SensorSummary {
  last: Reading;
  /** Statistiques sur 14 × 24 h jusqu'à maintenant, exactement comme la page Glycémie (`?periode=14`). */
  stats14: GlucoseStats;
  /** Courbe des dernières 24 h (horodatage en ms, mg/dL). */
  curve: { t: number; v: number }[];
  /** Statistiques d'aujourd'hui (depuis minuit, heure de Paris, jusqu'à maintenant). */
  today: GlucoseStats;
  /** Moyenne des 7 derniers jours (null sans mesure). */
  mean7: number | null;
  /** Mesures du capteur des 8 derniers jours (pour les moments clés). */
  recent: Reading[];
  /** Moments clés (réveil à jeun, avant déjeuner, avant dîner) des 7 derniers jours, aujourd'hui en dernier. */
  moments: KeyMomentDay[];
}

export type KeyMomentKey = 'fasting' | 'lunch' | 'lunchAfter' | 'afternoon' | 'dinner' | 'dinnerAfter';

/** Valeur retenue pour un moment clé : mesure au doigt notée pour ce moment, sinon capteur à l'heure habituelle. */
export interface KeyMomentValue {
  mgdl: number | null;
  at: Date | null;
  source: 'meter' | 'sensor' | null;
  /** Vrai si l'heure de ce moment n'est pas encore arrivée (aujourd'hui). */
  upcoming: boolean;
}

export interface KeyMomentDay {
  date: string;
  values: Record<KeyMomentKey, KeyMomentValue>;
}

export interface KeyMomentDef {
  key: KeyMomentKey;
  label: string;
  short: string;
  /** Fenêtre par défaut (heure de Paris, minutes depuis minuit) et heure de référence. */
  from: number;
  to: number;
  ref: number;
  context: GlucoseContext;
  /** Repas lié : si un repas est noté dans le journal ce jour-là, la fenêtre suit son heure réelle. */
  meal?: { kind: 'lunch' | 'dinner'; phase: 'before' | 'after' };
}

/**
 * Moments clés : réveil à jeun, avant et 2 h après le déjeuner, l'après-midi (vers 17 h), avant et 2 h après le dîner.
 * Mesure au doigt notée pour ce moment en priorité ; sinon la valeur du capteur la plus proche de l'heure de référence.
 * Repas noté dans le journal : « avant » = dans l'heure qui précède, « +2 h » = entre 1 h 30 et 2 h 30 après.
 */
export const KEY_MOMENTS: KeyMomentDef[] = [
  { key: 'fasting', label: 'Réveil, à jeun', short: 'À jeun', from: 5 * 60, to: 10 * 60, ref: 7 * 60 + 30, context: 'fasting' },
  { key: 'lunch', label: 'Avant', short: 'Midi', from: 11 * 60, to: 13 * 60 + 30, ref: 12 * 60, context: 'before_meal', meal: { kind: 'lunch', phase: 'before' } },
  { key: 'lunchAfter', label: '+2 h', short: 'Midi +2 h', from: 13 * 60 + 30, to: 16 * 60, ref: 14 * 60, context: 'after_meal', meal: { kind: 'lunch', phase: 'after' } },
  { key: 'afternoon', label: 'Vers 17 h', short: 'Après-midi', from: 16 * 60, to: 18 * 60, ref: 17 * 60, context: 'other' },
  { key: 'dinner', label: 'Avant', short: 'Soir', from: 18 * 60, to: 20 * 60 + 30, ref: 19 * 60 + 30, context: 'before_meal', meal: { kind: 'dinner', phase: 'before' } },
  { key: 'dinnerAfter', label: '+2 h', short: 'Soir +2 h', from: 20 * 60 + 30, to: 23 * 60 + 59, ref: 21 * 60 + 30, context: 'after_meal', meal: { kind: 'dinner', phase: 'after' } },
];

export interface Hba1cPoint {
  /** Valeur en % (convertie si le résultat était en mmol/mol). */
  percent: number;
  sampledAt: Date;
  laboratory: string | null;
}

export interface TodaySummary {
  meds: { planned: number; taken: number; next: DoseOfDay | null } | null;
  insulin: { count: number; total: number } | null;
}

export interface NextAppointment {
  id: string | null;
  title: string;
  /** Jour du rendez-vous. */
  startsAt: Date;
  /** Heure à la française (« 10 h 30 »). */
  time: string;
  toPrepare: string | null;
}

export interface AppointmentsSummary {
  /** Prochains rendez-vous (4 au plus), du plus proche au plus lointain. */
  upcoming: NextAppointment[];
  upcomingTotal: number;
  /** Dernier rendez-vous passé. */
  last: NextAppointment | null;
}

export interface StepsSummary {
  today: number | null;
  mean7: number | null;
  days7: number;
  meanPrev7: number | null;
  goal: number;
  /** Les 7 derniers jours, du plus ancien à aujourd'hui (null : rien de noté ce jour-là). */
  week: { date: string; steps: number | null }[];
}

export interface GymSummary {
  /** Aujourd'hui (AAAA-MM-JJ). */
  today: string;
  /** Semaine en cours (lundi → dimanche). */
  week: GymWeekStatus;
  /** Les 7 jours de la semaine en cours. */
  days: { date: string; done: boolean }[];
  doneToday: boolean;
  /** Semaines réussies d'affilée. */
  streak: number;
  /** Mois en cours (mini calendrier). */
  month: GymMonthStats;
  /** Jours de séance du mois en cours (et des jours voisins de sa grille). */
  visits: string[];
}

export interface FirstStep {
  key: 'glucose' | 'hba1c' | 'prescription' | 'appointment';
  label: string;
  href: string;
  done: boolean;
}

/** Carte « Documents » : nombre de documents par raccourci (clés de `DOC_SHORTCUTS`), et total. */
export interface DashboardDocs {
  counts: Record<string, number>;
  total: number;
}

/** Carte « Poids » : dernière pesée, évolution sur 7 jours, 30 jours et 6 mois, pesées des ~6 derniers mois. */
export interface WeightSummary {
  last: { day: string; kg: number } | null;
  change7: number | null;
  change30: number | null;
  change180: number | null;
  entries: { day: string; kg: number }[];
  todayIso: string;
}

export interface DashboardData {
  isDemo: boolean;
  now: Date;
  today: LocalDate;
  showGlucose: boolean;
  meter: MeterSummary | null;
  sensor: SensorSummary | null;
  showLab: boolean;
  labsCount: number;
  hba1c: Hba1cPoint[];
  /** Dernier résultat de chaque analyse (hors HbA1c) en dehors des valeurs de référence. */
  watch: LabRow[];
  today_: TodaySummary | null;
  appointments: AppointmentsSummary | null;
  steps: StepsSummary | null;
  gym: GymSummary | null;
  weight: WeightSummary | null;
  docs: DashboardDocs | null;
  firstSteps: FirstStep[];
}

/** Heure de Paris à la française : « 10 h 30 ». */
export const frTime = (d: Date) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, hour: '2-digit', minute: '2-digit' }).format(d).replace(':', ' h ');

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function hba1cPercent(r: LabRow): number {
  return normalizeUnit(r.unit) === normalizeUnit('mmol/mol') ? hba1cMmolMolToPercent(r.value) : r.value;
}

async function capillaryReadings(ctx: AppContext, today: LocalDate, now: Date): Promise<Reading[]> {
  if (ctx.active.kind === 'demo') {
    const out: Reading[] = [];
    for (let i = 14; i >= 0; i--) out.push(...demoDay(addDays(today, -i), now).capillary.map((r) => ({ at: r.at, mgdl: r.mgdl, context: null })));
    return out;
  }
  const pid = ctx.active.access.profileId;
  const rows = await glucose().listCapillary(ctx.user, pid, new Date(now.getTime() - 15 * DAY), new Date(now.getTime() + 3_600_000), 1000);
  const list = rows.length ? rows : await glucose().recentCapillary(ctx.user, pid, 1);
  return [...list].sort((a, b) => a.at.getTime() - b.at.getTime());
}

function meterSummary(rows: Reading[], now: Date, today: LocalDate): MeterSummary | null {
  const last = rows.filter((r) => r.at.getTime() <= now.getTime() + 3_600_000).at(-1);
  if (!last) return null;
  const start = now.getTime() - 7 * DAY;
  const prevStart = start - 7 * DAY;
  const win = rows.filter((r) => r.at.getTime() >= start && r.at.getTime() <= now.getTime() + 3_600_000);
  const prev = rows.filter((r) => r.at.getTime() >= prevStart && r.at.getTime() < start);
  return {
    last,
    count7: win.length,
    mean7: mean(win.map((r) => r.mgdl)),
    meanPrev7: mean(prev.map((r) => r.mgdl)),
    fasting7: mean(win.filter((r) => r.context === 'fasting').map((r) => r.mgdl)),
    afterMeal7: mean(win.filter((r) => r.context === 'after_meal').map((r) => r.mgdl)),
    week: [6, 5, 4, 3, 2, 1, 0].map((i) => {
      const date = formatLocalDate(addDays(today, -i));
      return { date, readings: rows.filter((r) => formatLocalDate(localDateOf(r.at, DEMO_TIMEZONE)) === date).map((r) => ({ at: r.at, mgdl: r.mgdl })) };
    }),
  };
}

async function sensorSummary(ctx: AppContext, today: LocalDate, now: Date): Promise<SensorSummary | null> {
  // Même chargement et même fenêtre glissante (14 × 24 h jusqu'à maintenant) que la page Glycémie (periode.tsx).
  const readings = await sensorRange(ctx, addDays(today, -14), today, now);
  const start = new Date(now.getTime() - 14 * DAY);
  const inWindow = readings.filter((r) => r.at.getTime() >= start.getTime() && r.at.getTime() <= now.getTime());
  const last = inWindow.at(-1);
  if (!last) return null;
  const stats14 = computeGlucoseStats(inWindow, { periodStart: start, periodEnd: now, targets: GLUCOSE_TARGETS });
  const curve = inWindow.filter((r) => r.at.getTime() >= now.getTime() - DAY).map((r) => ({ t: r.at.getTime(), v: r.mgdl }));
  const midnight = dayBounds(today, DEMO_TIMEZONE).start;
  const todayStats = computeGlucoseStats(
    inWindow.filter((r) => r.at.getTime() >= midnight.getTime()),
    { periodStart: midnight, periodEnd: now, targets: GLUCOSE_TARGETS },
  );
  const mean7 = mean(inWindow.filter((r) => r.at.getTime() >= now.getTime() - 7 * DAY).map((r) => r.mgdl));
  const recent: Reading[] = inWindow.filter((r) => r.at.getTime() >= now.getTime() - 8 * DAY).map((r) => ({ at: r.at, mgdl: r.mgdl, context: null }));
  return { last: { at: last.at, mgdl: last.mgdl, context: null }, stats14, curve, today: todayStats, mean7, recent, moments: [] };
}

const minutesOfDay = (() => {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: DEMO_TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return (d: Date) => {
    const [h, m] = f.format(d).split(':').map(Number);
    return h! * 60 + m!;
  };
})();

/** Repas noté dans le journal (déjeuner ou dîner). */
export interface MealMark {
  at: Date;
  kind: 'lunch' | 'dinner';
}

/** Moments clés des 7 derniers jours (voir `KEY_MOMENTS`), aujourd'hui en dernier. */
export function keyMoments(sensor: Reading[], capillary: Reading[], meals: MealMark[], today: LocalDate, now: Date): KeyMomentDay[] {
  const nowMin = minutesOfDay(now);
  const dayKey = (d: Date) => formatLocalDate(localDateOf(d, DEMO_TIMEZONE));
  const byDay = <T extends { at: Date }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(dayKey(r.at), [...(m.get(dayKey(r.at)) ?? []), r]);
    return m;
  };
  const sDays = byDay(sensor);
  const cDays = byDay(capillary);
  const mDays = byDay(meals);
  return [6, 5, 4, 3, 2, 1, 0].map((i) => {
    const date = formatLocalDate(addDays(today, -i));
    const values = {} as Record<KeyMomentKey, KeyMomentValue>;
    for (const k of KEY_MOMENTS) {
      // Fenêtre : celle du repas noté ce jour-là (premier de ce type), sinon la fenêtre habituelle.
      let { from, to, ref } = k;
      const meal = k.meal && (mDays.get(date) ?? []).filter((m) => m.kind === k.meal!.kind).sort((a, b) => a.at.getTime() - b.at.getTime())[0];
      if (meal) {
        const mm = minutesOfDay(meal.at);
        if (k.meal!.phase === 'before') [from, to, ref] = [mm - 60, mm, mm - 10];
        else [from, to, ref] = [mm + 90, Math.min(mm + 150, 24 * 60 - 1), mm + 120];
      }
      const inWin = (r: Reading) => {
        const x = minutesOfDay(r.at);
        return x >= from && x <= to;
      };
      const upcoming = i === 0 && nowMin < from;
      const meter = (cDays.get(date) ?? []).filter((r) => inWin(r) && r.context === k.context).at(0);
      if (meter) {
        values[k.key] = { mgdl: meter.mgdl, at: meter.at, source: 'meter', upcoming: false };
        continue;
      }
      const near = (sDays.get(date) ?? [])
        .filter(inWin)
        .sort((a, b) => Math.abs(minutesOfDay(a.at) - ref) - Math.abs(minutesOfDay(b.at) - ref))
        .at(0);
      values[k.key] = near ? { mgdl: near.mgdl, at: near.at, source: 'sensor', upcoming: false } : { mgdl: null, at: null, source: null, upcoming };
    }
    return { date, values };
  });
}

/** Déjeuners et dîners notés dans le journal ces 8 derniers jours (si le module journal est autorisé). */
async function recentMeals(ctx: AppContext, now: Date): Promise<MealMark[]> {
  if (ctx.active.kind !== 'real' || !moduleAllowed(ctx.active, 'journal')) return [];
  const rows = await journal().list(ctx.user, ctx.active.access.profileId, new Date(now.getTime() - 8 * DAY), new Date(now.getTime() + 3_600_000));
  return rows.filter((r) => r.kind === 'meal' && (r.mealKind === 'lunch' || r.mealKind === 'dinner')).map((r) => ({ at: r.at, kind: r.mealKind as 'lunch' | 'dinner' }));
}

async function hasAnyGlucose(ctx: AppContext): Promise<boolean> {
  if (ctx.active.kind !== 'real') return true;
  const pid = ctx.active.access.profileId;
  const [row] = await profiles().withProfileData(ctx.user, pid, 'glucose', 'read', (tx) =>
    tx<{ found: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM glucose_reading WHERE profile_id = ${pid} AND kind IN ('sensor', 'capillary')) AS found`,
  );
  return !!row?.found;
}

export async function dashboardData(ctx: AppContext, now = new Date()): Promise<DashboardData> {
  const isDemo = ctx.active.kind === 'demo';
  const real = ctx.active.kind === 'real' ? ctx.active.access : null;
  const today = demoToday(now);
  const showGlucose = moduleAllowed(ctx.active, 'glucose');
  const showLab = moduleAllowed(ctx.active, 'lab');
  const showMeds = moduleAllowed(ctx.active, 'medications');
  const showInsulin = moduleAllowed(ctx.active, 'insulin');
  const showActivity = moduleAllowed(ctx.active, 'activity');
  const showAppointments = moduleAllowed(ctx.active, 'appointments');
  const showDocs = !!real && moduleAllowed(ctx.active, 'documents');

  const [cap, sensor, labs, medsNow, medsToday, products, doses, steps, goal, appts, docs, anyGlucose, gymDays, weights] = await Promise.all([
    showGlucose ? capillaryReadings(ctx, today, now) : Promise.resolve([] as Reading[]),
    showGlucose ? sensorSummary(ctx, today, now) : Promise.resolve(null),
    showLab ? labResults(ctx) : Promise.resolve([] as LabRow[]),
    showMeds ? medicationList(ctx) : Promise.resolve({ current: [], past: [] }),
    showMeds ? medicationDay(ctx, today, now) : Promise.resolve([] as DoseOfDay[]),
    showInsulin ? insulinProducts(ctx) : Promise.resolve([]),
    showInsulin ? insulinDoses(ctx, today, today, now) : Promise.resolve([]),
    showActivity ? stepsDaily(ctx, addDays(today, -13), today, now) : Promise.resolve(null),
    showActivity ? stepsGoal(ctx) : Promise.resolve(8000),
    real && showAppointments ? appointments().list(ctx.user, real.profileId) : Promise.resolve(null),
    showDocs && real ? documents().list(ctx.user, real.profileId) : Promise.resolve(null),
    showGlucose ? hasAnyGlucose(ctx) : Promise.resolve(false),
    showActivity ? gymHistory(ctx, today, now) : Promise.resolve(null),
    showActivity ? weightRange(ctx, addDays(today, -200), today, today) : Promise.resolve(null),
  ]);

  const meter = meterSummary(cap, now, today);
  if (sensor) sensor.moments = keyMoments(sensor.recent, cap, await recentMeals(ctx, now), today, now);

  const hba1c = labs
    .filter((r) => r.analyteCode === 'hba1c')
    .sort((a, b) => a.sampledAt.getTime() - b.sampledAt.getTime())
    .map((r) => ({ percent: hba1cPercent(r), sampledAt: r.sampledAt, laboratory: r.laboratory }));

  const latestByAnalyte = new Map<string, LabRow>();
  for (const r of labs) {
    const cur = latestByAnalyte.get(r.analyteCode);
    if (!cur || r.sampledAt > cur.sampledAt) latestByAnalyte.set(r.analyteCode, r);
  }
  const watch = [...latestByAnalyte.values()].filter((r) => {
    if (r.analyteCode === 'hba1c' || !getAnalyte(r.analyteCode)) return false;
    const st = referenceStatus(r.value, { low: r.refLow, high: r.refHigh });
    return st === 'below' || st === 'above';
  });

  // « Aujourd'hui » : seulement si le profil a des médicaments en cours ou des insulines.
  const hasMeds = medsNow.current.length > 0;
  const hasInsulin = products.length > 0 || doses.length > 0;
  const taken = doses.filter((d) => d.status === 'taken');
  const todaySummary: TodaySummary | null =
    hasMeds || hasInsulin
      ? {
          meds: hasMeds
            ? {
                planned: medsToday.length,
                taken: medsToday.filter((d) => d.status === 'taken').length,
                next: medsToday.find((d) => d.at.getTime() > now.getTime() - 30 * 60_000 && !d.status) ?? null,
              }
            : null,
          insulin: hasInsulin ? { count: taken.length, total: taken.reduce((a, d) => a + d.units, 0) } : null,
        }
      : null;

  const toNext = (a: AppointmentRow): NextAppointment => ({
    id: a.id,
    title: [a.specialty, a.practitioner].filter(Boolean).join(' — ') || 'Rendez-vous',
    startsAt: a.startsAt,
    time: frTime(a.startsAt),
    toPrepare: a.toPrepare,
  });
  let appointmentsSummary: AppointmentsSummary | null = null;
  if (isDemo) {
    appointmentsSummary = {
      upcoming: [
        {
          id: null,
          title: DEMO_NEXT_APPOINTMENT.specialty,
          startsAt: new Date(now.getTime() + DEMO_NEXT_APPOINTMENT.inDays * DAY),
          time: DEMO_NEXT_APPOINTMENT.time.replace(':', ' h '),
          toPrepare: DEMO_NEXT_APPOINTMENT.toPrepare,
        },
      ],
      upcomingTotal: 1,
      last: null,
    };
  } else if (appts && (appts.upcoming.length || appts.past.length)) {
    appointmentsSummary = {
      upcoming: appts.upcoming.slice(0, 4).map(toNext),
      upcomingTotal: appts.upcoming.length,
      last: appts.past[0] ? toNext(appts.past[0]) : null,
    };
  }

  let stepsSummary: StepsSummary | null = null;
  if (steps) {
    const val = (i: number) => steps.get(formatLocalDate(addDays(today, -i)));
    const last7 = [0, 1, 2, 3, 4, 5, 6].map(val).filter((v): v is number => v !== undefined);
    const prev7 = [7, 8, 9, 10, 11, 12, 13].map(val).filter((v): v is number => v !== undefined);
    const week = [6, 5, 4, 3, 2, 1, 0].map((i) => ({ date: formatLocalDate(addDays(today, -i)), steps: val(i) ?? null }));
    stepsSummary = { today: val(0) ?? null, mean7: mean(last7), days7: last7.length, meanPrev7: mean(prev7), goal, week };
  }

  let gymSummary: GymSummary | null = null;
  if (gymDays) {
    const todayIso = formatLocalDate(today);
    const set = new Set(gymDays);
    const monday = gymWeekStart(todayIso);
    const days = gymWeekDays(monday).map((date) => ({ date, done: set.has(date) }));
    gymSummary = {
      today: todayIso,
      week: gymWeekStatus(days.filter((d) => d.done).length, monday, todayIso),
      days,
      doneToday: set.has(todayIso),
      streak: gymStreak(gymDays, todayIso),
      month: gymMonthStats(gymDays, today.year, today.month, todayIso),
      visits: gymDays.filter((d) => d >= formatLocalDate(addDays(today, -45))),
    };
  }

  const firstSteps: FirstStep[] = [];
  if (real) {
    const w = (m: Parameters<typeof moduleAllowed>[1]) => moduleAllowed(ctx.active, m, 'write');
    if (w('glucose')) firstSteps.push({ key: 'glucose', label: 'Saisir une glycémie', href: '/glycemie#ajouter-glycemie', done: anyGlucose });
    if (w('lab')) firstSteps.push({ key: 'hba1c', label: 'Ajouter une HbA1c', href: '/analyses/ajouter?analyse=hba1c', done: hba1c.length > 0 });
    if (w('documents') && docs)
      firstSteps.push({ key: 'prescription', label: 'Ajouter une ordonnance', href: '/documents#ajouter', done: docs.some((d) => d.kind === 'prescription') });
    if (w('appointments') && appts)
      firstSteps.push({ key: 'appointment', label: 'Ajouter un rendez-vous', href: '/rendez-vous#nouveau-rendez-vous', done: appts.upcoming.length + appts.past.length > 0 });
  }

  const lastW = weights?.at(-1) ?? null;
  const weightSummary: WeightSummary | null = weights
    ? {
        last: lastW,
        change7: lastW ? (((w) => (w ? Math.round((lastW.kg - w.kg) * 10) / 10 : null))(weightAround(weights, lastW, 7))) : null,
        change30: lastW ? (((w) => (w ? Math.round((lastW.kg - w.kg) * 10) / 10 : null))(weightAround(weights, lastW, 30))) : null,
        change180: lastW ? (((w) => (w ? Math.round((lastW.kg - w.kg) * 10) / 10 : null))(weightAround(weights, lastW, 180))) : null,
        entries: weights,
        todayIso: formatLocalDate(today),
      }
    : null;
  return {
    isDemo,
    now,
    today,
    showGlucose,
    meter,
    sensor,
    showLab,
    labsCount: labs.length,
    hba1c,
    watch,
    today_: todaySummary,
    appointments: appointmentsSummary,
    steps: stepsSummary,
    gym: gymSummary,
    weight: weightSummary,
    docs: docs ? { counts: Object.fromEntries(DOC_SHORTCUTS.map((s) => [s.key, docs.filter(s.match).length])), total: docs.length } : null,
    firstSteps: firstSteps.some((s) => !s.done) ? firstSteps : [],
  };
}

