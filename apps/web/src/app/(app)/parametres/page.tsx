import type { Metadata } from 'next';
import { auth, requireUser } from '@/lib/server/auth';
import { revokeOtherSessionsAction, revokeSessionAction, signOutAction } from '@/lib/server/actions';
import { Card, Chip, Meta, PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Paramètres et sécurité' };

const METHOD: Record<string, string> = {
  password: 'Mot de passe',
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

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ 'codes-restants'?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [sessions, events] = await Promise.all([auth().listSessions(user.accountId), auth().listLoginEvents(user.accountId, 15)]);
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
          <Meta className="mt-4">
            À venir : passkeys, changement d’e-mail et de mot de passe, gestion des consentements, export et suppression des données.
          </Meta>
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
          <div className="mt-3 overflow-x-auto">
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
          </div>
          <Meta className="mt-2">Une connexion que vous ne reconnaissez pas ? Changez votre mot de passe et déconnectez les autres appareils.</Meta>
        </Card>
      </div>
    </div>
  );
}
