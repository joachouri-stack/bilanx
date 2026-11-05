import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatNumberFr, getAnalyte, hba1cPercentToMmolMol, latestEvolution, sortHistory, toCanonical, type Analyte } from '@bilanx/domain';
import { DEMO_TIMEZONE } from '@/lib/demo-data';
import { appContext, moduleAllowed } from '@/lib/server/context';
import { labResults, type LabRow } from '@/lib/server/data';
import { ModuleForbidden } from '@/components/module-forbidden';
import { CapsuleGauge } from '@/components/capsule-gauge';
import { ButtonLink, Card, Chip, Meta, PageHeader, ScrollRegion } from '@/components/ui';
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
  if (!moduleAllowed(ctx.active, 'lab')) return <ModuleForbidden title="Analyses & Bilans" profileName={ctx.active.kind === 'real' ? ctx.active.access.displayName : ''} />;
  const { analyte: code } = await params;
  const analyte = getAnalyte(code);
  const results = analyte ? sortHistory(await labResults(ctx, code)) : [];
  if (!analyte) notFound();
  const canWrite = ctx.active.kind === 'real' && moduleAllowed(ctx.active, 'lab', 'write');
  const addButton = canWrite ? (
    <ButtonLink href={`/analyses/ajouter?analyse=${code}`} primary>
      ＋ Ajouter un résultat
    </ButtonLink>
  ) : null;
  const banner = sp.ajout ? 'Résultat enregistré.' : sp.suppression ? 'Résultat supprimé.' : null;
  if (results.length === 0) {
    return (
      <div className="fade-in">
        <PageHeader title={analyte.nameFr} actions={<Link href="/analyses" className="text-sm text-ink-3 hover:text-ink">← Toutes les analyses</Link>} />
        {banner && <p role="status" className="mb-4 rounded-xl bg-sage-2 px-4 py-3 text-sm">{banner}</p>}
        <Card className="max-w-xl">
          <p className="text-sm text-ink-2">Aucun résultat enregistré pour cette analyse.</p>
          {addButton && <div className="mt-4">{addButton}</div>}
        </Card>
      </div>
    );
  }
  const ev = latestEvolution(results)!;
  const latest = ev.latest;
  const fmt = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, dateStyle: 'medium' });
  const isHbA1c = code === 'hba1c';

  return (
    <div className="fade-in">
      <PageHeader
        title={analyte.nameFr}
        subtitle={isHbA1c ? 'Résultats de laboratoire — à ne pas confondre avec le GMI estimé à partir du capteur.' : 'Résultats de laboratoire'}
        actions={
          <>
            <Link href="/analyses" className="text-sm text-ink-3 hover:text-ink">
              ← Toutes les analyses
            </Link>
            {addButton}
          </>
        }
      />
      {banner && (
        <p role="status" className="mb-4 rounded-xl bg-sage-2 px-4 py-3 text-sm">
          {banner}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Card className="flex flex-col items-center gap-2 text-center">
          <Chip tone="petrol">Laboratoire</Chip>
          <CapsuleGauge value={latest.value} refLow={latest.refLow ?? null} refHigh={latest.refHigh ?? null} label={analyte.nameFr} />
          <p>
            <strong className="tabular text-3xl">
              {latest.comparator ? `${latest.comparator} ` : ''}
              {formatNumberFr(latest.value)}
            </strong>{' '}
            <span className="text-ink-3">{latest.unit}</span>
          </p>
          {isHbA1c && <Meta>soit {Math.round(hba1cPercentToMmolMol(latest.value))} mmol/mol</Meta>}
          <Meta>
            Prélèvement du {fmt.format(latest.sampledAt)}
            {latest.laboratory && (
              <>
                <br />
                {latest.laboratory}
              </>
            )}
          </Meta>
          {ev.previous && ev.delta !== null && (
            <p className="text-sm text-ink-2">
              {ev.delta > 0 ? '+' : ev.delta < 0 ? '−' : '±'}
              {formatNumberFr(Math.abs(ev.delta))}{' '}
              {/* Écart d'un pourcentage (HbA1c) : en points, pour ne pas suggérer une variation relative. */}
              {(ev.converted ? analyte.canonicalUnit : latest.unit) === '%'
                ? Math.abs(ev.delta) >= 2 ? 'points' : 'point'
                : ev.converted ? analyte.canonicalUnit : latest.unit}{' '}
              depuis le {fmt.format(ev.previous.sampledAt)} ({ev.daysBetween} jours)
            </p>
          )}
        </Card>
        <Card>
          <p className="text-[12.5px] font-medium text-ink-3">Historique</p>
          <HistoryChart results={results} analyte={analyte} />
          <Meta>Points uniquement aux dates réelles de prélèvement. Aucune valeur interpolée.</Meta>
          <ScrollRegion label="Historique des résultats" className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-3">
                  <th className="py-2 pr-3 font-medium">Prélèvement</th>
                  <th className="py-2 pr-3 font-medium">Valeur</th>
                  <th className="py-2 pr-3 font-medium">Référence du labo</th>
                  <th className="py-2 pr-3 font-medium">Source</th>
                  {canWrite && <th className="py-2 font-medium"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {[...results].reverse().map((r) => (
                  <tr key={r.id ?? r.sampledAt.toISOString()} className="border-b border-line align-top">
                    <td className="py-2.5 pr-3">{fmt.format(r.sampledAt)}</td>
                    <td className="tabular py-2.5 pr-3">
                      <strong>
                        {r.comparator ? `${r.comparator} ` : ''}
                        {formatNumberFr(r.value)}
                      </strong>{' '}
                      {r.unit}
                      {r.note && <span className="block text-xs text-ink-3">{r.note}</span>}
                      {isHbA1c && <span className="text-xs text-ink-3"> ({Math.round(hba1cPercentToMmolMol(r.value))} mmol/mol)</span>}
                    </td>
                    <td className="py-2.5 pr-3 text-ink-3">
                      {r.refLow != null && r.refHigh != null
                        ? `${formatNumberFr(r.refLow)} – ${formatNumberFr(r.refHigh)}`
                        : r.refHigh != null
                          ? `< ${formatNumberFr(r.refHigh)}`
                          : r.refLow != null
                            ? `> ${formatNumberFr(r.refLow)}`
                            : '—'}
                    </td>
                    <td className="py-2.5 pr-3">
                      <Chip tone="petrol">{r.source === 'demo' ? '📄 bilan (démo)' : r.source === 'document' ? '📄 bilan' : '✍️ saisie manuelle'}</Chip>
                    </td>
                    {canWrite && (
                      <td className="py-2.5 text-right">
                        {r.id && (
                          <details className="inline-block text-left">
                            <summary className="cursor-pointer list-none rounded-lg px-2 py-1 text-xs text-ink-3 hover:bg-surface-2">Supprimer</summary>
                            <form action={deleteLabResultAction} className="mt-1">
                              <input type="hidden" name="resultId" value={r.id} />
                              <input type="hidden" name="analyteCode" value={code} />
                              <button type="submit" className="rounded-lg bg-red-2 px-2.5 py-1.5 text-xs font-medium text-red">
                                Confirmer la suppression
                              </button>
                            </form>
                          </details>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        </Card>
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

function HistoryChart({ results: raw, analyte }: { results: LabRow[]; analyte: Analyte }) {
  const { rows: results, unit, converted } = chartSeries(raw, analyte);
  const W = 640;
  const H = 240;
  const L = 44;
  const R = 20;
  const T = 24;
  const B = 30;
  const first = results[0]!;
  const last = results.at(-1)!;
  const t0 = first.sampledAt.getTime() - 30 * 86_400_000;
  const t1 = last.sampledAt.getTime() + 30 * 86_400_000;
  const vals = results.flatMap((r) => [r.value, r.refLow ?? r.value, r.refHigh ?? r.value]);
  const yMin = Math.min(...vals) * 0.85;
  const yMax = Math.max(...vals) * 1.1;
  const x = (t: number) => L + ((t - t0) / (t1 - t0)) * (W - L - R);
  const y = (v: number) => T + (H - T - B) * (1 - (v - yMin) / (yMax - yMin));
  const refLow = last.refLow ?? null;
  const refHigh = last.refHigh ?? null;
  const months: Date[] = [];
  for (let d = new Date(t0); d.getTime() <= t1; d = new Date(d.getFullYear(), d.getMonth() + 2, 1)) months.push(new Date(d.getFullYear(), d.getMonth(), 1));
  const fmtM = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: '2-digit' });

  return (
    <>
      {converted && (
        <p className="mt-1 text-xs text-ink-3">Résultats rendus dans des unités différentes : tous affichés ici en {unit}.</p>
      )}
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label="Historique des résultats aux dates de prélèvement">
      {(refLow != null || refHigh != null) && (
        <>
          <rect
            x={L}
            y={y(refHigh ?? yMax)}
            width={W - L - R}
            height={y(refLow ?? yMin) - y(refHigh ?? yMax)}
            fill="var(--sage-2)"
          />
          <text x={W - R} y={y(refHigh ?? yMax) - 5} textAnchor="end" fontSize={10} fill="var(--sage)">
            intervalle de référence du dernier laboratoire
          </text>
        </>
      )}
      {months
        .filter((m) => m.getTime() >= t0)
        .map((m) => (
          <text key={m.getTime()} x={x(m.getTime())} y={H - 8} textAnchor="middle" fontSize={10.5} fill="var(--ink-3)">
            {fmtM.format(m)}
          </text>
        ))}
      {results.length > 1 && (
        <path d={results.map((r, i) => `${i ? 'L' : 'M'}${x(r.sampledAt.getTime())},${y(r.value)}`).join('')} fill="none" stroke="var(--petrol)" strokeWidth={2} />
      )}
      {results.map((r) => (
        <g key={r.sampledAt.getTime()}>
          <circle cx={x(r.sampledAt.getTime())} cy={y(r.value)} r={5.5} fill="var(--surface)" stroke="var(--petrol)" strokeWidth={2.5} />
          <text x={x(r.sampledAt.getTime())} y={y(r.value) - 11} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--ink)">
            {formatNumberFr(r.value)}
          </text>
        </g>
      ))}
    </svg>
    </>
  );
}
