'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { NAV, NAV_SECTIONS, QUICK_ADD } from '@/lib/navigation';
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
  const quick = QUICK_ADD.filter((q) => !hidden.includes(q.base));
  const [sheet, setSheet] = useState<'menu' | 'add' | null>(null);
  // Fermeture à chaque changement de page, et avec la touche Échap.
  useEffect(() => setSheet(null), [pathname]);
  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSheet(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet]);
  const mobileTab = (href: string) => (hidden.includes(href) ? null : <MobileLink key={href} href={href} active={isActive(href)} />);

  return (
    <div className="min-h-dvh">
      {/* Premier élément au clavier : évite de parcourir tout le menu à chaque page (WCAG 2.4.1). */}
      <a
        href="#contenu"
        className="sr-only z-50 rounded-xl bg-petrol px-4 py-2 font-medium text-on-accent focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Aller au contenu
      </a>
      {active.isDemo && (
        <p role="note" className="border-b border-line bg-amber-2 px-4 py-1.5 text-center text-[13px] text-ink">
          ⚠️ Profil de démonstration — <strong>toutes les données affichées sont fictives</strong>.
        </p>
      )}
      <div className="lg:grid lg:grid-cols-[264px_1fr]">
        <aside className="sticky top-0 hidden h-dvh overflow-y-auto border-r border-line bg-surface px-3.5 py-5 lg:block">
          <Link href="/tableau-de-bord" className="block px-2.5 font-display text-2xl tracking-wide text-petrol">
            BILANX
          </Link>
          <p className="px-2.5 pb-4 text-xs text-ink-3">Toute votre santé, en un seul endroit.</p>
          <AccountBox user={user} />
          <ProfileSwitcher profiles={profiles} active={active} />
          <nav aria-label="Navigation principale" className="mt-4">
            <NavGroups main={main} account={account} isActive={isActive} />
          </nav>
          <p className="mt-6 px-3 text-[11px] leading-snug text-ink-3">
            Prototype : hébergement certifié HDS pas encore en place. BILANX ne remplace pas l’avis d’un professionnel de santé. Urgence : 15 ou 112.
          </p>
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
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface pb-[max(10px,env(safe-area-inset-bottom))] pt-2 text-center text-[11px] text-ink-3 lg:hidden"
      >
        {mobileTab('/tableau-de-bord') ?? <span />}
        {mobileTab('/ordonnances') ?? <span />}
        <button
          type="button"
          onClick={() => setSheet(sheet === 'add' ? null : 'add')}
          aria-expanded={sheet === 'add'}
          aria-controls="ajout-rapide"
          aria-label="Ajouter : glycémie, HbA1c, pas, ordonnance, document"
          className="mx-auto -mt-5 grid size-14 place-items-center rounded-full bg-petrol text-3xl text-on-accent shadow-lg"
        >
          {sheet === 'add' ? '×' : '＋'}
        </button>
        {mobileTab('/documents') ?? <span />}
        <button type="button" onClick={() => setSheet(sheet === 'menu' ? null : 'menu')} aria-expanded={sheet === 'menu'} aria-controls="menu-complet" className={`flex flex-col items-center gap-0.5 ${sheet === 'menu' ? 'text-petrol' : ''}`}>
          <Icon path="M4 6h16M4 12h16M4 18h16" />
          Menu
        </button>
      </nav>

      {sheet && (
        <div className="fixed inset-0 z-20 bg-[rgba(0,0,0,0.4)] lg:hidden" onClick={() => setSheet(null)} aria-hidden />
      )}
      {sheet === 'add' && (
        <div id="ajout-rapide" role="dialog" aria-label="Ajouter" className="fixed inset-x-0 bottom-0 z-25 rounded-t-3xl border-t border-line bg-surface px-4 pb-28 pt-5 shadow-2xl lg:hidden">
          <p className="mb-3 font-semibold">Ajouter</p>
          <div className="grid grid-cols-3 gap-2">
            {quick.map((q) => (
              <Link key={q.href} href={q.href} onClick={() => setSheet(null)} className="flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-2xl bg-surface-2 p-2 text-center text-sm font-medium">
                <span className="text-2xl" aria-hidden>
                  {q.icon}
                </span>
                {q.label}
              </Link>
            ))}
          </div>
        </div>
      )}
      {sheet === 'menu' && (
        <div id="menu-complet" role="dialog" aria-label="Menu" className="fixed inset-x-0 bottom-0 top-10 z-25 overflow-y-auto rounded-t-3xl border-t border-line bg-surface px-4 pb-28 pt-5 shadow-2xl lg:hidden">
          <AccountBox user={user} />
          <NavGroups main={main} account={account} isActive={isActive} onNavigate={() => setSheet(null)} />
        <p className="mt-6 px-3 text-[11px] leading-snug text-ink-3">
            Prototype : hébergement certifié HDS pas encore en place. BILANX ne remplace pas l’avis d’un professionnel de santé. Urgence : 15 ou 112.
          </p>
        </div>
      )}
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

/** Menu par rubriques : Suivi de santé, Soins, Documents, puis compte. */
function NavGroups({ main, account, isActive, onNavigate }: { main: typeof NAV; account: typeof NAV; isActive: (h: string) => boolean; onNavigate?: () => void }) {
  const head = main.filter((n) => !n.section && n.status === 'available');
  const tail = main.filter((n) => !n.section && n.status !== 'available');
  return (
    <div className="flex flex-col gap-0.5">
      {head.map((n) => (
        <NavLink key={n.href} item={n} active={isActive(n.href)} onNavigate={onNavigate} />
      ))}
      {NAV_SECTIONS.map((sec) => {
        const items = main.filter((n) => n.section === sec);
        if (!items.length) return null;
        return (
          <div key={sec} className="mt-3 flex flex-col gap-0.5">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">{sec}</p>
            {items.map((n) => (
              <NavLink key={n.href} item={n} active={isActive(n.href)} onNavigate={onNavigate} />
            ))}
          </div>
        );
      })}
      {tail.length > 0 && <div className="mt-3" />}
      {tail.map((n) => (
        <NavLink key={n.href} item={n} active={isActive(n.href)} onNavigate={onNavigate} />
      ))}
      <hr className="mx-1 my-2.5 border-line" />
      {account.map((n) => (
        <NavLink key={n.href} item={n} active={isActive(n.href)} onNavigate={onNavigate} />
      ))}
    </div>
  );
}

function NavLink({ item, active, onNavigate }: { item: (typeof NAV)[number]; active: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
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
