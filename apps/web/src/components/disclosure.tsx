'use client';

import { useEffect, useState } from 'react';

/**
 * <details> dont l'état ouvert/fermé appartient à l'utilisateur : un nouveau rendu serveur (après un enregistrement)
 * ne le referme pas. `initialOpen` ne sert qu'au premier affichage.
 */
export function Disclosure({
  id,
  className,
  initialOpen = false,
  summary,
  children,
}: {
  id?: string;
  className?: string;
  initialOpen?: boolean;
  summary: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(initialOpen);
  // Lien vers l'ancre (#id), ex. « Ajouter une glycémie » depuis le bouton ＋ : on ouvre et on fait défiler.
  useEffect(() => {
    if (!id) return;
    const check = () => {
      if (window.location.hash === `#${id}`) {
        setOpen(true);
        window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 50);
      }
    };
    check();
    window.addEventListener('hashchange', check);
    return () => window.removeEventListener('hashchange', check);
  }, [id]);
  return (
    <details id={id} className={className} open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      {summary}
      {children}
    </details>
  );
}
