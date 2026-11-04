import { AppShell, type ShellProfile } from '@/components/app-shell';
import { appContext, DEMO_PROFILE_ID, moduleAllowed, NAV_MODULES } from '@/lib/server/context';
import { RELATIONSHIPS, ROLE_LABELS } from '@bilanx/profiles';

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
    { id: DEMO_PROFILE_ID, name: 'Claire', detail: 'Démonstration — données fictives', isDemo: true },
  ];
  const activeId = ctx.active.kind === 'demo' ? DEMO_PROFILE_ID : ctx.active.access.profileId;
  const hidden = Object.entries(NAV_MODULES)
    .filter(([, m]) => !moduleAllowed(ctx.active, m))
    .map(([href]) => href);
  return (
    <AppShell user={{ email: ctx.user.email, displayName: ctx.user.displayName ?? '' }} profiles={shellProfiles} activeId={activeId} hidden={hidden}>
      {children}
    </AppShell>
  );
}
