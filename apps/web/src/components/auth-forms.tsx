'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import {
  confirmTotpAction,
  requestResetAction,
  resendVerificationAction,
  resetPasswordAction,
  signInAction,
  signUpAction,
  verifyEmailAction,
  verifyMfaAction,
  type FormState,
} from '@/lib/server/actions';
import { Alert, Field, SubmitButton } from './forms';

const initial: FormState = {};

export function SignUpForm() {
  const [state, action] = useActionState(signUpAction, initial);
  if (state.ok) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">{state.message}</Alert>
        <p className="text-sm text-ink-3">
          Environnement de développement : aucun e-mail n’est réellement envoyé, le lien s’affiche dans la console du serveur.
        </p>
        <Link href="/connexion" className="text-center font-medium text-petrol underline">
          Aller à la connexion
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Field label="Prénom" name="displayName" autoComplete="given-name" defaultValue={state.values?.displayName} error={state.errors?.displayName} maxLength={80} />
      <Field label="Adresse e-mail" name="email" type="email" autoComplete="email" inputMode="email" defaultValue={state.values?.email} error={state.errors?.email} />
      <Field
        label="Mot de passe"
        name="password"
        type="password"
        autoComplete="new-password"
        error={state.errors?.password}
        hint="12 caractères minimum. Une phrase de plusieurs mots est idéale."
        maxLength={128}
      />
      <fieldset className="flex flex-col gap-3 rounded-xl border border-line p-3.5">
        <legend className="px-1 text-sm font-medium">Consentements</legend>
        <label className="flex gap-3 text-sm">
          <input type="checkbox" name="consentHealth" className="mt-0.5 size-5 shrink-0 accent-[var(--petrol)]" aria-invalid={!!state.errors?.consent} />
          <span>
            <strong>Obligatoire.</strong> J’accepte que BILANX enregistre et traite mes données de santé pour me permettre de les
            consulter et de les suivre. Je peux retirer ce consentement et supprimer mes données à tout moment.
          </span>
        </label>
        {state.errors?.consent && (
          <p className="text-sm text-red" role="alert">
            {state.errors.consent}
          </p>
        )}
        <label className="flex gap-3 text-sm">
          <input type="checkbox" name="consentAi" className="mt-0.5 size-5 shrink-0 accent-[var(--petrol)]" />
          <span>
            <strong>Facultatif.</strong> J’accepte l’extraction automatique par IA des valeurs de mes documents. Chaque valeur me sera
            soumise pour validation avant tout enregistrement. Sans ce consentement, la saisie reste manuelle.
          </span>
        </label>
      </fieldset>
      <SubmitButton pendingLabel="Création du compte…">Créer mon compte</SubmitButton>
      <p className="text-center text-sm text-ink-3">
        Déjà inscrit ?{' '}
        <Link href="/connexion" className="font-medium text-petrol underline">
          Se connecter
        </Link>
      </p>
    </form>
  );
}

export function SignInForm() {
  const [state, action] = useActionState(signInAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      <Field label="Adresse e-mail" name="email" type="email" autoComplete="username" inputMode="email" defaultValue={state.values?.email} autoFocus />
      <Field label="Mot de passe" name="password" type="password" autoComplete="current-password" />
      <div className="flex justify-end text-sm">
        <Link href="/mot-de-passe-oublie" className="text-petrol underline">
          Mot de passe oublié ?
        </Link>
      </div>
      <SubmitButton pendingLabel="Connexion…">Se connecter</SubmitButton>
      <p className="text-center text-sm text-ink-3">
        Pas encore de compte ?{' '}
        <Link href="/inscription" className="font-medium text-petrol underline">
          Créer un compte
        </Link>
        {' · '}
        <Link href="/verifier-email" className="underline">
          Renvoyer le lien de confirmation
        </Link>
      </p>
    </form>
  );
}

export function VerifyEmailForm({ token }: { token: string }) {
  const [state, action] = useActionState(verifyEmailAction, initial);
  if (state.message) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert>
        {state.ok ? (
          <Link href="/connexion" className="text-center font-medium text-petrol underline">
            Se connecter
          </Link>
        ) : (
          <ResendVerificationForm />
        )}
      </div>
    );
  }
  // Confirmation par un bouton (POST) : les scanners de liens des messageries ne consomment pas le jeton.
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <SubmitButton pendingLabel="Confirmation…">Confirmer mon adresse e-mail</SubmitButton>
    </form>
  );
}

export function ResendVerificationForm() {
  const [state, action] = useActionState(resendVerificationAction, initial);
  if (state.ok) return <Alert tone="info">{state.message}</Alert>;
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Adresse e-mail" name="email" type="email" autoComplete="email" inputMode="email" />
      <SubmitButton>Recevoir un nouveau lien</SubmitButton>
    </form>
  );
}

export function TotpConfirmForm({ alreadyEnrolled }: { alreadyEnrolled: boolean }) {
  const [state, action] = useActionState(confirmTotpAction, initial);
  if (state.ok && state.recoveryCodes) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">Double authentification activée.</Alert>
        <div>
          <h2 className="font-semibold">Vos codes de secours</h2>
          <p className="mt-1 text-sm text-ink-2">
            Conservez-les en lieu sûr (gestionnaire de mots de passe ou papier). Chacun permet <strong>une</strong> connexion si vous
            perdez votre téléphone. Ils ne seront plus jamais affichés.
          </p>
        </div>
        <ol className="tabular grid grid-cols-2 gap-2 rounded-xl bg-surface-2 p-4 font-mono text-[15px]" aria-label="Codes de secours">
          {state.recoveryCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ol>
        <button
          type="button"
          className="min-h-11 rounded-xl border border-line px-4 font-medium"
          onClick={() => navigator.clipboard?.writeText(state.recoveryCodes!.join('\n'))}
        >
          Copier les codes
        </button>
        <Link href="/tableau-de-bord" className="grid min-h-12 place-items-center rounded-xl bg-petrol px-4 font-semibold text-white">
          J’ai conservé mes codes — continuer
        </Link>
      </div>
    );
  }
  if (alreadyEnrolled) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="info">La double authentification est déjà configurée sur ce compte.</Alert>
        <Link href="/tableau-de-bord" className="text-center font-medium text-petrol underline">
          Aller au tableau de bord
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      <Field label="Code à 6 chiffres affiché par l’application" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} autoFocus />
      <SubmitButton pendingLabel="Vérification…">Activer la double authentification</SubmitButton>
    </form>
  );
}

export function MfaVerifyForm() {
  const [state, action] = useActionState(verifyMfaAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      <Field
        label="Code à 6 chiffres ou code de secours"
        name="code"
        autoComplete="one-time-code"
        maxLength={16}
        autoFocus
        hint="Ouvrez votre application d’authentification. Téléphone perdu ? Saisissez un de vos codes de secours."
      />
      <SubmitButton pendingLabel="Vérification…">Valider</SubmitButton>
    </form>
  );
}

export function RequestResetForm() {
  const [state, action] = useActionState(requestResetAction, initial);
  if (state.ok) return <Alert tone="info">{state.message}</Alert>;
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Adresse e-mail" name="email" type="email" autoComplete="email" inputMode="email" autoFocus />
      <SubmitButton>Recevoir un lien de réinitialisation</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, initial);
  if (state.ok) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">{state.message}</Alert>
        <Link href="/connexion" className="text-center font-medium text-petrol underline">
          Se connecter
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <Field
        label="Nouveau mot de passe"
        name="password"
        type="password"
        autoComplete="new-password"
        error={state.errors?.password}
        hint="12 caractères minimum."
        maxLength={128}
        autoFocus
      />
      <SubmitButton pendingLabel="Enregistrement…">Changer mon mot de passe</SubmitButton>
    </form>
  );
}
