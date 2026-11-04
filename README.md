# BILANX

> **Toute votre santé, en un seul endroit.** — https://bilanx.fr

BILANX est une plateforme de suivi de santé personnel et familial : centralisation des bilans biologiques,
suivi glycémique (import LibreView), HbA1c de laboratoire, insuline et traitements, activité physique,
journal des repas, documents médicaux scannés avec extraction IA **validée par l'utilisateur**, rendez-vous
et rapports PDF pour la consultation.

> ⚠️ **Statut** : projet en phase de conception. Aucune fonctionnalité n'est validée réglementairement.
> BILANX n'est **pas** un outil de diagnostic ni de prescription. Aucune intégration externe
> (Abbott, Apple HealthKit, Health Connect, laboratoires) n'est active à ce jour.

## Démarrer

Prérequis : Node.js 22 et Docker (pour PostgreSQL en développement).

```bash
npm install
docker compose up -d
cp apps/web/.env.example apps/web/.env.local
```

Renseignez `BILANX_SECRET_KEY` dans `apps/web/.env.local` (valeur générée par `openssl rand -base64 32`), puis :

```bash
npm run db:migrate
npm run dev
```

L'application est sur http://localhost:3000. **Aucun e-mail n'est réellement envoyé en développement** : les liens de
confirmation et de réinitialisation s'affichent dans le terminal où tourne `npm run dev`.

Tests :

```bash
TEST_DATABASE_URL=postgres://bilanx:bilanx@localhost:5432/bilanx_test npm test
```

Sans `TEST_DATABASE_URL`, les tests d'intégration de l'authentification sont ignorés (les autres s'exécutent).

| Dossier | Contenu |
|---|---|
| `packages/domain` | Calculs de santé testés : unités, HbA1c % ↔ mmol/mol, statistiques glycémiques, jauge de référence, contrôles d'extraction IA, journées et changements d'heure |
| `packages/auth` | Comptes, vérification e-mail, sessions, double authentification TOTP + codes de secours, réinitialisation, limitation des tentatives, journal d'audit chaîné |
| `packages/db` | Client PostgreSQL et outil de migration |
| `apps/web` | Application Next.js — l'authentification est réelle ; les données de santé affichées restent **fictives** |
| `db/migrations/` | Migrations PostgreSQL versionnées (`npm run db:migrate`) |
| `design/maquettes.html` | Maquettes de référence |

## Dossier de conception

| # | Livrable | Fichier |
|---|----------|---------|
| 1 | Analyse complète du concept | [docs/01-analyse-concept.md](docs/01-analyse-concept.md) |
| 2 | Architecture technique détaillée | [docs/02-architecture-technique.md](docs/02-architecture-technique.md) |
| 3 | Structure de la base de données | [docs/03-base-de-donnees.md](docs/03-base-de-donnees.md) · [db/migrations/](db/migrations/) |
| 4 | Arborescence des pages | [docs/04-arborescence.md](docs/04-arborescence.md) |
| 5 | Parcours utilisateur | [docs/05-parcours-utilisateur.md](docs/05-parcours-utilisateur.md) |
| 6 | Maquettes UX/UI | [docs/06-maquettes-ux-ui.md](docs/06-maquettes-ux-ui.md) · [design/maquettes.html](design/maquettes.html) |
| 7 | Intégrations externes et faisabilité réelle | [docs/07-integrations-externes.md](docs/07-integrations-externes.md) |
| 8 | Plan de sécurité et de conformité | [docs/08-securite-conformite.md](docs/08-securite-conformite.md) |
| 9 | Feuille de route MVP / V2 / V3 | [docs/09-feuille-de-route.md](docs/09-feuille-de-route.md) |
| 10 | Estimation des coûts | [docs/10-estimation-couts.md](docs/10-estimation-couts.md) |
| 11 | Risques techniques, réglementaires, commerciaux | [docs/11-risques.md](docs/11-risques.md) |
| 12 | Prochaines étapes concrètes | [docs/12-prochaines-etapes.md](docs/12-prochaines-etapes.md) |
| — | Matrice de faisabilité par fonctionnalité | [docs/00-matrice-faisabilite.md](docs/00-matrice-faisabilite.md) |

Les maquettes s'ouvrent directement dans un navigateur (`design/maquettes.html`, aucune dépendance).
Toutes les données qui y figurent sont **fictives** et signalées comme telles.

## Légende de faisabilité utilisée dans tous les documents

| Code | Signification |
|------|---------------|
| 🟢 **IMM** | Immédiatement réalisable (web/PWA, sans tiers bloquant) |
| 🔵 **API** | Nécessite une API officielle ou un partenariat |
| 🟣 **NAT** | Nécessite une application native (iOS/Android) |
| 🟠 **REG** | Exige une analyse / validation réglementaire avant mise en production |
| ⚪ **REP** | À reporter (V2/V3) |
