import type { Metadata } from 'next';
import Link from 'next/link';
import { ANALYTES, formatNumberFr, getAnalyte } from '@bilanx/domain';
import { DEMO_TIMEZONE } from '@/lib/demo-data';
import { appContext, moduleAllowed } from '@/lib/server/context';
import { labResults, type LabRow } from '@/lib/server/data';
import { ModuleForbidden } from '@/components/module-forbidden';
import { ReferenceBar, ReferenceChip } from '@/components/analyses-gauge';
import { Icon } from '@/components/icon';
import { ButtonLink, Card, EmptyState, Meta, PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Analyses' };

export default async function AnalysesPage() {
  const ctx = await appContext();
  if (!moduleAllowed(ctx.active, 'lab')) return <ModuleForbidden title="Analyses" profileName={ctx.active.kind === 'real' ? ctx.active.access.displayName : ''} />;
  const results = await labResults(ctx);
  const latest = new Map<string, LabRow>();
  for (const r of results) {
    const cur = latest.get(r.analyteCode);
    if (!cur || r.sampledAt > cur.sampledAt) latest.set(r.analyteCode, r);
  }
  const order = new Map(ANALYTES.map((a, i) => [a.code, i]));
  const rows = [...latest.values()].sort((a, b) => (order.get(a.analyteCode) ?? 999) - (order.get(b.analyteCode) ?? 999));
  const fmt = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, dateStyle: 'medium' });
  const canWrite = ctx.active.kind === 'real' && moduleAllowed(ctx.active, 'lab', 'write');

  return (
    <div className="fade-in">
      <PageHeader
        title="Analyses"
        subtitle="Vos derniers résultats de prise de sang."
        actions={
          canWrite ? (
            <ButtonLink href="/analyses/ajouter" variant="primary" className="w-full sm:w-auto">
              <Icon name="plus" className="size-5" />
              Ajouter un résultat
            </ButtonLink>
          ) : undefined
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          title="Aucun résultat d’analyse pour ce profil."
          description="Ajoutez un bilan sanguin dans Documents : ses analyses sont lues, puis vous les validez une par une. Vous pouvez aussi saisir un résultat à la main."
          action={canWrite ? <ButtonLink href="/documents?cat=analyses#ajouter">Ajouter un bilan sanguin</ButtonLink> : undefined}
        />
      ) : (
        <>
          <Card className="!p-2 sm:!p-3">
            <h2 className="sr-only">Dernier résultat de chaque analyse</h2>
            <ul className="grid grid-cols-1 divide-y divide-line sm:grid-cols-2 sm:gap-x-3 sm:divide-y-0 xl:grid-cols-3">
              {rows.map((r) => {
                const a = getAnalyte(r.analyteCode)!;
                return (
                  <li key={r.analyteCode} className="min-w-0">
                    <Link
                      href={`/analyses/${r.analyteCode}`}
                      className="flex flex-col gap-2 rounded-xl p-3 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-petrol"
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 font-semibold">{a.nameFr}</span>
                        <span className="shrink-0 whitespace-nowrap">
                          <strong className="tabular text-xl">
                            {r.comparator ? `${r.comparator} ` : ''}
                            {formatNumberFr(r.value)}
                          </strong>{' '}
                          <span className="text-sm text-ink-3">{r.unit}</span>
                        </span>
                      </span>
                      <ReferenceBar value={r.value} refLow={r.refLow} refHigh={r.refHigh} label={a.nameFr} />
                      <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <ReferenceChip value={r.value} refLow={r.refLow} refHigh={r.refHigh} />
                        <span className="text-[13px] text-ink-3">{fmt.format(r.sampledAt)}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
          <Meta className="mt-3">
            La bande verte montre les valeurs de référence de votre laboratoire. Le repère montre votre résultat. Parlez-en avec votre médecin.
          </Meta>
        </>
      )}
    </div>
  );
}
