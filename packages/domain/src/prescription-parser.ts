/**
 * Lecture d'une ordonnance (texte du PDF ou OCR d'une photo) : propositions de traitements.
 *
 * Règles :
 *  - rien n'est inventé : un médicament n'est proposé que si son nom figure sur l'ordonnance ;
 *  - les heures de prise ne sont suggérées QUE d'après des mots explicites (matin, midi, soir,
 *    coucher) ; « 3 fois par jour » sans moment précisé reste à compléter par l'utilisateur ;
 *  - chaque déduction est signalée (heures, date de fin calculée, « si besoin », lecture incertaine) ;
 *  - tout reste un BROUILLON jusqu'à la validation humaine, ligne par ligne.
 */
export interface PrescriptionLine {
  text: string;
  page?: number;
  confidence?: number; // 0..1 (OCR)
}

export interface PrescriptionCheck {
  code: 'times_from_words' | 'times_unspecified' | 'as_needed' | 'posology_missing' | 'end_from_duration' | 'low_confidence' | 'non_daily';
  severity: 'info' | 'warn';
  messageFr: string;
}

export interface PrescriptionItem {
  /** Ligne(s) lue(s) sur l'ordonnance, montrées telles quelles à l'utilisateur. */
  lineText: string;
  lineIndex: number;
  page: number;
  name: string;
  strength: string | null;
  /** Posologie recopiée de l'ordonnance (verbatim). */
  posology: string;
  /** Heures suggérées (HH:MM) d'après les mots de la posologie, et quantité par prise. */
  times: string[];
  qty: string | null;
  startDate: string | null;
  endDate: string | null;
  confidence: number | null;
  checks: PrescriptionCheck[];
}

export interface ParsedPrescription {
  prescriber: string | null;
  date: string | null; // AAAA-MM-JJ
  items: PrescriptionItem[];
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const STRENGTH = String.raw`\d+(?:[  ]\d{3})*(?:[.,]\d+)?\s?(?:mg|g|µg|mcg|ui|UI|U\.?I\.?|ml|mL|%)(?:\s?\/\s?\d*\s?(?:ml|mL|g|dose))?`;
const FORM_WORDS = String.raw`comprimés?|cp|gélules?|gel|sachets?|ampoules?|gouttes?|bouffées?|doses?|cuillères?(?: à (?:café|soupe))?|applications?|injections?|unités?|stylos?|patchs?|suppositoires?|pulvérisations?|mesures?|flacons?`;
// Fin de mot « Unicode » : en JavaScript, \b ne considère pas « é » comme une lettre (« comprimé »).
const END = String.raw`(?![\p{L}\d])`;
const QTY_RE = new RegExp(String.raw`(?<![\p{L}\d])((?:\d+(?:[.,]\d+)?|½|1\/2|un|une|deux|trois|quatre)\s*(?:${FORM_WORDS}))${END}`, 'iu');
/** Lignes d'en-tête ou de pied d'ordonnance, jamais des médicaments. */
const NOT_A_DRUG = /^(dr|docteur|pr|professeur|madame|monsieur|mme|m\.|mlle|ordonnance|rpps|adeli|finess|signature|renouvel|qsp|tél|tel|fax|cabinet|centre|hôpital|médecine|né|nee|née|date|patient|poids|âge|age|à renouveler|ald|bizone|duplicata)\b/i;
const POSOLOGY_HINT = new RegExp(String.raw`${QTY_RE.source}|\bfois par\b|\bpar (?:jour|semaine|mois)\b|\b(?:matin|midi|soir|coucher)\b|\bsi (?:besoin|douleur|fièvre)${END}|\bpendant\b`, 'iu');

/** Heures proposées pour les moments cités, dans l'ordre de la journée. */
const MOMENTS: [RegExp, string, string][] = [
  [/\bmatin\b|\bpetit[- ]d[ée]jeuner\b/i, '08:00', 'matin'],
  [/\bmidi\b|\bd[ée]jeuner\b(?<!petit[- ]d[ée]jeuner)/i, '12:00', 'midi'],
  [/\bsoir\b|\bd[iî]ner\b/i, '20:00', 'soir'],
  [/\bcoucher\b/i, '22:00', 'coucher'],
];

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s'’-])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase());
}

function isoDate(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

function findDate(lines: PrescriptionLine[]): string | null {
  for (const l of lines.slice(0, 12)) {
    const num = /\ble\s+(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\b/i.exec(l.text) ?? /\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2})\b/.exec(l.text);
    if (num) return isoDate(Number(num[3]), Number(num[2]), Number(num[1]));
    const words = new RegExp(String.raw`\b(\d{1,2})(?:er)?\s+(${MONTHS.join('|')})\s+(20\d{2})\b`, 'i').exec(l.text);
    if (words) return isoDate(Number(words[3]), MONTHS.indexOf(words[2]!.toLowerCase()) + 1, Number(words[1]));
  }
  return null;
}

function findPrescriber(lines: PrescriptionLine[]): string | null {
  for (const l of lines.slice(0, 12)) {
    const m = /\b(Dr|Docteur|Pr|Professeur)\.?\s+((?:[\p{Lu}][\p{L}'’-]*\s?){1,4})/u.exec(l.text);
    if (m) return `${m[1]!.startsWith('P') ? 'Pr' : 'Dr'} ${m[2]!.trim().replace(/\s+(Paris|Lyon|Marseille)$/, '')}`.slice(0, 120);
  }
  return null;
}

/** « pendant 3 mois » → date de fin incluse, à partir de la date de début. */
function endFromDuration(posology: string, start: string | null): { end: string; basis: string } | null {
  const m = /\bpendant\s+(\d+|un|une|deux|trois|six)\s+(jours?|semaines?|mois)\b/i.exec(posology);
  if (!m || !start) return null;
  const words: Record<string, number> = { un: 1, une: 1, deux: 2, trois: 3, six: 6 };
  const n = /\d/.test(m[1]!) ? Number(m[1]) : words[m[1]!.toLowerCase()]!;
  if (!n || n > 365) return null;
  const [y, mo, d] = start.split('-').map(Number) as [number, number, number];
  const unit = m[2]!.toLowerCase();
  const end = unit.startsWith('mois') ? new Date(Date.UTC(y, mo - 1 + n, d - 1)) : new Date(Date.UTC(y, mo - 1, d + n * (unit.startsWith('semaine') ? 7 : 1) - 1));
  return { end: end.toISOString().slice(0, 10), basis: m[0]! };
}

/** Ligne de médicament : nom (majuscules, ou nom suivi d'un dosage) puis éventuellement la posologie. */
function drugHead(text: string): { name: string; strength: string | null; rest: string } | null {
  const t = text.trim().replace(/^[-•*·\d.)\s]+(?=\p{L})/u, '');
  if (NOT_A_DRUG.test(t) || /^\d/.test(t)) return null;
  const withStrength = new RegExp(String.raw`^([\p{L}][\p{L}'’\-]+(?:\s+[\p{L}][\p{L}0-9'’\-]*){0,3}?)\s+(${STRENGTH})(.*)$`, 'u').exec(t);
  if (withStrength) {
    const name = withStrength[1]!.trim();
    // Nom en minuscules sans dosage reconnu : trop incertain (texte courant).
    if (!/^\p{Lu}/u.test(name)) return null;
    return { name, strength: withStrength[2]!.replace(/\s+/g, ' ').replace(/U\.?I\.?$/i, 'UI'), rest: withStrength[3]!.trim() };
  }
  const upper = /^((?:[\p{Lu}][\p{Lu}'’\-]{2,})(?:\s+[\p{Lu}][\p{Lu}0-9'’\-]*){0,3})(?=[\s,.:;]|$)(.*)$/u.exec(t);
  if (upper && upper[1]!.length >= 4) return { name: upper[1]!.trim(), strength: null, rest: upper[2]!.trim() };
  return null;
}

export function parsePrescription(lines: PrescriptionLine[], fallbackStart?: string): ParsedPrescription {
  const date = findDate(lines);
  const prescriber = findPrescriber(lines);
  const start = date ?? fallbackStart ?? null;
  const items: PrescriptionItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const head = drugHead(lines[i]!.text);
    if (!head) continue;
    // Posologie : sur la même ligne (après « : », « - », la forme) ou sur la/les ligne(s) suivante(s).
    const parts = [head.rest.replace(/^[,;:\-–—]\s*/, '')];
    const used = [i];
    for (let j = i + 1; j < Math.min(lines.length, i + 3); j++) {
      const t = lines[j]!.text.trim();
      if (!t || drugHead(t) || NOT_A_DRUG.test(t)) break;
      if (!POSOLOGY_HINT.test(t) && parts.some((p) => POSOLOGY_HINT.test(p))) break;
      parts.push(t);
      used.push(j);
    }
    // La forme (« comprimé pelliculé ») reste avec le nom ; la posologie commence au premier indice de prise.
    const joined = parts.filter(Boolean).join(' — ');
    const hint = POSOLOGY_HINT.exec(joined);
    const posology = hint ? joined.slice(hint.index).replace(/^—\s*/, '').trim() : '';
    const checks: PrescriptionCheck[] = [];
    const conf = used.map((k) => lines[k]!.confidence).filter((c): c is number => c !== undefined);
    const confidence = conf.length ? Math.min(...conf) : null;
    if (confidence !== null && confidence < 0.8)
      checks.push({ code: 'low_confidence', severity: 'warn', messageFr: 'Lecture incertaine sur la photo : comparez le nom et le dosage avec l’ordonnance.' });

    let times: string[] = [];
    let qty: string | null = null;
    if (!posology) {
      checks.push({ code: 'posology_missing', severity: 'warn', messageFr: 'Posologie non retrouvée : recopiez-la depuis l’ordonnance.' });
    } else {
      qty = QTY_RE.exec(posology)?.[1] ?? null;
      const asNeeded = /\bsi (?:besoin|douleur|fièvre|nécessaire)(?!\p{L})|\ben cas de\b/iu.test(posology);
      const nonDaily = /\bpar (?:semaine|mois)\b|\btous les \d+ jours\b|\b1 jour sur 2\b/i.test(posology);
      const moments = MOMENTS.filter(([re]) => re.test(posology));
      if (asNeeded) {
        checks.push({ code: 'as_needed', severity: 'info', messageFr: 'Traitement « si besoin » : pas d’heure fixe ni de rappel quotidien.' });
      } else if (nonDaily) {
        checks.push({ code: 'non_daily', severity: 'info', messageFr: 'Prise non quotidienne : pas d’heure fixe ni de rappel quotidien (notez la date de prise dans votre agenda).' });
      } else if (moments.length) {
        times = moments.map(([, t]) => t);
        checks.push({
          code: 'times_from_words',
          severity: 'info',
          messageFr: `Heures proposées d’après « ${moments.map(([, , w]) => w).join(', ')} » : adaptez-les à vos habitudes.`,
        });
      } else {
        checks.push({ code: 'times_unspecified', severity: 'warn', messageFr: 'L’ordonnance ne précise pas les moments de prise : indiquez les heures vous-même, ou laissez vide.' });
      }
    }
    const end = endFromDuration(posology, start);
    if (end) checks.push({ code: 'end_from_duration', severity: 'info', messageFr: `Date de fin calculée d’après « ${end.basis} » à partir du ${start} : vérifiez-la.` });

    items.push({
      lineText: used.map((k) => lines[k]!.text.trim()).join('\n'),
      lineIndex: i,
      page: lines[i]!.page ?? 1,
      name: /^[\p{Lu}\s'’\-0-9]+$/u.test(head.name) ? titleCase(head.name) : head.name,
      strength: head.strength,
      posology: posology.slice(0, 300),
      times,
      qty: qty ? qty.slice(0, 40) : null,
      startDate: start,
      endDate: end?.end ?? null,
      confidence,
      checks,
    });
    i = used.at(-1)!;
  }
  return { prescriber, date, items };
}

/** L'ordonnance ressemble-t-elle à une ordonnance (et non à un bilan) ? */
export function looksLikePrescription(lines: PrescriptionLine[]): boolean {
  const text = lines.map((l) => l.text).join('\n');
  const signals = [/\bordonnance\b/i, /\b(Dr|Docteur)\b/, /\bRPPS\b/i, new RegExp(FORM_WORDS, 'i'), /\bfois par jour\b|\b(matin|soir)\b/i, /\bpendant \d+ (jours|semaines|mois)\b/i, /\brenouvel/i];
  return signals.filter((r) => r.test(text)).length >= 3;
}
