'use client';

import { useActionState } from 'react';
import { INSULIN_TYPES } from '@bilanx/domain';
import { addChangeAction, addDoseAction, addProductAction, type FormState } from '@/lib/server/actions';
import { Alert, SubmitButton } from './forms';

const input = 'min-h-11 w-full rounded-xl border bg-surface px-3 text-base outline-none focus:border-petrol focus:ring-2 focus:ring-petrol-2';
const cls = (err?: string) => `${input} ${err ? 'border-red' : 'border-line'}`;

function Err({ msg }: { msg?: string }) {
  return msg ? (
    <p role="alert" className="text-sm text-red">
      {msg}
    </p>
  ) : null;
}

export interface ProductOption {
  id: string;
  name: string;
  type: string;
}

/**
 * Saisie d'une injection. La dose n'est JAMAIS préremplie ni suggérée : l'utilisateur
 * indique ce qui a été injecté (ou prévu, ou sauté).
 */
export function DoseForm({ products, today, nowTime }: { products: ProductOption[]; today: string; nowTime: string }) {
  const [state, action] = useActionState(addDoseAction, {} as FormState);
  const v: Record<string, string | undefined> = state.ok ? { productId: state.values?.productId } : (state.values ?? {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-3.5" key={state.attempt ?? 'initial'}>
      {state.ok && <Alert tone="success">{state.message}</Alert>}
      {state.errors?.form && !state.ok && <Alert tone="error">{state.errors.form}</Alert>}
      <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
        Insuline
        <select name="productId" defaultValue={v.productId ?? products[0]?.id ?? ''} className={cls(fe.productId)}>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {INSULIN_TYPES[p.type as keyof typeof INSULIN_TYPES] ?? p.type}
            </option>
          ))}
        </select>
        <Err msg={fe.productId} />
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
        Dose injectée (unités)
        <input name="units" inputMode="decimal" autoComplete="off" defaultValue={v.units} placeholder="ex. 4" className={`${cls(fe.units)} tabular text-lg font-semibold`} />
        <Err msg={fe.units} />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Date
          <input type="date" name="date" defaultValue={v.date ?? today} className={cls(fe.date)} />
          <Err msg={fe.date} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Heure
          <input type="time" name="time" defaultValue={v.time ?? nowTime} className={cls(fe.time)} />
          <Err msg={fe.time} />
        </label>
      </div>
      <fieldset className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <legend className="mb-1 font-medium">Statut</legend>
        {[
          ['taken', 'Faite'],
          ['planned', 'Prévue'],
          ['skipped', 'Sautée'],
        ].map(([val, label]) => (
          <label key={val} className="flex min-h-11 items-center gap-2">
            <input type="radio" name="status" value={val} defaultChecked={(v.status ?? 'taken') === val} className="size-5 accent-[var(--petrol)]" />
            {label}
          </label>
        ))}
      </fieldset>
      <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
        <span>Commentaire <span className="font-normal text-ink-3">(facultatif)</span></span>
        <input name="comment" maxLength={300} defaultValue={v.comment} className={cls(fe.comment)} />
      </label>
      {state.duplicate && (
        <label className="flex gap-3 rounded-xl bg-amber-2 p-3 text-sm">
          <input type="checkbox" name="acceptDuplicate" className="mt-0.5 size-5 shrink-0 accent-[var(--petrol)]" />
          <span>Oui, il s’agit bien d’une seconde injection.</span>
        </label>
      )}
      <SubmitButton pendingLabel="Enregistrement…">Noter l’injection</SubmitButton>
      <p className="text-[13px] text-ink-3">BILANX ne propose aucune dose : c’est votre médecin qui décide.</p>
    </form>
  );
}

export function ProductForm() {
  const [state, action] = useActionState(addProductAction, {} as FormState);
  return (
    <form action={action} className="flex flex-col gap-3" key={state.attempt ?? 'initial'}>
      {state.ok && <Alert tone="success">{state.message}</Alert>}
      {state.errors?.form && !state.ok && <Alert tone="error">{state.errors.form}</Alert>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Nom (tel qu’écrit sur le stylo ou l’ordonnance)
          <input name="name" maxLength={80} defaultValue={state.ok ? '' : state.values?.name} className={cls()} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Type
          <select name="type" defaultValue={state.ok ? 'rapid' : (state.values?.type ?? 'rapid')} className={cls()}>
            {Object.entries(INSULIN_TYPES).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="sm:w-56">
        <SubmitButton pendingLabel="Ajout…">Ajouter l’insuline</SubmitButton>
      </div>
    </form>
  );
}

export function ChangeForm({ products, today }: { products: ProductOption[]; today: string }) {
  const [state, action] = useActionState(addChangeAction, {} as FormState);
  const v: Record<string, string | undefined> = state.ok ? {} : (state.values ?? {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-3" key={state.attempt ?? 'initial'}>
      {state.ok && <Alert tone="success">{state.message}</Alert>}
      {state.errors?.form && !state.ok && <Alert tone="error">{state.errors.form}</Alert>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Insuline concernée
          <select name="subject" defaultValue={v.subject ?? (products[0] ? `insulin:${products[0].id}` : '')} className={cls(fe.subject)}>
            {products.map((p) => (
              <option key={p.id} value={`insulin:${p.id}`}>
                {p.name}
              </option>
            ))}
          </select>
          <Err msg={fe.subject} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Date d’effet
          <input type="date" name="effectiveDate" defaultValue={v.effectiveDate ?? today} className={cls(fe.effectiveDate)} />
          <Err msg={fe.effectiveDate} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          <span>Avant <span className="font-normal text-ink-3">(facultatif)</span></span>
          <input name="previousRegimen" maxLength={200} defaultValue={v.previousRegimen} placeholder="ex. 18 U le soir" className={cls(fe.previousRegimen)} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Nouvelle prescription
          <input name="newRegimen" maxLength={200} defaultValue={v.newRegimen} placeholder="ex. 16 U le soir" className={cls(fe.newRegimen)} />
          <Err msg={fe.newRegimen} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          <span>Prescrit par <span className="font-normal text-ink-3">(facultatif)</span></span>
          <input name="prescribedBy" maxLength={120} defaultValue={v.prescribedBy} placeholder="ex. Dr Martin, endocrinologue" className={cls()} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          <span>Objectif défini avec le médecin <span className="font-normal text-ink-3">(facultatif)</span></span>
          <input name="goalNote" maxLength={500} defaultValue={v.goalNote} className={cls(fe.goalNote)} />
        </label>
      </div>
      <div className="sm:w-72">
        <SubmitButton pendingLabel="Enregistrement…">Enregistrer le changement</SubmitButton>
      </div>
    </form>
  );
}
