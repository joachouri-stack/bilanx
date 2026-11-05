'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import {
  changePasswordAction,
  confirmEmailChangeAction,
  regenerateRecoveryCodesAction,
  requestEmailChangeAction,
  type FormState,
} from '@/lib/server/actions';
import { Alert, Field, SubmitButton } from './forms';

const initial: FormState = {};

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePasswordAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3.5" key={state.attempt ?? 'initial'}>
      {state.ok && <Alert tone="success">{state.message}</Alert>}
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      <Field label="Mot de passe actuel" name="currentPassword" type="password" autoComplete="current-password" error={state.errors?.currentPassword} />
      <Field
        label="Nouveau mot de passe"
        name="password"
        type="password"
        autoComplete="new-password"
        error={state.errors?.password}
        hint="12 caractères minimum. Une phrase de plusieurs mots est idéale."
      />
      <SubmitButton pendingLabel="Enregistrement…">Changer le mot de passe</SubmitButton>
      <p className="text-xs text-ink-3">Vos autres appareils seront déconnectés ; celui-ci reste connecté.</p>
    </form>
  );
}

export function ChangeEmailForm({ current }: { current: string }) {
  const [state, action] = useActionState(requestEmailChangeAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3.5" key={state.attempt ?? 'initial'}>
      {state.ok && <Alert tone="info">{state.message}</Alert>}
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      <Field
        label="Nouvelle adresse e-mail"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        error={state.errors?.email}
        defaultValue={state.ok ? '' : state.values?.email}
        hint={`Adresse actuelle : ${current}`}
      />
      <Field label="Mot de passe actuel" name="currentPassword" type="password" autoComplete="current-password" error={state.errors?.currentPassword} />
      <SubmitButton pendingLabel="Envoi…">Recevoir le lien de confirmation</SubmitButton>
      <p className="text-xs text-ink-3">Votre ancienne adresse sera prévenue du changement.</p>
    </form>
  );
}

export function ConfirmEmailChangeForm({ token }: { token: string }) {
  const [state, action] = useActionState(confirmEmailChangeAction, initial);
  if (state.message) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert>
        <Link href="/parametres" className="text-center font-medium text-petrol underline">
          Aller aux paramètres
        </Link>
      </div>
    );
  }
  // Bouton (POST) : les scanners de liens des messageries ne consomment pas le jeton.
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <SubmitButton pendingLabel="Confirmation…">Utiliser cette adresse pour mon compte</SubmitButton>
    </form>
  );
}

export function RegenerateRecoveryCodesForm({ left }: { left: number }) {
  const [state, action] = useActionState(regenerateRecoveryCodesAction, initial);
  if (state.ok && state.recoveryCodes) {
    return (
      <div className="flex flex-col gap-3">
        <Alert tone="success">Nouveaux codes créés : les précédents ne fonctionnent plus.</Alert>
        <p className="text-sm text-ink-2">
          Conservez-les en lieu sûr. Chacun permet <strong>une</strong> connexion si vous perdez votre téléphone. Ils ne seront plus affichés.
        </p>
        <ol className="tabular grid grid-cols-2 gap-2 rounded-xl bg-surface-2 p-4 font-mono text-[15px]" aria-label="Nouveaux codes de secours">
          {state.recoveryCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ol>
        <button type="button" className="min-h-11 rounded-xl border border-line px-4 font-medium" onClick={() => navigator.clipboard?.writeText(state.recoveryCodes!.join('\n'))}>
          Copier les codes
        </button>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3.5" key={state.attempt ?? 'initial'}>
      <p className="text-sm text-ink-2">
        {left > 0 ? `Il vous reste ${left} code${left > 1 ? 's' : ''} de secours inutilisé${left > 1 ? 's' : ''}.` : 'Vous n’avez plus aucun code de secours : créez-en de nouveaux.'}
      </p>
      {left <= 3 && left > 0 && <Alert tone="info">Il vous reste peu de codes : pensez à en créer de nouveaux.</Alert>}
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      <Field label="Mot de passe actuel" name="currentPassword" type="password" autoComplete="current-password" error={state.errors?.currentPassword} />
      <SubmitButton pendingLabel="Création…">Créer de nouveaux codes de secours</SubmitButton>
    </form>
  );
}
