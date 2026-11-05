'use client';

import { useActionState, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setStepsGoalAction, type FormState } from '@/lib/server/actions';
import { Alert, SubmitButton } from './forms';

export function AppleHealthImport() {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; error?: string; ok?: string }>({ busy: false });
  const upload = async (file: File) => {
    setState({ busy: true });
    try {
      // Envoi du fichier brut, lu en flux par le serveur (exports volumineux).
      const r = await fetch('/api/activite/import', { method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream' } });
      const j = (await r.json()) as { ok: boolean; error?: string; days?: number; from?: string; to?: string; sources?: string[] };
      if (!j.ok) setState({ busy: false, error: j.error ?? 'Import impossible.' });
      else {
        const f = (d?: string) => (d ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`)) : '');
        setState({ busy: false, ok: `${j.days} jour(s) importé(s), du ${f(j.from)} au ${f(j.to)}. Sources : ${j.sources?.join(', ')}.` });
        router.refresh();
      }
    } catch {
      setState({ busy: false, error: 'L’envoi a échoué. Vérifiez votre connexion et réessayez.' });
    }
  };
  return (
    <div className="flex flex-col gap-3">
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.ok && <Alert tone="success">{state.ok}</Alert>}
      <input ref={input} type="file" accept=".zip,.xml,application/zip,text/xml" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      <button type="button" disabled={state.busy} onClick={() => input.current?.click()} className="min-h-12 rounded-xl bg-petrol px-4 font-semibold text-white disabled:opacity-60">
        {state.busy ? 'Import en cours… (plusieurs minutes pour un gros export)' : 'Importer l’export Apple Santé (export.zip)'}
      </button>
      <details className="text-sm text-ink-2">
        <summary className="cursor-pointer text-petrol">Comment obtenir ce fichier sur l’iPhone ?</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Ouvrez l’app Santé, touchez votre photo de profil en haut à droite.</li>
          <li>Touchez « Exporter toutes les données de santé », puis « Exporter ».</li>
          <li>Enregistrez le fichier export.zip (Fichiers ou AirDrop vers votre ordinateur), puis importez-le ici.</li>
        </ol>
        <p className="mt-2 text-xs text-ink-3">
          Seuls les nombres de pas sont lus ; le reste de l’export est ignoré et le fichier n’est pas conservé. Un nouvel import met à jour les
          jours concernés sans doubler les pas.
        </p>
      </details>
    </div>
  );
}

export function GoalForm({ goal }: { goal: number }) {
  const [state, action] = useActionState(setStepsGoalAction, {} as FormState);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2" key={state.attempt ?? 'initial'}>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Objectif quotidien
        <input name="goal" inputMode="numeric" defaultValue={goal} className="min-h-11 w-36 rounded-xl border border-line bg-surface px-3" />
      </label>
      <div className="w-36">
        <SubmitButton pendingLabel="…">Enregistrer</SubmitButton>
      </div>
      {state.errors?.form && <p className="w-full text-sm text-red">{state.errors.form}</p>}
      {state.ok && <p className="w-full text-sm text-sage">{state.message}</p>}
    </form>
  );
}
