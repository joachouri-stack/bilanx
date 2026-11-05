import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { base32Decode, totp } from '../src/totp';
import { setupAuth, TEST_DB, tokenFrom } from './helpers';

const EMAIL = 'jo.facultatif@exemple.fr';
const PASSWORD = 'phrase-longue-sans-code';

describe.skipIf(!TEST_DB)('double authentification facultative (PostgreSQL réel)', () => {
  let ctx: Awaited<ReturnType<typeof setupAuth>>;

  beforeAll(async () => {
    ctx = await setupAuth();
    await ctx.auth.signUp({ email: EMAIL, password: PASSWORD, displayName: 'Jo', acceptHealthProcessing: true, acceptAiExtraction: false });
    expect(await ctx.auth.verifyEmail(tokenFrom(ctx.mailer.last(EMAIL)?.text))).toBe(true);
  });
  afterAll(async () => {
    await ctx?.sql.end();
  });

  it('propose la configuration, puis permet de continuer sans (choix journalisé)', async () => {
    const r = await ctx.auth.signIn({ email: EMAIL, password: PASSWORD, remember: true });
    if (r.status !== 'ok') throw new Error('connexion attendue');
    expect(r.next).toBe('mfa_enroll');
    const pending = (await ctx.auth.getSession(r.token))!;
    expect(pending.mfaPassed).toBe(false);
    const skipped = await ctx.auth.skipMfa(pending);
    if (!skipped.ok) throw new Error(skipped.error);
    expect(await ctx.auth.getSession(r.token)).toBeNull(); // nouveau jeton (anti-fixation)
    expect(await ctx.auth.getSession(skipped.token)).toMatchObject({ mfaPassed: true, mfaEnrolled: false, remember: true });
    const [a] = await ctx.sql`SELECT count(*)::int AS n FROM audit_log WHERE action = 'mfa.opted_out'`;
    expect(a!.n).toBe(1);
  });

  it('les connexions suivantes ne demandent que le mot de passe', async () => {
    const r = await ctx.auth.signIn({ email: EMAIL, password: PASSWORD });
    if (r.status !== 'ok') throw new Error('connexion attendue');
    expect(r.next).toBe('done');
    expect(await ctx.auth.getSession(r.token)).toMatchObject({ mfaPassed: true });
    // Un mauvais mot de passe reste refusé et limité.
    expect((await ctx.auth.signIn({ email: EMAIL, password: 'mauvais-mot-de-passe' })).status).toBe('invalid');
  });

  it('refuse de « passer » la double authentification d’un compte qui l’a activée', async () => {
    const r = await ctx.auth.signIn({ email: EMAIL, password: PASSWORD });
    if (r.status !== 'ok') throw new Error('connexion attendue');
    const s = (await ctx.auth.getSession(r.token))!;
    // Activation depuis Paramètres : la session est déjà complète.
    const { secret } = await ctx.auth.beginTotpEnrollment(s);
    const key = base32Decode(secret);
    const ok = await ctx.auth.confirmTotpEnrollment(s, totp(key, ctx.clock.t));
    expect(ok.ok).toBe(true);

    ctx.advance(1);
    const r2 = await ctx.auth.signIn({ email: EMAIL, password: PASSWORD });
    if (r2.status !== 'ok') throw new Error('connexion attendue');
    expect(r2.next).toBe('mfa_verify'); // le code est de nouveau demandé
    const pending = (await ctx.auth.getSession(r2.token))!;
    expect(pending.mfaPassed).toBe(false);
    expect(await ctx.auth.skipMfa(pending)).toEqual({ ok: false, error: 'La double authentification est activée sur ce compte.' });
    expect((await ctx.auth.getSession(r2.token))!.mfaPassed).toBe(false);
  });
});
