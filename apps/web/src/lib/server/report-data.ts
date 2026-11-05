/**
 * Rassemble les données du rapport pour le profil affiché, sur la période et les rubriques
 * demandées, en respectant les autorisations : une rubrique non autorisée est signalée comme
 * telle et n'est jamais remplie.
 */
import {
  addDays,
  agpProfile,
  compareLocalDates,
  computeGlucoseStats,
  dayBounds,
  formatLocalDate,
  getAnalyte,
  INSULIN_TYPES,
  insulinPeriod,
  stepsSeries,
  stepsStats,
  type LocalDate,
} from '@bilanx/domain';
import type { ModuleKey } from '@bilanx/profiles';
import type { ReportData, ReportLab, SectionKey, Source } from '@bilanx/reports';
import { DEMO_NEXT_APPOINTMENT, DEMO_TIMEZONE, demoDay } from '@/lib/demo-data';
import { appointments, insulin, journal, profiles } from './auth';
import { moduleAllowed, type AppContext } from './context';
import { glucoseRangeAll, journalToEvent, labResults, type LabRow } from './data';
import { insulinDoses, insulinProducts, toDomainDoses } from './insulin-data';
import { stepsDaily, stepsGoal, stepsSource } from './activity-data';

export const SECTION_MODULE: Record<SectionKey, ModuleKey> = {
  glucose: 'glucose',
  hba1c: 'lab',
  lab: 'lab',
  insulin: 'insulin',
  activity: 'activity',
  journal: 'journal',
  appointments: 'appointments',
};

const labSource = (r: LabRow): Source => (r.source === 'demo' ? 'demo' : r.source === 'document' ? 'document' : 'manual');
const toReportLab = (r: LabRow): ReportLab => ({
  analyte: getAnalyte(r.analyteCode)?.nameFr ?? r.analyteCode,
  value: r.value,
  comparator: r.comparator,
  unit: r.unit,
  refLow: r.refLow,
  refHigh: r.refHigh,
  sampledAt: r.sampledAt,
  laboratory: r.laboratory,
  source: labSource(r),
});

export async function collectReport(ctx: AppContext, from: LocalDate, to: LocalDate, sections: SectionKey[], now = new Date()): Promise<ReportData> {
  const isDemo = ctx.active.kind === 'demo';
  const access = ctx.active.kind === 'real' ? ctx.active.access : null;
  const start = dayBounds(from, DEMO_TIMEZONE).start;
  const end = dayBounds(addDays(to, 1), DEMO_TIMEZONE).start;
  const periodEnd = end.getTime() > now.getTime() ? now : end;
  let days = 0;
  for (let d = from; compareLocalDates(d, to) <= 0; d = addDays(d, 1)) days++;

  const allowed = (s: SectionKey) => moduleAllowed(ctx.active, SECTION_MODULE[s]);
  const wanted = sections.filter(allowed);
  const notAuthorized = sections.filter((s) => !allowed(s));

  const data: ReportData = {
    profile: isDemo
      ? { name: 'Claire (démonstration)', birthDate: '1975-03-12', relationship: 'self' }
      : { name: access!.displayName, birthDate: access!.birthDate, relationship: access!.relationship },
    period: { from: formatLocalDate(from), to: formatLocalDate(to), days },
    generatedAt: now,
    generatedBy: `${ctx.user.displayName ?? ''} (${ctx.user.email})`.trim(),
    timeZone: DEMO_TIMEZONE,
    isDemo,
    notAuthorized,
  };

  if (wanted.includes('glucose')) {
    const all = await glucoseRangeAll(ctx, from, to, now);
    const sensor = all.filter((r) => r.kind === 'sensor');
    data.glucose = {
      stats: computeGlucoseStats(sensor, { periodStart: start, periodEnd }),
      agp: agpProfile(sensor, DEMO_TIMEZONE),
      capillaryCount: all.length - sensor.length,
      source: isDemo ? 'demo' : 'import',
      targets: { low: 70, high: 180 },
    };
  }
  if (wanted.includes('hba1c') || wanted.includes('lab')) {
    const labs = await labResults(ctx);
    if (wanted.includes('hba1c')) data.hba1c = labs.filter((r) => r.analyteCode === 'hba1c' && r.sampledAt < end).map(toReportLab);
    if (wanted.includes('lab')) data.lab = labs.filter((r) => r.analyteCode !== 'hba1c' && r.sampledAt >= start && r.sampledAt < end).map(toReportLab);
  }
  if (wanted.includes('insulin')) {
    const [rows, products, changes] = await Promise.all([
      insulinDoses(ctx, from, to, now),
      insulinProducts(ctx),
      access ? insulin().listChanges(ctx.user, access.profileId) : Promise.resolve([]),
    ]);
    const p = insulinPeriod(toDomainDoses(rows), DEMO_TIMEZONE, from, to);
    const name = (subject: string) => products.find((x) => `insulin:${x.id}` === subject)?.name ?? 'Insuline retirée de la liste';
    data.insulin = {
      days: p.days,
      total: p.summary.total,
      averagePerRecordedDay: p.averagePerRecordedDay,
      daysWithData: p.daysWithData,
      rapidSharePct: p.summary.rapidSharePct,
      products: products.map((x) => ({ name: x.name, type: INSULIN_TYPES[x.type] })),
      changes: changes
        .filter((c) => c.effectiveDate <= formatLocalDate(to))
        .map((c) => ({ date: c.effectiveDate, subject: name(c.subject), previous: c.previousRegimen, next: c.newRegimen, prescribedBy: c.prescribedBy, goal: c.goalNote })),
      source: isDemo ? 'demo' : 'manual',
    };
  }
  if (wanted.includes('activity')) {
    const [daily, goal, src] = await Promise.all([stepsDaily(ctx, from, to, now), stepsGoal(ctx), stepsSource(ctx)]);
    const series = stepsSeries(daily, from, to);
    data.activity = { days: series, goal, stats: stepsStats(series, goal), source: isDemo ? 'demo' : 'import', devices: src?.sources ?? [] };
  }
  if (wanted.includes('journal')) {
    if (access) data.journal = (await journal().list(ctx.user, access.profileId, start, end)).map(journalToEvent).map((e) => ({ at: e.at, endedAt: null, title: e.label, detail: e.detail }));
    else {
      const out: NonNullable<ReportData['journal']> = [];
      for (let d = from; compareLocalDates(d, to) <= 0; d = addDays(d, 1))
        for (const e of demoDay(d, now).events) if (e.kind !== 'injection') out.push({ at: e.at, endedAt: null, title: e.label, detail: e.detail });
      data.journal = out;
    }
  }
  if (wanted.includes('appointments')) {
    if (access) {
      const { upcoming, past } = await appointments().list(ctx.user, access.profileId);
      const inPeriod = past.filter((a) => a.startsAt >= start && a.startsAt < end).reverse();
      data.appointments = [...inPeriod, ...upcoming.slice(0, 3)].map((a) => ({
        at: a.startsAt,
        who: [a.specialty, a.practitioner].filter(Boolean).join(' — '),
        location: a.location,
        notesAfter: a.notesAfter,
        upcoming: a.startsAt.getTime() >= now.getTime(),
      }));
    } else
      data.appointments = [
        { at: new Date(now.getTime() + DEMO_NEXT_APPOINTMENT.inDays * 86_400_000), who: DEMO_NEXT_APPOINTMENT.specialty, location: null, notesAfter: null, upcoming: true },
      ];
  }
  // La génération elle-même est inscrite au journal d'accès du profil.
  if (access) await profiles().withProfileData(ctx.user, access.profileId, 'reports', 'read', async () => null);
  return data;
}
