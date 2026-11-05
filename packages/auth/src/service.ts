import { randomBytes } from 'node:crypto';
import type { Sql, TransactionSql } from '@bilanx/db';
import { decrypt, deriveKey, encrypt, hmacSha256, randomToken, safeEqual, sha256 } from './crypto';
import { writeAudit, type AuditEntry } from './audit';
import type { Mailer } from './mailer';
import { dummyHash, hashPassword, passwordProblems, verifyPassword } from './password';
import { maskEmail } from './mailer';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { base32Encode, generateTotpSecret, otpauthUri, verifyTotp } from './totp';

export const SESSION_IDLE_MINUTES = 30;
export const SESSION_ABSOLUTE_HOURS = 12;
/** « Rester connecté sur cet appareil » : 90 jours sans utilisation, un an au plus. */
export const REMEMBERED_IDLE_DAYS = 90;
export const REMEMBERED_ABSOLUTE_DAYS = 365;
/** Durée de vie maximale d'une session (et du cookie correspondant). */
export const sessionLifetimeMinutes = (remember: boolean) => (remember ? REMEMBERED_ABSOLUTE_DAYS * 24 * 60 : SESSION_ABSOLUTE_HOURS * 60);
const idleMinutes = (remember: boolean) => (remember ? REMEMBERED_IDLE_DAYS * 24 * 60 : SESSION_IDLE_MINUTES);
/** Délai pour finir l'étape MFA après le mot de passe. */
export const PRE_MFA_MINUTES = 10;
export const EMAIL_TOKEN_HOURS = 24;
export const RESET_TOKEN_MINUTES = 60;
export const LOGIN_MAX_FAILURES = 5;
export const MFA_MAX_FAILURES = 5;
/** Vérifications du mot de passe actuel (changement de mot de passe, d'e-mail, codes de secours). */
export const REAUTH_MAX_FAILURES = 5;
export const EMAIL_CHANGE_TOKEN_HOURS = 24;
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
  /** Session mémorisée sur cet appareil (« Rester connecté »). */
  remember: boolean;
  profileId: string | null;
  displayName: string | null;
}

export type FieldErrors = Partial<Record<'email' | 'password' | 'currentPassword' | 'displayName' | 'consent' | 'form', string>>;

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
    passkey: deriveKey(cfg.secretKey, 'passkey-public-key'),
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
  const audit = (tx: TransactionSql, e: AuditEntry) => writeAudit(tx, now(), e);

  // ───────────────────────── Jetons à usage unique ─────────────────────────
  async function issueToken(
    tx: TransactionSql | Sql,
    accountId: string,
    purpose: 'email_verification' | 'password_reset' | 'email_change',
    minutes: number,
    newEmail: string | null = null,
  ) {
    const token = randomToken();
    await tx`UPDATE auth_token SET used_at = ${now()} WHERE account_id = ${accountId} AND purpose = ${purpose} AND used_at IS NULL`;
    await tx`
      INSERT INTO auth_token (account_id, purpose, token_hash, expires_at, new_email)
      VALUES (${accountId}, ${purpose}, ${sha256(token)}, ${addMin(minutes)}, ${newEmail})`;
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
          INSERT INTO profile (display_name, created_by, relationship) VALUES (${displayName}, ${accountId}, 'self') RETURNING id`;
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
    | { status: 'ok'; token: string; next: 'mfa_verify' | 'mfa_enroll' | 'done' }
    | { status: 'invalid' }
    | { status: 'throttled' }
    | { status: 'unverified' };

  async function signIn(input: { email: string; password: string; remember?: boolean } & ClientInfo): Promise<SignInResult> {
    const email = normalizeEmail(input.email);
    if (await isThrottled('login', email, LOGIN_MAX_FAILURES)) return { status: 'throttled' };

    const [acc] = await sql<{ id: string; password_hash: string | null; email_verified_at: Date | null; mfa_opted_out_at: Date | null }[]>`
      SELECT id, password_hash, email_verified_at, mfa_opted_out_at FROM account WHERE email = ${email} AND deleted_at IS NULL`;
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
    const enrolled = (mfa?.n ?? 0) > 0;
    // Sans double authentification, par choix explicite de l'utilisateur : session complète dès le mot de passe.
    const direct = !enrolled && !!acc.mfa_opted_out_at;
    const remember = !!input.remember;
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO session (account_id, token_hash, mfa_passed, mfa_passed_at, remember, ip_hash, user_agent, created_at, last_seen_at, expires_at, absolute_expires_at)
        VALUES (${acc.id}, ${sha256(token)}, ${direct}, ${direct ? now() : null}, ${remember}, ${ipHash(input.ip)}, ${input.userAgent ?? null}, ${now()}, ${now()},
                ${addMin(direct ? idleMinutes(remember) : PRE_MFA_MINUTES)}, ${addMin(sessionLifetimeMinutes(remember))})`;
      await tx`INSERT INTO login_event (account_id, success, method, user_agent, occurred_at) VALUES (${acc.id}, true, 'password', ${input.userAgent ?? null}, ${now()})`;
      await audit(tx, { accountId: acc.id, action: direct ? 'session.password_only_ok' : 'session.password_ok' });
    });
    return { status: 'ok', token, next: direct ? 'done' : enrolled ? 'mfa_verify' : 'mfa_enroll' };
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
        remember: boolean;
        last_seen_at: Date;
        absolute_expires_at: Date;
        mfa_enrolled: boolean;
        profile_id: string | null;
        display_name: string | null;
      }[]
    >`
      SELECT s.id AS session_id, a.id AS account_id, a.email, a.email_verified_at, s.mfa_passed, s.remember, s.last_seen_at,
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
      const idle = new Date(Math.min(at.getTime() + idleMinutes(row.remember) * MIN, row.absolute_expires_at.getTime()));
      await sql`UPDATE session SET last_seen_at = ${at}, expires_at = ${idle} WHERE id = ${row.session_id}`;
    }
    return {
      sessionId: row.session_id,
      accountId: row.account_id,
      email: row.email,
      emailVerified: !!row.email_verified_at,
      mfaEnrolled: row.mfa_enrolled,
      mfaPassed: row.mfa_passed,
      remember: row.remember,
      profileId: row.profile_id,
      displayName: row.display_name,
    };
  }

  /** Après MFA : nouveau jeton (anti-fixation) et expiration de session normale. */
  async function promoteSession(tx: TransactionSql, sessionId: string): Promise<string> {
    const token = randomToken();
    await tx`
      UPDATE session SET token_hash = ${sha256(token)}, mfa_passed = true, mfa_passed_at = ${now()}, last_seen_at = ${now()},
             expires_at = LEAST(CASE WHEN remember THEN ${addMin(idleMinutes(true))}::timestamptz ELSE ${addMin(idleMinutes(false))}::timestamptz END, absolute_expires_at)
      WHERE id = ${sessionId}`;
    return token;
  }

  /**
   * « Continuer sans double authentification » : choix explicite, uniquement pour un compte qui n'en a pas.
   * Les connexions suivantes ne demanderont que le mot de passe ; activable à tout moment dans Paramètres.
   */
  async function skipMfa(session: SessionInfo): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
    if (session.mfaEnrolled) return { ok: false, error: 'La double authentification est activée sur ce compte.' };
    if (session.mfaPassed) return { ok: false, error: 'Session déjà ouverte.' };
    const token = await sql.begin(async (tx) => {
      await tx`UPDATE account SET mfa_opted_out_at = ${now()} WHERE id = ${session.accountId}`;
      await tx`DELETE FROM mfa_factor WHERE account_id = ${session.accountId} AND kind = 'totp' AND confirmed_at IS NULL`;
      await audit(tx, { accountId: session.accountId, action: 'mfa.opted_out' });
      return promoteSession(tx, session.sessionId);
    });
    return { ok: true, token };
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
      await tx`UPDATE account SET mfa_opted_out_at = NULL WHERE id = ${session.accountId}`;
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

  // ───────────────────────── Compte : changements depuis une session ─────────────────────────
  type Reauth = { ok: true; email: string } | { ok: false; errors: FieldErrors };
  /** Vérifie le mot de passe actuel (session complète exigée, tentatives limitées). */
  async function reauthenticate(session: SessionInfo, password: string): Promise<Reauth> {
    if (!session.mfaPassed) return { ok: false, errors: { form: 'Session incomplète : reconnectez-vous.' } };
    if (await isThrottled('reauth', session.accountId, REAUTH_MAX_FAILURES)) return { ok: false, errors: { form: 'Trop de tentatives. Réessayez dans 15 minutes.' } };
    const [acc] = await sql<{ email: string; password_hash: string | null }[]>`
      SELECT email, password_hash FROM account WHERE id = ${session.accountId} AND deleted_at IS NULL`;
    if (!acc?.password_hash || !(await verifyPassword(acc.password_hash, password))) {
      await recordAttempt('reauth', session.accountId);
      return { ok: false, errors: { currentPassword: 'Mot de passe actuel incorrect.' } };
    }
    await clearAttempts('reauth', session.accountId);
    return { ok: true, email: acc.email };
  }

  /** Nouveau mot de passe : les autres sessions sont fermées, un e-mail prévient le titulaire. */
  async function changePassword(session: SessionInfo, currentPassword: string, newPassword: string): Promise<{ ok: true; closedSessions: number } | { ok: false; errors: FieldErrors }> {
    const r = await reauthenticate(session, currentPassword);
    if (!r.ok) return r;
    const problems = passwordProblems(newPassword, r.email);
    if (problems.length) return { ok: false, errors: { password: problems.join(' ') } };
    if (newPassword === currentPassword) return { ok: false, errors: { password: 'Choisissez un mot de passe différent de l’actuel.' } };
    const hash = await hashPassword(newPassword);
    const closed = await sql.begin(async (tx) => {
      await tx`UPDATE account SET password_hash = ${hash}, password_changed_at = ${now()} WHERE id = ${session.accountId}`;
      const c = await tx`UPDATE session SET revoked_at = ${now()} WHERE account_id = ${session.accountId} AND id <> ${session.sessionId} AND revoked_at IS NULL RETURNING id`;
      await audit(tx, { accountId: session.accountId, action: 'account.password_changed', context: { closedSessions: c.length } });
      return c.length;
    });
    await mailer.send({
      to: r.email,
      subject: 'Votre mot de passe BILANX a été modifié',
      text: `Le mot de passe de votre compte vient d'être modifié depuis les paramètres${closed ? ` ; ${closed} autre(s) appareil(s) ont été déconnectés` : ''}.\n\nSi vous n'êtes pas à l'origine de ce changement, réinitialisez immédiatement votre mot de passe : ${cfg.appUrl}/mot-de-passe-oublie`,
    });
    return { ok: true, closedSessions: closed };
  }

  /**
   * Changement d'adresse : lien de confirmation envoyé à la NOUVELLE adresse. Réponse identique si
   * l'adresse est déjà prise (le titulaire de celle-ci est simplement prévenu) : pas de révélation de compte.
   */
  async function requestEmailChange(session: SessionInfo, currentPassword: string, rawNewEmail: string): Promise<{ ok: true; sentTo: string } | { ok: false; errors: FieldErrors }> {
    const newEmail = normalizeEmail(rawNewEmail);
    if (!EMAIL_RE.test(newEmail)) return { ok: false, errors: { email: 'Adresse e-mail invalide.' } };
    const r = await reauthenticate(session, currentPassword);
    if (!r.ok) return r;
    if (newEmail === r.email) return { ok: false, errors: { email: 'C’est déjà l’adresse de votre compte.' } };
    if (await isThrottled('email_change', session.accountId, 3, 60)) return { ok: false, errors: { form: 'Trop de demandes. Réessayez dans une heure.' } };
    await recordAttempt('email_change', session.accountId);
    const [taken] = await sql<{ id: string }[]>`SELECT id FROM account WHERE email = ${newEmail}`;
    if (taken) {
      await mailer.send({
        to: newEmail,
        subject: 'Tentative d’association de votre adresse à un compte BILANX',
        text: `Quelqu'un a demandé à utiliser votre adresse pour un autre compte BILANX. Votre adresse étant déjà liée à un compte, rien n'a été modifié.\n\nSi vous n'êtes au courant de rien, vous pouvez ignorer ce message.`,
      });
      return { ok: true, sentTo: newEmail };
    }
    const token = await sql.begin(async (tx) => {
      const t = await issueToken(tx, session.accountId, 'email_change', EMAIL_CHANGE_TOKEN_HOURS * 60, newEmail);
      await audit(tx, { accountId: session.accountId, action: 'account.email_change_requested' });
      return t;
    });
    await mailer.send({
      to: newEmail,
      subject: 'Confirmez votre nouvelle adresse e-mail BILANX',
      text: `Pour utiliser cette adresse avec votre compte BILANX, ouvrez ce lien (valable ${EMAIL_CHANGE_TOKEN_HOURS} h) :\n${link('/changer-email', token)}\n\nTant que vous ne l'avez pas ouvert, votre ancienne adresse reste active. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
    });
    return { ok: true, sentTo: newEmail };
  }

  /** Confirmation depuis le lien reçu : la nouvelle adresse remplace l'ancienne, qui est prévenue. */
  async function confirmEmailChange(token: string): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
    const invalid = { ok: false as const, error: 'Ce lien est invalide ou a expiré. Refaites la demande depuis les paramètres.' };
    let previous = '';
    let next = '';
    try {
      const done = await sql.begin(async (tx) => {
        const [row] = await tx<{ account_id: string; new_email: string }[]>`
          UPDATE auth_token SET used_at = ${now()}
          WHERE token_hash = ${sha256(token)} AND purpose = 'email_change' AND used_at IS NULL AND expires_at > ${now()}
          RETURNING account_id, new_email`;
        if (!row) return false;
        const [acc] = await tx<{ email: string }[]>`SELECT email FROM account WHERE id = ${row.account_id} AND deleted_at IS NULL FOR UPDATE`;
        if (!acc) return false;
        previous = acc.email;
        next = row.new_email;
        await tx`UPDATE account SET email = ${next}, email_verified_at = ${now()} WHERE id = ${row.account_id}`;
        await audit(tx, { accountId: row.account_id, action: 'account.email_changed' });
        return true;
      });
      if (!done) return invalid;
    } catch (e) {
      // Adresse prise entre la demande et la confirmation.
      if ((e as { code?: string }).code === '23505') return { ok: false, error: 'Cette adresse est désormais utilisée par un autre compte : rien n’a été modifié.' };
      throw e;
    }
    await mailer.send({
      to: previous,
      subject: 'L’adresse e-mail de votre compte BILANX a été modifiée',
      text: `Votre compte BILANX utilise désormais une autre adresse e-mail (${maskEmail(next)}). Les prochains messages y seront envoyés.\n\nSi vous n'êtes pas à l'origine de ce changement, répondez immédiatement à ce message ou contactez le support : votre compte a pu être compromis.`,
    });
    return { ok: true, email: next };
  }

  /** Nouveaux codes de secours (les anciens deviennent inutilisables). */
  async function regenerateRecoveryCodes(session: SessionInfo, currentPassword: string): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false; errors: FieldErrors }> {
    const r = await reauthenticate(session, currentPassword);
    if (!r.ok) return r;
    const codes = newRecoveryCodes();
    await sql.begin(async (tx) => {
      await tx`DELETE FROM mfa_recovery_code WHERE account_id = ${session.accountId}`;
      for (const c of codes) await tx`INSERT INTO mfa_recovery_code (account_id, code_hash) VALUES (${session.accountId}, ${recoveryHash(c)})`;
      await audit(tx, { accountId: session.accountId, action: 'mfa.recovery_codes_regenerated' });
    });
    await mailer.send({
      to: r.email,
      subject: 'Nouveaux codes de secours BILANX',
      text: `De nouveaux codes de secours viennent d'être générés ; les précédents ne fonctionnent plus.\nSi vous n'êtes pas à l'origine de cette action, réinitialisez immédiatement votre mot de passe : ${cfg.appUrl}/mot-de-passe-oublie`,
    });
    return { ok: true, recoveryCodes: codes };
  }

  // ───────────────────────── Clés d'accès (passkeys, WebAuthn) ─────────────────────────
  // Le domaine et l'origine viennent de l'URL publique : une clé ne fonctionne que sur le vrai site
  // (protection contre l'hameçonnage).
  const appOrigin = new URL(cfg.appUrl).origin;
  const rpID = new URL(cfg.appUrl).hostname;
  const CHALLENGE_MINUTES = 5;

  async function storeChallenge(purpose: 'register' | 'login', accountId: string | null, challenge: string): Promise<string> {
    await sql`DELETE FROM webauthn_challenge WHERE expires_at < ${addMin(-60)}`;
    const [r] = await sql<{ id: string }[]>`
      INSERT INTO webauthn_challenge (account_id, purpose, challenge, expires_at)
      VALUES (${accountId}, ${purpose}, ${challenge}, ${addMin(CHALLENGE_MINUTES)}) RETURNING id`;
    return r!.id;
  }
  /** Défi à usage unique : consommé même si la vérification échoue ensuite. */
  async function takeChallenge(id: string, purpose: 'register' | 'login', accountId: string | null): Promise<string | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [r] = await sql<{ challenge: string }[]>`
      UPDATE webauthn_challenge SET used_at = ${now()}
      WHERE id = ${id} AND purpose = ${purpose} AND used_at IS NULL AND expires_at > ${now()}
        AND account_id IS NOT DISTINCT FROM ${accountId}
      RETURNING challenge`;
    return r?.challenge ?? null;
  }
  const uuidBytes = (id: string) => Uint8Array.from(Buffer.from(id.replace(/-/g, ''), 'hex'));

  /** Étape 1 de l'ajout d'une clé d'accès (mot de passe exigé). */
  async function passkeyRegistrationOptions(
    session: SessionInfo,
    currentPassword: string,
  ): Promise<{ ok: true; challengeId: string; options: PublicKeyCredentialCreationOptionsJSON } | { ok: false; errors: FieldErrors }> {
    const r = await reauthenticate(session, currentPassword);
    if (!r.ok) return r;
    const existing = await sql<{ credential_id: string; transports: string[] | null }[]>`
      SELECT credential_id, transports FROM mfa_factor WHERE account_id = ${session.accountId} AND kind = 'webauthn'`;
    if (existing.length >= 10) return { ok: false, errors: { form: '10 clés d’accès au maximum : supprimez-en une d’abord.' } };
    const options = await generateRegistrationOptions({
      rpName: 'BILANX',
      rpID,
      userName: r.email,
      userID: uuidBytes(session.accountId),
      userDisplayName: session.displayName ?? r.email,
      attestationType: 'none',
      excludeCredentials: existing.map((c) => ({ id: c.credential_id, transports: c.transports ?? undefined })),
      // Clé « découvrable » (connexion sans saisir l'adresse) et vérification de l'utilisateur
      // (Face ID, empreinte, code de l'appareil) obligatoires.
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });
    return { ok: true, challengeId: await storeChallenge('register', session.accountId, options.challenge), options };
  }

  /** Étape 2 : enregistrement de la clé créée par l'appareil. */
  async function passkeyRegister(session: SessionInfo, challengeId: string, response: RegistrationResponseJSON, rawLabel: string): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!session.mfaPassed) return { ok: false, error: 'Session incomplète : reconnectez-vous.' };
    const challenge = await takeChallenge(challengeId, 'register', session.accountId);
    if (!challenge) return { ok: false, error: 'Délai dépassé : recommencez.' };
    let v;
    try {
      v = await verifyRegistrationResponse({ response, expectedChallenge: challenge, expectedOrigin: appOrigin, expectedRPID: rpID, requireUserVerification: true });
    } catch {
      return { ok: false, error: 'La clé d’accès n’a pas pu être vérifiée. Recommencez.' };
    }
    if (!v.verified) return { ok: false, error: 'La clé d’accès n’a pas pu être vérifiée. Recommencez.' };
    const c = v.registrationInfo.credential;
    const label = rawLabel.trim().slice(0, 60) || 'Clé d’accès';
    try {
      await sql.begin(async (tx) => {
        await tx`
          INSERT INTO mfa_factor (account_id, kind, secret_enc, label, created_at, confirmed_at, credential_id, sign_count, transports)
          VALUES (${session.accountId}, 'webauthn', ${encrypt(keys.passkey, Buffer.from(c.publicKey), session.accountId)}, ${label}, ${now()}, ${now()},
                  ${c.id}, ${c.counter}, ${c.transports ?? null})`;
        await audit(tx, { accountId: session.accountId, action: 'mfa.passkey_added' });
      });
    } catch (e) {
      if ((e as { code?: string }).code === '23505') return { ok: false, error: 'Cette clé d’accès est déjà enregistrée.' };
      throw e;
    }
    await mailer.send({
      to: session.email,
      subject: 'Nouvelle clé d’accès sur votre compte BILANX',
      text: `Une clé d'accès (« ${label} ») vient d'être ajoutée à votre compte : elle permet de se connecter sans mot de passe.\n\nSi vous n'êtes pas à l'origine de cet ajout, supprimez-la dans Paramètres et réinitialisez votre mot de passe : ${cfg.appUrl}/mot-de-passe-oublie`,
    });
    return { ok: true };
  }

  async function listPasskeys(accountId: string) {
    return sql<{ id: string; label: string | null; created_at: Date; last_used_at: Date | null }[]>`
      SELECT id, label, created_at, last_used_at FROM mfa_factor WHERE account_id = ${accountId} AND kind = 'webauthn' ORDER BY created_at`;
  }

  async function removePasskey(session: SessionInfo, currentPassword: string, factorId: string): Promise<{ ok: true } | { ok: false; errors: FieldErrors }> {
    const r = await reauthenticate(session, currentPassword);
    if (!r.ok) return r;
    if (!/^[0-9a-f-]{36}$/i.test(factorId)) return { ok: false, errors: { form: 'Clé introuvable.' } };
    const label = await sql.begin(async (tx) => {
      const [d] = await tx<{ label: string | null }[]>`
        DELETE FROM mfa_factor WHERE id = ${factorId} AND account_id = ${session.accountId} AND kind = 'webauthn' RETURNING label`;
      if (d) await audit(tx, { accountId: session.accountId, action: 'mfa.passkey_removed' });
      return d ? (d.label ?? 'Clé d’accès') : null;
    });
    if (label === null) return { ok: false, errors: { form: 'Clé introuvable.' } };
    await mailer.send({
      to: r.email,
      subject: 'Clé d’accès supprimée de votre compte BILANX',
      text: `La clé d'accès « ${label} » a été supprimée de votre compte.\nSi vous n'êtes pas à l'origine de cette suppression, réinitialisez votre mot de passe : ${cfg.appUrl}/mot-de-passe-oublie`,
    });
    return { ok: true };
  }

  /** Connexion par clé d'accès, étape 1 : défi (le compte n'est pas encore connu). */
  async function passkeyLoginOptions(client: ClientInfo = {}): Promise<{ challengeId: string; options: PublicKeyCredentialRequestOptionsJSON } | null> {
    // Point d'entrée public : limité par adresse IP (chaque défi est écrit en base).
    if (client.ip) {
      const key = ipHash(client.ip)!.toString('hex');
      if (await isThrottled('passkey_options', key, 30)) return null;
      await recordAttempt('passkey_options', key);
    }
    const options = await generateAuthenticationOptions({ rpID, userVerification: 'required' });
    return { challengeId: await storeChallenge('login', null, options.challenge), options };
  }

  /**
   * Connexion par clé d'accès, étape 2. La clé (appareil + Face ID / empreinte / code) vaut double
   * authentification : la session est complète d'emblée.
   */
  async function passkeySignIn(challengeId: string, response: AuthenticationResponseJSON, client: ClientInfo & { remember?: boolean }): Promise<{ status: 'ok'; token: string } | { status: 'invalid' }> {
    const challenge = await takeChallenge(challengeId, 'login', null);
    if (!challenge || typeof response?.id !== 'string') return { status: 'invalid' };
    const [f] = await sql<{ id: string; account_id: string; secret_enc: Buffer; sign_count: string; transports: string[] | null; email_verified_at: Date | null }[]>`
      SELECT f.id, f.account_id, f.secret_enc, f.sign_count, f.transports, a.email_verified_at
      FROM mfa_factor f JOIN account a ON a.id = f.account_id AND a.deleted_at IS NULL
      WHERE f.kind = 'webauthn' AND f.credential_id = ${response.id}`;
    if (!f || !f.email_verified_at) return { status: 'invalid' };
    const fail = async () => {
      await sql`INSERT INTO login_event (account_id, success, method, user_agent, occurred_at) VALUES (${f.account_id}, false, 'passkey', ${client.userAgent ?? null}, ${now()})`;
      return { status: 'invalid' as const };
    };
    // La clé doit appartenir au compte qu'elle annonce.
    const handle = response.response?.userHandle;
    if (handle && Buffer.from(handle, 'base64url').toString('hex') !== f.account_id.replace(/-/g, '')) return fail();
    let v;
    try {
      v = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: appOrigin,
        expectedRPID: rpID,
        requireUserVerification: true,
        credential: { id: response.id, publicKey: new Uint8Array(decrypt(keys.passkey, f.secret_enc, f.account_id)), counter: Number(f.sign_count), transports: f.transports ?? undefined },
      });
    } catch {
      return fail();
    }
    if (!v.verified) return fail();
    const token = randomToken();
    await sql.begin(async (tx) => {
      await tx`UPDATE mfa_factor SET sign_count = ${v.authenticationInfo.newCounter}, last_used_at = ${now()} WHERE id = ${f.id}`;
      await tx`
        INSERT INTO session (account_id, token_hash, mfa_passed, mfa_passed_at, remember, ip_hash, user_agent, created_at, last_seen_at, expires_at, absolute_expires_at)
        VALUES (${f.account_id}, ${sha256(token)}, true, ${now()}, ${!!client.remember}, ${ipHash(client.ip)}, ${client.userAgent ?? null}, ${now()}, ${now()},
                ${addMin(idleMinutes(!!client.remember))}, ${addMin(sessionLifetimeMinutes(!!client.remember))})`;
      await tx`INSERT INTO login_event (account_id, success, method, user_agent, occurred_at) VALUES (${f.account_id}, true, 'passkey', ${client.userAgent ?? null}, ${now()})`;
      await audit(tx, { accountId: f.account_id, action: 'session.passkey_ok' });
    });
    return { status: 'ok', token };
  }

  /** Délai pour scanner et confirmer le nouveau téléphone. */
  const TOTP_REPLACEMENT_MINUTES = 15;

  /**
   * Changement de téléphone (étape 1) : mot de passe exigé ; une nouvelle clé est préparée SANS toucher
   * à l'application actuelle, qui reste valable tant que la nouvelle n'est pas confirmée.
   */
  async function beginTotpReplacement(session: SessionInfo, currentPassword: string): Promise<{ ok: true; secret: string; uri: string } | { ok: false; errors: FieldErrors }> {
    const r = await reauthenticate(session, currentPassword);
    if (!r.ok) return r;
    const secret = generateTotpSecret();
    await sql.begin(async (tx) => {
      await tx`DELETE FROM mfa_factor WHERE account_id = ${session.accountId} AND kind = 'totp' AND confirmed_at IS NULL`;
      await tx`
        INSERT INTO mfa_factor (account_id, kind, secret_enc, label, created_at)
        VALUES (${session.accountId}, 'totp', ${encrypt(keys.totp, secret, session.accountId)}, 'Application d’authentification', ${now()})`;
    });
    return { ok: true, secret: base32Encode(secret), uri: otpauthUri(secret, r.email) };
  }

  /**
   * Changement de téléphone (étape 2) : un code de la NOUVELLE application remplace l'ancienne.
   * Codes de secours inchangés ; session en cours conservée ; titulaire prévenu par e-mail.
   */
  async function confirmTotpReplacement(session: SessionInfo, code: string): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!session.mfaPassed) return { ok: false, error: 'Session incomplète : reconnectez-vous.' };
    if (await isThrottled('mfa', session.accountId, MFA_MAX_FAILURES)) return { ok: false, error: 'Trop de tentatives. Réessayez dans 15 minutes.' };
    const [f] = await sql<{ id: string; secret_enc: Buffer }[]>`
      SELECT id, secret_enc FROM mfa_factor
      WHERE account_id = ${session.accountId} AND kind = 'totp' AND confirmed_at IS NULL AND created_at > ${addMin(-TOTP_REPLACEMENT_MINUTES)}
      ORDER BY created_at DESC LIMIT 1`;
    if (!f) return { ok: false, error: 'Délai dépassé : recommencez le changement de téléphone.' };
    const step = verifyTotp(decrypt(keys.totp, f.secret_enc, session.accountId), code, now(), null);
    if (step === null) {
      await recordAttempt('mfa', session.accountId);
      return { ok: false, error: 'Code incorrect. Saisissez le code affiché par la NOUVELLE application, et vérifiez l’heure du téléphone.' };
    }
    await sql.begin(async (tx) => {
      await tx`DELETE FROM mfa_factor WHERE account_id = ${session.accountId} AND kind = 'totp' AND confirmed_at IS NOT NULL`;
      await tx`UPDATE mfa_factor SET confirmed_at = ${now()}, last_used_step = ${step}, last_used_at = ${now()} WHERE id = ${f.id}`;
      await audit(tx, { accountId: session.accountId, action: 'mfa.totp_replaced' });
    });
    await clearAttempts('mfa', session.accountId);
    await mailer.send({
      to: session.email,
      subject: 'Double authentification : nouveau téléphone enregistré',
      text: `Votre compte BILANX utilise désormais une nouvelle application d'authentification ; l'ancienne ne fonctionne plus. Vos codes de secours restent valables.\n\nSi vous n'êtes pas à l'origine de ce changement, réinitialisez immédiatement votre mot de passe : ${cfg.appUrl}/mot-de-passe-oublie`,
    });
    return { ok: true };
  }

  /** Nombre de codes de secours encore utilisables. */
  async function recoveryCodesLeft(accountId: string): Promise<number> {
    const [r] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM mfa_recovery_code WHERE account_id = ${accountId} AND used_at IS NULL`;
    return r?.n ?? 0;
  }

  return {
    passkeyRegistrationOptions,
    passkeyRegister,
    listPasskeys,
    removePasskey,
    passkeyLoginOptions,
    passkeySignIn,
    beginTotpReplacement,
    confirmTotpReplacement,
    changePassword,
    requestEmailChange,
    confirmEmailChange,
    regenerateRecoveryCodes,
    recoveryCodesLeft,
    signUp,
    verifyEmail,
    resendVerification,
    signIn,
    getSession,
    beginTotpEnrollment,
    confirmTotpEnrollment,
    skipMfa,
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
