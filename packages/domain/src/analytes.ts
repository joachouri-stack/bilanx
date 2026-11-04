/**
 * Catalogue initial des paramètres biologiques.
 *
 * - `canonicalUnit` : unité de stockage normalisée.
 * - `conversions` : valeur_canonique = valeur × factor (unité source → canonique).
 * - `plausible` : bornes physiologiques larges servant UNIQUEMENT à détecter des
 *   erreurs de lecture (virgule mal placée, mauvaise ligne). Ce ne sont pas des
 *   valeurs de référence et elles ne doivent jamais être affichées comme telles.
 *
 * ⚠️ À faire valider par un biologiste avant mise en production.
 */
import { normalizeUnit } from './units';

export type AnalyteCategory =
  | 'diabetes'
  | 'iron'
  | 'hematology'
  | 'vitamins'
  | 'minerals'
  | 'electrolytes'
  | 'kidney'
  | 'lipids'
  | 'thyroid'
  | 'hormones'
  | 'inflammation';

export interface Analyte {
  code: string;
  nameFr: string;
  synonyms: string[];
  category: AnalyteCategory;
  canonicalUnit: string;
  conversions: { unit: string; factor: number }[];
  plausible: { min: number; max: number };
}

export const ANALYTES: readonly Analyte[] = [
  { code: 'hba1c', nameFr: 'HbA1c', synonyms: ['hémoglobine glyquée', 'hemoglobine glyquee', 'hba1c', 'a1c', 'hémoglobine a1c'], category: 'diabetes', canonicalUnit: '%', conversions: [], plausible: { min: 3, max: 20 } },
  { code: 'glucose_fasting', nameFr: 'Glycémie à jeun', synonyms: ['glycémie à jeun', 'glycemie a jeun', 'glucose', 'glycémie'], category: 'diabetes', canonicalUnit: 'g/L', conversions: [{ unit: 'mmol/L', factor: 0.18016 }, { unit: 'mg/dL', factor: 0.01 }], plausible: { min: 0.2, max: 7 } },
  { code: 'ferritin', nameFr: 'Ferritine', synonyms: ['ferritine', 'ferritinémie', 'ferritinemie', 'ferritine sérique'], category: 'iron', canonicalUnit: 'µg/L', conversions: [{ unit: 'ng/mL', factor: 1 }], plausible: { min: 0.5, max: 100000 } },
  { code: 'iron_serum', nameFr: 'Fer sérique', synonyms: ['fer sérique', 'fer serique', 'sidérémie', 'fer'], category: 'iron', canonicalUnit: 'µmol/L', conversions: [{ unit: 'µg/dL', factor: 0.179 }], plausible: { min: 0.5, max: 150 } },
  { code: 'hemoglobin', nameFr: 'Hémoglobine', synonyms: ['hémoglobine', 'hemoglobine', 'hb'], category: 'hematology', canonicalUnit: 'g/dL', conversions: [{ unit: 'g/L', factor: 0.1 }], plausible: { min: 2, max: 25 } },
  { code: 'vitamin_d_25oh', nameFr: 'Vitamine D (25-OH)', synonyms: ['vitamine d', '25-oh vitamine d', '25 oh vitamine d', '25-hydroxyvitamine d', '25(oh)d', 'vitamine d totale'], category: 'vitamins', canonicalUnit: 'ng/mL', conversions: [{ unit: 'nmol/L', factor: 0.4006 }], plausible: { min: 1, max: 300 } },
  { code: 'vitamin_b12', nameFr: 'Vitamine B12', synonyms: ['vitamine b12', 'cobalamine', 'b12'], category: 'vitamins', canonicalUnit: 'pmol/L', conversions: [{ unit: 'pg/mL', factor: 0.738 }, { unit: 'ng/L', factor: 0.738 }], plausible: { min: 20, max: 5000 } },
  { code: 'folate', nameFr: 'Folates', synonyms: ['folates', 'acide folique', 'vitamine b9', 'folates sériques'], category: 'vitamins', canonicalUnit: 'ng/mL', conversions: [{ unit: 'nmol/L', factor: 0.441 }, { unit: 'µg/L', factor: 1 }], plausible: { min: 0.3, max: 100 } },
  { code: 'magnesium', nameFr: 'Magnésium', synonyms: ['magnésium', 'magnesium', 'magnésémie', 'mg sérique'], category: 'minerals', canonicalUnit: 'mmol/L', conversions: [{ unit: 'mg/L', factor: 0.0411 }], plausible: { min: 0.2, max: 4 } },
  { code: 'calcium', nameFr: 'Calcium', synonyms: ['calcium', 'calcémie', 'calcemie'], category: 'minerals', canonicalUnit: 'mmol/L', conversions: [{ unit: 'mg/L', factor: 0.02495 }], plausible: { min: 1, max: 5 } },
  { code: 'zinc', nameFr: 'Zinc', synonyms: ['zinc', 'zincémie'], category: 'minerals', canonicalUnit: 'µmol/L', conversions: [{ unit: 'µg/dL', factor: 0.153 }], plausible: { min: 2, max: 60 } },
  { code: 'potassium', nameFr: 'Potassium', synonyms: ['potassium', 'kaliémie', 'kaliemie', 'k+'], category: 'electrolytes', canonicalUnit: 'mmol/L', conversions: [], plausible: { min: 1, max: 10 } },
  { code: 'sodium', nameFr: 'Sodium', synonyms: ['sodium', 'natrémie', 'natremie', 'na+'], category: 'electrolytes', canonicalUnit: 'mmol/L', conversions: [], plausible: { min: 100, max: 180 } },
  { code: 'creatinine', nameFr: 'Créatinine', synonyms: ['créatinine', 'creatinine', 'créatininémie'], category: 'kidney', canonicalUnit: 'µmol/L', conversions: [{ unit: 'mg/L', factor: 8.84 }], plausible: { min: 5, max: 2000 } },
  { code: 'egfr', nameFr: 'DFG estimé', synonyms: ['dfg', 'débit de filtration glomérulaire', 'ckd-epi', 'dfg estimé'], category: 'kidney', canonicalUnit: 'mL/min/1,73m²', conversions: [], plausible: { min: 1, max: 200 } },
  { code: 'cholesterol_total', nameFr: 'Cholestérol total', synonyms: ['cholestérol total', 'cholesterol total'], category: 'lipids', canonicalUnit: 'g/L', conversions: [{ unit: 'mmol/L', factor: 0.3867 }], plausible: { min: 0.5, max: 10 } },
  { code: 'ldl', nameFr: 'Cholestérol LDL', synonyms: ['ldl', 'ldl-cholestérol', 'cholestérol ldl', 'ldl calculé'], category: 'lipids', canonicalUnit: 'g/L', conversions: [{ unit: 'mmol/L', factor: 0.3867 }], plausible: { min: 0.1, max: 8 } },
  { code: 'hdl', nameFr: 'Cholestérol HDL', synonyms: ['hdl', 'hdl-cholestérol', 'cholestérol hdl'], category: 'lipids', canonicalUnit: 'g/L', conversions: [{ unit: 'mmol/L', factor: 0.3867 }], plausible: { min: 0.05, max: 3 } },
  { code: 'triglycerides', nameFr: 'Triglycérides', synonyms: ['triglycérides', 'triglycerides', 'tg'], category: 'lipids', canonicalUnit: 'g/L', conversions: [{ unit: 'mmol/L', factor: 0.8857 }], plausible: { min: 0.1, max: 50 } },
  { code: 'tsh', nameFr: 'TSH', synonyms: ['tsh', 'thyréostimuline', 'tsh us'], category: 'thyroid', canonicalUnit: 'mUI/L', conversions: [{ unit: 'µUI/mL', factor: 1 }], plausible: { min: 0.001, max: 500 } },
  { code: 'testosterone_total', nameFr: 'Testostérone totale', synonyms: ['testostérone', 'testosterone', 'testostérone totale'], category: 'hormones', canonicalUnit: 'nmol/L', conversions: [{ unit: 'ng/mL', factor: 3.467 }], plausible: { min: 0.05, max: 100 } },
  { code: 'crp', nameFr: 'CRP', synonyms: ['crp', 'protéine c réactive', 'proteine c reactive', 'crp us'], category: 'inflammation', canonicalUnit: 'mg/L', conversions: [], plausible: { min: 0, max: 600 } },
];

const BY_CODE = new Map(ANALYTES.map((a) => [a.code, a]));

export function getAnalyte(code: string): Analyte | undefined {
  return BY_CODE.get(code);
}

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9()+-]+/g, ' ')
    .trim();
}

/**
 * Associe un libellé brut de laboratoire à un analyte du catalogue.
 * Renvoie `undefined` si aucune correspondance exacte de synonyme n'est trouvée :
 * l'utilisateur choisira alors manuellement (pas de rapprochement « approximatif »).
 */
export function matchAnalyte(rawLabel: string): Analyte | undefined {
  const label = fold(rawLabel);
  let best: { analyte: Analyte; len: number } | undefined;
  for (const a of ANALYTES) {
    for (const syn of a.synonyms) {
      const s = fold(syn);
      const re = new RegExp(`(^|\\s)${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`);
      if (re.test(label) && (!best || s.length > best.len)) best = { analyte: a, len: s.length };
    }
  }
  return best?.analyte;
}

/**
 * Convertit vers l'unité canonique. Renvoie `null` si l'unité n'est pas reconnue
 * (on conserve alors la valeur et l'unité du laboratoire sans conversion).
 */
export function toCanonical(analyte: Analyte, value: number, unit: string): number | null {
  const u = normalizeUnit(unit);
  if (u === normalizeUnit(analyte.canonicalUnit)) return value;
  const conv = analyte.conversions.find((c) => normalizeUnit(c.unit) === u);
  return conv ? value * conv.factor : null;
}

export function isKnownUnit(analyte: Analyte, unit: string): boolean {
  return toCanonical(analyte, 1, unit) !== null;
}
