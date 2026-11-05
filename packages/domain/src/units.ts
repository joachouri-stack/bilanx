/**
 * Conversions d'unités.
 *
 * Règle : en cas de doute, ne pas convertir. Les fonctions renvoient `null`
 * lorsqu'une conversion n'est pas connue plutôt que de deviner.
 *
 * ⚠️ Les facteurs de conversion des analytes doivent être validés par un
 * biologiste avant mise en production (voir docs/03-base-de-donnees.md).
 */

/** g/L : unité usuelle des comptes rendus de laboratoire en France (1,20 g/L = 120 mg/dL). */
export type GlucoseUnit = 'mg/dL' | 'mmol/L' | 'g/L';
export type HbA1cUnit = '%' | 'mmol/mol';

/** Masse molaire du glucose ≈ 180,16 g/mol → 1 mmol/L = 18,016 mg/dL. */
export const GLUCOSE_MGDL_PER_MMOLL = 18.016;

export function mgdlToMmoll(mgdl: number): number {
  return mgdl / GLUCOSE_MGDL_PER_MMOLL;
}

export function mmollToMgdl(mmoll: number): number {
  return mmoll * GLUCOSE_MGDL_PER_MMOLL;
}

export const GLUCOSE_UNITS: Record<GlucoseUnit, string> = {
  'mg/dL': 'mg/dL (ex. 120)',
  'g/L': 'g/L (ex. 1,20)',
  'mmol/L': 'mmol/L (ex. 6,7)',
};
export const HBA1C_UNITS: Record<HbA1cUnit, string> = {
  '%': '% (ex. 7,2 %)',
  'mmol/mol': 'mmol/mol (ex. 55)',
};

export function isGlucoseUnit(u: unknown): u is GlucoseUnit {
  return u === 'mg/dL' || u === 'mmol/L' || u === 'g/L';
}

/** Convertit une glycémie stockée en mg/dL (unité canonique) vers l'unité d'affichage. */
export function glucoseForDisplay(mgdl: number, unit: GlucoseUnit): number {
  if (unit === 'mg/dL') return Math.round(mgdl);
  if (unit === 'g/L') return roundTo(mgdl / 100, 2);
  return roundTo(mgdlToMmoll(mgdl), 1);
}

/** Glycémie formatée à la française (virgule décimale), sans l'unité : « 1,20 », « 6,7 », « 120 ». */
export function formatGlucose(mgdl: number, unit: GlucoseUnit): string {
  const v = glucoseForDisplay(mgdl, unit);
  return unit === 'g/L' ? v.toFixed(2).replace('.', ',') : unit === 'mmol/L' ? v.toFixed(1).replace('.', ',') : String(v);
}

/** Graduations de l'axe des glycémies (valeurs en mg/dL, libellés dans l'unité choisie). */
export function glucoseAxisTicks(unit: GlucoseUnit): { mgdl: number; label: string }[] {
  const mgdl = unit === 'mmol/L' ? [3, 3.9, 5.5, 7.8, 10, 13.9].map(mmollToMgdl) : [54, 70, 100, 140, 180, 250, 300];
  return mgdl.map((v) => ({ mgdl: v, label: unit === 'mmol/L' ? String(roundTo(mgdlToMmoll(v), 1)).replace('.', ',') : formatGlucose(v, unit) }));
}

/**
 * HbA1c : équation maîtresse IFCC ↔ NGSP.
 * IFCC (mmol/mol) = (NGSP % − 2,15) × 10,929
 */
export function hba1cPercentToMmolMol(percent: number): number {
  return (percent - 2.15) * 10.929;
}

export function hba1cMmolMolToPercent(mmolMol: number): number {
  return mmolMol / 10.929 + 2.15;
}

export function hba1cForDisplay(value: number, from: HbA1cUnit, to: HbA1cUnit): number {
  if (from === to) return from === '%' ? roundTo(value, 1) : Math.round(value);
  return to === 'mmol/mol'
    ? Math.round(hba1cPercentToMmolMol(value))
    : roundTo(hba1cMmolMolToPercent(value), 1);
}

export function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** Normalisation d'écriture d'unité (µ/u, majuscules, espaces) pour la comparaison. */
export function normalizeUnit(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, '')
    .replace(/μ/g, 'µ') // mu grec → micro
    .replace(/^u(?=[gmlLU])/i, 'µ')
    .replace(/mcg/gi, 'µg')
    .replace(/\/l$/i, '/L')
    .replace(/\/dl$/i, '/dL')
    .replace(/\/ml$/i, '/mL')
    .replace(/^ui\//i, 'UI/')
    .replace(/^mui\//i, 'mUI/');
}

/** Formatage français (virgule décimale, espace fine pour les milliers). */
export function formatNumberFr(value: number, maxDecimals = 2): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: maxDecimals }).format(value);
}

/** HbA1c (stockée en %) : valeur principale dans l'unité choisie, l'autre en complément. */
export function formatHba1c(percent: number, unit: HbA1cUnit): { value: string; unit: string; other: string } {
  const pct = roundTo(percent, 1).toFixed(1).replace('.', ',');
  const mmol = String(Math.round(hba1cPercentToMmolMol(percent)));
  return unit === 'mmol/mol' ? { value: mmol, unit: 'mmol/mol', other: `${pct} %` } : { value: pct, unit: '%', other: `${mmol} mmol/mol` };
}
