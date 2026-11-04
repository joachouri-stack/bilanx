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
