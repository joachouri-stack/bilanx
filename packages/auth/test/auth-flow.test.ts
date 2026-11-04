import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { base32Decode, totp } from '../src/totp';
import { setupAuth, TEST_DB, tokenFrom } from './helpers';

const EMAIL = 'claire.test@exemple.fr';
const PASSWORD = 'cheval-agrafe-batterie';

describe.skipIf(!TEST_DB)('parcours d’authentification (PostgreSQL réel)', () => {
  let ctx: Awaited<ReturnType<typeof setupAuth>>;
  let totpSecret: Buffer;
  let recoveryCodes: string[] = [];

  beforeAll(async () => {
    ctx = await setupAuth();
  });
  afterAll(async () => {
    await ctx?.sql.end();
  });

  it('refuse une inscription invalide avec des messages par champ', async () => {
    const r = await ctx.auth.signUp({ email: 'pas-un-email', password: 'court', displayName: '', acceptHealthProcessing: false, acceptAiExtraction: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['consent', 'displayName', 'email', 'password']);
  });

  it('crée le compte, le profil personnel, les consentements et envoie la vérification', async () => {
    const r = await ctx.auth.signUp({ email: ` ${EMAIL.toUpperCase()} `, password: PASSWORD, displayName: 'Claire', acceptHealthProcessing: true, acceptAiExtraction: false });
    expect(r).toEqual({ ok: true });
    const [acc] = await ctx.sql`SELECT id, email, email_verified_at, password_hash FROM account`;
    expect(acc!.email).toBe(EMAIL);
    expect(acc!.email_verified_at).toBeNull();
    expect(String(acc!.password_hash)).toMatch(/^\$argon2id\$/);
    const access = await ctx.sql`SELECT role, legal_basis FROM profile_access WHERE account_id = ${acc!.id}`;
    expect(access).toEqual([{ role: 'owner', legal_basis: 'self' }]);
    const consents = await ctx.sql`SELECT purpose FROM consent WHERE account_id = ${acc!.id}`;
    expect(consents.map((c) => c.purpose)).toEqual(['health_data_processing']);
    // Le jeton n'est stocké que haché.
    const token = tokenFrom(ctx.mailer.last(EMAIL)?.text);
    const [stored] = await ctx.sql`SELECT token_hash FROM auth_token`;
    expect(Buffer.from(stored!.token_hash as Buffer).toString('utf8')).not.toContain(token);
  });

  it('ne révèle pas qu’une adresse est déjà inscrite', async () => {
    const before = ctx.mailer.sent.length;
    const r = await ctx.auth.signUp({ email: EMAIL, password: 'autre-phrase-longue', displayName: 'X', acceptHealthProcessing: true, acceptAiExtraction: false });
    expect(r).toEqual({ ok: true });
    expect(ctx.mailer.sent.length).toBe(before + 1);
    expect(ctx.mailer.last(EMAIL)?.subject).toContain('Tentative');
    const [n] = await ctx.sql`SELECT count(*)::int AS n FROM account`;
    expect(n!.n).toBe(1);
  });

  it('bloque la connexion tant que l’e-mail n’est pas vérifié', async () => {
    expect(await ctx.auth.signIn({ email: EMAIL, password: PASSWORD })).toEqual({ status: 'unverified' });
  });

  it('vérifie l’e-mail avec un jeton à usage unique', async () => {
    await ctx.auth.resendVerification(EMAIL);
    const token = tokenFrom(ctx.mailer.last(EMAIL)?.text);
    expect(await ctx.auth.verifyEmail('jeton-bidon')).toBe(false);
    expect(await ctx.auth.verifyEmail(token)).toBe(true);
    expect(await ctx.auth.verifyEmail(token)).toBe(false);
  });

  it('refuse un mauvais mot de passe sans distinguer un compte inexistant', async () => {
    expect(await ctx.auth.signIn({ email: EMAIL, password: 'mauvais mot de passe' })).toEqual({ status: 'invalid' });
    expect(await ctx.auth.signIn({ email: 'inconnu@exemple.fr', password: PASSWORD })).toEqual({ status: 'invalid' });
  });

  it('impose la configuration MFA à la première connexion, sans accès complet avant', async () => {
    const r = await ctx.auth.signIn({ email: EMAIL, password: PASSWORD, userAgent: 'Test/1.0', ip: '203.0.113.5' });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.next).toBe('mfa_enroll');
    const s = (await ctx.auth.getSession(r.token))!;
    expect(s.mfaPassed).toBe(false);
    expect(s.mfaEnrolled).toBe(false);
    expect(s.displayName).toBe('Claire');

    const { secret, uri } = await ctx.auth.beginTotpEnrollment(s);
    expect(uri).toContain('issuer=BILANX');
    // Un second onglet / rechargement ne change pas la clé en cours.
    expect((await ctx.auth.beginTotpEnrollment(s)).secret).toBe(secret);
    totpSecret = base32Decode(secret);
    const [f] = await ctx.sql`SELECT secret_enc FROM mfa_factor`;
    expect(Buffer.from(f!.secret_enc as Buffer).includes(totpSecret)).toBe(false); // chiffré en base

    expect((await ctx.auth.confirmTotpEnrollment(s, '000000')).ok).toBe(false);
    const ok = await ctx.auth.confirmTotpEnrollment(s, totp(totpSecret, ctx.clock.t));
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    recoveryCodes = ok.recoveryCodes;
    expect(recoveryCodes).toHaveLength(10);
    expect(new Set(recoveryCodes).size).toBe(10);
    // Jeton renouvelé : l'ancien ne vaut plus rien (anti-fixation).
    expect(await ctx.auth.getSession(r.token)).toBeNull();
    const promoted = (await ctx.auth.getSession(ok.token))!;
    expect(promoted.mfaPassed).toBe(true);
    expect(promoted.mfaEnrolled).toBe(true);
  });

  it('exige le code TOTP aux connexions suivantes et refuse le rejeu', async () => {
    ctx.advance(1);
    const r = await ctx.auth.signIn({ email: EMAIL, password: PASSWORD });
    expect(r.status === 'ok' && r.next).toBe('mfa_verify');
    if (r.status !== 'ok') return;
    const s = (await ctx.auth.getSession(r.token))!;
    const code = totp(totpSecret, ctx.clock.t);
    const ok = await ctx.auth.verifyMfa(s, code);
    expect(ok.ok).toBe(true);

    const r2 = await ctx.auth.signIn({ email: EMAIL, password: PASSWORD });
    if (r2.status !== 'ok') throw new Error('connexion attendue');
    const s2 = (await ctx.auth.getSession(r2.token))!;
    expect((await ctx.auth.verifyMfa(s2, code)).ok).toBe(false); // même code : refusé
  });

  it('accepte un code de secours une seule fois', async () => {
    ctx.advance(1);
    const r = await ctx.auth.signIn({ email: EMAIL, password: PASSWORD });
    if (r.status !== 'ok') throw new Error('connexion attendue');
    const s = (await ctx.auth.getSession(r.token))!;
    const res = await ctx.auth.verifyMfa(s, recoveryCodes[0]!.toUpperCase());
    expect(res.ok && res.recoveryCodesLeft).toBe(9);
    expect(ctx.mailer.last(EMAIL)?.subject).toContain('code de secours');

    const r2 = await ctx.auth.signIn({ email: EMAIL, password: PASSWORD });
    if (r2.status !== 'ok') throw new Error('connexion attendue');
    expect((await ctx.auth.verifyMfa((await ctx.auth.getSession(r2.token))!, recoveryCodes[0]!)).ok).toBe(false);
  });

  it('expire la session pré-MFA après 10 minutes et la session après 30 minutes d’inactivité', async () => {
    ctx.advance(1);
    const r = await ctx.auth.signIn({ email: EMAIL, password: PASSWORD });
    if (r.status !== 'ok') throw new Error('connexion attendue');
    ctx.advance(11);
    expect(await ctx.auth.getSession(r.token)).toBeNull();

    const r2 = await ctx.auth.signIn({ email: EMAIL, password: PASSWORD });
    if (r2.status !== 'ok') throw new Error('connexion attendue');
    const ok = await ctx.auth.verifyMfa((await ctx.auth.getSession(r2.token))!, totp(totpSecret, ctx.clock.t));
    if (!ok.ok) throw new Error('MFA attendue');
    ctx.advance(20);
    expect(await ctx.auth.getSession(ok.token)).not.toBeNull(); // activité → prolongation
    ctx.advance(25);
    expect(await ctx.auth.getSession(ok.token)).not.toBeNull();
    ctx.advance(31);
    expect(await ctx.auth.getSession(ok.token)).toBeNull();
  });

  it('liste et révoque les sessions, et garde l’historique des connexions', async () => {
    const [acc] = await ctx.sql`SELECT id FROM account`;
    for (let i = 0; i < 2; i++) {
      ctx.advance(1);
      const r = await ctx.auth.signIn({ email: EMAIL, password: PASSWORD, userAgent: `Appareil ${i}` });
      if (r.status !== 'ok') throw new Error('connexion attendue');
      await ctx.auth.verifyMfa((await ctx.auth.getSession(r.token))!, totp(totpSecret, ctx.clock.t));
    }
    const sessions = await ctx.auth.listSessions(acc!.id as string);
    expect(sessions).toHaveLength(2);
    const keep = sessions[0]!.id;
    await ctx.auth.revokeOtherSessions(acc!.id as string, keep);
    expect((await ctx.auth.listSessions(acc!.id as string)).map((s) => s.id)).toEqual([keep]);
    const events = await ctx.auth.listLoginEvents(acc!.id as string, 50);
    expect(events.some((e) => !e.success)).toBe(true);
    expect(events.some((e) => e.method === 'recovery_code')).toBe(true);
  });

  it('limite les tentatives de connexion (5 échecs / 15 min)', async () => {
    ctx.advance(60);
    for (let i = 0; i < 5; i++) expect((await ctx.auth.signIn({ email: EMAIL, password: `faux-${i}-xxxxxxxx` })).status).toBe('invalid');
    expect((await ctx.auth.signIn({ email: EMAIL, password: PASSWORD })).status).toBe('throttled');
    ctx.advance(16);
    expect((await ctx.auth.signIn({ email: EMAIL, password: PASSWORD })).status).toBe('ok');
  });

  it('réinitialise le mot de passe et ferme toutes les sessions', async () => {
    const r = await ctx.auth.signIn({ email: EMAIL, password: PASSWORD });
    if (r.status !== 'ok') throw new Error('connexion attendue');
    await ctx.auth.requestPasswordReset('inconnu@exemple.fr'); // aucun e-mail, aucune erreur
    await ctx.auth.requestPasswordReset(EMAIL);
    const token = tokenFrom(ctx.mailer.last(EMAIL)?.text);
    expect(await ctx.auth.resetPassword(token, 'court')).toMatchObject({ ok: false });
    expect(await ctx.auth.resetPassword(token, 'nouvelle-phrase-solide')).toEqual({ ok: true });
    expect(await ctx.auth.resetPassword(token, 'encore-une-autre-phrase')).toMatchObject({ ok: false });
    expect(await ctx.auth.getSession(r.token)).toBeNull();
    expect((await ctx.auth.signIn({ email: EMAIL, password: PASSWORD })).status).toBe('invalid');
    const r2 = await ctx.auth.signIn({ email: EMAIL, password: 'nouvelle-phrase-solide' });
    expect(r2.status === 'ok' && r2.next).toBe('mfa_verify'); // la MFA reste exigée
  });

  it('expire les liens de réinitialisation après 60 minutes', async () => {
    ctx.advance(61); // sortir de la fenêtre de limitation des demandes
    await ctx.auth.requestPasswordReset(EMAIL);
    const token = tokenFrom(ctx.mailer.last(EMAIL)?.text);
    ctx.advance(61);
    expect(await ctx.auth.resetPassword(token, 'phrase-trop-tardive')).toMatchObject({ ok: false });
  });

  it('tient un journal d’audit chaîné et non modifiable', async () => {
    const rows = await ctx.sql`SELECT action, prev_hash, row_hash FROM audit_log ORDER BY id`;
    expect(rows.map((r) => r.action)).toContain('account.created');
    expect(rows.map((r) => r.action)).toContain('account.password_reset');
    for (let i = 1; i < rows.length; i++) expect(Buffer.compare(rows[i]!.prev_hash as Buffer, rows[i - 1]!.row_hash as Buffer)).toBe(0);
    await expect(ctx.sql`UPDATE audit_log SET action = 'falsifié'`).rejects.toThrow(/ajout seul/);
    await expect(ctx.sql`DELETE FROM audit_log`).rejects.toThrow(/ajout seul/);
  });

  it('ne stocke aucune donnée sensible en clair dans la limitation des tentatives', async () => {
    const rows = await ctx.sql`SELECT key_hash FROM auth_throttle`;
    for (const r of rows) expect(Buffer.from(r.key_hash as Buffer).toString('utf8')).not.toContain('exemple.fr');
  });
});
