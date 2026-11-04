# Décision 0004 — Droits RGPD : export, consentements, suppression

**Date** : 5 novembre 2026 · **Statut** : adoptée pour le MVP

| Droit | Mise en œuvre |
|---|---|
| Accès et portabilité (art. 15, 20) | Paramètres › Mes données : archive ZIP produite à la demande, non conservée. `compte.json` (compte, consentements, connexions, profils partagés) et un dossier par profil géré : CSV (séparateur point-virgule, UTF-8 avec BOM) pour analyses, glycémie, insuline, modifications prescrites, journal, rendez-vous, valeurs lues dans les documents, journal d'accès ; documents originaux déchiffrés. Aucun secret (empreintes de mot de passe, clés MFA) n'est exporté. Un aidant n'exporte pas les données d'un profil qu'il ne gère pas. |
| Retrait du consentement (art. 7) | Lecture automatique des documents : retrait et nouveau don en un clic ; les documents restent, la lecture s'arrête. Le consentement au traitement des données de santé se retire en supprimant le compte. |
| Effacement (art. 17) — profil d'un proche | Confirmation par le nom exact du profil ; invisible immédiatement, accès accordés clos et personnes prévenues ; effacement définitif (en cascade) après 30 jours. |
| Effacement — compte | Mot de passe + saisie de « SUPPRIMER » ; délai de grâce de 7 jours avec bandeau et annulation possible ; puis effacement des profils gérés (y compris ceux déjà supprimés et en attente) et **anonymisation** du compte : adresse remplacée, mot de passe, MFA, codes de secours, sessions, jetons et historique de connexion effacés. Le compte n'est pas supprimé physiquement car d'autres profils peuvent conserver des saisies qu'il a faites en tant qu'aidant. |

## Exécution de l'effacement
Tâche de fond du serveur (`apps/web/src/instrumentation.ts`) : 1 minute après le démarrage, puis toutes les 6 heures.
Testée dans le conteneur Docker. Les suppressions en cascade sont effectuées par les contraintes de clés étrangères, qui
s'appliquent malgré la Row-Level Security (vérifié par les tests).

## Conservé
Le journal d'audit (identifiants techniques et actions, aucune valeur de santé), pour la durée fixée par la politique de
conservation (à arrêter avec le DPO). Les sauvegardes expirent selon leur propre cycle (à documenter avec l'hébergeur).

## Reste à faire
- Durée de conservation du journal d'audit et purge correspondante.
- Comptes inactifs (alerte puis suppression) selon la politique de conservation.
- Rectification : possible aujourd'hui en supprimant puis ressaisissant une valeur ; modification directe à prévoir.
