'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { ANALYTES, getAnalyte, unitsFor } from '@bilanx/domain';
import { reviewDocumentAction, updateDocumentDetailsAction, uploadDocumentAction, type FormState } from '@/lib/server/actions';
import { DOC_CATEGORIES, EXAM_LABELS, FOLDERS, PINNED_SPECIALTIES, SPECIALTIES, type DocCategoryIcon } from '@/lib/document-categories';
import { Alert } from './forms';
import { useFormStatus } from 'react-dom';
import { Icon } from './icon';
import { DocIcon } from './documents-icons';
import { Meta, buttonClass } from './ui';

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
function DetailsFields({
  kind,
  setKind,
  today,
  values,
  allowAuto,
}: {
  kind: string;
  setKind: (k: string) => void;
  today: string;
  values: Record<string, string>;
  allowAuto: boolean;
}) {
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
      <label className="flex flex-col gap-1 text-sm font-medium">
        <span>
          Dossier <span className="font-normal text-ink-3">(facultatif)</span>
        </span>
        <select name="folder" defaultValue={values.folder ?? ''} className={`${field} min-h-11 text-base`}>
          <option value="">Aucun</option>
          {FOLDERS.map((f) => (
            <option key={f.code} value={f.code}>
              {f.title}
            </option>
          ))}
        </select>
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
          <input
            name="title"
            maxLength={200}
            defaultValue={values.title}
            placeholder={kind === 'imaging' ? 'ex. IRM du genou droit' : 'ex. Dr Martin, cardiologue'}
            className={field}
          />
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
  folder,
  issuer,
}: {
  documentId: string;
  today: string;
  kind: string;
  title: string;
  date: string | null;
  examType: string | null;
  specialty: string | null;
  folder: string | null;
  issuer: string | null;
}) {
  const [state, action] = useActionState(updateDocumentDetailsAction, {} as FormState);
  const known = DOC_CATEGORIES.some((c) => c.kind === initialKind) ? initialKind : (DOC_CATEGORIES.find((c) => c.kinds.includes(initialKind))?.kind ?? 'other');
  const [kind, setKind] = useState(known);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="documentId" value={documentId} />
      <DetailsFields
        kind={kind}
        setKind={setKind}
        today={today}
        values={{
          title,
          date: date ?? '',
          examType: examType ?? 'irm',
          specialty: specialty ?? '',
          folder: folder ?? '',
        }}
        allowAuto={false}
      />
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

/** Réponse à « Quel document ? » : le type (et, pour l'administratif, le dossier). */
interface TypeChoice {
  key: string;
  label: string;
  icon: DocCategoryIcon;
  tone: string;
  kind: string;
  folder?: string;
  /** Les documents administratifs n'ont pas de spécialité. */
  medical: boolean;
}

const TONE: Record<string, string> = {
  amber: 'bg-amber-2 text-amber',
  petrol: 'bg-petrol-2 text-petrol',
  glucose: 'bg-glucose-2 text-glucose',
  sage: 'bg-sage-2 text-sage',
  rose: 'bg-rose-2 text-rose',
  neutral: 'bg-surface-2 text-ink-2',
};

const TYPE_CHOICES: TypeChoice[] = [
  { key: 'ordonnances', label: 'Ordonnance', icon: 'prescription', tone: 'amber', kind: 'prescription', medical: true },
  { key: 'analyses', label: 'Bilan sanguin', icon: 'flask', tone: 'petrol', kind: 'lab_report', medical: true },
  { key: 'imagerie', label: 'Imagerie', icon: 'imaging', tone: 'glucose', kind: 'imaging', medical: true },
  { key: 'comptes-rendus', label: 'Compte rendu', icon: 'document', tone: 'sage', kind: 'medical_report', medical: true },
  { key: 'mutuelle', label: 'Mutuelle', icon: 'shield', tone: 'petrol', kind: 'other', folder: 'mutuelle', medical: false },
  { key: 'attestation', label: 'Attestation', icon: 'certificate', tone: 'neutral', kind: 'other', folder: 'attestation', medical: false },
  { key: 'autre', label: 'Autre', icon: 'folder', tone: 'neutral', kind: 'other', medical: true },
  { key: 'auto', label: 'Je ne sais pas', icon: 'sparkle', tone: 'neutral', kind: '', medical: true },
];

/** Type présélectionné depuis le dossier ouvert (catégorie ou dossier administratif). */
function initialType(kind: string, folder?: string): TypeChoice | null {
  if (folder) return TYPE_CHOICES.find((t) => t.folder === folder) ?? null;
  if (!kind) return null;
  return TYPE_CHOICES.find((t) => t.kind === kind && !t.folder) ?? null;
}

/** Spécialités proposées en pastilles ; les autres sont dans « Autre… ». */
const QUICK_SPECS = SPECIALTIES.filter((s) => PINNED_SPECIALTIES.includes(s.code));

/** Aperçu d'une page choisie (image) ou pastille PDF. */
function PageThumb({ file, index, onRemove }: { file: File; index: number; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file.type.startsWith('image/')) return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <li className="relative">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- aperçu local, jamais envoyé ailleurs
        <img src={url} alt="" className="size-24 rounded-xl border border-line bg-white object-cover object-top" />
      ) : (
        <span className="grid size-24 place-items-center rounded-xl border border-line bg-surface-2 text-petrol" aria-hidden>
          <Icon name="document" className="size-8" />
        </span>
      )}
      <span className="absolute bottom-1 left-1 rounded-md bg-black/60 px-1.5 text-[11px] font-semibold text-white">
        {file.type === 'application/pdf' ? 'PDF' : `p. ${index + 1}`}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="absolute -right-2 -top-2 grid size-8 place-items-center rounded-full border border-line bg-surface text-ink-2 shadow-sm"
        aria-label={`Retirer ${file.name}`}
      >
        <Icon name="close" className="size-4" />
      </button>
    </li>
  );
}

export function UploadForm({
  defaultKind = '',
  defaultExamType,
  defaultSpecialty,
  defaultFolder,
  today,
  initialFiles,
}: {
  /** Pages déjà prises (bouton ＋ « Scanner » de la barre du bas). */
  initialFiles?: File[];
  defaultKind?: string;
  /** Type d'examen présélectionné (imagerie), ex. « irm » depuis /documents?examen=irm. */
  defaultExamType?: string;
  /** Spécialité présélectionnée, ex. « urologie » depuis /documents?specialite=urologie. */
  defaultSpecialty?: string;
  /** Dossier présélectionné, ex. « mutuelle » depuis /documents?dossier=mutuelle. */
  defaultFolder?: string;
  today: string;
}) {
  const [state, action] = useActionState(uploadDocumentAction, {} as FormState);
  const preset = useMemo(() => initialType(defaultKind, defaultFolder), [defaultKind, defaultFolder]);
  // Sans dossier d'origine : « Je ne sais pas » coché d'avance (la lecture reconnaît ordonnances et bilans) ; jamais de bouton bloqué.
  const [type, setType] = useState<TypeChoice | null>(preset ?? TYPE_CHOICES.find((t) => t.key === 'auto')!);
  const [choosing, setChoosing] = useState(!preset);
  const [exam, setExam] = useState(defaultExamType ?? 'irm');
  const [spec, setSpec] = useState(defaultSpecialty ?? '');
  const [moreSpecs, setMoreSpecs] = useState(!!defaultSpecialty && !QUICK_SPECS.some((s) => s.code === defaultSpecialty));
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
  useEffect(() => {
    if (initialFiles?.length) sync(initialFiles.slice(0, 10));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pages reçues à l'ouverture seulement
  }, [initialFiles]);
  const pick =
    'flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-2xl bg-surface-2 p-3 text-center transition hover:bg-line active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-petrol';
  const reads = !type || type.kind === '' || type.kind === 'prescription' || type.kind === 'lab_report';
  const showSpec = !type || type.medical;
  const specInfo = showSpec && spec ? SPECIALTIES.find((s) => s.code === spec) : undefined;
  const typeFolder = type && type.kind !== '' ? (type.folder ? FOLDERS.find((f) => f.code === type.folder)?.title : DOC_CATEGORIES.find((c) => c.kind === type.kind)?.label) : null;
  const pill = (on: boolean) =>
    `inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-[15px] font-medium transition active:scale-[0.97] ${
      on ? 'bg-rose text-on-accent' : 'border border-line bg-surface text-ink-2 hover:text-ink'
    }`;

  return (
    <form action={action} className="flex flex-col gap-5">
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      <input ref={hidden} type="file" name="files" multiple hidden />
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => add(e.target.files)} />
      <input
        ref={picker}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png"
        multiple
        hidden
        onChange={(e) => add(e.target.files)}
      />
      {/* Classement : champs envoyés au serveur. */}
      <input type="hidden" name="kind" value={type?.kind ?? ''} />
      {type?.kind === 'imaging' && <input type="hidden" name="examType" value={exam} />}
      {specInfo && <input type="hidden" name="specialty" value={specInfo.code} />}
      {type?.folder && <input type="hidden" name="folder" value={type.folder} />}

      {/* 1. Quel document */}
      <section aria-labelledby="quel-document">
        <h3 id="quel-document" className="mb-2 text-sm font-semibold text-ink-2">
          Quel document ?
        </h3>
        {type && !choosing ? (
          <div className="flex items-center gap-3 rounded-2xl border border-line p-2.5 pr-2">
            <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${TONE[type.tone] ?? TONE.neutral}`} aria-hidden>
              <DocIcon name={type.icon} className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{type.label}</span>
              {type.kind === '' && <span className="block text-[13px] text-ink-3">BILANX reconnaît ordonnances et bilans</span>}
            </span>
            <button type="button" onClick={() => setChoosing(true)} className={buttonClass({ variant: 'ghost', className: 'shrink-0 text-petrol' })}>
              Changer
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="quel-document">
            {TYPE_CHOICES.map((t) => (
              <button
                key={t.key}
                type="button"
                role="radio"
                aria-checked={type?.key === t.key}
                onClick={() => {
                  setType(t);
                  setChoosing(false);
                }}
                className={`flex h-full min-h-20 w-full flex-col items-center justify-center gap-1.5 rounded-2xl border p-2 text-center text-[13px] font-medium leading-tight transition active:scale-[0.97] ${
                  type?.key === t.key ? 'border-petrol bg-petrol-2' : 'border-line hover:bg-surface-2'
                }`}
              >
                <span className={`grid size-9 place-items-center rounded-xl ${TONE[t.tone] ?? TONE.neutral}`} aria-hidden>
                  <DocIcon name={t.icon} className="size-5" />
                </span>
                {t.label}
              </button>
            ))}
          </div>
        )}
        {type?.kind === 'imaging' && !choosing && (
          <div role="radiogroup" aria-label="Type d’examen" className="mt-2 flex flex-wrap gap-2">
            {Object.entries(EXAM_LABELS).map(([k, l]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={exam === k}
                onClick={() => setExam(k)}
                className={`min-h-10 rounded-full px-3.5 text-sm font-medium transition ${exam === k ? 'bg-glucose-2 text-glucose ring-1 ring-glucose' : 'bg-surface-2 text-ink-2'}`}
              >
                {k === 'autre' ? 'Autre' : l}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* 2. Quelle spécialité (facultatif) : le second dossier où le document apparaît. */}
      {showSpec && (
        <section aria-labelledby="quelle-specialite">
          <h3 id="quelle-specialite" className="mb-2 text-sm font-semibold text-ink-2">
            Dans quel dossier ? <span className="font-normal text-ink-3">(facultatif)</span>
          </h3>
          <div role="radiogroup" aria-labelledby="quelle-specialite" className="flex flex-wrap gap-2">
            <button type="button" role="radio" aria-checked={!spec} onClick={() => setSpec('')} className={pill(!spec)}>
              Aucun
            </button>
            {(moreSpecs ? SPECIALTIES : QUICK_SPECS).map((s) => (
              <button key={s.code} type="button" role="radio" aria-checked={spec === s.code} onClick={() => setSpec(s.code)} className={pill(spec === s.code)}>
                <DocIcon name={s.icon} className="size-[18px] shrink-0" />
                {s.short}
              </button>
            ))}
            {!moreSpecs && (
              <button type="button" onClick={() => setMoreSpecs(true)} className="inline-flex min-h-11 items-center rounded-full px-3 text-[15px] font-medium text-petrol">
                Autres…
              </button>
            )}
          </div>
          {typeFolder && specInfo && (
            <p className="mt-2 flex items-center gap-1.5 text-[13px] text-ink-3">
              <Icon name="folder" className="size-4 shrink-0" />
              Rangé dans « {specInfo.short} › {typeFolder} », et visible aussi dans « {typeFolder} »
            </p>
          )}
        </section>
      )}

      {/* 3. Le document */}
      <section aria-labelledby="le-document">
        <h3 id="le-document" className="mb-2 text-sm font-semibold text-ink-2">
          Le document
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => camera.current?.click()} className={pick}>
            <span className="grid size-11 place-items-center rounded-full bg-petrol text-on-accent" aria-hidden>
              <Icon name="camera" className="size-6" />
            </span>
            <span className="font-semibold">Photo</span>
          </button>
          <button type="button" onClick={() => picker.current?.click()} className={pick}>
            <span className="grid size-11 place-items-center rounded-full bg-surface text-petrol ring-1 ring-line" aria-hidden>
              <Icon name="document" className="size-6" />
            </span>
            <span className="font-semibold">Fichier</span>
          </button>
        </div>
        {files.length > 0 ? (
          <ol className="mt-3 flex flex-wrap gap-3 pt-2" aria-label="Pages choisies">
            {files.map((f, i) => (
              <PageThumb key={`${f.name}-${i}`} file={f} index={i} onRemove={() => remove(i)} />
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-center text-[13px] text-ink-3">Une photo par page · PDF ou image, 10 Mo max.</p>
        )}
      </section>

      {/* 4. Facultatif */}
      <details className="group rounded-2xl border border-line" open={!!(state.values?.title || state.values?.date)}>
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium text-ink-2 [&::-webkit-details-marker]:hidden">
          <Icon name="plus" className="size-4" />
          <span className="flex-1">Titre et date (facultatif)</span>
          <Icon name="chevronDown" className="size-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid grid-cols-1 gap-3 px-3 pb-3 sm:grid-cols-2">
          <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
            Titre
            <input name="title" maxLength={200} defaultValue={state.values?.title} placeholder="ex. Attestation CDAPH" className={field} />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
            Date du document
            <input type="date" name="date" max={today} defaultValue={state.values?.date} className={field} />
          </label>
        </div>
      </details>

      <Submit pending={reads ? 'Envoi et lecture du document…' : 'Envoi du document…'} disabled={files.length === 0 || !type}>
        {!type
          ? 'Choisissez le type de document'
          : files.length === 0
            ? 'Ajoutez une photo ou un fichier'
            : `Enregistrer${files.length > 1 ? ` les ${files.length} pages` : ''}`}
      </Submit>
      <Meta className="-mt-2 text-center">L’original est protégé. Rien n’est enregistré dans vos résultats avant votre validation.</Meta>
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

type RowState = {
  action: 'confirm' | 'ignore' | null;
  analyteCode: string;
  value: string;
  unit: string;
  refLow: string;
  refHigh: string;
};

const fmt = (n: number | null) => (n === null ? '' : String(n).replace('.', ','));
const input = 'min-h-11 w-full min-w-0 rounded-lg border border-line bg-surface px-2.5 text-ink';
const small = 'flex min-w-0 flex-col gap-0.5 text-sm text-ink-2';

/** Lignes sans danger à pré-cocher : analyse reconnue, aucune alerte bloquante, unité comprise, lecture sûre. */
const SAFE_SKIP = new Set(['unit_unknown', 'low_confidence', 'unit_ocr_corrected']);
const isSafe = (d: ReviewDraft) => !!d.analyteCode && !d.checks.some((c) => c.severity === 'block' || SAFE_SKIP.has(c.code));
/** Alertes affichées sur la ligne (la date manquante est demandée une seule fois, en haut). */
const rowChecks = (d: ReviewDraft) => d.checks.filter((c) => c.code !== 'sampling_date_missing' && c.code !== 'analyte_unmatched');

/** Ligne d'un résultat : case à cocher, nom, valeur ; « Modifier » ouvre la correction. */
function ResultRow({
  d,
  r,
  set,
  error,
  initiallyOpen,
}: {
  d: ReviewDraft;
  r: RowState;
  set: (patch: Partial<RowState>) => void;
  error?: string;
  initiallyOpen: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const analyte = getAnalyte(r.analyteCode);
  const units = analyte ? unitsFor(analyte) : [];
  const checks = rowChecks(d);
  const blocked = checks.some((c) => c.severity === 'block');
  const on = r.action === 'confirm';
  const ref = r.refLow || r.refHigh ? `${r.refLow || '…'} – ${r.refHigh || '…'}` : null;
  return (
    <li
      data-ligne
      className={`rounded-2xl border p-3 transition ${on ? 'border-sage bg-sage-2/30' : blocked ? 'border-red' : checks.length ? 'border-amber' : 'border-line'}`}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={on}
          aria-label={`${on ? 'Ne pas enregistrer' : 'Enregistrer'} ${analyte?.nameFr ?? d.rawLabel}`}
          onClick={() => set({ action: on ? 'ignore' : 'confirm' })}
          className={`grid size-7 shrink-0 place-items-center rounded-lg border-2 transition active:scale-90 ${on ? 'border-go bg-go text-white' : 'border-line bg-surface'}`}
        >
          {on && <Icon name="check" className="size-4" strokeWidth={3} />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{analyte?.nameFr ?? 'Analyse à choisir'}</p>
          <p className="truncate text-[12px] text-ink-3">
            {ref ? `réf. ${ref}` : `« ${d.rawLabel} »`}
          </p>
        </div>
        <p className="tabular shrink-0 text-right">
          <span className="text-lg font-bold">{r.value || '—'}</span> <span className="text-[13px] text-ink-3">{r.unit}</span>
        </p>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={`Modifier ${analyte?.nameFr ?? d.rawLabel}`}
          className="grid size-9 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-surface-2"
        >
          <Icon name="chevronDown" className={`size-5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {checks.length > 0 && (
        <ul className="mt-2 flex flex-col gap-0.5 pl-10">
          {checks.map((c, i) => (
            <li key={i} data-check={c.severity} className={`text-[13px] ${c.severity === 'block' ? 'font-medium text-red' : 'text-amber'}`}>
              {c.severity === 'block' ? 'À corriger : ' : ''}
              {c.messageFr}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-2 pl-10 text-sm text-red">
          {error}
        </p>
      )}
      {open && (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3">
          <p className="col-span-2 break-words text-[12px] text-ink-3">
            Lu{d.page ? ` page ${d.page}` : ''} : <span className="font-mono">« {d.lineText ?? d.rawLabel} »</span>
          </p>
          <label className={`${small} col-span-2`}>
            Analyse
            <select
              value={r.analyteCode}
              onChange={(e) => {
                const a = getAnalyte(e.target.value);
                set({ analyteCode: e.target.value, unit: a && !unitsFor(a).includes(r.unit) ? a.canonicalUnit : r.unit });
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
            <input value={r.value} onChange={(e) => set({ value: e.target.value })} inputMode="decimal" className={`${input} tabular font-semibold`} />
          </label>
          <label className={small}>
            Unité
            <select value={r.unit} onChange={(e) => set({ unit: e.target.value })} className={input}>
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
            <input value={r.refLow} onChange={(e) => set({ refLow: e.target.value })} inputMode="decimal" className={input} />
          </label>
          <label className={small}>
            Référence haute
            <input value={r.refHigh} onChange={(e) => set({ refHigh: e.target.value })} inputMode="decimal" className={input} />
          </label>
        </div>
      )}
    </li>
  );
}

/**
 * Validation d'un bilan lu automatiquement, en une étape :
 * - les résultats reconnus sans alerte sont pré-cochés (l'utilisateur relit et peut décocher) ;
 * - ceux qui demandent une vérification sont décochés et signalés ;
 * - les lignes non reconnues (adresses, numéros…) sont repliées et ignorées.
 * Rien n'est enregistré avant « Enregistrer ».
 */
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
        {
          action: isSafe(d) ? 'confirm' : 'ignore',
          analyteCode: d.analyteCode ?? '',
          value: d.rawValue,
          unit: d.rawUnit ?? '',
          refLow: fmt(d.refLow),
          refHigh: fmt(d.refHigh),
        },
      ]),
    ),
  );
  const [date, setDate] = useState(sampledOn ?? '');
  const [lab, setLab] = useState(laboratory ?? '');
  const set = (id: string, patch: Partial<RowState>) => setRows((r) => ({ ...r, [id]: { ...r[id]!, ...patch } }));
  const recognized = drafts.filter((d) => d.analyteCode);
  const unknown = drafts.filter((d) => !d.analyteCode);
  const confirmed = drafts.filter((d) => rows[d.id]!.action === 'confirm').length;
  const allOn = recognized.length > 0 && recognized.every((d) => rows[d.id]!.action === 'confirm');
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
  const row = (d: ReviewDraft) => (
    <ResultRow
      key={d.id}
      d={d}
      r={rows[d.id]!}
      set={(patch) => set(d.id, patch)}
      error={state.fieldErrors?.[d.id]}
      initiallyOpen={rowChecks(d).some((c) => c.severity === 'block')}
    />
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="documentId" value={documentId} />
      <input type="hidden" name="decisions" value={decisions} />
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}

      <div className="grid grid-cols-2 gap-3">
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Date du prélèvement
          <input type="date" name="sampledOn" required max={today} value={date} onChange={(e) => setDate(e.target.value)} className={`${input} ${!date ? 'border-amber' : ''}`} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Laboratoire
          <input name="laboratory" maxLength={120} value={lab} onChange={(e) => setLab(e.target.value)} className={input} />
        </label>
      </div>
      {!date && <p className="-mt-2 text-[13px] text-amber">Date non trouvée sur le document : indiquez-la.</p>}

      <section aria-labelledby="resultats-reconnus">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 id="resultats-reconnus" className="font-semibold">
            Résultats reconnus <span className="tabular font-normal text-ink-3">· {recognized.length}</span>
          </h3>
          {recognized.length > 1 && (
            <button
              type="button"
              className="min-h-10 text-sm font-medium text-petrol"
              onClick={() => setRows((rs) => Object.fromEntries(Object.entries(rs).map(([id, r]) => [id, recognized.some((d) => d.id === id) ? { ...r, action: allOn ? 'ignore' : 'confirm' } : r])))}
            >
              {allOn ? 'Tout décocher' : 'Tout cocher'}
            </button>
          )}
        </div>
        {recognized.length ? (
          <ul className="flex flex-col gap-2">{recognized.map(row)}</ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-line p-4 text-center text-sm text-ink-2">Aucune analyse reconnue automatiquement.</p>
        )}
        <p className="mt-2 text-[13px] text-ink-3">Comparez avec le document ci-dessus. Décochez ce qui ne doit pas être enregistré ; touchez ⌄ pour corriger.</p>
      </section>

      {unknown.length > 0 && (
        <details className="group rounded-2xl border border-line">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 text-sm text-ink-2 [&::-webkit-details-marker]:hidden">
            <span className="flex-1">
              {unknown.length} ligne{unknown.length > 1 ? 's' : ''} non reconnue{unknown.length > 1 ? 's' : ''} (adresses, numéros…) : ignorée{unknown.length > 1 ? 's' : ''}
            </span>
            <Icon name="chevronDown" className="size-4 transition-transform group-open:rotate-180" />
          </summary>
          <ul className="flex flex-col gap-2 px-3 pb-3">{unknown.map(row)}</ul>
        </details>
      )}

      <ReviewSaveBar count={confirmed} disabled={!date} />
    </form>
  );
}

function ReviewSaveBar({ count, disabled }: { count: number; disabled: boolean }) {
  const s = useFormStatus();
  return (
    <div className="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-10 rounded-2xl border border-line bg-surface p-3 shadow-lg lg:bottom-3">
      <button type="submit" disabled={s.pending || disabled} className={buttonClass({ variant: 'primary', className: 'w-full' })}>
        {s.pending
          ? 'Enregistrement…'
          : disabled
            ? 'Indiquez la date du prélèvement'
            : count
              ? `Enregistrer ${count} résultat${count > 1 ? 's' : ''}`
              : 'Terminer sans rien enregistrer'}
      </button>
    </div>
  );
}
