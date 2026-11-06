'use client';

import { useEffect, useId, useRef } from 'react';

/**
 * Feuille du bas (« bottom sheet »), pensée pour le téléphone ; centrée et limitée en largeur au-delà.
 *
 * - fond assombri cliquable pour fermer, bouton « Fermer », touche Échap ;
 * - `role="dialog"`, `aria-modal`, titre relié par `aria-labelledby` ;
 * - focus placé dans la feuille à l'ouverture, gardé dedans (Tab), rendu à l'élément d'origine à la fermeture ;
 * - défilement de la page bloqué tant qu'elle est ouverte ; défilement interne au-delà de 85 % de l'écran.
 *
 * Rien n'est rendu quand `open` est faux : le contenu n'est donc pas dans la page (ni pour les lecteurs d'écran,
 * ni pour les sélecteurs des tests) tant que la feuille est fermée.
 *
 * @example
 * const [open, setOpen] = useState(false);
 * <button onClick={() => setOpen(true)} aria-haspopup="dialog">Ajouter</button>
 * <Sheet open={open} onClose={() => setOpen(false)} title="Ajouter">…</Sheet>
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  id,
}: {
  open: boolean;
  onClose: () => void;
  /** Titre visible, qui nomme aussi la boîte de dialogue. */
  title: string;
  children: React.ReactNode;
  /** Identifiant du panneau (pour `aria-controls` sur le bouton qui l'ouvre). */
  id?: string;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  // onClose change à chaque rendu du parent : on garde la dernière version sans relancer l'effet.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const el = panel.current;
    const previous = document.activeElement as HTMLElement | null;
    el?.focus({ preventScroll: true });

    const body = document.body.style;
    const before = { overflow: body.overflow };
    body.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close.current();
        return;
      }
      if (e.key !== 'Tab' || !el) return;
      const focusables = Array.from(el.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'));
      if (!focusables.length) return;
      const first = focusables[0]!;
      const last = focusables.at(-1)!;
      if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      body.overflow = before.overflow;
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="sheet-backdrop-in absolute inset-0 bg-[rgb(0_0_0/0.45)]" onClick={() => close.current()} aria-hidden />
      <div
        ref={panel}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="sheet-in absolute inset-x-0 bottom-0 mx-auto flex max-h-[85dvh] w-full max-w-xl flex-col rounded-t-3xl border border-b-0 border-line bg-surface shadow-2xl outline-none"
      >
        <div className="shrink-0 px-4 pt-2">
          <div className="mx-auto h-1.5 w-10 rounded-full bg-line" aria-hidden />
          <div className="mt-1 flex items-center justify-between gap-3">
            <h2 id={titleId} className="text-[17px] font-semibold">
              {title}
            </h2>
            <button
              type="button"
              onClick={() => close.current()}
              className="-mr-2 inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-petrol hover:bg-petrol-2"
            >
              Fermer
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(24px+env(safe-area-inset-bottom))] pt-2">{children}</div>
      </div>
    </div>
  );
}
