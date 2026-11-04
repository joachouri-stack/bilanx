import { formatNumberFr, type DailyInsulin } from '@bilanx/domain';

/**
 * Totaux quotidiens d'insuline injectée, empilés rapide / lente / autre.
 * Le total exact est écrit au-dessus de chaque barre quand la place le permet.
 * Un jour sans saisie reste vide (jamais complété).
 */
export function InsulinBars({ days }: { days: DailyInsulin[] }) {
  const W = 760;
  const H = 240;
  const L = 34;
  const R = 8;
  const T = 22;
  const B = 28;
  const max = Math.max(10, ...days.map((d) => d.total));
  const top = Math.ceil(max / 10) * 10;
  const bw = (W - L - R) / days.length;
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const showValues = bw >= 22;
  const labelEvery = days.length <= 14 ? 1 : days.length <= 31 ? 3 : 10;
  const fmtDay = (iso: string) => {
    const [, m, d] = iso.split('-');
    return `${Number(d)}/${Number(m)}`;
  };
  const ticks = [0, top / 2, top];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Unités d’insuline injectées par jour">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" />
          <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize={10.5} fill="var(--ink-3)">
            {t}
          </text>
        </g>
      ))}
      {days.map((d, i) => {
        const x = L + i * bw + bw * 0.15;
        const w = Math.max(2, bw * 0.7);
        let acc = 0;
        const seg = (v: number, color: string, key: string) => {
          if (!v) return null;
          const el = <rect key={key} x={x} y={y(acc + v)} width={w} height={y(acc) - y(acc + v)} fill={color} rx={2} />;
          acc += v;
          return el;
        };
        return (
          <g key={d.date}>
            <title>{`${fmtDay(d.date)} : ${formatNumberFr(d.total)} U (rapide ${formatNumberFr(d.rapid)}, lente ${formatNumberFr(d.long)}${d.other ? `, autre ${formatNumberFr(d.other)}` : ''})`}</title>
            {seg(d.long, 'var(--petrol)', 'l')}
            {seg(d.rapid, 'var(--violet)', 'r')}
            {seg(d.other, 'var(--ink-3)', 'o')}
            {showValues && d.total > 0 && (
              <text x={x + w / 2} y={y(d.total) - 5} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--ink)">
                {formatNumberFr(d.total)}
              </text>
            )}
            {i % labelEvery === 0 && (
              <text x={x + w / 2} y={H - 9} textAnchor="middle" fontSize={10.5} fill="var(--ink-3)">
                {fmtDay(d.date)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
