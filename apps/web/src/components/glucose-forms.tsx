'use client';

import { useActionState } from 'react';
import { GLUCOSE_CONTEXTS, type GlucoseUnit } from '@bilanx/domain';
import { addGlucoseAction, type FormState } from '@/lib/server/actions';
import { SubmitButton } from './forms';

const EX: Record<GlucoseUnit, string> = { 'mg/dL': 'ex. 110', 'g/L': 'ex. 1,10', 'mmol/L': 'ex. 6,1' };

/** Glycémie du lecteur (au bout du doigt), saisie dans l'unité d'affichage du profil. */
export function GlucoseEntryForm({ unit, today, defaultDate, defaultTime }: { unit: GlucoseUnit; today: string; defaultDate: string; defaultTime: string }) {
  const [state, action] = useActionState(addGlucoseAction, {} as FormState);
  const fe = state.fieldErrors ?? {};
  const v = state.values ?? {};
  const input = 'min-h-11 w-full rounded-xl border border-line bg-surface px-3';
  return (
    <form action={action} className="flex flex-col gap-3" key={state.attempt ?? 'initial'}>
      <input type="hidden" name="unit" value={unit} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        Valeur ({unit})
        <input
          name="value"
          required
          inputMode="decimal"
          autoComplete="off"
          placeholder={EX[unit]}
          defaultValue={v.value}
          aria-invalid={!!fe.value}
          aria-describedby={fe.value ? 'e-gvalue' : undefined}
          className={`tabular text-lg ${input}`}
        />
        {fe.value && (
          <span id="e-gvalue" className="text-sm font-normal text-red" role="alert">
            {fe.value}
          </span>
        )}
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Jour
          <input type="date" name="date" required max={today} defaultValue={v.date ?? defaultDate} aria-invalid={!!fe.date} className={input} />
          {fe.date && <span className="text-sm font-normal text-red">{fe.date}</span>}
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Heure
          <input type="time" name="time" required defaultValue={v.time ?? defaultTime} aria-invalid={!!fe.time} className={input} />
          {fe.time && <span className="text-sm font-normal text-red">{fe.time}</span>}
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Moment (facultatif)
        <select name="context" defaultValue={v.context ?? ''} className={input}>
          <option value="">Non précisé</option>
          {Object.entries(GLUCOSE_CONTEXTS).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <SubmitButton pendingLabel="Enregistrement…">Enregistrer la glycémie</SubmitButton>
      {state.errors?.form && (
        <p className="text-sm text-red" role="alert">
          {state.errors.form}
        </p>
      )}
      {state.ok && (
        <p className="text-sm text-sage" role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}
