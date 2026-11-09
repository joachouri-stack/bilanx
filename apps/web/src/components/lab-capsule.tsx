import { gaugePosition, GAUGE_RANGE_HIGH, GAUGE_RANGE_LOW, labLevel, LAB_LEVEL_LABEL_FR, type LabLevel } from '@bilanx/domain';

/** Couleurs des trois niveaux (bon · moyen · à revoir) et du cas sans référence. */
export const LEVEL_COLORS: Record<LabLevel, { stroke: string; fill: string; chip: string; dot: string }> = {
  good: { stroke: 'var(--go)', fill: 'var(--go)', chip: 'bg-sage-2 text-go', dot: 'bg-go' },
  fair: { stroke: 'var(--amber)', fill: 'var(--amber)', chip: 'bg-amber-2 text-amber', dot: 'bg-amber' },
  poor: { stroke: 'var(--red)', fill: 'var(--red)', chip: 'bg-red-2 text-red', dot: 'bg-red' },
  unknown: { stroke: 'var(--ink-3)', fill: 'var(--ink-3)', chip: 'bg-surface-2 text-ink-2', dot: 'bg-ink-3' },
};

export function LevelChip({ level }: { level: LabLevel }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${LEVEL_COLORS[level].chip}`}>
      <span className={`size-1.5 rounded-full ${LEVEL_COLORS[level].dot}`} aria-hidden />
      {LAB_LEVEL_LABEL_FR[level]}
    </span>
  );
}

/**
 * Capsule verticale, dans l'esprit du logo BILANX : remplie depuis le bas jusqu'au résultat,
 * barre horizontale au niveau du résultat, zone teintée = valeurs de référence du laboratoire
 * (toujours entre 30 et 70 % de la hauteur). Un petit trait à gauche rappelle le résultat précédent.
 */
export function LabCapsule({
  value,
  refLow,
  refHigh,
  previous,
  label,
  size = 'md',
}: {
  value: number;
  refLow: number | null | undefined;
  refHigh: number | null | undefined;
  /** Résultat précédent dans la même unité (repère discret). */
  previous?: number | null;
  label: string;
  size?: 'sm' | 'md';
}) {
  const range = { low: refLow, high: refHigh };
  const g = gaugePosition(value, range);
  const level = labLevel(value, range);
  const c = LEVEL_COLORS[level];
  const cw = size === 'sm' ? 16 : 26;
  const H = size === 'sm' ? 46 : 76;
  const bar = size === 'sm' ? 6 : 8; // dépassement de la barre de chaque côté
  const W = cw + bar * 2 + 2;
  const x0 = bar + 1;
  const top = 3;
  const SH = H + top * 2;
  const y = (p: number) => top + H * (1 - p);
  const id = `lc-${label.replace(/\W/g, '')}-${size}`;

  if (!g) {
    // Sans valeurs de référence : capsule vide, en pointillés.
    return (
      <svg width={W} height={SH} viewBox={`0 0 ${W} ${SH}`} role="img" aria-label={`${label} : sans valeurs de référence`} className="shrink-0">
        <rect x={x0} y={top} width={cw} height={H} rx={cw / 2} fill="var(--surface-2)" stroke="var(--line)" strokeWidth={1.5} strokeDasharray="3 3" />
      </svg>
    );
  }
  const bandFrom = g.partialRange && refHigh != null ? 0 : GAUGE_RANGE_LOW;
  const bandTo = g.partialRange && refLow != null ? 1 : GAUGE_RANGE_HIGH;
  const my = y(g.position);
  const prev = previous != null ? gaugePosition(previous, range) : null;

  return (
    <svg
      width={W}
      height={SH}
      viewBox={`0 0 ${W} ${SH}`}
      role="img"
      aria-label={`${label} : ${LAB_LEVEL_LABEL_FR[level].toLowerCase()} par rapport aux valeurs de référence du laboratoire`}
      className="shrink-0"
    >
      <defs>
        <clipPath id={id}>
          <rect x={x0} y={top} width={cw} height={H} rx={cw / 2} />
        </clipPath>
      </defs>
      <rect x={x0} y={top} width={cw} height={H} rx={cw / 2} fill="var(--surface-2)" />
      {/* Valeurs de référence du laboratoire. */}
      <rect x={x0} y={y(bandTo)} width={cw} height={H * (bandTo - bandFrom)} fill="var(--sage-2)" clipPath={`url(#${id})`} />
      {/* Remplissage jusqu'au résultat, couleur du niveau. */}
      <rect x={x0} y={my} width={cw} height={top + H - my} fill={c.fill} fillOpacity={0.55} clipPath={`url(#${id})`} />
      <rect x={x0} y={top} width={cw} height={H} rx={cw / 2} fill="none" stroke={c.stroke} strokeWidth={2} />
      {prev && <line x1={x0 - bar + 1} x2={x0 - 2} y1={y(prev.position)} y2={y(prev.position)} stroke="var(--ink-3)" strokeWidth={2} strokeLinecap="round" />}
      {/* Barre du résultat, comme sur le logo. */}
      <line x1={x0 - bar + 1} x2={x0 + cw + bar - 1} y1={my} y2={my} stroke="var(--ink)" strokeWidth={2.5} strokeLinecap="round" />
    </svg>
  );
}
