import { readFileSync } from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProfilesService, ForbiddenError, type Actor } from '@bilanx/profiles';
import { createDocumentsService, terminateOcr } from '@bilanx/documents';
import { createJournalService, createLabService, createMedicationsService } from '../../records/src';
import { setupAuth, TEST_DB, tokenFrom } from '../../auth/test/helpers';
import { createSql } from '@bilanx/db';
import { createPrivacyService } from '../src';

const PDF = readFileSync(new URL('../../documents/test/fixtures/bilan-fictif.pdf', import.meta.url));

describe.skipIf(!TEST_DB)('droits RGPD : export, consentements, suppression (PostgreSQL réel)', () => {
  let ctx: Awaited<ReturnType<typeof setupAuth>>;
  let profiles: ReturnType<typeof createProfilesService>;
  let docs: ReturnType<typeof createDocumentsService>;
  let lab: ReturnType<typeof createLabService>;
  let journal: ReturnType<typeof createJournalService>;
  let privacy: ReturnType<typeof createPrivacyService>;
  let jo: Actor, marc: Actor;
  let joPid = '', mamie = '', marcPid = '', docId = '';

  async function createUser(email: string, name: string, ai = false): Promise<Actor> {
    await ctx.auth.signUp({ email, password: 'cheval-agrafe-batterie', displayName: name, acceptHealthProcessing: true, acceptAiExtraction: ai });
    await ctx.auth.verifyEmail(tokenFrom(ctx.mailer.last(email)?.text));
    const [a] = await ctx.sql<{ id: string }[]>`SELECT id FROM account WHERE email = ${email}`;
    return { accountId: a!.id, email, displayName: name };
  }
  const count = async (table: string, profileId: string) =>
    (await ctx.sql.unsafe(`SELECT count(*)::int AS n FROM ${table} WHERE profile_id = $1`, [profileId]).catch(() => [{ n: -1 }]))[0]!.n as number;
  // Comptage hors RLS, par le compte propriétaire des tables (la RLS est désactivée le temps de la requête).
  async function rawCount(table: string, profileId: string): Promise<number> {
    const admin = createSql(TEST_DB, { max: 1 });
    return admin.begin(async (tx) => {
      await tx.unsafe('ALTER TABLE ' + table + ' NO FORCE ROW LEVEL SECURITY');
      const [r] = await tx.unsafe(`SELECT count(*)::int AS n FROM ${table} WHERE profile_id = $1`, [profileId]);
      await tx.unsafe('ALTER TABLE ' + table + ' FORCE ROW LEVEL SECURITY');
      return r!.n as number;
    }).finally(() => admin.end()) as Promise<number>;
  }

  beforeAll(async () => {
    ctx = await setupAuth();
    const now = () => new Date(ctx.clock.t);
    profiles = createProfilesService({ sql: ctx.sql, mailer: ctx.mailer, appUrl: 'https://bilanx.test', now });
    docs = createDocumentsService({ sql: ctx.sql, profiles, secretKey: Buffer.alloc(32, 9), now });
    lab = createLabService({ profiles, now });
    journal = createJournalService({ profiles, now });
    privacy = createPrivacyService({ sql: ctx.sql, profiles, documents: docs, mailer: ctx.mailer, appUrl: 'https://bilanx.test', now });
    jo = await createUser('jo@exemple.fr', 'Jo', true);
    marc = await createUser('marc@exemple.fr', 'Marc');
    joPid = (await profiles.listProfiles(jo.accountId))[0]!.profileId;
    marcPid = (await profiles.listProfiles(marc.accountId))[0]!.profileId;
    const r = await profiles.createRelativeProfile(jo, { displayName: 'Mamie Rose', relationship: 'grandparent', legalBasis: 'consent_of_person', attested: true });
    if (r.ok) mamie = r.profileId;
    await lab.addManual(jo, joPid, { analyteCode: 'hba1c', value: '7,2', unit: '%', sampledOn: '2026-09-03', laboratory: 'Labo; "du centre"' });
    await lab.addManual(jo, mamie, { analyteCode: 'ferritin', value: '25', unit: 'µg/L', sampledOn: '2026-09-03' });
    const meds = createMedicationsService({ profiles, now });
    const m = await meds.save(jo, joPid, { name: 'Metformine', strength: '1000 mg', posology: '1 comprimé matin et soir', times: ['08:00', '20:00'], qty: ['1 cp', '1 cp'], startDate: '2026-11-01' });
    if (m.ok) await meds.record(jo, joPid, m.id, new Date('2026-11-03T07:00:00Z'), 'taken');
    await journal.add(jo, joPid, { kind: 'meal', mealKind: 'lunch', date: '2026-11-03', time: '12:30', description: 'Lentilles', carbs: '45' });
    const u = await docs.upload(jo, joPid, [{ name: 'bilan.pdf', data: PDF }]);
    if (u.ok) docId = u.documentId;
    // Marc, aidant de Mamie avec droit de saisie, y ajoute un résultat.
    await profiles.invite(jo, mamie, { email: 'marc@exemple.fr', role: 'caregiver', permissions: { lab: 'write' } });
    await profiles.respondToInvitation(marc, tokenFrom(ctx.mailer.last('marc@exemple.fr')?.text), true);
    await lab.addManual(marc, mamie, { analyteCode: 'tsh', value: '2', unit: 'mUI/L', sampledOn: '2026-09-04' });
    await lab.addManual(marc, marcPid, { analyteCode: 'crp', value: '3', unit: 'mg/L', sampledOn: '2026-09-04' });
  });
  afterAll(async () => {
    await terminateOcr();
    await ctx?.sql.end();
  });

  it('export : archive complète du compte et des profils gérés, documents originaux inclus', async () => {
    const { zip, profiles: n } = await privacy.exportAccount(jo);
    expect(n).toBe(2);
    const files = unzipSync(new Uint8Array(zip));
    const names = Object.keys(files).sort();
    expect(names).toContain('LISEZ-MOI.txt');
    expect(names).toContain('compte.json');
    expect(names).toContain('profils/Jo/analyses.csv');
    expect(names).toContain('profils/Mamie-Rose/analyses.csv');
    expect(names).toContain('profils/Jo/activite-pas.csv');
    expect(names).toContain('profils/Jo/medicaments.csv');
    expect(names).toContain('profils/Jo/prises-medicaments.csv');
    expect(names).toContain('profils/Jo/partages.csv');
    expect(names).toContain('profils/Jo/partages-acces.csv');
    const compte = JSON.parse(strFromU8(files['compte.json']!));
    expect(compte.email).toBe('jo@exemple.fr');
    expect(compte.consentements.map((c: { purpose: string }) => c.purpose).sort()).toEqual(['ai_extraction', 'health_data_processing']);
    expect(JSON.stringify(compte)).not.toMatch(/argon2|password|secret/i);
    const analyses = strFromU8(files['profils/Jo/analyses.csv']!);
    // BOM UTF-8 (octets EF BB BF) pour l'ouverture directe dans un tableur ; le décodeur le retire.
    expect([...files['profils/Jo/analyses.csv']!.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(analyses.replace(/^\uFEFF/, '').startsWith('analyse;valeur;')).toBe(true);
    expect(analyses).toContain('hba1c;7.2;');
    expect(analyses).toContain('"Labo; ""du centre"""'); // échappement CSV
    expect(strFromU8(files['profils/Jo/journal.csv']!)).toContain('Lentilles');
    expect(strFromU8(files['profils/Jo/medicaments.csv']!)).toContain('08:00 (1 cp) ; 20:00 (1 cp)');
    expect(strFromU8(files['profils/Jo/prises-medicaments.csv']!)).toMatch(/2026-11-03T07:00:00.*Metformine.*taken/);
    const original = names.find((x) => x.startsWith('profils/Jo/documents/') && x.endsWith('.pdf'))!;
    expect(Buffer.from(files[original]!).equals(PDF)).toBe(true);
    expect(strFromU8(files['profils/Jo/valeurs-lues.csv']!)).toContain('Ferritine');
    // Les données de Marc (profil partagé avec lui par personne) n'y figurent pas.
    expect(strFromU8(files['profils/Mamie-Rose/analyses.csv']!)).toContain('tsh');
    expect(names.some((x) => x.includes('Marc'))).toBe(false);
  });

  it('un aidant n’exporte pas les données d’un profil qu’il ne gère pas', async () => {
    const files = unzipSync(new Uint8Array((await privacy.exportAccount(marc)).zip));
    expect(Object.keys(files).some((x) => x.includes('Mamie'))).toBe(false);
    expect(JSON.parse(strFromU8(files['compte.json']!)).profilsPartagesAvecMoi[0].profil).toBe('Mamie Rose');
  });

  it('retrait du consentement à la lecture automatique', async () => {
    expect(await docs.hasAutoReadingConsent(jo.accountId)).toBe(true);
    expect(await privacy.withdrawAutoReading(jo)).toBe(true);
    expect(await docs.hasAutoReadingConsent(jo.accountId)).toBe(false);
    const u = await docs.upload(jo, joPid, [{ name: 'b.pdf', data: PDF }]);
    expect(u).toMatchObject({ ok: true, status: 'not_processed' });
    if (u.ok) expect((await docs.list(jo, joPid)).find((d) => d.id === u.documentId)!.job_status).toBeNull(); // déposé, non lu
  });

  it('suppression d’un proche : confirmation, invisibilité immédiate, accès retirés, effacement après 30 jours', async () => {
    await expect(privacy.deleteProfile(marc, mamie, 'Mamie Rose')).rejects.toBeInstanceOf(ForbiddenError);
    expect(await privacy.deleteProfile(jo, joPid, 'Jo')).toMatchObject({ ok: false });
    expect(await privacy.deleteProfile(jo, mamie, 'mamie')).toMatchObject({ ok: false });
    expect(await privacy.deleteProfile(jo, mamie, 'Mamie Rose')).toEqual({ ok: true });
    expect(ctx.mailer.last('marc@exemple.fr')?.subject).toContain('supprimé');
    expect((await profiles.listProfiles(jo.accountId)).map((p) => p.displayName)).toEqual(['Jo']);
    expect(await profiles.getAccess(marc.accountId, mamie)).toBeNull();
    expect(await rawCount('lab_result', mamie)).toBe(2); // encore présent, récupérable 30 jours
    ctx.advance(29 * 24 * 60);
    expect((await privacy.purge()).profiles).toBe(0);
    ctx.advance(2 * 24 * 60);
    expect(await privacy.purge()).toEqual({ profiles: 1, accounts: 0 });
    expect(await rawCount('lab_result', mamie)).toBe(0);
    expect((await ctx.sql`SELECT count(*)::int AS n FROM profile WHERE id = ${mamie}`)[0]!.n).toBe(0);
    void count;
  });

  it('suppression du compte : mot de passe, délai de grâce, annulation possible', async () => {
    expect(await privacy.requestAccountDeletion(jo, 'mauvais')).toMatchObject({ ok: false });
    const r = await privacy.requestAccountDeletion(jo, 'cheval-agrafe-batterie');
    expect(r.ok).toBe(true);
    expect(ctx.mailer.last('jo@exemple.fr')?.subject).toContain('programmée');
    expect(await privacy.cancelAccountDeletion(jo)).toBe(true);
    expect(await privacy.deletionStatus(jo.accountId)).toBeNull();
    ctx.advance(8 * 24 * 60);
    expect((await privacy.purge()).accounts).toBe(0);
  });

  it('effacement du compte : un proche supprimé peu avant (encore dans ses 30 jours) est effacé aussi', async () => {
    const r = await profiles.createRelativeProfile(jo, { displayName: 'Léo', relationship: 'child', birthDate: '2015-06-01', legalBasis: 'parental_authority', attested: true });
    if (!r.ok) throw new Error('création attendue');
    await lab.addManual(jo, r.profileId, { analyteCode: 'ferritin', value: '40', unit: 'µg/L', sampledOn: '2026-09-03' });
    expect(await privacy.deleteProfile(jo, r.profileId, 'Léo')).toEqual({ ok: true });
    expect((await privacy.requestAccountDeletion(jo, 'cheval-agrafe-batterie')).ok).toBe(true);
    ctx.advance(8 * 24 * 60);
    expect(await privacy.purge()).toEqual({ profiles: 2, accounts: 1 }); // son profil + Léo
    expect((await ctx.sql`SELECT count(*)::int AS n FROM profile WHERE id = ${r.profileId}`)[0]!.n).toBe(0);
    expect(await rawCount('lab_result', r.profileId)).toBe(0);
    // Isolation : les données d'un autre compte ne sont pas touchées.
    expect(await rawCount('lab_result', marcPid)).toBe(1);
  });

  it('après le délai : profils gérés effacés, compte anonymisé, saisies faites ailleurs conservées', async () => {
    // Marc supprime son compte ; il avait saisi un résultat pour un autre profil (Mamie, déjà effacée) et le sien.
    expect((await privacy.requestAccountDeletion(marc, 'cheval-agrafe-batterie')).ok).toBe(true);
    ctx.advance(6 * 24 * 60);
    expect((await privacy.purge()).accounts).toBe(0); // délai de grâce non écoulé
    ctx.advance(2 * 24 * 60);
    expect(await privacy.purge()).toEqual({ profiles: 1, accounts: 1 });
    const [acc] = await ctx.sql`SELECT email, password_hash, deleted_at FROM account WHERE id = ${marc.accountId}`;
    expect(acc!.email).toBe(`supprime-${marc.accountId}@invalid`);
    expect(acc!.password_hash).toBeNull();
    expect(acc!.deleted_at).toBeInstanceOf(Date);
    expect(await rawCount('lab_result', marcPid)).toBe(0);
    expect((await ctx.sql`SELECT count(*)::int AS n FROM login_event WHERE account_id = ${marc.accountId}`)[0]!.n).toBe(0);
    expect(await ctx.auth.signIn({ email: 'marc@exemple.fr', password: 'cheval-agrafe-batterie' })).toEqual({ status: 'invalid' });
    void docId;
  });
});
