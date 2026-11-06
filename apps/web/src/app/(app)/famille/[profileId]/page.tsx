import type { Metadata } from 'next';
import Link from 'next/link';
import { GLUCOSE_UNITS, HBA1C_UNITS } from '@bilanx/domain';
import { notFound } from 'next/navigation';
import { MODULES, ROLE_LABELS, type Permissions } from '@bilanx/profiles';
import { profiles } from '@/lib/server/auth';
import { appContext } from '@/lib/server/context';
import { leaveProfileAction, revokeAccessAction, revokeInvitationAction, setDisplayUnitsAction, switchProfileAction } from '@/lib/server/actions';
import { Button, buttonClass, Card, CardHeader, Chip, Meta, PageHeader } from '@/components/ui';
import { Icon } from '@/components/icon';
import { ConfirmDelete } from '@/components/autres-confirmer';
import { InviteForm, PermissionsEditor } from '@/components/family-forms';
import { DeleteProfileForm } from '@/components/privacy-forms';

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
  return parts.length ? parts.join(', ') : 'aucune rubrique';
}

export default async function ProfileAccessPage({ params, searchParams }: { params: Promise<{ profileId: string }>; searchParams: Promise<{ unites?: string }> }) {
  const ctx = await appContext();
  const { profileId } = await params;
  const sp = await searchParams;
  const me = ctx.profiles.find((p) => p.profileId === profileId);
  if (!me) notFound();
  const fmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' });
  const fmtD = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' });
  const actor = { accountId: ctx.user.accountId, email: ctx.user.email, displayName: ctx.user.displayName };
  const isActive = ctx.active.kind === 'real' && ctx.active.access.profileId === profileId;
  const back = (
    <Link href="/famille" className={buttonClass({ variant: 'ghost', className: '-ml-3' })}>
      <Icon name="chevronLeft" className="size-5" /> Famille
    </Link>
  );
  const switchTo = isActive ? null : (
    <form action={switchProfileAction}>
      <input type="hidden" name="profileId" value={profileId} />
      <Button type="submit" variant="primary">
        Passer sur ce profil
      </Button>
    </form>
  );

  if (me.role !== 'owner') {
    return (
      <div className="fade-in">
        <PageHeader
          title={me.displayName}
          subtitle={ROLE_LABELS[me.role]}
          actions={
            <>
              {back}
              {switchTo}
            </>
          }
        />
        <Card className="max-w-2xl">
          <CardHeader title="Mes autorisations" />
          <p className="text-sm text-ink-2">{summary(me.permissions)}</p>
          {me.expiresAt && <Meta className="mt-1">Accès jusqu’au {fmtD.format(me.expiresAt)}.</Meta>}
          <ConfirmDelete
            action={leaveProfileAction}
            fields={{ profileId }}
            label="Renoncer à cet accès"
            confirmLabel="Confirmer"
            question="Vous ne verrez plus ce profil, sauf nouvelle invitation."
            className="-ml-3 mt-4"
          />
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
          <>
            {back}
            {switchTo}
          </>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader title="Personnes ayant accès" />
            {others.length === 0 && <p className="text-sm text-ink-2">Personne d’autre que vous n’a accès à ce profil.</p>}
            <ul className="divide-y divide-line">
              {others.map((a) => (
                <li key={a.id} className="py-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block break-all font-medium">{a.email}</span>
                      <span className="block text-[13px] text-ink-3">
                        {ROLE_LABELS[a.role]} · depuis le {fmtD.format(a.granted_at)}
                        {a.expires_at ? ` · jusqu’au ${fmtD.format(a.expires_at)}` : ''}
                      </span>
                    </span>
                    <ConfirmDelete
                      action={revokeAccessAction}
                      fields={{ profileId, accessId: a.id }}
                      label="Retirer l’accès"
                      confirmLabel="Confirmer le retrait"
                      summaryAriaLabel={`Retirer l’accès de ${a.email}`}
                    />
                  </div>
                  <PermissionsEditor profileId={profileId} accessId={a.id} permissions={a.permissions} readOnly={a.role === 'guest_professional'} />
                </li>
              ))}
            </ul>
          </Card>

          {invitations.length > 0 && (
            <Card>
              <CardHeader title="Invitations en attente" />
              <ul className="divide-y divide-line">
                {invitations.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <span className="min-w-0 text-sm">
                      <span className="block break-all font-medium">{i.invited_email}</span>
                      <span className="block text-[13px] text-ink-3">
                        {ROLE_LABELS[i.role]} · {summary(i.permissions)} · expire le {fmtD.format(i.expires_at)}
                      </span>
                    </span>
                    <form action={revokeInvitationAction}>
                      <input type="hidden" name="profileId" value={profileId} />
                      <input type="hidden" name="invitationId" value={i.id} />
                      <Button type="submit" variant="ghost" className="text-red hover:bg-red-2">
                        Annuler l’invitation
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <CardHeader title="Journal d’accès" />
            <p className="text-sm text-ink-2">Chaque consultation et chaque changement d’autorisation sont notés ici, sans modification possible.</p>
            <ul className="mt-2 divide-y divide-line">
              {log.map((l, i) => (
                <li key={i} className="py-2.5 text-sm">
                  <p>
                    <span className="font-medium">{l.email === ctx.user.email ? 'Vous' : (l.email ?? '—')}</span> {ACTIONS[l.action] ?? l.action}
                    {moduleLabel(l.resource) ? (
                      <>
                        {' '}
                        <Chip tone="neutral">{moduleLabel(l.resource)}</Chip>
                      </>
                    ) : null}
                  </p>
                  <Meta>{fmt.format(l.occurred_at).replace(/(\d{2}):(\d{2})/, '$1 h $2')}</Meta>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
        <Card id="unites" className="scroll-mt-20">
          <CardHeader title="Unités d’affichage" />
          <p className="text-sm text-ink-2">Pour tous ceux qui consultent ce profil. Les valeurs enregistrées ne changent pas, seul l’affichage change.</p>
          {sp.unites && (
            <p role="status" className="mt-3 rounded-xl bg-sage-2 px-3 py-2 text-sm">
              Unités enregistrées.
            </p>
          )}
          <form action={setDisplayUnitsAction} className="mt-3 flex flex-col gap-3">
            <input type="hidden" name="profileId" value={profileId} />
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Glycémie (capteur, journal, rapports)</legend>
              <div className="flex flex-col gap-1.5">
                {Object.entries(GLUCOSE_UNITS).map(([u, label]) => (
                  <label key={u} className="flex min-h-11 items-center gap-2 text-sm">
                    <input type="radio" name="glucose" value={u} defaultChecked={me.glucoseUnit === u} className="size-5 accent-[var(--petrol)]" />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">HbA1c (tableau de bord)</legend>
              <div className="flex flex-col gap-1.5">
                {Object.entries(HBA1C_UNITS).map(([u, label]) => (
                  <label key={u} className="flex min-h-11 items-center gap-2 text-sm">
                    <input type="radio" name="hba1c" value={u} defaultChecked={me.hba1cUnit === u} className="size-5 accent-[var(--petrol)]" />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <Meta>Les résultats de laboratoire restent affichés tels qu’écrits par le laboratoire, avec la conversion à côté.</Meta>
            <Button type="submit" className="self-start">
              Enregistrer les unités
            </Button>
          </form>
        </Card>
        <Card>
          <CardHeader title="Inviter une personne" />
          <p className="mb-4 text-sm text-ink-2">L’invitation ne donne aucun accès tant que cette personne ne l’a pas acceptée, connectée avec cette adresse.</p>
          <InviteForm profileId={profileId} />
        </Card>
        {me.relationship !== 'self' && (
          <Card>
            <details className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 font-semibold text-red [&::-webkit-details-marker]:hidden">
                Supprimer ce profil
                <Icon name="chevronDown" className="size-5 shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-2 text-sm text-ink-2">
                Le profil et ses données deviennent immédiatement invisibles et les accès accordés prennent fin. L’effacement définitif a lieu
                30 jours plus tard. Exportez d’abord les données si besoin (Paramètres, « Mes données »).
              </p>
              <div className="mt-3">
                <DeleteProfileForm profileId={profileId} name={me.displayName} />
              </div>
            </details>
          </Card>
        )}
        </div>
      </div>
    </div>
  );
}
