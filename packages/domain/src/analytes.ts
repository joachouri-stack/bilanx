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
  | 'inflammation'
  | 'liver'
  | 'proteins'
  | 'serology';

/**
 * Libellés des familles d'analyses, dans l'ordre d'affichage de la page « Analyses »
 * (l'HbA1c a sa propre rubrique ; la glycémie à jeun reste rangée sous « Diabète »).
 */
export const ANALYTE_CATEGORY_LABELS: Record<AnalyteCategory, string> = {
  vitamins: 'Vitamines',
  minerals: 'Minéraux',
  iron: 'Fer',
  serology: 'Virus & sérologies',
  hematology: 'Hématologie (NFS)',
  electrolytes: 'Ionogramme',
  kidney: 'Fonction rénale',
  liver: 'Foie',
  lipids: 'Lipides',
  thyroid: 'Thyroïde',
  hormones: 'Hormones',
  inflammation: 'Inflammation',
  proteins: 'Protéines',
  diabetes: 'Diabète',
};

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
  { code: 'leukocytes', nameFr: 'Leucocytes', synonyms: ['leucocytes', 'globules blancs', 'gb', 'leucocyte'], category: 'hematology', canonicalUnit: 'G/L', conversions: [{ unit: '/mm3', factor: 0.001 }, { unit: '10*9/L', factor: 1 }, { unit: 'giga/L', factor: 1 }, { unit: '10^9/L', factor: 1 }], plausible: { min: 0.1, max: 500 } },
  { code: 'erythrocytes', nameFr: 'Hématies', synonyms: ['hématies', 'hematies', 'globules rouges', 'gr', 'érythrocytes', 'erythrocytes'], category: 'hematology', canonicalUnit: 'T/L', conversions: [{ unit: '10*12/L', factor: 1 }, { unit: '10^12/L', factor: 1 }, { unit: 'tera/L', factor: 1 }, { unit: 'M/mm3', factor: 1 }, { unit: '/mm3', factor: 1e-06 }], plausible: { min: 0.5, max: 10 } },
  { code: 'hematocrit', nameFr: 'Hématocrite', synonyms: ['hématocrite', 'hematocrite', 'ht'], category: 'hematology', canonicalUnit: '%', conversions: [{ unit: 'L/L', factor: 100 }], plausible: { min: 5, max: 80 } },
  { code: 'mcv', nameFr: 'VGM', synonyms: ['vgm', 'v.g.m', 'v.g.m.', 'volume globulaire moyen'], category: 'hematology', canonicalUnit: 'fL', conversions: [{ unit: 'µ3', factor: 1 }, { unit: 'fl', factor: 1 }], plausible: { min: 40, max: 150 } },
  { code: 'mch', nameFr: 'TCMH', synonyms: ['tcmh', 't.c.m.h', 't.c.m.h.', 'teneur corpusculaire moyenne en hémoglobine', 'tgmh'], category: 'hematology', canonicalUnit: 'pg', conversions: [], plausible: { min: 10, max: 60 } },
  { code: 'mchc', nameFr: 'CCMH', synonyms: ['ccmh', 'c.c.m.h', 'c.c.m.h.', 'concentration corpusculaire moyenne en hémoglobine'], category: 'hematology', canonicalUnit: 'g/dL', conversions: [{ unit: 'g/L', factor: 0.1 }, { unit: '%', factor: 1 }], plausible: { min: 20, max: 45 } },
  { code: 'platelets', nameFr: 'Plaquettes', synonyms: ['plaquettes', 'thrombocytes', 'numération plaquettaire'], category: 'hematology', canonicalUnit: 'G/L', conversions: [{ unit: '/mm3', factor: 0.001 }, { unit: '10*9/L', factor: 1 }, { unit: 'giga/L', factor: 1 }, { unit: '10^9/L', factor: 1 }], plausible: { min: 1, max: 2000 } },
  { code: 'neutrophils', nameFr: 'Polynucléaires neutrophiles', synonyms: ['polynucléaires neutrophiles', 'polynucleaires neutrophiles', 'neutrophiles', 'pnn'], category: 'hematology', canonicalUnit: 'G/L', conversions: [{ unit: '/mm3', factor: 0.001 }, { unit: '10*9/L', factor: 1 }, { unit: 'giga/L', factor: 1 }], plausible: { min: 0, max: 100 } },
  { code: 'lymphocytes', nameFr: 'Lymphocytes', synonyms: ['lymphocytes'], category: 'hematology', canonicalUnit: 'G/L', conversions: [{ unit: '/mm3', factor: 0.001 }, { unit: '10*9/L', factor: 1 }, { unit: 'giga/L', factor: 1 }], plausible: { min: 0, max: 100 } },
  { code: 'monocytes', nameFr: 'Monocytes', synonyms: ['monocytes'], category: 'hematology', canonicalUnit: 'G/L', conversions: [{ unit: '/mm3', factor: 0.001 }, { unit: '10*9/L', factor: 1 }, { unit: 'giga/L', factor: 1 }], plausible: { min: 0, max: 50 } },
  { code: 'eosinophils', nameFr: 'Polynucléaires éosinophiles', synonyms: ['polynucléaires éosinophiles', 'polynucleaires eosinophiles', 'éosinophiles', 'eosinophiles'], category: 'hematology', canonicalUnit: 'G/L', conversions: [{ unit: '/mm3', factor: 0.001 }, { unit: '10*9/L', factor: 1 }, { unit: 'giga/L', factor: 1 }], plausible: { min: 0, max: 50 } },
  { code: 'basophils', nameFr: 'Polynucléaires basophiles', synonyms: ['polynucléaires basophiles', 'polynucleaires basophiles', 'basophiles'], category: 'hematology', canonicalUnit: 'G/L', conversions: [{ unit: '/mm3', factor: 0.001 }, { unit: '10*9/L', factor: 1 }, { unit: 'giga/L', factor: 1 }], plausible: { min: 0, max: 20 } },
  { code: 'urea', nameFr: 'Urée', synonyms: ['urée', 'uree', 'urémie', 'uremie', 'urée sanguine'], category: 'kidney', canonicalUnit: 'mmol/L', conversions: [{ unit: 'g/L', factor: 16.65 }, { unit: 'mg/dL', factor: 0.1665 }], plausible: { min: 0.5, max: 80 } },
  { code: 'uric_acid', nameFr: 'Acide urique', synonyms: ['acide urique', 'uricémie', 'uricemie'], category: 'kidney', canonicalUnit: 'µmol/L', conversions: [{ unit: 'mg/L', factor: 5.948 }, { unit: 'mg/dL', factor: 59.48 }], plausible: { min: 30, max: 1500 } },
  { code: 'ast', nameFr: 'ASAT (TGO)', synonyms: ['asat', 'tgo', 'aspartate aminotransférase', 'transaminases asat', 'sgot'], category: 'liver', canonicalUnit: 'UI/L', conversions: [{ unit: 'U/L', factor: 1 }], plausible: { min: 1, max: 10000 } },
  { code: 'alt', nameFr: 'ALAT (TGP)', synonyms: ['alat', 'tgp', 'alanine aminotransférase', 'transaminases alat', 'sgpt'], category: 'liver', canonicalUnit: 'UI/L', conversions: [{ unit: 'U/L', factor: 1 }], plausible: { min: 1, max: 10000 } },
  { code: 'ggt', nameFr: 'Gamma-GT', synonyms: ['gamma gt', 'gamma-gt', 'ggt', 'gamma glutamyl transférase', 'γgt'], category: 'liver', canonicalUnit: 'UI/L', conversions: [{ unit: 'U/L', factor: 1 }], plausible: { min: 1, max: 10000 } },
  { code: 'alp', nameFr: 'Phosphatases alcalines', synonyms: ['phosphatases alcalines', 'pal'], category: 'liver', canonicalUnit: 'UI/L', conversions: [{ unit: 'U/L', factor: 1 }], plausible: { min: 5, max: 5000 } },
  { code: 'bilirubin_total', nameFr: 'Bilirubine totale', synonyms: ['bilirubine totale', 'bilirubine'], category: 'liver', canonicalUnit: 'µmol/L', conversions: [{ unit: 'mg/L', factor: 1.71 }, { unit: 'mg/dL', factor: 17.1 }], plausible: { min: 1, max: 1000 } },
  { code: 'albumin', nameFr: 'Albumine', synonyms: ['albumine', 'albuminémie', 'albuminemie'], category: 'proteins', canonicalUnit: 'g/L', conversions: [{ unit: 'g/dL', factor: 10 }], plausible: { min: 5, max: 70 } },
  { code: 'protein_total', nameFr: 'Protides totaux', synonyms: ['protides totaux', 'protéines totales', 'proteines totales', 'protidémie', 'protidemie'], category: 'proteins', canonicalUnit: 'g/L', conversions: [{ unit: 'g/dL', factor: 10 }], plausible: { min: 20, max: 140 } },
  { code: 'chloride', nameFr: 'Chlore', synonyms: ['chlore', 'chlorémie', 'chloremie', 'chlorures'], category: 'electrolytes', canonicalUnit: 'mmol/L', conversions: [], plausible: { min: 60, max: 150 } },
  { code: 'phosphorus', nameFr: 'Phosphore', synonyms: ['phosphore', 'phosphorémie', 'phosphoremie', 'phosphates'], category: 'minerals', canonicalUnit: 'mmol/L', conversions: [{ unit: 'mg/L', factor: 0.0323 }], plausible: { min: 0.1, max: 5 } },
  // Virus & sérologies : résultats chiffrés (index, titre d'anticorps, charge virale).
  { code: 'anti_hbs', nameFr: 'Anticorps anti-HBs (hépatite B)', synonyms: ['anticorps anti-hbs', 'ac anti-hbs', 'ac anti hbs', 'anti-hbs', 'anticorps anti hbs'], category: 'serology', canonicalUnit: 'mUI/mL', conversions: [{ unit: 'UI/L', factor: 1 }], plausible: { min: 0, max: 100000 } },
  { code: 'hbs_ag', nameFr: 'Antigène HBs (hépatite B)', synonyms: ['antigène hbs', 'antigene hbs', 'ag hbs', 'aghbs', 'ag hbs quantitatif'], category: 'serology', canonicalUnit: 'index', conversions: [{ unit: 'S/CO', factor: 1 }, { unit: 'COI', factor: 1 }], plausible: { min: 0, max: 100000 } },
  { code: 'anti_hbc', nameFr: 'Anticorps anti-HBc (hépatite B)', synonyms: ['anticorps anti-hbc', 'ac anti-hbc', 'ac anti hbc', 'anti-hbc', 'anticorps anti hbc totaux', 'ac anti-hbc totaux'], category: 'serology', canonicalUnit: 'index', conversions: [{ unit: 'S/CO', factor: 1 }, { unit: 'COI', factor: 1 }], plausible: { min: 0, max: 1000 } },
  { code: 'hcv_ab', nameFr: 'Anticorps anti-VHC (hépatite C)', synonyms: ['anticorps anti-vhc', 'ac anti-vhc', 'ac anti vhc', 'anti-vhc', 'sérologie hépatite c', 'serologie hepatite c', 'anti-hcv'], category: 'serology', canonicalUnit: 'index', conversions: [{ unit: 'S/CO', factor: 1 }, { unit: 'COI', factor: 1 }], plausible: { min: 0, max: 1000 } },
  { code: 'hav_igg', nameFr: 'Anticorps anti-VHA IgG (hépatite A)', synonyms: ['anticorps anti-vha igg', 'ac anti-vha igg', 'anti-vha igg'], category: 'serology', canonicalUnit: 'index', conversions: [{ unit: 'S/CO', factor: 1 }, { unit: 'COI', factor: 1 }], plausible: { min: 0, max: 1000 } },
  { code: 'hiv_ag_ab', nameFr: 'VIH 1+2 (antigène p24 et anticorps)', synonyms: ['vih 1+2', 'vih1+2', 'sérologie vih', 'serologie vih', 'ag p24 et ac anti-vih', 'ac anti-vih 1 et 2', 'dépistage vih', 'depistage vih', 'hiv 1+2'], category: 'serology', canonicalUnit: 'index', conversions: [{ unit: 'S/CO', factor: 1 }, { unit: 'COI', factor: 1 }], plausible: { min: 0, max: 1000 } },
  { code: 'cmv_igg', nameFr: 'Cytomégalovirus (CMV) IgG', synonyms: ['cmv igg', 'cytomégalovirus igg', 'cytomegalovirus igg', 'ac anti-cmv igg', 'anticorps anti-cmv igg'], category: 'serology', canonicalUnit: 'UA/mL', conversions: [{ unit: 'U/mL', factor: 1 }], plausible: { min: 0, max: 10000 } },
  { code: 'ebv_vca_igg', nameFr: 'Epstein-Barr (EBV) VCA IgG', synonyms: ['ebv vca igg', 'vca igg', 'ac anti-vca igg', 'epstein-barr vca igg', 'epstein barr vca igg'], category: 'serology', canonicalUnit: 'U/mL', conversions: [{ unit: 'UA/mL', factor: 1 }], plausible: { min: 0, max: 10000 } },
  { code: 'rubella_igg', nameFr: 'Rubéole IgG', synonyms: ['rubéole igg', 'rubeole igg', 'ac anti-rubéole igg', 'anticorps anti-rubéole igg'], category: 'serology', canonicalUnit: 'UI/mL', conversions: [], plausible: { min: 0, max: 10000 } },
  { code: 'toxo_igg', nameFr: 'Toxoplasmose IgG', synonyms: ['toxoplasmose igg', 'toxoplasma igg', 'ac anti-toxoplasme igg', 'anticorps anti-toxoplasme igg'], category: 'serology', canonicalUnit: 'UI/mL', conversions: [], plausible: { min: 0, max: 10000 } },
  { code: 'vzv_igg', nameFr: 'Varicelle-zona (VZV) IgG', synonyms: ['vzv igg', 'varicelle igg', 'varicelle-zona igg', 'ac anti-vzv igg'], category: 'serology', canonicalUnit: 'mUI/mL', conversions: [{ unit: 'UI/L', factor: 1 }], plausible: { min: 0, max: 100000 } },
  { code: 'hcv_viral_load', nameFr: 'Charge virale VHC', synonyms: ['charge virale vhc', 'arn vhc', 'arn du vhc', 'hcv rna'], category: 'serology', canonicalUnit: 'UI/mL', conversions: [], plausible: { min: 0, max: 1e9 } },
  { code: 'hiv_viral_load', nameFr: 'Charge virale VIH', synonyms: ['charge virale vih', 'arn vih', 'arn vih-1', 'arn du vih', 'hiv rna'], category: 'serology', canonicalUnit: 'copies/mL', conversions: [], plausible: { min: 0, max: 1e9 } },
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
