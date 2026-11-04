# 05 — Parcours utilisateur

## P1 — Inscription et premier tableau de bord (≈ 3 minutes)

1. `/inscription` : e-mail + mot de passe (ou passkey). Vérification de l'e-mail par lien.
2. **Consentements** explicites et séparés (cases non pré-cochées) :
   - traitement de mes données de santé pour le service (obligatoire pour utiliser BILANX) ;
   - extraction automatique de documents par IA (facultatif — sinon saisie manuelle) ;
   - assistant IA (facultatif, V2).
3. Activation MFA proposée immédiatement, **obligatoire avant le premier import de document**.
4. « Pour qui utilisez-vous BILANX ? » → Moi / Un proche / Les deux.
5. « Que souhaitez-vous suivre ? » (choix multiples) : Analyses de sang · Diabète / glycémie · Insuline ·
   Traitements · Activité · Rendez-vous.
6. Tableau de bord généré avec uniquement les modules choisis, et des **états vides utiles** :
   « Aucune glycémie importée — Importer un export LibreView » (jamais de fausse donnée).

## P2 — Scanner un bilan sanguin (cœur du MVP)

1. Bouton « Scanner un document » (tableau de bord ou Documents).
2. Choix : Prendre en photo (multipage) / Importer un fichier (PDF, JPG, PNG, HEIC).
3. Aperçu des pages, réordonnancement, recadrage → « Envoyer ».
4. Écran d'attente avec étapes réelles (« Lecture du texte… », « Identification des analyses… »).
5. **Écran de validation** (voir maquette) :
   - à gauche le document, à droite la liste des valeurs détectées ;
   - un clic sur une valeur surligne sa zone dans le document ;
   - chaque ligne : analyse reconnue, valeur, unité, référence du labo, date de prélèvement, laboratoire ;
   - badges : ✅ confiance élevée · ⚠️ à vérifier (incohérence détectée, explication en clair) ;
   - actions par ligne : Confirmer · Corriger · Ignorer ; action globale « Tout confirmer » **désactivée** tant qu'une
     ligne ⚠️ n'a pas été traitée.
6. Confirmation → résultats ajoutés, toast « 4 résultats ajoutés à vos analyses ». Le document reste consultable,
   chaque valeur pointe vers lui.
7. Si un résultat sort des références du laboratoire : affichage factuel (« en dessous de l'intervalle de référence
   du laboratoire ») + invitation à en parler à son médecin. Pas d'interprétation diagnostique.

## P3 — Personne diabétique : consulter une journée passée

1. Glycémie → vue jour (aujourd'hui par défaut, ou dernière journée disponible avec mention explicite).
2. Flèche ← pour remonter d'un jour, ou calendrier (jours avec données marqués d'un point).
3. Courbe 24 h : bande cible verte, points au survol/toucher (heure + valeur), zoom par pincement.
4. Sous la courbe, piste d'événements : 🍽 repas, 💉 injections (barres sur axe séparé, en unités), 🚶 activité,
   📝 commentaires. Toucher une icône ouvre le détail.
5. Statistiques du jour : moyenne, min/max, temps dans la cible, % de données disponibles.
6. Ajout d'un commentaire a posteriori (« Repas de famille, dîner tardif »).

## P4 — Import LibreView

1. Glycémie → Sources → « Importer un export LibreView ».
2. Tutoriel illustré : se connecter à LibreView → Télécharger les données de glucose → fichier CSV.
3. Dépôt du fichier → contrôle du format → aperçu (période, nombre de mesures, types détectés : historique
   capteur, scans, capillaires).
4. Confirmation → import, dédoublonnage, recalcul des statistiques.
5. La source affiche : « Import de fichier LibreView — dernier import le 04/11/2026 à 21:12 — données jusqu'au 03/11 ».
   Jamais « synchronisé » ni « connecté ».

## P5 — Aidant qui gère un parent

1. Famille → « Ajouter un profil » → « Un proche ».
2. Deux cas :
   - **Le proche a son propre compte** : invitation e-mail ; le proche accepte et choisit les modules partagés.
   - **Le proche ne peut pas utiliser l'application** : l'aidant crée le profil en déclarant la base légale
     (accord de la personne recueilli, mesure de protection juridique, autorité parentale) — déclaration horodatée,
     consignée, et rappel des obligations.
3. Le sélecteur de profil en haut permet de basculer ; la couleur d'avatar et le nom restent visibles en permanence.
4. Le proche (ou le propriétaire) peut à tout moment voir le journal d'accès et **révoquer**.

## P6 — Préparer une consultation

1. Rapports → période (30 j) → sections cochées → Générer.
2. PDF : page de garde, sommaire, chaque section avec sources et dates, « données manquantes » listées,
   saisies manuelles marquées.
3. Télécharger, imprimer, ou « Partager avec un professionnel » : lien expirant (7 jours par défaut) + code à
   6 chiffres communiqué séparément ; consultations journalisées.

## P7 — Insuline au quotidien

1. Bouton ＋ → « Noter une injection » : insuline (liste personnelle), dose, heure (maintenant par défaut),
   effectuée / prévue, commentaire. 3 touches pour le cas courant.
2. Aucune suggestion de dose, aucun calcul. Les champs ne sont jamais pré-remplis à partir de la glycémie.
3. Statistiques : total du jour, moyenne 7/30/90 j, répartition rapide/lente.
