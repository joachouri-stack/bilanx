import { AppShell } from '@/components/app-shell';
import { requireUser } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <AppShell user={{ email: user.email, displayName: user.displayName ?? '' }}>{children}</AppShell>;
}
