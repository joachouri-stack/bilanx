'use client';

import { useState } from 'react';

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
  return (
    <details id={id} className={className} open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      {summary}
      {children}
    </details>
  );
}
