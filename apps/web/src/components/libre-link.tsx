'use client';

import { useActionState } from 'react';
import { connectLibreAction, disconnectLibreAction, syncLibreAction, type FormState } from '@/lib/server/actions';
import { Alert, SubmitButton } from './forms';
import { Icon } from './icon';
import { Chip, buttonClass } from './ui';

export interface LibreStatusView {
  email: string;
  patientName: string | null;
  status: 'active' | 'error';
  lastSyncAt: string | null;
  lastReadingAt: string | null;
  lastError: string | null;
}

const field = 'min-h-12 w-full min-w-0 rounded-xl border border-line bg-surface px-3 text-base';
const fmt = (iso: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(new Date(iso));

/**
 * Capteur FreeStyle Libre relié via LibreLinkUp (compte « suiveur » dédié) : état et actions,
 * ou formulaire de connexion avec la marche à suivre.
 */
export function LibreLink({ status }: { status: LibreStatusView | null }) {
  const [state, action] = useActionState(connectLibreAction, {} as FormState);

  if (status)
    return (
      <div className="flex flex-col gap-3 text-[15px]">
        <p className="flex flex-wrap items-center gap-2">
          <Chip tone={status.status === 'active' && !status.lastError ? 'sage' : 'red'}>
            {status.status === 'active' && !status.lastError ? 'Synchronisation automatique' : 'En panne'}
          </Chip>
          <span className="text-ink-2">
            {status.patientName ? `${status.patientName} · ` : ''}
            {status.email}
          </span>
        </p>
        {state.ok && <Alert tone="success">{state.message}</Alert>}
        <ul className="text-sm text-ink-2">
          <li>Dernière mesure reçue : {status.lastReadingAt ? fmt(status.lastReadingAt) : 'aucune pour l’instant'}</li>
          <li>Dernière vérification : {status.lastSyncAt ? fmt(status.lastSyncAt) : '—'} (toutes les 5 min environ)</li>
        </ul>
        {status.lastError && (
          <Alert tone="error">
            {status.lastError}
            {status.status === 'error' && ' Corrigez le problème puis touchez « Réessayer » (ou reconnectez le capteur).'}
          </Alert>
        )}
        <div className="flex flex-wrap gap-2">
          <form action={syncLibreAction}>
            <SubmitButton pendingLabel="Synchronisation…">{status.status === 'error' ? 'Réessayer' : 'Synchroniser maintenant'}</SubmitButton>
          </form>
          <details className="group">
            <summary className={buttonClass({ variant: 'ghost', className: 'cursor-pointer list-none text-red' })}>Déconnecter le capteur</summary>
            <form action={disconnectLibreAction} className="mt-2">
              <p className="mb-2 text-sm text-ink-2">Les identifiants sont effacés ; les mesures déjà importées restent.</p>
              <button type="submit" className={buttonClass({ variant: 'danger' })}>
                Confirmer la déconnexion
              </button>
            </form>
          </details>
        </div>
        <p className="text-[13px] text-ink-3">
          Connexion non officielle (celle de l’app LibreLinkUp) : elle peut s’interrompre si Abbott la modifie. Vérifiez vos glycémies dans l’app FreeStyle Libre
          avant toute décision de traitement.
        </p>
      </div>
    );

  return (
    <div className="flex flex-col gap-4 text-[15px]">
      <p className="text-ink-2">
        BILANX récupère vos glycémies <strong className="text-ink">toutes les 5 minutes</strong>, comme un proche qui suit votre capteur dans l’app LibreLinkUp.
      </p>
      <details className="group rounded-xl border border-line">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-3 font-semibold [&::-webkit-details-marker]:hidden">
          À faire d’abord sur l’iPhone (5 min)
          <Icon name="chevronDown" className="size-5 shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
        </summary>
        <ol className="flex list-decimal flex-col gap-2 px-3 pb-4 pl-8 pt-1 leading-snug marker:font-semibold marker:text-petrol">
          <li>
            Installez l’app <strong>LibreLinkUp</strong> (Abbott) et créez un compte avec une <strong>autre adresse e-mail</strong> que votre compte FreeStyle
            Libre.
          </li>
          <li>
            Dans l’app <strong>FreeStyle Libre 2</strong> : Menu ☰ › <strong>Applications connectées</strong> › <strong>LibreLinkUp</strong> › Connecter, et
            invitez cette nouvelle adresse.
          </li>
          <li>
            Dans l’app <strong>LibreLinkUp</strong>, acceptez l’invitation et les conditions : votre glycémie doit s’y afficher.
          </li>
          <li>Saisissez ci-dessous l’e-mail et le mot de passe de ce compte LibreLinkUp.</li>
        </ol>
      </details>
      <form action={action} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          E-mail du compte LibreLinkUp
          <input name="email" type="email" required autoComplete="off" autoCapitalize="none" defaultValue={state.values?.email} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Mot de passe du compte LibreLinkUp
          <input name="password" type="password" required autoComplete="off" className={field} />
        </label>
        {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
        <SubmitButton pendingLabel="Connexion à LibreLinkUp…">Relier mon capteur</SubmitButton>
      </form>
      <p className="text-[13px] text-ink-3">
        Utilisez un compte <strong>dédié</strong>, jamais votre compte principal : il ne peut que lire vos glycémies, et vous pouvez le couper à tout moment depuis
        l’app FreeStyle Libre. Le mot de passe est conservé chiffré. Connexion non officielle : elle peut s’interrompre si Abbott la modifie.
      </p>
    </div>
  );
}
