import type { Metadata } from 'next';
import { addDays, formatLocalDate } from '@bilanx/domain';
import { demoToday } from '@/lib/demo-data';
import { appContext, moduleAllowed } from '@/lib/server/context';
import { weightAround, weightRange } from '@/lib/server/weight-data';
import { removeWeightAction } from '@/lib/server/actions';
import { Card, CardHeader, EmptyState, Meta, PageHeader, Segmented } from '@/components/ui';
import { DashboardSparkline } from '@/components/dashboard-sparkline';
import { ConfirmDelete } from '@/components/autres-confirmer';
import { WeightForm } from '@/components/weight-form';
import { ModuleForbidden } from '@/components/module-forbidden';

export const metadata: Metadata = { title: 'Poids' };
export const dynamic = 'force-dynamic';

const PERIODS = [
  [30, '1 mois'],
  [90, '3 mois'],
  [365, '1 an'],
] as const;
const kg = (v: number) => v.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signed = (d: number | null) => (d === null ? '—' : d === 0 ? '= 0,0 kg' : `${d < 0 ? '↓' : '↑'} ${kg(Math.abs(d))} kg`);

/** Suivi du poids : saisie, courbe (1 mois, 3 mois, 1 an), évolution, liste des pesées. Droits de la rubrique Activité. */
export default async function WeightPage({ searchParams }: { searchParams: Promise<{ periode?: string }> }) {
  const ctx = await appContext();
  const name = ctx.active.kind === 'real' ? ctx.active.access.displayName : 'Claire';
  if (!moduleAllowed(ctx.active, 'activity')) return <ModuleForbidden title="Poids" profileName={name} />;
  const sp = await searchParams;
  const days = PERIODS.find(([d]) => String(d) === sp.periode)?.[0] ?? 90;
  const today = demoToday(new Date());
  const todayIso = formatLocalDate(today);
  const isDemo = ctx.active.kind === 'demo';
  const canWrite = !isDemo && moduleAllowed(ctx.active, 'activity', 'write');
  const all = await weightRange(ctx, addDays(today, -366), today, today);
  const shown = all.filter((e) => e.day >= formatLocalDate(addDays(today, -days)));
  const last = all.at(-1) ?? null;
  const delta = (n: number) => (last ? ((w) => (w ? Math.round((last.kg - w.kg) * 10) / 10 : null))(weightAround(all, last, n)) : null);
  const min = shown.length ? Math.min(...shown.map((e) => e.kg)) : 0;
  const max = shown.length ? Math.max(...shown.map((e) => e.kg)) : 0;
  const t = (iso: string) => new Date(`${iso}T12:00:00Z`).getTime();
  const fmtDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const monthTicks = Array.from({ length: 13 }, (_, i) => {
    const d = new Date(Date.UTC(today.year, today.month - 1 - i, 1, 12));
    return { t: d.getTime(), label: new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' }).format(d).replace('.', '') };
  }).filter((k) => k.t >= t(todayIso) - days * 86_400_000);

  return (
    <div className="fade-in">
      <PageHeader title="Poids" subtitle={name} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <Card accent="indigo">
            {last ? (
              <>
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-sm text-ink-2">Dernière pesée · {fmtDay.format(new Date(t(last.day)))}</p>
                    <p className="tabular mt-1 leading-none">
                      <span className="text-5xl font-bold text-indigo">{kg(last.kg)}</span> <span className="text-ink-3">kg</span>
                    </p>
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-center">
                    {(
                      [
                        ['7 jours', delta(7)],
                        ['30 jours', delta(30)],
                        ['1 an', delta(365)],
                      ] as const
                    ).map(([l, d]) => (
                      <div key={l} className="rounded-xl bg-surface-2 px-3 py-2">
                        <dt className="text-[12px] text-ink-2">{l}</dt>
                        <dd className="tabular font-bold">{signed(d)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div className="mt-4">
                  <Segmented label="Période" items={PERIODS.map(([d, l]) => ({ href: `/poids?periode=${d}`, label: l, current: d === days }))} />
                </div>
                {shown.length > 1 ? (
                  <>
                    <DashboardSparkline
                      points={shown.map((e) => ({ t: t(e.day), v: e.kg }))}
                      min={Math.floor(min - 1)}
                      max={Math.ceil(max + 1)}
                      height={150}
                      color="var(--indigo)"
                maxGapMs={Infinity}
                      dots={shown.length <= 20}
                      lastDot="var(--indigo)"
                      domain={[t(todayIso) - days * 86_400_000, t(todayIso)]}
                      ticks={monthTicks}
                      label={`Poids sur la période : de ${kg(min)} à ${kg(max)} kg`}
                    />
                    <Meta>
                      Sur la période : de {kg(min)} à {kg(max)} kg · {shown.length} pesées
                    </Meta>
                  </>
                ) : (
                  <Meta className="mt-3">Encore trop peu de pesées sur cette période pour tracer une courbe.</Meta>
                )}
              </>
            ) : (
              <EmptyState title="Aucune pesée pour l’instant." description={canWrite ? 'Notez votre poids ci-contre : la courbe apparaîtra dès la deuxième pesée.' : undefined} />
            )}
            {isDemo && <Meta className="mt-2">Démonstration : données fictives.</Meta>}
          </Card>

          {all.length > 0 && (
            <Card>
              <CardHeader title="Pesées" />
              <ul className="divide-y divide-line">
                {[...all].reverse().slice(0, 60).map((e) => (
                  <li key={e.day} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                    <span className="first-letter:uppercase">{fmtDay.format(new Date(t(e.day)))}</span>
                    <span className="flex items-center gap-2">
                      <strong className="tabular">{kg(e.kg)} kg</strong>
                      {canWrite && (
                        <ConfirmDelete
                          action={removeWeightAction}
                          fields={{ day: e.day }}
                          label="×"
                          summaryAriaLabel={`Supprimer la pesée du ${fmtDay.format(new Date(t(e.day)))}`}
                        />
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {canWrite && (
          <Card id="ajouter-poids" className="scroll-mt-20 lg:sticky lg:top-4">
            <CardHeader title="Ajouter une pesée" icon="scale" iconTone="indigo" />
            <WeightForm today={todayIso} last={last?.kg ?? null} />
          </Card>
        )}
      </div>
    </div>
  );
}
