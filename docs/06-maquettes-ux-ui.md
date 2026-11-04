# 06 — Maquettes UX/UI

Maquettes interactives : [`design/maquettes.html`](../design/maquettes.html) — fichier autonome, s'ouvre dans
un navigateur. Écrans : Tableau de bord · Glycémie (jour) · Analyses & jauges · Validation d'extraction ·
Vue combinée · Activité & Pas · Mobile. Thème clair/sombre automatique. **Toutes les données sont fictives.**

## 6.1 Système visuel

| Jeton | Clair | Usage |
|---|---|---|
| `--bg` | `#F6F5F1` blanc cassé | Fond d'application |
| `--petrol` | `#0F5562` bleu pétrole | Navigation, actions principales, HbA1c/labo |
| `--sage` | `#6F9A80` vert sauge | « Dans l'intervalle / la cible », activité |
| `--glucose` | `#2F6FDB` bleu | Courbes de glycémie uniquement |
| `--amber` | `#D98A3A` orange doux | Hors intervalle, « à vérifier » |
| `--red` | `#C2412D` rouge | Hypoglycémie, alertes importantes uniquement |
| `--violet` | `#7A5BB5` | Usage rare : insuline rapide |

- Typographies : **Fraunces** (titres, caractère éditorial premium) + **Inter** (interface, chiffres tabulaires).
- Cartes : rayon 18 px, ombre très légère, bordure fine ; espacements généreux (grille 12 colonnes, gouttière 16 px).
- Chaque catégorie a sa **pastille** (chip) colorée et son icône : Glycémie (bleu), Laboratoire (pétrole),
  Activité (sauge), À surveiller (orange).
- Accessibilité : contraste AA, l'information n'est jamais portée par la couleur seule (libellé « sous l'intervalle »,
  icône ⚠), cibles tactiles ≥ 44 px, navigation clavier, `aria-label` sur les flèches, `prefers-reduced-motion`.

## 6.2 Tableau de bord

- En-tête : salutation, date, **« Scanner un document »** (action principale), « Personnaliser ».
- Rangée 1 (diabète activé) : dernière glycémie + sparkline 24 h · statistiques 14 j avec barre de répartition ·
  HbA1c labo avec évolution vs analyse précédente.
- Rangée 2 : pas · insuline du jour · traitements · prochain RDV.
- Rangée 3 : jauges des **seuls** indicateurs hors intervalle · dernier document + résumé descriptif.
- Chaque carte affiche **source et fraîcheur** en pied (« import fichier LibreView · il y a 32 min »).
- Mode personnalisation : glisser-déposer, interrupteur de visibilité par carte.

## 6.3 Glycémie — vue jour

- Barre de navigation : ← · date en toutes lettres · → (désactivée sur aujourd'hui) · calendrier · « Aujourd'hui ».
- Sélecteur de période : Jour / 7 j / 14 j / 30 j / 90 j / Période…
- Graphique 24 h : bande cible sauge (70–180 par défaut), seuil 54 pointillé rouge, courbe bleue continue,
  **interrompue** en cas de trou de données > 30 min (pas d'interpolation trompeuse).
- 96 points/jour sans étiquettes ; points visibles seulement en zoom < 8 h ; infobulle heure + valeur exacte.
- Zoom molette/pincement, déplacement par glisser, double-clic pour réinitialiser.
- Capillaires en losanges (forme différente, pas seulement une couleur).
- Pistes sous le graphique : **Journal** (🍽 📝 🚶) et **Insuline** (💉) — axes séparés.
- Statistiques : moyenne, min/max, CV, nombre de mesures, % de données, répartition très bas / bas / cible / élevé / très élevé.
- Vues 14/30/90 j (à développer) : profil glycémique ambulatoire (médiane + percentiles 5–25–75–95 par heure),
  GMI **libellé « indicateur estimé à partir du capteur — ne remplace pas l'HbA1c de laboratoire »**.

## 6.4 Analyses — jauge capsule

Spécification mathématique (évite l'effet « réservoir ») :

```
position = 0,30 + (valeur − réf_basse) / (réf_haute − réf_basse) × 0,40     bornée à [0,03 ; 0,97]
```

- L'intervalle de référence du laboratoire occupe toujours **30 % → 70 %** de la hauteur, matérialisé par une bande
  verte et deux graduations portant les bornes.
- Un repère ▶ indique la position exacte ; la valeur numérique et l'unité sont toujours affichées sous la jauge.
- Couleur : sauge dans l'intervalle, orange en dehors. Libellé textuel : « sous l'intervalle », « dans l'intervalle »,
  « au-dessus ».
- Hors des bornes, l'échelle reste linéaire puis est **plafonnée** (avec mention « valeur hors échelle » si bornée).
- Encart pédagogique permanent : « la jauge indique une position, pas un taux de remplissage ».
- Clic → historique : points **uniquement aux dates de prélèvement**, bande de référence, tableau avec source.
  HbA1c affichée en % et mmol/mol.
- Si les références changent d'un laboratoire à l'autre, l'historique affiche la référence propre à chaque point.

## 6.5 Validation d'extraction

- Deux colonnes : document original / valeurs détectées. Clic sur une ligne = surlignage de la zone source.
- Chaque ligne : nom normalisé + libellé lu (« lu : Hémoglobine glyquée »), valeur, unité, référence, contrôle.
- Les lignes ⚠ portent une explication en langage courant.
- Le bouton d'enregistrement reste **désactivé** tant qu'une ligne ⚠ n'est pas traitée et affiche le nombre exact de
  valeurs qui seront enregistrées.

## 6.6 Activité & Pas

- Semaine : barres par jour, **nombre exact au-dessus de chaque barre** quand la largeur ≥ 46 px, sinon affiché à
  l'infobulle ; ligne d'objectif pointillée ; barres sauge si objectif atteint.
- Jour : 24 barres horaires ; Mois : 28–31 barres avec défilement horizontal sur mobile ; Année : moyennes mensuelles
  **explicitement libellées « moyenne/jour »**.
- État de la source affiché honnêtement : « Non connecté — nécessite l'app iOS BILANX ».

## 6.7 Mobile

- Barre inférieure : Accueil · Données · **＋** · Documents · Profil.
- Cartes empilées, chiffres clés en grand, détails au toucher.
- Feuille d'action rapide : Scanner · Repas · Injection · Événement · Résultat.
- Vérifié à 390 px de large : aucun défilement horizontal de page.
