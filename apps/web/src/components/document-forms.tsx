'use client';

import { useActionState, useMemo, useRef, useState } from 'react';
import { ANALYTES, getAnalyte, unitsFor } from '@bilanx/domain';
import { reviewDocumentAction, uploadDocumentAction, type FormState } from '@/lib/server/actions';
import { Alert } from './forms';
import { useFormStatus } from 'react-dom';

function Submit({ children, pending, disabled }: { children: React.ReactNode; pending: string; disabled?: boolean }) {
  const s = useFormStatus();
  return (
    <button type="submit" disabled={s.pending || disabled} className="min-h-12 w-full rounded-xl bg-petrol px-4 font-semibold text-white disabled:opacity-50">
      {s.pending ? pending : children}
    </button>
  );
}

export function UploadForm() {
  const [state, action] = useActionState(uploadDocumentAction, {} as FormState);
  const [files, setFiles] = useState<File[]>([]);
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const hidden = useRef<HTMLInputElement>(null);

  const add = (list: FileList | null) => {
    if (!list) return;
    const next = [...files, ...Array.from(list)].slice(0, 10);
    setFiles(next);
    const dt = new DataTransfer();
    next.forEach((f) => dt.items.add(f));
    if (hidden.current) hidden.current.files = dt.files;
  };
  const remove = (i: number) => {
    const next = files.filter((_, j) => j !== i);
    setFiles(next);
    const dt = new DataTransfer();
    next.forEach((f) => dt.items.add(f));
    if (hidden.current) hidden.current.files = dt.files;
  };

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      <input ref={hidden} type="file" name="files" multiple hidden />
      {/* Appareil photo (mobile) : une page par photo, plusieurs photos possibles. */}
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => add(e.target.files)} />
      <input ref={picker} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => add(e.target.files)} />
      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => camera.current?.click()} className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line p-4 hover:bg-surface-2">
          <span className="text-2xl" aria-hidden>
            📷
          </span>
          <span className="font-semibold">Prendre en photo</span>
          <span className="text-xs text-ink-3">Une photo par page</span>
        </button>
        <button type="button" onClick={() => picker.current?.click()} className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line p-4 hover:bg-surface-2">
          <span className="text-2xl" aria-hidden>
            📄
          </span>
          <span className="font-semibold">Importer un fichier</span>
          <span className="text-xs text-ink-3">PDF, JPEG, PNG — 10 Mo max.</span>
        </button>
      </div>
      {files.length > 0 && (
        <ol className="flex flex-col gap-1.5 text-sm">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2">
              <span className="truncate">
                Page {i + 1} · {f.name} <span className="text-ink-3">({Math.round(f.size / 1024)} Ko)</span>
              </span>
              <button type="button" onClick={() => remove(i)} className="text-xs text-red" aria-label={`Retirer ${f.name}`}>
                Retirer
              </button>
            </li>
          ))}
        </ol>
      )}
      <Submit pending="Lecture du document en cours…" disabled={files.length === 0}>
        Envoyer {files.length > 1 ? `les ${files.length} pages` : 'le document'}
      </Submit>
      <p className="text-xs text-ink-3">
        Le document original est chiffré et conservé. La lecture se fait sur nos serveurs, sans service extérieur. Aucune valeur
        n’est enregistrée avant votre validation.
      </p>
    </form>
  );
}

export interface ReviewDraft {
  id: string;
  rawLabel: string;
  rawValue: string;
  rawUnit: string | null;
  analyteCode: string | null;
  refLow: number | null;
  refHigh: number | null;
  page: number | null;
  lineText: string | null;
  checks: { code: string; severity: 'block' | 'warn'; messageFr: string }[];
}

type RowState = { action: 'confirm' | 'ignore' | null; analyteCode: string; value: string; unit: string; refLow: string; refHigh: string };

const fmt = (n: number | null) => (n === null ? '' : String(n).replace('.', ','));
const input = 'min-h-10 w-full rounded-lg border border-line bg-surface px-2.5 text-sm';

export function ReviewForm({
  documentId,
  drafts,
  sampledOn,
  laboratory,
  today,
}: {
  documentId: string;
  drafts: ReviewDraft[];
  sampledOn: string | null;
  laboratory: string | null;
  today: string;
}) {
  const [state, action] = useActionState(reviewDocumentAction, {} as FormState);
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      drafts.map((d) => [
        d.id,
        { action: null, analyteCode: d.analyteCode ?? '', value: d.rawValue, unit: d.rawUnit ?? '', refLow: fmt(d.refLow), refHigh: fmt(d.refHigh) },
      ]),
    ),
  );
  const [date, setDate] = useState(sampledOn ?? '');
  const [lab, setLab] = useState(laboratory ?? '');
  const set = (id: string, patch: Partial<RowState>) => setRows((r) => ({ ...r, [id]: { ...r[id]!, ...patch } }));
  const undecided = drafts.filter((d) => !rows[d.id]!.action).length;
  const confirmed = drafts.filter((d) => rows[d.id]!.action === 'confirm').length;
  const decisions = useMemo(
    () =>
      JSON.stringify(
        drafts.map((d) => {
          const r = rows[d.id]!;
          return { draftId: d.id, action: r.action ?? 'ignore', analyteCode: r.analyteCode, value: r.value, unit: r.unit, refLow: r.refLow, refHigh: r.refHigh };
        }),
      ),
    [rows, drafts],
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="documentId" value={documentId} />
      <input type="hidden" name="decisions" value={decisions} />
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Date du prélèvement
          <input type="date" name="sampledOn" required max={today} value={date} onChange={(e) => setDate(e.target.value)} className={input} />
          {!sampledOn && <span className="text-xs font-normal text-amber">Date non trouvée dans le document : renseignez-la.</span>}
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Laboratoire
          <input name="laboratory" maxLength={120} value={lab} onChange={(e) => setLab(e.target.value)} className={input} />
        </label>
      </div>

      <ul className="flex flex-col gap-3">
        {drafts.map((d) => {
          const r = rows[d.id]!;
          const analyte = getAnalyte(r.analyteCode);
          const units = analyte ? unitsFor(analyte) : [];
          const blocking = d.checks.some((c) => c.severity === 'block');
          const serverErr = state.fieldErrors?.[d.id];
          return (
            <li
              key={d.id}
              className={`rounded-2xl border p-3.5 ${r.action === 'confirm' ? 'border-sage bg-sage-2/40' : r.action === 'ignore' ? 'border-line opacity-60' : blocking ? 'border-red' : d.checks.length ? 'border-amber' : 'border-line'}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{analyte?.nameFr ?? 'Analyse non reconnue'}</p>
                  <p className="text-xs text-ink-3">
                    Lu{d.page ? ` page ${d.page}` : ''} : <span className="font-mono">« {d.lineText ?? d.rawLabel} »</span>
                  </p>
                </div>
                <div className="flex gap-1.5" role="radiogroup" aria-label={`Décision pour ${d.rawLabel}`}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={r.action === 'confirm'}
                    onClick={() => set(d.id, { action: 'confirm' })}
                    className={`min-h-10 rounded-lg px-3 text-sm font-medium ${r.action === 'confirm' ? 'bg-sage text-white' : 'border border-line'}`}
                  >
                    Confirmer
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={r.action === 'ignore'}
                    onClick={() => set(d.id, { action: 'ignore' })}
                    className={`min-h-10 rounded-lg px-3 text-sm ${r.action === 'ignore' ? 'bg-ink-3 text-white' : 'border border-line'}`}
                  >
                    Ignorer
                  </button>
                </div>
              </div>
              {d.checks.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1">
                  {d.checks.map((c, i) => (
                    <li key={i} className={`text-sm ${c.severity === 'block' ? 'text-red' : 'text-amber'}`}>
                      {c.severity === 'block' ? '⛔' : '⚠️'} {c.messageFr}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[1.6fr_1fr_1fr_0.8fr_0.8fr]">
                <label className="col-span-2 flex flex-col gap-0.5 text-xs text-ink-3 sm:col-span-1">
                  Analyse
                  <select
                    value={r.analyteCode}
                    onChange={(e) => {
                      const a = getAnalyte(e.target.value);
                      set(d.id, { analyteCode: e.target.value, unit: a && !unitsFor(a).includes(r.unit) ? a.canonicalUnit : r.unit });
                    }}
                    className={input}
                  >
                    <option value="">— choisir —</option>
                    {ANALYTES.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.nameFr}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-0.5 text-xs text-ink-3">
                  Résultat
                  <input value={r.value} onChange={(e) => set(d.id, { value: e.target.value })} inputMode="decimal" className={`${input} tabular font-semibold text-ink`} />
                </label>
                <label className="flex flex-col gap-0.5 text-xs text-ink-3">
                  Unité
                  <select value={r.unit} onChange={(e) => set(d.id, { unit: e.target.value })} className={input}>
                    {!units.includes(r.unit) && <option value={r.unit}>{r.unit || '—'}</option>}
                    {units.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-0.5 text-xs text-ink-3">
                  Réf. basse
                  <input value={r.refLow} onChange={(e) => set(d.id, { refLow: e.target.value })} inputMode="decimal" className={input} />
                </label>
                <label className="flex flex-col gap-0.5 text-xs text-ink-3">
                  Réf. haute
                  <input value={r.refHigh} onChange={(e) => set(d.id, { refHigh: e.target.value })} inputMode="decimal" className={input} />
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

      <div className="sticky bottom-20 rounded-2xl border border-line bg-surface p-3 shadow-lg lg:bottom-3">
        <p className="mb-2 text-center text-sm text-ink-2">
          {undecided ? `${undecided} ligne${undecided > 1 ? 's' : ''} à traiter` : `${confirmed} résultat${confirmed > 1 ? 's' : ''} à enregistrer`}
        </p>
        <Submit pending="Enregistrement…" disabled={undecided > 0 || !date}>
          Enregistrer les {confirmed} résultat{confirmed > 1 ? 's' : ''} confirmé{confirmed > 1 ? 's' : ''}
        </Submit>
      </div>
    </form>
  );
}
