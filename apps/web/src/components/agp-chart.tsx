'use client';

import { useEffect, useRef, useState } from 'react';
import { formatGlucose, glucoseAxisTicks, type AgpHour, type GlucoseUnit } from '@bilanx/domain';

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
  // Graduation du haut de l'échelle (ex. 400) quand les valeurs dépassent les graduations habituelles.
  const top = glucoseAxisTicks(unit).every((t) => t.mgdl < maxV) ? [{ mgdl: maxV, label: formatGlucose(maxV, unit) }] : [];
  for (const t of [...top, ...glucoseAxisTicks(unit).filter((t) => t.mgdl <= maxV).reverse()]) {
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
        <defs>
          {/* Médiane colorée selon la zone : vert dans la cible, orange au-dessus de 180 ou sous 70, rouge au-delà de 250 / sous 54. */}
          <linearGradient id="agp-zone" gradientUnits="userSpaceOnUse" x1={0} x2={0} y1={y(maxV)} y2={y(0)}>
            {(
              [
                [maxV, '#f87171'],
                [250, '#f87171'],
                [250, '#fbbf24'],
                [targetHigh, '#fbbf24'],
                [targetHigh, '#34d399'],
                [targetLow, '#34d399'],
                [targetLow, '#fbbf24'],
                [54, '#fbbf24'],
                [54, '#f87171'],
                [0, '#f87171'],
              ] as const
            ).map(([v, c], i) => (
              <stop key={i} offset={Math.max(0, Math.min(1, (y(Math.min(v, maxV)) - y(maxV)) / (y(0) - y(maxV))))} stopColor={c} />
            ))}
          </linearGradient>
        </defs>
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
            <polygon points={band(seg, 'p5', 'p95')} fill="var(--glucose)" opacity={0.1} />
            <polygon points={band(seg, 'p25', 'p75')} fill="var(--glucose)" opacity={0.22} />
            <polyline points={seg.map((a) => `${x(a.hour + 0.5)},${y(a.p50!)}`).join(' ')} fill="none" stroke="url(#agp-zone)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
          </g>
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-2">
        <span className="flex items-center gap-1.5">
          <span className="h-1 w-5 shrink-0 rounded-full bg-[linear-gradient(90deg,#34d399,#fbbf24,#f87171)]" aria-hidden /> valeur habituelle
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 shrink-0 rounded-sm bg-glucose opacity-30" aria-hidden /> écart habituel
        </span>
      </figcaption>
    </figure>
  );
}
