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
  const bottom = 4;
  const padX = dots ? 10 : 1;
  const H = height + (labels ? 16 : 0);
  const t0 = points[0]?.t ?? 0;
  const t1 = points.at(-1)?.t ?? 1;
  const x = (t: number) => padX + (t1 === t0 ? (w - 2 * padX) / 2 : ((t - t0) / (t1 - t0)) * (w - 2 * padX));
  const y = (v: number) => top + (1 - (Math.min(max, Math.max(min, v)) - min) / (max - min)) * (H - top - bottom);
  // Une interruption de plus de 45 min coupe la courbe (rien n'est complété).
  const gap = dots ? Infinity : 45 * 60_000;
  const d = points.map((p, i) => `${i && p.t - points[i - 1]!.t <= gap ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');

  return (
    <div ref={ref} className="my-2 w-full touch-pan-y" style={{ height: H }}>
      {w > 0 && points.length > 0 && (
        <svg width={w} height={H} role="img" aria-label={label} className="block overflow-visible">
          {band && <rect x={0} y={y(band[1])} width={w} height={Math.max(0, y(band[0]) - y(band[1]))} fill="var(--sage-2)" rx={4} />}
          {points.length > 1 && <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
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
