import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { base32Decode, totp } from '../src/totp';
import { setupAuth, TEST_DB, tokenFrom } from './helpers';
import { SoftwareAuthenticator } from './software-authenticator';
import type { SessionInfo } from '../src';

const PW = 'cheval-agrafe-batterie';
const ORIGIN = 'https://bilanx.test'; // appUrl de setupAuth
const client = { userAgent: 'Test', ip: '203.0.113.5' };

describe.skipIf(!TEST_DB)('clés d’accès (passkeys) (PostgreSQL réel)', () => {
  let ctx: Awaited<ReturnType<typeof setupAuth>>;
  let s: SessionInfo;
  let phone: SoftwareAuthenticator;

  async function fullSession(email: string): Promise<SessionInfo> {
    await ctx.auth.signUp({ email, password: PW, displayName: 'Jo', acceptHealthProcessing: true, acceptAiExtraction: false });
    await ctx.auth.verifyEmail(tokenFrom(ctx.mailer.last(email)?.text));
    const r = await ctx.auth.signIn({ email, password: PW, ...client });
    if (r.status !== 'ok') throw new Error('connexion attendue');
    const pending = (await ctx.auth.getSession(r.token))!;
    const { secret } = await ctx.auth.beginTotpEnrollment(pending);
    const ok = await ctx.auth.confirmTotpEnrollment(pending, totp(base32Decode(secret), ctx.clock.t));
    if (!ok.ok) throw new Error('MFA attendue');
    return (await ctx.auth.getSession(ok.token))!;
  }

  beforeAll(async () => {
    ctx = await setupAuth();
    s = await fullSession('jo@exemple.fr');
    phone = new SoftwareAuthenticator('bilanx.test', ORIGIN);
  });
  afterAll(async () => {
    await ctx?.sql.end();
  });

  it('ajout : mot de passe exigé, clé découvrable avec vérification de l’utilisateur', async () => {
    expect(await ctx.auth.passkeyRegistrationOptions(s, 'faux')).toMatchObject({ ok: false, errors: { currentPassword: expect.any(String) } });
    const o = await ctx.auth.passkeyRegistrationOptions(s, PW);
    if (!o.ok) throw new Error('options attendues');
    expect(o.options).toMatchObject({ rp: { id: 'bilanx.test', name: 'BILANX' }, authenticatorSelection: { residentKey: 'required', userVerification: 'required' }, attestation: 'none' });
    expect(await ctx.auth.passkeyRegister(s, o.challengeId, phone.register(o.options), 'iPhone de Jo')).toEqual({ ok: true });
    expect(ctx.mailer.last('jo@exemple.fr')?.subject).toBe('Nouvelle clé d’accès sur votre compte BILANX');
    expect((await ctx.auth.listPasskeys(s.accountId)).map((k) => k.label)).toEqual(['iPhone de Jo']);
    // Défi déjà utilisé : refusé.
    expect(await ctx.auth.passkeyRegister(s, o.challengeId, phone.register(o.options), 'x')).toMatchObject({ ok: false });
  });

  it('ajout refusé : autre site (hameçonnage), sans Face ID / empreinte, clé déjà enregistrée', async () => {
    const other = new SoftwareAuthenticator('bilanx.test', ORIGIN);
    let o = await ctx.auth.passkeyRegistrationOptions(s, PW);
    if (!o.ok) throw new Error();
    expect(await ctx.auth.passkeyRegister(s, o.challengeId, other.register(o.options, { origin: 'https://bilanx-faux.example' }), 'x')).toMatchObject({ ok: false });
    o = await ctx.auth.passkeyRegistrationOptions(s, PW);
    if (!o.ok) throw new Error();
    expect(await ctx.auth.passkeyRegister(s, o.challengeId, other.register(o.options, { uv: false }), 'x')).toMatchObject({ ok: false });
    o = await ctx.auth.passkeyRegistrationOptions(s, PW);
    if (!o.ok) throw new Error();
    expect(o.options.excludeCredentials?.map((c) => c.id)).toEqual([phone.credentialId.toString('base64url')]);
    expect(await ctx.auth.passkeyRegister(s, o.challengeId, phone.register(o.options), 'doublon')).toEqual({ ok: false, error: 'Cette clé d’accès est déjà enregistrée.' });
  });

  it('connexion : session complète d’emblée (sans mot de passe ni code), journalisée', async () => {
    const o = (await ctx.auth.passkeyLoginOptions())!;
    expect(o.options).toMatchObject({ rpId: 'bilanx.test', userVerification: 'required' });
    expect(o.options.allowCredentials ?? []).toEqual([]); // clé découvrable : aucune adresse à saisir
    const r = await ctx.auth.passkeySignIn(o.challengeId, phone.authenticate(o.options), client);
    if (r.status !== 'ok') throw new Error('connexion attendue');
    expect(await ctx.auth.getSession(r.token)).toMatchObject({ accountId: s.accountId, mfaPassed: true });
    expect((await ctx.auth.listLoginEvents(s.accountId, 1))[0]).toMatchObject({ success: true, method: 'passkey' });
    expect((await ctx.auth.listPasskeys(s.accountId))[0]!.last_used_at).not.toBeNull();
    expect(await ctx.auth.passkeySignIn(o.challengeId, phone.authenticate(o.options), client)).toEqual({ status: 'invalid' }); // défi rejoué
  });

  it('connexion refusée : autre site, sans vérification, clé clonée (compteur), défi expiré, clé inconnue', async () => {
    const tryLogin = async (f: (o: { challenge: string }) => unknown) => {
      const o = (await ctx.auth.passkeyLoginOptions())!;
      return (await ctx.auth.passkeySignIn(o.challengeId, f(o.options) as never, client)).status;
    };
    expect(await tryLogin((o) => phone.authenticate(o, { origin: 'https://bilanx-faux.example' }))).toBe('invalid');
    expect(await tryLogin((o) => phone.authenticate(o, { uv: false }))).toBe('invalid');
    expect(await tryLogin((o) => phone.authenticate(o, { counter: 1 }))).toBe('invalid'); // compteur revenu en arrière
    expect(await tryLogin((o) => phone.authenticate(o, { counter: 50 }))).toBe('ok');
    expect(await tryLogin((o) => new SoftwareAuthenticator('bilanx.test', ORIGIN).authenticate(o))).toBe('invalid');
    const o = (await ctx.auth.passkeyLoginOptions())!;
    ctx.advance(6);
    expect((await ctx.auth.passkeySignIn(o.challengeId, phone.authenticate(o.options), client)).status).toBe('invalid');
    expect((await ctx.auth.listLoginEvents(s.accountId, 10)).filter((e) => e.method === 'passkey' && !e.success).length).toBeGreaterThanOrEqual(3);
  });

  it('une clé ne peut pas ouvrir un autre compte que le sien', async () => {
    const o = (await ctx.auth.passkeyLoginOptions())!;
    const marc = await fullSession('marc@exemple.fr');
    const forged = phone.authenticate(o.options, { userHandle: Buffer.from(marc.accountId.replace(/-/g, ''), 'hex').toString('base64url') });
    expect((await ctx.auth.passkeySignIn(o.challengeId, forged, client)).status).toBe('invalid');
  });

  it('point d’entrée public limité par adresse IP', async () => {
    for (let i = 0; i < 30; i++) expect(await ctx.auth.passkeyLoginOptions({ ip: '198.51.100.7' })).not.toBeNull();
    expect(await ctx.auth.passkeyLoginOptions({ ip: '198.51.100.7' })).toBeNull();
    expect(await ctx.auth.passkeyLoginOptions({ ip: '198.51.100.8' })).not.toBeNull(); // autre adresse : non affectée
  });

  it('suppression : mot de passe exigé, la clé ne permet plus de se connecter', async () => {
    const [k] = await ctx.auth.listPasskeys(s.accountId);
    expect(await ctx.auth.removePasskey(s, 'faux', k!.id)).toMatchObject({ ok: false });
    expect(await ctx.auth.removePasskey(s, PW, k!.id)).toEqual({ ok: true });
    expect(ctx.mailer.last('jo@exemple.fr')?.subject).toBe('Clé d’accès supprimée de votre compte BILANX');
    const o = (await ctx.auth.passkeyLoginOptions())!;
    expect((await ctx.auth.passkeySignIn(o.challengeId, phone.authenticate(o.options), client)).status).toBe('invalid');
  });
});
