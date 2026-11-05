'use client';

import { useActionState, useState } from 'react';
import { createShareAction, openShareAction, type FormState } from '@/lib/server/actions';
import { Alert, Field, SubmitButton } from './forms';

const initial: FormState = {};

export function ShareCodeForm({ token }: { token: string }) {
  const [state, action] = useActionState(openShareAction.bind(null, token), initial);
  return (
    <form action={action} className="flex flex-col gap-3.5" key={state.attempt ?? 'initial'}>
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      <Field label="Code d’accès" name="code" inputMode="numeric" autoComplete="off" maxLength={12} autoFocus />
      <SubmitButton pendingLabel="Vérification…">Ouvrir le rapport</SubmitButton>
    </form>
  );
}

const PERIODS = [
  ['7', '7 jours'],
  ['30', '30 jours'],
  ['90', '90 jours'],
  ['180', '6 mois'],
] as const;

export function CreateShareForm({
  sections,
  durations,
  maxViews,
}: {
  sections: { key: string; label: string }[];
  durations: { key: string; label: string }[];
  maxViews: { key: string; label: string }[];
}) {
  const [state, action] = useActionState(createShareAction, initial);
  const [copied, setCopied] = useState('');
  const v = state.values ?? {};
  if (state.ok && v.link) {
    const copy = (what: string, text: string) => navigator.clipboard?.writeText(text).then(() => setCopied(what));
    return (
      <div className="flex flex-col gap-3.5" data-partage="cree">
        <Alert tone="success">Partage créé. Le lien et le code ne seront plus affichés : transmettez-les maintenant.</Alert>
        <div>
          <p className="text-sm font-medium">1. Lien à envoyer au professionnel</p>
          <p className="mt-1 break-all rounded-xl bg-surface-2 p-3 font-mono text-sm" data-lien>
            {v.link}
          </p>
          <button type="button" onClick={() => copy('lien', v.link!)} className="mt-2 min-h-10 rounded-xl border border-line px-3 text-sm">
            {copied === 'lien' ? '✓ Lien copié' : 'Copier le lien'}
          </button>
        </div>
        <div>
          <p className="text-sm font-medium">2. Code à transmettre séparément (oralement, par SMS…)</p>
          <p className="tabular mt-1 rounded-xl bg-surface-2 p-3 text-center font-mono text-2xl tracking-widest" data-code>
            {v.code}
          </p>
        </div>
        <p className="text-sm text-ink-2">
          Valable jusqu’au <strong>{v.expires}</strong>. Vous pouvez le révoquer à tout moment ci-dessous ; chaque consultation y est journalisée.
        </p>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4" key={state.attempt ?? 'initial'}>
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      <Field label="Destinataire" name="recipient" required={false} maxLength={120} defaultValue={v.recipient} hint="Pour vous y retrouver, ex. « Dr Martin, endocrinologue ». Visible par le destinataire." />
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Période du rapport</legend>
        <div className="flex flex-wrap gap-2">
          {PERIODS.map(([k, l]) => (
            <label key={k} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 text-sm has-[:checked]:border-petrol has-[:checked]:bg-petrol-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-petrol">
              <input type="radio" name="jours" value={k} defaultChecked={(v.jours || '30') === k} className="sr-only" />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Rubriques partagées</legend>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {sections.map((s) => (
            <label key={s.key} className="flex min-h-10 items-center gap-2 text-sm">
              <input type="checkbox" name="s" value={s.key} defaultChecked className="size-4 accent-[var(--petrol)]" />
              {s.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Durée d’accès
          <select name="duration" defaultValue={v.duration || '7'} className="min-h-11 rounded-xl border border-line bg-surface px-3 text-base">
            {durations.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Ouvertures
          <select name="maxViews" defaultValue={v.maxViews ?? ''} className="min-h-11 rounded-xl border border-line bg-surface px-3 text-base">
            {maxViews.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <SubmitButton pendingLabel="Préparation du rapport…">Créer le lien de partage</SubmitButton>
    </form>
  );
}
