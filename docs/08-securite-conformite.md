# 08 — Plan de sécurité et de conformité

> Ce plan est un document de cadrage technique. Il **ne remplace pas** l'avis d'un DPO, d'un avocat spécialisé en
> droit de la santé ni d'un consultant en affaires réglementaires dispositifs médicaux, qui doivent être consultés
> avant l'ouverture au public.

## 8.1 Cadre applicable (France / UE)

| Texte | Impact pour BILANX |
|---|---|
| **RGPD** — art. 9 (données de santé) | Base légale : **consentement explicite** de la personne concernée (art. 9.2.a) ; information claire ; droits d'accès, rectification, effacement, portabilité, retrait du consentement |
| RGPD art. 35 — **AIPD** | Obligatoire : traitement à grande échelle de données sensibles + évaluation par IA. À réaliser avant la mise en production (outil PIA de la CNIL) |
| RGPD art. 28 | Contrats de sous-traitance avec hébergeur, fournisseur IA, e-mails, support |
| RGPD art. 30 / 33–34 | Registre des traitements ; notification de violation à la CNIL sous 72 h et aux personnes si risque élevé |
| **Code de la santé publique L.1111-8** — HDS | Hébergeur certifié HDS (référentiel v2) pour toute la chaîne qui stocke les données de santé, y compris sauvegardes |
| Loi Informatique et Libertés | Dispositions nationales sur les données de santé ; mineurs (consentement < 15 ans avec titulaire de l'autorité parentale) |
| **Règlement (UE) 2017/745 (MDR)** | Qualification du logiciel : voir 8.3 |
| **AI Act (UE) 2024/1689** | Si une fonction IA est un dispositif médical soumis à un organisme notifié → système d'IA à haut risque (obligations applicables à partir d'août 2027). Obligations de transparence pour l'assistant conversationnel (indiquer qu'il s'agit d'une IA) |
| Référentiels ANS (PGSSI-S) | Bonnes pratiques d'authentification et de sécurité des SI de santé |
| Directive NIS2 | À évaluer selon la taille et le secteur (probablement hors champ au démarrage) |

## 8.2 Mesures de sécurité

**Identité et accès**
- Mot de passe argon2id, vérification de fuite (k-anonymity), passkeys WebAuthn, TOTP ; **MFA obligatoire** avant
  l'accès aux documents et aux données partagées.
- Sessions courtes (glissantes 30 min d'inactivité côté données sensibles), révocables depuis « Sessions actives ».
- Ré-authentification pour les actions sensibles : export, suppression, partage, ajout d'aidant.
- Autorisations : rôle + permissions par module ; **RLS PostgreSQL** comme seconde barrière ; tests automatisés de la
  matrice d'autorisation à chaque build.

**Chiffrement**
- TLS 1.2+ (1.3 privilégié), HSTS preload, pas de contenu mixte.
- Disques et sauvegardes chiffrés (hébergeur) + **chiffrement applicatif par enveloppe** des documents : une clé par
  document, chiffrée par une clé maître dans un KMS/HSM ; rotation annuelle des clés maîtres.
- Champs particulièrement sensibles (secrets MFA, notes libres) chiffrés au niveau applicatif.

**Traçabilité**
- `audit_log` en ajout seul avec chaînage de hachage ; export régulier vers un stockage immuable (WORM).
- Journal d'accès visible par l'utilisateur pour chaque profil (qui a consulté quoi, quand).
- Les journaux techniques **ne contiennent aucune donnée de santé** (identifiants opaques uniquement).

**Application**
- OWASP ASVS niveau 2 comme référentiel ; CSP stricte, cookies `Secure; HttpOnly; SameSite=Lax`, protection CSRF.
- Uploads : vérification du type réel, taille max, antivirus, traitement dans un worker isolé, aucune exécution.
- URL signées courtes (≤ 5 min) pour les documents ; pas de CDN public sur les données de santé.
- Dépendances : SCA, Dependabot/Renovate ; SAST ; scan de secrets ; images conteneur minimales signées.
- Test d'intrusion externe avant l'ouverture publique, puis annuel ; programme de divulgation responsable.

**Continuité**
- Sauvegardes quotidiennes chiffrées, rétention 35 jours, copie dans une seconde zone HDS ; **test de restauration
  trimestriel** documenté. Objectifs : RPO ≤ 24 h, RTO ≤ 8 h (MVP).
- Plan de réponse aux incidents : détection, qualification, confinement, notification CNIL (72 h), communication
  utilisateurs, post-mortem.

**IA**
- Fournisseur : contrat art. 28, hébergement UE, **pas de rétention ni d'entraînement**, périmètre HDS vérifié.
- Minimisation : on envoie le document à extraire, pas le dossier entier ; pour l'assistant, uniquement les données
  nécessaires à la question.
- Garde-fous : extraction en JSON contraint + vérification littérale dans l'OCR ; assistant avec instructions système
  interdisant diagnostic/prescription/dosage, filtre de sortie, détection des situations d'urgence → message
  « Appelez le 15 (SAMU) ou le 112 » ; journal des réponses pour audit qualité (avec consentement).
- Aucune utilisation des données pour entraîner un modèle sans base légale et autorisation spécifique.

## 8.3 Qualification réglementaire (MDR) — analyse préliminaire

Le MDR qualifie de dispositif médical un logiciel destiné par son fabricant à des fins médicales (diagnostic,
prévention, surveillance, prédiction, pronostic, traitement…). La règle 11 classe la plupart des logiciels DM en
classe IIa ou supérieure. Le guide **MDCG 2019-11** précise qu'un logiciel qui se limite au stockage, à l'archivage,
à la communication ou à la simple recherche n'est pas un DM.

| Fonctionnalité | Analyse préliminaire | Décision produit |
|---|---|---|
| Stockage, affichage, graphiques des données, statistiques descriptives (moyenne, % dans la plage définie par l'utilisateur/son médecin) | Probablement hors DM si présenté comme un journal/outil de visualisation sans finalité médicale revendiquée | MVP, avec formulation prudente |
| Comparaison d'une valeur à l'intervalle de référence **imprimé par le laboratoire** | Reprise d'une information existante ; zone grise faible | MVP, libellés factuels |
| Extraction OCR/IA avec validation humaine | Fonction de saisie assistée ; à documenter | MVP |
| Résumés IA, « résultats à discuter avec mon médecin » | Zone grise : peut être vu comme une aide à la décision | V2 bêta **après** avis réglementaire |
| Alertes hypo/hyperglycémie en temps réel | Probablement DM (surveillance) | Non prévu |
| Calcul / suggestion de dose d'insuline, prédiction glycémique | **DM classe IIb minimum** | **Exclu** |
| Interprétation diagnostique (« vous avez une carence ») | DM | **Exclu** |

Actions : rédiger la **destination d'usage** (intended purpose) avant le MVP, la faire relire par un expert MDR,
l'aligner avec tous les textes (site, App Store, CGU, marketing). Toute évolution fonctionnelle passe par une revue
réglementaire (« regulatory gate » dans le processus de livraison).

## 8.4 Gouvernance RGPD

- Désignation d'un **DPO** (obligatoire : traitement à grande échelle de données de santé).
- Registre des traitements, AIPD, politique de conservation, politique de cookies (pas de traceurs publicitaires
  dans l'application ; mesure d'audience exemptée de consentement ou auto-hébergée).
- Consentements granulaires et versionnés (table `consent`), retrait aussi simple que le don.
- **Aidants** : accès uniquement par invitation acceptée par la personne concernée, ou base légale déclarée
  (autorité parentale, mesure de protection juridique) ; la personne majeure capable peut toujours révoquer.
- Droits : export complet (JSON + CSV + PDF + documents originaux) en libre-service ; suppression en libre-service
  avec délai de grâce de 7 jours puis purge.
- Sécurité des partages professionnels : liens expirants, code séparé, journalisation, révocation.

## 8.5 Mentions obligatoires dans l'interface

- « BILANX ne remplace pas l'avis d'un professionnel de santé et ne permet pas de poser un diagnostic. »
- « En cas d'urgence, appelez le 15 (SAMU) ou le 112. »
- Pour l'IA : « Réponse générée par une IA à partir de vos données enregistrées ; elle peut contenir des erreurs. »
- Bandeau « données fictives » sur tout environnement de démonstration.
