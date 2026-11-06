'use server';

import { redirect } from 'next/navigation';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@bilanx/auth';
import type { FieldErrors } from '@bilanx/auth';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { ForbiddenError, MODULE_KEYS } from '@bilanx/profiles';
import { appContext, DEMO_PROFILE_ID, PROFILE_COOKIE } from './context';
import { addDays, formatLocalDate, isGlucoseUnit } from '@bilanx/domain';
import { buildReportPdf, SECTION_KEYS, type SectionKey } from '@bilanx/reports';
import { SHARE_VIEWER_MINUTES } from '@bilanx/records';
import type { DocumentCategory, ExamType } from '@bilanx/documents';
import { collectReport } from './report-data';
import { demoToday } from '@/lib/demo-data';
import {
  activity,
  gym,
  glucose,
  appointments,
  auth,
  privacy,
  documents,
  insulin,
  journal,
  lab,
  medications,
  profiles,
  sharing,
  reminders,
  rememberNext,
  takeNext,
  COOKIE_SECURE,
  clearSessionCookie,
  clientInfo,
  requirePendingMfa,
  currentSession,
  requireUser,
  totpQrSvg,
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
  const remember = fd.get('remember') === 'on';
  const r = await auth().signIn({ email, password: str(fd, 'password'), remember, ...(await clientInfo()) });
  switch (r.status) {
    case 'invalid':
      return { errors: { form: 'Adresse e-mail ou mot de passe incorrect.' }, values: { email } };
    case 'throttled':
      return { errors: { form: 'Trop de tentatives. Pour votre sécurité, réessayez dans 15 minutes.' }, values: { email } };
    case 'unverified':
      return { errors: { form: 'Confirmez d’abord votre adresse e-mail. Vous pouvez demander un nouveau lien ci-dessous.' }, values: { email } };
    case 'ok':
      await setSessionCookie(r.token, remember);
      await rememberNext(str(fd, 'suite') || null);
      redirect(r.next === 'done' ? await takeNext() : r.next === 'mfa_enroll' ? '/mfa/configuration' : '/mfa');
  }
}

export async function signOutAction(): Promise<void> {
  await auth().signOut(await sessionToken());
  await clearSessionCookie();
  redirect('/connexion');
}

// ───────────── Clés d'accès (passkeys) ─────────────
// Appelées directement par le composant client (WebAuthn se déroule dans le navigateur).
export async function passkeyLoginOptionsAction() {
  const r = await auth().passkeyLoginOptions(await clientInfo());
  return r ?? { error: 'Trop de tentatives. Réessayez dans 15 minutes.' };
}

export async function passkeySignInAction(
  challengeId: string,
  response: AuthenticationResponseJSON,
  suite: string | null,
  remember = false,
): Promise<{ ok: true; next: string } | { ok: false; error: string }> {
  const r = await auth().passkeySignIn(String(challengeId), response, { ...(await clientInfo()), remember: remember === true });
  if (r.status !== 'ok') return { ok: false, error: 'Clé d’accès non reconnue. Connectez-vous avec votre mot de passe.' };
  await setSessionCookie(r.token, remember === true);
  await rememberNext(suite);
  return { ok: true, next: await takeNext() };
}

export async function passkeyRegistrationOptionsAction(currentPassword: string) {
  const s = await requireUser();
  return auth().passkeyRegistrationOptions(s, String(currentPassword));
}

export async function passkeyRegisterAction(challengeId: string, response: RegistrationResponseJSON, label: string) {
  const s = await requireUser();
  const r = await auth().passkeyRegister(s, String(challengeId), response, String(label ?? ''));
  if (r.ok) revalidatePath('/parametres');
  return r;
}

export async function removePasskeyAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireUser();
  const r = await auth().removePasskey(s, str(fd, 'currentPassword'), str(fd, 'id'));
  if (!r.ok) return { attempt: crypto.randomUUID(), errors: r.errors };
  revalidatePath('/parametres');
  return { ok: true, attempt: crypto.randomUUID(), message: 'Clé d’accès supprimée.' };
}

// ───────────── Double authentification ─────────────
export async function confirmTotpAction(_: FormState, fd: FormData): Promise<FormState> {
  // À la première connexion (session en attente) ou plus tard depuis Paramètres (session ouverte, sans code).
  const s = await currentSession();
  if (!s) redirect('/connexion');
  if (s.mfaEnrolled && s.mfaPassed) redirect('/tableau-de-bord');
  const r = await auth().confirmTotpEnrollment(s, str(fd, 'code'));
  if (!r.ok) return { errors: { form: r.error } };
  await setSessionCookie(r.token, s.remember);
  return { ok: true, recoveryCodes: r.recoveryCodes };
}

/** « Continuer sans double authentification » (choix de l'utilisateur, réversible dans Paramètres). */
export async function skipMfaAction(): Promise<void> {
  const s = await requirePendingMfa();
  const r = await auth().skipMfa(s);
  if (!r.ok) redirect('/mfa');
  await setSessionCookie(r.token, s.remember);
  redirect(await takeNext());
}

export async function verifyMfaAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requirePendingMfa();
  const r = await auth().verifyMfa(s, str(fd, 'code'));
  if (!r.ok) return { errors: { form: r.error } };
  await setSessionCookie(r.token, s.remember);
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

// ───────────── Documents & scanner ─────────────
export async function uploadDocumentAction(_: FormState, fd: FormData): Promise<FormState> {
  const ctx = await appContext();
  if (ctx.active.kind !== 'real') return { errors: { form: 'Choisissez votre profil (ou celui d’un proche) : le profil de démonstration est en lecture seule.' } };
  const files = fd.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  const payload = await Promise.all(files.map(async (f) => ({ name: f.name || 'document', data: Buffer.from(await f.arrayBuffer()) })));
  const values = { kind: str(fd, 'kind'), title: str(fd, 'title'), date: str(fd, 'date'), examType: str(fd, 'examType') };
  const details = { kind: (values.kind || null) as DocumentCategory | null, title: values.title || null, date: values.date || null, examType: (values.examType || null) as ExamType | null };
  let r;
  try {
    r = await documents().upload(ctx.user, ctx.active.access.profileId, payload, details);
  } catch (e) {
    if (e instanceof ForbiddenError) return { errors: { form: e.message }, values };
    throw e;
  }
  if (!r.ok) return { errors: { form: r.error }, values };
  revalidatePath('/documents');
  revalidatePath('/tableau-de-bord');
  redirect(`/documents/${r.documentId}${r.status === 'stored' ? '?enregistre=1' : ''}`);
}

export async function updateDocumentDetailsAction(_: FormState, fd: FormData): Promise<FormState> {
  const ctx = await appContext();
  if (ctx.active.kind !== 'real') return { errors: { form: 'Profil de démonstration en lecture seule.' } };
  const id = str(fd, 'documentId');
  try {
    const r = await documents().updateDetails(ctx.user, ctx.active.access.profileId, id, {
      kind: (str(fd, 'kind') || null) as DocumentCategory | null,
      title: str(fd, 'title') || null,
      date: str(fd, 'date') || null,
      examType: (str(fd, 'examType') || null) as ExamType | null,
      issuer: str(fd, 'issuer') || null,
    });
    if (!r.ok) return { errors: { form: r.error } };
  } catch (e) {
    if (e instanceof ForbiddenError) return { errors: { form: e.message } };
    throw e;
  }
  revalidatePath(`/documents/${id}`);
  revalidatePath('/documents');
  return { ok: true, message: 'Classement enregistré.' };
}

export async function enableAutoReadingAction(fd: FormData): Promise<void> {
  const ctx = await appContext();
  const id = str(fd, 'documentId');
  await documents().giveAutoReadingConsent(ctx.user);
  if (ctx.active.kind === 'real' && id) await documents().process(ctx.user, ctx.active.access.profileId, id);
  redirect(id ? `/documents/${id}` : '/documents');
}

export async function reviewPrescriptionAction(_: FormState, fd: FormData): Promise<FormState> {
  const ctx = await appContext();
  if (ctx.active.kind !== 'real') return { errors: { form: 'Profil invalide.' } };
  const documentId = str(fd, 'documentId');
  let decisions: unknown;
  try {
    decisions = JSON.parse(str(fd, 'decisions'));
  } catch {
    return { errors: { form: 'Formulaire invalide.' } };
  }
  if (!Array.isArray(decisions)) return { errors: { form: 'Formulaire invalide.' } };
  const text = (v: unknown) => (typeof v === 'string' ? v : undefined);
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String).slice(0, 12) : undefined);
  const clean = decisions
    .filter((d): d is Record<string, unknown> => typeof d === 'object' && d !== null)
    .map((d) => ({
      draftId: String(d.draftId ?? ''),
      action: d.action === 'confirm' ? ('confirm' as const) : ('ignore' as const),
      name: text(d.name),
      strength: text(d.strength),
      posology: text(d.posology),
      times: list(d.times),
      qty: list(d.qty),
      startDate: text(d.startDate),
      endDate: text(d.endDate),
    }));
  let r;
  try {
    r = await documents().reviewPrescription(ctx.user, ctx.active.access.profileId, documentId, { prescriber: str(fd, 'prescriber'), decisions: clean });
  } catch (e) {
    if (e instanceof ForbiddenError) return { errors: { form: e.message } };
    throw e;
  }
  if (!r.ok) {
    const flat: Record<string, string | undefined> = {};
    for (const [id, errs] of Object.entries(r.draftErrors ?? {})) flat[id] = Object.values(errs).filter(Boolean).join(' ');
    return { attempt: crypto.randomUUID(), errors: { form: r.error }, fieldErrors: flat };
  }
  redirect(`/documents/${documentId}?traitements=${r.saved}`);
}

export async function reviewDocumentAction(_: FormState, fd: FormData): Promise<FormState> {
  const ctx = await appContext();
  if (ctx.active.kind !== 'real') return { errors: { form: 'Profil invalide.' } };
  const documentId = str(fd, 'documentId');
  let decisions: unknown;
  try {
    decisions = JSON.parse(str(fd, 'decisions'));
  } catch {
    return { errors: { form: 'Formulaire invalide.' } };
  }
  if (!Array.isArray(decisions)) return { errors: { form: 'Formulaire invalide.' } };
  const clean = decisions
    .filter((d): d is Record<string, unknown> => typeof d === 'object' && d !== null)
    .map((d) => ({
      draftId: String(d.draftId ?? ''),
      action: d.action === 'confirm' ? ('confirm' as const) : ('ignore' as const),
      analyteCode: typeof d.analyteCode === 'string' ? d.analyteCode : undefined,
      value: typeof d.value === 'string' ? d.value : undefined,
      unit: typeof d.unit === 'string' ? d.unit : undefined,
      refLow: typeof d.refLow === 'string' ? d.refLow : undefined,
      refHigh: typeof d.refHigh === 'string' ? d.refHigh : undefined,
    }));
  let r;
  try {
    r = await documents().review(ctx.user, ctx.active.access.profileId, documentId, {
      sampledOn: str(fd, 'sampledOn'),
      laboratory: str(fd, 'laboratory'),
      decisions: clean,
    });
  } catch (e) {
    if (e instanceof ForbiddenError) return { errors: { form: e.message } };
    throw e;
  }
  if (!r.ok) {
    const flat: Record<string, string | undefined> = {};
    for (const [id, errs] of Object.entries(r.draftErrors ?? {})) flat[id] = Object.values(errs).filter(Boolean).join(' ');
    return { attempt: crypto.randomUUID(), errors: { form: r.error }, fieldErrors: flat };
  }
  redirect(`/documents/${documentId}?valide=${r.saved}`);
}

export async function deleteDocumentAction(fd: FormData): Promise<void> {
  const ctx = await appContext();
  if (ctx.active.kind === 'real') await documents().remove(ctx.user, ctx.active.access.profileId, str(fd, 'documentId'));
  redirect('/documents?supprime=1');
}

/** Ordonnance qui est en fait un bilan sanguin : rangée comme bilan, lecture des analyses relancée. */
export async function reclassifyAsLabReportAction(fd: FormData): Promise<void> {
  const ctx = await appContext();
  const id = str(fd, 'documentId');
  if (ctx.active.kind === 'real' && id) await documents().reclassifyAsLabReport(ctx.user, ctx.active.access.profileId, id);
  revalidatePath('/documents');
  redirect(id ? `/documents/${id}` : '/documents');
}

// ───────────── Insuline & traitements ─────────────
async function realInsulinCtx() {
  const ctx = await appContext();
  if (ctx.active.kind !== 'real') return null;
  return { ctx, profileId: ctx.active.access.profileId };
}
const DEMO_RO = 'Le profil de démonstration est en lecture seule : choisissez votre profil pour noter une injection.';

export async function addDoseAction(_: FormState, fd: FormData): Promise<FormState> {
  const r0 = await realInsulinCtx();
  const values = { productId: str(fd, 'productId'), units: str(fd, 'units'), date: str(fd, 'date'), time: str(fd, 'time'), status: str(fd, 'status'), comment: str(fd, 'comment') };
  if (!r0) return { errors: { form: DEMO_RO }, values };
  let r;
  try {
    r = await insulin().addDose(r0.ctx.user, r0.profileId, { ...values, acceptDuplicate: fd.get('acceptDuplicate') === 'on' });
  } catch (e) {
    if (e instanceof ForbiddenError) return { attempt: crypto.randomUUID(), errors: { form: e.message }, values };
    throw e;
  }
  if (!r.ok) {
    if ('duplicate' in r) return { attempt: crypto.randomUUID(), duplicate: true, errors: { form: r.message }, values };
    return { attempt: crypto.randomUUID(), fieldErrors: r.errors, errors: { form: 'Vérifiez les champs signalés.' }, values };
  }
  revalidatePath('/traitements');
  return { attempt: crypto.randomUUID(), ok: true, message: `Injection notée : ${values.units.replace('.', ',')} U.`, values: { productId: values.productId } };
}

export async function deleteDoseAction(fd: FormData): Promise<void> {
  const r0 = await realInsulinCtx();
  if (r0) await insulin().deleteDose(r0.ctx.user, r0.profileId, str(fd, 'doseId'));
  redirect(`/traitements?${new URLSearchParams({ periode: str(fd, 'periode') || '7' })}`);
}

export async function addProductAction(_: FormState, fd: FormData): Promise<FormState> {
  const r0 = await realInsulinCtx();
  if (!r0) return { errors: { form: DEMO_RO } };
  try {
    const r = await insulin().addProduct(r0.ctx.user, r0.profileId, { name: str(fd, 'name'), type: str(fd, 'type') });
    if (!r.ok) return { attempt: crypto.randomUUID(), errors: { form: r.error }, values: { name: str(fd, 'name'), type: str(fd, 'type') } };
  } catch (e) {
    if (e instanceof ForbiddenError) return { errors: { form: e.message } };
    throw e;
  }
  revalidatePath('/traitements');
  // Première insuline : la page change entièrement (journal des injections), la confirmation y est affichée.
  if (str(fd, 'first') === '1') redirect('/traitements?ajout=insuline');
  return { attempt: crypto.randomUUID(), ok: true, message: 'Insuline ajoutée.' };
}

export async function archiveProductAction(fd: FormData): Promise<void> {
  const r0 = await realInsulinCtx();
  if (r0) await insulin().archiveProduct(r0.ctx.user, r0.profileId, str(fd, 'productId'));
  redirect('/traitements');
}

export async function addChangeAction(_: FormState, fd: FormData): Promise<FormState> {
  const r0 = await realInsulinCtx();
  const values = {
    subject: str(fd, 'subject'),
    effectiveDate: str(fd, 'effectiveDate'),
    previousRegimen: str(fd, 'previousRegimen'),
    newRegimen: str(fd, 'newRegimen'),
    prescribedBy: str(fd, 'prescribedBy'),
    goalNote: str(fd, 'goalNote'),
  };
  if (!r0) return { errors: { form: DEMO_RO }, values };
  try {
    const r = await insulin().addChange(r0.ctx.user, r0.profileId, values);
    if (!r.ok) return { attempt: crypto.randomUUID(), fieldErrors: r.errors, errors: { form: 'Vérifiez les champs signalés.' }, values };
  } catch (e) {
    if (e instanceof ForbiddenError) return { attempt: crypto.randomUUID(), errors: { form: e.message }, values };
    throw e;
  }
  revalidatePath('/traitements');
  return { attempt: crypto.randomUUID(), ok: true, message: 'Modification enregistrée.' };
}

export async function deleteChangeAction(fd: FormData): Promise<void> {
  const r0 = await realInsulinCtx();
  if (r0) await insulin().deleteChange(r0.ctx.user, r0.profileId, str(fd, 'changeId'));
  redirect('/traitements');
}

// ───────────── Journal des repas et événements ─────────────
export async function addJournalAction(_: FormState, fd: FormData): Promise<FormState> {
  const ctx = await appContext();
  const values = {
    kind: str(fd, 'kind'),
    mealKind: str(fd, 'mealKind'),
    date: str(fd, 'date'),
    time: str(fd, 'time'),
    endTime: str(fd, 'endTime'),
    description: str(fd, 'description'),
    quantities: str(fd, 'quantities'),
    carbs: str(fd, 'carbs'),
    intensity: str(fd, 'intensity'),
    comment: str(fd, 'comment'),
  };
  if (ctx.active.kind !== 'real') return { errors: { form: 'Le profil de démonstration est en lecture seule : choisissez votre profil.' }, values };
  let r;
  try {
    r = await journal().add(ctx.user, ctx.active.access.profileId, values);
  } catch (e) {
    if (e instanceof ForbiddenError) return { attempt: crypto.randomUUID(), errors: { form: e.message }, values };
    throw e;
  }
  if (!r.ok) return { attempt: crypto.randomUUID(), fieldErrors: r.errors, errors: { form: 'Vérifiez les champs signalés.' }, values };
  revalidatePath('/journal');
  return { attempt: crypto.randomUUID(), ok: true, message: 'Ajouté au journal.', values: { kind: values.kind, date: values.date } };
}

export async function deleteJournalAction(fd: FormData): Promise<void> {
  const ctx = await appContext();
  if (ctx.active.kind === 'real') await journal().remove(ctx.user, ctx.active.access.profileId, str(fd, 'entryId'));
  redirect(`/journal?${new URLSearchParams({ jour: str(fd, 'jour') })}`);
}

// ───────────── Rendez-vous ─────────────
export async function saveAppointmentAction(_: FormState, fd: FormData): Promise<FormState> {
  const ctx = await appContext();
  const values = {
    date: str(fd, 'date'),
    time: str(fd, 'time'),
    specialty: str(fd, 'specialty'),
    practitioner: str(fd, 'practitioner'),
    location: str(fd, 'location'),
    reason: str(fd, 'reason'),
    toPrepare: str(fd, 'toPrepare'),
    reminder: str(fd, 'reminder'),
    notesAfter: str(fd, 'notesAfter'),
  };
  if (ctx.active.kind !== 'real') return { errors: { form: 'Le profil de démonstration est en lecture seule : choisissez votre profil.' }, values };
  const id = str(fd, 'id') || undefined;
  let r;
  try {
    r = await appointments().save(ctx.user, ctx.active.access.profileId, values, id);
  } catch (e) {
    if (e instanceof ForbiddenError) return { attempt: crypto.randomUUID(), errors: { form: e.message }, values };
    throw e;
  }
  if (!r.ok) return { attempt: crypto.randomUUID(), fieldErrors: r.errors, errors: { form: 'Vérifiez les champs signalés.' }, values };
  redirect(`/rendez-vous/${r.id}?${id ? 'modifie' : 'cree'}=1`);
}

export async function deleteAppointmentAction(fd: FormData): Promise<void> {
  const ctx = await appContext();
  if (ctx.active.kind === 'real') await appointments().remove(ctx.user, ctx.active.access.profileId, str(fd, 'id'));
  redirect('/rendez-vous?supprime=1');
}

export async function linkAppointmentAction(fd: FormData): Promise<void> {
  const ctx = await appContext();
  const id = str(fd, 'id');
  const target = str(fd, 'target'); // « doc:<uuid> » ou « lab:<uuid> »
  if (ctx.active.kind === 'real' && target) {
    const [kind, ref] = target.split(':');
    await appointments().link(ctx.user, ctx.active.access.profileId, id, kind === 'doc' ? { documentId: ref } : { labResultId: ref });
  }
  redirect(`/rendez-vous/${id}`);
}

export async function unlinkAppointmentAction(fd: FormData): Promise<void> {
  const ctx = await appContext();
  if (ctx.active.kind === 'real') await appointments().unlink(ctx.user, ctx.active.access.profileId, str(fd, 'linkId'));
  redirect(`/rendez-vous/${str(fd, 'id')}`);
}

// ───────────── Compte : mot de passe, adresse e-mail, codes de secours ─────────────
export async function changePasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireUser();
  const r = await auth().changePassword(s, str(fd, 'currentPassword'), str(fd, 'password'));
  if (!r.ok) return { attempt: crypto.randomUUID(), errors: r.errors };
  return {
    ok: true,
    attempt: crypto.randomUUID(),
    message: `Mot de passe modifié.${r.closedSessions ? ` ${r.closedSessions} autre(s) appareil(s) déconnecté(s).` : ''} Un e-mail de confirmation vous a été envoyé.`,
  };
}

export async function requestEmailChangeAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireUser();
  const values = { email: str(fd, 'email') };
  const r = await auth().requestEmailChange(s, str(fd, 'currentPassword'), values.email);
  if (!r.ok) return { attempt: crypto.randomUUID(), errors: r.errors, values };
  return {
    ok: true,
    attempt: crypto.randomUUID(),
    message: `Un lien de confirmation a été envoyé à ${r.sentTo}. Votre adresse actuelle reste active tant qu’il n’a pas été ouvert (valable 24 h).`,
  };
}

/** Depuis le lien reçu : fonctionne sans être connecté (le lien prouve l'accès à la nouvelle adresse). */
export async function confirmEmailChangeAction(_: FormState, fd: FormData): Promise<FormState> {
  const r = await auth().confirmEmailChange(str(fd, 'token'));
  return r.ok ? { ok: true, message: `Adresse modifiée : votre compte utilise désormais ${r.email}.` } : { ok: false, message: r.error };
}

export async function regenerateRecoveryCodesAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireUser();
  const r = await auth().regenerateRecoveryCodes(s, str(fd, 'currentPassword'));
  if (!r.ok) return { attempt: crypto.randomUUID(), errors: r.errors };
  return { ok: true, attempt: crypto.randomUUID(), recoveryCodes: r.recoveryCodes };
}

/** Changement de téléphone, étape 1 : nouvelle clé et QR code (l'ancienne application reste valable). */
export async function beginTotpReplacementAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireUser();
  const r = await auth().beginTotpReplacement(s, str(fd, 'currentPassword'));
  if (!r.ok) return { attempt: crypto.randomUUID(), errors: r.errors };
  return { ok: true, attempt: crypto.randomUUID(), values: { secret: r.secret, qrSvg: await totpQrSvg(r.uri) } };
}

/** Changement de téléphone, étape 2 : un code de la nouvelle application la rend active. */
export async function confirmTotpReplacementAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireUser();
  const r = await auth().confirmTotpReplacement(s, str(fd, 'code'));
  if (!r.ok) return { attempt: crypto.randomUUID(), errors: { form: r.error } };
  return { ok: true, message: 'Nouveau téléphone enregistré : l’ancienne application ne fonctionne plus. Vos codes de secours restent valables.' };
}

// ───────────── Partage sécurisé avec un professionnel de santé ─────────────
/** Crée un rapport figé et son lien de partage. Le lien et le code ne sont affichés qu'une fois. */
export async function createShareAction(_: FormState, fd: FormData): Promise<FormState> {
  const ctx = await appContext();
  const values = { recipient: str(fd, 'recipient'), duration: str(fd, 'duration'), maxViews: str(fd, 'maxViews'), jours: str(fd, 'jours') };
  if (ctx.active.kind !== 'real') return { attempt: crypto.randomUUID(), errors: { form: 'Le profil de démonstration ne peut pas être partagé.' }, values };
  const days = [7, 30, 90, 180].includes(Number(values.jours)) ? Number(values.jours) : 30;
  const sections = fd.getAll('s').map(String).filter((x): x is SectionKey => (SECTION_KEYS as readonly string[]).includes(x));
  if (!sections.length) return { attempt: crypto.randomUUID(), errors: { form: 'Choisissez au moins une rubrique.' }, values };
  const to = demoToday();
  const from = addDays(to, -(days - 1));
  let r;
  try {
    const data = await collectReport(ctx, from, to, sections);
    // Seules les rubriques réellement autorisées figurent dans le rapport (les autres sont signalées).
    const pdf = await buildReportPdf(data);
    r = await sharing().create(ctx.user, ctx.active.access.profileId, {
      pdf,
      periodStart: formatLocalDate(from),
      periodEnd: formatLocalDate(to),
      sections: sections.filter((x) => !data.notAuthorized.includes(x)),
      recipient: values.recipient,
      duration: values.duration,
      maxViews: values.maxViews,
      sharerName: ctx.active.access.displayName,
    });
  } catch (e) {
    if (e instanceof ForbiddenError) return { attempt: crypto.randomUUID(), errors: { form: e.message }, values };
    throw e;
  }
  if (!r.ok) return { attempt: crypto.randomUUID(), errors: { form: r.error }, values };
  revalidatePath('/rapports');
  const base = (process.env.BILANX_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return {
    ok: true,
    attempt: crypto.randomUUID(),
    values: {
      link: `${base}/partage/${r.token}`,
      code: r.code,
      expires: new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'long', timeStyle: 'short' }).format(r.expiresAt),
    },
  };
}

export async function revokeShareAction(fd: FormData): Promise<void> {
  const ctx = await appContext();
  if (ctx.active.kind === 'real') await sharing().revoke(ctx.user, ctx.active.access.profileId, str(fd, 'id'));
  redirect('/rapports?partage=revoque#partages');
}

const viewerCookie = (token: string) => ({ name: 'bilanx_partage', path: `/partage/${token}` });

/** Page publique : saisie du code transmis par le patient. */
export async function openShareAction(token: string, _: FormState, fd: FormData): Promise<FormState> {
  const r = await sharing().open(String(token), str(fd, 'code'), await clientInfo());
  const messages: Record<string, string> = {
    not_found: 'Ce lien de partage n’existe pas.',
    expired: 'Ce partage a expiré. Demandez un nouveau lien à votre patient.',
    revoked: 'Ce partage a été arrêté par la personne qui l’avait créé.',
    locked: 'Trop de codes erronés : ce partage est verrouillé. Demandez un nouveau lien à votre patient.',
    exhausted: 'Le nombre d’ouvertures autorisé est atteint. Demandez un nouveau lien à votre patient.',
  };
  if (r.status === 'wrong_code')
    return { attempt: crypto.randomUUID(), errors: { form: `Code incorrect. Encore ${r.attemptsLeft} essai${r.attemptsLeft > 1 ? 's' : ''} avant verrouillage.` } };
  if (r.status !== 'ok') return { attempt: crypto.randomUUID(), errors: { form: messages[r.status] ?? 'Accès impossible.' } };
  const c = viewerCookie(String(token));
  (await cookies()).set(c.name, r.viewerToken, { httpOnly: true, secure: COOKIE_SECURE, sameSite: 'strict', path: c.path, maxAge: SHARE_VIEWER_MINUTES * 60 });
  redirect(`/partage/${encodeURIComponent(String(token))}`);
}

// ───────────── Rappels par notification ─────────────
/** Appelées par le composant client après l'autorisation du navigateur. */
export async function pushSubscribeAction(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, showNames: boolean): Promise<{ ok: boolean; error?: string }> {
  const ctx = await appContext();
  if (ctx.active.kind !== 'real') return { ok: false, error: 'Indisponible pour le profil de démonstration.' };
  const r = await reminders().subscribe(ctx.user, sub, (await clientInfo()).userAgent);
  if (!r.ok) return r;
  try {
    await reminders().setPrefs(ctx.user, ctx.active.access.profileId, true, !!showNames);
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
  revalidatePath('/medicaments');
  return { ok: true };
}

export async function reminderPrefsAction(enabled: boolean, showNames: boolean): Promise<{ ok: boolean; error?: string }> {
  const ctx = await appContext();
  if (ctx.active.kind !== 'real') return { ok: false, error: 'Indisponible pour le profil de démonstration.' };
  try {
    await reminders().setPrefs(ctx.user, ctx.active.access.profileId, !!enabled, !!showNames);
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
  revalidatePath('/medicaments');
  return { ok: true };
}

export async function pushUnsubscribeAction(endpoint: string): Promise<void> {
  const user = await requireUser();
  await reminders().unsubscribe({ accountId: user.accountId, email: user.email, displayName: user.displayName ?? '' }, String(endpoint));
  revalidatePath('/medicaments');
}

export async function sendTestPushAction(): Promise<{ sent: number; devices: number }> {
  const user = await requireUser();
  return reminders().sendTest({ accountId: user.accountId, email: user.email, displayName: user.displayName ?? '' });
}

export async function removeDeviceAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  await reminders().removeDevice({ accountId: user.accountId, email: user.email, displayName: user.displayName ?? '' }, str(fd, 'id'));
  redirect('/medicaments#rappels');
}

// ───────────── Unités d'affichage d'un profil ─────────────
export async function setDisplayUnitsAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const profileId = str(fd, 'profileId');
  await profiles().setDisplayUnits({ accountId: user.accountId, email: user.email, displayName: user.displayName ?? '' }, profileId, {
    glucose: str(fd, 'glucose'),
    hba1c: str(fd, 'hba1c'),
  });
  revalidatePath('/', 'layout');
  redirect(`/famille/${profileId}?unites=1`);
}

// ───────────── Médicaments ─────────────
function medicationValues(fd: FormData) {
  const times = fd.getAll('times').map(String);
  const qty = fd.getAll('qty').map(String);
  return {
    form: {
      name: str(fd, 'name'),
      strength: str(fd, 'strength'),
      posology: str(fd, 'posology'),
      startDate: str(fd, 'startDate'),
      endDate: str(fd, 'endDate'),
      prescriber: str(fd, 'prescriber'),
      effectiveDate: str(fd, 'effectiveDate'),
      // Horaires renvoyés au formulaire pour ne rien perdre en cas d'erreur.
      slots: JSON.stringify(times.map((t, i) => ({ time: t, qty: qty[i] ?? '' }))),
    },
    times,
    qty,
  };
}

/** Ajout, correction (`id`) ou nouvelle prescription (`id` + `mode=change`). */
export async function saveMedicationAction(_: FormState, fd: FormData): Promise<FormState> {
  const ctx = await appContext();
  const { form: values, times, qty } = medicationValues(fd);
  if (ctx.active.kind !== 'real') return { errors: { form: 'Le profil de démonstration est en lecture seule : choisissez votre profil.' }, values };
  const id = str(fd, 'id') || undefined;
  const isChange = !!id && str(fd, 'mode') === 'change';
  const input = { ...values, times, qty };
  let r;
  try {
    r = isChange
      ? await medications().change(ctx.user, ctx.active.access.profileId, id, input, values.effectiveDate)
      : await medications().save(ctx.user, ctx.active.access.profileId, input, id);
  } catch (e) {
    if (e instanceof ForbiddenError) return { attempt: crypto.randomUUID(), errors: { form: e.message }, values };
    throw e;
  }
  if (!r.ok) {
    const fe: Record<string, string | undefined> = { ...r.errors };
    if (isChange && fe.startDate) fe.effectiveDate = fe.startDate;
    return { attempt: crypto.randomUUID(), fieldErrors: fe, errors: { form: 'Vérifiez les champs signalés.' }, values };
  }
  redirect(`/medicaments/${r.id}?${isChange ? 'change' : id ? 'modifie' : 'cree'}=1`);
}

export async function stopMedicationAction(_: FormState, fd: FormData): Promise<FormState> {
  const ctx = await appContext();
  const values = { date: str(fd, 'date'), reason: str(fd, 'reason') };
  if (ctx.active.kind !== 'real') return { errors: { form: 'Le profil de démonstration est en lecture seule.' }, values };
  const id = str(fd, 'id');
  let r;
  try {
    r = await medications().stop(ctx.user, ctx.active.access.profileId, id, values.date, values.reason);
  } catch (e) {
    if (e instanceof ForbiddenError) return { attempt: crypto.randomUUID(), errors: { form: e.message }, values };
    throw e;
  }
  if (!r.ok) return { attempt: crypto.randomUUID(), errors: { form: r.error }, values };
  redirect(`/medicaments/${id}?arrete=1`);
}

export async function deleteMedicationAction(fd: FormData): Promise<void> {
  const ctx = await appContext();
  if (ctx.active.kind === 'real') await medications().remove(ctx.user, ctx.active.access.profileId, str(fd, 'id'));
  redirect('/medicaments?supprime=1');
}

/** Prise renseignée depuis la liste du jour : « taken », « skipped » ou « clear » (annuler la saisie). */
export async function recordIntakeAction(fd: FormData): Promise<void> {
  const ctx = await appContext();
  const st = str(fd, 'status');
  const status = st === 'taken' || st === 'skipped' ? st : null;
  if (ctx.active.kind === 'real') {
    await medications().record(ctx.user, ctx.active.access.profileId, str(fd, 'medicationId'), new Date(str(fd, 'at')), status);
  }
  const jour = str(fd, 'jour');
  // Pas d'ancre (#) : une redirection vers la même adresse avec une ancre ne recharge pas la page.
  revalidatePath('/medicaments');
  redirect(`/medicaments${/^\d{4}-\d{2}-\d{2}$/.test(jour) ? `?jour=${jour}` : ''}`);
}

// ───────────── Droits RGPD ─────────────
export async function withdrawAutoReadingAction(): Promise<void> {
  const s = await requireUser();
  await privacy().withdrawAutoReading(s);
  redirect('/parametres?consentement=retire');
}

export async function giveAutoReadingAction(): Promise<void> {
  const s = await requireUser();
  await documents().giveAutoReadingConsent(s);
  redirect('/parametres?consentement=donne');
}

export async function requestAccountDeletionAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireUser();
  if (str(fd, 'confirm').trim().toUpperCase() !== 'SUPPRIMER') return { errors: { form: 'Saisissez SUPPRIMER pour confirmer.' } };
  const r = await privacy().requestAccountDeletion(s, str(fd, 'password'));
  if (!r.ok) return { errors: { form: r.error } };
  redirect('/parametres?suppression=programmee');
}

export async function cancelAccountDeletionAction(): Promise<void> {
  const s = await requireUser();
  await privacy().cancelAccountDeletion(s);
  redirect('/parametres?suppression=annulee');
}

export async function deleteProfileAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireUser();
  const profileId = str(fd, 'profileId');
  try {
    const r = await privacy().deleteProfile(s, profileId, str(fd, 'confirmName'));
    if (!r.ok) return { errors: { form: r.error } };
  } catch (e) {
    if (e instanceof ForbiddenError) return { errors: { form: e.message } };
    throw e;
  }
  (await cookies()).delete(PROFILE_COOKIE);
  redirect('/famille?profil-supprime=1');
}

// ───────────── Glycémie capillaire ─────────────
export async function addGlucoseAction(_: FormState, fd: FormData): Promise<FormState> {
  const ctx = await appContext();
  const attempt = crypto.randomUUID();
  if (ctx.active.kind !== 'real') return { attempt, errors: { form: 'Profil de démonstration en lecture seule.' } };
  const unitRaw = str(fd, 'unit');
  const unit = isGlucoseUnit(unitRaw) ? unitRaw : 'mg/dL';
  const values = { value: str(fd, 'value'), date: str(fd, 'date'), time: str(fd, 'time'), context: str(fd, 'context') };
  try {
    const r = await glucose().addCapillary(ctx.user, ctx.active.access.profileId, { ...values, unit });
    if (!r.ok) return { attempt, fieldErrors: r.errors, values };
  } catch (e) {
    if (e instanceof ForbiddenError) return { attempt, errors: { form: e.message } };
    throw e;
  }
  revalidatePath('/tableau-de-bord');
  redirect(`/glycemie?jour=${encodeURIComponent(values.date)}&ajoute=${encodeURIComponent(`${values.value} ${unit} à ${values.time}`)}#ajouter-glycemie`);
}

export async function removeGlucoseAction(fd: FormData): Promise<void> {
  const ctx = await appContext();
  if (ctx.active.kind === 'real') await glucose().removeCapillary(ctx.user, ctx.active.access.profileId, new Date(str(fd, 'at')));
  revalidatePath('/glycemie');
  revalidatePath('/tableau-de-bord');
}

// ───────────── Activité ─────────────
export async function setStepsGoalAction(_: FormState, fd: FormData): Promise<FormState> {
  const ctx = await appContext();
  if (ctx.active.kind !== 'real') return { errors: { form: 'Profil de démonstration en lecture seule.' } };
  try {
    const r = await activity().setGoal(ctx.user, ctx.active.access.profileId, Number(str(fd, 'goal').replace(/\s/g, '')));
    if (!r.ok) return { attempt: crypto.randomUUID(), errors: { form: r.error } };
  } catch (e) {
    if (e instanceof ForbiddenError) return { errors: { form: e.message } };
    throw e;
  }
  revalidatePath('/activite');
  return { attempt: crypto.randomUUID(), ok: true, message: 'Objectif enregistré.' };
}

export async function addStepsAction(_: FormState, fd: FormData): Promise<FormState> {
  const ctx = await appContext();
  if (ctx.active.kind !== 'real') return { attempt: crypto.randomUUID(), errors: { form: 'Profil de démonstration en lecture seule.' } };
  const day = str(fd, 'day');
  const raw = str(fd, 'steps').replace(/[\s\u00a0\u202f.]/g, '');
  const steps = /^\d+$/.test(raw) ? Number(raw) : NaN;
  try {
    const r = await activity().setManualDay(ctx.user, ctx.active.access.profileId, day, steps);
    if (!r.ok) return { attempt: crypto.randomUUID(), errors: { form: r.error }, values: { day, steps: str(fd, 'steps') } };
  } catch (e) {
    if (e instanceof ForbiddenError) return { attempt: crypto.randomUUID(), errors: { form: e.message } };
    throw e;
  }
  revalidatePath('/activite');
  revalidatePath('/tableau-de-bord');
  return { attempt: crypto.randomUUID(), ok: true, message: `${steps.toLocaleString('fr-FR')} pas enregistrés pour le ${new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', dateStyle: 'long' }).format(new Date(`${day}T12:00:00Z`))}.` };
}

export async function removeStepsAction(fd: FormData): Promise<void> {
  const ctx = await appContext();
  if (ctx.active.kind === 'real') await activity().removeManualDay(ctx.user, ctx.active.access.profileId, str(fd, 'day'));
  revalidatePath('/activite');
  revalidatePath('/tableau-de-bord');
}

/** Salle de sport : coche (present=1) ou décoche (present=0) un jour. Profil de démonstration : sans effet. */
export async function toggleGymAction(fd: FormData): Promise<void> {
  const ctx = await appContext();
  if (ctx.active.kind !== 'real') return;
  try {
    await gym().setVisit(ctx.user, ctx.active.access.profileId, str(fd, 'day'), str(fd, 'present') === '1');
  } catch (e) {
    if (!(e instanceof ForbiddenError)) throw e; // lecture seule : rien n'est modifié
  }
  revalidatePath('/tableau-de-bord');
  revalidatePath('/salle-de-sport');
}

export async function clearActivityAction(): Promise<void> {
  const ctx = await appContext();
  if (ctx.active.kind === 'real') await activity().clear(ctx.user, ctx.active.access.profileId);
  redirect('/activite?efface=1');
}
