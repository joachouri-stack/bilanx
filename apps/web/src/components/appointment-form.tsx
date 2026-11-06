'use client';

import { useActionState } from 'react';
import { REMINDER_OPTIONS } from '@bilanx/domain';
import { saveAppointmentAction, type FormState } from '@/lib/server/actions';
import { Alert, SubmitButton } from './forms';

const input = 'min-h-11 w-full rounded-xl border bg-surface px-3 text-base outline-none focus:border-petrol focus:ring-2 focus:ring-petrol-2';
const cls = (err?: string) => `${input} ${err ? 'border-red' : 'border-line'}`;
const Err = ({ msg }: { msg?: string }) =>
  msg ? (
    <p role="alert" className="text-sm text-red">
      {msg}
    </p>
  ) : null;

export interface AppointmentDefaults {
  id?: string;
  date: string;
  time: string;
  specialty?: string;
  practitioner?: string;
  location?: string;
  reason?: string;
  toPrepare?: string;
  reminder?: string;
  notesAfter?: string;
}

export function AppointmentForm({ initial, showNotes }: { initial: AppointmentDefaults; showNotes: boolean }) {
  const [state, action] = useActionState(saveAppointmentAction, {} as FormState);
  const v: Record<string, string | undefined> = { ...initial, ...(state.values ?? {}) };
  const fe = state.fieldErrors ?? {};
  const opt = (k: string) => <span className="font-normal text-ink-3">{k}</span>;
  return (
    <form action={action} className="flex flex-col gap-3.5" key={state.attempt ?? 'initial'}>
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Date
          <input type="date" name="date" defaultValue={v.date} className={cls(fe.date)} />
          <Err msg={fe.date} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Heure
          <input type="time" name="time" defaultValue={v.time} className={cls(fe.time)} />
          <Err msg={fe.time} />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Spécialité
          <input name="specialty" maxLength={80} list="specialites" defaultValue={v.specialty} placeholder="ex. Endocrinologie" className={cls(fe.specialty)} />
          <datalist id="specialites">
            {['Médecine générale', 'Endocrinologie', 'Diabétologie', 'Cardiologie', 'Néphrologie', 'Ophtalmologie', 'Podologie', 'Diététique', 'Dentiste', 'Laboratoire (prise de sang)'].map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
          <Err msg={fe.specialty} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          <span>Professionnel {opt('(facultatif)')}</span>
          <input name="practitioner" maxLength={120} defaultValue={v.practitioner} placeholder="ex. Dr Martin" className={cls(fe.practitioner)} />
        </label>
      </div>
      <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
        <span>Lieu {opt('(facultatif)')}</span>
        <input name="location" maxLength={200} defaultValue={v.location} className={cls(fe.location)} />
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
        <span>Motif {opt('(facultatif)')}</span>
        <input name="reason" maxLength={300} defaultValue={v.reason} className={cls(fe.reason)} />
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
        <span>À préparer {opt('(facultatif)')}</span>
        <textarea name="toPrepare" rows={2} maxLength={500} defaultValue={v.toPrepare} placeholder="ex. dernier bilan sanguin, carnet de glycémie, ordonnance" className={`${cls(fe.toPrepare)} py-2`} />
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
        Rappel dans l’agenda du téléphone
        <select name="reminder" defaultValue={v.reminder ?? '1440'} className={cls(fe.reminder)}>
          {Object.entries(REMINDER_OPTIONS).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <span className="text-[13px] font-normal text-ink-3">Il s’active quand vous ajoutez le rendez-vous à votre agenda.</span>
      </label>
      {showNotes && (
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          <span>Notes après la consultation {opt('(facultatif)')}</span>
          <textarea name="notesAfter" rows={4} maxLength={2000} defaultValue={v.notesAfter} placeholder="ce qui a été dit, examens à prévoir, prochain rendez-vous…" className={`${cls(fe.notesAfter)} py-2`} />
        </label>
      )}
      <SubmitButton pendingLabel="Enregistrement…">{initial.id ? 'Enregistrer les modifications' : 'Ajouter le rendez-vous'}</SubmitButton>
    </form>
  );
}
