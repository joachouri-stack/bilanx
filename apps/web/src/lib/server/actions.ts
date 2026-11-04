'use server';

import { redirect } from 'next/navigation';
import type { FieldErrors } from '@bilanx/auth';
import {
  auth,
  clearSessionCookie,
  clientInfo,
  requirePendingMfa,
  requireUser,
  sessionToken,
  setSessionCookie,
} from './auth';

export interface FormState {
  ok?: boolean;
  message?: string;
  errors?: FieldErrors;
  values?: Record<string, string>;
  /** Codes de secours, affichés une seule fois après l'activation de la MFA. */
  recoveryCodes?: string[];
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '');

// ───────────── Inscription ─────────────
export async function signUpAction(_: FormState, fd: FormData): Promise<FormState> {
  const values = { email: str(fd, 'email'), displayName: str(fd, 'displayName') };
  const r = await auth().signUp({
    email: values.email,
    displayName: values.displayName,
    password: str(fd, 'password'),
    acceptHealthProcessing: fd.get('consentHealth') === 'on',
    acceptAiExtraction: fd.get('consentAi') === 'on',
  });
  if (!r.ok) return { errors: r.errors, values };
  return {
    ok: true,
    message: `Si l’adresse ${values.email.trim()} peut être utilisée, un e-mail de confirmation vient d’y être envoyé. Ouvrez le lien qu’il contient pour activer votre compte.`,
  };
}

export async function verifyEmailAction(_: FormState, fd: FormData): Promise<FormState> {
  const ok = await auth().verifyEmail(str(fd, 'token'));
  return ok
    ? { ok: true, message: 'Adresse confirmée. Vous pouvez vous connecter.' }
    : { ok: false, message: 'Ce lien est invalide, a déjà été utilisé ou a expiré.' };
}

export async function resendVerificationAction(_: FormState, fd: FormData): Promise<FormState> {
  await auth().resendVerification(str(fd, 'email'));
  return { ok: true, message: 'Si un compte non confirmé existe pour cette adresse, un nouveau lien a été envoyé.' };
}

// ───────────── Connexion ─────────────
export async function signInAction(_: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, 'email');
  const r = await auth().signIn({ email, password: str(fd, 'password'), ...(await clientInfo()) });
  switch (r.status) {
    case 'invalid':
      return { errors: { form: 'Adresse e-mail ou mot de passe incorrect.' }, values: { email } };
    case 'throttled':
      return { errors: { form: 'Trop de tentatives. Pour votre sécurité, réessayez dans 15 minutes.' }, values: { email } };
    case 'unverified':
      return { errors: { form: 'Confirmez d’abord votre adresse e-mail. Vous pouvez demander un nouveau lien ci-dessous.' }, values: { email } };
    case 'ok':
      await setSessionCookie(r.token);
      redirect(r.next === 'mfa_enroll' ? '/mfa/configuration' : '/mfa');
  }
}

export async function signOutAction(): Promise<void> {
  await auth().signOut(await sessionToken());
  await clearSessionCookie();
  redirect('/connexion');
}

// ───────────── Double authentification ─────────────
export async function confirmTotpAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requirePendingMfa();
  const r = await auth().confirmTotpEnrollment(s, str(fd, 'code'));
  if (!r.ok) return { errors: { form: r.error } };
  await setSessionCookie(r.token);
  return { ok: true, recoveryCodes: r.recoveryCodes };
}

export async function verifyMfaAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requirePendingMfa();
  const r = await auth().verifyMfa(s, str(fd, 'code'));
  if (!r.ok) return { errors: { form: r.error } };
  await setSessionCookie(r.token);
  redirect(r.usedRecoveryCode ? `/parametres?codes-restants=${r.recoveryCodesLeft}` : '/tableau-de-bord');
}

// ───────────── Mot de passe oublié ─────────────
export async function requestResetAction(_: FormState, fd: FormData): Promise<FormState> {
  await auth().requestPasswordReset(str(fd, 'email'));
  return { ok: true, message: 'Si un compte existe pour cette adresse, un lien de réinitialisation (valable 1 heure) vient d’être envoyé.' };
}

export async function resetPasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const r = await auth().resetPassword(str(fd, 'token'), str(fd, 'password'));
  if (!r.ok) return { errors: { password: r.error } };
  await clearSessionCookie();
  return { ok: true, message: 'Mot de passe modifié. Toutes vos sessions ont été fermées : reconnectez-vous.' };
}

// ───────────── Sécurité du compte ─────────────
export async function revokeSessionAction(fd: FormData): Promise<void> {
  const s = await requireUser();
  const id = str(fd, 'sessionId');
  if (id === s.sessionId) return signOutAction();
  await auth().revokeSession(s.accountId, id);
  redirect('/parametres');
}

export async function revokeOtherSessionsAction(): Promise<void> {
  const s = await requireUser();
  await auth().revokeOtherSessions(s.accountId, s.sessionId);
  redirect('/parametres');
}
