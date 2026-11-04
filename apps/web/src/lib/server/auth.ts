import QRCode from 'qrcode';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ConsoleMailer, createAuthService, parseSecretKey, SESSION_ABSOLUTE_HOURS, type AuthService, type SessionInfo } from '@bilanx/auth';
import { createSql } from '@bilanx/db';

/**
 * Accès serveur uniquement (Server Components, Server Actions).
 * Un seul service par processus, conservé entre les rechargements à chaud en développement.
 */
const globalForAuth = globalThis as unknown as { bilanxAuth?: AuthService };

export function auth(): AuthService {
  if (!globalForAuth.bilanxAuth) {
    const appUrl = process.env.BILANX_APP_URL ?? 'http://localhost:3000';
    if (process.env.NODE_ENV === 'production' && !/^https:\/\/|^http:\/\/localhost(:\d+)?$/.test(appUrl)) {
      throw new Error('BILANX_APP_URL doit être en https en production (seul http://localhost est toléré pour les essais).');
    }
    globalForAuth.bilanxAuth = createAuthService({
      sql: createSql(),
      // Aucun prestataire d'e-mail n'est encore branché : les messages s'affichent dans la console du serveur.
      mailer: new ConsoleMailer(),
      secretKey: parseSecretKey(process.env.BILANX_SECRET_KEY),
      appUrl,
    });
  }
  return globalForAuth.bilanxAuth;
}

const secure = process.env.NODE_ENV === 'production';
/** Préfixe __Host- en production : cookie lié à l'hôte, Secure, chemin « / ». */
export const SESSION_COOKIE = secure ? '__Host-bilanx_session' : 'bilanx_session';

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_ABSOLUTE_HOURS * 3600,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function currentSession(): Promise<SessionInfo | null> {
  const token = await sessionToken();
  return token ? auth().getSession(token) : null;
}

/** Session complète obligatoire (mot de passe + MFA) pour accéder aux données de santé. */
export async function requireUser(): Promise<SessionInfo> {
  const s = await currentSession();
  if (!s) redirect('/connexion');
  if (!s.mfaPassed) redirect(s.mfaEnrolled ? '/mfa' : '/mfa/configuration');
  return s;
}

/** Session après mot de passe, en attente de l'étape MFA. */
export async function requirePendingMfa(): Promise<SessionInfo> {
  const s = await currentSession();
  if (!s) redirect('/connexion');
  if (s.mfaPassed) redirect('/tableau-de-bord');
  return s;
}

export async function clientInfo(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  // X-Forwarded-For n'est fiable que derrière le proxy de l'hébergeur, qui doit l'écraser.
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null;
  return { ip, userAgent: h.get('user-agent')?.slice(0, 300) ?? null };
}

/** Démarre l'enrôlement TOTP (appelé au rendu serveur de la page de configuration). */
export async function startTotpEnrollment(s: SessionInfo): Promise<{ secret: string; qrSvg: string }> {
  const { secret, uri } = await auth().beginTotpEnrollment(s);
  const qrSvg = await QRCode.toString(uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1B2A30', light: '#FFFFFF' } });
  return { secret, qrSvg };
}

