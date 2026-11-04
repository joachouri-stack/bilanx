# 02 — Architecture technique détaillée

## 2.1 Vue d'ensemble

```
                         ┌─────────────────────────────────────────────┐
  Navigateur / PWA ─────▶│  Edge : WAF + CDN (statique uniquement)      │
  App iOS (V2) ─────────▶│  TLS 1.2+/1.3, HSTS, rate limiting           │
  App Android (V3) ─────▶└───────────────┬─────────────────────────────┘
                                         │  (aucune donnée de santé en cache CDN)
                        ┌────────────────▼─────────────────┐
                        │  Web : Next.js (App Router, SSR)  │   ← zone hébergeur certifié HDS
                        │  TypeScript, Tailwind, Radix UI   │
                        └────────────────┬─────────────────┘
                                         │ HTTPS interne (mTLS)
                        ┌────────────────▼─────────────────┐
                        │  API : NestJS (TypeScript)        │
                        │  REST + OpenAPI, Zod/class-valid. │
                        │  AuthN/AuthZ, audit, consentements│
                        └──┬──────────┬──────────┬─────────┘
                           │          │          │
              ┌────────────▼──┐  ┌────▼─────┐ ┌──▼──────────────────────┐
              │ PostgreSQL 16 │  │  Redis   │ │ Object storage (S3-comp.)│
              │ + RLS, pgcrypto│  │ sessions │ │ chiffrement SSE + clé    │
              │ chiffré disque │  │ files    │ │ par document (enveloppe) │
              └───────────────┘  └────┬─────┘ └──────────────────────────┘
                                      │ files de tâches (BullMQ)
                        ┌─────────────▼──────────────────────┐
                        │ Workers                             │
                        │  • ingestion LibreView CSV          │
                        │  • OCR + extraction IA (documents)  │
                        │  • génération PDF (rapports)        │
                        │  • notifications / rappels          │
                        │  • purge / rétention RGPD           │
                        └─────────────┬──────────────────────┘
                                      │
                        ┌─────────────▼──────────────────────┐
                        │ Fournisseur IA (contrat sous-trait.)│
                        │ hébergement UE / HDS, zéro rétention│
                        │ pas d'entraînement sur les données  │
                        └────────────────────────────────────┘
  KMS / HSM (clés maîtres) · Sauvegardes chiffrées hors site HDS · SIEM / journaux immuables
```

## 2.2 Choix technologiques et justification

| Couche | Choix recommandé | Alternatives évaluées | Justification |
|---|---|---|---|
| Frontend | **Next.js 15 + React + TypeScript** | Remix, SvelteKit | Écosystème, SSR, PWA, recrutement facile en France |
| UI | **Tailwind CSS + Radix UI / shadcn/ui** | MUI, Chakra | Composants accessibles (ARIA), design premium sur mesure |
| Graphiques | **ECharts** (glycémie : zoom, pan, 10 000+ points) + **visx/SVG** pour jauges sur mesure | Recharts, Chart.js | Recharts peu performant au-delà de quelques milliers de points ; ECharts gère dataZoom nativement |
| Backend | **NestJS (Node/TypeScript)** | FastAPI (Python), Django | Un seul langage front/back, modules, guards d'autorisation, OpenAPI |
| Workers IA/OCR | **Python** (service séparé) | Node | Meilleures bibliothèques OCR/PDF (pdfplumber, PyMuPDF, Pillow-HEIF) |
| ORM / migrations | **Prisma** ou **Drizzle** + SQL brut pour RLS | TypeORM | Typage strict, migrations versionnées |
| Base | **PostgreSQL 16** (+ TimescaleDB optionnel pour la glycémie) | MongoDB | Données relationnelles + séries temporelles + RLS |
| Files | **Redis + BullMQ** | RabbitMQ | Simple, suffisant au MVP |
| Stockage | **Object storage S3-compatible HDS** | — | Documents originaux chiffrés, URL signées courtes |
| PDF | **Playwright (Chromium headless) côté serveur** | react-pdf | Rendu fidèle des graphiques, mise en page HTML/CSS |
| Auth | **Implémentation dédiée** (Lucia-like / Auth.js) + WebAuthn + TOTP | Auth0, Clerk | Les SaaS d'auth US posent question pour un service HDS ; garder l'identité dans le périmètre HDS |
| Mobile V2 | **Swift (SwiftUI) natif** pour HealthKit ; **Kotlin** pour Health Connect | React Native, Expo | HealthKit background delivery fiable en natif ; RN possible mais module natif nécessaire de toute façon |
| Infra | **Kubernetes managé ou PaaS HDS** + Terraform | — | Reproductibilité, audit |
| Observabilité | OpenTelemetry, logs **sans donnée de santé** | — | Minimisation |

## 2.3 Hébergement (France, HDS)

L'hébergement de données de santé pour le compte de tiers impose un hébergeur **certifié HDS** (art. L.1111-8 CSP,
référentiel HDS v2 applicable depuis 2024). Candidats à comparer sur périmètre exact de certification, localisation UE,
réversibilité et support :

- **Scaleway** (FR), **OVHcloud** (FR), **Clever Cloud** (FR, PaaS), **Outscale** (FR, SecNumCloud),
- **AWS / Azure / Google Cloud** (régions France, certifiés HDS — à mettre en balance avec l'exposition au droit
  extraterritorial américain, point de vigilance CNIL).

> ⚠️ Le certificat HDS couvre des **services précis**. Il faut vérifier que **chaque** service utilisé (base managée,
> object storage, sauvegardes, IA, e-mails transactionnels contenant des données) est dans le périmètre. Les e-mails ne
> doivent contenir **aucune donnée de santé** (« Un nouveau document est disponible »).

Recommandation de départ : **hébergeur français certifié HDS, régions France, avec PostgreSQL managé et object
storage dans le périmètre HDS**. Le choix final se fait après revue des attestations (doc 12).

## 2.4 Modèle d'autorisation

- **Compte** (`account`) = identité de connexion.
- **Profil** (`profile`) = personne dont on suit la santé. Toutes les données de santé portent un `profile_id`.
- **Accès** (`profile_access`) = lien compte ↔ profil avec rôle : `owner`, `self`, `caregiver`, `guest_professional`,
  et des **permissions par module** (ex. un aidant voit les RDV et traitements mais pas les documents).
- Contrôle à deux niveaux :
  1. Guard applicatif NestJS (`@RequireProfileAccess('glucose:read')`).
  2. **Row-Level Security PostgreSQL** : la session SQL porte `app.account_id` ; les politiques filtrent par
     `profile_access`. Une erreur applicative ne peut pas exposer les données d'un autre profil.
- Chaque lecture/écriture de donnée de santé produit une entrée dans `audit_log` (append-only).

## 2.5 Pipeline « Scanner un document »

```
Upload (PDF/JPG/PNG/HEIC, multipage)
  → antivirus (ClamAV) + validation type MIME réel + taille
  → chiffrement + stockage original (immuable, hash SHA-256)
  → normalisation (HEIC→PNG, redressement, PDF→images si scanné)
  → extraction texte : couche texte PDF si présente, sinon OCR
  → classification du type (bilan, ordonnance, CR, courrier, autre)
  → extraction structurée par LLM (JSON strict, schéma imposé) :
       pour chaque ligne : libellé brut, valeur brute, unité brute, référence brute,
       page, boîte englobante, score de confiance
  → normalisation : correspondance au catalogue (synonymes, codes LOINC), conversion d'unités
  → contrôles d'incohérence (déterministes, pas IA) :
       valeur hors plage physiologique plausible, unité incompatible, date future,
       doublon avec résultat existant, référence min > max, décimales ambiguës (7,2 vs 72)
  → statut "à valider" → écran de validation utilisateur (valeur ↔ zone surlignée du document)
  → l'utilisateur confirme / corrige / rejette chaque ligne
  → seules les lignes confirmées deviennent des lab_result (source = document + page + bbox)
```

Règles :
- Le LLM ne reçoit **que** le document et le schéma ; on lui demande `null` quand une information est absente
  (pas d'inférence). Toute valeur extraite doit pouvoir être retrouvée littéralement dans le texte OCR — sinon elle est
  rejetée automatiquement (**contrôle anti-hallucination**).
- Aucune donnée n'est utilisée pour entraîner un modèle (contrat + paramètre « zero data retention »).

## 2.6 Glycémie : stockage et rendu

- Table `glucose_reading` partitionnée par mois (ou hypertable TimescaleDB). Un capteur ≈ 96 mesures/jour
  (15 min) ≈ 35 000/an/profil : volumétrie modeste.
- Agrégats précalculés (`glucose_daily_stats`) pour les vues 30/90 j.
- Côté client : la vue 24 h charge les points bruts ; 90 j charge des percentiles horaires (profil AGP).
- Unités : stockage canonique en **mg/dL** (entier ou décimal), conversion à l'affichage (÷ 18,016 pour mmol/L).

## 2.7 Synchronisations futures (V2)

```
Apple Watch → HealthKit (iPhone) → App iOS BILANX (HKObserverQuery + background delivery,
  HKStatisticsCollectionQuery pour dédoublonner iPhone/Watch) → POST /v1/sync/healthkit (token appareil)
  → table activity_daily / activity_hourly avec source_device et last_sync_at
```
HealthKit fournit déjà des statistiques dédupliquées entre sources lorsqu'on utilise les requêtes de statistiques
(cumulative sum) : c'est la méthode à utiliser pour éviter les doublons iPhone/Watch.

## 2.8 Environnements et qualité

- `dev` (données fictives uniquement), `staging` (données fictives, même infra que prod), `prod` (HDS).
- **Aucune donnée réelle hors production**. Générateur de données fictives marqué `is_demo = true`.
- CI : lint, typecheck, tests unitaires, tests d'autorisation (matrice rôles × endpoints), tests E2E Playwright,
  analyse SAST/dépendances, scan de secrets.
- Tests dédiés aux calculs (TIR, CV, GMI, conversions HbA1c) avec jeux de référence.
