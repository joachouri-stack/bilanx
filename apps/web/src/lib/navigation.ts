import type { IconName } from '@/components/icon';

export type NavStatus = 'available' | 'planned';

/** Rubriques du menu, dans l'ordre d'affichage (organigramme cible). */
export const NAV_SECTIONS = ['Suivi', 'Traitements', 'Documents'] as const;
export type NavSection = (typeof NAV_SECTIONS)[number];

export interface NavItem {
  href: string;
  /** Libellé du menu complet. */
  label: string;
  /** Libellé court (barre d'onglets du téléphone). */
  short: string;
  icon: IconName;
  status: NavStatus;
  group: 'main' | 'account';
  /** Rubrique du menu : les éléments consécutifs d'une même rubrique sont regroupés sous son titre. */
  section?: NavSection;
}

/**
 * Menu principal, dans l'ordre d'affichage :
 * Accueil ; Suivi (Glycémie, Analyses, Activité, Salle de sport, Journal) ; Traitements (Médicaments, Insuline) ; Rendez-vous ;
 * Documents (Documents, Ordonnances, Partager avec un soignant) ; puis le compte (Famille & profils, Paramètres).
 * La route /assistant (prévue) existe toujours mais n'est plus dans le menu.
 */
export const NAV: NavItem[] = [
  { href: '/tableau-de-bord', label: 'Accueil', short: 'Accueil', icon: 'home', status: 'available', group: 'main' },
  { href: '/glycemie', label: 'Glycémie', short: 'Glycémie', icon: 'drop', status: 'available', group: 'main', section: 'Suivi' },
  { href: '/analyses', label: 'Analyses', short: 'Analyses', icon: 'flask', status: 'available', group: 'main', section: 'Suivi' },
  { href: '/activite', label: 'Activité', short: 'Activité', icon: 'steps', status: 'available', group: 'main', section: 'Suivi' },
  { href: '/salle-de-sport', label: 'Salle de sport', short: 'Sport', icon: 'dumbbell', status: 'available', group: 'main', section: 'Suivi' },
  { href: '/journal', label: 'Journal', short: 'Journal', icon: 'journal', status: 'available', group: 'main', section: 'Suivi' },
  { href: '/medicaments', label: 'Médicaments', short: 'Médicaments', icon: 'pill', status: 'available', group: 'main', section: 'Traitements' },
  { href: '/traitements', label: 'Insuline', short: 'Insuline', icon: 'syringe', status: 'available', group: 'main', section: 'Traitements' },
  { href: '/rendez-vous', label: 'Rendez-vous', short: 'RDV', icon: 'calendar', status: 'available', group: 'main' },
  { href: '/documents', label: 'Documents', short: 'Documents', icon: 'folder', status: 'available', group: 'main', section: 'Documents' },
  { href: '/ordonnances', label: 'Ordonnances', short: 'Ordonnances', icon: 'prescription', status: 'available', group: 'main', section: 'Documents' },
  { href: '/rapports', label: 'Partager avec un soignant', short: 'Partager', icon: 'share', status: 'available', group: 'main', section: 'Documents' },
  { href: '/famille', label: 'Famille & profils', short: 'Famille', icon: 'family', status: 'available', group: 'account' },
  { href: '/parametres', label: 'Paramètres', short: 'Paramètres', icon: 'settings', status: 'available', group: 'account' },
];

/** Onglets de la barre du bas du téléphone (le bouton ＋ et « Menu » s'intercalent : Accueil · Glycémie · ＋ · Documents · Menu). */
export const MOBILE_TABS = ['/tableau-de-bord', '/glycemie', '/documents'] as const;

export interface QuickAddItem {
  href: string;
  label: string;
  /**
   * Émoji historique, encore affiché par les pastilles du tableau de bord.
   * @deprecated utiliser `svg` avec `<Icon name={q.svg} />`.
   */
  icon: string;
  /** Icône SVG (components/icon.tsx). */
  svg: IconName;
  /** Rubrique d'appartenance : l'ajout est masqué si cette rubrique est interdite pour le profil affiché. */
  base: string;
  /** Couleur de la pastille : la même que la carte correspondante du tableau de bord. */
  tone: 'glucose' | 'petrol' | 'sage' | 'violet' | 'rose';
  /** Feuille « Ajouter » : « gym » coche la séance du jour sans changer de page ; « documents » ouvre le choix du dossier. */
  special?: 'gym' | 'documents';
}

/** Ajouts rapides (feuille « Ajouter » du bouton ＋ sur téléphone, pastilles du tableau de bord). */
export const QUICK_ADD: QuickAddItem[] = [
  { href: '/glycemie#ajouter-glycemie', label: 'Glycémie', icon: '🩸', svg: 'drop', base: '/glycemie', tone: 'glucose' },
  { href: '/activite#saisir-pas', label: 'Pas du jour', icon: '👟', svg: 'steps', base: '/activite', tone: 'sage' },
  { href: '/salle-de-sport', label: 'Séance de sport', icon: '🏋️', svg: 'dumbbell', base: '/salle-de-sport', tone: 'sage', special: 'gym' },
  { href: '/traitements#injection', label: 'Injection d’insuline', icon: '💉', svg: 'syringe', base: '/traitements', tone: 'petrol' },
  { href: '/journal#ajouter-journal', label: 'Repas ou événement', icon: '🍽️', svg: 'meal', base: '/journal', tone: 'petrol' },
  { href: '/medicaments#prises', label: 'Prise de médicament', icon: '💊', svg: 'pill', base: '/medicaments', tone: 'petrol' },
  { href: '/analyses/ajouter?analyse=hba1c', label: 'HbA1c', icon: '🧪', svg: 'flask', base: '/analyses', tone: 'petrol' },
  { href: '/rendez-vous#nouveau-rendez-vous', label: 'Rendez-vous', icon: '📅', svg: 'calendar', base: '/rendez-vous', tone: 'violet' },
  { href: '/documents#ajouter', label: 'Document ou photo', icon: '📄', svg: 'camera', base: '/documents', tone: 'rose', special: 'documents' },
];

/** Ce que chaque module « prévu » nécessitera — affiché honnêtement sur sa page. */
export const PLANNED_DETAILS: Record<string, { title: string; version: string; needs: string[] }> = {
  '/assistant': { title: 'Assistant IA', version: 'V2 (bêta)', needs: ['Analyse réglementaire préalable (MDR)', "Réponses limitées aux données enregistrées, avec citations"] },
};
