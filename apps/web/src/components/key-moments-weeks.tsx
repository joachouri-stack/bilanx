'use client';

import { useEffect, useRef, useState } from 'react';
import { formatGlucose, type GlucoseUnit } from '@bilanx/domain';
import type { KeyMomentDay, KeyMomentKey } from '@/lib/server/dashboard-data';
import { Icon } from './icon';

type Targets = { veryLow: number; low: number; high: number; veryHigh: number };

/** Même code couleur que le reste du tableau de bord : vert dans la cible, orange un peu à côté, rouge hors plage. */
function cellClass(v: number, t: Targets): string {
  if (v >= t.low && v <= t.high) return 'bg-sage-2 text-go';
  if (v >= t.veryLow && v <= t.veryHigh) return 'bg-amber-2 text-amber';
  return 'bg-red-2 text-red';
}

const WD = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const longDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const dayMonth = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const utc = (iso: string) => new Date(`${iso}T12:00:00Z`);

/**
 * Moments clés, une semaine par écran (du lundi au dimanche). On balaie de droite à gauche pour remonter
 * semaine par semaine ; la semaine en cours s'affiche d'abord. Flèches pour la souris et le clavier.
 */
export function KeyMomentsWeeks({
  days,
  rows,
  unit,
  targets,
  today,
}: {
  days: KeyMomentDay[];
  rows: { key: KeyMomentKey; short: string }[];
  unit: GlucoseUnit;
  targets: Targets;
  /** AAAA-MM-JJ. */
  today: string;
}) {
  const weeks: KeyMomentDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  const last = weeks.length - 1;
  const [index, setIndex] = useState(last);
  const track = useRef<HTMLDivElement>(null);

  // Ouverture sur la semaine en cours (la dernière), sans animation.
  useEffect(() => {
    const el = track.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    const target = Math.max(0, Math.min(last, i));
    el.scrollTo({ left: target * el.clientWidth, behavior: 'smooth' });
  };
  const onScroll = () => {
    const el = track.current;
    if (el && el.clientWidth) setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  const week = weeks[index] ?? weeks[last]!;
  const title =
    index === last
      ? 'Cette semaine'
      : index === last - 1
        ? 'Semaine dernière'
        : `Du ${dayMonth.format(utc(week[0]!.date))} au ${dayMonth.format(utc(week[6]!.date))}`;

  return (
    <div>
      <div className="mb-2 flex items-center gap-1">
        <h3 className="min-w-0 flex-1 text-sm font-semibold text-ink-2">
          Moments clés · <span aria-live="polite">{title}</span>
        </h3>
        <button
          type="button"
          onClick={() => go(index - 1)}
          disabled={index === 0}
          className="grid size-11 place-items-center rounded-full text-petrol disabled:text-ink-3 disabled:opacity-40"
          aria-label="Semaine précédente"
        >
          <Icon name="chevronLeft" className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => go(index + 1)}
          disabled={index === last}
          className="grid size-11 place-items-center rounded-full text-petrol disabled:text-ink-3 disabled:opacity-40"
          aria-label="Semaine suivante"
        >
          <Icon name="chevronRight" className="size-5" />
        </button>
      </div>

      <div
        ref={track}
        onScroll={onScroll}
        role="region"
        aria-label="Moments clés, semaine par semaine (balayer pour changer de semaine)"
        tabIndex={0}
        className="relative flex w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-xl [contain:inline-size] [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-petrol [&::-webkit-scrollbar]:hidden"
      >
        {weeks.map((w, wi) => (
          <table key={w[0]!.date} className="w-full min-w-full shrink-0 snap-start table-fixed border-separate border-spacing-1 text-center" aria-hidden={wi !== index || undefined}>
            <caption className="sr-only">
              Glycémie aux moments clés du {longDay.format(utc(w[0]!.date))} au {longDay.format(utc(w[6]!.date))}, en {unit}
            </caption>
            <thead>
              <tr>
                <th scope="col" className="w-[4.75rem]">
                  <span className="sr-only">Moment</span>
                </th>
                {w.map((d, i) => {
                  const isToday = d.date === today;
                  return (
                    <th key={d.date} scope="col" className={`text-[12px] font-medium ${isToday ? 'text-ink' : 'text-ink-3'}`}>
                      <span aria-hidden className={isToday ? 'inline-block rounded-full bg-petrol px-1.5 text-on-accent' : undefined}>
                        {isToday ? 'auj.' : WD[i]}
                      </span>
                      <span aria-hidden className="block text-[10px] font-normal text-ink-3">
                        {utc(d.date).getUTCDate()}
                      </span>
                      <span className="sr-only">{longDay.format(utc(d.date))}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((k) => (
                <tr key={k.key}>
                  <th scope="row" className="pr-1 text-left text-[12px] font-medium leading-tight text-ink-2">
                    {k.short}
                  </th>
                  {w.map((d) => {
                    const v = d.values[k.key];
                    return (
                      <td
                        key={d.date}
                        className={`tabular h-9 rounded-lg text-[12px] font-semibold ${
                          v.mgdl !== null ? cellClass(v.mgdl, targets) : d.future ? 'border border-dashed border-line text-ink-3' : 'bg-surface-2 text-ink-3'
                        }`}
                      >
                        {v.mgdl !== null ? formatGlucose(v.mgdl, unit) : <span aria-label={v.upcoming || d.future ? 'à venir' : 'pas de mesure'}>·</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>

      {/* Position dans l'historique. */}
      <div className="mt-2 flex justify-center gap-1.5" aria-hidden>
        {weeks.map((w, i) => (
          <span key={w[0]!.date} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-4 bg-petrol' : 'w-1.5 bg-line'}`} />
        ))}
      </div>
    </div>
  );
}
