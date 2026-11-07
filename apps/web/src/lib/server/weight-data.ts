/** Poids du profil affiché : réel (RLS, journalisé) ou fictif (démonstration). */
import { addDays, formatLocalDate, type LocalDate } from '@bilanx/domain';
import type { WeightEntry } from '@bilanx/records';
import { weight } from './auth';
import type { AppContext } from './context';

/** Démonstration : une pesée tous les 3 jours, lente baisse avec de petites variations (données fictives). */
function demoWeights(from: LocalDate, to: LocalDate, today: LocalDate): WeightEntry[] {
  const out: WeightEntry[] = [];
  for (let i = 180; i >= 0; i -= 3) {
    const d = addDays(today, -i);
    const iso = formatLocalDate(d);
    if (iso < formatLocalDate(from) || iso > formatLocalDate(to)) continue;
    const kg = 81 - (180 - i) * 0.02 + Math.sin(i / 5) * 0.6;
    out.push({ day: iso, kg: Math.round(kg * 10) / 10 });
  }
  return out;
}

export async function weightRange(ctx: AppContext, from: LocalDate, to: LocalDate, today: LocalDate): Promise<WeightEntry[]> {
  if (ctx.active.kind === 'demo') return demoWeights(from, to, today);
  return weight().listWeights(ctx.user, ctx.active.access.profileId, formatLocalDate(from), formatLocalDate(to));
}

/** Valeur de référence pour une évolution : dernière pesée au plus tard `days` jours avant la plus récente. */
export function weightAround(entries: WeightEntry[], last: WeightEntry, days: number): WeightEntry | null {
  const limit = new Date(`${last.day}T12:00:00Z`).getTime() - days * 86_400_000;
  return [...entries].reverse().find((e) => new Date(`${e.day}T12:00:00Z`).getTime() <= limit) ?? null;
}
