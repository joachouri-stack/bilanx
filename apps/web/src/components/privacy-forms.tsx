'use client';

import { useActionState } from 'react';
import { deleteProfileAction, requestAccountDeletionAction, type FormState } from '@/lib/server/actions';
import { Alert } from './forms';
import { buttonClass } from './ui';
import { useFormStatus } from 'react-dom';

const input = 'min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-base';

function DangerButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass({ variant: 'danger' })}>
      {pending ? 'Patientez…' : children}
    </button>
  );
}

export function DeleteAccountForm() {
  const [state, action] = useActionState(requestAccountDeletionAction, {} as FormState);
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      <label className="flex flex-col gap-1 text-sm font-medium">
        Mot de passe
        <input type="password" name="password" autoComplete="current-password" required className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Saisissez SUPPRIMER pour confirmer
        <input name="confirm" autoComplete="off" required className={input} />
      </label>
      <div>
        <DangerButton>Programmer la suppression</DangerButton>
      </div>
    </form>
  );
}

export function DeleteProfileForm({ profileId, name }: { profileId: string; name: string }) {
  const [state, action] = useActionState(deleteProfileAction, {} as FormState);
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      <input type="hidden" name="profileId" value={profileId} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        Saisissez « {name} » pour confirmer
        <input name="confirmName" autoComplete="off" required className={input} />
      </label>
      <div>
        <DangerButton>Supprimer ce profil</DangerButton>
      </div>
    </form>
  );
}
