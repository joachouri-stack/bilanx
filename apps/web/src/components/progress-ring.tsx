'use client';

import { useEffect, useId, useState } from 'react';

/**
 * Anneau de progression (SVG) : `value` de 0 à 1 (au-delà, l'anneau est plein).
 * Remplissage animé à l'affichage ; dégradé de couleurs ; décoratif (le chiffre au centre porte l'information).
 */
export function ProgressRing({
  value,
  size = 140,
  stroke = 12,
  colors = ['#34d399', '#22d3ee'],
  track = 'var(--surface-2)',
  children,
  className = '',
}: {
  value: number;
  size?: number;
  stroke?: number;
  /** Début et fin du dégradé. */
  colors?: [string, string];
  track?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const target = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const [v, setV] = useState(0);
  useEffect(() => {
    const t = window.setTimeout(() => setV(target), 60);
    return () => window.clearTimeout(t);
  }, [target]);
  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={colors[0]} />
            <stop offset="100%" stopColor={colors[1]} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#g${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`}
          style={{ transition: 'stroke-dasharray 900ms cubic-bezier(.2,.8,.2,1)', opacity: v > 0 ? 1 : 0 }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}
