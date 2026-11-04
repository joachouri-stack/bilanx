'use client';

import { useState } from 'react';

const PRESETS = [
  ['7', '7 jours'],
  ['30', '30 jours'],
  ['90', '90 jours'],
  ['180', '6 mois'],
] as const;

/** Formulaire du rapport : construit l'adresse du PDF (produit à la demande, non conservé). */
export function ReportForm({ sections, today, minDate }: { sections: { key: string; label: string }[]; today: string; minDate: string }) {
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
  return (
    <div className="mt-4 flex flex-col gap-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Période</legend>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(([v, l]) => (
            <button
              key={v}
              type="button"
              aria-pressed={!custom && jours === v}
              onClick={() => {
                setCustom(false);
                setJours(v);
              }}
              className={`min-h-11 rounded-xl border px-4 text-sm ${!custom && jours === v ? 'border-petrol bg-petrol-2 font-medium' : 'border-line'}`}
            >
              {l}
            </button>
          ))}
          <button type="button" aria-pressed={custom} onClick={() => setCustom(true)} className={`min-h-11 rounded-xl border px-4 text-sm ${custom ? 'border-petrol bg-petrol-2 font-medium' : 'border-line'}`}>
            Personnalisée
          </button>
        </div>
        {custom && (
          <div className="mt-3 grid max-w-md grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Du
              <input type="date" value={du} min={minDate} max={today} onChange={(e) => setDu(e.target.value)} className="min-h-11 rounded-xl border border-line bg-surface px-3" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Au
              <input type="date" value={au} min={minDate} max={today} onChange={(e) => setAu(e.target.value)} className="min-h-11 rounded-xl border border-line bg-surface px-3" />
            </label>
            {du && au && du > au && <p className="col-span-2 text-sm text-red">La date de début doit précéder la date de fin.</p>}
          </div>
        )}
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Rubriques</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {sections.map((s) => (
            <label key={s.key} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-sm">
              <input type="checkbox" checked={!!checked[s.key]} onChange={(e) => setChecked((c) => ({ ...c, [s.key]: e.target.checked }))} className="size-5 accent-[var(--petrol)]" />
              {s.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <a
          href={invalid ? undefined : url(false)}
          aria-disabled={invalid}
          target="_blank"
          rel="noopener"
          className={`inline-flex min-h-12 items-center rounded-xl bg-petrol px-5 font-semibold text-white ${invalid ? 'pointer-events-none opacity-50' : ''}`}
        >
          Ouvrir le rapport PDF
        </a>
        <a href={invalid ? undefined : url(true)} aria-disabled={invalid} className={`inline-flex min-h-12 items-center rounded-xl border border-line px-5 font-medium ${invalid ? 'pointer-events-none opacity-50' : ''}`}>
          Télécharger
        </a>
      </div>
    </div>
  );
}
