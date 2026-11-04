import { randomBytes } from 'node:crypto';
import type { Sql, TransactionSql } from '@bilanx/db';
import { decrypt, deriveKey, encrypt, hmacSha256, randomToken, safeEqual, sha256 } from './crypto';
import type { Mailer } from './mailer';
import { dummyHash, hashPassword, passwordProblems, verifyPassword } from './password';
import { base32Encode, generateTotpSecret, otpauthUri, verifyTotp } from './totp';

export const SESSION_IDLE_MINUTES = 30;
export const SESSION_ABSOLUTE_HOURS = 12;
/** Délai pour finir l'étape MFA après le mot de passe. */
export const PRE_MFA_MINUTES = 10;
export const EMAIL_TOKEN_HOURS = 24;
export const RESET_TOKEN_MINUTES = 60;
export const LOGIN_MAX_FAILURES = 5;
export const MFA_MAX_FAILURES = 5;
export const THROTTLE_WINDOW_MINUTES = 15;
export const CONSENT_VERSION = '2026-11-v1';

export interface AuthConfig {
  sql: Sql;
  mailer: Mailer;
  /** Clé maîtresse 32 octets (voir parseSecretKey). */
  secretKey: Buffer;
  /** URL publique, ex. https://bilanx.fr — utilisée dans les liens des e-mails. */
  appUrl: string;
  now?: () => Date;
}

export interface ClientInfo {
  ip?: string | null;
  userAgent?: string | null;
}

export interface SessionInfo {
  sessionId: string;
  accountId: string;
  email: string;
  emailVerified: boolean;
  mfaEnrolled: boolean;
  mfaPassed: boolean;
  profileId: string | null;
  displayName: string | null;
}

export type FieldErrors = Partial<Record<'email' | 'password' | 'displayName' | 'consent' | 'form', string>>;

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const MIN = 60_000;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createAuthService(cfg: AuthConfig) {
  const { sql, mailer } = cfg;
  const now = cfg.now ?? (() => new Date());
  const keys = {
    totp: deriveKey(cfg.secretKey, 'totp-secret'),
    recovery: deriveKey(cfg.secretKey, 'recovery-code'),
    throttle: deriveKey(cfg.secretKey, 'throttle'),
    ip: deriveKey(cfg.secretKey, 'ip'),
  };
  const link = (path: string, token: string) => `${cfg.appUrl.replace(/\/$/, '')}${path}?jeton=${encodeURIComponent(token)}`;
  const addMin = (m: number) => new Date(now().getTime() + m * MIN);
  const ipHash = (ip?: string | null) => (ip ? hmacSha256(keys.ip, ip) : null);

  // ───────────────────────── Limitation des tentatives ─────────────────────────
  const throttleKey = (scope: string, id: string) => hmacSha256(keys.throttle, `${scope}:${id}`);
  async function isThrottled(scope: string, id: string, limit: number, windowMinutes = THROTTLE_WINDOW_MINUTES) {
    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM auth_throttle
      WHERE key_hash = ${throttleKey(scope, id)} AND attempted_at > ${addMin(-windowMinutes)}`;
    return (row?.n ?? 0) >= limit;
  }
  async function recordAttempt(scope: string, id: string) {
    await sql`INSERT INTO auth_throttle (key_hash, attempted_at) VALUES (${throttleKey(scope, id)}, ${now()})`;
  }
  async function clearAttempts(scope: string, id: string) {
    await sql`DELETE FROM auth_throttle WHERE key_hash = ${throttleKey(scope, id)}`;
  }

  // ───────────────────────── Journal d'audit chaîné ─────────────────────────
  async function audit(tx: TransactionSql, e: { accountId: string | null; action: string; context?: Record<string, unknown> }) {
    await tx`SELECT pg_advisory_xact_lock(7426001)`;
    const [prev] = await tx<{ row_hash: Buffer | null }[]>`SELECT row_hash FROM audit_log ORDER BY id DESC LIMIT 1`;
    const at = now();
    const ctx = e.context ?? {};
    const payload = JSON.stringify([at.toISOString(), e.accountId, e.action, 'account', ctx]);
    const rowHash = sha256(Buffer.concat([prev?.row_hash ?? Buffer.alloc(0), Buffer.from(payload)]));
    await tx`
      INSERT INTO audit_log (occurred_at, account_id, action, resource, resource_id, context, prev_hash, row_hash)
      VALUES (${at}, ${e.accountId}, ${e.action}, 'account', ${e.accountId}, ${tx.json(ctx as never)}, ${prev?.row_hash ?? null}, ${rowHash})`;
  }

  // ───────────────────────── Jetons à usage unique ─────────────────────────
  async function issueToken(tx: TransactionSql | Sql, accountId: string, purpose: 'email_verification' | 'password_reset', minutes: number) {
    const token = randomToken();
    await tx`UPDATE auth_token SET used_at = ${now()} WHERE account_id = ${accountId} AND purpose = ${purpose} AND used_at IS NULL`;
    await tx`
      INSERT INTO auth_token (account_id, purpose, token_hash, expires_at)
      VALUES (${accountId}, ${purpose}, ${sha256(token)}, ${addMin(minutes)})`;
    return token;
  }
  async function consumeToken(tx: TransactionSql, token: string, purpose: string): Promise<string | null> {
    const [row] = await tx<{ account_id: string }[]>`
      UPDATE auth_token SET used_at = ${now()}
      WHERE token_hash = ${sha256(token)} AND purpose = ${purpose} AND used_at IS NULL AND expires_at > ${now()}
      RETURNING account_id`;
    return row?.account_id ?? null;
  }

  // ───────────────────────── Inscription ─────────────────────────
  async function signUp(input: {
    email: string;
    password: string;
    displayName: string;
    acceptHealthProcessing: boolean;
    acceptAiExtraction: boolean;
  }): Promise<{ ok: true } | { ok: false; errors: FieldErrors }> {
    const email = normalizeEmail(input.email);
    const displayName = input.displayName.trim();
    const errors: FieldErrors = {};
    if (!EMAIL_RE.test(email)) errors.email = 'Adresse e-mail invalide.';
    if (!displayName || displayName.length > 80) errors.displayName = 'Indiquez un prénom (80 caractères maximum).';
    const pw = passwordProblems(input.password, email);
    if (pw.length) errors.password = pw.join(' ');
    if (!input.acceptHealthProcessing)
      errors.consent = 'Ce consentement est nécessaire pour enregistrer des données de santé dans BILANX.';
    if (Object.keys(errors).length) return { ok: false, errors };

    // Hachage calculé dans tous les cas : temps de réponse identique, compte existant ou non.
    const passwordHash = await hashPassword(input.password);
    const [existing] = await sql<{ id: string }[]>`SELECT id FROM account WHERE email = ${email}`;
    if (existing) {
      // Réponse identique pour ne pas révéler l'existence du compte ; on prévient le titulaire.
      await mailer.send({
        to: email,
        subject: 'Tentative de création de compte BILANX',
        text: `Une inscription a été tentée avec votre adresse, qui possède déjà un compte BILANX.\n\nSi c'était vous, connectez-vous : ${cfg.appUrl}/connexion\nVous avez oublié votre mot de passe ? ${cfg.appUrl}/mot-de-passe-oublie\n\nSi ce n'était pas vous, vous pouvez ignorer ce message.`,
      });
      return { ok: true };
    }

    let token = '';
    try {
      await sql.begin(async (tx) => {
        const [acc] = await tx<{ id: string }[]>`
          INSERT INTO account (email, password_hash, password_changed_at, created_at)
          VALUES (${email}, ${passwordHash}, ${now()}, ${now()}) RETURNING id`;
        const accountId = acc!.id;
        const [prof] = await tx<{ id: string }[]>`
          INSERT INTO profile (display_name, created_by) VALUES (${displayName}, ${accountId}) RETURNING id`;
        await tx`
          INSERT INTO profile_access (profile_id, account_id, role, legal_basis, granted_by, permissions)
          VALUES (${prof!.id}, ${accountId}, 'owner', 'self', ${accountId}, ${tx.json({ all: 'rw' })})`;
        await tx`
          INSERT INTO consent (account_id, profile_id, purpose, version, given_at)
          VALUES (${accountId}, ${prof!.id}, 'health_data_processing', ${CONSENT_VERSION}, ${now()})`;
        if (input.acceptAiExtraction) {
          await tx`
            INSERT INTO consent (account_id, profile_id, purpose, version, given_at)
            VALUES (${accountId}, ${prof!.id}, 'ai_extraction', ${CONSENT_VERSION}, ${now()})`;
        }
        token = await issueToken(tx, accountId, 'email_verification', EMAIL_TOKEN_HOURS * 60);
        await audit(tx, { accountId, action: 'account.created', context: { aiExtractionConsent: input.acceptAiExtraction } });
      });
    } catch (e) {
      // Course entre deux inscriptions simultanées sur la même adresse.
      if ((e as { code?: string }).code === '23505') return { ok: true };
      throw e;
    }
    await mailer.send({
      to: email,
      subject: 'Confirmez votre adresse e-mail BILANX',
      text: `Bienvenue sur BILANX.\n\nConfirmez votre adresse en ouvrant ce lien (valable ${EMAIL_TOKEN_HOURS} h) :\n${link('/verifier-email', token)}\n\nSi vous n'êtes pas à l'origine de cette inscription, ignorez ce message.`,
    });
    return { ok: true };
  }

  async function verifyEmail(token: string): Promise<boolean> {
    return sql.begin(async (tx) => {
      const accountId = await consumeToken(tx, token, 'email_verification');
      if (!accountId) return false;
      await tx`UPDATE account SET email_verified_at = COALESCE(email_verified_at, ${now()}) WHERE id = ${accountId}`;
      await audit(tx, { accountId, action: 'account.email_verified' });
      return true;
    });
  }

  async function resendVerification(rawEmail: string): Promise<void> {
    const email = normalizeEmail(rawEmail);
    if (await isThrottled('resend', email, 3, 60)) return;
    await recordAttempt('resend', email);
    const [acc] = await sql<{ id: string }[]>`
      SELECT id FROM account WHERE email = ${email} AND email_verified_at IS NULL AND deleted_at IS NULL`;
    if (!acc) return;
    const token = await issueToken(sql, acc.id, 'email_verification', EMAIL_TOKEN_HOURS * 60);
    await mailer.send({
      to: email,
      subject: 'Confirmez votre adresse e-mail BILANX',
      text: `Voici un nouveau lien de confirmation (valable ${EMAIL_TOKEN_HOURS} h) :\n${link('/verifier-email', token)}`,
    });
  }

  // ───────────────────────── Connexion ─────────────────────────
  type SignInResult =
    | { status: 'ok'; token: string; next: 'mfa_verify' | 'mfa_enroll' }
    | { status: 'invalid' }
    | { status: 'throttled' }
    | { status: 'unverified' };

  async function signIn(input: { email: string; password: string } & ClientInfo): Promise<SignInResult> {
    const email = normalizeEmail(input.email);
    if (await isThrottled('login', email, LOGIN_MAX_FAILURES)) return { status: 'throttled' };

    const [acc] = await sql<{ id: string; password_hash: string | null; email_verified_at: Date | null }[]>`
      SELECT id, password_hash, email_verified_at FROM account WHERE email = ${email} AND deleted_at IS NULL`;
    const ok = acc?.password_hash ? await verifyPassword(acc.password_hash, input.password) : (await verifyPassword(await dummyHash(), input.password), false);
    if (!acc || !ok) {
      await recordAttempt('login', email);
      if (acc) await sql`INSERT INTO login_event (account_id, success, method, user_agent, occurred_at) VALUES (${acc.id}, false, 'password', ${input.userAgent ?? null}, ${now()})`;
      return { status: 'invalid' };
    }
    if (!acc.email_verified_at) return { status: 'unverified' };
    await clearAttempts('login', email);

    const token = randomToken();
    const [mfa] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM mfa_factor WHERE account_id = ${acc.id} AND kind = 'totp' AND confirmed_at IS NOT NULL`;
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO session (account_id, token_hash, mfa_passed, ip_hash, user_agent, created_at, last_seen_at, expires_at, absolute_expires_at)
        VALUES (${acc.id}, ${sha256(token)}, false, ${ipHash(input.ip)}, ${input.userAgent ?? null}, ${now()}, ${now()},
                ${addMin(PRE_MFA_MINUTES)}, ${addMin(SESSION_ABSOLUTE_HOURS * 60)})`;
      await tx`INSERT INTO login_event (account_id, success, method, user_agent, occurred_at) VALUES (${acc.id}, true, 'password', ${input.userAgent ?? null}, ${now()})`;
      await audit(tx, { accountId: acc.id, action: 'session.password_ok' });
    });
    return { status: 'ok', token, next: (mfa?.n ?? 0) > 0 ? 'mfa_verify' : 'mfa_enroll' };
  }

  async function getSession(token: string | undefined | null): Promise<SessionInfo | null> {
    if (!token) return null;
    const at = now();
    const [row] = await sql<
      {
        session_id: string;
        account_id: string;
        email: string;
        email_verified_at: Date | null;
        mfa_passed: boolean;
        last_seen_at: Date;
        absolute_expires_at: Date;
        mfa_enrolled: boolean;
        profile_id: string | null;
        display_name: string | null;
      }[]
    >`
      SELECT s.id AS session_id, a.id AS account_id, a.email, a.email_verified_at, s.mfa_passed, s.last_seen_at,
             s.absolute_expires_at,
             EXISTS (SELECT 1 FROM mfa_factor f WHERE f.account_id = a.id AND f.kind = 'totp' AND f.confirmed_at IS NOT NULL) AS mfa_enrolled,
             p.id AS profile_id, p.display_name
      FROM session s
      JOIN account a ON a.id = s.account_id AND a.deleted_at IS NULL
      LEFT JOIN LATERAL (
        SELECT p.id, p.display_name FROM profile_access pa JOIN profile p ON p.id = pa.profile_id
        WHERE pa.account_id = a.id AND pa.role = 'owner' AND pa.legal_basis = 'self' AND pa.revoked_at IS NULL AND p.deleted_at IS NULL
        ORDER BY pa.granted_at LIMIT 1
      ) p ON true
      WHERE s.token_hash = ${sha256(token)} AND s.revoked_at IS NULL AND s.expires_at > ${at} AND s.absolute_expires_at > ${at}`;
    if (!row) return null;
    // Expiration glissante (uniquement après MFA), rafraîchie au plus une fois par minute.
    if (row.mfa_passed && at.getTime() - row.last_seen_at.getTime() > MIN) {
      const idle = new Date(Math.min(at.getTime() + SESSION_IDLE_MINUTES * MIN, row.absolute_expires_at.getTime()));
      await sql`UPDATE session SET last_seen_at = ${at}, expires_at = ${idle} WHERE id = ${row.session_id}`;
    }
    return {
      sessionId: row.session_id,
      accountId: row.account_id,
      email: row.email,
      emailVerified: !!row.email_verified_at,
      mfaEnrolled: row.mfa_enrolled,
      mfaPassed: row.mfa_passed,
      profileId: row.profile_id,
      displayName: row.display_name,
    };
  }

  /** Après MFA : nouveau jeton (anti-fixation) et expiration de session normale. */
  async function promoteSession(tx: TransactionSql, sessionId: string): Promise<string> {
    const token = randomToken();
    await tx`
      UPDATE session SET token_hash = ${sha256(token)}, mfa_passed = true, mfa_passed_at = ${now()},
             last_seen_at = ${now()}, expires_at = LEAST(${addMin(SESSION_IDLE_MINUTES)}, absolute_expires_at)
      WHERE id = ${sessionId}`;
    return token;
  }

  // ───────────────────────── MFA (TOTP + codes de secours) ─────────────────────────
  async function beginTotpEnrollment(session: SessionInfo): Promise<{ secret: string; uri: string }> {
    if (session.mfaEnrolled) throw new Error('La double authentification est déjà configurée.');
    // Réutilise un enrôlement récent non terminé (plusieurs onglets, rechargement de page).
    const [pending] = await sql<{ secret_enc: Buffer }[]>`
      SELECT secret_enc FROM mfa_factor
      WHERE account_id = ${session.accountId} AND kind = 'totp' AND confirmed_at IS NULL AND created_at > ${addMin(-PRE_MFA_MINUTES)}
      ORDER BY created_at DESC LIMIT 1`;
    if (pending) {
      const existing = decrypt(keys.totp, pending.secret_enc, session.accountId);
      return { secret: base32Encode(existing), uri: otpauthUri(existing, session.email) };
    }
    const secret = generateTotpSecret();
    await sql.begin(async (tx) => {
      await tx`DELETE FROM mfa_factor WHERE account_id = ${session.accountId} AND kind = 'totp' AND confirmed_at IS NULL`;
      await tx`
        INSERT INTO mfa_factor (account_id, kind, secret_enc, label, created_at)
        VALUES (${session.accountId}, 'totp', ${encrypt(keys.totp, secret, session.accountId)}, 'Application d’authentification', ${now()})`;
    });
    return { secret: base32Encode(secret), uri: otpauthUri(secret, session.email) };
  }

  function newRecoveryCodes(): string[] {
    const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
    return Array.from({ length: 10 }, () => {
      let s = '';
      // 248 = 8 × 31 : rejet des octets ≥ 248 pour éviter le biais du modulo.
      while (s.length < 10) for (const b of randomBytes(16)) if (b < 248 && s.length < 10) s += alphabet[b % alphabet.length];
      return `${s.slice(0, 5)}-${s.slice(5, 10)}`;
    });
  }
  const recoveryHash = (code: string) => hmacSha256(keys.recovery, code.toLowerCase().replace(/[^a-z0-9]/g, ''));

  async function confirmTotpEnrollment(
    session: SessionInfo,
    code: string,
  ): Promise<{ ok: true; token: string; recoveryCodes: string[] } | { ok: false; error: string }> {
    if (await isThrottled('mfa', session.accountId, MFA_MAX_FAILURES)) return { ok: false, error: 'Trop de tentatives. Réessayez dans 15 minutes.' };
    const [f] = await sql<{ id: string; secret_enc: Buffer }[]>`
      SELECT id, secret_enc FROM mfa_factor WHERE account_id = ${session.accountId} AND kind = 'totp' AND confirmed_at IS NULL
      ORDER BY created_at DESC LIMIT 1`;
    if (!f) return { ok: false, error: 'Configuration expirée : recommencez.' };
    const step = verifyTotp(decrypt(keys.totp, f.secret_enc, session.accountId), code, now(), null);
    if (step === null) {
      await recordAttempt('mfa', session.accountId);
      return { ok: false, error: 'Code incorrect. Vérifiez l’heure de votre téléphone et réessayez.' };
    }
    const codes = newRecoveryCodes();
    const token = await sql.begin(async (tx) => {
      await tx`UPDATE mfa_factor SET confirmed_at = ${now()}, last_used_step = ${step}, last_used_at = ${now()} WHERE id = ${f.id}`;
      await tx`DELETE FROM mfa_recovery_code WHERE account_id = ${session.accountId}`;
      for (const c of codes) await tx`INSERT INTO mfa_recovery_code (account_id, code_hash) VALUES (${session.accountId}, ${recoveryHash(c)})`;
      await tx`INSERT INTO login_event (account_id, success, method, occurred_at) VALUES (${session.accountId}, true, 'totp', ${now()})`;
      await audit(tx, { accountId: session.accountId, action: 'mfa.totp_enrolled' });
      return promoteSession(tx, session.sessionId);
    });
    await clearAttempts('mfa', session.accountId);
    await mailer.send({
      to: session.email,
      subject: 'Double authentification activée sur BILANX',
      text: `La double authentification vient d'être activée sur votre compte.\nSi ce n'est pas vous, réinitialisez immédiatement votre mot de passe : ${cfg.appUrl}/mot-de-passe-oublie`,
    });
    return { ok: true, token, recoveryCodes: codes };
  }

  async function verifyMfa(
    session: SessionInfo,
    code: string,
  ): Promise<{ ok: true; token: string; usedRecoveryCode: boolean; recoveryCodesLeft: number } | { ok: false; error: string }> {
    if (await isThrottled('mfa', session.accountId, MFA_MAX_FAILURES)) return { ok: false, error: 'Trop de tentatives. Réessayez dans 15 minutes.' };
    const trimmed = code.trim();
    let method: 'totp' | 'recovery_code' | null = null;

    if (/^\d{3}\s?\d{3}$/.test(trimmed)) {
      const [f] = await sql<{ id: string; secret_enc: Buffer; last_used_step: string | null }[]>`
        SELECT id, secret_enc, last_used_step FROM mfa_factor
        WHERE account_id = ${session.accountId} AND kind = 'totp' AND confirmed_at IS NOT NULL LIMIT 1`;
      if (f) {
        const last = f.last_used_step === null ? null : Number(f.last_used_step);
        const step = verifyTotp(decrypt(keys.totp, f.secret_enc, session.accountId), trimmed, now(), last);
        if (step !== null) {
          // Mise à jour conditionnelle : un même code ne peut pas servir deux fois, même en parallèle.
          const upd = await sql`
            UPDATE mfa_factor SET last_used_step = ${step}, last_used_at = ${now()}
            WHERE id = ${f.id} AND (last_used_step IS NULL OR last_used_step < ${step}) RETURNING id`;
          if (upd.length) method = 'totp';
        }
      }
    } else {
      const h = recoveryHash(trimmed);
      const rows = await sql<{ id: string; code_hash: Buffer }[]>`
        SELECT id, code_hash FROM mfa_recovery_code WHERE account_id = ${session.accountId} AND used_at IS NULL`;
      const match = rows.find((r) => safeEqual(r.code_hash, h));
      if (match) {
        const upd = await sql`UPDATE mfa_recovery_code SET used_at = ${now()} WHERE id = ${match.id} AND used_at IS NULL RETURNING id`;
        if (upd.length) method = 'recovery_code';
      }
    }

    if (!method) {
      await recordAttempt('mfa', session.accountId);
      await sql`INSERT INTO login_event (account_id, success, method, occurred_at) VALUES (${session.accountId}, false, 'mfa', ${now()})`;
      return { ok: false, error: 'Code incorrect.' };
    }
    const token = await sql.begin(async (tx) => {
      await tx`INSERT INTO login_event (account_id, success, method, occurred_at) VALUES (${session.accountId}, true, ${method}, ${now()})`;
      await audit(tx, { accountId: session.accountId, action: `mfa.${method}_ok` });
      return promoteSession(tx, session.sessionId);
    });
    await clearAttempts('mfa', session.accountId);
    const [left] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM mfa_recovery_code WHERE account_id = ${session.accountId} AND used_at IS NULL`;
    if (method === 'recovery_code') {
      await mailer.send({
        to: session.email,
        subject: 'Un code de secours BILANX a été utilisé',
        text: `Un code de secours vient d'être utilisé pour vous connecter. Il vous en reste ${left?.n ?? 0}.\nSi ce n'est pas vous, réinitialisez votre mot de passe : ${cfg.appUrl}/mot-de-passe-oublie`,
      });
    }
    return { ok: true, token, usedRecoveryCode: method === 'recovery_code', recoveryCodesLeft: left?.n ?? 0 };
  }

  // ───────────────────────── Sessions & historique ─────────────────────────
  async function signOut(token: string | undefined | null): Promise<void> {
    if (!token) return;
    await sql`UPDATE session SET revoked_at = ${now()} WHERE token_hash = ${sha256(token)} AND revoked_at IS NULL`;
  }

  async function listSessions(accountId: string) {
    return sql<{ id: string; created_at: Date; last_seen_at: Date; user_agent: string | null; mfa_passed: boolean }[]>`
      SELECT id, created_at, last_seen_at, user_agent, mfa_passed FROM session
      WHERE account_id = ${accountId} AND revoked_at IS NULL AND expires_at > ${now()} AND absolute_expires_at > ${now()}
      ORDER BY last_seen_at DESC`;
  }

  async function revokeSession(accountId: string, sessionId: string): Promise<boolean> {
    const r = await sql`UPDATE session SET revoked_at = ${now()} WHERE id = ${sessionId} AND account_id = ${accountId} AND revoked_at IS NULL RETURNING id`;
    return r.length > 0;
  }

  async function revokeOtherSessions(accountId: string, keepSessionId: string): Promise<number> {
    const r = await sql`UPDATE session SET revoked_at = ${now()} WHERE account_id = ${accountId} AND id <> ${keepSessionId} AND revoked_at IS NULL RETURNING id`;
    return r.length;
  }

  async function listLoginEvents(accountId: string, limit = 20) {
    return sql<{ success: boolean; method: string; user_agent: string | null; occurred_at: Date }[]>`
      SELECT success, method, user_agent, occurred_at FROM login_event WHERE account_id = ${accountId}
      ORDER BY occurred_at DESC, id DESC LIMIT ${limit}`;
  }

  // ───────────────────────── Mot de passe oublié ─────────────────────────
  async function requestPasswordReset(rawEmail: string): Promise<void> {
    const email = normalizeEmail(rawEmail);
    if (await isThrottled('reset', email, 3, 60)) return;
    await recordAttempt('reset', email);
    const [acc] = await sql<{ id: string }[]>`SELECT id FROM account WHERE email = ${email} AND deleted_at IS NULL`;
    if (!acc) return; // même réponse côté interface
    const token = await issueToken(sql, acc.id, 'password_reset', RESET_TOKEN_MINUTES);
    await mailer.send({
      to: email,
      subject: 'Réinitialisation de votre mot de passe BILANX',
      text: `Pour choisir un nouveau mot de passe, ouvrez ce lien (valable ${RESET_TOKEN_MINUTES} min) :\n${link('/reinitialiser', token)}\n\nLa double authentification restera demandée à la prochaine connexion.\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
    });
  }

  async function resetPassword(token: string, newPassword: string): Promise<{ ok: true } | { ok: false; error: string }> {
    // Contrôle du mot de passe avant de consommer le jeton.
    const [peek] = await sql<{ email: string }[]>`
      SELECT a.email FROM auth_token t JOIN account a ON a.id = t.account_id
      WHERE t.token_hash = ${sha256(token)} AND t.purpose = 'password_reset' AND t.used_at IS NULL AND t.expires_at > ${now()}`;
    if (!peek) return { ok: false, error: 'Ce lien est invalide ou a expiré. Faites une nouvelle demande.' };
    const problems = passwordProblems(newPassword, peek.email);
    if (problems.length) return { ok: false, error: problems.join(' ') };
    const hash = await hashPassword(newPassword);
    const accountId = await sql.begin(async (tx) => {
      const id = await consumeToken(tx, token, 'password_reset');
      if (!id) return null;
      await tx`UPDATE account SET password_hash = ${hash}, password_changed_at = ${now()} WHERE id = ${id}`;
      // Toutes les sessions existantes sont révoquées.
      await tx`UPDATE session SET revoked_at = ${now()} WHERE account_id = ${id} AND revoked_at IS NULL`;
      await audit(tx, { accountId: id, action: 'account.password_reset' });
      return id;
    });
    if (!accountId) return { ok: false, error: 'Ce lien est invalide ou a expiré. Faites une nouvelle demande.' };
    await clearAttempts('login', peek.email);
    await mailer.send({
      to: peek.email,
      subject: 'Votre mot de passe BILANX a été modifié',
      text: `Votre mot de passe vient d'être modifié et toutes vos sessions ont été fermées.\nSi vous n'êtes pas à l'origine de ce changement, contactez-nous immédiatement.`,
    });
    return { ok: true };
  }

  return {
    signUp,
    verifyEmail,
    resendVerification,
    signIn,
    getSession,
    beginTotpEnrollment,
    confirmTotpEnrollment,
    verifyMfa,
    signOut,
    listSessions,
    revokeSession,
    revokeOtherSessions,
    listLoginEvents,
    requestPasswordReset,
    resetPassword,
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
