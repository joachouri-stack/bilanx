import type { Metadata } from 'next';
import Link from 'next/link';
import { auth, privacy, requireUser } from '@/lib/server/auth';
import { DeleteAccountForm } from '@/components/privacy-forms';
import {
  cancelAccountDeletionAction,
  giveAutoReadingAction,
  revokeOtherSessionsAction,
  revokeSessionAction,
  signOutAction,
  withdrawAutoReadingAction,
} from '@/lib/server/actions';
import { Button, buttonClass, Card, CardHeader, Chip, Meta, PageHeader } from '@/components/ui';
import { Icon } from '@/components/icon';
import { InstallApp } from '@/components/install-app';
import { PasskeyManager } from '@/components/passkey-forms';
import { ChangeEmailForm, ChangePasswordForm, RegenerateRecoveryCodesForm, ReplaceTotpForm } from '@/components/account-forms';

export const metadata: Metadata = { title: 'Paramètres' };

const METHOD: Record<string, string> = {
  password: 'Mot de passe',
  passkey: 'Clé d’accès',
  totp: 'Double authentification',
  recovery_code: 'Code de secours',
  mfa: 'Double authentification',
};

/** Description lisible d'un navigateur, sans bibliothèque d'analyse d'en-têtes. */
function deviceLabel(ua: string | null): string {
  if (!ua) return 'Appareil inconnu';
  const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Autre';
  const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navigateur';
  return `${br} · ${os}`;
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ 'codes-restants'?: string; consentement?: string; suppression?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const [sessions, events, consents, deletionAt, codesLeft, passkeys] = await Promise.all([
    auth().listSessions(user.accountId),
    auth().listLoginEvents(user.accountId, 15),
    privacy().listConsents(user.accountId),
    privacy().deletionStatus(user.accountId),
    auth().recoveryCodesLeft(user.accountId),
    auth().listPasskeys(user.accountId),
  ]);
  const autoReading = consents.some((c) => c.purpose === 'ai_extraction' && !c.withdrawn_at);
  const fmtLong = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' });
  const fmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' });
  const left = sp['codes-restants'];

  const hm = (d: Date) => fmt.format(d).replace(/(\d{2}):(\d{2})/, '$1 h $2');
  const fold = (id: string, title: React.ReactNode, children: React.ReactNode, open?: boolean) => (
    <details className="group rounded-xl border border-line px-3.5" id={id} open={open}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 font-medium text-petrol [&::-webkit-details-marker]:hidden">
        {title}
        <Icon name="chevronDown" className="size-5 shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
      </summary>
      <div className="pb-4 pt-1">{children}</div>
    </details>
  );

  return (
    <div className="fade-in">
      <PageHeader title="Paramètres" subtitle="Compte et sécurité" />
      {left !== undefined && (
        <p role="status" className="mb-4 rounded-xl bg-amber-2 px-4 py-3 text-sm">
          Vous vous êtes connecté avec un code de secours. Il vous en reste <strong>{left}</strong>. Téléphone perdu ? Utilisez{' '}
          <a href="#telephone" className="font-medium text-petrol underline">
            « Changer de téléphone »
          </a>{' '}
          ci-dessous.
        </p>
      )}
      {deletionAt && (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red bg-red-2 px-4 py-3 text-sm">
          <span>
            <strong>Suppression du compte programmée le {fmtLong.format(deletionAt)}.</strong> Vos profils gérés et leurs données seront alors effacés.
          </span>
          <form action={cancelAccountDeletionAction}>
            <Button type="submit">Annuler la suppression</Button>
          </form>
        </div>
      )}
      {sp.suppression === 'annulee' && (
        <p role="status" className="mb-4 rounded-xl bg-sage-2 px-4 py-3 text-sm">
          Suppression annulée : votre compte est conservé.
        </p>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Mon compte" />
          <dl className="grid grid-cols-1 gap-x-4 text-sm sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-y-2">
            <dt className="text-ink-3">Prénom</dt>
            <dd>{user.displayName}</dd>
            <dt className="mt-3 text-ink-3 sm:mt-0">E-mail</dt>
            <dd className="min-w-0">
              <span className="[overflow-wrap:anywhere]">{user.email}</span> <Chip tone="sage">vérifié</Chip>
            </dd>
            <dt className="mt-3 text-ink-3 sm:mt-0">Double authentification</dt>
            <dd>
              {user.mfaEnrolled ? (
                <>
                  <Chip tone="sage">activée</Chip> <span className="text-ink-3">· application d’authentification</span>
                </>
              ) : (
                <>
                  <Chip tone="amber">désactivée</Chip>{' '}
                  <Link href="/mfa/configuration" className="inline-flex min-h-11 items-center px-1 font-medium text-petrol underline">
                    Activer
                  </Link>
                </>
              )}
            </dd>
          </dl>
          {user.profileId && (
            <p className="mt-3 text-sm">
              <Link href={`/famille/${user.profileId}#unites`} className="inline-flex min-h-11 items-center text-petrol underline">
                Unités d’affichage (glycémie, HbA1c)
              </Link>
            </p>
          )}
          <div className="mt-3 flex flex-col gap-2.5">
            {fold('mot-de-passe', 'Changer mon mot de passe', <ChangePasswordForm />)}
            {fold('adresse', 'Changer mon adresse e-mail', <ChangeEmailForm current={user.email} />)}
            {fold(
              'cles',
              <>Clés d’accès (Face ID, empreinte){passkeys.length ? ` · ${passkeys.length}` : ''}</>,
              <PasskeyManager
                keys={passkeys.map((k) => ({
                  id: k.id,
                  label: k.label ?? 'Clé d’accès',
                  createdAt: fmt.format(k.created_at),
                  lastUsedAt: k.last_used_at ? hm(k.last_used_at) : null,
                }))}
              />,
            )}
            {user.mfaEnrolled && fold('telephone', 'Changer de téléphone (double authentification)', <ReplaceTotpForm />)}
            {user.mfaEnrolled && fold('codes', 'Codes de secours', <RegenerateRecoveryCodesForm left={codesLeft} />, codesLeft <= 3)}
          </div>
          <form action={signOutAction} className="mt-5">
            <Button type="submit">Se déconnecter</Button>
          </form>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader title="Sessions ouvertes" />
            <ul className="divide-y divide-line">
              {sessions.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5">
                  <span className="min-w-0 text-sm">
                    <span className="block font-medium">
                      {deviceLabel(s.user_agent)} {s.id === user.sessionId && <Chip tone="petrol">cet appareil</Chip>}
                    </span>
                    <Meta>
                      Dernière activité le {hm(s.last_seen_at)}
                      {!s.mfa_passed && ' · double authentification non terminée'}
                    </Meta>
                  </span>
                  <form action={revokeSessionAction}>
                    <input type="hidden" name="sessionId" value={s.id} />
                    <Button type="submit" variant="ghost" className="text-red hover:bg-red-2">
                      {s.id === user.sessionId ? 'Se déconnecter' : 'Fermer'}
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
            {sessions.length > 1 && (
              <form action={revokeOtherSessionsAction} className="mt-2">
                <Button type="submit">Déconnecter les autres appareils</Button>
              </form>
            )}
            <Meta className="mt-2">Sans « Rester connecté », la session se ferme après 30 minutes sans activité. Appareil perdu : fermez sa session ici.</Meta>
          </Card>
          <InstallApp />
        </div>

        <Card className="lg:col-span-2">
          <CardHeader title="Historique des connexions" />
          <ul className="divide-y divide-line sm:hidden">
            {events.map((e, i) => (
              <li key={i} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block font-medium">{METHOD[e.method] ?? e.method}</span>
                  <Meta>
                    {hm(e.occurred_at)}
                    {e.user_agent ? ` · ${deviceLabel(e.user_agent)}` : ''}
                  </Meta>
                </span>
                {e.success ? <Chip tone="sage">réussie</Chip> : <Chip tone="red">échec</Chip>}
              </li>
            ))}
          </ul>
          <table className="hidden w-full text-sm sm:table">
            <thead>
              <tr className="border-b border-line text-left text-[13px] text-ink-3">
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Étape</th>
                <th className="py-2 pr-4 font-medium">Résultat</th>
                <th className="py-2 font-medium">Appareil</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={i} className="border-b border-line">
                  <td className="whitespace-nowrap py-2.5 pr-4">{hm(e.occurred_at)}</td>
                  <td className="py-2.5 pr-4">{METHOD[e.method] ?? e.method}</td>
                  <td className="py-2.5 pr-4">{e.success ? <Chip tone="sage">réussie</Chip> : <Chip tone="red">échec</Chip>}</td>
                  <td className="py-2.5 text-ink-3">{e.user_agent ? deviceLabel(e.user_agent) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Meta className="mt-2">Une connexion que vous ne reconnaissez pas ? Changez votre mot de passe et déconnectez les autres appareils.</Meta>
        </Card>

        <Card>
          <CardHeader title="Mes données" />
          <p className="text-sm text-ink-2">
            Une archive de toutes vos données et de celles des profils que vous gérez : résultats, glycémie, insuline, journal, rendez-vous, documents,
            journal d’accès (fichiers CSV et JSON).
          </p>
          <a href="/api/export" className={buttonClass({ variant: 'primary', className: 'mt-3' })}>
            Exporter mes données (.zip)
          </a>
          <Meta className="mt-2">Archive produite à la demande et non conservée par BILANX. Gardez-la en lieu sûr.</Meta>
        </Card>

        <Card>
          <CardHeader title="Consentements" />
          {sp.consentement && (
            <p role="status" className="mb-2 rounded-lg bg-sage-2 px-3 py-2 text-sm">
              {sp.consentement === 'retire' ? 'Consentement retiré.' : 'Consentement enregistré.'}
            </p>
          )}
          <ul className="divide-y divide-line text-sm">
            <li className="py-2.5">
              <span className="font-medium">Traitement de mes données de santé</span> <Chip tone="sage">donné</Chip>
              <Meta>Nécessaire au fonctionnement de BILANX. Pour le retirer, supprimez votre compte (ci-dessous).</Meta>
            </li>
            <li className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="min-w-0">
                <span className="font-medium">Lecture automatique des documents</span>{' '}
                {autoReading ? <Chip tone="sage">donné</Chip> : <Chip tone="neutral">non donné</Chip>}
                <Meta>Vous vérifiez chaque valeur lue avant son enregistrement. Sans ce consentement, vous saisissez les valeurs vous-même.</Meta>
              </span>
              <form action={autoReading ? withdrawAutoReadingAction : giveAutoReadingAction}>
                <Button type="submit">{autoReading ? 'Retirer' : 'Donner'}</Button>
              </form>
            </li>
          </ul>
          <Meta className="mt-1">
            Historique : {consents.map((c) => `${c.purpose === 'ai_extraction' ? 'lecture automatique' : 'données de santé'} ${c.withdrawn_at ? 'retiré' : 'donné'} le ${hm(c.withdrawn_at ?? c.given_at)}`).join(' · ')}
          </Meta>
        </Card>

        {!deletionAt && (
          <Card className="lg:col-span-2">
            <details className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 font-semibold text-red [&::-webkit-details-marker]:hidden">
                Supprimer mon compte
                <Icon name="chevronDown" className="size-5 shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-3 grid gap-4 lg:grid-cols-2">
                <div className="text-sm text-ink-2">
                  <p>
                    La suppression a lieu <strong>7 jours</strong> après votre demande. D’ici là, vous pouvez l’annuler en vous connectant.
                  </p>
                  <p className="mt-2">
                    Seront effacés : vos profils gérés (y compris ceux de vos proches) et toutes leurs données, vos documents, vos sessions et votre
                    historique de connexion. Vos accès aux profils d’autres personnes prennent fin.
                  </p>
                  <p className="mt-2">Exportez d’abord vos données si vous souhaitez les garder.</p>
                </div>
                <DeleteAccountForm />
              </div>
            </details>
          </Card>
        )}
      </div>
    </div>
  );
}
