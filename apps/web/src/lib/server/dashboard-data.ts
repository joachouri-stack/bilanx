/**
 * Données du tableau de bord (Accueil) : tout est calculé ici, à partir des modules de données existants,
 * pour le profil affiché (démonstration fictive ou profil réel sous RLS). Rien n'est inventé : une donnée
 * absente reste absente et la carte correspondante est masquée ou remplacée par un état vide.
 */
import {
  addDays,
  computeGlucoseStats,
  formatLocalDate,
  getAnalyte,
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
import { appointments, documents, glucose, profiles } from './auth';
import { moduleAllowed, type AppContext } from './context';
import { labResults, sensorRange, type LabRow } from './data';
import { insulinDoses, insulinProducts } from './insulin-data';
import { stepsDaily, stepsGoal } from './activity-data';
import { medicationDay, medicationList } from './medication-data';

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
}

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

export interface FirstStep {
  key: 'glucose' | 'hba1c' | 'prescription' | 'appointment';
  label: string;
  href: string;
  done: boolean;
}

export interface DashboardDoc {
  id: string;
  title: string | null;
  kind: string;
  exam_type: string | null;
  document_date: string | null;
  uploaded_at: Date;
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
  docs: DashboardDoc[] | null;
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
  return { last: { at: last.at, mgdl: last.mgdl, context: null }, stats14, curve };
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

  const [cap, sensor, labs, medsNow, medsToday, products, doses, steps, goal, appts, docs, anyGlucose] = await Promise.all([
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
  ]);

  const meter = meterSummary(cap, now, today);

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
    docs: docs ? docs.slice(0, 3).map((d) => ({ id: d.id, title: d.title, kind: d.kind, exam_type: d.exam_type, document_date: d.document_date, uploaded_at: d.uploaded_at })) : null,
    firstSteps: firstSteps.some((s) => !s.done) ? firstSteps : [],
  };
}

