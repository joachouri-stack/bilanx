import type { IconName } from '@/components/icon';

/** Icône d'une catégorie : une icône du composant `Icon`, ou un tracé local de components/documents-icons.tsx. */
export type DocCategoryIcon =
  | IconName
  | 'imaging'
  | 'scanner'
  | 'eye'
  | 'ear'
  | 'kidney'
  | 'bone'
  | 'capsule'
  | 'shield'
  | 'certificate'
  | 'heart'
  | 'brain'
  | 'tooth'
  | 'lungs'
  | 'vessel'
  | 'ribbon'
  | 'talk'
  | 'access';

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

/**
 * Spécialités médicales (codes de la migration 0026). Une spécialité est le second axe de rangement :
 * une ordonnance de l'ophtalmo est une « Ordonnance » ET un document « Yeux » (elle apparaît dans les deux dossiers).
 */
export interface SpecialtyInfo {
  code: string;
  /** Nom du dossier, en mots simples : « Yeux », « Diabète ». */
  short: string;
  /** Nom médical : « Ophtalmologie ». */
  title: string;
  /** Libellé du choix dans le formulaire de classement : « Yeux (ophtalmologie) ». */
  label: string;
  /** Complément du nom : « d’urologie », « de cardiologie ». */
  of: string;
  icon: DocCategoryIcon;
}

const spec = (code: string, short: string, title: string, of: string, icon: DocCategoryIcon): SpecialtyInfo => ({
  code,
  short,
  title,
  label: short === title ? title : `${short} (${title.toLowerCase()})`,
  of,
  icon,
});

/** Ordre d'affichage : les plus courantes d'abord. */
export const SPECIALTIES: SpecialtyInfo[] = [
  spec('vitamines', 'Vitamines', 'Vitamines et compléments', 'de vitamines', 'capsule'),
  spec('ophtalmologie', 'Yeux', 'Ophtalmologie', 'd’ophtalmologie', 'eye'),
  spec('endocrinologie', 'Diabète', 'Endocrinologie', 'd’endocrinologie', 'drop'),
  spec('thrombose', 'Thrombose', 'Médecine vasculaire', 'de thrombose', 'vessel'),
  spec('neurologie', 'Cerveau', 'Neurologie', 'de neurologie', 'brain'),
  spec('cardiologie', 'Cœur', 'Cardiologie', 'de cardiologie', 'heart'),
  spec('orl', 'ORL', 'ORL', 'd’ORL', 'ear'),
  spec('urologie', 'Urologie', 'Urologie', 'd’urologie', 'kidney'),
  spec('nephrologie', 'Reins', 'Néphrologie', 'de néphrologie', 'kidney'),
  spec('dentaire', 'Dents', 'Dentaire', 'dentaire', 'tooth'),
  spec('generaliste', 'Généraliste', 'Médecine générale', 'de médecine générale', 'user'),
  spec('pneumologie', 'Poumons', 'Pneumologie', 'de pneumologie', 'lungs'),
  spec('rhumatologie', 'Os et articulations', 'Rhumatologie', 'de rhumatologie', 'bone'),
  spec('dermatologie', 'Peau', 'Dermatologie', 'de dermatologie', 'sparkle'),
  spec('gastro', 'Digestion', 'Gastro-entérologie', 'de gastro-entérologie', 'meal'),
  spec('gynecologie', 'Gynécologie', 'Gynécologie', 'de gynécologie', 'user'),
  spec('podologie', 'Pieds', 'Podologie', 'de podologie', 'steps'),
  spec('cancer', 'Cancer', 'Oncologie', 'd’oncologie', 'ribbon'),
  spec('psychologue', 'Psychologue', 'Psychologie', 'de psychologie', 'talk'),
  spec('mdph', 'MDPH', 'Handicap', 'MDPH', 'access'),
  spec('psychiatrie', 'Psychiatrie', 'Psychiatrie', 'de psychiatrie', 'user'),
  spec('radiologie', 'Radiologie', 'Radiologie', 'de radiologie', 'imaging'),
  spec('autre', 'Autre spécialité', 'Autre spécialité', 'd’une autre spécialité', 'folder'),
];

/** Spécialités proposées d'emblée (formulaire d'ajout, page Documents même vides), les plus utiles d'abord. */
export const PINNED_SPECIALTIES = [
  'endocrinologie', 'ophtalmologie', 'cardiologie', 'cancer', 'thrombose', 'vitamines', 'psychologue', 'mdph',
  'neurologie', 'orl', 'urologie',
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
  tone: 'amber' | 'petrol' | 'glucose' | 'sage' | 'rose' | 'neutral';
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
  { key: 'ophtalmologie', label: 'Yeux', href: '/documents?specialite=ophtalmologie', icon: 'eye', tone: 'rose', match: isSpecialty('ophtalmologie') },
  { key: 'endocrinologie', label: 'Diabète', href: '/documents?specialite=endocrinologie', icon: 'drop', tone: 'rose', match: isSpecialty('endocrinologie') },
  { key: 'neurologie', label: 'Cerveau', href: '/documents?specialite=neurologie', icon: 'brain', tone: 'rose', match: isSpecialty('neurologie') },
  { key: 'orl', label: 'ORL', href: '/documents?specialite=orl', icon: 'ear', tone: 'rose', match: isSpecialty('orl') },
  { key: 'urologie', label: 'Urologie', href: '/documents?specialite=urologie', icon: 'kidney', tone: 'rose', match: isSpecialty('urologie') },
  { key: 'vitamines', label: 'Vitamines', href: '/documents?specialite=vitamines', icon: 'capsule', tone: 'rose', match: isSpecialty('vitamines') },
  { key: 'mutuelle', label: 'Mutuelle', href: '/documents?dossier=mutuelle', icon: 'shield', tone: 'petrol', match: isFolder('mutuelle') },
  { key: 'attestation', label: 'Attestations', href: '/documents?dossier=attestation', icon: 'certificate', tone: 'neutral', match: isFolder('attestation') },
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
