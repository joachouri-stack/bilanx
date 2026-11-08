"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { ANALYTES, getAnalyte, unitsFor } from "@bilanx/domain";
import {
  reviewDocumentAction,
  updateDocumentDetailsAction,
  uploadDocumentAction,
  type FormState,
} from "@/lib/server/actions";
import {
  DOC_CATEGORIES,
  DOC_SHORTCUTS,
  EXAM_LABELS,
  FOLDERS,
  SPECIALTIES,
  type DocCategoryIcon,
} from "@/lib/document-categories";
import { Alert } from "./forms";
import { useFormStatus } from "react-dom";
import { Icon } from "./icon";
import { DocIcon } from "./documents-icons";
import { Button, Meta, buttonClass } from "./ui";
import { DecisionButtons, StickySaveBar, rowClass } from "./documents-review";

function Submit({
  children,
  pending,
  disabled,
}: {
  children: React.ReactNode;
  pending: string;
  disabled?: boolean;
}) {
  const s = useFormStatus();
  return (
    <button
      type="submit"
      disabled={s.pending || disabled}
      className={buttonClass({ variant: "primary", className: "w-full" })}
    >
      {s.pending ? pending : children}
    </button>
  );
}

const field =
  "min-h-12 w-full min-w-0 rounded-xl border border-line bg-surface px-3";

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
    `flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-[15px] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-petrol ${selected ? "border-petrol bg-petrol-2 font-semibold text-petrol" : "border-line"}`;
  return (
    <>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Type de document</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {DOC_CATEGORIES.map((c) => (
            <label key={c.key} className={choice(kind === c.kind)}>
              <input
                type="radio"
                name="kind"
                value={c.kind}
                checked={kind === c.kind}
                onChange={() => setKind(c.kind)}
                className="sr-only"
              />
              <DocIcon name={c.svg} />
              {c.single === "Document" ? "Autre" : c.single}
            </label>
          ))}
          {allowAuto && (
            <label className={choice(kind === "")}>
              <input
                type="radio"
                name="kind"
                value=""
                checked={kind === ""}
                onChange={() => setKind("")}
                className="sr-only"
              />
              <Icon name="sparkle" className="size-5 shrink-0" />
              Je ne sais pas
            </label>
          )}
        </div>
      </fieldset>
      {kind === "imaging" && (
        <label className="flex flex-col gap-1 text-sm font-medium">
          Examen
          <select
            name="examType"
            defaultValue={values.examType ?? "irm"}
            className={field}
          >
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
          Spécialité{" "}
          <span className="font-normal text-ink-3">(facultatif)</span>
        </span>
        <select
          name="specialty"
          defaultValue={values.specialty ?? ""}
          aria-describedby="aide-specialite"
          className={`${field} min-h-11 text-base`}
        >
          <option value="">Aucune</option>
          {SPECIALTIES.map((sp) => (
            <option key={sp.code} value={sp.code}>
              {sp.label}
            </option>
          ))}
        </select>
        <span id="aide-specialite" className="font-normal text-ink-3">
          Le médecin concerné : urologue, ophtalmo, ORL… pour retrouver ses
          documents en un instant.
        </span>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        <span>
          Dossier <span className="font-normal text-ink-3">(facultatif)</span>
        </span>
        <select
          name="folder"
          defaultValue={values.folder ?? ""}
          className={`${field} min-h-11 text-base`}
        >
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
            Date du document{" "}
            <span className="font-normal text-ink-3">(facultatif)</span>
          </span>
          <input
            type="date"
            name="date"
            max={today}
            defaultValue={values.date}
            className={field}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          <span>
            Titre <span className="font-normal text-ink-3">(facultatif)</span>
          </span>
          <input
            name="title"
            maxLength={200}
            defaultValue={values.title}
            placeholder={
              kind === "imaging"
                ? "ex. IRM du genou droit"
                : "ex. Dr Martin, cardiologue"
            }
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
  const [state, action] = useActionState(
    updateDocumentDetailsAction,
    {} as FormState,
  );
  const known = DOC_CATEGORIES.some((c) => c.kind === initialKind)
    ? initialKind
    : (DOC_CATEGORIES.find((c) => c.kinds.includes(initialKind))?.kind ??
      "other");
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
          date: date ?? "",
          examType: examType ?? "irm",
          specialty: specialty ?? "",
          folder: folder ?? "",
        }}
        allowAuto={false}
      />
      <label className="flex flex-col gap-1 text-sm font-medium">
        <span>
          Médecin, laboratoire ou centre{" "}
          <span className="font-normal text-ink-3">(facultatif)</span>
        </span>
        <input
          name="issuer"
          maxLength={120}
          defaultValue={issuer ?? ""}
          className={field}
        />
      </label>
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      {state.ok && <Alert tone="success">{state.message}</Alert>}
      <Submit pending="Enregistrement…">Enregistrer le classement</Submit>
    </form>
  );
}

/** Destination d'un document : la catégorie et, le cas échéant, l'examen, la spécialité ou le dossier. */
interface Destination {
  key: string;
  label: string;
  icon: DocCategoryIcon;
  tone: string;
  kind: string;
  examType?: string;
  specialty?: string;
  folder?: string;
}

const DEST_TONE: Record<string, string> = {
  amber: "bg-amber-2 text-amber",
  petrol: "bg-petrol-2 text-petrol",
  glucose: "bg-glucose-2 text-glucose",
  sage: "bg-sage-2 text-sage",
  neutral: "bg-surface-2 text-ink-2",
};

/** Les dossiers du tableau de bord, puis « Autre » et « Je ne sais pas » (lecture automatique). */
const DESTINATIONS: Destination[] = [
  ...DOC_SHORTCUTS.map((s): Destination => {
    const folder = FOLDERS.find((f) => f.code === s.key);
    const exam = ["irm", "scanner", "radio"].includes(s.key)
      ? s.key
      : undefined;
    const spec = SPECIALTIES.find((x) => x.code === s.key);
    const kind =
      s.key === "ordonnances"
        ? "prescription"
        : s.key === "analyses"
          ? "lab_report"
          : s.key === "comptes-rendus"
            ? "medical_report"
            : exam
              ? "imaging"
              : folder
                ? "other"
                : "";
    return {
      key: s.key,
      label: s.label,
      icon: s.icon,
      tone: s.tone,
      kind,
      examType: exam,
      specialty: spec?.code,
      folder: folder?.code,
    };
  }),
  {
    key: "autre",
    label: "Autre",
    icon: "folder",
    tone: "neutral",
    kind: "other",
  },
  {
    key: "auto",
    label: "Je ne sais pas",
    icon: "sparkle",
    tone: "neutral",
    kind: "",
  },
];

/** Destination présélectionnée depuis la page d'où l'on vient (dossier, examen, spécialité, catégorie). */
function initialDestination(
  kind: string,
  examType?: string,
  specialty?: string,
  folder?: string,
): Destination | null {
  if (folder) return DESTINATIONS.find((d) => d.folder === folder) ?? null;
  if (examType) {
    return (
      DESTINATIONS.find((d) => d.examType === examType) ?? {
        key: `examen-${examType}`,
        label: EXAM_LABELS[examType] ?? "Imagerie",
        icon: "imaging",
        tone: "glucose",
        kind: "imaging",
        examType,
      }
    );
  }
  if (specialty) {
    const sp = SPECIALTIES.find((x) => x.code === specialty);
    return (
      DESTINATIONS.find((d) => d.specialty === specialty) ??
      (sp
        ? {
            key: `spec-${specialty}`,
            label: sp.title,
            icon: "folder",
            tone: "neutral",
            kind: "",
            specialty,
          }
        : null)
    );
  }
  if (kind === "imaging")
    return {
      key: "imagerie",
      label: "Imagerie",
      icon: "imaging",
      tone: "glucose",
      kind: "imaging",
      examType: "autre",
    };
  const byKind: Record<string, string> = {
    prescription: "ordonnances",
    lab_report: "analyses",
    medical_report: "comptes-rendus",
    other: "autre",
  };
  return kind
    ? (DESTINATIONS.find((d) => d.key === byKind[kind]) ?? null)
    : null;
}

/** Aperçu d'une page choisie (image) ou pastille PDF. */
function PageThumb({
  file,
  index,
  onRemove,
}: {
  file: File;
  index: number;
  onRemove: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file.type.startsWith("image/")) return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <li className="relative">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- aperçu local, jamais envoyé ailleurs
        <img
          src={url}
          alt=""
          className="size-24 rounded-xl border border-line bg-white object-cover object-top"
        />
      ) : (
        <span
          className="grid size-24 place-items-center rounded-xl border border-line bg-surface-2 text-petrol"
          aria-hidden
        >
          <Icon name="document" className="size-8" />
        </span>
      )}
      <span className="absolute bottom-1 left-1 rounded-md bg-black/60 px-1.5 text-[11px] font-semibold text-white">
        {file.type === "application/pdf" ? "PDF" : `p. ${index + 1}`}
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
  defaultKind = "",
  defaultExamType,
  defaultSpecialty,
  defaultFolder,
  today,
}: {
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
  const preset = useMemo(
    () =>
      initialDestination(
        defaultKind,
        defaultExamType,
        defaultSpecialty,
        defaultFolder,
      ),
    [defaultKind, defaultExamType, defaultSpecialty, defaultFolder],
  );
  const [dest, setDest] = useState<Destination | null>(preset);
  const [choosing, setChoosing] = useState(!preset);
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
  const pick =
    "flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-2xl bg-surface-2 p-3 text-center transition hover:bg-line active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-petrol";
  const reads =
    !dest ||
    dest.kind === "" ||
    dest.kind === "prescription" ||
    dest.kind === "lab_report";

  return (
    <form action={action} className="flex flex-col gap-5">
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      <input ref={hidden} type="file" name="files" multiple hidden />
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => add(e.target.files)}
      />
      <input
        ref={picker}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png"
        multiple
        hidden
        onChange={(e) => add(e.target.files)}
      />
      {/* Destination : champs envoyés au serveur. */}
      <input type="hidden" name="kind" value={dest?.kind ?? ""} />
      {dest?.examType && (
        <input type="hidden" name="examType" value={dest.examType} />
      )}
      {dest?.specialty && (
        <input type="hidden" name="specialty" value={dest.specialty} />
      )}
      {dest?.folder && (
        <input type="hidden" name="folder" value={dest.folder} />
      )}

      {/* 1. Où ranger le document */}
      <section aria-labelledby="ou-ranger">
        <h3 id="ou-ranger" className="mb-2 text-sm font-semibold text-ink-2">
          Ranger dans
        </h3>
        {dest && !choosing ? (
          <div className="flex items-center gap-3 rounded-2xl border border-line p-2.5 pr-2">
            <span
              className={`grid size-11 shrink-0 place-items-center rounded-xl ${DEST_TONE[dest.tone] ?? DEST_TONE.neutral}`}
              aria-hidden
            >
              <DocIcon name={dest.icon} className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{dest.label}</span>
              {dest.kind === "" && (
                <span className="block text-[13px] text-ink-3">
                  BILANX reconnaît ordonnances et bilans
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => setChoosing(true)}
              className={buttonClass({
                variant: "ghost",
                className: "shrink-0 text-petrol",
              })}
            >
              Changer
            </button>
          </div>
        ) : (
          <div
            className="grid grid-cols-3 gap-2"
            role="radiogroup"
            aria-labelledby="ou-ranger"
          >
            {DESTINATIONS.map((d) => (
              <button
                key={d.key}
                type="button"
                role="radio"
                aria-checked={dest?.key === d.key}
                onClick={() => {
                  setDest(d);
                  setChoosing(false);
                }}
                className={`flex h-full min-h-20 w-full flex-col items-center justify-center gap-1.5 rounded-2xl border p-2 text-center text-[13px] font-medium leading-tight transition active:scale-[0.97] ${
                  dest?.key === d.key
                    ? "border-petrol bg-petrol-2"
                    : "border-line hover:bg-surface-2"
                }`}
              >
                <span
                  className={`grid size-9 place-items-center rounded-xl ${DEST_TONE[d.tone] ?? DEST_TONE.neutral}`}
                  aria-hidden
                >
                  <DocIcon name={d.icon} className="size-5" />
                </span>
                {d.label}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* 2. Le document */}
      <section aria-labelledby="le-document">
        <h3 id="le-document" className="mb-2 text-sm font-semibold text-ink-2">
          Le document
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => camera.current?.click()}
            className={pick}
          >
            <span
              className="grid size-11 place-items-center rounded-full bg-petrol text-on-accent"
              aria-hidden
            >
              <Icon name="camera" className="size-6" />
            </span>
            <span className="font-semibold">Photo</span>
          </button>
          <button
            type="button"
            onClick={() => picker.current?.click()}
            className={pick}
          >
            <span
              className="grid size-11 place-items-center rounded-full bg-surface text-petrol ring-1 ring-line"
              aria-hidden
            >
              <Icon name="document" className="size-6" />
            </span>
            <span className="font-semibold">Fichier</span>
          </button>
        </div>
        {files.length > 0 ? (
          <ol
            className="mt-3 flex flex-wrap gap-3 pt-2"
            aria-label="Pages choisies"
          >
            {files.map((f, i) => (
              <PageThumb
                key={`${f.name}-${i}`}
                file={f}
                index={i}
                onRemove={() => remove(i)}
              />
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-center text-[13px] text-ink-3">
            Une photo par page · PDF ou image, 10 Mo max.
          </p>
        )}
      </section>

      {/* 3. Facultatif */}
      <details
        className="group rounded-2xl border border-line"
        open={!!(state.values?.title || state.values?.date)}
      >
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium text-ink-2 [&::-webkit-details-marker]:hidden">
          <Icon name="plus" className="size-4" />
          <span className="flex-1">Titre et date (facultatif)</span>
          <Icon
            name="chevronDown"
            className="size-4 transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="grid grid-cols-1 gap-3 px-3 pb-3 sm:grid-cols-2">
          <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
            Titre
            <input
              name="title"
              maxLength={200}
              defaultValue={state.values?.title}
              placeholder="ex. Attestation CDAPH"
              className={field}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
            Date du document
            <input
              type="date"
              name="date"
              max={today}
              defaultValue={state.values?.date}
              className={field}
            />
          </label>
        </div>
      </details>

      <Submit
        pending={reads ? "Envoi et lecture du document…" : "Envoi du document…"}
        disabled={files.length === 0 || !dest}
      >
        {!dest
          ? "Choisissez où le ranger"
          : files.length === 0
            ? "Ajoutez une photo ou un fichier"
            : `Enregistrer${files.length > 1 ? ` les ${files.length} pages` : ""}`}
      </Submit>
      <Meta className="-mt-2 text-center">
        L’original est protégé. Rien n’est enregistré dans vos résultats avant
        votre validation.
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
  checks: { code: string; severity: "block" | "warn"; messageFr: string }[];
}

type RowState = {
  action: "confirm" | "ignore" | null;
  analyteCode: string;
  value: string;
  unit: string;
  refLow: string;
  refHigh: string;
};

const fmt = (n: number | null) =>
  n === null ? "" : String(n).replace(".", ",");
const input =
  "min-h-11 w-full min-w-0 rounded-lg border border-line bg-surface px-2.5 text-ink";
const small = "flex min-w-0 flex-col gap-0.5 text-sm text-ink-2";

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
          action: null,
          analyteCode: d.analyteCode ?? "",
          value: d.rawValue,
          unit: d.rawUnit ?? "",
          refLow: fmt(d.refLow),
          refHigh: fmt(d.refHigh),
        },
      ]),
    ),
  );
  const [date, setDate] = useState(sampledOn ?? "");
  const [lab, setLab] = useState(laboratory ?? "");
  const set = (id: string, patch: Partial<RowState>) =>
    setRows((r) => ({ ...r, [id]: { ...r[id]!, ...patch } }));
  const ignoreAll = () =>
    setRows((r) =>
      Object.fromEntries(
        Object.entries(r).map(([id, row]) => [
          id,
          { ...row, action: row.action ?? "ignore" },
        ]),
      ),
    );
  const undecided = drafts.filter((d) => !rows[d.id]!.action).length;
  const confirmed = drafts.filter(
    (d) => rows[d.id]!.action === "confirm",
  ).length;
  const decisions = useMemo(
    () =>
      JSON.stringify(
        drafts.map((d) => {
          const r = rows[d.id]!;
          return {
            draftId: d.id,
            action: r.action ?? "ignore",
            analyteCode: r.analyteCode,
            value: r.value,
            unit: r.unit,
            refLow: r.refLow,
            refHigh: r.refHigh,
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Date du prélèvement
          <input
            type="date"
            name="sampledOn"
            required
            max={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={input}
          />
          {!sampledOn && (
            <span className="font-normal text-amber">
              Date non trouvée dans le document : indiquez-la.
            </span>
          )}
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Laboratoire
          <input
            name="laboratory"
            maxLength={120}
            value={lab}
            onChange={(e) => setLab(e.target.value)}
            className={input}
          />
        </label>
      </div>
      {undecided > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Meta>
            Comparez chaque ligne avec le document, puis confirmez ou
            ignorez-la.
          </Meta>
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
          const alert = d.checks.some((c) => c.severity === "block")
            ? "block"
            : d.checks.length
              ? "warn"
              : null;
          const serverErr = state.fieldErrors?.[d.id];
          return (
            <li key={d.id} className={rowClass(r.action, alert)}>
              <p className="font-semibold">
                {analyte?.nameFr ?? "Analyse non reconnue"}
              </p>
              <p className="break-words text-[13px] text-ink-3">
                Lu{d.page ? ` page ${d.page}` : ""} :{" "}
                <span className="font-mono">
                  « {d.lineText ?? d.rawLabel} »
                </span>
              </p>
              {d.checks.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1">
                  {d.checks.map((c, i) => (
                    <li
                      key={i}
                      data-check={c.severity}
                      className={`text-sm ${c.severity === "block" ? "font-medium text-red" : "text-amber"}`}
                    >
                      ⚠️ {c.severity === "block" ? "À corriger : " : ""}
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
                      set(d.id, {
                        analyteCode: e.target.value,
                        unit:
                          a && !unitsFor(a).includes(r.unit)
                            ? a.canonicalUnit
                            : r.unit,
                      });
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
                  <input
                    value={r.value}
                    onChange={(e) => set(d.id, { value: e.target.value })}
                    inputMode="decimal"
                    className={`${input} tabular font-semibold`}
                  />
                </label>
                <label className={small}>
                  Unité
                  <select
                    value={r.unit}
                    onChange={(e) => set(d.id, { unit: e.target.value })}
                    className={input}
                  >
                    {!units.includes(r.unit) && (
                      <option value={r.unit}>{r.unit || "—"}</option>
                    )}
                    {units.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={small}>
                  Référence basse
                  <input
                    value={r.refLow}
                    onChange={(e) => set(d.id, { refLow: e.target.value })}
                    inputMode="decimal"
                    className={input}
                  />
                </label>
                <label className={small}>
                  Référence haute
                  <input
                    value={r.refHigh}
                    onChange={(e) => set(d.id, { refHigh: e.target.value })}
                    inputMode="decimal"
                    className={input}
                  />
                </label>
              </div>
              {serverErr && (
                <p role="alert" className="mt-2 text-sm text-red">
                  {serverErr}
                </p>
              )}
              <DecisionButtons
                value={r.action}
                onChange={(a) => set(d.id, { action: a })}
                label={`Décision pour ${d.rawLabel}`}
              />
            </li>
          );
        })}
      </ul>

      <StickySaveBar
        undecided={undecided}
        disabled={undecided > 0 || !date}
        pending="Enregistrement…"
      >
        {confirmed
          ? `Enregistrer les ${confirmed} résultat${confirmed > 1 ? "s" : ""} confirmé${confirmed > 1 ? "s" : ""}`
          : "Terminer sans rien enregistrer"}
      </StickySaveBar>
    </form>
  );
}
