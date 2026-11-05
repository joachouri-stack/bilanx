# Décision 0001 — Authentification intégrée à l'application Next.js

**Date** : 4 novembre 2026 · **Statut** : adoptée pour le MVP

## Contexte
L'architecture cible (doc 02) prévoit une API NestJS séparée. Pour le MVP, une seule équipe réduite livre le web.

## Décision
- La logique d'authentification vit dans `packages/auth`, **indépendante du framework** (fonctions pures + PostgreSQL),
  testée contre une vraie base. Next.js ne fait que l'appeler (Server Actions, cookies).
- Si une API séparée devient nécessaire (application iOS en V2), elle réutilisera `packages/auth` tel quel.

## Choix de sécurité
| Sujet | Choix |
|---|---|
| Mots de passe | Argon2id (m = 19 MiB, t = 2, p = 1), 12 caractères minimum, refus des mots de passe triviaux |
| Énumération des comptes | Réponses identiques (inscription, connexion, mot de passe oublié), hachage factice si compte inexistant |
| Vérification e-mail | Jeton 256 bits, stocké haché, 24 h, usage unique, consommé par un bouton (POST) et non à l'ouverture du lien |
| Sessions | Jeton aléatoire en cookie `__Host-`, HttpOnly, Secure, SameSite=Lax ; stocké haché ; 30 min d'inactivité, 12 h maximum ; 10 min pour terminer la MFA |
| MFA | **Obligatoire** avant tout accès aux données ; TOTP RFC 6238 (secret chiffré AES-256-GCM, anti-rejeu) ; 10 codes de secours hachés à usage unique |
| Fixation de session | Nouveau jeton après validation de la MFA |
| Force brute | 5 échecs / 15 min par adresse (connexion) et par compte (MFA) ; 3 demandes / h (réinitialisation, renvoi) |
| Réinitialisation | Jeton 60 min, usage unique, toutes les sessions fermées, MFA toujours exigée ensuite |
| Traçabilité | `login_event` visible par l'utilisateur ; `audit_log` chaîné par hachage, non modifiable |
| CSRF | Server Actions (contrôle d'origine Next.js) + SameSite=Lax |
| Changement de mot de passe | Mot de passe actuel exigé (5 essais / 15 min), autres sessions fermées, e-mail au titulaire (migration 0014 : 5 nov. 2026) |
| Changement d'adresse | Mot de passe exigé ; lien 24 h envoyé à la **nouvelle** adresse, ancienne active jusqu'à confirmation puis prévenue (nouvelle adresse masquée). Adresse déjà prise : même réponse, son titulaire est prévenu, aucun lien (pas de révélation de compte) |
| Codes de secours | Nombre restant affiché ; régénération sur mot de passe, anciens codes invalidés, e-mail au titulaire |

## Reste à faire avant ouverture publique
- Clé maîtresse dans le KMS de l'hébergeur HDS (aujourd'hui variable d'environnement).
- Passkeys (WebAuthn) ; reconfiguration de la double authentification (changement de téléphone) depuis les paramètres.
- Vérification des mots de passe contre les fuites connues (k-anonymat).
- Limitation par adresse IP au niveau du WAF.
- Test d'intrusion externe.

Faits depuis : envoi réel des e-mails (SMTP, décision 0007), rôle PostgreSQL applicatif (0007), consentements, export
et suppression du compte (0004), changement d'e-mail et de mot de passe, codes de secours (ci-dessus).
