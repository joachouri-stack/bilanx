/**
 * Anneau de progression (SVG) : `value` de 0 à 1 (au-delà, l'anneau est plein).
 * Décoratif : le chiffre au centre (children) porte l'information pour les lecteurs d'écran.
 */
export function ProgressRing({
  value,
  size = 140,
  stroke = 12,
  color = 'currentColor',
  track = 'rgba(255,255,255,0.22)',
  children,
  className = '',
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        {v > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * v} ${c}`}
            className="transition-[stroke-dasharray] duration-700 ease-out"
          />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}
