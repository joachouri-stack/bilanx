import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
];

const config: NextConfig = {
  // Image Docker autonome (monorepo : suivi des fichiers depuis la racine du dépôt).
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  transpilePackages: ['@bilanx/domain', '@bilanx/auth', '@bilanx/db', '@bilanx/profiles', '@bilanx/records', '@bilanx/documents', '@bilanx/reports', '@bilanx/privacy'],
  serverExternalPackages: ['@node-rs/argon2', 'postgres', 'tesseract.js', 'tesseract.js-core', 'pdfjs-dist', 'pdfkit'],
  // Fichiers chargés dynamiquement (données de langue, moteur WebAssembly, fil d'exécution) :
  // à inclure explicitement dans l'image autonome.
  outputFileTracingIncludes: {
    '/**': [
      '../../node_modules/@tesseract.js-data/fra/4.0.0_best_int/**',
      // tesseract.js et toutes ses dépendances (chargées par son fil d'exécution, invisibles au traçage).
      ...['tesseract.js', 'tesseract.js-core', 'bmp-js', 'idb-keyval', 'is-url', 'node-fetch', 'whatwg-url', 'tr46',
        'webidl-conversions', 'opencollective-postinstall', 'regenerator-runtime', 'wasm-feature-detect', 'zlibjs',
      ].map((p) => `../../node_modules/${p}/**`),
      '../../node_modules/pdfjs-dist/legacy/build/**',
      // Polices standard et données de césure lues à l'exécution par PDFKit.
      '../../node_modules/pdfkit/js/**',
      '../../node_modules/linebreak/**',
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: '26mb' },
  },
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Intégration interdite partout, sauf les originaux affichés dans BILANX même.
      { source: '/((?!api/documents/).*)', headers: [{ key: 'X-Frame-Options', value: 'DENY' }] },
      { source: '/api/documents/:path*', headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }] },
    ];
  },
};

export default config;
