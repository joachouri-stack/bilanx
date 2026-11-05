import type { Metadata } from 'next';
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
import { Card, Chip, Meta, PageHeader, ScrollRegion } from '@/components/ui';
import { InstallApp } from '@/components/install-app';
import { PasskeyManager } from '@/components/passkey-forms';
import { ChangeEmailForm, ChangePasswordForm, RegenerateRecoveryCodesForm, ReplaceTotpForm } from '@/components/account-forms';

export const metadata: Metadata = { title: 'Paramètres et sécurité' };

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

  return (
    <div className="fade-in">
      <PageHeader title="Paramètres" subtitle="Compte et sécurité" />
      {left !== undefined && (
        <p role="status" className="mb-4 rounded-xl bg-amber-2 px-4 py-3 text-sm">
          Vous vous êtes connecté avec un code de secours. Il vous en reste <strong>{left}</strong>. Pensez à reconfigurer votre
          application d’authentification si vous avez perdu votre téléphone (fonction à venir).
        </p>
      )}
      {deletionAt && (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red bg-red-2 px-4 py-3 text-sm">
          <span>
            <strong>Suppression du compte programmée le {fmtLong.format(deletionAt)}.</strong> Vos profils gérés et leurs données seront alors effacés.
          </span>
          <form action={cancelAccountDeletionAction}>
            <button type="submit" className="min-h-10 rounded-lg bg-surface px-3 font-medium">
              Annuler la suppression
            </button>
          </form>
        </div>
      )}
      {sp.suppression === 'annulee' && (
        <p role="status" className="mb-4 rounded-xl bg-sage-2 px-4 py-3 text-sm">
          Suppression annulée : votre compte est conservé.
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Mon compte</h2>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-ink-3">Prénom</dt>
            <dd>{user.displayName}</dd>
            <dt className="text-ink-3">E-mail</dt>
            <dd className="break-all">
              {user.email} <Chip tone="sage">vérifié</Chip>
            </dd>
            <dt className="text-ink-3">Double authentification</dt>
            <dd>
              <Chip tone="sage">activée</Chip> <span className="text-ink-3">· application d’authentification</span>
            </dd>
          </dl>
          <form action={signOutAction} className="mt-5">
            <button type="submit" className="min-h-11 rounded-xl border border-line px-4 font-medium hover:bg-surface-2">
              Se déconnecter
            </button>
          </form>
          <div className="mt-5 flex flex-col gap-2.5">
            <details className="rounded-xl border border-line p-3.5" id="mot-de-passe">
              <summary className="cursor-pointer text-sm font-medium text-petrol">Changer mon mot de passe</summary>
              <div className="mt-3">
                <ChangePasswordForm />
              </div>
            </details>
            <details className="rounded-xl border border-line p-3.5" id="adresse">
              <summary className="cursor-pointer text-sm font-medium text-petrol">Changer mon adresse e-mail</summary>
              <div className="mt-3">
                <ChangeEmailForm current={user.email} />
              </div>
            </details>
            <details className="rounded-xl border border-line p-3.5" id="cles">
              <summary className="cursor-pointer text-sm font-medium text-petrol">
                Clés d’accès (Face ID, empreinte){passkeys.length ? ` · ${passkeys.length}` : ''}
              </summary>
              <div className="mt-3">
                <PasskeyManager
                  keys={passkeys.map((k) => ({
                    id: k.id,
                    label: k.label ?? 'Clé d’accès',
                    createdAt: fmt.format(k.created_at),
                    lastUsedAt: k.last_used_at ? fmt.format(k.last_used_at) : null,
                  }))}
                />
              </div>
            </details>
            <details className="rounded-xl border border-line p-3.5" id="telephone">
              <summary className="cursor-pointer text-sm font-medium text-petrol">Changer de téléphone (double authentification)</summary>
              <div className="mt-3">
                <ReplaceTotpForm />
              </div>
            </details>
            <details className="rounded-xl border border-line p-3.5" id="codes" open={codesLeft <= 3}>
              <summary className="cursor-pointer text-sm font-medium text-petrol">Codes de secours</summary>
              <div className="mt-3">
                <RegenerateRecoveryCodesForm left={codesLeft} />
              </div>
            </details>
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold">Installer BILANX sur votre téléphone</h2>
          <p className="mt-1 text-sm text-ink-3">
            Une icône sur l’écran d’accueil, l’ouverture en plein écran, sans passer par un magasin d’applications. Par sécurité, vos données
            de santé ne sont jamais conservées sur l’appareil : une connexion internet reste nécessaire.
          </p>
          <InstallApp />
        </Card>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Sessions actives</h2>
            {sessions.length > 1 && (
              <form action={revokeOtherSessionsAction}>
                <button type="submit" className="min-h-9 rounded-lg border border-line px-3 text-sm hover:bg-surface-2">
                  Déconnecter les autres appareils
                </button>
              </form>
            )}
          </div>
          <ul className="mt-3 divide-y divide-line">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                <span className="min-w-0 text-sm">
                  <span className="block font-medium">
                    {deviceLabel(s.user_agent)} {s.id === user.sessionId && <Chip tone="petrol">cet appareil</Chip>}
                  </span>
                  <span className="block text-xs text-ink-3">
                    Ouverte le {fmt.format(s.created_at)} · dernière activité {fmt.format(s.last_seen_at)}
                    {!s.mfa_passed && ' · double authentification non terminée'}
                  </span>
                </span>
                <form action={revokeSessionAction}>
                  <input type="hidden" name="sessionId" value={s.id} />
                  <button type="submit" className="min-h-9 shrink-0 rounded-lg px-3 text-sm text-red hover:bg-red-2">
                    {s.id === user.sessionId ? 'Se déconnecter' : 'Révoquer'}
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <Meta>Les sessions expirent après 30 minutes d’inactivité et au plus tard 12 heures après la connexion.</Meta>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="font-semibold">Historique des connexions</h2>
          <ScrollRegion label="Historique des connexions" className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-3">
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium">Étape</th>
                  <th className="py-2 pr-4 font-medium">Résultat</th>
                  <th className="py-2 font-medium">Appareil</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e, i) => (
                  <tr key={i} className="border-b border-line">
                    <td className="whitespace-nowrap py-2.5 pr-4">{fmt.format(e.occurred_at)}</td>
                    <td className="py-2.5 pr-4">{METHOD[e.method] ?? e.method}</td>
                    <td className="py-2.5 pr-4">{e.success ? <Chip tone="sage">réussie</Chip> : <Chip tone="red">échec</Chip>}</td>
                    <td className="py-2.5 text-ink-3">{e.user_agent ? deviceLabel(e.user_agent) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
          <Meta className="mt-2">Une connexion que vous ne reconnaissez pas ? Changez votre mot de passe et déconnectez les autres appareils.</Meta>
        </Card>
        <Card>
          <h2 className="font-semibold">Mes données</h2>
          <p className="mt-1 text-sm text-ink-2">
            Téléchargez une archive de toutes vos données et de celles des profils que vous gérez : résultats, glycémie, insuline, journal,
            rendez-vous, documents originaux, journal d’accès (fichiers CSV et JSON).
          </p>
          <a href="/api/export" className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-petrol px-4 font-medium text-on-accent">
            Exporter mes données (.zip)
          </a>
          <Meta className="mt-2">Archive produite à la demande et non conservée par BILANX. Conservez-la en lieu sûr.</Meta>
        </Card>

        <Card>
          <h2 className="font-semibold">Consentements</h2>
          {sp.consentement && (
            <p role="status" className="mt-2 rounded-lg bg-sage-2 px-3 py-2 text-sm">
              {sp.consentement === 'retire' ? 'Consentement retiré.' : 'Consentement enregistré.'}
            </p>
          )}
          <ul className="mt-2 divide-y divide-line text-sm">
            <li className="py-2.5">
              <span className="font-medium">Traitement de mes données de santé</span> <Chip tone="sage">donné</Chip>
              <Meta>Nécessaire au fonctionnement de BILANX. Pour le retirer, supprimez votre compte (ci-dessous).</Meta>
            </li>
            <li className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span>
                <span className="font-medium">Lecture automatique des documents</span>{' '}
                {autoReading ? <Chip tone="sage">donné</Chip> : <Chip tone="neutral">non donné</Chip>}
                <Meta>Les valeurs lues sont toujours soumises à votre validation. Sans ce consentement, la saisie reste manuelle.</Meta>
              </span>
              <form action={autoReading ? withdrawAutoReadingAction : giveAutoReadingAction}>
                <button type="submit" className="min-h-10 rounded-lg border border-line px-3 text-sm hover:bg-surface-2">
                  {autoReading ? 'Retirer' : 'Donner'}
                </button>
              </form>
            </li>
          </ul>
          <Meta>Historique : {consents.map((c) => `${c.purpose === 'ai_extraction' ? 'lecture automatique' : 'données de santé'} ${c.withdrawn_at ? 'retiré' : 'donné'} le ${fmt.format(c.withdrawn_at ?? c.given_at)}`).join(' · ')}</Meta>
        </Card>

        {!deletionAt && (
          <Card className="lg:col-span-2">
            <details>
              <summary className="cursor-pointer font-semibold text-red">Supprimer mon compte</summary>
              <div className="mt-3 grid gap-4 lg:grid-cols-2">
                <div className="text-sm text-ink-2">
                  <p>
                    La suppression est effective <strong>7 jours</strong> après votre demande. Jusque-là, vous pouvez l’annuler en vous connectant.
                  </p>
                  <p className="mt-2">
                    Seront alors effacés : vos profils gérés (y compris ceux de vos proches) et toutes leurs données, vos documents, vos
                    sessions, vos facteurs de double authentification et votre historique de connexion. Votre adresse e-mail est retirée du compte.
                    Les accès que vous aviez sur les profils d’autres personnes prennent fin.
                  </p>
                  <p className="mt-2">Exportez d’abord vos données si vous souhaitez les conserver.</p>
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
