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

const PATHS: Partial<Record<DocCategoryIcon, string>> = { imaging: IMAGING, scanner: SCANNER, eye: EYE, ear: EAR, kidney: KIDNEY };

/** Icône d'une catégorie de document (décorative). */
export function DocIcon({ name, className = 'size-5 shrink-0' }: { name: DocCategoryIcon; className?: string }) {
  const path = PATHS[name];
  return path ? <Icon path={path} className={className} /> : <Icon name={name as IconName} className={className} />;
}
