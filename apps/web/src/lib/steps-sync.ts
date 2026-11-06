/** Lecture tolérante des valeurs envoyées par le Raccourci iPhone (voir app/api/v1/pas). */

/**
 * « 8450 », 8450.0, « 8 450 pas », « 8450,0 », « 8.450 » → 8450.
 * Une seule valeur attendue : si le texte contient plusieurs nombres sur plusieurs lignes
 * (raccourci mal groupé), renvoie null plutôt que de les coller ou de deviner.
 */
export function parseSteps(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  if (typeof v !== 'string') return null;
  const values: number[] = [];
  for (const raw of v.split(/[\r\n]+/)) {
    // Séparateurs de milliers (espace, espace insécable, point) uniquement entre groupes de 3 chiffres.
    const line = raw.replace(/(\d)[\s\u00a0\u202f.](?=\d{3}(?!\d))/g, '$1');
    const m = /\d+(?:[.,]\d+)?/.exec(line);
    if (m) values.push(Math.round(Number(m[0].replace(',', '.'))));
  }
  return values.length === 1 ? values[0]! : null;
}

/** « 2026-11-06 », « 06/11/2026 » ou une date ISO complète → AAAA-MM-JJ (heure de Paris). */
export function parseDay(v: unknown): string | null {
  if (v == null || v === '') return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const fr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (fr) return `${fr[3]}-${fr[2]!.padStart(2, '0')}-${fr[1]!.padStart(2, '0')}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(d);
}

