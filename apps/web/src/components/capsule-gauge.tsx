import { GAUGE_RANGE_HIGH, GAUGE_RANGE_LOW, formatNumberFr, gaugePosition } from '@bilanx/domain';

/**
 * Jauge « capsule » : les valeurs de référence du laboratoire occupent 30 → 70 % de la hauteur (bande verte).
 * Le repère indique une POSITION, pas un niveau de réserve : remplissage léger (contour) pour ne pas inquiéter.
 */
export function CapsuleGauge({
  value,
  refLow,
  refHigh,
  label,
}: {
  value: number;
  refLow: number | null | undefined;
  refHigh: number | null | undefined;
  label: string;
}) {
  const g = gaugePosition(value, { low: refLow, high: refHigh });
  const W = 132;
  const H = 156;
  const cw = 36;
  const x0 = 34;
  const top = 6;
  const y = (p: number) => top + H * (1 - p);
  if (!g) {
    return <div className="grid h-[168px] w-[132px] place-items-center text-center text-sm text-ink-3">Sans valeurs de référence</div>;
  }
  const within = g.status === 'within';
  const clipId = `cap-${label.replace(/\W/g, '')}`;
  const bounds: [number, number | null | undefined][] = g.partialRange
    ? refHigh != null
      ? [[GAUGE_RANGE_HIGH, refHigh]]
      : [[GAUGE_RANGE_LOW, refLow]]
    : [
        [GAUGE_RANGE_HIGH, refHigh],
        [GAUGE_RANGE_LOW, refLow],
      ];
  const bandFrom = g.partialRange && refHigh != null ? 0 : GAUGE_RANGE_LOW;
  const bandTo = g.partialRange && refLow != null ? 1 : GAUGE_RANGE_HIGH;
  const my = y(g.position);
  const SH = H + (g.clamped ? 30 : 12);

  return (
    <svg width={W} height={SH} viewBox={`0 0 ${W} ${SH}`} role="img" aria-label={`${label} : position du résultat par rapport aux valeurs de référence du laboratoire`}>
      <defs>
        <clipPath id={clipId}>
          <rect x={x0} y={top} width={cw} height={H} rx={cw / 2} />
        </clipPath>
      </defs>
      <rect x={x0} y={top} width={cw} height={H} rx={cw / 2} fill="var(--surface-2)" />
      {/* Valeurs de référence : bande verte. */}
      <rect x={x0} y={y(bandTo)} width={cw} height={H * (bandTo - bandFrom)} fill="var(--sage-2)" clipPath={`url(#${clipId})`} />
      {/* Résultat : remplissage léger avec contour, jamais un bloc plein. */}
      <rect
        x={x0}
        y={my}
        width={cw}
        height={H * g.position}
        fill={within ? 'var(--sage)' : 'var(--amber-2)'}
        fillOpacity={within ? 0.22 : 0.9}
        stroke={within ? 'var(--sage)' : 'var(--amber)'}
        strokeWidth={2}
        clipPath={`url(#${clipId})`}
      />
      <rect x={x0} y={top} width={cw} height={H} rx={cw / 2} fill="none" stroke="var(--line)" strokeWidth={1.5} />
      {bounds.map(([p, v]) => (
        <g key={p}>
          <line x1={x0 - 3} x2={x0 + cw + 3} y1={y(p)} y2={y(p)} stroke="var(--sage)" strokeWidth={1.5} strokeDasharray="3 2" />
          <text x={x0 + cw + 8} y={y(p) + 4} fontSize={12} fill="var(--ink-2)" className="tabular">
            {v != null ? formatNumberFr(v) : ''}
          </text>
        </g>
      ))}
      {/* Repère du résultat : trait épais + flèche. */}
      <line x1={x0 - 2} x2={x0 + cw + 2} y1={my} y2={my} stroke="var(--ink)" strokeWidth={3} strokeLinecap="round" />
      <path d={`M${x0 - 16},${my - 7} l11,7 l-11,7z`} fill="var(--ink)" />
      {g.clamped && (
        <text x={x0 + cw / 2} y={top + H + 22} fontSize={12} textAnchor="middle" fill="var(--ink-2)">
          hors échelle
        </text>
      )}
    </svg>
  );
}
