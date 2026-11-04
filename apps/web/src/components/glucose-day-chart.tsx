'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { glucoseForDisplay, splitIntoSegments, type GlucoseUnit } from '@bilanx/domain';

export interface ChartPoint {
  t: number; // ms UTC
  v: number; // mg/dL
}
export interface ChartEvent {
  t: number;
  kind: 'meal' | 'injection' | 'activity' | 'note' | 'stress' | 'sleep' | 'illness' | 'symptom' | 'medication' | 'other';
  label: string;
  detail: string;
}

interface Props {
  dayStart: number;
  dayEnd: number;
  timeZone: string;
  unit: GlucoseUnit;
  sensor: ChartPoint[];
  capillary: ChartPoint[];
  events: ChartEvent[];
  targetLow: number;
  targetHigh: number;
  veryLow: number;
}

const EVENT_ICON: Record<ChartEvent['kind'], string> = {
  meal: '🍽',
  injection: '💉',
  activity: '🚶',
  note: '📝',
  stress: '😮‍💨',
  sleep: '😴',
  illness: '🤒',
  symptom: '🩺',
  medication: '💊',
  other: '📝',
};
const H = 400;
const PAD = { l: 48, r: 16, t: 12, b: 98 };
const Y_MAX = 300; // mg/dL ; les valeurs supérieures restent tracées en haut (rares)

/**
 * Graphique 24 h : zoom (molette, pincement, boutons), déplacement (glisser),
 * infobulle au survol/toucher, courbe interrompue en cas de trou de données,
 * pistes séparées pour le journal et l'insuline.
 */
export function GlucoseDayChart(p: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(800);
  const span = p.dayEnd - p.dayStart;
  const [view, setView] = useState<[number, number]>([p.dayStart, p.dayEnd]);
  const [hover, setHover] = useState<{ x: number; y: number; html: string; px: number; py: number } | null>(null);
  const drag = useRef<{ x: number; v: [number, number] } | null>(null);
  const pinch = useRef<{ d: number; v: [number, number] } | null>(null);
  const pointers = useRef(new Map<number, number>());

  useEffect(() => setView([p.dayStart, p.dayEnd]), [p.dayStart, p.dayEnd]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const plotW = Math.max(100, width - PAD.l - PAD.r);
  const plotH = H - PAD.t - PAD.b;
  const x = useCallback((t: number) => PAD.l + ((t - view[0]) / (view[1] - view[0])) * plotW, [view, plotW]);
  const y = (mgdl: number) => PAD.t + plotH - (Math.min(mgdl, Y_MAX) / Y_MAX) * plotH;
  const fmtTime = useMemo(
    () => new Intl.DateTimeFormat('fr-FR', { timeZone: p.timeZone, hour: '2-digit', minute: '2-digit' }),
    [p.timeZone],
  );
  const disp = (v: number) => String(glucoseForDisplay(v, p.unit)).replace('.', ',');

  const zoomAround = (centerT: number, factor: number) => {
    const cur = view[1] - view[0];
    const next = Math.min(span, Math.max(3_600_000, cur * factor));
    const f = (centerT - view[0]) / cur;
    let a = centerT - f * next;
    a = Math.max(p.dayStart, Math.min(p.dayEnd - next, a));
    setView([a, a + next]);
  };
  const tAtClientX = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    return view[0] + ((clientX - r.left - PAD.l) / plotW) * (view[1] - view[0]);
  };

  // Molette : listener non passif pour empêcher le défilement de la page.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAround(tAtClientX(e.clientX), e.deltaY > 0 ? 1.2 : 1 / 1.2);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, e.clientX);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [number, number];
      pinch.current = { d: Math.abs(a - b), v: view };
      drag.current = null;
    } else drag.current = { x: e.clientX, v: view };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag.current = null;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, e.clientX);
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [number, number];
      const d = Math.max(10, Math.abs(a - b));
      const cur = pinch.current.v[1] - pinch.current.v[0];
      const next = Math.min(span, Math.max(3_600_000, (cur * pinch.current.d) / d));
      const c = (pinch.current.v[0] + pinch.current.v[1]) / 2;
      const s = Math.max(p.dayStart, Math.min(p.dayEnd - next, c - next / 2));
      setView([s, s + next]);
      return;
    }
    if (drag.current && (e.buttons === 1 || e.pointerType === 'touch') && view[1] - view[0] < span) {
      const cur = drag.current.v[1] - drag.current.v[0];
      const dt = (-(e.clientX - drag.current.x) / plotW) * cur;
      const s = Math.max(p.dayStart, Math.min(p.dayEnd - cur, drag.current.v[0] + dt));
      setView([s, s + cur]);
    }
    // Infobulle : mesure la plus proche
    const t = tAtClientX(e.clientX);
    let best: ChartPoint | undefined;
    for (const pt of p.sensor) if (!best || Math.abs(pt.t - t) < Math.abs(best.t - t)) best = pt;
    const r = ref.current!.getBoundingClientRect();
    if (!best || Math.abs(best.t - t) > 20 * 60_000 || e.clientY - r.top > PAD.t + plotH) return setHover(null);
    setHover({
      x: e.clientX - r.left,
      y: e.clientY - r.top,
      px: x(best.t),
      py: y(best.v),
      html: `${fmtTime.format(best.t)} · ${disp(best.v)} ${p.unit}`,
    });
  };

  // Graduations horaires lisibles selon le niveau de zoom
  const viewH = (view[1] - view[0]) / 3_600_000;
  const stepH = viewH > 12 ? 3 : viewH > 6 ? 1 : viewH > 2 ? 0.5 : 0.25;
  const ticks: number[] = [];
  const firstTick = p.dayStart + Math.ceil((view[0] - p.dayStart) / (stepH * 3_600_000)) * stepH * 3_600_000;
  for (let t = firstTick; t <= view[1] + 1; t += stepH * 3_600_000) ticks.push(t);

  const yTicks = p.unit === 'mg/dL' ? [54, 70, 100, 140, 180, 250, 300] : [3, 3.9, 5.5, 7.8, 10, 13.9];
  const yTickPos = (v: number) => (p.unit === 'mg/dL' ? v : v * 18.016);
  const segments = splitIntoSegments(p.sensor.map((s) => ({ at: new Date(s.t), v: s.v })));
  const inView = (t: number) => t >= view[0] && t <= view[1];
  const eventY = PAD.t + plotH + 40;
  const insulinY = eventY + 28;
  const zoomed = view[1] - view[0] < span;

  return (
    <div>
      <div className="mb-2 flex justify-end gap-1.5">
        <button type="button" className="min-h-9 rounded-lg border border-line px-3 text-sm" onClick={() => zoomAround((view[0] + view[1]) / 2, 1 / 1.5)} aria-label="Zoomer">
          ＋
        </button>
        <button type="button" className="min-h-9 rounded-lg border border-line px-3 text-sm" onClick={() => zoomAround((view[0] + view[1]) / 2, 1.5)} aria-label="Dézoomer">
          －
        </button>
        <button type="button" disabled={!zoomed} className="min-h-9 rounded-lg border border-line px-3 text-sm disabled:opacity-40" onClick={() => setView([p.dayStart, p.dayEnd])}>
          Journée entière
        </button>
      </div>
      <div className="relative">
      <svg
        ref={ref}
        width="100%"
        height={H}
        className="touch-none select-none"
        role="img"
        aria-label={`Courbe glycémique de la journée : ${p.sensor.length} mesures du capteur`}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHover(null)}
        onDoubleClick={() => setView([p.dayStart, p.dayEnd])}
      >
        <defs>
          <clipPath id="plot">
            <rect x={PAD.l} y={0} width={plotW} height={H} />
          </clipPath>
        </defs>
        <rect x={PAD.l} y={y(p.targetHigh)} width={plotW} height={y(p.targetLow) - y(p.targetHigh)} fill="var(--sage-2)" />
        {[p.targetLow, p.targetHigh].map((v) => (
          <line key={v} x1={PAD.l} x2={PAD.l + plotW} y1={y(v)} y2={y(v)} stroke="var(--sage)" strokeDasharray="4 4" />
        ))}
        <line x1={PAD.l} x2={PAD.l + plotW} y1={y(p.veryLow)} y2={y(p.veryLow)} stroke="var(--red)" strokeDasharray="2 4" strokeOpacity={0.6} />
        {yTicks.map((v) => (
          <text key={v} x={PAD.l - 8} y={y(yTickPos(v)) + 4} textAnchor="end" fontSize={11} fill="var(--ink-3)">
            {String(v).replace('.', ',')}
          </text>
        ))}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={PAD.t} y2={PAD.t + plotH} stroke="var(--line)" />
            <text x={x(t)} y={PAD.t + plotH + 16} textAnchor="middle" fontSize={11} fill="var(--ink-3)">
              {fmtTime.format(Math.min(t, p.dayEnd - 1)).replace('23:59', '24:00')}
            </text>
          </g>
        ))}
        <g clipPath="url(#plot)">
          {segments.map((seg, i) => (
            <path
              key={i}
              d={seg.map((s, j) => `${j ? 'L' : 'M'}${x(s.at.getTime()).toFixed(1)},${y(s.v).toFixed(1)}`).join('')}
              fill="none"
              stroke="var(--glucose)"
              strokeWidth={2.2}
              strokeLinejoin="round"
            />
          ))}
          {viewH < 8 && p.sensor.filter((s) => inView(s.t)).map((s) => <circle key={s.t} cx={x(s.t)} cy={y(s.v)} r={2.4} fill="var(--glucose)" />)}
          {p.capillary.map((c) => (
            <rect key={c.t} x={x(c.t) - 5} y={y(c.v) - 5} width={10} height={10} transform={`rotate(45 ${x(c.t)} ${y(c.v)})`} fill="var(--surface)" stroke="var(--ink-2)" strokeWidth={1.8}>
              <title>{`${fmtTime.format(c.t)} · ${disp(c.v)} ${p.unit} — mesure capillaire`}</title>
            </rect>
          ))}
        </g>
        {[
          [eventY, 'Journal'],
          [insulinY, 'Insuline'],
        ].map(([yy, l]) => (
          <g key={l}>
            <text x={PAD.l - 8} y={(yy as number) + 4} textAnchor="end" fontSize={10.5} fill="var(--ink-3)">
              {l}
            </text>
            <line x1={PAD.l} x2={PAD.l + plotW} y1={yy} y2={yy} stroke="var(--line)" />
          </g>
        ))}
        {p.events.filter((e) => inView(e.t)).map((e) => (
          <text key={`${e.kind}-${e.t}`} x={x(e.t)} y={(e.kind === 'injection' ? insulinY : eventY) + 6} textAnchor="middle" fontSize={16}>
            <title>{`${fmtTime.format(e.t)} · ${e.label} — ${e.detail}`}</title>
            {EVENT_ICON[e.kind]}
          </text>
        ))}
        {hover && (
          <g pointerEvents="none">
            <line x1={hover.px} x2={hover.px} y1={PAD.t} y2={PAD.t + plotH} stroke="var(--ink-3)" opacity={0.6} />
            <circle cx={hover.px} cy={hover.py} r={5} fill="var(--glucose)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hover && (
        <div
          className="pointer-events-none absolute z-10 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-[12.5px] text-bg"
          style={{ left: Math.min(hover.x + 14, width - 170), top: hover.y + 10 }}
        >
          <strong>{hover.html}</strong>
          <br />
          <span className="opacity-70">Capteur</span>
        </div>
      )}
      </div>
    </div>
  );
}
