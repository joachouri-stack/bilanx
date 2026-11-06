'use client';

import { useEffect } from 'react';
import { Button, ButtonLink } from '@/components/ui';

/**
 * Erreur inattendue pendant l'affichage d'une page. Aucun détail technique montré (le code `digest`
 * permet seulement de retrouver l'erreur dans le journal du serveur).
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-4 py-10 text-center">
      <div className="card w-full max-w-[440px] p-6 sm:p-8">
        <h1 className="font-display text-[26px] font-semibold leading-tight">Un problème est survenu.</h1>
        <p className="mt-2 text-ink-2">Vos données ne sont pas perdues. Vous pouvez réessayer dans un instant.</p>
        <div className="mt-6 flex flex-col gap-2">
          <Button variant="primary" onClick={() => reset()}>
            Réessayer
          </Button>
          <ButtonLink href="/tableau-de-bord" variant="ghost">
            Retour à l’accueil
          </ButtonLink>
        </div>
        {error.digest && <p className="mt-4 text-[13px] text-ink-3">Référence : {error.digest}</p>}
      </div>
    </div>
  );
}
