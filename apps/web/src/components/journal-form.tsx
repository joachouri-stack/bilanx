'use client';

import { useActionState, useState } from 'react';
import { JOURNAL_KINDS, KINDS_WITH_DURATION, KINDS_WITH_INTENSITY, MEAL_KINDS, type JournalKind } from '@bilanx/domain';
import { addJournalAction, type FormState } from '@/lib/server/actions';
import { Alert, SubmitButton } from './forms';

const input = 'min-h-11 w-full rounded-xl border bg-surface px-3 text-base outline-none focus:border-petrol focus:ring-2 focus:ring-petrol-2';
const cls = (err?: string) => `${input} ${err ? 'border-red' : 'border-line'}`;
const Err = ({ msg }: { msg?: string }) =>
  msg ? (
    <p role="alert" className="text-sm text-red">
      {msg}
    </p>
  ) : null;

/** Repas suggéré selon l'heure, seulement comme valeur de départ du menu (modifiable). */
function mealFor(time: string): string {
  const h = Number(time.slice(0, 2));
  return h < 10 ? 'breakfast' : h < 15 ? 'lunch' : h < 18 ? 'snack' : 'dinner';
}

export function JournalForm({ date, defaultTime }: { date: string; defaultTime: string }) {
  const [state, action] = useActionState(addJournalAction, {} as FormState);
  const v: Record<string, string | undefined> = state.ok ? { kind: state.values?.kind } : (state.values ?? {});
  const fe = state.fieldErrors ?? {};
  const [kind, setKind] = useState<JournalKind>((v.kind as JournalKind) ?? 'meal');
  const time = v.time ?? defaultTime;

  return (
    <form action={action} className="flex flex-col gap-3.5" key={state.attempt ?? 'initial'}>
      {state.ok && <Alert tone="success">{state.message}</Alert>}
      {state.errors?.form && !state.ok && <Alert tone="error">{state.errors.form}</Alert>}
      <input type="hidden" name="kind" value={kind} />
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Type</legend>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(JOURNAL_KINDS) as JournalKind[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={`min-h-10 rounded-full border px-3 text-sm ${kind === k ? 'border-petrol bg-petrol-2 font-medium text-petrol' : 'border-line'}`}
            >
              <span aria-hidden>{JOURNAL_KINDS[k].icon}</span> {JOURNAL_KINDS[k].label}
            </button>
          ))}
        </div>
      </fieldset>

      {kind === 'meal' && (
        <label className="flex flex-col gap-1 text-sm font-medium">
          Repas
          <select name="mealKind" defaultValue={v.mealKind || mealFor(time)} className={cls(fe.mealKind)}>
            {Object.entries(MEAL_KINDS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <Err msg={fe.mealKind} />
        </label>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Date
          <input type="date" name="date" defaultValue={v.date ?? date} className={cls(fe.date)} />
          <Err msg={fe.date} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Heure{KINDS_WITH_DURATION.includes(kind) ? ' de début' : ''}
          <input type="time" name="time" defaultValue={time} className={cls(fe.time)} />
          <Err msg={fe.time} />
        </label>
      </div>
      {KINDS_WITH_DURATION.includes(kind) && (
        <label className="flex flex-col gap-1 text-sm font-medium">
          Heure de fin <span className="font-normal text-ink-3">(facultatif)</span>
          <input type="time" name="endTime" defaultValue={v.endTime} className={cls(fe.endTime)} />
          <Err msg={fe.endTime} />
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm font-medium">
        {kind === 'meal' ? 'Ce que vous avez mangé' : 'Description'}
        <input
          name="description"
          maxLength={300}
          defaultValue={v.description}
          placeholder={kind === 'meal' ? 'ex. pâtes, salade, yaourt' : kind === 'activity' ? 'ex. marche, vélo' : kind === 'medication' ? 'ex. paracétamol 1 g' : ''}
          className={cls(fe.description)}
        />
        <Err msg={fe.description} />
      </label>

      {kind === 'meal' && (
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Quantités <span className="font-normal text-ink-3">(facultatif)</span>
            <input name="quantities" maxLength={200} defaultValue={v.quantities} className={cls(fe.quantities)} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Glucides (g) <span className="font-normal text-ink-3">(si connus)</span>
            <input name="carbs" inputMode="decimal" defaultValue={v.carbs} className={cls(fe.carbs)} />
            <Err msg={fe.carbs} />
          </label>
        </div>
      )}

      {KINDS_WITH_INTENSITY.includes(kind) && (
        <fieldset>
          <legend className="mb-1 text-sm font-medium">
            Intensité <span className="font-normal text-ink-3">(facultatif)</span>
          </legend>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="flex min-h-10 min-w-10 cursor-pointer items-center justify-center rounded-lg border border-line text-sm has-[:checked]:border-petrol has-[:checked]:bg-petrol-2 has-[:checked]:font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-petrol">
                <input type="radio" name="intensity" value={n} defaultChecked={v.intensity === String(n)} className="sr-only" />
                {n}
              </label>
            ))}
          </div>
          <Err msg={fe.intensity} />
        </fieldset>
      )}

      <label className="flex flex-col gap-1 text-sm font-medium">
        Commentaire <span className="font-normal text-ink-3">(facultatif)</span>
        <textarea name="comment" rows={2} maxLength={500} defaultValue={v.comment} className={`${cls(fe.comment)} py-2`} />
      </label>
      <SubmitButton pendingLabel="Enregistrement…">Ajouter au journal</SubmitButton>
      <p className="text-xs text-ink-3">Les glucides ne sont jamais estimés par BILANX : seules les valeurs que vous indiquez sont enregistrées.</p>
    </form>
  );
}
