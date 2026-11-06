import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatNumberFr, getAnalyte, hba1cPercentToMmolMol, latestEvolution, sortHistory, toCanonical, type Analyte } from '@bilanx/domain';
import { DEMO_TIMEZONE } from '@/lib/demo-data';
import { appContext, moduleAllowed } from '@/lib/server/context';
import { labResults, type LabRow } from '@/lib/server/data';
import { ModuleForbidden } from '@/components/module-forbidden';
import { CapsuleGauge } from '@/components/capsule-gauge';
import { Button, ButtonLink, Card, CardHeader, Chip, EmptyState, Meta, PageHeader, buttonClass } from '@/components/ui';
import { Icon } from '@/components/icon';
import { AnalysesChart } from '@/components/analyses-chart';
import { ReferenceChip } from '@/components/analyses-gauge';
import { deleteLabResultAction } from '@/lib/server/actions';

// Titre générique : les métadonnées sont calculées avant le contrôle de session.
export const metadata: Metadata = { title: 'Analyse' };

export default async function AnalytePage({
  params,
  searchParams,
}: {
  params: Promise<{ analyte: string }>;
  searchParams: Promise<{ ajout?: string; suppression?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await appContext();
  if (!moduleAllowed(ctx.active, 'lab')) return <ModuleForbidden title="Analyses" profileName={ctx.active.kind === 'real' ? ctx.active.access.displayName : ''} />;
  const { analyte: code } = await params;
  const analyte = getAnalyte(code);
  const results = analyte ? sortHistory(await labResults(ctx, code)) : [];
  if (!analyte) notFound();
  const canWrite = ctx.active.kind === 'real' && moduleAllowed(ctx.active, 'lab', 'write');
  const addButton = canWrite ? (
    <ButtonLink href={`/analyses/ajouter?analyse=${code}`} variant="primary" className="w-full sm:w-auto">
      <Icon name="plus" className="size-5" />
      Ajouter un résultat
    </ButtonLink>
  ) : null;
  const back = (
    <Link href="/analyses" className={buttonClass({ variant: 'ghost', className: '-ml-3' })}>
      <Icon name="chevronLeft" className="size-5" />
      Toutes les analyses
    </Link>
  );
  const banner = sp.ajout ? 'Résultat enregistré.' : sp.suppression ? 'Résultat supprimé.' : null;
  const isHbA1c = code === 'hba1c';
  const subtitle = isHbA1c ? 'Prise de sang au laboratoire' : 'Résultats de laboratoire';
  if (results.length === 0) {
    return (
      <div className="fade-in">
        <PageHeader title={analyte.nameFr} subtitle={subtitle} actions={back} />
        {banner && (
          <p role="status" className="mb-4 rounded-xl bg-sage-2 px-4 py-3 text-sm">
            {banner}
          </p>
        )}
        <EmptyState title="Aucun résultat enregistré pour cette analyse." action={addButton} />
      </div>
    );
  }
  const ev = latestEvolution(results)!;
  const latest = ev.latest;
  const fmt = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, dateStyle: 'medium' });
  const fmtShort = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, day: 'numeric', month: 'short' });
  const hasRef = latest.refLow != null || latest.refHigh != null;
  const series = chartSeries(results, analyte);
  const ref = (low: number | null, high: number | null) =>
    low != null && high != null ? `${formatNumberFr(low)} – ${formatNumberFr(high)}` : high != null ? `< ${formatNumberFr(high)}` : low != null ? `> ${formatNumberFr(low)}` : 'non notées';
  const sourceLabel = (s: LabRow['source']) => (s === 'demo' ? 'Bilan sanguin (démo)' : s === 'document' ? 'Bilan sanguin' : 'Saisie manuelle');

  return (
    <div className="fade-in">
      <PageHeader
        title={analyte.nameFr}
        subtitle={subtitle}
        actions={
          <>
            {back}
            {addButton}
          </>
        }
      />
      {banner && (
        <p role="status" className="mb-4 rounded-xl bg-sage-2 px-4 py-3 text-sm">
          {banner}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card accent="petrol">
          <CardHeader title="Dernier résultat" icon="flask" iconTone="petrol" tag="Laboratoire" tagTone="petrol" />
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="flex items-baseline gap-1.5">
                <strong className="tabular text-5xl font-semibold tracking-tight">
                  {latest.comparator ? `${latest.comparator} ` : ''}
                  {formatNumberFr(latest.value)}
                </strong>
                <span className="text-lg text-ink-3">{latest.unit}</span>
              </p>
              {isHbA1c && <p className="mt-1 text-ink-2">soit {Math.round(hba1cPercentToMmolMol(latest.value))} mmol/mol</p>}
            </div>
            {hasRef && <CapsuleGauge value={latest.value} refLow={latest.refLow ?? null} refHigh={latest.refHigh ?? null} label={analyte.nameFr} />}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {ev.previous && ev.delta !== null && (
              <Chip tone="neutral">
                {ev.delta > 0 ? '↑ +' : ev.delta < 0 ? '↓ −' : '= '}
                {formatNumberFr(Math.abs(ev.delta))}{' '}
                {/* Écart d'un pourcentage (HbA1c) : en points, pour ne pas suggérer une variation relative. */}
                {(ev.converted ? analyte.canonicalUnit : latest.unit) === '%'
                  ? Math.abs(ev.delta) >= 2 ? 'points' : 'point'
                  : ev.converted ? analyte.canonicalUnit : latest.unit}{' '}
                depuis le {fmtShort.format(ev.previous.sampledAt)}
              </Chip>
            )}
            {hasRef && <ReferenceChip value={latest.value} refLow={latest.refLow} refHigh={latest.refHigh} />}
          </div>
          <Meta className="mt-3">
            {fmt.format(latest.sampledAt)}
            {latest.laboratory ? ` · ${latest.laboratory}` : ''}
            {hasRef ? ` · référence ${ref(latest.refLow, latest.refHigh)} ${latest.unit}` : ''}
          </Meta>
        </Card>
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader title="Évolution" icon="chart" iconTone="petrol" />
            {series.converted && <p className="mb-2 text-sm text-ink-2">Résultats rendus dans des unités différentes : tous affichés ici en {series.unit}.</p>}
            <AnalysesChart
              points={series.rows.map((r) => ({ t: r.sampledAt.getTime(), v: r.value, label: formatNumberFr(r.value) }))}
              refLow={series.rows.at(-1)!.refLow ?? null}
              refHigh={series.rows.at(-1)!.refHigh ?? null}
              unit={series.unit}
            />
          </Card>
          <Card>
            <CardHeader title="Tous les résultats" icon="journal" iconTone="neutral" />
            <ul className="divide-y divide-line">
              {[...results].reverse().map((r) => (
                <li
                  key={r.id ?? r.sampledAt.toISOString()}
                  data-resultat
                  className="relative flex items-center gap-3 py-2.5 has-[details[open]]:pb-[4.75rem]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block">{fmt.format(r.sampledAt)}</span>
                    {/* Provenance toujours indiquée (saisie ou bilan), en petit. */}
                    <span className="block truncate text-[13px] text-ink-3">
                      <span>{sourceLabel(r.source)}</span>
                      {[r.refLow != null || r.refHigh != null ? `réf. ${ref(r.refLow, r.refHigh)}` : null, r.note].filter(Boolean).map((t) => ` · ${t}`)}
                    </span>
                  </span>
                  <span className="tabular text-right">
                    <strong className="text-lg">
                      {r.comparator ? `${r.comparator} ` : ''}
                      {formatNumberFr(r.value)}
                    </strong>{' '}
                    <span className="text-ink-3">{r.unit}</span>
                    {isHbA1c && <span className="block text-[13px] text-ink-3">{Math.round(hba1cPercentToMmolMol(r.value))} mmol/mol</span>}
                  </span>
                  {canWrite && r.id && (
                    // Seule la petite croix ouvre la confirmation ; le panneau s'affiche sous la ligne.
                    <details className="shrink-0">
                      <summary className="grid size-11 cursor-pointer list-none place-items-center rounded-lg text-ink-3 hover:bg-red-2 hover:text-red [&::-webkit-details-marker]:hidden" title="Supprimer">
                        <Icon name="close" className="size-5" />
                        <span className="sr-only">Supprimer le résultat du {fmt.format(r.sampledAt)}</span>
                      </summary>
                      <form action={deleteLabResultAction} className="absolute inset-x-0 bottom-2 flex items-center justify-between gap-2 rounded-xl border border-red bg-red-2 p-2.5 pl-3">
                        <input type="hidden" name="resultId" value={r.id} />
                        <input type="hidden" name="analyteCode" value={code} />
                        <span className="text-sm text-ink">Effacer ce résultat ?</span>
                        <Button type="submit" variant="danger">
                          Confirmer la suppression
                        </Button>
                      </form>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

/**
 * Si les résultats ont été rendus dans des unités différentes, ils sont tous convertis
 * dans l'unité canonique (valeurs et références) pour rester comparables ; sinon, valeurs telles quelles.
 */
function chartSeries(results: LabRow[], analyte: Analyte): { rows: LabRow[]; unit: string; converted: boolean } {
  const units = new Set(results.map((r) => r.unit));
  if (units.size <= 1) return { rows: results, unit: results[0]?.unit ?? analyte.canonicalUnit, converted: false };
  const conv = (v: number | null, u: string) => (v === null ? null : toCanonical(analyte, v, u));
  const rows = results
    .map((r) => ({ ...r, value: conv(r.value, r.unit) as number, refLow: conv(r.refLow, r.unit), refHigh: conv(r.refHigh, r.unit), unit: analyte.canonicalUnit }))
    .filter((r) => r.value !== null);
  return { rows, unit: analyte.canonicalUnit, converted: true };
}
