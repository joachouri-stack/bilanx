/**
 * Génère les icônes PNG de l'application installable à partir de public/icon.svg.
 *   node apps/web/scripts/generer-icones.mjs
 * iOS n'accepte pas les icônes SVG ; Android attend 192 et 512 px, et une icône « maskable »
 * dont le motif tient dans la zone de sécurité (cercle de 80 % du côté).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Playwright n'est pas une dépendance du projet : on utilise celui de la machine (require suit NODE_PATH).
const { chromium } = createRequire(import.meta.url)('playwright');

const pub = (p) => fileURLToPath(new URL(`../public/${p}`, import.meta.url));
const svg = readFileSync(pub('icon.svg'), 'utf8');
// Motif seul (sans le carré arrondi de fond), pour les icônes à fond plein.
const motif = svg.replace(/<rect width="512" height="512" rx="112" fill="#0F5562"\/>/, '');
if (motif === svg) throw new Error('Fond de icon.svg introuvable : mettez à jour ce script.');
const BG = '#0F5562';

const variants = [
  // [fichier, taille, html]
  ['icons/icon-192.png', 192, svg],
  ['icons/icon-512.png', 512, svg],
  // Fond plein (le système découpe la forme) ; motif réduit à 70 % pour la zone de sécurité.
  ['icons/icon-maskable-512.png', 512, `<div style="width:512px;height:512px;background:${BG};display:grid;place-items:center"><div style="width:358px;height:358px">${motif.replace('<svg ', '<svg width="358" height="358" ')}</div></div>`],
  // iOS arrondit lui-même les coins : fond plein, motif à 85 %.
  ['icons/apple-touch-icon.png', 180, `<div style="width:180px;height:180px;background:${BG};display:grid;place-items:center"><div style="width:153px;height:153px">${motif.replace('<svg ', '<svg width="153" height="153" ')}</div></div>`],
];

const browser = await chromium.launch();
for (const [file, size, html] of variants) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const body = html.startsWith('<svg') ? html.replace('<svg ', `<svg width="${size}" height="${size}" `) : html.replace(/512px|180px/g, `${size}px`);
  await page.setContent(`<html><body style="margin:0;background:transparent">${body}</body></html>`);
  await page.screenshot({ path: pub(file), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
  console.log(`✓ ${file} (${size} px)`);
}
await browser.close();
