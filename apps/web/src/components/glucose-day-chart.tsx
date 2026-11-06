'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { formatGlucose, glucoseAxisTicks, splitIntoSegments, type GlucoseUnit } from '@bilanx/domain';
import { ICONS, type IconName } from './icon';
import { Button, Meta } from './ui';

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

/** Icône (tracé 24×24 au trait) de chaque type d'événement sur les pistes Journal et Insuline. */
const EVENT_ICON: Record<ChartEvent['kind'], IconName> = {
  meal: 'meal',
  injection: 'syringe',
  activity: 'steps',
  note: 'journal',
  stress: 'journal',
  sleep: 'journal',
  illness: 'journal',
  symptom: 'journal',
  medication: 'pill',
  other: 'journal',
};
const PAD = { l: 58, r: 14, t: 12, b: 96 };
const Y_MAX = 300; // mg/dL ; les valeurs supérieures restent tracées en haut (rares)
const HOUR = 3_600_000;

/**
 * Graphique 24 h dessiné à la largeur réelle : zoom (molette, pincement, boutons), déplacement (glisser,
 * seulement une fois zoomé : sinon le geste fait défiler la page), valeur exacte au survol ou en appuyant,
 * courbe interrompue en cas de trou de données, pistes séparées pour le journal et l'insuline.
 */
export function GlucoseDayChart(p: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const clipId = `plot-${useId().replace(/:/g, '')}`;
  const [width, setWidth] = useState(800);
  const [coarse, setCoarse] = useState(false);
  const span = p.dayEnd - p.dayStart;
  const [view, setView] = useState<[number, number]>([p.dayStart, p.dayEnd]);
  const [hover, setHover] = useState<{ x: number; y: number; title: string; sub: string; px: number | null; py: number | null } | null>(null);
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
  useEffect(() => {
    // Écran tactile : pointeur grossier, pas de survol, ou points de contact (certains navigateurs ne signalent pas « coarse »).
    const mq = window.matchMedia('(pointer: coarse), (hover: none)');
    const on = () => setCoarse(mq.matches || navigator.maxTouchPoints > 0);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const H = width < 500 ? 260 : 400;
  const plotW = Math.max(100, width - PAD.l - PAD.r);
  const plotH = H - PAD.t - PAD.b;
  const x = useCallback((t: number) => PAD.l + ((t - view[0]) / (view[1] - view[0])) * plotW, [view, plotW]);
  const y = (mgdl: number) => PAD.t + plotH - (Math.min(mgdl, Y_MAX) / Y_MAX) * plotH;
  const fmtTime = useMemo(() => new Intl.DateTimeFormat('fr-FR', { timeZone: p.timeZone, hour: '2-digit', minute: '2-digit' }), [p.timeZone]);
  /** « 6 h », « 10 h 30 » (typographie française). */
  const hm = (t: number) => {
    if (t >= p.dayEnd) return '24 h';
    const [h = '0', m = '00'] = fmtTime.format(t).split(':');
    return `${Number(h)} h${m === '00' ? '' : ` ${m}`}`;
  };
  const disp = (v: number) => formatGlucose(v, p.unit);

  const zoomAround = (centerT: number, factor: number) => {
    const cur = view[1] - view[0];
    const next = Math.min(span, Math.max(HOUR, cur * factor));
    const f = (centerT - view[0]) / cur;
    let a = centerT - f * next;
    a = Math.max(p.dayStart, Math.min(p.dayEnd - next, a));
    setView([a, a + next]);
  };
  const tAtClientX = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    return view[0] + ((clientX - r.left - PAD.l) / plotW) * (view[1] - view[0]);
  };

  // Molette : listener non passif pour zoomer sans faire défiler la page.
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

  const eventY = PAD.t + plotH + 40;
  const insulinY = eventY + 30;

  /** Valeur (ou événement) la plus proche du pointeur. */
  const showAt = (clientX: number, clientY: number) => {
    const r = ref.current!.getBoundingClientRect();
    const lx = clientX - r.left;
    const ly = clientY - r.top;
    if (ly > PAD.t + plotH + 24) {
      // Pistes Journal / Insuline : l'événement le plus proche (à 18 px près).
      const ev = p.events
        .filter((e) => e.t >= view[0] && e.t <= view[1])
        .map((e) => ({ e, d: Math.abs(x(e.t) - lx), dy: Math.abs((e.kind === 'injection' ? insulinY : eventY) - ly) }))
        .filter((o) => o.d <= 18 && o.dy <= 18)
        .sort((a, b) => a.d - b.d)[0];
      return setHover(ev ? { x: lx, y: ly, title: `${hm(ev.e.t)} · ${ev.e.label}`, sub: ev.e.detail, px: null, py: null } : null);
    }
    const t = tAtClientX(clientX);
    let best: (ChartPoint & { meter: boolean }) | undefined;
    for (const pt of p.sensor) if (!best || Math.abs(pt.t - t) < Math.abs(best.t - t)) best = { ...pt, meter: false };
    for (const pt of p.capillary) if (!best || Math.abs(pt.t - t) <= Math.abs(best.t - t)) best = { ...pt, meter: true };
    if (!best || Math.abs(best.t - t) > 20 * 60_000) return setHover(null);
    setHover({ x: lx, y: ly, px: x(best.t), py: y(best.v), title: `${hm(best.t)} · ${disp(best.v)} ${p.unit}`, sub: best.meter ? 'Lecteur (doigt)' : 'Capteur' });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // Souris : on garde le glisser même hors du graphique (au doigt, le navigateur gère le défilement vertical).
    if (e.pointerType === 'mouse') (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, e.clientX);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [number, number];
      pinch.current = { d: Math.abs(a - b), v: view };
      drag.current = null;
    } else {
      drag.current = { x: e.clientX, v: view };
      // Appui (téléphone) : la valeur s'affiche tout de suite.
      showAt(e.clientX, e.clientY);
    }
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
      const next = Math.min(span, Math.max(HOUR, (cur * pinch.current.d) / d));
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
    showAt(e.clientX, e.clientY);
  };

  // Graduations horaires lisibles selon le niveau de zoom et la largeur.
  const viewH = (view[1] - view[0]) / HOUR;
  const stepH = viewH > 12 ? (width < 400 ? 6 : 3) : viewH > 6 ? (width < 400 ? 2 : 1) : viewH > 2 ? (width < 400 ? 1 : 0.5) : 0.25;
  const ticks: number[] = [];
  const firstTick = p.dayStart + Math.ceil((view[0] - p.dayStart) / (stepH * HOUR)) * stepH * HOUR;
  for (let t = firstTick; t <= view[1] + 1; t += stepH * HOUR) ticks.push(t);

  // Graduations verticales : au moins 14 px entre deux libellés (on garde les plus hautes, dont 70).
  const yAxis: { mgdl: number; label: string }[] = [];
  for (const t of glucoseAxisTicks(p.unit).slice().reverse()) {
    const prev = yAxis.at(-1);
    if (!prev || y(t.mgdl) - y(prev.mgdl) >= 14) yAxis.push(t);
  }
  const segments = splitIntoSegments(p.sensor.map((s) => ({ at: new Date(s.t), v: s.v })));
  const inView = (t: number) => t >= view[0] && t <= view[1];
  const zoomed = view[1] - view[0] < span;
  const ctl = 'border border-line px-4 text-lg';

  return (
    <div>
      <div className="mb-2 flex justify-end gap-1.5">
        <Button variant="ghost" className={ctl} onClick={() => zoomAround((view[0] + view[1]) / 2, 1 / 1.5)} aria-label="Zoomer">
          ＋
        </Button>
        <Button variant="ghost" className={ctl} onClick={() => zoomAround((view[0] + view[1]) / 2, 1.5)} aria-label="Dézoomer">
          －
        </Button>
        <Button variant="ghost" className="border border-line text-sm" disabled={!zoomed} onClick={() => setView([p.dayStart, p.dayEnd])}>
          Journée entière
        </Button>
      </div>
      <div className="relative">
        <svg
          ref={ref}
          width="100%"
          height={H}
          className="touch-pan-y select-none"
          role="img"
          aria-label={`Courbe glycémique de la journée : ${p.sensor.length} mesure${p.sensor.length > 1 ? 's' : ''} du capteur, ${p.capillary.length} du lecteur`}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerMove={onPointerMove}
          onPointerLeave={(e) => e.pointerType !== 'touch' && setHover(null)}
          onDoubleClick={() => setView([p.dayStart, p.dayEnd])}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={PAD.l} y={0} width={plotW} height={H} />
            </clipPath>
          </defs>
          <rect x={PAD.l} y={y(p.targetHigh)} width={plotW} height={y(p.targetLow) - y(p.targetHigh)} fill="var(--sage-2)" />
          {[p.targetLow, p.targetHigh].map((v) => (
            <line key={v} x1={PAD.l} x2={PAD.l + plotW} y1={y(v)} y2={y(v)} stroke="var(--sage)" strokeDasharray="4 4" />
          ))}
          <line x1={PAD.l} x2={PAD.l + plotW} y1={y(p.veryLow)} y2={y(p.veryLow)} stroke="var(--red)" strokeDasharray="2 4" strokeOpacity={0.6} />
          {yAxis.map((t) => (
            <text key={t.mgdl} x={PAD.l - 8} y={y(t.mgdl) + 4} textAnchor="end" fontSize={12} fill="var(--ink-3)">
              {t.label}
            </text>
          ))}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={PAD.t} y2={PAD.t + plotH} stroke="var(--line)" />
              <text x={x(t)} y={PAD.t + plotH + 17} textAnchor="middle" fontSize={12} fill="var(--ink-3)">
                {hm(t)}
              </text>
            </g>
          ))}
          <g clipPath={`url(#${clipId})`}>
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
              <rect key={c.t} x={x(c.t) - 6} y={y(c.v) - 6} width={12} height={12} transform={`rotate(45 ${x(c.t)} ${y(c.v)})`} fill="var(--surface)" stroke="var(--ink-2)" strokeWidth={2}>
                <title>{`${hm(c.t)} · ${disp(c.v)} ${p.unit} — lecteur (doigt)`}</title>
              </rect>
            ))}
          </g>
          {(
            [
              [eventY, 'Journal'],
              [insulinY, 'Insuline'],
            ] as const
          ).map(([yy, l]) => (
            <g key={l}>
              <text x={PAD.l - 8} y={yy + 4} textAnchor="end" fontSize={12} fill="var(--ink-3)">
                {l}
              </text>
              <line x1={PAD.l} x2={PAD.l + plotW} y1={yy} y2={yy} stroke="var(--line)" />
            </g>
          ))}
          {p.events.filter((e) => inView(e.t)).map((e) => {
            const cx = x(e.t);
            const cy = e.kind === 'injection' ? insulinY : eventY;
            return (
              <g key={`${e.kind}-${e.t}`} color={e.kind === 'injection' ? 'var(--petrol)' : 'var(--ink-2)'}>
                <circle cx={cx} cy={cy} r={11} fill="var(--surface)" stroke="var(--line)" />
                <path d={ICONS[EVENT_ICON[e.kind]]} transform={`translate(${cx - 7.5} ${cy - 7.5}) scale(0.625)`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                {/* Cible invisible portant l'infobulle native (survol à la souris). */}
                <text x={cx} y={cy} opacity={0} fontSize={22} textAnchor="middle" dominantBaseline="central">
                  ●<title>{`${hm(e.t)} · ${e.label} — ${e.detail}`}</title>
                </text>
              </g>
            );
          })}
          {hover && hover.px !== null && hover.py !== null && (
            <g pointerEvents="none">
              <line x1={hover.px} x2={hover.px} y1={PAD.t} y2={PAD.t + plotH} stroke="var(--ink-3)" opacity={0.6} />
              <circle cx={hover.px} cy={hover.py} r={5} fill="var(--glucose)" stroke="var(--surface)" strokeWidth={2} />
            </g>
          )}
        </svg>
        {hover && (
          <div
            className="pointer-events-none absolute z-10 max-w-[260px] rounded-lg bg-ink px-3 py-2 text-sm text-bg"
            style={{ left: Math.max(0, Math.min(hover.x + 12, width - 240)), top: Math.max(0, hover.y - 64) }}
          >
            <strong className="tabular">{hover.title}</strong>
            {hover.sub && <span className="block opacity-80">{hover.sub}</span>}
          </div>
        )}
      </div>
      <Meta className="mt-2">
        {coarse
          ? 'Pincez pour zoomer, appuyez sur la courbe pour voir la valeur.'
          : 'Molette ou ＋/－ pour zoomer, glissez pour vous déplacer, double-clic pour revoir la journée entière. Survolez la courbe pour voir la valeur.'}
      </Meta>
    </div>
  );
}
