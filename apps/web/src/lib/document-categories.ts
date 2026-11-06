import type { IconName } from '@/components/icon';

/** Icône d'une catégorie : une icône du composant `Icon`, ou « imaging » (tracé local, components/documents-icons.tsx). */
export type DocCategoryIcon = IconName | 'imaging';

/** Catégories de documents affichées (ordre d'affichage) et libellés. */
export interface DocCategory {
  key: string;
  /** Catégorie enregistrée à l'import. */
  kind: 'prescription' | 'lab_report' | 'imaging' | 'medical_report' | 'other';
  /** Valeurs de `document.kind` rangées dans cette catégorie. */
  kinds: string[];
  label: string;
  single: string;
  /** Icône SVG (voir `DocIcon` dans components/documents-icons.tsx). */
  svg: DocCategoryIcon;
  /** @deprecated émoji conservé le temps que le tableau de bord passe à `svg` ; ne plus l'afficher. */
  icon: string;
  hint: string;
}

export const DOC_CATEGORIES: DocCategory[] = [
  { key: 'ordonnances', kind: 'prescription', kinds: ['prescription'], label: 'Ordonnances', single: 'Ordonnance', svg: 'prescription', icon: '💊', hint: 'Médicaments, soins, examens prescrits' },
  { key: 'analyses', kind: 'lab_report', kinds: ['lab_report'], label: 'Bilans sanguins', single: 'Bilan sanguin', svg: 'flask', icon: '🧪', hint: 'Prises de sang, analyses d’urine' },
  { key: 'imagerie', kind: 'imaging', kinds: ['imaging'], label: 'Imagerie', single: 'Imagerie', svg: 'imaging', icon: '🩻', hint: 'IRM, scanner, radio, échographie' },
  { key: 'comptes-rendus', kind: 'medical_report', kinds: ['medical_report', 'letter', 'exam_result'], label: 'Comptes rendus', single: 'Compte rendu', svg: 'document', icon: '📝', hint: 'Consultations, hospitalisations, courriers' },
  { key: 'autres', kind: 'other', kinds: ['other', 'unknown'], label: 'Autres', single: 'Document', svg: 'folder', icon: '📁', hint: 'Tout le reste' },
];

export const EXAM_LABELS: Record<string, string> = { irm: 'IRM', scanner: 'Scanner', radio: 'Radiographie', echo: 'Échographie', autre: 'Autre examen' };

export function categoryOf(kind: string): DocCategory {
  return DOC_CATEGORIES.find((c) => c.kinds.includes(kind)) ?? DOC_CATEGORIES.at(-1)!;
}

export function categoryByKey(key: string | undefined): DocCategory | null {
  return DOC_CATEGORIES.find((c) => c.key === key) ?? null;
}

/** Titre lisible : celui donné par l'utilisateur, sinon la catégorie (le nom de fichier « IMG_1234.jpg » n'aide personne). */
export function documentTitle(d: { title: string | null; kind: string; exam_type?: string | null }): string {
  const t = d.title?.trim() ?? '';
  const isFileName = !t || /\.(pdf|jpe?g|png|webp|heic)$/i.test(t);
  if (!isFileName) return t;
  if (d.kind === 'imaging' && d.exam_type) return EXAM_LABELS[d.exam_type] ?? 'Imagerie';
  return categoryOf(d.kind).single;
}
