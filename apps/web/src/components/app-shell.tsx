'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV } from '@/lib/navigation';
import { DEMO_PROFILE } from '@/lib/demo-data';
import { signOutAction } from '@/lib/server/actions';
import { Icon } from './icon';

export interface ShellUser {
  email: string;
  displayName: string;
}

export function AppShell({ children, user }: { children: React.ReactNode; user: ShellUser }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const main = NAV.filter((n) => n.group === 'main');
  const account = NAV.filter((n) => n.group === 'account');
  const mobile = ['/tableau-de-bord', '/glycemie', '/analyses', '/parametres'];

  return (
    <div className="min-h-dvh">
      <p role="note" className="border-b border-line bg-amber-2 px-4 py-1.5 text-center text-[13px] text-ink">
        ⚠️ Prototype en développement — <strong>toutes les données affichées sont fictives</strong>. BILANX ne remplace pas
        l’avis d’un professionnel de santé. En cas d’urgence : 15 ou 112.
      </p>
      <div className="lg:grid lg:grid-cols-[264px_1fr]">
        <aside className="sticky top-0 hidden h-dvh overflow-y-auto border-r border-line bg-surface px-3.5 py-5 lg:block">
          <Link href="/tableau-de-bord" className="block px-2.5 font-display text-2xl tracking-wide text-petrol">
            BILANX
          </Link>
          <p className="px-2.5 pb-4 text-xs text-ink-3">Toute votre santé, en un seul endroit.</p>
          <AccountBox user={user} />
          <ProfileBadge />
          <nav aria-label="Navigation principale" className="mt-4 flex flex-col gap-0.5">
            {main.map((n) => (
              <NavLink key={n.href} item={n} active={isActive(n.href)} />
            ))}
            <hr className="mx-1 my-2.5 border-line" />
            {account.map((n) => (
              <NavLink key={n.href} item={n} active={isActive(n.href)} />
            ))}
          </nav>
        </aside>
        <main className="mx-auto w-full max-w-[1240px] px-4 pb-28 pt-5 sm:px-8 lg:pb-16 lg:pt-7">{children}</main>
      </div>

      <nav
        aria-label="Navigation mobile"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-surface pb-[max(10px,env(safe-area-inset-bottom))] pt-2 text-center text-[11px] text-ink-3 lg:hidden"
      >
        {mobile.slice(0, 2).map((href) => (
          <MobileLink key={href} href={href} active={isActive(href)} />
        ))}
        <Link
          href="/documents"
          aria-label="Action rapide : scanner un document"
          className="mx-auto -mt-5 grid size-12 place-items-center rounded-full bg-petrol text-2xl text-white shadow-lg"
        >
          ＋
        </Link>
        {mobile.slice(2).map((href) => (
          <MobileLink key={href} href={href} active={isActive(href)} />
        ))}
      </nav>
    </div>
  );
}

function AccountBox({ user }: { user: ShellUser }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2">
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{user.displayName || 'Mon compte'}</span>
        <span className="block truncate text-xs text-ink-3">{user.email}</span>
      </span>
      <form action={signOutAction}>
        <button type="submit" className="shrink-0 rounded-lg px-2 py-1 text-xs text-ink-2 hover:bg-surface-2">
          Déconnexion
        </button>
      </form>
    </div>
  );
}

function ProfileBadge() {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-surface-2 p-2.5">
      <span className="grid size-8 place-items-center rounded-full bg-petrol text-[13px] font-semibold text-white" aria-hidden>
        {DEMO_PROFILE.initials}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">
          {DEMO_PROFILE.displayName}{' '}
          <span className="rounded-full bg-amber-2 px-1.5 py-px text-[10px] font-medium text-amber">démo</span>
        </span>
        <span className="block text-xs text-ink-3">Profil de démonstration affiché</span>
      </span>
    </div>
  );
}

function NavLink({ item, active }: { item: (typeof NAV)[number]; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-xl px-3 py-2 font-medium transition-colors ${
        active ? 'bg-petrol-2 text-petrol' : 'text-ink-2 hover:bg-surface-2'
      }`}
    >
      <Icon path={item.icon} />
      <span className="flex-1">{item.label}</span>
      {item.status === 'planned' && <span className="text-[10px] font-normal text-ink-3">bientôt</span>}
    </Link>
  );
}

function MobileLink({ href, active }: { href: string; active: boolean }) {
  const item = NAV.find((n) => n.href === href)!;
  return (
    <Link href={href} aria-current={active ? 'page' : undefined} className={`flex flex-col items-center gap-0.5 ${active ? 'text-petrol' : ''}`}>
      <Icon path={item.icon} />
      {item.short}
    </Link>
  );
}
