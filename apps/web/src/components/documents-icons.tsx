import { Icon, type IconName } from './icon';
import type { DocCategoryIcon } from '@/lib/document-categories';

/** Imagerie (radio, IRM…) : cadre et côtes stylisées. */
const IMAGING = 'M4 4h16v16H4zM12 7v10M8.5 9.5c1.2.6 2.3.8 3.5.8s2.3-.2 3.5-.8M8 13c1.3.6 2.6.9 4 .9s2.7-.3 4-.9';

/** Scanner : anneau de l'appareil et table d'examen. */
const SCANNER = 'M12 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM12 8.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM3 21h18M8 18l-1 3M16 18l1 3';
/** Œil (ophtalmologie). */
const EYE = 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z';
/** Oreille (ORL). */
const EAR = 'M6.5 9.5a5.5 5.5 0 0 1 11 0c0 3-2 4-3 5.5s-1 2.5-1.5 3.5a2.6 2.6 0 0 1-4.5-.6M9.5 10a2.5 2.5 0 0 1 5 0c0 1.4-1.2 1.8-1.8 2.8';
/** Rein et uretère (urologie). */
const KIDNEY = 'M14.5 3.5c3 0 5 2.4 5 5.5 0 3.6-2.3 6.5-5.2 7.4-2.6.8-5.2-.4-6-2.8-.5-1.6.6-2.6 1.6-3.4 1-.8 1.3-2 1.2-3.2-.2-2.2 1.2-3.5 3.4-3.5zM10.6 11.6c-1.5.4-3 1.6-3.6 3.4L6 20.5';

const PATHS: Partial<Record<DocCategoryIcon, string>> = { imaging: IMAGING, scanner: SCANNER, eye: EYE, ear: EAR, kidney: KIDNEY };

/** Icône d'une catégorie de document (décorative). */
export function DocIcon({ name, className = 'size-5 shrink-0' }: { name: DocCategoryIcon; className?: string }) {
  const path = PATHS[name];
  return path ? <Icon path={path} className={className} /> : <Icon name={name as IconName} className={className} />;
}
