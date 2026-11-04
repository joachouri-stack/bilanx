import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', weight: ['600'], display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'BILANX', template: '%s · BILANX' },
  description: 'Toute votre santé, en un seul endroit.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0F5562',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="font-sans text-[15px] leading-normal">
        {children}
      </body>
    </html>
  );
}
