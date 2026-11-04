import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatNumberFr, getAnalyte, hba1cPercentToMmolMol, latestEvolution, sortHistory } from '@bilanx/domain';
import { DEMO_LAB_RESULTS, DEMO_TIMEZONE } from '@/lib/demo-data';
import { CapsuleGauge } from '@/components/capsule-gauge';
import { Card, Chip, Meta, PageHeader } from '@/components/ui';

import { requireUser } from '@/lib/server/auth';
// Titre générique : les métadonnées sont calculées avant le contrôle de session.
export const metadata: Metadata = { title: 'Analyse' };

export default async function AnalytePage({ params }: { params: Promise<{ analyte: string }> }) {
  await requireUser();
  const { analyte: code } = await params;
  const analyte = getAnalyte(code);
  const results = sortHistory(DEMO_LAB_RESULTS.filter((r) => r.analyteCode === code));
  if (!analyte || results.length === 0) notFound();
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
          <Link href="/analyses" className="text-sm text-ink-3 hover:text-ink">
            ← Toutes les analyses
          </Link>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Card className="flex flex-col items-center gap-2 text-center">
          <Chip tone="petrol">Laboratoire</Chip>
          <CapsuleGauge value={latest.value} refLow={latest.refLow ?? null} refHigh={latest.refHigh ?? null} label={analyte.nameFr} />
          <p>
            <strong className="tabular text-3xl">{formatNumberFr(latest.value)}</strong> <span className="text-ink-3">{latest.unit}</span>
          </p>
          {isHbA1c && <Meta>soit {Math.round(hba1cPercentToMmolMol(latest.value))} mmol/mol</Meta>}
          <Meta>
            Prélèvement du {fmt.format(latest.sampledAt)}
            <br />
            {latest.laboratory}
          </Meta>
          {ev.previous && ev.delta !== null && (
            <p className="text-sm text-ink-2">
              {ev.delta > 0 ? '+' : ev.delta < 0 ? '−' : '±'}
              {formatNumberFr(Math.abs(ev.delta))} {latest.unit} depuis le {fmt.format(ev.previous.sampledAt)} ({ev.daysBetween} jours)
            </p>
          )}
        </Card>
        <Card>
          <p className="text-[12.5px] font-medium text-ink-3">Historique</p>
          <HistoryChart results={results} />
          <Meta>Points uniquement aux dates réelles de prélèvement. Aucune valeur interpolée.</Meta>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-3">
                  <th className="py-2 pr-3 font-medium">Prélèvement</th>
                  <th className="py-2 pr-3 font-medium">Valeur</th>
                  <th className="py-2 pr-3 font-medium">Référence du labo</th>
                  <th className="py-2 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {[...results].reverse().map((r) => (
                  <tr key={r.sampledAt.toISOString()} className="border-b border-line">
                    <td className="py-2.5 pr-3">{fmt.format(r.sampledAt)}</td>
                    <td className="tabular py-2.5 pr-3">
                      <strong>{formatNumberFr(r.value)}</strong> {r.unit}
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
                    <td className="py-2.5">
                      <Chip tone="petrol">📄 bilan (démo)</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

function HistoryChart({ results }: { results: (typeof DEMO_LAB_RESULTS)[number][] }) {
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
  );
}
