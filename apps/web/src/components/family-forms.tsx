'use client';

import { useActionState, useState } from 'react';
import { LEGAL_BASES, MODULES, RELATIONSHIPS, type Permissions } from '@bilanx/profiles/modules';
import {
  createRelativeAction,
  inviteAction,
  respondInvitationAction,
  updatePermissionsAction,
  type FormState,
} from '@/lib/server/actions';
import { Alert, Field, SubmitButton } from './forms';
import { buttonClass } from './ui';

const initial: FormState = {};
const selectCls = 'min-h-12 w-full min-w-0 rounded-xl border border-line bg-surface px-3';

export function CreateRelativeForm() {
  const [state, action] = useActionState(createRelativeAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4" key={state.attempt ?? 'initial'}>
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      <Field label="Prénom ou nom affiché" name="displayName" defaultValue={state.values?.displayName} maxLength={80} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium">
          Lien avec vous
          <select name="relationship" required defaultValue={state.values?.relationship ?? ''} className={selectCls}>
            <option value="" disabled>
              Choisir…
            </option>
            {Object.entries(RELATIONSHIPS)
              .filter(([k]) => k !== 'self')
              .map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium">
          <span>
            Date de naissance <span className="font-normal text-ink-3">(facultatif)</span>
          </span>
          <input type="date" name="birthDate" defaultValue={state.values?.birthDate} className={selectCls} />
        </label>
      </div>
      <fieldset className="flex min-w-0 flex-col gap-1 rounded-xl border border-line p-3.5">
        <legend className="px-1 text-sm font-medium">Sur quelle base gérez-vous les données de cette personne ?</legend>
        {Object.entries(LEGAL_BASES).map(([k, v]) => (
          <label key={k} className="flex min-h-11 items-start gap-3 py-1.5 text-sm">
            <input
              type="radio"
              name="legalBasis"
              value={k}
              required
              defaultChecked={state.values?.legalBasis === k}
              className="mt-0.5 size-5 shrink-0 accent-[var(--petrol)]"
            />
            <span>{v}</span>
          </label>
        ))}
      </fieldset>
      <label className="flex gap-3 rounded-xl bg-surface-2 p-3.5 text-sm">
        <input type="checkbox" name="attested" defaultChecked={state.values?.attested === 'on'} className="mt-0.5 size-5 shrink-0 accent-[var(--petrol)]" />
        <span>
          Je certifie sur l’honneur que cette déclaration est exacte. Elle est datée et conservée. La personne concernée garde ses droits sur ses
          données (accès, correction, effacement).
        </span>
      </label>
      <SubmitButton pendingLabel="Création…">Créer le profil</SubmitButton>
    </form>
  );
}

function PermissionGrid({ initialPerms, readOnly }: { initialPerms?: Permissions; readOnly: boolean }) {
  const levels = readOnly ? (['none', 'read'] as const) : (['none', 'read', 'write'] as const);
  const label = { none: 'Aucun accès', read: 'Lecture', write: 'Lecture et saisie' } as const;
  return (
    <div className="divide-y divide-line rounded-xl border border-line">
      {MODULES.map((m) => {
        const cur = initialPerms?.[m.key] ?? 'none';
        return (
          <fieldset key={m.key} className="min-w-0 px-3 py-2">
            <legend className="float-left w-full pt-1 text-sm font-medium">{m.label}</legend>
            <div className="clear-both flex flex-wrap gap-x-4">
              {levels.map((v) => (
                <label key={v} className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={`perm_${m.key}`}
                    value={v}
                    defaultChecked={cur === v || (readOnly && v === 'read' && cur === 'write')}
                    aria-label={`${m.label} : ${v === 'none' ? 'aucun accès' : v === 'read' ? 'lecture' : 'lecture et saisie'}`}
                    className="size-5 accent-[var(--petrol)]"
                  />
                  {label[v]}
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

export function InviteForm({ profileId }: { profileId: string }) {
  const [state, action] = useActionState(inviteAction, initial);
  const [role, setRole] = useState<'caregiver' | 'guest_professional'>('caregiver');
  return (
    <form action={action} className="flex flex-col gap-4" key={state.attempt ?? (state.ok ? state.message : 'form')}>
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      {state.ok && <Alert tone="success">{state.message}</Alert>}
      <input type="hidden" name="profileId" value={profileId} />
      <Field label="Adresse e-mail de la personne invitée" name="email" type="email" inputMode="email" defaultValue={state.values?.email} />
      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1 font-medium">Rôle</legend>
        <label className="flex min-h-11 items-start gap-3 py-1">
          <input type="radio" name="role" value="caregiver" checked={role === 'caregiver'} onChange={() => setRole('caregiver')} className="size-5 accent-[var(--petrol)]" />
          <span>
            <strong>Aidant·e</strong> — proche qui vous aide (lecture, et saisie si vous l’autorisez)
          </span>
        </label>
        <label className="flex min-h-11 items-start gap-3 py-1">
          <input
            type="radio"
            name="role"
            value="guest_professional"
            checked={role === 'guest_professional'}
            onChange={() => setRole('guest_professional')}
            className="size-5 accent-[var(--petrol)]"
          />
          <span>
            <strong>Professionnel·le de santé</strong> — lecture seule, durée limitée (90 jours maximum)
          </span>
        </label>
      </fieldset>
      <div>
        <p className="mb-1 text-sm font-medium">Autorisations par rubrique</p>
        <PermissionGrid key={role} readOnly={role === 'guest_professional'} initialPerms={state.values as Permissions | undefined} />
      </div>
      <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium">
        Durée de l’accès
        <select name="accessDays" className={selectCls} defaultValue={state.values?.accessDays ?? (role === 'guest_professional' ? '30' : '')} key={`d-${role}`}>
          {role === 'caregiver' && <option value="">Jusqu’à ce que je le retire</option>}
          <option value="7">7 jours</option>
          <option value="30">30 jours</option>
          <option value="90">90 jours</option>
        </select>
      </label>
      <SubmitButton pendingLabel="Envoi…">Envoyer l’invitation</SubmitButton>
    </form>
  );
}

export function PermissionsEditor({ profileId, accessId, permissions, readOnly }: { profileId: string; accessId: string; permissions: Permissions; readOnly: boolean }) {
  const [state, action] = useActionState(updatePermissionsAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="profileId" value={profileId} />
      <input type="hidden" name="accessId" value={accessId} />
      <PermissionGrid initialPerms={permissions} readOnly={readOnly} />
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      {state.ok && <Alert tone="success">{state.message}</Alert>}
      <div className="w-full sm:w-64">
        <SubmitButton pendingLabel="Enregistrement…">Enregistrer les autorisations</SubmitButton>
      </div>
    </form>
  );
}

export function RespondInvitationForm({ token }: { token: string }) {
  const [state, action] = useActionState(respondInvitationAction, initial);
  if (state.ok) return <Alert tone="info">{state.message}</Alert>;
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      <input type="hidden" name="token" value={token} />
      <button type="submit" name="decision" value="accept" className={buttonClass({ variant: 'primary' })}>
        Accepter l’invitation
      </button>
      <button type="submit" name="decision" value="decline" className={buttonClass({ variant: 'secondary' })}>
        Refuser
      </button>
    </form>
  );
}
