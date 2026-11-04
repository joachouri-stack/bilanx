# 09 — Feuille de route MVP, V2, V3

Hypothèse d'équipe MVP : 1 lead full-stack, 1 développeur full-stack, 1 ingénieur data/IA (temps partiel),
1 designer UX/UI (temps partiel), DPO et expert réglementaire externes, médecin conseil (relecture des contenus).

## Phase 0 — Cadrage (semaines 1 à 4)

- Destination d'usage rédigée et relue par un expert MDR.
- Choix de l'hébergeur HDS (comparaison des attestations et périmètres), contrat.
- Choix du fournisseur IA (contrat art. 28, UE, zéro rétention, HDS).
- AIPD initiale, registre, désignation DPO.
- Design system + maquettes haute fidélité validées par 8–10 utilisateurs (diabétiques, aidants, bilans simples).
- Collecte de 30–50 **bilans de laboratoire anonymisés ou fictifs** de formats variés pour le jeu de test d'extraction.

## MVP (mois 2 à 6) — bêta fermée puis ouverture

| Sprint (2 sem.) | Livrables |
|---|---|
| 1 | Monorepo, CI/CD, infra HDS staging (Terraform), schéma de base, RLS, audit |
| 2 | Comptes : inscription, vérification e-mail, MFA (TOTP + passkeys), sessions, historique |
| 3 | Profils, famille, invitations, permissions, révocation, journal d'accès |
| 4 | Tableau de bord modulaire, onboarding, préférences d'unités |
| 5 | Documents : upload, chiffrement, visionneuse, antivirus |
| 6 | Pipeline OCR + extraction IA + contrôles d'incohérence |
| 7 | Écran de validation, création des résultats confirmés, catalogue d'analytes |
| 8 | Analyses : jauges capsule, historique, HbA1c (% / mmol/mol), contenus pédagogiques relus |
| 9 | Import LibreView, vue jour glycémie (navigation, zoom), statistiques |
| 10 | Vues 7–90 j, profil AGP, plages cibles, insuline (saisie + stats) |
| 11 | Journal repas/événements, vue combinée, rendez-vous simples |
| 12 | Rapports PDF, export/suppression RGPD, PWA (installable, hors ligne lecture seule limitée) |
| 13 | Durcissement : test d'intrusion, accessibilité (RGAA/WCAG AA), charge, restauration de sauvegarde |

**Critères de sortie MVP** : AIPD validée, pentest sans vulnérabilité critique/haute ouverte, précision d'extraction
mesurée sur le jeu de test (objectif : ≥ 95 % des valeurs correctes **avant** validation humaine, 0 valeur inventée),
taux de confirmation sans correction suivi, restauration testée.

## V2 (mois 7 à 12)

- Application **iOS compagnon** (SwiftUI) : HealthKit (pas, puis autres types), synchronisation en arrière-plan,
  notifications natives.
- Rappels médicaments et rendez-vous ; extraction d'ordonnances avec confirmation ; base BDPM.
- Partage médical sécurisé (lien + code, expiration, journal), rôle « professionnel invité ».
- **Assistant IA** (bêta, après avis réglementaire) : questions sur ses données, citations, résumés hebdomadaires.
- Synchronisation Abbott **seulement si** accord signé.
- Application Android (Health Connect) si la demande le justifie (sinon V3).

## V3 (année 2)

- Portail professionnel (Pro Santé Connect), consultation des patients ayant donné accès.
- Connecteurs laboratoires (HPRIM/FHIR), Dexcom, autres appareils.
- Mon Espace Santé (référencement ANS).
- Multilingue (anglais, espagnol, allemand), adaptation des unités et références par pays, conformité hors France.
- Fonctions familiales avancées (calendrier partagé, délégations fines, mineurs → majorité).
- Applications natives complètes si l'usage mobile le justifie.

## Ce qui est volontairement exclu de toutes les versions (sauf requalification complète en DM)

Calcul ou recommandation de dose d'insuline · prédiction glycémique utilisée pour une décision thérapeutique ·
diagnostic automatique · alertes médicales en temps réel présentées comme fiables · utilisation d'API non autorisées.
