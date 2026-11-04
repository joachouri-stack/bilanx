# Décision 0003 — Scanner de bilans : lecture sur nos serveurs, validation humaine obligatoire

**Date** : 4 novembre 2026 · **Statut** : adoptée pour le MVP

## Chaîne de traitement
1. **Dépôt** : PDF, JPEG, PNG ou WebP (type vérifié sur les octets, pas sur le nom), 10 Mo par fichier, 25 Mo et
   10 pages par document. HEIC refusé avec une explication (conversion à venir). Un PDF est déposé seul ; plusieurs
   photos forment les pages d'un même document.
2. **Stockage chiffré** : une clé aléatoire par document (AES-256-GCM), elle-même chiffrée par la clé maîtresse ;
   empreinte SHA-256 vérifiée à chaque lecture. Originaux en base pour le MVP (stockage objet HDS ensuite).
   Row-Level Security du module « Documents ».
3. **Lecture du texte, sans service externe** :
   - PDF numérique : couche texte (pdfjs) ;
   - photo : reconnaissance de caractères Tesseract en français, données de langue embarquées dans l'image Docker.
   - PDF scanné sans texte : signalé (pas encore lu).
4. **Détection des résultats** : règles déterministes (`packages/domain/src/report-parser.ts`) — libellé reconnu dans
   le catalogue, premier nombre de la ligne (les antériorités sont ignorées), unité, intervalle de référence, date de
   prélèvement, laboratoire. **Pas d'IA générative à ce stade** : rien n'est inventé ni « complété ».
5. **Contrôles** (`assessDraft`) : valeur présente littéralement dans le texte, plausibilité physiologique, unité
   compatible, référence cohérente, date non future ; pour les photos, confiance de lecture faible et unité corrigée
   (« Hmol/L » → « µmol/L ») signalées.
6. **Validation humaine** : chaque ligne doit être confirmée (éventuellement corrigée) ou ignorée ; enregistrement
   tout ou rien ; une valeur invalide est refusée même si l'utilisateur la confirme. Seules les lignes confirmées
   deviennent des résultats, marqués « bilan » et reliés au document et à la ligne lue.

## Constat qui justifie la validation
Sur la photo du bilan de test, la reconnaissance de caractères a lu l'HbA1c « 7,2 % » comme « **2 %** ». Le contrôle
de plausibilité la bloque ; l'utilisateur corrige à 7,2 en comparant avec l'original affiché à côté.

## Consentement
La lecture automatique n'a lieu que si le compte a donné le consentement « extraction automatique » (à l'inscription
ou depuis le document). Sans lui, le document est conservé et la saisie reste manuelle.

## Droits
Déposer : « saisie » sur Documents. Valider : « saisie » sur Documents **et** Analyses (vérifié par l'application puis
par la Row-Level Security). Un aidant en lecture voit les documents sans pouvoir valider.

## Reste à faire
- Surlignage de la zone lue sur l'image ; PDF scannés ; HEIC ; ordonnances et comptes rendus.
- Analyse antivirus des fichiers déposés ; stockage objet HDS.
- Évaluer un modèle d'IA (hébergé conformément aux exigences HDS) sur un jeu de bilans réels anonymisés, en comparant
  avec la méthode par règles : précision, valeurs inventées, coût.
- Lecture en tâche de fond pour les documents de nombreuses pages.
