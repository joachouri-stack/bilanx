'use client';

import { useEffect, useState } from 'react';
import { buttonClass, Card, CardHeader } from './ui';

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
type State = 'unknown' | 'installed' | 'prompt' | 'ios' | 'ios-other-browser' | 'manual';

/** Carte « Installer BILANX » (Android : bouton ; iPhone : marche à suivre). Masquée si BILANX est déjà installée. */
export function InstallApp() {
  const [state, setState] = useState<State>('unknown');
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
    if (standalone) return setState('installed');
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
    if (ios) return setState(/CriOS|FxiOS|EdgiOS/.test(ua) ? 'ios-other-browser' : 'ios');
    setState('manual');
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
      setState('prompt');
    };
    const onInstalled = () => setState('installed');
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // Rien à afficher tant que l'appareil n'est pas connu, ni une fois BILANX installée.
  if (state === 'unknown' || state === 'installed') return null;
  return (
    <Card>
      <CardHeader title="Installer BILANX" />
      <div className="flex flex-col gap-3 text-sm text-ink-2" data-install-state={state}>
        <p>Une icône sur l’écran d’accueil, en plein écran. Vos données de santé restent sur nos serveurs : une connexion internet est nécessaire.</p>
        {state === 'prompt' && (
          <button
            type="button"
            onClick={async () => {
              await prompt?.prompt();
              if ((await prompt?.userChoice)?.outcome === 'accepted') setState('installed');
            }}
            className={buttonClass({ variant: 'primary', className: 'self-start' })}
          >
            Installer BILANX
          </button>
        )}
        {state === 'ios' && (
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Appuyez sur le bouton <strong>Partager</strong> (carré avec une flèche vers le haut) en bas de Safari.
            </li>
            <li>
              Choisissez <strong>Sur l’écran d’accueil</strong>, puis <strong>Ajouter</strong>.
            </li>
          </ol>
        )}
        {state === 'ios-other-browser' && <p>Sur iPhone, ouvrez BILANX dans <strong>Safari</strong> pour l’ajouter à l’écran d’accueil.</p>}
        {state === 'manual' && (
          <p>
            Dans le menu du navigateur, choisissez <strong>Installer l’application</strong> ou <strong>Ajouter à l’écran d’accueil</strong>.
          </p>
        )}
      </div>
    </Card>
  );
}
