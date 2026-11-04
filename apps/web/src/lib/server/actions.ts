'use server';

import { redirect } from 'next/navigation';
import type { FieldErrors } from '@bilanx/auth';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { ForbiddenError, MODULE_KEYS } from '@bilanx/profiles';
import { appContext, DEMO_PROFILE_ID, PROFILE_COOKIE } from './context';
import {
  auth,
  lab,
  profiles,
  rememberNext,
  takeNext,
  COOKIE_SECURE,
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
  /** Erreurs par champ (formulaires détaillés). */
  fieldErrors?: Record<string, string | undefined>;
  /** Doublon détecté : confirmation explicite demandée. */
  duplicate?: boolean;
  /** Identifiant de la réponse : force la reconstruction du formulaire avec les valeurs saisies. */
  attempt?: string;
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
      await rememberNext(str(fd, 'suite') || null);
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
  redirect(r.usedRecoveryCode ? `/parametres?codes-restants=${r.recoveryCodesLeft}` : await takeNext());
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

// ───────────── Famille & profils ─────────────
export async function switchProfileAction(fd: FormData): Promise<void> {
  const s = await requireUser();
  const id = str(fd, 'profileId');
  if (id !== DEMO_PROFILE_ID && !(await profiles().getAccess(s.accountId, id))) redirect('/famille');
  (await cookies()).set(PROFILE_COOKIE, id, { httpOnly: true, secure: COOKIE_SECURE, sameSite: 'lax', path: '/', maxAge: 30 * 86400 });
  redirect('/tableau-de-bord');
}

const actorOf = async () => {
  const s = await requireUser();
  return { accountId: s.accountId, email: s.email, displayName: s.displayName };
};

function permissionsFrom(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of MODULE_KEYS) {
    const v = fd.get(`perm_${k}`);
    if (v === 'read' || v === 'write') out[k] = v;
  }
  return out;
}

export async function createRelativeAction(_: FormState, fd: FormData): Promise<FormState> {
  const r = await profiles().createRelativeProfile(await actorOf(), {
    displayName: str(fd, 'displayName'),
    relationship: str(fd, 'relationship'),
    birthDate: str(fd, 'birthDate') || null,
    legalBasis: str(fd, 'legalBasis'),
    attested: fd.get('attested') === 'on',
  });
  if (!r.ok)
    return {
      attempt: crypto.randomUUID(),
      errors: { form: r.error },
      values: {
        displayName: str(fd, 'displayName'),
        relationship: str(fd, 'relationship'),
        birthDate: str(fd, 'birthDate'),
        legalBasis: str(fd, 'legalBasis'),
        attested: fd.get('attested') === 'on' ? 'on' : '',
      },
    };
  redirect(`/famille/${r.profileId}`);
}

export async function inviteAction(_: FormState, fd: FormData): Promise<FormState> {
  const profileId = str(fd, 'profileId');
  const days = str(fd, 'accessDays');
  try {
    const r = await profiles().invite(await actorOf(), profileId, {
      email: str(fd, 'email'),
      role: str(fd, 'role'),
      permissions: permissionsFrom(fd),
      accessDays: days ? Number(days) : null,
    });
    if (!r.ok) return { attempt: crypto.randomUUID(), errors: { form: r.error }, values: { email: str(fd, 'email'), accessDays: days, ...permissionsFrom(fd) } };
  } catch (e) {
    if (e instanceof ForbiddenError) return { errors: { form: e.message } };
    throw e;
  }
  revalidatePath(`/famille/${profileId}`);
  return { ok: true, message: `Invitation envoyée à ${str(fd, 'email').trim()}. Elle est valable 7 jours et ne donne aucun accès avant d’être acceptée.` };
}

export async function updatePermissionsAction(_: FormState, fd: FormData): Promise<FormState> {
  const profileId = str(fd, 'profileId');
  const r = await profiles().updatePermissions(await actorOf(), profileId, str(fd, 'accessId'), permissionsFrom(fd));
  if (!r.ok) return { errors: { form: r.error } };
  revalidatePath(`/famille/${profileId}`);
  return { ok: true, message: 'Autorisations enregistrées.' };
}

export async function revokeAccessAction(fd: FormData): Promise<void> {
  const profileId = str(fd, 'profileId');
  await profiles().revokeAccess(await actorOf(), profileId, str(fd, 'accessId'));
  redirect(`/famille/${profileId}`);
}

export async function revokeInvitationAction(fd: FormData): Promise<void> {
  const profileId = str(fd, 'profileId');
  await profiles().revokeInvitation(await actorOf(), profileId, str(fd, 'invitationId'));
  redirect(`/famille/${profileId}`);
}

export async function leaveProfileAction(fd: FormData): Promise<void> {
  await profiles().leaveProfile(await actorOf(), str(fd, 'profileId'));
  (await cookies()).delete(PROFILE_COOKIE);
  redirect('/famille');
}

export async function respondInvitationAction(_: FormState, fd: FormData): Promise<FormState> {
  const accept = str(fd, 'decision') === 'accept';
  const r = await profiles().respondToInvitation(await actorOf(), str(fd, 'token'), accept);
  if (!r.ok) return { errors: { form: r.error } };
  if (accept && r.profileId) {
    (await cookies()).set(PROFILE_COOKIE, r.profileId, { httpOnly: true, secure: COOKIE_SECURE, sameSite: 'lax', path: '/', maxAge: 30 * 86400 });
    redirect('/tableau-de-bord');
  }
  return { ok: true, message: 'Invitation refusée. Aucun accès n’a été créé.' };
}

// ───────────── Analyses : saisie manuelle ─────────────
export async function addLabResultAction(_: FormState, fd: FormData): Promise<FormState> {
  const ctx = await appContext();
  if (ctx.active.kind !== 'real') return { errors: { form: 'Le profil de démonstration ne peut pas être modifié.' } };
  const input = {
    analyteCode: str(fd, 'analyteCode'),
    value: str(fd, 'value'),
    unit: str(fd, 'unit'),
    sampledOn: str(fd, 'sampledOn'),
    laboratory: str(fd, 'laboratory'),
    refLow: str(fd, 'refLow'),
    refHigh: str(fd, 'refHigh'),
    note: str(fd, 'note'),
  };
  let r;
  try {
    r = await lab().addManual(ctx.user, ctx.active.access.profileId, { ...input, acceptDuplicate: fd.get('acceptDuplicate') === 'on' });
  } catch (e) {
    if (e instanceof ForbiddenError) return { attempt: crypto.randomUUID(), errors: { form: e.message }, values: input };
    throw e;
  }
  if (!r.ok) {
    if ('duplicate' in r) return { attempt: crypto.randomUUID(), duplicate: true, errors: { form: r.message }, values: input };
    return { attempt: crypto.randomUUID(), fieldErrors: r.errors, errors: { form: 'Vérifiez les champs signalés.' }, values: input };
  }
  redirect(`/analyses/${r.analyteCode}?ajout=1`);
}

export async function deleteLabResultAction(fd: FormData): Promise<void> {
  const ctx = await appContext();
  const code = str(fd, 'analyteCode');
  if (ctx.active.kind === 'real') await lab().remove(ctx.user, ctx.active.access.profileId, str(fd, 'resultId'));
  redirect(`/analyses/${encodeURIComponent(code)}?suppression=1`);
}
