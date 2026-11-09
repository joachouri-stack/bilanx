'use client';

import { useActionState } from 'react';
import { saveContactAction, type FormState } from '@/lib/server/actions';
import { Alert, SubmitButton } from './forms';

const input = 'min-h-11 w-full rounded-xl border bg-surface px-3 text-base outline-none focus:border-petrol focus:ring-2 focus:ring-petrol-2';
const cls = (err?: string) => `${input} ${err ? 'border-red' : 'border-line'}`;
const Err = ({ msg }: { msg?: string }) =>
  msg ? (
    <p role="alert" className="text-sm font-normal text-red">
      {msg}
    </p>
  ) : null;

/** Professions proposées (le champ reste libre). */
const SPECIALTIES = [
  'Médecin généraliste', 'Endocrinologue', 'Diabétologue', 'Cardiologue', 'Ophtalmologue', 'ORL', 'Neurologue', 'Néphrologue', 'Urologue',
  'Pneumologue', 'Dermatologue', 'Gastro-entérologue', 'Gynécologue', 'Rhumatologue', 'Oncologue', 'Psychiatre', 'Psychologue', 'Radiologue',
  'Kinésithérapeute', 'Ostéopathe', 'Orthophoniste', 'Podologue', 'Diététicien·ne', 'Infirmier·ère', 'Dentiste', 'Pharmacie', 'Laboratoire', 'MDPH',
];

export interface ContactDefaults {
  id?: string;
  firstName?: string;
  lastName?: string;
  specialty?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export function ContactForm({ initial = {} }: { initial?: ContactDefaults }) {
  const [state, action] = useActionState(saveContactAction, {} as FormState);
  const v: Record<string, string | undefined> = { ...initial, ...(state.values ?? {}) };
  const fe = state.fieldErrors ?? {};
  const opt = <span className="font-normal text-ink-3">(facultatif)</span>;
  return (
    <form action={action} noValidate className="flex flex-col gap-3.5" key={state.attempt ?? 'initial'}>
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Prénom
          <input name="firstName" maxLength={80} autoComplete="off" defaultValue={v.firstName} placeholder="ex. Claire" className={cls(fe.firstName)} />
          <Err msg={fe.firstName} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Nom
          <input name="lastName" maxLength={80} autoComplete="off" defaultValue={v.lastName} placeholder="ex. Martin" className={cls(fe.lastName)} />
          <Err msg={fe.lastName} />
        </label>
      </div>
      <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
        <span>Spécialité {opt}</span>
        <input name="specialty" maxLength={80} list="contact-specialites" autoComplete="off" defaultValue={v.specialty} placeholder="ex. Ophtalmologue, kiné, laboratoire" className={cls(fe.specialty)} />
        <datalist id="contact-specialites">
          {SPECIALTIES.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
        <Err msg={fe.specialty} />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          <span>Téléphone {opt}</span>
          <input type="tel" name="phone" inputMode="tel" maxLength={30} autoComplete="off" defaultValue={v.phone} placeholder="ex. 01 23 45 67 89" className={cls(fe.phone)} />
          <Err msg={fe.phone} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          <span>E-mail {opt}</span>
          <input type="email" name="email" inputMode="email" maxLength={254} autoComplete="off" autoCapitalize="none" defaultValue={v.email} placeholder="ex. cabinet@exemple.fr" className={cls(fe.email)} />
          <Err msg={fe.email} />
        </label>
      </div>
      <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
        <span>Adresse {opt}</span>
        <textarea name="address" rows={2} maxLength={300} autoComplete="off" defaultValue={v.address} placeholder="ex. 12 rue de la Paix, 75002 Paris" className={`${cls(fe.address)} py-2`} />
        <Err msg={fe.address} />
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
        <span>Notes {opt}</span>
        <textarea name="notes" rows={2} maxLength={1000} defaultValue={v.notes} placeholder="ex. secrétariat le matin, code de l’immeuble, 2ᵉ étage" className={`${cls(fe.notes)} py-2`} />
        <Err msg={fe.notes} />
      </label>
      <SubmitButton pendingLabel="Enregistrement…">{initial.id ? 'Enregistrer les modifications' : 'Ajouter le contact'}</SubmitButton>
    </form>
  );
}
