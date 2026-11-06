import type { Metadata } from 'next';
import Link from 'next/link';
import { addDays, formatNumberFr, INSULIN_TYPES, insulinPeriod } from '@bilanx/domain';
import { DEMO_TIMEZONE, demoToday } from '@/lib/demo-data';
import { appContext, moduleAllowed } from '@/lib/server/context';
import { insulin } from '@/lib/server/auth';
import { insulinDoses, insulinProducts, toDomainDoses } from '@/lib/server/insulin-data';
import { archiveProductAction, deleteChangeAction, deleteDoseAction } from '@/lib/server/actions';
import { Card, CardHeader, Chip, EmptyState, Meta, PageHeader, Segmented, Stat } from '@/components/ui';
import { Icon } from '@/components/icon';
import { InsulinBars } from '@/components/insulin-bars';
import { ChangeForm, DoseForm, ProductForm } from '@/components/insulin-forms';
import { ConfirmDelete } from '@/components/autres-confirmer';
import { ModuleForbidden } from '@/components/module-forbidden';

export const metadata: Metadata = { title: 'Insuline' };

const PERIODS = [7, 30, 90] as const;
const STATUS_FR = { taken: 'faite', planned: 'prévue', skipped: 'sautée' } as const;
const JOURNAL_SHORT = 5;
const NO_DOSE = 'BILANX ne propose aucune dose : c’est votre médecin qui décide.';

function Delta({ cur, prev }: { cur: number | null; prev: number | null }) {
  if (cur === null || prev === null) return <>Pas de comparaison possible.</>;
  const d = cur - prev;
  return <>{d === 0 ? 'Identique à la période précédente' : `${d > 0 ? '+' : '−'}${formatNumberFr(Math.abs(d), 1)} U/jour par rapport à la période précédente (${formatNumberFr(prev, 1)})`}</>;
}

const summaryCls = 'flex min-h-11 cursor-pointer list-none items-center gap-2 font-medium text-petrol [&::-webkit-details-marker]:hidden';

export default async function TreatmentsPage({ searchParams }: { searchParams: Promise<{ periode?: string; journal?: string; ajout?: string }> }) {
  const ctx = await appContext();
  const name = ctx.active.kind === 'real' ? ctx.active.access.displayName : 'Claire';
  if (!moduleAllowed(ctx.active, 'insulin')) return <ModuleForbidden title="Insuline" profileName={name} />;
  const sp = await searchParams;
  const days = (PERIODS as readonly number[]).includes(Number(sp.periode)) ? Number(sp.periode) : 7;
  const showAll = sp.journal === 'tout';
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
  const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: DEMO_TIMEZONE }).format(now);
  const productOptions = products.map((p) => ({ id: p.id, name: p.name, type: p.type }));

  // Aucune insuline enregistrée : une seule carte, pour commencer.
  if (products.length === 0) {
    return (
      <div className="fade-in">
        <PageHeader title="Insuline" />
        <Card className="max-w-2xl" id="injection">
          <CardHeader title="Ajouter mon insuline" />
          <p className="mb-4 text-sm text-ink-2">
            Indiquez l’insuline prescrite (nom écrit sur le stylo ou l’ordonnance). Vous pourrez ensuite noter vos injections. {NO_DOSE}
          </p>
          {canWrite ? (
            <ProductForm first />
          ) : (
            <EmptyState title="Aucune insuline enregistrée pour ce profil." description="Vous pouvez consulter cette page, mais pas y ajouter d’insuline." />
          )}
          <Meta className="mt-4">
            Comprimés et rappels de prise :{' '}
            <Link href="/medicaments" className="text-petrol underline">
              Médicaments
            </Link>
            .
          </Meta>
        </Card>
      </div>
    );
  }

  const period = insulinPeriod(toDomainDoses(rows), DEMO_TIMEZONE, from, today);
  const previous = insulinPeriod(toDomainDoses(prevRows), DEMO_TIMEZONE, prevFrom, prevTo);
  const todayRow = period.days.at(-1)!;
  const fmtDT = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const fmtD = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', dateStyle: 'long' });
  const nowTime = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, hour: '2-digit', minute: '2-digit' }).format(now);
  const productName = (subject: string) => products.find((p) => `insulin:${p.id}` === subject)?.name ?? 'Insuline retirée de la liste';
  const s = period.summary;
  const journal = showAll ? rows.slice(0, 200) : rows.slice(0, JOURNAL_SHORT);
  const hh = (d: Date) => fmtDT.format(d).replace(/(\d{2}):(\d{2})/, '$1 h $2');

  return (
    <div className="fade-in">
      <PageHeader title="Insuline" />
      {sp.ajout === 'insuline' && (
        <p role="status" className="mb-4 rounded-xl bg-sage-2 px-4 py-3 text-sm">
          Insuline ajoutée. Vous pouvez maintenant noter vos injections.
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 xl:col-start-2 xl:row-start-1">
          <Card className="scroll-mt-20 xl:sticky xl:top-6" id="injection">
            <CardHeader title="Noter une injection" />
            {isDemo ? (
              <p className="text-sm text-ink-2">Le profil de démonstration est en lecture seule. Choisissez votre profil pour noter vos injections.</p>
            ) : !canWrite ? (
              <p className="text-sm text-ink-2">Vous pouvez consulter ce journal, mais pas y ajouter d’injection.</p>
            ) : (
              <DoseForm products={productOptions} today={todayIso} nowTime={nowTime} />
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4 xl:col-start-1 xl:row-start-1">
          <Segmented label="Période" items={PERIODS.map((p) => ({ href: `/traitements?periode=${p}`, label: `${p} jours`, current: p === days }))} />

          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Card>
              <Stat size="md" label="Aujourd’hui" value={formatNumberFr(todayRow.total)} unit="U" hint={`Rapide ${formatNumberFr(todayRow.rapid)} · lente ${formatNumberFr(todayRow.long)}`} />
            </Card>
            <Card>
              <Stat size="md" label={`Total ${days} jours`} value={formatNumberFr(s.total)} unit="U" hint={`${period.daysWithData} jour${period.daysWithData > 1 ? 's' : ''} noté${period.daysWithData > 1 ? 's' : ''} sur ${days}`} />
            </Card>
            <Card className="col-span-2 sm:col-span-1">
              <Stat
                size="md"
                label="Moyenne par jour noté"
                value={period.averagePerRecordedDay === null ? '—' : formatNumberFr(period.averagePerRecordedDay, 1)}
                unit="U"
                hint={<Delta cur={period.averagePerRecordedDay} prev={previous.averagePerRecordedDay} />}
              />
            </Card>
            {s.total > 0 && (
              <Card className="col-span-2 sm:col-span-1">
                <p className="text-sm text-ink-3">Répartition</p>
                <div className="my-2 flex h-3 overflow-hidden rounded-full" role="img" aria-label={`Rapide ${Math.round(s.rapidSharePct ?? 0)} %, lente ${Math.round((s.byType.long / s.total) * 100)} %`}>
                  <div className="bg-violet" style={{ width: `${s.rapidSharePct ?? 0}%` }} />
                  <div className="bg-petrol" style={{ width: `${(s.byType.long / s.total) * 100}%` }} />
                  <div className="bg-ink-3" style={{ width: `${((s.total - s.byType.rapid - s.byType.long) / s.total) * 100}%` }} />
                </div>
                <Meta>
                  Rapide {Math.round(s.rapidSharePct ?? 0)} % · lente {Math.round((s.byType.long / s.total) * 100)} %
                </Meta>
              </Card>
            )}
          </div>

          <Card>
            <CardHeader title="Unités injectées par jour" />
            <InsulinBars days={period.days} />
            <Meta className="mt-2">Seules les injections faites sont comptées. Un jour sans saisie reste vide.</Meta>
          </Card>

          <Card>
            <CardHeader
              title="Journal des injections"
              action={
                rows.length > JOURNAL_SHORT ? (
                  <Link href={showAll ? `/traitements?periode=${days}` : `/traitements?periode=${days}&journal=tout#journal`} className="inline-flex min-h-11 items-center font-medium text-petrol">
                    {showAll ? 'Voir moins' : `Voir tout (${rows.length})`}
                  </Link>
                ) : undefined
              }
            />
            {rows.length === 0 ? (
              <EmptyState title="Aucune injection notée sur cette période." />
            ) : (
              <ul className="divide-y divide-line" id="journal">
                {journal.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="tabular font-semibold">{formatNumberFr(d.units)} U</span> · {d.productName}
                      <Meta>
                        {hh(d.at)}
                        {d.comment ? ` · ${d.comment}` : ''}
                      </Meta>
                    </span>
                    <span className="flex shrink-0 items-start gap-1">
                      <span className="pt-2.5">
                        <Chip tone={d.status === 'taken' ? 'sage' : d.status === 'planned' ? 'petrol' : 'neutral'}>{STATUS_FR[d.status]}</Chip>
                      </span>
                      {canWrite && (
                        <ConfirmDelete
                          action={deleteDoseAction}
                          fields={{ doseId: d.id, periode: days }}
                          summaryAriaLabel={`Supprimer l’injection de ${formatNumberFr(d.units)} U`}
                          className="text-right"
                        />
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {rows.length > JOURNAL_SHORT && !showAll && (
              <Meta className="mt-2">
                {JOURNAL_SHORT} dernières injections sur {rows.length}.
              </Meta>
            )}
          </Card>

          <Card>
            <CardHeader title="Changements de dose décidés par le médecin" />
            <p className="text-sm text-ink-2">Notez ici les changements décidés avec votre équipe soignante. {NO_DOSE}</p>
            {isDemo ? (
              <p className="mt-3 text-sm text-ink-3">Non disponible pour le profil de démonstration.</p>
            ) : changes.length === 0 ? (
              <p className="mt-3 text-sm text-ink-3">Aucun changement noté.</p>
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
                    {canWrite && <ConfirmDelete action={deleteChangeAction} fields={{ changeId: c.id }} summaryAriaLabel="Supprimer ce changement" />}
                  </li>
                ))}
              </ol>
            )}
            {canWrite && (
              <details className="group mt-4">
                <summary className={summaryCls}>
                  <Icon name="plus" className="size-5" />
                  Noter un changement de dose
                </summary>
                <div className="mt-3">
                  <ChangeForm products={productOptions} today={todayIso} />
                </div>
              </details>
            )}
          </Card>

          <Card>
            <CardHeader title="Mes insulines" />
            <ul className="divide-y divide-line">
              {products.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-3 py-1.5 text-sm">
                  <span className="min-w-0 py-2">
                    <span className="font-medium">{p.name}</span> <span className="text-ink-3">· {INSULIN_TYPES[p.type]}</span>
                  </span>
                  {canWrite && (
                    <ConfirmDelete
                      action={archiveProductAction}
                      fields={{ productId: p.id }}
                      label="Retirer"
                      confirmLabel="Retirer de la liste"
                      summaryAriaLabel={`Retirer ${p.name} de la liste`}
                      question="Les injections déjà notées sont conservées."
                    />
                  )}
                </li>
              ))}
            </ul>
            {canWrite && (
              <details className="group mt-3">
                <summary className={summaryCls}>
                  <Icon name="plus" className="size-5" />
                  Ajouter une autre insuline
                </summary>
                <div className="mt-3">
                  <ProductForm />
                </div>
              </details>
            )}
            <Meta className="mt-3">
              Comprimés et rappels de prise :{' '}
              <Link href="/medicaments" className="text-petrol underline">
                Médicaments
              </Link>
              .
            </Meta>
          </Card>
        </div>
      </div>
    </div>
  );
}
