import { Icon } from './icon';
import type { DocCategoryIcon } from '@/lib/document-categories';

/** Imagerie (radio, IRM…) : cadre et côtes stylisées. */
const IMAGING = 'M4 4h16v16H4zM12 7v10M8.5 9.5c1.2.6 2.3.8 3.5.8s2.3-.2 3.5-.8M8 13c1.3.6 2.6.9 4 .9s2.7-.3 4-.9';

/** Icône d'une catégorie de document (décorative). */
export function DocIcon({ name, className = 'size-5 shrink-0' }: { name: DocCategoryIcon; className?: string }) {
  return name === 'imaging' ? <Icon path={IMAGING} className={className} /> : <Icon name={name} className={className} />;
}
