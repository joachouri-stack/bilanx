/**
 * Conversions d'unités.
 *
 * Règle : en cas de doute, ne pas convertir. Les fonctions renvoient `null`
 * lorsqu'une conversion n'est pas connue plutôt que de deviner.
 *
 * ⚠️ Les facteurs de conversion des analytes doivent être validés par un
 * biologiste avant mise en production (voir docs/03-base-de-donnees.md).
 */

export type GlucoseUnit = 'mg/dL' | 'mmol/L';
export type HbA1cUnit = '%' | 'mmol/mol';

/** Masse molaire du glucose ≈ 180,16 g/mol → 1 mmol/L = 18,016 mg/dL. */
export const GLUCOSE_MGDL_PER_MMOLL = 18.016;

export function mgdlToMmoll(mgdl: number): number {
  return mgdl / GLUCOSE_MGDL_PER_MMOLL;
}

export function mmollToMgdl(mmoll: number): number {
  return mmoll * GLUCOSE_MGDL_PER_MMOLL;
}

/** Convertit une glycémie stockée en mg/dL (unité canonique) vers l'unité d'affichage. */
export function glucoseForDisplay(mgdl: number, unit: GlucoseUnit): number {
  return unit === 'mg/dL' ? Math.round(mgdl) : roundTo(mgdlToMmoll(mgdl), 1);
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
