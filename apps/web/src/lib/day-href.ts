/** Construit l'adresse d'un jour : `${basePath}?${param}=${jour}&${extraQuery}` (utilisable côté serveur et client). */
export function dayHref(basePath: string, param: string, day: string, extraQuery?: string): string {
  const q = new URLSearchParams(extraQuery);
  q.set(param, day);
  return `${basePath}?${q.toString()}`;
}
