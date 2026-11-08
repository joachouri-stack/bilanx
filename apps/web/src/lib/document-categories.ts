import type { IconName } from '@/components/icon';

/** Icône d'une catégorie : une icône du composant `Icon`, ou un tracé local de components/documents-icons.tsx. */
export type DocCategoryIcon = IconName | 'imaging' | 'scanner' | 'eye' | 'ear' | 'kidney' | 'bone' | 'capsule' | 'shield' | 'certificate';

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

/** Spécialités médicales (codes de la migration 0026) : titre de page, libellé du formulaire, complément « d’urologie ». */
export interface SpecialtyInfo {
  code: string;
  /** Titre de page et de liste : « Urologie ». */
  title: string;
  /** Libellé du choix dans le formulaire : « Urologie (urologue) ». */
  label: string;
  /** Complément du nom : « d’urologie », « de cardiologie ». */
  of: string;
}

export const SPECIALTIES: SpecialtyInfo[] = [
  { code: 'generaliste', title: 'Médecine générale', label: 'Médecine générale (généraliste)', of: 'de médecine générale' },
  { code: 'cardiologie', title: 'Cardiologie', label: 'Cardiologie (cardiologue)', of: 'de cardiologie' },
  { code: 'dermatologie', title: 'Dermatologie', label: 'Dermatologie (dermatologue)', of: 'de dermatologie' },
  { code: 'endocrinologie', title: 'Endocrinologie', label: 'Endocrinologie (diabète, thyroïde)', of: 'd’endocrinologie' },
  { code: 'gastro', title: 'Gastro-entérologie', label: 'Gastro-entérologie (gastro)', of: 'de gastro-entérologie' },
  { code: 'gynecologie', title: 'Gynécologie', label: 'Gynécologie (gynécologue)', of: 'de gynécologie' },
  { code: 'nephrologie', title: 'Néphrologie', label: 'Néphrologie (reins)', of: 'de néphrologie' },
  { code: 'neurologie', title: 'Neurologie', label: 'Neurologie (neurologue)', of: 'de neurologie' },
  { code: 'ophtalmologie', title: 'Ophtalmologie', label: 'Ophtalmologie (ophtalmo)', of: 'd’ophtalmologie' },
  { code: 'orl', title: 'ORL', label: 'ORL (oreilles, nez, gorge)', of: 'd’ORL' },
  { code: 'pneumologie', title: 'Pneumologie', label: 'Pneumologie (poumons)', of: 'de pneumologie' },
  { code: 'rhumatologie', title: 'Rhumatologie', label: 'Rhumatologie (rhumatologue)', of: 'de rhumatologie' },
  { code: 'urologie', title: 'Urologie', label: 'Urologie (urologue)', of: 'd’urologie' },
  { code: 'podologie', title: 'Podologie', label: 'Podologie (pieds)', of: 'de podologie' },
  { code: 'dentaire', title: 'Dentaire', label: 'Dentaire (dentiste)', of: 'dentaire' },
  { code: 'psychiatrie', title: 'Psychiatrie', label: 'Psychiatrie (psychiatre)', of: 'de psychiatrie' },
  { code: 'radiologie', title: 'Radiologie', label: 'Radiologie (radiologue)', of: 'de radiologie' },
  { code: 'autre', title: 'Autre spécialité', label: 'Autre spécialité', of: 'd’une autre spécialité' },
];

/** Dossiers de rangement (codes de la migration 0027) : vitamines, mutuelle, attestation. */
export interface FolderInfo {
  code: string;
  title: string;
  /** Libellé du bouton d'ajout : « Ajouter un document au dossier Vitamines ». */
  add: string;
  icon: DocCategoryIcon;
}

export const FOLDERS: FolderInfo[] = [
  { code: 'vitamines', title: 'Vitamines', add: 'Ajouter un document Vitamines', icon: 'capsule' },
  { code: 'mutuelle', title: 'Mutuelle', add: 'Ajouter un document de mutuelle', icon: 'shield' },
  { code: 'attestation', title: 'Attestations', add: 'Ajouter une attestation', icon: 'certificate' },
];

export function folderByCode(code: string | null | undefined): FolderInfo | null {
  return FOLDERS.find((f) => f.code === code) ?? null;
}

export function specialtyByCode(code: string | null | undefined): SpecialtyInfo | null {
  return SPECIALTIES.find((s) => s.code === code) ?? null;
}

/** Document tel que renvoyé par `documents().list()` (champs utiles aux filtres). */
export interface DocLike {
  kind: string;
  exam_type?: string | null;
  specialty?: string | null;
  folder?: string | null;
}

/**
 * Raccourcis « Documents » du tableau de bord (ordre d'affichage). Chacun ouvre la liste filtrée,
 * du plus récent au plus ancien ; `match` sert aux compteurs.
 */
export interface DocShortcut {
  key: string;
  /** Libellé court de la tuile : « Urologue ». */
  label: string;
  href: string;
  icon: DocCategoryIcon;
  tone: 'amber' | 'petrol' | 'glucose' | 'sage' | 'neutral';
  match: (d: DocLike) => boolean;
}

const isKind = (key: string) => (d: DocLike) => categoryByKey(key)!.kinds.includes(d.kind);
const isSpecialty = (code: string) => (d: DocLike) => d.specialty === code;
const isFolder = (code: string) => (d: DocLike) => d.folder === code;

export const DOC_SHORTCUTS: DocShortcut[] = [
  { key: 'ordonnances', label: 'Ordonnances', href: '/ordonnances', icon: 'prescription', tone: 'amber', match: isKind('ordonnances') },
  { key: 'analyses', label: 'Bilans sanguins', href: '/documents?cat=analyses', icon: 'flask', tone: 'petrol', match: isKind('analyses') },
  { key: 'comptes-rendus', label: 'Comptes rendus', href: '/documents?cat=comptes-rendus', icon: 'document', tone: 'sage', match: isKind('comptes-rendus') },
  { key: 'imagerie', label: 'Imagerie', href: '/documents?cat=imagerie', icon: 'imaging', tone: 'glucose', match: isKind('imagerie') },
  { key: 'urologie', label: 'Urologue', href: '/documents?specialite=urologie', icon: 'kidney', tone: 'neutral', match: isSpecialty('urologie') },
  { key: 'ophtalmologie', label: 'Ophtalmo', href: '/documents?specialite=ophtalmologie', icon: 'eye', tone: 'neutral', match: isSpecialty('ophtalmologie') },
  { key: 'orl', label: 'ORL', href: '/documents?specialite=orl', icon: 'ear', tone: 'neutral', match: isSpecialty('orl') },
  { key: 'vitamines', label: 'Vitamines', href: '/documents?dossier=vitamines', icon: 'capsule', tone: 'sage', match: isFolder('vitamines') },
  { key: 'mutuelle', label: 'Mutuelle', href: '/documents?dossier=mutuelle', icon: 'shield', tone: 'petrol', match: isFolder('mutuelle') },
  { key: 'attestation', label: 'Attestation', href: '/documents?dossier=attestation', icon: 'certificate', tone: 'neutral', match: isFolder('attestation') },
];

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
