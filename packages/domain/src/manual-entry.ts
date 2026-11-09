/**
 * Validation d'un résultat d'analyse saisi à la main. Fonction pure, utilisable
 * côté serveur (contrôle faisant foi) et côté navigateur (aide à la saisie).
 */
import { getAnalyte, isKnownUnit, isLabQualitative, toCanonical, type Analyte, type LabQualitative } from './analytes';
import { parseLabNumber } from './extraction-checks';
import { normalizeUnit } from './units';

export interface ManualLabInput {
  analyteCode: string;
  value: string;
  unit: string;
  /** Date de prélèvement AAAA-MM-JJ (jour local). */
  sampledOn: string;
  laboratory?: string;
  refLow?: string;
  refHigh?: string;
  note?: string;
  /** Conclusion « positive » / « negative » / « equivocal » (analyses qualitatives uniquement). */
  qualitative?: string;
}

export interface ManualLabValid {
  analyte: Analyte;
  /** Null pour un résultat seulement qualitatif (ex. « Négatif » sans index). */
  value: number | null;
  comparator: '<' | '<=' | '>' | '>=' | null;
  /** Chaîne vide quand il n'y a pas de valeur chiffrée. */
  unit: string;
  qualitative: LabQualitative | null;
  valueCanonical: number | null;
  sampledOn: string;
  laboratory: string | null;
  refLow: number | null;
  refHigh: number | null;
  note: string | null;
}

export type ManualLabErrors = Partial<Record<keyof ManualLabInput, string>>;

/** Unités proposées pour une analyse : l'unité canonique puis les unités convertibles. */
export function unitsFor(analyte: Analyte): string[] {
  return [analyte.canonicalUnit, ...analyte.conversions.map((c) => c.unit)];
}

function optionalNumber(raw: string | undefined): number | null | 'invalid' {
  if (raw === undefined || raw.trim() === '') return null;
  const p = parseLabNumber(raw);
  return p && p.comparator === null ? p.value : 'invalid';
}

export function validateManualLab(
  input: ManualLabInput,
  today: string,
): { ok: true; value: ManualLabValid } | { ok: false; errors: ManualLabErrors } {
  const errors: ManualLabErrors = {};
  const analyte = getAnalyte(input.analyteCode);
  if (!analyte) errors.analyteCode = 'Choisissez une analyse dans la liste.';

  // Sérologies : la conclusion du laboratoire (positif / négatif / douteux) peut remplacer la valeur chiffrée.
  const qualitativeAllowed = !!analyte?.qualitative;
  const rawQual = input.qualitative?.trim() ?? '';
  let qualitative: LabQualitative | null = null;
  if (rawQual && qualitativeAllowed) {
    if (isLabQualitative(rawQual)) qualitative = rawQual;
    else errors.qualitative = 'Choisissez Positif, Négatif ou Douteux.';
  }
  const hasValue = input.value.trim() !== '';
  const valueOptional = qualitativeAllowed && (qualitative !== null || !!errors.qualitative);
  const parsed = hasValue || !valueOptional ? parseLabNumber(input.value) : null;
  if ((hasValue || !valueOptional) && !parsed)
    errors.value = qualitativeAllowed
      ? 'Saisissez un nombre (par exemple 0,25 ou < 5), ou choisissez seulement le résultat Positif / Négatif.'
      : 'Saisissez un nombre, par exemple 7,2 ou < 5.';

  const unit = parsed ? input.unit.trim() : '';
  if (!parsed) {
    /* pas de valeur chiffrée : pas d'unité */
  } else if (!unit) errors.unit = 'Choisissez l’unité indiquée sur le compte rendu.';
  else if (analyte && !isKnownUnit(analyte, unit))
    errors.unit = `Unité non reconnue pour ${analyte.nameFr}. Unités possibles : ${unitsFor(analyte).join(', ')}.`;

  let valueCanonical: number | null = null;
  if (analyte && parsed && unit && !errors.unit) {
    valueCanonical = toCanonical(analyte, parsed.value, unit);
    if (valueCanonical !== null && (valueCanonical < analyte.plausible.min || valueCanonical > analyte.plausible.max))
      errors.value = 'Valeur très improbable pour cette analyse : vérifiez la virgule et l’unité.';
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.sampledOn)) errors.sampledOn = 'Indiquez la date du prélèvement.';
  else if (input.sampledOn > today) errors.sampledOn = 'La date de prélèvement ne peut pas être dans le futur.';
  else if (input.sampledOn < '1950-01-01') errors.sampledOn = 'Date de prélèvement invalide.';
  else {
    const d = new Date(`${input.sampledOn}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== input.sampledOn) errors.sampledOn = 'Date de prélèvement invalide.';
  }

  const refLow = optionalNumber(input.refLow);
  const refHigh = optionalNumber(input.refHigh);
  if (refLow === 'invalid') errors.refLow = 'Nombre attendu.';
  if (refHigh === 'invalid') errors.refHigh = 'Nombre attendu.';
  if (typeof refLow === 'number' && typeof refHigh === 'number' && refLow >= refHigh)
    errors.refHigh = 'La borne haute doit être supérieure à la borne basse.';

  const laboratory = input.laboratory?.trim() || null;
  if (laboratory && laboratory.length > 120) errors.laboratory = '120 caractères maximum.';
  const note = input.note?.trim() || null;
  if (note && note.length > 500) errors.note = '500 caractères maximum.';

  if (Object.keys(errors).length || !analyte || (!parsed && !qualitative)) return { ok: false, errors };
  return {
    ok: true,
    value: {
      analyte,
      value: parsed?.value ?? null,
      comparator: parsed?.comparator ?? null,
      unit: !parsed ? '' : normalizeUnit(unit) === normalizeUnit(analyte.canonicalUnit) ? analyte.canonicalUnit : unit,
      qualitative,
      valueCanonical,
      sampledOn: input.sampledOn,
      laboratory,
      refLow: refLow as number | null,
      refHigh: refHigh as number | null,
      note,
    },
  };
}
