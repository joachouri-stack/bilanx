'use client';

import { useActionState, useMemo, useState } from 'react';
import { reviewPrescriptionAction, type FormState } from '@/lib/server/actions';
import { Alert } from './forms';

export interface PrescriptionDraft {
  id: string;
  lineText: string;
  page: number | null;
  name: string;
  strength: string | null;
  posology: string;
  times: string[];
  qty: string | null;
  startDate: string | null;
  endDate: string | null;
  checks: { code: string; severity: 'info' | 'warn'; messageFr: string }[];
}

type Row = { action: 'confirm' | 'ignore' | null; name: string; strength: string; posology: string; times: string[]; qty: string; startDate: string; endDate: string };
const input = 'min-h-10 w-full rounded-lg border border-line bg-surface px-2.5 text-sm text-ink';

/** Validation des traitements lus sur une ordonnance : rien n'est enregistré sans confirmation. */
export function PrescriptionReviewForm({ documentId, drafts, prescriber }: { documentId: string; drafts: PrescriptionDraft[]; prescriber: string | null }) {
  const [state, action] = useActionState(reviewPrescriptionAction, {} as FormState);
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      drafts.map((d) => [
        d.id,
        { action: null, name: d.name, strength: d.strength ?? '', posology: d.posology, times: d.times, qty: d.qty ?? '', startDate: d.startDate ?? '', endDate: d.endDate ?? '' },
      ]),
    ),
  );
  const [doctor, setDoctor] = useState(prescriber ?? '');
  const set = (id: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...r[id]!, ...patch } }));
  const undecided = drafts.filter((d) => !rows[d.id]!.action).length;
  const confirmed = drafts.filter((d) => rows[d.id]!.action === 'confirm').length;
  const decisions = useMemo(
    () =>
      JSON.stringify(
        drafts.map((d) => {
          const r = rows[d.id]!;
          return {
            draftId: d.id,
            action: r.action ?? 'ignore',
            name: r.name,
            strength: r.strength,
            posology: r.posology,
            times: r.times,
            qty: r.times.map(() => r.qty),
            startDate: r.startDate,
            endDate: r.endDate,
          };
        }),
      ),
    [rows, drafts],
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="documentId" value={documentId} />
      <input type="hidden" name="decisions" value={decisions} />
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      <label className="flex flex-col gap-1 text-sm font-medium">
        Prescrit par
        <input name="prescriber" maxLength={120} value={doctor} onChange={(e) => setDoctor(e.target.value)} className={input} />
        {!prescriber && <span className="text-xs font-normal text-amber">Prescripteur non trouvé sur l’ordonnance : vous pouvez l’indiquer.</span>}
      </label>
      <ul className="flex flex-col gap-3">
        {drafts.map((d) => {
          const r = rows[d.id]!;
          const warn = d.checks.some((c) => c.severity === 'warn');
          const serverErr = state.fieldErrors?.[d.id];
          return (
            <li
              key={d.id}
              data-traitement={d.name}
              className={`rounded-2xl border p-3.5 ${r.action === 'confirm' ? 'border-sage bg-sage-2/40' : r.action === 'ignore' ? 'border-line opacity-60' : warn ? 'border-amber' : 'border-line'}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {r.name || 'Nom à compléter'}
                    {r.strength ? <span className="font-normal text-ink-2"> · {r.strength}</span> : null}
                  </p>
                  <p className="whitespace-pre-line text-xs text-ink-3">
                    Lu{d.page ? ` page ${d.page}` : ''} : <span className="font-mono">« {d.lineText} »</span>
                  </p>
                </div>
                <div className="flex gap-1.5" role="radiogroup" aria-label={`Décision pour ${d.name}`}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={r.action === 'confirm'}
                    onClick={() => set(d.id, { action: 'confirm' })}
                    className={`min-h-10 rounded-lg px-3 text-sm font-medium ${r.action === 'confirm' ? 'bg-sage text-on-accent' : 'border border-line'}`}
                  >
                    Confirmer
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={r.action === 'ignore'}
                    onClick={() => set(d.id, { action: 'ignore' })}
                    className={`min-h-10 rounded-lg px-3 text-sm ${r.action === 'ignore' ? 'bg-ink-3 text-on-accent' : 'border border-line'}`}
                  >
                    Ignorer
                  </button>
                </div>
              </div>
              {d.checks.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1">
                  {d.checks.map((c, i) => (
                    <li key={i} className={`text-sm ${c.severity === 'warn' ? 'text-amber' : 'text-ink-2'}`}>
                      {c.severity === 'warn' ? '⚠️' : 'ℹ️'} {c.messageFr}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[1.4fr_0.8fr]">
                <label className="flex flex-col gap-0.5 text-xs text-ink-3">
                  Médicament
                  <input value={r.name} maxLength={120} onChange={(e) => set(d.id, { name: e.target.value })} className={input} />
                </label>
                <label className="flex flex-col gap-0.5 text-xs text-ink-3">
                  Dosage
                  <input value={r.strength} maxLength={60} onChange={(e) => set(d.id, { strength: e.target.value })} className={input} />
                </label>
                <label className="col-span-2 flex flex-col gap-0.5 text-xs text-ink-3">
                  Posologie prescrite (telle qu’écrite sur l’ordonnance)
                  <input value={r.posology} maxLength={300} onChange={(e) => set(d.id, { posology: e.target.value })} className={input} />
                </label>
              </div>
              <fieldset className="mt-2">
                <legend className="text-xs text-ink-3">Heures de prise (pour le suivi et les rappels)</legend>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {r.times.map((t, i) => (
                    <span key={i} className="flex items-center gap-1">
                      <input
                        type="time"
                        value={t}
                        aria-label={`Heure ${i + 1} pour ${r.name}`}
                        onChange={(e) => set(d.id, { times: r.times.map((x, k) => (k === i ? e.target.value : x)) })}
                        className={`${input} w-32`}
                      />
                      <button type="button" aria-label={`Retirer l’heure ${i + 1}`} onClick={() => set(d.id, { times: r.times.filter((_, k) => k !== i) })} className="min-h-10 rounded-lg px-2 text-ink-3">
                        ✕
                      </button>
                    </span>
                  ))}
                  {r.times.length < 8 && (
                    <button type="button" onClick={() => set(d.id, { times: [...r.times, ''] })} className="min-h-10 rounded-lg px-2 text-sm font-medium text-petrol">
                      ＋ Heure
                    </button>
                  )}
                  {r.times.length === 0 && <span className="text-xs text-ink-3">Aucune heure : pas de suivi ni de rappel quotidien.</span>}
                </div>
              </fieldset>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <label className="flex flex-col gap-0.5 text-xs text-ink-3">
                  Quantité par prise
                  <input value={r.qty} maxLength={40} onChange={(e) => set(d.id, { qty: e.target.value })} className={input} />
                </label>
                <label className="flex flex-col gap-0.5 text-xs text-ink-3">
                  Début
                  <input type="date" value={r.startDate} onChange={(e) => set(d.id, { startDate: e.target.value })} className={input} />
                </label>
                <label className="flex flex-col gap-0.5 text-xs text-ink-3">
                  Fin
                  <input type="date" value={r.endDate} onChange={(e) => set(d.id, { endDate: e.target.value })} className={input} />
                </label>
              </div>
              {serverErr && (
                <p role="alert" className="mt-2 text-sm text-red">
                  {serverErr}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={undecided > 0} className="min-h-12 rounded-xl bg-petrol px-5 font-semibold text-on-accent disabled:opacity-50">
          {confirmed ? `Ajouter ${confirmed} traitement${confirmed > 1 ? 's' : ''}` : 'Terminer sans rien ajouter'}
        </button>
        {undecided > 0 && <span className="text-sm text-ink-3">Encore {undecided} ligne{undecided > 1 ? 's' : ''} à confirmer ou ignorer.</span>}
      </div>
      <p className="text-xs text-ink-3">
        BILANX recopie l’ordonnance sans rien modifier ni proposer : en cas de doute sur une ligne, vérifiez auprès de votre médecin ou de votre
        pharmacien.
      </p>
    </form>
  );
}
