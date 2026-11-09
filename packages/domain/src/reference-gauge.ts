/**
 * Position d'un résultat biologique par rapport à l'intervalle de référence
 * DU LABORATOIRE, pour la jauge « capsule ».
 *
 * L'intervalle [réf. basse, réf. haute] occupe toujours la zone [0,30 ; 0,70]
 * de la hauteur. Au-delà, l'échelle reste linéaire puis est plafonnée.
 * La jauge indique une POSITION, jamais un « taux de remplissage ».
 */

export type ReferenceStatus = 'below' | 'within' | 'above' | 'unknown';

export interface ReferenceRange {
  low?: number | null;
  high?: number | null;
}

export const GAUGE_RANGE_LOW = 0.3;
export const GAUGE_RANGE_HIGH = 0.7;
export const GAUGE_MIN = 0.03;
export const GAUGE_MAX = 0.97;

export interface GaugePosition {
  /** Position verticale normalisée [0, 1] (0 = bas de la capsule). */
  position: number;
  status: ReferenceStatus;
  /** Vrai si la valeur dépasse l'échelle affichable (position plafonnée). */
  clamped: boolean;
  /** Vrai si l'intervalle est incomplet (une seule borne) : la jauge est indicative. */
  partialRange: boolean;
}

export function referenceStatus(value: number, range: ReferenceRange): ReferenceStatus {
  const { low, high } = range;
  if (low == null && high == null) return 'unknown';
  if (low != null && value < low) return 'below';
  if (high != null && value > high) return 'above';
  return 'within';
}

export function gaugePosition(value: number, range: ReferenceRange): GaugePosition | null {
  const { low, high } = range;
  const status = referenceStatus(value, range);
  if (status === 'unknown') return null;

  let raw: number;
  let partialRange = false;
  if (low != null && high != null) {
    if (!(high > low)) return null; // intervalle incohérent : pas de jauge
    raw = GAUGE_RANGE_LOW + ((value - low) / (high - low)) * (GAUGE_RANGE_HIGH - GAUGE_RANGE_LOW);
  } else if (high != null) {
    // Seule une borne haute (ex. CRP < 5) : 0 → borne haute occupe [0 ; 0,70].
    partialRange = true;
    raw = high > 0 ? (value / high) * GAUGE_RANGE_HIGH : GAUGE_RANGE_HIGH;
  } else {
    // Seule une borne basse (ex. DFG > 90) : borne basse à 0,30, puis même pente relative.
    partialRange = true;
    const l = low as number;
    raw = l > 0 ? GAUGE_RANGE_LOW * (value / l) : GAUGE_RANGE_LOW;
  }
  const position = Math.min(GAUGE_MAX, Math.max(GAUGE_MIN, raw));
  return { position, status, clamped: position !== raw, partialRange };
}

export const STATUS_LABEL_FR: Record<ReferenceStatus, string> = {
  below: "sous l'intervalle de référence du laboratoire",
  within: "dans l'intervalle de référence du laboratoire",
  above: "au-dessus de l'intervalle de référence du laboratoire",
  unknown: 'intervalle de référence non renseigné',
};

/**
 * Niveau d'un résultat en trois couleurs, d'après les valeurs de référence DU LABORATOIRE :
 * - « good » : dans l'intervalle, à distance des bornes ;
 * - « fair » : dans l'intervalle mais près d'une borne (moins de 10 % de sa largeur), ou juste en dehors
 *   (jusqu'à 25 % de la largeur ; 10 à 25 % de la borne pour un intervalle à une seule borne) ;
 * - « poor » : nettement en dehors.
 * Indicatif : l'interprétation revient au médecin.
 */
export type LabLevel = 'good' | 'fair' | 'poor' | 'unknown';

export const LAB_LEVEL_LABEL_FR: Record<LabLevel, string> = {
  good: 'Bon',
  fair: 'Moyen',
  poor: 'À revoir',
  unknown: 'Sans référence',
};

export function labLevel(value: number, range: ReferenceRange): LabLevel {
  const { low, high } = range;
  if (low != null && high != null) {
    if (!(high > low)) return 'unknown';
    const w = high - low;
    if (value >= low && value <= high) return Math.min(value - low, high - value) / w < 0.1 ? 'fair' : 'good';
    const out = (value < low ? low - value : value - high) / w;
    return out <= 0.25 ? 'fair' : 'poor';
  }
  if (high != null) {
    if (value <= high) return high > 0 && value > high * 0.9 ? 'fair' : 'good';
    return high > 0 && value <= high * 1.25 ? 'fair' : 'poor';
  }
  if (low != null) {
    if (value >= low) return value < low * 1.1 ? 'fair' : 'good';
    return value >= low * 0.75 ? 'fair' : 'poor';
  }
  return 'unknown';
}

/**
 * Comparaison de deux résultats (même unité) : l'évolution rapproche-t-elle de l'intervalle de référence ?
 * Distance = écart à l'intervalle (0 si dedans) ; dans l'intervalle, écart au milieu (bornes complètes).
 * « stable » si la variation est inférieure à 3 % de la largeur de l'intervalle (ou de la valeur précédente).
 */
export type LabTrend = 'better' | 'worse' | 'stable';

export function labTrend(previous: number, current: number, range: ReferenceRange): LabTrend {
  const { low, high } = range;
  const scale = low != null && high != null && high > low ? high - low : Math.abs(previous) || 1;
  if (Math.abs(current - previous) < 0.03 * scale) return 'stable';
  const dist = (v: number) => {
    if (low != null && v < low) return scale + (low - v);
    if (high != null && v > high) return scale + (v - high);
    if (low != null && high != null) return Math.abs(v - (low + high) / 2);
    return 0;
  };
  const d0 = dist(previous);
  const d1 = dist(current);
  if (Math.abs(d1 - d0) < 0.03 * scale) return 'stable';
  return d1 < d0 ? 'better' : 'worse';
}
