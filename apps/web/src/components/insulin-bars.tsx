'use client';

import { formatNumberFr, type DailyInsulin } from '@bilanx/domain';
import { labelStep, niceTicks, textWidth, useChartWidth } from './steps-bars';

/**
 * Totaux quotidiens d'insuline injectée, empilés lente / rapide / autre, dessinés à la largeur réelle.
 * Le total exact est écrit au-dessus de chaque barre quand la place le permet.
 * Un jour sans saisie reste vide (jamais complété). La dernière barre (aujourd'hui) est légendée.
 */
export function InsulinBars({ days }: { days: DailyInsulin[] }) {
  const { ref, width } = useChartWidth();
  const W = Math.max(240, width);
  const H = 220;
  const L = 34;
  const R = 6;
  const T = 24;
  const B = 26;
  const max = Math.max(10, ...days.map((d) => d.total));
  const ticks = niceTicks(max, 4);
  const top = ticks.at(-1)!;
  const bw = (W - L - R) / Math.max(1, days.length);
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const valueFs = 13;
  const axisFs = 12;
  const longest = Math.max(...days.map((d) => textWidth(formatNumberFr(d.total), valueFs)));
  const showValues = longest + 2 <= bw;
  const fmtDay = (iso: string) => {
    const [, m, d] = iso.split('-');
    return `${Number(d)}/${Number(m)}`;
  };
  const every = labelStep(days.length, bw, textWidth('30/10', axisFs));
  const last = days.length - 1;
  const hasOther = days.some((d) => d.other > 0);
  return (
    <div>
      <div ref={ref} className="w-full touch-pan-y">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full" role="img" aria-label="Unités d’insuline injectées par jour">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" />
              <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize={axisFs} fill="var(--ink-3)">
                {formatNumberFr(t)}
              </text>
            </g>
          ))}
          {days.map((d, i) => {
            const x = L + i * bw + bw * 0.15;
            const w = Math.max(2, bw * 0.7);
            let acc = 0;
            const seg = (v: number, color: string, key: string) => {
              if (!v) return null;
              const el = <rect key={key} x={x} y={y(acc + v)} width={w} height={y(acc) - y(acc + v)} fill={color} rx={2} opacity={i === last ? 0.55 : 1} />;
              acc += v;
              return el;
            };
            // Les libellés sont alignés à partir de la fin (aujourd'hui toujours visible).
            const showLabel = (last - i) % every === 0;
            return (
              <g key={d.date}>
                <title>{`${fmtDay(d.date)} : ${formatNumberFr(d.total)} U (rapide ${formatNumberFr(d.rapid)}, lente ${formatNumberFr(d.long)}${d.other ? `, autre ${formatNumberFr(d.other)}` : ''})`}</title>
                {seg(d.long, 'var(--petrol)', 'l')}
                {seg(d.rapid, 'var(--violet)', 'r')}
                {seg(d.other, 'var(--ink-3)', 'o')}
                {showValues && d.total > 0 && (
                  <text x={x + w / 2} y={y(d.total) - 6} textAnchor="middle" fontSize={valueFs} fontWeight={600} fill="var(--ink)">
                    {formatNumberFr(d.total)}
                  </text>
                )}
                {showLabel && (
                  <text x={x + w / 2} y={H - 7} textAnchor="middle" fontSize={axisFs} fontWeight={i === last ? 600 : 400} fill={i === last ? 'var(--ink)' : 'var(--ink-3)'}>
                    {i === last && bw >= textWidth('auj.', axisFs) + 4 ? 'auj.' : fmtDay(d.date)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-2">
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-violet" aria-hidden /> Rapide
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-petrol" aria-hidden /> Lente
        </li>
        {hasOther && (
          <li className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm bg-ink-3" aria-hidden /> Autre
          </li>
        )}
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-petrol opacity-[0.55]" aria-hidden /> auj. : aujourd’hui (journée en cours)
        </li>
      </ul>
    </div>
  );
}
