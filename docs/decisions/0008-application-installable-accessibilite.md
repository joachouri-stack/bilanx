# Décision 0008 — Application installable (PWA) et accessibilité

**Date** : 5 novembre 2026 · **Statut** : adoptée

## Application installable
- Manifeste complet (icônes PNG 192/512, icône « maskable » avec zone de sécurité, raccourcis Glycémie,
  Médicaments, Scanner), icône `apple-touch-icon` (iOS ignore les icônes SVG), ouverture plein écran sur iPhone.
  Icônes générées depuis `public/icon.svg` : `node apps/web/scripts/generer-icones.mjs`.
- **Aucune donnée de santé sur l'appareil.** Le service worker ne met en cache que les fichiers statiques versionnés
  (`/_next/static`), les icônes et une page « hors ligne ». Les pages et les API passent toujours par le réseau :
  après déconnexion, rien n'est consultable, même sans connexion (téléphone partagé, perdu ou volé). La « lecture
  hors ligne limitée » envisagée dans la feuille de route est écartée tant qu'un chiffrement local lié à la session
  n'est pas conçu.
- Site de démonstration protégé par mot de passe : le navigateur télécharge le manifeste et le service worker sans
  identifiants. Ces fichiers publics, sans aucune donnée, sont exemptés de la protection (`PUBLIC_FILES`).
- Paramètres → « Installer BILANX sur votre téléphone » : bouton sur Android/ordinateur, marche à suivre sur iPhone
  (Safari → Partager → Sur l'écran d'accueil), état « installée ».

## Accessibilité (WCAG 2.2 AA)
Audit automatisé axe-core (règles WCAG 2.0 à 2.2, niveaux A et AA) sur ~30 pages (pages publiques, double
authentification, formulaires d'un profil réel, toutes les pages du profil de démonstration), en mode clair et
sombre, sur ordinateur et téléphone. Corrections :
- **Contrastes** : gris secondaire, verts, orange, rouge et bleu assombris juste assez pour 4,5:1 (teinte conservée) ;
  en mode sombre, texte foncé sur les boutons colorés (jeton `on-accent`) au lieu du blanc (2,1 à 3:1 auparavant).
- **Zones à défilement** (tableaux, journal des injections, graphique des pas) atteignables au clavier et nommées
  (`ScrollRegion`).
- **Lien « Aller au contenu »** en première tabulation ; focus clavier toujours visible (contour pétrole), y compris
  sur les choix d'intensité du journal.
- Titre de page pour les modules prévus.
Résultat : 0 violation détectée. Un audit automatisé ne couvre qu'une partie des critères : un audit manuel avec
lecteurs d'écran (VoiceOver, NVDA) et des utilisateurs reste nécessaire avant l'ouverture (RGAA).
