'use client';

import { useActionState } from 'react';
import { addWeightAction, type FormState } from '@/lib/server/actions';
import { Alert, SubmitButton } from './forms';

const field = 'min-h-12 w-full min-w-0 rounded-xl border border-line bg-surface px-3 text-base';

/** Saisie d'une pesée avec sa date (page Poids). */
export function WeightForm({ today, last }: { today: string; last: number | null }) {
  const [state, action] = useActionState(addWeightAction, {} as FormState);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Poids (kg)
          <input
            key={state.attempt}
            name="kg"
            inputMode="decimal"
            autoComplete="off"
            required
            placeholder={last !== null ? last.toLocaleString('fr-FR', { minimumFractionDigits: 1 }) : '72,5'}
            defaultValue={state.ok ? '' : state.values?.kg}
            className={field}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Date
          <input type="date" name="day" max={today} defaultValue={state.ok ? today : (state.values?.day ?? today)} required className={field} />
        </label>
      </div>
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      {state.ok && <Alert tone="success">{state.message}</Alert>}
      <SubmitButton pendingLabel="Enregistrement…">Enregistrer le poids</SubmitButton>
      <p className="text-[13px] text-ink-3">Une pesée par jour : en saisir une nouvelle le même jour remplace la précédente.</p>
    </form>
  );
}
