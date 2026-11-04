import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MODULES, ROLE_LABELS, type Permissions } from '@bilanx/profiles';
import { profiles } from '@/lib/server/auth';
import { appContext } from '@/lib/server/context';
import { leaveProfileAction, revokeAccessAction, revokeInvitationAction } from '@/lib/server/actions';
import { Card, Chip, Meta, PageHeader } from '@/components/ui';
import { InviteForm, PermissionsEditor } from '@/components/family-forms';

export const metadata: Metadata = { title: 'Accès au profil' };

const ACTIONS: Record<string, string> = {
  'data.read': 'a consulté',
  'data.write': 'a saisi des données',
  'profile.created': 'a créé le profil',
  'access.invited': 'a envoyé une invitation',
  'access.granted': 'a accepté une invitation',
  'access.declined': 'a refusé une invitation',
  'access.revoked': 'a retiré un accès',
  'access.left': 'a renoncé à son accès',
  'access.permissions_changed': 'a modifié des autorisations',
  'access.invitation_revoked': 'a annulé une invitation',
};
const moduleLabel = (k: string) => MODULES.find((m) => m.key === k)?.label;

function summary(p: Permissions): string {
  const parts = MODULES.filter((m) => p[m.key]).map((m) => `${m.label} (${p[m.key] === 'write' ? 'lecture et saisie' : 'lecture'})`);
  return parts.length ? parts.join(', ') : 'aucun module';
}

export default async function ProfileAccessPage({ params }: { params: Promise<{ profileId: string }> }) {
  const ctx = await appContext();
  const { profileId } = await params;
  const me = ctx.profiles.find((p) => p.profileId === profileId);
  if (!me) notFound();
  const fmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' });
  const fmtD = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' });
  const actor = { accountId: ctx.user.accountId, email: ctx.user.email, displayName: ctx.user.displayName };

  if (me.role !== 'owner') {
    return (
      <div className="fade-in">
        <PageHeader title={me.displayName} subtitle={ROLE_LABELS[me.role]} actions={<Link href="/famille" className="text-sm text-ink-3">← Famille</Link>} />
        <Card className="max-w-2xl">
          <h2 className="font-semibold">Mes autorisations</h2>
          <p className="mt-2 text-sm text-ink-2">{summary(me.permissions)}</p>
          {me.expiresAt && <Meta className="mt-1">Accès jusqu’au {fmtD.format(me.expiresAt)}.</Meta>}
          <form action={leaveProfileAction} className="mt-5">
            <input type="hidden" name="profileId" value={profileId} />
            <button type="submit" className="min-h-11 rounded-xl border border-line px-4 text-sm font-medium text-red hover:bg-red-2">
              Renoncer à cet accès
            </button>
          </form>
        </Card>
      </div>
    );
  }

  const [{ accesses, invitations }, log] = await Promise.all([profiles().listAccesses(actor, profileId), profiles().accessLog(actor, profileId, 60)]);
  const others = accesses.filter((a) => a.role !== 'owner');

  return (
    <div className="fade-in">
      <PageHeader
        title={`Accès au profil de ${me.displayName}`}
        subtitle="Vous êtes gestionnaire de ce profil."
        actions={
          <Link href="/famille" className="text-sm text-ink-3 hover:text-ink">
            ← Famille
          </Link>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_440px]">
        <div className="flex flex-col gap-4">
          <Card>
            <h2 className="font-semibold">Personnes ayant accès</h2>
            {others.length === 0 && <p className="mt-2 text-sm text-ink-3">Personne d’autre que vous n’a accès à ce profil.</p>}
            <ul className="mt-2 divide-y divide-line">
              {others.map((a) => (
                <li key={a.id} className="py-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="block font-medium">{a.email}</span>
                      <span className="text-xs text-ink-3">
                        {ROLE_LABELS[a.role]} · depuis le {fmtD.format(a.granted_at)}
                        {a.expires_at ? ` · jusqu’au ${fmtD.format(a.expires_at)}` : ''}
                      </span>
                    </span>
                    <form action={revokeAccessAction}>
                      <input type="hidden" name="profileId" value={profileId} />
                      <input type="hidden" name="accessId" value={a.id} />
                      <button type="submit" className="min-h-10 rounded-lg px-3 text-sm font-medium text-red hover:bg-red-2">
                        Retirer l’accès
                      </button>
                    </form>
                  </div>
                  <PermissionsEditor profileId={profileId} accessId={a.id} permissions={a.permissions} readOnly={a.role === 'guest_professional'} />
                </li>
              ))}
            </ul>
          </Card>

          {invitations.length > 0 && (
            <Card>
              <h2 className="font-semibold">Invitations en attente</h2>
              <ul className="mt-2 divide-y divide-line">
                {invitations.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <span className="text-sm">
                      <span className="block font-medium">{i.invited_email}</span>
                      <span className="text-xs text-ink-3">
                        {ROLE_LABELS[i.role]} · {summary(i.permissions)} · expire le {fmtD.format(i.expires_at)}
                      </span>
                    </span>
                    <form action={revokeInvitationAction}>
                      <input type="hidden" name="profileId" value={profileId} />
                      <input type="hidden" name="invitationId" value={i.id} />
                      <button type="submit" className="min-h-10 rounded-lg px-3 text-sm text-red hover:bg-red-2">
                        Annuler
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <h2 className="font-semibold">Journal d’accès</h2>
            <p className="mt-1 text-sm text-ink-3">Chaque consultation et chaque changement d’autorisation sont enregistrés et ne peuvent pas être modifiés.</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink-3">
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 font-medium">Qui</th>
                    <th className="py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map((l, i) => (
                    <tr key={i} className="border-b border-line">
                      <td className="whitespace-nowrap py-2 pr-4">{fmt.format(l.occurred_at)}</td>
                      <td className="py-2 pr-4">{l.email === ctx.user.email ? 'Vous' : (l.email ?? '—')}</td>
                      <td className="py-2">
                        {ACTIONS[l.action] ?? l.action}
                        {moduleLabel(l.resource) ? <Chip tone="neutral">{moduleLabel(l.resource)}</Chip> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <Card>
          <h2 className="font-semibold">Inviter une personne</h2>
          <p className="mb-4 mt-1 text-sm text-ink-3">L’invitation ne donne aucun accès tant qu’elle n’est pas acceptée par cette personne, connectée avec cette adresse.</p>
          <InviteForm profileId={profileId} />
        </Card>
      </div>
    </div>
  );
}
