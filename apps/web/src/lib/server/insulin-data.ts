/**
 * Données d'insuline du profil affiché : réelles (RLS, journalisées) ou de démonstration (fictives).
 */
import { dayBounds, type InsulinDose, type LocalDate } from '@bilanx/domain';
import type { DoseRow, InsulinProduct } from '@bilanx/records';
import { DEMO_TIMEZONE, demoInsulinRange } from '@/lib/demo-data';
import { insulin } from './auth';
import type { AppContext } from './context';

const DEMO_PRODUCTS: InsulinProduct[] = [
  { id: 'demo-rapid', name: 'Insuline rapide (démo)', type: 'rapid', active: true },
  { id: 'demo-long', name: 'Insuline lente (démo)', type: 'long', active: true },
];

export async function insulinProducts(ctx: AppContext): Promise<InsulinProduct[]> {
  if (ctx.active.kind === 'demo') return DEMO_PRODUCTS;
  return insulin().listProducts(ctx.user, ctx.active.access.profileId);
}

export async function insulinDoses(ctx: AppContext, from: LocalDate, to: LocalDate, now: Date): Promise<DoseRow[]> {
  if (ctx.active.kind === 'demo') {
    return demoInsulinRange(from, to, now)
      .map((d, i) => {
        const p = d.type === 'long' ? DEMO_PRODUCTS[1]! : DEMO_PRODUCTS[0]!;
        return { id: `demo-${i}`, productId: p.id, productName: p.name, type: d.type, units: d.units, at: d.at, status: d.status, comment: null };
      })
      .sort((a, b) => b.at.getTime() - a.at.getTime());
  }
  return insulin().listDoses(ctx.user, ctx.active.access.profileId, dayBounds(from, DEMO_TIMEZONE).start, dayBounds(to, DEMO_TIMEZONE).end);
}

export const toDomainDoses = (rows: DoseRow[]): InsulinDose[] => rows.map((r) => ({ at: r.at, units: r.units, type: r.type, status: r.status }));
