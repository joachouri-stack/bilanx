import { formatNumberFr } from '@bilanx/domain';
import { ScrollRegion } from './ui';

export interface Bar {
  label: string;
  /** null : pas de donnée (barre absente, jamais 0 inventé). */
  value: number | null;
  title: string;
}

/**
 * Barres de pas avec le nombre exact au-dessus de chaque barre quand la place le permet
 * (sinon au survol). `minWidth` active le défilement horizontal sur petit écran.
 */
export function StepsBars({ bars, goal, minWidth = 0, labelEvery = 1 }: { bars: Bar[]; goal?: number | null; minWidth?: number; labelEvery?: number }) {
  const W = Math.max(760, minWidth);
  const H = 250;
  const L = 44;
  const R = 8;
  const T = 24;
  const B = 28;
  const max = Math.max(goal ?? 0, 1000, ...bars.map((b) => b.value ?? 0));
  const top = Math.ceil(max / 2000) * 2000;
  const bw = (W - L - R) / bars.length;
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const showValues = bw >= 26;
  // Le graphique est réduit à l'affichage : polices plus grandes pour rester lisibles.
  const fs = bw >= 60 ? 15 : bw >= 34 ? 12.5 : 11;
  return (
    <ScrollRegion label="Nombre de pas par période (défilement horizontal)" className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ minWidth: minWidth || undefined }} className="w-full" role="img" aria-label="Nombre de pas">
        {[0, top / 2, top].map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize={12} fill="var(--ink-3)">
              {formatNumberFr(t)}
            </text>
          </g>
        ))}
        {goal ? (
          <g>
            <line x1={L} x2={W - R} y1={y(goal)} y2={y(goal)} stroke="var(--sage)" strokeDasharray="5 5" />
            <text x={L + 4} y={y(goal) - 5} fontSize={12} fill="var(--sage)">
              objectif {formatNumberFr(goal)}
            </text>
          </g>
        ) : null}
        {bars.map((b, i) => {
          const x = L + i * bw + bw * 0.14;
          const w = Math.max(2, bw * 0.72);
          const reached = goal && b.value !== null && b.value >= goal;
          return (
            <g key={i}>
              <title>{b.title}</title>
              {b.value !== null && b.value > 0 && <rect x={x} y={y(b.value)} width={w} height={y(0) - y(b.value)} rx={Math.min(6, w / 3)} fill={reached ? 'var(--sage)' : 'var(--petrol)'} opacity={reached ? 1 : 0.6} />}
              {showValues && b.value !== null && (
                <text x={x + w / 2} y={y(b.value) - 6} textAnchor="middle" fontSize={fs} fontWeight={600} fill="var(--ink)">
                  {formatNumberFr(b.value)}
                </text>
              )}
              {i % labelEvery === 0 && (
                <text x={x + w / 2} y={H - 8} textAnchor="middle" fontSize={bw >= 60 ? 13 : 11.5} fill="var(--ink-3)">
                  {b.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </ScrollRegion>
  );
}
