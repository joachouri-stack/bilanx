import { formatPhone, mailtoHref, mapsLinks, telHref } from '@bilanx/domain';
import type { ContactRow } from '@bilanx/records';
import { Icon } from './icon';

/** Boutons ronds Appeler / E-mail / Itinéraire d'une ligne de la liste (seulement ceux qui ont une valeur). */
export function ContactQuickActions({ c, name }: { c: ContactRow; name: string }) {
  const round = 'grid size-11 shrink-0 place-items-center rounded-full transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-petrol';
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {c.phone && (
        <a href={telHref(c.phone)} aria-label={`Appeler ${name}`} title={formatPhone(c.phone)} className={`${round} bg-sage-2 text-sage hover:brightness-95`}>
          <Icon name="phone" className="size-5" />
        </a>
      )}
      {c.email && (
        <a href={mailtoHref(c.email)} aria-label={`Écrire à ${name}`} title={c.email} className={`${round} bg-petrol-2 text-petrol hover:brightness-95`}>
          <Icon name="mail" className="size-5" />
        </a>
      )}
      {c.address && (
        <a href={mapsLinks(c.address).google} target="_blank" rel="noopener noreferrer" aria-label={`Itinéraire vers ${name}`} title={c.address} className={`${round} bg-indigo-2 text-indigo hover:brightness-95`}>
          <Icon name="navigate" className="size-5" />
        </a>
      )}
    </div>
  );
}

/** Coordonnées cliquables de la fiche : chaque ligne ouvre l'application du téléphone. */
export function ContactDetails({ c }: { c: ContactRow }) {
  const row = 'flex min-h-16 items-center gap-3.5 rounded-2xl px-3 py-2.5 transition hover:bg-surface-2 active:scale-[0.99]';
  const chip = 'grid size-11 shrink-0 place-items-center rounded-full';
  const maps = c.address ? mapsLinks(c.address) : null;
  return (
    <ul className="-mx-3 flex flex-col">
      {c.phone && (
        <li>
          <a href={telHref(c.phone)} className={row}>
            <span className={`${chip} bg-sage-2 text-sage`} aria-hidden>
              <Icon name="phone" className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] text-ink-3">Appeler</span>
              <span className="tabular block text-[17px] font-semibold">{formatPhone(c.phone)}</span>
            </span>
            <Icon name="chevronRight" className="size-5 shrink-0 text-ink-3" />
          </a>
        </li>
      )}
      {c.email && (
        <li>
          <a href={mailtoHref(c.email)} className={row}>
            <span className={`${chip} bg-petrol-2 text-petrol`} aria-hidden>
              <Icon name="mail" className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] text-ink-3">Écrire un e-mail</span>
              <span className="block break-all text-[17px] font-semibold">{c.email}</span>
            </span>
            <Icon name="chevronRight" className="size-5 shrink-0 text-ink-3" />
          </a>
        </li>
      )}
      {c.address && maps && (
        <li>
          <a href={maps.google} target="_blank" rel="noopener noreferrer" className={row}>
            <span className={`${chip} bg-indigo-2 text-indigo`} aria-hidden>
              <Icon name="navigate" className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] text-ink-3">Itinéraire (GPS)</span>
              <span className="block whitespace-pre-line text-[17px] font-semibold leading-snug">{c.address}</span>
            </span>
            <Icon name="chevronRight" className="size-5 shrink-0 text-ink-3" />
          </a>
          <p className="ml-[4.25rem] flex flex-wrap items-center gap-x-1 pb-1 text-[13px] text-ink-3">
            Ouvrir aussi avec
            <a href={maps.apple} target="_blank" rel="noopener noreferrer" className="font-medium text-petrol underline-offset-2 hover:underline">
              Plans
            </a>
            ·
            <a href={maps.waze} target="_blank" rel="noopener noreferrer" className="font-medium text-petrol underline-offset-2 hover:underline">
              Waze
            </a>
          </p>
        </li>
      )}
    </ul>
  );
}
