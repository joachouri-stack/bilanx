import { randomBytes } from 'node:crypto';
import { decrypt, deriveKey, encrypt, sha256 } from '@bilanx/auth';
import type { Sql, TransactionSql } from '@bilanx/db';
import {
  assessDraft,
  getAnalyte,
  parseLabReport,
  parseReference,
  validateManualLab,
  zonedTimeToUtc,
  type CheckResult,
  type ManualLabErrors,
} from '@bilanx/domain';
import { ForbiddenError, type Actor, type ProfilesService } from '@bilanx/profiles';
import { imageText, pdfText, sniffMime, type AcceptedMime, type ExtractedText } from './text';

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

export type UploadResult =
  | { ok: true; documentId: string; status: 'to_review' | 'no_values' | 'no_text' | 'not_processed'; drafts: number }
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

const defaultReadText = (mime: AcceptedMime, files: Buffer[]) => (mime === 'application/pdf' ? pdfText(files[0]!) : imageText(files));

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
  async function upload(actor: Actor, profileId: string, files: UploadFile[]): Promise<UploadResult> {
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
        INSERT INTO document (profile_id, kind, title, storage_key, dek_enc, sha256, mime_type, page_count, size_bytes, uploaded_by, uploaded_at)
        VALUES (${profileId}, 'unknown', ${files[0]!.name.slice(0, 200)}, 'db', ${Buffer.alloc(0)}, ${sha256(Buffer.concat(files.map((f) => f.data)))},
                ${isPdf ? 'application/pdf' : mimes[0]!}, ${files.length}, ${total}, ${actor.accountId}, ${now()})
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

    if (!(await hasAutoReadingConsent(actor.accountId))) return { ok: true, documentId, status: 'not_processed', drafts: 0 };
    return { ok: true, documentId, ...(await extract(actor, profileId, documentId, isPdf ? 'application/pdf' : mimes[0]!, files.map((f) => f.data))) };
  }

  // ───────────────────────── Lecture automatique ─────────────────────────
  async function extract(actor: Actor, profileId: string, documentId: string, mime: AcceptedMime, data: Buffer[]) {
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
      if (report.drafts.length)
        await tx`UPDATE document SET kind = 'lab_report', issuer = ${report.laboratory}, document_date = ${report.samplingDate} WHERE id = ${documentId}`;
      return { status: report.drafts.length ? ('to_review' as const) : text.lines.length ? ('no_values' as const) : ('no_text' as const), drafts: report.drafts.length };
    });
  }

  /** Relance la lecture d'un document déposé avant le consentement. */
  async function process(actor: Actor, profileId: string, documentId: string) {
    if (!(await hasAutoReadingConsent(actor.accountId))) throw new ForbiddenError('Lecture automatique non autorisée.');
    const files = await readFiles(actor, profileId, documentId);
    const mime = files[0]!.mime === 'application/pdf' ? 'application/pdf' : (files[0]!.mime as AcceptedMime);
    return extract(actor, profileId, documentId, mime, files.map((f) => f.data));
  }

  // ───────────────────────── Consultation ─────────────────────────
  async function list(actor: Actor, profileId: string) {
    return profiles.withProfileData(actor, profileId, 'documents', 'read', (tx) =>
      tx<{ id: string; title: string; kind: string; mime_type: string; page_count: number; uploaded_at: Date; document_date: string | null; issuer: string | null; job_status: string | null; pending: number }[]>`
        SELECT d.id, d.title, d.kind, d.mime_type, d.page_count, d.uploaded_at, to_char(d.document_date, 'YYYY-MM-DD') AS document_date, d.issuer,
               j.status AS job_status,
               (SELECT count(*)::int FROM extracted_value_draft v WHERE v.job_id = j.id AND v.status = 'proposed') AS pending
        FROM document d
        LEFT JOIN LATERAL (SELECT * FROM extraction_job j WHERE j.document_id = d.id ORDER BY j.created_at DESC LIMIT 1) j ON true
        WHERE d.profile_id = ${profileId} AND d.deleted_at IS NULL
        ORDER BY d.uploaded_at DESC`,
    );
  }

  async function get(actor: Actor, profileId: string, documentId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(documentId)) return null;
    return profiles.withProfileData(actor, profileId, 'documents', 'read', async (tx) => {
      const [doc] = await tx<{ id: string; title: string; kind: string; mime_type: string; page_count: number; uploaded_at: Date; document_date: string | null; issuer: string | null }[]>`
        SELECT id, title, kind, mime_type, page_count, uploaded_at, to_char(document_date, 'YYYY-MM-DD') AS document_date, issuer
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
      return { document: doc, job: job ?? null, drafts };
    });
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

  async function remove(actor: Actor, profileId: string, documentId: string): Promise<boolean> {
    return profiles.withProfileData(actor, profileId, 'documents', 'write', async (tx) => {
      const r = await tx`UPDATE document SET deleted_at = ${now()} WHERE id = ${documentId} AND profile_id = ${profileId} AND deleted_at IS NULL RETURNING id`;
      if (r.length) await tx`DELETE FROM document_file WHERE document_id = ${documentId}`; // originaux effacés
      return r.length > 0;
    });
  }

  return { hasAutoReadingConsent, giveAutoReadingConsent, upload, process, list, get, readFiles, review, remove, analyteName: (c: string) => getAnalyte(c)?.nameFr };
}

export type DocumentsService = ReturnType<typeof createDocumentsService>;
