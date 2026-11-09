'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { addVaultAction, removeVaultAction, revealVaultAction, updateVaultPasswordAction, type FormState } from '@/lib/server/actions';
import { Alert, SubmitButton } from './forms';
import { Icon } from './icon';
import { buttonClass } from './ui';

export interface VaultItem {
  id: string;
  service: string;
  url: string | null;
  login: string | null;
  note: string | null;
}

const field = 'min-h-12 w-full min-w-0 rounded-xl border border-line bg-surface px-3 text-base';
const iconBtn = 'grid size-10 shrink-0 place-items-center rounded-full text-ink-2 transition hover:bg-surface-2 active:scale-95';

/** Initiale colorée du service (couleur stable selon le nom). */
function Avatar({ name }: { name: string }) {
  const tones = ['bg-glucose-2 text-glucose', 'bg-sage-2 text-go', 'bg-violet-2 text-violet', 'bg-rose-2 text-rose', 'bg-amber-2 text-amber', 'bg-indigo-2 text-indigo', 'bg-petrol-2 text-petrol'];
  const i = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % tones.length;
  return (
    <span className={`grid size-11 shrink-0 place-items-center rounded-xl text-lg font-bold ${tones[i]}`} aria-hidden>
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function Entry({ e }: { e: VaultItem }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState<'login' | 'password' | null>(null);
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState(updateVaultPasswordAction, {} as FormState);

  // Le mot de passe affiché se masque tout seul au bout de 30 secondes.
  useEffect(() => {
    if (secret === null) return;
    const t = window.setTimeout(() => setSecret(null), 30_000);
    return () => window.clearTimeout(t);
  }, [secret]);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(null), 1800);
    return () => window.clearTimeout(t);
  }, [copied]);
  useEffect(() => {
    if (state.ok) setEditing(false);
  }, [state]);

  const getSecret = async () => secret ?? (await revealVaultAction(e.id));

  return (
    <li className="rounded-2xl border border-line bg-surface p-3.5 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-3">
        <Avatar name={e.service} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{e.service}</p>
          {e.url && (
            <a href={e.url} target="_blank" rel="noopener noreferrer" className="block truncate text-[13px] text-petrol">
              {e.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
            </a>
          )}
        </div>
        {e.url && (
          <a href={e.url} target="_blank" rel="noopener noreferrer" className={iconBtn} aria-label={`Ouvrir ${e.service}`}>
            <Icon name="share" className="size-5" />
          </a>
        )}
      </div>

      <dl className="mt-3 divide-y divide-line rounded-xl bg-surface-2">
        {e.login && (
          <div className="flex items-center gap-2 px-3 py-1.5">
            <dt className="w-24 shrink-0 text-[13px] text-ink-3">Identifiant</dt>
            <dd className="min-w-0 flex-1 truncate text-[15px]">{e.login}</dd>
            <button type="button" className={iconBtn} aria-label={`Copier l’identifiant ${e.service}`} onClick={async () => (await copy(e.login!)) && setCopied('login')}>
              <Icon name={copied === 'login' ? 'check' : 'copy'} className="size-[18px]" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 px-3 py-1.5">
          <dt className="w-24 shrink-0 text-[13px] text-ink-3">Mot de passe</dt>
          <dd className="min-w-0 flex-1 truncate font-mono text-[15px]" aria-live="polite">
            {secret ?? '••••••••••'}
          </dd>
          <button
            type="button"
            className={iconBtn}
            disabled={pending}
            aria-label={secret ? `Masquer le mot de passe ${e.service}` : `Afficher le mot de passe ${e.service}`}
            onClick={() => (secret ? setSecret(null) : start(async () => setSecret(await revealVaultAction(e.id))))}
          >
            <Icon name={secret ? 'close' : 'eye'} className="size-[18px]" />
          </button>
          <button
            type="button"
            className={iconBtn}
            disabled={pending}
            aria-label={`Copier le mot de passe ${e.service}`}
            onClick={() =>
              start(async () => {
                const s = await getSecret();
                if (s && (await copy(s))) setCopied('password');
              })
            }
          >
            <Icon name={copied === 'password' ? 'check' : 'copy'} className="size-[18px]" />
          </button>
        </div>
      </dl>
      {copied && (
        <p role="status" className="mt-2 text-[13px] font-medium text-go">
          {copied === 'login' ? 'Identifiant copié' : 'Mot de passe copié'}
        </p>
      )}
      {e.note && <p className="mt-2 text-[13px] text-ink-2">{e.note}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <button type="button" onClick={() => setEditing((v) => !v)} className={buttonClass({ variant: 'ghost', className: 'text-sm' })}>
          {editing ? 'Annuler' : 'Changer le mot de passe'}
        </button>
        <details className="group ml-auto">
          <summary className={buttonClass({ variant: 'ghost', className: 'cursor-pointer list-none text-sm text-red [&::-webkit-details-marker]:hidden' })}>
            Supprimer<span className="sr-only"> {e.service}</span>
          </summary>
          <form action={removeVaultAction} className="mt-1">
            <input type="hidden" name="id" value={e.id} />
            <button type="submit" className={buttonClass({ variant: 'danger', className: 'text-sm' })}>
              Confirmer la suppression
            </button>
          </form>
        </details>
      </div>
      {editing && (
        <form action={action} className="mt-2 flex flex-col gap-2">
          <input type="hidden" name="id" value={e.id} />
          <label className="flex flex-col gap-1 text-sm font-medium">
            Nouveau mot de passe
            <input name="password" type="password" required autoComplete="new-password" className={field} />
          </label>
          {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
          <SubmitButton pendingLabel="Enregistrement…">Enregistrer</SubmitButton>
        </form>
      )}
    </li>
  );
}

export function VaultList({ items }: { items: VaultItem[] }) {
  return items.length ? (
    <ul className="flex flex-col gap-3">
      {items.map((e) => (
        <Entry key={e.id} e={e} />
      ))}
    </ul>
  ) : (
    <p className="rounded-2xl border border-dashed border-line p-6 text-center text-ink-2">Aucun identifiant enregistré pour l’instant.</p>
  );
}

const SUGGESTIONS = ['Doctolib', 'Ameli', 'Mutuelle', 'LibreView', 'Laboratoire', 'Pharmacie'];

export function VaultAddForm() {
  const [state, action] = useActionState(addVaultAction, {} as FormState);
  const [service, setService] = useState('');
  useEffect(() => {
    if (state.ok) setService('');
  }, [state]);
  return (
    <form action={action} key={state.attempt} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setService(s)}
            className={`min-h-9 rounded-full px-3 text-sm font-medium transition ${service === s ? 'bg-petrol text-on-accent' : 'bg-surface-2 text-ink-2'}`}
          >
            {s}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Service
        <input name="service" required maxLength={80} value={service} onChange={(e) => setService(e.target.value)} placeholder="ex. Doctolib" className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Adresse e-mail ou identifiant
        <input name="login" maxLength={200} autoComplete="off" autoCapitalize="none" defaultValue={state.values?.login} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Mot de passe
        <input name="password" type="password" required autoComplete="new-password" className={field} />
      </label>
      <details className="group rounded-xl border border-line">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm text-ink-2 [&::-webkit-details-marker]:hidden">
          <Icon name="plus" className="size-4" />
          <span className="flex-1">Site et note (facultatif)</span>
          <Icon name="chevronDown" className="size-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="flex flex-col gap-3 px-3 pb-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Adresse du site
            <input name="url" inputMode="url" autoCapitalize="none" placeholder="ex. doctolib.fr" defaultValue={state.values?.url} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Note
            <input name="note" maxLength={500} placeholder="ex. compte de maman" defaultValue={state.values?.note} className={field} />
          </label>
        </div>
      </details>
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      {state.ok && <Alert tone="success">{state.message}</Alert>}
      <SubmitButton pendingLabel="Enregistrement…">Enregistrer</SubmitButton>
    </form>
  );
}
