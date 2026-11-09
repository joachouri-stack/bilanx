/**
 * Contrôles DÉTERMINISTES appliqués aux valeurs proposées par l'extraction IA,
 * avant présentation à l'utilisateur. Ces contrôles ne valident jamais une
 * valeur : ils signalent ce qui doit être vérifié. Seule une confirmation
 * humaine transforme un brouillon en résultat.
 */
import { getAnalyte, isKnownUnit, matchAnalyte, toCanonical, type LabQualitative } from './analytes';

export interface ExtractedDraft {
  rawLabel: string;
  rawValue: string;
  rawUnit?: string | null;
  rawReference?: string | null;
  /** Code d'analyte proposé par l'IA ; recalculé par correspondance de synonymes s'il est absent. */
  analyteCode?: string | null;
  samplingDate?: Date | null;
  /** Conclusion telle qu'écrite sur le document (« Négatif », « NON REACTIF »…), pour les sérologies. */
  rawQualitative?: string | null;
}

/**
 * Conclusion qualitative d'un libellé de laboratoire.
 * « non réactif » est testé avant « réactif » ; « positivité » (seuil) n'est pas une conclusion.
 */
const QUALITATIVE_WORDS: [RegExp, LabQualitative][] = [
  [/^(?:negati(?:f|ve)s?|neg\.?|non[\s-]+reacti(?:f|ve)|non[\s-]+detecte(?:e|s)?)$/, 'negative'],
  [/^(?:positi(?:f|ve)s?|pos\.?|reacti(?:f|ve)|detecte(?:e|s)?)$/, 'positive'],
  [/^(?:douteu(?:x|se)|equivoque|indetermine(?:e)?|limite)$/, 'equivocal'],
];

/** Repli des accents sans changer la longueur (positions conservées). */
export function foldSameLength(s: string): string {
  return [...s].map((c) => (c.normalize('NFD')[0] ?? c).toLowerCase().slice(0, 1) || c).join('');
}

export function parseQualitative(raw: string | null | undefined): LabQualitative | null {
  if (!raw) return null;
  const s = foldSameLength(raw.trim()).replace(/\s+/g, ' ');
  for (const [re, q] of QUALITATIVE_WORDS) if (re.test(s)) return q;
  return null;
}

const QUAL_IN_LINE =
  /(?<![a-z])(non[\s-]+reacti(?:f|ve)|non[\s-]+detecte(?:e|s)?|negati(?:f|ve)s?|positi(?:f|ve)s?|reacti(?:f|ve)|douteu(?:x|se)|equivoque|indetermine(?:e)?)(?![a-z])/g;

/**
 * Cherche la conclusion d'une ligne de résultat. Ignore les mots placés dans une référence :
 * entre parenthèses, ou suivis d'un seuil (« Négatif < 1,00 », « positif si > 10 »).
 * Renvoie le texte tel qu'écrit et sa position, ou null si aucune conclusion (ou plusieurs différentes).
 */
export function findQualitativeInLine(text: string): { raw: string; index: number; qualitative: LabQualitative } | null {
  const folded = foldSameLength(text);
  const found: { raw: string; index: number; qualitative: LabQualitative }[] = [];
  for (const m of folded.matchAll(QUAL_IN_LINE)) {
    const index = m.index!;
    const before = folded.slice(0, index);
    if ((before.match(/\(/g)?.length ?? 0) > (before.match(/\)/g)?.length ?? 0)) continue;
    const after = folded.slice(index + m[0].length);
    if (/^\s*(?:si|:)?\s*(?:<|>|≤|≥|inf|sup|a partir)/.test(after)) continue;
    const q = parseQualitative(m[0]);
    if (q) found.push({ raw: text.slice(index, index + m[0].length), index, qualitative: q });
  }
  if (!found.length || found.some((f) => f.qualitative !== found[0]!.qualitative)) return null;
  return found[0]!;
}

export type CheckCode =
  | 'value_not_in_source'
  | 'value_unparseable'
  | 'analyte_unmatched'
  | 'unit_missing'
  | 'unit_unknown'
  | 'implausible_value'
  | 'reference_inverted'
  | 'value_outside_reference_far'
  | 'sampling_date_missing'
  | 'sampling_date_future'
  | 'ambiguous_decimal'
  | 'low_confidence'
  | 'unit_ocr_corrected';

export interface CheckResult {
  code: CheckCode;
  severity: 'block' | 'warn';
  messageFr: string;
}

export interface DraftAssessment {
  parsedValue: number | null;
  comparator: '<' | '<=' | '>' | '>=' | null;
  analyteCode: string | null;
  /** Conclusion lue (sérologies). */
  qualitative: LabQualitative | null;
  refLow: number | null;
  refHigh: number | null;
  checks: CheckResult[];
  /** `block` : la ligne ne peut pas être confirmée telle quelle (correction requise). */
  status: 'ok' | 'warn' | 'block';
}

/** Parse un nombre au format français ou anglais : « 7,2 », « 1 250 », « 0.75 », « < 5 ». */
export function parseLabNumber(raw: string): { value: number; comparator: DraftAssessment['comparator'] } | null {
  const m = /^\s*(<=|>=|≤|≥|<|>)?\s*([0-9][0-9\s  ]*(?:[.,][0-9]+)?)\s*$/.exec(raw);
  if (!m) return null;
  const compRaw = m[1];
  const comparator =
    compRaw === '≤' ? '<=' : compRaw === '≥' ? '>=' : (compRaw as DraftAssessment['comparator']) ?? null;
  const digits = (m[2] ?? '').replace(/[\s  ]/g, '').replace(',', '.');
  const value = Number(digits);
  return Number.isFinite(value) ? { value, comparator } : null;
}

/** Extrait une référence « 30-300 », « (4,0 - 6,0) », « < 5 », « > 90 ». */
export function parseReference(raw: string | null | undefined): { low: number | null; high: number | null } | null {
  if (!raw) return null;
  const s = raw.replace(/[()[\]]/g, ' ').trim();
  const range = /^([0-9]+(?:[.,][0-9]+)?)\s*(?:-|–|à|a)\s*([0-9]+(?:[.,][0-9]+)?)/.exec(s);
  if (range) return { low: num(range[1]), high: num(range[2]) };
  const upper = /^(?:<|<=|≤|inf\.?\s*à?)\s*([0-9]+(?:[.,][0-9]+)?)/i.exec(s);
  if (upper) return { low: null, high: num(upper[1]) };
  const lower = /^(?:>|>=|≥|sup\.?\s*à?)\s*([0-9]+(?:[.,][0-9]+)?)/i.exec(s);
  if (lower) return { low: num(lower[1]), high: null };
  return null;
}

function num(s: string | undefined): number {
  return Number((s ?? '').replace(',', '.'));
}

/**
 * Anti-hallucination : la valeur brute doit figurer littéralement dans le texte
 * source (OCR ou couche texte du PDF), aux variations de séparateur près.
 */
export function valueAppearsInSource(rawValue: string, sourceText: string): boolean {
  const core = rawValue.replace(/^[<>≤≥=\s]+/, '').trim();
  if (!/^[0-9][0-9\s  ]*(?:[.,][0-9]+)?$/.test(core)) return false;
  // Motif : chiffres identiques, séparateur décimal « , » ou « . » indifférent,
  // espace de milliers optionnel (uniquement là où la valeur brute en avait un).
  const pattern = core
    .split('')
    .map((ch) => (/[0-9]/.test(ch) ? ch : /[.,]/.test(ch) ? '[.,]' : '[\\s\\u00a0\\u202f]?'))
    .join('');
  // Ne pas accepter « 7,2 » trouvé à l'intérieur de « 17,25 » ou « 7,2.1 ».
  return new RegExp(`(^|[^0-9.,])${pattern}(?![0-9]|[.,][0-9])`).test(sourceText);
}

export function assessDraft(draft: ExtractedDraft, sourceText: string, now: Date = new Date()): DraftAssessment {
  const checks: CheckResult[] = [];
  const analyte = (draft.analyteCode ? getAnalyte(draft.analyteCode) : undefined) ?? matchAnalyte(draft.rawLabel);
  // Sérologies : la conclusion seule (« Négatif ») suffit, à condition d'être écrite dans le document.
  const qualitative = analyte?.qualitative ? parseQualitative(draft.rawQualitative) : null;
  // Anti-hallucination : le libellé et la conclusion doivent figurer sur une même ligne du document.
  const label = foldSameLength(draft.rawLabel.trim());
  const word = foldSameLength(draft.rawQualitative?.trim() ?? '');
  if (qualitative && !sourceText.split('\n').some((l) => { const f = foldSameLength(l); return f.includes(label) && f.includes(word); })) {
    checks.push({ code: 'value_not_in_source', severity: 'block', messageFr: "Ce résultat n'a pas été retrouvé tel quel dans le document." });
  }
  const hasValue = draft.rawValue.trim() !== '';
  const parsed = hasValue ? parseLabNumber(draft.rawValue) : null;

  if (hasValue && !valueAppearsInSource(draft.rawValue, sourceText)) {
    checks.push({ code: 'value_not_in_source', severity: 'block', messageFr: "Cette valeur n'a pas été retrouvée telle quelle dans le document." });
  }
  if (!parsed && (hasValue || !qualitative)) {
    checks.push({ code: 'value_unparseable', severity: 'block', messageFr: "La valeur lue n'est pas un nombre exploitable." });
  }

  if (!analyte) {
    checks.push({ code: 'analyte_unmatched', severity: 'warn', messageFr: "L'analyse n'a pas été reconnue dans la bibliothèque : choisissez-la manuellement." });
  }

  const unit = draft.rawUnit?.trim() || null;
  if (!hasValue && qualitative) {
    /* conclusion seule : pas d'unité attendue */
  } else if (!unit) {
    checks.push({ code: 'unit_missing', severity: 'warn', messageFr: "Aucune unité n'a été lue pour cette valeur." });
  } else if (analyte && !isKnownUnit(analyte, unit)) {
    checks.push({ code: 'unit_unknown', severity: 'warn', messageFr: `Unité « ${unit} » inhabituelle pour ${analyte.nameFr} : vérifiez-la.` });
  }

  if (parsed && analyte && unit) {
    const canonical = toCanonical(analyte, parsed.value, unit);
    if (canonical !== null && (canonical < analyte.plausible.min || canonical > analyte.plausible.max)) {
      checks.push({ code: 'implausible_value', severity: 'block', messageFr: 'Valeur très improbable : vérifiez la virgule et la ligne lue.' });
    }
  }

  const ref = parseReference(draft.rawReference);
  if (ref && ref.low !== null && ref.high !== null && ref.low >= ref.high) {
    checks.push({ code: 'reference_inverted', severity: 'warn', messageFr: "L'intervalle de référence lu semble inversé." });
  }
  if (parsed && ref && ref.low !== null && ref.high !== null && ref.high > ref.low) {
    const width = ref.high - ref.low;
    if (parsed.value > ref.high + 10 * width || (ref.low > 0 && parsed.value < ref.low / 10)) {
      checks.push({ code: 'value_outside_reference_far', severity: 'warn', messageFr: "Valeur très éloignée de l'intervalle du laboratoire : possible erreur de lecture." });
    }
  }

  // Ambiguïté décimale : « 72 » pour une HbA1c (attendu ≈ 7,2) etc. couvert par plausibilité ;
  // ici on signale les nombres à 3 décimales exactement (séparateur de milliers anglais « 1.250 »).
  if (/^\s*[0-9]{1,3}[.,][0-9]{3}\s*$/.test(draft.rawValue)) {
    checks.push({ code: 'ambiguous_decimal', severity: 'warn', messageFr: 'Séparateur ambigu (décimale ou milliers ?) : vérifiez la valeur.' });
  }

  if (!draft.samplingDate) {
    checks.push({ code: 'sampling_date_missing', severity: 'warn', messageFr: 'Date de prélèvement non trouvée : renseignez-la.' });
  } else if (draft.samplingDate.getTime() > now.getTime() + 24 * 3_600_000) {
    checks.push({ code: 'sampling_date_future', severity: 'block', messageFr: 'La date de prélèvement lue est dans le futur.' });
  }

  const status = checks.some((c) => c.severity === 'block') ? 'block' : checks.length ? 'warn' : 'ok';
  return {
    parsedValue: parsed?.value ?? null,
    comparator: parsed?.comparator ?? null,
    analyteCode: analyte?.code ?? null,
    qualitative,
    refLow: ref?.low ?? null,
    refHigh: ref?.high ?? null,
    checks,
    status,
  };
}
