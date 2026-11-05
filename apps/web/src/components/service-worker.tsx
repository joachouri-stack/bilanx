'use client';

import { useEffect } from 'react';

/** Enregistre le service worker (application installable, page hors ligne). En production seulement. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      /* Navigation privée, HTTP non sécurisé… : l'application fonctionne sans. */
    });
  }, []);
  return null;
}
