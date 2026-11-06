import type { Metadata } from 'next';
import Link from 'next/link';
import { MODULES, ROLE_LABELS } from '@bilanx/profiles';
import { currentSession, profiles } from '@/lib/server/auth';
import { RespondInvitationForm } from '@/components/family-forms';
import { Alert } from '@/components/forms';
import { buttonClass } from '@/components/ui';

export const metadata: Metadata = { title: 'Invitation' };

export default async function InvitationPage({ searchParams }: { searchParams: Promise<{ jeton?: string }> }) {
  const { jeton } = await searchParams;
  const inv = jeton ? await profiles().previewInvitation(jeton) : null;
  if (!jeton || !inv || inv.status !== 'pending') {
    return (
      <>
        <h1 className="mb-4 font-display text-2xl font-semibold">Invitation</h1>
        <Alert tone="error">Cette invitation n’est plus valable : elle a expiré, a déjà été utilisée ou a été retirée.</Alert>
      </>
    );
  }
  const session = await currentSession();
  const suite = `/invitations?jeton=${encodeURIComponent(jeton)}`;
  const fmtD = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' });
  return (
    <>
      <h1 className="font-display text-2xl font-semibold">Invitation de {inv.inviter}</h1>
      <p className="mt-2 text-sm text-ink-2">
        Accès au profil <strong>« {inv.profileName} »</strong> en tant que <strong>{ROLE_LABELS[inv.role].toLowerCase()}</strong>.
      </p>
      <ul className="my-4 rounded-xl bg-surface-2 p-3.5 text-sm">
        {MODULES.filter((m) => inv.permissions[m.key]).map((m) => (
          <li key={m.key} className="flex justify-between gap-3 py-0.5">
            <span>{m.label}</span>
            <span className="text-ink-3">{inv.permissions[m.key] === 'write' ? 'lecture et saisie' : 'lecture'}</span>
          </li>
        ))}
      </ul>
      {inv.accessExpiresAt && <p className="mb-4 text-sm text-ink-3">Accès jusqu’au {fmtD.format(inv.accessExpiresAt)}.</p>}
      {session?.mfaPassed ? (
        session.email === inv.invitedEmail ? (
          <RespondInvitationForm token={jeton} />
        ) : (
          <Alert tone="error">
            Cette invitation a été envoyée à {inv.invitedEmail}. Vous êtes connecté·e avec {session.email} : déconnectez-vous puis
            reconnectez-vous avec la bonne adresse.
          </Alert>
        )
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-2">Connectez-vous avec {inv.invitedEmail} pour accepter ou refuser.</p>
          <Link href={`/connexion?suite=${encodeURIComponent(suite)}`} className={buttonClass({ variant: 'primary' })}>
            Se connecter
          </Link>
          <Link href="/inscription" className="inline-flex min-h-11 items-center justify-center text-sm text-petrol underline">
            Je n’ai pas encore de compte
          </Link>
        </div>
      )}
    </>
  );
}
