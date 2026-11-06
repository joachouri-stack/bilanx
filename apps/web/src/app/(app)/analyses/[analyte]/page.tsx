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
  const subtitle = isHbA1c ? 'Prise de sang, laboratoire. À ne pas confondre avec l’HbA1c estimée par le capteur.' : 'Résultats de laboratoire';
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
        <Card className="flex flex-col items-center gap-2 text-center">
          <Chip tone="petrol">Laboratoire</Chip>
          <CapsuleGauge value={latest.value} refLow={latest.refLow ?? null} refHigh={latest.refHigh ?? null} label={analyte.nameFr} />
          <p className="flex items-baseline gap-1.5">
            <strong className="tabular text-4xl font-semibold">
              {latest.comparator ? `${latest.comparator} ` : ''}
              {formatNumberFr(latest.value)}
            </strong>
            <span className="text-ink-3">{latest.unit}</span>
          </p>
          {isHbA1c && <p className="text-ink-2">soit {Math.round(hba1cPercentToMmolMol(latest.value))} mmol/mol</p>}
          <ReferenceChip value={latest.value} refLow={latest.refLow} refHigh={latest.refHigh} />
          <Meta>
            Prélèvement du {fmt.format(latest.sampledAt)}
            {latest.laboratory && (
              <>
                <br />
                {latest.laboratory}
              </>
            )}
            <br />
            Valeurs de référence : {ref(latest.refLow, latest.refHigh)}
          </Meta>
          {ev.previous && ev.delta !== null && (
            <p className="text-sm text-ink-2">
              {ev.delta > 0 ? '+' : ev.delta < 0 ? '−' : '±'}
              {formatNumberFr(Math.abs(ev.delta))}{' '}
              {/* Écart d'un pourcentage (HbA1c) : en points, pour ne pas suggérer une variation relative. */}
              {(ev.converted ? analyte.canonicalUnit : latest.unit) === '%'
                ? Math.abs(ev.delta) >= 2 ? 'points' : 'point'
                : ev.converted ? analyte.canonicalUnit : latest.unit}{' '}
              depuis le {fmt.format(ev.previous.sampledAt)} ({ev.daysBetween} jour{(ev.daysBetween ?? 0) > 1 ? 's' : ''})
            </p>
          )}
          <Meta className="mt-1">La bande verte montre les valeurs de référence de votre laboratoire. Le repère montre votre résultat. Parlez-en avec votre médecin.</Meta>
        </Card>
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader title="Évolution" />
            {series.converted && <p className="mb-2 text-sm text-ink-2">Résultats rendus dans des unités différentes : tous affichés ici en {series.unit}.</p>}
            <AnalysesChart
              points={series.rows.map((r) => ({ t: r.sampledAt.getTime(), v: r.value, label: formatNumberFr(r.value) }))}
              refLow={series.rows.at(-1)!.refLow ?? null}
              refHigh={series.rows.at(-1)!.refHigh ?? null}
              unit={series.unit}
            />
            {series.rows.length > 1 && <Meta className="mt-2">Points uniquement aux dates réelles de prélèvement. Aucune valeur inventée entre deux.</Meta>}
          </Card>
          <Card>
            <CardHeader title="Tous les résultats" />
            <ul className="divide-y divide-line">
              {[...results].reverse().map((r) => (
                <li
                  key={r.id ?? r.sampledAt.toISOString()}
                  data-resultat
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 py-3 sm:grid-cols-[9rem_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center"
                >
                  <span className="font-medium sm:font-normal">{fmt.format(r.sampledAt)}</span>
                  <span className="tabular text-right sm:text-left">
                    <strong>
                      {r.comparator ? `${r.comparator} ` : ''}
                      {formatNumberFr(r.value)}
                    </strong>{' '}
                    {r.unit}
                    {isHbA1c && <span className="block text-sm text-ink-3">({Math.round(hba1cPercentToMmolMol(r.value))} mmol/mol)</span>}
                  </span>
                  <span className="text-sm text-ink-2">
                    Valeurs de référence : {ref(r.refLow, r.refHigh)}
                    {r.note && <span className="block text-ink-3">{r.note}</span>}
                  </span>
                  <span className="flex flex-wrap items-center justify-end gap-2">
                    <Chip tone={r.source === 'manual' ? 'neutral' : 'petrol'}>{sourceLabel(r.source)}</Chip>
                  </span>
                  {canWrite && r.id && (
                    <details className="col-span-full">
                      <summary className={buttonClass({ variant: 'ghost', className: '-ml-3 cursor-pointer list-none !text-red [&::-webkit-details-marker]:hidden' })}>Supprimer</summary>
                      <form action={deleteLabResultAction} className="mt-2 flex flex-col gap-2 rounded-xl border border-red bg-red-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <input type="hidden" name="resultId" value={r.id} />
                        <input type="hidden" name="analyteCode" value={code} />
                        <span className="text-sm text-ink">Ce résultat sera effacé de l’historique.</span>
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
