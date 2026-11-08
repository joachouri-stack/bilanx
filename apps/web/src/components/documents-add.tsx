'use client';

import { useEffect, useState } from 'react';
import { Sheet } from './sheet';
import { Icon } from './icon';
import { Button, Card, CardHeader } from './ui';
import { UploadForm } from './document-forms';

const MOBILE = '(max-width: 1023.98px)';

/**
 * Ajout d'un document.
 * - Téléphone et tablette : bouton « Ajouter… » pleine largeur qui ouvre une feuille du bas contenant le formulaire
 *   (la page n'est plus allongée par le formulaire). L'ancre #ajouter (bouton ＋ de la barre d'onglets) ouvre la feuille.
 * - Ordinateur (≥ 1024 px) : le formulaire reste affiché dans une carte latérale (id « ajouter »).
 */
export function DocumentsAdd({
  today,
  defaultKind = '',
  defaultExamType,
  defaultSpecialty,
  defaultFolder,
  label = 'Ajouter un document',
  className = '',
}: {
  today: string;
  defaultKind?: string;
  defaultExamType?: string;
  defaultSpecialty?: string;
  defaultFolder?: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const isMobile = () => window.matchMedia(MOBILE).matches;
    const check = () => {
      if (window.location.hash === '#ajouter' && isMobile()) setOpen(true);
    };
    check();
    // Lien vers « #ajouter » sur la même page (barre d'onglets) : la navigation ne déclenche pas toujours « hashchange ».
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || !isMobile()) return;
      const url = new URL(a.href, window.location.href);
      if (url.hash === '#ajouter' && url.pathname === window.location.pathname) window.setTimeout(() => setOpen(true), 50);
    };
    window.addEventListener('hashchange', check);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('hashchange', check);
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  const close = () => {
    setOpen(false);
    // Retire l'ancre pour qu'un nouvel appui sur « ＋ › Document » rouvre la feuille.
    if (window.location.hash === '#ajouter') window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
  };

  return (
    <div className={`min-w-0 ${className}`}>
      <Button variant="primary" className="w-full lg:hidden" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-controls="feuille-ajout-document">
        <Icon name="plus" className="size-5" />
        {label}
      </Button>
      <Sheet open={open} onClose={close} title={label} id="feuille-ajout-document">
        <UploadForm today={today} defaultKind={defaultKind} defaultExamType={defaultExamType} defaultSpecialty={defaultSpecialty} defaultFolder={defaultFolder} />
      </Sheet>
      <Card id="ajouter" className="hidden scroll-mt-4 lg:block">
        <CardHeader title={label} />
        {!open && <UploadForm today={today} defaultKind={defaultKind} defaultExamType={defaultExamType} defaultSpecialty={defaultSpecialty} defaultFolder={defaultFolder} />}
      </Card>
    </div>
  );
}
