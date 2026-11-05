'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV } from '@/lib/navigation';
import { signOutAction, switchProfileAction } from '@/lib/server/actions';
import { Icon } from './icon';

export interface ShellUser {
  email: string;
  displayName: string;
}

export interface ShellProfile {
  id: string; // uuid ou 'demo'
  name: string;
  detail: string;
  isDemo: boolean;
}

export function AppShell({
  children,
  user,
  profiles,
  activeId,
  hidden,
}: {
  children: React.ReactNode;
  user: ShellUser;
  profiles: ShellProfile[];
  activeId: string;
  /** Pages masquées : modules non autorisés pour le profil affiché. */
  hidden: string[];
}) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const active = profiles.find((p) => p.id === activeId) ?? profiles[0]!;
  const main = NAV.filter((n) => n.group === 'main' && !hidden.includes(n.href));
  const account = NAV.filter((n) => n.group === 'account');
  const mobile = ['/tableau-de-bord', '/glycemie', '/analyses', '/parametres'];

  return (
    <div className="min-h-dvh">
      {/* Premier élément au clavier : évite de parcourir tout le menu à chaque page (WCAG 2.4.1). */}
      <a
        href="#contenu"
        className="sr-only z-50 rounded-xl bg-petrol px-4 py-2 font-medium text-on-accent focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Aller au contenu
      </a>
      <p role="note" className="border-b border-line bg-amber-2 px-4 py-1.5 text-center text-[13px] text-ink">
        {active.isDemo ? (
          <>
            ⚠️ Profil de démonstration — <strong>toutes les données affichées sont fictives</strong>.
          </>
        ) : (
          <>
            ⚠️ Prototype en développement : <strong>n’enregistrez pas encore de vraies données de santé</strong> (hébergement certifié HDS
            non encore en place).
          </>
        )}{' '}
        BILANX ne remplace pas l’avis d’un professionnel de santé. En cas d’urgence : 15 ou 112.
      </p>
      <div className="lg:grid lg:grid-cols-[264px_1fr]">
        <aside className="sticky top-0 hidden h-dvh overflow-y-auto border-r border-line bg-surface px-3.5 py-5 lg:block">
          <Link href="/tableau-de-bord" className="block px-2.5 font-display text-2xl tracking-wide text-petrol">
            BILANX
          </Link>
          <p className="px-2.5 pb-4 text-xs text-ink-3">Toute votre santé, en un seul endroit.</p>
          <AccountBox user={user} />
          <ProfileSwitcher profiles={profiles} active={active} />
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
        <main id="contenu" tabIndex={-1} className="mx-auto w-full max-w-[1240px] px-4 pb-28 pt-5 outline-none sm:px-8 lg:pb-16 lg:pt-7">
          <div className="mb-4 lg:hidden">
            <ProfileSwitcher profiles={profiles} active={active} />
          </div>
          {children}
        </main>
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
          className="mx-auto -mt-5 grid size-12 place-items-center rounded-full bg-petrol text-2xl text-on-accent shadow-lg"
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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function Avatar({ p }: { p: ShellProfile }) {
  return (
    <span
      className={`grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-semibold text-on-accent ${p.isDemo ? 'bg-amber' : 'bg-petrol'}`}
      aria-hidden
    >
      {initials(p.name)}
    </span>
  );
}

/** Sélecteur du profil affiché : toujours visible pour ne jamais confondre deux personnes. */
function ProfileSwitcher({ profiles, active }: { profiles: ShellProfile[]; active: ShellProfile }) {
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-2xl bg-surface-2 p-2.5 [&::-webkit-details-marker]:hidden">
        <Avatar p={active} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">
            {active.name}{' '}
            {active.isDemo && <span className="rounded-full bg-amber-2 px-1.5 py-px text-[10px] font-medium text-amber">démo</span>}
          </span>
          <span className="block truncate text-xs text-ink-3">{active.detail}</span>
        </span>
        <span className="text-xs text-ink-3" aria-hidden>
          ▾
        </span>
        <span className="sr-only">Changer de profil</span>
      </summary>
      <div className="absolute inset-x-0 z-30 mt-1.5 rounded-2xl border border-line bg-surface p-1.5 shadow-lg">
        {profiles.map((p) => (
          <form key={p.id} action={switchProfileAction}>
            <input type="hidden" name="profileId" value={p.id} />
            <button
              type="submit"
              aria-current={p.id === active.id ? 'true' : undefined}
              className={`flex w-full items-center gap-2.5 rounded-xl p-2 text-left hover:bg-surface-2 ${p.id === active.id ? 'bg-petrol-2' : ''}`}
            >
              <Avatar p={p} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{p.name}</span>
                <span className="block truncate text-xs text-ink-3">{p.detail}</span>
              </span>
            </button>
          </form>
        ))}
        <Link href="/famille" className="mt-1 block rounded-xl px-2 py-2 text-sm font-medium text-petrol hover:bg-surface-2">
          Gérer la famille et les accès →
        </Link>
      </div>
    </details>
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
