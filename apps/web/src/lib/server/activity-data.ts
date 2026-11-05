/** Pas du profil affiché : réels (import Apple Santé, RLS, journalisés) ou fictifs (démonstration). */
import { addDays, compareLocalDates, dayBounds, formatLocalDate, type LocalDate } from '@bilanx/domain';
import type { ActivitySourceInfo } from '@bilanx/records';
import { DEMO_TIMEZONE, demoStepsHourly } from '@/lib/demo-data';
import { activity } from './auth';
import type { AppContext } from './context';

export async function stepsDaily(ctx: AppContext, from: LocalDate, to: LocalDate, now = new Date()): Promise<Map<string, number>> {
  if (ctx.active.kind === 'demo') {
    const out = new Map<string, number>();
    for (let d = from; compareLocalDates(d, to) <= 0; d = addDays(d, 1)) {
      const h = demoStepsHourly(d, now);
      if (h.size) out.set(formatLocalDate(d), [...h.values()].reduce((a, b) => a + b, 0));
    }
    return out;
  }
  return activity().daily(ctx.user, ctx.active.access.profileId, formatLocalDate(from), formatLocalDate(to));
}

export async function stepsHourly(ctx: AppContext, day: LocalDate, now = new Date()): Promise<Map<number, number>> {
  if (ctx.active.kind === 'demo') return demoStepsHourly(day, now);
  const { start, end } = dayBounds(day, DEMO_TIMEZONE);
  return activity().hourly(ctx.user, ctx.active.access.profileId, start, end);
}

export async function stepsGoal(ctx: AppContext): Promise<number> {
  return ctx.active.kind === 'demo' ? 8000 : activity().goal(ctx.user, ctx.active.access.profileId);
}

export async function stepsSource(ctx: AppContext): Promise<ActivitySourceInfo | null> {
  if (ctx.active.kind === 'demo') return { label: 'Démonstration (données fictives)', status: 'demo', lastImportAt: null, dataFrom: null, dataTo: null, sources: [] };
  return activity().source(ctx.user, ctx.active.access.profileId);
}
