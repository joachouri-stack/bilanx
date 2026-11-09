import type { Specialty } from './service';

/**
 * Spécialité devinée d'après le texte d'un document (en-tête du médecin, matériel prescrit).
 * Uniquement un rangement, modifiable par l'utilisateur : on ne devine que sur des mots sans ambiguïté,
 * et seulement si une seule spécialité ressort nettement. Jamais appliqué aux bilans sanguins (un dosage du PSA
 * ou de l'insuline n'en fait pas un document d'urologie ou de diabétologie).
 */
const CLUES: [Specialty, RegExp][] = [
  ['ophtalmologie', /\bophtalmolog\w*|\blunettes\b|\bverres? correcteurs?\b|\blentilles de contact\b|\bacuit[ée] visuelle\b|\bfond d['’ ]?(?:œ|oe)il\b|\borthoptiste\b/gi],
  ['endocrinologie', /\bendocrinolog\w*|\bdiab[ée]tolog\w*|\binsulines?\b|\bfreestyle\b|\bcapteurs? de glucose\b|\bbandelettes? (?:de )?glyc[ée]mie\b|\bstylos? (?:à|a) insuline\b/gi],
  ['neurologie', /\bneurolog\w*|\b[ée]lectroenc[ée]phalogramme\b/gi],
  ['thrombose', /\bthromb\w*|\bphl[ée]bite\b|\bembolie\b|\banticoagul\w*|\bangiolog\w*|\bm[ée]decine vasculaire\b|\bdoppler veineux\b|\bxarelto\b|\beliquis\b|\bpradaxa\b|\bpr[ée]viscan\b|\bcoumadine\b|\bbas de contention\b/gi],
  ['cardiologie', /\bcardiolog\w*|\b[ée]chocardiograph\w*|\b[ée]lectrocardiogramme\b|\bholter\b/gi],
  ['orl', /\bo\.?r\.?l\b|\boto-?rhino\w*|\baudiogramme\b|\bappareils? auditifs?\b/gi],
  ['urologie', /\burolog\w*/gi],
  ['nephrologie', /\bn[ée]phrolog\w*|\bdialyse\b/gi],
  ['dentaire', /\bchirurgien[- ]dentiste\b|\bdentiste\b|\borthodont\w*/gi],
  ['dermatologie', /\bdermatolog\w*/gi],
  ['pneumologie', /\bpneumolog\w*|\bspirom[ée]trie\b/gi],
  ['rhumatologie', /\brhumatolog\w*/gi],
  ['kine', /\bkin[ée]sith[ée]rap\w*|\bkin[ée]\b|\bmasseur[- ]kin[ée]\w*/gi],
  ['osteopathe', /\bost[ée]opath\w*/gi],
  ['orthophonie', /\borthophon\w*/gi],
  ['gastro', /\bgastro-?ent[ée]rolog\w*|\bcoloscopie\b|\bfibroscopie\b/gi],
  ['gynecologie', /\bgyn[ée]colog\w*|\bsage-femme\b/gi],
  ['podologie', /\bpodolog\w*|\bsemelles orthop[ée]diques\b/gi],
  ['psychiatrie', /\bpsychiatr\w*/gi],
  ['cancer', /\boncolog\w*|\bcanc[ée]rolog\w*|\bchimioth[ée]rapie\b|\bradioth[ée]rapie\b|\bimmunoth[ée]rapie\b|\bcentre de lutte contre le cancer\b|\br[ée]union de concertation pluridisciplinaire\b|\btumeurs? maligne\w*|\bm[ée]tastas\w*/gi],
  ['psychologue', /\bpsychologue\b|\bpsychoth[ée]rap\w*|\bneuropsycholog\w*|\bmon soutien psy\b/gi],
  ['mdph', /\bm\.?d\.?p\.?h\b|\bmaison d[ée]partementale des personnes handicap[ée]es\b|\bcdaph\b|\ba\.?a\.?h\b|\ballocation aux adultes handicap[ée]s\b|\bpch\b|\bprestation de compensation du handicap\b|\bcarte mobilit[ée] inclusion\b|\brqth\b|\btaux d['’ ]incapacit[ée]\b/gi],
];

export function guessSpecialty(text: string): Specialty | null {
  const scores = CLUES.map(([code, re]) => ({ code, n: text.match(re)?.length ?? 0 })).filter((s) => s.n > 0);
  if (!scores.length) return null;
  scores.sort((a, b) => b.n - a.n);
  // Égalité entre deux spécialités : on ne range pas.
  if (scores[1] && scores[1].n === scores[0]!.n) return null;
  return scores[0]!.code;
}
