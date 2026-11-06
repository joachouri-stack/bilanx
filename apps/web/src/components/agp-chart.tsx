'use client';

import { useEffect, useRef, useState } from 'react';
import { glucoseAxisTicks, type AgpHour, type GlucoseUnit } from '@bilanx/domain';

/**
 * Profil glycémique ambulatoire (AGP) : pour chaque heure de la journée, valeur habituelle (médiane) et
 * dispersion de toutes les mesures de la période (25–75 % et 5–95 %). Une heure sans assez de mesures
 * reste vide. Dessiné à la largeur réelle de son conteneur (textes lisibles sur téléphone).
 */
export function AgpChart({ agp, unit, targetLow, targetHigh }: { agp: AgpHour[]; unit: GlucoseUnit; targetLow: number; targetHigh: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(720);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && e.contentRect.width > 0 && setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = W < 500 ? 240 : 300;
  const PAD = { l: 46, r: 10, t: 12, b: 30 };
  // Échelle adaptée aux valeurs (au moins jusqu'à 250 mg/dL), arrondie à 50.
  const maxV = Math.ceil(Math.max(250, ...agp.map((a) => (a.p95 ?? 0) + 10)) / 50) * 50;
  const x = (h: number) => PAD.l + (h / 24) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - Math.min(v, maxV) / maxV) * (H - PAD.t - PAD.b);
  // Points au milieu de chaque heure ; une heure manquante coupe les tracés (pas d'interpolation).
  const segments: AgpHour[][] = [];
  let cur: AgpHour[] = [];
  for (const a of agp) {
    if (a.p50 === null) {
      if (cur.length) segments.push(cur);
      cur = [];
    } else cur.push(a);
  }
  if (cur.length) segments.push(cur);
  const band = (seg: AgpHour[], lo: keyof AgpHour, hi: keyof AgpHour) =>
    seg.map((a) => `${x(a.hour + 0.5)},${y(a[hi] as number)}`).join(' ') + ' ' + [...seg].reverse().map((a) => `${x(a.hour + 0.5)},${y(a[lo] as number)}`).join(' ');
  const missing = agp.filter((a) => a.p50 === null).length;
  // Pas de libellés qui se chevauchent : au moins 20 px entre deux graduations.
  const yTicks: { mgdl: number; label: string }[] = [];
  for (const t of glucoseAxisTicks(unit).filter((t) => t.mgdl <= maxV).reverse()) {
    const prev = yTicks.at(-1);
    if (!prev || y(t.mgdl) - y(prev.mgdl) >= 20) yTicks.push(t);
  }
  const hours = W < 420 ? [0, 6, 12, 18, 24] : [0, 3, 6, 9, 12, 15, 18, 21, 24];

  return (
    <figure ref={box} className="min-w-0">
      <svg
        width={W}
        height={H}
        className="block max-w-full touch-pan-y"
        role="img"
        aria-label={`Profil glycémique ambulatoire sur 24 heures${missing ? `, ${missing} heure${missing > 1 ? 's' : ''} sans assez de mesures` : ''}`}
      >
        <rect x={PAD.l} y={y(targetHigh)} width={W - PAD.l - PAD.r} height={y(targetLow) - y(targetHigh)} fill="var(--sage-2)" />
        {yTicks.map((t) => (
          <g key={t.mgdl}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t.mgdl)} y2={y(t.mgdl)} stroke="var(--line)" />
            <text x={PAD.l - 6} y={y(t.mgdl) + 4} textAnchor="end" fontSize={12} fill="var(--ink-3)">
              {t.label}
            </text>
          </g>
        ))}
        {hours.map((h) => (
          <text key={h} x={x(h)} y={H - 9} textAnchor={h === 0 ? 'start' : h === 24 ? 'end' : 'middle'} fontSize={12} fill="var(--ink-3)">
            {h} h
          </text>
        ))}
        {segments.map((seg, i) => (
          <g key={i}>
            <polygon points={band(seg, 'p5', 'p95')} fill="var(--glucose)" opacity={0.14} />
            <polygon points={band(seg, 'p25', 'p75')} fill="var(--glucose)" opacity={0.3} />
            <polyline points={seg.map((a) => `${x(a.hour + 0.5)},${y(a.p50!)}`).join(' ')} fill="none" stroke="var(--glucose)" strokeWidth={2.5} strokeLinejoin="round" />
          </g>
        ))}
      </svg>
      <figcaption className="mt-2 grid grid-cols-1 gap-x-5 gap-y-1.5 text-sm text-ink-2 sm:flex sm:flex-wrap">
        <span className="flex items-center gap-2">
          <span className="h-0.5 w-5 shrink-0 bg-glucose" aria-hidden /> valeur habituelle (médiane)
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3.5 shrink-0 rounded-sm bg-glucose opacity-40" aria-hidden /> la moitié des mesures
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3.5 shrink-0 rounded-sm bg-glucose opacity-15" aria-hidden /> presque toutes les mesures (9 sur 10)
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3.5 shrink-0 rounded-sm bg-sage-2 ring-1 ring-line" aria-hidden /> plage cible
        </span>
      </figcaption>
    </figure>
  );
}
