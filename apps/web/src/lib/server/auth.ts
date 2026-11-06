import QRCode from 'qrcode';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createApiTokenService, type ApiTokenService, createAuthService, mailerFromEnv, SmtpMailer, parseSecretKey, sessionLifetimeMinutes, type AuthService, type SessionInfo } from '@bilanx/auth';
import { createAppSql, type Sql } from '@bilanx/db';
import { createProfilesService, type ProfilesService } from '@bilanx/profiles';
import {
  createActivityService,
  createGymService,
  type GymService,
  createGlucoseService,
  type GlucoseService,
  createAppointmentsService,
  createInsulinService,
  createJournalService,
  createLabService,
  createMedicationsService,
  createSharingService,
  createRemindersService,
  type ActivityService,
  type AppointmentsService,
  type InsulinService,
  type JournalService,
  type LabService,
  type MedicationsService,
  type SharingService,
  type RemindersService,
} from '@bilanx/records';
import { createDocumentsService, type DocumentsService } from '@bilanx/documents';
import { createPrivacyService, type PrivacyService } from '@bilanx/privacy';

/**
 * Accès serveur uniquement (Server Components, Server Actions).
 * Un seul service par processus, conservé entre les rechargements à chaud en développement.
 */
const globalForAuth = globalThis as unknown as { bilanxAuth?: AuthService; bilanxProfiles?: ProfilesService; bilanxSql?: Sql; bilanxLab?: LabService; bilanxDocs?: DocumentsService; bilanxInsulin?: InsulinService; bilanxJournal?: JournalService; bilanxAppointments?: AppointmentsService; bilanxPrivacy?: PrivacyService; bilanxActivity?: ActivityService; bilanxGym?: GymService; bilanxGlucose?: GlucoseService; bilanxMedications?: MedicationsService; bilanxSharing?: SharingService; bilanxReminders?: RemindersService; bilanxApiTokens?: ApiTokenService };

function sql(): Sql {
  globalForAuth.bilanxSql ??= createAppSql();
  return globalForAuth.bilanxSql;
}

const appUrl = () => process.env.BILANX_APP_URL ?? 'http://localhost:3000';
/** SMTP si BILANX_SMTP_URL est défini ; sinon e-mails affichés dans le journal du serveur. */
export const mailer = mailerFromEnv();
export const mailerKind = mailer instanceof SmtpMailer ? 'smtp' : 'journal';

export function profiles(): ProfilesService {
  globalForAuth.bilanxProfiles ??= createProfilesService({ sql: sql(), mailer, appUrl: appUrl() });
  return globalForAuth.bilanxProfiles;
}

export function lab(): LabService {
  globalForAuth.bilanxLab ??= createLabService({ profiles: profiles() });
  return globalForAuth.bilanxLab;
}

export function insulin(): InsulinService {
  globalForAuth.bilanxInsulin ??= createInsulinService({ profiles: profiles() });
  return globalForAuth.bilanxInsulin;
}

export function journal(): JournalService {
  globalForAuth.bilanxJournal ??= createJournalService({ profiles: profiles() });
  return globalForAuth.bilanxJournal;
}

export function appointments(): AppointmentsService {
  globalForAuth.bilanxAppointments ??= createAppointmentsService({ profiles: profiles() });
  return globalForAuth.bilanxAppointments;
}

export function documents(): DocumentsService {
  globalForAuth.bilanxDocs ??= createDocumentsService({ sql: sql(), profiles: profiles(), secretKey: parseSecretKey(process.env.BILANX_SECRET_KEY) });
  return globalForAuth.bilanxDocs;
}

export function glucose(): GlucoseService {
  globalForAuth.bilanxGlucose ??= createGlucoseService({ profiles: profiles() });
  return globalForAuth.bilanxGlucose;
}

export function apiTokens(): ApiTokenService {
  globalForAuth.bilanxApiTokens ??= createApiTokenService({ sql: sql() });
  return globalForAuth.bilanxApiTokens;
}

export function activity(): ActivityService {
  globalForAuth.bilanxActivity ??= createActivityService({ profiles: profiles() });
  return globalForAuth.bilanxActivity;
}

export function gym(): GymService {
  globalForAuth.bilanxGym ??= createGymService({ profiles: profiles() });
  return globalForAuth.bilanxGym;
}

export function medications(): MedicationsService {
  globalForAuth.bilanxMedications ??= createMedicationsService({ profiles: profiles() });
  return globalForAuth.bilanxMedications;
}

export function sharing(): SharingService {
  globalForAuth.bilanxSharing ??= createSharingService({ sql: sql(), profiles: profiles(), secretKey: parseSecretKey(process.env.BILANX_SECRET_KEY), mailer, appUrl: appUrl() });
  return globalForAuth.bilanxSharing;
}

export function reminders(): RemindersService {
  globalForAuth.bilanxReminders ??= createRemindersService({
    sql: sql(),
    profiles: profiles(),
    secretKey: parseSecretKey(process.env.BILANX_SECRET_KEY),
    appUrl: appUrl(),
    contact: `mailto:${(process.env.BILANX_MAIL_FROM?.match(/<([^>]+)>/)?.[1] ?? process.env.BILANX_MAIL_FROM ?? 'no-reply@bilanx.fr').trim()}`,
  });
  return globalForAuth.bilanxReminders;
}

export function privacy(): PrivacyService {
  globalForAuth.bilanxPrivacy ??= createPrivacyService({ sql: sql(), profiles: profiles(), documents: documents(), mailer, appUrl: appUrl() });
  return globalForAuth.bilanxPrivacy;
}

export function auth(): AuthService {
  if (!globalForAuth.bilanxAuth) {
    if (
      process.env.NODE_ENV === 'production' &&
      !/^https:\/\/|^http:\/\/localhost(:\d+)?$/.test(appUrl()) &&
      process.env.BILANX_ALLOW_INSECURE_HTTP !== 'true'
    ) {
      throw new Error('BILANX_APP_URL doit être en https en production (seul http://localhost est toléré pour les essais).');
    }
    globalForAuth.bilanxAuth = createAuthService({
      sql: sql(),
      // Aucun prestataire d'e-mail n'est encore branché : les messages s'affichent dans la console du serveur.
      mailer,
      secretKey: parseSecretKey(process.env.BILANX_SECRET_KEY),
      appUrl: appUrl(),
    });
  }
  return globalForAuth.bilanxAuth;
}

/** Cookies « Secure » dès que le site est servi en https (toujours le cas en production réelle). */
export const COOKIE_SECURE = process.env.NODE_ENV === 'production' && !(process.env.BILANX_APP_URL ?? '').startsWith('http://');
/** Préfixe __Host- en production : cookie lié à l'hôte, Secure, chemin « / ». */
export const SESSION_COOKIE = COOKIE_SECURE ? '__Host-bilanx_session' : 'bilanx_session';

/** Cookie persistant : durée de vie de la session (12 h, ou un an avec « Rester connecté »). */
export async function setSessionCookie(token: string, remember = false): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: sessionLifetimeMinutes(remember) * 60,
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
  return { secret, qrSvg: await totpQrSvg(uri) };
}

/** QR code (SVG) d'une adresse otpauth://, généré côté serveur : la clé ne passe par aucun service tiers. */
export function totpQrSvg(uri: string): Promise<string> {
  return QRCode.toString(uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1B2A30', light: '#FFFFFF' } });
}


const NEXT_COOKIE = 'bilanx_suite';

/** Mémorise une page interne à rouvrir après la connexion (ex. lien d'invitation). */
export async function rememberNext(path: string | null | undefined): Promise<void> {
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return;
  (await cookies()).set(NEXT_COOKIE, path, { httpOnly: true, secure: COOKIE_SECURE, sameSite: 'lax', path: '/', maxAge: 15 * 60 });
}

export async function takeNext(fallback = '/tableau-de-bord'): Promise<string> {
  const jar = await cookies();
  const v = jar.get(NEXT_COOKIE)?.value;
  if (v) jar.delete(NEXT_COOKIE);
  return v && v.startsWith('/') && !v.startsWith('//') ? v : fallback;
}
