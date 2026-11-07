import type { Metadata } from 'next';
import { addDays, formatLocalDate } from '@bilanx/domain';
import { demoToday } from '@/lib/demo-data';
import { appContext, moduleAllowed } from '@/lib/server/context';
import { weightAround, weightRange } from '@/lib/server/weight-data';
import { removeWeightAction } from '@/lib/server/actions';
import { Card, Meta, PageHeader, Segmented } from '@/components/ui';
import { AnalysesChart } from '@/components/analyses-chart';
import { ConfirmDelete } from '@/components/autres-confirmer';
import { Disclosure } from '@/components/disclosure';
import { Icon } from '@/components/icon';
import { WeightForm } from '@/components/weight-form';
import { ModuleForbidden } from '@/components/module-forbidden';

export const metadata: Metadata = { title: 'Poids' };
export const dynamic = 'force-dynamic';

const PERIODS = [
  [30, '1 mois'],
  [90, '3 mois'],
  [365, '1 an'],
  [3660, 'Tout'],
] as const;
const kg = (v: number) => v.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** Évolution en couleur neutre (ni « bien » ni « mal ») : « ↓ 2,0 kg ». */
const change = (d: number) => (d === 0 ? '= 0,0 kg' : `${d < 0 ? '↓' : '↑'} ${kg(Math.abs(d))} kg`);

/** Suivi du poids : carte résumé, courbe (1 mois → tout), historique avec écarts, saisie repliable. Droits de la rubrique Activité. */
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
  const all = await weightRange(ctx, addDays(today, -3660), today, today);
  const shown = all.filter((e) => e.day >= formatLocalDate(addDays(today, -days)));
  const last = all.at(-1) ?? null;
  const previous = all.at(-2) ?? null;
  const first = all[0] ?? null;
  const delta = (n: number) => (last ? ((w) => (w ? Math.round((last.kg - w.kg) * 10) / 10 : null))(weightAround(all, last, n)) : null);
  const t = (iso: string) => new Date(`${iso}T12:00:00Z`).getTime();
  const fmtDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const fmtShort = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const minE = all.reduce<(typeof all)[number] | null>((m, e) => (!m || e.kg < m.kg ? e : m), null);
  const maxE = all.reduce<(typeof all)[number] | null>((m, e) => (!m || e.kg > m.kg ? e : m), null);
  const pills = (
    [
      ['7 j', delta(7)],
      ['30 j', delta(30)],
      ['1 an', delta(365)],
    ] as const
  ).filter(([, d]) => d !== null) as [string, number][];
  const sinceStart = last && first && first.day !== last.day ? Math.round((last.kg - first.kg) * 10) / 10 : null;
  const panel = 'group scroll-mt-20 rounded-[var(--radius-card,18px)] border border-line bg-surface shadow-[var(--shadow-card)]';

  return (
    <div className="fade-in">
      <PageHeader title="Poids" subtitle={name} />
      <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          {/* Carte résumé : dernière pesée en grand, évolutions, repères. */}
          <section
            aria-label="Dernière pesée"
            className="relative overflow-hidden rounded-[var(--radius-card,18px)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6"
          >
            <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-[radial-gradient(closest-side,rgba(129,140,248,0.22),transparent)]" />
            <div className="relative flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-indigo-2 text-indigo" aria-hidden>
                <Icon name="scale" className="size-5" />
              </span>
              <p className="flex-1 font-semibold">Dernière pesée</p>
              {last && <p className="text-sm text-ink-3">{fmtShort.format(new Date(t(last.day)))}</p>}
            </div>
            {last ? (
              <>
                <p className="relative mt-4 flex items-baseline gap-1.5">
                  <strong className="tabular text-[56px] font-bold leading-none tracking-tight">{kg(last.kg)}</strong>
                  <span className="text-xl text-ink-3">kg</span>
                </p>
                {pills.length > 0 && (
                  <div className="relative mt-4 flex flex-wrap gap-2">
                    {pills.map(([l, d]) => (
                      <span key={l} className="tabular inline-flex items-center gap-1 rounded-full bg-indigo-2 px-3 py-1 text-sm font-semibold text-indigo">
                        {change(d)}
                        <span className="font-normal text-ink-2">sur {l}</span>
                      </span>
                    ))}
                  </div>
                )}
                <ul className="relative mt-4 divide-y divide-line">
                  {[
                    previous ? { dot: 'bg-indigo', label: 'Précédente', value: `${kg(previous.kg)} kg · ${fmtShort.format(new Date(t(previous.day)))}` } : null,
                    all.length > 1 && minE ? { dot: 'bg-go', label: 'Plus bas', value: `${kg(minE.kg)} kg` } : null,
                    all.length > 1 && maxE ? { dot: 'bg-amber', label: 'Plus haut', value: `${kg(maxE.kg)} kg` } : null,
                    sinceStart !== null && first ? { dot: 'bg-violet', label: `Depuis le ${fmtShort.format(new Date(t(first.day)))}`, value: change(sinceStart) } : null,
                    { dot: 'bg-petrol', label: 'Pesées', value: String(all.length) },
                  ]
                    .filter((r): r is { dot: string; label: string; value: string } => r !== null)
                    .map((r) => (
                      <li key={r.label} className="flex items-center gap-3 py-2.5">
                        <span className={`size-2.5 shrink-0 rounded-full ${r.dot}`} aria-hidden />
                        <span className="flex-1 text-[15px] text-ink-2">{r.label}</span>
                        <span className="tabular text-[15px] font-semibold">{r.value}</span>
                      </li>
                    ))}
                </ul>
              </>
            ) : (
              <p className="relative mt-4 text-ink-2">Aucune pesée pour l’instant.</p>
            )}
            {isDemo && <Meta className="relative mt-2">Démonstration : données fictives.</Meta>}
          </section>

          {canWrite && (
            <Disclosure
              id="ajouter-poids"
              className={panel}
              initialOpen={!last}
              summary={
                <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 [&::-webkit-details-marker]:hidden">
                  <span className="grid size-9 place-items-center rounded-full bg-sage-2 text-go" aria-hidden>
                    <Icon name="plus" className="size-5" />
                  </span>
                  <h2 className="flex-1 font-semibold">Ajouter une pesée</h2>
                  <Icon name="chevronDown" className="size-5 text-ink-3 transition-transform group-open:rotate-180" />
                </summary>
              }
            >
              <div className="border-t border-line px-4 pb-4 pt-4">
                <WeightForm today={todayIso} last={last?.kg ?? null} />
              </div>
            </Disclosure>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {all.length > 0 && (
            <Card>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-semibold">Évolution</h2>
                <div className="w-full sm:w-auto">
                  <Segmented label="Période" items={PERIODS.map(([d, l]) => ({ href: `/poids?periode=${d}`, label: l, current: d === days }))} />
                </div>
              </div>
              <AnalysesChart
                points={shown.map((e) => ({ t: t(e.day), v: e.kg, label: kg(e.kg) }))}
                refLow={null}
                refHigh={null}
                unit="kg"
                colors={['#a5b4fc', 'var(--indigo)']}
                labels={shown.length <= 8 ? 'all' : 'last'}
                emptyText="La courbe apparaît dès la deuxième pesée sur cette période."
              />
            </Card>
          )}

          {all.length > 0 && (
            <Card>
              <h2 className="mb-1 font-semibold">Historique</h2>
              {(() => {
                const rows = [...all].reverse();
                const row = (e: (typeof rows)[number], i: number) => {
                  const older = rows[i + 1];
                  const d = older ? Math.round((e.kg - older.kg) * 10) / 10 : null;
                  return (
                    <li key={e.day} className="flex items-center gap-x-3 py-3">
                      <span className="min-w-0 flex-1 truncate font-medium first-letter:uppercase">{fmtDay.format(new Date(t(e.day)))}</span>
                      {d !== null && d !== 0 && (
                        <span className="tabular shrink-0 rounded-full bg-indigo-2 px-2 py-0.5 text-[12px] font-semibold text-indigo">
                          {d < 0 ? '↓' : '↑'} {kg(Math.abs(d))}
                        </span>
                      )}
                      <strong className="tabular shrink-0 text-lg">
                        {kg(e.kg)} <span className="text-base font-normal text-ink-3">kg</span>
                      </strong>
                      {canWrite && (
                        <ConfirmDelete action={removeWeightAction} fields={{ day: e.day }} label="×" summaryAriaLabel={`Supprimer la pesée du ${fmtDay.format(new Date(t(e.day)))}`} />
                      )}
                    </li>
                  );
                };
                return (
                  <>
                    <ul className="divide-y divide-line">{rows.slice(0, 10).map((e, i) => row(e, i))}</ul>
                    {rows.length > 10 && (
                      <details className="group/h">
                        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium text-petrol [&::-webkit-details-marker]:hidden">
                          <Icon name="chevronDown" className="size-4 transition-transform group-open/h:rotate-180" />
                          Voir les {rows.length - 10} autres pesées
                        </summary>
                        <ul className="divide-y divide-line">{rows.slice(10).map((e, i) => row(e, i + 10))}</ul>
                      </details>
                    )}
                  </>
                );
              })()}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
