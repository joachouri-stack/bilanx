/**
 * Source unique des données affichées : profil de démonstration (fictif,
 * généré) ou profil réel (PostgreSQL, sous Row-Level Security, accès journalisé).
 */
import type { GlucoseReading, LocalDate } from '@bilanx/domain';
import { addDays, dayBounds } from '@bilanx/domain';
import { DEMO_LAB_RESULTS, DEMO_TIMEZONE, demoDay, demoSensorRange, type DemoEvent } from '@/lib/demo-data';
import { profiles } from './auth';
import type { AppContext } from './context';

export interface LabRow {
  /** Identifiant en base (absent pour la démonstration). */
  id: string | null;
  analyteCode: string;
  comparator: string | null;
  note: string | null;
  value: number;
  unit: string;
  sampledAt: Date;
  refLow: number | null;
  refHigh: number | null;
  laboratory: string | null;
  source: 'document' | 'manual' | 'demo';
}

export interface GlucoseDay {
  sensor: GlucoseReading[];
  capillary: GlucoseReading[];
  events: DemoEvent[];
}

export const TIMEZONE = DEMO_TIMEZONE;

export async function labResults(ctx: AppContext, analyteCode?: string): Promise<LabRow[]> {
  if (ctx.active.kind === 'demo') {
    return DEMO_LAB_RESULTS.filter((r) => !analyteCode || r.analyteCode === analyteCode).map((r) => ({
      id: null,
      comparator: null,
      note: null,
      analyteCode: r.analyteCode,
      value: r.value,
      unit: r.unit,
      sampledAt: r.sampledAt,
      refLow: r.refLow ?? null,
      refHigh: r.refHigh ?? null,
      laboratory: r.laboratory,
      source: 'demo',
    }));
  }
  const profileId = ctx.active.access.profileId;
  const rows = await profiles().withProfileData(ctx.user, profileId, 'lab', 'read', (tx) =>
    tx<{ id: string; analyte_code: string; value: string; unit: string; sampled_at: Date; ref_low: string | null; ref_high: string | null; laboratory: string | null; source_type: string; comparator: string | null; note: string | null }[]>`
      SELECT id, analyte_code, value, unit, sampled_at, ref_low, ref_high, laboratory, source_type, comparator, note
      FROM lab_result
      WHERE profile_id = ${profileId} AND deleted_at IS NULL ${analyteCode ? tx`AND analyte_code = ${analyteCode}` : tx``}
      ORDER BY sampled_at`,
  );
  return rows.map((r) => ({
    id: r.id,
    comparator: r.comparator,
    note: r.note,
    analyteCode: r.analyte_code,
    value: Number(r.value),
    unit: r.unit,
    sampledAt: r.sampled_at,
    refLow: r.ref_low === null ? null : Number(r.ref_low),
    refHigh: r.ref_high === null ? null : Number(r.ref_high),
    laboratory: r.laboratory,
    source: r.source_type === 'document_extraction' ? 'document' : 'manual',
  }));
}

async function glucoseBetween(ctx: AppContext, start: Date, end: Date): Promise<GlucoseReading[]> {
  if (ctx.active.kind !== 'real') return [];
  const profileId = ctx.active.access.profileId;
  const rows = await profiles().withProfileData(ctx.user, profileId, 'glucose', 'read', (tx) =>
    tx<{ measured_at: Date; value_mgdl: string; kind: 'sensor' | 'capillary' | 'lab' }[]>`
      SELECT measured_at, value_mgdl, kind FROM glucose_reading
      WHERE profile_id = ${profileId} AND measured_at >= ${start} AND measured_at < ${end} AND kind IN ('sensor', 'capillary')
      ORDER BY measured_at`,
  );
  return rows.map((r) => ({ at: r.measured_at, mgdl: Number(r.value_mgdl), kind: r.kind }));
}

export async function glucoseDay(ctx: AppContext, day: LocalDate, now: Date): Promise<GlucoseDay> {
  if (ctx.active.kind === 'demo') return demoDay(day, now);
  const { start, end } = dayBounds(day, TIMEZONE);
  const all = await glucoseBetween(ctx, start, end);
  return { sensor: all.filter((r) => r.kind === 'sensor'), capillary: all.filter((r) => r.kind === 'capillary'), events: [] };
}

export async function sensorRange(ctx: AppContext, from: LocalDate, to: LocalDate, now: Date): Promise<GlucoseReading[]> {
  if (ctx.active.kind === 'demo') return demoSensorRange(from, to, now);
  const all = await glucoseBetween(ctx, dayBounds(from, TIMEZONE).start, dayBounds(addDays(to, 1), TIMEZONE).start);
  return all.filter((r) => r.kind === 'sensor');
}
