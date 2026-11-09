'use client';

import { useActionState, useState } from 'react';
import { ANALYTES, getAnalyte, unitsFor, type AnalyteCategory } from '@bilanx/domain';
import { addLabResultAction, type FormState } from '@/lib/server/actions';
import { Alert, SubmitButton } from './forms';

const CATEGORY_LABELS: Record<AnalyteCategory, string> = {
  diabetes: 'Diabète',
  iron: 'Fer',
  hematology: 'Hématologie',
  vitamins: 'Vitamines',
  minerals: 'Minéraux',
  electrolytes: 'Ionogramme',
  kidney: 'Fonction rénale',
  lipids: 'Lipides',
  thyroid: 'Thyroïde',
  hormones: 'Hormones',
  inflammation: 'Inflammation',
  liver: 'Foie',
  proteins: 'Protéines',
};

const input = 'min-h-12 w-full rounded-xl border bg-surface px-3.5 text-base outline-none focus:border-petrol focus:ring-2 focus:ring-petrol-2';

function Label({ htmlFor, children, optional }: { htmlFor: string; children: React.ReactNode; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium">
      {children} {optional && <span className="font-normal text-ink-3">(facultatif)</span>}
    </label>
  );
}

function FieldError({ id, msg }: { id: string; msg?: string }) {
  return msg ? (
    <p id={id} role="alert" className="text-sm text-red">
      {msg}
    </p>
  ) : null;
}

export function LabEntryForm({ today, initialAnalyte }: { today: string; initialAnalyte?: string }) {
  const [state, action] = useActionState(addLabResultAction, {} as FormState);
  const v = state.values ?? {};
  const fe = state.fieldErrors ?? {};
  const [code, setCode] = useState(v.analyteCode ?? initialAnalyte ?? '');
  const analyte = getAnalyte(code);
  const units = analyte ? unitsFor(analyte) : [];
  const groups = Object.entries(CATEGORY_LABELS).map(([cat, label]) => ({ label, items: ANALYTES.filter((a) => a.category === cat) }));
  const cls = (k: string) => `${input} ${fe[k] ? 'border-red' : 'border-line'}`;

  return (
    <form action={action} className="flex flex-col gap-5" key={state.attempt ?? 'initial'} noValidate>
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="analyteCode">Analyse</Label>
        <select id="analyteCode" name="analyteCode" value={code} onChange={(e) => setCode(e.target.value)} className={cls('analyteCode')} aria-invalid={!!fe.analyteCode}>
          <option value="" disabled>
            Choisir l’analyse…
          </option>
          {groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.items.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.nameFr}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <FieldError id="e-analyte" msg={fe.analyteCode} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,9rem)] gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="value">Résultat</Label>
          <input id="value" name="value" inputMode="decimal" autoComplete="off" defaultValue={v.value} placeholder="ex. 7,2" className={cls('value')} aria-invalid={!!fe.value} aria-describedby="e-value" />
          <FieldError id="e-value" msg={fe.value} />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="unit">Unité</Label>
          <select id="unit" name="unit" key={code} defaultValue={v.unit && units.includes(v.unit) ? v.unit : units[0]} disabled={!analyte} className={cls('unit')} aria-invalid={!!fe.unit}>
            {units.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          <FieldError id="e-unit" msg={fe.unit} />
        </div>
      </div>
      <p className="-mt-3 text-[13px] text-ink-3">Recopiez la valeur et l’unité comme sur le bilan sanguin (« &lt; 5 » est accepté).</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="sampledOn">Date du prélèvement</Label>
          <input id="sampledOn" name="sampledOn" type="date" max={today} defaultValue={v.sampledOn} className={cls('sampledOn')} aria-invalid={!!fe.sampledOn} />
          <FieldError id="e-date" msg={fe.sampledOn} />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="laboratory" optional>
            Laboratoire
          </Label>
          <input id="laboratory" name="laboratory" maxLength={120} defaultValue={v.laboratory} className={cls('laboratory')} />
          <FieldError id="e-lab" msg={fe.laboratory} />
        </div>
      </div>

      <fieldset className="min-w-0 rounded-xl border border-line p-4">
        <legend className="px-1 text-sm font-medium">
          Valeurs de référence du laboratoire <span className="font-normal text-ink-3">(facultatif)</span>
        </legend>
        <p className="mb-3 text-[13px] text-ink-3">Recopiez-les depuis le bilan, à côté du résultat. BILANX ne les devine jamais.</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="refLow">Borne basse</Label>
            <input id="refLow" name="refLow" inputMode="decimal" defaultValue={v.refLow} className={cls('refLow')} />
            <FieldError id="e-rl" msg={fe.refLow} />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="refHigh">Borne haute</Label>
            <input id="refHigh" name="refHigh" inputMode="decimal" defaultValue={v.refHigh} className={cls('refHigh')} />
            <FieldError id="e-rh" msg={fe.refHigh} />
          </div>
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="note" optional>
          Note
        </Label>
        <textarea id="note" name="note" rows={2} maxLength={500} defaultValue={v.note} className={`${cls('note')} py-2.5`} />
      </div>

      {state.duplicate && (
        <label className="flex gap-3 rounded-xl bg-amber-2 p-3.5 text-sm">
          <input type="checkbox" name="acceptDuplicate" className="mt-0.5 size-5 shrink-0 accent-[var(--petrol)]" />
          <span>Oui, il s’agit bien d’un second résultat distinct.</span>
        </label>
      )}

      <SubmitButton pendingLabel="Enregistrement…">Enregistrer le résultat</SubmitButton>
      <p className="text-center text-[13px] text-ink-3">Le résultat sera marqué « saisie manuelle » dans l’historique et les rapports.</p>
    </form>
  );
}
