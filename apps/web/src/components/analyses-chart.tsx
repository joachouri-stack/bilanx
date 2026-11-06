'use client';

import { useEffect, useRef, useState } from 'react';

export interface AnalysesChartPoint {
  /** Date du prélèvement (ms depuis 1970). */
  t: number;
  v: number;
  /** Valeur affichée (« 7,2 »). */
  label: string;
}

const fmtNum = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n);

/** Graduations « rondes » (1, 2, 2,5, 5 × 10ⁿ) couvrant [min ; max]. */
function niceTicks(min: number, max: number, count: number): number[] {
  if (!(max > min)) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / Math.max(1, count - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.001; v += step) ticks.push(Number(v.toFixed(10)));
  if (ticks.at(-1)! < max) ticks.push(Number((ticks.at(-1)! + step).toFixed(10)));
  return ticks;
}

/**
 * Évolution d'une analyse : points aux seules dates réelles de prélèvement, bande des valeurs de référence
 * du dernier laboratoire. Dessiné à la largeur réelle (ResizeObserver) ; textes ≥ 12 px ; défilement vertical libre.
 */
export function AnalysesChart({ points, refLow, refHigh, unit }: { points: AnalysesChartPoint[]; refLow: number | null; refHigh: number | null; unit: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const update = () => setWidth(Math.round(el.getBoundingClientRect().width));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (points.length < 2) {
    return (
      <p className="rounded-xl border border-dashed border-line p-5 text-center text-ink-2">Ajoutez un résultat précédent pour voir l’évolution.</p>
    );
  }

  const H = width < 480 ? 220 : 260;
  const L = 48;
  const R = 16;
  const T = 26;
  const B = 32;
  const vals = points.flatMap((p) => [p.v, ...(refLow != null ? [refLow] : []), ...(refHigh != null ? [refHigh] : [])]);
  const yTicks = niceTicks(Math.min(...vals), Math.max(...vals), width < 480 ? 4 : 5);
  const yMin = yTicks[0]!;
  const yMax = yTicks.at(-1)!;
  const span = points.at(-1)!.t - points[0]!.t;
  const t0 = points[0]!.t - Math.max(span * 0.06, 10 * 86_400_000);
  const t1 = points.at(-1)!.t + Math.max(span * 0.06, 10 * 86_400_000);
  const plotW = Math.max(1, width - L - R);
  const x = (t: number) => L + ((t - t0) / (t1 - t0)) * plotW;
  const y = (v: number) => T + (H - T - B) * (1 - (v - yMin) / (yMax - yMin));

  // Graduations de dates : premiers du mois, pas de 1, 2, 3, 6 ou 12 mois selon la place (4 à 6 libellés).
  const maxX = Math.max(2, Math.min(6, Math.floor(plotW / 80)));
  const months = (t1 - t0) / (30.4 * 86_400_000);
  const stepM = [1, 2, 3, 6, 12, 24].find((m) => months / m <= maxX) ?? 24;
  const xTicks: number[] = [];
  const d0 = new Date(t0);
  for (let d = new Date(d0.getFullYear(), d0.getMonth() + 1, 1); d.getTime() <= t1; d = new Date(d.getFullYear(), d.getMonth() + stepM, 1)) xTicks.push(d.getTime());
  const fmtM = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: '2-digit' });
  const hasRef = refLow != null || refHigh != null;

  return (
    <div>
      <div ref={box} className="w-full touch-pan-y">
        {width > 0 && (
          <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label={`Évolution des résultats en ${unit}, aux dates de prélèvement`} className="block">
            {hasRef && (
              <rect
                x={L}
                y={y(Math.min(refHigh ?? yMax, yMax))}
                width={plotW}
                height={Math.max(0, y(Math.max(refLow ?? yMin, yMin)) - y(Math.min(refHigh ?? yMax, yMax)))}
                fill="var(--sage-2)"
              />
            )}
            {yTicks.map((v) => (
              <g key={v}>
                <line x1={L} x2={L + plotW} y1={y(v)} y2={y(v)} stroke="var(--line)" />
                <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize={12} fill="var(--ink-3)" className="tabular">
                  {fmtNum(v)}
                </text>
              </g>
            ))}
            {xTicks.map((t) => (
              <text key={t} x={x(t)} y={H - 10} textAnchor="middle" fontSize={12} fill="var(--ink-3)">
                {fmtM.format(t)}
              </text>
            ))}
            <path d={points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t)},${y(p.v)}`).join('')} fill="none" stroke="var(--petrol)" strokeWidth={2.5} strokeLinejoin="round" />
            {points.map((p) => (
              <g key={p.t}>
                <circle cx={x(p.t)} cy={y(p.v)} r={5.5} fill="var(--surface)" stroke="var(--petrol)" strokeWidth={2.5} />
                <text x={Math.min(Math.max(x(p.t), L + 14), L + plotW - 14)} y={y(p.v) - 11} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--ink)" className="tabular">
                  {p.label}
                </text>
              </g>
            ))}
          </svg>
        )}
        {width === 0 && <div style={{ height: 220 }} aria-hidden />}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-2">
        <li className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-full border-2 border-petrol bg-surface" aria-hidden />
          Votre résultat ({unit})
        </li>
        {hasRef && (
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-4 rounded-sm bg-sage-2 ring-1 ring-sage" aria-hidden />
            Valeurs de référence du dernier laboratoire
          </li>
        )}
      </ul>
    </div>
  );
}
