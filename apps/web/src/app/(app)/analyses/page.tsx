import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ANALYTE_CATEGORY_LABELS,
  ANALYTES,
  LAB_QUALITATIVE_LABELS,
  formatNumberFr,
  getAnalyte,
  labLevel,
  labTrend,
  referenceStatus,
  type Analyte,
  type AnalyteCategory,
  type LabLevel,
  type LabTrend,
} from '@bilanx/domain';
import { DEMO_TIMEZONE } from '@/lib/demo-data';
import { appContext, moduleAllowed } from '@/lib/server/context';
import { isNumericLab, labResults, type LabRow, type NumericLabRow } from '@/lib/server/data';
import { ModuleForbidden } from '@/components/module-forbidden';
import { QualitativeChip } from '@/components/analyses-gauge';
import { LabCapsule, LEVEL_COLORS, LevelChip } from '@/components/lab-capsule';
import { DashboardSparkline } from '@/components/dashboard-sparkline';
import { Icon } from '@/components/icon';
import { ButtonLink, Card, EmptyState, Meta, PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Analyses' };

const LEVEL_ORDER: Record<LabLevel, number> = { poor: 0, fair: 1, good: 2, unknown: 3 };

/** Nom court pour l'aperçu : « Vitamine D (25-OH) » → « Vit. D », « Polynucléaires neutrophiles » → « Neutro. ». */
function shortName(a: Analyte): string {
  const n = a.nameFr
    .replace(/\s*\(.*\)\s*/g, '')
    .replace(/^Vitamine /, 'Vit. ')
    .replace(/^Polynucléaires /, '')
    .replace(/^Cholestérol /, 'Chol. ');
  return n.length > 9 ? `${n.slice(0, 7)}.` : n;
}

/** Familles où un résultat bas peut évoquer une carence. */
const DEFICIENCY_CATEGORIES = new Set<AnalyteCategory>(['vitamins', 'minerals', 'iron']);

interface AnalyteView {
  analyte: Analyte;
  latest: LabRow;
  /** Dernier résultat chiffré, et historique chiffré dans la même unité. */
  num: NumericLabRow | null;
  history: NumericLabRow[];
  previous: NumericLabRow | null;
  level: LabLevel;
  trend: LabTrend | null;
  count: number;
}

export default async function AnalysesPage() {
  const ctx = await appContext();
  if (!moduleAllowed(ctx.active, 'lab')) return <ModuleForbidden title="Analyses" profileName={ctx.active.kind === 'real' ? ctx.active.access.displayName : ''} />;
  const results = await labResults(ctx);

  // Historique par analyse (l'HbA1c a sa propre rubrique, /hba1c).
  const byCode = new Map<string, LabRow[]>();
  for (const r of results) {
    if (r.analyteCode === 'hba1c' || !getAnalyte(r.analyteCode)) continue;
    byCode.set(r.analyteCode, [...(byCode.get(r.analyteCode) ?? []), r]);
  }
  const order = new Map(ANALYTES.map((a, i) => [a.code, i]));
  const views: AnalyteView[] = [...byCode.entries()]
    .sort(([a], [b]) => (order.get(a) ?? 999) - (order.get(b) ?? 999))
    .map(([code, rows]) => {
      const sorted = [...rows].sort((a, b) => a.sampledAt.getTime() - b.sampledAt.getTime());
      const latest = sorted.at(-1)!;
      const numeric = sorted.filter(isNumericLab);
      const num = numeric.at(-1) ?? null;
      // Comparaisons dans la même unité seulement (rien n'est converti à l'insu de l'utilisateur).
      const history = num ? numeric.filter((r) => r.unit === num.unit) : [];
      const previous = history.length > 1 ? history.at(-2)! : null;
      const range = { low: num?.refLow, high: num?.refHigh };
      return {
        analyte: getAnalyte(code)!,
        latest,
        num,
        history,
        previous,
        level: num ? labLevel(num.value, range) : 'unknown',
        trend: num && previous ? labTrend(previous.value, num.value, range) : null,
        count: sorted.length,
      };
    });

  const groups = (Object.keys(ANALYTE_CATEGORY_LABELS) as AnalyteCategory[])
    .map((cat) => ({ cat, label: ANALYTE_CATEGORY_LABELS[cat], views: views.filter((v) => v.analyte.category === cat) }))
    .filter((g) => g.views.length > 0);

  // Résumé : niveaux, carences possibles, autres valeurs hors références.
  const rated = views.filter((v) => v.level !== 'unknown');
  const counts = { good: 0, fair: 0, poor: 0 } as Record<'good' | 'fair' | 'poor', number>;
  for (const v of rated) counts[v.level as 'good' | 'fair' | 'poor']++;
  const outside = views.filter((v) => v.num && referenceStatus(v.num.value, { low: v.num.refLow, high: v.num.refHigh }) !== 'within' && v.level !== 'unknown');
  const severity = (v: AnalyteView) => (v.level === 'poor' ? 0 : 1);
  const deficiencies = outside
    .filter((v) => DEFICIENCY_CATEGORIES.has(v.analyte.category) && v.num!.refLow != null && v.num!.value < v.num!.refLow)
    .sort((a, b) => severity(a) - severity(b));
  const others = outside.filter((v) => !deficiencies.includes(v)).sort((a, b) => severity(a) - severity(b));

  const fmt = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, dateStyle: 'medium' });
  const fmtShort = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, day: 'numeric', month: 'short', year: '2-digit' });
  const canWrite = ctx.active.kind === 'real' && moduleAllowed(ctx.active, 'lab', 'write');
  const ref = (r: NumericLabRow) =>
    r.refLow != null && r.refHigh != null
      ? `${formatNumberFr(r.refLow)} – ${formatNumberFr(r.refHigh)}`
      : r.refHigh != null
        ? `< ${formatNumberFr(r.refHigh)}`
        : r.refLow != null
          ? `> ${formatNumberFr(r.refLow)}`
          : null;

  return (
    <div className="fade-in">
      <PageHeader
        title="Analyses"
        subtitle="Vitamines, minéraux, fer, sérologies virales… : vos résultats, leur évolution et ce qui mérite votre attention. L’HbA1c a sa propre rubrique."
        actions={
          canWrite ? (
            <ButtonLink href="/analyses/ajouter" variant="primary" className="w-full sm:w-auto">
              <Icon name="plus" className="size-5" />
              Ajouter un résultat
            </ButtonLink>
          ) : undefined
        }
      />
      {views.length === 0 ? (
        <EmptyState
          title="Aucun résultat d’analyse pour ce profil (hors HbA1c)."
          description="Ajoutez un bilan sanguin dans Documents : ses analyses sont lues, puis vous les validez une par une. Vous pouvez aussi saisir un résultat à la main."
          action={canWrite ? <ButtonLink href="/documents?cat=analyses#ajouter">Ajouter un bilan sanguin</ButtonLink> : undefined}
        />
      ) : (
        <div className="flex flex-col gap-5">
          {/* ───────── Vue d'ensemble ───────── */}
          <section aria-labelledby="vue-ensemble" className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <Card className="flex flex-col gap-4">
              <h2 id="vue-ensemble" className="font-semibold">
                Vue d’ensemble
              </h2>
              <div className="grid grid-cols-3 gap-2" data-resume>
                {(['good', 'fair', 'poor'] as const).map((l) => (
                  <div key={l} className={`rounded-2xl px-3 py-3 ${LEVEL_COLORS[l].chip}`}>
                    <p className="tabular text-3xl font-bold leading-none">{counts[l]}</p>
                    <p className="mt-1.5 text-sm font-semibold">{l === 'good' ? 'Bons' : l === 'fair' ? 'Moyens' : 'À revoir'}</p>
                  </div>
                ))}
              </div>
              {rated.length > 0 && (
                <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${counts.good} bons, ${counts.fair} moyens, ${counts.poor} à revoir`}>
                  {(['good', 'fair', 'poor'] as const).map((l) =>
                    counts[l] ? <span key={l} className={LEVEL_COLORS[l].dot} style={{ width: `${(counts[l] / rated.length) * 100}%` }} /> : null,
                  )}
                </div>
              )}
              {rated.length > 0 && (
                // Aperçu : une capsule par analyse, de « à revoir » à « bon ».
                <ul className="-mx-1 flex gap-1 overflow-x-auto pb-1" aria-label="Aperçu de vos analyses" data-apercu>
                  {[...rated]
                    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level])
                    .map((v) => (
                      <li key={v.analyte.code} className="shrink-0">
                        <Link href={`/analyses/${v.analyte.code}`} className="flex w-[54px] flex-col items-center gap-1 rounded-xl px-1 py-1.5 hover:bg-surface-2" title={v.analyte.nameFr}>
                          <LabCapsule value={v.num!.value} refLow={v.num!.refLow} refHigh={v.num!.refHigh} previous={v.previous?.value} label={v.analyte.nameFr} size="sm" />
                          <span className="w-full truncate text-center text-[11px] leading-tight text-ink-2">{shortName(v.analyte)}</span>
                        </Link>
                      </li>
                    ))}
                </ul>
              )}
              <Meta>
                Couleurs d’après les valeurs de référence de votre laboratoire : <b className="text-go">bon</b> = bien dans l’intervalle,{' '}
                <b className="text-amber">moyen</b> = près d’une limite ou juste en dehors, <b className="text-red">à revoir</b> = nettement en dehors.
              </Meta>
            </Card>

            <Card className="flex flex-col gap-3" accent={deficiencies.length || others.length ? 'amber' : 'sage'}>
              <h2 className="font-semibold">Ce qui mérite votre attention</h2>
              {deficiencies.length === 0 && others.length === 0 ? (
                <p className="flex items-center gap-3 text-ink-2">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sage-2 text-go">
                    <Icon name="check" className="size-4" />
                  </span>
                  Tous vos derniers résultats sont dans les valeurs de référence de votre laboratoire.
                </p>
              ) : (
                <>
                  {deficiencies.length > 0 && (
                    <div data-carences>
                      <p className="mb-1.5 text-sm font-semibold text-ink-2">Carences possibles</p>
                      <ul className="flex flex-col gap-1.5">{deficiencies.map((v) => <AttentionItem key={v.analyte.code} v={v} refText={ref(v.num!)} />)}</ul>
                    </div>
                  )}
                  {others.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-sm font-semibold text-ink-2">Autres valeurs en dehors des références</p>
                      <ul className="flex flex-col gap-1.5">{others.map((v) => <AttentionItem key={v.analyte.code} v={v} refText={ref(v.num!)} />)}</ul>
                    </div>
                  )}
                  <Meta>Résumé indicatif, à partir de votre dernier résultat pour chaque analyse. Parlez-en avec votre médecin.</Meta>
                </>
              )}
            </Card>
          </section>

          {/* ───────── Analyses par famille ───────── */}
          {groups.map((g) => (
            <section key={g.cat} aria-labelledby={`famille-${g.cat}`}>
              <h2 id={`famille-${g.cat}`} className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-ink-3">
                {g.label}
              </h2>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {g.views.map((v) => (
                  <li key={v.analyte.code} className="min-w-0">
                    <AnalyteCard v={v} refText={v.num ? ref(v.num) : null} fmt={fmt} fmtShort={fmtShort} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <Meta>
            La capsule montre votre résultat par rapport aux valeurs de référence de votre laboratoire (zone verte pâle) ; le petit trait à gauche,
            le résultat précédent. Pour les virus, « Positif » peut signifier une protection (vaccin, infection ancienne) comme une infection en
            cours. Parlez-en avec votre médecin.
          </Meta>
        </div>
      )}
    </div>
  );
}

function AttentionItem({ v, refText }: { v: AnalyteView; refText: string | null }) {
  const n = v.num!;
  const low = n.refLow != null && n.value < n.refLow;
  return (
    <li>
      <Link href={`/analyses/${v.analyte.code}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-surface-2">
        <LabCapsule value={n.value} refLow={n.refLow} refHigh={n.refHigh} previous={v.previous?.value} label={v.analyte.nameFr} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{v.analyte.nameFr}</span>
          <span className="block text-[13px] text-ink-3">
            {low ? 'Basse' : 'Élevée'}
            {refText ? ` · réf. ${refText} ${n.unit}` : ''}
          </span>
        </span>
        <span className="tabular shrink-0 text-right">
          <strong className={`text-lg ${v.level === 'poor' ? 'text-red' : 'text-amber'}`}>{formatNumberFr(n.value)}</strong>{' '}
          <span className="text-[13px] text-ink-3">{n.unit}</span>
        </span>
      </Link>
    </li>
  );
}

const TREND = {
  better: { icon: '↗', label: 'en amélioration', cls: 'text-go' },
  worse: { icon: '↘', label: 'à surveiller', cls: 'text-red' },
  stable: { icon: '→', label: 'stable', cls: 'text-ink-2' },
} as const;

function AnalyteCard({
  v,
  refText,
  fmt,
  fmtShort,
}: {
  v: AnalyteView;
  refText: string | null;
  fmt: Intl.DateTimeFormat;
  fmtShort: Intl.DateTimeFormat;
}) {
  const { analyte, latest, num, previous, history } = v;
  const delta = num && previous ? Math.round((num.value - previous.value) * 100) / 100 : null;
  const pts = history.slice(-8);
  const values = pts.map((r) => r.value);
  // Échelle centrée sur les résultats (la bande de référence est tronquée si besoin) : l'évolution reste lisible.
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max((hi - lo) * 0.35, Math.abs(hi) * 0.03, 0.01);
  return (
    <Link
      href={`/analyses/${analyte.code}`}
      data-analyse={analyte.code}
      className="flex h-full flex-col gap-3 rounded-[var(--radius-card,18px)] border border-line bg-surface p-4 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-petrol"
    >
      <div className="flex items-start gap-3">
        {num && <LabCapsule value={num.value} refLow={num.refLow} refHigh={num.refHigh} previous={previous?.value} label={analyte.nameFr} />}
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug">{analyte.nameFr}</p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
            {num ? (
              <>
                <strong className={`tabular text-2xl leading-none ${v.level === 'unknown' ? '' : v.level === 'good' ? 'text-go' : v.level === 'fair' ? 'text-amber' : 'text-red'}`}>
                  {num.comparator ? `${num.comparator} ` : ''}
                  {formatNumberFr(num.value)}
                </strong>
                <span className="text-sm text-ink-3">{num.unit}</span>
              </>
            ) : (
              latest.qualitative && <strong className="text-2xl leading-none">{LAB_QUALITATIVE_LABELS[latest.qualitative]}</strong>
            )}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {num && <LevelChip level={v.level} />}
            {latest.qualitative && num && <QualitativeChip qualitative={latest.qualitative} />}
          </div>
          {refText && <p className="mt-1.5 text-[12px] text-ink-3">réf. {refText}</p>}
        </div>
      </div>

      {/* Comparaison avec le résultat précédent. */}
      {num && previous && delta !== null && v.trend && (
        <p className={`flex items-center gap-1.5 text-sm ${TREND[v.trend].cls}`} data-evolution={v.trend}>
          <span aria-hidden className="text-base font-bold">
            {TREND[v.trend].icon}
          </span>
          <span className="tabular font-semibold">
            {delta > 0 ? '+' : delta < 0 ? '−' : ''}
            {formatNumberFr(Math.abs(delta))}
          </span>
          <span className="text-ink-2">
            depuis le {fmtShort.format(previous.sampledAt)} · {TREND[v.trend].label}
          </span>
        </p>
      )}

      {/* Historique : mini-courbe des derniers résultats (même unité). */}
      {pts.length > 1 && (
        <DashboardSparkline
          points={pts.map((r) => ({ t: r.sampledAt.getTime(), v: r.value }))}
          min={lo - pad}
          max={hi + pad}
          band={num?.refLow != null && num?.refHigh != null ? [num.refLow, num.refHigh] : undefined}
          height={40}
          color={LEVEL_COLORS[v.level].stroke}
          lastDot={LEVEL_COLORS[v.level].stroke}
          dots
          maxGapMs={Infinity}
          label={`${analyte.nameFr} : ${pts.length} derniers résultats`}
        />
      )}

      <p className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-2 text-[13px] text-ink-3">
        <span>{fmt.format(latest.sampledAt)}</span>
        <span className="inline-flex items-center gap-1 font-medium text-petrol">
          {v.count > 1 ? `Historique · ${v.count} résultats` : 'Détails'} <span aria-hidden>›</span>
        </span>
      </p>
    </Link>
  );
}
