/** Lecture tolérante des valeurs envoyées par le Raccourci iPhone (voir app/api/v1/pas). */

/** « 8450 », 8450.0, « 8 450 pas », « 8450,0 » → 8450 ; sinon null. */
export function parseSteps(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  if (typeof v !== 'string') return null;
  const t = v.replace(/[\s  ]/g, '');
  const m = /^(\d+(?:[.,]\d+)?)/.exec(/^\d{1,3}(\.\d{3})+(?!\d)/.test(t) ? t.replace(/\./g, '') : t);
  return m ? Math.round(Number(m[1]!.replace(',', '.'))) : null;
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

