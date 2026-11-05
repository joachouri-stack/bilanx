'use client';

import { useActionState, useEffect, useState } from 'react';
import { browserSupportsWebAuthn, startAuthentication, startRegistration, WebAuthnError } from '@simplewebauthn/browser';
import {
  passkeyLoginOptionsAction,
  passkeyRegisterAction,
  passkeyRegistrationOptionsAction,
  passkeySignInAction,
  removePasskeyAction,
  type FormState,
} from '@/lib/server/actions';
import { Alert, Field, SubmitButton } from './forms';

/** Message compréhensible quand l'utilisateur annule ou que l'appareil refuse. */
function webauthnMessage(e: unknown): string {
  if (e instanceof WebAuthnError && e.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') return 'Cet appareil a déjà une clé d’accès pour BILANX.';
  if (e instanceof Error && (e.name === 'NotAllowedError' || e.name === 'AbortError')) return 'Opération annulée ou délai dépassé.';
  return 'Votre appareil n’a pas pu utiliser de clé d’accès.';
}

function useSupported() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => setOk(browserSupportsWebAuthn()), []);
  return ok;
}

/** Connexion par clé d'accès (page de connexion). */
export function PasskeySignIn({ suite }: { suite?: string }) {
  const supported = useSupported();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!supported) return null;
  return (
    <div className="flex flex-col gap-3">
      {error && <Alert tone="error">{error}</Alert>}
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setError(null);
          setBusy(true);
          try {
            const o = await passkeyLoginOptionsAction();
            if ('error' in o) return setError(o.error);
            const response = await startAuthentication({ optionsJSON: o.options });
            const remember = (document.getElementById('remember-device') as HTMLInputElement | null)?.checked ?? false;
            const r = await passkeySignInAction(o.challengeId, response, suite ?? null, remember);
            if (!r.ok) return setError(r.error);
            window.location.assign(r.next);
          } catch (e) {
            setError(webauthnMessage(e));
          } finally {
            setBusy(false);
          }
        }}
        className="min-h-12 rounded-xl border border-line bg-surface px-4 font-semibold hover:bg-surface-2 disabled:opacity-60"
      >
        {busy ? 'En attente de votre appareil…' : '🔑 Se connecter avec une clé d’accès'}
      </button>
    </div>
  );
}

export interface PasskeyItem {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/** Liste, ajout et suppression des clés d'accès (paramètres). */
export function PasskeyManager({ keys }: { keys: PasskeyItem[] }) {
  const supported = useSupported();
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [removed, remove] = useActionState(removePasskeyAction, {} as FormState);

  return (
    <div className="flex flex-col gap-3.5">
      <p className="text-sm text-ink-2">
        Connectez-vous avec Face ID, l’empreinte digitale ou le code de votre appareil, sans mot de passe ni code à 6 chiffres. Une clé
        d’accès ne fonctionne que sur le vrai site BILANX : elle protège de l’hameçonnage.
      </p>
      {removed.ok && <Alert tone="success">{removed.message}</Alert>}
      {keys.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line" aria-label="Clés d’accès enregistrées">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-col gap-2 p-3 text-sm">
              <span>
                <span className="font-medium">🔑 {k.label}</span>
                <span className="block text-xs text-ink-3">
                  Ajoutée le {k.createdAt}
                  {k.lastUsedAt ? ` · dernière connexion le ${k.lastUsedAt}` : ' · jamais utilisée'}
                </span>
              </span>
              <details>
                <summary className="cursor-pointer text-xs text-ink-3 underline">Supprimer</summary>
                <form action={remove} className="mt-2 flex flex-col gap-2" key={removed.attempt ?? 'initial'}>
                  <input type="hidden" name="id" value={k.id} />
                  {removed.errors?.form && <Alert tone="error">{removed.errors.form}</Alert>}
                  <Field label="Mot de passe actuel" name="currentPassword" type="password" autoComplete="current-password" error={removed.errors?.currentPassword} />
                  <SubmitButton pendingLabel="Suppression…">Supprimer cette clé</SubmitButton>
                </form>
              </details>
            </li>
          ))}
        </ul>
      )}
      {supported === false ? (
        <p className="text-sm text-ink-3">Ce navigateur ne prend pas en charge les clés d’accès.</p>
      ) : done ? (
        <Alert tone="success">Clé d’accès ajoutée. Vous pourrez l’utiliser à la prochaine connexion.</Alert>
      ) : (
        <form
          className="flex flex-col gap-3.5"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setError(null);
            setFieldError(undefined);
            setBusy(true);
            try {
              const o = await passkeyRegistrationOptionsAction(String(fd.get('currentPassword') ?? ''));
              if (!o.ok) {
                setFieldError(o.errors.currentPassword);
                if (o.errors.form) setError(o.errors.form);
                return;
              }
              const response = await startRegistration({ optionsJSON: o.options });
              const r = await passkeyRegisterAction(o.challengeId, response, String(fd.get('label') ?? ''));
              if (!r.ok) return setError(r.error);
              setDone(true);
            } catch (err) {
              setError(webauthnMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="Nom de l’appareil" name="label" maxLength={60} required={false} hint="Pour la reconnaître, ex. « iPhone de Jo »." />
          <Field label="Mot de passe actuel" name="currentPassword" type="password" autoComplete="current-password" error={fieldError} />
          <button type="submit" disabled={busy} className="min-h-12 rounded-xl bg-petrol px-4 font-semibold text-on-accent disabled:opacity-60">
            {busy ? 'En attente de votre appareil…' : 'Ajouter une clé d’accès'}
          </button>
        </form>
      )}
    </div>
  );
}
