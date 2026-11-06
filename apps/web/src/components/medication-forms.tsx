'use client';

import { useActionState, useState } from 'react';
import { saveMedicationAction, stopMedicationAction, type FormState } from '@/lib/server/actions';
import { Alert, SubmitButton } from './forms';
import { Icon } from './icon';
import { buttonClass } from './ui';

const input = 'min-h-11 w-full rounded-xl border bg-surface px-3 text-base outline-none focus:border-petrol focus:ring-2 focus:ring-petrol-2';
const cls = (err?: string) => `${input} ${err ? 'border-red' : 'border-line'}`;
const Err = ({ msg }: { msg?: string }) =>
  msg ? (
    <p role="alert" className="text-sm text-red">
      {msg}
    </p>
  ) : null;
const opt = (k: string) => <span className="font-normal text-ink-3">{k}</span>;

export interface MedicationDefaults {
  id?: string;
  name?: string;
  strength?: string;
  posology?: string;
  slots?: { time: string; qty: string }[];
  startDate?: string;
  endDate?: string;
  prescriber?: string;
}

function parseSlots(json: string | undefined): { time: string; qty: string }[] | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? v.map((x) => ({ time: String(x?.time ?? ''), qty: String(x?.qty ?? '') })) : null;
  } catch {
    return null;
  }
}

function Slots({ initial, error }: { initial: { time: string; qty: string }[]; error?: string }) {
  const [rows, setRows] = useState(() => initial.map((r, i) => ({ ...r, key: i })));
  const [next, setNext] = useState(initial.length);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">
        Heures de prise {opt('(laissez vide pour un traitement « si besoin »)')}
      </legend>
      {rows.map((r, i) => (
        <div key={r.key} className="grid grid-cols-[112px_minmax(0,1fr)_auto] items-center gap-2">
          <input type="time" name="times" aria-label={`Heure de la prise ${i + 1}`} defaultValue={r.time} className={cls(error)} />
          <input name="qty" aria-label={`Quantité de la prise ${i + 1}`} maxLength={40} defaultValue={r.qty} placeholder="ex. 1 comprimé" className={cls()} />
          <button
            type="button"
            onClick={() => setRows(rows.filter((x) => x.key !== r.key))}
            className="grid min-h-11 min-w-11 place-items-center rounded-xl text-ink-3 hover:bg-surface-2"
            aria-label={`Retirer la prise ${i + 1}`}
          >
            <Icon name="close" className="size-5" />
          </button>
        </div>
      ))}
      {rows.length < 8 && (
        <button
          type="button"
          onClick={() => {
            setRows([...rows, { time: '', qty: '', key: next }]);
            setNext(next + 1);
          }}
          className={buttonClass({ variant: 'ghost', className: 'self-start -ml-3' })}
        >
          <Icon name="plus" className="size-5" /> Ajouter une heure de prise
        </button>
      )}
      <Err msg={error} />
    </fieldset>
  );
}

/**
 * Saisie du traitement tel que PRESCRIT (ordonnance). BILANX ne propose ni dose ni horaire :
 * tout est recopié par l'utilisateur. `mode="change"` enregistre une nouvelle prescription.
 */
export function MedicationForm({ initial, mode, today }: { initial: MedicationDefaults; mode: 'create' | 'edit' | 'change'; today: string }) {
  const [state, action] = useActionState(saveMedicationAction, {} as FormState);
  const v: Record<string, string | undefined> = {
    name: initial.name,
    strength: initial.strength,
    posology: initial.posology,
    startDate: initial.startDate ?? (mode === 'create' ? today : undefined),
    endDate: initial.endDate,
    prescriber: initial.prescriber,
    effectiveDate: today,
    ...(state.values ?? {}),
  };
  const slots = parseSlots(state.values?.slots) ?? initial.slots ?? [];
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-3.5" key={state.attempt ?? 'initial'}>
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      {mode === 'change' && <input type="hidden" name="mode" value="change" />}
      {mode === 'change' && (
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Date d’effet de la nouvelle prescription
          <input type="date" name="effectiveDate" defaultValue={v.effectiveDate} className={cls(fe.effectiveDate)} />
          <span className="text-[13px] font-normal text-ink-3">L’ancienne prescription s’arrête la veille ; elle reste dans l’historique.</span>
          <Err msg={fe.effectiveDate} />
        </label>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Médicament
          <input name="name" maxLength={120} defaultValue={v.name} placeholder="ex. Metformine" autoComplete="off" className={cls(fe.name)} />
          <Err msg={fe.name} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          <span>Dosage {opt('(facultatif)')}</span>
          <input name="strength" maxLength={60} defaultValue={v.strength} placeholder="ex. 1000 mg" className={cls(fe.strength)} />
          <Err msg={fe.strength} />
        </label>
      </div>
      <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
        Posologie prescrite
        <input name="posology" maxLength={300} defaultValue={v.posology} placeholder="recopiez l’ordonnance, ex. 1 comprimé matin et soir" className={cls(fe.posology)} />
        <Err msg={fe.posology} />
      </label>
      <Slots initial={slots} error={fe.times} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {mode !== 'change' && (
          <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
            <span>Début {opt('(facultatif)')}</span>
            <input type="date" name="startDate" defaultValue={v.startDate} className={cls(fe.startDate)} />
            <Err msg={fe.startDate} />
          </label>
        )}
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          <span>Fin {opt('(facultatif)')}</span>
          <input type="date" name="endDate" defaultValue={v.endDate} className={cls(fe.endDate)} />
          <Err msg={fe.endDate} />
        </label>
      </div>
      <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
        <span>Prescrit par {opt('(facultatif)')}</span>
        <input name="prescriber" maxLength={120} defaultValue={v.prescriber} placeholder="ex. Dr Martin" className={cls(fe.prescriber)} />
      </label>
      <SubmitButton pendingLabel="Enregistrement…">
        {mode === 'create' ? 'Ajouter le médicament' : mode === 'edit' ? 'Corriger la saisie' : 'Enregistrer la nouvelle prescription'}
      </SubmitButton>
    </form>
  );
}

export function StopMedicationForm({ id, today }: { id: string; today: string }) {
  const [state, action] = useActionState(stopMedicationAction, {} as FormState);
  const v = state.values ?? {};
  return (
    <form action={action} className="flex flex-col gap-3" key={state.attempt ?? 'initial'}>
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      <input type="hidden" name="id" value={id} />
      <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
        Arrêté à partir du
        <input type="date" name="date" defaultValue={v.date ?? today} className={cls()} />
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
        <span>Motif {opt('(facultatif)')}</span>
        <input name="reason" maxLength={300} defaultValue={v.reason} placeholder="ex. fin de la cure, décision du médecin" className={cls()} />
      </label>
      <SubmitButton pendingLabel="Enregistrement…">Noter l’arrêt</SubmitButton>
    </form>
  );
}
