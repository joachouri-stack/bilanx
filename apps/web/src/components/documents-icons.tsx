import { Icon, type IconName } from './icon';
import type { DocCategoryIcon } from '@/lib/document-categories';

/** Imagerie (radio, IRM…) : cadre et côtes stylisées. */
const IMAGING = 'M4 4h16v16H4zM12 7v10M8.5 9.5c1.2.6 2.3.8 3.5.8s2.3-.2 3.5-.8M8 13c1.3.6 2.6.9 4 .9s2.7-.3 4-.9';

/** Scanner : anneau de l'appareil et table d'examen. */
const SCANNER = 'M5 3h14a2 2 0 0 1 2 2v11H3V5a2 2 0 0 1 2-2zM12 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM1.5 10h21M6 16v4M18 16v4M4 20h16';
/** Œil (ophtalmologie). */
const EYE = 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z';
/** Oreille (ORL). */
const EAR = 'M6 10a6 6 0 0 1 12 0c0 3-1.8 4.3-3 5.5-1 1-1.3 2.4-2 3.5-1 1.6-3.8 1.6-4.6-.5M9.5 10.2a2.6 2.6 0 0 1 5.2-.2c0 1.5-1.2 2-1.7 3';
/** Rein et uretère (urologie). */
const KIDNEY = 'M9 3.5c-3.5 0-5 3.3-5 7.5s1.8 9 5.5 9c2.5 0 3.2-2 3-3.6-.2-1.4-1.5-2.3-1.5-3.9s1.3-2.5 1.5-3.9C12.7 6.4 11.8 3.5 9 3.5zM11.2 12.5H15a2.5 2.5 0 0 1 2.5 2.5v6';
/** Os (radiographie). */
const BONE = 'M8.5 6.5a2.5 2.5 0 1 0-3.5 2.4 2.5 2.5 0 1 0 2.4 3.5l6.7 6.7a2.5 2.5 0 1 0 3.5-2.4 2.5 2.5 0 1 0-2.4-3.5z';
/** Gélule (vitamines). */
const CAPSULE = 'M10.5 20.5a5 5 0 0 1-7-7l7-7a5 5 0 0 1 7 7zM7 10l7 7';
/** Bouclier avec une croix (mutuelle). */
const SHIELD = 'M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6zM12 8.5v6M9 11.5h6';
/** Feuille avec un sceau (attestation). */
const CERTIFICATE = 'M14 21H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h9l4 4v5M8.5 8h5M8.5 11.5h4M17 19.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM15.5 19.2V22l1.5-1 1.5 1v-2.8';

/** Cœur (cardiologie). */
const HEART = 'M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z';
/** Cerveau (neurologie) : deux hémisphères. */
const BRAIN =
  'M12 5.5a3 3 0 0 0-5.6-1.2A3 3 0 0 0 4 8.5a3 3 0 0 0-.5 5 3.2 3.2 0 0 0 2.8 4.7A3 3 0 0 0 12 19.5zM12 5.5a3 3 0 0 1 5.6-1.2A3 3 0 0 1 20 8.5a3 3 0 0 1 .5 5 3.2 3.2 0 0 1-2.8 4.7A3 3 0 0 1 12 19.5M8 10.5c1.2 0 2 .8 2 2M16 10.5c-1.2 0-2 .8-2 2';
/** Dent (dentaire). */
const TOOTH = 'M7.5 3.5C5 3.5 4 5.5 4 8c0 3 1.5 4.5 2 7.5.4 2.6 1 5 2.3 5 1.6 0 1.4-5 3.7-5s2.1 5 3.7 5c1.3 0 1.9-2.4 2.3-5 .5-3 2-4.5 2-7.5 0-2.5-1-4.5-3.5-4.5-2 0-2.5 1-4.5 1s-2.5-1-4.5-1z';
/** Poumons (pneumologie). */
const LUNGS = 'M12 3.5V12M12 9.5l-2.5 2M12 9.5l2.5 2M8.5 7C6 7 3.5 11 3.5 16.5c0 2 1.2 3 3 3 2.2 0 3-1.5 3-4V8.5c0-.9-.4-1.5-1-1.5zM15.5 7c2.5 0 5 4 5 9.5 0 2-1.2 3-3 3-2.2 0-3-1.5-3-4V8.5c0-.9.4-1.5 1-1.5z';
/** Vaisseau sanguin avec un caillot (thrombose). */
const VESSEL = 'M3 8.5c3 0 4-1.5 9-1.5s6 1.5 9 1.5M3 15.5c3 0 4 1.5 9 1.5s6-1.5 9-1.5M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z';
/** Ruban (cancer). */
const RIBBON = 'M17 20.5 10 10.6C8.7 8.7 8.6 6.4 9.2 5c.5-1.3 1.5-2 2.8-2s2.3.7 2.8 2c.6 1.4.5 3.7-.8 5.6L7 20.5M7 20.5 5.4 19M17 20.5l1.6-1.5';
/** Bulle de parole avec un cœur (psychologue). */
const TALK = 'M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5zM12 13.5s-3-1.7-3-3.6a1.5 1.5 0 0 1 3-.6 1.5 1.5 0 0 1 3 .6c0 1.9-3 3.6-3 3.6z';
/** Fauteuil roulant (MDPH, handicap). */
const ACCESS = 'M11.5 4a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zM10 7.5V13h5.5l2.5 5.5 1.5-.6M10 10h4.5M7.5 10.6A5 5 0 1 0 14.3 17';
/** Personne qui fait un exercice (kinésithérapie). */
const MOTION = 'M14 4.5a1.8 1.8 0 1 1-3.6 0 1.8 1.8 0 0 1 3.6 0zM5 9.5l5.5 1L16 7.5M10.5 10.5 9.5 15l3.5 2 1 4M9.5 15 6 20.5';
/** Colonne vertébrale (ostéopathie). */
const SPINE = 'M9 3.5h6l-.5 3.5h-5zM8.5 10.25h7v3.5h-7zM9.5 17h5l.5 3.5H9zM12 7v3.25M12 13.75V17';

const PATHS: Partial<Record<DocCategoryIcon, string>> = {
  imaging: IMAGING,
  scanner: SCANNER,
  eye: EYE,
  ear: EAR,
  kidney: KIDNEY,
  bone: BONE,
  capsule: CAPSULE,
  shield: SHIELD,
  certificate: CERTIFICATE,
  heart: HEART,
  brain: BRAIN,
  tooth: TOOTH,
  lungs: LUNGS,
  vessel: VESSEL,
  ribbon: RIBBON,
  talk: TALK,
  access: ACCESS,
  motion: MOTION,
  spine: SPINE,
};

/** Icône d'une catégorie de document (décorative). */
export function DocIcon({ name, className = 'size-5 shrink-0' }: { name: DocCategoryIcon; className?: string }) {
  const path = PATHS[name];
  return path ? <Icon path={path} className={className} /> : <Icon name={name as IconName} className={className} />;
}
