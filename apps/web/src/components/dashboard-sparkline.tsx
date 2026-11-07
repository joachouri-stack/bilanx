'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Petite courbe du tableau de bord (glycémie du capteur sur 24 h, dernières HbA1c).
 * Dessinée en pixels réels (largeur mesurée) ; n'intercepte jamais le défilement vertical.
 */
export function DashboardSparkline({
  points,
  min,
  max,
  band,
  height = 56,
  color = 'var(--glucose)',
  dots = false,
  labels,
  label,
  domain,
  ticks,
  bandLabels,
  lastDot,
  maxGapMs,
}: {
  /** Abscisse (ms ou rang) et valeur. */
  points: { t: number; v: number }[];
  min: number;
  max: number;
  /** Zone cible (valeurs basse et haute), dessinée en fond vert pâle. */
  band?: [number, number];
  height?: number;
  color?: string;
  /** Points marqués (peu de valeurs, ex. HbA1c). */
  dots?: boolean;
  /** Étiquettes de valeur au-dessus de chaque point (même longueur que `points`). */
  labels?: string[];
  /** Description pour les lecteurs d'écran. */
  label: string;
  /** Bornes de l'axe horizontal (sinon : premier et dernier point). */
  domain?: [number, number];
  /** Graduations sous la courbe (ex. mois), aux mêmes abscisses que `points`. */
  ticks?: { t: number; label: string }[];
  /** Valeurs écrites à droite des bords de la zone cible (ex. « 180 », « 70 »). */
  bandLabels?: [string, string];
  /** Couleur du point final (dernière mesure), mise en évidence. */
  lastDot?: string;
  /** Écart au-delà duquel la courbe est coupée (par défaut 45 min, adapté au capteur ; Infinity pour relier des pesées). */
  maxGapMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e!.contentRect.width)));
    ro.observe(el);
    setW(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);

  const top = labels ? 20 : 4;
  const bottom = ticks ? 24 : 4;
  const padX = dots ? 14 : 1;
  const padR = bandLabels ? 30 : padX;
  const H = height + (labels ? 16 : 0) + (ticks ? 20 : 0);
  const t0 = domain?.[0] ?? points[0]?.t ?? 0;
  const t1 = domain?.[1] ?? points.at(-1)?.t ?? 1;
  const x = (t: number) => padX + (t1 === t0 ? (w - padX - padR) / 2 : ((t - t0) / (t1 - t0)) * (w - padX - padR));
  const y = (v: number) => top + (1 - (Math.min(max, Math.max(min, v)) - min) / (max - min)) * (H - top - bottom);
  // Une interruption de plus de 45 min coupe la courbe (rien n'est complété).
  const gap = maxGapMs ?? (dots ? Infinity : 45 * 60_000);
  const d = points.map((p, i) => `${i && p.t - points[i - 1]!.t <= gap ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');

  return (
    <div ref={ref} className="my-2 w-full touch-pan-y" style={{ height: H }}>
      {w > 0 && points.length > 0 && (
        <svg width={w} height={H} role="img" aria-label={label} className="block overflow-visible">
          {ticks?.map((k) => (
            <g key={k.t}>
              <line x1={x(k.t)} x2={x(k.t)} y1={top - 6} y2={H - bottom} stroke="var(--line)" strokeDasharray="2 3" />
              <text x={Math.min(w - 2, Math.max(2, x(k.t)))} y={H - 6} textAnchor={x(k.t) < 20 ? 'start' : x(k.t) > w - 20 ? 'end' : 'middle'} fontSize={12} fill="var(--ink-3)">
                {k.label}
              </text>
            </g>
          ))}
          {band && <rect x={0} y={y(band[1])} width={w - (bandLabels ? padR - 4 : 0)} height={Math.max(0, y(band[0]) - y(band[1]))} fill="var(--sage-2)" rx={4} />}
          {band &&
            bandLabels?.map((l, i) => (
              <text key={l} x={w} y={y(band[1 - i]!) + 4} textAnchor="end" fontSize={11} fill="var(--ink-3)" className="tabular">
                {l}
              </text>
            ))}
          {points.length > 1 && <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {lastDot && points.length > 0 && (
            <circle cx={x(points.at(-1)!.t)} cy={y(points.at(-1)!.v)} r={5} fill={lastDot} stroke="var(--surface)" strokeWidth={2} />
          )}
          {dots &&
            points.map((p, i) => (
              <circle key={i} cx={x(p.t)} cy={y(p.v)} r={i === points.length - 1 ? 4.5 : 3.5} fill={i === points.length - 1 ? color : 'var(--surface)'} stroke={color} strokeWidth={2} />
            ))}
          {labels &&
            points.map((p, i) => (
              <text
                key={i}
                x={Math.min(w - 14, Math.max(14, x(p.t)))}
                y={y(p.v) - 9}
                textAnchor="middle"
                fontSize={13}
                fill="var(--ink-2)"
                className="tabular"
              >
                {labels[i]}
              </text>
            ))}
        </svg>
      )}
    </div>
  );
}
