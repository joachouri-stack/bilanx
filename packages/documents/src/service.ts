import { randomBytes } from 'node:crypto';
import { decrypt, deriveKey, encrypt, sha256 } from '@bilanx/auth';
import type { Sql, TransactionSql } from '@bilanx/db';
import {
  assessDraft,
  getAnalyte,
  looksLikePrescription,
  parseLabReport,
  parsePrescription,
  validateMedication,
  type MedicationErrors,
  type PrescriptionCheck,
  parseReference,
  validateManualLab,
  zonedTimeToUtc,
  type CheckResult,
  type ManualLabErrors,
} from '@bilanx/domain';
import { ForbiddenError, type Actor, type ProfilesService } from '@bilanx/profiles';
import { imageText, pdfText, sniffMime, type AcceptedMime, type ExtractedText } from './text';
import { guessSpecialty } from './specialty';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
export const MAX_FILES = 10;
export const LOW_CONFIDENCE = 0.8;

export interface DocumentsConfig {
  sql: Sql;
  profiles: ProfilesService;
  secretKey: Buffer;
  timeZone?: string;
  now?: () => Date;
  /** Remplaçable dans les tests. */
  readText?: (mime: AcceptedMime, files: Buffer[]) => Promise<ExtractedText>;
}

export interface UploadFile {
  name: string;
  data: Buffer;
}

/** Catégories choisies par l'utilisateur (« auto » : laisser la lecture automatique décider). */
export const DOCUMENT_CATEGORIES = ['prescription', 'lab_report', 'imaging', 'medical_report', 'other'] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];
export const EXAM_TYPES = ['irm', 'scanner', 'radio', 'echo', 'autre'] as const;
export type ExamType = (typeof EXAM_TYPES)[number];
/** Spécialités médicales (liste fixe, voir db/migrations/0026_document_specialty.sql). */
export const SPECIALTIES = [
  'generaliste', 'cardiologie', 'dermatologie', 'endocrinologie', 'gastro', 'gynecologie', 'nephrologie', 'neurologie',
  'ophtalmologie', 'orl', 'pneumologie', 'rhumatologie', 'urologie', 'podologie', 'dentaire', 'psychiatrie', 'radiologie', 'autre',
  'vitamines', 'thrombose', 'cancer', 'psychologue', 'mdph', 'kine', 'osteopathe', 'orthophonie',
] as const;
export type Specialty = (typeof SPECIALTIES)[number];
/** Dossiers de rangement (liste fixe, voir db/migrations/0027_document_folder.sql). */
export const FOLDERS = ['vitamines', 'mutuelle', 'attestation'] as const;
export type Folder = (typeof FOLDERS)[number];

export interface DocumentDetails {
  /** Catégorie choisie ; absente = détection automatique. */
  kind?: DocumentCategory | null;
  title?: string | null;
  /** AAAA-MM-JJ : date du document (ordonnance, prélèvement, examen). */
  date?: string | null;
  examType?: ExamType | null;
  /** Spécialité médicale (facultative) : urologie, ophtalmologie, ORL… */
  specialty?: Specialty | null;
  /** Dossier de rangement (facultatif) : vitamines, mutuelle, attestation. */
  folder?: Folder | null;
}

export type UploadResult =
  | { ok: true; documentId: string; status: 'to_review' | 'no_values' | 'no_text' | 'not_processed' | 'stored'; drafts: number }
  | { ok: false; error: string };

export interface DraftView {
  id: string;
  rawLabel: string;
  rawValue: string;
  rawUnit: string | null;
  rawReference: string | null;
  analyteCode: string | null;
  refLow: number | null;
  refHigh: number | null;
  page: number | null;
  lineText: string | null;
  confidence: number | null;
  checks: CheckResult[];
  status: 'proposed' | 'confirmed' | 'corrected' | 'rejected';
}

export interface Decision {
  draftId: string;
  action: 'confirm' | 'ignore';
  analyteCode?: string;
  value?: string;
  unit?: string;
  refLow?: string;
  refHigh?: string;
}

export interface MedicationDraftView {
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
  confidence: number | null;
  checks: PrescriptionCheck[];
  status: 'proposed' | 'confirmed' | 'corrected' | 'rejected';
  medicationId: string | null;
}

export interface MedicationDecision {
  draftId: string;
  action: 'confirm' | 'ignore';
  name?: string;
  strength?: string;
  posology?: string;
  times?: string[];
  qty?: string[];
  startDate?: string;
  endDate?: string;
}

const defaultReadText = (mime: AcceptedMime, files: Buffer[]) => (mime === 'application/pdf' ? pdfText(files[0]!) : imageText(files));

/** Nombre d'analyses reconnues à partir duquel une « ordonnance » est signalée comme ressemblant à un bilan. */
const LAB_WARNING_MIN = 3;
/** Matériel médical courant sur les ordonnances (diabète notamment). */
const MEDICAL_DEVICE = /\b(capteurs?|bandelettes?|lancettes?|autopiqueurs?|auto-piqueurs?|[ée]lectrodes?|aiguilles?|lecteurs? de glyc[ée]mie|glucom[eè]tres?|pansements?|seringues?|stylos?|pompes? [àa] insuline|r[ée]servoirs?)\b/i;

export function createDocumentsService(cfg: DocumentsConfig) {
  const { sql, profiles } = cfg;
  const now = cfg.now ?? (() => new Date());
  const tz = cfg.timeZone ?? 'Europe/Paris';
  const kek = deriveKey(cfg.secretKey, 'document-dek');
  const readText = cfg.readText ?? defaultReadText;

  async function hasAutoReadingConsent(accountId: string): Promise<boolean> {
    const [c] = await sql`
      SELECT 1 FROM consent WHERE account_id = ${accountId} AND purpose = 'ai_extraction' AND withdrawn_at IS NULL LIMIT 1`;
    return !!c;
  }

  async function giveAutoReadingConsent(actor: Actor): Promise<void> {
    if (await hasAutoReadingConsent(actor.accountId)) return;
    await sql`INSERT INTO consent (account_id, purpose, version, given_at) VALUES (${actor.accountId}, 'ai_extraction', '2026-11-v1', ${now()})`;
  }

  // ───────────────────────── Dépôt ─────────────────────────
  function cleanDetails(d: DocumentDetails | undefined): { ok: true; kind: DocumentCategory | null; title: string | null; date: string | null; examType: ExamType | null; specialty: Specialty | null; folder: Folder | null } | { ok: false; error: string } {
    const kind = d?.kind && (DOCUMENT_CATEGORIES as readonly string[]).includes(d.kind) ? d.kind : null;
    if (d?.kind && !kind) return { ok: false, error: 'Catégorie de document inconnue.' };
    const title = d?.title?.trim().slice(0, 200) || null;
    let date: string | null = null;
    if (d?.date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || Number.isNaN(Date.parse(`${d.date}T12:00:00Z`))) return { ok: false, error: 'Date du document invalide.' };
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now());
      if (d.date > today) return { ok: false, error: 'La date du document ne peut pas être dans le futur.' };
      date = d.date;
    }
    const examType = kind === 'imaging' && d?.examType && (EXAM_TYPES as readonly string[]).includes(d.examType) ? d.examType : null;
    // Ancien dossier « vitamines » : c'est désormais un dossier thématique (spécialité, migration 0033).
    if (d?.folder === 'vitamines') d = { ...d, folder: null, specialty: d.specialty ?? 'vitamines' };
    const specialty = d?.specialty && (SPECIALTIES as readonly string[]).includes(d.specialty) ? d.specialty : null;
    if (d?.specialty && !specialty) return { ok: false, error: 'Spécialité inconnue.' };
    const folder = d?.folder && (FOLDERS as readonly string[]).includes(d.folder) ? d.folder : null;
    if (d?.folder && !folder) return { ok: false, error: 'Dossier inconnu.' };
    // Dossier administratif (vitamines, mutuelle, attestation) sans catégorie choisie : rangé tel quel, jamais lu comme un bilan.
    return { ok: true, kind: kind ?? (folder ? 'other' : null), title, date, examType, specialty, folder };
  }

  async function upload(actor: Actor, profileId: string, files: UploadFile[], details?: DocumentDetails): Promise<UploadResult> {
    const meta = cleanDetails(details);
    if (!meta.ok) return meta;
    if (!files.length) return { ok: false, error: 'Choisissez au moins un fichier.' };
    if (files.length > MAX_FILES) return { ok: false, error: `${MAX_FILES} fichiers maximum par document.` };
    let total = 0;
    const mimes: AcceptedMime[] = [];
    for (const f of files) {
      if (f.data.length === 0) return { ok: false, error: `« ${f.name} » est vide.` };
      if (f.data.length > MAX_FILE_BYTES) return { ok: false, error: `« ${f.name} » dépasse 10 Mo.` };
      total += f.data.length;
      const mime = sniffMime(f.data);
      if (mime === 'image/heic')
        return {
          ok: false,
          error: 'Le format HEIC (photos iPhone) n’est pas encore pris en charge. Utilisez « Prendre en photo » depuis BILANX ou choisissez « Le plus compatible » dans Réglages › Appareil photo › Formats.',
        };
      if (!mime) return { ok: false, error: `« ${f.name} » n’est ni un PDF ni une image JPEG, PNG ou WebP.` };
      mimes.push(mime);
    }
    if (total > MAX_TOTAL_BYTES) return { ok: false, error: 'Le document dépasse 25 Mo au total.' };
    const isPdf = mimes.includes('application/pdf');
    if (isPdf && files.length > 1) return { ok: false, error: 'Un PDF doit être déposé seul (il contient déjà toutes ses pages).' };

    const dek = randomBytes(32);
    const documentId = await profiles.withProfileData(actor, profileId, 'documents', 'write', async (tx) => {
      const [doc] = await tx<{ id: string }[]>`
        INSERT INTO document (profile_id, kind, title, storage_key, dek_enc, sha256, mime_type, page_count, size_bytes, uploaded_by, uploaded_at,
                              document_date, exam_type, specialty, folder, kind_by_user)
        VALUES (${profileId}, ${meta.kind ?? 'unknown'}, ${meta.title ?? files[0]!.name.slice(0, 200)}, 'db', ${Buffer.alloc(0)}, ${sha256(Buffer.concat(files.map((f) => f.data)))},
                ${isPdf ? 'application/pdf' : mimes[0]!}, ${files.length}, ${total}, ${actor.accountId}, ${now()},
                ${meta.date}, ${meta.examType}, ${meta.specialty}, ${meta.folder}, ${meta.kind !== null})
        RETURNING id`;
      const id = doc!.id;
      await tx`UPDATE document SET dek_enc = ${encrypt(kek, dek, id)}, storage_key = ${`db:${id}`} WHERE id = ${id}`;
      for (let i = 0; i < files.length; i++) {
        const f = files[i]!;
        await tx`
          INSERT INTO document_file (document_id, profile_id, page, mime_type, size_bytes, sha256, data_enc)
          VALUES (${id}, ${profileId}, ${i + 1}, ${mimes[i]!}, ${f.data.length}, ${sha256(f.data)}, ${encrypt(dek, f.data, `${id}:${i + 1}`)})`;
      }
      return id;
    });

    // Imagerie, comptes rendus, autres : simplement conservés (aucune valeur à extraire).
    if (meta.kind && meta.kind !== 'prescription' && meta.kind !== 'lab_report') return { ok: true, documentId, status: 'stored', drafts: 0 };
    if (!(await hasAutoReadingConsent(actor.accountId))) return { ok: true, documentId, status: 'not_processed', drafts: 0 };
    return { ok: true, documentId, ...(await safeExtract(actor, profileId, documentId, isPdf ? 'application/pdf' : mimes[0]!, files.map((f) => f.data), meta.kind)) };
  }

  /**
   * Lecture qui ne fait jamais échouer l'envoi : le document est déjà enregistré ; si la lecture plante
   * (photo inattendue, texte déroutant), elle est notée « impossible » et l'utilisateur garde son document.
   */
  async function safeExtract(actor: Actor, profileId: string, documentId: string, mime: AcceptedMime, data: Buffer[], hint: DocumentCategory | null = null) {
    try {
      return await extract(actor, profileId, documentId, mime, data, hint);
    } catch (e) {
      if (e instanceof ForbiddenError) throw e;
      console.error('Lecture du document impossible', documentId, e);
      await profiles
        .withProfileData(actor, profileId, 'documents', 'write', (tx) =>
          tx`INSERT INTO extraction_job (document_id, profile_id, status, error, created_at, finished_at)
             VALUES (${documentId}, ${profileId}, 'failed', ${String((e as Error)?.message ?? e).slice(0, 300)}, ${now()}, ${now()})`,
        )
        .catch(() => undefined);
      return { status: 'no_text' as const, drafts: 0 };
    }
  }

  // ───────────────────────── Lecture automatique ─────────────────────────
  async function extract(actor: Actor, profileId: string, documentId: string, mime: AcceptedMime, data: Buffer[], hint: DocumentCategory | null = null) {
    let text: ExtractedText;
    try {
      text = await readText(mime, data);
    } catch (e) {
      await profiles.withProfileData(actor, profileId, 'documents', 'write', (tx) =>
        tx`INSERT INTO extraction_job (document_id, profile_id, status, error, created_at, finished_at)
           VALUES (${documentId}, ${profileId}, 'failed', ${String((e as Error).message).slice(0, 300)}, ${now()}, ${now()})`,
      );
      return { status: 'no_text' as const, drafts: 0 };
    }
    const report = parseLabReport(text.lines);
    const source = text.lines.map((l) => l.text).join('\n');
    // Ordonnance : un document qui en a l'allure, et où le lecteur de bilans ne reconnaît AUCUNE analyse
    // (sinon « METFORMINE 1000 mg » serait proposé comme un résultat).
    // Catégorie choisie par l'utilisateur : elle décide du lecteur utilisé.
    const recognized = report.drafts.filter((d) => assessDraft(d, source, now()).analyteCode).length;
    if (hint === 'prescription' || (hint !== 'lab_report' && looksLikePrescription(text.lines) && !recognized))
      // Un vrai bilan contient plusieurs analyses ; un mot isolé (« bandelettes de glycémie ») ne suffit pas,
      // et un document qui se présente lui-même comme une ordonnance n'est jamais signalé.
      return extractPrescription(actor, profileId, documentId, text, recognized >= LAB_WARNING_MIN && !/\bordonnance\b/i.test(source) ? recognized : 0);

    // Détection automatique : sans AUCUNE analyse reconnue, ce n'est pas un bilan (attestation, courrier…) :
    // aucune ligne n'est proposée et le document n'est pas reclassé.
    if (hint !== 'lab_report' && recognized === 0) report.drafts = [];

    return profiles.withProfileData(actor, profileId, 'documents', 'write', async (tx) => {
      const status = report.drafts.length ? 'to_review' : 'reviewed';
      const [job] = await tx<{ id: string }[]>`
        INSERT INTO extraction_job (document_id, profile_id, status, detected_kind, ocr_engine, method, detected_lab, detected_sampling_date,
                                    warnings, created_at, finished_at)
        VALUES (${documentId}, ${profileId}, ${status}, ${report.drafts.length ? 'lab_report' : 'unknown'},
                ${text.method === 'ocr' ? 'tesseract-fra' : 'pdfjs'}, ${text.method}, ${report.laboratory}, ${report.samplingDate},
                ${tx.json(text.emptyPages.length ? [{ code: 'empty_pages', pages: text.emptyPages }] : [])}, ${now()}, ${now()})
        RETURNING id`;
      for (const d of report.drafts) {
        const a = assessDraft(d, source, now());
        const checks: CheckResult[] = [...a.checks];
        if (d.confidence !== undefined && d.confidence < LOW_CONFIDENCE)
          checks.push({ code: 'low_confidence', severity: 'warn', messageFr: 'Ligne lue avec une confiance faible sur la photo : comparez avec le document.' });
        if (d.unitCorrected)
          checks.push({ code: 'unit_ocr_corrected', severity: 'warn', messageFr: `Unité lue de façon incertaine, corrigée en « ${d.rawUnit} » : vérifiez-la.` });
        const ref = parseReference(d.rawReference);
        await tx`
          INSERT INTO extracted_value_draft (job_id, profile_id, raw_label, raw_value, raw_unit, raw_reference, page, bbox, matched_analyte,
                                             parsed_value, parsed_unit, ref_low, ref_high, confidence, checks, status, line_text, line_index)
          VALUES (${job!.id}, ${profileId}, ${d.rawLabel}, ${d.rawValue}, ${d.rawUnit ?? null}, ${d.rawReference ?? null}, ${d.page},
                  ${d.bbox ? tx.json(d.bbox) : null}, ${a.analyteCode}, ${a.parsedValue}, ${d.rawUnit ?? null}, ${ref?.low ?? null}, ${ref?.high ?? null},
                  ${d.confidence ?? null}, ${tx.json(checks as never)}, 'proposed', ${d.lineText}, ${d.lineIndex})`;
      }
      // Pas un bilan (courrier, compte rendu…) : spécialité devinée d'après le texte, si l'utilisateur n'en a pas choisi.
      const guessed = report.drafts.length ? null : guessSpecialty(source);
      if (guessed) await tx`UPDATE document SET specialty = ${guessed} WHERE id = ${documentId} AND specialty IS NULL`;
      if (report.drafts.length)
        await tx`UPDATE document SET kind = 'lab_report', issuer = COALESCE(issuer, ${report.laboratory}), document_date = COALESCE(document_date, ${report.samplingDate})
                 WHERE id = ${documentId}`;
      return { status: report.drafts.length ? ('to_review' as const) : text.lines.length ? ('no_values' as const) : ('no_text' as const), drafts: report.drafts.length };
    });
  }

  /** Ordonnance : traitements proposés (brouillons), jamais enregistrés sans validation. */
  async function extractPrescription(actor: Actor, profileId: string, documentId: string, text: ExtractedText, labValuesFound = 0) {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now());
    const p = parsePrescription(text.lines, today);
    // Classé « ordonnance » par l'utilisateur alors que le lecteur de bilans y reconnaît des analyses : signalé à l'écran.
    const warnings: Record<string, unknown>[] = [];
    if (text.emptyPages.length) warnings.push({ code: 'empty_pages', pages: text.emptyPages });
    if (labValuesFound) warnings.push({ code: 'looks_like_lab_report', analytes: labValuesFound });
    // Ordonnance de matériel (capteurs, bandelettes…) : rien à ajouter aux médicaments, et ce n'est pas une erreur.
    if (p.items.length === 0 && text.lines.some((l) => MEDICAL_DEVICE.test(l.text))) warnings.push({ code: 'medical_devices' });
    return profiles.withProfileData(actor, profileId, 'documents', 'write', async (tx) => {
      const [job] = await tx<{ id: string }[]>`
        INSERT INTO extraction_job (document_id, profile_id, status, detected_kind, ocr_engine, method, detected_sampling_date, warnings, created_at, finished_at)
        VALUES (${documentId}, ${profileId}, ${p.items.length ? 'to_review' : 'reviewed'}, 'prescription',
                ${text.method === 'ocr' ? 'tesseract-fra' : 'pdfjs'}, ${text.method}, ${p.date},
                ${tx.json(warnings as never)}, ${now()}, ${now()})
        RETURNING id`;
      for (const it of p.items) {
        await tx`
          INSERT INTO medication_draft (job_id, profile_id, line_text, line_index, page, name, strength, posology, times, qty, start_date, end_date, confidence, checks)
          VALUES (${job!.id}, ${profileId}, ${it.lineText}, ${it.lineIndex}, ${it.page}, ${it.name}, ${it.strength}, ${it.posology}, ${it.times}, ${it.qty},
                  ${it.startDate}, ${it.endDate}, ${it.confidence}, ${tx.json(it.checks as never)})`;
      }
      const guessed = guessSpecialty(text.lines.map((l) => l.text).join('\n'));
      if (guessed) await tx`UPDATE document SET specialty = ${guessed} WHERE id = ${documentId} AND specialty IS NULL`;
      await tx`UPDATE document SET kind = 'prescription', issuer = COALESCE(issuer, ${p.prescriber}), document_date = COALESCE(document_date, ${p.date})
               WHERE id = ${documentId}`;
      return { status: p.items.length ? ('to_review' as const) : ('no_values' as const), drafts: p.items.length };
    });
  }

  /** Relance la lecture d'un document déposé avant le consentement. */
  async function process(actor: Actor, profileId: string, documentId: string) {
    if (!(await hasAutoReadingConsent(actor.accountId))) throw new ForbiddenError('Lecture automatique non autorisée.');
    const files = await readFiles(actor, profileId, documentId);
    const [d] = await profiles.withProfileData(actor, profileId, 'documents', 'read', (tx) =>
      tx<{ kind: string; kind_by_user: boolean }[]>`SELECT kind, kind_by_user FROM document WHERE id = ${documentId} AND profile_id = ${profileId}`,
    );
    const hint = d?.kind_by_user ? (d.kind as DocumentCategory) : null;
    if (hint && hint !== 'prescription' && hint !== 'lab_report') return { status: 'stored' as const, drafts: 0 };
    const mime = files[0]!.mime === 'application/pdf' ? 'application/pdf' : (files[0]!.mime as AcceptedMime);
    return safeExtract(actor, profileId, documentId, mime, files.map((f) => f.data), hint);
  }

  /**
   * Document rangé par erreur comme ordonnance alors que c'est un bilan sanguin : il devient un bilan
   * (catégorie choisie par l'utilisateur), les traitements encore proposés sont écartés, et la lecture
   * des analyses est relancée si la lecture automatique est autorisée.
   */
  async function reclassifyAsLabReport(
    actor: Actor,
    profileId: string,
    documentId: string,
  ): Promise<{ ok: true; status: 'to_review' | 'no_values' | 'no_text' | 'not_processed'; drafts: number } | { ok: false; error: string }> {
    if (!/^[0-9a-f-]{36}$/i.test(documentId)) return { ok: false, error: 'Document introuvable.' };
    const found = await profiles.withProfileData(actor, profileId, 'documents', 'write', async (tx) => {
      const r = await tx`UPDATE document SET kind = 'lab_report', kind_by_user = true
                         WHERE id = ${documentId} AND profile_id = ${profileId} AND deleted_at IS NULL RETURNING id`;
      if (!r.length) return false;
      // Les traitements proposés (et jamais validés) n'ont plus lieu d'être ; les traitements déjà validés restent.
      const jobs = await tx<{ id: string }[]>`
        UPDATE extraction_job SET status = 'reviewed', reviewed_by = ${actor.accountId}, reviewed_at = ${now()}
        WHERE document_id = ${documentId} AND status = 'to_review' AND detected_kind = 'prescription' RETURNING id`;
      if (jobs.length)
        await tx`UPDATE medication_draft SET status = 'rejected', reviewed_by = ${actor.accountId}, reviewed_at = ${now()}
                 WHERE job_id = ANY(${jobs.map((j) => j.id)}) AND status = 'proposed'`;
      return true;
    });
    if (!found) return { ok: false, error: 'Document introuvable.' };
    if (!(await hasAutoReadingConsent(actor.accountId))) return { ok: true, status: 'not_processed', drafts: 0 };
    const r = await process(actor, profileId, documentId);
    return { ok: true, status: r.status === 'stored' ? 'not_processed' : r.status, drafts: r.drafts };
  }

  // ───────────────────────── Consultation ─────────────────────────
  async function list(actor: Actor, profileId: string) {
    return profiles.withProfileData(actor, profileId, 'documents', 'read', (tx) =>
      tx<{ id: string; title: string; kind: string; exam_type: ExamType | null; specialty: Specialty | null; folder: Folder | null; mime_type: string; page_count: number; uploaded_at: Date; document_date: string | null; issuer: string | null; job_status: string | null; pending: number }[]>`
        SELECT d.id, d.title, d.kind, d.exam_type, d.specialty, d.folder, d.mime_type, d.page_count, d.uploaded_at, to_char(d.document_date, 'YYYY-MM-DD') AS document_date, d.issuer,
               j.status AS job_status,
               (SELECT count(*)::int FROM extracted_value_draft v WHERE v.job_id = j.id AND v.status = 'proposed')
                 + (SELECT count(*)::int FROM medication_draft m WHERE m.job_id = j.id AND m.status = 'proposed') AS pending
        FROM document d
        LEFT JOIN LATERAL (SELECT * FROM extraction_job j WHERE j.document_id = d.id ORDER BY j.created_at DESC LIMIT 1) j ON true
        WHERE d.profile_id = ${profileId} AND d.deleted_at IS NULL
        ORDER BY COALESCE(d.document_date, (d.uploaded_at AT TIME ZONE ${tz})::date) DESC, d.uploaded_at DESC`,
    );
  }

  async function get(actor: Actor, profileId: string, documentId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(documentId)) return null;
    return profiles.withProfileData(actor, profileId, 'documents', 'read', async (tx) => {
      const [doc] = await tx<{ id: string; title: string; kind: string; exam_type: ExamType | null; specialty: Specialty | null; folder: Folder | null; kind_by_user: boolean; mime_type: string; page_count: number; uploaded_at: Date; document_date: string | null; issuer: string | null }[]>`
        SELECT id, title, kind, exam_type, specialty, folder, kind_by_user, mime_type, page_count, uploaded_at, to_char(document_date, 'YYYY-MM-DD') AS document_date, issuer
        FROM document WHERE id = ${documentId} AND profile_id = ${profileId} AND deleted_at IS NULL`;
      if (!doc) return null;
      const [job] = await tx<{ id: string; status: string; method: string | null; detected_lab: string | null; detected_sampling_date: string | null; warnings: unknown; error: string | null }[]>`
        SELECT id, status, method, detected_lab, to_char(detected_sampling_date, 'YYYY-MM-DD') AS detected_sampling_date, warnings, error
        FROM extraction_job WHERE document_id = ${documentId} ORDER BY created_at DESC LIMIT 1`;
      const drafts = job
        ? (
            await tx<{ id: string; raw_label: string; raw_value: string; raw_unit: string | null; raw_reference: string | null; matched_analyte: string | null; ref_low: string | null; ref_high: string | null; page: number | null; line_text: string | null; confidence: string | null; checks: CheckResult[]; status: DraftView['status'] }[]>`
              SELECT id, raw_label, raw_value, raw_unit, raw_reference, matched_analyte, ref_low, ref_high, page, line_text, confidence, checks, status
              FROM extracted_value_draft WHERE job_id = ${job.id} ORDER BY line_index`
          ).map(
            (d): DraftView => ({
              id: d.id,
              rawLabel: d.raw_label,
              rawValue: d.raw_value,
              rawUnit: d.raw_unit,
              rawReference: d.raw_reference,
              analyteCode: d.matched_analyte,
              refLow: d.ref_low === null ? null : Number(d.ref_low),
              refHigh: d.ref_high === null ? null : Number(d.ref_high),
              page: d.page,
              lineText: d.line_text,
              confidence: d.confidence === null ? null : Number(d.confidence),
              checks: d.checks ?? [],
              status: d.status,
            }),
          )
        : [];
      const medicationDrafts: MedicationDraftView[] = job
        ? (
            await tx<{ id: string; line_text: string; page: number | null; name: string; strength: string | null; posology: string; times: string[]; qty: string | null; start_date: string | null; end_date: string | null; confidence: string | null; checks: PrescriptionCheck[]; status: MedicationDraftView['status']; medication_id: string | null }[]>`
              SELECT id, line_text, page, name, strength, posology, times, qty, to_char(start_date, 'YYYY-MM-DD') AS start_date,
                     to_char(end_date, 'YYYY-MM-DD') AS end_date, confidence, checks, status, medication_id
              FROM medication_draft WHERE job_id = ${job.id} ORDER BY line_index`
          ).map((d) => ({
            id: d.id,
            lineText: d.line_text,
            page: d.page,
            name: d.name,
            strength: d.strength,
            posology: d.posology,
            times: d.times,
            qty: d.qty,
            startDate: d.start_date,
            endDate: d.end_date,
            confidence: d.confidence === null ? null : Number(d.confidence),
            checks: d.checks ?? [],
            status: d.status,
            medicationId: d.medication_id,
          }))
        : [];
      return { document: doc, job: job ?? null, drafts, medicationDrafts };
    });
  }

  /** Classement d'un document : catégorie, titre, date, type d'examen, spécialité (la catégorie devient celle de l'utilisateur). */
  async function updateDetails(actor: Actor, profileId: string, documentId: string, details: DocumentDetails & { issuer?: string | null }): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!/^[0-9a-f-]{36}$/i.test(documentId)) return { ok: false, error: 'Document introuvable.' };
    const meta = cleanDetails(details);
    if (!meta.ok) return meta;
    if (!meta.kind) return { ok: false, error: 'Choisissez une catégorie.' };
    const issuer = details.issuer?.trim().slice(0, 120) || null;
    const rows = await profiles.withProfileData(actor, profileId, 'documents', 'write', (tx) =>
      tx`UPDATE document SET kind = ${meta.kind}, kind_by_user = true, title = COALESCE(${meta.title}, title), document_date = ${meta.date},
                             exam_type = ${meta.examType}, specialty = ${meta.specialty}, folder = ${meta.folder}, issuer = ${issuer}
         WHERE id = ${documentId} AND profile_id = ${profileId} AND deleted_at IS NULL RETURNING id`,
    );
    return rows.length ? { ok: true } : { ok: false, error: 'Document introuvable.' };
  }

  async function readFiles(actor: Actor, profileId: string, documentId: string, page?: number) {
    return profiles.withProfileData(actor, profileId, 'documents', 'read', async (tx) => {
      const [doc] = await tx<{ dek_enc: Buffer }[]>`SELECT dek_enc FROM document WHERE id = ${documentId} AND profile_id = ${profileId} AND deleted_at IS NULL`;
      if (!doc) return [];
      const dek = decrypt(kek, doc.dek_enc, documentId);
      const rows = await tx<{ page: number; mime_type: string; data_enc: Buffer; sha256: Buffer }[]>`
        SELECT page, mime_type, data_enc, sha256 FROM document_file
        WHERE document_id = ${documentId} ${page ? tx`AND page = ${page}` : tx``} ORDER BY page`;
      return rows.map((r) => {
        const data = decrypt(dek, r.data_enc, `${documentId}:${r.page}`);
        if (!sha256(data).equals(r.sha256)) throw new Error('Intégrité du document compromise.');
        return { page: r.page, mime: r.mime_type, data };
      });
    });
  }

  // ───────────────────────── Validation humaine ─────────────────────────
  /**
   * Chaque ligne doit être explicitement confirmée (éventuellement corrigée) ou ignorée.
   * Tout ou rien : si une seule ligne confirmée est invalide, rien n'est enregistré.
   */
  async function review(
    actor: Actor,
    profileId: string,
    documentId: string,
    input: { sampledOn: string; laboratory?: string; decisions: Decision[] },
  ): Promise<{ ok: true; saved: number } | { ok: false; error: string; draftErrors?: Record<string, ManualLabErrors> }> {
    const access = await profiles.getAccess(actor.accountId, profileId);
    if (!access) throw new ForbiddenError();
    const current = await get(actor, profileId, documentId);
    if (!current?.job || current.job.status !== 'to_review') return { ok: false, error: 'Ce document n’a pas de valeurs à valider.' };
    const pending = current.drafts.filter((d) => d.status === 'proposed');
    const byId = new Map(input.decisions.map((d) => [d.draftId, d]));
    if (pending.some((d) => !byId.has(d.id))) return { ok: false, error: 'Confirmez ou ignorez chaque ligne avant d’enregistrer.' };
    // Droit vérifié avant toute analyse du contenu (puis à nouveau par la RLS du module « lab »).
    if (input.decisions.some((d) => d.action === 'confirm') && !(access.role === 'owner' || access.permissions.lab === 'write'))
      throw new ForbiddenError('Vous n’avez pas le droit d’ajouter des résultats d’analyses à ce profil.');

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now());
    const draftErrors: Record<string, ManualLabErrors> = {};
    const toSave: { draft: (typeof pending)[number]; corrected: boolean; v: Extract<ReturnType<typeof validateManualLab>, { ok: true }>['value'] }[] = [];
    for (const d of pending) {
      const dec = byId.get(d.id)!;
      if (dec.action === 'ignore') continue;
      const values = {
        analyteCode: dec.analyteCode ?? d.analyteCode ?? '',
        value: dec.value ?? d.rawValue,
        unit: dec.unit ?? d.rawUnit ?? '',
        sampledOn: input.sampledOn,
        laboratory: input.laboratory,
        refLow: dec.refLow ?? (d.refLow === null ? '' : String(d.refLow)),
        refHigh: dec.refHigh ?? (d.refHigh === null ? '' : String(d.refHigh)),
      };
      const v = validateManualLab(values, today);
      if (!v.ok) {
        draftErrors[d.id] = v.errors;
        continue;
      }
      const corrected =
        values.analyteCode !== d.analyteCode || values.value.replace(/\s/g, '') !== d.rawValue.replace(/\s/g, '') || values.unit !== (d.rawUnit ?? '');
      toSave.push({ draft: d, corrected, v: v.value });
    }
    if (Object.keys(draftErrors).length) return { ok: false, error: 'Certaines lignes confirmées sont invalides : corrigez-les ou ignorez-les.', draftErrors };

    const [y, m, dd] = input.sampledOn.split('-').map(Number) as [number, number, number];
    const sampledAt = zonedTimeToUtc({ year: y, month: m, day: dd }, 12, 0, tz);
    const saved = await profiles.withProfileData(actor, profileId, 'documents', 'write', async (tx: TransactionSql) => {
      // Les écritures d'analyses passent elles aussi par la RLS du module « lab ».
      let n = 0;
      for (const s of toSave) {
        const [row] = await tx<{ id: string }[]>`
          INSERT INTO lab_result (profile_id, analyte_code, value, unit, value_canonical, comparator, ref_low, ref_high, sampled_at, laboratory,
                                  source_type, document_id, draft_id, confirmed_by, confirmed_at)
          VALUES (${profileId}, ${s.v.analyte.code}, ${s.v.value}, ${s.v.unit}, ${s.v.valueCanonical}, ${s.v.comparator}, ${s.v.refLow}, ${s.v.refHigh},
                  ${sampledAt}, ${s.v.laboratory}, 'document_extraction', ${documentId}, ${s.draft.id}, ${actor.accountId}, ${now()})
          RETURNING id`;
        await tx`UPDATE extracted_value_draft SET status = ${s.corrected ? 'corrected' : 'confirmed'}, reviewed_by = ${actor.accountId},
                   reviewed_at = ${now()}, lab_result_id = ${row!.id} WHERE id = ${s.draft.id}`;
        n++;
      }
      const ignored = pending.filter((d) => byId.get(d.id)!.action === 'ignore').map((d) => d.id);
      if (ignored.length)
        await tx`UPDATE extracted_value_draft SET status = 'rejected', reviewed_by = ${actor.accountId}, reviewed_at = ${now()} WHERE id = ANY(${ignored})`;
      await tx`UPDATE extraction_job SET status = 'reviewed', reviewed_by = ${actor.accountId}, reviewed_at = ${now()} WHERE id = ${current.job!.id}`;
      await tx`UPDATE document SET document_date = ${input.sampledOn}, issuer = ${input.laboratory?.trim() || null} WHERE id = ${documentId}`;
      return n;
    });
    return { ok: true, saved };
  }

  /**
   * Validation d'une ordonnance : chaque traitement proposé est confirmé (éventuellement corrigé) ou
   * ignoré. Tout ou rien ; les traitements sont créés dans la même transaction, sous la RLS du
   * module Médicaments, rattachés au document.
   */
  async function reviewPrescription(
    actor: Actor,
    profileId: string,
    documentId: string,
    input: { prescriber?: string; decisions: MedicationDecision[] },
  ): Promise<{ ok: true; saved: number } | { ok: false; error: string; draftErrors?: Record<string, MedicationErrors> }> {
    const access = await profiles.getAccess(actor.accountId, profileId);
    if (!access) throw new ForbiddenError();
    const current = await get(actor, profileId, documentId);
    if (!current?.job || current.job.status !== 'to_review' || !current.medicationDrafts.length) return { ok: false, error: 'Cette ordonnance n’a pas de traitement à valider.' };
    const pending = current.medicationDrafts.filter((d) => d.status === 'proposed');
    const byId = new Map(input.decisions.map((d) => [d.draftId, d]));
    if (pending.some((d) => !byId.has(d.id))) return { ok: false, error: 'Confirmez ou ignorez chaque traitement avant d’enregistrer.' };
    if (input.decisions.some((d) => d.action === 'confirm') && !(access.role === 'owner' || access.permissions.medications === 'write'))
      throw new ForbiddenError('Vous n’avez pas le droit d’ajouter des traitements à ce profil.');

    const prescriber = input.prescriber?.trim() || null;
    const draftErrors: Record<string, MedicationErrors> = {};
    const toSave: { draft: MedicationDraftView; corrected: boolean; v: Extract<ReturnType<typeof validateMedication>, { ok: true }>['value'] }[] = [];
    for (const d of pending) {
      const dec = byId.get(d.id)!;
      if (dec.action === 'ignore') continue;
      const values = {
        name: dec.name ?? d.name,
        strength: dec.strength ?? d.strength ?? '',
        posology: dec.posology ?? d.posology,
        times: dec.times ?? d.times,
        qty: dec.qty ?? d.times.map(() => d.qty ?? ''),
        startDate: dec.startDate ?? d.startDate ?? '',
        endDate: dec.endDate ?? d.endDate ?? '',
        prescriber: prescriber ?? '',
      };
      const v = validateMedication(values);
      if (!v.ok) {
        draftErrors[d.id] = v.errors;
        continue;
      }
      const corrected =
        values.name !== d.name || (values.strength || null) !== d.strength || values.posology !== d.posology ||
        v.value.schedule.map((x) => x.time).join() !== [...d.times].sort().join() || (values.endDate || null) !== d.endDate || (values.startDate || null) !== d.startDate;
      toSave.push({ draft: d, corrected, v: v.value });
    }
    if (Object.keys(draftErrors).length) return { ok: false, error: 'Certains traitements confirmés sont incomplets : corrigez-les ou ignorez-les.', draftErrors };

    const saved = await profiles.withProfileData(actor, profileId, 'documents', 'write', async (tx: TransactionSql) => {
      let n = 0;
      for (const s of toSave) {
        // Création du traitement : RLS du module Médicaments.
        const [row] = await tx<{ id: string }[]>`
          INSERT INTO medication (profile_id, name, strength, posology_text, schedule, start_date, end_date, prescriber, status, source_type,
                                  document_id, confirmed_by, confirmed_at, created_by, created_at)
          VALUES (${profileId}, ${s.v.name}, ${s.v.strength}, ${s.v.posology}, ${tx.json(s.v.schedule as never)}, ${s.v.startDate}, ${s.v.endDate},
                  ${s.v.prescriber}, 'active', 'document_extraction', ${documentId}, ${actor.accountId}, ${now()}, ${actor.accountId}, ${now()})
          RETURNING id`;
        await tx`UPDATE medication_draft SET status = ${s.corrected ? 'corrected' : 'confirmed'}, medication_id = ${row!.id},
                   reviewed_by = ${actor.accountId}, reviewed_at = ${now()} WHERE id = ${s.draft.id}`;
        n++;
      }
      const ignored = pending.filter((d) => byId.get(d.id)!.action === 'ignore').map((d) => d.id);
      if (ignored.length)
        await tx`UPDATE medication_draft SET status = 'rejected', reviewed_by = ${actor.accountId}, reviewed_at = ${now()} WHERE id = ANY(${ignored})`;
      await tx`UPDATE extraction_job SET status = 'reviewed', reviewed_by = ${actor.accountId}, reviewed_at = ${now()} WHERE id = ${current.job!.id}`;
      await tx`UPDATE document SET issuer = ${prescriber} WHERE id = ${documentId}`;
      return n;
    });
    return { ok: true, saved };
  }

  async function remove(actor: Actor, profileId: string, documentId: string): Promise<boolean> {
    return profiles.withProfileData(actor, profileId, 'documents', 'write', async (tx) => {
      const r = await tx`UPDATE document SET deleted_at = ${now()} WHERE id = ${documentId} AND profile_id = ${profileId} AND deleted_at IS NULL RETURNING id`;
      if (r.length) await tx`DELETE FROM document_file WHERE document_id = ${documentId}`; // originaux effacés
      return r.length > 0;
    });
  }

  return { hasAutoReadingConsent, giveAutoReadingConsent, upload, process, reclassifyAsLabReport, list, get, updateDetails, readFiles, review, reviewPrescription, remove, analyteName: (c: string) => getAnalyte(c)?.nameFr };
}

export type DocumentsService = ReturnType<typeof createDocumentsService>;
