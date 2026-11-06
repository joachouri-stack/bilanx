import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProfilesService, ForbiddenError, type Actor } from '@bilanx/profiles';
import { setupAuth, TEST_DB, tokenFrom } from '../../auth/test/helpers';
import { createMedicationsService } from '../../records/src';
import { createDocumentsService, terminateOcr } from '../src';

const fx = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url));

describe.skipIf(!TEST_DB)('lecture d’une ordonnance (PostgreSQL réel)', () => {
  let ctx: Awaited<ReturnType<typeof setupAuth>>;
  let profiles: ReturnType<typeof createProfilesService>;
  let docs: ReturnType<typeof createDocumentsService>;
  let meds: ReturnType<typeof createMedicationsService>;
  let jo: Actor, marc: Actor;
  let pid = '', docId = '';

  async function createUser(email: string, name: string): Promise<Actor> {
    await ctx.auth.signUp({ email, password: 'cheval-agrafe-batterie', displayName: name, acceptHealthProcessing: true, acceptAiExtraction: true });
    await ctx.auth.verifyEmail(tokenFrom(ctx.mailer.last(email)?.text));
    const [a] = await ctx.sql<{ id: string }[]>`SELECT id FROM account WHERE email = ${email}`;
    return { accountId: a!.id, email, displayName: name };
  }

  beforeAll(async () => {
    ctx = await setupAuth(); // 2026-11-04
    const now = () => new Date(ctx.clock.t);
    profiles = createProfilesService({ sql: ctx.sql, mailer: ctx.mailer, appUrl: 'https://bilanx.test', now });
    docs = createDocumentsService({ sql: ctx.sql, profiles, secretKey: Buffer.alloc(32, 9), now });
    meds = createMedicationsService({ profiles, now });
    jo = await createUser('jo@exemple.fr', 'Jo');
    marc = await createUser('marc@exemple.fr', 'Marc');
    pid = (await profiles.listProfiles(jo.accountId))[0]!.profileId;
    // Marc, aidant : lecture des documents et écriture des documents, mais PAS des médicaments.
    await profiles.invite(jo, pid, { email: 'marc@exemple.fr', role: 'caregiver', permissions: { documents: 'write', medications: 'read' } });
    await profiles.respondToInvitation(marc, tokenFrom(ctx.mailer.last('marc@exemple.fr')?.text), true);
  });
  afterAll(async () => {
    await terminateOcr();
    await ctx?.sql.end();
  });

  it('PDF : ordonnance reconnue, 5 traitements proposés, rien d’enregistré', async () => {
    const r = await docs.upload(jo, pid, [{ name: 'ordonnance.pdf', data: fx('ordonnance-fictive.pdf') }]);
    expect(r).toMatchObject({ ok: true, status: 'to_review', drafts: 5 });
    if (!r.ok) return;
    docId = r.documentId;
    const d = (await docs.get(jo, pid, docId))!;
    expect(d.document).toMatchObject({ kind: 'prescription', issuer: 'Dr Paul EXEMPLE', document_date: '2026-11-03' });
    expect(d.drafts).toEqual([]); // aucun « résultat d'analyse » inventé
    expect(d.medicationDrafts.map((m) => [m.name, m.strength, m.times])).toEqual([
      ['Metformine', '1000 mg', ['08:00', '20:00']],
      ['Atorvastatine', '20 mg', ['20:00']],
      ['Paracétamol', '1 g', []],
      ['Vitamine D3', '100 000 UI', []],
      ['Amoxicilline', '1 g', []],
    ]);
    expect((await meds.list(jo, pid)).current).toEqual([]);
    expect((await docs.list(jo, pid))[0]).toMatchObject({ kind: 'prescription', pending: 5 });
  });

  it('photo (OCR) : mêmes traitements', async () => {
    const r = await docs.upload(jo, pid, [{ name: 'ordonnance.jpg', data: fx('ordonnance-fictive-photo.jpg') }]);
    expect(r).toMatchObject({ ok: true, status: 'to_review', drafts: 5 });
    if (!r.ok) return;
    const d = (await docs.get(jo, pid, r.documentId))!;
    expect(d.medicationDrafts.map((m) => m.name)).toEqual(['Metformine', 'Atorvastatine', 'Paracétamol', 'Vitamine D3', 'Amoxicilline']);
    expect(d.medicationDrafts.every((m) => m.confidence !== null)).toBe(true);
  }, 60_000);

  it('validation : chaque ligne décidée ; tout ou rien ; aidant sans droit « médicaments » refusé', async () => {
    const d = (await docs.get(jo, pid, docId))!;
    const [met, ator, para, vitd, amox] = d.medicationDrafts;
    expect(await docs.reviewPrescription(jo, pid, docId, { decisions: [{ draftId: met!.id, action: 'confirm' }] })).toMatchObject({ ok: false, error: expect.stringContaining('chaque') });
    const decisions = [
      { draftId: met!.id, action: 'confirm' as const },
      { draftId: ator!.id, action: 'confirm' as const, strength: '40 mg' }, // corrigé par l'utilisateur
      { draftId: para!.id, action: 'ignore' as const },
      { draftId: vitd!.id, action: 'confirm' as const },
      { draftId: amox!.id, action: 'confirm' as const, name: '' }, // invalide : rien ne doit être enregistré
    ];
    const bad = await docs.reviewPrescription(jo, pid, docId, { prescriber: 'Dr Paul EXEMPLE', decisions });
    expect(bad).toMatchObject({ ok: false, draftErrors: { [amox!.id]: { name: expect.any(String) } } });
    expect((await meds.list(jo, pid)).current).toEqual([]);
    await expect(docs.reviewPrescription(marc, pid, docId, { decisions: decisions.map((x) => ({ ...x, name: undefined })) })).rejects.toBeInstanceOf(ForbiddenError);

    decisions[4] = { draftId: amox!.id, action: 'confirm', times: ['08:00', '14:00', '20:00'], qty: ['1 cp', '1 cp', '1 cp'] } as never;
    expect(await docs.reviewPrescription(jo, pid, docId, { prescriber: 'Dr Paul EXEMPLE', decisions })).toEqual({ ok: true, saved: 4 });
    const current = (await meds.list(jo, pid)).current;
    expect(current.map((m) => [m.name, m.strength, m.schedule.map((s) => s.time), m.startDate, m.endDate, m.prescriber])).toEqual([
      ['Amoxicilline', '1 g', ['08:00', '14:00', '20:00'], '2026-11-03', '2026-11-09', 'Dr Paul EXEMPLE'],
      ['Atorvastatine', '40 mg', ['20:00'], '2026-11-03', '2027-02-02', 'Dr Paul EXEMPLE'],
      ['Metformine', '1000 mg', ['08:00', '20:00'], '2026-11-03', '2027-02-02', 'Dr Paul EXEMPLE'],
      ['Vitamine D3', '100 000 UI', [], '2026-11-03', '2027-02-02', 'Dr Paul EXEMPLE'],
    ]);
    expect(current.find((m) => m.name === 'Metformine')!.posology).toBe('1 comprimé matin et soir au milieu du repas, pendant 3 mois');
    const after = (await docs.get(jo, pid, docId))!;
    expect(after.job!.status).toBe('reviewed');
    expect(after.medicationDrafts.map((m) => m.status)).toEqual(['confirmed', 'corrected', 'rejected', 'confirmed', 'corrected']);
    expect(after.medicationDrafts[0]!.medicationId).not.toBeNull();
    // Déjà validée : impossible de recommencer (pas de doublons).
    expect(await docs.reviewPrescription(jo, pid, docId, { decisions })).toMatchObject({ ok: false });
  });

  it('bilan déposé comme ordonnance : signalé, puis rangé comme bilan et relu', async () => {
    const r = await docs.upload(jo, pid, [{ name: 'bilan.pdf', data: fx('bilan-fictif.pdf') }], { kind: 'prescription' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const before = (await docs.get(jo, pid, r.documentId))!;
    expect(before.document.kind).toBe('prescription');
    expect(before.job!.warnings).toEqual(expect.arrayContaining([{ code: 'looks_like_lab_report' }]));
    // Titres et lignes de résultats ne sont plus proposés comme traitements.
    expect(before.medicationDrafts).toEqual([]);

    // Identifiant inconnu : refusé.
    expect(await docs.reclassifyAsLabReport(jo, pid, '00000000-0000-0000-0000-000000000000')).toEqual({ ok: false, error: 'Document introuvable.' });

    ctx.advance(1); // la nouvelle lecture est postérieure à la première
    expect(await docs.reclassifyAsLabReport(jo, pid, r.documentId)).toEqual({ ok: true, status: 'to_review', drafts: 7 });
    const after = (await docs.get(jo, pid, r.documentId))!;
    expect(after.document).toMatchObject({ kind: 'lab_report', kind_by_user: true });
    expect(after.job!.status).toBe('to_review');
    expect(after.drafts).toHaveLength(7);
    expect(after.medicationDrafts).toEqual([]);
  });
});
