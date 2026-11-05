export type NavStatus = 'available' | 'planned';

export interface NavItem {
  href: string;
  label: string;
  short: string;
  icon: string; // chemin SVG (24×24, trait)
  status: NavStatus;
  group: 'main' | 'account';
  /** Rubrique du menu (regroupement visuel). */
  section?: 'Suivi de santé' | 'Soins' | 'Documents';
}

export const NAV_SECTIONS = ['Suivi de santé', 'Soins', 'Documents'] as const;

export const NAV: NavItem[] = [
  { href: '/tableau-de-bord', label: 'Tableau de bord', short: 'Accueil', icon: 'M3 12l9-8 9 8v8a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', status: 'available', group: 'main' },
  { href: '/glycemie', label: 'Glycémie', short: 'Glycémie', icon: 'M3 17l5-6 4 3 5-8 4 5', status: 'available', group: 'main', section: 'Suivi de santé' },
  { href: '/analyses', label: 'Analyses & HbA1c', short: 'Analyses', icon: 'M9 3v6l-5 9a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-5-9V3M8 3h8', status: 'available', group: 'main', section: 'Suivi de santé' },
  { href: '/activite', label: 'Activité & Pas', short: 'Activité', icon: 'M13 4a2 2 0 1 0 0 .1M9 21l3-7 3 3v5M6 12l3-4 4 1 3 3', status: 'available', group: 'main', section: 'Suivi de santé' },
  { href: '/journal', label: 'Journal & Repas', short: 'Journal', icon: 'M4 4h16v16H4zM8 9h8M8 13h8M8 17h5', status: 'available', group: 'main', section: 'Suivi de santé' },
  { href: '/medicaments', label: 'Médicaments', short: 'Médicaments', icon: 'M10.5 20.5a5 5 0 0 1-7-7l7-7a5 5 0 0 1 7 7zM7 10l7 7', status: 'available', group: 'main', section: 'Soins' },
  { href: '/traitements', label: 'Insuline & Traitements', short: 'Insuline', icon: 'M18 2l4 4M17 7l-9 9-4 1 1-4 9-9z', status: 'available', group: 'main', section: 'Soins' },
  { href: '/rendez-vous', label: 'Rendez-vous', short: 'RDV', icon: 'M4 6h16v14H4zM4 10h16M9 3v4M15 3v4', status: 'available', group: 'main', section: 'Soins' },
  { href: '/ordonnances', label: 'Ordonnances', short: 'Ordonnances', icon: 'M7 3h10v18H7zM10 8h4M12 6v4M10 14h4M10 17h4', status: 'available', group: 'main', section: 'Documents' },
  { href: '/documents', label: 'Tous mes documents', short: 'Documents', icon: 'M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3M4 12h16', status: 'available', group: 'main', section: 'Documents' },
  { href: '/rapports', label: 'Rapports PDF', short: 'Rapports', icon: 'M6 2h9l5 5v15H6zM14 2v6h6', status: 'available', group: 'main', section: 'Documents' },
  { href: '/assistant', label: 'Assistant IA', short: 'Assistant', icon: 'M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z', status: 'planned', group: 'main' },
  { href: '/famille', label: 'Famille & Profils', short: 'Famille', icon: 'M9 11a4 4 0 1 0 0-.1M2 21c0-4 3-6 7-6s7 2 7 6M17 11a3 3 0 1 0 0-.1M22 20c0-3-2-5-5-5', status: 'available', group: 'account' },
  { href: '/parametres', label: 'Paramètres', short: 'Paramètres', icon: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3', status: 'available', group: 'account' },
];

/** Ajouts rapides (bouton ＋ du téléphone, tableau de bord). */
export const QUICK_ADD: { href: string; label: string; icon: string; base: string }[] = [
  { href: '/glycemie#ajouter-glycemie', label: 'Glycémie', icon: '🩸', base: '/glycemie' },
  { href: '/analyses/ajouter?analyse=hba1c', label: 'HbA1c', icon: '🧪', base: '/analyses' },
  { href: '/activite#saisir-pas', label: 'Pas du jour', icon: '👟', base: '/activite' },
  { href: '/documents?cat=ordonnances#ajouter', label: 'Ordonnance', icon: '💊', base: '/documents' },
  { href: '/documents?cat=analyses#ajouter', label: 'Bilan / analyses', icon: '📄', base: '/documents' },
  { href: '/documents?cat=imagerie#ajouter', label: 'IRM, scanner, radio', icon: '🩻', base: '/documents' },
];

/** Ce que chaque module « prévu » nécessitera — affiché honnêtement sur sa page. */
export const PLANNED_DETAILS: Record<string, { title: string; version: string; needs: string[] }> = {
  '/assistant': { title: 'Assistant IA', version: 'V2 (bêta)', needs: ['Analyse réglementaire préalable (MDR)', "Réponses limitées aux données enregistrées, avec citations"] },
};
