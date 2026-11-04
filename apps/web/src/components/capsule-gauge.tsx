import { GAUGE_RANGE_HIGH, GAUGE_RANGE_LOW, formatNumberFr, gaugePosition } from '@bilanx/domain';

/**
 * Jauge « capsule » : l'intervalle de référence du laboratoire occupe 30 → 70 %
 * de la hauteur. Le repère indique une POSITION, pas un niveau de réserve.
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
  const W = 104;
  const H = 150;
  const cw = 34;
  const x0 = (W - cw) / 2;
  const top = 3;
  const y = (p: number) => top + H * (1 - p);
  if (!g) {
    return (
      <div className="grid h-[156px] w-[104px] place-items-center text-center text-xs text-ink-3">Intervalle de référence non renseigné</div>
    );
  }
  const color = g.status === 'within' ? 'var(--sage)' : 'var(--amber)';
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

  return (
    <svg width={W} height={H + 6} viewBox={`0 0 ${W} ${H + 6}`} role="img" aria-label={`${label} : position par rapport à l'intervalle du laboratoire`}>
      <defs>
        <clipPath id={clipId}>
          <rect x={x0} y={top} width={cw} height={H} rx={cw / 2} />
        </clipPath>
      </defs>
      <rect x={x0} y={top} width={cw} height={H} rx={cw / 2} fill="var(--surface-2)" stroke="var(--line)" />
      <rect x={x0} y={y(bandTo)} width={cw} height={H * (bandTo - bandFrom)} fill="var(--sage-2)" clipPath={`url(#${clipId})`} />
      <rect x={x0} y={y(g.position)} width={cw} height={H * g.position} fill={color} opacity={0.85} clipPath={`url(#${clipId})`} />
      {bounds.map(([p, v]) => (
        <g key={p}>
          <line x1={x0 - 4} x2={x0 + cw + 4} y1={y(p)} y2={y(p)} stroke="var(--ink-3)" />
          <text x={x0 + cw + 6} y={y(p) + 4} fontSize={10} fill="var(--ink-3)">
            {v != null ? formatNumberFr(v) : ''}
          </text>
        </g>
      ))}
      <path d={`M${x0 - 9},${y(g.position) - 5} l7,5 l-7,5z`} fill="var(--ink)" />
      {g.clamped && (
        <text x={W / 2} y={g.position > 0.5 ? top + 12 : top + H - 4} fontSize={9} textAnchor="middle" fill="var(--ink)">
          hors échelle
        </text>
      )}
    </svg>
  );
}
