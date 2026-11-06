/** Séances de salle de sport du profil affiché : réelles (RLS, journalisées) ou fictives (démonstration). */
import { addDays, formatLocalDate, type LocalDate } from '@bilanx/domain';
import { demoGymVisits } from '@/lib/demo-data';
import { gym } from './auth';
import type { AppContext } from './context';

export async function gymVisits(ctx: AppContext, from: LocalDate, to: LocalDate, now = new Date()): Promise<string[]> {
  if (ctx.active.kind === 'demo') return demoGymVisits(from, to, now);
  return gym().listVisits(ctx.user, ctx.active.access.profileId, formatLocalDate(from), formatLocalDate(to));
}

/** Toutes les séances utiles au calcul de la série (10 ans au plus, comme la saisie). */
export function gymHistory(ctx: AppContext, today: LocalDate, now = new Date()): Promise<string[]> {
  return gymVisits(ctx, addDays(today, -10 * 366), today, now);
}
