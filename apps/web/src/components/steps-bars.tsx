'use client';

import { useEffect, useRef, useState } from 'react';
import { formatNumberFr } from '@bilanx/domain';

export interface Bar {
  label: string;
  /** Libellé court utilisé quand la place manque (ex. « lun. » au lieu de « lun. 2/11 »). */
  shortLabel?: string;
  /** null : pas de donnée (barre absente, jamais 0 inventé). */
  value: number | null;
  title: string;
}

/** Largeur réelle d'un élément (ResizeObserver), pour dessiner les graphiques en pixels réels. */
export function useChartWidth(initial = 340) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth || initial);
    const ro = new ResizeObserver(([e]) => e && e.contentRect.width > 0 && setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [initial]);
  return { ref, width };
}

/** Largeur approximative d'un texte (chiffres et lettres courantes). */
export const textWidth = (s: string, fontSize: number) => s.length * fontSize * 0.58;

/** Pas d'affichage des libellés de l'axe horizontal pour qu'ils ne se chevauchent pas. */
export function labelStep(count: number, slot: number, labelW: number) {
  const every = Math.max(1, Math.ceil((labelW + 6) / Math.max(1, slot)));
  // Pas « ronds » : 1, 2, 3, 4, 6, 7, 10…
  return [1, 2, 3, 4, 5, 6, 7, 10, 14, 15].find((s) => s >= every) ?? Math.ceil(count / 4);
}

/** Graduations « rondes » de 0 à `max` (4 à 6 selon la hauteur disponible). */
export function niceTicks(max: number, target: number): number[] {
  const raw = max / Math.max(1, target);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const top = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) out.push(Math.round(v));
  return out;
}

/**
 * Barres de pas, dessinées à la largeur réelle de l'écran : nombre exact au-dessus de chaque barre quand la
 * place le permet (sinon au survol), moins de libellés si l'écran est étroit. `currentIndex` : barre de la
 * période en cours (aujourd'hui), légendée sous le graphique. Ne bloque jamais le défilement vertical.
 */
export function StepsBars({
  bars,
  goal,
  currentIndex,
  currentLabel = 'Aujourd’hui (journée en cours)',
}: {
  bars: Bar[];
  goal?: number | null;
  currentIndex?: number;
  currentLabel?: string;
}) {
  const { ref, width } = useChartWidth();
  const W = Math.max(240, width);
  const H = 230;
  const L = 46;
  const R = 6;
  const T = 26;
  const B = 26;
  const max = Math.max(goal ?? 0, 1000, ...bars.map((b) => b.value ?? 0));
  const ticks = niceTicks(max, 4);
  const top = ticks.at(-1)!;
  const bw = (W - L - R) / Math.max(1, bars.length);
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const valueFs = 13;
  const longest = Math.max(...bars.map((b) => (b.value === null ? 0 : textWidth(formatNumberFr(b.value), valueFs))));
  const showValues = longest + 2 <= bw;
  const axisFs = 12;
  const fullW = Math.max(...bars.map((b) => textWidth(b.label, axisFs)));
  const shortW = Math.max(...bars.map((b) => textWidth(b.shortLabel ?? b.label, axisFs)));
  const useShort = fullW + 6 > bw;
  const every = useShort ? labelStep(bars.length, bw, shortW) : 1;
  const goalText = goal ? `objectif ${formatNumberFr(goal)}` : '';
  const goalW = textWidth(goalText, 12) + 10;
  const anyGoal = goal != null && goal > 0;
  const anyReached = anyGoal && bars.some((b, i) => i !== currentIndex && b.value !== null && b.value >= goal!);
  const anyBelow = bars.some((b, i) => i !== currentIndex && b.value !== null && (!anyGoal || b.value < goal!));
  const showCurrent = currentIndex !== undefined && bars[currentIndex]?.value != null;

  return (
    <div>
      <div ref={ref} className="w-full touch-pan-y">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full" role="img" aria-label="Nombre de pas">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" />
              <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize={axisFs} fill="var(--ink-3)">
                {formatNumberFr(t)}
              </text>
            </g>
          ))}
          {bars.map((b, i) => {
            const x = L + i * bw + bw * 0.14;
            const w = Math.max(2, bw * 0.72);
            const isCurrent = i === currentIndex;
            const reached = anyGoal && b.value !== null && b.value >= goal!;
            return (
              <g key={i}>
                <title>{b.title}</title>
                {b.value !== null && b.value > 0 && (
                  <rect
                    x={x}
                    y={y(b.value)}
                    width={w}
                    height={y(0) - y(b.value)}
                    rx={Math.min(6, w / 3)}
                    fill={!anyGoal || reached ? 'var(--go)' : 'var(--amber)'}
                    stroke={isCurrent ? 'var(--petrol)' : undefined}
                    strokeDasharray={isCurrent ? '4 3' : undefined}
                  />
                )}
                {showValues && b.value !== null && (
                  <text x={x + w / 2} y={y(b.value) - 6} textAnchor="middle" fontSize={valueFs} fontWeight={600} fill="var(--ink)">
                    {formatNumberFr(b.value)}
                  </text>
                )}
                {i % every === 0 && (
                  <text x={x + w / 2} y={H - 7} textAnchor="middle" fontSize={axisFs} fill="var(--ink-3)">
                    {useShort ? (b.shortLabel ?? b.label) : b.label}
                  </text>
                )}
              </g>
            );
          })}
          {anyGoal ? (
            <g>
              <line x1={L} x2={W - R} y1={y(goal!)} y2={y(goal!)} stroke="var(--sage)" strokeWidth={1.5} strokeDasharray="5 5" />
              <rect x={W - R - goalW} y={y(goal!) - 19} width={goalW} height={18} rx={4} fill="var(--surface)" />
              <text x={W - R - 5} y={y(goal!) - 6} textAnchor="end" fontSize={12} fontWeight={600} fill="var(--sage)">
                {goalText}
              </text>
            </g>
          ) : null}
        </svg>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-2">
        {anyGoal && anyReached && (
          <li className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm bg-go" aria-hidden /> Objectif atteint
          </li>
        )}
        {anyBelow && (
          <li className="flex items-center gap-1.5">
            <span className={`size-3 rounded-sm ${anyGoal ? 'bg-amber' : 'bg-go'}`} aria-hidden /> {anyGoal ? 'Sous l’objectif' : 'Pas'}
          </li>
        )}
        {showCurrent && (
          <li className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm border border-dashed border-petrol bg-petrol-2" aria-hidden /> {currentLabel}
          </li>
        )}
        {anyGoal && (
          <li className="flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-sage" aria-hidden /> Objectif
          </li>
        )}
      </ul>
    </div>
  );
}
