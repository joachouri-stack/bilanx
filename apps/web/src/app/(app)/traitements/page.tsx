import type { Metadata } from 'next';
import Link from 'next/link';
import { addDays, formatNumberFr, INSULIN_TYPES, insulinPeriod } from '@bilanx/domain';
import { DEMO_TIMEZONE, demoToday } from '@/lib/demo-data';
import { appContext, moduleAllowed } from '@/lib/server/context';
import { insulin } from '@/lib/server/auth';
import { insulinDoses, insulinProducts, toDomainDoses } from '@/lib/server/insulin-data';
import { archiveProductAction, deleteChangeAction, deleteDoseAction } from '@/lib/server/actions';
import { Card, Chip, Meta, PageHeader } from '@/components/ui';
import { InsulinBars } from '@/components/insulin-bars';
import { ChangeForm, DoseForm, ProductForm } from '@/components/insulin-forms';
import { ModuleForbidden } from '@/components/module-forbidden';

export const metadata: Metadata = { title: 'Insuline & Traitements' };

const PERIODS = [7, 30, 90] as const;
const STATUS_FR = { taken: 'faite', planned: 'prévue', skipped: 'sautée' } as const;

function Delta({ cur, prev }: { cur: number | null; prev: number | null }) {
  if (cur === null || prev === null) return <Meta>Pas de comparaison possible (données insuffisantes).</Meta>;
  const d = cur - prev;
  return (
    <Meta>
      {d === 0 ? 'Identique' : `${d > 0 ? '+' : '−'}${formatNumberFr(Math.abs(d), 1)} U/jour`} par rapport à la période précédente (
      {formatNumberFr(prev, 1)} U/jour)
    </Meta>
  );
}

export default async function TreatmentsPage({ searchParams }: { searchParams: Promise<{ periode?: string }> }) {
  const ctx = await appContext();
  const name = ctx.active.kind === 'real' ? ctx.active.access.displayName : 'Claire';
  if (!moduleAllowed(ctx.active, 'insulin')) return <ModuleForbidden title="Insuline & Traitements" profileName={name} />;
  const sp = await searchParams;
  const days = (PERIODS as readonly number[]).includes(Number(sp.periode)) ? Number(sp.periode) : 7;
  const isDemo = ctx.active.kind === 'demo';
  const canWrite = !isDemo && moduleAllowed(ctx.active, 'insulin', 'write');
  const now = new Date();
  const today = demoToday(now);
  const from = addDays(today, -(days - 1));
  const prevFrom = addDays(from, -days);
  const prevTo = addDays(from, -1);

  const [products, rows, prevRows, changes] = await Promise.all([
    insulinProducts(ctx),
    insulinDoses(ctx, from, today, now),
    insulinDoses(ctx, prevFrom, prevTo, now),
    ctx.active.kind === 'real' ? insulin().listChanges(ctx.user, ctx.active.access.profileId) : Promise.resolve([]),
  ]);
  const period = insulinPeriod(toDomainDoses(rows), DEMO_TIMEZONE, from, today);
  const previous = insulinPeriod(toDomainDoses(prevRows), DEMO_TIMEZONE, prevFrom, prevTo);
  const todayRow = period.days.at(-1)!;
  const fmtDT = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const fmtD = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', dateStyle: 'long' });
  const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: DEMO_TIMEZONE }).format(now);
  const nowTime = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, hour: '2-digit', minute: '2-digit' }).format(now);
  const productName = (subject: string) => products.find((p) => `insulin:${p.id}` === subject)?.name ?? 'Insuline retirée de la liste';
  const s = period.summary;

  return (
    <div className="fade-in">
      <PageHeader
        title="Insuline & Traitements"
        subtitle={`Profil : ${name}${isDemo ? ' (démonstration, données fictives)' : ''}`}
        actions={
          <nav aria-label="Période" className="inline-flex rounded-xl bg-surface-2 p-1 text-sm">
            {PERIODS.map((p) => (
              <Link key={p} href={`/traitements?periode=${p}`} aria-current={p === days ? 'page' : undefined} className={`rounded-lg px-3 py-1.5 ${p === days ? 'bg-surface shadow-sm' : 'text-ink-3'}`}>
                {p} j
              </Link>
            ))}
          </nav>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card>
              <p className="text-xs text-ink-3">Aujourd’hui</p>
              <p className="tabular mt-1 text-3xl font-semibold">
                {formatNumberFr(todayRow.total)} <span className="text-sm font-medium text-ink-3">U</span>
              </p>
              <Meta>
                Rapide {formatNumberFr(todayRow.rapid)} · lente {formatNumberFr(todayRow.long)}
              </Meta>
            </Card>
            <Card>
              <p className="text-xs text-ink-3">Moyenne par jour noté</p>
              <p className="tabular mt-1 text-3xl font-semibold">
                {period.averagePerRecordedDay === null ? '—' : formatNumberFr(period.averagePerRecordedDay, 1)} <span className="text-sm font-medium text-ink-3">U</span>
              </p>
              <Delta cur={period.averagePerRecordedDay} prev={previous.averagePerRecordedDay} />
            </Card>
            <Card>
              <p className="text-xs text-ink-3">Total {days} jours</p>
              <p className="tabular mt-1 text-3xl font-semibold">
                {formatNumberFr(s.total)} <span className="text-sm font-medium text-ink-3">U</span>
              </p>
              <Meta>
                {period.daysWithData} jour{period.daysWithData > 1 ? 's' : ''} avec au moins une injection notée sur {days}
              </Meta>
            </Card>
            <Card>
              <p className="text-xs text-ink-3">Répartition</p>
              {s.total > 0 ? (
                <>
                  <div className="my-2 flex h-3 overflow-hidden rounded-full" role="img" aria-label={`Rapide ${Math.round(s.rapidSharePct ?? 0)} %, lente ${Math.round(100 - (s.rapidSharePct ?? 0))} %`}>
                    <div className="bg-violet" style={{ width: `${s.rapidSharePct ?? 0}%` }} />
                    <div className="bg-petrol" style={{ width: `${(s.byType.long / s.total) * 100}%` }} />
                    <div className="bg-ink-3" style={{ width: `${((s.total - s.byType.rapid - s.byType.long) / s.total) * 100}%` }} />
                  </div>
                  <Meta>
                    Rapide {Math.round(s.rapidSharePct ?? 0)} % · lente {Math.round((s.byType.long / s.total) * 100)} %
                  </Meta>
                </>
              ) : (
                <p className="mt-2 text-sm text-ink-3">Aucune injection notée.</p>
              )}
            </Card>
          </div>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Unités injectées par jour</h2>
              <div className="flex gap-3 text-xs text-ink-2">
                <span className="flex items-center gap-1.5">
                  <span className="size-3 rounded-sm bg-violet" /> Rapide
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-3 rounded-sm bg-petrol" /> Lente
                </span>
              </div>
            </div>
            <InsulinBars days={period.days} />
            <Meta>Injections notées comme faites uniquement. Un jour sans saisie reste vide : BILANX ne complète jamais les données manquantes.</Meta>
          </Card>

          <Card>
            <h2 className="font-semibold">Journal des injections</h2>
            {rows.length === 0 ? (
              <p className="mt-2 text-sm text-ink-3">Aucune injection notée sur cette période.</p>
            ) : (
              <ul className="mt-2 max-h-[420px] divide-y divide-line overflow-y-auto">
                {rows.slice(0, 200).map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="tabular font-semibold">{formatNumberFr(d.units)} U</span> · {d.productName}
                      <span className="block text-xs text-ink-3">
                        {fmtDT.format(d.at)}
                        {d.comment ? ` · ${d.comment}` : ''}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Chip tone={d.status === 'taken' ? 'sage' : d.status === 'planned' ? 'petrol' : 'neutral'}>{STATUS_FR[d.status]}</Chip>
                      {canWrite && (
                        <details className="relative">
                          <summary className="cursor-pointer list-none rounded-lg px-2 py-1 text-xs text-ink-3 hover:bg-surface-2">Supprimer</summary>
                          <form action={deleteDoseAction} className="absolute right-0 z-10 mt-1">
                            <input type="hidden" name="doseId" value={d.id} />
                            <input type="hidden" name="periode" value={days} />
                            <button type="submit" className="whitespace-nowrap rounded-lg bg-red-2 px-2.5 py-1.5 text-xs font-medium text-red shadow">
                              Confirmer
                            </button>
                          </form>
                        </details>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="font-semibold">Évolution du traitement prescrit</h2>
            <p className="mt-1 text-sm text-ink-3">
              Notez ici les changements décidés par votre médecin. BILANX ne propose jamais de modifier une dose : tout ajustement,
              réduction ou arrêt se décide avec l’équipe soignante.
            </p>
            {isDemo ? (
              <p className="mt-3 text-sm text-ink-3">Non disponible pour le profil de démonstration.</p>
            ) : changes.length === 0 ? (
              <p className="mt-3 text-sm text-ink-3">Aucune modification enregistrée.</p>
            ) : (
              <ol className="mt-3 flex flex-col gap-3 border-l-2 border-line pl-4">
                {changes.map((c) => (
                  <li key={c.id} className="relative">
                    <span className="absolute -left-[23px] top-1.5 size-3 rounded-full bg-petrol" aria-hidden />
                    <p className="text-sm font-semibold">
                      {fmtD.format(new Date(`${c.effectiveDate}T12:00:00Z`))} · {productName(c.subject)}
                    </p>
                    <p className="text-sm">
                      {c.previousRegimen ? (
                        <>
                          <span className="text-ink-3 line-through">{c.previousRegimen}</span> →{' '}
                        </>
                      ) : null}
                      <strong>{c.newRegimen}</strong>
                    </p>
                    <Meta>
                      {c.prescribedBy ? `Prescrit par ${c.prescribedBy}` : 'Prescripteur non précisé'}
                      {c.goalNote ? ` · Objectif : ${c.goalNote}` : ''}
                    </Meta>
                    {canWrite && (
                      <form action={deleteChangeAction}>
                        <input type="hidden" name="changeId" value={c.id} />
                        <button type="submit" className="mt-1 text-xs text-ink-3 underline">
                          Supprimer cette entrée
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {canWrite && products.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-petrol">＋ Noter une modification prescrite</summary>
                <div className="mt-3">
                  <ChangeForm products={products.map((p) => ({ id: p.id, name: p.name, type: p.type }))} today={todayIso} />
                </div>
              </details>
            )}
          </Card>

          <Card>
            <h2 className="font-semibold">Mes insulines</h2>
            {products.length === 0 ? (
              <p className="mt-2 text-sm text-ink-3">Ajoutez d’abord les insulines prescrites pour pouvoir noter vos injections.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {products.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span>
                      <span className="font-medium">{p.name}</span> <span className="text-ink-3">· {INSULIN_TYPES[p.type]}</span>
                    </span>
                    {canWrite && (
                      <form action={archiveProductAction}>
                        <input type="hidden" name="productId" value={p.id} />
                        <button type="submit" className="text-xs text-ink-3 underline">
                          Retirer de la liste
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canWrite && (
              <div className="mt-4">
                <ProductForm />
              </div>
            )}
            <Meta className="mt-3">Médicaments (autres traitements, rappels) : prochainement.</Meta>
          </Card>
        </div>

        <div>
          <Card className="xl:sticky xl:top-6">
            <h2 className="mb-3 font-semibold" id="injection">
              💉 Noter une injection
            </h2>
            {isDemo ? (
              <p className="text-sm text-ink-3">Le profil de démonstration est en lecture seule. Choisissez votre profil pour noter vos injections.</p>
            ) : !canWrite ? (
              <p className="text-sm text-ink-3">Vous pouvez consulter ce journal, mais pas y ajouter d’injection.</p>
            ) : products.length === 0 ? (
              <p className="text-sm text-ink-3">Ajoutez d’abord une insuline dans « Mes insulines ».</p>
            ) : (
              <DoseForm products={products.map((p) => ({ id: p.id, name: p.name, type: p.type }))} today={todayIso} nowTime={nowTime} />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
