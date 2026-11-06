import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import './globals.css';
import { ServiceWorker } from '@/components/service-worker';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', weight: ['600'], display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'BILANX', template: '%s · BILANX' },
  description: 'Toute votre santé, en un seul endroit.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  // iPhone : ouverture en plein écran depuis l'écran d'accueil.
  appleWebApp: { capable: true, title: 'BILANX', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  // Couleur de la barre d'état / de l'onglet : celle de l'entête (jeton --surface, clair et sombre).
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#162226' },
  ],
  colorScheme: 'light dark',
  width: 'device-width',
  initialScale: 1,
  // iPhone : le contenu s'étend sous l'encoche et la barre d'accueil ; les marges env(safe-area-inset-*) le protègent.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="font-sans text-[15px] leading-normal">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
