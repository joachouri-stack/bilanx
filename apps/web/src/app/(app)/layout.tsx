import { AppShell, type ShellProfile } from '@/components/app-shell';
import { appContext, DEMO_PROFILE_ID, demoEnabled, moduleAllowed, NAV_MODULES } from '@/lib/server/context';
import { RELATIONSHIPS, ROLE_LABELS } from '@bilanx/profiles';
import Link from 'next/link';
import { privacy } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await appContext();
  const shellProfiles: ShellProfile[] = [
    ...ctx.profiles.map((p) => ({
      id: p.profileId,
      name: p.displayName,
      detail: p.role === 'owner' ? (p.relationship ? RELATIONSHIPS[p.relationship] : 'Proche') : ROLE_LABELS[p.role],
      isDemo: false,
    })),
    ...(demoEnabled(ctx.profiles.length) ? [{ id: DEMO_PROFILE_ID, name: 'Claire', detail: 'Démonstration — données fictives', isDemo: true }] : []),
  ];
  const activeId = ctx.active.kind === 'demo' ? DEMO_PROFILE_ID : ctx.active.access.profileId;
  const hidden = Object.entries(NAV_MODULES)
    .filter(([, m]) => !moduleAllowed(ctx.active, m))
    .map(([href]) => href);
  const deletionAt = await privacy().deletionStatus(ctx.user.accountId);
  return (
    <AppShell user={{ email: ctx.user.email, displayName: ctx.user.displayName ?? '' }} profiles={shellProfiles} activeId={activeId} hidden={hidden}>
      {deletionAt && (
        <p role="alert" className="mb-4 rounded-xl border border-red bg-red-2 px-4 py-2.5 text-sm">
          Suppression de votre compte programmée le{' '}
          {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' }).format(deletionAt)}.{' '}
          <Link href="/parametres" className="font-medium underline">
            Annuler ou exporter mes données
          </Link>
        </p>
      )}
      {children}
    </AppShell>
  );
}
