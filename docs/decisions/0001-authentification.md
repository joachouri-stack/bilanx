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

## Reste à faire avant ouverture publique
- Prestataire d'envoi d'e-mails (UE) — aujourd'hui les e-mails sont affichés dans la console.
- Clé maîtresse dans le KMS de l'hébergeur HDS (aujourd'hui variable d'environnement).
- Passkeys (WebAuthn), changement d'e-mail / mot de passe, reconfiguration de la MFA, gestion des consentements,
  export et suppression du compte.
- Vérification des mots de passe contre les fuites connues (k-anonymat).
- Limitation par adresse IP au niveau du WAF ; rôle PostgreSQL applicatif distinct du propriétaire du schéma.
- Test d'intrusion externe.
