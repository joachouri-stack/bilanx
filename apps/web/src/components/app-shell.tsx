'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MOBILE_TABS, NAV, NAV_SECTIONS, QUICK_ADD, type NavItem } from '@/lib/navigation';
import { signOutAction, switchProfileAction } from '@/lib/server/actions';
import { Icon } from './icon';
import { Sheet } from './sheet';
import { QuickAddContent } from './quick-add';

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

const DISCLAIMER = 'Prototype : hébergement certifié HDS pas encore en place. BILANX ne remplace pas l’avis d’un professionnel de santé. Urgence : 15 ou 112.';

/**
 * Coque de l'application.
 * - Ordinateur (≥ lg) : menu latéral (compte, sélecteur de profil, rubriques).
 * - Téléphone : entête collante (BILANX + avatar du profil affiché) et barre d'onglets du bas
 *   Accueil · Glycémie · ＋ · Documents · Menu ; « ＋ », « Menu » et l'avatar ouvrent des feuilles du bas.
 */
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
  const [sheet, setSheet] = useState<'menu' | 'add' | 'profile' | null>(null);
  const closeSheet = () => setSheet(null);
  // Fermeture à chaque changement de page ou de profil affiché.
  useEffect(() => setSheet(null), [pathname, activeId]);
  const [home, glucose, docs] = MOBILE_TABS.map((href) => (hidden.includes(href) ? null : NAV.find((n) => n.href === href)!));

  return (
    <div className="min-h-dvh">
      {/* Premier élément au clavier : évite de parcourir tout le menu à chaque page (WCAG 2.4.1). */}
      <a
        href="#contenu"
        className="sr-only z-[60] rounded-xl bg-petrol px-4 py-2 font-medium text-on-accent focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Aller au contenu
      </a>

      <div className="sticky top-0 z-20 lg:static">
        <header className="flex items-end border-b border-line bg-surface/90 pt-[env(safe-area-inset-top)] backdrop-blur-md lg:hidden">
          <div className="flex h-[52px] w-full items-center justify-between gap-3 pl-4 pr-1.5">
            <Link href="/tableau-de-bord" className="font-display text-xl tracking-wide text-petrol">
              BILANX
            </Link>
            <button
              type="button"
              onClick={() => setSheet('profile')}
              aria-haspopup="dialog"
              aria-expanded={sheet === 'profile'}
              aria-label={`Changer de profil — profil affiché : ${active.name}${active.isDemo ? ' (démonstration)' : ''}`}
              className="grid size-11 place-items-center rounded-full"
            >
              <Avatar p={active} />
            </button>
          </div>
        </header>
        {active.isDemo && (
          <p role="note" className="border-b border-line bg-amber-2 px-4 py-1.5 text-center text-[13px] text-ink">
            ⚠️ Profil de démonstration — <strong>toutes les données affichées sont fictives</strong>.
          </p>
        )}
      </div>

      <div className="lg:grid lg:grid-cols-[264px_1fr]">
        <aside className="sticky top-0 hidden h-dvh overflow-y-auto border-r border-line bg-surface px-3.5 py-5 lg:block">
          <Link href="/tableau-de-bord" className="block px-2.5 font-display text-2xl tracking-wide text-petrol">
            BILANX
          </Link>
          <p className="px-2.5 pb-4 text-xs text-ink-3">Toute votre santé, en un seul endroit.</p>
          <AccountBox user={user} />
          <ProfileSwitcher key={activeId} profiles={profiles} active={active} />
          <nav aria-label="Navigation principale" className="mt-4">
            <Favorites items={main} isActive={isActive} />
            <NavGroups main={main} account={account} isActive={isActive} />
          </nav>
          <p className="mt-6 px-3 text-[11px] leading-snug text-ink-3">{DISCLAIMER}</p>
        </aside>
        <main
          id="contenu"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1240px] px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-5 outline-none sm:px-8 lg:pb-16 lg:pt-7"
        >
          {children}
        </main>
      </div>

      <nav
        aria-label="Navigation mobile"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        <div className="grid h-14 grid-cols-5 items-stretch text-center text-xs text-ink-3">
          {home ? <TabLink item={home} active={isActive(home.href)} /> : <span />}
          {glucose ? <TabLink item={glucose} active={isActive(glucose.href)} /> : <span />}
          <div className="flex items-start justify-center">
            <button
              type="button"
              onClick={() => setSheet('add')}
              aria-haspopup="dialog"
              aria-expanded={sheet === 'add'}
              aria-controls="ajout-rapide"
              aria-label="Ajouter : glycémie, pas, séance de sport, insuline, repas, médicament, HbA1c, rendez-vous, document"
              className="-mt-4 grid size-14 place-items-center rounded-full bg-petrol text-on-accent shadow-lg ring-4 ring-bg active:scale-95"
            >
              <Icon name="plus" className="size-7" strokeWidth={2.2} />
            </button>
          </div>
          {docs ? <TabLink item={docs} active={isActive(docs.href)} /> : <span />}
          <button
            type="button"
            onClick={() => setSheet('menu')}
            aria-haspopup="dialog"
            aria-expanded={sheet === 'menu'}
            aria-controls="menu-complet"
            className={`flex flex-col items-center justify-center gap-0.5 ${sheet === 'menu' ? 'text-petrol' : ''}`}
          >
            <Icon name="menu" className="size-6" />
            Menu
          </button>
        </div>
      </nav>

      <Sheet open={sheet === 'add'} onClose={closeSheet} title="Ajouter" id="ajout-rapide">
        {quick.length ? (
          // Clé : revient au premier écran à chaque ouverture de la feuille.
          <QuickAddContent key={sheet === 'add' ? 'ouvert' : 'ferme'} items={quick} onDone={closeSheet} />
        ) : (
          <p className="text-sm text-ink-3">Aucun ajout possible pour ce profil.</p>
        )}
      </Sheet>

      <Sheet open={sheet === 'menu'} onClose={closeSheet} title="Menu" id="menu-complet">
        <Favorites items={main} isActive={isActive} onNavigate={closeSheet} large />
        <ProfileList profiles={profiles} active={active} />
        <nav aria-label="Rubriques" className="mt-4">
          <NavGroups main={main} account={account} isActive={isActive} onNavigate={closeSheet} large />
        </nav>
        <div className="mt-5 border-t border-line pt-4">
          <p className="mb-2 truncate px-1 text-[13px] text-ink-3">Connecté : {user.email}</p>
          <form action={signOutAction}>
            <button
              type="submit"
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-5 font-medium text-red hover:bg-red-2"
            >
              <Icon name="logout" />
              Se déconnecter
            </button>
          </form>
        </div>
        <p className="mt-5 px-1 text-[11px] leading-snug text-ink-3">{DISCLAIMER}</p>
      </Sheet>

      <Sheet open={sheet === 'profile'} onClose={closeSheet} title="Changer de profil" id="choix-profil">
        <ProfileList profiles={profiles} active={active} />
      </Sheet>
    </div>
  );
}

function AccountBox({ user }: { user: ShellUser }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-line py-1 pl-3 pr-1">
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{user.displayName || 'Mon compte'}</span>
        <span className="block truncate text-xs text-ink-3">{user.email}</span>
      </span>
      <form action={signOutAction}>
        <button type="submit" className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-2.5 text-xs text-ink-2 hover:bg-surface-2">
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

/** Liste des profils (un formulaire par profil) et lien vers la gestion de la famille. */
function ProfileList({ profiles, active }: { profiles: ShellProfile[]; active: ShellProfile }) {
  return (
    <div>
      <p className="px-1 pb-1.5 text-[12px] font-semibold uppercase tracking-wider text-ink-3">Profil affiché</p>
      <ul className="flex flex-col gap-1">
        {profiles.map((p) => (
          <li key={p.id}>
            <form action={switchProfileAction}>
              <input type="hidden" name="profileId" value={p.id} />
              <button
                type="submit"
                aria-current={p.id === active.id ? 'true' : undefined}
                className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-left ${p.id === active.id ? 'bg-petrol-2' : 'hover:bg-surface-2'}`}
              >
                <Avatar p={p} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="block truncate text-[13px] text-ink-3">{p.detail}</span>
                </span>
                {p.id === active.id && <Icon name="check" className="size-5 shrink-0 text-petrol" />}
              </button>
            </form>
          </li>
        ))}
      </ul>
      <Link href="/famille" className="mt-1 flex min-h-11 items-center rounded-xl px-2.5 text-sm font-medium text-petrol hover:bg-petrol-2">
        Gérer la famille et les accès →
      </Link>
    </div>
  );
}

/**
 * Sélecteur du profil affiché (ordinateur) : toujours visible pour ne jamais confondre deux personnes.
 * Se referme au clic extérieur et avec Échap.
 */
function ProfileSwitcher({ profiles, active }: { profiles: ShellProfile[]; active: ShellProfile }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const d = ref.current;
      if (d?.open && !d.contains(e.target as Node)) d.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      const d = ref.current;
      if (e.key === 'Escape' && d?.open) {
        d.open = false;
        d.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);
  return (
    <details ref={ref} className="group relative">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2.5 rounded-2xl bg-surface-2 p-2.5 [&::-webkit-details-marker]:hidden">
        <Avatar p={active} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">
            {active.name}{' '}
            {active.isDemo && <span className="rounded-full bg-amber-2 px-1.5 py-px text-[10px] font-medium text-amber">démo</span>}
          </span>
          <span className="block truncate text-xs text-ink-3">{active.detail}</span>
        </span>
        <Icon name="chevronDown" className="size-4 shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
        <span className="sr-only">Changer de profil</span>
      </summary>
      <div className="absolute inset-x-0 z-30 mt-1.5 rounded-2xl border border-line bg-surface p-1.5 shadow-lg">
        <ProfileList profiles={profiles} active={active} />
      </div>
    </details>
  );
}

/** Favoris par défaut : en haut du menu (modifiables, mémorisés sur l'appareil). */
const DEFAULT_FAVORITES = ['/documents', '/rendez-vous', '/rapports'];
const FAVORITES_KEY = 'bilanx_favoris';
const MAX_FAVORITES = 6;
const FAV_TONE: Record<string, string> = {
  '/documents': 'bg-rose-2 text-rose',
  '/ordonnances': 'bg-amber-2 text-amber',
  '/rendez-vous': 'bg-violet-2 text-violet',
  '/rapports': 'bg-petrol-2 text-petrol',
  '/glycemie': 'bg-glucose-2 text-glucose',
  '/analyses': 'bg-petrol-2 text-petrol',
  '/activite': 'bg-sage-2 text-sage',
  '/salle-de-sport': 'bg-sage-2 text-sage',
  '/poids': 'bg-indigo-2 text-indigo',
};

function readFavorites(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(FAVORITES_KEY) ?? 'null');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : DEFAULT_FAVORITES;
  } catch {
    return DEFAULT_FAVORITES;
  }
}

/** Favoris partagés entre le menu latéral et la feuille du téléphone (même appareil). */
function useFavorites(): [string[], (next: string[]) => void] {
  const [fav, setFav] = useState(DEFAULT_FAVORITES);
  useEffect(() => {
    const sync = () => setFav(readFavorites());
    sync();
    window.addEventListener('bilanx-favoris', sync);
    return () => window.removeEventListener('bilanx-favoris', sync);
  }, []);
  const save = (next: string[]) => {
    setFav(next);
    try {
      window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
    } catch {
      /* stockage indisponible : les favoris valent pour cette visite */
    }
    window.dispatchEvent(new Event('bilanx-favoris'));
  };
  return [fav, save];
}

/** Favoris en haut du menu : grandes tuiles colorées ; « Modifier » permet d'en ajouter ou d'en retirer (6 au plus). */
function Favorites({ items, isActive, onNavigate, large = false }: { items: NavItem[]; isActive: (h: string) => boolean; onNavigate?: () => void; large?: boolean }) {
  const [fav, save] = useFavorites();
  const [editing, setEditing] = useState(false);
  const choices = items.filter((n) => n.href !== '/tableau-de-bord');
  const shown = fav.map((h) => choices.find((n) => n.href === h)).filter((n): n is NavItem => !!n);
  const toggle = (href: string) => save(fav.includes(href) ? fav.filter((h) => h !== href) : [...fav, href].slice(0, MAX_FAVORITES));
  return (
    <section aria-labelledby={large ? 'favoris-menu' : 'favoris-cote'} className="mb-4">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 id={large ? 'favoris-menu' : 'favoris-cote'} className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-ink-3">
          <Icon name="star" className="size-3.5" />
          Favoris
        </h2>
        <button type="button" onClick={() => setEditing((e) => !e)} aria-expanded={editing} className="min-h-11 px-2 text-sm font-medium text-petrol">
          {editing ? 'Terminé' : 'Modifier'}
        </button>
      </div>
      {editing ? (
        <ul className="flex flex-col gap-1 rounded-2xl border border-line p-1.5">
          {choices.map((n) => {
            const on = fav.includes(n.href);
            const full = !on && fav.length >= MAX_FAVORITES;
            return (
              <li key={n.href}>
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={full}
                  onClick={() => toggle(n.href)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2.5 text-left font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-50"
                >
                  <Icon name={n.icon} className="size-5 shrink-0" />
                  <span className="flex-1">{n.label}</span>
                  <svg viewBox="0 0 24 24" className={`size-5 shrink-0 ${on ? 'fill-amber text-amber' : 'fill-none text-ink-3'}`} stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" aria-hidden>
                    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z" />
                  </svg>
                  <span className="sr-only">{on ? '(favori)' : ''}</span>
                </button>
              </li>
            );
          })}
          <li className="px-2.5 py-1 text-[13px] text-ink-3">Touchez l’étoile pour ajouter ou retirer ({MAX_FAVORITES} au plus).</li>
        </ul>
      ) : shown.length ? (
        <ul className="grid grid-cols-3 gap-2">
          {shown.map((n) => (
            <li key={n.href} className="min-w-0">
              <Link
                href={n.href}
                onClick={onNavigate}
                aria-current={isActive(n.href) ? 'page' : undefined}
                className={`flex h-full flex-col items-center justify-center gap-1.5 rounded-2xl border p-2 text-center text-[13px] font-semibold leading-tight transition active:scale-[0.97] ${large ? 'min-h-24' : 'min-h-20'} ${
                  isActive(n.href) ? 'border-petrol bg-petrol-2' : 'border-line bg-surface hover:bg-surface-2'
                }`}
              >
                <span className={`grid size-10 place-items-center rounded-xl ${FAV_TONE[n.href] ?? 'bg-surface-2 text-ink-2'}`} aria-hidden>
                  <Icon name={n.icon} className="size-5" />
                </span>
                <span className="line-clamp-2 w-full break-words">{n.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-1 text-sm text-ink-3">Aucun favori. Touchez « Modifier » pour en choisir.</p>
      )}
    </section>
  );
}

/** Menu par rubriques : les éléments consécutifs d'une même rubrique sont regroupés sous son titre, puis le compte. */
function NavGroups({
  main,
  account,
  isActive,
  onNavigate,
  large = false,
}: {
  main: NavItem[];
  account: NavItem[];
  isActive: (h: string) => boolean;
  onNavigate?: () => void;
  /** Feuille du téléphone : liens de 48 px. */
  large?: boolean;
}) {
  const blocks: { section?: string; items: NavItem[] }[] = [];
  for (const n of main) {
    const last = blocks.at(-1);
    if (last && n.section && last.section === n.section) last.items.push(n);
    else blocks.push({ section: n.section, items: [n] });
  }
  const link = (n: NavItem) => <NavLink key={n.href} item={n} active={isActive(n.href)} onNavigate={onNavigate} large={large} />;
  return (
    <div className="flex flex-col gap-0.5">
      {blocks.map((b, i) =>
        b.section && NAV_SECTIONS.includes(b.section as (typeof NAV_SECTIONS)[number]) ? (
          <div key={b.section} className="mt-3 flex flex-col gap-0.5">
            <p className="px-3 pb-1 text-[12px] font-semibold uppercase tracking-wider text-ink-3">{b.section}</p>
            {b.items.map(link)}
          </div>
        ) : (
          <div key={b.items[0]!.href} className={i > 0 ? 'mt-3 flex flex-col gap-0.5' : 'flex flex-col gap-0.5'}>
            {b.items.map(link)}
          </div>
        ),
      )}
      <hr className="mx-1 my-2.5 border-line" />
      {account.map(link)}
    </div>
  );
}

function NavLink({ item, active, onNavigate, large }: { item: NavItem; active: boolean; onNavigate?: () => void; large?: boolean }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-xl px-3 font-medium transition-colors ${large ? 'min-h-12' : 'min-h-11'} ${
        active ? 'bg-petrol-2 text-petrol' : 'text-ink-2 hover:bg-surface-2'
      }`}
    >
      <Icon name={item.icon} className="size-5 shrink-0" />
      <span className="flex-1">{item.label}</span>
      {item.status === 'planned' && <span className="text-[10px] font-normal text-ink-3">bientôt</span>}
    </Link>
  );
}

function TabLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`flex flex-col items-center justify-center gap-0.5 ${active ? 'font-semibold text-petrol' : ''}`}
    >
      <Icon name={item.icon} className="size-6" strokeWidth={active ? 2 : 1.7} />
      {item.short}
    </Link>
  );
}
