/**
 * Icônes de BILANX : tracés SVG 24×24, au trait (currentColor), toujours décoratives (aria-hidden).
 * Le sens est porté par le texte voisin ou par l'aria-label du bouton qui les contient.
 *
 * Utilisation : `<Icon name="drop" />` (recommandé) ou `<Icon path="M…" />` (tracé libre, compatibilité).
 */
export const ICONS = {
  plus: 'M12 5v14M5 12h14',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  chevronLeft: 'M15 5l-7 7 7 7',
  chevronRight: 'M9 5l7 7-7 7',
  chevronDown: 'M6 9l6 6 6-6',
  home: 'M3 11.5l9-8 9 8V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  /** Glycémie : goutte. */
  drop: 'M12 3.5s6 6.4 6 10.9a6 6 0 0 1-12 0c0-4.5 6-10.9 6-10.9z',
  /** Courbe (tendance glycémique, graphiques). */
  chart: 'M3 17l5-6 4 3 5-8 4 5',
  /** Analyses de laboratoire : fiole. */
  flask: 'M9 3v6l-5 9a2 2 0 0 0 1.8 3h12.4a2 2 0 0 0 1.8-3l-5-9V3M8 3h8M7 15h10',
  /** Pas / activité : empreintes. */
  steps:
    'M7.5 3C9 3 10 4.8 10 7s-.8 4.5-2.5 4.5S5 9.2 5 7s1-4 2.5-4zM5.5 14h4.2l-.3 2.8a2 2 0 0 1-3.8 0zM16.5 7C18 7 19 8.8 19 11s-.8 4.5-2.5 4.5S14 13.2 14 11s1-4 2.5-4zM14.3 18h4.2l-.3 1.3a2 2 0 0 1-3.6 0z',
  /** Salle de sport : haltère (barre, deux disques de chaque côté). */
  dumbbell:
    'M7.5 12h9M5.5 6.5h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM4.5 9H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h1.5M17.5 6.5h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM19.5 9H21a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-1.5',
  /** Poids : pèse-personne (plateau et cadran). */
  scale: 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8.5 9.5a3.5 3.5 0 0 1 7 0M12 9.5l1.5-1.8',
  /** Journal / repas : fourchette et couteau. */
  meal: 'M5 3v5a2 2 0 0 0 4 0V3M7 10v11M17 21V3c-2.2 1.4-3.5 4.2-3.5 7.5V13H17',
  journal: 'M5 4h14v16H5zM9 9h6M9 13h6M9 17h3',
  /** Médicament : gélule. */
  pill: 'M10.5 20.5a5 5 0 0 1-7-7l7-7a5 5 0 0 1 7 7zM7 10l7 7',
  /** Insuline : seringue. */
  syringe: 'M17 3l4 4M19 5l-3.5 3.5M13 5.5l5.5 5.5M15.8 8.2l-8.3 8.3-3.5.5.5-3.5 8.3-8.3M4.5 19.5L3 21M9.5 11.5l1.5 1.5M12 9l1.5 1.5',
  calendar: 'M4 6h16v14H4zM4 10h16M9 3v4M15 3v4',
  /** Un document (fichier). */
  document: 'M6 2.5h8.5L19 7v14.5H6zM14 2.5V7.5h5M9 12h6M9 16h6',
  /** Dossier : l'ensemble des documents. */
  folder: 'M3 6.5a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
  /** Ordonnance. */
  prescription: 'M7 3h10v18H7zM10 8h4M12 6v4M10 14h4M10 17h4',
  camera: 'M3 8h4l2-3h6l2 3h4v12H3zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  /** Partage avec un soignant. */
  share:
    'M20 5.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM9 12a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM20 18.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM8.8 10.8l6.4-3.9M8.8 13.2l6.4 3.9',
  family:
    'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20.5c0-3.6 2.9-5.5 6.5-5.5s6.5 1.9 6.5 5.5M17 11a2.8 2.8 0 1 0 0-5.6M18 15c2.2.4 3.5 2.2 3.5 5',
  settings:
    'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6 8-6s8 2 8 6',
  logout: 'M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5M10 16.5L5.5 12 10 7.5M5.5 12H16',
  sparkle: 'M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z',
} as const;

export type IconName = keyof typeof ICONS;

/**
 * Icône SVG décorative.
 * @param name  nom d'une icône de {@link ICONS} (prioritaire sur `path`)
 * @param path  tracé SVG libre (compatibilité avec l'ancien usage)
 * @param className  taille et couleur ; par défaut 18 px
 */
export function Icon({
  name,
  path,
  className = 'size-[18px] shrink-0',
  strokeWidth = 1.7,
}: {
  name?: IconName;
  path?: string;
  className?: string;
  strokeWidth?: number;
}) {
  const d = name ? ICONS[name] : path;
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d={d} />
    </svg>
  );
}
