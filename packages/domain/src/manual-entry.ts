/**
 * Validation d'un résultat d'analyse saisi à la main. Fonction pure, utilisable
 * côté serveur (contrôle faisant foi) et côté navigateur (aide à la saisie).
 */
import { getAnalyte, isKnownUnit, toCanonical, type Analyte } from './analytes';
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
}

export interface ManualLabValid {
  analyte: Analyte;
  value: number;
  comparator: '<' | '<=' | '>' | '>=' | null;
  unit: string;
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

  const parsed = parseLabNumber(input.value);
  if (!parsed) errors.value = 'Saisissez un nombre, par exemple 7,2 ou < 5.';

  const unit = input.unit.trim();
  if (!unit) errors.unit = 'Choisissez l’unité indiquée sur le compte rendu.';
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

  if (Object.keys(errors).length || !analyte || !parsed) return { ok: false, errors };
  return {
    ok: true,
    value: {
      analyte,
      value: parsed.value,
      comparator: parsed.comparator,
      unit: normalizeUnit(unit) === normalizeUnit(analyte.canonicalUnit) ? analyte.canonicalUnit : unit,
      valueCanonical,
      sampledOn: input.sampledOn,
      laboratory,
      refLow: refLow as number | null,
      refHigh: refHigh as number | null,
      note,
    },
  };
}
