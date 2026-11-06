'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { Icon } from './icon';

const SHORT = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const LONG = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Construit l'adresse d'un jour : `${basePath}?${param}=${jour}&${extraQuery}`. */
export function dayHref(basePath: string, param: string, day: string, extraQuery?: string): string {
  const q = new URLSearchParams(extraQuery);
  q.set(param, day);
  return `${basePath}?${q.toString()}`;
}

/**
 * Navigation par jour : « ← [date] → ». La date affichée (« ven. 6 nov. », en entier sur ordinateur) est
 * elle-même un `<input type="date">` transparent : la toucher ouvre le calendrier du téléphone, et choisir
 * un jour y navigue aussitôt (pas de bouton « Afficher »).
 *
 * Toutes les props sont sérialisables (utilisable depuis un composant serveur) :
 * l'adresse d'un jour choisi est `basePath?param=AAAA-MM-JJ` (+ `extraQuery`, sans « ? » ni « & » initial).
 * Les liens ← → et « Aujourd'hui » sont fournis tout faits par la page (`prevHref`, `nextHref`, `todayHref`) ;
 * sans `nextHref` (on est au dernier jour permis), la flèche → est désactivée.
 *
 * @example
 * <DayNav basePath="/journal" param="jour" value="2026-11-05" max="2026-11-06"
 *   prevHref="/journal?jour=2026-11-04" nextHref="/journal?jour=2026-11-06" todayHref="/journal" />
 */
export function DayNav({
  basePath,
  param,
  extraQuery,
  value,
  min,
  max,
  today,
  prevHref,
  nextHref,
  todayHref,
  label = 'Jour',
}: {
  /** Chemin de la page, ex. « /journal ». */
  basePath: string;
  /** Nom du paramètre d'adresse, ex. « jour » ou « date ». */
  param: string;
  /** Autres paramètres à conserver, ex. « vue=jour ». */
  extraQuery?: string;
  /** Jour affiché (AAAA-MM-JJ). */
  value: string;
  min?: string;
  /** Dernier jour permis (en général aujourd'hui). */
  max: string;
  /** Aujourd'hui (AAAA-MM-JJ) ; par défaut `max`. Le lien « Aujourd'hui » n'apparaît que si `value` en diffère. */
  today?: string;
  prevHref?: string;
  nextHref?: string;
  todayHref?: string;
  /** Nom accessible de la navigation. */
  label?: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const date = new Date(`${value}T12:00:00Z`);
  const isToday = value === (today ?? max);

  // Événement natif « change » (et non « input ») : sur iOS, il n'arrive qu'une fois le jour choisi,
  // pas à chaque cran de la molette.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    const go = () => {
      const v = el.value;
      if (!ISO.test(v) || v === value) return;
      if ((min && v < min) || v > max) return;
      router.push(dayHref(basePath, param, v, extraQuery));
    };
    el.addEventListener('change', go);
    return () => el.removeEventListener('change', go);
  }, [basePath, param, extraQuery, value, min, max, router]);

  const arrow = 'grid min-h-11 min-w-11 shrink-0 place-items-center rounded-xl text-ink-2 hover:bg-surface-2';
  return (
    <nav aria-label={label} className="flex items-center gap-1">
      {prevHref ? (
        <Link href={prevHref} className={arrow} aria-label="Jour précédent">
          <Icon name="chevronLeft" className="size-5" />
        </Link>
      ) : (
        <span className={`${arrow} opacity-40`} aria-hidden>
          <Icon name="chevronLeft" className="size-5" />
        </span>
      )}
      <div className="relative min-w-0 flex-1 rounded-xl focus-within:ring-2 focus-within:ring-petrol sm:flex-none">
        <span className="pointer-events-none flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-3 font-semibold first-letter:uppercase" aria-hidden>
          <span className="truncate first-letter:uppercase sm:hidden">{SHORT.format(date)}</span>
          <span className="hidden truncate first-letter:uppercase sm:inline">{LONG.format(date)}</span>
          <Icon name="chevronDown" className="size-4 shrink-0 text-ink-3" />
        </span>
        <input
          ref={input}
          type="date"
          key={value}
          defaultValue={value}
          min={min}
          max={max}
          aria-label={`Choisir le jour (affiché : ${LONG.format(date)})`}
          onClick={(e) => {
            try {
              e.currentTarget.showPicker?.();
            } catch {
              /* navigateur sans showPicker : le clic natif suffit */
            }
          }}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
        />
      </div>
      {nextHref ? (
        <Link href={nextHref} className={arrow} aria-label="Jour suivant">
          <Icon name="chevronRight" className="size-5" />
        </Link>
      ) : (
        <span className={`${arrow} opacity-40`} aria-hidden>
          <Icon name="chevronRight" className="size-5" />
        </span>
      )}
      {!isToday && todayHref && (
        <Link href={todayHref} className="ml-1 inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-lg px-3 text-sm font-medium text-petrol hover:bg-petrol-2">
          Aujourd’hui
        </Link>
      )}
    </nav>
  );
}
