'use client';

import { useActionState, useMemo, useRef, useState } from 'react';
import { ANALYTES, getAnalyte, unitsFor } from '@bilanx/domain';
import { reviewDocumentAction, updateDocumentDetailsAction, uploadDocumentAction, type FormState } from '@/lib/server/actions';
import { DOC_CATEGORIES, EXAM_LABELS, SPECIALTIES } from '@/lib/document-categories';
import { Alert } from './forms';
import { useFormStatus } from 'react-dom';
import { Icon } from './icon';
import { DocIcon } from './documents-icons';
import { Button, Meta, buttonClass } from './ui';
import { DecisionButtons, StickySaveBar, rowClass } from './documents-review';

function Submit({ children, pending, disabled }: { children: React.ReactNode; pending: string; disabled?: boolean }) {
  const s = useFormStatus();
  return (
    <button type="submit" disabled={s.pending || disabled} className={buttonClass({ variant: 'primary', className: 'w-full' })}>
      {s.pending ? pending : children}
    </button>
  );
}

const field = 'min-h-12 w-full min-w-0 rounded-xl border border-line bg-surface px-3';

/** Catégorie, spécialité, date, titre (et type d'examen pour l'imagerie) : partagés par l'import et la modification. */
function DetailsFields({ kind, setKind, today, values, allowAuto }: { kind: string; setKind: (k: string) => void; today: string; values: Record<string, string>; allowAuto: boolean }) {
  const choice = (selected: boolean) =>
    `flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-[15px] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-petrol ${selected ? 'border-petrol bg-petrol-2 font-semibold text-petrol' : 'border-line'}`;
  return (
    <>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Type de document</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {DOC_CATEGORIES.map((c) => (
            <label key={c.key} className={choice(kind === c.kind)}>
              <input type="radio" name="kind" value={c.kind} checked={kind === c.kind} onChange={() => setKind(c.kind)} className="sr-only" />
              <DocIcon name={c.svg} />
              {c.single === 'Document' ? 'Autre' : c.single}
            </label>
          ))}
          {allowAuto && (
            <label className={choice(kind === '')}>
              <input type="radio" name="kind" value="" checked={kind === ''} onChange={() => setKind('')} className="sr-only" />
              <Icon name="sparkle" className="size-5 shrink-0" />
              Je ne sais pas
            </label>
          )}
        </div>
      </fieldset>
      {kind === 'imaging' && (
        <label className="flex flex-col gap-1 text-sm font-medium">
          Examen
          <select name="examType" defaultValue={values.examType ?? 'irm'} className={field}>
            {Object.entries(EXAM_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1 text-sm font-medium">
        <span>
          Spécialité <span className="font-normal text-ink-3">(facultatif)</span>
        </span>
        <select name="specialty" defaultValue={values.specialty ?? ''} aria-describedby="aide-specialite" className={`${field} min-h-11 text-base`}>
          <option value="">Aucune</option>
          {SPECIALTIES.map((sp) => (
            <option key={sp.code} value={sp.code}>
              {sp.label}
            </option>
          ))}
        </select>
        <span id="aide-specialite" className="font-normal text-ink-3">
          Le médecin concerné : urologue, ophtalmo, ORL… pour retrouver ses documents en un instant.
        </span>
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          <span>
            Date du document <span className="font-normal text-ink-3">(facultatif)</span>
          </span>
          <input type="date" name="date" max={today} defaultValue={values.date} className={field} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          <span>
            Titre <span className="font-normal text-ink-3">(facultatif)</span>
          </span>
          <input name="title" maxLength={200} defaultValue={values.title} placeholder={kind === 'imaging' ? 'ex. IRM du genou droit' : 'ex. Dr Martin, cardiologue'} className={field} />
        </label>
      </div>
    </>
  );
}

/** Modifier le classement d'un document déjà importé. */
export function DocumentDetailsForm({
  documentId,
  today,
  kind: initialKind,
  title,
  date,
  examType,
  specialty,
  issuer,
}: {
  documentId: string;
  today: string;
  kind: string;
  title: string;
  date: string | null;
  examType: string | null;
  specialty: string | null;
  issuer: string | null;
}) {
  const [state, action] = useActionState(updateDocumentDetailsAction, {} as FormState);
  const known = DOC_CATEGORIES.some((c) => c.kind === initialKind) ? initialKind : DOC_CATEGORIES.find((c) => c.kinds.includes(initialKind))?.kind ?? 'other';
  const [kind, setKind] = useState(known);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="documentId" value={documentId} />
      <DetailsFields kind={kind} setKind={setKind} today={today} values={{ title, date: date ?? '', examType: examType ?? 'irm', specialty: specialty ?? '' }} allowAuto={false} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        <span>
          Médecin, laboratoire ou centre <span className="font-normal text-ink-3">(facultatif)</span>
        </span>
        <input name="issuer" maxLength={120} defaultValue={issuer ?? ''} className={field} />
      </label>
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      {state.ok && <Alert tone="success">{state.message}</Alert>}
      <Submit pending="Enregistrement…">Enregistrer le classement</Submit>
    </form>
  );
}

export function UploadForm({
  defaultKind = '',
  defaultExamType,
  defaultSpecialty,
  today,
}: {
  defaultKind?: string;
  /** Type d'examen présélectionné (imagerie), ex. « irm » depuis /documents?examen=irm. */
  defaultExamType?: string;
  /** Spécialité présélectionnée, ex. « urologie » depuis /documents?specialite=urologie. */
  defaultSpecialty?: string;
  today: string;
}) {
  const [state, action] = useActionState(uploadDocumentAction, {} as FormState);
  const [kind, setKind] = useState(state.values?.kind ?? defaultKind);
  const [files, setFiles] = useState<File[]>([]);
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const hidden = useRef<HTMLInputElement>(null);

  const sync = (next: File[]) => {
    setFiles(next);
    const dt = new DataTransfer();
    next.forEach((f) => dt.items.add(f));
    if (hidden.current) hidden.current.files = dt.files;
  };
  const add = (list: FileList | null) => {
    if (list) sync([...files, ...Array.from(list)].slice(0, 10));
  };
  const remove = (i: number) => sync(files.filter((_, j) => j !== i));
  const pick = 'flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line p-3 text-center hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-petrol';

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      <input ref={hidden} type="file" name="files" multiple hidden />
      {/* Appareil photo (mobile) : une page par photo, plusieurs photos possibles. */}
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => add(e.target.files)} />
      <input ref={picker} type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png" multiple hidden onChange={(e) => add(e.target.files)} />
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => camera.current?.click()} className={pick}>
          <Icon name="camera" className="size-6 text-petrol" />
          <span className="font-semibold">Prendre en photo</span>
          <span className="text-[13px] text-ink-3">Une photo par page</span>
        </button>
        <button type="button" onClick={() => picker.current?.click()} className={pick}>
          <Icon name="document" className="size-6 text-petrol" />
          <span className="font-semibold">Choisir un fichier</span>
          <span className="text-[13px] text-ink-3">PDF ou image, 10 Mo max.</span>
        </button>
      </div>
      {files.length > 0 && (
        <ol className="flex flex-col gap-1.5 text-sm">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex min-w-0 items-center justify-between gap-2 rounded-xl bg-surface-2 pl-3">
              <span className="min-w-0 truncate">
                Page {i + 1} · {f.name} <span className="text-ink-3">({Math.round(f.size / 1024)} Ko)</span>
              </span>
              <button type="button" onClick={() => remove(i)} className={buttonClass({ variant: 'ghost', className: '!text-red' })} aria-label={`Retirer ${f.name}`}>
                Retirer
              </button>
            </li>
          ))}
        </ol>
      )}
      <DetailsFields
        kind={kind}
        setKind={setKind}
        today={today}
        values={state.values ?? { ...(defaultExamType ? { examType: defaultExamType } : {}), ...(defaultSpecialty ? { specialty: defaultSpecialty } : {}) }}
        allowAuto
      />
      <Submit pending={kind === 'prescription' || kind === 'lab_report' || kind === '' ? 'Envoi et lecture du document…' : 'Envoi du document…'} disabled={files.length === 0}>
        Enregistrer {files.length > 1 ? `les ${files.length} pages` : 'le document'}
      </Submit>
      <Meta>
        L’original est protégé et conservé. Ordonnances et bilans sanguins sont lus sur nos serveurs, sans service extérieur ; rien n’est enregistré
        avant votre validation.
      </Meta>
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
const input = 'min-h-11 w-full min-w-0 rounded-lg border border-line bg-surface px-2.5 text-ink';
const small = 'flex min-w-0 flex-col gap-0.5 text-sm text-ink-2';

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
  const ignoreAll = () => setRows((r) => Object.fromEntries(Object.entries(r).map(([id, row]) => [id, { ...row, action: row.action ?? 'ignore' }])));
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Date du prélèvement
          <input type="date" name="sampledOn" required max={today} value={date} onChange={(e) => setDate(e.target.value)} className={input} />
          {!sampledOn && <span className="font-normal text-amber">Date non trouvée dans le document : indiquez-la.</span>}
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Laboratoire
          <input name="laboratory" maxLength={120} value={lab} onChange={(e) => setLab(e.target.value)} className={input} />
        </label>
      </div>
      {undecided > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Meta>Comparez chaque ligne avec le document, puis confirmez ou ignorez-la.</Meta>
          <Button variant="ghost" onClick={ignoreAll}>
            Tout ignorer
          </Button>
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {drafts.map((d) => {
          const r = rows[d.id]!;
          const analyte = getAnalyte(r.analyteCode);
          const units = analyte ? unitsFor(analyte) : [];
          const alert = d.checks.some((c) => c.severity === 'block') ? 'block' : d.checks.length ? 'warn' : null;
          const serverErr = state.fieldErrors?.[d.id];
          return (
            <li key={d.id} className={rowClass(r.action, alert)}>
              <p className="font-semibold">{analyte?.nameFr ?? 'Analyse non reconnue'}</p>
              <p className="break-words text-[13px] text-ink-3">
                Lu{d.page ? ` page ${d.page}` : ''} : <span className="font-mono">« {d.lineText ?? d.rawLabel} »</span>
              </p>
              {d.checks.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1">
                  {d.checks.map((c, i) => (
                    <li key={i} data-check={c.severity} className={`text-sm ${c.severity === 'block' ? 'font-medium text-red' : 'text-amber'}`}>
                      ⚠️ {c.severity === 'block' ? 'À corriger : ' : ''}
                      {c.messageFr}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[1.6fr_1fr_1fr_0.8fr_0.8fr]">
                <label className={`${small} col-span-2 sm:col-span-1`}>
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
                <label className={small}>
                  Résultat
                  <input value={r.value} onChange={(e) => set(d.id, { value: e.target.value })} inputMode="decimal" className={`${input} tabular font-semibold`} />
                </label>
                <label className={small}>
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
                <label className={small}>
                  Référence basse
                  <input value={r.refLow} onChange={(e) => set(d.id, { refLow: e.target.value })} inputMode="decimal" className={input} />
                </label>
                <label className={small}>
                  Référence haute
                  <input value={r.refHigh} onChange={(e) => set(d.id, { refHigh: e.target.value })} inputMode="decimal" className={input} />
                </label>
              </div>
              {serverErr && (
                <p role="alert" className="mt-2 text-sm text-red">
                  {serverErr}
                </p>
              )}
              <DecisionButtons value={r.action} onChange={(a) => set(d.id, { action: a })} label={`Décision pour ${d.rawLabel}`} />
            </li>
          );
        })}
      </ul>

      <StickySaveBar undecided={undecided} disabled={undecided > 0 || !date} pending="Enregistrement…">
        {confirmed ? `Enregistrer les ${confirmed} résultat${confirmed > 1 ? 's' : ''} confirmé${confirmed > 1 ? 's' : ''}` : 'Terminer sans rien enregistrer'}
      </StickySaveBar>
    </form>
  );
}
