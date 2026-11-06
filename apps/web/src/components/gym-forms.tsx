'use client';

import { useFormStatus } from 'react-dom';

/** Bouton d'envoi d'un formulaire « salle de sport » : désactivé pendant l'envoi (pas de double appui). */
export function GymSubmit({
  className,
  children,
  ...rest
}: { className: string; children: React.ReactNode } & Pick<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'aria-pressed' | 'title' | 'name' | 'value'>) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending || undefined} className={className} {...rest}>
      {children}
    </button>
  );
}
