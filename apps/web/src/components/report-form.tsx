'use client';

import { useState } from 'react';
import { buttonClass } from './ui';
import { Icon } from './icon';
import { ShareLinkForm } from './share-forms';

const PRESETS = [
  ['7', '7 jours'],
  ['30', '30 jours'],
  ['90', '90 jours'],
  ['180', '6 mois'],
] as const;

export interface ShareOptions {
  durations: { key: string; label: string }[];
  maxViews: { key: string; label: string }[];
}

/**
 * Un seul choix (période et rubriques) pour deux actions : télécharger le PDF (produit à la demande, non conservé)
 * ou créer un lien sécurisé pour le médecin (`share`, absent si le partage n'est pas permis : `shareUnavailable` l'explique).
 */
export function ReportForm({
  sections,
  today,
  minDate,
  share,
  shareUnavailable,
}: {
  sections: { key: string; label: string }[];
  today: string;
  minDate: string;
  share?: ShareOptions;
  shareUnavailable?: string;
}) {
  const [jours, setJours] = useState('30');
  const [custom, setCustom] = useState(false);
  const [du, setDu] = useState('');
  const [au, setAu] = useState(today);
  const [checked, setChecked] = useState<Record<string, boolean>>(() => Object.fromEntries(sections.map((s) => [s.key, true])));
  const chosen = sections.filter((s) => checked[s.key]).map((s) => s.key);
  const invalid = !chosen.length || (custom && (!du || !au || du > au));
  const url = (download: boolean) => {
    const q = new URLSearchParams({ s: chosen.join(',') });
    if (custom) {
      q.set('du', du);
      q.set('au', au);
    } else q.set('jours', jours);
    if (download) q.set('telecharger', '1');
    return `/api/rapports?${q.toString()}`;
  };
  const seg = (on: boolean) =>
    `flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors ${on ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:bg-surface hover:text-ink'}`;
  const dateInput = 'min-h-12 w-full min-w-0 rounded-xl border border-line bg-surface px-3';
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <fieldset className="min-w-0">
        <legend className="mb-2 text-sm font-medium">Période</legend>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1 sm:inline-grid sm:grid-cols-5">
          {PRESETS.map(([v, l]) => (
            <button
              key={v}
              type="button"
              aria-pressed={!custom && jours === v}
              onClick={() => {
                setCustom(false);
                setJours(v);
              }}
              className={seg(!custom && jours === v)}
            >
              {l}
            </button>
          ))}
          <button type="button" aria-pressed={custom} onClick={() => setCustom(true)} className={`${seg(custom)} col-span-2 sm:col-span-1`}>
            Autres dates
          </button>
        </div>
        {custom && (
          <div className="mt-3 grid max-w-md grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
              Du
              <input type="date" value={du} min={minDate} max={today} onChange={(e) => setDu(e.target.value)} className={dateInput} />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
              Au
              <input type="date" value={au} min={minDate} max={today} onChange={(e) => setAu(e.target.value)} className={dateInput} />
            </label>
            {du && au && du > au && <p className="text-sm text-red sm:col-span-2">La date de début doit précéder la date de fin.</p>}
          </div>
        )}
      </fieldset>
      <fieldset className="min-w-0">
        <legend className="mb-2 text-sm font-medium">Rubriques</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {sections.map((s) => (
            <label
              key={s.key}
              className="flex min-h-12 min-w-0 cursor-pointer items-center gap-3 rounded-xl border border-line px-3 py-2 text-sm has-[:checked]:border-petrol has-[:checked]:bg-petrol-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-petrol"
            >
              <input type="checkbox" checked={!!checked[s.key]} onChange={(e) => setChecked((c) => ({ ...c, [s.key]: e.target.checked }))} className="size-5 shrink-0 accent-[var(--petrol)]" />
              <span className="min-w-0">{s.label}</span>
            </label>
          ))}
        </div>
        {!chosen.length && <p className="mt-2 text-sm text-red">Choisissez au moins une rubrique.</p>}
      </fieldset>

      <section aria-labelledby="rapport-pdf" className="min-w-0 border-t border-line pt-5">
        <h3 id="rapport-pdf" className="font-semibold">
          Télécharger le PDF
        </h3>
        <p className="mt-1 text-sm text-ink-2">À imprimer ou à envoyer vous-même. Le PDF n’est pas conservé par BILANX.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <a href={invalid ? undefined : url(true)} aria-disabled={invalid} className={buttonClass({ variant: 'primary' })}>
            <Icon name="document" className="size-5" /> Télécharger le PDF
          </a>
          <a href={invalid ? undefined : url(false)} aria-disabled={invalid} target="_blank" rel="noopener" className={buttonClass({ variant: 'secondary' })}>
            Voir le PDF
          </a>
        </div>
      </section>

      <section aria-labelledby="rapport-lien" id="lien-medecin" className="min-w-0 scroll-mt-20 border-t border-line pt-5">
        <h3 id="rapport-lien" className="font-semibold">
          Créer un lien pour le médecin
        </h3>
        <p className="mb-3 mt-1 text-sm text-ink-2">
          Le médecin ouvre une copie figée du rapport avec un lien et un code, sans compte. Accès limité dans le temps ; vous êtes prévenu à la première
          ouverture.
        </p>
        {share ? (
          <ShareLinkForm
            jours={jours}
            sections={chosen}
            durations={share.durations}
            maxViews={share.maxViews}
            disabledReason={custom ? 'Pour un lien, choisissez 7 jours, 30 jours, 90 jours ou 6 mois.' : !chosen.length ? 'Choisissez au moins une rubrique.' : undefined}
          />
        ) : (
          <p className="text-sm text-ink-2">{shareUnavailable}</p>
        )}
      </section>
    </div>
  );
}
