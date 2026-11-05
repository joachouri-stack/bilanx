import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSql } from '@bilanx/db';
import { createProfilesService } from '@bilanx/profiles';
import { createDocumentsService, terminateOcr } from '@bilanx/documents';
import { setupAuth, TEST_DB, tokenFrom } from '../../auth/test/helpers';
import { totp, base32Decode } from '../../auth/src/totp';
import { checkBackup } from '../src';

const PDF = readFileSync(new URL('../../documents/test/fixtures/bilan-fictif.pdf', import.meta.url));
const MIGRATIONS = fileURLToPath(new URL('../../../db/migrations', import.meta.url));
const KEY = Buffer.alloc(32, 7); // clé de setupAuth : même clé maîtresse pour tous les services, comme en production

describe.skipIf(!TEST_DB)('contrôle d’une sauvegarde restaurée (PostgreSQL réel)', () => {
  let ctx: Awaited<ReturnType<typeof setupAuth>>;
  let admin: ReturnType<typeof createSql>;

  beforeAll(async () => {
    ctx = await setupAuth();
    admin = createSql(TEST_DB, { max: 1 });
    const now = () => new Date(ctx.clock.t);
    const profiles = createProfilesService({ sql: ctx.sql, mailer: ctx.mailer, appUrl: 'https://bilanx.test', now });
    const docs = createDocumentsService({ sql: ctx.sql, profiles, secretKey: KEY, now });
    const email = 'jo@exemple.fr';
    await ctx.auth.signUp({ email, password: 'cheval-agrafe-batterie', displayName: 'Jo', acceptHealthProcessing: true, acceptAiExtraction: false });
    await ctx.auth.verifyEmail(tokenFrom(ctx.mailer.last(email)?.text));
    const r = await ctx.auth.signIn({ email, password: 'cheval-agrafe-batterie', userAgent: 'Test', ip: '203.0.113.5' });
    if (r.status !== 'ok') throw new Error('connexion attendue');
    const s = (await ctx.auth.getSession(r.token))!;
    const { secret } = await ctx.auth.beginTotpEnrollment(s);
    expect((await ctx.auth.confirmTotpEnrollment(s, totp(base32Decode(secret), ctx.clock.t))).ok).toBe(true);
    const [a] = await ctx.sql<{ id: string }[]>`SELECT id FROM account WHERE email = ${email}`;
    const pid = (await profiles.listProfiles(a!.id))[0]!.profileId;
    const u = await docs.upload({ accountId: a!.id, email, displayName: 'Jo' }, pid, [{ name: 'bilan.pdf', data: PDF }]);
    expect(u.ok).toBe(true);
  });
  afterAll(async () => {
    await terminateOcr();
    await admin?.end();
    await ctx?.sql.end();
  });

  it('avec la bonne clé : documents, secrets et journal vérifiés', async () => {
    const r = await checkBackup(admin, KEY, MIGRATIONS);
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.migrations.missing).toEqual([]);
    expect(r.counts).toMatchObject({ account: 1, profile: 1, document: 1 });
    expect(r.documents).toMatchObject({ checked: 1, failed: 0, missingPages: 0 });
    expect(r.documents.pages).toBeGreaterThan(0);
    expect(r.mfaSecrets).toEqual({ checked: 1, failed: 0 });
    expect(r.audit).toMatchObject({ altered: 0, brokenLinks: 0 });
  });

  it('avec une autre clé : sauvegarde déclarée inexploitable', async () => {
    const r = await checkBackup(admin, Buffer.alloc(32, 1), MIGRATIONS);
    expect(r.ok).toBe(false);
    expect(r.documents.failed).toBe(1);
    expect(r.mfaSecrets.failed).toBe(1);
  });

  it('page de document absente de la sauvegarde : signalée', async () => {
    await admin`DELETE FROM document_file WHERE page = 1`;
    const r = await checkBackup(admin, KEY, MIGRATIONS);
    expect(r.ok).toBe(false);
    expect(r.documents.missingPages).toBeGreaterThan(0);
  });

  it('refuse de conclure sous le rôle applicatif (la RLS masquerait les données)', async () => {
    await expect(checkBackup(ctx.sql, KEY)).rejects.toThrow(/superutilisateur/);
  });
});
