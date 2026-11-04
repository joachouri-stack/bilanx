# 12 — Prochaines étapes concrètes

## Les 30 prochains jours

### Produit et validation
1. **Valider les maquettes** (`design/maquettes.html`) avec 8–10 personnes : 3 diabétiques sous capteur, 2 aidants,
   3 « bilans annuels / carences ». Mesurer : compréhension de la jauge capsule, de la vue jour, de la validation.
2. **Rédiger la destination d'usage** (1 page) et la faire relire par un consultant MDR.
3. Arrêter le périmètre MVP définitif à partir de la matrice `docs/00-matrice-faisabilite.md`.

### Conformité
4. Désigner un DPO (externalisé), lancer l'AIPD et le registre.
5. Demander les **attestations HDS** et périmètres à 3 hébergeurs (ex. Scaleway, OVHcloud, Clever Cloud) ; comparer
   PostgreSQL managé, object storage, KMS, sauvegardes, support, réversibilité.
6. Interroger 2–3 fournisseurs IA sur : hébergement UE/France, HDS, zéro rétention, non-entraînement, contrat art. 28.
7. Déposer la marque BILANX (INPI, classes 9, 42, 44) si ce n'est pas fait ; vérifier l'antériorité.

### Technique
8. Initialiser le monorepo :
   ```
   apps/web        Next.js + Tailwind + Radix
   apps/api        NestJS + Prisma/Drizzle
   services/extract Python (OCR + extraction)
   packages/ui     design system (jetons de docs/06)
   packages/domain calculs santé testés (TIR, CV, GMI, conversions)
   db/migrations/  migrations SQL versionnées
   infra/          Terraform
   ```
9. Écrire en premier `packages/domain` avec tests unitaires (conversions d'unités, HbA1c % ↔ mmol/mol,
   statistiques glycémiques) — c'est la partie la plus critique pour la justesse des données.
10. Construire le **jeu de test d'extraction** (bilans fictifs ou anonymisés avec vérité terrain) et un banc d'essai
    qui mesure précision, rappel et valeurs inventées pour chaque modèle candidat.
11. Obtenir un **export LibreView réel** (utilisateur test consentant) pour écrire le parseur à partir du format
    effectif — ne pas deviner le format.
12. Mettre en place CI (lint, types, tests, SAST, secrets) et l'environnement staging sur l'hébergeur retenu.

## Décisions à prendre par le porteur de projet

| Décision | Options | Recommandation |
|---|---|---|
| Hébergeur HDS | FR souverain / hyperscaler région France | FR souverain si périmètre HDS couvre PostgreSQL managé + object storage |
| Fournisseur IA | Européen / grand fournisseur via cloud HDS | Celui qui fournit un contrat clair HDS + zéro rétention, choisi sur le banc d'essai |
| Auth | Maison / SaaS | Maison (bibliothèques éprouvées) pour rester dans le périmètre HDS |
| Mobile V2 | Swift natif / React Native | Swift natif pour iOS (HealthKit), réévaluer Android |
| Modèle économique | Freemium / payant | Freemium + Famille |

## Ce dépôt contient déjà

- Le dossier de conception complet (`docs/`).
- Un schéma PostgreSQL exécutable avec isolation par profil (RLS) et journal d'audit immuable (`db/migrations/`).
- Des maquettes interactives de référence (`design/maquettes.html`).

Prochaine étape de code proposée : initialisation du monorepo + `packages/domain` (calculs testés) + authentification.
