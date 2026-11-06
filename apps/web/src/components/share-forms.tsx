'use client';

import { useActionState, useId, useState } from 'react';
import { createShareAction, openShareAction, type FormState } from '@/lib/server/actions';
import { Alert, Field, SubmitButton } from './forms';
import { buttonClass } from './ui';

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

const select = 'min-h-12 w-full min-w-0 rounded-xl border border-line bg-surface px-3 text-base';

/**
 * Création d'un lien sécurisé pour le médecin. La période (`jours`) et les rubriques (`sections`) viennent du
 * formulaire du rapport, au-dessus : un seul choix pour le PDF et pour le lien.
 */
export function ShareLinkForm({
  jours,
  sections,
  durations,
  maxViews,
  disabledReason,
}: {
  jours: string;
  sections: string[];
  durations: { key: string; label: string }[];
  maxViews: { key: string; label: string }[];
  /** Raison pour laquelle le lien ne peut pas être créé (période personnalisée, aucune rubrique…). */
  disabledReason?: string;
}) {
  const [state, action] = useActionState(createShareAction, initial);
  const [copied, setCopied] = useState('');
  const [again, setAgain] = useState<string | null>(null);
  const id = useId();
  const v = state.values ?? {};
  if (state.ok && v.link && again !== state.attempt) {
    const copy = (what: string, text: string) => navigator.clipboard?.writeText(text).then(() => setCopied(what));
    return (
      <div className="flex min-w-0 flex-col gap-3.5" data-partage="cree">
        <Alert tone="success">Lien créé. Le lien et le code ne seront plus affichés : transmettez-les maintenant.</Alert>
        <div className="min-w-0">
          <p className="text-sm font-medium">1. Lien à envoyer au médecin</p>
          <p className="mt-1 break-all rounded-xl bg-surface-2 p-3 font-mono text-sm" data-lien>
            {v.link}
          </p>
          <button type="button" onClick={() => copy('lien', v.link!)} className={buttonClass({ variant: 'secondary', className: 'mt-2' })}>
            {copied === 'lien' ? 'Lien copié' : 'Copier le lien'}
          </button>
        </div>
        <div>
          <p className="text-sm font-medium">2. Code à donner séparément (de vive voix, par SMS…)</p>
          <p className="tabular mt-1 rounded-xl bg-surface-2 p-3 text-center font-mono text-2xl tracking-widest" data-code>
            {v.code}
          </p>
        </div>
        <p className="text-sm text-ink-2">
          Valable jusqu’au <strong>{v.expires}</strong>. Vous pouvez arrêter le partage à tout moment dans « Mes partages ».
        </p>
        <button type="button" onClick={() => setAgain(state.attempt ?? '')} className={buttonClass({ variant: 'ghost', className: 'self-start -ml-3' })}>
          Créer un autre lien
        </button>
      </div>
    );
  }
  return (
    <form action={action} className="flex min-w-0 flex-col gap-4" key={state.attempt ?? 'initial'}>
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      <input type="hidden" name="jours" value={jours} />
      {sections.map((s) => (
        <input key={s} type="hidden" name="s" value={s} />
      ))}
      <Field label="Destinataire (facultatif)" name="recipient" required={false} maxLength={120} defaultValue={v.recipient} hint="Ex. « Dr Martin, endocrinologue ». Visible par le destinataire." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium" htmlFor={`${id}-d`}>
          Durée d’accès
          <select id={`${id}-d`} name="duration" defaultValue={v.duration || '7'} className={select}>
            {durations.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium" htmlFor={`${id}-v`}>
          Ouvertures
          <select id={`${id}-v`} name="maxViews" defaultValue={v.maxViews ?? ''} className={select}>
            {maxViews.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {disabledReason ? (
        <>
          <p className="text-sm text-ink-2">{disabledReason}</p>
          <button type="button" disabled className={buttonClass({ variant: 'primary', className: 'w-full' })}>
            Créer un lien pour le médecin
          </button>
        </>
      ) : (
        <SubmitButton pendingLabel="Préparation du rapport…">Créer un lien pour le médecin</SubmitButton>
      )}
    </form>
  );
}
