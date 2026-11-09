import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatLabResultFr, formatNumberFr, getAnalyte, hba1cPercentToMmolMol, LAB_QUALITATIVE_LABELS, latestEvolution, sortHistory, toCanonical, type Analyte } from '@bilanx/domain';
import { DEMO_TIMEZONE } from '@/lib/demo-data';
import { appContext, moduleAllowed } from '@/lib/server/context';
import { isNumericLab, labResults, type LabRow, type NumericLabRow } from '@/lib/server/data';
import { ModuleForbidden } from './module-forbidden';
import { CapsuleGauge } from './capsule-gauge';
import { Button, ButtonLink, Card, EmptyState, Meta, PageHeader, buttonClass } from './ui';
import { Icon } from './icon';
import { AnalysesChart } from './analyses-chart';
import { QualitativeChip, ReferenceChip } from './analyses-gauge';
import { deleteLabResultAction } from '@/lib/server/actions';

/**
 * Fiche d'une analyse : dernier résultat, évolution et historique.
 * Partagée par la rubrique « HbA1c » (/hba1c) et les fiches de la rubrique « Analyses » (/analyses/[code]).
 */
export async function AnalyteDetail({ code, sp }: { code: string; sp: { ajout?: string; suppression?: string } }) {
  const ctx = await appContext();
  const isHbA1c = code === 'hba1c';
  if (!moduleAllowed(ctx.active, 'lab')) return <ModuleForbidden title={isHbA1c ? 'HbA1c' : 'Analyses'} profileName={ctx.active.kind === 'real' ? ctx.active.access.displayName : ''} />;
  const analyte = getAnalyte(code);
  const results = analyte ? sortHistory(await labResults(ctx, code)) : [];
  if (!analyte) notFound();
  const canWrite = ctx.active.kind === 'real' && moduleAllowed(ctx.active, 'lab', 'write');
  const addButton = canWrite ? (
    <ButtonLink href={`/analyses/ajouter?analyse=${code}`} variant="primary">
      <Icon name="plus" className="size-5" />
      Ajouter un résultat
    </ButtonLink>
  ) : null;
  // L'HbA1c est une rubrique du menu à part entière : pas de retour vers la liste des autres analyses.
  const back = isHbA1c ? null : (
    <Link href="/analyses" className={buttonClass({ variant: 'ghost', className: '-ml-3' })}>
      <Icon name="chevronLeft" className="size-5" />
      Toutes les analyses
    </Link>
  );
  const banner = sp.ajout ? 'Résultat enregistré.' : sp.suppression ? 'Résultat supprimé.' : null;
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
  // Dernier résultat, chiffré ou seulement qualitatif (sérologie « Négatif ») ; l'évolution, la courbe
  // et les repères ne portent que sur les résultats chiffrés.
  const latest = results.at(-1)!;
  const numeric = results.filter(isNumericLab);
  const ev = latestEvolution(numeric);
  const latestNum = latest.value !== null ? (latest as NumericLabRow) : null;
  const fmt = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, dateStyle: 'medium' });
  const fmtShort = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, day: 'numeric', month: 'short' });
  const hasRef = latest.refLow != null || latest.refHigh != null;
  const series = numeric.length ? chartSeries(numeric, analyte) : null;
  const ref = (low: number | null, high: number | null) =>
    low != null && high != null ? `${formatNumberFr(low)} – ${formatNumberFr(high)}` : high != null ? `< ${formatNumberFr(high)}` : low != null ? `> ${formatNumberFr(low)}` : 'non notées';
  // Repères de l'historique (même unité que le dernier résultat).
  const refNum = latestNum ?? numeric.at(-1) ?? null;
  const sameUnit = refNum ? numeric.filter((r) => r.unit === refNum.unit) : [];
  const minR = refNum ? sameUnit.reduce((m, r) => (r.value < m.value ? r : m), refNum) : null;
  const maxR = refNum ? sameUnit.reduce((m, r) => (r.value > m.value ? r : m), refNum) : null;
  const evShown = ev && latestNum && ev.latest === latestNum ? ev : null;
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
      <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start">
        {/* Carte résumé : dernier résultat en grand, tendance colorée, repères de l'historique. */}
        <section
          aria-label="Dernier résultat"
          className="relative overflow-hidden rounded-[var(--radius-card,18px)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6"
        >
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-[radial-gradient(closest-side,rgba(34,211,238,0.2),transparent)]" />
          <div className="relative flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-petrol-2 text-petrol" aria-hidden>
              <Icon name="flask" className="size-5" />
            </span>
            <p className="flex-1 font-semibold">Dernier résultat</p>
            <p className="text-sm text-ink-3">{fmt.format(latest.sampledAt)}</p>
          </div>
          <div className="relative mt-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              {latestNum ? (
                <p className="flex items-baseline gap-1.5">
                  <strong className="tabular text-[56px] font-bold leading-none tracking-tight">
                    {latestNum.comparator ? `${latestNum.comparator} ` : ''}
                    {formatNumberFr(latestNum.value)}
                  </strong>
                  <span className="text-xl text-ink-3">{latestNum.unit}</span>
                </p>
              ) : (
                latest.qualitative && <p className="text-[44px] font-bold leading-none tracking-tight">{LAB_QUALITATIVE_LABELS[latest.qualitative]}</p>
              )}
              {isHbA1c && latestNum && <p className="mt-2 text-ink-2">soit {Math.round(hba1cPercentToMmolMol(latestNum.value))} mmol/mol</p>}
            </div>
            {hasRef && latestNum && <CapsuleGauge value={latestNum.value} refLow={latestNum.refLow ?? null} refHigh={latestNum.refHigh ?? null} label={analyte.nameFr} />}
          </div>
          <div className="relative mt-4 flex flex-wrap gap-2">
            {latest.qualitative && latestNum && <QualitativeChip qualitative={latest.qualitative} />}
            {evShown?.previous && evShown.delta !== null && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold ${
                  // HbA1c : baisse = vert, hausse = rouge, stable = orange ; autres analyses : neutre.
                  isHbA1c ? (evShown.delta < 0 ? 'bg-sage-2 text-go' : evShown.delta > 0 ? 'bg-red-2 text-red' : 'bg-amber-2 text-amber') : 'bg-surface-2 text-ink-2'
                }`}
              >
                {evShown.delta > 0 ? '↑ +' : evShown.delta < 0 ? '↓ −' : '→ '}
                {formatNumberFr(Math.abs(evShown.delta))}{' '}
                {(evShown.converted ? analyte.canonicalUnit : latest.unit) === '%'
                  ? Math.abs(evShown.delta) >= 2
                    ? 'points'
                    : 'point'
                  : evShown.converted
                    ? analyte.canonicalUnit
                    : latest.unit}
                <span className="font-normal"> depuis le {fmtShort.format(evShown.previous.sampledAt)}</span>
              </span>
            )}
            {hasRef && latestNum && <ReferenceChip value={latestNum.value} refLow={latestNum.refLow} refHigh={latestNum.refHigh} />}
          </div>
          <ul className="relative mt-4 divide-y divide-line">
            {[
              results.length > 1 ? { dot: 'bg-indigo', label: 'Précédent', value: formatLabResultFr(results.at(-2)!) } : null,
              sameUnit.length > 1 && minR ? { dot: 'bg-go', label: 'Plus bas', value: `${formatNumberFr(minR.value)} ${minR.unit}` } : null,
              sameUnit.length > 1 && maxR ? { dot: 'bg-amber', label: 'Plus haut', value: `${formatNumberFr(maxR.value)} ${maxR.unit}` } : null,
              { dot: 'bg-petrol', label: 'Résultats', value: String(results.length) },
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
          {(latest.laboratory || hasRef) && (
            <Meta className="relative mt-2">
              {[latest.laboratory, hasRef ? `référence ${ref(latest.refLow, latest.refHigh)} ${latest.unit}` : null].filter(Boolean).join(' · ')}
            </Meta>
          )}
        </section>

        <div className="flex min-w-0 flex-col gap-4">
          {series && series.rows.length > 0 && (
            <Card>
              <h2 className="mb-2 font-semibold">Évolution</h2>
              {series.converted && <p className="mb-2 text-sm text-ink-2">Résultats rendus dans des unités différentes : tous affichés ici en {series.unit}.</p>}
              <AnalysesChart
                points={series.rows.map((r) => ({ t: r.sampledAt.getTime(), v: r.value, label: formatNumberFr(r.value) }))}
                refLow={series.rows.at(-1)!.refLow ?? null}
                refHigh={series.rows.at(-1)!.refHigh ?? null}
                unit={series.unit}
              />
            </Card>
          )}
          <Card>
            <h2 className="mb-1 font-semibold">Historique</h2>
            <ul className="divide-y divide-line">
              {[...results].reverse().map((r, i, arr) => {
                const older = arr[i + 1];
                const d = older && older.unit === r.unit && r.value !== null && older.value !== null ? Math.round((r.value - older.value) * 100) / 100 : null;
                return (
                  <li
                    key={r.id ?? r.sampledAt.toISOString()}
                    data-resultat
                    className="relative flex items-center gap-3 py-3 has-[details[open]]:pb-[4.75rem]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{fmt.format(r.sampledAt)}</span>
                      {/* Provenance toujours indiquée (saisie ou bilan), en petit. */}
                      <span className="block truncate text-[13px] text-ink-3">
                        <span>{sourceLabel(r.source)}</span>
                        {[r.refLow != null || r.refHigh != null ? `réf. ${ref(r.refLow, r.refHigh)}` : null, r.note].filter(Boolean).map((t) => ` · ${t}`)}
                      </span>
                    </span>
                    {d !== null && d !== 0 && (
                      <span
                        className={`tabular shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold ${
                          isHbA1c ? (d < 0 ? 'bg-sage-2 text-go' : 'bg-red-2 text-red') : 'bg-surface-2 text-ink-2'
                        }`}
                      >
                        {d < 0 ? '↓' : '↑'} {formatNumberFr(Math.abs(d))}
                      </span>
                    )}
                    <span className="tabular flex flex-col items-end gap-1 text-right">
                      {r.qualitative && <QualitativeChip qualitative={r.qualitative} />}
                      {r.value !== null && (
                        <span>
                          <strong className="text-lg">
                            {r.comparator ? `${r.comparator} ` : ''}
                            {formatNumberFr(r.value)}
                          </strong>{' '}
                          <span className="text-ink-3">{r.unit}</span>
                        </span>
                      )}
                      {isHbA1c && r.value !== null && <span className="block text-[13px] text-ink-3">{Math.round(hba1cPercentToMmolMol(r.value))} mmol/mol</span>}
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
                );
              })}
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
function chartSeries(results: NumericLabRow[], analyte: Analyte): { rows: NumericLabRow[]; unit: string; converted: boolean } {
  const units = new Set(results.map((r) => r.unit));
  if (units.size <= 1) return { rows: results, unit: results[0]?.unit ?? analyte.canonicalUnit, converted: false };
  const conv = (v: number | null, u: string) => (v === null ? null : toCanonical(analyte, v, u));
  const rows = results
    .map((r) => ({ ...r, value: conv(r.value, r.unit) as number, refLow: conv(r.refLow, r.unit), refHigh: conv(r.refHigh, r.unit), unit: analyte.canonicalUnit }))
    .filter((r) => r.value !== null);
  return { rows, unit: analyte.canonicalUnit, converted: true };
}
