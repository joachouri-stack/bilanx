import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProfilesService, ForbiddenError, type Actor } from '@bilanx/profiles';
import { setupAuth, TEST_DB, tokenFrom } from '../../auth/test/helpers';
import { createDocumentsService, terminateOcr } from '../src';

const F = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url));
const PDF = () => F('bilan-fictif.pdf');
const PHOTO = () => F('bilan-fictif-photo.jpg');

describe.skipIf(!TEST_DB)('documents et scanner de bilans (PostgreSQL, PDF et reconnaissance de caractères réels)', () => {
  let ctx: Awaited<ReturnType<typeof setupAuth>>;
  let profiles: ReturnType<typeof createProfilesService>;
  let docs: ReturnType<typeof createDocumentsService>;
  let jo: Actor, marc: Actor;
  let pid = '';
  let pdfDoc = '', photoDoc = '';

  async function createUser(email: string, name: string, ai: boolean): Promise<Actor> {
    await ctx.auth.signUp({ email, password: 'cheval-agrafe-batterie', displayName: name, acceptHealthProcessing: true, acceptAiExtraction: ai });
    await ctx.auth.verifyEmail(tokenFrom(ctx.mailer.last(email)?.text));
    const [a] = await ctx.sql<{ id: string }[]>`SELECT id FROM account WHERE email = ${email}`;
    return { accountId: a!.id, email, displayName: name };
  }

  beforeAll(async () => {
    ctx = await setupAuth();
    const now = () => new Date(ctx.clock.t);
    profiles = createProfilesService({ sql: ctx.sql, mailer: ctx.mailer, appUrl: 'https://bilanx.test', now });
    docs = createDocumentsService({ sql: ctx.sql, profiles, secretKey: Buffer.alloc(32, 9), now });
    jo = await createUser('jo@exemple.fr', 'Jo', false);
    marc = await createUser('marc@exemple.fr', 'Marc', true);
    pid = (await profiles.listProfiles(jo.accountId))[0]!.profileId;
  });
  afterAll(async () => {
    await terminateOcr();
    await ctx?.sql.end();
  });

  it('refuse les fichiers non conformes', async () => {
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(32)]);
    expect(await docs.upload(jo, pid, [{ name: 'IMG.HEIC', data: heic }])).toMatchObject({ ok: false, error: expect.stringContaining('HEIC') });
    expect(await docs.upload(jo, pid, [{ name: 'x.pdf', data: Buffer.from('<script>alert(1)</script>') }])).toMatchObject({ ok: false });
    expect(await docs.upload(jo, pid, [{ name: 'a.pdf', data: PDF() }, { name: 'b.jpg', data: PHOTO() }])).toMatchObject({ ok: false, error: expect.stringContaining('seul') });
    expect(await docs.upload(jo, pid, [])).toMatchObject({ ok: false });
  });

  it('sans consentement à la lecture automatique : document conservé, rien n’est lu', async () => {
    const r = await docs.upload(jo, pid, [{ name: 'bilan.pdf', data: PDF() }]);
    expect(r).toMatchObject({ ok: true, status: 'not_processed', drafts: 0 });
    if (r.ok) pdfDoc = r.documentId;
    expect((await docs.get(jo, pid, pdfDoc))?.job).toBeNull();
    await expect(docs.process(jo, pid, pdfDoc)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('stocke l’original chiffré et le restitue à l’identique', async () => {
    const [row] = await ctx.sql`SELECT data_enc FROM document_file LIMIT 1`; // propriétaire du schéma : RLS…
    expect(row).toBeUndefined(); // …sans compte déclaré, rien n'est visible
    const files = await docs.readFiles(jo, pid, pdfDoc);
    expect(files[0]!.data.equals(PDF())).toBe(true);
    const raw = await profiles.withProfileData(jo, pid, 'documents', 'read', (tx) => tx`SELECT data_enc FROM document_file WHERE document_id = ${pdfDoc}`);
    expect((raw[0]!.data_enc as Buffer).includes(Buffer.from('%PDF'))).toBe(false);
    expect((raw[0]!.data_enc as Buffer).includes(Buffer.from('Ferritine'))).toBe(false);
  });

  it('après consentement : lecture du PDF, 7 lignes proposées, rien d’enregistré comme résultat', async () => {
    await docs.giveAutoReadingConsent(jo);
    const r = await docs.process(jo, pid, pdfDoc);
    expect(r).toEqual({ status: 'to_review', drafts: 7 });
    const view = (await docs.get(jo, pid, pdfDoc))!;
    expect(view.job).toMatchObject({ status: 'to_review', method: 'pdf_text', detected_sampling_date: '2026-09-03', detected_lab: 'LABORATOIRE DE BIOLOGIE MÉDICALE EXEMPLE' });
    expect(view.drafts.map((d) => [d.analyteCode, d.rawValue])).toEqual([
      ['glucose_fasting', '1,32'], ['hba1c', '7,2'], ['creatinine', '78'], ['magnesium', '0,75'], ['ferritin', '25'], ['vitamin_d_25oh', '18'], [null, '250'],
    ]);
    expect(view.drafts.find((d) => d.analyteCode === 'ferritin')).toMatchObject({ refLow: 30, refHigh: 300, lineText: expect.stringContaining('Ferritine') });
    const n = await profiles.withProfileData(jo, pid, 'lab', 'read', (tx) => tx`SELECT count(*)::int AS n FROM lab_result`);
    expect(n[0]!.n).toBe(0);
  });

  it('photo : reconnaissance de caractères réelle, l’HbA1c mal lue est bloquée', async () => {
    const r = await docs.upload(jo, pid, [{ name: 'photo.jpg', data: PHOTO() }]);
    expect(r).toMatchObject({ ok: true, status: 'to_review' });
    if (r.ok) photoDoc = r.documentId;
    const view = (await docs.get(jo, pid, photoDoc))!;
    expect(view.job?.method).toBe('ocr');
    const hba1c = view.drafts.find((d) => d.analyteCode === 'hba1c')!;
    expect(hba1c.checks.some((c) => c.severity === 'block')).toBe(true);
    const creat = view.drafts.find((d) => d.analyteCode === 'creatinine');
    expect(creat?.checks.map((c) => c.code)).toContain('unit_ocr_corrected');
  });

  it('validation : chaque ligne doit être traitée, tout ou rien', async () => {
    const view = (await docs.get(jo, pid, photoDoc))!;
    const partial = await docs.review(jo, pid, photoDoc, { sampledOn: '2026-09-03', decisions: [] });
    expect(partial).toMatchObject({ ok: false, error: expect.stringContaining('chaque ligne') });

    // Confirmer l'HbA1c telle que lue (2 %) : refusé, et rien n'est enregistré.
    const asRead = await docs.review(jo, pid, photoDoc, {
      sampledOn: '2026-09-03',
      decisions: view.drafts.map((d) => ({ draftId: d.id, action: d.analyteCode ? ('confirm' as const) : ('ignore' as const) })),
    });
    expect(asRead.ok).toBe(false);
    if (!asRead.ok) expect(Object.keys(asRead.draftErrors ?? {})).toEqual([view.drafts.find((d) => d.analyteCode === 'hba1c')!.id]);
    const n = await profiles.withProfileData(jo, pid, 'lab', 'read', (tx) => tx`SELECT count(*)::int AS n FROM lab_result`);
    expect(n[0]!.n).toBe(0);
  });

  it('validation avec correction : résultats enregistrés et reliés au document', async () => {
    const view = (await docs.get(jo, pid, photoDoc))!;
    const r = await docs.review(jo, pid, photoDoc, {
      sampledOn: '2026-09-03',
      laboratory: 'Laboratoire Exemple',
      decisions: view.drafts.map((d) =>
        d.analyteCode === 'hba1c'
          ? { draftId: d.id, action: 'confirm' as const, value: '7,2' } // correction humaine
          : { draftId: d.id, action: d.analyteCode ? ('confirm' as const) : ('ignore' as const) },
      ),
    });
    expect(r).toEqual({ ok: true, saved: 6 });
    const rows = await profiles.withProfileData(jo, pid, 'lab', 'read', (tx) =>
      tx`SELECT analyte_code, value, unit, source_type, document_id, draft_id, laboratory FROM lab_result ORDER BY analyte_code`);
    expect(rows.every((x) => x.source_type === 'document_extraction' && x.document_id === photoDoc && x.draft_id)).toBe(true);
    expect(rows.find((x) => x.analyte_code === 'hba1c')).toMatchObject({ value: '7.2', unit: '%', laboratory: 'Laboratoire Exemple' });
    expect(rows.find((x) => x.analyte_code === 'creatinine')?.unit).toBe('µmol/L');
    const after = (await docs.get(jo, pid, photoDoc))!;
    expect(after.job?.status).toBe('reviewed');
    expect(after.drafts.find((d) => d.analyteCode === 'hba1c')?.status).toBe('corrected');
    expect(after.drafts.find((d) => d.analyteCode === null)?.status).toBe('rejected');
    expect(await docs.review(jo, pid, photoDoc, { sampledOn: '2026-09-03', decisions: [] })).toMatchObject({ ok: false });
  });

  it('un aidant sans droit de saisie sur les analyses ne peut pas valider', async () => {
    await profiles.invite(jo, pid, { email: 'marc@exemple.fr', role: 'caregiver', permissions: { documents: 'read' } });
    await profiles.respondToInvitation(marc, tokenFrom(ctx.mailer.last('marc@exemple.fr')?.text), true);
    expect((await docs.list(marc, pid)).length).toBe(2);
    const view = (await docs.get(marc, pid, pdfDoc))!;
    await expect(
      docs.review(marc, pid, pdfDoc, { sampledOn: '2026-09-03', decisions: view.drafts.map((d) => ({ draftId: d.id, action: 'confirm' as const })) }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(docs.upload(marc, pid, [{ name: 'x.pdf', data: PDF() }])).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('suppression : originaux effacés, résultats validés conservés', async () => {
    expect(await docs.remove(jo, pid, photoDoc)).toBe(true);
    expect(await docs.readFiles(jo, pid, photoDoc)).toEqual([]);
    expect((await docs.list(jo, pid)).map((d) => d.id)).toEqual([pdfDoc]);
    const n = await profiles.withProfileData(jo, pid, 'lab', 'read', (tx) => tx`SELECT count(*)::int AS n FROM lab_result`);
    expect(n[0]!.n).toBe(6);
  });

  it('spécialité médicale : enregistrée à l’import, modifiée au classement, valeur inconnue refusée', async () => {
    const r = await docs.upload(jo, pid, [{ name: 'orl.jpg', data: PHOTO() }], { kind: 'medical_report', title: 'Consultation ORL', specialty: 'orl' });
    expect(r).toMatchObject({ ok: true, status: 'stored' });
    const id = r.ok ? r.documentId : '';
    expect((await docs.get(jo, pid, id))?.document.specialty).toBe('orl');
    expect((await docs.list(jo, pid)).find((d) => d.id === id)?.specialty).toBe('orl');

    expect(await docs.updateDetails(jo, pid, id, { kind: 'medical_report', specialty: 'urologie' })).toEqual({ ok: true });
    expect((await docs.get(jo, pid, id))?.document.specialty).toBe('urologie');
    expect(await docs.updateDetails(jo, pid, id, { kind: 'medical_report', specialty: null })).toEqual({ ok: true });
    expect((await docs.get(jo, pid, id))?.document.specialty).toBeNull();

    const bad = 'chirurgie' as never;
    expect(await docs.upload(jo, pid, [{ name: 'x.jpg', data: PHOTO() }], { kind: 'other', specialty: bad })).toEqual({ ok: false, error: 'Spécialité inconnue.' });
    expect(await docs.updateDetails(jo, pid, id, { kind: 'medical_report', specialty: bad })).toEqual({ ok: false, error: 'Spécialité inconnue.' });
    // Contrainte de la base, au cas où la validation serait contournée.
    await expect(
      profiles.withProfileData(jo, pid, 'documents', 'write', (tx) => tx`UPDATE document SET specialty = 'chirurgie' WHERE id = ${id}`),
    ).rejects.toThrow();
  });
  it('attestation (aucune analyse) : jamais lue comme un bilan, en détection automatique comme dans le dossier', async () => {
    const att = F('attestation-fictive.pdf');
    const auto = await docs.upload(marc, (await profiles.listProfiles(marc.accountId))[0]!.profileId, [{ name: 'attestation.pdf', data: att }]);
    expect(auto).toMatchObject({ ok: true, drafts: 0 });
    const mpid = (await profiles.listProfiles(marc.accountId))[0]!.profileId;
    const doc = await docs.get(marc, mpid, auto.ok ? auto.documentId : '');
    expect(doc?.document.kind).not.toBe('lab_report');
    expect(doc?.drafts ?? []).toHaveLength(0);
    const inFolder = await docs.upload(marc, mpid, [{ name: 'attestation.pdf', data: att }], { folder: 'attestation' });
    expect(inFolder).toMatchObject({ ok: true, status: 'stored', drafts: 0 });
    expect((await docs.get(marc, mpid, inFolder.ok ? inFolder.documentId : ''))?.document).toMatchObject({ kind: 'other', folder: 'attestation' });
  });
});
