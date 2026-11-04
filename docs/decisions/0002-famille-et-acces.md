# Décision 0002 — Famille, profils et autorisations par module

**Date** : 4 novembre 2026 · **Statut** : adoptée pour le MVP

## Modèle
- Un **compte** (identité de connexion) accède à un ou plusieurs **profils** (personnes dont on suit la santé).
- Chaque profil a **un seul gestionnaire** (`owner`, contrainte d'unicité en base).
- Les autres accès sont des **aidants** (`caregiver`) ou des **professionnels invités** (`guest_professional`,
  lecture seule, durée obligatoire ≤ 90 jours).
- Les autorisations sont définies **module par module** : glycémie, analyses, insuline, médicaments, journal,
  activité, documents, rendez-vous, rapports — chacun « aucun », « lecture » ou « lecture et saisie ».

## Règles
| Exigence | Mise en œuvre |
|---|---|
| Pas d'accès automatique d'un aidant | Profil d'un proche : base légale déclarée (accord de la personne, autorité parentale, mesure de protection) et attestation horodatée. Accès d'un tiers : invitation du gestionnaire **acceptée** par le destinataire connecté avec l'adresse invitée |
| Autorité parentale | Refusée si la date de naissance indique une personne majeure |
| Révocation | Immédiate (le choix de profil est revalidé à chaque requête) ; la personne concernée est prévenue par e-mail |
| Traçabilité | Chaque lecture/écriture de données, invitation, acceptation, modification ou retrait est inscrit au journal d'audit chaîné, consultable par le gestionnaire |
| E-mails | Aucune donnée de santé ; seulement le nom du profil et le nom de l'invitant |

## Défense en profondeur (PostgreSQL)
1. L'application vérifie le rôle et le module avant toute requête (`withProfileData`).
2. La **Row-Level Security** vérifie à nouveau, ligne par ligne : compte (`app.account_id`), module, lecture ou
   écriture, expiration et révocation. Un module non accordé est invisible ; en lecture seule, modification et
   suppression sont impossibles.
3. Pendant une opération, `app.profile_id` restreint la visibilité au **seul profil consulté**.

Ce troisième niveau a été ajouté après qu'un test visuel a montré un défaut : un gestionnaire de deux profils voyait
les résultats de son proche sur son propre tableau de bord (requête sans filtre par profil). Le défaut est corrigé
dans les requêtes **et** rendu impossible par la base ; un test le vérifie avec des requêtes volontairement sans filtre.

## Profil de démonstration
Chaque compte peut afficher « Claire », profil fictif généré (non stocké), clairement signalé. Les profils réels
affichent leurs vraies données ou des états vides explicites — jamais de valeur inventée.

## Reste à faire
- Transfert de la gestion d'un profil à la personne concernée (ex. enfant devenu majeur) ; rôle `self`.
- Inscription directe depuis un lien d'invitation en conservant le lien (aujourd'hui : rouvrir le lien après l'inscription).
- Rôle PostgreSQL applicatif distinct du propriétaire du schéma (les deux sont aujourd'hui confondus ; la RLS est forcée).
- Suppression d'un profil et export de ses données.
