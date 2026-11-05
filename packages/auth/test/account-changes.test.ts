import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { base32Decode, totp } from '../src/totp';
import { setupAuth, TEST_DB, tokenFrom } from './helpers';
import type { SessionInfo } from '../src';

const PW = 'cheval-agrafe-batterie';

describe.skipIf(!TEST_DB)('compte : mot de passe, adresse e-mail, codes de secours (PostgreSQL réel)', () => {
  let ctx: Awaited<ReturnType<typeof setupAuth>>;
  let s: SessionInfo;
  let token = '';

  /** Inscription, confirmation, connexion et double authentification : session complète. */
  async function fullSession(email: string, password = PW): Promise<{ s: SessionInfo; token: string; secret: Buffer }> {
    await ctx.auth.signUp({ email, password, displayName: 'Jo', acceptHealthProcessing: true, acceptAiExtraction: false });
    await ctx.auth.verifyEmail(tokenFrom(ctx.mailer.last(email)?.text));
    const r = await ctx.auth.signIn({ email, password, userAgent: 'Test', ip: '203.0.113.5' });
    if (r.status !== 'ok') throw new Error('connexion attendue');
    const pending = (await ctx.auth.getSession(r.token))!;
    const { secret } = await ctx.auth.beginTotpEnrollment(pending);
    const ok = await ctx.auth.confirmTotpEnrollment(pending, totp(base32Decode(secret), ctx.clock.t));
    if (!ok.ok) throw new Error('MFA attendue');
    return { s: (await ctx.auth.getSession(ok.token))!, token: ok.token, secret: base32Decode(secret) };
  }

  beforeAll(async () => {
    ctx = await setupAuth();
    ({ s, token } = await fullSession('jo@exemple.fr'));
    await fullSession('marc@exemple.fr');
  });
  afterAll(async () => {
    await ctx?.sql.end();
  });

  it('changement de mot de passe : mot de passe actuel exigé, autres appareils déconnectés, titulaire prévenu', async () => {
    // Un second appareil connecté (session non complétée, mais ouverte).
    const other = await ctx.auth.signIn({ email: 'jo@exemple.fr', password: PW, userAgent: 'Téléphone', ip: '203.0.113.9' });
    if (other.status !== 'ok') throw new Error('connexion attendue');
    expect(await ctx.auth.changePassword(s, 'mauvais', 'un-nouveau-mot-de-passe-solide')).toMatchObject({ ok: false, errors: { currentPassword: expect.any(String) } });
    expect(await ctx.auth.changePassword(s, PW, 'court')).toMatchObject({ ok: false, errors: { password: expect.any(String) } });
    expect(await ctx.auth.changePassword(s, PW, PW)).toMatchObject({ ok: false, errors: { password: expect.stringMatching(/différent/) } });
    const r = await ctx.auth.changePassword(s, PW, 'un-nouveau-mot-de-passe-solide');
    expect(r).toEqual({ ok: true, closedSessions: 1 });
    expect(await ctx.auth.getSession(other.token)).toBeNull(); // l'autre appareil est déconnecté
    expect(await ctx.auth.getSession(token)).not.toBeNull(); // la session en cours reste ouverte
    expect(ctx.mailer.last('jo@exemple.fr')?.subject).toBe('Votre mot de passe BILANX a été modifié');
    expect((await ctx.auth.signIn({ email: 'jo@exemple.fr', password: PW, userAgent: 'x', ip: null })).status).toBe('invalid');
    expect((await ctx.auth.signIn({ email: 'jo@exemple.fr', password: 'un-nouveau-mot-de-passe-solide', userAgent: 'x', ip: null })).status).toBe('ok');
  });

  it('mot de passe actuel : tentatives limitées', async () => {
    for (let i = 0; i < 5; i++) await ctx.auth.changePassword(s, `faux-${i}`, 'encore-un-autre-mot-de-passe');
    expect(await ctx.auth.changePassword(s, 'un-nouveau-mot-de-passe-solide', 'encore-un-autre-mot-de-passe')).toMatchObject({ ok: false, errors: { form: expect.stringMatching(/Trop de tentatives/) } });
    ctx.advance(16);
  });

  it('changement d’adresse : lien envoyé à la nouvelle, ancienne active jusqu’à confirmation, puis prévenue', async () => {
    const pw = 'un-nouveau-mot-de-passe-solide';
    expect(await ctx.auth.requestEmailChange(s, pw, 'pas-une-adresse')).toMatchObject({ ok: false, errors: { email: expect.any(String) } });
    expect(await ctx.auth.requestEmailChange(s, 'faux', 'jo.nouveau@exemple.fr')).toMatchObject({ ok: false, errors: { currentPassword: expect.any(String) } });
    expect(await ctx.auth.requestEmailChange(s, pw, ' JO@exemple.fr ')).toMatchObject({ ok: false, errors: { email: expect.stringMatching(/déjà l’adresse/) } });
    expect(await ctx.auth.requestEmailChange(s, pw, 'Jo.Nouveau@Exemple.fr')).toEqual({ ok: true, sentTo: 'jo.nouveau@exemple.fr' });
    const mail = ctx.mailer.last('jo.nouveau@exemple.fr')!;
    expect(mail.subject).toBe('Confirmez votre nouvelle adresse e-mail BILANX');
    // Tant que le lien n'est pas ouvert, rien ne change.
    expect((await ctx.auth.getSession(token))!.email).toBe('jo@exemple.fr');
    expect(await ctx.auth.confirmEmailChange('jeton-invente')).toMatchObject({ ok: false });
    const t = tokenFrom(mail.text);
    expect(await ctx.auth.confirmEmailChange(t)).toEqual({ ok: true, email: 'jo.nouveau@exemple.fr' });
    expect(await ctx.auth.confirmEmailChange(t)).toMatchObject({ ok: false }); // usage unique
    expect((await ctx.auth.getSession(token))!.email).toBe('jo.nouveau@exemple.fr');
    const notice = ctx.mailer.last('jo@exemple.fr')!;
    expect(notice.subject).toBe('L’adresse e-mail de votre compte BILANX a été modifiée');
    expect(notice.text).toContain('j…@exemple.fr');
    expect(notice.text).not.toContain('jo.nouveau@exemple.fr');
    expect((await ctx.auth.signIn({ email: 'jo.nouveau@exemple.fr', password: pw, userAgent: 'x', ip: null })).status).toBe('ok');
    expect((await ctx.auth.signIn({ email: 'jo@exemple.fr', password: pw, userAgent: 'x', ip: null })).status).toBe('invalid');
  });

  it('adresse déjà utilisée : même réponse, aucun lien, son titulaire est prévenu', async () => {
    s = (await ctx.auth.getSession(token))!;
    const before = ctx.mailer.sent.length;
    expect(await ctx.auth.requestEmailChange(s, 'un-nouveau-mot-de-passe-solide', 'marc@exemple.fr')).toEqual({ ok: true, sentTo: 'marc@exemple.fr' });
    const sent = ctx.mailer.sent.slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'marc@exemple.fr', subject: expect.stringMatching(/Tentative/) });
    expect(sent[0]!.text).not.toMatch(/jeton=/);
  });

  it('nouveaux codes de secours : les anciens ne valent plus rien', async () => {
    expect(await ctx.auth.recoveryCodesLeft(s.accountId)).toBe(10);
    const r = await ctx.auth.regenerateRecoveryCodes(s, 'un-nouveau-mot-de-passe-solide');
    if (!r.ok) throw new Error('codes attendus');
    expect(r.recoveryCodes).toHaveLength(10);
    expect(await ctx.auth.recoveryCodesLeft(s.accountId)).toBe(10);
    const signIn = await ctx.auth.signIn({ email: 'jo.nouveau@exemple.fr', password: 'un-nouveau-mot-de-passe-solide', userAgent: 'x', ip: null });
    if (signIn.status !== 'ok') throw new Error('connexion attendue');
    expect((await ctx.auth.verifyMfa((await ctx.auth.getSession(signIn.token))!, r.recoveryCodes[0]!)).ok).toBe(true);
    expect(await ctx.auth.recoveryCodesLeft(s.accountId)).toBe(9);
  });

  it('changement de téléphone : l’ancienne application reste valable jusqu’à confirmation de la nouvelle', async () => {
    const c = await fullSession('claire@exemple.fr');
    const login = async () => {
      const r = await ctx.auth.signIn({ email: 'claire@exemple.fr', password: PW, userAgent: 'x', ip: null });
      if (r.status !== 'ok') throw new Error('connexion attendue');
      return (await ctx.auth.getSession(r.token))!;
    };
    expect(await ctx.auth.beginTotpReplacement(c.s, 'faux')).toMatchObject({ ok: false, errors: { currentPassword: expect.any(String) } });
    const b = await ctx.auth.beginTotpReplacement(c.s, PW);
    if (!b.ok) throw new Error('début attendu');
    expect(b.uri).toContain('claire%40exemple.fr');
    const fresh = base32Decode(b.secret);
    ctx.advance(1);
    // Pendant le changement, l'ancienne application fonctionne toujours.
    expect((await ctx.auth.verifyMfa(await login(), totp(c.secret, ctx.clock.t))).ok).toBe(true);
    ctx.advance(1);
    // Un code de l'ANCIENNE application ne confirme pas la nouvelle.
    expect(await ctx.auth.confirmTotpReplacement(c.s, totp(c.secret, ctx.clock.t))).toMatchObject({ ok: false, error: expect.stringMatching(/NOUVELLE/) });
    expect(await ctx.auth.confirmTotpReplacement(c.s, totp(fresh, ctx.clock.t))).toEqual({ ok: true });
    expect(ctx.mailer.last('claire@exemple.fr')?.subject).toMatch(/nouveau téléphone/);
    expect(await ctx.auth.getSession(c.token)).not.toBeNull(); // session conservée
    ctx.advance(1);
    expect((await ctx.auth.verifyMfa(await login(), totp(c.secret, ctx.clock.t))).ok).toBe(false); // ancienne refusée
    ctx.advance(1);
    expect((await ctx.auth.verifyMfa(await login(), totp(fresh, ctx.clock.t))).ok).toBe(true); // nouvelle acceptée
    expect(await ctx.auth.recoveryCodesLeft(c.s.accountId)).toBe(10); // codes de secours intacts
    const [n] = await ctx.sql<{ n: number }[]>`SELECT count(*)::int AS n FROM mfa_factor WHERE account_id = ${c.s.accountId} AND kind = 'totp'`;
    expect(n!.n).toBe(1);
  });

  it('changement de téléphone : délai de 15 minutes pour confirmer', async () => {
    const c = await fullSession('lea@exemple.fr');
    const b = await ctx.auth.beginTotpReplacement(c.s, PW);
    if (!b.ok) throw new Error('début attendu');
    ctx.advance(16);
    expect(await ctx.auth.confirmTotpReplacement(c.s, totp(base32Decode(b.secret), ctx.clock.t))).toMatchObject({ ok: false, error: expect.stringMatching(/Délai dépassé/) });
  });
});
