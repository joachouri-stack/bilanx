import type { Metadata } from 'next';
import { ButtonLink } from '@/components/ui';

export const metadata: Metadata = { title: 'Page introuvable' };

/**
 * Page 404 (adresse inconnue, ou `notFound()` appelé par une page). Le plus souvent affichée dans la coque
 * de l'application (route [module]) : pas de `<main>` ni de logo ici, la coque les fournit déjà.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-4 py-10 text-center">
      <div className="card w-full max-w-[440px] p-6 sm:p-8">
        <h1 className="font-display text-[26px] font-semibold leading-tight">Cette page n’existe pas.</h1>
        <p className="mt-2 text-ink-2">Le lien est peut-être incomplet, ou la page a été déplacée.</p>
        <ButtonLink href="/tableau-de-bord" variant="primary" className="mt-6 w-full">
          Retour à l’accueil
        </ButtonLink>
      </div>
    </div>
  );
}
