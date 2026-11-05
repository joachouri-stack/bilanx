import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProfilesService, ForbiddenError, type Actor } from '@bilanx/profiles';
import { setupAuth, TEST_DB, tokenFrom } from '../../auth/test/helpers';
import { createSql } from '@bilanx/db';
import { createSharingService } from '../src';

const PDF = Buffer.from('%PDF-1.7\n% rapport fictif de test\n%%EOF\n');

describe.skipIf(!TEST_DB)('partage sécurisé d’un rapport (PostgreSQL réel)', () => {
  let ctx: Awaited<ReturnType<typeof setupAuth>>;
  let profiles: ReturnType<typeof createProfilesService>;
  let share: ReturnType<typeof createSharingService>;
  let jo: Actor, marc: Actor;
  let pid = '', marcPid = '';
  const client = { ip: '203.0.113.5', userAgent: 'Navigateur du cabinet' };

  async function createUser(email: string, name: string): Promise<Actor> {
    await ctx.auth.signUp({ email, password: 'cheval-agrafe-batterie', displayName: name, acceptHealthProcessing: true, acceptAiExtraction: false });
    await ctx.auth.verifyEmail(tokenFrom(ctx.mailer.last(email)?.text));
    const [a] = await ctx.sql<{ id: string }[]>`SELECT id FROM account WHERE email = ${email}`;
    return { accountId: a!.id, email, displayName: name };
  }
  const make = (over: Partial<Parameters<typeof share.create>[2]> = {}) =>
    share.create(jo, pid, { pdf: PDF, periodStart: '2026-10-06', periodEnd: '2026-11-04', sections: ['glucose', 'hba1c'], recipient: 'Dr Martin', duration: '7', sharerName: 'Jo', ...over });

  beforeAll(async () => {
    ctx = await setupAuth(); // 2026-11-04 10:00 UTC
    const now = () => new Date(ctx.clock.t);
    profiles = createProfilesService({ sql: ctx.sql, mailer: ctx.mailer, appUrl: 'https://bilanx.test', now });
    share = createSharingService({ sql: ctx.sql, profiles, secretKey: Buffer.alloc(32, 7), mailer: ctx.mailer, appUrl: 'https://bilanx.test', now });
    jo = await createUser('jo@exemple.fr', 'Jo');
    marc = await createUser('marc@exemple.fr', 'Marc');
    pid = (await profiles.listProfiles(jo.accountId))[0]!.profileId;
    marcPid = (await profiles.listProfiles(marc.accountId))[0]!.profileId;
  });
  afterAll(async () => {
    await ctx?.sql.end();
  });

  it('création : lien + code à 8 chiffres, PDF chiffré, informations publiques sans donnée de santé', async () => {
    const s = await make();
    if (!s.ok) throw new Error(s.error);
    expect(s.code).toMatch(/^\d{4} \d{4}$/);
    expect(s.expiresAt.toISOString()).toBe('2026-11-11T10:00:00.000Z');
    const [raw] = await ctx.sql<{ n: number }[]>`SELECT count(*)::int AS n FROM report`; // rôle applicatif sans contexte
    expect(raw!.n).toBe(0);
    expect(await share.publicInfo(s.token)).toEqual({ status: 'active', sharerName: 'Jo', recipient: 'Dr Martin', periodStart: '2026-10-06', periodEnd: '2026-11-04', expiresAt: s.expiresAt });
    expect(await share.publicInfo('jeton-invente')).toBeNull();
    expect((await share.list(jo, pid))[0]).toMatchObject({ status: 'active', views: 0, recipient: 'Dr Martin', sections: ['glucose', 'hba1c'] });
  });

  it('bon code : PDF identique, titulaire prévenu à la première ouverture seulement, accès journalisé', async () => {
    const s = await make();
    if (!s.ok) throw new Error();
    const before = ctx.mailer.sent.length;
    const o = await share.open(s.token, s.code, client);
    if (o.status !== 'ok') throw new Error(o.status);
    expect(await share.pdf(s.token, o.viewerToken)).toEqual(PDF);
    expect(ctx.mailer.sent.slice(before).map((m) => [m.to, m.subject])).toEqual([['jo@exemple.fr', 'Votre rapport BILANX partagé vient d’être consulté']]);
    expect((await share.open(s.token, s.code.replace(' ', ''), client)).status).toBe('ok'); // sans espace : accepté
    expect(ctx.mailer.sent.length).toBe(before + 1);
    const log = await share.accessLog(jo, pid, s.id);
    expect(log.map((l) => [l.success, l.user_agent])).toEqual([[true, 'Navigateur du cabinet'], [true, 'Navigateur du cabinet']]);
  });

  it('codes erronés : verrouillage au 5e essai, même avec le bon code ensuite', async () => {
    const s = await make();
    if (!s.ok) throw new Error();
    for (const left of [4, 3, 2, 1]) expect(await share.open(s.token, '0000 0000', client)).toEqual({ status: 'wrong_code', attemptsLeft: left });
    expect(await share.open(s.token, '0000 0000', client)).toEqual({ status: 'locked' });
    expect(await share.open(s.token, s.code, client)).toEqual({ status: 'locked' });
    expect((await share.list(jo, pid)).find((x) => x.id === s.id)).toMatchObject({ status: 'locked', failures: 5, views: 0 });
  });

  it('nombre d’ouvertures, expiration, révocation (PDF effacé)', async () => {
    const one = await make({ maxViews: '1' });
    if (!one.ok) throw new Error();
    expect((await share.open(one.token, one.code, client)).status).toBe('ok');
    expect(await share.open(one.token, one.code, client)).toEqual({ status: 'exhausted' });

    const r = await make();
    if (!r.ok) throw new Error();
    const o = await share.open(r.token, r.code, client);
    if (o.status !== 'ok') throw new Error();
    expect(await share.revoke(jo, pid, r.id)).toBe(true);
    expect(await share.pdf(r.token, o.viewerToken)).toBeNull(); // révocation immédiate, même en cours de consultation
    expect(await share.open(r.token, r.code, client)).toEqual({ status: 'revoked' });

    const e = await make({ duration: '1' });
    if (!e.ok) throw new Error();
    ctx.advance(25 * 60);
    expect(await share.open(e.token, e.code, client)).toEqual({ status: 'expired' });
    ctx.advance(-25 * 60);
  });

  it('jeton de consultation : propre à son partage, signé, limité à 30 minutes', async () => {
    const a = await make();
    const b = await make();
    if (!a.ok || !b.ok) throw new Error();
    const o = await share.open(a.token, a.code, client);
    if (o.status !== 'ok') throw new Error();
    expect(await share.pdf(b.token, o.viewerToken)).toBeNull(); // jeton de A sur le lien de B
    expect(await share.pdf(a.token, o.viewerToken.slice(0, -2) + 'xx')).toBeNull(); // signature altérée
    const [id, , sig] = o.viewerToken.split('.');
    expect(await share.pdf(a.token, `${id}.${Date.now() + 9e9}.${sig}`)).toBeNull(); // échéance modifiée
    ctx.advance(31);
    expect(await share.pdf(a.token, o.viewerToken)).toBeNull();
    ctx.advance(-31);
  });

  it('isolement : un autre compte ne voit ni ne révoque ; un jeton n’ouvre que son partage', async () => {
    const s = await make();
    if (!s.ok) throw new Error();
    await expect(share.list(marc, pid)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await share.revoke(marc, marcPid, s.id)).toBe(false);
    expect(await share.accessLog(marc, marcPid, s.id)).toEqual([]);
    // Avec le jeton d'un partage, la base ne laisse voir que celui-là.
    const seen = await ctx.sql.begin(async (tx) => {
      await tx`SELECT set_config('app.share_token_hash', ${(await import('node:crypto')).createHash('sha256').update(s.token).digest('hex')}, true)`;
      return (await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM share_link`)[0]!.n;
    });
    expect(seen).toBe(1);
    // Journal d'accès : ni modification ni effacement par l'application.
    await expect(ctx.sql`DELETE FROM share_access`).rejects.toThrow(/permission denied/);
  });

  it('tâche de fond : efface les PDF expirés, conserve les partages actifs', async () => {
    const keep = await make({ duration: '30' });
    if (!keep.ok) throw new Error();
    // La règle de la base utilise l'heure réelle du serveur (non falsifiable par l'application) :
    // on fait expirer en base tous les partages sauf celui-ci.
    const admin = createSql(TEST_DB, { max: 1 });
    await admin`UPDATE share_link SET expires_at = now() - interval '1 hour' WHERE id <> ${keep.id}`;
    await admin.end();
    ctx.clock.t = new Date(Date.now()); // horloge de l'application alignée sur la base
    expect(await share.purgeExpired()).toBeGreaterThan(0);
    expect(await share.purgeExpired()).toBe(0);
    const o = await share.open(keep.token, keep.code, client);
    if (o.status !== 'ok') throw new Error(o.status);
    expect(await share.pdf(keep.token, o.viewerToken)).toEqual(PDF);
    const statuses = (await share.list(jo, pid)).map((x) => x.status);
    expect(statuses.filter((x) => x === 'active')).toHaveLength(1);
  });
});
