'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import {
  beginTotpReplacementAction,
  changePasswordAction,
  confirmTotpReplacementAction,
  confirmEmailChangeAction,
  regenerateRecoveryCodesAction,
  requestEmailChangeAction,
  type FormState,
} from '@/lib/server/actions';
import { Alert, Field, SubmitButton } from './forms';
import { buttonClass } from './ui';

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
      <p className="text-[13px] text-ink-3">Vos autres appareils seront déconnectés ; celui-ci reste connecté.</p>
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
      <p className="text-[13px] text-ink-3">Votre ancienne adresse sera prévenue du changement.</p>
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
        <button type="button" className={buttonClass({ variant: 'secondary' })} onClick={() => navigator.clipboard?.writeText(state.recoveryCodes!.join('\n'))}>
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

/** Changement de téléphone pour la double authentification, en deux étapes. */
export function ReplaceTotpForm() {
  const [start, begin] = useActionState(beginTotpReplacementAction, initial);
  const [done, confirm] = useActionState(confirmTotpReplacementAction, initial);
  if (done.ok) return <Alert tone="success">{done.message}</Alert>;
  if (start.ok && start.values?.qrSvg) {
    return (
      <div className="flex flex-col gap-3.5">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-2">
          <li>Sur le nouveau téléphone, ouvrez votre application d’authentification et ajoutez un compte.</li>
          <li>Scannez ce QR code, ou saisissez la clé à la main.</li>
          <li>Saisissez ci-dessous le code à 6 chiffres affiché par la nouvelle application.</li>
        </ol>
        {/* SVG produit par le serveur à partir de la clé (bibliothèque qrcode), sans contenu fourni par l'utilisateur. */}
        <div className="mx-auto w-44 rounded-xl border border-line bg-white p-2" role="img" aria-label="QR code de la nouvelle clé" dangerouslySetInnerHTML={{ __html: start.values.qrSvg }} />
        <p className="text-center text-[13px] text-ink-3">
          Clé : <code className="break-all font-mono text-ink">{start.values.secret}</code>
        </p>
        <form action={confirm} className="flex flex-col gap-3.5" key={done.attempt ?? 'initial'}>
          {done.errors?.form && <Alert tone="error">{done.errors.form}</Alert>}
          <Field label="Code de la nouvelle application" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} />
          <SubmitButton pendingLabel="Vérification…">Utiliser ce nouveau téléphone</SubmitButton>
        </form>
        <p className="text-[13px] text-ink-3">Votre ancienne application reste valable tant que ce code n’a pas été validé (15 minutes).</p>
      </div>
    );
  }
  return (
    <form action={begin} className="flex flex-col gap-3.5" key={start.attempt ?? 'initial'}>
      <p className="text-sm text-ink-2">
        Nouveau téléphone, ou application réinstallée ? Votre application actuelle continue de fonctionner jusqu’à la validation de la
        nouvelle. Téléphone perdu : connectez-vous avec un code de secours, puis faites ce changement.
      </p>
      {start.errors?.form && <Alert tone="error">{start.errors.form}</Alert>}
      <Field label="Mot de passe actuel" name="currentPassword" type="password" autoComplete="current-password" error={start.errors?.currentPassword} />
      <SubmitButton pendingLabel="Préparation…">Configurer un nouveau téléphone</SubmitButton>
    </form>
  );
}
