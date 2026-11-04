/**
 * Détection des résultats dans le texte d'un compte rendu de laboratoire.
 *
 * Méthode déterministe (règles, sans IA) : pour chaque ligne, libellé → premier
 * nombre (le résultat) → unité → intervalle de référence. Les colonnes suivantes
 * (antériorités) sont ignorées. Rien n'est inventé : un élément absent reste vide.
 * Chaque proposition passe ensuite par `assessDraft` puis par la validation humaine.
 */
import { matchAnalyte } from './analytes';
import type { ExtractedDraft } from './extraction-checks';

export interface SourceLine {
  page: number;
  text: string;
  confidence?: number;
  bbox?: { x: number; y: number; w: number; h: number };
}

export interface ParsedDraft extends ExtractedDraft {
  page: number;
  lineText: string;
  lineIndex: number;
  confidence?: number;
  bbox?: SourceLine['bbox'];
  /** Unité corrigée d'une confusion de lecture courante (ex. « Hmol/L » → « µmol/L »). */
  unitCorrected: boolean;
}

export interface ParsedReport {
  samplingDate: string | null; // AAAA-MM-JJ
  laboratory: string | null;
  drafts: ParsedDraft[];
}

const NUM = String.raw`\d+(?:[.,]\d+)?`;
const LINE_RE = new RegExp(
  String.raw`^(?<label>[^\t]*?[A-Za-zÀ-ÿ][^\t]*?)[\s\t]+(?<cmp>[<>≤≥]=?\s*)?(?<value>${NUM})(?![\d/])` +
    String.raw`(?:[\s\t]*(?<unit>(?:%|[A-Za-zµμ][A-Za-zµμ0-9/.²,]*(?:/[A-Za-z0-9.,²]+)*)))?` +
    String.raw`(?:[\s\t]*(?<ref>\(?\s*${NUM}\s*(?:-|–|à)\s*${NUM}\s*\)?|[<>≤≥]\s*${NUM}))?`,
  'u',
);

const NOT_A_RESULT = /^(soit|pr[ée]lev|[ée]dit|n[ée]\(e\)|n[ée]e? le|patient|page|t[ée]l|date|dossier|r[ée]f[ée]rence|ant[ée]riorit|valid|prescri|demande|code|n°)/i;

/** Corrige les confusions de lecture fréquentes sur les unités. */
export function correctOcrUnit(raw: string): { unit: string; corrected: boolean } {
  const m = /^[Hh]((?:mol|g|U|UI)\/.*)$/.exec(raw);
  if (m) return { unit: `µ${m[1]}`, corrected: true };
  if (raw === 'g/I' || raw === 'g/1') return { unit: 'g/L', corrected: true };
  return { unit: raw, corrected: false };
}

export function detectSamplingDate(lines: readonly SourceLine[]): string | null {
  const re = /(?:pr[ée]lev[ée]?(?:ment)?|date\s+de\s+pr[ée]l[èe]vement)\s*(?:le)?\s*:?\s*(\d{2})[/.-](\d{2})[/.-](\d{4})/i;
  for (const l of lines) {
    const m = re.exec(l.text);
    if (m) {
      const [, d, mo, y] = m;
      const iso = `${y}-${mo}-${d}`;
      const t = new Date(`${iso}T00:00:00Z`);
      if (!Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === iso) return iso;
    }
  }
  return null;
}

export function detectLaboratory(lines: readonly SourceLine[]): string | null {
  const l = lines.slice(0, 15).find((x) => /laboratoire|\bLBM\b|biologie m[ée]dicale/i.test(x.text));
  if (!l) return null;
  const name = l.text.replace(/\t/g, ' ').trim();
  return name.length > 120 ? `${name.slice(0, 117)}…` : name;
}

export function parseLabReport(lines: readonly SourceLine[]): ParsedReport {
  const drafts: ParsedDraft[] = [];
  const samplingDate = detectSamplingDate(lines);
  lines.forEach((line, lineIndex) => {
    const text = line.text.trim();
    if (!/\d/.test(text)) return;
    const m = LINE_RE.exec(text);
    if (!m?.groups) return;
    const label = m.groups.label!.replace(/[\s:.…]+$/, '').trim();
    if (label.length < 2 || NOT_A_RESULT.test(label)) return;
    const analyte = matchAnalyte(label);
    const rawUnit = m.groups.unit?.trim() ?? null;
    // Ligne non reconnue sans unité : trop ambiguë pour être proposée.
    if (!analyte && !rawUnit) return;
    const { unit, corrected } = rawUnit ? correctOcrUnit(rawUnit) : { unit: null, corrected: false };
    drafts.push({
      rawLabel: label,
      rawValue: `${m.groups.cmp?.trim() ?? ''}${m.groups.cmp ? ' ' : ''}${m.groups.value}`,
      rawUnit: unit,
      rawReference: m.groups.ref?.trim() ?? null,
      analyteCode: analyte?.code ?? null,
      samplingDate: samplingDate ? new Date(`${samplingDate}T12:00:00Z`) : null,
      page: line.page,
      lineText: text.replace(/\t/g, '  '),
      lineIndex,
      confidence: line.confidence,
      bbox: line.bbox,
      unitCorrected: corrected,
    });
  });
  return { samplingDate, laboratory: detectLaboratory(lines), drafts };
}
