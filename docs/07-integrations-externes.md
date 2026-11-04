# 07 — Intégrations externes et faisabilité réelle

> Règle : **aucune de ces intégrations n'a été testée ni n'est active à ce jour.** Les statuts ci-dessous décrivent
> la faisabilité connue au moment de la rédaction (novembre 2026) et doivent être revérifiés auprès de chaque
> fournisseur avant tout engagement.

| Intégration | Méthode | Faisabilité | Statut | Version |
|---|---|---|---|---|
| **LibreView – export CSV** | L'utilisateur télécharge ses données de glucose depuis LibreView et les importe | ✅ Réalisable sans tiers | 🟢 IMM | MVP |
| **Abbott – API partenaire** | Programme partenaire / accord commercial avec Abbott | ❓ Non publique ; dépend d'un accord | 🔵 API | V2+ si accord |
| **LibreLinkUp** | API non documentée utilisée par des projets open source | ❌ Non autorisée officiellement, fragile, risque contractuel et de sécurité (identifiants tiers) | Exclue | — |
| **Capteur Libre en NFC/Bluetooth direct** | Lecture directe du capteur | ❌ Protocole propriétaire, chiffré ; statut DM | Exclue | — |
| **Apple HealthKit (pas, Apple Watch)** | App iOS native avec autorisation HealthKit, requêtes statistiques, background delivery | ✅ Réalisable, **app native obligatoire** (aucun accès web/PWA) ; revue App Store (règles 5.1.3 sur données de santé) | 🟣 NAT | V2 |
| **Apple Santé – export manuel** | Fichier `export.zip` (XML) importé par l'utilisateur | ✅ Réalisable, fichiers volumineux | 🟢 IMM | V2 (option transitoire) |
| **Android Health Connect** | App Android native avec permissions Health Connect ; déclaration Google Play | ✅ Réalisable, **app native obligatoire** | 🟣 NAT | V2/V3 |
| **Dexcom** | API développeur officielle (OAuth) | ✅ Programme public existant, conditions à valider | 🔵 API | V3 |
| **Glucomètres capillaires** | Export fichiers ou HealthKit selon modèle | Variable | 🔵 / 🟣 | V3 |
| **OCR** | Moteur auto-hébergé (Tesseract/PaddleOCR) ou service cloud dans le périmètre HDS | ✅ Réalisable | 🟢 IMM | MVP |
| **LLM d'extraction / assistant** | API d'un fournisseur offrant hébergement UE, contrat de sous-traitance (art. 28), zéro rétention, pas d'entraînement ; périmètre HDS à vérifier (ex. modèles via un cloud certifié HDS en région France, ou fournisseur européen) | ✅ Techniquement prêt ; **contractuel/HDS à valider** | 🟢 🟠 | MVP (extraction) / V2 (assistant) |
| **Base de données publique des médicaments (BDPM)** | Fichiers publics téléchargeables (ANSM) | ✅ Données ouvertes | 🟢 IMM | V2 |
| **Codes LOINC (biologie)** | Table de correspondance (licence LOINC gratuite) | ✅ | 🟢 IMM | MVP |
| **Mon Espace Santé / DMP** | Référencement ANS, DMP compatible, INS | 🔵 Processus long, exigences Ségur | 🔵 🟠 | V3 |
| **Laboratoires (comptes rendus structurés)** | Partenariats, formats HPRIM Santé / HL7 FHIR | 🔵 Négociation par réseau de laboratoires | 🔵 | V3 |
| **Pro Santé Connect** | Authentification des professionnels (e-CPS) | 🔵 Raccordement ANS | 🔵 | V3 |
| **MSSanté** | Messagerie sécurisée de santé | 🔵 Opérateur MSSanté requis | 🔵 | V3 |
| **E-mails transactionnels** | Prestataire UE ; **aucune donnée de santé dans les e-mails** | ✅ | 🟢 IMM | MVP |
| **Paiement** | Stripe / prestataire UE ; aucune donnée de santé transmise | ✅ | 🟢 IMM | MVP |
| **Notifications push** | Web Push (iOS ≥ 16.4 si PWA ajoutée à l'écran d'accueil) ; APNs/FCM en natif ; contenu générique | ✅ avec limites iOS | 🟢 / 🟣 | V2 |

## Détails importants

### LibreView (MVP)
- Format CSV à analyser sur un **vrai export** fourni par un utilisateur test consentant (ou export de démonstration),
  puis figé dans des tests de non-régression. Abbott peut modifier ce format : le parseur doit détecter les en-têtes,
  le séparateur, le format de date et la langue, et refuser proprement un fichier inconnu.
- Types de lignes à distinguer : historique capteur (≈ 15 min), scans, glycémies capillaires (bandelettes),
  cétones, notes. Seules les mesures capteur alimentent les statistiques capteur.
- Afficher : « Import de fichier » + date du dernier import + date de la dernière mesure. Jamais « synchronisé ».

### Abbott (V2+)
- Démarche : contact business development Abbott Diabetes Care France / programme partenaires, présentation du
  dossier sécurité (HDS, RGPD), du statut réglementaire et du cas d'usage. Délai et issue incertains.
- Tant qu'aucun accord écrit n'existe, la fonctionnalité « synchronisation automatique » n'est pas affichée
  (ou affichée « bientôt disponible » sans promesse de date).

### HealthKit (V2)
- Utiliser `HKStatisticsCollectionQuery` (somme cumulée, intervalles horaires) : HealthKit fusionne les sources
  iPhone/Watch selon la priorité définie par l'utilisateur → **pas de doublons**.
- `HKObserverQuery` + `enableBackgroundDelivery` : les mises à jour arrivent quand iOS le permet (appareil
  déverrouillé, batterie…) → afficher « dernière synchronisation » et ne jamais promettre le temps réel.
- Données lues uniquement (pas d'écriture au MVP mobile). Justification de l'usage dans la fiche App Store.
