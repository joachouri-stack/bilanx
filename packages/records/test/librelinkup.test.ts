import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProfilesService, type Actor } from '@bilanx/profiles';
import { setupAuth, TEST_DB, tokenFrom } from '../../auth/test/helpers';
import { createLibreLinkService, libreClient, parseLibreTimestamp, type FetchLike } from '../src';

/** Faux serveur LibreLinkUp : redirection de région, identifiants, jeton, graphique. */
function fakeLibre() {
  const state = { password: 'secret-suiveur', token: 'jeton-1', calls: [] as string[], graph: [] as { t: string; v: number }[], expireNext: false, acceptTerms: true };
  const fetch: FetchLike = async (url, init) => {
    const u = new URL(url);
    state.calls.push(`${init?.method ?? 'GET'} ${u.host}${u.pathname}`);
    const reply = (status: number, body: unknown) => ({ status, json: async () => body });
    if (u.pathname === '/llu/auth/login') {
      if (u.host === 'api-eu.libreview.io') return reply(200, { status: 0, data: { redirect: true, region: 'fr' } });
      const b = JSON.parse(init?.body ?? '{}') as { email: string; password: string };
      if (b.password !== state.password) return reply(200, { status: 2, error: { message: 'notAuthenticated' } });
      if (!state.acceptTerms) return reply(200, { status: 4, data: { step: { type: 'tou' } } });
      return reply(200, { status: 0, data: { user: { id: 'u-123' }, authTicket: { token: state.token, expires: Math.floor(Date.UTC(2026, 10, 4, 12) / 1000) } } });
    }
    if (u.host !== 'api-fr.libreview.io') return reply(404, {});
    if (init?.headers?.authorization !== `Bearer ${state.token}` || state.expireNext) {
      state.expireNext = false;
      return reply(401, { message: 'expired' });
    }
    if (!init?.headers?.['account-id']) return reply(403, {});
    if (u.pathname === '/llu/connections') return reply(200, { status: 0, data: [{ patientId: '0a1b2c3d-1111-2222-3333-444455556666', firstName: 'Jo', lastName: 'A.' }] });
    if (u.pathname.endsWith('/graph'))
      return reply(200, {
        status: 0,
        data: {
          connection: { glucoseMeasurement: state.graph.length ? { FactoryTimestamp: state.graph.at(-1)!.t, ValueInMgPerDl: state.graph.at(-1)!.v } : undefined },
          graphData: state.graph.map((g) => ({ FactoryTimestamp: g.t, ValueInMgPerDl: g.v })),
        },
      });
    return reply(404, {});
  };
  return { state, fetch };
}

describe('LibreLinkUp : lecture des dates', () => {
  it('« M/J/AAAA h:mm:ss AM/PM » en UTC', () => {
    expect(parseLibreTimestamp('11/4/2026 9:30:00 PM')!.toISOString()).toBe('2026-11-04T21:30:00.000Z');
    expect(parseLibreTimestamp('11/4/2026 12:05:00 AM')!.toISOString()).toBe('2026-11-04T00:05:00.000Z');
    expect(parseLibreTimestamp('11/4/2026 12:05:00 PM')!.toISOString()).toBe('2026-11-04T12:05:00.000Z');
    expect(parseLibreTimestamp('n’importe quoi')).toBeNull();
  });
  it('suit la redirection de région et refuse un mauvais mot de passe', async () => {
    const f = fakeLibre();
    const c = libreClient(f.fetch);
    const s = await c.login('suiveur@exemple.fr', 'secret-suiveur');
    expect(s.host).toBe('api-fr.libreview.io');
    await expect(c.login('suiveur@exemple.fr', 'faux')).rejects.toThrow('incorrect');
    f.state.acceptTerms = false;
    await expect(c.login('suiveur@exemple.fr', 'secret-suiveur')).rejects.toThrow('conditions');
  });
});

describe.skipIf(!TEST_DB)('LibreLinkUp : lien, synchronisation sans doublon (PostgreSQL réel)', () => {
  let ctx: Awaited<ReturnType<typeof setupAuth>>;
  let profiles: ReturnType<typeof createProfilesService>;
  let jo: Actor;
  let pid = '';
  const f = fakeLibre();
  let libre: ReturnType<typeof createLibreLinkService>;

  beforeAll(async () => {
    ctx = await setupAuth(); // 4 nov. 2026, 10:00 UTC
    const now = () => new Date(ctx.clock.t);
    profiles = createProfilesService({ sql: ctx.sql, mailer: ctx.mailer, appUrl: 'https://bilanx.test', now });
    libre = createLibreLinkService({ sql: ctx.sql, profiles, secretKey: Buffer.alloc(32, 7), fetch: f.fetch, now });
    await ctx.auth.signUp({ email: 'jo@exemple.fr', password: 'cheval-agrafe-batterie', displayName: 'Jo', acceptHealthProcessing: true, acceptAiExtraction: false });
    await ctx.auth.verifyEmail(tokenFrom(ctx.mailer.last('jo@exemple.fr')?.text));
    const [a] = await ctx.sql<{ id: string }[]>`SELECT id FROM account WHERE email = 'jo@exemple.fr'`;
    jo = { accountId: a!.id, email: 'jo@exemple.fr' };
    pid = (await profiles.listProfiles(jo.accountId))[0]!.profileId;
  });
  afterAll(async () => {
    await ctx?.sql.end();
  });

  const count = async () =>
    Number(
      (await profiles.withProfileData(jo, pid, 'glucose', 'read', (tx) => tx<{ n: string }[]>`SELECT count(*) AS n FROM glucose_reading WHERE profile_id = ${pid} AND kind = 'sensor'`))[0]!.n,
    );

  it('mauvais mot de passe : rien n’est enregistré', async () => {
    const r = await libre.connect(jo, pid, 'suiveur@exemple.fr', 'faux');
    expect(r).toEqual({ ok: false, error: 'E-mail ou mot de passe LibreLinkUp incorrect.' });
    expect(await libre.status(jo, pid)).toBeNull();
  });

  it('connexion : personne partagée, mesures importées, mot de passe chiffré', async () => {
    f.state.graph = [
      { t: '11/4/2026 9:00:00 AM', v: 110 },
      { t: '11/4/2026 9:15:00 AM', v: 126 },
      { t: '11/4/2026 9:30:00 AM', v: 141 },
    ];
    const r = await libre.connect(jo, pid, ' Suiveur@Exemple.fr ', 'secret-suiveur');
    expect(r).toEqual({ ok: true, patientName: 'Jo A.', readings: 3 });
    const st = await libre.status(jo, pid);
    expect(st?.email).toBe('suiveur@exemple.fr');
    expect(st?.lastReadingAt?.toISOString()).toBe('2026-11-04T09:30:00.000Z');
    const [raw] = await ctx.sql<{ password_enc: Buffer }[]>`SELECT password_enc FROM libre_link WHERE profile_id = ${pid}`;
    expect(raw!.password_enc.toString('utf8')).not.toContain('secret-suiveur');
    expect(await count()).toBe(3);
  });

  it('synchronisation suivante : seules les nouvelles mesures s’ajoutent ; pas avant 5 min', async () => {
    f.state.graph.push({ t: '11/4/2026 9:45:00 AM', v: 150 });
    expect(await libre.syncDue()).toEqual({ synced: 0, failed: 0 }); // trop tôt
    ctx.advance(5);
    expect(await libre.syncDue()).toEqual({ synced: 1, failed: 0 });
    expect(await count()).toBe(4);
  });

  it('session expirée : nouvelle connexion automatique', async () => {
    f.state.expireNext = true;
    f.state.token = 'jeton-2';
    f.state.graph.push({ t: '11/4/2026 10:00:00 AM', v: 160 });
    ctx.advance(5);
    expect((await libre.syncNow(jo, pid)).ok).toBe(true);
    expect(await count()).toBe(5);
  });

  it('mot de passe changé chez Abbott : arrêt après 3 échecs (pas de blocage du compte)', async () => {
    f.state.password = 'nouveau';
    f.state.token = 'jeton-3';
    for (let i = 0; i < 4; i++) {
      ctx.advance(6);
      await libre.syncDue();
    }
    const st = await libre.status(jo, pid);
    expect(st?.status).toBe('error');
    expect(st?.lastError).toContain('incorrect');
    const logins = f.state.calls.filter((c) => c.includes('/auth/login')).length;
    ctx.advance(30);
    await libre.syncDue();
    expect(f.state.calls.filter((c) => c.includes('/auth/login')).length).toBe(logins);
  });

  it('déconnexion : identifiants effacés, mesures conservées', async () => {
    await libre.disconnect(jo, pid);
    expect(await libre.status(jo, pid)).toBeNull();
    expect(await count()).toBe(5);
  });
});
