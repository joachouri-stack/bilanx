/**
 * Lecture du texte d'un document, entièrement sur le serveur BILANX :
 *  - PDF « numérique » : couche texte (pdfjs) reconstituée ligne par ligne ;
 *  - image (photo, scan) : reconnaissance de caractères Tesseract (français),
 *    données de langue embarquées, aucun envoi à un service externe.
 * Un PDF scanné sans couche texte est signalé : sa conversion en images pour la
 * reconnaissance de caractères n'est pas encore disponible.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface TextLine {
  page: number; // 1 = première page
  text: string;
  /** Boîte englobante normalisée [0,1] (images uniquement). */
  bbox?: { x: number; y: number; w: number; h: number };
  confidence?: number; // 0..1 (images)
}

export interface ExtractedText {
  method: 'pdf_text' | 'ocr';
  pages: number;
  lines: TextLine[];
  /** Pages sans texte exploitable (PDF scanné). */
  emptyPages: number[];
}

export const ACCEPTED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
export type AcceptedMime = (typeof ACCEPTED_MIME)[number];

/** Détermine le type réel d'après les premiers octets (on ne se fie pas au nom ni au type annoncé). */
export function sniffMime(buf: Buffer): AcceptedMime | 'image/heic' | null {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  const brand = buf.subarray(4, 12).toString('latin1');
  if (brand.startsWith('ftyp') && /heic|heix|hevc|mif1|msf1/.test(brand.slice(4))) return 'image/heic';
  return null;
}

// ───────────────────────── PDF ─────────────────────────
interface PdfItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

export async function pdfText(data: Buffer): Promise<ExtractedText> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(data), useSystemFonts: false, disableFontFace: true });
  const doc = await task.promise;
  const lines: TextLine[] = [];
  const emptyPages: number[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items = (content.items as unknown[]).filter((i): i is PdfItem => typeof (i as PdfItem).str === 'string' && (i as PdfItem).str.trim() !== '');
      if (!items.length) {
        emptyPages.push(p);
        continue;
      }
      // Regroupe par ligne (ordonnée proche), puis trie de gauche à droite.
      const rows: { y: number; parts: { x: number; w: number; s: string }[] }[] = [];
      for (const it of items) {
        const y = it.transform[5]!;
        const x = it.transform[4]!;
        const tol = Math.max(2, (it.height || 10) * 0.4);
        let row = rows.find((r) => Math.abs(r.y - y) <= tol);
        if (!row) rows.push((row = { y, parts: [] }));
        row.parts.push({ x, w: it.width, s: it.str });
      }
      rows.sort((a, b) => b.y - a.y);
      for (const r of rows) {
        r.parts.sort((a, b) => a.x - b.x);
        let text = '';
        let end = -Infinity;
        for (const part of r.parts) {
          // Un grand espace horizontal sépare deux colonnes : on le matérialise par une tabulation.
          if (text) text += part.x - end > 12 ? '\t' : part.x - end > 1.5 ? ' ' : '';
          text += part.s;
          end = part.x + part.w;
        }
        lines.push({ page: p, text: text.replace(/[  ]+/g, ' ').trim() });
      }
    }
    return { method: 'pdf_text', pages: doc.numPages, lines, emptyPages };
  } finally {
    await task.destroy();
  }
}

// ───────────────────────── Images (OCR) ─────────────────────────
/**
 * Données de langue française embarquées (aucun téléchargement à l'exécution).
 * Recherche sur le disque plutôt que par résolution de module : une fois l'application
 * compilée (Next.js), la résolution de module ne renvoie plus un chemin de fichier.
 */
export function langPath(): string {
  const fromEnv = process.env.BILANX_TESSDATA_DIR;
  if (fromEnv && existsSync(join(fromEnv, 'fra.traineddata.gz'))) return fromEnv;
  const rel = join('node_modules', '@tesseract.js-data', 'fra', '4.0.0_best_int');
  for (let dir = process.cwd(); ; dir = dirname(dir)) {
    const candidate = join(dir, rel);
    if (existsSync(join(candidate, 'fra.traineddata.gz'))) return candidate;
    if (dirname(dir) === dir) break;
  }
  throw new Error('Données de reconnaissance du français introuvables (@tesseract.js-data/fra).');
}

type OcrWorker = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>;
let workerPromise: Promise<OcrWorker> | null = null;

async function ocrWorker(): Promise<OcrWorker> {
  workerPromise ??= (async () => {
    const { createWorker } = await import('tesseract.js');
    return createWorker('fra', 1, { langPath: langPath(), cacheMethod: 'none', gzip: true });
  })();
  return workerPromise;
}

export async function imageText(images: Buffer[]): Promise<ExtractedText> {
  const worker = await ocrWorker();
  const lines: TextLine[] = [];
  const emptyPages: number[] = [];
  for (let i = 0; i < images.length; i++) {
    const { data } = await worker.recognize(images[i]!, {}, { blocks: true });
    const W = (data as { imageWidth?: number }).imageWidth;
    let count = 0;
    for (const block of data.blocks ?? []) {
      for (const para of block.paragraphs) {
        for (const line of para.lines) {
          const text = line.text.replace(/\s+/g, ' ').trim();
          if (!text) continue;
          count++;
          const b = line.bbox;
          const width = W ?? Math.max(b.x1, 1);
          lines.push({
            page: i + 1,
            text,
            confidence: line.confidence / 100,
            bbox: { x: b.x0 / width, y: b.y0, w: (b.x1 - b.x0) / width, h: b.y1 - b.y0 },
          });
        }
      }
    }
    if (!count) emptyPages.push(i + 1);
  }
  return { method: 'ocr', pages: images.length, lines, emptyPages };
}

export async function terminateOcr(): Promise<void> {
  if (workerPromise) {
    const w = await workerPromise;
    workerPromise = null;
    await w.terminate();
  }
}
