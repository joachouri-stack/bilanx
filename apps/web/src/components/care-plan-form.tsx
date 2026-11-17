'use client';

import { useActionState, useState } from 'react';
import { MONTHS_FR } from '@bilanx/domain';
import { saveCarePlanAction, type FormState } from '@/lib/server/actions';
import { Alert, SubmitButton } from './forms';
import { DocIcon } from './documents-icons';
import type { DocCategoryIcon } from '@/lib/document-categories';

const input = 'min-h-11 w-full min-w-0 rounded-xl border bg-surface px-3 text-base outline-none focus:border-petrol focus:ring-2 focus:ring-petrol-2';
const cls = (err?: string) => `${input} ${err ? 'border-red' : 'border-line'}`;
const Err = ({ msg }: { msg?: string }) =>
  msg ? (
    <p role="alert" className="text-sm text-red">
      {msg}
    </p>
  ) : null;

const ICONS: { key: string; label: string }[] = [
  { key: 'calendar', label: 'Rendez-vous' },
  { key: 'drop', label: 'Diabète' },
  { key: 'flask', label: 'Prise de sang' },
  { key: 'foot', label: 'Pied' },
  { key: 'vessel', label: 'Vaisseaux' },
  { key: 'tooth', label: 'Dents' },
  { key: 'eye', label: 'Yeux' },
  { key: 'heart', label: 'Cœur' },
  { key: 'brain', label: 'Cerveau' },
  { key: 'ear', label: 'ORL' },
  { key: 'kidney', label: 'Reins' },
  { key: 'user', label: 'Médecin' },
];

export interface CarePlanDefaults {
  id?: string;
  label?: string;
  icon?: string;
  specialty?: string;
  everyMonths?: number | null;
  fixedMonth?: number | null;
  remindDays?: number;
  lastDone?: string | null;
  labAnalyte?: string | null;
}

/** Créer ou modifier un suivi régulier. */
export function CarePlanForm({ initial = {}, today }: { initial?: CarePlanDefaults; today: string }) {
  const [state, action] = useActionState(saveCarePlanAction, {} as FormState);
  const v = state.values;
  const fe = state.fieldErrors ?? {};
  const [mode, setMode] = useState<'every' | 'fixed'>((v?.mode as 'every' | 'fixed') ?? (initial.fixedMonth ? 'fixed' : 'every'));
  const [icon, setIcon] = useState(v?.icon ?? initial.icon ?? 'calendar');
  const seg = (on: boolean) => `flex-1 min-h-11 rounded-lg text-[15px] font-medium transition ${on ? 'bg-surface text-ink shadow-sm' : 'text-ink-2'}`;
  return (
    <form action={action} className="flex flex-col gap-3.5" key={state.attempt ?? 'initial'}>
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      {initial.labAnalyte && <input type="hidden" name="labAnalyte" value={initial.labAnalyte} />}
      <input type="hidden" name="icon" value={icon} />
      <input type="hidden" name="mode" value={mode} />

      <label className="flex flex-col gap-1 text-sm font-medium">
        Nom du suivi
        <input name="label" maxLength={80} required defaultValue={v?.label ?? initial.label} placeholder="ex. Podologue" className={cls(fe.label)} />
        <Err msg={fe.label} />
      </label>

      <div role="radiogroup" aria-label="Icône" className="flex flex-wrap gap-1.5">
        {ICONS.map((i) => (
          <button
            key={i.key}
            type="button"
            role="radio"
            aria-checked={icon === i.key}
            aria-label={i.label}
            onClick={() => setIcon(i.key)}
            className={`grid size-11 place-items-center rounded-xl border transition ${icon === i.key ? 'border-petrol bg-petrol-2 text-petrol' : 'border-line text-ink-2'}`}
          >
            <DocIcon name={i.key as DocCategoryIcon} className="size-5" />
          </button>
        ))}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Fréquence</legend>
        <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
          <button type="button" className={seg(mode === 'every')} onClick={() => setMode('every')} aria-pressed={mode === 'every'}>
            Tous les … mois
          </button>
          <button type="button" className={seg(mode === 'fixed')} onClick={() => setMode('fixed')} aria-pressed={mode === 'fixed'}>
            Chaque année en…
          </button>
        </div>
        {mode === 'every' ? (
          <label className="flex items-center gap-2 text-[15px]">
            Tous les
            <select name="everyMonths" defaultValue={v?.everyMonths ?? String(initial.everyMonths ?? 3)} className={`${cls(fe.frequency)} w-24`} aria-label="Nombre de mois">
              {[1, 2, 3, 4, 6, 9, 12, 18, 24, 36].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            mois
          </label>
        ) : (
          <label className="flex items-center gap-2 text-[15px]">
            Chaque année en
            <select name="fixedMonth" defaultValue={v?.fixedMonth ?? String(initial.fixedMonth ?? 7)} className={`${cls(fe.frequency)} flex-1`} aria-label="Mois">
              {MONTHS_FR.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        )}
        <Err msg={fe.frequency} />
      </fieldset>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Me rappeler de prendre RDV
          <select name="remindDays" defaultValue={v?.remindDays ?? String(initial.remindDays ?? 30)} className={cls(fe.remindDays)}>
            {[
              [7, '1 semaine avant'],
              [14, '2 semaines avant'],
              [21, '3 semaines avant'],
              [30, '1 mois avant'],
              [45, '6 semaines avant'],
              [60, '2 mois avant'],
            ].map(([d, l]) => (
              <option key={d} value={d}>
                {l}
              </option>
            ))}
          </select>
          <Err msg={fe.remindDays} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          <span>
            Dernier passage <span className="font-normal text-ink-3">(si vous le connaissez)</span>
          </span>
          <input type="date" name="lastDone" max={today} defaultValue={v?.lastDone ?? initial.lastDone ?? ''} className={cls(fe.lastDone)} />
          <Err msg={fe.lastDone} />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm font-medium">
        <span>
          Spécialité <span className="font-normal text-ink-3">(pour retrouver le numéro dans vos contacts)</span>
        </span>
        <input name="specialty" maxLength={80} defaultValue={v?.specialty ?? initial.specialty ?? ''} placeholder="ex. Podologue" className={cls()} />
      </label>

      <SubmitButton pendingLabel="Enregistrement…">{initial.id ? 'Enregistrer le suivi' : 'Ajouter ce suivi'}</SubmitButton>
    </form>
  );
}
