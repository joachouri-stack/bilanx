import { glucoseAxisTicks, type AgpHour, type GlucoseUnit } from '@bilanx/domain';

/**
 * Profil glycémique ambulatoire (AGP) : pour chaque heure de la journée, médiane et dispersion de toutes
 * les mesures de la période (percentiles 5–95 et 25–75). Une heure sans assez de mesures reste vide.
 */
export function AgpChart({ agp, unit, targetLow, targetHigh }: { agp: AgpHour[]; unit: GlucoseUnit; targetLow: number; targetHigh: number }) {
  const W = 720;
  const H = 300;
  const PAD = { l: 44, r: 12, t: 12, b: 28 };
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
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Profil glycémique ambulatoire sur 24 heures${missing ? `, ${missing} heure(s) sans données suffisantes` : ''}`}>
        <rect x={PAD.l} y={y(targetHigh)} width={W - PAD.l - PAD.r} height={y(targetLow) - y(targetHigh)} fill="var(--sage-2)" />
        {glucoseAxisTicks(unit)
          .filter((t) => t.mgdl <= maxV)
          // Pas de libellés qui se chevauchent : au moins 22 px entre deux graduations.
          .filter((t, i, all) => i === all.length - 1 || y(t.mgdl) - y(all[i + 1]!.mgdl) >= 22)
          .map((t) => (
            <g key={t.mgdl}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t.mgdl)} y2={y(t.mgdl)} stroke="var(--line)" />
              <text x={PAD.l - 6} y={y(t.mgdl) + 4} textAnchor="end" fontSize={11} fill="var(--ink-3)">
                {t.label}
              </text>
            </g>
          ))}
        {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => (
          <text key={h} x={x(h)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--ink-3)">
            {String(h).padStart(2, '0')} h
          </text>
        ))}
        {segments.map((seg, i) => (
          <g key={i}>
            <polygon points={band(seg, 'p5', 'p95')} fill="var(--glucose)" opacity={0.12} />
            <polygon points={band(seg, 'p25', 'p75')} fill="var(--glucose)" opacity={0.28} />
            <polyline points={seg.map((a) => `${x(a.hour + 0.5)},${y(a.p50!)}`).join(' ')} fill="none" stroke="var(--glucose)" strokeWidth={2.5} strokeLinejoin="round" />
          </g>
        ))}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-glucose" /> médiane
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-glucose opacity-40" /> 50 % des mesures (25–75 %)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-glucose opacity-15" /> 90 % des mesures (5–95 %)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-sage-2 ring-1 ring-line" /> plage cible
        </span>
      </figcaption>
    </figure>
  );
}
