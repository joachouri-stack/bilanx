/** Médicaments du profil affiché : réels (RLS, journalisés) ou fictifs (démonstration). */
import { addDays, adherence, formatLocalDate, plannedFor, type Adherence, type LocalDate } from '@bilanx/domain';
import type { DoseOfDay, MedicationRow } from '@bilanx/records';
import { DEMO_MEDICATIONS, DEMO_TIMEZONE, demoFirstDay, demoIntakeStatus, demoToday } from '@/lib/demo-data';
import { medications } from './auth';
import type { AppContext } from './context';

/** Traitements du profil affiché (fictifs pour le profil de démonstration). */
export async function medicationList(ctx: AppContext): Promise<{ current: MedicationRow[]; past: MedicationRow[] }> {
  if (ctx.active.kind !== 'real') return { current: DEMO_MEDICATIONS, past: [] };
  return medications().list(ctx.user, ctx.active.access.profileId);
}

function demoDoses(d: LocalDate, now: Date): DoseOfDay[] {
  if (formatLocalDate(d) < formatLocalDate(demoFirstDay(now))) return [];
  return plannedFor(DEMO_MEDICATIONS, d, DEMO_TIMEZONE).map((p) => {
    const m = DEMO_MEDICATIONS.find((x) => x.id === p.medicationId)!;
    const past = p.at.getTime() <= now.getTime();
    return { ...p, name: m.name, strength: m.strength, status: past ? demoIntakeStatus(m.id, p.at) : null, recordable: false };
  });
}

export async function medicationDay(ctx: AppContext, d: LocalDate, now: Date): Promise<DoseOfDay[]> {
  if (ctx.active.kind !== 'real') return demoDoses(d, now);
  return medications().day(ctx.user, ctx.active.access.profileId, d);
}

export async function medicationFollowUp(ctx: AppContext, days: number, now: Date): Promise<Adherence & { from: string; to: string }> {
  const to = demoToday(now);
  return medicationFollowUpRange(ctx, addDays(to, -(days - 1)), to, now);
}

export async function medicationFollowUpRange(ctx: AppContext, from: LocalDate, to: LocalDate, now: Date): Promise<Adherence & { from: string; to: string }> {
  if (ctx.active.kind === 'real') return medications().followUpRange(ctx.user, ctx.active.access.profileId, from, to);
  const intakes = [];
  for (let d = from; formatLocalDate(d) <= formatLocalDate(to); d = addDays(d, 1)) {
    for (const x of demoDoses(d, now)) if (x.status) intakes.push({ medicationId: x.medicationId, scheduledAt: x.at, status: x.status });
  }
  const a = adherence(DEMO_MEDICATIONS, intakes, from, to, now, DEMO_TIMEZONE);
  return { ...a, from: formatLocalDate(from), to: formatLocalDate(to) };
}
